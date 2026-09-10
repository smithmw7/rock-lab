import { FRACTURE_DEFAULTS, sanitizeFractureOptions } from './fracture.js';

const copy = value => structuredClone(value);
const nonzero = vector => vector.some(value => Math.abs(value) > 1e-8);

/** UI adapter only. Fracture generation, physics, and scene ownership live in fracture.js. */
export function createFracturePanel(container, { onOptions = () => {}, onAction = () => {} } = {}) {
  let options = sanitizeFractureOptions(copy(FRACTURE_DEFAULTS));
  let status = { enabled: false, paused: false, busy: false, loading: false, meshes: 0, fragments: 0, generation: 0, lastFractureMs: 0 };
  const bindings = [];
  const visibility = [];
  const root = document.createElement('div');
  root.className = 'fracture-panel';
  container.replaceChildren(root);

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function note(parent, text, id) {
    const node = element('p', 'control-note', text);
    if (id) node.id = id;
    parent.append(node);
    return node;
  }
  function errorFor(input) {
    const error = element('p', 'control-note fracture-error');
    error.id = `${input.id}-error`;
    error.hidden = true;
    error.setAttribute('role', 'alert');
    input.setAttribute('aria-describedby', error.id);
    input.parentElement.append(error);
    return error;
  }
  function showError(input, error, text = '') {
    input.setCustomValidity(text);
    input.setAttribute('aria-invalid', String(Boolean(text)));
    error.textContent = text;
    error.hidden = !text;
  }
  function emit() {
    options = sanitizeFractureOptions(copy(options));
    sync();
    onOptions(copy(options));
  }
  function conditional(node, predicate) {
    visibility.push(() => { node.hidden = !predicate(options); });
    return node;
  }
  function group(title, { open = false, when } = {}) {
    const details = element('details', 'fracture-advanced');
    details.open = open;
    details.append(element('summary', '', title));
    const content = element('div', 'fracture-advanced-content');
    details.append(content);
    root.append(details);
    if (when) conditional(details, when);
    return content;
  }
  function select(parent, key, label, choices) {
    const row = element('div', 'select-row');
    const text = element('label', '', label);
    const input = element('select');
    input.id = `fr-${key}`;
    text.htmlFor = input.id;
    for (const [value, title] of choices) {
      const option = element('option', '', title);
      option.value = value;
      input.append(option);
    }
    input.addEventListener('change', () => { options[key] = input.value; emit(); });
    bindings.push(() => { input.value = options[key]; });
    row.append(text, input);
    parent.append(row);
    return row;
  }
  function range(parent, key, label, min, max, step, format = value => Number(value.toFixed(2)).toString()) {
    const row = element('div', 'slider-control');
    const text = element('label', 'range-label');
    const output = element('output');
    const input = element('input');
    input.id = `fr-${key}`;
    input.type = 'range';
    input.min = min;
    input.max = max;
    input.step = step;
    text.htmlFor = input.id;
    output.htmlFor = input.id;
    text.append(element('span', '', label), output);
    row.append(text, input);
    parent.append(row);
    input.addEventListener('input', () => { options[key] = Number(input.value); emit(); });
    bindings.push(() => { input.value = options[key]; output.value = format(options[key]); });
    return row;
  }
  function check(parent, key, label) {
    const row = element('label', 'check-row');
    const input = element('input');
    input.type = 'checkbox';
    input.id = `fr-${key}`;
    row.htmlFor = input.id;
    row.append(element('span', '', label), input);
    parent.append(row);
    input.addEventListener('change', () => { options[key] = input.checked; emit(); });
    bindings.push(() => { input.checked = options[key]; });
    return row;
  }
  function vector(parent, key, label, axes, { min = -100, max = 100, step = .1, requiredNormal = false } = {}) {
    const field = element('fieldset', 'fracture-vector-field');
    const legend = element('legend', 'range-label', label);
    const row = element('div', `fracture-vector${axes.length === 2 ? ' fracture-vector-two' : ''}`);
    field.append(legend, row);
    parent.append(field);
    const inputs = axes.map((axis, index) => {
      const cell = element('div');
      const text = element('label', '', axis);
      const input = element('input');
      input.id = `fr-${key}-${axis.toLowerCase()}`;
      input.type = 'number';
      input.min = min;
      input.max = max;
      input.step = step;
      input.setAttribute('aria-label', `${label}, ${axis}`);
      text.htmlFor = input.id;
      cell.append(text, input);
      row.append(cell);
      input.addEventListener('change', () => {
        const values = inputs.map(control => control.value === '' ? NaN : Number(control.value));
        const valid = values.every(value => Number.isFinite(value) && value >= min && value <= max);
        const message = !valid ? `Enter ${axes.length} numbers between ${min} and ${max}.`
          : requiredNormal && !nonzero(values) ? 'The normal needs at least one non-zero component.' : '';
        inputs.forEach(control => { control.setCustomValidity(message); control.setAttribute('aria-invalid', String(Boolean(message))); });
        error.textContent = message;
        error.hidden = !message;
        if (!message) { options[key] = values; emit(); }
      });
      bindings.push(() => {
        input.value = options[key][index];
      });
      return input;
    });
    const error = element('p', 'control-note fracture-error');
    error.id = `fr-${key}-error`;
    error.hidden = true;
    error.setAttribute('role', 'alert');
    inputs.forEach(input => input.setAttribute('aria-describedby', error.id));
    field.append(error);
    return field;
  }
  function action(parent, id, title, actionName, className) {
    const button = element('button', className, title);
    button.type = 'button';
    button.id = id;
    button.addEventListener('click', () => onAction(actionName));
    parent.append(button);
    return button;
  }

  const heading = element('div', 'section-title');
  heading.append(element('span', '', '01'), element('h2', '', 'Destruction playground'));
  root.append(heading);
  const enabledRow = element('label', 'check-row');
  const enabled = element('input');
  enabled.type = 'checkbox';
  enabled.id = 'fr-enabled';
  enabled.setAttribute('role', 'switch');
  enabledRow.htmlFor = enabled.id;
  enabledRow.append(element('span', '', 'Tap destruction'), enabled);
  root.append(enabledRow);
  enabled.addEventListener('change', () => {
    status.enabled = enabled.checked;
    syncStatus();
    onAction('enable', enabled.checked);
  });
  const hint = note(root, '', 'fr-hint');
  const actions = element('div', 'fracture-actions');
  const breakButton = action(actions, 'fr-break', 'Break asset', 'break', 'fracture-action-primary');
  const resetButton = action(actions, 'fr-reset', 'Reset destruction', 'reset');
  const pauseButton = element('button', '', 'Pause debris');
  pauseButton.type = 'button';
  pauseButton.id = 'fr-pause';
  pauseButton.setAttribute('aria-pressed', 'false');
  pauseButton.addEventListener('click', () => {
    status.paused = !status.paused;
    syncStatus();
    onAction('pause', status.paused);
  });
  actions.append(pauseButton);
  root.append(actions);
  const statsLine = element('p', 'fracture-status');
  statsLine.id = 'fr-stats';
  statsLine.setAttribute('role', 'status');
  statsLine.setAttribute('aria-live', 'polite');
  root.append(statsLine);
  const statusMessage = note(root, '', 'fr-message');
  const materialActions = element('div', 'fracture-material-actions');
  materialActions.setAttribute('role', 'group');
  materialActions.setAttribute('aria-label', 'Edit fracture materials');
  action(materialActions, 'fr-outer', 'Outer material', 'outer');
  action(materialActions, 'fr-inner', 'Inner material', 'inner');
  root.append(materialActions);
  note(root, 'Outer material covers the original surface. Inner material appears on fresh cuts.');

  select(root, 'method', 'Fracture method', [['voronoi', 'Voronoi cells'], ['simple', 'Simple planes'], ['slice', 'Single slice']]);
  conditional(range(root, 'fragmentCount', 'Fragments per hit', 2, 48, 1), value => value.method !== 'slice' && !(value.method === 'voronoi' && value.seedPoints.length));
  const seedRow = element('div', 'seed-row');
  const seedLabel = element('label', '', 'Fracture seed');
  const seed = element('input');
  seed.id = 'fr-seed';
  seed.type = 'number';
  seed.min = 0;
  seed.max = 4294967295;
  seed.step = 1;
  seedLabel.htmlFor = seed.id;
  seedRow.append(seedLabel, seed);
  root.append(seedRow);
  const seedError = errorFor(seed);
  seed.addEventListener('change', () => {
    const value = Number(seed.value);
    const valid = seed.value !== '' && Number.isInteger(value) && value >= 0 && value <= 4294967295;
    showError(seed, seedError, valid ? '' : 'Enter a whole seed from 0 to 4294967295.');
    if (valid) { options.seed = value; emit(); }
  });
  bindings.push(() => { seed.value = options.seed; });
  conditional(seedRow, value => value.method !== 'slice');

  const voronoi = group('Voronoi pattern', { open: true, when: value => value.method === 'voronoi' });
  select(voronoi, 'mode', 'Pattern mode', [['3D', '3D volume'], ['2.5D', '2.5D projected']]);
  const projection = element('div');
  voronoi.append(projection);
  conditional(projection, value => value.mode === '2.5D');
  const axisRow = select(projection, 'projectionAxis', 'Projection axis', [['auto', 'Automatic'], ['x', 'X'], ['y', 'Y'], ['z', 'Z']]);
  conditional(axisRow, value => !nonzero(value.projectionNormal));
  const customProjectionRow = element('label', 'check-row');
  const customProjection = element('input');
  customProjection.type = 'checkbox';
  customProjection.id = 'fr-projection-custom';
  customProjectionRow.htmlFor = customProjection.id;
  customProjectionRow.append(element('span', '', 'Custom projection normal'), customProjection);
  projection.append(customProjectionRow);
  customProjection.addEventListener('change', () => { options.projectionNormal = customProjection.checked ? [0, 1, 0] : [0, 0, 0]; emit(); });
  bindings.push(() => { customProjection.checked = nonzero(options.projectionNormal); });
  conditional(vector(projection, 'projectionNormal', 'Projection normal', ['X', 'Y', 'Z'], { min: -1, max: 1, step: .05, requiredNormal: true }), value => nonzero(value.projectionNormal));
  note(projection, '2.5D projects a flat fracture pattern through the asset, useful for slabs and walls. A custom normal overrides the axis.');
  const impact = element('div');
  voronoi.append(impact);
  conditional(impact, value => value.seedPoints.length === 0);
  check(impact, 'impactEnabled', 'Focus fragments at impact');
  const impactControls = element('div');
  impact.append(impactControls);
  conditional(impactControls, value => value.impactEnabled);
  select(impactControls, 'impactSource', 'Impact position', [['tap', 'Tapped point'], ['custom', 'Local point']]);
  conditional(vector(impactControls, 'impactPoint', 'Local impact point', ['X', 'Y', 'Z']), value => value.impactSource === 'custom');
  range(impactControls, 'impactRadius', 'Impact radius', .05, 5, .05, value => `${Number(value.toFixed(2))} units`);
  note(impactControls, 'Smaller radii concentrate the cells near the impact. Local points use the selected piece’s coordinates.');

  const simple = group('Simple cut axes', { open: true, when: value => value.method === 'simple' });
  const axesError = note(simple, '', 'fr-axes-error');
  axesError.classList.add('fracture-error');
  axesError.setAttribute('role', 'alert');
  axesError.hidden = true;
  for (const axis of ['x', 'y', 'z']) {
    const row = element('label', 'check-row');
    const input = element('input');
    input.type = 'checkbox';
    input.id = `fr-axis-${axis}`;
    row.htmlFor = input.id;
    row.append(element('span', '', `Cut along ${axis.toUpperCase()}`), input);
    simple.append(row);
    input.addEventListener('change', () => {
      const next = { ...options.fracturePlanes, [axis]: input.checked };
      if (!Object.values(next).some(Boolean)) {
        input.checked = true;
        axesError.textContent = 'Keep at least one cut axis selected.';
        axesError.hidden = false;
        return;
      }
      axesError.hidden = true;
      options.fracturePlanes = next;
      emit();
    });
    bindings.push(() => { input.checked = options.fracturePlanes[axis]; });
  }
  note(simple, 'Plane-based cuts are faster and create a more angular pattern.');

  const slice = group('Slice plane', { open: true, when: value => value.method === 'slice' });
  select(slice, 'sliceSpace', 'Plane coordinates', [['world', 'World'], ['local', 'Local to piece']]);
  vector(slice, 'sliceNormal', 'Plane normal', ['X', 'Y', 'Z'], { min: -1, max: 1, step: .05, requiredNormal: true });
  vector(slice, 'sliceOrigin', 'Plane origin', ['X', 'Y', 'Z']);
  note(slice, 'The plane must intersect the piece. World uses scene coordinates; local uses the selected piece’s coordinates.');

  const seeds = group('Custom Voronoi seed points', { when: value => value.method === 'voronoi' });
  const pointsLabel = element('label', 'range-label', 'Local X, Y, Z, one point per line');
  const points = element('textarea', 'fracture-textarea');
  points.id = 'fr-seedPoints';
  points.rows = 5;
  points.spellcheck = false;
  points.placeholder = '-0.5, 0, 0\n0.5, 0, 0';
  pointsLabel.htmlFor = points.id;
  seeds.append(pointsLabel, points);
  const pointsError = errorFor(points);
  const pointsActions = element('div', 'fracture-material-actions');
  const applyPoints = element('button', '', 'Apply points');
  const clearPoints = element('button', '', 'Clear points');
  applyPoints.type = clearPoints.type = 'button';
  applyPoints.id = 'fr-apply-points';
  clearPoints.id = 'fr-clear-points';
  pointsActions.append(applyPoints, clearPoints);
  seeds.append(pointsActions);
  const pointsNote = note(seeds, 'Use 2 to 48 distinct points in the selected piece’s local coordinates. Applied points replace automatic count and impact placement.');
  pointsNote.id = 'fr-points-note';
  points.setAttribute('aria-describedby', `${pointsError.id} ${pointsNote.id}`);
  function parsePoints() {
    const lines = points.value.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    let message = '';
    const parsed = lines.map(line => line.split(/[\s,]+/).map(part => part === '' ? NaN : Number(part)));
    const bad = parsed.findIndex(point => point.length !== 3 || point.some(value => !Number.isFinite(value)));
    if (bad >= 0) message = `Point ${bad + 1} needs exactly three finite numbers: X, Y, Z.`;
    else if (parsed.some(point => point.some(value => Math.abs(value) > 100))) message = 'Keep seed coordinates between -100 and 100 local units.';
    else if (lines.length === 1 || lines.length > 48) message = 'Enter 2 to 48 points, or clear the field for automatic seeds.';
    else if (new Set(parsed.map(point => point.join(','))).size !== parsed.length) message = 'Each seed point must be unique. Remove the repeated point.';
    showError(points, pointsError, message);
    applyPoints.disabled = Boolean(message);
    return message ? null : parsed;
  }
  points.addEventListener('input', parsePoints);
  applyPoints.addEventListener('click', () => {
    const parsed = parsePoints();
    if (!parsed) return;
    options.seedPoints = parsed;
    emit();
    statusMessage.textContent = parsed.length ? `${parsed.length} custom seed points applied to the next fracture.` : 'Automatic seed placement restored.';
    statusMessage.hidden = false;
  });
  clearPoints.addEventListener('click', () => {
    points.value = '';
    options.seedPoints = [];
    parsePoints();
    emit();
  });

  const approximation = group('Voronoi performance', { when: value => value.method === 'voronoi' });
  check(approximation, 'useApproximation', 'Use nearest-neighbor approximation');
  conditional(range(approximation, 'approximationNeighborCount', 'Neighbors per cell', 4, 48, 1), value => value.useApproximation);
  note(approximation, 'Approximation is faster but can create overlapping fragments. Keep it off for accurate pieces; more neighbors improves the approximation.');

  const innerUV = group('Inner face UVs');
  vector(innerUV, 'innerUVScale', 'UV scale', ['U', 'V'], { min: .01, max: 20, step: .05 });
  vector(innerUV, 'innerUVOffset', 'UV offset', ['U', 'V'], { min: -20, max: 20, step: .05 });
  note(innerUV, 'Changes the pattern scale and offset on newly cut inner faces. Reset and fracture again to compare these settings.');

  const limits = group('Repeat fracture & limits');
  range(limits, 'maxGeneration', 'Fracture generations', 1, 4, 1);
  range(limits, 'maxFragments', 'Maximum live pieces', 16, 160, 1);
  note(limits, 'One generation allows the first break. Higher values let you fracture debris again. The live piece cap bounds scene and physics cost.');

  const physics = group('Debris physics');
  range(physics, 'impulse', 'Impact impulse', 0, 8, .1);
  range(physics, 'gravity', 'Gravity', 0, 30, .1, value => `${Number(value.toFixed(2))} m/s²`);
  range(physics, 'friction', 'Ground friction', 0, 2, .05);
  range(physics, 'restitution', 'Bounce', 0, 1, .01);

  function syncStatus() {
    enabled.checked = Boolean(status.enabled);
    pauseButton.textContent = status.paused ? 'Resume debris' : 'Pause debris';
    pauseButton.setAttribute('aria-pressed', String(Boolean(status.paused)));
    breakButton.disabled = Boolean(status.busy || status.loading);
    pauseButton.disabled = !status.enabled || Boolean(status.loading);
    resetButton.disabled = Boolean(status.busy || status.loading);
    hint.textContent = status.loading ? 'Loading the destruction simulation. The controls will become ready shortly.'
      : status.busy ? 'Generating fragments. The scene will resume when the cut is ready.'
      : !status.enabled ? 'Turn on tap destruction, then tap an asset to break it. Drag still orbits the camera.'
      : options.method === 'slice' ? 'Tap a piece to cut it with the configured plane. Drag to orbit.'
      : status.paused ? 'Debris is paused. Tap a piece to fracture it again, or resume the simulation.'
      : 'Tap an asset or a fragment to break it. Drag to orbit; Reset restores the original asset.';
    const count = Number(status.meshes ?? status.fragments ?? 0);
    const generation = Number(status.generation ?? 0);
    const ms = Number(status.lastFractureMs ?? 0);
    statsLine.textContent = `${count} active pieces · generation ${generation} · ${Number.isFinite(ms) ? ms.toFixed(1) : '0.0'} ms last fracture`;
    statusMessage.textContent = status.message || '';
    statusMessage.hidden = !statusMessage.textContent;
  }
  function sync() {
    bindings.forEach(update => update());
    visibility.forEach(update => update());
    syncStatus();
  }
  function setOptions(next) {
    options = sanitizeFractureOptions({ ...copy(FRACTURE_DEFAULTS), ...copy(next || {}) });
    root.querySelectorAll('input, textarea').forEach(input => {
      input.setCustomValidity('');
      input.removeAttribute('aria-invalid');
    });
    root.querySelectorAll('.fracture-error').forEach(error => { error.textContent = ''; error.hidden = true; });
    points.value = options.seedPoints.map(point => point.join(', ')).join('\n');
    parsePoints();
    sync();
  }
  function setStatus(next = {}) {
    status = { ...status, ...next };
    syncStatus();
  }
  setOptions(options);
  return { setOptions, setStatus, getOptions: () => copy(options) };
}
