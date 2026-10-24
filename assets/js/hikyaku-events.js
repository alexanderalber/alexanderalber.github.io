/* hikyaku-events.js -- rare world events for Hikyaku: laser exchanges and
 * searchlights.
 *
 * The owner's rule for all of this: these things are good exactly when they
 * are rare. So every event kind has a rate per hour, and one global
 * liveliness multiplies all of them (0 switches the events off).
 *
 * Two layers, like courier.js:
 *
 *   - Pure layer, no three.js, no DOM. schedule(seed, t0, t1, opts) returns
 *     the events whose active window overlaps [t0, t1]. Time is cut into
 *     slots of SLOT seconds per kind; the number of events in a slot is a
 *     Poisson draw from a hash of (seed, kind, slot), and every event takes
 *     its parameters from a hash of (seed, kind, slot, index). Nothing is
 *     kept between calls, so any window can be asked for in any order and
 *     the answer is the same. A lower liveliness gives a subset of the
 *     events of a higher one (the Poisson draw is an inverse CDF of one
 *     fixed uniform). state(event, t) is the drawable state at time t, a
 *     closed formula in t: nothing is integrated.
 *   - Visual layer: create(THREE, { fog, colors }) builds fixed pools (16
 *     shot segments, 8 glows, 4 cones) and update(t, cameraPos, events)
 *     fills them. THREE is a parameter, never an import. All materials are
 *     additive ShaderMaterials that take the shared atmosphere through
 *     fog.inject (hikyaku-city.js makeFog), so they fade with distance like
 *     every other emissive thing in the scene.
 *
 * Origins: the caller passes pickOrigin(kind, rng, info) and clearance(p).
 * The schedule retries a pick a few times when clearance rejects it (or when
 * it lies closer than minDist to opts.around) and drops the event if no pick
 * passes. Because the page's picker depends on where the ship is right now,
 * the page passes a Map in opts.cache: an event seen once keeps its origin.
 *
 * Palette: green for the lasers on purpose. The city uses cyan and magenta,
 * so a third colour reads as foreign. Searchlights are a pale bone white,
 * not a neon.
 *
 * Everything hangs on globalThis.HikyakuEvents.
 */
(function () {
  'use strict';

  var DEG = Math.PI / 180;
  var SLOT = 60;                       // seconds per schedule slot
  var KINDS = ['laser', 'searchlight'];
  /* events per hour at liveliness 1 */
  var RATES = { laser: 20, searchlight: 40 };
  /* longest possible duration per kind, so a window query can look back */
  var MAXDUR = { laser: 8, searchlight: 200 };

  var LASER = {
    speed: 600,                        // m/s
    shots: [3, 8], window: [1, 2],     // shots per exchange, seconds
    len: [20, 40],                     // segment length, m
    elev: [10, 30],                    // degrees above horizontal
    range: [900, 1600],                // m a shot flies before it is gone
    replyChance: 0.55, replies: [1, 2],
    replyDist: [300, 600],             // airborne point, m from the origin
    minDist: 300                       // m from the ship, at least
  };
  var LIGHT = {
    dur: [60, 180], fadeIn: 5, fadeOut: 8,
    len: [260, 420], half: [3.5, 6.5], // cone length m, half angle degrees
    droneChance: 0.35,
    roofEl: [-20, 50], droneEl: [-75, -15],
    azAmp: [20, 55], azPer: [40, 80], elPer: [24, 50],
    droneR: [25, 60], dronePer: [50, 90], droneUp: [120, 220],
    minDist: 150
  };

  /* ---- hashing -------------------------------------------------------- */
  function mix32(h) {
    h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
    return (h ^ (h >>> 16)) >>> 0;
  }
  function hash() {
    var h = 0x9e3779b9;
    for (var i = 0; i < arguments.length; i++) h = mix32(h ^ mix32((arguments[i] | 0) + 0x632be5ab * (i + 1)));
    return h;
  }
  function rngFrom(s) {
    var a = s >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function uni(r, ab) { return ab[0] + (ab[1] - ab[0]) * r(); }
  function intIn(r, ab) { return ab[0] + Math.floor(r() * (ab[1] - ab[0] + 1)); }
  function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
  function smooth(a, b, x) { var u = clamp((x - a) / (b - a), 0, 1); return u * u * (3 - 2 * u); }
  function poissonInv(u, m) {
    var k = 0, p = Math.exp(-m), F = p;
    while (u > F && k < 12) { k++; p *= m / k; F += p; }
    return k;
  }
  function dist3(a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]); }
  function dirOf(az, el) { var c = Math.cos(el); return [c * Math.cos(az), Math.sin(el), c * Math.sin(az)]; }

  /* ---- origins --------------------------------------------------------- */
  /* Default picker: random ground points. With opts.around (the ship) on a
     ring around it, biased to the sides of opts.forward; without, uniform
     in a square of opts.extent around the world origin. */
  function defaultPicker(opts) {
    return function (kind, r, info) {
      var p;
      if (opts.around) {
        var c = opts.around, f = opts.forward || [0, 0, -1];
        var faz = Math.atan2(f[2], f[0]);
        var side = r() < 0.5 ? -1 : 1;
        var az = faz + side * Math.PI / 2 + (r() + r() - 1) * 50 * DEG;
        var rr = kind === 'laser' ? uni(r, [400, 1200]) : uni(r, [250, 1400]);
        p = [c[0] + rr * Math.cos(az), 0, c[2] + rr * Math.sin(az)];
      } else {
        var e = opts.extent || 2000;
        p = [(r() * 2 - 1) * e, 0, (r() * 2 - 1) * e];
      }
      if (kind === 'searchlight') p[1] = info && info.mount === 'drone' ? 0 : uni(r, [40, 200]);
      return p;
    };
  }
  function asPoint(v) {
    if (!v) return null;
    var p = Array.isArray(v) ? v : v.p;
    if (!p || !(isFinite(p[0]) && isFinite(p[1]) && isFinite(p[2]))) return null;
    return [p[0], p[1], p[2]];
  }
  function okPoint(p, opts, minDist) {
    if (!p) return false;
    if (opts.clearance && !opts.clearance(p)) return false;
    if (opts.around && dist3(p, opts.around) < minDist) return false;
    return true;
  }

  /* ---- event construction --------------------------------------------- */
  function makeLaser(ev, r, pick, opts) {
    var P = LASER, minD = opts.minDist != null ? opts.minDist : P.minDist;
    var o = null, pr = rngFrom(hash(ev.h, 77));
    for (var k = 0; k < 8 && !o; k++) {
      var c = asPoint(pick('laser', pr, ev.info));
      if (okPoint(c, opts, minD)) o = c;
    }
    if (!o) return null;
    var n = intIn(r, P.shots), W = uni(r, P.window);
    var az0 = r() * 2 * Math.PI, el0 = uni(r, [P.elev[0] + 4, P.elev[1] - 4]) * DEG;
    var shots = [], ts = [0];
    for (var i = 1; i < n; i++) ts.push(r() * W);
    ts.sort(function (a, b) { return a - b; });
    var end = 0;
    for (i = 0; i < n; i++) {
      var az = az0 + (r() + r() - 1) * 5 * DEG;
      var el = clamp(el0 + (r() * 2 - 1) * 4 * DEG, P.elev[0] * DEG, P.elev[1] * DEG);
      var from = [o[0] + (r() * 2 - 1) * 1.5, o[1] + 1 + r(), o[2] + (r() * 2 - 1) * 1.5];
      var s = { k: i, t: ts[i], from: from, dir: dirOf(az, el), len: uni(r, P.len), range: uni(r, P.range), reply: false };
      shots.push(s); end = Math.max(end, s.t + s.range / P.speed);
    }
    var air = null;
    if (r() < P.replyChance) {
      var D = uni(r, P.replyDist);
      var a = [o[0] + D * Math.cos(az0), o[1] + Math.max(60, D * Math.tan(el0) * uni(r, [0.6, 1.0])), o[2] + D * Math.sin(az0)];
      if (!opts.clearance || opts.clearance(a)) {
        air = a;
        var m = intIn(r, P.replies);
        for (var j = 0; j < m; j++) {
          var tgt = [o[0] + (r() * 2 - 1) * 12, o[1], o[2] + (r() * 2 - 1) * 12];
          var dx = tgt[0] - a[0], dy = tgt[1] - a[1], dz = tgt[2] - a[2], L = Math.hypot(dx, dy, dz);
          var rs = { k: n + j, t: uni(r, [0.4, W + 0.6]), from: a.slice(), dir: [dx / L, dy / L, dz / L], len: uni(r, P.len), range: L, reply: true };
          shots.push(rs); end = Math.max(end, rs.t + rs.range / P.speed);
        }
      }
    }
    ev.origin = o;
    ev.tEnd = ev.tStart + end + 0.5;
    ev.params = { speed: P.speed, shots: shots, air: air };
    return ev;
  }

  function makeLight(ev, r, pick, opts) {
    var P = LIGHT, drone = r() < P.droneChance;
    ev.info.mount = drone ? 'drone' : 'roof';
    var minD = opts.lightMinDist != null ? opts.lightMinDist : P.minDist;
    var o = null, pr = rngFrom(hash(ev.h, 78));
    var up = drone ? uni(r, P.droneUp) : 0;
    for (var k = 0; k < 8 && !o; k++) {
      var c = asPoint(pick('searchlight', pr, ev.info));
      if (c && drone) c[1] += up;
      if (okPoint(c, opts, minD)) o = c;
    }
    if (!o) return null;
    var eb = drone ? P.droneEl : P.roofEl;
    var half = (eb[1] - eb[0]) / 2, mid = (eb[0] + eb[1]) / 2;
    var elAmp = uni(r, [0.35, 0.8]) * half;
    var el0 = mid + (r() * 2 - 1) * (half - elAmp);
    var dur = uni(r, P.dur);
    ev.origin = o;
    ev.tEnd = ev.tStart + dur;
    ev.params = {
      mount: ev.info.mount, len: uni(r, P.len), half: uni(r, P.half) * DEG,
      elMin: eb[0] * DEG, elMax: eb[1] * DEG,
      az0: r() * 2 * Math.PI, azAmp: uni(r, P.azAmp) * DEG, azW: 2 * Math.PI / uni(r, P.azPer), azPh: r() * 2 * Math.PI,
      el0: el0 * DEG, elAmp: elAmp * DEG, elW: 2 * Math.PI / uni(r, P.elPer), elPh: r() * 2 * Math.PI,
      droneR: drone ? uni(r, P.droneR) : 0, droneW: drone ? (r() < 0.5 ? -1 : 1) * 2 * Math.PI / uni(r, P.dronePer) : 0,
      dronePh: r() * 2 * Math.PI, fadeIn: P.fadeIn, fadeOut: P.fadeOut
    };
    return ev;
  }

  /* ---- schedule ---------------------------------------------------------
     opts: liveliness (default 1), rates ({laser, searchlight} per hour),
     pickOrigin(kind, rng, info), clearance(p) -> bool, around ([x,y,z],
     the ship; enforces minDist), forward (default picker bias), minDist
     (lasers, default 300), lightMinDist (default 150), extent (default
     picker without around), cache (Map id -> event), kinds (subset). */
  function schedule(seed, t0, t1, opts) {
    var o = opts || {};
    var live = o.liveliness == null ? 1 : Math.max(0, o.liveliness);
    var rates = Object.assign({}, RATES, o.rates || {});
    var pick = o.pickOrigin || defaultPicker(o);
    var kinds = o.kinds || KINDS;
    var out = [];
    if (!(live > 0) || !(t1 >= t0)) return out;
    for (var ki = 0; ki < kinds.length; ki++) {
      var kind = kinds[ki], kidx = KINDS.indexOf(kind);
      if (kidx < 0) continue;
      var mean = (rates[kind] || 0) * live * SLOT / 3600;
      if (!(mean > 0)) continue;
      var s0 = Math.floor((t0 - MAXDUR[kind]) / SLOT), s1 = Math.floor(t1 / SLOT);
      for (var s = s0; s <= s1; s++) {
        var n = poissonInv(rngFrom(hash(seed, kidx, s, 0x51))(), mean);
        for (var j = 0; j < n; j++) {
          var id = kind + ':' + s + ':' + j;
          var ev = o.cache && o.cache.get(id);
          if (ev === undefined) {
            var h = hash(seed, kidx, s, j + 1);
            var r = rngFrom(h);
            ev = { kind: kind, id: id, tStart: (s + r()) * SLOT, tEnd: 0, origin: null, params: null, h: h };
            ev.info = { id: id, tStart: ev.tStart, mount: null };
            ev = kind === 'laser' ? makeLaser(ev, r, pick, o) : makeLight(ev, r, pick, o);
            if (ev) { delete ev.h; ev.info.tEnd = ev.tEnd; }
            if (o.cache) o.cache.set(id, ev);
          }
          if (ev && ev.tEnd >= t0 && ev.tStart <= t1) out.push(ev);
        }
      }
    }
    out.sort(function (a, b) { return a.tStart - b.tStart || (a.id < b.id ? -1 : 1); });
    return out;
  }

  /* expected events per hour for a kind */
  function perHour(kind, liveliness, rates) {
    var r = Object.assign({}, RATES, rates || {});
    return (r[kind] || 0) * (liveliness == null ? 1 : liveliness);
  }

  /* ---- state ------------------------------------------------------------ */
  function flash(x) { return x < 0 ? 0 : (1 - Math.exp(-x / 0.015)) * Math.exp(-x / 0.15); }

  function laserState(ev, t) {
    var P = ev.params, v = P.speed, tl = t - ev.tStart;
    var shots = [], gO = 0, gA = 0;
    for (var i = 0; i < P.shots.length; i++) {
      var s = P.shots[i], dt = tl - s.t;
      if (s.reply) gA += flash(dt); else gO += flash(dt);
      if (dt < 0) continue;
      var head = v * dt;
      if (head > s.range) continue;
      var tail = Math.max(0, head - s.len);
      var I = 1 - smooth(0.7 * s.range, s.range, head);
      shots.push({
        k: s.k, reply: s.reply, i: I,
        a: [s.from[0] + s.dir[0] * tail, s.from[1] + s.dir[1] * tail, s.from[2] + s.dir[2] * tail],
        b: [s.from[0] + s.dir[0] * head, s.from[1] + s.dir[1] * head, s.from[2] + s.dir[2] * head]
      });
    }
    var glows = [];
    if (gO > 1e-3) glows.push({ p: ev.origin, i: Math.min(gO, 1.6) });
    if (P.air && gA > 1e-3) glows.push({ p: P.air, i: Math.min(gA, 1.6) });
    return { kind: 'laser', active: t >= ev.tStart && t <= ev.tEnd, shots: shots, glows: glows };
  }

  function lightState(ev, t) {
    var P = ev.params, tl = t - ev.tStart, dur = ev.tEnd - ev.tStart;
    var I = smooth(0, P.fadeIn, tl) * (1 - smooth(dur - P.fadeOut, dur, tl));
    var az = P.az0 + P.azAmp * Math.sin(P.azW * tl + P.azPh);
    var el = P.el0 + P.elAmp * Math.sin(P.elW * tl + P.elPh);
    var o = ev.origin, pos = o;
    if (P.mount === 'drone') {
      var a = P.dronePh + P.droneW * tl;
      pos = [o[0] + P.droneR * Math.cos(a), o[1] + 2 * Math.sin(0.4 * a), o[2] + P.droneR * Math.sin(a)];
    }
    return {
      kind: 'searchlight', active: tl >= 0 && tl <= dur, intensity: I, pos: pos, dir: dirOf(az, el),
      az: az, el: el, len: P.len, half: P.half, mount: P.mount
    };
  }

  function state(ev, t) {
    return ev.kind === 'laser' ? laserState(ev, t) : lightState(ev, t);
  }

  /* ---- visual layer ----------------------------------------------------- */
  var POOL = { shots: 16, glows: 8, cones: 4 };
  var CONE_SEG = { around: 20, along: 6 };

  var SHOT_VS = [
    '/*CG_FOG*/',
    'uniform float uFogK; uniform float uW;',
    'attribute vec3 iA; attribute vec3 iB; attribute float iI;',
    'varying vec2 vP; varying float vI;',
    'void main(){',
    '  vec3 d = iB - iA; float L = length(d); vec3 dn = L > 1e-4 ? d / L : vec3(0.0, 1.0, 0.0);',
    '  vec3 wp = mix(iA, iB, position.x);',
    '  vec3 toCam = cameraPosition - wp; float dc = length(toCam);',
    '  vec3 sd = cross(dn, toCam); float sl = length(sd);',
    '  sd = sl > 1e-5 ? sd / sl : vec3(1.0, 0.0, 0.0);',
    '  float w = max(uW, dc * 0.0024);',
    '  wp += dn * (position.x - 0.5) * 2.0 * w * 2.0;',
    '  wp += sd * position.y * w * 4.0;',
    '  vP = position.xy;',
    '  vI = iI * (1.0 - cgFogAmt(wp, uFogK)) * pow(uW / w, 0.3);',
    '  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);',
    '}'].join('\n');
  var SHOT_FS = [
    'uniform vec3 uCol; varying vec2 vP; varying float vI;',
    'void main(){',
    '  float y = vP.y;',
    '  float core = exp(-y * y * 40.0), halo = 0.5 * exp(-y * y * 6.0);',
    '  float along = mix(0.25, 1.0, clamp(vP.x, 0.0, 1.0));',
    '  vec3 c = uCol * (core + halo) + vec3(0.9) * core * 0.55;',
    '  gl_FragColor = vec4(c * along * vI, 1.0);',
    '}'].join('\n');

  var GLOW_VS = [
    '/*CG_FOG*/',
    'uniform float uFogK;',
    'attribute vec3 iPos; attribute float iSize; attribute vec3 iCol;',
    'varying vec2 vUv; varying vec3 vCol;',
    'void main(){',
    '  vec4 mv = viewMatrix * vec4(iPos, 1.0);',
    '  float sz = max(iSize, -mv.z * 0.006);',
    '  mv.xy += position.xy * sz;',
    '  vUv = uv;',
    '  vCol = iCol * (1.0 - cgFogAmt(iPos, uFogK)) * (iSize / sz);',
    '  gl_Position = projectionMatrix * mv;',
    '}'].join('\n');
  var GLOW_FS = [
    'varying vec2 vUv; varying vec3 vCol;',
    'void main(){',
    '  float r = length(vUv - 0.5) * 2.0;',
    '  float a = exp(-r * r * 4.0) * clamp(1.0 - r, 0.0, 1.0) + 0.8 * exp(-r * r * 40.0);',
    '  gl_FragColor = vec4(vCol * a, 1.0);',
    '}'].join('\n');

  /* The cone is a unit open cone along +z (apex at 0); the shader widens it
     by uTan and stretches it by uLen, so one geometry serves all four.
     Brightness: thin at the silhouette (view-normal falloff), dimmer as the
     cone widens (scattered light per chord goes like 1/r), soft at the far
     end, then attenuated by the shared atmosphere. */
  var CONE_VS = [
    '/*CG_FOG*/',
    'uniform float uTan; uniform float uLen;',
    'attribute vec2 aCS;',
    'varying vec3 vW; varying vec3 vN; varying float vS;',
    'void main(){',
    '  float s = position.z;',
    '  vec3 lp = vec3(aCS * s * uTan * uLen, s * uLen);',
    '  vec4 w = modelMatrix * vec4(lp, 1.0);',
    '  vW = w.xyz; vS = s;',
    '  vN = normalize(mat3(modelMatrix) * normalize(vec3(aCS, -uTan)));',
    '  gl_Position = projectionMatrix * viewMatrix * w;',
    '}'].join('\n');
  var CONE_FS = [
    '/*CG_FOG*/',
    'uniform vec3 uCol; uniform float uFogK;',
    'varying vec3 vW; varying vec3 vN; varying float vS;',
    'void main(){',
    '  vec3 v = normalize(cameraPosition - vW);',
    '  float f = abs(dot(normalize(vN), v));',
    '  float edge = f * f;',
    '  float axial = 0.1 / (vS + 0.1) * pow(clamp(1.0 - vS, 0.0, 1.0), 1.3) * smoothstep(0.0, 0.015, vS);',
    '  float fog = cgFogAmt(vW, uFogK);',
    '  gl_FragColor = vec4(uCol * edge * axial * (1.0 - fog), 1.0);',
    '}'].join('\n');

  function coneGeometry(THREE) {
    var NA = CONE_SEG.around, NS = CONE_SEG.along;
    var pos = [], cs = [], idx = [];
    for (var j = 0; j <= NS; j++) {
      var s = j / NS; s = s * s * 0.25 + s * 0.75;      // denser near the apex
      for (var i = 0; i <= NA; i++) {
        var a = i / NA * 2 * Math.PI;
        pos.push(0, 0, s); cs.push(Math.cos(a), Math.sin(a));
      }
    }
    for (j = 0; j < NS; j++) for (i = 0; i < NA; i++) {
      var p = j * (NA + 1) + i, q = p + NA + 1;
      idx.push(p, q, p + 1, p + 1, q, q + 1);
    }
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aCS', new THREE.Float32BufferAttribute(cs, 2));
    g.setIndex(idx);
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 1e6);
    return g;
  }

  function quadInstanced(THREE, n, attrs, x0, x1) {
    var g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([x0, -1, 0, x1, -1, 0, x1, 1, 0, x0, 1, 0], 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    for (var k in attrs) {
      var a = new THREE.InstancedBufferAttribute(new Float32Array(n * attrs[k]), attrs[k]);
      a.setUsage(THREE.DynamicDrawUsage);
      g.setAttribute(k, a);
    }
    g.instanceCount = 0;
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 1e7);
    return g;
  }

  function create(THREE, opts) {
    var o = opts || {};
    var fog = o.fog || (globalThis.HikyakuCity && globalThis.HikyakuCity.makeFog(THREE));
    if (!fog) throw new Error('HikyakuEvents.create needs opts.fog (HikyakuCity.makeFog)');
    var C = Object.assign({ laser: 0x3dff6e, laserGain: 6, glowGain: 3, light: 0xdde6ea, lightGain: 0.8 }, o.colors || {});
    var lin = function (hex, gain) { return new THREE.Color(hex).multiplyScalar(gain); };
    var laserCol = lin(C.laser, C.laserGain);
    var lightCol = lin(C.light, 1);

    var group = new THREE.Group();
    group.name = 'events';
    var additive = { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, fog: false };

    var shotGeo = quadInstanced(THREE, POOL.shots, { iA: 3, iB: 3, iI: 1 }, 0, 1);
    var shotMat = fog.inject(new THREE.ShaderMaterial(Object.assign({
      uniforms: { uCol: { value: laserCol }, uFogK: { value: o.laserFogK == null ? 0.4 : o.laserFogK }, uW: { value: 0.22 } },
      vertexShader: SHOT_VS, fragmentShader: SHOT_FS, side: THREE.DoubleSide
    }, additive)));
    var shots = new THREE.Mesh(shotGeo, shotMat);
    shots.name = 'shots'; shots.frustumCulled = false; shots.renderOrder = 5;

    var glowGeo = quadInstanced(THREE, POOL.glows, { iPos: 3, iSize: 1, iCol: 3 }, -1, 1);
    var glowMat = fog.inject(new THREE.ShaderMaterial(Object.assign({
      uniforms: { uFogK: { value: 0.5 } }, vertexShader: GLOW_VS, fragmentShader: GLOW_FS
    }, additive)));
    var glows = new THREE.Mesh(glowGeo, glowMat);
    glows.name = 'glows'; glows.frustumCulled = false; glows.renderOrder = 6;

    var coneGeo = coneGeometry(THREE);
    var cones = [], coneGroup = new THREE.Group();
    coneGroup.name = 'cones';
    for (var i = 0; i < POOL.cones; i++) {
      var m = fog.inject(new THREE.ShaderMaterial(Object.assign({
        uniforms: { uCol: { value: new THREE.Color() }, uTan: { value: 0.08 }, uLen: { value: 300 }, uFogK: { value: o.lightFogK == null ? 0.7 : o.lightFogK } },
        vertexShader: CONE_VS, fragmentShader: CONE_FS, side: THREE.DoubleSide
      }, additive)));
      var cm = new THREE.Mesh(coneGeo, m);
      cm.visible = false; cm.frustumCulled = false; cm.renderOrder = 4;
      cones.push(cm); coneGroup.add(cm);
    }
    group.add(coneGroup, shots, glows);

    var stats = { events: 0, shots: 0, glows: 0, cones: 0, dropped: 0, triangles: 0 };
    var FWD = new THREE.Vector3(0, 0, 1), tmp = new THREE.Vector3();
    var cp = [0, 0, 0];

    function update(t, cameraPos, events) {
      if (cameraPos) { cp[0] = cameraPos.x != null ? cameraPos.x : cameraPos[0]; cp[1] = cameraPos.y != null ? cameraPos.y : cameraPos[1]; cp[2] = cameraPos.z != null ? cameraPos.z : cameraPos[2]; }
      var segs = [], gl = [], lights = [], list = events || [];
      for (var e = 0; e < list.length; e++) {
        var ev = list[e];
        if (!ev || t < ev.tStart || t > ev.tEnd) continue;
        var st = state(ev, t);
        if (ev.kind === 'laser') {
          for (var k = 0; k < st.shots.length; k++) { var s = st.shots[k]; s.d = dist3(s.b, cp); segs.push(s); }
          for (k = 0; k < st.glows.length; k++) {
            var g = st.glows[k];
            gl.push({ p: g.p, d: dist3(g.p, cp), size: 9, r: laserCol.r * C.glowGain / C.laserGain * g.i, g: laserCol.g * C.glowGain / C.laserGain * g.i, b: laserCol.b * C.glowGain / C.laserGain * g.i });
          }
        } else if (st.intensity > 1e-3) {
          st.d = dist3(st.pos, cp); lights.push(st);
          gl.push({ p: st.pos, d: st.d, size: 3, r: lightCol.r * st.intensity * 1.4, g: lightCol.g * st.intensity * 1.4, b: lightCol.b * st.intensity * 1.4 });
        }
      }
      var byD = function (a, b) { return a.d - b.d; };
      segs.sort(byD); gl.sort(byD); lights.sort(byD);
      var dropped = Math.max(0, segs.length - POOL.shots) + Math.max(0, gl.length - POOL.glows) + Math.max(0, lights.length - POOL.cones);

      var A = shotGeo.attributes.iA.array, B = shotGeo.attributes.iB.array, I = shotGeo.attributes.iI.array;
      var ns = Math.min(segs.length, POOL.shots);
      for (k = 0; k < ns; k++) {
        s = segs[k];
        A[3 * k] = s.a[0]; A[3 * k + 1] = s.a[1]; A[3 * k + 2] = s.a[2];
        B[3 * k] = s.b[0]; B[3 * k + 1] = s.b[1]; B[3 * k + 2] = s.b[2];
        I[k] = s.i;
      }
      shotGeo.attributes.iA.needsUpdate = shotGeo.attributes.iB.needsUpdate = shotGeo.attributes.iI.needsUpdate = true;
      shotGeo.instanceCount = ns;

      var P = glowGeo.attributes.iPos.array, S = glowGeo.attributes.iSize.array, Cc = glowGeo.attributes.iCol.array;
      var ng = Math.min(gl.length, POOL.glows);
      for (k = 0; k < ng; k++) {
        g = gl[k];
        P[3 * k] = g.p[0]; P[3 * k + 1] = g.p[1]; P[3 * k + 2] = g.p[2];
        S[k] = g.size; Cc[3 * k] = g.r; Cc[3 * k + 1] = g.g; Cc[3 * k + 2] = g.b;
      }
      glowGeo.attributes.iPos.needsUpdate = glowGeo.attributes.iSize.needsUpdate = glowGeo.attributes.iCol.needsUpdate = true;
      glowGeo.instanceCount = ng;

      var nc = Math.min(lights.length, POOL.cones);
      for (k = 0; k < POOL.cones; k++) {
        var cm = cones[k];
        if (k >= nc) { cm.visible = false; continue; }
        var L = lights[k];
        cm.visible = true;
        cm.position.set(L.pos[0], L.pos[1], L.pos[2]);
        cm.quaternion.setFromUnitVectors(FWD, tmp.set(L.dir[0], L.dir[1], L.dir[2]));
        cm.updateMatrix();
        var U = cm.material.uniforms;
        U.uTan.value = Math.tan(L.half); U.uLen.value = L.len;
        U.uCol.value.copy(lightCol).multiplyScalar(C.lightGain * L.intensity);
      }
      stats.events = list.length; stats.shots = ns; stats.glows = ng; stats.cones = nc; stats.dropped = dropped;
      stats.triangles = 2 * ns + 2 * ng + nc * 2 * CONE_SEG.around * CONE_SEG.along;
      return stats;
    }

    function dispose() {
      shotGeo.dispose(); shotMat.dispose(); glowGeo.dispose(); glowMat.dispose(); coneGeo.dispose();
      for (var i = 0; i < cones.length; i++) cones[i].material.dispose();
      if (group.parent) group.parent.remove(group);
    }

    return { group: group, update: update, dispose: dispose, stats: stats, pools: POOL };
  }

  globalThis.HikyakuEvents = {
    RATES: RATES, LASER: LASER, LIGHT: LIGHT, SLOT: SLOT, KINDS: KINDS, POOL: POOL, CONE_SEG: CONE_SEG,
    schedule: schedule, state: state, perHour: perHour, create: create
  };
})();
