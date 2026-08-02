/* score-core.js -- shared Score-IR utilities for the alber.me music tools.
 *
 * Consumes the Score-IR v1 emitted by omr-decode.js (see the IR design note in
 * the model repo's handoffs) and provides everything downstream of it:
 *   - flattenPart(part)          timeline per part (ties merged, positions in divisions)
 *   - buildMidi(ir, opts)        Standard MIDI File as Uint8Array (format 1)
 *   - buildMusicXml(ir)          MusicXML score-partwise 4.0 string
 *   - ruleCheck(ir)              deterministic validation findings for the UI
 *   - voiceLabels / noteToMidi / midiName / expectedMeasureDiv helpers
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

    /* 1. measure sums vs. time signature. Two structural artifacts are normal
     * and skipped or downgraded: measures with zero events (a line-initial
     * barline right after the repeated clef/key produces them), and the pickup
     * pattern, i.e. a short first measure, a short last measure, or a short
     * measure at a section boundary (right before or after a repeat or final
     * barline), whose two halves add up across the section. */
    flats.forEach(function (f, pi) {
      f.measures.forEach(function (m, k) {
        var exp = expectedMeasureDiv(m.time);
        if (exp === null || m.sumDiv === exp) return;
        if (m.sumDiv === 0) return;                 /* attribute-only measure */
        var prevBar = k > 0 ? f.measures[k - 1].barline : null;
        var ownBar = m.barline || "";
        var pickupish = m.sumDiv < exp &&
          (k === 0 || k === f.measures.length - 1 ||
           (prevBar && prevBar.indexOf("repeat") >= 0) ||
           ownBar.indexOf("repeat") >= 0 || ownBar.indexOf("final") >= 0);
        out.push({
          code: "measure-sum",
          severity: pickupish ? "info" : "warn",
          part: pi, measure: m.index,
          message: labels[pi] + ", measure " + (m.index + 1) + ": " +
            (pickupish
              ? "only " + m.sumDiv + " of " + exp + " divisions, looks like a pickup or partial measure"
              : "durations sum to " + m.sumDiv + " divisions, time signature expects " + exp),
        });
      });
    });

    /* 2. voices in sync. Compared over the sequence of non-empty measures:
     * a line-initial barline yields an attribute-only empty measure in some
     * voices but not others, which shifts raw measure indices between parts
     * without anything being musically wrong. */
    if (flats.length > 1) {
      var seqs = flats.map(function (f) {
        return f.measures.filter(function (m) { return m.sumDiv > 0; });
      });
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
  };
})();
