// City: one bar per day. The original look.
import * as THREE from 'three';
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { CELL, BASE_H, gridLayout, maxCount, addGridLabels, plinthMesh, shadowGround } from './common.js';

const MIN_H = 0.08; // height of an empty day

export function createCity(ctx) {
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
    new THREE.MeshStandardMaterial({ color: theme.plinth, roughness: 0.6, metalness: theme.dark ? 0.2 : 0 }),
  );
  plinth.visible = opts.base;
  board.add(plinth);

  // bars
  const geo = new THREE.BoxGeometry(bar, 1, bar);
  geo.translate(0, 0.5, 0); // base at y = 0 so scaling grows upward
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.45, metalness: 0.1 });
  const bars = new THREE.InstancedMesh(geo, mat, cells.length);
  bars.receiveShadow = true;
  bars.frustumCulled = false;
  cells.forEach((c, i) => bars.setColorAt(i, levelColors[c.day.level]));
  board.add(bars);

  // scratch objects for the bar matrices (declared before the first writeAll below)
  const tmpMatrix = new THREE.Matrix4();
  const tmpPos = new THREE.Vector3();
  const tmpQuat = new THREE.Quaternion();
  const tmpScale = new THREE.Vector3();
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

  addGridLabels(board, renderer, layout, opts, theme, { bar });
  const ground = shadowGround(opts.base ? -BASE_H : 0, theme.dark ? 0.35 : 0.15);
  board.add(ground);

  // ---------- heights ----------
  function computeTargets() {
    const max = maxCount(days);
    const norm = opts.log ? (n) => Math.log1p(n) / Math.log1p(max) : (n) => n / max;
    cells.forEach((c, i) => {
      target[i] = c.day.count > 0 ? 0.2 + norm(c.day.count) * opts.height : MIN_H;
    });
  }

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
      const k = 1 - Math.exp(-Math.min(0.25, Math.max(0, (now - lastFrame) / 1000)) * 7.5); // same speed at any frame rate
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
    },
    heights: () => current,
    /** grow in again from flat, left to right */
    replay() {
      current.fill(0);
      writeAll();
      animStart = performance.now();
    },
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
