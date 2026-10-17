// Night City: a city block for every day, after dark.
//   building height = that day's contributions (Height slider scales it)
//   building kind   = level: low-rise apartments → office blocks → glass towers with spires
//   window light    = level color (warm for quiet days, icy blue for the busiest)
//   no contributions → a small park.
// Streets run between the blocks, with street lamps and moving car lights.
//
// Buildings are merged into a few meshes with UVs in world units, so window grids keep
// their size at any height instead of stretching. A shader grows them on load.
import * as THREE from 'three';
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { hash, gridLayout, maxCount, addGridLabels, plinthMesh, glowTex } from './common.js';

const SPACING = 1.3; // block pitch; the gap between tiles is the street
const TILE = 0.86; // sidewalk tile, as a fraction of the spacing
const FOOT = 0.78; // building footprint, as a fraction of the spacing
const TEX_W = 1; // facade texture covers 1 unit across (4 windows)…
const TEX_H = 2; // …and 2 units up (8 floors)

// window light color per level (index 0 unused)
const LIGHT = ['#000000', '#ffc56b', '#ffe2a6', '#d6ecff', '#8fdcff'].map((c) => new THREE.Color(c).multiplyScalar(1.25));

// ---------- procedural facade textures ----------
function facade(kind) {
  const W = 256;
  const H = 512;
  const cols = kind === 'glass' ? 8 : 4;
  const rows = kind === 'glass' ? 16 : 8;
  const make = () => {
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    return c;
  };
  const color = make();
  const glow = make();
  const g = color.getContext('2d');
  const e = glow.getContext('2d');
  g.fillStyle = { brick: '#3d3142', office: '#2c3548', glass: '#1d3150' }[kind];
  g.fillRect(0, 0, W, H);
  e.fillStyle = '#000';
  e.fillRect(0, 0, W, H);
  // a little grime so walls aren't flat
  for (let k = 0; k < 900; k++) {
    g.fillStyle = `rgba(255,255,255,${hash(k + 7) * 0.025})`;
    g.fillRect(hash(k) * W, hash(k + 1) * H, 2, 2);
  }
  const cw = W / cols;
  const rh = H / rows;
  const [pw, ph] = kind === 'glass' ? [0.86, 0.7] : kind === 'office' ? [0.62, 0.55] : [0.5, 0.5];
  for (let r = 0; r < rows; r++) {
    const floorLit = hash(r * 31 + (kind === 'glass' ? 3 : 1)) < (kind === 'glass' ? 0.55 : 0.75);
    for (let col = 0; col < cols; col++) {
      const seed = r * 97 + col * 13 + kind.length;
      const x = col * cw + (cw * (1 - pw)) / 2;
      const y = r * rh + (rh * (1 - ph)) / 2;
      // unlit glass with a faint sky reflection
      g.fillStyle = kind === 'glass' ? '#1d3352' : '#151b28';
      g.fillRect(x, y, cw * pw, rh * ph);
      g.fillStyle = 'rgba(140,170,255,0.08)';
      g.fillRect(x, y, cw * pw, rh * ph * 0.35);
      const lit = floorLit && hash(seed) < (kind === 'glass' ? 0.85 : 0.6);
      if (lit) {
        const b = 0.55 + hash(seed + 1) * 0.45;
        e.fillStyle = `rgb(${255 * b},${255 * b},${255 * b})`;
        e.fillRect(x, y, cw * pw, rh * ph);
        g.fillStyle = 'rgba(255,230,180,0.25)';
        g.fillRect(x, y, cw * pw, rh * ph);
      }
    }
  }
  const tex = (c, srgb) => {
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  };
  return { map: tex(color, true), emissiveMap: tex(glow, true) };
}

let facadeCache = null;
const facades = () => (facadeCache ||= { brick: facade('brick'), office: facade('office'), glass: facade('glass') });

// ---------- geometry builder ----------
function buffer() {
  return { pos: [], nor: [], uv: [], start: [], light: [], color: [], idx: [] };
}

// Quad a-b-c-d counter-clockwise seen from outside.
function quad(b, a, bb, c, d, n, uvs, start, light, color) {
  const base = b.pos.length / 3;
  for (const [k, p] of [a, bb, c, d].entries()) {
    b.pos.push(...p);
    b.nor.push(...n);
    b.uv.push(...uvs[k]);
    b.start.push(start);
    b.light.push(light.r, light.g, light.b);
    b.color.push(color.r, color.g, color.b);
  }
  b.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
}

// Box with textured sides into `sides` and a plain top into `tops`.
function box(sides, tops, [x0, x1, y0, y1, z0, z1], { uo = 0, vo = 0, start, light, color, roof }) {
  const v = (y) => vo + y / TEX_H;
  const dx = x1 - x0;
  const dz = z1 - z0;
  const faces = [
    [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], dx],
    [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1], dx],
    [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0], dz],
    [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], dz],
  ];
  faces.forEach(([a, bb, c, d, n, w], f) => {
    const uf = uo + f * 0.5; // different windows on each face
    quad(sides, a, bb, c, d, n, [[uf, v(y0)], [uf + w / TEX_W, v(y0)], [uf + w / TEX_W, v(y1)], [uf, v(y1)]], start, light, color);
  });
  quad(tops, [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0], [[0, 0], [1, 0], [1, 1], [0, 1]], start, light, roof);
}

function toGeometry(b) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(b.nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
  g.setAttribute('aStart', new THREE.Float32BufferAttribute(b.start, 1));
  g.setAttribute('aLight', new THREE.Float32BufferAttribute(b.light, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(b.color, 3));
  g.setIndex(b.idx);
  g.computeBoundingSphere();
  return g;
}

// Grow-in (scale y from 0 by aStart) and per-vertex window light color.
const grow = { value: 0 };
function cityMaterial(params) {
  const mat = new THREE.MeshStandardMaterial(params);
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uGrow = grow;
    shader.vertexShader =
      'attribute float aStart;\nattribute vec3 aLight;\nuniform float uGrow;\nvarying vec3 vLight;\n' +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        float g = clamp((uGrow - aStart) / 0.9, 0.0, 1.0);
        g = 1.0 - pow(1.0 - g, 3.0);
        transformed.y *= max(g, 0.0001);
        vLight = aLight;`,
      );
    shader.fragmentShader = 'varying vec3 vLight;\n' + shader.fragmentShader.replace(
      '#include <emissivemap_fragment>',
      '#include <emissivemap_fragment>\ntotalEmissiveRadiance *= vLight;',
    );
  };
  return mat;
}

export function createNightCity(ctx) {
  const { board, renderer, theme, days } = ctx;
  let opts = ctx.opts;
  const layout = gridLayout(days, SPACING);
  const { cells } = layout;
  const tex = facades();

  // asphalt island
  const plinth = plinthMesh(layout, new THREE.MeshStandardMaterial({ color: '#0b0f1a', roughness: 0.9 }));
  plinth.visible = opts.base;
  board.add(plinth);
  addGridLabels(board, renderer, layout, opts, theme, { bar: 1, titleColor: theme.label });

  // sidewalk tiles; parks on empty days
  const tiles = new THREE.InstancedMesh(
    new THREE.BoxGeometry(SPACING * TILE, 0.05, SPACING * TILE).translate(0, 0.025, 0),
    new THREE.MeshStandardMaterial({ roughness: 0.95 }),
    cells.length,
  );
  const m4 = new THREE.Matrix4();
  cells.forEach((c, k) => {
    tiles.setMatrixAt(k, m4.makeTranslation(c.x, 0, c.z));
    tiles.setColorAt(k, new THREE.Color(c.day.count ? '#1e2433' : '#14301e'));
  });
  board.add(tiles);

  // stars
  const stars = new THREE.BufferGeometry();
  const starPos = [];
  for (let k = 0; k < 3000; k++) {
    const a = hash(k) * Math.PI * 2;
    const e = Math.asin(hash(k + 9000) * 2 - 1); // the whole sky, below the city too
    starPos.push(Math.cos(a) * Math.cos(e) * 160, Math.sin(e) * 160, Math.sin(a) * Math.cos(e) * 160);
  }
  stars.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));
  board.add(new THREE.Points(stars, new THREE.PointsMaterial({ size: 1.1, map: glowTex(), color: '#cfd8ff', transparent: true, depthWrite: false, fog: false })));

  // street lamps at block corners
  const lampPos = [];
  const sx0 = layout.x0 - SPACING / 2;
  const sz0 = layout.z0 - SPACING / 2;
  for (let col = 0; col <= layout.cols; col++) for (let row = 0; row <= 7; row++) lampPos.push(sx0 + col * SPACING, 0.28, sz0 + row * SPACING);
  const lamps = new THREE.BufferGeometry();
  lamps.setAttribute('position', new THREE.Float32BufferAttribute(lampPos, 3));
  board.add(
    new THREE.Points(
      lamps,
      new THREE.PointsMaterial({ size: 0.2, map: glowTex(), color: new THREE.Color('#ffae5c').multiplyScalar(1.1), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }),
    ),
  );

  // cars: headlights one way, tail lights the other, on every east-west street
  const cars = [];
  for (let row = 0; row <= 7; row++) {
    for (let k = 0; k < 7; k++) {
      cars.push({ z: sz0 + row * SPACING - 0.07, dir: 1, offset: hash(row * 50 + k) * layout.width, speed: 2.2 + hash(row * 50 + k + 9) * 1.6 });
      cars.push({ z: sz0 + row * SPACING + 0.07, dir: -1, offset: hash(row * 70 + k) * layout.width, speed: 2.2 + hash(row * 70 + k + 9) * 1.6 });
    }
  }
  const carGeo = new THREE.BufferGeometry();
  const carPos = new Float32Array(cars.length * 3);
  const carCol = new Float32Array(cars.length * 3);
  const head = new THREE.Color('#fff4dc').multiplyScalar(2);
  const tail = new THREE.Color('#ff2a1a').multiplyScalar(2);
  cars.forEach((c, k) => (c.dir > 0 ? head : tail).toArray(carCol, k * 3));
  carGeo.setAttribute('position', new THREE.BufferAttribute(carPos, 3));
  carGeo.setAttribute('color', new THREE.BufferAttribute(carCol, 3));
  board.add(
    new THREE.Points(
      carGeo,
      new THREE.PointsMaterial({ size: 0.32, map: glowTex(), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }),
    ),
  );

  // ---------- buildings ----------
  const mats = Object.fromEntries(
    Object.entries(tex).map(([kind, t]) => [
      kind,
      cityMaterial({ map: t.map, emissiveMap: t.emissiveMap, emissive: '#ffffff', roughness: kind === 'glass' ? 0.25 : 0.8, metalness: kind === 'glass' ? 0.6 : 0.1 }),
    ]),
  );
  const roofMat = cityMaterial({ vertexColors: true, roughness: 0.9 });
  let meshes = [];
  let proxy = null;
  let proxyDays = [];
  let beacons = null;
  const tops = new Float32Array(cells.length);
  const boxes = []; // [x0,x1,y0,y1,z0,z1] per day, for hover outline
  let growStart = performance.now();

  function build(animate) {
    for (const m of meshes) {
      board.remove(m);
      m.geometry.dispose();
    }
    if (proxy) board.remove(proxy);
    if (beacons) board.remove(beacons);
    meshes = [];

    const max = maxCount(days);
    const norm = opts.log ? (n) => Math.log1p(n) / Math.log1p(max) : (n) => n / max;
    const sides = { brick: buffer(), office: buffer(), glass: buffer() };
    const tops_ = buffer();
    const roofGray = new THREE.Color('#2b3142');
    const detail = new THREE.Color('#3a4154');
    const parkGreen = new THREE.Color('#1f4a2a');
    const black = new THREE.Color(0, 0, 0);
    const proxies = [];
    const spires = [];

    cells.forEach((c) => {
      const { count, level } = c.day;
      const h = (n) => hash(c.i * 17 + n);
      const start = c.col * 0.018;
      tops[c.i] = 0.06;
      if (count === 0) {
        // park: a few round trees
        for (let t = 0; t < 3; t++) {
          if (h(t) < 0.35) continue;
          const tx = c.x + (h(t + 3) - 0.5) * 0.6;
          const tz = c.z + (h(t + 6) - 0.5) * 0.6;
          const r = 0.09 + h(t + 9) * 0.06;
          box(tops_, tops_, [tx - r, tx + r, 0.05, 0.05 + r * 2.4, tz - r, tz + r], { start, light: black, color: parkGreen, roof: parkGreen });
        }
        return;
      }
      const s = norm(count);
      const H = 0.25 + s * opts.height;
      const kind = level >= 3 ? 'glass' : level === 2 ? 'office' : 'brick';
      const light = LIGHT[level];
      const half = (SPACING * FOOT) / 2;
      const uo = Math.floor(h(1) * 8) / 4; // shift to a different window pattern
      const vo = Math.floor(h(2) * 8) / 8;
      const opt = { uo, vo, start, light, color: new THREE.Color('#ffffff'), roof: roofGray };

      // tiers: towers step back as they rise
      const tiers = kind === 'glass' && H > 2.5 ? [[1, 0.45], [0.8, 0.8], [0.6, 1]] : kind === 'office' && H > 2 ? [[1, 0.65], [0.75, 1]] : [[1, 1]];
      let y = 0.05;
      for (const [w, until] of tiers) {
        const top = 0.05 + H * until;
        const r = half * w;
        box(sides[kind], tops_, [c.x - r, c.x + r, y, top, c.z - r, c.z + r], opt);
        y = top;
      }
      // rooftop details: AC units / water tank
      const rr = half * tiers[tiers.length - 1][0];
      for (let d = 0; d < 2; d++) {
        const a = 0.08 + h(10 + d) * 0.08;
        const ox = c.x + (h(12 + d) - 0.5) * (rr - a) * 1.6;
        const oz = c.z + (h(14 + d) - 0.5) * (rr - a) * 1.6;
        box(tops_, tops_, [ox - a, ox + a, y, y + 0.06 + h(16 + d) * 0.12, oz - a, oz + a], { start, light: black, color: detail, roof: detail });
      }
      tops[c.i] = y;
      if (kind === 'glass' && H > 3) {
        // spire with an aircraft warning light
        const sh = 0.4 + s * 0.8;
        box(tops_, tops_, [c.x - 0.025, c.x + 0.025, y, y + sh, c.z - 0.025, c.z + 0.025], { start, light: black, color: detail, roof: detail });
        spires.push(c.x, y + sh + 0.04, c.z);
        tops[c.i] = y + sh;
      }
      proxies.push({ i: c.i, x: c.x, z: c.z, w: half * 2, h: tops[c.i] });
      boxes[c.i] = [c.x - half, c.x + half, 0, y, c.z - half, c.z + half];
    });

    for (const [kind, b] of Object.entries(sides)) {
      if (!b.idx.length) continue;
      const mesh = new THREE.Mesh(toGeometry(b), mats[kind]);
      mesh.frustumCulled = false;
      meshes.push(mesh);
    }
    const roofs = new THREE.Mesh(toGeometry(tops_), roofMat);
    roofs.frustumCulled = false;
    meshes.push(roofs);
    meshes.forEach((m) => board.add(m));

    proxy = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), new THREE.MeshBasicMaterial({ visible: false }), Math.max(1, proxies.length));
    proxy.count = proxies.length;
    proxies.forEach((p, k) => proxy.setMatrixAt(k, m4.compose(new THREE.Vector3(p.x, 0, p.z), new THREE.Quaternion(), new THREE.Vector3(p.w, p.h, p.w))));
    proxyDays = proxies.map((p) => p.i);
    board.add(proxy);

    const bg = new THREE.BufferGeometry();
    bg.setAttribute('position', new THREE.Float32BufferAttribute(spires, 3));
    beacons = new THREE.Points(
      bg,
      new THREE.PointsMaterial({ size: 0.5, map: glowTex(), color: new THREE.Color(3, 0.25, 0.2), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }),
    );
    board.add(beacons);

    growStart = animate ? performance.now() : performance.now() - 10000;
  }
  build(true);

  // hover outline
  const outline = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1).translate(0.5, 0.5, 0.5)),
    new THREE.LineBasicMaterial({ color: new THREE.Color(theme.accent).multiplyScalar(1.5), toneMapped: false }),
  );
  outline.visible = false;
  board.add(outline);

  return {
    update(now) {
      const t = (now - growStart) / 1000;
      grow.value = t;
      beacons.material.opacity = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(now / 400));
      // drive the cars
      const secs = now / 1000;
      cars.forEach((c, k) => {
        const x = ((((c.offset + c.dir * c.speed * secs) % layout.width) + layout.width) % layout.width) - layout.width / 2;
        carPos[k * 3] = x;
        carPos[k * 3 + 1] = 0.08;
        carPos[k * 3 + 2] = c.z;
      });
      carGeo.attributes.position.needsUpdate = true;
    },
    pick(raycaster) {
      const hit = raycaster.intersectObject(proxy, false)[0];
      return hit ? proxyDays[hit.instanceId] : -1;
    },
    setHover(i) {
      const b = i >= 0 ? boxes[i] : null;
      outline.visible = Boolean(b);
      if (b) {
        outline.position.set(b[0] - 0.02, b[2], b[4] - 0.02);
        outline.scale.set(b[1] - b[0] + 0.04, b[3] - b[2] + 0.02, b[5] - b[4] + 0.04);
      }
    },
    anchor: (i) => new THREE.Vector3(cells[i].x, tops[i], cells[i].z),
    setShadows() {},
    replay() {
      growStart = performance.now();
    },
    setOptions(next) {
      opts = next;
      build(false); // new heights, no grow-in
    },
    exportSTL() {
      const parts = [opts.base ? plinth.geometry.clone() : null, ...meshes.map((m) => m.geometry.clone())].filter(Boolean);
      for (const p of parts) for (const name of Object.keys(p.attributes)) if (name !== 'position' && name !== 'normal') p.deleteAttribute(name);
      const mesh = new THREE.Mesh(mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p))));
      mesh.rotation.x = Math.PI / 2;
      mesh.updateMatrixWorld();
      const data = new STLExporter().parse(mesh, { binary: true });
      mesh.geometry.dispose();
      return new Blob([data], { type: 'model/stl' });
    },
  };
}

