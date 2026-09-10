import { Box3, Float32BufferAttribute, Triangle, Vector3 } from 'three';

// Pinata preserves positions, normals and UVs, but not arbitrary vertex data.
// Recover the painted face attributes from the original surface rather than
// inventing a different color every time a fragment is cut or recentered.
const referenceCache = new WeakMap();

function referenceIndex(geometry) {
  if (!geometry?.attributes?.position) return null;
  if (referenceCache.has(geometry)) return referenceCache.get(geometry);
  const position = geometry.attributes.position;
  const index = geometry.index;
  const count = Math.floor((index?.count ?? position.count) / 3);
  const bounds = new Box3().setFromBufferAttribute(position);
  const size = bounds.getSize(new Vector3());
  const extent = Math.max(size.x, size.y, size.z, 0.001);
  const divisions = Math.max(4, Math.min(32, Math.ceil(Math.cbrt(count) * 0.85)));
  const cellSize = extent / divisions;
  const cells = new Map(), triangles = [];
  const cellCoordinate = (value, axis) => Math.max(0, Math.min(divisions - 1, Math.floor((value - bounds.min[axis]) / cellSize)));
  const key = (x, y, z) => x + divisions * (y + divisions * z);
  const epsilon = extent * 1e-6;
  for (let t = 0; t < count; t++) {
    const indices = [0, 1, 2].map(corner => index ? index.getX(t * 3 + corner) : t * 3 + corner);
    const triangle = new Triangle(...indices.map(i => new Vector3().fromBufferAttribute(position, i)));
    if (triangle.getArea() < 1e-14) continue;
    const record = { triangle, indices };
    triangles.push(record);
    const box = new Box3().setFromPoints([triangle.a, triangle.b, triangle.c]).expandByScalar(epsilon);
    for (let x = cellCoordinate(box.min.x, 'x'); x <= cellCoordinate(box.max.x, 'x'); x++) {
      for (let y = cellCoordinate(box.min.y, 'y'); y <= cellCoordinate(box.max.y, 'y'); y++) {
        for (let z = cellCoordinate(box.min.z, 'z'); z <= cellCoordinate(box.max.z, 'z'); z++) {
          const id = key(x, y, z);
          if (!cells.has(id)) cells.set(id, []);
          cells.get(id).push(record);
        }
      }
    }
  }
  const result = { geometry, triangles, cells, extent, divisions, cellCoordinate, key };
  referenceCache.set(geometry, result);
  return result;
}

function channel(attribute, index, component) {
  if (component === 0) return attribute.getX(index);
  if (component === 1) return attribute.getY(index);
  if (component === 2) return attribute.getZ(index);
  return attribute.getW(index);
}

function interpolate(attribute, indices, weights, component) {
  return channel(attribute, indices[0], component) * weights.x
    + channel(attribute, indices[1], component) * weights.y
    + channel(attribute, indices[2], component) * weights.z;
}

function nearestSurface(reference, point, normal, scratch) {
  if (!reference?.triangles.length) return null;
  const { cells, cellCoordinate, key, divisions, extent } = reference;
  const x = cellCoordinate(point.x, 'x'), y = cellCoordinate(point.y, 'y'), z = cellCoordinate(point.z, 'z');
  let candidates = cells.get(key(x, y, z));
  if (!candidates?.length) {
    const neighbors = new Set();
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
      if (x + dx < 0 || x + dx >= divisions || y + dy < 0 || y + dy >= divisions || z + dz < 0 || z + dz >= divisions) continue;
      for (const triangle of cells.get(key(x + dx, y + dy, z + dz)) ?? []) neighbors.add(triangle);
    }
    candidates = neighbors.size ? [...neighbors] : reference.triangles;
  }
  const sourceNormal = reference.geometry.attributes.normal;
  let best = null, bestScore = Infinity;
  const normalWeight = extent * extent * 1e-8;
  for (const candidate of candidates) {
    candidate.triangle.closestPointToPoint(point, scratch.closest);
    const distanceSquared = point.distanceToSquared(scratch.closest);
    if (distanceSquared > bestScore) continue;
    candidate.triangle.getBarycoord(scratch.closest, scratch.weights);
    if (sourceNormal) {
      scratch.normal.set(...[0, 1, 2].map(c => interpolate(sourceNormal, candidate.indices, scratch.weights, c))).normalize();
    } else candidate.triangle.getNormal(scratch.normal);
    // At a hard edge several source triangles have the same position. Match
    // the face normal so a bevel does not inherit the neighboring face tone.
    const score = distanceSquared + (1 - Math.max(-1, Math.min(1, normal.dot(scratch.normal)))) * normalWeight;
    if (score < bestScore) {
      bestScore = score;
      best = { indices: candidate.indices, weights: scratch.weights.clone(), distanceSquared };
    }
  }
  return best;
}

/**
 * Restore Rock Lab shader attributes on a Pinata fragment, in place.
 *
 * referenceGeometry: the unsimplified input surface in Pinata's input space.
 * positionOffset: translation Pinata removed while centering this fragment.
 * patternMatrix: maps Pinata input coordinates back to the original mesh's
 *   object space (usually inverse source.matrixWorld for a world-baked input).
 * Existing aRockPosition on the reference takes precedence, preserving the
 * same exterior pattern when an already moving fragment is fractured again.
 *
 * The index, material groups, positions, normals and generated UVs are kept.
 */
export function prepareFractureGeometry(geometry, referenceGeometry = null, { positionOffset, patternMatrix } = {}) {
  if (!geometry?.isBufferGeometry || !geometry.attributes.position) throw new TypeError('prepareFractureGeometry expects a BufferGeometry with positions.');
  if (!geometry.attributes.normal) geometry.computeVertexNormals();
  const position = geometry.attributes.position, normal = geometry.attributes.normal;
  const count = position.count;
  const offset = new Vector3();
  if (Array.isArray(positionOffset)) offset.fromArray(positionOffset);
  else if (positionOffset) offset.copy(positionOffset);
  const reference = referenceIndex(referenceGeometry);
  const outerVertices = new Uint8Array(count);
  const index = geometry.index;
  const groups = geometry.groups.length ? geometry.groups : [{ start: 0, count: index?.count ?? count, materialIndex: 0 }];
  for (const group of groups) {
    if (group.materialIndex !== 0) continue;
    for (let i = group.start; i < group.start + group.count; i++) outerVertices[index ? index.getX(i) : i] = 1;
  }
  const colors = new Float32Array(count * 3), tones = new Float32Array(count), bevels = new Float32Array(count);
  const patternPositions = new Float32Array(count * 4), originalUp = new Float32Array(count);
  const fallbackUV = geometry.attributes.uv ? null : new Float32Array(count * 2);
  const point = new Vector3(), pattern = new Vector3(), fragmentNormal = new Vector3();
  const scratch = { closest: new Vector3(), weights: new Vector3(), normal: new Vector3() };
  const attributes = referenceGeometry?.attributes ?? {};
  const woodPositions = attributes.aWoodPosition ? new Float32Array(count * 4) : null;
  const barkMasks = attributes.aWoodBarkMask ? new Float32Array(count).fill(1) : null;
  let recoveredVertices = 0;
  for (let i = 0; i < count; i++) {
    point.fromBufferAttribute(position, i).add(offset);
    fragmentNormal.fromBufferAttribute(normal, i).normalize();
    pattern.copy(point);
    if (patternMatrix) pattern.applyMatrix4(patternMatrix);
    colors.set([1, 1, 1], i * 3); tones[i] = 0.5; originalUp[i] = fragmentNormal.y + 2;
    const sample = outerVertices[i] ? nearestSurface(reference, point, fragmentNormal, scratch) : null;
    if (sample) {
      const { indices, weights } = sample;
      if (attributes.color) for (let c = 0; c < 3; c++) colors[i * 3 + c] = interpolate(attributes.color, indices, weights, c);
      if (attributes.aFaceTone) tones[i] = interpolate(attributes.aFaceTone, indices, weights, 0);
      if (barkMasks) barkMasks[i] = interpolate(attributes.aWoodBarkMask, indices, weights, 0);
      if (attributes.aBevel) bevels[i] = interpolate(attributes.aBevel, indices, weights, 0);
      if (attributes.aRockOriginalUp) originalUp[i] = interpolate(attributes.aRockOriginalUp, indices, weights, 0);
      if (attributes.aRockPosition) pattern.set(...[0, 1, 2].map(c => interpolate(attributes.aRockPosition, indices, weights, c)));
      recoveredVertices++;
    }
    patternPositions.set([pattern.x, pattern.y, pattern.z, 1], i * 4);
    if (woodPositions) {
      const wood = sample ? [0, 1, 2].map(c => interpolate(attributes.aWoodPosition, sample.indices, sample.weights, c)) : pattern.toArray();
      woodPositions.set([...wood, 1], i * 4);
    }
    if (fallbackUV) {
      const n = fragmentNormal;
      if (Math.abs(n.y) >= Math.abs(n.x) && Math.abs(n.y) >= Math.abs(n.z)) fallbackUV.set([point.x, point.z], i * 2);
      else if (Math.abs(n.x) >= Math.abs(n.z)) fallbackUV.set([point.z, point.y], i * 2);
      else fallbackUV.set([point.x, point.y], i * 2);
    }
  }
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
  geometry.setAttribute('aFaceTone', new Float32BufferAttribute(tones, 1));
  geometry.setAttribute('aBevel', new Float32BufferAttribute(bevels, 1));
  geometry.setAttribute('aRockPosition', new Float32BufferAttribute(patternPositions, 4));
  if (woodPositions) geometry.setAttribute('aWoodPosition', new Float32BufferAttribute(woodPositions, 4));
  if (barkMasks) geometry.setAttribute('aWoodBarkMask', new Float32BufferAttribute(barkMasks, 1));
  geometry.setAttribute('aRockOriginalUp', new Float32BufferAttribute(originalUp, 1));
  if (fallbackUV) geometry.setAttribute('uv', new Float32BufferAttribute(fallbackUV, 2));
  geometry.userData.fractureSurface = { recoveredVertices, exteriorVertices: outerVertices.reduce((sum, value) => sum + value, 0), stablePattern: true };
  return geometry;
}
