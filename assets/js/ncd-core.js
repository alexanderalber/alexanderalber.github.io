/* ncd-core.js -- language identification by per-language character models.
 *
 * Shared by the Language Zipper (ranking, tree, map) and the E-Book Converter
 * (warning when a merge mixes languages). Plain script, no imports, no DOM:
 * it loads with <script src> in a page and by eval in the Node build scripts
 * and tests (notes/dev/langzip.test.mjs), and exposes globalThis.NCDCore.
 * This file is the source; there is no copy to keep in sync. */

/* NCD-CORE-START -- pure logic, no DOM. Runs in the browser and, byte for byte
   identically, in the Node build script and test suite.

   Language identification by character-level context modelling. The classic
   version of this trick (Benedetto, Caglioti & Loreto 2002) appends the query
   to a reference text and measures how much a general compressor such as gzip
   grows. We model the reference directly instead: an order-3 byte model with
   Witten-Bell interpolation, scored as a code length. No arithmetic coder is
   needed because only the ranking across models matters, never the encoded
   bytes.

   Byte level, not codepoint level, on purpose. It caps the alphabet at 256 so
   CJK cannot blow up the tables, and it removes the zero-frequency problem
   structurally: every possible UTF-8 byte is already in the alphabet, so no
   escape mechanism is required. */
var NCDCore = (function () {
  'use strict';

  /* ---------- tunables -------------------------------------------------- */
  var ORDER = 3;            // order 3 is the knee; order 4 costs 2.2x the table for <=0.3pp
  var ALPHABET = 256;
  var PRUNE_MIN = 3;        // drop contexts seen fewer times than this
  var COUNT_BITS = 4;       // logarithmic count buckets; 4 bits is lossless for accuracy, 3 is not
  var TEMP_PER_BYTE = 0.12; // softmax temperature per byte, calibrated against measured accuracy
  var MIN_CHARS = 20;       // below this the answer is noise and the UI says so
  var RELIABLE_CHARS = 100; // at and above this, measured accuracy is 99.6%

  /* ---------- small helpers --------------------------------------------- */

  function encodeUtf8(str) {
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(str);
    var out = [], i, c;
    for (i = 0; i < str.length; i++) {
      c = str.charCodeAt(i);
      if (c < 0x80) out.push(c);
      else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
      else out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    }
    return new Uint8Array(out);
  }

  /* Indentation style is a formatting habit, not a language. Left alone it
     dominates: because gofmt forces tabs and almost every other snippet uses
     spaces, the model learned "tab means Go" and read tab-indented Python as Go
     with 83% confidence, while space-indented Go came out as TypeScript.

     Normalising leading whitespace to a single tab per level removes the style
     and keeps the structure, which is the part that actually differs between
     languages (Python's block indentation is real syntax; C's is decoration).
     Applied identically at training and query time. Two spaces per level is
     assumed for space indentation; getting that wrong merely changes the depth,
     not the shape, and the depth is not what identifies a language.

     Only leading whitespace is touched. Alignment inside a line and every other
     byte pass through untouched. */
  function normalizeIndent(str) {
    return str.replace(/^[ \t]+/gm, function (ws) {
      var spaces = 0, tabs = 0, i;
      for (i = 0; i < ws.length; i++) {
        if (ws.charCodeAt(i) === 9) tabs++; else spaces++;
      }
      var levels = tabs + Math.floor(spaces / 2);
      return new Array(levels + 1).join('\t');
    });
  }

  /* Deterministic PRNG so every build and every test run agrees. */
  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ---------- training (build time only) --------------------------------

     A model is one Map per order. The key packs the preceding bytes into an
     integer (order 1 -> b0, order 2 -> b0<<8|b1, order 3 -> b0<<16|b1<<8|b2),
     the value holds the 256 symbol counts plus the running total and the
     number of distinct symbols seen. Order 0 is a single unconditional node. */

  function newNode() {
    return { c: new Uint32Array(ALPHABET), t: 0, d: 0 };
  }

  function train(bytes, order) {
    if (order === undefined) order = ORDER;
    var levels = [], k;
    for (k = 0; k <= order; k++) levels.push(new Map());
    levels[0].set(0, newNode());

    for (var i = 0; i < bytes.length; i++) {
      var sym = bytes[i];
      for (k = 0; k <= order; k++) {
        if (i < k) break;                       // not enough history for this order yet
        var key = 0;
        for (var j = k; j >= 1; j--) key = (key << 8) | bytes[i - j];
        var lvl = levels[k];
        var node = lvl.get(key);
        if (node === undefined) { node = newNode(); lvl.set(key, node); }
        if (node.c[sym] === 0) node.d++;
        node.c[sym]++;
        node.t++;
      }
    }
    return { maxOrder: order, levels: levels };
  }

  /* Contexts seen only once or twice are mostly accidents of the training
     sample. Dropping them costs little accuracy and shrinks the payload.
     Order 0 is never pruned; it is the backoff floor. */
  function prune(model, minTotal) {
    if (minTotal === undefined) minTotal = PRUNE_MIN;
    for (var k = 1; k <= model.maxOrder; k++) {
      var lvl = model.levels[k], dead = [];
      lvl.forEach(function (node, key) { if (node.t < minTotal) dead.push(key); });
      for (var i = 0; i < dead.length; i++) lvl.delete(dead[i]);
    }
    return model;
  }

  /* Counts are stored in logarithmic buckets so each fits in COUNT_BITS.
     Measured: 4 bits leaves identification accuracy unchanged, and the
     recomputed totals keep the model self-consistent. */
  function bucketOf(count, bits) {
    if (count <= 0) return 0;
    var maxB = (1 << bits) - 1;
    var b = Math.round(Math.log2(count) * 2) + 1;
    return b > maxB ? maxB : b;
  }
  function valueOf(bucket) {
    if (bucket <= 0) return 0;
    return Math.max(1, Math.round(Math.pow(2, (bucket - 1) / 2)));
  }

  function quantizeCounts(model, bits) {
    if (bits === undefined) bits = COUNT_BITS;
    for (var k = 0; k <= model.maxOrder; k++) {
      model.levels[k].forEach(function (node) {
        var t = 0, d = 0;
        for (var s = 0; s < ALPHABET; s++) {
          if (node.c[s] === 0) continue;
          var v = valueOf(bucketOf(node.c[s], bits));
          node.c[s] = v; t += v; d++;
        }
        node.t = t; node.d = d;
      });
    }
    return model;
  }

  /* ---------- serialization ---------------------------------------------

     Varint everywhere, context keys delta coded against the previous key at
     the same order. Symbols within a node are also delta coded. The result is
     about 40% smaller than the same data as JSON. */

  function VarintWriter() { this.buf = []; }
  VarintWriter.prototype.u = function (n) {
    n = n >>> 0;
    while (n >= 0x80) { this.buf.push((n & 0x7f) | 0x80); n >>>= 7; }
    this.buf.push(n);
  };
  VarintWriter.prototype.bytes = function () { return new Uint8Array(this.buf); };

  function VarintReader(u8) { this.a = u8; this.p = 0; }
  VarintReader.prototype.u = function () {
    var shift = 0, res = 0, b;
    do { b = this.a[this.p++]; res |= (b & 0x7f) << shift; shift += 7; } while (b & 0x80);
    return res >>> 0;
  };
  VarintReader.prototype.done = function () { return this.p >= this.a.length; };

  function serialize(model) {
    var w = new VarintWriter();
    w.u(model.maxOrder);
    for (var k = 0; k <= model.maxOrder; k++) {
      var lvl = model.levels[k];
      var keys = Array.from(lvl.keys()).sort(function (a, b) { return a - b; });
      w.u(keys.length);
      var prevKey = 0;
      for (var i = 0; i < keys.length; i++) {
        var key = keys[i], node = lvl.get(key);
        w.u(key - prevKey); prevKey = key;
        var syms = [];
        for (var s = 0; s < ALPHABET; s++) if (node.c[s] > 0) syms.push(s);
        w.u(syms.length);
        var prevSym = 0;
        for (var j = 0; j < syms.length; j++) {
          w.u(syms[j] - prevSym); prevSym = syms[j];
          w.u(node.c[syms[j]]);
        }
      }
    }
    return w.bytes();
  }

  /* ---------- flat model (load time) ------------------------------------

     The obvious Map-of-objects representation measured 259 MB of heap for 100
     models, which would kill mobile Safari. This open-addressed flat form
     measured 24 MB and produces bit-identical code lengths. It is a
     requirement, not an optimization.

     Layout per order: a power-of-two hash table of keys (Int32Array, -1 empty)
     pointing at a slot index. Per slot we store the total, the distinct count,
     and an offset/length into shared symbol and count arrays. */

  function nextPow2(n) { var p = 1; while (p < n) p <<= 1; return p; }

  function buildFlatLevel(entries) {
    // entries: [{key, syms:[], cnts:[], t, d}]
    var n = entries.length;
    var cap = nextPow2(Math.max(4, Math.ceil(n / 0.6)));
    var mask = cap - 1;
    var hkey = new Int32Array(cap).fill(-1);
    var hslot = new Int32Array(cap).fill(-1);
    var total = new Float32Array(n);
    var distinct = new Float32Array(n);
    var off = new Uint32Array(n + 1);
    var symTotal = 0, i;
    for (i = 0; i < n; i++) symTotal += entries[i].syms.length;
    var syms = new Uint8Array(symTotal);
    var cnts = new Float32Array(symTotal);
    var cursor = 0;
    for (i = 0; i < n; i++) {
      var e = entries[i];
      off[i] = cursor;
      for (var j = 0; j < e.syms.length; j++) { syms[cursor] = e.syms[j]; cnts[cursor] = e.cnts[j]; cursor++; }
      total[i] = e.t; distinct[i] = e.d;
      // open addressing, linear probing
      var h = (Math.imul(e.key ^ (e.key >>> 15), 0x2545F491) >>> 0) & mask;
      while (hkey[h] !== -1) h = (h + 1) & mask;
      hkey[h] = e.key; hslot[h] = i;
    }
    off[n] = cursor;
    return { mask: mask, hkey: hkey, hslot: hslot, total: total, distinct: distinct, off: off, syms: syms, cnts: cnts };
  }

  function deserialize(u8) {
    var r = new VarintReader(u8);
    var maxOrder = r.u();
    var levels = [];
    for (var k = 0; k <= maxOrder; k++) {
      var count = r.u();
      var entries = [];
      var prevKey = 0;
      for (var i = 0; i < count; i++) {
        var key = prevKey + r.u(); prevKey = key;
        var ns = r.u();
        var symsArr = new Array(ns), cntsArr = new Array(ns);
        var prevSym = 0, t = 0;
        for (var j = 0; j < ns; j++) {
          var sym = prevSym + r.u(); prevSym = sym;
          var c = r.u();
          symsArr[j] = sym; cntsArr[j] = c; t += c;
        }
        entries.push({ key: key, syms: symsArr, cnts: cntsArr, t: t, d: ns });
      }
      levels.push(buildFlatLevel(entries));
    }
    return { maxOrder: maxOrder, levels: levels };
  }

  /* Look up a context key, returning the slot index or -1. */
  function findSlot(lvl, key) {
    var h = (Math.imul(key ^ (key >>> 15), 0x2545F491) >>> 0) & lvl.mask;
    var hkey = lvl.hkey;
    while (true) {
      var k = hkey[h];
      if (k === -1) return -1;
      if (k === key) return lvl.hslot[h];
      h = (h + 1) & lvl.mask;
    }
  }

  function countIn(lvl, slot, sym) {
    var a = lvl.off[slot], b = lvl.off[slot + 1], syms = lvl.syms;
    for (var i = a; i < b; i++) if (syms[i] === sym) return lvl.cnts[i];
    return 0;
  }

  /* ---------- code length ------------------------------------------------

     Recursive Witten-Bell interpolation:

       p_k = (c_k(s) + d_k * p_{k-1}) / (t_k + d_k),  p_{-1} = 1/256

     where c_k is the count of s in the order-k context, t_k the context total
     and d_k the number of distinct symbols seen there. The descent stops at a
     context that was never seen. No escapes, no exclusion: measured against
     PPM-C and PPM-D this is as accurate and about five times faster, because
     only the argmin over models matters, never a real encodable code. */

  function codeLen(flat, bytes) {
    var bits = 0, maxOrder = flat.maxOrder, levels = flat.levels;
    var uniform = 1 / ALPHABET;
    for (var i = 0; i < bytes.length; i++) {
      var sym = bytes[i];
      var p = uniform;
      var hi = maxOrder < i ? maxOrder : i;
      for (var k = 0; k <= hi; k++) {
        var key = 0;
        for (var j = k; j >= 1; j--) key = (key << 8) | bytes[i - j];
        var lvl = levels[k];
        var slot = findSlot(lvl, key);
        if (slot === -1) break;
        var t = lvl.total[slot], d = lvl.distinct[slot];
        p = (countIn(lvl, slot, sym) + d * p) / (t + d);
      }
      bits -= Math.log2(p);
    }
    return bits;
  }

  /* ---------- scoring ---------------------------------------------------- */

  /* models: [{code, flat}]. Returns per-model bits/byte plus a calibrated
     posterior. The relative value (bits/byte minus the mean over all models)
     is what the bars show: subtracting the mean cancels how intrinsically
     complex the pasted text is, so a simple sentence and a dense one produce
     comparably scaled bars. */
  function scoreAll(models, text) {
    var bytes = encodeUtf8(text);
    var n = models.length;
    var bits = new Float64Array(n), bpb = new Float64Array(n);
    var i;
    for (i = 0; i < n; i++) {
      bits[i] = codeLen(models[i].flat, bytes);
      bpb[i] = bytes.length ? bits[i] / bytes.length : 0;
    }
    var mean = 0;
    for (i = 0; i < n; i++) mean += bpb[i];
    mean = n ? mean / n : 0;
    var relative = new Float64Array(n);
    for (i = 0; i < n; i++) relative[i] = bpb[i] - mean;

    // Raw softmax saturates to 100/0 and would overstate certainty. This
    // temperature was calibrated so mean top-1 probability tracks measured
    // accuracy across query lengths.
    var T = TEMP_PER_BYTE * Math.max(1, bytes.length);
    var best = Infinity;
    for (i = 0; i < n; i++) if (bits[i] < best) best = bits[i];
    var post = new Float64Array(n), sum = 0;
    for (i = 0; i < n; i++) { post[i] = Math.exp(-(bits[i] - best) / T); sum += post[i]; }
    for (i = 0; i < n; i++) post[i] /= sum;

    var ranked = [];
    for (i = 0; i < n; i++) ranked.push({ i: i, code: models[i].code, bits: bits[i], bpb: bpb[i], relative: relative[i], posterior: post[i] });
    ranked.sort(function (a, b) { return a.bits - b.bits; });
    return { nbytes: bytes.length, bits: bits, bitsPerByte: bpb, relative: relative, posterior: post, ranked: ranked };
  }

  /* ---------- language geometry ------------------------------------------ */

  /* Cross-entropy of each language's probe text under every model. */
  function crossEntropyMatrix(models, probes) {
    var n = models.length, H = [];
    for (var i = 0; i < n; i++) {
      H.push(new Float64Array(n));
      var pb = encodeUtf8(probes[i]);
      for (var j = 0; j < n; j++) H[i][j] = codeLen(models[j].flat, pb) / pb.length;
    }
    return H;
  }

  /* Cross-entropy is strongly asymmetric. Of four symmetrizations tested, the
     plain average recovered the most same-family nearest neighbours (82%), so
     that is what the tree uses. */
  function symmetrize(H, mode) {
    var n = H.length, D = [], i, j;
    for (i = 0; i < n; i++) D.push(new Float64Array(n));
    for (i = 0; i < n; i++) {
      for (j = 0; j < n; j++) {
        if (i === j) { D[i][j] = 0; continue; }
        if (mode === 'excess') {
          D[i][j] = ((H[i][j] - H[i][i]) + (H[j][i] - H[j][j])) / 2;
        } else {
          D[i][j] = (H[i][j] + H[j][i]) / 2;
        }
      }
    }
    // The average form leaves the diagonal at the self-entropy level, which
    // would make a language look distant from itself. Shift so the smallest
    // off-diagonal sits above zero and the diagonal is exactly zero.
    if (mode !== 'excess') {
      for (i = 0; i < n; i++) {
        for (j = 0; j < n; j++) {
          if (i !== j) D[i][j] = D[i][j] - (H[i][i] + H[j][j]) / 2;
        }
      }
      var mn = Infinity;
      for (i = 0; i < n; i++) for (j = 0; j < n; j++) if (i !== j && D[i][j] < mn) mn = D[i][j];
      if (mn < 0) {
        for (i = 0; i < n; i++) for (j = 0; j < n; j++) if (i !== j) D[i][j] -= mn;
      }
    }
    return D;
  }

  /* UPGMA, average linkage. Chosen over neighbour joining because NJ produced
     long unbalanced ladders on this data; UPGMA's rooted balanced output is
     what a dendrogram wants. Heights are half the merge distance so they read
     as an ultrametric axis. */
  function upgma(D, labels) {
    var n = D.length;
    if (n === 0) return null;
    var active = [], i, j;
    for (i = 0; i < n; i++) active.push({ node: { leaf: true, code: labels[i], height: 0, size: 1 }, members: [i] });
    // working copy of the distance matrix over cluster indices
    var d = [];
    for (i = 0; i < n; i++) { d.push(new Float64Array(n)); for (j = 0; j < n; j++) d[i][j] = D[i][j]; }
    var idx = [];
    for (i = 0; i < n; i++) idx.push(i);

    while (active.length > 1) {
      var bi = -1, bj = -1, bd = Infinity;
      for (i = 0; i < active.length; i++) {
        for (j = i + 1; j < active.length; j++) {
          var v = d[idx[i]][idx[j]];
          if (v < bd) { bd = v; bi = i; bj = j; }
        }
      }
      var A = active[bi], B = active[bj];
      var merged = {
        leaf: false,
        left: A.node, right: B.node,
        height: bd / 2,
        size: A.node.size + B.node.size
      };
      // average linkage update, weighted by cluster size
      var ni = A.members.length, nj = B.members.length;
      var ai = idx[bi], aj = idx[bj];
      for (var k = 0; k < active.length; k++) {
        if (k === bi || k === bj) continue;
        var ak = idx[k];
        var nd = (ni * d[ai][ak] + nj * d[aj][ak]) / (ni + nj);
        d[ai][ak] = nd; d[ak][ai] = nd;
      }
      A.node = merged;
      A.members = A.members.concat(B.members);
      active.splice(bj, 1);
      idx.splice(bj, 1);
    }
    return active[0].node;
  }

  /* Leaf order and coordinates for a rectangular dendrogram. x is the height,
     y is the in-order position of the leaves. */
  function layoutTree(tree) {
    var leaves = [], links = [], nodes = [];
    var counter = { y: 0 };
    function walk(node) {
      if (node.leaf) {
        node._y = counter.y++;
        node._x = 0;
        leaves.push(node);
        nodes.push(node);
        return node;
      }
      var L = walk(node.left), R = walk(node.right);
      node._y = (L._y + R._y) / 2;
      node._x = node.height;
      nodes.push(node);
      links.push({ from: node, to: L });
      links.push({ from: node, to: R });
      return node;
    }
    walk(tree);
    var maxHeight = 0;
    for (var i = 0; i < nodes.length; i++) if (nodes[i]._x > maxHeight) maxHeight = nodes[i]._x;
    return { nodes: nodes, links: links, leaves: leaves, maxHeight: maxHeight };
  }

  /* Insert the user's sample as an extra leaf without rebuilding the tree.
     Rebuilding would make the corpus tree jump around on every keystroke; the
     point is that the sample lands in a stable tree.

     `distByCode` must be on the same scale as the tree's heights, which means
     the caller has to subtract self-entropy the way symmetrize() does. Raw
     cross-entropy runs roughly three times larger and lands every sample at the
     root.

     The descent follows the *minimum* distance, not the mean. Mean linkage was
     the obvious choice and is wrong here: averaging over a large clade drowns
     the one language that actually matches, so a Finnish sample went to a clade
     of 52 languages instead of next to Finnish. The nearest corpus language is
     exactly what a reader expects the sample to hang beside.

     Having found that leaf, walk back up while the sample is closer to the
     clade than the clade's own spread, so a sample that fits a whole family
     attaches to the family rather than being jammed against one member. */
  function graftLeaf(tree, distByCode, label) {
    function minTo(node) {
      var best = Infinity;
      (function walk(x) {
        if (x.leaf) { var v = distByCode[x.code]; if (v !== undefined && v < best) best = v; return; }
        walk(x.left); walk(x.right);
      })(node);
      return best;
    }
    var sampleNode = { leaf: true, code: label, height: 0, size: 1, isSample: true };

    // Path from the root down to the nearest leaf.
    var path = [];
    (function descend(node) {
      path.push(node);
      if (node.leaf) return;
      var dl = minTo(node.left), dr = minTo(node.right);
      descend(dl <= dr ? node.left : node.right);
    })(tree);

    var d = minTo(path[path.length - 1]);   // distance to the nearest language
    // Climb only as long as the clade below is tighter than the sample's own
    // distance: the sample belongs to that clade as a whole rather than to one
    // member. Comparing against the child's height, not the parent's, is what
    // stops the walk. (Against the parent's it never stops, because the root is
    // taller than any single distance, and everything lands at the root.)
    var attachAt = path.length - 1;
    for (var k = path.length - 2; k >= 0; k--) {
      var child = path[k + 1];
      var spread = child.leaf ? 0 : child.height;
      // Strictly greater. With >= a sample that matches one language exactly
      // (d = 0, the common case, since the nearest distance is clamped at zero)
      // satisfies the test at every level and climbs all the way to the root.
      if (spread > d / 2) attachAt = k; else break;
    }
    var target = path[attachAt];

    function rebuild(node) {
      if (node === target) {
        return {
          leaf: false, left: node, right: sampleNode,
          height: Math.max(node.leaf ? 0 : node.height, d / 2),
          size: node.size + 1, hasSample: true
        };
      }
      if (node.leaf) return node;
      var inLeft = contains(node.left, target);
      var copy = {
        leaf: false, left: node.left, right: node.right,
        height: node.height, size: node.size + 1, hasSample: true
      };
      if (inLeft) copy.left = rebuild(node.left); else copy.right = rebuild(node.right);
      return copy;
    }
    function contains(node, needle) {
      if (node === needle) return true;
      if (node.leaf) return false;
      return contains(node.left, needle) || contains(node.right, needle);
    }
    return rebuild(tree);
  }

  /* Feeding the raw distance to the map lets script differences dominate: a
     Cyrillic and a Latin text share almost no byte patterns, so those pairs sit
     far outside the range that separates, say, German from Dutch, and every
     Latin-script language collapses into one blob.

     Compressing the scale fixes that. A logarithm is the natural choice here
     because cross-entropy is already a log quantity, so this stays in units the
     measure is defined in rather than introducing an arbitrary exponent.

     Measured on an earlier 47-language corpus with 5 random starts, before
     smacofBest began selecting on neighbour trust. What matters here is the
     comparison between transforms, which that change does not affect. The
     fraction of languages whose nearest neighbour on the map is also their
     true nearest neighbour:
     rank transform 26%, raw distance 47%, log with s between 3 and 12 all
     46-48%. The log form additionally gives the Latin-script languages 61% of
     the map instead of 47%, which is the whole point. The plateau is flat, so
     s = 4 is a choice within a broad safe range, not a tuned optimum. */
  var MDS_SCALE = 4;
  /* Restarts for the map layout. Build-time only, so this costs the visitor
     nothing; ~50 s for the 87-language corpus. See smacofBest for why the
     count is this high and why the winner is chosen on neighbour trust. */
  var SMACOF_TRIES = 1200;

  function logTransform(D, scale) {
    if (scale === undefined) scale = MDS_SCALE;
    var n = D.length, out = [], i, j, mx = 0;
    for (i = 0; i < n; i++) out.push(new Float64Array(n));
    for (i = 0; i < n; i++) {
      for (j = 0; j < n; j++) {
        if (i === j) continue;
        out[i][j] = Math.log1p(D[i][j] / scale);
        if (out[i][j] > mx) mx = out[i][j];
      }
    }
    if (mx > 0) for (i = 0; i < n; i++) for (j = 0; j < n; j++) out[i][j] /= mx;
    return out;
  }

  /* Kept for comparison in the test suite; not what the map uses. */
  function rankTransform(D) {
    var n = D.length, pairs = [], i, j;
    for (i = 0; i < n; i++) for (j = i + 1; j < n; j++) pairs.push({ i: i, j: j, v: D[i][j] });
    pairs.sort(function (a, b) { return a.v - b.v; });
    var out = [];
    for (i = 0; i < n; i++) out.push(new Float64Array(n));
    for (var r = 0; r < pairs.length; r++) {
      var p = pairs[r];
      var v = pairs.length > 1 ? r / (pairs.length - 1) : 0;
      out[p.i][p.j] = v; out[p.j][p.i] = v;
    }
    return out;
  }

  /* SMACOF stress majorization. */
  function smacof(D, iters, seed) {
    if (iters === undefined) iters = 600;
    var n = D.length;
    var rnd = mulberry32(seed === undefined ? 12345 : seed);
    var X = [];
    for (var i = 0; i < n; i++) X.push([rnd() * 2 - 1, rnd() * 2 - 1]);
    if (n < 2) return { X: X, stress: 0 };

    var stress = 0;
    for (var it = 0; it < iters; it++) {
      var Y = [];
      for (i = 0; i < n; i++) Y.push([0, 0]);
      for (i = 0; i < n; i++) {
        var sx = 0, sy = 0, wsum = 0;
        for (var j = 0; j < n; j++) {
          if (i === j) continue;
          var dx = X[i][0] - X[j][0], dy = X[i][1] - X[j][1];
          var dist = Math.sqrt(dx * dx + dy * dy);
          var ratio = dist > 1e-9 ? D[i][j] / dist : 0;
          sx += X[j][0] + ratio * dx;
          sy += X[j][1] + ratio * dy;
          wsum++;
        }
        Y[i][0] = sx / wsum; Y[i][1] = sy / wsum;
      }
      X = Y;
    }
    // final normalized stress
    var num = 0, den = 0;
    for (i = 0; i < n; i++) {
      for (var j2 = i + 1; j2 < n; j2++) {
        var ddx = X[i][0] - X[j2][0], ddy = X[i][1] - X[j2][1];
        var dd = Math.sqrt(ddx * ddx + ddy * ddy);
        num += (dd - D[i][j2]) * (dd - D[i][j2]);
        den += D[i][j2] * D[i][j2];
      }
    }
    stress = den > 0 ? Math.sqrt(num / den) : 0;
    return { X: X, stress: stress };
  }

  /* Neighbourhood preservation: of each point's k true nearest, how many are
     still among its k nearest in the layout. Unlike stress, which averages
     every pair and is dominated by the large distances, this measures the
     one thing a reader takes off the map, namely who sits next to whom. */
  function neighbourTrust(D, X, k) {
    var n = D.length, hit = 0, tot = 0, i, j;
    if (k === undefined) k = 5;
    var idx = [];
    for (i = 0; i < n; i++) idx.push(i);
    for (i = 0; i < n; i++) {
      var others = [];
      for (j = 0; j < n; j++) if (j !== i) others.push(j);
      var byTrue = others.slice().sort(function (a, b) { return D[i][a] - D[i][b]; });
      var byMap = others.slice().sort(function (a, b) {
        var da = (X[a][0] - X[i][0]) * (X[a][0] - X[i][0]) + (X[a][1] - X[i][1]) * (X[a][1] - X[i][1]);
        var db = (X[b][0] - X[i][0]) * (X[b][0] - X[i][0]) + (X[b][1] - X[i][1]) * (X[b][1] - X[i][1]);
        return da - db;
      });
      var near = {};
      for (j = 0; j < k && j < byMap.length; j++) near[byMap[j]] = 1;
      for (j = 0; j < k && j < byTrue.length; j++) { tot++; if (near[byTrue[j]]) hit++; }
    }
    return tot ? hit / tot : 0;
  }

  /* Majorization only finds a local optimum, and the starting configuration
     decides which one. Run many fixed seeds and keep the best.

     Selection is by neighbourhood trust, not by stress. Measured over 1665
     seeds on the 87-language corpus: stress spans only 0.2869 to 0.2985
     while trust@5 spans 36.8% to 52.2%, and the two barely correlate (a run
     at 0.2981, near the worst stress, tied for the best trust). Picking the
     lowest stress therefore picks close to arbitrarily among layouts that
     differ a lot in the neighbourhoods a reader actually reads. Selecting on
     trust gives 52.2% where lowest-stress gives 49.9% over the same runs.

     k=5 and k=10 are averaged so the choice is not tuned to one radius.
     The seed list is generated from a fixed formula, so the build stays
     reproducible; iterations past ~600 change neither measure. */
  function smacofBest(D, iters, seeds) {
    if (seeds === undefined) {
      seeds = [];
      for (var s = 0; s < SMACOF_TRIES; s++) seeds.push(s * 7919 + 1);
    }
    var best = null, bestScore = -1;
    for (var i = 0; i < seeds.length; i++) {
      var r = smacof(D, iters, seeds[i]);
      var score = (neighbourTrust(D, r.X, 5) + neighbourTrust(D, r.X, 10)) / 2;
      if (score > bestScore) { bestScore = score; best = r; best.seed = seeds[i]; best.trust = score; }
    }
    return best;
  }

  /* Place one extra point into an existing configuration without moving it,
     by the same majorization step applied to the sample alone. */
  function projectPoint(X, dists, iters) {
    if (iters === undefined) iters = 200;
    var n = X.length;
    if (!n) return [0, 0];
    var p = [0, 0], i;
    for (i = 0; i < n; i++) { p[0] += X[i][0]; p[1] += X[i][1]; }
    p[0] /= n; p[1] /= n;
    for (var it = 0; it < iters; it++) {
      var sx = 0, sy = 0;
      for (i = 0; i < n; i++) {
        var dx = p[0] - X[i][0], dy = p[1] - X[i][1];
        var dist = Math.sqrt(dx * dx + dy * dy);
        var ratio = dist > 1e-9 ? dists[i] / dist : 0;
        sx += X[i][0] + ratio * dx;
        sy += X[i][1] + ratio * dy;
      }
      p = [sx / n, sy / n];
    }
    return p;
  }

  /* ---------- seam for the planned world map ----------------------------
     scoreAll already yields a per-language affinity vector; the map is then a
     dot product against a country-by-language speaker-share table. Kept here
     so that view needs no change to the core. */
  function affinityVector(scoreResult) {
    return scoreResult.posterior;
  }

  /* ---------- base64 for the packed distance matrix ---------------------- */

  function b64ToBytes(b64) {
    if (typeof atob === 'function') {
      var bin = atob(b64), out = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
      return out;
    }
    return new Uint8Array(Buffer.from(b64, 'base64'));
  }
  function bytesToB64(u8) {
    if (typeof btoa === 'function') {
      var s = '';
      for (var i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]);
      return btoa(s);
    }
    return Buffer.from(u8).toString('base64');
  }

  /* Upper triangle of a symmetric matrix as Float32, row major. */
  function packMatrix(D) {
    var n = D.length, m = (n * (n - 1)) / 2;
    var f = new Float32Array(m), p = 0;
    for (var i = 0; i < n; i++) for (var j = i + 1; j < n; j++) f[p++] = D[i][j];
    return bytesToB64(new Uint8Array(f.buffer));
  }
  function unpackMatrix(b64, n) {
    var u8 = b64ToBytes(b64);
    var f = new Float32Array(u8.buffer, u8.byteOffset, u8.byteLength / 4);
    var D = [], i, j;
    for (i = 0; i < n; i++) D.push(new Float64Array(n));
    var p = 0;
    for (i = 0; i < n; i++) for (j = i + 1; j < n; j++) { D[i][j] = f[p]; D[j][i] = f[p]; p++; }
    return D;
  }

  return {
    ORDER: ORDER, ALPHABET: ALPHABET, PRUNE_MIN: PRUNE_MIN, COUNT_BITS: COUNT_BITS,
    TEMP_PER_BYTE: TEMP_PER_BYTE, MIN_CHARS: MIN_CHARS, RELIABLE_CHARS: RELIABLE_CHARS,
    encodeUtf8: encodeUtf8, mulberry32: mulberry32, normalizeIndent: normalizeIndent,
    train: train, prune: prune, quantizeCounts: quantizeCounts,
    serialize: serialize, deserialize: deserialize,
    codeLen: codeLen, scoreAll: scoreAll,
    crossEntropyMatrix: crossEntropyMatrix, symmetrize: symmetrize,
    upgma: upgma, layoutTree: layoutTree, graftLeaf: graftLeaf,
    MDS_SCALE: MDS_SCALE,
    rankTransform: rankTransform, logTransform: logTransform,
    smacof: smacof, smacofBest: smacofBest, projectPoint: projectPoint,
    neighbourTrust: neighbourTrust, SMACOF_TRIES: SMACOF_TRIES,
    affinityVector: affinityVector,
    packMatrix: packMatrix, unpackMatrix: unpackMatrix,
    bytesToB64: bytesToB64, b64ToBytes: b64ToBytes
  };
})();
if (typeof window !== 'undefined') window.NCDCore = NCDCore;
if (typeof module !== 'undefined' && module.exports) module.exports = NCDCore;
/* NCD-CORE-END */
