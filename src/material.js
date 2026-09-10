import { Color, Float32BufferAttribute, MeshPhysicalMaterial, ShaderChunk, Vector3 } from 'three';
import { OPTICAL_DEFAULTS, OPTICAL_PRESETS, OPTICAL_RANGES } from './optical.js';

// The seven opaque surfaces retain their original program behavior. The optical
// family additionally uses Three's native transmission/dispersion/iridescence
// variants; ordinary slider moves reuse those programs while a 0/positive toggle
// may select another cached native variant.
export const rockMaterialProgramKey = 'procedural-rock-surface-v9';

export const ROCK_SURFACES = Object.freeze([
  { key: 'stone', name: 'Alpine stone', description: 'Cool painted planes and chipped edges', defaultRoughness: 0.85 },
  { key: 'ice', name: 'Glacial ice', description: 'Cyan depths with pale frozen fractures', defaultRoughness: 0.30 },
  { key: 'desert', name: 'Red sandstone', description: 'Iron-red rock with wavy sediment layers', defaultRoughness: 0.90 },
  { key: 'limestone', name: 'Chalk limestone', description: 'Warm ivory stone with chalky inclusions', defaultRoughness: 0.93 },
  { key: 'granite', name: 'Speckled granite', description: 'Cool quartz, feldspar and dark mineral grains', defaultRoughness: 0.72 },
  { key: 'basalt', name: 'Volcanic basalt', description: 'Dark matte stone with irregular vesicle pits', defaultRoughness: 0.96 },
  { key: 'obsidian', name: 'Glossy obsidian', description: 'Black volcanic glass with conchoidal flow bands', defaultRoughness: 0.08 },
  { key: 'glass', name: 'Clear glass', description: 'Refractive glass with depth absorption and sparse inclusions', defaultRoughness: 0.08 },
  { key: 'quartz', name: 'Clouded quartz', description: 'Translucent mineral with suspended clouds and internal fractures', defaultRoughness: 0.15 },
  { key: 'frozenGlass', name: 'Clear frozen glass', description: 'Transmissive blue ice with trapped inclusions and frozen cracks', defaultRoughness: 0.18 },
]);
const mapViews = ['beauty', 'normal', 'height', 'roughness'];
const surfaceEnvironmentIntensity = [0.35, 0.7, 0.4, 0.32, 0.4, 0.45, 1.2, 1, 1, 1];

const vertexDeclarations = /* glsl */`
attribute float aFaceTone;
attribute float aBevel;
attribute vec4 aRockPosition;
attribute float aRockOriginalUp;
attribute float aRockThicknessLimit;
varying vec3 vRockPosition;
varying vec2 vRockUV;
varying float vRockCoverageSlope;
varying float vRockThicknessLimit;
varying vec3 vRockLocalNormal;
varying vec3 vRockWorldNormal;
varying float vRockFaceTone;
varying float vRockBevel;
`;

const fragmentDeclarations = /* glsl */`
uniform float uRockIce;
uniform float uRockSurface;
uniform float uRockSnow;
uniform float uRockDetail;
uniform float uRockContrast;
uniform float uRockHue;
uniform float uRockNoiseScale;
uniform float uRockNoiseAmount;
uniform float uRockNormalStrength;
uniform float uRockRoughness;
uniform float uRockMapView;
uniform float uRockEnvironment;
uniform float uRockInterior;
uniform vec3 uRockTint;
uniform float uRockTintAmount;
uniform float uRockCloudiness;
uniform float uRockInclusions;
uniform float uRockInclusionScale;
uniform float uRockInternalCracks;
varying vec3 vRockPosition;
varying vec2 vRockUV;
varying float vRockCoverageSlope;
varying float vRockThicknessLimit;
varying vec3 vRockLocalNormal;
varying vec3 vRockWorldNormal;
varying float vRockFaceTone;
varying float vRockBevel;

float rockHash(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.yzx + 33.33);
  return fract((p.x + p.y) * p.z);
}

float rockNoise(vec3 p) {
  vec3 cell = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(rockHash(cell), rockHash(cell + vec3(1, 0, 0)), f.x),
        mix(rockHash(cell + vec3(0, 1, 0)), rockHash(cell + vec3(1, 1, 0)), f.x), f.y),
    mix(mix(rockHash(cell + vec3(0, 0, 1)), rockHash(cell + vec3(1, 0, 1)), f.x),
        mix(rockHash(cell + vec3(0, 1, 1)), rockHash(cell + vec3(1, 1, 1)), f.x), f.y), f.z
  );
}

// The fields live in object space: rotating the asset or orbiting its camera
// never moves the pattern. The smallest grains fade out before they alias.
float rockFilteredNoise(vec3 p) {
  float footprint = max(length(dFdx(p)), length(dFdy(p)));
  return mix(rockNoise(p), 0.5, smoothstep(0.24, 0.95, footprint));
}

// Surface-gradient bump mapping needs no UVs, tangents or extra vertices.
// Unlike a displacement map it changes lighting, not the mesh silhouette.
vec3 rockPerturbNormal(vec3 eyePosition, vec3 surfaceNormal, float height, float faceSign) {
  vec3 sigmaX = dFdx(eyePosition);
  vec3 sigmaY = dFdy(eyePosition);
  vec3 r1 = cross(sigmaY, surfaceNormal);
  vec3 r2 = cross(surfaceNormal, sigmaX);
  float determinant = dot(sigmaX, r1) * faceSign;
  vec3 gradient = sign(determinant) * (dFdx(height) * r1 + dFdy(height) * r2);
  return normalize(max(abs(determinant), 0.0000001) * surfaceNormal - gradient);
}

// Linear interpolation within the six tetrahedra of a lattice cube gives
// angular painted chips using only four hashes. Shared corners/face diagonals
// make the scalar field continuous across cubes, independent of mesh normals.
float rockPaintVolume(vec3 p) {
  vec3 cell = floor(p);
  vec3 f = fract(p);
  vec3 axisA;
  vec3 axisB;
  vec3 sorted;
  if (f.x >= f.y) {
    if (f.y >= f.z) {
      axisA = vec3(1, 0, 0); axisB = vec3(1, 1, 0); sorted = f.xyz;
    } else if (f.x >= f.z) {
      axisA = vec3(1, 0, 0); axisB = vec3(1, 0, 1); sorted = f.xzy;
    } else {
      axisA = vec3(0, 0, 1); axisB = vec3(1, 0, 1); sorted = f.zxy;
    }
  } else {
    if (f.x >= f.z) {
      axisA = vec3(0, 1, 0); axisB = vec3(1, 1, 0); sorted = f.yxz;
    } else if (f.y >= f.z) {
      axisA = vec3(0, 1, 0); axisB = vec3(0, 1, 1); sorted = f.yzx;
    } else {
      axisA = vec3(0, 0, 1); axisB = vec3(0, 1, 1); sorted = f.zyx;
    }
  }
  return rockHash(cell) * (1.0 - sorted.x)
    + rockHash(cell + axisA) * (sorted.x - sorted.y)
    + rockHash(cell + axisB) * (sorted.y - sorted.z)
    + rockHash(cell + vec3(1.0)) * sorted.z;
}

// Intersecting low-frequency contour planes form broken internal fractures.
// These continue around a sphere or rounded edge without axis-selection seams
// and avoid three projected copies of a neighboring-cell search.
vec3 rockFractureVolume(vec3 p) {
  float a = rockPaintVolume(p + vec3(0.37, -0.61, 2.19));
  float b = rockPaintVolume(p.yzx * 1.13 + vec3(4.72, 1.84, -3.17));
  float distanceToFracture = min(abs(a - 0.47), abs(b - 0.53)) * 1.8;
  return vec3(distanceToFracture, rockPaintVolume(p * 0.91 + vec3(5.81, -1.43, 3.62)), 0.0);
}

// Reconstruct the local coordinate basis from the actual position fields.
// This maps a view-space ray into original asset coordinates even when Pinata
// has baked a transform, recentered the fragment, and rotated it again. The
// third axis assumes locally uniform scale, appropriate for generated rocks.
vec3 rockRayInPattern(vec3 viewRay, vec3 patternPosition) {
  vec3 dx = dFdx(-vViewPosition), dy = dFdy(-vViewPosition);
  vec3 qx = dFdx(patternPosition), qy = dFdy(patternPosition);
  float lx = max(length(dx), 0.000001);
  vec3 ex = dx / lx;
  float shear = dot(dy, ex);
  vec3 orthogonalY = dy - ex * shear;
  float ly = max(length(orthogonalY), 0.000001);
  vec3 ey = orthogonalY / ly;
  vec3 ezRaw = cross(ex, ey);
  vec3 ez = ezRaw / max(length(ezRaw), 0.000001);
  vec3 px = qx / lx;
  vec3 py = (qy - px * shear) / ly;
  vec3 pzRaw = cross(px, py);
  vec3 pz = pzRaw / max(length(pzRaw), 0.000001) * sqrt(max(length(px) * length(py), 0.000001));
  vec3 ray = px * dot(viewRay, ex) + py * dot(viewRay, ey) + pz * dot(viewRay, ez);
  return ray / max(length(ray), 0.000001);
}

// A small, bounded view-depth integration creates real parallax in suspended
// clouds, mineral inclusions and crack planes. It is an artistic local-volume
// approximation, not a mesh-ray intersection or a multiple-scattering solver.
vec3 rockInternalDensity(vec3 start, vec3 direction, float depth) {
  vec3 density = vec3(0.0);
  if (uRockCloudiness + uRockInclusions + uRockInternalCracks < 0.0001 || depth < 0.0001) return density;
  for (int i = 0; i < 6; i++) {
    float t = (float(i) + 0.5) / 6.0;
    vec3 samplePosition = (start + direction * depth * t) * uRockInclusionScale;
    if (uRockCloudiness > 0.0001) {
      float cloud = rockNoise(samplePosition * vec3(0.72, 1.03, 0.64) + vec3(8.1, -2.3, 4.7));
      density.x += smoothstep(0.30, 0.72, cloud);
    }
    if (uRockInclusions > 0.0001) {
      float mineral = rockPaintVolume(samplePosition * vec3(2.8, 4.9, 3.3) + vec3(3.7, 1.2, -6.4));
      density.y += smoothstep(0.65, 0.84, mineral);
    }
    if (uRockInternalCracks > 0.0001) {
      float crack = rockFractureVolume(samplePosition * 0.72 + vec3(1.2, -3.6, 5.1)).x;
      float aa = max(fwidth(crack), 0.002);
      density.z += 1.0 - smoothstep(0.007, 0.025 + aa, crack);
    }
  }
  return density / 6.0 * vec3(uRockCloudiness, uRockInclusions * 2.2, uRockInternalCracks * 1.3);
}
`;

const surfaceFragment = /* glsl */`
vec3 rockN = normalize(vRockWorldNormal);
// Cut surfaces deliberately use Pinata's generated UVs: its texture scale and
// offset therefore control the interior pattern. Exterior fields keep their
// original asset coordinates even after a fragment is recentered or moves.
vec3 rockP = mix(vRockPosition, vec3(vRockUV.x, vRockUV.y, 0.0), uRockInterior);
vec3 rockTextureP = rockP * (uRockNoiseScale * 0.5);
float rockBroad = rockNoise(rockTextureP * 1.7 + vec3(4.1, 2.7, 1.4));
float rockBrush = rockFilteredNoise(rockTextureP * vec3(9.0, 5.0, 8.0));
float rockFine = rockFilteredNoise(rockTextureP * 27.0 + vec3(8.3, 4.8, 2.1));
float rockTextureDetail = uRockDetail * uRockNoiseAmount * 2.0;
float rockTop = smoothstep(-0.12, 0.92, rockN.y);
float rockLightFacing = clamp(dot(rockN, normalize(vec3(-0.6, 0.9, 0.7))), 0.0, 1.0);
float rockFace = (vRockFaceTone - 0.5) * mix(0.10, 0.40, uRockContrast);
float rockPaint = rockPaintVolume(rockTextureP * 3.8 + vec3(1.6, -4.2, 2.7));
float rockPaintPatch = smoothstep(0.42, 0.56, rockPaint);

// The large planes and their bevels carry the style. Texture is a quiet layer.
vec3 rockStone = vec3(0.115, 0.140, 0.185);
rockStone += rockTop * vec3(0.052, 0.039, 0.003);
rockStone = mix(rockStone * vec3(0.75, 0.89, 1.09), rockStone, 0.30 + rockLightFacing * 0.70);
rockStone *= 1.0 + rockFace + (rockBroad - 0.5) * 0.29 * rockTextureDetail;
rockStone *= 1.0 + (rockPaintPatch - 0.5) * 0.40 * rockTextureDetail;
rockStone += (rockBrush - 0.5) * 0.024 * rockTextureDetail;
rockStone += rockPaintPatch * rockTextureDetail * vec3(0.009, 0.006, 0.001);
rockStone += vRockBevel * (0.008 + rockLightFacing * 0.027) * vec3(1.08, 1.02, 0.94);
rockStone *= mix(vec3(0.79, 0.96, 1.16), vec3(1.16, 1.01, 0.82), clamp(0.5 + uRockHue * 0.5, 0.0, 1.0));

vec3 rockCell = rockFractureVolume(rockTextureP * mix(1.9, 1.0, uRockIce));
float rockAA = max(fwidth(rockCell.x), 0.002);
float rockFissure = 1.0 - smoothstep(0.010, 0.026 + rockAA, rockCell.x);
float rockIceFissure = 1.0 - smoothstep(0.003, 0.009 + rockAA * 0.7, rockCell.x);
rockIceFissure *= 0.24 + 0.76 * smoothstep(0.30, 0.68, rockBrush);
float rockSparse = smoothstep(0.56, 0.72, rockCell.y) * smoothstep(0.31, 0.56, rockBroad)
  * smoothstep(0.32, 0.62, rockPaint);
float rockChipLip = smoothstep(0.024, 0.042 + rockAA, rockCell.x)
  * (1.0 - smoothstep(0.046, 0.087 + rockAA, rockCell.x));
rockStone *= 1.0 - rockFissure * rockSparse * rockTextureDetail * 0.52;
rockStone += rockChipLip * rockSparse * rockTextureDetail * (0.022 + rockLightFacing * 0.026) * vec3(1.07, 1.0, 0.84);

// Opaque ice: cyan interior planes, pale fractures and a restrained view rim.
// This is a painted depth illusion, without transmission or ray refraction.
vec3 rockWorldView = inverseTransformDirection(normalize(vViewPosition), viewMatrix);
float rockViewRim = pow(1.0 - abs(dot(rockWorldView, rockN)), 2.5);
vec3 rockIce = mix(vec3(0.018, 0.180, 0.330), vec3(0.13, 0.54, 0.66), rockTop * 0.70 + rockBroad * 0.30);
rockIce *= 0.91 + rockFace * 0.78 + rockCell.y * 0.15;
rockIce += (rockBrush - 0.5) * rockTextureDetail * vec3(0.020, 0.040, 0.045);
rockIce += rockViewRim * vec3(0.075, 0.18, 0.20);
rockIce = mix(rockIce, vec3(0.47, 0.78, 0.85), rockIceFissure * (0.13 + rockTextureDetail * 0.42));
rockIce += vRockBevel * (0.027 + rockLightFacing * 0.065) * vec3(0.62, 0.92, 1.0);

// A single coherent 3D height field drives both the normal relief and its
// height-channel preview. No face-projected coordinates enter this field.
vec3 rockSurface = mix(rockStone, rockIce, uRockIce);
float rockHeightField = rockNoise(rockTextureP * 4.0 + vec3(2.7)) * 0.60 + rockBrush * 0.30 + rockFine * 0.10;
float rockReliefDepth = mix(0.032, 0.024, uRockIce);
float rockRoughnessVariation = (rockFine - 0.5) * 0.12;

if (uRockSurface > 1.5 && uRockSurface < 2.5) {
  // Sediment bands continue through the whole rock, with broad soft layers
  // and thinner compressed seams. The same layers produce shallow relief.
  float layers = rockTextureP.y * 5.5 + (rockBroad - 0.5) * 1.7
    + sin(rockTextureP.x * 1.6 + rockTextureP.z * 0.9) * 0.40;
  float layerWave = sin(layers * 3.14159265) * 0.5 + 0.5;
  float fineLayer = sin(layers * 3.14159265 * 3.0 + rockBrush * 0.35) * 0.5 + 0.5;
  float thinSeam = 1.0 - smoothstep(0.06, 0.16 + fwidth(fineLayer), fineLayer);
  vec3 sediment = mix(vec3(0.14, 0.018, 0.007), vec3(0.36, 0.070, 0.018), smoothstep(0.16, 0.86, layerWave));
  sediment = mix(sediment, vec3(0.43, 0.155, 0.050), smoothstep(0.87, 0.99, layerWave) * 0.30);
  rockSurface = mix(vec3(0.26, 0.043, 0.012), sediment, clamp(uRockNoiseAmount * 1.6, 0.0, 1.0));
  rockSurface *= 1.0 + rockFace + (rockFine - 0.5) * rockTextureDetail * 0.18;
  rockSurface *= 1.0 - thinSeam * rockTextureDetail * 0.18;
  rockSurface += rockTop * vec3(0.036, 0.020, 0.009) + vRockBevel * vec3(0.037, 0.024, 0.011);
  rockHeightField = layerWave * 0.43 + rockFine * 0.22 + rockBrush * 0.35 - thinSeam * 0.16;
  rockReliefDepth = 0.060;
  rockRoughnessVariation = (rockFine - 0.5) * 0.10 + thinSeam * 0.06;
} else if (uRockSurface > 2.5 && uRockSurface < 3.5) {
  float chalk = smoothstep(0.43, 0.74, rockNoise(rockTextureP * 5.0 + vec3(3.4)));
  float inclusions = smoothstep(0.69, 0.83, rockFine);
  rockSurface = mix(vec3(0.47, 0.395, 0.285), vec3(0.77, 0.715, 0.57), chalk * uRockNoiseAmount);
  rockSurface *= 1.0 + rockFace * 0.60 + (rockBrush - 0.5) * rockTextureDetail * 0.13;
  rockSurface = mix(rockSurface, vec3(0.22, 0.185, 0.126), inclusions * rockTextureDetail * 0.5);
  rockSurface += rockTop * vec3(0.055, 0.058, 0.049) + vRockBevel * vec3(0.035);
  rockHeightField = rockFine * 0.58 + chalk * 0.25 + rockBrush * 0.17 - inclusions * 0.15;
  rockReliefDepth = 0.036;
  rockRoughnessVariation = (rockFine - 0.5) * 0.06;
} else if (uRockSurface > 3.5 && uRockSurface < 4.5) {
  float quartz = smoothstep(0.51, 0.66, rockFine);
  float mica = 1.0 - smoothstep(0.24, 0.39, rockFine);
  float feldspar = smoothstep(0.52, 0.68, rockFilteredNoise(rockTextureP * 21.0 + vec3(14.7, 6.2, 3.1)));
  vec3 minerals = mix(vec3(0.26, 0.29, 0.32), vec3(0.62, 0.64, 0.65), quartz);
  minerals = mix(minerals, vec3(0.40, 0.29, 0.26), feldspar * 0.70);
  minerals = mix(minerals, vec3(0.028, 0.036, 0.052), mica * 0.94);
  rockSurface = mix(vec3(0.30, 0.32, 0.34), minerals, clamp(uRockNoiseAmount * 1.9, 0.0, 1.0));
  rockSurface *= 1.0 + rockFace * 0.60 + (rockBroad - 0.5) * rockTextureDetail * 0.20;
  rockSurface += vRockBevel * vec3(0.036, 0.038, 0.042);
  rockHeightField = rockFine * 0.73 + rockBrush * 0.27;
  rockReliefDepth = 0.027;
  rockRoughnessVariation = mica * 0.14 - quartz * 0.20;
} else if (uRockSurface > 4.5 && uRockSurface < 5.5) {
  float poreNoise = rockFilteredNoise(rockTextureP * 15.0 + vec3(2.1, 7.9, 5.8));
  float pits = 1.0 - smoothstep(0.22, 0.40, poreNoise);
  float lip = smoothstep(0.31, 0.40, poreNoise) * (1.0 - smoothstep(0.42, 0.48, poreNoise));
  rockSurface = vec3(0.048, 0.055, 0.059) * (1.0 + rockFace + (rockBroad - 0.5) * rockTextureDetail * 0.42);
  rockSurface *= 1.0 - pits * clamp(uRockNoiseAmount * 1.9, 0.0, 1.0) * 0.84;
  rockSurface += lip * rockTextureDetail * vec3(0.024, 0.022, 0.019);
  rockSurface += vRockBevel * vec3(0.013, 0.015, 0.017);
  rockHeightField = 0.68 + (rockFine - 0.5) * 0.22 - pits * 0.54 + lip * 0.06;
  rockReliefDepth = 0.085;
  rockRoughnessVariation = pits * 0.08 + (rockFine - 0.5) * 0.06;
} else if (uRockSurface > 5.5 && uRockSurface < 6.5) {
  // Obsidian is a dielectric: its bright reflections come from environment
  // light and low roughness, while its body remains a deep glassy black.
  float flow = sin(rockTextureP.y * 7.0 + rockTextureP.x * 3.5 + rockTextureP.z * 1.8 + rockBroad * 5.0) * 0.5 + 0.5;
  float sheenBand = smoothstep(0.72, 0.96, flow);
  rockSurface = mix(vec3(0.006, 0.009, 0.014), vec3(0.022, 0.029, 0.040), sheenBand * uRockNoiseAmount);
  rockSurface *= 1.0 + rockFace * 0.48;
  rockSurface += vRockBevel * vec3(0.005, 0.006, 0.009);
  rockHeightField = flow * 0.72 + rockBrush * 0.28;
  rockReliefDepth = 0.018;
  rockRoughnessVariation = (flow - 0.5) * 0.055;
} else if (uRockSurface > 6.5) {
  // Near-neutral interface color leaves tinting to actual path absorption.
  // The legacy cyan ice above remains its separate opaque painted surface.
  rockSurface = vec3(0.965, 0.980, 0.985);
  if (uRockSurface > 7.5 && uRockSurface < 8.5) rockSurface = vec3(0.975, 0.953, 0.988);
  else if (uRockSurface > 8.5) rockSurface = vec3(0.910, 0.972, 0.992);
  rockSurface *= 1.0 + rockFace * 0.06;
  rockReliefDepth = uRockSurface > 8.5 ? 0.012 : 0.006;
  rockRoughnessVariation = (rockBrush - 0.5) * 0.025 + uRockCloudiness * 0.07;
}

// Hue remains a gentle warm/cool adjustment across the new rock presets.
if (uRockSurface > 1.5 && uRockSurface < 6.5) {
  rockSurface *= mix(vec3(0.82, 0.97, 1.14), vec3(1.13, 1.0, 0.83), clamp(0.5 + uRockHue * 0.5, 0.0, 1.0));
}

float rockSnowThreshold = mix(0.96, 0.11, uRockSnow);
float rockSnowSlope = vRockCoverageSlope + (rockBroad - 0.5) * 0.25 + (rockBrush - 0.5) * 0.045;
float rockSnowMask = smoothstep(rockSnowThreshold - 0.055, rockSnowThreshold + 0.055, rockSnowSlope);
rockSnowMask *= smoothstep(0.0, 0.10, uRockSnow);
vec3 rockSnowColor = mix(vec3(0.66, 0.76, 0.91), vec3(0.91, 0.92, 0.94), rockLightFacing);
rockSnowColor *= 0.985 + rockBrush * 0.03;
rockSurface = mix(rockSurface, uRockTint, uRockTintAmount);
rockSurface = mix(rockSurface, rockSnowColor, rockSnowMask);
float rockSurfaceHeight = mix(0.5, clamp(rockHeightField, 0.0, 1.0), uRockNoiseAmount);
rockSurfaceHeight = mix(rockSurfaceHeight, 0.50 + (rockFine - 0.5) * 0.055, rockSnowMask);
float rockBumpHeight = rockSurfaceHeight * rockReliefDepth * uRockNormalStrength;
float rockSurfaceRoughness = clamp(uRockRoughness + rockRoughnessVariation * uRockNoiseAmount, 0.035, 1.0);
rockSurfaceRoughness = mix(rockSurfaceRoughness, 0.96, rockSnowMask);
diffuseColor.rgb *= max(rockSurface, vec3(0.0));
`;

const transmissionFragment = ShaderChunk.transmission_fragment
  .replace('material.transmission = transmission;', 'material.transmission = transmission * (1.0 - rockSnowMask);')
  .replace('material.thickness = thickness;', 'material.thickness = min(thickness, vRockThicknessLimit);')
  .replace('material.attenuationColor = attenuationColor;', 'material.attenuationColor = max(attenuationColor, vec3(0.0001));')
  .replace('vec3 v = normalize( cameraPosition - pos );', 'vec3 v = isOrthographic ? inverseTransformDirection(vec3(0.0, 0.0, 1.0), viewMatrix) : normalize(cameraPosition - pos);')
  .replace(/\n#endif\s*$/, /* glsl */`
    if (uRockSurface > 6.5 && uRockMapView < 0.5) {
      vec3 incidentView = isOrthographic ? vec3(0.0, 0.0, -1.0) : -normalize(vViewPosition);
      vec3 refractedView = refract(incidentView, normal, 1.0 / material.ior);
      vec3 patternRay = rockRayInPattern(refractedView, rockP);
      vec3 density = rockInternalDensity(rockP, patternRay, material.thickness);
      float volumeOpacity = 1.0 - exp(-dot(density, vec3(1.0)) * material.thickness);
      vec3 volumeColor = mix(vec3(0.58, 0.66, 0.73), material.attenuationColor, 0.25);
      volumeColor *= 0.22 + 0.58 * rockLightFacing + 0.20 * rockTop;
      totalDiffuse = mix(totalDiffuse, volumeColor, volumeOpacity * material.transmission);
    }
  #endif
`);

function finiteClamped(value, fallback, min = 0, max = 1) {
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}

export function updateRockMaterial(material, options = {}) {
  const uniforms = material.userData.rockUniforms;
  if (!uniforms) throw new Error('updateRockMaterial expects a material created by createRockMaterial.');
  if ('surface' in options) {
    const surfaceIndex = ROCK_SURFACES.findIndex((surface) => surface.key === options.surface);
    const index = Math.max(0, surfaceIndex);
    uniforms.uRockSurface.value = index;
    uniforms.uRockIce.value = index === 1 ? 1 : 0;
    uniforms.uRockEnvironment.value = surfaceEnvironmentIntensity[index];
    if (!('materialRoughness' in options)) uniforms.uRockRoughness.value = ROCK_SURFACES[index].defaultRoughness;
  }
  if ('snow' in options) uniforms.uRockSnow.value = finiteClamped(options.snow, uniforms.uRockSnow.value);
  if ('detail' in options) uniforms.uRockDetail.value = finiteClamped(options.detail, uniforms.uRockDetail.value);
  if ('contrast' in options) uniforms.uRockContrast.value = finiteClamped(options.contrast, uniforms.uRockContrast.value);
  if ('hue' in options) uniforms.uRockHue.value = finiteClamped(options.hue, uniforms.uRockHue.value, -1, 1);
  if ('noiseScale' in options) uniforms.uRockNoiseScale.value = finiteClamped(options.noiseScale, uniforms.uRockNoiseScale.value, 0.3, 8);
  if ('noiseAmount' in options) uniforms.uRockNoiseAmount.value = finiteClamped(options.noiseAmount, uniforms.uRockNoiseAmount.value);
  if ('normalStrength' in options) uniforms.uRockNormalStrength.value = finiteClamped(options.normalStrength, uniforms.uRockNormalStrength.value);
  if ('materialRoughness' in options) uniforms.uRockRoughness.value = finiteClamped(options.materialRoughness, uniforms.uRockRoughness.value);
  if ('mapView' in options) uniforms.uRockMapView.value = Math.max(0, mapViews.indexOf(options.mapView));
  if ('fractureInterior' in options) uniforms.uRockInterior.value = options.fractureInterior ? 1 : 0;
  if ('tint' in options && (options.tint?.isColor || typeof options.tint === 'number' || /^#[0-9a-f]{6}$/i.test(options.tint))) uniforms.uRockTint.value.set(options.tint);
  if ('tintAmount' in options) uniforms.uRockTintAmount.value = finiteClamped(options.tintAmount, uniforms.uRockTintAmount.value);
  const optical = material.userData.opticalOptions;
  if (OPTICAL_PRESETS[options.surface] && !Object.keys(OPTICAL_DEFAULTS).some(key => key in options)) Object.assign(optical, OPTICAL_PRESETS[options.surface]);
  for (const [key, [min, max]] of Object.entries(OPTICAL_RANGES)) {
    if (key in options) optical[key] = finiteClamped(options[key], optical[key], min, max);
  }
  if (/^#[0-9a-f]{6}$/i.test(options.absorptionColor)) optical.absorptionColor = options.absorptionColor;
  const opticalActive = uniforms.uRockSurface.value >= 7;
  // Native setters handle legitimate 0/positive shader-feature changes. All
  // non-optical surfaces keep the original dielectric defaults and no prepass.
  material.transmission = opticalActive ? optical.transmission : 0;
  material.ior = opticalActive ? optical.ior : 1.5;
  material.thickness = opticalActive ? optical.thickness : 0;
  material.attenuationDistance = optical.attenuationDistance;
  material.attenuationColor.set(optical.absorptionColor);
  material.dispersion = opticalActive && optical.transmission > 0 ? optical.dispersion : 0;
  material.iridescence = opticalActive ? optical.iridescence : 0;
  uniforms.uRockCloudiness.value = optical.cloudiness;
  uniforms.uRockInclusions.value = optical.inclusions;
  uniforms.uRockInclusionScale.value = optical.inclusionScale;
  uniforms.uRockInternalCracks.value = optical.internalCracks;
  return material;
}

export function createRockMaterial(options = {}) {
  const material = new MeshPhysicalMaterial({
    color: 0xffffff,
    vertexColors: true,
    roughness: 0.85,
    metalness: 0,
    transparent: false,
    opacity: 1,
    depthWrite: true,
  });
  material.name = 'Procedural rock / ice surface';
  // Original procedural meshes need no fracture attributes. Constant defaults
  // select the normal object-space path and keep imported cut meshes renderable.
  material.defaultAttributeValues = {
    color: [1, 1, 1], uv: [0, 0], aFaceTone: [0.5], aBevel: [0],
    aRockPosition: [0, 0, 0, 0], aRockOriginalUp: [0], aRockThicknessLimit: [1000000],
  };
  material.userData.rockUniforms = {
    uRockIce: { value: 0 },
    uRockSurface: { value: 0 },
    uRockSnow: { value: 0 },
    uRockDetail: { value: 0.45 },
    uRockContrast: { value: 0.55 },
    uRockHue: { value: 0 },
    uRockNoiseScale: { value: 2 },
    uRockNoiseAmount: { value: 0.45 },
    uRockNormalStrength: { value: 0.3 },
    uRockRoughness: { value: 0.85 },
    uRockMapView: { value: 0 },
    uRockEnvironment: { value: surfaceEnvironmentIntensity[0] },
    uRockInterior: { value: 0 },
    uRockTint: { value: new Color('#ffffff') },
    uRockTintAmount: { value: 0 },
    uRockCloudiness: { value: OPTICAL_DEFAULTS.cloudiness },
    uRockInclusions: { value: OPTICAL_DEFAULTS.inclusions },
    uRockInclusionScale: { value: OPTICAL_DEFAULTS.inclusionScale },
    uRockInternalCracks: { value: OPTICAL_DEFAULTS.internalCracks },
  };
  material.userData.opticalOptions = { ...OPTICAL_DEFAULTS, ...(OPTICAL_PRESETS[options.surface] ?? {}) };
  material.userData.surfaceNotes = 'Procedural object-space color, height-driven normal relief, and roughness. Map views are live diagnostics, not baked export maps. Normal view is world-space. Original ice stays opaque. Glass/quartz/frozenGlass use native scene-color transmission plus six view-depth samples of procedural inclusions, cloudiness and internal cracks. Artist thickness is approximate and bounded on fractured chunks; this is not mesh ray tracing, multiple scattering or glass-to-glass refraction. Snow is surface coverage without added geometry. Relief affects shading, not the silhouette.';
  material.customProgramCacheKey = () => rockMaterialProgramKey;
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, material.userData.rockUniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${vertexDeclarations}`)
      .replace('#include <project_vertex>', /* glsl */`
        #include <project_vertex>
        vRockPosition = mix(transformed, aRockPosition.xyz, aRockPosition.w);
        vRockUV = uv;
        vRockThicknessLimit = aRockThicknessLimit;
        vRockLocalNormal = normalize(objectNormal);
        vRockWorldNormal = inverseTransformDirection(transformedNormal, viewMatrix);
        vRockCoverageSlope = aRockOriginalUp > 0.5 ? aRockOriginalUp - 2.0 : vRockWorldNormal.y;
        vRockFaceTone = aFaceTone;
        vRockBevel = aBevel;
      `);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${fragmentDeclarations}`)
      // Three uses scene.environmentIntensity for scene-provided maps. This
      // material-local multiplier keeps chalk/stone muted and glass reflective
      // without changing the ground or forcing a material envMap assignment.
      .replace('#include <envmap_physical_pars_fragment>', ShaderChunk.envmap_physical_pars_fragment.replaceAll('envMapIntensity', '(envMapIntensity * uRockEnvironment)'))
      .replace('#include <color_fragment>', `#include <color_fragment>\n${surfaceFragment}`)
      .replace('#include <transmission_fragment>', transmissionFragment)
      .replace('#include <roughnessmap_fragment>', /* glsl */`
        #include <roughnessmap_fragment>
        roughnessFactor = rockSurfaceRoughness;
      `)
      .replace('#include <normal_fragment_maps>', /* glsl */`
        #include <normal_fragment_maps>
        normal = rockPerturbNormal(-vViewPosition, normal, rockBumpHeight, faceDirection);
      `)
      .replace('#include <emissivemap_fragment>', /* glsl */`
        #include <emissivemap_fragment>
        totalEmissiveRadiance += uRockIce * (1.0 - rockSnowMask)
          * (vec3(0.003, 0.017, 0.026) + rockIceFissure * vec3(0.006, 0.020, 0.023));
      `)
      .replace('#include <fog_fragment>', /* glsl */`
        #include <fog_fragment>
        // Diagnostics bypass tone mapping, lighting and fog for interpretable
        // channels. This world-space normal is not a tangent-space bake.
        if (uRockMapView > 0.5 && uRockMapView < 1.5) {
          gl_FragColor.rgb = inverseTransformDirection(normal, viewMatrix) * 0.5 + 0.5;
        } else if (uRockMapView > 1.5 && uRockMapView < 2.5) {
          gl_FragColor.rgb = vec3(rockSurfaceHeight);
        } else if (uRockMapView > 2.5) {
          gl_FragColor.rgb = vec3(rockSurfaceRoughness);
        }
      `);
    material.userData.shader = shader;
  };
  material.onBeforeRender = (_renderer, _scene, _camera, geometry) => {
    if (material.transmission <= 0 || !geometry.attributes.aRockPosition || geometry.attributes.aRockThicknessLimit) return;
    // A single cached attribute avoids per-draw custom-uniform upload hacks.
    // Pinata's geometry is already local to each chunk: cap the artist path at
    // its narrowest bound, so a tiny splinter cannot absorb like a whole block.
    geometry.computeBoundingBox();
    const size = geometry.boundingBox.getSize(new Vector3());
    const limit = Math.max(0.015, Math.min(size.x, size.y, size.z) * 0.9);
    geometry.setAttribute('aRockThicknessLimit', new Float32BufferAttribute(new Float32Array(geometry.attributes.position.count).fill(limit), 1));
    geometry.userData.rockOpticalThicknessLimit = limit;
  };
  return updateRockMaterial(material, options);
}
