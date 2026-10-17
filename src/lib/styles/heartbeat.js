// Heartbeat: the year on a heart monitor. Each day is one beat; the spike is
// as tall as that day's contributions, and quiet days are a flat line.
import { maxCount, MONTHS } from './common.js';

const SPAN = 42; // days visible across the screen
const DAYS_PER_SECOND = 9;
const GAP_DAYS = 1.2; // erased band ahead of the sweep, like a real monitor

// One beat (P wave, QRS spike, T wave) at phase p in [0, 1) with amplitude a in [0, 1].
function wave(p, a) {
  if (a <= 0) return 0;
  if (p > 0.08 && p < 0.2) return 0.1 * a * Math.sin(((p - 0.08) / 0.12) * Math.PI);
  if (p >= 0.3 && p < 0.34) return -0.12 * a * ((p - 0.3) / 0.04);
  if (p >= 0.34 && p < 0.4) return -0.12 * a + (1.12 * a * (p - 0.34)) / 0.06;
  if (p >= 0.4 && p < 0.46) return a - (1.3 * a * (p - 0.4)) / 0.06;
  if (p >= 0.46 && p < 0.5) return -0.3 * a + (0.3 * a * (p - 0.46)) / 0.04;
  if (p > 0.6 && p < 0.78) return 0.2 * a * Math.sin(((p - 0.6) / 0.18) * Math.PI);
  return 0;
}

export function createHeartbeat(ctx) {
  const { canvas, theme, days } = ctx;
  const g = canvas.getContext('2d');
  const max = maxCount(days);
  const amp = days.map((d) => (d.count ? 0.25 + 0.75 * Math.sqrt(d.count / max) : 0));
  const line = theme.accent;
  const FONT = 'ui-monospace, SFMono-Regular, Menlo, monospace';

  let w = 1;
  let h = 1;
  let cursor = 0; // in days, fractional
  let last = performance.now();
  let followUntil = 0; // while the song is playing, the song moves the cursor
  let followSpeed = DAYS_PER_SECOND;
  let lastBeat = 0;
  let beatDay = 0;
  let hovered = -1;

  // Which day is drawn at screen x? Left of the sweep: this pass. Right of the gap: the previous pass.
  function dayAt(x) {
    const local = (x / w) * SPAN;
    const passStart = Math.floor(cursor / SPAN) * SPAN;
    const lead = cursor - passStart;
    if (local <= lead) return passStart + local;
    if (local > lead + GAP_DAYS) return passStart - SPAN + local;
    return null;
  }

  function streakAt(i) {
    let n = 0;
    for (let k = i; k >= 0 && days[k].count > 0; k--) n++;
    return n;
  }

  function draw() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = theme.background;
    g.fillRect(0, 0, w, h);

    // ECG paper grid
    const big = Math.max(24, Math.min(w, h) / 10);
    g.lineWidth = 1;
    for (let x = 0, n = 0; x < w; x += big / 5, n++) {
      g.strokeStyle = n % 5 ? 'rgba(57,255,136,0.06)' : 'rgba(57,255,136,0.15)';
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x, h);
      g.stroke();
    }
    for (let y = 0, n = 0; y < h; y += big / 5, n++) {
      g.strokeStyle = n % 5 ? 'rgba(57,255,136,0.06)' : 'rgba(57,255,136,0.15)';
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(w, y);
      g.stroke();
    }

    // trace
    const base = h * 0.7;
    const scale = h * 0.36;
    const yAt = (d) => {
      const i = Math.floor(d);
      if (i < 0 || i >= days.length) return base;
      const jitter = Math.sin(d * 37.1) * 0.6; // a little life in the flat line
      return base - wave(d - i, amp[i]) * scale + jitter;
    };
    g.lineJoin = 'round';
    g.lineCap = 'round';
    g.lineWidth = 2;
    g.shadowColor = line;
    for (const pass of ['old', 'new']) {
      g.strokeStyle = line;
      g.globalAlpha = pass === 'old' ? 0.35 : 1;
      g.shadowBlur = pass === 'old' ? 0 : 10;
      g.beginPath();
      let drawing = false;
      for (let x = 0; x <= w; x += 1) {
        const d = dayAt(x);
        const isNew = d !== null && d >= Math.floor(cursor / SPAN) * SPAN;
        if (d === null || d < 0 || (pass === 'new') !== isNew) {
          drawing = false;
          continue;
        }
        const y = yAt(d);
        if (drawing) g.lineTo(x, y);
        else g.moveTo(x, y);
        drawing = true;
      }
      g.stroke();
    }
    g.globalAlpha = 1;

    // leading dot
    const lx = ((cursor % SPAN) / SPAN) * w;
    g.fillStyle = '#eafff2';
    g.shadowBlur = 18;
    g.beginPath();
    g.arc(lx, yAt(cursor), 3.5, 0, Math.PI * 2);
    g.fill();
    g.shadowBlur = 0;

    // hovered day marker
    if (hovered >= 0) {
      const passStart = Math.floor(cursor / SPAN) * SPAN;
      let local = hovered + 0.4 - passStart;
      if (local < 0) local += SPAN;
      const hx = (local / SPAN) * w;
      g.strokeStyle = 'rgba(234,255,242,0.4)';
      g.setLineDash([4, 4]);
      g.beginPath();
      g.moveTo(hx, 0);
      g.lineTo(hx, h);
      g.stroke();
      g.setLineDash([]);
    }

    // readouts: three columns across the top centre, clear of the corners where pages put panels
    const i = Math.min(days.length - 1, Math.max(0, Math.floor(cursor)));
    const d = days[i];
    const pad = Math.max(14, w * 0.025);
    const valueSize = Math.max(26, Math.min(56, h * 0.1, w * 0.06));
    const small = valueSize * 0.26;
    const [, mm, dd] = d.date.split('-');
    const week = days.slice(Math.max(0, i - 6), i + 1).reduce((a, x) => a + x.count, 0);
    const cols = [
      ['♥ CONTRIBUTIONS', String(d.count), `${MONTHS[Number(mm) - 1].toUpperCase()} ${Number(dd)}`, line],
      ['7-DAY PULSE', String(week), 'LAST 7 DAYS', theme.text],
      ['STREAK', `${streakAt(i)}d`, 'IN A ROW', theme.text],
    ];
    const colW = Math.min(w / 3, valueSize * 3);
    const top = Math.max(pad, h * 0.06);
    g.textAlign = 'center';
    g.textBaseline = 'top';
    cols.forEach(([label, value, sub, color], k) => {
      const cx = w / 2 + (k - 1) * colW;
      g.fillStyle = theme.label;
      g.font = `600 ${small}px ${FONT}`;
      g.fillText(label, cx, top);
      g.fillStyle = color;
      g.font = `700 ${valueSize}px ${FONT}`;
      g.fillText(value, cx, top + small * 1.5);
      g.fillStyle = theme.label;
      g.font = `600 ${small}px ${FONT}`;
      g.fillText(sub, cx, top + small * 1.5 + valueSize * 1.05);
    });
    if (ctx.opts.title) {
      g.textBaseline = 'bottom';
      g.textAlign = 'left';
      g.fillText(`${ctx.opts.user || 'sample'} · ${d.date.slice(0, 4)}`.toUpperCase(), pad, h - pad);
    }
  }

  return {
    is2d: true,
    resize(width, height) {
      w = width;
      h = height;
      const dpr = Math.min(devicePixelRatio || 1, 2);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    },
    update(now) {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      if (now < followUntil) {
        cursor = Math.min(beatDay + 0.999, cursor + dt * followSpeed); // glide between song steps
      } else if (ctx.opts.autoRotate) {
        const speed = DAYS_PER_SECOND * Math.max(0.2, Math.abs(ctx.opts.rotateSpeed) / 0.8);
        cursor = (cursor + dt * speed) % days.length;
      }
      draw();
    },
    pickPx(x) {
      const d = dayAt(x);
      return d === null || d < 0 || d >= days.length ? -1 : Math.floor(d);
    },
    setHover(i) {
      hovered = i;
    },
    /** Song playback drives the monitor. */
    setHighlight(i) {
      if (i < 0) return;
      const now = performance.now();
      if (lastBeat && now - lastBeat < 1000) followSpeed = 1000 / (now - lastBeat);
      lastBeat = now;
      beatDay = i;
      cursor = i;
      followUntil = now + 600;
    },
    setShadows() {},
    setOptions() {}, // reads ctx.opts live
  };
}
