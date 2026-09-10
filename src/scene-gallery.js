import './scene-gallery.css';

/** The gallery only chooses content; the caller owns scene loading and backups. */
export function createSceneGallery({ presets = [], onChoose = async () => false, onRestore = async () => false } = {}) {
  const dialog = document.getElementById('scene-gallery-dialog');
  const opener = document.getElementById('open-scene-gallery');
  const closeButton = document.getElementById('close-scene-gallery');
  const restoreButton = document.getElementById('restore-previous-scene');
  const grid = document.getElementById('scene-gallery-grid');
  const heading = document.getElementById('scene-gallery-title');
  const status = document.getElementById('scene-gallery-status');
  const controller = new AbortController();
  const listen = (node, event, handler) => node.addEventListener(event, handler, { signal: controller.signal });
  const cards = new Map();
  const entries = new Map();
  let state = { activeId: null, canRestore: false, busy: false };
  let pending = false;
  let destroyed = false;
  let restoreFocus = null;
  let nextFocus = null;
  let pointerStartedOutside = false;

  grid.replaceChildren();
  for (const preset of presets) {
    const id = String(preset.id);
    const title = preset.title ?? preset.label ?? preset.name ?? 'Scene';
    const description = preset.description ?? '';
    const count = Number(preset.objectCount ?? 0);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'scene-gallery-card';
    button.dataset.scenePreset = id;
    const preview = document.createElement('span');
    preview.className = 'scene-gallery-preview';
    const image = document.createElement('img');
    image.src = preset.thumbnail ?? preset.image ?? '';
    image.alt = '';
    image.width = 640;
    image.height = 400;
    image.loading = 'lazy';
    image.decoding = 'async';
    preview.append(image);
    const badge = document.createElement('span');
    badge.className = 'scene-gallery-current';
    badge.textContent = 'Current example';
    badge.hidden = true;
    preview.append(badge);
    const text = document.createElement('span');
    text.className = 'scene-gallery-card-body';
    const name = document.createElement('strong');
    name.textContent = title;
    const detail = document.createElement('span');
    detail.className = 'scene-gallery-card-description';
    detail.textContent = description;
    const meta = document.createElement('span');
    meta.className = 'scene-gallery-card-meta';
    const objectCount = document.createElement('span');
    objectCount.textContent = `${count} object${count === 1 ? '' : 's'}`;
    const arrow = document.createElement('span');
    arrow.className = 'scene-gallery-card-arrow';
    arrow.setAttribute('aria-hidden', 'true');
    arrow.textContent = '↗';
    meta.append(objectCount, arrow);
    text.append(name, detail, meta);
    button.append(preview, text);
    grid.append(button);
    entries.set(id, { ...preset, title });
    cards.set(id, button);
  }

  function sync() {
    const busy = pending || Boolean(state.busy);
    dialog.setAttribute('aria-busy', String(busy));
    grid.setAttribute('aria-busy', String(busy));
    opener.disabled = busy;
    closeButton.disabled = busy;
    for (const [id, card] of cards) {
      card.disabled = busy;
      const active = id === String(state.activeId);
      if (active) card.setAttribute('aria-current', 'true');
      else card.removeAttribute('aria-current');
      card.querySelector('.scene-gallery-current').hidden = !active;
    }
    restoreButton.hidden = !state.canRestore;
    restoreButton.disabled = busy || !state.canRestore;
  }

  function returnFocus() {
    let target = nextFocus ?? restoreFocus ?? opener;
    if (target?.disabled) target = document.querySelector('.scene-mode-switch [aria-pressed="true"]');
    if (!destroyed && target?.isConnected && !target.closest('[hidden]') && !target.disabled) target.focus({ preventScroll: true });
  }

  function close({ focusScene = false, force = false } = {}) {
    // Keep the workspace inert until a load/restore has completely settled.
    if (!dialog.open || (!force && (pending || state.busy))) return;
    nextFocus = focusScene && !document.getElementById('tab-scene')?.hidden
      ? document.getElementById('tab-scene') : restoreFocus;
    dialog.close();
    returnFocus();
  }

  async function run(action, id) {
    if (destroyed || pending || state.busy || (action === 'restore' && !state.canRestore)) return;
    const preset = entries.get(id);
    if (action === 'choose' && !preset) return;
    pending = true;
    status.textContent = action === 'restore' ? 'Restoring your previous scene…' : `Loading ${preset.title}…`;
    sync();
    try {
      const success = action === 'restore' ? await onRestore() : await onChoose(id);
      if (destroyed) return;
      if (success === true) {
        status.textContent = '';
        close({ focusScene: true, force: true });
      } else {
        status.textContent = action === 'restore' ? 'The previous scene could not be restored. Try again.' : 'This scene could not be loaded. Try again.';
      }
    } catch (error) {
      if (!destroyed) status.textContent = error instanceof Error && error.message
        ? `Could not load the scene: ${error.message}` : 'The scene could not be loaded. Try again.';
    } finally {
      pending = false;
      if (!destroyed) {
        sync();
        const actionButton = action === 'restore' ? restoreButton : cards.get(id);
        if (dialog.open && actionButton && !actionButton.disabled) actionButton.focus({ preventScroll: true });
      }
    }
  }

  function open() {
    if (destroyed || dialog.open || pending || state.busy) return;
    restoreFocus = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : opener;
    nextFocus = null;
    status.textContent = '';
    sync();
    dialog.showModal();
    opener.setAttribute('aria-expanded', 'true');
    heading.focus({ preventScroll: true });
  }

  listen(opener, 'click', open);
  listen(closeButton, 'click', () => close());
  listen(restoreButton, 'click', () => { void run('restore'); });
  listen(grid, 'click', event => {
    const card = event.target.closest('[data-scene-preset]');
    if (card && grid.contains(card)) void run('choose', card.dataset.scenePreset);
  });
  listen(dialog, 'cancel', event => { event.preventDefault(); close(); });
  listen(dialog, 'close', () => {
    opener.setAttribute('aria-expanded', 'false');
    returnFocus();
  });
  const outside = event => {
    const rect = dialog.getBoundingClientRect();
    return event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom;
  };
  listen(dialog, 'pointerdown', event => { pointerStartedOutside = event.target === dialog && outside(event); });
  listen(dialog, 'click', event => {
    if (pointerStartedOutside && event.target === dialog && outside(event)) close();
    pointerStartedOutside = false;
  });
  listen(dialog, 'pointercancel', () => { pointerStartedOutside = false; });

  sync();
  return {
    open,
    close,
    setState(next = {}) { state = { ...state, ...next }; sync(); },
    destroy() {
      if (destroyed) return;
      close({ force: true });
      destroyed = true;
      controller.abort();
      opener.disabled = false;
      opener.setAttribute('aria-expanded', 'false');
      grid.replaceChildren();
    },
  };
}
