function svg(path) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
}

const icons = {
  select: svg('<path d="m5 3 6.5 16 2.3-6.2 6.2-2.3L5 3Z"/>'),
  pan: svg('<path d="M8 11V6a1.5 1.5 0 0 1 3 0v4-6a1.5 1.5 0 0 1 3 0v6-4a1.5 1.5 0 0 1 3 0v6-2a1.5 1.5 0 0 1 3 0v3c0 5-3 8-8 8h-1c-3 0-5-2-7-5l-2-3a1.6 1.6 0 0 1 2.5-2L8 13"/>'),
  wall: svg('<path d="M3 8h18v8H3z"/><path d="M7 8v8M17 8v8"/>'),
  window: svg('<rect x="4" y="6" width="16" height="12"/><path d="M8 6v12M16 6v12M4 12h16"/>'),
  line: svg('<path d="M5 19 19 5"/><circle cx="5" cy="19" r="1.5"/><circle cx="19" cy="5" r="1.5"/>'),
  rectangle: svg('<rect x="4" y="6" width="16" height="12" rx="1"/>'),
  measure: svg('<path d="M4 16 16 4l4 4L8 20z"/><path d="m10 10 2 2m1-5 2 2"/>'),
  text: svg('<path d="M5 5h14M12 5v14M8 19h8"/>'),
  door: svg('<path d="M5 20V5h10v15"/><path d="M15 20h4"/><circle cx="12" cy="13" r=".7" fill="currentColor"/>'),
  erase: svg('<path d="m7 17-3-3 9-9 6 6-9 9H7Z"/><path d="m11 7 6 6M10 20h10"/>'),
  clean: svg('<rect x="5" y="5" width="14" height="14" rx="2"/><path d="m8 12 3 3 5-6"/>'),
  scale: svg('<path d="M4 18 18 4l2 2L6 20z"/><path d="m10 12 2 2m1-5 2 2"/>'),
  toilet: svg('<ellipse cx="12" cy="14" rx="5" ry="6"/><rect x="8" y="4" width="8" height="4" rx="1"/><ellipse cx="12" cy="14" rx="2.2" ry="3"/>'),
  sink: svg('<rect x="5" y="7" width="14" height="10" rx="3"/><ellipse cx="12" cy="12" rx="4" ry="2.5"/><path d="M12 7V4"/>'),
  shower: svg('<rect x="5" y="5" width="14" height="14"/><path d="m5 5 14 14M16 8h.01"/>'),
  tub: svg('<rect x="4" y="7" width="16" height="10" rx="4"/><path d="M8 7V5h3"/><circle cx="17" cy="12" r=".7" fill="currentColor"/>'),
  object: svg('<rect x="5" y="5" width="14" height="14" rx="2"/><path d="M8 9h8M8 13h8M8 17h5"/>'),
};

function normalize(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function iconKey(label) {
  const value = normalize(label);
  if (value.startsWith('select')) return 'select';
  if (value.startsWith('pan')) return 'pan';
  if (value.startsWith('wall')) return 'wall';
  if (value.startsWith('window')) return 'window';
  if (value.startsWith('line')) return 'line';
  if (value.startsWith('rectangle')) return 'rectangle';
  if (value.startsWith('measure')) return 'measure';
  if (value === 'text') return 'text';
  if (['single left', 'single right', 'double', 'pocket', 'sliding', 'bifold'].some(x => value.startsWith(x)) || value.includes('door')) return 'door';
  if (value.includes('brush erase')) return 'erase';
  if (value.includes('clean area')) return 'clean';
  if (value.includes('blueprint scale')) return 'scale';
  if (value.startsWith('toilet')) return 'toilet';
  if (value.startsWith('sink')) return 'sink';
  if (value.startsWith('shower')) return 'shower';
  if (value.startsWith('bathtub')) return 'tub';
  return 'object';
}

function applyEditorIcons() {
  document.querySelectorAll('.tool').forEach(button => {
    const icon = button.querySelector('.toolIcon');
    if (!icon) return;

    const labelNode = Array.from(button.children).find(
      node => node.tagName === 'SPAN' && !node.classList.contains('toolIcon')
    );
    const label = labelNode?.textContent || button.textContent || '';
    const key = iconKey(label);

    if (icon.dataset.polishedIcon === key) return;
    icon.innerHTML = icons[key] || icons.object;
    icon.dataset.polishedIcon = key;
  });
}

let queued = false;
function queueApply() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => {
    queued = false;
    applyEditorIcons();
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', queueApply, { once: true });
} else {
  queueApply();
}

const observer = new MutationObserver(queueApply);
observer.observe(document.documentElement, { childList: true, subtree: true });
