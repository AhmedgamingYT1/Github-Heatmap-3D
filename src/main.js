// The main site: an editor around the 3D heatmap that produces embed code.
import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';
import '@fontsource-variable/doto';
import { createHeatmap, fmtDate } from './lib/heatmap.js';
import { computeStats } from './lib/data.js';
import { THEMES, getTheme, applyThemeToPage } from './lib/themes.js';
import { OPTIONS, parseOptions, toParams, cameraToAngles } from './lib/options.js';
import { STYLES, getStyle } from './lib/styles/index.js';
import { composeSong, createSongPlayer, renderSongWav } from './lib/song.js';
import { CHART_TYPES } from './lib/charts.js';
import { createViewPad } from './lib/viewpad.js';

const $ = (id) => document.getElementById(id);

// Public URL the snippets point at. Set VITE_SITE_URL when deploying behind another domain.
const SITE = (import.meta.env.VITE_SITE_URL || location.origin).replace(/\/$/, '');

// Which options each embed type understands.
const EMBED_KEYS = Object.keys(OPTIONS).filter((k) => k !== 'angle' && k !== 'tilt');
const README_KEYS = ['type', 'user', 'year', 'theme', 'height', 'log', 'barSize', 'shadows', 'base', 'labels', 'title', 'transparent', 'angle', 'tilt'];

// ---------- state ----------
const params = new URLSearchParams(location.search);
let state = parseOptions(params);
if (!params.has('theme')) {
  try {
    state.theme = getTheme(localStorage.getItem('theme'));
  } catch {}
}

// Phones: start closer (a portrait screen would show the whole board tiny) and keep forests light.
const PHONE = matchMedia('(max-width: 640px)').matches;
const HOW_TO = matchMedia('(pointer: coarse)').matches ? 'Drag to rotate · pinch to zoom' : 'Drag to rotate · scroll to zoom · right-drag to pan';
const map = createHeatmap($('app'), { ...state, homeZoom: PHONE ? 1.7 : 1, maxFps: 60, ...(PHONE && { detail: 'low', shadowMapSize: 1024, maxPixelRatio: 1.5 }) });
if (import.meta.env.DEV) window.__heatmap = map; // for debugging in the console

// ---------- camera pad + preview ----------
// Preview hides every panel so only the model is left; "Show controls" brings them back.
const previewBtn = document.createElement('button');
previewBtn.type = 'button';
previewBtn.className = 'vp-preview';
previewBtn.title = 'Preview: hide the controls';
previewBtn.innerHTML =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg><span>Preview</span>';
createViewPad(document.body, map, { extra: previewBtn, className: 'studio-pad' });
function setPreview(on) {
  document.body.classList.toggle('preview', on);
  $('exitPreview').hidden = !on;
  if (on) setDrawer(false);
}
previewBtn.addEventListener('click', () => setPreview(true));
$('exitPreview').addEventListener('click', () => setPreview(false));

// phones: the bottom sheet keeps styles and colors in view, the rest folds under "More"
$('moreToggle').addEventListener('click', () => {
  const open = !$('controls').classList.contains('open');
  $('controls').classList.toggle('open', open);
  $('moreToggle').setAttribute('aria-expanded', open);
});

function update(patch) {
  state = { ...state, ...patch };
  if ('theme' in patch) state.theme = getTheme(state.theme);
  if ('style' in patch) state.style = getStyle(state.style);
  map.setOptions(patch);
  if ('theme' in patch || 'style' in patch || 'palette' in patch) applyPageTheme();
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
  const style = STYLES[state.style];
  const theme = THEMES[style.theme || state.theme];
  applyThemeToPage(theme);
  renderSwatches(style);
  $('exportStl').disabled = !style.stl;
  $('exportStl').title = style.stl ? '' : 'STL export is available for the City styles';
  for (const b of $('styles').children) b.setAttribute('aria-checked', b.dataset.style === state.style);
  $('styles').querySelector('[aria-checked="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' }); // the phone row scrolls
  const levels = style.palettes ? (style.palettes[state.palette] ?? Object.values(style.palettes)[0]).levels : theme.levels;
  $('legend').replaceChildren(...levels.map((c) => Object.assign(document.createElement('i'), { style: `background:${c}` })));
}

for (const [id, st] of Object.entries(STYLES)) {
  const b = document.createElement('button');
  b.type = 'button';
  b.role = 'radio';
  b.dataset.style = id;
  b.innerHTML = st.pro ? `${st.name} <small>PRO</small>` : st.name;
  b.addEventListener('click', () => update({ style: id }));
  $('styles').appendChild(b);
}

// Color swatches: the City's themes, or the style's own palettes (e.g. Forest seasons).
function renderSwatches(style) {
  const box = $('themes');
  box.replaceChildren();
  box.hidden = Boolean(style.theme) && !style.palettes;
  const entries = style.palettes
    ? Object.entries(style.palettes).map(([id, p]) => [id, p.name, p.levels[0], p.levels[3], { palette: id }, state.palette])
    : Object.entries(THEMES)
        .filter(([, t]) => !t.hidden)
        .map(([id, t]) => [id, t.name, t.background, t.levels[3], { theme: id }, state.theme]);
  for (const [id, name, a, b, patch, current] of entries) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.title = name;
    btn.setAttribute('aria-label', name);
    btn.setAttribute('aria-pressed', id === current);
    btn.style.setProperty('--a', a);
    btn.style.setProperty('--b', b);
    btn.addEventListener('click', () => update(patch));
    box.appendChild(btn);
  }
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

map.on('loading', ({ user, year }) => {
  player?.pause();
  setStatus(user ? `Loading ${user}'s ${year} contributions…` : '');
});
map.on('error', (err) => setStatus(err.message, true));
map.on('building', () => setStatus('Growing your forest…'));
map.on('built', () => setStatus(HOW_TO));
map.on('load', ({ user, year, days }) => {
  setStatus(user ? HOW_TO : 'Showing sample data — enter a GitHub username.');
  const { total, best, longest } = computeStats(days);
  $('stats').hidden = false;
  $('total').textContent = total.toLocaleString();
  $('totalLabel').textContent = `contributions in ${year}${user ? '' : ' (sample)'}`;
  $('best').textContent = best.count ? `${best.count} · ${fmtDate(best.date, { month: 'short', day: 'numeric' })}` : '–';
  $('streak').textContent = `${longest} day${longest === 1 ? '' : 's'}`;
  setupSong(days, user);
});

// ---------- song ----------
let player = null;
const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

function setupSong(days, user) {
  player?.destroy();
  map.highlight(-1);
  const song = composeSong(days, user);
  $('player').hidden = false;
  $('songTitle').textContent = `“${song.title}”`;
  $('songMeta').textContent = `${song.artist} · ${song.key} · ${song.bpm} bpm · ${fmtTime(song.duration)}`;
  $('songSeek').max = song.steps - 1;
  $('songSeek').value = 0;
  $('songTime').textContent = '0:00';
  $('songDay').textContent = 'one note per day';
  player = createSongPlayer(song, {
    onStep(i) {
      map.highlight(i);
      $('songSeek').value = i;
      $('songTime').textContent = fmtTime(i * song.stepDur);
      const d = days[i];
      $('songDay').textContent = `${fmtDate(d.date, { month: 'short', day: 'numeric' })} · ${d.count} contribution${d.count === 1 ? '' : 's'}`;
    },
    onState(playing) {
      $('playSong').textContent = playing ? '❚❚' : '▶';
      $('playSong').setAttribute('aria-label', playing ? 'Pause song' : 'Play your year as a song');
    },
    onEnd() {
      map.highlight(-1);
      $('songSeek').value = 0;
    },
  });
}

$('playSong').addEventListener('click', () => (player?.playing ? player.pause() : player?.play()));
$('songSeek').addEventListener('input', (e) => {
  player?.seek(Number(e.target.value));
  map.highlight(Number(e.target.value));
});
$('downloadSong').addEventListener('click', async () => {
  if (!player) return;
  const btn = $('downloadSong');
  btn.disabled = true;
  btn.textContent = '…';
  const label = $('songDay').textContent;
  $('songDay').textContent = 'Rendering your song…';
  try {
    const blob = await renderSongWav(player.song);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${state.user || 'sample'}-${state.year}-song.wav`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  } finally {
    btn.disabled = false;
    btn.textContent = '⤓';
    $('songDay').textContent = label;
  }
});

$('form').addEventListener('submit', (e) => {
  e.preventDefault();
  update({ user: $('username').value.trim(), year: Number(yearSelect.value) });
});

// ---------- buttons ----------
$('resetView').addEventListener('click', () => map.viewFrom('home'));
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
addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  setDrawer(false);
  setPreview(false);
});

// ---------- embed code ----------
let tab = 'website';

const TAB_HINTS = {
  website: 'Paste into any HTML page — fully interactive 3D.',
  script: 'Paste where the model should appear. Options are data-* attributes you can edit by hand.',
  readme: 'GitHub READMEs only allow images. Pick a 3D picture of your saved view or a 2D design; clicking it opens the interactive version.',
  link: 'A direct link to this exact view.',
};

const kebab = (s) => s.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase());
const cssSize = (v) => (/^\d+$/.test(v.trim()) ? `${v.trim()}px` : v.trim() || '100%');

function readmeParams() {
  const opts = { ...state, ...(state.camera ? cameraToAngles(state.camera) : {}), type: $('readmeType').value };
  return toParams(opts, README_KEYS);
}

function renderCode() {
  if ($('drawer').hidden) return;
  const embedQuery = toParams(state, EMBED_KEYS).toString();
  const pageUrl = `${SITE}/studio.html${embedQuery ? '?' + embedQuery : ''}`;
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
  $('readmeTypeField').hidden = tab !== 'readme';
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
for (const [id, name] of [['3d', '3D board (City)'], ...Object.entries(CHART_TYPES)]) $('readmeType').add(new Option(name, id));
$('readmeType').addEventListener('change', renderCode);
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
