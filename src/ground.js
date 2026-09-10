import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { GROUND_TYPES, normalizeGroundId } from './ground-catalog.js';
export { GROUND_TYPES } from './ground-catalog.js';

export const ASPHALT_DEFAULTS = Object.freeze({
  asphaltRoughness: .32,
  asphaltRoughnessVariation: .3,
  asphaltNormalStrength: .4,
  asphaltNoiseScale: 1,
  asphaltRippleStrength: .12,
  asphaltRippleSpeed: .5,
  asphaltReflectionDistortion: .35,
});
const asphaltBounds = {
  asphaltRoughness: [0, 1], asphaltRoughnessVariation: [0, 1], asphaltNormalStrength: [0, 2],
  asphaltNoiseScale: [.25, 4], asphaltRippleStrength: [0, 1], asphaltRippleSpeed: [0, 2], asphaltReflectionDistortion: [0, 1],
};
const asphaltUniform = key => `u${key[0].toUpperCase()}${key.slice(1)}`;
const groundIds = Object.keys(GROUND_TYPES);
const defaultOptions = { ground: 'studio', reflection: 0.35, groundScale: 1, groundWetness: 0.5, studioColor: '#151d25', ...ASPHALT_DEFAULTS };

const groundShader = /* glsl */`
uniform float uGroundType;
uniform float uGroundScale;
uniform float uGroundWetness;
uniform float uGroundReflection;
uniform vec3 uStudioColor;
uniform sampler2D uGroundReflectionMap;
uniform vec2 uGroundReflectionTexel;
uniform mat4 uGroundWorldReflectionMatrix;
uniform float uAsphaltRoughness;
uniform float uAsphaltRoughnessVariation;
uniform float uAsphaltNormalStrength;
uniform float uAsphaltNoiseScale;
uniform float uAsphaltRippleStrength;
uniform float uAsphaltReflectionDistortion;
uniform float uAsphaltTime;
varying vec3 vGroundWorld;
varying vec4 vGroundProjected;

float groundHash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * .1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float groundNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(groundHash(i), groundHash(i + vec2(1, 0)), f.x),
             mix(groundHash(i + vec2(0, 1)), groundHash(i + vec2(1, 1)), f.x), f.y);
}
float groundFbm(vec2 p) {
  return groundNoise(p) * .57 + groundNoise(p * 2.07 + 17.3) * .28 + groundNoise(p * 4.31 + 9.2) * .15;
}

float groundFilteredNoise(vec2 p) {
  float footprint = max(length(dFdx(p)), length(dFdy(p)));
  return mix(groundNoise(p), .5, smoothstep(.5, 1.4, footprint));
}
float groundBand(float distance, float width) {
  float aa = max(fwidth(distance) * .75, .0002);
  return 1.0 - smoothstep(width - aa, width + aa, distance);
}

// Jittered cells supply independent chips and stone colors. Keeping the two
// nearest centers also gives the distance to their shared straight boundary.
void groundCells(vec2 p, out vec2 cell, out vec2 local, out float border) {
  vec2 base = floor(p), nearestCenter = vec2(0.0), nextCenter = vec2(0.0);
  float nearest = 100.0, second = 100.0;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 id = base + vec2(float(x), float(y));
      vec2 center = id + .5 + (vec2(groundHash(id + 1.7), groundHash(id + 23.9)) - .5) * .76;
      vec2 delta = p - center;
      float d = dot(delta, delta);
      if (d < nearest) {
        second = nearest; nextCenter = nearestCenter;
        nearest = d; nearestCenter = center; cell = id;
      } else if (d < second) { second = d; nextCenter = center; }
    }
  }
  local = p - nearestCenter;
  border = max(0.0, (second - nearest) / max(2.0 * length(nextCenter - nearestCenter), .001));
}

// A flagstone needs the nearest boundary plane, not just the second-nearest
// seed. That approximation jumps inside a cell and creates false bump ridges.
// Search around the winning seed so the candidate set stays fixed across its
// face; the second ring includes diagonal neighbors of strongly jittered cells.
float groundSlateBorder(vec2 p, vec2 cell, vec2 local) {
  vec2 nearestCenter = p - local;
  float border = 10.0;
  for (int y = -2; y <= 2; y++) {
    for (int x = -2; x <= 2; x++) {
      if (x == 0 && y == 0) continue;
      vec2 id = cell + vec2(float(x), float(y));
      vec2 center = id + .5 + (vec2(groundHash(id + 1.7), groundHash(id + 23.9)) - .5) * .76;
      vec2 direction = center - nearestCenter;
      float distance = dot((center + nearestCenter) * .5 - p, direction) / max(length(direction), .001);
      border = min(border, distance);
    }
  }
  return max(0.0, border);
}

float groundChip(vec2 local, float seed, float radius) {
  float angle = seed * 6.2831853;
  vec2 q = mat2(cos(angle), -sin(angle), sin(angle), cos(angle)) * local;
  q *= vec2(1.0, 1.0 + groundHash(vec2(seed, 8.2)) * .8);
  // Six unequal cuts read as broken stone rather than circular polka dots.
  float edge = max(max(abs(q.x) * .93, abs(q.y)), abs(q.x * .69 + q.y * .73));
  return groundBand(edge, radius);
}

// Three curved, tapered blades share each jittered root. The small fixed
// neighborhood allows tufts to cross cell boundaries without square seams.
// Returning cover, a pale ridge, tuft color, and smooth interior relief keeps grass directional rather
// than merely adding green noise. Fine strokes fade with the pixel footprint.
vec4 groundGrassTufts(vec2 p) {
  vec2 base = floor(p);
  float footprint = max(length(dFdx(p)), length(dFdy(p)));
  float detail = 1.0 - smoothstep(.45, 1.35, footprint);
  vec4 result = vec4(0.0);
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 id = base + vec2(float(x), float(y));
      float seed = groundHash(id + 71.3);
      vec2 root = id + .5 + (vec2(groundHash(id + 9.1), groundHash(id + 29.7)) - .5) * .66;
      vec2 local = p - root;
      float tuftAngle = seed * 6.2831853;
      vec2 tuftLocal = mat2(cos(tuftAngle), -sin(tuftAngle), sin(tuftAngle), cos(tuftAngle)) * local;
      for (int blade = 0; blade < 3; blade++) {
        float variation = groundHash(id + float(blade) * 13.9 + 34.6);
        // A fixed fan and quadratic bend avoid per-blade trigonometry.
        float fan = float(blade) - 1.0;
        float cosine = blade == 1 ? 1.0 : .7518057;
        vec2 q = mat2(cosine, -fan * .6593847, fan * .6593847, cosine) * tuftLocal;
        float t = q.y / (.46 + variation * .39);
        float curveT = clamp(t, 0.0, 1.0);
        float bend = curveT * (2.0 - curveT) * (variation - .36) * .28;
        float width = .09 * max(1.0 - t, 0.0) + .004;
        float edge = abs(q.x - bend);
        float bladeMask = groundBand(edge, width) * smoothstep(-.035, .055, t) * (1.0 - smoothstep(.94, 1.02, t));
        float ridge = groundBand(abs(q.x - bend + width * .22), max(width * .24, .003)) * bladeMask;
        // Relief slopes across the whole blade instead of jumping at its
        // silhouette, so close views do not turn every rim into a bright scratch.
        float profile = (1.0 - smoothstep(0.0, max(width, .005), edge)) * bladeMask;
        if (bladeMask > result.x) result = vec4(bladeMask, ridge, seed, profile);
      }
    }
  }
  result.xyw *= detail;
  return result;
}

float groundStoneEdge(vec2 local, float seed) {
  float angle = seed * 6.2831853;
  vec2 q = mat2(cos(angle), -sin(angle), sin(angle), cos(angle)) * local;
  q *= vec2(1.0, 1.0 + groundHash(vec2(seed, 8.2)) * .8);
  return max(max(abs(q.x) * .93, abs(q.y)), abs(q.x * .69 + q.y * .73));
}

// Color is scene-linear. Height stays procedural and perturbs the PBR normal;
// it does not create geometric displacement or change the flat reflection plane.
void groundSurface(vec2 p, out vec3 tint, out float height, out float rough, out float reflectivity) {
  float wet = uGroundWetness;
  float broad = groundFbm(p * .55);
  float grain = groundNoise(p * 92.0);
  // Fade very fine grain when its pattern is smaller than a screen pixel.
  grain = mix(grain, .5, smoothstep(.5, 1.4, length(fwidth(p * 92.0))));
  tint = uStudioColor;
  height = 0.0;
  rough = mix(.68, .24, wet);
  reflectivity = mix(.45, 1.0, wet);

  if (uGroundType > .5 && uGroundType < 1.5) {
    vec2 asphaltP = p * uAsphaltNoiseScale;
    broad = groundFbm(asphaltP * .55);
    grain = groundNoise(asphaltP * 92.0);
    grain = mix(grain, .5, smoothstep(.5, 1.4, length(fwidth(asphaltP * 92.0))));
    float aggregate = groundNoise(asphaltP * 30.0);
    aggregate = mix(aggregate, .5, smoothstep(.6, 1.7, length(fwidth(asphaltP * 30.0))));
    float puddle = smoothstep(.43, .63, broad + wet * .21 - .09);
    float wetPatch = puddle * wet;
    // Keep wetness mainly in roughness and reflection. Large albedo changes and
    // strong grain normals can turn a lit asphalt floor into white camouflage.
    tint = mix(vec3(.014, .018, .023), vec3(.024, .029, .035), aggregate * .55 + grain * .18);
    tint *= mix(1.0, .84, wetPatch);
    float aggregateHeight = (.0017 * aggregate + .00045 * grain) * (1.0 - wetPatch * .80);
    float rippleA = sin(dot(asphaltP, vec2(6.5, 3.1)) + groundFbm(asphaltP * .3) * 3.5 - uAsphaltTime * 1.6);
    float rippleB = sin(dot(asphaltP, vec2(-3.9, 8.3)) - uAsphaltTime * .9);
    float rippleHeight = (rippleA * .7 + rippleB * .3) * .006 * uAsphaltRippleStrength * wetPatch;
    height = (aggregateHeight + rippleHeight) * uAsphaltNormalStrength * 2.5;
    // Base roughness targets the wet road; dry asphalt remains matte. Variation
    // changes the roughness field, with no broad brightening of the albedo.
    float roughnessPattern = (.5 - puddle) * .44 + (aggregate - .5) * .05;
    rough = mix(.86, uAsphaltRoughness, wet) + roughnessPattern * uAsphaltRoughnessVariation * wet;
    reflectivity = mix(.06, .94, wet) * mix(.78, 1.0, puddle);
  } else if (uGroundType > 1.5 && uGroundType < 2.5) {
    float warp = groundFbm(p * vec2(.8, .45));
    float wave = sin(p.x * 18.0 + warp * 10.0 + sin(p.y * 1.7) * .65);
    float ripple = wave * .5 + .5;
    float crest = pow(ripple, 3.0);
    tint = mix(vec3(.34, .225, .115), vec3(.58, .43, .25), broad * .55 + ripple * .25 + .2);
    tint *= .92 + grain * .15;
    tint *= mix(1.0, .69, wet);
    height = crest * .031 + groundNoise(p * 14.0) * .004 + grain * .0015;
    rough = mix(.98, .78, wet);
    reflectivity = wet * wet * .18;
  } else if (uGroundType > 2.5 && uGroundType < 3.5) {
    vec2 cell, local; float border;
    groundCells(p * vec2(.84, 1.03), cell, local, border);
    border = groundSlateBorder(p * vec2(.84, 1.03), cell, local);
    float stone = groundHash(cell + 51.2);
    float joint = groundBand(border, .012);
    float bevel = smoothstep(.009, .04 + fwidth(border), border);
    float layers = groundFbm(p * vec2(3.4, 11.0) + stone * 17.0);
    float cleft = groundFilteredNoise(p * vec2(9.0, 34.0) + layers * 1.4);
    tint = mix(vec3(.047, .060, .068), vec3(.10, .118, .123), stone * .6 + broad * .4);
    tint *= .9 + layers * .19 + (grain - .5) * .025;
    tint = mix(tint * mix(1.0, .76, wet), vec3(.022, .026, .027), joint);
    height = bevel * .006 + layers * .0028 + cleft * .0008 - joint * .003;
    rough = mix(.84, .34, wet) + (cleft - .5) * .1 + joint * .15;
    reflectivity = mix(.055, .66, wet) * (1.0 - joint * .9);
  } else if (uGroundType > 3.5 && uGroundType < 4.5) {
    vec2 tile = p / vec2(1.3, .78);
    tile.x += mod(floor(tile.y), 2.0) * .5;
    vec2 tileID = floor(tile), edge = min(fract(tile), 1.0 - fract(tile)) * vec2(1.3, .78);
    float border = min(edge.x, edge.y), joint = groundBand(border, .006);
    float stone = groundHash(tileID + 4.2);
    float strata = groundFbm(vec2(p.x * .65, p.y * 11.0 + groundNoise(p * .7) * 2.8) + stone * 11.0);
    vec2 poresP = p * vec2(25.0, 48.0), poresID = floor(poresP);
    vec2 poresLocal = fract(poresP) - .5;
    float poresSeed = groundHash(poresID + 81.2);
    float pore = groundBand(length(poresLocal * vec2(.8, 1.0)), .08 + poresSeed * .1) * step(.70, poresSeed);
    pore *= 1.0 - smoothstep(.55, 1.3, length(fwidth(poresP)));
    tint = mix(vec3(.46, .361, .244), vec3(.63, .535, .399), strata * .65 + stone * .35);
    tint *= .98 + (grain - .5) * .026;
    tint = mix(tint, vec3(.28, .215, .143), pore * .35);
    tint = mix(tint * mix(1.0, .84, wet), vec3(.31, .274, .218), joint);
    height = smoothstep(.006, .027 + fwidth(border), border) * .003 - pore * .0012 + strata * .0006;
    rough = mix(.68, .25, wet) + pore * .16 + (strata - .5) * .05 + joint * .18;
    reflectivity = mix(.10, .64, wet) * (1.0 - joint * .8);
  } else if (uGroundType > 4.5 && uGroundType < 5.5) {
    vec2 cell, local; float border;
    vec2 chipP = p * 17.0;
    groundCells(chipP, cell, local, border);
    float chipSeed = groundHash(cell + 68.0);
    float chips = groundChip(local, chipSeed, .17 + groundHash(cell + 2.1) * .18);
    // Fade the whole chip contrast below a pixel, rather than leaving an
    // aliased collection of high-contrast specks on the far side of the floor.
    chips *= 1.0 - smoothstep(.65, 1.6, length(fwidth(chipP)));
    vec3 chipColor = vec3(.085, .096, .092);
    if (chipSeed > .28) chipColor = vec3(.295, .173, .12);
    if (chipSeed > .49) chipColor = vec3(.195, .25, .218);
    if (chipSeed > .72) chipColor = vec3(.69, .625, .49);
    tint = mix(vec3(.53, .496, .422), vec3(.62, .583, .499), broad * .45 + .22);
    tint = mix(tint, chipColor * (.88 + groundHash(cell + 9.0) * .2), chips);
    tint *= mix(1.0, .92, wet) * (.995 + (grain - .5) * .012);
    height = grain * .0003 + chips * .00012;
    rough = mix(.49, .18, wet) + (grain - .5) * .055 - chips * .035;
    reflectivity = mix(.18, .78, wet);
  } else if (uGroundType > 5.5 && uGroundType < 6.5) {
    vec2 hp = p / .72, lattice = vec2(1.0, 1.7320508);
    vec2 a = mod(hp, lattice) - lattice * .5;
    vec2 b = mod(hp - lattice * .5, lattice) - lattice * .5;
    vec2 local = dot(a, a) < dot(b, b) ? a : b;
    vec2 tileID = hp - local;
    float border = (.5 - max(abs(local.x), dot(abs(local), vec2(.5, .8660254)))) * .72;
    float joint = groundBand(border, .008);
    float bevel = smoothstep(.008, .029 + fwidth(border), border);
    float tile = groundHash(tileID + 34.5);
    float cloud = groundFbm(p * 4.0 + tile * 8.0);
    tint = mix(vec3(.021, .027, .033), vec3(.049, .060, .066), tile * .64 + cloud * .36);
    tint *= mix(1.0, .8, wet) * (.98 + (grain - .5) * .04);
    tint = mix(tint, vec3(.087, .097, .095), joint);
    height = bevel * .004 + cloud * .0007 + grain * .0002;
    rough = mix(.59, .24, wet) + (tile - .5) * .07 + joint * .24;
    reflectivity = mix(.13, .76, wet) * (1.0 - joint * .86);
  } else if (uGroundType > 6.5 && uGroundType < 7.5) {
    vec2 cell, local; float border;
    groundCells(p * .85, cell, local, border);
    float crack = groundBand(border, .007) * smoothstep(.48, .69, groundFbm(p * 1.3));
    vec2 pebbleCell, pebbleLocal; float pebbleBorder;
    vec2 gritP = p * 13.0;
    groundCells(gritP, pebbleCell, pebbleLocal, pebbleBorder);
    float stone = groundHash(pebbleCell + 23.1);
    float grit = groundChip(pebbleLocal, stone, .10 + stone * .11) * step(.67, stone);
    grit *= 1.0 - smoothstep(.6, 1.4, length(fwidth(gritP)));
    float clumps = groundFilteredNoise(p * 17.0);
    float damp = wet * smoothstep(.32, .67, broad);
    tint = mix(vec3(.105, .067, .038), vec3(.237, .163, .094), broad * .72 + clumps * .28);
    tint *= .94 + (grain - .5) * .085;
    tint = mix(tint, vec3(.24, .218, .174), grit * .7);
    tint = mix(tint * mix(1.0, .59, damp), vec3(.052, .036, .023), crack * .65);
    height = clumps * .002 + grain * .0004 + grit * .0015 - crack * .004;
    rough = mix(.98, .73, damp) - grit * .035;
    reflectivity = .008 + damp * damp * .14;
  } else if (uGroundType > 7.5 && uGroundType < 9.5) {
    bool dry = uGroundType > 8.5;
    vec2 turfP = p * (dry ? 8.2 : 10.5);
    vec4 tufts = groundGrassTufts(turfP);
    float growth = groundFbm(p * .83 + 47.2);
    float soil = dry ? smoothstep(.52, .70, growth) : smoothstep(.65, .81, growth);
    float cover = tufts.x * (1.0 - soil * .94);
    float fine = groundFilteredNoise(p * 37.0);
    vec3 undergrowth = dry
      ? mix(vec3(.10, .103, .031), vec3(.235, .185, .065), broad)
      : mix(vec3(.023, .069, .015), vec3(.061, .142, .025), broad * .8 + growth * .2);
    vec3 bladeColor = dry
      ? mix(vec3(.21, .186, .058), vec3(.43, .333, .135), tufts.z)
      : mix(vec3(.037, .117, .020), vec3(.112, .218, .039), tufts.z);
    vec3 soilColor = mix(vec3(.097, .065, .031), vec3(.176, .124, .061), broad * .6 + fine * .4);
    tint = mix(undergrowth * (.88 + fine * .22), soilColor, soil);
    tint = mix(tint, bladeColor * (.95 + tufts.y * .06), cover);
    float damp = wet * (.55 + growth * .45);
    tint *= mix(1.0, .73, damp);
    height = groundFilteredNoise(p * 13.0) * .0027 + (tufts.w * .0015 + tufts.y * .00025) * (1.0 - soil);
    rough = mix(.99, .84, damp) - cover * .025;
    reflectivity = .004 + damp * damp * mix(.043, .095, soil);
  } else if (uGroundType > 9.5 && uGroundType < 10.5) {
    float clumps = groundFilteredNoise(p * 11.0);
    float fine = groundFilteredNoise(p * 49.0);
    vec2 cell, local; float border;
    vec2 litterP = p * 3.0;
    groundCells(litterP, cell, local, border);
    float seed = groundHash(cell + 82.3), angle = seed * 6.2831853;
    vec2 q = mat2(cos(angle), -sin(angle), sin(angle), cos(angle)) * local;
    // Tapered fallen leaves and a restrained center vein, with most cells bare.
    float leafWidth = .105 * max(1.0 - pow(abs(q.y) / .26, 1.4), 0.0);
    float leaf = groundBand(abs(q.x + sin(q.y * 9.0) * .018), leafWidth) * (1.0 - smoothstep(.24, .27, abs(q.y))) * step(.77, seed);
    float leafVein = groundBand(abs(q.x), .007) * leaf;
    float detail = 1.0 - smoothstep(.50, 1.45, length(fwidth(litterP)));
    leaf *= detail; leafVein *= detail;
    vec2 rootsP = p * 1.7, rootID = floor(rootsP), rootLocal = fract(rootsP) - .5;
    float rootSeed = groundHash(rootID + 15.8);
    float rootCurve = rootLocal.x + sin(rootLocal.y * 5.4 + rootSeed * 6.3) * .15;
    float root = groundBand(abs(rootCurve), .011) * (1.0 - smoothstep(.26, .48, abs(rootLocal.y))) * step(.82, rootSeed);
    root *= 1.0 - smoothstep(.48, 1.35, length(fwidth(rootsP)));
    tint = mix(vec3(.037, .023, .013), vec3(.115, .077, .040), broad * .6 + clumps * .4);
    tint *= .87 + fine * .24;
    tint = mix(tint, mix(vec3(.15, .071, .023), vec3(.275, .163, .055), seed), leaf * .87);
    tint = mix(tint, vec3(.15, .110, .059), root * .7 + leafVein * .14);
    float damp = wet * smoothstep(.23, .68, broad);
    tint *= mix(1.0, .65, damp);
    height = clumps * clumps * .009 + fine * .00065 + leaf * .002 + root * .0021;
    rough = mix(.99, .79, damp) - leaf * .045;
    reflectivity = .005 + damp * damp * .11 * (1.0 - leaf * .75);
  } else if (uGroundType > 10.5 && uGroundType < 11.5) {
    vec2 cell, local; float border;
    vec2 stoneP = p * 4.2;
    groundCells(stoneP, cell, local, border);
    float seed = groundHash(cell + 26.5);
    float radius = .16 + groundHash(cell + 83.7) * .23;
    float edge = groundStoneEdge(local, seed);
    float stones = groundBand(edge, radius) * smoothstep(.08, .22, seed);
    float cap = smoothstep(0.0, .075, radius - edge);
    float stoneFade = 1.0 - smoothstep(.65, 1.6, length(fwidth(stoneP)));
    stones *= stoneFade; cap *= stoneFade;
    vec2 gritCell, gritLocal; float gritBorder;
    vec2 gritP = p * 20.0;
    groundCells(gritP, gritCell, gritLocal, gritBorder);
    float gritSeed = groundHash(gritCell + 37.1);
    float grit = groundChip(gritLocal, gritSeed, .11 + gritSeed * .11) * step(.55, gritSeed);
    grit *= 1.0 - smoothstep(.55, 1.35, length(fwidth(gritP)));
    float fine = groundFilteredNoise(p * 35.0);
    vec3 soilColor = mix(vec3(.112, .073, .037), vec3(.224, .157, .084), broad * .68 + fine * .32);
    vec3 stoneColor = mix(vec3(.111, .109, .089), vec3(.285, .266, .214), seed);
    stoneColor = mix(stoneColor, vec3(.224, .135, .075), smoothstep(.69, .94, seed) * .56);
    tint = mix(soilColor, vec3(.244, .222, .167), grit * .6);
    tint = mix(tint, stoneColor * (.79 + cap * .25), stones);
    float damp = wet * (.35 + broad * .65);
    tint *= mix(1.0, .62, damp);
    height = fine * .0018 + grit * .0017 + stones * cap * (.012 + seed * .016);
    rough = mix(.98, .72, damp) - stones * .09;
    reflectivity = .007 + damp * damp * mix(.105, .21, stones);
  }
}

vec3 groundBumpNormal(vec3 surfPosition, vec3 surfNormal, float height) {
  vec3 sigmaX = dFdx(surfPosition);
  vec3 sigmaY = dFdy(surfPosition);
  vec3 r1 = cross(sigmaY, surfNormal);
  vec3 r2 = cross(surfNormal, sigmaX);
  float determinant = dot(sigmaX, r1);
  vec3 gradient = sign(determinant) * (dFdx(height) * r1 + dFdy(height) * r2);
  return normalize(max(abs(determinant), 1e-9) * surfNormal - gradient);
}

// Camera-correct projection of an approximate normal-induced ray offset. The
// normal is converted from view space before comparing reflected rays; using
// its view-space XY directly would rotate the distortion when orbiting.
vec2 asphaltReflectionOffset(vec2 baseUV, vec3 viewNormal, vec3 viewDirection) {
  vec3 worldNormal = inverseTransformDirection(viewNormal, viewMatrix);
  vec3 worldView = inverseTransformDirection(viewDirection, viewMatrix);
  vec3 flatRay = reflect(-worldView, vec3(0.0, 1.0, 0.0));
  vec3 detailRay = reflect(-worldView, worldNormal);
  vec2 flatSlope = flatRay.xz / max(flatRay.y, .25);
  vec2 detailSlope = detailRay.xz / max(detailRay.y, .25);
  vec2 shift = clamp((detailSlope - flatSlope) * .3 * uAsphaltReflectionDistortion * uGroundWetness, vec2(-.12), vec2(.12));
  vec4 shifted = uGroundWorldReflectionMatrix * vec4(vGroundWorld + vec3(shift.x, 0.0, shift.y), 1.0);
  vec2 offset = shifted.xy / max(shifted.w, .00001) - baseUV;
  float offsetLength = length(offset);
  return offset * min(1.0, .014 / max(offsetLength, .00001));
}

// A mip-filtered kernel gives asphalt a continuous, visibly rough reflection
// without sparse large-tap ghosting. This is an approximation, not GGX blur.
// Other grounds retain the original base-level nine-tap filter.
vec3 groundReflection(vec2 uv, float rough) {
  bool asphalt = uGroundType > .5 && uGroundType < 1.5;
  float lod = asphalt ? pow(rough, 1.25) * 4.6 : 0.0;
  float radius = asphalt ? .45 + rough * rough * 14.0 : .45 + rough * rough * 7.0;
  vec2 stepSize = uGroundReflectionTexel * radius;
  vec3 sum = texture2DLodEXT(uGroundReflectionMap, uv, lod).rgb * .28;
  sum += texture2DLodEXT(uGroundReflectionMap, uv + vec2(stepSize.x, 0), lod).rgb * .12;
  sum += texture2DLodEXT(uGroundReflectionMap, uv - vec2(stepSize.x, 0), lod).rgb * .12;
  sum += texture2DLodEXT(uGroundReflectionMap, uv + vec2(0, stepSize.y), lod).rgb * .12;
  sum += texture2DLodEXT(uGroundReflectionMap, uv - vec2(0, stepSize.y), lod).rgb * .12;
  sum += texture2DLodEXT(uGroundReflectionMap, uv + stepSize, lod).rgb * .06;
  sum += texture2DLodEXT(uGroundReflectionMap, uv - stepSize, lod).rgb * .06;
  sum += texture2DLodEXT(uGroundReflectionMap, uv + vec2(stepSize.x, -stepSize.y), lod).rgb * .06;
  sum += texture2DLodEXT(uGroundReflectionMap, uv + vec2(-stepSize.x, stepSize.y), lod).rgb * .06;
  return sum;
}
`;

/**
 * A procedural, shadow-receiving PBR ground with a real reflected scene render.
 * Add the returned group to the scene. update() merges options, resize() accepts
 * the CSS viewport dimensions, and dispose() releases its geometry/material/RT.
 * step(dt) advances the procedural asphalt ripple phase in seconds. A zero
 * ripple speed freezes the existing pattern. Reflection 0 skips the extra
 * scene render entirely. No image assets are used.
 */
export function createGround(renderer, scene, options = {}) {
  const state = { ...defaultOptions };
  const group = new THREE.Group();
  group.name = 'Procedural ground';
  const geometry = new THREE.PlaneGeometry(200, 200);
  const reflector = new Reflector(geometry, {
    textureWidth: 768,
    textureHeight: 768,
    clipBias: .003,
    multisample: 0,
  });
  reflector.name = 'Ground planar reflection camera helper';
  // The helper is deliberately not part of the scene. The visible floor drives
  // its onBeforeRender hook and samples its linear-color render target.
  const reflectionTarget = reflector.getRenderTarget();
  reflectionTarget.texture.generateMipmaps = true;
  reflectionTarget.texture.minFilter = THREE.LinearMipmapLinearFilter;
  const uniforms = {
    uGroundType: { value: 0 },
    uGroundScale: { value: 1 },
    uGroundWetness: { value: .5 },
    uGroundReflection: { value: .35 },
    uStudioColor: { value: new THREE.Color(defaultOptions.studioColor) },
    uGroundReflectionMap: { value: reflectionTarget.texture },
    uGroundReflectionMatrix: reflector.material.uniforms.textureMatrix,
    uGroundWorldReflectionMatrix: { value: new THREE.Matrix4() },
    uGroundReflectionTexel: { value: new THREE.Vector2(1 / 768, 1 / 768) },
    uAsphaltTime: { value: 0 },
  };
  for (const [key, value] of Object.entries(ASPHALT_DEFAULTS)) uniforms[asphaltUniform(key)] = { value };
  const material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .8, metalness: 0 });
  material.name = 'Procedural ground PBR + planar reflection';
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        uniform mat4 uGroundReflectionMatrix;
        varying vec3 vGroundWorld;
        varying vec4 vGroundProjected;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vGroundWorld = (modelMatrix * vec4(position, 1.0)).xyz;
        vGroundProjected = uGroundReflectionMatrix * vec4(position, 1.0);`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${groundShader}`)
      .replace('#include <map_fragment>', `#include <map_fragment>
        vec3 groundTint;
        float groundHeight, groundRoughness, groundReflectivity;
        groundSurface(vGroundWorld.xz / uGroundScale, groundTint, groundHeight, groundRoughness, groundReflectivity);
        diffuseColor.rgb *= groundTint;`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = clamp(groundRoughness, .07, 1.0);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        if (!(uGroundType > .5 && uGroundType < 1.5) || uAsphaltNormalStrength > .00001) {
          normal = groundBumpNormal(-vViewPosition, normal, groundHeight * uGroundScale);
        }`)
      .replace('#include <aomap_fragment>', `#include <aomap_fragment>
        if (uGroundType > .5 && uGroundType < 1.5) {
          // The local planar camera supplies the wet asphalt reflection. Keep
          // the bright room environment from adding a second pale reflection.
          reflectedLight.indirectSpecular *= .12;
          reflectedLight.directSpecular *= .28;
        }`)
      .replace('#include <opaque_fragment>', `
        if (uGroundReflection > .0001 && vGroundProjected.w > .00001) {
          vec2 groundReflectionUV = vGroundProjected.xy / vGroundProjected.w;
          float inside = step(0.0, groundReflectionUV.x) * step(groundReflectionUV.x, 1.0)
                       * step(0.0, groundReflectionUV.y) * step(groundReflectionUV.y, 1.0);
          vec3 reflectionView = isOrthographic ? vec3(0.0, 0.0, 1.0) : normalize(vViewPosition);
          float grazing = pow(1.0 - max(dot(nonPerturbedNormal, reflectionView), 0.0), 3.0);
          float reflectMix = uGroundReflection * groundReflectivity * mix(.42, .92, grazing) * inside;
          if (uGroundType > .5 && uGroundType < 1.5) {
            float edge = min(min(groundReflectionUV.x, 1.0 - groundReflectionUV.x), min(groundReflectionUV.y, 1.0 - groundReflectionUV.y));
            float edgeMargin = max(uGroundReflectionTexel.x, uGroundReflectionTexel.y) * (3.0 + roughnessFactor * roughnessFactor * 28.0) + .014;
            float borderFade = smoothstep(0.0, edgeMargin, edge);
            if (uAsphaltNormalStrength > .00001 && uAsphaltReflectionDistortion > .00001) {
              groundReflectionUV += asphaltReflectionOffset(groundReflectionUV, normal, reflectionView) * borderFade;
            }
            groundReflectionUV = clamp(groundReflectionUV, uGroundReflectionTexel, 1.0 - uGroundReflectionTexel);
            reflectMix *= borderFade;
          }
          vec3 planarColor = groundReflection(groundReflectionUV, roughnessFactor);
          outgoingLight = mix(outgoingLight, planarColor, clamp(reflectMix, 0.0, .92));
        }
        #include <opaque_fragment>`);
    material.userData.shader = shader;
  };
  material.customProgramCacheKey = () => 'rock-lab-ground-pbr-twelve-surfaces-v4';

  const floor = new THREE.Mesh(geometry, material);
  floor.name = 'Procedural ground surface';
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -.005;
  floor.receiveShadow = true;
  floor.renderOrder = -1;
  group.add(floor);

  let renderingReflection = false;
  let reflectionPasses = 0;
  let disposed = false;
  const inverseFloorMatrix = new THREE.Matrix4();
  floor.onBeforeRender = (activeRenderer, activeScene, camera) => {
    if (disposed || renderingReflection || state.reflection <= .0001) return;
    // The floor must be absent from the virtual camera's render; otherwise a
    // coplanar receiver can cover the rock reflection or cause nested recursion.
    renderingReflection = true;
    const wasVisible = group.visible;
    // Editor handles and selection aids are overlays, not reflected geometry.
    const editorHelpers = activeScene.children.filter(object => object.userData.sceneEditorHelper && object.visible);
    for (const helper of editorHelpers) helper.visible = false;
    const autoReset = activeRenderer.info.autoReset;
    const shadowAutoUpdate = activeRenderer.shadowMap.autoUpdate;
    const shadowNeedsUpdate = activeRenderer.shadowMap.needsUpdate;
    const xrEnabled = activeRenderer.xr.enabled;
    const target = activeRenderer.getRenderTarget();
    const cubeFace = activeRenderer.getActiveCubeFace();
    const mipLevel = activeRenderer.getActiveMipmapLevel();
    group.visible = false;
    activeRenderer.info.autoReset = false;
    activeRenderer.shadowMap.needsUpdate = false;
    reflector.matrixWorld.copy(floor.matrixWorld);
    try {
      reflector.onBeforeRender(activeRenderer, activeScene, camera);
      inverseFloorMatrix.copy(floor.matrixWorld).invert();
      uniforms.uGroundWorldReflectionMatrix.value.copy(uniforms.uGroundReflectionMatrix.value).multiply(inverseFloorMatrix);
      reflectionPasses++;
    } finally {
      group.visible = wasVisible;
      for (const helper of editorHelpers) helper.visible = true;
      activeRenderer.info.autoReset = autoReset;
      activeRenderer.shadowMap.autoUpdate = shadowAutoUpdate;
      activeRenderer.shadowMap.needsUpdate = shadowNeedsUpdate;
      activeRenderer.xr.enabled = xrEnabled;
      // This restores the target's physical viewport/scissor/scissorTest, or
      // the canvas's DPR-scaled state. Reflector never changes their logical
      // definitions. Calling setViewport/setScissor here would apply canvas
      // DPR inside the smaller transmission target and crop its ground image.
      activeRenderer.setRenderTarget(target, cubeFace, mipLevel);
      renderingReflection = false;
    }
  };

  function update(next = {}) {
    for (const key of ['reflection', 'groundScale', 'groundWetness']) {
      if (Number.isFinite(next[key])) state[key] = THREE.MathUtils.clamp(next[key], key === 'groundScale' ? .3 : 0, key === 'groundScale' ? 4 : 1);
    }
    for (const [key, [min, max]] of Object.entries(asphaltBounds)) {
      if (Number.isFinite(next[key])) state[key] = THREE.MathUtils.clamp(next[key], min, max);
      uniforms[asphaltUniform(key)].value = state[key];
    }
    if (Object.hasOwn(next, 'ground')) state.ground = normalizeGroundId(next.ground, state.ground);
    if (next.studioColor !== undefined) {
      state.studioColor = next.studioColor;
      uniforms.uStudioColor.value.set(next.studioColor);
    }
    uniforms.uGroundType.value = groundIds.indexOf(state.ground);
    uniforms.uGroundScale.value = state.groundScale;
    uniforms.uGroundWetness.value = state.groundWetness;
    uniforms.uGroundReflection.value = state.reflection;
  }
  function step(dt) {
    if (disposed || state.ground !== 'asphalt' || !(dt > 0) || !Number.isFinite(dt) || state.asphaltRippleSpeed <= 0) return;
    uniforms.uAsphaltTime.value += dt * state.asphaltRippleSpeed;
  }
  function resize(width, height) {
    if (!(width > 0 && height > 0) || disposed) return;
    const ratio = Math.min(renderer.getPixelRatio(), 1.5);
    const scale = Math.min(1, 1024 / Math.max(width * ratio, height * ratio));
    const w = Math.max(256, Math.round(width * ratio * scale));
    const h = Math.max(256, Math.round(height * ratio * scale));
    if (reflectionTarget.width !== w || reflectionTarget.height !== h) reflectionTarget.setSize(w, h);
    uniforms.uGroundReflectionTexel.value.set(1 / w, 1 / h);
  }
  function dispose() {
    if (disposed) return;
    disposed = true;
    group.removeFromParent();
    floor.onBeforeRender = () => {};
    material.dispose();
    reflector.dispose();
    geometry.dispose();
  }
  update(options);
  return {
    group, update, step, resize, dispose,
    getStats: () => ({
      ground: state.ground,
      reflectionEnabled: state.reflection > .0001,
      reflectionPasses,
      reflectionWidth: reflectionTarget.width,
      reflectionHeight: reflectionTarget.height,
      procedural: true,
      ...Object.fromEntries(Object.keys(ASPHALT_DEFAULTS).map(key => [key, state[key]])),
      asphaltTime: uniforms.uAsphaltTime.value,
    }),
  };
}
