# Terrain and spline paths

Rock Lab has **79 objects**: 74 individual forms and five procedural path styles. The **Terrain** collection adds 16 stone forms using the original material system. The **Path** inspector arranges paving, boards, or repeated objects along an editable route. All 25 existing materials remain available.

## Build a route

1. Open **Path**, or select an object in **Shape → Paths**.
2. Choose **Stepping stones**, **Brick paving**, **Fitted cobbles**, **Wooden planks**, or **Scatter objects**.
3. Drag the numbered points in the top-view editor. The shaded strip shows the route width; the thin centerline is the sampled curve used by the generator.
4. Adjust **Path width**, **Piece gap**, and **Piece size**. For Scatter objects, choose a **Source object** and adjust **Object scale** instead.
5. Choose a material and ground, then use **File → Save recipe** to keep the result.

Selecting a style supplies its suggested finish: slate stepping stones and cobbles, sandstone bricks, or oak planks. Materials remain editable. Style changes keep the current route; **Reset route** restores the initial four points and opens the loop.

## Edit the control points

The route accepts **2–12 points**. X runs horizontally and Z runs vertically in the editor. One grid cell represents one world unit. Use **Path point** to select a point, then enter **Point X** and **Point Z** for exact placement. Each coordinate is limited to **−12 through 12**.

Drag a numbered handle with a mouse or touch. A focused handle also accepts arrow keys: **0.1 unit per press**, or **0.5 unit with Shift**. The view stays fixed during a drag so a moving endpoint does not chase an auto-resizing diagram.

- **Add point** extends the route beyond its last point.
- **Insert after** adds a point between the selected point and its successor.
- **Remove point** deletes the selected point while retaining at least two.
- **Closed loop** joins the end to the start. It is disabled with two points; removing a point from a three-point loop returns to an open route.
- **Reset route** restores the initial route while retaining the layout controls.

At zero, **Curve smoothness** follows straight segments between the points. Positive values use a continuous cubic Hermite curve through the points, with tangent strength controlled by the slider; larger values round the turns. Interactive moves that would collapse a segment onto a neighboring point are rejected, preserving the existing route. Imported coordinates are sanitized separately. Crossing or sharply doubling back can reduce the number of usable placements; the status message reports this.

## Layout and variation controls

| Control | Range | Effect |
| --- | --- | --- |
| Path width | 0.5–3 units | Sets the paving corridor or plank length. For stepping stones and object scatter, it provides room for sideways variation. |
| Piece gap | 0.05–1 unit | Sets nominal mortar or spacing. Larger gaps reduce density; very small fitted cells limit their inset to preserve a solid piece. |
| Piece size | 0.25–1 unit | Sets the target paving size or distance occupied by each plank along the route. Available for the four paving styles. |
| Piece thickness | 0.08–0.45 unit | Sets the height of paving or boards, with small seeded variation. Hidden for object scatter. |
| Curve smoothness | 0–100% | Controls cubic tangent strength. Zero uses straight segments; higher values round the turns. |
| Lateral offset | −1–1 unit | Moves the route sideways in world space and measures placement distances along the resulting offset curve. |
| Shape variation | 0–100% | Varies stone outlines, cobble sites, sideways scatter, and piece heights as appropriate to the style. Bricks and planks keep their recognizable profiles. |
| Random rotation | 0–100% | Adds seeded rotation to stepping stones, planks, or repeated objects. Planks use restrained angles. Hidden for fitted bricks and cobbles. |
| Object scale | 0.15–1× | Scales the selected source object and its complete assembly. Available for Scatter objects. |
| Follow tangent | On/off | Aligns scattered objects with the route direction before random rotation. Available for Scatter objects. |
| Closed loop | On/off | Connects the last point to the first. Disabled when only two points remain. |
| Source object | 74 individual forms | Chooses the object repeated along the route. Paths cannot recursively contain another path. |

**Seed** generates a repeatable variation. The **Shape** controls remain available: paving uses edge bevel, shape-noise scale, and small bounded vertical displacement. Its generic plane-cut and irregularity controls are hidden; use **Shape variation** in Path instead. Object scatter passes geometry, tool, and lathe settings through to its source generator. Material noise and normal relief remain separate shader controls.

## Fitted paving and wooden boards

**Fitted cobbles** begin with a shared set of sites. Each site's Voronoi region is clipped against neighboring sites and the path corridor, then inset to create actual mortar gaps. Neighboring cobbles therefore fit together without rotating independent stones into one another.

**Brick paving** starts with staggered rectangular rows. Neighboring overlap is cut along shared bisectors around bends, preserving the running-bond pattern on straight sections. Both styles create separate closed pieces with visible beveled edges. Their top faces and gaps are real mesh geometry.

**Stepping stones** use separate irregular flat stones; overlapping placements at tight bends are skipped and reported. **Wooden planks** span the path crosswise, with procedural grain aligned along each board. Their crowded inner corners are trimmed along shared boundaries so neighboring boards fit around a bend while retaining their place in the sequence. An impossible crossing can still remove a fully clipped board, which is reported in the layout status.

## Scatter any individual object

Choose **Scatter objects → Source object** to repeat any of the 74 non-path objects. Available sources include natural rocks, all 16 terrain forms, architecture, furniture, tools, metal stock, and lathe objects.

Copies retain the source's component meshes and material roles. A row of hammers can have wooden handles and metal heads; a row of wooden candlesticks keeps its separate liner. In **Shape**, the source's hammer-head, knife-blade, proportion, or lathe-profile controls remain available. In **Material**, use **Object part** and **Outer / Inner** to edit the shared material role across the copies.

Placement spacing accounts for the source's horizontal size and **Object scale**. Tight-bend overlaps are skipped. The generator shares each prototype's geometry across copies; it does not generate a separately randomized source mesh for every placement.

## World scale, preview limits, and destruction

Paths retain their **world units**. A long route is not compressed into the normal single-object preview bounds. Camera framing adjusts to the layout. Path editing uses the **single-layout view**; five-seed Variations is unavailable while a path is selected. Change Seed to compare another layout.

A path preview is limited to **128 mesh pieces and 80,000 triangles**. A multi-part scattered object uses one piece of that budget for every component mesh. The status line shows the curve length, generated piece count, and any budget or placement messages.

- Fitted brick and cobble layouts reduce density when needed to stay within the piece budget. The warning explains the adjustment.
- Spaced stones, boards, and repeated objects can stop before covering a very long or dense route. Increase size or gap, reduce source detail, or shorten the route when a budget warning appears.
- Self-crossings and crowded placements are reported. Inspect the generated layout after editing a tight bend.
- A route too short or narrow for the selected pieces can be empty. The camera keeps the route in view and the status suggests moving points farther apart or reducing piece size and gap; it does not substitute a different route.

Enabling path destruction raises **Live piece limit** to **160** when it is lower, leaving room to replace intact paving with fragments. The same adjustment applies when switching into a path while destruction is already enabled. Tap one stone or component to fracture it; untouched pieces remain fixed. The live limit still bounds further cuts, so a dense path may have room for only a few fractures. **Reset destruction** restores the intact path. This remains a fracture preview, not a structural-collapse or walkable-navigation simulation.

## Save and reuse

**File → Save recipe** writes version **5** JSON, including the route points, path settings, selected source, geometry settings, independent part materials, lighting, ground, and fracture settings. The loader accepts versions **1–5**, supplying defaults for fields missing from older recipes. Moving fragments and camera position are not saved.

The reusable path implementation is [`src/path-geometry.js`](../src/path-geometry.js), reached through `buildAsset` in [`src/geometry.js`](../src/geometry.js). It exports the path defaults, ranges, sanitizer, editor sampler, and builder. Object scatter calls the existing asset builder for a non-path prototype. Dispose the returned group with `disposeAsset`, which handles shared geometries without disposing caller-owned materials.

Current downloads are **recipe JSON and viewport PNG**. The app does not export GLB files or baked PBR maps.
