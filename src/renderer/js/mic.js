// Talking to her out loud: Ctrl+Alt+V, you speak, she listens (her ticker says so) and stops on her
// own after a moment of silence (or Ctrl+Alt+V again). Your words become text through Groq's free
// Whisper, with the key you gave her, and go to her chat as if you'd typed them. She still answers
// in writing and with her babble. The first time, she says where your voice goes.

import { fmt } from './util.js';

const SILENCE_MS = 1500;
const MAX_MS = 30000;
const QUIET = 0.018; // RMS below this is silence

export class Mic {
  constructor({ capri, panel, brain, host, chat, guide, voice }) {
    Object.assign(this, { capri, panel, brain, host, chat, guide, voice });
    this.rec = null;
    this.asked = false;
  }

  get t() {
    return this.brain.t.mic;
  }

  configure({ micAsked }) {
    this.asked = Boolean(micAsked);
  }

  async toggle() {
    if (this.rec) return this.stop();
    if (!this.asked) {
      let yes = false;
      await this.guide.scene(async () => {
        yes = (await this.guide.ask({ face: 'look', line: this.t.ask, quote: this.t.where, actions: [{ id: 'yes', label: this.t.yes, primary: true }, { id: 'no', label: this.t.no }] })) === 'yes';
      });
      if (!yes) return undefined;
      this.asked = true;
      this.host.setConfig({ micAsked: true });
    }
    return this.start();
  }

  async start() {
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch {
      this.panel.say({ kind: 'info', face: 'aside', line: this.t.noMic, hold: 5000 });
      return;
    }
    const chunks = [];
    const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });
    recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    // a moment of silence after you spoke: done
    const ctx = new AudioContext();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    ctx.createMediaStreamSource(stream).connect(analyser);
    const buf = new Float32Array(analyser.fftSize);
    let spoke = false;
    let quietSince = performance.now();
    const started = performance.now();
    const watch = setInterval(() => {
      analyser.getFloatTimeDomainData(buf);
      const rms = Math.sqrt(buf.reduce((s, v) => s + v * v, 0) / buf.length);
      const now = performance.now();
      if (rms > QUIET) {
        spoke = true;
        quietSince = now;
        this.capri.pulse?.();
      }
      if ((spoke && now - quietSince > SILENCE_MS) || now - started > MAX_MS || (!spoke && now - started > 8000)) this.stop();
    }, 100);
    this.rec = { recorder, stream, ctx, watch, chunks, spoke: () => spoke };
    recorder.start(250);
    this.voice.play('tick');
    this.capri.wake();
    this.capri.perform('curious', this.capri.towardCenter());
    this.panel.setTicker({ verb: '🎙', target: this.t.listening });
  }

  async stop() {
    const r = this.rec;
    if (!r) return;
    this.rec = null;
    clearInterval(r.watch);
    const done = new Promise((res) => { r.recorder.onstop = res; });
    r.recorder.stop();
    await done;
    r.stream.getTracks().forEach((tr) => tr.stop());
    r.ctx.close();
    this.panel.setTicker(null);
    this.voice.play('tick');
    if (!r.spoke()) return;
    this.panel.setTicker({ verb: '…', target: this.t.transcribing });
    const audio = await new Blob(r.chunks, { type: 'audio/webm' }).arrayBuffer();
    const res = await this.host.transcribe(audio, this.brain.lang).catch((err) => ({ error: err.message }));
    this.panel.setTicker(null);
    if (!res?.text) {
      this.panel.say({ kind: 'info', face: 'aside', line: res?.error === 'nokey' ? this.t.noKey : fmt(this.t.failed, { error: res?.error || '…' }), hold: 6000 });
      return;
    }
    if (!this.chat.open) await this.chat.start();
    await new Promise((ok) => setTimeout(ok, 500));
    this.chat.send(res.text);
  }
}
