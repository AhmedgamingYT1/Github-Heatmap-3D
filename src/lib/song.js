// Turns a year of contributions into a song. Every user gets a different one:
//   key + scale + chord progression come from the username,
//   tempo from how much they shipped that year,
//   and each day is one 8th note: busy days play melody, hats and drums;
//   quiet stretches fall back to soft pads and the odd bell.
// Plays live with WebAudio and renders to a WAV file — no samples, all synthesized.

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const SCALES = [
  ['major', [0, 2, 4, 5, 7, 9, 11]],
  ['minor', [0, 2, 3, 5, 7, 8, 10]],
  ['dorian', [0, 2, 3, 5, 7, 9, 10]],
  ['lydian', [0, 2, 4, 6, 7, 9, 11]],
  ['mixolydian', [0, 2, 4, 5, 7, 9, 10]],
];
// chord roots as scale degrees, one chord per two bars
const PROGRESSIONS = [
  [0, 5, 3, 4],
  [0, 3, 4, 3],
  [0, 4, 5, 3],
  [5, 3, 0, 4],
  [0, 2, 3, 4],
];
const MELODY_STEPS = [0, 2, 4, 7, 4, 2, 1]; // by weekday, Sun..Sat

const mtof = (m) => 440 * 2 ** ((m - 69) / 12);

function strHash(s) {
  let h = 2166136261;
  for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}

/** Works out every note of the song. Pure data — nothing plays yet. */
export function composeSong(days, user = '') {
  const year = days[0].date.slice(0, 4);
  const seed = strHash(`${user || 'sample'}:${year}`);
  const [scaleName, scale] = SCALES[seed % SCALES.length];
  const root = 45 + ((seed >>> 4) % 12); // bass root between A2 and G#3
  const prog = PROGRESSIONS[(seed >>> 8) % PROGRESSIONS.length];
  const total = days.reduce((a, d) => a + d.count, 0);
  const bpm = Math.round(86 + Math.min(1, total / 2500) * 40);
  const stepDur = 60 / bpm / 2; // 8th notes

  const deg2midi = (deg) => root + 12 * Math.floor(deg / 7) + scale[((deg % 7) + 7) % 7];
  const month = (d) => Number(d.date.slice(5, 7)) - 1;
  const monthTotals = Array(12).fill(0);
  days.forEach((d) => (monthTotals[month(d)] += d.count));
  const monthMax = Math.max(1, ...monthTotals);
  const dow = (i) => (new Date(days[0].date + 'T00:00:00Z').getUTCDay() + i) % 7;

  const byStep = days.map(() => []);
  const add = (i, ev) => byStep[i].push(ev);

  days.forEach((d, i) => {
    const intensity = monthTotals[month(d)] / monthMax;
    const chord = prog[Math.floor(i / 16) % prog.length];
    const weekTotal = days.slice(i - (i % 7), i - (i % 7) + 7).reduce((a, x) => a + x.count, 0);

    // pads every two bars: always there, louder in busy months, so quiet seasons stay ambient
    if (i % 16 === 0) add(i, { type: 'pad', notes: [0, 2, 4].map((k) => deg2midi(chord + k) + 12), vel: 0.1 + 0.2 * intensity, len: 16 });

    if (d.count > 0) {
      const high = d.level >= 3;
      const deg = chord + (high ? [7, 9, 11][dow(i) % 3] : MELODY_STEPS[dow(i)]);
      const restNext = !days[i + 1]?.count;
      add(i, { type: 'melody', midi: deg2midi(deg) + 24, vel: 0.35 + 0.15 * d.level, len: restNext ? 2 : 1 });
      add(i, { type: 'hat', vel: 0.15 + 0.07 * d.level });
      if (d.level === 4) add(i, { type: 'bell', midi: deg2midi(chord + 14) + 24, vel: 0.25 });
    } else if (intensity < 0.15 && i % 8 === 6) {
      add(i, { type: 'bell', midi: deg2midi(chord + 4) + 24, vel: 0.12 });
    }
    if (i % 2 === 0 && intensity > 0.03) add(i, { type: 'bass', midi: deg2midi(chord) - 12 + (i % 8 === 6 ? 12 : 0), vel: 0.35 + 0.3 * intensity, len: 2 });
    if (i % 4 === 0 && weekTotal > 0) add(i, { type: 'kick', vel: 0.5 + 0.4 * intensity });
    if (i % 8 === 4 && intensity > 0.25) add(i, { type: 'snare', vel: 0.25 + 0.3 * intensity });
  });
  // final chord
  const end = days.length;
  byStep[end] = [
    { type: 'pad', notes: [0, 2, 4, 7].map((k) => deg2midi(k) + 12), vel: 0.3, len: 16 },
    { type: 'bell', midi: deg2midi(7) + 24, vel: 0.3 },
    { type: 'bass', midi: deg2midi(0) - 12, vel: 0.5, len: 8 },
  ];

  const mood = bpm < 98 ? 'Slow Burn' : bpm < 114 ? 'Steady Groove' : 'Full Sprint';
  const busiest = ['Winter', 'Winter', 'Spring', 'Spring', 'Spring', 'Summer', 'Summer', 'Summer', 'Autumn', 'Autumn', 'Autumn', 'Winter'][
    monthTotals.indexOf(Math.max(...monthTotals))
  ];
  return {
    title: `${busiest} ${mood}`,
    artist: user || 'sample',
    key: `${NOTE_NAMES[root % 12]} ${scaleName}`,
    bpm,
    stepDur,
    steps: days.length,
    byStep,
    duration: (days.length + 8) * stepDur,
  };
}

// ---------- synthesis ----------
function impulse(ac, seconds) {
  const len = Math.floor(ac.sampleRate * seconds);
  const buf = ac.createBuffer(2, len, ac.sampleRate);
  for (let c = 0; c < 2; c++) {
    const data = buf.getChannelData(c);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3;
  }
  return buf;
}

function makeVoices(ac, out, stepDur) {
  const comp = ac.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.connect(out);
  const master = ac.createGain();
  master.gain.value = 0.8;
  master.connect(comp);

  const reverb = ac.createConvolver();
  reverb.buffer = impulse(ac, 1.8);
  const wet = ac.createGain();
  wet.gain.value = 0.3;
  reverb.connect(wet).connect(comp);

  const delay = ac.createDelay(2);
  delay.delayTime.value = stepDur * 3;
  const feedback = ac.createGain();
  feedback.gain.value = 0.28;
  const delayOut = ac.createGain();
  delayOut.gain.value = 0.22;
  delay.connect(feedback).connect(delay);
  delay.connect(delayOut).connect(master);

  const noise = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
  const nd = noise.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;

  function env(t, peak, attack, hold, release) {
    const g = ac.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + attack);
    g.gain.setValueAtTime(peak, t + attack + hold);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + hold + release);
    return g;
  }
  function osc(type, freq, t, stop, detune = 0) {
    const o = ac.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    o.detune.value = detune;
    o.start(t);
    o.stop(stop);
    return o;
  }
  function noiseSrc(t, stop) {
    const s = ac.createBufferSource();
    s.buffer = noise;
    s.start(t);
    s.stop(stop);
    return s;
  }
  const send = (node, amount) => {
    const g = ac.createGain();
    g.gain.value = amount;
    node.connect(g).connect(reverb);
  };

  return {
    melody(t, { midi, vel, len }) {
      const dur = len * stepDur;
      const g = env(t, vel * 0.22, 0.008, dur * 0.4, 0.35);
      osc('triangle', mtof(midi), t, t + dur + 0.4).connect(g);
      const shimmer = ac.createGain();
      shimmer.gain.value = 0.25;
      osc('sine', mtof(midi + 12), t, t + dur + 0.4).connect(shimmer).connect(g);
      g.connect(master);
      g.connect(delay);
      send(g, 0.5);
    },
    bass(t, { midi, vel, len }) {
      const dur = len * stepDur;
      const lp = ac.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 380;
      const g = env(t, vel * 0.3, 0.01, dur * 0.6, 0.12);
      osc('sawtooth', mtof(midi), t, t + dur + 0.2).connect(lp).connect(g).connect(master);
    },
    pad(t, { notes, vel, len }) {
      const dur = len * stepDur;
      const lp = ac.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 1100;
      const g = env(t, vel * 0.12, 0.8, Math.max(0, dur - 0.8), 1.2);
      for (const n of notes) for (const d of [-8, 8]) osc('sawtooth', mtof(n), t, t + dur + 1.3, d).connect(lp);
      lp.connect(g).connect(master);
      send(g, 0.8);
    },
    bell(t, { midi, vel }) {
      const g = env(t, vel * 0.18, 0.005, 0, 1.4);
      osc('sine', mtof(midi), t, t + 1.5).connect(g);
      const partial = ac.createGain();
      partial.gain.value = 0.3;
      osc('sine', mtof(midi) * 2.76, t, t + 1.5).connect(partial).connect(g);
      g.connect(master);
      send(g, 0.9);
    },
    kick(t, { vel }) {
      const o = osc('sine', 140, t, t + 0.4);
      o.frequency.setValueAtTime(140, t);
      o.frequency.exponentialRampToValueAtTime(42, t + 0.14);
      o.connect(env(t, vel * 0.9, 0.002, 0.02, 0.32)).connect(master);
    },
    snare(t, { vel }) {
      const hp = ac.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 1400;
      const g = env(t, vel * 0.35, 0.002, 0.01, 0.17);
      noiseSrc(t, t + 0.25).connect(hp).connect(g).connect(master);
      send(g, 0.4);
    },
    hat(t, { vel }) {
      const hp = ac.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 7500;
      noiseSrc(t, t + 0.08).connect(hp).connect(env(t, vel * 0.22, 0.001, 0.005, 0.045)).connect(master);
    },
  };
}

function scheduleStep(voices, song, n, t) {
  for (const ev of song.byStep[n] ?? []) voices[ev.type](t, ev);
}

/** Live playback with play / pause / seek, calling onStep(dayIndex) as it goes. */
export function createSongPlayer(song, { onStep = () => {}, onEnd = () => {}, onState = () => {} } = {}) {
  let ac = null;
  let bus = null;
  let voices = null;
  let playing = false;
  let position = 0; // in steps, while paused
  let startStep = 0;
  let startTime = 0;
  let nextStep = 0;
  let timer = 0;
  let raf = 0;
  let lastReported = -1;

  const timeOf = (n) => startTime + (n - startStep) * song.stepDur;
  const now = () => (playing ? startStep + (ac.currentTime - startTime) / song.stepDur : position);

  function tick() {
    while (nextStep <= song.steps && timeOf(nextStep) < ac.currentTime + 0.25) {
      scheduleStep(voices, song, nextStep, Math.max(timeOf(nextStep), ac.currentTime));
      nextStep++;
    }
  }

  function frame() {
    const p = now();
    const step = Math.floor(p);
    if (step !== lastReported && step >= 0 && step < song.steps) {
      lastReported = step;
      onStep(step);
    }
    if (p >= song.steps + 6) {
      stop(0);
      onEnd();
      return;
    }
    raf = requestAnimationFrame(frame);
  }

  function stop(to) {
    if (playing) {
      const g = bus;
      g.gain.setTargetAtTime(0, ac.currentTime, 0.03);
      setTimeout(() => g.disconnect(), 400); // let notes already scheduled fade out silently
    }
    clearInterval(timer);
    cancelAnimationFrame(raf);
    playing = false;
    position = to;
    lastReported = -1;
    onState(false);
  }

  return {
    song,
    get playing() {
      return playing;
    },
    get position() {
      return now();
    },
    async play(from = position >= song.steps ? 0 : position) {
      if (playing) return;
      const AC = window.AudioContext || window.webkitAudioContext;
      ac ||= new AC();
      await ac.resume();
      bus = ac.createGain();
      bus.connect(ac.destination);
      voices = makeVoices(ac, bus, song.stepDur);
      startStep = nextStep = Math.floor(from);
      startTime = ac.currentTime + 0.08;
      playing = true;
      onState(true);
      tick();
      timer = setInterval(tick, 50);
      frame();
    },
    pause() {
      if (playing) stop(now());
    },
    seek(step) {
      const was = playing;
      stop(Math.max(0, Math.min(song.steps - 1, step)));
      if (was) this.play(position);
    },
    destroy() {
      stop(0);
      ac?.close();
    },
  };
}

/** Renders the whole song offline into a WAV file. */
export async function renderSongWav(song) {
  const rate = 44100;
  const ac = new OfflineAudioContext(2, Math.ceil((song.duration + 2) * rate), rate);
  const voices = makeVoices(ac, ac.destination, song.stepDur);
  for (let n = 0; n <= song.steps; n++) scheduleStep(voices, song, n, 0.05 + n * song.stepDur);
  return encodeWav(await ac.startRendering());
}

function encodeWav(buffer) {
  const ch = buffer.numberOfChannels;
  const len = buffer.length;
  const out = new DataView(new ArrayBuffer(44 + len * ch * 2));
  const str = (o, s) => [...s].forEach((c, i) => out.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF');
  out.setUint32(4, 36 + len * ch * 2, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  out.setUint32(16, 16, true);
  out.setUint16(20, 1, true); // PCM
  out.setUint16(22, ch, true);
  out.setUint32(24, buffer.sampleRate, true);
  out.setUint32(28, buffer.sampleRate * ch * 2, true);
  out.setUint16(32, ch * 2, true);
  out.setUint16(34, 16, true);
  str(36, 'data');
  out.setUint32(40, len * ch * 2, true);
  const data = [...Array(ch)].map((_, c) => buffer.getChannelData(c));
  let o = 44;
  for (let i = 0; i < len; i++) {
    for (let c = 0; c < ch; c++) {
      const s = Math.max(-1, Math.min(1, data[c][i]));
      out.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      o += 2;
    }
  }
  return new Blob([out], { type: 'audio/wav' });
}
