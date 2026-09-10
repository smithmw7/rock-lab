import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

// Dedicated Chrome process, real UI controls, real downloads/file chooser and
// WebGL pixels. Never attaches to the user's browser or changes saved assets.
const project = fileURLToPath(new URL('..', import.meta.url));
const output = path.join(project, 'output', 'optical');
await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 960 }, deviceScaleFactor: 1, acceptDownloads: true });
page.setDefaultTimeout(60000);
const browserErrors = [];
page.on('pageerror', error => browserErrors.push(error.message));
page.on('console', message => { if (message.type() === 'error') browserErrors.push(message.text()); });
const report = { url: process.env.ROCK_LAB_URL || 'http://127.0.0.1:5207/', checks: {}, captures: {}, browserErrors };
const originalSurfaces = ['stone', 'ice', 'desert', 'limestone', 'granite', 'basalt', 'obsidian'];
const opticalSurfaces = ['glass', 'quartz', 'frozenGlass'];
const opticalKeys = ['transmission', 'ior', 'thickness', 'attenuationDistance', 'absorptionColor', 'dispersion', 'iridescence', 'cloudiness', 'inclusions', 'inclusionScale', 'internalCracks'];
const base = { transmission: .96, ior: 1.54, thickness: 1.8, attenuationDistance: 2.4, absorptionColor: '#94c8ee', dispersion: .35, iridescence: .25, cloudiness: .15, inclusions: .35, inclusionScale: 2.8, internalCracks: .25 };

async function stats() {
  return page.evaluate(() => {
    const lab = window.rockLab;
    const physical = material => ({ type: material.type, transmission: material.transmission, ior: material.ior, thickness: material.thickness, attenuationDistance: material.attenuationDistance, absorptionColor: `#${material.attenuationColor?.getHexString()}`, dispersion: material.dispersion, iridescence: material.iridescence, version: material.version });
    return { ...lab.getStats(), textures: lab.renderer.info.memory.textures, outer: physical(lab.material), inner: physical(lab.innerMaterial), recipe: lab.recipe() };
  });
}
async function selectSurface(surface, target = 'outer') {
  await page.locator('#tab-material').click();
  await page.locator(`[data-material-target="${target}"]`).click();
  await page.locator(`[data-material-family="${opticalSurfaces.includes(surface) ? 'optical' : 'rock'}"]`).click();
  await page.locator(`[data-surface="${surface}"]`).click();
}
async function range(key, value, target = 'outer') {
  await page.locator(`#${key}`).evaluate((input, next) => { input.value = String(next); input.dispatchEvent(new Event('input', { bubbles: true })); }, value);
  const stored = await page.evaluate(({ key, target }) => (target === 'inner' ? window.rockLab.innerState : window.rockLab.state)[key], { key, target });
  assert.equal(stored, value, `${target}.${key}: actual control must update recipe state`);
}
async function configure(values, target = 'outer') { for (const [key, value] of Object.entries(values)) await range(key, value, target); }
async function advance(milliseconds = 0) { await page.evaluate(ms => { window.advanceTime(ms); window.advanceTime(0); }, milliseconds); }

async function capture(name, { raw = false, save = true } = {}) {
  const result = await page.evaluate(({ name, raw }) => {
    const lab = window.rockLab;
    const canvas = document.createElement('canvas'); canvas.width = lab.renderer.domElement.width; canvas.height = lab.renderer.domElement.height;
    const context = canvas.getContext('2d'); context.drawImage(lab.renderer.domElement, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    window.__opticalQAPixels[name] = { pixels, width: canvas.width, height: canvas.height };
    let hash = 2166136261; for (const value of pixels) hash = Math.imul(hash ^ value, 16777619);
    let bytes;
    if (raw) { const pieces = []; for (let i = 0; i < pixels.length; i += 8192) pieces.push(String.fromCharCode(...pixels.subarray(i, i + 8192))); bytes = btoa(pieces.join('')); }
    return { width: canvas.width, height: canvas.height, pixelHash: (hash >>> 0).toString(16), bytes, png: canvas.toDataURL('image/png').split(',')[1] };
  }, { name, raw });
  if (save) { result.file = path.join(output, `${name}.png`); await fs.writeFile(result.file, Buffer.from(result.png, 'base64')); }
  delete result.png;
  const bytes = result.bytes ? Buffer.from(result.bytes, 'base64') : null; delete result.bytes;
  report.captures[name] = result;
  return { ...result, bytes };
}
async function difference(a, b) {
  return page.evaluate(([a, b]) => {
    const first = window.__opticalQAPixels[a], second = window.__opticalQAPixels[b];
    if (first.width !== second.width || first.height !== second.height) throw new Error('GPU capture dimensions differ');
    let changedPixels = 0, changedAssetPixels = 0, sum = 0, maximum = 0;
    for (let i = 0; i < first.pixels.length; i += 4) {
      const d = Math.abs(first.pixels[i] - second.pixels[i]) + Math.abs(first.pixels[i + 1] - second.pixels[i + 1]) + Math.abs(first.pixels[i + 2] - second.pixels[i + 2]);
      sum += d; maximum = Math.max(maximum, d);
      if (d > 8) {
        changedPixels++;
        const x = (i / 4) % first.width, y = Math.floor(i / 4 / first.width);
        if (x > first.width * .2 && x < first.width * .8 && y > first.height * .14 && y < first.height * .75) changedAssetPixels++;
      }
    }
    return { changedPixels, changedAssetPixels, meanChannelDifference: sum / (first.width * first.height * 3), maximum };
  }, [a, b]);
}
function rawDifference(first, second) {
  assert.equal(first.length, second.length, 'Prechange and current capture sizes must match');
  let changedPixels = 0, sum = 0, maximum = 0;
  for (let i = 0; i < first.length; i += 4) {
    const d = Math.abs(first[i] - second[i]) + Math.abs(first[i + 1] - second[i + 1]) + Math.abs(first[i + 2] - second[i + 2]);
    sum += d; maximum = Math.max(maximum, d); if (d > 8) changedPixels++;
  }
  return { changedPixels, meanChannelDifference: sum / (first.length / 4 * 3), maximum };
}
async function importFile(filename, expectedSeed) {
  await page.locator('#menu-file').click();
  const chooserEvent = page.waitForEvent('filechooser'); await page.locator('#load-recipe').click();
  await (await chooserEvent).setFiles(filename);
  await page.waitForFunction(seed => window.rockLab.state.seed === seed && document.querySelector('#toast').textContent === 'Asset recipe restored', expectedSeed);
}
function assertNoGeometryRebuild(before, after) {
  assert.equal(after.generationCount, before.generationCount, 'Optical controls must not regenerate geometry');
  assert.equal(after.geometries, before.geometries, 'Optical controls must reuse render geometry');
}

try {
  await page.goto(report.url);
  await page.waitForFunction(() => window.rockLab?.ready);
  await page.evaluate(() => { window.rockLab.renderer.setAnimationLoop(null); window.__opticalQAPixels = {}; });
  report.defaults = await page.evaluate(async () => (await import('/src/optical.js')).OPTICAL_DEFAULTS);
  report.presets = await page.evaluate(async () => (await import('/src/optical.js')).OPTICAL_PRESETS);
  assert.deepEqual(Object.keys(report.defaults).sort(), [...opticalKeys].sort());

  // True before/after regression baseline was captured with the original v8
  // MeshStandardMaterial implementation, before the optical shader was added.
  const originalBaseline = JSON.parse(await fs.readFile(path.join(output, 'baseline-report.json'), 'utf8'));
  report.checks.originalSurfaceRegression = {};
  for (const surface of originalSurfaces) {
    const baseline = originalBaseline.surfaces[surface];
    await page.evaluate(async entry => {
      const lab = window.rockLab;
      await lab.loadRecipe({ generator: 'procedural-rock-lab', version: 3, options: entry.state });
      lab.camera.position.fromArray(entry.camera.position); lab.camera.quaternion.fromArray(entry.camera.quaternion); lab.camera.zoom = entry.camera.zoom; lab.camera.updateProjectionMatrix();
    }, baseline);
    await advance();
    const after = await capture(`original-after-${surface}`, { raw: true });
    const before = await fs.readFile(path.join(output, `baseline-${surface}.rgba`));
    const pixels = rawDifference(before, after.bytes);
    assert.ok(pixels.meanChannelDifference <= .5, `${surface} changed from the pre-optical appearance: ${JSON.stringify(pixels)}`);
    const live = await stats();
    assert.equal(live.outer.transmission, 0); assert.equal(live.outer.dispersion, 0); assert.equal(live.outer.iridescence, 0);
    assert.equal(await page.locator('#optical-controls-panel').isVisible(), false);
    // Deliberately push dormant recipe values while this old surface is active.
    // The UI hides these controls; the material must also ignore their values.
    await page.evaluate(async keys => {
      const lab = window.rockLab, { updateRockMaterial } = await import('/src/material.js');
      Object.assign(lab.state, keys); updateRockMaterial(lab.material, lab.state);
    }, { transmission: 1, ior: 2.2, thickness: 4, attenuationDistance: .1, absorptionColor: '#ff0033', dispersion: 1, iridescence: 1, cloudiness: 1, inclusions: 1, inclusionScale: 8, internalCracks: 1 });
    await advance(); const extreme = await capture(`original-dormant-${surface}`, { save: false });
    assert.equal(extreme.pixelHash, after.pixelHash, `${surface} must ignore optical-only fields`);
    report.checks.originalSurfaceRegression[surface] = { passed: true, beforeHash: baseline.hash, afterHash: after.pixelHash, pixels, dormantSettingsIgnored: true };
  }

  await page.locator('#tab-shape').click();
  await page.locator('[data-family="primitives"]').click(); await page.locator('[data-shape="sphere"]').click();
  await range('roughness', 0); await range('facets', .65); await range('displacement', 0);
  await page.waitForTimeout(120); await advance();
  await page.locator('#tab-ground').click(); await page.locator('[data-ground="wood"]').click();
  await range('reflection', .65); await range('groundWetness', .25);
  await selectSurface('glass');
  await configure({ materialRoughness: .04, noiseAmount: 0, normalStrength: 0, detail: 0, snow: 0, tintAmount: 0 });
  report.checks.surfacePresets = {};
  for (const surface of opticalSurfaces) {
    await selectSurface(surface); await advance();
    const live = await stats();
    assert.equal(live.outer.type, 'MeshPhysicalMaterial');
    for (const [key, value] of Object.entries(report.presets[surface])) assert.equal(live.recipe.options[key], value, `${surface} preset ${key}`);
    assert(live.outer.transmission > 0);
    await capture(`preset-${surface}`);
    report.checks.surfacePresets[surface] = { passed: true, native: live.outer };
  }

  await selectSurface('quartz');
  await configure({ ...base, materialRoughness: .04, noiseAmount: 0, normalStrength: 0, detail: 0, snow: 0, tintAmount: 0 });
  await advance(); const geometryBaseline = await stats();
  const cases = [
    ['transmission', 0, 1], ['ior', 1, 2.2], ['thickness', .1, 3.8], ['attenuationDistance', .25, 9],
    ['absorptionColor', '#ff8b63', '#719fff'], ['dispersion', 0, 1], ['iridescence', 0, 1],
    ['cloudiness', 0, .9], ['inclusions', 0, 1], ['inclusionScale', .6, 7.5], ['internalCracks', 0, 1],
  ];
  for (const [key, low, high] of cases) {
    await configure(base); await range(key, low); await advance(); await capture(`${key}-low`);
    await range(key, high); await advance(); await capture(`${key}-high`);
    const pixels = await difference(`${key}-low`, `${key}-high`);
    assert.ok(pixels.changedAssetPixels > 25, `${key} must affect GPU pixels on the asset: ${JSON.stringify(pixels)}`);
    const live = await stats(); assertNoGeometryRebuild(geometryBaseline, live);
    if (Object.hasOwn(live.outer, key)) assert.equal(live.outer[key], high, `${key}: native physical material property must follow the control`);
    report.checks[key] = { passed: true, low, high, pixels, native: live.outer };
  }

  // Once native feature variants have warmed, repeated edits must reuse them.
  await configure(base); await advance(); const warm = await stats();
  for (const [key, low, high] of cases) {
    await range(key, low); if (['transmission', 'dispersion', 'iridescence'].includes(key)) await advance();
    await range(key, high); if (['transmission', 'dispersion', 'iridescence'].includes(key)) await advance();
    await configure(base);
  }
  await advance(); const reused = await stats();
  assertNoGeometryRebuild(warm, reused);
  assert.equal(reused.programs, warm.programs, 'Repeated optical edits must reuse cached shader programs');
  assert.equal(reused.textures, warm.textures, 'Repeated optical edits must reuse transmission and reflection textures');
  report.checks.resourceReuse = { passed: true, before: { geometries: warm.geometries, programs: warm.programs, generationCount: warm.generationCount }, after: { geometries: reused.geometries, programs: reused.programs, generationCount: reused.generationCount } };

  // Inspect the internal-feature response from a second actual orbit angle.
  await configure({ ...base, cloudiness: 0, inclusions: 0, internalCracks: 0 }); await advance(); await capture('internal-front-empty');
  await configure({ cloudiness: .65, inclusions: .8, internalCracks: .75 }); await advance(); await capture('internal-front-detailed');
  const stageBox = await page.locator('#stage canvas').boundingBox();
  await page.mouse.move(stageBox.x + stageBox.width * .5, stageBox.y + stageBox.height * .45); await page.mouse.down();
  await page.mouse.move(stageBox.x + stageBox.width * .65, stageBox.y + stageBox.height * .5, { steps: 10 }); await page.mouse.up();
  for (let i = 0; i < 20; i++) await advance();
  await configure({ cloudiness: 0, inclusions: 0, internalCracks: 0 }); await advance(); await capture('internal-orbit-empty');
  await configure({ cloudiness: .65, inclusions: .8, internalCracks: .75 }); await advance(); await capture('internal-orbit-detailed');
  const front = await difference('internal-front-empty', 'internal-front-detailed'), orbit = await difference('internal-orbit-empty', 'internal-orbit-detailed');
  assert(front.changedAssetPixels > 25 && orbit.changedAssetPixels > 25);
  report.checks.internalFeaturesAcrossViews = { passed: true, front, orbit };

  // Independent optical state for both the existing exterior and new cut faces.
  const outerValues = { transmission: .91, ior: 1.67, thickness: 2.35, attenuationDistance: 3.7, absorptionColor: '#af8bde', dispersion: .48, iridescence: .21, cloudiness: .32, inclusions: .43, inclusionScale: 3.4, internalCracks: .37 };
  const innerValues = { transmission: .78, ior: 1.38, thickness: .65, attenuationDistance: 1.8, absorptionColor: '#82d6e8', dispersion: .09, iridescence: .04, cloudiness: .46, inclusions: .27, inclusionScale: 1.6, internalCracks: .64 };
  await selectSurface('quartz', 'outer'); await configure(outerValues);
  await selectSurface('frozenGlass', 'inner'); await configure(innerValues, 'inner'); await advance();
  const independent = await stats();
  for (const [key, value] of Object.entries(outerValues)) assert.equal(independent.recipe.options[key], value);
  for (const [key, value] of Object.entries(innerValues)) assert.equal(independent.recipe.innerMaterial[key], value);
  assert.equal(independent.outer.transmission, outerValues.transmission); assert.equal(independent.inner.transmission, innerValues.transmission);
  await page.locator('#menu-file').click();
  const downloadEvent = page.waitForEvent('download'); await page.locator('#save-recipe').click();
  const download = await downloadEvent, filename = path.join(output, 'actual-optical-export.json');
  await download.saveAs(filename); assert.equal(await download.failure(), null);
  const exported = JSON.parse(await fs.readFile(filename, 'utf8')); assert.deepEqual(exported, independent.recipe);
  await selectSurface('stone', 'outer'); await selectSurface('limestone', 'inner');
  await importFile(filename, exported.options.seed); await advance();
  const restored = await stats(); assert.deepEqual(restored.recipe, exported);
  assert.equal(restored.outer.transmission, outerValues.transmission); assert.equal(restored.inner.transmission, innerValues.transmission);
  report.checks.realRecipeRoundtrip = { passed: true, filename, outer: outerValues, inner: innerValues, version: exported.version };

  // Actual pointer tap, Pinata worker and independent transmissive inner shader.
  await page.locator('#tab-fracture').click(); await page.locator('#fr-method').selectOption('simple');
  await page.locator('#fr-fragmentCount').evaluate(input => { input.value = '4'; input.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.locator('#fr-gravity').evaluate(input => { input.value = '0'; input.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.locator('#fr-enabled').check();
  await page.waitForFunction(() => window.rockLab.fracture?.getStats().enabled && window.rockLab.fracture.getMeshes().length > 0);
  const point = await page.evaluate(() => {
    const lab = window.rockLab, mesh = lab.fracture.getMeshes()[0]; mesh.updateWorldMatrix(true, false); mesh.geometry.computeBoundingSphere();
    const p = mesh.geometry.boundingSphere.center.clone().applyMatrix4(mesh.matrixWorld).project(lab.camera), rect = lab.renderer.domElement.getBoundingClientRect();
    return { x: rect.left + (p.x + 1) * rect.width / 2, y: rect.top + (1 - p.y) * rect.height / 2 };
  });
  await page.mouse.click(point.x, point.y);
  await page.waitForFunction(() => window.rockLab.fracture.getStats().fragments > 0 && !window.rockLab.fracture.getStats().busy);
  await advance(180); await capture('quartz-fracture-transmissive-interior');
  const fractured = await stats(); assert(fractured.fracture.fragments > 0);
  assert.equal(fractured.outer.transmission, outerValues.transmission); assert.equal(fractured.inner.transmission, innerValues.transmission);
  await selectSurface('limestone', 'inner'); await advance(); await capture('quartz-fracture-limestone-interior');
  const opaqueCut = await stats(); assert.equal(opaqueCut.outer.transmission, outerValues.transmission); assert.equal(opaqueCut.inner.transmission, 0);
  const innerDifference = await difference('quartz-fracture-transmissive-interior', 'quartz-fracture-limestone-interior');
  assert(innerDifference.changedPixels > 25);
  report.checks.quartzRayFracture = { passed: true, stats: fractured.fracture, independentInnerChange: innerDifference };
  await page.screenshot({ path: path.join(output, 'optical-controls-desktop.png') });
  assert.deepEqual(browserErrors, []);
  report.passed = true;
  await fs.writeFile(path.join(output, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ passed: true, checks: Object.keys(report.checks), output }, null, 2));
} catch (error) {
  report.passed = false; report.error = error.message;
  await fs.writeFile(path.join(output, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  throw error;
} finally { await browser.close(); }
