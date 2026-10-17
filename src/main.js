import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { fetchContributions, sampleContributions, computeStats } from './data.js';

// GitHub dark-theme contribution colors, level 0..4
const LEVEL_COLORS = ['#161b22', '#0e4429', '#006d32', '#26a641', '#39d353'].map((c) => new THREE.Color(c));
const HOVER_COLOR = new THREE.Color('#ffffff');
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const CELL = 1; // grid spacing
const BAR = 0.82; // bar footprint
const MIN_H = 0.08; // height of an empty day
const BASE_H = 0.6; // plinth thickness

const $ = (id) => document.getElementById(id);

// ---------- renderer / scene ----------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
$('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#0d1117');
scene.fog = new THREE.Fog('#0d1117', 90, 180);

const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.1, 500);
const DEFAULT_CAM = new THREE.Vector3(-18, 32, 52);
camera.position.copy(DEFAULT_CAM);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.autoRotate = true;
controls.autoRotateSpeed = 0.8;
controls.minDistance = 10;
controls.maxDistance = 140;
controls.maxPolarAngle = Math.PI; // allow looking from underneath too — full 360°

scene.add(new THREE.HemisphereLight('#c9d1d9', '#0d1117', 1.1));
const sun = new THREE.DirectionalLight('#ffffff', 2.2);
sun.position.set(-20, 40, 25);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -40, right: 40, top: 20, bottom: -20, near: 1, far: 120 });
sun.shadow.bias = -0.0005;
scene.add(sun);
const rim = new THREE.DirectionalLight('#39d353', 0.6);
rim.position.set(25, 10, -30);
scene.add(rim);

// Everything that depends on the data lives in this group so it can be rebuilt.
const board = new THREE.Group();
scene.add(board);

// ---------- state ----------
let days = [];
let cells = []; // { day, col, row }
let bars = null; // InstancedMesh
let current = new Float32Array(0); // animated heights
let target = new Float32Array(0);
let animStart = 0;
let hovered = -1;
let label = { user: '', year: 0 };

// ---------- text helper ----------
function textPlane(text, { size = 1, color = '#8b949e', weight = 500, align = 'center' } = {}) {
  const px = 96;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const font = `${weight} ${px}px -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif`;
  ctx.font = font;
  canvas.width = Math.ceil(ctx.measureText(text).width) + 16;
  canvas.height = px * 1.3;
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textBaseline = 'middle';
  ctx.textAlign = align === 'left' ? 'left' : align === 'right' ? 'right' : 'center';
  const x = align === 'left' ? 8 : align === 'right' ? canvas.width - 8 : canvas.width / 2;
  ctx.fillText(text, x, canvas.height / 2);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  const h = size;
  const w = (canvas.width / canvas.height) * h;
  const geo = new THREE.PlaneGeometry(w, h);
  // shift so the plane's origin matches the text alignment
  if (align === 'left') geo.translate(w / 2, 0, 0);
  if (align === 'right') geo.translate(-w / 2, 0, 0);
  return new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
}

// ---------- build board ----------
function layout(days) {
  // GitHub layout: columns are weeks (Sunday-start), rows are weekdays (Sun = 0 at the top).
  const first = new Date(days[0].date + 'T00:00:00Z');
  const offset = first.getUTCDay();
  return days.map((day, i) => ({ day, col: Math.floor((i + offset) / 7), row: (i + offset) % 7 }));
}

function disposeBoard() {
  board.traverse((o) => {
    o.geometry?.dispose();
    if (o.material) {
      o.material.map?.dispose();
      o.material.dispose();
    }
  });
  board.clear();
  bars = null;
  hovered = -1;
}

function buildBoard(data, user, year) {
  disposeBoard();
  days = data;
  cells = layout(days);
  label = { user, year };

  const cols = cells[cells.length - 1].col + 1;
  const width = cols * CELL;
  const depth = 7 * CELL;
  // grid origin so the board is centered at (0,0,0)
  const x0 = -width / 2 + CELL / 2;
  const z0 = -depth / 2 + CELL / 2;
  for (const c of cells) {
    c.x = x0 + c.col * CELL;
    c.z = z0 + c.row * CELL;
  }

  // plinth
  const padX = 2.2;
  const padFront = 3.2; // room for the name on top of the plinth
  const padBack = 2.2;
  const plinthGeo = new THREE.BoxGeometry(width + padX * 2, BASE_H, depth + padFront + padBack);
  plinthGeo.translate(0, -BASE_H / 2, (padFront - padBack) / 2);
  const plinth = new THREE.Mesh(
    plinthGeo,
    new THREE.MeshStandardMaterial({ color: '#161b22', roughness: 0.6, metalness: 0.2 }),
  );
  plinth.receiveShadow = true;
  plinth.castShadow = true;
  plinth.name = 'plinth';
  board.add(plinth);

  // bars
  const geo = new THREE.BoxGeometry(BAR, 1, BAR);
  geo.translate(0, 0.5, 0); // base at y = 0 so scaling grows upward
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.45, metalness: 0.1 });
  bars = new THREE.InstancedMesh(geo, mat, cells.length);
  bars.castShadow = true;
  bars.receiveShadow = true;
  bars.frustumCulled = false;
  cells.forEach((c, i) => bars.setColorAt(i, LEVEL_COLORS[c.day.level]));
  board.add(bars);

  current = new Float32Array(cells.length); // start flat → grow-in animation
  target = new Float32Array(cells.length);
  computeTargets();
  animStart = performance.now();

  // month labels along the back edge (like the top row on GitHub)
  let lastMonth = -1;
  for (const c of cells) {
    const m = Number(c.day.date.slice(5, 7)) - 1;
    if (m !== lastMonth && c.row === 0) {
      lastMonth = m;
      const t = textPlane(MONTHS[m], { size: 0.9, align: 'left' });
      t.rotation.x = -Math.PI / 2;
      t.position.set(c.x - BAR / 2, 0.01, z0 - CELL * 1.2);
      board.add(t);
    }
  }

  // weekday labels on the left
  [['Mon', 1], ['Wed', 3], ['Fri', 5]].forEach(([name, row]) => {
    const t = textPlane(name, { size: 0.7, align: 'right' });
    t.rotation.x = -Math.PI / 2;
    t.position.set(x0 - CELL * 0.8, 0.01, z0 + row * CELL);
    board.add(t);
  });

  // name + year on the front of the plinth top
  const title = textPlane(`${user || 'sample'}  ·  ${year}`, { size: 1.4, color: '#e6edf3', weight: 600, align: 'left' });
  title.rotation.x = -Math.PI / 2;
  title.position.set(x0 - BAR / 2, 0.01, z0 + 7 * CELL + 1.0);
  board.add(title);

  // ground shadow catcher
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.ShadowMaterial({ opacity: 0.35 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -BASE_H - 0.01;
  ground.receiveShadow = true;
  board.add(ground);

  updateStats();
}

function computeTargets() {
  if (!cells.length) return;
  const maxH = Number($('heightScale').value);
  const log = $('logscale').checked;
  const max = Math.max(1, ...cells.map((c) => c.day.count));
  const norm = log ? (n) => Math.log1p(n) / Math.log1p(max) : (n) => n / max;
  cells.forEach((c, i) => {
    target[i] = c.day.count > 0 ? 0.2 + norm(c.day.count) * maxH : MIN_H;
  });
}

const tmpMatrix = new THREE.Matrix4();
const tmpPos = new THREE.Vector3();
const tmpQuat = new THREE.Quaternion();
const tmpScale = new THREE.Vector3();

function animateBars(now) {
  if (!bars) return;
  let changed = false;
  const elapsed = now - animStart;
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i];
    if (elapsed < c.col * 18) continue; // left-to-right wave on load
    const diff = target[i] - current[i];
    if (Math.abs(diff) < 0.001) {
      if (current[i] === target[i]) continue;
      current[i] = target[i];
    } else {
      current[i] += diff * 0.12;
    }
    tmpPos.set(c.x, 0, c.z);
    tmpScale.set(1, Math.max(current[i], 0.0001), 1);
    tmpMatrix.compose(tmpPos, tmpQuat, tmpScale);
    bars.setMatrixAt(i, tmpMatrix);
    changed = true;
  }
  if (changed) {
    bars.instanceMatrix.needsUpdate = true;
    bars.boundingSphere = null; // recompute for raycasting
    bars.boundingBox = null;
  }
}

// ---------- stats panel ----------
function updateStats() {
  const { total, best, longest } = computeStats(days);
  $('stats').hidden = false;
  $('total').textContent = total.toLocaleString();
  $('totalLabel').textContent = `contributions in ${label.year}${label.user ? '' : ' (sample)'}`;
  $('best').textContent = best.count ? `${best.count} · ${fmtDate(best.date, { month: 'short', day: 'numeric' })}` : '–';
  $('streak').textContent = `${longest} day${longest === 1 ? '' : 's'}`;
}

function fmtDate(iso, opts = { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) {
  return new Date(iso + 'T00:00:00Z').toLocaleDateString(undefined, { ...opts, timeZone: 'UTC' });
}

// ---------- hover tooltip ----------
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let pointerInside = false;
let lastClient = { x: 0, y: 0 };

renderer.domElement.addEventListener('pointermove', (e) => {
  pointer.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  lastClient = { x: e.clientX, y: e.clientY };
  pointerInside = true;
});
renderer.domElement.addEventListener('pointerleave', () => {
  pointerInside = false;
});

function setHovered(i) {
  if (i === hovered) return;
  if (hovered >= 0) bars.setColorAt(hovered, LEVEL_COLORS[cells[hovered].day.level]);
  hovered = i;
  if (i >= 0) bars.setColorAt(i, HOVER_COLOR);
  bars.instanceColor.needsUpdate = true;
}

function updateHover() {
  const tip = $('tooltip');
  if (!bars || !pointerInside) {
    if (bars) setHovered(-1);
    tip.hidden = true;
    return;
  }
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObject(bars, false)[0];
  if (!hit) {
    setHovered(-1);
    tip.hidden = true;
    return;
  }
  setHovered(hit.instanceId);
  const { day } = cells[hit.instanceId];
  const n = day.count;
  tip.textContent = `${n === 0 ? 'No' : n} contribution${n === 1 ? '' : 's'} on ${fmtDate(day.date)}`;
  tip.style.left = `${lastClient.x}px`;
  tip.style.top = `${lastClient.y}px`;
  tip.hidden = false;
}

// ---------- STL export ----------
function exportSTL() {
  if (!bars) return;
  const parts = [];
  const plinth = board.getObjectByName('plinth');
  parts.push(plinth.geometry.clone());
  const box = new THREE.BoxGeometry(BAR, 1, BAR);
  box.translate(0, 0.5, 0);
  cells.forEach((c, i) => {
    const g = box.clone();
    g.scale(1, target[i], 1);
    g.translate(c.x, 0, c.z);
    parts.push(g);
  });
  const merged = mergeGeometries(parts);
  const mesh = new THREE.Mesh(merged);
  // Most slicers treat Z as up
  mesh.rotation.x = Math.PI / 2;
  mesh.updateMatrixWorld();
  const data = new STLExporter().parse(mesh, { binary: true });
  const blob = new Blob([data], { type: 'model/stl' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${label.user || 'sample'}-${label.year}-contributions.stl`;
  a.click();
  URL.revokeObjectURL(a.href);
  parts.forEach((g) => g.dispose());
  box.dispose();
}

// ---------- UI ----------
const yearSelect = $('year');
const thisYear = new Date().getFullYear();
for (let y = thisYear; y >= 2008; y--) yearSelect.add(new Option(y, y));

function setStatus(msg, isError = false) {
  $('status').textContent = msg;
  $('status').classList.toggle('error', isError);
}

async function load(user, year) {
  if (!user) {
    buildBoard(sampleContributions(year), '', year);
    setStatus('Showing sample data — enter a GitHub username.');
    return;
  }
  setStatus(`Loading ${user}'s ${year} contributions…`);
  try {
    const data = await fetchContributions(user, year);
    buildBoard(data, user, year);
    setStatus('Drag to rotate · scroll to zoom · right-drag to pan');
    const url = new URL(location.href);
    url.searchParams.set('user', user);
    url.searchParams.set('year', year);
    history.replaceState(null, '', url);
  } catch (err) {
    setStatus(err.message, true);
  }
}

$('form').addEventListener('submit', (e) => {
  e.preventDefault();
  load($('username').value.trim(), Number(yearSelect.value));
});
$('autorotate').addEventListener('change', (e) => (controls.autoRotate = e.target.checked));
$('logscale').addEventListener('change', computeTargets);
$('heightScale').addEventListener('input', computeTargets);
$('resetView').addEventListener('click', () => {
  camera.position.copy(DEFAULT_CAM);
  controls.target.set(0, 0, 0);
});
$('exportStl').addEventListener('click', exportSTL);

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// ---------- go ----------
const params = new URLSearchParams(location.search);
const initialUser = params.get('user') || '';
const initialYear = Number(params.get('year')) || thisYear;
$('username').value = initialUser;
yearSelect.value = initialYear;
load(initialUser, initialYear);

renderer.setAnimationLoop((now) => {
  animateBars(now);
  controls.update();
  updateHover();
  renderer.render(scene, camera);
});
