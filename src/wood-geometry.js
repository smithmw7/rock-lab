import * as THREE from 'three';

export const WOOD_GROUPS = [{ id: 'timber', label: 'Timber', description: 'Worn boards, split stock, bark-covered logs, and branch stumps.', shapes: ['wornPlank', 'timberBeam', 'barkLog', 'splitLog', 'treeStump'] }];
export const WOOD_SHAPES = new Set(WOOD_GROUPS.flatMap(group => group.shapes));
export const WOOD_CATALOG = {
  wornPlank: { label: 'Worn plank', title: 'Chipped wooden plank', description: 'Long stock with shallow raised grain and a worn cut rim', kind: 'wood', defaultSurface: 'oak', icon: 'M2 13 23 4 30 9 29 18 9 28 2 23Z M2 13 9 18 30 9 M9 18 9 28 M8 13 24 7 M13 18 26 12' },
  timberBeam: { label: 'Timber beam', title: 'Heavy timber beam', description: 'Thick square stock with uneven bevels and chipped ends', kind: 'wood', defaultSurface: 'oak', icon: 'M3 11 23 2 30 8 30 20 10 30 3 23Z M3 11 10 17 30 8 M10 17 V30 M8 11 24 5 M16 21 27 15' },
  barkLog: { label: 'Bark log', title: 'Ridged log with branches', description: 'Irregular raised bark and attached cut branch stubs', kind: 'wood', defaultSurface: 'oak', woodPattern: 'bark', icon: 'M4 16 22 5 Q29 3 30 10 L11 28 Q3 30 2 23 Q1 18 4 16Z M5 17 Q13 15 13 23 M12 16 21 10 M16 10 14 5 18 4 21 7 M21 16 25 18 28 15' },
  splitLog: { label: 'Split log', title: 'Half log with a split face', description: 'Flat split face above a rough half-round bark shell', kind: 'wood', defaultSurface: 'oak', woodPattern: 'split', icon: 'M3 14 23 3 30 11 11 28 Q2 27 3 14Z M3 14 11 20 30 11 M11 20 V28 M9 14 24 7' },
  treeStump: { label: 'Tree stump', title: 'Rooted stump with a branch', description: 'Flared rooted base, raised bark ridges, and a cut crown', kind: 'wood', defaultSurface: 'oak', woodPattern: 'bark', icon: 'M3 29 8 21 9 7 Q16 2 24 7 L25 21 30 29 21 27 16 30 10 27Z M9 7 Q16 13 24 7 M14 11 12 24 M21 11 22 25 M23 14 28 10 30 12 25 18' },
};

const clamp = (value, low = 0, high = 1) => Math.min(high, Math.max(low, value));
const hash = (seed, index) => {
  let value = Math.imul((seed >>> 0) ^ (index + 1), 1597334677);
  value = Math.imul(value ^ (value >>> 16), 2246822507);
  return ((value ^ (value >>> 13)) >>> 0) / 4294967295;
};

/** Grain is measured in stock units, with longitudinal grain along local Y.
 * Only Y is offset between pieces so cut-end ring centers stay inside the wood.
 */
export function setStockGrainCoordinates(geometry, assetToStock = new THREE.Matrix4(), longitudinalOffset = 0) {
  const matrix = new THREE.Matrix4().makeTranslation(0, longitudinalOffset, 0).multiply(assetToStock);
  const position = geometry.attributes.position, grain = new Float32Array(position.count * 4), point = new THREE.Vector3();
  for (let i = 0; i < position.count; i++) {
    point.fromBufferAttribute(position, i).applyMatrix4(matrix);
    grain.set([point.x, point.y, point.z, 1], i * 4);
  }
  geometry.setAttribute('aWoodPosition', new THREE.BufferAttribute(grain, 4));
  return geometry;
}

export function stockAxisMatrix(axis = 1) {
  // Proper rotations preserve the orientation used by derivative-based relief.
  return axis === 0 ? new THREE.Matrix4().makeRotationZ(Math.PI / 2)
    : axis === 2 ? new THREE.Matrix4().makeRotationX(-Math.PI / 2) : new THREE.Matrix4();
}

function closedLoft(rings) {
  const sides = rings[0].length, positions = [], indices = [];
  for (const ring of rings) for (const point of ring) positions.push(...point);
  for (let ring = 0; ring < rings.length - 1; ring++) for (let side = 0; side < sides; side++) {
    const next = (side + 1) % sides, a = ring * sides + side, b = ring * sides + next;
    const c = (ring + 1) * sides + side, d = (ring + 1) * sides + next;
    indices.push(a, c, b, b, c, d);
  }
  for (const [ringIndex, reverse] of [[0, false], [rings.length - 1, true]]) {
    const center = rings[ringIndex].reduce((sum, point) => sum.add(point), new THREE.Vector3()).multiplyScalar(1 / sides);
    const middle = positions.length / 3; positions.push(...center);
    for (let side = 0; side < sides; side++) {
      const a = ringIndex * sides + side, b = ringIndex * sides + (side + 1) % sides;
      indices.push(middle, reverse ? b : a, reverse ? a : b);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geometry.setIndex(indices);
  // One global orientation decision keeps every shared edge oppositely wound.
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  let volume = 0;
  for (let i = 0; i < indices.length; i += 3) {
    a.fromBufferAttribute(geometry.attributes.position, indices[i]); b.fromBufferAttribute(geometry.attributes.position, indices[i + 1]); c.fromBufferAttribute(geometry.attributes.position, indices[i + 2]);
    volume += a.dot(b.cross(c));
  }
  if (volume < 0) for (let i = 0; i < indices.length; i += 3) [indices[i + 1], indices[i + 2]] = [indices[i + 2], indices[i + 1]];
  geometry.setIndex(indices); geometry.computeVertexNormals();
  geometry.userData = { woodStock: true, smoothSurface: false };
  return geometry;
}

function board(input, beam = false) {
  const seed = Number(input.seed) || 1, wear = clamp(input.roughness ?? .35), bevel = clamp(input.bevel ?? .5);
  const width = beam ? .7 : 1.02, depth = beam ? .64 : .23, length = beam ? 3.2 : 3.12;
  const cut = Math.min(width, depth) * (.05 + bevel * .2);
  const section = [
    [-width / 2 + cut, -depth / 2], [width / 2 - cut, -depth / 2], [width / 2, -depth / 2 + cut],
    [width / 2, depth / 2 - cut], [width / 2 - cut, depth / 2], [width * .23, depth / 2],
    [-width * .12, depth / 2], [-width / 2 + cut, depth / 2], [-width / 2, depth / 2 - cut], [-width / 2, -depth / 2 + cut],
  ];
  const stations = 7 + Math.round(clamp(input.facets ?? .5) * 6), phase = hash(seed, 3) * Math.PI * 2;
  const rings = [];
  for (let station = 0; station <= stations; station++) {
    const t = station / stations, rim = station === 0 || station === stations;
    rings.push(section.map(([x, z], side) => {
      const sideNoise = Math.sin(t * 4.7 + phase + side * .7), edgeNoise = hash(seed, side + station * 19);
      const corner = side === 0 || side === 1 || side === 4 || side === 7;
      const chip = rim && corner ? wear * length * (.008 + edgeNoise * .012) : 0;
      const y = (t - .5) * length + (station === 0 ? chip : station === stations ? -chip : 0);
      const crossWear = 1 + sideNoise * wear * .035 + (rim ? (edgeNoise - .5) * wear * .045 : 0);
      const relief = side >= 4 && side <= 7 ? wear * depth * Math.sin(side * 3.2 + phase + t * 1.8) * .06 : 0;
      return new THREE.Vector3(x * crossWear + Math.sin(t * Math.PI) * wear * .025, y, z * crossWear + relief);
    }));
  }
  return closedLoft(rings);
}

function log(input, { length = 2.75, radius = .52, stump = false, split = false, branch = false } = {}) {
  const seed = Number(input.seed) || 1, wear = clamp(input.roughness ?? .35), bevel = clamp(input.bevel ?? .5), detail = clamp(input.facets ?? .5);
  const sides = branch ? 12 : 20 + Math.round(detail * 12) * 2, stations = branch ? 4 : 7 + Math.round(detail * 5);
  const phase = hash(seed, 5) * Math.PI * 2, ribCount = branch ? 5 : 7;
  const rings = [];
  for (let station = 0; station <= stations; station++) {
    const t = station / stations, rim = station === 0 || station === stations;
    const taper = stump ? 1 + .54 * (1 - t) ** 4 - t * .14 : 1 - t * (branch ? .3 : .09);
    const rimScale = rim ? 1 - (.015 + bevel * .045) : 1;
    const ring = [];
    for (let side = 0; side < sides; side++) {
      const angle = split ? Math.PI + side / (sides - 1) * Math.PI : side / sides * Math.PI * 2;
      const ridge = Math.sin(angle * ribCount + phase + Math.sin(t * 4 + phase) * .27);
      const secondary = Math.sin(angle * (ribCount + 4) - phase + t * 2.1);
      const roots = stump ? Math.cos(angle * 5 + phase) * (1 - t) ** 4 * .12 : 0;
      const radial = radius * taper * rimScale * (1 + ridge * (.035 + wear * .055) + secondary * wear * .025 + roots);
      const endChip = rim ? (hash(seed, side + station * 13) - .5) * radius * wear * .12 : 0;
      const bend = Math.sin(t * Math.PI) * radius * wear * .06;
      ring.push(new THREE.Vector3(Math.cos(angle) * radial + bend, t * length + endChip, Math.sin(angle) * radial));
    }
    rings.push(ring);
  }
  return closedLoft(rings);
}

export function createWoodParts(shape, input = {}) {
  const parts = [], seed = Number(input.seed) || 1;
  const add = (name, geometry, position = [0, 0, 0], rotation = new THREE.Quaternion(), offset = 0) => {
    const transform = new THREE.Matrix4().compose(new THREE.Vector3(...position), rotation, new THREE.Vector3(1, 1, 1));
    geometry.applyMatrix4(transform);
    setStockGrainCoordinates(geometry, transform.clone().invert(), offset);
    parts.push({ name, geometry, materialSlot: 'primary' });
  };
  const horizontal = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, -Math.PI / 2));
  if (shape === 'wornPlank' || shape === 'timberBeam') {
    // Local Z is the broad face; turn it upward and align the long axis to X.
    const rotation = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0)));
    add(shape === 'wornPlank' ? 'Worn board' : 'Chipped timber', board(input, shape === 'timberBeam'), [0, 0, 0], rotation);
  } else if (shape === 'splitLog') {
    const rotation = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0)));
    add('Half-round split log', log(input, { split: true }), [-1.375, .52, 0], rotation);
  } else if (shape === 'treeStump') {
    add('Root-flared stump', log(input, { length: 1.5, radius: .66, stump: true }));
    const direction = new THREE.Vector3(.78, .62, -.2).normalize();
    add('Cut branch stub', log({ ...input, seed: seed + 37 }, { length: .66, radius: .19, branch: true }), [.43, .77, -.11], new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction), .73);
  } else {
    add('Ridged bark trunk', log(input), [-1.375, .56, 0], horizontal);
    for (const [index, x, z, direction] of [[0, -.58, -.12, [.12, .83, -.45]], [1, .61, .2, [-.14, .68, .72]]]) {
      add('Broken branch stub', log({ ...input, seed: seed + 51 + index * 17 }, { length: .47 + hash(seed, index + 18) * .12, radius: .145 + index * .025, branch: true }), [x, .9, z], new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(...direction).normalize()), index * .81 + .37);
    }
  }
  // Preserve one coherent assembly transform while putting its lowest vertex
  // exactly on the ground, including chipped end rims and irregular roots.
  const minimum = Math.min(...parts.map(part => { part.geometry.computeBoundingBox(); return part.geometry.boundingBox.min.y; }));
  for (const part of parts) {
    part.geometry.translate(0, -minimum, 0);
  }
  return parts;
}
