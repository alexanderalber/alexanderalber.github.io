/* hikyaku-sfx.js -- the courier's own sound for Hikyaku: a faint engine and
 * the wind, from thrust and airspeed (flight feedback 2026-10-26, item 16).
 *
 * Deliberately quiet: it sits under the music (synthwave.js), as a body
 * sound you notice when it stops rather than when it plays. MAX_GAIN caps
 * the whole layer; volume 0..1 (the panel slider) scales below that.
 *
 * Two layers, like courier.js:
 *
 *   - Pure layer, no Web Audio. params(thrust, fwd, v) maps the controls
 *     to the sound: thrust 0..1 (the largest RCS channel use over all
 *     axes but forward), fwd 0..1 (the forward thrust in use, up to 2.5 g:
 *     HikyakuFlight info.fwdUse, the rear nozzles) and the airspeed v in
 *     m/s give
 *     the hum's pitch and level, the engine hiss's band and level, and the
 *     wind's filter and level. Tested in notes/dev/hikyaku-sfx.test.mjs.
 *   - Audio layer: create(ctx?, opts) builds three voices on a context.
 *       hum:  two slightly detuned saws an octave apart, low-passed: the
 *             drive. Present at idle (the ship hovers on its fans), rises in
 *             pitch and level with thrust, more with forward thrust.
 *       hiss: looped noise through a band-pass whose centre climbs with
 *             thrust and forward thrust: the exhaust.
 *       wind: looped noise, high- and low-passed; both edges open with
 *             speed, the level goes with v squared (dynamic pressure).
 *     Without ctx it makes its own AudioContext, so switching the music off
 *     (which suspends the music's context) does not silence the engine.
 *     Like any AudioContext it must be created or resumed from a gesture:
 *     call resume() in a key or click handler.
 *
 * API (globalThis.HikyakuSfx):
 *   params(thrust, fwd, v) -> { humHz, humLp, humGain, hissHz, hissGain,
 *                                 windHp, windLp, windGain }   gains 0..1
 *   create(ctx?, { volume }) -> {
 *     ctx, update(thrust, fwd, v), setVolume(0..1), setActive(bool),
 *     resume(), stop() }
 *   setActive(false) fades the layer out (menu, pause), true fades it in.
 */
(function (root) {
  'use strict';

  var C = {
    MAX_GAIN: 0.16,     // bus gain at volume 1; calibrated against the music, see notes/tools/hikyaku/SOUND-PATCH.md
    V_WIND: 75,         // m/s where the wind is at full level (the top speed, HikyakuFlight vNose)
    W_HUM: 0.55, W_HISS: 0.3, W_WIND: 0.5,   // voice weights inside the bus
    TAU_ENGINE: 0.08,   // s, follows the stick closely
    TAU_WIND: 0.35,     // s, air has inertia
    TAU_ACTIVE: 0.25,   // s, fade on menu and pause
    MIN_DT: 1 / 30      // s, update() applies at most this often
  };

  function clamp01(x) { x = +x; return x > 0 ? (x < 1 ? x : 1) : 0; }

  /* The sound for a control state. Pure. */
  function params(thrust, fwd, v) {
    var T = clamp01(thrust), B = clamp01(fwd), w = clamp01((+v || 0) / C.V_WIND);
    var humHz = 41 + 22 * T + 18 * B;
    return {
      humHz: humHz,
      humLp: humHz * (3 + 3 * T + 4 * B),
      humGain: 0.35 + 0.4 * T + 0.25 * B,
      hissHz: 260 + 640 * T + 1300 * B,
      hissGain: 0.06 + 0.44 * T + 0.5 * B,
      windHp: 180 + 520 * w,
      windLp: 700 + 6300 * w,
      windGain: w * w
    };
  }

  function noiseBuffer(ctx, secs, seed) {
    var sr = ctx.sampleRate, n = Math.floor(sr * secs), buf = ctx.createBuffer(1, n, sr);
    var d = buf.getChannelData(0), a = seed >>> 0;
    for (var i = 0; i < n; i++) {                         // mulberry32, so renders repeat
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      d[i] = (((t ^ (t >>> 14)) >>> 0) / 4294967296) * 2 - 1;
    }
    return buf;
  }

  function create(ctx, opts) {
    opts = opts || {};
    var own = !ctx;
    if (own) {
      var Ctx = root.AudioContext || root.webkitAudioContext;
      if (!Ctx) return null;
      ctx = new Ctx({ latencyHint: 'interactive' });
    }
    var c = ctx, t0 = c.currentTime;
    var volume = opts.volume == null ? 0.5 : clamp01(opts.volume), active = opts.active !== false;
    var bus = c.createGain();
    bus.gain.value = active ? C.MAX_GAIN * volume : 0;
    bus.connect(opts.destination || c.destination);

    var p0 = params(0, 0, 0);
    // hum
    var humLp = c.createBiquadFilter(); humLp.type = 'lowpass'; humLp.Q.value = 0.8; humLp.frequency.value = p0.humLp;
    var humG = c.createGain(); humG.gain.value = 0;
    var o1 = c.createOscillator(), o2 = c.createOscillator();
    o1.type = o2.type = 'sawtooth';
    o1.frequency.value = p0.humHz; o2.frequency.value = p0.humHz * 2; o2.detune.value = 9;
    var o2g = c.createGain(); o2g.gain.value = 0.35;
    o1.connect(humLp); o2.connect(o2g).connect(humLp);
    humLp.connect(humG).connect(bus);
    // hiss
    var nb = noiseBuffer(c, 3, 0x51f7), nb2 = noiseBuffer(c, 3.7, 0x7a11);
    var hissSrc = c.createBufferSource(); hissSrc.buffer = nb; hissSrc.loop = true;
    var hissBp = c.createBiquadFilter(); hissBp.type = 'bandpass'; hissBp.Q.value = 0.9; hissBp.frequency.value = p0.hissHz;
    var hissG = c.createGain(); hissG.gain.value = 0;
    hissSrc.connect(hissBp).connect(hissG).connect(bus);
    // wind
    var windSrc = c.createBufferSource(); windSrc.buffer = nb2; windSrc.loop = true;
    var windHp = c.createBiquadFilter(); windHp.type = 'highpass'; windHp.Q.value = 0.5; windHp.frequency.value = p0.windHp;
    var windLp = c.createBiquadFilter(); windLp.type = 'lowpass'; windLp.Q.value = 0.5; windLp.frequency.value = p0.windLp;
    var windG = c.createGain(); windG.gain.value = 0;
    windSrc.connect(windHp).connect(windLp).connect(windG).connect(bus);

    o1.start(t0); o2.start(t0); hissSrc.start(t0); windSrc.start(t0);
    var last = -1, stopped = false;

    function apply(P, t) {
      var e = C.TAU_ENGINE, w = C.TAU_WIND;
      o1.frequency.setTargetAtTime(P.humHz, t, e);
      o2.frequency.setTargetAtTime(P.humHz * 2, t, e);
      humLp.frequency.setTargetAtTime(P.humLp, t, e);
      humG.gain.setTargetAtTime(C.W_HUM * P.humGain, t, e);
      hissBp.frequency.setTargetAtTime(P.hissHz, t, e);
      hissG.gain.setTargetAtTime(C.W_HISS * P.hissGain, t, e);
      windHp.frequency.setTargetAtTime(P.windHp, t, w);
      windLp.frequency.setTargetAtTime(P.windLp, t, w);
      windG.gain.setTargetAtTime(C.W_WIND * P.windGain, t, w);
    }
    function busTo(target, tau) {
      var t = c.currentTime;
      bus.gain.cancelScheduledValues(t);
      bus.gain.setValueAtTime(bus.gain.value, t);
      bus.gain.setTargetAtTime(target, t, tau);
    }
    apply(p0, t0);

    return {
      ctx: c,
      /* every frame is fine: applied at most every MIN_DT */
      update: function (thrust, fwd, v, at) {
        if (stopped) return;
        var t = at == null ? c.currentTime : at;
        if (at == null && t - last < C.MIN_DT) return;
        last = t;
        apply(params(thrust, fwd, v), t);
      },
      setVolume: function (v) { volume = clamp01(v); if (active) busTo(C.MAX_GAIN * volume, 0.05); },
      setActive: function (on) { on = !!on; if (on === active) return; active = on; busTo(on ? C.MAX_GAIN * volume : 0, C.TAU_ACTIVE); },
      resume: function () { if (c.state === 'suspended' && c.resume) c.resume(); },
      stop: function () {
        if (stopped) return;
        stopped = true;
        busTo(0, 0.05);
        setTimeout(function () {
          try { o1.stop(); o2.stop(); hissSrc.stop(); windSrc.stop(); } catch (e) { /* already stopped */ }
          bus.disconnect();
          if (own && c.close) c.close();
        }, 300);
      }
    };
  }

  var HikyakuSfx = { C: C, params: params, create: create };
  root.HikyakuSfx = HikyakuSfx;
  if (typeof module !== 'undefined' && module.exports) module.exports = HikyakuSfx;
})(typeof window !== 'undefined' ? window : globalThis);
