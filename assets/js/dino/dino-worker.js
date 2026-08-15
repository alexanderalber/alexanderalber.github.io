/* dino-worker.js -- DINOv3 patch-feature extraction for patch-similarity.
 *
 * Module worker. One job: turn an already square-resampled RGBA buffer into the
 * model's patch tokens.
 *
 *   RGBA (S*S*4) -> float32 NCHW [1,3,S,S], x = (x/255 - mean)/std
 *     -> ONNX DINOv3 ViT-S/16, 4-bit quantized (onnxruntime-web, WASM EP,
 *        single-threaded: GitHub Pages cannot send COOP/COEP, so there is no
 *        SharedArrayBuffer and threads would not start anyway)
 *     -> last_hidden_state [1, T, 384], T = 5 prefix tokens (1 CLS + 4
 *        registers) + (S/16)^2 patch tokens
 *     -> the LAST (S/16)^2 tokens, row major over the patch grid.
 *
 * The worker stays dumb about images: it never resizes, never crops and never
 * looks at the page. The app owns the resample, so the mapping from a clicked
 * pixel to a patch index has exactly one definition, and it lives there.
 *
 * The model ships as an ONNX graph plus a separate weights file. The WASM EP
 * cannot read files, so the weights are fetched here and handed over as
 * `externalData`, matched on the path string that is written INSIDE the .onnx
 * (model_q4.onnx_data), not on the URL we serve them from.
 *
 * Messages in:
 *   { type: "extract", id, rgba: Uint8ClampedArray|Uint8Array (S*S*4), size: S }
 * Messages out:
 *   { type: "progress", stage: "model", got, total }   (both files combined)
 *   { type: "features", id, size, grid, dim, data: Float32Array }  (transferred)
 *   { type: "error", id, message }
 */

const MODEL_URL = "/assets/files/dinov3/dinov3-vits16-q4.onnx";
const WEIGHTS_URL = "/assets/files/dinov3/dinov3-vits16-q4.onnx_data";

/* The external-data reference as it is stored in the graph. The served file
 * name may differ from it; onnxruntime matches on this string. */
const WEIGHTS_REF = "model_q4.onnx_data";

/* The runtime and its .wasm live with the OMR tool; this worker sits in a
 * different folder, so wasmPaths cannot be derived from import.meta.url. */
const ORT_BASE = "/assets/js/omr/";

const PATCH = 16;
const MEAN = [0.485, 0.456, 0.406];
const STD = [0.229, 0.224, 0.225];

let ortReady = null;   /* Promise of { ort, session, inputName, outputName } */

function post(m, transfer) { self.postMessage(m, transfer || []); }

/* Same shape as the OMR worker's loader. onPart reports bytes for ONE file;
 * the caller adds them up across the two. */
function fetchWithProgress(url, onPart) {
  return fetch(url).then((res) => {
    if (!res.ok) throw new Error("HTTP " + res.status + " for " + url);
    const total = Number(res.headers.get("Content-Length")) || 0;
    if (!res.body || !total) {
      return res.arrayBuffer().then((buf) => {
        onPart(buf.byteLength, buf.byteLength);
        return buf;
      });
    }
    onPart(0, total);
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
      const ort = await import(ORT_BASE + "ort.wasm.bundle.min.mjs");
      ort.env.wasm.wasmPaths = ORT_BASE;
      ort.env.wasm.numThreads = 1;

      /* Two downloads, one bar: the graph is a rounding error next to the
       * weights, but a bar that jumps back to zero halfway looks broken. */
      const seen = [{ got: 0, total: 0 }, { got: 0, total: 0 }];
      const report = (slot) => (got, total) => {
        seen[slot].got = got;
        seen[slot].total = total;
        post({
          type: "progress", stage: "model",
          got: seen[0].got + seen[1].got,
          total: seen[0].total + seen[1].total,
        });
      };
      const [graphBuf, weightsBuf] = await Promise.all([
        fetchWithProgress(MODEL_URL, report(0)),
        fetchWithProgress(WEIGHTS_URL, report(1)),
      ]);

      const session = await ort.InferenceSession.create(new Uint8Array(graphBuf), {
        executionProviders: ["wasm"],
        externalData: [{ path: WEIGHTS_REF, data: new Uint8Array(weightsBuf) }],
      });
      const inputName = session.inputNames.includes("pixel_values")
        ? "pixel_values" : session.inputNames[0];
      const outputName = session.outputNames.includes("last_hidden_state")
        ? "last_hidden_state" : session.outputNames[0];
      return { ort, session, inputName, outputName };
    })();
    ortReady.catch(() => { ortReady = null; });   /* allow retry after failure */
  }
  return ortReady;
}

/* RGBA, row major, alpha ignored -> planar float32, channel first, normalized. */
function toNchw(rgba, S) {
  const plane = S * S;
  const out = new Float32Array(3 * plane);
  for (let i = 0; i < plane; i++) {
    const j = i * 4;
    out[i] = (rgba[j] / 255 - MEAN[0]) / STD[0];
    out[plane + i] = (rgba[j + 1] / 255 - MEAN[1]) / STD[1];
    out[2 * plane + i] = (rgba[j + 2] / 255 - MEAN[2]) / STD[2];
  }
  return out;
}

async function extract(msg) {
  const S = msg.size | 0;
  if (!(S > 0) || S % PATCH !== 0) {
    throw new Error("Input size must be a positive multiple of " + PATCH + ", got " + msg.size);
  }
  const rgba = msg.rgba instanceof Uint8ClampedArray ? msg.rgba : new Uint8ClampedArray(msg.rgba);
  if (rgba.length !== S * S * 4) {
    throw new Error("Expected " + (S * S * 4) + " RGBA bytes, got " + rgba.length);
  }

  const { ort, session, inputName, outputName } = await ensureModel();
  const tensor = new ort.Tensor("float32", toNchw(rgba, S), [1, 3, S, S]);
  const result = await session.run({ [inputName]: tensor });
  const out = result[outputName];

  const grid = S / PATCH;
  const n = grid * grid;
  const dim = out.dims[2];
  const prefix = out.dims[1] - n;
  if (prefix < 0) {
    throw new Error("Model returned " + out.dims[1] + " tokens, fewer than the " + n + " patches expected");
  }
  /* Copy out of the session's buffer: subarray would alias memory the runtime
   * reuses on the next run, and it cannot be transferred either. */
  const data = new Float32Array(out.data.subarray(prefix * dim, (prefix + n) * dim));
  post({ type: "features", id: msg.id, size: S, grid, dim, data }, [data.buffer]);
}

self.onmessage = (ev) => {
  const msg = ev.data;
  if (!msg || msg.type !== "extract") return;
  extract(msg).catch((e) => {
    post({ type: "error", id: msg.id, message: String((e && e.message) || e) });
  });
};
