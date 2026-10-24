/* courier.js -- the player craft of Hikyaku, a compact courier glider.
 *
 * Ported from the concept phase (2026-10, notes/tools/hikyaku/concepts/lib/
 * shipgen.js, buildCourier). Of the four candidates there only the courier
 * survived; the drone, the hoverbike and the VTOL were rejected and are not
 * carried over.
 *
 * Frame, the same as sixdof.js: x = starboard, y = up, z = aft, nose at -z,
 * origin at the volume centroid of the collision hull. Centring on the hull
 * and not on the bounding box matters because a full roll has to pivot where
 * the dynamics thinks the centre of mass is, and on a wedge those two points
 * are visibly apart.
 *
 * Two layers, so the part the physics needs can be tested under Node:
 *
 *   - Pure layer, no three.js, no DOM: the 18 collision points, convexHull,
 *     hullCentroid, hullEdges and geometry(opts). geometry() is everything the
 *     dynamics and the drag model need (points, closed outward-wound hull,
 *     volume, extents) and is what notes/dev/courier.test.mjs checks.
 *   - Visual layer: build(THREE, opts) and collisionOverlay(ship, THREE, opts).
 *     THREE is a parameter, never an import, because the tools load three.js
 *     through an importmap module and everything shared here is a classic
 *     script. The only other globals the visual layer touches are
 *     ColorRamps (assets/js/colorramps.js, for the bone ramp) and document
 *     (one canvas per glow texture).
 *
 * The collision points are hand-picked extremities, deliberately few and
 * separate from the visual mesh. Their convex hull goes straight into
 * SixDOF.principalize for the inertia, and its triangles are the faces the
 * drag area A(v) sums over.
 *
 * Palette: bone ramp for all solid parts, ONE neon accent (ACCENT) for
 * thrusters, edge strips and lights, pale white for the headlights. Glow is
 * additive sprites and cones, no bloom.
 *
 * Everything hangs on globalThis.Courier.
 */
(function () {
  'use strict';

  const ACCENT = 0x2ee8ff;
  const NATURAL_LENGTH = 15;

  /* ---- collision points ------------------------------------------------
     In the drawing frame, before centring. Each one is an extremity of a
     visible part, so the hull hugs the silhouette the pilot sees: hitting a
     wall with a fan duct that visibly clears it would feel like a cheat. */
  const POINTS = [
    [0, -0.25, -7.55],                                // nose
    [4.2, 0.1, -4.5], [-4.2, 0.1, -4.5],              // front fans, outer
    [3.15, 0.1, -5.6], [-3.15, 0.1, -5.6],            // front fans, forward
    [4.2, 0.1, 4.4], [-4.2, 0.1, 4.4],                // rear fans, outer
    [3.15, -0.05, 5.5], [-3.15, -0.05, 5.5],          // rear fans, aft
    [0, 1.70, 0.4],                                   // roof blade
    [1.55, 1.45, 7.3], [-1.55, 1.45, 7.3],            // spoiler tips
    [1.7, -0.96, -3.5], [-1.7, -0.96, -3.5],          // belly front
    [1.7, -0.96, 4.5], [-1.7, -0.96, 4.5],            // belly rear
    [1.5, 0.15, 7.5], [-1.5, 0.15, 7.5]               // tail corners
  ];

  /* ---- small vector helpers ------------------------------------------- */
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function cross(a, b) {
    return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  }
  function len(a) { return Math.sqrt(dot(a, a)); }
  function scale(a, s) { return [a[0] * s, a[1] * s, a[2] * s]; }

  /* ---- convex hull -----------------------------------------------------
     Brute force over all triples, O(n^4), which is nothing for eighteen
     points and has no degenerate-start or horizon bookkeeping to get wrong.
     Coplanar points are gathered per supporting plane and reduced to their
     2D hull, so the symmetric design (four points on one plane, like the
     flat belly) gives one clean fan per plane instead of overlapping
     triangles. Overlapping triangles would still enclose the right volume
     but count the area twice, and the drag model sums area.

     Returns triangles wound counter-clockwise seen from outside, so the
     signed volume is positive, which is the sign SixDOF.signedVolume calls
     outward (meshInertia would also repair the opposite sign, but the drag
     model needs the normals pointing out). */
  function convexHull(pts) {
    const n = pts.length, faces = [], seen = new Set();
    let ext = 0;
    for (const p of pts) ext = Math.max(ext, len(p));
    const eps = 1e-5 * Math.max(1, ext);
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) for (let k = j + 1; k < n; k++) {
      let nn = cross(sub(pts[j], pts[i]), sub(pts[k], pts[i]));
      const nl = len(nn);
      if (nl < eps * eps * 10) continue;   /* collinear triple, no plane */
      nn = scale(nn, 1 / nl);
      const d = dot(nn, pts[i]);
      let pos = 0, neg = 0;
      const on = [];
      for (let m = 0; m < n; m++) {
        const s = dot(nn, pts[m]) - d;
        if (s > eps) pos++; else if (s < -eps) neg++; else on.push(m);
      }
      if (pos && neg) continue;            /* plane cuts the set, not a face */
      const N = pos ? scale(nn, -1) : nn;  /* outward: away from the other points */
      const key = on.join(',');            /* on is ascending by construction */
      if (seen.has(key)) continue;
      seen.add(key);
      /* 2D hull of the coplanar set, CCW about N (u x v = N) = outward winding */
      let u = sub(pts[on[1]], pts[on[0]]);
      u = scale(u, 1 / len(u));
      const v = cross(N, u);
      const P2 = on.map((m) => ({ m, x: dot(pts[m], u), y: dot(pts[m], v) }))
        .sort((a, b) => a.x - b.x || a.y - b.y);
      const cr = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
      const lo = [], hi = [];
      for (const p of P2) {
        while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 1e-9) lo.pop();
        lo.push(p);
      }
      for (let q = P2.length - 1; q >= 0; q--) {
        const p = P2[q];
        while (hi.length >= 2 && cr(hi[hi.length - 2], hi[hi.length - 1], p) <= 1e-9) hi.pop();
        hi.push(p);
      }
      const poly = lo.slice(0, -1).concat(hi.slice(0, -1)).map((p) => p.m);
      for (let q = 1; q + 1 < poly.length; q++) faces.push([poly[0], poly[q], poly[q + 1]]);
    }
    return faces;
  }

  /* Volume and volume centroid of a closed triangle mesh, by summing the
     signed tetrahedra against the origin. The same sum as the first pass of
     SixDOF.meshInertia, kept here so the pure layer needs no other module. */
  function hullCentroid(pts, faces) {
    let vol = 0;
    const c = [0, 0, 0];
    for (const f of faces) {
      const A = pts[f[0]], B = pts[f[1]], D = pts[f[2]];
      const v = dot(A, cross(B, D)) / 6;
      vol += v;
      for (let k = 0; k < 3; k++) c[k] += v * (A[k] + B[k] + D[k]) / 4;
    }
    return { volume: vol, centroid: c.map((x) => x / vol) };
  }

  /* Unique edges of a triangle list, for drawing the hull as lines and for
     SixDOF.edgeFaces. */
  function hullEdges(faces) {
    const s = new Set(), out = [];
    for (const f of faces) for (let k = 0; k < 3; k++) {
      const a = f[k], b = f[(k + 1) % 3], key = a < b ? a + '_' + b : b + '_' + a;
      if (!s.has(key)) { s.add(key); out.push([Math.min(a, b), Math.max(a, b)]); }
    }
    return out;
  }

  /* The physics half of the ship: scaled, hulled and recentred on the hull's
     volume centroid. opts.length rescales uniformly from the natural 15 m.

     The hull is computed BEFORE the shift. Translation does not change which
     points are on it, and the face indices stay valid, so the order only
     matters for float noise, and this is the order finish() used.

     length/width/height here are the extents of the collision points. The
     visual extents from build() differ by a few centimetres (duct lips, the
     marker lights), which is the honest difference between the two. */
  function geometry(opts) {
    opts = opts || {};
    const sc = opts.length ? opts.length / NATURAL_LENGTH : 1;
    let pts = POINTS.map((p) => scale(p, sc));
    const faces = convexHull(pts);
    const hc = hullCentroid(pts, faces);
    const c = hc.centroid;
    pts = pts.map((p) => sub(p, c));
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (const p of pts) for (let k = 0; k < 3; k++) {
      lo[k] = Math.min(lo[k], p[k]); hi[k] = Math.max(hi[k], p[k]);
    }
    return {
      collisionPoints: pts,
      collisionHull: { verts: pts, faces: faces },
      hullVolume: hc.volume,
      centroidShift: c,          /* what was subtracted, so build() can move the body */
      scale: sc,
      length: hi[2] - lo[2], width: hi[0] - lo[0], height: hi[1] - lo[1]
    };
  }

  /* =====================================================================
     Visual layer. Everything below takes THREE as a parameter.
     ===================================================================== */

  /* Bone ramp from colorramps.js, not a local copy: the table there is
     generated from matplotlib's segment data and is the one the city uses,
     so the ship and the city cannot drift apart. */
  function boneStops() {
    const CR = globalThis.ColorRamps;
    const r = CR && CR.rampById('bone');
    if (!r || r.id !== 'bone') {
      throw new Error('Courier.build needs ColorRamps: load /assets/js/colorramps.js before courier.js runs build()');
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

  /* Materials and the glow texture are created per build() call and held in
     a context object, not in a module-level cache. The concept cached them in
     module singletons, which is fine for a page that builds once, but a game
     that rebuilds the ship (hot reload, a length change, a second THREE in a
     test) would then share materials bound to a stale renderer or a different
     three.js. The cost is a dozen materials per build, which is nothing.
     ship.dispose() releases them.

     flatShading takes the normal from screen-space derivatives, so it faces
     the camera whatever the winding. With DoubleSide that makes every loft
     and lathe correct without ever checking which way its triangles turn. */
  function makeContext(THREE) {
    const stops = boneStops();
    const bone = (t) => boneColor(THREE, stops, t);
    const std = (t, rough, metal) => new THREE.MeshStandardMaterial({
      color: bone(t), roughness: rough === undefined ? 0.55 : rough, metalness: metal === undefined ? 0.25 : metal,
      flatShading: true, side: THREE.DoubleSide
    });
    const M = {
      hull: std(0.70),
      hull2: std(0.50),
      dark: std(0.18, 0.7, 0.3),
      carbon: std(0.36, 0.45, 0.4),
      glass: new THREE.MeshStandardMaterial({ color: bone(0.30), roughness: 0.18, metalness: 0.55, flatShading: true,
        side: THREE.DoubleSide, emissive: new THREE.Color(ACCENT).multiplyScalar(0.05) }),
      /* values above 1 with toneMapped off: the strips read as light sources,
         not as paint, without needing a bloom pass */
      neon: new THREE.MeshBasicMaterial({ color: new THREE.Color(ACCENT).multiplyScalar(1.6), toneMapped: false, side: THREE.DoubleSide }),
      white: new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 1, 1).multiplyScalar(1.6), toneMapped: false, side: THREE.DoubleSide }),
      blur: new THREE.MeshBasicMaterial({ color: bone(0.30), transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending,
        depthWrite: false, side: THREE.DoubleSide, toneMapped: false })
    };
    const ctx = { THREE: THREE, M: M, owned: [], glowTex: null };
    for (const k in M) ctx.owned.push(M[k]);
    return ctx;
  }

  /* ---- glow ------------------------------------------------------------ */
  function glowTex(ctx) {
    if (ctx.glowTex) return ctx.glowTex;
    const THREE = ctx.THREE;
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.18, 'rgba(255,255,255,0.55)');
    gr.addColorStop(0.5, 'rgba(255,255,255,0.12)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    ctx.glowTex = new THREE.CanvasTexture(c);
    ctx.glowTex.colorSpace = THREE.SRGBColorSpace;
    ctx.owned.push(ctx.glowTex);
    return ctx.glowTex;
  }
  /* FX objects are excluded from the bounds and can be hidden or animated by
     the game as a set. */
  function fx(o) { o.userData.fx = true; o.traverse((c) => { c.userData.fx = true; }); return o; }
  function glow(ctx, parent, pos, size, color, gain) {
    const THREE = ctx.THREE;
    const m = new THREE.SpriteMaterial({ map: glowTex(ctx), color: new THREE.Color(color).multiplyScalar(gain),
      blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false });
    ctx.owned.push(m);
    const s = new THREE.Sprite(m);
    s.position.set(pos[0], pos[1], pos[2]); s.scale.set(size, size, 1);
    parent.add(fx(s));
    return s;
  }
  /* Exhaust cone from pos along dir, bright at the outlet and fading to black
     (= invisible under additive blending) at the far end. The fade lives in
     vertex colours, so no texture and no shader, and scaling the mesh along
     its axis later stretches the fade with it. */
  function plume(ctx, parent, pos, dir, r, length, color, gain) {
    const THREE = ctx.THREE;
    const g = new THREE.CylinderGeometry(r, r * 0.25, length, 16, 4, true).translate(0, -length / 2, 0);
    const p = g.getAttribute('position'), col = [];
    const c = new THREE.Color(color).multiplyScalar(gain);
    for (let i = 0; i < p.count; i++) {
      const f = Math.pow(1 + p.getY(i) / length, 2.4);
      col.push(c.r * f, c.g * f, c.b * f);
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    const m = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending,
      depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
    ctx.owned.push(m);
    const ms = new THREE.Mesh(g, m);
    ms.position.set(pos[0], pos[1], pos[2]);
    /* the cone hangs down from its origin (local -y), so local -y is the
       exhaust direction and scale.y is the plume length */
    ms.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), new THREE.Vector3(dir[0], dir[1], dir[2]).normalize());
    parent.add(fx(ms));
    return ms;
  }

  /* ---- geometry builders --------------------------------------------- */
  /* Six-point cross section [hwTop, yTop, hw, yMid, hwBot, yBot] at z. Six
     points and not a smooth curve, because the faceted read is the look. */
  function sec(z, hwT, yT, hw, yM, hwB, yB) {
    return [[hwT, yT, z], [hw, yM, z], [hwB, yB, z], [-hwB, yB, z], [-hw, yM, z], [-hwT, yT, z]];
  }
  /* Loft through rings of equal length, both ends capped with a fan. */
  function loftGeo(THREE, rings) {
    const pos = [], idx = [], n = rings[0].length;
    for (const r of rings) for (const p of r) pos.push(p[0], p[1], p[2]);
    for (let i = 0; i + 1 < rings.length; i++) {
      for (let k = 0; k < n; k++) {
        const a = i * n + k, b = i * n + (k + 1) % n, c = (i + 1) * n + k, d = (i + 1) * n + (k + 1) % n;
        idx.push(a, c, d, a, d, b);
      }
    }
    for (const end of [[0, false], [rings.length - 1, true]]) {
      const ri = end[0], flip = end[1], r = rings[ri], cen = [0, 0, 0];
      for (const p of r) { cen[0] += p[0] / n; cen[1] += p[1] / n; cen[2] += p[2] / n; }
      const ci = pos.length / 3; pos.push(cen[0], cen[1], cen[2]);
      for (let k = 0; k < n; k++) {
        const a = ri * n + k, b = ri * n + (k + 1) % n;
        if (flip) idx.push(ci, a, b); else idx.push(ci, b, a);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }
  function mesh(ctx, parent, geo, mat, pos, rot) {
    const m = new ctx.THREE.Mesh(geo, mat);
    if (pos) m.position.set(pos[0], pos[1], pos[2]);
    if (rot) m.rotation.set(rot[0], rot[1], rot[2]);
    parent.add(m);
    return m;
  }
  function box(ctx, parent, mat, size, pos, rot) {
    return mesh(ctx, parent, new ctx.THREE.BoxGeometry(size[0], size[1], size[2]), mat, pos, rot);
  }
  /* Box of cross-section w x h stretched from a to b; up hints the h direction. */
  function beam(ctx, parent, mat, a, b, w, h) {
    const THREE = ctx.THREE;
    const A = new THREE.Vector3(a[0], a[1], a[2]), B = new THREE.Vector3(b[0], b[1], b[2]);
    const L = A.distanceTo(B);
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, L), mat);
    m.position.copy(A).add(B).multiplyScalar(0.5);
    m.up.set(0, 1, 0);
    m.lookAt(B);
    parent.add(m);
    return m;
  }
  /* Thin strip along a polyline (edge lights, chines). */
  function strip(ctx, parent, mat, pts, w, h) {
    for (let i = 0; i + 1 < pts.length; i++) beam(ctx, parent, mat, pts[i], pts[i + 1], w, h);
  }
  /* Ring duct around the local y axis: closed lathe profile with a rounded lip. */
  function ductGeo(THREE, ri, ro, h, seg) {
    const t = Math.min(0.18, (ro - ri) * 0.4);
    const P = [[ri, -h / 2], [ro - t, -h / 2], [ro, -h / 2 + t], [ro, h / 2 - t], [ro - t, h / 2],
      [ri + t, h / 2], [ri - t * 0.4, h / 2 - t], [ri, -h / 2 + t], [ri, -h / 2]];
    return new THREE.LatheGeometry(P.map((q) => new THREE.Vector2(q[0], q[1])), seg || 28);
  }
  /* Fin from a profile in (z, y), thickness t along x, centred on x = 0. */
  function finGeo(THREE, profile, t) {
    const s = new THREE.Shape(profile.map((q) => new THREE.Vector2(q[0], q[1])));
    const g = new THREE.ExtrudeGeometry(s, { depth: t, bevelEnabled: false });
    g.rotateY(-Math.PI / 2);  /* shape x -> world z, extrusion -> world -x */
    g.translate(t / 2, 0, 0);
    return g;
  }
  function mirror(fn) { fn(1); fn(-1); }

  /* ---- the courier ------------------------------------------------------
     A flat wedge with a wraparound dark cabin, four ducted lift fans on stub
     pylons at the corners (they are what makes strafing, hovering and
     rolling plausible), two rectangular main nozzles, a rear spoiler between
     canted fins. Drawn at the natural 15 m in the uncentred drawing frame;
     the body group is then scaled and shifted, so none of the numbers below
     ever has to know about opts.length or the centroid. */
  function buildBody(ctx) {
    const THREE = ctx.THREE, M = ctx.M, g = new THREE.Group();
    g.name = 'courier-body';
    const ST = [
      sec(-7.5, 0.5, -0.05, 0.9, -0.30, 0.6, -0.55),
      sec(-6.0, 1.2, 0.38, 1.85, -0.12, 1.4, -0.80),
      sec(-4.0, 1.65, 0.58, 2.15, 0.00, 1.7, -0.92),
      sec(0.0, 1.75, 0.62, 2.30, 0.05, 1.8, -0.95),
      sec(4.5, 1.75, 0.68, 2.30, 0.10, 1.8, -0.92),
      sec(6.6, 1.6, 0.74, 2.10, 0.15, 1.6, -0.72),
      sec(7.4, 1.4, 0.70, 1.80, 0.15, 1.4, -0.45)
    ];
    mesh(ctx, g, loftGeo(THREE, ST), M.hull);
    /* cabin: dark wraparound glass on the deck */
    mesh(ctx, g, loftGeo(THREE, [
      sec(-4.4, 0.40, 0.57, 1.10, 0.56, 1.30, 0.52),
      sec(-2.6, 0.80, 1.42, 1.35, 1.02, 1.55, 0.52),
      sec(0.4, 0.85, 1.62, 1.42, 1.08, 1.62, 0.52),
      sec(2.8, 0.72, 1.20, 1.32, 0.88, 1.56, 0.52),
      sec(3.8, 0.45, 0.64, 1.20, 0.64, 1.40, 0.56)
    ]), M.glass);
    /* roof blade: a bone spine over the glass */
    mesh(ctx, g, loftGeo(THREE, [
      sec(-2.4, 0.10, 1.50, 0.42, 1.46, 0.42, 1.38),
      sec(0.4, 0.22, 1.69, 0.55, 1.65, 0.55, 1.56),
      sec(2.6, 0.18, 1.30, 0.48, 1.26, 0.48, 1.18)
    ]), M.hull2);
    /* belly plate */
    box(ctx, g, M.dark, [2.6, 0.12, 9.5], [0, -0.95, 0.2]);
    /* chine light strips following the widest line */
    mirror((s) => strip(ctx, g, M.neon, ST.slice(1, 6).map((r) => [s * (r[1][0] + 0.02), r[1][1], r[1][2]]), 0.05, 0.07));
    /* headlights */
    mirror((s) => {
      box(ctx, g, M.white, [0.5, 0.07, 0.05], [s * 0.6, -0.12, -7.42], [0, s * 0.3, 0]);
      glow(ctx, g, [s * 0.65, -0.12, -7.6], 1.6, 0xffffff, 0.6);
    });
    /* corner lift fans */
    const pods = [[3.15, -4.5], [3.15, 4.4]];
    mirror((s) => {
      for (const pd of pods) {
        const px = pd[0], pz = pd[1];
        const x = s * px, tilt = pz > 0 ? 0.12 : -0.06;
        const pod = new THREE.Group();
        pod.name = 'fan-' + (pz < 0 ? 'front' : 'rear') + '-' + (s > 0 ? 'starboard' : 'port');
        pod.position.set(x, 0.05, pz); pod.rotation.x = tilt; g.add(pod);
        mesh(ctx, pod, ductGeo(THREE, 0.8, 1.05, 0.62), M.hull2);
        mesh(ctx, pod, new THREE.CylinderGeometry(0.22, 0.28, 0.4, 10), M.dark);
        for (let b = 0; b < 4; b++) box(ctx, pod, M.dark, [1.5, 0.03, 0.18], [0, 0, 0], [0.25, b * Math.PI / 4, 0]);
        mesh(ctx, pod, new THREE.CircleGeometry(0.8, 24), M.blur, [0, 0.05, 0], [-Math.PI / 2, 0, 0]);
        mesh(ctx, pod, new THREE.TorusGeometry(0.86, 0.045, 6, 32), M.neon, [0, -0.3, 0], [Math.PI / 2, 0, 0]);
        mesh(ctx, pod, new THREE.TorusGeometry(1.0, 0.03, 6, 32), M.neon, [0, 0.32, 0], [Math.PI / 2, 0, 0]);
        glow(ctx, pod, [0, -0.5, 0], 2.6, ACCENT, 0.55);
        plume(ctx, pod, [0, -0.32, 0], [0, -1, 0], 0.7, 1.1, ACCENT, 0.10).userData.thruster = 'fan';
        /* pylon back to the body */
        box(ctx, g, M.carbon, [0.9, 0.22, 0.8], [s * (px - 1.0), 0.08, pz]);
        /* outer marker light */
        box(ctx, pod, M.neon, [0.05, 0.12, 0.5], [s * 1.06, 0.05, 0]);
      }
    });
    /* main nozzles */
    mirror((s) => {
      box(ctx, g, M.dark, [0.95, 0.5, 0.7], [s * 0.95, 0.02, 7.15]);
      box(ctx, g, M.neon, [0.75, 0.3, 0.02], [s * 0.95, 0.02, 7.51]);
      glow(ctx, g, [s * 0.95, 0.02, 7.8], 2.4, ACCENT, 0.8);
      plume(ctx, g, [s * 0.95, 0.02, 7.52], [0, 0, 1], 0.32, 3.2, ACCENT, 0.5).userData.thruster = 'main';
    });
    /* canted tail fins and spoiler */
    mirror((s) => {
      mesh(ctx, g, finGeo(THREE, [[5.4, 0], [7.3, 0], [7.5, 0.78], [6.7, 0.78]], 0.12), M.hull2,
        [s * 1.3, 0.68, 0], [0, 0, -s * 0.35]);
    });
    box(ctx, g, M.hull2, [3.1, 0.07, 0.75], [0, 1.42, 6.95]);
    box(ctx, g, M.neon, [3.0, 0.05, 0.04], [0, 1.42, 7.33]);
    /* tail lights */
    mirror((s) => box(ctx, g, M.neon, [1.0, 0.06, 0.04], [s * 1.4, 0.5, 7.43]));
    return g;
  }

  /* Build the drawable ship. Returns the shape of the concept's finish():
     { name, visual, collisionPoints, collisionHull, hullVolume, length,
     width, height, bounds }, plus dispose(). length/width/height here are
     the VISUAL extents (meshes only, glow and plumes left out); the
     collision extents are in geometry(). */
  function build(THREE, opts) {
    opts = opts || {};
    const geo = geometry(opts);
    const ctx = makeContext(THREE);
    const body = buildBody(ctx);
    body.scale.setScalar(geo.scale);
    const c = geo.centroidShift;
    body.position.set(-c[0], -c[1], -c[2]);
    const visual = new THREE.Group();
    visual.name = 'courier';
    visual.add(body);
    visual.updateMatrixWorld(true);
    const bb = new THREE.Box3(), tmp = new THREE.Box3();
    visual.traverse((o) => {
      if (o.isMesh && !o.userData.fx) {
        o.geometry.computeBoundingBox();
        tmp.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld);
        bb.union(tmp);
      }
    });
    const size = bb.getSize(new THREE.Vector3());
    return {
      name: 'courier', visual: visual,
      collisionPoints: geo.collisionPoints, collisionHull: geo.collisionHull, hullVolume: geo.hullVolume,
      length: size.z, width: size.x, height: size.y, bounds: bb,
      /* Releases what this build created. Geometries are per mesh, so they
         are collected from the tree; materials and the glow texture were
         recorded as they were made. */
      dispose: function () {
        visual.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
        for (const r of ctx.owned) r.dispose();
      }
    };
  }

  /* Collision overlay for the debug toggle: round dots for the points, faint
     lines for the hull. depthTest off, so points behind the hull stay
     visible, which is the whole use of it. Add both to ship.visual (they are
     in the same centred frame) and dispose them with the overlay. */
  function collisionOverlay(ship, THREE, opts) {
    opts = opts || {};
    const color = opts.color === undefined ? 0xff5a3c : opts.color;
    const size = opts.size === undefined ? 9 : opts.size;
    const c = document.createElement('canvas'); c.width = c.height = 32;
    const g = c.getContext('2d');
    g.fillStyle = '#101418'; g.beginPath(); g.arc(16, 16, 15, 0, 7); g.fill();
    g.fillStyle = '#ffffff'; g.beginPath(); g.arc(16, 16, 10, 0, 7); g.fill();
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const pts = ship.collisionPoints, flat = [];
    for (const p of pts) flat.push(p[0], p[1], p[2]);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(flat, 3));
    const dots = new THREE.Points(geo, new THREE.PointsMaterial({ map: tex, color: color, size: size, sizeAttenuation: false,
      transparent: true, alphaTest: 0.2, depthTest: false, depthWrite: false, toneMapped: false }));
    dots.renderOrder = 10;
    const lp = [];
    for (const e of hullEdges(ship.collisionHull.faces)) {
      const a = pts[e[0]], b = pts[e[1]];
      lp.push(a[0], a[1], a[2], b[0], b[1], b[2]);
    }
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.Float32BufferAttribute(lp, 3));
    const lines = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: color, transparent: true, opacity: 0.28,
      depthTest: false, depthWrite: false, toneMapped: false }));
    lines.renderOrder = 9;
    return {
      dots: dots, lines: lines,
      dispose: function () {
        geo.dispose(); lg.dispose(); dots.material.dispose(); lines.material.dispose(); tex.dispose();
      }
    };
  }

  const Courier = {
    ACCENT: ACCENT, NATURAL_LENGTH: NATURAL_LENGTH,
    POINTS: Object.freeze(POINTS.map((p) => Object.freeze(p.slice()))),
    convexHull: convexHull, hullCentroid: hullCentroid, hullEdges: hullEdges,
    geometry: geometry,
    build: build, collisionOverlay: collisionOverlay
  };
  globalThis.Courier = Courier;
})();
