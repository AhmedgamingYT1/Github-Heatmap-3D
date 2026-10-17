// Galaxy: the year as a spiral galaxy. January sits at the core, December at the rim.
//   each day      = a star on the spiral, sized by its count, colored like a real star by level
//                   (red dwarf → yellow → white → blue giant)
//   biggest days  = planets (gas giants, rocky, ocean and ice worlds; the top three ringed)
//   around them   = ~90k particles of arms, bulge, dust lanes, nebulae and a starfield
// Month rings form a faint star chart. Everything is procedural — no assets to load.
import * as THREE from 'three';
import { hash, maxCount, glowTex, textSprite, MONTHS } from './common.js';

const ARMS = 4;
const TWIST = 0.21; // radians of spiral per unit of radius
const R_MIN = 3.5;
const R_MAX = 33;
const PLANET_COUNT = 12;
const STAR_COLORS = ['#7d86a8', '#ffb27a', '#fff0c4', '#dfe8ff', '#94b9ff'];

// ---------- particle shader: per-point size + color, sized in world units ----------
const uniforms = { uTime: { value: 0 }, uScale: { value: 600 } };
function particleMaterial({ map, blending = THREE.AdditiveBlending, opacity = 1 }) {
  return new THREE.ShaderMaterial({
    uniforms: { ...uniforms, uMap: { value: map }, uOpacity: { value: opacity } },
    vertexShader: `
      attribute float aSize;
      attribute vec3 aColor;
      attribute float aTwinkle;
      uniform float uTime;
      uniform float uScale;
      varying vec3 vColor;
      varying float vTw;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        vTw = 1.0 + aTwinkle * 0.45 * sin(uTime * 2.3 + position.x * 12.7 + position.z * 7.3);
        gl_PointSize = max(1.0, aSize * uScale * vTw / -mv.z);
        vColor = aColor;
      }`,
    fragmentShader: `
      uniform sampler2D uMap;
      uniform float uOpacity;
      varying vec3 vColor;
      varying float vTw;
      void main() {
        vec4 t = texture2D(uMap, gl_PointCoord);
        gl_FragColor = vec4(vColor * t.rgb, t.a * uOpacity);
      }`,
    blending,
    transparent: true,
    depthWrite: false,
  });
}

function points(list, material) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(list.pos, 3));
  g.setAttribute('aColor', new THREE.Float32BufferAttribute(list.color, 3));
  g.setAttribute('aSize', new THREE.Float32BufferAttribute(list.size, 1));
  g.setAttribute('aTwinkle', new THREE.Float32BufferAttribute(list.twinkle, 1));
  const p = new THREE.Points(g, material);
  p.frustumCulled = false;
  return p;
}
const newList = () => ({ pos: [], color: [], size: [], twinkle: [] });
function push(list, x, y, z, color, size, twinkle = 0) {
  list.pos.push(x, y, z);
  list.color.push(color.r, color.g, color.b);
  list.size.push(size);
  list.twinkle.push(twinkle);
}

// Approximately normal random number from two hashes.
const gauss = (a, b) => Math.sqrt(-2 * Math.log(Math.max(1e-6, a))) * Math.cos(2 * Math.PI * b);

// Star sprite with four diffraction spikes.
let spikeTexture = null;
function spikeTex() {
  if (spikeTexture) return spikeTexture;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.08, 'rgba(255,255,255,0.9)');
  grad.addColorStop(0.25, 'rgba(255,255,255,0.25)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  for (const [w, h] of [[128, 3], [3, 128]]) {
    const lg = w > h ? g.createLinearGradient(0, 0, 128, 0) : g.createLinearGradient(0, 0, 0, 128);
    lg.addColorStop(0, 'rgba(255,255,255,0)');
    lg.addColorStop(0.5, 'rgba(255,255,255,0.8)');
    lg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = lg;
    g.fillRect(64 - w / 2, 64 - h / 2, w, h);
  }
  spikeTexture = new THREE.CanvasTexture(c);
  return spikeTexture;
}

// ---------- procedural planet textures ----------
function noise2(seed) {
  const v = (ix, iy) => hash(seed * 1013 + ix * 57 + iy * 131);
  const smooth = (t) => t * t * (3 - 2 * t);
  const n = (x, y) => {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const fx = smooth(x - ix);
    const fy = smooth(y - iy);
    const a = v(ix, iy) + (v(ix + 1, iy) - v(ix, iy)) * fx;
    const b = v(ix, iy + 1) + (v(ix + 1, iy + 1) - v(ix, iy + 1)) * fx;
    return a + (b - a) * fy;
  };
  return (x, y, oct = 4) => {
    let s = 0;
    let amp = 0.5;
    let f = 1;
    for (let o = 0; o < oct; o++) {
      s += amp * n(x * f, y * f);
      amp *= 0.5;
      f *= 2;
    }
    return s;
  };
}

const PLANET_TYPES = [
  { kind: 'gas', colors: ['#c99b6d', '#e8d2ad', '#a8683f', '#f2e4c8'], atmo: '#ffd9a8' }, // Jupiter-like
  { kind: 'earth', colors: ['#1f4f8f', '#3d8a4a', '#c9b27c', '#ffffff'], atmo: '#7fb8ff' },
  { kind: 'gas', colors: ['#4a7fc9', '#8fb8ef', '#2d5aa0', '#c7dcf7'], atmo: '#8fc4ff' }, // Neptune-like
  { kind: 'rock', colors: ['#a4502f', '#d27b4f', '#6e3420', '#e3a27a'], atmo: '#ffb08a' }, // Mars-like
  { kind: 'gas', colors: ['#d9c38a', '#f3e6bd', '#b49a5c', '#fff4d6'], atmo: '#fff0c0' }, // Saturn-like
  { kind: 'ice', colors: ['#bfe6f0', '#e9f8fc', '#8cc7d9', '#ffffff'], atmo: '#c9f4ff' },
  { kind: 'rock', colors: ['#8d8a86', '#b5b1aa', '#5e5b58', '#d6d2cb'], atmo: '#d6d2cb' }, // Moon-like
  { kind: 'gas', colors: ['#b986c9', '#e3c4ef', '#8a5aa0', '#f4e4fa'], atmo: '#e3b8ff' }, // purple giant
];

function planetTexture(type, seed) {
  const W = 256;
  const H = 128;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  const img = g.createImageData(W, H);
  const n = noise2(seed);
  const col = type.colors.map((h) => new THREE.Color(h));
  const out = new THREE.Color();
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const u = x / W;
      const v = y / H;
      if (type.kind === 'gas') {
        const turb = n(u * 8, v * 4, 3) * 0.6;
        const band = 0.5 + 0.5 * Math.sin(v * 26 + turb * 7 + n(u * 2, v * 30, 2) * 2.5);
        const fine = 0.5 + 0.5 * Math.sin(v * 70 + turb * 4);
        out.copy(col[0]).lerp(col[1], band ** 1.6).lerp(col[2], Math.max(0, 0.45 - band) * 1.4).lerp(col[3], fine * 0.18);
        // a storm or two
        const sx = u - 0.3 - (seed % 5) * 0.1;
        const sy = (v - 0.6) * 2.2;
        if (sx * sx + sy * sy < 0.004) out.lerp(col[2], 0.7);
      } else if (type.kind === 'earth') {
        const h = n(u * 6, v * 4, 5);
        const cloud = n(u * 9 + 7, v * 6, 4);
        if (h > 0.53) out.copy(col[1]).lerp(col[2], Math.min(1, (h - 0.53) * 5));
        else out.copy(col[0]).multiplyScalar(0.7 + h * 0.6);
        if (v < 0.07 || v > 0.93) out.copy(col[3]);
        if (cloud > 0.58) out.lerp(col[3], Math.min(0.85, (cloud - 0.58) * 4));
      } else if (type.kind === 'ice') {
        const h = n(u * 10, v * 5, 5);
        out.copy(col[0]).lerp(col[1], h).lerp(col[2], Math.max(0, Math.sin(u * 40 + h * 10)) * 0.25);
      } else {
        const h = n(u * 7, v * 4, 5);
        out.copy(col[2]).lerp(col[0], h).lerp(col[3], Math.max(0, h - 0.6) * 2);
      }
      const k = (y * W + x) * 4;
      img.data[k] = out.r * 255;
      img.data[k + 1] = out.g * 255;
      img.data[k + 2] = out.b * 255;
      img.data[k + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  if (type.kind === 'rock') {
    // craters
    for (let k = 0; k < 40; k++) {
      const r = 2 + hash(seed + k * 3) * 7;
      const x = hash(seed + k * 3 + 1) * W;
      const y = 10 + hash(seed + k * 3 + 2) * (H - 20);
      g.fillStyle = 'rgba(0,0,0,0.18)';
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = 'rgba(255,255,255,0.08)';
      g.beginPath();
      g.arc(x - r * 0.25, y - r * 0.25, r * 0.7, 0, Math.PI * 2);
      g.fill();
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function ringTexture(seed, color) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 4;
  const g = c.getContext('2d');
  const base = new THREE.Color(color);
  for (let x = 0; x < 256; x++) {
    const a = Math.max(0, Math.min(1, 0.25 + hash(seed + Math.floor(x / 3)) * 0.75)) * (x < 10 || x > 246 ? 0.3 : 1);
    const gap = Math.abs(x - 150) < 6 ? 0.05 : 1; // a Cassini-style gap
    g.fillStyle = `rgba(${base.r * 255},${base.g * 255},${base.b * 255},${a * gap})`;
    g.fillRect(x, 0, 1, 4);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function atmosphere(radius, color) {
  return new THREE.Mesh(
    new THREE.SphereGeometry(radius * 1.06, 32, 16),
    new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(color) } },
      vertexShader: `
        varying vec3 vN; varying vec3 vV;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vN = normalize(normalMatrix * normal);
          vV = normalize(-mv.xyz);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform vec3 uColor; varying vec3 vN; varying vec3 vV;
        void main() {
          float f = pow(1.0 - abs(dot(vN, vV)), 2.5);
          gl_FragColor = vec4(uColor, f * 0.55);
        }`,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
    }),
  );
}

export function createGalaxy(ctx) {
  const { board, renderer, theme, days } = ctx;
  let opts = ctx.opts;
  const max = maxCount(days);
  const group = new THREE.Group();
  board.add(group);
  const rnd = (k) => hash(k * 1.37 + 0.5);

  // ---------- where each day sits on the spiral ----------
  const radiusAt = (t) => R_MIN + t * (R_MAX - R_MIN);
  const spot = days.map((d, i) => {
    const t = i / days.length;
    const r = radiusAt(t);
    const arm = i % ARMS;
    const angle = (arm * Math.PI * 2) / ARMS + r * TWIST + (hash(i) - 0.5) * 0.25;
    return new THREE.Vector3(Math.cos(angle) * r, (hash(i + 500) - 0.5) * 0.8 * (1 - t * 0.5), Math.sin(angle) * r);
  });

  // ---------- the galaxy itself ----------
  const core = new THREE.Color('#ffdcae');
  const arm = new THREE.Color('#a9c2ff');
  const pink = new THREE.Color('#ff7fb0');
  const tmp = new THREE.Color();

  const disc = newList();
  for (let k = 0; k < 70000; k++) {
    const r = Math.min(R_MAX + 6, -Math.log(1 - rnd(k) * 0.995) * 9 + 0.5);
    const a = (Math.floor(rnd(k + 1e5) * ARMS) * Math.PI * 2) / ARMS + r * TWIST;
    const spread = 0.25 + r * 0.035;
    const off = gauss(rnd(k + 2e5), rnd(k + 3e5)) * spread;
    const x = Math.cos(a + off) * r + gauss(rnd(k + 4e5), rnd(k + 5e5)) * 0.4;
    const z = Math.sin(a + off) * r + gauss(rnd(k + 6e5), rnd(k + 7e5)) * 0.4;
    const y = gauss(rnd(k + 8e5), rnd(k + 9e5)) * (0.5 + 1.2 * Math.exp(-r / 4));
    tmp.copy(core).lerp(arm, Math.min(1, r / 18));
    if (rnd(k + 11e5) < 0.04) tmp.lerp(pink, 0.6);
    push(disc, x, y, z, tmp.clone().multiplyScalar((0.18 + rnd(k + 12e5) * 0.3) * Math.min(1, 0.35 + r / 10)), 0.1 + rnd(k + 13e5) * 0.16, rnd(k + 14e5) < 0.1 ? 1 : 0);
  }
  // bulge: a dense warm ball at the center
  for (let k = 0; k < 9000; k++) {
    const r = Math.abs(gauss(rnd(k + 2e6), rnd(k + 2.1e6))) * 2.6;
    const th = rnd(k + 2.2e6) * Math.PI * 2;
    const ph = Math.acos(2 * rnd(k + 2.3e6) - 1);
    push(disc, r * Math.sin(ph) * Math.cos(th), r * Math.cos(ph) * 0.6, r * Math.sin(ph) * Math.sin(th), core.clone().multiplyScalar(0.12 + rnd(k + 2.4e6) * 0.18), 0.12 + rnd(k + 2.5e6) * 0.16);
  }
  group.add(points(disc, particleMaterial({ map: glowTex(), opacity: 0.8 })));

  // dust lanes along the inner edge of each arm (darken what's behind)
  const dust = newList();
  const brown = new THREE.Color('#1a0f0a');
  for (let k = 0; k < 9000; k++) {
    const r = 3 + rnd(k + 3e6) * (R_MAX - 6);
    const a = (Math.floor(rnd(k + 3.1e6) * ARMS) * Math.PI * 2) / ARMS + r * TWIST - 0.22;
    const off = gauss(rnd(k + 3.2e6), rnd(k + 3.3e6)) * 0.08;
    push(dust, Math.cos(a + off) * r, gauss(rnd(k + 3.4e6), rnd(k + 3.5e6)) * 0.15, Math.sin(a + off) * r, brown, 0.6 + rnd(k + 3.6e6) * 0.8);
  }
  const dustPoints = points(dust, particleMaterial({ map: glowTex(), blending: THREE.NormalBlending, opacity: 0.35 }));
  dustPoints.renderOrder = 2;
  group.add(dustPoints);

  // nebulae: soft colored clouds along the arms
  const neb = newList();
  const nebColors = ['#ff5f9e', '#ff8fb8', '#6fa8ff', '#b07cff'].map((c) => new THREE.Color(c));
  // (kept soft and flat so they read as gas, not orbs)
  for (let k = 0; k < 90; k++) {
    const r = 6 + rnd(k + 4e6) * (R_MAX - 8);
    const a = (Math.floor(rnd(k + 4.1e6) * ARMS) * Math.PI * 2) / ARMS + r * TWIST + (rnd(k + 4.2e6) - 0.5) * 0.3;
    const c = nebColors[Math.floor(rnd(k + 4.3e6) * nebColors.length)].clone().multiplyScalar(0.25);
    push(neb, Math.cos(a) * r, (rnd(k + 4.4e6) - 0.5) * 0.4, Math.sin(a) * r, c.multiplyScalar(0.7), 2 + rnd(k + 4.5e6) * 3);
  }
  group.add(points(neb, particleMaterial({ map: glowTex(), opacity: 0.8 })));

  // core glow
  const glow = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: glowTex(), color: new THREE.Color('#ffd7a0').multiplyScalar(0.55), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
  );
  glow.scale.set(9, 9, 1);
  group.add(glow);

  // the sky around it: colored stars that twinkle
  const sky = newList();
  const skyColors = ['#ffffff', '#cfe0ff', '#ffe9c4', '#ffc9a8', '#a9c2ff'].map((c) => new THREE.Color(c));
  for (let k = 0; k < 6000; k++) {
    const a = rnd(k + 5e6) * Math.PI * 2;
    const e = Math.asin(rnd(k + 5.1e6) * 2 - 1);
    const r = 150 + rnd(k + 5.2e6) * 40;
    push(sky, Math.cos(a) * Math.cos(e) * r, Math.sin(e) * r, Math.sin(a) * Math.cos(e) * r, skyColors[k % 5].clone().multiplyScalar(0.3 + rnd(k + 5.3e6) * 0.5), 0.35 + rnd(k + 5.4e6) * 0.5, 1);
  }
  board.add(points(sky, particleMaterial({ map: glowTex() })));

  // ---------- planets: the biggest days ----------
  const coreLight = new THREE.PointLight('#ffe2b8', 3, 0, 0);
  group.add(coreLight);
  const planetDays = [...days.keys()]
    .filter((i) => days[i].count > 0)
    .sort((a, b) => days[b].count - days[a].count)
    .slice(0, PLANET_COUNT);
  const planetSet = new Set(planetDays);
  const planets = planetDays.map((i, k) => {
    const type = PLANET_TYPES[k % PLANET_TYPES.length];
    const size = (0.5 + Math.sqrt(days[i].count / max) * 0.8) * (opts.height / 8) ** 0.5;
    const surface = planetTexture(type, i + 1);
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(size, 48, 24),
      // a faint glow of its own surface, so the night side still shows its colors
      new THREE.MeshStandardMaterial({ map: surface, emissiveMap: surface, emissive: '#ffffff', emissiveIntensity: 0.22, roughness: 0.85 }),
    );
    mesh.userData.day = i;
    mesh.rotation.z = (hash(i + 7) - 0.5) * 0.6; // axial tilt
    mesh.position.copy(spot[i]).setY(spot[i].y + 0.6);
    mesh.add(atmosphere(size, type.atmo));
    if (k < 3) {
      const inner = size * 1.4;
      const outer = size * 2.3;
      const geo = new THREE.RingGeometry(inner, outer, 96, 1);
      const pos = geo.attributes.position;
      const uv = geo.attributes.uv;
      for (let v = 0; v < pos.count; v++) {
        const r = Math.hypot(pos.getX(v), pos.getY(v));
        uv.setXY(v, (r - inner) / (outer - inner), 0.5);
      }
      const ring = new THREE.Mesh(
        geo,
        new THREE.MeshStandardMaterial({ map: ringTexture(i, type.colors[1]), side: THREE.DoubleSide, transparent: true, depthWrite: false, roughness: 1 }),
      );
      ring.rotation.x = -Math.PI / 2;
      mesh.add(ring);
    }
    group.add(mesh);
    return mesh;
  });

  // ---------- day stars ----------
  const starColors = STAR_COLORS.map((c) => new THREE.Color(c));
  const dayList = newList();
  function sizeOf(i) {
    const d = days[i];
    if (planetSet.has(i)) return 0;
    return d.count ? (0.55 + Math.sqrt(d.count / max) * 1.7) * (opts.height / 8) ** 0.5 : 0.28;
  }
  days.forEach((d, i) => push(dayList, spot[i].x, spot[i].y, spot[i].z, starColors[d.level].clone().multiplyScalar(d.count ? 1.5 : 0.5), 0, d.count ? 0.4 : 0));
  const dayStars = points(dayList, particleMaterial({ map: spikeTex() }));
  dayStars.renderOrder = 3;
  group.add(dayStars);
  const sizeAttr = dayStars.geometry.attributes.aSize;
  const finalSize = days.map((_, i) => sizeOf(i));

  // ---------- star chart: a faint ring per month ----------
  if (opts.labels) {
    const ringMat = new THREE.LineBasicMaterial({ color: theme.label, transparent: true, opacity: 0.16 });
    let last = -1;
    days.forEach((d, i) => {
      const m = Number(d.date.slice(5, 7)) - 1;
      if (m === last) return;
      last = m;
      const r = radiusAt(i / days.length);
      const pts = [];
      for (let k = 0; k <= 128; k++) pts.push(new THREE.Vector3(Math.cos((k / 128) * Math.PI * 2) * r, 0, Math.sin((k / 128) * Math.PI * 2) * r));
      group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), ringMat));
      const s = textSprite(MONTHS[m], { size: 1.1, color: theme.label });
      const dir = spot[i].clone().setY(0).normalize();
      s.position.copy(dir.multiplyScalar(r + 1.2)).setY(0.8);
      group.add(s);
    });
  }

  const start = performance.now();
  let lastFrame = start;
  let hovered = -1;
  let settled = false;

  function writeSizes(now) {
    let done = true;
    for (let i = 0; i < days.length; i++) {
      const g = Math.min(1, Math.max(0, (now - start - i * 5) / 600));
      if (g < 1) done = false;
      sizeAttr.array[i] = finalSize[i] * (1 - (1 - g) ** 3) * (i === hovered ? 1.8 : 1);
    }
    sizeAttr.needsUpdate = true;
    return done;
  }

  return {
    resize(w, h) {
      uniforms.uScale.value = (h * renderer.getPixelRatio()) / (2 * Math.tan(THREE.MathUtils.degToRad(20)));
    },
    update(now) {
      uniforms.uTime.value = now / 1000;
      // the galaxy turns slowly on its own, but holds still when auto-rotate is off
      if (ctx.opts.autoRotate) group.rotation.y -= Math.min(100, Math.max(0, now - lastFrame)) * 0.00002;
      lastFrame = now;
      planets.forEach((p, k) => (p.rotation.y = now * 0.0002 * (1 + k * 0.1)));
      if (!settled) {
        settled = writeSizes(now);
        planets.forEach((p) => p.scale.setScalar(Math.max(0.0001, Math.min(1, (now - start - p.userData.day * 5) / 900))));
      }
    },
    pick(ray) {
      const planetHit = ray.intersectObjects(planets, false)[0];
      if (planetHit) return planetHit.object.userData.day;
      // nearest day star within ~15px of the pointer (tolerance grows with distance)
      let best = -1;
      let bestD = 1;
      const v = new THREE.Vector3();
      for (let i = 0; i < days.length; i++) {
        if (planetSet.has(i) || !finalSize[i]) continue;
        v.copy(spot[i]).applyMatrix4(group.matrixWorld);
        const reach = ray.ray.origin.distanceTo(v) * 0.012 + finalSize[i] * 0.15;
        const d = ray.ray.distanceToPoint(v) / reach;
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
      return best;
    },
    setHover(i) {
      if (i === hovered) return;
      hovered = i;
      planets.forEach((p) => (p.material.emissiveIntensity = p.userData.day === i ? 0.6 : 0.22));
      writeSizes(performance.now() + 1e6);
    },
    anchor: (i) => spot[i].clone().applyMatrix4(group.matrixWorld),
    setShadows() {},
    setOptions(next) {
      opts = next;
      for (let i = 0; i < days.length; i++) finalSize[i] = sizeOf(i);
      writeSizes(performance.now() + 1e6);
    },
  };
}
