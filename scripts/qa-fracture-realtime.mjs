import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

// Exercise the actual animation loop. The older settling check advances a
// stopped renderer manually and starts observing stability after 30 seconds.
// This checks the visible settling period, including denser multi-part piles.
const project = fileURLToPath(new URL('..', import.meta.url));
const label = (process.env.ROCK_LAB_REALTIME_LABEL || 'verified').replace(/[^a-z0-9_-]/gi, '');
const output = path.join(project, 'output', 'fracture-realtime', label);
const report = {
  url: process.env.ROCK_LAB_URL || 'http://127.0.0.1:5207/',
  label, deadlineSeconds: 10, stableWindowSeconds: 3, cases: [], errors: [], warnings: [],
};
await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
page.setDefaultTimeout(60000);
page.on('pageerror', error => report.errors.push(error.message));
page.on('console', message => {
  if (message.type() === 'error') report.errors.push(message.text());
  if (message.type() === 'warning') report.warnings.push(message.text());
});
const writeReport = () => fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));

async function tapVisibleFragment(fragmentsOnly = false) {
  const hit = await page.evaluate(fragmentsOnly => {
    const lab = window.rockLab, meshes = lab.fracture.getMeshes();
    const rect = lab.renderer.domElement.getBoundingClientRect();
    const raycaster = lab.sceneEditor.getTransformControls().getRaycaster();
    for (const mesh of meshes) { mesh.updateWorldMatrix(true, false); mesh.geometry.computeBoundingSphere(); }
    const eligible = meshes.filter(mesh => !fragmentsOnly || mesh.userData.generation > 0);
    eligible.sort((a, b) => b.geometry.boundingSphere.radius - a.geometry.boundingSphere.radius);
    for (const mesh of eligible) {
      const points = [mesh.geometry.boundingSphere.center.clone()], positions = mesh.geometry.attributes.position;
      for (let i = 0; i < positions.count; i += Math.max(1, Math.floor(positions.count / 20))) {
        points.push(mesh.position.clone().fromBufferAttribute(positions, i));
      }
      for (const point of points) {
        point.applyMatrix4(mesh.matrixWorld).project(lab.camera);
        const x = rect.left + (point.x + 1) * rect.width / 2, y = rect.top + (1 - point.y) * rect.height / 2;
        if (x < rect.left + 10 || x > rect.right - 10 || y < rect.top + 10 || y > rect.bottom - 10) continue;
        raycaster.setFromCamera({ x: point.x, y: point.y }, lab.camera);
        if (raycaster.intersectObjects(meshes, false)[0]?.object === mesh) {
          return { x, y, id: mesh.uuid, generation: mesh.userData.generation };
        }
      }
    }
    throw Error('No visible fragment can receive a real pointer click');
  }, fragmentsOnly);
  await page.mouse.click(hit.x, hit.y);
  await page.waitForFunction(generation => !window.rockLab.fracture.getStats().busy
    && window.rockLab.fracture.getStats().generation > generation, hit.generation);
  return hit;
}

async function observe(name, pointerImpact = null) {
  const data = await page.evaluate(() => new Promise(resolve => {
    const lab = window.rockLab, controller = lab.fracture, originalStep = controller.step;
    const start = performance.now(), initialIds = controller.getMeshes().map(mesh => mesh.uuid).sort();
    const initialStats = controller.getStats(), initialRecipe = lab.recipe();
    const previous = new Map(), frames = [];
    let requestedPhysicsSeconds = 0, physicsFrames = 0;
    // Observe delta without altering it, stopping RAF, or manually stepping.
    controller.step = function (dt) {
      const running = controller.getStats();
      originalStep.call(controller, dt);
      if (running.enabled && !running.paused && !running.busy) { requestedPhysicsSeconds += dt; physicsFrames++; }
    };
    const pose = mesh => ({ id: mesh.uuid, generation: mesh.userData.generation, p: mesh.position.toArray(), q: mesh.quaternion.toArray() });
    for (const mesh of controller.getMeshes()) {
      mesh.geometry.computeBoundingSphere(); previous.set(mesh.uuid, pose(mesh));
    }
    function sample() {
      const seconds = (performance.now() - start) / 1000;
      let surface = 0, translation = 0, moving = 0, minimumPositiveSurface = Infinity;
      for (const mesh of controller.getMeshes()) {
        const current = pose(mesh), old = previous.get(mesh.uuid);
        if (old) {
          const distance = Math.hypot(...current.p.map((value, index) => value - old.p[index]));
          const qa = current.q.map(value => value / Math.hypot(...current.q));
          const qb = old.q.map(value => value / Math.hypot(...old.q));
          const sign = qa.reduce((sum, value, index) => sum + value * qb[index], 0) < 0 ? -1 : 1;
          const angle = 4 * Math.asin(Math.min(1, Math.hypot(...qa.map((value, index) => value - sign * qb[index])) / 2));
          const travel = distance + mesh.geometry.boundingSphere.radius * angle;
          translation = Math.max(translation, distance); surface = Math.max(surface, travel);
          if (travel > 1e-10) minimumPositiveSurface = Math.min(minimumPositiveSurface, travel);
          if (travel > 1e-5) moving++;
        }
        previous.set(mesh.uuid, current);
      }
      frames.push({ seconds, requestedPhysicsSeconds, surface, translation, moving,
        minimumPositiveSurface: Number.isFinite(minimumPositiveSurface) ? minimumPositiveSurface : 0,
        stats: controller.getStats() });
      if (seconds < 13) { requestAnimationFrame(sample); return; }
      controller.step = originalStep;
      const meshes = controller.getMeshes().map(mesh => {
        mesh.updateWorldMatrix(true, false);
        const attribute = mesh.geometry.attributes.position, point = mesh.position.clone(); let minimumY = Infinity;
        for (let i = 0; i < attribute.count; i++) {
          point.fromBufferAttribute(attribute, i).applyMatrix4(mesh.matrixWorld); minimumY = Math.min(minimumY, point.y);
        }
        return { ...pose(mesh), minimumY };
      });
      resolve({ initialStats, initialRecipe, initialIds, frames, meshes, stats: controller.getStats(),
        wallSeconds: seconds, requestedPhysicsSeconds, physicsFrames, framesPerSecond: physicsFrames / seconds });
    }
    requestAnimationFrame(sample);
  }));
  const windows = [3, 5, 10].map(start => {
    const samples = data.frames.filter(frame => frame.seconds >= start && frame.seconds < start + (start === 10 ? 3 : 1.5));
    return { start, samples: samples.length, maxSurface: Math.max(0, ...samples.map(frame => frame.surface)),
      maxTranslation: Math.max(0, ...samples.map(frame => frame.translation)),
      movingFrames: samples.filter(frame => frame.moving).length,
      restingCounts: [...new Set(samples.map(frame => frame.stats.resting))],
      activeCounts: [...new Set(samples.map(frame => frame.stats.active))],
      minimumPositiveSurface: Math.min(Infinity, ...samples.filter(frame => frame.minimumPositiveSurface).map(frame => frame.minimumPositiveSurface)) };
  });
  const stable = data.frames.filter(frame => frame.seconds >= 10);
  const failures = [];
  const check = (condition, message) => { if (!condition) failures.push(message); };
  const minimumFragments = { 'boulder-whole-break': 90, 'wall-whole-break': 140, 'metalPlate-whole-break': 20 }[name] || 1;
  check(data.initialStats.fragments >= minimumFragments, `Fixture must exercise at least ${minimumFragments} fragments`);
  check(stable.length > 0 && stable.at(-1).seconds - stable[0].seconds >= 2.95, 'Observe at least three seconds after the ten-second settling deadline');
  check(data.requestedPhysicsSeconds >= 11.5, `Natural rendering only advanced ${data.requestedPhysicsSeconds.toFixed(2)}s of physics in ${data.wallSeconds.toFixed(2)}s; report the slowdown without relaxing the settling deadline`);
  check(stable.every(frame => frame.surface < 1e-5), 'Fragment poses still move after ten seconds');
  check(stable.every(frame => frame.stats.active === 0 && frame.stats.resting === frame.stats.fragments), 'Every fragment must be resting after ten seconds');
  check(JSON.stringify(data.initialIds) === JSON.stringify(data.meshes.map(mesh => mesh.id).sort()), 'Settling must retain every fragment identity');
  check(data.meshes.every(mesh => mesh.minimumY >= -.02), 'No fragment may settle through the floor');
  check(data.stats.failures === 0, 'Fracture must not report an operation failure');
  if (pointerImpact) {
    check(data.initialStats.active > 0, 'A real pointer fracture must awaken new debris');
    check(data.frames.some(frame => frame.seconds < 1.5 && frame.surface > .001), 'Awakened fragments must move naturally before settling');
  }
  const summary = { name, pointerImpact, fragments: data.stats.fragments, stats: data.stats, windows,
    wallSeconds: data.wallSeconds, requestedPhysicsSeconds: data.requestedPhysicsSeconds, framesPerSecond: data.framesPerSecond, failures };
  await fs.writeFile(path.join(output, `${name}.json`), JSON.stringify({ ...data, ...summary }, null, 2));
  await page.screenshot({ path: path.join(output, `${name}.png`) });
  report.cases.push(summary); console.log(JSON.stringify(summary)); await writeReport();
}

try {
  await page.goto(report.url); await page.waitForFunction(() => window.rockLab?.ready);
  await page.evaluate(() => window.rockLab.audio.setMuted(true));
  assert.equal(await page.evaluate(() => window.rockLab.fracture.getStats().enabled), true, 'Default fracture is on');
  await observe('default-tap', await tapVisibleFragment());
  await observe('rested-fragment-repeat-tap', await tapVisibleFragment(true));
  for (const shape of ['boulder', 'metalPlate', 'wall']) {
    await page.evaluate(async shape => {
      const lab = window.rockLab, recipe = lab.recipe();
      recipe.options = { ...recipe.options, shape, seed: 49107, facets: .35, roughness: .2, bevel: .4, displacement: 0, ground: 'studio' };
      recipe.fracture = { ...recipe.fracture, enabled: true, fragmentCount: shape === 'wall' ? 12 : 24, maxFragments: 160, maxGeneration: 3 };
      await lab.loadRecipe(recipe);
    }, shape);
    await page.locator('#tab-fracture').click(); await page.locator('#fr-break').click();
    await page.waitForFunction(() => !window.rockLab.fracture.getStats().busy && window.rockLab.fracture.getStats().fragments > 0);
    await observe(`${shape}-whole-break`);
  }
  assert.equal(report.errors.length, 0, report.errors.join('\n'));
  const failures = report.cases.flatMap(test => test.failures.map(failure => `${test.name}: ${failure}`));
  assert.equal(failures.length, 0, failures.join('\n'));
  console.log(`Natural-frame fracture QA passed: ${report.cases.length} cases, ten-second deadline and three seconds of stable poses.`);
} finally { await writeReport(); await browser.close(); }
