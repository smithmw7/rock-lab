import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { buildAsset, disposeAsset } from '../src/geometry.js';
import { WORKSHOP_SHAPES, WORKSHOP_GROUPS, WORKSHOP_ENUMS, sanitizeWorkshopOptions, sampleLatheProfile } from '../src/workshop-geometry.js';

const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
let cases = 0, meshes = 0, auditedEdges = 0, minVolume = Infinity;
const signature = group => {
  const digest = createHash('sha256');
  for (const mesh of group.children) digest.update(Buffer.from(mesh.geometry.attributes.position.array.buffer));
  return digest.digest('hex');
};
function validate(options) {
  const group = buildAsset(options, material);
  try {
    assert.equal(group.userData.connectivity.unsupported.length, 0, `${options.shape}: unsupported assembly`);
    const bounds = new THREE.Box3().setFromObject(group);
    assert.ok(Math.abs(bounds.min.y) < .002, `${options.shape}: floating base`);
    for (const mesh of group.children) {
      const geometry = mesh.geometry, position = geometry.attributes.position;
      const label = `${options.shape}/${mesh.name}/${JSON.stringify(options)}`;
      assert.ok(['primary', 'handle', 'trim'].includes(mesh.userData.materialSlot), `${label}: lost material slot`);
      assert.equal(geometry.index, null);
      assert.equal(geometry.groups.length, 0, `${label}: intact surfaces must all use the exterior material`);
      for (const name of ['normal', 'uv', 'color', 'aFaceTone', 'aBevel', 'aRockPosition']) {
        assert.equal(geometry.attributes[name]?.count, position.count, `${label}: missing ${name}`);
        assert.ok(geometry.attributes[name].array.every(Number.isFinite));
      }
      const keys = Array.from({ length: position.count }, (_, i) => [position.getX(i), position.getY(i), position.getZ(i)].map(value => Math.round(value * 1e6)).join(','));
      const edges = new Map(), a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
      let volume = 0;
      for (let triangle = 0; triangle < position.count; triangle += 3) {
        a.fromBufferAttribute(position, triangle); b.fromBufferAttribute(position, triangle + 1); c.fromBufferAttribute(position, triangle + 2);
        assert.ok(b.clone().sub(a).cross(c.clone().sub(a)).lengthSq() > 1e-14, `${label}: degenerate face`);
        volume += a.dot(b.cross(c)) / 6;
        for (let corner = 0; corner < 3; corner++) {
          const from = keys[triangle + corner], to = keys[triangle + (corner + 1) % 3];
          assert.notEqual(from, to, `${label}: collapsed edge`);
          const key = from < to ? `${from}|${to}` : `${to}|${from}`;
          const record = edges.get(key) || { count: 0, direction: 0 };
          record.count++; record.direction += from < to ? 1 : -1; edges.set(key, record);
        }
      }
      assert.ok(volume > 1e-6, `${label}: nonpositive solid volume ${volume}`);
      minVolume = Math.min(minVolume, volume);
      for (const [edge, record] of edges) {
        assert.equal(record.count, 2, `${label}: boundary or nonmanifold edge ${edge}`);
        assert.equal(record.direction, 0, `${label}: inconsistent winding ${edge}`);
      }
      auditedEdges += edges.size; meshes++;
    }
    cases++;
    return signature(group);
  } finally { disposeAsset(group); }
}
try {
  for (const shape of WORKSHOP_SHAPES) for (const level of [0, 1]) for (const displacement of [0, 1]) {
    validate({ shape, seed: 19423, facets: level, roughness: level, bevel: level, displacement, geometryNoiseScale: 8 });
  }
  for (const hammerHead of WORKSHOP_ENUMS.hammerHead) for (const scale of [.65, 1.5]) {
    validate({ shape: 'hammer', hammerHead, headScale: scale, handleLength: 2.15 - scale, bevel: 1, roughness: 1, displacement: 1 });
  }
  for (const knifeBlade of WORKSHOP_ENUMS.knifeBlade) for (const scale of [.65, 1.5]) {
    validate({ shape: 'knife', knifeBlade, headScale: scale, handleLength: scale, bevel: 1, roughness: 1, displacement: 1 });
  }
  for (const shape of WORKSHOP_GROUPS.find(group => group.id === 'pottery').shapes) {
    for (const level of [0, 1]) {
      const input = { shape, seed: 17, wallThickness: level ? .2 : .04, latheHeight: level ? .65 : 1.6, latheWidth: level ? .6 : 1.5, latheBelly: level ? .6 : 1.5, latheNeck: level ? .5 : 1.5, latheLip: level ? .6 : 1.4, latheSegments: level ? 64 : 8, profileSmoothness: level, latheProfile: level ? [.18, 1.4, .18, 1.4, .18, 1.4] : [1.4, .18, 1.4, .18, 1.4, .18], displacement: 1, bevel: level, roughness: level };
      validate(input);
      const profile = sampleLatheProfile(shape, input);
      assert.equal(profile.controls.length, 6);
      for (let i = 0; i < profile.points.length; i++) {
        assert.ok(profile.points[i].radius >= profile.wallThickness + .0649);
        if (i) assert.ok(profile.points[i].y > profile.points[i - 1].y);
      }
      // Rays enter the open center and meet the actual cavity floor below the
      // rim. Side walls remain solid; no convex proxy is used for this audit.
      const group = buildAsset({ ...input, displacement: 0 }, material), bounds = new THREE.Box3().setFromObject(group);
      const ray = new THREE.Raycaster(new THREE.Vector3(0, bounds.max.y + 1, 0), new THREE.Vector3(0, -1, 0));
      const hits = ray.intersectObject(group, true);
      assert.ok(hits.length > 0, `${shape}: missing closed bottom`);
      assert.ok(hits[0].point.y < bounds.max.y - .025, `${shape}: capped opening`);
      disposeAsset(group);
    }
  }
  for (const shape of ['metalTube', 'metalRing', 'gear']) {
    const group = buildAsset({ shape }, material), ray = new THREE.Raycaster(new THREE.Vector3(0, 5, 0), new THREE.Vector3(0, -1, 0));
    assert.equal(ray.intersectObject(group, true).length, 0, `${shape}: central bore was filled`);
    disposeAsset(group);
  }
  const changedA = validate({ shape: 'vase', latheProfile: [1, 1, 1, 1, 1, 1] });
  const changedB = validate({ shape: 'vase', latheProfile: [1, 1, 1.3, 1, 1, 1] });
  assert.notEqual(changedA, changedB, 'Editing the spline must change the actual mesh');
  assert.deepEqual(sanitizeWorkshopOptions({ hammerHead: 'unknown', latheSegments: 999, latheProfile: [NaN, -1, 9, 1, 1, 1] }).latheProfile, [1, .18, 1.4, 1, 1, 1]);
  console.log(JSON.stringify({ passed: true, shapes: WORKSHOP_SHAPES.size, cases, meshes, auditedEdges, minVolume, checks: ['Every welded edge has two oppositely wound triangles', 'Positive signed volumes', 'Independent composite material slots and local grain coordinates', 'Minimum and maximum wear, bevel, displacement, detail', 'Every hammer and knife variation at extreme proportions', 'Alternating extreme spline controls, wall thickness, and segment counts', 'Open vessel interiors and closed cavity floors', 'Open tube, ring, and gear bores', 'Spline edits change actual geometry'] }, null, 2));
} finally { material.dispose(); }
