/* LLM-Detector — Vanilla-JS-Referenzimplementierung (Feature-Spec v0.5).
 *
 * Spiegel von src/detector/{textproc,features,infer}.py — jede Änderung hier
 * oder dort braucht grüne Parity-Tests (tests/test_parity.py).
 * Keine Dependencies; läuft in Browser und Node. Das Modell (model.json)
 * wird von außen geladen und an detect() übergeben.
 */
(function () {
  "use strict";

  // Python-Seite nutzt [^\W\d_]: das ist L* plus Nl/No (m², ½, Ⅲ), nicht nur \p{L}.
  var WORD_RE = /[\p{L}\p{Nl}\p{No}]+(?:['’-][\p{L}\p{Nl}\p{No}]+)*/gu;
  var SENT_CAND_RE = /[^.!?…]+[.!?…]*/g;
  var PUNCT_SET = ".,;:!?…—–-()\"'«»„“”‚‘’";

  var MATTR_WINDOW = 100;
  var LONG_WORD_MIN = 7;
  // Spec v0.4: siehe src/detector/features.py
  var BURST_MIN_OCC = 3;
  var BLOCK_A_PREFIX = "fw_";

  // NFC + einheitliche Zeilenenden: genau das rechnet das UI nach, bevor es
  // spans auf den Textarea-Inhalt legt. Die Offsets beziehen sich auf DIESEN Text.
  function normalizeBase(text) {
    return text.normalize("NFC").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  }

  // Was die Features sehen (ab Spec v0.5): normalizeBase + Entumbrechen.
  function normalize(text) {
    return unwrapWithRemovals(normalizeBase(text)).text;
  }

  // --- Entumbrechen (Spec v0.5, WP-O Teil A) ---
  // Regel und Grenzfälle: Kommentar in src/detector/textproc.py (Spiegel).
  var UNWRAP_MIN_LINE = 40;
  var UNWRAP_TERMINAL = ".!?…:;";
  var UNWRAP_CLOSERS = "\"'”’»«“‘)]";
  var UNWRAP_HYPHENS = "-‐";
  var WORDCHAR_END_RE = /[\p{L}\p{Nl}\p{No}]$/u;
  var LOWER_START_RE = /^\p{Ll}/u;
  var LIST_MARKER_RE = /^(?:[-*+•·–—>#|]|[0-9]{1,2}[.)](?=[ \t])|[a-z]\)(?=[ \t]))/;
  var HANG_RE = /^(?:und|oder|bzw|sowie|beziehungsweise|and|or)(?![\p{L}\p{Nl}\p{No}])/u;

  function rstripChars(s, chars) {
    var e = s.length;
    while (e > 0 && chars.indexOf(s[e - 1]) !== -1) e -= 1;
    return s.slice(0, e);
  }

  function lstripChars(s, chars) {
    var b = 0;
    while (b < s.length && chars.indexOf(s[b]) !== -1) b += 1;
    return s.slice(b);
  }

  function codepointLen(s) {
    var n = 0;
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i);
      if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length) {
        var d = s.charCodeAt(i + 1);
        if (d >= 0xdc00 && d <= 0xdfff) i += 1;
      }
      n += 1;
    }
    return n;
  }

  function unwrapBoundary(a, b) {
    var ar = rstripChars(a, " \t");
    var bl = lstripChars(b, " \t");
    if (ar.length === 0 || bl.length === 0) return "keep";
    var a0 = lstripChars(a, " \t").charAt(0);
    if (a0 === "#" || a0 === "|" || a0 === ">") return "keep";
    if (LIST_MARKER_RE.test(bl)) return "keep";
    var hyph = ar.length === a.length && a.length >= 2 &&
      UNWRAP_HYPHENS.indexOf(a[a.length - 1]) !== -1 &&
      WORDCHAR_END_RE.test(a.slice(0, -1));
    var lower = LOWER_START_RE.test(bl);
    if (hyph && lower) return HANG_RE.test(bl) ? "space" : "dehyph";
    var t = rstripChars(ar, UNWRAP_CLOSERS);
    if (t.length === 0 || UNWRAP_TERMINAL.indexOf(t[t.length - 1]) !== -1) return "keep";
    if (codepointLen(ar) >= UNWRAP_MIN_LINE || lower) return hyph ? "cut" : "space";
    return "keep";
  }

  function codeFlags(lines) {
    var flags = [];
    var inside = false;
    for (var i = 0; i < lines.length; i++) {
      if (lstripChars(lines[i], " \t").slice(0, 3) === "```") {
        flags.push(true);
        inside = !inside;
      } else {
        flags.push(inside);
      }
    }
    return flags;
  }

  // Rückgabe { text, removals }: an UTF-16-Position pos des Ergebnisses wurden
  // n Code-Units entfernt (removals = [[pos, n], ...], aufsteigend).
  function unwrapWithRemovals(text) {
    var lines = text.split("\n");
    var code = codeFlags(lines);
    var out = [lines[0]];
    var u16 = lines[0].length;
    var removals = [];
    for (var k = 1; k < lines.length; k++) {
      var a = lines[k - 1], b = lines[k];
      var art = (code[k - 1] || code[k]) ? "keep" : unwrapBoundary(a, b);
      if (art === "keep" || art === "space") {
        out.push(art === "keep" ? "\n" : " ");
        out.push(b);
        u16 += 1 + b.length;
        continue;
      }
      var rest = lstripChars(b, " \t");
      var n = 1 + b.length - rest.length;
      if (art === "dehyph") {
        out[out.length - 1] = out[out.length - 1].slice(0, -1);
        u16 -= 1;
        n += 1;
      }
      removals.push([u16, n]);
      out.push(rest);
      u16 += rest.length;
    }
    return { text: out.join(""), removals: removals };
  }

  // UTF-16-Offset im entumbrochenen Text -> Offset im Eingabetext.
  function mapOffset(o, removals) {
    var shift = 0;
    for (var i = 0; i < removals.length; i++) {
      if (removals[i][0] >= o) break;
      shift += removals[i][1];
    }
    return o + shift;
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

  // Mittlere Codelaenge (-log10 P pro Zeichen) ueber das ganze Dokument,
  // LAENGENGEWICHTET. Spiegel von mean_codelen() in src/detector/ngram_lm.py.
  // Traegt seit Exp. 023 die Spracherkennung.
  function meanCodelen(sents, lm) {
    var pad = PAD_CHAR.repeat(lm.order - 1);
    var total = 0.0;
    var n = 0;
    for (var si = 0; si < sents.length; si++) {
      if (sents[si].length === 0) continue;
      var cps = Array.from(pad + sents[si].join(" "));
      for (var i = lm.order - 1; i < cps.length; i++) {
        total -= scoreCharLogprob10(lm, cps, i);
      }
      n += cps.length - (lm.order - 1);
    }
    return n ? total / n : 0.0;
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

  function cv(xs) {
    var m = mean(xs);
    return xs.length >= 2 && m > 0 ? std(xs) / m : 0;
  }

  // Block D (Spec v0.4) — Wiederholung/Burstiness. Spiegel von _block_d() in
  // src/detector/features.py. Summationsreihenfolgen laufen ueber sortierte
  // Schluessel, damit beide Seiten bitgleich rechnen (Konvention wie bei
  // punct_entropy). Map statt Objekt, weil Wort-Tokens als Objekt-Schluessel
  // sonst mit Prototyp-Namen kollidieren koennten.
  function blockD(ws, sents, functionWords) {
    var n = ws.length;
    var i, j, k, keys;

    var rep = 0;
    if (n >= 4) {
      var grams = new Map();
      for (i = 0; i < n - 3; i++) {
        // Trennzeichen " ": Python benutzt hier einen Tupel-Key, JS kennt keine
        // Tupel. Kollisionsfrei, weil WORD_RE (/\p{L}+(?:['’-]\p{L}+)*/u) kein
        // Leerzeichen ins Token laesst — die Zerlegung ist damit eindeutig.
        // Frueher stand hier ein rohes NUL-Byte; das machte die Datei fuer git
        // und ripgrep binaer (kein lesbarer Diff der Vertragsdatei).
        var g = ws[i] + " " + ws[i + 1] + " " + ws[i + 2] + " " + ws[i + 3];
        grams.set(g, (grams.get(g) || 0) + 1);
      }
      var repeated = 0;
      grams.forEach(function (c) { if (c >= 2) repeated += c; });
      rep = repeated / (n - 3);
    }

    var starts = [];
    for (i = 0; i < sents.length; i++) if (sents[i].length > 0) starts.push(sents[i][0]);
    var ent = 0;
    if (starts.length >= 2) {
      var sc = new Map();
      for (i = 0; i < starts.length; i++) sc.set(starts[i], (sc.get(starts[i]) || 0) + 1);
      keys = Array.from(sc.keys()).sort();
      var h = 0;
      for (k = 0; k < keys.length; k++) {
        var p = sc.get(keys[k]) / starts.length;
        h -= p * Math.log2(p);
      }
      var norm = Math.log2(starts.length);
      ent = norm > 0 ? h / norm : 0;
    }

    var positions = new Map();
    for (i = 0; i < n; i++) {
      if (!functionWords.has(ws[i])) {
        if (!positions.has(ws[i])) positions.set(ws[i], []);
        positions.get(ws[i]).push(i);
      }
    }
    keys = Array.from(positions.keys()).sort();
    var cvs = [];
    for (k = 0; k < keys.length; k++) {
      var pl = positions.get(keys[k]);
      if (pl.length >= BURST_MIN_OCC) {
        var gaps = [];
        for (j = 0; j < pl.length - 1; j++) gaps.push(pl[j + 1] - pl[j]);
        cvs.push(cv(gaps));
      }
    }
    var burst = mean(cvs);

    var hapax = 0;
    if (n) {
      var counts = new Map();
      for (i = 0; i < n; i++) counts.set(ws[i], (counts.get(ws[i]) || 0) + 1);
      keys = Array.from(counts.keys()).sort();
      var ones = 0;
      for (k = 0; k < keys.length; k++) if (counts.get(keys[k]) === 1) ones += 1;
      hapax = ones / counts.size;
    }

    return {
      rep_4gram_ratio: rep,
      sent_start_entropy: ent,
      content_burstiness: burst,
      hapax_ratio: hapax,
    };
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
    var fwList = lists.function_words;
    var functionWords = new Set(fwList);

    var longWords = 0;
    var fnWords = 0;
    var fwCounts = new Map();
    for (var u = 0; u < n; u++) {
      if (Array.from(ws[u]).length >= LONG_WORD_MIN) longWords += 1;
      if (functionWords.has(ws[u])) {
        fnWords += 1;
        fwCounts.set(ws[u], (fwCounts.get(ws[u]) || 0) + 1);
      }
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

    var out = {
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
    var d = blockD(ws, sents, functionWords);
    for (var dk in d) if (Object.prototype.hasOwnProperty.call(d, dk)) out[dk] = d[dk];
    for (var f = 0; f < fwList.length; f++) {
      out[BLOCK_A_PREFIX + fwList[f]] = n ? (fwCounts.get(fwList[f]) || 0) / n : 0;
    }
    return out;
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

  // t = normalizeBase(text). Ab Spec v0.5 werden Wörter und Sätze im
  // entumbrochenen Text gefunden und ihre Offsets auf t zurückgerechnet.
  function buildSpans(t, bundle) {
    var lists = bundle.wordlists;
    var uw = unwrapWithRemovals(t);
    var tokOff = wordsWithOffsets(uw.text);
    var sentSp = sentenceSpansOf(uw.text);
    if (uw.removals.length > 0) {
      var rem = uw.removals;
      for (var q = 0; q < tokOff.length; q++) {
        tokOff[q].start = mapOffset(tokOff[q].start, rem);
        tokOff[q].end = mapOffset(tokOff[q].end, rem);
      }
      for (var r = 0; r < sentSp.length; r++) {
        sentSp[r].start = mapOffset(sentSp[r].start, rem);
        sentSp[r].end = mapOffset(sentSp[r].end, rem);
      }
    }
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

  // Spracherkennung via Codelaenge unter den Sprach-LMs, Spiegel von
  // src/detector/langdetect.py.
  //
  // Bis Schema 0.5 entschied der Funktionswort-Anteil (min_ratio 0.15). Der
  // misst Orthografie-Ueberlapp, nicht Sprachverwandtschaft: Exp. 020/023 haben
  // gemessen, dass 21,2 % aller Afrikaans-Texte im DE-Kopf landeten und dort
  // eine erfundene Wahrscheinlichkeit bekamen. Keine Schwelle repariert das —
  // echte kurze EN/DE-Texte liegen im selben Bereich. Die Codelaenge trennt
  // dort sauber und senkt BEIDE Fehlerraten (Exp. 023).
  //
  // `ratios` bleibt der Funktionswort-Anteil: er geht als language_ratios in
  // die Abstain-Ausgabe (Frontend zeigt "Englisch X %, Deutsch Y %"), ist aber
  // an keiner Entscheidung mehr beteiligt.
  //
  // `codelens` sind die Codelaengen selbst — die Groesse, gegen die
  // cfg.max_codelen verglichen wird. Sie wurden bisher berechnet und
  // weggeworfen. Zwei Randfaelle, exakt wie in src/detector/langdetect.py:
  // leerer Text -> leeres Objekt; Sprache ohne ngram_lm -> Key wird nie gesetzt
  // (kein null — das waere in Python None und in JS undefined, also keine
  // Parity). Schluesselreihenfolge = cfg.order.
  function detectLanguage(ws, sents, model) {
    var cfg = model.language_detection;
    var ratios = {};
    var codelens = {};
    if (ws.length === 0) return { language: "other", ratios: ratios, codelens: codelens };
    var n = ws.length;
    var li, lang;
    for (li = 0; li < cfg.order.length; li++) {
      lang = cfg.order[li];
      var fw = new Set(model.languages[lang].wordlists.function_words);
      var hits = 0;
      for (var i = 0; i < n; i++) {
        if (fw.has(ws[i])) hits += 1;
      }
      ratios[lang] = hits / n;
    }

    var bestLang = "other";
    var bestCode = null;
    for (li = 0; li < cfg.order.length; li++) {
      lang = cfg.order[li];
      var lm = model.languages[lang].ngram_lm;
      if (!lm) continue;
      var c = meanCodelen(sents, lm);
      codelens[lang] = c;
      // strikt <: bei Gleichstand gewinnt die fruehere Sprache in `order`
      if (bestCode === null || c < bestCode) {
        bestLang = lang;
        bestCode = c;
      }
    }
    if (bestCode === null || bestCode > cfg.max_codelen) {
      return { language: "other", ratios: ratios, codelens: codelens };
    }
    return { language: bestLang, ratios: ratios, codelens: codelens };
  }

  // Die Schwelle mit ausgeben, damit das UI die Codelaengen einordnen kann,
  // ohne im Artefakt zu suchen. Nur wenn sie existiert (vor Schema 0.6 gab es
  // sie nicht) — Spiegel von _add_max_codelen() in src/detector/infer.py.
  function addMaxCodelen(result, cfg) {
    if (cfg.max_codelen !== undefined) result.max_codelen = cfg.max_codelen;
    return result;
  }

  // Kalibrierte Wahrscheinlichkeit. Spiegel von _calibrate() in
  // src/detector/infer.py.
  //
  // Typ "isotonic_by_length" (ab Exp. 018): eine Isotonic je Laengen-Bin, zur
  // Laufzeit zwischen den beiden benachbarten Ankern gemischt, linear in
  // log(Wortzahl). Ausserhalb der Ankerspanne die naechstgelegene Kurve, kein
  // Extrapolieren. Konvexkombination monotoner Funktionen -> selbst monoton.
  //
  // Math.log ist in ECMAScript nur "implementation-approximated", kann sich
  // also im letzten ULP von Pythons math.log unterscheiden. Der Effekt auf p
  // liegt bei ~1e-16 relativ und damit weit unter der Parity-Toleranz von
  // 1e-9; tests/test_parity.py prueft das ueber eine Wortzahl-Leiter mit.
  function calibrate(pRaw, cal, wordCount) {
    if (cal.type === "identity") return pRaw;
    if (cal.type === "isotonic_by_length") {
      var la = cal.log_anchors;
      var curves = cal.curves;
      var lw = Math.log(wordCount > 0 ? wordCount : 1);
      if (lw <= la[0]) return isotonic(pRaw, curves[0]);
      if (lw >= la[la.length - 1]) return isotonic(pRaw, curves[curves.length - 1]);
      var j = 1;
      while (j < la.length - 1 && la[j] < lw) j++;
      var t = (lw - la[j - 1]) / (la[j] - la[j - 1]);
      return (1.0 - t) * isotonic(pRaw, curves[j - 1]) + t * isotonic(pRaw, curves[j]);
    }
    if (cal.type !== "isotonic") throw new Error("unknown calibration type: " + cal.type);
    return isotonic(pRaw, cal);
  }

  function isotonic(pRaw, cal) {
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

    // Seit Schema 0.6 entscheidet die Codelaenge (Exp. 023) — die Erkennung
    // braucht dafuer die Satzstruktur, nicht nur die Tokens. Die Codelaengen
    // gehen als language_codelens (+ max_codelen) in BEIDE Ausgabezweige.
    var ld = detectLanguage(ws, sentences(normalize(text)), model);
    var langCfg = model.language_detection;
    if (ld.language === "other") {
      return addMaxCodelen({
        abstain: true,
        language: "other",
        language_ratios: ld.ratios,
        language_codelens: ld.codelens,
        features: [],
        notes: ["unsupported_language"],
        word_count: wordCount,
      }, langCfg);
    }

    var bundle = model.languages[ld.language];
    var feats = extractFeatures(text, bundle);

    var z;
    var contributions = [];
    if ((bundle.model_type || "logistic_regression") === "gbtree") {
      // Ab Spec v0.4 sieht der Klassifikator mehr Spalten als das UI Eintraege
      // zeigt: model_columns ist der Eingabevektor (12 Basis + Block D + 61/72
      // Funktionswort-Spalten), features die Anzeigeliste. Ein Anzeige-Eintrag
      // darf per `aggregate` die Beitraege eines ganzen Spalten-Praefixes
      // einsammeln — sonst haette das UI 78 Balken, von denen 61 "Haeufigkeit
      // von 'the'" hiessen. Die Summe der angezeigten Beitraege bleibt dabei
      // exakt die Margin. Spiegel von src/detector/infer.py.
      var cols = bundle.model_columns;
      if (!cols) {
        cols = [];
        for (var ci = 0; ci < bundle.features.length; ci++) cols.push(bundle.features[ci].name);
      }
      var xs = [];
      for (var xi = 0; xi < cols.length; xi++) xs.push(feats[cols[xi]]);
      var pred = predictGbtree(bundle.gbtree, xs);
      z = pred.margin;
      // Object.create(null): Spaltennamen kommen aus Wortlisten, ein "fw_..."
      // darf nicht auf Prototyp-Eigenschaften treffen.
      var byCol = Object.create(null);
      for (var bi = 0; bi < cols.length; bi++) byCol[cols[bi]] = pred.contributions[bi];
      for (var gi = 0; gi < bundle.features.length; gi++) {
        var gspec = bundle.features[gi];
        var gc = byCol[gspec.name] !== undefined ? byCol[gspec.name] : 0;
        if (gspec.aggregate) {
          for (var ai = 0; ai < cols.length; ai++) {
            if (cols[ai].indexOf(gspec.aggregate) === 0) gc += pred.contributions[ai];
          }
        }
        contributions.push({ name: gspec.name, value: feats[gspec.name], contribution: gc, humanLabel: gspec.humanLabel });
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
    var p = calibrate(pRaw, bundle.calibration, wordCount);

    // Bayesfaktor, siehe src/detector/infer.py und docs/FEATURES.md.
    var bayesFactor = null;
    if (bundle.calibration_base_rate !== undefined) {
      var pi = bundle.calibration_base_rate;
      var pc = Math.min(Math.max(p, 1e-4), 1.0 - 1e-4);
      bayesFactor = (pc / (1.0 - pc)) / (pi / (1.0 - pi));
    }

    // Konfidenz: Abstand zu 0.5 UND Textlaenge. Die Laengen-Schwellen sind seit
    // Exp. 018 gemessen statt geraten — high_min_words ist der Punkt, ab dem die
    // AUROC saettigt (~110 Woerter), medium_min_words die alte Abstain-Grenze,
    // unterhalb derer das Tool zwar ehrlich, aber schwach ist.
    var confCfg = model.confidence;
    var margin = Math.abs(p - 0.5);
    var medMin = confCfg.medium_min_words !== undefined ? confCfg.medium_min_words : 0;
    var confidence;
    if (margin >= confCfg.high_margin && wordCount >= confCfg.high_min_words) confidence = "high";
    else if (margin >= confCfg.medium_margin && wordCount >= medMin) confidence = "medium";
    else confidence = "low";
    var notes = [];
    if (wordCount < medMin) notes.push("weak_signal");

    var result = {
      abstain: false,
      language: ld.language,
      language_codelens: ld.codelens,
      probability: p,
      probability_raw: pRaw,
      confidence: confidence,
      features: contributions,
      spans: buildSpans(normalizeBase(text), bundle),
      notes: notes,
      word_count: wordCount,
    };
    addMaxCodelen(result, langCfg);
    if (bayesFactor !== null) {
      result.bayes_factor = bayesFactor;
      result.log10_bayes_factor = Math.log10(bayesFactor);
    }
    return result;
  }

  // calibrate ist mit exportiert, damit die laengenabhaengige Kurvenschar
  // (Exp. 018) direkt Parity-geprueft werden kann — ohne den Umweg ueber einen
  // vollstaendigen detect()-Lauf. Siehe tests/test_calibration_parity.py.
  var api = { normalize: normalize, normalizeBase: normalizeBase, words: words, sentences: sentences, extractFeatures: extractFeatures, detectLanguage: detectLanguage, detect: detect, calibrate: calibrate };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else if (typeof globalThis !== "undefined") globalThis.llmDetector = api;
})();
