import './tooltips.css';

// Help belongs to parameter labels. Action buttons, tabs, preset cards, and
// disclosure summaries deliberately never receive tooltip behavior.
export const PARAMETER_HELP = Object.freeze({
  'scene-name': 'Renames the selected scene object in the object list. A distinct name makes repeated shapes easier to find; the procedural shape and material are unchanged.',
  'scene-position-x': 'Moves the selected scene object along the world X axis, from -50 to 50 world units. Negative and positive values move to opposite sides of the scene origin.',
  'scene-position-y': 'Moves the selected scene object vertically, from -50 to 50 world units. Zero places its original base at ground height; higher values lift it and negative values lower it below the ground.',
  'scene-position-z': 'Moves the selected scene object along the world Z axis, from -50 to 50 world units. Negative and positive values move to opposite sides of the scene origin.',
  'scene-rotation-x': 'Rotates the selected scene object around its X axis in degrees. Zero keeps its original orientation; a full turn is 360 degrees.',
  'scene-rotation-y': 'Rotates the selected scene object around its Y axis in degrees, changing its heading. Zero keeps its original orientation; a full turn is 360 degrees.',
  'scene-rotation-z': 'Rotates the selected scene object around its Z axis in degrees. Zero keeps its original orientation; a full turn is 360 degrees.',
  'scene-scale-x': 'Scales the selected scene object across its local X axis. One keeps the original width; smaller positive values narrow it and larger values widen it.',
  'scene-scale-y': 'Scales the selected scene object along its local Y axis. One keeps the original height; smaller positive values shorten it and larger values make it taller.',
  'scene-scale-z': 'Scales the selected scene object along its local Z axis. One keeps the original depth; smaller positive values flatten it and larger values make it deeper.',
  'scene-space': 'Sets the Move and Rotate gizmo orientation. World uses the scene axes; Local follows the selected object’s rotated axes. Scale handles always use local axes. Numeric position fields always show world coordinates.',
  'scene-translation-snap': 'Sets the distance between movement increments, in world units, when Snap is enabled. Smaller values allow finer placement; larger values make objects easier to align on a grid.',
  'scene-rotation-snap': 'Sets the angle between rotation increments, in degrees, when Snap is enabled. Smaller values allow finer angles; values such as 15, 45, or 90 help align modular pieces.',
  'scene-scale-snap': 'Sets the increment used while scaling with a gizmo when Snap is enabled. Smaller values allow finer size adjustments; larger values change size in broader steps.',
  'scene-snap': 'Snaps gizmo movement, rotation, and scale to the increments set in the Scene inspector. Turn it off for free dragging. The grid display is controlled separately.',
  'scene-grid': 'Shows the reference grid on the ground to help place and align scene objects. Hiding it does not change object positions or the Snap setting.',
  'scene-render-mode': 'Changes how scene objects are displayed for inspection. Shaded shows their materials, Wireframe shows triangle edges, Collider shows a convex collision approximation for each mesh, and Normals colors surfaces by their normal direction. Collider mode fills concave openings and does not run physics.',
  "path-point": "Chooses one of the route control points for coordinate editing. Points connect in numbered order. Add or insert points to create more bends.",
  "path-x": "Moves the selected route point across the top view, in world units. Negative values move left; positive values move right. The range is -12 to 12. Neighboring points must remain apart.",
  "path-z": "Moves the selected route point vertically in the top view, in world units. Negative values move up; positive values move down. The range is -12 to 12. Neighboring points must remain apart.",
  "pathObject": "Chooses the object repeated along the spline. Composite tools retain separate head, handle, and fitting materials. Edit its geometry in Shape and its finish in Material.",
  "pathWidth": "Sets the width of the paved ribbon or wooden boards, in world units. Higher values widen the walkway and can add more paving cells. For spaced stones and repeated objects, this sets the available lateral scatter width when Shape variation is above zero.",
  "pathSpacing": "Sets the clear gap between pieces in world units. For fitted bricks and cobbles this is the mortar gap; higher values separate the cells more. For spaced layouts higher values spread instances farther apart.",
  "pathPieceSize": "Sets the length or cell size of paving pieces. Lower values create smaller, more numerous pieces; higher values create broader stones, bricks, or boards. Object scatter uses Object scale instead.",
  "pathThickness": "Sets the actual vertical thickness of paving pieces in world units. Lower values create thin walking slabs; higher values create deeper blocks. It does not resize repeated source objects.",
  "pathSmoothness": "Blends straight segments between route points into a centripetal cubic spline. Zero gives angular turns; higher values soften bends. Tight turns may omit pieces that would overlap.",
  "pathOffset": "Shifts the layout sideways relative to the route, in world units. Negative and positive values choose opposite sides; zero follows the centerline.",
  "pathJitter": "Adds repeatable variation using the Shape seed. Higher values vary stepping stones, boards, and objects more. Cobblestones vary their cell layout and height; bricks vary their height.",
  "pathRotation": "Adds seeded rotation to spaced stones, planks, and repeated objects. Zero keeps their base alignment; higher values turn pieces farther in either direction. Fitted paving keeps shared boundaries instead.",
  "pathObjectScale": "Scales each repeated source object before spacing it along the route. Higher values create larger instances and generally fit fewer along the same length.",
  "pathAlign": "Rotates repeated source objects to follow the route tangent. Turning it off holds a fixed orientation. Paving layouts follow their route automatically.",
  "pathClosed": "Connects the last control point back to the first to create a loop. A loop needs at least three distinct points. Turning it off leaves the route ends open.",

  hammerHead: 'Changes the hammer head geometry: a broad club, rounded ball peen, narrow cross peen, or forked claw. The handle and its material remain independently editable.',
  knifeBlade: 'Chooses a chef blade, a tapered drop-point blade, or a broad cleaver. The choice changes the actual blade silhouette while keeping the handle separate.',
  handleLength: 'Scales the wooden handle length. Lower values create a compact tool; higher values make a longer grip while keeping the head attached.',
  headScale: 'Scales the metal head or blade relative to the handle. Lower values make a lighter, smaller tool; higher values emphasize the working end.',
  wallThickness: 'Sets the physical wall thickness of hollow vessels and candlestick sockets. Larger values make thicker walls and smaller interior openings; the rim and base stay closed solids.',
  latheHeight: 'Scales the height of the turned object. Lower values flatten bowls and vessels; higher values stretch the profile vertically.',
  latheWidth: 'Scales the overall radius of the lathe profile. Lower values make a slimmer object; higher values make a wider turning.',
  latheBelly: 'Widens or narrows the middle of the spline profile. Lower values pinch the body inward; higher values create a fuller bowl or rounded vessel.',
  latheNeck: 'Changes the width near the top of the vessel. Lower values create a narrow neck; higher values open the shoulder and neck.',
  latheLip: 'Changes the radius at the opening. Lower values close the mouth; higher values flare the lip outward while maintaining a solid rim.',
  latheSegments: 'Sets the number of segments around the lathe. Lower values show broad low-poly facets; higher values make the circumference smoother and use more triangles.',
  profileSmoothness: 'Blends the profile between straight segments and a smooth cubic spline. Zero makes angular transitions; higher values soften the vertical outline.',
  'lathe-point': 'Selects one of six profile points from the base to the lip. Adjust Point radius to reshape that height without moving the other points.',
  'lathe-radius': 'Sets the selected point’s radius relative to its preset. Lower values pull that part of the profile inward; higher values push it outward. Dragging a profile point makes the same edit.',
  'material-slot': 'Chooses which part of a composite tool you are editing: its head or blade, handle, or fittings. Outer and Inner then edit that part’s original surface or newly fractured faces.',
  metalBrushing: 'Adds fine directional scratches to metal color, roughness, and normal relief. Lower values give a clean surface; higher values emphasize a brushed finish.',
  metalWear: 'Adds aged patches and edge wear to the selected metal. Lower values look newly finished; higher values increase surface variation and weathering.',
  woodGrainScale: 'Sets the density of the wood grain. Lower values make broad growth bands; higher values pack more fine grain into the same area.',
  woodGrainStrength: 'Controls the visibility and relief of wood growth lines. Lower values soften the grain; higher values strengthen its color and shading.',
  woodKnots: 'Adds localized knots that bend nearby grain lines. Zero removes knots; higher values make these darker wood features more prominent.',
  woodWarmth: 'Shifts the wood palette from cooler, muted tones to warm amber and honey colors. It changes color without altering the grain layout.',
  ceramicGlaze: 'Adds a clear reflective coat over the ceramic body. Zero leaves bare clay; higher values strengthen the glazed highlight while retaining the underlying surface.',
  ceramicSpeckle: 'Controls small mineral speckles in the clay. Lower values give a cleaner, more uniform ceramic; higher values make the handmade surface more mottled.',
  seed: 'Chooses the repeatable shape variation. The same seed and shape settings recreate the same asset; larger numbers do not mean more detail.',
  facets: 'Controls geometry detail. Higher values add more plane cuts to rocks or more segments to rounded primitives; lower values create simpler silhouettes and fewer triangles.',
  roughness: 'Changes the shape’s irregularity, not its surface shine. Lower values keep designed forms clean; higher values distort their outline and make rock planes less uniform.',
  bevel: 'Sets the size of real edge bevels and chips. Lower values keep sharper edges; higher values expose wider bevel faces that catch the light.',
  displacement: 'Moves actual mesh vertices with shape noise. Zero keeps the base shape; higher values create stronger bumps and a changed silhouette, with more triangles to support the deformation.',
  geometryNoiseScale: 'Sets the frequency of shape displacement. Lower values make broad, slow bumps; higher values make smaller, more frequent bumps. Increase Displacement to see the effect.',
  'material-tint': 'Chooses a color mixed into the selected outer or inner material. Tint amount controls how strongly it appears; an amount of zero leaves the original palette unchanged.',
  tintAmount: 'Mixes the tint color into the selected material. Zero keeps the original palette; higher values shift more of the surface toward the chosen tint.',
  materialRoughness: 'Controls how widely the surface scatters reflected light. Lower values give sharper, glossier highlights; higher values make the surface matte. This does not change geometry.',
  contrast: 'Separates the material’s light and dark colors. Lower values give a quieter, more uniform surface; higher values emphasize facets and pattern variation.',
  snow: 'Adds white surface dusting to upward-facing areas. Higher values cover more of the material; zero removes the dusting. It does not create thick snow geometry.',
  noiseScale: 'Sets the frequency of the material pattern. Lower values make broader color patches; higher values fit more, smaller patches across the same shape. Geometry stays unchanged.',
  noiseAmount: 'Controls the strength of procedural color variation. Lower values make the material more uniform; higher values make mottling and mineral variation more pronounced.',
  normalStrength: 'Changes how strongly fine surface detail bends the shading normals. Lower values look smoother; higher values catch more small highlights and shadows. The silhouette stays unchanged.',
  detail: 'Controls the prominence of the selected surface’s cracks and grain. Lower values make the pattern quieter; higher values emphasize its fine lines and texture.',
  transmission: 'Controls light passing through glass and crystal. Zero makes the surface opaque; higher values reveal more of the scene behind it. Roughness and absorption can still make it cloudy or dark.',
  ior: 'Sets the index of refraction for glass and crystal. Near 1, light bends very little; higher values bend the background more and strengthen reflection at the surface.',
  thickness: 'Sets the optical distance used for refraction and absorption. Lower values read as thin glass; higher values increase bending and depth coloration. This does not resize the mesh.',
  attenuationDistance: 'Sets how far light travels before absorption strongly colors it. Lower values create stronger color and darkening through thick areas; higher values make the material clearer.',
  absorptionColor: 'Chooses the color that survives travel through glass or crystal. It is most visible through thick areas; shorter Absorption distance strengthens the effect.',
  dispersion: 'Separates refracted light into colors. Zero disables the effect; higher values create stronger rainbow fringes in glass and crystal.',
  iridescence: 'Adds a viewing-angle-dependent, thin-film color sheen. Zero removes the sheen; higher values strengthen the shifting surface colors.',
  cloudiness: 'Adds soft cloudy material inside glass and crystal. Lower values keep the volume clear; higher values make it milkier and obscure what is behind it.',
  inclusions: 'Controls the strength of suspended mineral flecks inside glass and crystal. Lower values give a cleaner volume; higher values make internal inclusions more visible.',
  inclusionScale: 'Sets the frequency of internal mineral detail. Lower values make larger features; higher values create smaller, more closely repeated inclusions.',
  internalCracks: 'Adds cracks within glass and crystal that change with the viewing angle. Zero removes them; higher values make internal fracture lines more visible without splitting the mesh.',
  reflection: 'Mixes the ground’s planar reflection into the scene. Zero hides it; higher values make the mirrored asset more visible. Ground roughness and wetness affect its appearance.',
  groundWetness: 'Controls the ground’s wet finish. Lower values look drier; higher values darken wet areas and strengthen their glossy appearance. The result varies by ground type.',
  groundScale: 'Sets the size of the ground pattern. Lower values produce smaller, denser stones, tiles, or grains; higher values make each feature larger.',
  asphaltRoughness: 'Controls the wet asphalt finish. Lower values give a glossier surface and sharper reflection; higher values make wet areas more matte. Wetness controls how much of this finish is visible.',
  asphaltRoughnessVariation: 'Varies roughness across wet asphalt. Zero gives a more uniform finish; higher values break it into patches with different highlight and reflection softness.',
  asphaltNormalStrength: 'Controls asphalt grain and ripple relief in the shading. Zero flattens that relief; higher values strengthen small highlights and distortion without moving the ground mesh.',
  asphaltNoiseScale: 'Sets the frequency of asphalt grain and puddle detail. Lower values make larger features; higher values pack smaller details into the same area.',
  asphaltReflectionDistortion: 'Bends the planar reflection using asphalt surface detail. Zero keeps it undistorted; higher values warp it more. Wetness and Normal strength must be above zero to see the effect.',
  asphaltRippleStrength: 'Adds animated ripple relief in wet asphalt patches. Zero removes ripples; higher values make them stronger. Wetness and Normal strength control their visibility.',
  asphaltRippleSpeed: 'Controls how quickly asphalt puddle ripples move. Zero freezes them; higher values animate them faster. Increase Puddle ripples to make their movement visible.',
  lighting: 'Chooses the colors, direction, and intensity of the studio lights. Daylight and Overcast show neutral materials, Golden hour and Sunset add warmth, Moonlight is cool, and Dramatic emphasizes strong highlights and shadows.',
  rotate: 'Automatically turns the asset for inspection. During fracture, the view circles the asset while debris physics stays in place. It also works with paused debris. Turn it off to stop the automatic rotation; dragging still orbits the camera.',
  wireframe: 'Shows the mesh’s triangle edges for inspecting geometry density. Turn it off to return to the filled material view.',
  'sfx-volume': 'Sets the loudness of break, debris-impact, and restore sounds. Zero is silent; higher values are louder. The Sound toggle can mute playback independently.',
  'sfx-family': 'Chooses the break and impact sound set. Match asset follows the current surface and shape; Rock, Concrete, Glass, and Wood override that automatic choice.',
  'fr-enabled': 'Enables tapping the asset to fracture it and simulate debris. Turning it off restores the original asset. Dragging the preview still orbits the camera.',
  'fr-method': 'Chooses how each piece breaks: Voronoi makes irregular cells, Simple planes makes angular plane cuts, and Single slice cuts with the configured plane.',
  'fr-fragmentCount': 'Requests the number of fragments for the next hit. Lower values create fewer, larger pieces; higher values create smaller pieces and increase generation and physics cost. Actual counts can vary.',
  'fr-seed': 'Chooses the repeatable fracture pattern. The same seed and fracture settings reproduce the pattern on the same piece; larger numbers do not mean more damage.',
  'fr-mode': 'Chooses a full 3D cell pattern or a 2.5D pattern projected through the piece. 2.5D is useful for slabs and walls where the cuts should continue through their depth.',
  'fr-projectionAxis': 'Chooses the direction through which the 2.5D pattern is projected. Automatic chooses it from the mesh; X, Y, or Z fixes a scene axis. A custom normal overrides this setting.',
  'fr-projection-custom': 'Replaces the preset projection axis with your own direction. Enable it to edit the X, Y, and Z components of the projection normal; the vector must not be all zero.',
  'fr-impactEnabled': 'Concentrates automatic Voronoi cells near the impact point. Disable it for a pattern distributed across the piece. Custom seed points replace automatic impact placement.',
  'fr-impactSource': 'Chooses where focused cells begin. Tapped point uses the spot you hit; Local point uses coordinates you enter relative to the selected piece.',
  'fr-impactRadius': 'Sets the spread of cells around the impact point. Lower values cluster small fragments near the hit; higher values spread the fracture pattern across a wider area.',
  'fr-sliceSpace': 'Chooses the coordinate system for the slice plane. World holds the plane in the scene; Local to piece interprets its origin and normal relative to each selected piece.',
  'fr-seedPoints': 'Defines a custom Voronoi pattern using 2 to 48 distinct local X, Y, Z points, one per line. Apply points uses these instead of automatic count and impact placement; more points request more cells.',
  'fr-useApproximation': 'Uses only nearby cells to speed up Voronoi generation. It can produce overlapping fragments. Disable it for accurate cells, or increase Neighbors per cell to improve the approximation.',
  'fr-approximationNeighborCount': 'Sets how many nearby cells are considered by the approximation. Lower values are faster but less accurate; higher values improve accuracy at a greater generation cost.',
  'fr-maxGeneration': 'Limits repeated fracture depth. One allows only the first break; higher values allow fragments to be broken again, up to the live piece limit.',
  'fr-maxFragments': 'Caps the total live physics pieces, including unbroken source pieces. Lower values keep simulation cost down; higher values allow more debris and repeated fractures.',
  'fr-impulse': 'Sets the outward push applied to new fragments. Zero adds no outward kick; higher values throw debris farther and faster.',
  'fr-gravity': 'Sets downward acceleration for debris. Zero removes gravity; higher values pull fragments to the floor faster. Existing velocity can still move pieces at zero gravity.',
  'fr-friction': 'Controls contact friction for the ground and debris. Lower values let pieces slide more freely; higher values resist sliding and help debris settle.',
  'fr-restitution': 'Controls how much debris bounces on contact. Zero gives a dull landing; higher values preserve more motion and produce stronger rebounds.',
});

const VECTOR_HELP = Object.freeze({
  projectionNormal: 'Sets the direction through which the 2.5D pattern is projected, in the selected piece’s local coordinates. Only direction matters; the vector must not be all zero.',
  impactPoint: 'Sets the focus point in the selected piece’s local coordinates. Move it toward a surface or corner to concentrate the next fracture there.',
  sliceNormal: 'Sets the direction perpendicular to the slice plane. Changing its relative X, Y, and Z components tilts the cut; scaling all components together does not change the direction.',
  sliceOrigin: 'Sets a point on the slice plane in the chosen coordinate system. Move it through the piece to position the cut; a plane that misses the piece leaves it intact.',
  innerUVScale: 'Scales the procedural pattern on newly cut inner faces. Lower values make larger features; higher values repeat smaller features. Reset and fracture again to apply a new scale.',
  innerUVOffset: 'Shifts the procedural pattern on newly cut inner faces without changing its size. Positive and negative values slide it in opposite directions. Reset and fracture again to apply the offset.',
});

const instances = new WeakMap();
let nextInstance = 0;
// Data attributes also describe passive containers such as #stage[data-ground].
// Exclude actual action controls, not every ancestor carrying preset metadata.
const actionSelector = 'button, [role="button"], [role="tab"], summary, .material-card';

function descriptionFor(id, legend = false) {
  if (PARAMETER_HELP[id]) return PARAMETER_HELP[id];
  const vector = /^fr-(projectionNormal|impactPoint|sliceNormal|sliceOrigin|innerUVScale|innerUVOffset)-([xyzuv])$/.exec(id);
  if (vector) {
    const [, key, axis] = vector;
    if (legend) return VECTOR_HELP[key];
    const dimension = { x: 'X component', y: 'Y component', z: 'Z component', u: 'U texture coordinate', v: 'V texture coordinate' }[axis];
    return `${dimension}. ${VECTOR_HELP[key]}`;
  }
  const cut = /^fr-axis-([xyz])$/.exec(id);
  if (cut) return `Allows Simple plane cuts along the scene’s ${cut[1].toUpperCase()} axis. Enable more axes for a more varied angular pattern. At least one axis must remain enabled.`;
  return null;
}

/** Enhance label text without replacing native labels or control interactions.
 * Optional data-parameter-help on a label/legend supplies help for new controls.
 * The returned cleanup preserves unrelated ARIA descriptions and DOM listeners.
 */
export function setupParameterTooltips(root = document) {
  if (instances.has(root)) return instances.get(root);
  const doc = root.nodeType === 9 ? root : root.ownerDocument;
  const win = doc.defaultView;
  const instance = ++nextInstance;
  const records = new Map(), triggerRecords = new WeakMap();
  const listeners = [];
  let active = null, pinned = false, tooltipHovered = false, hideTimer = 0, disposed = false, nextTooltip = 0;
  const listen = (node, type, handler, options) => {
    node.addEventListener(type, handler, options);
    listeners.push(() => node.removeEventListener(type, handler, options));
  };
  const addDescription = (node, id) => {
    const tokens = new Set((node.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean));
    tokens.add(id); node.setAttribute('aria-describedby', [...tokens].join(' '));
  };
  const removeDescription = (node, id) => {
    const tokens = (node.getAttribute('aria-describedby') || '').split(/\s+/).filter(token => token && token !== id);
    if (tokens.length) node.setAttribute('aria-describedby', tokens.join(' '));
    else node.removeAttribute('aria-describedby');
  };
  const cancelHide = () => { win.clearTimeout(hideTimer); hideTimer = 0; };
  const hide = () => {
    cancelHide();
    if (active) { active.tooltip.hidden = true; active.trigger.classList.remove('parameter-help-open'); }
    active = null; pinned = false; tooltipHovered = false;
  };
  const place = () => {
    if (!active) return;
    const { trigger, tooltip } = active;
    if (!trigger.isConnected || !trigger.getClientRects().length || trigger.closest('[hidden]')) { hide(); return; }
    const viewport = win.visualViewport;
    const left = viewport?.offsetLeft || 0, top = viewport?.offsetTop || 0;
    const width = viewport?.width || doc.documentElement.clientWidth;
    const height = viewport?.height || win.innerHeight;
    const margin = 12;
    tooltip.style.maxWidth = `${Math.max(1, Math.min(304, width - margin * 2))}px`;
    tooltip.style.maxHeight = `${Math.max(1, height - margin * 2)}px`;
    const anchor = trigger.getBoundingClientRect(), box = tooltip.getBoundingClientRect();
    if (anchor.bottom < top || anchor.top > top + height || anchor.right < left || anchor.left > left + width) { hide(); return; }
    const x = Math.max(left + margin, Math.min(anchor.left, left + width - box.width - margin));
    const below = anchor.bottom + 9;
    const preferredY = below + box.height <= top + height - margin ? below : anchor.top - box.height - 9;
    const y = Math.max(top + margin, Math.min(preferredY, top + height - box.height - margin));
    tooltip.style.left = `${x}px`; tooltip.style.top = `${y}px`;
  };
  const show = (record, pin = false) => {
    cancelHide();
    if (active !== record) hide();
    active = record; pinned = pin;
    record.tooltip.hidden = false; record.trigger.classList.add('parameter-help-open'); place();
  };
  const scheduleHide = () => {
    cancelHide();
    hideTimer = win.setTimeout(() => {
      if (!pinned && !tooltipHovered && doc.activeElement !== active?.trigger) hide();
    }, 140);
  };
  const recordAt = target => target?.closest ? triggerRecords.get(target.closest('.parameter-help-label')) : null;

  function release(record) {
    if (active === record) hide();
    for (const node of record.described) removeDescription(node, record.tooltip.id);
    record.trigger.classList.remove('parameter-help-label', 'parameter-help-open');
    if (record.tabIndex === null) record.trigger.removeAttribute('tabindex');
    else record.trigger.setAttribute('tabindex', record.tabIndex);
    record.tooltip.remove(); triggerRecords.delete(record.trigger); records.delete(record.label);
    if (record.created && record.trigger.parentNode) record.trigger.replaceWith(...record.trigger.childNodes);
  }

  function enhance(label) {
    const previous = records.get(label);
    if (previous && label.contains(previous.trigger)) return;
    if (previous) release(previous);
    if (label.closest(actionSelector)) return;
    const legend = label.tagName === 'LEGEND';
    const linkedControl = label.htmlFor && (root.querySelector(`#${win.CSS.escape(label.htmlFor)}`) || doc.getElementById(label.htmlFor));
    const controls = legend ? [...(label.parentElement?.querySelectorAll('input, select, textarea') || [])]
      : [label.control || linkedControl || label.querySelector('input, select, textarea')].filter(Boolean);
    const control = controls[0];
    if (!control || control.matches('button, input[type="button"], input[type="submit"], input[type="reset"], input[type="hidden"]')) return;
    const description = label.dataset.parameterHelp || descriptionFor(control.id, legend);
    if (!description) return;
    let trigger = [...label.children].find(node => node.tagName === 'SPAN' && node.textContent.trim() && !node.querySelector('input, select, textarea, button'));
    let created = false;
    if (!trigger) {
      const textNodes = [...label.childNodes].filter(node => node.nodeType === 3 && node.textContent.trim());
      if (!textNodes.length) return;
      trigger = doc.createElement('span'); label.insertBefore(trigger, textNodes[0]);
      textNodes.forEach(node => trigger.append(node)); created = true;
    }
    const tooltip = doc.createElement('div');
    tooltip.className = 'parameter-tooltip'; tooltip.id = `parameter-help-${instance}-${++nextTooltip}-${control.id}`;
    tooltip.setAttribute('role', 'tooltip'); tooltip.textContent = description; tooltip.hidden = true;
    doc.body.append(tooltip);
    const record = { label, trigger, tooltip, created, tabIndex: trigger.getAttribute('tabindex'), described: [trigger, ...controls] };
    trigger.classList.add('parameter-help-label'); trigger.tabIndex = 0;
    record.described.forEach(node => addDescription(node, tooltip.id));
    records.set(label, record); triggerRecords.set(trigger, record);
  }
  const scan = scope => {
    if (scope.nodeType !== 1 && scope.nodeType !== 9 && scope.nodeType !== 11) return;
    if (scope.matches?.('label, legend')) enhance(scope);
    scope.querySelectorAll('label, legend').forEach(enhance);
  };
  scan(root);

  listen(root, 'pointerover', event => {
    const record = recordAt(event.target);
    if (record && event.pointerType !== 'touch' && !record.trigger.contains(event.relatedTarget)) show(record);
  });
  listen(root, 'pointerout', event => {
    const record = recordAt(event.target);
    if (record && !record.trigger.contains(event.relatedTarget)) scheduleHide();
  });
  listen(root, 'focusin', event => { const record = recordAt(event.target); if (record) show(record); });
  listen(root, 'focusout', event => { if (recordAt(event.target)) scheduleHide(); });
  listen(root, 'click', event => {
    const record = recordAt(event.target);
    if (!record) return;
    // Cancel label activation: asking for help must never toggle a checkbox,
    // focus a number field, or launch the native color picker.
    event.preventDefault(); event.stopPropagation();
    if (active === record && pinned) hide(); else show(record, true);
  }, true);
  listen(root, 'keydown', event => {
    const record = recordAt(event.target);
    if (record && ['Enter', ' '].includes(event.key)) {
      event.preventDefault(); event.stopPropagation();
      if (!event.repeat) { if (active === record && pinned) hide(); else show(record, true); }
    }
  });
  listen(doc, 'keydown', event => {
    if (event.key === 'Escape' && active) { hide(); event.preventDefault(); event.stopPropagation(); }
  }, true);
  listen(doc, 'pointerdown', event => {
    if (active && !active.trigger.contains(event.target) && !active.tooltip.contains(event.target)) hide();
  }, true);
  listen(doc, 'pointerover', event => {
    if (active?.tooltip.contains(event.target)) { tooltipHovered = true; cancelHide(); }
  });
  listen(doc, 'pointerout', event => {
    if (active?.tooltip.contains(event.target) && !active.tooltip.contains(event.relatedTarget)) { tooltipHovered = false; scheduleHide(); }
  });
  listen(doc, 'scroll', event => {
    if (!active || active.tooltip.contains(event.target)) return;
    if (pinned || doc.activeElement === active.trigger || active.trigger.matches(':hover')) place();
    else hide();
  }, true);
  listen(win, 'resize', place);
  listen(win, 'blur', hide);
  if (win.visualViewport) { listen(win.visualViewport, 'resize', place); listen(win.visualViewport, 'scroll', place); }

  const observer = new win.MutationObserver(changes => {
    if (disposed) return;
    for (const record of [...records.values()]) if (!record.label.isConnected || !record.label.contains(record.trigger)) release(record);
    for (const change of changes) {
      if (change.type === 'childList') {
        // Ignore frequently updated numbers and scene status text. Only label
        // edits and newly inserted control subtrees need another discovery pass.
        if (change.target.matches?.('label, legend')) enhance(change.target);
        for (const node of change.addedNodes) if (node.nodeType === 1 && (node.matches('label, legend') || node.querySelector('label, legend'))) scan(node);
      }
    }
    if (active) place();
  });
  observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'open'] });
  const cleanup = () => {
    if (disposed) return;
    disposed = true; hide(); observer.disconnect(); listeners.forEach(remove => remove());
    [...records.values()].forEach(release); instances.delete(root);
  };
  instances.set(root, cleanup);
  return cleanup;
}
