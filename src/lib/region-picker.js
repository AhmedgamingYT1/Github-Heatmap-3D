// "Prices for your country": a card with a spinning globe and a search box. Picking a
// country turns the globe to it and shows its prices; "Use these prices" saves the choice.
//
//   openRegionPicker({ current: 'IN', onPick: (code) => … });
//
// The globe is cobe (MIT, github.com/shuding/cobe), loaded when the card first opens.
import { COUNTRIES, pricesFor, money, saveCountry } from './pricing.js';

let dialog = null;

export async function openRegionPicker({ current = 'US', onPick } = {}) {
  injectStyles();
  dialog ||= build();
  dialog.onPick = onPick;
  dialog.showModal();
  select(current, { instant: true });
  dialog.querySelector('.rp-search').value = '';
  renderList('');
  dialog.querySelector('.rp-search').focus();
  startGlobe();
}

function build() {
  const d = document.createElement('dialog');
  d.className = 'rp';
  d.setAttribute('aria-label', 'Choose your country');
  d.innerHTML = `
    <button type="button" class="rp-x" aria-label="Close">✕</button>
    <div class="rp-globe"><canvas></canvas><div class="rp-pin"><span class="rp-flag"></span><b class="rp-name"></b></div></div>
    <div class="rp-side">
      <h3>Prices for your country</h3>
      <p>Pro costs what it’s worth where you live. Pick your country to see your prices.</p>
      <label class="rp-searchbox"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><input class="rp-search" type="search" placeholder="Search countries" autocomplete="off" spellcheck="false" /></label>
      <ul class="rp-list" role="listbox" aria-label="Countries"></ul>
      <div class="rp-prices"></div>
      <button type="button" class="rp-use">Use these prices</button>
    </div>`;
  document.body.appendChild(d);
  d.querySelector('.rp-x').addEventListener('click', () => d.close());
  d.addEventListener('click', (e) => e.target === d && d.close());
  d.addEventListener('close', stopGlobe);
  const search = d.querySelector('.rp-search');
  search.addEventListener('input', () => renderList(search.value));
  search.addEventListener('keydown', (e) => {
    // Enter picks the first match, arrows move through the list
    const first = d.querySelector('.rp-list li');
    if (e.key === 'Enter' && first) select(first.dataset.code);
    if (e.key === 'ArrowDown') d.querySelector('.rp-list li')?.focus();
  });
  d.querySelector('.rp-list').addEventListener('click', (e) => {
    const li = e.target.closest('li[data-code]');
    if (li) select(li.dataset.code);
  });
  d.querySelector('.rp-list').addEventListener('keydown', (e) => {
    const li = e.target.closest('li');
    if (!li) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      select(li.dataset.code);
    }
    if (e.key === 'ArrowDown') li.nextElementSibling?.focus();
    if (e.key === 'ArrowUp') (li.previousElementSibling ?? search).focus();
  });
  // Use: the globe pulls back out with the pin in place, then the card closes
  d.querySelector('.rp-use').addEventListener('click', () => {
    saveCountry(d.selected);
    d.onPick?.(d.selected);
    target.scale = 1;
    d.classList.add('rp-done');
    setTimeout(() => {
      d.classList.remove('rp-done');
      d.close();
    }, 750);
  });
  return d;
}

function renderList(query) {
  const q = query.trim().toLowerCase();
  const list = COUNTRIES.filter((c) => !q || c.name.toLowerCase().includes(q) || c.code.toLowerCase() === q).sort((a, b) =>
    a.name.localeCompare(b.name),
  );
  const ul = dialog.querySelector('.rp-list');
  ul.innerHTML = list.length
    ? list
        .map((c) => {
          const p = pricesFor(c.code);
          return `<li role="option" tabindex="0" data-code="${c.code}" aria-selected="${c.code === dialog.selected}"><span>${c.flag}</span><b>${c.name}</b><small>${money(p.perDay.year, p.currency)}/day</small></li>`;
        })
        .join('')
    : '<li class="rp-empty">No country by that name yet. Prices in US dollars apply.</li>';
}

function select(code, { instant = false } = {}) {
  dialog.selected = code;
  const p = pricesFor(code);
  const c = p.country;
  dialog.querySelector('.rp-flag').textContent = c.flag;
  dialog.querySelector('.rp-name').textContent = c.name;
  for (const li of dialog.querySelectorAll('.rp-list li[data-code]')) li.setAttribute('aria-selected', li.dataset.code === code);
  const m = (n) => money(n, p.currency);
  dialog.querySelector('.rp-prices').innerHTML = `
    <span><small>One world</small><b>${m(p.world)}</b><i>once</i></span>
    <span class="best"><small>Pro yearly</small><b>${m(p.perDay.year)}</b><i>a day</i></span>
    <span><small>Pro monthly</small><b>${m(p.perDay.month)}</b><i>a day</i></span>
    <span><small>Lifetime</small><b>${m(p.life)}</b><i>once</i></span>`;
  dialog.querySelector('.rp-use').textContent = `Use ${c.name} prices`;
  // Opening: already facing your country, full globe. Choosing one: turn to it and lean in.
  target = { phi: lngToPhi(c.lng), theta: latToTheta(c.lat), scale: instant ? 1 : ZOOM };
  if (instant) Object.assign(view, target);
  marker = [c.lat, c.lng];
}

// ---------- the globe ----------
// cobe's angles: phi turns the globe around its axis, theta tilts it toward you.
const lngToPhi = (lng) => Math.PI - ((lng * Math.PI) / 180 - Math.PI / 2);
const latToTheta = (lat) => Math.min(0.9, Math.max(-0.9, (lat * Math.PI) / 180 * 0.85));
const ZOOM = 1.4; // how far the globe leans in on a chosen country
const view = { phi: 0, theta: 0.3, scale: 1 };
let target = { phi: 0, theta: 0.3, scale: 1 };
let marker = [0, 0];
let globe = null;
let globeDark = false;
let raf = 0;

async function startGlobe() {
  const canvas = dialog.querySelector('canvas');
  // match the page (landing light/dark switch, or the Studio's theme), not just the system
  const root = document.documentElement;
  const dark = root.dataset.mode ? root.dataset.mode === 'dark' : root.style.colorScheme ? root.style.colorScheme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  if (globe && globeDark !== dark) {
    globe.destroy();
    globe = null;
  }
  if (!globe) {
    globeDark = dark;
    const { default: createGlobe } = await import('cobe');
    const size = canvas.offsetWidth || 340;
    const dpr = Math.min(2, devicePixelRatio);
    canvas.width = canvas.height = size * dpr;
    globe = createGlobe(canvas, {
      devicePixelRatio: dpr,
      width: size * dpr,
      height: size * dpr,
      phi: view.phi,
      theta: view.theta,
      scale: view.scale,
      dark: dark ? 1 : 0,
      diffuse: 1.4,
      mapSamples: 16000,
      mapBrightness: dark ? 5 : 8,
      baseColor: dark ? [0.25, 0.25, 0.3] : [0.95, 0.93, 0.9],
      markerColor: [0.25, 0.75, 0.4],
      glowColor: dark ? [0.3, 0.3, 0.4] : [1, 0.95, 0.88],
      markers: [],
    });
  }
  cancelAnimationFrame(raf);
  const tick = () => {
    // ease toward the chosen country, the short way around
    let d = target.phi - view.phi;
    d = ((d + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
    view.phi += d * 0.08;
    view.theta += (target.theta - view.theta) * 0.08;
    view.scale += (target.scale - view.scale) * 0.09;
    globe.update({ phi: view.phi, theta: view.theta, scale: view.scale, markers: [{ location: marker, size: 0.07 / view.scale }] });
    raf = requestAnimationFrame(tick);
  };
  tick();
}
function stopGlobe() {
  cancelAnimationFrame(raf);
}

function injectStyles() {
  if (document.getElementById('rp-styles')) return;
  const s = document.createElement('style');
  s.id = 'rp-styles';
  s.textContent = `
.rp {
  width: min(820px, calc(100vw - 24px)); max-height: calc(100svh - 24px); padding: 0; border: 1px solid var(--border, var(--line-2, rgba(0,0,0,.12)));
  border-radius: 26px; overflow: hidden; color: var(--text, #16151a); background: var(--bg, #f6f5f1); box-shadow: 0 40px 120px rgba(0, 0, 0, 0.4);
  font-family: 'Geist Variable', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}
.rp[open] { display: grid; grid-template-columns: 1fr 1fr; animation: rp-in 0.35s cubic-bezier(.2,.8,.2,1); }
.rp::backdrop { background: rgba(5, 5, 8, 0.5); backdrop-filter: blur(6px); }
@keyframes rp-in { from { opacity: 0; transform: translateY(14px) scale(0.98); } }
.rp-x { position: absolute; top: 12px; right: 12px; z-index: 2; width: 32px; height: 32px; border-radius: 50%; border: 1px solid var(--border, rgba(0,0,0,.12)); background: var(--panel, #fff); color: inherit; cursor: pointer; }
.rp-globe { position: relative; display: grid; place-items: center; padding: 24px; background: radial-gradient(80% 70% at 50% 45%, color-mix(in srgb, var(--accent, #c0672a) 10%, transparent), transparent); }
.rp-globe canvas { width: min(340px, 100%); aspect-ratio: 1; border-radius: 50%; }
.rp-done .rp-pin { animation: rp-pin 0.7s cubic-bezier(.2,.8,.2,1); }
@keyframes rp-pin { 40% { transform: translateX(-50%) scale(1.08); } }
.rp-pin { position: absolute; left: 50%; bottom: 22px; transform: translateX(-50%); display: inline-flex; align-items: center; gap: 8px; padding: 8px 14px; border-radius: 999px;
  background: var(--panel, #fff); border: 1px solid var(--border, rgba(0,0,0,.1)); box-shadow: 0 8px 24px rgba(0,0,0,.12); white-space: nowrap; }
.rp-flag { font-size: 18px; line-height: 1; }
.rp-side { display: grid; grid-template-rows: auto auto auto 1fr auto auto; gap: 10px; padding: 26px 22px 20px; min-height: 0; max-height: min(560px, calc(100svh - 24px)); }
.rp-side h3 { margin: 0; font-size: 20px; letter-spacing: -0.02em; }
.rp-side p { margin: 0; font-size: 13.5px; color: var(--muted, #5d5c64); }
.rp-searchbox { display: flex; align-items: center; gap: 8px; padding: 0 12px; border-radius: 12px; background: var(--field, var(--panel, #fff)); border: 1px solid var(--border, rgba(0,0,0,.12)); }
.rp-searchbox svg { width: 16px; height: 16px; fill: none; stroke: var(--muted, #888); stroke-width: 2; stroke-linecap: round; flex: none; }
.rp-search { flex: 1; min-width: 0; border: 0 !important; outline: 0; background: none !important; box-shadow: none !important; padding: 11px 0 !important; font: 14px inherit; color: inherit; }
.rp-list { list-style: none; margin: 0; padding: 4px; overflow: auto; min-height: 120px; border-radius: 12px; border: 1px solid var(--border, rgba(0,0,0,.08)); }
.rp-list li { display: grid; grid-template-columns: 26px 1fr auto; align-items: center; gap: 8px; padding: 8px 10px; border-radius: 9px; cursor: pointer; font-size: 14px; outline: none; }
.rp-list li:hover, .rp-list li:focus-visible { background: var(--button, rgba(0,0,0,.05)); }
.rp-list li[aria-selected='true'] { background: color-mix(in srgb, var(--accent, #c0672a) 14%, transparent); }
.rp-list li b { font-weight: 500; }
.rp-list li small { font: 12px 'Geist Mono Variable', ui-monospace, monospace; color: var(--muted, #777); }
.rp-list .rp-empty { display: block; color: var(--muted, #777); cursor: default; }
.rp-prices { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; }
.rp-prices span { display: grid; gap: 1px; padding: 8px; border-radius: 10px; background: var(--field, var(--panel, #fff)); border: 1px solid var(--border, rgba(0,0,0,.1)); }
.rp-prices span.best { border-color: #e9b44c; box-shadow: 0 0 0 3px rgba(233,180,76,.18); }
.rp-prices small { font-size: 10.5px; color: var(--muted, #777); }
.rp-prices b { font-size: 15px; letter-spacing: -0.02em; }
.rp-prices i { font-style: normal; font-size: 10.5px; color: var(--muted, #777); }
.rp-use { padding: 12px; border-radius: 999px; border: 0; cursor: pointer; font: 600 14px inherit; color: #fff; background: var(--accent, #c0672a); }
@media (max-width: 680px) {
  .rp[open] { grid-template-columns: 1fr; overflow: auto; }
  .rp-globe { padding: 14px 14px 52px; }
  .rp-globe canvas { width: 220px; }
  .rp-side { max-height: none; padding: 16px; }
  .rp-list { max-height: 220px; }
  .rp-prices { grid-template-columns: repeat(2, 1fr); }
}`;
  document.head.appendChild(s);
}
