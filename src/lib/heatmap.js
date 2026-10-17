// The 3D contribution heatmap as a reusable component.
//
//   const map = createHeatmap(element, { user: 'octocat', theme: 'ocean' });
//   map.setOptions({ autoRotate: false });
//
// Used by the main site, the iframe embed page and anything else that wants it.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { fetchContributions, sampleContributions } from './data.js';
import { THEMES, getTheme } from './themes.js';
import { defaults } from './options.js';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const CELL = 1; // grid spacing
const MIN_H = 0.08; // height of an empty day
const BASE_H = 0.6; // plinth thickness
const VIEW_DIR = new THREE.Vector3(-18, 32, 52).normalize(); // default camera direction
const VIEW_DIST = 64; // default camera distance on a typical landscape screen

// Options that need the board rebuilt vs. ones that just change bar heights.
const REBUILD_KEYS = ['theme', 'barSize', 'base', 'labels', 'title'];
const HEIGHT_KEYS = ['height', 'log'];

export function createHeatmap(container, initialOptions = {}) {
  let opts = { ...defaults(), ...initialOptions };
  let theme = THEMES[getTheme(opts.theme)];

  if (getComputedStyle(container).position === 'static') container.style.position = 'relative';

  // ---------- renderer / scene ----------
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  Object.assign(renderer.domElement.style, { display: 'block', width: '100%', height: '100%', touchAction: 'none' });
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog('#000', 90, 180);

  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 500);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 10;
  controls.maxDistance = 200;
  controls.maxPolarAngle = Math.PI; // allow looking from underneath too — full 360°

  const hemi = new THREE.HemisphereLight('#ffffff', '#000000', 1.1);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight('#ffffff', 2.2);
  sun.position.set(-20, 40, 25);
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -40, right: 40, top: 20, bottom: -20, near: 1, far: 120 });
  sun.shadow.bias = -0.0005;
  scene.add(sun);
  const rim = new THREE.DirectionalLight('#ffffff', 0.6);
  rim.position.set(25, 10, -30);
  scene.add(rim);

  // Everything that depends on the data lives in this group so it can be rebuilt.
  const board = new THREE.Group();
  scene.add(board);

  const tooltip = document.createElement('div');
  Object.assign(tooltip.style, {
    position: 'absolute',
    pointerEvents: 'none',
    background: '#1f2328',
    color: '#fff',
    padding: '6px 10px',
    borderRadius: '6px',
    font: '12px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif',
    whiteSpace: 'nowrap',
    transform: 'translate(-50%, calc(-100% - 12px))',
    zIndex: 3,
    display: 'none',
  });
  container.appendChild(tooltip);

  // ---------- state ----------
  let days = [];
  let cells = []; // { day, col, row, x, z }
  let bars = null; // InstancedMesh
  let plinth = null;
  let ground = null;
  let current = new Float32Array(0); // animated heights
  let target = new Float32Array(0);
  let animStart = 0;
  let hovered = -1;
  let levelColors = [];
  let hoverColor = new THREE.Color();
  let loadToken = 0;
  const listeners = {};

  const emit = (name, data) => listeners[name]?.forEach((fn) => fn(data));

  // ---------- text helper ----------
  function textPlane(text, { size = 1, color = theme.label, weight = 500, align = 'center' } = {}) {
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
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
    mesh.rotation.x = -Math.PI / 2; // lie flat on the plinth
    return mesh;
  }

  // ---------- theme / lighting ----------
  function applyTheme() {
    theme = THEMES[getTheme(opts.theme)];
    levelColors = theme.levels.map((c) => new THREE.Color(c));
    hoverColor = new THREE.Color(theme.dark ? '#ffffff' : theme.text);
    hemi.color.set(theme.dark ? '#c9d1d9' : '#ffffff');
    hemi.groundColor.set(theme.dark ? theme.background : theme.plinth);
    hemi.intensity = theme.dark ? 1.1 : 1.6;
    sun.intensity = theme.dark ? 2.2 : 1.8;
    rim.color.set(theme.accent);
    applyBackground();
  }

  function applyBackground() {
    scene.background = opts.transparent ? null : new THREE.Color(theme.background);
    scene.fog.color.set(theme.background);
  }

  function applyLiveOptions() {
    controls.autoRotate = opts.autoRotate;
    controls.autoRotateSpeed = opts.rotateSpeed;
    controls.enabled = opts.interactive;
    controls.enableZoom = opts.zoom;
    sun.castShadow = opts.shadows;
    if (bars) {
      bars.castShadow = opts.shadows;
      plinth.castShadow = opts.shadows;
      ground.visible = opts.shadows;
    }
    renderer.domElement.style.cursor = opts.interactive ? 'grab' : 'default';
    applyBackground();
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

  function buildBoard(keepHeights) {
    const prevHeights = keepHeights ? current : null;
    disposeBoard();
    if (!days.length) return;
    cells = layout(days);

    const bar = opts.barSize * CELL;
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
    plinth = new THREE.Mesh(
      plinthGeo,
      new THREE.MeshStandardMaterial({ color: theme.plinth, roughness: 0.6, metalness: theme.dark ? 0.2 : 0 }),
    );
    plinth.receiveShadow = true;
    plinth.visible = opts.base;
    board.add(plinth);

    // bars
    const geo = new THREE.BoxGeometry(bar, 1, bar);
    geo.translate(0, 0.5, 0); // base at y = 0 so scaling grows upward
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.45, metalness: 0.1 });
    bars = new THREE.InstancedMesh(geo, mat, cells.length);
    bars.receiveShadow = true;
    bars.frustumCulled = false;
    cells.forEach((c, i) => bars.setColorAt(i, levelColors[c.day.level]));
    board.add(bars);

    target = new Float32Array(cells.length);
    computeTargets();
    if (prevHeights?.length === cells.length) {
      current = prevHeights;
      current.set(target); // jump straight to final heights, no grow-in
      animStart = -Infinity;
      writeAllMatrices();
    } else {
      current = new Float32Array(cells.length); // start flat → grow-in animation
      animStart = performance.now();
    }

    if (opts.labels) {
      // month labels along the back edge (like the top row on GitHub)
      let lastMonth = -1;
      for (const c of cells) {
        const m = Number(c.day.date.slice(5, 7)) - 1;
        if (m !== lastMonth && c.row === 0) {
          lastMonth = m;
          const t = textPlane(MONTHS[m], { size: 0.9, align: 'left' });
          t.position.set(c.x - bar / 2, 0.01, z0 - CELL * 1.2);
          board.add(t);
        }
      }
      // weekday labels on the left
      [['Mon', 1], ['Wed', 3], ['Fri', 5]].forEach(([name, row]) => {
        const t = textPlane(name, { size: 0.7, align: 'right' });
        t.position.set(x0 - CELL * 0.8, 0.01, z0 + row * CELL);
        board.add(t);
      });
    }

    if (opts.title) {
      // name + year on the front of the plinth top
      const year = days[0].date.slice(0, 4);
      const title = textPlane(`${opts.user || 'sample'}  ·  ${year}`, { size: 1.4, color: theme.text, weight: 600, align: 'left' });
      title.position.set(x0 - bar / 2, 0.01, z0 + 7 * CELL + 1.0);
      board.add(title);
    }

    // ground shadow catcher
    ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.ShadowMaterial({ opacity: theme.dark ? 0.35 : 0.15 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = (opts.base ? -BASE_H : 0) - 0.01;
    ground.receiveShadow = true;
    board.add(ground);

    applyLiveOptions();
  }

  function computeTargets() {
    if (!cells.length) return;
    const max = Math.max(1, ...cells.map((c) => c.day.count));
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

  function writeAllMatrices() {
    cells.forEach((_, i) => setBarMatrix(i));
    bars.instanceMatrix.needsUpdate = true;
  }

  function animateBars(now) {
    if (!bars) return;
    let changed = false;
    const elapsed = now - animStart;
    for (let i = 0; i < cells.length; i++) {
      if (elapsed < cells[i].col * 18) continue; // left-to-right wave on load
      const diff = target[i] - current[i];
      if (Math.abs(diff) < 0.001) {
        if (current[i] === target[i]) continue;
        current[i] = target[i];
      } else {
        current[i] += diff * 0.12;
      }
      setBarMatrix(i);
      changed = true;
    }
    if (changed) {
      bars.instanceMatrix.needsUpdate = true;
      bars.boundingSphere = null; // recompute for raycasting
      bars.boundingBox = null;
    }
  }

  // ---------- camera ----------
  function fitDistance() {
    // keep the whole board in frame on narrow/tall containers
    const halfWidth = 32;
    const hfov = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect);
    return Math.max(VIEW_DIST * 0.7, Math.min(180, halfWidth / Math.tan(hfov / 2)));
  }

  function resetView() {
    if (opts.camera) camera.position.fromArray(opts.camera);
    else camera.position.copy(VIEW_DIR).multiplyScalar(fitDistance());
    controls.target.set(0, 0, 0);
    controls.update();
  }

  // ---------- sizing ----------
  function resize() {
    const w = container.clientWidth || 1;
    const h = container.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(container);
  resize();

  // ---------- hover tooltip ----------
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let pointerInside = false;
  let pointerPx = { x: 0, y: 0 };

  const onPointerMove = (e) => {
    const r = renderer.domElement.getBoundingClientRect();
    pointerPx = { x: e.clientX - r.left, y: e.clientY - r.top };
    pointer.set((pointerPx.x / r.width) * 2 - 1, -(pointerPx.y / r.height) * 2 + 1);
    pointerInside = true;
  };
  const onPointerLeave = () => (pointerInside = false);
  renderer.domElement.addEventListener('pointermove', onPointerMove);
  renderer.domElement.addEventListener('pointerleave', onPointerLeave);

  function setHovered(i) {
    if (i === hovered) return;
    if (hovered >= 0) bars.setColorAt(hovered, levelColors[cells[hovered].day.level]);
    hovered = i;
    if (i >= 0) bars.setColorAt(i, hoverColor);
    bars.instanceColor.needsUpdate = true;
  }

  function updateHover() {
    if (!bars || !pointerInside || !opts.tooltip) {
      if (bars) setHovered(-1);
      tooltip.style.display = 'none';
      return;
    }
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObject(bars, false)[0];
    if (!hit) {
      setHovered(-1);
      tooltip.style.display = 'none';
      return;
    }
    setHovered(hit.instanceId);
    const { day } = cells[hit.instanceId];
    const n = day.count;
    tooltip.textContent = `${n === 0 ? 'No' : n} contribution${n === 1 ? '' : 's'} on ${fmtDate(day.date)}`;
    tooltip.style.left = `${pointerPx.x}px`;
    tooltip.style.top = `${pointerPx.y}px`;
    tooltip.style.display = 'block';
  }

  // ---------- data ----------
  async function load() {
    const token = ++loadToken;
    await null; // let callers attach .on() listeners before the first events fire
    const { user, year } = opts;
    emit('loading', { user, year });
    try {
      const data = user ? await fetchContributions(user, year) : sampleContributions(year);
      if (token !== loadToken) return; // a newer load started meanwhile
      days = data;
      buildBoard(false);
      emit('load', { user, year, days });
    } catch (error) {
      if (token === loadToken) emit('error', error);
    }
  }

  // ---------- STL export ----------
  function exportSTL() {
    if (!bars) return null;
    const parts = [];
    if (opts.base) parts.push(plinth.geometry.clone());
    const bar = opts.barSize * CELL;
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
  }

  // ---------- loop ----------
  renderer.setAnimationLoop((now) => {
    animateBars(now);
    controls.update();
    // fog only softens the far edge of the board, however far away the camera is
    const dist = camera.position.length();
    scene.fog.near = dist + 25;
    scene.fog.far = opts.transparent ? Infinity : dist + 120;
    updateHover();
    renderer.render(scene, camera);
  });

  applyTheme();
  applyLiveOptions();
  resetView();
  load();

  return {
    get options() {
      return { ...opts };
    },
    get days() {
      return days;
    },
    /** Change any options; reloads data only when user/year change. */
    setOptions(patch) {
      const prev = opts;
      opts = { ...opts, ...patch };
      const changed = (k) => JSON.stringify(prev[k]) !== JSON.stringify(opts[k]);
      if (changed('user') || changed('year')) return load();
      if (changed('theme')) applyTheme();
      if (REBUILD_KEYS.some(changed)) buildBoard(true);
      else if (HEIGHT_KEYS.some(changed)) computeTargets();
      if (changed('camera')) resetView();
      applyLiveOptions();
    },
    reload: load,
    resetView,
    /** Current camera position, rounded, for saving a view into options. */
    getCamera: () => camera.position.toArray().map((n) => Math.round(n * 10) / 10),
    exportSTL,
    on(name, fn) {
      (listeners[name] ||= []).push(fn);
      return () => (listeners[name] = listeners[name].filter((f) => f !== fn));
    },
    destroy() {
      loadToken++;
      renderer.setAnimationLoop(null);
      resizeObserver.disconnect();
      controls.dispose();
      disposeBoard();
      renderer.dispose();
      renderer.domElement.remove();
      tooltip.remove();
    },
  };
}

export function fmtDate(iso, opts = { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) {
  return new Date(iso + 'T00:00:00Z').toLocaleDateString(undefined, { ...opts, timeZone: 'UTC' });
}
