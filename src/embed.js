// Bare 3D heatmap for iframes: /embed.html?user=octocat&theme=ocean
import { createHeatmap } from './lib/heatmap.js';
import { THEMES, getTheme } from './lib/themes.js';
import { OPTIONS, parseOptions, toParams } from './lib/options.js';

const params = new URLSearchParams(location.search);
const opts = parseOptions(params);
const theme = THEMES[getTheme(opts.theme)];
const $ = (id) => document.getElementById(id);

if (!opts.transparent) document.body.style.background = theme.background;
$('message').style.color = theme.text;

const map = createHeatmap($('map'), opts);
map.on('loading', () => ($('message').textContent = 'Loading…'));
map.on('load', () => ($('message').textContent = ''));
map.on('error', (err) => ($('message').textContent = err.message));

if (opts.badge) {
  const badge = $('badge');
  const keys = Object.keys(OPTIONS).filter((k) => k !== 'badge');
  badge.href = `${location.origin}/?${toParams(opts, keys)}`;
  // on a transparent embed we can't know the host page's colors, so stay neutral
  badge.style.color = opts.transparent ? '#888' : theme.text;
  badge.style.background = opts.transparent ? 'rgba(128,128,128,0.12)' : theme.dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)';
  badge.hidden = false;
}
