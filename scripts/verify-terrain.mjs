import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { buildAsset, disposeAsset } from '../src/geometry.js';
import { TERRAIN_SHAPES } from '../src/terrain-geometry.js';
import { createFractureLab } from '../src/fracture.js';

const material = new THREE.MeshBasicMaterial(), shapes = [...TERRAIN_SHAPES];
let cases = 0, meshes = 0, auditedEdges = 0, fractureCases = 0, maxTriangles = 0;
const hash = group => {
  const digest = createHash('sha256');
  for (const mesh of group.children) digest.update(Buffer.from(mesh.geometry.attributes.position.array.buffer));
  return digest.digest('hex');
};
function validate(input) {
  const group = buildAsset(input, material), label = JSON.stringify(input);
  try {
    const bounds = new THREE.Box3().setFromObject(group), size = bounds.getSize(new THREE.Vector3());
    assert.ok(Math.abs(bounds.min.y) < .002, `${label}: floating ground`);
    assert.ok(size.x <= 3.601 && size.y <= 3.401 && size.z <= 3.201, `${label}: bounds`);
    assert.equal(group.userData.connectivity.unsupported.length, 0, `${label}: unsupported stone`);
    assert.ok(group.userData.triangles <= 36000, `${label}: triangle budget`);
    maxTriangles = Math.max(maxTriangles, group.userData.triangles);
    for (const mesh of group.children) {
      const geometry = mesh.geometry, positions = geometry.attributes.position, keys = [], edges = new Map();
      assert.equal(geometry.index, null);
      for (const name of ['position', 'normal', 'uv', 'color', 'aFaceTone', 'aBevel']) {
        assert.equal(geometry.attributes[name]?.count, positions.count, `${label}/${mesh.name}: missing ${name}`);
        assert.ok(geometry.attributes[name].array.every(Number.isFinite));
      }
      for (let i = 0; i < positions.count; i++) keys.push([positions.getX(i), positions.getY(i), positions.getZ(i)].map(value => Math.round(value * 1e6)).join(','));
      let volume = 0;
      const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
      for (let triangle = 0; triangle < positions.count; triangle += 3) {
        a.fromBufferAttribute(positions, triangle); b.fromBufferAttribute(positions, triangle + 1); c.fromBufferAttribute(positions, triangle + 2);
        const face = b.clone().sub(a).cross(c.clone().sub(a));
        assert.ok(face.lengthSq() > 1e-14, `${label}/${mesh.name}: degenerate triangle`);
        n.fromBufferAttribute(geometry.attributes.normal, triangle);
        assert.ok(face.dot(n) > 0, `${label}/${mesh.name}: invalid shading normal`);
        volume += a.dot(b.cross(c)) / 6;
        for (let corner = 0; corner < 3; corner++) {
          const from = keys[triangle + corner], to = keys[triangle + (corner + 1) % 3];
          assert.notEqual(from, to, `${label}/${mesh.name}: collapsed welded edge`);
          const key = from < to ? `${from}|${to}` : `${to}|${from}`, record = edges.get(key) || { count: 0, direction: 0 };
          record.count++; record.direction += from < to ? 1 : -1; edges.set(key, record);
        }
      }
      assert.ok(volume > 1e-6, `${label}/${mesh.name}: nonpositive volume`);
      for (const [edge, record] of edges) {
        assert.equal(record.count, 2, `${label}/${mesh.name}: nonmanifold edge ${edge}`);
        assert.equal(record.direction, 0, `${label}/${mesh.name}: reversed edge ${edge}`);
      }
      auditedEdges += edges.size; meshes++;
    }
    const result = hash(group); cases++; return result;
  } finally { disposeAsset(group); }
}
try {
  for (const shape of shapes) for (const seed of [1, 19423]) for (const level of [0, 1]) for (const displacement of [0, 1]) {
    validate({ shape, seed, facets: level, roughness: level, bevel: level, displacement, geometryNoiseScale: 8 });
  }
  for (const shape of shapes) {
    const input = { shape, seed: 714, facets: .6, bevel: .65, roughness: .7 };
    assert.equal(validate(input), validate(input), `${shape}: generation is not deterministic`);
    assert.notEqual(validate(input), validate({ ...input, seed: 715 }), `${shape}: seed does not change geometry`);
    assert.notEqual(validate(input), validate({ ...input, displacement: 1 }), `${shape}: displacement is inactive`);
  }
  // Flat walking crowns are real top faces, not shader tricks. Check actual
  // triangle heights at zero distortion; bevel triangles are allowed at rims.
  for (const shape of ['roundPlatform', 'hexPlatform', 'ovalPlatform', 'trianglePlatform', 'lPlatform']) {
    const group = buildAsset({ shape, seed: 1, roughness: 0, bevel: .6 }, material), bounds = new THREE.Box3().setFromObject(group);
    let topArea = 0;
    for (const mesh of group.children) {
      const p = mesh.geometry.attributes.position, a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
      for (let i = 0; i < p.count; i += 3) {
        a.fromBufferAttribute(p, i).applyMatrix4(mesh.matrixWorld); b.fromBufferAttribute(p, i + 1).applyMatrix4(mesh.matrixWorld); c.fromBufferAttribute(p, i + 2).applyMatrix4(mesh.matrixWorld);
        if ([a, b, c].every(point => Math.abs(point.y - bounds.max.y) < .0001)) topArea += b.sub(a).cross(c.sub(a)).length() * .5;
      }
    }
    assert.ok(topArea > 1, `${shape}: missing broad flat walking crown`); disposeAsset(group);
  }
  const scene = new THREE.Scene(), lab = await createFractureLab({ scene, outerMaterial: material, innerMaterial: material });
  try {
    for (const shape of shapes) {
      const source = buildAsset({ shape, seed: 19423, roughness: .25, facets: .35, bevel: .4 }, material);
      scene.add(source); lab.setSource(source); lab.setEnabled(true);
      lab.update({ method: 'voronoi', fragmentCount: 3, impactEnabled: false, seed: 701, maxFragments: 160, impulse: .35 });
      assert.ok(await lab.fractureAll(), `${shape}: ${lab.getStats().message}`);
      for (let frame = 0; frame < 12; frame++) lab.step(1 / 60);
      assert.ok(lab.getStats().fragments >= 2, `${shape}: missing actual fragments`);
      assert.ok(lab.getMeshes().every(mesh => mesh.position.toArray().every(Number.isFinite)), `${shape}: invalid physics state`);
      lab.reset(); assert.equal(lab.getStats().meshes, source.children.length);
      lab.setEnabled(false); source.removeFromParent(); disposeAsset(source); fractureCases++;
    }
  } finally { lab.dispose(); }
  console.log(JSON.stringify({ passed: true, shapes: shapes.length, cases, meshes, auditedEdges, maxTriangles, fractureCases, checks: ['Closed oppositely wound welded edges', 'Positive solid volume and safe normals', 'Grounding, real convex support intersections, and normalized bounds', 'Seeded variety and deterministic regeneration', 'Maximum detail, bevel, wear, and displacement', 'Broad flat platform crowns', 'Actual Pinata fracture and Rapier stepping for every terrain form'] }, null, 2));
} finally { material.dispose(); }
