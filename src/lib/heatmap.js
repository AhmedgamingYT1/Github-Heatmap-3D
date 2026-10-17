// The contribution heatmap as a reusable component.
//
//   const map = createHeatmap(element, { user: 'octocat', style: 'galaxy' });
//   map.setOptions({ autoRotate: false });
//
// Used by the main site, the iframe embed page and anything else that wants it.
// The look itself lives in ./styles — this file is the stage they perform on.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { fetchContributions, sampleContributions } from './data.js';
import { THEMES, getTheme } from './themes.js';
import { defaults } from './options.js';
import { STYLES, getStyle } from './styles/index.js';
import { glowTex } from './styles/common.js';

// Options that need the scene rebuilt vs. ones a style can apply in place.
const REBUILD_KEYS = ['style', 'theme', 'barSize', 'base', 'labels', 'title'];
const IN_PLACE_KEYS = ['height', 'log'];

export function createHeatmap(container, initialOptions = {}) {
  let opts = { ...defaults(), ...initialOptions };
  let styleDef = STYLES[getStyle(opts.style)];
  let theme = currentTheme();

  if (getComputedStyle(container).position === 'static') container.style.position = 'relative';

  // ---------- renderer / scene ----------
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  const fill = { position: 'absolute', inset: '0', display: 'block', width: '100%', height: '100%', touchAction: 'none' };
  Object.assign(renderer.domElement.style, fill);
  container.appendChild(renderer.domElement);

  // 2D styles (Heartbeat) draw here instead
  const canvas2d = document.createElement('canvas');
  Object.assign(canvas2d.style, fill);
  canvas2d.style.display = 'none';
  container.appendChild(canvas2d);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog('#000', 90, 180);

  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 600);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 8;
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

  // Everything a style builds lives in this group so it can be rebuilt.
  const board = new THREE.Group();
  scene.add(board);

  // "Now playing" marker that follows the song
  const marker = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: glowTex(), color: '#ffffff', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }),
  );
  marker.scale.set(2.4, 2.4, 1);
  marker.visible = false;
  scene.add(marker);

  // Glow post-processing, created the first time a style asks for it
  let composer = null;
  let bloomPass = null;

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
  let style = null; // the built style instance
  let hovered = -1;
  let highlighted = -1;
  let loadToken = 0;
  let size = { w: 1, h: 1 };
  const listeners = {};
  const emit = (name, data) => listeners[name]?.forEach((fn) => fn(data));

  function currentTheme() {
    return THEMES[styleDef.theme || getTheme(opts.theme)];
  }

  // ---------- theme / lighting ----------
  function applyTheme() {
    styleDef = STYLES[getStyle(opts.style)];
    theme = currentTheme();
    const L = styleDef.lights;
    hemi.color.set(L ? L.hemi[0] : theme.dark ? '#c9d1d9' : '#ffffff');
    hemi.groundColor.set(L ? L.hemi[1] : theme.dark ? theme.background : theme.plinth);
    hemi.intensity = L ? L.hemi[2] : theme.dark ? 1.1 : 1.6;
    sun.color.set(L ? L.sun[0] : '#ffffff');
    sun.intensity = L ? L.sun[1] : theme.dark ? 2.2 : 1.8;
    rim.color.set(L ? L.rim[0] : theme.accent);
    rim.intensity = L ? L.rim[1] : 0.6;
    applyBackground();
  }

  function applyBackground() {
    scene.background = opts.transparent ? null : new THREE.Color(theme.background);
    scene.fog.color.set(theme.background);
  }

  function useBloom() {
    return Boolean(styleDef.bloom) && !opts.transparent && !styleDef.is2d;
  }

  function ensureComposer() {
    if (!useBloom()) return;
    if (!composer) {
      composer = new EffectComposer(renderer);
      composer.addPass(new RenderPass(scene, camera));
      bloomPass = new UnrealBloomPass(new THREE.Vector2(size.w, size.h), 1, 0.5, 0.6);
      composer.addPass(bloomPass);
      composer.addPass(new OutputPass());
      composer.setSize(size.w, size.h);
    }
    Object.assign(bloomPass, styleDef.bloom);
  }

  function applyLiveOptions() {
    const is2d = Boolean(styleDef.is2d);
    controls.autoRotate = opts.autoRotate;
    controls.autoRotateSpeed = opts.rotateSpeed;
    controls.enabled = opts.interactive && !is2d;
    controls.enableZoom = opts.zoom;
    const shadows = opts.shadows && styleDef.shadows !== false;
    sun.castShadow = shadows;
    style?.setShadows?.(shadows);
    renderer.domElement.style.display = is2d ? 'none' : 'block';
    canvas2d.style.display = is2d ? 'block' : 'none';
    (is2d ? canvas2d : renderer.domElement).style.cursor = opts.interactive && !is2d ? 'grab' : 'default';
    ensureComposer();
    applyBackground();
  }

  // ---------- build ----------
  function disposeBoard() {
    board.traverse((o) => {
      o.geometry?.dispose();
      for (const m of [o.material].flat()) {
        if (!m) continue;
        if (m.map && m.map !== glowTex()) m.map.dispose();
        m.dispose();
      }
    });
    board.clear();
    style = null;
    hovered = -1;
  }

  function build(keepHeights) {
    const prevHeights = keepHeights ? style?.heights?.() : null;
    disposeBoard();
    if (!days.length) return;
    const ctx = {
      board,
      renderer,
      canvas: canvas2d,
      theme,
      days,
      prevHeights,
      get opts() {
        return opts; // always the latest options
      },
    };
    style = styleDef.create(ctx);
    style.resize?.(size.w, size.h);
    applyLiveOptions();
  }

  // ---------- camera ----------
  function fitDistance() {
    // keep the whole board in frame on narrow/tall containers
    const halfWidth = styleDef.camera?.halfWidth ?? 32;
    const base = styleDef.camera?.dist ?? 64;
    const hfov = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect);
    return Math.max(base * 0.7, Math.min(180, halfWidth / Math.tan(hfov / 2)));
  }

  function resetView() {
    if (opts.camera) camera.position.fromArray(opts.camera);
    else camera.position.fromArray(styleDef.camera?.dir ?? [-18, 32, 52]).normalize().multiplyScalar(fitDistance());
    controls.target.set(0, 0, 0);
    controls.update();
  }

  // ---------- sizing ----------
  function resize() {
    size = { w: container.clientWidth || 1, h: container.clientHeight || 1 };
    renderer.setSize(size.w, size.h, false);
    composer?.setSize(size.w, size.h);
    camera.aspect = size.w / size.h;
    camera.updateProjectionMatrix();
    style?.resize?.(size.w, size.h);
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
    const r = container.getBoundingClientRect();
    pointerPx = { x: e.clientX - r.left, y: e.clientY - r.top };
    pointer.set((pointerPx.x / r.width) * 2 - 1, -(pointerPx.y / r.height) * 2 + 1);
    pointerInside = true;
  };
  const onPointerLeave = () => (pointerInside = false);
  for (const el of [renderer.domElement, canvas2d]) {
    el.addEventListener('pointermove', onPointerMove);
    el.addEventListener('pointerleave', onPointerLeave);
  }

  function setHovered(i) {
    if (i === hovered) return;
    hovered = i;
    style?.setHover?.(i);
  }

  function updateHover() {
    if (!style || !pointerInside || !opts.tooltip) {
      setHovered(-1);
      tooltip.style.display = 'none';
      return;
    }
    let i = -1;
    if (style.is2d) i = style.pickPx(pointerPx.x, pointerPx.y);
    else {
      raycaster.setFromCamera(pointer, camera);
      i = style.pick(raycaster);
    }
    setHovered(i);
    if (i < 0) {
      tooltip.style.display = 'none';
      return;
    }
    const day = days[i];
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
      build(false);
      emit('load', { user, year, days });
    } catch (error) {
      if (token === loadToken) emit('error', error);
    }
  }

  // ---------- loop ----------
  renderer.setAnimationLoop((now) => {
    style?.update(now);
    if (styleDef.is2d) {
      updateHover();
      return; // the style drew itself
    }
    controls.update();
    // fog only softens the far edge of the board, however far away the camera is
    const dist = camera.position.length();
    const fog = styleDef.fog !== false && !opts.transparent;
    scene.fog.near = fog ? dist + 25 : 1e6;
    scene.fog.far = fog ? dist + 120 : 1e6 + 1;
    if (highlighted >= 0 && style?.anchor) {
      marker.position.copy(style.anchor(highlighted)).add(new THREE.Vector3(0, 0.9, 0));
      marker.material.color.set(theme.accent);
      marker.visible = true;
    } else marker.visible = false;
    updateHover();
    if (useBloom()) composer.render();
    else renderer.render(scene, camera);
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
    /** For debugging: the three.js scene. */
    get scene() {
      return scene;
    },
    /** Change any options; reloads data only when user/year change. */
    setOptions(patch) {
      const prev = opts;
      opts = { ...opts, ...patch };
      const changed = (k) => JSON.stringify(prev[k]) !== JSON.stringify(opts[k]);
      if (changed('user') || changed('year')) return load();
      if (changed('style') || changed('theme')) applyTheme();
      if (REBUILD_KEYS.some(changed)) build(!changed('style'));
      else if (IN_PLACE_KEYS.some(changed)) style?.setOptions?.(opts);
      if (changed('camera') || changed('style')) resetView();
      applyLiveOptions();
    },
    reload: load,
    resetView,
    /** Current camera position, rounded, for saving a view into options. */
    getCamera: () => camera.position.toArray().map((n) => Math.round(n * 10) / 10),
    /** Mark one day (e.g. the one the song is playing); -1 clears. */
    highlight(i) {
      highlighted = i;
      style?.setHighlight?.(i);
    },
    get canExportSTL() {
      return Boolean(styleDef.stl && style?.exportSTL);
    },
    exportSTL: () => (styleDef.stl ? style?.exportSTL?.() ?? null : null),
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
      composer?.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      canvas2d.remove();
      tooltip.remove();
    },
  };
}

export function fmtDate(iso, opts = { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) {
  return new Date(iso + 'T00:00:00Z').toLocaleDateString(undefined, { ...opts, timeZone: 'UTC' });
}
