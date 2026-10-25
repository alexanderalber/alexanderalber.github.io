/* block.js -- the type B arcology of Hikyaku: a brutalist block of two
 * slabs with a vertical city inside. The race comes in over the lid, drops
 * through a portal in the roof, weaves down through two thick packages of
 * occupied storeys and the voids between them, pulls out in the hall at the
 * bottom and leaves through the east end wall at street height.
 *
 * Concept: notes/tools/hikyaku/concepts/BLOCK-VARIANTS.md, variant E (owner
 * decision 2026-10-25): D's interior, route and traffic with E's multi-scale
 * exterior, the campus at the plinth and the plaza on the exit side. Ported
 * from concepts/blk-plan.js, blk-variants.js, blk-variant-d.js and
 * blk-surround.js. Kept from there: the dimensions, the route (centripetal
 * Catmull-Rom through the designed arcs and the weave), the packages with
 * their route holes sized from the route, the plate rule (a deck is cut into
 * strips around its holes, so no box face crosses a hole), the 22.5 m route
 * tube every generated solid keeps, the lane lattice. New here: world
 * placement, contacts in the game's box shape over a 3-D grid, faces that
 * know whether they are exposed, route pass points for the race generator,
 * lanes in the HikyakuTraffic shape with their near passes, and a build on
 * the game's own materials.
 *
 * Two layers, like menger.js and pyramid.js:
 *
 *   - Pure layer, no three.js, no DOM: makeBlock, flythrough, pageCurve,
 *     lanes, portals, contacts, boxesNear, clearance, depthIn, campusSpec,
 *     inside, inBuilding, bounds, solidShare, tubeAt, toWorld, toLocal,
 *     dirWorld, yawFor. notes/dev/block.test.mjs checks it.
 *   - Visual layer: build(THREE, layout, opts). THREE is a parameter, never
 *     an import. Reads ColorRamps (bone greys).
 *
 * Plan frame (all layout numbers): metres, y up, the building centred on
 * x = z = 0, ground at y = 0, the slabs running along x, the race travelling
 * +x: in over the west half of the lid, out through the east end wall.
 * World placement: origin (centre of the base) and a yaw that is a multiple
 * of 90 degrees in three.js's rotation.y convention, x' = c x + s z,
 * z' = -s x + c z. Plan +x (the travel direction at the approach and at the
 * exit) goes to (cos yaw, 0, -sin yaw); yawFor(dir) gives the yaw for a
 * world axis. Multiples of 90 keep every box axis-aligned.
 *
 * Dimensions (E): slabs 440 x 80 m to 410 m, set back 16 m above (terrace)
 * to 470 m, third tiers to 500 m, crown towers to 560 and 535 m; end walls
 * recessed 20 m; the lid between the slabs is a 56 m package of storeys
 * (384 to 440 m). Atrium 372 x 140 m: voids of 42 m (V1, 342 to 384) and
 * 58 m (V2, 200 to 258), packages of 84 m (P1, 258 to 342) and 78 m (P2,
 * 122 to 200), the hall (4 to 122 m). Route: approach level at 506 m, pitch
 * down (R 76 m) into the roof portal, weave down with offsets of +-28 m
 * (extremes at 300 and 160 m, deck spacing 140 m), pull out (R 76 m), a
 * 212 m hall run, out through the east end wall at 42 m.
 *
 * Atrium variant B (needle eyes, concepts/ATRIUM-DIFFICULTY.md, owner
 * decision 2026-10-26), on by default: the route holes of P1 and P2 keep
 * 10 m + 3 m round the race line instead of 25.5 m (about 50 x 30 and
 * 49 x 30 m instead of 75 x 56 and 74 x 56), the roof portal stays 80 x
 * 60 m, and each of the four rings stands in a frame gate with collision
 * (two bridges wall to wall, two posts, a thin gold rim). Everything else
 * keeps the tube; tubeAt(L, p) gives the local guarantee. The route itself
 * does not change. Option needle: null restores the wide holes, no gates.
 *
 * Everything solid is an axis-aligned box. The box list is the collision
 * list (layout.boxes, the { min, max, c, half, idx } shape of hkcore
 * contactsBoxes, plus kind, tone, zone, seed and open, one bit per face that
 * is exposed somewhere). Decoration (lights, rods, containers, the ground
 * layer) is generated out of the route tube with the same test and is not
 * solid; it lives in layout.lights and layout.details.
 *
 * Everything hangs on globalThis.HikyakuBlock.
 */
(function () {
  'use strict';

  const ACCENT = 0x2ee8ff, WARM = 0xffa63d;
  const TUBE = 22.5;                       /* route clearance radius: 3 ship lengths of passage */
  const Z = { BLANK: 0, HOUSING: 1, SERVICE: 2, LOBBY: 3, DECK: 6 };
  /* the massing, plan frame */
  const GEO = {
    LX: 220, SZ0: 70, SZ1: 150, EW: 200, AX: 186,
    top: 470, set: 410, lid: [384, 440],
    packs: [[258, 342], [122, 200]],
    voids: [[342, 384], [200, 258], [4, 122]]
  };
  const DEF = {
    amp: 28,               /* weave offset at the extremes, m */
    R1: 76, R2: 76,        /* pitch-down and pull-out radius */
    x0: -60,               /* roof portal centre (plan x) */
    yB: 118,               /* the pull-out starts here */
    yApp: 506,             /* approach altitude over the lid */
    yOut: 42,              /* exit altitude */
    lead: 160,             /* straight approach before the pitch-down leg */
    leave: 160,            /* straight leave beyond the exit portal */
    step: 20,              /* flythrough waypoint spacing */
    plaza: 280,            /* reserved band round the footprint (campus and plaza) */
    campus: true,          /* the module's own campus (solid) */
    surround: null,        /* ring road, boulevards, plaza (drawn); null: as campus */
    /* atrium variant B (needle eyes, owner decision 2026-10-26): the route
       holes of the two packages keep needle + 3 m round the race line
       instead of the tube's 25.5 m, and a frame gate with collision stands
       at each of the four rings. needle null (or not below the tube) gives
       the old wide holes and no gates. */
    needle: 10,            /* local clearance radius in the package holes and the gates */
    gates: true,           /* frame gates at the rings (only with a needle) */
    gateMin: 16,           /* smallest half opening: ring radius 10 + 1.5 grace + 4.2 half span of the courier */
    gateBar: 3,            /* bar width in the gate's plane */
    gateDepth: 3,          /* bar depth along the gate's normal */
    laneEnd: 40,           /* horizontal lanes end this far inside the reserved box */
    fadeEnds: 60,
    cell: 40               /* contact grid */
  };
  const DENS = {
    level: [7, 22], fill: 0.95, proud: 12, balcony: 0.32, platforms: 26, platW: [26, 56], platD: [14, 26],
    girders: 26, girderT: [4, 7], girderH: [4, 8], pods: 24, podS: [9, 18], podDrop: [4, 20], holo: 0.7
  };
  /* lane mixes and spacing as menger.js */
  const MIX = { small: ['car', 'drone', 'car'], lift: ['car', 'drone', 'drone'] };
  const SPACING = { small: 92, lift: 60 };
  const HALF = { hauler: 11.6, car: 3.0, drone: 3.9 };
  function laneRadius(l) { return Math.max.apply(null, l.mix.map((t) => HALF[t] || 4)) + 1.5; }

  /* ---- helpers ------------------------------------------------------------ */
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function makeRng(seed) {
    const r = mulberry32(seed);
    r.range = (a, b) => a + (b - a) * r();
    r.int = (a, b) => Math.floor(a + (b - a + 1) * r());
    r.pick = (arr) => arr[Math.floor(r() * arr.length)];
    r.chance = (p) => r() < p;
    return r;
  }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function len(a) { return Math.sqrt(dot(a, a)); }
  function norm(a) { const l = len(a); return l > 1e-12 ? [a[0] / l, a[1] / l, a[2] / l] : [0, 0, 0]; }
  function sa(c, v, s) { return [c[0] + v[0] * s, c[1] + v[1] * s, c[2] + v[2] * s]; }

  /* plan boxes: { a: [x0, y0, z0, x1, y1, z1], tone, zone, kind, sd } */
  function box(x0, y0, z0, x1, y1, z1, tone, zone, kind, sd) {
    return { a: [Math.min(x0, x1), Math.min(y0, y1), Math.min(z0, z1), Math.max(x0, x1), Math.max(y0, y1), Math.max(z0, z1)],
      tone: tone, zone: zone, kind: kind, sd: sd == null ? 0.5 : sd };
  }
  const boxA = (a, tone, zone, kind, sd) => box(a[0], a[1], a[2], a[3], a[4], a[5], tone, zone, kind, sd);
  const vol = (a) => (a[3] - a[0]) * (a[4] - a[1]) * (a[5] - a[2]);
  function overlaps(a, b, m) {
    m = m || 0;
    return a[0] < b[3] + m && a[3] > b[0] - m && a[1] < b[4] + m && a[4] > b[1] - m && a[2] < b[5] + m && a[5] > b[2] - m;
  }
  function ptBoxDist(p, a) {
    const dx = Math.max(a[0] - p[0], 0, p[0] - a[3]), dy = Math.max(a[1] - p[1], 0, p[1] - a[4]), dz = Math.max(a[2] - p[2], 0, p[2] - a[5]);
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }
  function aaDist(a, b) {
    let s = 0;
    for (let i = 0; i < 3; i++) { const g = Math.max(0, b[i] - a[i + 3], a[i] - b[i + 3]); s += g * g; }
    return Math.sqrt(s);
  }
  /* a minus b: up to six boxes, split along `first` axis first */
  function subtract(B, h, first) {
    const a = B.a;
    if (!overlaps(a, h)) return [B];
    const out = [], cur = a.slice();
    for (const ax of [first, (first + 1) % 3, (first + 2) % 3]) {
      if (cur[ax] < h[ax]) { const q = cur.slice(); q[ax + 3] = h[ax]; out.push(q); }
      if (cur[ax + 3] > h[ax + 3]) { const q = cur.slice(); q[ax] = h[ax + 3]; out.push(q); }
      cur[ax] = Math.max(cur[ax], h[ax]); cur[ax + 3] = Math.min(cur[ax + 3], h[ax + 3]);
    }
    return out.filter((q) => q[3] - q[0] > 0.05 && q[4] - q[1] > 0.05 && q[5] - q[2] > 0.05).map((q) => Object.assign({}, B, { a: q }));
  }
  function carve(list, holes) {
    let L = list;
    for (const h of holes) {
      const out = [];
      for (const B of L) {
        if (h.only && h.only.indexOf(B.kind) < 0) { out.push(B); continue; }
        for (const q of subtract(B, h.a, h.axis == null ? 1 : h.axis)) out.push(q);
      }
      L = out;
    }
    return L;
  }
  /* a horizontal plate (y0..y1) over [x0, x1] x [z0, z1] with rectangular
     holes [[cx, cz, hx, hz]] (half sizes), as strips: no box face crosses a
     hole. Holes must not overlap each other. */
  function plate(x0, x1, z0, z1, y0, y1, holes, tone, zone, kind, rng) {
    const xs = new Set([x0, x1]);
    for (const h of holes) { xs.add(Math.max(x0, Math.min(x1, h[0] - h[2]))); xs.add(Math.max(x0, Math.min(x1, h[0] + h[2]))); }
    const X = Array.from(xs).sort((a, b) => a - b), out = [];
    for (let i = 0; i + 1 < X.length; i++) {
      const xa = X[i], xb = X[i + 1];
      if (xb - xa < 0.05) continue;
      const xm = (xa + xb) / 2;
      const cuts = holes.filter((h) => xm > h[0] - h[2] && xm < h[0] + h[2]).map((h) => [h[1] - h[3], h[1] + h[3]]).sort((a, b) => a[0] - b[0]);
      let z = z0;
      for (const c of cuts) { if (c[0] > z + 0.05) out.push(box(xa, y0, z, xb, y1, Math.min(c[0], z1), tone, zone, kind, rng())); z = Math.max(z, c[1]); }
      if (z1 > z + 0.05) out.push(box(xa, y0, z, xb, y1, z1, tone, zone, kind, rng()));
    }
    return out;
  }

  /* ---- the route curve ---------------------------------------------------------
     Centripetal Catmull-Rom (Barry-Goldman, alpha 0.5) through the control
     points, resampled by arc length every `step` metres. */
  function crSeg(P0, P1, P2, P3, n, out) {
    const d = (a, b) => Math.pow(Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]), 0.5) || 1e-4;
    const t0 = 0, t1 = t0 + d(P0, P1), t2 = t1 + d(P1, P2), t3 = t2 + d(P2, P3);
    const L = (A, B, ta, tb, t) => A.map((v, i) => ((tb - t) * v + (t - ta) * B[i]) / (tb - ta));
    for (let k = 0; k < n; k++) {
      const t = t1 + (t2 - t1) * k / n;
      const A1 = L(P0, P1, t0, t1, t), A2 = L(P1, P2, t1, t2, t), A3 = L(P2, P3, t2, t3, t);
      const B1 = L(A1, A2, t0, t2, t), B2 = L(A2, A3, t1, t3, t);
      out.push(L(B1, B2, t1, t2, t));
    }
  }
  function makeCurve(ctrl, step) {
    const P = [ctrl[0].map((v, i) => 2 * v - ctrl[1][i])].concat(ctrl, [ctrl[ctrl.length - 1].map((v, i) => 2 * v - ctrl[ctrl.length - 2][i])]);
    const dense = [];
    for (let i = 1; i + 2 < P.length; i++) crSeg(P[i - 1], P[i], P[i + 1], P[i + 2], 200, dense);
    dense.push(ctrl[ctrl.length - 1].slice());
    const cum = [0];
    for (let i = 1; i < dense.length; i++) cum.push(cum[i - 1] + Math.hypot(dense[i][0] - dense[i - 1][0], dense[i][1] - dense[i - 1][1], dense[i][2] - dense[i - 1][2]));
    const length = cum[cum.length - 1];
    const pts = [], s = [];
    let j = 0;
    for (let u = 0; u <= length + 1e-6; u += step) {
      while (j < cum.length - 2 && cum[j + 1] < u) j++;
      const f = (u - cum[j]) / Math.max(1e-9, cum[j + 1] - cum[j]);
      pts.push(dense[j].map((v, i) => v + (dense[j + 1][i] - v) * f)); s.push(u);
    }
    const c = { ctrl: ctrl, pts: pts, s: s, length: length, step: step };
    c.at = (u) => {
      const k = Math.max(0, Math.min(pts.length - 2, Math.floor(u / step)));
      const f = Math.max(0, Math.min(1, (u - s[k]) / step));
      return pts[k].map((v, i) => v + (pts[k + 1][i] - v) * f);
    };
    c.tan = (u) => norm(sub(c.at(Math.min(length, u + 2)), c.at(Math.max(0, u - 2))));
    /* the first crossing of a coordinate level after `from`, refined linearly */
    c.cross = (ax, level, from) => {
      for (let i = 1; i < pts.length; i++) {
        if (s[i] < (from || 0)) continue;
        const a = pts[i - 1][ax] - level, b = pts[i][ax] - level;
        if (a === 0) return s[i - 1];
        if (a * b < 0) return s[i - 1] + (s[i] - s[i - 1]) * a / (a - b);
      }
      return length;
    };
    return c;
  }
  /* smallest radius of curvature of a curve at(u) over [s0, s1]
     (circumradius over +-h metres) */
  function curvatureOf(at, s0, s1, h) {
    let Rmin = Infinity, where = s0;
    for (let u = s0 + h; u <= s1 - h; u += 2) {
      const a = at(u - h), b = at(u), c = at(u + h);
      const ab = len(sub(b, a)), bc = len(sub(c, b)), ca = len(sub(a, c));
      const area2 = len(cross(sub(b, a), sub(c, a)));
      const r = area2 < 1e-9 ? Infinity : ab * bc * ca / (2 * area2);
      if (r < Rmin) { Rmin = r; where = u; }
    }
    return { R: Rmin, s: where };
  }

  /* ---- the plan --------------------------------------------------------------- */
  /* cosine-eased weave between the knots (430, 0), (300, +A), (160, -A),
     (yB, -A): extremes in the middle of each package, deck spacing 140 m */
  function weaveX(C, y) {
    const k = [[430, 0], [300, C.amp], [160, -C.amp], [C.yB, -C.amp]];
    for (let i = 0; i + 1 < k.length; i++) {
      const ya = k[i][0], xa = k[i][1], yb = k[i + 1][0], xb = k[i + 1][1];
      if (y <= ya && y >= yb) { const t = (ya - y) / (ya - yb); return xa + (xb - xa) * (1 - Math.cos(Math.PI * t)) / 2; }
    }
    return 0;
  }

  /* the calm exterior: plinth band, cornice, a service band, proud housing
     fields with blank bays between them (kind 'ext') */
  function dress(P, faces, o) {
    const r = P.rng;
    const plinth = o.plinth == null ? 28 : o.plinth, cornice = o.cornice == null ? 18 : o.cornice, band = o.band;
    const fields = o.fields || [2, 3], fieldW = o.fieldW || [40, 80], proud = o.proud || [2, 6];
    for (const f of faces) {
      const n = f.n, at = f.at, u0 = f.u0, u1 = f.u1, y0 = f.y0, y1 = f.y1;
      const ax = n[0] ? 'x' : 'z', s = n[0] || n[2];
      const slab = (ua, ub, ya, yb, d0, d1, tone, zone) => {
        const a = ax === 'x' ? [at + s * d0, ya, ua, at + s * d1, yb, ub] : [ua, ya, at + s * d0, ub, yb, at + s * d1];
        P.shell.push(boxA(a, tone, zone, 'ext', r()));
      };
      if (plinth) slab(u0 - 4, u1 + 4, y0, y0 + plinth, 0, 4, 0.2, Z.BLANK);
      if (plinth) slab(u0 - 2, u1 + 2, y0 + plinth - 3, y0 + plinth, 4, 7, 0.14, Z.BLANK);
      if (cornice) slab(u0 - 6, u1 + 6, y1 - cornice, y1, 0, 6, 0.24, Z.BLANK);
      if (band) slab(u0, u1, band, band + 10, 0, 3, 0.2, Z.SERVICE);
      const nf = r.int(fields[0], fields[1]), L = u1 - u0;
      for (let i = 0; i < nf; i++) {
        const c = u0 + L * (i + 1) / (nf + 1);
        const w = r.range(fieldW[0], fieldW[1]), d = r.range(proud[0], proud[1]);
        const ya = y0 + plinth + 14, yb = y1 - cornice - 12;
        if (band) { slab(c - w / 2, c + w / 2, ya, band - 6, 0, d, r.range(0.26, 0.34), Z.HOUSING); slab(c - w / 2, c + w / 2, band + 16, yb, 0, d, r.range(0.26, 0.34), Z.HOUSING); }
        else slab(c - w / 2, c + w / 2, ya, yb, 0, d, r.range(0.26, 0.34), Z.HOUSING);
      }
      slab(u0 + L * 0.3, u0 + L * 0.7, y0 + 2, y0 + 12, 0, 1, 0.3, Z.LOBBY);
    }
  }

  /* a portal on an outer face: c = centre of the opening on the outer plane,
     n = outward normal (axis aligned), w x h, D = depth to the void. Adds the
     carve box (through the wall, plus margin into the void) and a proud
     surround of four bars. */
  function portal(P, c, n, w, h, D, o) {
    const frame = o.frame == null ? 10 : o.frame, proud = o.proud == null ? 8 : o.proud;
    const ax = Math.abs(n[0]) > 0.5 ? 0 : Math.abs(n[1]) > 0.5 ? 1 : 2;
    const u = ax === 0 ? [0, 0, 1] : [1, 0, 0];
    const v = ax === 1 ? [0, 0, 1] : [0, 1, 0];
    const p = { c: c, n: n, u: u, v: v, w: w, h: h, D: D, name: o.name, ax: ax, frame: frame, proud: proud };
    const lo = [0, 0, 0], hi = [0, 0, 0];
    for (let k = 0; k < 3; k++) {
      const e = Math.abs(u[k]) * w / 2 + Math.abs(v[k]) * h / 2;
      const a = c[k] - n[k] * (D + 6), b = c[k] + n[k] * (proud + 2);
      lo[k] = Math.min(a, b, c[k] - e); hi[k] = Math.max(a, b, c[k] + e);
      if (k !== ax) { lo[k] = c[k] - e; hi[k] = c[k] + e; }
    }
    P.holes.push({ a: lo.concat(hi), axis: ax });
    P.portals.push(p);
    const F = frame;
    for (const q of [[0, 1, w / 2 + F, F / 2], [0, -1, w / 2 + F, F / 2], [1, 0, F / 2, h / 2], [-1, 0, F / 2, h / 2]]) {
      const su = q[0], sv = q[1], lu = q[2], lv = q[3];
      const cc = [0, 1, 2].map((k) => c[k] + u[k] * su * (w / 2 + F / 2) + v[k] * sv * (h / 2 + F / 2) + n[k] * proud / 2);
      const lo2 = [0, 1, 2].map((k) => cc[k] - Math.abs(u[k]) * lu - Math.abs(v[k]) * lv - Math.abs(n[k]) * proud / 2);
      const hi2 = [0, 1, 2].map((k) => cc[k] + Math.abs(u[k]) * lu + Math.abs(v[k]) * lv + Math.abs(n[k]) * proud / 2);
      P.surrounds.push(box(lo2[0], lo2[1], lo2[2], hi2[0], hi2[1], hi2[2], 0.3, Z.BLANK, 'surround', 0.3));
    }
    return p;
  }

  /* D's massing: twin slabs with a set-back top, recessed end walls, the lid,
     the exterior dressing, the portals, the route control points, the decks */
  function massing(P) {
    const C = P.C, r = P.rng, LX = GEO.LX, SZ0 = GEO.SZ0, SZ1 = GEO.SZ1, EW = GEO.EW, AX = GEO.AX, DY = GEO;
    P.bbox = [-LX, 0, -SZ1, LX, DY.top, SZ1];
    P.zoneBox = [-AX, 0, -SZ0, AX, DY.lid[1], SZ0];
    /* furniture stops under the 2 m soffit skin of the package above */
    for (const v of DY.voids) P.voids.push({ a: [-AX, v[0], -SZ0, AX, v[1] - 2, SZ0], floor: 2 });
    for (const s of [-1, 1]) {
      P.shell.push(box(-LX, 0, s * SZ0, LX, DY.set, s * SZ1, 0.22, Z.BLANK, 'shell', 0.3 + s * 0.1));
      P.shell.push(box(-LX + 16, DY.set, s * SZ0, LX - 16, DY.top, s * (SZ1 - 16), 0.2, Z.BLANK, 'shell', 0.35 + s * 0.1));
    }
    for (const s of [-1, 1]) P.shell.push(box(s * EW, 0, -SZ0, s * AX, DY.lid[1], SZ0, 0.16, Z.SERVICE, 'shell', 0.6));
    P.shell.push(box(-EW, 0, -SZ0, EW, 4, SZ0, 0.18, Z.DECK, 'shell', 0.2));
    dress(P, [{ n: [0, 0, 1], at: SZ1, u0: -LX, u1: LX, y0: 0, y1: DY.set }, { n: [0, 0, -1], at: -SZ1, u0: -LX, u1: LX, y0: 0, y1: DY.set }],
      { band: 140, fields: [4, 4], fieldW: [50, 80], proud: [3, 8], plinth: 30, cornice: 10 });
    for (const s of [-1, 1]) {
      P.shell.push(box(-LX, 278, s * SZ1, LX, 288, s * (SZ1 + 3), 0.2, Z.SERVICE, 'ext', r()));
      P.shell.push(box(-LX + 30, DY.set + 8, s * (SZ1 - 16), LX - 30, DY.top - 8, s * (SZ1 - 13), 0.3, Z.HOUSING, 'ext', r()));
      P.shell.push(box(-LX, DY.set, s * (SZ1 - 2), LX, DY.set + 2.4, s * SZ1, 0.2, Z.BLANK, 'ext', r()));
      for (const x of [-1, 1]) P.shell.push(box(x * LX, 34, s * (SZ0 + 10), x * (LX + 2), 110, s * (SZ1 - 10), 0.24, Z.SERVICE, 'ext', r()));
    }
    dress(P, [
      { n: [1, 0, 0], at: LX, u0: SZ0, u1: SZ1, y0: 0, y1: DY.set }, { n: [1, 0, 0], at: LX, u0: -SZ1, u1: -SZ0, y0: 0, y1: DY.set },
      { n: [-1, 0, 0], at: -LX, u0: SZ0, u1: SZ1, y0: 0, y1: DY.set }, { n: [-1, 0, 0], at: -LX, u0: -SZ1, u1: -SZ0, y0: 0, y1: DY.set }
    ], { band: 140, fields: [0, 0], plinth: 30, cornice: 10 });
    /* the route: level approach, pitch down (R1), weave, pull out (R2), hall run, out east */
    const x0 = C.x0, R1 = C.R1, R2 = C.R2, yB = C.yB, yA = C.yApp, yO = C.yOut;
    P.roofPortal = portal(P, [x0, DY.lid[1], 0], [0, 1, 0], 80, 60, DY.lid[1] - DY.lid[0], { name: 'in', frame: 12, proud: 6 });
    P.exitPortal = portal(P, [EW, yO, 0], [1, 0, 0], 64, 52, EW - AX, { name: 'out' });
    const xs = x0 - R1 - 40;                       /* end of the level approach */
    const A = [xs - C.lead, yA, 0];
    const ctrl = [[A[0] - 150, yA, 0], A, [xs - C.lead / 2, yA, 0], [xs, yA, 0]];
    const yc = yA - R1;                            /* centre height of the pitch-down arc */
    for (let k = 0; k <= 8; k++) { const th = k / 8 * Math.PI / 2; ctrl.push([x0 - R1 + R1 * Math.sin(th), yc + R1 * Math.cos(th), 0]); }
    for (let y = yc - 12; y > yB + 4; y -= 12) ctrl.push([x0 + weaveX(C, y), y, 0]);
    const xb = x0 - C.amp;
    for (let k = 0; k <= 8; k++) { const th = k / 8 * Math.PI / 2; ctrl.push([xb + R2 - R2 * Math.cos(th), yB - R2 * Math.sin(th), 0]); }
    const Lv = [EW + C.leave, yO, 0];
    ctrl.push([xb + R2 + 40, yB - R2, 0], [(xb + R2 + 40 + EW) / 2, yO, 0], [EW, yO, 0], [EW + C.leave / 2, yO, 0], Lv, [Lv[0] + 150, yO, 0]);
    P.ctrl = ctrl; P.A = A; P.Lv = Lv;
    P.decks.push({ y: DY.lid[0], th: DY.lid[1] - DY.lid[0], x0: -AX, x1: AX, z0: -SZ0, z1: SZ0, holes: [], zone: Z.HOUSING, tone: 0.24, soffit: true, lid: true, name: 'lid' });
    DY.packs.forEach((pk, i) => P.decks.push({ y: pk[0], th: pk[1] - pk[0], x0: -AX, x1: AX, z0: -SZ0, z1: SZ0, holes: [], zone: Z.HOUSING, tone: 0.24, soffit: true, name: 'P' + (i + 1) }));
    multiScale(P);
  }

  /* E: detail on four scales (large form 100 to 300 m, articulation 30 to
     100 m, elements 5 to 20 m, texture under 5 m), each changing the
     silhouette or the shadow pattern of the scale above. Its own random
     stream, so the interior does not shift with it. */
  function multiScale(P) {
    const r = makeRng((P.seed + 77) | 0), ME = [], top = GEO.top;
    const sz = (a, s) => (s > 0 ? a : [a[0], a[1], -a[5], a[3], a[4], -a[2]]);
    const add = (a, tone, zone, kind) => { const b = boxA(a, tone, zone, kind || 'ext', r()); P.shell.push(b); ME.push(b); return b; };
    const free = (a, m) => !ME.some((b) => overlaps(a, b.a, m == null ? 4 : m));
    for (const s of [-1, 1]) {
      const xr = s < 0 ? [-150, 70] : [-60, 160];
      add(sz([xr[0], top, 70, xr[1], 500, 108], s), 0.2, Z.BLANK);
      add(sz([xr[0] + 10, top + 4, 108, xr[1] - 10, 496, 109.5], s), 0.3, Z.HOUSING);
      add(sz([xr[0] - 2, 497, 70, xr[1] + 2, 500, 110], s), 0.24, Z.BLANK);
    }
    add([-204, top, -136, -150, 560, -80], 0.22, Z.SERVICE);
    add([-202, 520, -134, -152, 556, -133], 0.3, Z.HOUSING);
    add([150, top, 80, 204, 535, 136], 0.22, Z.SERVICE);
    add([152, 500, 135, 202, 531, 136.5], 0.3, Z.HOUSING);
    P.crowns = [[-177, 560, -108], [177, 535, 108]];
    const bayS = add([-40, 160, 150, 60, 330, 172], 0.3, Z.HOUSING);
    add([-44, 330, 150, 64, 338, 175], 0.22, Z.BLANK);
    const bayN = add([80, 90, -172, 170, 260, -150], 0.3, Z.HOUSING);
    add([76, 260, -175, 174, 268, -150], 0.22, Z.BLANK);
    P.marks.push({ type: 'bay', a: bayS.a, s: 1 }, { type: 'bay', a: bayN.a, s: -1 });
    const towerX = { 1: [-170, 95, 185], '-1': [-150, -30, 192] };
    for (const s of [-1, 1]) {
      for (const x of towerX[s]) {
        const a = add(sz([x - 8, 0, 150, x + 8, 482, 166], s), 0.2, Z.SERVICE);
        P.marks.push({ type: 'stower', a: a.a, s: s });
      }
      for (let k = 0; k < 2; k++) {
        const x = -120 + k * 170 + r.range(-20, 20), a = sz([x - 4.5, 0, 150, x + 4.5, 440, 159], s);
        if (free(a, 6)) { add(a, 0.24, Z.BLANK); P.marks.push({ type: 'stair', a: a, s: s }); }
      }
    }
    let np = 0;
    for (let k = 0; k < 120 && np < 18; k++) {
      const s = r() < 0.5 ? -1 : 1, w = r.range(14, 24), h = r.range(10, 16), d = r.range(10, 14);
      const x = r.range(-200, 200 - w), y = r.range(110, 380);
      const a = sz([x, y, 150, x + w, y + h, 150 + d], s);
      if (!free(a, 8)) continue;
      add(a, r.range(0.24, 0.34), r() < 0.6 ? Z.HOUSING : Z.LOBBY);
      P.marks.push({ type: 'cpod', a: a, s: s });
      np++;
    }
    for (const a of [[40, 476, -70, 56, 486, 70], [140, 450, -70, 156, 458, 70],
      [202, 250, -70, 218, 258, 70], [202, 330, -70, 218, 338, 70], [-218, 180, -70, -202, 188, 70], [-218, 300, -70, -202, 308, 70]]) {
      add(a, 0.28, Z.HOUSING);
      P.marks.push({ type: 'xbridge', a: a });
    }
    let nl = 0;
    for (let k = 0; k < 200 && nl < 16; k++) {
      const s = r() < 0.5 ? -1 : 1, w = r.range(24, 42), h = r.range(12, 22);
      const x = r.range(-210, 210 - w), y = r.range(40, 390 - h);
      const a = sz([x, y, 142, x + w, y + h, 151], s);
      if (!free(a, 6) || (y < 150 && y + h > 138) || (y < 288 && y + h > 276)) continue;
      P.holes.push({ a: a, axis: 2, only: ['shell', 'ext'] });
      ME.push({ a: a });
      P.marks.push({ type: 'loggia', a: a, s: s });
      nl++;
    }
    P.stats.multi = { pods: np, loggias: nl, items: ME.length };
    P.rngE = r;
  }

  /* the local clearance radius of variant B, or null (wide holes, no gates) */
  function needleOf(C) { return C.needle != null && C.needle < TUBE ? +C.needle : null; }
  /* a package's route hole is the route's extent over the package height
     (+- the tube) plus a rim on every side. The lid (the roof portal, an
     invitation rather than a test) and every hole without a needle keep the
     tube and 3 m: the reveal never comes closer than 22.5 m, whatever the
     weave does inside the package. With a needle (variant B) the two
     packages keep the needle and 3 m, at least needle + 5 m half size, and
     the band reaches over the soffit; every such hole is a needle zone. */
  function sizeHoles(P) {
    const nr = needleOf(P.C);
    P.needleZones = [];
    for (const d of P.decks) {
      const nd = nr != null && !d.lid, yb = d.y - (nd && d.soffit ? 2 : 0);
      let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
      for (const p of P.route.pts) if (p[1] > yb - TUBE && p[1] < d.y + d.th + TUBE && Math.abs(p[0]) < GEO.AX) {
        x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); z0 = Math.min(z0, p[2]); z1 = Math.max(z1, p[2]);
      }
      const m = nd ? nr + 3 : TUBE + 3, mx = nd ? nr + 5 : 32, mz = nd ? nr + 5 : 28;
      const h = [(x0 + x1) / 2, (z0 + z1) / 2, Math.max(mx, (x1 - x0) / 2 + m), Math.max(mz, (z1 - z0) / 2 + m)];
      if (d.lid) { h[0] = P.C.x0; h[2] = Math.max(h[2], 40); h[3] = Math.max(h[3], 30); }
      d.holes = [h]; d.route = h;
      if (nd) P.needleZones.push({ name: d.name, r: nr, a: [h[0] - h[2], yb - TUBE, h[1] - h[3], h[0] + h[2], d.y + d.th + TUBE, h[1] + h[3]] });
    }
  }

  /* Variant B's frame gates, one per ring: an axis-aligned frame in the
     plane across the ring's dominant direction (horizontal in V1, V2 and
     halfway round the pull-out, upright on the hall run). The opening is
     the race line's extent within needle + half the depth of the plane plus
     needle + 3 m on every side, at least gateMin; two bridges run along z
     from wall to wall, two posts close the opening (in the hall down to the
     floor). Bars are carved where a lane passes (its reach plus 2 m) and
     must keep the needle from the design curve; a slab of the tube's width
     round the plane is a needle zone. Called after the furniture, so the
     random streams and every other box index stay as they were. */
  function gates(P) {
    const C = P.C, nr = needleOf(C);
    P.gates = [];
    if (!C.gates || nr == null) return;
    const R = P.route, W = C.gateBar, T = C.gateDepth, m = nr + 3;
    const V = [-GEO.AX, GEO.voids[2][0], -GEO.SZ0, GEO.AX, GEO.lid[0] - 2, GEO.SZ0];
    let dropped = 0;
    P.ringS.forEach((s, i) => {
      const p = R.at(s), t = R.tan(s);
      const ax = Math.abs(t[1]) >= Math.abs(t[0]) && Math.abs(t[1]) >= Math.abs(t[2]) ? 1 : Math.abs(t[0]) >= Math.abs(t[2]) ? 0 : 2;
      const sp = ax === 2 ? 0 : 2, cr = ax === 1 ? 0 : 1, c = p[ax];
      /* the run of curve samples round the ring within the band (the weave
         crosses the same plane elsewhere; the bars' clearance check covers that) */
      const lo = p.slice(), hi = p.slice(), k0 = Math.round(s / R.step);
      for (const dk of [-1, 1]) {
        for (let k = k0; k >= 0 && k < R.pts.length && Math.abs(R.pts[k][ax] - c) <= T / 2 + nr; k += dk) {
          for (let j = 0; j < 3; j++) { lo[j] = Math.min(lo[j], R.pts[k][j]); hi[j] = Math.max(hi[j], R.pts[k][j]); }
        }
      }
      const cs = (lo[sp] + hi[sp]) / 2, cc = (lo[cr] + hi[cr]) / 2;
      const hs = Math.max(C.gateMin, (hi[sp] - lo[sp]) / 2 + m), hc = Math.max(C.gateMin, (hi[cr] - lo[cr]) / 2 + m);
      const bar = (s0, s1, c0, c1) => { const a = [0, 0, 0, 0, 0, 0]; a[ax] = c - T / 2; a[ax + 3] = c + T / 2; a[sp] = s0; a[sp + 3] = s1; a[cr] = c0; a[cr + 3] = c1; return a; };
      const cTop = cc + hc + W, cBot = cr === 1 ? V[1] : cc - hc - W;
      let list = [
        bar(V[sp], V[sp + 3], cc + hc, cc + hc + W), bar(V[sp], V[sp + 3], cc - hc - W, cc - hc),
        bar(cs - hs - W, cs - hs, cBot, cTop), bar(cs + hs, cs + hs + W, cBot, cTop)
      ].map((a) => ({ a: a, kind: 'gate' }));
      /* a lane cuts a bar right across: the gap spans the bar's section */
      for (const l of P.lanes) {
        const e = laneBoxL(l), g = laneRadius(l) + 2, env = [e[0] - g, e[1] - g, e[2] - g, e[3] + g, e[4] + g, e[5] + g];
        const out = [];
        for (const b of list) {
          if (!overlaps(b.a, env)) { out.push(b); continue; }
          const a = b.a, lg = [0, 1, 2].reduce((m, j) => (a[j + 3] - a[j] > a[m + 3] - a[m] ? j : m), 0);
          if (env[lg] > a[lg] + 0.05) { const q = a.slice(); q[lg + 3] = env[lg]; out.push({ a: q, kind: b.kind }); }
          if (env[lg + 3] < a[lg + 3] - 0.05) { const q = a.slice(); q[lg] = env[lg + 3]; out.push({ a: q, kind: b.kind }); }
        }
        list = out;
      }
      const bars = [];
      for (const b of list) {
        if (!P.clearOf(b.a, nr)) { dropped++; continue; }
        const q = box(b.a[0], b.a[1], b.a[2], b.a[3], b.a[4], b.a[5], 0.2, Z.BLANK, 'gate', 0.4 + 0.05 * i);
        P.solids.push(q); bars.push(q.a);
      }
      const o = [0, 0, 0]; o[ax] = c; o[sp] = cs; o[cr] = cc;
      P.gates.push({ name: 'ring' + (i + 1), s: s, ax: ax, sp: sp, cr: cr, c: o, hs: hs, hc: hc, depth: T, bars: bars });
      const z = V.slice();
      z[ax] = c - T / 2 - TUBE; z[ax + 3] = c + T / 2 + TUBE;
      P.needleZones.push({ name: 'ring' + (i + 1), r: nr, a: z });
    });
    P.stats.gates = P.gates.length; P.stats.gateDropped = dropped;
  }

  /* lanes on the Menger 54 m lattice: x-lanes on z = 27 + 54k, z-lanes on
     x = 27 + 54k, verticals on x, z = 54k */
  function lane(P, axis, p, kind) {
    const r = P.rng, C = P.C;
    const v = kind === 'small' ? 20 + 8 * r() : 12 + 6 * r();
    let span;
    if (axis === 'y') span = [-60, GEO.lid[0] - 8];          /* lifts end under the lid: no hole in the roof */
    else if (axis === 'x') span = [-(GEO.LX + C.plaza - C.laneEnd), GEO.LX + C.plaza - C.laneEnd];
    else span = [-(GEO.SZ1 + C.plaza - C.laneEnd), GEO.SZ1 + C.plaza - C.laneEnd];
    P.lanes.push({ axis: axis, p: p, s0: span[0], s1: span[1], dir: P.lanes.length % 2 ? 1 : -1, v: v, mix: MIX[kind], kind: kind });
  }
  function liftLanes(P, cands, n, minRoute) {
    let k = 0;
    for (const c of cands) {
      if (k >= n) break;
      const x = c[0], z = c[1];
      let ok = true;
      for (let i = 0; i < P.route.pts.length && ok; i++) {
        const u = P.route.s[i];
        if (u < P.sIn - 40 || u > P.sOut + 40) continue;
        const p = P.route.pts[i];
        if (Math.hypot(p[0] - x, p[2] - z) < minRoute) ok = false;
      }
      for (const d of P.decks) for (const h of d.holes) if (Math.abs(x - h[0]) < h[2] + 16 && Math.abs(z - h[1]) < h[3] + 16) ok = false;
      if (ok) { lane(P, 'y', [x, 0, z], 'lift'); k++; }
    }
  }
  function laneBoxL(l) {
    const ax = 'xyz'.indexOf(l.axis), lo = l.p.slice(), hi = l.p.slice();
    lo[ax] = l.s0; hi[ax] = l.s1;
    return lo.concat(hi);
  }

  /* city-stack density on the inner faces of every void */
  function innerWalls(P, blocked) {
    const r = P.rng, dens = DENS;
    for (const v of P.voids) {
      const a0 = v.a, x0 = a0[0], y0 = a0[1], z0 = a0[2], x1 = a0[3], y1 = a0[4], z1 = a0[5];
      const faces = [
        { n: [1, 0, 0], at: x0, u0: z0, u1: z1, ax: 'z' }, { n: [-1, 0, 0], at: x1, u0: z0, u1: z1, ax: 'z' },
        { n: [0, 0, 1], at: z0, u0: x0, u1: x1, ax: 'x' }, { n: [0, 0, -1], at: z1, u0: x0, u1: x1, ax: 'x' }
      ];
      for (const f of faces) {
        let y = y0 + (v.floor || 0);
        while (y < y1 - 6) {
          const h = Math.min(y1 - y, r.range(dens.level[0], dens.level[1]));
          let u = f.u0;
          while (u < f.u1 - 4) {
            const ln = Math.min(r.range(10, 34), f.u1 - u);
            if (r.chance(dens.fill)) {
              const d = r.range(0.5, dens.proud);
              const zone = r.chance(0.68) ? Z.HOUSING : r.chance(0.5) ? Z.SERVICE : r.chance(0.6) ? Z.BLANK : Z.LOBBY;
              const nx = f.n[0], nz = f.n[2];
              const a = f.ax === 'z'
                ? [nx > 0 ? f.at : f.at - d, y, u + 0.2, nx > 0 ? f.at + d : f.at, y + h - 0.3, u + ln - 0.2]
                : [u + 0.2, y, nz > 0 ? f.at : f.at - d, u + ln - 0.2, y + h - 0.3, nz > 0 ? f.at + d : f.at];
              if (!blocked(a, TUBE, 3) && !P.slots.some((s) => overlaps(a, s.a, 1))) {
                P.solids.push(boxA(a, r.range(0.2, 0.42), zone, 'inner', r()));
                if (r.chance(dens.balcony)) {
                  const bd = r.range(2, 8);
                  const b = f.ax === 'z'
                    ? [nx > 0 ? f.at + d : f.at - d - bd, y, u + ln * 0.1, nx > 0 ? f.at + d + bd : f.at - d, y + 0.8, u + ln * 0.9]
                    : [u + ln * 0.1, y, nz > 0 ? f.at + d : f.at - d - bd, u + ln * 0.9, y + 0.8, nz > 0 ? f.at + d + bd : f.at - d];
                  if (!blocked(b, TUBE, 3)) {
                    P.solids.push(boxA(b, 0.22, Z.BLANK, 'balcony', r()));
                    P.marks.push({ type: 'lamp', p: [(b[0] + b[3]) / 2 + nx * bd * 0.4, y - 0.6, (b[2] + b[5]) / 2 + nz * bd * 0.4] });
                  }
                }
              }
            }
            u += ln;
          }
          y += h;
        }
      }
    }
  }
  /* plant and tanks in the corners of every void; galleries every 9 m along
     the long walls, cut where the tube or a lane passes; the campus */
  function extras(P, blocked) {
    const r = P.rng;
    let np = 0;
    for (const v of P.voids) {
      const a0 = v.a, x0 = a0[0], y0 = a0[1], z0 = a0[2], x1 = a0[3], y1 = a0[4], z1 = a0[5], H = y1 - y0;
      for (let k = 0; k < 60; k++) {
        const w = r.range(18, 40), d = r.range(14, 30), h = Math.min(H - 8, r.range(10, 34));
        const cx = r() < 0.5 ? x0 + w / 2 + r.range(0, 40) : x1 - w / 2 - r.range(0, 40);
        const cz = r() < 0.5 ? z0 + d / 2 : z1 - d / 2;
        const a = [cx - w / 2, y0, cz - d / 2, cx + w / 2, y0 + h, cz + d / 2];
        if (blocked(a, TUBE, 4) || P.solids.some((b) => b.kind === 'plant' && overlaps(a, b.a, 3))) continue;
        const tank = r() < 0.35;
        P.solids.push(boxA(a, r.range(0.2, 0.32), tank ? Z.BLANK : Z.SERVICE, 'plant', r()));
        P.marks.push({ type: 'plant', a: a, tank: tank });
        np++;
      }
    }
    P.stats.plant = np;
    let ng = 0;
    for (const v of P.voids) {
      const a0 = v.a, x0 = a0[0], y0 = a0[1], z0 = a0[2], x1 = a0[3], y1 = a0[4], z1 = a0[5];
      for (let y = y0 + 9; y < y1 - 6; y += 9) for (const s of [-1, 1]) {
        const zf = s < 0 ? z0 : z1;
        for (let x = x0; x < x1; x += 24) {
          const q = [x, y, s < 0 ? zf : zf - 5, Math.min(x + 24, x1), y + 0.8, s < 0 ? zf + 5 : zf];
          if (blocked(q, TUBE, 3)) continue;
          P.solids.push(boxA(q, 0.24, Z.BLANK, 'gallery', r())); ng++;
          P.marks.push({ type: 'gallery', a: q, s: s });
        }
      }
    }
    P.stats.galleries = ng;
    if (P.C.campus) campus(P, blocked);
  }
  /* the campus at the plinth: logistics halls, parking decks, offices, a
     substation, a transit station on the south side, tied to the plinth with
     bridges and conveyor tubes; nothing on the exit side (the plaza) */
  function campus(P, blocked) {
    const r = P.rng, bb = P.bbox, pz = P.C.plaza - 20, list = [];
    const ok = (a) => !blocked(a, TUBE + 4, 6) && !list.some((b) => overlaps(a, b.a, 10)) &&
      !overlaps(a, [bb[0] - 30, -1, bb[2] - 30, bb[3] + 30, 1000, bb[5] + 30]) &&
      a[0] > bb[0] - pz && a[3] < bb[3] + pz && a[2] > bb[2] - pz && a[5] < bb[5] + pz;
    const kinds = [
      { k: 'hall', w: [60, 110], d: [40, 70], h: [24, 40], zone: Z.BLANK },
      { k: 'parking', w: [50, 80], d: [40, 60], h: [24, 48], zone: Z.SERVICE },
      { k: 'office', w: [30, 50], d: [30, 46], h: [40, 80], zone: Z.HOUSING },
      { k: 'substation', w: [40, 60], d: [30, 40], h: [14, 22], zone: Z.SERVICE }
    ];
    const st = [-170, 0, bb[5] + 40, 170, 30, bb[5] + 78];
    if (ok(st)) { const b = boxA(st, 0.26, Z.SERVICE, 'campus', r()); b.ck = 'station'; list.push(b); }
    const R0 = 40, R1 = 250;
    for (let k = 0; k < 1500 && list.length < 52; k++) {
      const t = kinds[k % kinds.length];
      const w = r.range(t.w[0], t.w[1]), d = r.range(t.d[0], t.d[1]), h = r.range(t.h[0], t.h[1]);
      const side = r.int(0, 3);
      let cx, cz;
      if (side < 2) { cx = r.range(bb[0] - R1, bb[3] + R1); cz = side ? bb[5] + r.range(R0, R1) : bb[2] - r.range(R0, R1); }
      else { cz = r.range(bb[2] - R1, bb[5] + R1); cx = side === 2 ? bb[3] + r.range(R0, R1) : bb[0] - r.range(R0, R1); }
      if (cx > bb[3] - 40 && Math.abs(cz) < 190) continue;          /* the plaza on the exit side */
      if (Math.abs(cz) < 30 || Math.abs(cx) < 30) continue;           /* the two boulevards */
      const a = [cx - w / 2, 0, cz - d / 2, cx + w / 2, h, cz + d / 2];
      if (!ok(a)) continue;
      const b = boxA(a, r.range(0.2, 0.34), t.zone, 'campus', r());
      b.ck = t.k; list.push(b);
    }
    P.campus = list;
    P.stats.campus = list.length;
    for (const b of list) P.solids.push(b);
    let nb = 0, nc = 0;
    for (const b of list) {
      if (r() > 0.55) continue;
      const a = b.a, cx = (a[0] + a[3]) / 2, cz = (a[2] + a[5]) / 2, y = Math.min(a[4] - 6, 12 + r() * 10);
      let br = null;
      if (cz > bb[5] && cx > bb[0] + 10 && cx < bb[3] - 10) br = [cx - 4, y, bb[5], cx + 4, y + 5, a[2]];
      else if (cz < bb[2] && cx > bb[0] + 10 && cx < bb[3] - 10) br = [cx - 4, y, a[5], cx + 4, y + 5, bb[2]];
      else if (cx < bb[0] && cz > bb[2] + 10 && cz < bb[5] - 10) br = [a[3], y, cz - 4, bb[0], y + 5, cz + 4];
      if (!br || br[3] - br[0] < 1 || br[5] - br[2] < 1) continue;
      if (r() < 0.5 && !blocked(br, TUBE, 6)) {
        P.solids.push(boxA(br, 0.26, Z.LOBBY, 'campusbridge', r()));
        P.marks.push({ type: 'cbridge', a: br }); nb++;
      } else { P.marks.push({ type: 'conveyor', a: br }); nc++; }
    }
    P.stats.campusBridges = nb; P.stats.conveyors = nc;
  }
  /* the floor of every void: a row of market halls and workshops along
     both long walls, 20 to 36 m deep, up to 64 m tall in the hall and three
     quarters of the void elsewhere, so a void is a street, not a hangar */
  function hallBlocks(P, blocked) {
    const r = P.rng;
    let n = 0;
    for (const vd of P.voids) {
      const v = vd.a, H = v[4] - v[1], hr = H > 100 ? [18, 64] : [0.3 * H, 0.75 * H];
      for (const s of [-1, 1]) {
        let x = v[0] + r.range(0, 8);
        while (x < v[3] - 12) {
          const ln = Math.min(r.range(20, 50), v[3] - x), d = r.range(20, 36), h = r.range(hr[0], hr[1]);
          const a = [x, v[1], s < 0 ? v[2] : v[5] - d, x + ln, v[1] + h, s < 0 ? v[2] + d : v[5]];
          if (!blocked(a, TUBE, 4)) {
            P.solids.push(boxA(a, r.range(0.22, 0.34), r.chance(0.5) ? Z.LOBBY : Z.HOUSING, 'hallblock', r()));
            P.keep.push(a);
            P.marks.push({ type: 'hallblock', a: a, s: s });
            n++;
          }
          x += ln + r.range(4, 12);
        }
      }
    }
    P.stats.hallBlocks = n;
  }
  /* cantilevered stages / landing platforms off the inner walls */
  function platforms(P, blocked) {
    const r = P.rng, dens = DENS;
    let n = 0;
    for (let k = 0; k < dens.platforms * 6 && n < dens.platforms; k++) {
      const v = r.pick(P.voids);
      const x0 = v.a[0], y0 = v.a[1], z0 = v.a[2], x1 = v.a[3], y1 = v.a[4], z1 = v.a[5];
      const side = r.int(0, 3);
      const w = r.range(dens.platW[0], dens.platW[1]), d = r.range(dens.platD[0], dens.platD[1]);
      const y = r.range(y0 + 25, y1 - 30);
      let a;
      if (side < 2) { const zc = r.range(z0 + w / 2 + 4, z1 - w / 2 - 4); a = side === 0 ? [x0, y, zc - w / 2, x0 + d, y + 3, zc + w / 2] : [x1 - d, y, zc - w / 2, x1, y + 3, zc + w / 2]; }
      else { const xc = r.range(x0 + w / 2 + 4, x1 - w / 2 - 4); a = side === 2 ? [xc - w / 2, y, z0, xc + w / 2, y + 3, z0 + d] : [xc - w / 2, y, z1 - d, xc + w / 2, y + 3, z1]; }
      const env = a.slice(); env[4] += 12;
      if (blocked(env, TUBE, 4) || P.solids.some((b) => b.kind === 'deck' && overlaps(env, b.a, 6))) continue;
      P.solids.push(boxA(a, 0.24, Z.DECK, 'plat', r()));
      const kn = r.int(0, 2);
      for (let q = 0; q < kn; q++) {
        const kw = r.range(4, 10), kd = r.range(4, 9), kh = r.range(3, 9);
        const kx = r.range(a[0] + kw / 2 + 1, a[3] - kw / 2 - 1), kz = r.range(a[2] + kd / 2 + 1, a[5] - kd / 2 - 1);
        const kb = [kx - kw / 2, a[4], kz - kd / 2, kx + kw / 2, a[4] + kh, kz + kd / 2];
        if (!blocked(kb, TUBE, 3)) P.solids.push(boxA(kb, r.range(0.22, 0.36), r.chance(0.6) ? Z.LOBBY : Z.HOUSING, 'kiosk', r()));
      }
      P.marks.push({ type: 'plat', a: a, side: side, holo: r.chance(dens.holo) });
      n++;
    }
    P.stats.platforms = n;
  }
  /* girders across the voids, cargo pods hanging from decks and girders */
  function girdersAndPods(P, blocked) {
    const r = P.rng, dens = DENS;
    let ng = 0, np = 0;
    for (let k = 0; k < dens.girders * 8 && ng < dens.girders; k++) {
      const v = r.pick(P.voids);
      const x0 = v.a[0], y0 = v.a[1], z0 = v.a[2], x1 = v.a[3], y1 = v.a[4], z1 = v.a[5];
      const y = r.range(y0 + 20, y1 - 10), alongX = r.chance(0.5);
      const o = alongX ? r.range(z0 + 6, z1 - 6) : r.range(x0 + 6, x1 - 6);
      const t = r.range(dens.girderT[0], dens.girderT[1]), hh = r.range(dens.girderH[0], dens.girderH[1]);
      const a = alongX ? [x0, y, o - t / 2, x1, y + hh, o + t / 2] : [o - t / 2, y, z0, o + t / 2, y + hh, z1];
      if (blocked(a, TUBE + 2, 3) || P.solids.some((b) => b.kind === 'deck' && overlaps(a, b.a, 4))) continue;
      P.solids.push(boxA(a, r.range(0.12, 0.22), Z.BLANK, 'girder', r()));
      P.marks.push({ type: 'girder', a: a, alongX: alongX, beacon: r.chance(0.4) });
      ng++;
    }
    const hangers = P.solids.filter((b) => b.kind === 'deck' || b.kind === 'girder');
    for (let k = 0; k < dens.pods * 10 && np < dens.pods; k++) {
      const h = r.pick(hangers), a = h.a;
      const w = r.range(dens.podS[0], dens.podS[1]), dd = r.range(dens.podS[0], dens.podS[1]), ph = r.range(dens.podS[0] * 0.9, dens.podS[1] * 0.9), drop = r.range(dens.podDrop[0], dens.podDrop[1]);
      const x = r.range(a[0] + w / 2, a[3] - w / 2), z = r.range(a[2] + dd / 2, a[5] - dd / 2);
      if (!(a[3] - a[0] > w && a[5] - a[2] > dd)) continue;
      const pb = [x - w / 2, a[1] - drop - ph, z - dd / 2, x + w / 2, a[1] - drop, z + dd / 2];
      const env = [pb[0], pb[1], pb[2], pb[3], a[1], pb[5]];
      if (pb[1] < 10 || blocked(env, TUBE, 3) || P.solids.some((b) => b !== h && b.kind !== 'inner' && overlaps(env, b.a, 1))) continue;
      P.solids.push(boxA(pb, r.range(0.25, 0.4), r.chance(0.5) ? Z.SERVICE : Z.HOUSING, 'pod', r()));
      P.marks.push({ type: 'pod', a: pb, top: a[1] });
      np++;
    }
    P.stats.girders = ng; P.stats.pods = np;
  }

  function plan(seed, C) {
    const P = { C: C, seed: seed, rng: makeRng(seed), shell: [], solids: [], voids: [], decks: [], portals: [], holes: [], surrounds: [],
      lanes: [], marks: [], stats: {}, lights: [], details: [], keep: [] };
    massing(P);
    P.route = makeCurve(P.ctrl, 2);
    const R = P.route;
    P.sA = R.cross(0, P.A[0] + 1e-6);
    P.sL = R.cross(0, P.Lv[0], P.sA + 10);
    P.sIn = R.cross(1, GEO.lid[1], P.sA);                 /* the roof portal plane */
    P.sOut = R.cross(0, GEO.EW, P.sIn);                   /* the exit portal plane */
    /* clearOf: chunked, each chunk of 16 samples with its bounding box */
    const RS = R.pts, CH = [];
    for (let i = 0; i < RS.length; i += 16) {
      const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity], end = Math.min(RS.length, i + 17);
      for (let j = i; j < end; j++) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], RS[j][k]); hi[k] = Math.max(hi[k], RS[j][k]); }
      CH.push({ i: i, end: end, b: lo.concat(hi) });
    }
    P.clearOf = (a, Rr) => {
      const r0 = Rr == null ? TUBE : Rr;
      for (const c of CH) {
        if (aaDist(c.b, a) >= r0) continue;
        for (let j = c.i; j < c.end; j++) if (ptBoxDist(RS[j], a) < r0) return false;
      }
      return true;
    };
    sizeHoles(P);
    /* lanes: fewer than in an open atrium, there is less air. x-lanes in the
       two upper voids, z-lanes across the hall through the slabs, two lifts */
    lane(P, 'x', [0, 363, 27], 'small'); lane(P, 'x', [0, 229, -27], 'small');
    for (const x of [-135, 81, 135]) lane(P, 'z', [x, 102, 0], 'small');
    liftLanes(P, [[108, -54], [-162, 54], [162, 54], [-108, -54]], 2, 40);
    P.lanes.forEach((l, i) => { l.id = i; });
    P.clearOfLanes = (a, m) => {
      for (const l of P.lanes) if (aaDist(laneBoxL(l), a) < laneRadius(l) + (m == null ? 4 : m)) return false;
      return true;
    };
    /* lane slots through the shell, lift holes through the decks */
    const slots = [];
    for (const l of P.lanes) {
      if (l.axis === 'y') continue;
      const rr = laneRadius(l) + 6, hy = laneRadius(l) + 5;
      const a = l.axis === 'x' ? [-5000, l.p[1] - hy, l.p[2] - rr, 5000, l.p[1] + hy, l.p[2] + rr] : [l.p[0] - rr, l.p[1] - hy, -5000, l.p[0] + rr, l.p[1] + hy, 5000];
      slots.push({ a: a, axis: l.axis === 'x' ? 0 : 2, only: ['shell', 'ext'] });
    }
    P.shell = carve(P.shell, P.holes.concat(slots));
    P.slots = slots;
    for (const d of P.decks) {
      const holes = d.holes.map((h) => h.slice());
      d.lift = [];
      for (const l of P.lanes) if (l.axis === 'y' && l.s1 > d.y && l.p[0] > d.x0 && l.p[0] < d.x1 && l.p[2] > d.z0 && l.p[2] < d.z1) {
        const hh = laneRadius(l) + 9;
        holes.push([l.p[0], l.p[2], hh, hh]); d.lift.push([l.p[0], l.p[2], hh, hh]);
      }
      d.allHoles = holes;
      for (const b of plate(d.x0, d.x1, d.z0, d.z1, d.y, d.y + d.th, holes, d.tone, d.zone, 'deck', P.rng)) P.solids.push(b);
      if (d.soffit) for (const b of plate(d.x0, d.x1, d.z0, d.z1, d.y - 2, d.y, holes, 0.16, Z.DECK, 'deck', P.rng)) P.solids.push(b);
    }
    for (const b of P.shell) P.solids.push(b);
    for (const b of P.surrounds) P.solids.push(b);
    const blocked = (a, tube, lm) => {
      if (!P.clearOf(a, tube)) return true;
      if (!P.clearOfLanes(a, lm)) return true;
      for (const h of P.holes) if (overlaps(a, h.a, 2)) return true;
      for (const k of P.keep) if (overlaps(a, k, 0)) return true;
      return false;
    };
    P.blocked = blocked;
    hallBlocks(P, blocked);
    innerWalls(P, blocked);
    extras(P, blocked);
    platforms(P, blocked);
    girdersAndPods(P, blocked);
    /* the crane on the lid is solid where it stands */
    P.solids.push(box(108, GEO.lid[1], -32, 112, GEO.lid[1] + 78, -28, 0.3, Z.BLANK, 'ext', 0.5));
    /* rings: the middle of V1 and V2, halfway round the pull-out, the hall run */
    const yV1 = (GEO.voids[0][0] + GEO.voids[0][1]) / 2, yV2 = (GEO.voids[1][0] + GEO.voids[1][1]) / 2;
    const xb = C.x0 - C.amp, sP = R.cross(1, C.yB - C.R2 * Math.SQRT1_2, P.sIn);
    P.ringS = [R.cross(1, yV1, P.sIn), R.cross(1, yV2, P.sIn), sP, R.cross(0, xb + C.R2 + 112, sP)];
    gates(P);
    decorate(P);
    return P;
  }

  /* ---- decoration: lights and details, plan frame, not solid ------------------
     lights: { t: 'line', a, b, w, c, g } (a lit bar of width w), { t: 'box',
     lo, hi, c, g } (a lit panel), { t: 'dot', p, s, c, g }, { t: 'halo', p,
     sx, sy, c, g, blink } (an additive soft disc); c is a colour name
     (warm, sod, cyan, red, amber, bone), g a gain.
     details: { k, lo, hi, tone } boxes or { k, a, b, r, tone } rods, one
     instanced draw per kind k. Lines, panels and details that would enter
     the route tube are dropped (stats.decoDropped). */
  function decorate(P) {
    const r = makeRng((P.seed ^ 0x5bd1e995) | 0), C = P.C, Lg = [], Dt = [];
    const top = GEO.lid[1], yR = GEO.top, bb = P.bbox;
    /* rT: the drop radius of what is pushed now (the tube; the needle at the
       hole and gate rims of variant B, which sit closer than the tube) */
    let rT = TUBE;
    const nr = needleOf(C);
    const line = (a, b, w, c, g) => Lg.push({ t: 'line', a: a, b: b, w: w, c: c, g: g, r: rT });
    const panel = (lo, hi, c, g) => Lg.push({ t: 'box', lo: lo, hi: hi, c: c, g: g });
    const dot = (p, s, c, g) => Lg.push({ t: 'dot', p: p, s: s, c: c, g: g, r: rT });
    const halo = (p, sx, sy, c, g, blink) => Lg.push({ t: 'halo', p: p, sx: sx, sy: sy, c: c, g: g, blink: blink || 0 });
    const det = (k, lo, hi, tone) => Dt.push({ k: k, lo: lo, hi: hi, tone: tone });
    const rod = (k, a, b, rr, tone) => Dt.push({ k: k, a: a, b: b, r: rr, tone: tone });
    const rect = (x0, z0, x1, z1, y, w, c, g) => {
      line([x0, y, z0], [x1, y, z0], w, c, g); line([x1, y, z0], [x1, y, z1], w, c, g);
      line([x1, y, z1], [x0, y, z1], w, c, g); line([x0, y, z1], [x0, y, z0], w, c, g);
    };
    /* tier tops: where the third tier stands, the roof is at 500 m */
    const roofAt = (x, z) => ((z > 70 && z < 110 && x > -60 && x < 160) || (z < -70 && z > -110 && x > -150 && x < 70) ? 500 : yR);

    /* ---- the lid: lit edges, the portal apron, the crane, containers ---- */
    rect(-GEO.EW, -GEO.SZ0, GEO.EW, GEO.SZ0, top + 0.4, 0.6, 'sod', 0.9);
    for (const s of [-1, 1]) for (let x = -196; x <= 196; x += 14) dot([x, top + 1, s * 68], 0.8, 'sod', 0.9);
    const lid = P.decks.find((d) => d.lid), h = lid.route, cx = h[0], cz = h[1], hx = h[2], hz = h[3];
    const ax0 = cx - hx - 30, ax1 = cx + hx + 30, az0 = cz - hz - 20, az1 = cz + hz + 20;
    det('apron', [ax0, top, az0], [ax1, top + 0.5, cz - hz], 0.5);
    det('apron', [ax0, top, cz + hz], [ax1, top + 0.5, az1], 0.5);
    det('apron', [ax0, top, cz - hz], [cx - hx, top + 0.5, cz + hz], 0.5);
    det('apron', [cx + hx, top, cz - hz], [ax1, top + 0.5, cz + hz], 0.5);
    for (const q of [[cx - hx - 6, cx + hx + 6, cz - hz - 6, 'x'], [cx - hx - 6, cx + hx + 6, cz + hz + 6, 'x'], [cz - hz - 6, cz + hz + 6, cx - hx - 6, 'z'], [cz - hz - 6, cz + hz + 6, cx + hx + 6, 'z']]) {
      for (let u = q[0]; u < q[1] - 3; u += 6) {
        if (q[3] === 'x') line([u, top + 0.7, q[2]], [u + 3, top + 0.7, q[2]], 1.2, 'amber', 0.9);
        else line([q[2], top + 0.7, u], [q[2], top + 0.7, u + 3], 1.2, 'amber', 0.9);
      }
    }
    for (let x = ax0; x <= ax1; x += 10) for (const z of [az0, az1]) dot([x, top + 1, z], 0.9, 'amber', 0.9);
    for (let z = az0; z <= az1; z += 10) for (const x of [ax0, ax1]) dot([x, top + 1, z], 0.9, 'amber', 0.9);
    halo([cx, top + 4, cz], 2 * hx + 40, 2 * hz + 40, 'amber', 0.08);
    halo([cx, top - 20, cz], 2 * hx, 2 * hz, 'sod', 0.1);
    const kx = 110, kz = -30;
    det('crane', [kx - 1.5, top + 72.5, kz - 20], [kx + 1.5, top + 75.5, kz + 56], 0.32);
    det('crane', [kx - 3, top + 67, kz - 31], [kx + 3, top + 73, kz - 21], 0.2);
    rod('crane', [kx, top + 72, kz + 50], [kx, top + 37, kz + 50], 0.15, 0.1);
    det('container', [kx - 6.1, top + 34, kz + 48.8], [kx + 6.1, top + 36.6, kz + 51.2], 0.4);
    halo([kx, top + 80, kz], 5, 5, 'red', 0.9, 1.6); halo([kx, top + 76, kz + 56], 3, 3, 'red', 0.8, 1.6);
    const liftOn = (x, z, m) => lid.lift.some((q) => Math.abs(x - q[0]) < q[2] + m && Math.abs(z - q[1]) < q[3] + m);
    for (let i = 0; i < 70; i++) {
      const x = 40 + (i % 7) * 13.5, z = -60 + Math.floor(i / 7) % 5 * 3.2 + (i < 35 ? 0 : 92), lv = Math.floor(r() * 3);
      if (z > 60 || liftOn(x, z, 8) || (Math.abs(x - kx) < 10 && Math.abs(z - kz) < 6)) continue;
      for (let l = 0; l <= lv; l++) det('container', [x - 6.1, top + l * 2.7, z - 1.25], [x + 6.1, top + l * 2.7 + 2.6, z + 1.25], 0.18 + 0.3 * r());
    }
    /* ---- slab roofs: plant, an antenna field, beacons ---- */
    for (const s of [-1, 1]) {
      const z0 = s * 70, z1 = s * 134;
      for (let i = 0; i < 14; i++) {
        const x = -190 + r() * 380, z = z0 + (z1 - z0) * (0.15 + 0.7 * r()), w = 8 + r() * 20, d = 6 + r() * 14, y = roofAt(x, z);
        det('roofplant', [x - w / 2, y, z - d / 2], [x + w / 2, y + 3 + r() * 9, z + d / 2], 0.18 + 0.15 * r());
      }
      for (let i = 0; i < 22; i++) {
        const x = -180 + r() * 360, z = z0 + (z1 - z0) * (0.2 + 0.6 * r()), hg = 14 + r() * 40, y = roofAt(x, z);
        rod('antenna', [x, y, z], [x, y + hg, z], 0.25 + r() * 0.5, 0.3);
        if (r() < 0.4) dot([x, y + hg + 0.5, z], 0.8, 'red', 0.9);
      }
    }
    for (const q of [[-206, -136], [206, 136], [0, -136]]) { halo([q[0], yR + 6, q[1]], 16, 16, 'red', 0.9, 2.2); halo([q[0], yR + 6, q[1]], 60, 60, 'red', 0.06); }
    /* ---- the plinth: lit dock doors on the long faces ---- */
    for (const s of [-1, 1]) for (let x = -200; x <= 200; x += 34) {
      if (Math.abs(x) < 20) continue;
      const z = s * 154;
      panel([x - 7, 1, Math.min(z, z + s * 0.6)], [x + 7, 9, Math.max(z, z + s * 0.6)], 'sod', 0.55);
      halo([x, 5, z + s * 4], 20, 10, 'sod', 0.06);
      /* E's elements: the ramp in front of every dock (stepped, the detail
         boxes are axis-aligned), a lit kerb at its foot */
      for (const [l, hgt] of [[34, 0.4], [22, 0.8], [11, 1.2]]) det('apron', [x - 6, 0, Math.min(z, z + s * l)], [x + 6, hgt, Math.max(z, z + s * l)], 0.26);
      line([x - 6, 0.5, z + s * 34.2], [x + 6, 0.5, z + s * 34.2], 0.3, 'sod', 0.45);
    }
    /* E's elements, lit: the terrace parapet's edge at the set-back (one
       more line across the calm long faces), a cyan top line on the four
       intake grilles of the slab ends */
    for (const s of [-1, 1]) line([-GEO.LX, GEO.set + 2.6, s * (GEO.SZ1 + 0.3)], [GEO.LX, GEO.set + 2.6, s * (GEO.SZ1 + 0.3)], 0.5, 'sod', 0.6);
    for (const x of [-1, 1]) for (const s of [-1, 1]) {
      const zg = [s * (GEO.SZ0 + 10), s * (GEO.SZ1 - 10)], xg = x * (GEO.LX + 2.3);
      line([xg, 110.6, zg[0]], [xg, 110.6, zg[1]], 0.6, 'cyan', 0.8);
      line([xg, 34.4, zg[0]], [xg, 34.4, zg[1]], 0.4, 'sod', 0.4);
      halo([xg + x * 3, 72, (zg[0] + zg[1]) / 2], 70, 60, 'cyan', 0.025);
    }
    /* ---- E's articulation: the lid vault, duct runs, tower and pod lights ---- */
    const arch = (x) => { const pts = []; for (let k = 0; k <= 8; k++) { const z = -70 + 140 * k / 8; pts.push([x, top + 28 * (1 - (z / 70) * (z / 70)), z]); } return pts; };
    let prev = null;
    for (let x = 4; x <= 186; x += 14) {
      const a = arch(x);
      for (let k = 0; k < 8; k++) rod('vault', a[k], a[k + 1], 0.9, 0.3);
      if (prev) for (const k of [1, 3, 4, 5, 7]) { rod('vault', prev[k], a[k], 0.45, 0.28); if (k === 3 || k === 5) rod('vault', prev[k - 1], a[k + 1], 0.3, 0.26); }
      for (const k of [2, 6]) dot([a[k][0], a[k][1] - 1.5, a[k][2]], 0.9, 'sod', 0.8);
      prev = a;
    }
    for (const s of [-1, 1]) for (let i = 0; i < 6; i++) {
      const x = -200 + r() * 400, hh = 260 + r() * 190, n = 2 + Math.floor(r() * 3), rad = 1.2 + r() * 1.4;
      for (let j = 0; j < n; j++) { const xx = x + j * rad * 2.6, z = s * (150 + rad + 0.4); rod('duct', [xx, 0, z], [xx, hh, z], rad, 0.3); }
      if (r() < 0.5) rod('duct', [x, 141, s * 154], [x + (r() < 0.5 ? -1 : 1) * (60 + r() * 80), 141, s * 154], 1.6, 0.3);
    }
    for (const m of P.marks) {
      const a = m.a;
      if (m.type === 'stower') {
        const z = m.s > 0 ? a[5] + 0.3 : a[2] - 0.3, x = (a[0] + a[3]) / 2;
        line([x, 6, z], [x, a[4] - 4, z], 0.5, 'sod', 0.45);
        for (let y = 30; y < a[4]; y += 36) dot([x, y, z], 1, 'sod', 0.8);
        halo([x, a[4] + 2, (a[2] + a[5]) / 2], 6, 6, 'red', 0.9, 2);
      } else if (m.type === 'stair') {
        const z = m.s > 0 ? a[5] + 0.3 : a[2] - 0.3;
        for (let y = 12; y < a[4]; y += 14) line([a[0] + 1, y, z], [a[3] - 1, y + 6, z], 0.2, 'sod', 0.5);
      } else if (m.type === 'cpod') {
        const z = m.s > 0 ? a[5] : a[2];
        line([a[0], a[1] - 0.3, z], [a[3], a[1] - 0.3, z], 0.35, r() < 0.3 ? 'cyan' : 'sod', 0.7);
        halo([(a[0] + a[3]) / 2, a[1] - 2, z], (a[3] - a[0]) * 1.2, 10, 'sod', 0.2);
      } else if (m.type === 'xbridge') {
        for (const y of [a[1] - 0.4, a[4] + 0.4]) for (const x of [a[0], a[3]]) line([x, y, a[2] + 1], [x, y, a[5] - 1], 0.35, 'sod', 0.6);
      } else if (m.type === 'loggia') {
        const z = m.s > 0 ? a[2] + 1 : a[5] - 1;
        panel([a[0] + 1, a[1] + 1, Math.min(z, z + 0.2 * m.s)], [a[3] - 1, a[4] - 1, Math.max(z, z + 0.2 * m.s)], 'sod', 0.18);
        for (let x = a[0] + 4; x < a[3] - 2; x += 7) dot([x, a[4] - 1.2, z + m.s * 2], 0.7, 'sod', 0.8);
      } else if (m.type === 'bay') {
        const z = m.s > 0 ? a[5] + 0.3 : a[2] - 0.3;
        for (const y of [a[1], a[4]]) line([a[0], y, z], [a[3], y, z], 0.4, 'sod', 0.6);
      }
    }
    for (const q of P.crowns) {
      rod('antenna', q, [q[0], q[1] + 40, q[2]], 0.5, 0.3);
      halo([q[0], q[1] + 41, q[2]], 12, 12, 'red', 0.9, 2.6);
      det('roofplant', [q[0] + 3, q[1], q[2] - 13], [q[0] + 17, q[1] + 5, q[2] - 3], 0.2);
    }

    /* ---- the surroundings: ring road, boulevards, the plaza, campus lights ---- */
    if (C.surround) {
    const RX = GEO.LX + C.plaza, RZ = GEO.SZ1 + C.plaza;          /* the reserved box */
    const R0 = 30, R1 = 55, mid = (R0 + R1) / 2;
    for (const q of [[bb[0] - R1, bb[2] - R1, bb[3] + R1, bb[2] - R0], [bb[0] - R1, bb[5] + R0, bb[3] + R1, bb[5] + R1],
      [bb[0] - R1, bb[2] - R0, bb[0] - R0, bb[5] + R0], [bb[3] + R0, bb[2] - R0, bb[3] + R1, bb[5] + R0]]) det('ground', [q[0], 0, q[1]], [q[2], 0.3, q[3]], 0.08);
    for (const off of [-6, 6]) {
      const x0 = bb[0] - mid + off, x1 = bb[3] + mid - off, z0 = bb[2] - mid + off, z1 = bb[5] + mid - off;
      const c4 = [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
      for (let k = 0; k < 4; k++) {
        const a = c4[k], b = c4[(k + 1) % 4], Ln = Math.hypot(b[0] - a[0], b[1] - a[1]);
        for (let u = 0; u < Ln; u += 18) {
          const f0 = u / Ln, f1 = Math.min(1, (u + 6) / Ln);
          line([a[0] + (b[0] - a[0]) * f0, 0.5, a[1] + (b[1] - a[1]) * f0], [a[0] + (b[0] - a[0]) * f1, 0.5, a[1] + (b[1] - a[1]) * f1], 0.3, off > 0 ? 'bone' : 'red', 0.4);
        }
      }
    }
    const blv = [[bb[3] + 230, -22, RX - 4, 22], [-22, bb[5] + 120, 22, RZ - 4]];
    for (const q of blv) {
      const x0 = q[0], z0 = q[1], x1 = q[2], z1 = q[3];
      if (x1 - x0 < 10 || z1 - z0 < 10) continue;
      det('ground', [x0, 0, z0], [x1, 0.3, z1], 0.08);
      const alongX = x1 - x0 > z1 - z0;
      for (const o of [-14, -5, 5, 14]) line(alongX ? [x0, 0.5, o] : [o, 0.5, z0], alongX ? [x1, 0.5, o] : [o, 0.5, z1], 0.35, Math.abs(o) > 10 ? 'sod' : 'bone', 0.4);
      for (let u = 0; ; u += 40) {
        const px = alongX ? x0 + u : 0, pz = alongX ? 0 : z0 + u;
        if ((alongX ? px : pz) > (alongX ? x1 : z1)) break;
        for (const s of [-1, 1]) {
          const qx = alongX ? px : s * 26, qz = alongX ? s * 26 : pz;
          rod('mast', [qx, 0, qz], [qx, 12, qz], 0.2, 0.3);
          dot([qx, 12.4, qz], 0.8, 'sod', 0.9);
        }
      }
    }
    const px0 = bb[3] + 30, px1 = Math.min(bb[3] + 230, RX - 10), pzz = 180;
    det('ground', [px0, 0, -pzz], [px1, 0.4, pzz], 0.3);
    for (let x = px0 + 10; x <= px1; x += 38) for (const s of [-1, 1]) {
      const z = s * (pzz - 12);
      rod('mast', [x, 0, z], [x, 30, z], 0.5, 0.3);
      dot([x, 30.5, z], 1.4, 'sod', 0.9);
      halo([x, 4, z], 50, 50, 'sod', 0.03);
    }
    for (const q of [[px0 + 50, -110], [px0 + 50, 110], [px0 + 140, -110], [px0 + 140, 110]]) {
      const s = 14;
      det('ground', [q[0] - s - 3, 0, q[1] - s - 3], [q[0] + s + 3, 0.8, q[1] + s + 3], 0.24);
      rect(q[0] - s, q[1] - s, q[0] + s, q[1] + s, 1, 0.5, 'cyan', 0.8);
      halo([q[0], 2, q[1]], 40, 40, 'cyan', 0.04);
    }
    for (const s of [-1, 1]) for (let x = px0 + 20; x < px1 - 10; x += 9) {
      const z = s * 58, kh = 4 + 2 * r();
      det('kiosk', [x - 3.5, 0, z - 2.5], [x + 3.5, kh, z + 2.5], 0.3 + 0.1 * r());
      dot([x, 3, z - s * 3], 0.6, r() < 0.15 ? 'cyan' : 'sod', 0.7);
    }
    for (const b of P.campus || []) {
      const a = b.a;
      if (b.ck === 'parking' || b.ck === 'hall') {
        for (let k = 0; k < 14; k++) {
          const x = a[0] + 4 + k * ((a[3] - a[0] - 8) / 13), z = a[5] + 8;
          det('car', [x - 1.1, 0.3, z - 2.5], [x + 1.1, 1.8, z + 2.5], 0.25 + 0.5 * r());
        }
      }
      for (let k = 0; k < 3; k++) {
        const x = a[0] + (a[3] - a[0]) * (0.2 + 0.6 * r()), z = a[2] + (a[5] - a[2]) * (0.2 + 0.6 * r()), w = 6 + r() * 10, d = 5 + r() * 8;
        det('roofplant', [x - w / 2, a[4], z - d / 2], [x + w / 2, a[4] + 2 + r() * 4, z + d / 2], 0.2);
      }
      line([a[0], a[4] + 0.3, a[2]], [a[3], a[4] + 0.3, a[2]], 0.3, 'sod', 0.5);
      if (b.ck === 'station') {
        line([a[0], a[4] - 4, a[5] + 0.5], [a[3], a[4] - 4, a[5] + 0.5], 0.6, 'cyan', 0.8);
        halo([(a[0] + a[3]) / 2, 12, a[5] + 8], a[3] - a[0], 20, 'sod', 0.04);
      }
    }
    for (const m of P.marks) {
      if (m.type === 'conveyor') {
        const a = m.a, y = (a[1] + a[4]) / 2, alongZ = a[5] - a[2] > a[3] - a[0];
        const A0 = alongZ ? [(a[0] + a[3]) / 2, y, a[2]] : [a[0], y, (a[2] + a[5]) / 2], B0 = alongZ ? [(a[0] + a[3]) / 2, y, a[5]] : [a[3], y, (a[2] + a[5]) / 2];
        rod('conveyor', A0, B0, 2.2, 0.35);
        const Ln = len(sub(B0, A0));
        for (let u = 4; u < Ln; u += 10) { const f = u / Ln; dot([A0[0] + (B0[0] - A0[0]) * f, y + 2.4, A0[2] + (B0[2] - A0[2]) * f], 0.6, 'sod', 0.6); }
      } else if (m.type === 'cbridge') {
        const a = m.a;
        for (const y of [a[1] - 0.3, a[4] + 0.3]) line([(a[0] + a[3]) / 2, y, a[2]], [(a[0] + a[3]) / 2, y, a[5]], 0.3, 'sod', 0.6);
      }
    }

    }
    /* ---- inside: the route holes as lit shafts, lift holes, soffit lamps ---- */
    for (const d of P.decks) {
      rT = nr != null && !d.lid ? nr : TUBE;
      const q = d.route, yT = d.y + d.th, yBt = d.y - (d.soffit ? 2 : 0);
      const x0 = q[0] - q[2], x1 = q[0] + q[2], z0 = q[1] - q[3], z1 = q[1] + q[3];
      /* gold rims at both ends of the shaft, the lid's (the roof portal) heavier */
      rect(x0 - 0.6, z0 - 0.6, x1 + 0.6, z1 + 0.6, yT + 0.5, d.lid ? 1.6 : 1.1, 'warm', 1);
      rect(x0 - 0.6, z0 - 0.6, x1 + 0.6, z1 + 0.6, yBt - 0.5, 1.1, 'warm', 1);
      /* the reveal: light bands round the shaft every 12 m */
      for (let y = yBt + 6; y < yT - 4; y += 12) rect(x0 + 0.2, z0 + 0.2, x1 - 0.2, z1 - 0.2, y, 0.3, 'sod', 0.3);
      halo([q[0], yBt - 8, q[1]], 2 * q[2], 2 * q[3], 'warm', 0.07);
      halo([q[0], yT + 6, q[1]], 2 * q[2], 2 * q[3], 'warm', 0.05);
      for (const l of d.lift) rect(l[0] - l[2], l[1] - l[3], l[0] + l[2], l[1] + l[3], yT + 0.3, 0.4, 'cyan', 0.5);
      /* lamp lines under the soffit, cut round the holes */
      for (const z of [-56, -28, 28, 56, 0]) {
        let xs = [[d.x0 + 4, d.x1 - 4]];
        for (const hq of d.allHoles) {
          if (Math.abs(z - hq[1]) > hq[3] + 1) continue;
          const nx = [];
          for (const s of xs) {
            if (hq[0] + hq[2] + 2 <= s[0] || hq[0] - hq[2] - 2 >= s[1]) { nx.push(s); continue; }
            if (hq[0] - hq[2] - 2 > s[0]) nx.push([s[0], hq[0] - hq[2] - 2]);
            if (hq[0] + hq[2] + 2 < s[1]) nx.push([hq[0] + hq[2] + 2, s[1]]);
          }
          xs = nx;
        }
        for (const s of xs) if (s[1] - s[0] > 4) line([s[0], yBt - 0.15, z], [s[1], yBt - 0.15, z], 0.5, 'sod', 0.7);
      }
    }
    /* the gates: a thin gold rim round the opening on both faces, sodium
       dots under the long bars */
    for (const gt of P.gates || []) {
      rT = nr;
      const ax = gt.ax, sp = gt.sp, cr = gt.cr, o = gt.c;
      const at = (dn, ds, dc) => { const v = [0, 0, 0]; v[ax] = o[ax] + dn; v[sp] = o[sp] + ds; v[cr] = o[cr] + dc; return v; };
      for (const dn of [-gt.depth / 2 - 0.05, gt.depth / 2 + 0.05]) {
        const hs = gt.hs - 0.3, hc = gt.hc - 0.3;
        line(at(dn, -hs, -hc), at(dn, hs, -hc), 0.5, 'warm', 1); line(at(dn, hs, -hc), at(dn, hs, hc), 0.5, 'warm', 1);
        line(at(dn, hs, hc), at(dn, -hs, hc), 0.5, 'warm', 1); line(at(dn, -hs, hc), at(dn, -hs, -hc), 0.5, 'warm', 1);
      }
      for (const b of gt.bars) {
        if (b[sp + 3] - b[sp] < 40) continue;
        for (let u = b[sp] + 6; u < b[sp + 3] - 3; u += 12) {
          const v = [0, 0, 0]; v[sp] = u; v[ax] = o[ax]; v[cr] = (b[cr] + b[cr + 3]) / 2;
          if (ax === 1) v[1] = b[1] - 0.4; else v[cr] = b[cr] - 0.4;
          dot(v, 0.45, 'sod', 0.7);
        }
      }
    }
    rT = TUBE;
    for (const m of P.marks) {
      const a = m.a;
      if (m.type === 'lamp') dot(m.p, 0.6, 'sod', 0.8);
      else if (m.type === 'hallblock') {
        const z = m.s < 0 ? a[5] + 0.1 : a[2] - 0.1;
        line([a[0] + 2, a[1] + 1.5, z], [a[3] - 2, a[1] + 1.5, z], 0.5, r() < 0.3 ? 'cyan' : 'sod', 0.8);
        line([a[0] + 1, a[4] + 0.2, z], [a[3] - 1, a[4] + 0.2, z], 0.3, 'sod', 0.5);
      }
      else if (m.type === 'plat') {
        const c = m.holo ? 'cyan' : 'sod';
        if (m.side === 0) line([a[3], a[4] + 0.1, a[2]], [a[3], a[4] + 0.1, a[5]], 0.4, c, 0.8);
        else if (m.side === 1) line([a[0], a[4] + 0.1, a[2]], [a[0], a[4] + 0.1, a[5]], 0.4, c, 0.8);
        else if (m.side === 2) line([a[0], a[4] + 0.1, a[5]], [a[3], a[4] + 0.1, a[5]], 0.4, c, 0.8);
        else line([a[0], a[4] + 0.1, a[2]], [a[3], a[4] + 0.1, a[2]], 0.4, c, 0.8);
        halo([(a[0] + a[3]) / 2, a[4] + 4, (a[2] + a[5]) / 2], (a[3] - a[0]) * 1.2, 16, c === 'cyan' ? 'cyan' : 'sod', 0.06);
      } else if (m.type === 'girder' && m.beacon) {
        const y = a[1] - 0.5;
        if (m.alongX) { dot([a[0] + 2, y, (a[2] + a[5]) / 2], 0.7, 'red', 0.9); dot([a[3] - 2, y, (a[2] + a[5]) / 2], 0.7, 'red', 0.9); }
        else { dot([(a[0] + a[3]) / 2, y, a[2] + 2], 0.7, 'red', 0.9); dot([(a[0] + a[3]) / 2, y, a[5] - 2], 0.7, 'red', 0.9); }
      } else if (m.type === 'pod') {
        line([a[0] + 1, a[1] - 0.2, (a[2] + a[5]) / 2], [a[3] - 1, a[1] - 0.2, (a[2] + a[5]) / 2], 0.4, 'sod', 0.7);
        rod('cable', [(a[0] + a[3]) / 2, a[4], (a[2] + a[5]) / 2], [(a[0] + a[3]) / 2, m.top, (a[2] + a[5]) / 2], 0.2, 0.15);
      } else if (m.type === 'gallery' && r() < 0.34) {
        const z = m.s < 0 ? a[5] + 0.05 : a[2] - 0.05;
        line([a[0] + 1, a[4] + 0.05, z], [a[3] - 1, a[4] + 0.05, z], 0.25, 'sod', 0.35);
      }
    }
    /* ---- the portals: rims, sill lights, the glow behind them ---- */
    {
      const ep = P.exitPortal, c = ep.c, hw = ep.w / 2, hh = ep.h / 2;
      for (const x of [GEO.EW + 0.5, GEO.AX - 0.5]) {
        line([x, c[1] - hh, c[2] - hw], [x, c[1] - hh, c[2] + hw], 1.1, 'warm', 1);
        line([x, c[1] + hh, c[2] - hw], [x, c[1] + hh, c[2] + hw], 1.1, 'warm', 1);
        line([x, c[1] - hh, c[2] - hw], [x, c[1] + hh, c[2] - hw], 1.1, 'warm', 1);
        line([x, c[1] - hh, c[2] + hw], [x, c[1] + hh, c[2] + hw], 1.1, 'warm', 1);
      }
      for (let x = GEO.AX + 2; x < GEO.EW; x += 3) for (const z of [-0.8, -0.3, 0.3, 0.8]) dot([x, c[1] - hh + 0.3, c[2] + z * hw], 0.5, 'warm', 1);
      halo([GEO.EW + 6, c[1], c[2]], ep.w * 1.6, ep.h * 1.6, 'warm', 0.05);
      halo([GEO.AX - 30, c[1], c[2]], ep.w * 2, ep.h * 2, 'sod', 0.04);
    }
    /* drop what would enter the tube */
    let dropped = 0;
    const lineBox = (q) => {
      if (q.t === 'line') { const e = q.w / 2; return [Math.min(q.a[0], q.b[0]) - e, Math.min(q.a[1], q.b[1]) - e, Math.min(q.a[2], q.b[2]) - e, Math.max(q.a[0], q.b[0]) + e, Math.max(q.a[1], q.b[1]) + e, Math.max(q.a[2], q.b[2]) + e]; }
      if (q.t === 'box') return q.lo.concat(q.hi);
      if (q.t === 'dot') return [q.p[0] - q.s, q.p[1] - q.s, q.p[2] - q.s, q.p[0] + q.s, q.p[1] + q.s, q.p[2] + q.s];
      return null;
    };
    for (const q of Lg) {
      const a = lineBox(q), rq = q.r == null ? TUBE : q.r;
      delete q.r;
      if (a && !P.clearOf(a, rq)) { dropped++; continue; }
      P.lights.push(q);
    }
    for (const q of Dt) {
      const a = q.lo ? q.lo.concat(q.hi) : [Math.min(q.a[0], q.b[0]) - q.r, Math.min(q.a[1], q.b[1]) - q.r, Math.min(q.a[2], q.b[2]) - q.r, Math.max(q.a[0], q.b[0]) + q.r, Math.max(q.a[1], q.b[1]) + q.r, Math.max(q.a[2], q.b[2]) + q.r];
      if (!P.clearOf(a, TUBE)) { dropped++; continue; }
      P.details.push(q);
    }
    P.stats.decoDropped = dropped;
  }

  /* ---- placement ------------------------------------------------------------ */
  function toWorld(L, p) {
    const c = L.cy, s = L.sy, o = L.origin;
    return [o[0] + c * p[0] + s * p[2], o[1] + p[1], o[2] - s * p[0] + c * p[2]];
  }
  function dirWorld(L, d) { return [L.cy * d[0] + L.sy * d[2] + 0, d[1] + 0, -L.sy * d[0] + L.cy * d[2] + 0]; }
  function toLocal(L, w) {
    const c = L.cy, s = L.sy, o = L.origin, dx = w[0] - o[0], dz = w[2] - o[2];
    return [c * dx - s * dz, w[1] - o[1], s * dx + c * dz];
  }
  function dirLocal(L, d) { return [L.cy * d[0] - L.sy * d[2], d[1], L.sy * d[0] + L.cy * d[2]]; }
  /* the yaw that sends plan +x (the travel direction at the approach and
     the exit) along the horizontal world axis dir */
  function yawFor(dir) {
    const c = Math.round(dir[0]), s = Math.round(-dir[2]);
    if (Math.abs(c) + Math.abs(s) !== 1) throw new Error('HikyakuBlock.yawFor: dir must be a horizontal world axis');
    return Math.atan2(s, c);
  }
  function worldAabb(L, a) {
    const p = toWorld(L, [a[0], a[1], a[2]]), q = toWorld(L, [a[3], a[4], a[5]]);
    return [Math.min(p[0], q[0]), p[1], Math.min(p[2], q[2]), Math.max(p[0], q[0]), q[1], Math.max(p[2], q[2])];
  }

  /* facade program per zone (hikyaku-city.js: 0 curtain, 1 residential,
     2 industrial, 3 landmark, 4 plain) */
  function progOf(b) {
    if (b.zone === Z.HOUSING) return 1;
    if (b.zone === Z.SERVICE) return 2;
    if (b.zone === Z.LOBBY) return 0;
    if (b.zone === Z.DECK) return 4;
    return b.kind === 'shell' ? 2 : 4;
  }

  /* ---- the contact grid ------------------------------------------------------
     A uniform 3-D grid over the world boxes (cell metres), CSR lists of box
     indices per cell, flat box coordinates. */
  function makeGrid(boxes, cell) {
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (const b of boxes) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], b.min[k]); hi[k] = Math.max(hi[k], b.max[k]); }
    const n = [0, 1, 2].map((k) => Math.max(1, Math.ceil((hi[k] - lo[k]) / cell)));
    const N = n[0] * n[1] * n[2], cnt = new Int32Array(N + 1);
    const B = new Float64Array(boxes.length * 6);
    const range = (b) => [0, 1, 2].map((k) => [Math.max(0, Math.min(n[k] - 1, Math.floor((b.min[k] - lo[k]) / cell))), Math.max(0, Math.min(n[k] - 1, Math.floor((b.max[k] - lo[k]) / cell)))]);
    boxes.forEach((b, i) => {
      B.set([b.min[0], b.min[1], b.min[2], b.max[0], b.max[1], b.max[2]], i * 6);
      const r = range(b);
      for (let z = r[2][0]; z <= r[2][1]; z++) for (let y = r[1][0]; y <= r[1][1]; y++) for (let x = r[0][0]; x <= r[0][1]; x++) cnt[(z * n[1] + y) * n[0] + x + 1]++;
    });
    for (let i = 0; i < N; i++) cnt[i + 1] += cnt[i];
    const items = new Int32Array(cnt[N]), fill = cnt.slice(0, N);
    boxes.forEach((b, i) => {
      const r = range(b);
      for (let z = r[2][0]; z <= r[2][1]; z++) for (let y = r[1][0]; y <= r[1][1]; y++) for (let x = r[0][0]; x <= r[0][1]; x++) items[fill[(z * n[1] + y) * n[0] + x]++] = i;
    });
    return { cell: cell, inv: 1 / cell, x0: lo[0], y0: lo[1], z0: lo[2], nx: n[0], ny: n[1], nz: n[2], start: cnt, items: items, B: B,
      stamp: new Uint32Array(boxes.length), tick: 0, cand: new Int32Array(Math.max(16, boxes.length)), lo: lo, hi: hi };
  }
  /* boxes whose cells touch the cube centre +- r, deduplicated, into g.cand;
     with test, only those within r of the centre. Returns the count. */
  function gather(g, x, y, z, r, test) {
    const iv = g.inv;
    const i0 = Math.max(0, Math.floor((x - r - g.x0) * iv)), i1 = Math.min(g.nx - 1, Math.floor((x + r - g.x0) * iv));
    const j0 = Math.max(0, Math.floor((y - r - g.y0) * iv)), j1 = Math.min(g.ny - 1, Math.floor((y + r - g.y0) * iv));
    const k0 = Math.max(0, Math.floor((z - r - g.z0) * iv)), k1 = Math.min(g.nz - 1, Math.floor((z + r - g.z0) * iv));
    if (i0 > i1 || j0 > j1 || k0 > k1) return 0;
    let tick = ++g.tick;
    if (tick > 0xfffffff0) { g.stamp.fill(0); tick = g.tick = 1; }
    const st = g.stamp, B = g.B, S = g.start, It = g.items, out = g.cand, r2 = r * r;
    let n = 0;
    for (let k = k0; k <= k1; k++) for (let j = j0; j <= j1; j++) {
      const row = (k * g.ny + j) * g.nx;
      for (let i = i0; i <= i1; i++) {
        const c = row + i;
        for (let m = S[c], e = S[c + 1]; m < e; m++) {
          const id = It[m];
          if (st[id] === tick) continue;
          st[id] = tick;
          if (test) {
            const o = id * 6;
            const dx = B[o] - x > 0 ? B[o] - x : x - B[o + 3] > 0 ? x - B[o + 3] : 0;
            const dy = B[o + 1] - y > 0 ? B[o + 1] - y : y - B[o + 4] > 0 ? y - B[o + 4] : 0;
            const dz = B[o + 2] - z > 0 ? B[o + 2] - z : z - B[o + 5] > 0 ? z - B[o + 5] : 0;
            if (dx * dx + dy * dy + dz * dz > r2) continue;
          }
          out[n++] = id;
        }
      }
    }
    return n;
  }
  /* which faces of each box are exposed somewhere: 5 x 5 samples 5 cm in
     front of the face, a face is closed when every sample is inside another
     box. Bit order +x, -x, +y, -y, +z, -z. The floor face of a box on the
     ground is always closed (pushing down is never the way out). */
  function faceMasks(boxes, g) {
    const B = g.B, p = [0, 0, 0];
    const inOther = (self) => {
      const iv = g.inv;
      const i = Math.floor((p[0] - g.x0) * iv), j = Math.floor((p[1] - g.y0) * iv), k = Math.floor((p[2] - g.z0) * iv);
      if (i < 0 || j < 0 || k < 0 || i >= g.nx || j >= g.ny || k >= g.nz) return false;
      const c = (k * g.ny + j) * g.nx + i, e = 1e-6;
      for (let m = g.start[c]; m < g.start[c + 1]; m++) {
        const id = g.items[m];
        if (id === self) continue;
        const o = id * 6;
        if (p[0] >= B[o] - e && p[0] <= B[o + 3] + e && p[1] >= B[o + 1] - e && p[1] <= B[o + 4] + e && p[2] >= B[o + 2] - e && p[2] <= B[o + 5] + e) return true;
      }
      return false;
    };
    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i];
      let open = 0;
      for (let f = 0; f < 6; f++) {
        const ax = f >> 1, sg = f & 1 ? -1 : 1;
        if (ax === 1 && sg < 0 && b.min[1] < 0.05) continue;
        const a1 = (ax + 1) % 3, a2 = (ax + 2) % 3;
        p[ax] = sg > 0 ? b.max[ax] + 0.05 : b.min[ax] - 0.05;
        let covered = true;
        for (let u = 0; u < 5 && covered; u++) for (let v = 0; v < 5 && covered; v++) {
          p[a1] = b.min[a1] + (b.max[a1] - b.min[a1]) * (u + 0.5) / 5;
          p[a2] = b.min[a2] + (b.max[a2] - b.min[a2]) * (v + 0.5) / 5;
          if (!inOther(i)) covered = false;
        }
        if (!covered) open |= 1 << f;
      }
      b.open = open;
    }
  }

  /* ---- the layout --------------------------------------------------------------
     makeBlock(seed, opts): opts.origin [x, 0, z] or { x, z } (centre of the
     base), opts.yaw (multiple of 90 degrees, see yawFor), opts.idxBase (box
     idx offset, so contact keys never meet the city's), any DEF key. The
     plan depends on the seed only; the placement moves it. */
  function makeBlock(seed, opts) {
    opts = opts || {};
    const C = Object.assign({}, DEF, opts);
    if (C.surround == null) C.surround = C.campus;
    const yaw = opts.yaw || 0, qy = yaw / (Math.PI / 2);
    if (Math.abs(qy - Math.round(qy)) > 1e-6) throw new Error('HikyakuBlock: yaw must be a multiple of 90 degrees');
    const o = opts.origin;
    const origin = Array.isArray(o) ? [o[0], o[1] || 0, o[2]] : o ? [o.x || 0, o.y || 0, o.z || 0] : [0, 0, 0];
    const L = { seed: seed >>> 0, cfg: C, yaw: yaw, origin: origin, cy: Math.round(Math.cos(yaw)), sy: Math.round(Math.sin(yaw)) };
    const P = plan(L.seed, C);
    L.plan = P;
    L.geo = GEO;
    const idxBase = opts.idxBase || 0;
    L.boxes = P.solids.map((b, i) => {
      const w = worldAabb(L, b.a);
      return { min: [w[0], w[1], w[2]], max: [w[3], w[4], w[5]], c: [(w[0] + w[3]) / 2, (w[1] + w[4]) / 2, (w[2] + w[5]) / 2],
        half: [(w[3] - w[0]) / 2, (w[4] - w[1]) / 2, (w[5] - w[2]) / 2], idx: idxBase + i,
        kind: b.kind, tone: b.tone, zone: b.zone, seed: b.sd, prog: progOf(b), open: 0 };
    });
    const g = makeGrid(L.boxes, C.cell);
    faceMasks(L.boxes, g);
    g.open = new Uint8Array(L.boxes.map((b) => b.open));
    g.keys = L.boxes.map((b) => 'blk' + b.idx);
    g.kinds = L.boxes.map((b) => b.kind);
    L._grid = g;
    L._bounds = { min: g.lo.slice(), max: g.hi.slice() };
    /* the building alone: every box but the campus */
    const own = L.boxes.filter((b) => b.kind !== 'campus' && b.kind !== 'campusbridge');
    L.envelope = { min: [0, 2].reduce((m, k) => (m[k] = Math.min.apply(null, own.map((b) => b.min[k])), m), [0, 0, 0]),
      max: [0, 1, 2].reduce((m, k) => (m[k] = Math.max.apply(null, own.map((b) => b.max[k])), m), [0, 0, 0]) };
    const RX = GEO.LX + C.plaza, RZ = GEO.SZ1 + C.plaza, rs = worldAabb(L, [-RX, 0, -RZ, RX, 4000, RZ]);
    L.reserved = { min: [rs[0], 0, rs[2]], max: [rs[3], 4000, rs[5]] };
    L.entryDir = dirWorld(L, [1, 0, 0]);
    L.exitDir = dirWorld(L, [1, 0, 0]);
    L.lights = P.lights; L.details = P.details;
    L.decks = P.decks.map((d) => ({ name: d.name, y0: d.y - (d.soffit ? 2 : 0), y1: d.y + d.th, hole: d.route.slice(), lift: d.lift.map((q) => q.slice()) }));
    /* variant B's gates, plan frame: c the opening's centre on the ring's
       plane, ax the plane's normal axis, hs and hc the half opening along sp
       (z: the bridges' axis) and cr, bars the solid boxes */
    L.gates = (P.gates || []).map((g) => ({ name: g.name, ax: g.ax, sp: g.sp, cr: g.cr, c: g.c.slice(), hs: g.hs, hc: g.hc, depth: g.depth, bars: g.bars.map((a) => a.slice()) }));
    L.stats = Object.assign({ boxes: L.boxes.length, lights: P.lights.length, details: P.details.length }, P.stats);
    L._lanes = worldLanes(L);
    return L;
  }

  /* share of the interior zone (atrium plus lid, 372 x 440 x 140 m) that is
     solid, by sampling a grid of points (step metres) against the boxes */
  function solidShare(L, step) {
    step = step || 6;
    const z = L.plan.zoneBox, g = L._grid, B = g.B;
    let n = 0, s = 0;
    for (let x = z[0] + step / 2; x < z[3]; x += step) for (let y = z[1] + step / 2; y < z[4]; y += step) for (let zz = z[2] + step / 2; zz < z[5]; zz += step) {
      const p = toWorld(L, [x, y, zz]);
      n++;
      const m = gather(g, p[0], p[1], p[2], 0, false);
      for (let k = 0; k < m; k++) {
        const o = g.cand[k] * 6;
        if (p[0] > B[o] && p[0] < B[o + 3] && p[1] > B[o + 1] && p[1] < B[o + 4] && p[2] > B[o + 2] && p[2] < B[o + 5]) { s++; break; }
      }
    }
    return s / n;
  }

  /* ---- contacts -----------------------------------------------------------------
     contacts(layout, pts, st): hull points against the boxes, in the record
     SixDOF.resolve takes: { n, r, pen, key, vs: null, part }. With st
     ({ p, q }) the points are body points (r = q pts[i]), as hkcore
     contactsBoxes takes them; without st they are world points and r is
     taken from their centroid. A point inside a box leaves through the
     least deep of the box's exposed faces (a face covered by a neighbour is
     no way out). key 'blk' + idx, part the box kind. The candidate boxes are
     gathered once per hull from its bounding sphere, so a hull in the open
     costs one grid lookup. The ground (y = 0) is not in here. */
  const _rh = { pts: null, n: 0, r: 0 };
  function contacts(L, pts, st) {
    const out = [], g = L._grid, n = pts.length;
    let cx = 0, cy = 0, cz = 0, rh = 0;
    if (st) {
      cx = st.p[0]; cy = st.p[1]; cz = st.p[2];
      if (pts === _rh.pts && n === _rh.n) rh = _rh.r;
      else { for (let i = 0; i < n; i++) rh = Math.max(rh, Math.hypot(pts[i][0], pts[i][1], pts[i][2])); _rh.pts = pts; _rh.n = n; _rh.r = rh; }
    } else {
      for (let i = 0; i < n; i++) { cx += pts[i][0]; cy += pts[i][1]; cz += pts[i][2]; }
      cx /= n; cy /= n; cz /= n;
      for (let i = 0; i < n; i++) rh = Math.max(rh, Math.hypot(pts[i][0] - cx, pts[i][1] - cy, pts[i][2] - cz));
    }
    const lo = g.lo, hi = g.hi;
    if (cx < lo[0] - rh || cx > hi[0] + rh || cy < lo[1] - rh || cy > hi[1] + rh || cz < lo[2] - rh || cz > hi[2] + rh) return out;
    const nc = gather(g, cx, cy, cz, rh + 1e-6, true);
    if (!nc) return out;
    const B = g.B, cand = g.cand, open = g.open;
    const q = st ? st.q : null;
    const q0 = q ? q[0] : 0, q1 = q ? q[1] : 0, q2 = q ? q[2] : 0, q3 = q ? q[3] : 0;
    for (let i = 0; i < n; i++) {
      const v = pts[i];
      let rx, ry, rz;
      if (q) {
        const tx = 2 * (q2 * v[2] - q3 * v[1]), ty = 2 * (q3 * v[0] - q1 * v[2]), tz = 2 * (q1 * v[1] - q2 * v[0]);
        rx = v[0] + q0 * tx + q2 * tz - q3 * ty; ry = v[1] + q0 * ty + q3 * tx - q1 * tz; rz = v[2] + q0 * tz + q1 * ty - q2 * tx;
      } else { rx = v[0] - cx; ry = v[1] - cy; rz = v[2] - cz; }
      const px = cx + rx, py = cy + ry, pz = cz + rz;
      for (let k = 0; k < nc; k++) {
        const id = cand[k], o = id * 6;
        if (!(px > B[o] && px < B[o + 3] && py > B[o + 1] && py < B[o + 4] && pz > B[o + 2] && pz < B[o + 5])) continue;
        let m = open[id];
        if (!m) m = B[o + 1] < 0.05 ? 0x37 : 0x3f;
        let best = Infinity, f = -1, d;
        if (m & 1 && (d = B[o + 3] - px) < best) { best = d; f = 0; }
        if (m & 2 && (d = px - B[o]) < best) { best = d; f = 1; }
        if (m & 4 && (d = B[o + 4] - py) < best) { best = d; f = 2; }
        if (m & 8 && (d = py - B[o + 1]) < best) { best = d; f = 3; }
        if (m & 16 && (d = B[o + 5] - pz) < best) { best = d; f = 4; }
        if (m & 32 && (d = pz - B[o + 2]) < best) { best = d; f = 5; }
        if (f < 0) continue;
        const nn = [0, 0, 0];
        nn[f >> 1] = f & 1 ? -1 : 1;
        out.push({ n: nn, r: [rx, ry, rz], pen: best, key: g.keys[id], vs: null, part: g.kinds[id] });
      }
    }
    return out;
  }

  /* Boxes within r of world point p, in the shape contactsBoxes takes. */
  function boxesNear(L, p, r) {
    const out = [], g = L._grid;
    const m = gather(g, p[0], p[1], p[2], r, true);
    for (let k = 0; k < m; k++) out.push(L.boxes[g.cand[k]]);
    return out;
  }
  function boxDist(b, p) {
    const dx = Math.max(b.min[0] - p[0], 0, p[0] - b.max[0]), dy = Math.max(b.min[1] - p[1], 0, p[1] - b.max[1]), dz = Math.max(b.min[2] - p[2], 0, p[2] - b.max[2]);
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }
  /* Free space at world point p for the camera clamp: the distance to the
     nearest box, capped at reach (default 40 m: "at least that much");
     inside a box, minus the depth of its cheapest exposed exit. 1e9 beyond
     the boxes' bounds plus reach. */
  function clearance(L, p, reach) {
    const R = reach == null ? 40 : reach, g = L._grid, lo = g.lo, hi = g.hi;
    if (p[0] < lo[0] - R || p[0] > hi[0] + R || p[1] < lo[1] - R || p[1] > hi[1] + R || p[2] < lo[2] - R || p[2] > hi[2] + R) return 1e9;
    const m = gather(g, p[0], p[1], p[2], R, true), B = g.B;
    let best = R, inside = Infinity;
    for (let k = 0; k < m; k++) {
      const id = g.cand[k], o = id * 6;
      if (p[0] > B[o] && p[0] < B[o + 3] && p[1] > B[o + 1] && p[1] < B[o + 4] && p[2] > B[o + 2] && p[2] < B[o + 5]) {
        let mk = g.open[id] || (B[o + 1] < 0.05 ? 0x37 : 0x3f), e = Infinity;
        if (mk & 1) e = Math.min(e, B[o + 3] - p[0]);
        if (mk & 2) e = Math.min(e, p[0] - B[o]);
        if (mk & 4) e = Math.min(e, B[o + 4] - p[1]);
        if (mk & 8) e = Math.min(e, p[1] - B[o + 1]);
        if (mk & 16) e = Math.min(e, B[o + 5] - p[2]);
        if (mk & 32) e = Math.min(e, p[2] - B[o + 2]);
        inside = Math.min(inside, e);
        continue;
      }
      const d = boxDist(L.boxes[id], p);
      if (d < best) best = d;
    }
    return inside < Infinity ? -inside : best;
  }
  function bounds(L) { return L._bounds; }
  /* The clearance the race line is guaranteed at world point p: the tube
     (22.5 m), but the needle (10 m) in variant B's package holes and gate
     planes, growing back to the tube at one metre per metre outside them
     (the canyon's cone). Every box keeps at least this much from the page
     curve (tested on the module's placements and the page's routes). */
  function tubeAt(L, p) {
    const zs = L.plan.needleZones;
    if (!zs || !zs.length) return TUBE;
    const q = toLocal(L, p);
    let r = TUBE;
    for (const z of zs) r = Math.min(r, z.r + ptBoxDist(q, z.a));
    return r;
  }
  /* How deep world point p is in the interior, for the fog and light
     blend: -1 outside the interior zone (atrium plus lid, and the exit's
     reveal), else the distance to the nearer of the two portal openings
     (0 in the opening, about 60 m one room in). */
  function depthIn(L, p) {
    const q = toLocal(L, p), z = L.plan.zoneBox, ep = L.plan.exitPortal;
    const inZone = q[0] > z[0] && q[0] < z[3] && q[1] > z[1] && q[1] < z[4] && q[2] > z[2] && q[2] < z[5];
    const inReveal = q[0] >= z[3] && q[0] <= GEO.EW && Math.abs(q[2] - ep.c[2]) < ep.w / 2 && Math.abs(q[1] - ep.c[1]) < ep.h / 2;
    if (!inZone && !inReveal) return -1;
    let best = Infinity;
    for (const pp of [L.plan.roofPortal, ep]) {
      let d2 = 0;
      for (let k = 0; k < 3; k++) {
        const e = Math.abs(pp.u[k]) * pp.w / 2 + Math.abs(pp.v[k]) * pp.h / 2, g = Math.max(0, Math.abs(q[k] - pp.c[k]) - e);
        d2 += g * g;
      }
      best = Math.min(best, Math.sqrt(d2));
    }
    return best;
  }
  /* inside the bounds of everything solid (building, campus) grown by
     margin: the region where the block's contacts replace the city's */
  function inside(L, p, margin) {
    const m = margin || 0, b = L._bounds;
    return p[0] >= b.min[0] - m && p[0] <= b.max[0] + m && p[1] >= b.min[1] - m && p[1] <= b.max[1] + m && p[2] >= b.min[2] - m && p[2] <= b.max[2] + m;
  }
  /* inside the building envelope (slabs, lid, end walls; not the campus) */
  function inBuilding(L, p, margin) {
    const m = margin || 0, b = L.envelope;
    return p[0] >= b.min[0] - m && p[0] <= b.max[0] + m && p[1] >= b.min[1] - m && p[1] <= b.max[1] + m && p[2] >= b.min[2] - m && p[2] <= b.max[2] + m;
  }

  /* ---- route ------------------------------------------------------------------
     flythrough(layout, { step }): the pass points for the race generator,
     world coordinates. waypoints[i] = { p, dir, up, kind, s, portal }:
     kind 'approach' (level at yApp, lead metres before the pitch-down leg),
     'via' (every step metres along the designed curve), 'portal' (entry:
     where the curve crosses the roof plane, exit: the end wall plane),
     'ring' (four: the middle of V1 and V2, halfway round the pull-out, the
     hall run), 'leave' (leave metres beyond the exit, level at yOut); s the
     arc length from the approach point, dir the curve's tangent. With the
     page's Hermite rule (tangent = dir times the chord, see pageCurve) the
     curve through these points keeps the tube and the bend radius; the
     tests check that curve, not the design curve. */
  function flythrough(L, opts) {
    const o = opts || {}, P = L.plan, R = P.route, step = o.step || L.cfg.step;
    const spec = [{ s: P.sIn, kind: 'portal', portal: 'entry' }, { s: P.sOut, kind: 'portal', portal: 'exit' }];
    for (const s of P.ringS) spec.push({ s: s, kind: 'ring' });
    const list = [{ s: P.sA, kind: 'approach' }];
    for (let s = P.sA + step; s < P.sL - step * 0.5; s += step) if (!spec.some((q) => Math.abs(q.s - s) < step * 0.45)) list.push({ s: s, kind: 'via' });
    for (const q of spec) list.push(q);
    list.sort((a, b) => a.s - b.s);
    list.push({ s: P.sL, kind: 'leave' });
    const wps = list.map((q) => ({ p: toWorld(L, R.at(q.s)), dir: dirWorld(L, R.tan(q.s)), up: [0, 1, 0], kind: q.kind, s: q.s - P.sA, portal: q.portal || null }));
    const points = [];
    for (let s = P.sA; s < P.sL; s += 2) points.push(toWorld(L, R.at(s)));
    points.push(toWorld(L, R.at(P.sL)));
    return { waypoints: wps, points: points, entry: 'entry', exit: 'exit', entryDir: L.entryDir.slice(), exitDir: L.exitDir.slice(), length: P.sL - P.sA,
      sIn: P.sIn - P.sA, sOut: P.sOut - P.sA };
  }
  /* The curve the page builds through waypoints (hkcore makeRoute): a cubic
     Hermite per leg, tangents dir times the chord, max(4, ceil(chord /
     step)) samples per leg. Returns [{ p, d, u }] with u the leg index plus
     the fraction. */
  function pageCurve(wps, step) {
    step = step || 4;
    const out = [];
    for (let i = 0; i + 1 < wps.length; i++) {
      const p0 = wps[i].p, p1 = wps[i + 1].p, c = len(sub(p1, p0));
      const m0 = wps[i].dir.map((v) => v * c), m1 = wps[i + 1].dir.map((v) => v * c);
      const n = Math.max(4, Math.ceil(c / step));
      for (let j = 0; j < n; j++) {
        const t = j / n, t2 = t * t, t3 = t2 * t;
        const h00 = 2 * t3 - 3 * t2 + 1, h10 = t3 - 2 * t2 + t, h01 = -2 * t3 + 3 * t2, h11 = t3 - t2;
        const g00 = 6 * t2 - 6 * t, g10 = 3 * t2 - 4 * t + 1, g01 = -6 * t2 + 6 * t, g11 = 3 * t2 - 2 * t;
        const p = [0, 1, 2].map((a) => h00 * p0[a] + h10 * m0[a] + h01 * p1[a] + h11 * m1[a]);
        const d = norm([0, 1, 2].map((a) => g00 * p0[a] + g10 * m0[a] + g01 * p1[a] + g11 * m1[a]));
        out.push({ p: p, d: d, u: i + t });
      }
    }
    const l = wps[wps.length - 1];
    out.push({ p: l.p.slice(), d: l.dir.slice(), u: wps.length - 1 });
    return out;
  }

  /* Portals in the Menger shape: { id, p, n, w, h, right, up, depth, kind,
     biome, c, rim }. p is where the race line crosses the opening's plane,
     n the outward normal, right and up the frame the page's gate takes from
     the waypoint direction (hkcore frameOf), w and h the opening's extent
     along them (so a gate w x h round c is inside the opening), depth the
     free run behind the opening (the lid's 56 m for the roof, the 212 m
     hall run for the exit), c the opening's centre, rim its corners. */
  function portals(L) {
    const P = L.plan, R = P.route;
    return [[P.roofPortal, P.sIn, 'entry', GEO.lid[1] - GEO.lid[0]], [P.exitPortal, P.sOut, 'exit', GEO.EW - (L.cfg.x0 - L.cfg.amp + L.cfg.R2)]].map((q) => {
      const pp = q[0], d = dirWorld(L, R.tan(q[1]));
      let right = cross(d, [0, 1, 0]);
      right = len(right) < 1e-6 ? [1, 0, 0] : norm(right);
      const up = norm(cross(right, d));
      const uW = dirWorld(L, pp.u), vW = dirWorld(L, pp.v);
      const ext = (e) => 2 * (Math.abs(dot(e, uW)) * pp.w / 2 + Math.abs(dot(e, vW)) * pp.h / 2);
      const rim = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map((s) => toWorld(L, [0, 1, 2].map((k) => pp.c[k] + pp.u[k] * s[0] * pp.w / 2 + pp.v[k] * s[1] * pp.h / 2)));
      return { id: q[2], p: toWorld(L, R.at(q[1])), n: dirWorld(L, pp.n), w: ext(right), h: ext(up), right: right, up: up, depth: q[3],
        kind: 'portal', biome: 'block', c: toWorld(L, pp.c), rim: rim, opening: [pp.w, pp.h] };
    });
  }

  /* ---- lanes ------------------------------------------------------------------
     World lanes in the HikyakuTraffic.makeLane shape, as menger.js makes
     them: { points (travel order), speed, spacing, types, phase, loop: false,
     up (horizontal on vertical lanes, for the heading), express, fadeEnds }
     plus id, axis (world), kind, mix, radius (vehicle reach plus 1.5 m),
     cull (600: interior traffic only near the building, needs the
     makeLane / createTraffic change in BLOCK-INTEGRATION.md),
     local (the plan lane) and near: the passes of the race line within
     radius + 22.5 m, one record per run { d, u, s, p }: d the closest
     distance, u the race line's arc length from the approach point, s the
     lane's arc length in travel order, p the race line point. Every near
     pass needs a timed gap at the race clock (hkcore makeLanes phases city
     lanes the same way); no lane crosses the line itself. */
  function worldLanes(L) {
    const P = L.plan, R = P.route, ph = mulberry32((L.seed * 13 + 5) | 0);
    return P.lanes.map((l, id) => {
      const ax = 'xyz'.indexOf(l.axis);
      const A = l.p.slice(), Bp = l.p.slice();
      A[ax] = l.dir > 0 ? l.s0 : l.s1; Bp[ax] = l.dir > 0 ? l.s1 : l.s0;
      const dW = dirWorld(L, l.axis === 'x' ? [1, 0, 0] : l.axis === 'y' ? [0, 1, 0] : [0, 0, 1]);
      const sp = SPACING[l.kind];
      const types = { hauler: 0, pod: 0, drone: 0 };
      for (const t of l.mix) types[t === 'car' ? 'pod' : t] += 1 / l.mix.length;
      const rad = laneRadius(l), lb = laneBoxL(l), near = [];
      let run = null;
      for (let i = 0; i < R.pts.length; i++) {
        const s = R.s[i];
        if (s < P.sA || s > P.sL) continue;
        const d = ptBoxDist(R.pts[i], lb);
        if (d < rad + TUBE) {
          if (!run || d < run.d) {
            const best = { d: d, s: s, q: R.pts[i] };
            run = run ? Object.assign(run, best) : best;
          }
        } else if (run) { near.push(run); run = null; }
      }
      if (run) near.push(run);
      return {
        id: id, axis: Math.abs(dW[0]) > 0.5 ? 'x' : Math.abs(dW[1]) > 0.5 ? 'y' : 'z', kind: l.kind,
        points: [toWorld(L, A), toWorld(L, Bp)], speed: l.v, spacing: sp, types: types, phase: ph() * sp, loop: false,
        up: l.axis === 'y' ? dirWorld(L, [1, 0, 0]) : [0, 1, 0], express: false, fadeEnds: L.cfg.fadeEnds,
        mix: l.mix.slice(), radius: rad, local: l, cull: 600,
        near: near.map((q) => ({ d: q.d, u: q.s - P.sA, s: Math.abs(Math.max(l.s0, Math.min(l.s1, q.q[ax])) - A[ax]), p: toWorld(L, q.q) }))
      };
    });
  }
  function lanes(L) { return L._lanes; }

  /* The block as a campus description for hikyaku-city.js (its campus
     round every special, campusOf/campusPlan, the shape documented there):
     { kind, footprint, plaza, legs, keep, attach, replaces, seed }. The
     footprint is the plan extent of the building's own boxes that start
     below 45 m (the campus top; the bays overhang it), the plaza
     faces the exit, the legs are the exit leg and the approach leg (600 m,
     capsules), keep holds the horizontal lanes (12 m longer, 9 m thick),
     ties may end in the building's boxes on its outer faces below 30 m,
     and the campus replaces layout.reserved. Use it with makeBlock(...,
     { campus: false }), so the module does not build a second campus. */
  function campusSpec(L) {
    const own = L.boxes.filter((b) => b.kind !== 'campus' && b.kind !== 'campusbridge');
    const lo = [Infinity, 0, Infinity], hi = [-Infinity, 0, -Infinity];
    /* the plan extent of what stands below the campus top (45 m: bays and pods above it overhang the campus) */
    for (const b of own) { hi[1] = Math.max(hi[1], b.max[1]); if (b.min[1] < 45) for (const k of [0, 2]) { lo[k] = Math.min(lo[k], b.min[k]); hi[k] = Math.max(hi[k], b.max[k]); } }
    const solid = own.filter((q) => q.min[1] < 30 && (Math.abs(q.max[0] - hi[0]) < 0.6 || Math.abs(q.min[0] - lo[0]) < 0.6 ||
      Math.abs(q.max[2] - hi[2]) < 0.6 || Math.abs(q.min[2] - lo[2]) < 0.6)).map((q) => ({ min: q.min.slice(), max: q.max.slice() }));
    const ps = portals(L), ft = flythrough(L), A = ft.waypoints[0].p, ex = ps[1];
    const legs = [
      { a: ex.p.slice(), b: sa(ex.p, ex.n, 600), r: Math.max(ex.opening[0], ex.opening[1]) / 2 + 12 },
      { a: A.slice(), b: sa(A, L.entryDir, -600), r: 40 }
    ];
    const keep = [];
    for (const l of L._lanes) {
      if (l.local.axis === 'y') continue;
      const a = l.points[0], b = l.points[1], d = norm(sub(b, a));
      keep.push({ a: sa(a, d, -12), b: sa(b, d, 12), r: 9 });
    }
    return { kind: 'block', footprint: { min: lo, max: hi }, plaza: ex.n.slice(), legs: legs, keep: keep, attach: { maxY: 30, solid: solid },
      replaces: { min: L.reserved.min.slice(), max: L.reserved.max.slice() }, seed: L.seed || 1 };
  }

  /* =====================================================================
     Visual layer. THREE is a parameter.
     ===================================================================== */
  function boneStops() {
    const CR = globalThis.ColorRamps, r = CR && CR.rampById('bone');
    if (!r || r.id !== 'bone') throw new Error('HikyakuBlock.build needs ColorRamps: load /assets/js/colorramps.js first');
    return r.stops;
  }
  function toLin(c) { return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
  function hexLin(hex, g) { return [toLin(((hex >> 16) & 255) / 255) * g, toLin(((hex >> 8) & 255) / 255) * g, toLin((hex & 255) / 255) * g]; }
  /* box faces as corner picks from (lo|hi per axis), counter-clockwise seen
     from outside (hikyaku-city.js FACE), by face bit: +x, -x, +y, -y, +z, -z */
  const FACE = [
    [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 0]],
    [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0], [-1, 0, 0]],
    [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0], [0, 1, 0]],
    [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1], [0, -1, 0]],
    [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1], [0, 0, 1]],
    [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, -1]]
  ];

  /* build(THREE, layout, opts): opts.fog (HikyakuCity.makeFog), opts.facadeMaterial
     (the city renderer's: the boxes are one draw in its facade convention,
     aSeed and aFac = (u, W, top, code), linear bone vertex colours; not
     owned, not disposed), opts.warm and opts.accent (hex). Returns { group,
     update(t, cameraPos), dispose(), stats }. */
  function build(THREE, L, opts) {
    opts = opts || {};
    const stops = boneStops();
    const bone = (t, g) => {
      t = Math.min(1, Math.max(0, t)) * (stops.length - 1);
      const i = Math.min(stops.length - 2, Math.floor(t)), f = t - i, a = stops[i], b = stops[i + 1], k = g == null ? 1 : g;
      return [toLin(a[0] + (b[0] - a[0]) * f) * k, toLin(a[1] + (b[1] - a[1]) * f) * k, toLin(a[2] + (b[2] - a[2]) * f) * k];
    };
    const fog = opts.fog || null, owned = [];
    const warm = opts.warm == null ? WARM : opts.warm, accent = opts.accent == null ? ACCENT : opts.accent;
    const COL = {
      warm: hexLin(warm, 2.2), sod: hexLin(0xffb46a, 1.5), cyan: hexLin(accent, 2.0), red: hexLin(0xff3a28, 2.2),
      amber: hexLin(0xffa31a, 2.0), bone: bone(0.92, 1.1)
    };
    const toW = (p) => toWorld(L, p);

    /* ---- the boxes: one indexed mesh, exposed faces only ---- */
    const boxes = L.boxes;
    let nf = 0;
    for (const b of boxes) for (let f = 0; f < 6; f++) if (b.open & (1 << f)) nf++;
    const pos = new Float32Array(nf * 12), nrm = new Float32Array(nf * 12), col = new Float32Array(nf * 12), sd = new Float32Array(nf * 4), fac = new Float32Array(nf * 16);
    const idx = new Uint32Array(nf * 6);
    let v = 0, q = 0;
    for (const b of boxes) {
      const lo = b.min, hi = b.max, rgb = bone(b.tone + 0.05);
      for (let f = 0; f < 6; f++) {
        if (!(b.open & (1 << f))) continue;
        const F = FACE[f], n = F[4], ta = n[0] ? 2 : (n[2] ? 0 : -1);
        for (let k = 0; k < 4; k++) {
          const c = F[k], o = (v + k) * 3, o4 = (v + k) * 4;
          pos[o] = c[0] ? hi[0] : lo[0]; pos[o + 1] = c[1] ? hi[1] : lo[1]; pos[o + 2] = c[2] ? hi[2] : lo[2];
          nrm[o] = n[0]; nrm[o + 1] = n[1]; nrm[o + 2] = n[2];
          col[o] = rgb[0]; col[o + 1] = rgb[1]; col[o + 2] = rgb[2];
          sd[v + k] = b.seed;
          fac[o4] = ta < 0 ? 0 : (c[ta] ? hi[ta] - lo[ta] : 0);
          fac[o4 + 1] = ta < 0 ? 0 : hi[ta] - lo[ta];
          fac[o4 + 2] = hi[1]; fac[o4 + 3] = b.prog;
        }
        idx[q++] = v; idx[q++] = v + 1; idx[q++] = v + 2; idx[q++] = v; idx[q++] = v + 2; idx[q++] = v + 3;
        v += 4;
      }
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    sg.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    sg.setAttribute('color', new THREE.BufferAttribute(col, 3));
    sg.setAttribute('aSeed', new THREE.BufferAttribute(sd, 1));
    sg.setAttribute('aFac', new THREE.BufferAttribute(fac, 4));
    sg.setIndex(new THREE.BufferAttribute(idx, 1));
    sg.computeBoundingSphere();
    const group = new THREE.Group();
    group.name = 'block';
    let facadeMat = opts.facadeMaterial || null;
    if (!facadeMat) {
      facadeMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0.15 });
      if (fog) fog.patch(facadeMat);
      owned.push(facadeMat);
    }
    const shell = new THREE.Mesh(sg, facadeMat);
    shell.name = 'block-shell';
    group.add(shell);

    /* ---- lights: lit bars, panels and dots in one unlit mesh, halos instanced ---- */
    const GP = [], GC = [];
    const tri = (a, b, c, k) => { GP.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]); for (let i = 0; i < 3; i++) GC.push(k[0], k[1], k[2]); };
    const quad = (a, b, c, d, k) => { tri(a, b, c, k); tri(a, c, d, k); };
    const glowBox = (lo, hi, k) => {
      const P8 = (i, j, m) => [i ? hi[0] : lo[0], j ? hi[1] : lo[1], m ? hi[2] : lo[2]];
      for (const F of FACE) quad(P8(F[0][0], F[0][1], F[0][2]), P8(F[1][0], F[1][1], F[1][2]), P8(F[2][0], F[2][1], F[2][2]), P8(F[3][0], F[3][1], F[3][2]), k);
    };
    const halos = [];
    for (const it of L.lights) {
      const k = COL[it.c] || COL.sod, kk = [k[0] * it.g, k[1] * it.g, k[2] * it.g];
      if (it.t === 'line') {
        const A = toW(it.a), B = toW(it.b), d = sub(B, A), l = len(d);
        if (l < 1e-6) continue;
        const t = [d[0] / l, d[1] / l, d[2] / l];
        const e1 = Math.abs(t[1]) < 0.9 ? norm(cross(t, [0, 1, 0])) : norm(cross(t, [1, 0, 0])), e2 = cross(t, e1), w = it.w / 2;
        const off = (P, a, b) => [P[0] + (e1[0] * a + e2[0] * b) * w, P[1] + (e1[1] * a + e2[1] * b) * w, P[2] + (e1[2] * a + e2[2] * b) * w];
        const S = [[1, 1], [-1, 1], [-1, -1], [1, -1]];
        for (let s = 0; s < 4; s++) { const a = S[s], b = S[(s + 1) % 4]; quad(off(A, a[0], a[1]), off(A, b[0], b[1]), off(B, b[0], b[1]), off(B, a[0], a[1]), kk); }
      } else if (it.t === 'box') {
        const a = worldAabb(L, it.lo.concat(it.hi));
        glowBox([a[0], a[1], a[2]], [a[3], a[4], a[5]], kk);
      } else if (it.t === 'dot') {
        const p = toW(it.p), s = it.s / 2;
        glowBox([p[0] - s, p[1] - s, p[2] - s], [p[0] + s, p[1] + s, p[2] + s], kk);
      } else if (it.t === 'halo') halos.push(it);
    }
    const gg = new THREE.BufferGeometry();
    gg.setAttribute('position', new THREE.Float32BufferAttribute(GP, 3));
    gg.setAttribute('color', new THREE.Float32BufferAttribute(GC, 3));
    gg.computeBoundingSphere();
    const glowMat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
    if (fog) fog.patch(glowMat, { fogK: 0.5 });
    owned.push(glowMat);
    const glowMesh = new THREE.Mesh(gg, glowMat);
    glowMesh.name = 'block-glow';
    group.add(glowMesh);

    const qg = new THREE.PlaneGeometry(1, 1);
    const hg = new THREE.InstancedBufferGeometry();
    hg.index = qg.index; hg.setAttribute('position', qg.getAttribute('position')); hg.setAttribute('uv', qg.getAttribute('uv'));
    const HPs = [], HS = [], HCl = [], HB = [];
    for (const h of halos) {
      const p = toW(h.p), k = COL[h.c] || COL.sod;
      HPs.push(p[0], p[1], p[2]); HS.push(h.sx, h.sy); HCl.push(k[0] * h.g, k[1] * h.g, k[2] * h.g); HB.push(h.blink || 0);
    }
    hg.setAttribute('iPos', new THREE.InstancedBufferAttribute(new Float32Array(HPs), 3));
    hg.setAttribute('iSize', new THREE.InstancedBufferAttribute(new Float32Array(HS), 2));
    hg.setAttribute('iCol', new THREE.InstancedBufferAttribute(new Float32Array(HCl), 3));
    hg.setAttribute('iBlink', new THREE.InstancedBufferAttribute(new Float32Array(HB), 1));
    hg.instanceCount = halos.length;
    const haloMat = new THREE.ShaderMaterial({
      uniforms: { uFogK: { value: 0.45 }, uTime: { value: 0 } },
      vertexShader: '/*CG_FOG*/\nuniform float uFogK; uniform float uTime;\nattribute vec3 iPos; attribute vec2 iSize; attribute vec3 iCol; attribute float iBlink;\nvarying vec2 vUv; varying vec3 vCol;\n' +
        'void main(){\n  vec4 mv = modelViewMatrix * vec4(iPos, 1.0);\n  mv.xy += position.xy * iSize;\n  vUv = uv;\n' +
        '  float bl = iBlink > 0.0 ? 0.2 + 0.8 * step(fract(uTime / iBlink + fract(iPos.x * 0.0137 + iPos.z * 0.0071)), 0.25) : 1.0;\n' +
        '#ifdef BK_CG\n  vec3 wp = (modelMatrix * vec4(iPos, 1.0)).xyz;\n  vCol = iCol * bl * (1.0 - cgFogAmt(wp, uFogK));\n#else\n  vCol = iCol * bl;\n#endif\n' +
        '  gl_Position = projectionMatrix * mv;\n}',
      fragmentShader: 'varying vec2 vUv; varying vec3 vCol;\nvoid main(){\n  float r = length(vUv - 0.5) * 2.0;\n  float a = exp(-r * r * 3.5) * clamp(1.0 - r, 0.0, 1.0);\n  gl_FragColor = vec4(vCol * a, 1.0);\n}',
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false
    });
    if (fog) { haloMat.defines = { BK_CG: '' }; fog.inject(haloMat); }
    owned.push(haloMat);
    const haloMesh = new THREE.Mesh(hg, haloMat);
    haloMesh.name = 'block-halos';
    haloMesh.frustumCulled = false;
    group.add(haloMesh);

    /* ---- details: one instanced mesh per kind ---- */
    const kinds = {};
    for (const dt of L.details) (kinds[dt.k] = kinds[dt.k] || []).push(dt);
    const detailMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.75, metalness: 0.25 });
    if (fog) fog.patch(detailMat);
    owned.push(detailMat);
    const unit = new THREE.BoxGeometry(1, 1, 1);
    const m4 = new THREE.Matrix4(), m4b = new THREE.Matrix4(), tc = new THREE.Color();
    const VX = new THREE.Vector3(), VY = new THREE.Vector3(), VZ = new THREE.Vector3();
    let nDet = 0;
    for (const kind of Object.keys(kinds)) {
      const list = kinds[kind];
      const im = new THREE.InstancedMesh(unit, detailMat, list.length);
      im.name = 'block-detail-' + kind;
      list.forEach((dt, i) => {
        if (dt.lo) {
          const a = worldAabb(L, dt.lo.concat(dt.hi));
          m4.makeScale(Math.max(0.01, a[3] - a[0]), Math.max(0.01, a[4] - a[1]), Math.max(0.01, a[5] - a[2])).setPosition((a[0] + a[3]) / 2, (a[1] + a[4]) / 2, (a[2] + a[5]) / 2);
        } else {
          const A = toW(dt.a), B = toW(dt.b), d = sub(B, A), l = Math.max(0.01, len(d)), t = [d[0] / l, d[1] / l, d[2] / l];
          const e1 = Math.abs(t[1]) < 0.9 ? norm(cross(t, [0, 1, 0])) : norm(cross(t, [1, 0, 0])), e2 = cross(t, e1);
          m4.makeBasis(VX.fromArray(e1), VY.fromArray(e2), VZ.fromArray(t));
          m4b.makeScale(2 * dt.r, 2 * dt.r, l);
          m4.multiply(m4b).setPosition((A[0] + B[0]) / 2, (A[1] + B[1]) / 2, (A[2] + B[2]) / 2);
        }
        im.setMatrixAt(i, m4);
        const c = bone(dt.tone == null ? 0.3 : dt.tone);
        im.setColorAt(i, tc.setRGB(c[0], c[1], c[2]));
      });
      im.computeBoundingSphere();
      group.add(im);
      nDet += list.length;
    }

    const ctr = toW([0, 250, 0]);
    const update = function (t, cameraPos) {
      haloMat.uniforms.uTime.value = t || 0;
      if (cameraPos) {
        const dx = cameraPos[0] - ctr[0], dy = cameraPos[1] - ctr[1], dz = cameraPos[2] - ctr[2];
        if (dx * dx + dy * dy + dz * dz > 8000 * 8000) return false;
      }
      return true;
    };
    let tris = 0;
    group.traverse((o) => {
      if (!o.isMesh) return;
      const g = o.geometry, per = (g.index ? g.index.count : g.getAttribute('position').count) / 3;
      tris += per * (o.isInstancedMesh ? o.count : g.isInstancedBufferGeometry ? g.instanceCount : 1);
    });
    return {
      group: group, update: update,
      stats: { tris: Math.round(tris), shellTris: nf * 2, glowTris: GP.length / 9, halos: halos.length, details: nDet, kinds: Object.keys(kinds).length, boxes: boxes.length, faces: nf, facesCulled: boxes.length * 6 - nf },
      dispose: function () {
        group.traverse((o) => { if (o.geometry && o.geometry !== unit) o.geometry.dispose(); });
        unit.dispose(); qg.dispose();
        for (const m of owned) m.dispose();
        if (group.parent) group.parent.remove(group);
      }
    };
  }

  globalThis.HikyakuBlock = {
    DEF: DEF, GEO: GEO, TUBE: TUBE, ACCENT: ACCENT, WARM: WARM, tubeAt: tubeAt,
    makeBlock: makeBlock, campusSpec: campusSpec, flythrough: flythrough, pageCurve: pageCurve, lanes: lanes, laneRadius: laneRadius, portals: portals,
    contacts: contacts, boxesNear: boxesNear, clearance: clearance, inside: inside, inBuilding: inBuilding, bounds: bounds, depthIn: depthIn,
    toWorld: toWorld, toLocal: toLocal, dirWorld: dirWorld, dirLocal: dirLocal, yawFor: yawFor, boxDist: boxDist,
    solidShare: solidShare, curvatureOf: curvatureOf,
    build: build
  };
})();
