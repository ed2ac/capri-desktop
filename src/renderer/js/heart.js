// Her heart: how she is inside, the one thing all the rest of her feeds and reads.
//
//   energy   0–100  the hour (low deep in the night, back up in the morning), your battery, the
//                   processor burning, petting and good news lift it, a long day wears it down
//   mood     0–100  your wins (tests passing, a task done, a game won, a focus session) and the
//                   kind things (petting, a thank-you) lift it; errors, being shooed, poked or
//                   thrown, other AIs, losses bring it down; it drifts back to the middle
//   boredom  0–100  grows while you ignore her, drops with any attention
//   affection       how close she is to you (bond.js), as it is
//
// What reads it: her AI's lines and her chat (persona), her babble's pitch and pace (voice.js),
// how often she pranks (play.js) and talks about what you do (activity.js), what she does on her
// own (dozing when drained, hopping when happy), and her emotions: fear, pride, shame, curiosity.
// Kept on this PC (localStorage), so she wakes up as she went to sleep, more or less.

import { rand } from './util.js';

const STORE = 'capri.heart.v1';
const clamp = (v) => Math.max(0, Math.min(100, v));
// how much each thing moves her: [energy, mood, boredom]
const NUDGES = {
  pet: [4, 6, -30], attention: [0, 1, -25], chat: [1, 2, -20], thanks: [2, 6, -10], praise: [2, 8, -10],
  shoo: [-2, -8, -5], poke: [0, -3, -5], thrown: [-4, -6, -10], thrownFun: [2, 6, -15], jealous: [0, -7, 0], sorry: [0, 6, -5],
  claudeDone: [1, 4, 0], claudeError: [0, -2, 0], testsPass: [1, 6, 0], push: [1, 4, 0], fail: [0, -3, 0],
  taskDone: [2, 7, -10], taskFail: [0, -4, 0], focusDone: [3, 8, 0], todoDone: [1, 5, -5],
  gameWin: [2, 9, 0], gameLoss: [-1, -5, 0], threat: [-5, -12, 0], hot: [-4, -2, 0], lowBattery: [-10, -4, 0],
  charging: [8, 2, 0], morning: [15, 3, 0], prank: [0, 5, -15], found: [3, 8, -40],
};

// how often some things count at most (ms)
const RATE = { claudeDone: 10 * 60000, claudeError: 3 * 60000, chat: 2 * 60000, attention: 60000, fail: 60000, push: 5 * 60000, hot: 15 * 60000 };

export class Heart {
  constructor({ bond }) {
    this.bond = bond;
    this.last = {};
    this.s = { energy: 70, mood: 60, boredom: 10, at: Date.now() };
    try {
      const saved = JSON.parse(localStorage.getItem(STORE) || 'null');
      if (saved && typeof saved.energy === 'number') this.s = { ...this.s, ...saved };
    } catch { /* a fresh heart */ }
    this.listeners = [];
    // hearts saved by the first version ran up to 100/100 in an hour: back to something believable
    if (!this.s.v2) {
      this.s = { ...this.s, energy: Math.min(this.s.energy, 80), mood: Math.min(this.s.mood, 75), v2: true };
    }
    this.catchUp();
    setInterval(() => this.tick(), 60000);
  }

  get energy() { return Math.round(this.s.energy); }
  get mood() { return Math.round(this.s.mood); }
  get boredom() { return Math.round(this.s.boredom); }
  get affection() { return this.bond?.percent ?? 0; }

  onChange(fn) {
    this.listeners.push(fn);
  }

  save() {
    this.s.at = Date.now();
    try {
      localStorage.setItem(STORE, JSON.stringify(this.s));
    } catch { /* in memory only */ }
    for (const fn of this.listeners) fn(this);
  }

  // Something happened (a key of NUDGES), `k` times as much. The nearer an edge, the less it moves
  // her (a tenth good thing in a row barely does), and her energy can't go far above what the hour
  // gives. Some things count once in a while only (Claude finishing, every few minutes when you work
  // with it all day).
  nudge(kind, k = 1) {
    const n = NUDGES[kind];
    if (!n) return;
    const now = Date.now();
    const every = RATE[kind];
    if (every && now - (this.last[kind] || 0) < every) return;
    this.last[kind] = now;
    const ease = (v, d) => (d > 0 ? d * Math.max(0.1, (100 - v) / 60) : d * Math.max(0.1, v / 60));
    const cap = Math.min(100, this.target() + 20);
    this.s.energy = Math.min(Math.max(cap, this.s.energy), clamp(this.s.energy + ease(this.s.energy, n[0] * k)));
    this.s.mood = clamp(this.s.mood + ease(this.s.mood, n[1] * k));
    this.s.boredom = clamp(this.s.boredom + n[2] * k);
    this.save();
  }

  // what the hour does to her energy: low from 1 to 6, rising in the morning
  target() {
    const h = new Date().getHours() + new Date().getMinutes() / 60;
    if (h >= 1 && h < 6) return 20;
    if (h >= 6 && h < 9) return 55 + (h - 6) * 10;
    if (h >= 23 || h < 1) return 40;
    return 80;
  }

  // the time she was off: her energy follows the hour, her mood settles, boredom fades
  catchUp() {
    const away = (Date.now() - (this.s.at || Date.now())) / 60000;
    if (away > 30) {
      this.s.energy = this.target();
      this.s.mood = 50 + (this.s.mood - 50) * 0.3;
      this.s.boredom = 10;
    }
  }

  // every minute: energy toward the hour's, mood back toward the middle, boredom up while ignored
  tick({ ignored = false } = {}) {
    const t = this.target();
    this.s.energy = clamp(this.s.energy + (t - this.s.energy) * 0.05);
    this.s.mood = clamp(this.s.mood + (55 - this.s.mood) * 0.02);
    if (ignored || this.ignored?.()) this.s.boredom = clamp(this.s.boredom + rand(0.8, 1.6));
    this.save();
  }

  // ---- what the rest of her reads ----

  // the word for it, for her menu and her AI
  get state() {
    if (this.s.energy < 25) return 'sleepy';
    if (this.s.mood < 25) return 'down';
    if (this.s.boredom > 70) return 'bored';
    if (this.s.mood > 78) return 'great';
    if (this.s.energy > 75 && this.s.mood > 60) return 'lively';
    return 'fine';
  }

  // for her AI: how she is right now, so her lines and her chat sound like it
  persona() {
    const e = this.s.energy, m = this.s.mood, b = this.s.boredom;
    const parts = [];
    if (e < 25) parts.push('you are sleepy and low on energy: slower, shorter, yawning words');
    else if (e > 80) parts.push('you are full of energy');
    if (m < 25) parts.push('you are in a bad mood, a bit gloomy');
    else if (m < 40) parts.push('you are a little down');
    else if (m > 80) parts.push('you are in a great mood, playful and bright');
    if (b > 70) parts.push('you are bored and want the user\'s attention');
    return parts.length ? `How you feel inside right now: ${parts.join('; ')}. Let it show, without saying these numbers.` : '';
  }

  // her babble (voice.js): semitones up or down, and how much faster
  get voice() {
    return { shift: (this.s.mood - 55) / 12 + (this.s.energy - 60) / 25, pace: 0.75 + this.s.energy / 200 };
  }

  // how likely she is to be up to something (play.js): 0.3 drained … 1.8 bored and lively
  get mischief() {
    return Math.max(0.3, Math.min(1.8, (this.s.energy / 70) * (0.6 + this.s.boredom / 70) * (0.7 + this.s.mood / 150)));
  }

  // how much she talks about what you do (activity.js): a factor on the gap between comments
  get chattiness() {
    return Math.max(0.6, Math.min(1.8, 1.3 - this.s.energy / 200 - this.s.boredom / 250));
  }

  // one line for her menu
  label(t) {
    return `${t.heartState[this.state] || this.state} · ⚡${this.energy} ♥${this.mood}`;
  }
}
