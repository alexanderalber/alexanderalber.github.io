/* LLM-Detector — Vanilla-JS-Referenzimplementierung (Feature-Spec v0.3).
 *
 * Spiegel von src/detector/{textproc,features,infer}.py — jede Änderung hier
 * oder dort braucht grüne Parity-Tests (tests/test_parity.py).
 * Keine Dependencies; läuft in Browser und Node. Das Modell (model.json)
 * wird von außen geladen und an detect() übergeben.
 */
(function () {
  "use strict";

  var WORD_RE = /\p{L}+(?:['’-]\p{L}+)*/gu;
  var SENT_CAND_RE = /[^.!?…]+[.!?…]*/g;
  var PUNCT_SET = ".,;:!?…—–-()\"'«»„“”‚‘’";

  var MATTR_WINDOW = 100;
  var LONG_WORD_MIN = 7;

  function normalize(text) {
    return text.normalize("NFC").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  }

  function words(text) {
    var out = [];
    var m;
    WORD_RE.lastIndex = 0;
    while ((m = WORD_RE.exec(text)) !== null) out.push(m[0].toLowerCase());
    return out;
  }

  function sentences(text) {
    var out = [];
    var lines = text.split("\n");
    for (var i = 0; i < lines.length; i++) {
      var m;
      SENT_CAND_RE.lastIndex = 0;
      while ((m = SENT_CAND_RE.exec(lines[i])) !== null) {
        var w = words(m[0]);
        if (w.length > 0) out.push(w);
      }
    }
    return out;
  }

  // --- Offsets für das spans-Feld (Highlighting) ---
  // Offsets sind UTF-16-Code-Units im NORMALISIERTEN Text (natives
  // JS-String-Indexing); Spiegel von src/detector/textproc.py.

  function wordsWithOffsets(text) {
    var out = [];
    var m;
    WORD_RE.lastIndex = 0;
    while ((m = WORD_RE.exec(text)) !== null) {
      out.push({ w: m[0].toLowerCase(), start: m.index, end: m.index + m[0].length });
    }
    return out;
  }

  function sentenceSpansOf(text) {
    var out = [];
    var lines = text.split("\n");
    var lineStart = 0;
    for (var i = 0; i < lines.length; i++) {
      var m;
      SENT_CAND_RE.lastIndex = 0;
      while ((m = SENT_CAND_RE.exec(lines[i])) !== null) {
        var w = words(m[0]);
        if (w.length > 0) {
          var seg = m[0];
          var ls = 0;
          while (ls < seg.length && (seg[ls] === " " || seg[ls] === "\t")) ls += 1;
          var rs = seg.length;
          while (rs > ls && (seg[rs - 1] === " " || seg[rs - 1] === "\t")) rs -= 1;
          out.push({ start: lineStart + m.index + ls, end: lineStart + m.index + rs, words: w });
        }
      }
      lineStart += lines[i].length + 1;
    }
    return out;
  }

  function mean(xs) {
    if (xs.length === 0) return 0;
    var s = 0;
    for (var i = 0; i < xs.length; i++) s += xs[i];
    return s / xs.length;
  }

  function std(xs) {
    if (xs.length === 0) return 0;
    var m = mean(xs);
    var s = 0;
    for (var i = 0; i < xs.length; i++) {
      var d = xs[i] - m;
      s += d * d;
    }
    return Math.sqrt(s / xs.length);
  }

  function mattr(ws, window) {
    var n = ws.length;
    if (n === 0) return 0;
    if (n < window) {
      var seen = {};
      var distinct0 = 0;
      for (var i = 0; i < n; i++) {
        if (!Object.prototype.hasOwnProperty.call(seen, ws[i])) {
          seen[ws[i]] = true;
          distinct0 += 1;
        }
      }
      return distinct0 / n;
    }
    var counts = new Map();
    var distinct = 0;
    for (var j = 0; j < window; j++) {
      var c = counts.get(ws[j]) || 0;
      if (c === 0) distinct += 1;
      counts.set(ws[j], c + 1);
    }
    var total = distinct;
    for (var k = window; k < n; k++) {
      var out = ws[k - window];
      counts.set(out, counts.get(out) - 1);
      if (counts.get(out) === 0) distinct -= 1;
      var inc = ws[k];
      var c2 = counts.get(inc) || 0;
      if (c2 === 0) distinct += 1;
      counts.set(inc, c2 + 1);
      total += distinct;
    }
    return total / (n - window + 1) / window;
  }

  // --- Char-n-Gramm-LM (Stupid Backoff), Spiegel von src/detector/ngram_lm.py ---

  var PAD_CHAR = "^";

  function scoreCharLogprob10(lm, cps, i) {
    // cps: Codepoint-Array des gepolsterten Satzes (Parität mit Python-Str-Slicing).
    var mult = 1.0;
    for (var k = lm.order; k > 1; k--) {
      var gram = cps.slice(i - k + 1, i + 1).join("");
      var g = lm.grams[String(k)][gram];
      if (g !== undefined) {
        var cc = lm.ctx[String(k)][cps.slice(i - k + 1, i).join("")];
        return Math.log10((mult * g) / cc);
      }
      mult *= lm.alpha;
    }
    var uni = lm.unigrams[cps[i]];
    var p = (uni !== undefined ? uni : 1.0) / lm.unigram_total;
    return Math.log10(mult * p);
  }

  function sentenceSurprisals(sents, lm) {
    var pad = PAD_CHAR.repeat(lm.order - 1);
    var out = [];
    for (var si = 0; si < sents.length; si++) {
      if (sents[si].length === 0) continue;
      var cps = Array.from(pad + sents[si].join(" "));
      var total = 0.0;
      for (var i = lm.order - 1; i < cps.length; i++) {
        total -= scoreCharLogprob10(lm, cps, i);
      }
      out.push(total / (cps.length - (lm.order - 1)));
    }
    return out;
  }

  function splitPhrases(phrases) {
    var out = [];
    for (var i = 0; i < phrases.length; i++) {
      var toks = words(normalize(phrases[i]));
      if (toks.length > 0) out.push(toks);
    }
    return out;
  }

  function phraseHits(ws, phrases) {
    var byFirst = new Map();
    for (var i = 0; i < phrases.length; i++) {
      var p = phrases[i];
      if (!byFirst.has(p[0])) byFirst.set(p[0], []);
      byFirst.get(p[0]).push(p);
    }
    var hits = 0;
    var n = ws.length;
    for (var j = 0; j < n; j++) {
      var cands = byFirst.get(ws[j]);
      if (!cands) continue;
      for (var k = 0; k < cands.length; k++) {
        var ph = cands[k];
        if (j + ph.length > n) continue;
        var match = true;
        for (var t = 0; t < ph.length; t++) {
          if (ws[j + t] !== ph[t]) { match = false; break; }
        }
        if (match) hits += 1;
      }
    }
    return hits;
  }

  function extractFeatures(text, resources) {
    var lists = resources.wordlists;
    var lm = resources.ngram_lm;
    var t = normalize(text);
    var ws = words(t);
    var sents = sentences(t);
    var n = ws.length;

    var sentLens = [];
    for (var i = 0; i < sents.length; i++) sentLens.push(sents[i].length);
    var slMean = mean(sentLens);
    var slStd = std(sentLens);
    var sentLenCv = sentLens.length >= 2 && slMean > 0 ? slStd / slMean : 0;

    var wordLens = [];
    for (var j = 0; j < n; j++) {
      // Codepoints zählen, nicht UTF-16-Units (Parität mit Python len()).
      wordLens.push(Array.from(ws[j]).length);
    }
    var wordLenMean = mean(wordLens);

    var punctCounts = {};
    var punctTotal = 0;
    for (var k = 0; k < t.length; k++) {
      var ch = t[k];
      if (PUNCT_SET.indexOf(ch) !== -1) {
        punctCounts[ch] = (punctCounts[ch] || 0) + 1;
        punctTotal += 1;
      }
    }
    var punctEntropy = 0;
    if (punctTotal > 0) {
      var keys = Object.keys(punctCounts).sort();
      for (var q = 0; q < keys.length; q++) {
        var p = punctCounts[keys[q]] / punctTotal;
        punctEntropy -= p * Math.log2(p);
      }
    }

    var connectors = splitPhrases(lists.connectors);
    var aiPhrases = splitPhrases(lists.ai_phrases);
    var functionWords = new Set(lists.function_words);

    var longWords = 0;
    var fnWords = 0;
    for (var u = 0; u < n; u++) {
      if (Array.from(ws[u]).length >= LONG_WORD_MIN) longWords += 1;
      if (functionWords.has(ws[u])) fnWords += 1;
    }

    var surprisalMean = 0;
    var surprisalCv = 0;
    if (lm && sents.length > 0) {
      var surprisals = sentenceSurprisals(sents, lm);
      surprisalMean = mean(surprisals);
      if (surprisals.length >= 2 && surprisalMean > 0) {
        surprisalCv = std(surprisals) / surprisalMean;
      }
    }

    return {
      word_count: n,
      sent_len_mean: slMean,
      sent_len_cv: sentLenCv,
      word_len_mean: wordLenMean,
      mattr_100: mattr(ws, MATTR_WINDOW),
      punct_entropy: punctEntropy,
      punct_per_word: n ? punctTotal / n : 0,
      connector_density: n ? (phraseHits(ws, connectors) * 100.0) / n : 0,
      ai_phrase_density: n ? (phraseHits(ws, aiPhrases) * 100.0) / n : 0,
      long_word_ratio: n ? longWords / n : 0,
      function_word_ratio: n ? fnWords / n : 0,
      char_surprisal_mean: surprisalMean,
      char_surprisal_cv: surprisalCv,
    };
  }

  // spans-Feld (Highlighting), Spiegel von src/detector/infer.py.

  function phraseSpans(tokOff, phrases) {
    var byFirst = new Map();
    for (var i = 0; i < phrases.length; i++) {
      var p = phrases[i];
      if (!byFirst.has(p[0])) byFirst.set(p[0], []);
      byFirst.get(p[0]).push(p);
    }
    var spans = [];
    var n = tokOff.length;
    for (var j = 0; j < n; j++) {
      var cands = byFirst.get(tokOff[j].w);
      if (!cands) continue;
      for (var k = 0; k < cands.length; k++) {
        var ph = cands[k];
        if (j + ph.length > n) continue;
        var match = true;
        for (var t = 0; t < ph.length; t++) {
          if (tokOff[j + t].w !== ph[t]) { match = false; break; }
        }
        if (match) {
          spans.push({ start: tokOff[j].start, end: tokOff[j + ph.length - 1].end, phrase: ph.join(" ") });
        }
      }
    }
    return spans;
  }

  function buildSpans(t, bundle) {
    var lists = bundle.wordlists;
    var tokOff = wordsWithOffsets(t);
    var sentSp = sentenceSpansOf(t);
    var lm = bundle.ngram_lm;
    var surprisals = [];
    if (lm && sentSp.length > 0) {
      var sents = [];
      for (var i = 0; i < sentSp.length; i++) sents.push(sentSp[i].words);
      surprisals = sentenceSurprisals(sents, lm);
    }
    var sentencesOut = [];
    for (var s = 0; s < sentSp.length; s++) {
      var entry = { start: sentSp[s].start, end: sentSp[s].end, word_count: sentSp[s].words.length };
      if (surprisals.length > 0) entry.surprisal = surprisals[s];
      sentencesOut.push(entry);
    }
    return {
      ai_phrases: phraseSpans(tokOff, splitPhrases(lists.ai_phrases)),
      connectors: phraseSpans(tokOff, splitPhrases(lists.connectors)),
      sentences: sentencesOut,
    };
  }

  // GBTree-Inferenz (XGBoost-Export), Spiegel von src/detector/gbtree.py.
  // Rückgabe: { margin, contributions } (Saabas-Beiträge auf Margin-Skala).
  function predictGbtree(gb, xs) {
    var xs32 = [];
    for (var f = 0; f < xs.length; f++) xs32.push(Math.fround(xs[f]));
    var contribs = [];
    for (var c = 0; c < xs.length; c++) contribs.push(0.0);
    var margin = gb.base_score;
    for (var t = 0; t < gb.trees.length; t++) {
      var tree = gb.trees[t];
      var feat = tree.feat;
      var thresh = tree.thresh;
      var left = tree.left;
      var right = tree.right;
      var value = tree.value;
      var i = 0;
      while (feat[i] !== -1) {
        var j = xs32[feat[i]] < thresh[i] ? left[i] : right[i];
        contribs[feat[i]] += value[j] - value[i];
        i = j;
      }
      margin += value[i];
    }
    return { margin: margin, contributions: contribs };
  }

  // Spracherkennung via Funktionswort-Dichte, Spiegel von src/detector/langdetect.py.
  function detectLanguage(ws, model) {
    var cfg = model.language_detection;
    var ratios = {};
    if (ws.length === 0) return { language: "other", ratios: ratios };
    var n = ws.length;
    var bestLang = "other";
    var bestRatio = 0.0;
    for (var li = 0; li < cfg.order.length; li++) {
      var lang = cfg.order[li];
      var fw = new Set(model.languages[lang].wordlists.function_words);
      var hits = 0;
      for (var i = 0; i < n; i++) {
        if (fw.has(ws[i])) hits += 1;
      }
      var r = hits / n;
      ratios[lang] = r;
      if (r > bestRatio) {
        bestLang = lang;
        bestRatio = r;
      }
    }
    if (bestRatio < cfg.min_ratio) return { language: "other", ratios: ratios };
    return { language: bestLang, ratios: ratios };
  }

  function calibrate(pRaw, cal) {
    if (cal.type === "identity") return pRaw;
    if (cal.type !== "isotonic") throw new Error("unknown calibration type: " + cal.type);
    var xs = cal.x;
    var ys = cal.y;
    if (pRaw <= xs[0]) return ys[0];
    if (pRaw >= xs[xs.length - 1]) return ys[ys.length - 1];
    var lo = 0;
    var hi = xs.length - 1;
    while (hi - lo > 1) {
      var mid = (lo + hi) >> 1;
      if (xs[mid] <= pRaw) lo = mid; else hi = mid;
    }
    var span = xs[hi] - xs[lo];
    if (span === 0) return ys[lo];
    var frac = (pRaw - xs[lo]) / span;
    return ys[lo] + frac * (ys[hi] - ys[lo]);
  }

  function detect(text, model) {
    var ws = words(normalize(text));
    var wordCount = ws.length;

    if (wordCount < model.abstain.min_words) {
      return { abstain: true, features: [], notes: ["short_text"], word_count: wordCount };
    }

    var ld = detectLanguage(ws, model);
    if (ld.language === "other") {
      return {
        abstain: true,
        language: "other",
        language_ratios: ld.ratios,
        features: [],
        notes: ["unsupported_language"],
        word_count: wordCount,
      };
    }

    var bundle = model.languages[ld.language];
    var feats = extractFeatures(text, bundle);

    var z;
    var contributions = [];
    if ((bundle.model_type || "logistic_regression") === "gbtree") {
      var xs = [];
      for (var xi = 0; xi < bundle.features.length; xi++) xs.push(feats[bundle.features[xi].name]);
      var pred = predictGbtree(bundle.gbtree, xs);
      z = pred.margin;
      for (var gi = 0; gi < bundle.features.length; gi++) {
        var gspec = bundle.features[gi];
        contributions.push({ name: gspec.name, value: xs[gi], contribution: pred.contributions[gi], humanLabel: gspec.humanLabel });
      }
    } else {
      z = bundle.intercept;
      for (var i = 0; i < bundle.features.length; i++) {
        var spec = bundle.features[i];
        var x = feats[spec.name];
        var stdz = (x - spec.mean) / spec.scale;
        var c = spec.weight * stdz;
        z += c;
        contributions.push({ name: spec.name, value: x, contribution: c, humanLabel: spec.humanLabel });
      }
    }
    var pRaw = 1.0 / (1.0 + Math.exp(-z));
    var p = calibrate(pRaw, bundle.calibration);

    // Bayesfaktor, siehe src/detector/infer.py und docs/FEATURES.md.
    var bayesFactor = null;
    if (bundle.calibration_base_rate !== undefined) {
      var pi = bundle.calibration_base_rate;
      var pc = Math.min(Math.max(p, 1e-4), 1.0 - 1e-4);
      bayesFactor = (pc / (1.0 - pc)) / (pi / (1.0 - pi));
    }

    var confCfg = model.confidence;
    var margin = Math.abs(p - 0.5);
    var confidence;
    if (margin >= confCfg.high_margin && wordCount >= confCfg.high_min_words) confidence = "high";
    else if (margin >= confCfg.medium_margin) confidence = "medium";
    else confidence = "low";

    var result = {
      abstain: false,
      language: ld.language,
      probability: p,
      probability_raw: pRaw,
      confidence: confidence,
      features: contributions,
      spans: buildSpans(normalize(text), bundle),
      notes: [],
      word_count: wordCount,
    };
    if (bayesFactor !== null) {
      result.bayes_factor = bayesFactor;
      result.log10_bayes_factor = Math.log10(bayesFactor);
    }
    return result;
  }

  var api = { normalize: normalize, words: words, sentences: sentences, extractFeatures: extractFeatures, detectLanguage: detectLanguage, detect: detect };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else if (typeof globalThis !== "undefined") globalThis.llmDetector = api;
})();
