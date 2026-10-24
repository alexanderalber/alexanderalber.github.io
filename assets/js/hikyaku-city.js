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
    density: 0.85,        /* share of lots that get a building */
    maxH: 260, minH: 20,  /* top of anything, including masts */
    accents: 2,           /* number of neon hues, 0 to 2 */
    roofGap: 15,          /* roof below the tube bottom, metres */
    margin: 3,            /* extra metres outside the tube radius */
    core: null,           /* [x, z] of the tall district, or null */
    coreR: 1600,
    reserved: null        /* [{ min, max }] world boxes kept empty */
  };

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
     core. */
  function heightField(x, z, C) {
    var n = fbm(x / 650, z / 650, C.seed + 11, 4);
    var t = Math.pow(clamp((n - 0.26) / 0.4, 0, 1), 1.2);
    var f;
    if (C.core) {
      var dx = x - C.core[0], dz = z - C.core[1];
      f = 0.25 + 0.85 * Math.exp(-(dx * dx + dz * dz) / (C.coreR * C.coreR));
    } else f = 0.3 + 0.7 * smooth(0.36, 0.64, fbm(x / 2400, z / 2400, C.seed + 101, 2));
    return t * f;
  }

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
       boxes:   [{ min, max, c, half, idx, tone, seed, kind, g }]
                kind 'tier' | 'ledge' | 'roof' | 'mast' | 'deck' | 'balcony'
                     | 'bridge' | 'blade'; g the building it belongs to
       lots:    { total, built, empty, lowered, cut, dropped, boxDrops }
       lights:  [{ p, size, kind: 'beacon' | 'haze', hue }]
       accents: [{ p, n, w, h, hue, seed, kind: 'flat' | 'blade' }]
       pads:    [{ p, n, w, d, kind: 'roof' | 'balcony' | 'deck' }]
       cables:  [{ a, b, sag }]
       bridges: [box index]
       streets: [{ a, b }]   street centre lines, for the lamp lines
       top }
     Content depends only on (ix, iz, seed), the route's tube and opts, so a
     tile comes out the same in any load order. */
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

    /* Highest roof a footprint may carry. -Infinity: nothing may stand. */
    function capFor(rx0, rz0, rx1, rz1) {
      var cap = C.maxH, k;
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
    var gId = 0;
    function mk(bx0, by0, bz0, bx1, by1, bz1, tone, sd, kind, g) {
      return { min: [bx0, by0, bz0], max: [bx1, by1, bz1], tone: tone, seed: sd, kind: kind, g: g };
    }

    /* A tower with setbacks, ported from citygen addTower: 1 to 4 tiers,
       each narrower, a ledge slab at every setback, roof clutter and maybe
       a mast. All boxes axis aligned (the contact code wants that). */
    function tower(cx, cz, w, d, h, cap, tone, sd, g, flatRoof) {
      var out = [], tiers = [];
      var nt = h > 90 ? R.int(2, 4) : (h > 45 ? R.int(1, 2) : 1);
      var cw = w, cd = d, cy = 0, rem = h;
      for (var t = 0; t < nt; t++) {
        var last = t === nt - 1;
        var th = last ? rem : Math.max(18, rem * R.range(0.35, 0.6));
        tiers.push({ x0: cx - cw / 2, x1: cx + cw / 2, z0: cz - cd / 2, z1: cz + cd / 2, y0: cy, y1: cy + th });
        out.push(mk(cx - cw / 2, cy, cz - cd / 2, cx + cw / 2, cy + th, cz + cd / 2, tone + R.range(-0.03, 0.03), sd, 'tier', g));
        cy += th; rem -= th;
        if (rem <= 4) break;
        out.push(mk(cx - cw / 2 - 0.4, cy, cz - cd / 2 - 0.4, cx + cw / 2 + 0.4, cy + 0.8, cz + cd / 2 + 0.4, tone * 0.7, sd, 'ledge', g));
        cw *= R.range(0.62, 0.86); cd *= R.range(0.62, 0.9);
      }
      var top = tiers[tiers.length - 1], ty = top.y1;
      var tw = top.x1 - top.x0, tdp = top.z1 - top.z0;
      if (!flatRoof) {
        var k = R.int(1, 4);
        for (var i = 0; i < k; i++) {
          var bw = R.range(2, Math.max(2.5, tw * 0.4)), bd = R.range(2, Math.max(2.5, tdp * 0.4));
          var bx = cx + R.range(-1, 1) * (tw - bw) * 0.5, bz = cz + R.range(-1, 1) * (tdp - bd) * 0.5;
          var bh = Math.min(R.range(1.5, 5), Math.max(0.5, cap - ty));
          out.push(mk(bx - bw / 2, ty, bz - bd / 2, bx + bw / 2, ty + bh, bz + bd / 2, tone * 0.8, sd, 'roof', g));
        }
        if (R.chance(0.5)) {
          var mh = R.range(8, 30), mx = cx + R.range(-0.3, 0.3) * tw;
          if (ty + mh <= cap) out.push(mk(mx - 0.18, ty, cz - 0.18, mx + 0.18, ty + mh, cz + 0.18, 0.2, sd, 'mast', g));
        }
      }
      return { boxes: out, tiers: tiers, top: ty };
    }

    /* Lot placement with the tube rule. */
    function placeLot(lx0, lz0, lx1, lz1, depth, block) {
      lots.total++;
      if (!R.chance(C.density)) { lots.empty++; return; }
      var cap = capFor(lx0, lz0, lx1, lz1);
      var w = lx1 - lx0, d = lz1 - lz0;
      if (cap < C.minH * 0.6 + 6) {
        if (depth === 0 && w >= 32 && d >= 32) {
          lots.cut++;
          lots.total--;
          var mx = (lx0 + lx1) / 2, mz = (lz0 + lz1) / 2, gap = 2.5;
          placeLot(lx0, lz0, mx - gap, mz - gap, 1, block);
          placeLot(mx + gap, lz0, lx1, mz - gap, 1, block);
          placeLot(lx0, mz + gap, mx - gap, lz1, 1, block);
          placeLot(mx + gap, mz + gap, lx1, lz1, 1, block);
        } else lots.dropped++;
        return;
      }
      var cx = (lx0 + lx1) / 2, cz = (lz0 + lz1) / 2;
      var g = gId++, sd = R();
      var tone = R.range(0.15, 0.34);
      var res;
      if (w >= 30 && d >= 30 && R.chance(0.07)) {
        /* parking deck: low, wide, flat, a landing pad on top */
        var dh = Math.min(R.range(14, 26), cap);
        var dw = w - R.range(2, 5), dd = d - R.range(2, 5);
        res = { boxes: [mk(cx - dw / 2, 0, cz - dd / 2, cx + dw / 2, dh, cz + dd / 2, tone * 0.8, sd, 'deck', g)],
          tiers: [{ x0: cx - dw / 2, x1: cx + dw / 2, z0: cz - dd / 2, z1: cz + dd / 2, y0: 0, y1: dh }], top: dh, deck: true };
      } else {
        var hf = heightField(cx, cz, C);
        var h = C.minH + (C.maxH - C.minH) * hf * R.range(0.55, 1.12);
        if (R.chance(0.05)) h *= 1.7;
        h = Math.min(h, C.maxH - 6);
        if (h > cap - 6) { h = cap - 6; lots.lowered++; }
        if (h < 8) { lots.dropped++; return; }
        var tw = w - R.range(2, 7), td = d - R.range(2, 7);
        var flat = tw >= 22 && td >= 22 && R.chance(0.35);
        res = tower(cx, cz, tw, td, h, Math.min(cap, C.maxH), tone, sd, g, flat);
        res.flat = flat;
      }
      /* the guarantee, building by building */
      for (var k = 0; k < res.boxes.length; k++) {
        if (!clear(res.boxes[k])) { lots.dropped++; return; }
      }
      lots.built++;
      var b = { g: g, cx: cx, cz: cz, tiers: res.tiers, top: res.top, seed: sd, tone: tone, block: block };
      buildings.push(b);
      for (k = 0; k < res.boxes.length; k++) boxes.push(res.boxes[k]);
      var tt = res.tiers[res.tiers.length - 1], tw2 = tt.x1 - tt.x0, td2 = tt.z1 - tt.z0;
      if (res.deck) pads.push({ p: [cx, res.top, cz], n: [0, 1, 0], w: tw2, d: td2, kind: 'deck' });
      else if (res.flat && tw2 >= 20 && td2 >= 20) pads.push({ p: [cx, res.top, cz], n: [0, 1, 0], w: tw2, d: td2, kind: 'roof' });
      if (res.top > 150) lights.push({ p: [cx, res.top + 2, cz], size: 6, kind: 'beacon', hue: -1 });
    }

    /* 2 x 2 blocks, each 1, 2 or 4 lots. */
    for (var bxI = 0; bxI < 2; bxI++) {
      for (var bzI = 0; bzI < 2; bzI++) {
        var bx0 = x0 + HALF_ST + bxI * TILE / 2, bz0 = z0 + HALF_ST + bzI * TILE / 2;
        var bx1 = bx0 + BLOCK, bz1 = bz0 + BLOCK, blk = bxI + 2 * bzI;
        var r = R(), al = R.range(4, 8) / 2;
        var split = r < 0.2 ? 1 : (r < 0.55 ? 2 : 4);
        if (split === 1) placeLot(bx0, bz0, bx1, bz1, 0, blk);
        else if (split === 2) {
          var along = R.chance(0.5), m = (along ? bx0 + bx1 : bz0 + bz1) / 2 + R.range(-8, 8);
          if (along) { placeLot(bx0, bz0, m - al, bz1, 0, blk); placeLot(m + al, bz0, bx1, bz1, 0, blk); }
          else { placeLot(bx0, bz0, bx1, m - al, 0, blk); placeLot(bx0, m + al, bx1, bz1, 0, blk); }
        } else {
          var mxx = (bx0 + bx1) / 2 + R.range(-6, 6), mzz = (bz0 + bz1) / 2 + R.range(-6, 6);
          placeLot(bx0, bz0, mxx - al, mzz - al, 0, blk);
          placeLot(mxx + al, bz0, bx1, mzz - al, 0, blk);
          placeLot(bx0, mzz + al, mxx - al, bz1, 0, blk);
          placeLot(mxx + al, mzz + al, bx1, bz1, 0, blk);
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
        var b;
        if (f[0]) {
          var fx = f[0] > 0 ? t0.x1 : t0.x0, zc = (t0.z0 + t0.z1) / 2;
          b = mk(Math.min(fx, fx + f[0] * pr), y - 1.2, zc - bw / 2, Math.max(fx, fx + f[0] * pr), y, zc + bw / 2, bd.tone * 0.7, bd.seed, 'balcony', bd.g);
        } else {
          var fz = f[1] > 0 ? t0.z1 : t0.z0, xc = (t0.x0 + t0.x1) / 2;
          b = mk(xc - bw / 2, y - 1.2, Math.min(fz, fz + f[1] * pr), xc + bw / 2, y, Math.max(fz, fz + f[1] * pr), bd.tone * 0.7, bd.seed, 'balcony', bd.g);
        }
        if (addExtra(b)) {
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
    function tierAt(bd, y0, y1) {
      for (var i = 0; i < bd.tiers.length; i++) {
        var t = bd.tiers[i];
        if (t.y0 <= y0 && t.y1 >= y1) return t;
      }
      return null;
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
            var ta = tierAt(A, by, by + bh2), tb = tierAt(B, by, by + bh2);
            if (!ta || !tb) continue;
            var lo = axis === 0 ? Math.max(ta.z0, tb.z0) : Math.max(ta.x0, tb.x0);
            var hi = axis === 0 ? Math.min(ta.z1, tb.z1) : Math.min(ta.x1, tb.x1);
            if (hi - lo < bw2 + 4) continue;
            var cc = R.range(lo + bw2 / 2 + 2, hi - bw2 / 2 - 2);
            var bx = axis === 0
              ? mk(ta.x1, by, cc - bw2 / 2, tb.x0, by + bh2, cc + bw2 / 2, R.range(0.2, 0.32), R(), 'bridge', -1)
              : mk(cc - bw2 / 2, by, ta.z1, cc + bw2 / 2, by + bh2, tb.z0, R.range(0.2, 0.32), R(), 'bridge', -1);
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
          var t1 = tierAt(A, Math.max(ya, yb), Math.max(ya, yb)), t2 = tierAt(B, Math.max(ya, yb), Math.max(ya, yb));
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
      cables: cables, bridges: bridges, streets: streets, top: top
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

  /* Height fog shared by every material of the page: exponential in
     distance, its colour mixed between low and high by the height of the
     fogged point. fog.patch(mat, opts) teaches a built-in material the same
     fog (and, with opts.facade, the window shader). The uniforms hold sRGB
     numbers, because three mixes fog after the colour-space conversion. */
  var FOG_DECL = [
    'uniform float cgFogDensity; uniform vec3 cgFogLow; uniform vec3 cgFogHigh; uniform vec2 cgFogH;',
    'vec3 cgFogColor(float y){ return mix(cgFogLow, cgFogHigh, clamp((y - cgFogH.x)/(cgFogH.y - cgFogH.x), 0.0, 1.0)); }',
    'float cgFogAmt(float d, float k){ return 1.0 - exp(-cgFogDensity * d * k); }'
  ].join('\n');

  function makeFog(THREE) {
    var U = {
      cgFogDensity: { value: 0.0034 },
      cgFogLow: { value: new THREE.Color() },
      cgFogHigh: { value: new THREE.Color() },
      cgFogH: { value: new THREE.Vector2(0, 420) }
    };
    var lowT = 0.56, highT = 0.16;
    function set(o) {
      if (o.density != null) U.cgFogDensity.value = o.density;
      if (o.low != null) lowT = o.low;
      if (o.high != null) highT = o.high;
      var a = boneRGB(lowT), b = boneRGB(highT);
      U.cgFogLow.value.setRGB(a[0], a[1], a[2]);
      U.cgFogHigh.value.setRGB(b[0], b[1], b[2]);
      if (o.h0 != null || o.h1 != null) U.cgFogH.value.set(o.h0 == null ? U.cgFogH.value.x : o.h0, o.h1 == null ? U.cgFogH.value.y : o.h1);
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
            (fac ? 'varying vec3 vCgWNrm; attribute float aSeed; flat varying float vSeed;\n' : ''))
          .replace('#include <project_vertex>', '#include <project_vertex>\n{\n' +
            '  vec4 cgw = vec4(transformed, 1.0);\n' +
            '  #ifdef USE_INSTANCING\n  cgw = instanceMatrix * cgw;\n  #endif\n' +
            '  vCgWPos = (modelMatrix * cgw).xyz;\n' +
            (fac ? '  vCgWNrm = normalize(mat3(modelMatrix) * objectNormal);\n  vSeed = aSeed;\n' : '') +
            '}');
        sh.fragmentShader = sh.fragmentShader
          .replace('#include <common>', '#include <common>\nvarying vec3 vCgWPos;\nuniform float cgFogK; uniform float cgFogTint;\n' + FOG_DECL + '\n' +
            (fac ? 'varying vec3 vCgWNrm; flat varying float vSeed;\nuniform sampler2D uLUT; uniform vec3 uLutMean; uniform vec2 uCell; uniform vec2 uFrame; uniform float uWinGain; uniform float uLutSize; uniform float uRoofDark;\n' : ''))
          .replace('#include <fog_fragment>', '#ifdef USE_FOG\n{\n' +
            '  float cgd = length(vCgWPos - cameraPosition);\n' +
            '  float cgf = cgFogAmt(cgd, cgFogK);\n' +
            '  gl_FragColor.rgb = mix(gl_FragColor.rgb, cgFogColor(vCgWPos.y) * cgFogTint, cgf);\n' +
            '}\n#endif');
        if (fac) sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n' + FACADE_FRAG);
      };
      var key = 'hkc' + (fac ? 'F' : 'P') + fogK + '_' + fogTint + '_' + (++nKey);
      mat.customProgramCacheKey = function () { return key.replace(/_\d+$/, ''); };
      mat.needsUpdate = true;
      return mat;
    }
    return { uniforms: U, set: set, patch: patch };
  }

  /* The window shader, from citygen. Windows are a grid in world
     coordinates, so a 260 m tower and a 6 m roof box get the same window
     size. Each window cell looks up a lit/dark colour in a small table,
     offset per building. Far away, where a cell gets smaller than a pixel,
     the pattern fades into its exact mean (coverage times the table mean),
     the idea of the arcov3 facade: a level change alters resolution, not
     the picture, so there is no shimmer and no popping. */
  var FACADE_FRAG = [
    '{',
    '  vec3 n = normalize(vCgWNrm);',
    '  float wall = 1.0 - step(0.6, abs(n.y));',
    '  vec2 fu = vec2(abs(n.x) > 0.5 ? vCgWPos.z : vCgWPos.x, vCgWPos.y);',
    '  vec2 cs = uCell * vec2(mix(0.75, 1.45, fract(vSeed * 7.13)), mix(0.9, 1.2, fract(vSeed * 3.71)));',
    '  vec2 g = fu / cs;',
    '  vec2 cid = floor(g);',
    '  vec2 f = fract(g);',
    '  vec2 fw = max(fwidth(g), vec2(1e-4));',
    '  vec2 lo = smoothstep(uFrame - fw, uFrame + fw, f);',
    '  vec2 hi = 1.0 - smoothstep(1.0 - uFrame - fw, 1.0 - uFrame + fw, f);',
    '  float win = lo.x * hi.x * lo.y * hi.y;',
    '  float cover = (1.0 - 2.0 * uFrame.x) * (1.0 - 2.0 * uFrame.y);',
    '  float aa = clamp(max(fw.x, fw.y) * 1.2 - 0.2, 0.0, 1.0);',
    '  float rowH = fract(sin(dot(vec2(cid.y, floor(vSeed * 911.0)), vec2(12.9898, 78.233))) * 43758.5453);',
    '  float pierN = 3.0 + floor(fract(vSeed * 5.3) * 4.0);',
    '  float blank = step(rowH, 0.10) + step(mod(cid.x, pierN), 0.5) * step(0.5, fract(vSeed * 2.9));',
    '  win *= 1.0 - clamp(blank, 0.0, 1.0);',
    '  cover *= 0.85;',
    '  win = mix(win, cover, aa);',
    '  vec2 sid = cid + floor(vec2(vSeed * 53.0, vSeed * 97.0));',
    '  vec3 lut = mix(texture2D(uLUT, (sid + 0.5) / uLutSize).rgb * 2.0, uLutMean, aa);',
    '  float slab = smoothstep(0.0, fw.y * 2.0 + 0.02, f.y) * (1.0 - aa) + aa;',
    '  diffuseColor.rgb *= mix(1.0, 0.4, win * wall) * mix(0.75, 1.0, slab);',
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
    '}'
  ].join('\n');

  /* One texel per window cell: mostly dim, sparse lit cells, lit rows
     clustered by floor, a muted warm share, a few accent windows. Returns
     the texel bytes and their mean, as the shader reads them (x 2). */
  function windowLUT(seed, o) {
    var size = o.size || 64, lit = o.lit == null ? 0.04 : o.lit, rowLit = o.rowLit == null ? 0.08 : o.rowLit;
    var accents = o.accents || [], accentRate = o.accentRate == null ? 0.0015 : o.accentRate, warm = o.warm == null ? 0.25 : o.warm;
    var R = rng(seed), data = new Uint8Array(size * size * 4), sum = [0, 0, 0];
    for (var y = 0; y < size; y++) {
      var rowOn = R() < rowLit, rowStart = R.int(0, size), rowLen = R.int(3, 14);
      for (var x = 0; x < size; x++) {
        var i = (y * size + x) * 4, c, r = R();
        var inRow = rowOn && ((x - rowStart + size) % size) < rowLen;
        if (accents.length && r < accentRate) {
          var a = accents[Math.floor(R() * accents.length)];
          c = [a[0] * 0.8, a[1] * 0.8, a[2] * 0.8];
        } else if (r < lit || (inRow && R() < 0.8)) {
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
          sum[j] += toLin(byte / 255) * 2;
        }
        data[i + 3] = 255;
      }
    }
    var nn = size * size;
    return { data: data, size: size, mean: [sum[0] / nn, sum[1] / nn, sum[2] / nn] };
  }

  /* Background sphere showing exactly the far end of the height fog. */
  function makeSky(THREE, fog, radius) {
    var m = new THREE.ShaderMaterial({
      uniforms: fog.uniforms,
      vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }',
      fragmentShader: FOG_DECL + '\nvarying vec3 vDir;\nvoid main(){\n  float R = 3.0 / cgFogDensity;\n  vec3 d = normalize(vDir);\n' +
        '  gl_FragColor = vec4(cgFogColor(cameraPosition.y + d.y * R), 1.0);\n}',
      side: THREE.BackSide, depthWrite: false, fog: false
    });
    var s = new THREE.Mesh(new THREE.SphereGeometry(radius || 9000, 32, 16), m);
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
  /* Merged box arrays: position, normal, linear tint, building seed. */
  function boxArrays(list, toneOf) {
    var nf = 0, i, f, k;
    for (i = 0; i < list.length; i++) nf += list[i].min[1] > 0.05 ? 6 : 5;
    var pos = new Float32Array(nf * 12), nrm = new Float32Array(nf * 12), col = new Float32Array(nf * 12), sd = new Float32Array(nf * 4);
    var big = nf * 4 > 65535, idx = big ? new Uint32Array(nf * 6) : new Uint16Array(nf * 6);
    var v = 0, q = 0;
    for (i = 0; i < list.length; i++) {
      var b = list[i], lo = b.min, hi = b.max;
      var rgb = toneOf(b), lr = toLin(rgb[0]), lg = toLin(rgb[1]), lb = toLin(rgb[2]);
      var nfb = lo[1] > 0.05 ? 6 : 5;
      for (f = 0; f < nfb; f++) {
        var F = FACE[f], n = F[4];
        for (k = 0; k < 4; k++) {
          var c = F[k], o = (v + k) * 3;
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
    return { pos: pos, nrm: nrm, col: col, seed: sd, idx: idx };
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
      var h = 40 + Math.pow(R(), 1.8) * 420 * (0.5 + 0.5 * fbm(Math.cos(a) * 3, Math.sin(a) * 3, seed, 2));
      var x = Math.cos(a) * rr, z = Math.sin(a) * rr;
      out.push({ min: [x - w / 2, 0, z - d / 2], max: [x + w / 2, h, z + d / 2], seed: R(), tone: 0 });
    }
    return out;
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
    var L = windowLUT(seed ^ 0x2077, { lit: 0.04, rowLit: 0.08, accents: accSrgb, accentRate: 0.0015 });
    var lutTex = new THREE.DataTexture(L.data, L.size, L.size, THREE.RGBAFormat);
    lutTex.wrapS = lutTex.wrapT = THREE.RepeatWrapping;
    lutTex.magFilter = lutTex.minFilter = THREE.NearestFilter;
    lutTex.colorSpace = THREE.SRGBColorSpace;
    lutTex.needsUpdate = true;
    var facade = {
      uniforms: {
        uLUT: { value: lutTex }, uLutSize: { value: L.size },
        uLutMean: { value: new THREE.Vector3(L.mean[0], L.mean[1], L.mean[2]) },
        uCell: { value: new THREE.Vector2(1.0, 2.6) }, uFrame: { value: new THREE.Vector2(0.16, 0.25) },
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
        '  vFog = cgFogAmt(length(w.xyz - cameraPosition), uFogK); vFogC = cgFogColor(w.y);',
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
      side: THREE.DoubleSide, toneMapped: false, fog: false
    });

    /* additive glow billboards (faked bloom), from citygen GlowLayer */
    var glowMat = new THREE.ShaderMaterial({
      uniforms: Object.assign({ uFogK: { value: 0.5 }, uFall: { value: 3.5 } }, fog.uniforms),
      vertexShader: [
        FOG_DECL, 'uniform float uFogK;',
        'attribute vec3 iPos; attribute vec2 iSize; attribute vec3 iCol;',
        'varying vec2 vUv; varying vec3 vCol;',
        'void main(){',
        '  vec4 mv = viewMatrix * vec4(iPos, 1.0);',
        '  mv.xy += position.xy * iSize;',
        '  vUv = uv;',
        '  vCol = iCol * (1.0 - cgFogAmt(length(mv.xyz), uFogK));',
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
        '  vCol = iCol * (1.0 - cgFogAmt(length(toCam), uFogK)) * (iW.x / wpx);',
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

    /* skyline */
    var skyMat = new THREE.ShaderMaterial({
      uniforms: Object.assign({ uDark: { value: 0.9 } }, fog.uniforms),
      vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
      /* the sky colour in that direction (as makeSky computes it), a little
         darker: a silhouette in the haze. Near the ground it takes the low
         fog colour instead, so the boxes stand on the fogged ground rather
         than float above it. */
      fragmentShader: FOG_DECL + '\nuniform float uDark; varying vec3 vW;\nvoid main(){\n' +
        '  vec3 d = normalize(vW - cameraPosition);\n' +
        '  vec3 sky = cgFogColor(cameraPosition.y + d.y * 3.0 / cgFogDensity);\n' +
        '  vec3 c = mix(cgFogColor(vW.y), sky, smoothstep(0.0, 160.0, vW.y));\n' +
        '  gl_FragColor = vec4(c * uDark, 1.0);\n}',
      fog: false
    });
    var skyR = o.skylineR || 1750;
    var skyA = boxArrays(skylineBoxes(seed, skyR), function () { return [0, 0, 0]; });
    var skyG = new THREE.BufferGeometry();
    skyG.setAttribute('position', new THREE.BufferAttribute(skyA.pos, 3));
    skyG.setIndex(new THREE.BufferAttribute(skyA.idx, 1));
    var skyline = new THREE.Mesh(skyG, skyMat);
    skyline.frustumCulled = false;
    skyline.renderOrder = -0.5;
    skyline.userData.kind = 'city-skyline';
    skyline.visible = o.skyline !== false;
    group.add(skyline);

    var tiles = new Map();
    var dirty = true;
    var layers = { signs: null, glow: null, streak: null, cables: null };
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
      dirty = true;
    }
    function removeTile(key) {
      var e = tiles.get(key);
      if (!e) return;
      group.remove(e.mesh);
      e.mesh.geometry.dispose();
      tiles.delete(key);
      dirty = true;
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
      ['signs', 'glow', 'streak', 'cables'].forEach(dropLayer);
      var sp = [], su = [], sc = [], ss = [], sd = [];
      var gp = [], gs = [], gc = [];
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
          gs.push(Math.max(a.w * 2.4, 8), a.h * 1.4); gc.push(gcol[0], gcol[1], gcol[2]);
        }
        for (i = 0; i < t.lights.length; i++) {
          var L2 = t.lights[i];
          var lc = L2.kind === 'beacon' ? hueOut(-1, 0.8) : hueOut(L2.hue, 0.05);
          gp.push(L2.p[0], L2.p[1], L2.p[2]); gs.push(L2.size, L2.size); gc.push(lc[0], lc[1], lc[2]);
        }
        for (i = 0; i < t.streets.length; i++) {
          var s = t.streets[i];
          var ax = s.b[0] !== s.a[0] ? 0 : 2, off = HALF_ST - 2.5;
          for (var side = -1; side <= 1; side += 2) {
            var A = s.a.slice(), B = s.b.slice();
            var oa = ax === 0 ? 2 : 0;
            A[oa] += side * off; B[oa] += side * off; A[1] = B[1] = 0.6;
            ta.push(A[0], A[1], A[2]); tb.push(B[0], B[1], B[2]); tw.push(1.6, 0); tc.push(lampC[0] * 0.1, lampC[1] * 0.1, lampC[2] * 0.1);
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
        g2.instanceCount = gp.length / 3;
        layers.glow = new THREE.Mesh(g2, glowMat);
        layers.glow.frustumCulled = false;
        layers.glow.renderOrder = 2;
        layers.glow.userData.kind = 'city-glow';
        group.add(layers.glow);
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

    function update(cam) {
      if (dirty) rebuildLayers();
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
      ['signs', 'glow', 'streak', 'cables'].forEach(dropLayer);
      skyG.dispose(); QUAD.dispose(); SQUAD.dispose();
      [facadeMat, signMat, glowMat, streakMat, cableMat, skyMat].forEach(function (m) { m.dispose(); });
      lutTex.dispose();
      if (group.parent) group.parent.remove(group);
    }
    return {
      group: group, fog: fog, facadeMaterial: facadeMat, skyline: skyline, tiles: tiles,
      addTile: addTile, removeTile: removeTile, has: function (k) { return tiles.has(k); },
      update: update, stats: stats, dispose: dispose
    };
  }

  var HikyakuCity = {
    TILE: TILE, PITCH: PITCH, STREET: STREET, BLOCK: BLOCK, LANE_Y: LANE_Y, LANE_CLEAR: LANE_CLEAR, DEF: DEF,
    hash: hash, hashU: hashU, rng: rng, noise2: noise2, fbm: fbm, heightField: heightField,
    tileKey: tileKey, tileOf: tileOf, inLaneBand: inLaneBand, boxDist: boxDist, boxesOverlap: boxesOverlap,
    makeTile: makeTile, tilesAround: tilesAround, wanted: wanted, makeCity: makeCity, findCanyon: findCanyon,
    boneRGB: boneRGB, windowLUT: windowLUT,
    makeFog: makeFog, makeSky: makeSky, makeCityRenderer: makeCityRenderer
  };
  globalThis.HikyakuCity = HikyakuCity;
})();
