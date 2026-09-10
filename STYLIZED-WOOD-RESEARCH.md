# Procedural stylized wood for Rock Lab

Research checked September 9, 2026 against the supplied Dragon workbench and fence images, the current Rock Lab source, and its installed Three.js 0.185.1. This is a researched implementation brief; the wood material and shapes have not been added to the app.

The recommended approach is a procedural wood material combined with a timber geometry generator. The references get their character from thick boards, broad flat faces, generous worn bevels, sparse end splits, and warm color variation. Grain is long, broad, and restrained. The workbench also gets substantial depth from the gaps between its individual boards and supports.

The shader should control grain, knots, color, shallow relief, finish, and surface aging. Geometry should provide the rounded silhouette, missing corners, bowed boards, and deep split ends. A bevel or bump shader can change lighting around an edge; actual rounding and damage need mesh support. Blender documents this distinction in its [Bevel shader node](https://docs.blender.org/manual/en/4.5/render/shader_nodes/input/bevel.html).

The strongest references are:

| Reference | What it provides | Use in Rock Lab |
| --- | --- | --- |
| [Three.js WoodNodeMaterial documentation](https://threejs.org/docs/pages/WoodNodeMaterial.html) and [interactive example](https://threejs.org/examples/webgpu_tsl_wood.html) | An official procedural wood implementation with species/finish presets. The installed source exposes ring spacing/variation, several grain warp scales, light/dark grain colors, coordinate transforms, and clearcoat. | Best reference for a rich wood control system. I inspected the live example: its stock appearance emphasizes fine, natural grain. Reaching the supplied style requires broader marks, art-directed colors, and worn geometry. [Source](https://github.com/mrdoob/three.js/blob/dev/examples/jsm/materials/WoodNodeMaterial.js). |
| [Yui Kinomoto / arlez80: Procedural Grain Wood Shader](https://godotshaders.com/shader/procedural-grain-wood-shader/) | Compact author-posted shader with two colors, grain frequency, waviness, and noise distortion. The code is MIT licensed. | Useful lightweight grain starting point. It uses Godot syntax and UV coordinates, so it needs adaptation. It does not include knots, end grain, age, or worn edges. |
| [Maria Larsson and colleagues: Procedural Texturing of Solid Wood with Knots](https://www.ma-la.com/procedural_knots.html) | Volumetric growth rings that bend around knots, including different effects around living and dead knots. [GLSL source and MIT license](https://github.com/marialarsson/procedural_knots) are available. | Best reference for coherent knots and cut faces. The full research system uses input maps and reports about 0.5 seconds per image in its setup. Use a simplified field for this interactive lab; those published timings do not predict our performance. |
| [Maxon WoodGrain.osl](https://github.com/Maxon-Computer/Redshift-OSL-Shaders/blob/main/WoodGrain.osl) | Separate ring/grain frequency, unevenness, trunk/angular wobble, colors, and outputs for surface response. | Useful layering and control reference. OSL needs a GLSL adaptation; its header specifies CC-BY-SA, so the MIT references are simpler code-reuse candidates. |

Rock Lab currently uses `WebGLRenderer` and `MeshPhysicalMaterial.onBeforeCompile`. The official wood example uses the TSL/WebGPU material path, and the installed wood source includes a WGSL function. It is not a direct material replacement in this app. Three.js also documents that our existing `onBeforeCompile` shaders would need porting for `WebGPURenderer`. My recommendation is to implement the selected wood techniques in the existing GLSL material system. [Renderer migration guidance](https://threejs.org/manual/en/webgpurenderer).

For the reference look, I would build the surface in this order:

1. Give each board a stable local length axis and a seeded three-dimensional wood coordinate field. Offset a plank's cut through that field to produce long sweeping grain, and sample across it for end rings. A log samples around its center. Grain must follow individual posts, rails, and diagonal braces.
2. Establish a small color palette: broad honey or ochre faces, a darker grain color, and a cream exposed-edge color. Keep per-board hue and brightness variation modest. An illustrative starting palette is `#DCA65E`, `#9A6238`, and `#F4CE8B`; these are proposed art-direction values, not colors extracted from the images.
3. Add slow grain curvature and a small number of seeded knots that bend the surrounding bands. Keep very fine fibers faint and fade them with distance to reduce shimmer.
4. Use the same grain field for subtle normal relief and roughness variation. Add sparse elongated gouges and end cracks. Deep clefts belong in the geometry.
5. Use geometry-generated edge and cavity masks for exposed wood and darker creases. Break up wear with broad noise and keep wear amount independent from wood age.
6. Light with a broad warm key, neutral or slightly cool fill, readable contact shadows, and a restrained environment reflection. A proposed starting roughness range is 0.65–0.85 with little clearcoat. Review the palette under several light directions before treating it as finished.

The proposed controls are grouped by the visible result:

| Group | Controls |
| --- | --- |
| Color | Base color, grain color, exposed wood color, contrast, variation between boards |
| Grain | Direction, width, curvature, irregularity, knot amount/size, end-ring spacing |
| Finish | Roughness, grain relief, roughness breakup, optional wax/varnish |
| Aging | Desaturation, weathered tint, dirt amount, shallow crack/gouge amount |
| Shape | Length, width, thickness, taper, bow, twist, seed |
| Wear | Bevel radius, edge irregularity, chip count/depth, end-split width/length |

Start with four editable shapes: **plank, chipped plank, square post, and split log**. Extend these into a round log, half log, fence bay, tabletop, workbench, and stacked timber. Five useful art presets would be **Golden pine, Honey oak, Dark walnut, Weathered driftwood, and Painted worn wood**. These are proposed styles, not validated species reproductions.

The geometry should use closed cross sections along the length, with dimension-aware bevels and a few stations for bow and twist. Keep broad faces flat while softening bevel transitions. Sparse notches at the ends will read more clearly than uniformly noisy edges. The current rounded-block helper bevels a unit shape before scaling, so stretching it into a long plank would also stretch the bevel. A timber-specific generator should preserve bevel width as length changes. Relevant current code: [geometry.js](src/geometry.js#L599).

Fracture needs two wood-specific decisions. First, carry each component's original wood coordinates onto new cut faces so rings and grain continue through a broken board. Rock Lab currently reconstructs exterior pattern coordinates but uses separate UVs for interiors; continuity across cuts must be implemented and verified. Second, use elongated cuts aligned with the grain for splinter-like fragments. The existing uniform rock fracture pattern will not, by itself, produce convincing split timber. Deep concave notches also exceed the fidelity of the current convex-hull collision approximation. Relevant code: [material.js](src/material.js#L204), [fracture-material.js](src/fracture-material.js#L105).

For a Blender authoring path, combine a mapped Wave Texture in bands/rings mode with distorted Noise, a color ramp, and shallow bump, then model bevels and chips with geometry. The [Wave Texture documentation](https://docs.blender.org/manual/en/3.0/modeling/geometry_nodes/texture/wave.html) describes the underlying band/ring and distortion controls. Bake base color, roughness, tangent-space normals, and any mesh-specific wear/AO needed for delivery. Keep silhouette damage in the mesh. The Blender procedural graph itself is not the portable runtime material.

A useful first acceptance scene is one intact plank, one chipped plank, and a split log under neutral studio light. Check side grain versus end grain, a 90-degree rotated board, color consistency across seeds, bevel width on different board lengths, distance shimmer, and grain continuity after two fractures. Then assemble the reference-style fence. Browser and physical-device cost should be measured once that representative implementation exists.
