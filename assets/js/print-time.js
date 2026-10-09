/* print-time.js: a print-time and filament estimate for a mesh, as Bambu
   Studio would give it for a Bambu Lab A1. Moved out of the Trophy Sculptor
   (2026-10-09) so the Sign Maker can use it too; the constants are still the
   ones fitted to trophies there (notes/tools/trophy/fit2.mjs).

   PrintTime.printFeatures(mesh)            -> features F of an indexed mesh
     ({ positions: Float32Array, indices: Uint32Array }, z up, mm)
   PrintTime.printEstimate([F], nozzle, filament, infill)
                                            -> { parts: [{ seconds, grams }], seconds, grams }
   PrintTime.printLines / printTime / printScale, PRINT_NOZZLE, PRINT_FILAMENT,
   PRINT_K, PRINT_PCT: the pieces, for the calibration scripts.
   Plain script: works in a page, in a worker via importScripts, and in Node
   via eval. */
(function (root) {
  'use strict';

  /* What a slicer sees of a mesh, on a fixed 0.1 mm raster in z, so any
     layer height can be binned from it later. At each sample height the mesh
     is cut: every triangle crossing it gives one segment of the outline, and
     the segments add up to the perimeter and, by the shoelace formula, to the
     cross-section's area. The perimeter is also split by how far its face
     leans out below it (tangent of the lean, in quarters up to 3, the rest
     above), which is what makes a slicer slow down for overhangs. Upward and
     downward faces are collected as horizontal area per bin, the top and
     bottom skins. Every millimetre the outline's closed loops are counted,
     islands and holes alike, by joining segments that share a mesh edge:
     each loop is a travel move and a retraction. At the same heights each
     segment casts a ray inwards to the far side of the solid, and the
     perimeter is binned by that thickness (0.2 mm steps to 6 mm, the last
     bin is anything thicker): a wall narrower than two lines is not drawn as
     walls at all but as one line down its middle. */
  var PF_DZ = 0.1, PF_BINS = 13, PF_LOOP = 10, PF_TSTEP = 0.2, PF_TB = 31;
  function printFeatures(mesh) {
    var p = mesh.positions, I = mesh.indices, z0 = Infinity, z1 = -Infinity;
    for (var i = 2; i < p.length; i += 3) { if (p[i] < z0) z0 = p[i]; if (p[i] > z1) z1 = p[i]; }
    var n = Math.max(1, Math.ceil((z1 - z0) / PF_DZ));
    var per = new Float32Array(n), area = new Float32Array(n), up = new Float32Array(n), down = new Float32Array(n);
    var lean = new Float32Array(n * PF_BINS), loops = new Float32Array(n), nv = p.length / 3, seg = [];
    var geo = [], nq = Math.ceil(n / PF_LOOP), thick = new Float32Array(nq * PF_TB);
    for (var q = 0; q < n; q += PF_LOOP) { seg[q] = []; geo[q] = []; }
    for (var t = 0; t < I.length; t += 3) {
      var a = 3 * I[t], b = 3 * I[t + 1], c = 3 * I[t + 2];
      var ax = p[a], ay = p[a + 1], az = p[a + 2], bx = p[b], by = p[b + 1], bz = p[b + 2], cx = p[c], cy = p[c + 1], cz = p[c + 2];
      var ux = bx - ax, uy = by - ay, uz = bz - az, vx = cx - ax, vy = cy - ay, vz = cz - az;
      var nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, nl = Math.sqrt(nx * nx + ny * ny + nz * nz);
      if (!(nl > 0)) continue;
      // horizontal area of the face, to the bin of its centre
      var kc = Math.min(n - 1, Math.max(0, Math.floor(((az + bz + cz) / 3 - z0) / PF_DZ)));
      if (nz > 0) up[kc] += nz / 2; else down[kc] -= nz / 2;
      var zl = Math.min(az, bz, cz), zh = Math.max(az, bz, cz);
      var k0 = Math.max(0, Math.ceil((zl - z0) / PF_DZ - 0.5)), k1 = Math.min(n - 1, Math.floor((zh - z0) / PF_DZ - 0.5));
      if (k1 < k0) continue;
      // lean of a downward face from vertical, as its tangent
      var hz = Math.sqrt(nx * nx + ny * ny), tn = nz < 0 && hz > 0 ? -nz / hz : 0;
      var bin = nz < 0 ? (hz > 0 ? Math.min(PF_BINS - 1, Math.floor(tn * 4)) : PF_BINS - 1) : 0;
      for (var k = k0; k <= k1; k++) {
        var z = z0 + (k + 0.5) * PF_DZ;
        // the two points where the plane cuts the triangle's edges
        var px = [], py = [], ek = [];
        var e = [[ax, ay, az, bx, by, bz], [bx, by, bz, cx, cy, cz], [cx, cy, cz, ax, ay, az]], vi = [I[t], I[t + 1], I[t + 2]];
        for (var j = 0; j < 3; j++) {
          var E = e[j];
          if ((E[2] < z) !== (E[5] < z)) { var s = (z - E[2]) / (E[5] - E[2]); px.push(E[0] + s * (E[3] - E[0])); py.push(E[1] + s * (E[4] - E[1])); var v0 = vi[j], v1 = vi[(j + 1) % 3]; ek.push(v0 < v1 ? v0 * nv + v1 : v1 * nv + v0); }
        }
        if (px.length !== 2) continue;
        var dx = px[1] - px[0], dy = py[1] - py[0], len = Math.sqrt(dx * dx + dy * dy);
        if (seg[k]) { seg[k].push(ek[0], ek[1]); if (hz > 0) geo[k].push(px[0], py[0], px[1], py[1], -nx / hz, -ny / hz); }
        per[k] += len;
        lean[k * PF_BINS + bin] += len;
        // shoelace, the segment oriented so the solid lies to its left: (dx, dy) × up points along the outward normal
        area[k] += (dx * ny - dy * nx > 0 ? -1 : 1) * (px[0] * py[1] - px[1] * py[0]) / 2;
      }
    }
    // loops per sampled height by union-find over the cut edges, held until the next sample
    for (var q2 = 0; q2 < n; q2 += PF_LOOP) {
      var S = seg[q2], id = new Map(), par = [], cnt = 0;
      var find = function (x) { while (par[x] !== x) { par[x] = par[par[x]]; x = par[x]; } return x; };
      for (var m = 0; m < S.length; m++) if (!id.has(S[m])) { id.set(S[m], par.length); par.push(par.length); cnt++; }
      for (var m2 = 0; m2 < S.length; m2 += 2) { var ra = find(id.get(S[m2])), rb = find(id.get(S[m2 + 1])); if (ra !== rb) { par[ra] = rb; cnt--; } }
      for (var m3 = q2; m3 < Math.min(n, q2 + PF_LOOP); m3++) loops[m3] = cnt;
      wallThickness(geo[q2], thick, (q2 / PF_LOOP) * PF_TB);
    }
    return { dz: PF_DZ, z0: z0, n: n, bins: PF_BINS, per: per, area: area, up: up, down: down, lean: lean, loops: loops,
      loop: PF_LOOP, thick: thick, tb: PF_TB, tstep: PF_TSTEP };
  }

  /* The thickness histogram of one cut: segments (x0, y0, x1, y1, inward
     normal) go into a 1 mm hash, and each casts a ray from its middle along
     the normal, stepping cell by cell until a hit nearer than the cells
     still ahead. Its length goes to the bin of the distance to that hit. */
  function wallThickness(G, out, o) {
    var m = G.length / 6, C = 1, cells = new Map(), tmax = (PF_TB - 1) * PF_TSTEP;
    var key = function (ix, iy) { return (ix + 32768) * 65536 + iy + 32768; };
    for (var i = 0; i < m; i++) {
      var g = 6 * i, xa = Math.floor(Math.min(G[g], G[g + 2]) / C), xb = Math.floor(Math.max(G[g], G[g + 2]) / C);
      var ya = Math.floor(Math.min(G[g + 1], G[g + 3]) / C), yb = Math.floor(Math.max(G[g + 1], G[g + 3]) / C);
      for (var ix = xa; ix <= xb; ix++) for (var iy = ya; iy <= yb; iy++) {
        var kk = key(ix, iy), l = cells.get(kk);
        if (l) l.push(i); else cells.set(kk, [i]);
      }
    }
    for (var i2 = 0; i2 < m; i2++) {
      var h = 6 * i2, ex = G[h + 2] - G[h], ey = G[h + 3] - G[h + 1], len = Math.sqrt(ex * ex + ey * ey);
      var mx = (G[h] + G[h + 2]) / 2, my = (G[h + 1] + G[h + 3]) / 2, rx = G[h + 4], ry = G[h + 5], best = Infinity, last = -1;
      for (var d = 0; d <= tmax + C; d += C / 2) {
        if (best < d - C) break;
        var kc = key(Math.floor((mx + rx * d) / C), Math.floor((my + ry * d) / C));
        if (kc === last) continue;
        last = kc;
        var L = cells.get(kc);
        if (!L) continue;
        for (var j = 0; j < L.length; j++) {
          if (L[j] === i2) continue;
          var f = 6 * L[j], sx = G[f + 2] - G[f], sy = G[f + 3] - G[f + 1];
          var den = rx * sy - ry * sx;
          if (Math.abs(den) < 1e-12) continue;
          var qx = G[f] - mx, qy = G[f + 1] - my, t = (qx * sy - qy * sx) / den, u = (qx * ry - qy * rx) / den;
          if (t > 1e-4 && u >= 0 && u <= 1 && t < best) best = t;
        }
      }
      out[o + Math.min(PF_TB - 1, Math.floor(best / PF_TSTEP))] += len;
    }
  }

  /* Bambu Lab A1, standard process profile per nozzle, values from Bambu
     Studio's system profiles (2026-09): layer height h, line width w, wall
     loops, top and bottom shells (the top at least topMin mm), sparse infill
     share (the tool sets its own, and the constants below are fitted to cubic
     infill, not the profile's grid), speeds in mm/s for outer and inner wall,
     sparse and solid infill, and the overhang speeds by quarter of a line
     width hanging out (0: none). */
  var PRINT_NOZZLE = {
    '0.4': { h: 0.2, w: 0.42, wi: 0.45, walls: 2, top: 5, topMin: 1.0, bottom: 3, infill: 0.15, outer: 200, inner: 300, sparse: 270, solid: 250, gap: 250, over: [0, 50, 30, 10, 10] },
    '0.6': { h: 0.3, w: 0.62, wi: 0.62, walls: 2, top: 3, topMin: 0.8, bottom: 3, infill: 0.15, outer: 120, inner: 150, sparse: 100, solid: 150, gap: 50, over: [0, 50, 15, 10, 10] },
    '0.8': { h: 0.4, w: 0.82, wi: 0.82, walls: 2, top: 3, topMin: 0.8, bottom: 3, infill: 0.15, outer: 120, inner: 150, sparse: 100, solid: 150, gap: 50, over: [0, 50, 25, 5, 10] }
  };
  // Generic PLA and Generic PLA Silk: most volume per second (mm³/s), density, and the shortest a layer may take before the fan slows it
  var PRINT_FILAMENT = {
    pla: { q: 12, rho: 1.24, layerTime: 8 },
    silk: { q: 7.5, rho: 1.24, layerTime: 8 }
  };

  /* The line work of each layer, before any speed: length of the outer
     wall (and how much of it hangs out by which quarter of a line), of the
     inner walls, of solid infill, sparse infill and gap fill, and the
     number of closed loops in the outline. Each stretch of perimeter gets
     as many wall loops as the thickness behind it holds; what is left of a
     narrow strip is one gap line, what the walls leave of a wide section is
     solid infill under a top or over a bottom, sparse elsewhere, at the
     given density (the profile's if none). Volume in mm³ uses the slicer's
     line section, a rectangle with round ends. */
  function printLines(F, nozzle, infill) {
    var N = PRINT_NOZZLE[nozzle], h = N.h, w = N.w, wi = N.wi, dens = infill == null ? N.infill : infill;
    var xs = (w - h) * h + Math.PI * h * h / 4, xsi = (wi - h) * h + Math.PI * h * h / 4;
    var nl = Math.max(1, Math.round(F.n * F.dz / h));
    var nt = Math.max(N.top, Math.ceil(N.topMin / h - 1e-9)), nb = N.bottom;
    // prefix sums of the upward and downward areas, to take any window of them
    var cu = new Float64Array(F.n + 1), cd = new Float64Array(F.n + 1);
    for (var i = 0; i < F.n; i++) { cu[i + 1] = cu[i] + F.up[i]; cd[i + 1] = cd[i] + F.down[i]; }
    var at = function (z) { return Math.min(F.n, Math.max(0, Math.round(z / F.dz))); };
    var L = [], volume = 0;
    for (var k = 0; k < nl; k++) {
      var zm = (k + 0.5) * h, s = Math.min(F.n - 1, Math.floor(zm / F.dz));
      var P = F.per[s], A = Math.max(0, F.area[s]);
      if (!(A > 1e-6) || !(P > 0)) continue;
      // walls by the thickness they stand in: as many loops as fit, a line down the middle of what is left if narrower than two lines
      var hq = F.tb * Math.min(F.thick.length / F.tb - 1, Math.floor(s / F.loop)), H = 0;
      for (var tb = 0; tb < F.tb; tb++) H += F.thick[hq + tb];
      var lo = 0, li = 0, lg = 0, used = 0;
      for (var tb2 = 0; tb2 < F.tb; tb2++) {
        var part = H > 0 ? P * F.thick[hq + tb2] / H : (tb2 === F.tb - 1 ? P : 0);
        if (!part) continue;
        var th = tb2 === F.tb - 1 ? Infinity : (tb2 + 0.5) * F.tstep, nw = 0, band = 0;
        while (nw < N.walls && th >= 1.8 * (w + nw * wi)) nw++;
        if (nw) { lo += part; li += part * (nw - 1); band = w + (nw - 1) * wi; }
        var left = th - 2 * band;
        if (left < 2 * wi) {
          // the whole strip is taken: walls and, if there is room for it, one gap line
          if (left > 0.2 * w) lg += part / 2;
          used += part * th / 2;
        } else used += part * band;
      }
      var rest = Math.max(0, A - used), ld = 0, ls = 0;
      if (rest < P * w) { lg += rest / wi; rest = 0; }
      if (rest > 0) {
        var skin = cu[at(zm + h / 2 + nt * h)] - cu[at(zm + h / 2)] + cd[at(zm - h / 2)] - cd[at(zm - h / 2 - nb * h)];
        var solid = Math.min(rest, skin);
        ld = solid / w; ls = (rest - solid) * dens / wi;
      }
      // a face leaning by t hangs h tan t of the line out over the one below
      var over = [0, 0, 0, 0, 0], share = lo / P;
      for (var b = 1; b < F.bins; b++) over[Math.min(4, Math.floor(h * (b + 0.5) / w))] += F.lean[s * F.bins + b] * share;
      L.push({ lo: lo, li: li, ld: ld, ls: ls, lg: lg, over: over, loops: F.loops[s] });
      volume += (lo + ld) * xs + (li + ls + lg) * xsi;
    }
    return { layers: L, count: nl, volume: volume };
  }

  /* Seconds for those lines. Every speed is capped by the filament's volume
     per second; speeding up and slowing down at the ends and bends of the
     lines costs v/acc per mm on top of 1/v, acc being a fitted mm²/s².
     Overhangs slow the outer wall to the profile's speeds. Travel and
     retraction cost a toll per layer and per loop. A layer shorter than
     the filament's layer time is slowed to it, but not below 20 mm/s. */
  // fitted 2026-09-27 to 306 slices in Bambu Studio 2.4 with cubic infill at 10, 15 and 25 %
  // (notes/tools/trophy/fit2.mjs): 7.3 % standard deviation, leaving each trophy out
  var PRINT_K = { acc: 29600, layer: 0, loop: 0.227, fixed: -38 };
  // the 20th, 50th and 80th percentile of the slicer's time over this estimate, from the same fit
  var PRINT_PCT = [0.93, 0.99, 1.05];
  function printTime(lines, nozzle, filament, K) {
    K = K || PRINT_K;
    var N = PRINT_NOZZLE[nozzle], M = typeof filament === 'string' ? PRINT_FILAMENT[filament] : filament, h = N.h;
    var cap = M.q / (N.w * h), capI = M.q / (N.wi * h);
    var pace = function (v) { return 1 / v + v / K.acc; };
    var po = pace(Math.min(N.outer, cap)), pi = pace(Math.min(N.inner, capI)), pd = pace(Math.min(N.solid, cap));
    var ps = pace(Math.min(N.sparse, capI)), pg = pace(Math.min(N.gap, capI));
    var total = K.fixed, parts = { wall: 0, infill: 0, travel: 0, slow: 0 };
    for (var k = 0; k < lines.layers.length; k++) {
      var r = lines.layers[k];
      var tw = r.lo * po + r.li * pi, vo = Math.min(N.outer, cap);
      for (var q = 1; q < 5; q++) if (r.over[q] && N.over[q] && N.over[q] < vo) tw += r.over[q] * (pace(N.over[q]) - po);
      var tf = r.ld * pd + r.ls * ps + r.lg * pg, tt = K.layer + K.loop * r.loops;
      var t = tw + tf + tt, len = r.lo + r.li + r.ld + r.ls + r.lg;
      var slow = Math.max(0, Math.min(M.layerTime, tt + len / 20) - t);
      parts.wall += tw; parts.infill += tf; parts.travel += tt; parts.slow += slow;
      total += t + slow;
    }
    parts.total = total;
    return parts;
  }

  /* The same piece's features scaled by s in every direction, for the
     exponent of the time over the height. On the 0.1 mm raster a slice
     takes the one at z / s; lengths grow with s, areas with s², the loops
     stay. Upward and downward areas are totals per bin, so each moves to its
     new bin whole, times s². */
  function printScale(F, s) {
    var n = Math.max(1, Math.round(F.n * s)), per = new Float32Array(n), area = new Float32Array(n), loops = new Float32Array(n);
    var up = new Float32Array(n), down = new Float32Array(n), lean = new Float32Array(n * F.bins);
    for (var k = 0; k < n; k++) {
      var i = Math.min(F.n - 1, Math.floor((k + 0.5) / s));
      per[k] = F.per[i] * s; area[k] = F.area[i] * s * s; loops[k] = F.loops[i];
      for (var b = 0; b < F.bins; b++) lean[k * F.bins + b] = F.lean[i * F.bins + b] * s;
    }
    for (var j = 0; j < F.n; j++) {
      var kk = Math.min(n - 1, Math.floor((j + 0.5) * s));
      up[kk] += F.up[j] * s * s; down[kk] += F.down[j] * s * s;
    }
    // thickness histograms: each sample from the one at z / s, each bin to the bin of its thickness times s
    var nq = Math.ceil(n / F.loop), thick = new Float32Array(nq * F.tb), nq0 = F.thick.length / F.tb;
    for (var q = 0; q < nq; q++) {
      var q0 = Math.min(nq0 - 1, Math.floor((q + 0.5) / s));
      for (var t = 0; t < F.tb; t++) {
        var tt = t === F.tb - 1 ? F.tb - 1 : Math.min(F.tb - 1, Math.floor((t + 0.5) * s));
        thick[q * F.tb + tt] += F.thick[q0 * F.tb + t];
      }
    }
    return { dz: F.dz, z0: F.z0 * s, n: n, bins: F.bins, per: per, area: area, up: up, down: down, lean: lean, loops: loops,
      loop: F.loop, thick: thick, tb: F.tb, tstep: F.tstep };
  }

  /* Time and filament for the printed parts, each its own print job. */
  function printEstimate(features, nozzle, filament, infill) {
    var M = typeof filament === 'string' ? PRINT_FILAMENT[filament] : filament, out = { parts: [], seconds: 0, grams: 0 };
    features.forEach(function (F) {
      var L = printLines(F, nozzle, infill), s = printTime(L, nozzle, M).total, g = L.volume * M.rho / 1000;
      out.parts.push({ seconds: s, grams: g });
      out.seconds += s; out.grams += g;
    });
    return out;
  }

  root.PrintTime = {
    printFeatures: printFeatures, printLines: printLines, printTime: printTime, printScale: printScale, printEstimate: printEstimate,
    PRINT_NOZZLE: PRINT_NOZZLE, PRINT_FILAMENT: PRINT_FILAMENT, PRINT_K: PRINT_K, PRINT_PCT: PRINT_PCT
  };
})(typeof self !== 'undefined' ? self : globalThis);
