/* climb.js -- the obstacles on the climb to the type B arcology of Hikyaku.
 *
 * The block arcology (block.js) is approached by one long climb: a single
 * Hermite segment of the page's curve from the last regular ring (260 m or
 * so) to the block's approach point at 506 m, 1.2 to 1.9 km of arc at the
 * slope limit, 25 to 40 s without a ring. Owner's flight report 7
 * (2026-10-26): boring. Concept notes/tools/hikyaku/concepts/
 * CLIMB-OBSTACLES.md, owner decision: variant B (heavy-lift airspace) plus
 * one gate tower of variant A as the first event.
 *
 * Three events on the existing curve, in this order (the route's waypoints
 * do not change: every opening is sized from the finished curve, like
 * sizeHoles in block.js, so the free passage is a property of the
 * construction):
 *
 *   1. gate     a slab tower (128 m wide, 30 m deep, 480 to 560 m tall)
 *               across the climb in the city part (before the campus and its
 *               height ramp), with a hole where the curve meets it, a thin
 *               gold rim round the hole, ground arches over the streets,
 *               a sky-lobby band round the hole, an offset upper slab,
 *               a crown with antennas, landing balconies, fins; drawn on the
 *               city's facade programs (the four-scale rule).
 *   2. freighter one heavy freighter lane (HikyakuTraffic's freighter)
 *               across the climb, its belly the local radius plus 3 m over
 *               the highest point of the curve under the hull's width: the
 *               pilot flies under it at any time, and the page phases the
 *               lane so the freighter is overhead at the nominal arrival.
 *   3. zeppelin a cargo airship hovering over the campus, hull across the
 *               climb, a container rack below it on two rigid docking arms
 *               and four cables; the curve runs between the hull's belly
 *               and the rack's top, between the arms.
 *
 * Local radius: every curve point keeps at least the event's radius (12 m,
 * 15 m under the zeppelin) from every solid box and from the freighter's
 * sweep box. tubeAt(CL, p) is the clearance the page's tube may claim at p:
 * the distance to the nearest of those boxes, capped at the page tube
 * (45 m), so it narrows towards an obstacle at one metre per metre like the
 * canyon's cone and is never below the event radius on the curve (tested).
 *
 * Two layers, like block.js:
 *   - Pure layer, no three.js, no DOM: layout, tubeAt, boxesNear, contacts,
 *     clearance, near, bounds. notes/dev/climb.test.mjs checks it.
 *   - Visual layer: build(THREE, CL, opts). THREE is a parameter, never an
 *     import. Reads ColorRamps (bone greys).
 *
 * Frame: the climb runs along a horizontal world axis ax (the block's
 * approach axis); u = p . ax, v = p . rt with rt = ax x up, y up. Both are
 * world axes, so every box stays axis-aligned in the world.
 *
 * Everything hangs on globalThis.HikyakuClimb.
 */
(function () {
  'use strict';

  const ACCENT = 0x2ee8ff, WARM = 0xffa63d;
  const DEF = {
    tubeR: 45,             /* the page's tube radius, the cap of tubeAt */
    gateR: 12,             /* local radius in the gate's hole (canyon 8 m, plus reserve for the 12 degree climb) */
    freightR: 12,          /* under the freighter */
    zepR: 15,              /* between the zeppelin's hull and its rack */
    rim: 3,                /* every opening: the curve's extent plus radius plus this */
    minHalfW: 20,          /* concept minimum opening 40 x (30 + 0.21 depth) m */
    minHalfH: 15, minHalfHk: 0.105,
    gateW: 128, gateD: 30, gateH: [480, 560], gateBand: 2, gateArch: [12, 56],
    gateFirst: 220,        /* the gate's middle at least this far (along the axis) from the climb's start */
    campusRamp: 270,       /* CAMPUS.rampOff + CAMPUS.ramp of hikyaku-city.js: the gate stands beyond it */
    avoidGap: 30,          /* from other specials' reserved boxes and the canyon walls (horizontal) */
    zepLead: 150,          /* the zeppelin's middle this far before the approach point (along the axis) */
    zepLen: 220, zepRad: 23, rackLen: 150, rackD: 20, rackH: 18, armW: 6,
    eventGap: 200,         /* at least this much axis between two events */
    freightBox: { min: [-20.8, -10, -80.6], max: [20.8, 20.7, 80.9] },   /* HikyakuTraffic BOX.freighter */
    freightBob: 0.5,
    freightHalf: 700, freightMin: 300, freightFade: 250,
    freightSpeed: [16, 20], freightGap: [1.8, 2.4],
    freightAbove: 361,     /* preferred lane altitude: the 320 m freighters' top (340.7) plus 20 under its belly */
    freightAway: 30,       /* the lane's sweep box from every other route sample (centre line then more than 45 m) */
    freightLead: 0.5       /* the freighter's middle over the crossing this many seconds after the nominal arrival */
  };

  /* ---- helpers ------------------------------------------------------------ */
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function len(a) { return Math.sqrt(dot(a, a)); }
  function norm(a) { const l = len(a); return l > 1e-12 ? [a[0] / l, a[1] / l, a[2] / l] : [0, 0, 0]; }
  function boxDist(b, p) {
    const dx = Math.max(b.min[0] - p[0], 0, p[0] - b.max[0]), dy = Math.max(b.min[1] - p[1], 0, p[1] - b.max[1]), dz = Math.max(b.min[2] - p[2], 0, p[2] - b.max[2]);
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }
  function overlapXZ(a, b, m) {
    return a.max[0] > b.min[0] - m && a.min[0] < b.max[0] + m && a.max[2] > b.min[2] - m && a.min[2] < b.max[2] + m;
  }
  function overlap3(a, b, m) {
    return overlapXZ(a, b, m) && a.max[1] > b.min[1] - m && a.min[1] < b.max[1] + m;
  }
  function grow(b, m) { return { min: [b.min[0] - m, b.min[1] - m, b.min[2] - m], max: [b.max[0] + m, b.max[1] + m, b.max[2] + m] }; }
  function unionOf(list) {
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (const b of list) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], b.min[k]); hi[k] = Math.max(hi[k], b.max[k]); }
    return { min: lo, max: hi };
  }
  const r4 = (y) => Math.round(y / 4) * 4;

  /* the frame of the climb axis */
  function frameOf(ax) {
    const a = [Math.round(ax[0]), 0, Math.round(ax[2])];
    if (Math.abs(a[0]) + Math.abs(a[2]) !== 1) throw new Error('HikyakuClimb: axis must be a horizontal world axis');
    return { ax: a, rt: norm(cross(a, [0, 1, 0])) };
  }
  function toW(F, u, v, y) { return [F.ax[0] * u + F.rt[0] * v + 0, y, F.ax[2] * u + F.rt[2] * v + 0]; }
  /* a world box from a local one (u0..u1 along the axis, v0..v1 across, y0..y1) */
  function boxL(F, u0, u1, v0, v1, y0, y1) {
    const a = toW(F, u0, v0, y0), b = toW(F, u1, v1, y1);
    return { min: [Math.min(a[0], b[0]), y0, Math.min(a[2], b[2])], max: [Math.max(a[0], b[0]), y1, Math.max(a[2], b[2])] };
  }

  /* The opening an obstacle of axis extent u0..u1 needs: the curve's extent
     across and up over that stretch plus the radius on both ends (a point
     just outside the stretch still reaches in by r), plus r + rim on every
     side, at least the concept's minimum. */
  function openingOf(C, cv, u0, u1, r) {
    let v0 = Infinity, v1 = -Infinity, y0 = Infinity, y1 = -Infinity, n = 0;
    for (const q of cv) {
      if (q.u < u0 - r || q.u > u1 + r) continue;
      n++;
      v0 = Math.min(v0, q.v); v1 = Math.max(v1, q.v); y0 = Math.min(y0, q.p[1]); y1 = Math.max(y1, q.p[1]);
    }
    if (!n) return null;
    const m = r + C.rim;
    return {
      vc: (v0 + v1) / 2, yc: (y0 + y1) / 2,
      hw: Math.max(C.minHalfW, (v1 - v0) / 2 + m),
      hh: Math.max(C.minHalfH + C.minHalfHk * (u1 - u0), (y1 - y0) / 2 + m),
      v0: v0, v1: v1, y0: y0, y1: y1
    };
  }
  /* the curve point nearest to axis coordinate u (the curve runs along the axis) */
  function atU(cv, u) {
    let best = cv[0];
    for (const q of cv) if (Math.abs(q.u - u) < Math.abs(best.u - u)) best = q;
    return best;
  }
  /* subtract box h from box b (both [u0, u1, v0, v1, y0, y1]); pieces */
  function carve(b, h) {
    if (h[0] >= b[1] || h[1] <= b[0] || h[2] >= b[3] || h[3] <= b[2] || h[4] >= b[5] || h[5] <= b[4]) return [b];
    const out = [];
    const v0 = Math.max(b[2], h[2]), v1 = Math.min(b[3], h[3]), y0 = Math.max(b[4], h[4]), y1 = Math.min(b[5], h[5]);
    if (b[2] < v0) out.push([b[0], b[1], b[2], v0, b[4], b[5]]);
    if (v1 < b[3]) out.push([b[0], b[1], v1, b[3], b[4], b[5]]);
    if (b[4] < y0) out.push([b[0], b[1], v0, v1, b[4], y0]);
    if (y1 < b[5]) out.push([b[0], b[1], v0, v1, y1, b[5]]);
    if (b[0] < h[0]) out.push([b[0], h[0], v0, v1, y0, y1]);
    if (h[1] < b[1]) out.push([h[1], b[1], v0, v1, y0, y1]);
    return out;
  }

  /* ---- the three events ----------------------------------------------------- */
  /* A solid box: { min, max, c, half, idx } (hkcore contactsBoxes) plus kind
     (event), part, tone (bone), prog (facade program for the gate's
     shell: 0 curtain, 1 residential, 2 industrial, 4 plain; -1 not on the
     facade material), seed. */
  function solid(P, F, a, ev, part, tone, prog) {
    const b = boxL(F, a[0], a[1], a[2], a[3], a[4], a[5]);
    b.c = [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2];
    b.half = [(b.max[0] - b.min[0]) / 2, (b.max[1] - b.min[1]) / 2, (b.max[2] - b.min[2]) / 2];
    b.kind = ev; b.part = part; b.tone = tone; b.prog = prog; b.seed = P.rng();
    return b;
  }
  /* every point of the curve keeps r from the box (2 m sampling of a curve
     sampled at 1 m: exact enough, the margin rim is 3 m) */
  function clearOfCurve(cv, b, r) {
    for (const q of cv) if (boxDist(b, q.p) < r) return false;
    return true;
  }
  function clearOfOthers(others, b) {
    for (const q of others) if (boxDist(b, q.p) < q.r) return false;
    return true;
  }

  function gateAt(P, uT) {
    const C = P.C, F = P.F, cv = P.cv, r = C.gateR, D = C.gateD, W = C.gateW, B = C.gateBand;
    const u0 = uT - D / 2, u1 = uT + D / 2;
    const op = openingOf(C, cv, u0 - B, u1 + B, r);
    if (!op) return null;
    const rng = P.rng;
    const room = W / 2 - op.hw - 18;
    if (room < 0) return null;
    const vS = op.vc + (rng() * 2 - 1) * Math.min(14, room);
    const vA = vS - W / 2, vB = vS + W / 2;
    const yh0 = op.yc - op.hh, yh1 = op.yc + op.hh, vh0 = op.vc - op.hw, vh1 = op.vc + op.hw;
    const H = Math.max(r4(C.gateH[0] + rng() * (C.gateH[1] - C.gateH[0])), r4(yh1 + 170));
    const ySplit = r4(yh1 + 36 + rng() * 24), yCrown = H - 36, shift = (rng() < 0.5 ? -1 : 1) * 8;
    const boxes = [], lights = [], reserved = [];
    /* the arches over the streets along the axis (lines every 108 m) */
    const arches = [];
    for (let k = Math.ceil((vA + 18) / 108); k * 108 <= vB - 18; k++) arches.push(k * 108);
    /* lower slab, carved by the hole and the arches */
    let lower = [[u0, u1, vA, vB, 0, ySplit]];
    const holeL = [u0 - 1, u1 + 1, vh0, vh1, yh0, yh1];
    const archL = arches.map((c) => [u0 - 1, u1 + 1, c - C.gateArch[0], c + C.gateArch[0], -1, C.gateArch[1]]);
    for (const h of [holeL].concat(archL)) { const nx = []; for (const b of lower) for (const q of carve(b, h)) nx.push(q); lower = nx; }
    /* the sky-lobby band: two storeys either side of the hole, the whole
       width, 2 m proud on both faces, curtain wall */
    const bandY0 = r4(yh0 - 8), bandY1 = r4(yh1 + 8);
    for (const b of lower) {
      const inBand = b[4] < bandY1 && b[5] > bandY0;
      if (!inBand) { boxes.push(solid(P, F, b, 'gate', 'slab', 0.34, 1)); continue; }
      /* split the piece at the band */
      if (b[4] < bandY0) boxes.push(solid(P, F, [b[0], b[1], b[2], b[3], b[4], bandY0], 'gate', 'slab', 0.34, 1));
      boxes.push(solid(P, F, [b[0] - B, b[1] + B, b[2], b[3], Math.max(b[4], bandY0), Math.min(b[5], bandY1)], 'gate', 'lobby', 0.62, 0));
      if (b[5] > bandY1) boxes.push(solid(P, F, [b[0], b[1], b[2], b[3], bandY1, b[5]], 'gate', 'slab', 0.34, 1));
    }
    /* upper slab, offset 8 m, 12 m narrower; the crown */
    const uvA = vA + 6 + shift, uvB = vB - 6 + shift;
    boxes.push(solid(P, F, [u0 + 1, u1 - 1, uvA, uvB, ySplit, yCrown], 'gate', 'upper', 0.4, 1));
    const cw = W * 0.56 / 2, cc = (uvA + uvB) / 2 - shift * 0.5;
    boxes.push(solid(P, F, [u0 + 4, u1 - 4, cc - cw, cc + cw, yCrown, H], 'gate', 'crown', 0.24, 2));
    /* fins at the ends of the lower slab, 4 m proud, service program */
    for (const vf of [vA + 3, vB - 9]) for (const side of [-1, 1]) {
      const a = side < 0 ? [u0 - 4, u0, vf, vf + 6, 0, ySplit - 8] : [u1, u1 + 4, vf, vf + 6, 0, ySplit - 8];
      const pieces = archL.reduce((list, h) => { const nx = []; for (const b of list) for (const q of carve(b, [h[0] - 5, h[1] + 5, h[2], h[3], h[4], h[5]])) nx.push(q); return nx; }, [a]);
      for (const q of pieces) boxes.push(solid(P, F, q, 'gate', 'fin', 0.2, 2));
    }
    /* landing balconies (owner: only on the biggest buildings): 8 m proud,
       16 m wide, well away from the hole */
    const balc = [];
    for (let i = 0; i < 8 && balc.length < 5; i++) {
      const y = r4(80 + rng() * (yCrown - 120)), side = rng() < 0.5 ? -1 : 1;
      if (Math.abs(y - op.yc) < op.hh + 34) continue;
      const vb = vA + 20 + rng() * (W - 56);
      const top = y >= ySplit ? [uvA + 10, uvB - 26] : [vA + 14, vB - 30];
      const v0b = Math.max(top[0], Math.min(top[1], vb));
      const a = side < 0 ? [u0 - 8 - (y >= ySplit ? -1 : 0), u0 - (y >= ySplit ? -1 : 0), v0b, v0b + 16, y, y + 1.6] : [u1 + (y >= ySplit ? -1 : 0), u1 + 8 + (y >= ySplit ? -1 : 0), v0b, v0b + 16, y, y + 1.6];
      if (balc.some((q) => Math.abs(q[4] - y) < 14 && q[0] === a[0])) continue;
      balc.push(a);
      boxes.push(solid(P, F, a, 'gate', 'balcony', 0.5, 4));
      const e = side < 0 ? a[0] : a[1];
      lights.push({ t: 'line', a: toW(F, e, a[2], y + 2.6), b: toW(F, e, a[3], y + 2.6), w: 0.35, c: 'cyan', g: 0.8 });
    }
    /* antennas on the crown */
    const nA = 2 + Math.floor(rng() * 2);
    for (let i = 0; i < nA; i++) {
      const va = cc - cw + 8 + (2 * cw - 16) * (nA === 1 ? 0.5 : i / (nA - 1)), h = 26 + rng() * 34;
      boxes.push(solid(P, F, [uT - 0.8, uT + 0.8, va - 0.8, va + 0.8, H, H + h], 'gate', 'antenna', 0.15, -1));
      lights.push({ t: 'halo', p: toW(F, uT, va, H + h + 1), sx: 9, sy: 9, c: 'red', g: 1.4, blink: 1.6 + i * 0.3 });
    }
    for (const vq of [cc - cw, cc + cw]) lights.push({ t: 'halo', p: toW(F, uT, vq, H + 1), sx: 7, sy: 7, c: 'red', g: 1.1, blink: 2.2 });
    /* every box keeps the radius from the curve; decoration that does not is dropped */
    const kept = [];
    let dropped = 0;
    for (const b of boxes) {
      if (clearOfCurve(cv, b, r)) { kept.push(b); continue; }
      if (b.part === 'balcony' || b.part === 'fin' || b.part === 'antenna') { dropped++; continue; }
      return null;
    }
    /* the gold rim round the hole on both faces, and the vents in the reveal */
    const e = 0.06;
    for (const uf of [u0 - B - e, u1 + B + e]) {
      const c4 = [[vh0, yh0], [vh1, yh0], [vh1, yh1], [vh0, yh1]];
      for (let k = 0; k < 4; k++) {
        const a = c4[k], b = c4[(k + 1) % 4];
        lights.push({ t: 'line', a: toW(F, uf, a[0], a[1]), b: toW(F, uf, b[0], b[1]), w: 0.7, c: 'gold', g: 1.25 });
      }
    }
    for (let k = 1; k <= 3; k++) {
      const y = yh0 + (yh1 - yh0) * k / 4;
      for (const vq of [vh0 + e, vh1 - e]) lights.push({ t: 'line', a: toW(F, u0 + 4, vq, y), b: toW(F, u1 - 4, vq, y), w: 0.45, c: 'sod', g: 0.7 });
    }
    /* the lobby band's lit edges and the arches' soffits */
    for (const uf of [u0 - B - e, u1 + B + e]) {
      for (const y of [bandY0 + 0.6, bandY1 - 0.6]) {
        lights.push({ t: 'line', a: toW(F, uf, vA, y), b: toW(F, uf, vh0 - 1, y), w: 0.5, c: 'warm', g: 0.9 });
        lights.push({ t: 'line', a: toW(F, uf, vh1 + 1, y), b: toW(F, uf, vB, y), w: 0.5, c: 'warm', g: 0.9 });
      }
    }
    for (const c of arches) lights.push({ t: 'line', a: toW(F, u0 + 2, c, C.gateArch[1] - 0.1), b: toW(F, u1 - 2, c, C.gateArch[1] - 0.1), w: 1.2, c: 'sod', g: 1 });
    /* reserved for the city: the slab on the ground, the arches from their
       soffit up (the streets under them stay streets) */
    const foot = [[u0 - 8, u1 + 8, vA - 2, vB + 2, 0, H + 80]];
    let rs = foot;
    for (const h of archL) { const nx = []; for (const b of rs) for (const q of carve(b, [h[0] - 9, h[1] + 9, h[2], h[3], -1, h[5] + 2])) nx.push(q); rs = nx; }
    for (const q of rs) { const b = boxL(F, q[0], q[1], q[2], q[3], q[4], q[5]); b.kind = 'climb'; reserved.push(b); }
    const cq = atU(cv, uT);
    return {
      kind: 'gate', name: 'gate', u: uT, s: cq.s, cu: cq.cu, r: r, depth: D + 2 * B,
      c: toW(F, uT, op.vc, op.yc), n: F.ax.slice(), right: F.rt.slice(), up: [0, 1, 0], hw: op.hw, hh: op.hh,
      w: 2 * op.hw, h: 2 * op.hh, height: H, width: W, arches: arches.length,
      boxes: kept, lights: lights, reserved: reserved, dropped: dropped,
      bounds: unionOf(kept), zone: [u0 - B - 8, u1 + B + 8]
    };
  }

  function zeppelinAt(P, uz) {
    const C = P.C, F = P.F, cv = P.cv, r = C.zepR, R = C.zepRad, Lh = C.zepLen;
    const op = openingOf(C, cv, uz - R, uz + R, r);
    if (!op) return null;
    const rng = P.rng;
    const hw = Math.max(C.minHalfW + 4, op.hw);
    let yb = op.y1 + r + C.rim, yt = op.y0 - r - C.rim;
    const need = 2 * (C.minHalfH + C.minHalfHk * 2 * R);
    if (yb - yt < need) { const m = (yb + yt) / 2; yb = m + need / 2; yt = m - need / 2; }
    const yc = yb + R, vc = op.vc, boxes = [], lights = [], vis = [];
    const prof = (x) => R * Math.pow(Math.max(0, 1 - Math.pow(Math.min(1, Math.abs(x)), 2.5)), 0.4);
    /* the hull as three sections either side, two boxes each (core and belly) */
    const secs = [[0, 0.6], [0.6, 0.84], [0.84, 1]];
    for (const sc of secs) {
      const rr = prof(sc[0]);
      for (const sg of [-1, 1]) {
        const va = vc + sg * sc[0] * Lh / 2, vb = vc + sg * sc[1] * Lh / 2, v0 = Math.min(va, vb), v1 = Math.max(va, vb);
        if (sc[0] === 0 && sg > 0) continue;
        const v0c = sc[0] === 0 ? vc - sc[1] * Lh / 2 : v0, v1c = sc[0] === 0 ? vc + sc[1] * Lh / 2 : v1;
        boxes.push(solid(P, F, [uz - rr, uz + rr, v0c, v1c, yc - 0.7 * rr, yc + rr], 'zeppelin', 'hull', 0.5, -1));
        boxes.push(solid(P, F, [uz - 0.72 * rr, uz + 0.72 * rr, v0c, v1c, yc - rr, yc - 0.7 * rr], 'zeppelin', 'hull', 0.5, -1));
      }
    }
    /* the rack (containers in a frame) and the two docking arms that hold it */
    const rl = C.rackLen / 2, rd = C.rackD / 2;
    /* the rack's box is the collision envelope; drawn are its frame and the containers */
    const rack = solid(P, F, [uz - rd, uz + rd, vc - rl, vc + rl, yt - C.rackH, yt], 'zeppelin', 'rack', 0.3, -1);
    rack.hidden = true;
    boxes.push(rack);
    const aw = C.armW;
    for (const sg of [-1, 1]) {
      const v0 = sg < 0 ? vc - hw - aw : vc + hw, v1 = v0 + aw;
      boxes.push(solid(P, F, [uz - aw / 2, uz + aw / 2, v0, v1, yt, yb + 4], 'zeppelin', 'arm', 0.22, -1));
      /* the cables at the rack's ends */
      const vk = vc + sg * (rl - 4);
      boxes.push(solid(P, F, [uz - 0.6, uz + 0.6, vk - 0.6, vk + 0.6, yt, yc - 0.6 * prof(Math.abs(vk - vc) / (Lh / 2))], 'zeppelin', 'cable', 0.15, -1));
    }
    /* the gondola under the hull at one end, beyond the arms */
    const gs = rng() < 0.5 ? -1 : 1, gv0 = vc + gs * 52, gv1 = vc + gs * 86;
    boxes.push(solid(P, F, [uz - 7, uz + 7, Math.min(gv0, gv1), Math.max(gv0, gv1), yc - prof(0.6) - 9, yc - 0.8 * prof(0.75)], 'zeppelin', 'gondola', 0.42, -1));
    /* four engine pods on pylons at the hull's sides, rotors facing along the axis */
    const rotors = [];
    for (const vp of [-62, 62]) for (const su of [-1, 1]) {
      const v = vc + vp, uS = uz + su * (prof(Math.abs(vp) / (Lh / 2)) + 9);
      /* the pylon lies inside the hull's and the pod's boxes: drawn, not solid */
      vis.push({ box: boxL(F, Math.min(uz, uS), Math.max(uz, uS), v - 1.5, v + 1.5, yc - 1.2, yc + 1.2), rgb: [0.2, 0.21, 0.23] });
      boxes.push(solid(P, F, [uS - 6, uS + 6, v - 4, v + 4, yc - 4, yc + 4], 'zeppelin', 'pod', 0.35, -1));
      rotors.push({ c: toW(F, uS + su * 6.3, v, yc), axis: F.ax.map((x) => x * -su), r: 7.5, ph: rng() * 6.283, w: 11 + rng() * 3 });
    }
    /* the tail fins at the far end from the gondola */
    const tv = vc - gs * Lh / 2;
    const tA = Math.min(tv, tv + gs * 0.18 * Lh), tB = Math.max(tv, tv + gs * 0.18 * Lh);
    /* fins in two steps each, so they read tapered: a long root, a short tip */
    const tM = tv + gs * 0.07 * Lh, tAm = Math.min(tv, tM), tBm = Math.max(tv, tM);
    for (const q of [[tA, tB, 0.45, 0.95], [tAm, tBm, 0.95, 1.3]]) {
      boxes.push(solid(P, F, [uz - 0.8, uz + 0.8, q[0], q[1], yc + q[2] * R, yc + q[3] * R], 'zeppelin', 'fin', 0.3, -1));
      boxes.push(solid(P, F, [uz - 0.8, uz + 0.8, q[0], q[1], yc - q[3] * R, yc - q[2] * R], 'zeppelin', 'fin', 0.3, -1));
      boxes.push(solid(P, F, [uz - q[3] * R, uz - q[2] * R, q[0], q[1], yc - 0.8, yc + 0.8], 'zeppelin', 'fin', 0.3, -1));
      boxes.push(solid(P, F, [uz + q[2] * R, uz + q[3] * R, q[0], q[1], yc - 0.8, yc + 0.8], 'zeppelin', 'fin', 0.3, -1));
    }
    for (const b of boxes) if (!clearOfCurve(cv, b, r)) return null;
    /* containers in the rack (not solid: inside the rack's box), 12 x 2.6 x 2.6 m, four layers */
    const frameRgb = [0.16, 0.17, 0.19], y0r = yt - C.rackH;
    for (const q of [[uz - rd, uz + rd, vc - rl, vc + rl, yt - 1.4, yt], [uz - rd, uz - rd + 1.2, vc - rl, vc + rl, y0r, y0r + 1.2], [uz + rd - 1.2, uz + rd, vc - rl, vc + rl, y0r, y0r + 1.2],
      [uz - rd, uz + rd, vc - rl, vc - rl + 1.6, y0r, yt], [uz - rd, uz + rd, vc + rl - 1.6, vc + rl, y0r, yt], [uz - rd, uz + rd, vc - 0.8, vc + 0.8, y0r, yt]]) {
      vis.push({ box: boxL(F, q[0], q[1], q[2], q[3], q[4], q[5]), rgb: frameRgb });
    }
    const COLS = [[0.42, 0.12, 0.08], [0.1, 0.2, 0.36], [0.5, 0.26, 0.06], [0.24, 0.26, 0.28], [0.12, 0.3, 0.22], [0.46, 0.4, 0.34]];
    for (let ly = 0; ly < 5; ly++) for (let row = 0; row < 6; row++) for (let k = 0; k < 11; k++) {
      if (rng() < 0.12) continue;
      const u0 = uz - rd + 1 + row * 3.0, v0 = vc - rl + 2 + k * 13.2 + (k >= 6 ? 0.6 : -0.6), y0 = yt - C.rackH + 1.5 + ly * 3.0;
      vis.push({ box: boxL(F, u0, u0 + 2.6, v0, v0 + 12.2, y0, y0 + 2.6), rgb: COLS[Math.floor(rng() * COLS.length)].map((x) => x * (0.75 + 0.5 * rng())) });
    }
    /* lights: the gold rim of the opening on both sides (belly, arms, rack
       top), a cyan line along the hull, nav lamps, the rack's floodlights */
    const e = 0.08;
    for (const uf of [uz - R * 0.72 - e, uz + R * 0.72 + e]) {
      lights.push({ t: 'line', a: toW(F, uf, vc - hw, yb + 0.4), b: toW(F, uf, vc + hw, yb + 0.4), w: 0.7, c: 'gold', g: 1.25 });
    }
    for (const uf of [uz - rd - e, uz + rd + e]) lights.push({ t: 'line', a: toW(F, uf, vc - hw, yt - 0.4), b: toW(F, uf, vc + hw, yt - 0.4), w: 0.7, c: 'gold', g: 1.25 });
    for (const sg of [-1, 1]) for (const uf of [uz - aw / 2 - e, uz + aw / 2 + e]) {
      const vv = vc + sg * (hw + 0.3);
      lights.push({ t: 'line', a: toW(F, uf, vv, yt), b: toW(F, uf, vv, yb), w: 0.6, c: 'gold', g: 1.1 });
    }
    for (const su of [-1, 1]) {
      const uf = uz + su * (R + 0.15);
      lights.push({ t: 'line', a: toW(F, uf, vc - 0.4 * Lh / 2, yc), b: toW(F, uf, vc + 0.4 * Lh / 2, yc), w: 0.9, c: 'cyan', g: 1.1 });
    }
    lights.push({ t: 'halo', p: toW(F, uz, vc - Lh / 2 - 1, yc), sx: 8, sy: 8, c: 'red', g: 1.3, blink: 1.4 });
    lights.push({ t: 'halo', p: toW(F, uz, vc + Lh / 2 + 1, yc), sx: 8, sy: 8, c: 'cyan', g: 1.3, blink: 1.4 });
    lights.push({ t: 'halo', p: toW(F, uz, vc, yc + R + 1.5), sx: 7, sy: 7, c: 'red', g: 1.2, blink: 2.0 });
    const gu = uz - 7.1, gy = yc - prof(0.6) - 5;
    lights.push({ t: 'line', a: toW(F, gu, Math.min(gv0, gv1) + 3, gy), b: toW(F, gu, Math.max(gv0, gv1) - 3, gy), w: 1.4, c: 'warm', g: 0.9 });
    lights.push({ t: 'line', a: toW(F, gu + 14.2, Math.min(gv0, gv1) + 3, gy), b: toW(F, gu + 14.2, Math.max(gv0, gv1) - 3, gy), w: 1.4, c: 'warm', g: 0.9 });
    for (const vq of [-60, -20, 20, 60]) lights.push({ t: 'halo', p: toW(F, uz, vc + vq, yt - C.rackH - 1.5), sx: 10, sy: 6, c: 'sod', g: 0.8 });
    const cq = atU(cv, uz);
    return {
      kind: 'zeppelin', name: 'zeppelin', u: uz, s: cq.s, cu: cq.cu, r: r, depth: 2 * R,
      c: toW(F, uz, vc, (yb + yt) / 2), n: F.ax.slice(), right: F.rt.slice(), up: [0, 1, 0], hw: hw, hh: (yb - yt) / 2,
      w: 2 * hw, h: yb - yt, belly: yb, rackTop: yt,
      hull: { c: toW(F, uz, vc, yc), axis: F.rt.slice(), len: Lh, rad: R, exp: [2.5, 0.4] },
      rotors: rotors, vis: vis, boxes: boxes, lights: lights,
      bounds: unionOf(boxes), zone: [uz - R - 10, uz + R + 10]
    };
  }

  function freighterAt(P, uf) {
    const C = P.C, F = P.F, cv = P.cv, r = C.freightR, fb = C.freightBox, bob = C.freightBob;
    const hwF = Math.max(-fb.min[0], fb.max[0]);
    const op = openingOf(C, cv, uf - hwF, uf + hwF, r);
    if (!op) return null;
    const y = op.y1 + r + C.rim - fb.min[1] + bob;
    const vc = (atU(cv, uf)).v;
    const hl = Math.max(-fb.min[2], fb.max[2]);
    const sweepOf = (va, vb) => boxL(F, uf - hwF, uf + hwF, va - hl, vb + hl, y + fb.min[1] - bob, y + fb.max[1] + bob);
    /* the lane's ends: as far as freightHalf, short of every other route
       sample (centre line well beyond freightNear) and the avoid boxes */
    const ok = (va, vb) => {
      const sw = sweepOf(va, vb);
      for (const q of P.others) if (boxDist(sw, q.p) < C.freightAway) return false;
      for (const a of P.avoid3) if (overlap3(sw, a, 20)) return false;
      return true;
    };
    let e0 = 0, e1 = 0;
    while (e0 < C.freightHalf && ok(vc - e0 - 20, vc)) e0 += 20;
    while (e1 < C.freightHalf && ok(vc, vc + e1 + 20)) e1 += 20;
    if (e0 < C.freightMin || e1 < C.freightMin) return null;
    const va = vc - e0, vb = vc + e1, sweep = sweepOf(va, vb);
    const rng = P.rng, Ll = e0 + e1;
    const dir = rng() < 0.5 ? 1 : -1;
    const lane = {
      points: [toW(F, uf, va, y), toW(F, uf, vb, y)], dir: dir,
      speed: C.freightSpeed[0] + (C.freightSpeed[1] - C.freightSpeed[0]) * rng(),
      spacing: Ll * (C.freightGap[0] + (C.freightGap[1] - C.freightGap[0]) * rng()),
      phase: 0, types: { freighter: 1 }, seed: (Math.floor(rng() * 2147483647)) | 0,
      bob: { amp: bob, freq: 0.21 }, maxBank: 0, fadeEnds: C.freightFade,
      freight: { axis: Math.abs(F.rt[0]) > 0.5 ? 'x' : 'z', y: y, row: uf * (F.ax[0] + F.ax[2]) },
      cross: toW(F, uf, vc, y)
    };
    const cq = atU(cv, uf);
    const corridor = boxL(F, uf - hwF - 9, uf + hwF + 9, va, vb, y + fb.min[1] - 20, y + fb.max[1] + 20);
    corridor.kind = 'climb';
    return {
      kind: 'freighter', name: 'freighter', u: uf, s: cq.s, cu: cq.cu, r: r, depth: 2 * hwF,
      c: toW(F, uf, vc, (op.y1 + y + fb.min[1]) / 2), n: F.ax.slice(), right: F.rt.slice(), up: [0, 1, 0],
      y: y, belly: y + fb.min[1] - bob, lane: lane, sweep: sweep, corridor: corridor,
      boxes: [], lights: [], bounds: sweep, zone: [uf - hwF - 10, uf + hwF + 10]
    };
  }

  /* An air box over the curve round an event's zone, for the city's
     reserved list: nothing of the city comes nearer than the full tube
     there (caps lots 10 m under its floor, keeps bridges, cables and signs
     out), so the narrowed tube only ever counts against the obstacle. */
  function airOf(P, ev) {
    const C = P.C, F = P.F, m = C.tubeR + 3;
    let v0 = Infinity, v1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const q of P.cv) {
      if (q.u < ev.zone[0] - m || q.u > ev.zone[1] + m) continue;
      v0 = Math.min(v0, q.v); v1 = Math.max(v1, q.v); y0 = Math.min(y0, q.p[1]); y1 = Math.max(y1, q.p[1]);
    }
    const b = boxL(F, ev.zone[0] - m, ev.zone[1] + m, v0 - m, v1 + m, Math.max(0, y0 - C.tubeR - 8), y1 + m);
    b.kind = 'climb';
    return b;
  }

  /* layout(input) -> CL, or null when the climb is too short for any event.
     input: {
       seed      integer
       axis      the block's approach axis (horizontal world axis)
       curve     the climb on the page's curve, dense (1 m): [{ p, s, u }],
                 s arc length from the climb's start, u the route parameter
       others    every other route sample [{ p, r }]: the obstacles keep r
                 from them (the page's tube elsewhere)
       avoid     boxes the gate keeps avoidGap from (horizontally) and the
                 freighter lane 20 m from (in 3-D): the other specials'
                 reserved boxes, the canyon walls
       solid     boxes everything keeps 20 m from in 3-D (the block's bounds)
       campus    the block's reserved box: the gate stands beyond it plus
                 campusRamp (the city's campus and its height ramp)
       idxBase   first box index (contactsBoxes keys on idx)
       opts      DEF overrides
     } */
  function layout(input) {
    const C = Object.assign({}, DEF, input.opts || {});
    const F = frameOf(input.axis);
    const seed = (input.seed >>> 0) || 1;
    const cv = input.curve.map((q) => ({ p: q.p.slice(), s: q.s, cu: q.u, u: dot(q.p, F.ax), v: dot(q.p, F.rt) }));
    const P = {
      C: C, F: F, cv: cv, rng: mulberry32(seed ^ 0x636c6d62), others: input.others || [],
      avoid: input.avoid || [], avoid3: (input.avoid || []).concat(input.solid || []), solid: input.solid || []
    };
    const uS = cv[0].u, uA = cv[cv.length - 1].u;
    const stats = { tried: { gate: 0, freighter: 0, zeppelin: 0 } };
    const events = [];
    const fits = (ev) => {
      for (const b of ev.boxes) if (!clearOfOthers(P.others, b)) return false;
      for (const a of P.solid) if (overlap3(ev.bounds, a, 20)) return false;
      return true;
    };
    /* 3: the zeppelin, zepLead before the approach point */
    let zep = null;
    for (let k = 0; k < 4 && !zep; k++) {
      stats.tried.zeppelin++;
      const z = zeppelinAt(P, uA - C.zepLead - 30 * k);
      if (z && fits(z)) zep = z;
    }
    const uEnd = zep ? zep.zone[0] : uA - C.zepLead;
    /* 1: the gate tower on the street grid (its middle mid-block, so it
       stands on lots), beyond the campus and its ramp, room for the
       freighter after it */
    let gate = null;
    const ramp = input.campus ? grow(input.campus, C.campusRamp) : null;
    const want = Math.max(uS + C.gateFirst, uEnd - 2 * C.eventGap - 560);
    const snap = Math.round((want - 54) / 108) * 108 + 54;
    for (const dk of [0, 1, -1, 2, -2, 3, 4]) {
      const uT = snap + dk * 108;
      if (uT < uS + C.gateFirst || uT > uEnd - 2 * C.eventGap) continue;
      stats.tried.gate++;
      const g = gateAt(P, uT);
      if (!g) continue;
      if (ramp && overlapXZ(g.bounds, ramp, C.avoidGap)) continue;
      if (P.avoid.some((a) => overlapXZ(g.bounds, a, C.avoidGap))) continue;
      if (!fits(g)) continue;
      gate = g; break;
    }
    /* 2: the freighter between them, high enough over the 320 m freighters if it can be */
    let fr = null;
    const fa = (gate ? gate.zone[1] : uS + C.gateFirst) + C.eventGap, fb = uEnd - C.eventGap;
    if (fb > fa) {
      const cands = [];
      const mid = (fa + fb) / 2;
      for (let x = fa; x <= fb + 1e-9; x += 40) cands.push(x);
      const yAt = (u) => atU(cv, u).p[1];
      cands.sort((a, b) => {
        const ha = yAt(a) + 30 >= C.freightAbove ? 0 : 1, hb = yAt(b) + 30 >= C.freightAbove ? 0 : 1;
        return ha - hb || Math.abs(a - mid) - Math.abs(b - mid);
      });
      for (const u of cands.slice(0, 8)) {
        stats.tried.freighter++;
        const f = freighterAt(P, u);
        if (f) { fr = f; break; }
      }
    }
    if (gate) events.push(gate);
    if (fr) events.push(fr);
    if (zep) events.push(zep);
    if (!events.length) return null;
    /* boxes with their indices */
    const boxes = [];
    for (const ev of events) for (const b of ev.boxes) { b.idx = (input.idxBase || 0) + boxes.length; boxes.push(b); }
    faceMasks(boxes);
    const reserved = [];
    for (const ev of events) {
      if (ev.reserved) for (const b of ev.reserved) reserved.push(b);
      if (ev.corridor) reserved.push(ev.corridor);
      if (ev.kind === 'zeppelin') { const b = grow(ev.bounds, 10); b.kind = 'climb'; reserved.push(b); }
      reserved.push(airOf(P, ev));
    }
    const zones = boxes.slice();
    if (fr) zones.push(fr.sweep);
    const all = unionOf(events.map((ev) => ev.bounds));
    return {
      seed: seed, axis: F.ax.slice(), right: F.rt.slice(), C: C, events: events, boxes: boxes, zones: zones,
      reserved: reserved, bounds: all, freighter: fr ? fr.lane : null,
      gate: gate, zep: zep, fr: fr,
      stats: { events: events.length, boxes: boxes.length, gateDropped: gate ? gate.dropped : 0, tried: stats.tried },
      _zb: grow(unionOf(zones), C.tubeR)
    };
  }

  /* exposed-face bits per box (+x, -x, +y, -y, +z, -z): a face counts as
     covered when a 3 x 3 grid of points just outside it lies in another box */
  function faceMasks(boxes) {
    const eps = 0.05;
    for (const b of boxes) {
      let m = 0;
      for (let f = 0; f < 6; f++) {
        const ax = f >> 1, sg = f & 1 ? -1 : 1, a1 = (ax + 1) % 3, a2 = (ax + 2) % 3;
        let open = false;
        for (let i = 0; i < 3 && !open; i++) for (let j = 0; j < 3 && !open; j++) {
          const p = [0, 0, 0];
          p[ax] = sg > 0 ? b.max[ax] + eps : b.min[ax] - eps;
          p[a1] = b.min[a1] + (b.max[a1] - b.min[a1]) * (0.1 + 0.4 * i);
          p[a2] = b.min[a2] + (b.max[a2] - b.min[a2]) * (0.1 + 0.4 * j);
          if (p[1] < 0.01) continue;
          let cov = false;
          for (const o of boxes) if (o !== b && p[0] > o.min[0] && p[0] < o.max[0] && p[1] > o.min[1] && p[1] < o.max[1] && p[2] > o.min[2] && p[2] < o.max[2]) { cov = true; break; }
          if (!cov) open = true;
        }
        if (open) m |= 1 << f;
      }
      b.open = m;
    }
  }

  /* ---- queries ---------------------------------------------------------------- */
  /* the clearance the page's tube may claim at p: the distance to the nearest
     solid box or the freighter's sweep, capped at the tube radius */
  function tubeAt(CL, p) {
    const T = CL.C.tubeR, zb = CL._zb;
    if (p[0] < zb.min[0] || p[0] > zb.max[0] || p[1] < zb.min[1] || p[1] > zb.max[1] || p[2] < zb.min[2] || p[2] > zb.max[2]) return T;
    let r = T;
    for (const b of CL.zones) { const d = boxDist(b, p); if (d < r) r = d; }
    return r;
  }
  function near(CL, p, m) {
    const b = CL.bounds;
    return p[0] > b.min[0] - m && p[0] < b.max[0] + m && p[1] > b.min[1] - m && p[1] < b.max[1] + m && p[2] > b.min[2] - m && p[2] < b.max[2] + m;
  }
  function boxesNear(CL, p, r) {
    const out = [];
    if (!near(CL, p, r)) return out;
    for (const b of CL.boxes) if (boxDist(b, p) <= r) out.push(b);
    return out;
  }
  function bounds(CL) { return CL.bounds; }
  /* free space at p for the camera probe: distance to the nearest box
     (capped at reach, default 40 m), minus the depth of the cheapest
     exposed exit inside a box; 1e9 far away */
  function clearance(CL, p, reach) {
    const R = reach == null ? 40 : reach;
    if (!near(CL, p, R)) return 1e9;
    let best = R, inside = Infinity;
    for (const b of CL.boxes) {
      if (p[0] > b.min[0] && p[0] < b.max[0] && p[1] > b.min[1] && p[1] < b.max[1] && p[2] > b.min[2] && p[2] < b.max[2]) {
        const mk = b.open || 0x3f;
        let e = Infinity;
        if (mk & 1) e = Math.min(e, b.max[0] - p[0]);
        if (mk & 2) e = Math.min(e, p[0] - b.min[0]);
        if (mk & 4) e = Math.min(e, b.max[1] - p[1]);
        if (mk & 8) e = Math.min(e, p[1] - b.min[1]);
        if (mk & 16) e = Math.min(e, b.max[2] - p[2]);
        if (mk & 32) e = Math.min(e, p[2] - b.min[2]);
        inside = Math.min(inside, e);
        continue;
      }
      const d = boxDist(b, p);
      if (d < best) best = d;
    }
    return inside < Infinity ? -inside : best;
  }
  /* Hull points (body frame) of a state { p, q } against the boxes, in
     the SixDOF.resolve record: a point leaves through the nearest exposed
     face, so the gate's laibung, sill and lintel, which touch the slab,
     never push a point into each other. key 'clb' + idx. */
  function contacts(CL, pts, st) {
    const out = [];
    let rh = 0;
    for (const v of pts) rh = Math.max(rh, Math.hypot(v[0], v[1], v[2]));
    const cand = boxesNear(CL, st.p, rh + 1e-6);
    if (!cand.length) return out;
    const q = st.q, q0 = q[0], q1 = q[1], q2 = q[2], q3 = q[3];
    for (const v of pts) {
      const tx = 2 * (q2 * v[2] - q3 * v[1]), ty = 2 * (q3 * v[0] - q1 * v[2]), tz = 2 * (q1 * v[1] - q2 * v[0]);
      const rx = v[0] + q0 * tx + q2 * tz - q3 * ty, ry = v[1] + q0 * ty + q3 * tx - q1 * tz, rz = v[2] + q0 * tz + q1 * ty - q2 * tx;
      const px = st.p[0] + rx, py = st.p[1] + ry, pz = st.p[2] + rz;
      for (const b of cand) {
        if (!(px > b.min[0] && px < b.max[0] && py > b.min[1] && py < b.max[1] && pz > b.min[2] && pz < b.max[2])) continue;
        const m = b.open || 0x3f;
        let best = Infinity, f = -1, d;
        if (m & 1 && (d = b.max[0] - px) < best) { best = d; f = 0; }
        if (m & 2 && (d = px - b.min[0]) < best) { best = d; f = 1; }
        if (m & 4 && (d = b.max[1] - py) < best) { best = d; f = 2; }
        if (m & 8 && (d = py - b.min[1]) < best) { best = d; f = 3; }
        if (m & 16 && (d = b.max[2] - pz) < best) { best = d; f = 4; }
        if (m & 32 && (d = pz - b.min[2]) < best) { best = d; f = 5; }
        if (f < 0) continue;
        const nn = [0, 0, 0];
        nn[f >> 1] = f & 1 ? -1 : 1;
        out.push({ n: nn, r: [rx, ry, rz], pen: best, key: 'clb' + b.idx, box: b.idx, vs: null, part: b.kind });
      }
    }
    return out;
  }

  /* =====================================================================
     Visual layer. THREE is a parameter.
     ===================================================================== */
  function boneStops() {
    const CR = globalThis.ColorRamps, r = CR && CR.rampById('bone');
    if (!r || r.id !== 'bone') throw new Error('HikyakuClimb.build needs ColorRamps: load /assets/js/colorramps.js first');
    return r.stops;
  }
  function toLin(c) { return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
  function hexLin(hex, g) { return [toLin(((hex >> 16) & 255) / 255) * g, toLin(((hex >> 8) & 255) / 255) * g, toLin((hex & 255) / 255) * g]; }
  const FACE = [
    [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 0]],
    [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0], [-1, 0, 0]],
    [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0], [0, 1, 0]],
    [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1], [0, -1, 0]],
    [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1], [0, 0, 1]],
    [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, -1]]
  ];

  /* build(THREE, CL, opts): opts.fog (the page's farFog or makeFog),
     opts.facadeMaterial (the city renderer's; the gate's boxes are one draw
     in its convention, not owned), opts.warm, opts.accent. Returns { group,
     parts (one group per event, for farFog.track), update(t, cameraPos),
     dispose(), stats }. Draws: the gate 3 (shell, glow, halos), the
     zeppelin 4 (body, glow, halos, rotors). */
  function build(THREE, CL, opts) {
    opts = opts || {};
    const stops = boneStops();
    const bone = (t, g) => {
      t = Math.min(1, Math.max(0, t)) * (stops.length - 1);
      const i = Math.min(stops.length - 2, Math.floor(t)), f = t - i, a = stops[i], b = stops[i + 1], k = g == null ? 1 : g;
      return [toLin(a[0] + (b[0] - a[0]) * f) * k, toLin(a[1] + (b[1] - a[1]) * f) * k, toLin(a[2] + (b[2] - a[2]) * f) * k];
    };
    const fog = opts.fog || null, owned = [], geoms = [];
    const warm = opts.warm == null ? WARM : opts.warm, accent = opts.accent == null ? ACCENT : opts.accent;
    const COL = {
      warm: hexLin(warm, 2.2), sod: hexLin(0xffb46a, 1.5), cyan: hexLin(accent, 2.0), red: hexLin(0xff3a28, 2.2),
      gold: hexLin(0xffc65a, 2.1)
    };
    const group = new THREE.Group();
    group.name = 'climb';
    const parts = [];

    /* shared materials */
    let facadeMat = opts.facadeMaterial || null;
    if (facadeMat && fog && fog.adopt) { facadeMat = fog.adopt(facadeMat); owned.push(facadeMat); }
    if (!facadeMat) {
      facadeMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0.15 });
      if (fog) fog.patch(facadeMat);
      owned.push(facadeMat);
    }
    const bodyMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0.35 });
    if (fog) fog.patch(bodyMat);
    owned.push(bodyMat);
    const glowMat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
    if (fog) fog.patch(glowMat, { fogK: 0.5 });
    owned.push(glowMat);
    const haloMat = new THREE.ShaderMaterial({
      uniforms: { uFogK: { value: 0.45 }, uTime: { value: 0 } },
      vertexShader: '/*CG_FOG*/\nuniform float uFogK; uniform float uTime;\nattribute vec3 iPos; attribute vec2 iSize; attribute vec3 iCol; attribute float iBlink;\nvarying vec2 vUv; varying vec3 vCol;\n' +
        'void main(){\n  vec4 mv = modelViewMatrix * vec4(iPos, 1.0);\n  mv.xy += position.xy * iSize;\n  vUv = uv;\n' +
        '  float bl = iBlink > 0.0 ? 0.2 + 0.8 * step(fract(uTime / iBlink + fract(iPos.x * 0.0137 + iPos.z * 0.0071)), 0.25) : 1.0;\n' +
        '#ifdef CL_CG\n  vec3 wp = (modelMatrix * vec4(iPos, 1.0)).xyz;\n  vCol = iCol * bl * (1.0 - cgFogAmt(wp, uFogK));\n#else\n  vCol = iCol * bl;\n#endif\n' +
        '  gl_Position = projectionMatrix * mv;\n}',
      fragmentShader: 'varying vec2 vUv; varying vec3 vCol;\nvoid main(){\n  float r = length(vUv - 0.5) * 2.0;\n  float a = exp(-r * r * 3.5) * clamp(1.0 - r, 0.0, 1.0);\n  gl_FragColor = vec4(vCol * a, 1.0);\n}',
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false
    });
    if (fog) { haloMat.defines = { CL_CG: '' }; fog.inject(haloMat); }
    owned.push(haloMat);
    const qg = new THREE.PlaneGeometry(1, 1);
    geoms.push(qg);

    /* the glow and halo layers of one event */
    const lightLayers = (ev, g) => {
      const GP = [], GC = [];
      const tri = (a, b, c, k) => { GP.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]); for (let i = 0; i < 3; i++) GC.push(k[0], k[1], k[2]); };
      const quad = (a, b, c, d, k) => { tri(a, b, c, k); tri(a, c, d, k); };
      const halos = [];
      for (const it of ev.lights) {
        const k0 = COL[it.c] || COL.sod, kk = [k0[0] * it.g, k0[1] * it.g, k0[2] * it.g];
        if (it.t === 'line') {
          const A = it.a, B = it.b, d = sub(B, A), l = len(d);
          if (l < 1e-6) continue;
          const t = [d[0] / l, d[1] / l, d[2] / l];
          const e1 = Math.abs(t[1]) < 0.9 ? norm(cross(t, [0, 1, 0])) : norm(cross(t, [1, 0, 0])), e2 = cross(t, e1), w = it.w / 2;
          const off = (P0, a, b) => [P0[0] + (e1[0] * a + e2[0] * b) * w, P0[1] + (e1[1] * a + e2[1] * b) * w, P0[2] + (e1[2] * a + e2[2] * b) * w];
          const S = [[1, 1], [-1, 1], [-1, -1], [1, -1]];
          for (let s = 0; s < 4; s++) { const a = S[s], b = S[(s + 1) % 4]; quad(off(A, a[0], a[1]), off(A, b[0], b[1]), off(B, b[0], b[1]), off(B, a[0], a[1]), kk); }
        } else if (it.t === 'halo') halos.push({ p: it.p, sx: it.sx, sy: it.sy, k: kk, blink: it.blink || 0 });
      }
      let n = 0;
      if (GP.length) {
        const gg = new THREE.BufferGeometry();
        gg.setAttribute('position', new THREE.Float32BufferAttribute(GP, 3));
        gg.setAttribute('color', new THREE.Float32BufferAttribute(GC, 3));
        gg.computeBoundingSphere();
        geoms.push(gg);
        const m = new THREE.Mesh(gg, glowMat);
        m.name = 'climb-' + ev.kind + '-glow';
        g.add(m);
        n += GP.length / 9;
      }
      if (halos.length) {
        const hg = new THREE.InstancedBufferGeometry();
        hg.index = qg.index; hg.setAttribute('position', qg.getAttribute('position')); hg.setAttribute('uv', qg.getAttribute('uv'));
        const HPs = [], HS = [], HCl = [], HBk = [];
        for (const h of halos) { HPs.push(h.p[0], h.p[1], h.p[2]); HS.push(h.sx, h.sy); HCl.push(h.k[0], h.k[1], h.k[2]); HBk.push(h.blink); }
        hg.setAttribute('iPos', new THREE.InstancedBufferAttribute(new Float32Array(HPs), 3));
        hg.setAttribute('iSize', new THREE.InstancedBufferAttribute(new Float32Array(HS), 2));
        hg.setAttribute('iCol', new THREE.InstancedBufferAttribute(new Float32Array(HCl), 3));
        hg.setAttribute('iBlink', new THREE.InstancedBufferAttribute(new Float32Array(HBk), 1));
        hg.instanceCount = halos.length;
        geoms.push(hg);
        const hm = new THREE.Mesh(hg, haloMat);
        hm.name = 'climb-' + ev.kind + '-halos';
        hm.frustumCulled = false;
        g.add(hm);
      }
      return { glowTris: n, halos: halos.length };
    };

    /* boxes into one indexed geometry; facade: the city's attributes */
    const boxGeometry = (list, facade) => {
      let nf = 0;
      for (const it of list) for (let f = 0; f < 6; f++) if ((it.open == null ? 0x3f : it.open) & (1 << f)) nf++;
      const pos = new Float32Array(nf * 12), nrm = new Float32Array(nf * 12), col = new Float32Array(nf * 12), idx = new Uint32Array(nf * 6);
      const sd = facade ? new Float32Array(nf * 4) : null, fac = facade ? new Float32Array(nf * 16) : null;
      let v = 0, q = 0;
      for (const it of list) {
        const lo = it.min, hi = it.max, rgb = it.rgb || bone(it.tone + 0.05), om = it.open == null ? 0x3f : it.open;
        for (let f = 0; f < 6; f++) {
          if (!(om & (1 << f))) continue;
          const Fc = FACE[f], n = Fc[4], ta = n[0] ? 2 : (n[2] ? 0 : -1);
          for (let k = 0; k < 4; k++) {
            const c = Fc[k], o = (v + k) * 3, o4 = (v + k) * 4;
            pos[o] = c[0] ? hi[0] : lo[0]; pos[o + 1] = c[1] ? hi[1] : lo[1]; pos[o + 2] = c[2] ? hi[2] : lo[2];
            nrm[o] = n[0]; nrm[o + 1] = n[1]; nrm[o + 2] = n[2];
            col[o] = rgb[0]; col[o + 1] = rgb[1]; col[o + 2] = rgb[2];
            if (facade) {
              sd[v + k] = it.seed;
              fac[o4] = ta < 0 ? 0 : (c[ta] ? hi[ta] - lo[ta] : 0);
              fac[o4 + 1] = ta < 0 ? 0 : hi[ta] - lo[ta];
              fac[o4 + 2] = hi[1]; fac[o4 + 3] = it.prog < 0 ? 4 : it.prog;
            }
          }
          idx[q++] = v; idx[q++] = v + 1; idx[q++] = v + 2; idx[q++] = v; idx[q++] = v + 2; idx[q++] = v + 3;
          v += 4;
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      if (facade) { g.setAttribute('aSeed', new THREE.BufferAttribute(sd, 1)); g.setAttribute('aFac', new THREE.BufferAttribute(fac, 4)); }
      g.setIndex(new THREE.BufferAttribute(idx, 1));
      g.computeBoundingSphere();
      geoms.push(g);
      return { g: g, faces: nf };
    };

    let tris = 0, glowTris = 0, halos = 0;
    const rotorSets = [];
    for (const ev of CL.events) {
      if (ev.kind === 'freighter') continue;
      const g = new THREE.Group();
      g.name = 'climb-' + ev.kind;
      if (ev.kind === 'gate') {
        const sh = boxGeometry(ev.boxes, true);
        const m = new THREE.Mesh(sh.g, facadeMat);
        m.name = 'climb-gate-shell';
        g.add(m);
        tris += sh.faces * 2;
      } else if (ev.kind === 'zeppelin') {
        /* the hull: a body of revolution about the across axis, superellipse profile, panel bands */
        const H = ev.hull, NA = 32, NL = 44, rt = H.axis, ax = ev.n, up = [0, 1, 0];
        const P = [], N = [], Cc = [], I = [];
        const prof = (x) => H.rad * Math.pow(Math.max(0, 1 - Math.pow(Math.min(1, Math.abs(x)), H.exp[0])), H.exp[1]);
        for (let i = 0; i <= NL; i++) {
          const x = -1 + 2 * i / NL, xs = Math.sign(x) * Math.pow(Math.abs(x), 0.8), rr = Math.max(0.01, prof(xs));
          const dx = 0.002, slope = (prof(Math.min(1, xs + dx)) - prof(Math.max(-1, xs - dx))) / (2 * dx) / (H.len / 2);
          const along = xs * H.len / 2, rib = i % 4 === 0;
          for (let j = 0; j <= NA; j++) {
            const a = 2 * Math.PI * j / NA, ca = Math.cos(a), sa = Math.sin(a);
            const off = [ax[0] * ca * rr + rt[0] * along, sa * rr, ax[2] * ca * rr + rt[2] * along];
            P.push(H.c[0] + off[0], H.c[1] + off[1], H.c[2] + off[2]);
            const nr = norm([ax[0] * ca - rt[0] * slope, sa, ax[2] * ca - rt[2] * slope]);
            N.push(nr[0], nr[1], nr[2]);
            const spine = sa > 0.93, band = Math.floor((a / (2 * Math.PI)) * 16) % 2;
            const t = spine ? 0.72 : rib ? 0.2 : 0.48 + 0.05 * band + (sa < -0.6 ? -0.08 : 0);
            const c = bone(t);
            Cc.push(c[0], c[1], c[2]);
          }
        }
        for (let i = 0; i < NL; i++) for (let j = 0; j < NA; j++) {
          const a = i * (NA + 1) + j, b = a + NA + 1;
          I.push(a, a + 1, b, a + 1, b + 1, b);
        }
        /* the other parts as boxes in the same geometry */
        const others = ev.boxes.filter((b) => b.part !== 'hull' && !b.hidden).concat(ev.vis.map((q) => ({ min: q.box.min, max: q.box.max, rgb: q.rgb.map(toLin) })));
        const bx = boxGeometry(others, false);
        const base = P.length / 3;
        const bp = bx.g.getAttribute('position').array, bn = bx.g.getAttribute('normal').array, bc = bx.g.getAttribute('color').array, bi = bx.g.getIndex().array;
        for (let k = 0; k < bp.length; k++) { P.push(bp[k]); N.push(bn[k]); Cc.push(bc[k]); }
        for (let k = 0; k < bi.length; k++) I.push(base + bi[k]);
        bx.g.dispose(); geoms.splice(geoms.indexOf(bx.g), 1);
        const zg = new THREE.BufferGeometry();
        zg.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
        zg.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
        zg.setAttribute('color', new THREE.Float32BufferAttribute(Cc, 3));
        zg.setIndex(I);
        zg.computeBoundingSphere();
        geoms.push(zg);
        const zm = new THREE.Mesh(zg, bodyMat);
        zm.name = 'climb-zeppelin-body';
        g.add(zm);
        tris += I.length / 3;
        /* the rotors: three blades each, one instanced mesh turned in update */
        const bl = new THREE.BoxGeometry(1, 1, 1);
        geoms.push(bl);
        const nB = ev.rotors.length * 3;
        const im = new THREE.InstancedMesh(bl, bodyMat, nB);
        im.name = 'climb-zeppelin-rotors';
        const tc = new THREE.Color(), c = bone(0.12);
        for (let k = 0; k < nB; k++) im.setColorAt(k, tc.setRGB(c[0], c[1], c[2]));
        im.frustumCulled = false;
        g.add(im);
        rotorSets.push({ im: im, rotors: ev.rotors });
        tris += nB * 12;
      }
      const ll = lightLayers(ev, g);
      glowTris += ll.glowTris; halos += ll.halos; tris += ll.glowTris;
      group.add(g);
      parts.push(g);
    }
    const m4 = new THREE.Matrix4(), mb = new THREE.Matrix4(), V = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    const spin = (t) => {
      for (const rs of rotorSets) {
        let k = 0;
        for (const ro of rs.rotors) {
          const a0 = ro.ph + ro.w * t, ax = ro.axis, e1 = Math.abs(ax[1]) < 0.9 ? norm(cross(ax, [0, 1, 0])) : [1, 0, 0], e2 = cross(ax, e1);
          for (let b = 0; b < 3; b++) {
            const a = a0 + b * 2.0944, ca = Math.cos(a), sa = Math.sin(a);
            const d = [e1[0] * ca + e2[0] * sa, e1[1] * ca + e2[1] * sa, e1[2] * ca + e2[2] * sa], w2 = cross(ax, d);
            m4.makeBasis(V[0].fromArray(d), V[1].fromArray(w2), V[2].fromArray(ax));
            mb.makeScale(ro.r, 1.4, 0.4);
            m4.multiply(mb).setPosition(ro.c[0] + d[0] * ro.r / 2, ro.c[1] + d[1] * ro.r / 2, ro.c[2] + d[2] * ro.r / 2);
            rs.im.setMatrixAt(k++, m4);
          }
        }
        rs.im.instanceMatrix.needsUpdate = true;
      }
    };
    spin(0);
    for (const rs of rotorSets) rs.im.computeBoundingSphere();
    const ctr = [(CL.bounds.min[0] + CL.bounds.max[0]) / 2, (CL.bounds.min[1] + CL.bounds.max[1]) / 2, (CL.bounds.min[2] + CL.bounds.max[2]) / 2];
    const update = function (t, cameraPos) {
      haloMat.uniforms.uTime.value = t || 0;
      if (cameraPos) {
        const dx = cameraPos[0] - ctr[0], dz = cameraPos[2] - ctr[2];
        if (dx * dx + dz * dz > 3000 * 3000) return false;
      }
      spin(t || 0);
      return true;
    };
    return {
      group: group, parts: parts, update: update,
      stats: { tris: Math.round(tris), glowTris: glowTris, halos: halos, boxes: CL.boxes.length, parts: parts.length },
      dispose: function () {
        for (const g of geoms) g.dispose();
        for (const m of owned) m.dispose();
        if (group.parent) group.parent.remove(group);
      }
    };
  }

  globalThis.HikyakuClimb = {
    DEF: DEF, ACCENT: ACCENT, WARM: WARM,
    layout: layout, tubeAt: tubeAt, near: near, boxesNear: boxesNear, bounds: bounds, clearance: clearance, contacts: contacts,
    boxDist: boxDist, openingOf: function (cv, u0, u1, r, opts) { return openingOf(Object.assign({}, DEF, opts || {}), cv, u0, u1, r); },
    build: build
  };
})();
