import { OPTICAL_PRESETS } from './optical.js';
import { WORKSHOP_SURFACES } from './workshop-materials.js';

// Presets are authored combinations of form, surface, and environment. Keep
// their seeds reproducible; the UI can assign a fresh seed on a repeated pick.
// Clone on every call so editing a path or lathe never mutates another preset.
export function createWorldPresets(defaults) {
  const result = {};
  const add = (id, label, note, category, swatch, authored = {}) => {
    result[id] = { label, note, category, swatch: [...swatch], options: structuredClone({ ...defaults, ...authored }) };
  };
  const finish = (id, overrides = {}) => ({
    surface: id,
    ...(WORKSHOP_SURFACES[id] ? { materialRoughness: WORKSHOP_SURFACES[id].roughness, ...WORKSHOP_SURFACES[id].defaults } : {}),
    ...(OPTICAL_PRESETS[id] || {}),
    ...overrides,
  });
  const rock = 'Rock & Ice', terrain = 'Terrain', architecture = 'Architecture';
  const paths = 'Paths', workshop = 'Workshop', wood = 'Wood & Furniture', ceramics = 'Glass & Ceramics';

  // Original six retain their parameters, with the retired grounds migrated.
  add('alpine', 'Alpine', 'Broken boulders and cold slate', rock, ['#86919d', '#5a687b', '#dce6ee']);
  add('desert', 'Desert', 'Layered red sandstone on dry sand', rock, ['#b95f3b', '#d89965', '#e3c796'], {
    shape: 'stack', surface: 'desert', materialRoughness: .90, ground: 'sand', reflection: 0, groundWetness: 0,
    seed: 72103, lighting: 'sunset', noiseScale: 2.2, noiseAmount: .65, normalStrength: .45,
  });
  add('volcanic', 'Volcanic', 'Polished black monolith over wet asphalt', rock, ['#171b24', '#46576f', '#8a9bad'], {
    shape: 'monolith', surface: 'obsidian', materialRoughness: .08, ground: 'asphalt', reflection: .8, groundWetness: .9,
    seed: 19423, noiseAmount: .22, normalStrength: .12, lighting: 'soft',
  });
  add('ruins', 'Ruins', 'Pale limestone courtyard fragments', architecture, ['#c5bca8', '#e0d6c3', '#8e8678'], {
    shape: 'ruins', surface: 'limestone', materialRoughness: .93, ground: 'travertine', reflection: .3,
    groundWetness: .3, seed: 52311, noiseAmount: .6, normalStrength: .4,
  });
  add('quarry', 'Quarry', 'Granite blocks and a modular wall', architecture, ['#9b9a94', '#696e74', '#b7b2a8'], {
    shape: 'wall', surface: 'granite', materialRoughness: .72, ground: 'slate', reflection: .25, groundWetness: .2,
    seed: 66314, roughness: .15, normalStrength: .5, noiseScale: 2.8,
  });
  add('frozen', 'Frozen', 'Crystal clusters on a reflective studio', rock, ['#72c9e8', '#c2eef5', '#388bbb'], {
    shape: 'crystals', surface: 'ice', materialRoughness: .3, seed: 72841, facets: .3, roughness: .22,
    bevel: .24, detail: .7, contrast: .7, reflection: .6, groundWetness: .55,
  });

  add('coastalCairn', 'Coastal cairn', 'Rounded granite trail stones on damp sand', rock, ['#a4a59f', '#657b88', '#cab88f'], {
    shape: 'cairn', surface: 'granite', materialRoughness: .67, seed: 30217, roughness: .22, bevel: .72,
    noiseScale: 3.4, noiseAmount: .38, normalStrength: .25, ground: 'sand', groundWetness: .32, reflection: .12, lighting: 'overcast',
  });
  add('chalkArch', 'Chalk arch', 'Pale coastal stone with broad worn edges', rock, ['#ded5bd', '#b8b7ac', '#d6c296'], {
    shape: 'arch', surface: 'limestone', materialRoughness: .96, seed: 43129, roughness: .28, bevel: .7,
    contrast: .35, noiseAmount: .35, normalStrength: .28, ground: 'sand', groundWetness: 0, reflection: 0, lighting: 'daylight',
  });
  add('cinderSpire', 'Cinder spire', 'Pitted volcanic rock with a cold edge light', rock, ['#2e3034', '#515967', '#8da5cb'], {
    shape: 'spire', surface: 'basalt', materialRoughness: .96, seed: 98213, facets: .72, roughness: .52, bevel: .18,
    noiseAmount: .76, normalStrength: .64, detail: .7, ground: 'earth', groundWetness: .12, reflection: .04, lighting: 'dramatic',
  });
  add('snowboundOutcrop', 'Snowbound outcrop', 'Snow rests on broad slate ledges', rock, ['#dfeaf3', '#7c8a9c', '#445a77'], {
    shape: 'stack', surface: 'stone', seed: 84531, snow: .82, facets: .42, roughness: .3, bevel: .45,
    noiseAmount: .32, normalStrength: .24, ground: 'slate', groundWetness: .4, reflection: .26, lighting: 'alpine',
  });
  add('obsidianShards', 'Obsidian shards', 'Sharp black glass catches warm and blue light', rock, ['#111522', '#3d536d', '#bf9770'], {
    shape: 'crystals', surface: 'obsidian', materialRoughness: .06, seed: 60913, facets: .2, roughness: .08, bevel: .1,
    noiseAmount: .13, normalStrength: .06, contrast: .72, ground: 'asphalt', groundWetness: .94, reflection: .82, lighting: 'dramatic',
  });
  add('glacierLedge', 'Glacier ledge', 'A low shelf of bright fractured blue ice', rock, ['#80d3eb', '#d0f4f8', '#3586b8'], {
    shape: 'slab', surface: 'ice', materialRoughness: .24, seed: 57139, facets: .38, roughness: .2, bevel: .25,
    contrast: .7, detail: .72, noiseAmount: .28, normalStrength: .18, ground: 'studio', reflection: .65, groundWetness: .55, lighting: 'daylight',
  });
  add('frostSentinel', 'Frost sentinel', 'Translucent frozen clouds inside a tapered pillar', rock, ['#91dbea', '#ceefff', '#436ca0'], {
    shape: 'taperedRockPillar', seed: 81347, facets: .38, roughness: .14, bevel: .2,
    ...finish('frozenGlass', { materialRoughness: .16, cloudiness: .32, internalCracks: .62, thickness: 2 }),
    noiseAmount: .18, normalStrength: .12, ground: 'slate', groundWetness: .48, reflection: .56, lighting: 'moonlight',
  });

  add('canyonWall', 'Canyon wall', 'Broad red strata under a high desert sun', terrain, ['#ad593a', '#d7925b', '#ebc48b'], {
    shape: 'cliffFace', surface: 'desert', materialRoughness: .94, seed: 32981, roughness: .4, bevel: .32,
    noiseScale: 2.6, noiseAmount: .72, normalStrength: .5, ground: 'sand', groundWetness: 0, reflection: 0, lighting: 'daylight',
  });
  add('basaltShelter', 'Basalt shelter', 'A dark cliff corner with crisp layered edges', terrain, ['#323b40', '#566572', '#8aa2ba'], {
    shape: 'cliffCorner', surface: 'basalt', materialRoughness: .93, seed: 94723, facets: .6, roughness: .31, bevel: .27,
    noiseAmount: .58, normalStrength: .52, ground: 'slate', groundWetness: .4, reflection: .2, lighting: 'overcast',
  });
  add('chalkTerraces', 'Chalk terraces', 'Wide pale steps on warm cut stone', terrain, ['#e2d5b6', '#c4b592', '#f0e5ce'], {
    shape: 'terracedCliff', surface: 'limestone', materialRoughness: .9, seed: 20543, roughness: .19, bevel: .6,
    contrast: .42, noiseAmount: .37, normalStrength: .3, ground: 'travertine', groundWetness: .1, reflection: .14, lighting: 'goldenHour',
  });
  add('stormOverhang', 'Storm overhang', 'A projecting slate crown above a shadowed recess', terrain, ['#526271', '#8896a1', '#313e4d'], {
    shape: 'overhangCliff', surface: 'stone', materialRoughness: .8, seed: 76031, roughness: .48, facets: .58, bevel: .28,
    contrast: .63, noiseAmount: .55, normalStrength: .48, ground: 'earth', groundWetness: .62, reflection: .12, lighting: 'overcast',
  });
  add('splitSentinel', 'Split sentinel', 'Two fissured granite towers with exposed grain', terrain, ['#b0a69d', '#736f76', '#d6c4ae'], {
    shape: 'splitRockPillar', surface: 'granite', materialRoughness: .76, seed: 68329, roughness: .35, facets: .62, bevel: .3,
    noiseScale: 3.2, noiseAmount: .52, normalStrength: .4, ground: 'earth', groundWetness: .15, reflection: .05, lighting: 'sunset',
  });
  add('mesaTower', 'Mesa tower', 'Stacked sandstone shelves lit from a low angle', terrain, ['#b35e39', '#d78b4f', '#f0c68a'], {
    shape: 'stackedRockPillar', surface: 'desert', materialRoughness: .92, seed: 45209, facets: .32, roughness: .42, bevel: .44,
    noiseScale: 1.6, noiseAmount: .68, normalStrength: .42, ground: 'sand', groundWetness: 0, reflection: 0, lighting: 'goldenHour',
  });
  add('lunarLanding', 'Lunar landing', 'A flat basalt hexagon with fine pitted detail', terrain, ['#303940', '#687485', '#a5bed8'], {
    shape: 'hexPlatform', surface: 'basalt', materialRoughness: .95, seed: 10483, roughness: .1, facets: .18, bevel: .26,
    noiseScale: 3.6, noiseAmount: .72, normalStrength: .55, ground: 'slate', groundWetness: .05, reflection: .08, lighting: 'moonlight',
  });
  add('tidalShelf', 'Tidal shelf', 'An elongated slate stepping ledge on wet sand', terrain, ['#6c7b85', '#a1b4b8', '#b9a47d'], {
    shape: 'ovalPlatform', surface: 'stone', materialRoughness: .52, seed: 39017, facets: .55, roughness: .2, bevel: .65,
    noiseAmount: .4, normalStrength: .23, ground: 'sand', groundWetness: .63, reflection: .26, lighting: 'overcast',
  });
  add('canyonSwitchback', 'Canyon switchback', 'Red stone climbs through a returning ramp', terrain, ['#b6653f', '#d9a474', '#80604c'], {
    shape: 'switchbackRamp', surface: 'desert', materialRoughness: .9, seed: 88103, roughness: .25, facets: .42, bevel: .4,
    noiseAmount: .57, normalStrength: .36, ground: 'sand', groundWetness: 0, reflection: 0, lighting: 'daylight',
  });
  add('gardenAscent', 'Garden ascent', 'A pale curved stair-like ramp on packed earth', terrain, ['#d7cdb5', '#a99b7d', '#706451'], {
    shape: 'curvedRamp', surface: 'limestone', materialRoughness: .89, seed: 61973, roughness: .12, facets: .4, bevel: .57,
    noiseAmount: .35, normalStrength: .22, ground: 'earth', groundWetness: .18, reflection: .05, lighting: 'soft',
  });

  add('abbeyGate', 'Abbey gate', 'A weathered pointed arch over pale stone paving', architecture, ['#d0c6b0', '#847f76', '#e7dbc1'], {
    shape: 'pointedArch', surface: 'limestone', materialRoughness: .91, seed: 29063, roughness: .2, bevel: .5,
    contrast: .45, noiseAmount: .46, normalStrength: .31, ground: 'travertine', reflection: .17, groundWetness: .12, lighting: 'overcast',
  });
  add('sandstonePortal', 'Sandstone portal', 'Warm wedge stones around a rounded opening', architecture, ['#c5754a', '#e1ac78', '#8f573e'], {
    shape: 'roundArch', surface: 'desert', materialRoughness: .88, seed: 55361, roughness: .18, bevel: .55,
    noiseAmount: .51, normalStrength: .3, ground: 'sand', groundWetness: 0, reflection: 0, lighting: 'goldenHour',
  });
  add('ashLintel', 'Ash lintel', 'A flat basalt header with readable stone joints', architecture, ['#373d42', '#657380', '#98a7b2'], {
    shape: 'flatArch', surface: 'basalt', materialRoughness: .88, seed: 90247, roughness: .1, bevel: .35,
    noiseAmount: .43, normalStrength: .35, ground: 'slate', groundWetness: .28, reflection: .18, lighting: 'daylight',
  });
  add('gardenBridge', 'Garden bridge', 'A low limestone crossing with worn deck stones', architecture, ['#dbceb0', '#9d927a', '#77715e'], {
    shape: 'bridge', surface: 'limestone', materialRoughness: .9, seed: 77239, roughness: .17, bevel: .58,
    noiseAmount: .38, normalStrength: .27, ground: 'earth', groundWetness: .27, reflection: .06, lighting: 'goldenHour',
  });
  add('bronzePillar', 'Bronze pillar', 'An architectural pier with aged metal recesses', architecture, ['#926a3f', '#bc945d', '#4b534c'], {
    shape: 'squareColumn', seed: 49633, roughness: .04, bevel: .37, ...finish('bronze', { metalWear: .38, metalBrushing: .16 }),
    noiseAmount: .32, normalStrength: .19, ground: 'hexTile', groundWetness: .22, reflection: .4, lighting: 'dramatic',
  });
  add('fallenCapital', 'Fallen capital', 'A broken slate column with a chipped crown', architecture, ['#7c8b98', '#b7c0c5', '#556370'], {
    shape: 'brokenColumn', surface: 'stone', materialRoughness: .86, seed: 34129, roughness: .32, facets: .65, bevel: .45,
    noiseAmount: .56, normalStrength: .42, ground: 'earth', groundWetness: .2, reflection: .06, lighting: 'alpine',
  });
  add('museumPlinth', 'Museum plinth', 'Crisp granite steps on polished terrazzo', architecture, ['#959593', '#c6c2b8', '#716f6e'], {
    shape: 'plinth', surface: 'granite', materialRoughness: .36, seed: 57043, roughness: .02, bevel: .3,
    noiseScale: 4.1, noiseAmount: .3, normalStrength: .1, ground: 'terrazzo', groundWetness: .15, reflection: .45, lighting: 'soft',
  });

  add('woodlandSteps', 'Woodland steps', 'Uneven slate stepping stones on a gentle bend', paths, ['#697b83', '#a0aca8', '#665e46'], {
    shape: 'steppingStonePath', surface: 'stone', seed: 41603, bevel: .65, noiseAmount: .48, normalStrength: .35,
    pathPoints: [{x:-2.8,z:-1},{x:-1.1,z:-.7},{x:.7,z:.8},{x:2.7,z:1.1}], pathWidth: 1.1,
    pathSpacing: .26, pathPieceSize: .64, pathThickness: .16, pathJitter: .6, pathRotation: .4, pathSmoothness: .8,
    ground: 'earth', groundWetness: .3, reflection: .03, lighting: 'overcast',
  });
  add('oldTownRoad', 'Old town road', 'Fitted granite cobbles with tight mortar gaps', paths, ['#929795', '#bcb9ae', '#626c72'], {
    shape: 'cobblePath', surface: 'granite', materialRoughness: .61, seed: 18371, bevel: .48,
    pathPoints: [{x:-3,z:-.8},{x:-1.3,z:-.5},{x:1.1,z:.6},{x:3,z:.75}], pathWidth: 1.6,
    pathSpacing: .065, pathPieceSize: .6, pathThickness: .13, pathJitter: .48, pathSmoothness: .7,
    noiseScale: 3.1, noiseAmount: .38, normalStrength: .28, ground: 'slate', groundWetness: .5, reflection: .3, lighting: 'daylight',
  });
  add('brickPromenade', 'Brick promenade', 'Warm running-bond paving follows a broad sweep', paths, ['#b86a4b', '#d59667', '#e3c59c'], {
    shape: 'brickPath', surface: 'desert', materialRoughness: .84, seed: 32479, bevel: .38,
    pathPoints: [{x:-2.7,z:-1},{x:-1,z:-.8},{x:1,z:.65},{x:2.8,z:.9}], pathWidth: 1.5,
    pathSpacing: .06, pathPieceSize: .7, pathThickness: .12, pathJitter: .2, pathSmoothness: .9,
    noiseAmount: .37, normalStrength: .22, ground: 'sand', groundWetness: .08, reflection: .04, lighting: 'goldenHour',
  });
  add('tidalBoardwalk', 'Tidal boardwalk', 'Silvered crosswise boards over damp coastal earth', paths, ['#969080', '#5c6768', '#bdb9a4'], {
    shape: 'plankPath', seed: 84061, bevel: .55, ...finish('weatheredWood', { woodGrainScale: 1.4, woodKnots: .5 }),
    pathPoints: [{x:-3,z:-.65},{x:-1,z:-.5},{x:1,z:.65},{x:3,z:.7}], pathWidth: 1.6,
    pathSpacing: .085, pathPieceSize: .6, pathThickness: .14, pathJitter: .35, pathRotation: .1, pathSmoothness: .75,
    noiseAmount: .35, normalStrength: .38, ground: 'earth', groundWetness: .5, reflection: .08, lighting: 'overcast',
  });
  add('oakWalkway', 'Oak walkway', 'Honey-colored boards form a neat garden crossing', paths, ['#be8c50', '#e2bb7b', '#766347'], {
    shape: 'plankPath', seed: 26183, bevel: .6, ...finish('oak', { woodGrainStrength: .72, woodKnots: .25 }),
    pathPoints: [{x:-2.6,z:-.3},{x:-.8,z:-.2},{x:1,z:.35},{x:2.6,z:.4}], pathWidth: 1.3,
    pathSpacing: .055, pathPieceSize: .52, pathThickness: .18, pathJitter: .12, pathRotation: .04, pathSmoothness: .9,
    noiseAmount: .22, normalStrength: .23, ground: 'earth', groundWetness: .12, reflection: .04, lighting: 'goldenHour',
  });
  add('boundaryCairns', 'Boundary cairns', 'A curving row of small granite trail markers', paths, ['#92948d', '#b5b1a0', '#71664e'], {
    shape: 'objectPath', surface: 'granite', materialRoughness: .8, seed: 65179, roughness: .2, bevel: .6,
    pathObject: 'cairn', pathObjectScale: .32, pathPoints: [{x:-3,z:-.9},{x:-1,z:-.7},{x:1,z:.7},{x:3,z:.9}],
    pathSpacing: .34, pathWidth: .7, pathJitter: .28, pathRotation: .18, pathAlign: true, pathSmoothness: .8,
    noiseAmount: .4, normalStrength: .3, ground: 'earth', groundWetness: .12, reflection: .03, lighting: 'daylight',
  });

  add('forgeHammer', 'Forge hammer', 'A worn cross-peen head with an oak grip', workshop, ['#4b5155', '#a98752', '#c0ab79'], {
    shape: 'hammer', seed: 27893, hammerHead: 'cross', handleLength: 1.18, headScale: 1.08, roughness: .08, bevel: .45,
    ...finish('iron', { metalWear: .46, metalBrushing: .17 }), noiseAmount: .4, normalStrength: .3,
    ground: 'slate', groundWetness: .18, reflection: .22, lighting: 'dramatic',
  });
  add('chefsKnife', 'Chef’s knife', 'A polished blade with fine wear and a dark grip', workshop, ['#d9e0e5', '#6e4730', '#a18c69'], {
    shape: 'knife', seed: 70931, knifeBlade: 'chef', handleLength: 1.1, headScale: 1.12, roughness: .025, bevel: .3,
    ...finish('chrome', { metalBrushing: .12, metalWear: .08 }), noiseAmount: .12, normalStrength: .05,
    ground: 'terrazzo', groundWetness: .12, reflection: .44, lighting: 'soft',
  });
  add('campHatchet', 'Camp hatchet', 'A weathered iron cutting head with a long wood handle', workshop, ['#59615e', '#b68a52', '#81714d'], {
    shape: 'hatchet', seed: 45913, handleLength: 1.32, headScale: 1.12, roughness: .12, bevel: .55,
    ...finish('iron', { materialRoughness: .61, metalWear: .52, metalBrushing: .1 }), noiseAmount: .46, normalStrength: .32,
    ground: 'earth', groundWetness: .16, reflection: .03, lighting: 'daylight',
  });
  add('copperPipe', 'Copper pipe', 'An open copper tube with blue-green patina', workshop, ['#b57a57', '#638c83', '#deac7d'], {
    shape: 'metalTube', seed: 93241, wallThickness: .13, latheSegments: 48, roughness: .025, bevel: .38,
    ...finish('copper', { metalWear: .42, metalBrushing: .5 }), noiseAmount: .35, normalStrength: .19,
    ground: 'slate', groundWetness: .2, reflection: .32, lighting: 'soft',
  });
  add('clockworkGear', 'Clockwork gear', 'Worn brass teeth and a clean open hub', workshop, ['#c39a51', '#72582f', '#e5c887'], {
    shape: 'gear', seed: 36857, roughness: .035, bevel: .32, ...finish('brass', { metalWear: .27, metalBrushing: .36 }),
    noiseAmount: .24, normalStrength: .14, ground: 'hexTile', groundWetness: .2, reflection: .38, lighting: 'goldenHour',
  });
  add('machinedSteel', 'Machined steel', 'Satin plate stock with clear directional brushing', workshop, ['#a2b4c2', '#dae1e4', '#6e8394'], {
    shape: 'metalPlate', seed: 58013, roughness: .01, bevel: .25, ...finish('brushedSteel', { metalBrushing: .92, metalWear: .04 }),
    noiseAmount: .15, normalStrength: .24, ground: 'studio', groundWetness: .35, reflection: .5, lighting: 'daylight',
  });
  add('goldenRing', 'Golden ring', 'A broad polished gold ring on a dark reflective surface', workshop, ['#d8ab48', '#f0d282', '#74582c'], {
    shape: 'metalRing', seed: 11743, wallThickness: .15, latheSegments: 64, roughness: .01, bevel: .4,
    ...finish('gold', { metalBrushing: .14, metalWear: .025, materialRoughness: .13 }), noiseAmount: .09, normalStrength: .04,
    ground: 'asphalt', groundWetness: .92, reflection: .8, lighting: 'dramatic',
  });
  add('aluminumBeam', 'Aluminum beam', 'A bright structural section with restrained machining marks', workshop, ['#c1ced6', '#edf0ed', '#8295a5'], {
    shape: 'iBeam', seed: 62851, roughness: .015, bevel: .24, ...finish('aluminum', { metalBrushing: .74, metalWear: .04 }),
    noiseAmount: .12, normalStrength: .16, ground: 'hexTile', groundWetness: .1, reflection: .26, lighting: 'overcast',
  });

  add('honeyBench', 'Honey bench', 'Chunky oak seating with soft worn edges', wood, ['#b98549', '#e1b777', '#775333'], {
    shape: 'bench', seed: 35471, roughness: .12, bevel: .82, ...finish('oak', { woodGrainScale: 1.5, woodGrainStrength: .76, woodKnots: .45 }),
    noiseAmount: .3, normalStrength: .3, ground: 'earth', groundWetness: .1, reflection: .04, lighting: 'goldenHour',
  });
  add('walnutTable', 'Walnut table', 'A dark timber table with a softly polished top', wood, ['#593824', '#9a6b43', '#c39767'], {
    shape: 'table', seed: 86029, roughness: .045, bevel: .64, ...finish('walnut', { materialRoughness: .35, woodGrainScale: 2.5, woodKnots: .18 }),
    noiseAmount: .2, normalStrength: .16, ground: 'travertine', groundWetness: .1, reflection: .24, lighting: 'soft',
  });
  add('driftwoodChair', 'Driftwood chair', 'Silvered grain and rounded edges on a framed chair', wood, ['#968d79', '#c6bea8', '#666b62'], {
    shape: 'chair', seed: 50791, roughness: .18, bevel: .74, ...finish('weatheredWood', { woodGrainScale: 1.4, woodGrainStrength: .9, woodWarmth: .2 }),
    noiseAmount: .38, normalStrength: .4, ground: 'sand', groundWetness: .08, reflection: .02, lighting: 'overcast',
  });
  add('tavernStool', 'Tavern stool', 'A round oak seat with dark grain and worn edges', wood, ['#ad7740', '#d5a669', '#704b2d'], {
    shape: 'stool', seed: 23687, roughness: .1, bevel: .7, ...finish('oak', { materialRoughness: .48, woodWarmth: .83, woodKnots: .55, woodGrainScale: 1.8 }),
    noiseAmount: .32, normalStrength: .27, ground: 'slate', groundWetness: .12, reflection: .16, lighting: 'sunset',
  });
  add('turnedWalnut', 'Turned walnut', 'A tall wooden candlestick with warm brass fittings', wood, ['#6e462c', '#bb9257', '#d7b875'], {
    shape: 'woodenCandlestick', seed: 67423, roughness: .03, bevel: .5, latheHeight: 1.24, latheWidth: .9, latheNeck: .72,
    latheSegments: 48, ...finish('walnut', { materialRoughness: .38, woodGrainScale: 2.2, woodKnots: .12 }),
    noiseAmount: .17, normalStrength: .15, ground: 'travertine', groundWetness: .1, reflection: .28, lighting: 'goldenHour',
  });

  add('clearVessel', 'Clear vessel', 'A thin clear glass vase with a narrow neck', ceramics, ['#d9eee9', '#abcbd1', '#657d91'], {
    shape: 'vase', seed: 91093, roughness: .01, bevel: .22, wallThickness: .055, latheHeight: 1.25, latheBelly: 1.15,
    latheNeck: .72, latheSegments: 64, ...finish('glass', { materialRoughness: .055, thickness: .6, cloudiness: .015, inclusions: .025 }),
    noiseAmount: .06, normalStrength: .025, ground: 'hexTile', groundWetness: .18, reflection: .42, lighting: 'daylight',
  });
  add('amethystCluster', 'Amethyst cluster', 'Purple quartz with mineral flecks and rainbow edges', ceramics, ['#a98aca', '#d6bbec', '#75649d'], {
    shape: 'crystals', seed: 72091, facets: .24, roughness: .08, bevel: .14,
    ...finish('quartz', { materialRoughness: .13, absorptionColor: '#bf91e7', inclusions: .46, internalCracks: .28, dispersion: .45 }),
    noiseAmount: .18, normalStrength: .1, ground: 'studio', groundWetness: .45, reflection: .58, lighting: 'soft',
  });
  add('amberOrb', 'Amber orb', 'Honey glass with suspended flecks and a warm interior', ceramics, ['#d7973b', '#f0c77a', '#8b6333'], {
    shape: 'sphere', seed: 48571, facets: .72, roughness: .015, bevel: .5,
    ...finish('glass', { materialRoughness: .085, thickness: 2.1, absorptionColor: '#e7a64f', attenuationDistance: 1.9, inclusions: .22, inclusionScale: 3.6, cloudiness: .055, dispersion: .2 }),
    noiseAmount: .1, normalStrength: .035, ground: 'travertine', groundWetness: .14, reflection: .4, lighting: 'soft',
  });
  add('celadonJar', 'Celadon jar', 'Pooled jade glaze over a full rounded vessel', ceramics, ['#a7c1ac', '#d1dcca', '#718d7e'], {
    shape: 'jar', seed: 59407, roughness: .025, bevel: .45, wallThickness: .095, latheBelly: 1.15, latheNeck: .82,
    latheLip: 1.12, latheSegments: 48, ...finish('celadon', { ceramicGlaze: .92, ceramicSpeckle: .14 }),
    noiseAmount: .18, normalStrength: .12, ground: 'terrazzo', groundWetness: .12, reflection: .32, lighting: 'soft',
  });
  add('porcelainBowl', 'Porcelain bowl', 'An ivory bowl with a broad open rim and glossy glaze', ceramics, ['#eee5d2', '#fff5df', '#b5c6cb'], {
    shape: 'bowl', seed: 14639, roughness: .015, bevel: .6, wallThickness: .065, latheWidth: 1.15, latheHeight: .86,
    latheLip: 1.06, latheSegments: 64, ...finish('porcelain', { ceramicGlaze: .98, ceramicSpeckle: .035 }),
    noiseAmount: .1, normalStrength: .055, ground: 'slate', groundWetness: .2, reflection: .32, lighting: 'daylight',
  });
  add('terracottaPlanter', 'Terracotta planter', 'Unglazed fired clay with a thick rim and thrown rings', ceramics, ['#b76b47', '#d89161', '#885238'], {
    shape: 'planter', seed: 79843, roughness: .09, bevel: .55, wallThickness: .15, latheWidth: 1.12, latheLip: 1.18,
    latheSegments: 40, ...finish('terracotta', { ceramicGlaze: .025, ceramicSpeckle: .63 }),
    noiseAmount: .4, normalStrength: .32, ground: 'earth', groundWetness: .08, reflection: .02, lighting: 'goldenHour',
  });
  add('stonewareGoblet', 'Stoneware goblet', 'A softly speckled drinking vessel on a turned foot', ceramics, ['#bdb198', '#e0d3b7', '#867863'], {
    shape: 'goblet', seed: 38749, roughness: .045, bevel: .48, wallThickness: .08, latheHeight: .92, latheBelly: 1.12,
    latheSegments: 48, ...finish('stoneware', { ceramicGlaze: .38, ceramicSpeckle: .82 }),
    noiseAmount: .3, normalStrength: .21, ground: 'travertine', groundWetness: .08, reflection: .17, lighting: 'overcast',
  });

  return result;
}
