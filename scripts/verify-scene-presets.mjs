import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { buildAsset, disposeAsset } from '../src/geometry.js';
import { shapes, surfaces, grounds } from '../src/catalog.js';
import { SCENE_PRESETS, createScenePreset } from '../src/scene-presets.js';
import { SCENE_LIMITS } from '../src/scene-editor.js';

const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
const ray = new THREE.Raycaster(), down = new THREE.Vector3(0, -1, 0), point = new THREE.Vector3();
const allIds = new Set(), shapeSignatures = new Set(), reports = [];
let meshCount = 0, supportedObjects = 0, disposedGeometries = 0, builtGeometries = 0;
const countTriangles = geometry => (geometry.index?.count ?? geometry.attributes.position.count) / 3;
const significantOverlap = bounds => !bounds.isEmpty() && bounds.getSize(new THREE.Vector3()).toArray().every((v, i) => v > [ .12, .09, .12 ][i]);

function digest(group) {
  const hash = createHash('sha256');
  group.traverse(mesh => {
    if (!mesh.isMesh) return;
    hash.update(mesh.userData.materialSlot ?? 'primary');
    for (const key of Object.keys(mesh.geometry.attributes).sort()) {
      const array = mesh.geometry.attributes[key].array;
      hash.update(key); hash.update(new Uint8Array(array.buffer, array.byteOffset, array.byteLength));
    }
    if (mesh.geometry.index) hash.update(new Uint8Array(mesh.geometry.index.array.buffer));
  });
  return hash.digest('hex');
}
function own(group) {
  const seen = new Set();
  group.traverse(mesh => {
    if (!mesh.isMesh || seen.has(mesh.geometry)) return;
    seen.add(mesh.geometry); builtGeometries++;
    let disposed = false;
    mesh.geometry.addEventListener('dispose', () => { assert(!disposed, 'A geometry was disposed twice'); disposed = true; disposedGeometries++; });
  });
  return group;
}
function transformed(object) {
  const group = own(buildAsset(object.recipe.options, material));
  group.position.fromArray(object.position); group.scale.fromArray(object.scale);
  group.rotation.set(...object.rotation.map(THREE.MathUtils.degToRad)); group.updateMatrixWorld(true);
  return group;
}

assert.equal(SCENE_PRESETS.length, 8);
assert.throws(() => createScenePreset('missing-preset'), /Unknown scene preset/);
for (const metadata of SCENE_PRESETS) {
  assert(!allIds.has(metadata.id)); allIds.add(metadata.id);
  assert.equal(metadata.thumbnail, `scene-gallery/${metadata.id}.webp`);
  const thumbnail = readFileSync(new URL(`../public/${metadata.thumbnail}`, import.meta.url));
  assert(thumbnail.length > 1024, `${metadata.id}: missing or empty preview image`);
  assert.equal(thumbnail.toString('ascii', 0, 4), 'RIFF');
  assert.equal(thumbnail.toString('ascii', 8, 12), 'WEBP');
  for (const key of ['title', 'description', 'category', 'accent']) assert(metadata[key]?.length);
  const data = createScenePreset(metadata.id), second = createScenePreset(metadata.id);
  assert.deepEqual(data, second, 'Preset creation must be deterministic');
  assert.deepEqual(JSON.parse(JSON.stringify(data)), data, 'Preset data must round trip as JSON');
  assert.equal(data.version, 1); assert.equal(data.selectedId, null); assert.equal(data.initialized, true);
  assert.equal(data.settings.renderMode, 'shaded'); assert.equal(data.settings.grid, false);
  assert.equal(data.objects.length, metadata.objectCount);
  assert(data.objects.length >= 10 && data.objects.length <= 22);
  assert(Object.hasOwn(grounds, data.environment.ground));
  assert(['soft', 'alpine', 'sunset'].includes(data.environment.lighting));
  assert(data.objects.some(object => shapes[object.recipe.options.shape]?.kind === 'terrain'));
  assert(new Set(data.objects.map(object => object.recipe.options.surface)).size >= 3);
  const signature = data.objects.map(object => object.recipe.options.shape).sort().join(',');
  assert(!shapeSignatures.has(signature), 'Each scene needs a distinct composition'); shapeSignatures.add(signature);
  // Neither a scene edit nor an edit to a nested material role may change its template.
  second.objects[0].position[0] += 7;
  second.objects[0].recipe.options.seed = 9;
  for (const object of second.objects) if (object.recipe.partMaterials) object.recipe.partMaterials.handle.outer.surface = 'gold';
  assert.deepEqual(createScenePreset(metadata.id), data);
  const records = [], ids = new Set(), geometryOwners = new Map();
  let triangles = 0, meshes = 0;
  try {
    for (const object of data.objects) {
      assert(!ids.has(object.id)); ids.add(object.id);
      assert.equal(object.recipe.generator, 'procedural-rock-lab'); assert.equal(object.recipe.version, 5);
      assert(Object.hasOwn(shapes, object.recipe.options.shape)); assert(Object.hasOwn(surfaces, object.recipe.options.surface));
      assert(Object.hasOwn(surfaces, object.recipe.innerMaterial.surface));
      for (const [key, range] of [['position', [-50, 50]], ['rotation', [-360, 360]], ['scale', [.05, 10]]]) {
        assert.equal(object[key].length, 3);
        assert(object[key].every(value => Number.isFinite(value) && value >= range[0] && value <= range[1]), `${object.id}: invalid ${key}`);
      }
      const group = transformed(object), bounds = new THREE.Box3().setFromObject(group), meshBounds = [];
      assert(!bounds.isEmpty()); assert(bounds.min.toArray().concat(bounds.max.toArray()).every(Number.isFinite));
      assert(bounds.min.y >= -.00002, `${object.id}: below the ground`);
      group.traverse(mesh => {
        if (!mesh.isMesh) return;
        meshes++; meshCount++; triangles += countTriangles(mesh.geometry);
        const owner = geometryOwners.get(mesh.geometry);
        assert(owner === undefined || owner === object.id, 'Instances must not share owned geometry buffers');
        geometryOwners.set(mesh.geometry, object.id);
        for (const [key, attribute] of Object.entries(mesh.geometry.attributes)) assert(attribute.array.every(Number.isFinite), `${object.id}: non-finite ${key}`);
        const slot = mesh.userData.materialSlot ?? 'primary';
        assert(['primary', 'handle', 'trim'].includes(slot));
        if (slot !== 'primary') {
          assert(object.recipe.partMaterials?.[slot], `${object.id}: missing ${slot} recipe`);
          for (const side of ['outer', 'inner']) assert(Object.hasOwn(surfaces, object.recipe.partMaterials[slot][side].surface));
        }
        meshBounds.push(new THREE.Box3().setFromObject(mesh));
      });
      const repeat = own(buildAsset(object.recipe.options, material));
      try { assert.equal(digest(group), digest(repeat), `${object.id}: geometry generation must be deterministic`); }
      finally { disposeAsset(repeat); }
      records.push({ object, group, bounds, meshBounds });
    }
    assert(meshes < 180 && meshes <= SCENE_LIMITS.pieces);
    assert(triangles < 90000 && triangles <= SCENE_LIMITS.triangles);
    const sceneBounds = new THREE.Box3(); records.forEach(record => sceneBounds.union(record.bounds));
    assert(sceneBounds.getSize(new THREE.Vector3()).length() < 20, 'Compositions should frame together without distant stray props');
    assert(new Set(records.map(record => Math.round(record.bounds.min.y * 5))).size >= 3, 'Scenes need ground, terrace, and upper support levels');
    let minimumSupport = 1;
    for (const record of records) {
      if (record.bounds.min.y < .0001) continue;
      const contacts = new Map();
      record.group.traverse(mesh => {
        if (!mesh.isMesh) return;
        const attribute = mesh.geometry.attributes.position;
        for (let i = 0; i < attribute.count; i++) {
          point.fromBufferAttribute(attribute, i).applyMatrix4(mesh.matrixWorld);
          if (point.y <= record.bounds.min.y + .006) contacts.set(`${point.x.toFixed(4)},${point.z.toFixed(4)}`, point.clone());
        }
      });
      assert(contacts.size > 0);
      let supported = 0;
      for (const contact of contacts.values()) {
        ray.set(new THREE.Vector3(contact.x, record.bounds.min.y + .02, contact.z), down);
        const hit = ray.intersectObjects(records.filter(other => other !== record).map(other => other.group), true)
          .some(intersection => Math.abs(record.bounds.min.y - intersection.point.y) < .026);
        if (hit) supported++;
      }
      const ratio = supported / contacts.size;
      // Rotated bar stock contacts a tabletop at a tangent; broad props and
      // terrain need support across most of their actual bottom vertices.
      const rotated = record.object.rotation[0] !== 0 || record.object.rotation[2] !== 0;
      assert(ratio >= (rotated ? .45 : .8), `${record.object.id}: only ${(ratio * 100).toFixed(1)}% of bottom samples have support`);
      minimumSupport = Math.min(minimumSupport, ratio); supportedObjects++;
    }
    // Bounding boxes are a conservative spacing check. A vase inside an arch
    // opening is fine because none of the arch's individual stones intersect it.
    // Terrain-to-terrain joins deliberately form continuous rocky ledges.
    for (let i = 0; i < records.length; i++) for (let j = 0; j < i; j++) {
      const a = records[i], b = records[j];
      if (!significantOverlap(a.bounds.clone().intersect(b.bounds))) continue;
      if ([a, b].every(record => shapes[record.object.recipe.options.shape].kind === 'terrain')) continue;
      const collision = a.meshBounds.some(first => b.meshBounds.some(last => significantOverlap(first.clone().intersect(last))));
      assert(!collision, `${a.object.id} and ${b.object.id}: substantial prop overlap`);
    }
    reports.push({ id: metadata.id, objects: records.length, meshes, triangles, minimumSupport, bounds: sceneBounds.getSize(new THREE.Vector3()).toArray().map(value => +value.toFixed(3)) });
  } finally { for (const record of records) disposeAsset(record.group); }
}
material.dispose();
assert.equal(builtGeometries, disposedGeometries, 'All temporary verification geometry must be released');
console.log(JSON.stringify({ passed: true, presets: reports.length, objects: reports.reduce((sum, report) => sum + report.objects, 0), meshCount, supportedObjects, builtGeometries, disposedGeometries, reports }, null, 2));
