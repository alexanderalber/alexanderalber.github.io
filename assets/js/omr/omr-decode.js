/* omr-decode.js -- CTC logits -> Score-IR (contract 3 + 5).
 *
 * Line-for-line port of src/omr/ir.py in the model repo; the Python file is
 * the reference, this file must stay token-identical to it in behaviour
 * (verified by scripts/44_decode_parity.mjs against dist/fixtures/).
 *
 * Plain ES module: no imports, no DOM, no globals, runs under Node and in a
 * Web Worker. All inputs are typed arrays / plain objects.
 *
 * API (two layers, contract 5):
 *   decodeLine(logits, T, C, i2w)         -> token events with spans + confs
 *   lineFragment(events, staff)           -> IR elements for one line
 *   assembleIR(lines, pages, generator)   -> the IR object for one score
 *   i2wFromVocab(vocabTokens)             -> index map (class 0 = CTC blank)
 */

export const IR_VERSION = "1.0";
export const WIDTH_REDUCTION = 4;
export const DIV_WHOLE = 192;

const BLANK = 0;
const SEP = "<b>";

const DURATIONS = new Set(["0", "1", "2", "3", "4", "6", "8", "12", "16", "24", "32"]);
const ACCIDENTALS = { "#": 1, "##": 2, "-": -1, "--": -2, "n": 0 };

const BARLINE_TYPES = {
  "=": "regular", "==": "final", "=||": "double", "=-": "invisible",
  "=:|!": "repeat-end", "=!|:": "repeat-start", "=:|!|:": "repeat-both",
  "==:|!": "final-repeat-end",
};

/* Python round(): decimal round-half-even. Math.round / toFixed both round
 * ties differently; parity against the Python-emitted golden IR needs this. */
function roundPy(x, digits) {
  const p = Math.pow(10, digits);
  const y = x * p;
  const f = Math.floor(y);
  const diff = y - f;
  let r;
  if (diff > 0.5) r = f + 1;
  else if (diff < 0.5) r = f;
  else r = f % 2 === 0 ? f : f + 1;
  return r / p;
}

export function i2wFromVocab(vocabTokens) {
  const i2w = {};
  for (let i = 0; i < vocabTokens.length; i++) i2w[i + 1] = vocabTokens[i];
  return i2w;
}

export function decodeLine(logits, T, C, i2w) {
  const events = [];
  let prev = -1;
  for (let f = 0; f < T; f++) {
    const row = f * C;
    let k = 0, best = logits[row];
    for (let c = 1; c < C; c++) {
      if (logits[row + c] > best) { best = logits[row + c]; k = c; }
    }
    if (k !== BLANK) {
      let sum = 0;
      for (let c = 0; c < C; c++) sum += Math.exp(logits[row + c] - best);
      const p = 1 / sum;                       // softmax of the argmax class
      if (k !== prev) {
        events.push({ token: i2w[k], f0: f, f1: f, _psum: p, _n: 1 });
      } else {
        const ev = events[events.length - 1];
        ev.f1 = f; ev._psum += p; ev._n += 1;
      }
    }
    prev = k;
  }
  for (const ev of events) {
    ev.confidence = roundPy(ev._psum / ev._n, 4);
    delete ev._psum; delete ev._n;
  }
  return events;
}

function records(tokenEvents) {
  const recs = []; let cur = [];
  for (const ev of tokenEvents) {
    if (ev.token === SEP) { if (cur.length) recs.push(cur); cur = []; }
    else cur.push(ev);
  }
  if (cur.length) recs.push(cur);
  return recs;
}

function dur(token) {
  const base = token.replace(/\.+$/, "");
  if (!DURATIONS.has(base)) return null;
  const dots = token.length - base.length;
  const d = base === "0" ? DIV_WHOLE * 2 : Math.floor(DIV_WHOLE / parseInt(base, 10));
  let total = d, add = d;
  for (let i = 0; i < dots; i++) { add = Math.floor(add / 2); total += add; }
  return { divisions: total, base, dots };
}

function pitch(token) {
  if (!token || !/^[a-gA-G]+$/.test(token)) return null;
  const ch = token[0];
  if (token !== ch.repeat(token.length)) return null;
  if (ch === ch.toLowerCase()) return { step: ch.toUpperCase(), octave: 3 + token.length };
  return { step: ch, octave: 4 - token.length };
}

function classify(record) {
  const toks = record.map((ev) => ev.token);
  let conf = Infinity;
  for (const ev of record) if (ev.confidence < conf) conf = ev.confidence;
  const first = toks[0];

  if (first.startsWith("=")) {
    return { kind: "barline",
             type: BARLINE_TYPES[first] ?? "other", confidence: conf };
  }

  if (first.startsWith("*")) {
    const el = { kind: "attribute", confidence: conf };
    if (first.startsWith("*clef")) {
      let body = first.slice(5);
      const octave = body.includes("v") ? -1 : body.includes("^") ? 1 : 0;
      body = body.replace("v", "").replace("^", "");
      el.clef = { sign: body[0], line: parseInt(body.slice(1) || "0", 10),
                  octaveChange: octave };
    } else if (first.startsWith("*k[")) {
      const inner = first.slice(3, -1);
      const sharps = (inner.match(/#/g) || []).length;
      el.keyFifths = sharps || -(inner.match(/-/g) || []).length;
    } else if (first.startsWith("*M")) {
      const [num, den] = first.slice(2).split("/");
      el.time = { num: parseInt(num, 10), den: parseInt(den, 10) };
    } else {
      return null;
    }
    return el;
  }

  let d = null;
  for (const t of toks) { d = dur(t); if (d) break; }
  if (!d) return { kind: "unparseable", tokens: toks, confidence: conf };
  const el = { kind: toks.includes("r") ? "rest" : "note",
               duration: d, confidence: conf };
  if (el.kind === "note") {
    let p = null;
    for (const t of toks) { p = pitch(t); if (p) break; }
    if (!p) return { kind: "unparseable", tokens: toks, confidence: conf };
    let alter = 0;
    for (const t of toks) {
      if (t in ACCIDENTALS) { alter = ACCIDENTALS[t]; break; }
    }
    el.pitch = { step: p.step, alter, octave: p.octave };
    el.tie = toks.includes("[") ? "start"
      : toks.includes("]") ? "stop"
      : toks.includes("_") ? "continue" : null;
    if (toks.includes("(")) el.slur = "start";
    else if (toks.includes(")")) el.slur = "stop";
    el.fermata = toks.includes(";");
  }
  return el;
}

function bboxOf(record, staff) {
  let f0 = Infinity, f1 = -Infinity;
  for (const ev of record) {
    if (ev.f0 < f0) f0 = ev.f0;
    if (ev.f1 > f1) f1 = ev.f1;
  }
  const scale = staff.lineSpacingPx / staff.normSpacing;
  const x0 = staff.bbox[0] + WIDTH_REDUCTION * f0 * scale;
  const x1 = staff.bbox[0] + WIDTH_REDUCTION * (f1 + 1) * scale;
  return [roundPy(x0, 1), staff.bbox[1], roundPy(x1 - x0, 1), staff.bbox[3]];
}

export function lineFragment(tokenEvents, staff) {
  const out = [];
  for (const record of records(tokenEvents)) {
    const el = classify(record);
    if (el === null) continue;
    el.tokens = record.map((ev) => ev.token);
    el.src = { page: staff.page, system: staff.system,
               staff: staff.staffIndex, bbox: bboxOf(record, staff) };
    out.push(el);
  }
  return out;
}

function modal(values) {
  const uniq = [...new Set(values)].sort((a, b) => a - b);
  let best = 0, n = 0;
  for (const v of uniq) {
    const c = values.filter((x) => x === v).length;
    if (c > n) { best = v; n = c; }
  }
  return best;
}

function systemsOf(lines) {
  const bySys = new Map();
  for (const ln of lines) {
    const st = ln.staff;
    const key = st.page * 1e6 + st.system;
    if (!bySys.has(key)) bySys.set(key, []);
    bySys.get(key).push(st);
  }
  const out = [];
  for (const key of [...bySys.keys()].sort((a, b) => a - b)) {
    const staves = bySys.get(key);
    const xs = staves.map((s) => s.bbox[0]);
    const ys = staves.map((s) => s.bbox[1]);
    const x2 = staves.map((s) => s.bbox[0] + s.bbox[2]);
    const y2 = staves.map((s) => s.bbox[1] + s.bbox[3]);
    out.push({
      index: staves[0].system, page: staves[0].page,
      bbox: [Math.min(...xs), Math.min(...ys),
             Math.max(...x2) - Math.min(...xs),
             Math.max(...y2) - Math.min(...ys)],
      staves: [...staves].sort((a, b) => a.bbox[1] - b.bbox[1]).map((s) => ({
        part: s.staffIndex, bbox: s.bbox, lineSpacingPx: s.lineSpacingPx,
        normScale: roundPy(s.lineSpacingPx / s.normSpacing, 4),
      })),
    });
  }
  return out;
}

export function assembleIR(lines, pages, generator = "omr-decode.js") {
  const counts = new Map();
  for (const ln of lines) {
    const s = ln.staff;
    counts.set(s.system, Math.max(counts.get(s.system) ?? 0, s.staffIndex + 1));
  }
  const m = counts.size ? modal([...counts.values()]) : 0;

  const warnings = [];
  for (const sysno of [...counts.keys()].sort((a, b) => a - b)) {
    const n = counts.get(sysno);
    if (n !== m) {
      warnings.push({ code: "staff-count-mismatch", system: sysno,
                      message: `System ${sysno}: ${n} Zeilen erkannt, ` +
                               `Struktur sagt ${m}` });
    }
  }

  const parts = [];
  for (let i = 0; i < m; i++) parts.push({ index: i, label: null, measures: [] });
  const openMeasures = new Array(m).fill(null);
  const structure = { stavesPerSystem: m, clefs: new Array(m).fill(null),
                      keyFifths: null, time: null };

  const open = (p, system) => {
    if (openMeasures[p] === null) {
      const mm = { index: parts[p].measures.length, system, events: [] };
      parts[p].measures.push(mm);
      openMeasures[p] = mm;
    }
    return openMeasures[p];
  };

  for (const ln of lines) {
    const st = ln.staff;
    const p = st.staffIndex;
    if (p >= m) continue;
    for (const el of ln.elements) {
      if (el.kind === "unparseable") {
        warnings.push({ code: "unparseable-tokens", system: st.system,
                        staff: p, message: el.tokens.join(" ") });
        continue;
      }
      if (el.kind === "attribute") {
        const mm = open(p, st.system);
        if (!("attributes" in mm)) mm.attributes = {};
        for (const k of ["clef", "keyFifths", "time"]) {
          if (k in el) mm.attributes[k] = el[k];
        }
        if ("clef" in el && structure.clefs[p] === null) {
          const c = el.clef;
          structure.clefs[p] = c.sign + String(c.line) +
            (c.octaveChange < 0 ? "v8" : "");
        }
        if ("keyFifths" in el && structure.keyFifths === null) {
          structure.keyFifths = el.keyFifths;
        }
        if ("time" in el && structure.time === null) structure.time = el.time;
        continue;
      }
      if (el.kind === "barline") {
        const mm = openMeasures[p];
        if (mm !== null) {
          mm.barline = { type: el.type, confidence: el.confidence,
                         tokens: el.tokens, src: el.src };
          openMeasures[p] = null;
        }
        continue;
      }
      open(p, st.system).events.push(el);
    }
  }

  return {
    irVersion: IR_VERSION,
    generator: { model: "omr-2026-08", decoder: generator },
    rejected: false,
    source: { pages },
    structure: { recognized: structure, confirmed: null },
    systems: systemsOf(lines),
    parts,
    warnings,
  };
}
