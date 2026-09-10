# Rock Lab

A Three.js asset studio for seeded geometry, stylized materials, surface relief, and reflective ground.

## Run

```sh
npm install
npm run dev -- --port 5207
```

Open [Rock Lab](http://127.0.0.1:5207/). This project uses a strict port. `npm run build` produces the static app; `npm run verify` checks geometry, materials, and catalog consistency. `npm run verify:fracture` exercises actual fracture geometry, options, and physics. [Open directly in destruction mode](http://127.0.0.1:5207/?fracture=1).

## Shape families and sets

The **Shape** inspector opens to a scrollable **All** library. Search by object name or description, or filter by family. The selected row stays highlighted, and geometry controls remain below the bounded list.

| Family | Forms | Intended uses |
| --- | --- | --- |
| Natural | Boulder, outcrop, ledge, spire, crystals, arch | Terrain accents, cover, cliff silhouettes, icy encounters |
| Primitives | Block, brick, sphere, cylinder, wedge, soft block, small/medium/large blocks, low/steep/corner ramps, platform | Material studies, modular props, collision-friendly building pieces |
| Structures | Block wall, monolith, columns, stairs, ruins, cairn | Running-bond masonry, landmarks, volcanic columns, route markers, ruins kits |
| Architecture | Round/pointed/flat arches, small bridge, round/square/broken columns, plinth, doorway | Openings, crossings, architectural supports, and display pieces |
| Furniture | Bench, table, chair, stool | Assembled seating and table props with solid component parts |

There are **38 objects**, including a [20-object modular expansion](OBJECT-LIBRARY.md). The new kit uses shared units; its small, medium, and large blocks have nominal sides of 0.8, 1.5, and 2.5 units before edge wear or displacement. Existing rock forms keep their original presentation scale. These are geometry presets and can use any current material; they do not introduce a procedural wood material.

Six **world presets** combine shapes, materials, lighting, and ground: Alpine, Desert, Volcanic, Ruins, Quarry, and Frozen. These are starting recipes. Every component can be changed independently afterward. The Structures family contains actual multi-piece assemblies, not thumbnails of suggested assets.

The seed, plane cuts/detail, irregularity/distortion, and bevel controls generate the geometry. **Variations** compares five seeds, incremented by 137 with wrapping at 999999. Click an asset to keep its seed. Drag to orbit and scroll to zoom.

## Materials and noise

The **Material** inspector includes ten materials in two families. **Stone & ice** contains the original seven:

- Alpine slate: cool stone with broad painted planes and creases.
- Glacier ice: opaque cyan planes and pale internal fracture patterns.
- Red sandstone: rust-red sediment layers and warmer bands.
- Limestone: pale chalk and soft pores.
- Granite: mineral grains and mottled color.
- Basalt: dark volcanic stone and pitted relief.
- Black obsidian: a dielectric black surface with low roughness and bright environment highlights.

**Glass & crystal** adds **Clear glass**, **Included quartz**, and **Translucent ice**. These use physical transmission, refraction, absorption, dispersion, and procedural internal detail. They are separate from Glacier ice. The [research and controls guide](../TRANSLUCENT-MATERIALS.md) compares the shader approaches and explains their rendering limits.

Selecting a material restores its authored base roughness. **Surface roughness** is then an absolute PBR control: low values are polished, high values are matte. Rock metalness stays zero.

**Texture noise scale**, **Noise amount**, **Normal relief**, **Cracks & grain**, **Color contrast**, and **Snow dusting** update shader uniforms. They do not rebuild the geometry or require texture downloads. The normal relief comes from procedural height derivatives, retaining ordinary Three.js lights and shadows.

**Material / Normal / Height / Roughness** are live channel diagnostics. Normal displays world-space normals, not a tangent-space texture ready for export. Height shows the material's surface detail field; it is distinct from the geometry displacement field. None of these views bake or download texture maps.

## Tap destruction with three-pinata

Open **Fracture** and enable **Tap destruction**. Tap or click a part to fracture it, then tap a fragment to break it again. Dragging continues to orbit the camera. **Break asset** fractures the assembly, **Pause debris** freezes the simulation for material inspection, and **Reset destruction** restores the intact source. Selecting a different shape or seed creates a fresh test. Variations and turntable return to asset inspection.

The **Material** inspector contains **Outer** and **Inner** tabs. Each has independent material style, tint/color blend, roughness, snow, noise, normal relief, optical properties, and diagnostic channels. Outer covers the original skin; Inner covers newly exposed cut faces. Inner UV scale and offset affect the procedural cut-face pattern on subsequent fractures.

| Control group | Options |
| --- | --- |
| Fracture | Voronoi, simple random planes, or a single plane slice; fragments per hit; reproducible fracture seed |
| Voronoi | Full 3D or projected 2.5D; projection axis or custom normal; tap-focused or custom local impact point and radius |
| Advanced pattern | Explicit local seed points; approximate neighbors with overlap tradeoff |
| Simple planes | X, Y, and Z fracture-axis selection |
| Slicing | Plane normal, origin, and local/world coordinate space |
| Cut faces | Inner UV scale and offset |
| Destruction physics | Impact impulse, gravity, friction, restitution, repeat-fracture depth, and live-piece budget |

The integration uses **@dgreenheck/three-pinata 2.0.1** for real fracture geometry and **Rapier 0.20.0** for rigid bodies, ground collisions, and fragment collisions. A worker performs fracture calculations, leaving the main thread available for the UI. Physics remains on the main thread. Fracture-pattern settings apply to the next hit; reset for direct comparisons. Material and physics controls update the current preview.

Assembly parts are processed as separate closed volumes, rather than merging overlapping blocks into a non-manifold mesh. Only the selected part is fractured on a tap; untouched parts remain fixed. The demo allows 2–48 requested fragments per hit, 1–4 fracture generations, and up to 160 live pieces (120 by default). Worker jobs have a 15-second timeout and results over 100,000 triangles are rejected while retaining the source piece. Convex-hull collision shapes approximate concave displaced pieces. Approximate Voronoi can create overlapping fragments. The source geometry and shared material instances are retained for reset.

Ground planar reflections include the current debris. Turning reflections off avoids the additional reflection render. This integration does not establish physical-phone frame-time or thermal performance.

## Sound effects

The public destruction preview uses original synthesized rock, concrete, glass, and wood effects. Successful fractures play a break sound; falling fragments trigger quieter impacts based on collision strength. Reset destruction plays Restore's short restore chime.

Use **Fracture → Sound effects** for volume and sound material. **Match asset** chooses glass for ice, quartz, clear glass, and obsidian; concrete for blocks, bricks, and block walls; and rock for other stone forms. A manual override lets you audition any of the four families. The header's speaker button mutes sound at any time. Sound settings apply to the preview session.

Each sampled event has two alternating variants. Voice limits and contact cooldowns keep fragment piles from producing an uncontrolled burst of sounds. Audio begins after a click or tap, stops when muted or the page is hidden, and does not queue old events for later playback. Asset regeneration, pausing debris, and disabling destruction stop active sounds.

The sixteen public WAVs are generated by `scripts/generate-public-audio.mjs`. Their synthesis and hashes are recorded in `docs/audio-provenance.json`. Optional licensed recordings can be used locally; production builds always use the public bank. See `THIRD_PARTY_NOTICES.md`.

## Real geometry displacement

The **Shape** inspector contains **Displacement** and an independent **Shape noise scale**. Nonzero displacement subdivides the mesh within a 36,000-triangle budget, moves vertices with a coherent seeded field, recalculates normals, and preserves flat grounding. This changes silhouettes and cast shadows. The same spatial field moves duplicate boundary vertices consistently to avoid opening seams.

Displacement zero uses the cheaper original meshes. Nonzero displacement rebuilds geometry when its settings change; it is not evaluated every animation frame. Five displaced variations can take longer to regenerate. The triangle counter and generation timing show the current cost. This is not physical-device performance validation.

## Ground and reflections

The **Ground** inspector contains exactly five surfaces: **Studio, Wet asphalt, Concrete, Sand, Wooden planks**. Each has procedural color, roughness, and normal relief, with its own wetness response. Texture scale changes the size of its pattern.

Reflections use an actual planar virtual-camera render, sampled into the PBR floor material. Surface roughness and wetness mask and soften the result. **Reflection strength = 0** skips the additional scene render. Dry sand defaults to zero reflection; enable wetness and reflection for a wet-sand study. Reflection render targets are bounded to 1024 pixels per dimension.

When **Wet asphalt** is selected, the Ground inspector adds **Asphalt roughness**, **Roughness breakup**, **Normal strength**, **Normal detail scale**, **Reflection distortion**, **Puddle ripples**, and **Ripple speed**. Roughness sets the wet surface finish, with wetness blending toward dry asphalt. The normal field adds aggregate and ripple detail to lighting and distorts the planar reflection. Set normal strength to zero for a flat surface, reflection distortion to zero for an undistorted mirror, or ripple speed to zero to freeze the current ripple pattern. **Reset asphalt detail** restores these seven controls without changing the asset.

These are GPU procedural normals derived from a height field, with live uniform controls. No normal-map image is regenerated or downloaded. Ripples animate only on the asphalt surface; their amplitude is concentrated in wet patches. Recipe JSON includes the seven settings, and older recipes receive defaults. The other ground types retain their existing materials.

This is an approximation of rough planar reflections. It is not ray tracing, and the rock surfaces use a studio environment for their own glossy reflections. Original Glacier ice remains opaque; the separate Glass & crystal family supports transmission. Snow is still a surface coating without cap thickness or icicles.

## Which maps should a game asset use?

| Channel | What it contributes | Recommendation |
| --- | --- | --- |
| Base color | Material color without lighting | Standard export channel; use sRGB |
| Normal | Pores, grain, chips, small cracks | Usually the first added detail map; does not add vertices or change the silhouette |
| Roughness | Matte/polished variation, wetness, glassy highlights | Essential for distinguishing basalt, ice, and obsidian |
| Ambient occlusion | Local crevices and contact detail | Useful baked from a specific assembled mesh; it does not replace dynamic shadows |
| Height/displacement | Height field for vertex displacement or a chosen parallax technique | Reserve actual displacement for detail that needs geometry and appropriate mesh density |
| Metalness | Metal versus dielectric response | Keep ordinary rock, sand, concrete, wood, and obsidian at zero |

The lab computes color, height-derived normals, and roughness procedurally. For a shipped game, a practical path is **generate the mesh → create suitable UVs → bake base color, tangent normal, roughness, and optional AO → package the mesh and PBR maps**. The current UVs are native primitive or projected coordinates, not a unique bake atlas. Build an atlas for mesh-specific baking, or deliberately use reusable tiling materials. Use OpenGL/+Y tangent normal maps for glTF and non-color data for normal/roughness/AO/height textures.

A normal map changes lighting, while displacement moves vertices. Three's GPU displacement map also needs enough existing vertices and a matching normal map for the changed surface; this lab's CPU path can recompute its normals directly. For mobile and distant objects, prioritize geometry silhouettes, baked normal detail, mesh reuse, and appropriate LOD before increasing displacement density.

## Save, restore, and reuse

**File → Save recipe** downloads a version 3 JSON recipe containing shape, seed, geometry, independent outer/inner materials, channel views, lighting, ground, and fracture settings. Fracture recipes restore the intact asset, ready for a new test; they do not serialize moving debris. **File → Load recipe** or drag-and-drop restores it. Version 1 and 2 recipes are accepted with defaults for newly introduced controls. Camera position, turntable, wireframe, active inspector, and comparison mode are not serialized.

**File → Save image** downloads the current viewport, including floor and reflections, as a PNG. The app currently exports recipes and PNGs. It does not export GLB or baked texture maps.

The reusable modules are `src/geometry.js`, `src/material.js`, `src/ground.js`, and `src/fracture.js`. Fracture worker, attribute recovery, and panel adapters live beside them. `src/catalog.js` contains UI labels and curated presets.

```js
import { buildAsset, disposeAsset } from './geometry.js';
import { createRockMaterial, updateRockMaterial } from './material.js';
import { createGround } from './ground.js';

// Existing Three.js WebGL renderer and scene, with lights and environment set up.
const options = {
  shape: 'wall', seed: 66314,
  facets: 0.5, roughness: 0.15, bevel: 0.5,
  displacement: 0, geometryNoiseScale: 2,
  surface: 'granite', materialRoughness: 0.72,
  noiseScale: 2.8, noiseAmount: 0.45, normalStrength: 0.5,
};
const material = createRockMaterial(options);
const asset = buildAsset(options, material);
scene.add(asset);

const floor = createGround(renderer, scene, {
  ground: 'asphalt', reflection: 0.7, groundWetness: 0.85, groundScale: 1,
});
scene.add(floor.group);
floor.resize(width, height);
updateRockMaterial(material, { normalStrength: 0.2 });

// When replacing or removing these objects:
scene.remove(asset);
disposeAsset(asset); // Keeps the caller-owned shared material.
material.dispose();
floor.dispose();
```

These material hooks and planar reflections target `WebGLRenderer`. Custom GLSL does not automatically transfer into standard glTF. A Blender alternative is Geometry Nodes → realize/evaluate geometry → UV unwrap → Cycles texture baking → export-compatible PBR material → GLB. Inspect the exported result again in the game lighting.

## References

- [Three-pinata](https://github.com/dgreenheck/three-pinata): fracture, slice, dual-material APIs, and watertight-mesh requirements.
- [Rapier JavaScript](https://rapier.rs/docs/user_guides/javascript/getting_started_js/): rigid-body physics.

- [Three.js MeshStandardMaterial](https://threejs.org/docs/pages/MeshStandardMaterial.html): normal, roughness, displacement, and material channels.
- [Three.js Reflector](https://threejs.org/docs/pages/Reflector.html): planar reflection addon for WebGL.
- [Three.js material customization](https://threejs.org/docs/pages/Material.html#onBeforeCompile): shader hooks and program caching.
- [Blender Cycles baking](https://docs.blender.org/manual/en/latest/render/cycles/baking.html): texture bake targets and passes.
- [Blender glTF export](https://docs.blender.org/manual/en/5.1/addons/import_export/scene_gltf2.html): portable material channels and tangent normals.
