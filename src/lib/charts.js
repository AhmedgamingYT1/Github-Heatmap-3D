// 2D designs of a year of contributions, as SVG strings. Run in the browser and on the
// server (README images): stats card, weekday donut, monthly bars and the classic grid.
import { THEMES, getTheme } from './themes.js';
import { computeStats } from './data.js';

const FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", Helvetica, Arial, sans-serif';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const CHART_TYPES = {
  card: 'Stats card',
  donut: 'Weekly rhythm',
  months: 'Monthly bars',
  calendar: 'Classic grid',
};

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const fmt = (n) => n.toLocaleString('en-US');
const dayLabel = (iso) => `${MONTHS[Number(iso.slice(5, 7)) - 1]} ${Number(iso.slice(8, 10))}`;

export function yearStats(days) {
  const { total, best, longest } = computeStats(days);
  const byMonth = Array(12).fill(0);
  const byDow = Array(7).fill(0);
  const offset = new Date(days[0].date + 'T00:00:00Z').getUTCDay();
  days.forEach((d, i) => {
    byMonth[Number(d.date.slice(5, 7)) - 1] += d.count;
    byDow[(offset + i) % 7] += d.count;
  });
  return {
    total,
    best,
    longest,
    active: days.filter((d) => d.count > 0).length,
    byMonth,
    byDow,
    topMonth: byMonth.indexOf(Math.max(...byMonth)),
    topDow: byDow.indexOf(Math.max(...byDow)),
  };
}

function frame(w, h, theme, opts, body) {
  const bg = opts.transparent ? '' : `<rect width="${w}" height="${h}" rx="22" fill="${theme.background}"/>`;
  const border = opts.transparent ? '' : `<rect x="0.5" y="0.5" width="${w - 1}" height="${h - 1}" rx="21.5" fill="none" stroke="${theme.text}" stroke-opacity="0.08"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" font-family='${FONT}' role="img" aria-label="${esc(opts.user || 'sample')}'s GitHub contributions">${bg}${border}${body}</svg>`;
}

function header(theme, opts, days, title) {
  const year = days[0].date.slice(0, 4);
  return `<text x="32" y="44" font-size="13" font-weight="600" fill="${theme.label}" letter-spacing="0.06em">${esc(title.toUpperCase())}</text>
<text x="32" y="68" font-size="15" font-weight="500" fill="${theme.label}">@${esc(opts.user || 'sample')} · ${year}</text>`;
}

/** Small GitHub-style grid of squares. */
function grid(days, theme, x, y, cell, gap) {
  const offset = new Date(days[0].date + 'T00:00:00Z').getUTCDay();
  let out = '';
  days.forEach((d, i) => {
    const col = Math.floor((i + offset) / 7);
    const row = (i + offset) % 7;
    out += `<rect x="${x + col * (cell + gap)}" y="${y + row * (cell + gap)}" width="${cell}" height="${cell}" rx="${cell * 0.28}" fill="${theme.levels[d.level]}"/>`;
  });
  return out;
}

function card(days, theme, opts) {
  const s = yearStats(days);
  const W = 640;
  const H = 360;
  const stat = (x, label, value) =>
    `<text x="${x}" y="196" font-size="12.5" fill="${theme.label}">${esc(label)}</text><text x="${x}" y="222" font-size="20" font-weight="650" fill="${theme.text}">${esc(value)}</text>`;
  const body = `${header(theme, opts, days, 'Year in code')}
<text x="32" y="140" font-size="58" font-weight="750" fill="${theme.accent}" letter-spacing="-0.02em">${fmt(s.total)}<tspan dx="12" font-size="17" font-weight="500" letter-spacing="0" fill="${theme.label}">contributions</tspan></text>
${stat(32, 'Best day', `${s.best.count} · ${dayLabel(s.best.date)}`)}
${stat(186, 'Longest streak', `${s.longest} days`)}
${stat(340, 'Busiest month', MONTHS[s.topMonth])}
${stat(494, 'Favorite day', `${WEEKDAYS[s.topDow]}s`)}
${grid(days, theme, 32, 256, 8.2, 2.6)}`;
  return frame(W, H, theme, opts, body);
}

function donut(days, theme, opts) {
  const s = yearStats(days);
  const W = 640;
  const H = 360;
  const cx = 190;
  const cy = 210;
  const R = 104;
  const r = 66;
  const order = [1, 2, 3, 4, 5, 6, 0]; // Mon..Sun
  // weekday colors: the theme's levels plus a few blends, busiest weekday in the accent
  const palette = [theme.levels[4], theme.levels[3], theme.levels[2], theme.levels[1], theme.label, theme.text, theme.levels[3]];
  let a0 = -Math.PI / 2;
  let arcs = '';
  let legend = '';
  const total = Math.max(1, s.total);
  order.forEach((dow, k) => {
    const share = s.byDow[dow] / total;
    const a1 = a0 + share * Math.PI * 2;
    const large = a1 - a0 > Math.PI ? 1 : 0;
    const p = (a, rad) => `${(cx + Math.cos(a) * rad).toFixed(2)} ${(cy + Math.sin(a) * rad).toFixed(2)}`;
    const color = dow === s.topDow ? theme.accent : palette[k];
    if (share > 0)
      arcs += `<path d="M${p(a0, R)} A${R} ${R} 0 ${large} 1 ${p(a1, R)} L${p(a1, r)} A${r} ${r} 0 ${large} 0 ${p(a0, r)}Z" fill="${color}" stroke="${theme.background}" stroke-width="2"/>`;
    const y = 120 + k * 30;
    legend += `<rect x="372" y="${y - 11}" width="12" height="12" rx="3.5" fill="${color}"/>
<text x="394" y="${y}" font-size="15" font-weight="${dow === s.topDow ? 650 : 500}" fill="${theme.text}">${WEEKDAYS[dow]}</text>
<text x="604" y="${y}" font-size="15" font-weight="600" text-anchor="end" fill="${theme.label}">${Math.round(share * 100)}%</text>`;
    a0 = a1;
  });
  const body = `${header(theme, opts, days, 'Weekly rhythm')}
${arcs}
<text x="${cx}" y="${cy - 2}" font-size="30" font-weight="750" text-anchor="middle" fill="${theme.text}">${WEEKDAYS[s.topDow]}</text>
<text x="${cx}" y="${cy + 22}" font-size="12.5" text-anchor="middle" fill="${theme.label}">busiest day</text>
${legend}`;
  return frame(W, H, theme, opts, body);
}

function months(days, theme, opts) {
  const s = yearStats(days);
  const W = 640;
  const H = 360;
  const max = Math.max(1, ...s.byMonth);
  const x0 = 32;
  const base = 312;
  const top = 116;
  const slot = (W - 64) / 12;
  let bars = '';
  s.byMonth.forEach((v, m) => {
    const h = Math.max(3, ((base - top) * v) / max);
    const x = x0 + m * slot + slot * 0.18;
    const w = slot * 0.64;
    const color = m === s.topMonth ? theme.accent : theme.levels[v ? 2 : 0];
    bars += `<rect x="${x.toFixed(1)}" y="${(base - h).toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="6" fill="${color}"/>
<text x="${(x + w / 2).toFixed(1)}" y="${base + 22}" font-size="12.5" text-anchor="middle" fill="${theme.label}">${MONTHS[m]}</text>`;
    if (v) bars += `<text x="${(x + w / 2).toFixed(1)}" y="${(base - h - 8).toFixed(1)}" font-size="11.5" font-weight="600" text-anchor="middle" fill="${m === s.topMonth ? theme.accent : theme.label}">${fmt(v)}</text>`;
  });
  const body = `${header(theme, opts, days, 'Month by month')}
<text x="${W - 32}" y="68" font-size="15" font-weight="600" text-anchor="end" fill="${theme.accent}">${MONTHS[s.topMonth]} led with ${fmt(s.byMonth[s.topMonth])}</text>
${bars}`;
  return frame(W, H, theme, opts, body);
}

function calendar(days, theme, opts) {
  const s = yearStats(days);
  const cell = 10.5;
  const gap = 3;
  const W = 32 * 2 + 53 * (cell + gap);
  const H = 230;
  const offset = new Date(days[0].date + 'T00:00:00Z').getUTCDay();
  let labels = '';
  let last = -1;
  days.forEach((d, i) => {
    const m = Number(d.date.slice(5, 7)) - 1;
    if (m !== last && (i + offset) % 7 === 0) {
      last = m;
      labels += `<text x="${32 + Math.floor((i + offset) / 7) * (cell + gap)}" y="104" font-size="11.5" fill="${theme.label}">${MONTHS[m]}</text>`;
    }
  });
  let legend = `<text x="${W - 32 - 5 * (cell + gap) - 40}" y="${H - 22}" font-size="11.5" fill="${theme.label}">Less</text>`;
  theme.levels.forEach((c, k) => (legend += `<rect x="${W - 32 - (5 - k) * (cell + gap) - 8}" y="${H - 32}" width="${cell}" height="${cell}" rx="3" fill="${c}"/>`));
  legend += `<text x="${W - 32}" y="${H - 22}" font-size="11.5" text-anchor="end" fill="${theme.label}">More</text>`;
  const body = `${header(theme, opts, days, `${fmt(s.total)} contributions`)}
${labels}
${grid(days, theme, 32, 114, cell, gap)}
${legend}`;
  return frame(Math.ceil(W), H, theme, opts, body);
}

const RENDERERS = { card, donut, months, calendar };

/** Render one of CHART_TYPES; `opts` uses the same names as the rest of the app. */
export function renderChartSvg(type, days, opts) {
  const theme = THEMES[getTheme(opts.theme)];
  return (RENDERERS[type] ?? card)(days, theme, opts);
}
