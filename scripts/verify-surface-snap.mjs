import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createSurfaceSnapSession } from '../src/surface-snap.js';

const checks = [];
const Y = new THREE.Vector3(0, 1, 0);
const close = (actual, expected, label, tolerance = 2e-4) => assert(Math.abs(actual - expected) < tolerance, `${label}: expected ${expected}, got ${actual}`);
const vector = (actual, expected, label, tolerance) => actual.toArray().forEach((value, i) => close(value, expected[i], `${label}[${i}]`, tolerance));
function box(size = [1, 1, 1], position = [0, .5, 0]) {
  const group = new THREE.Group(); group.add(new THREE.Mesh(new THREE.BoxGeometry(...size))); group.position.fromArray(position); return group;
}
function result(object, targets = [], options = {}) {
  const before = { position: object.position.toArray(), scale: object.scale.toArray(), quaternion: object.quaternion.toArray() };
  const session = createSurfaceSnapSession({ object, targets, distance: .3 });
  try {
    const hit = session.snap(options);
    assert.deepEqual(object.position.toArray(), before.position); assert.deepEqual(object.scale.toArray(), before.scale); assert.deepEqual(object.quaternion.toArray(), before.quaternion);
    assert(hit.offset.toArray().every(Number.isFinite)); return hit;
  } finally { session.dispose(); }
}
function check(name, fn) { fn(); checks.push(name); }

check('Ground uses transformed nested mesh bottom and preserves pose', () => {
  const selected = box([2, 1, .8], [2.137, 2, -1.423]);
  selected.rotation.set(.21, .46, .33); selected.scale.set(1.4, .7, 1.8);
  const child = selected.children[0]; child.position.set(.2, -.3, .4); child.rotation.set(.07, .13, -.16);
  selected.updateWorldMatrix(true, true);
  const bounds = new THREE.Box3().setFromObject(selected, true);
  const hit = result(selected, [], { axes: 'XZ', projectToGround: true });
  close(hit.offset.y, -bounds.min.y, 'Actual nested bottom', 1e-5); close(hit.offset.x, 0, 'No grid quantization X'); close(hit.offset.z, 0, 'No grid quantization Z'); assert.equal(hit.kind, 'ground');
});
check('Repeated snap reads current transform without rebuilding', () => {
  const selected = box(), session = createSurfaceSnapSession({ object: selected });
  try {
    selected.position.y = 1.71; close(session.snap({ axes: 'XZ', projectToGround: true }).offset.y, -1.21, 'Moved object');
    selected.rotation.z = Math.PI / 4; close(session.snap({ axes: 'XZ', projectToGround: true }).offset.y, Math.SQRT1_2 - 1.71, 'Rotated object');
  } finally { session.dispose(); }
  vector(session.snap().offset, [0, 0, 0], 'Disposed session');
});
check('Stacking finds target mesh top while collider view hides source mesh', () => {
  const selected = box([1, 1, 1], [.17, 1.5, .09]), target = box([3, 1, 3], [0, .5, 0]);
  target.children[0].visible = false;
  const hit = result(selected, [target], { axes: 'XZ', projectToGround: true });
  close(hit.offset.y, 0, 'Stacked contact'); assert.equal(hit.kind, 'surface'); assert.equal(hit.target, target);
  selected.position.y = 1.7; close(result(selected, [target], { axes: 'Y' }).offset.y, -.2, 'Nearby vertical support');
});
check('Horizontal drag settles onto support below, preserving free horizontal coordinates', () => {
  const selected = box([1, 1, 1], [.1327, 4, -.231]), target = box([3, 1, 3]);
  vector(result(selected, [target], { axes: 'XZ', projectToGround: true }).offset, [0, -2.5, 0], 'Drop to support');
});
check('Near side surfaces join without getting lifted onto an edge or snapping to a grid', () => {
  const target = box([2, 2, 2], [0, 1, 0]), selected = box([1, 1, 1], [1.7, .5, .123]);
  const hit = result(selected, [target], { axes: 'XZ', projectToGround: true });
  vector(hit.offset, [-.2, 0, 0], 'Side join'); assert.equal(hit.kind, 'edge');
  selected.position.x = 1.4; vector(result(selected, [target], { axes: 'X', projectToGround: true }).offset, [.1, 0, 0], 'Shallow side overlap');
});
check('No magnets reach objects outside snap distance', () => {
  const selected = box([1, 1, 1], [2.1, .5, 0]), target = box([2, 2, 2], [0, 1, 0]);
  vector(result(selected, [target], { axes: 'X', projectToGround: true }).offset, [0, 0, 0], 'Separated side');
});
check('Tilted target sides use actual mesh planes, including local axis constraints', () => {
  const angle = Math.PI / 4, target = box([2, 2, 2], [0, 1, 0]), selected = box();
  target.rotation.y = angle; selected.rotation.y = angle;
  const direction = new THREE.Vector3(1, 0, 0).applyAxisAngle(Y, angle);
  selected.position.copy(direction.clone().multiplyScalar(1.7)); selected.position.y = .5;
  const hit = result(selected, [target], { axes: 'X', space: 'local', quaternion: selected.quaternion, projectToGround: true });
  close(hit.offset.dot(direction), -.2, 'Rotated face join'); close(new THREE.Vector3().crossVectors(hit.offset, direction).length(), 0, 'Local axis retained'); close(hit.offset.y, 0, 'No false stacking');
});
check('Angled side resolves deepest sampled overlap instead of a glancing zero gap', () => {
  const target = box([2, 2, 2], [0, 1, 0]); target.rotation.y = .2;
  const selected = box([1, 1, 1], [1.52, .5, 0]);
  const hit = result(selected, [target], { axes: 'X', projectToGround: true });
  const nearestExteriorX = (1 + Math.sin(.2) * .5) / Math.cos(.2);
  close(selected.position.x - .5 + hit.offset.x, nearestExteriorX, 'No sampled angled face penetration', 3e-4);
  close(hit.offset.y, 0, 'Side contact remains on ground');
});
check('Dense rotated geometry has exact ground contact beyond the bounded probe sample', () => {
  const selected = new THREE.Group(); selected.add(new THREE.Mesh(new THREE.SphereGeometry(1, 100, 70)));
  selected.position.set(.17, 3.14, -.21); selected.rotation.set(.317, .753, -.499); selected.scale.set(.43, 1.57, 2.1);
  const minimum = new THREE.Box3().setFromObject(selected, true).min.y;
  close(result(selected, [], { axes: 'XZ', projectToGround: true }).offset.y, -minimum, 'Exact dense world extreme', 1e-9);
});
check('Ramp support follows real slope, not AABB top', () => {
  const ramp = box([4, .2, 4], [0, 1, 0]); ramp.rotation.z = Math.PI / 6;
  const selected = box([.8, .6, .8], [-.7, 2.5, .13]);
  const hit = result(selected, [ramp], { axes: 'XZ', projectToGround: true });
  // Plane of the top face is y = 1 + x*tan(angle) + halfThickness/cos(angle).
  const expectedTop = 1 + (-.3) * Math.tan(Math.PI / 6) + .1 / Math.cos(Math.PI / 6);
  close(selected.position.y - .3 + hit.offset.y, expectedTop, 'Box highest supporting corner', 5e-4);
  assert.equal(hit.kind, 'surface');
});
check('Empty arch gap does not act like a solid bounding box', () => {
  const arch = new THREE.Group();
  arch.add(box([.5, 2, 1], [-1.25, 1, 0]), box([.5, 2, 1], [1.25, 1, 0]), box([3, .4, 1], [0, 2.2, 0]));
  const selected = box([.5, .5, .5], [0, .35, 0]);
  const hit = result(selected, [arch], { axes: 'XZ', projectToGround: true });
  close(hit.offset.y, -.1, 'Ground through arch opening'); assert.equal(hit.kind, 'ground');
});
check('Raised or bridging selected geometry uses its actual low surfaces', () => {
  const selected = new THREE.Group(); selected.position.y = 3;
  selected.add(box([.4, 1, .6], [-1, .5, 0]), box([.4, 1, .6], [1, .5, 0]), box([2.4, .3, .6], [0, 1.15, 0]));
  const obstacle = box([.5, .5, .5], [0, .25, 0]);
  const hit = result(selected, [obstacle], { axes: 'XZ', projectToGround: true });
  close(hit.offset.y, -3, 'Legs reach ground with low obstacle between');
});
check('Vertical drags can lift clear of ground and objects', () => {
  const selected = box([1, 1, 1], [0, 4, 0]), target = box([3, 1, 3]);
  vector(result(selected, [target], { axes: 'Y' }).offset, [0, 0, 0], 'High vertical translation remains free');
  selected.position.y = .7; close(result(selected, [], { axes: 'Y' }).offset.y, -.2, 'Nearby ground');
  selected.position.y = .6; vector(result(selected, [], { axes: 'X' }).offset, [0, 0, 0], 'Horizontal axis does not add Y without projection option');
});
check('Tilted local-axis vertical magnets remain on the selected handle', () => {
  const selected = box([.4, .4, .4], [0, .4, 0]); selected.rotation.z = Math.PI / 4;
  const axis = Y.clone().applyQuaternion(selected.quaternion), hit = result(selected, [], { axes: 'Y', space: 'local', quaternion: selected.quaternion });
  close(new THREE.Vector3().crossVectors(hit.offset, axis).length(), 0, 'Local Y constrained');
  close(new THREE.Box3().setFromObject(selected, true).min.y + hit.offset.y, 0, 'Local Y reaches floor');
});
check('Almost horizontal local axes do not amplify a nearby floor into a long jump', () => {
  const selected = box([.4, .4, .4], [0, 1, 0]); selected.rotation.z = Math.acos(.1);
  selected.position.y += .2 - new THREE.Box3().setFromObject(selected, true).min.y;
  vector(result(selected, [], { axes: 'Y', space: 'local', quaternion: selected.quaternion }).offset, [0, 0, 0], 'Travel would exceed magnet distance');
});
check('Targets exclude self and descendants and tolerate empty geometry', () => {
  const selected = box(); vector(result(selected, [selected, selected.children[0]], { axes: 'XZ', projectToGround: true }).offset, [0, 0, 0], 'No self magnets');
  vector(result(new THREE.Group(), [], { axes: 'XYZ' }).offset, [0, 0, 0], 'Empty content');
  const collapsed = box(); collapsed.scale.x = 0; vector(result(collapsed).offset, [0, 0, 0], 'Singular transforms');
});
console.log(JSON.stringify({ passed: true, checks }, null, 2));
