/* hikyaku-city.js -- the tiled city of Hikyaku.
 *
 * Ported from the concept phase (2026-10, notes/tools/hikyaku/concepts/lib/
 * citygen.js, city-traffic.html, traffic-canyon.html). The concepts built one
 * fixed scene; here the city is cut into square tiles that are generated
 * from a hash of their grid coordinate and streamed around the ship.
 *
 * Two layers, so the part the physics and the race rely on can be tested
 * under Node:
 *
 *   - Pure layer, no three.js, no DOM: the tile generator makeTile, the
 *     streaming policy wanted, the loaded-tile container makeCity with its
 *     spatial query boxesNear, and findCanyon for the screenshot hook.
 *     notes/dev/hikyaku-city.test.mjs checks it.
 *   - Visual layer: makeFog, makeSky and makeCityRenderer(THREE, opts).
 *     THREE is a parameter, never an import, as in courier.js.
 *
 * World frame: ground at y = 0, sky +y, metres. A tile is TILE = 216 m
 * square, four times the 54 m lane pitch of the traffic and Menger concepts,
 * so the city sits on the same raster. Tile (ix, iz) covers
 * x in [ix * TILE, (ix + 1) * TILE] and z likewise.
 *
 * Street plan inside a tile: streets STREET = 32 m wide on the tile edges
 * (half a street belongs to each neighbour) and through the tile centre, so
 * street centre lines run every 108 m, a multiple of the lane pitch. That
 * leaves 2 x 2 blocks of 76 m per tile, each cut into 1, 2 or 4 lots.
 *
 * The route comes first (handoff, section 2). makeTile gets the route and
 * keeps every box out of its clearance tube: a lot the tube reaches is
 * lowered until its roof is roofGap metres under the tube, or split into
 * four smaller lots (the tube then cuts a canyon through the block), or
 * dropped. A final check on every single box makes it a guarantee and not
 * a hope. The tube is the only coupling to the route.
 *
 * Lane bands: the three traffic layers of the next step fly at LANE_Y.
 * Bridges and cables never enter LANE_Y[i] +- LANE_CLEAR. Buildings do not
 * care, because the lanes follow the street centre lines.
 *
 * Oversized structures (arcologies, Menger blocks) are bigger than a tile
 * and placed separately; makeTile takes a reserved list of world boxes and
 * builds nothing inside them.
 *
 * Everything hangs on globalThis.HikyakuCity.
 */
(function () {
  'use strict';

  var TILE = 216, PITCH = 54, STREET = 32, HALF_ST = STREET / 2;
  var BLOCK = TILE / 2 - STREET;            /* 76 m */
  /* Placeholder altitudes of the three traffic layers. Step 5 may move
     them; everything here reads them from this one constant. */
  var LANE_Y = [55, 105, 155];
  var LANE_CLEAR = 10;

  var DEF = {
    seed: 1,
    density: 0.92,        /* share of lots that get a building */
    /* maxH: top of the regular towers; a landmark (one per coarse cell,
       see landmarkAt) reaches maxH * landmark. Nothing, masts included,
       goes above that. minH: the lowest ordinary building. */
    maxH: 420, minH: 40, landmark: 1.2,
    /* variety 0 to 1: districts, archetypes and facade programs (0 is the
       old uniform city of setback towers); districtSize the scale of the
       district noise in metres; landmarks on or off */
    variety: 0.7, districtSize: 1200, landmarks: true,
    accents: 2,           /* number of neon hues, 0 to 2 */
    roofGap: 15,          /* roof below the tube bottom, metres */
    margin: 3,            /* extra metres outside the tube radius */
    core: null,           /* [x, z] of the tall district, or null */
    coreR: 1600,
    reserved: null,       /* [{ min, max }] world boxes kept empty */
    /* City life (2026-10-25): holograms between towers, aviation beacons
       and crown breathing, windows that change over time. Rarity is the
       rule, so every feature has a rate (true = 1, false or 0 = off,
       up to 2), and liveliness (0 to 1) scales all of them at once. The
       renderer takes windowLife and the crown breathing from its own
       options (makeCityRenderer), the tile carries holograms and beacons. */
    liveliness: 0.6, holograms: 1, beacons: 1, windowLife: 1
  };
  function rateOf(v) { return v === true ? 1 : (v === false || v == null) ? 0 : clamp(+v || 0, 0, 2); }
  /* the effective rate of one life feature: its own rate times liveliness */
  function lifeRate(C, k) { return clamp(C.liveliness == null ? DEF.liveliness : C.liveliness, 0, 1) * rateOf(C[k] == null ? DEF[k] : C[k]); }

  function merge(def, cfg) {
    var o = {}, k;
    for (k in def) o[k] = def[k];
    if (cfg) for (k in def) if (cfg[k] != null) o[k] = cfg[k];
    return o;
  }
  function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
  function smooth(a, b, x) { var t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }

  /* ---- hashing and noise ------------------------------------------------ */
  function hashU(ix, iz, seed, salt) {
    var h = Math.imul(ix | 0, 374761393) ^ Math.imul(iz | 0, 668265263) ^
      Math.imul(((seed | 0) + Math.imul(salt | 0, 0x9e3779b9)) | 0, 0x85ebca6b);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h = Math.imul(h ^ (h >>> 16), 0x27d4eb2f);
    return (h ^ (h >>> 15)) >>> 0;
  }
  /* A seed for a sub-stream of tile (ix, iz). hashU alone gives tiles
     (x, z) and (-x, -z) the same value when x and z are both odd (the two
     products are odd, so their negations differ from them only in the
     same way and the xor cancels); hashing ix first breaks that. */
  function subSeed(ix, iz, seed, salt) { return hashU(hashU(ix, salt, seed, salt), iz, seed, salt + 1); }
  function hash(ix, iz, seed) { return hashU(ix, iz, seed, 0) / 4294967296; }
  function rng(seed) {
    var a = seed >>> 0;
    var r = function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    r.range = function (lo, hi) { return lo + (hi - lo) * r(); };
    r.int = function (lo, hi) { return Math.floor(lo + (hi - lo + 1) * r()); };
    r.chance = function (p) { return r() < p; };
    return r;
  }
  function noise2(x, z, seed) {
    var ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz;
    var sx = fx * fx * (3 - 2 * fx), sz = fz * fz * (3 - 2 * fz);
    var a = hash(ix, iz, seed), b = hash(ix + 1, iz, seed);
    var c = hash(ix, iz + 1, seed), d = hash(ix + 1, iz + 1, seed);
    return a + (b - a) * sx + (c - a) * sz + (a - b - c + d) * sx * sz;
  }
  function fbm(x, z, seed, oct) {
    var s = 0, amp = 0.5, f = 1, n = 0, o = oct || 4;
    for (var i = 0; i < o; i++) { s += amp * noise2(x * f, z * f, seed + i * 17); n += amp; amp *= 0.5; f *= 2.03; }
    return s / n;
  }

  /* Height field: districts from a 650 m noise, a soft core around cfg.core
     (or a 2.4 km noise when there is none). 0 is the low rim, 1 the tall
     core. Top-heavy since 2026-10-25 (owner: a cyberpunk city is a dense
     core of 150 to 400 m towers, mid-rise around it, almost nothing low):
     the district noise only modulates, it no longer zeroes whole areas,
     and the core term carries most of the weight. */
  function heightField(x, z, C) {
    var n = fbm(x / 650, z / 650, C.seed + 11, 4);
    var t = smooth(0.25, 0.7, n);
    var f;
    if (C.core) {
      var dx = x - C.core[0], dz = z - C.core[1];
      f = Math.exp(-(dx * dx + dz * dz) / (C.coreR * C.coreR));
    } else f = smooth(0.36, 0.64, fbm(x / 2400, z / 2400, C.seed + 101, 2));
    return clamp((0.12 + 0.88 * f) * (0.62 + 0.38 * t), 0, 1);
  }

  /* ---- city variety (2026-10-25, notes/tools/hikyaku/CITY-VARIETY.md) ----
     The storey grid is fixed: every tier edge is a multiple of STOREY, so
     the shader's slabs, cornices and plant floors line up with geometry.
     Facade programs (V5), per box in box.prog and per vertex in aFac.w:
       0 curtain wall (core), 1 residential slab, 2 industrial,
       3 landmark, 4 plain (roof plant, masts, signs, crowns: no windows),
       5 landmark top tier (program 3 plus the lit crown band). */
  var STOREY = 3.6;
  var PROG_PLAIN = 4, PROG_LANDMARK = 3, PROG_CROWN = 5;
  /* Districts (V2): 0 core, 1 residential slabs, 2 industrial. No low-rise
     fringe: the owner's "almost nothing under 40 m" stands. */
  var DIST_TONE = [0.26, 0.22, 0.17];
  var ARCHES = ['setback', 'podium', 'twin', 'slab', 'court', 'offset', 'hall', 'silo'];
  /* Archetype weights per district at full variety (blocks, not lots):
     two to three types per district, one of them dominant. */
  var ARCH_W = [
    { setback: 0.45, podium: 0.33, twin: 0.22 },
    { slab: 0.45, court: 0.3, offset: 0.25 },
    { hall: 0.5, silo: 0.25, offset: 0.25 }
  ];
  /* lot split a block type wants: 1 whole block, 2 two long lots, 3 either,
     0 the old rule (1, 2 or 4) */
  var WHOLE = { setback: 0, offset: 0, slab: 2, podium: 3, twin: 1, court: 1, hall: 3, silo: 1 };
  function pickArch(dist, kv, u) {
    var W = ARCH_W[dist] || ARCH_W[0], acc = 0, k;
    /* blend with the old city (setback towers only) by kv */
    var tot = 0;
    for (k = 0; k < ARCHES.length; k++) tot += (ARCHES[k] === 'setback' ? 1 - kv : 0) + kv * (W[ARCHES[k]] || 0);
    for (k = 0; k < ARCHES.length; k++) {
      acc += ((ARCHES[k] === 'setback' ? 1 - kv : 0) + kv * (W[ARCHES[k]] || 0)) / tot;
      if (u < acc) return ARCHES[k];
    }
    return 'setback';
  }
  /* Target roof of a type, from the height field's value h for the block. */
  function archHeight(a, dist, h) {
    switch (a) {
      case 'offset': return dist === 2 ? clamp(h * 0.45, 60, 140) : (dist === 1 ? h * 0.85 : h);
      case 'slab': return clamp(h * 0.9, 120, 360);
      case 'court': return clamp(h * 0.45, 60, 160);
      case 'hall': return clamp(h * 0.35, 64, 110);
      case 'silo': return clamp(h * 0.4, 70, 130);
      default: return h;
    }
  }
  /* Quantiles of a three-octave fbm (measured over 200k samples): rank3
     maps it to a nearly uniform [0, 1], so a share means a share of land. */
  var FBM3_Q = [0, 0.270, 0.316, 0.375, 0.421, 0.462, 0.501, 0.539, 0.580, 0.625, 0.685, 0.731, 1];
  var FBM3_P = [0, 0.05, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 0.95, 1];
  function rank3(v) {
    for (var i = 1; i < FBM3_Q.length; i++) {
      if (v <= FBM3_Q[i]) return FBM3_P[i - 1] + (FBM3_P[i] - FBM3_P[i - 1]) * (v - FBM3_Q[i - 1]) / (FBM3_Q[i] - FBM3_Q[i - 1]);
    }
    return 1;
  }
  /* The district of a point, decided per block centre. A second fbm of
     scale districtSize (its own seed offsets) says core or not; at variety
     v about 0.62 v of the land leaves the core district. A third says
     residential or industrial; industrial only where the height field is
     below 0.7, never in the tall core. variety 0: all core. */
  function districtAt(x, z, C) {
    var v = clamp(C.variety == null ? DEF.variety : C.variety, 0, 1);
    if (!(v > 0)) return 0;
    var S = clamp(C.districtSize || DEF.districtSize, 200, 5000), sd = (C.seed >>> 0) + 211;
    var a = rank3(fbm(x / S, z / S, sd, 3));
    if (a < 1 - 0.62 * v) return 0;
    var b = rank3(fbm(x / S + 31.7, z / S - 12.9, sd + 96, 3));
    return b < 0.4 && heightField(x, z, C) < 0.7 ? 2 : 1;
  }

  /* Landmarks (V7): one per coarse cell of LM_CELL x LM_CELL tiles
     (2592 m). landmarkAt is a pure function of the cell, the seed, the
     route and the reserved list, so the tile that contains the chosen
     block builds it and every other tile agrees. The block is drawn by
     the cell's own hash among up to 40 candidates and must lie 150 to
     400 m (horizontally, from the tube's surface) beside the route, never
     on it, and clear of reserved boxes by 30 m. No candidate: no
     landmark in that cell. Without a route the first free candidate wins. */
  var LM_CELL = 12;
  var LM_NEAR = 150, LM_FAR = 400;
  function landmarkAt(cx, cz, C, route) {
    var R = rng(hashU(cx, cz, C.seed >>> 0, 41));
    var type = R.chance(0.5) ? 'crown' : 'pair';
    var tube = route && route.tube ? route.tube : null, smp = tube ? tube.samples : null, tr0 = tube ? tube.r : 0;
    var nb = LM_CELL * 2, res = C.reserved || [];
    function dist(x0, z0, x1, z1, step) {
      var best = Infinity;
      for (var i = 0; i < smp.length; i += step) {
        var p = smp[i].p, dx = Math.max(x0 - p[0], 0, p[0] - x1), dz = Math.max(z0 - p[2], 0, p[2] - z1);
        var d2 = dx * dx + dz * dz;
        if (d2 < best) best = d2;
      }
      return Math.sqrt(best) - tr0;
    }
    for (var tr = 0; tr < 40; tr++) {
      var bi = R.int(0, nb - 1), bk = R.int(0, nb - 1);
      var ix = cx * LM_CELL + (bi >> 1), iz = cz * LM_CELL + (bk >> 1), blk = (bi & 1) + 2 * (bk & 1);
      var x0 = ix * TILE + HALF_ST + (bi & 1) * TILE / 2, z0 = iz * TILE + HALF_ST + (bk & 1) * TILE / 2;
      var x1 = x0 + BLOCK, z1 = z0 + BLOCK, bad = false;
      for (var k = 0; k < res.length && !bad; k++) {
        var rb = res[k];
        if (x1 > rb.min[0] - 30 && x0 < rb.max[0] + 30 && z1 > rb.min[2] - 30 && z0 < rb.max[2] + 30) bad = true;
      }
      if (bad) continue;
      if (smp) {
        /* every 4th sample first (16 m apart, at most 8 m off), then all */
        var dc = dist(x0, z0, x1, z1, 4);
        if (dc < LM_NEAR + 8 || dc > LM_FAR - 8) continue;
        var de = dist(x0, z0, x1, z1, 1);
        if (de < LM_NEAR || de > LM_FAR) continue;
      }
      return { ix: ix, iz: iz, blk: blk, type: type, cell: [cx, cz], rect: [x0, z0, x1, z1] };
    }
    return null;
  }

  /* City life constants (see holoPlace and beaconPlace in makeTile).
     HOLO_P: chance per tile at life rate 1. Only about 40 % of the tiles
     round a core have a candidate pair at all, so at liveliness 1 every
     one of them gets its hologram: 23 to 40 of 81 tiles over three seeds
     (the full-width rule of 2026-10-25 needs one tier face per tower
     over the quad's height), 14 to 23 at the default liveliness 0.6. HOLO_SAT: the hologram colour keeps this
     fraction of the HSV saturation of its neon hue (see holoRGB). */
  var HOLO_P = 1, HOLO_SAT = 0.45, HOLO_SIMILAR = 0.25, HOLO_GAP = [40, 120], HOLO_MIN_TOP = 120;
  /* the quad spans the gap face to face, HOLO_INSET metres short of each
     face; the ticker scrolls at HOLO_SPEED m/s */
  var HOLO_INSET = 1.5, HOLO_SPEED = [3, 8], HOLO_CELLS = 64;
  var BEACON_TALL = 250;
  /* beacon and hologram light, sRGB numbers for the additive layers: the
     aviation red and the plant amber are small point lights, the only
     light outside the two neon hues and the bone whites */
  var BEACON_RED = [1, 0.09, 0.05], BEACON_AMBER = [1, 0.58, 0.2], HOLO_GAIN = 0.9;
  /* A neon hue (0xRRGGBB) desaturated to k of its HSV saturation at the
     same value: every channel moves towards the largest by (1 - k). For
     the two hues of the page, cyan 0x2ee8ff (S 0.820) and magenta
     0xff3fa4 (S 0.753), k = 0.45 gives S 0.369 and 0.339, the pastels
     0xa1f5ff and 0xffa9d6. sRGB numbers, 0 to 1. */
  function holoRGB(hex, k) {
    var c = [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];
    var mx = Math.max(c[0], c[1], c[2]);
    return c.map(function (v) { return mx - (mx - v) * k; });
  }
  function hsvSat(c) { var mx = Math.max(c[0], c[1], c[2]), mn = Math.min(c[0], c[1], c[2]); return mx > 0 ? (mx - mn) / mx : 0; }

  function tileKey(ix, iz) { return ix + ',' + iz; }
  function tileOf(p) { return [Math.floor(p[0] / TILE), Math.floor(p[2] / TILE)]; }
  function inLaneBand(y0, y1) {
    for (var i = 0; i < LANE_Y.length; i++) {
      if (y1 > LANE_Y[i] - LANE_CLEAR && y0 < LANE_Y[i] + LANE_CLEAR) return true;
    }
    return false;
  }
  function boxDist(b, p) {
    var dx = Math.max(b.min[0] - p[0], 0, p[0] - b.max[0]);
    var dy = Math.max(b.min[1] - p[1], 0, p[1] - b.max[1]);
    var dz = Math.max(b.min[2] - p[2], 0, p[2] - b.max[2]);
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }
  function boxesOverlap(a, b, m) {
    return a.min[0] < b.max[0] + m && a.max[0] > b.min[0] - m &&
      a.min[1] < b.max[1] + m && a.max[1] > b.min[1] - m &&
      a.min[2] < b.max[2] + m && a.max[2] > b.min[2] - m;
  }

  /* ---- one tile ------------------------------------------------------------
     makeTile(ix, iz, seed, route, opts) -> {
       key, ix, iz, x0, z0, seed,
       boxes:   [{ min, max, c, half, idx, tone, seed, kind, g, prog }]
                kind 'tier' | 'roof' | 'mast' | 'balcony' | 'bridge' | 'blade'
                     | 'crown'; g the building it belongs to; prog the facade
                     program (STOREY above). The 'ledge' slabs are gone (V1)
                     and the rare parking deck went with the old lot rule.
       lots:    { total, built, empty, lowered, cut, dropped, boxDrops }
       lights:  [{ p, size, kind: 'beacon' | 'haze', hue }]
       accents: [{ p, n, w, h, hue, seed, kind: 'flat' | 'blade' }]
       pads:    [{ p, n, w, d, kind: 'roof' | 'balcony' | 'deck' }]  (no deck since V3)
       cables:  [{ a, b, sag }]
       bridges: [box index]
       streets: [{ a, b }]   street centre lines, for the lamp lines
       top,
       buildings: [{ g, arch, dist, prog, block, top }]
       landmark: { type: 'crown' | 'pair', g, block, top, cell } or null }
     Content depends only on (ix, iz, seed), the route's tube, the reserved
     list, opts and the pure coarse functions districtAt and landmarkAt, so
     a tile comes out the same in any load order. */
  function makeTile(ix, iz, seed, route, opts) {
    var C = merge(DEF, opts);
    C.seed = seed >>> 0;
    var R = rng(hashU(ix, iz, C.seed, 1));
    var x0 = ix * TILE, z0 = iz * TILE;
    var nAcc = clamp(Math.round(C.accents), 0, 2);
    var tube = route && route.tube ? route.tube : null;
    var Rm = tube ? tube.r + C.margin : 0;

    /* The tube samples that can matter for this tile, once. */
    var S = [];
    if (tube) {
      var reach = Rm + 12;
      var smp = tube.samples;
      for (var si = 0; si < smp.length; si++) {
        var q = smp[si].p;
        if (q[0] > x0 - reach && q[0] < x0 + TILE + reach && q[2] > z0 - reach && q[2] < z0 + TILE + reach) S.push(q);
      }
    }
    var RES = [];
    if (C.reserved) {
      for (var ri = 0; ri < C.reserved.length; ri++) {
        var rb = C.reserved[ri];
        if (rb.max[0] > x0 - 8 && rb.min[0] < x0 + TILE + 8 && rb.max[2] > z0 - 8 && rb.min[2] < z0 + TILE + 8) RES.push(rb);
      }
    }

    var TOP = C.maxH * C.landmark;
    /* Highest roof a footprint may carry. -Infinity: nothing may stand. */
    function capFor(rx0, rz0, rx1, rz1) {
      var cap = TOP, k;
      rx0 -= 1.2; rz0 -= 1.2; rx1 += 1.2; rz1 += 1.2;
      for (k = 0; k < S.length; k++) {
        var p = S[k];
        var dx = Math.max(rx0 - p[0], 0, p[0] - rx1), dz = Math.max(rz0 - p[2], 0, p[2] - rz1);
        var d2 = dx * dx + dz * dz;
        if (d2 >= Rm * Rm) continue;
        var lim = p[1] - Math.sqrt(Rm * Rm - d2) - C.roofGap;
        if (lim < cap) cap = lim;
      }
      for (k = 0; k < RES.length; k++) {
        var b = RES[k];
        if (rx1 > b.min[0] - 4 && rx0 < b.max[0] + 4 && rz1 > b.min[2] - 4 && rz0 < b.max[2] + 4) {
          cap = b.min[1] > 0 ? Math.min(cap, b.min[1] - 10) : -Infinity;
        }
      }
      return cap;
    }
    /* The guarantee: a box keeps Rm from every tube sample (the samples are
       4 m apart, so the curve between two of them is at most 2 m closer,
       inside the 3 m margin) and stays out of every reserved box. */
    function clear(b) {
      var k;
      for (k = 0; k < S.length; k++) if (boxDist(b, S[k]) < Rm) return false;
      for (k = 0; k < RES.length; k++) if (boxesOverlap(b, RES[k], 2)) return false;
      return true;
    }
    function pointClear(p) {
      var k;
      for (k = 0; k < S.length; k++) {
        var dx = S[k][0] - p[0], dy = S[k][1] - p[1], dz = S[k][2] - p[2];
        if (dx * dx + dy * dy + dz * dz < Rm * Rm) return false;
      }
      for (k = 0; k < RES.length; k++) if (boxDist(RES[k], p) < 2) return false;
      return true;
    }

    var boxes = [], buildings = [], pads = [], accents = [], lights = [], cables = [], bridges = [];
    var lots = { total: 0, built: 0, empty: 0, lowered: 0, cut: 0, dropped: 0, boxDrops: 0 };
    var gId = 0, landmark = null, whiteOf = {};
    /* KV: how far archetype weights, tones and the high point rule have
       moved from the old uniform city towards the district tables; full at
       variety 0.7. Above 0.7 variety only widens the land outside the core
       district (districtAt). */
    var KV = Math.min(1, clamp(C.variety, 0, 1) / 0.7);
    function mk(bx0, by0, bz0, bx1, by1, bz1, tone, sd, kind, g, prog) {
      return { min: [bx0, by0, bz0], max: [bx1, by1, bz1], tone: tone, seed: sd, kind: kind, g: g,
        prog: prog == null ? PROG_PLAIN : prog };
    }
    var MIN_FL = Math.ceil(C.minH / STOREY - 1e-9);
    /* storeys that fit under a roof height y (metres) */
    function fl(y) { return Math.floor(y / STOREY + 1e-9); }

    /* A stack of tiers on footprint fp = [x0, z0, x1, z1], from storey f0
       up by nFl storeys. Every tier edge sits on the 3.6 m storey grid, so
       the cornice the shader draws under each tier top meets a slab line.
       style: 'center' (shrinks about the middle, the old wedding cake),
       'side' (one face stays flush, the others step back), 'corner' (two
       faces flush), 'offset' (each tier shifted sideways, up to 8 m beyond
       the one below, kept inside lot = [x0, z0, x1, z1]), 'single'. nt
       forces the number of tiers. */
    function stack(fp, f0, nFl, style, lot, tone, sd, g, prog, nt) {
      var out = [], tiers = [];
      var h = nFl * STOREY;
      if (nt == null) nt = style === 'single' ? 1 : (h > 90 ? R.int(2, 4) : (h > 45 ? R.int(1, 2) : 1));
      var side = R.int(0, 3), cur = fp.slice(), f = f0, rem = nFl;
      function next(c) {
        var w = c[2] - c[0], d = c[3] - c[1], n;
        if (style === 'side') {
          var k = R.range(0.6, 0.82), kk = R.range(0.9, 1);
          if (side < 2) {
            n = side === 0 ? [c[2] - w * k, 0, c[2], 0] : [c[0], 0, c[0] + w * k, 0];
            var mz = (c[1] + c[3]) / 2; n[1] = mz - d * kk / 2; n[3] = mz + d * kk / 2;
          } else {
            n = side === 2 ? [0, c[3] - d * k, 0, c[3]] : [0, c[1], 0, c[1] + d * k];
            var mx = (c[0] + c[2]) / 2; n[0] = mx - w * kk / 2; n[2] = mx + w * kk / 2;
          }
        } else if (style === 'corner') {
          var kx = R.range(0.62, 0.84), kz = R.range(0.62, 0.84);
          n = [side & 1 ? c[2] - w * kx : c[0], side & 2 ? c[3] - d * kz : c[1], side & 1 ? c[2] : c[0] + w * kx, side & 2 ? c[3] : c[1] + d * kz];
        } else if (style === 'offset') {
          var nw = w * R.range(0.84, 1), nd = d * R.range(0.84, 1);
          var ax = R.chance(0.5), sh = R.range(3, 8) * (R.chance(0.5) ? 1 : -1), sg = sh > 0 ? 1 : -1;
          var cx2 = (c[0] + c[2]) / 2 + (ax ? sh + sg * (w - nw) / 2 : 0);
          var cz2 = (c[1] + c[3]) / 2 + (ax ? 0 : sh + sg * (d - nd) / 2);
          cx2 = clamp(cx2, lot[0] + nw / 2, lot[2] - nw / 2); cz2 = clamp(cz2, lot[1] + nd / 2, lot[3] - nd / 2);
          n = [cx2 - nw / 2, cz2 - nd / 2, cx2 + nw / 2, cz2 + nd / 2];
        } else {
          var sx = R.range(0.62, 0.86), sz = R.range(0.62, 0.9), ccx = (c[0] + c[2]) / 2, ccz = (c[1] + c[3]) / 2;
          n = [ccx - w * sx / 2, ccz - d * sz / 2, ccx + w * sx / 2, ccz + d * sz / 2];
        }
        return (n[2] - n[0] < 12 || n[3] - n[1] < 12) ? null : n;
      }
      for (var t = 0; rem > 0; t++) {
        var nfp = t < nt - 1 ? next(cur) : null;
        var th = nfp ? Math.max(5, Math.round(rem * R.range(0.35, 0.6))) : rem;
        if (rem - th < 4) { th = rem; nfp = null; }
        var y0 = f * STOREY, y1 = (f + th) * STOREY;
        tiers.push({ x0: cur[0], x1: cur[2], z0: cur[1], z1: cur[3], y0: y0, y1: y1 });
        out.push(mk(cur[0], y0, cur[1], cur[2], y1, cur[3], tone + R.range(-0.02, 0.02), sd, 'tier', g, prog));
        f += th; rem -= th;
        if (nfp) cur = nfp;
      }
      return { boxes: out, tiers: tiers, top: f * STOREY };
    }
    /* roof clutter and maybe a mast on the top tier, as before */
    function roof(res, cap, tone, sd, g) {
      var top = res.tiers[res.tiers.length - 1], ty = top.y1;
      var tw = top.x1 - top.x0, tdp = top.z1 - top.z0, cx = (top.x0 + top.x1) / 2, cz = (top.z0 + top.z1) / 2;
      var k = R.int(1, 4);
      for (var i = 0; i < k; i++) {
        var bw = R.range(2, Math.max(2.5, tw * 0.4)), bd = R.range(2, Math.max(2.5, tdp * 0.4));
        var bx = cx + R.range(-1, 1) * (tw - bw) * 0.5, bz = cz + R.range(-1, 1) * (tdp - bd) * 0.5;
        var bh = Math.min(R.range(1.5, 5), Math.max(0.5, cap - ty));
        res.boxes.push(mk(bx - bw / 2, ty, bz - bd / 2, bx + bw / 2, ty + bh, bz + bd / 2, tone * 0.8, sd, 'roof', g));
      }
      if (R.chance(0.5)) {
        var mh = R.range(8, 30), mx = cx + R.range(-0.3, 0.3) * tw;
        if (ty + mh <= cap) res.boxes.push(mk(mx - 0.18, ty, cz - 0.18, mx + 0.18, ty + mh, cz + 0.18, 0.2, sd, 'mast', g));
      }
    }
    /* Bridges between the two towers of one building (twins, the landmark
       pair): axis 0 means A lies at lower x than B, axis 1 at lower z.
       Storey aligned, two storeys high, never in a lane band, never in the
       tube, at least three storeys apart. */
    function pairBridges(A, B, axis, n, tone, sd, g, out) {
      var made = 0;
      for (var tr = 0; tr < 16 && made < n; tr++) {
        var f0 = R.int(6, Math.max(7, fl(Math.min(A.top, B.top)) - 6)), by = f0 * STOREY, bh = 2 * STOREY;
        if (inLaneBand(by - 1, by + bh + 1)) continue;
        var ta = tierAt(A, by, by + bh, axis, 1), tb = tierAt(B, by, by + bh, axis, -1);
        if (!ta || !tb) continue;
        var lo = axis === 0 ? Math.max(ta.z0, tb.z0) : Math.max(ta.x0, tb.x0);
        var hi = axis === 0 ? Math.min(ta.z1, tb.z1) : Math.min(ta.x1, tb.x1);
        var bw = R.range(7, 11);
        if (hi - lo < bw + 4) continue;
        var cc = R.range(lo + bw / 2 + 2, hi - bw / 2 - 2);
        var bx = axis === 0 ? mk(ta.x1, by, cc - bw / 2, tb.x0, by + bh, cc + bw / 2, tone, sd, 'bridge', g, A.prog)
          : mk(cc - bw / 2, by, ta.z1, cc + bw / 2, by + bh, tb.z0, tone, sd, 'bridge', g, A.prog);
        if (bx.max[0] - bx.min[0] <= 0.5 || bx.max[2] - bx.min[2] <= 0.5 || !clear(bx)) continue;
        var dup = false;
        for (var q = 0; q < out.length; q++) if (Math.abs(out[q].min[1] - by) < 3 * STOREY) dup = true;
        if (dup) continue;
        out.push(bx); made++;
      }
    }
    /* B as A mirrored across the line x = mid (axis 0) or z = mid: true twins */
    function mirror(A, axis, mid, sd, g) {
      var tiers = [], out = [];
      for (var i = 0; i < A.tiers.length; i++) {
        var q = A.tiers[i], ab = A.boxes[i];
        var t = axis === 0 ? { x0: 2 * mid - q.x1, x1: 2 * mid - q.x0, z0: q.z0, z1: q.z1, y0: q.y0, y1: q.y1 }
          : { x0: q.x0, x1: q.x1, z0: 2 * mid - q.z1, z1: 2 * mid - q.z0, y0: q.y0, y1: q.y1 };
        tiers.push(t);
        out.push(mk(t.x0, t.y0, t.z0, t.x1, t.y1, t.z1, ab.tone, sd, 'tier', g, ab.prog));
      }
      return { tiers: tiers, boxes: out, top: A.top };
    }

    /* ---- archetypes (V3, V4) -------------------------------------------
       Each takes the lot L = [x0, z0, x1, z1], the storeys nFl it may use,
       the roof cap and the building's tone, seed, id and facade program,
       and returns { boxes, tiers, top, flat?, extra? } or null when the
       lot does not suit it. Axis aligned boxes, footprints inside the lot,
       nothing under 5 m except the old roof clutter and masts. */
    var ARCH = {
      setback: function (L, nFl, cap, tone, sd, g, prog) {
        var w = L[2] - L[0], d = L[3] - L[1], tw = w - R.range(2, 7), td = d - R.range(2, 7);
        var cx = (L[0] + L[2]) / 2, cz = (L[1] + L[3]) / 2;
        var r = R(), style = r < 1 - 2 * KV / 3 ? 'center' : (r < 1 - KV / 3 ? 'side' : 'corner');
        var res = stack([cx - tw / 2, cz - td / 2, cx + tw / 2, cz + td / 2], 0, nFl, style, L, tone, sd, g, prog);
        res.flat = tw >= 22 && td >= 22 && R.chance(0.35);
        if (!res.flat) roof(res, cap, tone, sd, g);
        return res;
      },
      offset: function (L, nFl, cap, tone, sd, g, prog) {
        var inner = [L[0] + 1.5, L[1] + 1.5, L[2] - 1.5, L[3] - 1.5];
        var w = inner[2] - inner[0], d = inner[3] - inner[1];
        var bw = w * R.range(0.68, 0.82), bd = d * R.range(0.68, 0.82);
        var cx = inner[0] + bw / 2 + R() * (w - bw), cz = inner[1] + bd / 2 + R() * (d - bd);
        var nt = nFl * STOREY > 70 ? R.int(3, 4) : 2;
        var res = stack([cx - bw / 2, cz - bd / 2, cx + bw / 2, cz + bd / 2], 0, nFl, 'offset', inner, tone, sd, g, prog, nt);
        res.flat = R.chance(0.3);
        if (!res.flat) roof(res, cap, tone, sd, g);
        return res;
      },
      slab: function (L, nFl, cap, tone, sd, g, prog) {
        var w = L[2] - L[0], d = L[3] - L[1], alongX = w >= d;
        var Ll = alongX ? w : d, Ls = alongX ? d : w;
        if (Ll < 50 || Ls < 18) return null;
        var len = Math.min(Ll - 3, R.range(60, 76)), dep = Math.min(Ls - R.range(3, 8), R.range(16, 26));
        var a0 = R.chance(0.5) ? 1.5 : Ll - 1.5 - len;
        var s0 = R.chance(0.5) ? (Ls - dep) / 2 : (R.chance(0.5) ? 1.5 : Ls - 1.5 - dep);
        var fp = alongX ? [L[0] + a0, L[1] + s0, L[0] + a0 + len, L[1] + s0 + dep] : [L[0] + s0, L[1] + a0, L[0] + s0 + dep, L[1] + a0 + len];
        /* at most one step, one-sided */
        var res = stack(fp, 0, nFl, 'side', L, tone, sd, g, prog, R.chance(0.45) ? 2 : 1);
        res.flat = dep >= 20 && R.chance(0.3);
        if (!res.flat) roof(res, cap, tone, sd, g);
        return res;
      },
      podium: function (L, nFl, cap, tone, sd, g, prog) {
        var pf = R.int(6, 12);
        if (nFl - pf < 12) return null;
        var m = R.range(1.5, 4), P = [L[0] + m, L[1] + m, L[2] - m, L[3] - m];
        var pw = P[2] - P[0], pd = P[3] - P[1];
        var tw = Math.max(16, pw * R.range(0.45, 0.62)), td = Math.max(16, pd * R.range(0.45, 0.62));
        var c = R.int(0, 3), ins = R.range(0, 3);
        var tx0 = c & 1 ? P[2] - ins - tw : P[0] + ins, tz0 = c & 2 ? P[3] - ins - td : P[1] + ins;
        var base = mk(P[0], 0, P[1], P[2], pf * STOREY, P[3], tone - 0.02, sd, 'tier', g, prog);
        var res = stack([tx0, tz0, tx0 + tw, tz0 + td], pf, nFl - pf, R.chance(0.5) ? 'center' : 'side', P, tone, sd, g, prog);
        res.boxes.unshift(base);
        res.tiers.unshift({ x0: P[0], x1: P[2], z0: P[1], z1: P[3], y0: 0, y1: pf * STOREY });
        roof(res, cap, tone, sd, g);
        return res;
      },
      twin: function (L, nFl, cap, tone, sd, g, prog) {
        var w = L[2] - L[0], d = L[3] - L[1], axis = R.chance(0.5) ? 0 : 1;
        var gap = R.range(12, 20), m = R.range(2, 5);
        var half = ((axis === 0 ? w : d) - gap - 2 * m) / 2, deep = (axis === 0 ? d : w) - 2 * m - R.range(0, 10);
        if (half < 16) return null;
        var mc = axis === 0 ? (L[1] + L[3]) / 2 : (L[0] + L[2]) / 2;
        var fa = axis === 0 ? [L[0] + m, mc - deep / 2, L[0] + m + half, mc + deep / 2] : [mc - deep / 2, L[1] + m, mc + deep / 2, L[1] + m + half];
        var A = stack(fa, 0, nFl, 'center', L, tone, sd, g, prog, nFl * STOREY > 120 ? 2 : 1);
        var B = mirror(A, axis, axis === 0 ? (L[0] + L[2]) / 2 : (L[1] + L[3]) / 2, sd, g);
        var res = { boxes: A.boxes.concat(B.boxes), tiers: A.tiers.concat(B.tiers), top: A.top, flat: true, extra: [] };
        pairBridges({ tiers: A.tiers, top: A.top, prog: prog }, { tiers: B.tiers, top: A.top }, axis, R.int(1, 3), tone - 0.03, sd, g, res.extra);
        return res;
      },
      hall: function (L, nFl, cap, tone, sd, g, prog) {
        var m = R.range(2, 5), P = [L[0] + m, L[1] + m, L[2] - m, L[3] - m];
        /* the hall at 55 to 75 % of the lot's storeys, a taller block to
           the full height, so the block's high point rule holds */
        var f1 = clamp(Math.round(nFl * R.range(0.55, 0.75)), MIN_FL, nFl);
        var res = { boxes: [mk(P[0], 0, P[1], P[2], f1 * STOREY, P[3], tone, sd, 'tier', g, prog)],
          tiers: [{ x0: P[0], x1: P[2], z0: P[1], z1: P[3], y0: 0, y1: f1 * STOREY }], top: f1 * STOREY, flat: true };
        var pw = P[2] - P[0], pd = P[3] - P[1];
        if (nFl > f1 + 3) {
          /* a taller block against one side of the hall */
          var f2 = nFl, alongX = R.chance(0.5), k = R.range(0.35, 0.6), lo = R.chance(0.5);
          var q = alongX ? [lo ? P[0] : P[2] - pw * k, P[1], lo ? P[0] + pw * k : P[2], P[3]] : [P[0], lo ? P[1] : P[3] - pd * k, P[2], lo ? P[1] + pd * k : P[3]];
          res.boxes.push(mk(q[0], f1 * STOREY, q[1], q[2], f2 * STOREY, q[3], tone, sd, 'tier', g, prog));
          res.tiers.push({ x0: q[0], x1: q[2], z0: q[1], z1: q[3], y0: f1 * STOREY, y1: f2 * STOREY });
          res.top = f2 * STOREY; res.flat = false;
        }
        /* plant on the hall roof: a few blocks of 6 to 12 m, nothing under 5 m */
        var low = res.tiers[0], nu = R.int(2, 4);
        for (var i = 0; i < nu; i++) {
          var uw = R.range(8, 16), ud = R.range(8, 16), uh = Math.min(R.range(6, 12), cap - low.y1);
          if (uh < 5) break;
          var ux = R.range(low.x0 + uw / 2 + 2, low.x1 - uw / 2 - 2), uz = R.range(low.z0 + ud / 2 + 2, low.z1 - ud / 2 - 2);
          var ub = mk(ux - uw / 2, low.y1, uz - ud / 2, ux + uw / 2, low.y1 + uh, uz + ud / 2, tone * 0.85, sd, 'roof', g);
          var hit = false;
          for (var j = 1; j < res.boxes.length; j++) if (boxesOverlap(ub, res.boxes[j], 1)) hit = true;
          if (!hit) res.boxes.push(ub);
        }
        return res;
      },
      silo: function (L, nFl, cap, tone, sd, g, prog) {
        var m = R.range(2, 4), w = L[2] - L[0] - 2 * m, d = L[3] - L[1] - 2 * m;
        var nx = w > 50 ? 2 : 1, nz = d > 50 ? 2 : 1;
        if (nx * nz < 2) return null;
        var gp = R.range(5, 9), sx = (w - (nx - 1) * gp) / nx, sz = (d - (nz - 1) * gp) / nz;
        var res = { boxes: [], tiers: [], top: 0, flat: true };
        for (var i = 0; i < nx; i++) for (var k = 0; k < nz; k++) {
          var f = clamp(nFl - R.int(0, 3), MIN_FL, nFl), bx0 = L[0] + m + i * (sx + gp), bz0 = L[1] + m + k * (sz + gp);
          res.boxes.push(mk(bx0, 0, bz0, bx0 + sx, f * STOREY, bz0 + sz, tone, sd, 'tier', g, prog));
          res.tiers.push({ x0: bx0, x1: bx0 + sx, z0: bz0, z1: bz0 + sz, y0: 0, y1: f * STOREY });
          res.top = Math.max(res.top, f * STOREY);
        }
        return res;
      }
    };
    /* the type a lot falls back to when the tube lowers it */
    var SIMPLER = { setback: 'setback', offset: 'setback', slab: 'slab', podium: 'setback', twin: 'setback', hall: 'hall', silo: 'hall', court: 'court' };

    /* Courtyard, U and L (V4): wings round a court of 20 to 36 m on a whole
       block, one wing maybe a fifth to two fifths taller. Each wing has its
       own cap: a wing under the tube is lowered or left out, so a U becomes
       an L rather than a cut tower. */
    function court(L, nFl, tone, sd, g, prog) {
      var m = R.range(2, 4), P = [L[0] + m, L[1] + m, L[2] - m, L[3] - m];
      var w = P[2] - P[0], d = P[3] - P[1], c = R.range(20, 36);
      var dx = (w - c) / 2, dz = (d - c) / 2;
      var r = R(), form = r < 0.45 ? 4 : (r < 0.8 ? 3 : 2), open = R.int(0, 3);
      var W4 = [
        [P[0], P[1], P[2], P[1] + dz],
        [P[0], P[3] - dz, P[2], P[3]],
        [P[0], P[1] + dz, P[0] + dx, P[3] - dz],
        [P[2] - dx, P[1] + dz, P[2], P[3] - dz]
      ];
      var keep = [true, true, true, true];
      if (form <= 3) keep[open] = false;
      /* an L: one full wing (0 or 1) and one side wing (2 or 3) */
      if (form === 2) keep[open < 2 ? 2 + R.int(0, 1) : R.int(0, 1)] = false;
      var tall = R.int(0, 3), res = { boxes: [], tiers: [], top: 0, flat: true };
      for (var i = 0; i < 4; i++) {
        if (!keep[i]) continue;
        var q = W4[i].slice();
        if (i >= 2) {
          /* a side wing runs on over the corner a missing full wing left */
          if (!keep[0]) q[1] = P[1];
          if (!keep[1]) q[3] = P[3];
        }
        var f = i === tall ? Math.round(nFl * R.range(1.2, 1.4)) : nFl;
        var cap = Math.min(capFor(q[0], q[1], q[2], q[3]), TOP);
        if (f * STOREY > cap - 6) { f = fl(cap - 6); lots.lowered++; }
        if (f < MIN_FL) continue;
        var bx = mk(q[0], 0, q[1], q[2], f * STOREY, q[3], tone + R.range(-0.015, 0.015), sd, 'tier', g, prog);
        if (!clear(bx)) continue;
        res.boxes.push(bx);
        res.tiers.push({ x0: q[0], x1: q[2], z0: q[1], z1: q[3], y0: 0, y1: f * STOREY });
        res.top = Math.max(res.top, f * STOREY);
      }
      return res.boxes.length ? res : null;
    }

    /* Lot placement with the tube rule. plan: { arch, h, prog, tone, dist, hp }. */
    function placeLot(lx0, lz0, lx1, lz1, depth, block, plan) {
      lots.total++;
      /* the block's high point is always built (with full variety) */
      if (!R.chance(C.density) && !(plan.hp && KV > 0)) { lots.empty++; return; }
      var cap = capFor(lx0, lz0, lx1, lz1);
      var w = lx1 - lx0, d = lz1 - lz0;
      if (cap < C.minH * 0.6 + 6 && plan.arch !== 'court') {
        if (depth === 0 && w >= 32 && d >= 32) {
          lots.cut++;
          lots.total--;
          var mx = (lx0 + lx1) / 2, mz = (lz0 + lz1) / 2, gap = 2.5;
          var sub = { arch: 'setback', h: plan.h, prog: plan.prog, tone: plan.tone, dist: plan.dist };
          placeLot(lx0, lz0, mx - gap, mz - gap, 1, block, sub);
          placeLot(mx + gap, lz0, lx1, mz - gap, 1, block, sub);
          placeLot(lx0, mz + gap, mx - gap, lz1, 1, block, sub);
          placeLot(mx + gap, mz + gap, lx1, lz1, 1, block, sub);
        } else lots.dropped++;
        return;
      }
      var cx = (lx0 + lx1) / 2, cz = (lz0 + lz1) / 2;
      var g = gId++, sd = R();
      var tone = plan.tone + R.range(-0.03, 0.03) * KV;
      var arch = plan.arch, L = [lx0, lz0, lx1, lz1], res = null;
      if (arch === 'court') {
        res = court(L, Math.max(MIN_FL, fl(plan.h)), tone, sd, g, plan.prog);
        if (!res) { lots.dropped++; return; }
      } else {
        var h = plan.h;
        if (h > cap - 6) { h = cap - 6; lots.lowered++; arch = SIMPLER[arch]; }
        var nFl = fl(h);
        if (nFl * STOREY < 8) { lots.dropped++; return; }
        var capR = Math.min(cap, TOP);
        res = ARCH[arch](L, nFl, capR, tone, sd, g, plan.prog);
        if (!res) { arch = 'setback'; res = ARCH.setback(L, nFl, capR, tone, sd, g, plan.prog); }
      }
      /* the guarantee, building by building */
      for (var k = 0; k < res.boxes.length; k++) {
        if (!clear(res.boxes[k])) { lots.dropped++; return; }
      }
      lots.built++;
      var b = { g: g, cx: cx, cz: cz, tiers: res.tiers, top: res.top, seed: sd, tone: tone, block: block,
        arch: arch, dist: plan.dist, prog: plan.prog };
      buildings.push(b);
      for (k = 0; k < res.boxes.length; k++) boxes.push(res.boxes[k]);
      if (res.extra) for (k = 0; k < res.extra.length; k++) { bridges.push(boxes.length); boxes.push(res.extra[k]); }
      var tt = res.tiers[res.tiers.length - 1], tw2 = tt.x1 - tt.x0, td2 = tt.z1 - tt.z0;
      if (res.flat && tw2 >= 20 && td2 >= 20 && tt.y1 >= res.top - 1e-6) {
        pads.push({ p: [(tt.x0 + tt.x1) / 2, tt.y1, (tt.z0 + tt.z1) / 2], n: [0, 1, 0], w: tw2, d: td2, kind: 'roof' });
      }
      if (res.top > 200) lights.push(whiteOf[g] = { p: [(tt.x0 + tt.x1) / 2, res.top + 2, (tt.z0 + tt.z1) / 2], size: 6, kind: 'beacon', hue: -1 });
    }

    /* The landmark of this tile's coarse cell, if its block lies here (V7).
       Full height or nothing: if the tube or a reserved box would cap it,
       or one of its boxes fails the guarantee, the block is built as an
       ordinary block instead. */
    function placeLandmark(LM, B, blk) {
      if (capFor(B[0], B[1], B[2], B[3]) < TOP) return false;
      var g = gId++, sd = R(), tone = 0.27 + R.range(-0.02, 0.02);
      var out, tiers, extra = [], m = R.range(4, 7), P = [B[0] + m, B[1] + m, B[2] - m, B[3] - m];
      if (LM.type === 'crown') {
        /* a crowned tower: three or four tiers to under the crown, then four
           frame walls of 5 m round an open top, up to TOP exactly */
        var crownH = R.range(12, 24);
        var res = stack(P, 0, fl(TOP - crownH), 'center', P, tone, sd, g, PROG_LANDMARK, R.int(3, 4));
        out = res.boxes; tiers = res.tiers;
        out[out.length - 1].prog = PROG_CROWN;
        var t = tiers[tiers.length - 1], y0 = t.y1, th = 5, ct = tone * 0.8;
        out.push(mk(t.x0, y0, t.z0, t.x1, TOP, t.z0 + th, ct, sd, 'crown', g));
        out.push(mk(t.x0, y0, t.z1 - th, t.x1, TOP, t.z1, ct, sd, 'crown', g));
        out.push(mk(t.x0, y0, t.z0 + th, t.x0 + th, TOP, t.z1 - th, ct, sd, 'crown', g));
        out.push(mk(t.x1 - th, y0, t.z0 + th, t.x1, TOP, t.z1 - th, ct, sd, 'crown', g));
      } else {
        /* a pair: two equal towers to the last storey under TOP, two or
           three bridges between them */
        var axis = R.chance(0.5) ? 0 : 1, gap = R.range(14, 20);
        var half = ((axis === 0 ? P[2] - P[0] : P[3] - P[1]) - gap) / 2;
        var fa = axis === 0 ? [P[0], P[1] + 4, P[0] + half, P[3] - 4] : [P[0] + 4, P[1], P[2] - 4, P[1] + half];
        var A = stack(fa, 0, fl(TOP), 'center', fa, tone, sd, g, PROG_LANDMARK, 3);
        A.boxes[A.boxes.length - 1].prog = PROG_CROWN;
        var Bm = mirror(A, axis, axis === 0 ? (P[0] + P[2]) / 2 : (P[1] + P[3]) / 2, sd, g);
        out = A.boxes.concat(Bm.boxes); tiers = A.tiers.concat(Bm.tiers);
        pairBridges({ tiers: A.tiers, top: A.top, prog: PROG_LANDMARK }, { tiers: Bm.tiers, top: A.top }, axis, R.int(2, 3), tone - 0.04, sd, g, extra);
      }
      for (var k = 0; k < out.length; k++) if (!clear(out[k])) return false;
      var top = 0;
      for (k = 0; k < out.length; k++) { boxes.push(out[k]); top = Math.max(top, out[k].max[1]); }
      for (k = 0; k < extra.length; k++) { bridges.push(boxes.length); boxes.push(extra[k]); }
      buildings.push({ g: g, cx: (B[0] + B[2]) / 2, cz: (B[1] + B[3]) / 2, tiers: tiers, top: top, seed: sd, tone: tone, block: blk,
        arch: 'landmark', dist: -1, prog: PROG_LANDMARK });
      landmark = { type: LM.type, g: g, block: blk, top: top, cell: LM.cell };
      lots.total++; lots.built++;
      lights.push(whiteOf[g] = { p: [(B[0] + B[2]) / 2, top + 3, (B[1] + B[3]) / 2], size: 9, kind: 'beacon', hue: -1 });
      return true;
    }

    /* 2 x 2 blocks. The block decides first: its district (V2), its
       archetype, its split into 1, 2 or 4 lots and which lot is the high
       point; with full variety the other lots of the block stay at 60 to
       80 % of the high point's height. */
    var LM = C.landmarks ? landmarkAt(Math.floor(ix / LM_CELL), Math.floor(iz / LM_CELL), C, route) : null;
    for (var bxI = 0; bxI < 2; bxI++) {
      for (var bzI = 0; bzI < 2; bzI++) {
        var bx0 = x0 + HALF_ST + bxI * TILE / 2, bz0 = z0 + HALF_ST + bzI * TILE / 2;
        var bx1 = bx0 + BLOCK, bz1 = bz0 + BLOCK, blk = bxI + 2 * bzI;
        var r = R(), al = R.range(4, 8) / 2, pick = R(), rb = R.range(0.9, 1.15);
        var bcx = bx0 + BLOCK / 2, bcz = bz0 + BLOCK / 2;
        if (LM && LM.ix === ix && LM.iz === iz && LM.blk === blk && placeLandmark(LM, [bx0, bz0, bx1, bz1], blk)) continue;
        var dist = districtAt(bcx, bcz, C), hf = heightField(bcx, bcz, C);
        var arch = pickArch(dist, KV, pick);
        /* courts are broad and low: not in the deep core, where the
           residential district builds slabs instead */
        if (arch === 'court' && hf > 0.8) arch = 'slab';
        var hBase = C.minH + (C.maxH - C.minH) * Math.pow(hf, 1.6);
        /* tall districts cut their blocks finer: slender towers */
        var tallB = hf > 0.55, split, wh = WHOLE[arch];
        if (wh === 1) split = 1;
        else if (wh === 2) split = 2;
        else if (wh === 3) split = r < 0.55 ? 1 : 2;
        else split = r < (tallB ? 0.08 : 0.2) ? 1 : (r < (tallB ? 0.38 : 0.55) ? 2 : 4);
        var hp = R.int(0, split - 1), plans = [];
        for (var li = 0; li < split; li++) {
          var rl = R.range(0.7, 1.1), fall = R.range(0.62, 0.8), t0 = R.range(0.15, 0.34);
          var a = arch;
          if (split === 4 && WHOLE[a]) a = dist === 0 ? 'setback' : 'offset';
          /* the old city: every lot its own factor; full variety: one
             factor per block and the high point rule */
          var hh = Math.min(archHeight(a, dist, hBase * (rl + (rb - rl) * KV)), C.maxH - 6);
          if (li !== hp) hh = Math.max(C.minH, hh * (1 + (fall - 1) * KV));
          plans.push({ arch: a, h: hh, prog: dist, dist: dist, hp: li === hp && split > 1, tone: DIST_TONE[dist] + (t0 - DIST_TONE[dist]) * (1 - KV) });
        }
        if (split === 1) placeLot(bx0, bz0, bx1, bz1, 0, blk, plans[0]);
        else if (split === 2) {
          var along = R.chance(0.5), m = (along ? bx0 + bx1 : bz0 + bz1) / 2 + R.range(-8, 8);
          if (along) { placeLot(bx0, bz0, m - al, bz1, 0, blk, plans[0]); placeLot(m + al, bz0, bx1, bz1, 0, blk, plans[1]); }
          else { placeLot(bx0, bz0, bx1, m - al, 0, blk, plans[0]); placeLot(bx0, m + al, bx1, bz1, 0, blk, plans[1]); }
        } else {
          var mxx = (bx0 + bx1) / 2 + R.range(-6, 6), mzz = (bz0 + bz1) / 2 + R.range(-6, 6);
          placeLot(bx0, bz0, mxx - al, mzz - al, 0, blk, plans[0]);
          placeLot(mxx + al, bz0, bx1, mzz - al, 0, blk, plans[1]);
          placeLot(bx0, mzz + al, mxx - al, bz1, 0, blk, plans[2]);
          placeLot(mxx + al, mzz + al, bx1, bz1, 0, blk, plans[3]);
        }
      }
    }

    /* Balconies and signs need a facade: the base tier of a building. */
    var FACES = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    function addExtra(b) {
      if (clear(b)) { boxes.push(b); return true; }
      lots.boxDrops++;
      return false;
    }
    buildings.forEach(function (bd) {
      var t0 = bd.tiers[0], fh = t0.y1 - t0.y0;
      if (fh < 30) return;
      /* balcony: a cantilevered deck facing a street, a delivery spot */
      if (fh > 60 && R.chance(0.08)) {
        var f = FACES[R.int(0, 3)], bw = R.range(10, 14), pr = R.range(7, 9), y = R.range(25, fh - 20);
        /* reaching 9 m into the street, a balcony keeps out of the lane
           bands like the bridges (the tiers now stand closer to the lots'
           edges than the old centred towers did) */
        for (var yt = 0; yt < 6 && inLaneBand(y - 1.2, y); yt++) y = R.range(25, fh - 20);
        var b;
        if (f[0]) {
          var fx = f[0] > 0 ? t0.x1 : t0.x0, zc = (t0.z0 + t0.z1) / 2;
          b = mk(Math.min(fx, fx + f[0] * pr), y - 1.2, zc - bw / 2, Math.max(fx, fx + f[0] * pr), y, zc + bw / 2, bd.tone * 0.7, bd.seed, 'balcony', bd.g);
        } else {
          var fz = f[1] > 0 ? t0.z1 : t0.z0, xc = (t0.x0 + t0.x1) / 2;
          b = mk(xc - bw / 2, y - 1.2, Math.min(fz, fz + f[1] * pr), xc + bw / 2, y, Math.max(fz, fz + f[1] * pr), bd.tone * 0.7, bd.seed, 'balcony', bd.g);
        }
        if (!inLaneBand(y - 1.2, y) && addExtra(b)) {
          pads.push({ p: [(b.min[0] + b.max[0]) / 2, y, (b.min[2] + b.max[2]) / 2], n: [0, 1, 0],
            w: b.max[0] - b.min[0], d: b.max[2] - b.min[2], kind: 'balcony' });
        }
      }
      if (!nAcc || fh < 45 || !R.chance(0.3)) return;
      var hue = nAcc === 1 ? 0 : (R.chance(0.6) ? 0 : 1);
      var fc = FACES[R.int(0, 3)];
      var faceW = fc[0] ? t0.z1 - t0.z0 : t0.x1 - t0.x0;
      var fpx = fc[0] > 0 ? t0.x1 : fc[0] < 0 ? t0.x0 : (t0.x0 + t0.x1) / 2;
      var fpz = fc[1] > 0 ? t0.z1 : fc[1] < 0 ? t0.z0 : (t0.z0 + t0.z1) / 2;
      var tang = fc[0] ? [0, 0, 1] : [1, 0, 0];
      if (R.chance(0.5)) {
        /* blade sign: perpendicular to the facade, reaching into the street */
        var sh = R.range(9, 24), sw = Math.min(sh * R.range(0.22, 0.32), 6.5);
        var sy = R.range(8, Math.max(9, Math.min(fh - sh - 2, 150))) + sh / 2;
        var off = R.range(-0.35, 0.35) * faceW;
        var ax = fpx + tang[0] * off, az = fpz + tang[2] * off;
        var nx = fc[0], nz = fc[1];
        var ex = ax + nx * (sw + 1.2), ez = az + nz * (sw + 1.2);
        var bb = mk(Math.min(ax, ex) - (fc[0] ? 0 : 0.3), sy - sh / 2 - 0.2, Math.min(az, ez) - (fc[1] ? 0 : 0.3),
          Math.max(ax, ex) + (fc[0] ? 0 : 0.3), sy + sh / 2 + 0.2, Math.max(az, ez) + (fc[1] ? 0 : 0.3), 0.08, bd.seed, 'blade', bd.g);
        if (addExtra(bb)) {
          accents.push({ p: [ax + nx * (sw / 2 + 0.6), sy, az + nz * (sw / 2 + 0.6)], n: tang.slice(), w: sw, h: sh,
            hue: hue, seed: R(), kind: 'blade' });
        }
      } else {
        var vert = R.chance(0.6);
        var w2 = Math.min(R.range(6, 14), faceW - 2), h2 = vert ? w2 * R.range(1.6, 2.6) : w2 * R.range(0.3, 0.45);
        if (w2 < 4) return;
        var y2 = R.range(10, Math.max(11, Math.min(fh - h2 - 2, 160))) + h2 / 2;
        var o2 = R.range(-0.3, 0.3) * (faceW - w2);
        accents.push({ p: [fpx + tang[0] * o2 + fc[0] * 0.3, y2, fpz + tang[2] * o2 + fc[1] * 0.3], n: [fc[0], 0, fc[1]],
          w: w2, h: h2, hue: hue, seed: R(), kind: 'flat' });
      }
    });

    /* Bridges and cables across the two inner streets of the tile, so they
       stay inside it. Never in a lane band, never in the tube. */
    /* The tier of bd spanning y0..y1 that faces the other building: on
       axis 0 the one reaching furthest to +x (dir 1) or -x (dir -1), on
       axis 1 the same in z. A court's inner wing never gets a bridge
       through its neighbour wing that way. */
    function tierAt(bd, y0, y1, axis, dir) {
      var best = null, bv = -Infinity;
      for (var i = 0; i < bd.tiers.length; i++) {
        var t = bd.tiers[i];
        if (!(t.y0 <= y0 && t.y1 >= y1)) continue;
        var v = axis == null ? 0 : (axis === 0 ? (dir > 0 ? t.x1 : -t.x0) : (dir > 0 ? t.z1 : -t.z0));
        if (v > bv + 1e-9) { bv = v; best = t; }
      }
      return best;
    }
    var nBridge = 0;
    for (var axis = 0; axis < 2; axis++) {
      /* axis 0: the street along z at x = x0 + 108, between blocks 0|1 and 2|3.
         axis 1: the street along x at z = z0 + 108, between blocks 0|2 and 1|3. */
      var pairs = [];
      buildings.forEach(function (a) {
        buildings.forEach(function (b) {
          if (axis === 0 ? (a.block === 0 && b.block === 1) || (a.block === 2 && b.block === 3)
            : (a.block === 0 && b.block === 2) || (a.block === 1 && b.block === 3)) pairs.push([a, b]);
        });
      });
      for (var pi = 0; pi < pairs.length; pi++) {
        var A = pairs[pi][0], B = pairs[pi][1];
        var hMin = Math.min(A.tiers[0].y1, B.tiers[0].y1);
        if (hMin < 40) continue;
        /* skybridge */
        if (nBridge < 3 && R.chance(0.22 * C.density)) {
          for (var tr = 0; tr < 12; tr++) {
            var bh2 = R.range(3.5, 7), by = R.range(15, Math.min(hMin, 240) - bh2 - 8), bw2 = R.range(4, 9);
            if (by < 12 || inLaneBand(by - 1, by + bh2 + 1)) continue;
            var ta = tierAt(A, by, by + bh2, axis, 1), tb = tierAt(B, by, by + bh2, axis, -1);
            if (!ta || !tb) continue;
            var lo = axis === 0 ? Math.max(ta.z0, tb.z0) : Math.max(ta.x0, tb.x0);
            var hi = axis === 0 ? Math.min(ta.z1, tb.z1) : Math.min(ta.x1, tb.x1);
            if (hi - lo < bw2 + 4) continue;
            var cc = R.range(lo + bw2 / 2 + 2, hi - bw2 / 2 - 2);
            var bx = axis === 0
              ? mk(ta.x1, by, cc - bw2 / 2, tb.x0, by + bh2, cc + bw2 / 2, R.range(0.2, 0.32), R(), 'bridge', -1, 0)
              : mk(cc - bw2 / 2, by, ta.z1, cc + bw2 / 2, by + bh2, tb.z0, R.range(0.2, 0.32), R(), 'bridge', -1, 0);
            if (!clear(bx)) continue;
            bridges.push(boxes.length);
            boxes.push(bx);
            nBridge++;
            break;
          }
        }
        /* a few cables */
        var nc = R.chance(0.5 * C.density) ? R.int(1, 3) : 0;
        for (var ci = 0; ci < nc; ci++) {
          var ya = R.range(10, Math.min(hMin, 220) - 4), yb = ya + R.range(-6, 6), sag = R.range(0.8, 5);
          if (yb < 6) continue;
          if (inLaneBand(Math.min(ya, yb) - sag - 0.5, Math.max(ya, yb) + 0.5)) continue;
          var t1 = tierAt(A, Math.max(ya, yb), Math.max(ya, yb), axis, 1), t2 = tierAt(B, Math.max(ya, yb), Math.max(ya, yb), axis, -1);
          if (!t1 || !t2) continue;
          var pa, pb;
          if (axis === 0) {
            pa = [t1.x1, ya, R.range(t1.z0 + 1, t1.z1 - 1)];
            pb = [t2.x0, yb, clamp(pa[2] + R.range(-15, 15), t2.z0 + 1, t2.z1 - 1)];
          } else {
            pa = [R.range(t1.x0 + 1, t1.x1 - 1), ya, t1.z1];
            pb = [clamp(pa[0] + R.range(-15, 15), t2.x0 + 1, t2.x1 - 1), yb, t2.z0];
          }
          var ok = true;
          for (var s = 0; s <= 8 && ok; s++) {
            var u = s / 8;
            ok = pointClear([pa[0] + (pb[0] - pa[0]) * u, pa[1] + (pb[1] - pa[1]) * u - sag * 4 * u * (1 - u), pa[2] + (pb[2] - pa[2]) * u]);
          }
          if (ok) cables.push({ a: pa, b: pb, sag: sag });
        }
      }
    }

    /* Haze lights low in the streets, in the accent hues. */
    if (nAcc) {
      var nh = R.int(0, 3);
      for (var hI = 0; hI < nh; hI++) {
        var alongX = R.chance(0.5), pos = R.range(0, TILE);
        var line = R.chance(0.5) ? 0 : TILE / 2;
        lights.push({ p: alongX ? [x0 + pos, R.range(2, 6), z0 + line] : [x0 + line, R.range(2, 6), z0 + pos],
          size: R.range(18, 34), kind: 'haze', hue: nAcc === 1 ? 0 : R.int(0, 1) });
      }
    }

    /* ---- city life (2026-10-25) ----
       Both features draw from their own sub-streams (salts 61 and 62), so
       the buildings, signs and bridges of a tile are the same with them on
       or off, and a rate change moves nothing else. */
    var holograms = holoPlace(), beacons = beaconPlace();

    /* Holograms: rarely a floating billboard between two neighbouring
       towers of similar height (within HOLO_SIMILAR), whose facing tiers
       stand HOLO_GAP[0] to HOLO_GAP[1] apart with free air between, in the
       upper third of the lower tower. Since 2026-10-25 (owner: "das
       Hologramm sollte jeweils die komplette Breite ueberspannen") the quad
       spans the whole gap, HOLO_INSET short of each face, its side edges
       running along one tier face of each tower over its full height, with
       no yaw; it tilts only about its long axis. One per tile at most, with chance
       HOLO_P times the life rate; no candidate, no hologram. Out of the
       tube (every sample point Rm + 4 m from it), out of the lane bands,
       2 m clear of every box of the tile. No collision. */
    function holoPlace() {
      var pH = clamp(HOLO_P * lifeRate(C, 'holograms'), 0, 1), out = [];
      if (!nAcc || !(pH > 0)) return out;
      var HR = rng(subSeed(ix, iz, C.seed, 61));
      if (!(HR() < pH)) return out;
      var tw = buildings.filter(function (b) { return b.top >= HOLO_MIN_TOP && b.arch !== 'hall' && b.arch !== 'court'; });
      var pairs = [];
      for (var i = 0; i < tw.length; i++) for (var j = i + 1; j < tw.length; j++) {
        var ha = tw[i].top, hb = tw[j].top;
        if (Math.abs(ha - hb) <= HOLO_SIMILAR * Math.max(ha, hb)) pairs.push([tw[i], tw[j]]);
      }
      if (!pairs.length) return out;
      var p0 = HR.int(0, pairs.length - 1);
      function tierY(bd, y) {
        for (var k = bd.tiers.length - 1; k >= 0; k--) { var t = bd.tiers[k]; if (t.y0 <= y && t.y1 >= y) return t; }
        return null;
      }
      function free(q, m) {
        var k;
        for (k = 0; k < S.length; k++) {
          var dx = S[k][0] - q[0], dy = S[k][1] - q[1], dz = S[k][2] - q[2];
          if (dx * dx + dy * dy + dz * dz < (Rm + 4) * (Rm + 4)) return false;
        }
        for (k = 0; k < RES.length; k++) if (boxDist(RES[k], q) < 4) return false;
        for (k = 0; k < boxes.length; k++) if (boxDist(boxes[k], q) < m) return false;
        return true;
      }
      /* boxes of one building, for the edge check */
      function nearG(q, g, d) {
        for (var k = 0; k < boxes.length; k++) if (boxes[k].g === g && boxDist(boxes[k], q) <= d) return true;
        return false;
      }
      for (var tr = 0; tr < Math.min(pairs.length, 12) * 3; tr++) {
        var pr2 = pairs[(p0 + Math.floor(tr / 3)) % pairs.length], A = pr2[0], B = pr2[1];
        var Hm = Math.min(A.top, B.top);
        var h = HR.range(15, 30), tilt = HR.range(3, 9) * (HR.chance(0.5) ? 1 : -1) * Math.PI / 180;
        var u = HR(), v = HR();
        var ylo = Hm * 2 / 3 + h / 2 + 1, yhi = Hm - h / 2 - 4;
        if (yhi < ylo) continue;
        var yc = ylo + (yhi - ylo) * u, hy = h / 2 * Math.cos(tilt), hz = h / 2 * Math.abs(Math.sin(tilt));
        /* the same tier of each tower over the whole height of the quad, so
           both side edges run along one face from bottom to top */
        var ta = tierY(A, yc), tb = tierY(B, yc);
        if (!ta || !tb || tierY(A, yc - hy - 1) !== ta || tierY(A, yc + hy + 1) !== ta ||
          tierY(B, yc - hy - 1) !== tb || tierY(B, yc + hy + 1) !== tb) continue;
        var ox = Math.min(ta.x1, tb.x1) - Math.max(ta.x0, tb.x0), oz = Math.min(ta.z1, tb.z1) - Math.max(ta.z0, tb.z0);
        var gx = Math.max(tb.x0 - ta.x1, ta.x0 - tb.x1), gz = Math.max(tb.z0 - ta.z1, ta.z0 - tb.z1);
        var axis = -1, gap = 0, g0 = 0, o0 = 0, o1 = 0;
        if (oz >= 12 && gx >= HOLO_GAP[0] && gx <= HOLO_GAP[1]) { axis = 0; gap = gx; g0 = Math.min(ta.x1, tb.x1); o0 = Math.max(ta.z0, tb.z0); o1 = o0 + oz; }
        else if (ox >= 12 && gz >= HOLO_GAP[0] && gz <= HOLO_GAP[1]) { axis = 1; gap = gz; g0 = Math.min(ta.z1, tb.z1); o0 = Math.max(ta.x0, tb.x0); o1 = o0 + ox; }
        if (axis < 0) continue;
        /* full width: face to face, minus the inset on each side */
        var w = gap - 2 * HOLO_INSET;
        /* across the faces: the tilted quad leans hz to either side, and
           both edges keep 2 m of face beyond that */
        var cl = o0 + hz + 2, ch = o1 - hz - 2;
        if (ch < cl) continue;
        var ac = g0 + gap / 2, cc = (cl + ch) / 2 + (v - 0.5) * 0.5 * (ch - cl);
        var c = axis === 0 ? [ac, yc, cc] : [cc, yc, ac];
        /* right: along the gap, no yaw (the edges stay parallel to the
           faces); n0 the horizontal normal; up tilted about right */
        var right = axis === 0 ? [1, 0, 0] : [0, 0, 1];
        var n0 = [-right[2], 0, right[0]];
        var up = [n0[0] * Math.sin(tilt), Math.cos(tilt), n0[2] * Math.sin(tilt)];
        if (inLaneBand(yc - hy - 2, yc + hy + 2)) continue;
        var ok = true;
        for (var a = 0; a <= 24 && ok; a++) for (var b = 0; b <= 8 && ok; b++) {
          var su = (a / 24 - 0.5) * w, sv = (b / 8 - 0.5) * h;
          var q = [c[0] + right[0] * su + up[0] * sv, c[1] + up[1] * sv, c[2] + right[2] * su + up[2] * sv];
          ok = free(q, 0.9);
          /* the side edges sit on the two towers */
          if (ok && (a === 0 || a === 24)) ok = nearG(q, (g0 === (axis === 0 ? ta.x1 : ta.z1)) === (a === 0) ? A.g : B.g, HOLO_INSET + 0.3);
        }
        if (!ok) continue;
        out.push({ p: c, right: right, up: up, w: w, h: h, hue: nAcc === 1 ? 0 : HR.int(0, 1), sat: HOLO_SAT,
          seed: HR(), a: A.g, b: B.g,
          /* ticker: scroll speed in m/s and direction along right (+1 or -1) */
          speed: HR.range(HOLO_SPEED[0], HOLO_SPEED[1]), dir: HR.chance(0.5) ? 1 : -1 });
        break;
      }
      return out;
    }

    /* Beacons: a red aviation strobe on every mast, on the landmark's top
       (two diagonal crown corners, or each tower of a pair) and on every
       building above BEACON_TALL that has no mast, each with its own
       phase and a period of 1 to 2 s; one dim amber lamp on the roof plant
       of an industrial hall (period 0: steady). A building gets its
       beacons with the life rate as chance (all of them at liveliness 1),
       a landmark always (there is one per 2.6 km cell at most).
       The white roof glow of a building with a red beacon goes. */
    function beaconPlace() {
      var pB = clamp(lifeRate(C, 'beacons'), 0, 1), out = [];
      if (!(pB > 0)) return out;
      var BR = rng(subSeed(ix, iz, C.seed, 62)), kill = [];
      for (var i = 0; i < buildings.length; i++) {
        var bd = buildings[i], on = BR() < pB || bd.arch === 'landmark', ph = BR(), per = BR.range(1, 2), n0 = out.length;
        if (!on) continue;
        var own = boxes.filter(function (b) { return b.g === bd.g; });
        var masts = own.filter(function (b) { return b.kind === 'mast'; });
        var k;
        function put(p, kind, period) {
          var q = out.length - n0;
          out.push({ p: p, kind: kind, phase: fract(ph + q * 0.381966), period: period });
        }
        for (k = 0; k < masts.length; k++) put([(masts[k].min[0] + masts[k].max[0]) / 2, masts[k].max[1] + 0.4, (masts[k].min[2] + masts[k].max[2]) / 2], 'mast', per);
        if (bd.arch === 'landmark') {
          var crowns = own.filter(function (b) { return b.kind === 'crown'; });
          if (crowns.length) {
            var lo = [Infinity, Infinity], hi = [-Infinity, -Infinity], top = 0;
            for (k = 0; k < crowns.length; k++) {
              lo[0] = Math.min(lo[0], crowns[k].min[0]); lo[1] = Math.min(lo[1], crowns[k].min[2]);
              hi[0] = Math.max(hi[0], crowns[k].max[0]); hi[1] = Math.max(hi[1], crowns[k].max[2]); top = Math.max(top, crowns[k].max[1]);
            }
            put([lo[0] + 2.5, top + 0.6, lo[1] + 2.5], 'landmark', per);
            put([hi[0] - 2.5, top + 0.6, hi[1] - 2.5], 'landmark', per);
          } else {
            for (k = 0; k < bd.tiers.length; k++) {
              var t = bd.tiers[k];
              if (t.y1 >= bd.top - 1e-6) put([(t.x0 + t.x1) / 2, t.y1 + 0.6, (t.z0 + t.z1) / 2], 'landmark', per);
            }
          }
        } else if (!masts.length && bd.top > BEACON_TALL) {
          var hb = null;
          for (k = 0; k < own.length; k++) if (!hb || own[k].max[1] > hb.max[1]) hb = own[k];
          put([(hb.min[0] + hb.max[0]) / 2, hb.max[1] + 0.6, (hb.min[2] + hb.max[2]) / 2], 'tower', per);
        } else if (bd.arch === 'hall') {
          var top0 = bd.tiers[0].y1;
          for (k = 0; k < own.length; k++) {
            if (own[k].kind === 'roof' && own[k].min[1] >= top0 - 1e-6) {
              var rb2 = own[k];
              put([rb2.max[0] - 0.5, rb2.max[1] + 0.5, rb2.max[2] - 0.5], 'plant', 0);
              break;
            }
          }
        }
        for (k = n0; k < out.length; k++) if (!pointClear(out[k].p)) { out.splice(k, 1); k--; }
        if (out.length > n0 && whiteOf[bd.g] && bd.top > BEACON_TALL) kill.push(whiteOf[bd.g]);
      }
      if (kill.length) lights = lights.filter(function (l) { return kill.indexOf(l) < 0; });
      return out;
    }

    var streets = [
      { a: [x0, 0, z0], b: [x0 + TILE, 0, z0] }, { a: [x0, 0, z0 + TILE / 2], b: [x0 + TILE, 0, z0 + TILE / 2] },
      { a: [x0, 0, z0], b: [x0, 0, z0 + TILE] }, { a: [x0 + TILE / 2, 0, z0], b: [x0 + TILE / 2, 0, z0 + TILE] }
    ];

    var tid = ((ix + 32768) & 0xffff) * 65536 + ((iz + 32768) & 0xffff);
    var top = 0;
    for (var bi = 0; bi < boxes.length; bi++) {
      var bo = boxes[bi];
      bo.c = [(bo.min[0] + bo.max[0]) / 2, (bo.min[1] + bo.max[1]) / 2, (bo.min[2] + bo.max[2]) / 2];
      bo.half = [(bo.max[0] - bo.min[0]) / 2, (bo.max[1] - bo.min[1]) / 2, (bo.max[2] - bo.min[2]) / 2];
      bo.idx = tid * 4096 + bi;
      if (bo.max[1] > top) top = bo.max[1];
    }
    return {
      key: tileKey(ix, iz), ix: ix, iz: iz, x0: x0, z0: z0, seed: C.seed,
      boxes: boxes, lots: lots, lights: lights, accents: accents, pads: pads,
      holograms: holograms, beacons: beacons,
      cables: cables, bridges: bridges, streets: streets, top: top,
      /* per building: archetype, district, facade program, block, roof */
      buildings: buildings.map(function (b) { return { g: b.g, arch: b.arch, dist: b.dist, prog: b.prog, block: b.block, top: b.top }; }),
      landmark: landmark
    };
  }

  /* ---- streaming -------------------------------------------------------- */

  /* Tiles whose square comes within radius of p, horizontally. */
  function tilesAround(p, radius) {
    var out = [];
    var i0 = Math.floor((p[0] - radius) / TILE), i1 = Math.floor((p[0] + radius) / TILE);
    var k0 = Math.floor((p[2] - radius) / TILE), k1 = Math.floor((p[2] + radius) / TILE);
    for (var i = i0; i <= i1; i++) {
      for (var k = k0; k <= k1; k++) {
        var dx = Math.max(i * TILE - p[0], 0, p[0] - (i + 1) * TILE);
        var dz = Math.max(k * TILE - p[2], 0, p[2] - (k + 1) * TILE);
        if (dx * dx + dz * dz <= radius * radius) out.push([i, k]);
      }
    }
    return out;
  }

  /* The set of tile keys that should be loaded: a (2r+1)^2 window whose
     centre is pushed `bias` tiles ahead along the horizontal heading, plus
     the 3 x 3 around the ship, which the collision step needs whatever the
     heading. */
  function wanted(p, dir, opts) {
    var o = opts || {};
    var r = o.radius == null ? 4 : Math.max(1, Math.round(o.radius));
    var bias = o.bias == null ? 1.5 : o.bias;
    var dx = dir ? dir[0] : 0, dz = dir ? dir[2] : 0, l = Math.hypot(dx, dz);
    var c = l > 1e-6 ? [p[0] + dx / l * bias * TILE, 0, p[2] + dz / l * bias * TILE] : p;
    var ct = tileOf(c), st = tileOf(p), set = new Set(), i, k;
    for (i = -r; i <= r; i++) for (k = -r; k <= r; k++) set.add(tileKey(ct[0] + i, ct[1] + k));
    for (i = -1; i <= 1; i++) for (k = -1; k <= 1; k++) set.add(tileKey(st[0] + i, st[1] + k));
    return set;
  }
  function parseKey(key) { var s = key.split(','); return [parseInt(s[0], 10), parseInt(s[1], 10)]; }

  /* The loaded tiles, with the query the collision step uses.
     sync(p, dir, opts) diffs wanted() against what is loaded and returns
     { added: [tile], removed: [key], pending }. The 3 x 3 around the ship is
     always built at once; anything else at most opts.maxBuilds per call, the
     nearest first. A tile is only dropped once it leaves a window one tile
     larger, so crossing a tile edge back and forth does not rebuild. */
  function makeCity(route, cfg) {
    var C = merge(DEF, cfg);
    if (!cfg || cfg.seed == null) C.seed = route ? ((route.seed * 2654435761 + 977) >>> 0) : 1;
    var tiles = new Map();
    var GC = 27, GN = TILE / GC;
    function attach(t) {
      var grid = new Array(GN * GN);
      for (var i = 0; i < t.boxes.length; i++) {
        var b = t.boxes[i];
        var a0 = clamp(Math.floor((b.min[0] - t.x0) / GC), 0, GN - 1), a1 = clamp(Math.floor((b.max[0] - t.x0) / GC), 0, GN - 1);
        var c0 = clamp(Math.floor((b.min[2] - t.z0) / GC), 0, GN - 1), c1 = clamp(Math.floor((b.max[2] - t.z0) / GC), 0, GN - 1);
        for (var a = a0; a <= a1; a++) for (var c = c0; c <= c1; c++) {
          var k = a + c * GN;
          (grid[k] || (grid[k] = [])).push(i);
        }
      }
      return { tile: t, grid: grid, stamp: new Int32Array(t.boxes.length), tick: 0 };
    }
    function build(ix, iz) {
      var key = tileKey(ix, iz);
      var e = tiles.get(key);
      if (e) return e.tile;
      var t = makeTile(ix, iz, C.seed, route, C);
      tiles.set(key, attach(t));
      return t;
    }
    function boxesNear(p, r) {
      var out = [], list = tilesAround(p, r);
      for (var n = 0; n < list.length; n++) {
        var e = tiles.get(tileKey(list[n][0], list[n][1]));
        if (!e) continue;
        var t = e.tile;
        if (p[1] - r > t.top) continue;
        e.tick++;
        var a0 = clamp(Math.floor((p[0] - r - t.x0) / GC), 0, GN - 1), a1 = clamp(Math.floor((p[0] + r - t.x0) / GC), 0, GN - 1);
        var c0 = clamp(Math.floor((p[2] - r - t.z0) / GC), 0, GN - 1), c1 = clamp(Math.floor((p[2] + r - t.z0) / GC), 0, GN - 1);
        for (var a = a0; a <= a1; a++) for (var c = c0; c <= c1; c++) {
          var l = e.grid[a + c * GN];
          if (!l) continue;
          for (var m = 0; m < l.length; m++) {
            var bi = l[m];
            if (e.stamp[bi] === e.tick) continue;
            e.stamp[bi] = e.tick;
            if (boxDist(t.boxes[bi], p) <= r) out.push(t.boxes[bi]);
          }
        }
      }
      return out;
    }
    function syncKeys(want, keep, p, opts) {
      var o = opts || {};
      var maxB = o.maxBuilds == null ? 1 : o.maxBuilds;
      var added = [], removed = [];
      tiles.forEach(function (e, key) {
        if (!keep.has(key)) { tiles.delete(key); removed.push(key); }
      });
      var miss = [];
      want.forEach(function (key) { if (!tiles.has(key)) miss.push(parseKey(key)); });
      var st = p ? tileOf(p) : null;
      var cx = p ? p[0] : 0, cz = p ? p[2] : 0;
      miss.sort(function (a, b) {
        var da = Math.hypot((a[0] + 0.5) * TILE - cx, (a[1] + 0.5) * TILE - cz);
        var db = Math.hypot((b[0] + 0.5) * TILE - cx, (b[1] + 0.5) * TILE - cz);
        return da - db;
      });
      var n = 0;
      for (var i = 0; i < miss.length; i++) {
        var m = miss[i];
        var forced = st && Math.abs(m[0] - st[0]) <= 1 && Math.abs(m[1] - st[1]) <= 1;
        if (!forced && n >= maxB) continue;
        added.push(build(m[0], m[1]));
        if (!forced) n++;
      }
      return { added: added, removed: removed, pending: miss.length - added.length };
    }
    function sync(p, dir, opts) {
      var o = opts || {};
      var want = wanted(p, dir, o);
      var keep = wanted(p, dir, { radius: (o.radius == null ? 4 : o.radius) + 1, bias: o.bias });
      return syncKeys(want, keep, p, o);
    }
    function pads() {
      var out = [];
      tiles.forEach(function (e) { for (var i = 0; i < e.tile.pads.length; i++) out.push(e.tile.pads[i]); });
      return out;
    }
    return {
      cfg: C, seed: C.seed, route: route,
      tiles: tiles,
      has: function (key) { return tiles.has(key); },
      get: function (key) { var e = tiles.get(key); return e ? e.tile : null; },
      build: build,
      peek: function (ix, iz) { var e = tiles.get(tileKey(ix, iz)); return e ? e.tile : makeTile(ix, iz, C.seed, route, C); },
      boxesNear: boxesNear, sync: sync, syncKeys: syncKeys, pads: pads,
      clear: function () { var ks = Array.from(tiles.keys()); tiles.clear(); return ks; }
    };
  }

  /* A spot inside a street canyon near p: the inner street of a tile
     around p with the tallest buildings on both sides, at the lowest lane
     altitude (bridges and cables keep out of it by construction). Returns
     { p, dir } or null. For the screenshot hook and later for the canyon
     biome. */
  function findCanyon(city, p, searchR) {
    var list = tilesAround(p, searchR == null ? 700 : searchR), best = null;
    for (var n = 0; n < list.length; n++) {
      var t = city.peek(list[n][0], list[n][1]);
      for (var axis = 0; axis < 2; axis++) {
        var mid = axis === 0 ? t.x0 + TILE / 2 : t.z0 + TILE / 2;
        var lo = Infinity, cnt = [0, 0], sum = 0;
        for (var i = 0; i < t.boxes.length; i++) {
          var b = t.boxes[i];
          if (b.kind !== 'tier' || b.min[1] > 0) continue;
          var c = axis === 0 ? b.c[0] : b.c[2];
          var side = c < mid ? 0 : 1;
          var near = axis === 0 ? (side ? b.min[0] - mid : mid - b.max[0]) : (side ? b.min[2] - mid : mid - b.max[2]);
          if (near > HALF_ST + 12) continue;
          cnt[side]++; sum += b.max[1];
          lo = Math.min(lo, b.max[1]);
        }
        if (cnt[0] < 2 || cnt[1] < 2) continue;
        var score = sum / (cnt[0] + cnt[1]) + Math.min(cnt[0], cnt[1]) * 10;
        if (!best || score > best.score) {
          var cxx = axis === 0 ? mid : t.x0 + TILE * 0.9, czz = axis === 0 ? t.z0 + TILE * 0.9 : mid;
          best = { score: score, p: [cxx, LANE_Y[0], czz], dir: axis === 0 ? [0, 0, -1] : [-1, 0, 0], tile: t.key };
        }
      }
    }
    return best;
  }

  /* ---- weather ------------------------------------------------------------
     Rain that comes and goes, as a pure function of time (seconds) and a
     seed, so it needs no state and the tests can scan it. Time is cut into
     cycles of WEATHER.cycle seconds; in a cycle it rains with probability
     WEATHER.p, once, for WEATHER.min to WEATHER.max seconds including a
     WEATHER.fade second ramp in and out (smoothstep), at an intensity of
     0.75 to 1. The shower never touches a cycle edge, so showers never
     merge and every cycle has a dry stretch: rain is never permanent.
     Returns the rain level, 0 (dry) to 1. */
  var WEATHER = { cycle: 300, p: 0.7, min: 40, max: 90, fade: 10, edge: 20 };
  function weatherAt(t, seed) {
    var W = WEATHER;
    var c = Math.floor(t / W.cycle), u = t - c * W.cycle;
    var h = rng(hashU(c, 77, seed >>> 0, 5));
    if (h() >= W.p) return 0;
    var dur = W.min + (W.max - W.min) * h();
    var t0 = W.edge + (W.cycle - 2 * W.edge - dur) * h();
    var k = 0.75 + 0.25 * h();
    if (u <= t0 || u >= t0 + dur) return 0;
    return k * smooth(0, W.fade, u - t0) * smooth(0, W.fade, t0 + dur - u);
  }

  /* ======================================================================
     Visual layer. THREE is passed in. One merged mesh per tile; signs,
     glows, lamp streaks and cables of all loaded tiles in one buffer each,
     rebuilt when the set of tiles changes. */

  /* matplotlib 'bone', nine stops, sRGB, as in colorramps.js */
  var BONE = [
    [0.000, 0.000, 0.000], [0.109, 0.109, 0.152], [0.219, 0.219, 0.304],
    [0.328, 0.331, 0.453], [0.438, 0.482, 0.562], [0.547, 0.632, 0.672],
    [0.658, 0.781, 0.781], [0.829, 0.891, 0.891], [1.000, 1.000, 1.000]
  ];
  function boneRGB(t) {
    var x = clamp(t, 0, 1) * (BONE.length - 1);
    var i = Math.min(BONE.length - 2, Math.floor(x)), f = x - i, a = BONE[i], b = BONE[i + 1];
    return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
  }
  function toLin(c) { return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }

  /* ---- the atmosphere ---------------------------------------------------
     One model for everything on the page: sky, buildings, skyline, ground,
     rings, gates, traffic and the Menger block all fog through the same
     functions, so nothing can stand in front of the fog it is in.

     Medium. Two exponential layers in altitude y (metres, ground at 0):

       k(y) = kS exp(-y / HS)  +  kH exp(-y / HH)

     the ground soup (kS 0.16 per m, HS 13 m: under 50 m sight in the
     streets, 7 per km at 40 m, nearly gone at 80 m) and the haze above the roofs (kH a few per km, HH 500 m).
     The haze slider sets kH; the soup does not move with it, so the
     streets stay buried at any slider position.

     Optical depth along the straight segment from a to b, length d, end
     heights ya and yb, for one layer (k, H). With y(t) = ya + (yb - ya) t / d:

       tau = int_0^d k exp(-y(t) / H) dt
           = k d (exp(-ya / H) - exp(-yb / H)) / x,   x = (yb - ya) / H

     and for |x| -> 0 the limit k d exp(-ya / H) (1 - x / 2 + x^2 / 6). The
     two layers add. For a ray that never ends (the sky), direction with
     vertical component s > 0 from height yc:

       tauInf = k H exp(-yc / H) / s,

     and for s <= 0 the ray stays in the medium for ever: tauInf = infinity.

     Colour. Transmittance T = exp(-tau); a surface of colour c becomes
     c T + F(dir) (1 - T). F, the colour of fully saturated fog, depends on
     the viewing direction only (pale and lit looking level or down, darker
     looking up), never on the height of the fogged point. That is what
     makes the horizon invisible: a far wall and the sky right behind it
     share a direction, so both converge to the same F as their depth grows.
     The sky is the same formula with the overcast deck behind an infinite
     ray: sky = top T_inf + F (1 - T_inf). At the horizon T_inf = exp(-A / s)
     goes to 0 smoothly (all derivatives vanish), so there is no band;
     looking up, T_inf grows and the overcast shows through, a smooth
     gradient from inside the soup.

     Why the old fog failed (2026-10-25, owner screenshots): it took the
     fog colour from the height of the fogged point. A tall far box was
     fogged into the dark high colour while the sky behind it, at the same
     elevation, was the pale low colour: dark crisp silhouettes standing
     above the haze, worst at maximum density. The sky ramp also clamped
     at 420 m, which drew the hard band at the top of the screen.

     The uniforms hold sRGB numbers, because three mixes fog after the
     colour-space conversion. fogTau and fogTauInf below are the same
     formulas in JavaScript, for notes/dev/hikyaku-city.test.mjs. */
  var FOG_MED = { soupK: 0.16, soupH: 13, hazeK: 0.0026, hazeH: 500 };
  function fogTau1(k, H, ya, yb, d) {
    var x = (yb - ya) / H, ea = Math.exp(-ya / H);
    var g = Math.abs(x) < 0.01 ? ea * (1 - x / 2 + x * x / 6) : (ea - Math.exp(-yb / H)) / x;
    return k * d * g;
  }
  function fogTau(a, b, med) {
    var M = med || FOG_MED;
    var ya = Math.max(a[1], 0), yb = Math.max(b[1], 0);
    var d = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    return fogTau1(M.soupK, M.soupH, ya, yb, d) + fogTau1(M.hazeK, M.hazeH, ya, yb, d);
  }
  function fogTauInf(yc, s, med) {
    var M = med || FOG_MED;
    if (!(s > 0)) return Infinity;
    yc = Math.max(yc, 0);
    return (M.soupK * M.soupH * Math.exp(-yc / M.soupH) + M.hazeK * M.hazeH * Math.exp(-yc / M.hazeH)) / s;
  }
  var FOG_DECL = [
    'uniform vec4 cgFogMed; uniform vec3 cgFogLow; uniform vec3 cgFogHigh; uniform vec3 cgSkyTop;',
    'float cgTau1(float k, float H, float ya, float yb, float d){',
    '  float x = (yb - ya) / H; float ea = exp(-ya / H);',
    '  float g = abs(x) < 0.01 ? ea * (1.0 - 0.5 * x + x * x / 6.0) : (ea - exp(-yb / H)) / x;',
    '  return k * d * g;',
    '}',
    'float cgTau(vec3 a, vec3 b){',
    '  float ya = max(a.y, 0.0), yb = max(b.y, 0.0), d = length(b - a);',
    '  return cgTau1(cgFogMed.x, cgFogMed.y, ya, yb, d) + cgTau1(cgFogMed.z, cgFogMed.w, ya, yb, d);',
    '}',
    'float cgTauInf(float yc, float s){',
    '  yc = max(yc, 0.0);',
    '  return (cgFogMed.x * cgFogMed.y * exp(-yc / cgFogMed.y) + cgFogMed.z * cgFogMed.w * exp(-yc / cgFogMed.w)) / max(s, 1e-4);',
    '}',
    'vec3 cgFogDir(vec3 dir){ return mix(cgFogLow, cgFogHigh, smoothstep(-0.15, 0.55, dir.y)); }',
    'vec3 cgFogColor(vec3 wp){ vec3 v = wp - cameraPosition; return cgFogDir(v / max(length(v), 1e-3)); }',
    'float cgFogAmt(vec3 wp, float k){ return 1.0 - exp(-k * cgTau(cameraPosition, wp)); }'
  ].join('\n');

  function makeFog(THREE) {
    var U = {
      cgFogMed: { value: new THREE.Vector4(FOG_MED.soupK, FOG_MED.soupH, FOG_MED.hazeK, FOG_MED.hazeH) },
      cgFogLow: { value: new THREE.Color() },
      cgFogHigh: { value: new THREE.Color() },
      cgSkyTop: { value: new THREE.Color() }
    };
    /* low: saturated fog looking level, high: looking up, top: the overcast
       deck behind the atmosphere; bone positions, with a gain each. rain
       (0 to 1) thickens the haze and darkens the sky, for the weather. */
    var S = { soupK: FOG_MED.soupK, soupH: FOG_MED.soupH, hazeK: FOG_MED.hazeK, hazeH: FOG_MED.hazeH,
      low: 0.5, high: 0.28, top: 0.11, lowGain: 1, highGain: 1, topGain: 1, rain: 0 };
    function set(o) {
      for (var k in o) if (o[k] != null && k in S) S[k] = o[k];
      if (o.density != null) S.hazeK = o.density;
      var r = clamp(S.rain, 0, 1);
      U.cgFogMed.value.set(S.soupK * (1 + 0.5 * r), S.soupH, S.hazeK * (1 + 0.7 * r), S.hazeH);
      var a = boneRGB(S.low), b = boneRGB(S.high), c = boneRGB(S.top);
      var ka = S.lowGain * (1 - 0.14 * r), kb = S.highGain * (1 - 0.2 * r), kc = S.topGain * (1 - 0.4 * r);
      U.cgFogLow.value.setRGB(a[0] * ka, a[1] * ka, a[2] * ka);
      U.cgFogHigh.value.setRGB(b[0] * kb, b[1] * kb, b[2] * kb);
      U.cgSkyTop.value.setRGB(c[0] * kc, c[1] * kc, c[2] * kc);
    }
    set({});
    var nKey = 0;
    function patch(mat, opts) {
      var o = opts || {};
      var fogK = o.fogK == null ? 1 : o.fogK, fogTint = o.fogTint == null ? 1 : o.fogTint, fac = o.facade || null;
      var prev = mat.onBeforeCompile;
      mat.fog = true;
      mat.onBeforeCompile = function (sh, r) {
        if (prev && prev !== mat.onBeforeCompile) prev.call(mat, sh, r);
        Object.assign(sh.uniforms, U);
        sh.uniforms.cgFogK = { value: fogK };
        sh.uniforms.cgFogTint = { value: fogTint };
        if (fac) Object.assign(sh.uniforms, fac.uniforms);
        sh.vertexShader = sh.vertexShader
          .replace('#include <common>', '#include <common>\nvarying vec3 vCgWPos;\n' +
            (fac ? 'varying vec3 vCgWNrm; attribute float aSeed; flat varying float vSeed; attribute vec4 aFac; varying float vFacU; flat varying vec3 vFac;\n' : ''))
          .replace('#include <project_vertex>', '#include <project_vertex>\n{\n' +
            '  vec4 cgw = vec4(transformed, 1.0);\n' +
            '  #ifdef USE_INSTANCING\n  cgw = instanceMatrix * cgw;\n  #endif\n' +
            '  vCgWPos = (modelMatrix * cgw).xyz;\n' +
            (fac ? '  vCgWNrm = normalize(mat3(modelMatrix) * objectNormal);\n  vSeed = aSeed; vFacU = aFac.x; vFac = aFac.yzw;\n' : '') +
            '}');
        sh.fragmentShader = sh.fragmentShader
          .replace('#include <common>', '#include <common>\nvarying vec3 vCgWPos;\nuniform float cgFogK; uniform float cgFogTint;\n' + FOG_DECL + '\n' +
            (fac ? FACADE_DECL : ''))
          .replace('#include <fog_fragment>', '#ifdef USE_FOG\n{\n' +
            '  float cgf = cgFogAmt(vCgWPos, cgFogK);\n' +
            '  gl_FragColor.rgb = mix(gl_FragColor.rgb, cgFogColor(vCgWPos) * cgFogTint, cgf);\n' +
            '}\n#endif');
        if (fac) sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n' + FACADE_FRAG);
      };
      var key = 'hkc' + (fac ? 'F' : 'P') + fogK + '_' + fogTint + '_' + (++nKey);
      mat.customProgramCacheKey = function () { return key.replace(/_\d+$/, ''); };
      mat.needsUpdate = true;
      return mat;
    }
    /* For a custom ShaderMaterial: the declarations go where its source
       carries the marker comment CG_FOG, the uniforms are shared objects,
       so set() reaches the material live. hikyaku-traffic.js and menger.js
       use this for their additive layers and signs. */
    function inject(mat) {
      var mark = '/*CG_FOG*/';
      if (mat.vertexShader.indexOf(mark) >= 0) mat.vertexShader = mat.vertexShader.replace(mark, FOG_DECL);
      if (mat.fragmentShader.indexOf(mark) >= 0) mat.fragmentShader = mat.fragmentShader.replace(mark, FOG_DECL);
      Object.assign(mat.uniforms, U);
      mat.needsUpdate = true;
      return mat;
    }
    return { uniforms: U, glsl: FOG_DECL, set: set, patch: patch, inject: inject, state: S };
  }

  /* The window shader, from citygen, reworked twice on 2026-10-25: first
     after the owner read the towers as 5 to 10 storeys (storeys of 3.6 m
     with a glass band and a lighter spandrel, bays with thin mullions,
     plant floors), then for the city variety round (CITY-VARIETY.md V0,
     V1, V5, V9).

     V0. Facade coordinates are building relative. Every vertex carries
     aFac = (u, W, top, code): u metres from the face's left edge, W the
     face width, top the box's roof height, code the facade program (box
     prog, see STOREY above). u interpolates; W, top and code are flat. So
     bays start at the building edge and fit a whole number into the face,
     corners can be blind, and a face knows where its box ends.

     V1. The 0.8 m ledge slabs are gone from the geometry. Tier edges sit
     on the 3.6 m storey grid, and the shader draws the top storey of every
     box as a blank, lighter cornice band.

     V5. One table row per program (FACADE_PROGRAMS, uniforms uProgA..D),
     selected per vertex: bay width, mullion, sill and head, piers, plant
     floors, the divider of the residential slab, the spandrel band, the
     chance of blind corners (4 to 12 m, per building) and of one blind
     core stripe per face (6 to 12 m), and the light program.

     V9. Light by program: the LUT has four bands of 16 rows, one per
     program, and a window looks up one texel per group of gx bays by gy
     storeys (office 2 x 1, residential 4 x 2 like the arcov3 flats,
     industrial 3 x 1), so lit windows come in rooms and floors, not salt
     and pepper.

     Far away, where a cell gets smaller than a pixel, the pattern fades
     into its exact mean, so a level change alters resolution, not the
     picture: no shimmer, no popping. The mean of program p for a
     building with seed s (facadeCover below, the same formula in GLSL):

       cover = [(1 - 2 mull(s)) (1 - pierOn_p(s) / Npier(s))
                - div(s) (1 / m(s) - pierOn_p(s) / lcm(m(s), Npier(s)))]
               (1 - sill(s) - head(s)) (1 - 1 / Nplant(s))
       emission = gain * M_p * T(s) * cover * (1 - blank) (1 - cornice) (1 - crown)
       diffuse  = 1 + (G(s) - 1) * window + (F(s) - 1) * (1 - window)
                    + k(s) * bw(s) * (1 - 1 / Nplant(s)) + cornice

     with every (s) a per building value from the program's range
     (facadeParams: m the divider period 1, 2 or 3, T the lit colour of
     luminance 1, G the glass, F the frame), M_p the mean of LUT band p (windowLUT means[p]) and blank,
     cornice, crown the box filtered coverage of the blind corners and
     stripe, the cornice storey and the lit crown band: those are bigger
     than a cell and are filtered over the pixel footprint exactly, so they
     keep their mean at every distance too. The diffuse terms add instead
     of multiplying, so the window and the spandrel band (disjoint in the
     cell, band below the sill) average without a cross term. */
  /* Per building window character (2026-10-25, owner: windows "sehen
     aktuell noch alle genau gleich aus"). Inside the fixed frame (3.6 m
     storey, bone palette, the program's LUT band and so its lit share)
     every building draws its own values from its seed, each from the
     program's range [lo, hi]: bay width; mullion width; sill and head
     (ribbon glazing with a low sill and a thin head, or punched windows
     with a high sill and a deep head); the mullion pattern (single,
     paired: a wider divider on every second mullion, or every third
     wider; pPair and pThird are the shares, the rest is single); the
     spandrel band's height and brightness (darker or lighter than the
     wall); the glass brightness and a narrow cool to warm glass tint; the
     frame brightness (the wall between the glass); and the colour
     temperature of its lit windows (cool white offices, warm flats, pale
     green-white industry, luminance kept at 1). Blind corners (cornerP)
     were per building already. */
  var FACADE_PROGRAMS = [
    { name: 'curtain', bay: [1.1, 2.1], mull: [0.03, 0.09], sill: [0.16, 0.4], head: [0.03, 0.12],
      div: 0.16, pPair: 0.25, pThird: 0.2, bandW: [0.04, 0.14], bandK: [-0.3, 0.6],
      pierP: 0.35, plant: [12, 8], cornerP: 0.3, coreP: 0.2, lut: 0, grp: [[1, 4], [1, 1]],
      lit: [[0.78, 0.97, 1.4], [1.0, 1.0, 1.0]] },
    { name: 'residential', bay: [1.6, 2.8], mull: [0.07, 0.18], sill: [0.28, 0.48], head: [0.07, 0.18],
      div: 0.22, pPair: 0.45, pThird: 0.25, bandW: [0.06, 0.24], bandK: [0, 0.9],
      pierP: 0, plant: [16, 6], cornerP: 0.5, coreP: 0.45, lut: 1, grp: [[2, 4], [1, 2]],
      lit: [[1.36, 0.94, 0.52], [1.06, 1.0, 0.88]] },
    { name: 'industrial', bay: [2.6, 4.4], mull: [0.14, 0.32], sill: [0.4, 0.62], head: [0.1, 0.22],
      div: 0.28, pPair: 0.3, pThird: 0.3, bandW: [0.12, 0.32], bandK: [-0.25, 0.5],
      pierP: 0.5, plant: [6, 4], cornerP: 0.75, coreP: 0.6, lut: 2, grp: [[2, 5], [1, 1]],
      lit: [[0.8, 1.1, 0.82], [0.95, 1.03, 1.06]] },
    { name: 'landmark', bay: [1.2, 1.7], mull: [0.035, 0.07], sill: [0.2, 0.32], head: [0.04, 0.08],
      div: 0.12, pPair: 0.3, pThird: 0.3, bandW: [0.04, 0.12], bandK: [0.2, 0.7],
      pierP: 0.6, plant: [10, 4], cornerP: 0.5, coreP: 0, lut: 3, grp: [[1, 3], [1, 1]],
      lit: [[0.88, 0.98, 1.2], [1.06, 1.0, 0.9]] }
  ];
  /* glass brightness as a fraction of the wall tone (the old fixed value
     was 0.32), the two ends of the glass tint, the frame brightness */
  var FAC_GLASS = [0.22, 0.42], FAC_TINT = [[0.93, 0.99, 1.08], [1.07, 1.0, 0.9]], FAC_FRAME = [0.82, 1.2];
  /* the glow of the unlit glass (the LUT's dim texels), per building:
     from nearly black panes to a faint grid that shows the window
     pattern in the dark. Skewed towards dark glass, gain = lo + (hi -
     lo) h^2 for a uniform hash h: mean lo + (hi - lo) / 3 = 1, so the
     city's far brightness stays (the unlit texels carry 15 to 50 % of a
     band's mean) */
  var FAC_DIM = [0.2, 2.6];
  /* lit colours scaled to luminance 1 (Rec. 709), so a temperature never
     makes a building brighter or darker */
  function lumOne(c) { var l = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; return [c[0] / l, c[1] / l, c[2] / l]; }
  function glv(c) { return c.map(function (v) { return v.toFixed(3); }).join(', '); }
  function fract(x) { return x - Math.floor(x); }
  /* The per building hashes: fract(s * K) in float32, as the shader
     computes fract(vSeed * K) (the seed reaches the fragment stage as a
     flat varying, so no new attribute). Large, unrelated K give values
     that are independent in practice; the old constants (2.9, 5.3, 8.7,
     13.37, 37, 53, 97) keep their roles. */
  var FAC_K = [137.31, 271.93, 389.17, 521.71, 643.37, 787.13, 911.57, 1049.31, 1181.93, 1307.77, 1453.11, 1597.29, 1733.41, 1871.63];
  var FH = { bay: 0, mull: 1, sill: 2, head: 3, pat: 4, bandW: 5, bandK: 6, glass: 7, tint: 8, frame: 9, lit: 10, dim: 11, grpX: 12, grpY: 13 };
  function facHash(s, k) { var f = Math.fround, v = f(f(s) * f(FAC_K[k])); return v - Math.floor(v); }
  function facHashGL(k) { return 'fract(vSeed * ' + FAC_K[k].toFixed(2) + ')'; }
  function mixR(r, t) { return r[0] + (r[1] - r[0]) * t; }
  /* the building's window group, gx bays by gy storeys per LUT texel */
  function facGrp(P, s) {
    return [P.grp[0][0] + Math.floor(facHash(s, FH.grpX) * (P.grp[0][1] - P.grp[0][0] + 1)),
      P.grp[1][0] + Math.floor(facHash(s, FH.grpY) * (P.grp[1][1] - P.grp[1][0] + 1))];
  }
  /* Per building values of a program, as the shader derives them from the
     seed s (FACADE_FRAG uses the same hashes and the same formulas). */
  /* the cell geometry alone (what facadeCover and facadeNear need) */
  function facadeGeom(p, s) {
    var P = FACADE_PROGRAMS[p];
    var hp = facHash(s, FH.pat), m = hp < P.pPair ? 2 : (hp < P.pPair + P.pThird ? 3 : 1);
    return { P: P, pierOn: fract(s * 2.9) < P.pierP ? 1 : 0, pierN: 3 + Math.floor(fract(s * 5.3) * 4),
      plantN: P.plant[0] + Math.floor(fract(s * 8.7) * P.plant[1]), plantOff: Math.floor(s * 37),
      bay: mixR(P.bay, facHash(s, FH.bay)), mull: mixR(P.mull, facHash(s, FH.mull)),
      sill: mixR(P.sill, facHash(s, FH.sill)), head: mixR(P.head, facHash(s, FH.head)),
      pattern: m, div: m > 1 ? P.div : 0 };
  }
  function facadeParams(p, s) {
    var q = facadeGeom(p, s), P = q.P;
    var tl = facHash(s, FH.lit), A = lumOne(P.lit[0]), B = lumOne(P.lit[1]);
    var tg = facHash(s, FH.tint), ga = mixR(FAC_GLASS, facHash(s, FH.glass));
    return Object.assign(q, {
      bandW: mixR(P.bandW, facHash(s, FH.bandW)), bandK: mixR(P.bandK, facHash(s, FH.bandK)),
      glass: [0, 1, 2].map(function (j) { return ga * mixR([FAC_TINT[0][j], FAC_TINT[1][j]], tg); }),
      frame: mixR(FAC_FRAME, facHash(s, FH.frame)),
      lit: [0, 1, 2].map(function (j) { return A[j] + (B[j] - A[j]) * tl; }),
      dim: [0, 1, 2].map(function (j) { var hd = facHash(s, FH.dim); return mixR(FAC_DIM, hd * hd) * mixR([FAC_TINT[0][j], FAC_TINT[1][j]], tg); }),
      grp: facGrp(P, s),
      corner: fract(s * 13.37 + 0.31) < P.cornerP ? 1 : 0 });
  }
  /* The far value of the window coverage, program p, seed s: the mean of
     facadeNear over the cell grid, with the building's own values. */
  function facadeCover(p, s) {
    var q = facadeGeom(p, s), m = q.pattern, n = q.pierN;
    /* a divider on a pier bay is hidden by the pier: the two coincide on
       one bay in lcm(m, n) */
    var lcm = m * n / (n % m === 0 ? m : 1);
    var xs = (1 - 2 * q.mull) * (1 - q.pierOn / n) - q.div * (1 / m - q.pierOn / lcm);
    return xs * (1 - q.sill - q.head) * (1 - 1 / q.plantN);
  }
  /* The far light of a window of building s, program p, from the LUT
     part means L.parts (windowLUT): what FACADE_FRAG blends to (lutF),
     and the expectation of the near value over the band's texels. */
  function facadeLight(p, s, L) {
    var q = facadeParams(p, s), P = q.P, m = L.parts[P.lut];
    return [0, 1, 2].map(function (j) { return m[2][j] * q.lit[j] + m[1][j] + m[0][j] * q.dim[j]; });
  }
  /* The near window coverage at cell coordinates (gx bays, gy storeys),
     hard edged, as FACADE_FRAG draws it at aa = 0 (for the test that the
     mean of the one is the other). */
  function facadeNear(p, s, gx, gy) {
    var q = facadeGeom(p, s), cx = Math.floor(gx), cy = Math.floor(gy), fx = gx - cx, fy = gy - cy;
    var axl = q.mull + q.div * (gmod(cx, q.pattern) < 0.5 ? 1 : 0);
    var wx = fx > axl && fx < 1 - q.mull ? 1 : 0, wy = fy > q.sill && fy < 1 - q.head ? 1 : 0;
    var plant = (((cy + q.plantOff) % q.plantN) + q.plantN) % q.plantN === 0 ? 1 : 0;
    var pier = q.pierOn && ((cx % q.pierN) + q.pierN) % q.pierN === 0 ? 1 : 0;
    return wx * wy * (1 - plant) * (1 - pier);
  }
  /* Window life (2026-10-25). The lit decision of a window group is its
     LUT texel; the texel address is the group's id sid plus seed and face
     offsets, wrapped into the program's band (FACADE_FRAG). Window life
     adds an epoch to that address:

       hl = hash(key, seed, face),  ep = floor(t * life * (0.7 + 0.6 hl) + hl)
       sid += ep * (23, 7)

     key is the whole floor (row of groups) for the office and landmark
     programs, so a floor lights up or goes dark as one, and the single
     group for residential and industrial, so windows toggle one by one.
     life is liveliness * windowLife / LIFE_T epochs per second: at
     liveliness 1 a group re-draws every LIFE_T = 240 s on average (rates
     spread by 0.7 to 1.3 and phases by hl, so groups never switch
     together). A re-draw changes the lit state with chance 2 q (1 - q)
     for a lit share q: at liveliness 1 about 3 % of the windows toggle
     per minute (office 2.9, residential 3.6, landmark 2.4, industrial
     1.0, measured in the test), at the default 0.6 about 60 % of that.
     life 0: ep is 0, the old pattern.

     Why the far mean stays: the epoch is a time-shifted re-draw from the
     same distribution. At any t the new address is still a uniformly
     spread texel of the same band (the shift does not depend on the
     texel's content, and sid is already spread over the band by the seed
     offsets and the wrap), so the expected texel of a group is the band
     mean M_p at every t, and the far value gain * M_p * cover_p of
     facadeCover holds unchanged. Only which windows are lit moves, not
     how many. One extra hash per fragment, no new attribute.
     facadeTexel is the same address in JavaScript, for the test. */
  var LIFE_T = 240;
  function lifeSpeed(liveliness, windowLife) {
    return clamp(liveliness == null ? DEF.liveliness : liveliness, 0, 1) * rateOf(windowLife == null ? DEF.windowLife : windowLife) / LIFE_T;
  }
  function gmod(a, n) { return a - n * Math.floor(a / n); }
  /* LUT texel [x, y] of the window in cell (cx bays, cy storeys) on face
     fi of a building with seed s, program p, at time t and life speed
     life (epochs per second), LUT size 64 as the renderer builds it. */
  function facadeTexel(p, s, fi, cx, cy, t, life) {
    var P = FACADE_PROGRAMS[p], size = 64, G = facGrp(P, s);
    var sx = Math.floor(cx / G[0]) + Math.floor(s * 53) + fi * 17;
    var sy = Math.floor(cy / G[1]) + Math.floor(s * 97) + fi * 5;
    var perFl = P.lut === 0 || P.lut === 3 ? 1 : 0;
    var hl = fract(Math.sin(sx * (1 - perFl) * 12.9898 + sy * 78.233 + s * 37.1 + fi * 3.3) * 43758.5453);
    var ep = Math.floor(t * life * (0.7 + 0.6 * hl) + hl);
    sx += ep * 23; sy += ep * 7;
    return [gmod(sx, size), P.lut * 16 + gmod(sy, 16)];
  }
  var FACADE_FRAG = [
    '{',
    '  vec3 n = normalize(vCgWNrm);',
    '  float wall = 1.0 - step(0.6, abs(n.y));',
    '  float code = vFac.z;',
    '  float plain = step(3.5, code) * step(code, 4.5);',
    '  float crown = step(4.5, code);',
    '  int pr = int(min(code, 3.0) + 0.5);',
    '  vec4 PA = uProgA[pr], PB = uProgB[pr], PC = uProgC[pr], PD = uProgD[pr], PE = uProgE[pr], PF = uProgF[pr], PG = uProgG[pr];',
    '  float W = vFac.x, top = vFac.y, u = vFacU, y = vCgWPos.y;',
    '  float fi = abs(n.x) > 0.5 ? (n.x > 0.0 ? 0.0 : 1.0) : (n.z > 0.0 ? 2.0 : 3.0);',
    /* hb per building (corners), hf per face (the core stripe) */
    '  float hb = fract(vSeed * 13.37 + 0.31);',
    '  float hf = fract(sin(vSeed * 91.7 + fi * 12.9898 + top * 0.0731) * 43758.5453);',
    '  float cw = step(hb, PC.x) * mix(4.0, 12.0, fract(hb * 7.77));',
    '  cw *= step(2.0 * cw + 10.0, W);',
    '  float span = max(W - 2.0 * cw, 1.0);',
    '  float bayN = mix(PA.x, PA.y, ' + facHashGL(FH.bay) + ');',
    '  float nb = max(1.0, floor(span / bayN + 0.5));',
    '  vec2 g = vec2((u - cw) * nb / span, y / uStorey);',
    '  vec2 cid = floor(g);',
    '  vec2 f = fract(g);',
    '  vec2 fw = max(fwidth(g), vec2(1e-4));',
    /* the building's own window character (facadeParams) */
    '  float ax = mix(PA.z, PA.w, ' + facHashGL(FH.mull) + ');',
    '  float sill = mix(PB.x, PB.y, ' + facHashGL(FH.sill) + '), head = mix(PB.z, PB.w, ' + facHashGL(FH.head) + ');',
    '  float hp = ' + facHashGL(FH.pat) + ';',
    '  float pm = hp < PC.w ? 2.0 : (hp < PC.w + PD.w ? 3.0 : 1.0);',
    '  float dv = PC.z * step(1.5, pm);',
    /* the divider: a wider mullion on every second or third bay */
    '  float axl = ax + dv * step(mod(cid.x, pm), 0.5);',
    '  float wx = smoothstep(axl - fw.x, axl + fw.x, f.x) * (1.0 - smoothstep(1.0 - ax - fw.x, 1.0 - ax + fw.x, f.x));',
    '  float wy = smoothstep(sill - fw.y, sill + fw.y, f.y) * (1.0 - smoothstep(1.0 - head - fw.y, 1.0 - head + fw.y, f.y));',
    '  float pierOn = step(fract(vSeed * 2.9), PF.x - 1e-4);',
    '  float pierN = 3.0 + floor(fract(vSeed * 5.3) * 4.0);',
    '  float plantN = PF.y + floor(fract(vSeed * 8.7) * PF.z);',
    '  float plant = step(mod(cid.y + floor(vSeed * 37.0), plantN), 0.5) * step(3.0, cid.y);',
    '  float pier = pierOn * step(mod(cid.x, pierN), 0.5);',
    /* the far mean of this program: facadeCover in the JavaScript */
    '  float lcm = pm * pierN / (mod(pierN, pm) < 0.5 ? pm : 1.0);',
    '  float cover = ((1.0 - 2.0 * ax) * (1.0 - pierOn / pierN) - dv * (1.0 / pm - pierOn / lcm)) * (1.0 - sill - head) * (1.0 - 1.0 / plantN);',
    '  float aa = clamp(max(fw.x, fw.y) * 1.2 - 0.2, 0.0, 1.0);',
    '  float win = mix(wx * wy * (1.0 - plant) * (1.0 - pier), cover, aa);',
    /* blind corners, the one core stripe, the cornice storey and the
       crown band, each box filtered over the pixel footprint */
    '  float fu = max(fwidth(u), 1e-3), fy = max(fwidth(y), 1e-3);',
    '  float coreOn = step(hf, PC.y - 1e-4) * step(2.0 * cw + 30.0, W);',
    '  float sw = mix(6.0, 12.0, fract(hf * 3.7));',
    '  float c0 = cw + 8.0 + fract(hf * 5.9) * max(W - 2.0 * cw - 16.0 - sw, 0.0);',
    '  float blank = step(0.01, cw) * (cgCov(-1.0, cw, u, fu) + cgCov(W - cw, W + 1.0, u, fu)) + coreOn * cgCov(c0, c0 + sw, u, fu);',
    '  blank = min(blank, 1.0);',
    '  float corn = cgCov(top - uStorey, top, y, fy) * (1.0 - crown) * (1.0 - plain);',
    '  float crownB = crown * cgCov(top - 2.0 * uStorey, top, y, fy);',
    '  win *= (1.0 - blank) * (1.0 - corn) * (1.0 - crownB) * (1.0 - plain);',
    /* the building's window group: gx bays by gy storeys share a texel */
    '  vec2 grp = PG.xz + floor(vec2(' + facHashGL(FH.grpX) + ', ' + facHashGL(FH.grpY) + ') * (PG.yw - PG.xz + 1.0));',
    '  vec2 sid = floor(cid / grp) + floor(vec2(vSeed * 53.0, vSeed * 97.0)) + vec2(fi * 17.0, fi * 5.0);',
    /* window life: a time-shifted re-draw from the same band (facadeTexel) */
    '  float perFl = 1.0 - step(0.5, PD.x) * step(PD.x, 2.5);',
    '  float hl = fract(sin(sid.x * (1.0 - perFl) * 12.9898 + sid.y * 78.233 + vSeed * 37.1 + fi * 3.3) * 43758.5453);',
    '  sid += floor(uTime * uLife * (0.7 + 0.6 * hl) + hl) * vec2(23.0, 7.0);',
    '  vec2 tc = vec2(mod(sid.x, uLutSize) + 0.5, PD.x * 16.0 + mod(sid.y, 16.0) + 0.5) / uLutSize;',
    /* the building's light: lit windows in its colour temperature (T,
       luminance 1), unlit glass glowing with its own gain and tint (D),
       neon accents as they are. Linear in the texel classes, so the far
       value is the class means weighted the same way. */
    '  vec3 litT = mix(uLitA[pr], uLitB[pr], ' + facHashGL(FH.lit) + ');',
    '  float hd = ' + facHashGL(FH.dim) + ';',
    '  vec3 dimD = mix(' + FAC_DIM[0].toFixed(3) + ', ' + FAC_DIM[1].toFixed(3) + ', hd * hd) * mix(vec3(' + glv(FAC_TINT[0]) + '), vec3(' + glv(FAC_TINT[1]) + '), ' + facHashGL(FH.tint) + ');',
    '  vec4 tx = texture2D(uLUT, tc);',
    '  float cLit = step(0.75, tx.a), cAcc = step(0.25, tx.a) * (1.0 - cLit);',
    '  vec3 lutN = tx.rgb * 2.0 * (cLit * litT + cAcc + (1.0 - cLit - cAcc) * dimD);',
    '  vec3 lutF = uLutLit[pr] * litT + uLutAcc[pr] + uLutDim[pr] * dimD;',
    '  vec3 lut = mix(lutN, lutF, aa);',
    /* spandrel band at the foot of each storey, lighter than the wall: the
       storey lines read where no window is lit */
    '  float bw = mix(PE.x, PE.y, ' + facHashGL(FH.bandW) + '), kb = mix(PE.z, PE.w, ' + facHashGL(FH.bandK) + ');',
    '  float band = (1.0 - smoothstep(bw - fw.y, bw + fw.y, f.y)) * (1.0 - plant);',
    '  float bandP = mix(band, bw * (1.0 - 1.0 / plantN), aa) * (1.0 - plain);',
    /* glass and frame: linear in win, so the far mean is the near mean */
    '  vec3 glass = mix(' + FAC_GLASS[0].toFixed(3) + ', ' + FAC_GLASS[1].toFixed(3) + ', ' + facHashGL(FH.glass) + ') * mix(vec3(' + glv(FAC_TINT[0]) + '), vec3(' + glv(FAC_TINT[1]) + '), ' + facHashGL(FH.tint) + ');',
    '  float frame = mix(' + FAC_FRAME[0].toFixed(3) + ', ' + FAC_FRAME[1].toFixed(3) + ', ' + facHashGL(FH.frame) + ');',
    '  diffuseColor.rgb *= 1.0 + wall * (kb * bandP + corn + (1.0 - plain) * ((frame - 1.0) * (1.0 - win) + (glass - 1.0) * win));',
    '  diffuseColor.rgb *= mix(uRoofDark, 1.0, wall);',
    '  {',
    '    vec2 rp = vCgWPos.xz / 6.0;',
    '    vec2 rf = abs(fract(rp) - 0.5);',
    '    vec2 rw = max(fwidth(rp), vec2(1e-4));',
    '    float ra = clamp(max(rw.x, rw.y) * 1.5 - 0.2, 0.0, 1.0);',
    '    float seam = (1.0 - smoothstep(0.0, rw.x * 1.5 + 0.01, 0.5 - max(rf.x, rf.y))) * (1.0 - ra);',
    '    float big = 1.0 - smoothstep(0.0, rw.x * 3.0 + 0.004, 0.5 - max(abs(fract(rp.x / 4.0) - 0.5), abs(fract(rp.y / 4.0) - 0.5)));',
    '    float tile = mix(fract(sin(dot(floor(rp), vec2(41.3, 289.1))) * 15731.7), 0.5, ra);',
    '    diffuseColor.rgb *= mix(1.0, (0.8 + 0.35 * tile) * (1.0 - 0.35 * seam) * (1.0 - 0.4 * big), 1.0 - wall);',
    '    float dot2 = (1.0 - smoothstep(0.04, 0.07 + rw.x, length(fract(rp) - 0.5))) * (1.0 - ra);',
    '    totalEmissiveRadiance += (1.0 - wall) * step(0.6, n.y) * step(0.93, tile) * dot2 * texture2D(uLUT, floor(rp) / uLutSize).rgb * 3.0;',
    '  }',
    '  totalEmissiveRadiance += lut * win * wall * uWinGain;',
    /* the crown band breathes, 5 to 9 s per breath, phase per building;
       the sine has mean zero, so its time mean is the old steady band */
    '  float breath = 1.0 + uBreath * sin(6.2832 * (uTime / mix(5.0, 9.0, fract(hb * 3.1)) + hb));',
    '  totalEmissiveRadiance += crownB * wall * vec3(0.82, 0.9, 0.95) * uWinGain * 0.5 * breath;',
    '}'
  ].join('\n');
  var FACADE_DECL = 'varying vec3 vCgWNrm; flat varying float vSeed; varying float vFacU; flat varying vec3 vFac;\n' +
    'uniform sampler2D uLUT; uniform vec3 uLutLit[4]; uniform vec3 uLutAcc[4]; uniform vec3 uLutDim[4]; uniform vec4 uProgA[4]; uniform vec4 uProgB[4]; uniform vec4 uProgC[4]; uniform vec4 uProgD[4]; uniform vec4 uProgE[4]; uniform vec4 uProgF[4]; uniform vec4 uProgG[4]; uniform vec3 uLitA[4]; uniform vec3 uLitB[4];\n' +
    'uniform float uStorey; uniform float uWinGain; uniform float uLutSize; uniform float uRoofDark;\n' +
    'uniform float uTime; uniform float uLife; uniform float uBreath;\n' +
    'float cgCov(float a, float b, float x, float w){ return clamp((min(b, x + 0.5 * w) - max(a, x - 0.5 * w)) / w, 0.0, 1.0); }\n';

  /* The light programs (V9), one LUT band of 16 rows each: office (whole
     floors on, single windows rare), residential (rooms of 4 x 2 windows,
     warmer), industrial (nearly dark, cold), landmark (like office, more
     floors on). */
  var LUT_BANDS = [
    { lit: 0.02, rowLit: 0.22, rowLen: [6, 24], warm: 0.15, accentRate: 0.0015 },
    { lit: 0.15, rowLit: 0.02, rowLen: [2, 5], warm: 0.55, accentRate: 0.001 },
    { lit: 0.025, rowLit: 0.04, rowLen: [2, 6], warm: 0, accentRate: 0 },
    { lit: 0.03, rowLit: 0.3, rowLen: [8, 30], warm: 0.1, accentRate: 0.002 }
  ];
  /* One texel per window group: mostly dim, sparse lit cells, lit rows
     clustered by floor, a muted warm share, a few accent windows. With
     o.bands the rows are cut into bands of size / bands.length rows, each
     with its own parameters. Returns the texel bytes, the overall mean and
     the mean of each band, as the shader reads them (x 2, linear), and
     the same means split by texel class (unlit, accent, lit, stored in
     the alpha byte), because a building scales its lit and its unlit
     windows separately (FACADE_FRAG). */
  function windowLUT(seed, o) {
    var size = o.size || 64, bands = o.bands || [o], nb = bands.length, rows = size / nb;
    var accents = o.accents || [];
    var R = rng(seed), data = new Uint8Array(size * size * 4), sum = [0, 0, 0], bs = [], ps = [];
    for (var y = 0; y < size; y++) {
      var bi = Math.min(nb - 1, Math.floor(y / rows)), B = bands[bi];
      if (!bs[bi]) bs[bi] = [0, 0, 0];
      var lit = B.lit == null ? 0.04 : B.lit, rowLit = B.rowLit == null ? 0.08 : B.rowLit;
      var rl = B.rowLen || [4, 20], warm = B.warm == null ? 0.25 : B.warm, accentRate = B.accentRate == null ? 0.0015 : B.accentRate;
      var rowOn = R() < rowLit, rowStart = R.int(0, size), rowLen = R.int(rl[0], rl[1]);
      for (var x = 0; x < size; x++) {
        var i = (y * size + x) * 4, c, r = R(), cls = 0;
        var inRow = rowOn && ((x - rowStart + size) % size) < rowLen;
        if (accents.length && r < accentRate) {
          var a = accents[Math.floor(R() * accents.length)];
          c = [a[0] * 0.8, a[1] * 0.8, a[2] * 0.8];
          cls = 1;
        } else if (r < lit || (inRow && R() < 0.8)) {
          cls = 2;
          c = boneRGB(R.range(0.55, 0.95));
          if (R() < warm) c = [c[0], c[1] * 0.88, c[2] * 0.7];
          var k = R.range(0.5, 1.0);
          c = [c[0] * k, c[1] * k, c[2] * k];
        } else if (r < lit + 0.25) {
          c = boneRGB(R.range(0.14, 0.26)).map(function (v) { return v * 0.7; });
        } else {
          c = boneRGB(R.range(0.04, 0.10)).map(function (v) { return v * 0.4; });
        }
        for (var j = 0; j < 3; j++) {
          var byte = Math.min(255, Math.round(c[j] * 127.5));
          data[i + j] = byte;
          /* the texture is sRGB; the shader sees linear values */
          var lv = toLin(byte / 255) * 2;
          sum[j] += lv; bs[bi][j] += lv;
          if (!ps[bi]) ps[bi] = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
          ps[bi][cls][j] += lv;
        }
        /* alpha: the texel's class, 0 unlit, 128 neon accent, 255 lit */
        data[i + 3] = LUT_ALPHA[cls];
      }
    }
    var nn = size * size, per = rows * size;
    return { data: data, size: size, mean: [sum[0] / nn, sum[1] / nn, sum[2] / nn],
      means: bs.map(function (m) { return [m[0] / per, m[1] / per, m[2] / per]; }),
      /* per band the share of the mean from each class: parts[b][cls],
         cls 0 unlit, 1 accent, 2 lit; the three add up to means[b] */
      parts: ps.map(function (q) { return q.map(function (m) { return [m[0] / per, m[1] / per, m[2] / per]; }); }) };
  }
  var LUT_ALPHA = [0, 128, 255];

  /* The sky: the atmosphere model for a ray that never ends (see makeFog),
     the overcast deck behind it. At the horizon and below it the ray is
     fully fogged, so the sky meets every far wall and the ground in the
     same colour. */
  function makeSky(THREE, fog, radius) {
    var m = new THREE.ShaderMaterial({
      uniforms: fog.uniforms,
      vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }',
      fragmentShader: FOG_DECL + '\nvarying vec3 vDir;\nvoid main(){\n  vec3 d = normalize(vDir);\n' +
        '  float T = d.y > 0.0 ? exp(-cgTauInf(cameraPosition.y, d.y)) : 0.0;\n' +
        '  gl_FragColor = vec4(mix(cgFogDir(d), cgSkyTop, T), 1.0);\n}',
      side: THREE.BackSide, depthWrite: false, fog: false
    });
    var s = new THREE.Mesh(new THREE.SphereGeometry(radius || 9000, 48, 24), m);
    s.frustumCulled = false; s.renderOrder = -1;
    s.onBeforeRender = function (r, sc, cam) { s.position.copy(cam.position); s.updateMatrixWorld(); };
    return s;
  }

  /* Box faces, counter-clockwise seen from outside, as corner picks from
     (x0|x1, y0|y1, z0|z1). Bottom last, so it can be skipped. */
  var FACE = [
    [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 0]],
    [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0], [-1, 0, 0]],
    [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0], [0, 1, 0]],
    [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1], [0, 0, 1]],
    [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, -1]],
    [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1], [0, -1, 0]]
  ];
  /* Merged box arrays: position, normal, linear tint, building seed, and
     the facade attribute aFac = (u, W, top, code) of V0: u metres from the
     face's left edge (the lower x or z corner), W the face width, top the
     box's roof height, code the facade program (box.prog). Roof and floor
     faces get u = W = 0. */
  function boxArrays(list, toneOf) {
    var nf = 0, i, f, k;
    for (i = 0; i < list.length; i++) nf += list[i].min[1] > 0.05 ? 6 : 5;
    var pos = new Float32Array(nf * 12), nrm = new Float32Array(nf * 12), col = new Float32Array(nf * 12), sd = new Float32Array(nf * 4);
    var fac = new Float32Array(nf * 16);
    var big = nf * 4 > 65535, idx = big ? new Uint32Array(nf * 6) : new Uint16Array(nf * 6);
    var v = 0, q = 0;
    for (i = 0; i < list.length; i++) {
      var b = list[i], lo = b.min, hi = b.max;
      var rgb = toneOf(b), lr = toLin(rgb[0]), lg = toLin(rgb[1]), lb = toLin(rgb[2]);
      var nfb = lo[1] > 0.05 ? 6 : 5;
      var code = b.prog == null ? PROG_PLAIN : b.prog;
      for (f = 0; f < nfb; f++) {
        var F = FACE[f], n = F[4], ta = n[0] ? 2 : (n[2] ? 0 : -1);
        for (k = 0; k < 4; k++) {
          var c = F[k], o = (v + k) * 3, o4 = (v + k) * 4;
          fac[o4] = ta < 0 ? 0 : (c[ta] ? hi[ta] - lo[ta] : 0);
          fac[o4 + 1] = ta < 0 ? 0 : hi[ta] - lo[ta];
          fac[o4 + 2] = hi[1]; fac[o4 + 3] = code;
          pos[o] = c[0] ? hi[0] : lo[0]; pos[o + 1] = c[1] ? hi[1] : lo[1]; pos[o + 2] = c[2] ? hi[2] : lo[2];
          nrm[o] = n[0]; nrm[o + 1] = n[1]; nrm[o + 2] = n[2];
          col[o] = lr; col[o + 1] = lg; col[o + 2] = lb;
          sd[v + k] = b.seed;
        }
        idx[q++] = v; idx[q++] = v + 1; idx[q++] = v + 2;
        idx[q++] = v; idx[q++] = v + 2; idx[q++] = v + 3;
        v += 4;
      }
    }
    return { pos: pos, nrm: nrm, col: col, seed: sd, fac: fac, idx: idx };
  }

  /* Rough skyline silhouette for the world edge: a ring of boxes around the
     origin, moved with the camera, drawn as a slightly darker fog. */
  function skylineBoxes(seed, radius) {
    var R = rng(seed ^ 0x51ab), out = [];
    var n = 220;
    for (var i = 0; i < n; i++) {
      var a = (i + R.range(-0.4, 0.4)) / n * Math.PI * 2;
      var rr = radius * R.range(0.92, 1.12);
      var w = R.range(40, 130), d = R.range(40, 130);
      var h = 70 + Math.pow(R(), 1.4) * 480 * (0.5 + 0.5 * fbm(Math.cos(a) * 3, Math.sin(a) * 3, seed, 2));
      var x = Math.cos(a) * rr, z = Math.sin(a) * rr;
      out.push({ min: [x - w / 2, 0, z - d / 2], max: [x + w / 2, h, z + d / 2], seed: R(), tone: 0 });
    }
    return out;
  }

  /* The rectangle (world x0, z0, x1, z1) covered by a set of tile keys,
     empty (x0 > x1) for none; and whether a skyline box, offset by the ring
     centre off = [x, z], meets it. The skyline vertex shader runs the same
     test, so no skyline box ever stands inside the loaded city. */
  function loadedRect(keys) {
    var r = [Infinity, Infinity, -Infinity, -Infinity];
    for (var key of keys) {
      var c = key.split(','), i = parseInt(c[0], 10), k = parseInt(c[1], 10);
      if (i * TILE < r[0]) r[0] = i * TILE;
      if (k * TILE < r[1]) r[1] = k * TILE;
      if ((i + 1) * TILE > r[2]) r[2] = (i + 1) * TILE;
      if ((k + 1) * TILE > r[3]) r[3] = (k + 1) * TILE;
    }
    return r[0] > r[2] ? [1, 1, -1, -1] : r;
  }
  function skylineHidden(b, off, r) {
    return b.min[0] + off[0] < r[2] && b.max[0] + off[0] > r[0] && b.min[2] + off[1] < r[3] && b.max[2] + off[1] > r[1];
  }

  function makeCityRenderer(THREE, opts) {
    var o = opts || {};
    var fog = o.fog || makeFog(THREE);
    var nAcc = clamp(o.accents == null ? 2 : Math.round(o.accents), 0, 2);
    var accHex = (o.accentColors || [0x2ee8ff, 0xff3fa4]).slice(0, Math.max(1, nAcc));
    var accLin = accHex.map(function (h) { var c = new THREE.Color(h); return [c.r, c.g, c.b]; });
    var group = new THREE.Group();
    group.name = 'hikyaku-city';
    var seed = (o.seed == null ? 1 : o.seed) >>> 0;

    /* facade material, one for every tile */
    var accSrgb = nAcc ? accHex.map(function (h) {
      return [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255];
    }) : [];
    var L = windowLUT(seed ^ 0x2077, { bands: LUT_BANDS, accents: accSrgb });
    function progVec(fn) {
      return FACADE_PROGRAMS.map(function (P) { var q = fn(P); return new THREE.Vector4(q[0], q[1], q[2], q[3]); });
    }
    var lutTex = new THREE.DataTexture(L.data, L.size, L.size, THREE.RGBAFormat);
    lutTex.wrapS = lutTex.wrapT = THREE.RepeatWrapping;
    lutTex.magFilter = lutTex.minFilter = THREE.NearestFilter;
    lutTex.colorSpace = THREE.SRGBColorSpace;
    lutTex.needsUpdate = true;
    /* City life: one clock for the facade (window life, crown breathing),
       the beacons and the holograms, set by update (see there). */
    var timeU = { value: 0 }, clock = 0;
    var lifeU = { value: 0 }, breathU = { value: 0 };
    function setLife(q) {
      var lv = q && q.liveliness != null ? q.liveliness : (o.liveliness == null ? DEF.liveliness : o.liveliness);
      var wl = q && q.windowLife != null ? q.windowLife : (o.windowLife == null ? DEF.windowLife : o.windowLife);
      var bc = q && q.beacons != null ? q.beacons : (o.beacons == null ? DEF.beacons : o.beacons);
      o = Object.assign({}, o, { liveliness: lv, windowLife: wl, beacons: bc });
      lifeU.value = lifeSpeed(lv, wl);
      /* crown breathing depth: 0.4 at life rate 1, 0.24 at the default */
      breathU.value = 0.4 * clamp(clamp(lv, 0, 1) * rateOf(bc), 0, 1);
    }
    setLife(null);
    var facade = {
      uniforms: {
        uTime: timeU, uLife: lifeU, uBreath: breathU,
        uLUT: { value: lutTex }, uLutSize: { value: L.size },
        uLutDim: { value: L.parts.map(function (q) { return new THREE.Vector3(q[0][0], q[0][1], q[0][2]); }) },
        uLutAcc: { value: L.parts.map(function (q) { return new THREE.Vector3(q[1][0], q[1][1], q[1][2]); }) },
        uLutLit: { value: L.parts.map(function (q) { return new THREE.Vector3(q[2][0], q[2][1], q[2][2]); }) },
        uStorey: { value: STOREY },
        uProgA: { value: progVec(function (P) { return [P.bay[0], P.bay[1], P.mull[0], P.mull[1]]; }) },
        uProgB: { value: progVec(function (P) { return [P.sill[0], P.sill[1], P.head[0], P.head[1]]; }) },
        uProgC: { value: progVec(function (P) { return [P.cornerP, P.coreP, P.div, P.pPair]; }) },
        uProgD: { value: progVec(function (P) { return [P.lut, 0, 0, P.pThird]; }) },
        uProgE: { value: progVec(function (P) { return [P.bandW[0], P.bandW[1], P.bandK[0], P.bandK[1]]; }) },
        uProgF: { value: progVec(function (P) { return [P.pierP, P.plant[0], P.plant[1], 0]; }) },
        uProgG: { value: progVec(function (P) { return [P.grp[0][0], P.grp[0][1], P.grp[1][0], P.grp[1][1]]; }) },
        uLitA: { value: FACADE_PROGRAMS.map(function (P) { var c = lumOne(P.lit[0]); return new THREE.Vector3(c[0], c[1], c[2]); }) },
        uLitB: { value: FACADE_PROGRAMS.map(function (P) { var c = lumOne(P.lit[1]); return new THREE.Vector3(c[0], c[1], c[2]); }) },
        uWinGain: { value: o.winGain == null ? 1.6 : o.winGain }, uRoofDark: { value: 0.8 }
      }
    };
    var facadeMat = fog.patch(new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.85, metalness: 0.15 }), { facade: facade });

    /* signs: procedural neon panels, no texture, no text yet (the sign
       atlas comes with the easter egg). A frame tube and a column of
       glyph-like strokes, white core, hue halo. */
    var signMat = new THREE.ShaderMaterial({
      uniforms: Object.assign({ uFogK: { value: 0.55 } }, fog.uniforms),
      vertexShader: [
        FOG_DECL, 'uniform float uFogK;',
        'attribute vec2 aUv; attribute vec3 aCol; attribute vec2 aSize; attribute float aSeed;',
        'varying vec2 vUv; varying vec3 vCol; varying vec2 vSize; flat varying float vSeed; varying float vFog; varying vec3 vFogC;',
        'void main(){',
        '  vUv = aUv; vCol = aCol; vSize = aSize; vSeed = aSeed;',
        '  vec4 w = modelMatrix * vec4(position, 1.0);',
        '  vFog = cgFogAmt(w.xyz, uFogK); vFogC = cgFogColor(w.xyz);',
        '  gl_Position = projectionMatrix * viewMatrix * w;',
        '}'].join('\n'),
      fragmentShader: [
        'varying vec2 vUv; varying vec3 vCol; varying vec2 vSize; flat varying float vSeed; varying float vFog; varying vec3 vFogC;',
        'float h1(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233)) + vSeed * 91.7) * 43758.5453); }',
        'float band(float x, float a, float b, float w){ return smoothstep(a - w, a + w, x) * (1.0 - smoothstep(b - w, b + w, x)); }',
        'void main(){',
        '  vec2 p = vUv * vSize;',
        '  float e = min(min(p.x, vSize.x - p.x), min(p.y, vSize.y - p.y));',
        '  float fw = max(fwidth(e), 1e-3);',
        '  float frame = 1.0 - smoothstep(0.12, 0.12 + fw * 1.5, abs(e - 0.5));',
        '  bool vert = vSize.y >= vSize.x;',
        '  vec2 ip = p - 1.1; vec2 isz = vSize - 2.2;',
        '  float cell = vert ? isz.x : isz.y;',
        '  float along = vert ? (isz.y - ip.y) : ip.x;',
        '  float across = vert ? ip.x : (isz.y - ip.y);',
        '  float ci = floor(along / cell);',
        '  float nC = floor((vert ? isz.y : isz.x) / cell);',
        '  vec2 q = vec2(across / cell, fract(along / cell));',
        '  q = (q - 0.5) / 0.8 + 0.5;',
        '  float sw = 0.055, aw = fwidth(q.x) * 1.2;',
        '  float g = 0.0;',
        '  for (int k = 0; k < 3; k++) {',
        '    float fk = float(k);',
        '    float y = 0.15 + 0.7 * h1(vec2(ci, fk));',
        '    float x0 = 0.1 + 0.35 * h1(vec2(ci, fk + 7.0)), x1 = x0 + 0.3 + 0.4 * h1(vec2(ci, fk + 13.0));',
        '    g = max(g, band(q.y, y - sw, y + sw, aw) * band(q.x, x0, min(x1, 0.92), aw));',
        '  }',
        '  for (int k = 0; k < 2; k++) {',
        '    float fk = float(k);',
        '    float x = 0.15 + 0.7 * h1(vec2(ci, fk + 21.0));',
        '    float y0 = 0.05 + 0.3 * h1(vec2(ci, fk + 29.0)), y1 = y0 + 0.4 + 0.45 * h1(vec2(ci, fk + 37.0));',
        '    g = max(g, band(q.x, x - sw, x + sw, aw) * band(q.y, y0, min(y1, 0.95), aw));',
        '  }',
        '  float inside = step(0.0, ip.x) * step(0.0, ip.y) * step(ip.x, isz.x) * step(ip.y, isz.y) * step(ci, nC - 1.0);',
        '  g *= inside * step(0.0, q.x) * step(q.x, 1.0) * step(0.0, q.y) * step(q.y, 1.0);',
        '  float far = clamp(fw * 3.0 - 0.3, 0.0, 1.0);',
        '  g = mix(g, 0.16, far); frame = mix(frame, 0.2, far);',
        '  vec3 c = vCol * (0.07 + 1.3 * frame + 1.2 * g) + vec3(1.0) * (0.55 * g + 0.25 * frame);',
        '  gl_FragColor = vec4(mix(c, vFogC, vFog), 1.0);',
        '}'].join('\n'),
      /* flat signs hang 0.3 m off the facade: the polygon offset keeps
         them in front of it at any distance (no z-fighting) */
      side: THREE.DoubleSide, toneMapped: false, fog: false,
      polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1
    });

    /* additive glow billboards (faked bloom), from citygen GlowLayer.
       iBlink = (mode, phase, period) for the city life beacons, a closed
       formula of uTime: mode 0 steady (signs, haze, roof glows), 1 red
       aviation strobe (one short pulse of about 0.2 s per period, a dim
       0.18 between, so a beacon is a small red point that flashes), 2
       steady small lamp (the amber roof plant). Modes 1 and 2 keep an
       angular size of at least 0.0045 rad (about 4 px at
       1600 px and 75 degrees) and dim by the size ratio instead, so
       a far beacon stays a point and does not grow into a blob. */
    var glowMat = new THREE.ShaderMaterial({
      uniforms: Object.assign({ uFogK: { value: 0.5 }, uFall: { value: 3.5 }, uTime: timeU }, fog.uniforms),
      vertexShader: [
        FOG_DECL, 'uniform float uFogK; uniform float uTime;',
        'attribute vec3 iPos; attribute vec2 iSize; attribute vec3 iCol; attribute vec3 iBlink;',
        'varying vec2 vUv; varying vec3 vCol;',
        'void main(){',
        '  vec4 mv = viewMatrix * vec4(iPos, 1.0);',
        '  vec2 sz = iSize; float k = 1.0;',
        '  if (iBlink.x > 0.5) {',
        '    float s = max(iSize.x, -mv.z * 0.0045);',
        '    k = iSize.x / s; sz = vec2(s);',
        '    if (iBlink.x < 1.5) {',
        '      float ph = fract(uTime / iBlink.z + iBlink.y) * iBlink.z;',
        '      float d = min(ph, iBlink.z - ph) / 0.1;',
        '      k *= 0.18 + exp(-d * d);',
        '    }',
        '  }',
        '  mv.xy += position.xy * sz;',
        '  vUv = uv;',
        '  vCol = iCol * k * (1.0 - cgFogAmt(iPos, uFogK));',
        '  gl_Position = projectionMatrix * mv;',
        '}'].join('\n'),
      fragmentShader: [
        'uniform float uFall; varying vec2 vUv; varying vec3 vCol;',
        'void main(){',
        '  float r = length(vUv - 0.5) * 2.0;',
        '  float a = exp(-r * r * uFall) * clamp(1.0 - r, 0.0, 1.0);',
        '  a += 0.6 * exp(-r * r * uFall * 12.0);',
        '  gl_FragColor = vec4(vCol * a, 1.0);',
        '}'].join('\n'),
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, fog: false
    });

    /* holograms: one additive, translucent quad per tile hologram, all in
       one buffer, spanning the gap between two towers. The content is a
       ticker (2026-10-25, owner: in films such a sign scrolls sideways):
       one band of blocky glyphs, 4 x 5 pseudo pixels per glyph with word
       gaps and the odd solid logo block, between two dashed bars, the
       whole band moving along the quad at aTick m/s (3 to 8, sign the
       direction, both from the tile hash). The pattern repeats every
       HOLO_CELLS glyph cells and the scroll offset is taken modulo that
       period, so the wrap is seamless and float precision never drifts
       with t. On top: a highlight bar sweeping across every 6 to 10 s,
       scanlines every 0.6 m creeping upward, a slow wobble and rare 1/8 s
       dropouts. Everything a closed formula of uTime. Pastel colour
       (holoRGB, HOLO_SAT), additive, so it reads as light in the air, not
       as a panel; it fades with the fog like the glows, and the glyph
       detail averages out with distance (no shimmer). */
    var holoMat = new THREE.ShaderMaterial({
      uniforms: Object.assign({ uFogK: { value: 0.55 }, uTime: timeU }, fog.uniforms),
      vertexShader: [
        FOG_DECL, 'uniform float uFogK;',
        'attribute vec2 aUv; attribute vec3 aCol; attribute vec2 aSize; attribute float aSeed; attribute float aTick;',
        'varying vec2 vUv; varying vec3 vCol; varying vec2 vSize; flat varying float vSeed; flat varying float vTick;',
        'void main(){',
        '  vUv = aUv; vSize = aSize; vSeed = aSeed; vTick = aTick;',
        '  vCol = aCol * (1.0 - cgFogAmt(position, uFogK));',
        '  gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0);',
        '}'].join('\n'),
      fragmentShader: [
        'uniform float uTime;',
        'varying vec2 vUv; varying vec3 vCol; varying vec2 vSize; flat varying float vSeed; flat varying float vTick;',
        'float hh(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233)) + vSeed * 61.3) * 43758.5453); }',
        'void main(){',
        '  float t = uTime;',
        '  vec2 p = vUv * vSize;',
        '  float e = min(min(p.x, vSize.x - p.x), min(p.y, vSize.y - p.y));',
        '  float edge = smoothstep(0.0, 1.5, e);',
        '  float frame = exp(-pow((e - 0.6) / 0.3, 2.0));',
        '  float v = vUv.y;',
        /* glyph cell: 0.72 of the glyph row high, the row 0.5 of the quad */
        '  float rh = vSize.y * 0.5, cw = rh * 0.72, per = ' + HOLO_CELLS.toFixed(1) + ' * cw;',
        '  float x = mod(p.x - mod(vTick * t, per), per);',
        '  float xc = x / cw, ci = floor(xc), fx = fract(xc);',
        '  float gy = (v - 0.25) / 0.5, inRow = step(0.0, gy) * step(gy, 1.0);',
        '  float gap = step(hh(vec2(ci, 3.0)), 0.16);',
        '  float logo = step(hh(vec2(ci, 4.0)), 0.07) * (1.0 - gap);',
        '  float px = floor(clamp((fx - 0.12) / 0.76, 0.0, 0.999) * 4.0), py = floor(clamp(gy, 0.0, 0.999) * 5.0);',
        '  float inG = step(0.12, fx) * step(fx, 0.88);',
        '  float pix = step(0.45, hh(vec2(ci * 7.0 + px, py + 11.0)));',
        '  float pg = fract(clamp((fx - 0.12) / 0.76, 0.0, 0.999) * 4.0), pv = fract(clamp(gy, 0.0, 0.999) * 5.0);',
        '  pix *= step(0.1, pg) * step(pg, 0.9) * step(0.1, pv) * step(pv, 0.9);',
        '  float glyph = inRow * inG * (1.0 - gap) * mix(pix, 1.0, logo);',
        /* the two dashed bars, the same scroll: segments of two cells */
        '  float sx = x / (2.0 * cw), si = floor(sx), sf = fract(sx);',
        '  float dash = step(0.3, hh(vec2(si, 7.0))) * step(0.08, sf) * step(sf, 0.92);',
        '  float bars = (step(0.08, v) * step(v, 0.15) + step(0.85, v) * step(v, 0.92)) * dash;',
        '  float content = glyph + 0.6 * bars;',
        /* far: the mean of the band (about 0.3 in the row, 0.42 dash share) */
        '  float fw = max(fwidth(xc) * 4.0, fwidth(gy) * 5.0);',
        '  float meanC = inRow * 0.3 + 0.6 * 0.42 * (step(0.08, v) * step(v, 0.15) + step(0.85, v) * step(v, 0.92));',
        '  content = mix(content, meanC, clamp(fw * 1.5 - 0.3, 0.0, 1.0));',
        '  float sw = 6.0 + 4.0 * fract(vSeed * 7.1);',
        '  float bx = (fract(t / sw + vSeed) * 1.4 - 0.2) * vSize.x;',
        '  float bar = exp(-pow((p.x - bx) / 3.0, 2.0));',
        '  float sl = 0.5 + 0.5 * sin((p.y - t * 0.4) * 10.472);',
        '  float scan = mix(0.5 + 0.5 * sl, 0.75, clamp(fwidth(p.y / 0.6) * 2.0 - 0.5, 0.0, 1.0));',
        '  float drop = step(0.985, fract(sin(floor(t * 8.0) * 12.9898 + vSeed * 78.233) * 43758.5453));',
        '  float flick = (0.9 + 0.1 * sin(t * 1.7 + vSeed * 40.0) * sin(t * 0.37 + vSeed * 9.0)) * (1.0 - 0.6 * drop);',
        '  float I = ((0.06 + 0.5 * content + 0.25 * bar) * edge + 0.3 * frame) * scan * flick;',
        '  gl_FragColor = vec4(vCol * I, 1.0);',
        '}'].join('\n'),
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
      side: THREE.DoubleSide, fog: false
    });

    /* axial streaks: lamp lines along the streets, from citygen StreakLayer */
    var streakMat = new THREE.ShaderMaterial({
      uniforms: Object.assign({ uFogK: { value: 0.65 } }, fog.uniforms),
      vertexShader: [
        FOG_DECL, 'uniform float uFogK;',
        'attribute vec3 iA; attribute vec3 iB; attribute vec2 iW; attribute vec3 iCol;',
        'varying vec2 vP; varying vec3 vCol; varying float vFade;',
        'void main(){',
        '  vec3 dir = iB - iA; float L = length(dir); vec3 dn = dir / max(L, 1e-4);',
        '  vec3 wp = iA + dir * position.x;',
        '  vec3 toCam = cameraPosition - wp;',
        '  vec3 side = normalize(cross(dn, toCam));',
        '  float wpx = max(iW.x, length(toCam) * 0.0015);',
        '  wp += dn * (position.x - 0.5) * 2.0 * wpx * 0.6;',
        '  wp += side * position.y * wpx;',
        '  vP = position.xy; vFade = iW.y;',
        '  vCol = iCol * (1.0 - cgFogAmt(wp, uFogK)) * (iW.x / wpx);',
        '  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);',
        '}'].join('\n'),
      fragmentShader: [
        'varying vec2 vP; varying vec3 vCol; varying float vFade;',
        'void main(){',
        '  float across = exp(-vP.y * vP.y * 5.0) + 0.8 * exp(-vP.y * vP.y * 60.0);',
        '  float along = mix(1.0, pow(clamp(vP.x, 0.0, 1.0), 1.6), vFade);',
        '  float ends = smoothstep(0.0, 0.04, vP.x) * (1.0 - smoothstep(0.96, 1.0, vP.x));',
        '  gl_FragColor = vec4(vCol * across * along * ends, 1.0);',
        '}'].join('\n'),
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, side: THREE.DoubleSide, fog: false
    });

    var b0 = boneRGB(0.05);
    var cableMat = fog.patch(new THREE.LineBasicMaterial({ color: new THREE.Color().setRGB(toLin(b0[0]), toLin(b0[1]), toLin(b0[2])) }), {});

    /* skyline: dark far towers for the world edge, fogged by exactly the
       same atmosphere as a real box (cgFogAmt with k = 1 and the shared
       uniforms), so at high density they dissolve into the haze instead of
       standing above it. The ring is centred on the camera, but the tile
       window is not (pushed 1.5 tiles ahead, kept one tile larger), so
       real tiles reach 1.8 to 2.1 km on the diagonals, into the ring at
       1.6 to 2 km. A skyline box whose footprint meets the rectangle of
       the loaded tiles (uCull, world x0 z0 x1 z1, kept by update) collapses
       in the vertex shader: the skyline only fills in where the city has
       stopped (skylineHidden is the same test in JavaScript). */
    var skyMat = new THREE.ShaderMaterial({
      uniforms: Object.assign({ uBase: { value: new THREE.Color(0.06, 0.065, 0.085) },
        uCull: { value: new THREE.Vector4(1, 1, -1, -1) } }, fog.uniforms),
      vertexShader: 'attribute vec4 aBox; uniform vec4 uCull; varying vec3 vW;\nvoid main(){\n' +
        '  vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz;\n' +
        '  vec4 b = aBox + modelMatrix[3].xzxz;\n' +
        '  bool hid = b.x < uCull.z && b.z > uCull.x && b.y < uCull.w && b.w > uCull.y;\n' +
        '  gl_Position = hid ? vec4(0.0, 0.0, 2.0, 1.0) : projectionMatrix * viewMatrix * w;\n}',
      fragmentShader: FOG_DECL + '\nuniform vec3 uBase; varying vec3 vW;\nvoid main(){\n' +
        '  gl_FragColor = vec4(mix(uBase, cgFogColor(vW), cgFogAmt(vW, 1.0)), 1.0);\n}',
      fog: false
    });
    var skyR = o.skylineR || 1750;
    var skyList = skylineBoxes(seed, skyR);
    var skyA = boxArrays(skyList, function () { return [0, 0, 0]; });
    var skyBox = new Float32Array(skyA.pos.length / 3 * 4), nvb = skyA.pos.length / 3 / skyList.length;
    skyList.forEach(function (b, i) {
      for (var j = 0; j < nvb; j++) skyBox.set([b.min[0], b.min[2], b.max[0], b.max[2]], (i * nvb + j) * 4);
    });
    var skyG = new THREE.BufferGeometry();
    skyG.setAttribute('position', new THREE.BufferAttribute(skyA.pos, 3));
    skyG.setAttribute('aBox', new THREE.BufferAttribute(skyBox, 4));
    skyG.setIndex(new THREE.BufferAttribute(skyA.idx, 1));
    var skyline = new THREE.Mesh(skyG, skyMat);
    skyline.frustumCulled = false;
    skyline.renderOrder = -0.5;
    skyline.userData.kind = 'city-skyline';
    skyline.userData.boxes = skyList;
    skyline.visible = o.skyline !== false;
    group.add(skyline);
    var cullDirty = true;

    var tiles = new Map();
    var dirty = true;
    var layers = { signs: null, glow: null, streak: null, cables: null, holo: null };
    var tones = function (b) {
      return boneRGB(b.kind === 'mast' ? 0.2 : b.kind === 'blade' ? 0.08 : b.tone);
    };

    function addTile(tile) {
      if (tiles.has(tile.key)) removeTile(tile.key);
      var A = boxArrays(tile.boxes, tones);
      var g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(A.pos, 3));
      g.setAttribute('normal', new THREE.BufferAttribute(A.nrm, 3));
      g.setAttribute('color', new THREE.BufferAttribute(A.col, 3));
      g.setAttribute('aSeed', new THREE.BufferAttribute(A.seed, 1));
      g.setAttribute('aFac', new THREE.BufferAttribute(A.fac, 4));
      g.setIndex(new THREE.BufferAttribute(A.idx, 1));
      var cx = tile.x0 + TILE / 2, cz = tile.z0 + TILE / 2, hy = Math.max(1, tile.top) / 2;
      g.boundingBox = new THREE.Box3(new THREE.Vector3(tile.x0, 0, tile.z0), new THREE.Vector3(tile.x0 + TILE, tile.top + 1, tile.z0 + TILE));
      g.boundingSphere = new THREE.Sphere(new THREE.Vector3(cx, hy, cz), Math.hypot(TILE / 2, hy, TILE / 2) + 2);
      var mesh = new THREE.Mesh(g, facadeMat);
      mesh.matrixAutoUpdate = false;
      mesh.userData = { kind: 'city-tile', key: tile.key, ix: tile.ix, iz: tile.iz, boxes: tile.boxes.length, pads: tile.pads };
      mesh.name = 'tile ' + tile.key;
      group.add(mesh);
      tiles.set(tile.key, { tile: tile, mesh: mesh, tris: A.idx.length / 3 });
      dirty = true; cullDirty = true;
    }
    function removeTile(key) {
      var e = tiles.get(key);
      if (!e) return;
      group.remove(e.mesh);
      e.mesh.geometry.dispose();
      tiles.delete(key);
      dirty = true; cullDirty = true;
    }

    var QUAD = new THREE.PlaneGeometry(1, 1);
    var SQUAD = new THREE.PlaneGeometry(1, 2).translate(0.5, 0, 0);
    function dropLayer(k) {
      var m = layers[k];
      if (!m) return;
      group.remove(m);
      m.geometry.dispose();
      layers[k] = null;
    }
    function hueLin(h, gain) {
      var c = h < 0 ? [0.9, 0.93, 0.93] : accLin[Math.min(h, accLin.length - 1)];
      return [c[0] * gain, c[1] * gain, c[2] * gain];
    }
    function hueOut(h, gain) {
      /* the additive shaders write raw values, so they get sRGB numbers */
      var c = h < 0 ? [0.95, 0.97, 0.97] : (function () {
        var x = accHex[Math.min(h, accHex.length - 1)];
        return [((x >> 16) & 255) / 255, ((x >> 8) & 255) / 255, (x & 255) / 255];
      })();
      return [c[0] * gain, c[1] * gain, c[2] * gain];
    }
    function rebuildLayers() {
      ['signs', 'glow', 'streak', 'cables', 'holo'].forEach(dropLayer);
      var sp = [], su = [], sc = [], ss = [], sd = [];
      var gp = [], gs = [], gc = [], gb = [];
      var hp = [], hu = [], hc = [], hs = [], hd = [], hk = [];
      var ta = [], tb = [], tw = [], tc = [];
      var cl = [];
      var lampC = hueOut(-1, 1);
      tiles.forEach(function (e) {
        var t = e.tile, i;
        for (i = 0; i < t.accents.length; i++) {
          var a = t.accents[i];
          var n = a.n, up = [0, 1, 0];
          /* right = up x n, so the quad faces along n */
          var r = [n[2], 0, -n[0]];
          var hw = a.w / 2, hh = a.h / 2, c = a.p;
          var P = [
            [c[0] - r[0] * hw - up[0] * hh, c[1] - hh, c[2] - r[2] * hw],
            [c[0] + r[0] * hw, c[1] - hh, c[2] + r[2] * hw],
            [c[0] + r[0] * hw, c[1] + hh, c[2] + r[2] * hw],
            [c[0] - r[0] * hw, c[1] + hh, c[2] - r[2] * hw]
          ];
          var UV = [[0, 0], [1, 0], [1, 1], [0, 1]];
          var col = hueLin(a.hue, 1);
          [0, 1, 2, 0, 2, 3].forEach(function (k) {
            sp.push(P[k][0], P[k][1], P[k][2]); su.push(UV[k][0], UV[k][1]);
            sc.push(col[0], col[1], col[2]); ss.push(a.w, a.h); sd.push(a.seed);
          });
          var gcol = hueOut(a.hue, a.kind === 'blade' ? 0.2 : 0.12);
          gp.push(c[0] + n[0] * 1.5, c[1], c[2] + n[2] * 1.5);
          gs.push(Math.max(a.w * 2.4, 8), a.h * 1.4); gc.push(gcol[0], gcol[1], gcol[2]); gb.push(0, 0, 1);
        }
        for (i = 0; i < t.lights.length; i++) {
          var L2 = t.lights[i];
          var lc = L2.kind === 'beacon' ? hueOut(-1, 0.8) : hueOut(L2.hue, 0.05);
          gp.push(L2.p[0], L2.p[1], L2.p[2]); gs.push(L2.size, L2.size); gc.push(lc[0], lc[1], lc[2]); gb.push(0, 0, 1);
        }
        /* beacons: red aviation strobes, small; the amber plant lamp dim
           and steady. Red appears nowhere else in the city. */
        var bcs = t.beacons || [];
        for (i = 0; i < bcs.length; i++) {
          var B2 = bcs[i], plant = B2.kind === 'plant';
          var bsz = plant ? 2.5 : (B2.kind === 'landmark' ? 5 : 3.5), bk = plant ? 0.3 : 1.2;
          var bcol = plant ? BEACON_AMBER : BEACON_RED;
          gp.push(B2.p[0], B2.p[1], B2.p[2]); gs.push(bsz, bsz); gc.push(bcol[0] * bk, bcol[1] * bk, bcol[2] * bk);
          gb.push(plant || !(B2.period > 0) ? 2 : 1, B2.phase, B2.period > 0 ? B2.period : 1);
        }
        var hos = t.holograms || [];
        for (i = 0; i < hos.length; i++) {
          var H = hos[i], hw = H.w / 2, hh = H.h / 2, R0 = H.right, U0 = H.up, q = H.p;
          var hx = accHex[Math.min(H.hue, accHex.length - 1)], hcol = holoRGB(hx, H.sat == null ? HOLO_SAT : H.sat);
          var HP = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(function (k) {
            return [q[0] + R0[0] * hw * k[0] + U0[0] * hh * k[1], q[1] + U0[1] * hh * k[1], q[2] + R0[2] * hw * k[0] + U0[2] * hh * k[1]];
          });
          var HUV = [[0, 0], [1, 0], [1, 1], [0, 1]];
          [0, 1, 2, 0, 2, 3].forEach(function (k) {
            hp.push(HP[k][0], HP[k][1], HP[k][2]); hu.push(HUV[k][0], HUV[k][1]);
            hc.push(hcol[0] * HOLO_GAIN, hcol[1] * HOLO_GAIN, hcol[2] * HOLO_GAIN); hs.push(H.w, H.h); hd.push(H.seed); hk.push((H.speed || 5) * (H.dir || 1));
          });
        }
        for (i = 0; i < t.streets.length; i++) {
          var s = t.streets[i];
          var ax = s.b[0] !== s.a[0] ? 0 : 2, off = HALF_ST - 2.5;
          for (var side = -1; side <= 1; side += 2) {
            var A = s.a.slice(), B = s.b.slice();
            var oa = ax === 0 ? 2 : 0;
            A[oa] += side * off; B[oa] += side * off; A[1] = B[1] = 0.6;
            ta.push(A[0], A[1], A[2]); tb.push(B[0], B[1], B[2]); tw.push(1.6, 0); tc.push(lampC[0] * 0.3, lampC[1] * 0.3, lampC[2] * 0.3);
          }
        }
        for (i = 0; i < t.cables.length; i++) {
          var cb = t.cables[i], prev = null;
          for (var k = 0; k <= 10; k++) {
            var u = k / 10;
            var pt = [cb.a[0] + (cb.b[0] - cb.a[0]) * u, cb.a[1] + (cb.b[1] - cb.a[1]) * u - cb.sag * 4 * u * (1 - u), cb.a[2] + (cb.b[2] - cb.a[2]) * u];
            if (prev) cl.push(prev[0], prev[1], prev[2], pt[0], pt[1], pt[2]);
            prev = pt;
          }
        }
      });
      if (sp.length) {
        var g1 = new THREE.BufferGeometry();
        g1.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
        g1.setAttribute('aUv', new THREE.Float32BufferAttribute(su, 2));
        g1.setAttribute('aCol', new THREE.Float32BufferAttribute(sc, 3));
        g1.setAttribute('aSize', new THREE.Float32BufferAttribute(ss, 2));
        g1.setAttribute('aSeed', new THREE.Float32BufferAttribute(sd, 1));
        layers.signs = new THREE.Mesh(g1, signMat);
        layers.signs.frustumCulled = false;
        layers.signs.userData.kind = 'city-signs';
        group.add(layers.signs);
      }
      if (gp.length) {
        var g2 = new THREE.InstancedBufferGeometry();
        g2.index = QUAD.index; g2.setAttribute('position', QUAD.getAttribute('position')); g2.setAttribute('uv', QUAD.getAttribute('uv'));
        g2.setAttribute('iPos', new THREE.InstancedBufferAttribute(new Float32Array(gp), 3));
        g2.setAttribute('iSize', new THREE.InstancedBufferAttribute(new Float32Array(gs), 2));
        g2.setAttribute('iCol', new THREE.InstancedBufferAttribute(new Float32Array(gc), 3));
        g2.setAttribute('iBlink', new THREE.InstancedBufferAttribute(new Float32Array(gb), 3));
        g2.instanceCount = gp.length / 3;
        layers.glow = new THREE.Mesh(g2, glowMat);
        layers.glow.frustumCulled = false;
        layers.glow.renderOrder = 2;
        layers.glow.userData.kind = 'city-glow';
        group.add(layers.glow);
      }
      if (hp.length) {
        var g5 = new THREE.BufferGeometry();
        g5.setAttribute('position', new THREE.Float32BufferAttribute(hp, 3));
        g5.setAttribute('aUv', new THREE.Float32BufferAttribute(hu, 2));
        g5.setAttribute('aCol', new THREE.Float32BufferAttribute(hc, 3));
        g5.setAttribute('aSize', new THREE.Float32BufferAttribute(hs, 2));
        g5.setAttribute('aSeed', new THREE.Float32BufferAttribute(hd, 1));
        g5.setAttribute('aTick', new THREE.Float32BufferAttribute(hk, 1));
        layers.holo = new THREE.Mesh(g5, holoMat);
        layers.holo.frustumCulled = false;
        layers.holo.renderOrder = 3;
        layers.holo.userData.kind = 'city-holograms';
        layers.holo.userData.count = hp.length / 18;
        group.add(layers.holo);
      }
      if (ta.length) {
        var g3 = new THREE.InstancedBufferGeometry();
        g3.index = SQUAD.index; g3.setAttribute('position', SQUAD.getAttribute('position'));
        g3.setAttribute('iA', new THREE.InstancedBufferAttribute(new Float32Array(ta), 3));
        g3.setAttribute('iB', new THREE.InstancedBufferAttribute(new Float32Array(tb), 3));
        g3.setAttribute('iW', new THREE.InstancedBufferAttribute(new Float32Array(tw), 2));
        g3.setAttribute('iCol', new THREE.InstancedBufferAttribute(new Float32Array(tc), 3));
        g3.instanceCount = ta.length / 3;
        layers.streak = new THREE.Mesh(g3, streakMat);
        layers.streak.frustumCulled = false;
        layers.streak.renderOrder = 1;
        layers.streak.userData.kind = 'city-streaks';
        group.add(layers.streak);
      }
      if (cl.length) {
        var g4 = new THREE.BufferGeometry();
        g4.setAttribute('position', new THREE.Float32BufferAttribute(cl, 3));
        layers.cables = new THREE.LineSegments(g4, cableMat);
        layers.cables.frustumCulled = false;
        layers.cables.userData.kind = 'city-cables';
        group.add(layers.cables);
      }
      dirty = false;
    }

    /* update(cam, dt, t): cam the camera position (THREE.Vector3), dt the
       frame time in seconds, t the simulation time in seconds. The city
       life (window life, crown breathing, beacons, holograms) runs on t
       when it is a finite number, else on its own clock summed from dt,
       so the old call update(cam, dt) keeps everything moving. */
    function update(cam, dt, t) {
      if (typeof t === 'number' && isFinite(t)) clock = t;
      else if (typeof dt === 'number' && isFinite(dt)) clock += dt;
      timeU.value = clock;
      if (dirty) rebuildLayers();
      if (cullDirty) {
        var r = loadedRect(tiles.keys());
        skyMat.uniforms.uCull.value.set(r[0], r[1], r[2], r[3]);
        cullDirty = false;
      }
      if (cam) {
        skyline.position.set(cam.x, 0, cam.z);
        skyline.updateMatrixWorld();
      }
    }
    function stats() {
      var tris = 0, boxes = 0;
      tiles.forEach(function (e) { tris += e.tris; boxes += e.tile.boxes.length; });
      return { tiles: tiles.size, tris: tris, boxes: boxes };
    }
    function dispose() {
      tiles.forEach(function (e, k) { removeTile(k); });
      ['signs', 'glow', 'streak', 'cables', 'holo'].forEach(dropLayer);
      skyG.dispose(); QUAD.dispose(); SQUAD.dispose();
      [facadeMat, signMat, glowMat, holoMat, streakMat, cableMat, skyMat].forEach(function (m) { m.dispose(); });
      lutTex.dispose();
      if (group.parent) group.parent.remove(group);
    }
    return {
      group: group, fog: fog, facadeMaterial: facadeMat, skyline: skyline, tiles: tiles,
      addTile: addTile, removeTile: removeTile, has: function (k) { return tiles.has(k); },
      update: update, stats: stats, dispose: dispose,
      /* setLife({ liveliness, windowLife, beacons }): the shader side of
         the city life, live; holograms and beacons come with the tiles
         (makeCity options). time(): the life clock in seconds. */
      setLife: setLife, time: function () { return clock; }
    };
  }

  var HikyakuCity = {
    TILE: TILE, PITCH: PITCH, STREET: STREET, BLOCK: BLOCK, LANE_Y: LANE_Y, LANE_CLEAR: LANE_CLEAR, DEF: DEF,
    hash: hash, hashU: hashU, rng: rng, noise2: noise2, fbm: fbm, heightField: heightField,
    STOREY: STOREY, ARCHES: ARCHES, ARCH_W: ARCH_W, LM_CELL: LM_CELL, LM_NEAR: LM_NEAR, LM_FAR: LM_FAR,
    districtAt: districtAt, landmarkAt: landmarkAt, pickArch: pickArch, rank3: rank3,
    tileKey: tileKey, tileOf: tileOf, inLaneBand: inLaneBand, boxDist: boxDist, boxesOverlap: boxesOverlap,
    makeTile: makeTile, tilesAround: tilesAround, wanted: wanted, makeCity: makeCity, findCanyon: findCanyon,
    boneRGB: boneRGB, windowLUT: windowLUT, toLin: toLin, LUT_BANDS: LUT_BANDS,
    FACADE_PROGRAMS: FACADE_PROGRAMS, facadeCover: facadeCover, facadeNear: facadeNear, facadeParams: facadeParams,
    FAC_GLASS: FAC_GLASS, FAC_FRAME: FAC_FRAME, FAC_TINT: FAC_TINT, FAC_DIM: FAC_DIM, facadeLight: facadeLight,
    FOG_MED: FOG_MED, fogTau: fogTau, skylineBoxes: skylineBoxes, loadedRect: loadedRect, skylineHidden: skylineHidden, fogTauInf: fogTauInf, WEATHER: WEATHER, weatherAt: weatherAt,
    HOLO_P: HOLO_P, HOLO_SAT: HOLO_SAT, HOLO_INSET: HOLO_INSET, HOLO_SPEED: HOLO_SPEED, HOLO_SIMILAR: HOLO_SIMILAR, HOLO_GAP: HOLO_GAP, HOLO_MIN_TOP: HOLO_MIN_TOP, BEACON_TALL: BEACON_TALL,
    holoRGB: holoRGB, hsvSat: hsvSat, rateOf: rateOf, lifeRate: lifeRate, LIFE_T: LIFE_T, lifeSpeed: lifeSpeed, facadeTexel: facadeTexel,
    makeFog: makeFog, makeSky: makeSky, makeCityRenderer: makeCityRenderer
  };
  globalThis.HikyakuCity = HikyakuCity;
})();
