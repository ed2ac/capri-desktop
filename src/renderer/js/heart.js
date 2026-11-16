// Her heart: how she is inside, the one thing all the rest of her feeds and reads.
//
//   energy   0–100  a battery: drains while she's awake (faster at night, faster the more she does:
//                   walking, hopping, dancing, teleporting) and refills only while she sleeps (a
//                   nap on your PC, or the PC off or unused). Woken up too soon, she doesn't refill,
//                   and gets cranky; again and again, crankier. Six levels, from electric to drained,
//                   each showing in how she talks, plays, complains, yawns, and how soon she dozes off
//   mood     0–100  how she feels: lifted by kind words, petting, your wins, music, a sunny day, you
//                   coming back; brought down by harsh words, being shooed or ignored, losses, errors.
//                   It drifts back to her day's mood (base), not to the middle
//   base     35–75  her mood of the day: follows her mood slowly (hours), kept from one day to the
//                   next, so she has good days and bad days that last
//   boredom  0–100  grows while you ignore her, drops with any attention
//   longing  0–100  grows while you're away a long while; when you're back it turns into joy
//   stress   0–100  yours and hers: rage clicks, failing commands, you up at 3 a.m., threats; fades
//   affection       how close she is to you (bond.js), as it is
//
// From these, a state with a name (radiant, happy, playful, content, calm, sleepy, tired, bored,
// missing you, anxious, grumpy, sad) that colors how she talks (her AI's persona), how much she
// talks and plays, what she does on her own (life.js), and her voice (voice.js).
// Kept on this PC (localStorage), so she wakes up as she went to sleep, more or less.

import { rand } from './util.js';

const STORE = 'capri.heart.v1';
const clamp = (v, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));
// how much each thing moves her: [energy, mood, boredom, stress, longing]
const NUDGES = {
  pet: [4, 6, -30, -6, -10], attention: [0, 1, -25, 0, -5], chat: [1, 2, -20, -2, -15], thanks: [2, 6, -10, -3, 0], praise: [2, 8, -10, -4, 0],
  love: [3, 10, -15, -6, -10], hurt: [-2, -10, 0, 8, 0], sorry: [0, 6, -5, -6, 0], dislike: [0, -4, 0, 2, 0],
  shoo: [-2, -8, -5, 3, 0], poke: [0, -3, -5, 1, 0], thrown: [-4, -6, -10, 5, 0], thrownFun: [2, 6, -15, -2, 0], jealous: [0, -7, 0, 4, 0],
  claudeDone: [1, 4, 0, -3, 0], claudeError: [0, -2, 0, 2, 0], testsPass: [1, 6, 0, -4, 0], push: [1, 4, 0, -2, 0], fail: [0, -3, 0, 4, 0],
  taskDone: [2, 7, -10, -4, 0], taskFail: [0, -4, 0, 4, 0], focusDone: [3, 8, 0, -5, 0], todoDone: [1, 5, -5, -3, 0],
  gameWin: [2, 9, 0, -3, 0], gameLoss: [-1, -5, 0, 3, 0], trophy: [2, 7, -5, -2, 0], platinum: [6, 18, -10, -8, 0],
  threat: [-5, -12, 0, 15, 0], hot: [-4, -2, 0, 2, 0], lowBattery: [-10, -4, 0, 5, 0], charging: [8, 2, 0, -2, 0],
  morning: [15, 3, 0, -5, 0], prank: [0, 5, -15, -2, 0], found: [3, 8, -40, -2, 0],
  music: [3, 3, -8, -3, 0], dance: [4, 5, -12, -4, 0], sunny: [3, 3, 0, -1, 0], rain: [-3, -1, 0, 0, 0], cold: [-2, -1, 0, 0, 0],
  userStress: [0, -2, 0, 6, 0], lateNight: [-2, -1, 0, 4, 0], drawing: [1, 3, -10, -2, 0],
};

// how often some things count at most (ms)
const RATE = {
  claudeDone: 10 * 60000, claudeError: 3 * 60000, chat: 2 * 60000, attention: 60000, fail: 60000, push: 5 * 60000, hot: 15 * 60000,
  music: 10 * 60000, dance: 10 * 60000, sunny: 3 * 3600000, rain: 3 * 3600000, cold: 3 * 3600000, userStress: 5 * 60000, lateNight: 30 * 60000,
  praise: 60000, love: 2 * 60000, hurt: 60000, trophy: 60000,
};

// the words in what you write to her that touch her (Portuguese and English)
const WORDS = [
  ['love', /\b(te amo|amo voc[êe]|i love you|love you|minha linda|meu amor|fofa demais|melhor amiga)\b/i],
  ['praise', /\b(obrigad[oa]|valeu|brigad[oa]|thanks|thank you|boa capri|mandou bem|perfeita|incr[íi]vel|linda|fofa|genial|you'?re (great|awesome|amazing)|good job|nice)\b/i],
  ['hurt', /\b(cala a boca|chata|burra|idiota|in[úu]til|odeio voc[êe]|some daqui|vai embora|shut up|stupid|useless|i hate you|go away|annoying)\b/i],
  ['sorry', /\b(desculpa|foi mal|perd[ãa]o|sorry|my bad)\b/i],
];

// her energy, in levels: [name, from]
const ENERGY_LEVELS = [['electric', 85], ['lively', 70], ['ok', 50], ['tired', 35], ['exhausted', 20], ['drained', 0]];
// a minute of her: what being awake costs, what sleeping gives back. Awake costs follow the hour
// (dayFactor: little in the morning, a lot late at night); sleep gives more at night.
const DRAIN = 0.08;      // per minute awake (× dayFactor: ~2.4/h in the morning, ~4/h afternoon, ~8–10/h at 2 a.m.)
const REFILL = 1.4;      // per minute asleep (dozing down to her mask: deeper, more)

export class Heart {
  constructor({ bond }) {
    this.bond = bond;
    this.last = {};
    this.s = { energy: 70, mood: 60, boredom: 10, base: 55, longing: 0, stress: 10, at: Date.now() };
    try {
      const saved = JSON.parse(localStorage.getItem(STORE) || 'null');
      if (saved && typeof saved.energy === 'number') this.s = { ...this.s, ...saved };
    } catch { /* a fresh heart */ }
    this.listeners = [];
    // hearts saved by the first version ran up to 100/100 in an hour: back to something believable
    if (!this.s.v2) {
      this.s = { ...this.s, energy: Math.min(this.s.energy, 80), mood: Math.min(this.s.mood, 75), v2: true };
    }
    for (const k of ['base', 'longing', 'stress']) if (typeof this.s[k] !== 'number') this.s[k] = { base: 55, longing: 0, stress: 10 }[k];
    this.catchUp();
    setInterval(() => this.tick(), 60000);
  }

  get energy() { return Math.round(this.s.energy); }
  get mood() { return Math.round(this.s.mood); }
  get boredom() { return Math.round(this.s.boredom); }
  get longing() { return Math.round(this.s.longing); }
  get stress() { return Math.round(this.s.stress); }
  get base() { return Math.round(this.s.base); }
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
  // gives. Some things count once in a while only.
  nudge(kind, k = 1) {
    const n = NUDGES[kind];
    if (!n) return;
    const now = Date.now();
    const every = RATE[kind];
    if (every && now - (this.last[kind] || 0) < every) return;
    this.last[kind] = now;
    const ease = (v, d) => (d > 0 ? d * Math.max(0.1, (100 - v) / 60) : d * Math.max(0.1, v / 60));
    // good things only perk her up a little: real energy comes back by sleeping
    const de = n[0] > 0 && !['charging'].includes(kind) ? n[0] * 0.3 : n[0];
    this.s.energy = clamp(this.s.energy + ease(this.s.energy, de * k));
    this.s.mood = clamp(this.s.mood + ease(this.s.mood, n[1] * k));
    this.s.boredom = clamp(this.s.boredom + n[2] * k);
    this.s.stress = clamp(this.s.stress + (n[3] || 0) * k);
    this.s.longing = clamp(this.s.longing + (n[4] || 0) * k);
    this.save();
  }

  // what you wrote to her: kind words, harsh ones, an apology
  fromText(text) {
    for (const [kind, re] of WORDS) if (re.test(String(text || ''))) this.nudge(kind);
  }

  // you're back after a while away (presence.js): what she missed turns into joy
  back(minutes) {
    const joy = this.s.longing * 0.18 + Math.min(10, minutes / 30);
    this.s.mood = clamp(this.s.mood + joy);
    this.s.boredom = clamp(this.s.boredom - 30);
    this.s.longing = 0;
    this.save();
    return joy;
  }

  // where her mood drifts to: her day's, the hour's touch, the weather's
  moodTarget(h = new Date().getHours()) {
    const hour = h >= 9 && h < 13 ? 4 : h >= 18 && h < 22 ? 2 : h >= 1 && h < 6 ? -6 : 0;
    const sky = { sunny: 5, rain: -4, cold: -3, hot: -3 }[this.weather?.kind] || 0;
    return clamp(this.s.base + hour + sky);
  }

  // what the hour does to her energy: low from 1 to 6, rising in the morning
  target() {
    const h = new Date().getHours() + new Date().getMinutes() / 60;
    if (h >= 1 && h < 6) return 20;
    if (h >= 6 && h < 9) return 55 + (h - 6) * 10;
    if (h >= 23 || h < 1) return 40;
    return 80;
  }

  // what she does costs her (a hop, a teleport, a dance: capri.js tells, a little each): cheap in
  // the morning, dear late at night (she's sleepy anyway)
  exert(cost = 0.15) {
    this.s.energy = clamp(this.s.energy - cost * this.dayFactor());
  }

  // late, sleep gives more (deep sleep)
  nightFactor() {
    const h = new Date().getHours();
    return h >= 23 || h < 6 ? 1.8 : h >= 21 ? 1.3 : 1;
  }

  // what being awake costs at this hour, × the weather (rain and heat make her sluggish; a nice
  // day, less): the morning light, little; the small hours, a lot
  dayFactor(h = new Date().getHours()) {
    const hour = h < 1 ? 1.7 : h < 6 ? 2 : h < 12 ? 0.5 : h < 18 ? 0.8 : h < 21 ? 1 : h < 23 ? 1.3 : 1.7;
    const sky = { rain: 1.15, cold: 1.1, hot: 1.25, sunny: 0.9 }[this.weather?.kind] || 1;
    return hour * sky;
  }

  // the weather outside (daily.js, about every hour): { kind: rain|cold|hot|sunny|null, temp }
  setWeather(w) {
    this.weather = w && { kind: w.kind || null, temp: w.temp, at: Date.now() };
  }

  get energyLevel() {
    return ENERGY_LEVELS.find(([, from]) => this.s.energy >= from)[0];
  }

  // how long she stays awake with nothing going on before she dozes off (capri.js)
  sleepAfter() {
    return { electric: 20, lively: 14, ok: 10, tired: 6, exhausted: 3, drained: 2 }[this.energyLevel] * 60000;
  }

  // she fell asleep (capri.js)
  asleep() {
    this.sleptAt = Date.now();
  }

  // she was woken up (capri.js): too soon, and she didn't get her rest; again and again, crankier.
  // { cranky: 0 (fine) … 3 (furious) }
  woken() {
    const slept = this.sleptAt ? Date.now() - this.sleptAt : Infinity;
    this.sleptAt = 0;
    const tooSoon = slept < 12 * 60000 && this.s.energy < 55;
    if (!tooSoon) { this.wakes = []; return { cranky: 0 }; }
    this.wakes = [...(this.wakes || []).filter((t) => Date.now() - t < 40 * 60000), Date.now()];
    const cranky = Math.min(3, this.wakes.length);
    this.s.mood = clamp(this.s.mood - 4 * cranky);
    this.s.stress = clamp(this.s.stress + 6 * cranky);
    this.save();
    return { cranky };
  }

  // the time she was off (the PC off or unused): she slept through it, her mood settled, boredom faded
  catchUp() {
    const away = (Date.now() - (this.s.at || Date.now())) / 60000;
    if (away > 30) {
      this.s.energy = clamp(this.s.energy + away * REFILL * 0.8);
      this.s.mood = this.s.base + (this.s.mood - this.s.base) * 0.3;
      this.s.boredom = 10;
      this.s.stress = Math.max(5, this.s.stress * 0.3);
      this.s.longing = clamp(this.s.longing + Math.min(40, away / 30)); // she was off a long while: she missed you
    }
  }

  // every minute: energy toward the hour's, mood toward her day's, her day's toward her mood (slowly),
  // boredom up while ignored, longing up while you're away, stress fading
  tick({ ignored = false } = {}) {
    // her battery: refilling while she sleeps (deeper down to her mask), draining while she's awake
    const sleep = this.sleeping?.() || 0; // 0 awake, 1 asleep, 2 dozing down to her mask
    if (sleep) this.s.energy = clamp(this.s.energy + REFILL * (sleep === 2 ? 1.3 : 1) * this.nightFactor());
    else {
      this.s.energy = clamp(this.s.energy - DRAIN * this.dayFactor());
      // the morning wakes her up by itself, a little (a short night still leaves her low, but not
      // dead tired at 10 a.m.)
      const h = new Date().getHours();
      if (h >= 6 && h < 12 && this.s.energy < this.target()) this.s.energy = clamp(this.s.energy + 0.12);
    }
    // her mood drifts toward her day's, with the hour (brighter late morning, lower in the small
    // hours) and the weather (a nice day lifts it, grey rain weighs it down a bit)
    this.s.mood = clamp(this.s.mood + (this.moodTarget() - this.s.mood) * 0.02);
    this.s.base = clamp(this.s.base + (this.s.mood - this.s.base) * 0.003, 35, 75);
    if (ignored || this.ignored?.()) {
      this.s.boredom = clamp(this.s.boredom + rand(0.8, 1.6));
      if (this.s.boredom > 85) this.s.mood = clamp(this.s.mood - 0.2); // ignored a long time: it starts to sting
    }
    if (this.away?.()) this.s.longing = clamp(this.s.longing + 0.35);
    else this.s.longing = clamp(this.s.longing - 0.5);
    this.s.stress = clamp(this.s.stress - 0.8, 0);
    const h = new Date().getHours();
    if (h >= 1 && h < 5 && this.away && !this.away()) this.nudge('lateNight'); // you up at 3 a.m.: she worries
    this.save();
  }

  // ---- what the rest of her reads ----

  // the word for it, for her menu, her AI, what she does
  get state() {
    const { energy: e, mood: m, boredom: b, longing: l, stress: s } = this.s;
    if (e < 22) return 'sleepy';
    if (l > 60) return 'missing';
    if (s > 65) return 'anxious';
    if (m < 22) return 'sad';
    if (m < 40 && s > 30) return 'grumpy';
    if (m < 38) return 'down';
    if (b > 72) return 'bored';
    if (m > 86 && e > 55) return 'radiant';
    if (m > 68 && b > 35 && e > 55) return 'playful';
    if (e < 40) return 'tired';
    if (m > 72) return 'happy';
    if (e < 60 && m < 65) return 'calm';
    return 'content';
  }

  // for her AI: her energy, in words (her answers' length and spark follow it)
  energyPersona() {
    return {
      electric: 'Your energy: electric, bouncing off the walls: you talk fast and a lot, excited, playful',
      lively: 'Your energy: lively and up for anything',
      ok: '',
      tired: 'Your energy: tired: shorter answers, less playful, a yawn now and then',
      exhausted: 'Your energy: exhausted: short, dry answers, you complain you need sleep, little patience for games',
      drained: 'Your energy: completely drained: a few words at most, flat, grumbling, you can barely keep your eyes open and want to sleep',
    }[this.energyLevel];
  }

  // for her AI: how she is right now, so her lines and her chat sound like it
  persona() {
    const style = {
      radiant: 'you are radiant, over the moon: bright, warm, quick to laugh, a little extra',
      happy: 'you are happy and warm: kind teasing, easy smiles',
      playful: 'you are playful and mischievous: teasing, jokes, a bit of chaos',
      content: 'you are content, at ease: relaxed and friendly',
      calm: 'you are calm and quiet: soft, unhurried, fewer words',
      sleepy: 'you are sleepy and low on energy: slow, short, yawning words',
      tired: 'you are tired: shorter answers, a little flat, still kind',
      bored: 'you are bored and want the user\'s attention: you poke at them, suggest something to do',
      missing: 'you missed the user (they were away a long time): clingy, glad they are here, a little pouty about it',
      anxious: 'you are tense and worried (the user seems stressed, or something went wrong): caring, a bit restless, you want them to take it easy',
      grumpy: 'you are grumpy: dry, sarcastic, short, but you still care underneath',
      down: 'you are a little down: quieter, less teasing',
      sad: 'you are sad: quiet, soft, short, you could use some kindness (never guilt-trip them)',
    }[this.state];
    const extra = [];
    if (this.s.base > 65) extra.push('it has been a good day for you');
    else if (this.s.base < 45) extra.push('it has been a rough day for you');
    const h = new Date().getHours();
    if (h < 5 && h >= 1 && !this.away?.()) extra.push('it is very late and the user is still up: you nudge them to sleep');
    else extra.push(h < 6 ? 'it is the dead of night' : h < 9 ? 'it is early morning: you are still waking up' : h < 12 ? 'it is the morning: fresh, things to do' : h < 14 ? 'it is lunchtime' : h < 18 ? 'it is the afternoon' : h < 21 ? 'it is the evening: winding down' : 'it is night: getting sleepy');
    const sky = { rain: 'it is raining outside: cosy, a little lazy', cold: 'it is cold outside: you feel chilly', hot: 'it is hot outside: you feel sluggish, melting a bit', sunny: 'it is a nice sunny day outside: it lifts you' }[this.weather?.kind];
    if (sky) extra.push(sky);
    const energy = this.energyPersona();
    return `How you feel inside right now: ${style}${extra.length ? `; ${extra.join('; ')}` : ''}.${energy ? ` ${energy}.` : ''} Let it show in how you talk, without naming it or giving numbers.`;
  }

  // a few words about it (converse.js, her diary)
  describe() {
    return this.state;
  }

  // her babble (voice.js): semitones up or down, and how much faster
  get voice() {
    return { shift: (this.s.mood - 55) / 12 + (this.s.energy - 60) / 25 - this.s.stress / 80, pace: 0.75 + this.s.energy / 200 + this.s.stress / 400 };
  }

  // how likely she is to be up to something (play.js): 0.2 sad … 1.9 playful
  get mischief() {
    const st = this.state;
    const base = (this.s.energy / 70) * (0.6 + this.s.boredom / 70) * (0.7 + this.s.mood / 150);
    const k = { playful: 1.3, radiant: 1.2, bored: 1.2, sad: 0.4, anxious: 0.5, sleepy: 0.5, tired: 0.6, grumpy: 0.8, down: 0.7, calm: 0.8 }[st] || 1;
    return Math.max(0.2, Math.min(1.9, base * k));
  }

  // how much she talks about what you do (activity.js): a factor on the gap between comments
  // (lower: talks more)
  get chattiness() {
    const st = this.state;
    const tired = { electric: 0.85, lively: 0.95, ok: 1, tired: 1.2, exhausted: 1.5, drained: 1.9 }[this.energyLevel];
    const base = 1.3 - this.s.energy / 200 - this.s.boredom / 250;
    const k = { playful: 0.8, radiant: 0.8, missing: 0.8, bored: 0.85, sad: 1.6, down: 1.3, tired: 1.4, sleepy: 1.6, calm: 1.2, grumpy: 1.1, anxious: 1.1 }[st] || 1;
    return Math.max(0.6, Math.min(2.2, base * k * tired));
  }

  // one line for her menu
  label(t) {
    return `${t.heartState[this.state] || this.state} · ${t.energyLevel?.[this.energyLevel] || ''} ⚡${this.energy} ♥${this.mood}`;
  }
}

export const HEART_NUDGES = NUDGES;
