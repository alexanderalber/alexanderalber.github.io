/* sixdof.js -- shared rigid-body flight dynamics for alber.me tools.
 *
 * The pure half of the 6DOF ships: vector and quaternion helpers, mesh
 * inertia and principal axes, the two hulls, the RK4 integrator on Euler's
 * equation, the wrench the 3D mouse produces, the sequential-impulse contact
 * solver, the second-order camera filter and the config reader.
 *
 * Nothing here touches the DOM, three.js or React, so the module runs in the
 * page and under Node, where notes/dev/sixdof.test.mjs evaluates the file as
 * a string. Everything hangs on globalThis.SixDOF.
 *
 * It lived in the <script id="sdcore"> block of spaceship-6dof.html until
 * 2026-08-30, when asteroid-corridor.html needed the same dynamics and
 * copying it was not an option.
 */
var SixDOF = (function () {
  'use strict';

  /* ---- small vector helpers ------------------------------------------- */
  function add(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function mul(a, s) { return [a[0] * s, a[1] * s, a[2] * s]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function cross(a, b) {
    return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  }
  function len(a) { return Math.sqrt(dot(a, a)); }

  /* ---- quaternions, [w, x, y, z], body to world ------------------------ */
  function qMul(a, b) {
    return [
      a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3],
      a[0] * b[1] + a[1] * b[0] + a[2] * b[3] - a[3] * b[2],
      a[0] * b[2] - a[1] * b[3] + a[2] * b[0] + a[3] * b[1],
      a[0] * b[3] + a[1] * b[2] - a[2] * b[1] + a[3] * b[0]
    ];
  }
  function qConj(q) { return [q[0], -q[1], -q[2], -q[3]]; }
  function qNorm(q) {
    var n = Math.sqrt(q[0] * q[0] + q[1] * q[1] + q[2] * q[2] + q[3] * q[3]);
    if (!(n > 1e-12)) return [1, 0, 0, 0];
    return [q[0] / n, q[1] / n, q[2] / n, q[3] / n];
  }
  /* v_world = q v_body q^-1, without building a matrix */
  function qRot(q, v) {
    var u = [q[1], q[2], q[3]];
    var t = mul(cross(u, v), 2);
    return add(add(v, mul(t, q[0])), cross(u, t));
  }
  /* Rotation vector (axis times angle, radians) to quaternion and back. Both
     stay finite at zero angle, because the camera filter evaluates them every
     frame and is at rest most of the time. */
  function qFromRotVec(rv) {
    var th = len(rv);
    if (th < 1e-9) return qNorm([1, rv[0] / 2, rv[1] / 2, rv[2] / 2]);
    var h = th / 2, s = Math.sin(h) / th;
    return [Math.cos(h), rv[0] * s, rv[1] * s, rv[2] * s];
  }
  function qToRotVec(q) {
    var s = Math.sqrt(q[1] * q[1] + q[2] * q[2] + q[3] * q[3]);
    if (s < 1e-9) return [2 * q[1], 2 * q[2], 2 * q[3]];
    var ang = 2 * Math.atan2(s, q[0]);
    return [q[1] / s * ang, q[2] / s * ang, q[3] / s * ang];
  }
  /* Angle between two orientations, radians, always the short way round. */
  function qAngle(a, b) {
    var d = Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]);
    return 2 * Math.acos(Math.max(-1, Math.min(1, d)));
  }

  /* ---- inertia ---------------------------------------------------------
     Specific moments (per unit mass) of a homogeneous box. Body axes are
     x = starboard, y = up, z = aft, so the hull length runs along z and the
     nose points at -z, which matches the three.js camera convention and saves
     a frame conversion at every single use site.

     Mass cancels out of this entire simulation. The sliders set accelerations,
     so a torque is alpha times I, and the collision impulse divides by mass
     again on the way out. Only the RATIOS of the three moments survive, and
     those depend on geometry alone. Hence no mass parameter anywhere.

     Those ratios are not decoration. A hull with two equal moments has no
     intermediate axis, and then the tumble this whole rig exists to judge
     simply never happens. 100 x 20 x 20 is exactly that degenerate case, which
     is why the default hull is 30 wide and not 20. */
  function inertiaBox(sx, sy, sz) {
    return [(sy * sy + sz * sz) / 12, (sx * sx + sz * sz) / 12, (sx * sx + sy * sy) / 12];
  }
  /* Index of the intermediate principal axis, the unstable one. Returns null
     when two moments coincide, i.e. when the hull is degenerate. */
  function intermediateAxis(I, tol) {
    var t = tol == null ? 1e-6 : tol;
    var o = [0, 1, 2].sort(function (a, b) { return I[a] - I[b]; });
    var lo = I[o[0]], mid = I[o[1]], hi = I[o[2]];
    if (mid - lo <= t * hi || hi - mid <= t * hi) return null;
    return o[1];
  }

  /* ---- inertia of an arbitrary closed mesh ------------------------------
     Once the hull stops being a box, inertiaBox is not an approximation worth
     making: a flat arrowhead rolls easily and yaws like a barn door, and those
     ratios are the entire feel of the thing. So integrate over the real mesh.

     Every triangle spans a tetrahedron with the origin. In barycentric
     coordinates the integral of lambda_i lambda_j over a tet is V (1 + d_ij)/20,
     which gives, for a tet with one vertex at the origin and the others a b c,
       C = (V/20) [ s s^T + a a^T + b b^T + c c^T ],   s = a + b + c,
     with V the SIGNED volume det(a,b,c)/6. Summed over a closed surface the
     outside cancels and only the enclosed solid survives, concave parts
     included. Winding does not have to be known: if the total volume comes out
     negative the whole sum is negated, which is the same thing as flipping
     every face.

     Returned moments are specific (per unit mass), like everywhere else here. */
  function meshInertia(verts, faces) {
    var i, k, vol = 0, cen = [0, 0, 0];
    for (i = 0; i < faces.length; i++) {
      var f = faces[i], a = verts[f[0]], b = verts[f[1]], c = verts[f[2]];
      var v = dot(a, cross(b, c)) / 6;
      vol += v;
      cen = add(cen, mul([a[0] + b[0] + c[0], a[1] + b[1] + c[1], a[2] + b[2] + c[2]], v / 4));
    }
    if (Math.abs(vol) < 1e-12) return null;
    cen = mul(cen, 1 / vol);

    /* Second pass about the centre of mass, so no parallel-axis correction can
       go wrong. Thrust has to act through this point, not through the middle
       of the bounding box, and on an arrowhead those are far apart. */
    var sh = [], C = [0, 0, 0, 0, 0, 0];   /* xx yy zz xy xz yz */
    for (i = 0; i < verts.length; i++) sh.push(sub(verts[i], cen));
    vol = 0;
    for (i = 0; i < faces.length; i++) {
      var g = faces[i], A = sh[g[0]], B = sh[g[1]], D = sh[g[2]];
      var vv = dot(A, cross(B, D)) / 6;
      vol += vv;
      var s = [A[0] + B[0] + D[0], A[1] + B[1] + D[1], A[2] + B[2] + D[2]];
      var f20 = vv / 20;
      var acc = function (ii, jj, idx) {
        C[idx] += f20 * (s[ii] * s[jj] + A[ii] * A[jj] + B[ii] * B[jj] + D[ii] * D[jj]);
      };
      acc(0, 0, 0); acc(1, 1, 1); acc(2, 2, 2); acc(0, 1, 3); acc(0, 2, 4); acc(1, 2, 5);
    }
    if (vol < 0) { vol = -vol; for (k = 0; k < 6; k++) C[k] = -C[k]; }
    var tr = C[0] + C[1] + C[2];
    var J = [
      [(tr - C[0]) / vol, -C[3] / vol, -C[4] / vol],
      [-C[3] / vol, (tr - C[1]) / vol, -C[5] / vol],
      [-C[4] / vol, -C[5] / vol, (tr - C[2]) / vol]
    ];
    return { volume: vol, centroid: cen, tensor: J };
  }

  /* Jacobi eigenvalue sweep for a symmetric 3x3. Ten sweeps is far more than
     this ever needs and still nothing on a per-hull-change basis. */
  function jacobi3(min) {
    var a = [min[0].slice(), min[1].slice(), min[2].slice()];
    var v = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
    for (var sweep = 0; sweep < 24; sweep++) {
      var p = 0, q = 1, best = Math.abs(a[0][1]);
      if (Math.abs(a[0][2]) > best) { p = 0; q = 2; best = Math.abs(a[0][2]); }
      if (Math.abs(a[1][2]) > best) { p = 1; q = 2; best = Math.abs(a[1][2]); }
      if (best < 1e-14) break;
      var theta = (a[q][q] - a[p][p]) / (2 * a[p][q]);
      var t = (theta >= 0 ? 1 : -1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
      var c = 1 / Math.sqrt(t * t + 1), s = t * c;
      for (var k = 0; k < 3; k++) {
        var akp = a[k][p], akq = a[k][q];
        a[k][p] = c * akp - s * akq;
        a[k][q] = s * akp + c * akq;
      }
      for (k = 0; k < 3; k++) {
        var apk = a[p][k], aqk = a[q][k];
        a[p][k] = c * apk - s * aqk;
        a[q][k] = s * apk + c * aqk;
        var vkp = v[k][p], vkq = v[k][q];
        v[k][p] = c * vkp - s * vkq;
        v[k][q] = s * vkp + c * vkq;
      }
    }
    return { values: [a[0][0], a[1][1], a[2][2]], vectors: v };
  }

  /* Recentre a hull on its centre of mass and rotate it into its principal
     axes, so the dynamics can keep the diagonal Euler equations. Eigenvectors
     are matched to the hull axis each is most aligned with, so "pitch, yaw,
     roll" keeps meaning what it says, and the frame is forced right-handed. */
  function principalize(verts, faces) {
    var mi = meshInertia(verts, faces);
    if (!mi) return null;
    var e = jacobi3(mi.tensor);
    var col = function (j) { return [e.vectors[0][j], e.vectors[1][j], e.vectors[2][j]]; };
    var order = [0, 1, 2], used = [false, false, false], axis, j, k;
    for (axis = 0; axis < 3; axis++) {
      var bestJ = -1, bestV = -1;
      for (j = 0; j < 3; j++) {
        if (used[j]) continue;
        var m = Math.abs(col(j)[axis]);
        if (m > bestV) { bestV = m; bestJ = j; }
      }
      used[bestJ] = true; order[axis] = bestJ;
    }
    var A = [col(order[0]), col(order[1]), col(order[2])];   /* rows: principal axes in hull coords */
    for (k = 0; k < 3; k++) if (A[k][k] < 0) A[k] = mul(A[k], -1);
    if (dot(A[0], cross(A[1], A[2])) < 0) A[2] = mul(A[2], -1);

    var out = [];
    for (k = 0; k < verts.length; k++) {
      var d = sub(verts[k], mi.centroid);
      out.push([dot(A[0], d), dot(A[1], d), dot(A[2], d)]);
    }
    var I = [e.values[order[0]], e.values[order[1]], e.values[order[2]]];
    /* How far the principal frame is turned away from the drawn hull axes.
       Small for a symmetric ship, never exactly zero, and worth showing. */
    var tilt = Math.acos(Math.max(-1, Math.min(1, (A[0][0] + A[1][1] + A[2][2] - 1) / 2)));
    return { verts: out, I: I, volume: mi.volume, centroid: mi.centroid, tilt: tilt };
  }

  /* ---- hulls -----------------------------------------------------------
     A Cobra-style arrowhead, lofted from diamond cross-sections along z: nose
     point, five rings, tail cap. Not the original Elite vertex table, which is
     28 hand-placed points and not something to reproduce from memory, but the
     same silhouette and the same faceted read.

     Stations are [z, halfWidth, yTop, yBottom] in fractions of length, width
     and height, so the three hull sliders scale it without reshaping it. All
     four use the SAME convention, half-extents, so 0.5 is the outer surface;
     an early draft had the y values on a tenth of that scale and produced a
     sheet of paper with a cockpit painted on it.

     Top and bottom are deliberately not mirror images. yTop spikes at the
     second station and falls away, which is the cockpit; yBottom is constant
     from the third station back, which is the flat belly. A hull that is
     symmetric about its waterline looks like a rocket, not like a ship, and it
     also robs the pilot of the one cue that says which way up he is. */
  var COBRA_STATIONS = [
    [-0.330, 0.060, 0.140, -0.090],
    [-0.130, 0.170, 0.500, -0.160],
    [0.070, 0.310, 0.360, -0.180],
    [0.290, 0.430, 0.230, -0.180],
    [0.500, 0.500, 0.170, -0.180]
  ];
  /* The cross section is a pentagon, not a diamond: a diamond has a single
     bottom vertex and therefore always a V-shaped keel, so a flat belly is
     impossible however the numbers are chosen. Two bottom corners at
     COBRA_KEEL of the half width give a flat sole, and the widest point sits
     low, at COBRA_CHINE of the way up, so the visible bulk is underneath and
     the cockpit reads as something sitting on top of it. */
  var COBRA_KEEL = 0.72;
  var COBRA_CHINE = 0.3;
  var COBRA_NOSE_Y = -0.05;

  function hullCobra(L, W, H) {
    var N = 5;
    var verts = [[0, COBRA_NOSE_Y * H, -0.5 * L]], edges = [], faces = [], rings = [], i, k;
    for (i = 0; i < COBRA_STATIONS.length; i++) {
      var st = COBRA_STATIONS[i], z = st[0] * L, hw = st[1] * W;
      var yt = st[2] * H, yb = st[3] * H;
      var ym = yb + (yt - yb) * COBRA_CHINE, kw = hw * COBRA_KEEL;
      var base = verts.length;
      verts.push([0, yt, z], [hw, ym, z], [kw, yb, z], [-kw, yb, z], [-hw, ym, z]);
      rings.push([base, base + 1, base + 2, base + 3, base + 4]);
    }
    var last = rings[rings.length - 1];
    var lastSt = COBRA_STATIONS[COBRA_STATIONS.length - 1];
    var tail = verts.length;
    verts.push([0, (lastSt[2] + lastSt[3]) / 2 * H, 0.5 * L]);

    for (k = 0; k < N; k++) {
      var k1 = (k + 1) % N;
      faces.push([0, rings[0][k], rings[0][k1]]);
      edges.push([0, rings[0][k]]);
      faces.push([tail, last[k1], last[k]]);
      edges.push([tail, last[k]]);
    }
    for (i = 0; i < rings.length; i++) {
      for (k = 0; k < N; k++) {
        var n = (k + 1) % N;
        edges.push([rings[i][k], rings[i][n]]);
        if (i + 1 < rings.length) {
          faces.push([rings[i][k], rings[i + 1][k], rings[i + 1][n]]);
          faces.push([rings[i][k], rings[i + 1][n], rings[i][n]]);
          edges.push([rings[i][k], rings[i + 1][k]]);
        }
      }
    }
    return { verts: verts, edges: edges, faces: faces };
  }

  function hullBox(L, W, H) {
    var verts = corners([W / 2, H / 2, L / 2]);
    var edges = [], faces = [], i, j;
    for (i = 0; i < 8; i++) {
      for (j = i + 1; j < 8; j++) {
        var d = (i ^ j);
        if (d === 1 || d === 2 || d === 4) edges.push([i, j]);
      }
    }
    /* Corner index bits are x, y, z, so a face is the four corners sharing one
       bit value. Winding is irrelevant: meshInertia fixes the sign itself. */
    var quads = [[0, 2, 6, 4], [1, 5, 7, 3], [0, 4, 5, 1], [2, 3, 7, 6], [0, 1, 3, 2], [4, 6, 7, 5]];
    for (i = 0; i < quads.length; i++) {
      faces.push([quads[i][0], quads[i][1], quads[i][2]]);
      faces.push([quads[i][0], quads[i][2], quads[i][3]]);
    }
    return { verts: verts, edges: edges, faces: faces };
  }

  /* Signed volume of a closed triangle mesh. Origin-independent, so its sign is
     purely a statement about winding. */
  function signedVolume(verts, faces) {
    var v = 0;
    for (var i = 0; i < faces.length; i++) {
      var f = faces[i];
      v += dot(verts[f[0]], cross(verts[f[1]], verts[f[2]])) / 6;
    }
    return v;
  }

  /* Which faces meet at each drawn edge. Every edge of a closed surface has
     exactly two, so this is the cheap closedness check the tests use, and
     closedness is precisely what meshInertia needs: the divergence-theorem sum
     over an open surface is meaningless, and it fails silently rather than
     loudly, by returning a plausible wrong number.

     It was originally the input to a backface hidden-line pass. That got
     dropped: backface culling only removes hidden lines exactly on a CONVEX
     hull, and the Cobra is not convex by a wide margin, so it left stray edges
     on screen. The renderer now uses the depth buffer instead. */
  function edgeFaces(edges, faces) {
    var m = {}, i, k;
    var key = function (a, b) { return a < b ? a + '_' + b : b + '_' + a; };
    for (i = 0; i < faces.length; i++) {
      for (k = 0; k < 3; k++) {
        var kk = key(faces[i][k], faces[i][(k + 1) % 3]);
        (m[kk] || (m[kk] = [])).push(i);
      }
    }
    var out = [];
    for (i = 0; i < edges.length; i++) out.push(m[key(edges[i][0], edges[i][1])] || []);
    return out;
  }

  /* The one call the app makes: geometry plus the principal-axis moments that
     the dynamics needs, in one consistent frame, with the faces guaranteed
     wound OUTWARD. The two hull builders happen to disagree about winding, and
     rather than hand-fixing vertex orders that are easy to get wrong and hard
     to see, the enclosed volume settles it: negative means inside out. */
  function buildHull(kind, L, W, H) {
    var h = kind === 'box' ? hullBox(L, W, H) : hullCobra(L, W, H);
    var faces = h.faces;
    if (signedVolume(h.verts, faces) < 0) {
      faces = faces.map(function (f) { return [f[0], f[2], f[1]]; });
    }
    var pr = principalize(h.verts, faces);
    return {
      kind: kind, verts: pr.verts, edges: h.edges, faces: faces,
      adj: edgeFaces(h.edges, faces),
      I: pr.I, volume: pr.volume, centroid: pr.centroid, tilt: pr.tilt
    };
  }

  /* ---- rigid-body dynamics ---------------------------------------------
     State: { p, v (world), q (body to world), w (body-frame angular rate) }.
     a is the specific force in BODY axes, T the specific torque in body axes.

     The rotation runs on Euler's equation in the body frame,
       I dw/dt = T - w x (I w),
     and it is that cross product, not the pilot, that makes a free hull
     tumble. Integrating it sloppily either kills the instability or blows it
     up, so this is RK4 with a renormalized quaternion and not the obvious
     forward Euler step. */
  function deriv(s, a, T, I) {
    var wx = s.w[0], wy = s.w[1], wz = s.w[2];
    var q = s.q;
    return {
      p: s.v,
      v: qRot(q, a),
      q: [
        0.5 * (-q[1] * wx - q[2] * wy - q[3] * wz),
        0.5 * (q[0] * wx + q[2] * wz - q[3] * wy),
        0.5 * (q[0] * wy - q[1] * wz + q[3] * wx),
        0.5 * (q[0] * wz + q[1] * wy - q[2] * wx)
      ],
      w: [
        (T[0] - (I[2] - I[1]) * wy * wz) / I[0],
        (T[1] - (I[0] - I[2]) * wz * wx) / I[1],
        (T[2] - (I[1] - I[0]) * wx * wy) / I[2]
      ]
    };
  }
  function axpy(s, d, h) {
    return {
      p: [s.p[0] + d.p[0] * h, s.p[1] + d.p[1] * h, s.p[2] + d.p[2] * h],
      v: [s.v[0] + d.v[0] * h, s.v[1] + d.v[1] * h, s.v[2] + d.v[2] * h],
      q: [s.q[0] + d.q[0] * h, s.q[1] + d.q[1] * h, s.q[2] + d.q[2] * h, s.q[3] + d.q[3] * h],
      w: [s.w[0] + d.w[0] * h, s.w[1] + d.w[1] * h, s.w[2] + d.w[2] * h]
    };
  }
  function rk4(s, a, T, I, dt) {
    var k1 = deriv(s, a, T, I);
    var k2 = deriv(axpy(s, k1, dt / 2), a, T, I);
    var k3 = deriv(axpy(s, k2, dt / 2), a, T, I);
    var k4 = deriv(axpy(s, k3, dt), a, T, I);
    var out = { p: [0, 0, 0], v: [0, 0, 0], q: [0, 0, 0, 0], w: [0, 0, 0] };
    var i;
    for (i = 0; i < 3; i++) {
      out.p[i] = s.p[i] + dt / 6 * (k1.p[i] + 2 * k2.p[i] + 2 * k3.p[i] + k4.p[i]);
      out.v[i] = s.v[i] + dt / 6 * (k1.v[i] + 2 * k2.v[i] + 2 * k3.v[i] + k4.v[i]);
      out.w[i] = s.w[i] + dt / 6 * (k1.w[i] + 2 * k2.w[i] + 2 * k3.w[i] + k4.w[i]);
    }
    for (i = 0; i < 4; i++) {
      out.q[i] = s.q[i] + dt / 6 * (k1.q[i] + 2 * k2.q[i] + 2 * k3.q[i] + k4.q[i]);
    }
    out.q = qNorm(out.q);
    return out;
  }

  /* Angular momentum in the WORLD frame. Under zero torque it is conserved
     exactly, in direction as well as magnitude, while the body-frame rate w
     wanders. Drawing both is the whole visual proof that a tumbling hull is
     doing real physics and not integrator noise, and the drift of this vector
     is what the HUD reports as an honest quality number for the integrator. */
  function angMom(s, I) {
    return qRot(s.q, [I[0] * s.w[0], I[1] * s.w[1], I[2] * s.w[2]]);
  }
  function kinRot(s, I) {
    return 0.5 * (I[0] * s.w[0] * s.w[0] + I[1] * s.w[1] * s.w[1] + I[2] * s.w[2] * s.w[2]);
  }

  /* ---- what the cap commands -------------------------------------------
     cmd holds the six shaped axes, each -1..1, already translated into SHIP
     terms: fwd (+ is towards the nose, -z), right (+x), up (+y), and the three
     body rotations pitch (+x), yaw (+y), roll (+z). All six are RCS, including
     fwd: the cap is the manoeuvring system and nothing else.

     cmd.main, 0..1, is the main engine, and it is a seventh channel rather
     than a scale on fwd because it is a different piece of hardware with two
     orders of magnitude more thrust and only one direction. Sharing an axis
     with the RCS would mean the cap could never be nudged forward gently, and
     the whole reason a real ship has both is that those are different jobs.

     Torque comes out as alpha times I, so the sliders stay in accelerations
     and the hull geometry decides how much torque that actually is. Change the
     hull and the rotations keep the feel the sliders promise. */
  function wrench(cmd, p) {
    var main = Math.max(0, Math.min(1, cmd.main || 0));
    var a = [cmd.right * p.aLat, cmd.up * p.aLat, -(cmd.fwd * p.aLat + main * p.aFwd)];
    var T = [cmd.pitch * p.aPitch * p.I[0], cmd.yaw * p.aYaw * p.I[1], cmd.roll * p.aRoll * p.I[2]];
    return { a: a, T: T };
  }

  /* Rate damping, the switchable assist. Proportional pull towards zero rate,
     saturated at exactly the authority the pilot has, and skipped on any axis
     the pilot is currently commanding so it never fights an input. force=true
     is the one-shot "kill rotation" burst, which ignores that courtesy. */
  function dampTorque(w, cmd, p, gain, force) {
    var alpha = [p.aPitch, p.aYaw, p.aRoll];
    var inp = [cmd.pitch, cmd.yaw, cmd.roll];
    var g = gain == null ? 2.5 : gain;
    var T = [0, 0, 0];
    for (var i = 0; i < 3; i++) {
      if (!force && Math.abs(inp[i]) > 1e-3) continue;
      T[i] = Math.max(-alpha[i], Math.min(alpha[i], -g * w[i])) * p.I[i];
    }
    return T;
  }

  /* ---- arena ----------------------------------------------------------- */
  function corners(half) {
    var out = [];
    for (var i = 0; i < 8; i++) {
      out.push([(i & 1 ? 1 : -1) * half[0], (i & 2 ? 1 : -1) * half[1], (i & 4 ? 1 : -1) * half[2]]);
    }
    return out;
  }
  /* ---- contacts ---------------------------------------------------------
     Finding contacts and resolving them used to be one function. They are
     separated because the corridor collides against rocks as well as walls
     while the solver below is worth keeping exactly as it is: a contact is a
     world-frame normal n (pointing the way the hull has to move), the lever
     arm r from the centre of mass, a penetration depth, a grouping key for the
     positional correction, and optionally the surface velocity vs of whatever
     is being hit. Everything downstream sees only that record. */

  /* Hull points against the six walls of an axis-aligned box. half is three
     half-extents, or a single number for the cube case, because the arena is a
     cube and the corridor is long in z. pts are body-frame contact points,
     which for a mesh hull is simply its vertex list.

     The grouping key is the AXIS, not the wall: a hull long enough to touch
     two opposite walls at once must be pushed out of the deeper one only, and
     pushing it out of both would cancel to a fraction of either. */
  function contactsBox(s, pts, half) {
    var h = typeof half === 'number' ? [half, half, half] : half;
    var out = [], i, ax;
    for (i = 0; i < pts.length; i++) {
      var r = qRot(s.q, pts[i]);
      var wp = [s.p[0] + r[0], s.p[1] + r[1], s.p[2] + r[2]];
      for (ax = 0; ax < 3; ax++) {
        var n = [0, 0, 0];
        if (wp[ax] > h[ax]) {
          n[ax] = -1;
          out.push({ n: n, r: r, pen: wp[ax] - h[ax], key: 'b' + ax, ax: ax, sgn: -1 });
        } else if (wp[ax] < -h[ax]) {
          n[ax] = 1;
          out.push({ n: n, r: r, pen: -h[ax] - wp[ax], key: 'b' + ax, ax: ax, sgn: 1 });
        }
      }
    }
    return out;
  }

  /* Hull points against a list of rocks. A rock is
       { p, q, w, r, contact(pLocal) -> { pen, n } | null }
     with p its centre, q its orientation (rock body to world), w its angular
     velocity in WORLD axes, r a bounding radius for the cheap reject, and
     contact a point query in its own body frame. That last one is a function
     rather than a radius map so this module stays independent of asteroid.js:
     the geometry knows how to answer, the dynamics only asks.

     A rock is infinitely heavy and takes up no impulse, but it is a MOVING
     wall: the contact velocity is relative, so w x rel enters as the surface
     velocity. Without that term a spinning rock does not shove the ship along,
     it holds it in place, and that looks wrong without being nameable. */
  function contactsRocks(s, pts, rocks) {
    var out = [], i, k;
    for (k = 0; k < rocks.length; k++) {
      var rock = rocks[k], qc = qConj(rock.q);
      for (i = 0; i < pts.length; i++) {
        var r = qRot(s.q, pts[i]);
        var rel = [s.p[0] + r[0] - rock.p[0], s.p[1] + r[1] - rock.p[1], s.p[2] + r[2] - rock.p[2]];
        if (rock.r != null && dot(rel, rel) > rock.r * rock.r) continue;
        var c = rock.contact(qRot(qc, rel));
        if (!c || !(c.pen > 0)) continue;
        out.push({
          n: qRot(rock.q, c.n), r: r, pen: c.pen, key: 'r' + k,
          vs: rock.w ? cross(rock.w, rel) : null, rock: k
        });
      }
    }
    return out;
  }

  /* Resolve a contact list. Pure: returns a new state and the hardest impact
     speed, so the caller can flash the wall and count the hit.

     A grazing corner produces an off-centre impulse and therefore TORQUE: one
     careless touch leaves the hull tumbling. That is the entire reason for
     doing this properly instead of clamping the position, and it is the
     mechanic the asteroid corridor inherits unchanged. */
  function resolve(s, contacts, I, e) {
    if (!contacts.length) return null;
    var i, ax;
    var out = { p: s.p.slice(), v: s.v.slice(), q: s.q.slice(), w: s.w.slice() };

    /* Positional correction first, deepest penetration per group, so the
       impulse pass below is not arguing with a hull that is still inside a
       wall. */
    var byKey = {}, kk;
    for (i = 0; i < contacts.length; i++) {
      var c0 = contacts[i], prev = byKey[c0.key];
      if (!prev || c0.pen > prev.pen) byKey[c0.key] = c0;
    }
    for (kk in byKey) {
      var b = byKey[kk];
      for (ax = 0; ax < 3; ax++) out.p[ax] += b.n[ax] * b.pen;
    }

    /* A proper sequential-impulse solver, not one pass of "give every contact
       the full restitution impulse". Landing flat puts four corners on the wall
       at once, and one pass hands each of them the whole bounce, so the hull
       leaves at several times the speed it arrived and picks up a spin out of
       nowhere. Accumulating a clamped impulse per contact and sweeping a few
       times is the standard fix and converges to the right answer: a square-on
       hit bounces at e times the approach speed with no rotation at all, while
       a corner graze still gets its torque, which is the interesting case.

       Restitution is taken from the approach speed measured BEFORE any impulse
       and only above a threshold, so a hull drifting against a wall settles
       instead of buzzing. */
    var impact = 0, deepest = contacts[0], cs2 = [];
    var qc = qConj(out.q);
    var wWorld = qRot(out.q, out.w);
    for (i = 0; i < contacts.length; i++) {
      var c = contacts[i];
      if (c.pen > deepest.pen) deepest = c;
      var n = c.n;
      var vp = add(out.v, cross(wWorld, c.r));
      if (c.vs) vp = sub(vp, c.vs);
      var vn0 = dot(vp, n);
      if (vn0 >= 0) continue;
      if (-vn0 > impact) impact = -vn0;
      var rb = qRot(qc, c.r), nb = qRot(qc, n);
      var rxn = cross(rb, nb);
      var iRxn = [rxn[0] / I[0], rxn[1] / I[1], rxn[2] / I[2]];
      cs2.push({
        n: n, r: c.r, rb: rb, nb: nb, acc: 0, vs: c.vs || null,
        k: 1 + dot(nb, cross(iRxn, rb)),
        /* Solving vn + bias = 0 with bias = e vn0 leaves the contact at
           vn = -e vn0, i.e. leaving the wall at e times the approach speed.
           The opposite sign solves for a velocity INTO the wall, which looks
           like a hull that sticks and then sinks. */
        bias: vn0 < -0.05 ? e * vn0 : 0
      });
    }
    for (var it = 0; it < 24; it++) {
      for (i = 0; i < cs2.length; i++) {
        var g = cs2[i];
        var vv = add(out.v, cross(qRot(out.q, out.w), g.r));
        if (g.vs) vv = sub(vv, g.vs);
        var vn = dot(vv, g.n);
        var d = -(vn + g.bias) / g.k;
        var na = Math.max(0, g.acc + d);
        d = na - g.acc;
        g.acc = na;
        if (d === 0) continue;
        out.v = add(out.v, mul(g.n, d));
        var dwb = cross(g.rb, mul(g.nb, d));
        out.w = [out.w[0] + dwb[0] / I[0], out.w[1] + dwb[1] / I[1], out.w[2] + dwb[2] / I[2]];
      }
    }
    return { state: out, impact: impact, contact: deepest, axis: deepest.ax, sgn: deepest.sgn };
  }

  /* The arena case, unchanged from the outside: a cube of half-size R. */
  function collide(s, pts, R, I, e) {
    return resolve(s, contactsBox(s, pts, R), I, e);
  }

  /* ---- readouts --------------------------------------------------------
     Bang-bang: accelerate over half the distance, decelerate over the other
     half, so D/2 = a t1^2 / 2, t1 = sqrt(D/a) and the total is 2 sqrt(D/a).
     Same shape for a rotation with theta and alpha. These are the numbers the
     sliders should be judged by. Newtons tell a pilot nothing; the ratio of
     "time to turn round" to "time to cross the box" tells him everything. */
  function bangBang(dist, accel) {
    if (!(accel > 0) || !(dist > 0)) return Infinity;
    return 2 * Math.sqrt(dist / accel);
  }

  /* ---- camera filter ---------------------------------------------------
     A second-order Butterworth tracker on SO(3), not a chain of scalar
     sections on Euler angles: those axes are not independent and such a filter
     would be wrong exactly where it matters. The error rotation vector is
     taken in the CAMERA frame, its roll component (z, the view axis) scaled
     down, and the result driven by a spring-damper with k = wn^2, c = 2 zeta wn.

     zeta = 1/sqrt(2) is Butterworth: maximally flat, about 4.3 percent
     overshoot, which reads as camera weight rather than as an error. zeta = 1
     is critically damped and does not overshoot at all. It stays a slider
     because taste decides this, not theory.

     Filter order is the smaller lever here. A tumble at 0.2 to 1 Hz and a
     deliberate turn at 0.1 to 0.5 Hz overlap in frequency, so no linear filter
     of any order separates them and a steeper skirt only moves the compromise.
     rollFollow does the real work, because roll about the view axis is what
     causes nausea and is the least informative motion on offer. */
  function camStep(cam, qShip, dt, f0, zeta, rollFollow) {
    var qe = qMul(qConj(cam.q), qShip);
    if (qe[0] < 0) qe = [-qe[0], -qe[1], -qe[2], -qe[3]];   /* shortest arc */
    var e = qToRotVec(qe);
    e[2] *= rollFollow;
    var wn = 2 * Math.PI * f0;
    var k = wn * wn, c = 2 * zeta * wn;
    var w = [
      cam.w[0] + (k * e[0] - c * cam.w[0]) * dt,
      cam.w[1] + (k * e[1] - c * cam.w[1]) * dt,
      cam.w[2] + (k * e[2] - c * cam.w[2]) * dt
    ];
    return { q: qNorm(qMul(cam.q, qFromRotVec(mul(w, dt)))), w: w };
  }

  /* ---- drifting dust ---------------------------------------------------
     Where a point of a repeating lattice sits relative to a centre, folded
     into the one cell that surrounds that centre. This is what keeps motes
     near the ship wherever the ship happens to be, instead of scattering a
     fixed set through a two kilometre box and leaving the pilot in an empty
     patch of it.

     It exists because speed is not visible in an empty room. Optic flow, the
     angular rate at which texture crosses the eye, is v divided by the
     distance to whatever is being looked at, so a wall a kilometre away moves
     forty times more slowly than a mote twenty five metres away at the very
     same speed. Adding close-up clutter does not decorate the problem, it
     supplies the only channel that carries the quantity at all. */
  function wrapRel(b, c, S) {
    var d = b - c;
    return d - S * Math.floor(d / S + 0.5);
  }

  /* ---- deterministic arena furniture ----------------------------------- */
  function rng(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  /* A target well inside the box and at least minDist from where the ship is,
     so a new one never spawns in the pilot's lap. */
  function pickTarget(rand, R, from, minDist) {
    var margin = R * 0.8;
    for (var i = 0; i < 64; i++) {
      var p = [(rand() * 2 - 1) * margin, (rand() * 2 - 1) * margin, (rand() * 2 - 1) * margin];
      if (!from || len(sub(p, from)) >= minDist) return p;
    }
    return [margin, 0, 0];
  }

  /* ---- the config, which is the actual product --------------------------
     This page is the hangar, not the game: you learn the cap here, tune the
     thrust and the camera until they feel like yours, and take the result
     with you. So the settings are a document with a version on it, and
     reading one back is a defensive operation rather than Object.assign.

     Only keys the defaults already know are taken, and only with the type the
     default has. A hand-edited file that puts a string where a number belongs
     would otherwise reach the integrator, and NaN in the state is permanent:
     every later step multiplies it forward and the ship never comes back. */
  var CONFIG_VERSION = 1;
  var CONFIG_TOOL = 'cobra-6dof';
  var DEV_AXES = ['tx', 'ty', 'tz', 'rx', 'ry', 'rz'];
  var CONFIG_ENUMS = {
    hull: ['cobra', 'box'], camMode: ['corner', 'chase'], hudPage: ['flight', 'input']
  };

  function mergeConfig(defs, obj, enums) {
    var out = {}, k;
    for (k in defs) out[k] = defs[k];
    if (!obj || typeof obj !== 'object') return out;
    for (k in defs) {
      if (!Object.prototype.hasOwnProperty.call(obj, k)) continue;
      var v = obj[k], d = defs[k];
      if (typeof d === 'number') { if (typeof v === 'number' && isFinite(v)) out[k] = v; }
      else if (typeof d === 'boolean') { if (typeof v === 'boolean') out[k] = v; }
      else if (typeof d === 'string' && typeof v === 'string') {
        var allow = enums && enums[k];
        if (!allow || allow.indexOf(v) >= 0) out[k] = v;
      }
    }
    return out;
  }

  function packConfig(parts) {
    return {
      tool: CONFIG_TOOL, version: CONFIG_VERSION,
      params: parts.p, invert: parts.inv, axes: parts.map, bias: parts.bias || {}
    };
  }

  /* Null for anything that is not a config for this tool, so the caller can
     say so instead of silently loading half of one. */
  function readConfig(raw, defs) {
    var o = raw;
    if (typeof raw === 'string') {
      try { o = JSON.parse(raw); } catch (e) { return null; }
    }
    if (!o || typeof o !== 'object') return null;
    if (o.tool != null && o.tool !== CONFIG_TOOL) return null;
    var map = mergeConfig(defs.map, o.axes, { });
    for (var k in map) {
      if (DEV_AXES.indexOf(map[k]) < 0) map[k] = defs.map[k];
    }
    return {
      p: mergeConfig(defs.p, o.params, CONFIG_ENUMS),
      inv: mergeConfig(defs.inv, o.invert),
      map: map,
      bias: mergeConfig(defs.bias, o.bias)
    };
  }

  return {
    add: add, sub: sub, mul: mul, dot: dot, cross: cross, len: len,
    DEV_AXES: DEV_AXES, CONFIG_VERSION: CONFIG_VERSION, CONFIG_TOOL: CONFIG_TOOL,
    mergeConfig: mergeConfig, packConfig: packConfig, readConfig: readConfig,
    qMul: qMul, qConj: qConj, qNorm: qNorm, qRot: qRot,
    qFromRotVec: qFromRotVec, qToRotVec: qToRotVec, qAngle: qAngle,
    inertiaBox: inertiaBox, intermediateAxis: intermediateAxis,
    meshInertia: meshInertia, jacobi3: jacobi3, principalize: principalize,
    hullBox: hullBox, hullCobra: hullCobra, buildHull: buildHull,
    signedVolume: signedVolume, edgeFaces: edgeFaces,
    deriv: deriv, rk4: rk4, angMom: angMom, kinRot: kinRot,
    wrench: wrench, dampTorque: dampTorque,
    corners: corners, collide: collide,
    contactsBox: contactsBox, contactsRocks: contactsRocks, resolve: resolve,
    bangBang: bangBang, camStep: camStep, wrapRel: wrapRel,
    rng: rng, pickTarget: pickTarget
  };
})();
if (typeof globalThis !== 'undefined') globalThis.SixDOF = SixDOF;
