# Composite tools and the spline lathe

Open **Shape → Tools**, **Metal**, or **Lathe** to find the workshop objects. Selecting a workshop object supplies a suitable starting finish. Its seed and geometry controls remain editable, and any material in the library can be used afterward.

## Tools with multiple materials

The **hammer** has club, ball peen, cross peen, and claw heads. The **knife** has chef, drop point, and cleaver blades. The **hatchet** has a broad cutting head. Adjust **Handle length** and **Head / blade size** to change their proportions.

Choose **Edit part materials**, then use **Object part** to select the working end, handle, or fittings. Each part has its own **Outer** and **Inner** material. These are shared across that role's meshes and remain live when the object is fractured. Cutting a handle retains its wood exterior and exposes the handle's selected interior; cutting the head uses the head's two materials. Repeated cuts and reset retain these assignments.

## Metal stock and finishes

The eight metal forms are **plate**, **rod**, **tube**, **ring**, **I-beam**, **angle bracket**, **hex bolt**, and **gear**. Tubes, rings, and gears have actual open bores. The bolt uses stylized threads rather than an engineering thread specification.

The eight finishes are **brushed steel**, **forged iron**, **satin aluminum**, **polished chrome**, **aged copper**, **cast bronze**, **polished brass**, and **warm gold**. Surface roughness controls highlight spread; **Brushing** adds directional detail and **Metal wear** adds aged patches. The metallic response uses Three.js physical shading and the studio environment, with artistic conductor palettes rather than measured spectral data.

## Wood and ceramic

**Honey oak**, **dark walnut**, and **weathered wood** add procedural growth bands, knots, end grain, and palette control. The grain follows local Y, aligned with tool handles. **Grain scale**, **Grain strength**, **Knots**, and **Wood warmth** shape the finish. On older multi-piece objects, which have baked geometry coordinates, the grain follows the object's coordinates rather than automatically detecting each board's direction.

**Terracotta**, **ivory porcelain**, **celadon glaze**, and **speckled stoneware** provide clay colors, throwing rings, speckles, and a reflective glaze coat. **Glaze coat** changes the clear coat; **Clay speckles** changes the mineral pattern. Normal relief controls fine shading without moving the silhouette.

## Editing the lathe

Start with **bowl**, **vase**, **jar**, **urn**, **planter**, **saucer**, **goblet**, **metal candlestick**, or **wooden candlestick**. These use a sampled cubic profile revolved around the vertical axis. Hollow forms have inner walls, a solid bottom, and a continuous rim. Candlesticks have a shallow socket rather than a hollow stem. The wooden candlestick also has a separately editable metal liner.

- Drag one of six profile points horizontally to change its radius. The SVG previews the same sampled profile as the mesh before overall size normalization and wear.
- Choose **Profile point** and adjust **Point radius** for precise edits. Focus a graphic point and use Left/Right to change its radius, Up/Down to select another point, or Home/End for the radius limits. Shift makes larger steps.
- Use **Width**, **Height**, **Belly width**, **Neck width**, and **Lip width** for broad proportion changes.
- **Spline smoothness** blends angular sections into a smooth cubic outline. **Radial segments** changes the number of faces around the object.
- **Wall thickness** sets the shell thickness. Narrow radii are bounded to preserve an opening and avoid intersecting walls. Large shapes are normalized to the existing preview bounds.
- **Reset profile points** restores the six point multipliers while preserving the other controls.

Recipes now use **version 4** and include the profile, tool variants, and all three outer/inner material pairs. Versions 1–3 remain readable and receive defaults for new fields. Save through **File → Save recipe**. Mesh and baked-texture export are still separate future work.

Destruction remains a fracture preview: all materials break as rigid chunks, including metal. It does not model bending metal, grain-driven wood splintering, or structural collapse. Rapier's convex debris colliders approximate concave shapes.

## Implementation references

The implementation uses the same profile-revolution principle documented by [Three.js LatheGeometry](https://threejs.org/docs/pages/LatheGeometry.html), with a custom closed profile mesher for solid rims and caps. Metals and glaze use [Three.js MeshPhysicalMaterial](https://threejs.org/docs/pages/MeshPhysicalMaterial.html). See `src/workshop-geometry.js`, `src/workshop-materials.js`, and `src/lathe-editor.js` for the reusable components.
