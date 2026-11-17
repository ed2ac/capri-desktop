// Talking with her, not only at her. When she asks you something on her own ("are you seeing that
// star?"), she listens a few seconds for your answer: a little 👂 by her head while she does. You
// answer out loud, and it goes on in her chat, as a reply to what she asked (and if her reply asks
// again, she listens again). You don't, and nothing happens: nothing recorded, nothing sent.
// Now and then she starts a little conversation herself, when you're there and nothing's going on.
//
// Your voice becomes text the way it does with her shortcut (Groq's Whisper, with your key), and only
// when you spoke after her question. Her menu › Camera and sounds › Talk with me turns it off; she
// only does it once you've let her use the microphone.

import { fmt, inLang, pick, rand } from './util.js';
import { newsTopic } from './news.js';

const WAIT_MS = 7000;      // how long she waits for you to start answering
const SILENCE_MS = 1300;   // you stopped talking
const MAX_MS = 15000;
const QUIET = 0.02;        // RMS under this: silence
// what Whisper "hears" in silence or noise, in Portuguese and English (YouTube captions it learned from)
// Only what's said to HER counts: her name somewhere in it ("mas aí não pode, Capri"), the whole of
// it kept (what came before her name too). Anything else (you talking to someone, the TV, a noise
// Whisper made words of) isn't an answer. As Whisper may spell her name.
const NAME = /(?<![\p{L}])(?:capri|kapri|capry|kapry|cápri|caprí|capre|capr[ií]e|kapre)(?![\p{L}])/iu;
export const addressed = (text) => NAME.test(String(text || ''));
const PHANTOM = /^(obrigad[oa]\.?|tchau\.?|legenda[s]?.*|.*amara\.org.*|inscreva-se.*|thank you\.?|thanks for watching.*|you\.?|bye\.?|\.+|…)$/i;

export class Converse {
  constructor({ capri, panel, brain, host, chat, guide, voice, life, presence, mic }) {
    Object.assign(this, { capri, panel, brain, host, chat, guide, voice, life, presence, mic });
    this.on = true;
    this.allowed = false;    // the microphone already allowed (her question about it answered yes)
    this.listening = false;
    this.talking = false;    // a conversation started by voice: her questions in it are listened to
    this.startedAt = Date.now();
    this.lastStarter = Date.now();
    this.nextStarter = 0;    // when the next one she starts may come (drawn once, after each)
    this.gap = [45, 90];     // minutes between conversations she starts (her menu › How talkative)
    this.lastListen = 0;
    setInterval(() => this.maybeStart().catch(() => {}), 60000);
  }

  get t() {
    return this.brain.t.converse;
  }

  configure({ converse, micAsked, chatty }) {
    this.on = converse !== false;
    this.allowed = micAsked === true;
    this.gap = { low: [120, 240], normal: [45, 90], high: [20, 40] }[chatty] || [45, 90];
  }

  // panel.js said something: one of her own questions is worth listening for
  saw(msg) {
    if (!msg?.line || msg.guide || msg.actions?.length || msg.chat || msg.reply || msg.kind === 'alert' || msg.kind === 'chat') return;
    if (!/\?["”»)]?\s*$/.test(msg.line.trim())) return;
    // as long as her question is on screen
    const shown = this.panel.current;
    this.listen(msg.line, { until: () => this.panel.current === shown && this.panel.visible });
  }

  ready() {
    if (!this.on || !this.allowed || this.noKey || this.listening) return false;
    if (this.mic?.rec || this.mic?.asking || this.guide?.running) return false;
    if (this.presence?.away || this.capri.stowed || this.paused || this.capri.mode === 'sleep' || this.capri.dormant === true) return false;
    return true;
  }

  // her question on screen, or her chat open: the microphone stays open as long as it's there
  // (`until`), and what you say to her (her name in it) is your answer. Nothing said: nothing
  // recorded beyond the moment, nothing sent.
  async listen(question, { until = null } = {}) {
    if (!this.ready() || (this.chat.open && !until)) return;
    // her questions on her own: the microphone opens at most every 8 minutes; her chat: always
    if (!until && Date.now() - this.lastListen < 8 * 60000) return;
    this.lastListen = Date.now();
    const open = until || (() => false);
    this.listening = true;
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch {
      this.listening = false;
      return;
    }
    const ear = this.ear();
    let ctx = null;
    let heard = null;
    const started = Date.now();
    try {
      ctx = new AudioContext();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      ctx.createMediaStreamSource(stream).connect(analyser);
      // still worth listening: her question (or chat) still there (a first few seconds at least),
      // her mic shortcut not in use, and her ears on
      const going = () => this.on && !this.paused && !this.mic?.rec && (open() || Date.now() - started < WAIT_MS) && (!until || open());
      for (let tries = 0; tries < 40 && going(); tries++) {
        const audio = await this.utterance(stream, analyser, going);
        if (!audio) break; // it closed, or nobody spoke
        const res = await this.host.transcribe(audio, this.brain.lang).catch(() => null);
        if (res?.error === 'nokey') { this.noKey = true; break; }
        const text = String(res?.text || '').trim();
        if (text && !PHANTOM.test(text) && addressed(text)) { heard = text; break; }
        // the TV, someone else, words without her name: she goes on listening
      }
    } catch {
      heard = null; // something in the way (the microphone taken): as if nobody answered
    } finally {
      // whatever happened: the microphone off, her ear gone, listening over
      stream.getTracks().forEach((tr) => tr.stop());
      ctx?.close().catch(() => {});
      ear.remove();
      this.listening = false;
      this.hearing = false;
    }
    if (heard) return this.answered(question, heard);
    return this.unanswered(question);
  }

  // one thing said: waits for a voice (as long as `going`), records until you stop. The recording,
  // or null (closed, or only a cough).
  async utterance(stream, analyser, going) {
    const chunks = [];
    const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });
    recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    const buf = new Float32Array(analyser.fftSize);
    let spoke = 0;
    let quietSince = 0;
    recorder.start(250);
    const spokeFor = await new Promise((resolve) => {
      const watch = setInterval(() => {
        analyser.getFloatTimeDomainData(buf);
        const rms = Math.sqrt(buf.reduce((sum, v) => sum + v * v, 0) / buf.length);
        const now = performance.now();
        if (rms > QUIET) {
          spoke = spoke || now;
          quietSince = now;
          this.hearing = true; // her chat doesn't close on you mid-sentence (chat.js)
        }
        const done = spoke ? now - quietSince > SILENCE_MS || now - spoke > MAX_MS : !going();
        if (done) {
          clearInterval(watch);
          resolve(spoke ? quietSince - spoke : 0);
        }
      }, 100);
    });
    const stopped = new Promise((r) => { recorder.onstop = r; });
    recorder.stop();
    await stopped;
    this.hearing = false;
    if (spokeFor < 450) return going() ? this.utterance(stream, analyser, going) : null; // a cough, a click: listening on
    return new Blob(chunks, { type: 'audio/webm' }).arrayBuffer();
  }

  // you answered: in her chat, as a reply to her question
  async answered(question, text) {
    this.talking = true;
    if (!this.chat.open) await this.chat.start({ opening: question });
    if (!this.chat.open) return;
    await new Promise((r) => setTimeout(r, 400));
    this.chat.send(text);
  }

  // nobody answered: sometimes a little shrug, mostly nothing
  unanswered() {
    // a talk out loud, and you didn't go on: her chat goes once you've had time to read her answer
    if (this.talking && this.chat.open) {
      const last = this.chat.history.at(-1);
      const len = last?.role === 'assistant' ? String(last.content).length : 0;
      this.chat.idle(Math.max(4000, Math.min(15000, 2500 + len * 40)));
      return;
    }
    if (this.chat.open || Math.random() > 0.3) return;
    setTimeout(() => {
      if (this.chat.open || this.capri.busy) return;
      this.panel.say({ kind: 'idle', face: 'aside', line: pick(this.t.shrug), hold: 3000 });
    }, 1500);
  }

  // her answer in her chat: she listens again, as long as her chat is open
  onAnswer(answer) {
    setTimeout(() => this.listen(answer, { until: () => this.chat.open }), 600);
  }

  // her chat just opened (you, or her): she listens while it's open
  onOpen(opening) {
    setTimeout(() => this.listen(opening || '', { until: () => this.chat.open }), 800);
  }

  onClose() {
    this.talking = false;
  }

  // the little ear by her head while she listens
  ear() {
    const el = document.createElement('div');
    el.textContent = '👂';
    const h = this.capri.head();
    Object.assign(el.style, {
      position: 'fixed', left: `${Math.round(h.x + 34 * (this.capri.facing || 1))}px`, top: `${Math.round(h.y - 46)}px`, font: '22px sans-serif',
      pointerEvents: 'none', zIndex: 9998, opacity: '0', transition: 'opacity .25s',
    });
    document.body.appendChild(el);
    requestAnimationFrame(() => { el.style.opacity = '0.9'; });
    this.capri.perform?.('curious', this.capri.towardCenter());
    return el;
  }

  // ---- a conversation she starts ----

  async maybeStart() {
    const now = Date.now();
    if (!this.ready() || this.light || this.chat.open || this.presence?.state !== 'here') return;
    this.nextStarter ||= this.lastStarter + rand(this.gap[0], this.gap[1]) * 60000;
    if (now < this.nextStarter || now - this.startedAt < 5 * 60000) return;
    const c = this.capri;
    if (c.busy || c.mode !== 'idle' || this.panel.visible || this.daily?.focus || this.camera?.paused || this.watch?.on) return;
    // not while you're typing away or in a game
    const idle = await this.host.pcIdle().catch(() => 0);
    if (idle < 8 || c.windows?.game) return;
    this.lastStarter = now;
    this.nextStarter = 0;
    // now and then, a headline from her cloud about something of yours (news.js)
    if (Math.random() < 0.35 && this.memory && this.host.cloudNews) {
      const items = await this.host.cloudNews().catch(() => []);
      const likes = this.memory.ranked().filter((i) => ['games', 'likes', 'music', 'projects', 'freeTime'].includes(i.kind)).slice(0, 30).map((i) => i.label);
      this.newsTold ||= new Set();
      const found = newsTopic(items, likes, this.newsTold);
      if (found && !this.chat.open && !c.busy) {
        this.newsTold.add(found.item.link);
        this.chat.lastNews = { list: [found.item], at: Date.now() };
        c.wake();
        c.perform('look', c.towardCenter());
        this.panel.say({ kind: 'idle', face: 'smug', line: fmt(this.brain.t.cloud.talk, { label: found.label, title: found.item.title, src: found.item.src }), hold: 10000 });
        return;
      }
    }
    const hour = new Date().getHours();
    const prompt = [
      'Start a little conversation with the user, out of nowhere, like a friend sitting next to them would: ONE short question.',
      `It is ${hour}h. ${this.heart ? `Your mood: ${this.heart.describe?.() || ''}.` : ''}`,
      // half the time, something of theirs she remembers (memory.js)
      ...((t) => (t && Math.random() < 0.5 ? [`About this, which you know about them: ${t.label} (${t.kind}). Ask how it's going, or something new about it.`] : []))(this.memory?.topic()),
      `If not that, about one of these, your pick: ${pick([
        'their day so far', 'what they are craving to eat', 'a song stuck in your head', 'whether they can see the stars tonight',
        'a memory of Night City', 'a dream you had (you are a digital ghost, do you dream?)', 'what they would do with a day off',
        'something they want to learn', 'a silly would-you-rather', 'how they are feeling', 'their favourite game', 'a plan for the weekend',
      ])}.`,
      'Never about what is on their screen. One sentence, ending with a question mark, at most 16 words, plain text.',
      this.chat.languageNote(),
    ].join('\n');
    const res = await this.host.localSay({ persona: this.chat.lookPersona(), prompt, maxTokens: 60, temperature: 1 }).catch(() => null);
    const line = this.chat.fresh(String(res?.text || '').split('\n')[0].trim()) || '';
    if (!res?.ok || !line.endsWith('?') || !inLang(line, this.brain.lang) || this.chat.open || c.busy) return;
    c.wake();
    c.perform('look', c.towardCenter());
    this.panel.say({ kind: 'idle', face: 'look', line, hold: 8000 });
  }
}

export const CONVERSE_PHANTOM = PHANTOM;
