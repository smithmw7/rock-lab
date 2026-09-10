import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { buildAsset, disposeAsset } from '../src/geometry.js';
import { WOOD_SHAPES } from '../src/wood-geometry.js';
import { createFractureLab } from '../src/fracture.js';

const material = new THREE.MeshBasicMaterial();
const signature = group => {
  const hash = createHash('sha256');
  for (const mesh of group.children) for (const name of ['position', 'aWoodPosition']) hash.update(Buffer.from(mesh.geometry.attributes[name].array.buffer));
  return hash.digest('hex');
};
let cases = 0, meshes = 0, fractureGenerations = 0, checkedExteriorVertices = 0;

// Stock coordinates form an affine frame. Recover that frame from four
// independent source points, then check real fracture output against it in
// world space. This catches patterns sliding when Pinata recenters a fragment.
function sourceGrainFrame(mesh) {
  const position = mesh.geometry.attributes.position, wood = mesh.geometry.attributes.aWoodPosition;
  const ids = [0], base = new THREE.Vector3().fromBufferAttribute(position, 0);
  const first = new THREE.Vector3(), second = new THREE.Vector3(), candidate = new THREE.Vector3();
  for (let i = 1; i < position.count && ids.length < 4; i++) {
    candidate.fromBufferAttribute(position, i).sub(base);
    if (ids.length === 1 && candidate.lengthSq() > 1e-6) { ids.push(i); first.copy(candidate); }
    else if (ids.length === 2 && first.clone().cross(candidate).lengthSq() > 1e-6) { ids.push(i); second.copy(candidate); }
    else if (ids.length === 3 && Math.abs(first.clone().cross(second).dot(candidate)) > 1e-5) ids.push(i);
  }
  assert.equal(ids.length, 4, 'Source stock must have a volumetric grain frame');
  const frame = attribute => {
    const points = ids.map(i => new THREE.Vector3().fromBufferAttribute(attribute, i));
    return new THREE.Matrix4().makeBasis(...points.slice(1).map(point => point.sub(points[0]))).setPosition(points[0]);
  };
  mesh.updateWorldMatrix(true, false);
  return frame(wood).multiply(frame(position).invert()).multiply(mesh.matrixWorld.clone().invert());
}

async function validateFracturedGrain(shape) {
  const source = buildAsset({ shape, seed: 19423, facets: .2, roughness: 0, bevel: .35 }, material);
  if (shape === 'hammer') for (const mesh of [...source.children]) if (mesh.userData.materialSlot !== 'handle') {
    source.remove(mesh); mesh.geometry.dispose();
  }
  assert.equal(source.children.length, 1, 'Fracture regression isolates one stock piece');
  // Exercise both source transforms and fragment recentering, with the solver
  // paused so a position mismatch cannot be hidden by expected rigid motion.
  source.position.set(.37, .23, -.41); source.rotation.y = .29; source.scale.setScalar(.87);
  const scene = new THREE.Scene(); scene.add(source); source.updateMatrixWorld(true);
  const expectedFrame = sourceGrainFrame(source.children[0]);
  const inner = new THREE.MeshBasicMaterial();
  const lab = await createFractureLab({ scene, outerMaterial: material, innerMaterial: inner });
  try {
    lab.setSource(source); lab.setEnabled(true);
    lab.update({ method: 'simple', fragmentCount: 2, seed: 117, maxGeneration: 2, maxFragments: 16, impulse: 0, gravity: 0, impactEnabled: false, fracturePlanes: { x: shape === 'splitLog', y: shape === 'hammer', z: false } });
    lab.setPaused(true);
    for (const generation of [1, 2]) {
      assert.equal(await lab.fractureAll(), true, `${shape}: ${lab.getStats().message}`);
      assert.equal(lab.getMeshes().length, 2 ** generation, `${shape}: each piece must fracture in two`);
      let bare = 0, bark = 0, exterior = 0;
      for (const mesh of lab.getMeshes()) {
        const geometry = mesh.geometry, position = geometry.attributes.position, wood = geometry.attributes.aWoodPosition, mask = geometry.attributes.aWoodBarkMask;
        assert.equal(mesh.userData.generation, generation);
        assert.equal(wood?.count, position.count, `${shape}: wood coordinates lost after fracture`);
        assert.ok(wood.array.every(Number.isFinite), `${shape}: invalid fractured wood coordinates`);
        if (shape === 'splitLog') {
          assert.equal(mask?.count, position.count, 'Split surface mask survives recuts');
          assert.ok(mask.array.every(value => Number.isFinite(value) && value >= -.00001 && value <= 1.00001), 'Fractured bark mask must remain bounded');
        }
        assert.ok(geometry.groups.some(group => group.materialIndex === 1 && group.count > 0), 'Fracture must create actual interior faces');
        assert.ok(geometry.attributes.uv.array.every(Number.isFinite), 'Interior retains the fracture tool UVs');
        mesh.updateWorldMatrix(true, false);
        for (const group of geometry.groups.filter(group => group.materialIndex === 0)) for (let vertex = group.start; vertex < group.start + group.count; vertex++) {
          const i = geometry.index ? geometry.index.getX(vertex) : vertex;
          const point = new THREE.Vector3().fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld).applyMatrix4(expectedFrame);
          const actual = new THREE.Vector3().fromBufferAttribute(wood, i);
          assert.ok(actual.distanceTo(point) < .001, `${shape}: exterior grain moved at generation ${generation}`);
          if (mask) {
            if (mask.getX(i) < .001) bare++;
            if (mask.getX(i) > .999) bark++;
          }
          exterior++;
        }
        if (mask) for (const group of geometry.groups.filter(group => group.materialIndex === 0)) for (let triangle = group.start; triangle < group.start + group.count; triangle += 3) {
          const ids = [0, 1, 2].map(corner => geometry.index ? geometry.index.getX(triangle + corner) : triangle + corner);
          const flat = ids.every(i => Math.abs(new THREE.Vector3().fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld).applyMatrix4(expectedFrame).z) < .0001);
          for (const i of ids) assert.ok(Math.abs(mask.getX(i) - (flat ? 0 : 1)) < .001, `Split surface mask moved at generation ${generation}`);
        }
      }
      assert.ok(exterior > 0, `${shape}: original exterior must remain`);
      if (shape === 'splitLog') {
        assert.ok(bare > 0, 'Bare split face survives fracture');
        assert.ok(bark > 0, 'Bark shell survives fracture');
      }
      checkedExteriorVertices += exterior; fractureGenerations++;
    }
  } finally { lab.dispose(); disposeAsset(source); inner.dispose(); }
}
try {
  for (const shape of WOOD_SHAPES) for (const seed of [1, 19423, 999999]) for (const level of [0, 1]) for (const displacement of [0, 1]) {
    const options = { shape, seed, facets: level, roughness: level, bevel: level, displacement, geometryNoiseScale: 8 };
    const group = buildAsset(options, material);
    try {
      assert.equal(group.userData.connectivity.unsupported.length, 0, `${shape}: unsupported part`);
      assert.ok(Math.abs(new THREE.Box3().setFromObject(group).min.y) < .002, `${shape}: not grounded`);
      for (const mesh of group.children) {
        const geometry = mesh.geometry, position = geometry.attributes.position, pattern = geometry.attributes.aWoodPosition;
        const label = `${shape}/${seed}/${level}/${displacement}/${mesh.name}`;
        assert.equal(pattern.count, position.count, `${label}: missing grain coordinates`);
        assert.ok(pattern.array.every(Number.isFinite), `${label}: invalid grain coordinate`);
        const edges = new Map(), a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
        const keys = Array.from({ length: position.count }, (_, i) => [position.getX(i), position.getY(i), position.getZ(i)].map(value => Math.round(value * 1e6)).join(','));
        let volume = 0;
        for (let triangle = 0; triangle < position.count; triangle += 3) {
          a.fromBufferAttribute(position, triangle); b.fromBufferAttribute(position, triangle + 1); c.fromBufferAttribute(position, triangle + 2);
          const normal = b.clone().sub(a).cross(c.clone().sub(a));
          assert.ok(normal.lengthSq() > 1e-14, `${label}: degenerate triangle`);
          n.fromBufferAttribute(geometry.attributes.normal, triangle);
          assert.ok(normal.dot(n) > 0, `${label}: reversed shading normal`);
          volume += a.dot(b.cross(c)) / 6;
          for (let corner = 0; corner < 3; corner++) {
            const from = keys[triangle + corner], to = keys[triangle + (corner + 1) % 3];
            assert.notEqual(from, to, `${label}: collapsed edge`);
            const key = from < to ? `${from}|${to}` : `${to}|${from}`, edge = edges.get(key) || { count: 0, direction: 0 };
            edge.count++; edge.direction += from < to ? 1 : -1; edges.set(key, edge);
          }
        }
        assert.ok(volume > 1e-6, `${label}: empty solid`);
        for (const edge of edges.values()) {
          assert.equal(edge.count, 2, `${label}: open or nonmanifold edge`);
          assert.equal(edge.direction, 0, `${label}: inconsistent winding`);
        }
        meshes++;
      }
      const repeated = buildAsset(options, material);
      try { assert.equal(signature(group), signature(repeated), `${shape}: seed not reproducible`); }
      finally { disposeAsset(repeated); }
      cases++;
    } finally { disposeAsset(group); }
  }
  // A table is assembled from horizontal boards and upright legs. Their
  // longitudinal shader coordinate must follow each stock piece independently.
  const table = buildAsset({ shape: 'table', seed: 17, roughness: 0, bevel: 0 }, material);
  try {
    const boards = table.children.filter(mesh => mesh.name === 'Tabletop board');
    assert.equal(boards.length, 3);
    for (const mesh of boards) {
      const p = mesh.geometry.attributes.position, grain = mesh.geometry.attributes.aWoodPosition;
      const range = (attribute, axis) => Math.max(...Array.from({ length: attribute.count }, (_, i) => attribute.getComponent(i, axis))) - Math.min(...Array.from({ length: attribute.count }, (_, i) => attribute.getComponent(i, axis)));
      assert.ok(Math.abs(range(p, 0) - range(grain, 1)) < .00001, 'Tabletop grain must run along the long X axis');
      assert.ok(range(grain, 0) < range(grain, 1), 'Long grain must not run across the narrow board');
    }
    assert.notEqual(boards[0].geometry.attributes.aWoodPosition.getY(0), boards[1].geometry.attributes.aWoodPosition.getY(0), 'Repeated boards must sample different sections of the wood field');
  } finally { disposeAsset(table); }
  // Wood coordinates must not replace the original position fallback for
  // rock/metal/clay on existing primitives or assembled furniture.
  for (const shape of ['block', 'brick', 'sphere', 'bench', 'table', 'stool']) {
    const group = buildAsset({ shape, seed: 17, surface: 'stone' }, material);
    try {
      for (const mesh of group.children) {
        assert.equal(mesh.geometry.attributes.aRockPosition, undefined, `${shape}: stock mapping must not override the established nonwood coordinate field`);
        assert.ok(mesh.geometry.attributes.aWoodPosition, `${shape}: wood keeps its separate stock coordinates`);
      }
    } finally { disposeAsset(group); }
  }
  const split = buildAsset({ shape: 'splitLog', seed: 17 }, material);
  try {
    const geometry = split.children[0].geometry, wood = geometry.attributes.aWoodPosition, mask = geometry.attributes.aWoodBarkMask;
    let splitFaces = 0, shellFaces = 0;
    for (let i = 0; i < wood.count; i += 3) {
      const flat = [0, 1, 2].every(corner => Math.abs(wood.getZ(i + corner)) < .0001);
      for (const corner of [0, 1, 2]) assert.equal(mask.getX(i + corner), flat ? 0 : 1, 'Split face stays bare while the round shell retains bark');
      if (flat) splitFaces++; else shellFaces++;
    }
    assert.ok(splitFaces > 0 && shellFaces > 0, 'Split stock must include both surface regions');
  } finally { disposeAsset(split); }
  for (const shape of ['splitLog', 'hammer']) await validateFracturedGrain(shape);
  console.log(JSON.stringify({ passed: true, shapes: WOOD_SHAPES.size, cases, meshes, fractureGenerations, checkedExteriorVertices, checks: ['Closed manifold surfaces and consistent winding', 'Deterministic actual ridges and chips', 'Extreme geometry controls and displacement', 'Grounded branch assemblies', 'Per-piece stock grain alignment', 'Original nonwood material coordinates remain unchanged', 'Bare split face and bark shell masks', 'Two generations of real paused fracture preserve exterior grain and split masks'] }, null, 2));
} finally { material.dispose(); }
