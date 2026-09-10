const VIEWS = [
  ['top', 'Top'], ['iso', 'Iso'], ['left', 'Left'],
  ['right', 'Right'], ['front', 'Front'], ['back', 'Back'],
];
const MIN_FOCAL = 18, MAX_FOCAL = 135;
const clampFocal = value => Math.round(Math.max(MIN_FOCAL, Math.min(MAX_FOCAL, Number(value) || 50)));

/** DOM/SVG camera controls. The caller owns camera state and rendering. */
export function createCameraHUD({ root, onView, onProjection, onFocalLength }) {
  if (!root) throw new Error('Camera HUD requires a root element.');
  root.classList.add('camera-hud');
  root.setAttribute('role', 'group');
  root.setAttribute('aria-label', 'Camera controls');
  root.innerHTML = `
    <div class="camera-view-picker">
      <svg class="camera-orientation" viewBox="0 0 80 96" aria-hidden="true">
        <circle cx="40" cy="42" r="29" class="camera-axis-orbit"/>
        <g class="camera-axis-parts"></g>
        <circle cx="40" cy="42" r="3" class="camera-axis-center"/>
        <text x="40" y="89" class="camera-view-name">ISO</text>
      </svg>
      <div class="camera-view-buttons" role="group" aria-label="View direction">
        ${VIEWS.map(([id, label]) => `<button type="button" data-camera-view="${id}" aria-label="${label === 'Iso' ? 'Iso' : label} view" aria-pressed="false">${label}</button>`).join('')}
      </div>
    </div>
    <label class="camera-projection-field" for="camera-orthographic"><span>Orthographic</span><input id="camera-orthographic" type="checkbox" /></label>
    <div class="camera-lens-field">
      <div class="camera-lens-copy"><label for="camera-focal-length"><span>Focal length</span></label><output id="camera-focal-value" for="camera-focal-length">50 <span>mm</span></output><p id="camera-focal-hint">Drag dial to adjust</p></div>
      <div class="camera-dial">
        <svg viewBox="0 0 72 72" aria-hidden="true">
          <path class="camera-dial-track" d="M16.2 55.8 A28 28 0 1 1 55.8 55.8" pathLength="100"/>
          <path class="camera-dial-fill" d="M16.2 55.8 A28 28 0 1 1 55.8 55.8" pathLength="100"/>
          <circle class="camera-dial-face" cx="36" cy="36" r="21"/>
          <path class="camera-dial-needle" d="M36 20V27"/>
          <circle class="camera-dial-center" cx="36" cy="36" r="2"/>
        </svg>
        <input id="camera-focal-length" type="range" min="18" max="135" step="1" value="50" aria-describedby="camera-focal-hint" />
      </div>
    </div>`;

  const buttons = [...root.querySelectorAll('[data-camera-view]')];
  const projection = root.querySelector('#camera-orthographic');
  const focal = root.querySelector('#camera-focal-length');
  const value = root.querySelector('#camera-focal-value');
  const hint = root.querySelector('#camera-focal-hint');
  const dial = root.querySelector('.camera-dial');
  const fill = root.querySelector('.camera-dial-fill');
  const needle = root.querySelector('.camera-dial-needle');
  const axisParts = root.querySelector('.camera-axis-parts');
  const viewName = root.querySelector('.camera-view-name');
  const disposers = [];
  let disposed = false, dragging = null, previousQuaternion = '';
  let lastProjection = '', lastView = '', lastFocal = -1;
  const listen = (element, name, callback, options) => {
    element.addEventListener(name, callback, options);
    disposers.push(() => element.removeEventListener(name, callback, options));
  };

  function paintFocal(number) {
    const next = clampFocal(number);
    if (next === lastFocal) return;
    lastFocal = next;
    focal.value = `${next}`;
    focal.setAttribute('aria-valuetext', `${next} millimeters`);
    value.innerHTML = `${next} <span>mm</span>`;
    const progress = (next - MIN_FOCAL) / (MAX_FOCAL - MIN_FOCAL);
    fill.style.strokeDasharray = `${progress * 100} 100`;
    needle.setAttribute('transform', `rotate(${-135 + progress * 270} 36 36)`);
  }

  // Project world axes into camera space using the inverse orientation. Sorting
  // far-to-near keeps rear axis dots visually behind the forward ones.
  function paintOrientation(quaternion) {
    if (!Array.isArray(quaternion) || quaternion.length !== 4 || !quaternion.every(Number.isFinite)) return;
    const key = quaternion.map(n => n.toFixed(5)).join(',');
    if (key === previousQuaternion) return;
    previousQuaternion = key;
    const length = Math.hypot(...quaternion) || 1;
    const [qx, qy, qz, w] = quaternion.map(n => n / length);
    const x = -qx, y = -qy, z = -qz;
    const rotate = ([vx, vy, vz]) => {
      const tx = 2 * (y * vz - z * vy), ty = 2 * (z * vx - x * vz), tz = 2 * (x * vy - y * vx);
      return [vx + w * tx + y * tz - z * ty, vy + w * ty + z * tx - x * tz, vz + w * tz + x * ty - y * tx];
    };
    const axes = [
      { label: 'X', color: '#e9a69c', axis: [1, 0, 0] },
      { label: 'Y', color: '#b4d5a3', axis: [0, 1, 0] },
      { label: 'Z', color: '#9cbfe8', axis: [0, 0, 1] },
    ].flatMap(axis => [1, -1].map(sign => ({ ...axis, sign, point: rotate(axis.axis.map(n => n * sign)) })))
      .sort((a, b) => a.point[2] - b.point[2]);
    axisParts.innerHTML = axes.map(({ label, color, sign, point: [px, py, pz] }) => {
      const cx = 40 + px * 26, cy = 42 - py * 26, opacity = pz < -.1 ? .46 : 1;
      return `<g opacity="${opacity}" style="color:${color}"><path d="M40 42L${cx.toFixed(2)} ${cy.toFixed(2)}" stroke="currentColor" stroke-width="${sign > 0 ? 1.6 : 1}"/><circle cx="${cx.toFixed(2)}" cy="${cy.toFixed(2)}" r="${sign > 0 ? 8 : 3}" fill="${sign > 0 ? color : '#25313a'}" stroke="currentColor"/>${sign > 0 ? `<text x="${cx.toFixed(2)}" y="${(cy + .4).toFixed(2)}">${label}</text>` : ''}</g>`;
    }).join('');
  }

  function update(state = {}) {
    if (disposed) return;
    const orthographic = state.projection === 'orthographic';
    if (state.projection !== lastProjection) {
      lastProjection = state.projection;
      projection.checked = orthographic;
      focal.disabled = orthographic;
      root.dataset.projection = orthographic ? 'orthographic' : 'perspective';
      hint.textContent = orthographic ? 'Perspective only' : 'Drag dial to adjust';
      if (orthographic && dragging) endDrag();
    }
    const nextView = VIEWS.some(([id]) => id === state.view) ? state.view : 'custom';
    if (lastView !== nextView) {
      lastView = nextView;
      buttons.forEach(button => button.setAttribute('aria-pressed', `${button.dataset.cameraView === nextView}`));
      viewName.textContent = nextView === 'custom' ? 'ORBIT' : nextView.toUpperCase();
    }
    paintFocal(state.focalLength ?? lastFocal);
    paintOrientation(state.quaternion || [0, 0, 0, 1]);
  }

  buttons.forEach(button => listen(button, 'click', () => onView?.(button.dataset.cameraView)));
  listen(projection, 'change', () => onProjection?.(projection.checked ? 'orthographic' : 'perspective'));
  listen(focal, 'input', () => { paintFocal(focal.value); onFocalLength?.(Number(focal.value)); });

  function angleAt(event) {
    const rect = dial.getBoundingClientRect();
    const dx = event.clientX - rect.left - rect.width / 2, dy = event.clientY - rect.top - rect.height / 2;
    return { angle: Math.atan2(dx, -dy) * 180 / Math.PI, distance: Math.hypot(dx, dy), radius: rect.width / 2 };
  }
  function setAngle(angle) {
    const next = clampFocal(MIN_FOCAL + Math.max(0, Math.min(270, angle + 135)) / 270 * (MAX_FOCAL - MIN_FOCAL));
    if (next === Number(focal.value)) return;
    paintFocal(next);
    focal.dispatchEvent(new Event('input', { bubbles: true }));
  }
  function endDrag() {
    if (!dragging) return;
    if (focal.hasPointerCapture(dragging.id)) focal.releasePointerCapture(dragging.id);
    dragging = null;
    root.classList.remove('camera-dragging');
  }
  listen(focal, 'pointerdown', event => {
    if (focal.disabled || event.button !== 0) return;
    event.preventDefault();
    focal.focus({ preventScroll: true });
    const { angle, distance, radius } = angleAt(event);
    const startingAngle = distance > radius * .3 ? Math.max(-135, Math.min(135, angle)) : -135 + (Number(focal.value) - MIN_FOCAL) / (MAX_FOCAL - MIN_FOCAL) * 270;
    dragging = { id: event.pointerId, lastAngle: distance > radius * .3 ? angle : null, angle: startingAngle };
    focal.setPointerCapture(event.pointerId);
    root.classList.add('camera-dragging');
    setAngle(startingAngle);
  });
  listen(focal, 'pointermove', event => {
    if (dragging?.id !== event.pointerId) return;
    event.preventDefault();
    const { angle, distance } = angleAt(event);
    if (distance < 6) return;
    // A center press has no meaningful angle. Establish the first outward
    // direction without changing the retained value, then track the arc.
    if (dragging.lastAngle === null) { dragging.lastAngle = angle; return; }
    let change = angle - dragging.lastAngle;
    if (change > 180) change -= 360;
    if (change < -180) change += 360;
    dragging.angle = Math.max(-135, Math.min(135, dragging.angle + change));
    dragging.lastAngle = angle;
    setAngle(dragging.angle);
  });
  listen(focal, 'pointerup', endDrag);
  listen(focal, 'pointercancel', endDrag);
  listen(focal, 'lostpointercapture', endDrag);

  update({ projection: 'perspective', focalLength: 50, view: 'iso', quaternion: [0, 0, 0, 1] });
  return {
    update,
    destroy() {
      if (disposed) return;
      endDrag(); disposed = true;
      disposers.forEach(dispose => dispose());
      root.replaceChildren();
    },
  };
}
