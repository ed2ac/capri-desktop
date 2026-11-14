// Her emotions, in her body, fed by everything (app.js passes them on):
// - fear: a threat Defender found, the battery about to die, a storm on the forecast. She flinches,
//   ducks to the edge of the screen and peeks out from there, and says what scared her.
// - pride: three wins of yours in a couple of hours (tests passing, a task done, a focus session, a
//   to-do ticked off, a game won): her victory sequence, "we did that".
// - shame: you said something sweet to her (in her chat) or petted her a long while: she turns away,
//   glitching, flustered, and her chat answers that way.
// - curiosity: an app she's never seen you use: she turns to it, leaning in (her comment, if she
//   comments on what you do, is about that).
// Each one feeds her heart too, and her chat knows how she feels (bond.js feelings).

import { fmt, tween, ease } from './util.js';

const PRAISE = /(?<![\p{L}])(?:linda|lindinha|fofa|fofinha|maravilhosa|incr[íi]vel|perfeita|te amo|amo voc[êe]|gosto (?:muito )?de voc[êe]|voc[êe] [ée] (?:demais|a melhor)|cute|adorable|beautiful|love you|you'?re (?:the best|amazing)|i like you|mignonne|je t['’]aime|t['’]es (?:la meilleure|g[ée]niale)|preciosa|guapa|te quiero|eres la mejor|милая|люблю тебя|ты лучшая)(?![\p{L}])/iu;
const THANKS = /(?<![\p{L}])(?:obrigad[oa]|valeu|vlw|brigad[oa]|thanks?|thank you|thx|merci|gracias|спасибо)(?![\p{L}])/iu;
const PRIDE_WINDOW = 2 * 3600 * 1000;
const SEEN = 'capri.seenApps.v1';

export class Emotions {
  constructor({ capri, panel, brain, voice, bond, heart, look }) {
    Object.assign(this, { capri, panel, brain, voice, bond, heart, look });
    this.wins = [];
    this.lastFear = 0;
    this.lastShy = 0;
    try {
      this.seen = new Set(JSON.parse(localStorage.getItem(SEEN) || '[]'));
    } catch {
      this.seen = new Set();
    }
    this.firstLook = this.seen.size === 0; // the first time: everything is new, nothing to wonder at
    if (this.firstLook) setTimeout(() => { this.firstLook = false; }, 30 * 60000);
  }

  get t() {
    return this.brain.t.emotion;
  }

  say(line, face, hold = 4500, kind = 'info') {
    this.panel.say({ kind, face, line, hold });
  }

  // ---- fear ----
  fear(why, vars = {}) {
    if (Date.now() - this.lastFear < 5 * 60000) return;
    this.lastFear = Date.now();
    this.bond.feel('scared', { why: this.t.why[why] || why });
    this.heart.nudge(why === 'threat' ? 'threat' : why === 'battery' ? 'lowBattery' : 'fail');
    const c = this.capri;
    c.wake();
    c.perform('flinch', c.towardCenter());
    this.voice.play('alert');
    this.say(fmt(this.brain.line(`emotion.fear.${why}`), vars), 'wide', 5500, why === 'threat' ? 'error' : 'info');
    // she ducks to the edge and peeks from there a while
    if (!c.busy && !c.stowed && c.peek) setTimeout(() => !c.busy && !c.stowed && c.peek(), 1800);
  }

  // ---- pride ----
  win(kind) {
    const now = Date.now();
    this.wins = [...this.wins.filter((w) => now - w.at < PRIDE_WINDOW), { kind, at: now }];
    if (this.wins.length < 3 || !this.look.free()) return;
    this.wins = [];
    this.bond.feel('proud');
    this.heart.nudge('focusDone');
    this.capri.celebrate?.({ onSpeak: () => this.say(this.brain.line('emotion.pride'), 'laugh', 6000, 'done') });
  }

  // ---- shame / thanks: what you say to her in her chat ----
  heard(text) {
    if (PRAISE.test(text)) {
      this.heart.nudge('praise');
      this.bond.feel('flattered');
      this.shy();
    } else if (THANKS.test(text)) {
      this.heart.nudge('thanks');
    }
  }

  // flustered: she turns away, glitching
  shy() {
    if (Date.now() - this.lastShy < 60000) return;
    this.lastShy = Date.now();
    const c = this.capri;
    c.perform('turn');
    tween(c.p, { glitch: 0.35, split: 2 }, 180, ease.out).then(() => tween(c.p, { glitch: 0, split: 0 }, 600, ease.inOut));
  }

  // ---- curiosity: an app she's never seen you use ----
  newApp(proc) {
    if (!proc || this.seen.has(proc)) return false;
    this.seen.add(proc);
    try {
      localStorage.setItem(SEEN, JSON.stringify([...this.seen].slice(-400)));
    } catch { /* in memory */ }
    if (this.firstLook) return false;
    if (this.look.free()) this.capri.perform('curious', this.capri.towardCenter());
    return true;
  }
}
