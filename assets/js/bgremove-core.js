/* bgremove-core.js -- classic (non-neural) background removal for alber.me tools.
 *
 * Built for photos and scans on a white, near-white or otherwise single-coloured
 * background. Stage 1 of the vectorizer reuses it, so this is a standalone
 * module: plain script, no imports, no DOM, no canvas, no ImageData constructor.
 * Everything hangs off globalThis.BgCore, which makes it loadable both with
 * <script src> in the page and by eval in the Node tests.
 *
 * Images are plain objects { width, height, data } where data is RGBA, one byte
 * (or one float, for the intermediate flattened image) per channel. A browser
 * ImageData satisfies that shape. Every function is pure and deterministic: no
 * Date.now, no Math.random, no mutation of the input.
 *
 * Public API
 *   BgCore.estimateBgColor(img)        -> [r, g, b], per-channel median of a 2px border ring
 *   BgCore.buildBgModel(samples)       -> model or null, from an array of [r,g,b] triples
 *   BgCore.removeBackground(img, opts) -> { width, height, data: Uint8ClampedArray }
 *   BgCore.version                     -> 1
 *
 * A model describes a background the user sampled with a stroke, the way
 * Resolve does it: up to 8 cluster centers instead of one colour. It carries
 * { k, centersRgb, centersLab, counts, samples }; centersRgb is what the UI
 * shows as swatches. An empty or unusable sample list yields null, and a null
 * or absent model simply means "use opts.bg" further down.
 *
 * opts (all optional):
 *   bgModel    model or null    beats bg when present; distance is then the
 *              minimum over the model's centers
 *   bg         [r,g,b] or null   background colour, null = estimateBgColor
 *   mode       'edges' | 'global'  'edges' (default) floods in from the image
 *              border, so background-coloured areas enclosed by foreground
 *              survive; 'global' removes every matching pixel.
 *   tolerance  0..1, default 0.12   euclidean distance in OKLab
 *   flatten    px radius, 0 = off   uneven-lighting correction for scans
 *   softEdges  boolean, default true  fractional alpha plus colour unmixing
 *   despeckle  min area in px, default 0
 *   expand     px, signed, default 0  grow (+) or shrink (-) the subject
 *   smooth     px, default 0       straighten a jagged contour, edge stays crisp
 *   feather    px, default 0       box blur on the final alpha
 *
 * The alpha passes run in the order despeckle, expand, smooth, feather. They
 * touch the alpha only. Colours follow the alpha as it stood before those
 * passes, so a pixel that was pure background shows its original colour once
 * expand turns it opaque, and only a genuine subject/background mix carries an
 * unmixed colour.
 *
 * Helpers are exported as well, for the tests and for the vectorizer:
 *   srgbToOklab, dist2, toLabPlane, distanceField, globalMask, floodMask,
 *   backgroundField, flattenImage, despeckle, boxBlur, expandAlpha, smoothAlpha,
 *   featherAlpha.
 * globalMask and floodMask take either one [L,a,b] triple or a list of them.
 *
 * Two things worth knowing before changing anything here:
 *
 * 1. The soft-edge ramp lives strictly INSIDE the mask. Growing the flood uses
 *    the hard tolerance; a pixel outside the mask is opaque, full stop. If the
 *    ramp were allowed to grow the flooded region, a gradient running from the
 *    background into a dark object would let the fill leak through the
 *    anti-aliased rim and eat the object from inside.
 * 2. flatten is a rolling-ball style estimate: a per-channel morphological
 *    closing of the given radius, smoothed by a box blur, then divided out and
 *    renormalised to the estimated background colour. Like every rolling ball it
 *    needs a radius larger than the foreground features; an object much thicker
 *    than 4x the radius gets a background field sampled from its own interior.
 *    In the default 'edges' mode that stays harmless, because the object's
 *    correctly dark rim blocks the flood. flatten is skipped entirely while a
 *    bgModel is active, see the note at the pipeline.
 */
(function () {
  'use strict';

  var VERSION = 1;

  /* Soft alpha ramps from 0 at SOFT_FLOOR * tolerance to 1 at the tolerance.
     Without that dead zone every speck of sensor noise or leftover of the
     flatten step would come out at alpha 5 to 40 instead of gone, which reads
     as a grubby ghost of the background. A quarter of the tolerance is small
     enough that real shadows still keep their gradation. */
  var SOFT_FLOOR = 0.25;

  /* ---------------------------------------------------------------- colour */

  /* sRGB transfer function as an interpolated table: the flattened working
     image carries fractional channel values, so a 256-entry integer LUT would
     quantise exactly where the flatten path needs precision. */
  var LUT_N = 1024;
  var LIN = new Float64Array(LUT_N);
  for (var _i = 0; _i < LUT_N; _i++) {
    var _c = _i / (LUT_N - 1);
    LIN[_i] = _c <= 0.04045 ? _c / 12.92 : Math.pow((_c + 0.055) / 1.055, 2.4);
  }

  function linearize(v) {
    if (!(v > 0)) return 0;
    if (v >= 255) return 1;
    var t = v * (LUT_N - 1) / 255;
    var i = t | 0;
    return LIN[i] + (LIN[i + 1] - LIN[i]) * (t - i);
  }

  var LAB_TMP = [0, 0, 0];

  function oklab(r, g, b, out) {
    var R = linearize(r), G = linearize(g), B = linearize(b);
    var l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
    var m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
    var s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
    out[0] = 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s;
    out[1] = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s;
    out[2] = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s;
    return out;
  }

  /* r, g, b in 0..255 (fractional allowed). */
  function srgbToOklab(r, g, b) {
    return oklab(r, g, b, [0, 0, 0]);
  }

  function dist2(a, b) {
    var dl = a[0] - b[0], da = a[1] - b[1], db = a[2] - b[2];
    return dl * dl + da * da + db * db;
  }

  /* Float32Array of 3 * width * height, L a b per pixel, alpha ignored. */
  function toLabPlane(img) {
    var w = img.width | 0, h = img.height | 0, n = w * h, d = img.data;
    var out = new Float32Array(n * 3);
    for (var i = 0, k = 0, j = 0; i < n; i++, k += 4, j += 3) {
      oklab(d[k], d[k + 1], d[k + 2], LAB_TMP);
      out[j] = LAB_TMP[0];
      out[j + 1] = LAB_TMP[1];
      out[j + 2] = LAB_TMP[2];
    }
    return out;
  }

  /* ------------------------------------------------------- background colour */

  function median(arr) {
    arr.sort(function (a, b) { return a - b; });
    var n = arr.length;
    if (n === 0) return 0;
    return n % 2 ? arr[(n - 1) >> 1] : 0.5 * (arr[n / 2 - 1] + arr[n / 2]);
  }

  function estimateBgColor(img) {
    var w = img.width | 0, h = img.height | 0, d = img.data;
    if (w <= 0 || h <= 0) return [255, 255, 255];
    var t = Math.min(2, Math.max(1, Math.floor(Math.min(w, h) / 2)));
    var R = [], G = [], B = [];
    for (var y = 0; y < h; y++) {
      var edgeRow = y < t || y >= h - t;
      for (var x = 0; x < w; x++) {
        if (!edgeRow && x >= t && x < w - t) { x = w - t - 1; continue; }
        var k = (y * w + x) * 4;
        R.push(d[k]); G.push(d[k + 1]); B.push(d[k + 2]);
      }
    }
    return [median(R), median(G), median(B)];
  }

  /* ------------------------------------------------- sampled background model

     A painted stroke across the background yields a cloud of colours rather
     than one colour, so the model keeps up to MAX_CENTERS cluster centers and
     every distance below is the minimum over them.

     The clustering is a small weighted k-means over the DISTINCT sample colours
     (a Map in insertion order, so the outcome never depends on hashing), seeded
     by farthest point from the first sample. No randomness anywhere: same
     samples in, same model out, bit for bit. Centers that end up closer than
     MERGE_D to each other are merged again, because eight swatches of the same
     white tell the user nothing. */

  var MAX_CENTERS = 8;
  var MERGE_D = 0.02;      /* OKLab, about the gap between grey 248 and white */
  var MAX_SAMPLES = 20000;

  function buildBgModel(samples) {
    if (!samples || !samples.length) return null;
    var stride = Math.max(1, Math.ceil(samples.length / MAX_SAMPLES));
    var seen = Object.create(null), rgb = [], weight = [], total = 0;
    for (var si = 0; si < samples.length; si += stride) {
      var s = samples[si];
      if (!s || s.length < 3) continue;
      var r = +s[0], g = +s[1], b = +s[2];
      if (!(r === r) || !(g === g) || !(b === b)) continue;
      r = Math.round(r < 0 ? 0 : r > 255 ? 255 : r);
      g = Math.round(g < 0 ? 0 : g > 255 ? 255 : g);
      b = Math.round(b < 0 ? 0 : b > 255 ? 255 : b);
      var key = r + ',' + g + ',' + b, at = seen[key];
      if (at === undefined) { seen[key] = rgb.length; rgb.push([r, g, b]); weight.push(1); }
      else weight[at]++;
      total++;
    }
    var m = rgb.length;
    if (!m) return null;

    var lab = new Float64Array(m * 3), t3 = [0, 0, 0];
    for (var i = 0; i < m; i++) {
      oklab(rgb[i][0], rgb[i][1], rgb[i][2], t3);
      lab[i * 3] = t3[0]; lab[i * 3 + 1] = t3[1]; lab[i * 3 + 2] = t3[2];
    }

    function d2at(i, cx, cy, cz) {
      var dl = lab[i * 3] - cx, da = lab[i * 3 + 1] - cy, db = lab[i * 3 + 2] - cz;
      return dl * dl + da * da + db * db;
    }

    /* Farthest-point seeding from sample 0, ties going to the lower index. */
    var want = Math.min(MAX_CENTERS, m);
    var pick = [0];
    var best = new Float64Array(m);
    for (i = 0; i < m; i++) best[i] = d2at(i, lab[0], lab[1], lab[2]);
    while (pick.length < want) {
      var far = 0, fv = -1;
      for (i = 0; i < m; i++) if (best[i] > fv) { fv = best[i]; far = i; }
      if (!(fv > 0)) break;
      pick.push(far);
      var px = lab[far * 3], py = lab[far * 3 + 1], pz = lab[far * 3 + 2];
      for (i = 0; i < m; i++) {
        var dd = d2at(i, px, py, pz);
        if (dd < best[i]) best[i] = dd;
      }
    }

    var k = pick.length;
    var cen = new Float64Array(k * 3);
    for (i = 0; i < k; i++) {
      cen[i * 3] = lab[pick[i] * 3];
      cen[i * 3 + 1] = lab[pick[i] * 3 + 1];
      cen[i * 3 + 2] = lab[pick[i] * 3 + 2];
    }
    var assign = new Int32Array(m);

    function nearestOf(centers, kk, i) {
      var bi = 0, bd = Infinity;
      for (var c = 0; c < kk; c++) {
        var d = d2at(i, centers[c * 3], centers[c * 3 + 1], centers[c * 3 + 2]);
        if (d < bd) { bd = d; bi = c; }
      }
      return bi;
    }

    for (var iter = 0; iter < 30; iter++) {
      var changed = false;
      for (i = 0; i < m; i++) {
        var c2 = nearestOf(cen, k, i);
        if (c2 !== assign[i] || iter === 0) { assign[i] = c2; changed = true; }
      }
      var sum = new Float64Array(k * 3), wsum = new Float64Array(k);
      for (i = 0; i < m; i++) {
        var a = assign[i], wv = weight[i];
        sum[a * 3] += lab[i * 3] * wv;
        sum[a * 3 + 1] += lab[i * 3 + 1] * wv;
        sum[a * 3 + 2] += lab[i * 3 + 2] * wv;
        wsum[a] += wv;
      }
      for (var c3 = 0; c3 < k; c3++) {
        if (wsum[c3] <= 0) continue;   /* an empty cluster keeps its position */
        cen[c3 * 3] = sum[c3 * 3] / wsum[c3];
        cen[c3 * 3 + 1] = sum[c3 * 3 + 1] / wsum[c3];
        cen[c3 * 3 + 2] = sum[c3 * 3 + 2] / wsum[c3];
      }
      if (!changed) break;
    }

    /* Merge centers that describe the same colour, then reassign once so the
       reported centroid and count belong to the merged set. */
    var live = [];
    for (i = 0; i < k; i++) live.push(i);
    for (;;) {
      var bi = -1, bj = -1, bd2 = MERGE_D * MERGE_D;
      for (var p = 0; p < live.length; p++) {
        for (var q = p + 1; q < live.length; q++) {
          var A = live[p], Bx = live[q];
          var dl = cen[A * 3] - cen[Bx * 3];
          var da = cen[A * 3 + 1] - cen[Bx * 3 + 1];
          var db = cen[A * 3 + 2] - cen[Bx * 3 + 2];
          var dv = dl * dl + da * da + db * db;
          if (dv < bd2) { bd2 = dv; bi = p; bj = q; }
        }
      }
      if (bi < 0) break;
      live.splice(bj, 1);
    }

    var kk = live.length;
    var fin = new Float64Array(kk * 3);
    for (i = 0; i < kk; i++) {
      fin[i * 3] = cen[live[i] * 3];
      fin[i * 3 + 1] = cen[live[i] * 3 + 1];
      fin[i * 3 + 2] = cen[live[i] * 3 + 2];
    }
    var sumL = new Float64Array(kk * 3), sumC = new Float64Array(kk * 3), cw = new Float64Array(kk);
    for (i = 0; i < m; i++) {
      var ci = nearestOf(fin, kk, i), wq = weight[i];
      sumL[ci * 3] += lab[i * 3] * wq;
      sumL[ci * 3 + 1] += lab[i * 3 + 1] * wq;
      sumL[ci * 3 + 2] += lab[i * 3 + 2] * wq;
      sumC[ci * 3] += rgb[i][0] * wq;
      sumC[ci * 3 + 1] += rgb[i][1] * wq;
      sumC[ci * 3 + 2] += rgb[i][2] * wq;
      cw[ci] += wq;
    }

    var rows = [];
    for (i = 0; i < kk; i++) {
      if (cw[i] <= 0) continue;
      rows.push({
        lab: [sumL[i * 3] / cw[i], sumL[i * 3 + 1] / cw[i], sumL[i * 3 + 2] / cw[i]],
        rgb: [Math.round(sumC[i * 3] / cw[i]), Math.round(sumC[i * 3 + 1] / cw[i]),
              Math.round(sumC[i * 3 + 2] / cw[i])],
        count: cw[i]
      });
    }
    if (!rows.length) return null;
    rows.sort(function (x, y) {
      return (y.count - x.count) || (x.lab[0] - y.lab[0])
          || (x.lab[1] - y.lab[1]) || (x.lab[2] - y.lab[2]);
    });

    /* The reported RGB center is the cluster's mean colour, not the OKLab
       center converted back: it is what the unmix wants and it needs no
       inverse transform. */
    return {
      version: VERSION,
      k: rows.length,
      centersLab: rows.map(function (r) { return r.lab; }),
      centersRgb: rows.map(function (r) { return r.rgb; }),
      counts: rows.map(function (r) { return r.count; }),
      samples: total
    };
  }

  /* Accepts a model as built here, or one that lost its OKLab side on a JSON
     round trip. Anything without usable centers counts as absent. */
  function normalizeBgModel(model) {
    if (!model) return null;
    var lab = model.centersLab, rgbc = model.centersRgb;
    if (lab && lab.length) {
      return { centersLab: lab, centersRgb: rgbc && rgbc.length === lab.length ? rgbc : null };
    }
    if (rgbc && rgbc.length) {
      return {
        centersLab: rgbc.map(function (c) { return srgbToOklab(c[0], c[1], c[2]); }),
        centersRgb: rgbc
      };
    }
    return null;
  }

  /* --------------------------------------------------------------- masking */

  /* Both mask functions return a Uint8Array, 1 = background. bgLab is either one
     [L,a,b] triple or a list of them; a list means "distance to the nearest". */

  function asCenters(bgLab) {
    return Array.isArray(bgLab[0]) ? bgLab : [bgLab];
  }

  /* Minimum distance to any center, plus the index of that center. */
  function distanceField(labs, n, centers) {
    var k = centers.length;
    var flat = new Float64Array(k * 3);
    for (var c = 0; c < k; c++) {
      flat[c * 3] = centers[c][0];
      flat[c * 3 + 1] = centers[c][1];
      flat[c * 3 + 2] = centers[c][2];
    }
    var dist = new Float32Array(n), near = new Uint8Array(n);
    for (var i = 0, j = 0; i < n; i++, j += 3) {
      var L = labs[j], A = labs[j + 1], B = labs[j + 2];
      var bd = Infinity, bi = 0;
      for (var q = 0; q < k; q++) {
        var dl = L - flat[q * 3], da = A - flat[q * 3 + 1], db = B - flat[q * 3 + 2];
        var d = dl * dl + da * da + db * db;
        if (d < bd) { bd = d; bi = q; }
      }
      dist[i] = Math.sqrt(bd);
      near[i] = bi;
    }
    return { dist: dist, near: near };
  }

  function maskFromDist(dist, n, tol) {
    var out = new Uint8Array(n);
    for (var i = 0; i < n; i++) if (dist[i] <= tol) out[i] = 1;
    return out;
  }

  function globalMask(labs, w, h, bgLab, tol) {
    var n = w * h;
    return maskFromDist(distanceField(labs, n, asCenters(bgLab)).dist, n, tol);
  }

  /* Scanline seed fill (Heckbert, Graphics Gems I) seeded from every border
     pixel: an explicit span stack, never recursion, so a 4000x4000 uniform
     image floods without touching the JS call stack. 4-connectivity. */
  function floodMask(labs, w, h, bgLab, tol) {
    return floodFromOk(globalMask(labs, w, h, bgLab, tol), w, h);
  }

  function floodFromOk(ok, w, h) {
    var n = w * h;
    var mask = new Uint8Array(n);
    var sY = [], sXL = [], sXR = [], sDY = [];

    function push(y, xl, xr, dy) {
      if (y + dy >= 0 && y + dy < h) { sY.push(y); sXL.push(xl); sXR.push(xr); sDY.push(dy); }
    }

    function seed(sx, sy) {
      var si = sy * w + sx;
      if (!ok[si] || mask[si]) return;
      push(sy, sx, sx, 1);
      push(sy + 1, sx, sx, -1);
      while (sY.length) {
        var dy = sDY.pop(), y = sY.pop() + dy, x2 = sXR.pop(), x1 = sXL.pop();
        var row = y * w, x, l = x1, skip = false;
        for (x = x1; x >= 0 && ok[row + x] && !mask[row + x]; x--) mask[row + x] = 1;
        if (x >= x1) {
          skip = true;
        } else {
          l = x + 1;
          if (l < x1) push(y, l, x1 - 1, -dy);
          x = x1 + 1;
        }
        do {
          if (!skip) {
            for (; x < w && ok[row + x] && !mask[row + x]; x++) mask[row + x] = 1;
            push(y, l, x - 1, dy);
            if (x > x2 + 1) push(y, x2 + 1, x - 1, -dy);
          }
          skip = false;
          for (x++; x <= x2 && !(ok[row + x] && !mask[row + x]); x++);
          l = x;
        } while (x <= x2);
      }
    }

    for (var x0 = 0; x0 < w; x0++) { seed(x0, 0); seed(x0, h - 1); }
    for (var y0 = 0; y0 < h; y0++) { seed(0, y0); seed(w - 1, y0); }
    return mask;
  }

  /* Foreground components below minArea become background. Two-pass labelling
     with union-find rather than a fill, so the working memory stays flat no
     matter how large the object is. */
  function despeckle(mask, w, h, minArea) {
    var n = w * h, out = new Uint8Array(mask);
    if (!(minArea > 1)) return out;
    var labels = new Int32Array(n);
    var parent = new Int32Array(1024), np = 1;

    function find(x) {
      while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; }
      return x;
    }
    function union(a, b) {
      a = find(a); b = find(b);
      if (a === b) return;
      if (a < b) parent[b] = a; else parent[a] = b;
    }
    function fresh() {
      if (np >= parent.length) {
        var p = new Int32Array(parent.length * 2);
        p.set(parent);
        parent = p;
      }
      parent[np] = np;
      return np++;
    }

    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        var i = y * w + x;
        if (mask[i]) continue;
        var west = x > 0 && !mask[i - 1] ? labels[i - 1] : 0;
        var north = y > 0 && !mask[i - w] ? labels[i - w] : 0;
        if (west && north) { labels[i] = west; union(west, north); }
        else if (west) labels[i] = west;
        else if (north) labels[i] = north;
        else labels[i] = fresh();
      }
    }
    var area = new Int32Array(np);
    for (var p1 = 0; p1 < n; p1++) if (labels[p1]) area[find(labels[p1])]++;
    for (var p2 = 0; p2 < n; p2++) {
      if (labels[p2] && area[find(labels[p2])] < minArea) out[p2] = 1;
    }
    return out;
  }

  /* ---------------------------------------------------------------- filters */

  /* O(n) running min/max over a line (monotone deque), one pass per axis.
     Truncating the window at the border equals replicate padding here, because
     the padded copies of the edge value are already inside the window. */
  function morphPass(src, dst, w, h, radius, isMax, vertical) {
    var n = vertical ? h : w;
    var lines = vertical ? w : h;
    var step = vertical ? w : 1;
    var lead = vertical ? 1 : w;
    var dq = new Int32Array(n);
    for (var L = 0; L < lines; L++) {
      var off = L * lead, head = 0, tail = 0, i, o;
      for (i = 0; i < n; i++) {
        var v = src[off + i * step];
        while (tail > head) {
          var q = src[off + dq[tail - 1] * step];
          if (isMax ? q <= v : q >= v) tail--; else break;
        }
        dq[tail++] = i;
        o = i - radius;
        if (o >= 0) {
          while (dq[head] < o - radius) head++;
          dst[off + o * step] = src[off + dq[head] * step];
        }
      }
      for (o = Math.max(0, n - radius); o < n; o++) {
        while (dq[head] < o - radius) head++;
        dst[off + o * step] = src[off + dq[head] * step];
      }
    }
  }

  function blurPass(src, dst, w, h, radius, vertical) {
    var n = vertical ? h : w;
    var lines = vertical ? w : h;
    var step = vertical ? w : 1;
    var lead = vertical ? 1 : w;
    var win = 2 * radius + 1;
    for (var L = 0; L < lines; L++) {
      var off = L * lead, sum = src[off] * (radius + 1), j;
      for (j = 1; j <= radius; j++) sum += src[off + Math.min(j, n - 1) * step];
      for (var i = 0; i < n; i++) {
        dst[off + i * step] = sum / win;
        sum += src[off + Math.min(i + radius + 1, n - 1) * step]
             - src[off + Math.max(i - radius, 0) * step];
      }
    }
  }

  /* Three passes approximate a Gaussian. Returns a new Float32Array. */
  function boxBlur(plane, w, h, radius, passes) {
    var a = new Float32Array(plane), b = new Float32Array(plane.length);
    if (!(radius > 0)) return a;
    var p = passes == null ? 3 : passes;
    for (var k = 0; k < p; k++) {
      blurPass(a, b, w, h, radius, false);
      blurPass(b, a, w, h, radius, true);
    }
    return a;
  }

  function featherAlpha(alpha, w, h, radius) {
    return boxBlur(alpha, w, h, Math.round(radius), 3);
  }

  /* Grow (radius > 0) or shrink (radius < 0) the opaque side of the alpha by
     that many pixels. Separable max/min, so the structuring element is a
     square: a square grows by exactly the radius on each side, which is what
     the option promises, and the diagonal overshoot of a box kernel is not
     worth a chamfer pass at radii of a few pixels. */
  function expandAlpha(alpha, w, h, radius) {
    var r = Math.round(Math.abs(radius));
    if (!(r > 0)) return alpha;
    var isMax = radius > 0;
    var a = new Float32Array(alpha), b = new Float32Array(alpha.length);
    morphPass(a, b, w, h, r, isMax, false);
    morphPass(b, a, w, h, r, isMax, true);
    return a;
  }

  /* Contour smoothing, the opposite intent of feather: blur the alpha to average
     the wobbles out, then re-steepen around 0.5 so the edge comes back crisp.
     The re-steepening band is derived from the blur's own sigma, so the result
     is one pixel wide no matter the radius. Everything further than the blur's
     reach from an edge is exactly 0 or exactly 1 again, since the smoothstep
     clamps outside the band. */
  function smoothAlpha(alpha, w, h, radius) {
    var r = Math.round(radius);
    if (!(r > 0)) return alpha;
    var out = boxBlur(alpha, w, h, r, 3);
    var win = 2 * r + 1;
    var sigma = Math.sqrt(win * win - 1) / 2;
    /* A blurred step has slope 0.3989/sigma at the crossing; a band of
       0.15/sigma therefore spans well under a pixel, and a straight edge keeps
       its exact 0/1 values instead of going grey. */
    var band = 0.15 / sigma;
    if (band < 0.02) band = 0.02;
    if (band > 0.35) band = 0.35;
    var lo = 0.5 - band, span = 2 * band;
    for (var i = 0; i < out.length; i++) {
      var t = (out[i] - lo) / span;
      out[i] = t <= 0 ? 0 : (t >= 1 ? 1 : t * t * (3 - 2 * t));
    }
    return out;
  }

  /* ------------------------------------------------------ lighting flatten */

  /* Smooth per-pixel estimate of the background: a morphological closing of the
     given radius (max then min; the other way round for a background darker
     than the subject), then a blur of the same radius.
     The closing rather than a bare max filter, because a max filter alone
     shifts a gradient uphill by its radius, and the divide would then leave the
     whole background a few levels below the reference. Closing puts it back. */
  function backgroundField(img, radius, dark) {
    var w = img.width | 0, h = img.height | 0, n = w * h, d = img.data;
    var r = Math.max(1, Math.round(radius));
    var out = [];
    for (var c = 0; c < 3; c++) {
      var a = new Float32Array(n), b = new Float32Array(n);
      for (var i = 0, k = c; i < n; i++, k += 4) a[i] = d[k];
      morphPass(a, b, w, h, r, !dark, false);
      morphPass(b, a, w, h, r, !dark, true);
      morphPass(a, b, w, h, r, !!dark, false);
      morphPass(b, a, w, h, r, !!dark, true);
      out.push(boxBlur(a, w, h, r, 3));
    }
    return { width: w, height: h, r: out[0], g: out[1], b: out[2] };
  }

  function isDarkBg(img, bg) {
    var w = img.width | 0, h = img.height | 0, n = w * h, d = img.data;
    var stepPx = Math.max(1, Math.floor(n / 20000));
    var vals = [];
    for (var i = 0; i < n; i += stepPx) {
      var k = i * 4;
      vals.push(0.299 * d[k] + 0.587 * d[k + 1] + 0.114 * d[k + 2]);
    }
    var mid = median(vals);
    return (0.299 * bg[0] + 0.587 * bg[1] + 0.114 * bg[2]) < mid;
  }

  /* Divides the field out and renormalises to ref (the estimated background
     colour), so a background of any gradient lands on ref exactly and the
     tolerance can be compared against the very same colour in both paths. */
  function flattenImage(img, radius, dark, ref) {
    var w = img.width | 0, h = img.height | 0, n = w * h, d = img.data;
    var base = ref || estimateBgColor(img);
    var field = backgroundField(img, radius, dark);
    var out = new Float32Array(n * 4);
    var fp = [field.r, field.g, field.b];
    for (var c = 0; c < 3; c++) {
      var f = fp[c], gain = base[c];
      for (var i = 0, k = c; i < n; i++, k += 4) {
        var fv = f[i];
        out[k] = d[k] * gain / (fv > 1e-3 ? fv : 1e-3);
      }
    }
    for (var j = 3; j < out.length; j += 4) out[j] = d[j];
    return { image: { width: w, height: h, data: out }, field: field };
  }

  /* --------------------------------------------------------------- pipeline */

  function removeBackground(img, opts) {
    opts = opts || {};
    var w = img.width | 0, h = img.height | 0, n = w * h, src = img.data;
    var out = new Uint8ClampedArray(n * 4);
    if (n === 0) return { width: w, height: h, data: out };

    var mode = opts.mode === 'global' ? 'global' : 'edges';
    var tol = opts.tolerance == null ? 0.12 : +opts.tolerance;
    if (!(tol >= 0)) tol = 0;
    var soft = opts.softEdges !== false;
    var expand = Math.round(+opts.expand || 0);
    var smooth = Math.max(0, Math.round(+opts.smooth || 0));
    var feather = Math.max(0, Math.round(opts.feather || 0));
    var minArea = Math.max(0, Math.round(opts.despeckle || 0));
    var flatR = Math.max(0, Math.round(opts.flatten || 0));

    var est = estimateBgColor(img);
    var model = normalizeBgModel(opts.bgModel);
    var bg = opts.bg ? [+opts.bg[0], +opts.bg[1], +opts.bg[2]] : est;

    /* A model and the flatten step pull in opposite directions: flatten divides
       the illumination out and renormalises every background pixel onto one
       reference colour, which is exactly the variation the model was sampled to
       describe, and it would move the pixels away from centers that were
       measured in the original image. So a model wins and flatten sits this one
       out rather than the two quietly ruining each other. */
    var work = img, field = null;
    if (flatR > 0 && !model) {
      var fl = flattenImage(img, flatR, isDarkBg(img, est), est);
      work = fl.image;
      field = fl.field;
    }

    var centersLab = model ? model.centersLab : [srgbToOklab(bg[0], bg[1], bg[2])];
    var centersRgb = model && model.centersRgb ? model.centersRgb : [bg];
    var labs = toLabPlane(work);
    var df = distanceField(labs, n, centersLab);
    var dist = df.dist, near = df.near;
    var okBg = maskFromDist(dist, n, tol);
    var mask0 = mode === 'global' ? okBg : floodFromOk(okBg, w, h);
    var mask = minArea > 1 ? despeckle(mask0, w, h, minArea) : mask0;

    /* alpha0 drives the colour unmixing, alphaOut the alpha channel: feathering
       must not feed a softened alpha back into the colour estimate. */
    var alpha0 = new Float32Array(n);
    var lo = tol * SOFT_FLOOR, span = tol - lo;
    var inv = span > 0 ? 1 / span : 0;
    for (var i = 0; i < n; i++) {
      if (!mask[i]) { alpha0[i] = 1; continue; }
      if (!soft || !mask0[i]) { alpha0[i] = 0; continue; }
      var a = (dist[i] - lo) * inv;
      alpha0[i] = a <= 0 ? 0 : (a > 1 ? 1 : a);
    }
    /* Shape passes run on the alpha only, in this order: expand, smooth,
       feather. Each returns its input untouched when it is off, so a call with
       the defaults hands alpha0 straight through. */
    var shaped = alpha0;
    if (expand) shaped = expandAlpha(shaped, w, h, expand);
    if (smooth > 0) shaped = smoothAlpha(shaped, w, h, smooth);
    var alphaOut = feather > 0 ? featherAlpha(shaped, w, h, feather) : shaped;

    for (var p = 0, k = 0; p < n; p++, k += 4) {
      var av = alphaOut[p];
      if (av < 0) av = 0; else if (av > 1) av = 1;
      var A = Math.round(av * 255);
      var a0 = alpha0[p];
      /* The colour follows alpha0, the alpha BEFORE the shape passes: only a
         pixel that was a genuine mix of subject and background has an unmixed
         colour to show. A pixel that was pure background never had one, so when
         expand raises its alpha it shows the original image colour, which is
         exactly what "grow the subject into the background" asks for. */
      if (soft && a0 > 0.002 && a0 < 0.998 && A > 0) {
        /* Unmix against the nearest center, or against the local illumination
           where the flatten step measured it. */
        var cc = centersRgb[near[p]] || bg;
        var br = cc[0], bgc = cc[1], bb = cc[2];
        if (field) { br = field.r[p]; bgc = field.g[p]; bb = field.b[p]; }
        var q = (1 - a0) / a0, ia = 1 / a0;
        out[k] = src[k] * ia - br * q;
        out[k + 1] = src[k + 1] * ia - bgc * q;
        out[k + 2] = src[k + 2] * ia - bb * q;
      } else {
        out[k] = src[k];
        out[k + 1] = src[k + 1];
        out[k + 2] = src[k + 2];
      }
      out[k + 3] = A;
    }
    return { width: w, height: h, data: out };
  }

  globalThis.BgCore = {
    version: VERSION,
    srgbToOklab: srgbToOklab,
    dist2: dist2,
    toLabPlane: toLabPlane,
    estimateBgColor: estimateBgColor,
    buildBgModel: buildBgModel,
    globalMask: globalMask,
    distanceField: distanceField,
    floodMask: floodMask,
    despeckle: despeckle,
    boxBlur: boxBlur,
    expandAlpha: expandAlpha,
    smoothAlpha: smoothAlpha,
    featherAlpha: featherAlpha,
    backgroundField: backgroundField,
    flattenImage: flattenImage,
    removeBackground: removeBackground
  };
})();
