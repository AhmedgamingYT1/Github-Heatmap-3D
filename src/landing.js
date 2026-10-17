// Landing page: one live 3D hero, expanding style cards that open a live viewer,
// a bento of features and pricing. Only one 3D view renders at a time, and only while visible.
import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';
import '@fontsource-variable/doto';
import './landing.css';
import { createHeatmap } from './lib/heatmap.js';
import { demoContributions } from './lib/data.js';
import { THEMES } from './lib/themes.js';
import { FOREST_PALETTES } from './lib/styles/forest.js';
import { composeSong, createSongPlayer } from './lib/song.js';
import { renderChartSvg } from './lib/charts.js';

// The landing page shows a built-in demo year (every month filled), labelled as yours.
const HERO_USER = 'you';
const DEMO = { user: HERO_USER, demo: true };
const YEAR = new Date().getFullYear();
const $ = (id) => document.getElementById(id);

// Styles with glow need an opaque canvas; the others float on the page.
const GLOWS = new Set(['night', 'galaxy']);
const PAGE_DARK = '#08080a'; // = --bg in dark mode, so the scene has no visible edge
const isLight = () => document.documentElement.dataset.mode === 'light';

// How the hero shows a style in the current mode. Forests grow bigger here, on a log
// scale, so even quiet days become real trees and it reads as a full forest.
function heroOptions(style) {
  const glow = GLOWS.has(style);
  return {
    style,
    transparent: !glow,
    background: glow && !isLight() ? PAGE_DARK : undefined,
    height: style === 'forest' ? 15 : 8,
    log: style === 'forest',
  };
}
const daysPromise = Promise.resolve(demoContributions(YEAR));

// Vertical swipes scroll the page on phones; horizontal drags still spin the model.
const allowPageScroll = (el) => el.querySelectorAll('canvas').forEach((c) => (c.style.touchAction = 'pan-y'));

function studioUrl(params) {
  const user = $('tryUser').value.trim().replace(/^@/, '');
  const q = new URLSearchParams({ ...(user ? { user } : {}), ...params });
  return `/studio.html?${q}`;
}

// ---------- hero ----------
let heroStyle = 'night';
$('heroWho').textContent = 'your year…';
const hero = createHeatmap($('heroStage'), {
  ...DEMO,
  year: YEAR,
  theme: 'sand',
  ...heroOptions(heroStyle),
  zoom: false,
  rotateSpeed: 0.45,
  maxPixelRatio: 1.5,
});
allowPageScroll($('heroStage'));
if (import.meta.env.DEV) window.__hero = hero; // for debugging
hero.on('load', () => ($('heroHint').hidden = true));
hero.on('building', () => {
  $('heroHint').textContent = 'Growing the forest…';
  $('heroHint').hidden = false;
});
hero.on('built', () => ($('heroHint').hidden = true));

const seg = $('heroStyles');
const glider = seg.querySelector('.seg-glider');
function moveGlider() {
  const on = seg.querySelector('[aria-checked="true"]');
  glider.style.width = `${on.offsetWidth}px`;
  glider.style.transform = `translateX(${on.offsetLeft}px)`;
}
seg.addEventListener('click', (e) => {
  const b = e.target.closest('button[data-style]');
  if (!b || b.dataset.style === heroStyle) return;
  heroStyle = b.dataset.style;
  for (const x of seg.querySelectorAll('button')) x.setAttribute('aria-checked', x === b);
  moveGlider();
  applyHero();
  $('navStudio').href = studioUrl({ style: heroStyle });
});

function applyHero() {
  hero.setOptions(heroOptions(heroStyle));
  // light page + night-time world: present it on a dark screen
  $('heroStage').toggleAttribute('data-card', isLight() && GLOWS.has(heroStyle));
}

// ---------- light / dark ----------
$('modeToggle').addEventListener('click', () => {
  const mode = isLight() ? 'dark' : 'light';
  document.documentElement.dataset.mode = mode;
  try {
    localStorage.setItem('mode', mode);
  } catch {}
  applyHero();
  daysPromise.then(renderFeatureArt);
});
$('heroStage').toggleAttribute('data-card', isLight() && GLOWS.has(heroStyle));
addEventListener('resize', moveGlider);
document.fonts?.ready.then(moveGlider);
moveGlider();

$('tryForm').addEventListener('submit', (e) => {
  e.preventDefault();
  location.href = studioUrl({ style: heroStyle });
});

// ---------- explore: expanding cards open a live viewer ----------
const WORLDS = {
  night: { title: 'Night City', kicker: 'Pro · 3D', opts: { style: 'night' } },
  galaxy: { title: 'Galaxy', kicker: 'Pro · 3D', opts: { style: 'galaxy' } },
  forest: { title: 'Forest', kicker: 'Pro · 3D', opts: { style: 'forest', palette: 'spring', height: 15, log: true } },
  sakura: { title: 'Forest · Sakura', kicker: 'Pro · 3D', opts: { style: 'forest', palette: 'sakura', height: 15, log: true } },
  city: { title: 'City', kicker: 'Free · 3D', opts: { style: 'city', theme: 'sand' } },
};

const viewer = $('viewer');
let viewerMap = null;
function openViewer(key) {
  const w = WORLDS[key];
  $('viewerTitle').textContent = w.title;
  $('viewerKicker').textContent = w.kicker;
  $('viewerStudio').href = studioUrl(w.opts);
  $('viewerHint').hidden = false;
  viewer.showModal();
  if (!viewerMap) {
    viewerMap = createHeatmap($('viewerStage'), { ...DEMO, year: YEAR, rotateSpeed: 0.6, maxPixelRatio: 1.5, ...w.opts });
    viewerMap.on('load', () => ($('viewerHint').hidden = true));
    viewerMap.on('built', () => ($('viewerHint').hidden = true));
    viewerMap.on('building', () => {
      $('viewerHint').textContent = 'Growing the forest…';
      $('viewerHint').hidden = false;
    });
  } else {
    viewerMap.setOptions({ palette: 'spring', theme: 'sand', height: 8, log: false, ...w.opts });
    $('viewerHint').hidden = w.opts.style !== 'forest';
  }
}
$('viewerClose').addEventListener('click', () => viewer.close());
viewer.addEventListener('click', (e) => e.target === viewer && viewer.close()); // click on the backdrop
// (closing hides the stage, so the viewer's 3D stops rendering on its own)

$('expand').addEventListener('click', (e) => {
  const card = e.target.closest('.xcard');
  if (!card) return;
  if (card.dataset.open === 'song') toggleSong();
  else openViewer(card.dataset.open);
});

// ---------- the song card ----------
let player = null;
let waveBars = [];
const BAR_DAYS = 5; // each bar of the little waveform is five days
daysPromise.then((days) => {
  const song = composeSong(days, HERO_USER);
  $('songTitle').textContent = `“${song.title}”`;
  $('songMeta').textContent = `A demo ${YEAR} · ${song.key} · ${song.bpm} bpm. Press to play.`;
  const max = Math.max(1, ...days.map((d) => d.count));
  for (let k = 0; k < days.length; k += BAR_DAYS) {
    const peak = Math.max(...days.slice(k, k + BAR_DAYS).map((d) => d.count));
    const i = document.createElement('i');
    i.style.height = `${peak ? 10 + Math.sqrt(peak / max) * 90 : 4}%`;
    $('songWave').appendChild(i);
    waveBars.push(i);
  }
  player = createSongPlayer(song, {
    onStep: (step) => waveBars.forEach((b, k) => b.classList.toggle('on', k * BAR_DAYS <= step)),
    onState(playing) {
      $('songIcon').textContent = playing ? '❚❚' : '▶';
      $('songCard').classList.toggle('is-open', playing);
    },
    onEnd: () => waveBars.forEach((b) => b.classList.remove('on')),
  });
});
function toggleSong() {
  if (!player) return;
  player.playing ? player.pause() : player.play();
}

// ---------- features ----------
function renderFeatureArt(days) {
  const theme = isLight() ? 'sand' : 'halloween';
  $('cardArt').innerHTML = renderChartSvg('card', days, { user: HERO_USER, theme });
  $('donutArt').innerHTML = renderChartSvg('donut', days, { user: HERO_USER, theme });
}
daysPromise.then(renderFeatureArt);

const embed = `<iframe src="${location.origin}/embed.html?user=you&style=galaxy"\n  style="width:100%;height:420px;border:0"></iframe>`;
const esc = (s) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
// color strings first, then tags (the other order would recolor the quotes in our own spans)
$('embedCode').innerHTML = esc(embed)
  .replace(/"([^"]*)"/g, '"<span class="s">$1</span>"')
  .replace(/(&lt;\/?iframe)/g, '<span class="k">$1</span>');
$('copyEmbed').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(embed);
    $('copyEmbed').textContent = 'Copied';
  } catch {
    $('copyEmbed').textContent = 'Select to copy';
  }
  setTimeout(() => ($('copyEmbed').textContent = 'Copy'), 1400);
});

$('swatches').innerHTML = [
  ...Object.values(THEMES).filter((t) => !t.hidden).map((t) => [t.name, t.background, t.levels[3]]),
  ...Object.values(FOREST_PALETTES).map((p) => [`Forest ${p.name}`, p.levels[1], p.levels[4]]),
]
  .map(([name, a, b]) => `<i title="${name}" style="--a:${a};--b:${b}"></i>`)
  .join('');

// count numbers up when they scroll into view
const counter = new IntersectionObserver((entries) => {
  for (const e of entries) {
    if (!e.isIntersecting) continue;
    counter.unobserve(e.target);
    const to = Number(e.target.dataset.count);
    const start = performance.now();
    const tick = (now) => {
      const t = Math.min(1, (now - start) / 1100);
      e.target.textContent = Math.round(to * (1 - (1 - t) ** 3));
      if (t < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
});
document.querySelectorAll('[data-count]').forEach((el) => counter.observe(el));

// ---------- pricing ----------
const billing = $('billing');
function moveBillingGlider() {
  const on = billing.querySelector('[aria-checked="true"]');
  const g = billing.querySelector('.seg-glider');
  g.style.width = `${on.offsetWidth}px`;
  g.style.transform = `translateX(${on.offsetLeft}px)`;
}
billing.addEventListener('click', (e) => {
  const b = e.target.closest('button[data-bill]');
  if (!b || b.getAttribute('aria-checked') === 'true') return;
  for (const x of billing.querySelectorAll('button')) x.setAttribute('aria-checked', x === b);
  moveBillingGlider();
  const yearly = b.dataset.bill === 'year';
  const price = $('proPrice');
  price.classList.add('swap');
  setTimeout(() => {
    price.textContent = yearly ? '$2.42' : '$4';
    $('proPer').textContent = '/ month';
    $('proBilled').textContent = yearly ? 'Billed $29 yearly. Cancel anytime.' : 'Billed monthly. Cancel anytime.';
    price.classList.remove('swap');
  }, 180);
});
addEventListener('resize', moveBillingGlider);
document.fonts?.ready.then(moveBillingGlider);
moveBillingGlider();

for (const b of document.querySelectorAll('[data-checkout]')) {
  b.addEventListener('click', () => {
    $('checkoutNote').textContent = 'Checkout isn’t open yet. Payments are coming next; until then everything is free in the Studio.';
  });
}
