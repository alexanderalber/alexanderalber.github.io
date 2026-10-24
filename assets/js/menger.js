/* menger.js -- the Menger block of Hikyaku: a hollow city block 243 x 288 x 243 m
 * whose holes are flight paths, with three-axis traffic that provably never
 * crosses itself.
 *
 * Ported from the concept phase (2026-10, notes/tools/hikyaku/concepts/lib/
 * mengerlanes.js and mengerblock.js, scene menger-block.html). The layout, the
 * lane lattice and the separation proof are unchanged; what is new is world
 * placement, collision boxes for the ship, portal descriptors and a suggested
 * flight path for the route generator.
 *
 * Two layers, like courier.js:
 *
 *   - Pure layer, no three.js, no DOM: makeGrid, solidBoxes, makeLanes,
 *     checkSeparation, checkWalls, makeBlock, boxesNear, clearance, portals,
 *     inside, flythrough, laneSet. notes/dev/menger.test.mjs checks it.
 *   - Visual layer: build(THREE, block, opts). THREE is a parameter, never an
 *     import, because the pages load three.js through an importmap module and
 *     everything shared here is a classic script. The only other global it
 *     touches is ColorRamps (assets/js/colorramps.js, for the bone greys).
 *
 * The block is a 9 x 9 x 9 grid of level-2 cells, 27 m wide in x and z and
 * 32 m tall. Level 1 groups them 3 x 3 x 3 and removes every cell that sits
 * in the middle of at least two axes: two 81 m tunnels (x, z) and one
 * full-height shaft (y), all meeting in the centre. Each surviving level-1
 * cell is recursed (holes of one level-2 cell), left solid, or cut away.
 *
 * The holes are not centred like a textbook sponge. They are shifted so they
 * land on the lane lattice (block-local coordinates, origin at the centre of
 * the base):
 *   x-lanes   z in {27 + 54k},  y on even rows (16, 80, 144, 208, 272)
 *   z-lanes   x in {27 + 54k},  y on odd rows  (48, 112, 176, 240)
 *   y-lanes   x in {54k} and z in {54k}
 * So an x-lane and a z-lane are always 32 m apart vertically, a vertical lane
 * is 27 m from every horizontal lane, parallel lanes are 54 m (or 64 m)
 * apart. No two lanes can meet anywhere. checkSeparation computes that
 * minimum exactly over all pairs instead of trusting the argument.
 *
 * World placement: a block has an origin (the centre of its base, in world
 * metres) and a yaw that is a multiple of 90 degrees, in three.js's
 * rotation.y convention. Multiples of 90 keep every box axis-aligned, which is
 * what the box contacts of the game need.
 *
 * Everything hangs on globalThis.Menger.
 */
(function () {
  'use strict';

  const DIM = { n: 9, sx: 27, sy: 32, sz: 27 };
  const W = DIM.n * DIM.sx, H = DIM.n * DIM.sy, D = DIM.n * DIM.sz;   // 243, 288, 243
  const X0 = -W / 2, Z0 = -D / 2;
  const PITCH = 54;
  const ROW_Y = (j) => DIM.sy * (j + 0.5);

  /* voxel kinds */
  const SOLID = 0, VOID_L1 = 1, VOID_L2 = 2, VOID_OPEN = 3;

  const ACCENT = 0x2ee8ff, WARM = 0xffa63d;

  /* ---- seeded random ---------------------------------------------------- */
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
  function makeRng(seed) {
    const r = mulberry32(seed);
    r.range = (a, b) => a + (b - a) * r();
    r.int = (a, b) => Math.floor(a + (b - a + 1) * r());
    r.pick = (arr) => arr[Math.floor(r() * arr.length)];
    r.chance = (p) => r() < p;
    return r;
  }

  /* ---- small vector helpers -------------------------------------------- */
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function add(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
  function mul(a, s) { return [a[0] * s, a[1] * s, a[2] * s]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function len(a) { return Math.sqrt(dot(a, a)); }
  function norm(a) { const l = len(a); return l > 0 ? mul(a, 1 / l) : [0, 0, 0]; }
  function sa(c, v, s) { return [c[0] + v[0] * s, c[1] + v[1] * s, c[2] + v[2] * s]; }
  const UP = [0, 1, 0];

  /* ---- placement ---------------------------------------------------------
     World = R(yaw) * local + origin, R the rotation about +y as three.js
     applies rotation.y: x' = c x + s z, z' = -s x + c z. c and s are rounded
     to integers, so only multiples of 90 degrees are accepted. */
  function makeFrame(origin, yaw) {
    const o = Array.isArray(origin) ? origin.slice(0, 3)
      : origin ? [origin.x || 0, origin.y || 0, origin.z || 0] : [0, 0, 0];
    yaw = yaw || 0;
    const q = yaw / (Math.PI / 2);
    if (Math.abs(q - Math.round(q)) > 1e-6) throw new Error('Menger: yaw must be a multiple of 90 degrees');
    const c = Math.round(Math.cos(yaw)), s = Math.round(Math.sin(yaw));
    const dirW = (v) => [c * v[0] + s * v[2], v[1], -s * v[0] + c * v[2]];
    const dirL = (v) => [c * v[0] - s * v[2], v[1], s * v[0] + c * v[2]];
    return {
      origin: o, yaw: yaw, c: c, s: s,
      dirW: dirW, dirL: dirL,
      toWorld: (p) => add(dirW(p), o),
      toLocal: (p) => dirL(sub(p, o)),
      /* local AABB [lo, hi] -> world AABB {min, max} */
      boxW: (lo, hi) => {
        const a = add(dirW(lo), o), b = add(dirW(hi), o);
        return { min: [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.min(a[2], b[2])],
          max: [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.max(a[2], b[2])] };
      }
    };
  }

  /* ---- the voxel grid ---------------------------------------------------- */
  /* sub-index choices per level-1 index, so the hole lands on the lattice */
  const XH_ROW = [[0, 2], [4], [6, 8]];      // x-holes: even rows
  const ZH_ROW = [[1], [3, 5], [7]];         // z-holes: odd rows
  const XH_K = [[1], [3, 5], [7]];           // x-hole z-column  -> z = -81, -27|27, 81
  const ZH_I = [[1], [3, 5], [7]];           // z-hole x-column
  const SH_C = [[0, 2], [4], [6, 8]];        // shaft column     -> -108|-54, 0, 54|108

  /* Unchanged from the concept, so seed n gives the concept's block n. */
  function makeGrid(seed, opts) {
    seed = seed == null ? 1 : seed;
    opts = opts || {};
    const pSolid = opts.pSolid == null ? 0.16 : opts.pSolid;
    const openCells = opts.openCells == null ? 1 : opts.openCells;
    const r = mulberry32(seed);
    const pick = (a) => a[Math.floor(r() * a.length)];
    const N = DIM.n;
    const kind = new Uint8Array(N * N * N).fill(SOLID);
    const at = (i, j, k) => i + N * (j + N * k);
    const mid = (a) => a === 1;
    const cells = [];
    for (let I = 0; I < 3; I++) for (let J = 0; J < 3; J++) for (let K = 0; K < 3; K++) {
      const removed = mid(I) + mid(J) + mid(K) >= 2;
      cells.push({ I: I, J: J, K: K, type: removed ? 'void' : 'rec' });
    }
    const cell = (I, J, K) => cells[K + 3 * (J + 3 * I)];
    /* irregular: a few cells stay solid, top corners may be cut away */
    const corners = cells.filter((c) => c.type === 'rec' && c.J === 2 && c.I !== 1 && c.K !== 1);
    for (let n = 0; n < openCells; n++) {
      const c = corners.splice(Math.floor(r() * corners.length), 1)[0];
      if (c) c.type = 'open';
    }
    for (const c of cells) if (c.type === 'rec' && c.J !== 0 && r() < pSolid) c.type = 'solid';
    /* hole placement per line, shared by all cells on that line so the holes
       form straight passages through the block */
    const xRow = {}, xCol = {}, zRow = {}, zCol = {}, shX = {}, shZ = {};
    for (let J = 0; J < 3; J++) for (let K = 0; K < 3; K++) { xRow[J + ',' + K] = pick(XH_ROW[J]); xCol[J + ',' + K] = pick(XH_K[K]); }
    for (let I = 0; I < 3; I++) for (let J = 0; J < 3; J++) { zRow[I + ',' + J] = pick(ZH_ROW[J]); zCol[I + ',' + J] = pick(ZH_I[I]); }
    for (let I = 0; I < 3; I++) for (let K = 0; K < 3; K++) { shX[I + ',' + K] = pick(SH_C[I]); shZ[I + ',' + K] = pick(SH_C[K]); }
    for (const c of cells) {
      const I = c.I, J = c.J, K = c.K;
      for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) for (let e = 0; e < 3; e++) {
        const i = 3 * I + a, j = 3 * J + b, k = 3 * K + e;
        let v = SOLID;
        if (c.type === 'void') v = VOID_L1;
        else if (c.type === 'open') v = VOID_OPEN;
        else if (c.type === 'rec') {
          const xh = j === xRow[J + ',' + K] && k === xCol[J + ',' + K];
          const zh = j === zRow[I + ',' + J] && i === zCol[I + ',' + J];
          const sh = i === shX[I + ',' + K] && k === shZ[I + ',' + K];
          if (xh || zh || sh) v = VOID_L2;
        }
        kind[at(i, j, k)] = v;
      }
    }
    const inG = (i, j, k) => i >= 0 && j >= 0 && k >= 0 && i < N && j < N && k < N;
    const isSolid = (i, j, k) => inG(i, j, k) && kind[at(i, j, k)] === SOLID;
    const kindAt = (i, j, k) => (inG(i, j, k) ? kind[at(i, j, k)] : -1);
    return { seed: seed, N: N, kind: kind, at: at, cells: cells, cell: cell, isSolid: isSolid, kindAt: kindAt };
  }

  /* Greedy merge of the solid voxels into boxes in index space: grow along
     i, then j, then k, while every voxel is solid and unclaimed. Fewer boxes
     means fewer internal seams for the ship's contacts and fewer distance
     tests. vox maps each voxel to its box (-1 for empty). */
  function mergeSolids(g) {
    const N = g.N, vox = new Int32Array(N * N * N).fill(-1), out = [];
    const free = (i, j, k) => g.isSolid(i, j, k) && vox[g.at(i, j, k)] < 0;
    for (let k = 0; k < N; k++) for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      if (!free(i, j, k)) continue;
      let i1 = i; while (i1 + 1 < N && free(i1 + 1, j, k)) i1++;
      let j1 = j;
      for (;;) {
        if (j1 + 1 >= N) break;
        let ok = true;
        for (let a = i; a <= i1 && ok; a++) ok = free(a, j1 + 1, k);
        if (!ok) break;
        j1++;
      }
      let k1 = k;
      for (;;) {
        if (k1 + 1 >= N) break;
        let ok = true;
        for (let b = j; b <= j1 && ok; b++) for (let a = i; a <= i1 && ok; a++) ok = free(a, b, k1 + 1);
        if (!ok) break;
        k1++;
      }
      const id = out.length;
      for (let c = k; c <= k1; c++) for (let b = j; b <= j1; b++) for (let a = i; a <= i1; a++) vox[g.at(a, b, c)] = id;
      out.push({ i0: i, i1: i1, j0: j, j1: j1, k0: k, k1: k1 });
    }
    return { cells: out, vox: vox };
  }
  function cellLo(i, j, k) { return [X0 + i * DIM.sx, j * DIM.sy, Z0 + k * DIM.sz]; }

  function worldBox(F, lo, hi, idx) {
    const b = F.boxW(lo, hi);
    b.c = [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2];
    b.half = [(b.max[0] - b.min[0]) / 2, (b.max[1] - b.min[1]) / 2, (b.max[2] - b.min[2]) / 2];
    b.idx = idx;
    return b;
  }

  /* Axis-aligned boxes of the solid geometry in world space, in the
     { min, max, c, half, idx } shape Hikyaku.contactsBoxes takes. merge
     (default true) joins voxels into larger boxes; false gives one box per
     voxel, as in the concept. idxBase offsets idx, so the boxes can share a
     contact key space with other obstacles. */
  function solidBoxes(g, origin, yaw, opts) {
    opts = opts || {};
    const F = makeFrame(origin, yaw);
    const base = opts.idxBase || 0;
    const out = [];
    if (opts.merge === false) {
      for (let k = 0; k < g.N; k++) for (let j = 0; j < g.N; j++) for (let i = 0; i < g.N; i++) {
        if (!g.isSolid(i, j, k)) continue;
        out.push(worldBox(F, cellLo(i, j, k), cellLo(i + 1, j + 1, k + 1), base + out.length));
      }
      return out;
    }
    const m = mergeSolids(g);
    for (const c of m.cells) out.push(worldBox(F, cellLo(c.i0, c.j0, c.k0), cellLo(c.i1 + 1, c.j1 + 1, c.k1 + 1), base + out.length));
    return out;
  }

  /* ---- distances -------------------------------------------------------- */
  /* exact distance between two axis-aligned boxes: per axis gap, then norm */
  function boxBoxDist(a, b) {
    let s = 0;
    for (let i = 0; i < 3; i++) {
      const g = Math.max(0, b.min[i] - a.max[i], a.min[i] - b.max[i]);
      s += g * g;
    }
    return Math.sqrt(s);
  }
  function pointBoxDist(b, p) {
    let s = 0;
    for (let i = 0; i < 3; i++) {
      const g = Math.max(0, b.min[i] - p[i], p[i] - b.max[i]);
      s += g * g;
    }
    return Math.sqrt(s);
  }
  /* exact distance between segments p1-q1 and p2-q2 (Ericson, Real-Time
     Collision Detection 5.1.9), parallel and degenerate cases included */
  function segSegDist(p1, q1, p2, q2) {
    const d1 = sub(q1, p1), d2 = sub(q2, p2), r = sub(p1, p2);
    const a = dot(d1, d1), e = dot(d2, d2), f = dot(d2, r);
    const EPS = 1e-12;
    let s, t;
    if (a <= EPS && e <= EPS) return len(r);
    if (a <= EPS) { s = 0; t = Math.min(1, Math.max(0, f / e)); }
    else {
      const c = dot(d1, r);
      if (e <= EPS) { t = 0; s = Math.min(1, Math.max(0, -c / a)); }
      else {
        const b = dot(d1, d2), den = a * e - b * b;
        s = den > EPS ? Math.min(1, Math.max(0, (b * f - c * e) / den)) : 0;
        t = (b * s + f) / e;
        if (t < 0) { t = 0; s = Math.min(1, Math.max(0, -c / a)); }
        else if (t > 1) { t = 1; s = Math.min(1, Math.max(0, (b - c) / a)); }
      }
    }
    return len(sub(sa(p1, d1, s), sa(p2, d2, t)));
  }
  /* distance from segment a-b to a box. Exact for axis-aligned segments
     (their bounding box is the segment); otherwise golden-section search on
     the convex function t -> distance(point(t), box), to 1e-9 of the length. */
  function segBoxDist(a, b, box) {
    const d = sub(b, a);
    const nz = (d[0] !== 0) + (d[1] !== 0) + (d[2] !== 0);
    if (nz <= 1) {
      return boxBoxDist({ min: [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.min(a[2], b[2])],
        max: [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.max(a[2], b[2])] }, box);
    }
    const f = (t) => pointBoxDist(box, sa(a, d, t));
    let lo = 0, hi = 1;
    const gr = (Math.sqrt(5) - 1) / 2;
    let x1 = hi - gr * (hi - lo), x2 = lo + gr * (hi - lo), f1 = f(x1), f2 = f(x2);
    for (let it = 0; it < 60; it++) {
      if (f1 < f2) { hi = x2; x2 = x1; f2 = f1; x1 = hi - gr * (hi - lo); f1 = f(x1); }
      else { lo = x1; x1 = x2; f1 = f2; x2 = lo + gr * (hi - lo); f2 = f(x2); }
    }
    return Math.min(f(0), f(1), f1, f2);
  }

  /* ---- lanes -------------------------------------------------------------
     Output shape, the one HikyakuTraffic.makeLane takes (written in parallel
     in assets/js/hikyaku-traffic.js; keep the two in step):
       { points: [[x, y, z], ...]  polyline in world metres, already in travel
                  order, so no dir field (makeLane reverses on dir < 0)
         speed    m/s, the same for every vehicle on the lane
         spacing  metres between vehicle centres along the lane
         types    weights { hauler, pod, drone } (the concept's 'car' is 'pod')
         phase    metres, arc-length offset of the first slot, 0..spacing
         loop     false: vehicles enter at the first point, vanish at the last
         up       vehicle up hint; horizontal on vertical lanes, so lift
                  traffic does not fly belly to the side by accident
         express  true on the big lanes (wider far streaks) }
     plus fields traffic ignores: id, axis (world axis), kind, mix (the
     concept's type list), local (the lane in block coordinates). */
  const MIX = {
    big: ['hauler', 'car', 'car', 'hauler', 'car'],
    small: ['car', 'drone', 'car'],
    city: ['car', 'car', 'hauler', 'drone'],
    lift: ['car', 'drone', 'drone']
  };
  /* mean of the concept's random gap range per kind */
  const SPACING = { big: 46, small: 92, city: 110, lift: 60 };

  /* Is the lane free through the block? Every voxel it passes must be empty. */
  function laneOpen(g, axis, p) {
    const N = g.N;
    for (let s = 0; s < N; s++) {
      let i, j, k;
      if (axis === 'x') { i = s; j = Math.floor(p[1] / DIM.sy); k = Math.floor((p[2] - Z0) / DIM.sz); }
      else if (axis === 'z') { k = s; j = Math.floor(p[1] / DIM.sy); i = Math.floor((p[0] - X0) / DIM.sx); }
      else { j = s; i = Math.floor((p[0] - X0) / DIM.sx); k = Math.floor((p[2] - Z0) / DIM.sz); }
      if (g.isSolid(i, j, k)) return false;
    }
    return true;
  }

  /* Lanes in block-local coordinates, as in the concept: { axis, p, s0, s1,
     dir, v, mix, kind }. Changes: the horizontal reach and the vertical span
     are options (the concept ran every lane 1.5 km each way), and the city
     streets and plaza lifts beside the block are off by default, because the
     city around the block belongs to hikyaku-city.js. */
  function localLanes(g, opts) {
    opts = opts || {};
    const reach = opts.reach == null ? 700 : opts.reach;
    const vspan = opts.vspan || [-40, 640];
    const cityStreets = opts.cityStreets == null ? 0 : opts.cityStreets;
    const cityRowsX = opts.cityRowsX || [2, 6], cityRowsZ = opts.cityRowsZ || [3, 5];
    const plaza = !!opts.plaza;
    const r = mulberry32(g.seed * 7 + 3);
    const lanes = [];
    let n = 0;
    const addL = (axis, p, kind) => {
      const v = kind === 'big' ? 34 + 10 * r() : kind === 'small' ? 20 + 8 * r() : kind === 'lift' ? 12 + 6 * r() : 28 + 16 * r();
      lanes.push({ axis: axis, p: p, s0: axis === 'y' ? vspan[0] : -reach, s1: axis === 'y' ? vspan[1] : reach,
        dir: (n++ % 2) ? 1 : -1, v: v, mix: MIX[kind], kind: kind });
    };
    const bigRowsX = [4], bigRowsZ = [3, 5];
    for (const z of [-81, -27, 27, 81]) for (let j = 0; j < 9; j += 2) {
      const p = [0, ROW_Y(j), z];
      if (!laneOpen(g, 'x', p)) continue;
      addL('x', p, Math.abs(z) === 27 && bigRowsX.indexOf(j) >= 0 ? 'big' : 'small');
    }
    for (const x of [-81, -27, 27, 81]) for (let j = 1; j < 9; j += 2) {
      const p = [x, ROW_Y(j), 0];
      if (!laneOpen(g, 'z', p)) continue;
      addL('z', p, Math.abs(x) === 27 && bigRowsZ.indexOf(j) >= 0 ? 'big' : 'small');
    }
    for (const x of [-108, -54, 0, 54, 108]) for (const z of [-108, -54, 0, 54, 108]) {
      const p = [x, 0, z];
      if (!laneOpen(g, 'y', p)) continue;
      addL('y', p, 'lift');
    }
    for (let s = 1; s <= cityStreets; s++) for (const sg of [-1, 1]) {
      const c = sg * (81 + PITCH * s);
      for (const j of cityRowsX) addL('x', [0, ROW_Y(j), c], 'city');
      for (const j of cityRowsZ) addL('z', [c, ROW_Y(j), 0], 'city');
    }
    if (plaza) for (const xz of [[162, 0], [-162, 0], [0, 162], [0, -162]]) addL('y', [xz[0], 0, xz[1]], 'lift');
    return lanes;
  }
  function localEnds(l) {
    const ax = 'xyz'.indexOf(l.axis);
    const A = l.p.slice(), B = l.p.slice();
    A[ax] = l.dir > 0 ? l.s0 : l.s1;
    B[ax] = l.dir > 0 ? l.s1 : l.s0;
    return [A, B];
  }

  /* World lanes in the traffic shape. opts: origin, yaw, reach, vspan,
     cityStreets, cityRowsX, cityRowsZ, plaza (see localLanes). */
  function makeLanes(g, opts) {
    opts = opts || {};
    const F = makeFrame(opts.origin, opts.yaw);
    const ph = mulberry32(g.seed * 13 + 5);
    return localLanes(g, opts).map((l, id) => {
      const ends = localEnds(l);
      const dW = F.dirW(l.axis === 'x' ? [1, 0, 0] : l.axis === 'y' ? [0, 1, 0] : [0, 0, 1]);
      const axis = Math.abs(dW[0]) > 0.5 ? 'x' : Math.abs(dW[1]) > 0.5 ? 'y' : 'z';
      const sp = SPACING[l.kind];
      const types = { hauler: 0, pod: 0, drone: 0 };
      for (const t of l.mix) types[t === 'car' ? 'pod' : t] += 1 / l.mix.length;
      return {
        id: id, axis: axis, kind: l.kind,
        points: ends.map(F.toWorld), speed: l.v, spacing: sp, types: types,
        phase: ph() * sp, loop: false,
        up: l.axis === 'y' ? F.dirW([1, 0, 0]) : [0, 1, 0],
        express: l.kind === 'big', mix: l.mix.slice(),
        local: l
      };
    });
  }

  /* The proof: exact minimum distance over all lane pairs (segment against
     segment, over every segment of every polyline). The only deviation of a
     vehicle from its lane line in the concept's traffic was the hover bob,
     |0.12 sin(...)| <= 0.12 m, so vehicle centres of two lanes are at least
     d - 2 bob apart. pairs counts lane pairs, as the concept did. */
  function checkSeparation(lanes, opts) {
    const bob = opts && opts.bob != null ? opts.bob : 0.12;
    let best = { d: Infinity, a: null, b: null };
    let pairs = 0;
    for (let a = 0; a < lanes.length; a++) for (let b = a + 1; b < lanes.length; b++) {
      pairs++;
      const P = lanes[a].points, Q = lanes[b].points;
      for (let i = 0; i + 1 < P.length; i++) for (let j = 0; j + 1 < Q.length; j++) {
        const d = segSegDist(P[i], P[i + 1], Q[j], Q[j + 1]);
        if (d < best.d) best = { d: d, a: lanes[a], b: lanes[b] };
      }
    }
    return { pairs: pairs, minCenterline: best.d, minVehicleCentres: best.d - 2 * bob, a: best.a, b: best.b };
  }
  /* min distance from any lane to any box ({min, max}) */
  function checkWalls(lanes, boxes) {
    let best = { d: Infinity, lane: null, box: null };
    for (const l of lanes) {
      const P = l.points;
      for (let i = 0; i + 1 < P.length; i++) for (const b of boxes) {
        const d = segBoxDist(P[i], P[i + 1], b);
        if (d < best.d) best = { d: d, lane: l, box: b };
      }
    }
    return best;
  }

  /* ---- the block --------------------------------------------------------- */
  /* opts: origin {x, y, z} or [x, y, z] (centre of the base), yaw (multiple
     of pi/2), grid (makeGrid opts), lanes (makeLanes opts), idxBase. */
  function makeBlock(seed, opts) {
    opts = opts || {};
    const g = makeGrid(seed, opts.grid);
    const F = makeFrame(opts.origin, opts.yaw);
    const m = mergeSolids(g);
    const base = opts.idxBase || 0;
    const boxes = m.cells.map((c, n) => worldBox(F, cellLo(c.i0, c.j0, c.k0), cellLo(c.i1 + 1, c.j1 + 1, c.k1 + 1), base + n));
    const bounds = F.boxW([X0, 0, Z0], [-X0, H, -Z0]);
    const lopt = Object.assign({}, opts.lanes || {}, { origin: F.origin, yaw: F.yaw });
    const block = {
      seed: g.seed, grid: g, frame: F, origin: F.origin, yaw: F.yaw,
      size: [W, H, D], bounds: bounds, boxes: boxes, vox: m.vox,
      lanes: makeLanes(g, lopt), _stamp: new Int32Array(boxes.length), _tick: 0
    };
    return block;
  }

  /* Boxes whose bounds come within r of world point p, for the ship's
     contacts. Looks up the voxels the query cube touches, so it costs a few
     dozen array reads, and returns the same boxes as a brute-force scan. */
  function boxesNear(block, p, r) {
    const out = [];
    const b = block.bounds;
    if (p[0] < b.min[0] - r || p[0] > b.max[0] + r || p[1] < b.min[1] - r || p[1] > b.max[1] + r ||
        p[2] < b.min[2] - r || p[2] > b.max[2] + r) return out;
    const F = block.frame, g = block.grid, N = g.N;
    const pl = F.toLocal(p);
    const cl = (v) => Math.max(0, Math.min(N - 1, v));
    const i0 = cl(Math.floor((pl[0] - r - X0) / DIM.sx)), i1 = cl(Math.floor((pl[0] + r - X0) / DIM.sx));
    const j0 = cl(Math.floor((pl[1] - r) / DIM.sy)), j1 = cl(Math.floor((pl[1] + r) / DIM.sy));
    const k0 = cl(Math.floor((pl[2] - r - Z0) / DIM.sz)), k1 = cl(Math.floor((pl[2] + r - Z0) / DIM.sz));
    const tick = ++block._tick, st = block._stamp;
    for (let k = k0; k <= k1; k++) for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const id = block.vox[g.at(i, j, k)];
      if (id < 0 || st[id] === tick) continue;
      st[id] = tick;
      const bx = block.boxes[id];
      if (pointBoxDist(bx, p) <= r) out.push(bx);
    }
    return out;
  }

  /* Distance from world point p to the nearest solid box (Infinity if the
     block has none). For a route generator that wants to check the samples
     of its own spline through the block. */
  function clearance(block, p) {
    let d = Infinity;
    for (const b of block.boxes) { const e = pointBoxDist(b, p); if (e < d) d = e; }
    return d;
  }
  function segClearance(block, a, b) {
    let d = Infinity;
    for (const bx of block.boxes) { const e = segBoxDist(a, b, bx); if (e < d) d = e; }
    return d;
  }

  /* Is world point p inside the block's bounding volume (grown by margin)? */
  function inside(block, p, margin) {
    const m = margin || 0, b = block.bounds;
    return p[0] >= b.min[0] - m && p[0] <= b.max[0] + m && p[1] >= b.min[1] - m && p[1] <= b.max[1] + m &&
      p[2] >= b.min[2] - m && p[2] <= b.max[2] + m;
  }

  /* ---- portals -----------------------------------------------------------
     The big mouths: level-1 voids on the block boundary, one per side face
     (the x and z tunnels) plus the top of the shaft. The bottom of the shaft
     opens onto the ground and is not a portal. Local description:
     { side, n, c, u, v, w, h } with c the centre on the face plane, u and v
     the in-plane axes, w and h the extents along them. */
  function localMouths(g) {
    const N = g.N;
    const sides = [
      { side: '+x', n: [1, 0, 0], test: (i) => i === N - 1 }, { side: '-x', n: [-1, 0, 0], test: (i) => i === 0 },
      { side: '+z', n: [0, 0, 1], test: (i, j, k) => k === N - 1 }, { side: '-z', n: [0, 0, -1], test: (i, j, k) => k === 0 },
      { side: 'top', n: [0, 1, 0], test: (i, j) => j === N - 1 }
    ];
    const out = [];
    for (const sd of sides) {
      const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
      let any = false;
      for (let k = 0; k < N; k++) for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
        if (!sd.test(i, j, k) || g.kindAt(i, j, k) !== VOID_L1) continue;
        any = true;
        const p = cellLo(i, j, k), q = cellLo(i + 1, j + 1, k + 1);
        for (let a = 0; a < 3; a++) { mn[a] = Math.min(mn[a], p[a]); mx[a] = Math.max(mx[a], q[a]); }
      }
      if (!any) continue;
      const n = sd.n, ax = n[0] ? 0 : n[1] ? 1 : 2;
      const c = [(mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, (mn[2] + mx[2]) / 2];
      c[ax] = n[ax] > 0 ? mx[ax] : mn[ax];
      const u = n[1] ? [1, 0, 0] : cross(UP, n);
      const v = n[1] ? [0, 0, 1] : UP.slice();
      const ext = (e) => Math.abs(e[0]) * (mx[0] - mn[0]) + Math.abs(e[1]) * (mx[1] - mn[1]) + Math.abs(e[2]) * (mx[2] - mn[2]);
      out.push({ side: sd.side, n: n, c: c, u: u, v: v, w: ext(u), h: ext(v), lo: mn, hi: mx });
    }
    return out;
  }
  function worldSide(n) {
    if (n[1] > 0.5) return 'top';
    return (Math.abs(n[0]) > 0.5 ? (n[0] > 0 ? '+x' : '-x') : (n[2] > 0 ? '+z' : '-z'));
  }

  /* World portal descriptors for the route generator and the renderer:
     { id, p, n, w, h, right, up, depth, kind: 'portal', biome: 'menger' }.
     p is the centre of the opening on the face plane, n the outward normal,
     right and up the frame of a pilot flying in (travel direction -n), w the
     width along right and h the height along up, depth the straight free
     run behind the centre of the opening along -n (243 m through a tunnel,
     288 m down the shaft). id is the world side ('+x',
     '-x', '+z', '-z', 'top'), so it does not depend on the yaw. The warm rim
     that build() draws stands 2.5 m proud of p, around the w x h opening. */
  function portals(block) {
    const F = block.frame;
    return localMouths(block.grid).map((m) => {
      const n = F.dirW(m.n);
      const dir = mul(n, -1);
      const upL = m.n[1] ? [0, 0, -1] : UP;
      const up = F.dirW(upL);
      const right = cross(dir, up);
      /* straight free run behind the centre of the opening */
      const g = block.grid, ax = m.n[0] ? 0 : m.n[1] ? 1 : 2, step = [DIM.sx, DIM.sy, DIM.sz][ax];
      let depth = 0;
      for (;;) {
        const q = sa(m.c, m.n, -(depth + step / 2));
        const kd = g.kindAt(Math.floor((q[0] - X0) / DIM.sx), Math.floor(q[1] / DIM.sy), Math.floor((q[2] - Z0) / DIM.sz));
        if (kd !== VOID_L1) break;
        depth += step;
      }
      return {
        id: worldSide(n), p: F.toWorld(m.c), n: n, w: m.w, h: m.h,
        right: right, up: up, depth: depth,
        kind: 'portal', biome: 'menger', side: m.side
      };
    });
  }

  /* ---- a path through the block -----------------------------------------
     Candidates in local coordinates. Every side mouth leads into a tunnel of
     81 x 96 m (y 96..192); the side legs run at a height between the lane
     rows and at a lateral offset, the shaft leg at an (x, z) offset. Per pair
     of mouths the candidate with the widest gap to every lane wins, among
     those whose segments keep clear of every solid box; ties go to the
     smaller offsets. */
  const FT_Y = [128, 160], FT_OFF = [-27, -13.5, 0, 13.5, 27];
  function sideInfo(side) {
    if (side === '+x') return { n: [1, 0, 0], ax: 0, lat: 2 };
    if (side === '-x') return { n: [-1, 0, 0], ax: 0, lat: 2 };
    if (side === '+z') return { n: [0, 0, 1], ax: 2, lat: 0 };
    if (side === '-z') return { n: [0, 0, -1], ax: 2, lat: 0 };
    return { n: [0, 1, 0], ax: 1, lat: -1 };
  }
  function ftCandidates(e, x, lead) {
    const E = sideInfo(e), X = sideInfo(x), out = [];
    const face = (inf) => (inf.ax === 1 ? H : (inf.n[inf.ax] > 0 ? -X0 : X0));
    const mouthPt = (inf, y, lat, latOther) => {
      const p = [0, y, 0];
      if (inf.ax === 1) { p[0] = lat; p[2] = latOther; p[1] = H; return p; }
      p[inf.ax] = face(inf); p[inf.lat] = lat;
      return p;
    };
    const outPt = (inf, m) => sa(m, inf.n, lead);
    if (E.ax !== 1 && X.ax !== 1) {
      for (const y of FT_Y) {
        if (E.ax === X.ax) {
          for (const o of FT_OFF) {
            const Em = mouthPt(E, y, o), Xm = mouthPt(X, y, o);
            const Cn = [0, y, 0]; Cn[E.lat] = o;
            out.push({ pts: [outPt(E, Em), Em, Cn, Xm, outPt(X, Xm)], kinds: ['approach', 'portal', 'centre', 'portal', 'leave'], off: Math.abs(o), y: y });
          }
        } else {
          for (const oe of FT_OFF) for (const ox of FT_OFF) {
            const Em = mouthPt(E, y, oe), Xm = mouthPt(X, y, ox);
            const Cn = [0, y, 0]; Cn[E.lat] = oe; Cn[X.lat] = ox;
            out.push({ pts: [outPt(E, Em), Em, Cn, Xm, outPt(X, Xm)], kinds: ['approach', 'portal', 'corner', 'portal', 'leave'], off: Math.abs(oe) + Math.abs(ox), y: y });
          }
        }
      }
    } else {
      const S = E.ax === 1 ? X : E;
      for (const y of FT_Y) for (const o of FT_OFF) for (const q of FT_OFF) {
        const Sm = mouthPt(S, y, o);
        const Cn = [0, y, 0]; Cn[S.lat] = o; Cn[S.ax] = q;
        const Tm = [Cn[0], H, Cn[2]];
        let pts = [outPt(S, Sm), Sm, Cn, Tm, outPt(sideInfo('top'), Tm)];
        let kinds = ['approach', 'portal', 'corner', 'portal', 'leave'];
        if (E.ax === 1) { pts = pts.reverse(); }
        out.push({ pts: pts, kinds: kinds, off: Math.abs(o) + Math.abs(q), y: y });
      }
    }
    return out;
  }

  /* opts: entry and exit as portal ids ('+x', '-x', '+z', '-z', 'top', in
     world terms), or dir, the world travel direction the route arrives with
     (entry = the side mouth facing it, exit = the opposite side); lead, the
     length of the approach and leave legs outside the mouths (40 m); clear,
     the wall clearance every segment must keep (10 m, the ring radius).
     Returns { entry, exit, points, waypoints, wallClear, laneGap, length }
     in world coordinates, or null if no candidate keeps the clearance.
     waypoints[i] = { p, dir, up, kind, portal }: kind 'approach', 'portal',
     'centre' or 'corner', 'portal', 'leave'; dir the facing (travel)
     direction, the bisector at a corner. The legs are straight segments; a
     spline through the points rounds the corner by a few metres, which the
     27 m of side clearance in the tunnels absorbs (check with clearance()). */
  function flythrough(block, opts) {
    opts = opts || {};
    const F = block.frame;
    const lead = opts.lead == null ? 40 : opts.lead;
    const clear = opts.clear == null ? 10 : opts.clear;
    const ps = portals(block);
    const byId = {};
    for (const p of ps) byId[p.id] = p;
    let entry = opts.entry, exit = opts.exit;
    if (!entry && opts.dir) {
      let best = Infinity;
      for (const p of ps) if (p.id !== 'top') { const s = dot(p.n, opts.dir); if (s < best) { best = s; entry = p.id; } }
    }
    if (!entry) entry = ps.find((p) => p.id !== 'top').id;
    if (!exit) {
      const en = byId[entry].n;
      const opp = ps.find((p) => dot(p.n, en) < -0.5);
      exit = opp ? opp.id : ps.find((p) => p.id !== entry).id;
    }
    if (!byId[entry] || !byId[exit] || entry === exit) return null;
    const eL = byId[entry].side, xL = byId[exit].side;
    const cands = ftCandidates(eL, xL, lead);
    let best = null;
    for (const c of cands) {
      const W_ = c.pts.map(F.toWorld);
      let wall = Infinity, gap = Infinity;
      for (let i = 0; i + 1 < W_.length; i++) {
        wall = Math.min(wall, segClearance(block, W_[i], W_[i + 1]));
        if (wall < clear) break;
        for (const l of block.lanes) for (let k = 0; k + 1 < l.points.length; k++) {
          gap = Math.min(gap, segSegDist(W_[i], W_[i + 1], l.points[k], l.points[k + 1]));
        }
      }
      if (wall < clear) continue;
      const better = !best || gap > best.gap + 1e-6 ||
        (Math.abs(gap - best.gap) <= 1e-6 && (c.off < best.c.off - 1e-6 || (Math.abs(c.off - best.c.off) <= 1e-6 && c.y < best.c.y)));
      if (better) best = { c: c, pts: W_, wall: wall, gap: gap };
    }
    if (!best) return null;
    const P = best.pts, wps = [];
    let length = 0;
    for (let i = 0; i < P.length; i++) {
      const din = i > 0 ? norm(sub(P[i], P[i - 1])) : null, dout = i + 1 < P.length ? norm(sub(P[i + 1], P[i])) : null;
      const dir = norm(din && dout ? add(din, dout) : (din || dout));
      const up = Math.abs(dir[1]) > 0.9 ? F.dirW([1, 0, 0]) : UP.slice();
      const kind = best.c.kinds[i];
      wps.push({ p: P[i], dir: dir, up: up, kind: kind,
        portal: kind === 'portal' ? (i < 2 ? entry : exit) : null });
      if (i) length += len(sub(P[i], P[i - 1]));
    }
    return { entry: entry, exit: exit, points: P, waypoints: wps, wallClear: best.wall, laneGap: best.gap, length: length };
  }

  /* The lanes for HikyakuTraffic.createTraffic (see the shape above). The
     block does not run traffic itself; the page owns one traffic system. */
  function laneSet(block) { return block.lanes; }

  /* Keep-out corridors of the lanes for a city generator ("the city must
     know the lanes"): one world AABB per lane segment, grown by r (default
     14 m: the hauler's half length plus margin). */
  function laneCorridors(block, r) {
    r = r == null ? 14 : r;
    const out = [];
    for (const l of block.lanes) for (let i = 0; i + 1 < l.points.length; i++) {
      const a = l.points[i], b = l.points[i + 1];
      out.push({ min: [Math.min(a[0], b[0]) - r, Math.min(a[1], b[1]) - r, Math.min(a[2], b[2]) - r],
        max: [Math.max(a[0], b[0]) + r, Math.max(a[1], b[1]) + r, Math.max(a[2], b[2]) + r], lane: l.id });
    }
    return out;
  }

  /* =====================================================================
     Visual layer. Everything below takes THREE as a parameter.
     ===================================================================== */

  function boneStops() {
    const CR = globalThis.ColorRamps;
    const r = CR && CR.rampById('bone');
    if (!r || r.id !== 'bone') {
      throw new Error('Menger.build needs ColorRamps: load /assets/js/colorramps.js before menger.js runs build()');
    }
    return r.stops;
  }
  function boneRGB(stops, t) {
    t = Math.min(1, Math.max(0, t)) * (stops.length - 1);
    const i = Math.min(stops.length - 2, Math.floor(t)), f = t - i;
    const a = stops[i], b = stops[i + 1];
    return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
  }

  const KIND = { OUTER: 0, ROOF: 1, BIG: 2, SMALL: 3, LOGGIA: 4, REVEAL: 5 };
  const DIRS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];

  /* Fog for the custom shaders, written out instead of taken from three's
     chunks so the module does not depend on a renderer to resolve includes.
     The renderer fills the four uniforms whenever material.fog is true. */
  const FOG_GLSL = `
#ifdef MG_CG
/*CG_FOG*/
float mgFog(vec3 w, float k){ return cgFogAmt(w, k); }
vec3 mgFogC(vec3 w){ return cgFogColor(w); }
#elif defined(USE_FOG)
uniform vec3 fogColor; uniform float fogNear; uniform float fogFar; uniform float fogDensity;
vec3 mgFogC(vec3 w){ return fogColor; }
float mgFog(vec3 w, float k){
  float d = length(w - cameraPosition) * k;
#ifdef FOG_EXP2
  return 1.0 - exp(-fogDensity * fogDensity * d * d);
#else
  return smoothstep(fogNear, fogFar, d);
#endif
}
#else
float mgFog(vec3 w, float k){ return 0.0; }
vec3 mgFogC(vec3 w){ return vec3(0.0); }
#endif
`;
  function fogUniforms(THREE) {
    return { fogColor: { value: new THREE.Color() }, fogNear: { value: 1 }, fogFar: { value: 2000 }, fogDensity: { value: 0.00025 } };
  }
  /* The page's own height fog (hikyaku-city.js makeFog), when build() gets
     opts.fog. The lit materials go through fog.patch like everything else
     on the page; fog.patch sets its own program cache key, which is
     combined with the material's key here so a patched facade never shares
     a program with a plain patched material. The custom shaders get the
     atmosphere's declarations through fog.inject (MG_CG): its fog depends
     on both ends of the ray, so mgFog takes the world position. Without
     opts.fog the module keeps using three's scene fog, as in the concept
     scenes. */
  function cgPatch(fog, mat, o) {
    if (!fog) return mat;
    const k0 = mat.customProgramCacheKey.bind(mat);
    fog.patch(mat, o);
    const k1 = mat.customProgramCacheKey.bind(mat);
    mat.customProgramCacheKey = function () { return k0() + '|' + k1(); };
    return mat;
  }
  function cgShader(fog, mat) {
    if (!fog || !mat || !mat.isShaderMaterial) return mat;
    mat.defines = Object.assign(mat.defines || {}, { MG_CG: '' });
    return fog.inject(mat);
  }

  /* ---- facade material ---------------------------------------------------
     The concept's shader, in block-local coordinates (vMbL) so the pattern
     stays on the voxel lattice wherever the block stands. The interior
     mapping needs the eye in the same frame: uMbCam is the camera position
     in block-local space, set by the mesh's onBeforeRender. Changes against
     the concept: the big-hole ceilings carry fewer, dimmer spots; the walls
     of the big holes differ in strength per face instead of all shouting;
     the small holes glow faintly so they no longer read as black squares
     from afar; and the warm light of the portal rims spills a little onto
     the tunnel faces near each mouth (no point lights needed). */
  const MB_DECL = `
varying vec3 vMbN; varying float vKind; varying float vSeed; varying vec3 vMbL;
uniform vec3 uMbLo; uniform vec3 uMbHi; uniform vec3 uMbWarm; uniform vec3 uMbCyan; uniform float uMbGain;
uniform vec3 uMbCam; uniform vec4 uMbPort[5]; uniform float uMbSpill; uniform float uMbSmall;
float mbH(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
float mbN(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mbH(i), mbH(i + vec2(1.0, 0.0)), f.x), mix(mbH(i + vec2(0.0, 1.0)), mbH(i + vec2(1.0, 1.0)), f.x), f.y); }
float mbBox(vec2 f, vec4 r, vec2 fw){
  vec2 a = smoothstep(r.xy - fw, r.xy + fw, f); vec2 b = 1.0 - smoothstep(r.zw - fw, r.zw + fw, f);
  return a.x * a.y * b.x * b.y; }
/* Interior mapping: the window cell (f in 0..1, id) looks into a box room of
 * cell.x x cell.y x depth behind the wall. Ray from the eye, hit the far
 * planes, shade by plane, plus one silhouette card (desk, person) at 40 %
 * depth and sometimes blinds. Returns emitted colour; lit = room light on. */
vec3 mbRoom(vec3 wp, vec3 V, vec3 n, vec3 t, vec2 cell, float depth, vec2 f, vec2 id, float litRate, float salt, out float lit){
  vec2 rfw = fwidth(wp.xz + vec2(wp.y)) / cell;
  vec3 d = vec3(dot(V, t) / cell.x, V.y / cell.y, max(dot(V, -n), 0.02) / depth);
  vec3 o = vec3(f, 0.0);
  float tx = d.x > 0.0 ? (1.0 - o.x) / d.x : -o.x / min(d.x, -1e-5);
  float ty = d.y > 0.0 ? (1.0 - o.y) / d.y : -o.y / min(d.y, -1e-5);
  float tz = 1.0 / d.z;
  float tm = min(min(tx, ty), tz);
  vec3 hp = o + d * tm;
  float h = mbH(id + salt);
  float h2 = mbH(id.yx * 1.37 + salt + 5.1);
  lit = step(h, litRate);
  vec3 col = mix(vec3(1.0, 0.84, 0.62), vec3(0.8, 0.87, 0.95), step(0.55, h2));
  if (h2 > 0.955) col = uMbCyan * 0.9; else if (h2 > 0.92) col = uMbWarm * 1.1;
  float sh;
  if (tm == tz) sh = 0.72 + 0.28 * step(0.5, fract(hp.x * 2.0 + h * 9.0)) * step(0.4, hp.y);
  else if (tm == ty) sh = d.y < 0.0 ? 0.28 : 0.6 + 1.8 * exp(-10.0 * dot(hp.xz - 0.5, hp.xz - 0.5));
  else sh = 0.5;
  sh *= mix(1.0, 0.45, clamp(hp.z, 0.0, 1.0));
  float tc = 0.4 / d.z;
  if (tc < tm) {
    vec2 pc = o.xy + d.xy * tc;
    float px = 0.2 + 0.6 * fract(h * 17.0);
    float body = step(abs(pc.x - px), 0.055) * step(pc.y, 0.46);
    float head = step(length((pc - vec2(px, 0.53)) * vec2(cell.x / cell.y, 1.0)), 0.06);
    float desk = step(pc.y, 0.24) * step(abs(pc.x - 0.3 - 0.4 * fract(h * 31.0)), 0.22);
    float m = clamp((body + head) * step(0.5, fract(h * 23.0)) + desk * step(0.35, fract(h * 41.0)), 0.0, 1.0);
    sh = mix(sh, 0.05, m);
  }
  float bl = fract(h2 * 13.0);
  if (bl > 0.62 && f.y > 1.0 - (bl - 0.62) * 1.6) sh = 0.45;
  float far = smoothstep(0.12, 0.4, max(rfw.x, rfw.y));
  sh = mix(sh, 0.62, far);
  return col * sh * (lit + 0.02);
}
/* warm spill of the portal rims: falls off over about 35 m into the tunnel */
float mbSpill(vec3 p){
  float s = 0.0;
  for (int i = 0; i < 5; i++) {
    vec4 q = uMbPort[i];
    if (q.w <= 0.0) continue;
    float d = length(p - q.xyz);
    s += exp(-d / 35.0);
  }
  return s;
}
`;
  const MB_FRAG = `
{
  vec3 n = normalize(vMbN);
  vec3 wp = vMbL;
  vec3 V = normalize(wp - uMbCam);
  float kind = floor(vKind + 0.5);
  bool vert = abs(n.y) < 0.5;
  vec3 t = vert ? normalize(cross(vec3(0.0, 1.0, 0.0), n)) : vec3(1.0, 0.0, 0.0);
  vec2 uv = vert ? vec2(dot(wp, t), wp.y) : wp.xz;
  vec3 dl = wp - uMbLo, dh = uMbHi - wp;
  float depth = min(min(min(dl.x, dh.x), min(dl.z, dh.z)), dh.y);
  float ao = mix(1.0, 0.3, smoothstep(3.0, 75.0, depth));
  vec3 emi = vec3(0.0);
  vec3 dif = vec3(1.0);
  float lit;
  if (kind < 0.5) {
    /* OUTER: big precast panels, rain stains, window ribbons in strata that
       run all the way round the block, piers every 9 m */
    vec2 pg = uv / vec2(9.0, 8.0);
    vec2 pf = fract(pg), pid = floor(pg), fw = fwidth(pg);
    float joint = 1.0 - mbBox(pf, vec4(0.004, 0.006, 0.996, 0.994), fw);
    float tone = 0.94 + 0.08 * mbH(pid);
    float stain = 0.8 + 0.2 * mbN(vec2(uv.x * 0.45, uv.y * 0.01 + floor(uv.x * 0.45) * 3.1));
    dif = vec3(tone * stain * (1.0 - 0.4 * joint));
    /* the Menger lattice, expressed once: a shadow gap at every 32 m row and
       a faint pilaster line at every 27 m column */
    float vr = fract(wp.y / 32.0), uc = fract(uv.x / 27.0 + 0.5);
    float vw = fwidth(wp.y / 32.0), uw = fwidth(uv.x / 27.0);
    float gap = 1.0 - smoothstep(0.012, 0.012 + vw, min(vr, 1.0 - vr));
    float pil = 1.0 - smoothstep(0.02, 0.02 + uw, min(uc, 1.0 - uc));
    dif *= (1.0 - 0.55 * gap) * (1.0 - 0.12 * pil);
    float row = floor(wp.y / 32.0);
    float style = mbH(vec2(row, 7.7));
    float sub = fract(wp.y / 32.0) * 8.0;
    float ribbon = style < 0.42 ? step(1.0, sub) * step(sub, 7.0) : (style < 0.68 ? step(5.0, sub) * step(sub, 7.0) : 0.0);
    vec2 rg = vec2(uv.x / 3.0, wp.y / 4.0);
    vec2 rf = fract(rg), rid = floor(rg), rw = fwidth(rg);
    float win = ribbon * mbBox(vec2(0.5, rf.y), vec4(0.0, 0.5, 1.0, 0.82), rw);
    float p9 = fract(uv.x / 9.0);
    win *= step(0.06, p9);
    vec3 room = mbRoom(wp, V, n, t, vec2(3.0, 4.0), 6.0, rf, rid, 0.035, 1.0, lit);
    float fres = pow(1.0 - abs(dot(V, n)), 3.0);
    emi += (room * 0.7 + vec3(0.05, 0.065, 0.08) * (0.4 + fres)) * win;
    dif *= mix(1.0, 0.1, win);
    emi += dif * vec3(0.1, 0.105, 0.11) * (1.0 - win);
    ao = 1.0;
  } else if (kind < 1.5) {
    /* ROOF and terraces: panel seams, a few service lights */
    vec2 rp = uv / 6.0;
    vec2 rf = abs(fract(rp) - 0.5), rw = fwidth(rp);
    float seam = 1.0 - smoothstep(0.0, rw.x * 1.5 + 0.01, 0.5 - max(rf.x, rf.y));
    float tile = mbH(floor(rp) + 2.0);
    dif = vec3((0.55 + 0.25 * tile) * (1.0 - 0.35 * seam));
    float dt = 1.0 - smoothstep(0.04, 0.07 + rw.x, length(fract(rp) - 0.5));
    emi += vec3(0.9, 0.85, 0.75) * dt * step(0.94, tile) * 0.8;
    ao = 1.0;
  } else if (kind < 3.5) {
    /* hole walls: BIG is the stage (dense lit rooms), SMALL is quiet */
    float big = step(kind, 2.5);
    /* not every stage wall at full strength: one face in three is dimmed */
    float wallK = big > 0.5 ? mix(0.45, 1.0, step(0.33, mbH(vec2(floor(vSeed + 0.5), 3.3)))) : 1.0;
    if (vert) {
      float uc = fract(uv.x / 27.0 + 0.5);
      float core = 1.0 - step(0.07, uc) * step(uc, 0.93);
      float vr = fract(wp.y / 32.0);
      float band = 1.0 - step(0.035, vr) * step(vr, 0.965);
      vec2 cell = vec2(3.0, 4.0);
      vec2 g = uv / cell;
      vec2 f = fract(g), id = floor(g), gw = fwidth(g);
      float floorH = mbH(vec2(id.y, floor(uv.x / 27.0 + 0.5) + floor(vSeed + 0.5) * 1.7));
      vec4 wr = big > 0.5 ? vec4(0.03, 0.24, 0.97, 0.97) : vec4(0.2, 0.42, 0.8, 0.78);
      float win = mbBox(f, wr, gw) * (1.0 - core) * (1.0 - band);
      if (big < 0.5) win *= step(0.5, fract(id.y * 0.5));
      float run = mbH(vec2(floor(id.y / 2.0), floor(uv.x / 27.0 + 0.5) * 0.37 + floor(vSeed + 0.5) * 0.11));
      if (big > 0.5) win *= step(0.42, run);
      float lr = big > 0.5 ? mix(0.02, 0.85, floorH * floorH * floorH) : 0.12;
      vec3 room = mbRoom(wp, V, n, t, cell, big > 0.5 ? 6.0 : 4.0, f, id, lr, 11.0, lit);
      emi += room * win * (big > 0.5 ? 0.95 * wallK : 0.45);
      emi += vec3(0.03, 0.04, 0.05) * win * (0.5 + pow(1.0 - abs(dot(V, n)), 3.0));
      float groove = 1.0 - 0.25 * (1.0 - smoothstep(0.0, 0.05 + gw.y, abs(f.y - 0.5)));
      dif = vec3(0.9 + 0.1 * core) * mix(1.0, 0.1, win) * mix(1.0, 0.75, band) * mix(1.0, groove, big);
      emi += dif * vec3(0.045) * big * (1.0 - win);
      /* small holes: a faint self-lit reveal, so they read as openings */
      emi += dif * vec3(0.07, 0.074, 0.08) * uMbSmall * (1.0 - big) * (1.0 - win);
      ao = mix(ao, 1.0, 0.3 * big + 0.5 * (1.0 - big));
    } else if (n.y < 0.0) {
      /* ceilings: in the big holes a sparse grid of spots, every second row,
         two in five lit; in the small holes the odd panel */
      vec2 lg = uv / (big > 0.5 ? 13.5 : 9.0);
      vec2 lw = fwidth(lg);
      float rr = length(fract(lg) - 0.5);
      vec2 cid = floor(lg);
      float on = big > 0.5 ? step(0.6, mbH(cid + 0.7)) * step(0.5, fract(cid.y * 0.5)) : step(0.7, mbH(cid));
      float panel = (1.0 - smoothstep(0.06, 0.06 + lw.x * 1.5, rr)) * on;
      emi += vec3(1.0, 0.86, 0.68) * panel * (big > 0.5 ? 1.4 : 0.8);
      emi += vec3(1.0, 0.86, 0.68) * exp(-rr * rr * 30.0) * 0.07 * big * on;
      dif = vec3(0.45) * (1.0 - panel);
      emi += dif * vec3(0.05) * uMbSmall * (1.0 - big);
      ao = 1.0;
    } else {
      vec2 lg = uv / 6.0;
      vec2 lf = abs(fract(lg) - 0.5), lw = fwidth(lg);
      float seam = 1.0 - smoothstep(0.0, lw.x * 1.5 + 0.01, 0.5 - max(lf.x, lf.y));
      dif = vec3(0.5) * (1.0 - 0.4 * seam);
      float dl2 = (1.0 - smoothstep(0.05, 0.09, length(fract(lg) - 0.5))) * step(0.82, mbH(floor(lg)));
      emi += uMbWarm * dl2 * 0.7 * big;
      emi += dif * vec3(0.06) * uMbSmall * (1.0 - big);
    }
    emi += uMbWarm * dif * uMbSpill * mbSpill(wp) * big;
  } else if (kind < 4.5) {
    /* LOGGIA: back wall of a level-3 niche, one big glazed lit room */
    vec2 cell = vec2(4.5, 5.33);
    vec2 g = uv / cell;
    vec2 f = fract(g), id = floor(g), gw = fwidth(g);
    float win = mbBox(f, vec4(0.04, 0.06, 0.96, 0.97), gw);
    vec3 room = mbRoom(wp, V, n, t, cell, 8.0, f, id, 0.85, 23.0 + floor(vSeed + 0.5), lit);
    emi += room * win * 1.5;
    dif = vec3(0.6) * mix(1.0, 0.1, win);
    ao = 1.0;
  } else {
    /* REVEAL: niche sides, warm ceiling light */
    dif = vec3(0.55);
    if (n.y < -0.5) emi += uMbWarm * 0.9;
    ao = 1.0;
  }
  diffuseColor.rgb *= dif * ao;
  totalEmissiveRadiance += emi * uMbGain;
}`;

  function makeBlockMaterial(THREE, ctx, o) {
    const mat = new THREE.MeshStandardMaterial({ color: ctx.bone(o.tone), roughness: 0.82, metalness: 0.12 });
    const ports = [];
    for (let i = 0; i < 5; i++) {
      const m = o.mouths[i];
      ports.push(m ? new THREE.Vector4(m.c[0], m.c[1], m.c[2], 1) : new THREE.Vector4(0, 0, 0, 0));
    }
    const u = {
      uMbLo: { value: new THREE.Vector3(X0, 0, Z0) }, uMbHi: { value: new THREE.Vector3(-X0, H, -Z0) },
      uMbWarm: { value: new THREE.Color(o.warm) }, uMbCyan: { value: new THREE.Color(o.accent) },
      uMbGain: { value: o.gain }, uMbCam: { value: new THREE.Vector3(0, 0, 1000) },
      uMbPort: { value: ports }, uMbSpill: { value: o.spill }, uMbSmall: { value: o.small }
    };
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, u);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aKind; attribute float aSeed; varying vec3 vMbN; varying float vKind; varying float vSeed; varying vec3 vMbL;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvKind = aKind; vSeed = aSeed; vMbN = objectNormal; vMbL = transformed;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\n' + MB_DECL)
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n' + MB_FRAG);
    };
    mat.customProgramCacheKey = () => 'menger-facade-1';
    mat.userData.u = u;
    return mat;
  }

  /* ---- batches ---------------------------------------------------------- */
  /* quad soup in block-local space with per-vertex kind and seed */
  function Quads() { this.p = []; this.n = []; this.k = []; this.s = []; }
  /* rectangle centred at c, normal n, in-plane axis a (half size ha) and
     b = n x a (half size hb); front side faces n */
  Quads.prototype.rect = function (c, n, a, ha, hb, kind, seed) {
    const b = cross(n, a);
    const P = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map((q) => sa(sa(c, a, q[0] * ha), b, q[1] * hb));
    for (const i of [0, 1, 2, 0, 2, 3]) {
      this.p.push(P[i][0], P[i][1], P[i][2]); this.n.push(n[0], n[1], n[2]); this.k.push(kind); this.s.push(seed || 0);
    }
  };
  Quads.prototype.build = function (THREE, material) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('aKind', new THREE.Float32BufferAttribute(this.k, 1));
    g.setAttribute('aSeed', new THREE.Float32BufferAttribute(this.s, 1));
    g.computeBoundingSphere();
    return new THREE.Mesh(g, material);
  };

  /* instanced boxes: base centre x, y, z, size w, h, d, bone tone */
  function boxMesh(THREE, ctx, items, material) {
    const geo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
    const mesh = new THREE.InstancedMesh(geo, material, Math.max(1, items.length));
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(), col = new THREE.Color();
    items.forEach((it, i) => {
      m4.compose(p.set(it[0], it[1], it[2]), q, s.set(it[3], it[4], it[5]));
      mesh.setMatrixAt(i, m4);
      mesh.setColorAt(i, ctx.boneC(it[6], col));
    });
    mesh.count = items.length;
    mesh.frustumCulled = false;
    return mesh;
  }
  /* instanced prisms from A to B: square boxes (neon) or cylinders (pipes) */
  function rodMesh(THREE, items, geo, material, colorOf) {
    const mesh = new THREE.InstancedMesh(geo, material, Math.max(1, items.length));
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), mid = new THREE.Vector3(), s = new THREE.Vector3();
    const Y = new THREE.Vector3(0, 1, 0), d = new THREE.Vector3(), col = new THREE.Color();
    items.forEach((it, i) => {
      const A = it[0], B = it[1];
      d.set(B[0] - A[0], B[1] - A[1], B[2] - A[2]);
      const L = d.length() || 1e-3;
      d.divideScalar(L);
      q.setFromUnitVectors(Y, d);
      m4.compose(mid.set((A[0] + B[0]) / 2, (A[1] + B[1]) / 2, (A[2] + B[2]) / 2), q, s.set(it[2], L, it[2]));
      mesh.setMatrixAt(i, m4);
      mesh.setColorAt(i, colorOf(it, col));
    });
    mesh.count = items.length;
    mesh.frustumCulled = false;
    return mesh;
  }

  /* camera-facing additive glow sprites (faked bloom), local positions */
  function glowMesh(THREE, items, fogK) {
    const quad = new THREE.PlaneGeometry(1, 1);
    const g = new THREE.InstancedBufferGeometry();
    g.index = quad.index; g.setAttribute('position', quad.getAttribute('position')); g.setAttribute('uv', quad.getAttribute('uv'));
    const P = [], S = [], C = [];
    for (const it of items) { P.push(it[0][0], it[0][1], it[0][2]); S.push(it[1], it[2]); C.push(it[3][0], it[3][1], it[3][2]); }
    g.setAttribute('iPos', new THREE.InstancedBufferAttribute(new Float32Array(P), 3));
    g.setAttribute('iSize', new THREE.InstancedBufferAttribute(new Float32Array(S), 2));
    g.setAttribute('iCol', new THREE.InstancedBufferAttribute(new Float32Array(C), 3));
    g.instanceCount = items.length;
    quad.dispose();
    const m = new THREE.ShaderMaterial({
      uniforms: Object.assign(fogUniforms(THREE), { uFogK: { value: fogK } }),
      vertexShader: FOG_GLSL + `
uniform float uFogK;
attribute vec3 iPos; attribute vec2 iSize; attribute vec3 iCol;
varying vec2 vUv; varying vec3 vCol;
void main(){
  vec4 mv = modelViewMatrix * vec4(iPos, 1.0);
  mv.xy += position.xy * iSize;
  vUv = uv;
  vCol = iCol * (1.0 - mgFog((modelMatrix * vec4(iPos, 1.0)).xyz, uFogK));
  gl_Position = projectionMatrix * mv;
}`,
      fragmentShader: `varying vec2 vUv; varying vec3 vCol;
void main(){
  float r = length(vUv - 0.5) * 2.0;
  float a = exp(-r * r * 3.5) * clamp(1.0 - r, 0.0, 1.0);
  a += 0.6 * exp(-r * r * 42.0);
  gl_FragColor = vec4(vCol * a, 1.0);
}`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, fog: true
    });
    const mesh = new THREE.Mesh(g, m);
    mesh.frustumCulled = false;
    return mesh;
  }
  /* axial additive billboards from A to B (neon halo, light lines) */
  function streakMesh(THREE, items, fogK) {
    const q = new THREE.PlaneGeometry(1, 2).translate(0.5, 0, 0);
    const g = new THREE.InstancedBufferGeometry();
    g.index = q.index; g.setAttribute('position', q.getAttribute('position'));
    const A = [], B = [], Wd = [], C = [];
    for (const it of items) { A.push(...it[0]); B.push(...it[1]); Wd.push(it[2]); C.push(it[3][0], it[3][1], it[3][2]); }
    g.setAttribute('iA', new THREE.InstancedBufferAttribute(new Float32Array(A), 3));
    g.setAttribute('iB', new THREE.InstancedBufferAttribute(new Float32Array(B), 3));
    g.setAttribute('iW', new THREE.InstancedBufferAttribute(new Float32Array(Wd), 1));
    g.setAttribute('iCol', new THREE.InstancedBufferAttribute(new Float32Array(C), 3));
    g.instanceCount = items.length;
    q.dispose();
    const m = new THREE.ShaderMaterial({
      uniforms: Object.assign(fogUniforms(THREE), { uFogK: { value: fogK } }),
      vertexShader: FOG_GLSL + `
uniform float uFogK;
attribute vec3 iA; attribute vec3 iB; attribute float iW; attribute vec3 iCol;
varying vec2 vP; varying vec3 vCol;
void main(){
  vec3 a = (modelMatrix * vec4(iA, 1.0)).xyz, b = (modelMatrix * vec4(iB, 1.0)).xyz;
  vec3 dir = b - a;
  float L = length(dir);
  vec3 dn = dir / max(L, 1e-4);
  vec3 wp = a + dir * position.x;
  vec3 toCam = cameraPosition - wp;
  vec3 side = normalize(cross(dn, toCam));
  wp += dn * (position.x - 0.5) * 2.0 * iW * 0.6;
  wp += side * position.y * iW;
  vP = position.xy;
  vCol = iCol * (1.0 - mgFog(wp, uFogK));
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}`,
      fragmentShader: `varying vec2 vP; varying vec3 vCol;
void main(){
  float across = exp(-vP.y * vP.y * 5.0) + 0.8 * exp(-vP.y * vP.y * 60.0);
  float ends = smoothstep(0.0, 0.04, vP.x) * (1.0 - smoothstep(0.96, 1.0, vP.x));
  gl_FragColor = vec4(vCol * across * ends, 1.0);
}`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, side: THREE.DoubleSide, fog: true
    });
    const mesh = new THREE.Mesh(g, m);
    mesh.frustumCulled = false;
    return mesh;
  }
  /* Signs without text: the concept drew Latin words and kana into a canvas
     atlas, which needs a Japanese font on the visitor's machine. The neon
     sign atlas is its own later step (handoff, Neonschilder), so here a sign
     is a dark panel with a neon frame and blocks of pseudo-glyphs, drawn in
     the shader from a per-instance seed. One draw call for all of them. */
  function signMesh(THREE, items, fogK) {
    const geo = new THREE.PlaneGeometry(1, 1);
    const n = items.length;
    const mesh = new THREE.InstancedMesh(geo, null, Math.max(1, n));
    const C = new Float32Array(Math.max(1, n) * 3), Sd = new Float32Array(Math.max(1, n) * 3);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3();
    const Z = new THREE.Vector3(0, 0, 1), nv = new THREE.Vector3();
    items.forEach((it, i) => {
      nv.set(it[3][0], it[3][1], it[3][2]);
      q.setFromUnitVectors(Z, nv);
      m4.compose(p.set(it[0][0], it[0][1], it[0][2]), q, s.set(it[1], it[2], 1));
      mesh.setMatrixAt(i, m4);
      C[i * 3] = it[4][0]; C[i * 3 + 1] = it[4][1]; C[i * 3 + 2] = it[4][2];
      Sd[i * 3] = it[5]; Sd[i * 3 + 1] = it[1]; Sd[i * 3 + 2] = it[2];
    });
    geo.setAttribute('iCol', new THREE.InstancedBufferAttribute(C, 3));
    geo.setAttribute('iSeed', new THREE.InstancedBufferAttribute(Sd, 3));
    mesh.material = new THREE.ShaderMaterial({
      uniforms: Object.assign(fogUniforms(THREE), { uFogK: { value: fogK }, uTime: { value: 0 } }),
      vertexShader: FOG_GLSL + `
uniform float uFogK;
attribute vec3 iCol; attribute vec3 iSeed;
varying vec2 vUv; varying vec3 vCol; varying vec3 vSd; varying float vFog; varying vec3 vFogC;
void main(){
  vec4 mv = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
  vUv = uv; vCol = iCol; vSd = iSeed;
  vec3 wq = (modelMatrix * instanceMatrix * vec4(position, 1.0)).xyz;
  vFog = mgFog(wq, uFogK);
  vFogC = mgFogC(wq);
  gl_Position = projectionMatrix * mv;
}`,
      fragmentShader: `
uniform float uTime;
varying vec2 vUv; varying vec3 vCol; varying vec3 vSd; varying float vFog; varying vec3 vFogC;
float sgH(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
void main(){
  vec2 sz = vSd.yz;
  vec2 m = vUv * sz;
  float fr = min(min(m.x, sz.x - m.x), min(m.y, sz.y - m.y));
  float frame = 1.0 - smoothstep(0.12, 0.2, abs(fr - 0.22));
  float vertical = step(sz.x, sz.y);
  float cw = vertical > 0.5 ? sz.x * 0.62 : sz.y * 0.62;
  vec2 o = (m - 0.5 * sz) / cw;
  vec2 cells = floor(sz / cw * 0.92);
  vec2 cid = floor(o + 0.5 * cells), cf = fract(o + 0.5 * cells);
  float inside = step(0.0, cid.x) * step(cid.x, cells.x - 1.0) * step(0.0, cid.y) * step(cid.y, cells.y - 1.0);
  vec2 sub = floor(cf * 3.0), sf = fract(cf * 3.0);
  float stroke = step(0.45, sgH(cid * 3.1 + sub + vSd.x)) * step(0.08, cf.x) * step(cf.x, 0.92) * step(0.08, cf.y) * step(cf.y, 0.92);
  stroke *= step(0.15, sf.x) * step(sf.x, 0.85) + step(0.15, sf.y) * step(sf.y, 0.85) > 0.5 ? 1.0 : 0.0;
  float glyph = stroke * inside;
  float flick = 0.85 + 0.15 * step(0.5, fract(sin(floor(uTime * 7.0) + vSd.x * 91.0) * 437.5));
  if (fract(vSd.x * 13.7) > 0.12) flick = 1.0;
  vec3 c = vCol * 0.06 + vCol * frame * 1.1 + mix(vCol, vec3(1.0), 0.55) * glyph * 0.95;
  c *= flick;
  c = mix(c, vFogC, vFog);
  gl_FragColor = vec4(c, 1.0);
}`,
      /* a sign hangs a few centimetres in front of its plate or wall: the
         polygon offset keeps it in front at any distance (no z-fighting) */
      side: THREE.DoubleSide, toneMapped: false, fog: true,
      polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1
    });
    mesh.count = n;
    mesh.frustumCulled = false;
    return mesh;
  }
  /* cables: catenaries as thin tubes, merged into one geometry */
  function catenary(A, B, sag, n) {
    const out = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const p = [A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t - sag * 4 * t * (1 - t), A[2] + (B[2] - A[2]) * t];
      out.push(p);
    }
    return out;
  }
  function cableMesh(THREE, items, material) {
    const pos = [], nrm = [], idx = [];
    for (const it of items) {
      const curve = new THREE.CatmullRomCurve3(catenary(it[0], it[1], it[2], 10).map((p) => new THREE.Vector3(p[0], p[1], p[2])));
      const tg = new THREE.TubeGeometry(curve, 16, it[3], 4, false);
      const base = pos.length / 3;
      const P = tg.getAttribute('position').array, Nn = tg.getAttribute('normal').array, I = tg.index.array;
      for (let i = 0; i < P.length; i++) { pos.push(P[i]); nrm.push(Nn[i]); }
      for (let i = 0; i < I.length; i++) idx.push(I[i] + base);
      tg.dispose();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    g.setIndex(idx);
    g.computeBoundingSphere();
    return new THREE.Mesh(g, material);
  }

  /* ---- clearances for details ------------------------------------------- */
  const HALF = { hauler: 11.6, car: 3.0, drone: 3.9 };
  function laneRadius(l) { return Math.max.apply(null, l.mix.map((t) => HALF[t] || 4)) + 1.5; }
  function laneGap(p, l) {
    const ax = 'xyz'.indexOf(l.axis);
    let s = 0;
    for (let i = 0; i < 3; i++) if (i !== ax) { const d = p[i] - l.p[i]; s += d * d; }
    return Math.sqrt(s) - laneRadius(l);
  }
  /* distance from p to a polyline */
  function polyDist(p, P) {
    let d = Infinity;
    for (let i = 0; i + 1 < P.length; i++) d = Math.min(d, segSegDist(p, p, P[i], P[i + 1]));
    return d;
  }

  /* ---- build -------------------------------------------------------------
     build(THREE, block, opts) -> { group, update(t, cameraPos), dispose,
     stats, mouths }. The group carries the block's placement (position =
     origin, rotation.y = yaw); everything inside is in block-local space.
     All real geometry, built once: no LOD on the building, nothing pops.
     opts:
       accent   neon accent (cyan, 0x2ee8ff), edge strips and sign hue
       warm     portal rim and warm lights (0xffa63d, the page's gate colour)
       gain     facade emissive gain (1.6, as the concept)
       tone     bone value of the concrete (0.46)
       spill    warm spill of the rims into the tunnels (0.22)
       small    self-light of the small holes (1)
       paths    polylines (world points) the details keep clear of, default
                the default flythrough; pass the route's own path here
       pathClear clearance of the details from those paths (14 m)
       niches   share of stage walls that get a loggia (0.45)
       guides   dim buoys along the lanes near the block (true)
       lights   number of real point lights at the mouths (0; the rim spill
                in the shader does their job without taxing every material
                in the scene)
       fog      the page's height fog (hikyaku-city.js makeFog); without it
                the materials use three's scene fog
       seed     detail seed (block seed + 1) */
  function build(THREE, block, opts) {
    opts = opts || {};
    const t0 = (typeof performance !== 'undefined' ? performance : Date).now();
    const stops = boneStops();
    const owned = [];
    const ctx = {
      bone: (t) => { const c = boneRGB(stops, t); return new THREE.Color().setRGB(c[0], c[1], c[2], THREE.SRGBColorSpace); },
      boneC: (t, out) => { const c = boneRGB(stops, t); return out.setRGB(c[0], c[1], c[2], THREE.SRGBColorSpace); }
    };
    const accent = opts.accent == null ? ACCENT : opts.accent;
    const warm = opts.warm == null ? WARM : opts.warm;
    /* the additive shaders write raw output values, so feed them sRGB */
    const srgb = (hex, gain) => { const c = new THREE.Color(hex).convertLinearToSRGB(); return [c.r * gain, c.g * gain, c.b * gain]; };
    const srgbB = (t, gain) => { const c = boneRGB(stops, t); return [c[0] * gain, c[1] * gain, c[2] * gain]; };
    const lin = (hex, gain) => new THREE.Color(hex).multiplyScalar(gain);
    const rng = makeRng(opts.seed == null ? block.seed + 1 : opts.seed);
    const g = block.grid, N = g.N, F = block.frame;
    const S = [DIM.sx, DIM.sy, DIM.sz];
    const vc = (i, j, k) => [X0 + (i + 0.5) * S[0], (j + 0.5) * S[1], Z0 + (k + 0.5) * S[2]];
    const lanesL = block.lanes.map((l) => l.local);
    let paths = opts.paths;
    if (!paths) { const ft = flythrough(block); paths = ft ? [ft.points] : []; }
    const pathsL = paths.map((P) => P.map(F.toLocal));
    const pathClear = opts.pathClear == null ? 14 : opts.pathClear;
    const st = { faces: 0, niches: 0, balconies: 0, signs: 0, ducts: 0, cables: 0, strips: 0, rejected: 0, portals: 0, lights: 0 };
    const ok = (pts, m) => {
      for (const p of pts) {
        for (const l of lanesL) if (laneGap(p, l) < m) { st.rejected++; return false; }
        for (const P of pathsL) if (polyDist(p, P) < pathClear) { st.rejected++; return false; }
      }
      return true;
    };

    /* ---- the block mesh ---- */
    const q = new Quads();
    const faces = [];
    for (let k = 0; k < N; k++) for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      if (!g.isSolid(i, j, k)) continue;
      for (let di = 0; di < 6; di++) {
        const dd = DIRS[di], dx = dd[0], dy = dd[1], dz = dd[2];
        const nk = g.kindAt(i + dx, j + dy, k + dz);
        if (nk === SOLID) continue;
        if (nk === -1 && dy < 0) continue;  // ground
        let kind;
        if (nk === -1 || nk === VOID_OPEN) kind = dy > 0 ? KIND.ROOF : KIND.OUTER;
        else kind = nk === VOID_L1 ? KIND.BIG : KIND.SMALL;
        const n = [dx, dy, dz];
        const c = sa(vc(i, j, k), n, 0.5 * Math.abs(dx * S[0] + dy * S[1] + dz * S[2]));
        const vert = dy === 0;
        const a = vert ? cross(UP, n) : [1, 0, 0];
        const ha = vert ? (dx ? S[2] : S[0]) / 2 : S[0] / 2;
        const hb = vert ? S[1] / 2 : S[2] / 2;
        const sd = rng.int(0, 63);   // integer: interpolated varyings must not jitter the hashes
        const f = { i: i, j: j, k: k, di: di, n: n, c: c, a: a, ha: ha, hb: hb, kind: kind, vert: vert, niche: null };
        faces.push(f);
        st.faces++;
        /* level 3: a lit loggia cut into the middle third of some stage walls */
        if (vert && kind === KIND.BIG && rng.chance(opts.niches == null ? 0.45 : opts.niches)) {
          const row = rng.int(0, 2);
          const u0 = -ha / 3, u1 = ha / 3;
          const v0 = -hb + row * (2 * hb / 3), v1 = v0 + 2 * hb / 3;
          const dep = 7;
          f.niche = { row: row, u0: u0, u1: u1, v0: v0, v1: v1, dep: dep };
          st.niches++;
          const piece = (ua, ub, va, vb, kd) => {
            q.rect(sa(sa(c, a, (ua + ub) / 2), UP, (va + vb) / 2), n, a, (ub - ua) / 2, (vb - va) / 2, kd, sd);
          };
          piece(-ha, u0, -hb, hb, kind); piece(u1, ha, -hb, hb, kind);
          if (v0 > -hb + 0.01) piece(u0, u1, -hb, v0, kind);
          if (v1 < hb - 0.01) piece(u0, u1, v1, hb, kind);
          const oc = sa(c, UP, (v0 + v1) / 2);
          q.rect(sa(oc, n, -dep), n, a, (u1 - u0) / 2, (v1 - v0) / 2, KIND.LOGGIA, sd);
          q.rect(sa(sa(oc, a, u0), n, -dep / 2), a, UP, (v1 - v0) / 2, dep / 2, KIND.REVEAL, sd);
          q.rect(sa(sa(oc, a, u1), n, -dep / 2), mul(a, -1), UP, (v1 - v0) / 2, dep / 2, KIND.REVEAL, sd);
          q.rect(sa(sa(oc, UP, (v0 - v1) / 2), n, -dep / 2), UP, a, (u1 - u0) / 2, dep / 2, KIND.REVEAL, sd);
          q.rect(sa(sa(oc, UP, (v1 - v0) / 2), n, -dep / 2), [0, -1, 0], a, (u1 - u0) / 2, dep / 2, KIND.REVEAL, sd);
          continue;
        }
        q.rect(c, n, a, ha, hb, kind, sd);
      }
    }
    const mouths = localMouths(g);
    const mat = makeBlockMaterial(THREE, ctx, {
      tone: opts.tone == null ? 0.46 : opts.tone, gain: opts.gain == null ? 1.6 : opts.gain,
      warm: warm, accent: accent, mouths: mouths,
      spill: opts.spill == null ? 0.22 : opts.spill, small: opts.small == null ? 1 : opts.small
    });
    owned.push(mat);
    const group = new THREE.Group();
    group.name = 'menger';
    group.position.set(F.origin[0], F.origin[1], F.origin[2]);
    group.rotation.y = F.yaw;
    const blockMesh = q.build(THREE, mat);
    blockMesh.name = 'menger-block';
    const camL = new THREE.Vector3();
    blockMesh.onBeforeRender = function (r, s, cam) {
      camL.setFromMatrixPosition(cam.matrixWorld);
      blockMesh.worldToLocal(camL);
      mat.userData.u.uMbCam.value.copy(camL);
    };
    group.add(blockMesh);

    /* ---- details ---- */
    const plain = [], neon = [], glow = [], streaks = [], pipes = [], cables = [], signs = [];
    const lights = [];
    const neonAdd = (A, B, r, hex, gain) => neon.push([A, B, r, lin(hex, gain)]);
    const streakAdd = (A, B, w, hex, gain) => streaks.push([A, B, w, srgb(hex, gain)]);
    const glowAdd = (p, sx, sy, rgb) => glow.push([p, sx, sy, rgb]);
    /* box given by centre, in-plane axis a, normal n, extents, bone tone */
    const boxAt = (c, a, n, wa, h, wn, tone) => {
      const ex = Math.abs(a[0]) * wa + Math.abs(n[0]) * wn, ez = Math.abs(a[2]) * wa + Math.abs(n[2]) * wn;
      plain.push([c[0], c[1] - h / 2, c[2], ex || 0.01, h, ez || 0.01, tone]);
    };
    const signAdd = (c, w, h, n, hex) => { signs.push([c, w, h, n, srgb(hex, 1), rng() * 100]); };
    const hues = [accent, warm];

    /* portals after the portal rule: a concrete collar 2.5 m proud gives the
       opening a reveal you see from the side, a warm ring on its front edge
       and a second one 6 m inside, the four reveal edges between them */
    for (const m of mouths) {
      st.portals++;
      const c = m.c, n = m.n, u = m.u, v = m.v, w = m.w, h = m.h;
      const proud = 2.5, cw = 4;
      const corner = (su, sv, out, inset) => sa(sa(sa(c, u, su * (w / 2 + (inset || 0))), v, sv * (h / 2 + (inset || 0))), n, out);
      const collar = (A, B, thick) => {
        const mid = mul(add(A, B), 0.5), d = sub(B, A);
        const sx = Math.abs(d[0]) + Math.abs(thick[0]), sy = Math.abs(d[1]) + Math.abs(thick[1]), sz = Math.abs(d[2]) + Math.abs(thick[2]);
        plain.push([mid[0], mid[1] - sy / 2, mid[2], sx, sy, sz, 0.3]);
      };
      const tU = mul(u, cw), tV = mul(v, cw), tN = mul(n, proud);
      for (const sv of [-1, 1]) collar(corner(-1, sv, proud / 2, cw / 2), corner(1, sv, proud / 2, cw / 2), add(tV, tN));
      for (const su of [-1, 1]) collar(corner(su, -1, proud / 2, cw / 2), corner(su, 1, proud / 2, cw / 2), add(tU, tN));
      const C4 = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
      for (const ring of [[proud, 2.6, 0.55], [-6, 1.6, 0.4]]) {
        for (let e = 0; e < 4; e++) {
          const A = corner(C4[e][0], C4[e][1], ring[0], -0.3), B = corner(C4[(e + 1) % 4][0], C4[(e + 1) % 4][1], ring[0], -0.3);
          neonAdd(A, B, ring[2], warm, ring[1]);
          streakAdd(A, B, 2.2, warm, ring[0] > 0 ? 0.55 : 0.35);
        }
      }
      for (const ab of C4) {
        const A = corner(ab[0], ab[1], proud, -0.3), B = corner(ab[0], ab[1], -6, -0.3);
        neonAdd(A, B, 0.35, warm, 1.4);
        streakAdd(A, B, 1.4, warm, 0.3);
      }
      glowAdd(sa(c, n, 3), w * 1.3, h * 1.3, srgb(warm, 0.09));
      if (lights.length < (opts.lights || 0)) lights.push({ p: sa(c, n, -14), color: warm, power: 5000, dist: 170 });
    }

    /* small-hole mouths: only a sill line, dim */
    for (let k = 0; k < N; k++) for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      if (g.kindAt(i, j, k) !== VOID_L2) continue;
      for (const dxz of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const dx = dxz[0], dz = dxz[1];
        if (g.kindAt(i + dx, j, k + dz) !== -1) continue;
        if (!g.isSolid(i, j - 1, k) && j > 0) continue;
        const n = [dx, 0, dz];
        const c = sa(vc(i, j, k), n, (dx ? S[0] : S[2]) / 2);
        const u = cross(UP, n);
        const hw = (dx ? S[2] : S[0]) / 2 - 0.4;
        const y = -S[1] / 2 + 0.25;
        neonAdd(sa(sa(sa(c, u, -hw), UP, y), n, 0.2), sa(sa(sa(c, u, hw), UP, y), n, 0.2), 0.18, 0xffffff, 0.55);
        st.strips++;
      }
    }

    /* the stage: walls of the big holes */
    const findOpposite = (f) => {
      let i = f.i, j = f.j, k = f.k, steps = 0;
      const dd = DIRS[f.di];
      do { i += dd[0]; j += dd[1]; k += dd[2]; steps++; } while (g.kindAt(i, j, k) > 0 && steps < 12);
      return g.kindAt(i, j, k) === SOLID ? steps - 1 : -1;
    };
    for (const f of faces) {
      if (f.kind !== KIND.BIG || !f.vert) continue;
      const c = f.c, n = f.n, a = f.a, ha = f.ha, hb = f.hb;
      const nicheU = f.niche ? [f.niche.u0 - 1, f.niche.u1 + 1] : null;
      const inNiche = (ua, ub, va, vb) => !!f.niche && ub > nicheU[0] && ua < nicheU[1] && vb > f.niche.v0 - 1 && va < f.niche.v1 + 1;
      /* balconies: slab, rail, posts, a warm underglow */
      for (let fl = 1; fl < 8; fl++) {
        if (!rng.chance(0.16)) continue;
        const L = rng.range(6, 20), u0 = rng.range(-ha + 1, ha - 1 - L);
        const vy = -hb + fl * 4;
        if (inNiche(u0, u0 + L, vy - 1, vy + 2)) continue;
        const mid = sa(sa(sa(c, a, u0 + L / 2), UP, vy), n, 0.9);
        if (!ok([sa(mid, a, -L / 2), sa(mid, a, L / 2)], 1)) continue;
        boxAt(sa(mid, UP, 0.15), a, n, L, 0.3, 1.8, 0.32);
        boxAt(sa(sa(mid, n, 0.85), UP, 1.15), a, n, L, 0.08, 0.08, 0.5);
        for (let p = 0; p <= L; p += 1.6) boxAt(sa(sa(sa(mid, a, -L / 2 + p), n, 0.85), UP, 1.1), a, n, 0.06, 1.1, 0.06, 0.4);
        const g0 = sa(sa(sa(mid, a, -L / 2 + 0.3), UP, -0.05), n, 0.8), g1 = sa(sa(sa(mid, a, L / 2 - 0.3), UP, -0.05), n, 0.8);
        neonAdd(g0, g1, 0.08, warm, 0.9);
        streakAdd(g0, g1, 0.9, warm, 0.18);
        st.balconies++;
      }
      /* blade sign, sticking out of the wall, double sided */
      if (rng.chance(0.42)) {
        const sh = rng.range(7, 15), sw = rng.range(2.2, 3.4);
        const uu = rng.range(-ha + 2, ha - 2), vy = rng.range(-hb + sh / 2 + 2, hb - sh / 2 - 2);
        if (!inNiche(uu - 1, uu + 1, vy - sh / 2, vy + sh / 2)) {
          const cc = sa(sa(sa(c, a, uu), UP, vy), n, sw / 2 + 0.5);
          if (ok([cc, sa(cc, UP, sh / 2), sa(cc, UP, -sh / 2), sa(cc, n, sw / 2)], 1)) {
            const hex = rng.chance(0.7) ? hues[0] : hues[1];
            boxAt(sa(cc, UP, sh / 2 + 0.2), n, a, sw + 0.3, sh + 0.4, 0.5, 0.08);
            signAdd(sa(cc, a, 0.3), sw, sh, a, hex);
            signAdd(sa(cc, a, -0.3), sw, sh, mul(a, -1), hex);
            glowAdd(sa(cc, n, 0.3), sw * 3, sh * 1.4, srgb(hex, 0.16));
            st.signs++;
          }
        }
      } else if (rng.chance(0.3)) {
        /* flat sign on the wall */
        const sw = rng.range(8, 16), sh = sw * 0.32;
        const uu = rng.range(-ha + sw / 2 + 1, ha - sw / 2 - 1), vy = rng.range(-hb + 4, hb - 4);
        if (!inNiche(uu - sw / 2, uu + sw / 2, vy - sh / 2, vy + sh / 2)) {
          const cc = sa(sa(sa(c, a, uu), UP, vy), n, 0.15);
          const hex = rng.chance(0.7) ? hues[0] : hues[1];
          signAdd(cc, sw, sh, n, hex);
          glowAdd(sa(cc, n, 1), sw * 1.5, sh * 2, srgb(hex, 0.1));
          st.signs++;
        }
      }
      /* duct along the top of the wall */
      if (rng.chance(0.45)) {
        const r = rng.range(0.6, 1.3);
        const y = hb - r - 0.6;
        const A = sa(sa(sa(c, a, -ha), UP, y), n, r + 0.3), B = sa(sa(sa(c, a, ha), UP, y), n, r + 0.3);
        if (ok([A, B, mul(add(A, B), 0.5)], 1)) {
          pipes.push([A, B, r, 0.3]);
          if (rng.chance(0.5)) pipes.push([sa(sa(A, n, r * 2.2), UP, -0.2), sa(sa(B, n, r * 2.2), UP, -0.2), r * 0.45, 0.22]);
          st.ducts++;
        }
      }
      /* vertical riser */
      if (rng.chance(0.25)) {
        const r = rng.range(0.4, 0.8), uu = rng.range(-ha + 1, ha - 1);
        const A = sa(sa(sa(c, a, uu), UP, -hb), n, r + 0.2), B = sa(A, UP, 2 * hb);
        if (!inNiche(uu - 1, uu + 1, -hb, hb) && ok([A, B, mul(add(A, B), 0.5)], 1)) { pipes.push([A, B, r, 0.26]); st.ducts++; }
      }
      /* neon edge strip at the wall-ceiling corner, where there is a ceiling */
      const dd = DIRS[f.di];
      if (g.kindAt(f.i + dd[0], f.j + 1, f.k + dd[2]) === SOLID && rng.chance(0.7)) {
        const A = sa(sa(sa(c, a, -ha + 0.5), UP, hb - 0.35), n, 0.35), B = sa(sa(sa(c, a, ha - 0.5), UP, hb - 0.35), n, 0.35);
        const hex = rng.chance(0.75) ? accent : warm;
        neonAdd(A, B, 0.16, hex, 1.3);
        streakAdd(A, B, 1.1, hex, 0.22);
        st.strips++;
      }
      /* cables across the hole near the ceiling, to the opposite wall */
      const gapV = findOpposite(f);
      if (gapV > 0 && rng.chance(0.5)) {
        const span = gapV * (dd[0] ? S[0] : S[2]);
        for (let mm = 0, nC = rng.int(1, 3); mm < nC; mm++) {
          const uu = rng.range(-ha + 1, ha - 1), y = rng.range(hb - 6, hb - 1.5);
          const A = sa(sa(c, a, uu), UP, y);
          const B = sa(sa(sa(A, n, span), a, rng.range(-4, 4)), UP, rng.range(-1.5, 1.5));
          const sag = rng.range(1, 4);
          if (!ok(catenary(A, B, sag, 16), 0.5)) continue;
          cables.push([A, B, sag, rng.range(0.06, 0.12)]);
          st.cables++;
        }
      }
    }
    /* quiet features on the outer faces: one tall sign per face where the
       wall behind is solid, light slots at the corners that stop where the
       corner column does (a cut-away top corner leaves no slot in the air) */
    const solidAtL = (p) => g.isSolid(Math.floor((p[0] - X0) / S[0]), Math.floor(p[1] / S[1]), Math.floor((p[2] - Z0) / S[2]));
    for (const nxz of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const n = [nxz[0], 0, nxz[1]], a = cross(UP, n);
      const off = -X0 + 0.4;
      if (rng.chance(0.75)) {
        const sw = 7, sh = rng.range(38, 60);
        const uu = rng.chance(0.5) ? -94 : 94, y = rng.range(150, 220);
        const cc = sa(sa(mul(n, off), a, uu), UP, y);
        const back = [sa(cc, n, -2), sa(sa(cc, n, -2), UP, sh / 2), sa(sa(cc, n, -2), UP, -sh / 2)];
        if (back.every(solidAtL)) {
          const hex = rng.chance(0.5) ? hues[0] : hues[1];
          signAdd(cc, sw, sh, n, hex);
          glowAdd(sa(cc, n, 3), sw * 2.4, sh * 1.2, srgb(hex, 0.12));
          st.signs++;
        }
      }
      for (const su of [-1, 1]) {
        const A = sa(sa(mul(n, off + 0.1), a, su * (-X0 - 1.2)), UP, 6);
        let top = 6;
        while (top < H - 6 && solidAtL(sa(sa(sa(mul(n, off), a, su * (-X0 - 1.2)), UP, top + 1), n, -1.5))) top += 1;
        if (top - 6 < 20) continue;
        const B = sa(A, UP, top - 6 - 6);
        neonAdd(A, B, 0.22, 0xffffff, 0.8);
        streaks.push([A, B, 1.2, srgbB(0.95, 0.12)]);
        st.strips++;
      }
    }
    /* lane guides: dim buoys every 27 m along each lane near the block,
       offset to the vehicles' belly side */
    if (opts.guides !== false) {
      const reach = 520, step = 27, col = srgbB(0.85, 0.26);
      for (const l of lanesL) {
        const ax = 'xyz'.indexOf(l.axis);
        const lo = Math.max(l.axis === 'y' ? 0 : -reach, Math.min(l.s0, l.s1)), hi = Math.min(l.axis === 'y' ? 420 : reach, Math.max(l.s0, l.s1));
        for (let s = lo; s <= hi; s += step) {
          const p = l.p.slice();
          p[ax] = s + (l.dir > 0 ? step / 2 : 0);
          if (l.axis === 'y') p[2] -= 4.5; else p[1] -= 4.5;
          glowAdd(p, 2.0, 2.0, col);
        }
      }
    }

    /* materials, per build */
    const plainMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7, metalness: 0.3 });
    const darkMat = new THREE.MeshStandardMaterial({ color: ctx.bone(0.08), roughness: 0.5, metalness: 0.6 });
    const neonMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
    owned.push(plainMat, darkMat, neonMat);
    const parts = [];
    if (plain.length) parts.push(boxMesh(THREE, ctx, plain, plainMat));
    if (pipes.length) parts.push(rodMesh(THREE, pipes, new THREE.CylinderGeometry(1, 1, 1, 10, 1, false), plainMat, (it, col) => ctx.boneC(it[3], col)));
    if (cables.length) parts.push(cableMesh(THREE, cables, darkMat));
    if (neon.length) parts.push(rodMesh(THREE, neon, new THREE.BoxGeometry(1, 1, 1), neonMat, (it, col) => col.copy(it[3])));
    const signM = signs.length ? signMesh(THREE, signs, 0.55) : null;
    if (signM) parts.push(signM);
    if (streaks.length) parts.push(streakMesh(THREE, streaks, 0.6));
    if (glow.length) parts.push(glowMesh(THREE, glow, 0.6));
    if (opts.fog) {
      cgPatch(opts.fog, mat); cgPatch(opts.fog, plainMat); cgPatch(opts.fog, darkMat);
      cgPatch(opts.fog, neonMat, { fogK: 0.6 });
      for (const p of parts) cgShader(opts.fog, p.material);
    }
    for (const p of parts) { if (p.material && owned.indexOf(p.material) < 0) owned.push(p.material); group.add(p); }
    for (const L of lights) {
      const pl = new THREE.PointLight(L.color, L.power, L.dist, 2);
      pl.position.set(L.p[0], L.p[1], L.p[2]);
      group.add(pl);
    }
    st.lights = lights.length;

    /* triangle count, instances included */
    let tris = 0;
    group.traverse((o) => {
      if (!o.isMesh) return;
      const gg = o.geometry;
      const per = (gg.index ? gg.index.count : gg.getAttribute('position').count) / 3;
      const inst = o.isInstancedMesh ? o.count : gg.isInstancedBufferGeometry ? gg.instanceCount : 1;
      tris += per * inst;
    });
    st.tris = tris;
    st.buildMs = (typeof performance !== 'undefined' ? performance : Date).now() - t0;

    return {
      group: group, stats: st, mouths: mouths, material: mat,
      /* t in seconds drives the sign flicker. cameraPos is accepted for the
         interface; the interior mapping reads the camera itself in
         onBeforeRender, so nothing breaks if a page never calls update. */
      update: function (t, cameraPos) {
        void cameraPos;
        if (signM) signM.material.uniforms.uTime.value = t;
      },
      dispose: function () {
        group.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
        for (const r of owned) r.dispose();
        if (group.parent) group.parent.remove(group);
      }
    };
  }

  const Menger = {
    DIM: DIM, W: W, H: H, D: D, X0: X0, Z0: Z0, PITCH: PITCH, ROW_Y: ROW_Y,
    SOLID: SOLID, VOID_L1: VOID_L1, VOID_L2: VOID_L2, VOID_OPEN: VOID_OPEN,
    ACCENT: ACCENT, WARM: WARM, MIX: MIX, SPACING: SPACING,
    mulberry32: mulberry32, makeRng: makeRng, makeFrame: makeFrame,
    makeGrid: makeGrid, solidBoxes: solidBoxes, makeLanes: makeLanes,
    checkSeparation: checkSeparation, checkWalls: checkWalls,
    boxBoxDist: boxBoxDist, pointBoxDist: pointBoxDist, segSegDist: segSegDist, segBoxDist: segBoxDist,
    makeBlock: makeBlock, boxesNear: boxesNear, clearance: clearance, segClearance: segClearance,
    inside: inside, portals: portals, flythrough: flythrough, laneSet: laneSet, laneCorridors: laneCorridors,
    build: build
  };
  globalThis.Menger = Menger;
})();
