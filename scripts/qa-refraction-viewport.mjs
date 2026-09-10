import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

// Isolated Chrome regression for nested planar reflection inside Three's native
// transmission pass. Inspect actual GL state, not logical canvas coordinates.
const project = fileURLToPath(new URL('..', import.meta.url));
const reportPath = path.join(project, 'output', 'optical', 'viewport-report.json');
const report = { url: process.env.ROCK_LAB_URL || 'http://127.0.0.1:5207/', cases: [], errors: [] };
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 942, height: 1204 }, deviceScaleFactor: 1 });
page.setDefaultTimeout(60000);
page.on('pageerror', error => report.errors.push(error.message));
page.on('console', message => { if (message.type() === 'error') report.errors.push(message.text()); });

try {
  await page.goto(report.url);
  await page.waitForFunction(() => window.rockLab?.ready);
  await page.evaluate(async () => {
    const lab = window.rockLab;
    lab.renderer.setAnimationLoop(null);
    const recipe = lab.recipe();
    await lab.loadRecipe({ ...recipe, options: { ...recipe.options, shape: 'sphere', surface: 'glass', ground: 'wood', reflection: .35, groundWetness: .25 } });
    window.advanceTime(0);
  });
  for (const dpr of [1, 1.75]) {
    for (const transmissionScale of [.5, .75, 1]) {
      const result = await page.evaluate(async ({ dpr, transmissionScale }) => {
        const THREE = await import('/node_modules/three/build/three.module.js');
        const lab = window.rockLab, renderer = lab.renderer, gl = renderer.getContext();
        renderer.setPixelRatio(dpr);
        renderer.transmissionResolutionScale = transmissionScale;
        const floor = lab.ground.group.children[0], originalHook = floor.onBeforeRender;
        const records = [];
        const snapshot = () => ({ viewport: Array.from(gl.getParameter(gl.VIEWPORT)), scissor: Array.from(gl.getParameter(gl.SCISSOR_BOX)), scissorTest: gl.isEnabled(gl.SCISSOR_TEST) });
        floor.onBeforeRender = function (r, scene, camera) {
          const target = r.getRenderTarget(), before = snapshot();
          originalHook.call(this, r, scene, camera);
          records.push({ target: target ? [target.width, target.height] : null, before, after: snapshot() });
        };
        renderer.render(lab.scene, lab.camera);
        floor.onBeforeRender = originalHook;

        // A non-default physical scissor catches the equally important target
        // scissor restoration regression independently of transmission defaults.
        const target = new THREE.WebGLRenderTarget(256, 192);
        target.viewport.set(7, 9, 220, 160);
        target.scissor.set(11, 13, 170, 130);
        target.scissorTest = true;
        renderer.setRenderTarget(target);
        const targetBefore = snapshot();
        originalHook(renderer, lab.scene, lab.camera);
        const targetAfter = snapshot();
        renderer.setRenderTarget(null);
        target.dispose();

        // Non-default logical canvas state must continue to restore with DPR.
        const viewport = renderer.getViewport(new THREE.Vector4());
        const scissor = renderer.getScissor(new THREE.Vector4());
        const scissorTest = renderer.getScissorTest();
        renderer.setViewport(4, 8, 300, 220);
        renderer.setScissor(8, 12, 230, 180);
        renderer.setScissorTest(true);
        // Enter through the same framebuffer binding path as a real frame.
        // Three floors DPR-scaled rectangles here; logical setters round them.
        renderer.setRenderTarget(null);
        const canvasBefore = snapshot();
        originalHook(renderer, lab.scene, lab.camera);
        const canvasAfter = snapshot();
        renderer.setViewport(viewport);
        renderer.setScissor(scissor);
        renderer.setScissorTest(scissorTest);
        return { dpr: renderer.getPixelRatio(), transmissionScale, records, offscreenScissor: { before: targetBefore, after: targetAfter }, canvasScissor: { before: canvasBefore, after: canvasAfter }, glError: gl.getError() };
      }, { dpr, transmissionScale });
      assert.equal(result.dpr, dpr);
      assert.ok(result.records.some(record => record.target), 'Must exercise a native transmission render target');
      assert.ok(result.records.some(record => record.target === null), 'Must exercise the canvas floor draw');
      for (const record of result.records) assert.deepEqual(record.after, record.before, `Ground hook changed actual GL state: DPR ${dpr}, scale ${transmissionScale}`);
      assert.deepEqual(result.offscreenScissor.after, result.offscreenScissor.before, 'Target viewport, scissor, and scissor test must restore');
      assert.deepEqual(result.canvasScissor.after, result.canvasScissor.before, 'Canvas viewport, scissor, and scissor test must restore');
      assert.equal(result.glError, 0);
      result.passed = true;
      report.cases.push(result);
    }
  }

  report.opaqueParity = await page.evaluate(async () => {
    const THREE = await import('/node_modules/three/build/three.module.js');
    const lab = window.rockLab, renderer = lab.renderer, gl = renderer.getContext();
    renderer.setPixelRatio(1);
    const recipe = lab.recipe(), floor = lab.ground.group.children[0], hook = floor.onBeforeRender;
    const read = () => { const pixels = new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4); gl.readPixels(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight, gl.RGBA, gl.UNSIGNED_BYTE, pixels); return pixels; };
    const results = {};
    for (const surface of ['stone', 'ice', 'desert', 'limestone', 'granite', 'basalt', 'obsidian']) {
      await lab.loadRecipe({ ...recipe, options: { ...recipe.options, surface } });
      renderer.render(lab.scene, lab.camera);
      const current = read();
      // Reproduce exactly the pre-fix unconditional logical restoration. Old
      // opaque surfaces render on canvas and must remain byte-identical.
      floor.onBeforeRender = function (r, scene, camera) {
        const viewport = r.getViewport(new THREE.Vector4());
        const scissor = r.getScissor(new THREE.Vector4());
        const scissorTest = r.getScissorTest();
        hook.call(this, r, scene, camera);
        r.setViewport(viewport); r.setScissor(scissor); r.setScissorTest(scissorTest);
      };
      renderer.render(lab.scene, lab.camera);
      const legacy = read();
      floor.onBeforeRender = hook;
      let changedBytes = 0;
      for (let i = 0; i < current.length; i++) if (current[i] !== legacy[i]) changedBytes++;
      results[surface] = { changedBytes, bytes: current.length, transmission: lab.material.transmission };
    }
    return results;
  });
  for (const [surface, result] of Object.entries(report.opaqueParity)) {
    assert.equal(result.transmission, 0, `${surface} must remain opaque`);
    assert.equal(result.changedBytes, 0, `${surface} pixels changed`);
  }
  assert.deepEqual(report.errors, []);
  report.passed = true;
} catch (error) {
  report.passed = false;
  report.failure = error.stack;
  throw error;
} finally {
  await browser.close();
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ passed: report.passed, cases: report.cases.length, opaqueParity: report.opaqueParity, errors: report.errors, reportPath }, null, 2));
}
