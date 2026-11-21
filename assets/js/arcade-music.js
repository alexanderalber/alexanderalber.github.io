/* arcade-music.js: generated game music for as-advertised, in four genres.
   Web Audio only, no dependencies, classic script. Load it after
   synthwave.js: the audio layer borrows that engine's plumbing (noise,
   envelopes, reverb impulse, Karplus-Strong strings, hats, crash, riser and
   the collision duck impact()), but nothing of its arrangement. No sidechain
   pump, no long pads (disco strings excepted), its own forms, drum kits,
   bass lines, progressions and melodies.

   Styles:
     march  8-bit march: pulse-wave lead with a fanfare tune, triangle oom-pah
            bass, chip drums with snare ruffs and rolls. No synthwave at all.
     euro   eurobeat: four on the floor, octave bass in eighths, offbeat
            stabs, a supersaw chorus hook, snare-roll builds.
     surf   surf rock on synth strings: tremolo-picked lead guitar with a
            spring-like reverb, palm-muted chugs, a rock kit with tom fills.
     disco  disco funk: syncopated octave bass, guitar chops, brass stabs,
            a string hook in the chorus, a little swing on the sixteenths.

   Two layers, like synthwave.js:
   - pure (Composer, makePiece): seeded piece (key, tempo, progressions,
     motifs) and note events per bar. Runs in Node (module.exports), tested
     by notes/dev/arcade-music.test.mjs.
   - audio (ArcadeEngine): one bar of events into Web Audio nodes on any
     BaseAudioContext, live or offline.

   Global API (window.ArcadeMusic), a subset of Synthwave's:
     start({seed, style, intensity, volume, calm, opening, at, fadeIn, lead})
                            lead: the melody voice, LEADS[style] (0 the original)
                            call from a user gesture; opening: first section type
     stop(fade), swap(opts, {gap, fadeIn, cross}), pause(), resume(), playing()
     setIntensity(0..1)     arrangement density: more sections with the hook,
                            more hats and harmony at the top
     setCalm(bool)          from the next section on only 'calm' (no drums)
     impact(k)              a collision: duck, darken, a hit in key
     setVolume(v, tau)
     render(seconds, opts) -> Promise<AudioBuffer> (offline, the same music)
     STYLES: the names
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
function wpick(r, items) {
  let s = 0;
  for (const it of items) s += it[1];
  let x = r() * s;
  for (const it of items) { x -= it[1]; if (x <= 0) return it[0]; }
  return items[items.length - 1][0];
}
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const pc = (m) => ((m % 12) + 12) % 12;

const SCALES = { major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10] };
const QUAL = { M: [0, 4, 7], m: [0, 3, 7], M7: [0, 4, 7, 11], m7: [0, 3, 7, 10], '7': [0, 4, 7, 10] };

/* A chord is [root in semitones above the tonic, quality]. */
const I = [0, 'M'], ii = [2, 'm'], iii = [4, 'm'], IV = [5, 'M'], V = [7, 'M'], vi = [9, 'm'];
const i_ = [0, 'm'], iv = [5, 'm'], VI = [8, 'M'], VII = [10, 'M'];
const IM7 = [0, 'M7'], ii7 = [2, 'm7'], iii7 = [4, 'm7'], IVM7 = [5, 'M7'], V7 = [7, '7'], vi7 = [9, 'm7'];

function chordPcs(ch) { return QUAL[ch[1]].map(i => pc(ch[0] + i)); }
/* The scale a melody uses over a chord: the style's scale, with every chord
   tone the scale lacks (the raised seventh over V in minor) in place of the
   scale tone it alters (a semitone below, else above). */
function chordScale(ch, scale) {
  let s = scale.slice();
  for (const c of chordPcs(ch)) {
    if (s.includes(c)) continue;
    const alt = s.includes(pc(c - 1)) ? pc(c - 1) : pc(c + 1);
    s = s.filter(x => x !== alt);
    s.push(c);
  }
  return s.sort((a, b) => a - b);
}
/* the nearest pitch to m (downwards first) whose class relative to tonic T is in set */
function nearest(m, T, set) {
  for (let d = 0; d < 7; d++) {
    if (set.includes(pc(m - d - T))) return m - d;
    if (set.includes(pc(m + d - T))) return m + d;
  }
  return m;
}
function deg(d, base, scale) {
  const o = Math.floor(d / 7);
  return base + 12 * o + scale[((d % 7) + 7) % 7];
}
/* the chord's tones between T+lo and T+hi, ascending */
function voicing(ch, T, lo, hi) {
  const out = [];
  for (const i of QUAL[ch[1]]) {
    let m = T + ch[0] + i;
    while (m < T + lo) m += 12;
    while (m > T + hi) m -= 12;
    if (!out.includes(m)) out.push(m);
  }
  return out.sort((a, b) => a - b);
}

/* Lead motifs: two bars on a sixteenth grid, as [start, length] rhythms the
   style knows, and a contour in scale degrees. The answer keeps the first
   bar and ends on the tonic, so an eight-bar phrase is question, answer,
   question, answer. */
function makeMotif(r, S) {
  const R = pick(r, S.rhythms);
  let d = pick(r, [0, 2, 4]);
  const notes = R.map((x, i) => {
    if (i > 0) {
      const st = wpick(r, S.steps);
      d = d + st > 8 || d + st < -2 ? d - st : d + st;
    }
    return { s: x[0], l: x[1], d };
  });
  notes[notes.length - 1].d = pick(r, [4, 1, 2]);
  return notes;
}
function makeAnswer(r, S, A) {
  const out = A.filter(n => n.s < 16).map(n => Object.assign({}, n));
  let d = out.length ? out[out.length - 1].d : 2;
  for (const n of A) {
    if (n.s < 16) continue;
    const st = wpick(r, S.steps);
    d = d + st > 8 || d + st < -2 ? d - st : d + st;
    out.push({ s: n.s, l: n.l, d });
  }
  out[out.length - 1].d = pick(r, [0, 0, 7]);
  return out;
}

const SECTION_BARS = { intro: 4, verse: 8, chorus: 8, break: 4, calm: 8 };

/* ------------------------------------------------------------------ styles
   Each style: tempo and key ranges, scale, progressions (four bars each),
   melody rhythms and steps, and bar(X), which writes one bar of events.
   X: b (bar in section), n (its length), type, k (intensity), r (the
   section's generator), T (tonic), ch / next (this and the next chord),
   root (bass note of ch), last (last bar), add(voice, s, l, n, g, extra),
   mel(w, g, o) (the section's tune in this bar). */
const STYLES = {
  march: {
    bpm: [118, 126], tonic: [50, 51, 53, 55], scale: 'major', swing: 0, bars: { break: 2 },
    room: { len: 0.6, gain: 0.06 }, echo: { time: 'e8', fb: 0, send: 0 },
    progV: [[I, I, V, I], [I, IV, V, I], [I, V, I, V], [I, vi, IV, V]],
    progC: [[IV, IV, I, I], [IV, I, V, I], [vi, IV, V, I], [IV, V, I, I]],
    rhythms: [
      [[0, 3], [3, 1], [4, 4], [8, 3], [11, 1], [12, 4], [16, 4], [20, 4], [24, 8]],
      [[0, 2], [2, 2], [4, 3], [7, 1], [8, 4], [12, 4], [16, 3], [19, 1], [20, 3], [23, 1], [24, 8]],
      [[0, 4], [4, 2], [6, 2], [8, 4], [12, 4], [16, 2], [18, 2], [20, 2], [22, 2], [24, 8]],
      [[0, 3], [3, 1], [4, 3], [7, 1], [8, 8], [16, 3], [19, 1], [20, 3], [23, 1], [24, 8]]
    ],
    steps: [[1, 3], [-1, 3], [2, 3], [-2, 2], [3, 1], [-3, 1], [0, 1]],
    bar(X) {
      const { b, n, type, k, add, last } = X;
      const calm = type === 'calm', intro = type === 'intro', brk = type === 'break';
      if (!calm) {
        const full = !intro || b >= 2;
        if (full) { add('kick', 0, 1, 0, 1, { w: 'chip' }); add('kick', 8, 1, 0, 0.9, { w: 'chip' }); }
        add('snare', 4, 1, 0, 0.8, { w: 'chip' }); add('snare', 12, 1, 0, 0.8, { w: 'chip' });
        if (b % 2 === 1 || brk) { add('snare', 14, 1, 0, 0.35, { w: 'chip' }); add('snare', 15, 1, 0, 0.5, { w: 'chip' }); }
        if (brk || intro) for (const s of [6, 7, 10]) add('snare', s, 1, 0, 0.3, { w: 'chip' });
        if (last) for (let s = 8; s < 16; s++) add('snare', s, 1, 0, 0.3 + 0.07 * (s - 8), { w: 'chip' });
        if (type === 'chorus' && k > 0.5) for (let s = 2; s < 16; s += 4) add('hat', s, 1, 0, 0.5, { w: 'chip' });
        if (k > 0.8) for (let s = 1; s < 16; s += 2) add('hat', s, 1, 0, 0.25, { w: 'chip' });
      }
      // oom-pah: root and fifth on one and three, the chord on two and four
      if (calm) add('bass', 0, 14, X.root, 0.35, { w: 'tri' });
      else if (!intro || b >= 2) {
        add('bass', 0, 3, X.root, 1, { w: 'tri' });
        add('bass', 8, 3, b % 2 ? X.root + 7 : X.root - 5, 0.9, { w: 'tri' });
        if (type === 'chorus' && b % 2 === 1) add('bass', 14, 2, X.approach, 0.7, { w: 'tri' });
      }
      if (!calm && !brk && !intro) {
        const v = voicing(X.ch, X.T, 4, 17);
        add('stab', 4, 1.6, v, 0.55, { w: 'p50' }); add('stab', 12, 1.6, v, 0.55, { w: 'p50' });
      }
      if (type === 'verse') X.mel('p25', 0.8, 0);
      else if (type === 'chorus') {
        X.mel('p25', 0.85, 0, { harm: k > 0.55 ? 0.45 : 0, hw: 'p12' });
        if (k > 0.7) {                      // the chip arpeggio on top
          const v = voicing(X.ch, X.T, 24, 37);
          for (let s = 0; s < 16; s++) add('lead', s, 0.9, v[s % v.length], 0.3, { w: 'p12' });
        }
      } else if (calm) X.mel('p12', 0.45, -12, { slow: true });
    }
  },

  euro: {
    bpm: [150, 158], tonic: [50, 52, 53], scale: 'major', swing: 0, bars: { intro: 8, chorus: 16, break: 8 },
    room: { len: 1.6, gain: 0.22 }, echo: { time: 'd8', fb: 0.3, send: 0.25 },
    progV: [[vi, IV, V, I], [I, V, vi, IV], [vi, V, IV, V], [IV, V, iii, vi]],
    progC: [[I, V, vi, IV], [IV, V, iii, vi], [vi, IV, I, V], [IV, V, I, vi]],
    rhythms: [
      [[0, 3], [3, 3], [6, 2], [8, 2], [10, 2], [12, 4], [16, 3], [19, 3], [22, 2], [24, 8]],
      [[0, 2], [2, 2], [4, 2], [6, 4], [10, 2], [12, 4], [16, 2], [18, 2], [20, 2], [22, 4], [26, 6]],
      [[2, 2], [4, 2], [6, 2], [8, 4], [12, 2], [14, 2], [16, 6], [22, 2], [24, 4], [28, 4]],
      [[0, 3], [3, 3], [6, 3], [9, 3], [12, 4], [16, 3], [19, 3], [22, 2], [24, 8]]
    ],
    steps: [[1, 3], [-1, 3], [2, 2], [-2, 1], [0, 2], [4, 1]],
    bar(X) {
      const { b, n, type, k, add, last } = X;
      const calm = type === 'calm', brk = type === 'break', ch = type === 'chorus';
      if (!calm && !brk) {
        for (let s = 0; s < 16; s += 4) add('kick', s, 1, 0, 1, { w: 'punch' });
        for (let s = 2; s < 16; s += 4) add('hat', s, 1, 0, 0.6, { open: true });
        if (ch || k > 0.45) { add('snare', 4, 1, 0, 0.7, { w: 'clap' }); add('snare', 12, 1, 0, 0.7, { w: 'clap' }); }
        if (ch || k > 0.75) for (let s = 0; s < 16; s += 4) { add('hat', s + 1, 1, 0, 0.3); add('hat', s + 3, 1, 0, 0.3); }
        if (ch && b === 0) add('crash', 0, 32, 0, 0.8);
        if (last && type === 'verse') for (let s = 8; s < 16; s++) add('snare', s, 1, 0, 0.3 + 0.06 * (s - 8), { w: 'rock' });
      }
      if (brk) {                            // the build: a snare roll speeding up, a riser
        if (b >= n - 2) for (let s = 0; s < 16; s += b === n - 1 ? 1 : 2) add('snare', s, 1, 0, 0.25 + 0.5 * (s / 16) + 0.15 * (b - n + 2), { w: 'rock' });
        if (b === n - 1) add('riser', 0, 16, 0, 0.9);
      }
      // the octave bass: root and octave in eighths
      if (calm || brk) add('bass', 0, 15, X.root, 0.7, { w: 'saw' });
      else for (let s = 0; s < 16; s += 2) add('bass', s, 1.6, s % 4 ? X.root + 12 : X.root, s % 4 ? 0.8 : 1, { w: 'saw' });
      const v = voicing(X.ch, X.T, 7, 21);
      if (ch) for (let s = 2; s < 16; s += 4) add('stab', s, 1.5, v, 0.5, { w: 'saw' });
      if (brk) add('stab', 0, 16, v, 0.35, { w: 'saw' });
      if (type === 'verse' || type === 'intro' || calm) {      // the sixteenth arpeggio
        const a = voicing(X.ch, X.T, 12, 26), step = calm ? 2 : 1;
        for (let s = 0, i = 0; s < 16; s += step, i++) add('lead', s, step * 0.8, a[[0, 1, 2, 1][i % 4] % a.length] + (i % 8 >= 4 ? 12 : 0), calm ? 0.3 : 0.38, { w: 'pluck' });
      }
      if (type === 'verse' || (type === 'intro' && b >= n / 2)) X.mel('pluck', type === 'intro' ? 0.45 : 0.55, 0);
      else if (ch) X.mel('ssaw', 0.8, 0, { harm: k > 0.7 ? 0.4 : 0, hw: 'ssaw' });
      else if (calm) X.mel('pluck', 0.35, 0, { slow: true });
    }
  },

  surf: {
    bpm: [150, 162], tonic: [50, 52, 53], scale: 'minor', swing: 0, bars: { break: 2 },
    room: { len: 2.2, gain: 0.38 }, echo: { time: 'slap', fb: 0.15, send: 0.2 },
    progV: [[i_, VII, VI, V], [i_, i_, iv, V], [i_, VI, VII, V], [i_, iv, VII, i_]],
    progC: [[VI, VII, i_, i_], [iv, V, i_, VI], [VI, VII, V, V], [i_, VII, VI, V]],
    rhythms: [
      [[0, 8], [8, 4], [12, 4], [16, 8], [24, 8]],
      [[0, 4], [4, 4], [8, 4], [12, 4], [16, 12], [28, 4]],
      [[0, 6], [6, 2], [8, 8], [16, 4], [20, 4], [24, 8]],
      [[0, 4], [4, 4], [8, 8], [16, 6], [22, 2], [24, 8]]
    ],
    steps: [[-1, 4], [1, 3], [-2, 2], [2, 1], [0, 1]],
    bar(X) {
      const { b, n, type, k, add, last, r } = X;
      const calm = type === 'calm', brk = type === 'break', ch = type === 'chorus', intro = type === 'intro';
      if (!calm && !(intro && b < 2)) {
        add('kick', 0, 1, 0, 1, { w: 'rock' }); add('kick', 8, 1, 0, 0.9, { w: 'rock' });
        if (r() < 0.5) add('kick', 10, 1, 0, 0.7, { w: 'rock' });
        add('snare', 4, 1, 0, 0.85, { w: 'rock' }); add('snare', 12, 1, 0, 0.85, { w: 'rock' });
        for (let s = 0; s < 16; s += 2) add('hat', s, 1, 0, s % 4 ? 0.35 : 0.5, { open: ch && s % 4 === 2 });
        if (ch && b === 0) add('crash', 0, 32, 0, 0.7);
        if (last || brk) {                  // tom fill, high to low
          const from = brk ? 0 : 8;
          for (let s = from; s < 16; s += brk ? 2 : 1) add('tom', s, 1, 50 - Math.floor((s - from) / (brk ? 4 : 2)) * 3, 0.55 + 0.03 * (s - from));
        }
      }
      // bass in eighths with a walk into the next chord
      if (calm) add('bass', 0, 14, X.root, 0.6, { w: 'pick' });
      else for (let s = 0; s < 16; s += 2) {
        const note = s === 14 ? X.approach : brk && s % 4 === 2 ? X.root + 12 : X.root;
        add('bass', s, 1.6, note, s % 8 === 0 ? 1 : 0.8, { w: 'pick' });
      }
      const pw = [X.root + 12, X.root + 19, X.root + 24];   // a power chord
      if (type === 'verse' || intro) for (let s = 0; s < 16; s += 2) add('stab', s, 0.8, pw, s % 8 === 0 ? 0.7 : 0.5, { w: 'mute' });
      if (ch) for (const s of [0, 3, 6, 8, 11, 14]) add('stab', s, 2, voicing(X.ch, X.T, 0, 14), 0.55, { w: 'gtr' });
      if (calm) {
        const a = voicing(X.ch, X.T, 0, 16);
        for (let s = 0, i = 0; s < 16; s += 2, i++) add('lead', s, 4, a[[0, 1, 2, 1][i % 4] % a.length], 0.5, { w: 'clean' });
      }
      if (intro && b < 2) for (let s = 0; s < 16; s++) add('lead', s, 1, X.T + (b === 1 ? [12, 10, 8, 7][s >> 2] : 12), 0.4 + 0.03 * s, { w: 'gtr', fg: 1 });
      if (type === 'verse') X.mel('gtr', 0.8, 0, { trem: true });
      else if (ch) X.mel('gtr', 0.85, 12, { trem: true, dbl: 0.4 });
    }
  },

  disco: {
    bpm: [116, 124], tonic: [50, 51, 53, 55], scale: 'major', swing: 0.14, bars: { break: 8 },
    room: { len: 1.4, gain: 0.2 }, echo: { time: 'e8', fb: 0.2, send: 0.12 },
    progV: [[IM7, vi7, ii7, V7], [ii7, V7, IM7, vi7], [IVM7, iii7, ii7, IM7], [IM7, IM7, IVM7, IVM7]],
    progC: [[IVM7, V7, iii7, vi7], [ii7, V7, IM7, IM7], [IVM7, iii7, ii7, V7], [IM7, vi7, IVM7, V7]],
    bassPats: [
      [1, 0, 2, 0, 1, 0, 2, 0, 1, 0, 2, 0, 1, 0, 2, 4],
      [1, 0, 2, 1, 0, 1, 2, 0, 1, 0, 2, 1, 0, 1, 2, 4],
      [1, 0, 0, 1, 2, 0, 1, 0, 0, 1, 2, 0, 1, 0, 3, 4]
    ],
    rhythms: [
      [[0, 2], [3, 2], [6, 2], [8, 1], [10, 2], [12, 3], [16, 2], [19, 2], [22, 4], [28, 2]],
      [[2, 2], [4, 1], [6, 2], [10, 2], [12, 4], [18, 2], [20, 1], [22, 2], [24, 6]],
      [[0, 1], [2, 2], [5, 3], [8, 2], [11, 1], [12, 4], [16, 1], [18, 2], [21, 3], [24, 2], [27, 5]],
      [[0, 3], [3, 3], [6, 2], [8, 4], [14, 2], [16, 3], [19, 3], [22, 2], [24, 8]]
    ],
    steps: [[1, 2], [-1, 2], [2, 2], [-2, 2], [0, 2], [3, 1], [-3, 1]],
    bar(X) {
      const { b, n, type, k, add, last, P } = X;
      const calm = type === 'calm', brk = type === 'break', ch = type === 'chorus';
      if (!calm) {
        for (let s = 0; s < 16; s += 4) add('kick', s, 1, 0, 0.95, { w: 'punch' });
        for (let s = 2; s < 16; s += 4) add('hat', s, 1, 0, 0.55, { open: true });
        if (!brk && (ch || k > 0.3)) { add('snare', 4, 1, 0, 0.75, { w: 'clap' }); add('snare', 12, 1, 0, 0.75, { w: 'clap' }); }
        if (ch || k > 0.6) for (let s = 0; s < 16; s++) if (s % 4 !== 2) add('hat', s, 1, 0, s % 2 ? 0.18 : 0.26);
        if (ch && b === 0) add('crash', 0, 32, 0, 0.6);
        if (last && !brk) for (const s of [12, 13, 14, 15]) add('snare', s, 1, 0, 0.45 + 0.08 * (s - 12), { w: 'clap' });
      }
      const pat = this.bassPats[P.bassPat % this.bassPats.length];
      if (calm) add('bass', 0, 12, X.root, 0.55, { w: 'funk' });
      else for (let s = 0; s < 16; s++) {
        const p = pat[s];
        if (!p) continue;
        const note = p === 2 ? X.root + 12 : p === 3 ? X.root + 7 : p === 4 ? X.approach : X.root;
        add('bass', s, 1.2, note, s % 4 === 0 ? 1 : 0.8, { w: 'funk' });
      }
      const v = voicing(X.ch, X.T, 10, 24);
      if (!calm && !brk && (ch || k > 0.4)) for (const s of [2, 3, 6, 10, 11, 14]) add('stab', s, 0.6, v, s % 4 === 2 ? 0.5 : 0.35, { w: 'clav' });
      if (ch) {
        if (b % 2 === 0) add('stab', 0, 2, v, 0.55, { w: 'brass' });
        else { add('stab', 6, 1.5, v, 0.5, { w: 'brass' }); add('stab', 14, 2, voicing(X.next, X.T, 10, 24), 0.55, { w: 'brass' }); }
      }
      if (brk) add('stab', 0, 16, voicing(X.ch, X.T, 7, 22), 0.5, { w: 'strings' });
      if (calm) add('stab', 0, 14, voicing(X.ch, X.T, 5, 19), 0.5, { w: 'ep' });
      if (type === 'verse') X.mel('ep', 0.65, 0);
      else if (ch) X.mel('strings', 0.7, 12, { harm: k > 0.6 ? 0.4 : 0, hw: 'strings' });
      else if (calm) X.mel('ep', 0.4, 0, { slow: true });
    }
  }
};
const STYLE_NAMES = Object.keys(STYLES);
/* Lead voices per style, picked with start({lead}): every foreground
   melody event (fg, written by mel() and the surf intro, in every section
   type) plays in the voice LEADS[style][lead]. 0 is always the original
   voices (eurobeat: pluck in the verse, supersaw in the chorus). Styles
   without an entry keep theirs. Arpeggios, stabs and the calm accompaniment
   are not melody and never change. */
const LEADS = {
  euro: { 0: 'ssaw', 1: 'warm', 2: 'hollow', 3: 'flute' },
  surf: { 0: 'gtr', 1: 'twang', 2: 'dark', 3: 'sing' }
};
const LEAD_DEFAULT = { euro: 1, surf: 3 };
/* the lead index a style plays for a requested one (null or unknown: its default; 0: none to swap) */
function leadIndex(style, lead) {
  const LS = LEADS[style];
  if (!LS) return 0;
  return lead != null && LS[lead] ? +lead : LEAD_DEFAULT[style];
}

/* The per-seed piece: key, tempo, progressions, the four motifs. */
function makePiece(seed, style) {
  const name = STYLES[style] ? style : 'march', S = STYLES[name];
  const r = rng(hash(seed >>> 0 || 1, 0x51ce));
  const p = { style: name, seed: seed >>> 0 || 1 };
  p.tonic = pick(r, S.tonic);
  p.bpm = S.bpm[0] + Math.floor(r() * (S.bpm[1] - S.bpm[0] + 1));
  p.progV = pick(r, S.progV);
  p.progC = pick(r, S.progC);
  p.progC2 = r() < 0.65 ? p.progC : pick(r, S.progC);
  p.vA = makeMotif(r, S); p.vB = makeAnswer(r, S, p.vA);
  p.cA = makeMotif(r, S); p.cB = makeAnswer(r, S, p.cA);
  p.bassPat = Math.floor(r() * 3);
  return p;
}

function Composer(seed, style) {
  this.seed = (seed >>> 0) || 1;
  this.P = makePiece(this.seed, style);
  this.S = STYLES[this.P.style];
  this.sec = null;
  this.secIndex = -1;
  this.calm = false;
  this.cut = null;                         // a section type to open with
}

/* What follows a section. High intensity: more choruses, fewer breaks. */
Composer.prototype.nextType = function (prev, r, k) {
  if (this.calm) return 'calm';
  switch (prev) {
    case null: return 'intro';
    case 'intro': return 'verse';
    case 'verse': return r() < 0.35 + 0.5 * k ? 'chorus' : 'verse';
    case 'chorus': return wpick(r, [['verse', 0.9 - 0.5 * k], ['chorus', 0.15 + 0.6 * k], ['break', 0.45 - 0.25 * k]]);
    case 'break': return 'chorus';
    case 'calm': return 'verse';
  }
  return 'verse';
};

Composer.prototype.newSection = function (k) {
  const idx = ++this.secIndex, r = rng(hash(this.seed, idx + 1));
  let type = this.cut || this.nextType(this.sec ? this.sec.type : null, r, k);
  this.cut = null;
  if (this.calm) type = 'calm';
  this.sec = { type, idx, r, bars: (this.S.bars && this.S.bars[type]) || SECTION_BARS[type], bar: 0 };
};

/* The chord of bar b of a section. */
Composer.prototype.chordAt = function (type, b) {
  const P = this.P;
  if (type === 'chorus' || type === 'break') return (b % 8 < 4 ? P.progC : P.progC2)[b % 4];
  return P.progV[b % 4];
};

/* One bar: {type, secBar, bars, secIndex, chord, root, tonic, bpm, style, events}.
   Event: {v: voice, s: start in sixteenths, l: length in sixteenths,
           n: MIDI note or array, g: gain 0..1, w: timbre, ...}. */
Composer.prototype.nextBar = function (intensity) {
  const k = clamp(intensity == null ? 0.5 : +intensity || 0, 0, 1);
  if (!this.sec || this.sec.bar >= this.sec.bars || this.cut) this.newSection(k);
  const Sec = this.sec, b = Sec.bar, n = Sec.bars, type = Sec.type, P = this.P, S = this.S, T = P.tonic;
  const scale = SCALES[S.scale];
  const ch = this.chordAt(type, b);
  const next = b + 1 < n ? this.chordAt(type, b + 1) : this.chordAt(type === 'verse' || type === 'intro' ? 'verse' : 'chorus', 0);
  const bassOf = (c) => { let m = T - 12 + c[0]; if (m > T - 12 + 8) m -= 12; return m; };
  const root = bassOf(ch), nroot = bassOf(next);
  // a step into the next root: from a semitone or a scale step below or above
  const approach = nroot === root ? root + 7 : nroot > root ? nroot - (Sec.r() < 0.5 ? 1 : 2) : nroot + (Sec.r() < 0.5 ? 1 : 2);
  const ev = [];
  const add = (v, s, l, note, g, x) => ev.push(Object.assign({ v, s, l, n: note, g: clamp(g, 0.01, 1) }, x || {}));
  const cs = chordScale(ch, scale), cp = chordPcs(ch);
  /* the section's tune in this bar: question and answer over eight bars */
  const mel = (w, g, o, opt) => {
    opt = opt || {};
    const motifs = type === 'chorus' ? [P.cA, P.cB] : [P.vA, P.vB];
    const M = motifs[Math.floor(b / 2) % 2], half = b % 2;
    for (const x of M) {
      if (Math.floor(x.s / 16) !== half) continue;
      const s = x.s % 16;
      let m = deg(x.d, T + 12, scale) + (o || 0);
      m = s % 4 === 0 || x.l >= 4 ? nearest(m, T, cp) : nearest(m, T, cs);
      const l = opt.slow ? Math.max(x.l, 4) : x.l;
      if (opt.slow && s % 4) continue;          // calm: the strong notes only, held
      if (opt.trem && l >= 3) {
        for (let q = 0; q < l && s + q < 16; q++) add('lead', s + q, 1, m, g * (q % 2 ? 0.75 : 1), { w, fg: 1 });
        if (opt.dbl) add('lead', s, l, m - 12, g * opt.dbl, { w, fg: 1 });
      } else {
        add('lead', s, l, m, g, { w, fg: 1 });
        if (opt.dbl) add('lead', s, l, m - 12, g * opt.dbl, { w, fg: 1 });
      }
      if (opt.harm) {                           // a third or so below, in the chord's scale
        const h = nearest(m - 3, T, cs);
        add('lead', s, l, h < m ? h : m - 4, g * opt.harm, { w: opt.hw || w, fg: 1 });
      }
    }
  };
  S.bar({ b, n, type, k, r: Sec.r, T, P, ch, next, root, approach, last: b === n - 1, add, mel });
  Sec.bar++;
  return { type, secBar: b, bars: n, secIndex: Sec.idx, chord: ch, root, tonic: T, bpm: P.bpm,
           style: P.style, swing: S.swing, events: ev };
};

/* --------------------------------------------------------------- audio layer */

const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
function SWE() {
  const SW = root.Synthwave || (typeof require === 'function' ? require('./synthwave.js') : null);
  if (!SW || !SW.Engine) throw new Error('arcade-music.js needs synthwave.js loaded first');
  return SW.Engine;
}

/* The engine: synthwave's helper methods (osc, hit, adsr, filter,
   noiseSrc, send, impulse, kotoBuffer, hat, crash, riser, impact) on a
   plain chain without its pump, biome filter or ambience:
   voices -> drums/music -> mix -> impact lowpass -> impact gain -> glue -> limiter -> out. */
function ArcadeEngine(ctx, opts) {
  const P = opts.piece, S = STYLES[P.style], c = ctx, sr = c.sampleRate;
  this.ctx = ctx; this.P = P; this.S = S;
  this.ar = rng(hash(P.seed, 0xa0d10));
  this.kotoCache = {}; this.pw = {};
  this.noise = c.createBuffer(1, sr * 2, sr);
  const nd = this.noise.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = this.ar() * 2 - 1;
  this.out = c.createGain(); this.out.gain.value = opts.volume == null ? 0.8 : opts.volume;
  this.out.connect(c.destination);
  const limiter = c.createDynamicsCompressor();
  limiter.threshold.value = -3; limiter.knee.value = 0; limiter.ratio.value = 20;
  limiter.attack.value = 0.002; limiter.release.value = 0.1;
  limiter.connect(this.out);
  const glue = c.createDynamicsCompressor();
  glue.threshold.value = -14; glue.knee.value = 6; glue.ratio.value = 2.5;
  glue.attack.value = 0.005; glue.release.value = 0.15;
  glue.connect(limiter);
  this.biomeLp = c.createGain(); this.biomeLp.connect(glue);   // where impact() sends its hit
  this.mix = c.createGain(); this.mix.gain.value = 0.75;
  this.impLp = c.createBiquadFilter(); this.impLp.type = 'lowpass'; this.impLp.frequency.value = 20000; this.impLp.Q.value = 0.7;
  this.impG = c.createGain();
  this.mix.connect(this.impLp).connect(this.impG).connect(this.biomeLp);
  this.drums = c.createGain(); this.drums.gain.value = 0.9; this.drums.connect(this.mix);
  this.music = c.createGain(); this.music.gain.value = 0.8; this.music.connect(this.mix);
  this.duck = this.music;                  // nothing here pumps it
  this.marks = []; this.lastImpact = { t: -1, k: 0 }; this.sources = [];
  // a room, small for the chip march, a spring-like splash for surf
  this.revIn = c.createGain();
  const conv = c.createConvolver(); conv.buffer = this.impulse(S.room.len, 0.008);
  this.revOut = c.createGain(); this.revOut.gain.value = S.room.gain;
  const revHp = this.filter('highpass', 250);
  this.revIn.connect(revHp).connect(conv).connect(this.revOut).connect(this.mix);
  // one echo line
  this.dlyIn = c.createGain();
  this.dly = c.createDelay(2);
  this.dlyFb = c.createGain(); this.dlyFb.gain.value = S.echo.fb;
  const dlyLp = this.filter('lowpass', 3000), dlyOut = c.createGain(); dlyOut.gain.value = 0.4;
  this.dlyIn.connect(this.dly); this.dly.connect(dlyLp).connect(this.dlyFb).connect(this.dly);
  dlyLp.connect(dlyOut).connect(this.mix);
  this.only = opts.only || null;           // diagnostics: render some voices only
  this.lead = leadIndex(P.style, opts.lead);   // which voice plays the melody
  this.setBpm(opts.bpm || P.bpm, 0);
}

function wireEngine() {
  if (ArcadeEngine.wired) return;
  const E = SWE();
  const base = E.prototype, A = ArcadeEngine.prototype;
  for (const key of ['osc', 'hit', 'adsr', 'filter', 'noiseSrc', 'send', 'impulse', 'kotoBuffer', 'crash', 'riser', 'impact', 'stepDur'])
    A[key] = base[key];
  A.swHat = base.hat;
  ArcadeEngine.wired = true;
}

const AP = ArcadeEngine.prototype;
AP.setBpm = function (bpm, at) {
  this.bpm = clamp(bpm, 60, 200);
  const t = at == null ? this.ctx.currentTime : at, e = this.S.echo;
  const d = e.time === 'slap' ? 0.11 : e.time === 'd8' ? 0.75 * 60 / this.bpm : 0.5 * 60 / this.bpm;
  this.dly.delayTime.setTargetAtTime(d, t, 0.02);
};

/* a pulse wave with duty d (0.125, 0.25, 0.5), the NES lead */
AP.pulse = function (d) {
  if (this.pw[d]) return this.pw[d];
  const N = 48, re = new Float32Array(N), im = new Float32Array(N);
  for (let n = 1; n < N; n++) re[n] = 2 / (n * Math.PI) * Math.sin(n * Math.PI * d);
  return (this.pw[d] = this.ctx.createPeriodicWave(re, im));
};
AP.posc = function (d, f, t, end) {
  const o = this.ctx.createOscillator();
  o.setPeriodicWave(this.pulse(d)); o.frequency.value = f;
  o.start(t); o.stop(end);
  return o;
};
AP.sat = function (drive) {
  const key = 'sat' + drive;
  if (!this[key]) {
    const n = 1024, cv = new Float32Array(n);
    for (let i = 0; i < n; i++) { const x = i / (n - 1) * 2 - 1; cv[i] = Math.tanh(drive * x) / Math.tanh(drive); }
    this[key] = cv;
  }
  const w = this.ctx.createWaveShaper(); w.curve = this[key];
  return w;
};

/* ---------------------------------------------------------------- drums */

AP.kick = function (t, g, w) {
  if (w === 'chip') {
    const o = this.posc(0.5, 180, t, t + 0.15), lp = this.filter('lowpass', 1400);
    o.frequency.setValueAtTime(190, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.06);
    o.connect(lp).connect(this.hit(t, 0.6 * g, 0.035)).connect(this.drums);
    return;
  }
  const rock = w === 'rock';
  const o = this.osc('sine', 150, 0, t, t + 0.6);
  o.frequency.setValueAtTime(rock ? 120 : 155, t);
  o.frequency.exponentialRampToValueAtTime(rock ? 52 : 48, t + (rock ? 0.09 : 0.07));
  const a = this.hit(t, (rock ? 0.45 : 0.42) * g, rock ? 0.15 : 0.12);
  o.connect(a).connect(this.sat(1.6)).connect(this.drums);
  const n = this.noiseSrc(t, 0.03), f = this.filter(rock ? 'lowpass' : 'highpass', rock ? 2500 : 3200);
  n.connect(f).connect(this.hit(t, (rock ? 0.2 : 0.12) * g, rock ? 0.008 : 0.004)).connect(this.drums);
};

AP.snare = function (t, g, w) {
  const c = this.ctx;
  if (w === 'chip') {
    const n = this.noiseSrc(t, 0.2), hp = this.filter('highpass', 1800);
    n.connect(hp).connect(this.hit(t, 0.7 * g, 0.045)).connect(this.drums);
    const o = this.posc(0.5, 240, t, t + 0.06);
    o.frequency.setValueAtTime(260, t); o.frequency.exponentialRampToValueAtTime(150, t + 0.04);
    o.connect(this.hit(t, 0.2 * g, 0.02)).connect(this.drums);
    return;
  }
  if (w === 'clap') {
    const n = this.noiseSrc(t, 0.5), bp = this.filter('bandpass', 1250, 1.3), a = c.createGain(), p = a.gain;
    p.setValueAtTime(0, t);
    for (let q = 0; q < 3; q++) { p.setValueAtTime(0.9 * g, t + q * 0.01); p.setTargetAtTime(0, t + q * 0.01 + 0.001, 0.004); }
    p.setValueAtTime(0.7 * g, t + 0.031); p.setTargetAtTime(0, t + 0.032, 0.07);
    n.connect(bp).connect(a).connect(this.drums);
    this.send(a, 0.35 * g);
    return;
  }
  // rock: a body and a rattle, into the room
  const body = this.osc('triangle', 190, 0, t, t + 0.25);
  body.frequency.setValueAtTime(205, t); body.frequency.exponentialRampToValueAtTime(160, t + 0.08);
  body.connect(this.hit(t, 0.45 * g, 0.05)).connect(this.drums);
  const n = this.noiseSrc(t, 0.5), bp = this.filter('bandpass', 2600, 0.6);
  const a = this.hit(t, 0.75 * g, 0.11);
  n.connect(bp).connect(a).connect(this.drums);
  this.send(a, 0.35 * g);
};

AP.hat = function (t, g, open, w) {
  if (w !== 'chip') return this.swHat(t, g, open);
  const n = this.noiseSrc(t, 0.2), hp = this.filter('highpass', 8500);
  n.connect(hp).connect(this.hit(t, 0.35 * g, open ? 0.06 : 0.012)).connect(this.drums);
};

AP.tom = function (t, g, note) {
  const f = mtof(note), o = this.osc('sine', f, 0, t, t + 0.6);
  o.frequency.setValueAtTime(f * 1.6, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.06);
  const a = this.hit(t, 0.55 * g, 0.16);
  o.connect(a).connect(this.drums);
  this.send(a, 0.25);
};

/* ----------------------------------------------------------------- tones */

AP.bass = function (t, note, len, g, w) {
  const c = this.ctx, f = mtof(note), end = t + len + 0.4;
  if (w === 'tri') {
    const o = this.osc('triangle', f, 0, t, end);
    o.connect(this.adsr(t, 0.45 * g, 0.004, len * 0.92, 0.025)).connect(this.music);
    return;
  }
  const o1 = this.osc(w === 'pick' ? 'square' : 'sawtooth', f, -6, t, end);
  const o2 = this.osc('sawtooth', f, 6, t, end), sub = this.osc('sine', f, 0, t, end);
  const lp = this.filter('lowpass', 400, w === 'funk' ? 7 : w === 'saw' ? 4 : 1.5);
  const top = w === 'funk' ? 2600 : w === 'saw' ? 2200 : 1100, floor = w === 'funk' ? 320 : w === 'saw' ? 380 : 450;
  lp.frequency.setValueAtTime(top, t);
  lp.frequency.setTargetAtTime(floor, t + 0.004, w === 'funk' ? 0.05 : 0.08);
  const mg = c.createGain(); mg.gain.value = 0.35;
  const sg = c.createGain(); sg.gain.value = 0.6;
  o1.connect(mg); o2.connect(mg); mg.connect(lp); sub.connect(sg);
  const a = this.adsr(t, (w === 'pick' ? 0.21 : 0.25) * g, 0.003, len * 0.9, w === 'pick' ? 0.06 : 0.03);
  lp.connect(a); sg.connect(a); a.connect(this.music);
};

/* One note of a melodic voice w. */
AP.tone = function (w, t, note, len, g, quiet) {
  const c = this.ctx, f = mtof(note), end = t + len + 1.2;
  const vib = (o, depth, at) => {                 // a vibrato that comes in late
    const lfo = this.osc('sine', 5.6, 0, t, end), lg = c.createGain();
    lg.gain.setValueAtTime(0, t); lg.gain.setValueAtTime(0, t + at); lg.gain.linearRampToValueAtTime(depth, t + at + 0.2);
    lfo.connect(lg); for (const x of o) lg.connect(x.detune);
  };
  if (w === 'p25' || w === 'p12' || w === 'p50') {
    const d = w === 'p25' ? 0.25 : w === 'p12' ? 0.125 : 0.5, o = this.posc(d, f, t, end);
    if (len > 0.3 && !quiet) vib([o], 14, 0.15);
    o.connect(this.adsr(t, 0.3 * g, 0.003, len * 0.92, 0.03)).connect(this.music);
    return;
  }
  if (w === 'pluck') {
    const o1 = this.osc('sawtooth', f, -9, t, end), o2 = this.osc('sawtooth', f, 9, t, end);
    const lp = this.filter('lowpass', 4000, 2);
    lp.frequency.setValueAtTime(5200, t); lp.frequency.setTargetAtTime(900, t + 0.005, 0.09);
    o1.connect(lp); o2.connect(lp);
    const a = this.hit(t, 0.35 * g, Math.min(0.35, 0.1 + 0.4 * len));
    lp.connect(a).connect(this.music);
    this.send(a, 0.2, quiet ? 0 : 0.25);
    return;
  }
  /* The eurobeat chorus lead, in three softer takes (2026-11-22: the
     five-saw supersaw below, lead 0, was too harsh to hear for minutes).
     All three: a soft attack, a lowpass that opens with the note and
     settles back, an octave below for body, a short echo for width. */
  if (w === 'warm') {                       // 1: two gently detuned saws, a triangle an octave down
    const lp = this.filter('lowpass', 1200, 0.7);
    lp.frequency.setValueAtTime(900, t);
    lp.frequency.linearRampToValueAtTime(2600, t + 0.03);
    lp.frequency.setTargetAtTime(1500, t + 0.04, 0.15);
    const os = [this.osc('sawtooth', f, -5, t, end), this.osc('sawtooth', f, 5, t, end)];
    for (const o of os) o.connect(lp);
    const sub = this.osc('triangle', f / 2, 0, t, end), sg = c.createGain(); sg.gain.value = 0.9;
    sub.connect(sg).connect(lp);
    if (len > 0.25) vib(os.concat([sub]), 9, 0.2);
    const a = this.adsr(t, 0.17 * g, 0.018, len, 0.1);
    lp.connect(a).connect(this.music);
    this.send(a, 0.25, this.S.echo.send);
    return;
  }
  if (w === 'hollow') {                     // 2: a square, filtered round, with a sine an octave down
    const lp = this.filter('lowpass', 1400, 1);
    lp.frequency.setValueAtTime(1000, t);
    lp.frequency.linearRampToValueAtTime(2400, t + 0.025);
    lp.frequency.setTargetAtTime(1600, t + 0.03, 0.12);
    const o = this.osc('square', f, 0, t, end), sub = this.osc('sine', f / 2, 0, t, end);
    const og = c.createGain(); og.gain.value = 0.6;
    const sg = c.createGain(); sg.gain.value = 0.8;
    o.connect(og).connect(lp); sub.connect(sg).connect(lp);
    if (len > 0.25) vib([o, sub], 11, 0.18);
    const a = this.adsr(t, 0.2 * g, 0.012, len, 0.09);
    lp.connect(a).connect(this.music);
    this.send(a, 0.25, this.S.echo.send);
    return;
  }
  if (w === 'flute') {                      // 3: sine and triangle in a slow chorus, a breath of saw
    const lp = this.filter('lowpass', 2200, 0.5), os = [];
    for (const [type, dt, lv] of [['sine', -6, 0.7], ['triangle', 6, 0.6], ['sawtooth', 0, 0.12]]) {
      const o = this.osc(type, f, dt, t, end), og = c.createGain(); og.gain.value = lv;
      o.connect(og).connect(lp); os.push(o);
    }
    const sub = this.osc('sine', f / 2, 0, t, end), sg = c.createGain(); sg.gain.value = 0.35;
    sub.connect(sg).connect(lp); os.push(sub);
    if (len > 0.2) vib(os, 12, 0.15);
    const a = this.adsr(t, 0.24 * g, 0.025, len, 0.12);
    lp.connect(a).connect(this.music);
    this.send(a, 0.3, this.S.echo.send);
    return;
  }
  if (w === 'ssaw') {
    const lp = this.filter('lowpass', 5500, 0.7), os = [];
    for (const dt of [-17, -8, 0, 8, 17]) { const o = this.osc('sawtooth', f, dt, t, end); o.connect(lp); os.push(o); }
    if (len > 0.25) vib(os, 10, 0.18);
    const a = this.adsr(t, 0.12 * g, 0.008, len, 0.12);
    lp.connect(a).connect(this.music);
    this.send(a, 0.3, this.S.echo.send);
    return;
  }
  /* The surf lead in three gentler takes (2026-11-22: the overdriven pluck
     below, lead 0, was harsh under sixteenth-note tremolo). A plucked string
     with little or no drive, a lowpass, a short spring-like reverb and the
     slapback echo instead of the big splash. */
  if (w === 'twang' || w === 'dark' || w === 'sing') {
    const soft = w !== 'twang', K = this.kotoBuffer(note, soft), s = c.createBufferSource();
    s.buffer = K.buf; s.playbackRate.value = K.rate;
    if (w === 'sing' && len > 0.2) {          // a whammy-bar vibrato on the string
      const lfo = this.osc('sine', 5.2, 0, t, t + len + 0.5), lg = c.createGain();
      lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(K.rate * 0.006, t + 0.25);
      lfo.connect(lg).connect(s.playbackRate);
    }
    const lp = this.filter('lowpass', w === 'twang' ? 2600 : w === 'dark' ? 1700 : 2200, 0.7);
    if (w === 'dark') { const pre = c.createGain(); pre.gain.value = 1.3; s.connect(pre).connect(this.sat(1.4)).connect(lp); }
    else s.connect(lp);
    // a round body under the pluck: a triangle on the note, short for twang, held for sing
    const body = this.osc('triangle', f, 0, t, t + len + 0.6);
    const bg = w === 'sing' ? this.adsr(t, 0.12, 0.02, len, 0.08) : this.hit(t, w === 'dark' ? 0.1 : 0.14, 0.09);
    body.connect(bg).connect(lp);
    const a = c.createGain(), p = a.gain, lv = (w === 'twang' ? 1.1 : w === 'dark' ? 0.55 : 0.5) * g;   // sing: 0.95 until the owner asked for it clearly quieter (2026-11-22, about -5.6 dB)
    p.setValueAtTime(0, t); p.linearRampToValueAtTime(lv, t + 0.004);
    p.setValueAtTime(lv, t + len); p.setTargetAtTime(0, t + len, 0.04);
    lp.connect(a).connect(this.music);
    s.start(t); s.stop(Math.min(t + 3.1, t + len + 0.5));
    a.connect(this.spring());
    this.send(a, 0.12, this.S.echo.send + 0.15);
    return;
  }
  if (w === 'gtr' || w === 'mute' || w === 'clean') {
    const K = this.kotoBuffer(note, w === 'clean'), s = c.createBufferSource();
    s.buffer = K.buf; s.playbackRate.value = K.rate;
    const a = c.createGain(), p = a.gain, lv = (w === 'clean' ? 0.5 : w === 'mute' ? 0.28 : 0.32) * g;
    p.setValueAtTime(lv, t);
    p.setTargetAtTime(0, t + len, w === 'mute' ? 0.02 : 0.05);
    const lp = this.filter('lowpass', w === 'mute' ? 1600 : w === 'clean' ? 4500 : 3400, 0.8);
    if (w === 'clean') s.connect(lp);
    else { const pre = c.createGain(); pre.gain.value = 2.5; s.connect(pre).connect(this.sat(2.5)).connect(lp); }
    lp.connect(a).connect(this.music);
    s.start(t); s.stop(Math.min(t + 3.1, t + len + 0.5));
    this.send(a, w === 'mute' ? 0.1 : 0.55, w === 'mute' ? 0 : this.S.echo.send);
    return;
  }
  if (w === 'clav') {
    const o = this.osc('square', f, 0, t, t + 0.3), bp = this.filter('bandpass', 1500, 2.5);
    o.connect(bp).connect(this.hit(t, 0.8 * g, 0.05)).connect(this.music);
    return;
  }
  if (w === 'brass') {
    const o1 = this.osc('sawtooth', f, -6, t, end), o2 = this.osc('sawtooth', f, 6, t, end);
    const lp = this.filter('lowpass', 700, 1.2);
    lp.frequency.setValueAtTime(700, t); lp.frequency.linearRampToValueAtTime(3400, t + 0.04);
    lp.frequency.setTargetAtTime(2000, t + 0.05, 0.1);
    o1.connect(lp); o2.connect(lp);
    const a = this.adsr(t, 0.2 * g, 0.015, len, 0.07);
    lp.connect(a).connect(this.music);
    this.send(a, 0.25);
    return;
  }
  if (w === 'strings') {
    const lp = this.filter('lowpass', 3800, 0.6), os = [];
    for (const [dt, m] of [[-11, 1], [0, 1], [11, 1], [4, 2]]) { const o = this.osc('sawtooth', f * m, dt, t, end); o.connect(lp); os.push(o); }
    vib(os, 9, 0.1);
    const a = this.adsr(t, 0.08 * g, Math.min(0.08, len * 0.3), len, 0.22);
    lp.connect(a).connect(this.music);
    this.send(a, 0.45);
    return;
  }
  if (w === 'ep') {
    const o = this.osc('sine', f, 0, t, end), bell = this.osc('sine', f * 4, 0, t, t + 0.4);
    const bg = this.hit(t, 0.05 * g, 0.06);
    bell.connect(bg);
    const a = c.createGain(), p = a.gain;
    p.setValueAtTime(0, t); p.linearRampToValueAtTime(0.4 * g, t + 0.004);
    p.setTargetAtTime(0.16 * g, t + 0.01, 0.5); p.setTargetAtTime(0, t + len, 0.12);
    o.connect(a); bg.connect(a); a.connect(this.music);
    this.send(a, 0.3);
  }
};

/* A short spring-like reverb for the surf leads, built on first use:
   a 0.8 s room between a highpass and a lowpass. Returns its input. */
AP.spring = function () {
  if (this.springIn) return this.springIn;
  const c = this.ctx, conv = c.createConvolver(), out = c.createGain();
  conv.buffer = this.impulse(0.8, 0.003);
  out.gain.value = 0.35;
  this.springIn = c.createGain();
  this.springIn.connect(this.filter('highpass', 350)).connect(conv).connect(this.filter('lowpass', 3200)).connect(out).connect(this.mix);
  return this.springIn;
};

/* Schedule one composed bar at t0. Returns its duration. */
AP.scheduleBar = function (bar, t0) {
  const sd = this.stepDur(), sw = (bar.swing || 0) * sd;
  this.marks.push({ t0, sd, root: bar.root });
  if (this.marks.length > 4) this.marks.shift();
  for (const e of bar.events) {
    if (this.only && !this.only.includes(e.v)) continue;
    const t = t0 + e.s * sd + (sw && e.s % 2 === 1 ? sw : 0), len = e.l * sd;
    switch (e.v) {
      case 'kick': this.kick(t, e.g, e.w); break;
      case 'snare': this.snare(t, e.g, e.w); break;
      case 'hat': this.hat(t, e.g, e.open, e.w); break;
      case 'tom': this.tom(t, e.g, e.n); break;
      case 'crash': this.crash(t, e.g, len); break;
      case 'riser': this.riser(t, e.g, len); break;
      case 'bass': this.bass(t, e.n, len, e.g, e.w); break;
      case 'lead': this.tone(e.fg && this.lead ? LEADS[this.P.style][this.lead] : e.w, t, e.n, len, e.g); break;
      case 'stab': {
        const ns = [].concat(e.n), g = e.g * (ns.length > 1 ? 1.4 / ns.length : 1);
        for (const m of ns) this.tone(e.w, t, m, len, g, true);
        break;
      }
    }
  }
  return 16 * sd;
};

function makeComposer(opts) {
  const comp = new Composer(opts.seed, opts.style);
  comp.calm = !!opts.calm;
  if (SECTION_BARS[opts.opening]) comp.cut = opts.opening;
  return comp;
}

/* ---------------------------------------------------------------- live player */

const ArcadeMusic = {
  _s: null,

  start(opts) {
    if (this._s) this.stop();
    wireEngine();
    opts = Object.assign({ seed: 1, style: 'march', intensity: 0.5, volume: 0.8 }, opts || {});
    const Ctx = root.AudioContext || root.webkitAudioContext;
    const ctx = this._ctx || (this._ctx = new Ctx({ latencyHint: 'playback' }));
    if (ctx.state === 'suspended') ctx.resume();
    const comp = makeComposer(opts);
    const eng = new ArcadeEngine(ctx, { piece: comp.P, volume: opts.volume, lead: opts.lead });
    const t0 = ctx.currentTime + (opts.at > 0 ? opts.at : 0), g = eng.out.gain;
    g.setValueAtTime(0, ctx.currentTime); g.setValueAtTime(0, t0);
    g.linearRampToValueAtTime(opts.volume, t0 + (opts.fadeIn > 0 ? opts.fadeIn : 0.3));
    const s = this._s = { ctx, eng, comp, intensity: opts.intensity, volume: opts.volume, next: t0 + 0.05 };
    const tick = () => {
      if (this._s !== s) return;
      const ahead = root.document && root.document.hidden ? 1.5 : 0.3;
      while (s.next < ctx.currentTime + ahead) {
        if (s.next < ctx.currentTime) s.next = ctx.currentTime + 0.05;
        s.next += eng.scheduleBar(s.comp.nextBar(s.intensity), s.next);
      }
    };
    s.interval = setInterval(tick, 50);
    tick();
  },

  stop(fade) {
    const s = this._s;
    if (!s) return;
    this._s = null;
    clearInterval(s.interval);
    const f = fade > 0 ? fade : 0.4, t = s.ctx.currentTime, g = s.eng.out.gain;
    g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(0, t + f);
    setTimeout(() => { s.eng.out.disconnect(); }, (f + 0.2) * 1000);
  },

  /* o.cross: the new piece fades in while the old one fades out, instead of after it */
  swap(opts, o) {
    o = o || {};
    const gap = o.gap > 0 ? o.gap : 0.4;
    if (this._s) this.stop(gap);
    this.start(Object.assign({}, opts, { at: this._ctx && !o.cross ? gap : 0, fadeIn: o.fadeIn > 0 ? o.fadeIn : 0.4 }));
  },

  pause() { if (this._ctx) this._ctx.suspend(); },
  resume() { if (this._ctx) this._ctx.resume(); },
  playing() { return !!this._s && this._ctx.state === 'running'; },
  setIntensity(x) { if (this._s) this._s.intensity = clamp(+x || 0, 0, 1); },
  setCalm(on) { if (this._s) this._s.comp.calm = !!on; },
  impact(k) { const s = this._s; if (s && s.ctx.state === 'running') s.eng.impact(k); },
  setVolume(v, tau) {
    const s = this._s;
    if (!s) return;
    s.volume = clamp(+v, 0, 1);
    const g = s.eng.out.gain, t = s.ctx.currentTime;
    g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.setTargetAtTime(s.volume, t, tau > 0 ? tau : 0.05);
  },

  /* offline, the same music; opts.impacts: [[t, k], ...] */
  render(seconds, opts) {
    wireEngine();
    opts = Object.assign({ seed: 1, style: 'march', intensity: 0.5, volume: 0.8, sampleRate: 44100 }, opts || {});
    const ctx = new OfflineAudioContext(2, Math.ceil(opts.sampleRate * seconds), opts.sampleRate);
    const comp = makeComposer(opts), eng = new ArcadeEngine(ctx, { piece: comp.P, volume: opts.volume, only: opts.only, lead: opts.lead });
    const imps = (opts.impacts || []).slice().sort((x, y) => x[0] - y[0]), bars = [];
    let next = 0.05;
    const feed = () => {
      while (next < ctx.currentTime + 0.5 && next < seconds) {
        const k = typeof opts.intensity === 'function' ? opts.intensity(next) : opts.intensity;
        const bar = comp.nextBar(k);
        bars.push({ t: next, type: bar.type, events: bar.events.length });
        next += eng.scheduleBar(bar, next);
      }
      while (imps.length && imps[0][0] < next - 0.3) { const x = imps.shift(); eng.impact(x[1], x[0]); }
      const q = 128 / opts.sampleRate, at = Math.ceil((next - 0.4) / q) * q;
      if (next < seconds && at < seconds) ctx.suspend(at).then(() => { feed(); ctx.resume(); });
    };
    feed();
    return ctx.startRendering().then(buf => { buf.bars = bars; buf.piece = comp.P; return buf; });
  },

  STYLES: STYLE_NAMES, LEADS, LEAD_DEFAULT, leadIndex,
  // pure layer, for tests
  Composer, makePiece, makeMotif, makeAnswer, chordScale, chordPcs, voicing, nearest, deg,
  SCALES, QUAL, STYLE_DEFS: STYLES, SECTION_BARS, ArcadeEngine, rng
};

root.ArcadeMusic = ArcadeMusic;
if (typeof module !== 'undefined' && module.exports) module.exports = ArcadeMusic;
})(typeof window !== 'undefined' ? window : globalThis);
