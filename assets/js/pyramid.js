/* pyramid.js -- the type P arcology of Hikyaku: a steep truncated pyramid
 * whose interior is the ventilation system. The race enters through a gate at
 * the back of a deep notch in the front face, flies the duct (shaft.js) with
 * one right turn, and leaves through a splayed portal on a side face.
 *
 * Concept: notes/tools/hikyaku/concepts/PYRAMID-VARIANTS.md, variant D2
 * (pyr-d2.html, lib/pyrslope.js, lib/pyrpath.js). Kept from there: the
 * dimensions, the hollow shell (outer surfaces only, so nothing can cross the
 * duct), the faces cut around exact holes instead of boxes split by cuts, and
 * the collision proposal (half-spaces for the faces, air regions for the
 * notch and the reveals, boxes for everything axis-aligned). New here: world
 * placement, the contacts in the record shape of SixDOF.resolve, the route
 * pass points, and a build on the game's own materials.
 *
 * Two layers, like menger.js and shaft.js:
 *
 *   - Pure layer, no three.js, no DOM: makePyramid, toLocal, toWorld,
 *     contacts, boxesNear, flythrough, portals, inside, bounds, fitCheck.
 *     notes/dev/pyramid.test.mjs checks it. Needs globalThis.Shaft (the duct).
 *   - Visual layer: build(THREE, layout, opts). THREE is a parameter, never an
 *     import. Uses ColorRamps (bone greys) and Shaft.build for the duct.
 *
 * Local frame: y up, the centre of the base at the origin, the front (notch)
 * on +z, so a pilot flying in travels along -z. The duct turns right, toward
 * +x, and leaves through the east face. World placement: origin (centre of
 * the base on the ground) and a yaw that is a multiple of 90 degrees in
 * three.js's rotation.y convention, as menger.js and shaft.js: local -z goes
 * to (-sin yaw, 0, -cos yaw). Multiples of 90 keep every box axis-aligned.
 *
 * Dimensions (D2): skirt 1280 x 60 m; frustum 1120 m wide at its foot (60 m),
 * faces at 62 degrees (cot c = 0.53), flat top 378 m wide at 760 m. Front
 * notch: walls at |x| = 100 + 0.08 y, gate wall at z = 300, open where the
 * face is in front of the gate (up to 551 m). Duct axis at 200 m, above all
 * three lane heights.
 *
 * Collision. The frustum is convex: four face planes n . p = d (n outward,
 * tilted up by the slope) and the roof plane y = TOP. A point behind all of
 * them is in the shell unless it is in an air region: the notch, the two
 * splayed reveals, the hole of each mouth plate, or the duct's own wall band
 * near the mouths (that belongs to the shaft's contacts). A point in the
 * shell leaves through the cheapest exit: a face, the roof, back into the
 * notch or a reveal (the largest violated constraint of that region, a lower
 * bound of the distance), or into a plate's hole. Nothing deeper than `cap`
 * (30 m) answers: the duct runs at least the fit margin (above 60 m) behind
 * every plane, so a hull in the duct gets nothing from here, and a hull can
 * only be that deep by tunnelling. On the outside of the faces, fins and
 * bands are slabs on the face planes (out along n, fins also sideways).
 * Skirt, roof, crown and clutter are boxes in the game's box shape
 * ({ min, max, c, half, idx }, boxesNear) for hkcore contactsBoxes.
 *
 * Detail layers (terraces, balconies, grilles and the like, concept D3) are
 * meant to go into layout.details: boxes in face-local coordinates (face id,
 * u, y, w, h, d, kind), drawn as one instanced mesh per kind. build() already
 * draws them; makePyramid fills the list with a first, sparse kind (ledges).
 *
 * Everything hangs on globalThis.HikyakuPyramid.
 */
(function () {
  'use strict';

  const ACCENT = 0x2ee8ff, WARM = 0xffa63d;
  const DEF = {
    skirtHalf: 640, skirtH: 60, hb: 560, H: 700, c: 0.53, CW: 100, cc: 0.08, GZ: 300,
    ductY: 200,            /* duct axis altitude */
    gateD: 30,             /* gate plane to the duct mouth */
    plate: 2.4,            /* mouth plate depth (shaft proud) */
    PW: 140, PH: 112,      /* portal opening at the plate */
    splay: 0.35,           /* reveal widening per metre of depth */
    s1: 370,               /* straight from the mouth to the bend */
    bendR: 180, ramp: 40,  /* the right turn: plateau radius, curvature ramps */
    exitTopD: 12,          /* the opening's top edge this far behind the east face */
    loftIn: [90, 180], loftOut: [153, 73],   /* lofts: from the entry, and before the exit */
    fanIn: 90,             /* first round fan this far before the bend */
    fanOut: [183, 38],     /* second round fan and the square fan, before the exit */
    fins: [-0.5, 0.5], finW: 40, finD: 10, cornerW: 34, cornerD: 13,
    bands: [0.2, 0.5, 0.78], bandH: 7, bandD: 1.5,
    notchFins: [40, 120, 220], notchFinW: 10, notchFinD: 5, pilasterW: 12, pilasterD: 6,
    lead: 260, leave: 160, /* route: approach before the gate, leave beyond the exit */
    wallT: 12, cap: 30, plaza: 120, fitHalf: 62
  };

  /* ---- helpers ------------------------------------------------------------ */
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
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function norm(a) { const l = Math.hypot(a[0], a[1], a[2]); return [a[0] / l, a[1] / l, a[2] / l]; }
  function sa(c, v, s) { return [c[0] + v[0] * s, c[1] + v[1] * s, c[2] + v[2] * s]; }
  function boxDist(b, p) {
    const dx = Math.max(b.min[0] - p[0], 0, p[0] - b.max[0]);
    const dy = Math.max(b.min[1] - p[1], 0, p[1] - b.max[1]);
    const dz = Math.max(b.min[2] - p[2], 0, p[2] - b.max[2]);
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }
  function needShaft() {
    const S = globalThis.Shaft;
    if (!S) throw new Error('HikyakuPyramid needs Shaft: load /assets/js/shaft.js first');
    return S;
  }

  /* ---- placement ------------------------------------------------------------ */
  function toWorld(L, p) {
    const c = L.cy, s = L.sy, o = L.origin;
    return [o[0] + p[0] * c + p[2] * s, o[1] + p[1], o[2] - p[0] * s + p[2] * c];
  }
  function dirWorld(L, d) { return [d[0] * L.cy + d[2] * L.sy, d[1], -d[0] * L.sy + d[2] * L.cy]; }
  function toLocal(L, w) {
    const c = L.cy, s = L.sy, o = L.origin, dx = w[0] - o[0], dz = w[2] - o[2];
    return [dx * c - dz * s, w[1] - o[1], dx * s + dz * c];
  }

  /* ---- the layout --------------------------------------------------------------
     makePyramid(seed, opts): opts.origin [x, 0, z] or { x, z }, opts.yaw
     (multiple of 90 degrees), opts.avoid (world points the clutter keeps 34 m
     from, e.g. the route samples), opts.idxBase (box idx offset, so the keys
     of contactsBoxes never collide with the city's), any DEF key. */
  function makePyramid(seed, opts) {
    opts = opts || {};
    const S = needShaft();
    const C = Object.assign({}, DEF, opts);
    const yaw = opts.yaw || 0, qy = yaw / (Math.PI / 2);
    if (Math.abs(qy - Math.round(qy)) > 1e-6) throw new Error('HikyakuPyramid: yaw must be a multiple of 90 degrees');
    const o = opts.origin;
    const origin = Array.isArray(o) ? [o[0], o[1] || 0, o[2]] : o ? [o.x || 0, o.y || 0, o.z || 0] : [0, 0, 0];
    const L = { seed: seed >>> 0, cfg: C, yaw: yaw, origin: origin, cy: Math.round(Math.cos(yaw)), sy: Math.round(Math.sin(yaw)) };
    const rng = mulberry32((seed >>> 0) ^ 0x7a1d0c3b);

    /* dimensions */
    const y0 = C.skirtH, TOP = y0 + C.H, q = Math.hypot(1, C.c), qc = Math.hypot(1, C.cc), qs = Math.hypot(1, C.splay);
    const D = {
      skirtHalf: C.skirtHalf, skirtH: C.skirtH, hb: C.hb, c: C.c, y0: y0, TOP: TOP, topHalf: C.hb - C.H * C.c,
      CW: C.CW, cc: C.cc, GZ: C.GZ, notchTop: y0 + (C.hb - C.GZ) / C.c, q: q, qc: qc, qs: qs,
      dFace: (C.hb + C.c * y0) / q
    };
    D.half = (y) => C.hb - (y - y0) * C.c;
    D.cw = (y) => C.CW + C.cc * y;
    L.dims = D;
    /* faces: S (front, +z), E, N, W; n outward (tilted up), T the u axis */
    L.faces = [['S', [0, 0, 1]], ['E', [1, 0, 0]], ['N', [0, 0, -1]], ['W', [-1, 0, 0]]].map(([id, nh]) => ({
      id: id, nh: nh, n: [nh[0] / q, C.c / q, nh[2] / q], d: D.dFace, T: cross([0, 1, 0], nh)
    }));

    /* the duct: mouth GZ - gateD behind the gate, s1 straight, one ramped
       right turn, then straight to exitTopD behind the east face */
    const yc = C.ductY, zs = C.GZ - C.gateD;
    const rp = Math.min(C.ramp, Math.PI / 2 * C.bendR * 0.5), wB = Math.PI / 2 * C.bendR + rp;
    /* where the turn ends (local), integrated like Shaft.makeShaft does */
    const probe = S.makeShaft(1, { origin: [0, yc, zs], yaw: 0, length: C.s1 + wB + 10, loft: [1, 2, 3, 4], fans: [],
      bends: [{ kind: 'arc', s0: C.s1, angle: Math.PI / 2, R: C.bendR, ramp: C.ramp }], housing: false });
    const fe = S.frameAt(probe, C.s1 + wB);
    const xe = D.half(yc + C.PH / 2) - C.plate - C.exitTopD;   /* the duct end */
    const s2 = xe - fe.p[0];
    if (!(s2 > 60)) throw new Error('HikyakuPyramid: no room for the exit leg');
    const len = C.s1 + wB + s2;
    const loft = [C.loftIn[0], C.loftIn[1], len - C.loftOut[0], len - C.loftOut[1]];
    const fans = [{ s: C.s1 - C.fanIn, kind: 'round' }, { s: len - C.fanOut[0], kind: 'round' }, { s: len - C.fanOut[1], kind: 'square' }];
    const sSeed = 1 + ((Math.imul((seed >>> 0) ^ 0x51f7e2a9, 2654435761) >>> 0) % 99991);
    const duct = S.makeShaft(sSeed, {
      origin: toWorld(L, [0, yc, zs]), yaw: yaw, length: len, loft: loft, fans: fans,
      bends: [{ kind: 'arc', s0: C.s1, angle: Math.PI / 2, R: C.bendR, ramp: C.ramp }],
      housing: false, proud: C.plate, collar: 16, wallT: C.wallT
    });
    L.duct = duct;
    L.bend = { s0: C.s1, s1: C.s1 + wB, R: C.bendR, ramp: rp };
    const eL = toLocal(L, S.frameAt(duct, len).p);

    /* portals: station point E (duct end), outward o, lateral N; the reveal
       starts at the plate front (t = 0) and ends at the outer plane */
    const mkPortal = (id, E, o, N, outer, sEnd) => {
      const P = { id: id, E: E, o: o, N: N, outer: outer, sEnd: sEnd, hw: C.PW / 2, hh: C.PH / 2, splay: C.splay, plate: C.plate,
        skip: id === 'entry' ? loft[0] : len - loft[3] };
      /* outer rim: the inner corners at the plate front, splayed until they meet the outer plane */
      const F = sa(E, o, C.plate);
      P.rim = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => {
        const p0 = [F[0] + N[0] * a * P.hw, F[1] + b * P.hh, F[2] + N[2] * a * P.hw];
        const dv = [o[0] + N[0] * a * C.splay, b * C.splay, o[2] + N[2] * a * C.splay];
        const t = (outer.d - dot(outer.n, p0)) / dot(outer.n, dv);
        return sa(p0, dv, Math.max(4, t));
      });
      /* where the axis crosses the outer plane */
      const ta = (outer.d - dot(outer.n, E)) / dot(outer.n, o);
      P.axisOut = sa(E, o, ta);
      P.depthOut = ta;
      return P;
    };
    const fE = L.faces[1];
    L.portalsL = [
      mkPortal('entry', [0, yc, zs], [0, 0, 1], [1, 0, 0], { n: [0, 0, 1], d: C.GZ }, 0),
      mkPortal('exit', eL, [1, 0, 0], [0, 0, 1], { n: fE.n, d: fE.d }, len)
    ];

    /* face holes, as (u, y) trapezoids: the notch on S, the exit on E */
    const trap = (rim, T) => {
      const uv = rim.map((p) => [dot(p, T), p[1]]);
      const ya = (uv[0][1] + uv[1][1]) / 2, yb = (uv[2][1] + uv[3][1]) / 2;
      return { ya: ya, yb: yb, uL: [Math.min(uv[0][0], uv[1][0]), Math.min(uv[2][0], uv[3][0])], uR: [Math.max(uv[0][0], uv[1][0]), Math.max(uv[2][0], uv[3][0])] };
    };
    L.holes = { S: [{ ya: y0, yb: D.notchTop, notch: true }], E: [trap(L.portalsL[1].rim, fE.T)], W: [], N: [], gate: [trap(L.portalsL[0].rim, [1, 0, 0])] };

    /* slabs on the faces (fins, corner fins, bands) and in the notch */
    const slabs = [];
    for (let k = 0; k < 4; k++) {
      for (const f of C.fins) slabs.push({ face: k, kind: 'fin', u: f * D.topHalf, w: C.finW, d: C.finD, y0: y0, y1: TOP });
      slabs.push({ face: k, kind: 'corner', w: C.cornerW, d: C.cornerD, y0: y0, y1: TOP });
      for (const b of C.bands) { const yb = y0 + b * (TOP - y0); slabs.push({ face: k, kind: 'band', d: C.bandD, y0: yb, y1: yb + C.bandH, lit: true }); }
      slabs.push({ face: k, kind: 'band', d: 2.5, y0: TOP - 26, y1: TOP - 4, lit: false });
      slabs.push({ face: k, kind: 'band', d: C.bandD, y0: y0, y1: y0 + 9, lit: false });
    }
    L.slabs = slabs;
    L.notchSlabs = [];
    for (const sx of [-1, 1]) for (const zf of C.notchFins) L.notchSlabs.push({ kind: 'nfin', sx: sx, z0: C.GZ + zf, z1: C.GZ + zf + C.notchFinW, d: C.notchFinD });
    for (const sx of [-1, 1]) L.notchSlabs.push({ kind: 'pilaster', sx: sx, w: C.pilasterW, d: C.pilasterD });

    /* boxes: skirt, cornices, grilles, terrace clutter, roof, crown */
    const boxes = [];
    const box = (x0, y0b, z0, x1, y1b, z1, tone, prog, coll) => boxes.push({ lo: [x0, y0b, z0], hi: [x1, y1b, z1], tone: tone, prog: prog == null ? 4 : prog, coll: coll !== false, seed: rng() });
    const SKH = C.skirtHalf, SH = C.skirtH, wN = Math.max(D.cw(0), D.cw(SH)), GZ = C.GZ, hb = C.hb, TH = D.topHalf;
    box(-SKH, 0, -SKH, SKH, SH, GZ, 0.4, 2);
    box(-SKH, 0, GZ, -wN, SH, SKH, 0.4, 2);
    box(wN, 0, GZ, SKH, SH, SKH, 0.4, 2);
    for (const [a, b] of [[SH - 8, SH], [SH * 0.45, SH * 0.45 + 3]]) {
      box(-SKH - 6, a, -SKH - 6, SKH + 6, b, -SKH, 0.6);
      box(-SKH - 6, a, -SKH, -SKH, b, SKH + 6, 0.6);
      box(SKH, a, -SKH, SKH + 6, b, SKH + 6, 0.6);
      box(-SKH, a, SKH, -wN, b, SKH + 6, 0.6);
      box(wN, a, SKH, SKH, b, SKH + 6, 0.6);
    }
    /* intake grilles on all four skirt faces: a 2.5 m proud panel each (the
       slats are a detail for later) */
    for (let i = 0; i < 6; i++) {
      const a = -SKH + 80 + i * (2 * SKH - 160) / 5, w = 70;
      box(a - w / 2, 6, -SKH - 2.5, a + w / 2, SH * 0.42, -SKH, 0.16);
      box(SKH, 6, a - w / 2, SKH + 2.5, SH * 0.42, a + w / 2, 0.16);
      box(-SKH - 2.5, 6, a - w / 2, -SKH, SH * 0.42, a + w / 2, 0.16);
      if (Math.abs(a) > wN + 50) box(a - w / 2, 6, SKH, a + w / 2, SH * 0.42, SKH + 2.5, 0.16);
    }
    /* terrace clutter on the skirt top, in clusters, clear of the approach,
       the exit leg and opts.avoid */
    const ex = L.portalsL[1].axisOut;
    const avoidL = (opts.avoid || []).map((p) => toLocal(L, p));
    const clear = (x0, yA, z0, x1, yB, z1) => {
      if (z1 > GZ - 20 && Math.min(Math.abs(x0), Math.abs(x1), x0 * x1 < 0 ? 0 : Infinity) < D.cw(SH) + 60) return false;
      if (x1 > hb - 20 && z1 > ex[2] - 120 && z0 < ex[2] + 120) return false;
      for (const p of avoidL) {
        const dx = Math.max(x0 - p[0], 0, p[0] - x1), dy = Math.max(yA - p[1], 0, p[1] - yB), dz = Math.max(z0 - p[2], 0, p[2] - z1);
        if (dx * dx + dy * dy + dz * dz < 34 * 34) return false;
      }
      return true;
    };
    for (let side = 0; side < 4; side++) for (let cl = 0; cl < 4; cl++) {
      const along = -SKH + 60 + rng() * (2 * SKH - 120), dep = hb + 12 + rng() * (SKH - hb - 24);
      for (let k = 0; k < 5; k++) {
        const w = 8 + rng() * 22, d = Math.min(8 + rng() * 16, SKH - hb - 16), h = 5 + rng() * 13;
        const a = along + (rng() - 0.5) * 80, b = Math.min(SKH - 6 - d / 2, Math.max(hb + 6 + d / 2, dep));
        let x, z;
        if (side === 0) { x = b; z = a; } else if (side === 1) { x = -b; z = a; } else if (side === 2) { x = a; z = -b; } else { x = a; z = b; }
        const sx = side < 2 ? d : w, sz = side < 2 ? w : d;
        const tone = 0.3 + rng() * 0.25, prog = rng() < 0.3 ? 2 : 4;
        if (!clear(x - sx / 2, SH, z - sz / 2, x + sx / 2, SH + h, z + sz / 2)) continue;
        box(x - sx / 2, SH, z - sz / 2, x + sx / 2, SH + h, z + sz / 2, tone, prog);
      }
    }
    /* roof slab and parapet */
    box(-TH, TOP - 10, -TH, TH, TOP, TH, 0.5);
    box(-TH - 4, TOP, -TH - 4, TH + 4, TOP + 7, -TH + 6, 0.6);
    box(-TH - 4, TOP, TH - 6, TH + 4, TOP + 7, TH + 4, 0.6);
    box(-TH - 4, TOP, -TH + 6, -TH + 6, TOP + 7, TH - 6, 0.6);
    box(TH - 6, TOP, -TH + 6, TH + 4, TOP + 7, TH - 6, 0.6);
    /* exhaust crown: four louvre banks round a well, corner piers. The
       banks are solid boxes for the contacts; the slats are drawn only */
    const cH = TH * 0.62, cyH = 46;
    L.crown = { half: cH, h: cyH, y: TOP };
    box(-cH, TOP, cH - 1, cH, TOP + cyH - 3, cH + 1, 0.55, 4, true);
    box(-cH, TOP, -cH - 1, cH, TOP + cyH - 3, -cH + 1, 0.55, 4, true);
    box(cH - 1, TOP, -cH, cH + 1, TOP + cyH - 3, cH, 0.55, 4, true);
    box(-cH - 1, TOP, -cH, -cH + 1, TOP + cyH - 3, cH, 0.55, 4, true);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(sx * cH - 8, TOP, sz * cH - 8, sx * cH + 8, TOP + cyH + 6, sz * cH + 8, 0.62);
    box(-cH + 2, TOP, -cH + 2, cH - 2, TOP + 4, cH - 2, 0.08);
    L.boxesL = boxes;

    /* world boxes for the contacts, in the game's shape, plus a 2-D grid */
    const idxBase = opts.idxBase || 0;
    L.boxes = [];
    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i];
      if (!b.coll) continue;
      const a = toWorld(L, b.lo), c = toWorld(L, b.hi);
      const mn = [Math.min(a[0], c[0]), a[1], Math.min(a[2], c[2])], mx = [Math.max(a[0], c[0]), c[1], Math.max(a[2], c[2])];
      L.boxes.push({ min: mn, max: mx, c: [(mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, (mn[2] + mx[2]) / 2],
        half: [(mx[0] - mn[0]) / 2, (mx[1] - mn[1]) / 2, (mx[2] - mn[2]) / 2], idx: idxBase + L.boxes.length });
    }
    const G = 64, gx0 = origin[0] - SKH - 16, gz0 = origin[2] - SKH - 16, gn = Math.ceil((2 * SKH + 32) / G);
    const cells = new Array(gn * gn);
    for (let i = 0; i < cells.length; i++) cells[i] = [];
    L.boxes.forEach((b, i) => {
      const i0 = Math.max(0, Math.floor((b.min[0] - gx0) / G)), i1 = Math.min(gn - 1, Math.floor((b.max[0] - gx0) / G));
      const k0 = Math.max(0, Math.floor((b.min[2] - gz0) / G)), k1 = Math.min(gn - 1, Math.floor((b.max[2] - gz0) / G));
      for (let k = k0; k <= k1; k++) for (let j = i0; j <= i1; j++) cells[k * gn + j].push(i);
    });
    L._grid = { G: G, x0: gx0, z0: gz0, n: gn, cells: cells, stamp: new Uint32Array(L.boxes.length), tick: 0 };

    /* detail layer: face-local boxes, one instanced draw per kind. First
       kind: ledges every ten storeys across the window fields */
    L.details = [];
    const bandY = C.bands.map((b) => y0 + b * (TOP - y0));
    for (let k = 0; k < 4; k++) {
      for (let y = y0 + 36; y < TOP - 30; y += 36) {
        if (bandY.some((b) => Math.abs(y - b) < 12)) continue;
        const h = D.half(y), cols = [-h + C.cornerW, ...C.fins.map((f) => f * TH), h - C.cornerW];
        for (let j = 0; j + 1 < cols.length; j++) {
          const a = cols[j] + (j > 0 ? C.finW / 2 : 0), b = cols[j + 1] - (j + 1 < cols.length - 1 ? C.finW / 2 : 0);
          if (b - a > 20) L.details.push({ face: k, kind: 'ledge', u: (a + b) / 2, y: y, w: b - a - 4, h: 0.8, d: 1.2 });
        }
      }
    }
    /* details must not sit in a hole */
    L.details = L.details.filter((dt) => !inHoleUV(L, dt.face, dt.u - dt.w / 2, dt.y) && !inHoleUV(L, dt.face, dt.u + dt.w / 2, dt.y) && !inHoleUV(L, dt.face, dt.u, dt.y));

    /* bounds, reserved region, fit */
    const P = C.plaza;
    const r0 = toWorld(L, [-SKH - P, 0, -SKH - P]), r1 = toWorld(L, [SKH + P, 0, SKH + P]);
    L.reserved = { min: [Math.min(r0[0], r1[0]), 0, Math.min(r0[2], r1[2])], max: [Math.max(r0[0], r1[0]), 4000, Math.max(r0[2], r1[2])] };
    const b0 = toWorld(L, [-SKH - 8, 0, -SKH - 8]), b1 = toWorld(L, [SKH + 8, 0, SKH + 8]);
    L._bounds = { min: [Math.min(b0[0], b1[0]), 0, Math.min(b0[2], b1[2])], max: [Math.max(b0[0], b1[0]), origin[1] + TOP + cyH + 8, Math.max(b0[2], b1[2])] };
    L.entryDir = dirWorld(L, [0, 0, -1]);
    L.exitDir = dirWorld(L, [1, 0, 0]);
    L.fit = fitCheck(L);
    L._k = makeContactK(L);
    return L;
  }

  /* (u, y) inside one of the face's holes? (for the details) */
  function inHoleUV(L, k, u, y) {
    const D = L.dims, id = L.faces[k].id;
    for (const h of L.holes[id]) {
      if (y < h.ya || y > h.yb) continue;
      if (h.notch) { if (Math.abs(u) < D.cw(y) + 6) return true; continue; }
      const f = (y - h.ya) / (h.yb - h.ya), uL = h.uL[0] + (h.uL[1] - h.uL[0]) * f, uR = h.uR[0] + (h.uR[1] - h.uR[0]) * f;
      if (u > uL - 6 && u < uR + 6) return true;
    }
    return false;
  }

  /* Fit check: the smallest perpendicular distance from a fitHalf square
     around the duct centre line (in the duct's N/B frame, sampled every 4 m)
     to the face planes, the roof and the notch, away from the two mouths
     (where the reveals cut through on purpose). */
  function fitCheck(L) {
    const S = needShaft(), C = L.cfg, D = L.dims, sh = L.duct, h = C.fitHalf;
    let worst = { m: Infinity, s: 0 };
    for (let s = C.gateD + 60; s <= sh.length - 70; s += 4) {
      const f = S.frameAt(sh, s);
      for (const a of [-h, 0, h]) for (const b of [-h, 0, h]) {
        const p = toLocal(L, [f.p[0] + f.N[0] * a, f.p[1] + b, f.p[2] + f.N[2] * a]);
        let m = D.TOP - p[1];
        for (const fc of L.faces) m = Math.min(m, fc.d - dot(fc.n, p));
        if (p[2] > D.GZ - 1 && Math.abs(p[0]) < D.cw(p[1]) + 1) m = -1;
        if (m < worst.m) worst = { m: m, s: s };
      }
    }
    return worst;
  }

  /* ---- contacts -------------------------------------------------------------
     The hot path reads one flat record (L._k, built once by makeContactK)
     instead of the layout, so every access is a fixed-shape load. */
  function makeContactK(L) {
    const D = L.dims, C = L.cfg, R = globalThis.Shaft.RECT;
    const port = (P) => ({ ex: P.E[0], ey: P.E[1], ez: P.E[2], ox: P.o[0], oz: P.o[2], nx: P.N[0], nz: P.N[2],
      plate: P.plate, hw: P.hw, hh: P.hh, sp: P.splay, skip: P.skip, onx: P.outer.n[0], ony: P.outer.n[1], onz: P.outer.n[2], od: P.outer.d });
    const slabRows = (k) => {
      const list = L.slabs.filter((s) => s.face === k), a = new Float64Array(list.length * 6);
      list.forEach((s, i) => { a.set([s.kind === 'fin' ? 0 : s.kind === 'corner' ? 1 : 2, s.u || 0, s.w || 0, s.d, s.y0, s.y1], i * 6); });
      return a;
    };
    const nf = L.notchSlabs.filter((s) => s.kind === 'nfin'), nfa = new Float64Array(nf.length * 4);
    nf.forEach((s, i) => nfa.set([s.sx, s.z0, s.z1, s.d], i * 4));
    const fa = new Float64Array(20);
    L.faces.forEach((f, k) => fa.set([f.n[0], f.n[1], f.n[2], f.T[0], f.T[2]], k * 5));
    return {
      y0: D.y0, top: D.TOP, lim: C.hb + 16, iq: 1 / D.q, c: D.c, cq: D.c / D.q, dF: D.dFace, GZ: D.GZ, CW: D.CW, cc: D.cc,
      iqc: 1 / D.qc, qs: D.qs, iqs: 1 / D.qs, notchTop: D.notchTop, cornerD: C.cornerD, cap: C.cap, wallT: C.wallT,
      pilD: C.pilasterD, pilW: C.pilasterW, nfD: C.notchFinD, hb: C.hb, cz: L.cy, sz: L.sy,
      ox: L.origin[0], oy: L.origin[1], oz: L.origin[2],
      bx0: L._bounds.min[0], bx1: L._bounds.max[0], bz0: L._bounds.min[2], bz1: L._bounds.max[2], by1: L._bounds.max[1],
      ra: R.a, rb: R.b, rc: R.a + R.b - R.c,
      pe: port(L.portalsL[0]), px: port(L.portalsL[1]), nfins: nfa, faces: fa, slabs: [0, 1, 2, 3].map(slabRows)
    };
  }
  const SQ12 = Math.SQRT1_2;
  /* the mouth profile (Shaft.secF at loft weight 0: the rectangle with its chamfers) */
  function rectF(K, u, v) {
    const au = u < 0 ? -u : u, av = v < 0 ? -v : v;
    const a = au - K.ra, b = av - K.rb, c = (au + av - K.rc) * SQ12;
    return a > b ? (a > c ? a : c) : (b > c ? b : c);
  }
  const _c = { pen: 0, n0: 0, n1: 0, n2: 0, key: '' };
  /* the current point (local x, y, z, and h for the slabs): the hot
     functions are too big to inline, and a double passed to a call that is
     not inlined gets boxed, so they read it from here instead */
  const PT = new Float64Array(4);
  /* what a hull can reach, decided once per hull from its bounding sphere:
     faces (as exits or for their slabs), the roof, the notch, each portal,
     and per face the slabs (row offsets) it can touch */
  const _h = { f0: false, f1: false, f2: false, f3: false, top: false, notch: false, pe: false, px: false,
    sl: [new Int32Array(16), new Int32Array(16), new Int32Array(16), new Int32Array(16)], ns: new Int32Array(4) };
  function hullScope(K, x, y, z, rh) {
    const iq = K.iq, cyq = K.cq * y - K.dF, lo = -(K.cap + rh + 1), hi = K.cornerD + rh + 1;
    const d = [z * iq + cyq, x * iq + cyq, -z * iq + cyq, -x * iq + cyq];
    _h.f0 = d[0] > lo && d[0] < hi; _h.f1 = d[1] > lo && d[1] < hi; _h.f2 = d[2] > lo && d[2] < hi; _h.f3 = d[3] > lo && d[3] < hi;
    _h.top = y - K.top > lo;
    const cw = K.CW + K.cc * y, ax = x < 0 ? -x : x;
    _h.notch = y - rh < K.notchTop && (ax - cw - K.cc * rh) * K.iqc < K.cap + rh + 2 && z + rh > K.GZ - K.cap - 2;
    const pr = (P) => (x - P.ex) * P.ox + (z - P.ez) * P.oz + rh >= -(Math.max(40, P.skip) + 1);
    _h.pe = pr(K.pe); _h.px = pr(K.px);
    for (let k = 0; k < 4; k++) {
      const F = K.faces, o = k * 5, S = K.slabs[k], out = _h.sl[k];
      let n = 0;
      if (d[k] > -rh - 1 && d[k] < hi) {
        const u = x * F[o + 3] + z * F[o + 4], au = u < 0 ? -u : u, hy = K.hb - (y - K.y0) * K.c;
        for (let i = 0; i < S.length; i += 6) {
          if (y + rh < S[i + 4] || y - rh > S[i + 5]) continue;
          const kind = S[i];
          if (kind === 0 && Math.abs(u - S[i + 1]) > S[i + 2] / 2 + rh + 1) continue;
          if (kind === 1 && au < hy - S[i + 2] - rh - 2 * K.cornerD) continue;
          out[n++] = i;
        }
      }
      _h.ns[k] = n;
    }
  }
  function set(pen, n0, n1, n2, key) {
    if (pen < _c.pen) { _c.pen = pen; _c.n0 = n0; _c.n1 = n1; _c.n2 = n2; _c.key = key; }
  }
  /* reveal air: inside the prism, and (bounded) inside its outer plane */
  function revealAir(P, bounded) {
    const x = PT[0], y = PT[1], z = PT[2];
    const ex = x - P.ex, ey = y - P.ey, ez = z - P.ez;
    const t = ex * P.ox + ez * P.oz - P.plate, u = ex * P.nx + ez * P.nz;
    if (t < 0) return false;
    const w = P.sp * t;
    if ((u < 0 ? -u : u) > P.hw + w || (ey < 0 ? -ey : ey) > P.hh + w) return false;
    return !bounded || x * P.onx + y * P.ony + z * P.onz <= P.od;
  }
  /* a point in the frustum near one portal: in its reveal, its plate's
     hole, or the duct's wall band near the mouth (the shaft's business) */
  function portalAir(K, P) {
    const x = PT[0], y = PT[1], z = PT[2];
    const ex = x - P.ex, ey = y - P.ey, ez = z - P.ez;
    const a = ex * P.ox + ez * P.oz, t = a - P.plate, u = ex * P.nx + ez * P.nz;
    const au = u < 0 ? -u : u, av = ey < 0 ? -ey : ey;
    if (t >= 0) return au <= P.hw + P.sp * t && av <= P.hh + P.sp * t && x * P.onx + y * P.ony + z * P.onz <= P.od;
    if (a >= 0) return rectF(K, u, ey) < 0;
    if (-a <= P.skip && au < 80 && av < 70) return rectF(K, u, ey) < K.wallT;
    return false;
  }
  /* exits from the shell into a reveal or a plate's hole */
  function portalCand(K, P, key) {
    const x = PT[0], y = PT[1], z = PT[2];
    const ex = x - P.ex, ey = y - P.ey, ez = z - P.ez;
    const a = ex * P.ox + ez * P.oz;
    if (a < -40) return;
    const t = a - P.plate, u = ex * P.nx + ez * P.nz, iqs = K.iqs, sp = P.sp;
    const au = u < 0 ? -u : u, av = ey < 0 ? -ey : ey;
    const gu = (au - P.hw - sp * t) * iqs, gv = (av - P.hh - sp * t) * iqs, gt = -t;
    if (gt >= gu && gt >= gv) set(gt, P.ox, 0, P.oz, key);
    else if (gu >= gv) { const sg = u < 0 ? -1 : 1; set(gu, (-sg * P.nx + sp * P.ox) * iqs, 0, (-sg * P.nz + sp * P.oz) * iqs, key); }
    else { const sg = ey < 0 ? -1 : 1; set(gv, sp * P.ox * iqs, -sg * iqs, sp * P.oz * iqs, key); }
    if (a >= 0 && t < 0) {
      const F = rectF(K, u, ey);
      if (F > 0) {
        const g = globalThis.Shaft.secGrad(0, u, ey), gl = Math.hypot(g[0], g[1]) || 1;
        set(F / gl, -g[0] / gl * P.nx, -g[1] / gl, -g[0] / gl * P.nz, key);
      }
    }
  }
  /* one local point; fills _c and returns true if it is in contact */
  function pointLocal(K) {
    const x = PT[0], y = PT[1], z = PT[2];
    if (y < K.y0 || y > K.top + 1) return false;
    const lim = K.lim;
    if (x > lim || x < -lim || z > lim || z < -lim) return false;
    const iq = K.iq, cyq = K.cq * y - K.dF, H = _h, NEG = -1e9;
    /* a face out of the hull's scope is more than cap behind every point */
    const dS = H.f0 ? z * iq + cyq : NEG, dE = H.f1 ? x * iq + cyq : NEG, dN = H.f2 ? -z * iq + cyq : NEG, dW = H.f3 ? -x * iq + cyq : NEG;
    const dT = H.top ? y - K.top : NEG;
    let m = dS > dE ? dS : dE;
    if (dN > m) m = dN;
    if (dW > m) m = dW;
    if (dT > m) m = dT;
    const cw = K.CW + K.cc * y, ax = x < 0 ? -x : x;
    const inNotch = H.notch && z > K.GZ && ax < cw;
    _c.pen = Infinity;
    if (m > 0) {
      /* outside the frustum: slabs on the faces within reach */
      if (m > K.cornerD + 1 || dT > 0) return false;
      const cd = K.cornerD;
      if (dS > 0 && dS < cd && !inNotch) (PT[3] = dS, slabFace(K, 0));
      if (dE > 0 && dE < cd && (!H.px || !revealAir(K.px, false))) (PT[3] = dE, slabFace(K, 1));
      if (dN > 0 && dN < cd) (PT[3] = dN, slabFace(K, 2));
      if (dW > 0 && dW < cd) (PT[3] = dW, slabFace(K, 3));
      return _c.pen < Infinity;
    }
    if (inNotch) {
      /* notch air, but the fins on its walls and the gate's pilasters */
      if (y > K.notchTop) return false;
      const iqc = K.iqc, nf = K.nfins, cc = K.cc;
      for (let i = 0; i < nf.length; i += 4) {
        const sx = nf[i], z0 = nf[i + 1], z1 = nf[i + 2], d = nf[i + 3];
        const h = (cw - sx * x) * iqc;
        if (h >= d || z <= z0 || z >= z1) continue;
        const pO = d - h, pA = z - z0, pB = z1 - z;
        if (pO <= pA && pO <= pB) set(pO, -sx * iqc, cc * iqc, 0, 'pyrNotch');
        else if (pA < pB) set(pA, 0, 0, -1, 'pyrNotch'); else set(pB, 0, 0, 1, 'pyrNotch');
      }
      const pz = K.pilD - (z - K.GZ);
      if (pz > 0) {
        const sx = x < 0 ? -1 : 1, h = (cw - ax) * iqc;
        if (h < K.pilW) { const px = K.pilW - h; if (pz <= px) set(pz, 0, 0, 1, 'pyrGate'); else set(px, -sx * iqc, cc * iqc, 0, 'pyrGate'); }
      }
      return _c.pen < Infinity;
    }
    if ((H.pe && portalAir(K, K.pe)) || (H.px && portalAir(K, K.px))) return false;
    /* in the shell: the cheapest exit */
    const cq = K.cq;
    if (H.f0) set(-dS, 0, cq, iq, 'pyrS');
    if (H.f1) set(-dE, iq, cq, 0, 'pyrE');
    if (H.f2) set(-dN, 0, cq, -iq, 'pyrN');
    if (H.f3) set(-dW, -iq, cq, 0, 'pyrW');
    if (H.top) set(-dT, 0, 1, 0, 'pyrRoof');
    if (H.notch && y < K.notchTop) {
      const iqc = K.iqc, g1 = (x - cw) * iqc, g2 = (-x - cw) * iqc, g3 = K.GZ - z;
      if (g3 >= g1 && g3 >= g2) set(g3, 0, 0, 1, 'pyrGate');
      else if (g1 >= g2) set(g1, -iqc, K.cc * iqc, 0, 'pyrNotch');
      else set(g2, iqc, K.cc * iqc, 0, 'pyrNotch');
    }
    if (H.pe) portalCand(K, K.pe, 'pyrRevE');
    if (H.px) portalCand(K, K.px, 'pyrRevX');
    return _c.pen <= K.cap;
  }
  /* slabs on face k for a point h metres outside it */
  function slabFace(K, k) {
    const h = PT[3];
    const x = PT[0], y = PT[1], z = PT[2];
    const F = K.faces, o = k * 5, n0 = F[o], n1 = F[o + 1], n2 = F[o + 2], T0 = F[o + 3], T2 = F[o + 4];
    const u = x * T0 + z * T2, au = u < 0 ? -u : u, hy = K.hb - (y - h * n1 - K.y0) * K.c;
    const S = K.slabs[k], idx = _h.sl[k], ns = _h.ns[k];
    for (let j = 0; j < ns; j++) {
      const i = idx[j], kind = S[i], d = S[i + 3];
      if (h >= d || y < S[i + 4] || y > S[i + 5]) continue;
      const pO = d - h;
      if (kind === 0) {
        const du = u - S[i + 1], e = S[i + 2] / 2 - (du < 0 ? -du : du);
        if (e <= 0) continue;
        if (pO <= e) set(pO, n0, n1, n2, 'pyrFin');
        else { const sg = du < 0 ? -1 : 1; set(e, T0 * sg, 0, T2 * sg, 'pyrFin'); }
      } else if (kind === 1) {
        const e = au - (hy - S[i + 2]);
        if (e <= 0) continue;
        if (pO <= e) set(pO, n0, n1, n2, 'pyrFin');
        else { const sg = u < 0 ? 1 : -1; set(e, T0 * sg, 0, T2 * sg, 'pyrFin'); }
      } else set(pO, n0, n1, n2, 'pyrBand');
    }
  }

  /* Can a sphere (local centre x, y, z, radius rh) touch nothing? The
     hull-level gate: the whole hull outside the faces, in the open notch,
     in a reveal, or deep in the shell (the duct), each with rh to spare. */
  function hullFree(K, x, y, z, rh) {
    if (y + rh < K.y0 || y - rh > K.top + 1) return true;
    const iq = K.iq, cyq = K.cq * y - K.dF;
    const m = Math.max(z * iq + cyq, x * iq + cyq, -z * iq + cyq, -x * iq + cyq, y - K.top);
    if (m - rh > K.cornerD + 1) return true;
    const cw = K.CW + K.cc * y, ax = x < 0 ? -x : x;
    if (z - K.GZ > K.pilD + rh + 1 && (cw - ax - K.cc * rh) * K.iqc > K.nfD + rh + 1) return true;
    const qs = K.qs;
    for (let i = 0; i < 2; i++) {
      const P = i ? K.px : K.pe, ex = x - P.ex, ey = y - P.ey, ez = z - P.ez;
      const t = ex * P.ox + ez * P.oz - P.plate, u = ex * P.nx + ez * P.nz;
      if (t > rh && Math.abs(u) + rh * qs < P.hw + P.sp * (t - rh) && Math.abs(ey) + rh * qs < P.hh + P.sp * (t - rh) &&
        (i === 1 || z + rh < K.GZ + 40)) return true;
    }
    if (m + rh < -K.cap) {
      /* deep: free unless the notch or a reveal is near */
      if (y - rh < K.notchTop && Math.max(K.GZ - z, (ax - cw) * K.iqc) - rh - K.cc * rh <= K.cap) return false;
      for (let i = 0; i < 2; i++) {
        const P = i ? K.px : K.pe;
        if ((x - P.ex) * P.ox + (z - P.ez) * P.oz + rh >= -40) return false;
      }
      return true;
    }
    return false;
  }

  /* contacts(layout, pts, st): the face planes, notch, reveals, plates and
     slabs, in the record SixDOF.resolve takes ({ n, r, pen, key, vs, part }).
     With st ({ p, q }) the points are body points, as hkcore contactsBoxes
     takes them (r = q pts[i]); without st they are world points and r is
     taken from their centroid. The boxes (skirt, roof, crown, clutter) are
     not in here: boxesNear hands them to contactsBoxes. */
  const _rh = { pts: null, n: 0, r: 0 };
  function contacts(L, pts, st) {
    const out = [], K = L._k, n = pts.length;
    const lc = K.cz, ls = K.sz, ox = K.ox, oy = K.oy, oz = K.oz;
    let cx = 0, cy = 0, cz = 0, rh = 0;
    if (st) {
      cx = st.p[0]; cy = st.p[1]; cz = st.p[2];
      /* the hull radius, cached for the last point array seen (the game
         passes the same hull every substep) */
      if (pts === _rh.pts && n === _rh.n) rh = _rh.r;
      else { for (let i = 0; i < n; i++) rh = Math.max(rh, Math.hypot(pts[i][0], pts[i][1], pts[i][2])); _rh.pts = pts; _rh.n = n; _rh.r = rh; }
    } else {
      for (let i = 0; i < n; i++) { cx += pts[i][0]; cy += pts[i][1]; cz += pts[i][2]; }
      cx /= n; cy /= n; cz /= n;
      for (let i = 0; i < n; i++) rh = Math.max(rh, Math.hypot(pts[i][0] - cx, pts[i][1] - cy, pts[i][2] - cz));
    }
    if (cx < K.bx0 - rh || cx > K.bx1 + rh || cz < K.bz0 - rh || cz > K.bz1 + rh || cy > K.by1 + rh) return out;
    {
      const dx = cx - ox, dz = cz - oz;
      const lx = dx * lc - dz * ls, lz = dx * ls + dz * lc;
      if (hullFree(K, lx, cy - oy, lz, rh)) return out;
      hullScope(K, lx, cy - oy, lz, rh);
    }
    const q = st ? st.q : null;
    const q0 = q ? q[0] : 0, q1 = q ? q[1] : 0, q2 = q ? q[2] : 0, q3 = q ? q[3] : 0;
    for (let i = 0; i < n; i++) {
      const v = pts[i];
      let rx, ry, rz;
      if (q) {
        /* r = q v q* (q = [w, x, y, z]) */
        const tx = 2 * (q2 * v[2] - q3 * v[1]), ty = 2 * (q3 * v[0] - q1 * v[2]), tz = 2 * (q1 * v[1] - q2 * v[0]);
        rx = v[0] + q0 * tx + q2 * tz - q3 * ty; ry = v[1] + q0 * ty + q3 * tx - q1 * tz; rz = v[2] + q0 * tz + q1 * ty - q2 * tx;
      } else { rx = v[0] - cx; ry = v[1] - cy; rz = v[2] - cz; }
      const dx = cx + rx - ox, dz = cz + rz - oz;
      PT[0] = dx * lc - dz * ls; PT[1] = cy + ry - oy; PT[2] = dx * ls + dz * lc;
      if (!pointLocal(K)) continue;
      out.push({ n: [_c.n0 * lc + _c.n2 * ls, _c.n1, -_c.n0 * ls + _c.n2 * lc], r: [rx, ry, rz], pen: _c.pen, key: _c.key, vs: null, part: _c.key });
    }
    return out;
  }

  /* Free space at world point p for the camera clamp (hkcore cameraClamp
     takes probes that return it): a lower bound of the distance to the
     shell's surfaces, negative in the shell. Outside the faces it is the
     largest plane distance minus the deepest slab; in the notch the
     distance to its walls minus their fins and to the gate minus its
     pilasters; in a reveal the distance to its sides (and to the plate,
     unless the point is in front of the duct's opening). In the plate's
     hole and the duct's wall band near the mouths, and below the skirt top
     (the skirt is boxes), it returns 1e9: the shaft and the boxes decide
     there. In the shell: minus the depth of the cheapest exit. */
  function clearance(L, p) {
    const K = L._k, lc = K.cz, ls = K.sz, dx = p[0] - K.ox, dz = p[2] - K.oz;
    const x = dx * lc - dz * ls, y = p[1] - K.oy, z = dx * ls + dz * lc;
    if (y < K.y0) return 1e9;
    const iq = K.iq, cyq = K.cq * y - K.dF;
    const m = Math.max(z * iq + cyq, x * iq + cyq, -z * iq + cyq, -x * iq + cyq, y - K.top);
    if (m > 0) return m - K.cornerD;
    const cw = K.CW + K.cc * y, ax = x < 0 ? -x : x;
    if (z > K.GZ && ax < cw) return Math.min((cw - ax) * K.iqc - K.nfD, Math.max(z - K.GZ - K.pilD, (cw - ax) * K.iqc - K.pilW));
    for (let i = 0; i < 2; i++) {
      const P = i ? K.px : K.pe, ex = x - P.ex, ey = y - P.ey, ez = z - P.ez;
      const a = ex * P.ox + ez * P.oz, t = a - P.plate, u = ex * P.nx + ez * P.nz;
      const au = u < 0 ? -u : u, av = ey < 0 ? -ey : ey;
      if (t >= 0 && au <= P.hw + P.sp * t && av <= P.hh + P.sp * t && x * P.onx + y * P.ony + z * P.onz <= P.od) {
        const side = Math.min(P.hw + P.sp * t - au, P.hh + P.sp * t - av) * K.iqs;
        return rectF(K, u, ey) < 0 ? side : Math.min(side, t);
      }
      if (a < 0 && -a <= P.skip && au < 80 && av < 70 && rectF(K, u, ey) < K.wallT) return 1e9;
      if (a >= 0 && t < 0 && rectF(K, u, ey) < 0) return 1e9;
    }
    _h.f0 = _h.f1 = _h.f2 = _h.f3 = _h.top = _h.notch = _h.pe = _h.px = true;
    PT[0] = x; PT[1] = y; PT[2] = z;
    _c.pen = Infinity;
    const cq = K.cq, d = [z * iq + cyq, x * iq + cyq, -z * iq + cyq, -x * iq + cyq];
    set(-d[0], 0, cq, iq, ''); set(-d[1], iq, cq, 0, ''); set(-d[2], 0, cq, -iq, ''); set(-d[3], -iq, cq, 0, ''); set(K.top - y, 0, 1, 0, '');
    if (y < K.notchTop) set(Math.max((x - cw) * K.iqc, (-x - cw) * K.iqc, K.GZ - z), 0, 0, 0, '');
    portalCand(K, K.pe, ''); portalCand(K, K.px, '');
    return -_c.pen;
  }

  /* Boxes within r of world point p, in the shape contactsBoxes takes. */
  function boxesNear(L, p, r) {
    const out = [], g = L._grid, b = L._bounds;
    if (p[0] < b.min[0] - r || p[0] > b.max[0] + r || p[2] < b.min[2] - r || p[2] > b.max[2] + r || p[1] > b.max[1] + r) return out;
    const i0 = Math.max(0, Math.floor((p[0] - r - g.x0) / g.G)), i1 = Math.min(g.n - 1, Math.floor((p[0] + r - g.x0) / g.G));
    const k0 = Math.max(0, Math.floor((p[2] - r - g.z0) / g.G)), k1 = Math.min(g.n - 1, Math.floor((p[2] + r - g.z0) / g.G));
    const tick = ++g.tick;
    for (let k = k0; k <= k1; k++) for (let j = i0; j <= i1; j++) {
      const c = g.cells[k * g.n + j];
      for (let m = 0; m < c.length; m++) {
        const id = c[m];
        if (g.stamp[id] === tick) continue;
        g.stamp[id] = tick;
        if (boxDist(L.boxes[id], p) <= r) out.push(L.boxes[id]);
      }
    }
    return out;
  }

  function bounds(L) { return L._bounds; }
  /* inside the building's bounding volume grown by margin */
  function inside(L, p, margin) {
    const m = margin || 0, b = L._bounds;
    return p[0] >= b.min[0] - m && p[0] <= b.max[0] + m && p[1] >= b.min[1] - m && p[1] <= b.max[1] + m && p[2] >= b.min[2] - m && p[2] <= b.max[2] + m;
  }

  /* Portals in the Menger shape: { id, p, n, w, h, right, up, depth, kind,
     biome, c, rim }. p is where the duct axis crosses the outer plane (gate
     or east face), n the outward normal of the opening (along the axis), w x h
     the opening at the plate (140 x 112; the reveal only widens outward, so a
     gate of that size at p is free air), depth the straight free run behind
     the opening, c the centre of the outer rim, rim its corners. */
  function portals(L) {
    const sh = L.duct, fans = sh.fans;
    const firstFan = Math.min.apply(null, fans.map((f) => f.s)), lastFan = Math.max.apply(null, fans.map((f) => f.s));
    return L.portalsL.map((P) => {
      const ent = P.id === 'entry';
      const n = dirWorld(L, P.o), din = [-n[0], -n[1], -n[2]];
      const c = P.rim.reduce((a, q) => [a[0] + q[0] / 4, a[1] + q[1] / 4, a[2] + q[2] / 4], [0, 0, 0]);
      return {
        id: P.id, p: toWorld(L, P.axisOut), n: n, w: L.cfg.PW, h: L.cfg.PH, right: cross(din, [0, 1, 0]), up: [0, 1, 0],
        depth: P.depthOut + (ent ? Math.min(firstFan, L.bend.s0) : sh.length - Math.max(lastFan, L.bend.s1)),
        kind: 'portal', biome: 'pyramid', c: toWorld(L, c), rim: P.rim.map((q) => toWorld(L, q))
      };
    });
  }

  /* The route through the building: approach (lead metres before the gate,
     on the axis, outside the face), the entry portal (gate plane), the duct's
     rings and fan passes (Shaft.flythrough: no ring within 60 m of a fan or a
     mouth), the exit portal (east face), leave (leave metres beyond it, on
     the axis). Returns { waypoints, points, entry, exit, exitDir, length },
     waypoints[i] = { p, dir, up, kind, s, portal, fan } with s the duct arc
     length (negative before the mouth, beyond length after it). */
  function flythrough(L, opts) {
    const S = needShaft(), C = L.cfg, sh = L.duct, o = opts || {};
    const lead = o.lead == null ? C.lead : o.lead, leave = o.leave == null ? C.leave : o.leave;
    const ft = S.flythrough(sh, { lead: 0, ringR: o.ringR });
    const pI = L.portalsL[0], pX = L.portalsL[1];
    const sIn = -pI.depthOut, sOut = sh.length + pX.depthOut;
    const pts = [{ s: sIn - lead, kind: 'approach' }, { s: sIn, kind: 'portal', portal: 'entry' }];
    for (const w of ft.waypoints) if (w.kind === 'ring' || w.kind === 'fan') pts.push({ s: w.s, x: w.x, y: w.y, kind: w.kind, fan: w.fan });
    pts.push({ s: sOut, kind: 'portal', portal: 'exit' }, { s: sOut + leave, kind: 'leave' });
    const wps = pts.map((q) => {
      const f = S.frameAt(sh, q.s), x = q.x || 0, y = q.y || 0;
      return { p: [f.p[0] + f.N[0] * x, f.p[1] + y, f.p[2] + f.N[2] * x], dir: f.T.slice(), up: [0, 1, 0],
        kind: q.kind, s: q.s, portal: q.portal || null, fan: q.fan == null ? null : q.fan };
    });
    let length = 0;
    for (let i = 1; i < wps.length; i++) length += Math.hypot(wps[i].p[0] - wps[i - 1].p[0], wps[i].p[1] - wps[i - 1].p[1], wps[i].p[2] - wps[i - 1].p[2]);
    return { waypoints: wps, points: wps.map((w) => w.p), entry: 'entry', exit: 'exit', exitDir: L.exitDir.slice(), length: length };
  }

  /* =====================================================================
     Visual layer. THREE is a parameter.
     ===================================================================== */
  function boneStops() {
    const CR = globalThis.ColorRamps, r = CR && CR.rampById('bone');
    if (!r || r.id !== 'bone') throw new Error('HikyakuPyramid.build needs ColorRamps: load /assets/js/colorramps.js first');
    return r.stops;
  }
  function toLin(c) { return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
  function hexLin(hex, g) { return [toLin(((hex >> 16) & 255) / 255) * g, toLin(((hex >> 8) & 255) / 255) * g, toLin((hex & 255) / 255) * g]; }

  /* Triangle soup in the city's facade convention (hikyaku-city.js
     boxArrays and FACADE_FRAG): position, normal, color (linear bone),
     aSeed (per building), aFac = (u, W, top, code): u metres from the
     panel's left edge, W its width, top the height the cornice storey
     hangs from, code the facade program (0 curtain, 1 residential, 2
     industrial, 3 landmark, 4 plain). Storeys come from world y, bays from
     u, so windows follow the slope with level floors (the shader takes
     any face with |n.y| < 0.6 as a wall; the 62 degree faces have 0.47). */
  function Soup() { this.P = []; this.N = []; this.C = []; this.S = []; this.F = []; }
  Soup.prototype.tri = function (a, b, c, n, col, seed, ua, ub, uc, W, top, code) {
    const g = cross([b[0] - a[0], b[1] - a[1], b[2] - a[2]], [c[0] - a[0], c[1] - a[1], c[2] - a[2]]);
    let V = [[a, ua], [b, ub], [c, uc]];
    if (dot(g, n) < 0) V = [V[0], V[2], V[1]];
    for (const [p, u] of V) {
      this.P.push(p[0], p[1], p[2]); this.N.push(n[0], n[1], n[2]); this.C.push(col[0], col[1], col[2]);
      this.S.push(seed); this.F.push(u, W, top, code);
    }
  };
  Soup.prototype.quad = function (a, b, c, d, n, col, seed, us, W, top, code) {
    this.tri(a, b, c, n, col, seed, us[0], us[1], us[2], W, top, code);
    this.tri(a, c, d, n, col, seed, us[0], us[2], us[3], W, top, code);
  };
  Soup.prototype.box = function (lo, hi, col, seed, code, toW, dirW) {
    const F6 = [[0, 1], [0, -1], [1, 1], [1, -1], [2, 1], [2, -1]];
    for (const [ax, sg] of F6) {
      if (ax === 1 && sg < 0 && lo[1] < 0.05) continue;
      const a1 = (ax + 1) % 3, a2 = (ax + 2) % 3;
      const P = [[0, 0], [1, 0], [1, 1], [0, 1]].map(([i, j]) => {
        const p = [0, 0, 0];
        p[ax] = sg > 0 ? hi[ax] : lo[ax]; p[a1] = i ? hi[a1] : lo[a1]; p[a2] = j ? hi[a2] : lo[a2];
        return toW(p);
      });
      const nl = [0, 0, 0]; nl[ax] = sg;
      const n = dirW(nl);
      /* u along the face's horizontal edge */
      const ta = ax === 1 ? -1 : (a1 === 1 ? a2 : a1);
      const us = [[0, 0], [1, 0], [1, 1], [0, 1]].map(([i, j]) => ta < 0 ? 0 : ((ta === a1 ? i : j) ? hi[ta] - lo[ta] : 0));
      const W = ta < 0 ? 0 : hi[ta] - lo[ta];
      this.quad(P[0], P[1], P[2], P[3], n, col, seed, us, W, hi[1], code);
    }
  };
  Soup.prototype.count = function () { return this.P.length / 9; };
  Soup.prototype.geometry = function (THREE) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.P, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.N, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.C, 3));
    g.setAttribute('aSeed', new THREE.Float32BufferAttribute(this.S, 1));
    g.setAttribute('aFac', new THREE.Float32BufferAttribute(this.F, 4));
    g.computeBoundingSphere();
    return g;
  };

  /* A planar face in local coordinates: P(u, y, d) = nh * off(y) + T u + up y
     + n d, u limits uMin(y), uMax(y), holes [{ ya, yb, uL(y), uR(y) }]. The
     filling cuts it in trapezoid strips at every hole corner; inside a strip
     the spans minus the holes become quads (or prisms when d1 > d0). Hole
     edges are straight in (u, y), so the cut is exact. */
  function spans(f, y, lo, hi) {
    let s = [[lo, hi]];
    for (const h of f.holes) {
      if (y < h.ya - 1e-6 || y > h.yb + 1e-6) continue;
      const a = h.uL(y), b = h.uR(y), next = [];
      for (const [p, q] of s) {
        if (b <= p || a >= q) { next.push([p, q]); continue; }
        if (a > p) next.push([p, a]);
        if (b < q) next.push([b, q]);
      }
      s = next;
    }
    return s.filter(([p, q]) => q - p > 0.05);
  }
  function fill(emit, f, ya, yb, o) {
    o = o || {};
    const ys = [ya, yb];
    for (const h of f.holes) for (const y of [h.ya, h.yb]) if (y > ya && y < yb) ys.push(y);
    ys.sort((a, b) => a - b);
    const lim = (y) => [o.u0 == null ? f.uMin(y) : Math.max(o.u0, f.uMin(y)), o.u1 == null ? f.uMax(y) : Math.min(o.u1, f.uMax(y))];
    for (let i = 0; i + 1 < ys.length; i++) {
      const y0 = ys[i], y1 = ys[i + 1], e = 1e-3;
      if (y1 - y0 < 1e-3) continue;
      const s0 = spans(f, y0 + e, ...lim(y0 + e)), s1 = spans(f, y1 - e, ...lim(y1 - e));
      if (s0.length !== s1.length) continue;
      for (let k = 0; k < s0.length; k++) {
        /* the edges are linear in y: extrapolate from just inside to the strip ends */
        const ext = (a0, a1) => [a0 + (a0 - a1) * e / (y1 - y0 - 2 * e), a1 + (a1 - a0) * e / (y1 - y0 - 2 * e)];
        const [a0, a1] = ext(s0[k][0], s1[k][0]), [b0, b1] = ext(s0[k][1], s1[k][1]);
        emit(a0, b0, b1, a1, y0, y1);
      }
    }
  }

  function build(THREE, L, opts) {
    opts = opts || {};
    const S = needShaft();
    const stops = boneStops();
    const bone = (t, g) => {
      t = Math.min(1, Math.max(0, t)) * (stops.length - 1);
      const i = Math.min(stops.length - 2, Math.floor(t)), f = t - i, a = stops[i], b = stops[i + 1], k = g == null ? 1 : g;
      return [toLin(a[0] + (b[0] - a[0]) * f) * k, toLin(a[1] + (b[1] - a[1]) * f) * k, toLin(a[2] + (b[2] - a[2]) * f) * k];
    };
    const C = L.cfg, D = L.dims, fog = opts.fog || null;
    const warm = opts.warm == null ? WARM : opts.warm, accent = opts.accent == null ? ACCENT : opts.accent;
    const rng = mulberry32(L.seed ^ 0x2b0f11);
    const owned = [];
    const toW = (p) => toWorld(L, p), dW = (d) => dirWorld(L, d);
    const soup = new Soup();
    const glow = new Soup();
    const halos = [];
    const glowBox = (lo, hi, col) => glow.box(lo, hi, col, 0, 4, toW, dW);
    const glowQuad = (a, b, c, d, n, col) => glow.quad(toW(a), toW(b), toW(c), toW(d), dW(n), col, 0, [0, 0, 0, 0], 0, 0, 4);
    const warmC = hexLin(warm, 2.2), sodC = hexLin(warm, 1.3), cyanC = hexLin(accent, 2.0);
    const { hb, c, y0, TOP, GZ, notchTop: NT } = D;
    const half = D.half, cw = D.cw, TH = D.topHalf;

    /* ---- the four faces ---- */
    const mkFace = (k) => {
      const F = L.faces[k], nh = F.nh, T = F.T, n = F.n;
      const P = (u, y, d) => {
        const off = half(y);
        return [nh[0] * off + T[0] * u + n[0] * (d || 0), y + n[1] * (d || 0), nh[2] * off + T[2] * u + n[2] * (d || 0)];
      };
      const holes = L.holes[F.id].map((h) => h.notch
        ? { ya: h.ya, yb: h.yb, uL: (y) => -cw(y), uR: (y) => cw(y) }
        : { ya: h.ya, yb: h.yb, uL: (y) => h.uL[0] + (h.uL[1] - h.uL[0]) * (y - h.ya) / (h.yb - h.ya), uR: (y) => h.uR[0] + (h.uR[1] - h.uR[0]) * (y - h.ya) / (h.yb - h.ya) });
      return { k: k, n: n, T: T, P: P, holes: holes, uMin: (y) => -half(y), uMax: (y) => half(y) };
    };
    const faces = [0, 1, 2, 3].map(mkFace);
    /* quads and prisms on a face */
    const emitter = (f, col, seed, code, d0, d1, uRef, W, top) => (a0, b0, b1, a1, ya, yb) => {
      const P = f.P;
      const us = (a, b) => [a - uRef(ya), b - uRef(ya), b - uRef(ya), a - uRef(ya)];
      if (d1 - d0 < 0.01) {
        soup.quad(toW(P(a0, ya, d1)), toW(P(b0, ya, d1)), toW(P(b1, yb, d1)), toW(P(a1, yb, d1)), dW(f.n), col, seed,
          [a0 - uRef(ya), b0 - uRef(ya), b1 - uRef(ya), a1 - uRef(ya)], W, top, code);
        return;
      }
      /* prism: front, two sides, top and bottom (the back is hidden) */
      const Q = (u, y, d) => toW(P(u, y, d));
      soup.quad(Q(a0, ya, d1), Q(b0, ya, d1), Q(b1, yb, d1), Q(a1, yb, d1), dW(f.n), col, seed, us(a0, b0), W, top, code);
      const side = (u0, u1, sg) => {
        const e = [f.T[0] * sg, 0, f.T[2] * sg];
        soup.quad(Q(u0, ya, d0), Q(u0, ya, d1), Q(u1, yb, d1), Q(u1, yb, d0), dW(e), col, seed, [0, d1 - d0, d1 - d0, 0], d1 - d0, top, code);
      };
      side(a0, a1, -1); side(b0, b1, 1);
      soup.quad(Q(a1, yb, d0), Q(b1, yb, d0), Q(b1, yb, d1), Q(a1, yb, d1), dW([0, 1, 0]), col, seed, [0, b1 - a1, b1 - a1, 0], b1 - a1, top, 4);
      soup.quad(Q(a0, ya, d0), Q(b0, ya, d0), Q(b0, ya, d1), Q(a0, ya, d1), dW([0, -1, 0]), col, seed, [0, b0 - a0, b0 - a0, 0], b0 - a0, top, 4);
    };
    const bandY = [y0, ...C.bands.map((b) => y0 + b * (TOP - y0)), TOP];
    const colU = [-1e4, ...C.fins.map((f) => f * TH), 1e4];
    for (const f of faces) {
      /* window fields between fins and bands: one panel, one seed */
      for (let i = 0; i + 1 < bandY.length; i++) for (let j = 0; j + 1 < colU.length; j++) {
        const seed = rng(), prog = rng() < 0.7 ? 3 : 0, tone = 0.4 + rng() * 0.12;
        const ya = bandY[i], yb = bandY[i + 1];
        const u0 = Math.max(colU[j], -half(ya)), u1 = Math.min(colU[j + 1], half(ya));
        fill(emitter(f, bone(tone), seed, prog, 0, 0, (y) => Math.max(colU[j], -half(y)), u1 - u0, yb), f, ya, yb, { u0: colU[j], u1: colU[j + 1] });
      }
      /* fins, corner fins, bands: plain, lighter */
      for (const s of L.slabs) {
        if (s.face !== f.k) continue;
        const col = bone(s.kind === 'band' ? (s.lit ? 0.78 : 0.22) : 0.62), seed = rng();
        if (s.kind === 'fin') fill(emitter(f, col, seed, 4, 0, s.d, () => s.u - s.w / 2, s.w, TOP), f, s.y0, s.y1, { u0: s.u - s.w / 2, u1: s.u + s.w / 2 });
        else if (s.kind === 'corner') {
          for (const sg of [-1, 1]) {
            const cf = Object.assign({}, f, sg < 0 ? { uMax: (y) => -half(y) + s.w } : { uMin: (y) => half(y) - s.w });
            fill(emitter(cf, col, seed, 4, 0, s.d, (y) => cf.uMin(y), s.w, TOP), cf, s.y0, s.y1);
          }
        } else {
          fill(emitter(f, col, seed, 4, 0, s.d, (y) => -half(y), 2 * half(s.y0), s.y1), f, s.y0, s.y1);
          if (s.lit) {
            /* a light line along the lit band */
            const yl = (s.y0 + s.y1) / 2;
            for (const [a, b] of spans(f, yl, -half(yl), half(yl))) {
              const A0 = f.P(a, yl - 1.6, s.d + 0.15), B0 = f.P(b, yl - 1.6, s.d + 0.15), B1 = f.P(b, yl + 1.6, s.d + 0.15), A1 = f.P(a, yl + 1.6, s.d + 0.15);
              glowQuad(A0, B0, B1, A1, f.n, sodC);
            }
          }
        }
      }
    }

    /* ---- the notch: splayed walls, the gate wall, their fins ---- */
    const qc = D.qc, zEnd = (y) => (y < y0 ? D.skirtHalf : half(y));
    for (const sx of [-1, 1]) {
      const n = [-sx / qc, C.cc / qc, 0];
      const f = { n: n, T: [0, 0, 1], holes: [], uMin: () => GZ, uMax: zEnd, P: (u, y, d) => [sx * cw(y) + n[0] * (d || 0), y + n[1] * (d || 0), u + n[2] * (d || 0)] };
      const seed = rng();
      for (const [ya, yb] of [[0, y0], [y0, NT]]) fill(emitter(f, bone(0.5), seed, 1, 0, 0, () => GZ, D.skirtHalf - GZ, NT), f, ya, yb);
      for (const s of L.notchSlabs) if (s.kind === 'nfin' && s.sx === sx) fill(emitter(f, bone(0.62), rng(), 4, 0, s.d, () => s.z0, s.z1 - s.z0, NT), f, 0, NT, { u0: s.z0, u1: s.z1 });
      /* warm light strips along the notch walls, so the notch reads at portal distance */
      for (let y = 30; y < NT - 10; y += 46) {
        const z1 = zEnd(y) - 4;
        if (z1 - GZ < 30) continue;
        glowQuad(f.P(GZ + 4, y - 0.8, 1), f.P(z1, y - 0.8, 1), f.P(z1, y + 0.8, 1), f.P(GZ + 4, y + 0.8, 1), n, sodC);
      }
    }
    {
      const gh = L.holes.gate[0];
      const f = { n: [0, 0, 1], T: [1, 0, 0], uMin: (y) => -cw(y), uMax: (y) => cw(y), P: (u, y, d) => [u, y, GZ + (d || 0)],
        holes: [{ ya: gh.ya, yb: gh.yb, uL: (y) => gh.uL[0] + (gh.uL[1] - gh.uL[0]) * (y - gh.ya) / (gh.yb - gh.ya), uR: (y) => gh.uR[0] + (gh.uR[1] - gh.uR[0]) * (y - gh.ya) / (gh.yb - gh.ya) }] };
      fill(emitter(f, bone(0.45), rng(), 2, 0, 0, (y) => -cw(y), 2 * cw(0), NT), f, 0, NT);
      for (const s of L.notchSlabs) if (s.kind === 'pilaster') {
        const pf = Object.assign({}, f, s.sx < 0 ? { uMax: (y) => -cw(y) + s.w } : { uMin: (y) => cw(y) - s.w });
        fill(emitter(pf, bone(0.62), rng(), 4, 0, s.d, (y) => pf.uMin(y), s.w, NT), pf, 0, NT);
      }
    }

    /* ---- portals: splayed reveal, plate with the duct's hole, gold rims, sill dots ---- */
    for (const P of L.portalsL) {
      const E = P.E, o = P.o, N = P.N, up = [0, 1, 0];
      const at = (u, v, a) => [E[0] + N[0] * u + o[0] * a, E[1] + v, E[2] + N[2] * u + o[2] * a];
      const inner = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => at(a * P.hw, b * P.hh, P.plate));
      const col = bone(0.32), seed = rng();
      for (let k = 0; k < 4; k++) {
        const a = inner[k], b = inner[(k + 1) % 4], cc2 = P.rim[(k + 1) % 4], d = P.rim[k];
        const mid = [(a[0] + b[0]) / 2 - E[0], (a[1] + b[1]) / 2 - E[1], (a[2] + b[2]) / 2 - E[2]];
        const lat = norm([mid[0] - o[0] * dot(mid, o), mid[1], mid[2] - o[2] * dot(mid, o)]);
        const nIn = norm(cross([b[0] - a[0], b[1] - a[1], b[2] - a[2]], [d[0] - a[0], d[1] - a[1], d[2] - a[2]]));
        const nn = dot(nIn, lat) > 0 ? [-nIn[0], -nIn[1], -nIn[2]] : nIn;
        soup.quad(toW(a), toW(b), toW(cc2), toW(d), dW(nn), col, seed, [0, 0, 0, 0], 0, 0, 4);
      }
      /* the plate: the opening minus the duct profile */
      const shp = new THREE.Shape([new THREE.Vector2(-P.hw, -P.hh), new THREE.Vector2(P.hw, -P.hh), new THREE.Vector2(P.hw, P.hh), new THREE.Vector2(-P.hw, P.hh)]);
      const R = S.RECT, cP = [[R.a - R.c, R.b], [-(R.a - R.c), R.b], [-R.a, R.b - R.c], [-R.a, -(R.b - R.c)], [-(R.a - R.c), -R.b], [R.a - R.c, -R.b], [R.a, -(R.b - R.c)], [R.a, R.b - R.c]];
      shp.holes.push(new THREE.Path(cP.map((p) => new THREE.Vector2(p[0], p[1]))));
      const sg = new THREE.ShapeGeometry(shp), pa = sg.getAttribute('position'), ix = sg.index;
      for (let t = 0; t < ix.count; t += 3) {
        const v = [0, 1, 2].map((e) => { const id = ix.getX(t + e); return toW(at(pa.getX(id), pa.getY(id), P.plate)); });
        soup.tri(v[0], v[1], v[2], dW(o), bone(0.28), seed, 0, 0, 0, 0, 0, 4);
      }
      sg.dispose();
      /* gold rims: the outer edge and the inner end */
      const rod = (A, B, r) => {
        const d = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], l = Math.hypot(d[0], d[1], d[2]);
        const t = [d[0] / l, d[1] / l, d[2] / l];
        let e1 = Math.abs(t[1]) < 0.9 ? norm(cross(t, up)) : norm(cross(t, [1, 0, 0]));
        const e2 = cross(t, e1);
        for (let k = 0; k < 4; k++) {
          const a0 = k * Math.PI / 2 + Math.PI / 4, a1 = a0 + Math.PI / 2;
          const o0 = sa(sa([0, 0, 0], e1, Math.cos(a0) * r), e2, Math.sin(a0) * r), o1 = sa(sa([0, 0, 0], e1, Math.cos(a1) * r), e2, Math.sin(a1) * r);
          const nm = norm([o0[0] + o1[0], o0[1] + o1[1], o0[2] + o1[2]]);
          glowQuad(sa(A, o0, 1), sa(A, o1, 1), sa(B, o1, 1), sa(B, o0, 1), nm, warmC);
        }
      };
      for (let k = 0; k < 4; k++) {
        rod(P.rim[k], P.rim[(k + 1) % 4], 0.9);
        rod(sa(inner[k], o, 0.8), sa(inner[(k + 1) % 4], o, 0.8), 0.6);
      }
      /* landing dots down the bottom panel (the sill) */
      for (let f = 0.08; f < 1; f += 0.1) for (const xq of [-0.8, -0.3, 0.3, 0.8]) {
        const a = inner[0].map((v, i) => v + (inner[1][i] - v) * (xq + 1) / 2), b = P.rim[0].map((v, i) => v + (P.rim[1][i] - v) * (xq + 1) / 2);
        const p = a.map((v, i) => v + (b[i] - v) * f);
        glowBox([p[0] - 0.6, p[1] + 0.05, p[2] - 0.6], [p[0] + 0.6, p[1] + 0.5, p[2] + 0.6], warmC);
      }
      const cR = P.rim.reduce((a, q) => [a[0] + q[0] / 4, a[1] + q[1] / 4, a[2] + q[2] / 4], [0, 0, 0]);
      halos.push([toW(cR), 2 * P.hw * 1.6, 2 * P.hh * 1.6, hexLin(warm, 0.05)]);
    }

    /* ---- boxes (skirt, roof, crown, clutter) in the same soup ---- */
    for (const b of L.boxesL) soup.box(b.lo, b.hi, bone(b.tone), b.seed, b.prog, toW, dW);
    /* crown: louvre slats (drawn only), sodium rim, cyan line at its foot, the plume */
    {
      const cH = L.crown.half, cy = L.crown.h;
      for (let y = TOP + 4; y < TOP + cy - 3; y += 4.2) {
        const col = bone(0.66), s = rng();
        soup.box([-cH, y, cH + 1], [cH, y + 1.6, cH + 2.2], col, s, 4, toW, dW);
        soup.box([-cH, y, -cH - 2.2], [cH, y + 1.6, -cH - 1], col, s, 4, toW, dW);
        soup.box([cH + 1, y, -cH], [cH + 2.2, y + 1.6, cH], col, s, 4, toW, dW);
        soup.box([-cH - 2.2, y, -cH], [-cH - 1, y + 1.6, cH], col, s, 4, toW, dW);
      }
      const E4 = [[-cH, -cH], [cH, -cH], [cH, cH], [-cH, cH]];
      for (let k = 0; k < 4; k++) {
        const a = E4[k], b = E4[(k + 1) % 4], lo = (u, v) => Math.min(u, v), hi = (u, v) => Math.max(u, v);
        glowBox([lo(a[0], b[0]) - 1.2, TOP + cy + 6, lo(a[1], b[1]) - 1.2], [hi(a[0], b[0]) + 1.2, TOP + cy + 8.4, hi(a[1], b[1]) + 1.2], sodC);
        glowBox([lo(a[0], b[0]) * 1.03 - 0.7, TOP + 1, lo(a[1], b[1]) * 1.03 - 0.7], [hi(a[0], b[0]) * 1.03 + 0.7, TOP + 2.4, hi(a[1], b[1]) * 1.03 + 0.7], cyanC);
      }
      for (let k = 0; k < 18; k++) {
        halos.push([toW([(rng() - 0.5) * cH * 1.2, TOP + 30 + k * 26, (rng() - 0.5) * cH * 1.2]), 110 + k * 18, 110 + k * 18, bone(0.85, 0.07 - k * 0.0028)]);
      }
      halos.push([toW([0, TOP + 20, 0]), cH * 2.6, cH * 1.4, hexLin(warm, 0.12)]);
    }
    /* notch floodlight */
    for (let y = 30; y < NT; y += 55) halos.push([toW([0, y, GZ + 50]), 110, 110, hexLin(warm, 0.02)]);

    /* ---- materials and meshes ---- */
    const group = new THREE.Group();
    group.name = 'pyramid';
    let facadeMat = opts.facadeMaterial || null;
    if (!facadeMat) {
      facadeMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0.15 });
      if (fog) fog.patch(facadeMat);
      owned.push(facadeMat);
    }
    const shell = new THREE.Mesh(soup.geometry(THREE), facadeMat);
    shell.name = 'pyramid-shell';
    group.add(shell);
    const glowMat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
    if (fog) fog.patch(glowMat, { fogK: 0.5 });
    owned.push(glowMat);
    const glowMesh = new THREE.Mesh(glow.geometry(THREE), glowMat);
    glowMesh.name = 'pyramid-glow';
    group.add(glowMesh);

    /* detail layer: one instanced mesh per kind, boxes in face-local frames */
    const kinds = {};
    for (const dt of L.details) (kinds[dt.kind] = kinds[dt.kind] || []).push(dt);
    const detailMat = new THREE.MeshStandardMaterial({ color: new THREE.Color().fromArray(bone(0.6)), roughness: 0.8, metalness: 0.1 });
    if (fog) fog.patch(detailMat);
    owned.push(detailMat);
    const unit = new THREE.BoxGeometry(1, 1, 1);
    const m4 = new THREE.Matrix4(), m4b = new THREE.Matrix4();
    for (const kind of Object.keys(kinds)) {
      const list = kinds[kind];
      const im = new THREE.InstancedMesh(unit, detailMat, list.length);
      im.name = 'pyramid-detail-' + kind;
      list.forEach((dt, i) => {
        const f = faces[dt.face], T = dW(f.T), n = dW(f.n), B = cross(n, T);
        const p = toW(f.P(dt.u, dt.y, dt.d / 2));
        m4.makeBasis(new THREE.Vector3().fromArray(T), new THREE.Vector3().fromArray(B), new THREE.Vector3().fromArray(n));
        m4b.makeScale(dt.w, dt.h, dt.d);
        m4.multiply(m4b).setPosition(p[0], p[1], p[2]);
        im.setMatrixAt(i, m4);
      });
      im.computeBoundingSphere();
      group.add(im);
    }

    /* halos: additive soft discs (portal glow, crown plume, notch flood) */
    const quad = new THREE.PlaneGeometry(1, 1);
    const hg = new THREE.InstancedBufferGeometry();
    hg.index = quad.index; hg.setAttribute('position', quad.getAttribute('position')); hg.setAttribute('uv', quad.getAttribute('uv'));
    const HP = [], HS = [], HC = [];
    for (const h of halos) { HP.push(h[0][0], h[0][1], h[0][2]); HS.push(h[1], h[2]); HC.push(h[3][0], h[3][1], h[3][2]); }
    hg.setAttribute('iPos', new THREE.InstancedBufferAttribute(new Float32Array(HP), 3));
    hg.setAttribute('iSize', new THREE.InstancedBufferAttribute(new Float32Array(HS), 2));
    hg.setAttribute('iCol', new THREE.InstancedBufferAttribute(new Float32Array(HC), 3));
    hg.instanceCount = halos.length;
    const haloMat = new THREE.ShaderMaterial({
      uniforms: { uFogK: { value: 0.45 } },
      vertexShader: '/*CG_FOG*/\nuniform float uFogK;\nattribute vec3 iPos; attribute vec2 iSize; attribute vec3 iCol;\nvarying vec2 vUv; varying vec3 vCol;\n' +
        'void main(){\n  vec4 mv = modelViewMatrix * vec4(iPos, 1.0);\n  mv.xy += position.xy * iSize;\n  vUv = uv;\n' +
        '#ifdef PY_CG\n  vec3 wp = (modelMatrix * vec4(iPos, 1.0)).xyz;\n  vCol = iCol * (1.0 - cgFogAmt(wp, uFogK));\n#else\n  vCol = iCol;\n#endif\n' +
        '  gl_Position = projectionMatrix * mv;\n}',
      fragmentShader: 'varying vec2 vUv; varying vec3 vCol;\nvoid main(){\n  float r = length(vUv - 0.5) * 2.0;\n  float a = exp(-r * r * 3.5) * clamp(1.0 - r, 0.0, 1.0);\n  gl_FragColor = vec4(vCol * a, 1.0);\n}',
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false
    });
    if (fog) { haloMat.defines = { PY_CG: '' }; fog.inject(haloMat); }
    owned.push(haloMat);
    const haloMesh = new THREE.Mesh(hg, haloMat);
    haloMesh.name = 'pyramid-halos';
    haloMesh.frustumCulled = false;
    group.add(haloMesh);

    /* the duct */
    const duct = S.build(THREE, L.duct, { fog: fog, paths: opts.paths || [], accent: accent, warm: warm, inScale: opts.inScale, med: opts.med, lampGain: opts.lampGain });
    group.add(duct.group);

    /* fans turn only near the pilot */
    const fanR = opts.fanRange == null ? 1500 : opts.fanRange;
    const fc = S.frameAt(L.duct, L.duct.length / 2).p;
    const update = function (t, cameraPos) {
      if (cameraPos) {
        const dx = cameraPos[0] - fc[0], dy = cameraPos[1] - fc[1], dz = cameraPos[2] - fc[2];
        if (dx * dx + dy * dy + dz * dz > fanR * fanR) return false;
      }
      duct.update(t);
      return true;
    };
    update(0);
    let tris = 0;
    group.traverse((o) => {
      if (!o.isMesh) return;
      const g = o.geometry, per = (g.index ? g.index.count : g.getAttribute('position').count) / 3;
      tris += per * (o.isInstancedMesh ? o.count : g.isInstancedBufferGeometry ? g.instanceCount : 1);
    });
    return {
      group: group, duct: duct, update: update,
      stats: { tris: Math.round(tris), shellTris: soup.count(), glowTris: glow.count(), halos: halos.length, details: L.details.length, boxes: L.boxesL.length, duct: duct.stats },
      dispose: function () {
        duct.dispose();
        group.traverse((o) => { if (o.geometry && o.geometry !== unit) o.geometry.dispose(); });
        unit.dispose(); quad.dispose();
        for (const m of owned) m.dispose();
        if (group.parent) group.parent.remove(group);
      }
    };
  }

  globalThis.HikyakuPyramid = {
    DEF: DEF, ACCENT: ACCENT, WARM: WARM,
    makePyramid: makePyramid, toWorld: toWorld, toLocal: toLocal, dirWorld: dirWorld,
    contacts: contacts, boxesNear: boxesNear, clearance: clearance, flythrough: flythrough, portals: portals,
    inside: inside, bounds: bounds, fitCheck: fitCheck, boxDist: boxDist,
    build: build
  };
})();
