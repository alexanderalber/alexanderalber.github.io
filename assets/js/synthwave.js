/* synthwave.js: endless generative cyberpunk synthwave in the browser.
   Web Audio only, no dependencies, classic script (works over file://).

   Cyberpunk synthwave: 118 BPM, D minor, pulsing
   analog bass under a sidechained mix, soft arpeggios, wide reverb, distant
   rain and city ambience, koto and shakuhachi accents.

   Two layers:
   - pure (Composer): seeded arrangement and note events per bar. No Web Audio,
     runs in Node (module.exports), tested by synthwave.test.mjs.
   - audio (Engine): turns a bar of events into scheduled Web Audio nodes on
     any BaseAudioContext, so the same code plays live and renders offline.

   Global API (window.Synthwave):
     start({seed, intensity, biome, rain, volume, bpm})   (call from a user gesture)
     stop(), pause(), resume(), playing()
     setIntensity(0..1), setBiome('open'|'menger'|'shaft'), setRain(bool),
     setVolume(0..1), setBpm(n)
     onBar = function (bar, time) {}       UI hook, fired when a bar starts
     analyser()                            AnalyserNode on the master
     render(seconds, opts) -> Promise<AudioBuffer>   offline, same music
     toWav(audioBuffer) -> ArrayBuffer      16-bit PCM
*/
(function (root) {
'use strict';

/* ---------------------------------------------------------------- pure layer */

function rng(seed) {                       // mulberry32
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hash(a, b) {
  let h = Math.imul((a >>> 0) ^ 0x9e3779b9, 0x85ebca6b);
  h ^= Math.imul((b >>> 0) + 0x632be5ab, 0xc2b2ae35);
  h ^= h >>> 13;
  return Math.imul(h, 0x27d4eb2f) >>> 0;
}
const pick = (r, a) => a[Math.floor(r() * a.length)];
function wpick(r, items) {                 // [[value, weight], ...]
  let s = 0;
  for (const it of items) s += it[1];
  let x = r() * s;
  for (const it of items) { x -= it[1]; if (x <= 0) return it[0]; }
  return items[items.length - 1][0];
}
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

const TONIC = 50;                          // D3
const MINOR = [0, 2, 3, 5, 7, 8, 10];      // aeolian
const PENTA = [0, 3, 5, 7, 10];            // D F G A C, for koto and shakuhachi
const CHORD_NAMES = ['Dm', 'E°', 'F', 'Gm', 'Am', 'B♭', 'C'];

/* Scale degree (0 = tonic, may be negative or > 6) to MIDI. */
function deg(d, base) {
  const o = Math.floor(d / 7);
  return base + 12 * o + MINOR[((d % 7) + 7) % 7];
}
function pent(i, base) {
  const o = Math.floor(i / 5);
  return base + 12 * o + PENTA[((i % 5) + 5) % 5];
}

/* Four-bar progressions in scale degrees. From the bass line of the reference:
   D, B-flat, C, A and G roots, the tonic most of the time. */
const PROGS = [
  [0, 5, 6, 0], [0, 5, 6, 4], [0, 6, 5, 6], [5, 6, 0, 0],
  [0, 4, 5, 6], [0, 3, 5, 6], [0, 5, 3, 4], [5, 3, 0, 6], [0, 0, 5, 6]
];

/* Section lengths in bars. Eight bars are 16.3 s at 118 BPM. */
const SECTION_BARS = { intro: 8, build: 8, groove: 16, peak: 16, breakdown: 8 };

/* Bass rhythms over 16 sixteenths: 0 rest, 1 root, 2 octave up, 3 fifth. */
const BASS_PATS = [
  [1,1,1,1, 1,1,1,1, 1,1,1,1, 1,1,1,1],
  [1,1,2,1, 1,1,2,1, 1,1,2,1, 1,1,2,1],
  [0,1,1,1, 0,1,1,1, 0,1,1,1, 0,1,1,2],
  [1,1,1,1, 1,1,3,1, 1,1,1,1, 1,2,1,3],
  [1,0,1,1, 1,0,1,1, 1,0,1,1, 1,0,2,1]
];

/* Arpeggio shapes as chord-tone indices into ARP_DEG (0 root, 1 third, 2 fifth, 3 octave ...). */
const ARP_DEG = [0, 2, 4, 7, 9, 11, 14];
function makeArp(r) {
  const shapes = [
    [0, 1, 2, 3], [0, 1, 2, 3, 4, 3, 2, 1], [0, 2, 1, 3], [0, 2, 3, 1, 4, 2, 3, 5],
    [3, 2, 1, 0], [0, 3, 1, 4, 2, 5, 1, 3]
  ];
  let shape = pick(r, shapes);
  if (r() < 0.35) {                          // a seeded free figure
    shape = [];
    let k = Math.floor(r() * 3);
    for (let i = 0; i < 8; i++) { shape.push(k); k = clamp(k + pick(r, [-2, -1, 1, 1, 2]), 0, 5); }
  }
  return { shape, rate: r() < 0.7 ? 1 : 2 };  // 1 = sixteenths, 2 = eighths
}

/* Lead motif: two bars on an eighth grid, as scale-degree offsets from the
   chord root, chord tones on the strong eighths. */
function makeMotif(r) {
  const notes = [];
  let pos = Math.floor(r() * 2);
  let off = pick(r, [2, 4, 7]);
  while (pos < 16) {
    const len = wpick(r, [[1, 3], [2, 4], [3, 2], [4, 2], [6, 1]]);
    const strong = pos % 2 === 0;
    if (strong) off = pick(r, [0, 2, 4, 7, 9].filter(o => Math.abs(o - off) <= 4).concat([off]));
    else off = clamp(off + pick(r, [-1, 1, -2, 2]), -1, 10);
    if (r() < 0.85) notes.push({ s: pos * 2, l: Math.min(len, 16 - pos) * 2, o: off });
    pos += len + (r() < 0.25 ? 1 : 0);
  }
  return notes;
}

function Composer(seed) {
  this.seed = (seed >>> 0) || 1;
  this.secIndex = -1;
  this.prog = null;
  this.sec = null;
  this.barCount = 0;
}

/* What follows a finished section. Intensity (0..1, set by the game) biases
   the arrangement: high skips breakdowns, low avoids the peak. */
Composer.prototype.nextType = function (prev, r, k) {
  switch (prev) {
    case null: return 'intro';
    case 'intro': return 'build';
    case 'build': return k > 0.8 && r() < 0.6 ? 'peak' : 'groove';
    case 'groove': return wpick(r, [['peak', 0.3 + k], ['groove', 0.25], ['breakdown', 1.1 - k]]);
    case 'peak': return wpick(r, [['breakdown', 1.2 - k], ['groove', 0.3 + 0.5 * k], ['peak', 0.15 * k]]);
    case 'breakdown': return wpick(r, [['build', 1], ['groove', 0.25 * k]]);
  }
  return 'groove';
};

Composer.prototype.newSection = function (k) {
  const idx = ++this.secIndex;
  const r = rng(hash(this.seed, idx));
  const type = this.nextType(this.sec ? this.sec.type : null, r, k);
  // the same progression comes back often: that is what makes it loop-like
  const p1 = this.prog && r() < 0.55 ? this.prog : pick(r, PROGS);
  const p2 = r() < 0.6 ? p1 : pick(r, PROGS);
  this.prog = p1;
  this.sec = {
    type, idx, r, bars: SECTION_BARS[type], bar: 0,
    prog: p1.concat(p2),
    bass: pick(r, BASS_PATS),
    arp: makeArp(r),
    motifs: [makeMotif(r), makeMotif(r)]
  };
};

/* One bar: {type, secBar, bars, secIndex, chord, chordName, bright, events}.
   Event: {v: voice, s: start in sixteenths, l: length in sixteenths,
           n: MIDI note or array, g: gain 0..1, ...voice extras}. */
Composer.prototype.nextBar = function (intensity) {
  const k = clamp(intensity == null ? 0.6 : intensity, 0, 1);
  if (!this.sec || this.sec.bar >= this.sec.bars) this.newSection(k);
  const S = this.sec, r = S.r, b = S.bar, n = S.bars, type = S.type;
  const chord = S.prog[b % 8];
  const ev = [];
  const add = (v, s, l, note, g, x) => ev.push(Object.assign({ v, s, l, n: note, g }, x || {}));

  // brightness drives the filters: build opens up, breakdown closes
  let bright = { intro: 0.2 + 0.15 * b / n, build: 0.3 + 0.5 * b / n, groove: 0.65,
                 peak: 0.9, breakdown: 0.3 }[type];
  bright = clamp(bright * (0.75 + 0.4 * k), 0, 1);

  // pad: the chord voiced into D3..A#4, nine and seven colours in quiet parts
  const tones = [0, 2, 4];
  if (type === 'breakdown' || type === 'intro') tones.push(r() < 0.5 ? 6 : 8);
  const pad = tones.map(t => {
    let m = deg(chord + t, TONIC);
    while (m < 53) m += 12;
    while (m > 70) m -= 12;
    return m;
  }).sort((a, c) => a - c);
  add('pad', 0, 16, pad, type === 'peak' ? 0.8 : 1);

  const root = deg(chord, TONIC - 12);     // bass register D2
  const drums = type === 'groove' || type === 'peak' || (type === 'build' && b >= 4 && k > 0.3);
  const last = b === n - 1;

  // drums
  if (drums) for (let s = 0; s < 16; s += 4) add('kick', s, 1, 0, 1);
  if (type === 'groove' || type === 'peak') {
    add('snare', 4, 1, 0, 0.9);
    add('snare', 12, 1, 0, 0.9);
    if (b === 0) add('crash', 0, 32, 0, type === 'peak' ? 1 : 0.7);
    if (b % 8 === 7) for (let s = 13; s < 16; s++) add('snare', s, 1, 0, 0.3 + 0.12 * (s - 12));
  }
  if (type === 'build' && last) for (let s = 0; s < 16; s += s < 8 ? 2 : 1) add('snare', s, 1, 0, 0.25 + 0.6 * s / 16);
  if (type === 'build' && b === n - 2) add('riser', 0, 32, 0, 0.8);
  if (type === 'build' || type === 'groove' || type === 'peak' || (type === 'breakdown' && k > 0.75)) {
    for (let s = 0; s < 16; s++) {
      const off = s % 4 === 2;
      if (type === 'peak' && off) { add('hat', s, 1, 0, 0.7, { open: true }); continue; }
      if (off) add('hat', s, 1, 0, type === 'breakdown' ? 0.35 : 0.65);
      else if (s % 2 === 1 && (type === 'peak' || r() < 0.25 + 0.5 * k)) add('hat', s, 1, 0, 0.25 + 0.15 * r());
    }
    if (type === 'groove' && b % 2 === 1) add('hat', 14, 1, 0, 0.5, { open: true });
  }

  // bass: the pulsing sequence, or long roots when the kick is out
  if (type === 'groove' || type === 'peak' || type === 'build') {
    for (let s = 0; s < 16; s++) {
      const p = S.bass[s];
      if (!p) continue;
      const note = p === 2 ? root + 12 : p === 3 ? root + 7 : root;
      add('bass', s, 0.75, note, s % 4 === 0 ? 1 : s % 2 ? 0.8 : 0.9);
    }
  } else if (type === 'breakdown' || (type === 'intro' && b >= 4)) {
    add('bassLong', 0, 16, root, type === 'intro' ? 0.6 : 0.8);
  }

  // arpeggio
  if (type !== 'intro' || b >= 2) {
    const A = S.arp, step = A.rate;
    const g = type === 'peak' ? 0.75 : type === 'breakdown' ? 0.55 : 0.65;
    for (let s = 0, i = 0; s < 16; s += step, i++) {
      const t = A.shape[i % A.shape.length];
      let m = deg(chord + ARP_DEG[t], TONIC + 12);
      if (m > 81) m -= 12;
      add('arp', s, step * 0.9, m, g * (s % 4 === 0 ? 1 : 0.75), { pan: i % 2 ? 0.45 : -0.45 });
    }
  }

  // lead: motif A A A B per eight bars, only in the peak (and late grooves)
  if (type === 'peak' || (type === 'groove' && b >= 8 && k > 0.5)) {
    const pair = Math.floor((b % 8) / 2);
    const M = S.motifs[pair === 3 ? 1 : 0];
    const half = b % 2;
    for (const m of M) {
      if (Math.floor(m.s / 16) !== half) continue;
      let note = deg(chord + m.o, TONIC + 12);
      while (note > 84) note -= 12;
      add('lead', m.s % 16, m.l, note, 0.8);
    }
  }

  // koto: sparse pentatonic plucks, a grace note now and then, a press-bend
  const kotoP = { intro: 0.7, build: 0.35, groove: 0.3, peak: 0.15, breakdown: 0.55 }[type];
  if (r() < kotoP) {
    let s = pick(r, [0, 2, 3, 6, 8, 10]);
    let i = 5 + Math.floor(r() * 6);        // D4 .. D5 and a bit above
    const count = 2 + Math.floor(r() * 4);
    for (let c = 0; c < count && s < 16; c++) {
      const note = pent(i, TONIC);
      if (r() < 0.25 && s > 0) add('koto', s - 0.5, 0.5, pent(i + 1, TONIC), 0.35);
      const next = pent(i + 1, TONIC) - note;
      add('koto', s, 4, note, 0.6 + 0.3 * r(), c === count - 1 && next <= 2 && r() < 0.5 ? { bend: next } : null);
      s += pick(r, [1, 2, 2, 3, 4]);
      i = clamp(i + pick(r, [-2, -1, -1, 1, 1, 2]), 3, 12);
    }
  }

  // shakuhachi: long breathy notes, mostly in breakdowns and the intro
  const shakP = { intro: b >= 4 ? 0.45 : 0, build: 0, groove: 0.08, peak: 0.12, breakdown: 0.8 }[type];
  if (b % 2 === 0 && r() < shakP) {
    let s = pick(r, [0, 2, 4, 8]);
    let i = 5 + Math.floor(r() * 4);
    const count = 1 + Math.floor(r() * 3);
    for (let c = 0; c < count && s < 28; c++) {
      const l = pick(r, [6, 8, 10, 12, 16]);
      add('shak', s, Math.min(l, 32 - s), pent(i, TONIC + 12), 0.8);
      s += l + pick(r, [1, 2, 2]);
      i = clamp(i + pick(r, [-1, -1, 1, 1, 2, -2]), 3, 10);
    }
  }

  // distant siren, very rare
  if (r() < 0.03) add('siren', 0, 64, 0, 1, { f: 520 + 300 * r() });

  S.bar++;
  this.barCount++;
  return { type, secBar: b, bars: n, secIndex: S.idx, chord, chordName: CHORD_NAMES[chord],
           bright, events: ev };
};

/* --------------------------------------------------------------- audio layer */

const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
const BIOMES = {
  open:   { lp: 18000, rev: 0.32, fb: 0.36, rain: 1,   city: 1 },
  menger: { lp: 6500,  rev: 0.42, fb: 0.46, rain: 0.6, city: 0.7 },
  shaft:  { lp: 1300,  rev: 0.75, fb: 0.30, rain: 0,   city: 0.35 }
};

function Engine(ctx, opts) {
  opts = opts || {};
  this.ctx = ctx;
  this.ar = rng(hash(opts.seed || 1, 0xa0d10));
  this.bpm = opts.bpm || 118;
  this.kotoCache = {};
  const c = ctx, sr = c.sampleRate;

  // shared buffers
  this.noise = c.createBuffer(1, sr * 2, sr);
  const nd = this.noise.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = this.ar() * 2 - 1;

  // master chain: mix -> biome lowpass -> glue compressor -> limiter -> volume
  this.out = c.createGain();
  this.out.gain.value = opts.volume == null ? 0.8 : opts.volume;
  this.out.connect(c.destination);
  const limiter = c.createDynamicsCompressor();
  limiter.threshold.value = -3; limiter.knee.value = 0; limiter.ratio.value = 20;
  limiter.attack.value = 0.002; limiter.release.value = 0.1;
  limiter.connect(this.out);
  const glue = c.createDynamicsCompressor();
  glue.threshold.value = -16; glue.knee.value = 8; glue.ratio.value = 3;
  glue.attack.value = 0.01; glue.release.value = 0.2;
  glue.connect(limiter);
  this.biomeLp = c.createBiquadFilter();
  this.biomeLp.type = 'lowpass'; this.biomeLp.frequency.value = 18000; this.biomeLp.Q.value = 0.5;
  this.biomeLp.connect(glue);
  this.mix = c.createGain();
  this.mix.gain.value = 0.7;
  this.mix.connect(this.biomeLp);

  this.drums = c.createGain(); this.drums.gain.value = 0.9; this.drums.connect(this.mix);
  this.duck = c.createGain(); this.duck.connect(this.mix);         // sidechained music bus
  this.music = c.createGain(); this.music.gain.value = 0.8; this.music.connect(this.duck);
  this.free = c.createGain(); this.free.gain.value = 0.8; this.free.connect(this.mix); // koto, shakuhachi

  // wide reverb from a generated stereo impulse response
  this.revIn = c.createGain();
  const conv = c.createConvolver();
  conv.buffer = this.impulse(3.6, 0.025);
  this.revOut = c.createGain(); this.revOut.gain.value = 0.32;
  const revHp = c.createBiquadFilter(); revHp.type = 'highpass'; revHp.frequency.value = 180;
  this.revIn.connect(revHp).connect(conv).connect(this.revOut).connect(this.duck);

  // ping-pong delay, dotted eighth
  this.dlyIn = c.createGain();
  this.dlyL = c.createDelay(2); this.dlyR = c.createDelay(2);
  this.dlyFb = c.createGain(); this.dlyFb.gain.value = 0.36;
  const dlyLp = c.createBiquadFilter(); dlyLp.type = 'lowpass'; dlyLp.frequency.value = 3200;
  const merge = c.createChannelMerger(2);
  const dlyOut = c.createGain(); dlyOut.gain.value = 0.45;
  this.dlyIn.connect(this.dlyL);
  this.dlyL.connect(merge, 0, 0);
  this.dlyL.connect(this.dlyR);
  this.dlyR.connect(merge, 0, 1);
  this.dlyR.connect(dlyLp).connect(this.dlyFb).connect(this.dlyL);
  merge.connect(dlyOut).connect(this.duck);
  dlyOut.connect(this.revIn);
  this.setBpm(this.bpm, 0);

  // ambience: rain and city rumble, endless loops
  this.amb = c.createGain(); this.amb.connect(this.mix);
  this.rainGain = c.createGain(); this.rainGain.connect(this.amb);
  this.cityGain = c.createGain(); this.cityGain.connect(this.amb);
  const rain = c.createBufferSource(); rain.buffer = this.rainBuffer(7); rain.loop = true;
  const rainHp = c.createBiquadFilter(); rainHp.type = 'highpass'; rainHp.frequency.value = 400;
  const rainLp = c.createBiquadFilter(); rainLp.type = 'lowpass'; rainLp.frequency.value = 7500;
  rain.connect(rainHp).connect(rainLp).connect(this.rainGain);
  const city = c.createBufferSource(); city.buffer = this.brownBuffer(9); city.loop = true;
  const cityLp = c.createBiquadFilter(); cityLp.type = 'lowpass'; cityLp.frequency.value = 160;
  city.connect(cityLp).connect(this.cityGain);
  rain.start(0); city.start(0);
  this.sources = [rain, city];
  this.bassV = this.makeBass();
  this.arpV = [this.makeArp(-0.45), this.makeArp(0.45)];

  this.only = opts.only || null;                        // diagnostics: render some voices only
  this.rain = !!opts.rain;
  this.biome = BIOMES[opts.biome] ? opts.biome : 'open';
  this.applyEnv(0);
}

Engine.prototype.setBpm = function (bpm, at) {
  this.bpm = clamp(bpm, 70, 160);
  const t = at == null ? this.ctx.currentTime : at;
  const d = 0.75 * 60 / this.bpm;
  this.dlyL.delayTime.setTargetAtTime(d, t, 0.05);
  this.dlyR.delayTime.setTargetAtTime(d, t, 0.05);
};
Engine.prototype.stepDur = function () { return 60 / this.bpm / 4; };

/* Biome and weather as smooth parameter moves. */
Engine.prototype.applyEnv = function (tau) {
  const B = BIOMES[this.biome], t = this.ctx.currentTime, k = tau == null ? 0.8 : tau || 0.001;
  this.biomeLp.frequency.setTargetAtTime(B.lp, t, k);
  this.revOut.gain.setTargetAtTime(B.rev, t, k);
  this.dlyFb.gain.setTargetAtTime(B.fb, t, k);
  const amb = !this.only || this.only.includes('amb') ? 1 : 0;
  this.rainGain.gain.setTargetAtTime(amb * (this.rain ? 0.55 : 0.12) * B.rain, t, k * 2);
  this.cityGain.gain.setTargetAtTime(amb * 0.035 * B.city, t, k * 2);
};

Engine.prototype.impulse = function (secs, pre) {
  const c = this.ctx, sr = c.sampleRate, len = Math.floor(sr * secs), p = Math.floor(sr * pre);
  const buf = c.createBuffer(2, len, sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let y = 0;
    for (let i = p; i < len; i++) {
      const x = (i - p) / sr;
      const a = 0.65 * Math.exp(-x * 1.3) + 0.08;          // the tail gets darker
      y += a * ((this.ar() * 2 - 1) - y);
      d[i] = y * Math.exp(-6.9 * x / secs);
    }
  }
  return buf;
};

Engine.prototype.rainBuffer = function (secs) {
  const c = this.ctx, sr = c.sampleRate, len = Math.floor(sr * secs);
  const buf = c.createBuffer(2, len, sr), fade = Math.floor(sr * 0.25);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < len; i++) {                        // pink-ish bed
      const w = this.ar() * 2 - 1;
      b0 = 0.997 * b0 + 0.029591 * w; b1 = 0.985 * b1 + 0.032534 * w; b2 = 0.95 * b2 + 0.048056 * w;
      d[i] = (b0 + b1 + b2 + 0.1 * w) * 0.9;
    }
    const drops = Math.floor(secs * 90);                   // droplets
    for (let k = 0; k < drops; k++) {
      const at = Math.floor(this.ar() * (len - 400)), amp = 0.05 + 0.25 * this.ar() ** 3;
      const f = 2 * Math.PI * (1500 + 4000 * this.ar()) / sr;
      for (let j = 0; j < 300; j++) d[at + j] += amp * Math.sin(f * j) * Math.exp(-j / 45);
    }
    for (let i = 0; i < fade; i++) {                       // seamless loop
      const a = i / fade;
      d[i] = d[i] * a + d[len - fade + i] * (1 - a);
    }
  }
  return this.trim(buf, fade);
};

Engine.prototype.brownBuffer = function (secs) {
  const c = this.ctx, sr = c.sampleRate, len = Math.floor(sr * secs);
  const buf = c.createBuffer(2, len, sr), fade = Math.floor(sr * 0.5);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let y = 0;
    for (let i = 0; i < len; i++) { y = 0.996 * y + 0.06 * (this.ar() * 2 - 1); d[i] = y; }
    for (let i = 0; i < fade; i++) { const a = i / fade; d[i] = d[i] * a + d[len - fade + i] * (1 - a); }
  }
  return this.trim(buf, fade);
};

/* Drop the tail that was crossfaded into the head. */
Engine.prototype.trim = function (buf, tail) {
  const c = this.ctx, len = buf.length - tail;
  const out = c.createBuffer(buf.numberOfChannels, len, buf.sampleRate);
  for (let ch = 0; ch < buf.numberOfChannels; ch++) out.getChannelData(ch).set(buf.getChannelData(ch).subarray(0, len));
  return out;
};

/* helpers */
Engine.prototype.send = function (node, rev, dly) {
  const c = this.ctx;
  if (rev) { const g = c.createGain(); g.gain.value = rev; node.connect(g).connect(this.revIn); }
  if (dly) { const g = c.createGain(); g.gain.value = dly; node.connect(g).connect(this.dlyIn); }
};
Engine.prototype.noiseSrc = function (t, dur) {
  const s = this.ctx.createBufferSource();
  s.buffer = this.noise; s.loop = true;
  s.start(t, this.ar() * 1.5); s.stop(t + dur);
  return s;
};
Engine.prototype.filter = function (type, f, q) {
  const n = this.ctx.createBiquadFilter();
  n.type = type; n.frequency.value = f; if (q != null) n.Q.value = q;
  return n;
};
/* Percussive envelope: instant attack, exponential decay with time constant tau. */
Engine.prototype.hit = function (t, g, tau, attack) {
  const a = this.ctx.createGain(), p = a.gain;
  p.setValueAtTime(0, t);
  p.linearRampToValueAtTime(g, t + (attack || 0.002));
  p.setTargetAtTime(0, t + (attack || 0.002), tau);
  return a;
};
/* Sustained envelope: linear attack, hold, exponential release from t + len. */
Engine.prototype.adsr = function (t, g, attack, len, rel) {
  const a = this.ctx.createGain(), p = a.gain;
  p.setValueAtTime(0, t);
  p.linearRampToValueAtTime(g, t + Math.min(attack, len));
  p.setValueAtTime(g, t + len);
  p.setTargetAtTime(0, t + len, rel);
  return a;
};
Engine.prototype.osc = function (type, f, detune, t, end) {
  const o = this.ctx.createOscillator();
  o.type = type; o.frequency.value = f; if (detune) o.detune.value = detune;
  o.start(t); o.stop(end);
  return o;
};

/* ------------------------------------------------------------------ voices */

Engine.prototype.kick = function (t, g) {
  const c = this.ctx, o = this.osc('sine', 160, 0, t, t + 0.9);
  o.frequency.setValueAtTime(165, t);
  o.frequency.exponentialRampToValueAtTime(55, t + 0.06);
  o.frequency.exponentialRampToValueAtTime(43, t + 0.45);
  const a = this.hit(t, 0.55 * g, 0.16);
  const sat = c.createWaveShaper();
  sat.curve = this.satCurve || (this.satCurve = (() => {
    const n = 1024, cv = new Float32Array(n);
    for (let i = 0; i < n; i++) { const x = i / (n - 1) * 2 - 1; cv[i] = Math.tanh(1.8 * x) / Math.tanh(1.8); }
    return cv;
  })());
  o.connect(a).connect(sat).connect(this.drums);
  const n = this.noiseSrc(t, 0.03), hp = this.filter('highpass', 3000);
  n.connect(hp).connect(this.hit(t, 0.12 * g, 0.004)).connect(this.drums);
  // sidechain: the whole music bus dips and swells back
  const d = this.duck.gain;
  d.setValueAtTime(1, t);
  d.linearRampToValueAtTime(0.35, t + 0.008);
  d.setTargetAtTime(1, t + 0.03, 0.1);
};

Engine.prototype.snare = function (t, g) {
  g *= 2.2;
  const body = this.osc('triangle', 190, 0, t, t + 0.3);
  body.frequency.setValueAtTime(200, t);
  body.frequency.exponentialRampToValueAtTime(150, t + 0.1);
  body.connect(this.hit(t, 0.35 * g, 0.045)).connect(this.drums);
  const n = this.noiseSrc(t, 0.6), bp = this.filter('bandpass', 1700, 0.6), hp = this.filter('highpass', 500);
  const a = this.hit(t, 0.55 * g, 0.075);
  n.connect(bp).connect(hp).connect(a).connect(this.drums);
  // clap layer: three quick bursts, then a tail
  const n2 = this.noiseSrc(t, 0.6), bp2 = this.filter('bandpass', 1150, 1.4);
  const ca = this.ctx.createGain(), p = ca.gain;
  p.setValueAtTime(0, t);
  for (let k = 0; k < 3; k++) {
    p.setValueAtTime(0.5 * g, t + k * 0.011);
    p.setTargetAtTime(0, t + k * 0.011 + 0.001, 0.004);
  }
  p.setValueAtTime(0.4 * g, t + 0.034);
  p.setTargetAtTime(0, t + 0.035, 0.08);
  n2.connect(bp2).connect(ca).connect(this.drums);
  this.send(a, 0.35 * g); this.send(ca, 0.5 * g);
};

Engine.prototype.hat = function (t, g, open) {
  const n = this.noiseSrc(t, open ? 0.6 : 0.15), hp = this.filter('highpass', 7500), pk = this.filter('peaking', 10500, 1.2);
  pk.gain.value = 5;
  const a = this.hit(t, 0.6 * g, open ? 0.09 : 0.018);
  const pan = this.ctx.createStereoPanner(); pan.pan.value = open ? -0.15 : 0.2;
  n.connect(hp).connect(pk).connect(a).connect(pan).connect(this.drums);
  if (open) this.send(a, 0.15);
};

Engine.prototype.crash = function (t, g, dur) {
  const n = this.noiseSrc(t, 3.5), hp = this.filter('highpass', 4500);
  const a = this.hit(t, 0.16 * g, 0.7);
  n.connect(hp).connect(a).connect(this.mix);
  this.send(a, 0.5);
  const boom = this.osc('sine', 60, 0, t, t + 1.6);
  boom.frequency.setValueAtTime(70, t);
  boom.frequency.exponentialRampToValueAtTime(38, t + 1.2);
  boom.connect(this.hit(t, 0.55 * g, 0.35)).connect(this.drums);
};

Engine.prototype.riser = function (t, g, dur) {
  const n = this.noiseSrc(t, dur + 0.1), bp = this.filter('bandpass', 300, 3);
  bp.frequency.setValueAtTime(250, t);
  bp.frequency.exponentialRampToValueAtTime(7000, t + dur);
  const a = this.ctx.createGain();
  a.gain.setValueAtTime(0, t);
  a.gain.linearRampToValueAtTime(0.22 * g, t + dur * 0.97);
  a.gain.linearRampToValueAtTime(0, t + dur);
  n.connect(bp).connect(a).connect(this.mix);
  this.send(a, 0.6);
};

/* Bass and arpeggio are persistent monophonic voices: oscillators that run all
   the time and get re-gated per note. Fresh nodes for every sixteenth cost far
   more render time. setTargetAtTime keeps every gate change continuous. */
Engine.prototype.makeBass = function () {
  const c = this.ctx;
  const o1 = c.createOscillator(), o2 = c.createOscillator(), sub = c.createOscillator();
  o1.type = o2.type = 'sawtooth'; o1.detune.value = -7; o2.detune.value = 7; sub.type = 'sine';
  const lp = this.filter('lowpass', 200, 6), mixg = c.createGain(), subg = c.createGain(), amp = c.createGain();
  mixg.gain.value = 0.32; subg.gain.value = 0.55; amp.gain.value = 0;
  o1.connect(mixg); o2.connect(mixg); mixg.connect(lp); sub.connect(subg);
  lp.connect(amp); subg.connect(amp); amp.connect(this.music);
  const oscs = [o1, o2, sub];
  for (const o of oscs) { o.start(0); this.sources.push(o); }
  return { oscs, lp, amp };
};

Engine.prototype.bass = function (t, note, len, g, bright, long) {
  const B = this.bassV, f = mtof(note), base = 120 + 700 * bright;
  for (const o of B.oscs) o.frequency.setValueAtTime(f, t);
  B.lp.Q.setValueAtTime(long ? 2 : 6, t);
  B.lp.frequency.setTargetAtTime(base + (long ? 400 : 1600) * bright * g, t, 0.002);
  B.lp.frequency.setTargetAtTime(base, t + 0.008, long ? 0.6 : 0.055);
  B.amp.gain.setTargetAtTime(0.3 * g, t, long ? 0.03 : 0.001);
  B.amp.gain.setTargetAtTime(0, t + len, long ? 0.3 : 0.018);
};

Engine.prototype.pad = function (t, notes, len, g, bright) {
  const c = this.ctx, end = t + len + 3;
  const lp = this.filter('lowpass', 500, 0.8);
  const f0 = 600 + 3800 * bright;
  lp.frequency.setValueAtTime(f0, t);
  lp.frequency.linearRampToValueAtTime(f0 * 1.5, t + len * 0.6);
  lp.frequency.linearRampToValueAtTime(f0, t + len + 1);
  const a = this.adsr(t, 0.1 * g, 0.8, len, 0.7);
  for (const [dt, pan] of [[-13, -0.7], [0, 0], [12, 0.7]]) {      // three detuned layers, spread
    const p = c.createStereoPanner(); p.pan.value = pan;
    p.connect(lp);
    for (const n of notes) this.osc('sawtooth', mtof(n), dt + (this.ar() - 0.5) * 4, t, end).connect(p);
  }
  lp.connect(a).connect(this.music);
  this.send(a, 0.7);
};

/* Two arp voices, left and right, take turns: each note rings for two steps. */
Engine.prototype.makeArp = function (pan) {
  const c = this.ctx, o = c.createOscillator(), o2 = c.createOscillator();
  o.type = 'sawtooth'; o2.type = 'square'; o2.detune.value = 6;
  const og = c.createGain(); og.gain.value = 0.35;
  const lp = this.filter('lowpass', 800, 2.5), amp = c.createGain(), p = c.createStereoPanner();
  amp.gain.value = 0; p.pan.value = pan;
  o.connect(lp); o2.connect(og).connect(lp);
  lp.connect(amp).connect(p).connect(this.music);
  this.send(p, 0.25, 0.45);
  const oscs = [o, o2];
  for (const x of oscs) { x.start(0); this.sources.push(x); }
  return { oscs, lp, amp };
};

Engine.prototype.arp = function (t, note, len, g, bright, pan) {
  const V = this.arpV[pan < 0 ? 0 : 1], f = mtof(note), base = 700 + 3000 * bright;
  for (const o of V.oscs) o.frequency.setValueAtTime(f, t);
  V.lp.frequency.setTargetAtTime(base + 1600, t, 0.002);
  V.lp.frequency.setTargetAtTime(base, t + 0.006, 0.06);
  V.amp.gain.setTargetAtTime(0.3 * g, t, 0.0015);
  V.amp.gain.setTargetAtTime(0, t + 0.006, 0.1);
};

Engine.prototype.lead = function (t, note, len, g, bright) {
  const c = this.ctx, f = mtof(note), end = t + len + 1;
  const o1 = this.osc('sawtooth', f, -8, t, end), o2 = this.osc('sawtooth', f, 8, t, end);
  const lfo = this.osc('sine', 5.3, 0, t, end), lg = c.createGain();
  lg.gain.setValueAtTime(0, t);
  lg.gain.linearRampToValueAtTime(14, t + Math.min(0.45, len + 0.1));
  lfo.connect(lg); lg.connect(o1.detune); lg.connect(o2.detune);
  const lp = this.filter('lowpass', 1500 + 2500 * bright, 1.5);
  o1.connect(lp); o2.connect(lp);
  const a = this.adsr(t, 0.13 * g, 0.03, len, 0.15);
  lp.connect(a).connect(this.music);
  this.send(a, 0.4, 0.4);
};

Engine.prototype.kotoBuffer = function (note) {
  if (this.kotoCache[note]) return this.kotoCache[note];
  const c = this.ctx, sr = c.sampleRate, f = mtof(note);
  const L = Math.max(2, Math.floor(sr / f - 0.5));
  const len = Math.floor(sr * 3.2), buf = c.createBuffer(1, len, sr), d = buf.getChannelData(0);
  const r = rng(note * 7919);
  const T60 = 2.6 - 0.02 * (note - 60);
  const rho = Math.pow(10, -3 / (T60 * f));
  const pick = Math.max(1, Math.round(L * 0.13));          // plucked near the bridge: twangy
  const ex = new Float32Array(L);
  let y = 0;
  for (let i = 0; i < L; i++) { y += 0.7 * ((r() * 2 - 1) - y); ex[i] = y; }
  for (let i = 0; i < L; i++) d[i] = ex[i] - (i >= pick ? ex[i - pick] : 0);
  const s = 0.32;                                          // less damping, more metal
  for (let i = L; i < len; i++) d[i] = rho * ((1 - s) * d[i - L] + s * d[i - L - 1 >= 0 ? i - L - 1 : 0]);
  let peak = 0;
  for (let i = 0; i < len; i++) peak = Math.max(peak, Math.abs(d[i]));
  for (let i = 0; i < len; i++) d[i] /= peak || 1;
  return (this.kotoCache[note] = { buf, rate: f / (sr / (L + s)) });
};

Engine.prototype.koto = function (t, note, g, bend) {
  const c = this.ctx, K = this.kotoBuffer(note);
  const s = c.createBufferSource();
  s.buffer = K.buf;
  s.playbackRate.setValueAtTime(K.rate, t);
  if (bend) {                                              // oshide: press the string behind the bridge
    s.playbackRate.setValueAtTime(K.rate, t + 0.28);
    s.playbackRate.linearRampToValueAtTime(K.rate * Math.pow(2, bend / 12), t + 0.42);
  }
  const body = this.filter('peaking', 750, 1.2); body.gain.value = 4;
  const hs = this.filter('highshelf', 4000); hs.gain.value = -4;
  const a = this.ctx.createGain(); a.gain.value = 0.8 * g;
  const p = c.createStereoPanner(); p.pan.value = 0.35;
  s.connect(body).connect(hs).connect(a).connect(p).connect(this.free);
  s.start(t); s.stop(t + 3.2);
  this.send(p, 0.35, 0.18);
};

Engine.prototype.shak = function (t, note, len, g) {
  const c = this.ctx, f = mtof(note), end = t + len + 1.2;
  const o = this.osc('sine', f, 0, t, end), o2 = this.osc('triangle', f, 0, t, end);
  for (const x of [o, o2]) {                               // meri: blown in from below
    x.frequency.setValueAtTime(f * 0.94, t);
    x.frequency.setTargetAtTime(f, t + 0.03, 0.07);
  }
  const lfo = this.osc('sine', 4.6, 0, t, end), lg = c.createGain();
  lg.gain.setValueAtTime(0, t);
  lg.gain.linearRampToValueAtTime(0, t + Math.min(0.5, len * 0.4));
  lg.gain.linearRampToValueAtTime(f * 0.014, t + len);
  lfo.connect(lg); lg.connect(o.frequency); lg.connect(o2.frequency);
  const tg = c.createGain(); tg.gain.value = 0.3; o2.connect(tg);
  const tone = c.createGain(), p = tone.gain;
  p.setValueAtTime(0, t);
  p.linearRampToValueAtTime(0.55, t + 0.14);
  p.linearRampToValueAtTime(0.8, t + Math.max(0.15, len * 0.7));
  p.setValueAtTime(0.8, t + len);
  p.setTargetAtTime(0, t + len, 0.12);
  o.connect(tone); tg.connect(tone);
  // breath: a chiff at the onset, then a thin hiss on the note
  const n = this.noiseSrc(t, len + 1), bp = this.filter('bandpass', f * 2, 0.9);
  const bg = c.createGain(), q = bg.gain;
  q.setValueAtTime(0, t);
  q.linearRampToValueAtTime(0.9, t + 0.035);
  q.setTargetAtTime(0.18, t + 0.04, 0.08);
  q.setValueAtTime(0.18, t + len);
  q.setTargetAtTime(0, t + len, 0.1);
  n.connect(bp).connect(bg);
  const lp = this.filter('lowpass', 3200, 0.7);
  tone.connect(lp); bg.connect(lp);
  const a = c.createGain(); a.gain.value = 0.32 * g;
  const pan = c.createStereoPanner(); pan.pan.value = -0.3;
  lp.connect(a).connect(pan).connect(this.free);
  this.send(pan, 0.6, 0.15);
};

Engine.prototype.siren = function (t, dur, f) {
  if (this.biome === 'shaft') return;
  const c = this.ctx, o = this.osc('triangle', f, 0, t, t + dur);
  const lfo = this.osc('sine', 0.22, 0, t, t + dur), lg = c.createGain(); lg.gain.value = f * 0.18;
  lfo.connect(lg).connect(o.frequency);
  const lp = this.filter('lowpass', 1100);
  const a = c.createGain(), p = a.gain;
  p.setValueAtTime(0, t);
  p.linearRampToValueAtTime(0.012, t + dur * 0.5);
  p.linearRampToValueAtTime(0, t + dur);
  const pan = c.createStereoPanner(); pan.pan.value = this.ar() * 1.6 - 0.8;
  o.connect(lp).connect(a).connect(pan).connect(this.amb);
  this.send(pan, 1.5);
};

/* Schedule one composed bar starting at t0. Returns the bar's duration. */
Engine.prototype.scheduleBar = function (bar, t0) {
  const sd = this.stepDur();
  for (const e of bar.events) {
    if (this.only && !this.only.includes(e.v)) continue;
    const t = t0 + e.s * sd, len = e.l * sd;
    switch (e.v) {
      case 'kick': this.kick(t, e.g); break;
      case 'snare': this.snare(t, e.g); break;
      case 'hat': this.hat(t, e.g, e.open); break;
      case 'crash': this.crash(t, e.g, len); break;
      case 'riser': this.riser(t, e.g, len); break;
      case 'bass': this.bass(t, e.n, len, e.g, bar.bright, false); break;
      case 'bassLong': this.bass(t, e.n, len, e.g, bar.bright, true); break;
      case 'pad': this.pad(t, e.n, len, e.g, bar.bright); break;
      case 'arp': this.arp(t, e.n, len, e.g, bar.bright, e.pan); break;
      case 'lead': this.lead(t, e.n, len, e.g, bar.bright); break;
      case 'koto': this.koto(t, e.n, e.g, e.bend); break;
      case 'shak': this.shak(t, e.n, len, e.g); break;
      case 'siren': this.siren(t, len, e.f); break;
    }
  }
  return 16 * sd;
};

/* ---------------------------------------------------------------- live player */

const Synthwave = {
  onBar: null,
  _s: null,

  start(opts) {
    if (this._s) this.stop();
    opts = Object.assign({ seed: 1, intensity: 0.6, biome: 'open', rain: false, volume: 0.8, bpm: 118 }, opts || {});
    const Ctx = root.AudioContext || root.webkitAudioContext;
    const ctx = this._ctx || (this._ctx = new Ctx({ latencyHint: 'playback' }));
    if (ctx.state === 'suspended') ctx.resume();
    const eng = new Engine(ctx, opts);
    const fadeIn = eng.out.gain;
    fadeIn.setValueAtTime(0, ctx.currentTime);
    fadeIn.linearRampToValueAtTime(opts.volume, ctx.currentTime + 1.5);
    const s = this._s = { ctx, eng, comp: new Composer(opts.seed), intensity: opts.intensity,
                          volume: opts.volume, next: ctx.currentTime + 0.1, timers: [] };
    const tick = () => {
      if (this._s !== s) return;
      const ahead = root.document && root.document.hidden ? 1.5 : 0.3;
      while (s.next < ctx.currentTime + ahead) {
        if (s.next < ctx.currentTime) s.next = ctx.currentTime + 0.05;   // after a stall: skip, don't pile up
        const bar = s.comp.nextBar(s.intensity), t0 = s.next;
        s.next += eng.scheduleBar(bar, t0);
        if (this.onBar) {
          const id = setTimeout(() => { if (this._s === s && this.onBar) this.onBar(bar, t0); },
                                Math.max(0, (t0 - ctx.currentTime) * 1000));
          s.timers.push(id);
          if (s.timers.length > 8) s.timers.shift();
        }
      }
    };
    s.interval = setInterval(tick, 50);
    tick();
  },

  stop() {
    const s = this._s;
    if (!s) return;
    this._s = null;
    clearInterval(s.interval);
    s.timers.forEach(clearTimeout);
    const t = s.ctx.currentTime, g = s.eng.out.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(0, t + 0.6);
    setTimeout(() => { s.eng.out.disconnect(); s.eng.sources.forEach(x => { try { x.stop(); } catch (e) {} }); }, 800);
  },

  pause() { if (this._ctx) this._ctx.suspend(); },
  resume() { if (this._ctx) this._ctx.resume(); },
  playing() { return !!this._s && this._ctx.state === 'running'; },

  setIntensity(x) { if (this._s) this._s.intensity = clamp(+x, 0, 1); },
  setBiome(b) { const s = this._s; if (s && BIOMES[b] && s.eng.biome !== b) { s.eng.biome = b; s.eng.applyEnv(); } },
  setRain(on) { const s = this._s; if (s && s.eng.rain !== !!on) { s.eng.rain = !!on; s.eng.applyEnv(); } },
  setBpm(b) { if (this._s) this._s.eng.setBpm(+b); },
  setVolume(v) {
    const s = this._s;
    if (!s) return;
    s.volume = clamp(+v, 0, 1);
    s.eng.out.gain.setTargetAtTime(s.volume, s.ctx.currentTime, 0.05);
  },

  analyser() {
    const s = this._s;
    if (!s) return null;
    if (!s.analyser) {
      s.analyser = s.ctx.createAnalyser();
      s.analyser.fftSize = 2048;
      s.analyser.smoothingTimeConstant = 0.8;
      s.eng.out.connect(s.analyser);
    }
    return s.analyser;
  },

  render(seconds, opts) {
    opts = Object.assign({ seed: 1, intensity: 0.6, biome: 'open', rain: false, volume: 0.8, bpm: 118, sampleRate: 48000 }, opts || {});
    const ctx = new OfflineAudioContext(2, Math.ceil(opts.sampleRate * seconds), opts.sampleRate);
    const eng = new Engine(ctx, opts), comp = new Composer(opts.seed);
    // Schedule bar by bar as the render advances, like the live player does:
    // nodes created far ahead would all cost processing time from the start.
    const bars = [], q = 128 / opts.sampleRate;
    let next = 0.05;
    const feed = () => {
      while (next < ctx.currentTime + 0.5 && next < seconds) {
        const bar = comp.nextBar(opts.intensity);
        bars.push({ t: next, type: bar.type, chord: bar.chordName });
        next += eng.scheduleBar(bar, next);
      }
      const at = Math.ceil((next - 0.4) / q) * q;
      if (next < seconds && at < seconds) ctx.suspend(at).then(() => { feed(); ctx.resume(); });
    };
    feed();
    return ctx.startRendering().then(buf => { buf.bars = bars; return buf; });
  },

  toWav(buf) {
    const ch = buf.numberOfChannels, n = buf.length, out = new DataView(new ArrayBuffer(44 + n * ch * 2));
    const str = (o, s) => { for (let i = 0; i < s.length; i++) out.setUint8(o + i, s.charCodeAt(i)); };
    str(0, 'RIFF'); out.setUint32(4, 36 + n * ch * 2, true); str(8, 'WAVE'); str(12, 'fmt ');
    out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, ch, true);
    out.setUint32(24, buf.sampleRate, true); out.setUint32(28, buf.sampleRate * ch * 2, true);
    out.setUint16(32, ch * 2, true); out.setUint16(34, 16, true); str(36, 'data'); out.setUint32(40, n * ch * 2, true);
    const data = [];
    for (let c = 0; c < ch; c++) data.push(buf.getChannelData(c));
    let o = 44;
    for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++, o += 2) out.setInt16(o, clamp(data[c][i], -1, 1) * 32767, true);
    return out.buffer;
  },

  // pure layer, for tests and tools
  Engine, Composer, rng, deg, pent, PROGS, TONIC, MINOR, PENTA, CHORD_NAMES, SECTION_BARS
};

root.Synthwave = Synthwave;
if (typeof module !== 'undefined' && module.exports) module.exports = Synthwave;
})(typeof window !== 'undefined' ? window : globalThis);
