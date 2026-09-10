import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';

export const GROUND_TYPES = Object.freeze({
  studio: { label: 'Simple studio', description: 'A clean neutral sweep with a soft reflection.' },
  asphalt: { label: 'Wet asphalt', description: 'Dark aggregate, irregular puddles, and reflective wet patches.' },
  concrete: { label: 'Concrete', description: 'Mottled concrete slabs with recessed expansion joints.' },
  sand: { label: 'Sand', description: 'Warm sand with wind-carved ripples and fine grain.' },
  wood: { label: 'Wooden planks', description: 'Staggered timber boards, recessed seams, and flowing grain.' },
});

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
    vec2 slab = p / 2.4;
    vec2 edge = min(fract(slab), 1.0 - fract(slab)) * 2.4;
    float joint = 1.0 - smoothstep(.009, .023, min(edge.x, edge.y));
    float board = groundHash(floor(slab));
    float fleck = groundNoise(p * 20.0);
    tint = mix(vec3(.20, .215, .225), vec3(.35, .35, .325), broad);
    tint *= .89 + board * .15 + (grain - .5) * .06;
    tint *= 1.0 - joint * .54;
    tint *= mix(1.0, .78, wet);
    height = .007 * fleck + .002 * grain - joint * .019;
    rough = mix(.94, .35, wet * (.65 + broad * .35));
    reflectivity = mix(.035, .65, wet);
  } else if (uGroundType > 2.5 && uGroundType < 3.5) {
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
  } else if (uGroundType > 3.5) {
    float row = floor(p.x / .39);
    vec2 boardUV = vec2(p.x / .39, (p.y + mod(row, 2.0) * 1.34) / 2.68);
    vec2 boardID = floor(boardUV);
    vec2 f = fract(boardUV);
    vec2 edge = min(f, 1.0 - f) * vec2(.39, 2.68);
    float gap = 1.0 - smoothstep(.004, .014, min(edge.x, edge.y));
    float board = groundHash(boardID + 7.0);
    float flow = groundNoise(vec2(p.x * 7.0 + board * 14.0, p.y * .5));
    float veins = sin(p.x * 155.0 + flow * 15.0 + board * 18.0) * .5 + .5;
    veins = mix(veins, .5, smoothstep(.9, 2.2, length(fwidth(p * vec2(155.0, 1.0)))));
    float longGrain = groundFbm(p * vec2(38.0, 1.2) + board * 8.0);
    tint = mix(vec3(.10, .052, .023), vec3(.32, .19, .088), board * .6 + longGrain * .4);
    tint *= .82 + veins * .19 + broad * .20;
    tint = mix(tint, vec3(.022, .015, .009), gap);
    height = (veins * .002 + longGrain * .004) * (1.0 - gap) - gap * .025;
    rough = mix(.83, .27, wet) + gap * .13;
    reflectivity = mix(.09, .78, wet) * (1.0 - gap * .93);
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
  material.customProgramCacheKey = () => 'rock-lab-ground-pbr-planar-asphalt-v2';

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
    if (Object.hasOwn(GROUND_TYPES, next.ground)) state.ground = next.ground;
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
