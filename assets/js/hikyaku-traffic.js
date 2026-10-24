/* hikyaku-traffic.js -- city traffic for Hikyaku: lanes, closed-form vehicle
 * poses, collision against nearby vehicles, and the three-LOD renderer.
 *
 * Ported from the concept phase (2026-10, notes/tools/hikyaku/concepts/lib/
 * trafficgen.js, the look of traffic-canyon.png the owner approved).
 *
 * The owner's rules this module is built around (HANDOFF section 2,
 * "Verkehr"):
 *   - every pose is a closed-form function of time: lane curve, lane speed,
 *     phase. Nothing is integrated, so a seed replays identically and best
 *     times stay comparable;
 *   - all vehicles of a lane share the lane speed and keep a fixed spacing,
 *     so they never overtake or touch;
 *   - traffic never dodges the player (that would break the formula);
 *   - collision only against nearby vehicles, each with its own hull.
 *
 * Two layers, so the part the game logic needs can be tested under Node:
 *
 *   - Pure layer, no three.js, no DOM: makeLane, laneLength, countOnLane,
 *     poseAt, velocityAt, nearVehicles, vehicleHull, contactsVehicles,
 *     gapsAcross, nearestS, laneClearance. Vectors are plain [x, y, z]
 *     arrays, quaternions [w, x, y, z] body to world, the sixdof.js
 *     convention.
 *   - Visual layer: createTraffic(THREE, opts). THREE is a parameter, never
 *     an import, because the pages load three.js through an importmap module
 *     and everything shared here is a classic script. The only other global
 *     it reads is ColorRamps (assets/js/colorramps.js) for the bone ramp.
 *
 * Vehicle frame, the same as sixdof.js and courier.js: x = starboard,
 * y = up, z = aft, nose at -z, origin at the centre of the vehicle.
 *
 * Changes against the concept, and why:
 *   - lanes are world-space polylines with rounded corners (constant speed
 *     along arc length) instead of z-only lines with a sine wobble. The
 *     wobble made speed along the lane vary and only ran along z; the
 *     three-axis wrapper in mengerblock.js existed only to rotate z-lanes.
 *     A polyline in world space covers x, y and z lanes directly;
 *   - vehicles sit at a fixed spacing per lane (slot k at phase + k spacing)
 *     instead of random gaps. That makes the pose of vehicle k a formula of
 *     (lane, k, t) with no table, makes nearVehicles and gapsAcross
 *     closed-form, and lets the no-overlap guarantee be a one-line bound
 *     (see makeLane);
 *   - type, paint and bob phase per slot come from an integer hash of
 *     (lane seed, k), not from an rng stream, for the same reason;
 *   - "car" is called "pod" (the HANDOFF name, Pod-Car); "car" is still
 *     accepted in a legacy mix list;
 *   - fog is three's own scene fog (the page uses THREE.Fog), not the
 *     citygen height fog. The additive light layers read the same fog
 *     uniforms and fade to black instead of to the fog colour;
 *   - no module-level materials or tint uniforms: everything is created per
 *     createTraffic call and released by dispose(). Accent colours are
 *     parameters (the city may limit itself to one or two);
 *   - BufferGeometryUtils is not available to a classic script, so the
 *     merge is a small local function.
 *
 * The heavy freighter (added 2026-10-25, owner's wish "ab und zu, deutlich
 * ueber allen anderen Verkehrsadern, Grosstransporter"): a fourth type of
 * 160 m, flying slowly on its own sparse lanes at FREIGHT_Y, well above the
 * city lanes. Rarity is the design rule, so freighterLanes() lays out only
 * a handful of long straight lanes with one freighter each and a gap of
 * several kilometres behind it. It is an ordinary type in every respect
 * (poses, spacing bound, contacts, gaps); only its LOD bands, its far
 * streak and its lights (aviation red, green and white, strobes) are its
 * own.
 *
 * Everything hangs on globalThis.HikyakuTraffic.
 */
(function () {
  'use strict';

  const CYAN = 0x22e6ff, MAGENTA = 0xff2d95;
  /* aviation navigation lights, freighter only */
  const NAV_RED = 0xff2414, NAV_GREEN = 0x2bff7a;
  /* Lane altitudes the city leaves free (bridges and cables only between
     them). hikyaku-city.js defines the same numbers; the two MUST match.
     Not imported on purpose, so neither module depends on the other. */
  const LANE_Y = [55, 105, 155];
  const GRAV = 9.81;
  /* LOD bands in metres from the camera: near models fade out between
     nearFull and nearOut, the mid body fades into the streak between midFull
     and midOut, nothing is drawn beyond cull. Concept values. */
  const BANDS = { nearFull: 70, nearOut: 90, midFull: 220, midOut: 285, cull: 1500 };
  /* Types with bands of their own. A 160 m freighter at 400 m covers as many
     pixels as a hauler at 55 m, so it keeps the full model that far out and
     the mid body to 1500 m; it is also seen from much further than street
     traffic, hence the larger cull. In createTraffic's opts.bands, flat keys
     override BANDS and reach only the types without an entry here; a
     sub-object per type ({ freighter: { cull: 3000 } }) overrides that
     type. So the page's { cull: 1300 } for street traffic leaves the
     freighters alone. */
  const TYPE_BANDS = {
    freighter: { nearFull: 400, nearOut: 480, midFull: 1500, midOut: 1800, cull: 4000 }
  };
  /* Freighter altitudes, one per axis: lanes along x fly at FREIGHT_Y[0],
     lanes along z at FREIGHT_Y[1], so two freighter lanes never cross at the
     same height (the 40 m between them leave 10 m between the hull boxes).
     Both are far above LANE_Y and above all ordinary towers. Landmarks above
     260 m must stay 60 m clear of the freighter lanes; the city side has to
     enforce that (not done yet). */
  const FREIGHT_Y = [280, 320];

  /* ---- small vector helpers ------------------------------------------- */
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function cross(a, b) {
    return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  }
  function len(a) { return Math.sqrt(dot(a, a)); }
  function norm(a) { const l = len(a); return l > 1e-12 ? [a[0] / l, a[1] / l, a[2] / l] : [0, 0, 0]; }
  function mod(a, b) { return ((a % b) + b) % b; }
  function qConj(q) { return [q[0], -q[1], -q[2], -q[3]]; }
  function qRot(q, v) {
    const u = [q[1], q[2], q[3]];
    const t = cross(u, v); t[0] *= 2; t[1] *= 2; t[2] *= 2;
    const c = cross(u, t);
    return [v[0] + t[0] * q[0] + c[0], v[1] + t[1] * q[0] + c[1], v[2] + t[2] * q[0] + c[2]];
  }
  /* Rotation matrix with columns R, U, B (body x, y, z in world) to a
     quaternion [w, x, y, z]. Shepperd's branch on the largest diagonal term,
     so it stays accurate for every orientation. */
  function qFromBasis(R, U, B) {
    const m00 = R[0], m01 = U[0], m02 = B[0];
    const m10 = R[1], m11 = U[1], m12 = B[1];
    const m20 = R[2], m21 = U[2], m22 = B[2];
    const tr = m00 + m11 + m22;
    let w, x, y, z;
    if (tr > 0) {
      const s = Math.sqrt(tr + 1) * 2;
      w = 0.25 * s; x = (m21 - m12) / s; y = (m02 - m20) / s; z = (m10 - m01) / s;
    } else if (m00 > m11 && m00 > m22) {
      const s = Math.sqrt(1 + m00 - m11 - m22) * 2;
      w = (m21 - m12) / s; x = 0.25 * s; y = (m01 + m10) / s; z = (m02 + m20) / s;
    } else if (m11 > m22) {
      const s = Math.sqrt(1 + m11 - m00 - m22) * 2;
      w = (m02 - m20) / s; x = (m01 + m10) / s; y = 0.25 * s; z = (m12 + m21) / s;
    } else {
      const s = Math.sqrt(1 + m22 - m00 - m11) * 2;
      w = (m10 - m01) / s; x = (m02 + m20) / s; y = (m12 + m21) / s; z = 0.25 * s;
    }
    return w < 0 ? [-w, -x, -y, -z] : [w, x, y, z];
  }
  /* Integer hash to [0, 1). Per-slot properties are a function of
     (lane seed, slot index), never of a stream position, so they do not
     shift when a lane is added or the slot count changes. */
  function hash01(a, b) {
    let h = Math.imul(a | 0, 0x9e3779b1) ^ Math.imul((b | 0) + 0x7f4a7c15, 0x85ebca77);
    h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d);
    h ^= h >>> 12; h = Math.imul(h, 0x297a2d39);
    h ^= h >>> 15;
    return (h >>> 0) / 4294967296;
  }

  /* ---- vehicle types and hulls ----------------------------------------
     Collision boxes in the vehicle frame, measured off the concept models
     (lift pontoons, roof ad box and rear nozzles included for the hauler,
     the ducts for the drone). radius is the bounding sphere of the box about
     the vehicle origin; it drives the spacing bound and every cheap reject. */
  const TYPE_NAMES = ['hauler', 'pod', 'drone', 'freighter'];
  /* The freighter box spans the lift fans with their nav lamps (20.8 m), the
     fan bottoms (-10 m) and the strobe on the mast (+20.7 m), nose to tail
     lamp. As
     coarse as a building, which is what hitting it should feel like. */
  const BOX = {
    hauler: { min: [-2.4, -3.0, -11.2], max: [2.4, 4.0, 11.45] },
    pod: { min: [-1.4, -0.7, -2.95], max: [1.4, 0.95, 2.95] },
    drone: { min: [-3.8, -2.75, -3.8], max: [3.8, 0.75, 3.8] },
    freighter: { min: [-20.8, -10, -80.6], max: [20.8, 20.7, 80.9] }
  };
  const PAINTS = { hauler: [0.42, 0.5, 0.58], pod: [0.3, 0.45, 0.62, 0.75], drone: [0.55, 0.68],
    freighter: [0.56, 0.63, 0.7] };
  const NOMINAL_LEN = { hauler: 22, pod: 5.6, drone: 7.4, freighter: 160 };

  /* Eight corners (index bits x, y, z), twelve triangles wound outward. The
     winding is fixed by checking each normal against the box centre rather
     than by a hand-written table, which is the table that goes wrong. */
  function boxHull(b) {
    const verts = [];
    for (let i = 0; i < 8; i++) {
      verts.push([i & 1 ? b.max[0] : b.min[0], i & 2 ? b.max[1] : b.min[1], i & 4 ? b.max[2] : b.min[2]]);
    }
    const quads = [[0, 2, 6, 4], [1, 3, 7, 5], [0, 1, 5, 4], [2, 3, 7, 6], [0, 1, 3, 2], [4, 5, 7, 6]];
    const cen = [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2];
    const faces = [];
    for (const q of quads) {
      for (const tri of [[q[0], q[1], q[2]], [q[0], q[2], q[3]]]) {
        const a = verts[tri[0]], n = cross(sub(verts[tri[1]], a), sub(verts[tri[2]], a));
        const fc = [0, 1, 2].map((k) => (a[k] + verts[tri[1]][k] + verts[tri[2]][k]) / 3);
        faces.push(dot(n, sub(fc, cen)) >= 0 ? tri : [tri[0], tri[2], tri[1]]);
      }
    }
    let r = 0;
    for (const v of verts) r = Math.max(r, len(v));
    return { verts: verts, faces: faces, min: b.min.slice(), max: b.max.slice(), radius: r };
  }
  const HULLS = {};
  const TYPES = {};
  for (const tn of TYPE_NAMES) {
    HULLS[tn] = boxHull(BOX[tn]);
    TYPES[tn] = Object.freeze({
      len: NOMINAL_LEN[tn], boxLength: BOX[tn].max[2] - BOX[tn].min[2],
      width: BOX[tn].max[0] - BOX[tn].min[0], height: BOX[tn].max[1] - BOX[tn].min[1],
      radius: HULLS[tn].radius, paints: Object.freeze(PAINTS[tn].slice())
    });
  }
  /* A fresh copy per call: a caller mutating the result cannot change the
     hull the contacts use. */
  function vehicleHull(type) {
    const h = HULLS[type];
    if (!h) throw new Error('vehicleHull: unknown type ' + type);
    return { verts: h.verts.map((v) => v.slice()), faces: h.faces.map((f) => f.slice()),
      min: h.min.slice(), max: h.max.slice(), radius: h.radius };
  }

  /* ---- lanes -----------------------------------------------------------
     makeLane(o), all fields optional except the geometry:
       points   [[x, y, z], ...], at least two, the lane centre line
       loop     true: closed loop (needs three points); false: open lane,
                vehicles enter at the first point and vanish at the last, so
                both ends belong out in the fog
       dir      +1 travel in point order, -1 the reverse (default +1)
       radius   corner rounding radius, m (default 40). A corner whose
                neighbouring segments are too short gets a smaller radius
       speed    m/s along the lane, the same for every vehicle (default 30)
       spacing  centre-to-centre distance along the lane, m (default 60),
                raised to the no-overlap minimum if it is below it
       types    weights { hauler, pod, drone, freighter } (default pod
                only). A freighter lane is { freighter: 1 } alone; mixing
                it with street types works but makes every slot as far
                apart as two freighters
       phase    arc-length offset of slot 0 at t = t0, m (default 0)
       t0       time offset, s (default 0)
       empty    leave every n-th slot empty (k % n === 0), 0 = none. The
                cheap way to cut deliberate gaps into a dense lane
       seed     integer for the per-slot type, paint and bob (default from
                the geometry)
       bob      { amp, freq } vertical bob along the vehicle up, m and rad/s
                (default 0.12, 1.3 as in the concept), false for none
       up       up hint (default [0, 1, 0]); up2 the fallback where the lane
                runs along up (default [0, 0, 1]), for vertical lanes
       maxBank  bank limit in corners, rad (default 0.6)
       express  wider, cyan far streaks (concept flag)
       fadeEnds open lanes only: vehicles dither in over the first fadeEnds
                metres and out over the last ones, so a lane may end in
                plain sight (in front of a Menger block, say) without a
                pop. Default 0, no fade. Rendering only: poses, contacts and
                gaps are unchanged
     The concept form is still accepted: { x0, y0, zA, zB, dir, v, mix,
     gap } becomes a straight open lane along z (dir > 0 runs from zB to zA),
     mix ['hauler', 'car', ...] becomes weights, gap [a, b] a spacing of the
     longest type plus the mean gap.

     No-overlap guarantee. Two vehicles cannot touch if their bounding
     spheres are apart: centre distance >= 2 Rmax + 2 bob + margin = req.
     On a straight piece the centre distance equals the spacing. Around a
     corner it is a chord, and the lane's curvature is at most 1/rMin
     everywhere, so by Schur's comparison theorem the chord over an arc
     length d <= pi rMin is at least 2 rMin sin(d / (2 rMin)). Neighbours
     therefore need d >= 2 rMin asin(req / (2 rMin)), and a lane whose
     tightest corner has rMin < req / 2 cannot carry the type at all
     (makeLane throws). On a loop the spacing is rounded UP to L / N, so the
     pair across the seam keeps it too. What the bound does not cover is a
     lane that doubles back on itself (a hairpin whose legs run closer than
     req); laneClearance(lane) checks that numerically for a generator. */
  function typeWeights(o) {
    const w = {};
    for (const tn of TYPE_NAMES) w[tn] = 0;
    if (o.types) {
      for (const k in o.types) {
        const tn = k === 'car' ? 'pod' : k;
        if (!(tn in w)) throw new Error('makeLane: unknown vehicle type ' + k);
        w[tn] += Math.max(0, +o.types[k] || 0);
      }
    } else if (o.mix) {
      for (const k of o.mix) {
        const tn = k === 'car' ? 'pod' : k;
        if (!(tn in w)) throw new Error('makeLane: unknown vehicle type ' + k);
        w[tn] += 1;
      }
    } else {
      w.pod = 1;
    }
    let sum = 0;
    for (const tn of TYPE_NAMES) sum += w[tn];
    if (!(sum > 0)) throw new Error('makeLane: all type weights are zero');
    for (const tn of TYPE_NAMES) w[tn] /= sum;
    return w;
  }

  /* Pieces: lines { kind 0, a, d } and arcs { kind 1, c, u, w, r } with
     arc point c + r (u cos phi + w sin phi), phi = sigma / r, so u points
     from the centre to the arc start and w is the tangent there. Every
     piece has s0 (start arc length), len and a bounding box. */
  function buildPieces(lane, rReq) {
    const P = lane.points, n = P.length, loop = lane.loop;
    const nSeg = loop ? n : n - 1;
    const segD = [], segL = [];
    for (let i = 0; i < nSeg; i++) {
      const d = sub(P[(i + 1) % n], P[i]), l = len(d);
      if (!(l > 1e-9)) throw new Error('makeLane: two consecutive points coincide (index ' + i + ')');
      segD.push([d[0] / l, d[1] / l, d[2] / l]); segL.push(l);
    }
    const hasCorner = (i) => loop || (i > 0 && i < n - 1);
    /* corner at point i: incoming segment i - 1, outgoing segment i */
    const cut = new Array(n).fill(0), arcs = new Array(n).fill(null);
    for (let i = 0; i < n; i++) {
      if (!hasCorner(i)) continue;
      const iin = (i - 1 + nSeg) % nSeg, iout = i % nSeg;
      const a = segD[iin], b = segD[iout];
      const c = Math.max(-1, Math.min(1, dot(a, b)));
      const th = Math.acos(c);
      if (th < 1e-6) continue;
      if (th > Math.PI - 1e-6) throw new Error('makeLane: lane reverses on itself at point ' + i);
      const tanh = Math.tan(th / 2);
      /* a segment shared by two corners gives each at most half its length */
      const limIn = segL[iin] * (hasCorner((i - 1 + n) % n) && (loop || i - 1 > 0) ? 0.5 : 1);
      const limOut = segL[iout] * (hasCorner((i + 1) % n) && (loop || i + 1 < n - 1) ? 0.5 : 1);
      const ct = Math.min(lane.radius * tanh, limIn, limOut);
      const r = ct / tanh;
      if (r < rReq) {
        throw new Error('makeLane: corner at point ' + i + ' has radius ' + r.toFixed(2) +
          ' m, below the ' + rReq.toFixed(2) + ' m the vehicle types need; use longer segments or a larger radius');
      }
      const nA = norm([b[0] - a[0] * c, b[1] - a[1] * c, b[2] - a[2] * c]);
      const A = [P[i][0] - a[0] * ct, P[i][1] - a[1] * ct, P[i][2] - a[2] * ct];
      const C = [A[0] + nA[0] * r, A[1] + nA[1] * r, A[2] + nA[2] * r];
      cut[i] = ct;
      arcs[i] = { kind: 1, c: C, u: [-nA[0], -nA[1], -nA[2]], w: a.slice(), r: r, len: r * th };
    }
    const pieces = [];
    let s = 0, rMin = Infinity;
    const push = (pc) => { pc.s0 = s; s += pc.len; pieces.push(pc); };
    for (let i = 0; i < nSeg; i++) {
      const j = (i + 1) % n, d = segD[i];
      const l = segL[i] - cut[i] - cut[j];
      if (l > 1e-9) {
        push({ kind: 0, a: [P[i][0] + d[0] * cut[i], P[i][1] + d[1] * cut[i], P[i][2] + d[2] * cut[i]], d: d.slice(), len: l });
      }
      if (arcs[j]) { push(arcs[j]); rMin = Math.min(rMin, arcs[j].r); }
    }
    for (const pc of pieces) {
      if (pc.kind === 0) {
        const b = [pc.a[0] + pc.d[0] * pc.len, pc.a[1] + pc.d[1] * pc.len, pc.a[2] + pc.d[2] * pc.len];
        pc.lo = [Math.min(pc.a[0], b[0]), Math.min(pc.a[1], b[1]), Math.min(pc.a[2], b[2])];
        pc.hi = [Math.max(pc.a[0], b[0]), Math.max(pc.a[1], b[1]), Math.max(pc.a[2], b[2])];
      } else {
        pc.lo = [pc.c[0] - pc.r, pc.c[1] - pc.r, pc.c[2] - pc.r];
        pc.hi = [pc.c[0] + pc.r, pc.c[1] + pc.r, pc.c[2] + pc.r];
        /* bank ramps in and out over this length inside the arc, so the roll
           is continuous where the arc meets a straight */
        pc.ramp = Math.max(1e-3, Math.min(pc.len / 2, Math.max(1, lane.speed * 0.6)));
      }
    }
    return { pieces: pieces, L: s, rMin: rMin };
  }

  function geomSeed(pts, speed) {
    let h = 0x2545f491;
    for (const p of pts) for (const x of p) h = Math.imul(h ^ Math.round(x * 16), 0x01000193);
    return (h ^ Math.round(speed * 64)) | 0;
  }

  function makeLane(o) {
    o = o || {};
    const dir = o.dir < 0 ? -1 : 1;
    let pts = o.points;
    if (!pts) {
      if (o.zA == null || o.zB == null) throw new Error('makeLane needs points, or the concept form x0, y0, zA, zB');
      const x0 = o.x0 || 0, y0 = o.y0 || 0;
      pts = [[x0, y0, o.zB], [x0, y0, o.zA]];
    }
    if (!pts || pts.length < 2) throw new Error('makeLane: at least two points');
    pts = pts.map((p) => [+p[0], +p[1], +p[2]]);
    if (dir < 0) pts.reverse();
    const speed = o.speed != null ? +o.speed : (o.v != null ? +o.v : 30);
    if (!(speed > 0)) throw new Error('makeLane: speed must be positive');
    const types = typeWeights(o);
    const bob = o.bob === false ? { amp: 0, freq: 0 } : Object.assign({ amp: 0.12, freq: 1.3 }, o.bob || {});
    const lane = {
      points: pts, dir: dir, loop: !!o.loop && pts.length >= 3, radius: o.radius != null ? +o.radius : 40,
      speed: speed, types: types, phase: +o.phase || 0, t0: +o.t0 || 0, empty: Math.max(0, o.empty | 0),
      seed: o.seed != null ? (o.seed | 0) : geomSeed(pts, speed),
      bobAmp: Math.abs(+bob.amp || 0), bobFreq: +bob.freq || 0,
      up: norm(o.up || [0, 1, 0]), up2: norm(o.up2 || [0, 0, 1]),
      maxBank: o.maxBank != null ? +o.maxBank : 0.6, express: !!o.express,
      margin: o.margin != null ? +o.margin : 1,
      fadeEnds: o.fadeEnds != null ? Math.max(0, +o.fadeEnds) : 0
    };
    if (lane.empty === 1) throw new Error('makeLane: empty = 1 would leave every slot empty');
    let Rmax = 0, lenMax = 0;
    for (const tn of TYPE_NAMES) if (types[tn] > 0) { Rmax = Math.max(Rmax, TYPES[tn].radius); lenMax = Math.max(lenMax, TYPES[tn].len); }
    const req = 2 * Rmax + 2 * lane.bobAmp + lane.margin;
    const g = buildPieces(lane, req / 2);
    lane.pieces = g.pieces; lane.L = g.L; lane.rMin = g.rMin;
    headingHints(lane);
    lane.reqDist = req;
    lane.minSpacing = isFinite(g.rMin) ? 2 * g.rMin * Math.asin(Math.min(1, req / (2 * g.rMin))) : req;
    let sp = o.spacing != null ? +o.spacing : (o.gap ? lenMax + (o.gap[0] + o.gap[1]) / 2 : 60);
    sp = Math.max(sp, lane.minSpacing);
    if (lane.loop) {
      const N = Math.floor(lane.L / sp + 1e-9);
      lane.count = N; lane.spacing = N > 0 ? lane.L / N : sp; lane.period = lane.L;
    } else {
      const N = Math.max(1, Math.ceil(lane.L / sp - 1e-9));
      lane.count = N; lane.spacing = sp; lane.period = N * sp;
    }
    const reach = Rmax + lane.bobAmp;
    lane.reach = reach;
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (const pc of lane.pieces) {
      for (let k = 0; k < 3; k++) {
        pc.lo[k] -= reach; pc.hi[k] += reach;
        lo[k] = Math.min(lo[k], pc.lo[k]); hi[k] = Math.max(hi[k], pc.hi[k]);
      }
    }
    lane.lo = lo; lane.hi = hi;
    return lane;
  }
  function laneLength(lane) { return lane.L; }
  /* Number of slots. poseAt returns null for an empty slot and, on an open
     lane, for a slot that is currently past the end. */
  function countOnLane(lane) { return lane.count; }

  /* Per-slot constants: type, paint (bone t), bob phase. null = empty slot. */
  function slotInfo(lane, k) {
    if (lane.empty > 1 && k % lane.empty === 0) return null;
    const h = hash01(lane.seed, k * 4);
    /* cumulative over TYPE_NAMES; the boundaries of the first three types
       are the ones of the old three-type split, so existing lanes keep
       their vehicles. Rounding past the sum falls to the last used type. */
    const w = lane.types;
    let type = null, acc = 0;
    for (const tn of TYPE_NAMES) {
      if (!(w[tn] > 0)) continue;
      acc += w[tn]; type = tn;
      if (h < acc) break;
    }
    const pl = PAINTS[type];
    return {
      type: type,
      paint: pl[Math.min(pl.length - 1, Math.floor(hash01(lane.seed, k * 4 + 1) * pl.length))],
      bobPh: hash01(lane.seed, k * 4 + 2) * 2 * Math.PI
    };
  }
  /* Arc length of slot k at time t, in [0, period). */
  function slotS(lane, k, t) {
    return mod(lane.phase + k * lane.spacing + lane.speed * (t - lane.t0), lane.period);
  }
  function findPiece(lane, s) {
    const pcs = lane.pieces;
    let lo = 0, hi = pcs.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (pcs[mid].s0 <= s) lo = mid; else hi = mid - 1;
    }
    return pcs[lo];
  }
  /* Centre line point and tangent at arc length s, no bob, into out.p and
     out.f; out.pc / out.sig name the piece. */
  function lanePoint(lane, s, out) {
    const pc = findPiece(lane, s);
    let sig = s - pc.s0;
    if (sig < 0) sig = 0; else if (sig > pc.len) sig = pc.len;
    const p = out.p, f = out.f;
    if (pc.kind === 0) {
      p[0] = pc.a[0] + pc.d[0] * sig; p[1] = pc.a[1] + pc.d[1] * sig; p[2] = pc.a[2] + pc.d[2] * sig;
      f[0] = pc.d[0]; f[1] = pc.d[1]; f[2] = pc.d[2];
    } else {
      const ph = sig / pc.r, cs = Math.cos(ph), sn = Math.sin(ph);
      for (let k = 0; k < 3; k++) {
        const e = pc.u[k] * cs + pc.w[k] * sn;
        p[k] = pc.c[k] + pc.r * e;
        f[k] = -pc.u[k] * sn + pc.w[k] * cs;
      }
    }
    out.pc = pc; out.sig = sig;
    return out;
  }
  /* ---- attitude per vehicle type ---------------------------------------
     A quadcopter cannot fly on its side, and a lift-fan craft only a
     little. So the body attitude is built against world up, not against
     the lane: yaw from the horizontal part of the travel direction, then a
     pitch about the horizontal starboard axis, then the bank about the
     nose. Per type:
       drone      pitch only from speed: nose down by DRONE_TILT tanh(v_h /
                  DRONE_TILT_V), v_h the horizontal speed, so vertical
                  travel gives no tilt; bank capped at DRONE_BANK
       pod,hauler pitch toward the travel elevation, soft-capped at 25 deg
       freighter  the same, soft-capped at 10 deg
     The soft cap is the identity below half the limit and runs into the
     limit with tanh above it, so a lane that bends from horizontal into
     vertical gives a smooth pitch. On a horizontal lane every non-drone
     type has exactly the old frame. Travel direction (fwd) and body nose
     (heading) differ wherever the cap bites. */
  const DEG = Math.PI / 180;
  const PITCH_MAX = { pod: 25 * DEG, hauler: 25 * DEG, freighter: 10 * DEG };
  const DRONE_TILT = 12 * DEG, DRONE_TILT_V = 35, DRONE_BANK = 20 * DEG;
  /* below this horizontal share of the tangent (cos of the elevation) the
     heading blends from the tangent into the piece's heading hint; below
     VERT_C a piece end counts as vertical */
  const HEAD_BLEND = 0.3, VERT_C = 0.05;
  const WUP = [0, 1, 0];
  function smooth01(x) { return x >= 1 ? 1 : x <= 0 ? 0 : x * x * (3 - 2 * x); }
  function softCap(x, m) {
    const a = Math.abs(x), k = 0.5 * m;
    if (a <= k) return x;
    return Math.sign(x) * (k + (m - k) * Math.tanh((a - k) / (m - k)));
  }
  function horiz(v) { return [v[0], 0, v[2]]; }
  /* v rotated about world up by angle a */
  function yawRot(v, a) {
    const c = Math.cos(a), s = Math.sin(a);
    return [v[0] * c + v[2] * s, v[1], -v[0] * s + v[2] * c];
  }
  function yawLerp(a, b, x) {
    if (x <= 0) return a.slice();
    if (x >= 1) return b.slice();
    return yawRot(a, Math.atan2(a[2] * b[0] - a[0] * b[2], dot(a, b)) * x);
  }
  function pieceTangent(pc, sig) {
    if (pc.kind === 0) return pc.d;
    const ph = sig / pc.r, cs = Math.cos(ph), sn = Math.sin(ph);
    return [-pc.u[0] * sn + pc.w[0] * cs, -pc.u[1] * sn + pc.w[1] * cs, -pc.u[2] * sn + pc.w[2] * cs];
  }
  /* Heading hints at both ends of every piece (hS, hE, horizontal unit
     vectors), so the heading stays defined and continuous where the lane
     runs vertical. An end with a horizontal tangent share takes its
     direction; the vertical end of an arc takes the limit direction from
     just inside the arc; a vertical straight takes the hints of its
     neighbours (the last horizontal heading before it, the next one after
     it) and turns from one to the other along its length. A lane without
     any horizontal heading takes the up hint (or up2) projected to the
     horizontal plane. */
  function headingHints(lane) {
    const P = lane.pieces, n = P.length;
    let fb = horiz(lane.up);
    if (len(fb) < 0.2) fb = horiz(lane.up2);
    fb = len(fb) > 1e-6 ? norm(fb) : [0, 0, -1];
    const endH = (pc, atEnd) => {
      let h = horiz(pieceTangent(pc, atEnd ? pc.len : 0));
      if (len(h) >= VERT_C) return norm(h);
      if (pc.kind === 0) return null;
      const d = Math.min(pc.len * 0.5, 1e-3 * pc.r);
      h = horiz(pieceTangent(pc, atEnd ? pc.len - d : d));
      return len(h) > 1e-9 ? norm(h) : null;
    };
    const raw = P.map((pc) => [endH(pc, false), endH(pc, true)]);
    for (let i = 0; i < n; i++) {
      let hS = raw[i][0], hE = raw[i][1];
      if (!hS || !hE) {
        let prev = null, next = null;
        for (let j = 1; j < n && !prev; j++) {
          if (i - j < 0 && !lane.loop) break;
          const q = raw[mod(i - j, n)];
          prev = q[1] || q[0];
        }
        for (let j = 1; j < n && !next; j++) {
          if (i + j >= n && !lane.loop) break;
          const q = raw[mod(i + j, n)];
          next = q[0] || q[1];
        }
        hS = hS || prev || next || hE || fb;
        hE = hE || next || prev || hS;
      }
      P[i].hS = hS; P[i].hE = hE;
    }
  }

  /* Full frame of a vehicle of the given type at arc length s and time t:
     position with bob, travel direction f, body nose h, body up u,
     starboard r. Banks into corners like an aircraft, the lift vector
     tilted toward the centre by atan(v^2 / (r g)), capped at maxBank (and
     DRONE_BANK for drones) and ramped in and out inside the arc. The bob
     runs along the old lane-perpendicular up, so positions do not depend
     on the type and the spacing bound stays as it was. */
  function laneFrame(lane, s, t, bobPh, out, type) {
    lanePoint(lane, s, out);
    const f = out.f, pc = out.pc;
    let inward = null, ramp = 0, bankMag = 0;
    if (pc.kind === 1 && lane.maxBank > 0) {
      const ph = out.sig / pc.r, cs = Math.cos(ph), sn = Math.sin(ph);
      inward = [-(pc.u[0] * cs + pc.w[0] * sn), -(pc.u[1] * cs + pc.w[1] * sn), -(pc.u[2] * cs + pc.w[2] * sn)];
      ramp = smooth01(out.sig / pc.ramp) * smooth01((pc.len - out.sig) / pc.ramp);
      bankMag = Math.min(lane.maxBank, Math.atan(lane.speed * lane.speed / (pc.r * GRAV)));
    }
    if (lane.bobAmp > 0) {
      let hh = lane.up, hf = dot(hh, f);
      if (Math.abs(hf) > 0.98) { hh = lane.up2; hf = dot(hh, f); }
      const u0 = norm([hh[0] - f[0] * hf, hh[1] - f[1] * hf, hh[2] - f[2] * hf]);
      const r0 = cross(f, u0);
      const phi0 = inward ? dot(inward, r0) * bankMag * ramp : 0;
      const c0 = Math.cos(phi0), s0 = Math.sin(phi0);
      const b = lane.bobAmp * Math.sin(lane.bobFreq * t + bobPh);
      for (let k = 0; k < 3; k++) out.p[k] += (u0[k] * c0 + r0[k] * s0) * b;
    }
    /* heading: the horizontal tangent, blended into the piece's hint near vertical */
    const fh = horiz(f), c = len(fh);
    let hd;
    if (c >= HEAD_BLEND) hd = [fh[0] / c, 0, fh[2] / c];
    else {
      const hint = yawLerp(pc.hS, pc.hE, smooth01(out.sig / pc.len));
      const w = smooth01(c / HEAD_BLEND), m = c > 1e-12 ? w / c : 0;
      hd = [fh[0] * m + hint[0] * (1 - w), 0, fh[2] * m + hint[2] * (1 - w)];
      hd = len(hd) > 1e-6 ? norm(hd) : hint;
    }
    const rh = cross(hd, WUP);
    let pitch;
    if (type === 'drone') pitch = -DRONE_TILT * Math.tanh(lane.speed * c / DRONE_TILT_V);
    else pitch = softCap(Math.asin(Math.max(-1, Math.min(1, f[1]))), PITCH_MAX[type] || PITCH_MAX.pod);
    let phi = 0;
    if (inward) phi = dot(inward, rh) * (type === 'drone' ? Math.min(bankMag, DRONE_BANK) : bankMag) * ramp;
    const cp = Math.cos(pitch), sp = Math.sin(pitch), cr = Math.cos(phi), sr = Math.sin(phi);
    const N = out.h, u = out.u, r = out.r;
    for (let k = 0; k < 3; k++) {
      N[k] = hd[k] * cp + WUP[k] * sp;
      u[k] = (-hd[k] * sp + WUP[k] * cp) * cr + rh[k] * sr;
    }
    const rr = cross(N, u);
    r[0] = rr[0]; r[1] = rr[1]; r[2] = rr[2];
    return out;
  }
  function scratch() { return { p: [0, 0, 0], f: [0, 0, 0], h: [0, 0, 0], u: [0, 0, 0], r: [0, 0, 0], pc: null, sig: 0 }; }

  /* The pose of slot k at time t, a pure function of (lane, k, t):
       { p, q, fwd, heading, up, right, type, paint, s, k, speed }
     fwd is the travel direction (the lane tangent), heading the body nose.
     q is [w, x, y, z] body to world, the body frame nose -z, so
     qRot(q, [0, 0, -1]) = heading and qRot(q, [0, 1, 0]) = up. Models and
     hull boxes go by q (or heading, up, right), never by fwd. null for an
     empty slot or, on an open lane, a slot that is past the end. */
  function poseAt(lane, k, t) {
    const N = lane.count;
    if (!N) return null;
    k = mod(Math.round(k), N);
    const info = slotInfo(lane, k);
    if (!info) return null;
    const s = slotS(lane, k, t);
    if (!lane.loop && s >= lane.L) return null;
    const fr = laneFrame(lane, s, t, info.bobPh, scratch(), info.type);
    const B = [-fr.h[0], -fr.h[1], -fr.h[2]];
    return {
      p: fr.p, q: qFromBasis(fr.r, fr.u, B), fwd: fr.f, heading: fr.h, up: fr.u, right: fr.r,
      type: info.type, paint: info.paint, s: s, k: k, speed: lane.speed
    };
  }

  /* World velocity of a point fixed in the vehicle frame (default the
     centre), by central difference of the pose formula. Falls back to
     speed * fwd where the slot enters or leaves an open lane. */
  function velocityAt(lane, k, t, bodyPt) {
    const h = 1e-3, b = bodyPt || [0, 0, 0];
    const a = poseAt(lane, k, t - h), c = poseAt(lane, k, t + h);
    if (!a || !c) {
      const p = poseAt(lane, k, t);
      return p ? [p.fwd[0] * lane.speed, p.fwd[1] * lane.speed, p.fwd[2] * lane.speed] : [0, 0, 0];
    }
    const wa = qRot(a.q, b), wc = qRot(c.q, b);
    return [(c.p[0] + wc[0] - a.p[0] - wa[0]) / (2 * h), (c.p[1] + wc[1] - a.p[1] - wa[1]) / (2 * h),
      (c.p[2] + wc[2] - a.p[2] - wa[2]) / (2 * h)];
  }

  function boxDist(lo, hi, p) {
    let d2 = 0;
    for (let k = 0; k < 3; k++) {
      const e = p[k] < lo[k] ? lo[k] - p[k] : (p[k] > hi[k] ? p[k] - hi[k] : 0);
      d2 += e * e;
    }
    return Math.sqrt(d2);
  }

  /* All vehicles whose bounding sphere reaches into the sphere (p, r) at
     time t: |pose.p - p| <= r + radius(type). So r is the radius of what is
     being tested (the ship's bounding radius plus a margin), not a padded
     search radius. Only lanes and pieces whose padded box is within r are
     walked, and inside a piece the slots are found by index arithmetic, not
     by scanning: the slots sit at b0 + j spacing, j = 0 .. N - 1. Each entry
     is { lane, k, t, type, pose }, the input contactsVehicles takes. */
  function nearVehicles(lanes, p, r, t) {
    const out = [];
    for (const lane of lanes) {
      const N = lane.count;
      if (!N || boxDist(lane.lo, lane.hi, p) > r) continue;
      const sp = lane.spacing;
      const base = lane.phase + lane.speed * (t - lane.t0);
      const b0 = mod(base, sp), m0 = Math.floor(base / sp);
      const seen = new Set();
      for (const pc of lane.pieces) {
        if (boxDist(pc.lo, pc.hi, p) > r) continue;
        const j0 = Math.max(0, Math.ceil((pc.s0 - b0) / sp) - 1);
        const j1 = Math.min(N - 1, Math.floor((pc.s0 + pc.len - b0) / sp) + 1);
        for (let j = j0; j <= j1; j++) {
          const k = mod(j - m0, N);
          if (seen.has(k)) continue;
          seen.add(k);
          const pose = poseAt(lane, k, t);
          if (!pose) continue;
          const dx = pose.p[0] - p[0], dy = pose.p[1] - p[1], dz = pose.p[2] - p[2];
          const R = r + TYPES[pose.type].radius;
          if (dx * dx + dy * dy + dz * dz <= R * R) out.push({ lane: lane, k: k, t: t, type: pose.type, pose: pose });
        }
      }
    }
    return out;
  }

  /* Ship faces as planes in the ship body frame, cached per faces array. */
  const shipPlaneCache = new WeakMap();
  function shipPlanes(hull) {
    let pl = shipPlaneCache.get(hull.faces);
    if (pl) return pl;
    pl = [];
    let rad = 0;
    for (const v of hull.verts) rad = Math.max(rad, len(v));
    for (const f of hull.faces) {
      const a = hull.verts[f[0]];
      const n = norm(cross(sub(hull.verts[f[1]], a), sub(hull.verts[f[2]], a)));
      if (len(n) < 0.5) continue;
      pl.push({ n: n, d: dot(n, a) });
    }
    pl.radius = rad;
    shipPlaneCache.set(hull.faces, pl);
    return pl;
  }

  /* Contact records for SixDOF.resolve, the contactsRocks shape:
       { n, r, pen, key, vs, vehicle }
     n is the world normal the ship has to move along, r the lever arm from
     the ship's centre of mass, vs the velocity of the vehicle surface at the
     contact point (time derivative of the pose, by finite difference), so a
     hauler shoves the ship instead of acting as a wall that stands still.
     key groups the positional correction per vehicle.

     s is the sixdof state { p, q, ... }, pts the ship's body-frame contact
     points, vehicles the list from nearVehicles. Two tests:
       - ship points inside a vehicle box: normal of the box face with the
         least penetration;
       - with opts.hull ({ verts, faces }, e.g. Courier.geometry()
         .collisionHull) also vehicle box corners inside the ship hull, the
         case points alone miss: a 5.6 m pod fits between the courier's
         side points, which are 9 m apart. Normal: minus the ship face. */
  function contactsVehicles(s, pts, vehicles, opts) {
    opts = opts || {};
    const out = [];
    const qc = qConj(s.q);
    const planes = opts.hull ? shipPlanes(opts.hull) : null;
    const rs = pts.map((pt) => qRot(s.q, pt));
    for (let vi = 0; vi < vehicles.length; vi++) {
      const veh = vehicles[vi], pose = veh.pose, H = HULLS[veh.type];
      const R = pose.right, U = pose.up, B = [-pose.heading[0], -pose.heading[1], -pose.heading[2]];
      const cols = [R, U, B];
      const key = 'v' + vi;
      for (let i = 0; i < pts.length; i++) {
        const r = rs[i];
        const rel = [s.p[0] + r[0] - pose.p[0], s.p[1] + r[1] - pose.p[1], s.p[2] + r[2] - pose.p[2]];
        if (dot(rel, rel) > H.radius * H.radius) continue;
        const loc = [dot(rel, R), dot(rel, U), dot(rel, B)];
        let pen = Infinity, ax = -1, sg = 0;
        for (let k = 0; k < 3; k++) {
          const a = H.max[k] - loc[k], b = loc[k] - H.min[k];
          if (a <= 0 || b <= 0) { pen = -1; break; }
          if (a < pen) { pen = a; ax = k; sg = 1; }
          if (b < pen) { pen = b; ax = k; sg = -1; }
        }
        if (!(pen > 0)) continue;
        const c = cols[ax];
        out.push({ n: [c[0] * sg, c[1] * sg, c[2] * sg], r: r, pen: pen, key: key,
          vs: velocityAt(veh.lane, veh.k, veh.t, loc), vehicle: vi });
      }
      if (!planes) continue;
      const dc = sub(pose.p, s.p);
      if (len(dc) > H.radius + planes.radius) continue;
      for (const v of H.verts) {
        const w = [pose.p[0] + R[0] * v[0] + U[0] * v[1] + B[0] * v[2],
          pose.p[1] + R[1] * v[0] + U[1] * v[1] + B[1] * v[2],
          pose.p[2] + R[2] * v[0] + U[2] * v[1] + B[2] * v[2]];
        const r = sub(w, s.p);
        if (len(r) > planes.radius) continue;
        const bl = qRot(qc, r);
        let pen = Infinity, best = null;
        for (const pl of planes) {
          const depth = pl.d - dot(pl.n, bl);
          if (depth <= 0) { best = null; pen = -1; break; }
          if (depth < pen) { pen = depth; best = pl; }
        }
        if (!best) continue;
        const nw = qRot(s.q, best.n);
        out.push({ n: [-nw[0], -nw[1], -nw[2]], r: r, pen: pen, key: key,
          vs: velocityAt(veh.lane, veh.k, veh.t, v), vehicle: vi });
      }
    }
    return out;
  }

  /* Closest point of the lane centre line to p: { s, dist }. */
  function nearestS(lane, p) {
    let best = { s: 0, dist: Infinity };
    for (const pc of lane.pieces) {
      let sig;
      if (pc.kind === 0) {
        sig = Math.max(0, Math.min(pc.len, dot(sub(p, pc.a), pc.d)));
      } else {
        /* angle in the arc plane; outside the arc the nearer end wins */
        const rel = sub(p, pc.c);
        const ph = Math.atan2(dot(rel, pc.w), dot(rel, pc.u));
        if (ph >= 0 && ph * pc.r <= pc.len) sig = ph * pc.r;
        else {
          const e0 = len(sub(lanePoint(lane, pc.s0, scratch()).p, p));
          const e1 = len(sub(lanePoint(lane, pc.s0 + pc.len, scratch()).p, p));
          sig = e0 <= e1 ? 0 : pc.len;
        }
      }
      const q = lanePoint(lane, pc.s0 + sig, scratch()).p;
      const d = len(sub(q, p));
      if (d < best.dist) best = { s: pc.s0 + sig, dist: d };
    }
    return best;
  }

  /* Free time windows at one point of a lane, within [t0, t1].
     crossing is an arc length s, a world point [x, y, z] (projected onto the
     lane with nearestS), or { s } / { p }. opts.clear is the half-width of
     what has to pass, m (default 8, the courier's half-length plus a bit).

     Slot n passes s_c at t_n = lane.t0 + (s_c - phase + n spacing) / speed,
     and that slot is k = -n mod N, so the passes are an arithmetic sequence
     and no simulation is involved. A vehicle blocks the point while its
     centre is within radius(type) + clear of s_c along the lane. Exact on a
     straight piece, which is where a crossing belongs; in a corner the
     straight-line distance is shorter than the arc, so add to clear there.
     Returns [[a, b], ...], sorted, merged; the caller decides how long a
     window has to be. An empty slot (lane.empty) is simply a missing pass,
     which is how a generator cuts a deliberate gap. */
  function gapsAcross(lane, crossing, t0, t1, opts) {
    opts = opts || {};
    const clear = opts.clear != null ? +opts.clear : 8;
    let sc;
    if (typeof crossing === 'number') sc = crossing;
    else if (Array.isArray(crossing)) sc = nearestS(lane, crossing).s;
    else if (crossing && crossing.s != null) sc = +crossing.s;
    else if (crossing && crossing.p) sc = nearestS(lane, crossing.p).s;
    else throw new Error('gapsAcross: crossing must be s, [x, y, z], { s } or { p }');
    if (!(t1 > t0)) return [];
    const N = lane.count;
    if (!N || (!lane.loop && (sc < 0 || sc >= lane.L))) return [[t0, t1]];
    const v = lane.speed, sp = lane.spacing;
    let wMax = 0;
    for (const tn of TYPE_NAMES) if (lane.types[tn] > 0) wMax = Math.max(wMax, (TYPES[tn].radius + clear) / v);
    const tn0 = (sc - lane.phase) / v + lane.t0;
    const n0 = Math.floor(((t0 - wMax) - tn0) * v / sp), n1 = Math.ceil(((t1 + wMax) - tn0) * v / sp);
    const blocked = [];
    for (let n = n0; n <= n1; n++) {
      const k = mod(-n, N);
      const info = slotInfo(lane, k);
      if (!info) continue;
      const tp = tn0 + n * sp / v, w = (TYPES[info.type].radius + clear) / v;
      if (tp + w < t0 || tp - w > t1) continue;
      const last = blocked[blocked.length - 1];
      if (last && tp - w <= last[1]) last[1] = Math.max(last[1], tp + w);
      else blocked.push([tp - w, tp + w]);
    }
    const free = [];
    let cur = t0;
    for (const b of blocked) {
      if (b[0] > cur) free.push([cur, Math.min(b[0], t1)]);
      cur = Math.max(cur, b[1]);
      if (cur >= t1) break;
    }
    if (cur < t1) free.push([cur, t1]);
    return free;
  }

  /* Smallest centre distance between any two vehicles of the lane over one
     period, sampled. The numeric check for what the spacing bound cannot
     see: a lane that doubles back on itself. O(N^2) per sample, so a
     generator check, not a per-frame call. */
  function laneClearance(lane, samples) {
    const nS = samples || 64, N = lane.count;
    const T = lane.period / lane.speed;
    let best = Infinity;
    for (let i = 0; i < nS; i++) {
      const t = lane.t0 + T * i / nS;
      const ps = [];
      for (let k = 0; k < N; k++) { const q = poseAt(lane, k, t); if (q) ps.push(q.p); }
      for (let a = 0; a < ps.length; a++) for (let b = a + 1; b < ps.length; b++) {
        const d = len(sub(ps[a], ps[b]));
        if (d < best) best = d;
      }
    }
    return best;
  }

  /* ---- freighter lanes --------------------------------------------------
     freighterLanes(bounds, seed, opts) -> [lane, ...]
       bounds  the world box the lanes have to cover: { min, max } with
               [x, y, z] arrays or {x, y, z} vectors (a THREE.Box3 works),
               y is ignored
       seed    integer; the same (bounds, seed, opts) give the same lanes
       opts    density  scales the number of lanes (default 1, 0 = none)
               step     [a, b] distance between candidate rows, m
                        (default [600, 900])
               keep     share of the candidate rows that carry a lane at
                        density 1 (default 0.5)
               speed    [a, b] m/s (default [15, 20])
               gap      [a, b] spacing as a multiple of the lane length
                        (default [1.6, 3])
               ext      how far a lane runs past the box on both ends, m
                        (default 800, out into the fog)
               fadeEnds dither length at the lane ends (default 400)
     Lanes along x fly at FREIGHT_Y[0], lanes along z at FREIGHT_Y[1]. Each
     lane is straight and open and carries ONE freighter (spacing larger
     than the lane), which is on the lane for 1 / gap of its period and
     absent the rest: with the defaults a freighter is in the box about 45 %
     of the time per lane, so a 4 km box at density 1 has six lanes (five
     to six candidate rows per axis, half of them kept; at 0.4 the rounding
     still gave four) and two to three freighters, usually one or two in
     sight. The random phase decides
     when. Every lane carries lane.freight = { axis: 'x' | 'z', y, row }. */
  function rng32(seed) {
    let a = (seed | 0) ^ 0x6d2b79f5;
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function freighterLanes(bounds, seed, opts) {
    opts = opts || {};
    const pick = (v, i) => (Array.isArray(v) ? +v[i] : +[v.x, v.y, v.z][i]);
    const lo = [pick(bounds.min, 0), 0, pick(bounds.min, 2)], hi = [pick(bounds.max, 0), 0, pick(bounds.max, 2)];
    const density = opts.density != null ? Math.max(0, +opts.density) : 1;
    const step = opts.step || [600, 900], keep = opts.keep != null ? +opts.keep : 0.5;
    const speed = opts.speed || [15, 20], gap = opts.gap || [1.6, 3];
    const ext = opts.ext != null ? +opts.ext : 800, fade = opts.fadeEnds != null ? +opts.fadeEnds : 400;
    const rnd = rng32(Math.imul(seed | 0, 0x2c1b3c6d) ^ 0x5eed);
    const range = (r) => r[0] + (r[1] - r[0]) * rnd();
    const out = [];
    /* axis 0: lanes along x (rows across z), axis 1: lanes along z */
    for (let ax = 0; ax < 2; ax++) {
      const along = ax === 0 ? 0 : 2, across = ax === 0 ? 2 : 0, y = FREIGHT_Y[ax];
      const rows = [];
      for (let c = lo[across] + range(step) * 0.5; c < hi[across]; c += range(step)) rows.push(c);
      const n = Math.min(rows.length, Math.round(rows.length * keep * density));
      /* partial Fisher-Yates: n distinct rows */
      for (let i = 0; i < n; i++) {
        const j = i + Math.floor(rnd() * (rows.length - i));
        const tmp = rows[i]; rows[i] = rows[j]; rows[j] = tmp;
      }
      const chosen = rows.slice(0, n).sort((a, b) => a - b);
      for (const row of chosen) {
        const a = [0, y, 0], b = [0, y, 0];
        a[along] = lo[along] - ext; b[along] = hi[along] + ext;
        a[across] = b[across] = row;
        const L = b[along] - a[along];
        const dir = rnd() < 0.5 ? 1 : -1;
        const v = range(speed), sp = L * range(gap);
        const lane = makeLane({
          points: [a, b], dir: dir, speed: v, spacing: sp, phase: rnd() * sp,
          types: { freighter: 1 }, seed: (Math.imul(seed | 0, 31) + out.length * 7919 + 17) | 0,
          bob: { amp: 0.5, freq: 0.21 }, maxBank: 0, fadeEnds: fade
        });
        lane.freight = { axis: ax === 0 ? 'x' : 'z', y: y, row: row };
        out.push(lane);
      }
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
      throw new Error('HikyakuTraffic.createTraffic needs ColorRamps: load /assets/js/colorramps.js first');
    }
    return r.stops;
  }
  function boneColor(THREE, stops, t) {
    t = Math.min(1, Math.max(0, t)) * (stops.length - 1);
    const i = Math.min(stops.length - 2, Math.floor(t)), f = t - i;
    const a = stops[i], b = stops[i + 1];
    return new THREE.Color().setRGB(a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f,
      a[2] + (b[2] - a[2]) * f, THREE.SRGBColorSpace);
  }

  /* ---- geometry helpers (from the concept, which took them from shipgen) */
  function sec(z, hwT, yT, hw, yM, hwB, yB) {
    return [[hwT, yT, z], [hw, yM, z], [hwB, yB, z], [-hwB, yB, z], [-hw, yM, z], [-hwT, yT, z]];
  }
  function loftGeo(THREE, rings) {
    const pos = [], idx = [], n = rings[0].length;
    for (const r of rings) for (const p of r) pos.push(p[0], p[1], p[2]);
    for (let i = 0; i + 1 < rings.length; i++) {
      for (let k = 0; k < n; k++) {
        const a = i * n + k, b = i * n + (k + 1) % n, c = (i + 1) * n + k, d = (i + 1) * n + (k + 1) % n;
        idx.push(a, c, d, a, d, b);
      }
    }
    /* End caps, a fan from the ring centroid. The winding is chosen per cap
       from the geometry: the cap normal must point away from the neighbour
       ring. Until 2026-10-25 both caps were wound inward, which the near
       models hid (DoubleSide) and the FrontSide mid bodies did not: seen
       from behind, a hauler had no back. */
    const centroid = (r) => {
      const c = [0, 0, 0];
      for (const p of r) { c[0] += p[0] / n; c[1] += p[1] / n; c[2] += p[2] / n; }
      return c;
    };
    for (const end of [[0, 1], [rings.length - 1, rings.length - 2]]) {
      const ri = end[0], r = rings[ri], cen = centroid(r), nb = centroid(rings[end[1]]);
      const ci = pos.length / 3; pos.push(cen[0], cen[1], cen[2]);
      /* ring orientation: Newell normal of the ring in index order */
      const nr = [0, 0, 0];
      for (let k = 0; k < n; k++) {
        const p = r[k], q = r[(k + 1) % n];
        nr[0] += (p[1] - q[1]) * (p[2] + q[2]); nr[1] += (p[2] - q[2]) * (p[0] + q[0]); nr[2] += (p[0] - q[0]) * (p[1] + q[1]);
      }
      const out = nr[0] * (cen[0] - nb[0]) + nr[1] * (cen[1] - nb[1]) + nr[2] * (cen[2] - nb[2]);
      for (let k = 0; k < n; k++) {
        const a = ri * n + k, b = ri * n + (k + 1) % n;
        if (out > 0) idx.push(ci, a, b); else idx.push(ci, b, a);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }
  function ductGeo(THREE, ri, ro, h, seg) {
    const t = Math.min(0.18, (ro - ri) * 0.4);
    const P = [[ri, -h / 2], [ro - t, -h / 2], [ro, -h / 2 + t], [ro, h / 2 - t], [ro - t, h / 2],
      [ri + t, h / 2], [ri - t * 0.4, h / 2 - t], [ri, -h / 2 + t], [ri, -h / 2]];
    return new THREE.LatheGeometry(P.map((q) => new THREE.Vector2(q[0], q[1])), seg || 28);
  }
  function revGeo(THREE, prof, seg) {
    const g = new THREE.LatheGeometry(prof.map((q) => new THREE.Vector2(q[1], q[0])), seg || 16);
    g.rotateX(Math.PI / 2);
    return g;
  }
  function mirror(fn) { fn(1); fn(-1); }
  /* Merge geometries into one non-indexed geometry with the named
     attributes (the part of BufferGeometryUtils.mergeGeometries used here). */
  function mergeGeos(THREE, geos, names) {
    const parts = geos.map((g) => (g.index ? g.toNonIndexed() : g));
    let n = 0;
    for (const g of parts) n += g.getAttribute('position').count;
    const g = new THREE.BufferGeometry();
    for (const name of names) {
      const first = parts.find((p) => p.getAttribute(name));
      if (!first) continue;
      const size = first.getAttribute(name).itemSize, arr = new Float32Array(n * size);
      let o = 0;
      for (const p of parts) {
        const a = p.getAttribute(name), c = p.getAttribute('position').count;
        if (a) arr.set(a.array.subarray(0, c * size), o);
        o += c * size;
      }
      g.setAttribute(name, new THREE.BufferAttribute(arr, size));
    }
    for (const p of parts) p.dispose();
    for (const p of geos) p.dispose();
    return g;
  }

  /* ---- shaders ---------------------------------------------------------
     Screen-door crossfade: a pixel is drawn if its interleaved-gradient
     noise threshold lies in [range.x, range.y). Near and mid bodies of the
     same vehicle get complementary ranges with the same threshold per
     pixel, so there is never a hole or a double pixel. */
  const IGN = 'float tgIGN(vec2 p){ return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }';
  function patchVeh(mat, inst, range, tint) {
    mat.onBeforeCompile = function (sh) {
      sh.uniforms.uTint = tint;
      if (!inst) sh.uniforms.uRange = range;
      const vdecl = inst ? 'attribute vec2 aRange; attribute vec3 aPaint; attribute vec2 aMat; varying vec2 vRange; varying vec3 vPaint; varying vec2 vMat;' : '';
      const vmain = inst ? 'vRange = aRange; vPaint = aPaint; vMat = aMat;' : '';
      const fdecl = 'uniform vec4 uTint;\n' + IGN + '\n' + (inst ? 'varying vec2 vRange; varying vec3 vPaint; varying vec2 vMat;' : 'uniform vec2 uRange;');
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\n' + vdecl)
        .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + vmain);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\n' + fdecl)
        .replace('void main() {', 'void main() {\n{ float th = tgIGN(gl_FragCoord.xy); vec2 rg = ' +
          (inst ? 'vRange' : 'uRange') + '; if (th < rg.x || th >= rg.y) discard; }')
        .replace('#include <dithering_fragment>', 'gl_FragColor.rgb = mix(gl_FragColor.rgb, uTint.rgb, uTint.a);\n#include <dithering_fragment>');
      if (inst) {
        sh.fragmentShader = sh.fragmentShader
          .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= mix(vec3(1.0), vPaint, vMat.y);')
          .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * vMat.x * 2.2; diffuseColor.rgb *= 1.0 - vMat.x;');
      }
    };
    mat.customProgramCacheKey = function () { return 'hkt' + (inst ? 'I' : 'U') + mat.type; };
    return mat;
  }
  /* The additive layers read three's own scene fog uniforms (the renderer
     fills them because the material has fog: true) and fade the light to
     black instead of mixing in the fog colour, which is what an additive
     light behind fog does. uFogK < 1 lets lights carry further than walls.
     tfFog takes the world position of the light: with the page's
     atmosphere (TF_CG) the fog depends on both ends of the ray, not only
     on its length. */
  const FOG_VS = [
    'uniform float uFogK;',
    '#ifdef TF_CG',
    '/*CG_FOG*/',
    '#endif',
    '#ifdef USE_FOG',
    'uniform float fogNear; uniform float fogFar;',
    '#ifdef FOG_EXP2',
    'uniform float fogDensity;',
    '#endif',
    '#endif',
    'float tfFog(vec3 w){',
    '#ifdef TF_CG',
    '  return cgFogAmt(w, uFogK);',
    '#elif defined(USE_FOG)',
    '  float d = length(w - cameraPosition) * uFogK;',
    '#ifdef FOG_EXP2',
    '  return 1.0 - exp(-fogDensity * fogDensity * d * d);',
    '#else',
    '  return smoothstep(fogNear, fogFar, d);',
    '#endif',
    '#else',
    '  return 0.0;',
    '#endif',
    '}'
  ].join('\n');
  /* The page's own atmosphere (hikyaku-city.js makeFog), when createTraffic
     gets opts.fog: the lit bodies go through fog.patch like every other
     material of the page, the additive layers get its declarations through
     fog.inject (TF_CG, tfFog calls cgFogAmt). fog.patch sets its own
     program cache key; it is combined with the vehicle key here, otherwise
     a patched vehicle material and a patched plain material of the same
     type would share one program. */
  function cgPatch(fog, mat, opts) {
    if (!fog) return mat;
    const k0 = mat.customProgramCacheKey.bind(mat);
    fog.patch(mat, opts);
    const k1 = mat.customProgramCacheKey.bind(mat);
    mat.customProgramCacheKey = function () { return k0() + '|' + k1(); };
    return mat;
  }
  function cgAdditive(fog, mat) {
    if (!fog) return mat;
    mat.defines = Object.assign(mat.defines || {}, { TF_CG: '' });
    return fog.inject(mat);
  }
  function fogUniforms(THREE, k) {
    return { uFogK: { value: k }, fogColor: { value: new THREE.Color() }, fogNear: { value: 1 },
      fogFar: { value: 2000 }, fogDensity: { value: 0.00025 } };
  }
  function glowMesh(THREE, n) {
    const g = new THREE.InstancedBufferGeometry();
    const q = new THREE.PlaneGeometry(1, 1);
    g.index = q.index; g.setAttribute('position', q.getAttribute('position')); g.setAttribute('uv', q.getAttribute('uv'));
    const att = {
      iPos: new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3),
      iSize: new THREE.InstancedBufferAttribute(new Float32Array(n * 2), 2),
      iCol: new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3)
    };
    for (const k in att) { att[k].setUsage(THREE.DynamicDrawUsage); g.setAttribute(k, att[k]); }
    g.instanceCount = 0;
    const m = new THREE.ShaderMaterial({
      uniforms: Object.assign(fogUniforms(THREE, 0.6), { uFall: { value: 3.5 } }),
      vertexShader: FOG_VS + `
attribute vec3 iPos; attribute vec2 iSize; attribute vec3 iCol;
varying vec2 vUv; varying vec3 vCol;
void main(){
  vec4 mv = viewMatrix * vec4(iPos, 1.0);
  mv.xy += position.xy * iSize;
  vUv = uv;
  vCol = iCol * (1.0 - tfFog(iPos));
  gl_Position = projectionMatrix * mv;
}`,
      fragmentShader: `uniform float uFall; varying vec2 vUv; varying vec3 vCol;
void main(){
  float r = length(vUv - 0.5) * 2.0;
  float a = exp(-r * r * uFall) * clamp(1.0 - r, 0.0, 1.0);
  a += 0.6 * exp(-r * r * uFall * 12.0);
  gl_FragColor = vec4(vCol * a, 1.0);
}`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, fog: true,
      polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1
    });
    const mesh = new THREE.Mesh(g, m);
    mesh.frustumCulled = false;
    q.dispose();
    return { mesh: mesh, att: att };
  }
  function streakMesh(THREE, n) {
    const q = new THREE.PlaneGeometry(1, 2).translate(0.5, 0, 0);
    const g = new THREE.InstancedBufferGeometry();
    g.index = q.index; g.setAttribute('position', q.getAttribute('position'));
    const att = {
      iA: new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3),
      iB: new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3),
      iW: new THREE.InstancedBufferAttribute(new Float32Array(n * 2), 2),
      iCol: new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3)
    };
    for (const k in att) { att[k].setUsage(THREE.DynamicDrawUsage); g.setAttribute(k, att[k]); }
    g.instanceCount = 0;
    const m = new THREE.ShaderMaterial({
      uniforms: fogUniforms(THREE, 0.45),
      vertexShader: FOG_VS + `
attribute vec3 iA; attribute vec3 iB; attribute vec2 iW; attribute vec3 iCol;
varying vec2 vP; varying vec3 vCol; varying float vFade;
void main(){
  vec3 dir = iB - iA;
  float L = length(dir);
  vec3 dn = dir / max(L, 1e-4);
  vec3 wp = iA + dir * position.x;
  vec3 toCam = cameraPosition - wp;
  vec3 side = normalize(cross(dn, toCam));
  wp += dn * (position.x - 0.5) * 2.0 * iW.x * 0.6;
  wp += side * position.y * iW.x;
  vP = vec2(position.x, position.y);
  vFade = iW.y;
  vCol = iCol * (1.0 - tfFog(wp));
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}`,
      fragmentShader: `varying vec2 vP; varying vec3 vCol; varying float vFade;
void main(){
  float across = exp(-vP.y * vP.y * 5.0) + 0.8 * exp(-vP.y * vP.y * 60.0);
  float along = mix(1.0, pow(clamp(vP.x, 0.0, 1.0), 1.6), vFade);
  float ends = smoothstep(0.0, 0.04, vP.x) * (1.0 - smoothstep(0.96, 1.0, vP.x));
  gl_FragColor = vec4(vCol * across * along * ends, 1.0);
}`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
      side: THREE.DoubleSide, fog: true
    });
    const mesh = new THREE.Mesh(g, m);
    mesh.frustumCulled = false;
    q.dispose();
    return { mesh: mesh, att: att };
  }

  /* ---- near models (concept builders, unchanged in shape) --------------- */
  const HAULER_ST = [
    sec(-11.0, 1.5, 1.0, 2.0, -0.4, 1.7, -1.6),
    sec(-10.2, 1.9, 2.0, 2.3, -0.1, 2.1, -1.9),
    sec(-8.6, 2.1, 2.4, 2.3, 0.0, 2.2, -2.0),
    sec(9.6, 2.1, 2.4, 2.3, 0.0, 2.2, -2.0),
    sec(11.0, 1.9, 2.2, 2.2, 0.0, 2.0, -1.8)
  ];
  const POD_ST = [
    sec(-2.8, 0.45, -0.05, 0.75, -0.25, 0.55, -0.45),
    sec(-2.2, 0.85, 0.15, 1.1, -0.15, 0.9, -0.55),
    sec(-0.8, 1.0, 0.25, 1.2, -0.1, 1.0, -0.6),
    sec(1.6, 1.0, 0.3, 1.2, -0.05, 1.0, -0.55),
    sec(2.8, 0.85, 0.32, 1.05, 0.0, 0.85, -0.4)
  ];
  const POD_CAN = [
    sec(-1.5, 0.35, 0.24, 0.8, 0.22, 0.9, 0.2),
    sec(-0.6, 0.62, 0.88, 0.88, 0.6, 0.98, 0.24),
    sec(0.6, 0.64, 0.92, 0.88, 0.62, 0.98, 0.27),
    sec(1.7, 0.5, 0.45, 0.82, 0.36, 0.95, 0.3)
  ];
  const DR = 2.7;
  /* Freighter hull: a long blunt slab, nose at -80, widest (11 m half) at
     the waterline y -1, deck at y 4. */
  const FR_ST = [
    sec(-80, 2.5, -0.5, 4.0, -2.5, 3.0, -4.5),
    sec(-77, 6.5, 2.2, 8.5, -1.8, 6.5, -6.0),
    sec(-70, 9.0, 4.0, 11.0, -1.0, 9.0, -7.0),
    sec(68, 9.0, 4.0, 11.0, -1.0, 9.0, -7.0),
    sec(76, 8.0, 3.6, 10.0, -1.2, 8.0, -6.2),
    sec(80, 6.0, 2.2, 8.0, -1.5, 6.0, -4.8)
  ];
  /* raised bridge, raked at the front, on the deck over the nose */
  const FR_BRIDGE = [
    sec(-69, 4.5, 13.0, 7.5, 9.0, 8.0, 3.8),
    sec(-65, 6.5, 15.0, 8.0, 9.0, 8.0, 3.8),
    sec(-50, 6.5, 15.0, 8.0, 9.0, 8.0, 3.8),
    sec(-48, 5.5, 14.5, 7.5, 9.0, 7.8, 3.8)
  ];
  /* lift fans: centres (x, z), duct radius, centre height */
  const FR_FANS = [[14.5, -46], [-14.5, -46], [14.5, 46], [-14.5, 46]];
  const FR_FAN_R = 5.8, FR_FAN_Y = -8.6;
  /* fan disc height in the duct frame (hub bottom cap at -1.0) and rim ring
     radius (duct inner wall at FR_FAN_R - 0.8, ring tube 0.12) */
  const FR_DISC_Y = -0.9, FR_RIM_R = FR_FAN_R - 0.8 - 0.12 - 0.05;
  /* cargo bays along the spine: container stacks (heights in 2.6 m units
     per column) or a pair of tanks; a fixed table, the paint varies */
  const FR_BAYS = [
    { z: -40, c: [2, 3, 2] }, { z: -27, c: [3, 3, 1] }, { z: -14, c: [2, 2, 3] }, { z: -1, tank: true },
    { z: 12, tank: true }, { z: 25, c: [1, 3, 3] }, { z: 38, c: [3, 2, 2] }, { z: 51, c: [2, 3, 1] }
  ];

  function makeBuilders(THREE) {
    function mk(parent, geo, mat, pos, rot) {
      const m = new THREE.Mesh(geo, mat);
      if (pos) m.position.set(pos[0], pos[1], pos[2]);
      if (rot) m.rotation.set(rot[0], rot[1], rot[2]);
      parent.add(m);
      return m;
    }
    function bx(parent, mat, size, pos, rot) { return mk(parent, new THREE.BoxGeometry(size[0], size[1], size[2]), mat, pos, rot); }
    /* Hauler: 22 m lifting bus. Slab-sided body with a raked cab, a lit
       window band, two pontoons with downward lift outlets, a roof rack
       with an ad box, light bars front and rear. */
    function hauler(M) {
      const g = new THREE.Group();
      mk(g, loftGeo(THREE, HAULER_ST), M.paint);
      mk(g, loftGeo(THREE, [sec(-10.95, 1.45, 1.05, 1.75, 0.35, 1.8, 0.0), sec(-10.25, 1.85, 1.95, 2.18, 1.0, 2.2, 0.2)]), M.glass);
      mirror((s) => {
        bx(g, M.dark, [0.05, 1.0, 17.4], [s * 2.31, 1.15, 0.6]);
        for (let i = 0; i < 11; i++) {
          const lit = ((i * 7 + (s > 0 ? 3 : 0)) % 5) !== 0;
          bx(g, lit ? M.win : M.glass, [0.06, 0.7, 1.25], [s * 2.33, 1.15, -7.4 + i * 1.6]);
        }
        bx(g, M.accA, [0.05, 0.07, 19.0], [s * 2.33, -0.05, 0.3]);
        mk(g, revGeo(THREE, [[-9.0, 0.0], [-8.6, 0.42], [-7.6, 0.6], [7.8, 0.6], [8.8, 0.45], [9.2, 0.0]], 10), M.hull2, [s * 1.65, -2.35, 0]);
        for (const z of [-6, -2, 2, 6]) mk(g, new THREE.CircleGeometry(0.26, 10), M.accA, [s * 1.65, -3.0, z], [Math.PI / 2, 0, 0]);
        bx(g, M.dark, [0.5, 0.6, 1.2], [s * 1.0, -2.1, -3]);
        bx(g, M.dark, [0.5, 0.6, 1.2], [s * 1.0, -2.1, 4]);
      });
      bx(g, M.dark, [3.4, 0.25, 14], [0, 2.52, 1.5]);
      bx(g, M.hull2, [2.6, 1.3, 5.0], [0, 3.3, 3.2]);
      mirror((s) => bx(g, M.accB, [0.04, 0.9, 4.4], [s * 1.34, 3.3, 3.2]));
      bx(g, M.metal, [1.8, 0.6, 2.2], [0, 2.95, -4.5]);
      mirror((s) => bx(g, M.accA, [0.1, 0.15, 0.6], [s * 2.05, 2.5, -9.0]));
      bx(g, M.white, [3.0, 0.16, 0.06], [0, -0.55, -11.02]);
      mirror((s) => bx(g, M.white, [0.7, 0.3, 0.06], [s * 1.25, -0.9, -10.95]));
      bx(g, M.accB, [3.6, 0.16, 0.06], [0, 1.6, 11.02]);
      mirror((s) => bx(g, M.accB, [0.5, 1.6, 0.06], [s * 1.75, 0.2, 10.96]));
      mirror((s) => {
        bx(g, M.dark, [1.0, 0.7, 0.8], [s * 1.0, -1.3, 11.0]);
        bx(g, M.accA, [0.6, 0.18, 0.04], [s * 1.0, -1.42, 11.44]);
      });
      return g;
    }
    /* Pod car: 5.6 m two-seat runabout. Low wedge, bubble canopy, side lift
       skirts with an underglow line, full-width tail bar. */
    function pod(M) {
      const g = new THREE.Group();
      mk(g, loftGeo(THREE, POD_ST), M.paint);
      mk(g, loftGeo(THREE, POD_CAN), M.glass);
      mirror((s) => {
        mk(g, loftGeo(THREE, [sec(-2.0, 0.18, 0.0, 0.25, -0.3, 0.2, -0.65), sec(2.2, 0.18, 0.0, 0.25, -0.3, 0.2, -0.6)]), M.dark, [s * 1.12, 0, 0]);
        bx(g, M.accA, [0.05, 0.05, 3.8], [s * 1.38, -0.62, 0.1]);
        bx(g, M.white, [0.55, 0.1, 0.05], [s * 0.6, -0.12, -2.82], [0, s * 0.25, 0]);
      });
      bx(g, M.accB, [1.9, 0.1, 0.05], [0, 0.18, 2.84]);
      bx(g, M.hull2, [2.0, 0.06, 0.5], [0, 0.42, 2.55]);
      return g;
    }
    /* Cargo drone: flat X frame, four ducted rotors, crate slung underneath
       on four lines, white nose light, accent tail and a blinking beacon. */
    function drone(M) {
      const g = new THREE.Group();
      mk(g, new THREE.CylinderGeometry(1.15, 1.25, 0.45, 8), M.hull2, [0, 0.3, 0]);
      mk(g, new THREE.CylinderGeometry(0.6, 0.8, 0.25, 8), M.dark, [0, 0.62, 0]);
      const rotors = [];
      for (const sx of [1, -1]) for (const sz of [1, -1]) {
        const arm = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.2, DR * 1.3), M.metal);
        arm.position.set(sx * DR / 2, 0.3, sz * DR / 2); arm.rotation.y = Math.atan2(sx, sz); g.add(arm);
        const d = new THREE.Group(); d.position.set(sx * DR, 0.35, sz * DR); g.add(d);
        mk(d, ductGeo(THREE, 0.85, 1.05, 0.38, 20), M.paint);
        /* rim ring just inside the duct mouth, clear of the duct's bottom
           face and inner wall (it used to cut through both and fought) */
        mk(d, new THREE.TorusGeometry(0.78, 0.035, 5, 24), M.accA, [0, -0.14, 0], [Math.PI / 2, 0, 0]);
        mk(d, new THREE.CylinderGeometry(0.16, 0.2, 0.3, 8), M.dark);
        const blades = new THREE.Group(); d.add(blades); rotors.push(blades);
        for (let b = 0; b < 3; b++) bx(blades, M.dark, [1.6, 0.03, 0.16], [0, 0.05, 0], [0.2, b * Math.PI / 3, 0]);
      }
      bx(g, M.paint, [2.2, 1.6, 2.8], [0, -1.9, 0]);
      bx(g, M.dark, [2.26, 0.12, 2.86], [0, -1.35, 0]);
      mirror((s) => bx(g, M.accB, [0.04, 0.14, 2.4], [s * 1.14, -2.1, 0]));
      for (const sx of [1, -1]) for (const sz of [1, -1]) {
        const a = new THREE.Vector3(sx * 0.7, 0.1, sz * 0.7), b = new THREE.Vector3(sx * 1.0, -1.15, sz * 1.3);
        const L = a.distanceTo(b), m = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, L), M.dark);
        m.position.copy(a).add(b).multiplyScalar(0.5); m.lookAt(b); g.add(m);
      }
      bx(g, M.white, [0.3, 0.1, 0.05], [0, 0.3, -1.22]);
      bx(g, M.accB, [0.3, 0.1, 0.05], [0, 0.3, 1.22]);
      g.userData.rotors = rotors;
      return g;
    }
    /* Freighter: 160 m heavy lifter. Bone hull with a raked bridge over the
       nose (two rows of warm windows on each side, one across the front),
       container stacks and a tank pair along the spine, four big ducted lift
       fans slung under the hull with a dim accent glow, one thin accent line
       at the waterline, two aft nozzles. The running lights are separate
       lamp meshes tagged userData.light (port, starboard, tail, strobe), at
       the positions of the light table, so model and glow agree. */
    function freighter(M) {
      const g = new THREE.Group();
      mk(g, loftGeo(THREE, FR_ST), M.paint);
      mk(g, loftGeo(THREE, FR_BRIDGE), M.cargoA);
      /* bridge roof and mast */
      bx(g, M.dark, [10, 0.6, 12], [0, 15.2, -57]);
      bx(g, M.metal, [0.7, 4.6, 0.7], [0, 17.6, -58]);
      bx(g, M.metal, [5, 0.3, 0.3], [0, 18.6, -58]);
      /* windows: two rows per side on the vertical bridge wall, one row
         across the front; every fifth one dark */
      mirror((s) => {
        for (let row = 0; row < 2; row++) {
          for (let i = 0; i < 12; i++) {
            const lit = ((i * 7 + row * 3 + (s > 0 ? 2 : 0)) % 5) !== 0;
            bx(g, lit ? M.win : M.glass, [0.12, 1.0, 0.75], [s * 8.04, 5.4 + row * 2.1, -63.5 + i * 1.15]);
          }
        }
      });
      for (let i = 0; i < 8; i++) bx(g, (i % 4) !== 1 ? M.win : M.glass, [0.85, 1.1, 0.12], [-3.5 + i, 11.0, -69.05]);
      for (let i = 0; i < 11; i++) bx(g, (i % 3) !== 2 ? M.win : M.glass, [0.85, 0.9, 0.12], [-5.0 + i, 7.0, -69.05]);
      /* cargo */
      const mats = [M.paint, M.cargoA, M.cargoB, M.cargoC];
      FR_BAYS.forEach((bay, bi) => {
        if (bay.tank) {
          mirror((s) => {
            mk(g, revGeo(THREE, [[-6.0, 0], [-5.8, 2.4], [-5.0, 3.1], [5.0, 3.1], [5.8, 2.4], [6.0, 0]], 14), M.cargoC, [s * 4.2, 7.3, bay.z]);
            bx(g, M.dark, [1.2, 2.6, 0.6], [s * 4.2, 5.2, bay.z - 4]);
            bx(g, M.dark, [1.2, 2.6, 0.6], [s * 4.2, 5.2, bay.z + 4]);
          });
          bx(g, M.dark, [0.8, 0.8, 12], [0, 10.8, bay.z]);
          return;
        }
        bay.c.forEach((h, ci) => {
          for (let k = 0; k < h; k++) {
            const m = mats[(bi * 5 + ci * 3 + k * 7) % 4];
            bx(g, m, [5.2, 2.5, 12.0], [(ci - 1) * 5.5, 5.3 + k * 2.6, bay.z]);
          }
        });
        bx(g, M.dark, [16.6, 0.2, 0.5], [0, 4.1, bay.z + 6.4]);
      });
      /* waterline accent, deck edge in dark, a belly band, hull seams every
         16 m and a sparse row of warm portholes: the small repeats are
         what gives the hull its size. The portholes stand 2 cm proud of
         the hull (at 9.97 their inner face lay in it, 5 mm off) */
      mirror((s) => {
        bx(g, M.accA, [0.12, 0.28, 136], [s * 11.04, -1.0, -1]);
        bx(g, M.dark, [0.4, 0.6, 136], [s * 8.9, 4.1, -1]);
        bx(g, M.dark, [0.1, 0.9, 134], [s * 9.97, -4.2, -1], [0, 0, -s * 0.32]);
        for (let i = 0; i < 9; i++) bx(g, M.dark, [0.1, 4.4, 0.25], [s * 10.08, 1.4, -62 + i * 16], [0, 0, s * 0.38]);
        for (let i = 0; i < 40; i++) {
          if (((i * 5 + (s > 0 ? 1 : 3)) % 7) < 3) continue;
          bx(g, M.win, [0.1, 0.6, 0.9], [s * 10.0, 1.7, -46 + i * 2.9], [0, 0, s * 0.38]);
        }
      });
      /* lift fans: pylon, duct, hub, slow blades, dim glow disc below.
         Nothing coplanar: the disc sits 10 cm above the hub's bottom cap
         (they shared y = -1.0 and scribbled), the rim ring runs 5 cm inside
         the inner wall instead of through the duct's bottom face. */
      const rotors = [];
      for (const f of FR_FANS) {
        const sx = Math.sign(f[0]);
        bx(g, M.dark, [6.5, 2.0, 3.2], [sx * 9.4, FR_FAN_Y + 2.2, f[1]]);
        const d = new THREE.Group(); d.position.set(f[0], FR_FAN_Y, f[1]); g.add(d);
        mk(d, ductGeo(THREE, FR_FAN_R - 0.8, FR_FAN_R, 2.6, 28), M.hull2);
        mk(d, new THREE.CylinderGeometry(1.2, 1.5, 2.0, 10), M.dark);
        mk(d, new THREE.CircleGeometry(FR_FAN_R - 0.9, 24), M.fan, [0, FR_DISC_Y, 0], [Math.PI / 2, 0, 0]);
        mk(d, new THREE.TorusGeometry(FR_RIM_R, 0.12, 5, 32), M.accA, [0, -1.2, 0], [Math.PI / 2, 0, 0]);
        const blades = new THREE.Group(); d.add(blades); rotors.push(blades);
        const bg = [];
        for (let b = 0; b < 4; b++) {
          bg.push(new THREE.BoxGeometry(2 * FR_FAN_R - 2.0, 0.18, 1.3).applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(
            new THREE.Euler(0.25, b * Math.PI / 4, 0))).translate(0, 0.2, 0));
        }
        mk(blades, mergeGeos(THREE, bg, ['position', 'normal']), M.dark);
      }
      /* aft nozzles */
      mirror((s) => {
        mk(g, revGeo(THREE, [[75.5, 2.4], [78.5, 2.6], [80.3, 2.2]], 12), M.dark, [s * 4.5, -1.5, 0]);
        mk(g, new THREE.CircleGeometry(1.9, 12), M.fan, [s * 4.5, -1.5, 80.2]);
      });
      /* running lights and strobes: lamp bodies from the light table */
      const lamps = [];
      LIGHTS.freighter.forEach((lt, li) => {
        if (!lt.tag) return;
        const mat = lt.c === 'r' ? M.red : lt.c === 'g' ? M.green : M.white;
        const m = mk(g, new THREE.BoxGeometry(0.6, 0.6, 0.6), mat, lt.p);
        m.userData.light = lt.tag; m.userData.li = li;
        lamps.push(m);
      });
      g.userData.rotors = rotors;
      g.userData.rotorRate = 1.1;
      g.userData.lamps = lamps;
      return g;
    }
    return { hauler: hauler, pod: pod, drone: drone, freighter: freighter };
  }
  /* Merge a near model's static meshes per material: one draw call per
     material instead of one per part (HANDOFF: 2.8 to 1.1 ms). The rotor
     blades stay separate because they turn, the freighter's lamps because
     they carry their tag and the strobes flash. */
  function compactModel(THREE, root) {
    root.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
    const keep = new Set();
    for (const r of root.userData.rotors || []) r.traverse((o) => keep.add(o));
    for (const l of root.userData.lamps || []) keep.add(l);
    const byMat = new Map(), drop = [];
    root.traverse((o) => {
      if (!o.isMesh || keep.has(o)) return;
      const g = o.geometry.clone();
      g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
      if (!byMat.has(o.material)) byMat.set(o.material, []);
      byMat.get(o.material).push(g);
      drop.push(o);
    });
    for (const o of drop) { o.parent.remove(o); o.geometry.dispose(); }
    for (const c of root.children.slice()) if (c.isGroup && !c.children.length) root.remove(c);
    for (const entry of byMat) root.add(new THREE.Mesh(mergeGeos(THREE, entry[1], ['position', 'normal']), entry[0]));
    return root;
  }

  /* ---- light table, hull frame. kind: head (seen from the front), tail
     (from the back), omni; c: colour role white / a / b; blink: beacon
     period in s, closed form. ---------------------------------------------- */
  const LIGHTS = {
    hauler: [
      { p: [1.25, -0.8, -11.2], k: 'head', s: 2.6, c: 'w', g: 0.75 }, { p: [-1.25, -0.8, -11.2], k: 'head', s: 2.6, c: 'w', g: 0.75 },
      { p: [1.6, 1.6, 11.2], k: 'tail', s: 2.4, c: 'b', g: 0.7 }, { p: [-1.6, 1.6, 11.2], k: 'tail', s: 2.4, c: 'b', g: 0.7 },
      { p: [2.1, 2.6, -9.0], k: 'omni', s: 1.3, c: 'a', g: 0.5 }, { p: [-2.1, 2.6, -9.0], k: 'omni', s: 1.3, c: 'a', g: 0.5 },
      { p: [0, -3.2, 0], k: 'omni', s: 11, c: 'a', g: 0.06 }
    ],
    pod: [
      { p: [0.65, -0.12, -2.95], k: 'head', s: 1.5, c: 'w', g: 0.7 }, { p: [-0.65, -0.12, -2.95], k: 'head', s: 1.5, c: 'w', g: 0.7 },
      { p: [0.75, 0.18, 2.95], k: 'tail', s: 1.4, c: 'b', g: 0.65 }, { p: [-0.75, 0.18, 2.95], k: 'tail', s: 1.4, c: 'b', g: 0.65 },
      { p: [0, -0.9, 0], k: 'omni', s: 4.5, c: 'a', g: 0.08 }
    ],
    drone: [
      { p: [0, 0.3, -1.4], k: 'head', s: 1.3, c: 'w', g: 0.7 },
      { p: [0, 0.3, 1.4], k: 'tail', s: 1.3, c: 'b', g: 0.6 },
      { p: [0, 1.0, 0], k: 'omni', s: 2.4, c: 'b', g: 0.9, blink: 1.3 },
      { p: [DR, -0.2, DR], k: 'omni', s: 2.2, c: 'a', g: 0.18 }, { p: [-DR, -0.2, DR], k: 'omni', s: 2.2, c: 'a', g: 0.18 },
      { p: [DR, -0.2, -DR], k: 'omni', s: 2.2, c: 'a', g: 0.18 }, { p: [-DR, -0.2, -DR], k: 'omni', s: 2.2, c: 'a', g: 0.18 }
    ],
    /* Aviation convention, the one place where red and green appear: red on
       the port (left, -x) side, green starboard, white at the tail, white
       anticollision strobes on top and bottom. The strobes double-flash
       (bottom 0.3 s after top) every 2.6 s, a closed formula of t; on is
       the flash length, off the level between flashes. tag names the lamp
       mesh of the near model. Under each lift fan a faint wide accent glow,
       warm glows behind the front bridge windows. */
    freighter: [
      { p: [-20.5, FR_FAN_Y, -46], k: 'omni', s: 9, c: 'r', g: 1.0, tag: 'port' },
      { p: [20.5, FR_FAN_Y, -46], k: 'omni', s: 9, c: 'g', g: 1.0, tag: 'starboard' },
      { p: [0, 2.5, 80.6], k: 'tail', s: 9, c: 'w', g: 1.0, tag: 'tail' },
      { p: [0, 20.4, -58], k: 'omni', s: 26, c: 'w', g: 1.9, blink: 2.6, on: 0.08, off: 0, tag: 'strobe' },
      { p: [0, -7.6, 8], k: 'omni', s: 26, c: 'w', g: 1.9, blink: 2.6, on: 0.08, off: 0, shift: 2.3, tag: 'strobe' },
      { p: [3.5, -1.0, -80.6], k: 'head', s: 5, c: 'w', g: 0.6 }, { p: [-3.5, -1.0, -80.6], k: 'head', s: 5, c: 'w', g: 0.6 },
      { p: [-2.5, 11.0, -69.6], k: 'head', s: 5, c: 'h', g: 0.22 }, { p: [2.5, 11.0, -69.6], k: 'head', s: 5, c: 'h', g: 0.22 },
      { p: [FR_FANS[0][0], FR_FAN_Y - 2.0, FR_FANS[0][1]], k: 'omni', s: 22, c: 'a', g: 0.07 },
      { p: [FR_FANS[1][0], FR_FAN_Y - 2.0, FR_FANS[1][1]], k: 'omni', s: 22, c: 'a', g: 0.07 },
      { p: [FR_FANS[2][0], FR_FAN_Y - 2.0, FR_FANS[2][1]], k: 'omni', s: 22, c: 'a', g: 0.07 },
      { p: [FR_FANS[3][0], FR_FAN_Y - 2.0, FR_FANS[3][1]], k: 'omni', s: 22, c: 'a', g: 0.07 }
    ]
  };
  /* strobe state, the same formula for the glow and the lamp mesh */
  function flashOn(lt, t, ph) { return mod(t + ph + (lt.shift || 0), lt.blink) < (lt.on || 0.12); }

  /* Effective bands of one type: BANDS, then for a type with its own
     TYPE_BANDS entry that entry (flat overrides do not reach it), else the
     flat keys of over, then over[type]. */
  function bandsFor(tn, over) {
    over = over || {};
    const b = Object.assign({}, BANDS);
    if (TYPE_BANDS[tn]) Object.assign(b, TYPE_BANDS[tn]);
    else for (const k in BANDS) if (typeof over[k] === 'number') b[k] = over[k];
    if (over[tn]) Object.assign(b, over[tn]);
    return b;
  }

  /* createTraffic(THREE, { lanes, debug, accents, warm, bands, pools, fog })
       lanes    makeLane results; the visual reads poses from them, so the
                collision layer and the picture agree by construction
       accents  [a, b] hex colours: a for strips, underglow, express streaks,
                b for tail lights and ads (default [CYAN, MAGENTA]); one
                entry uses that colour for both roles
       warm     hex colour of the freighter's bridge windows (default
                0xffa63d, the page's WARM)
       bands    overrides of BANDS, flat for the street types, per type as
                a sub-object (see TYPE_BANDS); stats.bands has the result
       pools    near models per type (default { hauler 14, pod 28, drone 16,
                freighter 3 }); a type without vehicles gets none
       debug    tint the LOD levels (near red, mid green, far blue)
     Returns { group, update(t, cameraPos), dispose(), stats, setDebug(on),
     vehicles }. group must sit in the scene untransformed: the light and
     streak layers write world positions and ignore the model matrix.
     cameraPos is a Vector3, an [x, y, z] or a camera. */
  function createTraffic(THREE, opts) {
    opts = opts || {};
    const lanes = opts.lanes || [];
    const TB = {};
    for (const tn of TYPE_NAMES) TB[tn] = bandsFor(tn, opts.bands);
    const warmC = opts.warm != null ? opts.warm : 0xffa63d;
    const acc = opts.accents && opts.accents.length ? opts.accents : [CYAN, MAGENTA];
    const accA = acc[0], accB = acc.length > 1 ? acc[1] : acc[0];
    const poolSize = Object.assign({ hauler: 14, pod: 28, drone: 16, freighter: 3 }, opts.pools || {});
    const fog = opts.fog || null;
    const stops = boneStops();
    const bone = (t) => boneColor(THREE, stops, t);
    const owned = [];
    const tint = {
      near: { value: new THREE.Vector4(1, 0.2, 0.15, 0) },
      mid: { value: new THREE.Vector4(0.2, 1, 0.3, 0) }
    };
    let debug = false;

    const group = new THREE.Group(); group.name = 'traffic';
    const nearG = new THREE.Group(); nearG.name = 'near';
    const midG = new THREE.Group(); midG.name = 'mid';
    group.add(nearG, midG);

    /* vehicles: one record per non-empty slot */
    const vehicles = [];
    for (const lane of lanes) {
      for (let k = 0; k < lane.count; k++) {
        const info = slotInfo(lane, k);
        if (!info) continue;
        vehicles.push({ id: vehicles.length, lane: lane, k: k, type: info.type, paint: bone(info.paint),
          bobPh: info.bobPh, len: TYPES[info.type].len, slot: -1, state: 'off' });
      }
    }
    const byLane = new Map();
    for (const v of vehicles) { if (!byLane.has(v.lane)) byLane.set(v.lane, []); byLane.get(v.lane).push(v); }

    /* near pools: one material set per slot, each with its own crossfade
       range and paint; the programs are shared (same cache key) */
    const WHITE = bone(0.97);
    function nearMats(tn) {
      const range = { value: new THREE.Vector2(0, 1) };
      const std = (t, rough, metal) => cgPatch(fog, patchVeh(new THREE.MeshStandardMaterial({
        color: bone(t), roughness: rough, metalness: metal, flatShading: true, side: THREE.DoubleSide }), false, range, tint.near));
      const basic = (c) => cgPatch(fog, patchVeh(new THREE.MeshBasicMaterial({ color: c, toneMapped: false, side: THREE.DoubleSide }), false, range, tint.near), { fogK: 0.6 });
      const M = {
        paint: std(0.5, 0.55, 0.3), hull2: std(0.36, 0.55, 0.3), dark: std(0.14, 0.7, 0.3), metal: std(0.28, 0.35, 0.7),
        glass: cgPatch(fog, patchVeh(new THREE.MeshStandardMaterial({ color: bone(0.22), roughness: 0.15, metalness: 0.7, flatShading: true,
          side: THREE.DoubleSide, emissive: new THREE.Color(accA).multiplyScalar(0.03) }), false, range, tint.near)),
        win: basic(bone(0.78).multiplyScalar(1.15)),
        accA: basic(new THREE.Color(accA).multiplyScalar(1.6)),
        accB: basic(new THREE.Color(accB).multiplyScalar(1.6)),
        white: basic(new THREE.Color(1, 1, 1).multiplyScalar(1.8))
      };
      if (tn === 'freighter') {
        M.win.color.set(warmC).multiplyScalar(1.25);
        M.red = basic(new THREE.Color(NAV_RED).multiplyScalar(1.8));
        M.green = basic(new THREE.Color(NAV_GREEN).multiplyScalar(1.8));
        M.fan = basic(new THREE.Color(accA).multiplyScalar(0.35));
        /* the glow discs win any remaining depth tie */
        Object.assign(M.fan, { polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
        M.cargoA = std(0.62, 0.6, 0.2); M.cargoB = std(0.44, 0.6, 0.25); M.cargoC = std(0.74, 0.65, 0.15);
      }
      for (const k in M) owned.push(M[k]);
      M.range = range;
      return M;
    }
    const builders = makeBuilders(THREE);
    const pools = {}, nearTris = {};
    for (const tn of TYPE_NAMES) {
      pools[tn] = [];
      const n = vehicles.some((v) => v.type === tn) ? poolSize[tn] : 0;
      for (let i = 0; i < n; i++) {
        const M = nearMats(tn);
        const obj = compactModel(THREE, builders[tn](M));
        obj.name = 'near-' + tn;
        obj.matrixAutoUpdate = false; obj.visible = false;
        nearG.add(obj);
        pools[tn].push({ obj: obj, M: M, owner: -1, used: false });
      }
      let tris = 0;
      if (pools[tn].length) pools[tn][0].obj.traverse((o) => { if (o.isMesh) tris += (o.geometry.index ? o.geometry.index.count : o.geometry.getAttribute('position').count) / 3; });
      nearTris[tn] = tris;
    }

    /* mid: low-poly bodies with vertex colour and aMat = (emission, paint
       mask), one InstancedMesh per type */
    function part(geo, color, emit, paint) {
      const g = geo.index ? geo.toNonIndexed() : geo;
      if (g !== geo) geo.dispose();
      if (g.getAttribute('uv')) g.deleteAttribute('uv');
      if (!g.getAttribute('normal')) g.computeVertexNormals();
      const n = g.getAttribute('position').count, col = new Float32Array(n * 3), mt = new Float32Array(n * 2);
      const c = color.isColor ? color : new THREE.Color(color);
      for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; mt[i * 2] = emit || 0; mt[i * 2 + 1] = paint || 0; }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      g.setAttribute('aMat', new THREE.BufferAttribute(mt, 2));
      return g;
    }
    const box = (w, h, d, x, y, z) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
    const NA = () => new THREE.Color(accA).multiplyScalar(0.9), NB = () => new THREE.Color(accB).multiplyScalar(0.9), NW = () => new THREE.Color(1, 1, 1);
    const ATTRS = ['position', 'normal', 'color', 'aMat'];
    const LP = {
      hauler: () => mergeGeos(THREE, [
        part(loftGeo(THREE, [HAULER_ST[0], HAULER_ST[1], HAULER_ST[4]]), NW(), 0, 1),
        part(box(4.68, 0.7, 17.4, 0, 1.15, 0.6), bone(0.62), 0.55),
        part(box(4.66, 0.08, 19, 0, -0.05, 0.3), NA(), 1),
        part(box(1.1, 1.1, 18, 1.65, -2.35, 0), bone(0.36)),
        part(box(1.1, 1.1, 18, -1.65, -2.35, 0), bone(0.36)),
        part(box(2.6, 1.3, 5.0, 0, 3.3, 3.2), bone(0.36)),
        part(box(2.7, 0.9, 4.4, 0, 3.3, 3.2), NB(), 0.8),
        part(box(3.0, 0.2, 0.1, 0, -0.55, -11.0), NW(), 1),
        part(box(3.6, 0.2, 0.1, 0, 1.6, 11.0), NB(), 1)
      ], ATTRS),
      pod: () => mergeGeos(THREE, [
        part(loftGeo(THREE, [POD_ST[0], POD_ST[2], POD_ST[4]]), NW(), 0, 1),
        part(loftGeo(THREE, [POD_CAN[0], POD_CAN[1], POD_CAN[3]]), bone(0.22)),
        part(box(2.75, 0.06, 3.8, 0, -0.62, 0.1), NA(), 1),
        part(box(1.6, 0.12, 0.08, 0, -0.12, -2.8), NW(), 1),
        part(box(1.9, 0.12, 0.08, 0, 0.18, 2.8), NB(), 1)
      ], ATTRS),
      drone: () => {
        const P = [
          part(new THREE.CylinderGeometry(1.15, 1.25, 0.45, 6).translate(0, 0.3, 0), bone(0.36)),
          part(box(2.2, 1.6, 2.8, 0, -1.9, 0), NW(), 0, 1),
          part(box(2.26, 0.14, 2.4, 0, -2.1, 0), NB(), 0.9)
        ];
        for (const sx of [1, -1]) for (const sz of [1, -1]) {
          P.push(part(new THREE.CylinderGeometry(1.05, 1.05, 0.38, 6, 1, true).translate(sx * DR, 0.35, sz * DR), NW(), 0, 1));
          P.push(part(new THREE.CylinderGeometry(0.9, 0.9, 0.02, 6).translate(sx * DR, 0.15, sz * DR), NA(), 0.7));
          P.push(part(box(0.25, 0.2, DR * 1.3, 0, 0, 0).rotateY(Math.atan2(sx, sz)).translate(sx * DR / 2, 0.3, sz * DR / 2), bone(0.28)));
        }
        return mergeGeos(THREE, P, ATTRS);
      }
    };
    /* freighter mid body: hull, bridge, one cargo slab, fan drums, and the
       light rows (bridge windows warm, waterline and fan discs accent) as
       emissive parts, so the rows the near model shows stay put */
    LP.freighter = () => {
      const W = () => new THREE.Color(warmC).multiplyScalar(0.75);
      const P = [
        part(loftGeo(THREE, [FR_ST[0], FR_ST[2], FR_ST[3], FR_ST[5]]), NW(), 0, 1),
        part(loftGeo(THREE, [FR_BRIDGE[0], FR_BRIDGE[1], FR_BRIDGE[3]]), bone(0.62)),
        part(box(16.6, 6.5, 50, 0, 7.3, -21), bone(0.44)),
        part(box(16.6, 6.5, 37, 0, 7.3, 44.5), bone(0.36)),
        part(box(14.8, 5.6, 25, 0, 7.3, 5.5), bone(0.3)),
        part(box(16.2, 3.1, 12.6, 0, 6.45, -57.2), W(), 1),
        part(box(8.0, 1.1, 0.2, 0, 11.0, -69.1), W(), 1),
        part(box(11.0, 0.9, 0.2, 0, 7.0, -69.1), W(), 1),
        part(box(22.2, 0.3, 136, 0, -1.0, -1), NA(), 1),
        part(box(0.7, 4.6, 0.7, 0, 17.6, -58), bone(0.28))
      ];
      for (const f of FR_FANS) {
        P.push(part(new THREE.CylinderGeometry(FR_FAN_R, FR_FAN_R, 2.6, 8, 1, true).translate(f[0], FR_FAN_Y, f[1]), bone(0.36)));
        P.push(part(new THREE.CylinderGeometry(FR_FAN_R - 0.8, FR_FAN_R - 0.8, 0.1, 8).translate(f[0], FR_FAN_Y + FR_DISC_Y, f[1]), NA(), 0.3));
        P.push(part(box(6.5, 2.0, 3.2, Math.sign(f[0]) * 9.4, FR_FAN_Y + 2.2, f[1]), bone(0.2)));
      }
      return mergeGeos(THREE, P, ATTRS);
    };
    const midMat = cgPatch(fog, patchVeh(new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.6, metalness: 0.3, flatShading: true }),
      true, null, tint.mid));
    owned.push(midMat);
    const mids = {};
    for (const tn of TYPE_NAMES) {
      const n = vehicles.filter((v) => v.type === tn).length;
      if (!n) continue;
      const geo = LP[tn]();
      const aRange = new THREE.InstancedBufferAttribute(new Float32Array(n * 2), 2).setUsage(THREE.DynamicDrawUsage);
      const aPaint = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3).setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute('aRange', aRange); geo.setAttribute('aPaint', aPaint);
      const mesh = new THREE.InstancedMesh(geo, midMat, n);
      mesh.name = 'mid-' + tn;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false; mesh.count = 0;
      midG.add(mesh);
      mids[tn] = { mesh: mesh, aRange: aRange, aPaint: aPaint, tris: geo.getAttribute('position').count / 3 };
    }

    /* far streaks and the shared light layer (every LOD, so the lights never
       change when the body under them does) */
    let nLights = 0;
    for (const v of vehicles) nLights += LIGHTS[v.type].length;
    const streak = streakMesh(THREE, Math.max(1, vehicles.length));
    streak.mesh.name = 'far';
    const glow = glowMesh(THREE, Math.max(1, nLights));
    glow.mesh.name = 'lights';
    cgAdditive(fog, streak.mesh.material); cgAdditive(fog, glow.mesh.material);
    group.add(streak.mesh, glow.mesh);
    owned.push(streak.mesh.material, glow.mesh.material);

    /* sRGB numbers for the additive layers, which write raw output */
    const srgb = (c) => { const s = new THREE.Color(c).convertLinearToSRGB(); return [s.r, s.g, s.b]; };
    const COL = { w: srgb(WHITE), a: srgb(new THREE.Color(accA)), b: srgb(new THREE.Color(accB)),
      r: srgb(new THREE.Color(NAV_RED)), g: srgb(new THREE.Color(NAV_GREEN)), h: srgb(new THREE.Color(warmC)),
      dbgN: srgb(new THREE.Color(1, 0.15, 0.1)), dbgM: srgb(new THREE.Color(0.15, 1, 0.25)), dbgF: srgb(new THREE.Color(0.25, 0.45, 1)) };
    const LT = {};
    for (const tn of TYPE_NAMES) LT[tn] = LIGHTS[tn].map((l) => Object.assign({ rgb: COL[l.c] }, l));

    const fr = scratch(), nose = scratch(), tail = scratch();
    const M4 = new THREE.Matrix4();
    const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
    const stats = { near: 0, mid: 0, far: 0, culled: 0, fading: 0, total: vehicles.length, lights: 0, streaks: 0,
      nearPeak: {}, nearDenied: 0, deniedTotal: 0, trisNear: 0, trisMid: 0 };
    for (const tn of TYPE_NAMES) stats.nearPeak[tn] = 0;
    stats.bands = TB;
    const nearCount = {};
    /* per lane: the largest cull of the types it carries */
    const laneCull = new Map();
    for (const v of vehicles) laneCull.set(v.lane, Math.max(laneCull.get(v.lane) || 0, TB[v.type].cull));

    function release(v) { if (v.slot >= 0) { pools[v.type][v.slot].owner = -1; v.slot = -1; } }
    function setDebug(on) {
      debug = !!on;
      tint.near.value.w = debug ? 0.55 : 0;
      tint.mid.value.w = debug ? 0.55 : 0;
    }
    setDebug(opts.debug);

    let lastT = null;
    function update(t, cameraPos) {
      const c = cameraPos && cameraPos.isCamera ? cameraPos.position : cameraPos;
      const cx = Array.isArray(c) ? c[0] : c.x, cy = Array.isArray(c) ? c[1] : c.y, cz = Array.isArray(c) ? c[2] : c.z;
      const cam = [cx, cy, cz];
      /* warm start: first frame or a time jump (seek, restart) lets any
         vehicle claim a slot, there is no previous frame to pop from */
      const warm = lastT === null || Math.abs(t - lastT) > 0.5;
      lastT = t;
      const st = stats;
      st.near = st.mid = st.far = st.culled = st.fading = 0; st.nearDenied = 0;
      for (const tn of TYPE_NAMES) { if (mids[tn]) mids[tn].mesh.count = 0; nearCount[tn] = 0; for (const sl of pools[tn]) sl.used = false; }
      let gi = 0, si = 0, trisN = 0;
      const gp = glow.att.iPos.array, gs = glow.att.iSize.array, gc = glow.att.iCol.array;
      const sa = streak.att.iA.array, sb = streak.att.iB.array, sw = streak.att.iW.array, sc = streak.att.iCol.array;

      for (const lane of lanes) {
        const list = byLane.get(lane);
        if (!list) continue;
        if (boxDist(lane.lo, lane.hi, cam) > laneCull.get(lane)) {
          for (const v of list) { release(v); v.state = 'off'; }
          st.culled += list.length;
          continue;
        }
        for (const v of list) {
          const s = slotS(lane, v.k, t);
          if (!lane.loop && s >= lane.L) { release(v); v.state = 'off'; st.culled++; continue; }
          /* ef: the dithered fade at the ends of an open lane (fadeEnds) */
          let ef = 1;
          if (!lane.loop && lane.fadeEnds > 0) {
            ef = Math.min(1, s / lane.fadeEnds, (lane.L - s) / lane.fadeEnds);
            if (ef <= 1e-3) { release(v); v.state = 'off'; st.culled++; continue; }
            ef = ef * ef * (3 - 2 * ef);
          }
          laneFrame(lane, s, t, v.bobPh, fr, v.type);
          /* models, mid bodies and lights follow the body frame (nose F = fr.h);
             the far streak follows the lane */
          const P = fr.p, F = fr.h, U = fr.u, R = fr.r;
          const dx = cx - P[0], dy = cy - P[1], dz = cz - P[2];
          const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
          const bands = TB[v.type];
          if (d > bands.cull) { release(v); v.state = 'off'; st.culled++; continue; }
          M4.set(R[0], U[0], -F[0], P[0], R[1], U[1], -F[1], P[1], R[2], U[2], -F[2], P[2], 0, 0, 0, 1);
          const nearF = 1 - smooth(bands.nearFull, bands.nearOut, d);
          const farF = smooth(bands.midFull, bands.midOut, d);
          const facing = d > 1e-6 ? (F[0] * dx + F[1] * dy + F[2] * dz) / d : 0;

          /* near slot, sticky. A vehicle may only claim a free slot while it
             is still at the outer edge of the crossfade, so a late claim can
             never pop a full-detail model in. */
          if (nearF > 0) {
            if (v.slot < 0 && (nearF < 0.35 || warm)) {
              const pool = pools[v.type];
              let k = -1;
              for (let i = 0; i < pool.length; i++) if (pool[i].owner < 0) { k = i; break; }
              if (k >= 0) { pool[k].owner = v.id; v.slot = k; } else { st.nearDenied++; st.deniedTotal++; }
            }
          } else release(v);
          const hasNear = v.slot >= 0;
          const fN = hasNear ? nearF : 0;
          if (hasNear) {
            const sl = pools[v.type][v.slot];
            sl.used = true;
            sl.obj.matrix.copy(M4); sl.obj.matrixWorldNeedsUpdate = true; sl.obj.visible = true;
            sl.M.range.value.set(0, fN * ef);
            sl.M.paint.color.copy(v.paint);
            const ud = sl.obj.userData;
            if (ud.rotors) for (const r of ud.rotors) r.rotation.y = t * (ud.rotorRate || 11) + v.bobPh;
            if (ud.lamps) for (const lm of ud.lamps) { const lt = LIGHTS[v.type][lm.userData.li]; if (lt.blink) lm.visible = flashOn(lt, t, v.bobPh); }
            nearCount[v.type]++;
            trisN += nearTris[v.type];
          }
          /* mid body: everything the near model and the streak do not cover */
          const lo = fN * ef, hi = (1 - farF) * ef;
          if (hi > lo + 1e-3) {
            const m = mids[v.type], i = m.mesh.count++;
            m.mesh.setMatrixAt(i, M4);
            m.aRange.array[i * 2] = lo; m.aRange.array[i * 2 + 1] = hi;
            m.aPaint.array[i * 3] = v.paint.r; m.aPaint.array[i * 3 + 1] = v.paint.g; m.aPaint.array[i * 3 + 2] = v.paint.b;
          }
          const band = fN >= 0.5 ? 'near' : (farF >= 0.5 ? 'far' : 'mid');
          st[band]++;
          if ((fN > 0 && fN < 1) || (farF > 0 && farF < 1)) st.fading++;
          v.state = band;
          const dbg = debug ? (band === 'near' ? COL.dbgN : band === 'mid' ? COL.dbgM : COL.dbgF) : null;

          /* lights, at every distance */
          for (const lt of LT[v.type]) {
            const lx = lt.p[0], ly = lt.p[1], lz = lt.p[2];
            let g = lt.g * ef;
            if (lt.k === 'head') g *= 0.15 + 0.85 * Math.pow(Math.max(0, facing), 1.5);
            else if (lt.k === 'tail') g *= 0.3 + 0.7 * Math.pow(Math.max(0, -facing), 1.5);
            if (lt.blink) g *= flashOn(lt, t, v.bobPh) ? 1 : (lt.off != null ? lt.off : 0.08);
            if (g <= 0) continue;
            const col = dbg || lt.rgb;
            gp[gi * 3] = P[0] + R[0] * lx + U[0] * ly - F[0] * lz;
            gp[gi * 3 + 1] = P[1] + R[1] * lx + U[1] * ly - F[1] * lz;
            gp[gi * 3 + 2] = P[2] + R[2] * lx + U[2] * ly - F[2] * lz;
            gs[gi * 2] = lt.s; gs[gi * 2 + 1] = lt.s;
            gc[gi * 3] = col[0] * g; gc[gi * 3 + 1] = col[1] * g; gc[gi * 3 + 2] = col[2] * g;
            gi++;
          }
          /* far streak: grows out of the body over the mid to far fade. The
             freighter's streak is its own length and wide, warm white from
             every side: a slow bright bar with the strobes on it. */
          if (farF > 0) {
            const big = v.type === 'freighter';
            const trail = big ? v.len : v.len + ((lane.express ? 70 : 34) - v.len) * farF;
            let sN = s + v.len / 2, sT = sN - trail;
            if (lane.loop) { sN = mod(sN, lane.L); sT = mod(sT, lane.L); } else { sN = Math.min(sN, lane.L); sT = Math.max(0, sT); }
            lanePoint(lane, sN, nose); lanePoint(lane, sT, tail);
            const hc = lane.express ? COL.a : COL.w;
            const kf = Math.min(1, Math.max(0, (facing + 0.25) / 0.5));
            const k = kf * kf * (3 - 2 * kf);
            const g = farF * ef * (debug ? 5 : big ? 1.5 : 2.2);
            const col = dbg || (big ? [COL.w[0] * 0.6 + COL.h[0] * 0.4, COL.w[1] * 0.6 + COL.h[1] * 0.4, COL.w[2] * 0.6 + COL.h[2] * 0.4]
              : [hc[0] * k + COL.b[0] * (1 - k), hc[1] * k + COL.b[1] * (1 - k), hc[2] * k + COL.b[2] * (1 - k)]);
            sa[si * 3] = tail.p[0]; sa[si * 3 + 1] = tail.p[1]; sa[si * 3 + 2] = tail.p[2];
            sb[si * 3] = nose.p[0]; sb[si * 3 + 1] = nose.p[1]; sb[si * 3 + 2] = nose.p[2];
            /* keep the streak at least about 1.5 px wide far out (fov 62, 900 px) */
            sw[si * 2] = big ? Math.max(4, d * 0.0026) : Math.max(lane.express ? 0.6 : 0.5, d * 0.0013);
            sw[si * 2 + 1] = big ? 0.35 : 1;
            sc[si * 3] = col[0] * g; sc[si * 3 + 1] = col[1] * g; sc[si * 3 + 2] = col[2] * g;
            si++;
          }
        }
      }
      for (const tn of TYPE_NAMES) {
        for (const sl of pools[tn]) {
          if (!sl.used) { sl.obj.visible = false; if (sl.owner >= 0 && vehicles[sl.owner].slot < 0) sl.owner = -1; }
        }
        st.nearPeak[tn] = Math.max(st.nearPeak[tn], nearCount[tn]);
        const m = mids[tn];
        if (!m) continue;
        m.mesh.instanceMatrix.needsUpdate = true; m.aRange.needsUpdate = true; m.aPaint.needsUpdate = true;
      }
      glow.mesh.geometry.instanceCount = gi; streak.mesh.geometry.instanceCount = si;
      for (const k in glow.att) glow.att[k].needsUpdate = true;
      for (const k in streak.att) streak.att[k].needsUpdate = true;
      st.lights = gi; st.streaks = si; st.trisNear = trisN;
      st.trisMid = 0;
      for (const tn of TYPE_NAMES) if (mids[tn]) st.trisMid += mids[tn].mesh.count * mids[tn].tris;
      return st;
    }

    function dispose() {
      group.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.isInstancedMesh && o.dispose) o.dispose(); });
      for (const m of owned) m.dispose();
      owned.length = 0;
    }
    return { group: group, update: update, dispose: dispose, stats: stats, setDebug: setDebug,
      vehicles: vehicles, pools: pools, mids: mids };
  }

  const HikyakuTraffic = {
    CYAN: CYAN, MAGENTA: MAGENTA, LANE_Y: Object.freeze(LANE_Y.slice()), BANDS: Object.freeze(Object.assign({}, BANDS)),
    FREIGHT_Y: Object.freeze(FREIGHT_Y.slice()), TYPE_BANDS: Object.freeze(JSON.parse(JSON.stringify(TYPE_BANDS))),
    bandsFor: bandsFor, freighterLanes: freighterLanes,
    TYPES: Object.freeze(TYPES), TYPE_NAMES: Object.freeze(TYPE_NAMES.slice()),
    makeLane: makeLane, laneLength: laneLength, countOnLane: countOnLane,
    poseAt: poseAt, velocityAt: velocityAt, nearVehicles: nearVehicles,
    vehicleHull: vehicleHull, contactsVehicles: contactsVehicles,
    gapsAcross: gapsAcross, nearestS: nearestS, laneClearance: laneClearance,
    createTraffic: createTraffic
  };
  globalThis.HikyakuTraffic = HikyakuTraffic;
})();
