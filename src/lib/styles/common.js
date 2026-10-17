// Helpers shared by the 3D styles.
import * as THREE from 'three';

export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const CELL = 1; // grid spacing
export const BASE_H = 0.6; // plinth thickness
const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif';

// Stable pseudo-random number in [0, 1) for a given integer, so every render looks the same.
export function hash(n) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

export const easeOut = (t) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);

/** GitHub layout: columns are weeks (Sunday-start), rows are weekdays, centered on the origin. */
export function gridLayout(days) {
  const offset = new Date(days[0].date + 'T00:00:00Z').getUTCDay();
  const cells = days.map((day, i) => ({ i, day, col: Math.floor((i + offset) / 7), row: (i + offset) % 7 }));
  const cols = cells[cells.length - 1].col + 1;
  const x0 = (-cols * CELL) / 2 + CELL / 2;
  const z0 = (-7 * CELL) / 2 + CELL / 2;
  for (const c of cells) {
    c.x = x0 + c.col * CELL;
    c.z = z0 + c.row * CELL;
  }
  return { cells, cols, x0, z0, width: cols * CELL, depth: 7 * CELL };
}

export const maxCount = (days) => Math.max(1, ...days.map((d) => d.count));

function textCanvas(text, { color, weight = 500, align = 'center' }) {
  const px = 96;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const font = `${weight} ${px}px ${FONT}`;
  ctx.font = font;
  canvas.width = Math.ceil(ctx.measureText(text).width) + 16;
  canvas.height = px * 1.3;
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textBaseline = 'middle';
  ctx.textAlign = align === 'left' ? 'left' : align === 'right' ? 'right' : 'center';
  const x = align === 'left' ? 8 : align === 'right' ? canvas.width - 8 : canvas.width / 2;
  ctx.fillText(text, x, canvas.height / 2);
  return canvas;
}

/** Text lying flat on the ground (rotated to face up). */
export function textPlane(renderer, text, { size = 1, color = '#888', weight = 500, align = 'center' } = {}) {
  const canvas = textCanvas(text, { color, weight, align });
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  const w = (canvas.width / canvas.height) * size;
  const geo = new THREE.PlaneGeometry(w, size);
  // shift so the plane's origin matches the text alignment
  if (align === 'left') geo.translate(w / 2, 0, 0);
  if (align === 'right') geo.translate(-w / 2, 0, 0);
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
  mesh.rotation.x = -Math.PI / 2;
  return mesh;
}

/** Text that always faces the camera. */
export function textSprite(text, { size = 1, color = '#888', weight = 500 } = {}) {
  const canvas = textCanvas(text, { color, weight });
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  sprite.scale.set((canvas.width / canvas.height) * size, size, 1);
  return sprite;
}

let glowTexture = null;
/** Soft round dot, for particles and glows. */
export function glowTex() {
  if (glowTexture) return glowTexture;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, 'rgba(255,255,255,0.6)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  glowTexture = new THREE.CanvasTexture(c);
  return glowTexture;
}

/** Month + weekday labels and the "user · year" title on a grid board. */
export function addGridLabels(board, renderer, layout, opts, theme, { bar = 0.82, labelColor, titleColor } = {}) {
  const { cells, x0, z0 } = layout;
  if (opts.labels) {
    let lastMonth = -1;
    for (const c of cells) {
      const m = Number(c.day.date.slice(5, 7)) - 1;
      if (m !== lastMonth && c.row === 0) {
        lastMonth = m;
        const t = textPlane(renderer, MONTHS[m], { size: 0.9, align: 'left', color: labelColor ?? theme.label });
        t.position.set(c.x - bar / 2, 0.01, z0 - CELL * 1.2);
        board.add(t);
      }
    }
    [['Mon', 1], ['Wed', 3], ['Fri', 5]].forEach(([name, row]) => {
      const t = textPlane(renderer, name, { size: 0.7, align: 'right', color: labelColor ?? theme.label });
      t.position.set(x0 - CELL * 0.8, 0.01, z0 + row * CELL);
      board.add(t);
    });
  }
  if (opts.title) {
    const year = cells[0].day.date.slice(0, 4);
    const t = textPlane(renderer, `${opts.user || 'sample'}  ·  ${year}`, {
      size: 1.4,
      color: titleColor ?? theme.text,
      weight: 600,
      align: 'left',
    });
    t.position.set(x0 - bar / 2, 0.01, z0 + 7 * CELL + 1.0);
    board.add(t);
  }
}

/** Box under the grid with room for labels; `materials` may be one material or a per-face array. */
export function plinthMesh(layout, materials) {
  const padX = 2.2;
  const padFront = 3.2;
  const padBack = 2.2;
  const geo = new THREE.BoxGeometry(layout.width + padX * 2, BASE_H, layout.depth + padFront + padBack);
  geo.translate(0, -BASE_H / 2, (padFront - padBack) / 2);
  const mesh = new THREE.Mesh(geo, materials);
  mesh.receiveShadow = true;
  mesh.name = 'plinth';
  return mesh;
}

export function shadowGround(y, opacity) {
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.ShadowMaterial({ opacity }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = y - 0.01;
  ground.receiveShadow = true;
  return ground;
}
