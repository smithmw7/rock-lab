/** Shared floor metadata. Presets choose a starting point; recipes retain edits. */
export const GROUND_PRESETS = Object.freeze([
  { key: 'studio', label: 'Studio', description: 'A quiet neutral surface with a soft reflection.', wetness: .35, reflection: .35, scale: 1 },
  { key: 'asphalt', label: 'Wet asphalt', description: 'Dark aggregate, uneven wet patches, and adjustable rain ripples.', wetness: .85, reflection: .7, scale: 1 },
  { key: 'sand', label: 'Sand', description: 'Warm fine sand with shallow wind-carved ripples.', wetness: 0, reflection: 0, scale: 1 },
  { key: 'slate', label: 'Slate flagstone', description: 'Irregular blue-gray stones, cleft layers, and narrow recessed joints.', wetness: .18, reflection: .2, scale: 1 },
  { key: 'travertine', label: 'Warm travertine', description: 'Honed limestone tiles with warm bands, small pores, and softened edges.', wetness: .16, reflection: .24, scale: 1 },
  { key: 'terrazzo', label: 'Ivory terrazzo', description: 'An ivory matrix with flush stone chips in charcoal, clay, and muted green.', wetness: .22, reflection: .32, scale: 1 },
  { key: 'hexTile', label: 'Basalt hex tiles', description: 'Dark hexagonal tiles with satin faces and fine, pale grout.', wetness: .2, reflection: .3, scale: 1 },
  { key: 'earth', label: 'Packed earth', description: 'Compacted brown soil with scattered grit and sparse drying cracks.', wetness: .08, reflection: .04, scale: 1 },
  { key: 'meadow', label: 'Meadow grass', description: 'Lush green tufts with curved blades and patches of lighter growth.', wetness: .12, reflection: .04, scale: 1 },
  { key: 'dryGrass', label: 'Dry grass', description: 'Olive and golden straw tufts with sparse, sun-dried soil patches.', wetness: 0, reflection: .02, scale: 1 },
  { key: 'forestDirt', label: 'Forest dirt', description: 'Rich brown soil with soft clumps, leaf litter, and fine roots.', wetness: .18, reflection: .08, scale: 1 },
  { key: 'rockySoil', label: 'Rocky soil', description: 'Weathered stones and broken gravel scattered through warm earth.', wetness: .08, reflection: .06, scale: 1 },
].map(preset => Object.freeze(preset)));

export const GROUND_TYPES = Object.freeze(Object.fromEntries(GROUND_PRESETS.map(preset => [preset.key, preset])));

/** Older recipes keep their edited values while adopting a replacement floor. */
export function normalizeGroundId(value, fallback = 'studio') {
  const migrated = value === 'concrete' ? 'travertine' : value === 'wood' ? 'slate' : value;
  return Object.hasOwn(GROUND_TYPES, migrated) ? migrated : Object.hasOwn(GROUND_TYPES, fallback) ? fallback : 'studio';
}
