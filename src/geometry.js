import * as THREE from 'three';
import { ConvexHull } from 'three/addons/math/ConvexHull.js';
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
import { createKitParts, KIT_GROUPS, KIT_SHAPES } from './kit-geometry.js';
import { createWorkshopParts, sanitizeWorkshopOptions, WORKSHOP_GROUPS, WORKSHOP_SHAPES, WORKSHOP_CATALOG } from './workshop-geometry.js';
import { createTerrainParts, TERRAIN_GROUPS, TERRAIN_SHAPES, TERRAIN_CATALOG } from './terrain-geometry.js';
import { buildPathAsset, PATH_GROUPS, PATH_SHAPES, PATH_CATALOG } from './path-geometry.js';
import { createWoodParts, setStockGrainCoordinates, stockAxisMatrix, WOOD_GROUPS, WOOD_SHAPES, WOOD_CATALOG } from './wood-geometry.js';

// All surface detail here is real geometry. Faces remain coherent polygons until
// the final upload, so triangulation never becomes the visible surface language.
const EPS = 1e-6;
const UP = new THREE.Vector3(0, 1, 0);
const clamp = (x, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, x));

export const SHAPE_GROUPS = [
  { id: 'natural', label: 'Natural', shapes: ['boulder', 'stack', 'slab', 'spire', 'crystals', 'arch'] },
  { id: 'primitives', label: 'Primitives', shapes: ['block', 'brick', 'sphere', 'cylinder', 'wedge', 'roundedBlock', ...KIT_GROUPS.primitives] },
  { id: 'structures', label: 'Structures', shapes: ['wall', 'monolith', 'columns', 'stairs', 'ruins', 'cairn'] },
  { id: 'architecture', label: 'Architecture', shapes: KIT_GROUPS.architecture },
  { id: 'furniture', label: 'Furniture', shapes: KIT_GROUPS.furniture },
  ...WOOD_GROUPS,
  ...WORKSHOP_GROUPS,
  ...TERRAIN_GROUPS,
  ...PATH_GROUPS,
];
export const SHAPE_LABELS = {
  boulder: 'Boulder', stack: 'Rock steps', slab: 'Slab', spire: 'Spire', crystals: 'Crystals', arch: 'Rock arch',
  block: 'Block', brick: 'Brick', sphere: 'Sphere', cylinder: 'Cylinder', wedge: 'Wedge', roundedBlock: 'Rounded block',
  wall: 'Block wall', monolith: 'Monolith', columns: 'Basalt columns', stairs: 'Stairs', ruins: 'Ruins', cairn: 'Cairn',
  smallBlock: 'Small block', mediumBlock: 'Medium block', largeBlock: 'Large block', lowRamp: 'Low ramp', steepRamp: 'Steep ramp', cornerRamp: 'Corner ramp', platform: 'Platform',
  roundArch: 'Round arch', pointedArch: 'Pointed arch', flatArch: 'Flat arch', bridge: 'Bridge', roundColumn: 'Round column', squareColumn: 'Square column', brokenColumn: 'Broken column', plinth: 'Plinth', doorway: 'Doorway',
  bench: 'Bench', table: 'Table', chair: 'Chair', stool: 'Stool',
  ...Object.fromEntries(Object.entries(WOOD_CATALOG).map(([id, entry]) => [id, entry.label])),
  ...Object.fromEntries(Object.entries(WORKSHOP_CATALOG).map(([id, entry]) => [id, entry.label])),
  ...Object.fromEntries(Object.entries(TERRAIN_CATALOG).map(([id, entry]) => [id, entry.label])),
  ...Object.fromEntries(Object.entries(PATH_CATALOG).map(([id, entry]) => [id, entry.label])),
};

function randomGenerator(seed) {
  let state = (Number.isFinite(Number(seed)) ? Number(seed) : 1) >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let n = state;
    n = Math.imul(n ^ (n >>> 15), n | 1);
    n ^= n + Math.imul(n ^ (n >>> 7), n | 61);
    return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
  };
}

function uniquePoints(points, tolerance = 1e-5) {
  const unique = [];
  for (const p of points) {
    if (!unique.some(q => p.distanceToSquared(q) < tolerance * tolerance)) unique.push(p);
  }
  return unique;
}

function polygon(points, normal, tone = 0.5, bevel = 0) {
  const vertices = uniquePoints(points);
  if (vertices.length < 3) return null;
  const center = vertices.reduce((sum, p) => sum.add(p), new THREE.Vector3()).multiplyScalar(1 / vertices.length);
  const reference = Math.abs(normal.y) < 0.95 ? UP : new THREE.Vector3(1, 0, 0);
  const u = reference.clone().cross(normal).normalize();
  const v = normal.clone().cross(u).normalize();
  vertices.sort((a, b) => {
    const aa = a.clone().sub(center), bb = b.clone().sub(center);
    return Math.atan2(aa.dot(v), aa.dot(u)) - Math.atan2(bb.dot(v), bb.dot(u));
  });
  return { vertices, normal: normal.clone().normalize(), tone, bevel };
}

function cubeFaces(rng) {
  const faces = [];
  for (let axis = 0; axis < 3; axis++) {
    for (const sign of [-1, 1]) {
      const points = [];
      for (const a of [-1, 1]) for (const b of [-1, 1]) {
        const p = new THREE.Vector3();
        p.setComponent(axis, sign);
        p.setComponent((axis + 1) % 3, a);
        p.setComponent((axis + 2) % 3, b);
        points.push(p);
      }
      const n = new THREE.Vector3().setComponent(axis, sign);
      faces.push(polygon(points, n, 0.42 + rng() * 0.17));
    }
  }
  return faces;
}

// Clip a convex solid against n dot p <= distance. Intersection points form
// one ordered cap, preserving the original faces and their material metadata.
function clipSolid(faces, normal, distance, tone, bevel = 0) {
  const next = [], cap = [];
  for (const face of faces) {
    const result = [], verts = face.vertices;
    for (let i = 0; i < verts.length; i++) {
      const a = verts[i], b = verts[(i + 1) % verts.length];
      const da = normal.dot(a) - distance, db = normal.dot(b) - distance;
      const aInside = da <= EPS, bInside = db <= EPS;
      if (aInside) result.push(a);
      if (aInside !== bInside) {
        const intersection = a.clone().lerp(b, da / (da - db));
        result.push(intersection);
        cap.push(intersection);
      }
    }
    const vertices = uniquePoints(result);
    if (vertices.length >= 3) next.push({ ...face, vertices });
  }
  const newFace = polygon(cap, normal, tone, bevel);
  if (newFace) next.push(newFace);
  return next;
}

function bevelSolid(faces, width, irregularity = 0) {
  if (width < 0.0001) return faces;
  const edges = new Map();
  const key = p => `${Math.round(p.x * 1e5)},${Math.round(p.y * 1e5)},${Math.round(p.z * 1e5)}`;
  for (const face of faces) {
    for (let i = 0; i < face.vertices.length; i++) {
      const a = face.vertices[i], b = face.vertices[(i + 1) % face.vertices.length];
      const ka = key(a), kb = key(b), edgeKey = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
      if (edges.has(edgeKey)) edges.get(edgeKey).faces.push(face);
      else edges.set(edgeKey, { a, b, faces: [face] });
    }
  }
  let result = faces;
  for (const edge of edges.values()) {
    if (edge.faces.length !== 2 || edge.a.distanceTo(edge.b) < width * 0.8) continue;
    const [a, b] = edge.faces;
    const dot = clamp(a.normal.dot(b.normal), -1, 1);
    if (dot > 0.995 || dot < -0.995) continue;
    const normal = a.normal.clone().add(b.normal).normalize();
    const edgeNoise = Math.sin(edge.a.x * 73.17 + edge.a.y * 39.43 + edge.a.z * 91.91) * 43758.5453;
    const variation = 1 + irregularity * ((edgeNoise - Math.floor(edgeNoise)) - 0.5) * 1.2;
    const edgeWidth = width * variation * Math.sqrt((1 - dot) / 2);
    const distance = normal.dot(edge.a) - edgeWidth;
    result = clipSolid(result, normal, distance, (a.tone + b.tone) * 0.5 + 0.025, 1);
  }
  return result;
}

function rockFaces(rng, options) {
  const detail = options.facets, rough = options.roughness;
  let faces = cubeFaces(rng);
  // The initial box is only a clipping envelope. Independent slanted fracture
  // planes below determine the visible shape; there is no extruded polygon ring.
  for (const face of faces) for (const p of face.vertices) p.multiplyScalar(1.35);
  const ringCount = 5 + Math.round(detail * 3);
  const phase = rng() * Math.PI * 2;
  for (let i = 0; i < ringCount; i++) {
    const angle = phase + i / ringCount * Math.PI * 2 + (rng() - 0.5) * (0.31 + rough * 0.25);
    const slope = (rng() - 0.48) * (0.84 + rough * 0.5);
    const n = new THREE.Vector3(Math.cos(angle), slope, Math.sin(angle)).normalize();
    faces = clipSolid(faces, n, 0.69 + rng() * (0.3 + rough * 0.18), 0.36 + rng() * 0.28);
  }
  const topAngle = phase + rng() * Math.PI * 2;
  const topSlope = 0.22 + rng() * (0.52 + rough * 0.25);
  const top = new THREE.Vector3(Math.cos(topAngle) * topSlope, 1, Math.sin(topAngle) * topSlope).normalize();
  faces = clipSolid(faces, top, 0.65 + rng() * 0.3, 0.5 + rng() * 0.14);
  const bottom = new THREE.Vector3((rng() - 0.5) * 0.45, -1, (rng() - 0.5) * 0.42).normalize();
  faces = clipSolid(faces, bottom, 0.85 + rng() * 0.13, 0.38 + rng() * 0.14);
  // Asymmetric, broad diagonal chips break corners and top planes. The cut
  // depths deliberately differ, avoiding the evenly chamfered column look.
  const shoulderCount = 4 + Math.round(detail * 6);
  for (let i = 0; i < shoulderCount; i++) {
    const angle = phase + i / shoulderCount * Math.PI * 2 + (rng() - 0.5) * 0.6;
    const vertical = 0.75 + rng() * 0.55;
    const n = new THREE.Vector3(Math.cos(angle), vertical, Math.sin(angle)).normalize();
    faces = clipSolid(faces, n, 0.72 + rng() * 0.26 - rough * 0.035, 0.41 + rng() * 0.25);
  }
  const bottomCuts = 1 + Math.round(detail * 3);
  for (let i = 0; i < bottomCuts; i++) {
    const angle = phase + i / bottomCuts * Math.PI * 2 + rng() * 0.6;
    const n = new THREE.Vector3(Math.cos(angle), -0.65 - rng() * 0.45, Math.sin(angle)).normalize();
    faces = clipSolid(faces, n, 0.91 + rng() * 0.27, 0.38 + rng() * 0.2);
  }
  return bevelSolid(faces, options.bevel * (0.020 + rough * 0.023), 0.85);
}

function crystalFaces(rng, options) {
  const sides = 6;
  const phase = rng() * Math.PI;
  const ring = [], base = [];
  const crownY = 0.32 + rng() * 0.12;
  const tip = new THREE.Vector3((rng() - 0.5) * 0.45, 1.24, (rng() - 0.5) * 0.35);
  for (let i = 0; i < sides; i++) {
    const angle = phase + i / sides * Math.PI * 2;
    const p = new THREE.Vector3(Math.cos(angle), crownY, Math.sin(angle));
    ring.push(p);
    base.push(new THREE.Vector3(p.x * 0.79, -1, p.z * 0.79));
  }
  let faces = [polygon(base, new THREE.Vector3(0, -1, 0), 0.4)];
  for (let i = 0; i < sides; i++) {
    const j = (i + 1) % sides;
    const normal = ring[j].clone().sub(base[i]).cross(ring[i].clone().sub(base[i])).normalize();
    // The ring is counterclockwise in x/z; sorting polygon vertices establishes
    // the final outward winding independently of this point order.
    const outward = new THREE.Vector3(ring[i].x + ring[j].x, -0.21 * Math.hypot(ring[i].x + ring[j].x, ring[i].z + ring[j].z) / (crownY + 1), ring[i].z + ring[j].z).normalize();
    if (normal.dot(outward) < 0) normal.negate();
    faces.push(polygon([base[i], base[j], ring[j], ring[i]], normal, 0.32 + rng() * 0.34));
    const crownNormal = ring[j].clone().sub(ring[i]).cross(tip.clone().sub(ring[i])).normalize();
    if (crownNormal.dot(new THREE.Vector3(ring[i].x + ring[j].x, 1, ring[i].z + ring[j].z)) < 0) crownNormal.negate();
    faces.push(polygon([ring[i], ring[j], tip], crownNormal, 0.4 + rng() * 0.32));
  }
  return bevelSolid(faces, options.bevel * 0.019);
}

function toGeometry(faces, toneOffset = 0) {
  const positions = [], normals = [], colors = [], tones = [], bevels = [];
  let polygonCount = 0, bevelFaceCount = 0;
  for (const face of faces) {
    if (!face || face.vertices.length < 3) continue;
    let faceUsed = false;
    for (let i = 1; i < face.vertices.length - 1; i++) {
      // Check the positions at their actual GPU upload precision. Extremely
      // thin clipped bevels can have area in Float64 but collapse in Float32.
      const triangle = [face.vertices[0], face.vertices[i], face.vertices[i + 1]]
        .map(p => new THREE.Vector3(Math.fround(p.x), Math.fround(p.y), Math.fround(p.z)));
      const cross = triangle[1].clone().sub(triangle[0]).cross(triangle[2].clone().sub(triangle[0]));
      if (cross.lengthSq() <= 1e-14) continue;
      if (cross.dot(face.normal) < 0) [triangle[1], triangle[2]] = [triangle[2], triangle[1]];
      for (const p of triangle) {
        positions.push(p.x, p.y, p.z);
        normals.push(face.normal.x, face.normal.y, face.normal.z);
        // Neutral, restrained coloration allows the shader's stone/ice palette
        // to remain the art direction authority.
        const tone = clamp(face.tone + toneOffset, 0.15, 0.85);
        const tint = 0.88 + tone * 0.16;
        colors.push(tint, tint, tint);
        tones.push(tone);
        bevels.push(face.bevel);
      }
      faceUsed = true;
    }
    if (faceUsed) {
      polygonCount++;
      if (face.bevel) bevelFaceCount++;
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute('aFaceTone', new THREE.Float32BufferAttribute(tones, 1));
  geometry.setAttribute('aBevel', new THREE.Float32BufferAttribute(bevels, 1));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.userData = { polygonCount, bevelFaceCount, triangles: positions.length / 9 };
  return geometry;
}

function solidVolume(faces) {
  let volume = 0;
  for (const face of faces) {
    const first = face.vertices[0];
    for (let i = 1; i < face.vertices.length - 1; i++) {
      volume += first.dot(face.vertices[i].clone().cross(face.vertices[i + 1]));
    }
  }
  return Math.abs(volume / 6);
}

function solidData(faces) {
  const vertices = uniquePoints(faces.flatMap(face => face.vertices));
  return { faces, vertices, bounds: new THREE.Box3().setFromPoints(vertices), volume: solidVolume(faces) };
}

function shiftedSolid(solid, distance) {
  return solidData(solid.faces.map(face => ({
    ...face,
    vertices: face.vertices.map(p => new THREE.Vector3(p.x, p.y - distance, p.z)),
  })));
}

// Actual convex intersection, rather than bounding-box contact. The volume
// threshold rejects a point or edge touch that would still read as floating.
function solidsOverlap(a, b, minimumVolume = 0.00001) {
  if (!a.bounds.intersectsBox(b.bounds)) return false;
  for (const face of b.faces) {
    const distance = face.normal.dot(face.vertices[0]);
    if (a.vertices.every(p => face.normal.dot(p) > distance - EPS)) return false;
  }
  for (const face of a.faces) {
    const distance = face.normal.dot(face.vertices[0]);
    if (b.vertices.every(p => face.normal.dot(p) > distance - EPS)) return false;
  }
  let intersection = a.faces;
  for (const face of b.faces) {
    const distance = face.normal.dot(face.vertices[0]);
    intersection = clipSolid(intersection, face.normal, distance, 0.5);
    if (intersection.length < 4) return false;
  }
  return solidVolume(intersection) > minimumVolume;
}

// Face-axis intervals give a conservative range of downward movement in which
// two convex chunks could overlap. Exact clipping confirms the final position.
function supportInterval(child, parent) {
  let minimum = 0, maximum = 5;
  const margin = 0.035;
  for (const face of [...child.faces, ...parent.faces]) {
    const n = face.normal;
    let cMin = Infinity, cMax = -Infinity, pMin = Infinity, pMax = -Infinity;
    for (const p of child.vertices) { const d = n.dot(p); cMin = Math.min(cMin, d); cMax = Math.max(cMax, d); }
    for (const p of parent.vertices) { const d = n.dot(p); pMin = Math.min(pMin, d); pMax = Math.max(pMax, d); }
    const velocity = -n.y;
    if (Math.abs(velocity) < 1e-7) {
      if (cMax < pMin + margin || cMin > pMax - margin) return null;
      continue;
    }
    const a = (pMin + margin - cMax) / velocity;
    const b = (pMax - margin - cMin) / velocity;
    minimum = Math.max(minimum, Math.min(a, b));
    maximum = Math.min(maximum, Math.max(a, b));
    if (minimum > maximum) return null;
  }
  return [minimum, maximum];
}

function settleAssembly(pieces, shape) {
  const moved = [];
  let verifiedLinks = [];
  const replace = (index, solid, distance) => {
    const piece = pieces[index];
    verifiedLinks = verifiedLinks.filter(([a, b]) => a !== index && b !== index);
    piece.solid = solidData(clipSolid(solid.faces, new THREE.Vector3(0, -1, 0), 0, 0.39));
    piece.mesh.geometry.dispose();
    piece.mesh.geometry = toGeometry(piece.solid.faces, piece.toneOffset);
    if (distance > 0.0001) moved.push({ chunk: index, distance });
  };
  const settle = (index, supportIndices) => {
    const child = pieces[index].solid;
    const supports = supportIndices.map(i => pieces[i].solid);
    // A corner can technically intersect while the visible front still reads
    // as an air gap. Demand a meaningful buried portion of each upper chunk.
    const minimumVolume = child.volume * (supportIndices.length > 1 ? 0.025 : 0.08);
    if (supports.every(parent => solidsOverlap(child, parent, minimumVolume))) {
      verifiedLinks.push(...supportIndices.map(parent => [index, parent]));
      return;
    }
    let minimum = 0, maximum = 5;
    for (const parent of supports) {
      const interval = supportInterval(child, parent);
      if (!interval) return;
      minimum = Math.max(minimum, interval[0]);
      maximum = Math.min(maximum, interval[1]);
    }
    if (minimum > maximum) return;
    // Usually the first candidate succeeds. The small scan handles edge/edge
    // separations omitted by the cheaper face-axis interval calculation.
    for (let step = 0; step < 16; step++) {
      const distance = Math.min(maximum, minimum + 0.07 + step * 0.07);
      const candidate = shiftedSolid(child, distance);
      if (supports.every(parent => solidsOverlap(candidate, parent, minimumVolume))) {
        replace(index, candidate, distance);
        verifiedLinks.push(...supportIndices.map(parent => [index, parent]));
        return;
      }
      if (distance === maximum) break;
    }
  };
  if (shape === 'stack') {
    settle(1, [0]);
    settle(2, [0]);
    settle(3, [1]);
  } else if (shape === 'arch') {
    settle(2, [0]);
    settle(3, [1]);
    settle(4, [2, 3]);
  }
  const graph = () => {
    const links = [...verifiedLinks];
    const grounded = pieces.flatMap((piece, i) => piece.solid.bounds.min.y < 0.005 ? [i] : []);
    const reached = new Set(grounded);
    for (let pass = 0; pass < pieces.length; pass++) for (const [a, b] of links) {
      if (reached.has(a)) reached.add(b);
      if (reached.has(b)) reached.add(a);
    }
    // Only elevated pieces need a load path. Grounded shards may intentionally
    // sit apart, and testing every pair wastes work without proving more.
    for (let pass = 0; pass < pieces.length; pass++) {
      let changed = false;
      for (let i = 0; i < pieces.length; i++) {
        if (reached.has(i)) continue;
        for (const j of reached) {
          if (solidsOverlap(pieces[i].solid, pieces[j].solid)) {
            links.push([i, j]); reached.add(i); changed = true; break;
          }
        }
      }
      if (!changed) break;
    }
    const unsupported = pieces.flatMap((_, i) => reached.has(i) ? [] : [i]);
    return { grounded, links, unsupported };
  };
  // Some seeds lift the underside of nominally grounded shards. Settle any
  // remaining unsupported pieces into the floor as a deterministic fallback.
  // Elevated authored stacks normally resolve through their support links above.
  let connectivity = graph();
  for (const index of connectivity.unsupported) {
    const drop = pieces[index].solid.bounds.min.y + 0.02;
    if (drop > 0) replace(index, shiftedSolid(pieces[index].solid, drop), drop);
  }
  if (connectivity.unsupported.length) connectivity = graph();
  return { ...connectivity, settledChunks: moved };
}

// Value noise is sampled in asset coordinates, never per triangle. Shared
// vertices on a split shading seam therefore receive exactly the same offset.
function latticeNoise(x, y, z, seed) {
  const hash = (a, b, c) => {
    let n = Math.imul(a, 374761393) ^ Math.imul(b, 668265263) ^ Math.imul(c, 2147483647) ^ Math.imul(seed, 1274126177);
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967295 * 2 - 1;
  };
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const smooth = t => t * t * (3 - 2 * t);
  const fx = smooth(x - ix), fy = smooth(y - iy), fz = smooth(z - iz);
  const lerp = (a, b, t) => a + (b - a) * t;
  const row = (b, c) => lerp(hash(ix, b, c), hash(ix + 1, b, c), fx);
  return lerp(lerp(row(iy, iz), row(iy + 1, iz), fy), lerp(row(iy, iz + 1), row(iy + 1, iz + 1), fy), fz);
}

function surfaceUV(geometry) {
  if (geometry.hasAttribute('uv')) return;
  const p = geometry.attributes.position, n = geometry.attributes.normal, uv = [];
  for (let i = 0; i < p.count; i++) {
    const nx = Math.abs(n.getX(i)), ny = Math.abs(n.getY(i)), nz = Math.abs(n.getZ(i));
    if (ny >= nx && ny >= nz) uv.push(p.getX(i) * 0.5 + 0.5, p.getZ(i) * 0.5 + 0.5);
    else if (nx >= nz) uv.push(p.getZ(i) * 0.5 + 0.5, p.getY(i) * 0.5 + 0.5);
    else uv.push(p.getX(i) * 0.5 + 0.5, p.getY(i) * 0.5 + 0.5);
  }
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
}

function removeCollapsedTriangles(geometry) {
  const p = geometry.attributes.position, valid = [];
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (let i = 0; i < p.count; i += 3) {
    a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, i + 1); c.fromBufferAttribute(p, i + 2);
    if (b.sub(a).cross(c.sub(a)).lengthSq() > 1e-14) valid.push(i);
  }
  if (valid.length * 3 === p.count) return geometry;
  // A primitive is scaled into its assembly after triangulation. Test again
  // here because scaling a tiny corner cut can cross the precision threshold.
  for (const [name, attribute] of Object.entries(geometry.attributes)) {
    const output = new Float32Array(valid.length * 3 * attribute.itemSize);
    valid.forEach((start, triangle) => {
      const source = start * attribute.itemSize, count = 3 * attribute.itemSize;
      output.set(attribute.array.subarray(source, source + count), triangle * count);
    });
    geometry.setAttribute(name, new THREE.BufferAttribute(output, attribute.itemSize, attribute.normalized));
  }
  geometry.userData.triangles = valid.length;
  geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  return geometry;
}

function displaceGeometry(source, options, subdivisions) {
  surfaceUV(source);
  if (options.displacement <= 0) return source;
  const names = Object.keys(source.attributes);
  const sizes = names.map(name => source.attributes[name].itemSize);
  const offsets = sizes.map((_, i) => sizes.slice(0, i).reduce((a, b) => a + b, 0));
  const stride = sizes.reduce((a, b) => a + b, 0);
  const pOffset = offsets[names.indexOf('position')], nOffset = offsets[names.indexOf('normal')];
  let triangles = [];
  for (let i = 0; i < source.attributes.position.count; i += 3) {
    triangles.push([0, 1, 2].map(corner => {
      const vertex = [];
      names.forEach((name, a) => {
        const attribute = source.attributes[name];
        for (let j = 0; j < sizes[a]; j++) vertex.push(attribute.array[(i + corner) * sizes[a] + j]);
      });
      return vertex;
    }));
  }
  const midpoint = (a, b) => Array.from({ length: stride }, (_, i) => (a[i] + b[i]) * 0.5);
  for (let level = 0; level < subdivisions; level++) {
    const next = [];
    for (const [a, b, c] of triangles) {
      const ab = midpoint(a, b), bc = midpoint(b, c), ca = midpoint(c, a);
      next.push([a, ab, ca], [ab, b, bc], [ca, bc, c], [ab, bc, ca]);
    }
    triangles = next;
  }
  const normalSums = new Map(), deformed = new Map();
  const vertexKeys = new Map();
  const smoothAll = source.userData.smoothSurface;
  const seed = options.noiseSeed ?? options.seed;
  const frequency = options.geometryNoiseScale;
  // Amplitude falls as frequency increases, keeping the field injective enough
  // to avoid flipped faces even at the maximum noise setting.
  const amplitude = 0.13 * options.displacement * (source.userData.displacementWeight ?? 1) / (1 + frequency * 0.65);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), normal = new THREE.Vector3();
  const validTriangles = [];
  for (const triangle of triangles) {
    for (const vertex of triangle) {
      if (vertexKeys.has(vertex)) continue;
      const x = vertex[pOffset], y = vertex[pOffset + 1], z = vertex[pOffset + 2];
      const positionKey = `${Math.round(x * 1e6)},${Math.round(y * 1e6)},${Math.round(z * 1e6)}`;
      const shadingKey = smoothAll ? '' : `:${Math.round(vertex[nOffset] * 1e4)},${Math.round(vertex[nOffset + 1] * 1e4)},${Math.round(vertex[nOffset + 2] * 1e4)}`;
      const key = positionKey + shadingKey;
      vertexKeys.set(vertex, key);
      let displacement = deformed.get(positionKey);
      if (!displacement) {
        // Pin the floor and its immediate rim so cut bases remain flat and
        // collections preserve their grounding while the silhouette changes.
        const grounding = clamp(y / 0.16);
        displacement = [
          latticeNoise(x * frequency + 17, y * frequency, z * frequency, seed),
          latticeNoise(x * frequency, y * frequency + 43, z * frequency, seed + 151),
          latticeNoise(x * frequency, y * frequency, z * frequency + 71, seed + 307),
        ].map(value => value * amplitude * grounding);
        deformed.set(positionKey, displacement);
      }
      for (let axis = 0; axis < 3; axis++) vertex[pOffset + axis] = Math.fround(vertex[pOffset + axis] + displacement[axis]);
    }
    a.fromArray(triangle[0], pOffset); b.fromArray(triangle[1], pOffset); c.fromArray(triangle[2], pOffset);
    normal.crossVectors(b.sub(a), c.sub(a));
    // Subdivision of extremely thin bevel remnants can fall below Float32
    // precision. Omit only these zero-area triangles from the uploaded mesh.
    if (normal.lengthSq() <= 1e-14) continue;
    validTriangles.push(triangle);
    for (const vertex of triangle) {
      const key = vertexKeys.get(vertex);
      if (!normalSums.has(key)) normalSums.set(key, new THREE.Vector3());
      normalSums.get(key).add(normal);
    }
  }
  for (const sum of normalSums.values()) sum.normalize();
  const attributes = names.map(() => []);
  for (const triangle of validTriangles) {
    a.fromArray(triangle[0], pOffset); b.fromArray(triangle[1], pOffset); c.fromArray(triangle[2], pOffset);
    normal.crossVectors(b.sub(a), c.sub(a)).normalize();
    for (const vertex of triangle) {
      const averaged = normalSums.get(vertexKeys.get(vertex));
      // Preserve safe face orientation on tiny bevel slivers, which can share
      // a coordinate with a much larger adjacent face after quantization.
      (averaged.dot(normal) > 0.05 ? averaged : normal).toArray(vertex, nOffset);
      names.forEach((_, i) => {
        for (let j = 0; j < sizes[i]; j++) attributes[i].push(vertex[offsets[i] + j]);
      });
    }
  }
  const geometry = new THREE.BufferGeometry();
  names.forEach((name, i) => geometry.setAttribute(name, new THREE.Float32BufferAttribute(attributes[i], sizes[i])));
  geometry.userData = { ...source.userData, triangles: validTriangles.length, displaced: true };
  geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  source.dispose();
  return geometry;
}

function designedFaces(kind, rng, options) {
  let faces = cubeFaces(rng);
  if (kind === 'cylinder') {
    faces = [];
    const sides = 8 + Math.round(options.facets * 20), top = [], bottom = [];
    for (let i = 0; i < sides; i++) {
      const angle = i / sides * Math.PI * 2;
      top.push(new THREE.Vector3(Math.cos(angle), 1, Math.sin(angle)));
      bottom.push(new THREE.Vector3(Math.cos(angle), -1, Math.sin(angle)));
    }
    faces.push(polygon(top, UP, 0.58), polygon(bottom, UP.clone().negate(), 0.44));
    for (let i = 0; i < sides; i++) {
      const j = (i + 1) % sides;
      faces.push(polygon([top[i], top[j], bottom[j], bottom[i]], top[i].clone().add(top[j]).setY(0).normalize(), 0.43 + rng() * 0.12));
    }
  } else if (kind === 'wedge') {
    faces = clipSolid(faces, new THREE.Vector3(0, 1, 1).normalize(), 0, 0.55);
  }
  // Manufactured forms retain broad orthogonal planes. The irregularity
  // control chips corners, instead of replacing a block with a boulder.
  if (options.roughness > 0) for (let i = 0; i < 4 + Math.round(options.facets * 5); i++) {
    const normal = new THREE.Vector3(rng() < 0.5 ? -1 : 1, rng() < 0.5 ? -1 : 1, rng() < 0.5 ? -1 : 1);
    normal.x *= 0.7 + rng() * 0.6; normal.z *= 0.7 + rng() * 0.6; normal.normalize();
    const support = Math.max(...faces.flatMap(face => face.vertices.map(vertex => vertex.dot(normal))));
    faces = clipSolid(faces, normal, support - options.roughness * (0.06 + rng() * 0.19), 0.42 + rng() * 0.14);
  }
  return bevelSolid(faces, options.bevel * 0.095, options.roughness * 0.6);
}

function addSurfaceAttributes(indexed, smoothSurface = true) {
  const geometry = indexed.index ? indexed.toNonIndexed() : indexed;
  if (geometry !== indexed) indexed.dispose();
  const count = geometry.attributes.position.count;
  const colors = [], tones = [], bevels = [];
  for (let i = 0; i < count; i++) {
    colors.push(0.96, 0.96, 0.96); tones.push(0.5); bevels.push(0);
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute('aFaceTone', new THREE.Float32BufferAttribute(tones, 1));
  geometry.setAttribute('aBevel', new THREE.Float32BufferAttribute(bevels, 1));
  geometry.userData = { triangles: count / 3, polygonCount: count / 3, bevelFaceCount: 0, smoothSurface };
  return geometry;
}

function smoothGeometryNormals(geometry) {
  const p = geometry.attributes.position, n = geometry.attributes.normal;
  const sums = new Map(), keys = [];
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), normal = new THREE.Vector3();
  for (let i = 0; i < p.count; i += 3) {
    a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, i + 1); c.fromBufferAttribute(p, i + 2);
    normal.crossVectors(b.sub(a), c.sub(a));
    for (let j = 0; j < 3; j++) {
      const k = i + j, key = `${Math.round(p.getX(k) * 1e6)},${Math.round(p.getY(k) * 1e6)},${Math.round(p.getZ(k) * 1e6)}`;
      keys[k] = key;
      if (!sums.has(key)) sums.set(key, new THREE.Vector3());
      sums.get(key).add(normal);
    }
  }
  for (const sum of sums.values()) sum.normalize();
  for (let i = 0; i < p.count; i++) { const v = sums.get(keys[i]); n.setXYZ(i, v.x, v.y, v.z); }
}

function roundedGeometry(options) {
  const segments = 6 + Math.round(options.facets * 6);
  const geometry = new THREE.BoxGeometry(2, 2, 2, segments, segments, segments);
  const positions = geometry.attributes.position, normals = geometry.attributes.normal;
  const p = new THREE.Vector3(), core = new THREE.Vector3(), normal = new THREE.Vector3();
  for (let i = 0; i < positions.count; i++) {
    p.fromBufferAttribute(positions, i);
    const radius = (0.12 + options.bevel * 0.3) * (1 + options.roughness * 0.35 * latticeNoise(p.x * 1.4, p.y * 1.4, p.z * 1.4, options.seed));
    core.set(clamp(p.x, -1 + radius, 1 - radius), clamp(p.y, -1 + radius, 1 - radius), clamp(p.z, -1 + radius, 1 - radius));
    normal.copy(p).sub(core).normalize();
    p.copy(core).addScaledVector(normal, radius);
    positions.setXYZ(i, p.x, p.y, p.z); normals.setXYZ(i, normal.x, normal.y, normal.z);
  }
  const output = addSurfaceAttributes(geometry);
  if (options.roughness > 0) smoothGeometryNormals(output);
  return output;
}

function kitPrismFaces(section, depth, rng) {
  const points = section.map(([x, y]) => new THREE.Vector3(x, y, 0));
  const signedArea = points.reduce((sum, p, i) => {
    const next = points[(i + 1) % points.length];
    return sum + p.x * next.y - next.x * p.y;
  }, 0);
  if (signedArea < 0) points.reverse();
  const front = points.map(p => p.clone().setZ(depth / 2));
  const back = points.map(p => p.clone().setZ(-depth / 2));
  const faces = [polygon(front, new THREE.Vector3(0, 0, 1), .52), polygon(back, new THREE.Vector3(0, 0, -1), .46)];
  for (let i = 0; i < points.length; i++) {
    const j = (i + 1) % points.length, edge = points[j].clone().sub(points[i]);
    faces.push(polygon([front[i], back[i], back[j], front[j]], new THREE.Vector3(edge.y, -edge.x, 0).normalize(), .43 + rng() * .14));
  }
  return faces;
}

function closedKitHull(sourceFaces, minimumAreaSq = 1e-10) {
  // Intersecting bevel cuts can leave micrometre slivers on thin furniture.
  // Merge those vertices, then rebuild the closed convex surface instead of
  // dropping a degenerate triangle and leaving a hole for the fracture engine.
  let vertices = uniquePoints(sourceFaces.flatMap(face => face.vertices), .0002)
    .map(point => new THREE.Vector3(Math.fround(point.x), Math.fround(point.y), Math.fround(point.z)));
  let hull;
  for (let pass = 0; pass < 256; pass++) {
    hull = new ConvexHull().setFromPoints(vertices);
    let redundant = null;
    for (const face of hull.faces) {
      const triangle = [face.edge.head().point, face.edge.next.head().point, face.edge.next.next.head().point];
      const area = triangle[1].clone().sub(triangle[0]).cross(triangle[2].clone().sub(triangle[0])).lengthSq();
      // Leave area headroom for all three possible subdivision levels and
      // displacement. Otherwise a valid base sliver would reopen after detail.
      if (area > minimumAreaSq) continue;
      // The vertex opposite the longest edge is the nearly collinear one.
      const edges = triangle.map((point, i) => point.distanceToSquared(triangle[(i + 1) % 3]));
      redundant = triangle[(edges.indexOf(Math.max(...edges)) + 2) % 3];
      break;
    }
    if (!redundant) break;
    vertices = vertices.filter(point => point !== redundant);
  }
  return hull.faces.map(face => {
    const vertices = [face.edge.head().point, face.edge.next.head().point, face.edge.next.next.head().point];
    const center = vertices.reduce((sum, point) => sum.add(point), new THREE.Vector3()).multiplyScalar(1 / 3);
    // Recover the parent planar face, keeping its material metadata identical
    // across all hull triangles that form one broad face or bevel strip.
    let source = sourceFaces[0], closest = Infinity;
    for (const candidate of sourceFaces) {
      const score = (1 - candidate.normal.dot(face.normal)) * 2 + Math.abs(candidate.normal.dot(center.clone().sub(candidate.vertices[0])));
      if (score < closest) { closest = score; source = candidate; }
    }
    return { vertices, normal: face.normal.clone(), tone: source.tone, bevel: source.bevel };
  });
}

function buildKitAsset(options, material) {
  const group = new THREE.Group(), rng = randomGenerator(options.seed), solids = [];
  const furniture = KIT_GROUPS.furniture.includes(options.shape);
  group.name = `Procedural ${SHAPE_LABELS[options.shape]} ${options.seed}`;
  for (const part of createKitParts(options.shape, options.facets)) {
    let faces = part.kind === 'prism' ? kitPrismFaces(part.section, part.depth, rng)
      : designedFaces(part.kind, rng, { ...options, roughness: 0, bevel: 0 });
    if (part.kind !== 'prism') {
      const scale = new THREE.Matrix4().makeScale(...part.size.map(value => value / 2));
      const normalMatrix = new THREE.Matrix3().getNormalMatrix(scale);
      faces = faces.map(face => ({ ...face, vertices: face.vertices.map(p => p.clone().applyMatrix4(scale)), normal: face.normal.clone().applyMatrix3(normalMatrix).normalize() }));
    }
    for (const cut of part.cuts || []) {
      const normal = new THREE.Vector3(...cut.normal), length = normal.length();
      faces = clipSolid(faces, normal.divideScalar(length), cut.distance / length, .52);
    }
    const bounds = new THREE.Box3().setFromPoints(faces.flatMap(face => face.vertices));
    const dimensions = bounds.getSize(new THREE.Vector3()), smallest = Math.min(dimensions.x, dimensions.y, dimensions.z);
    // Small, localized wear preserves seats, ramps, and load-bearing joints.
    // Bevel after sizing: thin tabletops do not inherit stretched cube bevels.
    if (options.roughness > 0) for (let i = 0; i < 3; i++) {
      const normal = new THREE.Vector3(rng() < .5 ? -1 : 1, rng() < .5 ? -1 : 1, rng() < .5 ? -1 : 1).normalize();
      const distance = Math.max(...faces.flatMap(face => face.vertices.map(p => p.dot(normal))));
      faces = clipSolid(faces, normal, distance - smallest * options.roughness * (furniture ? .035 : .065), .44 + rng() * .12);
    }
    faces = bevelSolid(faces, smallest * options.bevel * (furniture ? .075 : .06), options.roughness * .22);
    const transform = new THREE.Matrix4().compose(new THREE.Vector3(...part.position), new THREE.Quaternion().setFromEuler(new THREE.Euler(...(part.rotation || [0, 0, 0]))), new THREE.Vector3(1, 1, 1));
    const normalMatrix = new THREE.Matrix3().getNormalMatrix(transform);
    faces = faces.map(face => ({ ...face, vertices: face.vertices.map(p => p.clone().applyMatrix4(transform)), normal: face.normal.clone().applyMatrix3(normalMatrix).normalize() }));
    if (part.grounded) {
      const minimum = Math.min(...faces.flatMap(face => face.vertices.map(p => p.y)));
      faces = faces.map(face => ({ ...face, vertices: face.vertices.map(p => p.clone().setY(p.y - minimum)) }));
      transform.premultiply(new THREE.Matrix4().makeTranslation(0, -minimum, 0));
    }
    faces = closedKitHull(faces);
    const solid = solidData(faces), geometry = toGeometry(faces);
    if (furniture) {
      const axis = part.kind === 'cylinder' ? 1 : part.size.indexOf(Math.max(...part.size));
      setStockGrainCoordinates(geometry, stockAxisMatrix(axis).multiply(transform.clone().invert()), group.children.length * .731);
    }
    geometry.userData.displacementWeight = furniture ? .22 : .4;
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = part.name; mesh.castShadow = true; mesh.receiveShadow = true;
    group.add(mesh); solids.push(solid);
  }
  // Structural overlap is intentional at mortises, capitals, and voussoirs.
  // Use actual convex volume intersections, including lateral arch joints;
  // never drop an upper part onto the floor to conceal a missing support.
  const grounded = solids.flatMap((solid, i) => solid.bounds.min.y < .002 ? [i] : []);
  const links = [];
  for (let i = 0; i < solids.length; i++) for (let j = 0; j < i; j++) {
    if (solidsOverlap(solids[i], solids[j], 1e-7)) links.push([i, j]);
  }
  const supported = new Set(grounded);
  for (let pass = 0; pass < solids.length; pass++) for (const [a, b] of links) {
    if (supported.has(a)) supported.add(b);
    if (supported.has(b)) supported.add(a);
  }
  const unsupported = solids.flatMap((_, i) => supported.has(i) ? [] : [i]);
  return finalizeAsset(group, options, { grounded, links, unsupported, settledChunks: [], jointTolerance: 0, method: 'convex-volume-intersection' });
}

function terrainPartFaces(points, rng) {
  const hull = new ConvexHull().setFromPoints(points.map(point => new THREE.Vector3(...point))), planes = new Map();
  // Coalesce coplanar hull triangles before wear. Broad stone faces retain one
  // tone and normal instead of revealing their arbitrary upload triangulation.
  for (const face of hull.faces) {
    const vertices = [face.edge.head().point, face.edge.next.head().point, face.edge.next.next.head().point];
    const key = [...face.normal.toArray(), face.normal.dot(vertices[0])].map(value => Math.round(value * 1e6)).join(',');
    if (!planes.has(key)) planes.set(key, { normal: face.normal.clone(), vertices: [] });
    planes.get(key).vertices.push(...vertices);
  }
  return [...planes.values()].map(face => polygon(face.vertices, face.normal, .42 + rng() * .15 + Math.max(0, face.normal.y) * .025));
}

function buildTerrainAsset(options, material) {
  const group = new THREE.Group(), rng = randomGenerator(options.seed), solids = [];
  group.name = `Procedural ${SHAPE_LABELS[options.shape]} ${options.seed}`;
  for (const part of createTerrainParts(options.shape, options)) {
    let faces = terrainPartFaces(part.points, rng);
    const bounds = new THREE.Box3().setFromPoints(faces.flatMap(face => face.vertices));
    const dimensions = bounds.getSize(new THREE.Vector3()), smallest = Math.min(dimensions.x, dimensions.y, dimensions.z);
    const wear = options.roughness * (part.stony ? .07 : .025);
    if (wear > 0) for (let i = 0; i < 3 + Math.round(options.facets * 5); i++) {
      const normal = new THREE.Vector3(rng() < .5 ? -1 : 1, rng() < .5 ? -1 : 1, rng() < .5 ? -1 : 1);
      normal.x *= .7 + rng() * .7; normal.z *= .7 + rng() * .7; normal.normalize();
      const distance = Math.max(...faces.flatMap(face => face.vertices.map(point => normal.dot(point))));
      faces = clipSolid(faces, normal, distance - smallest * wear * (.4 + rng() * .6), .43 + rng() * .16);
    }
    faces = bevelSolid(faces, smallest * options.bevel * (part.walkable ? .025 : .04), options.roughness * .4);
    // Broad terrain bevels need extra area headroom before displacement
    // subdivision, particularly where an overhang meets a slanted crown.
    faces = closedKitHull(faces, 1e-8);
    if (part.grounded) {
      const minimum = Math.min(...faces.flatMap(face => face.vertices.map(point => point.y)));
      faces = faces.map(face => ({ ...face, vertices: face.vertices.map(point => point.clone().setY(point.y - minimum)) }));
    }
    const geometry = toGeometry(faces);
    geometry.userData.displacementWeight = part.walkable ? .18 : .5;
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = part.name; mesh.userData.materialSlot = 'primary';
    mesh.castShadow = true; mesh.receiveShadow = true;
    group.add(mesh); solids.push(solidData(faces));
  }
  const grounded = solids.flatMap((solid, i) => solid.bounds.min.y < .002 ? [i] : []), links = [];
  for (let i = 0; i < solids.length; i++) for (let j = 0; j < i; j++) if (solidsOverlap(solids[i], solids[j], 1e-7)) links.push([i, j]);
  const reached = new Set(grounded);
  for (let pass = 0; pass < solids.length; pass++) for (const [a, b] of links) {
    if (reached.has(a)) reached.add(b);
    if (reached.has(b)) reached.add(a);
  }
  const unsupported = solids.flatMap((_, i) => reached.has(i) ? [] : [i]);
  return finalizeAsset(group, options, { grounded, links, unsupported, settledChunks: [], jointTolerance: 0, method: 'convex-volume-intersection' });
}

function buildWorkshopAsset(options, material, wood = false) {
  const group = new THREE.Group();
  group.name = `Procedural ${SHAPE_LABELS[options.shape]} ${options.seed}`;
  for (const part of wood ? createWoodParts(options.shape, options) : createWorkshopParts(options.shape, options)) {
    const metadata = { ...part.geometry.userData };
    // A vessel's floor and rim need crease normals. Averaging all adjacent
    // faces there can point a smooth normal inside a sharply concave neck.
    const creased = toCreasedNormals(part.geometry, .7);
    if (creased !== part.geometry) part.geometry.dispose();
    const geometry = addSurfaceAttributes(creased, false);
    if (options.shape === 'splitLog') {
      // The sawn longitudinal plane is exposed wood; the half-round shell
      // remains bark. Store a face mask so material edits and recuts retain it.
      const stock = geometry.attributes.aWoodPosition, mask = new Float32Array(stock.count).fill(1);
      for (let i = 0; i < stock.count; i += 3) {
        if ([0, 1, 2].every(corner => Math.abs(stock.getZ(i + corner)) < 0.0001)) mask.fill(0, i, i + 3);
      }
      geometry.setAttribute('aWoodBarkMask', new THREE.BufferAttribute(mask, 1));
    }
    // ExtrudeGeometry distinguishes caps and sides for generic multimaterials.
    // Both are exterior here; Pinata reserves material group 1 for fresh cuts.
    geometry.clearGroups();
    Object.assign(geometry.userData, metadata, { displacementWeight: wood ? .16 : .035, smoothSurface: false });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = part.name;
    mesh.userData.materialSlot = part.materialSlot;
    mesh.castShadow = true; mesh.receiveShadow = true;
    group.add(mesh);
  }
  // Authored assembled parts overlap at their joints. Keep concave shapes as
  // true closed surfaces: a convex hull would incorrectly fill their openings.
  group.updateMatrixWorld(true);
  const bounds = group.children.map(mesh => new THREE.Box3().setFromObject(mesh));
  const minimum = Math.min(...bounds.map(box => box.min.y));
  const grounded = bounds.flatMap((box, i) => box.min.y < minimum + .002 ? [i] : []), links = [];
  for (let i = 0; i < bounds.length; i++) for (let j = 0; j < i; j++) if (bounds[i].clone().expandByScalar(.002).intersectsBox(bounds[j])) links.push([i, j]);
  const reached = new Set(grounded);
  for (let pass = 0; pass < bounds.length; pass++) for (const [a, b] of links) {
    if (reached.has(a)) reached.add(b);
    if (reached.has(b)) reached.add(a);
  }
  const unsupported = bounds.flatMap((_, i) => reached.has(i) ? [] : [i]);
  return finalizeAsset(group, options, { grounded, links, unsupported, settledChunks: [], jointTolerance: .002, method: 'authored-assembly-overlap' });
}

function buildDesignedAsset(options, material) {
  const group = new THREE.Group(), rng = randomGenerator(options.seed), pieces = [];
  group.name = `Procedural ${options.shape} ${options.seed}`;
  const add = (kind, position, size, rotation = [0, 0, 0], modifiers = {}) => {
    const local = { ...options, ...modifiers };
    let geometry;
    if (kind === 'sphere') {
      const segments = 20 + Math.round(local.facets * 20);
      geometry = addSurfaceAttributes(new THREE.SphereGeometry(1, segments, Math.ceil(segments * 0.65)));
      if (local.roughness > 0) {
        const p = geometry.attributes.position;
        const v = new THREE.Vector3();
        for (let i = 0; i < p.count; i++) {
          v.fromBufferAttribute(p, i);
          const strength = 1 + latticeNoise(v.x * 1.7 + 5, v.y * 1.7, v.z * 1.7, options.seed) * local.roughness * 0.13;
          v.multiplyScalar(strength); p.setXYZ(i, v.x, v.y, v.z);
        }
        smoothGeometryNormals(geometry);
      }
    } else if (kind === 'roundedBlock') geometry = roundedGeometry(local);
    else geometry = toGeometry(designedFaces(kind, rng, local));
    const matrix = new THREE.Matrix4().compose(new THREE.Vector3(...position), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)), new THREE.Vector3(...size).multiplyScalar(0.5));
    geometry.applyMatrix4(matrix); geometry.computeBoundingBox(); geometry.computeBoundingSphere();
    // Stock uses its own length axis before assembly rotation. A rectangular
    // brick used as a board must show long grain along its length, not its depth.
    const grainTransform = new THREE.Matrix4().compose(new THREE.Vector3(...position), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)), new THREE.Vector3(1, 1, 1));
    const grainAxis = kind === 'cylinder' || kind === 'sphere' ? 1 : size.indexOf(Math.max(...size));
    setStockGrainCoordinates(geometry, stockAxisMatrix(grainAxis).multiply(grainTransform.invert()), group.children.length * .731);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `${SHAPE_LABELS[kind] || 'Stone'} ${group.children.length + 1}`;
    mesh.castShadow = true; mesh.receiveShadow = true; group.add(mesh);
    pieces.push({ mesh, bounds: geometry.boundingBox.clone() });
  };
  switch (options.shape) {
    case 'block': add('block', [0, 1.15, 0], [2.3, 2.3, 2.3]); break;
    case 'brick': add('block', [0, 0.54, 0], [3.2, 1.08, 1.55]); break;
    case 'sphere': add('sphere', [0, 1.35, 0], [2.7, 2.7, 2.7]); break;
    case 'cylinder': add('cylinder', [0, 1.35, 0], [2.2, 2.7, 2.2]); break;
    case 'wedge': add('wedge', [0, 0.95, 0], [2.8, 1.9, 2.7]); break;
    case 'roundedBlock': add('roundedBlock', [0, 1.2, 0], [2.5, 2.4, 2.5]); break;
    case 'wall': {
      const height = 0.53, gap = 0.025, width = 1.02;
      // Alternate full rows and half-brick end caps: a genuine running bond.
      for (let row = 0; row < 5; row++) {
        const widths = row % 2 ? [0.495, width, width, 0.495] : [width, width, width];
        let x = -1.555;
        for (const w of widths) {
          add('block', [x + w * 0.5, height * 0.5 + row * (height + gap), 0], [w, height, 0.81], [0, 0, 0], { roughness: options.roughness * 0.5 });
          x += w + gap;
        }
      }
      break;
    }
    case 'monolith':
      add('block', [0, 1.57, 0], [1.14, 3.14, 0.93], [0, -0.08, 0], { roughness: options.roughness * 0.7 });
      break;
    case 'columns': {
      const spots = [[-0.78, 0], [0, -0.12], [0.78, 0.02], [-0.37, 0.65], [0.43, 0.63], [-0.38, -0.74], [0.4, -0.72]];
      spots.forEach(([x, z], i) => {
        const height = [1.63, 3.02, 2.2, 1.1, 1.49, 2.37, 1.79][i];
        add('cylinder', [x, height / 2, z], [0.87, height, 0.87], [0, Math.PI / 6, 0], { facets: 0, bevel: options.bevel * 0.55 });
      });
      break;
    }
    case 'stairs':
      for (let i = 0; i < 5; i++) {
        const height = (i + 1) * 0.48;
        add('block', [0, height * 0.5, 1.14 - i * 0.57], [2.5, height, 0.58], [0, 0, 0], { roughness: options.roughness * 0.45 });
      }
      break;
    case 'ruins':
      add('block', [0, 0.19, 0], [3.15, 0.38, 1.65], [0, 0, 0], { roughness: options.roughness * 0.6 });
      add('block', [-0.93, 1.35, -0.17], [0.62, 1.98, 0.75]);
      add('block', [0.93, 1.35, -0.17], [0.62, 1.98, 0.75]);
      add('block', [0, 2.48, -0.17], [2.66, 0.42, 0.94]);
      add('block', [0.2, 0.64, 0.29], [1.29, 0.61, 0.62], [0, 0.29, -0.23]);
      break;
    case 'cairn': {
      const heights = [0.66, 0.64, 0.6, 0.54, 0.46], widths = [2.25, 1.85, 1.51, 1.13, 0.77];
      let base = 0;
      heights.forEach((height, i) => {
        add('roundedBlock', [(i % 2 ? 0.09 : -0.04), base + height / 2, (i % 3 - 1) * 0.055], [widths[i], height, widths[i] * 0.77], [0, i * 0.31, 0]);
        base += height - 0.035;
      });
      break;
    }
  }
  // Connected-support diagnostics for modular solids. Designed walls have a
  // 2.5 cm mortar joint; bounded gaps are explicit and included in this check.
  const grounded = pieces.flatMap((piece, i) => piece.bounds.min.y <= 0.005 ? [i] : []);
  const links = [], reached = new Set(grounded);
  for (let pass = 0; pass < pieces.length; pass++) for (let i = 0; i < pieces.length; i++) {
    if (reached.has(i)) continue;
    const a = pieces[i].bounds;
    for (const j of reached) {
      const b = pieces[j].bounds;
      const overlapX = Math.min(a.max.x, b.max.x) - Math.max(a.min.x, b.min.x);
      const overlapZ = Math.min(a.max.z, b.max.z) - Math.max(a.min.z, b.min.z);
      if (overlapX > 0.05 && overlapZ > 0.05 && a.min.y <= b.max.y + 0.026 && a.max.y >= b.min.y) {
        reached.add(i); links.push([i, j]); break;
      }
    }
  }
  const settledChunks = [];
  for (let i = 0; i < pieces.length; i++) if (!reached.has(i)) {
    // The irregular sphere can have a slightly elevated lowest point. Place
    // single primitives exactly on the floor before recording their support.
    const drop = pieces[i].bounds.min.y;
    pieces[i].mesh.geometry.translate(0, -drop, 0);
    grounded.push(i); reached.add(i); settledChunks.push({ chunk: i, distance: drop });
  }
  return finalizeAsset(group, options, { grounded, links, unsupported: [], settledChunks, jointTolerance: options.shape === 'wall' ? 0.026 : 0 });
}

function finalizeAsset(group, options, connectivity) {
  const total = group.children.reduce((sum, mesh) => sum + mesh.geometry.attributes.position.count / 3, 0);
  const subdivisions = Math.max(0, Math.min(3, Math.floor(Math.log(36000 / total) / Math.log(4))));
  for (const mesh of group.children) {
    removeCollapsedTriangles(mesh.geometry);
    mesh.geometry = displaceGeometry(mesh.geometry, options, subdivisions);
    surfaceUV(mesh.geometry);
  }
  group.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(group);
  const dimensions = bounds.getSize(new THREE.Vector3()), center = bounds.getCenter(new THREE.Vector3());
  const scale = Math.min(KIT_SHAPES.has(options.shape) || WORKSHOP_SHAPES.has(options.shape) || TERRAIN_SHAPES.has(options.shape) || WOOD_SHAPES.has(options.shape) ? 1 : Infinity, 3.6 / dimensions.x, 3.4 / dimensions.y, 3.2 / dimensions.z);
  for (const mesh of group.children) {
    mesh.position.x = (mesh.position.x - center.x) * scale;
    mesh.position.y = (mesh.position.y - bounds.min.y) * scale;
    mesh.position.z = (mesh.position.z - center.z) * scale;
    mesh.scale.multiplyScalar(scale);
  }
  group.updateMatrixWorld(true);
  group.userData = {
    options, chunks: group.children.length,
    triangles: group.children.reduce((sum, mesh) => sum + mesh.geometry.userData.triangles, 0),
    polygons: group.children.reduce((sum, mesh) => sum + mesh.geometry.userData.polygonCount, 0),
    bevelFaces: group.children.reduce((sum, mesh) => sum + mesh.geometry.userData.bevelFaceCount, 0),
    generated: true, connectivity,
  };
  return group;
}

/** Create a deterministic group of flat-shaded, bevelled convex rock chunks.
 * Size parameters below describe full, approximate chunk dimensions.
 * The group has its base at y=0 and is centered horizontally.
 */
export function buildAsset(input = {}, material) {
  const options = {
    seed: Number.isFinite(Number(input.seed)) ? Number(input.seed) : 1,
    shape: input.shape || 'boulder',
    facets: clamp(Number.isFinite(input.facets) ? input.facets : 0.5),
    roughness: clamp(Number.isFinite(input.roughness) ? input.roughness : 0.35),
    bevel: clamp(Number.isFinite(input.bevel) ? input.bevel : 0.5),
    displacement: clamp(Number.isFinite(input.displacement) ? input.displacement : 0),
    geometryNoiseScale: clamp(Number.isFinite(input.geometryNoiseScale) ? input.geometryNoiseScale : (Number.isFinite(input.noiseScale) ? input.noiseScale : 2), 0.3, 8),
    noiseSeed: Number.isFinite(Number(input.noiseSeed)) ? Number(input.noiseSeed) : undefined,
  };
  if (PATH_SHAPES.has(options.shape)) return buildPathAsset({ ...input, ...options }, material, buildAsset);
  if (WOOD_SHAPES.has(options.shape)) return buildWorkshopAsset(options, material, true);
  if (WORKSHOP_SHAPES.has(options.shape)) return buildWorkshopAsset({ ...options, ...sanitizeWorkshopOptions(input) }, material);
  if (TERRAIN_SHAPES.has(options.shape)) return buildTerrainAsset(options, material);
  if (KIT_SHAPES.has(options.shape)) return buildKitAsset(options, material);
  if (SHAPE_GROUPS.slice(1).some(section => section.shapes.includes(options.shape))) return buildDesignedAsset(options, material);
  const rng = randomGenerator(options.seed);
  const group = new THREE.Group();
  const pieces = [];
  group.name = `Procedural ${options.shape} ${options.seed}`;
  const add = (position, size, rotation = [0, 0, 0], crystal = false) => {
    let faces = crystal ? crystalFaces(rng, options) : rockFaces(rng, options);
    const matrix = new THREE.Matrix4().compose(
      new THREE.Vector3(...position),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)),
      new THREE.Vector3(size[0] / 2, size[1] / 2, size[2] / 2),
    );
    const normalMatrix = new THREE.Matrix3().getNormalMatrix(matrix);
    faces = faces.map(face => ({
      ...face,
      vertices: face.vertices.map(p => p.clone().applyMatrix4(matrix)),
      normal: face.normal.clone().applyMatrix3(normalMatrix).normalize(),
    }));
    // Bake the authored rotations into vertices, then slice a common flat base.
    // This lets stones lean naturally while remaining solidly grounded.
    faces = clipSolid(faces, new THREE.Vector3(0, -1, 0), 0, 0.39);
    const toneOffset = (rng() - 0.5) * 0.06;
    const mesh = new THREE.Mesh(toGeometry(faces, toneOffset), material);
    mesh.name = `${crystal ? 'Crystal' : 'Rock'} ${group.children.length + 1}`;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    pieces.push({ mesh, solid: solidData(faces), toneOffset });
  };
  // The layout is authored, while each block's planes and proportions vary.
  // Narrow overlaps hide inside faces and produce deep readable seam shadows.
  switch (options.shape) {
    case 'stack':
      add([0, 0.43, 0], [3.35, 1.0, 2.6], [0, 0.03, 0]);
      add([-0.61, 1.15, -0.18], [1.82, 1.58, 1.9], [0, -0.05, -0.035]);
      add([0.83, 0.97, 0.25], [1.65, 1.18, 1.55], [0, 0.11, -0.04]);
      add([-0.55, 2.08, -0.4], [1.4, 1.45, 1.32], [0.04, -0.05, -0.11]);
      break;
    case 'slab':
      add([-0.68, 0.47, -0.3], [2.15, 1.0, 2.0], [0, -0.05, 0]);
      add([0.89, 0.47, -0.28], [1.85, 0.98, 2.04], [0, 0.035, 0.01]);
      add([-0.69, 0.34, 0.86], [2.0, 0.78, 1.16], [0, 0.02, 0]);
      add([0.88, 0.33, 0.79], [1.74, 0.78, 1.25], [0, -0.04, 0]);
      break;
    case 'spire':
      add([0.14, 1.52, -0.13], [1.65, 3.42, 1.46], [0.05, -0.08, -0.18]);
      add([-0.72, 0.88, 0.17], [1.3, 1.95, 1.47], [0.04, 0.18, -0.08]);
      add([0.66, 0.49, 0.31], [1.3, 1.12, 1.25], [0, 0.25, -0.1]);
      add([-0.31, 0.38, 0.88], [1.4, 0.94, 1.0], [0.07, -0.1, 0.06]);
      break;
    case 'crystals':
      add([0.17, 1.54, -0.14], [1.05, 3.05, 0.99], [0.01, 0.17, -0.16], true);
      add([-0.76, 0.9, -0.02], [0.75, 2.0, 0.74], [-0.05, -0.18, 0.17], true);
      add([0.85, 0.67, 0.13], [0.77, 1.67, 0.77], [0.13, 0.2, -0.34], true);
      add([-0.14, 0.8, 0.7], [0.81, 1.92, 0.69], [0.2, 0.11, -0.17], true);
      add([-0.93, 0.33, 0.47], [0.5, 0.94, 0.5], [0.22, 0.28, 0.38], true);
      add([0.69, 0.29, 0.82], [0.49, 0.84, 0.45], [0.28, -0.17, -0.38], true);
      break;
    case 'arch':
      add([-1.03, 0.72, 0.04], [1.12, 1.63, 1.42], [0.06, -0.07, -0.05]);
      add([1.05, 0.75, 0.03], [1.15, 1.7, 1.44], [-0.03, 0.1, 0.06]);
      add([-0.81, 1.63, -0.12], [1.08, 1.48, 1.35], [0.03, -0.05, -0.38]);
      add([0.79, 1.69, -0.12], [1.04, 1.44, 1.37], [-0.02, 0.13, 0.39]);
      add([0.02, 2.12, -0.17], [1.92, 1.16, 1.56], [0.03, 0.09, 0.02]);
      add([-1.41, 0.23, 0.38], [0.81, 0.59, 1.03], [0, 0.06, 0]);
      add([1.39, 0.19, 0.37], [0.73, 0.52, 0.98], [0, -0.13, 0]);
      break;
    default:
      add([-0.12, 0.96, -0.13], [2.79, 2.68, 2.63], [0.16, -0.22, -0.24]);
      add([0.82, 0.65, 0.37], [1.79, 1.71, 1.92], [0.19, -0.28, -0.23]);
      add([-0.85, 0.46, 0.57], [1.65, 1.43, 1.68], [-0.18, 0.36, 0.24]);
      add([0.24, 0.34, 0.99], [1.42, 1.02, 1.18], [-0.14, 0.25, -0.31]);
      break;
  }
  const connectivity = settleAssembly(pieces, options.shape);
  return finalizeAsset(group, options, connectivity);
}

/** Shared materials belong to the caller and are deliberately preserved. */
export function disposeAsset(group) {
  const geometries = new Set();
  group.traverse(object => {
    if (object.geometry && !geometries.has(object.geometry)) {
      geometries.add(object.geometry);
      object.geometry.dispose();
    }
  });
}
