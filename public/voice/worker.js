// Runs Kokoro, a free open-source voice model, inside the browser. The model
// (about 90 MB) downloads once from Hugging Face and the browser keeps it, so
// after the first time the voice works with no limit and no key.
import { KokoroTTS } from "./kokoro-1.2.1.web.js";

const MODEL = "onnx-community/Kokoro-82M-v1.0-ONNX";
let tts = null;
let loading = null;
const files = new Map();

function load() {
  loading ??= KokoroTTS.from_pretrained(MODEL, {
    dtype: "q8",
    device: "wasm",
    progress_callback: (p) => {
      if (p.status === "progress" && p.total) {
        files.set(p.file, [p.loaded, p.total]);
        let loaded = 0, total = 0;
        for (const [l, t] of files.values()) { loaded += l; total += t; }
        postMessage({ type: "progress", loaded, total });
      }
    },
  }).then((model) => {
    tts = model;
    postMessage({ type: "ready" });
    return model;
  }).catch((error) => {
    loading = null;
    postMessage({ type: "failed", message: String(error && error.message || error) });
    throw error;
  });
  return loading;
}

// One line at a time, in the order asked for.
let chain = Promise.resolve();

onmessage = (event) => {
  const msg = event.data;
  if (msg.type === "load") { load().catch(() => {}); return; }
  if (msg.type === "say") {
    chain = chain.then(async () => {
      try {
        const model = tts ?? (await load());
        const started = performance.now();
        const audio = await model.generate(msg.text, { voice: msg.voice || "af_heart", speed: msg.speed || 1 });
        const samples = audio.audio;
        postMessage({ type: "audio", id: msg.id, samples, rate: audio.sampling_rate, ms: Math.round(performance.now() - started) }, [samples.buffer]);
      } catch (error) {
        postMessage({ type: "error", id: msg.id, message: String(error && error.message || error) });
      }
    });
  }
};
