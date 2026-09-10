import * as THREE from 'three';

const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));
export const WORKSHOP_DEFAULTS = {
  hammerHead: 'club', knifeBlade: 'chef', handleLength: 1, headScale: 1,
  wallThickness: .09, latheHeight: 1, latheWidth: 1, latheBelly: 1, latheNeck: 1, latheLip: 1,
  latheSegments: 32, profileSmoothness: .8, latheProfile: null,
};
export const WORKSHOP_RANGES = {
  handleLength: [.65, 1.5], headScale: [.65, 1.5], wallThickness: [.04, .2],
  latheHeight: [.65, 1.6], latheWidth: [.6, 1.5], latheBelly: [.6, 1.5], latheNeck: [.5, 1.5], latheLip: [.6, 1.4],
  latheSegments: [8, 64], profileSmoothness: [0, 1],
};
export const WORKSHOP_ENUMS = { hammerHead: ['club', 'ball', 'cross', 'claw'], knifeBlade: ['chef', 'drop', 'cleaver'] };
export const WORKSHOP_GROUPS = [
  { id: 'tools', label: 'Tools', description: 'Composite tools with independent metal, wood, and trim materials.', shapes: ['hammer', 'knife', 'hatchet'] },
  { id: 'metal', label: 'Metal', description: 'Machined building stock, fasteners, and mechanical forms.', shapes: ['metalPlate', 'metalRod', 'metalTube', 'metalRing', 'iBeam', 'angleBracket', 'hexBolt', 'gear'] },
  { id: 'pottery', label: 'Lathe', description: 'Hollow vessels and turned objects shaped from an editable spline.', shapes: ['bowl', 'vase', 'jar', 'urn', 'planter', 'saucer', 'goblet', 'metalCandlestick', 'woodenCandlestick'] },
];
export const WORKSHOP_SHAPES = new Set(WORKSHOP_GROUPS.flatMap(group => group.shapes));
export const WORKSHOP_CATALOG = {
  hammer: { label: 'Hammer', title: 'Composite workshop hammer', description: 'Wood handle with four interchangeable metal heads', kind: 'composite', defaultSurface: 'brushedSteel', defaultHandleSurface: 'oak', icon: 'M5 3 H25 V11 H19 V29 H13 V11 H5Z M13 11 H19 M7 5 V9 M23 5 V9' },
  knife: { label: 'Knife', title: 'Wood-handled workshop knife', description: 'Three blade profiles, bolster, and handle rivets', kind: 'composite', defaultSurface: 'chrome', defaultHandleSurface: 'walnut', icon: 'M13 18 V3 Q29 5 21 18 H19 V29 H13Z M13 18 H21 M16 23 V25' },
  hatchet: { label: 'Hatchet', title: 'Composite wood-handled hatchet', description: 'Broad cutting head on a tapered wood grip', kind: 'composite', defaultSurface: 'iron', defaultHandleSurface: 'oak', icon: 'M13 29 15 3 20 3 19 29Z M15 5 5 3 Q1 10 5 15 L15 11 M6 4 7 13' },
  metalPlate: { label: 'Metal plate', title: 'Bevelled metal plate', description: 'Machined flat stock with softened edges', kind: 'metal', defaultSurface: 'brushedSteel', icon: 'M2 12 22 4 30 10 30 18 10 27 2 21Z M2 12 10 18 30 10 M10 18 V27' },
  metalRod: { label: 'Metal rod', title: 'Round metal bar stock', description: 'Long cylindrical rod with machined end caps', kind: 'metal', defaultSurface: 'copper', icon: 'M11 5 C11 1 21 1 21 5 V27 C21 31 11 31 11 27Z M11 5 C11 9 21 9 21 5' },
  metalTube: { label: 'Metal tube', title: 'Hollow metal tube', description: 'Open cylindrical pipe with a real inner wall', kind: 'metal', defaultSurface: 'brushedSteel', icon: 'M5 7 C5 0 27 0 27 7 V25 C27 32 5 32 5 25Z M5 7 C5 14 27 14 27 7 M10 7 C10 3 22 3 22 7 C22 11 10 11 10 7' },
  metalRing: { label: 'Metal ring', title: 'Machined metal ring', description: 'Thick washer with an open central bore', kind: 'metal', defaultSurface: 'brass', icon: 'M2 13 C2 2 30 2 30 13 V20 C30 31 2 31 2 20Z M2 13 C2 24 30 24 30 13 M9 13 C9 7 23 7 23 13 C23 19 9 19 9 13' },
  iBeam: { label: 'I-beam', title: 'Structural metal I-beam', description: 'Continuous I-section with flanges and a web', kind: 'metal', defaultSurface: 'iron', icon: 'M4 3 H28 V8 H19 V24 H28 V29 H4 V24 H13 V8 H4Z' },
  angleBracket: { label: 'Angle bracket', title: 'L-section angle bracket', description: 'A single solid right-angle metal support', kind: 'metal', defaultSurface: 'brushedSteel', icon: 'M5 3 H11 V22 H29 V28 H5Z M11 3 17 6 V17 L29 22 M11 22 17 17' },
  hexBolt: { label: 'Hex bolt', title: 'Hex-head metal bolt', description: 'Hexagonal head and a visibly threaded shaft', kind: 'metal', defaultSurface: 'brushedSteel', icon: 'M5 4 16 1 27 4 V11 L16 15 5 11Z M11 14 V28 L16 31 21 28 V14 M11 19 21 16 M11 24 21 21 M11 29 21 26' },
  gear: { label: 'Gear', title: 'Twelve-tooth workshop gear', description: 'Toothed metal wheel with a hollow hub', kind: 'metal', defaultSurface: 'brass', icon: 'M12 2 H20 L21 7 26 6 30 13 26 17 28 23 21 27 17 24 12 30 5 26 7 20 2 16 5 9 10 9Z M16 11 A5 5 0 1 0 16 21 A5 5 0 1 0 16 11' },
  bowl: { label: 'Bowl', title: 'Spline-turned ceramic bowl', description: 'Wide open vessel with a continuous thick rim', kind: 'lathe', defaultSurface: 'stoneware', icon: 'M3 9 C3 3 29 3 29 9 C29 15 3 15 3 9 Q5 27 16 28 Q27 27 29 9 M8 9 C8 6 24 6 24 9' },
  vase: { label: 'Vase', title: 'Spline-shaped ceramic vase', description: 'Full belly, narrow neck, and an open flared lip', kind: 'lathe', defaultSurface: 'celadon', icon: 'M10 3 H22 L20 11 Q30 20 24 28 Q16 33 8 28 Q2 20 12 11Z M10 3 Q16 7 22 3' },
  jar: { label: 'Jar', title: 'Open pottery storage jar', description: 'Rounded shoulders with a short open mouth', kind: 'lathe', defaultSurface: 'terracotta', icon: 'M10 3 H22 V8 Q28 12 27 25 Q27 30 16 30 Q5 30 5 25 Q4 12 10 8Z M10 3 Q16 7 22 3' },
  urn: { label: 'Urn', title: 'Footed ceramic urn', description: 'Sculpted foot and neck around a generous body', kind: 'lathe', defaultSurface: 'porcelain', icon: 'M9 2 H23 L20 8 Q30 18 23 24 L19 26 22 30 H10 L13 26 9 24 Q2 18 12 8Z M9 2 Q16 6 23 2' },
  planter: { label: 'Planter', title: 'Tapered terracotta planter', description: 'Deep planting cavity and a broad rolled rim', kind: 'lathe', defaultSurface: 'terracotta', icon: 'M3 7 C3 1 29 1 29 7 V12 H26 L23 28 Q16 32 9 28 L6 12 H3Z M3 7 C3 13 29 13 29 7' },
  saucer: { label: 'Saucer', title: 'Shallow ceramic saucer', description: 'Low dish with a broad curved edge', kind: 'lathe', defaultSurface: 'porcelain', icon: 'M2 16 C2 5 30 5 30 16 C30 27 2 27 2 16 Q7 29 16 29 Q25 29 30 16 M7 16 C7 10 25 10 25 16 C25 22 7 22 7 16' },
  goblet: { label: 'Goblet', title: 'Turned metal goblet', description: 'Open drinking cup above a stem and solid foot', kind: 'lathe', defaultSurface: 'brass', icon: 'M6 3 C6 0 26 0 26 3 Q27 16 18 18 V25 L25 29 H7 L14 25 V18 Q5 16 6 3 M6 3 Q16 9 26 3' },
  metalCandlestick: { label: 'Metal candlestick', title: 'Turned metal candlestick', description: 'Broad foot, turned stem, and hollow candle socket', kind: 'lathe', defaultSurface: 'brass', icon: 'M11 2 H21 V9 L18 12 V22 L27 28 V30 H5 V28 L14 22 V12 L11 9Z M11 2 Q16 6 21 2' },
  woodenCandlestick: { label: 'Wooden candlestick', title: 'Turned wooden candlestick', description: 'Sculpted wood profile with a metal candle liner', kind: 'lathe', defaultSurface: 'walnut', icon: 'M10 2 H22 V8 L18 12 20 17 18 22 26 28 V30 H6 V28 L14 22 12 17 14 12 10 8Z M10 2 Q16 6 22 2' },
};

export function sanitizeWorkshopOptions(input = {}) {
  const output = { ...WORKSHOP_DEFAULTS };
  for (const [key, range] of Object.entries(WORKSHOP_RANGES)) {
    const number = Number(input[key]);
    output[key] = clamp(input[key] != null && Number.isFinite(number) ? number : output[key], ...range);
  }
  output.latheSegments = Math.round(output.latheSegments);
  for (const [key, allowed] of Object.entries(WORKSHOP_ENUMS)) if (allowed.includes(input[key])) output[key] = input[key];
  if (Array.isArray(input.latheProfile) && input.latheProfile.length === 6) {
    output.latheProfile = input.latheProfile.map(value => clamp(Number.isFinite(Number(value)) ? Number(value) : 1, .18, 1.4));
  }
  return output;
}

const STATIONS = [0, .14, .38, .65, .88, 1];
const LATHE_PROFILES = {
  bowl: { height: 1.05, width: 1.23, radius: [.45, .59, .8, .94, 1, 1.015], cavity: 0 },
  vase: { height: 2.6, width: .88, radius: [.48, .74, 1, .82, .37, .54], cavity: 0 },
  jar: { height: 1.85, width: 1.02, radius: [.69, .94, 1, .98, .67, .67], cavity: 0 },
  urn: { height: 2.6, width: .97, radius: [.52, .26, .84, 1, .41, .63], cavity: .22 },
  planter: { height: 1.65, width: 1.08, radius: [.68, .72, .8, .89, 1, 1.04], cavity: 0 },
  saucer: { height: .42, width: 1.4, radius: [.57, .63, .78, .9, .98, 1], cavity: 0 },
  goblet: { height: 2.5, width: .8, radius: [.82, .18, .17, .73, 1, 1], cavity: .49 },
  metalCandlestick: { height: 2.45, width: .86, radius: [1, .54, .22, .2, .48, .43], cavity: .82 },
  woodenCandlestick: { height: 2.35, width: .86, radius: [.93, .64, .31, .44, .27, .48], cavity: .86 },
};

/** Six bounded radii at fixed increasing heights form the editable spline.
 * Monotone cubic interpolation prevents overshoot between edited radii.
 * baseRadius maps the UI's dimensionless multiplier into object-space radius.
 */
export function getLatheProfileControls(shape, input = {}) {
  const options = sanitizeWorkshopOptions(input), preset = LATHE_PROFILES[shape] || LATHE_PROFILES.vase;
  const height = preset.height * options.latheHeight;
  return STATIONS.map((t, index) => {
    const influence = index === 2 || index === 3 ? options.latheBelly : index === 4 ? options.latheNeck : index === 5 ? options.latheLip : 1;
    const baseRadius = preset.width * options.latheWidth * preset.radius[index] * influence;
    const multiplier = options.latheProfile?.[index] ?? 1;
    // Even the thinnest edited neck retains an inner opening and a solid wall.
    const radius = Math.max(options.wallThickness + .065, baseRadius * multiplier);
    return { radius, y: t * height, t, index, multiplier, baseRadius };
  });
}

function interpolateRadius(controls, t, smoothness) {
  let i = controls.length - 2;
  for (let j = 0; j < controls.length - 1; j++) if (t <= controls[j + 1].t) { i = j; break; }
  const secants = controls.slice(1).map((point, k) => (point.radius - controls[k].radius) / (point.t - controls[k].t));
  const slope = k => {
    if (k === 0) return secants[0];
    if (k === controls.length - 1) return secants.at(-1);
    const a = secants[k - 1], b = secants[k];
    return a * b <= 0 ? 0 : 2 * a * b / (a + b);
  };
  const a = controls[i], b = controls[i + 1], h = b.t - a.t, u = clamp((t - a.t) / h, 0, 1);
  const linear = THREE.MathUtils.lerp(a.radius, b.radius, u);
  const cubic = (2 * u ** 3 - 3 * u ** 2 + 1) * a.radius + (u ** 3 - 2 * u ** 2 + u) * h * slope(i)
    + (-2 * u ** 3 + 3 * u ** 2) * b.radius + (u ** 3 - u ** 2) * h * slope(i + 1);
  return THREE.MathUtils.lerp(linear, clamp(cubic, Math.min(a.radius, b.radius), Math.max(a.radius, b.radius)), smoothness);
}

export function sampleLatheProfile(shape, input = {}, count = 48) {
  const options = sanitizeWorkshopOptions(input), controls = getLatheProfileControls(shape, options);
  const height = controls.at(-1).y;
  const samples = Math.max(6, Math.min(128, Math.round(count)));
  const points = Array.from({ length: samples + 1 }, (_, index) => {
    const t = index / samples;
    return { radius: interpolateRadius(controls, t, options.profileSmoothness), y: t * height };
  });
  return { points, controls, height, wallThickness: options.wallThickness };
}

// Closed profile revolver. Axis points use one vertex rather than a collapsed
// ring, avoiding degenerate cap triangles and making the welded mesh manifold.
function revolve(profile, segments = 32, angularRadius = null) {
  const clean = profile.filter((point, index) => !index || Math.hypot(point[0] - profile[index - 1][0], point[1] - profile[index - 1][1]) > 1e-7);
  if (Math.hypot(clean[0][0] - clean.at(-1)[0], clean[0][1] - clean.at(-1)[1]) < 1e-7) clean.pop();
  const positions = [], rings = [], indices = [];
  for (const [radius, y] of clean) {
    const ring = [];
    for (let segment = 0; segment < (radius <= 1e-7 ? 1 : segments); segment++) {
      const angle = segment / segments * Math.PI * 2;
      const r = radius * (angularRadius ? angularRadius(angle) : 1);
      ring.push(positions.length / 3); positions.push(Math.sin(angle) * r, y, Math.cos(angle) * r);
    }
    rings.push(ring);
  }
  for (let station = 0; station < rings.length; station++) {
    const a = rings[station], b = rings[(station + 1) % rings.length];
    if (a.length === 1 && b.length === 1) continue;
    for (let j = 0; j < segments; j++) {
      const k = (j + 1) % segments;
      if (a.length === 1) indices.push(a[0], b[j], b[k]);
      else if (b.length === 1) indices.push(a[j], b[0], a[k]);
      else indices.push(a[j], b[j], a[k], a[k], b[j], b[k]);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geometry.setIndex(indices);
  orientGeometry(geometry); geometry.computeVertexNormals();
  return geometry;
}

function orientGeometry(geometry) {
  const positions = geometry.attributes.position, index = geometry.index;
  let volume = 0;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (let i = 0; i < (index ? index.count : positions.count); i += 3) {
    a.fromBufferAttribute(positions, index ? index.getX(i) : i);
    b.fromBufferAttribute(positions, index ? index.getX(i + 1) : i + 1);
    c.fromBufferAttribute(positions, index ? index.getX(i + 2) : i + 2);
    volume += a.dot(b.cross(c)) / 6;
  }
  if (volume < 0) for (let i = 0; i < (index ? index.count : positions.count); i += 3) {
    if (index) { const value = index.getX(i + 1); index.setX(i + 1, index.getX(i + 2)); index.setX(i + 2, value); }
    else for (const attribute of Object.values(geometry.attributes)) for (let component = 0; component < attribute.itemSize; component++) {
      const first = (i + 1) * attribute.itemSize + component, second = (i + 2) * attribute.itemSize + component;
      [attribute.array[first], attribute.array[second]] = [attribute.array[second], attribute.array[first]];
    }
  }
}

function extrudedSection(points, depth, bevel = .02, holes = []) {
  const shape = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
  for (const contour of holes) shape.holes.push(new THREE.Path(contour.map(([x, y]) => new THREE.Vector2(x, y))));
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: Math.max(.02, depth - bevel * 2), bevelEnabled: bevel > 0, bevelSegments: 1, steps: 1, bevelThickness: bevel, bevelSize: bevel, curveSegments: 1 });
  geometry.translate(0, 0, -depth / 2 + bevel); orientGeometry(geometry); geometry.computeVertexNormals();
  return geometry;
}

function box(size, bevel) {
  const [x, y, z] = size, inset = Math.min(...size) * Math.min(.16, bevel * .12);
  return extrudedSection([[-x / 2 + inset, -y / 2 + inset], [x / 2 - inset, -y / 2 + inset], [x / 2 - inset, y / 2 - inset], [-x / 2 + inset, y / 2 - inset]], z, inset);
}

function cylinder(radius, height, segments, bevel = .01) {
  const b = Math.min(bevel, radius * .2, height * .2);
  return revolve([[0, 0], [radius - b, 0], [radius, b], [radius, height - b], [radius - b, height], [0, height]], segments);
}

function lathedVessel(shape, input) {
  const options = sanitizeWorkshopOptions(input), preset = LATHE_PROFILES[shape];
  const steps = 12 + Math.round(options.profileSmoothness * 24);
  const { points, controls, height } = sampleLatheProfile(shape, options, steps);
  const floor = Math.min(height * .93, Math.max(options.wallThickness, preset.cavity * height));
  const outer = points.map(point => [point.radius, point.y]);
  const radiusAt = t => interpolateRadius(controls, t, options.profileSmoothness);
  const inner = points.filter(point => point.y > floor + .0001).reverse().map(point => [point.radius - options.wallThickness, point.y]);
  inner.push([radiusAt(floor / height) - options.wallThickness, floor], [0, floor]);
  const profile = [[0, 0], ...outer, ...inner];
  const seedPhase = (Number(input.seed) || 1) * .017;
  const wear = clamp(Number(input.roughness) || 0, 0, 1) * .009;
  const geometry = revolve(profile, options.latheSegments, angle => 1 + Math.sin(angle * 3 + seedPhase) * wear + Math.sin(angle * 5 - seedPhase) * wear * .4);
  geometry.userData.smoothSurface = options.profileSmoothness > .25;
  geometry.userData.lathe = { profile: outer, floor, wallThickness: options.wallThickness, segments: options.latheSegments };
  return geometry;
}

/** Returns material-free, named geometry parts. Geometry is in asset space;
 * grainCoordinates retain the part's local Y-axis before assembly transforms.
 */
export function createWorkshopParts(shape, input = {}) {
  const options = { ...input, ...sanitizeWorkshopOptions(input) }, parts = [];
  const bevel = clamp(Number(input.bevel) || 0, 0, 1), detail = clamp(Number(input.facets) || .5, 0, 1);
  const segments = 12 + Math.round(detail * 20);
  const add = (name, geometry, materialSlot = 'primary', position = [0, 0, 0], rotation = [0, 0, 0]) => {
    const count = geometry.attributes.position.count, grain = [];
    for (let i = 0; i < count; i++) grain.push(geometry.attributes.position.getX(i), geometry.attributes.position.getY(i), geometry.attributes.position.getZ(i), 1);
    geometry.setAttribute('aRockPosition', new THREE.Float32BufferAttribute(grain, 4));
    const transform = new THREE.Matrix4().compose(new THREE.Vector3(...position), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)), new THREE.Vector3(1, 1, 1));
    geometry.applyMatrix4(transform);
    // Small coherent manufacturing wear uses the same world-space field at
    // repeated vertices. Bound it by the thinnest part so blade edges, rivets,
    // and vessel walls survive every seed without opening seams.
    geometry.computeBoundingBox();
    const size = geometry.boundingBox.getSize(new THREE.Vector3());
    const amplitude = Math.min(.008, Math.min(size.x, size.y, size.z) * .018) * clamp(Number(input.roughness) || 0, 0, 1);
    const phase = (Number(input.seed) || 1) * .019;
    const positions = geometry.attributes.position;
    for (let i = 0; i < positions.count && amplitude > 0; i++) {
      const x = positions.getX(i), y = positions.getY(i), z = positions.getZ(i), grounding = clamp(y / .12, 0, 1);
      const amount = amplitude * grounding;
      positions.setXYZ(i, x + Math.sin(y * 2.1 + z * 1.3 + phase) * amount, y + Math.sin(z * 2.3 + x * 1.8 + phase * 1.3) * amount, z + Math.sin(x * 1.7 + y * 1.4 - phase) * amount);
    }
    parts.push({ name, geometry, materialSlot });
  };
  const addBox = (name, size, slot, position, rotation) => add(name, box(size, bevel), slot, position, rotation);
  const addCylinder = (name, r, h, slot, position, rotation, sides = segments) => add(name, cylinder(r, h, sides, .008 + bevel * .025), slot, position, rotation);
  if (LATHE_PROFILES[shape]) {
    const vessel = lathedVessel(shape, options);
    add(WORKSHOP_CATALOG[shape].label, vessel);
    if (shape === 'woodenCandlestick') {
      const { height, controls } = sampleLatheProfile(shape, options), radius = controls.at(-1).radius;
      const wall = options.wallThickness, linerHeight = Math.min(.11, height * .06);
      add('Metal candle socket liner', revolve([[radius - wall - .004, 0], [radius + .008, 0], [radius + .008, linerHeight], [radius - wall - .004, linerHeight]], options.latheSegments), 'trim', [0, height - linerHeight * .7, 0]);
    }
    return parts;
  }
  switch (shape) {
    case 'hammer': {
      const length = 1.9 * options.handleLength, h = options.headScale;
      add('Tapered wooden handle', revolve([[0, 0], [.145, 0], [.18, .07], [.15, length * .28], [.125, length * .77], [.16, length + .22], [0, length + .22]], 12), 'handle');
      addCylinder('Handle ferrule', .178, .26, 'trim', [0, length - .17, 0], undefined, 12);
      if (options.hammerHead === 'club') {
        addBox('Forged club head', [1.48 * h, .52 * h, .57 * h], 'primary', [0, length + .14, 0]);
        addCylinder('Left striking face', .305 * h, .11 * h, 'trim', [-.76 * h, length + .14, 0], [0, 0, -Math.PI / 2], 8);
        addCylinder('Right striking face', .305 * h, .11 * h, 'trim', [.65 * h, length + .14, 0], [0, 0, -Math.PI / 2], 8);
      } else {
        addBox('Forged hammer eye', [.58 * h, .48 * h, .48 * h], 'primary', [0, length + .14, 0]);
        addCylinder('Striking neck', .19 * h, .37 * h, 'primary', [.22 * h, length + .14, 0], [0, 0, -Math.PI / 2]);
        addCylinder('Striking face', .285 * h, .13 * h, 'primary', [.53 * h, length + .14, 0], [0, 0, -Math.PI / 2]);
        if (options.hammerHead === 'ball') {
          const ball = new THREE.SphereGeometry(.3 * h, segments, 12); add('Ball peen', ball, 'primary', [-.48 * h, length + .14, 0]);
        } else if (options.hammerHead === 'cross') {
          add('Cross peen', extrudedSection([[-.24 * h, -.22 * h], [-.79 * h, -.06 * h], [-.79 * h, .06 * h], [-.24 * h, .22 * h]], .5 * h, .008 * bevel), 'primary', [0, length + .14, 0]);
        } else {
          const claw = [[-.18 * h, -.2 * h], [-.42 * h, -.22 * h], [-.85 * h, -.01 * h], [-.95 * h, .2 * h], [-.69 * h, .065 * h], [-.28 * h, .22 * h]];
          for (const z of [-.16, .16]) add('Split claw tine', extrudedSection(claw, .17 * h, .008 * bevel), 'primary', [0, length + .14, z * h]);
        }
      }
      break;
    }
    case 'knife': {
      const length = 1.08 * options.handleLength, h = options.headScale;
      add('Wooden knife grip', extrudedSection([[-.15, 0], [.16, 0], [.2, .12], [.145, length - .06], [.11, length], [-.13, length], [-.17, length - .12], [-.21, .12]], .26, .014 + bevel * .014), 'handle');
      addBox('Metal bolster', [.39, .16, .29], 'trim', [0, length - .025, 0]);
      const outlines = {
        chef: [[-.14, 0], [.3, 0], [.4, .55], [.28, 1.13], [-.1, 1.57], [-.14, 1.56]],
        drop: [[-.13, 0], [.23, 0], [.27, .69], [.14, 1.2], [-.04, 1.52], [-.13, 1.27]],
        cleaver: [[-.14, 0], [.5, 0], [.55, 1.27], [.44, 1.42], [-.14, 1.42]],
      };
      const outline = outlines[options.knifeBlade].map(([x, y]) => [x * h, y * h]);
      add('Steel cutting blade', extrudedSection(outline, .065 * h, .011 * h * bevel), 'primary', [0, length, 0]);
      for (const y of [.24, .72]) for (const side of [-1, 1]) addCylinder('Handle rivet', .042, .032, 'trim', [0, y * length, side * .12], [side * Math.PI / 2, 0, 0], 12);
      break;
    }
    case 'hatchet': {
      const length = 1.85 * options.handleLength, h = options.headScale;
      add('Curved wooden hatchet handle', extrudedSection([[-.13, 0], [.17, 0], [.19, .2], [.12, length * .66], [.17, length + .2], [-.13, length + .2], [-.13, length * .65], [-.21, .15]], .26, .015 + bevel * .012), 'handle');
      add('Forged axe cheek', extrudedSection([[-.13 * h, -.23 * h], [-.9 * h, -.46 * h], [-1.02 * h, -.1 * h], [-.97 * h, .43 * h], [-.14 * h, .22 * h], [.25 * h, .22 * h], [.25 * h, -.23 * h]], .29 * h, .014 * bevel), 'primary', [0, length, 0]);
      add('Honed cutting edge', extrudedSection([[-.83 * h, -.43 * h], [-.91 * h, -.05 * h], [-.83 * h, .4 * h], [-.98 * h, .44 * h], [-1.08 * h, -.08 * h], [-.97 * h, -.49 * h]], .085 * h, .005 * bevel), 'trim', [0, length, 0]);
      addCylinder('Handle collar', .19, .21, 'trim', [0, length - .33, 0], undefined, 8);
      break;
    }
    case 'metalPlate': addBox('Machined metal plate', [2.75, .24, 1.8], 'primary', [0, .12, 0]); break;
    case 'metalRod': addCylinder('Round metal stock', .39, 2.8, 'primary', [0, 0, 0]); break;
    case 'metalTube': {
      const r = .8, wall = options.wallThickness + .045;
      add('Open metal pipe', revolve([[r, 0], [r, 2.4], [r - wall, 2.4], [r - wall, 0]], options.latheSegments)); break;
    }
    case 'metalRing': add('Machined open ring', revolve([[1.23, 0], [1.23, .32], [.74, .32], [.74, 0]], options.latheSegments)); break;
    case 'iBeam': {
      const section = [[-.85, 0], [.85, 0], [.85, .22], [.14, .22], [.14, 1.7], [.85, 1.7], [.85, 1.92], [-.85, 1.92], [-.85, 1.7], [-.14, 1.7], [-.14, .22], [-.85, .22]];
      add('Continuous I-section', extrudedSection(section, 2.55, .016 * bevel)); break;
    }
    case 'angleBracket': add('Continuous angle bracket', extrudedSection([[-.8, 0], [.85, 0], [.85, .25], [-.55, .25], [-.55, 1.85], [-.8, 1.85]], 1.65, .014 * bevel)); break;
    case 'hexBolt': {
      addCylinder('Hexagonal bolt head', .65, .43, 'primary', [0, 0, 0], undefined, 6);
      const pitch = .17, bottom = .4, top = 2.37;
      const profile = [[0, bottom], [.26, bottom]];
      for (let y = bottom; y < top - pitch; y += pitch) profile.push([.265, y + .018], [.335, y + pitch * .5], [.265, y + pitch - .018]);
      profile.push([.255, top], [0, top]);
      add('Threaded bolt shaft', revolve(profile, segments)); break;
    }
    case 'gear': {
      const section = [], hole = [], teeth = 12;
      for (let i = 0; i < teeth * 4; i++) {
        const angle = i / (teeth * 4) * Math.PI * 2, r = i % 4 === 1 || i % 4 === 2 ? 1.25 : 1.02;
        section.push([Math.cos(angle) * r, Math.sin(angle) * r]);
      }
      for (let i = 0; i < 24; i++) { const angle = -i / 24 * Math.PI * 2; hole.push([Math.cos(angle) * .39, Math.sin(angle) * .39]); }
      add('Twelve-tooth gear wheel', extrudedSection(section, .28, .008 * bevel, [hole]), 'primary', [0, .16, 0], [-Math.PI / 2, 0, 0]);
      add('Hollow gear hub', revolve([[.55, 0], [.55, .46], [.39, .46], [.39, 0]], 24)); break;
    }
  }
  return parts;
}
