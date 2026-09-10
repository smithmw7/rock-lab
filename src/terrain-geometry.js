// Terrain is assembled from closed convex stone solids. Broad planar crowns
// remain usable as walking surfaces; wear is applied by the shared stone mesh
// pipeline rather than an unrelated terrain shader.
export const TERRAIN_GROUPS = [{
  id: 'terrain', label: 'Terrain', description: 'Cliffs, rock pillars, platforms, and ramps for modular landscapes.',
  shapes: ['cliffFace', 'cliffCorner', 'terracedCliff', 'overhangCliff', 'taperedRockPillar', 'splitRockPillar', 'stackedRockPillar', 'roundPlatform', 'hexPlatform', 'ovalPlatform', 'trianglePlatform', 'lPlatform', 'wideRamp', 'curvedRamp', 'switchbackRamp', 'brokenRamp'],
}];
export const TERRAIN_SHAPES = new Set(TERRAIN_GROUPS.flatMap(group => group.shapes));
export const TERRAIN_CATALOG = {
  cliffFace: { label: 'Cliff face', title: 'Layered vertical cliff face', description: 'Broad fractured rock planes with horizontal strata', kind: 'terrain', defaultSurface: 'stone', icon: 'M3 29 5 8 13 3 28 5 30 29Z M5 13 16 11 29 14 M4 21 14 18 29 22 M13 3 16 11 14 18 18 29' },
  cliffCorner: { label: 'Cliff corner', title: 'Rock cliff inside corner', description: 'Two stone walls meet around a sheltered corner', kind: 'terrain', defaultSurface: 'stone', icon: 'M2 29 V8 L16 2 30 8 V29 L16 23Z M16 2 V23 M2 15 16 9 30 15 M2 22 16 16 30 22' },
  terracedCliff: { label: 'Terraced cliff', title: 'Broad terraced rock cliff', description: 'Three retreating strata form wide natural ledges', kind: 'terrain', defaultSurface: 'limestone', icon: 'M2 29 V21 H9 V13 H17 V5 H30 V29Z M2 21 15 25 30 21 M9 13 22 17 30 14 M17 5 28 9' },
  overhangCliff: { label: 'Overhang cliff', title: 'Undercut rock cliff', description: 'A projecting cap above a recessed supporting wall', kind: 'terrain', defaultSurface: 'stone', icon: 'M3 29 7 13 2 10 4 3 28 3 31 11 23 15 25 29Z M7 13 23 15 M5 22 24 24 M4 3 12 8 31 11' },
  taperedRockPillar: { label: 'Tapered rock pillar', title: 'Tapered stone pillar', description: 'A tall irregular shaft narrowing toward its crown', kind: 'terrain', defaultSurface: 'stone', icon: 'M5 29 11 4 21 2 27 29Z M11 4 17 10 21 2 M17 10 19 29 M7 20 19 18 25 22' },
  splitRockPillar: { label: 'Split rock pillar', title: 'Fissured twin rock pillar', description: 'Two standing halves divided by a deep visible split', kind: 'terrain', defaultSurface: 'stone', icon: 'M3 29 7 4 16 2 13 17 14 29Z M18 29 17 16 20 5 27 8 30 29Z M7 4 10 21 3 29' },
  stackedRockPillar: { label: 'Stacked rock pillar', title: 'Layered rock tower', description: 'Four broad stone layers form a tapering landmark', kind: 'terrain', defaultSurface: 'limestone', icon: 'M3 29 2 23 7 20 5 14 11 11 10 5 21 2 26 8 23 13 28 18 26 22 30 28Z M7 20 26 22 M5 14 23 13 M11 11 26 8' },
  roundPlatform: { label: 'Round platform', title: 'Circular stone platform', description: 'A broad flat crown above a faceted circular rim', kind: 'terrain', defaultSurface: 'limestone', icon: 'M2 11 C2 1 30 1 30 11 V23 C30 33 2 33 2 23Z M2 11 C2 21 30 21 30 11 M9 17 V29 M24 17 V29' },
  hexPlatform: { label: 'Hex platform', title: 'Hexagonal stone platform', description: 'Six-sided modular pad with a flat walking surface', kind: 'terrain', defaultSurface: 'stone', icon: 'M2 10 10 3 24 3 30 10 24 18 10 18Z M2 10 V23 L10 30 H24 L30 23 V10 M10 18 V30 M24 18 V30' },
  ovalPlatform: { label: 'Oval platform', title: 'Elongated stone platform', description: 'A long rounded ledge for islands and stepping pads', kind: 'terrain', defaultSurface: 'limestone', icon: 'M2 17 C1 4 31 0 30 12 V20 C31 33 1 35 2 25Z M2 17 C3 28 31 22 30 12' },
  trianglePlatform: { label: 'Triangle platform', title: 'Triangular stone platform', description: 'A three-cornered pad with gently clipped tips', kind: 'terrain', defaultSurface: 'stone', icon: 'M16 2 30 21 2 21Z M2 21 V29 H30 V21 M16 2 16 9 M7 21 V29 M24 21 V29' },
  lPlatform: { label: 'L platform', title: 'L-shaped stone platform', description: 'Two flat stone wings form an open inside corner', kind: 'terrain', defaultSurface: 'limestone', icon: 'M3 3 H12 V17 H29 V26 H3Z M3 3 8 8 H17 V12 M12 17 17 12 31 20 V30 H8 L3 26 M29 26 31 20' },
  wideRamp: { label: 'Wide ramp', title: 'Broad stone approach ramp', description: 'A wide straight incline with a clean planar crown', kind: 'terrain', defaultSurface: 'stone', icon: 'M2 26 20 5 30 10 30 27 12 31Z M2 26 12 31 30 10 M20 5 20 22' },
  curvedRamp: { label: 'Curved ramp', title: 'Curving stone ascent', description: 'Segmented stone wedges climb through a half turn', kind: 'terrain', defaultSurface: 'limestone', icon: 'M3 27 Q-2 9 16 3 Q30 1 30 14 V22 H23 V15 Q22 10 15 13 Q7 17 10 27Z M3 27 H10 M4 16 11 20 M11 7 15 13 M22 4 21 13' },
  switchbackRamp: { label: 'Switchback ramp', title: 'Returning stone switchback', description: 'Two opposing inclines connect through a flat landing', kind: 'terrain', defaultSurface: 'stone', icon: 'M2 29 24 14 V7 L5 19 V9 L30 2 V22 L8 31Z M5 19 24 7 M24 14 30 22' },
  brokenRamp: { label: 'Broken ramp', title: 'Fractured stone ramp', description: 'An interrupted incline with split slabs and loose chips', kind: 'terrain', defaultSurface: 'stone', icon: 'M2 27 10 19 15 22 8 30Z M12 16 21 8 26 12 17 23Z M23 5 28 2 31 7 31 19 26 22Z M2 27 V31 M17 23 V29 M26 12 V22' },
};

function randomGenerator(seed) {
  let state = (Number(seed) || 1) >>> 0;
  return () => { state += 0x6d2b79f5; let n = state; n = Math.imul(n ^ n >>> 15, n | 1); n ^= n + Math.imul(n ^ n >>> 7, n | 61); return ((n ^ n >>> 14) >>> 0) / 4294967296; };
}

/** A part is a convex point cloud with nominal ground/walking metadata.
 * The caller rebuilds broad coplanar faces before clipping wear and bevels.
 */
export function createTerrainParts(shape, options = {}) {
  const rng = randomGenerator(options.seed), detail = Math.max(0, Math.min(1, Number(options.facets) || 0)), parts = [];
  const push = (name, points, extra = {}) => parts.push({ name, points, ...extra });
  const polygon = (count, rx, rz, phase = 0, irregularity = .025) => Array.from({ length: count }, (_, i) => {
    const angle = phase + i / count * Math.PI * 2, scale = 1 + (rng() - .5) * irregularity;
    return [Math.cos(angle) * rx * scale, Math.sin(angle) * rz * scale];
  });
  const slab = (name, footprint, bottom, top, extra = {}) => {
    const heights = Array.isArray(top) ? top : footprint.map(() => top);
    push(name, [...footprint.map(([x, z]) => [x, bottom, z]), ...footprint.map(([x, z], i) => [x, heights[i], z])], extra);
  };
  const box = (name, center, size, extra = {}) => {
    const [x, y, z] = center, [w, h, d] = size;
    const rx = w / 2, rz = d / 2;
    const s = extra.shear || [0, 0];
    const lower = [[x - rx, y - h / 2, z - rz], [x + rx, y - h / 2, z - rz], [x + rx, y - h / 2, z + rz], [x - rx, y - h / 2, z + rz]];
    const upper = lower.map(([a, b, c]) => [a + s[0], b + h, c + s[1]]);
    push(name, [...lower, ...upper], extra);
  };
  const pillar = (name, bottom, top, y0, y1, shift = [0, 0], extra = {}) => {
    push(name, [...bottom.map(([x, z]) => [x, y0, z]), ...top.map(([x, z]) => [x + shift[0], y1, z + shift[1]])], extra);
  };
  const ramp = (name, x0, x1, z0, z1, h0, h1, extra = {}) => slab(name, [[x0, z0], [x1, z0], [x1, z1], [x0, z1]], 0, [h0, h1, h1, h0], { walkable: true, grounded: true, ...extra });
  const jitter = amount => (rng() - .5) * amount;

  switch (shape) {
    case 'cliffFace': {
      const heights = [0, .96, 1.91, 3.04], widths = [1.13, 1.14, 1.1];
      for (let row = 0; row < 3; row++) for (let column = 0; column < 3; column++) {
        const height = heights[row + 1] - heights[row] + .09, depth = 1.05 + jitter(.24);
        box('Fractured cliff stratum', [(column - 1) * 1.02 + jitter(.07), (heights[row] + heights[row + 1]) / 2, -.12 + row * -.035 + jitter(.17)], [widths[column], height, depth], { grounded: row === 0, shear: [jitter(.15), jitter(.1)], stony: true });
      }
      break;
    }
    case 'cliffCorner':
      for (let row = 0; row < 3; row++) {
        const h = .96, y = row * .9 + h / 2;
        box('Cliff back wall', [0, y, -.86], [3.08 - row * .07, h, .91], { grounded: row === 0, stony: true, shear: [jitter(.07), jitter(.1)] });
        box('Cliff return wall', [-1.14, y, .19], [.79, h, 2.11], { grounded: row === 0, stony: true, shear: [jitter(.07), jitter(.1)] });
      }
      break;
    case 'terracedCliff':
      for (let row = 0; row < 3; row++) {
        const width = [3.28, 2.8, 2.15][row], depth = [2.68, 1.84, 1.03][row], y = [0, .83, 1.76][row];
        slab('Broad terrace stratum', [[-width / 2, -1.29], [width / 2, -1.29], [width / 2 + jitter(.09), -1.29 + depth], [-width / 2 + jitter(.09), -1.29 + depth]], y, y + [1, 1.08, 1.05][row], { grounded: row === 0, walkable: true, stony: true });
      }
      break;
    case 'overhangCliff':
      box('Recessed cliff foot', [0, .47, -.34], [2.7, .94, 1.26], { grounded: true, stony: true, shear: [.09, -.08] });
      box('Undercut supporting wall', [.04, 1.3, -.57], [2.35, .95, .9], { stony: true, shear: [-.08, .12] });
      slab('Projecting cap underside', [[-1.45, -1.1], [1.45, -1.1], [1.6, .65], [-1.54, .65]], 1.61, [2.3, 2.33, 2.22, 2.19], { stony: true });
      box('Cliff crown', [0, 2.53, -.17], [3.2, .57, 1.77], { stony: true, walkable: true, shear: [.08, -.09] });
      break;
    case 'taperedRockPillar': {
      const sides = 6 + Math.round(detail * 3), bottom = polygon(sides, .85, .77, .16, .13), top = polygon(sides, .4, .45, .16, .11);
      pillar('Tapered rock shaft', bottom, top, 0, 3.16, [.17, -.06], { grounded: true, stony: true });
      break;
    }
    case 'splitRockPillar': {
      const left = [[-.89, -.62], [-.08, -.63], [-.05, .54], [-.73, .66]], right = [[.08, -.63], [.82, -.5], [.92, .52], [.11, .57]];
      pillar('Left split rock half', left, left.map(([x, z]) => [x * .72 - .08, z * .7]), 0, 3.13, [-.08, .025], { grounded: true, stony: true });
      pillar('Right split rock half', right, right.map(([x, z]) => [x * .72 + .12, z * .75]), 0, 2.63, [.1, -.035], { grounded: true, stony: true });
      break;
    }
    case 'stackedRockPillar':
      for (let row = 0; row < 4; row++) {
        const r = [1.03, .88, .75, .58][row], sides = 6 + Math.round(detail * 3), phase = row * .16;
        const bottom = polygon(sides, r, r * .8, phase, .08), top = polygon(sides, r * .89, r * .75, phase, .09);
        pillar('Stacked pillar layer', bottom, top, row * .7, row * .7 + .79, [jitter(.12), jitter(.08)], { grounded: row === 0, stony: true });
      }
      break;
    case 'roundPlatform': case 'hexPlatform': case 'ovalPlatform': {
      const count = shape === 'hexPlatform' ? 6 : 12 + Math.round(detail * 12), rx = shape === 'ovalPlatform' ? 1.68 : 1.42, rz = shape === 'ovalPlatform' ? .91 : 1.42;
      slab('Flat stone platform', polygon(count, rx, rz, shape === 'hexPlatform' ? Math.PI / 6 : .1, .017), 0, .55, { walkable: true, grounded: true });
      break;
    }
    case 'trianglePlatform':
      slab('Triangular stone platform', [[-1.48, 1.17], [1.48, 1.17], [0, -1.36]], 0, .55, { walkable: true, grounded: true });
      break;
    case 'lPlatform':
      box('Long platform wing', [-.87, .27, 0], [1.32, .54, 2.88], { walkable: true, grounded: true });
      box('Returning platform wing', [.6, .27, .8], [1.8, .54, 1.28], { walkable: true, grounded: true });
      break;
    case 'wideRamp': ramp('Broad stone ramp', -1.58, 1.58, -1.28, 1.28, .12, 1.52); break;
    case 'curvedRamp': {
      const count = 10 + Math.round(detail * 6), start = -.2, span = Math.PI * 1.1;
      for (let i = 0; i < count; i++) {
        const a = start + span * (i / count - .005), b = start + span * ((i + 1) / count + .005);
        const inner = .59, outer = 1.46, point = (r, angle) => [Math.cos(angle) * r, Math.sin(angle) * r];
        const h0 = .14 + i / count * 1.28, h1 = .14 + (i + 1) / count * 1.28;
        slab('Curving ramp wedge', [point(inner, a), point(outer, a), point(outer, b), point(inner, b)], 0, [h0, h0, h1, h1], { walkable: true, grounded: true });
      }
      break;
    }
    case 'switchbackRamp':
      ramp('Lower switchback approach', -1.57, 1.05, -.98, -.02, .12, 1.02);
      box('Switchback landing', [1.2, .51, 0], [.61, 1.02, 2.03], { walkable: true, grounded: true });
      ramp('Upper returning approach', -1.57, 1.05, .035, 1, 2.02, 1.02);
      break;
    case 'brokenRamp':
      for (let i = 0; i < 3; i++) {
        const x0 = -1.56 + i * 1.06, x1 = x0 + 1.015;
        ramp('Fractured ramp slab', x0, x1, -.82 + jitter(.05), .82 + jitter(.05), .12 + i * .41, .12 + (i + .96) * .41);
      }
      slab('Loose broken ramp chip', [[-1.14, 1.02], [-.66, .93], [-.59, 1.3], [-1, 1.38]], 0, [.19, .27, .12, .12], { grounded: true, stony: true });
      break;
  }
  return parts;
}
