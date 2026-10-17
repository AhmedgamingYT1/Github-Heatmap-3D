// Galaxy: the year as a spiral galaxy. January sits at the core, December at the rim.
// Every day is a star sized by its count; the biggest days become planets.
import * as THREE from 'three';
import { hash, maxCount, glowTex, textSprite, easeOut, MONTHS } from './common.js';

const ARMS = 2;
const TURNS = 1.35;
const PLANET_COUNT = 12;
const PLANET_COLORS = ['#ffb36b', '#7fd1ff', '#ff7aa8', '#c9a2ff', '#9dffc4', '#ffe28a'];

export function createGalaxy(ctx) {
  const { board, theme, days } = ctx;
  let opts = ctx.opts;
  const max = maxCount(days);
  const levelColors = theme.levels.map((c) => new THREE.Color(c).multiplyScalar(1.15)); // a touch over 1 so bloom picks them up
  const group = new THREE.Group();
  board.add(group);

  // Position of each day along its spiral arm.
  const spot = days.map((d, i) => {
    const t = i / days.length;
    const arm = i % ARMS;
    const angle = t * Math.PI * 2 * TURNS + (arm * Math.PI * 2) / ARMS;
    const r = 3.5 + t * 30 + (hash(i) - 0.5) * 2.4;
    const spread = 1 - t * 0.5;
    return new THREE.Vector3(Math.cos(angle) * r, (hash(i + 500) - 0.5) * 1.6 * spread, Math.sin(angle) * r);
  });

  // ---------- dust: thousands of faint particles along the arms ----------
  const dust = new THREE.BufferGeometry();
  const pos = [];
  const col = [];
  const core = new THREE.Color('#ffd9a8');
  const rim = new THREE.Color(theme.accent);
  const tmpC = new THREE.Color();
  for (let k = 0; k < 14000; k++) {
    const t = Math.pow(hash(k * 3 + 1), 0.8);
    const arm = k % ARMS;
    const angle = t * Math.PI * 2 * TURNS + (arm * Math.PI * 2) / ARMS + (hash(k * 3 + 2) - 0.5) * 0.9 * (1 - t * 0.4);
    const r = 1 + t * 34 + (hash(k * 7) - 0.5) * 4;
    pos.push(Math.cos(angle) * r, (hash(k * 11) - 0.5) * 2.4 * (1 - t * 0.6), Math.sin(angle) * r);
    tmpC.copy(core).lerp(rim, Math.min(1, t * 1.3)).multiplyScalar(0.5 + hash(k * 13) * 0.5);
    col.push(tmpC.r, tmpC.g, tmpC.b);
  }
  dust.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  dust.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  group.add(
    new THREE.Points(
      dust,
      new THREE.PointsMaterial({
        size: 0.55,
        map: glowTex(),
        vertexColors: true,
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    ),
  );

  // glowing core
  const glow = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: glowTex(), color: '#ffcf9a', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
  );
  glow.material.opacity = 0.7;
  glow.scale.set(11, 11, 1);
  group.add(glow);

  // distant background stars
  const bg = new THREE.BufferGeometry();
  const bgPos = [];
  for (let k = 0; k < 1500; k++) {
    const a = hash(k + 20000) * Math.PI * 2;
    const e = Math.asin(hash(k + 30000) * 2 - 1);
    bgPos.push(Math.cos(a) * Math.cos(e) * 170, Math.sin(e) * 170, Math.sin(a) * Math.cos(e) * 170);
  }
  bg.setAttribute('position', new THREE.Float32BufferAttribute(bgPos, 3));
  board.add(new THREE.Points(bg, new THREE.PointsMaterial({ size: 0.9, map: glowTex(), color: '#bfc6ff', transparent: true, depthWrite: false })));

  // ---------- planets: the biggest days ----------
  const planetDays = [...days.keys()]
    .filter((i) => days[i].count > 0)
    .sort((a, b) => days[b].count - days[a].count)
    .slice(0, PLANET_COUNT);
  const planetSet = new Set(planetDays);
  const planets = planetDays.map((i, k) => {
    const size = 0.55 + Math.sqrt(days[i].count / max) * 0.9;
    const color = new THREE.Color(PLANET_COLORS[k % PLANET_COLORS.length]);
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(size, 32, 16),
      new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.2, roughness: 0.7 }),
    );
    mesh.userData.day = i;
    mesh.position.copy(spot[i]).setY(spot[i].y + 0.8);
    if (k < 3) {
      // the top three get rings
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(size * 1.4, size * 2.1, 48),
        new THREE.MeshBasicMaterial({ color: color.clone().lerp(new THREE.Color('#ffffff'), 0.4), side: THREE.DoubleSide, transparent: true, opacity: 0.6 }),
      );
      ring.rotation.x = -Math.PI / 2 + 0.45;
      mesh.add(ring);
    }
    mesh.scale.setScalar(0.0001);
    group.add(mesh);
    return mesh;
  });

  // ---------- stars: every other day ----------
  const stars = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshBasicMaterial({ toneMapped: false }), days.length);
  stars.frustumCulled = false;
  const baseScale = new Float32Array(days.length);
  function computeScales() {
    days.forEach((d, i) => {
      baseScale[i] = planetSet.has(i) ? 0 : d.count ? (0.18 + Math.sqrt(d.count / max) * 0.5) * (opts.height / 8) ** 0.5 : 0.09;
    });
  }
  computeScales();
  days.forEach((d, i) => stars.setColorAt(i, levelColors[d.level]));
  group.add(stars);

  // month markers on the outer side of each month's first day
  if (opts.labels) {
    let last = -1;
    days.forEach((d, i) => {
      const m = Number(d.date.slice(5, 7)) - 1;
      if (m === last) return;
      last = m;
      const s = textSprite(MONTHS[m], { size: 1.1, color: theme.label });
      s.position.copy(spot[i]).multiplyScalar(1 + 3.2 / spot[i].length()).setY(2);
      group.add(s);
    });
  }

  const start = performance.now();
  const scale = new Float32Array(days.length);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const v = new THREE.Vector3();
  let hovered = -1;
  let settled = false;

  function writeStar(i) {
    const s = scale[i] * (i === hovered ? 2.2 : 1);
    stars.setMatrixAt(i, m4.compose(spot[i], q, v.set(s, s, s)));
  }

  return {
    update(now) {
      group.rotation.y = -now * 0.00002; // the galaxy turns slowly on its own
      if (settled) return;
      // stars light up from the core outward
      let done = true;
      for (let i = 0; i < days.length; i++) {
        const g = easeOut((now - start - i * 5) / 600);
        if (g < 1) done = false;
        scale[i] = baseScale[i] * g;
        writeStar(i);
      }
      planets.forEach((p) => p.scale.setScalar(Math.max(0.0001, easeOut((now - start - p.userData.day * 5 - 300) / 900))));
      stars.instanceMatrix.needsUpdate = true;
      stars.boundingSphere = null;
      settled = done;
    },
    pick(raycaster) {
      const hits = raycaster.intersectObjects([stars, ...planets], false);
      for (const h of hits) {
        if (h.object === stars) return h.instanceId;
        if (h.object.userData.day != null) return h.object.userData.day;
      }
      return -1;
    },
    setHover(i) {
      if (i === hovered) return;
      const prev = hovered;
      hovered = i;
      for (const k of [prev, i]) if (k >= 0 && !planetSet.has(k)) writeStar(k);
      planets.forEach((p) => p.material.emissiveIntensity = p.userData.day === i ? 0.9 : 0.2);
      stars.instanceMatrix.needsUpdate = true;
    },
    anchor: (i) => spot[i].clone().applyMatrix4(group.matrixWorld),
    setShadows() {},
    setOptions(next) {
      opts = next;
      computeScales();
      for (let i = 0; i < days.length; i++) scale[i] = baseScale[i];
      settled = false;
    },
  };
}
