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

// Two claps call her (like her name): two sharp knocks in the sound, a beat apart, and the classifier
// agreeing it heard hands clapping (your keyboard is sharp too, but it isn't clapping).
const BLOCK = 512;                  // samples per energy block (~11 ms)
const CLAP_GAP = [140, 750];        // ms between the two
const CLAP_WORDS = /^(Clapping|Hands|Applause|Slap, smack|Finger snapping)$/;
const ENVELOPE_S = 8;               // seconds of loudness kept, for the music's beat

// The beat of what's playing: the loudness rising in blocks (onsets), and the delay at which that
// pattern repeats best, between 70 and 170 BPM. { bpm, strength } or null.
export function tempo(envelope, blocksPerSecond) {
  const n = envelope.length;
  if (n < blocksPerSecond * 4) return null;
  const onset = new Float32Array(n);
  for (let i = 1; i < n; i++) onset[i] = Math.max(0, envelope[i] - envelope[i - 1]);
  const mean = onset.reduce((s, v) => s + v, 0) / n;
  for (let i = 0; i < n; i++) onset[i] -= mean;
  let best = null;
  let zero = 0;
  for (let i = 0; i < n; i++) zero += onset[i] * onset[i];
  if (zero <= 0) return null;
  for (let bpm = 70; bpm <= 170; bpm += 1) {
    const lag = Math.round((60 / bpm) * blocksPerSecond);
    let s = 0;
    for (let i = lag; i < n; i++) s += onset[i] * onset[i - lag];
    const score = s / zero;
    if (!best || score > best.strength) best = { bpm, strength: score };
  }
  return best && best.strength > 0.15 ? best : null;
}

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
    if (this.stream || this.paused || this.asleep || !this.on) return;
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
    // a second of sound gathered in one buffer, reused (no new one every chunk)
    const second = new Float32Array(rate);
    let filled = 0;
    this.blocksPerSecond = rate / BLOCK;
    this.envelope = [];
    this.bg = 0.01;
    this.onsets = [];
    proc.onaudioprocess = (e) => {
      const chunk = e.inputBuffer.getChannelData(0);
      this.blocks(chunk);
      let at = 0;
      while (at < chunk.length) {
        const take = Math.min(chunk.length - at, rate - filled);
        second.set(chunk.subarray(at, at + take), filled);
        filled += take;
        at += take;
        if (filled === rate) { // a second of sound: what is it?
          filled = 0;
          if (!this.light) this.hear(second, rate);
        }
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

  // the loudness, block by block: the beat's envelope, and claps (sharp knocks over the room's noise)
  blocks(chunk) {
    const now = performance.now();
    for (let i = 0; i + BLOCK <= chunk.length; i += BLOCK) {
      let s = 0;
      for (let j = i; j < i + BLOCK; j++) s += chunk[j] * chunk[j];
      const rms = Math.sqrt(s / BLOCK);
      this.envelope.push(rms);
      const sharp = rms > Math.max(0.07, this.bg * 6) && (this.lastRms ?? 0) < rms * 0.5;
      this.bg = this.bg * 0.995 + rms * 0.005;
      this.lastRms = rms;
      if (sharp) {
        const at = now + (i / BLOCK) * (1000 / this.blocksPerSecond);
        this.onsets = [...this.onsets.filter((t) => at - t < 2000), at];
        const [a, b, c] = this.onsets.slice(-3);
        // exactly two, a beat apart (a third right before them: it's music, or typing)
        const two = this.onsets.length >= 2 && b && at === (c ?? b) && (c ?? b) - (c ? b : a) >= CLAP_GAP[0] && (c ?? b) - (c ? b : a) <= CLAP_GAP[1]
          && !(c && b - a < 900);
        if (two) this.clapAt = at;
      }
    }
    const keep = Math.round(ENVELOPE_S * this.blocksPerSecond);
    if (this.envelope.length > keep) this.envelope.splice(0, this.envelope.length - keep);
  }

  hear(samples, rate) {
    if (this.light || this.looking) return; // light mode (light.js), or looking at your screen: no listening to the room (her name still works)
    let results;
    try {
      results = this.classifier.classify(samples, rate);
    } catch {
      return;
    }
    const cats = results.flatMap((r) => r.classifications?.[0]?.categories || []);
    // two claps just now, and it does sound like hands clapping (not music): she comes
    if (this.clapAt && performance.now() - this.clapAt < 1800) {
      const music = cats.some((c) => /^Music$/.test(c.categoryName) && c.score > 0.4);
      if (!music && cats.some((c) => CLAP_WORDS.test(c.categoryName) && c.score >= 0.15)) {
        this.clapAt = 0;
        this.onClap?.();
      }
    }
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
    return !c.busy && !c.hidden && !c.stowed && c.mode !== 'alert' && !this.guide?.running;
  }

  react(kind) {
    const every = (SOUNDS.find(([, k]) => k === kind)?.[3] || 10) * 60000;
    const now = Date.now();
    if (now - (this.said[kind] || 0) < every || !this.free()) return;
    // a film on (watch.js): its sounds aren't the room's; only what's really around you counts
    if (this.watch?.on && !['alarm', 'door', 'phone'].includes(kind)) {
      if (kind === 'bang') this.watch.startle();
      return undefined;
    }
    this.said[kind] = now;
    const c = this.capri;
    c.wake();
    if (kind === 'thunder') return this.emotions?.fear('storm');
    if (kind === 'music' || kind === 'sing') {
      // to the beat of it, if she can make it out
      const beat = kind === 'music' ? tempo(this.envelope || [], this.blocksPerSecond || 93.75) : null;
      if (beat && this.daily?.dance) this.daily.dance(beat.bpm);
      else this.daily?.dance();
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
