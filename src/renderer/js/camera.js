// Her eyes on you, through your camera (her menu › Camera, off until you turn it on).
//
// On this PC, all the time it's on: a small face model (MediaPipe's face landmarker, in her own
// window) watches a few times a second whether you're there, and your face: a smile (she smiles
// back), a yawn, your eyes falling shut, someone else in the picture. Nothing of it is kept or sent.
// Now and then (her menu › Look at me and comment) or when you ask ("look at me", "what's this?",
// "read this"), one picture goes to a vision model for her to say something about it: a free online
// one (Groq, or Gemini) if you gave her a key for it, her local one otherwise (main.js picks).
// The camera's light is on while she looks; she lets go of it during your calls (another app may
// need it) and when you turn it off.

import { fmt, rand, pick, inLang } from './util.js';
import { clean, mood } from './chat.js';

const BASE = new URL('../../../', import.meta.url).href;
const avg = (b, ...names) => names.reduce((s, n) => s + (b.find((c) => c.categoryName === n)?.score || 0), 0) / names.length;

export class Camera {
  constructor({ capri, panel, brain, host, chat, guide, voice, heart, bond, look }) {
    Object.assign(this, { capri, panel, brain, host, chat, guide, voice, heart, bond, look });
    this.on = false;
    this.lookOn = false;
    this.asked = false;
    this.paused = false;   // a call: the camera is the call's
    this.stream = null;
    this.landmarker = null;
    this.video = null;
    this.state = { present: false, seen: 0, gone: 0, smile: 0, yawn: 0, shut: 0, two: 0 };
    this.said = {};
    this.lookedAt = Date.now() - 60000; // turned on: a first look soon
  }

  get t() {
    return this.brain.t.camera;
  }

  configure({ cameraOn, cameraLook, cameraAsked, chatty, lockAway }) {
    this.lockAway = lockAway === true;
    // no clock: she looks when something happens (you're back, a smile, someone else) or when she
    // feels like it; only a breath between two looks (her menu › How talkative, minutes)
    this.floor = ({ low: 8, normal: 2, high: 1 }[chatty] || 2) * 60000;
    this.asked = Boolean(cameraAsked);
    this.lookOn = cameraLook === true;
    const on = cameraOn === true;
    if (on !== this.on) {
      this.on = on;
      if (on) this.start();
      else this.stop();
    }
  }

  // From her menu: on (she says what it means first) or off.
  async setOn(on) {
    if (!on) return this.host.setConfig({ cameraOn: false, cameraLook: false });
    if (!this.asked) {
      const where = await this.host.cameraWhere().catch(() => ({}));
      const quote = where.online ? fmt(this.t.what, { where: where.provider === 'groq' ? 'Groq' : 'Gemini' }) : this.t.whatLocal;
      let yes = false;
      await this.guide.scene(async () => {
        this.capri.perform('curious', this.capri.towardCenter());
        yes = (await this.guide.ask({ face: 'look', line: this.t.ask, quote, actions: [{ id: 'yes', label: this.t.yes, primary: true }, { id: 'no', label: this.t.no }] })) === 'yes';
      });
      if (!yes) return undefined;
    }
    await this.host.setConfig({ cameraOn: true, cameraAsked: true });
    this.panel.say({ kind: 'info', face: 'smug', line: this.t.on, hold: 3500 });
    return undefined;
  }

  // a call started or ended (app.js): the camera is the call's meanwhile
  pause(on) {
    this.paused = on;
    if (on) this.stop({ keep: true });
    else if (this.on) this.start();
  }

  async start() {
    if (this.stream || this.paused || !this.on) return;
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480, frameRate: 15 }, audio: false });
    } catch {
      this.panel.say({ kind: 'info', face: 'aside', line: this.t.noCam, hold: 5000 });
      return;
    }
    this.video = document.createElement('video');
    this.video.muted = true;
    this.video.playsInline = true;
    this.video.srcObject = this.stream;
    await this.video.play().catch(() => {});
    if (!this.landmarker) {
      try {
        const { FilesetResolver, FaceLandmarker } = await import(`${BASE}node_modules/@mediapipe/tasks-vision/vision_bundle.mjs`);
        const files = await FilesetResolver.forVisionTasks(`${BASE}node_modules/@mediapipe/tasks-vision/wasm`);
        this.landmarker = await FaceLandmarker.createFromOptions(files, {
          baseOptions: { modelAssetPath: `${BASE}assets/mediapipe/face_landmarker.task`, delegate: 'CPU' },
          runningMode: 'VIDEO', numFaces: 2, outputFaceBlendshapes: true,
        });
      } catch (err) {
        console.error('[capri] camera face model:', err);
      }
    }
    clearInterval(this.loop);
    this.loop = setInterval(() => this.frame(), 250);
  }

  stop({ keep = false } = {}) {
    clearInterval(this.loop);
    this.loop = null;
    this.stream?.getTracks().forEach((tr) => tr.stop());
    this.stream = null;
    if (this.video) this.video.srcObject = null;
    if (!keep) this.state.present = false;
  }

  // ---- what she sees of you, a few times a second (on this PC) ----

  frame() {
    if (!this.landmarker || !this.video || this.video.readyState < 2) return;
    let r;
    try {
      r = this.landmarker.detectForVideo(this.video, performance.now());
    } catch {
      return;
    }
    const now = Date.now();
    const s = this.state;
    const faces = r.faceLandmarks?.length || 0;
    const b = r.faceBlendshapes?.[0]?.categories || [];
    // there or not: a while without a face is gone, a while back is back
    if (faces) {
      s.seen = s.seen || now;
      if (!s.present && now - s.seen > 1500) {
        s.present = true;
        if (s.gone && now - s.gone > 3 * 60000) this.back(now - s.gone);
        s.gone = 0;
      }
    } else {
      s.seen = 0;
      if (s.present) {
        s.gone = s.gone || now;
        if (now - s.gone > 25000) s.present = false;
      }
    }
    const hold = (key, on, ms) => {
      if (!on) { s[key] = 0; return false; }
      s[key] = s[key] || now;
      return now - s[key] > ms;
    };
    // away a while, the PC idle too: locked (her menu, off by default)
    if (!faces && this.lockAway && s.gone && now - s.gone > 2 * 60000 && !s.locked) {
      s.locked = true;
      this.host.pcIdle().then((idle) => { if (idle >= 110) this.host.lockPc(); else s.locked = false; }).catch(() => {});
    }
    if (faces) s.locked = false;
    if (!faces) return;
    // posture: your face filling the picture (too close to the screen), or low in it (slouching)
    const pts = r.faceLandmarks[0] || [];
    if (pts.length) {
      const xs = pts.map((p) => p.x);
      const width = Math.max(...xs) - Math.min(...xs);
      const nose = pts[1]?.y ?? 0.5;
      if (hold('close', width > 0.5, 6000)) { s.close = now + 60000; this.react('close', 30 * 60000, 'wide'); }
      if (hold('slouch', nose > 0.72, 40000)) { s.slouch = now + 60000; this.react('slouch', 40 * 60000, 'look'); }
    }
    if (hold('smile', avg(b, 'mouthSmileLeft', 'mouthSmileRight') > 0.55, 1200)) { s.smile = now + 60000; this.react('smile', 10 * 60000, 'laugh'); }
    if (hold('yawn', avg(b, 'jawOpen') > 0.6, 1500)) { s.yawn = now + 60000; this.react('yawn', 30 * 60000, 'aside'); }
    if (hold('shut', avg(b, 'eyeBlinkLeft', 'eyeBlinkRight') > 0.6, 4000)) { s.shut = now + 60000; this.react('sleepy', 30 * 60000, 'look'); }
    if (hold('two', faces >= 2, 3000)) { s.two = now + 60000; this.react('visitor', 30 * 60000, 'wide'); }
    // a real look at you (her menu): when something just happened, or when she feels like it
    if (this.lookOn && s.present && !this.looking && !this.privacy && now - (this.lookedAt || 0) > (this.floor || 120000) && this.look.free()) {
      const happened = this.urgent && now - this.urgent < 20000;
      const boredom = this.heart?.boredom ?? 30;
      const urge = Math.random() < (0.0025 + boredom / 25000); // checked 4 times a second: about once a minute or two
      if (happened || urge) {
        this.urgent = 0;
        this.lookedAt = now;
        this.looking = true;
        this.lookNow().finally(() => { this.looking = false; });
      }
    }
  }

  free() {
    const c = this.capri;
    return !c.busy && !c.hidden && !c.stowed && c.mode !== 'alert' && !this.chat.open && !this.guide?.running;
  }

  react(kind, every, face) {
    const now = Date.now();
    this.urgent = now; // something to look at properly, soon
    if (!this.free() || now - (this.said[kind] || 0) < every) return;
    this.said[kind] = now;
    const c = this.capri;
    c.wake();
    c.perform(kind === 'smile' ? 'hop' : kind === 'visitor' ? 'curious' : 'look', c.towardCenter());
    if (kind === 'smile') this.heart?.nudge('attention');
    if (kind === 'yawn' || kind === 'sleepy') this.heart?.nudge('hot', 0.3);
    this.panel.say({ kind: 'info', face, line: this.brain.line(`camera.${kind}`), hold: 4000 });
  }

  back(ms) {
    if (!this.free() || Date.now() - (this.said.back || 0) < 20 * 60000) return;
    this.said.back = Date.now();
    this.capri.wake();
    this.capri.perform('hop', this.capri.towardCenter());
    this.heart?.nudge('attention');
    this.panel.say({ kind: 'info', face: 'grin', line: fmt(this.brain.line('camera.back'), { minutes: Math.round(ms / 60000) }), hold: 4000 });
  }

  // ---- a real look: one picture to her vision model ----

  snap() {
    if (!this.video || this.video.readyState < 2) return null;
    const canvas = document.createElement('canvas');
    canvas.width = this.video.videoWidth || 640;
    canvas.height = this.video.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1); // as in a mirror: as you see yourself
    ctx.drawImage(this.video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.82).split(',')[1];
  }

  // `ask`: what you asked ("what's this?", "read this"), or nothing for a look on her own
  async lookNow(ask = '') {
    const t = this.t;
    if (!this.on) return { line: t.notOn, face: 'look' };
    if (!this.stream) await this.start();
    await new Promise((r) => setTimeout(r, 600));
    const image = this.snap();
    if (!image) return { line: t.noCam, face: 'aside' };
    const reading = /l[êe]|ler|leia|escrito|read|text|texto|lis|lee/i.test(ask);
    const prompt = ask
      ? `This is the user seen through their webcam right now, and they asked you: "${ask}". ${reading ? 'Read out exactly what is written on what they are showing, then react to it.' : 'Answer them about what you see.'} In character, two or three sentences.`
      : 'This is the user seen through their webcam right now. React in character to one concrete thing you see (their expression, posture, what they hold or wear, the light, the room). One or two sentences, talking to them, never unkind about how they look.';
    if (!ask) this.capri.perform('curious', this.capri.towardCenter());
    const note = this.chat.languageNote();
    let res = await this.host.cameraLook({ image, persona: this.chat.lookPersona(), prompt: `${prompt}\n${note}` }).catch((err) => ({ ok: false, error: err.message }));
    if (res?.ok && !inLang(res.text, this.brain.lang)) {
      res = await this.host.cameraLook({ image, persona: this.chat.lookPersona(), prompt: `${note}\n${prompt}\n${note}` }).catch((err) => ({ ok: false, error: err.message }));
      if (res?.ok && !inLang(res.text, this.brain.lang) && !ask) return { line: '', face: 'look' };
    }
    if (!res?.ok) return { line: res?.code === 'novision' ? t.noVision : fmt(t.failed, { error: res?.error || '…' }), face: 'aside' };
    const line = clean(res.text).replace(/^["“«]\s*|\s*["”»]$/g, '');
    if (!ask && line && this.look.free()) this.panel.say({ kind: 'info', badge: this.brain.t.badges?.cam || 'CAM', face: mood(line), line, hold: Math.min(12000, 2500 + line.length * 55) });
    return { line, face: mood(line) };
  }
}

export const CAM_ASK = /olha (?:pra|para) mim|me olha|t[áa] me vendo|consegue me ver|me v[êe]|o que (?:é|e) isso(?: aqui)?|o que (?:eu )?t[ôo] segurando|l[êe] (?:isso|o que t[áa] escrito|esse papel)(?: aqui)?(?: na c[âa]mera)?|como (?:eu )?(?:t[ôo]|estou)(?: hoje)?\??$|look at me|can you see me|what(?:'s| is) this|what am i holding|read this|regarde-moi|tu me vois|qu['’]est-ce que c['’]est|mírame|me ves|qué es esto|посмотри на меня/i;

export { pick };
