// Landing page: a live 3D hero, a scroll-driven style showcase, the song, 2D designs and pricing.
import { createHeatmap } from './lib/heatmap.js';
import { fetchContributions, sampleContributions } from './lib/data.js';
import { THEMES } from './lib/themes.js';
import { STYLES } from './lib/styles/index.js';
import { composeSong, createSongPlayer } from './lib/song.js';
import { renderChartSvg, CHART_TYPES } from './lib/charts.js';

// The profile shown across the landing page. Any public GitHub username works.
const HERO_USER = 'torvalds';
const YEAR = new Date().getFullYear();

const $ = (id) => document.getElementById(id);
document.documentElement.classList.add('js');

// One fetch shared by the song and the designs (the 3D views fetch on their own).
const daysPromise = fetchContributions(HERO_USER, YEAR).catch(() => sampleContributions(YEAR));

// Let vertical swipes scroll the page on phones; horizontal drags still spin the model.
const allowPageScroll = (el) => el.querySelectorAll('canvas').forEach((c) => (c.style.touchAction = 'pan-y'));

// ---------- hero ----------
const hero = createHeatmap($('heroStage'), {
  user: HERO_USER,
  year: YEAR,
  style: 'city',
  theme: 'sand',
  transparent: true,
  zoom: false,
  rotateSpeed: 0.6,
});
allowPageScroll($('heroStage'));
hero.on('load', ({ days }) => {
  const total = days.reduce((a, d) => a + d.count, 0);
  $('heroCaption').textContent = `@${HERO_USER} · ${total.toLocaleString()} contributions in ${YEAR} · drag to spin`;
});

$('tryForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const user = $('tryUser').value.trim().replace(/^@/, '');
  if (user) location.href = `/studio.html?user=${encodeURIComponent(user)}`;
});

// ---------- styles showcase: one 3D view, restyled as each step scrolls into view ----------
let showcase = null;
const stage = $('showcaseStage');
const steps = [...document.querySelectorAll('.step')];

function themeFor(style) {
  return THEMES[STYLES[style].theme || 'sand'];
}

function setShowcaseStyle(style) {
  const theme = themeFor(style);
  stage.style.background = theme.background;
  document.querySelector('.showcase').toggleAttribute('data-dark', theme.dark);
  steps.forEach((s) => s.classList.toggle('active', s.dataset.style === style));
  showcase?.setOptions({ style });
  updateNav();
}

new IntersectionObserver(
  (entries) => {
    if (!entries.some((e) => e.isIntersecting) || showcase) return;
    showcase = createHeatmap($('showcaseCanvas'), {
      user: HERO_USER,
      year: YEAR,
      style: document.querySelector('.step.active')?.dataset.style || 'city',
      theme: 'sand',
      interactive: false,
      tooltip: false,
      rotateSpeed: 0.5,
    });
    allowPageScroll($('showcaseCanvas'));
    showcase.on('building', () => ($('showcaseLoading').hidden = false));
    showcase.on('built', () => ($('showcaseLoading').hidden = true));
  },
  { rootMargin: '100% 0px' },
).observe(stage);

const stepObserver = new IntersectionObserver(
  (entries) => {
    for (const e of entries) if (e.isIntersecting) setShowcaseStyle(e.target.dataset.style);
  },
  { rootMargin: '-45% 0px -45% 0px' }, // the step crossing the middle of the screen wins
);
steps.forEach((s) => stepObserver.observe(s));
steps[0].classList.add('active');

// ---------- nav turns dark over dark sections ----------
const nav = $('nav');
function updateNav() {
  const under = document.elementsFromPoint(innerWidth / 2, 60).find((el) => el.matches?.('section, header'));
  const dark = under?.classList.contains('dark') || (under?.classList.contains('showcase') && under.hasAttribute('data-dark'));
  nav.classList.toggle('on-dark', Boolean(dark));
}
let navTick = 0;
addEventListener('scroll', () => {
  cancelAnimationFrame(navTick);
  navTick = requestAnimationFrame(updateNav);
}, { passive: true });

// ---------- song ----------
let player = null;
daysPromise.then((days) => {
  const song = composeSong(days, HERO_USER);
  $('songTitle').textContent = `“${song.title}”`;
  const secs = Math.round(song.duration);
  $('songMeta').textContent = `@${HERO_USER} · ${song.key} · ${song.bpm} bpm · ${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;

  const wave = $('songWave');
  const max = Math.max(1, ...days.map((d) => d.count));
  const bars = days.map((d) => {
    const i = document.createElement('i');
    i.style.height = `${d.count ? 8 + Math.sqrt(d.count / max) * 92 : 3}%`;
    if (d.count) i.className = 'lit';
    wave.appendChild(i);
    return i;
  });
  let last = -1;
  const paint = (step) => {
    bars.forEach((b, k) => {
      b.classList.toggle('done', k < step && days[k].count > 0);
      b.classList.toggle('now', k === step);
    });
    last = step;
  };
  player = createSongPlayer(song, {
    onStep(i) {
      if (i !== last) paint(i);
      const d = days[i];
      const date = new Date(d.date + 'T00:00:00Z').toLocaleDateString(undefined, { month: 'long', day: 'numeric', timeZone: 'UTC' });
      $('songDay').textContent = `${date} · ${d.count} contribution${d.count === 1 ? '' : 's'}`;
    },
    onState(playing) {
      $('songPlay').textContent = playing ? '❚❚' : '▶';
      $('songPlay').setAttribute('aria-label', playing ? 'Pause the song' : 'Play the song');
    },
    onEnd: () => paint(-1),
  });
  // click the waveform to jump to that day
  wave.addEventListener('click', (e) => {
    const r = wave.getBoundingClientRect();
    const step = Math.floor(((e.clientX - r.left) / r.width) * days.length);
    player.seek(step);
    if (!player.playing) player.play(step);
  });
});
$('songPlay').addEventListener('click', () => (player?.playing ? player.pause() : player?.play()));

// ---------- 2D designs ----------
const DESIGN_THEMES = Object.entries(THEMES).filter(([, t]) => !t.hidden);
let designTheme = 'sand';
function renderDesigns(days) {
  $('designGrid').innerHTML = Object.entries(CHART_TYPES)
    .map(([type, name]) => {
      const svg = renderChartSvg(type, days, { user: HERO_USER, theme: designTheme });
      return `<figure class="design${type === 'calendar' ? ' wide' : ''}"><div class="art">${svg}</div><figcaption class="design-name">${name}<span>README ready</span></figcaption></figure>`;
    })
    .join('');
  for (const b of $('designThemes').children) b.setAttribute('aria-pressed', b.dataset.theme === designTheme);
}
daysPromise.then((days) => {
  for (const [id, t] of DESIGN_THEMES) {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.theme = id;
    b.innerHTML = `<i style="background:${t.levels[3]}"></i>${t.name}`;
    b.addEventListener('click', () => {
      designTheme = id;
      renderDesigns(days);
    });
    $('designThemes').appendChild(b);
  }
  renderDesigns(days);
});

// ---------- pricing ----------
for (const b of document.querySelectorAll('[data-checkout]')) {
  b.addEventListener('click', () => {
    $('checkoutNote').textContent = 'Checkout isn’t open yet. Payments are coming next. Until then, everything is free to try in the Studio.';
  });
}

// ---------- gentle entrance for each section's content ----------
const reveal = new IntersectionObserver(
  (entries) => {
    for (const e of entries) if (e.isIntersecting) {
      e.target.classList.add('in');
      reveal.unobserve(e.target);
    }
  },
  { rootMargin: '0px 0px -10% 0px' },
);
document.querySelectorAll('.song > *, .designs > *, .anywhere > *, .pricing > *, .faq > *').forEach((el) => {
  el.classList.add('reveal');
  reveal.observe(el);
});
updateNav();
