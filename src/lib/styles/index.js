// Every visual style the heatmap can render, and how the scene around it is set up.
//   theme:  built-in colors (null = the user's theme picker applies)
//   camera: default view direction and distance
//   bloom:  glow post-processing, for styles with lights in them
import { createCity } from './city.js';
import { createNightCity } from './nightcity.js';
import { createGalaxy } from './galaxy.js';
import { createForest, FOREST_PALETTES } from './forest.js';
import { createHeartbeat } from './heartbeat.js';

export const STYLES = {
  city: {
    name: 'City',
    pro: false,
    theme: null,
    create: (ctx) => createCity(ctx),
    camera: { dir: [-18, 32, 52], dist: 64 },
    stl: true,
  },
  night: {
    name: 'Night City',
    pro: true,
    theme: 'night',
    create: createNightCity,
    camera: { dir: [-42, 20, 40], dist: 50, halfWidth: 26 }, // diagonal, down the avenues
    bloom: { strength: 0.85, radius: 0.45, threshold: 0.55 },
    shadows: false,
    lights: { hemi: ['#8aa0ff', '#070b1a', 0.7], sun: ['#9fb4ff', 0.9], rim: ['#5f7bff', 0.5] },
    stl: true,
  },
  galaxy: {
    name: 'Galaxy',
    pro: true,
    theme: 'galaxy',
    create: createGalaxy,
    camera: { dir: [0, 34, 42], dist: 80, halfWidth: 44 },
    bloom: { strength: 0.75, radius: 0.55, threshold: 0.3 },
    lights: { hemi: ['#ffffff', '#05030d', 0.5], sun: ['#ffd9a8', 1.1], rim: ['#b58cff', 0.5] },
    fog: false,
    shadows: false,
  },
  forest: {
    name: 'Forest',
    pro: true,
    theme: 'grove',
    create: createForest,
    palettes: FOREST_PALETTES, // leaf colors, picked like themes
    camera: { dir: [-42, 22, 40], dist: 52, halfWidth: 26 }, // diagonal, looking into the forest
    lights: { hemi: ['#ffffff', '#86b85a', 1.5], sun: ['#fff1d6', 2.2], rim: ['#ffd36b', 0.4] },
  },
  heartbeat: {
    name: 'Heartbeat',
    pro: true,
    theme: 'monitor',
    create: createHeartbeat,
    is2d: true,
  },
};

export const DEFAULT_STYLE = 'city';

export function getStyle(id) {
  return STYLES[id] ? id : DEFAULT_STYLE;
}
