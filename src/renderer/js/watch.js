// Watching together. Something in full screen a while (a film, a series, a video; not a game, pc.js
// has those): she goes to a corner, out of the way, and watches with you. No lines over the picture,
// no wandering, no looking at your screen to comment; a loud bang in it and she flinches, now and then
// a little 🍿. When it's over (after a good while), she asks what you thought (and listens, converse.js).

import { pick, rand } from './util.js';

const SETTLE_MS = 20000;   // full screen this long: watching
const LONG_MS = 10 * 60000; // watched this long: worth asking about

export class Watch {
  constructor({ capri, panel, brain, look, play, life, voice }) {
    Object.assign(this, { capri, panel, brain, look, play, life, voice });
    this.on = false;
    this.since = 0;
    this.fullSince = 0;
    setInterval(() => this.popcorn(), 60000);
  }

  get t() {
    return this.brain.t.watch;
  }

  // the window in front covering the whole screen, and not a game
  fullscreen(data) {
    const { wins = [], fg, game, call } = data || {};
    if (game || call) return false;
    const w = wins.find((x) => x.id === fg);
    if (!w) return false;
    const dpr = window.devicePixelRatio || 1;
    const sw = window.screen.width * dpr;
    const sh = window.screen.height * dpr;
    return w.w >= sw - 4 && w.h >= sh - 4 && !w.max;
  }

  onWindows(data) {
    const now = Date.now();
    if (this.fullscreen(data)) {
      this.fullSince = this.fullSince || now;
      if (!this.on && now - this.fullSince > SETTLE_MS) this.start();
    } else {
      this.fullSince = 0;
      if (this.on) this.stop();
    }
  }

  start() {
    this.on = true;
    this.since = Date.now();
    for (const m of [this.look, this.play]) if (m) m.watching = true;
    if (this.life) this.life.watching = true;
    const c = this.capri;
    if (!c.busy) c.teleport(c.spot('chip'), { face: 1 }).then(() => c.perform('look', 1)).catch(() => {});
  }

  stop() {
    const watched = Date.now() - this.since;
    this.on = false;
    for (const m of [this.look, this.play]) if (m) m.watching = false;
    if (this.life) this.life.watching = false;
    if (watched > LONG_MS) {
      setTimeout(() => {
        const c = this.capri;
        c.wake();
        c.perform('stretch', c.towardCenter());
        this.panel.say({ kind: 'idle', face: 'look', line: pick(this.t.after), hold: 8000 });
      }, 2500);
    }
  }

  // a loud moment in it (hearing.js): a flinch, no words
  startle() {
    if (!this.on) return false;
    this.capri.perform('flinch', 1);
    return true;
  }

  popcorn() {
    if (!this.on || Math.random() > 0.15 || this.capri.busy) return;
    const h = this.capri.head();
    this.life?.float(pick(['🍿', '…', '!', '♥']), h.x + rand(10, 30), h.y - 20, 2200);
  }

  // what may be said while watching: what matters (an alarm, a reminder, Claude done), nothing chatty
  allows(msg) {
    if (!this.on) return true;
    return Boolean(msg.guide || msg.actions?.length || msg.chat || ['alert', 'remind', 'done', 'chat', 'error'].includes(msg.kind));
  }
}
