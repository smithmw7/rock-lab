import './scene.css';

const AXES = ['x', 'y', 'z'];
const TRANSFORMS = ['position', 'rotation', 'scale'];
const NUMBER_SETTINGS = {
  'scene-snap-distance': 'snapDistance',
  'scene-translation-snap': 'translationSnap',
  'scene-rotation-snap': 'rotationSnap',
  'scene-scale-snap': 'scaleSnap',
};
const SNAP_DEFAULTS = { snapMode: 'surface', snapDistance: 0.3, translationSnap: 0.25, rotationSnap: 15, scaleSnap: 0.1 };
const noOp = () => {};
const formatNumber = value => Number.isFinite(Number(value)) ? String(Number(Number(value).toFixed(4))) : '';

/** DOM-only scene inspector. Scene ownership and all three-dimensional edits stay in the caller. */
export function createScenePanel({
  onMode = noOp, onAction = noOp, onSettings = noOp,
  onTransform = noOp, onSelect = noOp, onRename = noOp,
} = {}) {
  const byId = id => document.getElementById(id);
  const stage = byId('stage');
  const toolbar = byId('scene-toolbar');
  const list = byId('scene-objects');
  const name = byId('scene-name');
  const modeButtons = [byId('mode-object'), byId('mode-scene')];
  const tools = [...toolbar.querySelectorAll('[data-scene-tool]')];
  const vectors = Object.fromEntries(TRANSFORMS.map(key => [key, AXES.map(axis => byId(`scene-${key}-${axis}`))]));
  const rows = new Map();
  const controller = new AbortController();
  const listen = (node, event, handler) => node.addEventListener(event, handler, { signal: controller.signal });
  let current = { active: false, objects: [], selection: null, selectedId: null, settings: { ...SNAP_DEFAULTS } };
  let previousSelection;
  let frameRequest;

  function setValue(input, value, force = false) {
    // A render/drag tick must not interrupt a partially typed number or a rename.
    if (force || document.activeElement !== input) input.value = value;
  }

  function updateToolbarHeight() {
    if (!toolbar.hidden) stage.style.setProperty('--scene-toolbar-height', `${toolbar.getBoundingClientRect().height}px`);
  }

  modeButtons.forEach((button, index) => {
    listen(button, 'click', () => onMode(index ? 'scene' : 'object'));
    listen(button, 'keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const target = event.key === 'Home' ? 0 : event.key === 'End' ? 1 : 1 - index;
      modeButtons[target].focus();
      onMode(target ? 'scene' : 'object');
    });
  });

  tools.forEach(button => listen(button, 'click', () => onSettings({ tool: button.dataset.sceneTool })));
  for (const action of ['add', 'duplicate', 'delete', 'frame', 'frame-all', 'undo', 'redo']) {
    listen(byId(`scene-${action}`), 'click', () => onAction(action));
  }
  for (const key of ['snap', 'grid']) {
    listen(byId(`scene-${key}`), 'change', event => onSettings({ [key]: event.target.checked }));
  }
  listen(byId('scene-space'), 'change', event => onSettings({ space: event.target.value }));
  listen(byId('scene-snap-mode'), 'change', event => onSettings({ snapMode: event.target.value }));
  listen(byId('scene-render-mode'), 'change', event => onSettings({ renderMode: event.target.value }));

  function numericCommit(input, commit, fallback) {
    listen(input, 'change', () => {
      const value = input.value.trim() ? Number(input.value) : NaN;
      if (!Number.isFinite(value) || (input.min !== '' && value < Number(input.min)) || (input.max !== '' && value > Number(input.max))) {
        setValue(input, formatNumber(fallback()), true);
        return;
      }
      commit(value);
    });
    listen(input, 'keydown', event => {
      if (event.key === 'Enter') input.blur();
      if (event.key === 'Escape') {
        event.preventDefault();
        setValue(input, formatNumber(fallback()), true);
        input.blur();
      }
    });
    listen(input, 'blur', () => setValue(input, formatNumber(fallback()), true));
  }

  for (const [id, key] of Object.entries(NUMBER_SETTINGS)) {
    numericCommit(byId(id), value => onSettings({ [key]: value }), () => current.settings[key]);
  }
  for (const key of TRANSFORMS) vectors[key].forEach((input, axis) => {
    numericCommit(input, value => {
      if (!current.selection) return;
      const vector = [...current.selection[key]];
      vector[axis] = value;
      onTransform({ [key]: vector });
    }, () => current.selection?.[key]?.[axis]);
  });

  listen(name, 'change', () => {
    if (current.selection) onRename(name.value.trim() || current.selection.name);
  });
  listen(name, 'keydown', event => {
    if (event.key === 'Enter') name.blur();
    if (event.key === 'Escape') {
      event.preventDefault();
      setValue(name, current.selection?.name ?? '', true);
      name.blur();
    }
  });
  listen(name, 'blur', () => setValue(name, current.selection?.name ?? '', true));

  listen(list, 'click', event => {
    const row = event.target.closest('[data-scene-object]');
    if (row && list.contains(row)) onSelect(row.dataset.sceneObject);
  });
  listen(list, 'keydown', event => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    const items = [...list.querySelectorAll('[data-scene-object]')];
    if (!items.length) return;
    const index = items.indexOf(event.target.closest('[data-scene-object]'));
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1
      : Math.max(0, Math.min(items.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)));
    event.preventDefault();
    items[next].focus();
    onSelect(items[next].dataset.sceneObject);
  });

  function syncObjects(objects, selectedId) {
    const ids = new Set(objects.map(object => String(object.id)));
    for (const [id, row] of rows) if (!ids.has(id)) { row.remove(); rows.delete(id); }
    objects.forEach((object, index) => {
      const id = String(object.id);
      let row = rows.get(id);
      if (!row) {
        row = document.createElement('button');
        row.type = 'button';
        row.className = 'scene-object-row';
        row.dataset.sceneObject = id;
        row.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 8 4v10l-8 4-8-4V7Zm0 8 8-4m-8 4L4 7m8 4v10"/></svg><span><strong></strong><small></small></span>';
        rows.set(id, row);
      }
      const selected = id === String(selectedId);
      const objectName = object.name || object.label || object.shape || 'Object';
      const objectLabel = object.label || object.shape || 'Procedural object';
      const strong = row.querySelector('strong'), small = row.querySelector('small');
      if (strong.textContent !== objectName) strong.textContent = objectName;
      if (small.textContent !== objectLabel) small.textContent = objectLabel;
      const accessibleName = `${objectName}, ${objectLabel}`;
      if (row.getAttribute('aria-label') !== accessibleName) row.setAttribute('aria-label', accessibleName);
      if (row.getAttribute('aria-pressed') !== String(selected)) row.setAttribute('aria-pressed', String(selected));
      row.tabIndex = selected || (selectedId == null && index === 0) ? 0 : -1;
      // Keep row identity and focus stable across frequent gizmo updates.
      if (list.children[index] !== row) list.insertBefore(row, list.children[index] ?? null);
    });
  }

  function sync(snapshot) {
    current = { ...snapshot, objects: snapshot.objects ?? [], settings: { ...SNAP_DEFAULTS, ...snapshot.settings } };
    for (const [key, value] of Object.entries(SNAP_DEFAULTS)) current.settings[key] ??= value;
    const active = Boolean(current.active);
    const selection = current.selection;
    const history = current.history ?? {};
    byId('scene-undo').disabled = !active || !history.canUndo || current.dragging;
    byId('scene-redo').disabled = !active || !history.canRedo || current.dragging;
    byId('scene-history-status').textContent = history.canUndo ? `Undo: ${history.undoLabel} · ⌘/Ctrl Z` : 'No edits to undo · ⌘/Ctrl Z';
    const changedSelection = previousSelection !== current.selectedId;
    previousSelection = current.selectedId;
    modeButtons[0].setAttribute('aria-pressed', String(!active));
    modeButtons[1].setAttribute('aria-pressed', String(active));
    toolbar.hidden = !active;
    stage.classList.toggle('scene-active', active);
    byId('app').classList.toggle('scene-workspace', active);
    byId('tab-scene').hidden = !active;
    byId('tab-fracture').hidden = active;
    if (!active) byId('panel-scene').hidden = true;
    stage.querySelector('.view-controls').hidden = active;
    byId('frame').hidden = active;
    tools.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.sceneTool === (current.settings.tool ?? 'select'))));
    for (const action of ['duplicate', 'delete', 'frame']) byId(`scene-${action}`).disabled = !selection;
    byId('scene-frame-all').disabled = !current.objects.length;
    byId('scene-selection-controls').hidden = !selection;
    byId('scene-selection-empty').hidden = Boolean(selection);
    name.disabled = !selection;
    setValue(name, selection?.name ?? '', changedSelection);
    for (const key of TRANSFORMS) vectors[key].forEach((input, axis) => {
      input.disabled = !selection;
      setValue(input, formatNumber(selection?.[key]?.[axis]), changedSelection);
    });
    for (const key of ['snap', 'grid']) byId(`scene-${key}`).checked = Boolean(current.settings[key]);
    byId('scene-space').value = current.settings.space ?? 'world';
    const gridSnap = current.settings.snapMode === 'grid';
    byId('scene-snap-mode').value = gridSnap ? 'grid' : 'surface';
    byId('scene-snap-distance-row').hidden = gridSnap;
    byId('scene-translation-snap-row').hidden = !gridSnap;
    byId('scene-render-mode').value = current.settings.renderMode ?? 'shaded';
    for (const [id, key] of Object.entries(NUMBER_SETTINGS)) setValue(byId(id), formatNumber(current.settings[key]));
    syncObjects(current.objects, current.selectedId);
    const count = current.objects.length;
    byId('scene-object-count').textContent = `${count} object${count === 1 ? '' : 's'}`;
    byId('scene-empty').hidden = count > 0;
    list.hidden = count === 0;
    const totals = [`${count} object${count === 1 ? '' : 's'}`];
    if (Number.isFinite(current.pieces)) totals.push(`${current.pieces.toLocaleString('en-US')} meshes`);
    if (Number.isFinite(current.triangles)) totals.push(`${current.triangles.toLocaleString('en-US')} triangles`);
    const message = typeof current.message === 'string' ? current.message : typeof current.status === 'string' ? current.status : '';
    const status = message ? `${totals.join(' · ')}\n${message}` : totals.join(' · ');
    if (byId('scene-status').textContent !== status) byId('scene-status').textContent = status;
    updateToolbarHeight();
    cancelAnimationFrame(frameRequest);
    frameRequest = requestAnimationFrame(updateToolbarHeight);
  }

  const observer = new ResizeObserver(updateToolbarHeight);
  observer.observe(toolbar);
  return {
    sync,
    destroy() {
      controller.abort();
      observer.disconnect();
      cancelAnimationFrame(frameRequest);
    },
  };
}
