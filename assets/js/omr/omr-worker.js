/* omr-worker.js -- recognition worker for sheet-to-midi.
 *
 * Module worker. Two passes over the pages:
 *   1. RGBA -> grayscale (PIL convert("L") semantics, see below) -> pageStats
 *      + detect (omr-reject.js / omr-preprocess.js) -> decide(): is this a
 *      scan, is this closed score? A rejected score stops here, before the
 *      model is fetched.
 *   2. grayscale -> preprocessPage (staff detection + normalisation)
 *      -> ONNX line model (onnxruntime-web, WASM EP, single-threaded: GitHub
 *         Pages cannot send COOP/COEP, so no SharedArrayBuffer)
 *      -> decodeLine / lineFragment / assembleIR (omr-decode.js) -> Score-IR.
 *
 * Messages in:
 *   { type: "recognize", pages: [{ data: ArrayBuffer(RGBA), width, height, dpi }] }
 *   { type: "cancel" }
 * Messages out:
 *   { type: "progress", stage: "detect" | "model" | "page" | "line", ...counts }
 *   { type: "result", ir }
 *   { type: "error", code, message }
 */

import { decodeLine, lineFragment, assembleIR, i2wFromVocab, IR_VERSION }
  from "./omr-decode.js";
import { pageStats, decide } from "./omr-reject.js";

const MODEL_URL = "/assets/files/omr/omr-2026-08/omr-2026-08.fp16.onnx";
const VOCAB_URL = "/assets/files/omr/omr-2026-08/vocab-2026-08.json";
const ORT_BASE = new URL("./", import.meta.url).href;

let ortReady = null;      /* Promise of { ort, session, i2w, C } */
let cancelled = false;

function post(m) { self.postMessage(m); }

/* The reference chain reads pages via PIL Image.convert("L"): Rec. 601 luma
 * in 16.16 fixed point with rounding. Reproduced bit for bit so a colored
 * PDF binarizes the same way it would in the model repo's harness. */
function lumaFromRgba(rgba, n) {
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const j = i * 4;
    out[i] = (rgba[j] * 19595 + rgba[j + 1] * 38470 + rgba[j + 2] * 7471 +
              0x8000) >> 16;
  }
  return out;
}

function fetchWithProgress(url, onPart) {
  return fetch(url).then((res) => {
    if (!res.ok) throw new Error("HTTP " + res.status + " for " + url);
    const total = Number(res.headers.get("Content-Length")) || 0;
    if (!res.body || !total) return res.arrayBuffer();
    const reader = res.body.getReader();
    const chunks = [];
    let got = 0;
    const pump = () => reader.read().then(({ done, value }) => {
      if (done) {
        const buf = new Uint8Array(got);
        let off = 0;
        for (const c of chunks) { buf.set(c, off); off += c.length; }
        return buf.buffer;
      }
      chunks.push(value);
      got += value.length;
      onPart(got, total);
      return pump();
    });
    return pump();
  });
}

function ensureModel() {
  if (!ortReady) {
    ortReady = (async () => {
      const ort = await import("./ort.wasm.bundle.min.mjs");
      ort.env.wasm.wasmPaths = ORT_BASE;
      ort.env.wasm.numThreads = 1;
      const [modelBuf, vocab] = await Promise.all([
        fetchWithProgress(MODEL_URL, (got, total) =>
          post({ type: "progress", stage: "model", got, total })),
        fetch(VOCAB_URL).then((r) => {
          if (!r.ok) throw new Error("HTTP " + r.status + " for " + VOCAB_URL);
          return r.json();
        }),
      ]);
      const session = await ort.InferenceSession.create(modelBuf, {
        executionProviders: ["wasm"],
      });
      const i2w = i2wFromVocab(vocab.tokens);
      return { ort, session, i2w, C: vocab.tokens.length + 1 };
    })();
    ortReady.catch(() => { ortReady = null; });   /* allow retry after failure */
  }
  return ortReady;
}

async function recognize(msg) {
  cancelled = false;

  let pre;
  try {
    pre = await import("./omr-preprocess.js");
  } catch (e) {
    post({ type: "error", code: "preprocess-missing",
           message: "The preprocessing module (omr-preprocess.js) failed to load: " +
                    String((e && e.message) || e) });
    return;
  }

  const pagesMeta = msg.pages.map((p, i) => ({
    index: i, widthPx: p.width, heightPx: p.height, dpi: p.dpi }));
  const grayOf = (page) => pre.grayFromBytes(
    lumaFromRgba(new Uint8ClampedArray(page.data), page.width * page.height),
    page.width * page.height);

  /* Pass 1: the verdict, before the model is fetched. decide() is the only
   * producer of `rejected` (no second heuristic here, by agreement with the
   * model repo); it needs every page, so a rejected score would otherwise cost
   * the user a 6 MB download plus minutes of inference for nothing. The
   * grayscale and the detection are recomputed in pass 2 rather than kept: a
   * page of float32 grey is 25 MB, and the recomputation costs seconds where
   * the model costs minutes. */
  const stats = [];
  const staffCounts = [];
  for (let pi = 0; pi < msg.pages.length; pi++) {
    if (cancelled) return;
    const page = msg.pages[pi];
    post({ type: "progress", stage: "detect", page: pi, pages: msg.pages.length });
    const gray = grayOf(page);
    stats.push(pageStats(gray, page.width, page.height));
    for (const sys of pre.detect(gray, page.width, page.height).systems) {
      staffCounts.push(sys.length);
    }
  }
  const verdict = decide(stats, staffCounts);
  if (verdict.rejected) {
    post({ type: "result",
           ir: assembleIR([], pagesMeta, "omr-decode.js " + IR_VERSION, verdict) });
    return;
  }

  const { ort, session, i2w, C } = await ensureModel();

  const lines = [];
  for (let pi = 0; pi < msg.pages.length; pi++) {
    if (cancelled) return;
    const page = msg.pages[pi];
    post({ type: "progress", stage: "page", page: pi, pages: msg.pages.length });

    const { inputs } = pre.preprocessPage(grayOf(page), page.width, page.height);

    for (let ti = 0; ti < inputs.length; ti++) {
      if (cancelled) return;
      const input = inputs[ti];
      const feeds = { input: new ort.Tensor("float32", input.data,
                                            [1, 1, input.height, input.width]) };
      const res = await session.run(feeds);
      const logits = res.logits;
      const T = logits.dims[1];
      const events = decodeLine(logits.data, T, C, i2w);
      const box = input.box;
      const staff = {
        page: pi,
        system: box.system,
        staffIndex: box.voice,
        bbox: [box.x, box.y, box.w, box.h],
        lineSpacingPx: box.lineSpacing,
        normSpacing: pre.TARGET_SPACING,
        /* v1.2: assembleIR emits line-truncated itself, from this field. */
        truncated: input.truncated,
      };
      lines.push({ staff, elements: lineFragment(events, staff) });
      post({ type: "progress", stage: "line", page: pi, line: ti + 1,
             lines: inputs.length });
    }
  }

  post({ type: "result",
         ir: assembleIR(lines, pagesMeta, "omr-decode.js " + IR_VERSION, verdict) });
}

self.onmessage = (ev) => {
  const msg = ev.data;
  if (msg.type === "cancel") { cancelled = true; return; }
  if (msg.type === "recognize") {
    recognize(msg).catch((e) => {
      post({ type: "error", code: "internal",
             message: String((e && e.message) || e) });
    });
  }
};
