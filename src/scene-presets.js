import { defaults, surfaces } from './catalog.js';
import { WORKSHOP_MATERIAL_DEFAULTS } from './workshop-materials.js';
import { OPTICAL_DEFAULTS, OPTICAL_PRESETS } from './optical.js';

// Authored compositions, not randomized scatter. Positions were grounded on
// generated terrain/table crowns, including the rotated tools' actual bounds.
// Recipes retain separate material roles and every object remains editable.
export const SCENE_PRESETS = Object.freeze([
  {
    "id": "alpine-crossing",
    "title": "Alpine crossing",
    "description": "A stone bridge links snow-dusted banks, a lookout ledge, and a cold crystal outcrop.",
    "category": "Landscape",
    "accent": "#b9d9ea",
    "thumbnail": "scene-gallery/alpine-crossing.webp",
    "objectCount": 14
  },
  {
    "id": "redrock-canyon",
    "title": "Redrock canyon",
    "description": "Layered red cliffs shelter a sandstone gateway and a winding trail of worn stepping stones.",
    "category": "Landscape",
    "accent": "#db8054",
    "thumbnail": "scene-gallery/redrock-canyon.webp",
    "objectCount": 14
  },
  {
    "id": "coastal-ruins",
    "title": "Coastal ruins",
    "description": "Pale masonry rises above a weathered shoreline with a broken colonnade and turquoise relics.",
    "category": "Ruins",
    "accent": "#a2cbc9",
    "thumbnail": "scene-gallery/coastal-ruins.webp",
    "objectCount": 14
  },
  {
    "id": "crystal-hollow",
    "title": "Crystal hollow",
    "description": "Translucent quartz and glacier points grow around a dark stepped stone hollow.",
    "category": "Landscape",
    "accent": "#bfa8e9",
    "thumbnail": "scene-gallery/crystal-hollow.webp",
    "objectCount": 13
  },
  {
    "id": "basalt-forge",
    "title": "Basalt forge",
    "description": "A volcanic workshop with a raised anvil, timber tool bench, and warm forged metal.",
    "category": "Workshop",
    "accent": "#e2a26e",
    "thumbnail": "scene-gallery/basalt-forge.webp",
    "objectCount": 14
  },
  {
    "id": "quarry-yard",
    "title": "Quarry yard",
    "description": "Cut blocks, unfinished columns, and a loading ramp arranged on a broad working shelf.",
    "category": "Workshop",
    "accent": "#b9b5ac",
    "thumbnail": "scene-gallery/quarry-yard.webp",
    "objectCount": 14
  },
  {
    "id": "artisan-terrace",
    "title": "Artisan terrace",
    "description": "A warm pottery studio with a working table, finished glazes, and a raised display platform.",
    "category": "Workshop",
    "accent": "#d5ad77",
    "thumbnail": "scene-gallery/artisan-terrace.webp",
    "objectCount": 15
  },
  {
    "id": "garden-courtyard",
    "title": "Garden courtyard",
    "description": "A quiet stepped courtyard with a pale garden arch, celadon vessels, and honey-colored seating.",
    "category": "Architecture",
    "accent": "#a8c3a1",
    "thumbnail": "scene-gallery/garden-courtyard.webp",
    "objectCount": 15
  }
].map(Object.freeze));

function materialState(surface, options = {}) {
  return { ...WORKSHOP_MATERIAL_DEFAULTS, ...OPTICAL_DEFAULTS, ...OPTICAL_PRESETS[surface], ...surfaces[surface].defaults,
    surface, materialRoughness: surfaces[surface].roughness, noiseScale: 2, noiseAmount: .4,
    normalStrength: .23, detail: .46, contrast: .5, snow: 0, tint: '#ffffff', tintAmount: 0, ...options };
}
function object(id, name, shape, surface, seed, position, rotation, scale, overrides = {}, handleSurface = null) {
  const material = materialState(surface, overrides);
  const recipe = { generator: 'procedural-rock-lab', version: 5,
    options: { ...defaults, ...material, shape, seed, facets: .35, roughness: .12, bevel: .36,
      displacement: 0, geometryNoiseScale: 2, latheSegments: 24, ...overrides },
    innerMaterial: { ...material, snow: 0 } };
  if (handleSurface) recipe.partMaterials = Object.fromEntries(['handle', 'trim'].map(slot => {
    const state = materialState(slot === 'handle' ? handleSurface : 'brass');
    return [slot, { outer: { ...state }, inner: { ...state } }];
  }));
  return { id, name, recipe, position, rotation, scale };
}

const SCENES = {
  'alpine-crossing': {
    environment: {"lighting":"alpine","ground":"studio","reflection":0.24,"groundWetness":0.25,"groundScale":1},
    objects: [
      object("alpine-crossing-west", "West bank", "roundPlatform", "stone", 34001, [-2.9,0,0], [0,0,0], [1.6,1.05,2], {"cloudiness":0.03,"inclusions":0.06,"absorptionColor":"#e9fff7","attenuationDistance":4.5,"metalWear":0.15,"woodGrainStrength":0.65}),
      object("alpine-crossing-east", "East bank", "roundPlatform", "stone", 34072, [2.9,0,0], [0,0,0], [1.6,1.05,2], {"cloudiness":0.03,"inclusions":0.06,"absorptionColor":"#e9fff7","attenuationDistance":4.5,"metalWear":0.15,"woodGrainStrength":0.65}),
      object("alpine-crossing-crossing", "Arched crossing", "bridge", "limestone", 34143, [0,0.5775,0.15], [0,0,0], [1,0.72,0.65], {"cloudiness":0.03,"inclusions":0.06,"absorptionColor":"#e9fff7","attenuationDistance":4.5,"metalWear":0.15,"woodGrainStrength":0.65}),
      object("alpine-crossing-backdrop", "Snow ridge", "cliffFace", "stone", 34214, [-3.05,0.5775,-1.75], [0,-7,0], [0.88,0.92,0.6], {"snow":0.3,"cloudiness":0.03,"inclusions":0.06,"absorptionColor":"#e9fff7","attenuationDistance":4.5,"metalWear":0.15,"woodGrainStrength":0.65}),
      object("alpine-crossing-lookout", "Lookout ledge", "hexPlatform", "stone", 34285, [3.15,0.5775,-1.35], [0,0,0], [0.78,0.78,0.82], {"cloudiness":0.03,"inclusions":0.06,"absorptionColor":"#e9fff7","attenuationDistance":4.5,"metalWear":0.15,"woodGrainStrength":0.65}),
      object("alpine-crossing-marker", "Summit cairn", "cairn", "stone", 34356, [3.2,1.00451,-1.35], [0,15,0], [0.31,0.31,0.31], {"snow":0.32,"cloudiness":0.03,"inclusions":0.06,"absorptionColor":"#e9fff7","attenuationDistance":4.5,"metalWear":0.15,"woodGrainStrength":0.65}),
      object("alpine-crossing-spire", "Split alpine needle", "splitRockPillar", "stone", 34427, [4,0.5775,0.15], [0,-20,0], [0.45,0.75,0.5], {"snow":0.3,"cloudiness":0.03,"inclusions":0.06,"absorptionColor":"#e9fff7","attenuationDistance":4.5,"metalWear":0.15,"woodGrainStrength":0.65}),
      object("alpine-crossing-ice", "Ice outcrop", "crystals", "frozenGlass", 34498, [2.2,0.5775,1.25], [0,-20,0], [0.48,0.48,0.48], {"cloudiness":0.3,"inclusions":0.3,"absorptionColor":"#83dff5","attenuationDistance":2.2,"metalWear":0.15,"woodGrainStrength":0.65}),
      object("alpine-crossing-boulder", "Snow boulder", "boulder", "stone", 34569, [-4,0.574603,0.25], [0,28,0], [0.5,0.5,0.5], {"snow":0.44,"cloudiness":0.03,"inclusions":0.06,"absorptionColor":"#e9fff7","attenuationDistance":4.5,"metalWear":0.15,"woodGrainStrength":0.65}),
      object("alpine-crossing-trail-1", "Trail stone one", "slab", "stone", 34640, [-2.25,0.577211,0.75], [0,-15,0], [0.2,0.3,0.18], {"cloudiness":0.03,"inclusions":0.06,"absorptionColor":"#e9fff7","attenuationDistance":4.5,"metalWear":0.15,"woodGrainStrength":0.65}),
      object("alpine-crossing-trail-2", "Trail stone two", "slab", "stone", 34711, [-2.65,0.575958,1.55], [0,12,0], [0.19,0.3,0.18], {"cloudiness":0.03,"inclusions":0.06,"absorptionColor":"#e9fff7","attenuationDistance":4.5,"metalWear":0.15,"woodGrainStrength":0.65}),
      object("alpine-crossing-trail-3", "Trail stone three", "slab", "stone", 34782, [-3,0.574638,2.2], [0,-8,0], [0.19,0.3,0.17], {"cloudiness":0.03,"inclusions":0.06,"absorptionColor":"#e9fff7","attenuationDistance":4.5,"metalWear":0.15,"woodGrainStrength":0.65}),
      object("alpine-crossing-boulder-2", "Frosted bank stone", "boulder", "stone", 34853, [3.35,0.5775,1.55], [0,-35,0], [0.32,0.32,0.32], {"snow":0.38,"cloudiness":0.03,"inclusions":0.06,"absorptionColor":"#e9fff7","attenuationDistance":4.5,"metalWear":0.15,"woodGrainStrength":0.65}),
      object("alpine-crossing-crystal-small", "Ice splinters", "crystals", "ice", 34924, [1.65,0.5775,-0.9], [0,45,0], [0.22,0.22,0.22], {"snow":0.15,"cloudiness":0.03,"inclusions":0.06,"absorptionColor":"#e9fff7","attenuationDistance":4.5,"metalWear":0.15,"woodGrainStrength":0.65}),
    ],
  },
  'redrock-canyon': {
    environment: {"lighting":"sunset","ground":"sand","reflection":0,"groundWetness":0,"groundScale":1},
    objects: [
      object("redrock-canyon-base", "Canyon floor", "ovalPlatform", "desert", 35092, [0,0,0], [0,0,0], [3,0.6,3.4], {"cloudiness":0.03,"inclusions":0.06,"absorptionColor":"#e9fff7","attenuationDistance":4.5,"metalWear":0.15,"woodGrainStrength":0.65}),
      object("redrock-canyon-left-cliff", "Layered canyon wall", "terracedCliff", "desert", 35163, [-2.75,0.33,-1.15], [0,-12,0], [0.8,1.15,0.85], {"noiseAmount":0.6,"cloudiness":0.03,"inclusions":0.06,"absorptionColor":"#e9fff7","attenuationDistance":4.5,"metalWear":0.15,"woodGrainStrength":0.65}),
      object("redrock-canyon-needle", "Redrock needle", "taperedRockPillar", "desert", 35234, [2.55,0.33,-1.4], [0,15,0], [0.75,1.18,0.7], {"cloudiness":0.03,"inclusions":0.06,"absorptionColor":"#e9fff7","attenuationDistance":4.5,"metalWear":0.15,"woodGrainStrength":0.65}),
      object("redrock-canyon-split", "Split sandstone tower", "splitRockPillar", "desert", 35305, [0.85,0.33,-1.55], [0,-20,0], [0.5,0.72,0.55], {"cloudiness":0.03,"inclusions":0.06,"absorptionColor":"#e9fff7","attenuationDistance":4.5,"metalWear":0.15,"woodGrainStrength":0.65}),
      object("redrock-canyon-gate", "Weathered canyon arch", "arch", "desert", 35376, [0.55,0.33,0.45], [0,15,0], [0.61,0.61,0.61], {"cloudiness":0.03,"inclusions":0.06,"absorptionColor":"#e9fff7","attenuationDistance":4.5,"metalWear":0.15,"woodGrainStrength":0.65}),
      object("redrock-canyon-ledge", "Raised trail terrace", "hexPlatform", "desert", 35447, [-2.55,0.33,1.2], [0,0,0], [0.83,0.75,0.66], {"cloudiness":0.03,"inclusions":0.06,"absorptionColor":"#e9fff7","attenuationDistance":4.5,"metalWear":0.15,"woodGrainStrength":0.65}),
      object("redrock-canyon-marker", "Trail cairn", "cairn", "limestone", 35518, [-2.65,0.740502,1.2], [0,-10,0], [0.28,0.28,0.28], {"cloudiness":0.03,"inclusions":0.06,"absorptionColor":"#e9fff7","attenuationDistance":4.5,"metalWear":0.15,"woodGrainStrength":0.65}),
      object("redrock-canyon-rock-east", "Eastern fallen rock", "boulder", "desert", 35589, [3.2,0.33,0.7], [0,20,0], [0.5,0.5,0.5], {"cloudiness":0.03,"inclusions":0.06,"absorptionColor":"#e9fff7","attenuationDistance":4.5,"metalWear":0.15,"woodGrainStrength":0.65}),
      object("redrock-canyon-rock-front", "Front sandstone chip", "boulder", "desert", 35660, [1.9,0.33,2.1], [0,-24,0], [0.23,0.23,0.23], {"cloudiness":0.03,"inclusions":0.06,"absorptionColor":"#e9fff7","attenuationDistance":4.5,"metalWear":0.15,"woodGrainStrength":0.65}),
      object("redrock-canyon-step-1", "Desert trail one", "slab", "limestone", 35731, [-1.1,0.33,2.05], [0,15,0], [0.2,0.3,0.18], {"cloudiness":0.03,"inclusions":0.06,"absorptionColor":"#e9fff7","attenuationDistance":4.5,"metalWear":0.15,"woodGrainStrength":0.65}),
      object("redrock-canyon-step-2", "Desert trail two", "slab", "limestone", 35802, [-0.1,0.33,2.05], [0,-20,0], [0.19,0.3,0.18], {"cloudiness":0.03,"inclusions":0.06,"absorptionColor":"#e9fff7","attenuationDistance":4.5,"metalWear":0.15,"woodGrainStrength":0.65}),
      object("redrock-canyon-step-3", "Desert trail three", "slab", "limestone", 35873, [0.85,0.33,2.15], [0,5,0], [0.18,0.3,0.17], {"cloudiness":0.03,"inclusions":0.06,"absorptionColor":"#e9fff7","attenuationDistance":4.5,"metalWear":0.15,"woodGrainStrength":0.65}),
      object("redrock-canyon-pot", "Abandoned water jar", "jar", "terracotta", 35944, [-3.8,0.33,0.45], [0,-15,0], [0.25,0.25,0.25], {"cloudiness":0.03,"inclusions":0.06,"absorptionColor":"#e9fff7","attenuationDistance":4.5,"metalWear":0.15,"woodGrainStrength":0.65}),
      object("redrock-canyon-low-rock", "Eroded canyon pebble", "boulder", "desert", 36015, [4,0.328414,-1.15], [0,42,0], [0.19,0.19,0.19], {"cloudiness":0.03,"inclusions":0.06,"absorptionColor":"#e9fff7","attenuationDistance":4.5,"metalWear":0.15,"woodGrainStrength":0.65}),
    ],
  },
  'coastal-ruins': {
    environment: {"lighting":"soft","ground":"sand","reflection":0.16,"groundWetness":0.45,"groundScale":1},
    objects: [
      object("coastal-ruins-base", "Coastal shelf", "ovalPlatform", "limestone", 36183, [0,0,0], [0,0,0], [2.9,0.7,3.2], {"cloudiness":0.03,"inclusions":0.06,"absorptionColor":"#e9fff7","attenuationDistance":4.5,"metalWear":0.15,"woodGrainStrength":0.65}),
      object("coastal-ruins-terrace", "Upper temple terrace", "platform", "limestone", 36254, [-0.85,0.384299,-0.8], [0,0,0], [1.38,2.15,0.86], {"cloudiness":0.03,"inclusions":0.06,"absorptionColor":"#e9fff7","attenuationDistance":4.5,"metalWear":0.15,"woodGrainStrength":0.65,"roughness":0.07}),
      object("coastal-ruins-arch", "Temple doorway", "roundArch", "limestone", 36325, [-0.85,0.900299,-1.3], [0,0,0], [0.72,0.93,0.7], {"cloudiness":0.03,"inclusions":0.06,"absorptionColor":"#e9fff7","attenuationDistance":4.5,"metalWear":0.15,"woodGrainStrength":0.65}),
      object("coastal-ruins-column-left", "Western temple column", "roundColumn", "limestone", 36396, [-2.45,0.900299,-0.85], [0,0,0], [0.46,0.46,0.46], {"cloudiness":0.03,"inclusions":0.06,"absorptionColor":"#e9fff7","attenuationDistance":4.5,"metalWear":0.15,"woodGrainStrength":0.65}),
      object("coastal-ruins-column-right", "Broken temple column", "brokenColumn", "limestone", 36467, [0.8,0.900299,-0.65], [0,22,0], [0.46,0.46,0.46], {"cloudiness":0.03,"inclusions":0.06,"absorptionColor":"#e9fff7","attenuationDistance":4.5,"metalWear":0.15,"woodGrainStrength":0.65}),
      object("coastal-ruins-stairs", "Temple approach", "stairs", "limestone", 36538, [-0.8,0.384537,0.92], [0,0,0], [0.47,0.19,0.37], {"cloudiness":0.03,"inclusions":0.06,"absorptionColor":"#e9fff7","attenuationDistance":4.5,"metalWear":0.15,"woodGrainStrength":0.65}),
      object("coastal-ruins-rock-wall", "Shoreline outcrop", "cliffFace", "stone", 36609, [2.65,0.385,-1.15], [0,-25,0], [0.54,0.54,0.48], {"cloudiness":0.03,"inclusions":0.06,"absorptionColor":"#e9fff7","attenuationDistance":4.5,"metalWear":0.15,"woodGrainStrength":0.65}),
      object("coastal-ruins-relic", "Turquoise votive urn", "urn", "celadon", 36680, [-0.7,0.900299,-0.9], [0,0,0], [0.2,0.2,0.2], {"cloudiness":0.03,"inclusions":0.06,"absorptionColor":"#e9fff7","attenuationDistance":4.5,"metalWear":0.15,"woodGrainStrength":0.65}),
      object("coastal-ruins-fallen", "Fallen column drum", "cylinder", "limestone", 36751, [2.35,0.769318,0.5], [90,0,25], [0.28,0.45,0.28], {"cloudiness":0.03,"inclusions":0.06,"absorptionColor":"#e9fff7","attenuationDistance":4.5,"metalWear":0.15,"woodGrainStrength":0.65}),
      object("coastal-ruins-bench", "Weathered shore bench", "bench", "weatheredWood", 36822, [-2.8,0.38315,1], [0,-14,0], [0.5,0.5,0.5], {"cloudiness":0.03,"inclusions":0.06,"absorptionColor":"#e9fff7","attenuationDistance":4.5,"metalWear":0.15,"woodGrainStrength":0.8}),
      object("coastal-ruins-vessel", "Shoreline storage jar", "jar", "terracotta", 36893, [3.15,0.385,1.85], [0,0,0], [0.26,0.26,0.26], {"cloudiness":0.03,"inclusions":0.06,"absorptionColor":"#e9fff7","attenuationDistance":4.5,"metalWear":0.15,"woodGrainStrength":0.65}),
      object("coastal-ruins-stone-one", "Coastal path slab", "slab", "limestone", 36964, [-0.1,0.385,1.75], [0,-8,0], [0.3,0.3,0.22], {"cloudiness":0.03,"inclusions":0.06,"absorptionColor":"#e9fff7","attenuationDistance":4.5,"metalWear":0.15,"woodGrainStrength":0.65}),
      object("coastal-ruins-stone-two", "Coastal path slab two", "slab", "limestone", 37035, [0.9,0.385,1.45], [0,18,0], [0.25,0.3,0.21], {"cloudiness":0.03,"inclusions":0.06,"absorptionColor":"#e9fff7","attenuationDistance":4.5,"metalWear":0.15,"woodGrainStrength":0.65}),
      object("coastal-ruins-shore-rock", "Salt worn rock", "boulder", "stone", 37106, [3.5,0.385,0.65], [0,-22,0], [0.27,0.27,0.27], {"cloudiness":0.03,"inclusions":0.06,"absorptionColor":"#e9fff7","attenuationDistance":4.5,"metalWear":0.15,"woodGrainStrength":0.65}),
    ],
  },
  'crystal-hollow': {
    environment: {"lighting":"alpine","ground":"studio","reflection":0.46,"groundWetness":0.55,"groundScale":1},
    objects: [
      object("crystal-hollow-base", "Hollow floor", "roundPlatform", "basalt", 37274, [0,0,0], [0,0,0], [3,0.65,2.45], {"noiseAmount":0.14,"detail":0.25,"contrast":0.32,"normalStrength":0.15,"cloudiness":0.03,"inclusions":0.06,"absorptionColor":"#e9fff7","attenuationDistance":4.5,"metalWear":0.15,"woodGrainStrength":0.65}),
      object("crystal-hollow-ridge", "Sheltering stone ridge", "cliffFace", "stone", 37345, [-0.85,0.357424,-1.9], [0,5,0], [1.2,0.77,0.65], {"cloudiness":0.03,"inclusions":0.06,"absorptionColor":"#e9fff7","attenuationDistance":4.5,"metalWear":0.15,"woodGrainStrength":0.65}),
      object("crystal-hollow-terrace", "Crystal upper shelf", "hexPlatform", "stone", 37416, [1.85,0.3575,-0.6], [0,0,0], [1.12,1.1,1], {"cloudiness":0.03,"inclusions":0.06,"absorptionColor":"#e9fff7","attenuationDistance":4.5,"metalWear":0.15,"woodGrainStrength":0.65}),
      object("crystal-hollow-hero", "Violet quartz crown", "crystals", "quartz", 37487, [1.9,0.959675,-0.65], [0,-18,0], [0.77,0.77,0.77], {"cloudiness":0.14,"inclusions":0.42,"absorptionColor":"#b09be7","attenuationDistance":2.4,"metalWear":0.15,"woodGrainStrength":0.65}),
      object("crystal-hollow-ice", "Glacier cluster", "crystals", "frozenGlass", 37558, [-2.1,0.3575,-0.5], [0,25,0], [0.57,0.57,0.57], {"cloudiness":0.22,"inclusions":0.28,"absorptionColor":"#72e4f0","attenuationDistance":2.2,"metalWear":0.15,"woodGrainStrength":0.65}),
      object("crystal-hollow-low-crystal", "Front quartz growth", "crystals", "quartz", 37629, [0,0.3575,1.75], [0,17,0], [0.42,0.42,0.42], {"cloudiness":0.2,"inclusions":0.36,"absorptionColor":"#d5b6eb","attenuationDistance":2.4,"metalWear":0.15,"woodGrainStrength":0.65}),
      object("crystal-hollow-stone", "Dark hollow boulder", "boulder", "obsidian", 37700, [-2.75,0.3575,1.1], [0,-30,0], [0.43,0.43,0.43], {"cloudiness":0.03,"inclusions":0.06,"absorptionColor":"#e9fff7","attenuationDistance":4.5,"metalWear":0.15,"woodGrainStrength":0.65}),
      object("crystal-hollow-cairn", "Hollow trail marker", "cairn", "stone", 37771, [2.7,0.3575,1.55], [0,20,0], [0.3,0.3,0.3], {"cloudiness":0.03,"inclusions":0.06,"absorptionColor":"#e9fff7","attenuationDistance":4.5,"metalWear":0.15,"woodGrainStrength":0.65}),
      object("crystal-hollow-shard", "Small glacier shard", "crystals", "ice", 37842, [-1.3,0.3575,1.4], [0,-20,0], [0.27,0.27,0.27], {"cloudiness":0.03,"inclusions":0.06,"absorptionColor":"#e9fff7","attenuationDistance":4.5,"metalWear":0.15,"woodGrainStrength":0.65}),
      object("crystal-hollow-rock-1", "Loose dark stone", "boulder", "basalt", 37913, [1.65,0.3575,1.8], [0,30,0], [0.25,0.25,0.25], {"cloudiness":0.03,"inclusions":0.06,"absorptionColor":"#e9fff7","attenuationDistance":4.5,"metalWear":0.15,"woodGrainStrength":0.65}),
      object("crystal-hollow-rock-2", "Loose slate stone", "boulder", "stone", 37984, [0.1,0.3575,-0.7], [0,-18,0], [0.2,0.2,0.2], {"cloudiness":0.03,"inclusions":0.06,"absorptionColor":"#e9fff7","attenuationDistance":4.5,"metalWear":0.15,"woodGrainStrength":0.65}),
      object("crystal-hollow-step", "Hollow stepping ledge", "slab", "stone", 38055, [-0.35,0.3575,0.5], [0,10,0], [0.31,0.35,0.25], {"cloudiness":0.03,"inclusions":0.06,"absorptionColor":"#e9fff7","attenuationDistance":4.5,"metalWear":0.15,"woodGrainStrength":0.65}),
      object("crystal-hollow-orb", "Milky quartz nodule", "sphere", "quartz", 38126, [-3.2,0.3575,-1.5], [0,0,0], [0.17,0.17,0.17], {"cloudiness":0.6,"inclusions":0.55,"absorptionColor":"#d5bcf0","attenuationDistance":2.4,"metalWear":0.15,"woodGrainStrength":0.65}),
    ],
  },
  'basalt-forge': {
    environment: {"lighting":"sunset","ground":"asphalt","reflection":0.43,"groundWetness":0.65,"groundScale":1},
    objects: [
      object("basalt-forge-base", "Basalt workshop floor", "hexPlatform", "basalt", 38365, [0,0,0], [0,0,0], [3,0.6,2.15], {"noiseAmount":0.11,"detail":0.23,"contrast":0.3,"normalStrength":0.14,"cloudiness":0.03,"inclusions":0.06,"absorptionColor":"#e9fff7","attenuationDistance":4.5,"metalWear":0.15,"woodGrainStrength":0.65}),
      object("basalt-forge-backdrop", "Volcanic backdrop", "cliffFace", "basalt", 38436, [-1.15,0.33,-1.6], [0,-8,0], [0.88,0.75,0.6], {"noiseAmount":0.17,"detail":0.28,"contrast":0.34,"cloudiness":0.03,"inclusions":0.06,"absorptionColor":"#e9fff7","attenuationDistance":4.5,"metalWear":0.15,"woodGrainStrength":0.65}),
      object("basalt-forge-bench", "Oak tool bench", "table", "oak", 38507, [1.45,0.329917,-0.55], [0,-8,0], [0.63,0.63,0.63], {"cloudiness":0.03,"inclusions":0.06,"absorptionColor":"#e9fff7","attenuationDistance":4.5,"metalWear":0.15,"woodGrainStrength":0.65}),
      object("basalt-forge-anvil-base", "Stone anvil plinth", "mediumBlock", "basalt", 38578, [-1.4,0.329998,0.55], [0,0,0], [0.7,0.64,0.7], {"cloudiness":0.03,"inclusions":0.06,"absorptionColor":"#e9fff7","attenuationDistance":4.5,"metalWear":0.15,"woodGrainStrength":0.65,"roughness":0.08}),
      object("basalt-forge-anvil", "Forged anvil beam", "iBeam", "iron", 38649, [-1.4,1.632302,0.55], [0,0,90], [0.4,0.65,0.4], {"cloudiness":0.03,"inclusions":0.06,"absorptionColor":"#e9fff7","attenuationDistance":4.5,"metalWear":0.4,"woodGrainStrength":0.65}),
      object("basalt-forge-hammer", "Cross-peen forge hammer", "hammer", "brushedSteel", 38720, [1.45,1.594497,-0.6], [90,0,-30], [0.35,0.35,0.35], {"cloudiness":0.03,"inclusions":0.06,"absorptionColor":"#e9fff7","attenuationDistance":4.5,"metalWear":0.12,"woodGrainStrength":0.65,"hammerHead":"cross"}, "walnut"),
      object("basalt-forge-stock", "Copper bar stock", "metalRod", "copper", 38791, [2.2,1.56135,-0.55], [90,0,0], [0.17,0.3,0.17], {"cloudiness":0.03,"inclusions":0.06,"absorptionColor":"#e9fff7","attenuationDistance":4.5,"metalWear":0.24,"woodGrainStrength":0.65}),
      object("basalt-forge-gear", "Brass workshop gear", "gear", "brass", 38862, [0.85,1.495417,-0.6], [0,0,0], [0.28,0.28,0.28], {"cloudiness":0.03,"inclusions":0.06,"absorptionColor":"#e9fff7","attenuationDistance":4.5,"metalWear":0.12,"woodGrainStrength":0.65}),
      object("basalt-forge-vessel", "Quench vessel", "planter", "iron", 38933, [2.15,0.327919,1.25], [0,0,0], [0.42,0.42,0.42], {"cloudiness":0.03,"inclusions":0.06,"absorptionColor":"#e9fff7","attenuationDistance":4.5,"metalWear":0.35,"woodGrainStrength":0.65}),
      object("basalt-forge-tube", "Steel offcut", "metalTube", "brushedSteel", 39004, [0.15,0.528396,1.65], [90,0,50], [0.25,0.24,0.25], {"cloudiness":0.03,"inclusions":0.06,"absorptionColor":"#e9fff7","attenuationDistance":4.5,"metalWear":0.12,"woodGrainStrength":0.65}),
      object("basalt-forge-bolt", "Large forged fastener", "hexBolt", "iron", 39075, [-0.75,0.478126,1.75], [90,0,-20], [0.23,0.23,0.23], {"cloudiness":0.03,"inclusions":0.06,"absorptionColor":"#e9fff7","attenuationDistance":4.5,"metalWear":0.32,"woodGrainStrength":0.65}),
      object("basalt-forge-pile", "Black volcanic stones", "boulder", "basalt", 39146, [-2.8,0.33,0.25], [0,28,0], [0.38,0.38,0.38], {"cloudiness":0.03,"inclusions":0.06,"absorptionColor":"#e9fff7","attenuationDistance":4.5,"metalWear":0.15,"woodGrainStrength":0.65}),
      object("basalt-forge-plate", "Stacked steel plate", "metalPlate", "brushedSteel", 39217, [-1.7,0.329019,1.7], [0,12,0], [0.38,0.38,0.38], {"cloudiness":0.03,"inclusions":0.06,"absorptionColor":"#e9fff7","attenuationDistance":4.5,"metalWear":0.12,"woodGrainStrength":0.65}),
      object("basalt-forge-lantern", "Copper turned stand", "metalCandlestick", "copper", 39288, [2.8,0.329906,-1.1], [0,0,0], [0.22,0.22,0.22], {"cloudiness":0.03,"inclusions":0.06,"absorptionColor":"#e9fff7","attenuationDistance":4.5,"metalWear":0.24,"woodGrainStrength":0.65}),
    ],
  },
  'quarry-yard': {
    environment: {"lighting":"soft","ground":"travertine","reflection":0.18,"groundWetness":0.2,"groundScale":1},
    objects: [
      object("quarry-yard-base", "Quarry working shelf", "ovalPlatform", "granite", 39456, [0,0,0], [0,0,0], [3.1,0.55,3.4], {"noiseAmount":0.12,"detail":0.25,"contrast":0.3,"normalStrength":0.15,"cloudiness":0.03,"inclusions":0.06,"absorptionColor":"#e9fff7","attenuationDistance":4.5,"metalWear":0.15,"woodGrainStrength":0.65}),
      object("quarry-yard-wall", "Quarry cut face", "cliffFace", "granite", 39527, [-2.35,0.3025,-1.55], [0,-5,0], [0.78,0.8,0.7], {"cloudiness":0.03,"inclusions":0.06,"absorptionColor":"#e9fff7","attenuationDistance":4.5,"metalWear":0.15,"woodGrainStrength":0.65}),
      object("quarry-yard-shelf", "Raised loading pad", "platform", "limestone", 39598, [1.95,0.3025,-0.65], [0,0,0], [0.95,3.2,0.82], {"cloudiness":0.03,"inclusions":0.06,"absorptionColor":"#e9fff7","attenuationDistance":4.5,"metalWear":0.15,"woodGrainStrength":0.65,"roughness":0.05}),
      object("quarry-yard-ramp", "Loading approach ramp", "lowRamp", "limestone", 39669, [1.8,0.302179,1.155], [0,90,0], [0.52,1.185,0.6], {"cloudiness":0.03,"inclusions":0.06,"absorptionColor":"#e9fff7","attenuationDistance":4.5,"metalWear":0.15,"woodGrainStrength":0.65,"roughness":0.04}),
      object("quarry-yard-block-one", "Large dressed block", "largeBlock", "limestone", 39740, [1.3,1.0705,-0.65], [0,0,0], [0.44,0.35,0.43], {"cloudiness":0.03,"inclusions":0.06,"absorptionColor":"#e9fff7","attenuationDistance":4.5,"metalWear":0.15,"woodGrainStrength":0.65,"roughness":0.07}),
      object("quarry-yard-block-two", "Dressed block pair", "mediumBlock", "limestone", 39811, [2.55,1.0705,-0.65], [0,0,0], [0.48,0.55,0.5], {"cloudiness":0.03,"inclusions":0.06,"absorptionColor":"#e9fff7","attenuationDistance":4.5,"metalWear":0.15,"woodGrainStrength":0.65,"roughness":0.05}),
      object("quarry-yard-column", "Unfinished round column", "roundColumn", "granite", 39882, [-1.05,0.3025,-0.7], [0,8,0], [0.44,0.44,0.44], {"cloudiness":0.03,"inclusions":0.06,"absorptionColor":"#e9fff7","attenuationDistance":4.5,"metalWear":0.15,"woodGrainStrength":0.65}),
      object("quarry-yard-drum", "Cut column drum", "cylinder", "granite", 39953, [-0.55,0.769172,1.25], [90,0,-30], [0.34,0.32,0.34], {"cloudiness":0.03,"inclusions":0.06,"absorptionColor":"#e9fff7","attenuationDistance":4.5,"metalWear":0.15,"woodGrainStrength":0.65}),
      object("quarry-yard-block-front", "Small quarried block", "smallBlock", "limestone", 40024, [-2.45,0.3025,1.2], [0,-14,0], [0.54,0.4,0.45], {"cloudiness":0.03,"inclusions":0.06,"absorptionColor":"#e9fff7","attenuationDistance":4.5,"metalWear":0.15,"woodGrainStrength":0.65,"roughness":0.08}),
      object("quarry-yard-block-upper", "Stacked small block", "smallBlock", "limestone", 40095, [-2.45,0.6225,1.2], [0,-5,0], [0.36,0.34,0.35], {"cloudiness":0.03,"inclusions":0.06,"absorptionColor":"#e9fff7","attenuationDistance":4.5,"metalWear":0.15,"woodGrainStrength":0.65,"roughness":0.07}),
      object("quarry-yard-tool", "Quarry club hammer", "hammer", "iron", 40166, [0,0.387963,-0.2], [90,0,35], [0.28,0.28,0.28], {"cloudiness":0.03,"inclusions":0.06,"absorptionColor":"#e9fff7","attenuationDistance":4.5,"metalWear":0.32,"woodGrainStrength":0.65,"hammerHead":"club"}, "oak"),
      object("quarry-yard-chip-one", "Granite rubble", "boulder", "granite", 40237, [3.7,0.302055,0.9], [0,-12,0], [0.29,0.29,0.29], {"cloudiness":0.03,"inclusions":0.06,"absorptionColor":"#e9fff7","attenuationDistance":4.5,"metalWear":0.15,"woodGrainStrength":0.65}),
      object("quarry-yard-chip-two", "Loose quarry fragment", "slab", "granite", 40308, [-3.45,0.3025,0.45], [0,20,0], [0.28,0.28,0.28], {"cloudiness":0.03,"inclusions":0.06,"absorptionColor":"#e9fff7","attenuationDistance":4.5,"metalWear":0.15,"woodGrainStrength":0.65}),
      object("quarry-yard-stock", "Metal lifting beam", "iBeam", "brushedSteel", 40379, [0.65,0.582207,1.7], [90,0,0], [0.22,0.5,0.22], {"cloudiness":0.03,"inclusions":0.06,"absorptionColor":"#e9fff7","attenuationDistance":4.5,"metalWear":0.12,"woodGrainStrength":0.65}),
    ],
  },
  'artisan-terrace': {
    environment: {"lighting":"soft","ground":"slate","reflection":0.18,"groundWetness":0.2,"groundScale":1},
    objects: [
      object("artisan-terrace-base", "Artisan stone terrace", "ovalPlatform", "limestone", 40547, [0,0,0], [0,0,0], [3,0.65,3.4], {"cloudiness":0.03,"inclusions":0.06,"absorptionColor":"#e9fff7","attenuationDistance":4.5,"metalWear":0.15,"woodGrainStrength":0.65}),
      object("artisan-terrace-display", "Raised display dais", "platform", "limestone", 40618, [-2,0.357305,-0.9], [0,0,0], [0.94,2.8,0.78], {"cloudiness":0.03,"inclusions":0.06,"absorptionColor":"#e9fff7","attenuationDistance":4.5,"metalWear":0.15,"woodGrainStrength":0.65,"roughness":0.07}),
      object("artisan-terrace-urn", "Ivory exhibition urn", "urn", "porcelain", 40689, [-2.7,1.029305,-1.15], [0,0,0], [0.38,0.38,0.38], {"cloudiness":0.03,"inclusions":0.06,"absorptionColor":"#e9fff7","attenuationDistance":4.5,"metalWear":0.15,"woodGrainStrength":0.65}),
      object("artisan-terrace-vase", "Jade exhibition vase", "vase", "celadon", 40760, [-1.4,1.029305,-1], [0,0,0], [0.39,0.39,0.39], {"cloudiness":0.03,"inclusions":0.06,"absorptionColor":"#e9fff7","attenuationDistance":4.5,"metalWear":0.15,"woodGrainStrength":0.65}),
      object("artisan-terrace-jar", "Tall fired clay jar", "jar", "terracotta", 40831, [-2.15,1.029305,-0.2], [0,0,0], [0.31,0.31,0.31], {"cloudiness":0.03,"inclusions":0.06,"absorptionColor":"#e9fff7","attenuationDistance":4.5,"metalWear":0.15,"woodGrainStrength":0.65}),
      object("artisan-terrace-table", "Potter work table", "table", "oak", 40902, [1.15,0.3575,-0.45], [0,-5,0], [0.68,0.68,0.68], {"cloudiness":0.03,"inclusions":0.06,"absorptionColor":"#e9fff7","attenuationDistance":4.5,"metalWear":0.15,"woodGrainStrength":0.65}),
      object("artisan-terrace-bowl", "Fresh glazed bowl", "bowl", "celadon", 40973, [0.65,1.6155,-0.25], [0,0,0], [0.25,0.25,0.25], {"cloudiness":0.03,"inclusions":0.06,"absorptionColor":"#e9fff7","attenuationDistance":4.5,"metalWear":0.15,"woodGrainStrength":0.65}),
      object("artisan-terrace-vase-small", "Small porcelain vase", "vase", "porcelain", 41044, [1.65,1.6155,-0.65], [0,0,0], [0.25,0.25,0.25], {"cloudiness":0.03,"inclusions":0.06,"absorptionColor":"#e9fff7","attenuationDistance":4.5,"metalWear":0.15,"woodGrainStrength":0.65}),
      object("artisan-terrace-saucer", "Warm stoneware saucer", "saucer", "stoneware", 41115, [1.5,1.6155,0.02], [0,0,0], [0.19,0.19,0.19], {"cloudiness":0.03,"inclusions":0.06,"absorptionColor":"#e9fff7","attenuationDistance":4.5,"metalWear":0.15,"woodGrainStrength":0.65}),
      object("artisan-terrace-knife", "Wood handled trimming knife", "knife", "brushedSteel", 41186, [0.65,1.644385,-0.85], [90,0,-20], [0.19,0.19,0.19], {"cloudiness":0.03,"inclusions":0.06,"absorptionColor":"#e9fff7","attenuationDistance":4.5,"metalWear":0.12,"woodGrainStrength":0.65,"knifeBlade":"drop"}, "oak"),
      object("artisan-terrace-stool", "Potter stool", "stool", "walnut", 41257, [1.15,0.357169,1.2], [0,15,0], [0.45,0.45,0.45], {"cloudiness":0.03,"inclusions":0.06,"absorptionColor":"#e9fff7","attenuationDistance":4.5,"metalWear":0.15,"woodGrainStrength":0.72}),
      object("artisan-terrace-bench", "Visitor bench", "bench", "oak", 41328, [-2.1,0.3575,1.35], [0,-5,0], [0.53,0.53,0.53], {"cloudiness":0.03,"inclusions":0.06,"absorptionColor":"#e9fff7","attenuationDistance":4.5,"metalWear":0.15,"woodGrainStrength":0.65}),
      object("artisan-terrace-planter", "Terracotta storage vessel", "planter", "terracotta", 41399, [3,0.356941,0.45], [0,0,0], [0.37,0.37,0.37], {"cloudiness":0.03,"inclusions":0.06,"absorptionColor":"#e9fff7","attenuationDistance":4.5,"metalWear":0.15,"woodGrainStrength":0.65}),
      object("artisan-terrace-stand", "Turned walnut display stand", "woodenCandlestick", "walnut", 41470, [-3.65,0.355917,0.75], [0,0,0], [0.3,0.3,0.3], {"cloudiness":0.03,"inclusions":0.06,"absorptionColor":"#e9fff7","attenuationDistance":4.5,"metalWear":0.15,"woodGrainStrength":0.72}, "oak"),
      object("artisan-terrace-jar-front", "Finished speckled jar", "jar", "stoneware", 41541, [2.45,0.355694,1.7], [0,0,0], [0.26,0.26,0.26], {"cloudiness":0.03,"inclusions":0.06,"absorptionColor":"#e9fff7","attenuationDistance":4.5,"metalWear":0.15,"woodGrainStrength":0.65}),
    ],
  },
  'garden-courtyard': {
    environment: {"lighting":"soft","ground":"travertine","reflection":0.2,"groundWetness":0.25,"groundScale":1},
    objects: [
      object("garden-courtyard-base", "Garden courtyard foundation", "roundPlatform", "limestone", 41638, [0,0,0], [0,0,0], [3.25,0.5,2.55], {"cloudiness":0.03,"inclusions":0.06,"absorptionColor":"#e9fff7","attenuationDistance":4.5,"metalWear":0.15,"woodGrainStrength":0.65}),
      object("garden-courtyard-terrace", "Upper garden terrace", "platform", "limestone", 41709, [0,0.273809,-1.05], [0,0,0], [1.3,2.7,0.78], {"cloudiness":0.03,"inclusions":0.06,"absorptionColor":"#e9fff7","attenuationDistance":4.5,"metalWear":0.15,"woodGrainStrength":0.65,"roughness":0.06}),
      object("garden-courtyard-arch", "Garden entrance arch", "pointedArch", "limestone", 41780, [-0.05,0.921809,-1.4], [0,0,0], [0.74,0.85,0.72], {"cloudiness":0.03,"inclusions":0.06,"absorptionColor":"#e9fff7","attenuationDistance":4.5,"metalWear":0.15,"woodGrainStrength":0.65}),
      object("garden-courtyard-vase-west", "Western celadon vessel", "vase", "celadon", 41851, [-1.55,0.921809,-1.25], [0,0,0], [0.34,0.34,0.34], {"cloudiness":0.03,"inclusions":0.06,"absorptionColor":"#e9fff7","attenuationDistance":4.5,"metalWear":0.15,"woodGrainStrength":0.65}),
      object("garden-courtyard-vase-east", "Eastern celadon vessel", "vase", "celadon", 41922, [1.5,0.921809,-1.25], [0,0,0], [0.34,0.34,0.34], {"cloudiness":0.03,"inclusions":0.06,"absorptionColor":"#e9fff7","attenuationDistance":4.5,"metalWear":0.15,"woodGrainStrength":0.65}),
      object("garden-courtyard-steps", "Garden terrace steps", "stairs", "limestone", 41993, [0,0.274528,0.45], [0,0,0], [0.5,0.24,0.3], {"cloudiness":0.03,"inclusions":0.06,"absorptionColor":"#e9fff7","attenuationDistance":4.5,"metalWear":0.15,"woodGrainStrength":0.65,"roughness":0.05}),
      object("garden-courtyard-bench-west", "Western garden seat", "bench", "oak", 42064, [-2.55,0.274339,0.65], [0,-20,0], [0.61,0.61,0.61], {"cloudiness":0.03,"inclusions":0.06,"absorptionColor":"#e9fff7","attenuationDistance":4.5,"metalWear":0.15,"woodGrainStrength":0.65}),
      object("garden-courtyard-bench-east", "Eastern garden seat", "bench", "oak", 42135, [2.55,0.274908,0.65], [0,20,0], [0.61,0.61,0.61], {"cloudiness":0.03,"inclusions":0.06,"absorptionColor":"#e9fff7","attenuationDistance":4.5,"metalWear":0.15,"woodGrainStrength":0.65}),
      object("garden-courtyard-center", "Courtyard stone plinth", "plinth", "limestone", 42206, [0,0.275,1.9], [0,0,0], [0.3,0.3,0.3], {"cloudiness":0.03,"inclusions":0.06,"absorptionColor":"#e9fff7","attenuationDistance":4.5,"metalWear":0.15,"woodGrainStrength":0.65}),
      object("garden-courtyard-urn", "Courtyard porcelain urn", "urn", "porcelain", 42277, [0,0.59,1.9], [0,0,0], [0.23,0.23,0.23], {"cloudiness":0.03,"inclusions":0.06,"absorptionColor":"#e9fff7","attenuationDistance":4.5,"metalWear":0.15,"woodGrainStrength":0.65}),
      object("garden-courtyard-planter-west", "West terracotta planter", "planter", "terracotta", 42348, [-2.45,0.273699,-0.7], [0,0,0], [0.33,0.33,0.33], {"cloudiness":0.03,"inclusions":0.06,"absorptionColor":"#e9fff7","attenuationDistance":4.5,"metalWear":0.15,"woodGrainStrength":0.65}),
      object("garden-courtyard-planter-east", "East terracotta planter", "planter", "terracotta", 42419, [2.45,0.27425,-0.7], [0,0,0], [0.33,0.33,0.33], {"cloudiness":0.03,"inclusions":0.06,"absorptionColor":"#e9fff7","attenuationDistance":4.5,"metalWear":0.15,"woodGrainStrength":0.65}),
      object("garden-courtyard-pebbles-west", "Garden edge stones", "boulder", "stone", 42490, [-3.55,0.273175,-1.1], [0,16,0], [0.24,0.24,0.24], {"cloudiness":0.03,"inclusions":0.06,"absorptionColor":"#e9fff7","attenuationDistance":4.5,"metalWear":0.15,"woodGrainStrength":0.65}),
      object("garden-courtyard-pebbles-east", "Garden edge stones two", "boulder", "stone", 42561, [3.35,0.274518,-0.35], [0,-35,0], [0.25,0.25,0.25], {"cloudiness":0.03,"inclusions":0.06,"absorptionColor":"#e9fff7","attenuationDistance":4.5,"metalWear":0.15,"woodGrainStrength":0.65}),
      object("garden-courtyard-dish", "Garden water dish", "bowl", "celadon", 42632, [1.5,0.275,2.25], [0,0,0], [0.28,0.28,0.28], {"cloudiness":0.03,"inclusions":0.06,"absorptionColor":"#e9fff7","attenuationDistance":4.5,"metalWear":0.15,"woodGrainStrength":0.65}),
    ],
  },
};

/** Return an independent Scene v1 payload, ready for atomic sceneEditor.load(). */
export function createScenePreset(id) {
  if (!Object.hasOwn(SCENES, id)) throw new RangeError(`Unknown scene preset: ${id}`);
  return structuredClone({
    version: 1, selectedId: null, initialized: true, ...SCENES[id],
    settings: { tool: 'translate', space: 'world', snap: false, translationSnap: .25,
      rotationSnap: 15, scaleSnap: .1, renderMode: 'shaded', grid: false },
  });
}
