// Workshop settings survive surface changes and recipe round trips. These
// fields affect shading only; bevels, chips and lathe walls belong to geometry.
export const WORKSHOP_MATERIAL_DEFAULTS = Object.freeze({
  metalBrushing: .65,
  metalWear: .15,
  woodGrainScale: 2,
  woodGrainStrength: .65,
  woodKnots: .35,
  woodWarmth: .6,
  woodVariation: .65,
  woodSpiral: .25,
  woodCracks: .25,
  woodBark: 0,
  woodRelief: .5,
  ceramicGlaze: .7,
  ceramicSpeckle: .3,
});

export const WORKSHOP_MATERIAL_RANGES = Object.freeze({
  metalBrushing: [0, 1], metalWear: [0, 1],
  woodGrainScale: [.5, 6], woodGrainStrength: [0, 1], woodKnots: [0, 1], woodWarmth: [0, 1],
  woodVariation: [0, 1], woodSpiral: [0, 1], woodCracks: [0, 1], woodBark: [0, 1], woodRelief: [0, 1],
  ceramicGlaze: [0, 1], ceramicSpeckle: [0, 1],
});

// The metal colors are bounded artistic conductor reflectance palettes in
// linear space, not measured spectral IOR data. Native metalness provides the
// energy-conserving conductor response; wear exposes a dielectric patina.
export const WORKSHOP_SURFACES = Object.freeze({
  brushedSteel: { family:'metal', label:'Brushed steel', short:'Steel', description:'Cool steel · directional brushing', roughness:.31, metalness:1, environment:1.15, defaults:{metalBrushing:.75,metalWear:.12} },
  iron: { family:'metal', label:'Forged iron', short:'Iron', description:'Dark forged metal · mottled wear', roughness:.53, metalness:1, environment:1.10, defaults:{metalBrushing:.22,metalWear:.32} },
  aluminum: { family:'metal', label:'Satin aluminum', short:'Aluminum', description:'Pale silver · soft machining lines', roughness:.28, metalness:1, environment:1.05, defaults:{metalBrushing:.58,metalWear:.08} },
  chrome: { family:'metal', label:'Polished chrome', short:'Chrome', description:'Mirror silver · crisp reflections', roughness:.07, metalness:1, environment:1.15, defaults:{metalBrushing:.08,metalWear:.03} },
  copper: { family:'metal', label:'Aged copper', short:'Copper', description:'Warm copper · turquoise patina', roughness:.32, metalness:1, environment:1.10, defaults:{metalBrushing:.30,metalWear:.24} },
  bronze: { family:'metal', label:'Cast bronze', short:'Bronze', description:'Brown gold · dark aged recesses', roughness:.39, metalness:1, environment:1.10, defaults:{metalBrushing:.22,metalWear:.27} },
  brass: { family:'metal', label:'Polished brass', short:'Brass', description:'Yellow gold · brushed highlights', roughness:.22, metalness:1, environment:1.10, defaults:{metalBrushing:.45,metalWear:.12} },
  gold: { family:'metal', label:'Warm gold', short:'Gold', description:'Rich gold · soft polished edges', roughness:.18, metalness:1, environment:1.05, defaults:{metalBrushing:.20,metalWear:.05} },
  oak: { family:'wood', label:'Honey oak', short:'Oak', description:'Warm blond grain · rounded knots', roughness:.56, metalness:0, environment:.55, defaults:{woodGrainScale:2,woodGrainStrength:.65,woodKnots:.35,woodWarmth:.65,woodVariation:.65,woodSpiral:.25,woodCracks:.25,woodBark:0,woodRelief:.5} },
  walnut: { family:'wood', label:'Dark walnut', short:'Walnut', description:'Chocolate grain · warm worn edges', roughness:.43, metalness:0, environment:.65, defaults:{woodGrainScale:2.3,woodGrainStrength:.72,woodKnots:.5,woodWarmth:.55,woodVariation:.8,woodSpiral:.4,woodCracks:.18,woodBark:0,woodRelief:.42} },
  weatheredWood: { family:'wood', label:'Weathered wood', short:'Old wood', description:'Silvered timber · deep long grain', roughness:.82, metalness:0, environment:.40, defaults:{woodGrainScale:1.7,woodGrainStrength:.8,woodKnots:.45,woodWarmth:.28,woodVariation:.85,woodSpiral:.18,woodCracks:.75,woodBark:.18,woodRelief:.78} },
  terracotta: { family:'ceramic', label:'Terracotta', short:'Terracotta', description:'Warm fired clay · porous thrown rings', roughness:.83, metalness:0, environment:.45, defaults:{ceramicGlaze:.04,ceramicSpeckle:.5} },
  porcelain: { family:'ceramic', label:'Ivory porcelain', short:'Porcelain', description:'Cream porcelain · glossy glaze', roughness:.17, metalness:0, environment:.85, defaults:{ceramicGlaze:.95,ceramicSpeckle:.05} },
  celadon: { family:'ceramic', label:'Celadon glaze', short:'Celadon', description:'Jade green · pooled ceramic glaze', roughness:.23, metalness:0, environment:.90, defaults:{ceramicGlaze:.85,ceramicSpeckle:.18} },
  stoneware: { family:'ceramic', label:'Speckled stoneware', short:'Stoneware', description:'Oatmeal clay · mineral flecks', roughness:.50, metalness:0, environment:.65, defaults:{ceramicGlaze:.48,ceramicSpeckle:.72} },
});

export const WORKSHOP_MATERIAL_FIELDS = Object.freeze({
  metal:['metalBrushing','metalWear'],
  wood:['woodGrainScale','woodGrainStrength','woodKnots','woodWarmth','woodVariation','woodSpiral','woodCracks','woodBark','woodRelief'],
  ceramic:['ceramicGlaze','ceramicSpeckle'],
});

// Recipes only replace grain controls, leaving the chosen wood species and
// outer/inner/part finish intact. The UI derives Custom from these values.
export const WOOD_PATTERNS = Object.freeze({
  natural: {label:'Natural grain',options:{woodGrainScale:2,woodGrainStrength:.65,woodKnots:.35,woodWarmth:.65,woodVariation:.65,woodSpiral:.25,woodCracks:.25,woodBark:0,woodRelief:.5}},
  storybook: {label:'Storybook spirals',options:{woodGrainScale:1.25,woodGrainStrength:.82,woodKnots:.7,woodWarmth:.78,woodVariation:.7,woodSpiral:.9,woodCracks:.2,woodBark:0,woodRelief:.72}},
  split: {label:'Split timber',options:{woodGrainScale:1.6,woodGrainStrength:.8,woodKnots:.4,woodWarmth:.48,woodVariation:.85,woodSpiral:.2,woodCracks:.95,woodBark:.08,woodRelief:.85}},
  bark: {label:'Rugged bark',options:{woodGrainScale:1.45,woodGrainStrength:.88,woodKnots:.5,woodWarmth:.55,woodVariation:.9,woodSpiral:.32,woodCracks:.72,woodBark:1,woodRelief:.95}},
  burl: {label:'Burl & whorls',options:{woodGrainScale:2.35,woodGrainStrength:.78,woodKnots:1,woodWarmth:.68,woodVariation:1,woodSpiral:.72,woodCracks:.12,woodBark:0,woodRelief:.62}},
});

export const workshopFamilyFor = surface => WORKSHOP_SURFACES[surface]?.family ?? null;
// Short aliases make shared recipe validation consistent with optical ranges.
export const WORKSHOP_RANGES = WORKSHOP_MATERIAL_RANGES;
