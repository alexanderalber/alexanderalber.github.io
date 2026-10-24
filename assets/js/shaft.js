/* shaft.js -- the ventilation shaft of Hikyaku: a building-scale duct the
 * race flies through, rectangular at both mouths, lofted into a long round
 * machine section with two big round fans and one square PC fan.
 *
 * Ported from the concept phase (2026-10, notes/tools/hikyaku/concepts/
 * shaft-b.html and lib/shaftgen.js, owner's choice "variant B"). New against
 * the concept: a pure, tested layer (section as a signed distance, wall and
 * fan contacts in the record shape of SixDOF.resolve, portal descriptors and
 * a suggested flight path for the route generator), world placement at a
 * yaw that is a multiple of 90 degrees, a housing building around the duct
 * with the mouths in its end facades, both mouths after the portal rule, and
 * the page's atmosphere (hikyaku-city.js makeFog) on every material.
 *
 * Two layers, like menger.js:
 *
 *   - Pure layer, no three.js, no DOM: makeShaft, frameAt, toLocal, toWorld,
 *     loftK, secF, sectionRadius, wallDist, inside, depthIn, near, fanAngle,
 *     contactsWall, contactsFans, portals, flythrough, bounds,
 *     reservedBoxes. notes/dev/shaft.test.mjs checks it.
 *   - Visual layer: build(THREE, shaft, opts). THREE is a parameter, never an
 *     import, because the page loads three.js through an importmap module and
 *     everything shared here is a classic script. The only other global it
 *     touches is ColorRamps (assets/js/colorramps.js, for the bone greys).
 *
 * Layout along s (default length 1500 m): rectangle to 200 m, loft to 290 m,
 * round to 990 m, loft to 1080 m, rectangle to the exit; round fans at 520
 * and 800 m, the square fan at 1240 m.
 *
 * Duct-local coordinates: s the arc length along the centre line from the
 * entry mouth (0) to the exit mouth (length), x to the right of the travel
 * direction, y up from the axis. The centre line is horizontal at the
 * altitude of the origin; it bends only in yaw, so "up" is world up all the
 * way and the frame never twists.
 *
 * The section. Rectangle 110 x 88 m with 8 m chamfers at both ends, a loft
 * over 90 m into a circle of 108 m, round for 700 m, a loft back, and the
 * last rectangular stretch carries the square fan. The section is the zero
 * set of
 *     f(x, y; s) = (1 - k(s)) fRect(x, y) + k(s) fCircle(x, y),
 * fRect the max of the side and chamfer planes, fCircle = |(x, y)| - 54, k
 * the loft weight (smoothstep in, smoothstep out). Both are convex and
 * 1-Lipschitz, so f is too: the section is convex at every s, and -f is a
 * lower bound of the true distance to the wall. wallDist returns -f, so a
 * clearance measured with it is never optimistic. The drawn wall is the
 * same zero set, solved per angle by bisection.
 *
 * The centre line. Two yaw-rate bumps of opposite sign (raised cosine, peak
 * curvature 1 / bendR with bendR 380 to 520 m), so the duct swings sideways
 * by some 60 m and leaves in the direction it came in: both mouths face a
 * world axis. Heading is closed form, the position is integrated at 1 m.
 *
 * Fans. Owner decision (2026-10-25): the fans turn slowly, 20 to 30 s per
 * turn, and are moving obstacles; there is no timing plan, and no ring sits
 * at a fan. Rings go into the free stretches between the obstacles, never
 * within 60 m of a fan plane (or of a mouth), offset from the axis so the
 * pilot has to fly, with the rim at least 15 m from the wall. The fan angle
 * is a closed formula of time (fanAngle), so a run with the same clock sees
 * the same blades.
 *
 * Everything hangs on globalThis.Shaft.
 */
(function () {
  'use strict';

  const RECT = { a: 55, b: 44, c: 8 };
  const ROUND_R = 54;
  const ACCENT = 0x2ee8ff, WARM = 0xffa63d;
  const SQ12 = Math.SQRT1_2;
  const UP = [0, 1, 0];

  const DEF = {
    length: 1500,
    loft: [200, 290, 990, 1080],    /* loft out, round from, round to, rect from */
    bendR: [380, 520], bendW: 180,  /* curvature radius range, bump width */
    housingHW: 90, housingUp: 95,   /* housing half width, roof above the axis */
    proud: 3, collar: 4,            /* mouth collar: proud of the facade, width */
    lead: 80,                       /* approach and leave legs outside the mouths */
    ringR: 10, ringWall: 15, fanClear: 60
  };

  /* ---- small helpers ----------------------------------------------------- */
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function add(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
  function mul(a, s) { return [a[0] * s, a[1] * s, a[2] * s]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function len(a) { return Math.sqrt(dot(a, a)); }
  function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
  function smooth(a, b, x) { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
  function qRot(q, v) {
    const u = [q[1], q[2], q[3]];
    const t = mul(cross(u, v), 2);
    return add(add(v, mul(t, q[0])), cross(u, t));
  }

  /* ---- the section ------------------------------------------------------- */
  function fRect(x, y) {
    const ax = Math.abs(x), ay = Math.abs(y);
    return Math.max(ax - RECT.a, ay - RECT.b, (ax + ay - (RECT.a + RECT.b - RECT.c)) * SQ12);
  }
  function secF(k, x, y) {
    const fr = fRect(x, y);
    if (k <= 0) return fr;
    const fc = Math.hypot(x, y) - ROUND_R;
    return fr + k * (fc - fr);
  }
  /* gradient of f in (x, y); length at most 1 */
  function secGrad(k, x, y) {
    const ax = Math.abs(x), ay = Math.abs(y), sx = x < 0 ? -1 : 1, sy = y < 0 ? -1 : 1;
    const p0 = ax - RECT.a, p1 = ay - RECT.b, p2 = (ax + ay - (RECT.a + RECT.b - RECT.c)) * SQ12;
    let gx, gy;
    if (p0 >= p1 && p0 >= p2) { gx = sx; gy = 0; } else if (p1 >= p2) { gx = 0; gy = sy; } else { gx = sx * SQ12; gy = sy * SQ12; }
    if (k > 0) {
      const r = Math.hypot(x, y) || 1e-9;
      gx += k * (x / r - gx); gy += k * (y / r - gy);
    }
    return [gx, gy];
  }
  /* radius of the wall along polar angle th at loft weight k (bisection) */
  function sectionRadius(k, th) {
    const c = Math.cos(th), s = Math.sin(th);
    let lo = 0, hi = 90;
    for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (secF(k, m * c, m * s) < 0) lo = m; else hi = m; }
    return (lo + hi) / 2;
  }
  function loftK(sh, s) {
    const L = sh.loft;
    return smooth(L[0], L[1], s) * (1 - smooth(L[2], L[3], s));
  }

  /* ---- placement and the centre line ------------------------------------
     World forward of yaw (three.js rotation.y convention, as menger.js):
     dir0 = (-sin yaw, 0, -cos yaw), right0 = (cos yaw, 0, -sin yaw). */
  function bumpInt(x, w) {
    if (x <= -w / 2) return 0;
    if (x >= w / 2) return w / 2;
    return 0.5 * (x + w / 2) + w / (4 * Math.PI) * Math.sin(2 * Math.PI * x / w);
  }
  function psiAt(sh, s) {
    const sc = clamp(s, 0, sh.length);
    let p = 0;
    for (const b of sh.bends) p += b.k * bumpInt(sc - b.s, b.w);
    return p;
  }
  function curvAt(sh, s) {
    let k = 0;
    for (const b of sh.bends) { const x = s - b.s; if (Math.abs(x) < b.w / 2) k += b.k * 0.5 * (1 + Math.cos(2 * Math.PI * x / b.w)); }
    return k;
  }

  function makeShaft(seed, opts) {
    opts = opts || {};
    const C = Object.assign({}, DEF, opts);
    C.loft = (opts.loft || DEF.loft).slice();
    const L = C.length;
    if (!(L >= C.loft[3] + 220)) throw new Error('Shaft: length must leave 220 m after the second loft');
    const yaw = opts.yaw || 0;
    const q = yaw / (Math.PI / 2);
    if (Math.abs(q - Math.round(q)) > 1e-6) throw new Error('Shaft: yaw must be a multiple of 90 degrees');
    const cy = Math.round(Math.cos(yaw)), sy = Math.round(Math.sin(yaw));
    const o = opts.origin;
    const origin = Array.isArray(o) ? o.slice(0, 3) : o ? [o.x || 0, o.y || 0, o.z || 0] : [0, 100, 0];
    const rng = mulberry32((seed >>> 0) ^ 0x5ad7f00d);
    const sign = opts.bendSign ? (opts.bendSign < 0 ? -1 : 1) : (rng() < 0.5 ? -1 : 1);
    const bendR = C.bendR[0] + rng() * (C.bendR[1] - C.bendR[0]);
    const l1 = C.loft[1];
    const sh = {
      seed: seed >>> 0, cfg: C, length: L, yaw: yaw, origin: origin, yc: origin[1],
      dir0: [-sy, 0, -cy], right0: [cy, 0, -sy],
      loft: C.loft, R: ROUND_R, rect: RECT,
      bends: [{ s: l1 + 120, w: C.bendW, k: sign / bendR }, { s: l1 + 380, w: C.bendW, k: -sign / bendR }],
      bendSign: sign, bendR: bendR,
      housing: { hw: C.housingHW, top: origin[1] + C.housingUp, proud: C.proud, collar: C.collar }
    };
    /* integrate the plane curve at 1 m (midpoint heading) */
    const n = Math.ceil(L), step = L / n;
    const A = new Float64Array(n + 1), B = new Float64Array(n + 1);
    for (let i = 0; i < n; i++) {
      const pm = psiAt(sh, (i + 0.5) * step);
      A[i + 1] = A[i] + Math.cos(pm) * step;
      B[i + 1] = B[i] + Math.sin(pm) * step;
    }
    sh.n = n; sh.step = step; sh._A = A; sh._B = B;
    sh.minRadius = 1 / Math.max(1e-9, ...sh.bends.map((b) => Math.abs(b.k)));

    /* fans: two round ones in the round section, a square one 260 m before
       the exit; slow (20 to 30 s per turn), random sense and phase */
    const fan = (s, kind) => {
      const round = kind === 'round';
      return {
        s: s, kind: kind, radius: round ? ROUND_R - 3.4 : 39.4, hub: round ? 10 : 8, blades: 5,
        period: 20 + rng() * 10, phase: rng() * Math.PI * 2, dir: rng() < 0.5 ? -1 : 1,
        pitch: 0.42, cover: 0.3, sweep: round ? 0.14 : 0.16, thick: round ? 1.2 : 1.0,
        /* along-T extent of the hub and its mount (upstream negative) */
        hubFront: -4.8, hubBack: round ? 13 : 9,
        /* static members behind the rotor: angle, along-T, radial range, half sizes */
        spokes: round
          ? [0, 1, 2].map((k) => ({ a: Math.PI / 2 + k * 2 * Math.PI / 3, z: 9, r0: 9, r1: ROUND_R, ht: 1.3, hz: 1.5 }))
          : [0, 1, 2].map((k) => ({ a: Math.PI / 2 + k * 2 * Math.PI / 3 + 0.2, z: 6.4, r0: 6.4, r1: 40.9, ht: 1.1, hz: 1.3 })),
        /* the square fan's plate: solid outside the hole, |along-T| < plateHZ */
        hole: round ? null : 40, plateHZ: round ? 0 : 5.6,
        viaR: round ? 30 : 24
      };
    };
    sh.fans = [fan(l1 + 230, 'round'), fan(l1 + 510, 'round'), fan(L - 260, 'square')];
    sh.layout = dressingLayout(sh);
    sh.fanFrames = sh.fans.map((f) => frameAt(sh, f.s));
    sh.T0 = frameAt(sh, 0).T; sh.T1 = frameAt(sh, L).T;
    sh._bounds = null;
    return sh;
  }

  /* frame at s: p (on the axis), T (travel), N (right); B is world up. Beyond
     the mouths the axis runs on straight. */
  function frameAt(sh, s) {
    const L = sh.length, sc = clamp(s, 0, L);
    const ps = psiAt(sh, sc), c = Math.cos(ps), si = Math.sin(ps);
    const d0 = sh.dir0, r0 = sh.right0, o = sh.origin;
    const T = [c * d0[0] + si * r0[0], 0, c * d0[2] + si * r0[2]];
    const N = [-si * d0[0] + c * r0[0], 0, -si * d0[2] + c * r0[2]];
    const f = sc / sh.step, i = Math.min(sh.n - 1, Math.floor(f)), u = f - i;
    const a = sh._A[i] + (sh._A[i + 1] - sh._A[i]) * u, b = sh._B[i] + (sh._B[i + 1] - sh._B[i]) * u;
    const p = [o[0] + d0[0] * a + r0[0] * b, o[1], o[2] + d0[2] * a + r0[2] * b];
    const e = s - sc;
    if (e !== 0) { p[0] += T[0] * e; p[2] += T[2] * e; }
    return { p: p, T: T, N: N, s: s };
  }
  function toWorld(sh, s, x, y) {
    const f = frameAt(sh, s);
    return [f.p[0] + f.N[0] * x, f.p[1] + y, f.p[2] + f.N[2] * x];
  }
  /* world -> duct-local { s, x, y }, by Newton on the centre line */
  function toLocal(sh, p) {
    const L = sh.length, o = sh.origin;
    let s = clamp((p[0] - o[0]) * sh.dir0[0] + (p[2] - o[2]) * sh.dir0[2], 0, L);
    let f;
    for (let it = 0; it < 12; it++) {
      f = frameAt(sh, s);
      const ds = (p[0] - f.p[0]) * f.T[0] + (p[2] - f.p[2]) * f.T[2];
      const ns = clamp(s + ds, 0, L);
      if (Math.abs(ns - s) < 1e-7) { s = ns; break; }
      s = ns;
    }
    f = frameAt(sh, s);
    const dx = p[0] - f.p[0], dz = p[2] - f.p[2];
    return { s: s + dx * f.T[0] + dz * f.T[2], x: dx * f.N[0] + dz * f.N[2], y: p[1] - sh.yc, f: f };
  }

  /* Signed distance to the duct wall (positive inside, a lower bound of the
     true distance, see the header). Beyond the mouths the point is outside. */
  function wallDist(sh, p) {
    const l = toLocal(sh, p), L = sh.length;
    const sc = clamp(l.s, 0, L);
    let d = -secF(loftK(sh, sc), l.x, l.y);
    if (l.s < 0) d = Math.min(d, l.s);
    if (l.s > L) d = Math.min(d, L - l.s);
    return d;
  }
  function inside(sh, p) { return wallDist(sh, p) > 0; }
  /* How deep inside the duct p is, metres from the nearer mouth, or -1. */
  function depthIn(sh, p) {
    const l = toLocal(sh, p);
    if (l.s < 0 || l.s > sh.length) return -1;
    if (secF(loftK(sh, l.s), l.x, l.y) >= 0) return -1;
    return Math.min(l.s, sh.length - l.s);
  }
  /* Is p within r of the housing's world bounds? The cheap gate for the
     contact queries. */
  function near(sh, p, r) {
    const b = bounds(sh), m = r || 0;
    return p[0] >= b.min[0] - m && p[0] <= b.max[0] + m && p[1] >= b.min[1] - m && p[1] <= b.max[1] + m &&
      p[2] >= b.min[2] - m && p[2] <= b.max[2] + m;
  }

  /* ---- dressing layout (shared by the contacts and the drawing) --------- */
  function dressingLayout(sh) {
    const L = sh.length, lf = sh.loft;
    const busy = (s, d) => sh.fans.some((f) => Math.abs(s - f.s) < d);
    const isRect = (s) => s < lf[0] - 1 || s > lf[3] + 1;
    const ribs = [];
    for (let s = 40; s < L - 10; s += 40) {
      if (!isRect(s) || busy(s, 8) || Math.abs(s - lf[0]) < 6 || Math.abs(s - lf[3]) < 6) continue;
      const heavy = Math.round(s / 40) % 4 === 0;
      ribs.push({ s: s, depth: heavy ? 3.6 : 1.6, width: heavy ? 3 : 1.2, heavy: heavy, band: heavy });
    }
    for (const s of lf) ribs.push({ s: s, depth: 5, width: 4.5, heavy: true, band: true, collar: true });
    for (let s = lf[1] + 20, j = 1; s < lf[2] - 6; s += 20, j++) {
      if (busy(s, 8)) continue;
      const heavy = j % 4 === 0;
      ribs.push({ s: s, depth: heavy ? 4.5 : 2.2, width: heavy ? 3.6 : 1.6, heavy: heavy, band: heavy, brackets: heavy });
    }
    ribs.sort((a, b) => a.s - b.s);
    /* pipes along the round section, broken at the fans */
    const pipes = [];
    const spans = [];
    let a = lf[1] + 6;
    for (const f of sh.fans) if (f.s > lf[1] && f.s < lf[2]) { spans.push([a, f.s - 8]); a = f.s + 14; }
    spans.push([a, lf[2] - 6]);
    for (const P of [[-0.34, 2.6, 0], [-0.52, 1.9, 1], [-0.68, 1.9, 0], [2.52, 2.2, 1], [2.7, 1.5, 0]]) {
      for (const sp of spans) pipes.push({ th: P[0], r: P[1], alt: P[2], s0: sp[0], s1: sp[1], rc: ROUND_R - 3.6 - P[1] });
    }
    /* catwalk on the floor of the round section */
    const walk = { y: -ROUND_R + 9, hw: 11, rail: 3.2, segs: [] };
    for (let s = lf[1] + 4; s < lf[2] - 4; s += 20) if (!busy(s, 9) && !busy(s + 20, 9)) walk.segs.push([s, s + 20]);
    /* lamp stations: ceiling bars in the rectangular parts, two wall lamps
       in the round part, none in the lofts */
    const lamps = [];
    for (let s = 20; s < L - 8; s += 40) {
      const k = loftK(sh, s);
      if (k < 0.01) lamps.push({ s: s, kind: 'rect' });
      else if (k > 0.99) lamps.push({ s: s, kind: 'round' });
    }
    return { ribs: ribs, pipes: pipes, walk: walk, lamps: lamps, spans: spans };
  }

  /* ---- fans -------------------------------------------------------------- */
  function fanAngle(fan, t) { return fan.phase + fan.dir * 2 * Math.PI * t / fan.period; }
  function fanOmega(fan) { return fan.dir * 2 * Math.PI / fan.period; }
  /* blade half angle (in the rotor plane, before pitch) at normalised radius u */
  function bladeHalf(fan, u) { return fan.cover * Math.PI / fan.blades / Math.cos(fan.pitch) * (0.62 + 0.38 * u); }
  function bladeSweep(fan, u) { return fan.sweep * Math.pow(Math.max(0, u), 1.4); }

  /* ---- contacts ----------------------------------------------------------
     Hull points against the duct, in the record SixDOF.resolve takes:
     { n, r, pen, key, vs } with n the world normal the hull must move
     along, r the lever arm, pen the depth, key the group, vs the surface
     velocity (null for the static walls).

     contactsWall: the duct wall (n points inward, toward the axis), the
     dressing that sticks out of it far enough to matter (ribs and flanges,
     the pipes, the catwalk), and the housing building from the outside (its
     sides, roof and end facades, and the collar around each mouth). A point
     in the solid between the duct and the housing face leaves through the
     nearer of the two. Keys: 'sw' for the duct side, 'sh' for the housing. */
  function contactsWall(st, pts, sh) {
    const out = [], L = sh.length, H = sh.housing, lay = sh.layout;
    const b = bounds(sh);
    for (let i = 0; i < pts.length; i++) {
      const r = qRot(st.q, pts[i]);
      const wp = [st.p[0] + r[0], st.p[1] + r[1], st.p[2] + r[2]];
      if (wp[0] < b.min[0] - 2 || wp[0] > b.max[0] + 2 || wp[2] < b.min[2] - 2 || wp[2] > b.max[2] + 2 || wp[1] > H.top + 1) continue;
      const l = toLocal(sh, wp), f = l.f, s = l.s, x = l.x, y = l.y;
      if (s < -H.proud || s > L + H.proud || Math.abs(x) >= H.hw || wp[1] >= H.top || wp[1] <= 0) continue;
      const sc = clamp(s, 0, L), k = loftK(sh, sc);
      const F = secF(k, x, y);
      const T = f.T, N = f.N;
      const toW = (nx, ny) => [N[0] * nx, ny, N[2] * nx];
      if (s < 0 || s > L) {
        /* the collar around a mouth: a frame `collar` wide, `proud` deep */
        if (F <= 0 || F >= H.collar) continue;
        const g = secGrad(k, x, y), gl = Math.hypot(g[0], g[1]) || 1;
        const pf = s < 0 ? s + H.proud : L + H.proud - s;
        if (pf < F / gl) out.push({ n: s < 0 ? mul(T, -1) : T.slice(), r: r, pen: pf, key: 'sh', vs: null, part: 'collar' });
        else out.push({ n: toW(-g[0] / gl, -g[1] / gl), r: r, pen: F / gl, key: 'sw', vs: null, part: 'collar' });
        continue;
      }
      if (F > 0) {
        const g = secGrad(k, x, y), gl = Math.hypot(g[0], g[1]) || 1;
        let best = { pen: F / gl, n: toW(-g[0] / gl, -g[1] / gl), key: 'sw', part: 'wall' };
        const cand = (pen, n, part) => { if (pen < best.pen) best = { pen: pen, n: n, key: 'sh', part: part }; };
        cand(H.hw - Math.abs(x), toW(x < 0 ? -1 : 1, 0), 'housing');
        cand(H.top - wp[1], [0, 1, 0], 'housing');
        cand(s, mul(sh.T0, -1), 'housing');
        cand(L - s, sh.T1.slice(), 'housing');
        out.push({ n: best.n, r: r, pen: best.pen, key: best.key, vs: null, part: best.part });
        continue;
      }
      /* inside the duct: the dressing that reaches into the flight space */
      const w = -F;
      for (const rb of lay.ribs) {
        if (Math.abs(s - rb.s) >= rb.width / 2 || w >= rb.depth) continue;
        const g = secGrad(k, x, y), gl = Math.hypot(g[0], g[1]) || 1;
        const pIn = rb.depth - w, pS = rb.width / 2 - Math.abs(s - rb.s);
        if (pIn <= pS) out.push({ n: toW(-g[0] / gl, -g[1] / gl), r: r, pen: pIn, key: 'sw', vs: null, part: 'rib' });
        else out.push({ n: s < rb.s ? mul(T, -1) : T.slice(), r: r, pen: pS, key: 'sw', vs: null, part: 'rib' });
      }
      if (k > 0.99) {
        for (const pp of lay.pipes) {
          if (s < pp.s0 || s > pp.s1) continue;
          const cx = Math.cos(pp.th) * pp.rc, cyy = Math.sin(pp.th) * pp.rc;
          const dx = x - cx, dy = y - cyy, d = Math.hypot(dx, dy);
          if (d >= pp.r) continue;
          const nx = d > 1e-9 ? dx / d : -Math.cos(pp.th), ny = d > 1e-9 ? dy / d : -Math.sin(pp.th);
          out.push({ n: toW(nx, ny), r: r, pen: pp.r - d, key: 'sw', vs: null, part: 'pipe' });
        }
        const wk = lay.walk;
        if (Math.abs(x) < wk.hw && y < wk.y + wk.rail && y > wk.y - 4) {
          for (const sg of wk.segs) {
            if (s < sg[0] || s > sg[1]) continue;
            const pUp = wk.y + wk.rail - y, pSide = wk.hw - Math.abs(x);
            if (pUp <= pSide) out.push({ n: [0, 1, 0], r: r, pen: pUp, key: 'sw', vs: null, part: 'catwalk' });
            else out.push({ n: toW(x < 0 ? -1 : 1, 0), r: r, pen: pSide, key: 'sw', vs: null, part: 'catwalk' });
            break;
          }
        }
      }
    }
    return out;
  }

  /* contactsFans: every blade is three thin boxes along its radius, each
     pitched like the drawn blade, turning about the duct axis at
     fanAngle(fan, t). A blade contact carries the surface velocity
     omega x rel, so a blade shoves. The hub with its mount is a cylinder on
     the axis, the spokes behind the round rotors and the struts behind the
     square one are static boxes, the square fan's plate is solid outside
     its round hole. Keys 'f<fan>b<blade>', 'f<fan>h', 'f<fan>s', 'f<fan>p'.
     In the fan's station frame z is AGAINST travel (x right, y up, z = -T),
     as the drawn fans are. */
  function contactsFans(st, pts, sh, t) {
    const out = [];
    for (let fi = 0; fi < sh.fans.length; fi++) {
      const fan = sh.fans[fi], F = sh.fanFrames[fi];
      const C = F.p, T = F.T, N = F.N;
      const zc = (st.p[0] - C[0]) * T[0] + (st.p[2] - C[2]) * T[2];
      if (Math.abs(zc) > 26) continue;
      const om = fanOmega(fan), phi = fanAngle(fan, t);
      const wv = mul(T, -om);   /* angular velocity about z = -T */
      const toW = (lx, ly, lz) => [N[0] * lx - T[0] * lz, ly, N[2] * lx - T[2] * lz];
      const wW = qRot(st.q, st.w || [0, 0, 0]);
      for (let i = 0; i < pts.length; i++) {
        const r = qRot(st.q, pts[i]);
        const rel = [st.p[0] + r[0] - C[0], st.p[1] + r[1] - C[1], st.p[2] + r[2] - C[2]];
        const along = rel[0] * T[0] + rel[2] * T[2];
        if (along < -8 || along > 16) continue;
        const x = rel[0] * N[0] + rel[2] * N[2], y = rel[1], z = -along;
        const rho = Math.hypot(x, y);
        /* hub and mount */
        if (rho < fan.hub && along > fan.hubFront && along < fan.hubBack) {
          const pR = fan.hub - rho, pF = along - fan.hubFront, pB = fan.hubBack - along;
          const spin = along < 3.5;
          let n, pen;
          if (pR <= pF && pR <= pB) { pen = pR; n = rho > 1e-9 ? toW(x / rho, y / rho, 0) : toW(1, 0, 0); }
          else if (pF <= pB) { pen = pF; n = mul(T, -1); } else { pen = pB; n = T.slice(); }
          out.push({ n: n, r: r, pen: pen, key: 'f' + fi + 'h', vs: spin ? cross(wv, rel) : null, part: 'hub', fan: fi });
          continue;
        }
        /* the square fan's plate around its hole */
        if (fan.hole && Math.abs(along) < fan.plateHZ && rho > fan.hole) {
          const pA = fan.plateHZ - Math.abs(along), pR = rho - fan.hole;
          if (pA <= pR) out.push({ n: along < 0 ? mul(T, -1) : T.slice(), r: r, pen: pA, key: 'f' + fi + 'p', vs: null, part: 'plate', fan: fi });
          else out.push({ n: toW(-x / rho, -y / rho, 0), r: r, pen: pR, key: 'f' + fi + 'p', vs: null, part: 'plate', fan: fi });
          continue;
        }
        /* spokes and struts */
        for (const sp of fan.spokes) {
          const ca = Math.cos(sp.a), sa = Math.sin(sp.a);
          const u = x * ca + y * sa, v = -x * sa + y * ca, w = along - sp.z;
          const hr = (sp.r1 - sp.r0) / 2, um = u - (sp.r0 + hr);
          if (Math.abs(um) >= hr || Math.abs(v) >= sp.ht || Math.abs(w) >= sp.hz) continue;
          const pv = sp.ht - Math.abs(v), pw = sp.hz - Math.abs(w);
          if (pv <= pw) { const sg = v < 0 ? -1 : 1; out.push({ n: toW(-sa * sg, ca * sg, 0), r: r, pen: pv, key: 'f' + fi + 's', vs: null, part: 'spoke', fan: fi }); }
          else out.push({ n: w < 0 ? mul(T, -1) : T.slice(), r: r, pen: pw, key: 'f' + fi + 's', vs: null, part: 'spoke', fan: fi });
        }
        /* blades */
        const r0 = fan.hub - 0.6, R = fan.radius;
        if (rho < r0 || rho > R || Math.abs(z) > 10) continue;
        const cp = Math.cos(fan.pitch), spt = Math.sin(fan.pitch);
        const ht = fan.thick / 2 + 0.4;
        const th = Math.atan2(y, x);
        for (let bi = 0; bi < fan.blades; bi++) {
          const tb = phi + bi * 2 * Math.PI / fan.blades;
          for (let sg = 0; sg < 3; sg++) {
            const ua = sg / 3, ub = (sg + 1) / 3, um = (ua + ub) / 2;
            const ra = r0 + (R - r0) * ua, rb = r0 + (R - r0) * ub, rm = (ra + rb) / 2;
            const ang = tb + bladeSweep(fan, um);
            let da = th - ang;
            da -= Math.round(da / (2 * Math.PI)) * 2 * Math.PI;
            if (Math.abs(da) > 0.9) continue;
            const ca = Math.cos(ang), sa = Math.sin(ang);
            const qx = x * ca + y * sa, qy = -x * sa + y * ca, qz = z;
            const hc = rb * bladeHalf(fan, ub);
            const u = qx - rm, v = qy * cp + qz * spt, w = -qy * spt + qz * cp;
            const hr = (rb - ra) / 2;
            if (Math.abs(u) >= hr || Math.abs(v) >= hc || Math.abs(w) >= ht) continue;
            /* Out through a plate face, as a rule: the point got in through
               the face it moved through relative to the blade (usually the
               leading face sweeping over it), so it leaves through that
               face. Only near the chord's edge does the edge win. */
            const vs = cross(wv, rel);
            const toWorldB = (l) => toW(l[0] * ca - l[1] * sa, l[0] * sa + l[1] * ca, l[2]);
            const nP = toWorldB([0, -spt, cp]);
            const vp = add(st.v || [0, 0, 0], cross(wW, r));
            const dv = dot(sub(vp, vs), nP);
            const s2 = Math.abs(dv) > 0.05 ? (dv > 0 ? -1 : 1) : (w < 0 ? -1 : 1);
            const pw = ht - s2 * w, pv = hc - Math.abs(v);
            let n, pen;
            if (pw <= pv + 1) { n = mul(nP, s2); pen = pw; }
            else { const s3 = v < 0 ? -1 : 1; n = toWorldB([0, cp * s3, spt * s3]); pen = pv; }
            out.push({ n: n, r: r, pen: pen, key: 'f' + fi + 'b' + bi, vs: vs, part: 'blade', fan: fi, blade: bi });
          }
        }
      }
    }
    return out;
  }

  /* ---- portals -----------------------------------------------------------
     { id, p, n, w, h, right, up, depth, kind: 'portal', biome: 'shaft' } in
     the shape of Menger.portals: p the centre of the mouth on the facade
     plane (on the axis), n the outward normal, right and up the frame of a
     pilot flying in (travel -n), w x h the opening (110 x 88 m, chamfered
     8 m at the corners), depth the straight free run behind the opening
     (to the first bend or fan). */
  function portals(sh) {
    const L = sh.length, f0 = frameAt(sh, 0), f1 = frameAt(sh, L);
    const firstBend = Math.min.apply(null, sh.bends.map((b) => b.s - b.w / 2));
    const lastBend = Math.max.apply(null, sh.bends.map((b) => b.s + b.w / 2));
    const firstFan = Math.min.apply(null, sh.fans.map((f) => f.s)), lastFan = Math.max.apply(null, sh.fans.map((f) => f.s));
    const mk = (id, f, n, depth) => {
      const din = mul(n, -1);
      return { id: id, p: f.p.slice(), n: n, w: 2 * RECT.a, h: 2 * RECT.b, right: cross(din, UP), up: UP.slice(),
        depth: depth, kind: 'portal', biome: 'shaft', chamfer: RECT.c };
    };
    return [mk('entry', f0, mul(f0.T, -1), Math.min(firstBend, firstFan)),
      mk('exit', f1, f1.T.slice(), L - Math.max(lastBend, lastFan))];
  }

  /* ---- a path through the duct ------------------------------------------
     Waypoints, in order: approach (lead metres before the entry mouth, on
     the axis), the entry portal, rings in the free stretches between the
     mouths and the fans, a pass point at every fan plane (in the gap
     between two spokes, half way out the blade, so the line never runs
     through the hub), the exit portal, leave. Rings: one per free stretch
     (fanClear, 60 m, from every fan plane and mouth on both sides), placed
     in the middle give or take 20 %, offset from the axis by 14 to 28 m in
     a seeded direction, pulled in until the rim keeps ringWall (15 m) from
     the wall. Owner decision: no ring at a fan.
     Returns { entry, exit, waypoints, points, length, ringClear } with
     waypoints[i] = { p, dir, up, kind, s, x, y, portal, fan }, kind one of
     'approach', 'portal', 'ring', 'fan', 'leave'. */
  function flythrough(sh, opts) {
    opts = opts || {};
    const C = sh.cfg, L = sh.length;
    const lead = opts.lead == null ? C.lead : opts.lead;
    const ringR = opts.ringR == null ? C.ringR : opts.ringR;
    const wallM = ringR + (opts.ringWall == null ? C.ringWall : opts.ringWall);
    const clr = opts.fanClear == null ? C.fanClear : opts.fanClear;
    const rng = mulberry32(((sh.seed >>> 0) * 7 + 3) ^ 0x31c3a1);
    const obst = [0].concat(sh.fans.map((f) => f.s)).concat([L]).sort((a, b) => a - b);
    const rings = [];
    /* the offset direction walks by at most 45 degrees from ring to ring,
       so the line weaves through the duct instead of jumping across it
       (a Hermite leg of chord c that swings sideways by d bends at about
       6 d / c^2) */
    let th = rng() * Math.PI * 2;
    for (let i = 0; i + 1 < obst.length; i++) {
      const lo = obst[i] + clr, hi = obst[i + 1] - clr;
      if (hi - lo < 2) continue;
      const s = (lo + hi) / 2 + (rng() - 0.5) * (hi - lo) * 0.4;
      if (rings.length) th += (rng() - 0.5) * Math.PI / 2;
      let rho = 14 + rng() * 14;
      const k = loftK(sh, s);
      while (rho > 0 && -secF(k, rho * Math.cos(th), rho * Math.sin(th)) < wallM) rho -= 0.5;
      rho = Math.max(0, rho);
      rings.push({ s: s, x: rho * Math.cos(th), y: rho * Math.sin(th), th: th });
      th = Math.atan2(Math.sin(th), Math.cos(th));
    }
    const pts = [];
    const f0 = frameAt(sh, 0), f1 = frameAt(sh, L);
    pts.push({ s: -lead, x: 0, y: 0, kind: 'approach' });
    pts.push({ s: 0, x: 0, y: 0, kind: 'portal', portal: 'entry' });
    for (const rg of rings) pts.push({ s: rg.s, x: rg.x, y: rg.y, kind: 'ring', th: rg.th });
    sh.fans.forEach((fan, fi) => {
      /* the circular mean of the neighbouring rings' angles, snapped to the
         nearest gap between two spokes */
      const before = rings.filter((q) => q.s < fan.s).pop(), after = rings.find((q) => q.s > fan.s);
      let cx = 0, cy = 0;
      for (const q of [before, after]) if (q) { cx += Math.cos(q.th); cy += Math.sin(q.th); }
      const want = cx * cx + cy * cy > 1e-9 ? Math.atan2(cy, cx) : 0;
      let best = 0, bd = Infinity;
      for (let k = 0; k < fan.spokes.length; k++) {
        const g = fan.spokes[k].a + Math.PI / fan.spokes.length;
        let d = want - g;
        d -= Math.round(d / (2 * Math.PI)) * 2 * Math.PI;
        if (Math.abs(d) < bd) { bd = Math.abs(d); best = g; }
      }
      pts.push({ s: fan.s, x: fan.viaR * Math.cos(best), y: fan.viaR * Math.sin(best), kind: 'fan', fan: fi, th: best });
    });
    pts.push({ s: L, x: 0, y: 0, kind: 'portal', portal: 'exit' });
    pts.push({ s: L + lead, x: 0, y: 0, kind: 'leave' });
    pts.sort((a, b) => a.s - b.s);
    const wps = pts.map((q) => {
      const f = frameAt(sh, q.s);
      return { p: [f.p[0] + f.N[0] * q.x, f.p[1] + q.y, f.p[2] + f.N[2] * q.x], dir: f.T.slice(), up: UP.slice(),
        kind: q.kind, s: q.s, x: q.x, y: q.y, portal: q.portal || null, fan: q.fan == null ? null : q.fan };
    });
    let length = 0, ringClear = Infinity;
    for (let i = 1; i < wps.length; i++) length += len(sub(wps[i].p, wps[i - 1].p));
    for (const w of wps) if (w.kind === 'ring') ringClear = Math.min(ringClear, wallDist(sh, w.p) - ringR);
    void f0; void f1;
    return { entry: 'entry', exit: 'exit', waypoints: wps, points: wps.map((w) => w.p), length: length, ringClear: ringClear };
  }

  /* ---- the envelope ------------------------------------------------------
     reservedBoxes: world AABBs that together cover the housing (and so the
     duct and the mouth collars), one per 100 m of axis, grown by 2 m and
     reaching 30 m over the roof, for the city's reserved list: it builds
     nothing in them (they stand on the ground). bounds: their union. */
  function reservedBoxes(sh, opts) {
    const o = opts || {}, grow = o.grow == null ? 2 : o.grow, over = o.over == null ? 30 : o.over;
    const H = sh.housing, L = sh.length, out = [];
    const s0 = -H.proud - 1, s1 = L + H.proud + 1, nC = Math.max(1, Math.ceil((s1 - s0) / 100));
    for (let c = 0; c < nC; c++) {
      const a = s0 + (s1 - s0) * c / nC, b = s0 + (s1 - s0) * (c + 1) / nC;
      const mn = [Infinity, 0, Infinity], mx = [-Infinity, H.top + over, -Infinity];
      for (let k = 0; k <= 10; k++) {
        const s = a + (b - a) * k / 10;
        for (const x of [-H.hw, H.hw]) {
          const p = toWorld(sh, s, x, 0);
          mn[0] = Math.min(mn[0], p[0]); mx[0] = Math.max(mx[0], p[0]);
          mn[2] = Math.min(mn[2], p[2]); mx[2] = Math.max(mx[2], p[2]);
        }
      }
      /* the curve bulges between the samples by at most (10 m)^2 / (8 R) */
      const bulge = 100 / (8 * sh.minRadius) + grow;
      out.push({ min: [mn[0] - bulge, 0, mn[2] - bulge], max: [mx[0] + bulge, mx[1], mx[2] + bulge] });
    }
    return out;
  }
  function bounds(sh) {
    if (sh._bounds) return sh._bounds;
    const bs = reservedBoxes(sh);
    const mn = [Infinity, 0, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    for (const b of bs) for (let a = 0; a < 3; a++) { mn[a] = Math.min(mn[a], b.min[a]); mx[a] = Math.max(mx[a], b.max[a]); }
    sh._bounds = { min: mn, max: mx };
    return sh._bounds;
  }

  /* =====================================================================
     Visual layer. Everything below takes THREE as a parameter.
     ===================================================================== */
  function boneStops() {
    const CR = globalThis.ColorRamps;
    const r = CR && CR.rampById('bone');
    if (!r || r.id !== 'bone') {
      throw new Error('Shaft.build needs ColorRamps: load /assets/js/colorramps.js before shaft.js runs build()');
    }
    return r.stops;
  }
  function boneRGB(stops, t) {
    t = Math.min(1, Math.max(0, t)) * (stops.length - 1);
    const i = Math.min(stops.length - 2, Math.floor(t)), f = t - i;
    const a = stops[i], b = stops[i + 1];
    return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
  }
  function toLin(c) { return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
  function hexLin(hex, gain) {
    const g = gain == null ? 1 : gain;
    return [toLin(((hex >> 16) & 255) / 255) * g, toLin(((hex >> 8) & 255) / 255) * g, toLin((hex & 255) / 255) * g];
  }

  /* ---- geometry batches ---------------------------------------------------
     DuctBatch collects triangles given in duct-local coordinates (x, y, s)
     and maps them into the world along the bent centre line, so a pipe or
     a strip follows the duct by construction. Every vertex carries aLoc
     (its local x, y, s) and aFN (the frame's right vector), which the duct
     lighting reads, plus a linear colour. Triangles are wound so that the
     given normal is their front side (the materials are double sided, and
     three flips the normal of a back face, so winding and normal must
     agree). */
  function DuctBatch(sh) {
    this.sh = sh; this.P = []; this.N = []; this.C = []; this.L = []; this.F = []; this.U = []; this.X = [];
    this.cache = new Map();
  }
  DuctBatch.prototype.frame = function (s) {
    const key = Math.round(s * 1000);
    let f = this.cache.get(key);
    if (!f) { f = frameAt(this.sh, s); this.cache.set(key, f); }
    return f;
  };
  DuctBatch.prototype.world = function (q) {
    const f = this.frame(q[2]);
    return [f.p[0] + f.N[0] * q[0], f.p[1] + q[1], f.p[2] + f.N[2] * q[0]];
  };
  DuctBatch.prototype.wn = function (q, n) {
    const f = this.frame(q[2]);
    return [f.N[0] * n[0] + f.T[0] * n[2], n[1], f.N[2] * n[0] + f.T[2] * n[2]];
  };
  /* one triangle: corners in local coordinates, normals in local (nx, ny,
     ns) per corner or one for all, colour, optional uv per corner, aux */
  DuctBatch.prototype.tri = function (A, B, C, n, col, uv, aux) {
    const nA = n[0].length ? n[0] : n, nB = n[0].length ? n[1] : n, nC = n[0].length ? n[2] : n;
    const wa = this.world(A), wb = this.world(B), wc = this.world(C);
    const na = this.wn(A, nA), nb = this.wn(B, nB), nc = this.wn(C, nC);
    const g = cross(sub(wb, wa), sub(wc, wa));
    const nm = [na[0] + nb[0] + nc[0], na[1] + nb[1] + nc[1], na[2] + nb[2] + nc[2]];
    let order = [[A, wa, na, 0], [B, wb, nb, 1], [C, wc, nc, 2]];
    if (dot(g, nm) < 0) order = [order[0], order[2], order[1]];
    for (const o of order) {
      const q = o[0], w = o[1], nn = o[2], f = this.frame(q[2]);
      const l = len(nn) || 1;
      this.P.push(w[0], w[1], w[2]);
      this.N.push(nn[0] / l, nn[1] / l, nn[2] / l);
      this.C.push(col[0], col[1], col[2]);
      this.L.push(q[0], q[1], q[2]);
      this.F.push(f.N[0], f.N[1], f.N[2]);
      if (uv) { const u = uv[o[3]]; this.U.push(u[0], u[1]); }
      if (aux != null) this.X.push(aux);
    }
  };
  DuctBatch.prototype.quad = function (A, B, C, D, n, col, uv, aux) {
    const nn = n[0].length ? n : null;
    this.tri(A, B, C, nn ? [nn[0], nn[1], nn[2]] : n, col, uv ? [uv[0], uv[1], uv[2]] : null, aux);
    this.tri(A, C, D, nn ? [nn[0], nn[2], nn[3]] : n, col, uv ? [uv[0], uv[2], uv[3]] : null, aux);
  };
  /* box centred at local (cx, cy, cs), sizes w (x), h (y), d (s), turned by
     rz about the axis */
  DuctBatch.prototype.box = function (cx, cy, cs, w, h, d, rz, col) {
    const c = Math.cos(rz || 0), s = Math.sin(rz || 0);
    const P = (i, j, k) => {
      const x = i * w / 2, y = j * h / 2;
      return [cx + x * c - y * s, cy + x * s + y * c, cs + k * d / 2];
    };
    const ex = [c, s, 0], ey = [-s, c, 0];
    this.quad(P(1, -1, -1), P(1, 1, -1), P(1, 1, 1), P(1, -1, 1), ex, col);
    this.quad(P(-1, -1, 1), P(-1, 1, 1), P(-1, 1, -1), P(-1, -1, -1), mul(ex, -1), col);
    this.quad(P(-1, 1, -1), P(-1, 1, 1), P(1, 1, 1), P(1, 1, -1), ey, col);
    this.quad(P(-1, -1, 1), P(-1, -1, -1), P(1, -1, -1), P(1, -1, 1), mul(ey, -1), col);
    this.quad(P(-1, -1, 1), P(1, -1, 1), P(1, 1, 1), P(-1, 1, 1), [0, 0, 1], col);
    this.quad(P(1, -1, -1), P(-1, -1, -1), P(-1, 1, -1), P(1, 1, -1), [0, 0, -1], col);
  };
  /* prism from A to B (local), radius r, `sides` faces */
  DuctBatch.prototype.rod = function (A, B, r, col, sides) {
    const n = sides || 4;
    const d = sub(B, A), l = len(d) || 1e-6, t = mul(d, 1 / l);
    let e1 = Math.abs(t[2]) < 0.9 ? cross(t, [0, 0, 1]) : cross(t, [1, 0, 0]);
    e1 = mul(e1, 1 / len(e1));
    const e2 = cross(t, e1);
    for (let i = 0; i < n; i++) {
      const a0 = (i + 0.5) / n * Math.PI * 2, a1 = (i + 1.5) / n * Math.PI * 2;
      const o0 = add(mul(e1, Math.cos(a0) * r), mul(e2, Math.sin(a0) * r));
      const o1 = add(mul(e1, Math.cos(a1) * r), mul(e2, Math.sin(a1) * r));
      const nm = add(o0, o1);
      this.quad(add(A, o0), add(A, o1), add(B, o1), add(B, o0), nm, col);
    }
  };
  /* tube along s through local (x(s), y(s)), radius r */
  DuctBatch.prototype.tube = function (xy, s0, s1, step, r, radial, col) {
    const nS = Math.max(1, Math.ceil((s1 - s0) / step));
    const ring = (s) => {
      const c = xy(s), out = [];
      for (let j = 0; j <= radial; j++) {
        const a = j / radial * Math.PI * 2;
        out.push({ p: [c[0] + Math.cos(a) * r, c[1] + Math.sin(a) * r, s], n: [Math.cos(a), Math.sin(a), 0] });
      }
      return out;
    };
    let prev = ring(s0);
    for (let i = 1; i <= nS; i++) {
      const cur = ring(s0 + (s1 - s0) * i / nS);
      for (let j = 0; j < radial; j++) {
        this.quad(prev[j].p, prev[j + 1].p, cur[j + 1].p, cur[j].p, [prev[j].n, prev[j + 1].n, cur[j + 1].n, cur[j].n], col);
      }
      prev = cur;
    }
  };
  DuctBatch.prototype.count = function () { return this.P.length / 9; };
  DuctBatch.prototype.geometry = function (THREE) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.P, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.N, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.C, 3));
    g.setAttribute('aLoc', new THREE.Float32BufferAttribute(this.L, 3));
    g.setAttribute('aFN', new THREE.Float32BufferAttribute(this.F, 3));
    if (this.U.length) g.setAttribute('aUvM', new THREE.Float32BufferAttribute(this.U, 2));
    if (this.X.length) g.setAttribute('aAux', new THREE.Float32BufferAttribute(this.X, 1));
    g.computeBoundingSphere();
    return g;
  };

  /* StationBatch: three.js geometries in a fan's station frame, merged into
     one non-indexed geometry with a colour per part. */
  function StationBatch() { this.P = []; this.N = []; this.C = []; }
  StationBatch.prototype.add = function (THREE, geo, m4, col) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    if (m4) g.applyMatrix4(m4);
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    const P = g.getAttribute('position'), N = g.getAttribute('normal');
    for (let i = 0; i < P.count; i++) {
      this.P.push(P.getX(i), P.getY(i), P.getZ(i));
      this.N.push(N.getX(i), N.getY(i), N.getZ(i));
      this.C.push(col[0], col[1], col[2]);
    }
    g.dispose();
    if (geo !== g) geo.dispose();
  };
  StationBatch.prototype.count = function () { return this.P.length / 9; };
  StationBatch.prototype.geometry = function (THREE) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.P, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.N, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.C, 3));
    g.computeBoundingSphere();
    return g;
  };

  /* ---- shading -------------------------------------------------------------
     No point lights, as in the concept. Lamp bars and the cyan strips are
     emissive geometry, and the lit materials get the matching light
     analytically, in duct-local coordinates: lamps repeat every 40 m (a
     ceiling bar in the rectangular parts, two wall lamps in the round
     part, none in the lofts, brighter near both mouths), the cyan strips
     are line sources along the upper corners, the warm rims are
     rectangular loops at both mouths. No occlusion, which a duct barely
     needs. The page's sun and sky light are scaled down inside (uShInScale),
     judged by the depth behind the two mouth planes.

     Atmosphere. Every material fogs through the page's model
     (hikyaku-city.js makeFog: fog.patch for the lit and the basic
     materials, fog.inject for the additive halos), plus one thing the city
     does not have: the duct is a medium of its own, dark and dense
     (uShMed), on the part of the view ray that lies between the two mouth
     planes. That part is clipped exactly (shClip), the city's optical
     depth is taken on the rest, and the three pieces are composited from
     the surface back to the eye. Looking in from outside, the far end of
     the duct sinks into dark; from inside, the city through the far mouth
     stays the pale fog of the city, the lit space beyond. The housing's
     outside faces (uShOut) only get the city's fog. */
  const GLSL_FOGFN = `
uniform vec3 uShP0; uniform vec3 uShN0; uniform vec3 uShP1; uniform vec3 uShN1; uniform vec4 uShMed;
vec2 shClip(vec3 a, vec3 b){
  float lo = 0.0, hi = 1.0;
  float da = dot(a - uShP0, uShN0), db = dot(b - uShP0, uShN0);
  if (da < 0.0 && db < 0.0) return vec2(1.0, 0.0);
  if (da < 0.0) lo = max(lo, da / (da - db)); else if (db < 0.0) hi = min(hi, da / (da - db));
  da = dot(a - uShP1, uShN1); db = dot(b - uShP1, uShN1);
  if (da < 0.0 && db < 0.0) return vec2(1.0, 0.0);
  if (da < 0.0) lo = max(lo, da / (da - db)); else if (db < 0.0) hi = min(hi, da / (da - db));
  return vec2(lo, hi);
}
#ifdef SH_CG
vec3 shFog(vec3 col, vec3 wp, float k, float outside, float additive){
  vec3 cam = cameraPosition;
  vec2 iv = outside > 0.5 ? vec2(1.0, 0.0) : shClip(cam, wp);
  vec3 fc = cgFogColor(wp) * (1.0 - additive);
  vec3 outc;
  if (iv.y <= iv.x) {
    outc = mix(col, fc, 1.0 - exp(-k * cgTau(cam, wp)));
  } else {
    float d = length(wp - cam);
    vec3 pa = mix(cam, wp, iv.x), pb = mix(cam, wp, iv.y);
    outc = col;
    if (iv.y < 0.999) outc = mix(outc, fc, 1.0 - exp(-k * cgTau(pb, wp)));
    outc = mix(outc, uShMed.rgb * (1.0 - additive), 1.0 - exp(-k * uShMed.w * d * (iv.y - iv.x)));
    if (iv.x > 0.001) outc = mix(outc, fc, 1.0 - exp(-k * cgTau(cam, pa)));
  }
  return outc;
}
#endif
`;
  const GLSL_DECL = `
uniform vec4 uShLamp; uniform vec3 uShLampCol; uniform vec2 uShBoost; uniform float uShLen;
uniform vec4 uShLampR; uniform vec4 uShLampC[2]; uniform vec3 uShLampCN[2];
uniform vec4 uShLoft; uniform vec4 uShStrip; uniform vec3 uShStripCol;
uniform vec4 uShRim[4]; uniform vec3 uShRimCol; uniform float uShInScale;
uniform float uShOut; uniform float uShFogK; uniform float uShWinGain;
varying vec3 vShLoc; varying vec3 vShFN; varying vec3 vShW; varying vec2 vShUv; varying float vShAux;
float shLoftK(float s){ return smoothstep(uShLoft.x, uShLoft.y, s) * (1.0 - smoothstep(uShLoft.z, uShLoft.w, s)); }
float shIndoor(vec3 w){ float d = min(dot(w - uShP0, uShN0), dot(w - uShP1, uShN1)); return smoothstep(-6.0, 30.0, d) * (1.0 - uShOut); }
float shHash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
void shLamp(vec3 P, vec3 q, vec3 ln, float I, vec3 nW, vec3 vW, mat3 F, inout float irr, inout float spc){
  vec3 d = q - P; float d2 = dot(d, d); vec3 dn = d * inversesqrt(d2 + 1e-4);
  vec3 L = F * dn;
  float ndl = max(dot(nW, L), 0.0);
  float em = 0.15 + 0.85 * pow(max(dot(-dn, ln), 0.0), 2.0);
  float fall = I / (d2 + 80.0);
  irr += ndl * em * fall;
  vec3 H = normalize(L + vW);
  spc += pow(max(dot(nW, H), 0.0), 40.0) * em * fall * 3.0 * step(0.0, ndl - 1e-4);
}
`;
  const GLSL_LIGHT = `
{
  float dIn = shIndoor(vShW);
  reflectedLight.directDiffuse *= mix(1.0, uShInScale, dIn);
  reflectedLight.directSpecular *= mix(1.0, uShInScale, dIn);
  reflectedLight.indirectDiffuse *= mix(1.0, uShInScale, dIn);
  reflectedLight.indirectSpecular *= mix(1.0, uShInScale, dIn);
  vec3 FN = normalize(vShFN), FB = vec3(0.0, 1.0, 0.0);
  mat3 F = mat3(FN, FB, cross(FB, FN));
  vec3 nW = normalize((vec4(normal, 0.0) * viewMatrix).xyz);
  vec3 vW = normalize(cameraPosition - vShW);
  vec3 P = vShLoc;
  float irr = 0.0, spc = 0.0;
  float base = floor((P.z - uShLamp.y) / uShLamp.x + 0.5);
  for (int k = -1; k <= 1; k++) {
    float sL = (base + float(k)) * uShLamp.x + uShLamp.y;
    if (sL < uShLamp.z || sL > uShLamp.w) continue;
    float kL = shLoftK(sL);
    float bo = 1.0 + uShBoost.x * exp(-min(sL, uShLen - sL) / uShBoost.y);
    if (kL < 0.01) shLamp(P, vec3(clamp(P.x, uShLampR.x, uShLampR.y), uShLampR.z, sL), vec3(0.0, -1.0, 0.0), uShLampR.w * bo, nW, vW, F, irr, spc);
    else if (kL > 0.99) {
      for (int i = 0; i < 2; i++) shLamp(P, vec3(uShLampC[i].x, uShLampC[i].z, sL), uShLampCN[i], uShLampC[i].w * bo, nW, vW, F, irr, spc);
    }
  }
  float kS = shLoftK(P.z);
  vec2 sp = mix(uShStrip.xy, uShStrip.zw, kS);
  float st = 0.0;
  for (int m = 0; m < 2; m++) {
    vec2 q = vec2(m == 0 ? sp.x : -sp.x, sp.y);
    vec2 d = q - P.xy; float dl = length(d) + 1e-3;
    st += max(dot(nW, F * vec3(d / dl, 0.0)), 0.0) / (dl + 5.0);
  }
  st *= step(4.0, P.z) * step(P.z, uShLen - 4.0);
  float rim = 0.0;
  for (int m = 0; m < 4; m++) {
    vec4 r = uShRim[m];
    if (r.w <= 0.0) continue;
    vec2 a = abs(P.xy); vec2 q = clamp(P.xy, -r.xy, r.xy);
    if (a.x < r.x && a.y < r.y) { if (r.x - a.x < r.y - a.y) q = vec2(sign(P.x) * r.x, P.y); else q = vec2(P.x, sign(P.y) * r.y); }
    vec3 d = vec3(q - P.xy, r.z - P.z); float dl = length(d) + 1e-3;
    rim += max(dot(nW, F * (d / dl)), 0.0) * r.w / (dl * dl * 0.04 + dl + 3.0);
  }
  reflectedLight.directDiffuse += material.diffuseColor * (irr * uShLampCol + st * uShStripCol + rim * uShRimCol);
  reflectedLight.directSpecular += material.specularColor * (spc * uShLampCol + rim * 0.15 * uShRimCol);
}
`;
  /* the wall plates: seams, a half joint, a louvre grille now and then,
     grime; fades to its mean where the pattern gets finer than a pixel */
  const GLSL_PANEL = `
{
  vec2 g = vShUv / vec2(12.0, 12.0);
  vec2 f = fract(g), id = floor(g), fw = fwidth(g);
  float sx = min(f.x, 1.0 - f.x), sy = min(f.y, 1.0 - f.y);
  float seam = max(1.0 - smoothstep(0.008, 0.008 + fw.x * 1.5, sx), 1.0 - smoothstep(0.008, 0.008 + fw.y * 1.5, sy));
  float hj = 1.0 - smoothstep(0.004, 0.004 + fw.y * 1.5, abs(f.y - 0.5));
  float vj = (1.0 - smoothstep(0.004, 0.004 + fw.x * 1.5, abs(f.x - 0.5))) * step(0.5, f.y);
  float h = shHash(id);
  float tone = 0.78 + 0.34 * h;
  float gr = step(0.7, h) * step(0.56, f.x) * step(f.x, 0.92) * step(0.08, f.y) * step(f.y, 0.44);
  float slot = step(0.45, fract((f.y - 0.08) / 0.36 * 7.0));
  float grime = 0.88 + 0.12 * sin(g.x * 37.0 + h * 6.0) * sin(g.y * 3.1 + h);
  float far = clamp(max(fw.x, fw.y) * 6.0 - 0.2, 0.0, 1.0);
  float pat = tone * grime * (1.0 - 0.6 * seam) * (1.0 - 0.3 * max(hj, vj)) * (1.0 - 0.55 * gr * slot);
  diffuseColor.rgb *= mix(pat, 0.86, far);
}
`;
  /* the housing: storeys of 3.6 m in a glass band and a spandrel, bays of
     1.8 m, a blank plant floor every 13th, lit windows in runs; nothing
     around the mouth (the trim) and nothing at street level */
  const GLSL_HOUSE = `
float shWin = 0.0, shLit = 0.0, shTint = 0.0;
{
  if (vShAux > 0.5) {
    vec2 g = vShUv / vec2(1.8, 3.6);
    vec2 f = fract(g), id = floor(g), fw = fwidth(g);
    float band = smoothstep(0.30 - fw.y, 0.30 + fw.y, f.y) * (1.0 - smoothstep(0.82 - fw.y, 0.82 + fw.y, f.y));
    float mull = smoothstep(0.0, 0.06 + fw.x, min(f.x, 1.0 - f.x));
    float plant = step(11.5, mod(id.y, 13.0));
    float street = step(vShUv.y, 10.0);
    float trim = vShAux > 1.5 ? step(abs(vShLoc.x), 76.0) * step(abs(vShLoc.y), 60.0) : 0.0;
    shWin = band * mull * (1.0 - plant) * (1.0 - trim) * (1.0 - street);
    float aa = clamp(max(fw.x, fw.y) * 1.5 - 0.3, 0.0, 1.0);
    shWin = mix(shWin, 0.42 * (1.0 - trim) * (1.0 - street), aa);
    float h = shHash(id + vec2(vShAux * 31.0, 0.0));
    float run = shHash(vec2(floor(id.x / 9.0) + vShAux * 7.0, id.y * 1.37));
    shLit = clamp(step(0.975, h) + step(0.94, run) * step(0.35, h), 0.0, 1.0) * (1.0 - aa * 0.6);
    shTint = fract(h * 7.0);
    diffuseColor.rgb *= mix(1.0, 0.22, shWin) * (1.0 - 0.25 * trim);
  } else {
    vec2 g = vShUv / 9.0; vec2 f = abs(fract(g) - 0.5); vec2 fw = fwidth(g);
    float seam = 1.0 - smoothstep(0.0, fw.x * 1.5 + 0.01, 0.5 - max(f.x, f.y));
    diffuseColor.rgb *= 0.6 * (1.0 - 0.35 * seam);
  }
}
`;
  const GLSL_HOUSE_EMI = `
totalEmissiveRadiance += mix(vec3(1.0, 0.86, 0.66), vec3(0.8, 0.88, 0.95), step(0.5, shTint)) * shWin * shLit * uShWinGain
  + vec3(0.02, 0.025, 0.03) * shWin;
`;

  /* Patch a three.js material for the duct. o.mode 'wall' reads aLoc/aFN
     from the geometry, 'obj' derives them from a station frame (fans, whose
     rotors turn inside a fixed station). o.lit adds the duct lighting,
     o.panel the wall pattern, o.house the facade, o.outside marks the
     housing's outer faces. */
  function patchMat(THREE, ctx, mat, o) {
    const own = {
      uShOut: { value: o.outside ? 1 : 0 }, uShFogK: { value: o.fogK == null ? 1 : o.fogK },
      uShToLocal: { value: new THREE.Matrix4() }, uShS0: { value: 0 }, uShFrameN: { value: new THREE.Vector3(1, 0, 0) },
      uShWinGain: { value: o.winGain == null ? 1.3 : o.winGain }
    };
    if (o.station) {
      own.uShToLocal.value.copy(o.station.matrixWorld).invert();
      own.uShS0.value = o.s0;
      own.uShFrameN.value.set(o.frameN[0], o.frameN[1], o.frameN[2]);
    }
    const obj = o.mode === 'obj';
    mat.onBeforeCompile = function (sh) {
      Object.assign(sh.uniforms, ctx.U, own);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vShLoc; varying vec3 vShFN; varying vec3 vShW; varying vec2 vShUv; varying float vShAux;\n' +
          'uniform mat4 uShToLocal; uniform float uShS0; uniform vec3 uShFrameN;\n' +
          (obj ? '' : 'attribute vec3 aLoc; attribute vec3 aFN;\n') +
          (o.uv ? 'attribute vec2 aUvM;\n' : '') + (o.aux ? 'attribute float aAux;\n' : ''))
        .replace('#include <project_vertex>', '#include <project_vertex>\n{\n' +
          '  vec4 shw = vec4(transformed, 1.0);\n' +
          '  #ifdef USE_INSTANCING\n  shw = instanceMatrix * shw;\n  #endif\n' +
          '  shw = modelMatrix * shw; vShW = shw.xyz;\n' +
          (obj ? '  vec4 lp = uShToLocal * shw; vShLoc = vec3(lp.x, lp.y, uShS0 - lp.z); vShFN = uShFrameN;\n'
            : '  vShLoc = aLoc; vShFN = aFN;\n') +
          (o.uv ? '  vShUv = aUvM;\n' : '  vShUv = vec2(0.0);\n') +
          (o.aux ? '  vShAux = aAux;\n' : '  vShAux = 0.0;\n') +
          '}');
      let fs = sh.fragmentShader
        .replace('#include <common>', '#include <common>\n' + GLSL_FOGFN + GLSL_DECL);
      if (o.panel) fs = fs.replace('#include <color_fragment>', '#include <color_fragment>\n' + GLSL_PANEL);
      if (o.house) {
        fs = fs.replace('#include <color_fragment>', '#include <color_fragment>\n' + GLSL_HOUSE)
          .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n' + GLSL_HOUSE_EMI);
      }
      if (o.lit) fs = fs.replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\n' + GLSL_LIGHT);
      if (ctx.fog) {
        fs = fs.replace('#include <fog_fragment>', '#ifdef USE_FOG\n#ifdef SH_CG\n' +
          (o.additive ? 'gl_FragColor.rgb = shFog(gl_FragColor.rgb, vShW, uShFogK, uShOut, 1.0);\n'
            : 'gl_FragColor.rgb = shFog(gl_FragColor.rgb, vShW, uShFogK, uShOut, 0.0);\n') +
          '#endif\n#endif');
      }
      sh.fragmentShader = fs;
    };
    const key = 'shaft:' + [o.mode, !!o.lit, !!o.panel, !!o.house, !!o.uv, !!o.aux, !!o.additive, !!ctx.fog].join(',');
    mat.customProgramCacheKey = function () { return key; };
    if (ctx.fog) {
      mat.defines = Object.assign(mat.defines || {}, { SH_CG: '' });
      const k0 = mat.customProgramCacheKey.bind(mat);
      ctx.fog.patch(mat, { fogK: o.fogK == null ? 1 : o.fogK });
      const k1 = mat.customProgramCacheKey.bind(mat);
      mat.customProgramCacheKey = function () { return k0() + '|' + k1(); };
    }
    mat.userData.shOwn = own;
    return mat;
  }

  /* camera-facing additive halos (faked bloom), world positions */
  function haloMesh(THREE, ctx, items, fogK) {
    const quad = new THREE.PlaneGeometry(1, 1);
    const g = new THREE.InstancedBufferGeometry();
    g.index = quad.index; g.setAttribute('position', quad.getAttribute('position')); g.setAttribute('uv', quad.getAttribute('uv'));
    const P = [], S = [], C = [];
    for (const it of items) { P.push(it[0][0], it[0][1], it[0][2]); S.push(it[1], it[2]); C.push(it[3][0], it[3][1], it[3][2]); }
    g.setAttribute('iPos', new THREE.InstancedBufferAttribute(new Float32Array(P), 3));
    g.setAttribute('iSize', new THREE.InstancedBufferAttribute(new Float32Array(S), 2));
    g.setAttribute('iCol', new THREE.InstancedBufferAttribute(new Float32Array(C), 3));
    g.instanceCount = items.length;
    const m = new THREE.ShaderMaterial({
      uniforms: Object.assign({ uFogK: { value: fogK } }, ctx.U),
      vertexShader: '/*CG_FOG*/\n' + GLSL_FOGFN + `
uniform float uFogK;
attribute vec3 iPos; attribute vec2 iSize; attribute vec3 iCol;
varying vec2 vUv; varying vec3 vCol;
void main(){
  vec4 mv = modelViewMatrix * vec4(iPos, 1.0);
  mv.xy += position.xy * iSize;
  vUv = uv;
  vec3 wp = (modelMatrix * vec4(iPos, 1.0)).xyz;
#ifdef SH_CG
  vCol = shFog(iCol, wp, uFogK, 0.0, 1.0);
#else
  vCol = iCol;
#endif
  gl_Position = projectionMatrix * mv;
}`,
      fragmentShader: `varying vec2 vUv; varying vec3 vCol;
void main(){
  float r = length(vUv - 0.5) * 2.0;
  float a = exp(-r * r * 3.5) * clamp(1.0 - r, 0.0, 1.0);
  a += 0.6 * exp(-r * r * 42.0);
  gl_FragColor = vec4(vCol * a, 1.0);
}`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false
    });
    if (ctx.fog) { m.defines = { SH_CG: '' }; ctx.fog.inject(m); }
    const mesh = new THREE.Mesh(g, m);
    mesh.frustumCulled = false;
    mesh.userData.quad = quad;
    return mesh;
  }

  /* ---- fans (ported from shaftgen.js) ------------------------------------ */
  function bladeOutline(fan, r0, r1, nSeg) {
    const lead = [], trail = [];
    for (let i = 0; i <= nSeg; i++) {
      const u = i / nSeg, r = r0 + (r1 - r0) * u;
      const c = bladeSweep(fan, u), h = bladeHalf(fan, u);
      lead.push([r, c + h]); trail.push([r, c - h]);
    }
    const pts = [];
    for (const q of trail) pts.push([q[0] * Math.cos(q[1]), q[0] * Math.sin(q[1])]);
    const aT = trail[nSeg][1], aL = lead[nSeg][1];
    for (let i = 1; i < 8; i++) { const a = aT + (aL - aT) * i / 8; pts.push([r1 * Math.cos(a), r1 * Math.sin(a)]); }
    for (let i = nSeg; i >= 0; i--) { const q = lead[i]; pts.push([q[0] * Math.cos(q[1]), q[0] * Math.sin(q[1])]); }
    return pts;
  }
  function chamferPoly(a, b, c) {
    return [[a - c, -b], [a, -b + c], [a, b - c], [a - c, b], [-a + c, b], [-a, b - c], [-a, -b + c], [-a + c, -b]];
  }

  function buildFan(THREE, ctx, sh, fi) {
    const fan = sh.fans[fi], F = sh.fanFrames[fi];
    const st = new THREE.Group();
    st.name = 'shaft-fan-' + fi;
    st.position.set(F.p[0], F.p[1], F.p[2]);
    const mB = new THREE.Matrix4().makeBasis(new THREE.Vector3(F.N[0], 0, F.N[2]), new THREE.Vector3(0, 1, 0), new THREE.Vector3(-F.T[0], 0, -F.T[2]));
    st.quaternion.setFromRotationMatrix(mB);
    st.updateMatrixWorld(true);
    const spin = new THREE.Group();
    st.add(spin);
    const B = ctx.bone, cyan = ctx.cyanLin;
    const S = new StationBatch(), Ss = new StationBatch(), G = new StationBatch(), Gs = new StationBatch();
    const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), V = new THREE.Vector3(), One = new THREE.Vector3(1, 1, 1);
    const at = (x, y, z, rx, ry, rz) => M.compose(V.set(x, y, z), Q.setFromEuler(new THREE.Euler(rx || 0, ry || 0, rz || 0)), One).clone();
    const R = fan.radius, hubR = fan.hub, thick = fan.thick, round = fan.kind === 'round';
    /* rotor: blades, hub drum, cap, label, cyan edges */
    const out = bladeOutline(fan, hubR - 0.6, R, 14);
    const shape = new THREE.Shape(out.map((p) => new THREE.Vector2(p[0], p[1])));
    const bg = new THREE.ExtrudeGeometry(shape, { depth: thick, bevelEnabled: true, bevelThickness: 0.25, bevelSize: 0.25, bevelSegments: 1, curveSegments: 4 });
    bg.translate(0, 0, -thick / 2);
    bg.rotateX(fan.pitch);
    for (let b = 0; b < fan.blades; b++) {
      const a = b * Math.PI * 2 / fan.blades;
      S.add(THREE, bg.clone(), at(0, 0, 0, 0, 0, a), B(0.64));
      const lead = out.slice(out.length - 15).map((p) => {
        const v = new THREE.Vector3(p[0], p[1], thick / 2 + 0.3).applyAxisAngle(new THREE.Vector3(1, 0, 0), fan.pitch);
        return v.applyAxisAngle(new THREE.Vector3(0, 0, 1), a);
      });
      G.add(THREE, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(lead), 24, 0.28, 4, false), null, cyan(1.5));
    }
    bg.dispose();
    S.add(THREE, new THREE.CylinderGeometry(hubR, hubR, 7, 40), at(0, 0, 0, Math.PI / 2), B(0.44));
    S.add(THREE, new THREE.CylinderGeometry(hubR * 0.92, hubR, 1.2, 40), at(0, 0, 4, Math.PI / 2), B(0.17));
    S.add(THREE, new THREE.CircleGeometry(hubR * 0.62, 40), at(0, 0, 4.65), B(0.86));
    G.add(THREE, new THREE.TorusGeometry(hubR * 0.7, 0.16, 4, 48), at(0, 0, 4.7), cyan(1.5));
    if (round) {
      Ss.add(THREE, new THREE.CylinderGeometry(9, 9, 10, 32), at(0, 0, -8, Math.PI / 2), B(0.17));
      for (const sp of fan.spokes) {
        const Lr = sp.r1 - sp.r0, rm = sp.r0 + Lr / 2;
        Ss.add(THREE, new THREE.BoxGeometry(Lr, sp.ht * 2, sp.hz * 2), at(Math.cos(sp.a) * rm, Math.sin(sp.a) * rm, -sp.z, 0, 0, sp.a), B(0.17));
      }
      Ss.add(THREE, new THREE.CylinderGeometry(ROUND_R + 0.2, ROUND_R + 0.2, 9, 96, 1, true), at(0, 0, 0, Math.PI / 2), B(0.34));
      Ss.add(THREE, new THREE.TorusGeometry(R + 1.6, 1.4, 8, 128), at(0, 0, 4.5), B(0.44));
      Gs.add(THREE, new THREE.TorusGeometry(R + 0.9, 0.3, 4, 128), at(0, 0, 5.6), cyan(1.5));
    } else {
      /* PC fan housing: a square frame with a round aperture, four corner
         bosses, the struts and the motor mount behind, and a plate that
         fills the rest of the duct section */
      const H = RECT.b, c = 4, depth = 10;
      const sq = new THREE.Shape();
      sq.moveTo(-H + c, -H); sq.lineTo(H - c, -H); sq.absarc(H - c, -H + c, c, -Math.PI / 2, 0, false);
      sq.lineTo(H, H - c); sq.absarc(H - c, H - c, c, 0, Math.PI / 2, false);
      sq.lineTo(-H + c, H); sq.absarc(-H + c, H - c, c, Math.PI / 2, Math.PI, false);
      sq.lineTo(-H, -H + c); sq.absarc(-H + c, -H + c, c, Math.PI, 1.5 * Math.PI, false);
      const hole = new THREE.Path(); hole.absarc(0, 0, fan.hole, 0, Math.PI * 2, true);
      sq.holes.push(hole);
      const fg = new THREE.ExtrudeGeometry(sq, { depth: depth, bevelEnabled: true, bevelThickness: 0.6, bevelSize: 0.6, bevelSegments: 2, curveSegments: 48 });
      fg.translate(0, 0, -depth / 2);
      Ss.add(THREE, fg, null, B(0.34));
      Ss.add(THREE, new THREE.CylinderGeometry(fan.hole, fan.hole + 2.6, 2.2, 96, 1, true), at(0, 0, depth / 2 + 1.0, Math.PI / 2), B(0.44));
      for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
        Ss.add(THREE, new THREE.CylinderGeometry(3.4, 3.8, depth + 1.6, 28), at(sx * (H - 6.2), sy * (H - 6.2), 0, Math.PI / 2), B(0.44));
        Ss.add(THREE, new THREE.CircleGeometry(1.7, 24), at(sx * (H - 6.2), sy * (H - 6.2), depth / 2 + 0.85), B(0.1));
      }
      Ss.add(THREE, new THREE.CylinderGeometry(hubR * 0.9, hubR * 0.9, 5, 32), at(0, 0, -depth / 2 - 1.5, Math.PI / 2), B(0.17));
      for (const sp of fan.spokes) {
        const Lr = sp.r1 - sp.r0, rm = sp.r0 + Lr / 2;
        Ss.add(THREE, new THREE.BoxGeometry(Lr, sp.ht * 2, sp.hz * 2), at(Math.cos(sp.a) * rm, Math.sin(sp.a) * rm, -sp.z, 0, 0, sp.a), B(0.17));
      }
      for (const z of [depth / 2 + 2.15, -depth / 2 - 0.65]) Gs.add(THREE, new THREE.TorusGeometry(z > 0 ? fan.hole + 2.4 : fan.hole + 0.3, 0.3, 4, 128), at(0, 0, z), cyan(1.5));
      /* the plate: the duct's rectangle (grown 1 m into the wall) minus the
         housing square */
      const ps = new THREE.Shape(chamferPoly(RECT.a + 1, RECT.b + 1, RECT.c).map((p) => new THREE.Vector2(p[0], p[1])));
      const ph = new THREE.Path();
      ph.moveTo(-H + c, -H); ph.absarc(-H + c, -H + c, c, 1.5 * Math.PI, Math.PI, true);
      ph.lineTo(-H, H - c); ph.absarc(-H + c, H - c, c, Math.PI, Math.PI / 2, true);
      ph.lineTo(H - c, H); ph.absarc(H - c, H - c, c, Math.PI / 2, 0, true);
      ph.lineTo(H, -H + c); ph.absarc(H - c, -H + c, c, 0, -Math.PI / 2, true);
      ps.holes.push(ph);
      const pg = new THREE.ExtrudeGeometry(ps, { depth: 3, bevelEnabled: false, curveSegments: 12 });
      pg.translate(0, 0, -1.5);
      Ss.add(THREE, pg, null, B(0.24));
    }
    const mat = patchMat(THREE, ctx, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.35, side: THREE.DoubleSide }),
      { mode: 'obj', lit: true, station: st, s0: fan.s, frameN: F.N });
    const parts = [];
    const mk = (batch, material, parent, name) => {
      if (!batch.count()) return;
      const m = new THREE.Mesh(batch.geometry(THREE), material);
      m.name = name; parent.add(m); parts.push(m);
    };
    mk(S, mat, spin, 'rotor'); mk(Ss, mat, st, 'frame');
    mk(G, ctx.glowMat, spin, 'rotor-neon'); mk(Gs, ctx.glowMat, st, 'frame-neon');
    return { group: st, spin: spin, mat: mat, parts: parts, fan: fan };
  }

  /* ---- build --------------------------------------------------------------
     opts: fog (the page's makeFog), accent, warm (hex), inScale (sun and
     sky light kept inside, 0.12), med ({ t, density }: the duct medium, bone
     position and per metre), lampGain, paths (race lines; cables that come
     within 6 m of one are left out). Returns { group, update(t, cameraPos),
     dispose, stats }. */
  function build(THREE, sh, opts) {
    opts = opts || {};
    const t0 = (typeof performance !== 'undefined' ? performance : Date).now();
    const stops = boneStops();
    const accent = opts.accent == null ? ACCENT : opts.accent, warm = opts.warm == null ? WARM : opts.warm;
    const boneL = (t, g) => { const c = boneRGB(stops, t), k = g == null ? 1 : g; return [toLin(c[0]) * k, toLin(c[1]) * k, toLin(c[2]) * k]; };
    const L = sh.length, H = sh.housing, lf = sh.loft, RR = ROUND_R, A = RECT.a, Bh = RECT.b;
    const med = opts.med || { t: 0.07, density: 0.0034 };
    const medC = boneRGB(stops, med.t);
    const lampGain = opts.lampGain == null ? 1 : opts.lampGain;
    const LA = 50 * Math.PI / 180, LR = RR - 3.2;
    const CORNER = [A - RECT.c / 2 - 0.3, Bh - RECT.c / 2 - 0.3];
    const thC = Math.atan2(CORNER[1], CORNER[0]);
    const f0 = frameAt(sh, 0), f1 = frameAt(sh, L);
    const U = {
      uShLamp: { value: new THREE.Vector4(40, 20, 8, L - 8) },
      uShLampCol: { value: new THREE.Vector3().fromArray(boneL(0.97, 1)) },
      uShBoost: { value: new THREE.Vector2(2.5, 55) }, uShLen: { value: L },
      uShLampR: { value: new THREE.Vector4(-22, 22, Bh - 0.9, 3600 * lampGain) },
      uShLampC: { value: [new THREE.Vector4(LR * Math.sin(LA), 0, LR * Math.cos(LA), 5200 * lampGain), new THREE.Vector4(-LR * Math.sin(LA), 0, LR * Math.cos(LA), 5200 * lampGain)] },
      uShLampCN: { value: [new THREE.Vector3(-Math.sin(LA), -Math.cos(LA), 0), new THREE.Vector3(Math.sin(LA), -Math.cos(LA), 0)] },
      uShLoft: { value: new THREE.Vector4(lf[0], lf[1], lf[2], lf[3]) },
      uShStrip: { value: new THREE.Vector4(CORNER[0], CORNER[1], (RR - 0.5) * Math.cos(thC), (RR - 0.5) * Math.sin(thC)) },
      uShStripCol: { value: new THREE.Vector3().fromArray(hexLin(accent, 5)) },
      uShRim: { value: [new THREE.Vector4(A + 1, Bh + 1, -H.proud - 0.2, 40), new THREE.Vector4(A - 0.4, Bh - 0.4, 6, 22),
        new THREE.Vector4(A + 1, Bh + 1, L + H.proud + 0.2, 40), new THREE.Vector4(A - 0.4, Bh - 0.4, L - 6, 22)] },
      uShRimCol: { value: new THREE.Vector3().fromArray(hexLin(warm, 1)) },
      uShInScale: { value: opts.inScale == null ? 0.12 : opts.inScale },
      uShP0: { value: new THREE.Vector3(f0.p[0], f0.p[1], f0.p[2]) }, uShN0: { value: new THREE.Vector3(f0.T[0], 0, f0.T[2]) },
      uShP1: { value: new THREE.Vector3(f1.p[0], f1.p[1], f1.p[2]) }, uShN1: { value: new THREE.Vector3(-f1.T[0], 0, -f1.T[2]) },
      uShMed: { value: new THREE.Vector4(medC[0], medC[1], medC[2], med.density) }
    };
    const owned = [];
    const ctx = { U: U, fog: opts.fog || null, bone: (t) => boneL(t), cyanLin: (g) => hexLin(accent, g) };
    ctx.glowMat = patchMat(THREE, ctx, new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, side: THREE.DoubleSide }), { mode: 'wall', fogK: 0.7 });
    owned.push(ctx.glowMat);

    /* section angles: uniform, plus the chamfer corners so the rectangle
       is exact; radii cached per loft weight */
    const TH = [];
    for (let i = 0; i < 96; i++) TH.push(-Math.PI / 2 + i / 96 * Math.PI * 2);
    for (const p of chamferPoly(A, Bh, RECT.c)) { let t = Math.atan2(p[1], p[0]); if (t < -Math.PI / 2) t += 2 * Math.PI; TH.push(t); }
    TH.sort((a, b) => a - b);
    const rCache = new Map();
    const radii = (k) => {
      const key = Math.round(k * 1e6);
      let r = rCache.get(key);
      if (!r) { r = TH.map((t) => sectionRadius(k, t)); rCache.set(key, r); }
      return r;
    };
    const rad = (s, th) => sectionRadius(loftK(sh, s), th);
    const inward = (k, x, y) => { const g = secGrad(k, x, y), l = Math.hypot(g[0], g[1]) || 1; return [-g[0] / l, -g[1] / l, 0]; };

    /* ---- the wall: one swept, indexed mesh ---- */
    const rows = [0];
    for (let s = 0; s < L; ) {
      const inLoft = (s >= lf[0] - 4 && s < lf[1] + 4) || (s >= lf[2] - 4 && s < lf[3] + 4);
      let ns = s + (inLoft ? 3 : 6);
      for (const b of lf) if (b > s + 0.5 && b < ns - 0.5) { ns = b; break; }
      s = Math.min(ns, L);
      rows.push(s);
    }
    const nT = TH.length, cols = nT + 1;
    const wPos = new Float32Array(rows.length * cols * 3), wNor = new Float32Array(rows.length * cols * 3);
    const wLoc = new Float32Array(rows.length * cols * 3), wFN = new Float32Array(rows.length * cols * 3), wUv = new Float32Array(rows.length * cols * 2);
    rows.forEach((s, i) => {
      const k = loftK(sh, s), rr = radii(k), f = frameAt(sh, s);
      let u = 0, px = 0, py = 0;
      for (let j = 0; j <= nT; j++) {
        const th = TH[j % nT], r = rr[j % nT];
        const x = Math.cos(th) * r, y = Math.sin(th) * r;
        if (j > 0) u += Math.hypot(x - px, y - py);
        px = x; py = y;
        const n = inward(k, x, y), id = i * cols + j;
        wPos[id * 3] = f.p[0] + f.N[0] * x; wPos[id * 3 + 1] = f.p[1] + y; wPos[id * 3 + 2] = f.p[2] + f.N[2] * x;
        wNor[id * 3] = f.N[0] * n[0]; wNor[id * 3 + 1] = n[1]; wNor[id * 3 + 2] = f.N[2] * n[0];
        wLoc[id * 3] = x; wLoc[id * 3 + 1] = y; wLoc[id * 3 + 2] = s;
        wFN[id * 3] = f.N[0]; wFN[id * 3 + 1] = 0; wFN[id * 3 + 2] = f.N[2];
        wUv[id * 2] = u; wUv[id * 2 + 1] = s;
      }
    });
    const wIdx = [];
    for (let i = 0; i + 1 < rows.length; i++) for (let j = 0; j < nT; j++) {
      const a = i * cols + j, b = a + 1, c = a + cols, d = c + 1;
      wIdx.push(a, c, b, b, c, d);
    }
    /* winding: the first triangle must face its (inward) normal */
    {
      const P = (q) => [wPos[q * 3], wPos[q * 3 + 1], wPos[q * 3 + 2]];
      const g = cross(sub(P(wIdx[1]), P(wIdx[0])), sub(P(wIdx[2]), P(wIdx[0])));
      if (dot(g, [wNor[0], wNor[1], wNor[2]]) < 0) for (let q = 0; q < wIdx.length; q += 3) { const t = wIdx[q + 1]; wIdx[q + 1] = wIdx[q + 2]; wIdx[q + 2] = t; }
    }
    const wGeo = new THREE.BufferGeometry();
    wGeo.setAttribute('position', new THREE.BufferAttribute(wPos, 3));
    wGeo.setAttribute('normal', new THREE.BufferAttribute(wNor, 3));
    wGeo.setAttribute('aLoc', new THREE.BufferAttribute(wLoc, 3));
    wGeo.setAttribute('aFN', new THREE.BufferAttribute(wFN, 3));
    wGeo.setAttribute('aUvM', new THREE.BufferAttribute(wUv, 2));
    wGeo.setIndex(wIdx);
    wGeo.computeBoundingSphere();
    const wallMat = patchMat(THREE, ctx, new THREE.MeshStandardMaterial({ color: new THREE.Color().fromArray(boneL(0.44)), roughness: 0.5, metalness: 0.3, side: THREE.DoubleSide }),
      { mode: 'wall', lit: true, panel: true, uv: true });
    owned.push(wallMat);

    /* ---- dressing (lit, vertex colours) and glow (unlit) ---- */
    const D = new DuctBatch(sh), Gl = new DuctBatch(sh);
    const halos = [];
    const cyan = hexLin(accent, 1.5), warmC = hexLin(warm, 2.6), white = boneL(0.98, 2.4), dotC = boneL(0.95, 1.6), line = boneL(0.9, 0.55);
    const srgbHalo = (rgb, g) => [rgb[0] * g, rgb[1] * g, rgb[2] * g];
    const wallPt = (s, th, inset) => { const r = rad(s, th) - inset; return [Math.cos(th) * r, Math.sin(th) * r, s]; };
    /* flanges and ribs: a box section swept round the profile */
    for (const rb of sh.layout.ribs) {
      const k = loftK(sh, rb.s), rr = radii(k), out = 0.4;
      const tone = rb.heavy ? boneL(0.46) : boneL(0.2);
      const S0 = rb.s - rb.width / 2, S1 = rb.s + rb.width / 2;
      const ring = TH.map((th, j) => {
        const x = Math.cos(th) * rr[j], y = Math.sin(th) * rr[j], n = inward(k, x, y);
        return { o: [x - n[0] * out, y - n[1] * out], i: [x + n[0] * rb.depth, y + n[1] * rb.depth], n: n };
      });
      for (let j = 0; j < nT; j++) {
        const a = ring[j], b = ring[(j + 1) % nT];
        D.quad([a.i[0], a.i[1], S0], [b.i[0], b.i[1], S0], [b.i[0], b.i[1], S1], [a.i[0], a.i[1], S1], [a.n, b.n, b.n, a.n], tone);
        D.quad([a.o[0], a.o[1], S0], [b.o[0], b.o[1], S0], [b.i[0], b.i[1], S0], [a.i[0], a.i[1], S0], [0, 0, -1], tone);
        D.quad([a.o[0], a.o[1], S1], [b.o[0], b.o[1], S1], [b.i[0], b.i[1], S1], [a.i[0], a.i[1], S1], [0, 0, 1], tone);
        if (rb.band) {
          /* a cyan band on the face the pilot sees, a third of the way in */
          const f1 = rb.depth * 0.3, f2 = f1 + 0.6, sB = S0 - 0.06;
          const p = (q, d) => [q.o[0] + q.n[0] * (out + d), q.o[1] + q.n[1] * (out + d), sB];
          Gl.quad(p(a, f1), p(b, f1), p(b, f2), p(a, f2), [0, 0, -1], cyan);
        }
      }
      if (rb.collar) {
        for (let j = 0; j < 24; j++) {
          const th = j / 24 * Math.PI * 2, r = sectionRadius(k, th) - 5.4;
          D.box(Math.cos(th) * r, Math.sin(th) * r, rb.s, 1.6, 1.6, 6.5, th, boneL(0.2));
        }
      }
      if (rb.brackets) {
        for (let j = 0; j < 12; j++) {
          const th = (j + 0.5) / 12 * Math.PI * 2, r = RR - 4;
          D.box(Math.cos(th) * r, Math.sin(th) * r, rb.s, 4.5, 4.5, 7, th, boneL(0.46));
        }
      }
    }
    /* stiffeners along the lofts; every other one with a white service line */
    for (let j = 0; j < 16; j++) {
      const th = j / 16 * Math.PI * 2 + Math.PI / 16;
      for (const ab of [[lf[0] + 2.5, lf[1] - 2.5], [lf[2] + 2.5, lf[3] - 2.5]]) {
        D.tube((s) => { const r = rad(s, th) - 1.8; return [Math.cos(th) * r, Math.sin(th) * r]; }, ab[0], ab[1], 6, 0.9, 6, boneL(0.46));
        if (j % 2 === 0) {
          const t2 = th + 0.035;
          Gl.tube((s) => { const r = rad(s, t2) - 0.5; return [Math.cos(t2) * r, Math.sin(t2) * r]; }, ab[0] + 3, ab[1] - 3, 6, 0.16, 4, line);
        }
      }
    }
    /* pipes along the round section with clamps at every 20 m */
    for (const pp of sh.layout.pipes) {
      const cx = Math.cos(pp.th) * pp.rc, cy = Math.sin(pp.th) * pp.rc;
      D.tube(() => [cx, cy], pp.s0, pp.s1, 20, pp.r, 12, pp.alt ? boneL(0.58) : boneL(0.38));
      for (let s = Math.ceil((pp.s0 + 4) / 20) * 20 - 10; s < pp.s1 - 2; s += 20) {
        if (s < pp.s0 + 2) continue;
        D.box(cx, cy, s, pp.r * 2.6, pp.r * 2.6, 1.4, pp.th, boneL(0.2));
      }
    }
    /* cable bundles sagging between the heavy flanges, upper right */
    const paths = opts.paths || [];
    const nearPath = (q) => {
      const w = toWorld(sh, q[2], q[0], q[1]);
      for (const P of paths) for (const p of P) { const dx = p[0] - w[0], dy = p[1] - w[1], dz = p[2] - w[2]; if (dx * dx + dy * dy + dz * dz < 36) return true; }
      return false;
    };
    let cables = 0;
    for (const sp of sh.layout.spans) {
      for (let k = 0; k < 6; k++) {
        const th0 = 1.05 + (k - 2.5) * 0.03, rr = RR - 2.5;
        const xy = (s) => {
          const ph = ((s - lf[1]) % 80) / 80;
          const droop = Math.pow(Math.sin(Math.PI * ph), 1.5) * (5 + (k % 3));
          return [Math.cos(th0) * rr, Math.sin(th0) * rr - droop];
        };
        let hit = false;
        for (let s = sp[0]; s <= sp[1] && !hit; s += 10) { const q = xy(s); hit = nearPath([q[0], q[1], s]); }
        if (hit) continue;
        D.tube(xy, sp[0], sp[1], 5, 0.5 + 0.2 * (k % 3), 5, boneL(0.12));
        cables++;
      }
    }
    /* catwalk along the floor of the round section */
    const wk = sh.layout.walk;
    for (const sg of wk.segs) {
      const sm = (sg[0] + sg[1]) / 2;
      D.box(0, wk.y, sm, 2 * wk.hw, 0.7, 19.6, 0, boneL(0.5));
      for (const x of [-wk.hw, wk.hw]) {
        D.box(x, wk.y + wk.rail, sm, 0.35, 0.35, 19.6, 0, boneL(0.2));
        D.box(x, wk.y + wk.rail / 2, sg[0] + 1, 0.35, wk.rail, 0.35, 0, boneL(0.2));
        Gl.box(x * 0.92, wk.y + 0.42, sm, 0.5, 0.15, 1.2, 0, dotC);
      }
      D.box(0, wk.y - 4.5, sm, 2.2, 9, 2.2, 0, boneL(0.2));
    }
    /* lamps: ceiling bars in the rectangular parts, wall lamps in the round */
    for (const lp of sh.layout.lamps) {
      const s = lp.s;
      if (lp.kind === 'rect') {
        Gl.box(0, Bh - 0.9, s, 44, 0.5, 1.4, 0, white);
        D.box(0, Bh - 0.4, s, 46, 0.8, 2.6, 0, boneL(0.2));
        for (const x of [-15, 0, 15]) halos.push([toWorld(sh, s, x, Bh - 2), 22, 22, srgbHalo(boneRGB(stops, 0.95), 0.28)]);
      } else {
        for (const sg of [1, -1]) {
          const a = Math.PI / 2 - sg * LA;
          D.box(Math.cos(a) * (RR - 1.6), Math.sin(a) * (RR - 1.6), s, 3.5, 3.0, 6, a, boneL(0.2));
          Gl.box(Math.cos(a) * (RR - 3.2), Math.sin(a) * (RR - 3.2), s, 0.3, 2.2, 4.6, a, white);
          halos.push([toWorld(sh, s, Math.cos(a) * (RR - 5), Math.sin(a) * (RR - 5)), 26, 26, srgbHalo(boneRGB(stops, 0.95), 0.5)]);
        }
      }
    }
    /* cyan guide strips at the upper corners, dashed, following the loft */
    let strips = 0;
    for (const th of [thC, Math.PI - thC]) {
      for (let s = 4; s < L - 4; s += 16) {
        const e = Math.min(L - 4, s + 12);
        for (let a = s; a < e - 1e-6; a += 3) {
          const b = Math.min(e, a + 3);
          Gl.rod(wallPt(a, th, 0.35), wallPt(b, th, 0.35), 0.4, cyan, 4);
        }
        strips++;
      }
    }
    /* floor marks in the rectangular parts */
    for (let s = 8; s < L - 8; s += 16) if (loftK(sh, s) < 0.01) for (const x of [-34, 34]) Gl.box(x, -Bh + 0.12, s, 1.2, 0.2, 2.4, 0, dotC);

    /* ---- the mouths, after the portal rule: a collar proud of the facade
       that gives the opening a visible reveal, a warm rim on its front edge
       and a second one 6 m inside, the corner edges between them, lintel,
       sill and pilasters around it, and the lit duct beyond ---- */
    const poly = chamferPoly(A, Bh, RECT.c);
    /* the opening offset by d: the chamfer line moves by d too */
    const grow = (P, d) => chamferPoly(A + d, Bh + d, RECT.c + d * (2 - Math.SQRT2));
    const mouth = (sEdge, sgn) => {
      /* sgn -1: entry (outside at s < 0), +1: exit (outside at s > L) */
      const sF = sEdge + sgn * H.proud;
      const inn = poly, outer = grow(poly, H.collar);
      const n = inn.length;
      for (let i = 0; i < n; i++) {
        const a = inn[i], b = inn[(i + 1) % n], ao = outer[i], bo = outer[(i + 1) % n];
        /* front face of the collar */
        D.quad([a[0], a[1], sF], [b[0], b[1], sF], [bo[0], bo[1], sF], [ao[0], ao[1], sF], [0, 0, sgn], boneL(0.3));
        /* inner face (the reveal) and outer face */
        const ni = [-(a[1] - b[1]), (a[0] - b[0]), 0], li = Math.hypot(ni[0], ni[1]);
        const nIn = [ni[0] / li, ni[1] / li, 0];
        const nOutF = [-nIn[0], -nIn[1], 0];
        /* orient: inner face normal points to the axis */
        const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        const towards = nIn[0] * -mid[0] + nIn[1] * -mid[1] > 0 ? nIn : nOutF;
        const away = [-towards[0], -towards[1], 0];
        D.quad([a[0], a[1], sEdge], [b[0], b[1], sEdge], [b[0], b[1], sF], [a[0], a[1], sF], towards, boneL(0.55));
        D.quad([ao[0], ao[1], sEdge], [bo[0], bo[1], sEdge], [bo[0], bo[1], sF], [ao[0], ao[1], sF], away, boneL(0.3));
      }
      /* rims */
      const loop = (P, s, r) => { for (let i = 0; i < P.length; i++) Gl.rod([P[i][0], P[i][1], s], [P[(i + 1) % P.length][0], P[(i + 1) % P.length][1], s], r, warmC, 6); };
      loop(grow(poly, 0.9), sF + sgn * 0.05, 0.75);
      loop(grow(poly, -0.5), sEdge - sgn * 6, 0.55);
      for (const p of grow(poly, -0.3)) Gl.rod([p[0], p[1], sF], [p[0], p[1], sEdge - sgn * 6], 0.35, warmC, 4);
      /* warm landing dots on the reveal floor */
      for (let z = 0; z <= H.proud; z += 1.5) for (const x of [-A + 8, -A / 3, A / 3, A - 8]) Gl.box(x, -Bh + 0.15, sEdge + sgn * z, 0.9, 0.2, 0.9, 0, warmC);
      for (let z = 1.5; z <= 6; z += 1.5) for (const x of [-A + 8, -A / 3, A / 3, A - 8]) Gl.box(x, -Bh + 0.15, sEdge - sgn * z, 0.9, 0.2, 0.9, 0, warmC);
      /* lintel, sill, pilasters, floor bands and piers on the facade */
      const sT = sEdge + sgn * 2.5, tone = boneL(0.55);
      D.box(0, Bh + H.collar + 6.5, sT, 2 * A + 40, 7, 5, 0, tone);
      D.box(0, -Bh - H.collar - 5, sT, 2 * A + 40, 4, 5, 0, tone);
      for (const sx of [-1, 1]) D.box(sx * (A + H.collar + 8), 0.75, sT, 8, 2 * Bh + 2 * H.collar + 17, 5, 0, tone);
      const yB = -sh.yc, yT = H.top - sh.yc, clrX = A + 22, clrY = Bh + 18, sR = sEdge + sgn * 1.1;
      for (let y = yB + 14; y < yT - 4; y += 32.2) {
        if (Math.abs(y) < clrY) for (const sx of [-1, 1]) D.box(sx * (clrX + H.hw) / 2, y, sR, H.hw - clrX, 2.2, 2.2, 0, boneL(0.48));
        else D.box(0, y, sR, 2 * H.hw, 2.2, 2.2, 0, boneL(0.48));
      }
      for (let x = -H.hw + 9; x < H.hw; x += 46) {
        if (Math.abs(x) < clrX) continue;
        D.box(x, (yB + yT) / 2, sR, 3, yT - yB, 2.2, 0, boneL(0.48));
      }
      /* the soft warm halo in the opening */
      halos.push([toWorld(sh, sEdge + sgn * 4, 0, 0), 2 * A * 1.25, 2 * Bh * 1.25, srgbHalo([1, 0.65, 0.24], 0.09)]);
    };
    mouth(0, -1);
    mouth(L, 1);

    /* ---- the housing: a long building around the duct, its outer faces
       with the city's kind of facade (uShOut: outside light, city fog) ---- */
    const Hb = new DuctBatch(sh);
    const yB = -sh.yc, yT = H.top - sh.yc, hw = H.hw;
    const hRows = [];
    for (let s = 0; s < L; s += 10) hRows.push(s);
    hRows.push(L);
    for (let i = 0; i + 1 < hRows.length; i++) {
      const a = hRows[i], b = hRows[i + 1];
      for (const sx of [-1, 1]) {
        Hb.quad([sx * hw, yB, a], [sx * hw, yB, b], [sx * hw, yT, b], [sx * hw, yT, a], [sx, 0, 0], [1, 1, 1],
          [[a, 0], [b, 0], [b, H.top], [a, H.top]], 1);
      }
      Hb.quad([-hw, yT, a], [hw, yT, a], [hw, yT, b], [-hw, yT, b], [0, 1, 0], [1, 1, 1], [[-hw, a], [hw, a], [hw, b], [-hw, b]], 0);
    }
    {
      const fs = new THREE.Shape([new THREE.Vector2(-hw, yB), new THREE.Vector2(hw, yB), new THREE.Vector2(hw, yT), new THREE.Vector2(-hw, yT)]);
      fs.holes.push(new THREE.Path(poly.slice().reverse().map((p) => new THREE.Vector2(p[0], p[1]))));
      const sg = new THREE.ShapeGeometry(fs);
      const P = sg.getAttribute('position'), I = sg.index;
      for (const [sE, sgn] of [[0, -1], [L, 1]]) {
        for (let q = 0; q < I.count; q += 3) {
          const v = [0, 1, 2].map((e) => { const id = I.getX(q + e); return [P.getX(id), P.getY(id), sE]; });
          Hb.tri(v[0], v[1], v[2], [0, 0, sgn], [1, 1, 1], v.map((p) => [p[0] * -sgn, p[1] + sh.yc]), 2);
        }
      }
      sg.dispose();
    }
    const houseMat = patchMat(THREE, ctx, new THREE.MeshStandardMaterial({ color: new THREE.Color().fromArray(boneL(0.42)), roughness: 0.85, metalness: 0.1, side: THREE.DoubleSide }),
      { mode: 'wall', house: true, uv: true, aux: true, outside: true });
    owned.push(houseMat);

    const dressMat = patchMat(THREE, ctx, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.35, side: THREE.DoubleSide }),
      { mode: 'wall', lit: true });
    owned.push(dressMat);

    const group = new THREE.Group();
    group.name = 'shaft';
    const add = (geo, mat, name) => { const m = new THREE.Mesh(geo, mat); m.name = name; m.frustumCulled = true; group.add(m); return m; };
    add(wGeo, wallMat, 'shaft-wall');
    add(D.geometry(THREE), dressMat, 'shaft-dressing');
    add(Gl.geometry(THREE), ctx.glowMat, 'shaft-glow');
    add(Hb.geometry(THREE), houseMat, 'shaft-housing');
    const halo = haloMesh(THREE, ctx, halos, 0.6);
    halo.name = 'shaft-halos';
    group.add(halo);
    owned.push(halo.material);
    const fans = sh.fans.map((f, i) => buildFan(THREE, ctx, sh, i));
    for (const fv of fans) { group.add(fv.group); owned.push(fv.mat); }

    let tris = 0, meshes = 0;
    group.traverse((o) => {
      if (!o.isMesh) return;
      meshes++;
      const gg = o.geometry;
      const per = (gg.index ? gg.index.count : gg.getAttribute('position').count) / 3;
      tris += per * (gg.isInstancedBufferGeometry ? gg.instanceCount : 1);
    });
    const stats = {
      tris: Math.round(tris), meshes: meshes, materials: owned.length, wallRows: rows.length, ribs: sh.layout.ribs.length,
      pipes: sh.layout.pipes.length, cables: cables, strips: strips, lamps: sh.layout.lamps.length, halos: halos.length,
      fans: sh.fans.map((f) => ({ s: f.s, kind: f.kind, period: f.period })),
      buildMs: (typeof performance !== 'undefined' ? performance : Date).now() - t0
    };
    const update = function (t, cameraPos) {
      void cameraPos;
      for (const fv of fans) fv.spin.rotation.z = fanAngle(fv.fan, t);
    };
    update(0);
    return {
      group: group, stats: stats, fans: fans, uniforms: U,
      /* t in seconds turns the fans (fanAngle). cameraPos is accepted for the
         interface; nothing here depends on it. */
      update: update,
      dispose: function () {
        group.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
        if (halo.userData.quad) halo.userData.quad.dispose();
        for (const m of owned) m.dispose();
        if (group.parent) group.parent.remove(group);
      }
    };
  }

  const Shaft = {
    RECT: RECT, ROUND_R: ROUND_R, DEF: DEF, ACCENT: ACCENT, WARM: WARM,
    mulberry32: mulberry32, makeShaft: makeShaft, frameAt: frameAt, toWorld: toWorld, toLocal: toLocal,
    psiAt: psiAt, curvAt: curvAt, loftK: loftK, secF: secF, secGrad: secGrad, sectionRadius: sectionRadius,
    wallDist: wallDist, inside: inside, depthIn: depthIn, near: near,
    fanAngle: fanAngle, fanOmega: fanOmega, contactsWall: contactsWall, contactsFans: contactsFans,
    portals: portals, flythrough: flythrough, bounds: bounds, reservedBoxes: reservedBoxes,
    build: build
  };
  globalThis.Shaft = Shaft;
})();
