/** A searchable object list. Browsing and keyboard focus never rebuild assets. */
export function createObjectLibrary({ root, shapes, groups, selected, onSelect }) {
  const controller = new AbortController(), { signal } = controller;
  const filters = root.querySelector('#shape-families'), list = root.querySelector('#shapes');
  const search = root.querySelector('#shape-search'), clearSearch = root.querySelector('#clear-shape-search');
  const count = root.querySelector('#shape-results'), empty = root.querySelector('#shape-empty');
  const current = root.querySelector('#shape-description');
  const total = Object.keys(shapes).length;
  const familyFor = id => groups.find(group => group.shapes.includes(id))?.id;
  const description = id => shapes[id].description || shapes[id].title || shapes[id].label;
  let family = 'all', query = '', selection = selected;
  const matches = (id, group) => `${shapes[id].label} ${description(id)} ${group.label}`.toLowerCase().includes(query.trim().toLowerCase());
  const rows = () => [...list.querySelectorAll('[data-shape]')];

  function revealRow(row) {
    if (!row || !list.clientHeight) return;
    const viewport = list.getBoundingClientRect(), box = row.getBoundingClientRect();
    // Scroll only the object list, never the surrounding inspector or page.
    if (box.top < viewport.top + 30) list.scrollTop -= viewport.top + 30 - box.top;
    else if (box.bottom > viewport.bottom - 4) list.scrollTop += box.bottom - viewport.bottom + 4;
  }
  function updateSelection() {
    const visible = rows(), selectedRow = visible.find(row => row.dataset.shape === selection);
    const focusedRow = visible.find(row => row === document.activeElement);
    for (const row of visible) {
      const active = row.dataset.shape === selection;
      row.classList.toggle('active', active); row.setAttribute('aria-pressed', String(active));
      row.tabIndex = row === (focusedRow || selectedRow || visible[0]) ? 0 : -1;
    }
    current.textContent = `Selected: ${shapes[selection]?.label || selection}`;
  }
  function render() {
    const fragment = document.createDocumentFragment();
    let visibleCount = 0;
    for (const group of groups) {
      if (family !== 'all' && family !== group.id) continue;
      const ids = group.shapes.filter(id => shapes[id] && matches(id, group));
      if (!ids.length) continue;
      visibleCount += ids.length;
      const section = document.createElement('section'); section.className = 'object-group';
      const heading = document.createElement('h3'); heading.id = `object-group-${group.id}`;
      heading.textContent = group.label;
      const groupCount = document.createElement('span'); groupCount.textContent = String(ids.length); heading.append(groupCount);
      section.setAttribute('aria-labelledby', heading.id); section.append(heading);
      for (const id of ids) {
        const entry = shapes[id], button = document.createElement('button');
        button.type = 'button'; button.className = 'object-row'; button.dataset.shape = id;
        const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        icon.setAttribute('viewBox', '0 0 32 32'); icon.setAttribute('aria-hidden', 'true');
        const outline = document.createElementNS('http://www.w3.org/2000/svg', 'path'); outline.setAttribute('d', entry.icon); icon.append(outline);
        const text = document.createElement('span'); text.className = 'object-row-copy';
        const name = document.createElement('strong'); name.textContent = entry.label;
        const detail = document.createElement('small'); detail.textContent = description(id); text.append(name, detail);
        const marker = document.createElement('span'); marker.className = 'object-selected'; marker.textContent = '✓'; marker.setAttribute('aria-hidden', 'true');
        button.append(icon, text, marker); section.append(button);
      }
      fragment.append(section);
    }
    list.replaceChildren(fragment); list.scrollTop = 0;
    list.hidden = visibleCount === 0; empty.hidden = visibleCount !== 0;
    count.textContent = visibleCount === total ? `${total} objects` : `${visibleCount} of ${total} objects`;
    clearSearch.hidden = query.length === 0;
    for (const button of filters.querySelectorAll('[data-family]')) {
      const active = button.dataset.family === family;
      button.setAttribute('aria-selected', String(active)); button.tabIndex = active ? 0 : -1;
    }
    updateSelection();
  }

  for (const group of [{ id: 'all', label: 'All' }, ...groups]) {
    const button = document.createElement('button');
    button.type = 'button'; button.role = 'tab'; button.dataset.family = group.id;
    button.setAttribute('aria-controls', 'shapes'); button.textContent = group.label;
    button.addEventListener('click', () => { family = group.id; render(); }, { signal });
    filters.append(button);
  }
  search.addEventListener('input', () => { query = search.value; render(); }, { signal });
  clearSearch.addEventListener('click', () => { query = ''; search.value = ''; render(); search.focus(); }, { signal });
  root.querySelector('#reset-shape-filters').addEventListener('click', () => { family = 'all'; query = ''; search.value = ''; render(); search.focus(); }, { signal });
  search.addEventListener('keydown', event => {
    if (event.key === 'Escape' && query) { event.preventDefault(); query = ''; search.value = ''; render(); }
    if (event.key === 'ArrowDown') { event.preventDefault(); const first = rows()[0]; first?.focus({ preventScroll: true }); revealRow(first); }
  }, { signal });
  list.addEventListener('click', event => {
    const row = event.target.closest('[data-shape]'); if (!row) return;
    selection = row.dataset.shape; updateSelection(); onSelect(selection);
  }, { signal });
  list.addEventListener('keydown', event => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End', 'PageDown', 'PageUp'].includes(event.key)) return;
    const visible = rows(), index = visible.indexOf(event.target.closest('[data-shape]'));
    if (index < 0) return;
    event.preventDefault();
    const page = Math.max(1, Math.floor(list.clientHeight / visible[index].offsetHeight) - 1);
    const step = event.key === 'PageDown' ? page : event.key === 'PageUp' ? -page : event.key === 'ArrowDown' ? 1 : -1;
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? visible.length - 1 : Math.min(visible.length - 1, Math.max(0, index + step));
    visible.forEach((row, i) => { row.tabIndex = i === next ? 0 : -1; });
    visible[next].focus({ preventScroll: true }); revealRow(visible[next]);
  }, { signal });

  render();
  return {
    select(id, { reveal = false, resetFilters = false } = {}) {
      if (!shapes[id]) return;
      selection = id;
      let changed = false;
      if (resetFilters) { family = 'all'; query = ''; search.value = ''; changed = true; }
      else if (reveal) {
        const group = groups.find(group => group.id === familyFor(id));
        if (family !== 'all' && family !== group.id) { family = group.id; changed = true; }
        if (!matches(id, group)) { query = ''; search.value = ''; changed = true; }
      }
      if (changed) render(); else updateSelection();
      if (reveal) requestAnimationFrame(() => revealRow(rows().find(row => row.dataset.shape === selection)));
    },
    getState: () => ({ family, query, selected: selection, visible: rows().map(row => row.dataset.shape), total }),
    revealSelection: () => revealRow(rows().find(row => row.dataset.shape === selection)),
    destroy() { controller.abort(); },
  };
}
