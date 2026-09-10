import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const project = fileURLToPath(new URL('..', import.meta.url));
const baseline = process.env.ROCK_LAB_SETTLING_BASELINE === '1';
const comparison = process.env.ROCK_LAB_SETTLING_COMPARE?.replace(/[^a-z0-9_-]/gi, '');
const output = path.join(project, 'output', 'fracture-settling', comparison || (baseline ? 'baseline' : 'verified'));
await fs.mkdir(output, { recursive: true });
const sourceFiles = ['src/main.js', 'src/fracture.js'];
const sourceHashes = async () => Object.fromEntries(await Promise.all(sourceFiles.map(async name => [name, createHash('sha256').update(await fs.readFile(path.join(project, name))).digest('hex')])));
const report = { url: process.env.ROCK_LAB_URL || 'http://127.0.0.1:5207/', baseline, comparison: comparison || null, sourceHashes: await sourceHashes(), cases: [], checks: {}, errors: [], warnings: [] };
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
page.setDefaultTimeout(60000);
page.on('pageerror', error => report.errors.push(error.message));
page.on('console', message => { if (message.type() === 'error') report.errors.push(message.text()); if (message.type() === 'warning') report.warnings.push(message.text()); });
const advance = ms => page.evaluate(ms => window.advanceTime(ms), ms);
const snapshot = () => page.evaluate(() => {
  const lab = window.rockLab;
  return {
    stats: lab.fracture.getStats(), camera: lab.camera.position.toArray(), cameraQuaternion: lab.camera.quaternion.toArray(),
    pixelsPerUnit: lab.renderer.domElement.getBoundingClientRect().height / ((lab.camera.top - lab.camera.bottom) / lab.camera.zoom),
    turntable: lab.getStats().turntable, turntableMode: lab.getStats().turntableMode,
    meshes: lab.fracture.getMeshes().map(mesh => {
      mesh.geometry.computeBoundingSphere();
      mesh.updateWorldMatrix(true, false);
      const attribute = mesh.geometry.attributes.position, point = mesh.position.clone(); let minimumY = Infinity;
      for (let i = 0; i < attribute.count; i++) {
        point.fromBufferAttribute(attribute, i).applyMatrix4(mesh.matrixWorld);
        minimumY = Math.min(minimumY, point.y);
      }
      return { id: mesh.uuid, generation: mesh.userData.generation ?? 0, position: mesh.position.toArray(), rotation: mesh.quaternion.toArray(), radius: mesh.geometry.boundingSphere.radius, minimumY };
    }),
  };
});
function quaternionAngle(a, b) {
  const lengthA = Math.hypot(...a), lengthB = Math.hypot(...b);
  assert(Number.isFinite(lengthA + lengthB) && lengthA > 0 && lengthB > 0, 'Fragment rotations must be finite, nonzero quaternions');
  const normalizedA = a.map(value => value / lengthA), normalizedB = b.map(value => value / lengthB);
  const dot = normalizedA.reduce((sum, value, i) => sum + value * normalizedB[i], 0);
  const sign = dot < 0 ? -1 : 1;
  // The normalized chord remains accurate near zero, where acos(dot) loses
  // precision. q and -q describe the same orientation and have zero drift.
  const chord = Math.hypot(...normalizedA.map((value, i) => value - sign * normalizedB[i]));
  return 4 * Math.asin(Math.min(1, chord / 2));
}
const unnormalized = [.21, -.31, .09, .73];
assert.equal(quaternionAngle(unnormalized, unnormalized), 0);
assert.equal(quaternionAngle(unnormalized, unnormalized.map(value => -value)), 0);
assert(quaternionAngle(unnormalized, unnormalized.map(value => value * 3)) < 1e-14);
for (const angle of [1e-6, Math.PI / 2]) assert(Math.abs(quaternionAngle([0, 0, 0, 1], [0, Math.sin(angle / 2), 0, Math.cos(angle / 2)]) - angle) < 1e-12);
function motion(before, after) {
  const previous = new Map(before.meshes.map(mesh => [mesh.id, mesh]));
  let translation = 0, angle = 0, surface = 0, moving = 0;
  for (const mesh of after.meshes) {
    const old = previous.get(mesh.id); if (!old) continue;
    const distance = Math.hypot(...mesh.position.map((value, i) => value - old.position[i]));
    const rotation = quaternionAngle(mesh.rotation, old.rotation);
    const displacement = distance + mesh.radius * rotation;
    translation = Math.max(translation, distance); angle = Math.max(angle, rotation); surface = Math.max(surface, displacement);
    if (displacement > .00001) moving++;
  }
  return { translation, angle, surface, screenPixels: surface * after.pixelsPerUnit, moving, countChanged: before.meshes.length !== after.meshes.length };
}
async function capture(name) { await advance(0); await page.screenshot({ path: path.join(output, `${name}.png`) }); }
async function clickPiece({ fragmentsOnly = false } = {}) {
  const point = await page.evaluate(({ fragmentsOnly }) => {
    const lab = window.rockLab, rect = lab.renderer.domElement.getBoundingClientRect();
    const allMeshes = lab.fracture.getMeshes();
    for (const mesh of allMeshes) mesh.updateWorldMatrix(true, false);
    const meshes = allMeshes.filter(mesh => !fragmentsOnly || mesh.userData.generation > 0);
    const raycaster = lab.sceneEditor.getTransformControls().getRaycaster();
    for (const mesh of meshes) mesh.geometry.computeBoundingSphere();
    meshes.sort((a, b) => b.geometry.boundingSphere.radius - a.geometry.boundingSphere.radius);
    for (const mesh of meshes) {
      mesh.updateWorldMatrix(true, false);
      const candidates = [mesh.geometry.boundingSphere.center.clone()];
      const attribute = mesh.geometry.attributes.position;
      for (let i = 0; i < attribute.count; i += Math.max(1, Math.floor(attribute.count / 20))) candidates.push(mesh.position.clone().fromBufferAttribute(attribute, i));
      for (const candidate of candidates) {
        const p = candidate.applyMatrix4(mesh.matrixWorld).project(lab.camera);
        const x = rect.left + (p.x + 1) * rect.width / 2, y = rect.top + (1 - p.y) * rect.height / 2;
        if (x <= rect.left + 10 || x >= rect.right - 10 || y <= rect.top + 10 || y >= rect.bottom - 10) continue;
        raycaster.setFromCamera({ x: p.x, y: p.y }, lab.camera);
        const hit = raycaster.intersectObjects(allMeshes, false)[0];
        if (hit?.object === mesh) return { x, y, id: mesh.uuid, name: mesh.name, generation: mesh.userData.generation,
          rayOrigin: raycaster.ray.origin.toArray(), rayDirection: raycaster.ray.direction.toArray(), hitPoint: hit.point.toArray() };
      }
    }
    throw Error('No eligible visible fracture piece');
  }, { fragmentsOnly });
  await page.mouse.click(point.x, point.y);
  await page.waitForFunction(old => !window.rockLab.fracture.getStats().busy && window.rockLab.fracture.getMeshes().some(mesh => mesh.userData.generation > old), point.generation);
  return point;
}
async function setup(shape, seed, action) {
  await page.evaluate(async ({ shape, seed }) => {
    const lab = window.rockLab, recipe = lab.recipe();
    recipe.version = 5;
    recipe.options = { ...recipe.options, shape, seed, surface: shape === 'metalPlate' ? 'brushedSteel' : shape === 'jar' ? 'terracotta' : 'stone', facets: .35, roughness: .2, bevel: .4, displacement: 0, ground: 'studio', reflection: .2, lighting: 'alpine' };
    recipe.fracture = { ...recipe.fracture, enabled: false, method: 'voronoi', seed: 19423, fragmentCount: 8, impactEnabled: true, impactSource: 'tap', impulse: 1.8, gravity: 9.81, friction: .65, restitution: .18, maxGeneration: 3, maxFragments: 160 };
    await lab.loadRecipe(recipe); lab.audio.setMuted(true); lab.renderer.setAnimationLoop(null);
  }, { shape, seed });
  await page.locator('#tab-fracture').click(); await page.locator('#fr-enabled').check();
  await page.waitForFunction(() => window.rockLab.fracture?.getStats().enabled);
  await capture(`${shape}-before`);
  let pointerImpact = null;
  if (action === 'tap') pointerImpact = await clickPiece();
  else { await page.locator('#fr-break').click(); await page.waitForFunction(() => !window.rockLab.fracture.getStats().busy && window.rockLab.fracture.getStats().fragments > 0); }
  const initial = await snapshot();
  initial.pointerImpact = pointerImpact;
  initial.recipe = await page.evaluate(() => window.rockLab.recipe());
  await advance(800); await capture(`${shape}-falling`);
  return initial;
}
async function sampleSettled(shape, wait = 30000) {
  await advance(wait);
  const start = await snapshot(); let previous = start;
  const ids = start.meshes.map(mesh => mesh.id).sort();
  let minimumY = Math.min(...start.meshes.filter(mesh => mesh.generation > 0).map(mesh => mesh.minimumY));
  const maxima = { translation: 0, angle: 0, surface: 0, screenPixels: 0, moving: 0 }; const samples = [];
  // Ten observations per second catch visible tremor while advanceTime continues
  // to integrate the real 60 Hz Rapier simulation and render the actual scene.
  for (let i = 0; i < 30; i++) {
    await advance(100); const current = await snapshot(), delta = motion(previous, current);
    assert.deepEqual(current.meshes.map(mesh => mesh.id).sort(), ids, `${shape}: settling must preserve every fragment identity`);
    minimumY = Math.min(minimumY, ...current.meshes.filter(mesh => mesh.generation > 0).map(mesh => mesh.minimumY));
    for (const key of Object.keys(maxima)) maxima[key] = Math.max(maxima[key], delta[key]);
    assert.equal(delta.countChanged, false, `${shape}: settling must not discard fragments`);
    samples.push(delta); previous = current;
  }
  const net = motion(start, previous);
  await capture(`${shape}-settled`);
  return { waitedSeconds: wait / 1000, observedSeconds: 3, stats: previous.stats, bodies: previous.meshes.length, bodyIds: ids, minimumY, maxima, net, samples };
}

try {
  await page.goto(report.url); await page.waitForFunction(() => window.rockLab?.ready);
  await page.evaluate(() => { window.rockLab.renderer.setAnimationLoop(null); window.rockLab.audio.setMuted(true); });
  for (const test of [ { shape: 'boulder', seed: 18427, action: 'tap' }, { shape: 'metalPlate', seed: 49107, action: 'break' }, { shape: 'jar', seed: 701, action: 'break' }, { shape: 'wall', seed: 72103, action: 'break' } ]) {
    const initial = await setup(test.shape, test.seed, test.action);
    const settling = await sampleSettled(test.shape);
    report.cases.push({ ...test, recipe: initial.recipe, initialBodies: initial.meshes.length, pointerImpact: initial.pointerImpact, settling });
    console.log(JSON.stringify({ shape: test.shape, initialBodies: initial.meshes.length, bodies: settling.bodies, minimumY: settling.minimumY, stats: settling.stats, maxima: settling.maxima, net: settling.net }));
    await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
    if (!baseline && !comparison) {
      assert.equal(settling.stats.failures, 0, `${test.shape}: fracture operation reported an error`);
      assert.equal(settling.bodies, initial.meshes.length, `${test.shape}: settling must retain all generated fragments`);
      assert.deepEqual(settling.bodyIds, initial.meshes.map(mesh => mesh.id).sort(), `${test.shape}: the same generated fragments must survive settling`);
      assert(Number.isFinite(settling.minimumY) && settling.minimumY >= -.02, `${test.shape}: settled render geometry sinks below the floor (${settling.minimumY.toFixed(6)} units)`);
      assert(settling.net.surface < .0001, `${test.shape}: settled fragments drifted ${settling.net.surface.toFixed(6)} units`);
      assert(settling.maxima.screenPixels < .04, `${test.shape}: visible resting tremor of ${settling.maxima.screenPixels.toFixed(3)} pixels`);
      if (Number.isFinite(settling.stats.active)) assert.equal(settling.stats.active, 0, `${test.shape}: resting fragments stay active`);
    }
  }
  if (!baseline && !comparison) {
    await setup('boulder', 18427, 'tap');
    const movingBeforePause = await snapshot();
    await page.locator('#fr-pause').click(); await page.waitForFunction(() => window.rockLab.fracture.getStats().paused);
    const pausedBefore = await snapshot(); await advance(2000); const pausedAfter = await snapshot();
    assert.deepEqual(pausedAfter.meshes, pausedBefore.meshes, 'Pausing must stop every fragment pose');
    await page.locator('#fr-pause').click(); await page.waitForFunction(() => !window.rockLab.fracture.getStats().paused);
    await advance(800); const resumed = await snapshot();
    assert(motion(movingBeforePause, resumed).surface > .01, 'Resuming an airborne fragment must continue physics');
    report.checks.pauseResume = { pausedPosesExact: true, resumedSurfaceMotion: motion(movingBeforePause, resumed).surface };
    const sleep = await sampleSettled('boulder-sleeping');
    report.checks.pauseResumeSettling = { ...sleep, expectedBodyIds: movingBeforePause.meshes.map(mesh => mesh.id).sort() };
    assert.deepEqual(sleep.bodyIds, movingBeforePause.meshes.map(mesh => mesh.id).sort());
    assert(sleep.minimumY >= -.02 && sleep.net.surface < .0001, 'Resumed debris must settle above the floor');
    if (Number.isFinite(sleep.stats.active)) assert.equal(sleep.stats.active, 0);
    const asleepBefore = await snapshot();
    if (Number.isFinite(asleepBefore.stats.resting)) assert(asleepBefore.stats.resting > 0);
    await page.locator('#tab-studio').click(); await page.locator('#rotate').check();
    await advance(1200); const turned = await snapshot();
    assert(turned.turntable && turned.turntableMode === 'camera');
    assert(Math.hypot(...turned.camera.map((v, i) => v - asleepBefore.camera[i])) > .05);
    assert(motion(asleepBefore, turned).surface < .0001, 'Turntable must not disturb resting bodies');
    await page.locator('#rotate').uncheck(); await advance(1600);
    report.checks.sleepingTurntable = { cameraMoves: true, bodySurfaceMotion: motion(asleepBefore, turned).surface, resting: sleep.stats.resting ?? null };
    await page.locator('#tab-fracture').click();
    const beforeTap = await snapshot(); const point = await clickPiece({ fragmentsOnly: true });
    const afterTap = await snapshot();
    assert(afterTap.stats.generation > beforeTap.stats.generation, 'An asleep fragment must still respond to a pointer fracture');
    await advance(400); const awake = await snapshot();
    assert(awake.stats.fragments > 0 && !awake.stats.paused);
    const renewedMotion = motion(afterTap, awake).surface;
    assert(renewedMotion > .005, 'New fragments from a resting parent must move naturally');
    report.checks.refractureSleepingFragment = { target: point.id, oldGeneration: beforeTap.stats.generation, generation: afterTap.stats.generation, renewedSurfaceMotion: renewedMotion, restingBefore: beforeTap.stats.resting ?? null, activeAfter: awake.stats.active ?? null };
    await capture('sleeping-fragment-refractured');
    const resettled = await sampleSettled('refractured-rest');
    report.checks.refracturedSettling = { ...resettled, expectedBodyIds: afterTap.meshes.map(mesh => mesh.id).sort(), resting: resettled.stats.resting ?? null };
    assert.deepEqual(resettled.bodyIds, afterTap.meshes.map(mesh => mesh.id).sort(), 'Re-fractured children and neighboring bodies must all survive');
    assert(resettled.minimumY >= -.02 && resettled.net.surface < .0001, 'Re-fractured debris must settle without sinking');
    if (Number.isFinite(resettled.stats.active)) assert.equal(resettled.stats.active, 0);
    await page.locator('#fr-reset').click(); await page.waitForFunction(() => window.rockLab.fracture.getStats().generation === 0);
    const reset = await snapshot(); assert.equal(reset.stats.fragments, 0); assert(reset.meshes.every(mesh => mesh.generation === 0));
    await advance(1000); assert.deepEqual((await snapshot()).meshes, reset.meshes, 'Restored intact sources remain fixed');
    report.checks.reset = { intactSources: reset.meshes.length, fragments: 0 }; await capture('reset-intact');
  }
  assert.deepEqual(report.errors, []);
  assert.deepEqual(await sourceHashes(), report.sourceHashes, 'A single frozen runtime must cover the full settling run');
  report.measuredRestThresholdsMet = report.cases.every(test => test.settling.net.surface < .0001
    && test.settling.maxima.screenPixels < .04
    && test.settling.minimumY >= -.02
    && test.settling.bodies === test.initialBodies
    && (!Number.isFinite(test.settling.stats.active) || test.settling.stats.active === 0));
  report.completed = true;
  // Baseline/comparison runs collect measurements and skip the strict checks.
  // They must never advertise a verification pass, even when measured drift is low.
  report.validation = baseline || comparison ? 'not-run' : 'passed';
  report.settlingPassed = baseline || comparison ? null : report.measuredRestThresholdsMet;
  report.passed = baseline || comparison ? null : true;
} catch (error) { report.passed = false; report.failure = error.stack; await capture('failure').catch(() => {}); throw error; }
finally { await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2)); await browser.close(); }
console.log(JSON.stringify({ completed: report.completed, validation: report.validation, passed: report.passed, settlingPassed: report.settlingPassed, measuredRestThresholdsMet: report.measuredRestThresholdsMet, baseline, comparison: comparison || null, cases: report.cases.map(({ shape, settling }) => ({ shape, bodies: settling.bodies, maxima: settling.maxima, net: settling.net })), checks: report.checks, output }, null, 2));
