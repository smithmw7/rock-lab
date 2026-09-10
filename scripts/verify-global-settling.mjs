import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { buildAsset, disposeAsset } from '../src/geometry.js';
import { defaults, looks } from '../src/catalog.js';
import { createFractureLab, FRACTURE_DEFAULTS } from '../src/fracture.js';

// Exercise the authored library, not synthetic boxes alone. Keep the existing
// airborne, frictionless-slide, incoming-impact, and support-removal tests in
// verify-fracture-settling.mjs: an immobile world is not a valid settling fix.
const project = fileURLToPath(new URL('..', import.meta.url));
const output = path.join(project, 'output', 'global-settling');
await fs.mkdir(output, { recursive: true });
const measurementOnly = process.argv.includes('--measure');
const argument = name => process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : undefined;
const filter = argument('--preset') || argument('--filter');
const settleSeconds = Number(argument('--settle-seconds') || 8), observationSeconds = 4;
const sourceHash = async () => createHash('sha256').update(await fs.readFile(path.join(project, 'src/fracture.js'))).digest('hex');
const report = { sourceHash: await sourceHash(), measurementOnly, settleSeconds, observationSeconds, cases: [], failures: [], warnings: [] };
const outer = new THREE.MeshStandardMaterial(), inner = new THREE.MeshStandardMaterial();
let capturedWorld;
const nativeCreate = RAPIER.World.prototype.createRigidBody, nativeWarn = console.warn;
RAPIER.World.prototype.createRigidBody = function (...args) { capturedWorld = this; return nativeCreate.apply(this, args); };
console.warn = (...args) => { report.warnings.push(args.join(' ')); nativeWarn(...args); };
const resting = body => body.userData?.resting === true || body.isSleeping();
const pose = body => { const p = body.translation(), q = body.rotation(); return { p: [p.x, p.y, p.z], q: [q.x, q.y, q.z, q.w] }; };
function movement(current, previous) {
  const distance = Math.hypot(...current.p.map((value, index) => value - previous.p[index]));
  if (current.q.every((value, index) => value === previous.q[index])) return { distance, angle: 0 };
  const dot = Math.abs(current.q.reduce((sum, value, index) => sum + value * previous.q[index], 0));
  return { distance, angle: 2 * Math.acos(Math.min(1, dot / (Math.hypot(...current.q) * Math.hypot(...previous.q)))) };
}
const simulate = (lab, seconds) => { for (let frame = 0; frame < Math.round(seconds * 60); frame++) lab.step(1 / 60); };
const specs = Object.entries(looks).map(([id, preset]) => ({ id: `preset-${id}`, geometry: preset.options, physics: { fragmentCount: 8 } }));
// A second pass uses the actual public defaults (12 fragments per piece),
// since both body count and cut seed can change a contact island completely.
for (const [id, preset] of Object.entries(looks)) specs.push({ id: `default-${id}`, geometry: preset.options, physics: {} });
for (const id of ['quarry', 'coastalCairn', 'obsidianShards', 'basaltShelter', 'boundaryCairns', 'honeyBench', 'clearVessel', 'amberOrb', 'celadonJar', 'porcelainBowl']) {
  specs.push({ id: `seed-${id}`, geometry: { ...looks[id].options, seed: 701 }, physics: { seed: 734, fragmentCount: 12 } });
}
for (const [id, geometry] of [
  ['alpine', looks.alpine.options], ['quarry', looks.quarry.options], ['coastalCairn', looks.coastalCairn.options],
  ['bowl', { ...defaults, shape: 'bowl' }], ['jar', { ...defaults, shape: 'jar' }],
  ['thinBrick', { ...defaults, shape: 'brick' }], ['curvedRamp', looks.gardenAscent.options],
]) {
  for (const [variant, physics] of [
    ['default', { fragmentCount: 12, friction: .65, restitution: .18 }],
    ['smooth', { fragmentCount: 24, friction: .35, restitution: .35 }],
    ['rough', { fragmentCount: 12, friction: 1.2, restitution: 0 }],
  ]) specs.push({ id: `recut-${id}-${variant}`, geometry, physics: { ...physics, maxGeneration: 4, maxFragments: 160 }, recut: true });
}

async function tapNext(lab, bodies, index) {
  const meshes = lab.getMeshes();
  const generations = new Map(bodies(true).map(body => [body.userData.pieceId, body.userData.generation]));
  // First tap the largest intact mesh; later taps preferentially recut the
  // exposed descendants. These are genuine raycast taps through the public API.
  const candidates = meshes.map(mesh => {
    mesh.geometry.computeBoundingBox();
    return { mesh, size: mesh.geometry.boundingBox.getSize(new THREE.Vector3()).length(), generation: generations.get(mesh.uuid) };
  }).filter(candidate => candidate.generation < 4).sort((a, b) => (index === 0 ? a.generation - b.generation : b.generation - a.generation) || b.size - a.size);
  for (const candidate of candidates.slice(0, 12)) {
    const center = new THREE.Box3().setFromObject(candidate.mesh).getCenter(new THREE.Vector3());
    for (const approach of [[0, 1, 2], [2, 1, 0], [-2, 1, 0], [0, 3, 0]]) {
      const direction = new THREE.Vector3(...approach).normalize().negate();
      const ray = new THREE.Raycaster(center.clone().addScaledVector(direction, -10), direction);
      const hit = ray.intersectObjects(meshes, false)[0];
      if (!hit || generations.get(hit.object.uuid) >= 4) continue;
      if (await lab.tap(ray)) return { generation: generations.get(hit.object.uuid), origin: ray.ray.origin.toArray(), direction: direction.toArray(), fragments: lab.getStats().fragments };
    }
  }
  throw new Error(`Tap ${index + 1} could not reach an eligible piece: ${lab.getStats().message}`);
}

async function run(spec) {
  const scene = new THREE.Scene(), source = buildAsset(spec.geometry, outer);
  scene.add(source);
  const lab = await createFractureLab({ scene, outerMaterial: outer, innerMaterial: inner });
  const physics = { ...FRACTURE_DEFAULTS, ...spec.physics };
  lab.update(physics); lab.setSource(source); assert.equal(lab.setEnabled(true), true);
  const world = capturedWorld;
  const bodies = (includeIntact = false) => { const result = []; world.forEachRigidBody(body => { if (body.userData && (includeIntact || body.userData.generation > 0)) result.push(body); }); return result; };
  const result = { id: spec.id, geometry: spec.geometry, physics, taps: [], samples: [], firstAllRestingSeconds: null, lastVisibleMotionSeconds: 0, initialCount: 0, lateWindow: { from: settleSeconds, to: settleSeconds + observationSeconds, maxTranslationPerStep: 0, maxRotationPerStep: 0, maxSurfaceMotionPerStep: 0, totalSurfaceMotion: 0, totalTranslationTravel: 0, movingFrames: 0, awakeBodyFrames: 0 } };
  const errors = [], start = performance.now();
  try {
    if (spec.recut) {
      for (let index = 0; index < 4; index++) {
        result.taps.push(await tapNext(lab, bodies, index));
        if (index < 3) simulate(lab, 1.5);
      }
    } else assert.equal(await lab.fractureAll(), true, lab.getStats().message);
    result.initialCount = bodies().length;
    assert.ok(result.initialCount > 1, 'Fixture must produce actual fragments');
    const initialIds = new Set(bodies().map(body => body.userData.pieceId));
    const radii = new Map(lab.getMeshes().map(mesh => {
      mesh.geometry.computeBoundingSphere();
      return [mesh.uuid, mesh.geometry.boundingSphere.radius + mesh.geometry.boundingSphere.center.length()];
    }));
    const previous = new Map(bodies().map(body => [body.handle, pose(body)]));
    for (let frame = 1; frame <= (settleSeconds + observationSeconds) * 60; frame++) {
      lab.step(1 / 60);
      const current = bodies(), seconds = frame / 60;
      let moved = false;
      if (result.firstAllRestingSeconds === null && current.length && current.every(resting)) result.firstAllRestingSeconds = seconds;
      for (const body of current) {
        const next = pose(body), prior = previous.get(body.handle);
        assert.ok(next.p.concat(next.q).every(Number.isFinite), 'Fragment poses must remain finite');
        if (prior) {
          const change = movement(next, prior);
          if (change.distance > 1e-6 || change.angle > 1e-5) moved = true;
          if (seconds > settleSeconds) {
            result.lateWindow.maxTranslationPerStep = Math.max(result.lateWindow.maxTranslationPerStep, change.distance);
            result.lateWindow.maxRotationPerStep = Math.max(result.lateWindow.maxRotationPerStep, change.angle);
            result.lateWindow.totalTranslationTravel += change.distance;
            const surfaceMotion = change.distance + radii.get(body.userData.pieceId) * change.angle;
            result.lateWindow.maxSurfaceMotionPerStep = Math.max(result.lateWindow.maxSurfaceMotionPerStep, surfaceMotion);
            result.lateWindow.totalSurfaceMotion += surfaceMotion;
          }
        }
        if (seconds > settleSeconds && !resting(body)) result.lateWindow.awakeBodyFrames++;
        previous.set(body.handle, next);
      }
      if (moved) {
        result.lastVisibleMotionSeconds = seconds;
        if (seconds > settleSeconds) result.lateWindow.movingFrames++;
      }
      if (frame % 60 === 0) result.samples.push({ seconds, fragments: current.length, resting: current.filter(resting).length });
    }
    const final = result.samples.at(-1);
    result.minimumFinalColliderY = Infinity;
    for (const body of bodies()) {
      const p = body.translation(), q = body.rotation(), vertices = body.collider(0).shape.vertices;
      const rowX = 2 * (q.x * q.y + q.w * q.z), rowY = 1 - 2 * (q.x * q.x + q.z * q.z), rowZ = 2 * (q.y * q.z - q.w * q.x);
      for (let index = 0; index < vertices.length; index += 3) result.minimumFinalColliderY = Math.min(result.minimumFinalColliderY, p.y + rowX * vertices[index] + rowY * vertices[index + 1] + rowZ * vertices[index + 2]);
    }
    if (result.minimumFinalColliderY < -.02) errors.push(`A settled collider penetrates the floor: ${result.minimumFinalColliderY}`);
    result.lostIds = [...initialIds].filter(id => !bodies().some(body => body.userData.pieceId === id));
    result.addedIds = bodies().map(body => body.userData.pieceId).filter(id => !initialIds.has(id));
    if (result.lostIds.length || result.addedIds.length) errors.push('Fragment identities changed during settlement');
    if (final.fragments !== result.initialCount) errors.push(`Lost ${result.initialCount - final.fragments} fragments during an ordinary launch`);
    if (result.firstAllRestingSeconds === null || result.firstAllRestingSeconds > settleSeconds) errors.push(`Not fully at rest by ${settleSeconds}s; first rest=${result.firstAllRestingSeconds}`);
    if (result.lateWindow.totalTranslationTravel !== 0 || result.lateWindow.maxRotationPerStep !== 0) errors.push(`Continued translation/rotation during ${settleSeconds}–${settleSeconds + observationSeconds}s`);
    if (result.lateWindow.awakeBodyFrames !== 0) errors.push(`Settled bodies repeatedly awake: ${result.lateWindow.awakeBodyFrames} body frames`);
  } catch (error) { errors.push(error.stack); }
  finally { lab.dispose(); disposeAsset(source); source.removeFromParent(); }
  result.simulationMs = Math.round(performance.now() - start); result.failures = errors; report.cases.push(result);
  if (errors.length) report.failures.push({ id: spec.id, errors });
  console.log(JSON.stringify({ case: spec.id, fragments: result.initialCount, firstAllRestingSeconds: result.firstAllRestingSeconds, lastVisibleMotionSeconds: result.lastVisibleMotionSeconds, lateWindow: result.lateWindow, failures: errors }));
  await fs.writeFile(path.join(output, measurementOnly ? 'global-measurement.json' : 'global-report.json'), JSON.stringify(report, null, 2));
}
try {
  const selected = specs.filter(spec => !filter || new RegExp(filter).test(spec.id));
  assert.ok(selected.length, `No fixtures match ${filter}`);
  for (const spec of selected) await run(spec);
  assert.equal(await sourceHash(), report.sourceHash, 'A verification run must use one fracture runtime revision');
  report.passed = report.failures.length === 0;
  console.log(JSON.stringify({ passed: report.passed, cases: report.cases.length, failures: report.failures.length, settleSeconds, output }));
  if (!measurementOnly) assert.equal(report.failures.length, 0, `${report.failures.length} fracture fixtures failed global settling`);
} finally {
  RAPIER.World.prototype.createRigidBody = nativeCreate; console.warn = nativeWarn; outer.dispose(); inner.dispose();
  await fs.writeFile(path.join(output, measurementOnly ? 'global-measurement.json' : 'global-report.json'), JSON.stringify(report, null, 2));
}
