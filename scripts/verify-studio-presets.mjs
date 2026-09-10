import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Box3, Vector3, MeshBasicMaterial } from 'three';
import { defaults, looks, shapes, surfaces, grounds } from '../src/catalog.js';
import { buildAsset, disposeAsset } from '../src/geometry.js';
import { PATH_SHAPES, PATH_MAX_TRIANGLES, PATH_LIMITS } from '../src/path-geometry.js';
import { GROUND_TYPES } from '../src/ground.js';
import { GROUND_PRESETS, normalizeGroundId } from '../src/ground-catalog.js';
import { LIGHTING_PRESETS } from '../src/lighting.js';
import { createWorldPresets } from '../src/world-presets.js';

// Verify the authored catalog itself, including actual deterministic geometry.
// Browser rendering, recipe migration, and user interactions have a separate QA.
const originalIds = ['alpine', 'desert', 'volcanic', 'ruins', 'quarry', 'frozen'];
const expectedGrounds = ['studio', 'asphalt', 'sand', 'slate', 'travertine', 'terrazzo', 'hexTile', 'earth'];
const material = new MeshBasicMaterial();
const labels = new Set(), styles = new Set(), reports = [];
const diversity = { shapes: new Set(), surfaces: new Set(), grounds: new Set(), lighting: new Set(), families: new Set() };
let allocated = 0, disposed = 0;
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
  return value;
}
function finite(value, trail) {
  if (typeof value === 'number') assert(Number.isFinite(value), `${trail}: nonfinite number`);
  else if (value && typeof value === 'object') for (const [key, child] of Object.entries(value)) finite(child, `${trail}.${key}`);
}
function own(group) {
  const seen = new Set();
  group.traverse(mesh => {
    if (!mesh.isMesh || seen.has(mesh.geometry)) return;
    seen.add(mesh.geometry); allocated++;
    let released = false;
    mesh.geometry.addEventListener('dispose', () => { assert(!released, 'Owned geometry disposed twice'); released = true; disposed++; });
  });
  return group;
}
function inspect(group, id, shape) {
  group.updateMatrixWorld(true);
  const digest = createHash('sha256'), bounds = new Box3().setFromObject(group), size = bounds.getSize(new Vector3());
  assert(!bounds.isEmpty() && [...bounds.min, ...bounds.max].every(Number.isFinite), `${id}: empty or invalid bounds`);
  assert(Math.abs(bounds.min.y) < .002, `${id}: object must stand on the ground`);
  assert(size.toArray().every(value => value > 0), `${id}: shape must have volume`);
  let pieces = 0, triangles = 0;
  group.traverse(mesh => {
    if (!mesh.isMesh) return;
    pieces++;
    const geometry = mesh.geometry, position = geometry.attributes.position;
    triangles += (geometry.index?.count ?? position.count) / 3;
    for (const name of ['position', 'normal', 'color', 'aFaceTone', 'aBevel', 'uv']) {
      const attribute = geometry.attributes[name];
      assert(attribute && attribute.count === position.count, `${id}: missing or mismatched ${name}`);
    }
    for (const [name, attribute] of Object.entries(geometry.attributes).sort()) {
      assert(attribute.array.every(Number.isFinite), `${id}: invalid ${name}`);
      digest.update(name); digest.update(Buffer.from(attribute.array.buffer, attribute.array.byteOffset, attribute.array.byteLength));
    }
    if (geometry.index) digest.update(Buffer.from(geometry.index.array.buffer));
    digest.update(JSON.stringify(mesh.matrixWorld.elements));
    digest.update(mesh.userData.materialSlot ?? 'primary');
  });
  assert(pieces > 0 && triangles > 0);
  assert(triangles <= (PATH_SHAPES.has(shape) ? PATH_MAX_TRIANGLES : 36000), `${id}: triangle budget exceeded`);
  if (PATH_SHAPES.has(shape)) assert(pieces <= PATH_LIMITS.maxPieces);
  return { pieces, triangles, size: size.toArray(), hash: digest.digest('hex') };
}

try {
  assert.equal(Object.keys(looks).length, 56, 'Six existing and fifty new presets are required');
  const fresh = createWorldPresets(defaults), repeat = createWorldPresets(defaults);
  assert.deepEqual(fresh, repeat, 'Authored preset defaults must be deterministic');
  assert.deepEqual(fresh, looks, 'The UI catalog must expose the authored defaults');
  fresh.alpine.options.seed = 9;
  assert.deepEqual(createWorldPresets(defaults), repeat, 'Editing one created catalog must not mutate the templates');
  for (const id of originalIds) assert(Object.hasOwn(looks, id), `Original preset ${id} must remain available`);
  assert.deepEqual(Object.keys(grounds).sort(), expectedGrounds.toSorted());
  assert.deepEqual(Object.keys(GROUND_TYPES).sort(), expectedGrounds.toSorted());
  assert.equal(GROUND_PRESETS.length, 8);
  assert.equal(Object.keys(LIGHTING_PRESETS).length, 8);
  assert.equal(normalizeGroundId('concrete'), 'travertine');
  assert.equal(normalizeGroundId('wood'), 'slate');
  for (const [id, entry] of Object.entries(looks)) {
    assert(/^[a-zA-Z][a-zA-Z0-9-]*$/.test(id), `${id}: invalid preset identifier`);
    assert(typeof entry.label === 'string' && entry.label.trim().length > 0);
    assert(typeof entry.note === 'string' && entry.note.trim().length > 0);
    assert(!labels.has(entry.label), `Duplicate preset label ${entry.label}`); labels.add(entry.label);
    assert(entry.options && typeof entry.options === 'object'); finite(entry.options, id);
    assert.deepEqual(JSON.parse(JSON.stringify(entry.options)), entry.options, `${id}: options must round trip as JSON`);
    const options = { ...defaults, ...structuredClone(entry.options) };
    assert(Object.hasOwn(shapes, options.shape), `${id}: unknown shape ${options.shape}`);
    assert(Object.hasOwn(surfaces, options.surface), `${id}: unknown surface ${options.surface}`);
    assert(Object.hasOwn(grounds, options.ground), `${id}: unknown ground ${options.ground}`);
    assert(Object.hasOwn(LIGHTING_PRESETS, options.lighting), `${id}: unknown lighting ${options.lighting}`);
    assert(Number.isInteger(options.seed) && options.seed >= 1 && options.seed <= 999999, `${id}: invalid seed`);
    const signature = { ...options }; delete signature.seed;
    const key = JSON.stringify(stable(signature));
    assert(!styles.has(key), `${id}: presets need authored differences beyond a seed`); styles.add(key);
    if (!originalIds.includes(id)) {
      for (const name of ['shape', 'surface', 'ground', 'lighting']) diversity[`${name}s` === 'lightings' ? 'lighting' : `${name}s`].add(options[name]);
      diversity.families.add(surfaces[options.surface].family ?? 'rock');
    }
    const before = JSON.stringify(entry.options), first = own(buildAsset(options, material)); let second;
    try {
      const measured = inspect(first, id, options.shape);
      second = own(buildAsset(options, material));
      assert.equal(inspect(second, id, options.shape).hash, measured.hash, `${id}: same preset must regenerate identical geometry`);
      assert.equal(JSON.stringify(entry.options), before, `${id}: generation mutated preset data`);
      reports.push({ id, shape: options.shape, surface: options.surface, ground: options.ground, lighting: options.lighting, ...measured });
    } finally { disposeAsset(first); if (second) disposeAsset(second); }
  }
  assert(diversity.shapes.size >= 20, 'Fifty new presets should explore the object library');
  assert(diversity.surfaces.size >= 15, 'Fifty new presets should explore the material families');
  assert.equal(diversity.grounds.size, 8, 'The new presets should demonstrate every ground');
  assert.equal(diversity.lighting.size, 8, 'The new presets should demonstrate every lighting rig');
  assert.equal(allocated, disposed, 'Verification must release all temporary geometry');
  console.log(JSON.stringify({ passed: true, presets: reports.length, newPresets: reports.length - originalIds.length, diversity: Object.fromEntries(Object.entries(diversity).map(([key, values]) => [key, [...values]])), allocated, disposed, reports }, null, 2));
} finally { material.dispose(); }
