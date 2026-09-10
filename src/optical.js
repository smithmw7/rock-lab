// These optical settings are retained in recipes even while an opaque surface
// is selected. Only glass/quartz/frozenGlass activate the transmission family.
export const OPTICAL_DEFAULTS = Object.freeze({
  transmission: .98,
  ior: 1.5,
  thickness: 1.1,
  attenuationDistance: 4.5,
  absorptionColor: '#e9fff7',
  dispersion: .12,
  iridescence: 0,
  cloudiness: .03,
  inclusions: .06,
  inclusionScale: 2.5,
  internalCracks: 0,
});

export const OPTICAL_PRESETS = Object.freeze({
  glass: Object.freeze({ ...OPTICAL_DEFAULTS }),
  quartz: Object.freeze({
    transmission: .92, ior: 1.54, thickness: 1.8, attenuationDistance: 2.4,
    absorptionColor: '#d5bcf0', dispersion: .35, iridescence: .16,
    cloudiness: .2, inclusions: .36, inclusionScale: 2.8, internalCracks: .35,
  }),
  frozenGlass: Object.freeze({
    transmission: .95, ior: 1.31, thickness: 1.4, attenuationDistance: 2.2,
    absorptionColor: '#83dff5', dispersion: .06, iridescence: 0,
    cloudiness: .25, inclusions: .28, inclusionScale: 2.2, internalCracks: .55,
  }),
});

export const OPTICAL_RANGES = Object.freeze({
  transmission: [0, 1], ior: [1, 2.333], thickness: [0, 4],
  attenuationDistance: [.1, 10], dispersion: [0, 1], iridescence: [0, 1],
  cloudiness: [0, 1], inclusions: [0, 1], inclusionScale: [.5, 8], internalCracks: [0, 1],
});
