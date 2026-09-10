/** Accessible application menus. Native buttons retain their existing actions. */
export function setupMenus(root, { onAction = () => {}, getState = () => ({}) } = {}) {
  const controller = new AbortController(), { signal } = controller;
  const triggers = [...root.querySelectorAll('.app-menu-trigger')];
  const panels = triggers.map(trigger => document.getElementById(trigger.getAttribute('aria-controls')));
  let active = -1, typeahead = '', lastTyped = 0;
  const items = index => [...panels[index].querySelectorAll('[role^="menuitem"]')].filter(item => !item.disabled && !item.hidden);
  for (const panel of panels) for (const item of panel.querySelectorAll('[role^="menuitem"]')) item.tabIndex = -1;

  function refresh() {
    const state = getState();
    for (const item of root.querySelectorAll('[aria-checked]')) {
      const action = item.dataset.menuAction;
      item.setAttribute('aria-checked', String(action === 'single' || action === 'lineup' ? state.viewMode === action : action === 'turntable' ? !!state.rotation : !!state.wireframe));
    }
  }
  function position() {
    if (active < 0) return;
    const trigger = triggers[active].getBoundingClientRect(), panel = panels[active];
    panel.style.left = `${Math.max(8, Math.min(trigger.left, window.innerWidth - panel.offsetWidth - 8))}px`;
    panel.style.top = `${trigger.bottom + 8}px`;
    panel.style.maxHeight = `${Math.max(120, window.innerHeight - trigger.bottom - 24)}px`;
  }
  function close(restoreFocus = false) {
    if (active < 0) return;
    const trigger = triggers[active];
    panels[active].hidden = true; trigger.setAttribute('aria-expanded', 'false');
    active = -1; typeahead = '';
    if (restoreFocus) trigger.focus();
  }
  function focusTrigger(index) {
    triggers.forEach((trigger, i) => { trigger.tabIndex = i === index ? 0 : -1; });
    triggers[index].focus();
  }
  function open(index, last = false) {
    close(); refresh(); active = index;
    triggers.forEach((trigger, i) => { trigger.tabIndex = i === index ? 0 : -1; });
    panels[index].hidden = false; triggers[index].setAttribute('aria-expanded', 'true');
    position(); const options = items(index);
    options[last ? options.length - 1 : 0]?.focus();
  }
  triggers.forEach((trigger, index) => {
    trigger.addEventListener('click', () => active === index ? close(true) : open(index), { signal });
    trigger.addEventListener('pointerenter', event => { if (event.pointerType === 'mouse' && active >= 0 && active !== index) open(index); }, { signal });
  });
  root.addEventListener('click', event => {
    const item = event.target.closest('[role^="menuitem"]');
    if (!item || item.classList.contains('app-menu-trigger')) return;
    close(true);
    if (item.dataset.menuAction) onAction(item.dataset.menuAction);
    refresh();
  }, { signal });
  root.addEventListener('keydown', event => {
    const triggerIndex = triggers.indexOf(event.target);
    if (event.key === 'Escape') { event.preventDefault(); close(true); return; }
    if (event.key === 'Tab' && active >= 0) { close(true); return; }
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      const index = (Math.max(active, triggerIndex, 0) + (event.key === 'ArrowRight' ? 1 : -1) + triggers.length) % triggers.length;
      if (active >= 0) open(index); else focusTrigger(index);
      return;
    }
    if (triggerIndex >= 0) {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); open(triggerIndex, event.key === 'ArrowUp'); }
      if (event.key === 'Home' || event.key === 'End') { event.preventDefault(); focusTrigger(event.key === 'Home' ? 0 : triggers.length - 1); }
      return;
    }
    if (active < 0) return;
    if (event.key === ' ' && event.target.tagName === 'A') { event.preventDefault(); event.target.click(); return; }
    const options = items(active), current = options.indexOf(document.activeElement);
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 : (current + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length;
      options[next]?.focus();
    } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey && event.key !== ' ') {
      event.preventDefault();
      const now = performance.now();
      typeahead = now - lastTyped < 600 ? typeahead + event.key.toLowerCase() : event.key.toLowerCase(); lastTyped = now;
      const ordered = [...options.slice(current + 1), ...options.slice(0, current + 1)];
      ordered.find(item => item.textContent.trim().toLowerCase().startsWith(typeahead))?.focus();
    }
  }, { signal });
  document.addEventListener('pointerdown', event => { if (!root.contains(event.target)) close(); }, { signal });
  document.addEventListener('focusin', event => { if (!root.contains(event.target)) close(); }, { signal });
  document.addEventListener('scroll', event => { if (!root.contains(event.target)) close(); }, { capture: true, signal });
  window.addEventListener('resize', position, { signal });
  return { close, refresh, destroy() { close(); controller.abort(); } };
}
