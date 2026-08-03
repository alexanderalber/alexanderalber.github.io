/* omr-worker.js -- recognition worker for sheet-to-midi.
 *
 * Module worker. Pipeline per page:
 *   RGBA page bitmap -> omrPreprocess (staff detection + normalisation)
 *   -> ONNX line model (onnxruntime-web, WASM EP, single-threaded: GitHub
 *      Pages cannot send COOP/COEP, so no SharedArrayBuffer)
 *   -> decodeLine / lineFragment / assembleIR (omr-decode.js) -> Score-IR.
 *
 * omr-preprocess.js is the one module still owed by the model repo (its
 * phase 5). Until it exists next to this file, "recognize" answers with
 * error code "preprocess-missing" and the UI says so honestly.
 *
 * Messages in:
 *   { type: "recognize", pages: [{ data: ArrayBuffer(RGBA), width, height, dpi }] }
 *   { type: "cancel" }
 * Messages out:
 *   { type: "progress", stage: "model" | "page" | "line", ...counts }
 *   { type: "result", ir }
 *   { type: "error", code, message }
 */

import { decodeLine, lineFragment, assembleIR, i2wFromVocab } from "./omr-decode.js";

const MODEL_URL = "/assets/files/omr/omr-2026-08/omr-2026-08.fp16.onnx";
const VOCAB_URL = "/assets/files/omr/omr-2026-08/vocab-2026-08.json";
const ORT_BASE = new URL("./", import.meta.url).href;

let ortReady = null;      /* Promise of { ort, session, i2w, C } */
let cancelled = false;

function post(m) { self.postMessage(m); }

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
           message: "The preprocessing module (omr-preprocess.js) has not been delivered by the model repo yet. Everything else is wired up and waiting for it." });
    return;
  }

  const { ort, session, i2w, C } = await ensureModel();

  const lines = [];
  const pagesMeta = [];
  for (let pi = 0; pi < msg.pages.length; pi++) {
    if (cancelled) return;
    const page = msg.pages[pi];
    pagesMeta.push({ index: pi, widthPx: page.width, heightPx: page.height, dpi: page.dpi });
    post({ type: "progress", stage: "page", page: pi, pages: msg.pages.length });

    const out = pre.omrPreprocess({
      data: new Uint8ClampedArray(page.data),
      width: page.width, height: page.height, dpi: page.dpi,
    }, { page: pi });

    for (let ti = 0; ti < out.tiles.length; ti++) {
      if (cancelled) return;
      const tile = out.tiles[ti];
      const feeds = { input: new ort.Tensor("float32", tile.tensor, tile.shape) };
      const res = await session.run(feeds);
      const logits = res.logits;
      const T = logits.dims[1];
      const events = decodeLine(logits.data, T, C, i2w);
      /* tile.meta carries the staff geometry per contract 1; the exact field
       * mapping gets its final check when omr-preprocess.js lands */
      const staff = {
        page: pi,
        system: tile.meta.system,
        staffIndex: tile.meta.staffIndex,
        bbox: tile.meta.bbox,
        lineSpacingPx: tile.meta.lineSpacingPx,
        normSpacing: tile.meta.normSpacing,
      };
      lines.push({ staff, elements: lineFragment(events, staff) });
      post({ type: "progress", stage: "line", page: pi, line: ti + 1,
             lines: out.tiles.length });
    }
  }

  const ir = assembleIR(lines, pagesMeta, "omr-decode.js 1.0");
  post({ type: "result", ir });
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
