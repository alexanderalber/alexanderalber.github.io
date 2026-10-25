/* synthwave.js: endless generative cyberpunk synthwave in the browser.
   Web Audio only, no dependencies, classic script (works over file://).

   Modelled on "Neon Rain, Tokyo Drift" (Suno): 118 BPM, D minor, pulsing
   analog bass under a sidechained mix, soft arpeggios, wide reverb, distant
   rain and city ambience, koto and shakuhachi accents.

   Two layers:
   - pure (Composer): seeded arrangement and note events per bar. No Web Audio,
     runs in Node (module.exports), tested by synthwave.test.mjs.
   - audio (Engine): turns a bar of events into scheduled Web Audio nodes on
     any BaseAudioContext, so the same code plays live and renders offline.

   Variation: every seed gets a palette (key, tempo, waveforms, pluck, hat
   pattern, motif density, share of the two optional sections). A named
   variant ('classic', 'dark', 'bright', 'drift') pins some of those fields,
   the seed still fills in the rest. 'auto' (default) is fully seeded.

   Global API (window.Synthwave):
     start({seed, intensity, biome, rain, volume, bpm, variant})   (call from a user gesture)
       bpm omitted or null: the palette's tempo
     stop(), pause(), resume(), playing()
     setIntensity(0..1), setRain(bool),
     setBiome(name, mix)   name 'open'|'menger'|'shaft'|'block'; mix 0..1
       (default 1) blends from 'open' towards it, so a page can fade by depth
       instead of switching at a threshold. Going in settles with ENV_TAU.in,
       coming out with the slower ENV_TAU.out.
     setVolume(0..1, tau)   tau: time constant in s, default 0.05
     setBpm(n)              setBpm(null) hands the tempo back to the palette
     setVariant(name, {now, next, seed})   takes effect at the next section;
       now: at the next bar instead, next: the type of the section it opens,
       seed: draw the palette from this seed (start({paletteSeed}) likewise)
     setCalm(bool)          from the next section on, only drift and breakdown
                            (no drums); start({calm: true}) begins that way
     swap(opts, {gap, fadeIn})   a new piece: the running one fades out over
                            gap s and is dropped with its reverb and echo
                            tails, the new one (start opts, plus opening:
                            the first section type) fades in over fadeIn s.
                            SWAP holds the defaults.
     start({tonic}) and setVariant(name, {tonic}) pin the key of the palette
                            (hikyaku: the menu's drift in the race's key)
     impact(k)              a collision of strength 0..1: the music ducks and
                            darkens at once, and a hit in key lands on the
                            next sixteenth (IMPACT holds the constants)
     palette(seed, variant) -> the palette object, VARIANTS: the names
     onBar = function (bar, time) {}       UI hook, fired when a bar starts
     analyser()                            AnalyserNode on the master
     render(seconds, opts) -> Promise<AudioBuffer>   offline, same music;
       opts.switchVariant + opts.switchAt (s) switch the variant mid-render
       (opts.switchNow, opts.switchNext as in setVariant), opts.env:
       [[t, biome, mix], ...] environment moves at t (s), opts.impacts:
       [[t, k], ...] collisions at t
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

const TONIC = 50;                          // D3, the reference key
const MINOR = [0, 2, 3, 5, 7, 8, 10];      // aeolian
const PENTA = [0, 3, 5, 7, 10];            // D F G A C, for koto and shakuhachi
const CHORD_NAMES = ['Dm', 'E°', 'F', 'Gm', 'Am', 'B♭', 'C'];
const NOTE_NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
/* Chord name in a transposed key: the degree's quality stays, the root moves. */
function chordName(degree, tonic) {
  const q = CHORD_NAMES[degree].replace(/^[A-G][♭♯]?/, '');
  return NOTE_NAMES[(deg(degree, tonic) % 12 + 12) % 12] + q;
}

/* ------------------------------------------------------------------ palette
   The per-seed character. Named variants pin some fields, the rest is seeded. */
const VARIANTS = {
  auto:    {},
  classic: { tonic: 50, bpm: 118, bassWave: 'sawtooth', leadWave: 'sawtooth', arpWave: 'sawtooth',
             padWave: 'sawtooth', pluck: 'koto', hats: 'off8', half: 0, drift: 0.1 },
  dark:    { tonic: [46, 47, 48], bpm: [110, 114], bassWave: 'square', leadWave: 'square',
             padWave: 'sawtooth', hats: 'sparse', half: 0.5, drift: 0.15, motif: 'sparse' },
  bright:  { tonic: [50, 52, 53], bpm: [121, 126], arpWave: 'triangle', leadWave: 'sawtooth',
             padWave: 'triangle', hats: '16', half: 0, drift: 0.05, motif: 'busy' },
  drift:   { bpm: [106, 114], half: 0.2, drift: 0.6, pluck: 'soft', hats: 'sparse', motif: 'sparse' }
};
function makePalette(seed, variant, tonic) {
  const r = rng(hash(seed >>> 0 || 1, 0x9a1e77e));
  const V = VARIANTS[variant] || VARIANTS.auto;
  const pin = (key, draw) => {
    const v = V[key];
    if (v == null) return draw();
    if (Array.isArray(v)) return v.length === 2 && typeof v[0] === 'number' && key === 'bpm'
      ? v[0] + Math.floor(r() * (v[1] - v[0] + 1)) : pick(r, v);
    return v;
  };
  // draw in a fixed order so a pinned field does not reshuffle the others
  const p = {
    variant: VARIANTS[variant] ? variant : 'auto',
    tonic: pin('tonic', () => wpick(r, [[50, 4], [48, 2], [49, 1], [47, 2], [46, 1], [52, 1], [53, 1]])),
    bpm: pin('bpm', () => 110 + Math.floor(r() * 15)),
    bassWave: pin('bassWave', () => wpick(r, [['sawtooth', 3], ['square', 2], ['triangle', 1]])),
    leadWave: pin('leadWave', () => wpick(r, [['sawtooth', 3], ['square', 2], ['triangle', 1]])),
    arpWave: pin('arpWave', () => wpick(r, [['sawtooth', 3], ['square', 2], ['triangle', 2]])),
    padWave: pin('padWave', () => wpick(r, [['sawtooth', 3], ['square', 1], ['triangle', 1]])),
    pluck: pin('pluck', () => wpick(r, [['koto', 0.65], ['soft', 0.35]])),
    hats: pin('hats', () => wpick(r, [['off8', 0.5], ['16', 0.3], ['sparse', 0.2]])),
    motif: pin('motif', () => wpick(r, [['busy', 0.5], ['sparse', 0.5]])),
    half: pin('half', () => r() < 0.4 ? 0 : 0.15 + 0.3 * r()),
    drift: pin('drift', () => r() < 0.3 ? 0 : 0.1 + 0.3 * r())
  };
  if (tonic != null && tonic >= 40 && tonic <= 60) p.tonic = Math.round(tonic);   // pinned from outside, after the draws
  p.key = NOTE_NAMES[p.tonic % 12] + 'm';
  p.seed = seed >>> 0 || 1;
  p.id = [p.tonic, p.bassWave, p.leadWave, p.arpWave, p.padWave, p.pluck].join('/');  // what the engine must rebuild for
  return p;
}

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
  [0, 4, 5, 6], [0, 3, 5, 6], [0, 5, 3, 4], [5, 3, 0, 6], [0, 0, 5, 6],
  [0, 2, 5, 6], [0, 3, 4, 0], [5, 2, 6, 0], [0, 6, 3, 5], [3, 5, 0, 4], [0, 2, 3, 6]
];

/* Section lengths in bars. Eight bars are 16.3 s at 118 BPM.
   half: halftime, kick and snare at half speed, the bass in eighths.
   drift: no drums, no pulsing bass, arpeggio and pad carry the time. */
const SECTION_BARS = { intro: 8, build: 8, groove: 16, peak: 16, breakdown: 8, half: 8, drift: 8 };

/* Bass rhythms over 16 sixteenths: 0 rest, 1 root, 2 octave up, 3 fifth. */
const BASS_PATS = [
  [1,1,1,1, 1,1,1,1, 1,1,1,1, 1,1,1,1],
  [1,1,2,1, 1,1,2,1, 1,1,2,1, 1,1,2,1],
  [0,1,1,1, 0,1,1,1, 0,1,1,1, 0,1,1,2],
  [1,1,1,1, 1,1,3,1, 1,1,1,1, 1,2,1,3],
  [1,0,1,1, 1,0,1,1, 1,0,1,1, 1,0,2,1],
  [1,0,0,1, 0,0,1,0, 1,0,0,1, 0,0,2,0],
  [1,1,0,1, 1,0,1,1, 0,1,1,0, 1,1,3,1],
  [1,1,1,2, 1,1,1,2, 1,1,1,2, 1,3,1,2]
];

/* Arpeggio shapes as chord-tone indices into ARP_DEG (0 root, 1 third, 2 fifth, 3 octave ...). */
const ARP_DEG = [0, 2, 4, 7, 9, 11, 14];
function makeArp(r) {
  const shapes = [
    [0, 1, 2, 3], [0, 1, 2, 3, 4, 3, 2, 1], [0, 2, 1, 3], [0, 2, 3, 1, 4, 2, 3, 5],
    [3, 2, 1, 0], [0, 3, 1, 4, 2, 5, 1, 3],
    [0, 3, 2, 4], [0, 1, 3, 2, 4, 3, 5, 4], [2, 0, 3, 1], [0, 4, 2, 5, 1, 4, 3, 5]
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
function makeMotif(r, density) {
  const sparse = density === 'sparse';
  const notes = [];
  let pos = Math.floor(r() * 2);
  let off = pick(r, [2, 4, 7]);
  while (pos < 16) {
    const len = sparse ? wpick(r, [[2, 2], [3, 2], [4, 3], [6, 2], [8, 1]])
                       : wpick(r, [[1, 4], [2, 4], [3, 1], [4, 1]]);
    const strong = pos % 2 === 0;
    if (strong) off = pick(r, [0, 2, 4, 7, 9].filter(o => Math.abs(o - off) <= 4).concat([off]));
    else off = clamp(off + pick(r, [-1, 1, -2, 2]), -1, 10);
    if (r() < 0.85) notes.push({ s: pos * 2, l: Math.min(len, 16 - pos) * 2, o: off });
    pos += len + (r() < (sparse ? 0.35 : 0.15) ? 1 : 0);
  }
  return notes;
}

function Composer(seed, variant) {
  this.seed = (seed >>> 0) || 1;
  this.secIndex = -1;
  this.prog = null;
  this.sec = null;
  this.barCount = 0;
  this.pal = makePalette(this.seed, variant);
  this.pendingPal = null;
  this.cut = null;                         // true or a section type: end the section after this bar
  this.calm = false;                       // only sections without drums (a menu, a pause)
}

/* Calm (2026-10-26, hikyaku's menu): after the intro only drift and
   breakdown, so no kick and no pulsing bass ever comes in. The arpeggio
   in eighths stays the one pulse. */
const CALM = { intro: 1, drift: 1, breakdown: 1 };

/* A new variant takes effect with the next section, so the key does not jump
   mid-phrase. o.now cuts the running section after the current bar (a race
   start should not wait up to 32 s); o.next names the type of the section
   the new variant opens with ('build' brings a riser and a snare roll).
   o.seed draws the palette from another seed than the notes (hikyaku: the
   route's seed, so every route has its own sound), o.tonic pins its key.
   A cut section opens on the tonic chord, so the step from the old
   section's last chord is a cadence in the shared key, not a jump. */
Composer.prototype.setVariant = function (variant, o) {
  const p = makePalette(o && o.seed != null ? o.seed : this.seed, variant, o && o.tonic);
  this.cut = null;
  if (p.variant === this.pal.variant && p.seed === this.pal.seed && p.id === this.pal.id) { this.pendingPal = null; return; }
  this.pendingPal = p;
  if (o && o.now && this.sec) this.cut = SECTION_BARS[o.next] ? o.next : true;
};

/* What follows a finished section. Intensity (0..1, set by the game) biases
   the arrangement: high skips breakdowns, low avoids the peak. The palette
   adds its share of halftime and drift sections. */
Composer.prototype.nextType = function (prev, r, k) {
  const P = this.pal;
  switch (prev) {
    case null: return 'intro';
    case 'intro': return 'build';
    case 'build': return k > 0.8 && r() < 0.6 ? 'peak' : 'groove';
    case 'groove': return wpick(r, [['peak', 0.3 + k], ['groove', 0.25], ['breakdown', 1.1 - k],
                                    ['half', 0.8 * P.half], ['drift', 0.8 * P.drift * (1 - k)]]);
    case 'peak': return wpick(r, [['breakdown', 1.2 - k], ['groove', 0.3 + 0.5 * k], ['peak', 0.15 * k],
                                  ['half', 0.6 * P.half]]);
    case 'breakdown': return wpick(r, [['build', 1], ['groove', 0.25 * k], ['drift', 0.5 * P.drift]]);
    case 'half': return wpick(r, [['groove', 1], ['peak', 0.4 * k], ['breakdown', 0.4 * (1 - k)]]);
    case 'drift': return wpick(r, [['build', 0.6], ['groove', 0.4 + 0.3 * k], ['breakdown', 0.2]]);
  }
  return 'groove';
};

Composer.prototype.newSection = function (k) {
  if (this.pendingPal) { this.pal = this.pendingPal; this.pendingPal = null; }
  const forced = typeof this.cut === 'string' ? this.cut : null;
  this.cut = null;
  const idx = ++this.secIndex;
  const r = rng(hash(this.seed, idx));
  let type = forced || this.nextType(this.sec ? this.sec.type : null, r, k);
  if (this.calm && !CALM[type]) type = this.sec && this.sec.type === 'drift' ? 'breakdown' : 'drift';
  // the same progression comes back often: that is what makes it loop-like
  const p1 = forced ? pick(r, PROGS.filter(q => q[0] === 0))
    : this.prog && r() < 0.55 ? this.prog : pick(r, PROGS);
  const p2 = r() < 0.6 ? p1 : pick(r, PROGS);
  this.prog = p1;
  this.sec = {
    type, idx, r, bars: SECTION_BARS[type], bar: 0,
    prog: p1.concat(p2),
    bass: pick(r, BASS_PATS),
    arp: makeArp(r),
    motifs: [makeMotif(r, this.pal.motif), makeMotif(r, this.pal.motif)]
  };
};

/* One bar: {type, secBar, bars, secIndex, chord, chordName, bright, events}.
   Event: {v: voice, s: start in sixteenths, l: length in sixteenths,
           n: MIDI note or array, g: gain 0..1, ...voice extras}. */
Composer.prototype.nextBar = function (intensity) {
  const k = clamp(intensity == null ? 0.6 : intensity, 0, 1);
  if (!this.sec || this.sec.bar >= this.sec.bars || this.cut) this.newSection(k);
  const S = this.sec, r = S.r, b = S.bar, n = S.bars, type = S.type, P = this.pal, T = P.tonic;
  const chord = S.prog[b % 8];
  const ev = [];
  const add = (v, s, l, note, g, x) => ev.push(Object.assign({ v, s, l, n: note, g }, x || {}));

  // brightness drives the filters: build opens up, breakdown closes
  let bright = { intro: 0.2 + 0.15 * b / n, build: 0.3 + 0.5 * b / n, groove: 0.65,
                 peak: 0.9, breakdown: 0.3, half: 0.55, drift: 0.4 }[type];
  bright = clamp(bright * (0.75 + 0.4 * k), 0, 1);

  // pad: the chord voiced into tonic+3 .. tonic+20 (D3..A#4 in D), nine and seven colours in quiet parts
  const quiet = type === 'breakdown' || type === 'intro' || type === 'drift';
  const tones = [0, 2, 4];
  if (quiet) tones.push(r() < 0.5 ? 6 : 8);
  const pad = tones.map(t => {
    let m = deg(chord + t, T);
    while (m < T + 3) m += 12;
    while (m > T + 20) m -= 12;
    return m;
  }).sort((a, c) => a - c);
  add('pad', 0, 16, pad, type === 'peak' ? 0.8 : 1);

  const root = deg(chord, T - 12);         // bass register, D2 in D
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
  if (type === 'half') {                   // halftime: kick on one, snare on three, a ghost kick
    add('kick', 0, 1, 0, 1);
    if (b % 2 === 1 || r() < 0.3) add('kick', 10, 1, 0, 0.7);
    add('snare', 8, 1, 0, 1);
    if (b === 0) add('crash', 0, 32, 0, 0.6);
    if (last) for (let s = 12; s < 16; s++) add('snare', s, 1, 0, 0.3 + 0.15 * (s - 12));
  }
  if (type === 'build' && last) for (let s = 0; s < 16; s += s < 8 ? 2 : 1) add('snare', s, 1, 0, 0.25 + 0.6 * s / 16);
  if (type === 'build' && b === n - 2) add('riser', 0, 32, 0, 0.8);
  if (type === 'drift' && last) add('riser', 0, 16, 0, 0.5);
  if (type === 'build' || type === 'groove' || type === 'peak' || type === 'half' || (type === 'breakdown' && k > 0.75)) {
    const H = type === 'half' ? 'sparse' : P.hats;
    for (let s = 0; s < 16; s++) {
      const off = s % 4 === 2;
      if (type === 'peak' && off && H !== 'sparse') { add('hat', s, 1, 0, 0.7, { open: true }); continue; }
      if (off) add('hat', s, 1, 0, type === 'breakdown' ? 0.35 : H === 'sparse' ? 0.5 : 0.65);
      else if (H === '16') add('hat', s, 1, 0, s % 4 === 0 ? 0.3 : 0.35 + 0.1 * r());
      else if (H === 'off8' && s % 2 === 1 && (type === 'peak' || r() < 0.25 + 0.5 * k)) add('hat', s, 1, 0, 0.25 + 0.15 * r());
    }
    if (type === 'groove' && b % 2 === 1 && H !== 'sparse') add('hat', 14, 1, 0, 0.5, { open: true });
    if (H === 'sparse' && b % 4 === 3) add('hat', 14, 1, 0, 0.45, { open: true });
  }

  // bass: the pulsing sequence, eighths in halftime, long roots when the kick is out
  if (type === 'groove' || type === 'peak' || type === 'build') {
    for (let s = 0; s < 16; s++) {
      const p = S.bass[s];
      if (!p) continue;
      const note = p === 2 ? root + 12 : p === 3 ? root + 7 : root;
      add('bass', s, 0.75, note, s % 4 === 0 ? 1 : s % 2 ? 0.8 : 0.9);
    }
  } else if (type === 'half') {
    for (let s = 0; s < 16; s += 2) {
      const p = S.bass[s] || (s % 4 === 0 ? 1 : 0);
      if (!p) continue;
      const note = p === 2 ? root + 12 : p === 3 ? root + 7 : root;
      add('bass', s, 1.6, note, s % 8 === 0 ? 1 : 0.85);
    }
  } else if (type === 'breakdown' || type === 'drift' || (type === 'intro' && b >= 4)) {
    add('bassLong', 0, 16, root, type === 'intro' ? 0.6 : type === 'drift' ? 0.5 : 0.8);
  }

  // arpeggio: in drift always in eighths, it is the only pulse there
  if (type !== 'intro' || b >= 2) {
    const A = S.arp, step = type === 'drift' ? 2 : A.rate;
    const g = type === 'peak' ? 0.75 : type === 'breakdown' ? 0.55 : type === 'drift' ? 0.6 : 0.65;
    for (let s = 0, i = 0; s < 16; s += step, i++) {
      const t = A.shape[i % A.shape.length];
      let m = deg(chord + ARP_DEG[t], T + 12);
      if (m > T + 31) m -= 12;
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
      let note = deg(chord + m.o, T + 12);
      while (note > T + 34) note -= 12;
      add('lead', m.s % 16, m.l, note, 0.8);
    }
  }

  // koto: sparse pentatonic plucks, a grace note now and then, a press-bend
  const kotoP = { intro: 0.7, build: 0.35, groove: 0.3, peak: 0.15, breakdown: 0.55, half: 0.4, drift: 0.5 }[type];
  if (r() < kotoP) {
    let s = pick(r, [0, 2, 3, 6, 8, 10]);
    let i = 5 + Math.floor(r() * 6);        // D4 .. D5 and a bit above, in D
    const count = 2 + Math.floor(r() * 4);
    for (let c = 0; c < count && s < 16; c++) {
      const note = pent(i, T);
      if (r() < 0.25 && s > 0) add('koto', s - 0.5, 0.5, pent(i + 1, T), 0.35);
      const next = pent(i + 1, T) - note;
      add('koto', s, 4, note, 0.6 + 0.3 * r(), c === count - 1 && next <= 2 && r() < 0.5 ? { bend: next } : null);
      s += pick(r, [1, 2, 2, 3, 4]);
      i = clamp(i + pick(r, [-2, -1, -1, 1, 1, 2]), 3, 12);
    }
  }

  // shakuhachi: long breathy notes, mostly in breakdowns and the intro
  const shakP = { intro: b >= 4 ? 0.45 : 0, build: 0, groove: 0.08, peak: 0.12, breakdown: 0.8, half: 0.25, drift: 0.4 }[type];
  if (b % 2 === 0 && r() < shakP) {
    let s = pick(r, [0, 2, 4, 8]);
    let i = 5 + Math.floor(r() * 4);
    const count = 1 + Math.floor(r() * 3);
    for (let c = 0; c < count && s < 28; c++) {
      const l = pick(r, [6, 8, 10, 12, 16]);
      add('shak', s, Math.min(l, 32 - s), pent(i, T + 12), 0.8);
      s += l + pick(r, [1, 2, 2]);
      i = clamp(i + pick(r, [-1, -1, 1, 1, 2, -2]), 3, 10);
    }
  }

  // distant siren, very rare
  if (r() < 0.03) add('siren', 0, 64, 0, 1, { f: 520 + 300 * r() });

  S.bar++;
  this.barCount++;
  return { type, secBar: b, bars: n, secIndex: S.idx, chord, chordName: chordName(chord, T),
           tonic: T, palette: P, bright, events: ev };
};

/* --------------------------------------------------------------- audio layer */

const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
/* block: the block arcology's interior (2026-10-26), a brutalist vertical
   hall, more than half of it solid concrete. Against the Menger block's
   open lattice (bright, long ping-pong echoes, rain through the voids) it
   is dark and heavy: highs cut to 2.4 kHz, a big hall, few echoes, no
   rain, the low city rumble carried by the structure at more than its
   open-air level. */
const BIOMES = {
  open:   { lp: 18000, rev: 0.32, fb: 0.36, rain: 1,   city: 1 },
  menger: { lp: 6500,  rev: 0.42, fb: 0.46, rain: 0.6, city: 0.7 },
  shaft:  { lp: 1300,  rev: 0.75, fb: 0.30, rain: 0,   city: 0.35 },
  block:  { lp: 2400,  rev: 0.64, fb: 0.18, rain: 0,   city: 1.8 }
};
/* Environment moves (2026-10-26, flight feedback: leaving the tunnel was
   too abrupt). Time constants of setTargetAtTime in s; a move is 90 %
   done after 2.3 of them: going in about 1.2 s, the walls close around
   you; coming out about 4.5 s, like the ear adjusting to the open sky.
   Before: 0.8 both ways on the cutoff in Hz, which came out in about 1 s.
   The direction is read off the lowpass, which falls monotonically from
   open to shaft. The ambience (rain, rumble) takes twice the constant. 'change' is everything else (rain on
   or off, a move between two equally dark places). */
const ENV_TAU = { in: 0.5, out: 2.0, change: 0.8 };
/* The environment parameters at mix (0..1) of the way from 'open' to biome.
   The lowpass blends geometrically (it is heard in octaves), the rest
   linearly. */
function envParams(biome, mix) {
  const O = BIOMES.open, B = BIOMES[biome] || O, m = clamp(mix == null ? 1 : +mix || 0, 0, 1);
  if (m === 1) return Object.assign({}, B);
  const lin = k => O[k] + (B[k] - O[k]) * m;
  return { lp: O.lp * Math.pow(B.lp / O.lp, m), rev: lin('rev'), fb: lin('fb'), rain: lin('rain'), city: lin('city') };
}
/* Collisions in the music (2026-10-26, flight feedback item 15). Two
   layers. At once: the whole mix ducks to duck^k of its level and a
   lowpass drops towards drop Hz (geometric in k), both swell back with
   their release constants; that lands on the frame of the contact. On the
   grid: a low hit on the root of the playing chord, quantised to the next
   sixteenth (at most 127 ms late at 118 BPM), level times k. lock: hits
   closer than this merge, unless the new one is clearly harder. */
const IMPACT = { duck: 0.35, duckHold: 0.04, duckTau: 0.12, drop: 700, dropTau: 0.18,
                 level: 0.8, minK: 0.05, lock: 0.12 };
/* Changing pieces (2026-10-26, flight feedback item 24: menu to race
   sounded like two pieces at once). In place (setVariant now): the old
   bass and arp voices fade with voiceTau instead of 20 ms, pads still
   sounding at the cut release with padTau, so the new chord comes in on
   the bar line. swap(): gap s fade-out of the whole old player, then the
   new one fades in over fadeIn s. */
const SWAP = { gap: 0.5, fadeIn: 0.5, voiceTau: 0.25, voiceStop: 2, padTau: 0.12 };

/* Where a hit lands: marks are the scheduled bars {t0, sd, root}; the one
   playing at now gives the next sixteenth at or after now + lead and its
   chord root. null before the first bar. */
function impactGrid(now, marks, lead) {
  let m = null;
  for (const x of marks) if (x.t0 <= now && (!m || x.t0 > m.t0)) m = x;
  if (!m) return null;
  const at = now + (lead == null ? 0.005 : lead);
  return { t: m.t0 + Math.ceil((at - m.t0) / m.sd - 1e-9) * m.sd, root: m.root };
}

/* Which constant a move from environment a to b gets. */
function envTau(a, b) {
  if (b.lp < a.lp * 0.98) return ENV_TAU.in;
  if (b.lp > a.lp * 1.02) return ENV_TAU.out;
  return ENV_TAU.change;
}

function Engine(ctx, opts) {
  opts = opts || {};
  this.ctx = ctx;
  this.ar = rng(hash(opts.seed || 1, 0xa0d10));
  this.pal = opts.palette || makePalette(opts.seed || 1, opts.variant);
  this.bpm = opts.bpm || this.pal.bpm;
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
  // the cutoff moves on detune (cents against open air), so an environment
  // move glides evenly in octaves instead of lingering in the highs
  this.biomeLp.type = 'lowpass'; this.biomeLp.frequency.value = BIOMES.open.lp; this.biomeLp.Q.value = 0.5;
  this.biomeLp.connect(glue);
  this.mix = c.createGain();
  this.mix.gain.value = 0.7;
  // collisions (impact): a lowpass and a gain of their own, so neither the
  // biome's cutoff nor the kick's sidechain automation is touched
  this.impLp = c.createBiquadFilter();
  this.impLp.type = 'lowpass'; this.impLp.frequency.value = 20000; this.impLp.Q.value = 0.7;
  this.impG = c.createGain();
  this.mix.connect(this.impLp).connect(this.impG).connect(this.biomeLp);
  this.marks = [];
  this.lastImpact = { t: -1, k: 0 };
  this.pads = [];                          // {gain, end}: the last pads, for a palette change

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
  this.bassV = this.makeBass(this.pal.bassWave);
  this.arpV = [this.makeArp(-0.45, this.pal.arpWave), this.makeArp(0.45, this.pal.arpWave)];

  this.only = opts.only || null;                        // diagnostics: render some voices only
  this.rain = !!opts.rain;
  this.biome = BIOMES[opts.biome] ? opts.biome : 'open';
  this.envMix = clamp(opts.biomeMix == null ? 1 : +opts.biomeMix || 0, 0, 1);
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

/* Swap to another palette at time t: the persistent bass and arp voices are
   rebuilt with the new waveforms, the old ones fade and stop. One-shot voices
   (pad, lead, pluck) read this.pal when they are scheduled. */
Engine.prototype.setPalette = function (p, t) {
  if (p.id === this.pal.id) { this.pal = p; return; }
  this.pal = p;
  const old = [this.bassV].concat(this.arpV);
  for (const v of old) {
    v.amp.gain.cancelScheduledValues(t);
    v.amp.gain.setTargetAtTime(0, t, SWAP.voiceTau);
    for (const o of v.oscs) { try { o.stop(t + SWAP.voiceStop); } catch (e) {} }
  }
  for (const pd of this.pads) {              // pads of the old palette that still ring at t
    if (pd.end <= t) continue;
    pd.gain.cancelScheduledValues(t);
    pd.gain.setTargetAtTime(0, t, SWAP.padTau);
  }
  this.bassV = this.makeBass(p.bassWave);
  this.arpV = [this.makeArp(-0.45, p.arpWave), this.makeArp(0.45, p.arpWave)];
};

/* Biome and weather as smooth parameter moves, from now or from time at. */
Engine.prototype.applyEnv = function (tau, at) {
  const B = envParams(this.biome, this.envMix), t = at == null ? this.ctx.currentTime : at;
  const k = tau == null ? ENV_TAU.change : tau || 0.001;
  this.biomeLp.detune.setTargetAtTime(1200 * Math.log2(B.lp / BIOMES.open.lp), t, k);
  this.revOut.gain.setTargetAtTime(B.rev, t, k);
  this.dlyFb.gain.setTargetAtTime(B.fb, t, k);
  const amb = !this.only || this.only.includes('amb') ? 1 : 0;
  this.rainGain.gain.setTargetAtTime(amb * (this.rain ? 0.55 : 0.12) * B.rain, t, k * 2);
  this.cityGain.gain.setTargetAtTime(amb * 0.035 * B.city, t, k * 2);
};

/* A move to biome at mix, with the constant its direction asks for. */
Engine.prototype.setEnv = function (biome, mix, at) {
  const a = envParams(this.biome, this.envMix);
  this.biome = BIOMES[biome] ? biome : 'open';
  this.envMix = clamp(mix == null ? 1 : +mix || 0, 0, 1);
  this.applyEnv(envTau(a, envParams(this.biome, this.envMix)), at);
};

/* A collision of strength k (0..1) at now: duck and filter drop at once,
   a hit in key on the next sixteenth. */
Engine.prototype.impact = function (k, now) {
  const I = IMPACT, t = now == null ? this.ctx.currentTime : now;
  k = clamp(+k || 0, 0, 1);
  if (k < I.minK) return;
  const L = this.lastImpact;
  if (t - L.t < I.lock && k < L.k * 1.5) return;
  this.lastImpact = { t, k };
  const g = this.impG.gain, f = this.impLp.frequency;
  g.cancelScheduledValues(t); g.setValueAtTime(g.value, t);
  g.linearRampToValueAtTime(Math.pow(I.duck, k), t + 0.01);
  g.setTargetAtTime(1, t + 0.01 + I.duckHold, I.duckTau);
  f.cancelScheduledValues(t); f.setValueAtTime(f.value, t);
  f.exponentialRampToValueAtTime(20000 * Math.pow(I.drop / 20000, k), t + 0.015);
  f.setTargetAtTime(20000, t + 0.03, I.dropTau);
  const q = impactGrid(t, this.marks);
  if (!q) return;
  // the hit: a sine falling an octave onto the root plus a short dark saw,
  // behind the duck (it should not duck itself), through the biome
  const c = this.ctx, tt = q.t, fr = mtof(q.root), lv = I.level * k;
  const o = this.osc('sine', fr * 2, 0, tt, tt + 0.7);
  o.frequency.setValueAtTime(fr * 2, tt);
  o.frequency.exponentialRampToValueAtTime(fr, tt + 0.08);
  const sw = this.osc('sawtooth', fr, 0, tt, tt + 0.4);
  const lp = this.filter('lowpass', 500 + 900 * k, 1.2);
  const sg = c.createGain(); sg.gain.value = 0.35;
  const a = this.hit(tt, 0.5 * lv, 0.18);
  o.connect(a); sw.connect(lp).connect(sg).connect(a);
  a.connect(this.biomeLp);
  this.send(a, 0.35);
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
Engine.prototype.makeBass = function (wave) {
  const c = this.ctx;
  const o1 = c.createOscillator(), o2 = c.createOscillator(), sub = c.createOscillator();
  o1.type = o2.type = wave || 'sawtooth'; o1.detune.value = -7; o2.detune.value = 7; sub.type = 'sine';
  const lp = this.filter('lowpass', 200, 6), mixg = c.createGain(), subg = c.createGain(), amp = c.createGain();
  // square is louder and hollower, triangle is nearly a sine: rebalance against the sub
  mixg.gain.value = { sawtooth: 0.32, square: 0.22, triangle: 0.5 }[o1.type] || 0.32;
  subg.gain.value = o1.type === 'triangle' ? 0.45 : 0.55;
  amp.gain.value = 0;
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
  const c = this.ctx, end = t + len + 3, wave = this.pal.padWave;
  const lp = this.filter('lowpass', 500, 0.8);
  const f0 = (wave === 'triangle' ? 1200 : 600) + 3800 * bright;
  lp.frequency.setValueAtTime(f0, t);
  lp.frequency.linearRampToValueAtTime(f0 * 1.5, t + len * 0.6);
  lp.frequency.linearRampToValueAtTime(f0, t + len + 1);
  const a = this.adsr(t, { sawtooth: 0.1, square: 0.07, triangle: 0.17 }[wave] * g, 0.8, len, 0.7);
  for (const [dt, pan] of [[-13, -0.7], [0, 0], [12, 0.7]]) {      // three detuned layers, spread
    const p = c.createStereoPanner(); p.pan.value = pan;
    p.connect(lp);
    for (const n of notes) this.osc(wave, mtof(n), dt + (this.ar() - 0.5) * 4, t, end).connect(p);
  }
  lp.connect(a).connect(this.music);
  this.send(a, 0.7);
  this.pads.push({ gain: a.gain, end: t + len + 2.5 });
  if (this.pads.length > 6) this.pads.shift();
};

/* Two arp voices, left and right, take turns: each note rings for two steps. */
Engine.prototype.makeArp = function (pan, wave) {
  const c = this.ctx, o = c.createOscillator(), o2 = c.createOscillator();
  o.type = wave || 'sawtooth'; o2.type = o.type === 'square' ? 'sawtooth' : 'square'; o2.detune.value = 6;
  const og = c.createGain(); og.gain.value = o.type === 'triangle' ? 0.12 : 0.35;
  const lp = this.filter('lowpass', 800, o.type === 'triangle' ? 1.2 : 2.5), amp = c.createGain(), p = c.createStereoPanner();
  amp.gain.value = 0; p.pan.value = pan;
  o.connect(lp); o2.connect(og).connect(lp);
  lp.connect(amp).connect(p).connect(this.music);
  this.send(p, 0.25, 0.45);
  const oscs = [o, o2];
  for (const x of oscs) { x.start(0); this.sources.push(x); }
  return { oscs, lp, amp };
};

Engine.prototype.arp = function (t, note, len, g, bright, pan) {
  const V = this.arpV[pan < 0 ? 0 : 1], f = mtof(note), tri = V.oscs[0].type === 'triangle';
  const base = (tri ? 1400 : 700) + 3000 * bright;
  for (const o of V.oscs) o.frequency.setValueAtTime(f, t);
  V.lp.frequency.setTargetAtTime(base + 1600, t, 0.002);
  V.lp.frequency.setTargetAtTime(base, t + 0.006, 0.06);
  V.amp.gain.setTargetAtTime((tri ? 0.45 : 0.3) * g, t, 0.0015);
  V.amp.gain.setTargetAtTime(0, t + 0.006, 0.1);
};

Engine.prototype.lead = function (t, note, len, g, bright) {
  const c = this.ctx, f = mtof(note), end = t + len + 1, wave = this.pal.leadWave;
  const o1 = this.osc(wave, f, -8, t, end), o2 = this.osc(wave, f, 8, t, end);
  const lfo = this.osc('sine', 5.3, 0, t, end), lg = c.createGain();
  lg.gain.setValueAtTime(0, t);
  lg.gain.linearRampToValueAtTime(14, t + Math.min(0.45, len + 0.1));
  lfo.connect(lg); lg.connect(o1.detune); lg.connect(o2.detune);
  const lp = this.filter('lowpass', (wave === 'triangle' ? 2500 : 1500) + 2500 * bright, 1.5);
  o1.connect(lp); o2.connect(lp);
  if (wave === 'triangle') {                               // a soft fifth above, otherwise it is too plain
    const o3 = this.osc('sine', f * 1.5, 0, t, end), g3 = c.createGain(); g3.gain.value = 0.25;
    o3.connect(g3).connect(lp);
  }
  const a = this.adsr(t, { sawtooth: 0.13, square: 0.09, triangle: 0.2 }[wave] * g, 0.03, len, 0.15);
  lp.connect(a).connect(this.music);
  this.send(a, 0.4, 0.4);
};

/* Karplus-Strong string. 'koto': plucked near the bridge, little damping,
   metallic. 'soft': plucked mid-string, more damping, a rounder synth pluck. */
Engine.prototype.kotoBuffer = function (note, soft) {
  const key = note + (soft ? 's' : '');
  if (this.kotoCache[key]) return this.kotoCache[key];
  const c = this.ctx, sr = c.sampleRate, f = mtof(note);
  const L = Math.max(2, Math.floor(sr / f - 0.5));
  const len = Math.floor(sr * 3.2), buf = c.createBuffer(1, len, sr), d = buf.getChannelData(0);
  const r = rng(note * 7919);
  const T60 = (soft ? 1.6 : 2.6) - 0.02 * (note - 60);
  const rho = Math.pow(10, -3 / (T60 * f));
  const pick = Math.max(1, Math.round(L * (soft ? 0.45 : 0.13)));
  const ex = new Float32Array(L);
  let y = 0;
  for (let i = 0; i < L; i++) { y += (soft ? 0.4 : 0.7) * ((r() * 2 - 1) - y); ex[i] = y; }
  for (let i = 0; i < L; i++) d[i] = ex[i] - (i >= pick ? ex[i - pick] : 0);
  const s = soft ? 0.5 : 0.32;                             // loop filter: 0.5 is the darkest
  for (let i = L; i < len; i++) d[i] = rho * ((1 - s) * d[i - L] + s * d[i - L - 1 >= 0 ? i - L - 1 : 0]);
  let peak = 0;
  for (let i = 0; i < len; i++) peak = Math.max(peak, Math.abs(d[i]));
  for (let i = 0; i < len; i++) d[i] /= peak || 1;
  return (this.kotoCache[key] = { buf, rate: f / (sr / (L + s)) });
};

Engine.prototype.koto = function (t, note, g, bend) {
  const c = this.ctx, soft = this.pal.pluck === 'soft', K = this.kotoBuffer(note, soft);
  const s = c.createBufferSource();
  s.buffer = K.buf;
  s.playbackRate.setValueAtTime(K.rate, t);
  if (bend && !soft) {                                     // oshide: press the string behind the bridge
    s.playbackRate.setValueAtTime(K.rate, t + 0.28);
    s.playbackRate.linearRampToValueAtTime(K.rate * Math.pow(2, bend / 12), t + 0.42);
  }
  const body = this.filter('peaking', soft ? 400 : 750, 1.2); body.gain.value = soft ? 2 : 4;
  const hs = this.filter('highshelf', 4000); hs.gain.value = soft ? -9 : -4;
  const a = this.ctx.createGain(); a.gain.value = (soft ? 1 : 0.8) * g;
  const p = c.createStereoPanner(); p.pan.value = soft ? -0.2 : 0.35;
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
  if (bar.palette && bar.palette !== this.pal) this.setPalette(bar.palette, t0);
  const sd = this.stepDur();
  if (bar.tonic != null) {                 // the grid for impact()
    this.marks.push({ t0, sd, root: deg(bar.chord, bar.tonic - 12) });
    if (this.marks.length > 4) this.marks.shift();
  }
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

/* A composer from start/render opts: seed, variant, calm, paletteSeed,
   tonic, opening (the type of the first section). */
function makeComposer(opts) {
  const comp = new Composer(opts.seed, opts.variant);
  comp.calm = !!opts.calm;
  if (opts.paletteSeed != null || opts.tonic != null) {
    comp.pal = makePalette(opts.paletteSeed != null ? opts.paletteSeed : opts.seed, opts.variant, opts.tonic);
  }
  if (SECTION_BARS[opts.opening]) comp.cut = opts.opening;
  return comp;
}

/* ---------------------------------------------------------------- live player */

const Synthwave = {
  onBar: null,
  _s: null,

  start(opts) {
    if (this._s) this.stop();
    opts = Object.assign({ seed: 1, intensity: 0.6, biome: 'open', rain: false, volume: 0.8, bpm: null, variant: 'auto' }, opts || {});
    const Ctx = root.AudioContext || root.webkitAudioContext;
    const ctx = this._ctx || (this._ctx = new Ctx({ latencyHint: 'playback' }));
    if (ctx.state === 'suspended') ctx.resume();
    const comp = makeComposer(opts);
    const eng = new Engine(ctx, Object.assign({}, opts, { palette: comp.pal }));
    const t0 = ctx.currentTime + (opts.at > 0 ? opts.at : 0), fadeIn = eng.out.gain;
    fadeIn.setValueAtTime(0, ctx.currentTime);
    fadeIn.setValueAtTime(0, t0);
    fadeIn.linearRampToValueAtTime(opts.volume, t0 + (opts.fadeIn > 0 ? opts.fadeIn : 1.5));
    const s = this._s = { ctx, eng, comp, intensity: opts.intensity, bpmFixed: !!opts.bpm,
                          volume: opts.volume, next: t0 + (opts.at > 0 ? 0 : 0.1), timers: [] };
    const tick = () => {
      if (this._s !== s) return;
      const ahead = root.document && root.document.hidden ? 1.5 : 0.3;
      while (s.next < ctx.currentTime + ahead) {
        if (s.next < ctx.currentTime) s.next = ctx.currentTime + 0.05;   // after a stall: skip, don't pile up
        const bar = s.comp.nextBar(s.intensity), t0 = s.next;
        if (!s.bpmFixed && bar.palette.bpm !== eng.bpm) eng.setBpm(bar.palette.bpm, t0);
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

  /* fade: seconds to silence (default 0.6); then the engine is dropped,
     reverb and echo tails with it */
  stop(fade) {
    const s = this._s;
    if (!s) return;
    this._s = null;
    clearInterval(s.interval);
    s.timers.forEach(clearTimeout);
    const f = fade > 0 ? fade : 0.6, t = s.ctx.currentTime, g = s.eng.out.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(0, t + f);
    setTimeout(() => { s.eng.out.disconnect(); s.eng.sources.forEach(x => { try { x.stop(); } catch (e) {} }); }, (f + 0.2) * 1000);
  },

  /* Fade out, drop, fade in a new piece (the hikyaku race start). opts as
     start(); o.gap, o.fadeIn default to SWAP. A suspended context is
     resumed by start as usual. */
  swap(opts, o) {
    o = o || {};
    const gap = o.gap > 0 ? o.gap : SWAP.gap;
    if (this._s) this.stop(gap);
    this.start(Object.assign({}, opts, { at: this._ctx ? gap : 0, fadeIn: o.fadeIn > 0 ? o.fadeIn : SWAP.fadeIn }));
  },

  pause() { if (this._ctx) this._ctx.suspend(); },
  resume() { if (this._ctx) this._ctx.resume(); },
  playing() { return !!this._s && this._ctx.state === 'running'; },

  setIntensity(x) { if (this._s) this._s.intensity = clamp(+x, 0, 1); },
  /* Called every few frames by a page: a move under 2 % of the blend is
     dropped, so the parameter timelines do not fill up with tiny steps.
     'open', or any biome at mix 0, is the same place. */
  setBiome(b, mix) {
    const s = this._s;
    if (!s || !BIOMES[b]) return;
    let m = mix == null ? 1 : clamp(+mix || 0, 0, 1);
    if (b === 'open' || m === 0) { b = 'open'; m = 1; }
    const e = s.eng;
    if (e.biome === b && (e.envMix === m || (Math.abs(e.envMix - m) < 0.02 && m < 1))) return;
    e.setEnv(b, m);
  },
  setRain(on) { const s = this._s; if (s && s.eng.rain !== !!on) { s.eng.rain = !!on; s.eng.applyEnv(); } },
  setBpm(b) {
    const s = this._s;
    if (!s) return;
    if (b == null) { s.bpmFixed = false; return; }   // the next bar takes the palette's tempo
    s.bpmFixed = true; s.eng.setBpm(+b);
  },
  setVariant(v, o) { if (this._s) this._s.comp.setVariant(v, o); },
  setCalm(on) { if (this._s) this._s.comp.calm = !!on; },
  impact(k) { const s = this._s; if (s && s.ctx.state === 'running') s.eng.impact(k); },
  palette(seed, variant) { return makePalette(seed, variant); },
  VARIANTS: Object.keys(VARIANTS),
  setVolume(v, tau) {
    const s = this._s;
    if (!s) return;
    s.volume = clamp(+v, 0, 1);
    const g = s.eng.out.gain, t = s.ctx.currentTime;
    g.cancelScheduledValues(t);            // a running fade-in ramp would otherwise win
    g.setValueAtTime(g.value, t);
    g.setTargetAtTime(s.volume, t, tau > 0 ? tau : 0.05);
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
    opts = Object.assign({ seed: 1, intensity: 0.6, biome: 'open', rain: false, volume: 0.8, bpm: null, variant: 'auto', sampleRate: 48000 }, opts || {});
    const ctx = new OfflineAudioContext(2, Math.ceil(opts.sampleRate * seconds), opts.sampleRate);
    let comp = makeComposer(opts);
    let eng = new Engine(ctx, Object.assign({}, opts, { palette: comp.pal }));
    let bpmFixed = opts.bpm;
    // opts.swap: {at, mode: 'fade' | 'bar', ...start opts of the new piece}, the hikyaku race start
    const sw = opts.swap ? Object.assign({}, opts.swap) : null;
    // Schedule bar by bar as the render advances, like the live player does:
    // nodes created far ahead would all cost processing time from the start.
    for (const ev of opts.env || []) eng.setEnv(ev[1], ev[2], ev[0]);
    const imps = (opts.impacts || []).slice().sort((x, y) => x[0] - y[0]);   // [[t, k], ...] collisions
    const bars = [], q = 128 / opts.sampleRate;
    let next = 0.05;
    const feed = () => {
      while (next < ctx.currentTime + 0.5 && next < seconds) {
        if (sw && (sw.mode === 'fade' ? next > sw.at : next >= sw.at)) {   // fade: at sw.at itself, after the old bar holding it
          if (sw.mode === 'fade') {
            const g = eng.out.gain, gap = sw.gap || SWAP.gap, t1 = sw.at + gap;
            g.setValueAtTime(g.value, sw.at); g.linearRampToValueAtTime(0, t1);
            const o2 = Object.assign({}, opts, sw, { swap: null });
            comp = makeComposer(o2);
            eng = new Engine(ctx, Object.assign({}, o2, { palette: comp.pal }));
            eng.out.gain.setValueAtTime(0, 0); eng.out.gain.setValueAtTime(0, t1);
            eng.out.gain.linearRampToValueAtTime(o2.volume, t1 + (sw.fadeIn || SWAP.fadeIn));
            bpmFixed = o2.bpm; if (bpmFixed) eng.setBpm(bpmFixed, t1);
            next = t1;                     // the old bar already scheduled plays out under the fade
          } else {
            comp.calm = false;
            comp.setVariant(sw.variant, { now: true, next: sw.opening || 'build', seed: sw.paletteSeed, tonic: sw.tonic });
            if (sw.bpm) { bpmFixed = sw.bpm; eng.setBpm(sw.bpm, next); }
          }
          bars.push({ t: next, type: 'SWAP ' + sw.mode });
          opts.swap = null; sw.at = Infinity;
        }
        if (opts.switchVariant && next >= (opts.switchAt || 0)) { if (opts.switchNow) comp.calm = false; comp.setVariant(opts.switchVariant, { now: opts.switchNow, next: opts.switchNext }); opts.switchVariant = null; }
        const bar = comp.nextBar(opts.intensity);
        if (!bpmFixed && bar.palette.bpm !== eng.bpm) eng.setBpm(bar.palette.bpm, next);
        bars.push({ t: next, type: bar.type, chord: bar.chordName, key: bar.palette.key, tonic: bar.tonic, bpm: eng.bpm });
        next += eng.scheduleBar(bar, next);
      }
      while (imps.length && imps[0][0] < next - 0.3) { const x = imps.shift(); eng.impact(x[1], x[0]); }
      const at = Math.ceil((next - 0.4) / q) * q;
      if (next < seconds && at < seconds) ctx.suspend(at).then(() => { feed(); ctx.resume(); });
    };
    feed();
    return ctx.startRendering().then(buf => { buf.bars = bars; buf.palette = comp.pal; return buf; });
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
  Engine, Composer, rng, deg, pent, PROGS, TONIC, MINOR, PENTA, CHORD_NAMES, SECTION_BARS, makePalette, VARIANT_DEFS: VARIANTS,
  BIOMES, ENV_TAU, envParams, envTau, IMPACT, impactGrid, SWAP, makeComposer
};

root.Synthwave = Synthwave;
if (typeof module !== 'undefined' && module.exports) module.exports = Synthwave;
})(typeof window !== 'undefined' ? window : globalThis);
