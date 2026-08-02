/* score-core.js -- shared Score-IR utilities for the alber.me music tools.
 *
 * Consumes the Score-IR v1 emitted by omr-decode.js (see the IR design note in
 * the model repo's handoffs) and provides everything downstream of it:
 *   - flattenPart(part)          timeline per part (ties merged, positions in divisions)
 *   - buildMidi(ir, opts)        Standard MIDI File as Uint8Array (format 1)
 *   - buildMusicXml(ir)          MusicXML score-partwise 4.0 string
 *   - ruleCheck(ir)              deterministic validation findings for the UI
 *   - voiceLabels / noteToMidi / midiName / expectedMeasureDiv helpers
 *   - edit operations for the measure editor (and the future music suite):
 *     buildEvent / specFromEvent / editEvent / insertEvent / deleteEvent /
 *     setMeasureEvents / resetMeasure / tieIssues / suggestFromTokens
 *
 * Plain script, no DOM, no imports, no async: it must run in the page, in a
 * Web Worker (importScripts) and under Node (evaluated by the test suite).
 * Everything is attached to globalThis.ScoreCore.
 *
 * Durations are in divisions with 48 per quarter note (DIV_WHOLE = 192),
 * matching omr-decode.js. All exported functions are deterministic.
 */
(function () {
  "use strict";

  var DIV_WHOLE = 192;
  var DIV_QUARTER = 48;

  var STEP_SEMIS = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  var SHARP_ORDER = ["F", "C", "G", "D", "A", "E", "B"];
  var NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

  function noteToMidi(pitch) {
    return (pitch.octave + 1) * 12 + STEP_SEMIS[pitch.step] + (pitch.alter || 0);
  }

  function midiName(midi) {
    var oct = Math.floor(midi / 12) - 1;
    return NOTE_NAMES[((midi % 12) + 12) % 12] + String(oct);
  }

  function expectedMeasureDiv(time) {
    if (!time || !time.num || !time.den) return null;
    return Math.round(time.num * DIV_WHOLE / time.den);
  }

  /* Steps altered by the key signature: keyFifths > 0 sharps, < 0 flats. */
  function keyAlterMap(fifths) {
    var map = {};
    var i;
    if (fifths > 0) for (i = 0; i < fifths && i < 7; i++) map[SHARP_ORDER[i]] = 1;
    if (fifths < 0) for (i = 0; i < -fifths && i < 7; i++) map[SHARP_ORDER[6 - i]] = -1;
    return map;
  }

  function voiceLabels(ir) {
    var n = ir.parts.length;
    if (n === 4) return ["Soprano", "Alto", "Tenor", "Bass"];
    return ir.parts.map(function (p, i) { return p.label || ("Voice " + (i + 1)); });
  }

  /* Flatten one part to an absolute timeline. Ties (start/continue/stop) are
   * merged into single sounding notes when the continuation is pitch-identical
   * and seamless; a broken tie chain degrades to separate notes rather than
   * guessing. Returns:
   *   { notes:    [{ startDiv, durDiv, midi, measure, confidence, srcs }],
   *     measures: [{ index, startDiv, sumDiv, time, barline }],
   *     totalDiv }
   */
  function flattenPart(part) {
    var notes = [];
    var measures = [];
    var open = {};            /* midi -> note object with an unresolved tie */
    var pos = 0;
    var time = null;
    for (var mi = 0; mi < part.measures.length; mi++) {
      var m = part.measures[mi];
      if (m.attributes && m.attributes.time) time = m.attributes.time;
      var start = pos;
      for (var ei = 0; ei < m.events.length; ei++) {
        var e = m.events[ei];
        var d = e.duration.divisions;
        if (e.kind === "note") {
          var midi = noteToMidi(e.pitch);
          var prev = open[midi];
          var joins = prev && (e.tie === "stop" || e.tie === "continue") &&
                      (prev.startDiv + prev.durDiv === pos);
          if (joins) {
            prev.durDiv += d;
            prev.srcs.push(e.src);
            if (e.confidence < prev.confidence) prev.confidence = e.confidence;
            if (e.tie === "stop") delete open[midi];
          } else {
            var note = { startDiv: pos, durDiv: d, midi: midi, measure: m.index,
                         confidence: e.confidence, srcs: [e.src] };
            notes.push(note);
            if (e.tie === "start" || e.tie === "continue") open[midi] = note;
            else delete open[midi];
          }
        }
        pos += d;
      }
      measures.push({ index: m.index, startDiv: start, sumDiv: pos - start,
                      time: time, barline: m.barline ? m.barline.type : null });
    }
    return { notes: notes, measures: measures, totalDiv: pos };
  }

  /* ---------------- MIDI writer ---------------- */

  var PPQ = 480;                       /* ticks per quarter */
  var TICKS_PER_DIV = PPQ / DIV_QUARTER;   /* = 10, integral by construction */

  function vlq(n) {
    var out = [n & 0x7f];
    n >>= 7;
    while (n > 0) { out.unshift((n & 0x7f) | 0x80); n >>= 7; }
    return out;
  }

  function metaText(type, text) {
    var bytes = [];
    for (var i = 0; i < text.length; i++) bytes.push(text.charCodeAt(i) & 0x7f);
    return [0xff, type, bytes.length].concat(bytes);
  }

  function trackChunk(events) {
    /* events: [{ tick, data:[bytes] }] already in intended order per tick */
    var body = [];
    var last = 0;
    for (var i = 0; i < events.length; i++) {
      body = body.concat(vlq(events[i].tick - last), events[i].data);
      last = events[i].tick;
    }
    var chunk = [0x4d, 0x54, 0x72, 0x6b,
                 (body.length >>> 24) & 0xff, (body.length >>> 16) & 0xff,
                 (body.length >>> 8) & 0xff, body.length & 0xff];
    return chunk.concat(body);
  }

  /* opts: { bpm = 100,
   *         mode = "all" | "solo" | "highlight",
   *         voice = 0            (the selected part for solo/highlight),
   *         program = 0 }        (GM program for every track)
   * "highlight" keeps all voices but sets the selected one loud (CC7 112)
   * and the rest quiet (CC7 32); "all" gives every voice CC7 100.
   */
  function buildMidi(ir, opts) {
    opts = opts || {};
    var bpm = opts.bpm || 100;
    var mode = opts.mode || "all";
    var sel = opts.voice || 0;
    var program = typeof opts.program === "number" ? opts.program : 0;
    var labels = voiceLabels(ir);
    var flats = ir.parts.map(flattenPart);
    var totalTick = 0;
    flats.forEach(function (f) {
      var t = f.totalDiv * TICKS_PER_DIV;
      if (t > totalTick) totalTick = t;
    });

    /* Conductor track: tempo + time signatures (taken from part 0, whose
     * attribute state omr-decode already resolves per measure). */
    var cond = [];
    cond.push({ tick: 0, data: metaText(0x03, "sheet-to-midi") });
    var us = Math.round(60000000 / bpm);
    cond.push({ tick: 0, data: [0xff, 0x51, 0x03,
                                (us >>> 16) & 0xff, (us >>> 8) & 0xff, us & 0xff] });
    if (flats.length) {
      var seen = null;
      flats[0].measures.forEach(function (m) {
        var t = m.time;
        if (!t) return;
        var key = t.num + "/" + t.den;
        if (key === seen) return;
        seen = key;
        var dd = Math.round(Math.log(t.den) / Math.LN2);
        cond.push({ tick: m.startDiv * TICKS_PER_DIV,
                    data: [0xff, 0x58, 0x04, t.num, dd, 24, 8] });
      });
    }
    cond.push({ tick: totalTick, data: [0xff, 0x2f, 0x00] });

    var partIdx = [];
    for (var i = 0; i < ir.parts.length; i++) {
      if (mode === "solo" && i !== sel) continue;
      partIdx.push(i);
    }

    var tracks = [trackChunk(cond)];
    partIdx.forEach(function (pi) {
      var ch = pi >= 9 ? pi + 1 : pi;   /* skip the percussion channel */
      ch = ch & 0x0f;
      var vol = mode === "highlight" ? (pi === sel ? 112 : 32) : 100;
      var evs = [];
      evs.push({ tick: 0, data: metaText(0x03, labels[pi]) });
      evs.push({ tick: 0, data: [0xc0 | ch, program & 0x7f] });
      evs.push({ tick: 0, data: [0xb0 | ch, 7, vol] });
      var onoff = [];
      flats[pi].notes.forEach(function (n) {
        var t0 = n.startDiv * TICKS_PER_DIV;
        var t1 = (n.startDiv + n.durDiv) * TICKS_PER_DIV;
        onoff.push({ tick: t0, off: 0, data: [0x90 | ch, n.midi & 0x7f, 96] });
        onoff.push({ tick: t1, off: 1, data: [0x80 | ch, n.midi & 0x7f, 0] });
      });
      /* note-offs before note-ons at the same tick, otherwise a repeated
       * pitch retriggers into its own release */
      onoff.sort(function (a, b) { return a.tick - b.tick || b.off - a.off; });
      evs = evs.concat(onoff);
      evs.push({ tick: totalTick, data: [0xff, 0x2f, 0x00] });
      tracks.push(trackChunk(evs));
    });

    var n = tracks.length;
    var header = [0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6,
                  0, 1, (n >>> 8) & 0xff, n & 0xff,
                  (PPQ >>> 8) & 0xff, PPQ & 0xff];
    var size = header.length;
    tracks.forEach(function (t) { size += t.length; });
    var out = new Uint8Array(size);
    out.set(header, 0);
    var off = header.length;
    tracks.forEach(function (t) { out.set(t, off); off += t.length; });
    return out;
  }

  /* ---------------- MusicXML writer ---------------- */

  /* kern duration base -> [MusicXML type, isTriplet]. The triplet bases carry
   * their exact length in divisions already; time-modification 3:2 restores
   * the printed notehead. */
  var TYPE_MAP = {
    "0": ["breve", false], "1": ["whole", false], "2": ["half", false],
    "4": ["quarter", false], "8": ["eighth", false], "16": ["16th", false],
    "32": ["32nd", false],
    "3": ["half", true], "6": ["quarter", true], "12": ["eighth", true],
    "24": ["16th", true],
  };

  var ACC_XML = { "#": "sharp", "##": "double-sharp", "-": "flat",
                  "--": "flat-flat", "n": "natural" };

  function xmlEsc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function buildMusicXml(ir) {
    var labels = voiceLabels(ir);
    var L = [];
    L.push('<?xml version="1.0" encoding="UTF-8"?>');
    L.push('<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">');
    L.push('<score-partwise version="4.0">');
    L.push('<part-list>');
    ir.parts.forEach(function (p, i) {
      L.push('<score-part id="P' + (i + 1) + '"><part-name>' + xmlEsc(labels[i]) + '</part-name></score-part>');
    });
    L.push('</part-list>');
    ir.parts.forEach(function (p, i) {
      L.push('<part id="P' + (i + 1) + '">');
      p.measures.forEach(function (m, mi) {
        L.push('<measure number="' + (m.index + 1) + '">');
        var a = m.attributes;
        if (a || mi === 0) {
          L.push('<attributes>');
          if (mi === 0) L.push('<divisions>' + DIV_QUARTER + '</divisions>');
          if (a && typeof a.keyFifths === "number") {
            L.push('<key><fifths>' + a.keyFifths + '</fifths></key>');
          }
          if (a && a.time) {
            L.push('<time><beats>' + a.time.num + '</beats><beat-type>' + a.time.den + '</beat-type></time>');
          }
          if (a && a.clef) {
            L.push('<clef><sign>' + a.clef.sign + '</sign><line>' + a.clef.line + '</line>' +
                   (a.clef.octaveChange ? '<clef-octave-change>' + a.clef.octaveChange + '</clef-octave-change>' : '') +
                   '</clef>');
          }
          L.push('</attributes>');
        }
        m.events.forEach(function (e) {
          L.push('<note>');
          if (e.kind === "rest") {
            L.push('<rest/>');
          } else {
            L.push('<pitch><step>' + e.pitch.step + '</step>' +
                   (e.pitch.alter ? '<alter>' + e.pitch.alter + '</alter>' : '') +
                   '<octave>' + e.pitch.octave + '</octave></pitch>');
          }
          L.push('<duration>' + e.duration.divisions + '</duration>');
          if (e.kind === "note" && (e.tie === "start" || e.tie === "continue")) {
            L.push('<tie type="start"/>');
          }
          if (e.kind === "note" && (e.tie === "stop" || e.tie === "continue")) {
            L.push('<tie type="stop"/>');
          }
          var tm = TYPE_MAP[e.duration.base];
          if (tm) {
            L.push('<type>' + tm[0] + '</type>');
            for (var di = 0; di < e.duration.dots; di++) L.push('<dot/>');
            if (tm[1]) {
              L.push('<time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification>');
            }
          }
          if (e.kind === "note") {
            var printed = null;
            (e.tokens || []).forEach(function (t) {
              if (printed === null && ACC_XML[t]) printed = ACC_XML[t];
            });
            if (printed) L.push('<accidental>' + printed + '</accidental>');
            var nota = [];
            if (e.tie === "start" || e.tie === "continue") nota.push('<tied type="start"/>');
            if (e.tie === "stop" || e.tie === "continue") nota.push('<tied type="stop"/>');
            if (e.fermata) nota.push('<fermata/>');
            if (nota.length) L.push('<notations>' + nota.join("") + '</notations>');
          }
          L.push('</note>');
        });
        var bt = m.barline ? m.barline.type : null;
        if (bt && bt !== "regular" && bt !== "invisible") {
          var style = bt === "final" || bt === "final-repeat-end" ? "light-heavy"
                    : bt === "double" ? "light-light" : "light-heavy";
          var rep = "";
          if (bt.indexOf("repeat-end") >= 0 || bt === "repeat-both") {
            rep = '<repeat direction="backward"/>';
          }
          L.push('<barline location="right"><bar-style>' + style + '</bar-style>' + rep + '</barline>');
          if (bt === "repeat-start" || bt === "repeat-both") {
            /* a forward repeat at a measure end is unusual; omr-decode attaches
             * repeat-start to the closing barline, MusicXML wants it at the
             * start of the next measure; kept simple in v1 */
          }
        }
        L.push('</measure>');
      });
      L.push('</part>');
    });
    L.push('</score-partwise>');
    return L.join("\n");
  }

  /* ---------------- rule checks ---------------- */

  /* SATB ambitus, deliberately generous (MIDI note numbers). */
  var SATB_RANGE = [[55, 84], [50, 79], [43, 72], [36, 65]];
  var GENERIC_RANGE = [33, 88];

  /* Returns [{ code, severity: "warn" | "info", part, measure, message, src? }].
   * part/measure may be null for cross-part findings. Codes:
   *   measure-sum, voice-sync, measure-count, suspicious-natural,
   *   double-accidental, ambitus, barline-mismatch
   */
  function ruleCheck(ir) {
    var out = [];
    var labels = voiceLabels(ir);
    var flats = ir.parts.map(flattenPart);

    /* Cross-part comparisons run over the sequence of non-empty measures:
     * a line-initial barline yields an attribute-only empty measure in some
     * voices but not others, which shifts raw measure indices between parts
     * without anything being musically wrong. */
    var seqs = flats.map(function (f) {
      return f.measures.filter(function (m) { return m.sumDiv > 0; });
    });

    /* 1. measure sums vs. time signature. The pickup pattern (short first or
     * last measure, or a short measure at a repeat/final boundary whose halves
     * add up across the section) is downgraded to info. When EVERY voice
     * deviates identically at the same spot, that is a property of the piece,
     * not of one voice, and is reported once instead of per voice. */
    var msPerPart = seqs.map(function (seq) {
      return seq.map(function (m, k) {
        var exp = expectedMeasureDiv(m.time);
        if (exp === null || m.sumDiv === exp) return null;
        var prevBar = k > 0 ? seq[k - 1].barline : null;
        var ownBar = m.barline || "";
        var pickupish = m.sumDiv < exp &&
          (k === 0 || k === seq.length - 1 ||
           (prevBar && prevBar.indexOf("repeat") >= 0) ||
           ownBar.indexOf("repeat") >= 0 || ownBar.indexOf("final") >= 0);
        return { sum: m.sumDiv, exp: exp, index: m.index, pickupish: pickupish };
      });
    });
    if (flats.length > 1) {
      var minLen = Math.min.apply(null, seqs.map(function (s) { return s.length; }));
      for (var kk = 0; kk < minLen; kk++) {
        var slot = msPerPart.map(function (s) { return s[kk]; });
        var first = slot[0];
        var uniform = first !== null && slot.every(function (x) {
          return x && x.sum === first.sum && x.exp === first.exp && x.pickupish === first.pickupish;
        });
        if (!uniform) continue;
        out.push({
          code: "measure-sum",
          severity: first.pickupish ? "info" : "warn",
          part: null, measure: seqs[0][kk].index,
          message: "All voices, measure " + (seqs[0][kk].index + 1) + ": " +
            (first.pickupish
              ? "only " + first.sum + " of " + first.exp + " divisions, looks like a pickup or partial measure"
              : "durations sum to " + first.sum + " divisions, time signature expects " + first.exp +
                "; consistent across all voices, so possibly a real meter change the engraving does not spell out"),
        });
        msPerPart.forEach(function (s) { s[kk] = null; });
      }
    }
    msPerPart.forEach(function (s, pi) {
      s.forEach(function (x) {
        if (!x) return;
        out.push({
          code: "measure-sum",
          severity: x.pickupish ? "info" : "warn",
          part: pi, measure: x.index,
          message: labels[pi] + ", measure " + (x.index + 1) + ": " +
            (x.pickupish
              ? "only " + x.sum + " of " + x.exp + " divisions, looks like a pickup or partial measure"
              : "durations sum to " + x.sum + " divisions, time signature expects " + x.exp),
        });
      });
    });

    /* 2. voices in sync */
    if (flats.length > 1) {
      var counts = seqs.map(function (s) { return s.length; });
      var maxCount = Math.max.apply(null, counts);
      counts.forEach(function (c, pi) {
        if (c !== maxCount) {
          out.push({ code: "measure-count", severity: "warn", part: pi, measure: null,
                     message: labels[pi] + " has " + c + " sounding measures, other voices have " + maxCount });
        }
      });
      var minCount = Math.min.apply(null, counts);
      for (var k = 0; k < minCount; k++) {
        var sums = seqs.map(function (s) { return s[k].sumDiv; });
        var allEqual = sums.every(function (s) { return s === sums[0]; });
        if (!allEqual) {
          out.push({ code: "voice-sync", severity: "warn", part: null,
                     measure: seqs[0][k].index,
                     message: "Measure " + (seqs[0][k].index + 1) + ": voices disagree on its length (" +
                       sums.join(" / ") + " divisions), at least one voice is wrong here" });
        }
        var bars = seqs.map(function (s) { return s[k].barline; });
        var barsEqual = bars.every(function (b) { return b === bars[0]; });
        if (!barsEqual) {
          out.push({ code: "barline-mismatch", severity: "warn", part: null,
                     measure: seqs[0][k].index,
                     message: "Measure " + (seqs[0][k].index + 1) + ": barline types differ between voices (" +
                       bars.map(function (b) { return b || "none"; }).join(" / ") + ")" });
        }
      }
    }

    /* 3. accidental logic + ambitus, walking the raw events */
    ir.parts.forEach(function (p, pi) {
      var fifths = 0;
      var range = ir.parts.length === 4 ? SATB_RANGE[pi] : GENERIC_RANGE;
      p.measures.forEach(function (m) {
        if (m.attributes && typeof m.attributes.keyFifths === "number") {
          fifths = m.attributes.keyFifths;
        }
        var keyMap = keyAlterMap(fifths);
        var seen = {};             /* step+octave -> printed accidental earlier in measure */
        m.events.forEach(function (e) {
          if (e.kind !== "note") return;
          var printed = null;
          (e.tokens || []).forEach(function (t) {
            if (printed === null && (t in ACC_XML)) printed = t;
          });
          var slot = e.pitch.step + e.pitch.octave;
          if (printed === "n" && !(e.pitch.step in keyMap) && !seen[slot]) {
            out.push({ code: "suspicious-natural", severity: "info", part: pi, measure: m.index,
                       message: labels[pi] + ", measure " + (m.index + 1) + ": natural sign on " +
                         e.pitch.step + e.pitch.octave + " which the key does not alter; often a misread accidental",
                       src: e.src });
          }
          if ((printed === "##" || printed === "--") && Math.abs(fifths) <= 4) {
            out.push({ code: "double-accidental", severity: "info", part: pi, measure: m.index,
                       message: labels[pi] + ", measure " + (m.index + 1) + ": double accidental in a simple key, worth a look",
                       src: e.src });
          }
          if (printed) seen[slot] = printed;
          var midi = noteToMidi(e.pitch);
          if (midi < range[0] || midi > range[1]) {
            out.push({ code: "ambitus", severity: "info", part: pi, measure: m.index,
                       message: labels[pi] + ", measure " + (m.index + 1) + ": " + midiName(midi) +
                         " is outside the usual range of this voice", src: e.src });
          }
        });
      });
    });

    return out;
  }

  /* ---------------- edit operations ----------------
   *
   * Pure and immutable: every function returns a NEW ir (path-cloned, the
   * untouched parts are shared by reference), so the result can go straight
   * into React state. Events created here carry `edited: true` (an additive
   * Score-IR 1.x extension, reported to the model repo) and confidence 1;
   * their tokens are rebuilt so ruleCheck's accidental logic and
   * buildMusicXml's printed accidentals stay consistent with the new pitch.
   * measureIdx is the array position in part.measures, which equals the
   * measure's `index` field (findingMarkers already relies on that).
   */

  var EDIT_BASES = ["0", "1", "2", "3", "4", "6", "8", "12", "16", "24", "32"];
  var ALTER_TOKENS = { "1": "#", "2": "##", "-1": "-", "-2": "--" };
  var TIE_TOKENS = { start: "[", stop: "]", "continue": "_" };

  /* Same arithmetic as omr-decode's dur(): triplet bases (3/6/12/24) carry
   * their exact division count directly, dots add halving remainders. */
  function durationFrom(base, dots) {
    base = String(base);
    if (EDIT_BASES.indexOf(base) < 0) return null;
    dots = dots || 0;
    var d = base === "0" ? DIV_WHOLE * 2 : Math.floor(DIV_WHOLE / parseInt(base, 10));
    var total = d, add = d;
    for (var i = 0; i < dots; i++) { add = Math.floor(add / 2); total += add; }
    return { divisions: total, base: base, dots: dots };
  }

  /* kern pitch spelling: c = C4, cc = C5, C = C3, CC = C2, ... */
  function pitchToken(step, octave) {
    if (octave >= 4) return new Array(octave - 3 + 1).join(step.toLowerCase());
    return new Array(4 - octave + 1).join(step.toUpperCase());
  }

  /* spec: { kind: "note"|"rest", base, dots, step, alter, octave, tie, fermata }.
   * Returns a full IR event or null for an invalid duration base. src is null;
   * editEvent carries the replaced event's src over so the measure stays
   * locatable on the page. */
  function buildEvent(spec) {
    var dur = durationFrom(spec.base, spec.dots);
    if (!dur) return null;
    var durTok = dur.base;
    for (var i = 0; i < dur.dots; i++) durTok += ".";
    if (spec.kind === "rest") {
      return { kind: "rest", duration: dur, confidence: 1,
               tokens: [durTok, "r"], src: null, edited: true };
    }
    var alter = spec.alter || 0;
    var tokens = [durTok, pitchToken(spec.step, spec.octave)];
    if (ALTER_TOKENS[String(alter)]) tokens.push(ALTER_TOKENS[String(alter)]);
    var tie = spec.tie || null;
    if (tie && TIE_TOKENS[tie]) tokens.push(TIE_TOKENS[tie]);
    if (spec.fermata) tokens.push(";");
    return { kind: "note", duration: dur, confidence: 1,
             pitch: { step: spec.step, alter: alter, octave: spec.octave },
             tie: tie, fermata: !!spec.fermata,
             tokens: tokens, src: null, edited: true };
  }

  function specFromEvent(e) {
    return {
      kind: e.kind,
      base: e.duration.base,
      dots: e.duration.dots || 0,
      step: e.pitch ? e.pitch.step : null,
      alter: e.pitch ? (e.pitch.alter || 0) : 0,
      octave: e.pitch ? e.pitch.octave : null,
      tie: (e.kind === "note" && e.tie) || null,
      fermata: !!e.fermata,
    };
  }

  function withMeasureEvents(ir, partIdx, measureIdx, fn) {
    var next = Object.assign({}, ir);
    next.parts = ir.parts.slice();
    var part = Object.assign({}, next.parts[partIdx]);
    part.measures = part.measures.slice();
    var m = Object.assign({}, part.measures[measureIdx]);
    m.events = fn(m.events.slice());
    part.measures[measureIdx] = m;
    next.parts[partIdx] = part;
    return next;
  }

  function setMeasureEvents(ir, partIdx, measureIdx, events) {
    return withMeasureEvents(ir, partIdx, measureIdx, function () { return events; });
  }

  function editEvent(ir, partIdx, measureIdx, evIndex, spec) {
    return withMeasureEvents(ir, partIdx, measureIdx, function (evs) {
      var ev = buildEvent(spec);
      ev.src = (evs[evIndex] && evs[evIndex].src) || null;
      evs[evIndex] = ev;
      return evs;
    });
  }

  function insertEvent(ir, partIdx, measureIdx, evIndex, spec) {
    return withMeasureEvents(ir, partIdx, measureIdx, function (evs) {
      evs.splice(evIndex, 0, buildEvent(spec));
      return evs;
    });
  }

  function deleteEvent(ir, partIdx, measureIdx, evIndex) {
    return withMeasureEvents(ir, partIdx, measureIdx, function (evs) {
      evs.splice(evIndex, 1);
      return evs;
    });
  }

  /* Restore one measure's events from the unedited recognition result. */
  function resetMeasure(ir, partIdx, measureIdx, originalIr) {
    var orig = originalIr.parts[partIdx].measures[measureIdx].events;
    return setMeasureEvents(ir, partIdx, measureIdx,
                            JSON.parse(JSON.stringify(orig)));
  }

  /* Tie diagnostics, mirroring flattenPart's join semantics: a tie start (or
   * continue) that nothing seamless and pitch-identical resolves is dangling,
   * a stop/continue with no matching open chain is an orphan. Edits may break
   * chains legitimately (flattenPart just ends them); the editor marks these
   * spots instead of forbidding them.
   * Returns [{ measure, event, issue: "dangling-start" | "orphan-stop" }]. */
  function tieIssues(part) {
    var out = [];
    var open = {};            /* midi -> { measure, event, end } */
    var pos = 0;
    for (var mi = 0; mi < part.measures.length; mi++) {
      var m = part.measures[mi];
      for (var ei = 0; ei < m.events.length; ei++) {
        var e = m.events[ei];
        if (e.kind === "note") {
          var midi = noteToMidi(e.pitch);
          var prev = open[midi];
          var joins = prev && (e.tie === "stop" || e.tie === "continue") &&
                      prev.end === pos;
          if ((e.tie === "stop" || e.tie === "continue") && !joins) {
            out.push({ measure: m.index, event: ei, issue: "orphan-stop" });
          }
          if (joins) {
            prev.end = pos + e.duration.divisions;
            if (e.tie === "stop") delete open[midi];
          } else {
            if (prev) {
              out.push({ measure: prev.measure, event: prev.event,
                         issue: "dangling-start" });
              delete open[midi];
            }
            if (e.tie === "start" || e.tie === "continue") {
              open[midi] = { measure: m.index, event: ei,
                             end: pos + e.duration.divisions };
            }
          }
        }
        pos += e.duration.divisions;
      }
    }
    for (var k in open) {
      out.push({ measure: open[k].measure, event: open[k].event,
                 issue: "dangling-start" });
    }
    return out;
  }

  /* Editor prefill from an unparseable-tokens warning: pull whatever the raw
   * tokens do carry; fields the tokens leave open stay null and the UI fills
   * defaults. */
  function suggestFromTokens(tokens) {
    var ACC = { "#": 1, "##": 2, "-": -1, "--": -2, "n": 0 };
    var spec = { kind: "note", base: null, dots: 0, step: null, alter: 0,
                 octave: null, tie: null, fermata: false };
    (tokens || []).forEach(function (t) {
      t = String(t);
      var stripped = t.replace(/\.+$/, "");
      if (spec.base === null && EDIT_BASES.indexOf(stripped) >= 0) {
        spec.base = stripped;
        spec.dots = t.length - stripped.length;
      } else if (t === "r") {
        spec.kind = "rest";
      } else if (spec.step === null && /^([a-g])\1*$/.test(t)) {
        spec.step = t[0].toUpperCase();
        spec.octave = 3 + t.length;
      } else if (spec.step === null && /^([A-G])\1*$/.test(t)) {
        spec.step = t[0];
        spec.octave = 4 - t.length;
      } else if (t in ACC) {
        spec.alter = ACC[t];
      } else if (t === "[") {
        spec.tie = "start";
      } else if (t === "]") {
        spec.tie = "stop";
      } else if (t === "_") {
        spec.tie = "continue";
      } else if (t === ";") {
        spec.fermata = true;
      }
    });
    return spec;
  }

  globalThis.ScoreCore = {
    DIV_WHOLE: DIV_WHOLE,
    DIV_QUARTER: DIV_QUARTER,
    PPQ: PPQ,
    noteToMidi: noteToMidi,
    midiName: midiName,
    expectedMeasureDiv: expectedMeasureDiv,
    keyAlterMap: keyAlterMap,
    voiceLabels: voiceLabels,
    flattenPart: flattenPart,
    buildMidi: buildMidi,
    buildMusicXml: buildMusicXml,
    ruleCheck: ruleCheck,
    durationFrom: durationFrom,
    buildEvent: buildEvent,
    specFromEvent: specFromEvent,
    setMeasureEvents: setMeasureEvents,
    editEvent: editEvent,
    insertEvent: insertEvent,
    deleteEvent: deleteEvent,
    resetMeasure: resetMeasure,
    tieIssues: tieIssues,
    suggestFromTokens: suggestFromTokens,
  };
})();
