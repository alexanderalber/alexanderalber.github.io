/* pyramid.js -- the type P arcology of Hikyaku (concept D4): a banded
 * ziggurat-pyramid whose interior is the ventilation system. The race comes
 * in through a deep corner cut at the south-west, under a gate of two
 * inhabited beams and past a leaning leg, enters the duct (shaft.js) in the
 * cut's east wall, turns left once inside and leaves through a quiet portal
 * on the north face.
 *
 * Concept: notes/tools/hikyaku/concepts/PYRAMID-VARIANTS.md, variant D4 and
 * "D4 update: the corner gate" (pyr-d4.html, lib/pyrbands.js, lib/pyrpath.js
 * bandedDims). Kept from there: dimensions, courtyards, cantilevers, fins,
 * gate, duct, ring stations and the collision concept (band half-spaces,
 * open-air regions, boxes for what projects, the leg as a plane prism). New
 * here: world placement, contacts in the record shape of SixDOF.resolve, the
 * route pass points, the campus hint, and a build on the game's materials.
 * The surroundings (campus, ring road, boulevards, plaza) are not here: the
 * city builds them in the reserved region (campus hint below).
 *
 * Two layers, like menger.js and shaft.js:
 *
 *   - Pure layer, no three.js, no DOM: makePyramid, toLocal, toWorld,
 *     dirWorld, contacts, boxesNear, clearance, flythrough, portals, inside,
 *     bounds, fitCheck. notes/dev/pyramid.test.mjs checks it. Needs
 *     globalThis.Shaft (the duct).
 *   - Visual layer: build(THREE, layout, opts). THREE is a parameter, never an
 *     import. Uses ColorRamps (bone greys) and Shaft.build for the duct.
 *
 * Local frame: y up, the centre of the base at the origin, south (the plaza
 * side) on +z, east on +x. The corner cut is at the south-west (x < -x0,
 * z > z0). A pilot flies in along +x, the duct turns LEFT to -z (north).
 * World placement: origin (centre of the base on the ground) and a yaw that
 * is a multiple of 90 degrees in three.js's rotation.y convention, as
 * menger.js and shaft.js: local +x goes to (cos yaw, 0, -sin yaw).
 *
 * Large form: skirt 1320 x 60 m; band 1 (62 degrees, 1160 m at its foot,
 * 60 to 290 m), terrace, band 2 (66 degrees, 812 m, 290 to 520 m), terrace,
 * band 3 (58 degrees, 520 m, 520 to 720 m), roof 272 m wide with the exhaust
 * crown. Articulation: nine courtyards cut into the slopes (two with
 * bridges), four cantilevers, fins in three widths per band stopping at the
 * terraces, buildings on the terraces. The corner cut (band 1 height) is
 * framed at its top by an L of two inhabited beams (58 m tall, flush with the
 * band 1 slope, the wedge between beam front and slope filled) and one
 * smooth leg leaning down to the forecourt along the corner edge's line.
 *
 * Collision. Each band is four half-spaces n . p <= d with its own y range;
 * above band k and outside band k+1 the terrace is the ceiling. A point in a
 * band is in the shell unless it is in an open-air region: the cut under the
 * beams, the pocket behind them, the nine courtyards (each with its own wall
 * planes), the two splayed reveals, the holes in the mouth plates, or the
 * duct's wall band near the mouths (the shaft's contacts). In the shell it
 * leaves through the cheapest exit: a face, the terrace or roof above, or into
 * an air region (its largest violated wall, a lower bound of the distance).
 * Nothing deeper than `cap` (20 m) answers: the duct keeps more than that
 * from every plane (fitCheck), so a hull in the duct gets nothing from here.
 * The leg is a convex prism of four planes and a y range, solid inside the
 * cut. Fins, corner fins, cornices and ledges are slabs on the face planes.
 * Everything else that projects (terraces, beams, cantilevers, bridges,
 * terrace buildings, skirt, crown, forecourt) is a box in the game's box
 * shape for hkcore contactsBoxes (boxesNear).
 *
 * Detail layers go into layout.details, drawn as one instanced mesh per
 * kind: face-local boxes { kind, band, face, u, y, w, h, d } or local AABBs
 * { kind, lo, hi }. The window texture is the city's facade shader.
 *
 * Everything hangs on globalThis.HikyakuPyramid.
 */
(function () {
  'use strict';

  const ACCENT = 0x2ee8ff, WARM = 0xffa63d;
  const H90 = Math.PI / 2;
  const DEF = {
    skirtHalf: 660, skirtH: 60,
    bands: [{ hb: 580, h: 230, c: 0.53 }, { hb: 406, h: 230, c: 0.44 }, { hb: 260, h: 200, c: 0.62 }],
    /* the corner cut at the south-west and its gate */
    cutX: 210, cutZ: 210, beamH: 58, beamD: 50, legW: 50, soffitY: 288, forecourtZ: 360,
    courts: [
      { band: 0, face: 'W', ua: -60, ub: 40, depth: 45 },
      { band: 0, face: 'N', ua: 170, ub: 260, depth: 45 },
      { band: 0, face: 'S', ua: 240, ub: 330, depth: 45 },
      { band: 1, face: 'S', ua: -180, ub: -90, depth: 42, bridge: 400 },
      { band: 1, face: 'E', ua: 40, ub: 130, depth: 42 },
      { band: 1, face: 'N', ua: 60, ub: 150, depth: 42 },
      { band: 1, face: 'W', ua: -200, ub: -110, depth: 42, bridge: 430 },
      { band: 2, face: 'W', ua: 30, ub: 110, depth: 38 },
      { band: 2, face: 'S', ua: -100, ub: -30, depth: 38 }
    ],
    cantis: [
      { band: 1, face: 'E', u0: -260, u1: -150, ya: 380, yb: 440, out: 40 },
      { band: 0, face: 'S', u0: -120, u1: 20, ya: 230, yb: 280, out: 35 },
      { band: 1, face: 'W', u0: 130, u1: 230, ya: 420, yb: 470, out: 30 },
      { band: 2, face: 'N', u0: -60, u1: 40, ya: 600, yb: 640, out: 30 }
    ],
    /* fins per band: u as a fraction of the band's top half width, width w;
       depth 9 + w / 10. Corner fins narrower up the building. */
    fins: [
      [{ u: -0.8, w: 44 }, { u: -0.25, w: 22 }, { u: 0.4, w: 30 }],
      [{ u: -0.55, w: 30 }, { u: 0.15, w: 50 }, { u: 0.7, w: 20 }],
      [{ u: 0, w: 60 }]
    ],
    cornerW: [34, 26, 18], cornerD: 12, corniceH: 9, corniceD: 8, ledgeH: 2.4, ledgeD: 7,
    /* the duct */
    ductY: 165, gateD: 28, plate: 2.4, PW: 140, PH: 112, splay: 0.35,
    s1: 250, bendR: 180, ramp: 40, exitTopD: 12,
    loftIn: [90, 180], loftOut: [149, 69],
    fanAt: [215, 700], fanSquareOut: 37,
    /* ring stations (s, offset x right, y up); the last one counts back from the exit */
    rings: [{ s: 120, x: -14, y: 8 }, { s: 400, x: 12, y: -10 }, { s: 620, x: -14, y: 12 }, { s: 820, x: 16, y: -8 }, { s: 960, x: -10, y: -12 }, { s: -99, x: 8, y: 10 }],
    /* route */
    lead: 560, leave: 160,
    /* reserved region round the skirt: margins west, east, north, south */
    plaza: [360, 410, 360, 510],
    wallT: 12, cap: 20, fitHalf: 62
  };
  const FACE_IDS = ['S', 'E', 'N', 'W'];
  const FACE_NH = { S: [0, 0, 1], E: [1, 0, 0], N: [0, 0, -1], W: [-1, 0, 0] };

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
  /* box minus box: up to six pieces of a that are not in c */
  function subtractBox(a, c) {
    const lo = a.lo.slice(), hi = a.hi.slice(), out = [];
    if (c.hi[0] <= lo[0] || c.lo[0] >= hi[0] || c.hi[1] <= lo[1] || c.lo[1] >= hi[1] || c.hi[2] <= lo[2] || c.lo[2] >= hi[2]) return [a];
    for (let ax = 0; ax < 3; ax++) {
      if (c.lo[ax] > lo[ax]) { const h = hi.slice(); h[ax] = c.lo[ax]; out.push(Object.assign({}, a, { lo: lo.slice(), hi: h })); lo[ax] = c.lo[ax]; }
      if (c.hi[ax] < hi[ax]) { const l = lo.slice(); l[ax] = c.hi[ax]; out.push(Object.assign({}, a, { lo: l, hi: hi.slice() })); hi[ax] = c.hi[ax]; }
    }
    return out;
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
     (multiple of 90 degrees), opts.avoid (world points the terrace buildings
     and cantilevers keep 34 m from, e.g. route samples), opts.idxBase (box
     idx offset for contactsBoxes keys), any DEF key. */
  function makePyramid(seed, opts) {
    opts = opts || {};
    const S = needShaft();
    const C = Object.assign({}, DEF, opts);
    const yaw = opts.yaw || 0, qy = yaw / H90;
    if (Math.abs(qy - Math.round(qy)) > 1e-6) throw new Error('HikyakuPyramid: yaw must be a multiple of 90 degrees');
    const o = opts.origin;
    const origin = Array.isArray(o) ? [o[0], o[1] || 0, o[2]] : o ? [o.x || 0, o.y || 0, o.z || 0] : [0, 0, 0];
    const L = { seed: seed >>> 0, cfg: C, yaw: yaw, origin: origin, cy: Math.round(Math.cos(yaw)), sy: Math.round(Math.sin(yaw)) };
    const rng = mulberry32((seed >>> 0) ^ 0x7a1d0c3b);
    const T = (lo, hi) => lo + (hi - lo) * rng();

    /* bands */
    const SKH = C.skirtHalf, SH = C.skirtH;
    let yb = SH;
    const B = C.bands.map((b, k) => {
      const q = Math.hypot(1, b.c), r = { k: k, hb: b.hb, c: b.c, y0: yb, y1: yb + b.h, q: q, ht: b.hb - b.h * b.c, dF: (b.hb + b.c * yb) / q };
      yb += b.h;
      return r;
    });
    B.forEach((b, k) => { b.next = k + 1 < B.length ? B[k + 1].hb : 0; });
    const TOP = yb;
    const half = (k, y) => B[k].hb - (y - B[k].y0) * B[k].c;
    L.bands = B;
    L.dims = { skirtHalf: SKH, skirtH: SH, TOP: TOP, topHalf: B[B.length - 1].ht, bands: B };
    L.half = half;
    /* faces: per band S, E, N, W; n outward (tilted up), T the u axis */
    L.faces = [];
    B.forEach((b, k) => FACE_IDS.forEach((id, j) => {
      const nh = FACE_NH[id];
      L.faces.push({ band: k, j: j, id: id, nh: nh, T: cross([0, 1, 0], nh), n: [nh[0] / b.q, b.c / b.q, nh[2] / b.q], d: b.dF, y0: b.y0, y1: b.y1 });
    }));
    const face = (k, id) => L.faces[k * 4 + FACE_IDS.indexOf(id)];
    const facePt = (f, u, y, d) => { const h = half(f.band, y); return [f.nh[0] * h + f.T[0] * u + f.n[0] * (d || 0), y + f.n[1] * (d || 0), f.nh[2] * h + f.T[2] * u + f.n[2] * (d || 0)]; };
    L.facePt = facePt;

    /* the corner gate: two beams (an L in plan), flush with band 1's slope,
       reaching back to the inner edge of the terrace above; one leg */
    const b0 = B[0], yT = b0.y1, yB = yT - C.beamH;
    const zo = half(0, yT) - 2, zi = Math.min(zo - C.beamD, B[1].hb - 20);
    const xi = -C.cutX, xo = -(half(0, yT) - 2);
    const xw1 = Math.max(xo + C.beamD, -(B[1].hb - 20));
    const shear = b0.c * (yB - SH), w = C.legW;
    const cTop = [xo + w / 2, zo - w / 2], cFoot = [cTop[0] - shear, cTop[1] + shear];
    L.gate = {
      yB: yB, yT: yT, xo: xo, xi: xi, zo: zo, zi: zi, xw1: xw1, zw0: C.cutZ, zw1: zi,
      beamS: { lo: [xo, yB, zi], hi: [xi, yT, zo] }, beamW: { lo: [xo, yB, C.cutZ], hi: [xw1, yT, zi] },
      leg: { y0: SH, y1: yB, w: w, top: cTop, foot: cFoot, lean: b0.c }
    };
    /* leg planes: x - c y <= ..., the four sheared sides */
    {
      const c0 = b0.c, q0 = Math.hypot(1, c0), fx = cFoot[0] - c0 * SH, fz = cFoot[1] + c0 * SH;
      L.gate.leg.planes = [
        { n: [1 / q0, -c0 / q0, 0], d: (fx + w / 2) / q0 }, { n: [-1 / q0, c0 / q0, 0], d: -(fx - w / 2) / q0 },
        { n: [0, c0 / q0, 1 / q0], d: (fz + w / 2) / q0 }, { n: [0, -c0 / q0, -1 / q0], d: -(fz - w / 2) / q0 }
      ];
    }

    /* the duct: mouth gateD behind the cut's east wall at forecourtZ, s1
       east, one ramped LEFT turn, then north to exitTopD behind the north
       face of band 1 */
    const yc = C.ductY, xs = -C.cutX + C.gateD, zs = C.forecourtZ;
    const shYaw = yaw - H90;     /* the shaft's dir0 is local +x */
    const rp = Math.min(C.ramp, H90 * C.bendR * 0.5), wB = H90 * C.bendR + rp;
    const bend = [{ kind: 'arc', s0: C.s1, angle: -H90, R: C.bendR, ramp: C.ramp }];
    const probe = S.makeShaft(1, { origin: toWorld(L, [xs, yc, zs]), yaw: shYaw, length: C.s1 + wB + 10, loft: [1, 2, 3, 4], fans: [], bends: bend, housing: false });
    const fe = toLocal(L, S.frameAt(probe, C.s1 + wB).p);
    const ze = -(half(0, yc + C.PH / 2) - C.plate - C.exitTopD);
    const s2 = fe[2] - ze;
    if (!(s2 > 100)) throw new Error('HikyakuPyramid: no room for the exit leg');
    const len = C.s1 + wB + s2;
    const loft = [C.loftIn[0], C.loftIn[1], len - C.loftOut[0], len - C.loftOut[1]];
    const fans = [{ s: C.fanAt[0], kind: 'round' }, { s: C.fanAt[1], kind: 'round' }, { s: len - C.fanSquareOut, kind: 'square' }];
    const sSeed = 1 + ((Math.imul((seed >>> 0) ^ 0x51f7e2a9, 2654435761) >>> 0) % 99991);
    L.duct = S.makeShaft(sSeed, { origin: toWorld(L, [xs, yc, zs]), yaw: shYaw, length: len, loft: loft, fans: fans, bends: bend,
      housing: false, proud: C.plate, collar: 16, wallT: C.wallT });
    L.bend = { s0: C.s1, s1: C.s1 + wB, R: C.bendR, ramp: rp, turn: 'left' };
    L.rings = C.rings.map((r) => ({ s: r.s < 0 ? len + r.s : r.s, x: r.x, y: r.y }));
    const eL = toLocal(L, S.frameAt(L.duct, len).p);

    /* portals: station point E (duct end), outward o, lateral N; the reveal
       starts at the plate front (t = 0) and ends at the outer plane */
    const mkPortal = (id, E, o, N, outer) => {
      const P = { id: id, E: E, o: o, N: N, outer: outer, hw: C.PW / 2, hh: C.PH / 2, splay: C.splay, plate: C.plate,
        skip: id === 'entry' ? loft[0] : len - loft[3] };
      const F = sa(E, o, C.plate);
      P.rim = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => {
        const p0 = [F[0] + N[0] * a * P.hw, F[1] + b * P.hh, F[2] + N[2] * a * P.hw];
        const dv = [o[0] + N[0] * a * C.splay, b * C.splay, o[2] + N[2] * a * C.splay];
        const t = (outer.d - dot(outer.n, p0)) / dot(outer.n, dv);
        return sa(p0, dv, Math.max(4, t));
      });
      const ta = (outer.d - dot(outer.n, E)) / dot(outer.n, o);
      P.axisOut = sa(E, o, ta);
      P.depthOut = ta;
      return P;
    };
    const fN0 = face(0, 'N');
    L.portalsL = [
      mkPortal('entry', [xs, yc, zs], [-1, 0, 0], [0, 0, 1], { n: [-1, 0, 0], d: C.cutX }),
      mkPortal('exit', eL, [0, 0, -1], [1, 0, 0], { n: fN0.n, d: fN0.d })
    ];

    /* holes per face (u, y): courts, the cut on band 1 S and W below the
       beams, the exit on band 1 N; and the entry in the cut's east wall */
    const trap = (rim, Tv) => {
      const uv = rim.map((p) => [dot(p, Tv), p[1]]);
      return { ya: (uv[0][1] + uv[1][1]) / 2, yb: (uv[2][1] + uv[3][1]) / 2,
        uL: [Math.min(uv[0][0], uv[1][0]), Math.min(uv[2][0], uv[3][0])], uR: [Math.max(uv[0][0], uv[1][0]), Math.max(uv[2][0], uv[3][0])] };
    };
    L.faces.forEach((f) => { f.holes = []; });
    for (const ct of C.courts) {
      const b = B[ct.band];
      face(ct.band, ct.face).holes.push({ ya: b.y0, yb: b.y1, uL: [ct.ua, ct.ua], uR: [ct.ub, ct.ub], court: true });
    }
    face(0, 'S').holes.push({ ya: b0.y0, yb: yB, uL: [-1e4, -1e4], uR: [xi, xi], cut: true });
    face(0, 'W').holes.push({ ya: b0.y0, yb: yB, uL: [C.cutZ, C.cutZ], uR: [1e4, 1e4], cut: true });
    fN0.holes.push(trap(L.portalsL[1].rim, fN0.T));
    L.entryHole = trap(L.portalsL[0].rim, [0, 0, 1]);

    /* open-air regions: convex, rows { n, d } with inside <=> n . p <= d for
       all rows. kind 'cut' (under the beams, behind the beams) or 'court' */
    const air = [];
    air.push({ kind: 'cut', id: 'under', rows: [{ n: [1, 0, 0], d: xi }, { n: [0, 0, -1], d: -C.cutZ }, { n: [0, 1, 0], d: yB }] });
    air.push({ kind: 'cut', id: 'behind', rows: [{ n: [1, 0, 0], d: xi }, { n: [-1, 0, 0], d: -xw1 }, { n: [0, 0, -1], d: -C.cutZ }, { n: [0, 0, 1], d: zi },
      { n: [0, 1, 0], d: C.soffitY }, { n: [0, -1, 0], d: -yB }] });
    for (const ct of C.courts) {
      const f = face(ct.band, ct.face), b = B[ct.band];
      air.push({ kind: 'court', id: ct.band + ct.face, court: ct, band: ct.band, face: f.j, rows: [
        { n: f.T.slice(), d: ct.ub }, { n: f.T.map((v) => -v), d: -ct.ua },
        { n: f.n.map((v) => -v), d: -(f.d - ct.depth / b.q) },
        { n: [0, 1, 0], d: b.y1 }, { n: [0, -1, 0], d: -b.y0 }
      ] });
    }
    L.air = air;

    /* slabs on the faces: fins, corner fins, cornice lip, mid ledge */
    L.slabs = [];
    B.forEach((b, k) => FACE_IDS.forEach((id, j) => {
      const list = [];
      for (const fi of C.fins[k]) list.push({ kind: 'fin', u: fi.u * b.ht, w: fi.w, d: 9 + fi.w / 10, y0: b.y0, y1: b.y1 });
      list.push({ kind: 'corner', w: C.cornerW[k], d: C.cornerD, y0: b.y0, y1: b.y1 });
      list.push({ kind: 'band', d: C.corniceD, y0: b.y1 - C.corniceH, y1: b.y1, part: 'cornice' });
      const ym = (b.y0 + b.y1) / 2;
      list.push({ kind: 'band', d: C.ledgeD, y0: ym, y1: ym + C.ledgeH, part: 'ledge' });
      for (const s of list) { s.band = k; s.face = j; L.slabs.push(s); }
    }));
    L.slabMax = Math.max.apply(null, L.slabs.map((s) => s.d));

    /* boxes */
    const boxes = [];
    const box = (lo, hi, tone, prog, coll, part) => boxes.push({ lo: lo, hi: hi, tone: tone, prog: prog == null ? 4 : prog, coll: coll !== false, seed: rng(), part: part || '' });
    const avoidL = (opts.avoid || []).map((p) => toLocal(L, p));
    const clear = (lo, hi, R) => {
      const r2 = (R || 34) * (R || 34);
      for (const p of avoidL) {
        const dx = Math.max(lo[0] - p[0], 0, p[0] - hi[0]), dy = Math.max(lo[1] - p[1], 0, p[1] - hi[1]), dz = Math.max(lo[2] - p[2], 0, p[2] - hi[2]);
        if (dx * dx + dy * dy + dz * dz < r2) return false;
      }
      return true;
    };
    /* skirt, cornice and rib */
    box([-SKH, 0, -SKH], [SKH, SH, SKH], 0.36, 2, true, 'skirt');
    for (const [a, c2] of [[SH - 8, SH], [SH * 0.45, SH * 0.45 + 3]]) {
      box([-SKH - 6, a, -SKH - 6], [SKH + 6, c2, -SKH], 0.6); box([-SKH - 6, a, SKH], [SKH + 6, c2, SKH + 6], 0.6);
      box([-SKH - 6, a, -SKH], [-SKH, c2, SKH], 0.6); box([SKH, a, -SKH], [SKH + 6, c2, SKH], 0.6);
    }
    /* terraces (12 m slabs between the band below and the band above), the
       courts carved out of them; the roof slab and parapet */
    const carves = C.courts.map((ct) => {
      const f = face(ct.band, ct.face), b = B[ct.band];
      const t0 = facePt(f, ct.ua, b.y1, 2), t1 = sa(facePt(f, ct.ub, b.y1, 0), f.nh, -ct.depth);
      return { lo: [Math.min(t0[0], t1[0]) - 0.5, b.y1 - 13, Math.min(t0[2], t1[2]) - 0.5], hi: [Math.max(t0[0], t1[0]) + 0.5, b.y1 + 1, Math.max(t0[2], t1[2]) + 0.5] };
    });
    B.forEach((b, k) => {
      const ht = b.ht + 2, y = b.y1;
      if (k + 1 < B.length) {
        const hi = B[k + 1].hb - 20;
        let ring = [{ lo: [-ht, y - 12, -ht], hi: [ht, y, -hi] }, { lo: [-ht, y - 12, hi], hi: [ht, y, ht] },
          { lo: [-ht, y - 12, -hi], hi: [-hi, y, hi] }, { lo: [hi, y - 12, -hi], hi: [ht, y, hi] }];
        for (const cv of carves) ring = ring.flatMap((r) => subtractBox(r, cv));
        for (const r of ring) box(r.lo, r.hi, 0.5, 4, true, 'terrace');
      } else box([-ht, y - 10, -ht], [ht, y, ht], 0.5, 4, true, 'roof');
    });
    {
      const TH = B[2].ht;
      box([-TH - 4, TOP, -TH - 4], [TH + 4, TOP + 7, -TH + 6], 0.6); box([-TH - 4, TOP, TH - 6], [TH + 4, TOP + 7, TH + 4], 0.6);
      box([-TH - 4, TOP, -TH + 6], [-TH + 6, TOP + 7, TH - 6], 0.6); box([TH - 6, TOP, -TH + 6], [TH + 4, TOP + 7, TH - 6], 0.6);
      /* exhaust crown: louvre banks round a well (solid for the contacts), corner piers, the well floor */
      const cH = TH * 0.62, ch = 46;
      L.crown = { half: cH, h: ch, y: TOP };
      box([-cH, TOP, cH - 1], [cH, TOP + ch - 3, cH + 1], 0.55); box([-cH, TOP, -cH - 1], [cH, TOP + ch - 3, -cH + 1], 0.55);
      box([cH - 1, TOP, -cH], [cH + 1, TOP + ch - 3, cH], 0.55); box([-cH - 1, TOP, -cH], [-cH + 1, TOP + ch - 3, cH], 0.55);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) box([sx * cH - 8, TOP, sz * cH - 8], [sx * cH + 8, TOP + ch + 6, sz * cH + 8], 0.62);
      box([-cH + 2, TOP, -cH + 2], [cH - 2, TOP + 4, cH - 2], 0.08);
    }
    /* the gate: beams with cornice and lit soffit band, the soffit over the
       pocket behind them, the leg's base block */
    {
      const G = L.gate;
      box(G.beamS.lo, G.beamS.hi, 0.42, 3, true, 'beam');
      box([xo - 1, yT - 4, zi - 1], [xi, yT + 1, zo + 1], 0.62, 4, true, 'beam');
      box([xo, yB - 2, zi], [xi, yB, zo], 0.3, 4, true, 'beam');
      box(G.beamW.lo, G.beamW.hi, 0.42, 3, true, 'beam');
      box([xo - 1, yT - 4, C.cutZ], [xw1 + 1, yT + 1, zi], 0.62, 4, true, 'beam');
      box([xo, yB - 2, C.cutZ], [xw1, yB, zi], 0.3, 4, true, 'beam');
      box([-(B[1].hb), C.soffitY, C.cutZ], [xi, C.soffitY + 12, B[1].hb], 0.3, 4, true, 'soffit');
      const bw = w + 30;
      box([cFoot[0] - bw / 2, SH, cFoot[1] - bw / 2], [cFoot[0] + bw / 2, SH + 18, cFoot[1] + bw / 2], 0.34, 4, true, 'legbase');
    }
    /* the forecourt: a road along the approach, vehicles, a parked row, a service block */
    {
      const zr = C.forecourtZ, xa = -SKH, xb = -C.cutX - 4;
      box([xa, SH, zr - 14], [xb, SH + 0.5, zr + 14], 0.15, 4, true, 'road');
      for (let k = 0; k < 9; k++) {
        const x = xa + 30 + k * (xb - xa - 60) / 8 + T(-6, 6), lane = k % 2 ? -6 : 6;
        box([x - 4, SH + 0.5, zr + lane - 1.6], [x + 4, SH + 2.6, zr + lane + 1.6], T(0.25, 0.42), 4, true, 'vehicle');
      }
      for (let k = 0; k < 6; k++) box([-C.cutX - 30 - k * 9, SH, C.cutZ + 8], [-C.cutX - 24 - k * 9, SH + 2.2, C.cutZ + 20], T(0.2, 0.4), 4, true, 'vehicle');
      box([-C.cutX - 26, SH, zr + 60], [-C.cutX - 4, SH + 14, zr + 110], 0.3, 2, true, 'service');
    }
    /* courts: floors (band 2 and 3 courts stand on the terrace below) and bridges */
    for (const ct of C.courts) {
      const f = face(ct.band, ct.face), b = B[ct.band];
      const p0 = facePt(f, ct.ua, b.y0, 0), p1 = sa(facePt(f, ct.ub, b.y0, 0), f.nh, -ct.depth);
      if (ct.band > 0) box([Math.min(p0[0], p1[0]), b.y0 - 4, Math.min(p0[2], p1[2])], [Math.max(p0[0], p1[0]), b.y0, Math.max(p0[2], p1[2])], 0.4, 4, true, 'courtfloor');
      if (ct.bridge) {
        const yb2 = ct.bridge, q0 = sa(facePt(f, ct.ua, yb2, 0), f.nh, -ct.depth * 0.5), q1 = sa(facePt(f, ct.ub, yb2, 0), f.nh, -ct.depth * 0.5 + 10);
        box([Math.min(q0[0], q1[0]), yb2, Math.min(q0[2], q1[2])], [Math.max(q0[0], q1[0]), yb2 + 7, Math.max(q0[2], q1[2])], 0.45, 3, true, 'bridge');
      }
    }
    /* cantilevered blocks with a roof lip */
    L.cantis = [];
    for (const ca of C.cantis) {
      const nh = FACE_NH[ca.face], Tv = cross([0, 1, 0], nh);
      const dIn = half(ca.band, ca.yb) - 18, dOut = half(ca.band, ca.ya) + ca.out;
      const P = (u, d, y) => [Tv[0] * u + nh[0] * d, y, Tv[2] * u + nh[2] * d];
      const p0 = P(ca.u0, dIn, ca.ya), p1 = P(ca.u1, dOut, ca.yb);
      const lo = [Math.min(p0[0], p1[0]), ca.ya, Math.min(p0[2], p1[2])], hi = [Math.max(p0[0], p1[0]), ca.yb, Math.max(p0[2], p1[2])];
      if (!clear(lo, hi)) continue;
      box(lo, hi, 0.42, 3, true, 'canti');
      box([lo[0] - 1, ca.yb, lo[2] - 1], [hi[0] + 1, ca.yb + 3, hi[2] + 1], 0.62, 4, true, 'canti');
      L.cantis.push(Object.assign({ lo: lo, hi: hi }, ca));
    }
    /* buildings on the terraces, a few tall enough to break the skyline */
    B.forEach((b, k) => {
      if (k + 1 >= B.length) return;
      const y = b.y1, inner = B[k + 1].hb + 6, outer = b.ht - 4;
      if (outer - inner < 14) return;
      FACE_IDS.forEach((id) => {
        const nh = FACE_NH[id], Tv = cross([0, 1, 0], nh);
        for (let a = -outer + 40; a < outer - 40; a += T(40, 90)) {
          if (rng() < 0.3) continue;
          const tall = rng() < 0.12;
          const bw = T(14, 40), bd = Math.min(outer - inner - 4, T(10, 30)), h = tall ? T(40, 75) : T(6, 22);
          const c = [Tv[0] * a + nh[0] * (inner + outer) / 2, Tv[2] * a + nh[2] * (inner + outer) / 2];
          const ax = Math.abs(Tv[0]) > 0.5, sx = ax ? bw : bd, sz = ax ? bd : bw;
          if (k === 0 && c[0] < -C.cutX + 30 && c[1] > C.cutZ - 30) continue;
          if (C.courts.some((ct) => ct.band === k && ct.face === id && a > ct.ua - 30 && a < ct.ub + 30)) continue;
          const lo = [c[0] - sx / 2, y, c[1] - sz / 2], hi = [c[0] + sx / 2, y + h, c[1] + sz / 2];
          if (!clear(lo, hi)) continue;
          box(lo, hi, T(0.3, 0.5), tall ? 3 : rng() < 0.4 ? 2 : 1, true, 'terracebldg');
        }
      });
    });
    /* the exit apron under the north portal's sill */
    {
      const PX = L.portalsL[1], r0 = PX.rim[0], r1 = PX.rim[1], ya = Math.min(r0[1], r1[1]);
      const zf = Math.max(r0[2], r1[2]);
      box([PX.E[0] - 80, ya - 6, zf - 30], [PX.E[0] + 80, ya - 2, zf], 0.4, 4, true, 'apron');
    }
    L.boxesL = boxes;

    /* world boxes for the contacts, in the game's shape, plus a 2-D grid */
    const idxBase = opts.idxBase || 0;
    L.boxes = [];
    for (const b of boxes) {
      if (!b.coll) continue;
      const a = toWorld(L, b.lo), c = toWorld(L, b.hi);
      const mn = [Math.min(a[0], c[0]), a[1], Math.min(a[2], c[2])], mx = [Math.max(a[0], c[0]), c[1], Math.max(a[2], c[2])];
      L.boxes.push({ min: mn, max: mx, c: [(mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, (mn[2] + mx[2]) / 2],
        half: [(mx[0] - mn[0]) / 2, (mx[1] - mn[1]) / 2, (mx[2] - mn[2]) / 2], idx: idxBase + L.boxes.length, part: b.part });
    }
    const Gc = 64, gx0 = origin[0] - SKH - 64, gz0 = origin[2] - SKH - 64, gn = Math.ceil((2 * SKH + 128) / Gc);
    const cells = new Array(gn * gn);
    for (let i = 0; i < cells.length; i++) cells[i] = [];
    L.boxes.forEach((b, i) => {
      const i0 = Math.max(0, Math.floor((b.min[0] - gx0) / Gc)), i1 = Math.min(gn - 1, Math.floor((b.max[0] - gx0) / Gc));
      const k0 = Math.max(0, Math.floor((b.min[2] - gz0) / Gc)), k1 = Math.min(gn - 1, Math.floor((b.max[2] - gz0) / Gc));
      for (let k = k0; k <= k1; k++) for (let j = i0; j <= i1; j++) cells[k * gn + j].push(i);
    });
    L._grid = { G: Gc, x0: gx0, z0: gz0, n: gn, cells: cells, stamp: new Uint32Array(L.boxes.length), tick: 0 };

    /* detail layers: face-local boxes and local AABBs, one instanced draw per kind */
    L.details = [];
    for (const f of L.faces) {
      const b = B[f.band], ym = (b.y0 + b.y1) / 2 + C.ledgeH;
      /* planters on the mid ledge */
      for (let u = -half(f.band, ym) + 40; u < half(f.band, ym) - 40; u += T(10, 20)) {
        if (rng() < 0.4) continue;
        L.details.push({ kind: 'planter', band: f.band, face: f.j, u: u, y: ym + 1, w: T(4, 8), h: T(1.2, 3), d: 2.5, out: T(2.5, 5.5) });
      }
      /* intake grilles in pairs at a quarter height */
      const yg = b.y0 + (b.y1 - b.y0) * 0.27;
      for (const u of [-0.5 * b.ht, 0.55 * b.ht]) L.details.push({ kind: 'grille', band: f.band, face: f.j, u: u, y: yg, w: 18, h: 12, d: 1.2, out: 0.6 });
    }
    L.details = L.details.filter((dt) => !inHoleUV(L, dt.band * 4 + dt.face, dt.u - dt.w / 2, dt.y) && !inHoleUV(L, dt.band * 4 + dt.face, dt.u + dt.w / 2, dt.y));
    /* lamp posts along the forecourt road; plant rows on the skirt top */
    for (let x = -SKH + 10; x < -C.cutX - 4; x += 22) for (const o2 of [-22, 22]) L.details.push({ kind: 'lamp', lo: [x - 0.5, SH, C.forecourtZ + o2 - 0.5], hi: [x + 0.5, SH + 12, C.forecourtZ + o2 + 0.5] });
    for (const side of [[1, 0], [0, -1]]) for (let k = 0; k < 14; k++) {
      const a = -SKH + 60 + k * 80, dep = B[0].hb + 20 + (k % 2) * 22;
      const cx = side[0] ? dep : a, cz = side[0] ? a : -dep;
      if (side[0] === 0 && Math.abs(cx - L.portalsL[1].E[0]) < 120) continue;
      L.details.push({ kind: 'plant', lo: [cx - 8, SH, cz - 8], hi: [cx + 8, SH + 6, cz + 8] });
    }

    /* bounds, reserved region, campus hint, fit, the contact record */
    const P0 = C.plaza;
    const r0w = toWorld(L, [-SKH - P0[0], 0, -SKH - P0[2]]), r1w = toWorld(L, [SKH + P0[1], 0, SKH + P0[3]]);
    L.reserved = { min: [Math.min(r0w[0], r1w[0]), 0, Math.min(r0w[2], r1w[2])], max: [Math.max(r0w[0], r1w[0]), 4000, Math.max(r0w[2], r1w[2])] };
    const b0w = toWorld(L, [-SKH - 8, 0, -SKH - 8]), b1w = toWorld(L, [SKH + 8, 0, SKH + 8]);
    L._bounds = { min: [Math.min(b0w[0], b1w[0]), 0, Math.min(b0w[2], b1w[2])], max: [Math.max(b0w[0], b1w[0]), origin[1] + TOP + 60, Math.max(b0w[2], b1w[2])] };
    L.entryDir = dirWorld(L, [1, 0, 0]);
    L.exitDir = dirWorld(L, [0, 0, -1]);
    L._k = makeContactK(L);
    L.fit = fitCheck(L);
    const ft = flythrough(L);
    const wps = ft.waypoints, fpw = toWorld(L, [-SKH, 0, -SKH]), fpw2 = toWorld(L, [SKH, 0, SKH]);
    L.campus = {
      footprint: { min: [Math.min(fpw[0], fpw2[0]), 0, Math.min(fpw[2], fpw2[2])], max: [Math.max(fpw[0], fpw2[0]), SH, Math.max(fpw[2], fpw2[2])] },
      reserved: L.reserved,
      /* the plaza side: south of the building in local terms, the side with the widest margin */
      plazaSide: dirWorld(L, [0, 0, 1]),
      /* where the corner cut opens (south-west, unit) */
      cutSide: dirWorld(L, [-Math.SQRT1_2, 0, Math.SQRT1_2]),
      /* corridors the campus keeps free: the approach along the cut, the leave leg */
      approachLegs: [
        { a: wps[0].p.slice(), b: wps[1].p.slice(), width: 160, y: [SH, wps[0].p[1] + 80], kind: 'approach' },
        { a: wps[wps.length - 2].p.slice(), b: wps[wps.length - 1].p.slice(), width: 160, y: [SH, wps[0].p[1] + 80], kind: 'leave' }
      ]
    };
    return L;
  }

  /* (u, y) on face index fi inside one of its holes (plus 6 m)? */
  function inHoleUV(L, fi, u, y) {
    for (const h of L.faces[fi].holes) {
      if (y < h.ya - 6 || y > h.yb + 6) continue;
      const fr = Math.min(1, Math.max(0, (y - h.ya) / (h.yb - h.ya)));
      const uL = h.uL[0] + (h.uL[1] - h.uL[0]) * fr, uR = h.uR[0] + (h.uR[1] - h.uR[0]) * fr;
      if (u > uL - 6 && u < uR + 6) return true;
    }
    return false;
  }

  /* Fit check: the smallest margin of a fitHalf square around the duct
     centre line (duct N/B frame, every 4 m, away from both mouths) to the
     shell's surfaces: the band planes, terrace ceilings, air regions and
     the leg (lower bounds of the distance). */
  function fitCheck(L) {
    const S = needShaft(), C = L.cfg, sh = L.duct, h = C.fitHalf, K = L._k;
    let worst = { m: Infinity, s: 0 };
    for (let s = C.gateD + 70; s <= sh.length - 70; s += 4) {
      const f = S.frameAt(sh, s);
      for (const a of [-h, 0, h]) for (const b of [-h, 0, h]) {
        const p = toLocal(L, [f.p[0] + f.N[0] * a, f.p[1] + b, f.p[2] + f.N[2] * a]);
        const m = shellMargin(K, p[0], p[1], p[2]);
        if (m < worst.m) worst = { m: m, s: s, p: p.map(Math.round) };
      }
    }
    return worst;
  }

  /* ---- contacts -------------------------------------------------------------
     The hot path reads one flat record (L._k, built once by makeContactK)
     instead of the layout, and the current point from a Float64Array: the
     hot functions are too big to inline, and a double passed to a call that
     is not inlined gets boxed. */
  const AIR_ROWS = 6;
  function makeContactK(L) {
    const C = L.cfg, B = L.bands, R = globalThis.Shaft.RECT, G = L.gate;
    const port = (P) => ({ ex: P.E[0], ey: P.E[1], ez: P.E[2], ox: P.o[0], oz: P.o[2], nx: P.N[0], nz: P.N[2],
      plate: P.plate, hw: P.hw, hh: P.hh, sp: P.splay, skip: P.skip, onx: P.outer.n[0], ony: P.outer.n[1], onz: P.outer.n[2], od: P.outer.d });
    const planes = new Float64Array(48), band = new Float64Array(B.length * 6), TT = new Float64Array(8);
    L.faces.forEach((f, i) => planes.set([f.n[0], f.n[1], f.n[2], f.d], i * 4));
    B.forEach((b, k) => band.set([b.y0, b.y1, b.next, b.c, b.hb, b.q], k * 6));
    for (let j = 0; j < 4; j++) { const f = L.faces[j]; TT[j * 2] = f.T[0]; TT[j * 2 + 1] = f.T[2]; }
    const na = L.air.length, air = new Float64Array(na * AIR_ROWS * 4), airN = new Int32Array(na), airInfo = new Float64Array(na * 5);
    L.air.forEach((a, i) => {
      airN[i] = a.rows.length;
      a.rows.forEach((r, q) => air.set([r.n[0], r.n[1], r.n[2], r.d], (i * AIR_ROWS + q) * 4));
      airInfo.set(a.kind === 'court' ? [1, a.band, a.face, a.court.ua, a.court.ub] : [0, -1, -1, 0, 0], i * 5);
    });
    const slabs = L.faces.map((f, fi) => {
      const list = L.slabs.filter((s) => s.band * 4 + s.face === fi), a = new Float64Array(list.length * 6);
      list.forEach((s, i) => a.set([s.kind === 'fin' ? 0 : s.kind === 'corner' ? 1 : 2, s.u || 0, s.w || 0, s.d, s.y0, s.y1], i * 6));
      return a;
    });
    const leg = new Float64Array(16);
    G.leg.planes.forEach((p, i) => leg.set([p.n[0], p.n[1], p.n[2], p.d], i * 4));
    const allAir = new Int32Array(na);
    for (let i = 0; i < na; i++) allAir[i] = i;
    return {
      y0: C.skirtH, top: L.dims.TOP, lim: C.skirtHalf + 20, nb: B.length, by1a: B[0].y1, by1b: B[1].y1,
      planes: planes, band: band, TT: TT, air: air, airN: airN, airInfo: airInfo, na: na, allAir: allAir,
      leg: leg, legY0: G.leg.y0, legY1: G.leg.y1,
      slabs: slabs, slabMax: L.slabMax, cutX: C.cutX, cutZ: C.cutZ, cap: C.cap, wallT: C.wallT, iqs: 1 / Math.hypot(1, C.splay), qs: Math.hypot(1, C.splay),
      fkeys: L.faces.map((f) => 'pyr' + f.id + (f.band + 1)),
      cz: L.cy, sz: L.sy, ox: L.origin[0], oy: L.origin[1], oz: L.origin[2],
      bx0: L._bounds.min[0], bx1: L._bounds.max[0], bz0: L._bounds.min[2], bz1: L._bounds.max[2], by1: L._bounds.max[1],
      ra: R.a, rb: R.b, rc: R.a + R.b - R.c,
      pe: port(L.portalsL[0]), px: port(L.portalsL[1])
    };
  }
  const SQ12 = Math.SQRT1_2;
  /* the mouth profile (Shaft.secF at loft weight 0: the rectangle with its chamfers) */
  function rectF(K, u, v) {
    const au = u < 0 ? -u : u, av = v < 0 ? -v : v;
    const a = au - K.ra, b = av - K.rb, c = (au + av - K.rc) * SQ12;
    return a > b ? (a > c ? a : c) : (b > c ? b : c);
  }
  const PT = new Float64Array(4);
  const _c = { pen: 0, n0: 0, n1: 0, n2: 0, key: '' };
  function set(pen, n0, n1, n2, key) {
    if (pen < _c.pen) { _c.pen = pen; _c.n0 = n0; _c.n1 = n1; _c.n2 = n2; _c.key = key; }
  }
  /* what a hull can reach, decided once per hull from its bounding sphere */
  const _h = { leg: false, pe: false, px: false, air: new Int32Array(32), na: 0, sl: [], ns: new Int32Array(12),
    mv: new Float64Array(32), mq: new Int32Array(32) };
  for (let i = 0; i < 12; i++) _h.sl.push(new Int32Array(16));
  function bandOf(K, y) { return y < K.by1a ? 0 : y < K.by1b ? 1 : 2; }
  /* largest violated row of air region i at (x, y, z); the row in _h.mq[slot] */
  function airViol(K, i, x, y, z, slot) {
    const A = K.air, n = K.airN[i];
    let m = -Infinity, arg = 0;
    for (let q = 0; q < n; q++) {
      const o = (i * AIR_ROWS + q) * 4, v = A[o] * x + A[o + 1] * y + A[o + 2] * z - A[o + 3];
      if (v > m) { m = v; arg = q; }
    }
    if (slot >= 0) _h.mq[slot] = arg;
    return m;
  }
  function legViol(K, x, y, z) {
    const G = K.leg;
    let m = Math.max(K.legY0 - y, y - K.legY1);
    for (let q = 0; q < 16; q += 4) { const v = G[q] * x + G[q + 1] * y + G[q + 2] * z - G[q + 3]; if (v > m) m = v; }
    return m;
  }
  function revealAir(P, bounded) {
    const x = PT[0], y = PT[1], z = PT[2];
    const ex = x - P.ex, ey = y - P.ey, ez = z - P.ez;
    const t = ex * P.ox + ez * P.oz - P.plate, u = ex * P.nx + ez * P.nz;
    if (t < 0) return false;
    const w = P.sp * t;
    if ((u < 0 ? -u : u) > P.hw + w || (ey < 0 ? -ey : ey) > P.hh + w) return false;
    return !bounded || x * P.onx + y * P.ony + z * P.onz <= P.od;
  }
  /* a point in the shell near one portal: in its reveal, its plate's hole,
     or the duct's wall band near the mouth (the shaft's business) */
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
    /* beyond the outer plane the reveal is not the way out */
    const go = x * P.onx + y * P.ony + z * P.onz - P.od;
    if (go > 0 && go >= gu && go >= gv && go >= gt) return;
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
  /* the shell's exits for a point inside band k and in no air region:
     faces, ceiling, air regions in _h, portals in _h. Fills _c. */
  function shellExits(K, k, x, y, z, v) {
    const Pp = K.planes, o = k * 16;
    for (let j = 0; j < 4; j++) set(-v[j], Pp[o + j * 4], Pp[o + j * 4 + 1], Pp[o + j * 4 + 2], K.fkeys[k * 4 + j]);
    const bd = K.band, b = k * 6, ax = x < 0 ? -x : x, az = z < 0 ? -z : z;
    if (k + 1 < K.nb) { if ((ax > az ? ax : az) > bd[b + 2]) set(bd[b + 1] - y, 0, 1, 0, 'pyrTerrace'); }
    else set(K.top - y, 0, 1, 0, 'pyrRoof');
    const A = K.air;
    for (let s = 0; s < _h.na; s++) {
      const i = _h.air[s], q = _h.mq[s], ro = (i * AIR_ROWS + q) * 4;
      set(_h.mv[s], -A[ro], -A[ro + 1], -A[ro + 2], K.airInfo[i * 5] ? 'pyrCourt' : 'pyrCut');
    }
    if (_h.pe) portalCand(K, K.pe, 'pyrRevE');
    if (_h.px) portalCand(K, K.px, 'pyrRevX');
  }
  const _v = new Float64Array(4);
  /* one local point (PT); fills _c and returns true if it is in contact */
  function pointLocal(K) {
    const x = PT[0], y = PT[1], z = PT[2];
    if (y < K.y0 || y > K.top + 1) return false;
    const lim = K.lim;
    if (x > lim || x < -lim || z > lim || z < -lim) return false;
    _c.pen = Infinity;
    /* the leg: a convex prism, out through its nearest side */
    if (_h.leg && y > K.legY0 && y < K.legY1) {
      const G = K.leg;
      let inside = true;
      for (let q = 0; q < 16; q += 4) { const vv = G[q] * x + G[q + 1] * y + G[q + 2] * z - G[q + 3]; _v[q >> 2] = vv; if (vv >= 0) inside = false; }
      if (inside) {
        for (let q = 0; q < 4; q++) set(-_v[q], G[q * 4], G[q * 4 + 1], G[q * 4 + 2], 'pyrLeg');
        return true;
      }
    }
    const k = bandOf(K, y), Pp = K.planes, o = k * 16;
    let m = -Infinity;
    for (let j = 0; j < 4; j++) { const vv = Pp[o + j * 4] * x + Pp[o + j * 4 + 1] * y + Pp[o + j * 4 + 2] * z - Pp[o + j * 4 + 3]; _v[j] = vv; if (vv > m) m = vv; }
    if (m > 0) {
      /* outside the band: slabs on the faces within reach */
      if (m > K.slabMax + 1 || y > K.top) return false;
      for (let j = 0; j < 4; j++) {
        const h = _v[j];
        if (h <= 0 || h >= K.slabMax || slabMasked(K, k, j, x, z)) continue;
        PT[3] = h;
        slabFace(K, k * 4 + j);
      }
      return _c.pen < Infinity;
    }
    /* inside the band: open air? */
    for (let s = 0; s < _h.na; s++) {
      const mv = airViol(K, _h.air[s], x, y, z, s);
      if (mv <= 0) return false;
      _h.mv[s] = mv;
    }
    if ((_h.pe && portalAir(K, K.pe)) || (_h.px && portalAir(K, K.px))) return false;
    shellExits(K, k, x, y, z, _v);
    return _c.pen <= K.cap;
  }
  /* no slabs where the face is cut away: the corner cut, courts, the exit */
  function slabMasked(K, k, j, x, z) {
    const u = x * K.TT[j * 2] + z * K.TT[j * 2 + 1];
    if (k === 0 && ((j === 0 && u < -K.cutX) || (j === 3 && u > K.cutZ))) return true;
    const I = K.airInfo;
    for (let s = 0; s < _h.na; s++) {
      const i = _h.air[s] * 5;
      if (I[i] === 1 && I[i + 1] === k && I[i + 2] === j && u > I[i + 3] && u < I[i + 4]) return true;
    }
    if (k === 0 && j === 2 && _h.px && revealAir(K.px, false)) return true;
    return false;
  }
  /* slabs on face fi for a point PT[3] metres outside it */
  function slabFace(K, fi) {
    const x = PT[0], y = PT[1], z = PT[2], h = PT[3];
    const Pp = K.planes, o = fi * 4, n0 = Pp[o], n1 = Pp[o + 1], n2 = Pp[o + 2];
    const j = fi & 3, T0 = K.TT[j * 2], T2 = K.TT[j * 2 + 1], b = (fi >> 2) * 6, bd = K.band;
    const u = x * T0 + z * T2, au = u < 0 ? -u : u, hy = bd[b + 4] - (y - h * n1 - bd[b]) * bd[b + 3];
    const S = K.slabs[fi], idx = _h.sl[fi], ns = _h.ns[fi];
    for (let jj = 0; jj < ns; jj++) {
      const i = idx[jj], kind = S[i], d = S[i + 3];
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

  /* Decide, once per hull (local centre, radius rh), what it can reach, into
     _h. Returns true if it can reach nothing: outside every band with room
     to spare, deep in the shell (the duct), or inside an air region with
     nothing solid in it near. */
  function hullScope(K, x, y, z, rh) {
    if (y + rh < K.y0 || y - rh > K.top + 1) return true;
    const cap = K.cap, r1 = rh + 1;
    _h.leg = legViol(K, x, y, z) < r1;
    for (let i = 0; i < 12; i++) _h.ns[i] = 0;
    const kLo = bandOf(K, Math.max(K.y0, y - rh)), kHi = bandOf(K, Math.min(K.top, y + rh));
    let near = false, deep = true;
    const Pp = K.planes, bd = K.band, ax = x < 0 ? -x : x, az = z < 0 ? -z : z, r = ax > az ? ax : az;
    for (let k = kLo; k <= kHi; k++) {
      let m = -Infinity;
      for (let j = 0; j < 4; j++) {
        const o = (k * 4 + j) * 4, v = Pp[o] * x + Pp[o + 1] * y + Pp[o + 2] * z - Pp[o + 3];
        if (v > m) m = v;
        if (v > -r1 && v < K.slabMax + r1) {
          /* the slabs of this face the sphere can touch */
          const fi = k * 4 + j, S = K.slabs[fi], out = _h.sl[fi], b = k * 6;
          const u = x * K.TT[j * 2] + z * K.TT[j * 2 + 1], au = u < 0 ? -u : u, hy = bd[b + 4] - (y - bd[b]) * bd[b + 3];
          let n = 0;
          for (let i = 0; i < S.length; i += 6) {
            if (y + rh < S[i + 4] || y - rh > S[i + 5]) continue;
            if (S[i] === 0 && Math.abs(u - S[i + 1]) > S[i + 2] / 2 + r1) continue;
            if (S[i] === 1 && au < hy - S[i + 2] - r1 - 2 * K.slabMax) continue;
            out[n++] = i;
          }
          _h.ns[fi] = n;
        }
      }
      if (m < K.slabMax + r1) near = true;
      if (m > -(cap + r1)) deep = false;
      const ceil = k + 1 < K.nb ? (r > bd[k * 6 + 2] - r1 ? bd[k * 6 + 1] - y : Infinity) : K.top - y;
      if (ceil < cap + r1) deep = false;
    }
    if (!near && !_h.leg) return true;
    _h.na = 0;
    let inAir = false;
    for (let i = 0; i < K.na; i++) {
      const mv = airViol(K, i, x, y, z, -1);
      if (mv < cap + r1) { _h.air[_h.na++] = i; if (mv < -r1) inAir = true; }
    }
    /* a portal matters within its skip zone behind the mouth, up to its
       outer plane, and laterally within reach of its reveal */
    const pr = (P) => {
      const ex = x - P.ex, ez = z - P.ez, a = ex * P.ox + ez * P.oz;
      if (a + rh < -(Math.max(40, P.skip) + 1)) return false;
      if (x * P.onx + y * P.ony + z * P.onz - P.od > rh + K.slabMax + 1) return false;
      const t = Math.max(0, a - P.plate), u = Math.abs(ex * P.nx + ez * P.nz), v = Math.abs(y - P.ey);
      return u - P.hw - P.sp * t < cap + r1 + 30 && v - P.hh - P.sp * t < cap + r1 + 30;
    };
    _h.pe = pr(K.pe); _h.px = pr(K.px);
    if (deep && !_h.leg && _h.na === 0 && !_h.pe && !_h.px) return true;
    /* every point in an open-air region: only the leg is solid in there
       (slabs are masked in front of courts and the cut) */
    if (inAir && !_h.leg) return true;
    /* every point in a reveal */
    for (let i = 0; i < 2; i++) {
      const P = i ? K.px : K.pe, ex = x - P.ex, ey = y - P.ey, ez = z - P.ez;
      const t = ex * P.ox + ez * P.oz - P.plate, u = ex * P.nx + ez * P.nz;
      if (t > rh && Math.abs(u) + rh * K.qs < P.hw + P.sp * (t - rh) && Math.abs(ey) + rh * K.qs < P.hh + P.sp * (t - rh) &&
        x * P.onx + y * P.ony + z * P.onz - P.od < -rh && !_h.leg) return true;
    }
    return false;
  }
  /* the full scope, for single points (clearance, fitCheck) */
  function scopeAll(K) {
    _h.leg = true; _h.pe = true; _h.px = true; _h.na = K.na;
    for (let i = 0; i < K.na; i++) _h.air[i] = i;
    for (let i = 0; i < 12; i++) { const S = K.slabs[i], out = _h.sl[i]; let n = 0; for (let q = 0; q < S.length; q += 6) out[n++] = q; _h.ns[i] = n; }
  }
  /* Signed margin of a local point to the shell: positive in the shell (the
     depth of its cheapest exit), negative outside, in the open air, in the
     leg or in a mouth zone. For fitCheck. */
  function shellMargin(K, x, y, z) {
    scopeAll(K);
    if (y < K.y0 || y > K.top) return -1;
    if (legViol(K, x, y, z) < 0) return -1;
    const k = bandOf(K, y), Pp = K.planes, o = k * 16;
    let m = -Infinity;
    for (let j = 0; j < 4; j++) { const vv = Pp[o + j * 4] * x + Pp[o + j * 4 + 1] * y + Pp[o + j * 4 + 2] * z - Pp[o + j * 4 + 3]; _v[j] = vv; if (vv > m) m = vv; }
    if (m > 0) return -m;
    for (let s = 0; s < _h.na; s++) { const mv = airViol(K, _h.air[s], x, y, z, s); if (mv <= 0) return mv; _h.mv[s] = mv; }
    PT[0] = x; PT[1] = y; PT[2] = z;
    if (portalAir(K, K.pe) || portalAir(K, K.px)) return -1;
    _c.pen = Infinity;
    shellExits(K, k, x, y, z, _v);
    return _c.pen;
  }

  /* contacts(layout, pts, st): band faces, terraces, roof, open-air walls,
     reveals, plates, the leg and the slabs, in the record SixDOF.resolve
     takes ({ n, r, pen, key, vs, part }). With st ({ p, q }) the points are
     body points, as hkcore contactsBoxes takes them (r = q pts[i]); without
     st they are world points and r is taken from their centroid. The boxes
     are not in here: boxesNear hands them to contactsBoxes. */
  const _rh = { pts: null, n: 0, r: 0 };
  function contacts(L, pts, st) {
    const out = [], K = L._k, n = pts.length;
    const lc = K.cz, ls = K.sz, ox = K.ox, oy = K.oy, oz = K.oz;
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
    if (cx < K.bx0 - rh || cx > K.bx1 + rh || cz < K.bz0 - rh || cz > K.bz1 + rh || cy > K.by1 + rh) return out;
    {
      const dx = cx - ox, dz = cz - oz;
      if (hullScope(K, dx * lc - dz * ls, cy - oy, dx * ls + dz * lc, rh)) return out;
    }
    const q = st ? st.q : null;
    const q0 = q ? q[0] : 0, q1 = q ? q[1] : 0, q2 = q ? q[2] : 0, q3 = q ? q[3] : 0;
    for (let i = 0; i < n; i++) {
      const v = pts[i];
      let rx, ry, rz;
      if (q) {
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
     shell, negative in it. Outside the bands: the largest plane distance
     minus the deepest slab; in an open-air region: the distance to its
     nearest wall (and to the leg); in a reveal: to its sides. In the mouth
     zones and below the skirt top (boxes) it returns 1e9: the shaft and the
     boxes decide there. */
  function clearance(L, p) {
    const K = L._k, lc = K.cz, ls = K.sz, dx = p[0] - K.ox, dz = p[2] - K.oz;
    const x = dx * lc - dz * ls, y = p[1] - K.oy, z = dx * ls + dz * lc;
    if (y < K.y0) return 1e9;
    if (y > K.top) return y - K.top;
    scopeAll(K);
    const lv = legViol(K, x, y, z);
    if (lv < 0) return lv;
    const k = bandOf(K, y), Pp = K.planes, o = k * 16;
    let m = -Infinity;
    for (let j = 0; j < 4; j++) { const vv = Pp[o + j * 4] * x + Pp[o + j * 4 + 1] * y + Pp[o + j * 4 + 2] * z - Pp[o + j * 4 + 3]; _v[j] = vv; if (vv > m) m = vv; }
    if (m > 0) return Math.min(m - K.slabMax, lv);
    for (let s = 0; s < _h.na; s++) {
      const mv = airViol(K, _h.air[s], x, y, z, s);
      if (mv <= 0) return Math.min(-mv, lv);
      _h.mv[s] = mv;
    }
    PT[0] = x; PT[1] = y; PT[2] = z;
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
    _c.pen = Infinity;
    shellExits(K, k, x, y, z, _v);
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
  function inside(L, p, margin) {
    const m = margin || 0, b = L._bounds;
    return p[0] >= b.min[0] - m && p[0] <= b.max[0] + m && p[1] >= b.min[1] - m && p[1] <= b.max[1] + m && p[2] >= b.min[2] - m && p[2] <= b.max[2] + m;
  }

  /* Portals in the Menger shape: { id, p, n, w, h, right, up, depth, kind,
     biome, c, rim }. p is where the duct axis crosses the outer plane (the
     cut's east wall, the north face of band 1), n the outward normal along
     the axis, w x h the opening at the plate (140 x 112; the reveal only
     widens outward, so a gate of that size at p is free air), depth the
     straight free run behind the opening, c the centre of the outer rim. */
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

  /* The route through the building: approach (lead metres before the entry
     portal, on the axis: the straight run along the cut, under the west
     beam), the entry portal (cut wall plane), the six ring stations and the
     three fan passes (Shaft.flythrough with explicit rings), the exit portal
     (north face), leave (leave metres beyond it). Returns { waypoints,
     points, entry, exit, exitDir, length }, waypoints[i] = { p, dir, up,
     kind, s, portal, fan }, s the duct arc length. */
  function flythrough(L, opts) {
    const S = needShaft(), C = L.cfg, sh = L.duct, o = opts || {};
    const lead = o.lead == null ? C.lead : o.lead, leave = o.leave == null ? C.leave : o.leave;
    const ft = S.flythrough(sh, { lead: 0, ringR: o.ringR, rings: L.rings });
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


  /* Build: the shell (bands cut around their holes, slabs as prisms, cut
     walls, wedges, courts, the leg, every box) as one mesh in the city's
     facade convention; light lines and gold rims as one glow mesh; halos as
     one additive instanced mesh; one InstancedMesh per detail kind; the duct
     through Shaft.build with quiet mouths. opts: fog (the page's makeFog),
     facadeMaterial (the city renderer's; not disposed here), paths (race
     lines, for the duct's cables), accent, warm, fanRange (1500 m). */
  function build(THREE, L, opts) {
    opts = opts || {};
    const S = needShaft();
    const stops = boneStops();
    const bone = (t, g) => {
      t = Math.min(1, Math.max(0, t)) * (stops.length - 1);
      const i = Math.min(stops.length - 2, Math.floor(t)), f = t - i, a = stops[i], b = stops[i + 1], k = g == null ? 1 : g;
      return [toLin(a[0] + (b[0] - a[0]) * f) * k, toLin(a[1] + (b[1] - a[1]) * f) * k, toLin(a[2] + (b[2] - a[2]) * f) * k];
    };
    const C = L.cfg, B = L.bands, G = L.gate, fog = opts.fog || null, half = L.half;
    const warm = opts.warm == null ? WARM : opts.warm, accent = opts.accent == null ? ACCENT : opts.accent;
    const rng = mulberry32(L.seed ^ 0x2b0f11);
    const owned = [];
    const toW = (p) => toWorld(L, p), dW = (d) => dirWorld(L, d);
    const soup = new Soup(), glow = new Soup(), halos = [];
    const sodC = hexLin(warm, 1.3), warmC = hexLin(warm, 2.0), cyanC = hexLin(accent, 2.0), whiteC = bone(0.95, 1.4);
    const SH = C.skirtH, TOP = L.dims.TOP;
    /* a light line from a to b (local), width wd, facing nrm */
    const line = (a, b, wd, nrm, col) => {
      const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], s = norm(cross(nrm, d)), h = wd / 2;
      glow.quad(toW(sa(a, s, -h)), toW(sa(b, s, -h)), toW(sa(b, s, h)), toW(sa(a, s, h)), dW(nrm), col, 0, [0, 0, 0, 0], 0, 0, 4);
    };
    const holeFns = (hs) => hs.map((h) => ({ ya: h.ya, yb: h.yb,
      uL: (y) => h.uL[0] + (h.uL[1] - h.uL[0]) * (y - h.ya) / Math.max(1e-9, h.yb - h.ya),
      uR: (y) => h.uR[0] + (h.uR[1] - h.uR[0]) * (y - h.ya) / Math.max(1e-9, h.yb - h.ya) }));
    /* quads and prisms on a face (f.P(u, y, d), f.n, f.T) */
    const emitter = (f, col, seed, code, d0, d1, uRef, W, top) => (a0, b0, b1, a1, ya, yb) => {
      const P = (u, y, d) => toW(f.P(u, y, d)), n = dW(f.n);
      const us = (a, b) => [a - uRef(ya), b - uRef(ya), b - uRef(ya), a - uRef(ya)];
      if (d1 - d0 < 0.01) { soup.quad(P(a0, ya, d1), P(b0, ya, d1), P(b1, yb, d1), P(a1, yb, d1), n, col, seed, [a0 - uRef(ya), b0 - uRef(ya), b1 - uRef(ya), a1 - uRef(ya)], W, top, code); return; }
      soup.quad(P(a0, ya, d1), P(b0, ya, d1), P(b1, yb, d1), P(a1, yb, d1), n, col, seed, us(a0, b0), W, top, code);
      const side = (u0, u1, sg) => soup.quad(P(u0, ya, d0), P(u0, ya, d1), P(u1, yb, d1), P(u1, yb, d0), dW([f.T[0] * sg, 0, f.T[2] * sg]), col, seed, [0, d1 - d0, d1 - d0, 0], d1 - d0, top, code);
      side(a0, a1, -1); side(b0, b1, 1);
      soup.quad(P(a1, yb, d0), P(b1, yb, d0), P(b1, yb, d1), P(a1, yb, d1), dW([0, 1, 0]), col, seed, [0, b1 - a1, b1 - a1, 0], b1 - a1, top, 4);
      soup.quad(P(a0, ya, d0), P(b0, ya, d0), P(b0, ya, d1), P(a0, ya, d1), dW([0, -1, 0]), col, seed, [0, b0 - a0, b0 - a0, 0], b0 - a0, top, 4);
    };

    /* ---- the bands' faces: window fields, fins, corner fins, cornice, ledge ---- */
    const faces = L.faces.map((F) => ({ F: F, n: F.n, T: F.T, P: (u, y, d) => L.facePt(F, u, y, d), holes: holeFns(F.holes),
      uMin: (y) => -half(F.band, y), uMax: (y) => half(F.band, y) }));
    for (const f of faces) {
      const F = f.F, b = B[F.band], ht = b.ht, mid = (b.y0 + b.y1) / 2;
      const fins = C.fins[F.band], cols = [-1e4, ...fins.map((q) => q.u * ht), 1e4];
      for (const [ya, yb] of [[b.y0, mid], [mid, b.y1]]) for (let j = 0; j + 1 < cols.length; j++) {
        const seed = rng(), prog = rng() < 0.6 ? 3 : rng() < 0.5 ? 0 : 1, tone = 0.38 + rng() * 0.14;
        fill(emitter(f, bone(tone), seed, prog, 0, 0, (y) => Math.max(cols[j], -half(F.band, y)), Math.min(cols[j + 1], half(F.band, ya)) - Math.max(cols[j], -half(F.band, ya)), yb), f, ya, yb, { u0: cols[j], u1: cols[j + 1] });
      }
      /* slabs; on band 1 S and W not over the cut (the wedge is plain face) */
      const lim = F.band === 0 && F.id === 'S' ? { u0: -C.cutX } : F.band === 0 && F.id === 'W' ? { u1: C.cutZ } : {};
      for (const s of L.slabs) {
        if (s.band !== F.band || s.face !== F.j) continue;
        const col = bone(s.kind === 'band' ? 0.66 : 0.6), seed = rng();
        if (s.kind === 'fin') {
          const o = { u0: Math.max(s.u - s.w / 2, lim.u0 == null ? -1e4 : lim.u0), u1: Math.min(s.u + s.w / 2, lim.u1 == null ? 1e4 : lim.u1), d0: 0, d1: s.d };
          if (o.u1 - o.u0 < 1) continue;
          fill(emitter(f, col, seed, 4, 0, s.d, () => o.u0, s.w, b.y1), f, s.y0, s.y1, o);
          for (const [a, c2] of spans(f, b.y1 - 2, o.u0, o.u1)) line(f.P(a + 2, b.y1 - 2, s.d + 0.3), f.P(c2 - 2, b.y1 - 2, s.d + 0.3), 1.6, F.n, sodC);
        } else if (s.kind === 'corner') {
          for (const sg of [-1, 1]) {
            if ((sg < 0 && lim.u0 != null) || (sg > 0 && lim.u1 != null)) continue;
            const cf = Object.assign({}, f, sg < 0 ? { uMax: (y) => -half(F.band, y) + s.w } : { uMin: (y) => half(F.band, y) - s.w });
            fill(emitter(cf, col, seed, 4, 0, s.d, (y) => cf.uMin(y), s.w, b.y1), cf, s.y0, s.y1);
          }
        } else {
          const o = Object.assign({ d0: 0, d1: s.d }, lim);
          fill(emitter(f, col, seed, 4, 0, s.d, (y) => -half(F.band, y), 2 * half(F.band, s.y0), s.y1), f, s.y0, s.y1, o);
          const yl = s.part === 'cornice' ? s.y0 - 0.6 : s.y0 + 0.4;
          for (const [a, c2] of spans(f, yl, lim.u0 == null ? -half(F.band, yl) : lim.u0, lim.u1 == null ? half(F.band, yl) : lim.u1)) line(f.P(a, yl, s.d + 0.2), f.P(c2, yl, s.d + 0.2), s.part === 'cornice' ? 1.2 : 0.9, F.n, sodC);
        }
      }
    }
    /* terrace edges, lit */
    B.forEach((b, k) => {
      if (k + 1 >= B.length) return;
      const ht = b.ht + 3, y = b.y1 + 0.6, E4 = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
      for (let q = 0; q < 4; q++) line([E4[q][0] * ht, y, E4[q][1] * ht], [E4[(q + 1) % 4][0] * ht, y, E4[(q + 1) % 4][1] * ht], 1.6, [0, 1, 0], sodC);
    });

    /* ---- the corner cut: its two walls (windows), the wedge undersides, the leg ---- */
    {
      const X = C.cutX, Zc = C.cutZ, b0 = B[0];
      const eh = holeFns([L.entryHole])[0];
      const wallE = { n: [-1, 0, 0], T: [0, 0, 1], holes: [eh], P: (u, y, d) => [-X - (d || 0), y, u], uMin: () => Zc, uMax: (y) => (y < G.yB ? half(0, y) : G.zi) };
      const wallN = { n: [0, 0, 1], T: [1, 0, 0], holes: [], P: (u, y, d) => [u, y, Zc + (d || 0)], uMin: (y) => (y < G.yB ? -half(0, y) : G.xw1), uMax: () => -X };
      for (const w of [wallE, wallN]) {
        const seed = rng();
        fill(emitter(w, bone(0.46), seed, 1, 0, 0, w.uMin, 400, G.yB), w, b0.y0, G.yB);
        fill(emitter(w, bone(0.46), seed, 1, 0, 0, w.uMin, 200, C.soffitY), w, G.yB, C.soffitY);
        for (let y = b0.y0 + 30; y < G.yB - 6; y += 36) {
          if (w === wallE && Math.abs(y - C.ductY) < 70) continue;
          line(w.P(w.uMin(y) + 4, y, 0.6), w.P(w.uMax(y) - 4, y, 0.6), 0.8, w.n, sodC);
        }
      }
      /* undersides of the wedges between the beam fronts and the slope */
      const hB = half(0, G.yB), down = dW([0, -1, 0]);
      const flat = (x0, x1, z0, z1) => soup.quad(toW([x0, G.yB, z0]), toW([x1, G.yB, z0]), toW([x1, G.yB, z1]), toW([x0, G.yB, z1]), down, bone(0.3), 0.5, [0, 0, 0, 0], 0, 0, 4);
      flat(-hB, G.xi, G.zo, hB);
      flat(-hB, G.xo, G.zw0, G.zo);
      /* lit lower edges of the beams and the wedge strips */
      line([G.xo, G.yB - 2.6, G.zo - 2], [G.xi, G.yB - 2.6, G.zo - 2], 1.2, [0, -1, 0], sodC);
      line([G.xo, G.yB - 2.6, G.zi + 2], [G.xi, G.yB - 2.6, G.zi + 2], 1.2, [0, -1, 0], sodC);
      for (const xx of [G.xo + 2, G.xw1 - 2]) line([xx, G.yB - 2.6, G.zw0], [xx, G.yB - 2.6, G.zi], 1.2, [0, -1, 0], sodC);
      for (let x = G.xi - 20; x > G.xo; x -= 24) halos.push([toW([x, G.yB - 6, (G.zi + G.zo) / 2]), 22, 22, hexLin(warm, 0.07)]);
      for (let z = G.zw0 + 20; z < G.zw1; z += 24) halos.push([toW([(G.xo + G.xw1) / 2, G.yB - 6, z]), 22, 22, hexLin(warm, 0.07)]);
      /* the leg: four sheared quads, lit long edges */
      const lg = G.leg, w = lg.w, sq = (c, y) => [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b2]) => [c[0] + a * w / 2, y, c[1] + b2 * w / 2]);
      const lo = sq(lg.foot, lg.y0), hi = sq(lg.top, lg.y1), cen = [(lg.foot[0] + lg.top[0]) / 2, (lg.y0 + lg.y1) / 2, (lg.foot[1] + lg.top[1]) / 2];
      const seed = rng();
      for (let k = 0; k < 4; k++) {
        const q = [lo[k], lo[(k + 1) % 4], hi[(k + 1) % 4], hi[k]];
        let nn = norm(cross([q[1][0] - q[0][0], q[1][1] - q[0][1], q[1][2] - q[0][2]], [q[3][0] - q[0][0], q[3][1] - q[0][1], q[3][2] - q[0][2]]));
        const mid = [(q[0][0] + q[2][0]) / 2 - cen[0], 0, (q[0][2] + q[2][2]) / 2 - cen[2]];
        if (dot(nn, mid) < 0) nn = nn.map((v) => -v);
        soup.quad(toW(q[0]), toW(q[1]), toW(q[2]), toW(q[3]), dW(nn), bone(0.44), seed, [0, w, w, 0], w, lg.y1, 1);
        const out = norm([lo[k][0] - lg.foot[0], 0, lo[k][2] - lg.foot[1]]);
        line(sa(lo[k], out, 1.2), sa(hi[k], out, 1.2), 1.4, out, sodC);
      }
      halos.push([toW([lg.foot[0], SH + 8, lg.foot[1]]), 60, 40, hexLin(warm, 0.08)]);
      /* the forecourt road: kerbs and a sodium centre line */
      for (const o2 of [-14, 14]) line([-C.skirtHalf, SH + 0.7, C.forecourtZ + o2], [-X - 4, SH + 0.7, C.forecourtZ + o2], 0.9, [0, 1, 0], whiteC);
      line([-C.skirtHalf, SH + 0.7, C.forecourtZ], [-X - 4, SH + 0.7, C.forecourtZ], 0.5, [0, 1, 0], sodC);
    }

    /* ---- courtyards: side walls, back wall, lit mouth edges ---- */
    for (const ct of C.courts) {
      const F = L.faces[ct.band * 4 + FACE_IDS.indexOf(ct.face)], b = B[ct.band];
      const P = (u, y, d) => L.facePt(F, u, y, d), back = (u, y) => sa(P(u, y, 0), F.nh, -ct.depth);
      const seed = rng();
      for (const [u, sg] of [[ct.ua, 1], [ct.ub, -1]]) {
        const q = [P(u, b.y0, 0), back(u, b.y0), back(u, b.y1), P(u, b.y1, 0)];
        soup.quad(toW(q[0]), toW(q[1]), toW(q[2]), toW(q[3]), dW(F.T.map((v) => v * sg)), bone(0.46), seed, [0, ct.depth, ct.depth, 0], ct.depth, b.y1, 1);
        line(P(u, b.y0 + 4, 1), P(u, b.y1 - 4, 1), 1.0, F.n, sodC);
      }
      const bq = [back(ct.ua, b.y0), back(ct.ub, b.y0), back(ct.ub, b.y1), back(ct.ua, b.y1)];
      soup.quad(toW(bq[0]), toW(bq[1]), toW(bq[2]), toW(bq[3]), dW(F.n), bone(0.46), seed, [0, ct.ub - ct.ua, ct.ub - ct.ua, 0], ct.ub - ct.ua, b.y1, 1);
      halos.push([toW(sa(back((ct.ua + ct.ub) / 2, (b.y0 + b.y1) / 2), F.nh, ct.depth * 0.4)), 70, 70, hexLin(warm, 0.05)]);
    }

    /* ---- portals: quiet. A dark reveal and plate, one thin gold rim at the outer edge ---- */
    for (const P of L.portalsL) {
      const E = P.E, o = P.o, N = P.N;
      const at = (u, v, a) => [E[0] + N[0] * u + o[0] * a, E[1] + v, E[2] + N[2] * u + o[2] * a];
      const inner = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b2]) => at(a * P.hw, b2 * P.hh, P.plate));
      const col = bone(0.14), seed = rng();
      for (let k = 0; k < 4; k++) {
        const a = inner[k], b2 = inner[(k + 1) % 4], c2 = P.rim[(k + 1) % 4], d = P.rim[k];
        const mid = [(a[0] + b2[0]) / 2 - E[0], (a[1] + b2[1]) / 2 - E[1], (a[2] + b2[2]) / 2 - E[2]];
        const lat = norm([mid[0] - o[0] * dot(mid, o), mid[1], mid[2] - o[2] * dot(mid, o)]);
        const nIn = norm(cross([b2[0] - a[0], b2[1] - a[1], b2[2] - a[2]], [d[0] - a[0], d[1] - a[1], d[2] - a[2]]));
        soup.quad(toW(a), toW(b2), toW(c2), toW(d), dW(dot(nIn, lat) > 0 ? nIn.map((v) => -v) : nIn), col, seed, [0, 0, 0, 0], 0, 0, 4);
      }
      const shp = new THREE.Shape([new THREE.Vector2(-P.hw, -P.hh), new THREE.Vector2(P.hw, -P.hh), new THREE.Vector2(P.hw, P.hh), new THREE.Vector2(-P.hw, P.hh)]);
      const R = S.RECT, cP = [[R.a - R.c, R.b], [-(R.a - R.c), R.b], [-R.a, R.b - R.c], [-R.a, -(R.b - R.c)], [-(R.a - R.c), -R.b], [R.a - R.c, -R.b], [R.a, -(R.b - R.c)], [R.a, R.b - R.c]];
      shp.holes.push(new THREE.Path(cP.map((p) => new THREE.Vector2(p[0], p[1]))));
      const sg = new THREE.ShapeGeometry(shp), pa = sg.getAttribute('position'), ix = sg.index;
      for (let t = 0; t < ix.count; t += 3) {
        const v = [0, 1, 2].map((e) => { const id = ix.getX(t + e); return toW(at(pa.getX(id), pa.getY(id), P.plate)); });
        soup.tri(v[0], v[1], v[2], dW(o), bone(0.12), seed, 0, 0, 0, 0, 0, 4);
      }
      sg.dispose();
      for (let k = 0; k < 4; k++) {
        const a = P.rim[k], b2 = P.rim[(k + 1) % 4];
        line(sa(a, o, 0.3), sa(b2, o, 0.3), 0.7, o, warmC);
      }
    }

    /* ---- boxes (skirt, terraces, roof, crown, gate, courts, cantilevers, buildings, forecourt) ---- */
    for (const b of L.boxesL) soup.box(b.lo, b.hi, bone(b.tone), b.seed, b.prog, toW, dW);
    /* crown: louvre slats (drawn only), sodium rim, cyan line at its foot, the plume */
    {
      const cH = L.crown.half, ch = L.crown.h;
      for (let y = TOP + 4; y < TOP + ch - 3; y += 4.2) {
        const col = bone(0.66), s = rng();
        soup.box([-cH, y, cH + 1], [cH, y + 1.6, cH + 2.2], col, s, 4, toW, dW);
        soup.box([-cH, y, -cH - 2.2], [cH, y + 1.6, -cH - 1], col, s, 4, toW, dW);
        soup.box([cH + 1, y, -cH], [cH + 2.2, y + 1.6, cH], col, s, 4, toW, dW);
        soup.box([-cH - 2.2, y, -cH], [-cH - 1, y + 1.6, cH], col, s, 4, toW, dW);
      }
      const E4 = [[-cH, -cH], [cH, -cH], [cH, cH], [-cH, cH]];
      for (let k = 0; k < 4; k++) {
        const a = E4[k], b2 = E4[(k + 1) % 4];
        line([a[0], TOP + ch + 7, a[1]], [b2[0], TOP + ch + 7, b2[1]], 2.4, [0, 1, 0], sodC);
        line([a[0] * 1.03, TOP + 1.6, a[1] * 1.03], [b2[0] * 1.03, TOP + 1.6, b2[1] * 1.03], 1.4, [0, 1, 0], cyanC);
      }
      for (let k = 0; k < 18; k++) halos.push([toW([(rng() - 0.5) * cH * 1.2, TOP + 30 + k * 26, (rng() - 0.5) * cH * 1.2]), 110 + k * 18, 110 + k * 18, bone(0.85, 0.07 - k * 0.0028)]);
      halos.push([toW([0, TOP + 20, 0]), cH * 2.6, cH * 1.4, hexLin(warm, 0.12)]);
    }
    /* lamp heads on the forecourt */
    for (const dt of L.details) if (dt.kind === 'lamp') halos.push([toW([(dt.lo[0] + dt.hi[0]) / 2, dt.hi[1] + 0.6, (dt.lo[2] + dt.hi[2]) / 2]), 5, 5, hexLin(warm, 0.9)]);

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
    const glowMat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
    if (fog) fog.patch(glowMat, { fogK: 0.5 });
    owned.push(glowMat);
    const glowMesh = new THREE.Mesh(glow.geometry(THREE), glowMat);
    glowMesh.name = 'pyramid-glow';
    group.add(glowMesh);

    /* detail layer: one instanced mesh per kind; face-local boxes sit on
       their face (u, y) and stand out by `out` along its normal; local
       AABBs are scaled unit boxes */
    const kinds = {};
    for (const dt of L.details) (kinds[dt.kind] = kinds[dt.kind] || []).push(dt);
    const detailMat = new THREE.MeshStandardMaterial({ color: new THREE.Color().fromArray(bone(0.55)), roughness: 0.8, metalness: 0.1 });
    if (fog) fog.patch(detailMat);
    owned.push(detailMat);
    const unit = new THREE.BoxGeometry(1, 1, 1);
    const m4 = new THREE.Matrix4(), m4b = new THREE.Matrix4(), V = (a) => new THREE.Vector3(a[0], a[1], a[2]);
    for (const kind of Object.keys(kinds)) {
      const list = kinds[kind];
      const im = new THREE.InstancedMesh(unit, detailMat, list.length);
      im.name = 'pyramid-detail-' + kind;
      list.forEach((dt, i) => {
        if (dt.lo) {
          const c = toW([(dt.lo[0] + dt.hi[0]) / 2, (dt.lo[1] + dt.hi[1]) / 2, (dt.lo[2] + dt.hi[2]) / 2]);
          const sx = dt.hi[0] - dt.lo[0], sz = dt.hi[2] - dt.lo[2], swap = L.cy === 0;
          m4.makeScale(swap ? sz : sx, dt.hi[1] - dt.lo[1], swap ? sx : sz).setPosition(c[0], c[1], c[2]);
        } else {
          const F = L.faces[dt.band * 4 + dt.face], Tw = dW(F.T), n = dW(F.n), Bw = cross(n, Tw);
          const p = toW(L.facePt(F, dt.u, dt.y, (dt.out || 0) + dt.d / 2));
          m4.makeBasis(V(Tw), V(Bw), V(n));
          m4b.makeScale(dt.w, dt.h, dt.d);
          m4.multiply(m4b).setPosition(p[0], p[1], p[2]);
        }
        im.setMatrixAt(i, m4);
      });
      im.computeBoundingSphere();
      group.add(im);
    }

    /* halos: additive soft discs */
    const quad = new THREE.PlaneGeometry(1, 1);
    const hg = new THREE.InstancedBufferGeometry();
    hg.index = quad.index; hg.setAttribute('position', quad.getAttribute('position')); hg.setAttribute('uv', quad.getAttribute('uv'));
    const HP = [], HS = [], HCl = [];
    for (const h of halos) { HP.push(h[0][0], h[0][1], h[0][2]); HS.push(h[1], h[2]); HCl.push(h[3][0], h[3][1], h[3][2]); }
    hg.setAttribute('iPos', new THREE.InstancedBufferAttribute(new Float32Array(HP), 3));
    hg.setAttribute('iSize', new THREE.InstancedBufferAttribute(new Float32Array(HS), 2));
    hg.setAttribute('iCol', new THREE.InstancedBufferAttribute(new Float32Array(HCl), 3));
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

    /* the duct, with quiet mouths: no warm rim geometry, rim light dimmed */
    const duct = S.build(THREE, L.duct, { fog: fog, paths: opts.paths || [], accent: accent, warm: warm, inScale: opts.inScale, med: opts.med, lampGain: opts.lampGain,
      rimGain: opts.rimGain == null ? 0.25 : opts.rimGain, mouthRims: false });
    group.add(duct.group);

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
    DEF: DEF, ACCENT: ACCENT, WARM: WARM, FACE_IDS: FACE_IDS,
    makePyramid: makePyramid, toWorld: toWorld, toLocal: toLocal, dirWorld: dirWorld,
    contacts: contacts, boxesNear: boxesNear, clearance: clearance, flythrough: flythrough, portals: portals,
    inside: inside, bounds: bounds, fitCheck: fitCheck, boxDist: boxDist,
    build: build
  };
})();
