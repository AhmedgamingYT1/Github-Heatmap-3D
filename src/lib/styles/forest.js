// Forest: a grassy island with one plant per day, spaced out like a real forest.
//   height  = that day's contributions (linear, or log with the Log scale option)
//   color   = GitHub level: light green, green, then pink blossom for the two busiest levels
//   no contributions → bare grass, a few → a sprout with one or two leaves.
// Canopies stay narrower than the spacing, so every tree stands on its own.
import * as THREE from 'three';
import { BASE_H, hash, gridLayout, maxCount, addGridLabels, plinthMesh, shadowGround, easeOut } from './common.js';

const SPACING = 1.5; // distance between trees (the City uses 1)
const MAX_RADIUS = 0.6; // widest canopy; < SPACING / 2 leaves a gap between neighbours
const SPROUT_HEIGHT = 1; // trees shorter than this are drawn as sprouts

const TRUNK = new THREE.Color('#7a5534');
const STEM = new THREE.Color('#6fae4f');
const PEBBLE = new THREE.Color('#9b917f');

export function createForest(ctx) {
  const { board, renderer, theme, days } = ctx;
  let opts = ctx.opts;
  const layout = gridLayout(days, SPACING);
  const { cells } = layout;
  // canopy color per level, from the theme so the page legend matches
  const canopy = theme.levels.map((c) => new THREE.Color(c));

  // island: grass on top, soil on the sides
  const soil = new THREE.MeshStandardMaterial({ color: '#7a5534', roughness: 1 });
  const grass = new THREE.MeshStandardMaterial({ color: theme.levels[0], roughness: 0.95 });
  const island = plinthMesh(layout, [soil, soil, grass, soil, soil, soil]);
  island.visible = opts.base;
  board.add(island);
  addGridLabels(board, renderer, layout, opts, theme, { bar: 1, labelColor: '#3d5a2a', titleColor: '#2a3d1f' });
  const ground = shadowGround(opts.base ? -BASE_H : 0, 0.2);
  board.add(ground);

  // One InstancedMesh per part; each instance remembers its day and final transform.
  const parts = {
    trunk: { geo: new THREE.CylinderGeometry(0.6, 1, 1, 7).translate(0, 0.5, 0), list: [] },
    blob: { geo: new THREE.IcosahedronGeometry(1, 0), list: [] },
    cone: { geo: new THREE.ConeGeometry(1, 1, 8).translate(0, 0.5, 0), list: [] },
    leaf: { geo: new THREE.SphereGeometry(1, 8, 6), list: [] },
    pebble: { geo: new THREE.DodecahedronGeometry(1, 0), list: [] },
  };
  const meshes = [];
  const tops = new Float32Array(cells.length); // plant height per day, for the song marker

  function plant() {
    for (const p of Object.values(parts)) p.list = [];
    const max = maxCount(days);
    const norm = opts.log ? (n) => Math.log1p(n) / Math.log1p(max) : (n) => n / max;
    const add = (part, i, x, y, z, sx, sy, sz, color, ry = 0, rz = 0) =>
      parts[part].list.push({ i, pos: new THREE.Vector3(x, y, z), scale: new THREE.Vector3(sx, sy, sz), rot: new THREE.Euler(0, ry, rz), color });

    cells.forEach((c) => {
      const { count, level } = c.day;
      const h = (n) => hash(c.i * 13 + n);
      // a small nudge off the grid so rows don't look planted by a machine
      const x = c.x + (h(1) - 0.5) * 0.2;
      const z = c.z + (h(2) - 0.5) * 0.2;
      tops[c.i] = 0;
      if (count === 0) {
        if (h(3) < 0.12) add('pebble', c.i, x, 0.03, z, 0.1, 0.07, 0.09, PEBBLE, h(4) * 3);
        return;
      }
      const s = norm(count); // 0..1
      const height = 0.45 + s * opts.height * 0.95;
      const color = canopy[Math.max(1, level)];
      const shade = (n) => color.clone().multiplyScalar(0.88 + h(n) * 0.24); // a little variety in every crown

      if (height < SPROUT_HEIGHT) {
        // sprout: a stem with one or two leaves
        const stem = 0.25 + height * 0.3;
        add('trunk', c.i, x, 0, z, 0.035, stem, 0.035, STEM);
        const leaves = count > 1 ? 2 : 1;
        for (let l = 0; l < leaves; l++) {
          const side = l === 0 ? 1 : -1;
          add('leaf', c.i, x + side * 0.1, stem * (0.8 + l * 0.12), z, 0.15, 0.04, 0.08, shade(5 + l), h(6) * 3, side * 0.5);
        }
        tops[c.i] = stem + 0.1;
        return;
      }

      tops[c.i] = height;
      const radius = Math.min(MAX_RADIUS, 0.3 + 0.3 * Math.sqrt(s));
      const blossom = level >= 3;
      // blossom trees are round; green ones are pines or round trees
      const pine = !blossom && h(7) < 0.5;
      const trunkR = 0.06 + 0.05 * s;

      if (pine) {
        const trunkH = height * 0.18;
        add('trunk', c.i, x, 0, z, trunkR, trunkH, trunkR, TRUNK, h(8) * 3);
        const tiers = Math.max(2, Math.min(6, Math.round(height / 1.3)));
        const tierH = ((height - trunkH) / tiers) * 1.6;
        for (let t = 0; t < tiers; t++) {
          const r = radius * (1.1 - (t / tiers) * 0.6);
          const y = trunkH + (t / tiers) * (height - trunkH - tierH);
          add('cone', c.i, x, y, z, r, tierH, r, shade(10 + t), h(11 + t) * 3);
        }
      } else {
        const trunkH = height * 0.38;
        add('trunk', c.i, x, 0, z, trunkR, trunkH, trunkR, TRUNK, h(8) * 3);
        // crown: one leafy body from the top of the trunk to the tree's full height,
        // plus a couple of smaller clumps on the sides so it doesn't look machine-made
        const crownH = height - trunkH;
        const half = Math.max(radius, crownH / 2);
        add('blob', c.i, x, trunkH + half * 0.92, z, radius, half, radius, shade(40), h(41) * 3);
        const clumps = crownH > radius * 2.5 ? 2 : 1;
        for (let b = 0; b < clumps; b++) {
          const a = h(30 + b) * Math.PI * 2;
          const r = radius * (0.55 + h(20 + b) * 0.15);
          const y = trunkH + crownH * (0.3 + h(25 + b) * 0.35);
          add('blob', c.i, x + Math.cos(a) * radius * 0.55, y, z + Math.sin(a) * radius * 0.55, r, r * 1.1, r, shade(42 + b), h(50 + b) * 3);
        }
      }
    });

    for (const m of meshes) {
      board.remove(m);
      m.material.dispose();
    }
    meshes.length = 0;
    for (const [name, p] of Object.entries(parts)) {
      const mesh = new THREE.InstancedMesh(
        p.geo,
        new THREE.MeshStandardMaterial({ flatShading: true, roughness: name === 'trunk' ? 1 : 0.75 }),
        Math.max(1, p.list.length),
      );
      mesh.count = p.list.length;
      mesh.castShadow = opts.shadows;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      mesh.userData.part = p;
      p.list.forEach((e, k) => mesh.setColorAt(k, e.color));
      p.byDay = new Map();
      p.list.forEach((e, k) => (p.byDay.get(e.i) ?? p.byDay.set(e.i, []).get(e.i)).push(k));
      board.add(mesh);
      meshes.push(mesh);
    }
    start = performance.now();
    settled = false;
  }

  let start = 0;
  let settled = false;
  let hovered = -1;
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const sv = new THREE.Vector3();
  const pv = new THREE.Vector3();
  const white = new THREE.Color('#ffffff');
  plant();

  function grow(now) {
    let done = true;
    for (const mesh of meshes) {
      const p = mesh.userData.part;
      p.list.forEach((e, k) => {
        const g = easeOut((now - start - cells[e.i].col * 25) / 700);
        if (g < 1) done = false;
        q.setFromEuler(e.rot);
        sv.copy(e.scale).multiplyScalar(Math.max(g, 0.0001));
        pv.copy(e.pos).setY(e.pos.y * g);
        mesh.setMatrixAt(k, m4.compose(pv, q, sv));
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.boundingSphere = null;
    }
    return done;
  }

  function tint(i, on) {
    for (const mesh of meshes) {
      const p = mesh.userData.part;
      for (const k of p.byDay.get(i) ?? []) mesh.setColorAt(k, on ? p.list[k].color.clone().lerp(white, 0.5) : p.list[k].color);
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }

  return {
    update(now) {
      if (!settled) settled = grow(now);
    },
    pick(raycaster) {
      const hit = raycaster.intersectObjects(meshes, false)[0];
      return hit ? hit.object.userData.part.list[hit.instanceId].i : -1;
    },
    setHover(i) {
      if (i === hovered) return;
      if (hovered >= 0) tint(hovered, false);
      hovered = i;
      if (i >= 0) tint(i, true);
    },
    anchor: (i) => new THREE.Vector3(cells[i].x, tops[i], cells[i].z),
    setShadows(on) {
      meshes.forEach((m) => (m.castShadow = on));
      island.castShadow = on;
      ground.visible = on;
    },
    setOptions(next) {
      opts = next;
      plant();
    },
  };
}
