/* hikyaku-events.js -- rare world events for Hikyaku: rooftop firefights
 * with laser handguns, and searchlights.
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
 *     bolts, 12 glows, 4 cones, 4 bodies) and update(t, cameraPos,
 *     events, viewH?) fills them (viewH: canvas height in pixels, for the
 *     bolts' pixel floor). THREE is a parameter, never an import. The light
 *     materials are additive ShaderMaterials that take the shared
 *     atmosphere through fog.inject (hikyaku-city.js makeFog), so they fade
 *     with distance like every other emissive thing in the scene. The
 *     bodies behind the searchlights (a small drone, or a lamp on a roof
 *     pedestal) are lit meshes through fog.patch.
 *
 * Lasers: a firefight between two shooters on nearby roofs, short bursts
 * of travelling bolts both ways (see LASER). The caller passes the roofs
 * (the city pads) and, optionally, boxesNear for a clear line of fire;
 * findPairs keeps the pairs 20 to 80 m apart, 60 m up or more, 150 to
 * 600 m from the ship, out of the route tube.
 *
 * Searchlight origins: the caller passes pickOrigin(kind, rng, info) and
 * clearance(p).
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
  var RATES = { laser: 35, searchlight: 70 };
  /* longest possible duration per kind, so a window query can look back */
  var MAXDUR = { laser: 10, searchlight: 200 };

  /* A laser event is a firefight between two roofs: two shooters on the
     facing edges of two nearby roofs (or two far corners of one big roof)
     trade short bursts of travelling bolts. Bolts, not instant lines: a
     line across 50 m reads as one beam weapon, a 3 to 6 m bolt moving at
     handgun-ish speed reads as small arms, and at 60 fps it advances about
     its own length per frame, so it is seen as a dash, not as a dot. */
  var LASER = {
    speed: 240,                        // m/s, bolt speed
    len: [3.5, 6],                     // bolt length, m
    dur: [3, 7],                       // s of shooting per event
    burst: [2, 5],                     // shots per burst
    gap: [0.1, 0.24],                  // s between shots inside a burst
    pause: [0.35, 1.5],                // s between bursts, irregular
    alt: 0.8,                          // chance the next burst is the other side
    maxShots: 40,
    pair: [20, 80],                    // m between the shooters, horizontal
    maxDy: 40,                         // m height difference, at most
    maxSlope: 1.2,                     // dy / horizontal, at most
    minY: 60,                          // m roof height, at least
    near: [150, 600],                  // m from the ship to the pair's middle
    sameRoof: 60,                      // m: one roof this long holds a pair across it
    inset: 1,                          // m from the roof edge to the shooter
    up: 1.3,                           // m muzzle above the roof
    spread: 1.8,                       // m of miss around the target, horizontal
    muzzle: { size: 0.6, rise: 0.004, decay: 0.05 },
    impact: { size: 1.1, rise: 0.004, decay: 0.11 }
  };
  var LIGHT = {
    dur: [60, 180], fadeIn: 5, fadeOut: 8,
    len: [260, 420], half: [3.5, 6.5], // cone length m, half angle degrees
    droneChance: 0.35,
    roofEl: [-20, 50], droneEl: [-75, -15],
    azAmp: [20, 55], azPer: [40, 80], elPer: [24, 50],
    droneR: [25, 60], dronePer: [50, 90], droneUp: [120, 220],
    roofUp: 1.2,                       // lamp centre above the roof pad, m
    strobePer: 2.4, strobeOn: 0.09,    // the drone's white strobe, s
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
        var rr = kind === 'laser' ? uni(r, [200, 580]) : uni(r, [250, 1400]);
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

  /* ---- roof pairs --------------------------------------------------------
     A roof is { p: [x, y, z] the centre of its top face, w (along x), d
     (along z), kind?, bid? }, exactly the city's pads (HikyakuCity
     makeCity().pads(), kind 'roof'). Entries with another kind are
     skipped. A pair is two shooter spots, each on the edge of its roof that
     faces the other, LASER.inset in from the edge. */
  function roofList(src, around, P) {
    var list = typeof src === 'function' ? src(around, P.near[0], P.near[1]) : src;
    var out = [];
    if (!list) return out;
    var reach = P.near[1] + P.pair[1] + 80;
    for (var i = 0; i < list.length; i++) {
      var q = list[i];
      if (!q || !q.p || (q.kind && q.kind !== 'roof')) continue;
      if (!(q.p[1] >= P.minY) || !(q.w > 2 * P.inset) || !(q.d > 2 * P.inset)) continue;
      if (around && Math.hypot(q.p[0] - around[0], q.p[2] - around[2]) > reach) continue;
      out.push(q);
    }
    /* sorted, so the pick does not depend on the order the city loaded
       its tiles in */
    out.sort(function (a, b) { return a.p[0] - b.p[0] || a.p[2] - b.p[2] || a.p[1] - b.p[1]; });
    return out;
  }
  /* the point of roof q nearest to (x, z), inset from the edge */
  function edgeSpot(q, x, z, inset) {
    var hw = q.w / 2 - inset, hd = q.d / 2 - inset;
    return [clamp(x, q.p[0] - hw, q.p[0] + hw), q.p[1], clamp(z, q.p[2] - hd, q.p[2] + hd)];
  }
  /* segment a-b against box {min, max}, slab test, true when they meet */
  function segBox(a, b, bx) {
    var t0 = 0, t1 = 1;
    for (var k = 0; k < 3; k++) {
      var d = b[k] - a[k];
      if (Math.abs(d) < 1e-9) { if (a[k] < bx.min[k] || a[k] > bx.max[k]) return false; continue; }
      var u = (bx.min[k] - a[k]) / d, v = (bx.max[k] - a[k]) / d;
      if (u > v) { var w = u; u = v; v = w; }
      if (u > t0) t0 = u;
      if (v < t1) t1 = v;
      if (t0 > t1) return false;
    }
    return true;
  }
  /* the box a roof is the top face of: we stand on it, it does not block */
  function isRoofBox(bx, q) {
    return Math.abs(bx.max[1] - q.p[1]) < 0.05 && q.p[0] >= bx.min[0] - 0.01 && q.p[0] <= bx.max[0] + 0.01 &&
      q.p[2] >= bx.min[2] - 0.01 && q.p[2] <= bx.max[2] + 0.01;
  }
  function lineClear(a, b, qa, qb, opts) {
    var k;
    if (opts.clearance) {
      for (k = 0; k <= 4; k++) {
        var u = k / 4;
        if (!opts.clearance([a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u])) return false;
      }
    }
    if (opts.boxesNear) {
      var m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
      var bs = opts.boxesNear(m, dist3(a, b) / 2 + 1) || [];
      for (k = 0; k < bs.length; k++) {
        var bx = bs[k];
        if (isRoofBox(bx, qa) || isRoofBox(bx, qb)) continue;
        if (segBox(a, b, bx)) return false;
      }
    }
    return true;
  }
  /* A candidate pair of shooter spots (or null): the horizontal distance,
     height difference, slope, the ship's distance and, when the caller
     gives them, the route tube and the city boxes decide. */
  function pairOf(qa, qb, opts, P) {
    var a, b, same = qa === qb;
    if (same) {
      /* across one big roof (a courtyard, a wide deck): the two ends of its
         long axis */
      var alongX = qa.w >= qa.d, half = (alongX ? qa.w : qa.d) / 2 - P.inset;
      a = alongX ? [qa.p[0] - half, qa.p[1], qa.p[2]] : [qa.p[0], qa.p[1], qa.p[2] - half];
      b = alongX ? [qa.p[0] + half, qa.p[1], qa.p[2]] : [qa.p[0], qa.p[1], qa.p[2] + half];
    } else {
      a = edgeSpot(qa, qb.p[0], qb.p[2], P.inset);
      b = edgeSpot(qb, a[0], a[2], P.inset);
      a = edgeSpot(qa, b[0], b[2], P.inset);
    }
    var h = Math.hypot(b[0] - a[0], b[2] - a[2]), dy = Math.abs(b[1] - a[1]);
    if (h < P.pair[0] || h > P.pair[1] || dy > P.maxDy || dy > P.maxSlope * h) return null;
    var mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
    var dm = opts.around ? Math.hypot(mid[0] - opts.around[0], mid[2] - opts.around[2]) : 0;
    if (opts.around && (dm < P.near[0] || dm > P.near[1])) return null;
    var ma = [a[0], a[1] + P.up, a[2]], mb = [b[0], b[1] + P.up, b[2]];
    if (!lineClear(ma, mb, qa, qb, opts)) return null;
    return { a: ma, b: mb, ra: qa, rb: qb, h: h, dy: dy, mid: mid, dist: dm };
  }
  /* all valid pairs among the roofs, in a fixed order */
  function findPairs(roofs, opts) {
    var o = opts || {}, P = LASER;
    var list = roofList(roofs, o.around, P), out = [], maxW = 0, i, j;
    for (i = 0; i < list.length; i++) maxW = Math.max(maxW, list[i].w);
    for (i = 0; i < list.length; i++) {
      var qa = list[i];
      if (Math.max(qa.w, qa.d) >= P.sameRoof + 2 * P.inset) { var s = pairOf(qa, qa, o, P); if (s) out.push(s); }
      for (j = i + 1; j < list.length; j++) {
        var qb = list[j];
        if (qb.p[0] - qa.p[0] > P.pair[1] + maxW) break;
        if (qa.bid != null && qa.bid === qb.bid) continue;
        if (Math.abs(qb.p[2] - qa.p[2]) > P.pair[1] + (qa.d + qb.d) / 2) continue;
        var pr = pairOf(qa, qb, o, P);
        if (pr) out.push(pr);
      }
    }
    return out;
  }
  /* a pair drawn by weight: ahead of the ship counts more than behind,
     where nobody looks */
  function choosePair(pairs, r, opts) {
    if (!pairs.length) return null;
    var f = opts.forward, c = opts.around, ws = [], W = 0;
    for (var i = 0; i < pairs.length; i++) {
      var w = 1;
      if (f && c) {
        var dx = pairs[i].mid[0] - c[0], dz = pairs[i].mid[2] - c[2], L = Math.hypot(dx, dz) || 1;
        var cs = (dx * f[0] + dz * f[2]) / (L * (Math.hypot(f[0], f[2]) || 1));
        w = cs > 0.3 ? 3 : cs > -0.3 ? 1 : 0.15;
      }
      ws.push(w); W += w;
    }
    var u = r() * W;
    for (i = 0; i < pairs.length; i++) { u -= ws[i]; if (u <= 0) return pairs[i]; }
    return pairs[pairs.length - 1];
  }
  /* without any roof provider (pure use, tests): two made-up roofs near a
     point from the default picker */
  function syntheticPair(r, pick, ev) {
    var c = asPoint(pick('laser', r, ev.info));
    if (!c) return null;
    var P = LASER, az = r() * 2 * Math.PI, h = uni(r, [30, 70]), ya = uni(r, [70, 150]);
    var yb = clamp(ya + (r() * 2 - 1) * 25, P.minY, 200);
    var qa = { p: [c[0], ya, c[2]], w: 30, d: 30 };
    var qb = { p: [c[0] + (h + 30) * Math.cos(az), yb, c[2] + (h + 30) * Math.sin(az)], w: 30, d: 30 };
    return pairOf(qa, qb, {}, P);
  }

  /* ---- event construction --------------------------------------------- */
  /* The firefight itself from a pair and the event's own random stream:
     bursts that alternate sides (the first reply is certain, later ones
     come with LASER.alt), each shot from the shooter's muzzle to a point
     near the other shooter, never below the target roof. */
  function firefight(pair, r) {
    var P = LASER, sp = [pair.a, pair.b], roofY = [pair.rb.p[1], pair.ra.p[1]];
    var dur = uni(r, P.dur), t = 0, side = r() < 0.5 ? 0 : 1, shots = [], end = 0, burst = 0;
    while (t <= dur && shots.length < P.maxShots) {
      var n = intIn(r, P.burst);
      for (var i = 0; i < n && shots.length < P.maxShots; i++) {
        var f0 = sp[side], g0 = sp[1 - side];
        var from = [f0[0] + (r() * 2 - 1) * 0.4, f0[1] + (r() * 2 - 1) * 0.25, f0[2] + (r() * 2 - 1) * 0.4];
        var to = [g0[0] + (r() * 2 - 1) * P.spread, Math.max(roofY[side] + 0.15, g0[1] + uni(r, [-1.4, 0.7])), g0[2] + (r() * 2 - 1) * P.spread];
        var dx = to[0] - from[0], dy = to[1] - from[1], dz = to[2] - from[2], L = Math.hypot(dx, dy, dz);
        var s = { k: shots.length, t: t, from: from, dir: [dx / L, dy / L, dz / L], len: uni(r, P.len), range: L, reply: side === 1, burst: burst };
        shots.push(s);
        end = Math.max(end, s.t + (s.range + s.len) / P.speed);
        if (i < n - 1) t += uni(r, P.gap);
      }
      t += uni(r, P.pause);
      if (burst === 0 || r() < P.alt) side = 1 - side;
      burst++;
    }
    return { shots: shots, end: end };
  }

  function makeLaser(ev, r, pick, opts) {
    var pr = rngFrom(hash(ev.h, 77)), pair;
    if (opts.roofs) pair = choosePair(findPairs(opts.roofs, opts), pr, opts);
    else if (!opts.pickOrigin) {
      for (var k = 0; k < 8 && !pair; k++) {
        pair = syntheticPair(pr, pick, ev);
        if (pair && !(okPoint(pair.a, opts, LASER.near[0]) && okPoint(pair.b, opts, LASER.near[0]))) pair = null;
      }
    }
    /* a page that gives pickOrigin but no roofs gets no lasers: a single
       point cannot say where the other side stands */
    if (!pair) return null;
    var ff = firefight(pair, r);
    ev.origin = pair.a.slice();
    ev.tEnd = ev.tStart + ff.end + 0.4;
    ev.params = { speed: LASER.speed, shots: ff.shots, a: pair.a, b: pair.b, roofs: [pair.ra.p.slice(), pair.rb.p.slice()] };
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
     pickOrigin(kind, rng, info) (searchlights), clearance(p) -> bool,
     around ([x,y,z], the ship), forward (pick bias), lightMinDist (default
     150), extent (default picker without around), cache (Map id -> event),
     kinds (subset).
     Lasers: roofs (array of roofs, or a function (around, rMin, rMax) ->
     array; the city's pads() as is) and boxesNear(p, r) -> [{min, max}]
     (optional, rejects a line of fire through a third box). Without roofs
     and without pickOrigin the lasers run between two made-up roofs (pure
     use); with pickOrigin but no roofs there are no lasers. */
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

  /* A hand-made firefight for screenshot hooks: the valid pair best in view
     (ahead of pos along fwd, near 300 m), its event shifted so that at t
     the most bolts of the whole event are in the air at once. Returns null
     when no pair is valid. o: seed, clearance, near. */
  function shotLaser(t, pos, fwd, roofs, boxesNear, o) {
    o = o || {};
    var opts = { around: pos, forward: fwd, boxesNear: boxesNear, clearance: o.clearance };
    var pairs = findPairs(roofs, opts), best = null, fh = Math.hypot(fwd[0], fwd[2]) || 1;
    for (var i = 0; i < pairs.length; i++) {
      var q = pairs[i], dx = q.mid[0] - pos[0], dz = q.mid[2] - pos[2], L = Math.hypot(dx, dz) || 1;
      var cs = (dx * fwd[0] + dz * fwd[2]) / (L * fh);
      if (cs < 0.9) continue;
      /* near the target distance, and across the view rather than along it */
      var ax = Math.abs(((q.b[0] - q.a[0]) * dx + (q.b[2] - q.a[2]) * dz) / (q.h * L));
      var score = Math.abs(L - (o.near || 300)) / 100 + ax + (1 - cs) * 10;
      if (!best || score < best.score) best = { q: q, score: score };
    }
    if (!best) return null;
    var ff = firefight(best.q, rngFrom(hash(o.seed || 1, 99)));
    var ev = { kind: 'laser', id: 'shot:laser', tStart: 0, tEnd: ff.end + 0.4, origin: best.q.a.slice(),
      params: { speed: LASER.speed, shots: ff.shots, a: best.q.a, b: best.q.b, roofs: [best.q.ra.p.slice(), best.q.rb.p.slice()] }, info: {} };
    var bestT = 0, bestN = -1;
    for (var tt = 0; tt < ff.end; tt += 0.01) {
      var st = laserState(ev, tt), n = st.shots.length + 0.5 * st.glows.length;
      if (n > bestN) { bestN = n; bestT = tt; }
    }
    ev.tStart = t - bestT; ev.tEnd += ev.tStart;
    return ev;
  }

  /* expected events per hour for a kind */
  function perHour(kind, liveliness, rates) {
    var r = Object.assign({}, RATES, rates || {});
    return (r[kind] || 0) * (liveliness == null ? 1 : liveliness);
  }

  /* ---- state ------------------------------------------------------------ */
  function flash(x, rise, decay) { return x < 0 ? 0 : (1 - Math.exp(-x / rise)) * Math.exp(-x / decay); }

  /* A bolt leaves the muzzle at zero length, grows to its length, flies
     at the event's speed, stops at its impact point and shrinks into it,
     so both ends are continuous in t and never leave the segment from
     s.from to the impact. Glows: a muzzle flash at s.from when it fires,
     a whiter spark at the impact when its head arrives. */
  function laserState(ev, t) {
    var P = ev.params, v = P.speed, tl = t - ev.tStart, M = LASER.muzzle, X = LASER.impact;
    var shots = [], glows = [];
    for (var i = 0; i < P.shots.length; i++) {
      var s = P.shots[i], dt = tl - s.t;
      if (dt < 0) continue;
      var tHit = s.range / v;
      var gm = flash(dt, M.rise, M.decay), gi = flash(dt - tHit, X.rise, X.decay);
      var end = [s.from[0] + s.dir[0] * s.range, s.from[1] + s.dir[1] * s.range, s.from[2] + s.dir[2] * s.range];
      if (gm > 1e-3) glows.push({ p: s.from, i: gm, kind: 'muzzle', k: s.k });
      if (gi > 1e-3) glows.push({ p: end, i: gi, kind: 'impact', k: s.k });
      var head = Math.min(v * dt, s.range), tail = v * dt - s.len;
      if (tail >= s.range) continue;
      tail = Math.max(0, tail);
      shots.push({
        k: s.k, reply: s.reply, i: 1,
        a: [s.from[0] + s.dir[0] * tail, s.from[1] + s.dir[1] * tail, s.from[2] + s.dir[2] * tail],
        b: [s.from[0] + s.dir[0] * head, s.from[1] + s.dir[1] * head, s.from[2] + s.dir[2] * head]
      });
    }
    return { kind: 'laser', active: t >= ev.tStart && t <= ev.tEnd, shots: shots, glows: glows };
  }

  function lightState(ev, t) {
    var P = ev.params, tl = t - ev.tStart, dur = ev.tEnd - ev.tStart;
    var I = smooth(0, P.fadeIn, tl) * (1 - smooth(dur - P.fadeOut, dur, tl));
    var az = P.az0 + P.azAmp * Math.sin(P.azW * tl + P.azPh);
    var el = P.el0 + P.elAmp * Math.sin(P.elW * tl + P.elPh);
    var o = ev.origin, pos, fwd, strobe = false;
    if (P.mount === 'drone') {
      /* the craft circles; it faces along the circle (the horizontal part
         of d pos / dt), and its strobe flashes on its own phase */
      var a = P.dronePh + P.droneW * tl, sg = P.droneW < 0 ? -1 : 1;
      pos = [o[0] + P.droneR * Math.cos(a), o[1] + 2 * Math.sin(0.4 * a), o[2] + P.droneR * Math.sin(a)];
      fwd = P.droneR > 0 && P.droneW !== 0 ? [-Math.sin(a) * sg, 0, Math.cos(a) * sg] : [Math.cos(az), 0, Math.sin(az)];
      var ph = tl + P.dronePh * LIGHT.strobePer / (2 * Math.PI);
      strobe = ph - LIGHT.strobePer * Math.floor(ph / LIGHT.strobePer) < LIGHT.strobeOn;
    } else {
      /* the lamp stands on a pedestal on the roof pad */
      pos = [o[0], o[1] + LIGHT.roofUp, o[2]];
      fwd = [Math.cos(az), 0, Math.sin(az)];
    }
    return {
      kind: 'searchlight', active: tl >= 0 && tl <= dur, intensity: I, pos: pos, dir: dirOf(az, el),
      az: az, el: el, len: P.len, half: P.half, mount: P.mount, fwd: fwd, strobe: strobe
    };
  }

  function state(ev, t) {
    return ev.kind === 'laser' ? laserState(ev, t) : lightState(ev, t);
  }

  /* ---- visual layer ----------------------------------------------------- */
  var POOL = { shots: 16, glows: 12, cones: 4, bodies: 4 };
  var CONE_SEG = { around: 20, along: 6 };

  /* Bolt shader. The quad spans the halo; its half-width is the physical
     halo radius or LASER_VIS.haloPx pixels, whichever is wider, and the
     core inside it the physical core radius or corePx pixels. So a bolt is
     never thinner than about two pixels of core in four to six of halo
     (far streaks do not vanish into dots, handoff section 7), and never
     thicker than a few centimetres of core up close. When the pixel floor
     widens a line, its brightness drops with the square root of the
     widening (core: power 0.35): a far bolt stays visible without
     turning into a bar. The
     ends are round (the quad runs one half-width past each end), the head
     brighter than the tail, and a bolt of zero length draws nothing. */
  var LASER_VIS = { core: 0.05, halo: 0.3, corePx: 0.9, haloPx: 3.2, haloGain: 0.3, white: 0.6, viewH: 900 };
  var SHOT_VS = [
    '/*CG_FOG*/',
    'uniform float uFogK; uniform float uViewH; uniform vec4 uW;',
    'attribute vec3 iA; attribute vec3 iB; attribute float iI;',
    'varying float vY; varying float vS; varying float vL; varying float vHw; varying float vC; varying float vIc; varying float vIh;',
    'void main(){',
    '  vec3 d = iB - iA; float L = length(d); vec3 dn = L > 1e-4 ? d / L : vec3(0.0, 1.0, 0.0);',
    '  vec3 wp = mix(iA, iB, position.x);',
    '  vec3 toCam = cameraPosition - wp; float dc = length(toCam);',
    '  float px = dc * 2.0 / (projectionMatrix[1][1] * uViewH);',
    '  float hw = max(uW.y, uW.w * px), cw = max(uW.x, uW.z * px);',
    '  vec3 sd = cross(dn, toCam); float sl = length(sd);',
    '  sd = sl > 1e-5 ? sd / sl : vec3(1.0, 0.0, 0.0);',
    '  float ex = position.x * 2.0 - 1.0;',
    '  wp += dn * ex * hw + sd * position.y * hw;',
    '  vY = position.y; vS = position.x * L + ex * hw; vL = L; vHw = hw; vC = cw / hw;',
    '  float vis = (1.0 - cgFogAmt(wp, uFogK)) * iI * smoothstep(0.0, 0.8, L);',
    '  vIc = vis * pow(uW.x / cw, 0.35); vIh = vis * sqrt(uW.y / hw);',
    '  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);',
    '}'].join('\n');
  var SHOT_FS = [
    'uniform vec3 uCol; uniform float uHalo; uniform float uWhite;',
    'varying float vY; varying float vS; varying float vL; varying float vHw; varying float vC; varying float vIc; varying float vIh;',
    'void main(){',
    '  float e = max(max(-vS, vS - vL), 0.0) / vHw;',
    '  float r2 = vY * vY + e * e;',
    '  float core = exp(-r2 / (vC * vC) * 2.0) * vIc;',
    '  float halo = exp(-r2 * 4.0) * (1.0 - smoothstep(0.7, 1.0, sqrt(r2))) * vIh * uHalo;',
    '  float along = mix(0.45, 1.0, clamp(vS / max(vL, 1e-3), 0.0, 1.0));',
    '  vec3 c = uCol * (core + halo) + vec3(uWhite) * core;',
    '  gl_FragColor = vec4(c * along, 1.0);',
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

  /* Merge geometries into one non-indexed position + normal geometry. */
  function mergeGeos(THREE, geos) {
    var parts = geos.map(function (g) { return g.index ? g.toNonIndexed() : g; }), n = 0, i;
    for (i = 0; i < parts.length; i++) n += parts[i].getAttribute('position').count;
    var P = new Float32Array(n * 3), N = new Float32Array(n * 3), o = 0;
    for (i = 0; i < parts.length; i++) {
      var p = parts[i].getAttribute('position'), q = parts[i].getAttribute('normal');
      P.set(p.array.subarray(0, p.count * 3), o); N.set(q.array.subarray(0, p.count * 3), o);
      o += p.count * 3;
    }
    for (i = 0; i < parts.length; i++) parts[i].dispose();
    for (i = 0; i < geos.length; i++) geos[i].dispose();
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(P, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(N, 3));
    return g;
  }
  /* The bodies behind the searchlights, one pool slot per cone. Frame:
     origin at the lamp (the cone apex), y up, the craft faces -z.
     Drone: a 7 m flat craft above the lamp, four stub ducts with dark rotor
     discs, bone grey like the traffic drone, red nav light on the port
     (-x) duct, green starboard, a white strobe on top. Roof: a base and a
     pedestal down to the roof pad (LIGHT.roofUp below the lamp). The lamp
     is a dark box whose front face (3 cm proud, so it does not fight the
     box) is lit with the beam colour; it turns with the beam. */
  var BODY = { span: 2.5, ductR: 1.05 };
  function bodyGeos(THREE) {
    var box = function (w, h, d, x, y, z) { return new THREE.BoxGeometry(w, h, d).translate(x, y, z); };
    var S = BODY.span, hull = [], dark = [];
    hull.push(box(2.2, 0.5, 3.4, 0, 1.1, 0), box(1.2, 0.35, 1.6, 0, 1.5, 0.2));
    [[1, 1], [1, -1], [-1, 1], [-1, -1]].forEach(function (q) {
      var L = Math.hypot(S, S);
      hull.push(new THREE.BoxGeometry(0.25, 0.18, L).rotateY(Math.atan2(q[0], q[1])).translate(q[0] * S / 2, 1.0, q[1] * S / 2));
      hull.push(new THREE.CylinderGeometry(BODY.ductR, BODY.ductR, 0.3, 14, 1, true).translate(q[0] * S, 1.15, q[1] * S));
      dark.push(new THREE.CylinderGeometry(BODY.ductR - 0.1, BODY.ductR - 0.1, 0.04, 14).translate(q[0] * S, 1.15, q[1] * S));
    });
    dark.push(box(0.3, 0.9, 0.3, 0, 0.45, 0));
    var navX = S + BODY.ductR + 0.07;
    return {
      craftHull: mergeGeos(THREE, hull), craftDark: mergeGeos(THREE, dark),
      roofHull: box(1.4, 0.25, 1.4, 0, -LIGHT.roofUp + 0.1, 0),
      roofDark: box(0.5, 0.65, 0.5, 0, -0.675, 0),
      lampBox: box(1.0, 1.0, 1.2, 0, 0, -0.6),
      lampFace: new THREE.PlaneGeometry(0.8, 0.8).translate(0, 0, 0.03),
      nav: new THREE.BoxGeometry(0.25, 0.25, 0.25),
      navPos: { port: [-navX, 1.15, -S], starboard: [navX, 1.15, -S], strobe: [0, 1.78, 0.2] }
    };
  }

  function create(THREE, opts) {
    var o = opts || {};
    var fog = o.fog || (globalThis.HikyakuCity && globalThis.HikyakuCity.makeFog(THREE));
    if (!fog) throw new Error('HikyakuEvents.create needs opts.fog (HikyakuCity.makeFog)');
    var C = Object.assign({ laser: 0x3dff6e, laserGain: 2.5, glowGain: 3, light: 0xdde6ea, lightGain: 0.8 }, o.colors || {});
    var lin = function (hex, gain) { return new THREE.Color(hex).multiplyScalar(gain); };
    var laserCol = lin(C.laser, C.laserGain);
    var lightCol = lin(C.light, 1);

    var group = new THREE.Group();
    group.name = 'events';
    var additive = { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, fog: false };

    var shotGeo = quadInstanced(THREE, POOL.shots, { iA: 3, iB: 3, iI: 1 }, 0, 1);
    var shotMat = fog.inject(new THREE.ShaderMaterial(Object.assign({
      uniforms: { uCol: { value: laserCol }, uFogK: { value: o.laserFogK == null ? 0.4 : o.laserFogK },
        uViewH: { value: o.viewH || LASER_VIS.viewH }, uHalo: { value: LASER_VIS.haloGain }, uWhite: { value: LASER_VIS.white },
        uW: { value: new THREE.Vector4(LASER_VIS.core, LASER_VIS.halo, LASER_VIS.corePx, LASER_VIS.haloPx) } },
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
    /* bodies: lit materials through fog.patch like the city's own */
    var BG = bodyGeos(THREE);
    var lit = function (hex, rough, metal) {
      var m = new THREE.MeshStandardMaterial({ color: hex, roughness: rough, metalness: metal, flatShading: true });
      return fog.patch ? fog.patch(m, { fogK: 1 }) : m;
    };
    var plain = function (c) {
      var m = new THREE.MeshBasicMaterial({ color: c, toneMapped: false });
      return fog.patch ? fog.patch(m, { fogK: 0.6 }) : m;
    };
    var bodyMat = { hull: lit(0x8a857c, 0.55, 0.3), dark: lit(0x26262a, 0.7, 0.3),
      red: plain(lin(0xff2a1a, 1.8)), green: plain(lin(0x2bff6a, 1.8)), white: plain(lin(0xffffff, 2.2)) };
    var navCol = { port: lin(0xff2a1a, 1.2), starboard: lin(0x2bff6a, 1.0), strobe: lin(0xffffff, 2.5) };
    var bodyGroup = new THREE.Group(), bodies = [], faceMats = [];
    bodyGroup.name = 'bodies';
    var mesh = function (parent, geo, mat, name) { var x = new THREE.Mesh(geo, mat); x.name = name; parent.add(x); return x; };
    for (i = 0; i < POOL.bodies; i++) {
      var slot = new THREE.Group(); slot.name = 'body'; slot.visible = false;
      var craft = new THREE.Group(); craft.name = 'drone';
      mesh(craft, BG.craftHull, bodyMat.hull, 'hull'); mesh(craft, BG.craftDark, bodyMat.dark, 'rotors');
      var navs = {};
      for (var nk in BG.navPos) {
        var nm = mesh(craft, BG.nav, nk === 'port' ? bodyMat.red : nk === 'starboard' ? bodyMat.green : bodyMat.white, nk);
        nm.position.fromArray(BG.navPos[nk]); navs[nk] = nm;
      }
      var roof = new THREE.Group(); roof.name = 'roof';
      mesh(roof, BG.roofHull, bodyMat.hull, 'base'); mesh(roof, BG.roofDark, bodyMat.dark, 'pedestal');
      var lamp = new THREE.Group(); lamp.name = 'lamp';
      var fm = plain(new THREE.Color());
      faceMats.push(fm);
      mesh(lamp, BG.lampBox, bodyMat.dark, 'housing'); mesh(lamp, BG.lampFace, fm, 'face');
      slot.add(craft, roof, lamp);
      bodies.push({ obj: slot, craft: craft, roof: roof, lamp: lamp, face: fm, navs: navs });
      bodyGroup.add(slot);
    }
    var navGeo = quadInstanced(THREE, POOL.bodies * 3, { iPos: 3, iSize: 1, iCol: 3 }, -1, 1);
    var navGlows = new THREE.Mesh(navGeo, glowMat);
    navGlows.name = 'navGlows'; navGlows.frustumCulled = false; navGlows.renderOrder = 6;
    bodyGroup.add(navGlows);
    var triCount = function (g) { return (g.index ? g.index.count : g.getAttribute('position').count) / 3; };
    var TRI = {
      drone: triCount(BG.craftHull) + triCount(BG.craftDark) + 3 * triCount(BG.nav) + triCount(BG.lampBox) + 2,
      roof: triCount(BG.roofHull) + triCount(BG.roofDark) + triCount(BG.lampBox) + 2
    };
    group.add(coneGroup, shots, glows, bodyGroup);

    var stats = { events: 0, shots: 0, glows: 0, cones: 0, bodies: 0, navGlows: 0, dropped: 0, triangles: 0 };
    var FWD = new THREE.Vector3(0, 0, 1), tmp = new THREE.Vector3(), wp = new THREE.Vector3();
    var cp = [0, 0, 0];

    function update(t, cameraPos, events, viewH) {
      if (viewH > 0) shotMat.uniforms.uViewH.value = viewH;
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
            /* muzzle: the laser green; impact: a spark, half way to white */
            var gk = C.glowGain / C.laserGain * g.i, imp = g.kind === 'impact', wk = imp ? 0.5 * C.glowGain * g.i : 0;
            gl.push({ p: g.p, d: dist3(g.p, cp), size: imp ? LASER.impact.size : LASER.muzzle.size,
              r: laserCol.r * gk + wk, g: laserCol.g * gk + wk, b: laserCol.b * gk + wk });
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
      /* the bodies: same slots as the cones, same closed-form pose; nav
         glows in world space, like the glow shader reads them */
      var NP = navGeo.attributes.iPos.array, NS = navGeo.attributes.iSize.array, NC = navGeo.attributes.iCol.array;
      var nn = 0, bodyTris = 0;
      for (k = 0; k < POOL.bodies; k++) {
        var bd = bodies[k];
        if (k >= nc) { bd.obj.visible = false; continue; }
        L = lights[k];
        var isDrone = L.mount === 'drone';
        bd.obj.visible = true;
        bd.obj.position.set(L.pos[0], L.pos[1], L.pos[2]);
        bd.craft.visible = isDrone; bd.roof.visible = !isDrone;
        bd.craft.rotation.set(0, Math.atan2(-L.fwd[0], -L.fwd[2]), 0);
        bd.lamp.quaternion.setFromUnitVectors(FWD, tmp.set(L.dir[0], L.dir[1], L.dir[2]));
        bd.face.color.copy(lightCol).multiplyScalar(0.4 + 2.6 * L.intensity);
        bd.navs.strobe.visible = !!L.strobe;
        bd.obj.updateMatrixWorld(true);
        bodyTris += isDrone ? TRI.drone : TRI.roof;
        if (!isDrone) continue;
        for (var key in bd.navs) {
          if (key === 'strobe' && !L.strobe) continue;
          bd.navs[key].getWorldPosition(wp);
          var c3 = navCol[key];
          NP[3 * nn] = wp.x; NP[3 * nn + 1] = wp.y; NP[3 * nn + 2] = wp.z;
          NS[nn] = key === 'strobe' ? 6 : 2.2;
          NC[3 * nn] = c3.r; NC[3 * nn + 1] = c3.g; NC[3 * nn + 2] = c3.b;
          nn++;
        }
      }
      navGeo.attributes.iPos.needsUpdate = navGeo.attributes.iSize.needsUpdate = navGeo.attributes.iCol.needsUpdate = true;
      navGeo.instanceCount = nn;
      stats.events = list.length; stats.shots = ns; stats.glows = ng; stats.cones = nc; stats.dropped = dropped;
      stats.bodies = nc; stats.navGlows = nn;
      stats.triangles = 2 * ns + 2 * ng + nc * 2 * CONE_SEG.around * CONE_SEG.along + bodyTris + 2 * nn;
      return stats;
    }

    function dispose() {
      shotGeo.dispose(); shotMat.dispose(); glowGeo.dispose(); glowMat.dispose(); coneGeo.dispose();
      for (var i = 0; i < cones.length; i++) cones[i].material.dispose();
      navGeo.dispose();
      for (var bk in BG) if (BG[bk] && BG[bk].isBufferGeometry) BG[bk].dispose();
      for (var mk in bodyMat) bodyMat[mk].dispose();
      for (i = 0; i < faceMats.length; i++) faceMats[i].dispose();
      if (group.parent) group.parent.remove(group);
    }

    return { group: group, update: update, dispose: dispose, stats: stats, pools: POOL };
  }

  globalThis.HikyakuEvents = {
    RATES: RATES, LASER: LASER, LIGHT: LIGHT, SLOT: SLOT, KINDS: KINDS, POOL: POOL, CONE_SEG: CONE_SEG, BODY: BODY,
    LASER_VIS: LASER_VIS,
    schedule: schedule, state: state, perHour: perHour, create: create,
    findPairs: findPairs, segBox: segBox, shotLaser: shotLaser
  };
})();
