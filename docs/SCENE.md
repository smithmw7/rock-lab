# Scene building

Rock Lab opens in **Object** mode. The top-center **Scene** switch opens a construction workspace with a copy of your current object. The original Object draft and camera are kept separately.

## Add and edit

1. Choose an entry in **Shape** to add an instance. **Add current object** in the toolbar adds another copy of the current inspector recipe. New instances are placed beside the arrangement and framed together.
2. Click an object in the viewport or in the **Scene** list to select it. A selection box identifies the whole instance, including multi-piece paths, furniture, and composite tools.
3. Use the **Shape**, **Path**, and **Material** inspectors to edit the selection. Every instance owns its geometry and material settings. Head, handle, and fitting materials remain independent on composite tools.
4. Use the transform handles or **Scene → Selected object** fields to move, rotate, scale, and name it. Duplicate copies the complete recipe and transform, with a small position offset. Delete removes the selection.
5. Adjust **Ground** and **Studio** for the whole scene. The Object workspace keeps its own environment.

When nothing is selected, the inspector retains a recipe for the next object you add. Shape choices always add new instances in Scene mode. To change the finish or proportions of an existing instance, select it and use its parameter controls.

## Tools and display

| Control | Behavior |
| --- | --- |
| Select / Q | Click an instance; drag the background to orbit |
| Move / W | Drag an axis or plane to translate the selection |
| Rotate / E | Drag an axis ring to rotate the selection |
| Scale / R | Drag an axis or center handle to resize the selection |
| Gizmo space | World or local axes for moving and rotating; scale handles use local axes |
| Snap | Quantize gizmo movement, rotation, and scale to the configured steps |
| Frame selection / F | Fit the selected instance to the viewport |
| Frame all | Fit all placed objects to the viewport |
| Duplicate / Ctrl or Cmd + D | Copy the selected instance |
| Delete / Delete or Backspace | Remove the selected instance |
| Grid | Show floor lines spaced one world unit apart |
| Render | Shaded 3D, triangle wireframe, convex collider volumes, or geometry normals |

Keyboard shortcuts are inactive while typing into fields. Numeric transforms accept precise values even with Snap enabled. Positions are limited to ±50 world units, rotations to ±360 degrees, and positive scale to 0.05–10 per axis. Move snap supports 0.01–10 units; angle snap supports 1–90 degrees; scale snap supports 0.01–2.

Collider view builds a convex hull from the vertices of every constituent mesh, matching the convex approximation used for rigid-body collisions. Concave holes may be filled in this view. It is a geometry diagnostic; Scene mode does not run collision simulation or destruction. Geometry normals show the mesh normals, separate from the material's procedural normal relief. Return to Object mode to test fracture. Turntable in Scene orbits the camera around the arrangement.

## Save and return

**File → Save scene** downloads recipe version 6. It includes each instance's independent procedural recipe, name, position, rotation, scale, the selection, transform and display settings, and the scene ground/lighting. It also preserves the original Object draft. Load it through **File → Load recipe** or drag the JSON onto the app.

Versions 1–5 remain supported and open in Object mode. Loading an older object recipe keeps any existing Scene arrangement available. Version 6 files restore the saved workspace mode and arrangement. Invalid scene files are rejected before replacing the existing scene. Camera poses, moving debris, undo history, GLB files, and baked texture maps are not part of the saved format.

Scenes support up to **64 instances, 512 constituent meshes, and 300,000 triangles**. A path counts as one instance but contributes all of its paving meshes. The editor rejects additions or edits that would exceed these limits. For responsive scenes, start with simpler objects and use fewer translucent materials and reflections on slower devices.
