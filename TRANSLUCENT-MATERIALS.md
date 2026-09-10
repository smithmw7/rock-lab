# Translucent material research

September 9, 2026. Target: Three.js 0.185.1, WebGLRenderer, Rock Lab's procedural shapes and three-pinata fragments.

## Approaches considered

| Approach | Useful effects | Fit here |
| --- | --- | --- |
| [Three MeshPhysicalMaterial](https://threejs.org/docs/pages/MeshPhysicalMaterial.html) | Optical transmission, IOR, thickness, absorption tint, rough refraction, dispersion, iridescence | Selected. Uses the current environment lighting and material groups. Additional volume detail can be supplied procedurally. |
| [Drei MeshTransmissionMaterial](https://github.com/pmndrs/drei/blob/master/docs/shaders/mesh-transmission-material.mdx) | Noise-based roughness blur, anisotropic blur, chromatic aberration, spatial and temporal distortion | Useful for a future liquid or animated magical-glass mode. Its custom scene capture can include other transparent objects. Adapting the capture lifecycle and buffers adds work to this vanilla Three.js app. |
| [Drei MeshRefractionMaterial](https://github.com/pmndrs/drei/blob/master/docs/shaders/mesh-refraction-material.mdx) | Geometry-aware internal ray bounces, gemstone facets, RGB separation | A strong option for a few hero gems. Its [implementation](https://github.com/pmndrs/drei/blob/master/src/core/MeshRefractionMaterial.tsx) builds a geometry BVH, which would need rebuilding after procedural generation and fracture. |

The native approach supports the requested study without a new framework or dependency. The [official transmission example](https://threejs.org/examples/webgl_materials_physical_transmission.html) is a useful reference for comparing thickness and roughness.

## Added material family

**Material > Glass & crystal** contains three new starting presets. Original **Glacier ice** stays in **Stone & ice** with its opaque stylized shading.

- **Clear glass:** high clarity, a faint green absorption tint, restrained dispersion and few inclusions.
- **Included quartz:** pale violet absorption, mineral flecks, cloudy pockets, internal cracks, and a subtle iridescent sheen.
- **Translucent ice:** a cyan volume with cloudy frozen pockets and internal crack detail.

All three share editable optical properties. Transmission is the amount of light passing through the surface. IOR controls bending. Optical thickness estimates the light path through the volume. Absorption color and distance set how strongly that path becomes tinted. Dispersion separates colors in refraction; iridescence changes reflected color with angle. Surface roughness creates the frosted finish.

The internal detail controls cover cloudiness, mineral inclusions, inclusion scale, and cracks. These are a procedural visual approximation sampled within the volume, not newly created internal geometry. Orbiting the camera makes their depth easier to inspect. Three-pinata still controls actual mesh destruction separately.

Outer and Inner material tabs retain independent optical settings. Recipes save both sets of controls; old recipes receive defaults. Reset optical preset restores the current material's optical defaults and base roughness.

## Practical limits

Native transmission samples scene color rather than tracing every glass boundary. Overlapping translucent pieces do not accurately refract one another. Estimated thickness is not a physically measured exit intersection. Shadows are conventional shadow maps, without colored transmission shadows or focused caustics. These limits also affect the planar reflection preview.

The scene uses a PMREM studio environment for highlights and a transmission resolution scale of 0.75. Transmission adds a scene pass; the floor can also invoke its planar reflection from that pass. This cost is why the existing opaque ice remains useful for distant objects, large crowds of fragments, and simpler game targets. No physical-device performance claim is made.

The local shader corrects the native transmission view direction for Rock Lab's orthographic camera. Ground reflections preserve each offscreen target's physical viewport, avoiding cropped refraction buffers at fractional transmission resolution and Retina pixel ratios. The material uses `opacity = 1` with transmission, following the native API. Live channel views remain diagnostics, not baked map exports. Portable game delivery would require retaining the custom shader or baking the appropriate surface channels; a conventional normal map alone cannot reproduce the internal volume effects.
