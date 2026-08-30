/* color-core.js -- the color quantization engine for alber.me tools.
 *
 * OKLab conversion, seeded k-means++ with perceptual axis weighting, cluster
 * refinement, palette extraction, quantization and full-resolution labeling.
 * This is the engine of the color extractor
 * (miscellaneous/tools/color-extractor.html); it lived inline there as
 * <script id="colorcore"> until 2026-08-25 and became a module so pixel2vector
 * can reuse it. The code between the COLOR-CORE markers is the block, moved
 * verbatim; only the export line changed and labelImage() was added.
 *
 * Added 2026-08-25, after the vectorizer benchmark: an opt-in vivid rescue,
 * extract(img, {k, vividRescue: true}). Plain k-means spends its centroids
 * where the pixels are, so a few hundred fully saturated pixels (the lit LEDs
 * on a photographed circuit board) lose to a field of grey and get quantized
 * into it even at k = 10. The rescue is a split-and-merge pass that runs after
 * the normal k-means: it moves the cheapest-to-give-up centroid onto the vivid
 * color the palette serves worst, re-converges, and rolls the round back if
 * that centroid cannot hold its own. Off by default, so nothing changes for a
 * caller that does not ask for it, and the color extractor does not.
 * rescueVivid() carries the long version.
 *
 * Plain script, no imports, no DOM: images are ImageData-like plain objects
 * {width, height, data} with RGBA bytes. Everything hangs off
 * globalThis.ColorCore, which makes it loadable with <script src> in the page,
 * with importScripts in a worker, and by eval in the Node tests
 * (notes/dev/color.test.mjs).
 */

  /* COLOR-CORE-START -- pure pipeline, no DOM except one canvas read; also runnable
     under Node for tests (samplePixels takes an ImageData-like {data,width,height}). */
  var ColorCore = (function () {
    'use strict';

    /* ---------- tunables -------------------------------------------------- */
    var MAX_PX = 60000;           // ~245x245; enough for stable clusters, 50x cheaper than full res
    var AUTO_K = 12;              // starting k in auto mode, reduced by refine()
    var MERGE_THRESHOLD = 0.12;   // OKLab distance below which two clusters are the same color
    var MIN_SHARE = 0.02;         // pixel share below which a cluster is not a palette color
    var KMEANS_ITERS = 24;
    /* How much the color axes count against the lightness axis when clustering.
       k-means minimises variance, and greys are spread over the whole light-dark
       range while a saturated color sits in a tight lump: on a photo of grey
       objects with one green highlight the greys contributed ~8x more error than
       the green, so every new cluster went into splitting greys and the green was
       still missing at k=6 despite covering 9.5 % of the image. Weighting a and b
       makes colorfulness count for as much as brightness. Greyscale images are
       unaffected (a = b = 0 there); it only changes which of two competing splits
       wins. Applied to the clustering only - the reported colors are still real
       pixel values. */
    var CHROMA_WEIGHT = 2;
    /* Default weights of the three perceptual axes, as {l, c, h}. The pair
       (c = h = CHROMA_WEIGHT) reproduces the older single-slider behaviour
       exactly, because scaling chroma and hue by the same factor is the same
       thing as scaling a and b. See weightLab() for why they can be separated. */
    var AXIS_WEIGHTS = { l: 1, c: CHROMA_WEIGHT, h: CHROMA_WEIGHT };

    /* ---------- sRGB <-> OKLab (Ottosson 2020) ---------------------------- */
    /* Euclidean distance in sRGB is perceptually useless: green dominates the
       metric and dark tones collapse into each other. OKLab is closed-form,
       ~15 flops per pixel, and roughly perceptually uniform. The matrices are
       exact - do not retype them from memory. */
    var SRGB_LIN = new Float32Array(256);
    for (var i = 0; i < 256; i++) {
      var c = i / 255;
      SRGB_LIN[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    }

    function rgbToOklab(r, g, b, out, o) {
      var R = SRGB_LIN[r], G = SRGB_LIN[g], B = SRGB_LIN[b];
      var l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
      var m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
      var s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
      out[o]     = 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s;
      out[o + 1] = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s;
      out[o + 2] = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s;
    }

    /* Linear-light sRGB, deliberately UNCLAMPED. A channel below 0 or above 1
       is the only way to tell that an OKLab point lies outside the sRGB gamut,
       which is what gamut mapping has to decide. oklabToRgb clamps that signal
       away, so it cannot answer the question and this exists next to it. */
    function oklabToLinear(L, a, b) {
      var l_ = L + 0.3963377774 * a + 0.2158037573 * b;
      var m_ = L - 0.1055613458 * a - 0.0638541728 * b;
      var s_ = L - 0.0894841775 * a - 1.2914855480 * b;
      var l = l_ * l_ * l_, m = m_ * m_ * m_, s = s_ * s_ * s_;
      return [
         4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
        -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
        -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
      ];
    }

    /* Clamping is required, not optional: the sRGB gamut is not convex in OKLab,
       so a centroid of valid colors can land just outside it. */
    function oklabToRgb(L, a, b) {
      return oklabToLinear(L, a, b).map(function (v) {
        var g = v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(Math.max(v, 0), 1 / 2.4) - 0.055;
        return Math.min(255, Math.max(0, Math.round(g * 255)));
      });
    }

    function hex(r, g, b) {
      return '#' + [r, g, b].map(function (v) {
        return Math.round(v).toString(16).padStart(2, '0');
      }).join('');
    }

    /* ---------- seeded PRNG ----------------------------------------------- */
    /* k-means++ picks its seeds at random. With Math.random two runs on the same
       image give slightly different hex values and orderings, which reads as a
       bug in a public tool. mulberry32 (Tommy Ettinger, public domain) seeded from
       the image makes it repeatable. */
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

    /* ---------- sampling --------------------------------------------------- */
    function scaleFor(w, h) {
      return Math.min(1, Math.sqrt(MAX_PX / (w * h)));
    }

    /* img: {data: Uint8ClampedArray RGBA, width, height} - an ImageData or any
       stand-in. Pixels with alpha < 128 are dropped: a transparent logo would
       otherwise be reported as mostly "the color of nothing". */
    function samplePixels(img) {
      var n = img.width * img.height;
      var data = img.data;
      var lab = new Float32Array(n * 3);
      var rgb = new Uint8Array(n * 3);
      var k = 0;
      for (var i = 0; i < n; i++) {
        var p = i * 4;
        if (data[p + 3] < 128) continue;
        var r = data[p], g = data[p + 1], b = data[p + 2];
        rgb[k * 3] = r; rgb[k * 3 + 1] = g; rgb[k * 3 + 2] = b;
        rgbToOklab(r, g, b, lab, k * 3);
        k++;
      }
      return { lab: lab.subarray(0, k * 3), rgb: rgb.subarray(0, k * 3), count: k };
    }

    /* ---------- k-means (Lloyd), k-means++ init. O(n*k*i) ------------------
       Seeding follows Arthur & Vassilvitskii, "k-means++: The Advantages of
       Careful Seeding" (SODA 2007): pick the first center uniformly, then each
       further one with probability proportional to its squared distance from the
       nearest center already chosen. Plain random seeding regularly misses a
       small but distinct color entirely. */
    function kmeans(lab, n, k, rnd, iters) {
      iters = iters == null ? KMEANS_ITERS : iters;
      var cent = new Float32Array(k * 3);
      var d2 = new Float32Array(n);

      var first = Math.min(n - 1, (rnd() * n) | 0);
      cent[0] = lab[first * 3]; cent[1] = lab[first * 3 + 1]; cent[2] = lab[first * 3 + 2];
      d2.fill(Infinity);

      for (var c = 1; c < k; c++) {
        var sum = 0;
        for (var i = 0; i < n; i++) {
          var dl = lab[i * 3] - cent[(c - 1) * 3];
          var da = lab[i * 3 + 1] - cent[(c - 1) * 3 + 1];
          var db = lab[i * 3 + 2] - cent[(c - 1) * 3 + 2];
          var d = dl * dl + da * da + db * db;
          if (d < d2[i]) d2[i] = d;
          sum += d2[i];
        }
        var target = rnd() * sum, pick = n - 1;
        for (var j = 0, acc = 0; j < n; j++) {
          acc += d2[j];
          if (acc >= target) { pick = j; break; }
        }
        cent[c * 3] = lab[pick * 3]; cent[c * 3 + 1] = lab[pick * 3 + 1]; cent[c * 3 + 2] = lab[pick * 3 + 2];
      }

      return lloyd(lab, n, k, cent, iters);
    }

    /* Lloyd iteration from centroids that are already placed. Split out of
       kmeans() so the vivid rescue below can re-converge after moving one
       centroid; kmeans() itself is unchanged, it just calls this after its
       k-means++ seeding. `cent` is used in place and returned.
       `frozen` is optional: a centroid marked in it still collects pixels but is
       never recomputed from them. Only the rescue uses it, and it uses it for
       exactly one reason - the mean of everything nearest to a saturated color
       is not that color, it is that color diluted by its own halo, so an
       unfrozen rescue converges straight back to the muddy centroid it was
       supposed to replace. */
    function lloyd(lab, n, k, cent, iters, frozen) {
      iters = iters == null ? KMEANS_ITERS : iters;
      var assign = new Int32Array(n);
      var sums = new Float64Array(k * 3), counts = new Int32Array(k);

      for (var it = 0; it < iters; it++) {
        var moved = 0;
        sums.fill(0); counts.fill(0);
        for (var q = 0; q < n; q++) {
          var best = 0, bd = Infinity;
          for (var cc = 0; cc < k; cc++) {
            var el = lab[q * 3] - cent[cc * 3];
            var ea = lab[q * 3 + 1] - cent[cc * 3 + 1];
            var eb = lab[q * 3 + 2] - cent[cc * 3 + 2];
            var e = el * el + ea * ea + eb * eb;
            if (e < bd) { bd = e; best = cc; }
          }
          if (assign[q] !== best) { assign[q] = best; moved++; }
          sums[best * 3] += lab[q * 3];
          sums[best * 3 + 1] += lab[q * 3 + 1];
          sums[best * 3 + 2] += lab[q * 3 + 2];
          counts[best]++;
        }
        for (var z = 0; z < k; z++) {
          if (!counts[z] || (frozen && frozen[z])) continue;
          cent[z * 3] = sums[z * 3] / counts[z];
          cent[z * 3 + 1] = sums[z * 3 + 1] / counts[z];
          cent[z * 3 + 2] = sums[z * 3 + 2] / counts[z];
        }
        if (moved === 0) break;
      }
      return { assign: assign, cent: cent, counts: counts };
    }

    /* ---------- vivid rescue (opt-in, off by default) ---------------------- */
    /* The problem it solves, seen on a photo of an LED badge: a handful of tiny
       but fully saturated light sources (pink, orange, yellow) cover well under
       a percent of the image each, so plain k-means never spends a centroid on
       them even at k = 10. Their pixels get folded into the nearest grey-brown
       and the vectorized result looks like the photo with the lights switched
       off. Squared error does not care, which is the point: the pixels are few.
       A person looking at the picture cares a great deal.
       CHROMA_WEIGHT already tilts the metric towards colorfulness, but it is a
       global scaling and cannot beat a mass ratio of a hundred to one.
       So: a split-and-merge pass in the spirit of ISODATA, run after the normal
       k-means has converged and only when the caller asks for it.
         1. Every sample pixel gets its squared residual to its own centroid.
         2. Pixels above RESCUE_CHROMA are binned into 5-bit-per-channel RGB
            bins, the same bins buildClusters() uses, and each bin accumulates
            the residual its pixels contribute. Binning rather than picking the
            single worst pixel is what keeps one JPEG outlier from becoming a
            palette color: a bin has to carry mass to win.
         3. The heaviest-residual bin wins, provided its pixels are worse served
            than the image average - if the vivid pixels are already well
            represented there is nothing to rescue.
         4. One existing centroid is sacrificed: the one with the smallest
            count * (distance to its nearest neighbour centroid)^2, which is the
            classical cost of merging a cluster into the one next to it. k stays
            exactly what the caller asked for.
         5. The sacrificed centroid is moved onto the winning bin's mean, pinned
            there, and Lloyd runs again so the rest of the palette re-settles
            around it. Pinned, because the mean of everything nearest to a
            saturated color is that color mixed with its own halo, and an
            unpinned centroid slides straight back into the grey it came from.
            If the pinned centroid cannot hold RESCUE_MIN_SHARE of the pixels,
            the round is rolled back and the pass stops.
       Rounds are protected against each other, so round two cannot evict what
       round one rescued, and the number of rounds is capped by rescueBudget().
       Deterministic throughout: no randomness is used here at all, the bin
       ordering is broken by key, and the pass is a pure function of the sample.
       Everything runs in the clustering space (`clab`), because that is where
       the centroids live; only the chroma test reads plain OKLab, where chroma
       has its usual meaning. */
    /* 0.10 in OKLab is genuinely saturated: pure sRGB red sits near 0.26, blue
       near 0.31, while skin, wood and a warm grey stay below 0.08. The threshold
       is absolute rather than relative to the image, because "vivid" is a claim
       about the color, not about its neighbours: on a picture with no saturated
       pixel at all the pass then simply finds nothing and does nothing. */
    var RESCUE_CHROMA = 0.10;
    var RESCUE_MIN_SHARE = 0.0005; // a rescued color has to hold this share, or the round is undone
    /* Pixels a bin needs before it may become a palette color, as a share of the
       sample rather than a count: a caller may hand the palette pass a
       decimated copy of the image (k-means is O(n*k*iters) and a megapixel is
       not needed to find ten colors), and an absolute floor would then silently
       switch the rescue off on exactly the small samples it was tuned on. The
       floor of 3 is there so a bin still has to be more than one stray pixel. */
    var RESCUE_MIN_BIN_SHARE = 2e-5;
    function rescueMinBin(n) { return Math.max(3, Math.ceil(n * RESCUE_MIN_BIN_SHARE)); }
    /* Each round spends a palette slot on a color that covers well under a
       percent of the image, and there is no squared-error argument for that: the
       error goes up, which is exactly why plain k-means did not do it. So the
       budget is a quarter of the palette, rounded down, at least one. Measured
       on the benchmark photo: at k = 6 one round is a small net win on mean
       |dRGB| against the original and three rounds are a disaster (17.9 against
       12.2), because at that palette size the fourth-cheapest cluster is still
       carrying a fifth of the picture. At k = 10 two rounds win on both counts. */
    function rescueBudget(k) { return Math.max(1, Math.floor(k / 4)); }
    /* Lloyd iterations for the re-convergence after a centroid is moved. Fewer
       than KMEANS_ITERS on purpose: the palette is already at a fixed point and
       only the neighbourhood of the moved centroid is unsettled, so the run is
       a touch-up, not a fit. Measured on the benchmark photo, 8 gives the same
       palette as 24 at k = 6 and k = 10 for 60 % of the time. */
    var RESCUE_ITERS = 8;

    function rescueVivid(clab, lab, rgb, n, k, km, rounds) {
      rounds = Math.max(0, Math.round(rounds == null ? rescueBudget(k) : rounds));
      if (!(rounds > 0) || k < 2 || n < 1) return km;
      var protectedAt = new Uint8Array(k);
      var minShare = Math.max(1, Math.ceil(n * RESCUE_MIN_SHARE));
      var minBin = rescueMinBin(n);

      for (var round = 0; round < rounds; round++) {
        var assign = km.assign, cent = km.cent, counts = km.counts;

        /* 1 + 2: residuals, and the vivid ones binned. The per-cluster a/b sums
           are collected in the same pass, for the victim rule below. */
        var bins = new Map();
        var totalD2 = 0;
        var sumA = new Float64Array(k), sumB = new Float64Array(k);
        for (var i = 0; i < n; i++) {
          var c = assign[i];
          sumA[c] += lab[i * 3 + 1]; sumB[c] += lab[i * 3 + 2];
          var dl = clab[i * 3] - cent[c * 3];
          var da = clab[i * 3 + 1] - cent[c * 3 + 1];
          var db = clab[i * 3 + 2] - cent[c * 3 + 2];
          var d2 = dl * dl + da * da + db * db;
          totalD2 += d2;
          var a = lab[i * 3 + 1], b = lab[i * 3 + 2];
          if (Math.sqrt(a * a + b * b) < RESCUE_CHROMA) continue;
          var key = ((rgb[i * 3] >> 3) << 10) | ((rgb[i * 3 + 1] >> 3) << 5) | (rgb[i * 3 + 2] >> 3);
          var e = bins.get(key);
          if (!e) { e = { n: 0, d2: 0, l: 0, a: 0, b: 0 }; bins.set(key, e); }
          e.n++; e.d2 += d2;
          e.l += clab[i * 3]; e.a += clab[i * 3 + 1]; e.b += clab[i * 3 + 2];
        }
        if (!bins.size) break;

        /* 3: the heaviest-residual bin that is also worse served than average.
           Ties break on the bin key, so the winner does not depend on Map
           insertion order. */
        var meanD2 = totalD2 / n;
        var best = null, bestKey = -1;
        bins.forEach(function (e, key) {
          if (e.n < minBin) return;
          if (e.d2 / e.n <= meanD2) return;
          if (!best || e.d2 > best.d2 || (e.d2 === best.d2 && key < bestKey)) { best = e; bestKey = key; }
        });
        if (!best) break;

        /* 4: cheapest cluster to give up. A cluster that is itself saturated is
           off limits, whether this pass put it there or k-means++ found it on
           its own: it is always the cheapest to merge away (a vivid cluster is
           small by definition), so without this the pass would spend every round
           swapping one saturated color for the next and end with exactly one. */
        var victim = -1, vcost = Infinity;
        for (var z = 0; z < k; z++) {
          if (protectedAt[z]) continue;
          if (counts[z]) {
            var ca = sumA[z] / counts[z], cb = sumB[z] / counts[z];
            if (Math.sqrt(ca * ca + cb * cb) >= RESCUE_CHROMA) continue;
          }
          var near = Infinity;
          for (var y = 0; y < k; y++) {
            if (y === z) continue;
            var el = cent[z * 3] - cent[y * 3];
            var ea = cent[z * 3 + 1] - cent[y * 3 + 1];
            var eb = cent[z * 3 + 2] - cent[y * 3 + 2];
            var ed = el * el + ea * ea + eb * eb;
            if (ed < near) near = ed;
          }
          var cost = counts[z] * near;
          if (cost < vcost) { vcost = cost; victim = z; }
        }
        if (victim < 0) break;

        /* 5: move it onto the vivid blob and re-converge, or roll back */
        var snapshot = Float32Array.from(cent);
        cent[victim * 3] = best.l / best.n;
        cent[victim * 3 + 1] = best.a / best.n;
        cent[victim * 3 + 2] = best.b / best.n;
        protectedAt[victim] = 1;
        var next = lloyd(clab, n, k, cent, RESCUE_ITERS, protectedAt);
        if (next.counts[victim] < minShare) {
          km.cent.set(snapshot);
          protectedAt[victim] = 0;
          break;
        }
        km = next;
      }
      km.pinned = protectedAt;
      return km;
    }

    /* ---------- cluster -> representative ---------------------------------- */
    /* Two legitimate answers, see MODE below. The histogram over 5-bit-per-channel
       bins folds JPEG noise together; the winning bin reports the exact mean of
       the real pixels inside it. */
    function buildClusters(rgb, n, k, assign, cent, counts) {
      var bins = [];
      for (var b0 = 0; b0 < k; b0++) bins.push(new Map());
      for (var i = 0; i < n; i++) {
        var c = assign[i];
        var r = rgb[i * 3], g = rgb[i * 3 + 1], b = rgb[i * 3 + 2];
        var key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
        var e = bins[c].get(key);
        if (!e) { e = { n: 0, r: 0, g: 0, b: 0 }; bins[c].set(key, e); }
        e.n++; e.r += r; e.g += g; e.b += b;
      }
      var out = [];
      for (var z = 0; z < k; z++) {
        if (!counts[z]) continue;
        out.push({
          lab: [cent[z * 3], cent[z * 3 + 1], cent[z * 3 + 2]],
          count: counts[z],
          bins: bins[z]
        });
      }
      return out;
    }

    function representative(bins) {
      var best = null;
      bins.forEach(function (e) { if (!best || e.n > best.n) best = e; });
      return [best.r / best.n, best.g / best.n, best.b / best.n];
    }

    function labDist(a, b) {
      var dl = a.lab[0] - b.lab[0], da = a.lab[1] - b.lab[1], db = a.lab[2] - b.lab[2];
      return Math.sqrt(dl * dl + da * da + db * db);
    }

    /* B is absorbed into A. Bins are added up, so A's representative (its most
       frequent bin) survives as long as A is the heavier cluster. */
    function absorb(cs, keepIdx, dropIdx) {
      var A = cs[keepIdx], B = cs[dropIdx], t = A.count + B.count;
      B.bins.forEach(function (e, key) {
        var x = A.bins.get(key);
        if (x) { x.n += e.n; x.r += e.r; x.g += e.g; x.b += e.b; }
        else A.bins.set(key, e);
      });
      A.lab = A.lab.map(function (v, i) { return (v * A.count + B.lab[i] * B.count) / t; });
      A.count = t;
      cs.splice(dropIdx, 1);
    }

    /* Auto mode, two independent criteria alternating to a fixed point:
       (1) similarity - centroids closer than thr are the same color.
       (2) salience - clusters below minShare are not a palette color and get
           swallowed by their perceptually nearest neighbour. Absorbed, not
           deleted, so the percentages still add up to 100.
       Similarity alone is not enough: white, red, yellow, pink and black all sit
       far apart, nothing merges, and you get eight "dominant" colors of which
       five are below 1 %. */
    function refine(clusters, total, thr, minShare) {
      var cs = clusters.slice();
      for (;;) {
        var bi = -1, bj = -1, bd = thr;
        for (var i = 0; i < cs.length; i++) {
          for (var j = i + 1; j < cs.length; j++) {
            var d = labDist(cs[i], cs[j]);
            if (d < bd) { bd = d; bi = i; bj = j; }
          }
        }
        if (bi >= 0) {
          // the heavier cluster survives and determines the hex value
          if (cs[bi].count >= cs[bj].count) absorb(cs, bi, bj);
          else absorb(cs, bj, bi);
          continue;
        }

        if (cs.length > 1) {
          var weak = -1, weakest = minShare;
          for (var w = 0; w < cs.length; w++) {
            var s = cs[w].count / total;
            if (s < weakest) { weakest = s; weak = w; }
          }
          if (weak >= 0) {
            /* Prefer a neighbour that is itself still below minShare. A color can
               arrive split across two clusters that are each too small - two halves
               of the same yellow, say. Handing each half to whatever large cluster
               happens to be nearest destroys the color twice over, and can even
               rename the absorber, because the merged histogram changes which bin
               wins. Letting the siblings coalesce first gives them one shared
               chance to clear the threshold on their own. */
            var near = -1, nd = Infinity, nearWeak = -1, ndWeak = Infinity;
            for (var q = 0; q < cs.length; q++) {
              if (q === weak) continue;
              var dq = labDist(cs[weak], cs[q]);
              if (dq < nd) { nd = dq; near = q; }
              if (cs[q].count / total < minShare && dq < ndWeak) { ndWeak = dq; nearWeak = q; }
            }
            var target = nearWeak >= 0 ? nearWeak : near;
            // the heavier of the two survives, so the hex value follows the mass
            if (cs[target].count >= cs[weak].count) absorb(cs, target, weak);
            else absorb(cs, weak, target);
            continue;
          }
        }
        return cs;
      }
    }

    /* After refine(), a cluster's centroid is a weighted average of the centroids
       it absorbed, while its displayed color comes from the winning histogram bin.
       Those two can drift apart far enough that a swatch sits closer to a
       neighbour's centroid than to its own - the palette then labels two adjacent
       colors the wrong way round. Fixing it at the source: take the final colors
       as the answer, assign every pixel to the nearest one, and recompute the
       shares from that. One extra pass over the sample, and afterwards the
       percentages describe exactly the colors on screen. */
    function reconcile(lab, rgb, n, clusters) {
      var k = clusters.length;
      if (k < 2) return clusters;
      var reps = clusters.map(function (c) { return representative(c.bins); });
      var plab = new Float32Array(k * 3);
      for (var i = 0; i < k; i++) {
        rgbToOklab(Math.round(reps[i][0]), Math.round(reps[i][1]), Math.round(reps[i][2]), plab, i * 3);
      }
      var bins = [], counts = new Int32Array(k);
      for (var b0 = 0; b0 < k; b0++) bins.push(new Map());
      for (var p = 0; p < n; p++) {
        var c = nearestIndex(lab[p * 3], lab[p * 3 + 1], lab[p * 3 + 2], plab, k);
        counts[c]++;
        var r = rgb[p * 3], g = rgb[p * 3 + 1], b = rgb[p * 3 + 2];
        var key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
        var e = bins[c].get(key);
        if (!e) { e = { n: 0, r: 0, g: 0, b: 0 }; bins[c].set(key, e); }
        e.n++; e.r += r; e.g += g; e.b += b;
      }
      var out = [];
      for (var z = 0; z < k; z++) {
        if (!counts[z]) continue;   // a color nothing is nearest to has no share
        out.push({ lab: [plab[z * 3], plab[z * 3 + 1], plab[z * 3 + 2]], count: counts[z], bins: bins[z] });
      }
      return out;
    }

    /* How concentrated is the image histogram? If the 8 most frequent 5-bit bins
       cover most of the pixels it is almost certainly flat artwork rather than a
       photograph. Used only to suggest a mode, never to override the choice. */
    function flatness(rgb, n) {
      if (!n) return 0;
      var counts = new Map();
      for (var i = 0; i < n; i++) {
        var key = ((rgb[i * 3] >> 3) << 10) | ((rgb[i * 3 + 1] >> 3) << 5) | (rgb[i * 3 + 2] >> 3);
        counts.set(key, (counts.get(key) || 0) + 1);
      }
      var top = [];
      counts.forEach(function (v) { top.push(v); });
      top.sort(function (a, b) { return b - a; });
      var sum = 0;
      for (var t = 0; t < Math.min(8, top.length); t++) sum += top[t];
      return sum / n;
    }

    /* ---------- pipeline --------------------------------------------------- */
    /* Analyse a sample that was taken once. Split out of extract() so a whole
       ladder of k values can share one sampling pass - sampling is ~3 ms and was
       being redone for every k. `sampled` is what samplePixels() returned.
       opts: {k: "auto" | number, mode: "exact" | "average", seed, minShare} */
    function analyse(sampled, opts, seedBase) {
      opts = opts || {};
      var t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
      var mode = opts.mode === 'average' ? 'average' : 'exact';
      var minShare = opts.minShare == null ? MIN_SHARE : opts.minShare;
      var lab = sampled.lab, rgb = sampled.rgb, n = sampled.count;
      if (!n) return { palette: [], n: 0, ms: 0, flatness: 0, clusters: [], assign: null };

      var rnd = mulberry32(opts.seed == null ? seedBase : opts.seed);
      var kSetting = opts.k == null ? 'auto' : opts.k;
      var kRun = Math.min(kSetting === 'auto' ? AUTO_K : +kSetting, n);

      /* Cluster in the axis-weighted space, then project every centroid back.
         Everything downstream - the reported colors, the `lab` values, the
         quantizer - keeps working in plain OKLab. */
      var w = normWeights(opts);
      /* One reference hue for the whole image, so the map is the same for every
         pixel and every rung of the ladder. */
      var dir = w.c === w.h ? null : meanHue(lab, n);
      var clab = weightLab(lab, n, w, dir);

      var km = kmeans(clab, n, kRun, rnd);
      /* Opt-in only, and off by default, so every existing caller (the color
         extractor) keeps its palettes byte for byte. true takes the default
         round count, a number sets it. */
      if (opts.vividRescue) {
        km = rescueVivid(clab, lab, rgb, n, kRun, km,
          opts.vividRescue === true ? null : +opts.vividRescue);
      }
      var cent = km.cent;
      unweightLab(cent, kRun, w, dir);

      /* An axis with weight 0 is collapsed, so the centroid carries no
         information about it and would report a wrong color (a neutral grey at
         wc = 0, black at wl = 0). Recover those axes by averaging the cluster's
         real pixels, which is what the centroid would have been. */
      if (w.l === 0 || w.c === 0 || w.h === 0) {
        var sums = new Float64Array(kRun * 3), cnt = new Int32Array(kRun);
        for (var p0 = 0; p0 < n; p0++) {
          var cl = km.assign[p0];
          sums[cl * 3] += lab[p0 * 3];
          sums[cl * 3 + 1] += lab[p0 * 3 + 1];
          sums[cl * 3 + 2] += lab[p0 * 3 + 2];
          cnt[cl]++;
        }
        for (var c1 = 0; c1 < kRun; c1++) {
          if (!cnt[c1]) continue;
          if (w.l === 0) cent[c1 * 3] = sums[c1 * 3] / cnt[c1];
          /* chroma and hue share the a/b pair: if either is collapsed the pair
             cannot be trusted, so take both from the pixels */
          if (w.c === 0 || w.h === 0) {
            cent[c1 * 3 + 1] = sums[c1 * 3 + 1] / cnt[c1];
            cent[c1 * 3 + 2] = sums[c1 * 3 + 2] / cnt[c1];
          }
        }
      }

      var clusters = buildClusters(rgb, n, kRun, km.assign, cent, km.counts);
      /* Carry the rescue's pin marks over to the cluster objects. buildClusters
         skips empty clusters, so the mapping is a running index, not z itself.
         A pinned cluster is named by its centroid rather than by its most
         frequent histogram bin: the pin sits on the saturated color the pass
         went looking for, while the census is won by whatever pale pixels came
         along with it - on the LED photo the pinned magenta reported itself as
         white, because the lit core of a lamp has more pixels than its rim. */
      if (km.pinned) {
        for (var z3 = 0, ci = 0; z3 < kRun; z3++) {
          if (!km.counts[z3]) continue;
          if (km.pinned[z3]) clusters[ci].pinned = true;
          ci++;
        }
      }
      /* refine/reconcile belong to the auto mode. The UI no longer offers it, but
         both are kept: they encode two real bugs found on live images (a color
         split across two weak clusters being eaten, and swatches drifting away
         from the centroid they are named for) and their tests document that. */
      if (kSetting === 'auto') {
        clusters = refine(clusters, n, MERGE_THRESHOLD, minShare);
        clusters = reconcile(lab, rgb, n, clusters);
      }

      clusters.sort(function (a, b) { return b.count - a.count; });
      var palette = clusters.map(function (c) {
        var col = (mode === 'average' || c.pinned)
          ? oklabToRgb(c.lab[0], c.lab[1], c.lab[2])
          : representative(c.bins);
        return { hex: hex(col[0], col[1], col[2]), share: c.count / n, lab: c.lab.slice() };
      });
      return {
        palette: palette,
        n: n,
        ms: (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0,
        flatness: flatness(rgb, n),
        clusters: clusters,
        assign: km.assign
      };
    }

    /* Seed from the image dimensions: same picture -> same palette, every time. */
    function seedFor(img, n) {
      return ((img.width * 73856093) ^ (img.height * 19349663) ^ n) >>> 0;
    }

    /* opts: {k, mode, seed, minShare, vividRescue}. Returns {palette, n, ms,
       flatness, clusters, assign}; `assign` and `clusters` are kept because a
       vectorizer would otherwise have to re-guess the same palette.
       vividRescue is off unless asked for; see rescueVivid() for what it does. */
    function extract(img, opts) {
      var sampled = samplePixels(img);
      return analyse(sampled, opts, seedFor(img, sampled.count));
    }

    /* One palette per k, for the accordion. Shares the sample across all of them.
       Every rung uses the same seed, so the ladder is stable and comparable:
       stepping from k to k+1 should look like a split, not a reshuffle. */
    function ladder(img, ks, opts) {
      var sampled = samplePixels(img);
      var seed = seedFor(img, sampled.count);
      var base = opts || {};
      return ks.map(function (k) {
        var r = analyse(sampled, {
          k: k, mode: base.mode, minShare: base.minShare,
          chromaWeight: base.chromaWeight, axisWeights: base.axisWeights,
          vividRescue: base.vividRescue, seed: seed
        }, seed);
        r.k = k;
        return r;
      });
    }

    /* ---------- quantization ----------------------------------------------- */
    /* Map every pixel to its nearest palette entry. Done in OKLab, like the
       clustering itself: nearest-in-sRGB would pick visibly wrong entries in
       exactly the cases the OKLab clustering was chosen to get right.
       Not reusing the `assign` array on purpose - that one refers to the
       downsampled, alpha-filtered sample, so it cannot address a full-size image. */
    function paletteLab(palette) {
      var out = new Float32Array(palette.length * 3);
      for (var i = 0; i < palette.length; i++) {
        var h = palette[i].hex;
        rgbToOklab(
          parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16),
          out, i * 3
        );
      }
      return out;
    }

    function paletteRgb(palette) {
      return palette.map(function (p) {
        return [parseInt(p.hex.slice(1, 3), 16), parseInt(p.hex.slice(3, 5), 16), parseInt(p.hex.slice(5, 7), 16)];
      });
    }

    function nearestIndex(L, a, b, plab, k) {
      var best = 0, bd = Infinity;
      for (var i = 0; i < k; i++) {
        var dl = L - plab[i * 3], da = a - plab[i * 3 + 1], db = b - plab[i * 3 + 2];
        var d = dl * dl + da * da + db * db;
        if (d < bd) { bd = d; best = i; }
      }
      return best;
    }

    /* Full-resolution labeling: which palette entry is each pixel nearest to?
       The per-pixel complement of quantize() for a vectorizer, which needs the
       index map rather than a repainted image. Same OKLab metric, and the same
       alpha cut as samplePixels (alpha < 128 -> -1). O(n*k), no sampling; see
       the note above paletteLab() for why extract()'s `assign` cannot be
       reused here. `palette` is the array extract() returns. */
    function labelImage(img, palette) {
      var k = palette.length;
      var n = img.width * img.height;
      var out = new Int32Array(n);
      if (!k) { out.fill(-1); return out; }
      var plab = paletteLab(palette);
      var data = img.data;
      var lab = new Float32Array(3);
      for (var i = 0; i < n; i++) {
        var p = i * 4;
        if (data[p + 3] < 128) { out[i] = -1; continue; }
        rgbToOklab(data[p], data[p + 1], data[p + 2], lab, 0);
        out[i] = nearestIndex(lab[0], lab[1], lab[2], plab, k);
      }
      return out;
    }

    /* Rewrites img.data in place. dither: false = hard edges (honest about how
       coarse the palette is), true = Floyd-Steinberg (prettier on photos).
       Alpha is preserved untouched; fully transparent pixels are left alone so
       a transparent PNG does not gain a colored fringe. */
    function quantize(img, palette, dither) {
      var k = palette.length;
      if (!k) return img;
      var plab = paletteLab(palette), prgb = paletteRgb(palette);
      var data = img.data, w = img.width, h = img.height;
      var lab = new Float32Array(3);

      if (!dither) {
        for (var p = 0; p < data.length; p += 4) {
          if (data[p + 3] === 0) continue;
          rgbToOklab(data[p], data[p + 1], data[p + 2], lab, 0);
          var c = prgb[nearestIndex(lab[0], lab[1], lab[2], plab, k)];
          data[p] = c[0]; data[p + 1] = c[1]; data[p + 2] = c[2];
        }
        return img;
      }

      /* Error diffusion after Floyd & Steinberg (1976), "An Adaptive Algorithm for
         Spatial Greyscale". The error is carried in sRGB, not OKLab: the diffusion
         weights assume a linear-ish additive error, and accumulating in OKLab
         drifts out of gamut. Errors live in a float buffer so they do not get
         clipped to bytes between pixels. */
      var err = new Float32Array(w * h * 3);
      for (var y = 0; y < h; y++) {
        for (var x = 0; x < w; x++) {
          var idx = (y * w + x), q = idx * 4, e = idx * 3;
          if (data[q + 3] === 0) continue;
          var r = Math.min(255, Math.max(0, data[q] + err[e]));
          var g = Math.min(255, Math.max(0, data[q + 1] + err[e + 1]));
          var b = Math.min(255, Math.max(0, data[q + 2] + err[e + 2]));
          rgbToOklab(Math.round(r), Math.round(g), Math.round(b), lab, 0);
          var col = prgb[nearestIndex(lab[0], lab[1], lab[2], plab, k)];
          data[q] = col[0]; data[q + 1] = col[1]; data[q + 2] = col[2];
          var er = r - col[0], eg = g - col[1], eb = b - col[2];
          // 7/16 right, 3/16 below-left, 5/16 below, 1/16 below-right
          spread(err, w, h, x + 1, y,     er, eg, eb, 7 / 16);
          spread(err, w, h, x - 1, y + 1, er, eg, eb, 3 / 16);
          spread(err, w, h, x,     y + 1, er, eg, eb, 5 / 16);
          spread(err, w, h, x + 1, y + 1, er, eg, eb, 1 / 16);
        }
      }
      return img;
    }

    function spread(err, w, h, x, y, er, eg, eb, f) {
      if (x < 0 || x >= w || y < 0 || y >= h) return;
      var e = (y * w + x) * 3;
      err[e] += er * f; err[e + 1] += eg * f; err[e + 2] += eb * f;
    }

    /* ---------- perceptual axis weighting ---------------------------------- */
    /* Lightness, chroma and hue are the three things a person can name about a
       color, but only lightness is a plain axis in OKLab. Chroma is the radius in
       the a/b plane, hue is the angle. So

           a' = a * s,  b' = b * s

       weights chroma and hue by the same s - which is what the single slider did,
       and why it could never separate them.

       To weight them apart, note what "chroma" and "hue" mean as directions. At a
       color with chroma C and hue theta, moving outward changes colorfulness and
       moving sideways changes hue. Those two directions are orthogonal, so the
       a/b plane can be stretched anisotropically: by wc along the radius and by
       wh along the tangent. Around a reference hue theta0 that is a plain linear
       map, and a linear map is what k-means needs.

       The reference has to come from the image, not from a fixed axis, because
       "radial" and "tangential" differ per pixel. We use the chroma-weighted mean
       hue of the picture: for images with one dominant hue family this is exactly
       right, and for images spread around the wheel the choice barely matters
       because no single hue is the subject. Rotating the plane so the mean hue
       lies on +a, scaling by (wc, wh), and rotating back gives

           M = R(theta0) * diag(wc, wh) * R(-theta0)

       a symmetric 2x2 matrix applied to every (a, b). It has no cut, no
       discontinuity, keeps neutrals at the origin, and collapses to plain
       isotropic scaling whenever wc = wh - so the shipped default is untouched,
       bit for bit.

       Chroma differences along theta0 scale by wc, hue differences across it by
       wh. Both carry the factor C implicitly: a tangential step at radius C is
       C*dtheta long, so the same angle between two pale tints is a smaller
       distance than between two vivid ones, and a neutral grey has no hue at all
       (its angle is JPEG noise). That falls out of the geometry rather than being
       bolted on, which is why a strong hue weight does not make greys scatter. */

    /* Chroma-weighted mean hue, as a unit vector. Weighting by chroma keeps
       near-neutral pixels - whose hue is noise - from dragging the reference. */
    function meanHue(lab, n) {
      var sa = 0, sb = 0;
      for (var i = 0; i < n; i++) {
        sa += lab[i * 3 + 1];
        sb += lab[i * 3 + 2];
      }
      var m = Math.sqrt(sa * sa + sb * sb);
      return m < 1e-9 ? [1, 0] : [sa / m, sb / m];
    }

    /* The symmetric matrix M above, as [m00, m01, m11]. */
    function axisMatrix(w, dir) {
      var cs = dir[0], sn = dir[1];
      var cc = cs * cs, ss = sn * sn, cx = cs * sn;
      return [
        w.c * cc + w.h * ss,
        (w.c - w.h) * cx,
        w.c * ss + w.h * cc
      ];
    }

    function weightLab(lab, n, w, dir) {
      if (w.l === 1 && w.c === 1 && w.h === 1) return lab;
      var out = new Float32Array(n * 3);
      var i;
      if (w.c === w.h) {                 // isotropic: no reference hue needed
        for (i = 0; i < n; i++) {
          out[i * 3] = lab[i * 3] * w.l;
          out[i * 3 + 1] = lab[i * 3 + 1] * w.c;
          out[i * 3 + 2] = lab[i * 3 + 2] * w.c;
        }
        return out;
      }
      var M = axisMatrix(w, dir || meanHue(lab, n));
      for (i = 0; i < n; i++) {
        var a = lab[i * 3 + 1], b = lab[i * 3 + 2];
        out[i * 3] = lab[i * 3] * w.l;
        out[i * 3 + 1] = M[0] * a + M[1] * b;
        out[i * 3 + 2] = M[1] * a + M[2] * b;
      }
      return out;
    }

    /* Exact inverse of weightLab, in place. M is symmetric and invertible unless
       an axis weight is 0; analyse() repairs those cases from the real pixels. */
    function unweightLab(cent, k, w, dir) {
      if (w.l === 1 && w.c === 1 && w.h === 1) return;
      var c;
      if (w.c === w.h) {
        for (c = 0; c < k; c++) {
          if (w.l !== 0) cent[c * 3] /= w.l;
          if (w.c !== 0) { cent[c * 3 + 1] /= w.c; cent[c * 3 + 2] /= w.c; }
        }
        return;
      }
      var M = axisMatrix(w, dir || [1, 0]);
      var det = M[0] * M[2] - M[1] * M[1];   // = wc * wh
      for (c = 0; c < k; c++) {
        if (w.l !== 0) cent[c * 3] /= w.l;
        if (det === 0) continue;
        var a = cent[c * 3 + 1], b = cent[c * 3 + 2];
        cent[c * 3 + 1] = (M[2] * a - M[1] * b) / det;
        cent[c * 3 + 2] = (M[0] * b - M[1] * a) / det;
      }
    }

    /* Accepts either the old scalar (chroma and hue together) or {l, c, h}. */
    function normWeights(opts) {
      if (opts.axisWeights) {
        var w = opts.axisWeights;
        return {
          l: w.l == null ? 1 : w.l,
          c: w.c == null ? 1 : w.c,
          h: w.h == null ? (w.c == null ? 1 : w.c) : w.h
        };
      }
      var s = opts.chromaWeight == null ? CHROMA_WEIGHT : opts.chromaWeight;
      return { l: 1, c: s, h: s };
    }

    /* ---------- export formats --------------------------------------------- */
    function toCss(palette) {
      return palette.map(function (c, i) {
        return '  --color-' + (i + 1) + ': ' + c.hex + '; /* ' + (c.share * 100).toFixed(1) + '% */';
      }).join('\n');
    }

    function toJson(palette) {
      return JSON.stringify(palette.map(function (c) {
        return { hex: c.hex, share: +c.share.toFixed(4) };
      }), null, 2);
    }

    return {
      MAX_PX: MAX_PX, AUTO_K: AUTO_K, MERGE_THRESHOLD: MERGE_THRESHOLD, MIN_SHARE: MIN_SHARE,
      CHROMA_WEIGHT: CHROMA_WEIGHT, AXIS_WEIGHTS: AXIS_WEIGHTS,
      weightLab: weightLab, unweightLab: unweightLab, normWeights: normWeights,
      meanHue: meanHue, axisMatrix: axisMatrix,
      rgbToOklab: rgbToOklab, oklabToRgb: oklabToRgb, hex: hex, mulberry32: mulberry32,
      RESCUE_CHROMA: RESCUE_CHROMA, RESCUE_MIN_SHARE: RESCUE_MIN_SHARE,
      rescueBudget: rescueBudget, rescueMinBin: rescueMinBin,
      scaleFor: scaleFor, samplePixels: samplePixels, kmeans: kmeans,
      lloyd: lloyd, rescueVivid: rescueVivid,
      buildClusters: buildClusters, representative: representative, labDist: labDist,
      refine: refine, reconcile: reconcile, flatness: flatness,
      oklabToLinear: oklabToLinear,
      analyse: analyse, seedFor: seedFor, extract: extract, ladder: ladder,
      toCss: toCss, toJson: toJson,
      paletteLab: paletteLab, paletteRgb: paletteRgb, nearestIndex: nearestIndex, quantize: quantize,
      labelImage: labelImage
    };
  })();
  globalThis.ColorCore = ColorCore;
  /* COLOR-CORE-END */
