// Zero-asset synthesized Web Audio sound effects & cozy café rain ambience.

let ctx = null;
let enabled = localStorage.getItem("cafe-sfx") !== "0";
let rainOn = false;
let rainNode = null;
let rainGain = null;

function ensureCtx() {
  if (!ctx) {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;
    ctx = new AudioCtx();
  }
  if (ctx.state === "suspended") {
    ctx.resume().catch(() => {});
  }
  return ctx;
}

export function isSoundEnabled() {
  return enabled;
}

export function setSoundEnabled(on) {
  enabled = !!on;
  localStorage.setItem("cafe-sfx", enabled ? "1" : "0");
  if (!enabled && rainOn) {
    setRainEnabled(false);
  }
}

export function isRainEnabled() {
  return rainOn;
}

export function setRainEnabled(on) {
  rainOn = !!on;
  if (!rainOn) {
    if (rainGain && ctx) {
      rainGain.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.12);
      const oldNode = rainNode;
      setTimeout(() => {
        try {
          oldNode?.stop();
          oldNode?.disconnect();
        } catch {}
      }, 400);
    }
    rainNode = null;
    rainGain = null;
    return;
  }
  const ac = ensureCtx();
  if (!ac) return;
  // Soft filtered brown-noise rain on café windows
  const length = ac.sampleRate * 3;
  const buf = ac.createBuffer(1, length, ac.sampleRate);
  const data = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < length; i++) {
    const white = Math.random() * 2 - 1;
    last = (last + 0.02 * white) / 1.02;
    data[i] = last * 2.8;
  }
  const src = ac.createBufferSource();
  src.buffer = buf;
  src.loop = true;

  const filter = ac.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = 620;
  filter.Q.value = 0.55;

  const gain = ac.createGain();
  gain.gain.value = 0.001;
  gain.gain.setTargetAtTime(0.07, ac.currentTime, 0.35);

  src.connect(filter).connect(gain).connect(ac.destination);
  src.start();
  rainNode = src;
  rainGain = gain;
}

// Crisp wooden fish "tok!" with subtle organic pitch drift
export function playWoodblock(volume = 0.28) {
  if (!enabled) return;
  const ac = ensureCtx();
  if (!ac) return;
  const now = ac.currentTime;
  const pitch = 520 + (Math.random() - 0.5) * 34;

  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(pitch * 1.45, now);
  osc.frequency.exponentialRampToValueAtTime(pitch, now + 0.028);

  gain.gain.setValueAtTime(0.001, now);
  gain.gain.linearRampToValueAtTime(volume, now + 0.004);
  gain.gain.exponentialRampToValueAtTime(0.0008, now + 0.11);

  const overtone = ac.createOscillator();
  const ogain = ac.createGain();
  overtone.type = "sine";
  overtone.frequency.setValueAtTime(pitch * 2.4, now);
  ogain.gain.setValueAtTime(volume * 0.32, now);
  ogain.gain.exponentialRampToValueAtTime(0.0008, now + 0.055);

  osc.connect(gain).connect(ac.destination);
  overtone.connect(ogain).connect(ac.destination);
  osc.start(now);
  overtone.start(now);
  osc.stop(now + 0.12);
  overtone.stop(now + 0.07);
}

// Cozy counter bell "ding!" + celebratory chime for Shipped / Made $1
export function playBell() {
  if (!enabled) return;
  const ac = ensureCtx();
  if (!ac) return;
  const now = ac.currentTime;
  const freqs = [1046.5, 1318.5, 1568.0, 2093.0];
  freqs.forEach((f, idx) => {
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = "sine";
    const t0 = now + idx * 0.065;
    osc.frequency.setValueAtTime(f, t0);
    gain.gain.setValueAtTime(0.001, t0);
    gain.gain.linearRampToValueAtTime(0.14 / (1 + idx * 0.25), t0 + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0008, t0 + 0.85);
    osc.connect(gain).connect(ac.destination);
    osc.start(t0);
    osc.stop(t0 + 0.9);
  });
}

// Soft pixel firework pop
export function playPop() {
  if (!enabled) return;
  const ac = ensureCtx();
  if (!ac) return;
  const now = ac.currentTime;
  const len = Math.floor(ac.sampleRate * 0.09);
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const ch = buf.getChannelData(0);
  for (let i = 0; i < len; i++) {
    ch[i] = (Math.random() * 2 - 1) * Math.exp(-i / (len * 0.25));
  }
  const src = ac.createBufferSource();
  src.buffer = buf;
  const filter = ac.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = 900 + Math.random() * 700;
  const gain = ac.createGain();
  gain.gain.value = 0.11;
  src.connect(filter).connect(gain).connect(ac.destination);
  src.start(now);
}

// Coffee cup toss whoosh + ceramic clink
export function playCoffeeToss() {
  if (!enabled) return;
  const ac = ensureCtx();
  if (!ac) return;
  const now = ac.currentTime;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(360, now);
  osc.frequency.exponentialRampToValueAtTime(760, now + 0.12);
  gain.gain.setValueAtTime(0.001, now);
  gain.gain.linearRampToValueAtTime(0.09, now + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
  osc.connect(gain).connect(ac.destination);
  osc.start(now);
  osc.stop(now + 0.15);

  // Subtle mug clink on landing
  const clink = ac.createOscillator();
  const cgain = ac.createGain();
  clink.type = "triangle";
  const t1 = now + 0.42;
  clink.frequency.setValueAtTime(1780, t1);
  clink.frequency.exponentialRampToValueAtTime(1420, t1 + 0.07);
  cgain.gain.setValueAtTime(0.001, t1);
  cgain.gain.linearRampToValueAtTime(0.1, t1 + 0.006);
  cgain.gain.exponentialRampToValueAtTime(0.0008, t1 + 0.09);
  clink.connect(cgain).connect(ac.destination);
  clink.start(t1);
  clink.stop(t1 + 0.1);
}

// Dramatic yet playful two-tone SOS ping
export function playSos() {
  if (!enabled) return;
  const ac = ensureCtx();
  if (!ac) return;
  const now = ac.currentTime;
  [587.33, 440, 587.33].forEach((f, i) => {
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = "sawtooth";
    const filter = ac.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 1100;
    const t0 = now + i * 0.12;
    osc.frequency.setValueAtTime(f, t0);
    gain.gain.setValueAtTime(0.001, t0);
    gain.gain.linearRampToValueAtTime(0.08, t0 + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.11);
    osc.connect(filter).connect(gain).connect(ac.destination);
    osc.start(t0);
    osc.stop(t0 + 0.12);
  });
}

export function playSoftClick() {
  if (!enabled) return;
  const ac = ensureCtx();
  if (!ac) return;
  const now = ac.currentTime;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(660, now);
  osc.frequency.exponentialRampToValueAtTime(480, now + 0.035);
  gain.gain.setValueAtTime(0.06, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
  osc.connect(gain).connect(ac.destination);
  osc.start(now);
  osc.stop(now + 0.045);
}
