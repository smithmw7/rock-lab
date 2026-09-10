export const shapeGroups = [
  {id:'natural',label:'Natural',description:'Fractured forms for landscapes and encounter spaces.',shapes:['boulder','stack','slab','spire','crystals','arch']},
  {id:'primitives',label:'Primitives',description:'Simple solids for material studies and modular props.',shapes:['block','brick','sphere','cylinder','wedge','roundedBlock']},
  {id:'structures',label:'Structures',description:'Assembled pieces for ruins, landmarks, and level kits.',shapes:['wall','monolith','columns','stairs','ruins','cairn']},
];
export const shapes = {
  boulder:{label:'Boulder',title:'Weathered boulder',icon:'M4 25 2 15 9 5 22 3 30 15 26 28 13 30Z M2 15 16 13 22 3 M16 13 26 28 M16 13 13 30'},
  stack:{label:'Outcrop',title:'Layered outcrop',icon:'M2 29 2 20 11 17 11 9 15 8 15 2 25 3 28 14 25 15 30 22 30 29Z M2 20 15 23 30 22 M15 23 15 30 M11 17 23 18 28 14 M15 8 21 10 25 3 M21 10 23 18'},
  slab:{label:'Ledge',title:'Broken stone ledge',icon:'M2 12 19 5 30 10 29 23 15 29 3 24Z M2 12 15 17 30 10 M15 17 15 29 M8 10 22 14 M8 14 8 26 M22 14 22 26'},
  spire:{label:'Spire',title:'Weathered spire',icon:'M5 29 8 13 16 2 25 7 28 29Z M16 2 16 17 5 29 M16 17 25 7 M16 17 22 29'},
  crystals:{label:'Crystals',title:'Crystal cluster',icon:'M3 29 1 18 5 9 9 19 15 2 20 11 23 7 28 3 30 15 24 29Z M15 2 15 26 20 11 M5 9 5 24 M28 3 24 23 M9 19 12 29'},
  arch:{label:'Arch',title:'Natural stone arch',icon:'M1 29 4 13 10 4 21 2 29 13 31 29 23 29 21 17 15 13 11 19 9 29Z M4 13 11 19 M10 4 15 13 M21 2 21 17 M29 13 21 17'},
  block:{label:'Block',title:'Stone block',icon:'M3 9 16 3 29 9 29 24 16 30 3 24Z M3 9 16 15 29 9 M16 15 16 30'},
  brick:{label:'Brick',title:'Building brick',icon:'M2 13 22 5 30 10 30 20 10 28 2 23Z M2 13 10 18 30 10 M10 18 10 28'},
  sphere:{label:'Sphere',title:'Material sphere',icon:'M16 2 A14 14 0 1 0 16 30 A14 14 0 1 0 16 2 M16 2 C4 8 4 24 16 30 M16 2 C28 8 28 24 16 30 M2 16 H30'},
  cylinder:{label:'Cylinder',title:'Solid cylinder',icon:'M4 8 C4 1 28 1 28 8 C28 15 4 15 4 8 V25 C4 32 28 32 28 25 V8 M4 25 C4 18 28 18 28 25'},
  wedge:{label:'Wedge',title:'Stone wedge',icon:'M3 26 3 6 17 2 29 21 16 29Z M3 6 16 29 M16 29 29 21'},
  roundedBlock:{label:'Soft block',title:'Rounded stone block',icon:'M6 8 Q2 10 3 15 L4 24 Q5 28 10 29 L20 29 Q27 28 28 23 L29 10 Q28 6 23 5 L15 3Z M4 10 Q15 8 18 14 L18 28 M18 14 28 9'},
  wall:{label:'Block wall',title:'Staggered block wall',icon:'M2 5 H30 V29 H2Z M2 13 H30 M2 21 H30 M11 5 V13 M23 5 V13 M7 13 V21 M19 13 V21 M11 21 V29 M23 21 V29'},
  monolith:{label:'Monolith',title:'Standing monolith',icon:'M7 29 9 4 21 1 26 26 18 31Z M9 4 18 8 21 1 M18 8 18 31'},
  columns:{label:'Columns',title:'Column sanctuary',icon:'M2 27 H11 V30 H2Z M4 27 V8 H9 V27 M2 5 H11 V8 H2Z M13 27 H22 V30 H13Z M15 27 V4 H20 V27 M13 1 H22 V4 H13Z M24 27 H31 V30 H24Z M26 27 V13 H29 V27 M24 10 H31 V13 H24Z'},
  stairs:{label:'Stairs',title:'Carved stone stairs',icon:'M2 29 V23 H8 V17 H14 V11 H20 V5 H29 V29Z M2 23 H29 M8 17 H29 M14 11 H29'},
  ruins:{label:'Ruins',title:'Courtyard ruins',icon:'M2 29 V10 H9 V18 H15 V7 H22 V13 H29 V29Z M2 20 H29 M2 25 H29 M5 10 V20 M18 7 V20 M12 20 V29 M24 20 V29'},
  cairn:{label:'Cairn',title:'Trail marker cairn',icon:'M3 29 2 23 9 20 23 21 30 25 27 29Z M6 20 7 14 20 12 26 18 23 21 M11 13 9 8 16 2 23 8 20 12'},
};
export const surfaces = {
  stone:{label:'Alpine slate',short:'Slate',description:'Cool planes · painted chips',roughness:.85},
  ice:{label:'Glacier ice',short:'Ice',description:'Cyan depth · pale fractures',roughness:.30},
  desert:{label:'Red sandstone',short:'Sandstone',description:'Rust red · sediment layers',roughness:.90},
  limestone:{label:'Limestone',short:'Limestone',description:'Warm chalk · soft pores',roughness:.93},
  granite:{label:'Granite',short:'Granite',description:'Crystal grains · mottled stone',roughness:.72},
  basalt:{label:'Basalt',short:'Basalt',description:'Dark volcanic stone · pitted',roughness:.96},
  obsidian:{label:'Black obsidian',short:'Obsidian',description:'Glassy black · polished planes',roughness:.08},
  glass:{label:'Clear glass',short:'Glass',description:'Clear volume · bent light',roughness:.08},
  quartz:{label:'Included quartz',short:'Quartz',description:'Mineral flecks · rainbow edges',roughness:.15},
  frozenGlass:{label:'Translucent ice',short:'Translucent ice',description:'Frozen clouds · internal cracks',roughness:.18},
};
export const grounds = {
  studio:{label:'Studio',description:'A quiet neutral surface',wetness:.35,reflection:.35,scale:1},
  asphalt:{label:'Wet asphalt',description:'Dark aggregate and wet patches',wetness:.85,reflection:.7,scale:1},
  concrete:{label:'Concrete',description:'Mottled concrete with slab joints',wetness:.25,reflection:.22,scale:1},
  sand:{label:'Sand',description:'Fine grains and wind ripples',wetness:0,reflection:0,scale:1},
  wood:{label:'Wooden planks',description:'Individual boards with long grain',wetness:.25,reflection:.3,scale:1},
};
export const defaults = {seed:18427,shape:'boulder',facets:.5,roughness:.35,bevel:.5,displacement:0,geometryNoiseScale:2,noiseScale:2,noiseAmount:.45,normalStrength:.3,materialRoughness:.85,surface:'stone',snow:0,detail:.45,contrast:.55,lighting:'alpine',ground:'studio',reflection:.35,groundWetness:.35,groundScale:1,mapView:'beauty'};
export const looks = {
  alpine:{label:'Alpine',note:'Broken boulders and cold slate',options:{...defaults}},
  desert:{label:'Desert',note:'Layered red sandstone on dry sand',options:{...defaults,shape:'stack',surface:'desert',materialRoughness:.90,ground:'sand',reflection:0,groundWetness:0,seed:72103,lighting:'sunset',noiseScale:2.2,noiseAmount:.65,normalStrength:.45}},
  volcanic:{label:'Volcanic',note:'Polished black monolith over wet asphalt',options:{...defaults,shape:'monolith',surface:'obsidian',materialRoughness:.08,ground:'asphalt',reflection:.8,groundWetness:.9,seed:19423,noiseAmount:.22,normalStrength:.12,lighting:'soft'}},
  ruins:{label:'Ruins',note:'Pale limestone courtyard fragments',options:{...defaults,shape:'ruins',surface:'limestone',materialRoughness:.93,ground:'concrete',reflection:.3,groundWetness:.3,seed:52311,noiseAmount:.6,normalStrength:.4}},
  quarry:{label:'Quarry',note:'Granite blocks and a modular wall',options:{...defaults,shape:'wall',surface:'granite',materialRoughness:.72,ground:'wood',reflection:.25,groundWetness:.2,seed:66314,roughness:.15,normalStrength:.5,noiseScale:2.8}},
  frozen:{label:'Frozen',note:'Crystal clusters on a reflective studio',options:{...defaults,shape:'crystals',surface:'ice',materialRoughness:.3,seed:72841,facets:.3,roughness:.22,bevel:.24,detail:.7,contrast:.7,reflection:.6,groundWetness:.55}},
};
export const shapeGroupFor = (id) => shapeGroups.find(group=>group.shapes.includes(id))?.id || 'natural';
