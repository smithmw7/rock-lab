# Validation history

Checked September 9, 2026.

## Terrain and spline paths

- Added 16 terrain forms and five path styles for 79 total objects; the existing 25-material catalog is unchanged. Path scatter offers all 74 non-path source objects. Recipes now use version 5 and accept versions 1–5.
- `npm run verify:terrain` passes 224 geometry cases across 790 meshes and 1,533,780 welded edges, with positive volumes, safe normals, grounding, genuine convex support intersections, and broad flat platform crowns. Maximum tested terrain geometry is 34,560 triangles. Every terrain form also passes actual Pinata fracture and Rapier stepping.
- All 58 prior objects retain identical geometry attributes and mesh transforms in 232 comparisons covering two seeds and displacement off/on. The terrain-only hull cleanup threshold removes tiny bevel slivers before subdivision without changing the older geometry paths.
- Menu QA and parameter-tooltip QA pass after the Path inspector integration. All 125 parameter labels have help, with no tooltips on action buttons, tabs, or cards. These checks are desktop and emulated narrow-screen browser checks.
- `npm run verify:paths` passes 98 cases across 5,298 meshes, 506,508 welded edges, and 4,720 fitted or scattered footprints. Maximum tested path geometry is 76,800 triangles. The original kit's 80 extreme cases and workshop's 114 cases also pass. Path and terrain checks run in Pages CI.
- `npm run verify` passes 474 baseline, 158 displacement, and 10 dense-path/recursion cases across all 79 objects. The final fracture suite passes 90 actual Pinata/Rapier cases, including independent path pieces and composite material preservation. The deliberate approximation test retains its expected warning.
- `npm run qa:paths` passes 14 browser groups on frozen source: all 21 new forms rendered and visually inspected, repeat-generation resource reuse, mouse/keyboard/touch point editing, layout controls, seeded determinism, separate composite materials, native v5 save/load and v4 migration, visible budgets, real one-piece pointer fracture, and exact reset. No browser errors or warnings were recorded.
- Regression coverage confirms that deleting to two points disables a closed loop, coincident adjacent edits are rejected without replacing the route, a valid 0.05-unit empty paving layout retains a finite camera and explains how to place pieces, and switching into 128 repeated blocks during active destruction raises the live limit from 120 to 160.
- The standard web-game client renders the stepping-stone route with matching text state. Root review includes its screenshot, the terrain/path contact sheet, the revised cobble and plank layouts, and the touch editor. These are desktop and emulated-touch checks; physical-device performance remains unverified.
- Production build and publication checks pass. The built app was served under an actual `/rock-lab/` prefix; its public audio, worker, physics, pointer fracture/reset, recipe download, and relative asset URLs pass with no browser errors. Private recordings and reference artwork remain excluded. Vite retains its existing large-chunk warning.

## Composite workshop and spline lathe

- Added 20 objects for 58 total and 15 materials for 25 total. The new collections include three composite tools, eight metal primitives, and nine lathe objects. Four hammer heads and three knife blades change actual geometry.
- `npm run verify` passes 348 base cases and 116 displacement cases across all 58 shapes, plus 25-material catalog/native-property checks. Original 38 shapes preserve identical attributes and transforms in 152 seeded/displacement comparisons.
- `npm run verify:workshop` passes 114 extreme combinations, 256 meshes, and 2,203,152 welded edges. Every edge has two oppositely oriented incident faces. Checks cover positive volume, all variants, alternating extreme profile points, cavity floors, open rims and bores, and exterior-only material groups. It runs in Pages CI.
- `npm run verify:fracture` passes 69 actual Pinata/Rapier cases. Three shared material pairs survive two cut generations, live edits, rebinding during a pending cut, resolver failure, reset, re-enable, and slot-aware collision events. Shared materials are never disposed by the controller.
- `npm run qa:workshop` passes real rendering of all 20 objects and 15 new finishes; every new material control changes GPU pixels without rebuilding geometry. Warmed geometry, texture, and shader counts remain stable across repeated finish edits. The prior 10 surfaces retain exact pixels in an isolated warmed-shader parity harness.
- Mouse dragging, keyboard editing, point/radius inputs, and 390×844 touch dragging change the lathe geometry. All eight lathe sliders change geometry. Actual v4 file download/import restores custom profiles and all composite material pairs. Real handle pointer cuts preserve the role's exterior/interior through generation two and reset.
- The recipe compatibility browser suite imports actual v1, v2, and v3 JSON files, retaining prior shape/material/fracture settings and supplying the new workshop defaults. The v4 export also round-trips through the native file picker.
- The old modular-library browser suite still passes all 12 groups with the new 58-object counts. Menu checks and all 110 parameter-label tooltips pass at desktop and narrow widths; action buttons have no tooltip help. The standard web-game client renders a steel/oak/brass hammer with matching text state. Screenshots and both workshop contact sheets were visually inspected.
- Workshop browser runs record no JavaScript errors or warnings. Production build and private-asset exclusion checks pass. Vite retains its existing large-chunk warning. An extra zero-wear vase fracture with seed 701 returned fragments with an upstream triangulation warning; the main 69-case suite passes with only its existing explicit approximation warning.
- Validation is desktop/browser based. Convex debris colliders approximate concavity; metal uses rigid fracture rather than bending, and wood cuts do not model directional splitting. Older baked furniture meshes use object-wide grain coordinates. GLB and baked texture export remain outside this change.


## Scrolling object library and modular kit

- Added 20 generated objects for 38 total: seven primitives, nine architecture forms, and four furniture pieces. Every catalog entry has a name, icon, and description in the scrolling library.
- Geometry verification passes 228 baseline and 76 displacement cases across all 38 shapes. Maximum tested geometry remains 34,752 triangles. All 36 snapshots for the original 18 forms retain identical attributes and transforms.
- Actual three-pinata/Rapier verification passes 48 cases across all 38 forms. New assemblies are made from separate closed convex pieces with verified support connections. Extreme wear initially exposed microscopic holes on thin parts; the new kit now rebuilds clean closed hulls before upload and preserves face/bevel metadata.
- `npm run verify:kit` independently audits 80 extreme combinations, 476 meshes, and 580,128 welded edges. Each edge has exactly two incident triangles. These checks include minimum/maximum detail, wear, bevel, and displacement with high-frequency shape noise. The check runs in Pages CI.
- `npm run qa:objects` passes 12 browser groups on frozen source: all 20 new objects rendered and captured, nominal 0.8/1.5/2.5-unit block dimensions, actual triangle-ray aperture checks, category counts, search/clear/empty state, list scrolling independent of the inspector, keyboard focus without unwanted generation, actual chair recipe download/import, five distinct seeded variations, and tap/reset on round arch, chair, and bridge.
- Each browser tap created six fragments; reset restored the exact source geometry signature. The chair recipe restored its independent outer/inner materials and revealed its selected row after loading from another inspector.
- At 390×844, actual touch swipes scrolled the library and taps selected furniture; the page had no horizontal overflow. All 20 final object screenshots, the variations view, fracture captures, and mobile controls were visually inspected. No browser errors or warnings were recorded.
- Existing menu QA still passes save/load, image download, keyboard/dismissal, view actions, help, and mobile layout. Tooltip QA passes 87 labels, including search help, with no tooltips on action buttons, cards, or tabs.

## Translucent materials: current evidence

- Research compared native Three physical transmission, Drei MeshTransmissionMaterial, and geometry-aware MeshRefractionMaterial. The choice, sources, controls, and rendering limits are in `TRANSLUCENT-MATERIALS.md`.
- `scripts/qa-optical.mjs` passes 17 check groups, including all three new presets and eleven optical controls. It uses actual browser input, deterministic GPU image comparisons, orbit input, and real recipe download/file-picker import. Evidence is in `output/optical/report.json` and the adjacent PNG/JSON files.
- Pre-change images and raw GPU buffers were captured for the original seven materials. Original Glacier ice, sandstone, and granite are pixel-identical after the change. The other four show only one or two individual channel-value rounding differences over roughly 871,000 pixels. Optical settings have no effect on their output.
- All eleven controls visibly change the asset. In the fixed sphere study, transmission changed 164,633 asset pixels, IOR changed 147,345, dispersion changed 3,975, and internal cracks changed 66,771. Included features were inspected at two camera angles.
- After native shader variants warm up, repeated edits retain two geometries, thirteen programs, eleven geometry generations, and the same texture count. Numeric edits do not rebuild geometry. Zero/positive toggles of native transmission, dispersion, or iridescence may select a cached shader variant.
- Actual recipe JSON restores eleven independent outer and inner optical settings, including absorption colors. Separate browser review verified legacy defaults, reset actions, and the 7/3 material-family filtering.
- A real pointer tap fractured a quartz sphere into four fragments with 2,190 triangles and no fracture failure. Translucent ice and limestone could independently replace the exposed interior while keeping the quartz exterior. Native transmission and procedural volume shaders recorded no JavaScript or shader errors.
- `npm run verify` passes all 108 baseline and 36 displacement cases across eighteen shapes, now with ten material entries. `npm run verify:fracture` passes all twenty-five cases. The fracture approximation warning remains expected when testing the explicit approximation option.
- In-app inspection covered clear glass with visible plank refraction, included quartz, and the complete optical controls at 390 × 844. Preset and fracture screenshots were visually reviewed. This establishes browser rendering and responsive layout, not physical-device performance.
- Final production build passes. The existing Vite warning for chunks over 500 kB remains. Native transmission adds rendering passes; no frame-rate guarantee is made from these functional checks.
- Fixed the floor reflection hook restoring canvas logical dimensions into smaller transmission buffers. `scripts/qa-refraction-viewport.mjs` passes all six combinations of DPR 1/1.75 and transmission resolution 0.5/0.75/1, preserving actual viewport, scissor, and scissor-test state. Custom offscreen and canvas scissors also pass, with no WebGL errors. The complete optical and asphalt browser suites passed again after this fix; evidence is in `output/optical/viewport-report.json` and both refreshed reports.

## Asphalt controls: current evidence

- `node scripts/qa-asphalt.mjs` passes all 16 targeted checks using the live app, real input events, deterministic renderer stepping, and GPU pixel comparisons. Report, image pairs, and recipe fixtures are in `output/asphalt/`.
- All seven controls visibly affect the asphalt. Roughness changes reflection softness; normal strength/detail scale, reflection distortion, and puddle ripple amount/speed affect the surface and reflected image. Low/high roughness changed 258,593 ground pixels in the fixed test view.
- Ripple speed zero holds the phase and rendered pixels exactly still. Positive speed animates them. Normal strength zero removes relief and normal-driven reflection distortion; distortion zero retains lighting normals. Disabling reflections stops reflection passes.
- Slider changes retain one asset generation, four shader programs, five geometries, and material version zero throughout the check. No JavaScript or shader errors were recorded.
- Studio, concrete, sand, and wood produced identical GPU pixels before and after changing every asphalt-specific control from minimum to maximum.
- Actual JSON download and file-picker import restored all seven values. A v3 recipe without those fields received the new defaults. Reset asphalt detail restores only these controls.
- In-app browser inspection verified the soft/rough and glossy/textured extremes, the default finish, and the complete control panel at desktop size and 390 × 844. The viewport override was restored. These are browser checks, not physical-device validation.
- Production build passes with the existing Vite chunk-size warning. Asphalt uses mip-filtered planar reflection sampling on the existing render target, plus GPU procedural normals; it does not export a normal-map image.

## Fracture integration: current evidence

- `npm run verify` passes all 108 baseline and 36 displacement cases after the material integration. `npm run verify:fracture` passes 25 cases across all 18 shapes.
- The fracture suite uses actual three-pinata geometry, not mocked pieces: Voronoi, simple planes, slicing, deterministic seeds, 2.5D, custom projection normals, approximation, custom seed points, actual ray hits, Rapier stepping/pause, repeat-fracture limits, per-piece failure preservation, source restoration, shared-material ownership, and restored shader attributes.
- Assembly slicing skips pieces the plane misses and cuts every intersected piece. A test cuts only the middle row of a wall; an all-miss test retains the complete original geometry and reports plane guidance.
- The web-game skill's real pointer client passed two consecutive taps. Final state: 25 active pieces, 22 fragments, generation 2, zero fracture failures. Screenshots in `output/fracture-final/` were visually inspected; no browser error artifacts were produced.
- In-app browser checks covered tapping one boulder part, whole-asset breaking, simple-plane block fracture, pause, reset, independent basalt outer/sandstone inner materials, live replacement of the inner material with ice, and debris in planar ground reflections. The triangle counter follows actual fractured geometry.
- Expanded UI was inspected at desktop size and 390 × 844, including all five inspector tabs, destruction status/reset, advanced controls, and nested Outer/Inner material tabs. The viewport override was reset. These are browser-layout checks, not physical-phone performance results.
- `scripts/qa-fracture-recipe.mjs` passed actual download and file-picker import. The v3 export restores every recipe field, including basalt outside, ice inside, simple fracture, seed 12345, and six requested fragments. A saved 24-fragment scene restores as four intact source pieces at generation zero. Export and report are in `output/fracture-recipe/`.
- The same browser check verified that an orbit drag moves the camera without fracturing, followed by a tap creating six fragments. Actual v1 and v2 file-picker imports preserved their supplied options and supplied defaults for new controls. In-app v1 import also restored ice crystals after a paused destruction test.
- Actual Pinata material checks verified restored attributes, retained exterior pattern coordinates, all seven inner styles, visible inner UV scale/offset changes, repeated fracture after rotation, and snow coverage remaining attached to tumbling pieces. Browser logs showed no JavaScript or shader errors.
- Production build passes. Rapier is a separate lazy-loaded chunk, fetched when destruction is enabled. Vite retains its chunk-size warning; no physical mobile, thermal, or worst-case 48-fragment/high-displacement performance claim is made.

## Original local Restore sound integration (before public release)

- At this earlier checkpoint, all 16 WAVs matched Restore byte-for-byte (864,082 bytes total). Public release now uses the original synthesized bank documented below; licensed recordings and their full provenance are retained only locally.
- `npm run verify:fracture` passes 28 cases across all 18 shapes. New checks cover exactly-once successful break events, real floor and elevated-platform contacts, bounded collision notifications, resting silence, and reset/disable/disposal cleanup. Failed and cancelled cuts stay silent.
- `npm run qa:audio` checks actual browser gestures, decoded Web Audio playback, automatic material selection and manual overrides, alternating takes, reset, mute, volume, desktop/mobile layout, and partial loading failure. A deliberately missing rock recording preserves playback through its other variant.
- Additional native-context cases pass: the first Break from Variations unlocks and plays, Reset after suspension resumes with a chime, and disabling while resume is pending cancels the old reset sound.
- Independent playback instrumentation observed nonzero audio buffers and post-master output. Muted output measured zero. This verifies the browser signal path; it is not a listening assessment of speakers or a physical-device test.
- The web-game skill's two-burst run is saved in `output/audio-game-final/`. Screenshots show settled debris and preserved ground reflections; diagnostic state records running audio with break and collision events. Production build passes with the existing chunk-size warning.

## Expanded version: current evidence

- `npm run verify` passes for 18 shapes, seven materials, and five ground types. The suite covers 108 baseline combinations of shape, seed, and parameter extremes, plus 36 actual-displacement cases at shape-noise frequencies 0.3 and 8. Every recipe is regenerated to check determinism.
- Geometry checks cover finite position, normal, color, face-tone, bevel, and UV attributes; matching attribute counts; triangle winding; nondegenerate faces; normalized bounds; grounding; support connectivity; and the 36,000-triangle budget. The largest tested asset contains 34,752 triangles.
- Material checks cover beauty, normal, height, and roughness views; uniform-only updates without shader recompilation; and catalog and preset consistency.
- Local Node measurements for baseline generation were a 2.09 ms median and 42.97 ms p95. These are CPU generation measurements in the validation run, not browser frame times or physical-device performance results.
- `npm run build` passes. The JavaScript bundle is 623.63 kB, or 161.88 kB gzip. Vite reports its expected warning for a chunk larger than 500 kB.
- Current desktop browser inspection verified the obsidian sphere's glossy appearance and ground reflection on wet asphalt, the normal/height/roughness channel previews, and live noise adjustment.
- Setting sphere displacement to 100% and shape-noise frequency to 8 changed the mesh from 1,140 to 18,240 triangles. This exercises CPU mesh displacement as well as shader surface detail.
- Version 2 recipe JSON was downloaded and loaded back through the actual file picker. It restored seed 19423, sphere shape, obsidian material, asphalt ground, reflection 0.8, wetness 0.9, noise amount 0.23, displacement 1, and shape-noise frequency 8.
- Loading the version 1 example recipe verified migration to ice crystals with seed 72841 and the correct default material roughness of 0.3.
- The expanded interface was inspected at desktop size and 390 × 844. Shape-family tabs, a sandstone block wall, world presets, and ground cards remained usable in the stacked mobile layout. The browser viewport override was reset afterward. This verifies responsive layout, not physical-phone performance.
- New desktop and mobile PNG downloads decoded successfully at 1106 × 1725 and 682 × 682. The desktop export includes the studio floor and reflection.
- Final browser inspection also covered the granite wall on wooden planks and limestone ruins on concrete. No JavaScript or shader errors were present in the final browser error log.

## Earlier prototype evidence

These checks describe the previous six-shape interface and have not all been repeated for the expanded version.

- The earlier geometry suite passed 72 combinations of shape, seed, and parameter extremes.
- Browser inspection covered boulder, stack, ledge, arch, spire, and crystal forms; stone, ice, and snow dusting; lighting changes; wireframe; five-seed comparison; and selecting a variation.
- Selecting the third variation from seed 18427 restored single view with seed 18701.
- Recipe and PNG export produced real files in Downloads. The JSON contained the expected seed and settings; the PNG decoded successfully. Recipe import/export has also been rechecked for the expanded version as described above.
- Layout was inspected at the desktop browser size and 390 × 844. This established the earlier interface's responsive layout, not performance or feel on a physical phone.
- No JavaScript or shader errors were observed in those earlier final browser inspections.

## Rendering and export boundaries

This prototype has not been established as an exact visual match to the supplied reference. Surface relief uses procedural normal perturbation in the shader; CPU displacement changes subdivided geometry and its silhouette. The normal, height, and roughness views are inspection channels, not baked texture exports.

Ground reflections use a planar reflection render target capped at 1024 pixels and a nine-tap blur approximation. Snow changes surface coverage only. Original Glacier ice remains opaque. The Glass & crystal family uses native scene-color transmission, artist-estimated thickness bounded on fragments, and six procedural depth samples. It does not implement multiple glass boundary tracing, colored shadows, or caustics.

Export includes recipe JSON and viewport PNG. Baked texture maps and GLB export are not implemented. Physical mobile-device performance and interaction remain unverified.

## Public release and control help

- Geometry verification passes 108 baseline plus 36 displacement cases across 18 shapes and 10 materials. Actual fracture/physics verification passes 28 cases.
- Menu QA passes real File-menu JSON download/file-picker restoration and PNG download, View state synchronization, Help, keyboard focus/arrow navigation, Escape/outside-click, and 390px touch layout.
- Tooltip QA covers all 86 parameter labels/legends, individual control descriptions, preserved label associations and vector-validation descriptions, hover/focus/touch, popup clamping, cleanup, and dynamically inserted controls. No actual buttons, tabs, or cards have tooltips.
- Fracture recipe QA passed after the menu change: v3 download/import, v1/v2 migration, intact reset, orbit without breaking, and a real pointer tap creating six fragments.
- Public audio QA passes all 15 groups against the generated sound bank: decoding all 16 clips, gesture unlock, actual break/contact events, alternating variants, restore, volume/mute, native suspension, stale-event cancellation, and a deliberately missing-file fallback. Regeneration produces byte-identical WAVs and provenance. The private bank's 16 original files retain their original hashes.
- Production builds force the public sound bank and exclude private recordings, local provenance, and reference artwork. `verify:publication` checks the output. GitHub Pages builds from `main` through `.github/workflows/pages.yml`.
- These are desktop and emulated narrow-screen browser checks. Physical-device frame times, audio output, and touch feel have not been validated. The existing large-chunk build warning remains; Rapier is loaded on demand.

- The production smoke serves `dist` beneath an actual `/rock-lab/` URL prefix. All 21 asset requests returned HTTP 200, all 16 public WAVs decoded, and the worker plus Rapier loaded successfully. A pointer tap created six fragments with a break event; reset chimed and restored the source; the File menu downloaded valid recipe JSON. No browser errors or forbidden asset requests occurred.
- The two-burst web-game client also completed against local development. Both screenshots were inspected: 48 fragments retained their cut-face materials and planar reflections, with zero fracture failures.
