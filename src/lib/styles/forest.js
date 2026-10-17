// Forest: a grassy island with one realistic tree per day.
//   height  = that day's contributions (linear, or log with the Log scale option)
//   color   = GitHub level, from the chosen palette (Spring, Autumn, Sakura, Dream)
//   no contributions → bare grass, a few → a small bush.
// Tree models come from ./trees.js (loaded on demand); each day is an instance of one.
import * as THREE from 'three';
import { BASE_H, hash, gridLayout, maxCount, addGridLabels, plinthMesh, shadowGround, easeOut } from './common.js';

const SPACING = 1.25; // distance between trees (the City uses 1)
const BUSH_HEIGHT = 0.75; // days shorter than this (at default size) grow a bush instead of a tree
const TILE = 0.92; // grid tile size, as a fraction of the spacing

// levels[0] is the grass, levels[1..4] the leaf color per GitHub level.
export const FOREST_PALETTES = {
  spring: { name: 'Spring', levels: ['#a3c97a', '#a6d86e', '#4f9e35', '#f7a8cf', '#e2589e'], evergreen: '#3f7d3a' },
  autumn: { name: 'Autumn', levels: ['#b8ad6e', '#f2c94c', '#f2994a', '#e2572b', '#a8231b'], evergreen: '#4a6b35' },
  sakura: { name: 'Sakura', levels: ['#b3d495', '#ffe0ec', '#ffb8d4', '#ff86b6', '#e0407f'], evergreen: '#5f8f4a' },
  dream: { name: 'Dream', levels: ['#c4d2ee', '#7fd1ff', '#b58cff', '#ff8ad8', '#ffd36b'], evergreen: '#6c7bd9' },
};
export const DEFAULT_PALETTE = 'spring';

// Speckled grass so the ground isn't a flat color.
function grassTexture(color) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = color;
  g.fillRect(0, 0, 256, 256);
  for (let k = 0; k < 2600; k++) {
    const light = hash(k) > 0.5;
    g.fillStyle = light ? 'rgba(255,255,255,0.10)' : 'rgba(0,40,0,0.10)';
    g.fillRect(hash(k + 1) * 256, hash(k + 2) * 256, 1 + hash(k + 3) * 2, 2 + hash(k + 4) * 4);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

export async function createForest(ctx) {
  const { loadTreeLibrary } = await import('./trees.js');
  const library = await loadTreeLibrary(ctx.opts.detail);
  if (ctx.cancelled()) return null;

  const { board, renderer, theme, days } = ctx;
  let opts = ctx.opts;
  const palette = FOREST_PALETTES[opts.palette] ?? FOREST_PALETTES[DEFAULT_PALETTE];
  const layout = gridLayout(days, SPACING);
  const { cells } = layout;

  // island: grass on top, soil on the sides
  const soil = new THREE.MeshStandardMaterial({ color: '#6e4b2e', roughness: 1 });
  const grassMap = grassTexture(palette.levels[0]);
  grassMap.repeat.set(layout.width / 6, (layout.depth + 5.4) / 6);
  const grass = new THREE.MeshStandardMaterial({ map: grassMap, roughness: 1 });
  const island = plinthMesh(layout, [soil, soil, grass, soil, soil, soil]);
  island.visible = opts.base;
  board.add(island);
  addGridLabels(board, renderer, layout, opts, theme, { bar: 1, labelColor: '#3d5a2a', titleColor: '#2a3d1f' });
  const ground = shadowGround(opts.base ? -BASE_H : 0, 0.22);
  board.add(ground);

  const leafColors = palette.levels.map((c) => new THREE.Color(c));
  const evergreen = new THREE.Color(palette.evergreen);
  const white = new THREE.Color('#ffffff');

  // GitHub-style grid: a tile under every day, tinted toward that day's leaf color
  const grassColor = new THREE.Color(palette.levels[0]);
  const tiles = new THREE.InstancedMesh(
    new THREE.BoxGeometry(SPACING * TILE, 0.04, SPACING * TILE).translate(0, 0.02, 0),
    new THREE.MeshStandardMaterial({ roughness: 1 }),
    cells.length,
  );
  tiles.receiveShadow = true;
  const tileMatrix = new THREE.Matrix4();
  cells.forEach((c, k) => {
    tiles.setMatrixAt(k, tileMatrix.makeTranslation(c.x, 0, c.z));
    const level = c.day.level;
    tiles.setColorAt(k, level ? grassColor.clone().lerp(leafColors[level], 0.35) : grassColor.clone().multiplyScalar(0.86));
  });
  board.add(tiles);

  let meshes = []; // { branches, leaves, entries }
  let proxy = null; // invisible cylinders, one per plant, for fast hover picking
  let proxyDays = [];
  const tops = new Float32Array(cells.length);
  const byDay = new Map(); // day → [{ group, k }]

  function plant() {
    for (const m of meshes) {
      board.remove(m.branches, m.leaves);
      m.branches.dispose();
      m.leaves.dispose();
    }
    if (proxy) board.remove(proxy);
    meshes = [];
    byDay.clear();

    const max = maxCount(days);
    const norm = opts.log ? (n) => Math.log1p(n) / Math.log1p(max) : (n) => n / max;
    const groups = new Map(); // proto → entries

    const picks = [];
    cells.forEach((c) => {
      const { count, level } = c.day;
      tops[c.i] = 0;
      if (count === 0) return;
      const h = (n) => hash(c.i * 13 + n);
      const s = norm(count);
      // The Height slider scales whole trees (8 = default size); counts set each tree's size.
      const size = opts.height / 8;
      const height = (0.35 + s * 2.9) * size;

      let species;
      if (height < BUSH_HEIGHT * size) species = 'bush';
      else if (level >= 3) species = h(7) < 0.6 ? 'oak' : 'ash'; // blossoms on broad-leaf trees
      else species = ['oak', 'ash', 'aspen', 'pine'][Math.floor(h(7) * 4)];
      const variants = library.protos[species];
      const proto = variants[Math.floor(h(8) * variants.length)];

      // scale the model evenly to the day's height, so trees grow instead of stretching
      const sy = height / proto.height;
      const sxz = sy;
      const base = leafColors[Math.max(1, level)];
      const color = (species === 'pine' ? base.clone().lerp(evergreen, 0.55) : base.clone()).multiplyScalar(0.9 + h(9) * 0.2);

      const entry = {
        i: c.i,
        pos: new THREE.Vector3(c.x + (h(1) - 0.5) * 0.3, 0, c.z + (h(2) - 0.5) * 0.3),
        rot: new THREE.Euler(0, h(3) * Math.PI * 2, 0),
        scale: new THREE.Vector3(sxz, sy, sxz),
        color,
      };
      (groups.get(proto) ?? groups.set(proto, []).get(proto)).push(entry);
      picks.push({ i: c.i, entry, radius: (proto.width * sxz) / 2, height });
      tops[c.i] = height;
    });

    for (const [proto, entries] of groups) {
      const make = (geo, mat) => {
        const m = new THREE.InstancedMesh(geo, mat, entries.length);
        m.castShadow = opts.shadows;
        m.receiveShadow = true;
        m.frustumCulled = false;
        m.userData.shared = true; // the model geometry and materials are cached for reuse
        board.add(m);
        return m;
      };
      const branches = make(proto.branches, proto.branchMat);
      const leaves = make(proto.leaves, proto.leafMat);
      leaves.customDepthMaterial = depthMaterial(proto.leafMat);
      const group = { branches, leaves, entries };
      entries.forEach((e, k) => {
        leaves.setColorAt(k, e.color);
        branches.setColorAt(k, white);
        (byDay.get(e.i) ?? byDay.set(e.i, []).get(e.i)).push({ group, k });
      });
      meshes.push(group);
    }

    proxy = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(1, 1, 1, 6).translate(0, 0.5, 0),
      new THREE.MeshBasicMaterial({ visible: false }),
      Math.max(1, picks.length),
    );
    proxy.count = picks.length;
    const m4 = new THREE.Matrix4();
    picks.forEach((p, k) => {
      const r = Math.max(0.25, p.radius * 0.7);
      proxy.setMatrixAt(k, m4.compose(p.entry.pos, new THREE.Quaternion(), new THREE.Vector3(r, p.height, r)));
    });
    proxyDays = picks.map((p) => p.i);
    board.add(proxy);

    start = performance.now();
    settled = false;
  }

  const depthCache = new Map();
  function depthMaterial(leafMat) {
    // leaves cast leaf-shaped shadows instead of square ones
    if (!depthCache.has(leafMat)) {
      depthCache.set(leafMat, new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: leafMat.map, alphaTest: leafMat.alphaTest }));
    }
    return depthCache.get(leafMat);
  }

  let start = 0;
  let settled = false;
  let hovered = -1;
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const sv = new THREE.Vector3();
  plant();

  function grow(now) {
    let done = true;
    for (const { branches, leaves, entries } of meshes) {
      entries.forEach((e, k) => {
        const g = easeOut((now - start - cells[e.i].col * 25) / 800);
        if (g < 1) done = false;
        q.setFromEuler(e.rot);
        sv.copy(e.scale).multiplyScalar(Math.max(g, 0.0001));
        m4.compose(e.pos, q, sv);
        branches.setMatrixAt(k, m4);
        leaves.setMatrixAt(k, m4);
      });
      branches.instanceMatrix.needsUpdate = true;
      leaves.instanceMatrix.needsUpdate = true;
    }
    return done;
  }

  function tint(i, on) {
    for (const { group, k } of byDay.get(i) ?? []) {
      const e = group.entries[k];
      group.leaves.setColorAt(k, on ? e.color.clone().lerp(white, 0.5) : e.color);
      group.leaves.instanceColor.needsUpdate = true;
    }
  }

  return {
    update(now) {
      library.update(now / 1000);
      if (!settled) settled = grow(now);
    },
    pick(raycaster) {
      const hit = raycaster.intersectObject(proxy, false)[0];
      return hit ? proxyDays[hit.instanceId] : -1;
    },
    setHover(i) {
      if (i === hovered) return;
      if (hovered >= 0) tint(hovered, false);
      hovered = i;
      if (i >= 0) tint(i, true);
    },
    anchor: (i) => new THREE.Vector3(cells[i].x, tops[i], cells[i].z),
    setShadows(on) {
      for (const m of meshes) m.branches.castShadow = m.leaves.castShadow = on;
      island.castShadow = on;
      ground.visible = on;
    },
    setOptions(next) {
      opts = next;
      plant();
    },
    replay() {
      start = performance.now();
      settled = false;
      grow(start); // hide the grown trees right away
    },
  };
}
