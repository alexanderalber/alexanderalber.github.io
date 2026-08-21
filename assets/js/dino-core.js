/* dino-core.js -- pure feature-map math for the DINOv3 tools on alber.me.
 *
 * Cosine maps, PCA colouring, k-means segmentation, joint bilateral upsampling
 * and the colour ramps. No DOM, no React, no imports: a plain script that hangs
 * its API off globalThis.DinoCore, so the page loads it with <script src> and
 * the Node tests load it with eval.
 *
 * It lived inside patch-similarity.html as <script id="dinocore"> until
 * 2026-08-22 and moved out when a second tool needed it. Both tools load the
 * same URL, so they share the browser cache, exactly like the model file and
 * the worker.
 *
 * Feature layout everywhere: a Float32Array of n*dim, patch i occupying
 * [i*dim, (i+1)*dim). Patch order is row major over the patch grid.
 *
 * Every function is pure and deterministic: no Date.now, no Math.random (the
 * seeded mulberry32 stands in for it), no mutation of the input.
 */

const DINO_EPS = 1e-12;

// Standard mulberry32. Seeded so every derived view (k-means init, PCA start
// vectors) is reproducible for the same image and settings.
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

// Pixel in the displayed image to patch index, clamped to the grid.
function patchIndexFromPixel(x, y, imgW, imgH, gridW, gridH) {
  const gx = Math.min(gridW - 1, Math.max(0, Math.floor((x / imgW) * gridW)));
  const gy = Math.min(gridH - 1, Math.max(0, Math.floor((y / imgH) * gridH)));
  return gy * gridW + gx;
}

function normsOf(features, n, dim) {
  const norms = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    const o = i * dim;
    for (let d = 0; d < dim; d++) s += features[o + d] * features[o + d];
    norms[i] = Math.sqrt(s);
  }
  return norms;
}

/* Cosine similarity of every patch to patch refIdx. Zero vectors yield 0.
   The norms are the same on every call for one feature set, so a caller that
   maps the same features over and over (hover mode) may pass them in. */
function cosineMap(features, dim, refIdx, precomputedNorms) {
  const n = Math.floor(features.length / dim);
  const out = new Float32Array(n);
  const norms = precomputedNorms || normsOf(features, n, dim);
  const nr = norms[refIdx];
  if (!(nr > DINO_EPS)) return out;
  const ro = refIdx * dim;
  for (let i = 0; i < n; i++) {
    if (!(norms[i] > DINO_EPS)) continue;
    let s = 0;
    const o = i * dim;
    for (let d = 0; d < dim; d++) s += features[o + d] * features[ro + d];
    out[i] = s / (norms[i] * nr);
  }
  return out;
}

// Reference patch from featsA, map over featsB (image A against image B).
function cosineMapCross(featsA, featsB, dim, refIdxA, precomputedNormsB) {
  const na = Math.floor(featsA.length / dim);
  const nb = Math.floor(featsB.length / dim);
  const out = new Float32Array(nb);
  if (refIdxA < 0 || refIdxA >= na) return out;
  let rn = 0;
  const ro = refIdxA * dim;
  for (let d = 0; d < dim; d++) rn += featsA[ro + d] * featsA[ro + d];
  rn = Math.sqrt(rn);
  if (!(rn > DINO_EPS)) return out;
  const norms = precomputedNormsB || normsOf(featsB, nb, dim);
  for (let i = 0; i < nb; i++) {
    if (!(norms[i] > DINO_EPS)) continue;
    let s = 0;
    const o = i * dim;
    for (let d = 0; d < dim; d++) s += featsB[o + d] * featsA[ro + d];
    out[i] = s / (norms[i] * rn);
  }
  return out;
}

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx), hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

/* Top three principal components by power iteration with deflation on the
   explicit dim x dim covariance. dim is a few hundred, so materializing it
   is both simpler and faster than repeated passes over n patches.
   Returns { r, g, b }: three Float32Arrays of length n, each robustly
   normalized to [0,1] via its 2nd/98th percentile. A component with no
   variance left (deflated to nothing) comes out flat at 0.5. */
function pcaRgb(features, n, dim) {
  const mean = new Float64Array(dim);
  for (let i = 0; i < n; i++) {
    const o = i * dim;
    for (let d = 0; d < dim; d++) mean[d] += features[o + d];
  }
  for (let d = 0; d < dim; d++) mean[d] /= Math.max(1, n);

  const cov = new Float64Array(dim * dim);
  const row = new Float64Array(dim);
  for (let i = 0; i < n; i++) {
    const o = i * dim;
    for (let d = 0; d < dim; d++) row[d] = features[o + d] - mean[d];
    for (let a = 0; a < dim; a++) {
      const va = row[a];
      if (va === 0) continue;
      const off = a * dim;
      for (let b = 0; b < dim; b++) cov[off + b] += va * row[b];
    }
  }
  const denom = Math.max(1, n - 1);
  for (let k = 0; k < cov.length; k++) cov[k] /= denom;

  const rnd = mulberry32(0x5EED);
  const comps = [];
  const lambdas = [];
  const tmp = new Float64Array(dim);
  for (let c = 0; c < 3; c++) {
    const v = new Float64Array(dim);
    for (let d = 0; d < dim; d++) v[d] = rnd() * 2 - 1;
    let vn = 0;
    for (let d = 0; d < dim; d++) vn += v[d] * v[d];
    vn = Math.sqrt(vn) || 1;
    for (let d = 0; d < dim; d++) v[d] /= vn;
    let lambda = 0;
    for (let it = 0; it < 80; it++) {
      for (let a = 0; a < dim; a++) {
        let s = 0;
        const off = a * dim;
        for (let b = 0; b < dim; b++) s += cov[off + b] * v[b];
        tmp[a] = s;
      }
      let nrm = 0;
      for (let d = 0; d < dim; d++) nrm += tmp[d] * tmp[d];
      nrm = Math.sqrt(nrm);
      if (!(nrm > DINO_EPS)) { lambda = 0; break; }
      for (let d = 0; d < dim; d++) v[d] = tmp[d] / nrm;
      lambda = nrm;
    }
    comps.push(Float64Array.from(v));
    lambdas.push(lambda);
    if (lambda > DINO_EPS) {
      for (let a = 0; a < dim; a++) {
        const off = a * dim, va = v[a];
        for (let b = 0; b < dim; b++) cov[off + b] -= lambda * va * v[b];
      }
    }
  }

  /* A component whose eigenvalue is numerically nothing next to the first
     one carries only the deflation residual. Without this test the robust
     normalization below would stretch that residual over the full [0,1]
     and paint pure noise into the green and blue channels. */
  const lamMax = Math.max.apply(null, lambdas);
  const out = [];
  for (let c = 0; c < 3; c++) {
    const proj = new Float32Array(n);
    if (!(lambdas[c] > 1e-9 * lamMax) || !(lamMax > DINO_EPS)) {
      proj.fill(0.5);
      out.push(proj);
      continue;
    }
    const v = comps[c];
    for (let i = 0; i < n; i++) {
      const o = i * dim;
      let s = 0;
      for (let d = 0; d < dim; d++) s += (features[o + d] - mean[d]) * v[d];
      proj[i] = s;
    }
    const sorted = Array.from(proj).sort((x, y) => x - y);
    const lo = percentile(sorted, 0.02), hi = percentile(sorted, 0.98);
    const span = hi - lo;
    if (!(span > DINO_EPS)) {
      proj.fill(0.5);
    } else {
      for (let i = 0; i < n; i++) proj[i] = Math.min(1, Math.max(0, (proj[i] - lo) / span));
    }
    out.push(proj);
  }
  return { r: out[0], g: out[1], b: out[2] };
}

function sqDist(features, i, center, dim) {
  const o = i * dim;
  let s = 0;
  for (let d = 0; d < dim; d++) {
    const t = features[o + d] - center[d];
    s += t * t;
  }
  return s;
}

/* k-means++ init from mulberry32(seed), then Lloyd iterations until the
   assignment stops changing or 50 rounds are up. Returns Uint16Array n of
   labels, deterministic for identical input. */
function kmeansSegments(features, n, dim, k, seed) {
  const labels = new Uint16Array(n);
  if (n === 0 || k <= 1) return labels;
  const kk = Math.min(k, n);
  const rnd = mulberry32(seed >>> 0);

  const centers = [];
  const first = Math.min(n - 1, Math.floor(rnd() * n));
  centers.push(Float64Array.from(features.subarray(first * dim, first * dim + dim)));
  const best = new Float64Array(n);
  for (let i = 0; i < n; i++) best[i] = sqDist(features, i, centers[0], dim);
  while (centers.length < kk) {
    let total = 0;
    for (let i = 0; i < n; i++) total += best[i];
    let pick = n - 1;
    if (total > DINO_EPS) {
      let target = rnd() * total, acc = 0;
      for (let i = 0; i < n; i++) {
        acc += best[i];
        if (acc >= target) { pick = i; break; }
      }
    } else {
      pick = Math.min(n - 1, Math.floor(rnd() * n));
    }
    const c = Float64Array.from(features.subarray(pick * dim, pick * dim + dim));
    centers.push(c);
    for (let i = 0; i < n; i++) {
      const d2 = sqDist(features, i, c, dim);
      if (d2 < best[i]) best[i] = d2;
    }
  }

  const sums = new Float64Array(kk * dim);
  const counts = new Float64Array(kk);
  for (let it = 0; it < 50; it++) {
    let moved = false;
    for (let i = 0; i < n; i++) {
      let bi = 0, bd = Infinity;
      for (let c = 0; c < kk; c++) {
        const d2 = sqDist(features, i, centers[c], dim);
        if (d2 < bd) { bd = d2; bi = c; }
      }
      if (labels[i] !== bi) { labels[i] = bi; moved = true; }
    }
    if (!moved && it > 0) break;
    sums.fill(0);
    counts.fill(0);
    for (let i = 0; i < n; i++) {
      const c = labels[i], o = i * dim, off = c * dim;
      for (let d = 0; d < dim; d++) sums[off + d] += features[o + d];
      counts[c]++;
    }
    for (let c = 0; c < kk; c++) {
      if (counts[c] === 0) continue;
      const off = c * dim;
      for (let d = 0; d < dim; d++) centers[c][d] = sums[off + d] / counts[c];
    }
    if (!moved) break;
  }
  return labels;
}

// Rec.601 luma from RGBA bytes, as a Float32Array of w*h in 0..255.
function lumaOf(rgbaData, w, h) {
  const out = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const k = i * 4;
    out[i] = 0.299 * rgbaData[k] + 0.587 * rgbaData[k + 1] + 0.114 * rgbaData[k + 2];
  }
  return out;
}

// Per-cell mean of the full-res guide, so the range term compares like with like.
function coarseGuide(guideLuma, w, h, gw, gh) {
  const sum = new Float64Array(gw * gh);
  const cnt = new Float64Array(gw * gh);
  for (let y = 0; y < h; y++) {
    const cy = Math.min(gh - 1, Math.floor((y / h) * gh));
    for (let x = 0; x < w; x++) {
      const cx = Math.min(gw - 1, Math.floor((x / w) * gw));
      const c = cy * gw + cx;
      sum[c] += guideLuma[y * w + x];
      cnt[c]++;
    }
  }
  const out = new Float32Array(gw * gh);
  for (let c = 0; c < gw * gh; c++) out[c] = cnt[c] > 0 ? sum[c] / cnt[c] : 0;
  return out;
}

/* Joint bilateral upsampling of a gw*gh scalar field to w*h, guided by the
   full-res luma (Float32Array of w*h, in 0..255, i.e. what lumaOf returns).

   The spatial term is the bilinear weight of the 2x2 coarse neighbourhood
   around the sample point, not a separate Gaussian: that way a constant
   guide makes every range weight equal and the whole thing collapses to
   plain bilinear interpolation, which is the behaviour to fall back on.
   opts.sigmaR is the range sigma in luma units (default 25).

   Split in two on purpose. Nothing in the weights depends on the scalar
   field being upsampled: the guide luma, its coarse means, the bilinear
   weights and sigma are all fixed for a given image, grid and sigma. Hover
   mode redraws the map on every pointer frame, so building the weights once
   (buildUpsampleField) and leaving only four multiply-adds per pixel in the
   frame loop (applyUpsampleField) is the difference between 5 fps and 30.
   bilateralUpsample is the two of them back to back, for callers and tests
   that only want one map. */
function buildUpsampleField(gw, gh, guideLuma, w, h, opts) {
  const o = opts || {};
  const sigmaR = o.sigmaR > 0 ? o.sigmaR : 25;
  const inv2s2 = 1 / (2 * sigmaR * sigmaR);
  const cg = o.guideCoarse || coarseGuide(guideLuma, w, h, gw, gh);
  const idx = new Int32Array(w * h * 4);
  const wgt = new Float32Array(w * h * 4);
  const cl = (v, hi) => (v < 0 ? 0 : v > hi ? hi : v);
  const ws4 = [0, 0, 0, 0];
  const wt4 = [0, 0, 0, 0];

  for (let y = 0; y < h; y++) {
    const fy = ((y + 0.5) / h) * gh - 0.5;
    const y0 = Math.floor(fy), ty = fy - y0;
    for (let x = 0; x < w; x++) {
      const fx = ((x + 0.5) / w) * gw - 0.5;
      const x0 = Math.floor(fx), tx = fx - x0;
      const gi = guideLuma[y * w + x];
      const p = (y * w + x) * 4;
      let wsum = 0;
      for (let dy = 0; dy < 2; dy++) {
        const wy = dy === 0 ? 1 - ty : ty;
        const yy = cl(y0 + dy, gh - 1);
        for (let dx = 0; dx < 2; dx++) {
          const k = dy * 2 + dx;
          const ws = wy * (dx === 0 ? 1 - tx : tx);
          const c = yy * gw + cl(x0 + dx, gw - 1);
          const dI = gi - cg[c];
          const wt = ws * Math.exp(-dI * dI * inv2s2);
          idx[p + k] = c;
          ws4[k] = ws;
          wt4[k] = wt;
          wsum += wt;
        }
      }
      /* Normalized here rather than per frame. When every range weight has
         underflowed (a pixel whose luma agrees with none of its four coarse
         cells) the bilinear weights stand in, which is the same fallback the
         single-shot version made at division time. */
      if (wsum > DINO_EPS) {
        for (let k = 0; k < 4; k++) wgt[p + k] = wt4[k] / wsum;
      } else {
        for (let k = 0; k < 4; k++) wgt[p + k] = ws4[k];
      }
    }
  }
  return { idx, wgt, w, h, gw, gh };
}

// out is optional and reused when it has the right length, so a hover frame
// allocates nothing.
function applyUpsampleField(field, coarse, out) {
  const n = field.w * field.h;
  const dst = out && out.length === n ? out : new Float32Array(n);
  const idx = field.idx, wgt = field.wgt;
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    dst[i] = wgt[p] * coarse[idx[p]] +
             wgt[p + 1] * coarse[idx[p + 1]] +
             wgt[p + 2] * coarse[idx[p + 2]] +
             wgt[p + 3] * coarse[idx[p + 3]];
  }
  return dst;
}

function bilateralUpsample(coarse, gw, gh, guideLuma, w, h, opts) {
  return applyUpsampleField(buildUpsampleField(gw, gh, guideLuma, w, h, opts), coarse);
}

/* Diverging maps as { neg, mid, pos } RGB triples, linearly interpolated,
   site default hollywood. Used for signed views (a similarity map centred
   on zero, a difference between two references). */
const DINO_DIVERGING = {
  hollywood:  { neg: [255, 140, 66], mid: [245, 245, 245], pos: [0, 139, 139] },
  greyscale:  { neg: [0, 0, 0],      mid: [128, 128, 128], pos: [255, 255, 255] },
  tritanopia: { neg: [200, 85, 61],  mid: [245, 245, 245], pos: [74, 172, 143] },
  rdbu:       { neg: [33, 102, 172], mid: [247, 247, 247], pos: [178, 24, 43] },
  rdylgn:     { neg: [215, 48, 39],  mid: [255, 255, 191], pos: [26, 152, 80] },
  spectral:   { neg: [213, 62, 79],  mid: [255, 255, 191], pos: [50, 136, 189] },
  puor:       { neg: [230, 97, 1],   mid: [247, 247, 247], pos: [94, 60, 153] },
  brbg:       { neg: [140, 81, 10],  mid: [245, 245, 245], pos: [1, 102, 94] }
};

const lerp3 = (a, b, t) => [
  Math.round(a[0] + (b[0] - a[0]) * t),
  Math.round(a[1] + (b[1] - a[1]) * t),
  Math.round(a[2] + (b[2] - a[2]) * t)
];

// t in [-1,1]; anything outside is clamped.
function divergingColor(t, name) {
  const m = DINO_DIVERGING[name] || DINO_DIVERGING.hollywood;
  const v = t < -1 ? -1 : t > 1 ? 1 : t;
  return v < 0 ? lerp3(m.mid, m.neg, -v) : lerp3(m.mid, m.pos, v);
}

// Sequential ramp for the similarity heatmap, t in [0,1]: dark blue over
// teal and green to a pale yellow, so high similarity reads as bright.
const DINO_SEQ = [
  [12, 20, 48], [24, 78, 130], [30, 140, 145], [110, 190, 110], [245, 240, 170]
];

function sequentialColor(t) {
  const v = t < 0 ? 0 : t > 1 ? 1 : t;
  const s = v * (DINO_SEQ.length - 1);
  const i = Math.min(DINO_SEQ.length - 2, Math.floor(s));
  return lerp3(DINO_SEQ[i], DINO_SEQ[i + 1], s - i);
}

/* Recolour a map pixel so its Rec.601 luma equals the photograph's, which is
   what the "Luma x Color" overlay does: structure comes from the picture,
   hue from the map. Plain scaling overshoots on a bright target, and simply
   clamping would silently darken the result below the luma it was asked
   for. So scale only until the first channel reaches 255, then mix towards
   white, which is the one direction left that still raises luma. Input and
   output are 0..255; the result is rounded to whole channel values. */
function lumaMatch(rgb, targetLuma) {
  const L = targetLuma < 0 ? 0 : targetLuma > 255 ? 255 : targetLuma;
  const l = 0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2];
  if (!(l > DINO_EPS)) return [Math.round(L), Math.round(L), Math.round(L)];
  const mx = Math.max(rgb[0], rgb[1], rgb[2]);
  const s = L / l;
  if (mx * s <= 255) {
    return [Math.round(rgb[0] * s), Math.round(rgb[1] * s), Math.round(rgb[2] * s)];
  }
  const s0 = 255 / mx;
  const l0 = l * s0;
  const t = 255 - l0 > DINO_EPS ? Math.min(1, Math.max(0, (L - l0) / (255 - l0))) : 0;
  const out = [0, 0, 0];
  for (let c = 0; c < 3; c++) {
    const v = rgb[c] * s0;
    out[c] = Math.round(v + t * (255 - v));
  }
  return out;
}

/* Very bright and very dark parts of a photograph leave lumaMatch no room:
   to reach a target near 0 or near 255 it has to push the colour to black
   or to white, and the hue of the map disappears exactly where the picture
   is a bright sky or a dark shadow. So the target luma is compressed towards
   mid grey before it is used.

   The compression is per image, not a fixed curve: the endpoints are the
   picture's own 5th and 95th percentile, so a flat overcast photograph and a
   high-contrast one both spend the full input range, and `amount` (0.55) is
   how much of the spread survives around mid grey. Structure stays legible,
   colour stays visible at both ends. */
const LUMA_COMPRESS = 0.55;

/* Percentiles of a luma field (0..255) via a 256-bin histogram. Exact to one
   byte, which is the resolution the value is used at, and O(n) rather than a
   sort over a megapixel. */
function lumaPercentiles(luma, pLo, pHi) {
  const hist = new Int32Array(256);
  const n = luma.length;
  for (let i = 0; i < n; i++) {
    const v = Math.round(luma[i]);
    hist[v < 0 ? 0 : v > 255 ? 255 : v]++;
  }
  const at = (p) => {
    if (n === 0) return 0;
    const target = p * (n - 1);
    let acc = 0;
    for (let b = 0; b < 256; b++) {
      acc += hist[b];
      if (acc > target) return b;
    }
    return 255;
  };
  const lo = at(pLo === undefined ? 0.05 : pLo);
  const hi = at(pHi === undefined ? 0.95 : pHi);
  return { lo, hi };
}

/* One luma value (0..255) to its compressed target (0..255). Monotone in L,
   and the midpoint of [lo,hi] always lands on mid grey, whatever the two
   percentiles are. A degenerate range collapses to mid grey. */
function compressLuma(L, lo, hi, amount) {
  const a = amount === undefined ? LUMA_COMPRESS : amount;
  if (!(hi - lo > DINO_EPS)) return 127.5;
  let x = (L - lo) / (hi - lo);
  x = x < 0 ? 0 : x > 1 ? 1 : x;
  return (0.5 + (x - 0.5) * a) * 255;
}

// Ready-made 256-entry lookup, so the per-pixel composite stays one array
// read. Built once per displayed image.
function lumaCompressLut(luma, opts) {
  const o = opts || {};
  const p = lumaPercentiles(luma, o.pLo, o.pHi);
  const lut = new Float32Array(256);
  for (let v = 0; v < 256; v++) lut[v] = compressLuma(v, p.lo, p.hi, o.amount);
  return { lo: p.lo, hi: p.hi, lut };
}

// Site rule for text on a coloured cell: dark ink above luminance 145.
function cellTextColor(rgb) {
  const lum = 0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2];
  return lum > 145 ? '#1e293b' : '#f1f5f9';
}

const DinoCore = {
  mulberry32,
  patchIndexFromPixel,
  cosineMap,
  cosineMapCross,
  pcaRgb,
  kmeansSegments,
  bilateralUpsample,
  buildUpsampleField,
  applyUpsampleField,
  coarseGuide,
  lumaOf,
  normsOf,
  lumaMatch,
  lumaPercentiles,
  compressLuma,
  lumaCompressLut,
  divergingColor,
  sequentialColor,
  cellTextColor,
  DIVERGING: DINO_DIVERGING,
  SEQUENTIAL: DINO_SEQ
};

globalThis.DinoCore = DinoCore;
