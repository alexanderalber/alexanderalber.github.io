/* trace-core.js -- raster to vector: mask cleanup, contour tracing, curve fitting.
 *
 * The vector half of the vectorizer, the way bgremove-core.js is the raster half.
 * Same rules: plain script, no imports, no DOM, no canvas, no ImageData
 * constructor, no Math.random, no Date.now. Everything hangs off
 * globalThis.TraceCore, so the file loads with <script src> in the page, with
 * importScripts in a worker (there globalThis is self) and by eval in the Node
 * tests.
 *
 * Images are plain objects { width, height, data } with RGBA bytes, exactly as
 * in bgremove-core. Masks are flat Uint8Array of width * height with 1 = inside
 * (the ink, the subject, the thing that becomes a filled path) and 0 = outside.
 * That polarity is the opposite of BgCore.despeckle, which counts 1 as
 * background; the two must not be wired into each other without inverting.
 *
 * Public API
 *   TraceCore.version                     -> 1
 *   maskFromThreshold(img, opts)          -> Uint8Array, 1 = inside
 *   grayField(img, opts)                  -> Float32Array 0..1, 0.5 level = the mask edge
 *   maskFromLabels(labels, w, h, set)     -> Uint8Array
 *   despeckle(mask, w, h, opts)           -> Uint8Array
 *   smoothMask(mask, w, h, opts)          -> Uint8Array
 *   extractContours(mask, w, h, opts)     -> { xs, ys, starts, areas }
 *   simplifyRing(xs, ys, tol)             -> { xs, ys }
 *   findCorners(xs, ys, opts)             -> Int32Array of vertex indices
 *   fitRing(xs, ys, corners, opts)        -> [{ c: [8] } | { l: [4] }]
 *                                            opts: maxError, lineTol, smooth
 *   refineSubpixel(rings, field, w, h, o) -> { xs, ys, starts, areas }
 *   traceMask(mask, w, h, opts)           -> { subpaths, d, stats }
 *   svgDocument(layers, opts)             -> string
 * Helpers exported for the tests: signedArea, dpSimplify, bezierPoint,
 * bezierMaxError, sampleField, boxBlur.
 *
 * Four things worth knowing before changing anything here:
 *
 * 1. Contours run on the CRACKS between pixels, not through pixel centers. The
 *    node grid is (w+1) x (h+1) and pixel (x, y) spans the corners (x, y) to
 *    (x+1, y+1), so a lone pixel comes out as an exact unit square with integer
 *    coordinates and no half-pixel offset anywhere. Every ring is therefore
 *    closed, axis-aligned and made of unit steps until something simplifies it.
 * 2. Rings are chained by corner id, never by comparing coordinates, the same
 *    trick the marching-squares code in regensburg-sun.html uses for its edge
 *    ids. Each directed crack edge has exactly one successor, so the chaining is
 *    a permutation and cannot dead-end.
 * 3. Orientation carries the topology. Edges are emitted with the inside on the
 *    left of the direction of travel in image coordinates (y down), which makes
 *    the shoelace area of an outer ring POSITIVE and of a hole NEGATIVE. Holes
 *    therefore fall out of the winding and the emitted path wants
 *    fill-rule="nonzero". Anything that reorders vertices must preserve that.
 * 4. Coordinates stay unrounded through the whole pipeline. Rounding happens
 *    once, when the d string is written, because rounding earlier would move
 *    fit points around and the curve fitter would then chase quantisation noise.
 * 5. A run that is straight is emitted as a LINE, not as a cubic that happens to
 *    be flat. That is the `lineTol` option (default 0.35 px, on fitRing and
 *    traceMask): before a corner-to-corner run is handed to the cubic fitter,
 *    the largest perpendicular deviation of its interior vertices from its chord
 *    is measured, and below lineTol the run becomes an L. A second check runs
 *    after a fit, so a cubic whose control points ended up on its own chord
 *    collapses too.
 *    Why this is not cosmetic: without it, a long straight run gets a cubic
 *    whose END TANGENTS are the directions of the first and last polygon edge,
 *    and at a serif or any small feature those edges are one-pixel stubs
 *    pointing slightly off-axis. The fitter then bows the whole run to leave in
 *    that direction, well inside maxError but plainly visible as a wavy stem in
 *    small text. lineTol therefore has to sit BELOW maxError to have any effect:
 *    a bow of half a pixel is what the tolerance permits and what the eye reads
 *    as wrong. It is a deviation bound, not a smoothing knob, and it cannot chop
 *    a genuinely round run into a polyline because a round run's sagitta over
 *    the same span is far larger than a third of a pixel.
 */
(function () {
  'use strict';

  var VERSION = 1;

  /* Directions of a crack edge: 0 = +x, 1 = +y, 2 = -x, 3 = -y. */
  var DX = [1, 0, -1, 0];
  var DY = [0, 1, 0, -1];

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

  /* ------------------------------------------------------------ thresholding */

  /* Rec. 709 luminance on sRGB bytes. Deliberately not linearised: the
     threshold a user drags is a threshold on what the image looks like in a
     paint program, not on light. */
  function luma(r, g, b) {
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }

  /* signed(lum) is positive inside and negative outside, for both polarities:
       invert = false   inside is the BRIGHT side, s = lum - threshold
       invert = true    inside is the DARK side,   s = threshold - lum
     A pixel exactly at the threshold counts as inside in both cases. */
  function signedLum(lum, threshold, invert) {
    return invert ? (threshold - lum) : (lum - threshold);
  }

  function maskFromThreshold(img, opts) {
    opts = opts || {};
    var w = img.width | 0, h = img.height | 0, n = w * h, d = img.data;
    var threshold = opts.threshold == null ? 128 : +opts.threshold;
    var invert = !!opts.invert;
    var floor = opts.alphaFloor == null ? 128 : +opts.alphaFloor;
    var out = new Uint8Array(n < 0 ? 0 : n);
    for (var i = 0, k = 0; i < n; i++, k += 4) {
      if (d[k + 3] < floor) continue;
      if (signedLum(luma(d[k], d[k + 1], d[k + 2]), threshold, invert) >= 0) out[i] = 1;
    }
    return out;
  }

  /* The continuous twin of maskFromThreshold, used only by refineSubpixel.
     The mapping is field = clamp(0.5 + s / 255, 0, 1) with the same s as above,
     which has three properties the refinement needs:
       - mask[i] === 1  exactly when  field[i] >= 0.5, by construction, because
         s >= 0 is the mask test and shifts the field to >= 0.5;
       - it varies continuously across an anti-aliased rim, where lum sweeps the
         whole range, so the 0.5 crossing sits where the coverage is half;
       - it is monotone in lum, so no spurious second crossing appears.
     The full 255-wide slope means a hard edge stays a hard edge (0 to 1 within
     one pixel) instead of being smeared into a ramp the fitter would then read
     as geometry. A pixel below the alpha floor is 0, fully outside, which makes
     the field discontinuous at a cutout border; that is the same cliff the mask
     has there and the refinement clamps its displacement anyway. */
  function grayField(img, opts) {
    opts = opts || {};
    var w = img.width | 0, h = img.height | 0, n = w * h, d = img.data;
    var threshold = opts.threshold == null ? 128 : +opts.threshold;
    var invert = !!opts.invert;
    var floor = opts.alphaFloor == null ? 128 : +opts.alphaFloor;
    var out = new Float32Array(n < 0 ? 0 : n);
    for (var i = 0, k = 0; i < n; i++, k += 4) {
      if (d[k + 3] < floor) { out[i] = 0; continue; }
      var s = signedLum(luma(d[k], d[k + 1], d[k + 2]), threshold, invert);
      out[i] = clamp(0.5 + s / 255, 0, 1);
    }
    return out;
  }

  /* Colour-quantised images arrive as a label plane, one Int32 per pixel, with
     -1 for "transparent, belongs to no colour". A layer is then the set of
     labels the caller ticked. -1 is never part of any layer. */
  function maskFromLabels(labels, w, h, set) {
    var n = w * h;
    var out = new Uint8Array(n < 0 ? 0 : n);
    for (var i = 0; i < n; i++) {
      var L = labels[i];
      if (L >= 0 && set && set[L]) out[i] = 1;
    }
    return out;
  }

  /* ------------------------------------------------- connected components */

  /* Two-pass labelling with union-find, 4-connectivity, over the pixels equal
     to `target`. Flat working memory, no recursion and no fill, so a mask that
     is one giant component costs the same as one that is confetti.
     Returns compact labels 0..count-1 in the target pixels and -1 elsewhere,
     plus the area of each component and whether it touches the image border. */
  function labelComponents(mask, w, h, target) {
    var n = w * h;
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

    var x, y, i;
    for (y = 0; y < h; y++) {
      for (x = 0; x < w; x++) {
        i = y * w + x;
        if (mask[i] !== target) continue;
        var west = x > 0 && mask[i - 1] === target ? labels[i - 1] : 0;
        var north = y > 0 && mask[i - w] === target ? labels[i - w] : 0;
        if (west && north) { labels[i] = west; union(west, north); }
        else if (west) labels[i] = west;
        else if (north) labels[i] = north;
        else labels[i] = fresh();
      }
    }

    var remap = new Int32Array(np).fill(-1);
    var count = 0;
    for (i = 1; i < np; i++) if (find(i) === i) remap[i] = count++;

    var area = new Int32Array(count);
    var border = new Uint8Array(count);
    for (y = 0; y < h; y++) {
      for (x = 0; x < w; x++) {
        i = y * w + x;
        if (!labels[i]) { labels[i] = -1; continue; }
        var c = remap[find(labels[i])];
        labels[i] = c;
        area[c]++;
        if (x === 0 || y === 0 || x === w - 1 || y === h - 1) border[c] = 1;
      }
    }
    return { labels: labels, count: count, area: area, border: border };
  }

  /* Inside components smaller than minArea go away, then outside components
     smaller than minHole get filled. In that order and with a fresh labelling
     in between, so a hole that only exists because a speck was sitting in it is
     judged on the mask as it is after the speck is gone.
     An outside component touching the image border is never a hole: it is the
     page around the subject, and filling it would flood the whole image. */
  function despeckle(mask, w, h, opts) {
    opts = opts || {};
    var minArea = Math.max(0, Math.round(+opts.minArea || 0));
    var minHole = Math.max(0, Math.round(+opts.minHole || 0));
    var out = new Uint8Array(mask);
    var n = w * h;
    if (n <= 0) return out;
    var i;
    if (minArea > 0) {
      var fg = labelComponents(out, w, h, 1);
      for (i = 0; i < n; i++) {
        var a = fg.labels[i];
        if (a >= 0 && fg.area[a] < minArea) out[i] = 0;
      }
    }
    if (minHole > 0) {
      var bg = labelComponents(out, w, h, 0);
      for (i = 0; i < n; i++) {
        var b = bg.labels[i];
        if (b >= 0 && !bg.border[b] && bg.area[b] < minHole) out[i] = 1;
      }
    }
    return out;
  }

  /* --------------------------------------------------------------- filters */

  /* O(n) running min/max over a line (monotone deque), one pass per axis. The
     same routine as in bgremove-core; truncating the window at the border is
     replicate padding, because the padded copies of the edge value are already
     inside the window. */
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

  /* Two different intents, deliberately not merged into one slider:
       'blur'  blurs the 0/1 mask and re-thresholds at 0.5. That is a curvature
               flow: it rounds corners and eats zigzags whose amplitude is below
               the radius. Good for a scan of a drawing, wrong for a floor plan.
       'morph' opens then closes with a square structuring element of the given
               radius. It removes protrusions and fills notches thinner than the
               element and leaves a straight edge and a right angle EXACTLY as
               they were, which is what a technical drawing wants.
     Radius 0 is the identity in both modes and returns a copy. */
  function smoothMask(mask, w, h, opts) {
    opts = opts || {};
    var r = Math.max(0, Math.round(+opts.radius || 0));
    var mode = opts.mode === 'morph' ? 'morph' : 'blur';
    var n = w * h;
    if (!(r > 0) || n <= 0) return new Uint8Array(mask);
    var a = new Float32Array(n), b = new Float32Array(n), i;
    for (i = 0; i < n; i++) a[i] = mask[i] ? 1 : 0;
    var out = new Uint8Array(n);
    if (mode === 'blur') {
      var f = boxBlur(a, w, h, r, 3);
      for (i = 0; i < n; i++) out[i] = f[i] >= 0.5 ? 1 : 0;
      return out;
    }
    /* open: erode then dilate. close: dilate then erode. Each is separable, so
       the structuring element is a square rather than a disc; at the radii this
       is used with, the diagonal overshoot is not worth a chamfer pass. */
    morphPass(a, b, w, h, r, false, false);
    morphPass(b, a, w, h, r, false, true);
    morphPass(a, b, w, h, r, true, false);
    morphPass(b, a, w, h, r, true, true);
    morphPass(a, b, w, h, r, true, false);
    morphPass(b, a, w, h, r, true, true);
    morphPass(a, b, w, h, r, false, false);
    morphPass(b, a, w, h, r, false, true);
    for (i = 0; i < n; i++) out[i] = a[i] >= 0.5 ? 1 : 0;
    return out;
  }

  /* ---------------------------------------------------------- contours */

  /* Shoelace over a closed ring, y down. Positive means the interior is on the
     left of the direction of travel, which is how extractContours emits outer
     rings; holes come out negative. */
  function signedArea(xs, ys) {
    var n = xs.length;
    if (n < 3) return 0;
    var a = 0;
    for (var i = 0, j = n - 1; i < n; j = i++) {
      a += xs[j] * ys[i] - xs[i] * ys[j];
    }
    return a / 2;
  }

  /* Crack following. For every inside pixel and every outside neighbour (out of
     range counts as outside, so no border ring has to be allocated) one directed
     unit edge is emitted along the shared crack, oriented so the inside pixel is
     on the left of the direction of travel:
       neighbour above  -> (x, y)     to (x+1, y)      going +x
       neighbour right  -> (x+1, y)   to (x+1, y+1)    going +y
       neighbour below  -> (x+1, y+1) to (x, y+1)      going -x
       neighbour left   -> (x, y+1)   to (x, y)        going -y
     Chaining then only has to ask "which edge starts at the corner this one
     ends on". A corner has one outgoing edge except in the checkerboard case
     (two inside pixels diagonal, two outside diagonal), where it has two. That
     is the only choice in the whole routine:
       policy 'foreground' keeps the two inside pixels connected, so the
         foreground is 8-connected and the background 4-connected;
       policy 'background' does the opposite.
     Concretely, 'foreground' takes the turn whose cross product with the
     incoming direction is negative, which is the one that leaves the pixel the
     edge belonged to and continues around the diagonal one. Both incoming
     directions map to different outgoing ones, so the chaining stays a
     permutation and the walk cannot dead-end.
     Output is flat, isoContours style: all points in one pair of arrays, the
     ring starts in a third with a sentinel end, so the whole thing crosses a
     worker boundary as three transferables instead of a thousand small ones. */
  function extractContours(mask, w, h, opts) {
    opts = opts || {};
    var fgConnected = opts.policy !== 'background';
    var W1 = w + 1;
    var sx = [], sy = [], sd = [];
    var firstAt = new Map(), secondAt = new Map();

    function add(x, y, d) {
      var idx = sx.length;
      sx.push(x); sy.push(y); sd.push(d);
      var cid = y * W1 + x;
      if (firstAt.has(cid)) secondAt.set(cid, idx); else firstAt.set(cid, idx);
    }

    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        var i = y * w + x;
        if (!mask[i]) continue;
        if (y === 0 || !mask[i - w]) add(x, y, 0);
        if (x === w - 1 || !mask[i + 1]) add(x + 1, y, 1);
        if (y === h - 1 || !mask[i + w]) add(x + 1, y + 1, 2);
        if (x === 0 || !mask[i - 1]) add(x, y + 1, 3);
      }
    }

    var m = sx.length;
    var used = new Uint8Array(m);
    var px = [], py = [], starts = [], areas = [];
    for (var s0 = 0; s0 < m; s0++) {
      if (used[s0]) continue;
      starts.push(px.length);
      var e = s0, a2 = 0, guard = m + 1;
      while (guard-- > 0) {
        used[e] = 1;
        var x0 = sx[e], y0 = sy[e], d = sd[e];
        px.push(x0); py.push(y0);
        var nx = x0 + DX[d], ny = y0 + DY[d];
        a2 += x0 * ny - nx * y0;
        var cid = ny * W1 + nx;
        if (!firstAt.has(cid)) break;   /* cannot happen, see the note above */
        var e1 = firstAt.get(cid);
        var nxt = e1;
        if (secondAt.has(cid)) {
          var e2 = secondAt.get(cid);
          var cr = DX[d] * DY[sd[e1]] - DY[d] * DX[sd[e1]];
          var take1 = fgConnected ? cr < 0 : cr > 0;
          nxt = take1 ? e1 : e2;
        }
        e = nxt;
        if (e === s0 || used[e]) break;
      }
      areas.push(a2 / 2);
    }
    starts.push(px.length);

    return {
      xs: Float64Array.from(px),
      ys: Float64Array.from(py),
      starts: Int32Array.from(starts),
      areas: Float64Array.from(areas)
    };
  }

  /* ------------------------------------------------------ subpixel refinement */

  /* Bilinear sample of a per-pixel field at a point in CORNER coordinates. The
     value of pixel (x, y) sits at its center, corner coordinate (x+0.5, y+0.5),
     so the lookup shifts by half a pixel. Outside the image the edge value is
     replicated rather than treated as zero, which keeps a shape running off the
     canvas from being pulled inward. */
  function sampleField(field, w, h, x, y) {
    var fx = clamp(x - 0.5, 0, w - 1);
    var fy = clamp(y - 0.5, 0, h - 1);
    var x0 = Math.floor(fx), y0 = Math.floor(fy);
    if (x0 > w - 2) x0 = Math.max(0, w - 2);
    if (y0 > h - 2) y0 = Math.max(0, h - 2);
    var x1 = Math.min(x0 + 1, w - 1), y1 = Math.min(y0 + 1, h - 1);
    var tx = fx - x0, ty = fy - y0;
    var a = field[y0 * w + x0], b = field[y0 * w + x1];
    var c = field[y1 * w + x0], dd = field[y1 * w + x1];
    var top = a + (b - a) * tx;
    var bot = c + (dd - c) * tx;
    return top + (bot - top) * ty;
  }

  var REFINE_SPAN = 1.25;    /* how far along the normal to look, in px */
  var REFINE_STEP = 0.25;
  var REFINE_CLAMP = 0.75;   /* a vertex may never move further than this */

  /* Pull every contour vertex onto the 0.5 level of a continuous field.
     The normal comes from the chord between the neighbouring vertices, the
     field is sampled at fixed offsets along it, and the crossing nearest the
     vertex is found by linear interpolation between two adjacent samples. The
     displacement is clamped, so no vertex can cross another and the ring keeps
     its topology no matter how ugly the field is.
     On a hard binary field this is a no-op along straight runs: the crack sits
     exactly halfway between an inside and an outside pixel center, so the
     bilinear sample there is exactly 0.5 and the crossing is found at offset
     zero. At a convex corner it is not, and cannot be: the 0.5 level of a
     bilinear reconstruction of a binary corner is a rounded curve, not the right
     angle. That is why this runs only when there is a real grayscale field. */
  function refineSubpixel(rings, field, w, h, opts) {
    opts = opts || {};
    var iterations = Math.max(1, Math.round(opts.iterations == null ? 1 : opts.iterations));
    var xs = Float64Array.from(rings.xs);
    var ys = Float64Array.from(rings.ys);
    var starts = Int32Array.from(rings.starts);
    if (!field) return { xs: xs, ys: ys, starts: starts, areas: Float64Array.from(rings.areas) };

    var nSamp = Math.round(2 * REFINE_SPAN / REFINE_STEP) + 1;
    var g = new Float64Array(nSamp);

    for (var it = 0; it < iterations; it++) {
      var src = Float64Array.from(xs), sry = Float64Array.from(ys);
      for (var r = 0; r + 1 < starts.length; r++) {
        var a = starts[r], b = starts[r + 1], n = b - a;
        if (n < 3) continue;
        for (var k = 0; k < n; k++) {
          var i = a + k;
          var ip = a + (k + n - 1) % n, iq = a + (k + 1) % n;
          var dx = src[iq] - src[ip], dy = sry[iq] - sry[ip];
          var len = Math.sqrt(dx * dx + dy * dy);
          if (!(len > 0)) continue;
          var nxv = dy / len, nyv = -dx / len;
          var px0 = src[i], py0 = sry[i], s;
          for (var j = 0; j < nSamp; j++) {
            s = -REFINE_SPAN + j * REFINE_STEP;
            g[j] = sampleField(field, w, h, px0 + nxv * s, py0 + nyv * s) - 0.5;
          }
          var best = Infinity, bestS = 0, found = false;
          for (var j2 = 0; j2 < nSamp; j2++) {
            var sj = -REFINE_SPAN + j2 * REFINE_STEP, cand = null;
            if (g[j2] === 0) cand = sj;
            else if (j2 + 1 < nSamp && ((g[j2] < 0) !== (g[j2 + 1] < 0)) && g[j2 + 1] !== 0) {
              cand = sj + REFINE_STEP * g[j2] / (g[j2] - g[j2 + 1]);
            }
            if (cand === null) continue;
            var ac = cand < 0 ? -cand : cand;
            if (ac < best) { best = ac; bestS = cand; found = true; }
          }
          if (!found) continue;
          var mv = clamp(bestS, -REFINE_CLAMP, REFINE_CLAMP);
          xs[i] = px0 + nxv * mv;
          ys[i] = py0 + nyv * mv;
        }
      }
    }

    var areas = new Float64Array(starts.length - 1);
    for (var r2 = 0; r2 + 1 < starts.length; r2++) {
      areas[r2] = signedArea(xs.subarray(starts[r2], starts[r2 + 1]),
                             ys.subarray(starts[r2], starts[r2 + 1]));
    }
    return { xs: xs, ys: ys, starts: starts, areas: areas };
  }

  /* ---------------------------------------------------------- simplification */

  function perpDist2(px, py, ax, ay, bx, by) {
    var dx = bx - ax, dy = by - ay;
    var L2 = dx * dx + dy * dy;
    if (L2 <= 0) {
      var ex = px - ax, ey = py - ay;
      return ex * ex + ey * ey;
    }
    var cr = dx * (py - ay) - dy * (px - ax);
    return cr * cr / L2;
  }

  /* Douglas-Peucker on an OPEN polyline, iterative (an explicit stack, never
     recursion, because a crack contour of a large scan is tens of thousands of
     vertices long). Returns the indices that survive, endpoints always. */
  function dpSimplify(xs, ys, tol) {
    var n = xs.length, out = [], i;
    if (n <= 2) {
      for (i = 0; i < n; i++) out.push(i);
      return out;
    }
    var keep = new Uint8Array(n);
    keep[0] = 1; keep[n - 1] = 1;
    var t2 = tol > 0 ? tol * tol : 0;
    var stack = [0, n - 1];
    while (stack.length) {
      var e = stack.pop(), s = stack.pop();
      if (e - s < 2) continue;
      var bi = -1, bd = -1;
      for (i = s + 1; i < e; i++) {
        var d = perpDist2(xs[i], ys[i], xs[s], ys[s], xs[e], ys[e]);
        if (d > bd) { bd = d; bi = i; }
      }
      if (bi > 0 && bd > t2) {
        keep[bi] = 1;
        stack.push(s, bi);
        stack.push(bi, e);
      }
    }
    for (i = 0; i < n; i++) if (keep[i]) out.push(i);
    return out;
  }

  /* Collapse exactly collinear runs, then Douglas-Peucker on the closed ring.
     The collapse first because a raw crack contour is all unit steps and a
     straight edge of 400 px arrives as 400 vertices; removing them exactly (a
     zero cross product, not an epsilon band) costs one pass and shrinks the DP
     input by an order of magnitude. After subpixel refinement the vertices are
     no longer exactly collinear, nothing collapses, and the DP does all the work
     with the tolerance it was given, which is the point of keeping the test
     exact rather than fuzzy.
     A closed ring has no endpoints for the DP to anchor on, so it is cut at two
     far-apart vertices (leftmost, then the one farthest from it) and the two
     open halves are simplified separately. Never returns fewer than 3 vertices. */
  function simplifyRing(xs, ys, tol) {
    var n = xs.length, i;
    var cx = [], cy = [];

    function collinear(ax, ay, bx, by, px, py) {
      var cr = (bx - ax) * (py - ay) - (by - ay) * (px - ax);
      if (cr > 1e-9 || cr < -1e-9) return false;
      /* a spur that doubles back is not a collinear run */
      return (bx - ax) * (px - bx) + (by - ay) * (py - by) >= 0;
    }

    for (i = 0; i < n; i++) {
      var x = xs[i], y = ys[i], m = cx.length;
      while (m >= 2 && collinear(cx[m - 2], cy[m - 2], cx[m - 1], cy[m - 1], x, y)) {
        cx.pop(); cy.pop(); m--;
      }
      cx.push(x); cy.push(y);
    }
    var q = cx.length;
    while (q > 3 && collinear(cx[q - 2], cy[q - 2], cx[q - 1], cy[q - 1], cx[0], cy[0])) {
      cx.pop(); cy.pop(); q--;
    }
    while (q > 3 && collinear(cx[q - 1], cy[q - 1], cx[0], cy[0], cx[1], cy[1])) {
      cx.shift(); cy.shift(); q--;
    }

    if (q <= 3 || !(tol > 0)) {
      return { xs: Float64Array.from(cx), ys: Float64Array.from(cy) };
    }

    var A = 0;
    for (i = 1; i < q; i++) {
      if (cx[i] < cx[A] || (cx[i] === cx[A] && cy[i] < cy[A])) A = i;
    }
    var B = A, bd = -1;
    for (i = 0; i < q; i++) {
      var ddx = cx[i] - cx[A], ddy = cy[i] - cy[A];
      var d2 = ddx * ddx + ddy * ddy;
      if (d2 > bd) { bd = d2; B = i; }
    }
    if (B === A) B = (A + (q >> 1)) % q;

    function half(from, to) {
      var idx = [], j = from;
      for (;;) {
        idx.push(j);
        if (j === to) break;
        j = (j + 1) % q;
      }
      var hx = new Float64Array(idx.length), hy = new Float64Array(idx.length);
      for (var k = 0; k < idx.length; k++) { hx[k] = cx[idx[k]]; hy[k] = cy[idx[k]]; }
      var kept = dpSimplify(hx, hy, tol);
      return kept.map(function (k2) { return idx[k2]; });
    }

    var k1 = half(A, B), k2 = half(B, A);
    var keepIdx = k1.concat(k2.slice(1, k2.length - 1));

    /* A ring that fell to two vertices is not a ring. Put the vertex farthest
       from the cut line back so there is at least a triangle. */
    if (keepIdx.length < 3) {
      var fi = -1, fd = -1;
      for (i = 0; i < q; i++) {
        if (i === A || i === B) continue;
        var pd = perpDist2(cx[i], cy[i], cx[A], cy[A], cx[B], cy[B]);
        if (pd > fd) { fd = pd; fi = i; }
      }
      if (fi >= 0) { keepIdx.push(fi); keepIdx.sort(function (a2, b2) { return a2 - b2; }); }
    }

    var ox = new Float64Array(keepIdx.length), oy = new Float64Array(keepIdx.length);
    for (i = 0; i < keepIdx.length; i++) { ox[i] = cx[keepIdx[i]]; oy[i] = cy[keepIdx[i]]; }
    return { xs: ox, ys: oy };
  }

  /* --------------------------------------------------------------- corners */

  /* Walk `arm` px of arc length from vertex i in one direction, interpolating
     inside the edge where the arm runs out, and return the point reached. */
  function armPoint(xs, ys, n, i, arm, forward) {
    var rem = arm, j = i, steps = 0;
    while (steps++ <= n) {
      var k = forward ? (j + 1) % n : (j + n - 1) % n;
      var dx = xs[k] - xs[j], dy = ys[k] - ys[j];
      var L = Math.sqrt(dx * dx + dy * dy);
      if (L <= 0) { j = k; continue; }
      if (L >= rem) {
        var t = rem / L;
        return [xs[j] + dx * t, ys[j] + dy * t];
      }
      rem -= L;
      j = k;
    }
    return [xs[j], ys[j]];
  }

  /* A vertex is a corner when the two arms leaving it enclose an angle below
     cornerAngle. The arms are measured in arc length rather than in vertices,
     so the test does not care whether the ring arrived here as 3 long edges or
     as 40 crack steps.
     Sharp features often light up two or three neighbouring vertices at once.
     Only the sharpest of a cluster survives, where "cluster" means "within one
     arm length along the ring", so the four corners of a rectangle, which are
     far apart, all survive. */
  function findCorners(xs, ys, opts) {
    opts = opts || {};
    var limit = opts.cornerAngle == null ? 100 : +opts.cornerAngle;
    var arm = opts.arm == null ? 4 : +opts.arm;
    var n = xs.length;
    if (n < 3 || !(arm > 0)) return new Int32Array(0);

    var ang = new Float64Array(n).fill(360);
    var cand = [];
    for (var i = 0; i < n; i++) {
      var pb = armPoint(xs, ys, n, i, arm, false);
      var pf = armPoint(xs, ys, n, i, arm, true);
      var v1x = pb[0] - xs[i], v1y = pb[1] - ys[i];
      var v2x = pf[0] - xs[i], v2y = pf[1] - ys[i];
      var l1 = Math.sqrt(v1x * v1x + v1y * v1y), l2 = Math.sqrt(v2x * v2x + v2y * v2y);
      if (!(l1 > 0) || !(l2 > 0)) continue;
      var c = clamp((v1x * v2x + v1y * v2y) / (l1 * l2), -1, 1);
      var a = Math.acos(c) * 180 / Math.PI;
      ang[i] = a;
      if (a < limit) cand.push(i);
    }
    if (cand.length < 2) return Int32Array.from(cand);

    var isCand = new Uint8Array(n);
    for (var c2 = 0; c2 < cand.length; c2++) isCand[cand[c2]] = 1;

    function beaten(i) {
      for (var dir = 0; dir < 2; dir++) {
        var rem = arm, j = i, steps = 0;
        while (steps++ <= n) {
          var k = dir ? (j + 1) % n : (j + n - 1) % n;
          var dx = xs[k] - xs[j], dy = ys[k] - ys[j];
          rem -= Math.sqrt(dx * dx + dy * dy);
          if (rem < 0) break;
          j = k;
          if (j === i) break;
          if (isCand[j] && (ang[j] < ang[i] || (ang[j] === ang[i] && j < i))) return true;
        }
      }
      return false;
    }

    var out = [];
    for (var c3 = 0; c3 < cand.length; c3++) if (!beaten(cand[c3])) out.push(cand[c3]);
    return Int32Array.from(out);
  }

  /* ---------------------------------------------------------- curve fitting */

  function bezierPoint(bez, t) {
    var mt = 1 - t;
    var b0 = mt * mt * mt, b1 = 3 * t * mt * mt, b2 = 3 * t * t * mt, b3 = t * t * t;
    return [
      bez[0] * b0 + bez[2] * b1 + bez[4] * b2 + bez[6] * b3,
      bez[1] * b0 + bez[3] * b1 + bez[5] * b2 + bez[7] * b3
    ];
  }

  function bezierDeriv(bez, t) {
    var mt = 1 - t;
    var ax = 3 * (bez[2] - bez[0]), ay = 3 * (bez[3] - bez[1]);
    var bx = 3 * (bez[4] - bez[2]), by = 3 * (bez[5] - bez[3]);
    var cx = 3 * (bez[6] - bez[4]), cy = 3 * (bez[7] - bez[5]);
    return [
      ax * mt * mt + bx * 2 * mt * t + cx * t * t,
      ay * mt * mt + by * 2 * mt * t + cy * t * t
    ];
  }

  function bezierDeriv2(bez, t) {
    var ax = 6 * (bez[4] - 2 * bez[2] + bez[0]), ay = 6 * (bez[5] - 2 * bez[3] + bez[1]);
    var bx = 6 * (bez[6] - 2 * bez[4] + bez[2]), by = 6 * (bez[7] - 2 * bez[5] + bez[3]);
    return [ax * (1 - t) + bx * t, ay * (1 - t) + by * t];
  }

  /* Largest distance (not squared: maxError is a pixel count the user set) from
     the sample points to the curve at their parameters, plus where it happened. */
  function bezierMaxError(pts, u, bez) {
    var worst = 0, at = pts.length >> 1;
    for (var i = 1; i < pts.length - 1; i++) {
      var p = bezierPoint(bez, u[i]);
      var dx = p[0] - pts[i][0], dy = p[1] - pts[i][1];
      var d = Math.sqrt(dx * dx + dy * dy);
      if (d > worst) { worst = d; at = i; }
    }
    return { error: worst, index: at };
  }

  function chordParams(pts) {
    var n = pts.length, u = new Float64Array(n);
    for (var i = 1; i < n; i++) {
      var dx = pts[i][0] - pts[i - 1][0], dy = pts[i][1] - pts[i - 1][1];
      u[i] = u[i - 1] + Math.sqrt(dx * dx + dy * dy);
    }
    var total = u[n - 1];
    if (total > 0) for (var j = 1; j < n; j++) u[j] /= total;
    else for (var k = 1; k < n; k++) u[k] = k / (n - 1);
    u[n - 1] = 1;
    return u;
  }

  function polyLength(pts) {
    var L = 0;
    for (var i = 1; i < pts.length; i++) {
      var dx = pts[i][0] - pts[i - 1][0], dy = pts[i][1] - pts[i - 1][1];
      L += Math.sqrt(dx * dx + dy * dy);
    }
    return L;
  }

  /* Least squares for the two control point magnitudes, with the end points and
     both end tangent DIRECTIONS held fixed. The 2x2 normal equations over the
     cubic Bernstein basis, exactly the classical formulation.
     Every degenerate outcome (a singular system, a magnitude that came out
     negative, one that came out absurdly long and would make the curve loop)
     falls back to the Wu/Barsky heuristic, a third of the chord. On a closed run
     the chord is zero, so the fallback uses a third of the polyline length
     instead; without that a closed loop would collapse to a point. */
  function generateBezier(pts, u, t1, t2) {
    var n = pts.length;
    var p0 = pts[0], p3 = pts[n - 1];
    var C00 = 0, C01 = 0, C11 = 0, X0 = 0, X1 = 0;
    for (var i = 0; i < n; i++) {
      var ui = u[i], mt = 1 - ui;
      var b0 = mt * mt * mt, b1 = 3 * ui * mt * mt, b2 = 3 * ui * ui * mt, b3 = ui * ui * ui;
      var a1x = t1[0] * b1, a1y = t1[1] * b1;
      var a2x = t2[0] * b2, a2y = t2[1] * b2;
      C00 += a1x * a1x + a1y * a1y;
      C01 += a1x * a2x + a1y * a2y;
      C11 += a2x * a2x + a2y * a2y;
      var tx = pts[i][0] - (p0[0] * (b0 + b1) + p3[0] * (b2 + b3));
      var ty = pts[i][1] - (p0[1] * (b0 + b1) + p3[1] * (b2 + b3));
      X0 += a1x * tx + a1y * ty;
      X1 += a2x * tx + a2y * ty;
    }
    var det = C00 * C11 - C01 * C01;
    var alpha1 = 0, alpha2 = 0;
    if (det > 1e-12 || det < -1e-12) {
      alpha1 = (X0 * C11 - X1 * C01) / det;
      alpha2 = (C00 * X1 - C01 * X0) / det;
    }
    var chord = Math.sqrt((p3[0] - p0[0]) * (p3[0] - p0[0]) + (p3[1] - p0[1]) * (p3[1] - p0[1]));
    var plen = polyLength(pts);
    var cap = 3 * (plen > 0 ? plen : 1);
    if (!(alpha1 > 1e-9) || !(alpha2 > 1e-9) || alpha1 > cap || alpha2 > cap) {
      var fb = (chord > 1e-9 ? chord : plen) / 3;
      alpha1 = fb; alpha2 = fb;
    }
    return [
      p0[0], p0[1],
      p0[0] + t1[0] * alpha1, p0[1] + t1[1] * alpha1,
      p3[0] + t2[0] * alpha2, p3[1] + t2[1] * alpha2,
      p3[0], p3[1]
    ];
  }

  /* One Newton-Raphson step per point: project it onto the curve by driving the
     derivative of the squared distance to zero. */
  function reparameterize(pts, u, bez) {
    var n = pts.length, out = new Float64Array(n);
    out[0] = 0; out[n - 1] = 1;
    for (var i = 1; i < n - 1; i++) {
      var t = u[i];
      var p = bezierPoint(bez, t), d1 = bezierDeriv(bez, t), d2 = bezierDeriv2(bez, t);
      var dx = p[0] - pts[i][0], dy = p[1] - pts[i][1];
      var num = dx * d1[0] + dy * d1[1];
      var den = d1[0] * d1[0] + d1[1] * d1[1] + dx * d2[0] + dy * d2[1];
      var nt = (den > 1e-12 || den < -1e-12) ? t - num / den : t;
      if (!(nt >= 0)) nt = 0;
      if (nt > 1) nt = 1;
      out[i] = nt;
    }
    /* a reparameterization that lost its order is worse than none */
    for (var j = 1; j < n; j++) if (out[j] < out[j - 1]) return Float64Array.from(u);
    return out;
  }

  function normalize(x, y) {
    var L = Math.sqrt(x * x + y * y);
    return L > 0 ? [x / L, y / L] : [0, 0];
  }

  var COLLINEAR_EPS = 1e-9;
  var LINE_TOL = 0.35;   /* default lineTol, see point 5 in the header */

  /* Every interior vertex within `tol` of the chord. A closed run (both ends on
     the same point) is never straight: it has no chord to be straight along. */
  function runIsStraight(pts, tol) {
    var n = pts.length;
    var ax = pts[0][0], ay = pts[0][1], bx = pts[n - 1][0], by = pts[n - 1][1];
    if (ax === bx && ay === by) return false;
    var t = tol > COLLINEAR_EPS ? tol : COLLINEAR_EPS;
    var t2 = t * t;
    for (var i = 1; i < n - 1; i++) {
      if (perpDist2(pts[i][0], pts[i][1], ax, ay, bx, by) > t2) return false;
    }
    return true;
  }

  /* The safety net after a fit: a cubic whose two control points sit on its own
     chord draws a straight line and should say so. The projection test is not
     redundant with the distance test: a control point can be on the chord LINE
     and far behind an end point, which is a cusp or an S, not a flat run. */
  function cubicIsFlat(bez, tol) {
    if (!(tol > 0)) return false;
    var ax = bez[0], ay = bez[1], bx = bez[6], by = bez[7];
    var dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
    if (!(L2 > 0)) return false;
    var t2 = tol * tol;
    for (var k = 2; k <= 4; k += 2) {
      if (perpDist2(bez[k], bez[k + 1], ax, ay, bx, by) > t2) return false;
      var s = ((bez[k] - ax) * dx + (bez[k + 1] - ay) * dy) / L2;
      if (s < -0.05 || s > 1.05) return false;
    }
    return true;
  }

  function emitLine(out, pts) {
    var n = pts.length;
    out.push({ l: [pts[0][0], pts[0][1], pts[n - 1][0], pts[n - 1][1]] });
  }

  function emitCubic(out, bez, lineTol) {
    if (cubicIsFlat(bez, lineTol)) out.push({ l: [bez[0], bez[1], bez[6], bez[7]] });
    else out.push({ c: bez });
  }

  /* Is every vertex strictly between i and j within tol of the chord i..j? */
  function spanStraight(pts, i, j, tol) {
    var ax = pts[i][0], ay = pts[i][1], bx = pts[j][0], by = pts[j][1];
    if (ax === bx && ay === by) return false;
    var t2 = tol * tol;
    for (var k = i + 1; k < j; k++) {
      if (perpDist2(pts[k][0], pts[k][1], ax, ay, bx, by) > t2) return false;
    }
    return true;
  }

  var LINE_MIN_FRAC = 0.5;   /* of the run's polyline length */
  var LINE_MIN_LEN = 3;      /* px */

  /* The straight-line detector, and the reason small serif text stopped waving.
     A corner-to-corner run through a letter stem is NOT straight as a whole: it
     is serif bracket, then 40 px of dead straight stem, then the other bracket.
     The whole-run test therefore never fires, the fitter sees one run, borrows
     its end tangents from the two one-pixel bracket edges and bows the stem
     between them. So the longest straight SUBRUN is found and cut out, and the
     two remainders are fitted on their own.
     The two guards are what keep this from turning a circle into a polygon.
     A round run also contains straight subruns (any arc whose sagitta is under
     lineTol reads as straight), so length alone would chop it. But such a
     subrun is a small FRACTION of a round run and the dominant part of a
     stem-shaped one: on a quarter circle of radius R the straight span is about
     sqrt(8*R*lineTol), which is 12% of the arc at R = 80 and 20% at R = 30,
     against 80% for the stem. Half the run length is the divide, with an
     absolute floor so a three-pixel feature is left alone.
     Returns [i, j] or null. Single edges count: after simplification a straight
     stem usually IS one edge, which is exactly the case that has to be caught. */
  function longestStraight(pts, tol) {
    var n = pts.length;
    if (n < 3 || !(tol > 0)) return null;
    var total = polyLength(pts);
    if (!(total > 0)) return null;
    var need = Math.max(LINE_MIN_LEN, LINE_MIN_FRAC * total);
    var bi = -1, bj = -1, bl = 0;
    /* j never moves back, so the scan costs one pass plus the re-tests inside
       the current window rather than a quadratic sweep. */
    var j = 1;
    for (var i = 0; i + 1 < n; i++) {
      if (j < i + 1) j = i + 1;
      while (j + 1 < n && spanStraight(pts, i, j + 1, tol)) j++;
      var dx = pts[j][0] - pts[i][0], dy = pts[j][1] - pts[i][1];
      var L = Math.sqrt(dx * dx + dy * dy);
      if (j > i && L > bl) { bl = L; bi = i; bj = j; }
    }
    if (bi < 0 || bl < need) return null;
    /* the whole run: the caller already handled that case */
    if (bi === 0 && bj === n - 1) return null;
    return [bi, bj];
  }

  function edgeDir(pts, from, to) {
    return normalize(pts[to][0] - pts[from][0], pts[to][1] - pts[from][1]);
  }

  /* One run, corner to corner. Straight parts become lines, the rest goes to the
     cubic fitter.
     Tangents at a line join are deliberately NOT taken from the line: the
     neighbouring curve keeps its own local polygon edge direction, the same rule
     fitRing uses at a corner. Forcing tangency to the line would round off a
     junction that is a genuine corner (the corner detector does miss some), and
     the visible defect this fix is about was the opposite one anyway, a curve
     tangent imposed on a straight stem rather than a line tangent imposed on a
     curve. Sharp stays sharp; the line no longer bends. */
  function fitRun(pts, t1, t2, maxError, lineTol, out) {
    var n = pts.length;
    if (n < 2) return;
    if (runIsStraight(pts, lineTol)) { emitLine(out, pts); return; }
    var span = longestStraight(pts, lineTol);
    if (span) {
      var i = span[0], j = span[1];
      if (i > 0) {
        fitRun(pts.slice(0, i + 1), t1, edgeDir(pts, i, i - 1), maxError, lineTol, out);
      }
      out.push({ l: [pts[i][0], pts[i][1], pts[j][0], pts[j][1]] });
      if (j < n - 1) {
        fitRun(pts.slice(j), edgeDir(pts, j, j + 1), t2, maxError, lineTol, out);
      }
      return;
    }
    fitCubic(pts, t1, t2, maxError, lineTol, 0, out);
  }

  function fitCubic(pts, t1, t2, maxError, lineTol, depth, out) {
    var n = pts.length;
    if (n < 2) return;
    if (n === 2 || runIsStraight(pts, lineTol)) {
      emitLine(out, pts);
      return;
    }
    /* A run with exactly one interior point is a trap. The two unknowns are the
       two control arm magnitudes and that one point contributes two equations,
       so the least squares system is square and the cubic interpolates it
       exactly, whatever shape it has. bezierMaxError then dutifully reports
       zero, the fit is accepted, and a curve that overshoots the polygon by
       tens of pixels between the samples is emitted with nothing to catch it.
       That is not a tolerance being met, it is a tolerance with no evidence
       behind it: one sample is not evidence of a curve. Emit the polyline the
       run actually is; a genuinely round run at this sampling density will have
       been simplified with a tolerance that says it may be a polygon. */
    if (n === 3) {
      out.push({ l: [pts[0][0], pts[0][1], pts[1][0], pts[1][1]] });
      out.push({ l: [pts[1][0], pts[1][1], pts[2][0], pts[2][1]] });
      return;
    }
    var u = chordParams(pts);
    var bez = generateBezier(pts, u, t1, t2);
    var err = bezierMaxError(pts, u, bez);
    if (err.error <= maxError) { emitCubic(out, bez, lineTol); return; }

    if (err.error <= maxError * 4 && depth < 12) {
      for (var pass = 0; pass < 4; pass++) {
        u = reparameterize(pts, u, bez);
        bez = generateBezier(pts, u, t1, t2);
        err = bezierMaxError(pts, u, bez);
        if (err.error <= maxError) { emitCubic(out, bez, lineTol); return; }
      }
    }

    if (depth >= 12) { emitCubic(out, bez, lineTol); return; }

    var split = err.index;
    if (split < 1) split = 1;
    if (split > n - 2) split = n - 2;
    var v1 = normalize(pts[split - 1][0] - pts[split][0], pts[split - 1][1] - pts[split][1]);
    var v2 = normalize(pts[split][0] - pts[split + 1][0], pts[split][1] - pts[split + 1][1]);
    var tc = normalize(v1[0] + v2[0], v1[1] + v2[1]);
    if (tc[0] === 0 && tc[1] === 0) {
      tc = normalize(pts[split - 1][0] - pts[split + 1][0], pts[split - 1][1] - pts[split + 1][1]);
    }
    fitCubic(pts.slice(0, split + 1), t1, tc, maxError, lineTol, depth + 1, out);
    fitCubic(pts.slice(split), [-tc[0], -tc[1]], t2, maxError, lineTol, depth + 1, out);
  }

  /* Split a ring into open runs and fit each one.
     With corners, the runs go corner to corner and the end tangents follow the
     adjacent polygon edge, which is what keeps a corner a corner: the curve
     leaves it in the direction the polygon does.
     Without corners the ring is smooth all the way round and there is no natural
     place to start, so it is cut at the vertex farthest from the centroid (a
     stable, rotation-independent choice) plus three more cuts spaced evenly by
     index. Four cuts rather than one, because a single cubic whose start and end
     point coincide has no chord to size its control arms by; four is also the
     canonical way a circle is written in SVG and lands well within the tolerance
     on anything round. The tangent at such a cut is a central difference across
     it, so the two runs meeting there stay G1. */
  function fitRing(xs, ys, corners, opts) {
    opts = opts || {};
    var maxError = opts.maxError == null ? 1.0 : +opts.maxError;
    var lineTol = opts.lineTol == null ? LINE_TOL : +opts.lineTol;
    var smooth = opts.smooth !== false;
    var n = xs.length;
    var segs = [];
    if (n < 2) return segs;

    var i;
    if (!smooth) {
      for (i = 0; i < n; i++) {
        var j = (i + 1) % n;
        segs.push({ l: [xs[i], ys[i], xs[j], ys[j]] });
      }
      return segs;
    }

    var cuts = [];
    if (corners && corners.length) {
      var seen = new Uint8Array(n);
      for (i = 0; i < corners.length; i++) {
        var ci = corners[i] | 0;
        if (ci >= 0 && ci < n && !seen[ci]) { seen[ci] = 1; cuts.push(ci); }
      }
      cuts.sort(function (a, b) { return a - b; });
    }

    var smoothCut = cuts.length === 0;
    if (smoothCut) {
      var gx = 0, gy = 0;
      for (i = 0; i < n; i++) { gx += xs[i]; gy += ys[i]; }
      gx /= n; gy /= n;
      var seam = 0, sd = -1;
      for (i = 0; i < n; i++) {
        var ddx = xs[i] - gx, ddy = ys[i] - gy, d2 = ddx * ddx + ddy * ddy;
        if (d2 > sd) { sd = d2; seam = i; }
      }
      var k = Math.min(4, Math.max(2, Math.floor(n / 2)));
      for (i = 0; i < k; i++) cuts.push((seam + Math.round(i * n / k)) % n);
      cuts = cuts.filter(function (v, idx, arr) { return arr.indexOf(v) === idx; });
      cuts.sort(function (a, b) { return a - b; });
      if (cuts.length < 2) { cuts = [0, n >> 1]; }
    }

    function central(idx) {
      var a = (idx + n - 1) % n, b = (idx + 1) % n;
      return normalize(xs[b] - xs[a], ys[b] - ys[a]);
    }

    for (var c = 0; c < cuts.length; c++) {
      var from = cuts[c], to = cuts[(c + 1) % cuts.length];
      var pts = [], p = from;
      for (;;) {
        pts.push([xs[p], ys[p]]);
        if (p === to && pts.length > 1) break;
        p = (p + 1) % n;
        if (pts.length > n + 1) break;
      }
      if (pts.length < 2) continue;
      var t1, t2;
      if (smoothCut) {
        t1 = central(from);
        var te = central(to);
        t2 = [-te[0], -te[1]];
      } else {
        t1 = normalize(pts[1][0] - pts[0][0], pts[1][1] - pts[0][1]);
        t2 = normalize(pts[pts.length - 2][0] - pts[pts.length - 1][0],
                       pts[pts.length - 2][1] - pts[pts.length - 1][1]);
      }
      if (t1[0] === 0 && t1[1] === 0) t1 = [1, 0];
      if (t2[0] === 0 && t2[1] === 0) t2 = [-1, 0];
      fitRun(pts, t1, t2, maxError, lineTol, segs);
    }
    return segs;
  }

  /* ------------------------------------------------------------- d strings */

  /* Compact decimal: fixed places, then trailing zeros and a bare dot removed.
     Negative zero is written as zero, because "-0" in a path is noise. */
  function num(v, dec) {
    var s = (+v).toFixed(dec);
    if (s.indexOf('.') >= 0) s = s.replace(/0+$/, '').replace(/\.$/, '');
    if (s === '-0') s = '0';
    return s;
  }

  function ringToPath(segs, dec) {
    if (!segs.length) return '';
    var first = segs[0].c ? [segs[0].c[0], segs[0].c[1]] : [segs[0].l[0], segs[0].l[1]];
    var parts = ['M ' + num(first[0], dec) + ' ' + num(first[1], dec)];
    var nodes = 1;
    for (var i = 0; i < segs.length; i++) {
      var s = segs[i];
      var last = i === segs.length - 1;
      if (s.c) {
        parts.push('C ' + num(s.c[2], dec) + ' ' + num(s.c[3], dec) + ' ' +
                   num(s.c[4], dec) + ' ' + num(s.c[5], dec) + ' ' +
                   num(s.c[6], dec) + ' ' + num(s.c[7], dec));
        nodes++;
      } else {
        /* The closing L is redundant, Z draws it. Dropping it keeps the anchor
           count honest and the string shorter. */
        if (last) continue;
        parts.push('L ' + num(s.l[2], dec) + ' ' + num(s.l[3], dec));
        nodes++;
      }
    }
    parts.push('Z');
    return { d: parts.join(' '), nodes: nodes - (segs[segs.length - 1].c ? 1 : 0) };
  }

  /* ------------------------------------------------------------- pipeline */

  function traceMask(mask, w, h, opts) {
    opts = opts || {};
    var dec = opts.decimals == null ? 2 : opts.decimals | 0;
    var tol = opts.tol == null ? 1.0 : +opts.tol;
    var maxError = opts.maxError == null ? 1.0 : +opts.maxError;
    var lineTol = opts.lineTol == null ? LINE_TOL : +opts.lineTol;
    var cornerAngle = opts.cornerAngle == null ? 100 : +opts.cornerAngle;
    var smooth = opts.smooth !== false;

    var m = despeckle(mask, w, h, {
      minArea: opts.despeckleArea || 0,
      minHole: opts.despeckleHole || 0
    });
    m = smoothMask(m, w, h, {
      radius: opts.smoothRadius || 0,
      mode: opts.smoothMode === 'morph' ? 'morph' : 'blur'
    });

    var rings = extractContours(m, w, h, { policy: opts.policy });

    /* A ring enclosing less than a pixel is either a crack artefact or a speck
       the user did not ask to keep; either way it is not geometry. Dropped here,
       on the exact crack areas, before refinement blurs the number. */
    var keep = [];
    for (var r = 0; r + 1 < rings.starts.length; r++) {
      if (Math.abs(rings.areas[r]) >= 1) keep.push(r);
    }

    if (opts.field && opts.subpixel !== false) {
      rings = refineSubpixel(rings, opts.field, w, h, { iterations: opts.iterations || 1 });
    }

    var subpaths = [], nodes = 0, segments = 0;
    for (var q = 0; q < keep.length; q++) {
      var a = rings.starts[keep[q]], b = rings.starts[keep[q] + 1];
      var sub = simplifyRing(rings.xs.subarray(a, b), rings.ys.subarray(a, b), tol);
      if (sub.xs.length < 3) continue;
      var corners = smooth ? findCorners(sub.xs, sub.ys, {
        cornerAngle: cornerAngle,
        arm: opts.arm == null ? 4 : +opts.arm
      }) : new Int32Array(0);
      var segs = fitRing(sub.xs, sub.ys, corners,
        { maxError: maxError, lineTol: lineTol, smooth: smooth });
      if (!segs.length) continue;
      var res = ringToPath(segs, dec);
      if (!res.d) continue;
      subpaths.push(res.d);
      nodes += res.nodes;
      segments += segs.length;
    }

    return {
      subpaths: subpaths,
      d: subpaths.join(' '),
      stats: { rings: subpaths.length, nodes: nodes, segments: segments }
    };
  }

  /* ------------------------------------------------------------------ svg */

  /* Colours and paths come from the caller. Only the colours are interpolated
     into attribute values without further structure, so strip the characters
     that could end the attribute or start markup, the same way the QR generator
     does. A colour containing any of them is malformed anyway, so dropping them
     beats inventing entities. */
  function sanitizeColor(s) {
    return String(s).replace(/[<>&"]/g, '');
  }

  function svgDocument(layers, opts) {
    opts = opts || {};
    var dec = opts.decimals == null ? 2 : opts.decimals | 0;
    var w = num(+opts.width || 0, dec), h = num(+opts.height || 0, dec);
    var parts = ['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + w + ' ' + h +
                 '" width="' + w + '" height="' + h + '">'];
    if (opts.background != null && opts.background !== '') {
      parts.push('<rect x="0" y="0" width="' + w + '" height="' + h +
                 '" fill="' + sanitizeColor(opts.background) + '"/>');
    }
    var list = layers || [];
    for (var i = 0; i < list.length; i++) {
      var L = list[i] || {};
      var op = '';
      if (L.opacity != null && +L.opacity < 1) {
        op = ' fill-opacity="' + num(clamp(+L.opacity, 0, 1), 3) + '"';
      }
      parts.push('<path fill="' + sanitizeColor(L.fill == null ? '#000000' : L.fill) +
                 '" fill-rule="nonzero"' + op + ' d="' + String(L.d || '').replace(/[<>&"]/g, '') + '"/>');
    }
    parts.push('</svg>');
    return parts.join('\n');
  }

  var TraceCore = {
    version: VERSION,
    maskFromThreshold: maskFromThreshold,
    grayField: grayField,
    maskFromLabels: maskFromLabels,
    labelComponents: labelComponents,
    despeckle: despeckle,
    smoothMask: smoothMask,
    boxBlur: boxBlur,
    extractContours: extractContours,
    signedArea: signedArea,
    sampleField: sampleField,
    refineSubpixel: refineSubpixel,
    dpSimplify: dpSimplify,
    simplifyRing: simplifyRing,
    findCorners: findCorners,
    bezierPoint: bezierPoint,
    bezierMaxError: bezierMaxError,
    fitRing: fitRing,
    traceMask: traceMask,
    svgDocument: svgDocument
  };

  if (typeof globalThis !== 'undefined') globalThis.TraceCore = TraceCore;
})();
