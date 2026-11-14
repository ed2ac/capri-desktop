// Whisper (small, quantized), on this PC: a recording (webm/opus) in, its text out.
import { pipeline, env } from '../vendor/transformers/transformers.web.min.js';

const BASE = new URL('../../', import.meta.url).href;
env.allowRemoteModels = false;               // only the model she downloaded (main.js), never the internet
env.allowLocalModels = true;
env.useBrowserCache = false;                 // her model is on disk already: no browser cache on capri://
window.__state = { stage: 'start', files: {} };
env.localModelPath = `${BASE}models/`;
env.backends.onnx.wasm.wasmPaths = `${BASE}src/vendor/transformers/`;
env.backends.onnx.wasm.numThreads = Math.max(1, Math.min(6, (navigator.hardwareConcurrency || 4) - 2));

const MODEL = 'onnx-community/whisper-small';
let asr = null;

async function load() {
  window.__state.stage = 'loading';
  asr ||= await pipeline('automatic-speech-recognition', MODEL, {
    device: 'wasm', dtype: 'q8',
    progress_callback: (x) => { if (x.file) window.__state.files[x.file] = `${x.status} ${Math.round(x.progress || 0)}`; },
  });
  window.__state.stage = 'ready';
  return asr;
}

// the recording as 16 kHz mono floats
async function samples(buffer) {
  const ctx = new AudioContext();
  const audio = await ctx.decodeAudioData(buffer.slice(0));
  ctx.close();
  const off = new OfflineAudioContext(1, Math.ceil(audio.duration * 16000), 16000);
  const src = off.createBufferSource();
  src.buffer = audio;
  src.connect(off.destination);
  src.start();
  return (await off.startRendering()).getChannelData(0);
}

window.ears.onJob(async ({ id, audio, lang }) => {
  try {
    const t0 = performance.now();
    const model = await load();
    const out = await model(await samples(audio), { language: lang === 'pt' ? 'portuguese' : lang === 'es' ? 'spanish' : lang === 'fr' ? 'french' : lang === 'ru' ? 'russian' : 'english', task: 'transcribe', chunk_length_s: 30 });
    window.ears.done(id, { text: String(out.text || '').trim(), ms: Math.round(performance.now() - t0) });
  } catch (err) {
    window.ears.done(id, { error: String(err?.message || err) });
  }
});
load().then(() => window.ears.ready({ ok: true, threads: env.backends.onnx.wasm.numThreads, isolated: self.crossOriginIsolated })).catch((err) => {
  window.__state = { ...window.__state, stage: 'error', error: String(err?.stack || err?.message || err).slice(0, 800) };
  window.ears.ready({ ok: false, error: String(err?.message || err) });
});
