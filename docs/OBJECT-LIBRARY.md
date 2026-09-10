# Object library

Rock Lab includes **84 procedural objects**. Open **Shape** to browse the full scrolling list. Category filters narrow it to Natural, Primitives, Structures, Architecture, Furniture, Timber, Tools, Metal, Lathe, Terrain, or Paths. Search matches names and descriptions. Choose a row to generate it. Workshop objects supply a suggested initial material; the material, seed, and surface settings remain editable.

## The 20-object expansion

| Object | What it is useful for |
| --- | --- |
| Round arch | Masonry gates and semicircular passage openings |
| Pointed arch | Gothic doorways and taller architectural silhouettes |
| Flat arch | Low openings with a segmented masonry lintel |
| Doorway | A simple square opening between two piers and a lintel |
| Small bridge | A short crossing with a deck and an open underpass |
| Bench | A long seat on two supported trestles |
| Table | A broad top supported by four legs and an apron |
| Chair | A square seat, four legs, and a visible back |
| Stool | A round seat on splayed legs |
| Round column | A faceted shaft with a base and capital |
| Square column | A square architectural pier with stepped ends |
| Broken column | A shorter shaft with an uneven fractured crown |
| Plinth | A stepped pedestal for statues or collectible props |
| Small block | A compact 0.8-unit cube for detail pieces |
| Medium block | A 1.5-unit cube for modular layouts |
| Large block | A 2.5-unit cube for foundations and cover |
| Low ramp | A long, shallow incline for gentle elevation changes |
| Steep ramp | A shorter, higher incline for compact level transitions |
| Corner ramp | Sloping faces that meet at a raised corner |
| Platform | A broad, low slab for staging objects or building platforms |

Block dimensions are nominal before wear and displacement. New kit objects share a world scale, so the three block sizes remain different. **Frame asset** restores the inspection camera; it does not change object dimensions.

The original eighteen objects remain available: boulder, outcrop, ledge, spire, crystals, natural arch, block, brick, sphere, cylinder, wedge, soft block, block wall, monolith, basalt column cluster, stairs, ruins, and cairn.

## Materials, variation, and destruction

All objects expose the independently selected inner material when fractured. Try limestone architecture, an oak table, or a quartz stool. Tools have separate material pairs for their working end, handle, and fittings. Procedural oak, walnut, and weathered wood are available in the Wood family.

Seed, geometry detail, irregularity, edge bevels, and displacement alter the generated form. The new kit keeps its intended silhouette while varying surface wear. **Variations** compares five seeds for individual objects. Paths use a single layout and can be varied with Seed. For clean construction pieces, lower irregularity and leave displacement at zero.

Assemblies use separate closed solids for their component parts. Tap one part to break it, or use **Break asset** for the full assembly. Unbroken parts remain fixed in the destruction preview. This is a material and fracture test, not a simulation of structural load or collapse.

Save any new object through **File → Save recipe**. Loading the recipe restores its shape and settings as an intact asset and reveals its selected library row. Recipe JSON and PNG remain the available exports.

## Timber

Five wood forms provide surfaces for the richer grain system: **Worn plank**, **Timber beam**, **Bark log**, **Split log**, and **Tree stump**. Rims, ridges, roots, and branch stubs are geometry; cracks, knots, and bark relief are procedural shading. The split log's flat face stays exposed wood even at full bark coverage.

In **Material → Wood → Grain recipe**, try Natural grain, Storybook spirals, Split timber, Rugged bark, or Burl & whorls. Grain follows each board, furniture part, and handle. All grain controls save independently for outer/inner and tool parts. See [wood patterns and research](../WOOD-MATERIALS.md).

## The workshop expansion

| Collection | Objects | Editable features |
| --- | --- | --- |
| Composite tools | Hammer, knife, hatchet | Four hammer heads, three knife blades, proportions, and independent part materials |
| Metal primitives | Plate, rod, tube, ring, I-beam, angle bracket, hex bolt, gear | Eight metal finishes, bevels, wear, and open bores where appropriate |
| Spline lathe | Bowl, vase, jar, urn, planter, saucer, goblet, metal candlestick, wooden candlestick | Six draggable profile points, spline smoothness, proportions, wall thickness, and radial segments |

See the [workshop guide](WORKSHOP.md) for the material controls, lathe editing, and fracture behavior.

## Terrain forms

These 16 additions keep the original stone material system. Select a suggested slate or limestone finish, then use any of the 25 materials. Platforms retain broad flat crowns; controlled wear and displacement add surface detail.

| Object | Form and use |
| --- | --- |
| Cliff face | Broad vertical rock wall with fractured strata |
| Cliff corner | Two layered walls forming an inside corner |
| Terraced cliff | Retreating stone layers with wide ledges |
| Overhang cliff | A projecting cap above a recessed supporting wall |
| Tapered rock pillar | Tall shaft narrowing toward its crown |
| Split rock pillar | Two standing halves with a deep fissure |
| Stacked rock pillar | Four tapering geological layers |
| Round platform | Circular pad with a faceted rim |
| Hex platform | Six-sided modular stone pad |
| Oval platform | Elongated rounded island or stepping pad |
| Triangle platform | Three-cornered pad with clipped tips |
| L platform | Two flat wings around an open corner |
| Wide ramp | Broad straight incline |
| Curved ramp | Segmented stone ascent through a half turn |
| Switchback ramp | Opposing inclines connected by a flat landing |
| Broken ramp | Interrupted ramp slabs with a loose stone chip |

## Path styles

| Style | Layout |
| --- | --- |
| Stepping stones | Spaced irregular stones along a route |
| Brick path | Staggered bricks fitted together around bends |
| Cobblestone path | Shared Voronoi cells with real mortar gaps |
| Plank walkway | Crosswise boards with aligned wood grain |
| Object path | Repeated copies of any of the 79 individual objects |

Open **Path** to drag 2–12 route points, set exact X/Z coordinates, and adjust width, gap, size, thickness, smoothness, offset, or seeded variation. Object paths preserve the source's component materials and tool or lathe controls. Paths keep world units and use a single-layout view, with explicit 128-mesh and 80,000-triangle preview budgets. See the [path guide](PATHS.md) for editing, fitting, budget messages, and destruction.
