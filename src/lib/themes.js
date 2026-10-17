// Each theme styles both the 3D scene and the UI around it.
// `levels` are the bar colors for GitHub's contribution levels 0 (none) .. 4 (most).
export const THEMES = {
  sand: {
    name: 'Sand',
    dark: false,
    background: '#efe4cf',
    plinth: '#d9c7a5',
    text: '#5b4a33',
    label: '#8a7656',
    accent: '#c2703d',
    levels: ['#e3d3b4', '#e8b97f', '#d99155', '#c2703d', '#9a4a24'],
  },
  ocean: {
    name: 'Ocean',
    dark: false,
    background: '#e3f1f7',
    plinth: '#c4dfeb',
    text: '#14465c',
    label: '#4c7a8f',
    accent: '#1f8ac0',
    levels: ['#cfe6f0', '#8fd0e8', '#4fb0dc', '#1f8ac0', '#0b5a8a'],
  },
  github: {
    name: 'GitHub Dark',
    dark: true,
    background: '#0d1117',
    plinth: '#161b22',
    text: '#e6edf3',
    label: '#8b949e',
    accent: '#39d353',
    levels: ['#161b22', '#0e4429', '#006d32', '#26a641', '#39d353'],
  },
  'github-light': {
    name: 'GitHub Light',
    dark: false,
    background: '#ffffff',
    plinth: '#eef1f4',
    text: '#1f2328',
    label: '#59636e',
    accent: '#1a7f37',
    levels: ['#ebedf0', '#9be9a8', '#40c463', '#30a14e', '#216e39'],
  },
  sunset: {
    name: 'Sunset',
    dark: true,
    background: '#1e1325',
    plinth: '#2c1c35',
    text: '#fbe7dc',
    label: '#b896a8',
    accent: '#ff7a59',
    levels: ['#35233f', '#7b2d5b', '#c2407a', '#ff7a59', '#ffc46b'],
  },
  forest: {
    name: 'Forest',
    dark: false,
    background: '#e6ecdf',
    plinth: '#cfd9c3',
    text: '#2f4227',
    label: '#62755a',
    accent: '#4c7a34',
    levels: ['#d6e0cb', '#a9c48c', '#7ba35a', '#4c7a34', '#2c5220'],
  },
  neon: {
    name: 'Neon',
    dark: true,
    background: '#0a0a14',
    plinth: '#14142a',
    text: '#e8e6ff',
    label: '#8784b3',
    accent: '#00e5ff',
    levels: ['#1a1a33', '#4a1fb8', '#8a2be2', '#e040fb', '#00e5ff'],
  },
  halloween: {
    name: 'Halloween',
    dark: true,
    background: '#111111',
    plinth: '#1c1c1c',
    text: '#f5f5f5',
    label: '#999999',
    accent: '#ff9711',
    levels: ['#222222', '#631c03', '#bd561d', '#fa7a18', '#fddf68'],
  },

  // Built-in looks of the Pro styles. Hidden from the theme picker.
  night: {
    name: 'Night City',
    hidden: true,
    dark: true,
    background: '#070b1a',
    plinth: '#10162a',
    text: '#e8ecff',
    label: '#7d89b3',
    accent: '#ffd66b',
    levels: ['#1e2433', '#ffc56b', '#ffe2a6', '#d6ecff', '#8fdcff'], // empty block, then window light by level
  },
  galaxy: {
    name: 'Galaxy',
    hidden: true,
    dark: true,
    background: '#05030d',
    plinth: '#140c2a',
    text: '#efe9ff',
    label: '#9a8fc4',
    accent: '#b58cff',
    levels: ['#4a4f7a', '#6c8cff', '#b58cff', '#ff8ad8', '#fff4d6'],
  },
  // one color of filament, like a real 3D print (the landing page's STL card)
  print: {
    name: 'Print',
    hidden: true,
    dark: false,
    background: '#f4ede4',
    plinth: '#e9874a',
    text: '#7a3d17',
    label: '#b5612b',
    accent: '#e9874a',
    levels: ['#ef9459', '#ef9459', '#ef9459', '#ef9459', '#ef9459'],
  },
  grove: {
    name: 'Forest',
    hidden: true,
    dark: false,
    background: '#dcebd6',
    plinth: '#7a5534',
    text: '#2f4227',
    label: '#5d7352',
    accent: '#4c7a34',
    levels: ['#a9cf7f', '#8cc66b', '#3f8a2e', '#f7b6d2', '#e0559a'], // grass, then canopy colors by level
  },
};

export const DEFAULT_THEME = 'sand';

export function getTheme(id) {
  return THEMES[id] ? id : DEFAULT_THEME;
}

// Push theme colors into CSS variables so the HTML panels match the scene.
export function applyThemeToPage(theme) {
  const s = document.documentElement.style;
  s.setProperty('--bg', theme.background);
  s.setProperty('--text', theme.text);
  s.setProperty('--muted', theme.label);
  s.setProperty('--accent', theme.accent);
  s.setProperty('--panel', theme.dark ? 'rgba(22, 27, 34, 0.82)' : 'rgba(255, 255, 255, 0.72)');
  s.setProperty('--border', theme.dark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.12)');
  s.setProperty('--field', theme.dark ? 'rgba(0, 0, 0, 0.35)' : 'rgba(255, 255, 255, 0.9)');
  s.setProperty('--button', theme.dark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)');
  s.setProperty('--button-hover', theme.dark ? 'rgba(255, 255, 255, 0.16)' : 'rgba(0, 0, 0, 0.1)');
  document.documentElement.style.colorScheme = theme.dark ? 'dark' : 'light';
}
