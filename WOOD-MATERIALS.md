# Procedural wood

The wood system combines several scales of detail: uneven growth rings, long fibers, localized knots and spirals, deeper splits, and coarse bark. The aim is readable stylized wood with variation inside each piece and between pieces, including planks, logs, and composite tool handles.

## Design

- Keep grain in each part's local coordinate system, running along its length. Cut ends reveal rings; side faces show long grain. Preserve exterior coordinates when fracture moves or recuts fragments. New inner cuts use the fracture tool's planar UVs as a ring cross-section, retaining its texture scale and offset.
- Distort growth rings at broad and medium scales, varying their spacing, width, and tone. Independent seeded piece variation avoids repeating the same knot arrangement across an assembly.
- Add sparse elliptical knots that bend nearby grain. The stylized spiral is an original artistic synthesis: a periodic contour of `frequency * radius - integerTurns * angle`, smoothly localized around a knot. Integer turns keep the periodic contour continuous across the angular seam. This is not a claim of botanical accuracy or an algorithm supplied by the Cornell paper.
- Use larger tapered splits with dark interiors and lighter worn lips. Bark adds elongated raised plates and deeper channels while retaining visible longitudinal structure.
- Reuse feature masks in color, height, and roughness. Relief perturbs shading normals; it does not create actual extrusion, open cracks, self-shadowing cavities, or a changed silhouette. Beveled edges, missing chips, branch stubs, and shaped log silhouettes require geometry.

The existing **Grain scale**, **Grain strength**, **Knots**, and **Wood warmth** controls remain. Five additional controls are **Grain variation**, **Spiral curl**, **Heavy cracks**, **Bark coverage**, and **Raised grain**. The five grain recipes are **Natural grain**, **Storybook spirals**, **Split timber**, **Rugged bark**, and **Burl & whorls**. Recipes set numeric grain parameters for the current material target; the chosen wood species and independent outer, inner, and composite part materials remain editable.

The **Timber** object category adds Worn plank, Timber beam, Bark log, Split log, and Tree stump. These use closed meshes with real chipped rims, bark ridges, and branch stubs. The split log keeps its flat split face free of bark. Furniture boards and legs have independent lengthwise grain; small tool grips enlarge the wood cross-section for readable grain. Other material mappings are preserved.

Use bounded feature loops and filter fine lines by pixel footprint. Reuse the existing height-to-normal pipeline rather than evaluating the complete material several times per fragment. These choices need visual and performance checks on representative assets; the research implementations do not establish browser or mobile performance.

## Research

1. [Liu, Marschner, and Dye: Procedural wood textures](https://arxiv.org/html/1511.04224v2). A modular 3D model separates cylindrical growth coordinates, seasonal ring spacing, directional distortion, pores, rays, and color. Compact localized kernels provide useful building blocks. It describes preview evaluation and texture precomputation; knots are explicitly future work. Rock Lab adopts the layering principle, not the entire anatomical simulation.
2. [Blender Manual: Wave Texture](https://docs.blender.org/UATEST/manual/en/dev/render/shader_nodes/textures/wave.html). Bands and rings can be distorted by adding centered noise to their input coordinates. This supports controlled broad grain flow and a separate weaker detail warp.
3. [Blender Manual: Voronoi Texture](https://docs.blender.org/manual/en/2.81/render/shader_nodes/textures/voronoi.html). Distance-to-edge and smoothed cell distances provide procedural seam and plate building blocks. Using stretched cells for bark is an artistic adaptation. Higher-dimensional searches cost more than lower-dimensional ones.
4. [Blender Manual: Bump Node](https://docs.blender.org/manual/en/5.0/render/shader_nodes/displacement/bump.html). Height changes perturb the normal, and filtering can soften abrupt steps. This informs rounded relief and worn crack lips without confusing normal changes with displaced geometry.
5. [Marschner et al.: Measuring and Modeling the Appearance of Finished Wood](https://www.cs.cornell.edu/~srm/publications/SG05-wood.html). Wood fibers can produce directional subsurface highlights beyond ordinary diffuse grain. Rock Lab retains its existing Three.js lighting with correlated color, roughness, and relief; it does not implement this paper's full fiber-reflection model.

The user's images are visual references only. They are not copied into source, textures, documentation, or public builds. All new patterns are generated procedurally; local QA captures belong in the ignored `output/` directory.
