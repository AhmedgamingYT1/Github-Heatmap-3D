// Camera controls that float over a heatmap: named views (top, front, back, left, right),
// zoom in/out and back to the default. Used by the landing page and the Studio.
//
//   const pad = createViewPad(element, map, { extra: someElementToPutFirst });
//
// Colors come from CSS variables on the page (--vp-bg, --vp-line, --vp-text, --vp-muted,
// --vp-active-bg, --vp-active-text), so each page can match its own look.

const ICONS = {
  top: '<rect x="5" y="5" width="14" height="14" rx="2.5"/><path d="M9 12h6M12 9v6"/>',
  front: '<path d="M12 4v12M7 11l5 5 5-5"/><path d="M5 20h14"/>',
  back: '<path d="M12 20V8M7 13l5-5 5 5"/><path d="M5 4h14"/>',
  left: '<path d="M20 12H8M13 7l-5 5 5 5"/><path d="M4 5v14"/>',
  right: '<path d="M4 12h12M11 7l5 5-5 5"/><path d="M20 5v14"/>',
  in: '<path d="M12 6v12M6 12h12"/>',
  out: '<path d="M6 12h12"/>',
  home: '<path d="M4 12a8 8 0 1 0 2.3-5.6"/><path d="M4 4v4h4"/>',
};
const icon = (name) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;

const BUTTONS = [
  ['top', 'Top view', 'Top'],
  ['front', 'Front view', 'Front'],
  ['back', 'Back view', 'Back'],
  ['left', 'Left view', 'Left'],
  ['right', 'Right view', 'Right'],
  null,
  ['in', 'Zoom in'],
  ['out', 'Zoom out'],
  ['home', 'Reset view'],
];

export function createViewPad(container, map, { extra = null, className = '' } = {}) {
  injectStyles();
  const pad = document.createElement('div');
  pad.className = `vp ${className}`.trim();
  pad.setAttribute('role', 'toolbar');
  pad.setAttribute('aria-label', 'Camera');
  if (extra) pad.appendChild(extra);
  const views = document.createElement('div');
  views.className = 'vp-views';
  views.innerHTML = BUTTONS.map((b) =>
    b
      ? `<button type="button" data-vp="${b[0]}" aria-label="${b[1]}" title="${b[1]}">${icon(b[0])}${b[2] ? `<span>${b[2]}</span>` : ''}</button>`
      : '<i class="vp-sep" aria-hidden="true"></i>',
  ).join('');
  pad.appendChild(views);
  views.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-vp]');
    if (!b) return;
    const what = b.dataset.vp;
    if (what === 'in') map.zoomBy(0.75);
    else if (what === 'out') map.zoomBy(1.33);
    else map.viewFrom(what);
    for (const x of views.querySelectorAll('[data-vp]')) x.toggleAttribute('data-on', x === b && b.querySelector('span'));
  });
  // dragging the model leaves any named view
  container.addEventListener('pointerdown', (e) => {
    if (pad.contains(e.target)) return;
    for (const x of views.querySelectorAll('[data-on]')) x.removeAttribute('data-on');
  });
  container.appendChild(pad);
  return pad;
}

function injectStyles() {
  if (document.getElementById('vp-styles')) return;
  const style = document.createElement('style');
  style.id = 'vp-styles';
  style.textContent = `
.vp {
  position: absolute; z-index: 3; display: grid; gap: 6px; justify-items: stretch; padding: 6px; border-radius: 18px;
  background: var(--vp-bg, rgba(255, 255, 255, 0.72)); border: 1px solid var(--vp-line, rgba(0, 0, 0, 0.12));
  backdrop-filter: blur(14px) saturate(150%); -webkit-backdrop-filter: blur(14px) saturate(150%);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.12);
  font: 500 11px/1 'Geist Mono Variable', ui-monospace, SFMono-Regular, Menlo, monospace; color: var(--vp-text, #222);
  transition: opacity 0.3s, transform 0.3s;
}
.vp-views { display: grid; gap: 2px; }
.vp button {
  display: flex; align-items: center; gap: 7px; min-width: 0; height: 30px; padding: 0 9px 0 7px; margin: 0;
  border: 0; border-radius: 10px; background: transparent; color: var(--vp-muted, #666); cursor: pointer;
  font: inherit; letter-spacing: 0.02em; transition: background 0.2s, color 0.2s, transform 0.15s;
}
.vp button:hover { background: var(--vp-hover, rgba(127, 127, 127, 0.14)); color: var(--vp-text, #222); }
.vp button:active { transform: scale(0.95); }
.vp button[data-on] { background: var(--vp-active-bg, #16151a); color: var(--vp-active-text, #fff); }
.vp svg { width: 16px; height: 16px; flex: none; }
.vp-sep { height: 1px; margin: 3px 4px; background: var(--vp-line, rgba(0, 0, 0, 0.12)); }
.vp [data-vp='in'], .vp [data-vp='out'], .vp [data-vp='home'] { justify-content: center; padding: 0; }
/* phones: icons only, two to a row, so the pad stays small */
@media (max-width: 760px) {
  .vp { gap: 4px; padding: 4px; border-radius: 15px; }
  .vp-views { grid-template-columns: 1fr 1fr; }
  .vp-sep { display: none; }
  .vp button { height: 30px; width: 30px; padding: 0; justify-content: center; }
  .vp button span { display: none; }
}
`;
  document.head.appendChild(style);
}
