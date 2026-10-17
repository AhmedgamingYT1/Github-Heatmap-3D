// City: one bar per day. The original look, plus the Night City skin.
import * as THREE from 'three';
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { CELL, BASE_H, hash, gridLayout, maxCount, addGridLabels, plinthMesh, shadowGround, glowTex } from './common.js';

const MIN_H = 0.08; // height of an empty day
const WINDOW_LIT = ['#ffd66b', '#ffe9a8', '#ffcf7a', '#fff1c2', '#9fd8ff'].map((c) => new THREE.Color(c));
const WINDOW_DARK = new THREE.Color('#182036');

export function createCity(ctx, { night = false } = {}) {
  const { board, renderer, theme } = ctx;
  let opts = ctx.opts;
  const days = ctx.days;
  const layout = gridLayout(days);
  const { cells } = layout;
  const bar = opts.barSize * CELL;
  const levelColors = theme.levels.map((c) => new THREE.Color(c));
  const hoverColor = new THREE.Color(theme.dark ? '#ffffff' : theme.text);

  // plinth
  const plinth = plinthMesh(
    layout,
    new THREE.MeshStandardMaterial({ color: theme.plinth, roughness: night ? 0.8 : 0.6, metalness: theme.dark ? 0.2 : 0 }),
  );
  plinth.visible = opts.base;
  board.add(plinth);

  // bars
  const geo = new THREE.BoxGeometry(bar, 1, bar);
  geo.translate(0, 0.5, 0); // base at y = 0 so scaling grows upward
  const mat = new THREE.MeshStandardMaterial({ roughness: night ? 0.55 : 0.45, metalness: night ? 0.35 : 0.1 });
  if (night) mat.emissive.set('#0c1533'); // faint city glow so towers read against the sky
  const bars = new THREE.InstancedMesh(geo, mat, cells.length);
  bars.receiveShadow = true;
  bars.frustumCulled = false;
  cells.forEach((c, i) => bars.setColorAt(i, levelColors[c.day.level]));
  board.add(bars);

  let target = new Float32Array(cells.length);
  let current = new Float32Array(cells.length);
  let animStart = performance.now();
  computeTargets();
  if (ctx.prevHeights?.length === cells.length) {
    current = ctx.prevHeights;
    current.set(target); // a rebuild (e.g. theme change): jump straight to final heights
    animStart = -Infinity;
    writeAll();
  }

  addGridLabels(board, renderer, layout, opts, theme, night ? { bar, titleColor: theme.label } : { bar });
  const ground = shadowGround(opts.base ? -BASE_H : 0, theme.dark ? 0.35 : 0.15);
  board.add(ground);

  // ---------- night extras ----------
  let windows = null;
  let beacons = null;
  let windowsShown = false;
  if (night) {
    const stars = new THREE.BufferGeometry();
    const pos = [];
    for (let k = 0; k < 1800; k++) {
      const a = hash(k) * Math.PI * 2;
      const e = Math.asin(hash(k + 9000) * 0.95); // upper half of the sky
      const r = 160;
      pos.push(Math.cos(a) * Math.cos(e) * r, Math.sin(e) * r - 10, Math.sin(a) * Math.cos(e) * r);
    }
    stars.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    board.add(
      new THREE.Points(
        stars,
        new THREE.PointsMaterial({ size: 1.1, map: glowTex(), color: '#cfd8ff', transparent: true, depthWrite: false, fog: false }),
      ),
    );
    buildWindows();
  }

  function buildWindows() {
    if (windows) {
      board.remove(windows, beacons);
      windows.geometry.dispose();
      windows.material.dispose();
      beacons.geometry.dispose();
      beacons.material.dispose();
    }
    // Two windows per floor on each of the four faces.
    const faces = [
      [0, 0, 1, 0],
      [1, 0, 0, Math.PI / 2],
      [0, 0, -1, Math.PI],
      [-1, 0, 0, -Math.PI / 2],
    ];
    const half = bar / 2;
    const list = [];
    cells.forEach((c, i) => {
      const h = target[i];
      if (h < 0.9) return;
      let floor = 0;
      for (let y = 0.3; y < h - 0.3; y += 0.42, floor++) {
        faces.forEach(([nx, , nz, rot], f) => {
          for (const u of [-0.17, 0.17]) {
            const tx = nz !== 0 ? u : 0;
            const tz = nx !== 0 ? u : 0;
            const seed = i * 977 + floor * 31 + f * 7 + (u > 0 ? 1 : 0);
            list.push({ x: c.x + nx * (half + 0.003) + tx, y: y + 0.12, z: c.z + nz * (half + 0.003) + tz, rot, lit: hash(seed) < 0.62, seed });
          }
        });
      }
    });
    windows = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(0.2, 0.24),
      new THREE.MeshBasicMaterial({ toneMapped: false, transparent: true, opacity: 0 }),
      Math.max(1, list.length),
    );
    windows.count = list.length;
    windows.frustumCulled = false;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    list.forEach((w, k) => {
      q.setFromAxisAngle(up, w.rot);
      m.compose(new THREE.Vector3(w.x, w.y, w.z), q, new THREE.Vector3(1, 1, 1));
      windows.setMatrixAt(k, m);
      windows.setColorAt(k, w.lit ? WINDOW_LIT[Math.floor(hash(w.seed + 5) * WINDOW_LIT.length)] : WINDOW_DARK);
    });
    board.add(windows);

    // red aviation lights on the ten tallest towers
    const tallest = [...cells.keys()].sort((a, b) => target[b] - target[a]).slice(0, 10);
    beacons = new THREE.InstancedMesh(
      new THREE.SphereGeometry(0.09, 8, 6),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 0.25, 0.2), toneMapped: false, transparent: true, opacity: 0 }),
      tallest.length,
    );
    tallest.forEach((i, k) => beacons.setMatrixAt(k, m.makeTranslation(cells[i].x, target[i] + 0.1, cells[i].z)));
    board.add(beacons);
    windowsShown = false;
  }

  // ---------- heights ----------
  function computeTargets() {
    const max = maxCount(days);
    const norm = opts.log ? (n) => Math.log1p(n) / Math.log1p(max) : (n) => n / max;
    cells.forEach((c, i) => {
      target[i] = c.day.count > 0 ? 0.2 + norm(c.day.count) * opts.height : MIN_H;
    });
  }

  const tmpMatrix = new THREE.Matrix4();
  const tmpPos = new THREE.Vector3();
  const tmpQuat = new THREE.Quaternion();
  const tmpScale = new THREE.Vector3();
  function setBarMatrix(i) {
    const c = cells[i];
    tmpPos.set(c.x, 0, c.z);
    tmpScale.set(1, Math.max(current[i], 0.0001), 1);
    bars.setMatrixAt(i, tmpMatrix.compose(tmpPos, tmpQuat, tmpScale));
  }
  function writeAll() {
    cells.forEach((_, i) => setBarMatrix(i));
    bars.instanceMatrix.needsUpdate = true;
  }

  let hovered = -1;
  let lastFrame = performance.now();

  return {
    update(now) {
      let changed = false;
      const elapsed = now - animStart;
      const k = 1 - Math.exp(-Math.min(0.25, (now - lastFrame) / 1000) * 7.5); // same speed at any frame rate
      lastFrame = now;
      for (let i = 0; i < cells.length; i++) {
        if (elapsed < cells[i].col * 18) continue; // left-to-right wave on load
        const diff = target[i] - current[i];
        if (Math.abs(diff) < 0.001) {
          if (current[i] === target[i]) continue;
          current[i] = target[i];
        } else {
          current[i] += diff * k;
        }
        setBarMatrix(i);
        changed = true;
      }
      if (changed) {
        bars.instanceMatrix.needsUpdate = true;
        bars.boundingSphere = null; // recompute for raycasting
        bars.boundingBox = null;
      }
      // night: windows switch on once the towers have (nearly) finished growing
      if (windows && !windowsShown && (!changed || elapsed > layout.cols * 18 + 700)) windowsShown = now;
      if (windows && windowsShown && windows.material.opacity < 1) {
        windows.material.opacity = Math.min(1, (now - windowsShown) / 600);
      }
      if (beacons && windowsShown) beacons.material.opacity = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(now / 400));
    },
    pick(raycaster) {
      const hit = raycaster.intersectObject(bars, false)[0];
      return hit ? hit.instanceId : -1;
    },
    setHover(i) {
      if (i === hovered) return;
      if (hovered >= 0) bars.setColorAt(hovered, levelColors[cells[hovered].day.level]);
      hovered = i;
      if (i >= 0) bars.setColorAt(i, hoverColor);
      bars.instanceColor.needsUpdate = true;
    },
    anchor: (i) => new THREE.Vector3(cells[i].x, current[i], cells[i].z),
    setShadows(on) {
      bars.castShadow = on;
      plinth.castShadow = on;
      ground.visible = on;
    },
    /** height/log changed: animate to the new heights without rebuilding */
    setOptions(next) {
      opts = next;
      computeTargets();
      animStart = performance.now() - layout.cols * 18; // no wave, just resize
      if (night) buildWindows();
    },
    heights: () => current,
    exportSTL() {
      const parts = [];
      if (opts.base) parts.push(plinth.geometry.clone());
      const box = new THREE.BoxGeometry(bar, 1, bar);
      box.translate(0, 0.5, 0);
      cells.forEach((c, i) => {
        const g = box.clone();
        g.scale(1, target[i], 1);
        g.translate(c.x, 0, c.z);
        parts.push(g);
      });
      const mesh = new THREE.Mesh(mergeGeometries(parts));
      mesh.rotation.x = Math.PI / 2; // most slicers treat Z as up
      mesh.updateMatrixWorld();
      const data = new STLExporter().parse(mesh, { binary: true });
      parts.forEach((g) => g.dispose());
      box.dispose();
      mesh.geometry.dispose();
      return new Blob([data], { type: 'model/stl' });
    },
  };
}
