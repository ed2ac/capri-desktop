// Her ears on the room (her menu › Hear the room, off until you turn it on).
// And her name: with "Answer when I call her" on, a small speech recognizer (Vosk, offline, on this
// PC, in a hidden window of its own: src/wake) listens for one word only, "Capri". When it hears it she perks up and
// listens to what you say next (mic.js: that part goes to Groq's Whisper, as with Ctrl+Alt+V). Your microphone, a second
// of sound at a time, goes through a sound classifier (Google's YAMNet, through MediaPipe) right here
// in her window: it names what it hears (laughter, applause, a dog, a sneeze, the doorbell, an alarm,
// thunder, someone singing, music…) and she reacts. Nothing is recorded, kept or sent: each second is
// classified and dropped. Windows shows its microphone icon while she listens; she stops during your
// calls.

const BASE = new URL('../../../', import.meta.url).href;

// what she listens for: YAMNet's names -> what it is to her, how sure, how often at most (min)
const SOUNDS = [
  [/^(Laughter|Giggle|Belly laugh|Chuckle, chortle|Baby laughter)$/, 'laugh', 0.45, 6],
  [/^(Applause|Clapping|Cheering)$/, 'applause', 0.45, 10],
  [/^Sneeze$/, 'sneeze', 0.5, 2],
  [/^Cough$/, 'cough', 0.6, 20],
  [/^(Doorbell|Ding-dong|Knock)$/, 'door', 0.4, 3],
  [/^(Alarm|Smoke detector, smoke alarm|Fire alarm|Alarm clock|Buzzer|Siren)$/, 'alarm', 0.45, 5],
  [/^(Telephone bell ringing|Ringtone|Telephone)$/, 'phone', 0.45, 5],
  [/^(Dog|Bark|Bow-wow|Howl|Growling|Whimper \(dog\))$/, 'dog', 0.45, 15],
  [/^(Cat|Meow|Purr|Hiss|Caterwaul)$/, 'cat', 0.4, 15],
  [/^(Baby cry, infant cry|Crying, sobbing)$/, 'cry', 0.5, 15],
  [/^(Thunder|Thunderstorm)$/, 'thunder', 0.4, 20],
  [/^(Explosion|Bang|Slam|Gunshot, gunfire|Burst, pop|Smash, crash)$/, 'bang', 0.5, 2],
  [/^(Singing|Humming|Choir|Rapping|Yodeling)$/, 'sing', 0.45, 15],
  [/^(Whistling|Whistle)$/, 'whistle', 0.45, 15],
  [/^Snoring$/, 'snore', 0.45, 20],
  [/^(Burping, eructation|Hiccup)$/, 'burp', 0.5, 10],
  [/^(Music|Musical instrument|Guitar|Piano|Drum)$/, 'music', 0.55, 15],
];

export class Hearing {
  constructor({ capri, panel, brain, voice, heart, emotions, daily, guide, host }) {
    Object.assign(this, { capri, panel, brain, voice, heart, emotions, daily, guide, host });
    this.on = false;
    this.asked = false;
    this.paused = false;
    this.stream = null;
    this.classifier = null;
    this.said = {};
    this.streak = {};
    this.wakeOn = true;      // her menu › Answer when I call her
    this.onWake = null;      // app.js: she listens (mic.js)
    this.wakeAt = 0;
  }

  heardWord(text) {
    if (!/(^|\s)capri(\s|$)/.test(String(text || ''))) return;
    const now = Date.now();
    if (now - this.wakeAt < 6000 || !this.on || this.paused) return;
    this.wakeAt = now;
    this.onWake?.();
  }

  get t() {
    return this.brain.t.ear;
  }

  configure({ earOn, earAsked, wakeWord }) {
    this.asked = Boolean(earAsked);
    this.wakeOn = wakeWord !== false; // her name itself is heard in its own window (src/wake)
    const on = earOn === true;
    if (on !== this.on) {
      this.on = on;
      if (on) this.start();
      else this.stop();
    }
  }

  async setOn(on) {
    if (!on) return this.host.setConfig({ earOn: false });
    if (!this.asked) {
      let yes = false;
      await this.guide.scene(async () => {
        this.capri.perform('curious', this.capri.towardCenter());
        yes = (await this.guide.ask({ face: 'look', line: this.t.ask, quote: this.t.what, actions: [{ id: 'yes', label: this.t.yes, primary: true }, { id: 'no', label: this.t.no }] })) === 'yes';
      });
      if (!yes) return undefined;
    }
    await this.host.setConfig({ earOn: true, earAsked: true });
    this.panel.say({ kind: 'info', face: 'smug', line: this.t.on, hold: 3500 });
    return undefined;
  }

  pause(on) {
    this.paused = on;
    if (on) this.stop();
    else if (this.on) this.start();
  }

  async start() {
    if (this.stream || this.paused || !this.on) return;
    try {
      // the room as it is: no noise suppression, it would take out what she wants to hear
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: { noiseSuppression: false, echoCancellation: false, autoGainControl: true }, video: false });
    } catch {
      this.panel.say({ kind: 'info', face: 'aside', line: this.t.noMic, hold: 5000 });
      return;
    }
    if (!this.classifier) {
      try {
        const { FilesetResolver, AudioClassifier } = await import(`${BASE}node_modules/@mediapipe/tasks-audio/audio_bundle.mjs`);
        const files = await FilesetResolver.forAudioTasks(`${BASE}node_modules/@mediapipe/tasks-audio/wasm`);
        this.classifier = await AudioClassifier.createFromOptions(files, {
          baseOptions: { modelAssetPath: `${BASE}assets/mediapipe/yamnet.tflite` }, maxResults: 6, scoreThreshold: 0.25,
        });
      } catch (err) {
        console.error('[capri] sound model:', err);
        this.stop();
        return;
      }
    }
    this.ctx = new AudioContext();
    const src = this.ctx.createMediaStreamSource(this.stream);
    const proc = this.ctx.createScriptProcessor(4096, 1, 1);
    const rate = this.ctx.sampleRate;
    let buf = new Float32Array(0);
    proc.onaudioprocess = (e) => {
      const chunk = e.inputBuffer.getChannelData(0);
      const next = new Float32Array(buf.length + chunk.length);
      next.set(buf);
      next.set(chunk, buf.length);
      buf = next;
      if (buf.length >= rate) { // a second of sound: what is it?
        const second = buf.slice(0, rate);
        buf = buf.slice(rate);
        this.hear(second, rate);
      }
    };
    src.connect(proc);
    proc.connect(this.ctx.destination); // (silent: the processor outputs nothing)
    this.nodes = { src, proc };
  }

  stop() {
    this.nodes?.proc.disconnect();
    this.nodes?.src.disconnect();
    this.nodes = null;
    this.ctx?.close().catch(() => {});
    this.ctx = null;
    this.stream?.getTracks().forEach((tr) => tr.stop());
    this.stream = null;
  }

  hear(samples, rate) {
    let results;
    try {
      results = this.classifier.classify(samples, rate);
    } catch {
      return;
    }
    const cats = results.flatMap((r) => r.classifications?.[0]?.categories || []);
    const found = new Set();
    for (const c of cats) {
      for (const [re, kind, min] of SOUNDS) {
        if (re.test(c.categoryName) && c.score >= min) found.add(kind);
      }
    }
    for (const kind of Object.keys(this.streak)) if (!found.has(kind)) this.streak[kind] = 0;
    for (const kind of found) {
      this.streak[kind] = (this.streak[kind] || 0) + 1;
      // a sneeze, a bang, a knock are one second; the rest wants two in a row (less false alarms)
      const quick = ['sneeze', 'bang', 'door', 'burp'].includes(kind);
      if (this.streak[kind] >= (quick ? 1 : 2)) this.react(kind);
    }
  }

  free() {
    const c = this.capri;
    return !c.busy && !c.hidden && !c.stowed && c.mode !== 'alert';
  }

  react(kind) {
    const every = (SOUNDS.find(([, k]) => k === kind)?.[3] || 10) * 60000;
    const now = Date.now();
    if (now - (this.said[kind] || 0) < every || !this.free()) return;
    this.said[kind] = now;
    const c = this.capri;
    c.wake();
    if (kind === 'thunder') return this.emotions?.fear('storm');
    if (kind === 'music' || kind === 'sing') {
      this.daily?.dance();
      if (kind === 'music') return undefined;
    }
    const body = { laugh: 'split', applause: 'hop', sneeze: 'flinch', bang: 'flinch', alarm: 'alarm', door: 'alarm', phone: 'curious', dog: 'curious', cat: 'curious', cry: 'look', sing: 'hop', whistle: 'curious', snore: 'look', burp: 'huff', cough: 'look' }[kind] || 'curious';
    c.perform(body, c.towardCenter());
    if (kind === 'laugh') this.heart?.nudge('praise', 0.4);
    if (kind === 'alarm' || kind === 'door') this.voice.play('alert');
    const loud = ['alarm', 'door', 'phone', 'bang'].includes(kind);
    this.panel.say({ kind: loud ? 'alert' : 'info', face: { laugh: 'laugh', applause: 'laugh', bang: 'wide', alarm: 'wide', door: 'wide' }[kind] || 'look', line: this.brain.line(`ear.${kind}`), hold: loud ? 6000 : 3500 });
    return undefined;
  }
}
