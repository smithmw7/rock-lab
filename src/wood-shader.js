// Stylized solid wood: warped growth rings plus sparse, seeded local features.
// See WOOD-MATERIALS.md for sources and the distinction between this artistic
// spiral construction and physically modelled wood. All channels reuse these
// fields; screen derivatives provide relief without extra texture samples.
export const woodUniforms = /* glsl */`
uniform float uWoodSeed;
uniform float uWorkshopWoodVariation;
uniform float uWorkshopWoodSpiral;
uniform float uWorkshopWoodCracks;
uniform float uWorkshopWoodBark;
uniform float uWorkshopWoodRelief;
`;

export const woodFunctions = /* glsl */`
float woodSegment(vec2 p, vec2 a, vec2 b) {
  vec2 ab = b - a;
  return length(p - a - ab * clamp(dot(p - a, ab) / max(dot(ab, ab), 0.00001), 0.0, 1.0));
}
float woodLine(float phase, float width) {
  float aa = max(fwidth(phase), 0.003);
  float wave = 0.5 + 0.5 * cos(phase);
  return smoothstep(1.0 - width - aa * 0.11, 1.0 - width * 0.22, wave)
    * (1.0 - smoothstep(1.2, 3.6, aa));
}

// Each tile contains an independently positioned elliptical knot and tapered
// split. The 3x3 neighborhood and compact masks remove tile-boundary popping.
// Output: long-grain bend, knot contours, knot coverage, dark knot core.
vec4 woodFeatures(vec2 p, float seed, out vec3 splits) {
  vec2 q = p * vec2(1.05, 0.42) + vec2(0.5, 0.37);
  q.x += (rockNoise(vec3(p * vec2(0.9, 0.5), seed)) - 0.5) * 0.22 * uWorkshopWoodVariation;
  vec2 footprint = fwidth(q);
  vec2 cell = floor(q);
  vec4 result = vec4(0.0);
  splits = vec3(0.0);
  vec2 nearest = vec2(10.0);
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 id = cell + vec2(float(x), float(y));
      float h = rockHash(vec3(id, seed));
      float h2 = rockHash(vec3(id + 17.31, seed + 8.7));
      float h3 = rockHash(vec3(id - 4.19, seed + 21.4));
      vec2 d = q - (id + vec2(0.22 + h * 0.56, 0.2 + h2 * 0.6));
      float distanceToCell = length(d);
      if (distanceToCell < nearest.x) { nearest.y = nearest.x; nearest.x = distanceToCell; }
      else nearest.y = min(nearest.y, distanceToCell);
      vec2 e = d / vec2(0.19 + h3 * 0.09, 0.25 + h * 0.10);
      // Asymmetric shoulders avoid identical oval stamps.
      e.x += sin(e.y * 1.4 + h * 6.28) * 0.12 * uWorkshopWoodVariation;
      float r = length(e);
      float mask = (1.0 - smoothstep(0.55, 1.75, r))
        * (0.45 + 0.55 * smoothstep(0.16, 0.42, h2)) * uWorkshopWoodKnots;
      float theta = atan(e.y, e.x + 0.00001);
      float ring = woodLine(r * (9.0 + h3 * 4.0), 0.19);
      // Mix periodic fields, never a fractional multiple of atan: the spiral
      // remains continuous across the angular branch cut at +/- pi.
      float spiral = woodLine(r * (9.0 + h3 * 4.0) - theta * (h < 0.5 ? 1.0 : -1.0), 0.21);
      result.x += e.x * exp(-r * r * 0.6) * mask * 5.5;
      result.y += mix(ring, spiral, uWorkshopWoodSpiral) * mask;
      result.z += mask;
      result.w += (1.0 - smoothstep(0.10, 0.32, r)) * mask;

      // A long tapered split with a shorter angled branch. Width and length
      // vary by cell; the light lip is separate from the deep incision.
      vec2 c = q - (id + vec2(0.12 + h2 * 0.76, 0.15 + h3 * 0.70));
      float halfLength = 0.13 + h * 0.23;
      float taper = max(0.0, 1.0 - abs(c.y) / halfLength);
      float bend = (h3 - 0.5) * 0.16;
      vec2 junction = vec2(bend * 0.25, -halfLength * 0.12);
      float distanceToSplit = min(woodSegment(c, vec2(-bend, -halfLength), junction), woodSegment(c, junction, vec2(bend, halfLength)));
      vec2 branchEnd = junction + vec2((h < 0.5 ? -1.0 : 1.0) * (0.08 + h3 * 0.08), halfLength * 0.45);
      float distanceToBranch = woodSegment(c, junction, branchEnd);
      float aa = max(footprint.x + footprint.y * 0.3, 0.001);
      float width = (0.018 + h3 * 0.028) * (0.4 + uWorkshopWoodCracks) * sqrt(taper);
      float cut = (1.0 - smoothstep(width * 0.35, width + aa, distanceToSplit)) * smoothstep(0.0, 0.12, taper);
      cut = max(cut, (1.0 - smoothstep(width * 0.2, width * 0.6 + aa, distanceToBranch)) * smoothstep(0.0, 0.18, taper) * 0.85);
      float lip = (1.0 - smoothstep(width + aa, width * 2.0 + aa, distanceToSplit)) * smoothstep(0.0, 0.12, taper);
      float exists = smoothstep(0.20, 0.50, h);
      splits.xy = max(splits.xy, vec2(cut, max(0.0, lip - cut)) * exists * uWorkshopWoodCracks);
    }
  }
  splits.z = nearest.y - nearest.x;
  return clamp(result, vec4(-8.0, 0.0, 0.0, 0.0), vec4(8.0, 1.0, 0.95, 1.0));
}
`;

export const woodSurface = /* glsl */`
  // Fracture's inner material deliberately uses its generated planar UVs.
  // Map those to a cross-section, retaining the tool's texture scale/offset.
  vec3 woodLocalP = mix(vWoodPosition, vec3(vRockUV.x, 0.0, vRockUV.y), uRockInterior);
  vec3 woodP = woodLocalP * (uRockNoiseScale * 0.5) * uWorkshopWoodGrainScale;
  vec3 grainNormalRaw = cross(dFdx(woodLocalP), dFdy(woodLocalP));
  vec3 grainNormal = grainNormalRaw / max(length(grainNormalRaw), 0.000001);
  float endGrain = max(uRockInterior, smoothstep(0.52, 0.89, abs(grainNormal.y)));
  float seed = uWoodSeed * 0.00137;
  vec3 seedOffset = vec3(rockHash(vec3(seed, 1.7, 8.2)), rockHash(vec3(9.2, seed, 3.6)), rockHash(vec3(7.8, 2.1, seed))) * 19.0;
  vec3 longP = woodP * vec3(0.8, 0.19, 0.8) + seedOffset;
  vec2 broadWarp = vec2(rockNoise(longP), rockNoise(longP + vec3(8.9, 3.2, 1.6))) - 0.5;
  vec2 fineWarp = vec2(rockNoise(longP * 2.7 + 2.4), rockNoise(longP * 2.3 + 9.7)) - 0.5;
  vec2 pith = (seedOffset.xz / 19.0 - 0.5) * 0.24;
  vec2 growth = woodP.xz - pith + (broadWarp * 0.85 + fineWarp * 0.15) * uWorkshopWoodVariation;
  float radius = length(growth);
  float radialWarp = rockNoise(vec3(radius * 2.2, seed, 6.1)) - 0.5;
  float phase = radius * 23.0 + radialWarp * 4.2 * uWorkshopWoodVariation;
  phase += (rockNoise(longP * vec3(3.0, 1.1, 3.0)) - 0.5) * uWorkshopWoodVariation * 2.3;

  vec3 splitX, splitZ;
  vec4 knotsX = woodFeatures(woodP.xy, seed, splitX);
  vec4 knotsZ = woodFeatures(woodP.zy, seed + 15.3, splitZ);
  vec2 weights = pow(abs(grainNormal.zx), vec2(4.0));
  weights /= max(weights.x + weights.y, 0.0001);
  vec4 knots = knotsX * weights.x + knotsZ * weights.y;
  vec3 splits = (splitX * weights.x + splitZ * weights.y);
  splits.xy *= (1.0 - endGrain);
  float longPhase = phase + knots.x * (1.0 - endGrain);
  float growthLine = woodLine(longPhase, 0.13 + rockNoise(longP + 18.2) * 0.12);
  float theta = atan(growth.y, growth.x + 0.00001);
  float endSpiral = woodLine(phase - theta, 0.20);
  growthLine = mix(growthLine, endSpiral, endGrain * uWorkshopWoodSpiral);
  float darkRing = growthLine * (1.0 - knots.z * (1.0 - endGrain)) + knots.y * (1.0 - endGrain);
  float ringWave = 0.5 + 0.5 * sin(longPhase + 0.8);
  float fibers = rockFilteredNoise(woodP * vec3(29.0, 0.70, 27.0) + seedOffset);
  float broadTone = rockNoise(longP * vec3(1.4, 0.75, 1.4) + 23.7);

  // Bark follows the length of the trunk. Integer angular frequencies join
  // around its circumference; broken transverse channels interrupt the ribs.
  float barkPhase = theta * 12.0 + broadWarp.x * 12.0 + (rockNoise(longP * vec3(3.0, 2.0, 3.0)) - 0.5) * 7.0;
  float barkRidge = pow(0.5 + 0.5 * sin(barkPhase), 0.65) * 0.45 + smoothstep(0.01, 0.28, splits.z) * 0.55;
  float plateAA = max(fwidth(splits.z), 0.001);
  float plateSeam = 1.0 - smoothstep(0.012, 0.070 + plateAA, splits.z);
  float barkGroove = max(woodLine(barkPhase + 1.57, 0.18) * 0.5, plateSeam);
  float barkBreak = woodLine(woodP.y * 5.0 + rockNoise(vec3(growth * 2.0, seed)) * 12.0, 0.10)
    * smoothstep(0.48, 0.68, rockNoise(longP * 3.1 + 7.3));
  float bark = uWorkshopWoodBark * (1.0 - endGrain) * vWoodBarkMask;
  float grainAmount = uWorkshopWoodGrainStrength * clamp(uRockNoiseAmount * 2.0, 0.0, 1.0) * mix(0.75, 1.0, uRockDetail);
  vec3 woodLight = vec3(0.57, 0.29, 0.085);
  vec3 woodDark = vec3(0.19, 0.065, 0.016);
  vec3 edgeWood = vec3(0.13, 0.08, 0.029);
  if (uRockSurface > 18.5 && uRockSurface < 19.5) {
    woodLight = vec3(0.18, 0.07, 0.022); woodDark = vec3(0.048, 0.015, 0.007); edgeWood = vec3(0.055, 0.025, 0.012);
  } else if (uRockSurface > 19.5) {
    woodLight = vec3(0.26, 0.23, 0.19); woodDark = vec3(0.088, 0.069, 0.050); edgeWood = vec3(0.07, 0.061, 0.040);
  }
  float tone = clamp(darkRing * 0.92 + ringWave * 0.14 + knots.w * 0.65 * (1.0 - endGrain), 0.0, 1.0);
  rockSurface = mix(woodLight, woodDark, tone * grainAmount);
  rockSurface *= 1.0 + (broadTone - 0.5) * uWorkshopWoodVariation * 0.52 + rockFace * 0.45;
  rockSurface *= 1.0 + (fibers - 0.5) * 0.42 * grainAmount * (1.0 - endGrain);
  vec3 barkColor = mix(woodDark * 0.62, woodLight * 0.58, barkRidge * 0.85 + broadTone * 0.15);
  barkColor *= 1.0 - barkGroove * 0.62 - barkBreak * 0.30;
  rockSurface = mix(rockSurface, barkColor, bark);
  rockSurface *= 1.0 - splits.x * 0.83;
  rockSurface += edgeWood * (splits.y * 0.7 + vRockBevel * (0.65 + rockLightFacing * 0.35));
  rockSurface *= mix(vec3(0.79, 0.93, 1.12), vec3(1.13, 1.025, 0.79), uWorkshopWoodWarmth);
  rockSurface *= mix(vec3(0.88, 0.97, 1.08), vec3(1.08, 1.0, 0.87), clamp(0.5 + uRockHue * 0.5, 0.0, 1.0));
  float grainHeight = ((fibers - 0.5) * 0.13 - darkRing * 0.36 - knots.w * 0.22) * uWorkshopWoodGrainStrength;
  float barkHeight = barkRidge * 0.55 - barkGroove * 0.4 - barkBreak * 0.24;
  rockHeightField = 0.5 + mix(grainHeight, barkHeight, bark) - splits.x * 0.28 + splits.y * 0.08;
  rockReliefDepth = mix(0.0, 0.065, uWorkshopWoodRelief);
  rockRoughnessVariation = darkRing * grainAmount * 0.14 + splits.x * 0.26 + bark * (0.15 + barkGroove * 0.17);
`;
