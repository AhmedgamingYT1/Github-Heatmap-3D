// The main site: an editor around the 3D heatmap that produces embed code.
import { createHeatmap, fmtDate } from './lib/heatmap.js';
import { computeStats } from './lib/data.js';
import { THEMES, getTheme, applyThemeToPage } from './lib/themes.js';
import { OPTIONS, parseOptions, toParams, cameraToAngles } from './lib/options.js';

const $ = (id) => document.getElementById(id);

// Public URL the snippets point at. Set VITE_SITE_URL when deploying behind another domain.
const SITE = (import.meta.env.VITE_SITE_URL || location.origin).replace(/\/$/, '');

// Which options each embed type understands.
const EMBED_KEYS = Object.keys(OPTIONS).filter((k) => k !== 'angle' && k !== 'tilt');
const README_KEYS = ['user', 'year', 'theme', 'height', 'log', 'barSize', 'shadows', 'base', 'labels', 'title', 'transparent', 'angle', 'tilt'];

// ---------- state ----------
const params = new URLSearchParams(location.search);
let state = parseOptions(params);
if (!params.has('theme')) {
  try {
    state.theme = getTheme(localStorage.getItem('theme'));
  } catch {}
}

const map = createHeatmap($('app'), state);

function update(patch) {
  state = { ...state, ...patch };
  if ('theme' in patch) state.theme = getTheme(state.theme);
  map.setOptions(patch);
  if ('theme' in patch) applyPageTheme();
  syncInputs();
  syncUrl();
  renderCode();
}

function syncUrl() {
  const url = new URL(location.href);
  url.search = toParams(state, EMBED_KEYS).toString();
  history.replaceState(null, '', url);
  try {
    localStorage.setItem('theme', state.theme);
  } catch {}
}

// ---------- page theme ----------
function applyPageTheme() {
  const theme = THEMES[state.theme];
  applyThemeToPage(theme);
  $('legend').replaceChildren(
    ...theme.levels.map((c) => Object.assign(document.createElement('i'), { style: `background:${c}` })),
  );
  for (const b of $('themes').children) b.setAttribute('aria-pressed', b.dataset.theme === state.theme);
}

for (const [id, t] of Object.entries(THEMES)) {
  const b = document.createElement('button');
  b.type = 'button';
  b.dataset.theme = id;
  b.title = t.name;
  b.setAttribute('aria-label', t.name);
  b.style.setProperty('--a', t.background);
  b.style.setProperty('--b', t.levels[3]);
  b.addEventListener('click', () => update({ theme: id }));
  $('themes').appendChild(b);
}

// ---------- option inputs (data-opt="name") ----------
const optInputs = [...document.querySelectorAll('[data-opt]')];

function syncInputs() {
  for (const input of optInputs) {
    const v = state[input.dataset.opt];
    if (input.type === 'checkbox') input.checked = v;
    else input.value = v;
  }
  $('cameraStatus').textContent = state.camera ? 'Using your saved view.' : 'Using the default view.';
}

for (const input of optInputs) {
  const key = input.dataset.opt;
  input.addEventListener(input.type === 'range' ? 'input' : 'change', () => {
    update({ [key]: input.type === 'checkbox' ? input.checked : Number(input.value) });
  });
}

// ---------- data / stats ----------
const yearSelect = $('year');
for (let y = OPTIONS.year.max; y >= OPTIONS.year.min; y--) yearSelect.add(new Option(y, y));
$('username').value = state.user;
yearSelect.value = state.year;

function setStatus(msg, isError = false) {
  $('status').textContent = msg;
  $('status').classList.toggle('error', isError);
}

map.on('loading', ({ user, year }) => setStatus(user ? `Loading ${user}'s ${year} contributions…` : ''));
map.on('error', (err) => setStatus(err.message, true));
map.on('load', ({ user, year, days }) => {
  setStatus(user ? 'Drag to rotate · scroll to zoom · right-drag to pan' : 'Showing sample data — enter a GitHub username.');
  const { total, best, longest } = computeStats(days);
  $('stats').hidden = false;
  $('total').textContent = total.toLocaleString();
  $('totalLabel').textContent = `contributions in ${year}${user ? '' : ' (sample)'}`;
  $('best').textContent = best.count ? `${best.count} · ${fmtDate(best.date, { month: 'short', day: 'numeric' })}` : '–';
  $('streak').textContent = `${longest} day${longest === 1 ? '' : 's'}`;
});

$('form').addEventListener('submit', (e) => {
  e.preventDefault();
  update({ user: $('username').value.trim(), year: Number(yearSelect.value) });
});

// ---------- buttons ----------
$('resetView').addEventListener('click', () => map.resetView());
$('exportStl').addEventListener('click', () => {
  const blob = map.exportSTL();
  if (!blob) return;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${state.user || 'sample'}-${state.year}-contributions.stl`;
  a.click();
  URL.revokeObjectURL(a.href);
});
$('saveCamera').addEventListener('click', () => update({ camera: map.getCamera() }));
$('clearCamera').addEventListener('click', () => update({ camera: null }));

// ---------- drawer ----------
function setDrawer(open) {
  $('drawer').hidden = !open;
  document.body.classList.toggle('drawer-open', open);
  if (open) renderCode();
}
$('openDrawer').addEventListener('click', () => setDrawer($('drawer').hidden));
$('closeDrawer').addEventListener('click', () => setDrawer(false));
addEventListener('keydown', (e) => e.key === 'Escape' && setDrawer(false));

// ---------- embed code ----------
let tab = 'website';

const TAB_HINTS = {
  website: 'Paste into any HTML page — fully interactive 3D.',
  script: 'Paste where the model should appear. Options are data-* attributes you can edit by hand.',
  readme: 'GitHub READMEs only allow images, so this is a 3D-style picture of your saved view. Clicking it opens the interactive 3D version.',
  link: 'A direct link to this exact view.',
};

const kebab = (s) => s.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase());
const cssSize = (v) => (/^\d+$/.test(v.trim()) ? `${v.trim()}px` : v.trim() || '100%');

function readmeParams() {
  const opts = { ...state, ...(state.camera ? cameraToAngles(state.camera) : {}) };
  return toParams(opts, README_KEYS);
}

function renderCode() {
  if ($('drawer').hidden) return;
  const embedQuery = toParams(state, EMBED_KEYS).toString();
  const pageUrl = `${SITE}/${embedQuery ? '?' + embedQuery : ''}`;
  const embedUrl = `${SITE}/embed.html${embedQuery ? '?' + embedQuery : ''}`;
  const name = state.user || 'sample';
  const w = $('embedWidth').value;
  const h = $('embedHeight').value;
  let code = '';
  let preview = pageUrl;

  if (tab === 'website') {
    code = `<iframe src="${embedUrl}"\n  style="width: ${cssSize(w)}; height: ${cssSize(h)}; border: 0"\n  title="${name}'s GitHub contributions in 3D" loading="lazy"></iframe>`;
    preview = embedUrl;
  } else if (tab === 'script') {
    const attrs = [...toParams(state, EMBED_KEYS)].map(([k, v]) => `\n  data-${kebab(k)}="${v}"`).join('');
    code = `<div data-github-heatmap-3d${attrs}\n  style="width: ${cssSize(w)}; height: ${cssSize(h)}"></div>\n<script src="${SITE}/embed.js" async></script>`;
    preview = embedUrl;
  } else if (tab === 'readme') {
    const img = `${SITE}/api/heatmap?${readmeParams()}`;
    code = `[![${name}'s GitHub contributions in 3D](${img})](${pageUrl})`;
    preview = img;
    $('readmePreview').src = `/api/heatmap?${readmeParams()}`;
  } else {
    code = pageUrl;
  }

  $('code').textContent = code;
  $('previewLink').href = preview;
  $('tabHint').textContent = TAB_HINTS[tab];
  $('sizeFields').hidden = !(tab === 'website' || tab === 'script');
  $('readmePreview').hidden = tab !== 'readme';
}

for (const b of document.querySelectorAll('[data-tab]')) {
  b.addEventListener('click', () => {
    tab = b.dataset.tab;
    for (const o of document.querySelectorAll('[data-tab]')) o.setAttribute('aria-selected', o === b);
    renderCode();
  });
}
$('embedWidth').addEventListener('input', renderCode);
$('embedHeight').addEventListener('input', renderCode);

$('copy').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText($('code').textContent);
    $('copy').textContent = 'Copied!';
  } catch {
    $('copy').textContent = 'Select & copy manually';
  }
  setTimeout(() => ($('copy').textContent = 'Copy code'), 1500);
});

// ---------- go ----------
applyPageTheme();
syncInputs();
syncUrl();
