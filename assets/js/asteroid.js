/* asteroid.js -- shared procedural asteroid geometry for alber.me tools.
 *
 * Asteroid.buildAsteroid(params) -> { positions: Float32Array (3 per vertex),
 * indices: Uint32Array (3 per triangle), normals: Float32Array, rMin, rMax,
 * tris, params, ms }. The array convention is deliberately the one
 * MarchingCubes.extract already returns, so the second construction route
 * (an SDF sampled on a grid, a later step) can be swapped in behind the same
 * call and the mesh statistics only have to be written once.
 *
 * Nothing here touches the DOM, three.js or any import: the module must run
 * in the page, in a worker and under Node, where the test suite evaluates the
 * file as a string. Everything hangs on globalThis.Asteroid.
 *
 * Two things in this file are load-bearing in a way that is easy to undo by
 * accident, so they are called out here and again at the code:
 *
 *   - Randomness is drawn from SEPARATE streams per purpose. One shared
 *     stream would reshuffle the whole rock on every slider tick, and then no
 *     single parameter could be judged on its own, which is the entire point
 *     of the lab this module feeds.
 *   - Craters have a raised rim, not just a dent. Without the rim the dents
 *     read as dings and the rock looks deflated rather than impacted. This is
 *     where naive implementations fail.
 *
 * Only the "ico" route exists in this step. buildAsteroid throws a clear
 * error for route "sdf" rather than silently building something else.
 */
(function () {
  'use strict';

  /* ------------------------------------------------------------------ *
   * 1. Randomness
   * ------------------------------------------------------------------ */

  /* mulberry32: 32 bits of state, one multiply-xorshift round. Small, fast,
     and good enough for scattering craters and axis lengths. It is chosen
     over Math.random for the only reason that matters here: a seed has to
     rebuild the same rock, byte for byte, on every reload and in every test
     run. */
  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* One salt per purpose, all distinct and all odd so that xor-ing them into
     the seed cannot collapse two purposes onto the same state for any seed.

     Why this exists at all: with a single shared stream, raising the crater
     count from 12 to 16 would consume four more numbers and every later draw
     would shift, so the axis lengths and the noise offset would change too
     and the rock would be a different rock. Per-purpose streams mean raising
     the crater count adds four craters and changes nothing else. There is a
     test that asserts exactly that. */
  var SALT = {
    axes: 0x9E3779B1,
    craters: 0x85EBCA77,
    lobes: 0xC2B2AE3D,
    noise: 0x27D4EB2F,
    field: 0x165667B1
  };

  function stream(seed, purpose) {
    if (!Object.prototype.hasOwnProperty.call(SALT, purpose)) {
      throw new Error('Asteroid.stream: unknown purpose "' + purpose +
        '". Known purposes: ' + Object.keys(SALT).join(', ') + '.');
    }
    return mulberry32(((seed | 0) ^ SALT[purpose]) >>> 0);
  }

  /* ------------------------------------------------------------------ *
   * 2. Noise
   * ------------------------------------------------------------------ */

  /* Integer hash on three axes, widened from the two-axis noiseHash in
     pcb-designer.html: three independent odd multipliers xor-ed together with
     a seed mix, then the usual two-step avalanche so neighbouring lattice
     points do not produce correlated gradients. Returns uint32; hash3 is the
     0..1 view of the same thing. */
  function hashi(ix, iy, iz, seed) {
    var v = Math.imul(ix | 0, 374761393)
      ^ Math.imul(iy | 0, 668265263)
      ^ Math.imul(iz | 0, -2048144789)
      ^ Math.imul(seed | 0, 1442695041);
    v = Math.imul(v ^ (v >>> 13), 1274126177);
    return (v ^ (v >>> 16)) >>> 0;
  }

  function hash3(ix, iy, iz, seed) {
    return hashi(ix, iy, iz, seed) / 4294967295;
  }

  /* Perlin's improved-noise gradient set: the twelve edge midpoints of the
     cube, indexed by four bits with four duplicates. Written as a branch
     rather than a table lookup because it is the same arithmetic and saves
     carrying an array. */
  function grad(h, x, y, z) {
    var u = h < 8 ? x : y;
    var v = h < 4 ? y : (h === 12 || h === 14 ? x : z);
    return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
  }

  /* Quintic fade, 6t^5 - 15t^4 + 10t^3, NOT the cheaper cubic smoothstep.
     The cubic has a discontinuous second derivative at every cell boundary.
     Under Lambert shading that is invisible, which is why it survives in so
     much sample code. Under quantized toon bands it is not: a curvature jump
     moves the band edge, so the boundaries of the noise lattice show up as
     straight axis-aligned creases across the rock and read as a shader bug.
     The toon look is one of the things this geometry exists to be judged by,
     so the artefact must not be baked into the geometry. */
  function fade(t) {
    return t * t * t * (t * (t * 6 - 15) + 10);
  }

  function lerp(a, b, t) { return a + (b - a) * t; }

  /* 3D Perlin noise. Deliberately no 512-entry permutation table: the table
     is what makes classic implementations need a rebuild per seed. Hashing
     the lattice coordinate directly leaves the seed a free integer, so
     reseeding is a number change, and the lab reseeds on every slider drag.

     Value noise would be cheaper and is the wrong choice here: at few octaves
     it shows axis-parallel cross structure, which on a sphere reads as
     "cubey", and that is precisely the artefact the lab is supposed to judge
     rather than inherit. Range is [-sqrt(3)/2, sqrt(3)/2], comfortably inside
     [-1, 1]. */
  function perlin3(x, y, z, seed) {
    var X = Math.floor(x), Y = Math.floor(y), Z = Math.floor(z);
    var xf = x - X, yf = y - Y, zf = z - Z;
    var u = fade(xf), v = fade(yf), w = fade(zf);

    var g000 = grad(hashi(X, Y, Z, seed) & 15, xf, yf, zf);
    var g100 = grad(hashi(X + 1, Y, Z, seed) & 15, xf - 1, yf, zf);
    var g010 = grad(hashi(X, Y + 1, Z, seed) & 15, xf, yf - 1, zf);
    var g110 = grad(hashi(X + 1, Y + 1, Z, seed) & 15, xf - 1, yf - 1, zf);
    var g001 = grad(hashi(X, Y, Z + 1, seed) & 15, xf, yf, zf - 1);
    var g101 = grad(hashi(X + 1, Y, Z + 1, seed) & 15, xf - 1, yf, zf - 1);
    var g011 = grad(hashi(X, Y + 1, Z + 1, seed) & 15, xf, yf - 1, zf - 1);
    var g111 = grad(hashi(X + 1, Y + 1, Z + 1, seed) & 15, xf - 1, yf - 1, zf - 1);

    var x00 = lerp(g000, g100, u), x10 = lerp(g010, g110, u);
    var x01 = lerp(g001, g101, u), x11 = lerp(g011, g111, u);
    return lerp(lerp(x00, x10, v), lerp(x01, x11, v), w);
  }

  /* The ridge transform. Folding the noise at zero and squaring the fold
     turns smooth hills into sharp creases, which is what gives fracture edges
     instead of potatoes. Mapped back to [-1, 1] so every kind shares one
     range and the amplitude slider means the same thing for all of them. */
  function ridge(n) {
    var a = 1 - Math.abs(n);
    return 2 * (a * a) - 1;
  }

  var NOISE_KINDS = ['fbm', 'ridged', 'hybrid'];

  function clamp01(v) { return v < 0 ? 0 : (v > 1 ? 1 : v); }

  /* Fractal sum of perlin3.
   *
   * opts: { octaves 1..7, lacunarity 2.03, gain 0.5, kind 'fbm'|'ridged'|
   * 'hybrid', hybrid 0..1, warpAmp 0, warpFreq 1 }
   *
   * Two decisions that are not cosmetic:
   *
   *   - Lacunarity 2.03 rather than exactly 2. At exactly 2 every octave
   *     lands its features on the same lattice planes as the one before, and
   *     the alignment is visible as a faint grid. A few percent of detune
   *     costs nothing and breaks it.
   *   - The result is divided by the amplitude sum THAT WAS ACTUALLY APPLIED,
   *     including the inter-octave weight below. Without that, three octaves
   *     and six octaves put the amplitude slider on different scales, and any
   *     comparison across octave counts would be dishonest. There is a test.
   *
   * For 'ridged' and 'hybrid' the classic inter-octave weight applies: the
   * next octave is scaled by how high this one came out, so detail collects
   * on ridges instead of spraying evenly. Because the same weight goes into
   * the normaliser, the output provably stays in [-1, 1] for any octave
   * count: it is a convex combination of per-octave values that are
   * themselves in [-1, 1]. */
  function fbm3(x, y, z, seed, opts) {
    opts = opts || {};
    var oct = opts.octaves == null ? 4 : Math.round(opts.octaves);
    if (!(oct >= 1)) oct = 1;
    if (oct > 7) oct = 7;
    var lac = opts.lacunarity == null ? 2.03 : opts.lacunarity;
    var gain = opts.gain == null ? 0.5 : opts.gain;
    var kind = opts.kind == null ? 'fbm' : opts.kind;
    if (NOISE_KINDS.indexOf(kind) < 0) {
      throw new Error('Asteroid.fbm3: unknown noise kind "' + kind +
        '". Known kinds: ' + NOISE_KINDS.join(', ') + '.');
    }
    var hyb = opts.hybrid == null ? 0.5 : clamp01(opts.hybrid);
    var warpAmp = opts.warpAmp == null ? 0 : opts.warpAmp;
    var warpFreq = opts.warpFreq == null ? 1 : opts.warpFreq;

    /* Domain warp: displace the sample point by a vector field made of three
       more Perlin evaluations with distinct seed xors. It is the single
       biggest win against the blob impression, and it triples the noise cost,
       which is why it is a parameter and not a constant. */
    if (warpAmp > 0) {
      var wx = perlin3(x * warpFreq + 17.31, y * warpFreq - 4.07, z * warpFreq + 9.13, (seed ^ 0x1B873593) | 0);
      var wy = perlin3(x * warpFreq - 8.55, y * warpFreq + 12.79, z * warpFreq - 2.41, (seed ^ 0xCC9E2D51) | 0);
      var wz = perlin3(x * warpFreq + 3.67, y * warpFreq + 6.23, z * warpFreq + 21.05, (seed ^ 0xE6546B64) | 0);
      x += warpAmp * wx;
      y += warpAmp * wy;
      z += warpAmp * wz;
    }

    var amp = 1, freq = 1, sum = 0, norm = 0, w = 1;
    for (var i = 0; i < oct; i++) {
      /* A distinct seed per octave, so two octaves cannot land the same
         gradient field on top of itself at a rational frequency ratio. */
      var s = (seed ^ Math.imul(i + 1, 0x9E3779B1)) | 0;
      var n = perlin3(x * freq, y * freq, z * freq, s);
      var val;
      if (kind === 'fbm') val = n;
      else if (kind === 'ridged') val = ridge(n);
      else val = n + (ridge(n) - n) * hyb;

      sum += val * amp * w;
      norm += amp * w;
      if (kind !== 'fbm') w = clamp01((val + 1) / 2);
      amp *= gain;
      freq *= lac;
    }
    return norm > 0 ? sum / norm : 0;
  }

  /* ------------------------------------------------------------------ *
   * 3. Base mesh: icosphere
   * ------------------------------------------------------------------ */

  /* Icosahedron, golden-ratio coordinates, faces wound counter-clockwise seen
     from outside so the signed volume comes out positive without a fix-up
     pass anywhere downstream. */
  var PHI = (1 + Math.sqrt(5)) / 2;
  var ICO_V = [
    -1, PHI, 0, 1, PHI, 0, -1, -PHI, 0, 1, -PHI, 0,
    0, -1, PHI, 0, 1, PHI, 0, -1, -PHI, 0, 1, -PHI,
    PHI, 0, -1, PHI, 0, 1, -PHI, 0, -1, -PHI, 0, 1
  ];
  var ICO_F = [
    0, 11, 5, 0, 5, 1, 0, 1, 7, 0, 7, 10, 0, 10, 11,
    1, 5, 9, 5, 11, 4, 11, 10, 2, 10, 7, 6, 7, 1, 8,
    3, 9, 4, 3, 4, 2, 3, 2, 6, 3, 6, 8, 3, 8, 9,
    4, 9, 5, 2, 4, 11, 6, 2, 10, 8, 6, 7, 9, 8, 1
  ];

  /* One cache entry per subdivision level. The base sphere does not depend on
     the seed or on any parameter, so rebuilding it on every slider tick would
     be pure waste.

     The cached typed arrays are handed out BY REFERENCE and are read-only for
     callers. displace() therefore never writes into them and hands back a
     fresh positions array plus a copy of the indices. A caller that mutates
     what icosphere() returns corrupts every later build at that level. */
  var ICO_CACHE = Object.create(null);

  function icosphere(subdiv) {
    var n = Math.round(subdiv);
    if (!(n >= 0)) n = 0;
    if (n > 6) n = 6;
    if (ICO_CACHE[n]) return ICO_CACHE[n];

    var pos = ICO_V.slice();
    var idx = ICO_F.slice();

    /* Normalise the starting vertices, then re-normalise AFTER EVERY ROUND.
       Splitting an edge in the plane and only projecting once at the end
       leaves the triangles near the twelve original corners visibly larger
       than the ones in the middle of a face. Projecting each round keeps the
       areas within a few percent of each other, which matters because the
       displacement is sampled per vertex: uneven vertex density is uneven
       noise resolution. */
    normalizeAll(pos);

    for (var r = 0; r < n; r++) {
      var mid = new Map();
      var out = [];
      for (var f = 0; f < idx.length; f += 3) {
        var a = idx[f], b = idx[f + 1], c = idx[f + 2];
        var ab = midpoint(pos, mid, a, b);
        var bc = midpoint(pos, mid, b, c);
        var ca = midpoint(pos, mid, c, a);
        out.push(a, ab, ca, b, bc, ab, c, ca, bc, ab, bc, ca);
      }
      idx = out;
      normalizeAll(pos);
    }

    var entry = {
      positions: new Float32Array(pos),
      indices: new Uint32Array(idx)
    };
    ICO_CACHE[n] = entry;
    return entry;
  }

  function normalizeAll(pos) {
    for (var i = 0; i < pos.length; i += 3) {
      var x = pos[i], y = pos[i + 1], z = pos[i + 2];
      var d = Math.sqrt(x * x + y * y + z * z) || 1;
      pos[i] = x / d; pos[i + 1] = y / d; pos[i + 2] = z / d;
    }
  }

  /* Edge midpoints are shared through a Map keyed by the ordered index pair,
     so the two triangles on either side of an edge get the SAME new vertex.
     Without the weld the mesh falls apart into 20*4^n loose triangles that
     merely happen to touch, and every manifold assertion downstream fails. */
  function midpoint(pos, mid, a, b) {
    var key = a < b ? a * 4294967296 + b : b * 4294967296 + a;
    var got = mid.get(key);
    if (got !== undefined) return got;
    var ia = a * 3, ib = b * 3;
    var i = pos.length / 3;
    pos.push((pos[ia] + pos[ib]) / 2, (pos[ia + 1] + pos[ib + 1]) / 2, (pos[ia + 2] + pos[ib + 2]) / 2);
    mid.set(key, i);
    return i;
  }

  /* ------------------------------------------------------------------ *
   * 4. Craters
   * ------------------------------------------------------------------ */

  /* A list of impact sites on the unit sphere.
   *
   * Directions are uniform on the sphere via z = 2u - 1 and phi = 2*pi*v.
   * Sampling the two angles uniformly instead would crowd the poles, and on a
   * rotating rock that clustering is immediately visible.
   *
   * Angular radii follow a power law, ang = angMin * (angMax/angMin)^(u^power)
   * with power around 2.2: many small craters, few large ones. That is the
   * actual regolith size distribution, and it is the reason real asteroids do
   * not look like golf balls. A uniform size draw gives a golf ball. */
  function craterList(seed, opts) {
    opts = opts || {};
    var count = opts.count == null ? DEFAULTS.count : Math.round(opts.count);
    if (!(count > 0)) return [];
    var angMin = opts.angMin == null ? DEFAULTS.angMin : opts.angMin;
    var angMax = opts.angMax == null ? DEFAULTS.angMax : opts.angMax;
    if (!(angMin > 1e-4)) angMin = 1e-4;
    if (angMax < angMin) angMax = angMin;
    var power = opts.power == null ? DEFAULTS.power : opts.power;
    var depth = opts.depth == null ? DEFAULTS.depth : opts.depth;
    var rimH = opts.rimH == null ? DEFAULTS.rimH : opts.rimH;
    var rimW = opts.rimW == null ? DEFAULTS.rimW : opts.rimW;
    if (!(rimW > 1e-4)) rimW = 1e-4;
    var jitter = opts.depthJitter == null ? DEFAULTS.depthJitter : opts.depthJitter;

    var rnd = stream(seed, 'craters');
    var ratio = angMax / angMin;
    var out = [];
    for (var i = 0; i < count; i++) {
      var z = 2 * rnd() - 1;
      var phi = 2 * Math.PI * rnd();
      var s = Math.sqrt(Math.max(0, 1 - z * z));
      var u = rnd();
      var ang = angMin * Math.pow(ratio, Math.pow(u, power));
      /* Depth jitter only, not a second size law: two craters of the same
         width are not equally deep, but the width statistic above is the one
         that carries the look. */
      var dj = 1 + (rnd() - 0.5) * 2 * jitter;
      if (dj < 0) dj = 0;
      out.push({
        dir: [s * Math.cos(phi), s * Math.sin(phi), z],
        ang: ang,
        depth: depth * dj,
        rimH: rimH,
        rimW: rimW
      });
    }
    return out;
  }

  /* ------------------------------------------------------------------ *
   * 5. Displacement
   * ------------------------------------------------------------------ */

  /* Turn a unit icosphere into a rock.
   *
   * ORDER MATTERS, and every step below is where it is for a reason:
   *
   *   1. radial noise, r = R * (1 + amp * fbm3(n * freq + offset))
   *   2. clamp r to at least 0.18 * R, BEFORE any crater is dug. A large
   *      amplitude can otherwise push r negative, which turns the surface
   *      inside out, and a crater excavated into an already inverted surface
   *      is not recoverable by any later clamp.
   *   3. craters, bowls combined with min and rims with max
   *   4. axis anisotropy, as a true scale of the finished point
   *
   * Unlike buildAsteroid, this function does NOT clamp its parameters to the
   * UI ranges. It fills in missing keys from DEFAULTS and otherwise takes
   * what it is given, so that the internal guards above can be tested with
   * values far outside anything a slider can produce. */
  function displace(base, params) {
    var p = withDefaults(params);
    var R = p.radius;
    var src = base.positions;
    var nv = src.length / 3;
    var out = new Float32Array(src.length);

    /* The noise offset moves the sample point away from the lattice origin,
       where all eight gradients meet and the field is atypically quiet. It
       comes from its own stream, so it is untouched by the crater count. */
    var rn = stream(p.seed, 'noise');
    var ox = (rn() * 2 - 1) * 64;
    var oy = (rn() * 2 - 1) * 64;
    var oz = (rn() * 2 - 1) * 64;

    var craters = craterList(p.seed, p);
    var nc = craters.length;

    /* Three axis factors, normalised so their product is 1. That keeps the
       volume of the ellipsoid equal to the sphere's, so the radius slider
       still means size and does not secretly also mean "bigger" whenever
       anisotropy goes up. Applied as a true scale of the final point at the
       end, NOT as a modulation of r: modulating the radius by direction gives
       a lumpy sphere, not an ellipsoid, because the lumps follow the sample
       direction instead of stretching the body. */
    var ra = stream(p.seed, 'axes');
    var fa = 1 + p.aniso * (ra() - 0.5) * 0.7;
    var fb = 1 + p.aniso * (ra() - 0.5) * 0.7;
    var fc = 1 + p.aniso * (ra() - 0.5) * 0.7;
    var vol = Math.cbrt(fa * fb * fc);
    if (!(vol > 0)) vol = 1;
    fa /= vol; fb /= vol; fc /= vol;

    var nopts = {
      octaves: p.octaves, lacunarity: p.lacunarity, gain: p.gain,
      kind: p.kind, hybrid: p.hybrid, warpAmp: p.warpAmp, warpFreq: p.warpFreq
    };

    var rMin = Infinity, rMax = 0;
    var floorR = 0.18 * R;
    for (var i = 0; i < nv; i++) {
      var i3 = i * 3;
      var nx = src[i3], ny = src[i3 + 1], nz = src[i3 + 2];

      var f = fbm3(nx * p.freq + ox, ny * p.freq + oy, nz * p.freq + oz, p.seed | 0, nopts);
      var r = R * (1 + p.amp * f);
      if (!(r > floorR)) r = floorR;

      /* Bowls combine with min and rims with max, both deliberately. Adding
         overlapping bowls would dig twice as deep where two craters meet,
         which produces a pit no impact ever made; adding rims would build a
         double wall along the intersection. Taking the extreme of each is
         what a real overlap looks like: the younger crater wins. */
      var bowl = 0, rim = 0;
      for (var k = 0; k < nc; k++) {
        var c = craters[k];
        var d = nx * c.dir[0] + ny * c.dir[1] + nz * c.dir[2];
        if (d < -1) d = -1; else if (d > 1) d = 1;
        var t = Math.acos(d) / c.ang;
        if (t < 1) {
          /* A paraboloid, which is what an impact basin approximately is. */
          var b = -c.depth * R * (1 - t * t);
          if (b < bowl) bowl = b;
        } else if (t < 1 + c.rimW) {
          /* THE RIM IS MANDATORY. A bowl on its own reads as a ding in sheet
             metal and makes the rock look deflated instead of impacted. The
             raised ring is what the eye uses to tell an impact from a dent. */
          var sw = Math.sin(Math.PI * (t - 1) / c.rimW);
          var h = c.rimH * R * sw * sw;
          if (h > rim) rim = h;
        }
      }
      r += bowl + rim;
      /* Last-resort guard only. The clamp that carries the weight is the one
         above, before the craters; this one exists so that an absurd depth
         cannot push a vertex through the origin. */
      if (!(r > 0.03 * R)) r = 0.03 * R;

      var px = r * nx * fa, py = r * ny * fb, pz = r * nz * fc;
      out[i3] = px; out[i3 + 1] = py; out[i3 + 2] = pz;
      var rr = Math.sqrt(px * px + py * py + pz * pz);
      if (rr < rMin) rMin = rr;
      if (rr > rMax) rMax = rr;
    }
    if (!isFinite(rMin)) rMin = 0;

    /* A fresh copy of the indices, never the cached array: the caller may
       hand this straight to a BufferGeometry, and three.js is entitled to
       keep the reference. */
    return {
      positions: out, indices: base.indices.slice(),
      rMin: rMin, rMax: rMax, axes: [fa, fb, fc]
    };
  }

  /* ------------------------------------------------------------------ *
   * 6. Normals and mesh statistics
   * ------------------------------------------------------------------ */

  /* Area-weighted vertex normals from the face cross products.
   *
   * The obvious shortcut on a star-shaped body is to reuse the radial
   * direction, which is already at hand and costs nothing. It is wrong here:
   * after the craters the radial direction is not the surface normal anywhere
   * on a rim or a bowl wall, and the toon shader turns that error into a band
   * edge in the wrong place, which looks exactly like a broken shader. The
   * cross product is a few hundred microseconds and always right.
   *
   * The cross product is left unnormalised on purpose before it is summed:
   * its length is twice the triangle area, so large triangles pull harder,
   * which is the standard area weighting and avoids small sliver triangles
   * dominating a vertex normal. */
  function recomputeNormals(positions, indices) {
    var out = new Float32Array(positions.length);
    for (var t = 0; t < indices.length; t += 3) {
      var a = indices[t] * 3, b = indices[t + 1] * 3, c = indices[t + 2] * 3;
      var ux = positions[b] - positions[a];
      var uy = positions[b + 1] - positions[a + 1];
      var uz = positions[b + 2] - positions[a + 2];
      var vx = positions[c] - positions[a];
      var vy = positions[c + 1] - positions[a + 1];
      var vz = positions[c + 2] - positions[a + 2];
      var cx = uy * vz - uz * vy;
      var cy = uz * vx - ux * vz;
      var cz = ux * vy - uy * vx;
      out[a] += cx; out[a + 1] += cy; out[a + 2] += cz;
      out[b] += cx; out[b + 1] += cy; out[b + 2] += cz;
      out[c] += cx; out[c + 1] += cy; out[c + 2] += cz;
    }
    for (var i = 0; i < out.length; i += 3) {
      var x = out[i], y = out[i + 1], z = out[i + 2];
      var d = Math.sqrt(x * x + y * y + z * z);
      if (d > 0) { out[i] = x / d; out[i + 1] = y / d; out[i + 2] = z / d; }
      else { out[i] = 0; out[i + 1] = 0; out[i + 2] = 1; }
    }
    return out;
  }

  /* Face normals, unit length, one per triangle.
   *
   * Separate from recomputeNormals, which sums them into vertices and throws
   * the per-face values away. Anything that has to reason about a face rather
   * than a point needs them: crease detection, silhouette detection, and
   * later the contact normal of a collision. */
  function faceNormals(positions, indices) {
    var F = indices.length / 3;
    var out = new Float32Array(F * 3);
    for (var f = 0; f < F; f++) {
      var a = indices[f * 3] * 3, b = indices[f * 3 + 1] * 3, c = indices[f * 3 + 2] * 3;
      var ux = positions[b] - positions[a];
      var uy = positions[b + 1] - positions[a + 1];
      var uz = positions[b + 2] - positions[a + 2];
      var vx = positions[c] - positions[a];
      var vy = positions[c + 1] - positions[a + 1];
      var vz = positions[c + 2] - positions[a + 2];
      var nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      var d = Math.sqrt(nx * nx + ny * ny + nz * nz);
      if (d > 0) { out[f * 3] = nx / d; out[f * 3 + 1] = ny / d; out[f * 3 + 2] = nz / d; }
      else { out[f * 3] = 0; out[f * 3 + 1] = 0; out[f * 3 + 2] = 1; }
    }
    return out;
  }

  /* The undirected edge list with, per edge, its two endpoints, the two faces
   * that share it and the angle between their normals.
   *
   * This is what a wireframe actually needs, and three.js' EdgesGeometry is
   * not a substitute for it. EdgesGeometry bakes one crease threshold into a
   * fixed line buffer and knows nothing about the viewer, so it can never
   * draw a SILHOUETTE, which is view dependent by definition and is the one
   * set of lines that always describes the shape. Measured on the default
   * rock: the median dihedral angle is 10 degrees and the 90th percentile is
   * 29, so any threshold in the interesting range cuts straight through the
   * middle of a smooth distribution and selects noise rather than features,
   * while the 574 silhouette edges that would carry the form are missing
   * entirely. With this table the page can do both, and per frame.
   *
   * Flat typed arrays throughout, and f1 is -1 on a boundary edge, which a
   * closed rock never has but a half-built one might.
   *
   * The map key is a * 4294967296 + b, exact in a double up to about 2^21
   * vertices per side, and subdivision 6 is 40962. */
  function edgeTable(positions, indices) {
    var F = indices.length / 3;
    var fn = faceNormals(positions, indices);
    var map = new Map();
    var ea = [], eb = [], f0 = [], f1 = [];

    for (var f = 0; f < F; f++) {
      for (var e = 0; e < 3; e++) {
        var p = indices[f * 3 + e], q = indices[f * 3 + (e + 1) % 3];
        var lo = p < q ? p : q, hi = p < q ? q : p;
        var key = lo * 4294967296 + hi;
        var idx = map.get(key);
        if (idx === undefined) {
          map.set(key, ea.length);
          ea.push(lo); eb.push(hi); f0.push(f); f1.push(-1);
        } else if (f1[idx] < 0) {
          f1[idx] = f;
        }
        /* A third face on the same edge is dropped rather than recorded:
           the table describes a manifold, and meshStats is the thing that
           reports non-manifold edges as the defect they are. */
      }
    }

    var n = ea.length;
    var dihedral = new Float32Array(n);
    for (var i = 0; i < n; i++) {
      if (f1[i] < 0) { dihedral[i] = 0; continue; }
      var a = f0[i] * 3, b = f1[i] * 3;
      var d = fn[a] * fn[b] + fn[a + 1] * fn[b + 1] + fn[a + 2] * fn[b + 2];
      dihedral[i] = Math.acos(d < -1 ? -1 : (d > 1 ? 1 : d));
    }

    return {
      count: n,
      ea: Uint32Array.from(ea),
      eb: Uint32Array.from(eb),
      f0: Int32Array.from(f0),
      f1: Int32Array.from(f1),
      dihedral: dihedral,
      faceNormals: fn
    };
  }

  /* One pass over the mesh producing everything worth asserting about it.
   *
   * This is the interface the corridor game will hang its inertia tensor and
   * its collision code on later, which is why it lives in the module and
   * works on flat typed arrays rather than being borrowed out of a page's
   * script block.
   *
   * volume is the divergence-theorem signed sum over the triangles, so a
   * positive value means the winding points outward. euler is V - E + F and
   * must be 2 for a closed surface of genus 0: any handle, hole or duplicated
   * shell moves it. */
  function meshStats(positions, indices) {
    var V = positions.length / 3;
    var F = indices.length / 3;
    var undir = new Map();
    var degenerate = 0;
    var volume = 0, area = 0;

    for (var t = 0; t < indices.length; t += 3) {
      var ia = indices[t], ib = indices[t + 1], ic = indices[t + 2];
      var bad = (ia === ib || ib === ic || ic === ia);
      var a = ia * 3, b = ib * 3, c = ic * 3;
      var ax = positions[a], ay = positions[a + 1], az = positions[a + 2];
      var bx = positions[b], by = positions[b + 1], bz = positions[b + 2];
      var cx = positions[c], cy = positions[c + 1], cz = positions[c + 2];

      var ux = bx - ax, uy = by - ay, uz = bz - az;
      var vx = cx - ax, vy = cy - ay, vz = cz - az;
      var nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      var len = Math.sqrt(nx * nx + ny * ny + nz * nz);
      if (bad || !(len > 0)) degenerate++;
      area += len / 2;

      volume += (ax * (by * cz - bz * cy)
        - ay * (bx * cz - bz * cx)
        + az * (bx * cy - by * cx)) / 6;

      for (var e = 0; e < 3; e++) {
        var p = indices[t + e], q = indices[t + (e + 1) % 3];
        var key = p < q ? p * 4294967296 + q : q * 4294967296 + p;
        undir.set(key, (undir.get(key) || 0) + 1);
      }
    }

    var boundaryEdges = 0, nonManifoldEdges = 0;
    undir.forEach(function (n) {
      if (n === 1) boundaryEdges++;
      else if (n > 2) nonManifoldEdges++;
    });

    var rMin = Infinity, rMax = 0, sx = 0, sy = 0, sz = 0;
    for (var i = 0; i < positions.length; i += 3) {
      var x = positions[i], y = positions[i + 1], z = positions[i + 2];
      sx += x; sy += y; sz += z;
      var r = Math.sqrt(x * x + y * y + z * z);
      if (r < rMin) rMin = r;
      if (r > rMax) rMax = r;
    }
    if (!isFinite(rMin)) rMin = 0;

    return {
      verts: V, tris: F, edges: undir.size, euler: V - undir.size + F,
      boundaryEdges: boundaryEdges, nonManifoldEdges: nonManifoldEdges,
      degenerate: degenerate, volume: volume, area: area,
      rMin: rMin, rMax: rMax,
      centroid: V ? [sx / V, sy / V, sz / V] : [0, 0, 0]
    };
  }

  /* ------------------------------------------------------------------ *
   * 7. Parameters
   * ------------------------------------------------------------------ */

  var DEFAULTS = {
    route: 'ico',
    seed: 1,
    subdiv: 4,          /* 2562 vertices, 5120 faces: the sweet spot */
    radius: 1,
    aniso: 0.6,
    amp: 0.22,
    freq: 1.6,
    kind: 'hybrid',
    octaves: 5,
    lacunarity: 2.03,
    gain: 0.5,
    hybrid: 0.5,
    warpAmp: 0,         /* off by default: it triples the noise cost */
    warpFreq: 1,
    count: 16,
    angMin: 0.08,
    angMax: 0.45,
    power: 2.2,
    /* Bowl depth as a fraction of the local radius. Owner's call on
       2026-08-29, after looking at the first build: 0.12 read as too
       deep, so this is 60 percent of it. The rim height deliberately did
       NOT follow it down. Shrinking both together would have kept the
       ratio and made the rims, which are already the hard part to see,
       harder still; leaving rimH alone makes the rim relatively more
       prominent, which is the direction the same session asked for. */
    depth: 0.072,
    rimH: 0.035,
    rimW: 0.35,
    depthJitter: 0.35
  };

  /* Inclusive [min, max] per numeric parameter. This table is the single
     source for the UI slider bounds, for clampParams and for the parameter
     sweep in the tests, so a range widened here is covered there without a
     second edit. */
  var RANGES = {
    seed: [0, 4294967295],
    subdiv: [0, 6],
    radius: [0.1, 10],
    aniso: [0, 1],
    amp: [0, 0.6],
    freq: [0.2, 8],
    octaves: [1, 7],
    lacunarity: [1.5, 3.5],
    gain: [0.2, 0.8],
    hybrid: [0, 1],
    warpAmp: [0, 1],
    warpFreq: [0.2, 4],
    count: [0, 200],
    angMin: [0.02, 0.6],
    angMax: [0.02, 1.2],
    power: [1, 4],
    depth: [0, 0.35],
    rimH: [0, 0.15],
    rimW: [0.05, 1],
    depthJitter: [0, 1]
  };

  var INT_KEYS = { seed: 1, subdiv: 1, octaves: 1, count: 1 };
  var ROUTES = ['ico', 'sdf'];

  /* Fill missing keys from DEFAULTS without clamping. Used by displace, which
     has to accept out-of-range values so the internal guards are testable. */
  function withDefaults(p) {
    var src = (p && typeof p === 'object') ? p : {};
    var out = {};
    for (var k in DEFAULTS) {
      if (Object.prototype.hasOwnProperty.call(DEFAULTS, k)) {
        out[k] = (src[k] === undefined) ? DEFAULTS[k] : src[k];
      }
    }
    return out;
  }

  function num(v) {
    if (typeof v === 'number') return v;
    if (typeof v === 'string') { var f = parseFloat(v); return isFinite(f) ? f : NaN; }
    return NaN;
  }

  /* Fill every missing key, clamp every present one, round the integers,
     validate the two enumerations and repair an inverted crater size range.
     The contract is stronger than "usually returns something sensible": this
     function is the only thing standing between a hand-edited preset JSON and
     NaN geometry, so it must not throw for ANY input, including null, a
     string, an array or an object full of NaNs, and it must never let a
     non-finite number through to the geometry. */
  function clampParams(p) {
    var src = (p && typeof p === 'object') ? p : {};
    var out = {};

    out.route = ROUTES.indexOf(src.route) >= 0 ? src.route : DEFAULTS.route;
    out.kind = NOISE_KINDS.indexOf(src.kind) >= 0 ? src.kind : DEFAULTS.kind;

    for (var k in RANGES) {
      if (!Object.prototype.hasOwnProperty.call(RANGES, k)) continue;
      var r = RANGES[k];
      var x = num(src[k]);
      if (!isFinite(x)) x = DEFAULTS[k];
      if (INT_KEYS[k]) x = Math.round(x);
      if (x < r[0]) x = r[0];
      else if (x > r[1]) x = r[1];
      out[k] = x;
    }

    /* An inverted size range is a plausible hand-edit and would otherwise
       make the power law compute a ratio below 1, quietly inverting the
       distribution. Swapping keeps both numbers the user typed. */
    if (out.angMax < out.angMin) {
      var tmp = out.angMin; out.angMin = out.angMax; out.angMax = tmp;
    }
    return out;
  }

  /* ------------------------------------------------------------------ *
   * 8. The radius map: collision against the drawn geometry
   * ------------------------------------------------------------------ */

  /* Noise and craters move every vertex along ITS OWN radius, so the body is
   * star-shaped about its centre: every ray from the centre meets the surface
   * exactly once. That single property is worth more than any acceleration
   * structure, because it turns "is this point inside the rock" into a lookup
   * of one number:
   *
   *     inside(p)       :=  |p| < R(p / |p|)
   *     penetration(p)  :=  the same difference, projected on the normal
   *
   * and R is read off the very triangles that are drawn. A bounding sphere
   * would be a visible lie on a body this lumpy, and an SDF grid would spend
   * memory and interpolation error on a question the geometry answers exactly.
   *
   * Anisotropy is the one wrinkle. It is applied as a per-axis SCALE of the
   * finished point, not as a modulation of the radius, so the drawn body is
   * an affinely stretched star-shaped body: still star-shaped, but its radius
   * is no longer a function of the base direction. The map therefore works in
   * the UNSCALED space and divides the query point by the axis factors on the
   * way in. Barycentric coordinates survive a linear map untouched, which is
   * why the normal can still be interpolated from the drawn normals with
   * weights computed on the unscaled triangle.
   *
   * Finding the triangle a direction falls into is a descent, not a search.
   * icosphere() subdivides face by face and pushes the four children of a
   * triangle in one go, so the children of triangle t at one level are
   * 4t..4t+3 at the next, and 20 spherical containment tests plus four per
   * level land on the exact leaf. The level index arrays are rebuilt here by
   * replaying the same midpoint bookkeeping, which is deterministic and gives
   * back precisely the mesh's own vertex numbering; a test asserts that the
   * last level equals the mesh index array. */

  function icoLevels(n) {
    var idx = ICO_F.slice();
    var levels = [new Uint32Array(idx)];
    var next = 12;
    for (var r = 0; r < n; r++) {
      var mid = new Map(), out = [];
      var key = function (a, b) { return a < b ? a * 4294967296 + b : b * 4294967296 + a; };
      var get = function (a, b) {
        var k = key(a, b), got = mid.get(k);
        if (got !== undefined) return got;
        mid.set(k, next); return next++;
      };
      for (var f = 0; f < idx.length; f += 3) {
        var a = idx[f], b = idx[f + 1], c = idx[f + 2];
        var ab = get(a, b), bc = get(b, c), ca = get(c, a);
        out.push(a, ab, ca, b, bc, ab, c, ca, bc, ab, bc, ca);
      }
      idx = out;
      levels.push(new Uint32Array(idx));
    }
    return levels;
  }

  var LEVEL_CACHE = Object.create(null);
  function levelsFor(n) {
    if (!LEVEL_CACHE[n]) LEVEL_CACHE[n] = icoLevels(n);
    return LEVEL_CACHE[n];
  }

  /* Which of the twelve-cornered mesh a direction falls into, as a signed
     margin: positive inside, negative outside, and the size of it says how
     far. Taking the largest margin rather than the first non-negative one
     keeps the descent on the rails when a direction lands exactly on an edge,
     where all three products are zero to within rounding. */
  function triMargin(dir, base, ia, ib, ic) {
    var m = Infinity, i, j, k, ax, ay, az, bx, by, bz, s;
    var v = [ia * 3, ib * 3, ic * 3];
    for (i = 0; i < 3; i++) {
      j = v[i]; k = v[(i + 1) % 3];
      ax = base[j]; ay = base[j + 1]; az = base[j + 2];
      bx = base[k]; by = base[k + 1]; bz = base[k + 2];
      s = dir[0] * (ay * bz - az * by) + dir[1] * (az * bx - ax * bz) + dir[2] * (ax * by - ay * bx);
      if (s < m) m = s;
    }
    return m;
  }

  /* Build the map once per rock. Takes what buildAsteroid returns (or any
     object with positions, indices, normals and optionally axes), and keeps
     only what a point query needs. Throws on a mesh that is not a subdivided
     icosphere, because the descent would otherwise walk into nonsense. */
  function radiusMap(built) {
    var tris = built.indices.length / 3;
    var n = Math.round(Math.log(tris / 20) / Math.log(4));
    if (!(n >= 0) || n > 6 || 20 * Math.pow(4, n) !== tris) {
      throw new Error('Asteroid.radiusMap: not a subdivided icosphere (' + tris + ' triangles)');
    }
    var base = icosphere(n).positions;
    var ax = built.axes || [1, 1, 1];
    var pos = built.positions;
    var nv = pos.length / 3;
    var r = new Float64Array(nv);
    for (var i = 0; i < nv; i++) {
      var x = pos[i * 3] / ax[0], y = pos[i * 3 + 1] / ax[1], z = pos[i * 3 + 2] / ax[2];
      r[i] = Math.sqrt(x * x + y * y + z * z);
    }
    var normals = built.normals || recomputeNormals(built.positions, built.indices);
    var rMax = built.rMax;
    if (rMax == null) {
      rMax = 0;
      for (i = 0; i < nv; i++) {
        var px = pos[i * 3], py = pos[i * 3 + 1], pz = pos[i * 3 + 2];
        var d = Math.sqrt(px * px + py * py + pz * pz);
        if (d > rMax) rMax = d;
      }
    }
    return {
      subdiv: n, base: base, levels: levelsFor(n), r: r,
      normals: normals, axes: [ax[0], ax[1], ax[2]], rMax: rMax
    };
  }

  /* The leaf triangle a unit direction falls into, plus where the ray meets
     it. t is the radius in the UNSCALED space, the barycentric weights come
     from the same intersection and are reused for the normal. */
  function rayHit(map, dir) {
    var base = map.base, levels = map.levels, L = levels.length;
    var tri = 0, best = -Infinity, j, m, c;
    var lvl0 = levels[0];
    for (j = 0; j < 20; j++) {
      m = triMargin(dir, base, lvl0[j * 3], lvl0[j * 3 + 1], lvl0[j * 3 + 2]);
      if (m > best) { best = m; tri = j; }
    }
    for (var k = 1; k < L; k++) {
      var lv = levels[k];
      best = -Infinity;
      var pick = tri * 4;
      for (j = 0; j < 4; j++) {
        c = tri * 4 + j;
        m = triMargin(dir, base, lv[c * 3], lv[c * 3 + 1], lv[c * 3 + 2]);
        if (m > best) { best = m; pick = c; }
      }
      tri = pick;
    }
    var top = levels[L - 1];
    var i0 = top[tri * 3], i1 = top[tri * 3 + 1], i2 = top[tri * 3 + 2];
    /* The unscaled surface triangle, which is the drawn one divided by the
       axis factors. */
    var V = [i0, i1, i2].map(function (ii) {
      var d = map.r[ii];
      return [base[ii * 3] * d, base[ii * 3 + 1] * d, base[ii * 3 + 2] * d];
    });
    var e1 = [V[1][0] - V[0][0], V[1][1] - V[0][1], V[1][2] - V[0][2]];
    var e2 = [V[2][0] - V[0][0], V[2][1] - V[0][1], V[2][2] - V[0][2]];
    var nx = e1[1] * e2[2] - e1[2] * e2[1];
    var ny = e1[2] * e2[0] - e1[0] * e2[2];
    var nz = e1[0] * e2[1] - e1[1] * e2[0];
    var den = dir[0] * nx + dir[1] * ny + dir[2] * nz;
    var num = V[0][0] * nx + V[0][1] * ny + V[0][2] * nz;
    /* A ray from the centre can only miss the plane of its own leaf triangle
       if the triangle is degenerate. Falling back on the vertex radii keeps a
       pathological rock from returning NaN into the integrator, where it
       would be permanent. */
    var t = Math.abs(den) < 1e-12 ? (map.r[i0] + map.r[i1] + map.r[i2]) / 3 : num / den;
    /* Barycentric weights of the hit point, by area ratios in the plane. */
    var P = [dir[0] * t - V[0][0], dir[1] * t - V[0][1], dir[2] * t - V[0][2]];
    var d11 = e1[0] * e1[0] + e1[1] * e1[1] + e1[2] * e1[2];
    var d12 = e1[0] * e2[0] + e1[1] * e2[1] + e1[2] * e2[2];
    var d22 = e2[0] * e2[0] + e2[1] * e2[1] + e2[2] * e2[2];
    var dp1 = P[0] * e1[0] + P[1] * e1[1] + P[2] * e1[2];
    var dp2 = P[0] * e2[0] + P[1] * e2[1] + P[2] * e2[2];
    var dd = d11 * d22 - d12 * d12;
    var b1 = 0, b2 = 0;
    if (Math.abs(dd) > 1e-20) {
      b1 = (d22 * dp1 - d12 * dp2) / dd;
      b2 = (d11 * dp2 - d12 * dp1) / dd;
    }
    return { t: t, i: [i0, i1, i2], w: [1 - b1 - b2, b1, b2] };
  }

  function norm3(v) {
    var d = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
    if (!(d > 0)) return [0, 0, 1];
    return [v[0] / d, v[1] / d, v[2] / d];
  }

  /* Surface radius along a direction, in the rock's own drawn frame. The
     direction need not be normalised. */
  function radiusAt(map, dir) {
    var a = map.axes;
    var u = norm3([dir[0] / a[0], dir[1] / a[1], dir[2] / a[2]]);
    var h = rayHit(map, u);
    /* Back into drawn units: the surface point is h.t * u unscaled, and
       scaling it by the axis factors is what the eye sees. */
    var s = [h.t * u[0] * a[0], h.t * u[1] * a[1], h.t * u[2] * a[2]];
    return Math.sqrt(s[0] * s[0] + s[1] * s[1] + s[2] * s[2]);
  }

  /* The point query the contact solver asks: p in the rock's own frame,
     answer null when outside, otherwise how deep it is and which way out.
     The depth is measured along the normal, not along the ray, because that
     is the quantity the positional correction wants.

     The normal is interpolated from the DRAWN vertex normals with weights
     taken on the unscaled triangle, which is exact: a linear map leaves
     barycentric coordinates alone. Using the ray direction instead would be
     the cheap version and would be wrong everywhere it matters, on every
     crater rim and every bowl wall. */
  function contactAt(map, p) {
    var a = map.axes;
    var u = [p[0] / a[0], p[1] / a[1], p[2] / a[2]];
    var lu = Math.sqrt(u[0] * u[0] + u[1] * u[1] + u[2] * u[2]);
    var dir = lu > 1e-9 ? [u[0] / lu, u[1] / lu, u[2] / lu] : [0, 0, 1];
    var h = rayHit(map, dir);
    if (lu >= h.t) return null;
    var nm = map.normals, i = h.i, w = h.w;
    var n = norm3([
      nm[i[0] * 3] * w[0] + nm[i[1] * 3] * w[1] + nm[i[2] * 3] * w[2],
      nm[i[0] * 3 + 1] * w[0] + nm[i[1] * 3 + 1] * w[1] + nm[i[2] * 3 + 1] * w[2],
      nm[i[0] * 3 + 2] * w[0] + nm[i[1] * 3 + 2] * w[1] + nm[i[2] * 3 + 2] * w[2]
    ]);
    /* Surface point and query point are parallel in the drawn frame, both
       being multiples of the scaled direction, so the gap along the normal is
       one dot product. At the very centre there is no direction to speak of
       and the ray depth is the honest answer. */
    var f = lu > 1e-9 ? h.t / lu - 1 : 0;
    var pen = lu > 1e-9 ? f * (p[0] * n[0] + p[1] * n[1] + p[2] * n[2]) : h.t;
    if (!(pen > 0)) pen = 1e-9;
    return { pen: pen, n: n };
  }

  /* ------------------------------------------------------------------ *
   * 9. Entry point
   * ------------------------------------------------------------------ */

  function now() {
    return (typeof performance !== 'undefined' && performance && performance.now)
      ? performance.now() : Date.now();
  }

  function buildAsteroid(params) {
    var t0 = now();
    var p = clampParams(params);
    if (p.route === 'sdf') {
      throw new Error('Asteroid.buildAsteroid: route "sdf" is not implemented yet. ' +
        'Only route "ico" (a displaced icosphere) exists in this step.');
    }
    var base = icosphere(p.subdiv);
    var d = displace(base, p);
    var normals = recomputeNormals(d.positions, d.indices);
    return {
      positions: d.positions,
      indices: d.indices,
      normals: normals,
      rMin: d.rMin,
      rMax: d.rMax,
      axes: d.axes,
      tris: d.indices.length / 3,
      params: p,
      ms: now() - t0
    };
  }

  globalThis.Asteroid = {
    mulberry32: mulberry32,
    stream: stream,
    hash3: hash3,
    perlin3: perlin3,
    fbm3: fbm3,
    ridge: ridge,
    NOISE_KINDS: NOISE_KINDS,
    icosphere: icosphere,
    craterList: craterList,
    displace: displace,
    recomputeNormals: recomputeNormals,
    faceNormals: faceNormals,
    edgeTable: edgeTable,
    meshStats: meshStats,
    radiusMap: radiusMap,
    radiusAt: radiusAt,
    contactAt: contactAt,
    buildAsteroid: buildAsteroid,
    clampParams: clampParams,
    DEFAULTS: DEFAULTS,
    RANGES: RANGES
  };
})();
