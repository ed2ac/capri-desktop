// Your hands and your body, through the camera (camera.js hands her each frame; on this PC, nothing
// sent). MediaPipe's gesture recognizer reads your hand:
//
//   a wave            she waves back (and wakes up for it)
//   palm held still   "stop": she stops what she's doing and stays put a while
//   thumbs up / down  she's pleased / she pouts
//   ✌️  🤟  👊        peace back, hearts, a fist bump
//   finger on lips    "shh": focus mode, half an hour of quiet
//
// And your head: she turns to face you when you move about (eye contact), and with your head down a
// long while without typing (your phone, probably), she teases you about it.
// Rock, paper, scissors: "jokenpô" in her chat, your hand in front of the camera.

import { fmt, pick, rand } from './util.js';

const BASE = new URL('../../../', import.meta.url).href;
const EVERY_MS = 400;          // a look at your hand
const HOLD_MS = 650;           // a gesture held this long counts
const AGAIN_MS = 20000;        // the same gesture answered again after this
const STOP_MS = 2 * 60000;     // "stop": she stays put this long
const PHONE_MS = 40000;        // head down this long, not typing…
const PHONE_AGAIN_MS = 30 * 60000;

export class Gestures {
  constructor({ capri, panel, brain, host, heart, voice, life, daily, chat, presence }) {
    Object.assign(this, { capri, panel, brain, host, heart, voice, life, daily, chat, presence });
    this.on = true;
    this.recognizer = null;
    this.loading = false;
    this.lastAt = 0;
    this.held = { name: null, since: 0 };
    this.said = {};
    this.wrist = [];            // recent wrist x for waves: [{ x, t }]
    this.pose = { base: null, downSince: 0, faceAt: 0 };
    this.game = null;           // rock, paper, scissors in progress
    this.latest = null;         // the last gesture seen (the game reads it): { name, at }
  }

  get t() {
    return this.brain.t.gesture;
  }

  configure({ gestures }) {
    this.on = gestures !== false;
  }

  async load(files, Vision) {
    if (this.recognizer || this.loading) return;
    this.loading = true;
    try {
      this.recognizer = await Vision.GestureRecognizer.createFromOptions(files, {
        baseOptions: { modelAssetPath: `${BASE}assets/mediapipe/gesture_recognizer.task`, delegate: 'CPU' },
        runningMode: 'VIDEO', numHands: 1,
      });
    } catch (err) {
      console.error('[capri] gesture model:', err);
    } finally {
      this.loading = false;
    }
  }

  // camera.js, each frame with a face: the video, the face's landmarks, its pose
  frame(video, face, pose, now = Date.now()) {
    if (!this.on || this.light) return; // light mode (light.js): no gestures
    if (pose) this.onPose(pose, face, now);
    if (!this.recognizer || now - this.lastAt < EVERY_MS || this.presence?.away) return;
    this.lastAt = now;
    let r;
    try {
      r = this.recognizer.recognizeForVideo(video, performance.now());
    } catch {
      return;
    }
    const g = r.gestures?.[0]?.[0];
    const hand = r.landmarks?.[0];
    const name = g && g.score > 0.6 && g.categoryName !== 'None' ? g.categoryName : null;
    if (hand) {
      this.wrist = [...this.wrist.filter((w) => now - w.t < 1500), { x: hand[0].x, t: now }];
    } else this.wrist = [];
    if (name) this.latest = { name, at: now };
    if (this.game) return; // her game reads the hand itself
    if (name === 'Open_Palm' && this.waving()) return this.answer('wave', now);
    if (name !== this.held.name) {
      this.held = { name, since: now };
      return undefined;
    }
    if (!name || now - this.held.since < HOLD_MS) return undefined;
    if (name === 'Pointing_Up' && this.nearMouth(hand, face)) return this.answer('shh', now);
    const kind = { Thumb_Up: 'thumbsUp', Thumb_Down: 'thumbsDown', Victory: 'peace', ILoveYou: 'love', Closed_Fist: 'fist', Open_Palm: 'stop' }[name];
    // "stop" is a palm held still a whole second (a wave starts as an open palm too)
    if (kind === 'stop' && (now - this.held.since < 1000 || !this.still())) return undefined;
    if (kind) this.answer(kind, now);
    return undefined;
  }

  // a wave: the wrist going side to side, at least three turns
  waving() {
    const xs = this.wrist.map((w) => w.x);
    if (xs.length < 4 || Math.max(...xs) - Math.min(...xs) < 0.05) return false;
    let turns = 0;
    let dir = 0;
    for (let i = 1; i < xs.length; i++) {
      const d = Math.sign(xs[i] - xs[i - 1]);
      if (d && dir && d !== dir) turns++;
      if (d) dir = d;
    }
    return turns >= 2;
  }

  // the hand hasn't moved this last second
  still() {
    const xs = this.wrist.map((w) => w.x);
    return xs.length >= 2 && Math.max(...xs) - Math.min(...xs) < 0.025;
  }

  // the index fingertip by your lips
  nearMouth(hand, face) {
    if (!hand || !face?.length) return false;
    const tip = hand[8];
    const lip = face[13] || face[0];
    return Math.hypot(tip.x - lip.x, tip.y - lip.y) < 0.09;
  }

  answer(kind, now) {
    if (now - (this.said[kind] || 0) < AGAIN_MS) return;
    this.said[kind] = now;
    this.held = { name: null, since: now };
    const c = this.capri;
    const t = this.t;
    const say = (line, face, body, hold = 3000) => {
      c.wake();
      if (body) c.perform(body, c.towardCenter());
      this.panel.say({ kind: 'info', face, line, hold });
    };
    const float = (s, n = 1) => {
      const h = c.head();
      for (let i = 0; i < n; i++) setTimeout(() => this.life?.float(s, h.x + rand(-30, 40), h.y - 30, 1600), i * 180);
    };
    if (kind === 'wave') { say(pick(t.wave), 'laugh', 'hop'); float('👋'); this.heart?.nudge('attention'); }
    else if (kind === 'thumbsUp') { say(pick(t.thumbsUp), 'smug', 'victory'); this.heart?.nudge('praise', 0.5); }
    else if (kind === 'thumbsDown') { say(pick(t.thumbsDown), 'aside', 'huff'); this.heart?.nudge('dislike'); }
    else if (kind === 'peace') { say(pick(t.peace), 'laugh', 'hop'); float('✌️'); }
    else if (kind === 'love') { say(pick(t.love), 'laugh', 'petted'); float('♥', 5); this.heart?.nudge('love'); }
    else if (kind === 'fist') { say(pick(t.fist), 'smug', 'point'); float('👊'); }
    else if (kind === 'stop') {
      // she stops and stays where she is a while
      c.endAct?.(false);
      c.nextMove = performance.now() + STOP_MS;
      c.nextGaze = performance.now() + STOP_MS;
      say(pick(t.stop), 'look', null, 2500);
    } else if (kind === 'shh') {
      const r = this.daily?.focusReply?.({ on: true, minutes: 30 });
      say(r?.line || pick(t.shh), 'aside', null, 3500);
    }
  }

  // ---- your head ----

  onPose({ pitch, yaw }, face, now) {
    const p = this.pose;
    p.faceAt = now;
    // where you usually hold your head (looking at the screen), learned slowly
    p.base = p.base == null ? pitch : p.base * 0.995 + pitch * 0.005;
    const down = Math.abs(pitch - p.base) > 16;
    if (!down) p.downSince = 0;
    else p.downSince = p.downSince || now;
    if (p.downSince && now - p.downSince > PHONE_MS && now - (this.said.phone || 0) > PHONE_AGAIN_MS) this.phone(now);
    // eye contact: she turns your way when you've moved (your face in the picture is mirrored)
    if (face?.length && now - (p.turnedAt || 0) > 2500) {
      const c = this.capri;
      // not with something of hers on screen (a question, a line): it'd move with her
      const showing = this.panel.visible || this.panel.current?.actions?.length || this.chat?.open;
      if (!showing && c.mode === 'idle' && !c.busy && !c.walking && !c.act && c.stance === 'stand') {
        const you = (1 - face[1].x) * (c.view?.w || window.innerWidth);
        const side = Math.sign(you - c.pos.x);
        if (side && side !== c.facing && Math.abs(you - c.pos.x) > 160) {
          c.facing = side;
          p.turnedAt = now;
        }
      }
    }
    void yaw;
  }

  async phone(now) {
    const idle = await this.host.pcIdle().catch(() => 0);
    if (idle < 30) return; // typing: it's the keyboard you're looking at
    this.said.phone = now;
    this.pose.downSince = 0;
    const focus = Boolean(this.daily?.focus);
    if (!focus && Math.random() < 0.5) return; // not always: she isn't your mum
    const c = this.capri;
    c.wake();
    c.perform('glare', c.towardCenter());
    this.panel.say({ kind: 'info', face: 'smug', line: pick(focus ? this.t.phoneFocus : this.t.phone), hold: 4000 });
  }

  // ---- rock, paper, scissors ----

  async rps() {
    if (this.game || !this.recognizer) return this.recognizer ? null : this.t.rpsNoCam;
    const t = this.t;
    const c = this.capri;
    this.game = { you: 0, me: 0 };
    const say = (line, face = 'look', hold = 1100) => this.panel.say({ kind: 'info', face, line, hold });
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    try {
      for (let round = 0; round < 3; round++) {
        for (const word of t.rpsCount) {
          c.perform('hop', c.towardCenter());
          say(word, 'smug', 900);
          await wait(750);
        }
        const go = Date.now();
        say(t.rpsGo, 'wide', 1500);
        await wait(1100);
        const seen = this.latest && this.latest.at >= go - 300 ? this.latest.name : null;
        const you = { Closed_Fist: 'rock', Open_Palm: 'paper', Victory: 'scissors' }[seen];
        if (!you) {
          say(pick(t.rpsNoHand), 'aside', 2500);
          await wait(2600);
          continue;
        }
        const me = pick(['rock', 'paper', 'scissors']);
        const beats = { rock: 'scissors', paper: 'rock', scissors: 'paper' };
        const result = you === me ? 'draw' : beats[you] === me ? 'lose' : 'win';
        if (result === 'lose') this.game.you++;
        if (result === 'win') this.game.me++;
        c.perform(result === 'win' ? 'victory' : result === 'lose' ? 'huff' : 'curious', c.towardCenter());
        say(fmt(pick(t[`rps_${result}`]), { you: t.rpsNames[you], me: t.rpsNames[me] }), result === 'win' ? 'smug' : result === 'lose' ? 'aside' : 'look', 2600);
        await wait(2800);
      }
      const { you, me } = this.game;
      return fmt(you > me ? t.rpsYouWon : me > you ? t.rpsIWon : t.rpsTie, { you, me });
    } finally {
      this.game = null;
    }
  }
}

// the head's pitch and yaw (degrees) from MediaPipe's facial transformation matrix (column-major 4x4)
export function headPose(m) {
  const d = m?.data || m;
  if (!d || d.length < 16) return null;
  const pitch = (Math.atan2(d[6], d[10]) * 180) / Math.PI;
  const yaw = (Math.asin(Math.max(-1, Math.min(1, -d[2]))) * 180) / Math.PI;
  return { pitch: pitch || 0, yaw: yaw || 0 };
}
