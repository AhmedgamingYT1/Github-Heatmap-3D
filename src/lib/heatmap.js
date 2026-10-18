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
import { fetchContributions, sampleContributions, demoContributions } from './data.js';
import { THEMES, getTheme } from './themes.js';
import { defaults } from './options.js';
import { STYLES, getStyle } from './styles/index.js';
import { glowTex } from './styles/common.js';

// Options that need the scene rebuilt vs. ones a style can apply in place.
const REBUILD_KEYS = ['style', 'theme', 'palette', 'barSize', 'base', 'labels', 'title'];
const IN_PLACE_KEYS = ['height', 'log'];

export function createHeatmap(container, initialOptions = {}) {
  let opts = { ...defaults(), ...initialOptions };
  let styleDef = STYLES[getStyle(opts.style)];
  let theme = currentTheme();

  if (getComputedStyle(container).position === 'static') container.style.position = 'relative';

  // ---------- renderer / scene ----------
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, initialOptions.maxPixelRatio ?? 2)); // pages can trade sharpness for speed
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  const fill = { position: 'absolute', inset: '0', display: 'block', width: '100%', height: '100%', touchAction: 'none' };
  Object.assign(renderer.domElement.style, fill);
  container.appendChild(renderer.domElement);
  if (initialOptions.shadowMapSize) renderer.shadowMap.type = THREE.PCFShadowMap; // cheaper filtering where the map is small

  // zoom: 'pinch' leaves plain scrolling to the page, so a full-screen view never traps the scroll.
  // Trackpad pinches (ctrl + wheel) and two-finger touches still zoom the model, never the page.
  // (registered before OrbitControls so it can keep plain wheel events from reaching them)
  const canvas = renderer.domElement;
  canvas.addEventListener('wheel', (e) => opts.zoom === 'pinch' && !e.ctrlKey && e.stopImmediatePropagation(), { passive: true });
  canvas.addEventListener('touchmove', (e) => opts.zoom && opts.interactive && e.touches.length > 1 && e.preventDefault(), { passive: false });
  // Safari reports trackpad pinches as gesture events rather than ctrl + wheel
  let gestureScale = 1;
  let touches = 0;
  canvas.addEventListener('touchstart', (e) => (touches = e.touches.length), { passive: true });
  canvas.addEventListener('touchend', (e) => (touches = e.touches.length), { passive: true });
  canvas.addEventListener('gesturestart', (e) => {
    if (!opts.zoom || !opts.interactive) return;
    e.preventDefault();
    gestureScale = 1;
  });
  canvas.addEventListener('gesturechange', (e) => {
    if (!opts.zoom || !opts.interactive) return;
    e.preventDefault();
    if (touches) return; // touch pinches are handled by OrbitControls
    const offset = camera.position.clone().sub(controls.target);
    const d = THREE.MathUtils.clamp((offset.length() * gestureScale) / e.scale, controls.minDistance, controls.maxDistance);
    camera.position.copy(controls.target).add(offset.setLength(d));
    gestureScale = e.scale;
  });

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
  const shadowMap = initialOptions.shadowMapSize ?? 2048;
  sun.shadow.mapSize.set(shadowMap, shadowMap);
  Object.assign(sun.shadow.camera, { left: -52, right: 52, top: 26, bottom: -26, near: 1, far: 140 });
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

  injectTooltipStyles();
  const tooltip = document.createElement('div');
  tooltip.className = 'hm-tip';
  tooltip.setAttribute('role', 'status');
  container.appendChild(tooltip);

  // ---------- state ----------
  let days = [];
  let style = null; // the built style instance
  let hovered = -1;
  let highlighted = -1;
  let loadToken = 0;
  let buildToken = 0;
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

  // `background` (not a URL option) lets a page match the scene to its own color exactly.
  function applyBackground() {
    const color = opts.background || theme.background;
    scene.background = opts.transparent ? null : new THREE.Color(color);
    scene.fog.color.set(color);
  }

  function useBloom() {
    return Boolean(styleDef.bloom) && !opts.transparent;
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
    controls.autoRotate = opts.autoRotate && !camAnim;
    controls.autoRotateSpeed = opts.rotateSpeed;
    controls.enabled = opts.interactive;
    controls.enableZoom = Boolean(opts.zoom);
    const shadows = opts.shadows && styleDef.shadows !== false;
    sun.castShadow = shadows;
    style?.setShadows?.(shadows);
    renderer.domElement.style.cursor = opts.interactive ? 'grab' : 'default';
    ensureComposer();
    applyBackground();
  }

  // ---------- build ----------
  function disposeBoard() {
    board.traverse((o) => {
      if (o.userData.shared) {
        o.dispose?.(); // instance buffers only; geometry/materials are reused across builds (e.g. tree models)
        return;
      }
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

  // Styles may load assets first (create returns a promise); a newer build cancels an older one.
  async function build(keepHeights) {
    const token = ++buildToken;
    const prevHeights = keepHeights ? style?.heights?.() : null;
    disposeBoard();
    if (!days.length) return;
    const ctx = {
      cancelled: () => token !== buildToken,
      board,
      renderer,
      theme,
      days,
      prevHeights,
      get opts() {
        return opts; // always the latest options
      },
    };
    let built = styleDef.create(ctx);
    if (built?.then) {
      emit('building', { style: opts.style });
      try {
        built = await built;
      } catch (error) {
        if (token === buildToken) emit('error', error);
        return;
      }
      if (token !== buildToken || !built) return;
      emit('built', { style: opts.style });
    }
    style = built;
    style.resize?.(size.w, size.h);
    if (!prevHeights) restartTour(); // a fresh build grows in again
    applyLiveOptions();
    markReady();
  }

  // Resolves once the current style has finished building (styles with assets build asynchronously).
  let readyPromise = null;
  let resolveReady = null;
  function whenReady() {
    if (style) return Promise.resolve();
    return (readyPromise ||= new Promise((r) => (resolveReady = r)));
  }
  function markReady() {
    resolveReady?.();
    readyPromise = resolveReady = null;
  }

  // ---------- camera ----------
  function fitDistance() {
    // keep the whole board in frame on narrow/tall containers
    const halfWidth = styleDef.camera?.halfWidth ?? 32;
    const base = styleDef.camera?.dist ?? 64;
    const hfov = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect);
    return Math.max(base * 0.7, Math.min(180, halfWidth / Math.tan(hfov / 2)));
  }

  // `homeZoom` > 1 starts closer than the fit-everything distance (the landing page's hero).
  function homePosition() {
    if (opts.camera) return new THREE.Vector3().fromArray(opts.camera);
    const dist = fitDistance() / Math.max(0.2, opts.homeZoom ?? 1);
    return new THREE.Vector3().fromArray(styleDef.camera?.dir ?? [-18, 32, 52]).normalize().multiplyScalar(dist);
  }

  function resetView() {
    camAnim = null;
    camera.position.copy(homePosition());
    controls.target.set(0, 0, 0);
    controls.update();
  }

  // ---------- camera moves ----------
  // One eased move of the camera around the board, in spherical coordinates, while the
  // look-at point glides back to the center. Auto-rotation pauses during it and resumes
  // from wherever it ends, so a chosen view keeps turning from there.
  let camAnim = null;
  const offsetNow = () => new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target));
  function moveCamera(to, { duration = 1000, from = offsetNow() } = {}) {
    let turn = (to.theta - from.theta) % (Math.PI * 2); // the short way around
    if (turn > Math.PI) turn -= Math.PI * 2;
    if (turn < -Math.PI) turn += Math.PI * 2;
    camAnim = {
      start: performance.now(),
      duration,
      from,
      to: new THREE.Spherical(to.radius, to.phi, from.theta + turn),
      target: controls.target.clone(),
    };
    controls.autoRotate = false;
  }
  function stepCamera(now) {
    const t = Math.min(1, (now - camAnim.start) / camAnim.duration);
    const e = t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2; // ease in-out
    const { from, to, target } = camAnim;
    controls.target.lerpVectors(target, new THREE.Vector3(), e);
    camera.position.setFromSpherical(
      new THREE.Spherical(
        THREE.MathUtils.lerp(from.radius, to.radius, e),
        THREE.MathUtils.lerp(from.phi, to.phi, e),
        THREE.MathUtils.lerp(from.theta, to.theta, e),
      ),
    ).add(controls.target);
    if (t >= 1) {
      camAnim = null;
      controls.autoRotate = opts.autoRotate;
    }
  }
  controls.addEventListener('start', () => {
    if (!camAnim) return;
    camAnim = null; // the user grabbed the model: hand over the camera
    controls.autoRotate = opts.autoRotate;
  });

  // The intro: the camera starts straight above the board (where it reads like the flat
  // GitHub graph) and swings down to its usual angle while the style grows in again.
  // `span` is the fraction of the view's width the board covers at the start.
  function playIntro({ duration = 1900, span = 0.83 } = {}) {
    const boardWidth = styleDef.camera?.boardWidth ?? 53;
    const hfov = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect);
    const from = new THREE.Spherical(Math.min(400, boardWidth / span / 2 / Math.tan(hfov / 2)), 0.02, 0);
    controls.target.set(0, 0, 0);
    camera.position.setFromSpherical(from);
    moveCamera(new THREE.Spherical().setFromVector3(homePosition()), { duration, from });
    style?.replay?.();
    restartTour();
  }

  // Named views. The board's front is the side with the name on it (+z); `phi` is measured
  // from straight above. The current zoom is kept.
  const VIEWS = {
    top: { phi: 0.02, theta: 0 },
    front: { phi: 1.18, theta: 0 },
    back: { phi: 1.18, theta: Math.PI },
    left: { phi: 1.18, theta: -Math.PI / 2 },
    right: { phi: 1.18, theta: Math.PI / 2 },
  };
  function viewFrom(name) {
    const home = new THREE.Spherical().setFromVector3(homePosition());
    const v = VIEWS[name];
    if (!v) return moveCamera(home); // 'home': the default angle and distance
    moveCamera(new THREE.Spherical(offsetNow().radius, v.phi, v.theta));
  }
  function zoomBy(factor) {
    const now = offsetNow();
    const base = camAnim ? camAnim.to : now; // repeated clicks add up
    const r = THREE.MathUtils.clamp(base.radius * factor, controls.minDistance, controls.maxDistance);
    moveCamera(new THREE.Spherical(r, base.phi, base.theta), { duration: 450, from: now });
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
  const onPointerLeave = () => {
    pointerInside = false;
    tour.resumeAt = performance.now() + 1500; // give the walk-through a moment before it picks up again
  };
  renderer.domElement.addEventListener('pointermove', onPointerMove);
  renderer.domElement.addEventListener('pointerleave', onPointerLeave);

  function setHovered(i) {
    if (i === hovered) return;
    hovered = i;
    style?.setHover?.(i);
  }

  function hideTip() {
    setHovered(-1);
    tooltip.classList.remove('on');
  }

  // The walk-through: until someone points at the model, the tooltip visits the days one
  // by one from January, so it's clear that every bar is a day you can look at.
  const TOUR_STEP = 650; // ms per day
  const TOUR_DELAY = 2600; // after a build, let the grow-in finish first
  const tour = { day: 0, next: Infinity, resumeAt: 0 };
  function restartTour() {
    tour.day = -1; // the first step shows January 1st
    tour.next = performance.now() + TOUR_DELAY;
  }
  const projected = new THREE.Vector3();
  function stepTour(now) {
    if (!opts.tour || highlighted >= 0 || now < tour.resumeAt || !style.anchor) return hideTip();
    if (now >= tour.next) {
      tour.day = (tour.day + 1) % days.length;
      tour.next = now + TOUR_STEP;
    }
    if (tour.day < 0) return hideTip(); // still growing in
    // days out of view (a close-up, the far side) are skipped rather than waited on
    const inView = () => {
      projected.copy(style.anchor(tour.day)).project(camera);
      return projected.z < 1 && Math.abs(projected.x) < 0.92 && Math.abs(projected.y) < 0.85;
    };
    for (let tries = 0; !inView(); tries++) {
      if (tries >= days.length) return hideTip();
      tour.day = (tour.day + 1) % days.length;
    }
    setHovered(tour.day);
    showTip(tour.day, ((projected.x + 1) / 2) * size.w, ((1 - projected.y) / 2) * size.h);
  }

  function updateHover(now) {
    if (!style || !opts.tooltip) return hideTip();
    if (!pointerInside) return stepTour(now);
    raycaster.setFromCamera(pointer, camera);
    const i = style.pick(raycaster);
    setHovered(i);
    if (i < 0) {
      tooltip.classList.remove('on');
      return;
    }
    tour.day = i; // the walk-through continues from the last day looked at
    showTip(i, pointerPx.x, pointerPx.y);
  }

  function showTip(i, x, y) {
    const day = days[i];
    const n = day.count;
    if (tooltip.dataset.day !== day.date) {
      tooltip.dataset.day = day.date;
      const max = Math.max(...days.map((d) => d.count));
      const tag = n === 0 ? 'Rest day' : n === max ? 'Best day of the year' : '';
      tooltip.innerHTML =
        `<span class="hm-tip-date"><i style="background:${theme.levels[day.level]}"></i>${fmtDate(day.date)}</span>` +
        `<span class="hm-tip-n"><b>${n}</b> contribution${n === 1 ? '' : 's'}</span>` +
        (tag ? `<span class="hm-tip-tag">${tag}</span>` : '');
    }
    tooltip.style.left = `${x}px`;
    tooltip.style.top = `${y}px`;
    tooltip.classList.add('on');
  }

  // ---------- data ----------
  async function load() {
    const token = ++loadToken;
    await null; // let callers attach .on() listeners before the first events fire
    const { user, year } = opts;
    emit('loading', { user, year });
    try {
      const data = opts.demo ? demoContributions(year) : user ? await fetchContributions(user, year) : sampleContributions(year);
      if (token !== loadToken) return; // a newer load started meanwhile
      days = data;
      build(false);
      emit('load', { user, year, days });
    } catch (error) {
      if (token === loadToken) emit('error', error);
    }
  }

  // ---------- loop ----------
  let lastRender = 0;
  function frame(now) {
    // maxFps: skip frames on high-refresh screens and phones, where every frame costs heat
    if (opts.maxFps && now - lastRender < 1000 / opts.maxFps - 4) return;
    lastRender = now;
    style?.update(now);
    if (camAnim) stepCamera(now);
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
    updateHover(now);
    if (useBloom()) composer.render();
    else renderer.render(scene, camera);
  }

  // Only render while the view is on screen and the tab is visible.
  let onScreen = true;
  let destroyed = false;
  let paused = false;
  const syncLoop = () => renderer.setAnimationLoop(!destroyed && !paused && onScreen && !document.hidden ? frame : null);
  const visibility = new IntersectionObserver(([entry]) => {
    onScreen = entry.isIntersecting;
    syncLoop();
  });
  visibility.observe(container);
  document.addEventListener('visibilitychange', syncLoop);
  syncLoop();

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
    /** For debugging: the three.js scene, camera and the current style instance. */
    get scene() {
      return scene;
    },
    get camera() {
      return camera;
    },
    get style() {
      return style;
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
      if (changed('maxPixelRatio')) {
        renderer.setPixelRatio(Math.min(devicePixelRatio, opts.maxPixelRatio ?? 2));
        resize();
      }
      applyLiveOptions();
    },
    /** Swing the camera down from straight above while the style grows in again. */
    intro: playIntro,
    /** Glide to a named view ('top', 'front', 'back', 'left', 'right' or 'home') and keep turning from there. */
    viewFrom,
    /** Zoom in (factor < 1) or out (> 1), animated. */
    zoomBy,
    /** Resolves when the current style has finished building. */
    ready: whenReady,
    /** Stop (or resume) rendering, e.g. while the view is covered. */
    setPaused(p) {
      paused = p;
      syncLoop();
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
    /** Render the current view now and return it as an image data URL (jpeg/png/webp). */
    snapshot(type = 'image/jpeg', quality = 0.9) {
      // finish any grow-in animation first, so the picture shows the final scene
      const t = performance.now();
      for (let k = 1; k <= 60; k++) style?.update(t + k * 250);
      controls.update();
      if (useBloom()) composer.render();
      else renderer.render(scene, camera);
      return renderer.domElement.toDataURL(type, quality);
    },
    destroy() {
      loadToken++;
      destroyed = true;
      visibility.disconnect();
      document.removeEventListener('visibilitychange', syncLoop);
      renderer.setAnimationLoop(null);
      resizeObserver.disconnect();
      controls.dispose();
      disposeBoard();
      composer?.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      tooltip.remove();
    },
  };
}

// The hover card. Plain CSS injected once, so any page that embeds the component gets it.
function injectTooltipStyles() {
  if (document.getElementById('hm-tip-styles')) return;
  const style = document.createElement('style');
  style.id = 'hm-tip-styles';
  style.textContent = `
.hm-tip {
  position: absolute; z-index: 3; pointer-events: none; display: grid; gap: 4px; min-width: 150px;
  padding: 10px 12px 11px; border-radius: 14px; color: #f4f4f6;
  background: rgba(16, 16, 20, 0.82); border: 1px solid rgba(255, 255, 255, 0.12);
  backdrop-filter: blur(14px) saturate(160%); -webkit-backdrop-filter: blur(14px) saturate(160%);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.06);
  font: 12px/1.35 'Geist Variable', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
  white-space: nowrap; opacity: 0; transform: translate(-50%, calc(-100% - 6px)) scale(0.96);
  transition: opacity 0.15s ease, transform 0.18s cubic-bezier(.2,.8,.2,1);
}
.hm-tip.on { opacity: 1; transform: translate(-50%, calc(-100% - 14px)) scale(1); }
.hm-tip-date { display: flex; align-items: center; gap: 7px; color: #a3a3ad; font-size: 11.5px; }
.hm-tip-date i { width: 9px; height: 9px; border-radius: 3px; box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.15); }
.hm-tip-n { color: #c9c9d1; }
.hm-tip-n b { font-size: 20px; font-weight: 650; color: #fff; letter-spacing: -0.02em; margin-right: 3px; font-variant-numeric: tabular-nums; }
.hm-tip-tag { justify-self: start; margin-top: 2px; padding: 3px 7px; border-radius: 6px; font-size: 10.5px; font-weight: 600; color: #ffd8b0; background: rgba(242, 166, 94, 0.16); }
`;
  document.head.appendChild(style);
}

export function fmtDate(iso, opts = { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) {
  return new Date(iso + 'T00:00:00Z').toLocaleDateString(undefined, { ...opts, timeZone: 'UTC' });
}
