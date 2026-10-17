// Forest: a grassy island where every day grows something.
// No contributions → bare soil, a few → a sprout with one or two leaves,
// more → a young tree, big days → a big tree (some of them in bloom).
import * as THREE from 'three';
import { BASE_H, hash, gridLayout, maxCount, addGridLabels, plinthMesh, shadowGround, easeOut } from './common.js';

const LEAF = ['#8cc66b', '#6fae4f', '#5c9a3a', '#4a8a30', '#3f7d2a', '#2f6a22'].map((c) => new THREE.Color(c));
const BLOOM = ['#f7a6c4', '#ffb36b', '#ffd36b', '#e97a9a'].map((c) => new THREE.Color(c));
const TRUNK = new THREE.Color('#7a5534');
const PEBBLE = new THREE.Color('#9b917f');

export function createForest(ctx) {
  const { board, renderer, theme, days } = ctx;
  let opts = ctx.opts;
  const layout = gridLayout(days);
  const { cells } = layout;

  // island: grass on top, soil on the sides
  const soil = new THREE.MeshStandardMaterial({ color: '#7a5534', roughness: 1 });
  const grass = new THREE.MeshStandardMaterial({ color: '#86b85a', roughness: 0.95 });
  const island = plinthMesh(layout, [soil, soil, grass, soil, soil, soil]);
  island.visible = opts.base;
  board.add(island);
  addGridLabels(board, renderer, layout, opts, theme, { labelColor: '#3d5a2a', titleColor: '#2a3d1f' });
  const ground = shadowGround(opts.base ? -BASE_H : 0, 0.18);
  board.add(ground);

  // One InstancedMesh per part; each part instance remembers its day and its final transform.
  const parts = {
    trunk: { geo: new THREE.CylinderGeometry(0.5, 0.7, 1, 7).translate(0, 0.5, 0), list: [] },
    blob: { geo: new THREE.IcosahedronGeometry(1, 0), list: [] },
    cone: { geo: new THREE.ConeGeometry(1, 1, 7).translate(0, 0.5, 0), list: [] },
    leaf: { geo: new THREE.SphereGeometry(1, 8, 6), list: [] },
    pebble: { geo: new THREE.DodecahedronGeometry(1, 0), list: [] },
  };
  const meshes = [];
  const max = maxCount(days);

  function plant() {
    for (const p of Object.values(parts)) p.list = [];
    const k = (opts.height / 8) ** 0.6; // the Height slider scales the trees
    const add = (part, i, x, y, z, sx, sy, sz, color, ry = 0, rz = 0) =>
      parts[part].list.push({ i, pos: new THREE.Vector3(x, y, z), scale: new THREE.Vector3(sx, sy, sz), rot: new THREE.Euler(0, ry, rz), color });

    cells.forEach((c) => {
      const { count, level } = c.day;
      const h = (n) => hash(c.i * 13 + n);
      // nudge each plant off the grid a little so it looks natural
      const x = c.x + (h(1) - 0.5) * 0.25;
      const z = c.z + (h(2) - 0.5) * 0.25;
      if (count === 0) {
        if (h(3) < 0.3) add('pebble', c.i, x, 0.03, z, 0.09, 0.06, 0.08, PEBBLE, h(4) * 3);
        return;
      }
      const s = Math.sqrt(count / max); // 0..1
      const leafColor = LEAF[Math.min(LEAF.length - 1, Math.floor(h(5) * 2 + level))];

      if (level <= 1 && s < 0.3) {
        // sprout: a stem with one or two leaves
        const stem = 0.18 + s * 0.5;
        add('trunk', c.i, x, 0, z, 0.03, stem, 0.03, LEAF[1]);
        const leaves = count > 1 ? 2 : 1;
        for (let l = 0; l < leaves; l++) {
          const side = l === 0 ? 1 : -1;
          add('leaf', c.i, x + side * 0.08, stem * (0.75 + l * 0.15), z, 0.12, 0.035, 0.065, LEAF[0], h(6) * 3, side * 0.5);
        }
        return;
      }

      const size = (0.7 + s * 2.9) * k;
      const type = Math.floor(h(7) * 3); // round, pine or poplar
      const trunkH = size * (type === 1 ? 0.35 : 0.5);
      add('trunk', c.i, x, 0, z, 0.07 * size, trunkH, 0.07 * size, TRUNK, h(8) * 3);
      const blooming = level === 4 && h(9) < 0.5;
      const top = blooming ? BLOOM[Math.floor(h(10) * BLOOM.length)] : leafColor;

      if (type === 1) {
        // pine: three stacked cones
        for (let l = 0; l < 3; l++) {
          const r = size * (0.42 - l * 0.1);
          add('cone', c.i, x, trunkH * 0.7 + l * size * 0.3, z, r, size * 0.5, r, l === 2 ? top : leafColor, h(11 + l) * 3);
        }
      } else if (type === 2) {
        // poplar: one tall blob
        add('blob', c.i, x, trunkH + size * 0.45, z, size * 0.28, size * 0.62, size * 0.28, top, h(12) * 3);
      } else {
        // round tree: a cluster of blobs
        const blobs = size > 1.4 ? 3 : 2;
        for (let l = 0; l < blobs; l++) {
          const a = (l / blobs) * Math.PI * 2 + h(13) * 3;
          const r = size * (0.36 - l * 0.04);
          const off = l === 0 ? 0 : size * 0.18;
          add('blob', c.i, x + Math.cos(a) * off, trunkH + size * 0.25 + l * size * 0.12, z + Math.sin(a) * off, r, r * 0.9, r, l === blobs - 1 ? top : leafColor, h(14 + l) * 3);
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
        new THREE.MeshStandardMaterial({ flatShading: true, roughness: name === 'trunk' ? 1 : 0.8 }),
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
      for (const k of p.byDay.get(i) ?? []) mesh.setColorAt(k, on ? p.list[k].color.clone().lerp(white, 0.55) : p.list[k].color);
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
    anchor(i) {
      let top = 0;
      for (const p of Object.values(parts)) for (const e of p.list) if (e.i === i) top = Math.max(top, e.pos.y + e.scale.y);
      return new THREE.Vector3(cells[i].x, top, cells[i].z);
    },
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

