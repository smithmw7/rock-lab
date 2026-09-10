import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { buildAsset, disposeAsset, SHAPE_GROUPS } from '../src/geometry.js';
import { createFractureLab, sanitizeFractureOptions } from '../src/fracture.js';

const scene = new THREE.Scene(), outer = new THREE.MeshStandardMaterial(), inner = new THREE.MeshStandardMaterial();
const events = [];
const lab = await createFractureLab({ scene, outerMaterial: outer, innerMaterial: inner, onEvent: event => events.push(event) });
let source = null, cases = 0;
const hash = meshes => {
  const result = createHash('sha256');
  for (const mesh of meshes) { result.update(Buffer.from(mesh.geometry.attributes.position.array.buffer)); result.update(JSON.stringify(mesh.position.toArray())); }
  return result.digest('hex');
};
const load = (shape, extra = {}) => {
  lab.setEnabled(false);
  if (source) { source.removeFromParent(); disposeAsset(source); }
  source = buildAsset({ shape, seed: 19423, facets: 0.35, roughness: 0.25, bevel: 0.4, ...extra }, outer);
  scene.add(source); lab.setSource(source); lab.setEnabled(true);
  assert.equal(source.visible, false);
};
function validateFragments() {
  const meshes = lab.getMeshes();
  assert(meshes.length >= 2);
  for (const mesh of meshes) {
    const geometry = mesh.geometry, position = geometry.attributes.position;
    for (const name of ['position', 'normal', 'uv', 'color', 'aFaceTone', 'aBevel', 'aRockPosition']) {
      const attribute = geometry.attributes[name]; assert(attribute, `Missing ${name}`); assert.equal(attribute.count, position.count);
      for (const value of attribute.array) assert(Number.isFinite(value), `Invalid ${name}`);
    }
    assert(mesh.position.toArray().every(Number.isFinite));
    assert(mesh.quaternion.toArray().every(Number.isFinite));
    assert(geometry.groups.some(group => group.materialIndex === 1 && group.count > 0));
    assert.equal(mesh.material[0], outer); assert.equal(mesh.material[1], inner);
  }
  assert(lab.getStats().meshes <= 120);
}

for (const shape of SHAPE_GROUPS.flatMap(group => group.shapes)) {
  load(shape);
  lab.update({ method: 'voronoi', fragmentCount: 3, impactEnabled: false, seed: 701, maxGeneration: 2, maxFragments: 120, impulse: 0.5 });
  assert.equal(await lab.fractureAll(), true, `${shape}: ${lab.getStats().message}`);
  validateFragments();
  for (let i = 0; i < 6; i++) lab.step(1 / 60);
  validateFragments();
  lab.reset(); assert.equal(lab.getStats().fragments, 0); assert.equal(lab.getStats().meshes, source.children.length);
  cases++;
}

load('block', { roughness: 0, bevel: 0.4 });
lab.update({ method: 'simple', fragmentCount: 4, fracturePlanes: { x: true, y: false, z: true }, seed: 734, impactEnabled: false });
assert(await lab.fractureAll()); validateFragments();
const deterministic = hash(lab.getMeshes()); lab.reset(); assert(await lab.fractureAll()); assert.equal(hash(lab.getMeshes()), deterministic);
cases++;

load('sphere', { roughness: 0 });
lab.update({ method: 'voronoi', mode: '2.5D', fragmentCount: 4, projectionAxis: 'z', projectionNormal: [1, 0.5, 0], useApproximation: true, approximationNeighborCount: 4, impactEnabled: true, impactSource: 'custom', impactPoint: [0, 0, 0], impactRadius: 0.8 });
assert(await lab.fractureAll()); validateFragments(); cases++;

load('block', { roughness: 0, bevel: 0 });
const center = new THREE.Box3().setFromObject(source).getCenter(new THREE.Vector3());
lab.update({ method: 'slice', sliceNormal: [0, 1, 0], sliceOrigin: center.toArray(), sliceSpace: 'world', innerUVScale: [2, 3], innerUVOffset: [0.1, 0.2], maxGeneration: 2 });
assert(await lab.fractureAll()); assert.equal(lab.getStats().meshes, 2); validateFragments();
lab.setPaused(true); const still = hash(lab.getMeshes()); for (let i = 0; i < 30; i++) lab.step(1 / 60); assert.equal(hash(lab.getMeshes()), still);
lab.setPaused(false); for (let i = 0; i < 30; i++) lab.step(1 / 60); assert.notEqual(hash(lab.getMeshes()), still); validateFragments();
lab.update({ method: 'simple', fragmentCount: 2, fracturePlanes: { x: true, y: true, z: true } });
assert(await lab.fractureAll()); assert.equal(lab.getStats().generation, 2); validateFragments();
const atLimit = hash(lab.getMeshes()); assert.equal(await lab.fractureAll(), false); assert.equal(hash(lab.getMeshes()), atLimit); cases++;

load('block', { roughness: 0 });
lab.update({ method: 'slice', sliceOrigin: [0, 100, 0], sliceNormal: [0, 1, 0], sliceSpace: 'world' });
const beforeFailure = hash(lab.getMeshes()); assert.equal(await lab.fractureAll(), false); assert.equal(hash(lab.getMeshes()), beforeFailure);
assert.equal(lab.getStats().fragments, 0); assert.equal(source.visible, false); cases++;

// A horizontal cut through one wall row misses the first rows traversed.
// Those misses must not stop the remaining intersecting bricks being sliced.
load('wall', { roughness: 0, bevel: 0 });
const wallBoxes = lab.getMeshes().map(mesh => new THREE.Box3().setFromObject(mesh));
const sliceHeight = wallBoxes.map(box => box.getCenter(new THREE.Vector3()).y).sort((a, b) => a - b)[Math.floor(wallBoxes.length / 2)];
const intersected = wallBoxes.filter(box => box.min.y < sliceHeight && box.max.y > sliceHeight).length;
assert(intersected > 0 && intersected < wallBoxes.length);
lab.update({ method: 'slice', sliceOrigin: [0, sliceHeight, 0], sliceNormal: [0, 1, 0], sliceSpace: 'world', impulse: 0 });
assert(await lab.fractureAll(), lab.getStats().message);
assert.equal(lab.getStats().meshes, wallBoxes.length + intersected);
assert.equal(lab.getStats().fragments, intersected * 2);
lab.reset();
const wallBeforeMiss = hash(lab.getMeshes());
lab.update({ sliceOrigin: [0, 100, 0] });
assert.equal(await lab.fractureAll(), false);
assert.equal(hash(lab.getMeshes()), wallBeforeMiss);
assert.equal(lab.getStats().meshes, wallBoxes.length);
assert.equal(lab.getStats().fragments, 0);
assert.match(lab.getStats().message, /missed every eligible piece/);
cases++;

load('block', { roughness: 0 });
lab.update({ method: 'voronoi', mode: '3D', projectionNormal: [0, 0, 0], useApproximation: false, seedPoints: [[-0.5, 0, 0], [0.5, 0, 0]], fragmentCount: 8, impactEnabled: false });
assert(await lab.fractureAll()); assert.equal(lab.getStats().meshes, 2); validateFragments(); cases++;

load('block', { roughness: 0 });
lab.update({ method: 'simple', fragmentCount: 3, seedPoints: [] });
const target = lab.getMeshes()[0]; target.geometry.computeBoundingBox();
const targetCenter = target.geometry.boundingBox.getCenter(new THREE.Vector3()).applyMatrix4(target.matrixWorld);
const raycaster = new THREE.Raycaster(targetCenter.clone().add(new THREE.Vector3(0, 0, 8)), new THREE.Vector3(0, 0, -1));
assert(await lab.tap(raycaster)); validateFragments(); cases++;

// Real break notifications occur once per committed source piece and never
// for intact creation, plane misses, validation failures, or cancelled work.
load('block', { roughness: 0, bevel: 0 });
events.length = 0;
for (let i = 0; i < 30; i++) lab.step(1 / 60);
assert.deepEqual(events, [], 'Intact fixed sources must be silent');
const breakSourceId = lab.getMeshes()[0].uuid;
lab.update({ method: 'simple', fragmentCount: 3, seedPoints: [], impulse: 0, gravity: 9.81, friction: 0.75, restitution: 0.1, fracturePlanes: { x: true, y: true, z: true } });
assert(await lab.fractureAll());
assert.equal(events.length, 1); assert.equal(events[0].type, 'break'); assert.equal(events[0].pieceId, breakSourceId);
assert.equal(events[0].fragmentCount, lab.getStats().fragments);
assert(Object.values(events[0].position).every(Number.isFinite));
events.length = 0; lab.reset(); assert.deepEqual(events, [], 'Reset does not play an event of its own');

lab.update({ method: 'slice', sliceOrigin: [0, 100, 0], sliceNormal: [0, 1, 0], sliceSpace: 'world' });
assert.equal(await lab.fractureAll(), false); assert.deepEqual(events, [], 'A missed cut must be silent');
lab.update({ method: 'simple', fracturePlanes: { x: false, y: false, z: false } });
assert.equal(await lab.fractureAll(), false); assert.deepEqual(events, [], 'Invalid fracture options must be silent');
lab.update({ fracturePlanes: { x: true, y: true, z: true } });
const cancelled = lab.fractureAll(); lab.reset();
assert.equal(await cancelled, false); assert.deepEqual(events, [], 'Cancelled fracture work must not emit a break');
assert.equal(lab.getStats().fragments, 0); cases++;

// Lift a real source, fracture it, and let the solver generate actual floor
// contacts. No synthetic event injection or collision callback mocking.
lab.setEnabled(false); source.position.y = 2.5; source.updateMatrixWorld(true); lab.setSource(source); lab.setEnabled(true);
events.length = 0;
assert(await lab.fractureAll());
const fragmentIds = new Set(lab.getMeshes().map(mesh => mesh.uuid));
events.length = 0;
let simulationFrame = 0;
const collisionFrames = [];
for (; simulationFrame < 360; simulationFrame++) {
  const before = events.length; lab.step(1 / 60);
  const emitted = events.slice(before);
  assert(emitted.length <= 2, 'A render step must not dispatch a contact storm');
  for (const event of emitted) {
    assert.equal(event.type, 'collision'); assert(fragmentIds.has(event.pieceId));
    assert(event.strength > 0 && event.strength <= 1); assert(Object.values(event.position).every(Number.isFinite));
    collisionFrames.push({ frame: simulationFrame, pieceId: event.pieceId });
  }
}
assert(events.length > 0, 'Falling real debris must produce collision events');
for (const pieceId of fragmentIds) {
  const frames = collisionFrames.filter(event => event.pieceId === pieceId).map(event => event.frame);
  for (let i = 1; i < frames.length; i++) assert(frames[i] - frames[i - 1] >= 13, 'Per-piece contact cooldown must suppress repeated chatter');
}
for (const impact of collisionFrames) assert(collisionFrames.filter(other => other.frame >= impact.frame && other.frame - impact.frame <= 10).length <= 3, 'Global contact budget must bound simultaneous debris sounds');
events.length = 0;
for (let i = 0; i < 240; i++) lab.step(1 / 60);
assert.deepEqual(events, [], 'Settled debris must not keep emitting contact sounds');
lab.reset();
for (let i = 0; i < 30; i++) lab.step(1 / 60);
assert.deepEqual(events, [], 'Reset must discard any queued contact notifications');
lab.setEnabled(false); lab.step(1); assert.deepEqual(events, [], 'Disabled preview must remain silent');
cases++;

// Debris also reports impacts against another intact mesh, not only the floor.
// A wide fixed platform catches a small fractured cube one unit above y=0.
source.removeFromParent(); disposeAsset(source);
source = new THREE.Group();
const platform = new THREE.Mesh(new THREE.BoxGeometry(6, 1, 6), outer); platform.position.y = 0.5;
const fallingCube = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 0.8), outer); fallingCube.position.y = 3;
source.add(platform, fallingCube); scene.add(source); lab.setSource(source); lab.setEnabled(true);
events.length = 0;
const platformRay = new THREE.Raycaster(new THREE.Vector3(0, 3, 8), new THREE.Vector3(0, 0, -1));
assert(await lab.tap(platformRay));
assert.equal(lab.getMeshes().filter(mesh => mesh.userData.generation === 0).length, 1);
events.length = 0;
for (let i = 0; i < 180; i++) lab.step(1 / 60);
assert(events.some(event => event.type === 'collision' && event.position.y > 1), 'Debris must report real impacts on an intact elevated platform');
lab.reset(); events.length = 0; lab.setEnabled(false); cases++;

let disposedSharedMaterial = false; outer.addEventListener('dispose', () => { disposedSharedMaterial = true; });
lab.setEnabled(false); assert.equal(source.visible, true); assert.equal(lab.getStats().meshes, 0);
lab.dispose(); assert.equal(disposedSharedMaterial, false); assert.equal(source.visible, true);
lab.step(1); lab.dispose(); assert.deepEqual(events, [], 'Disposed previews must neither dispatch stale events nor free the queue twice');
disposeAsset(source); outer.dispose(); inner.dispose();
const sanitized = sanitizeFractureOptions({ fragmentCount: 9999, maxFragments: 9999, sliceNormal: [0, 0, 0], innerUVScale: [0, NaN] });
assert.equal(sanitized.fragmentCount, 48); assert.equal(sanitized.maxFragments, 160); assert.deepEqual(sanitized.sliceNormal, [0, 1, 0]);
console.log(JSON.stringify({ passed: true, cases, shapes: 18, collisionEvents: collisionFrames.length, checks: ['real Pinata per-piece fracture', 'Voronoi/simple/slice', 'seeded determinism', '2.5D/custom normal/approximation', 'custom seed points', 'actual ray hit', 'Rapier stepping and pause', 'refracture limit', 'atomic failure', 'reset and source visibility', 'shared material ownership', 'shader attribute recovery', 'committed break events', 'silent failed and cancelled fracture', 'real solver contact events', 'contact cooldown and settled silence', 'queue reset and disable cleanup'] }, null, 2));
