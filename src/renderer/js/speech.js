// Her voice, by her own AI (her menu › Lines by her AI, on by default when there's a model on this
// PC). Every moment she has written lines for (Claude done, an error, the battery, a jealous fit,
// being petted, a game…) gets a stock of fresh ones, made in the background by the local model with
// her written lines as examples of how she talks, in different tones. When the moment comes, a line
// from the stock goes out at once (nothing to wait for), and is never said again. No stock yet, no
// model, or a game holding the graphics card: her written lines, the last ones said left out.
// The stock is kept on this PC (localStorage), and lines older than a few days are dropped: she
// grows, her mood and how close you are change, and so does what she'd say.

import { pick, fmt, inLang } from './util.js';

const STOCK = 6;               // lines kept ready per moment
const LOW = 2;                 // fewer than that: make more
const MAX_AGE = 3 * 24 * 3600 * 1000;
const TICK = 12000;            // one batch at a time, when she's free
const STORE = 'capri.speech.v1';
const RECENT = 4;              // written lines: the last ones said are left out

// What each moment is, for her AI (her written lines show how she says it). {assistant} is the AI
// she watches (Claude Code, Codex…).
const MOMENTS = {
  hello: 'a new {assistant} session just started; you greet the user',
  resume: 'the user resumed an earlier {assistant} session',
  prompt: 'the user just gave {assistant} a new task',
  working: '{assistant} is busy on the task; you keep count of its actions',
  'thinking.hmm': '{assistant} has been thinking in silence for 40 seconds',
  'thinking.long': '{assistant} has been thinking for over two minutes; you reassure the user nothing is stuck',
  error: 'a command or tool {assistant} ran just failed',
  permission: '{assistant} needs the user\'s permission; you rush over to tell them',
  waiting: '{assistant} is waiting for the user\'s answer',
  reply: '{assistant} answered while the user was on another window; you bring them the answer',
  done: '{assistant} just finished the task; you celebrate',
  interrupted: 'the user just interrupted {assistant} mid-task',
  crashed: '{assistant} broke down mid-task and could not finish',
  compact: '{assistant} is compressing its memory to keep going',
  bye: 'the {assistant} session just ended',
  idle: 'nothing is going on; a random little remark to the user, about anything',
  online: 'you just came online on the user\'s desktop',
  'bond.missed': 'the user is back after days away; you missed them',
  'bond.back': 'the user just came back to their PC after a break; you\'re glad',
  'screens.hello': 'you just jumped to another monitor, following the user',
  'thrown.angry': 'the user threw you across the screen again, three times in a row; you\'re mad',
  'thrown.ledge': 'the user threw you and you caught a window\'s ledge',
  'thrown.feet': 'the user threw you and you landed on your feet',
  'thrown.again': 'the user threw you once more',
  'thrown.screen': 'the user threw you onto another monitor',
  'thrown.fun': 'the user threw you and you loved the ride',
  'thrown.ow': 'the user threw you and you crashed hard',
  'thrown.dodge': 'the user tries to grab you but you\'re still mad and dodge',
  'pet.high': 'the user is stroking your mane, and you love them',
  'pet.low': 'the user is stroking your mane; you don\'t know them that well yet',
  'pet.enough': 'the petting went on too long; that\'s enough',
  'remind.doneLine': 'the user just ticked off a reminder you gave them',
  'jealous.say': 'the user is on another AI ({rival}); you\'re jealous',
  'jealous.spared': 'you were about to close another AI\'s page and the user stopped you; you let it be, sulking',
  'jealous.closed': 'you just zapped another AI\'s page shut',
  'jealous.forgive': 'the user apologized; you forgive them, a little',
  'jealous.sulk': 'the user clicks you while you\'re sulking about another AI',
  'breaks.lines': 'the user has been at the PC for {time} without a real break; tell them to get up and drink water',
  'breaks.paused': 'the user took the break you told them to; welcome back',
  'pc.hot': 'the processor has been at full tilt for a while; you overheat',
  'pc.cool': 'the processor cooled down after you overheated',
  'pc.charging': 'the user plugged the laptop\'s charger in; you feel the power',
  'pc.unplugged': 'the user unplugged the laptop\'s charger',
  'pc.offline': 'the network just went down; you take the hit',
  'pc.online': 'the network is back',
  'pc.usb': 'a USB stick was plugged in; you dive into it',
  'pc.usbBack': 'you come back from the USB stick with your verdict',
  'pc.usbOut': 'the USB stick was pulled out',
  'pc.game': 'the user just started the game {game}; you put yourself away while they play',
  'pc.gameBack': 'the user just stopped playing {game}; you come back and ask how it went',
  'play.shoo': 'the user just waved their pointer at you fast to shoo you away; you dodge, a bit offended',
  'play.shooMad': 'the user shooed you away again and again; you\'re annoyed and promise payback',
  'play.poke': 'the user keeps clicking on you, poking you',
  'play.pokeMad': 'the user won\'t stop clicking on you; you threaten to zap them',
  'play.stare': 'the user\'s pointer has been resting on you, still, for a while',
  'play.tug': 'you just grabbed the user\'s mouse pointer and pulled it toward you, as a prank',
  'play.shake': 'you just stomped on the window you sit on and made it shake, as a prank',
  'play.blink': 'you just made the user\'s keyboard lights blink, as a prank',
  'play.bored': 'the user is at their PC but hasn\'t paid you any attention for an hour; you want some',
  'play.late': 'it\'s the middle of the night and the user is still at their PC; tell them to sleep',
  'play.back': 'you were annoyed with the user a while ago; now it has passed and you come back around',
  'daily.morning': 'the user just showed up at their PC in the morning; you say good morning',
  'daily.focusNag': 'the user is in focus mode but drifted to a video or a chat; call them back to work',
  'daily.focusDone': 'the user just finished {minutes} minutes of focus; you\'re proud of them',
  'daily.anniversary': 'today it\'s been {days} days since you and the user met',
  'emotion.fear.threat': 'Windows Defender just found a threat on the PC you live in; you\'re scared',
  'emotion.fear.battery': 'the laptop\'s battery is about to die and you with it; you\'re scared and beg for the charger',
  'emotion.fear.storm': 'a thunderstorm is on today\'s forecast; lightning scares you',
  'emotion.pride': 'the user just pulled off three wins in a row with you around; you\'re proud of the two of you',
  'play.hideStart': 'you\'re starting a game of hide and seek with the user: you go hide',
  'play.found': 'the user found you in hide and seek',
  'play.hideGiveUp': 'the user never came looking for you in hide and seek; you come out, a bit vexed',
  'play.tagStart': 'in a great mood, you dare the user to catch you with their pointer',
  'play.caught': 'the user caught you with their pointer, playing tag',
  'play.tagWin': 'the user couldn\'t catch you playing tag; you gloat',
  'progress.gameWon': 'the user just told you they won their game of {game}',
  'progress.gameStreak': 'the user won at {game} {streak} times in a row',
  'progress.gameLost': 'the user just told you they lost their game of {game}; you console or tease them',
  'progress.gameBadRun': 'the user lost at {game} {streak} times in a row; tell them to take a break',
  'progress.gameJust': 'the user played {game} just for fun, no winning or losing',
  'daily.eyes': 'the user has stared at the screen for 20 minutes; tell them to look at something far away for 20 seconds',
  'daily.limit': 'the user went over the daily limit they set for {target} ({minutes} minutes today); call them out',
  'daily.weather_cold': 'it is {temp} degrees in {city}; you are freezing',
  'daily.weather_hot': 'it is {temp} degrees in {city}; you are melting',
  'daily.weather_rain': 'it is raining in {city}',
  'daily.dance': 'a song is playing on the user\'s PC and you can\'t help dancing',
  'daily.dates.birthday': 'today is the user\'s birthday; wish them happy birthday',
  'daily.dates.halloween': 'today is Halloween',
  'daily.dates.christmas': 'it is Christmas',
  'daily.dates.newyear': 'it is New Year',
  'daily.dates.edgerunners': 'today is the anniversary of Cyberpunk: Edgerunners, your show',
  'play.reflexStart': 'you challenge the user to a reflex test: they must click you as soon as you flash',
  'play.reflexSlow': 'the user was too slow at your reflex test',
  'play.reflexEarly': 'the user clicked too early at your reflex test',
  'play.hug': 'the user is hugging you (holding their click on you)',
  'play.hugDown': 'the user is hugging you while you feel down; it helps',
  'senses.enter': 'the user just hammered the Enter key many times in a row',
  'senses.erasing': 'the user keeps typing and erasing, typing and erasing',
  'senses.typingFast': 'the user has been typing really fast for a while',
  'senses.longTyping': 'the user has been typing nonstop for half an hour; tell them to stretch their fingers',
  'senses.rageClick': 'the user is angrily clicking the same spot over and over; calm them down',
  'senses.desktop': 'the user minimized every window: the empty desktop is all yours',
  'senses.dizzy': 'the user is shaking their mouse pointer hard and you are getting dizzy watching it',
  'camera.back': 'you see the user come back to their desk through the camera after {minutes} minutes away',
  'camera.smile': 'you see the user smile through the camera; you smile back',
  'camera.yawn': 'you see the user yawn through the camera',
  'camera.sleepy': 'you see the user\'s eyes falling shut through the camera',
  'camera.close': 'through the camera you see the user\'s face way too close to the screen',
  'camera.slouch': 'through the camera you see the user slouching in their chair for a while',
  'camera.visitor': 'through the camera you see someone else next to the user',
  'life.clock': 'you look at the clock on the taskbar; it is {time}',
  'ear.laugh': 'you hear the user laughing in the room', 'ear.applause': 'you hear applause in the room; you take a bow',
  'ear.sneeze': 'you hear the user sneeze', 'ear.cough': 'you hear the user coughing',
  'ear.door': 'you hear the doorbell or a knock at the door', 'ear.alarm': 'you hear an alarm going off in the room',
  'ear.phone': 'you hear a phone ringing in the room', 'ear.dog': 'you hear a dog barking in the room',
  'ear.cat': 'you hear a cat meowing in the room', 'ear.cry': 'you hear someone crying in the room',
  'ear.bang': 'a loud bang in the room startled you', 'ear.sing': 'you hear the user singing',
  'ear.whistle': 'you hear the user whistling', 'ear.snore': 'you hear snoring in the room', 'ear.burp': 'you hear the user burp',
};

const placeholders = (text) => new Set(String(text).match(/\{\w+\}/g) || []);
const get = (obj, path) => path.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);

export class Speech {
  constructor({ brain, host, chat }) {
    Object.assign(this, { brain, host, chat });
    this.enabled = true;   // her menu › Lines by her AI
    this.paused = false;   // a game: the graphics card is the game's
    this.busy = false;
    this.unavailable = 0;  // no model on this PC: tried again later
    this.queue = [];
    this.recent = new Map(); // key -> written lines said lately
    this.stock = this.load();
    setInterval(() => this.tick(), TICK);
  }

  // where a moment's stock is kept: her language and the AI she watches change the lines
  slot(path) {
    return `${this.brain.lang}|${this.brain.assistant}|${path}`;
  }

  load() {
    try {
      const data = JSON.parse(localStorage.getItem(STORE) || '{}');
      const now = Date.now();
      // too old, or in another language than the slot's (her model slipped into English)
      for (const k of Object.keys(data)) data[k] = (data[k] || []).filter((l) => now - l.at < MAX_AGE && inLang(l.text, k.split('|')[0]));
      return data;
    } catch {
      return {};
    }
  }

  save() {
    try {
      localStorage.setItem(STORE, JSON.stringify(this.stock));
    } catch { /* full or blocked: the stock lives on in memory */ }
  }

  // A line for this moment (a path in her lines: 'done', 'pc.hot', 'thrown.ow'…), with its {placeholders}
  // as in her written ones: the caller fills them in.
  line(path) {
    const written = get(this.brain.t, path);
    if (!Array.isArray(written) || !written.length || typeof written[0] !== 'string') return Array.isArray(written) ? pick(written) : written;
    const slot = this.slot(path);
    const ready = this.stock[slot];
    if (this.enabled && ready?.length) {
      const { text } = ready.shift();
      this.save();
      if (ready.length < LOW) this.want(path);
      return text;
    }
    if (this.enabled && MOMENTS[path]) this.want(path);
    // her written lines, the last ones said left out
    const said = this.recent.get(slot) || [];
    const fresh = written.filter((l) => !said.includes(l));
    const text = pick(fresh.length ? fresh : written);
    this.recent.set(slot, [...said, text].slice(-Math.min(RECENT, written.length - 1)));
    return text;
  }

  want(path) {
    if (MOMENTS[path] && !this.queue.includes(path)) this.queue.push(path);
  }

  // all of them, little by little: the most frequent first
  prime() {
    for (const path of Object.keys(MOMENTS)) {
      if ((this.stock[this.slot(path)]?.length || 0) < LOW) this.want(path);
    }
  }

  async tick() {
    if (!this.enabled || this.paused || this.busy || !this.queue.length || Date.now() < this.unavailable) return;
    if (this.chat.open) return; // her chat may want the model
    const path = this.queue.shift();
    this.busy = true;
    try {
      await this.make(path);
    } finally {
      this.busy = false;
    }
  }

  async make(path) {
    const written = get(this.brain.t, path);
    if (!Array.isArray(written) || typeof written[0] !== 'string') return;
    const slot = this.slot(path);
    const have = this.stock[slot] || [];
    // placeholders she may use, and the ones every written line has (so the line still makes sense)
    const allowed = new Set(written.flatMap((l) => [...placeholders(l)]));
    const needed = [...allowed].filter((p) => written.every((l) => l.includes(p)));
    const moment = fmt(MOMENTS[path], { assistant: this.brain.name || 'Claude Code', rival: '{rival}', time: '{time}', game: '{game}' });
    const prompt = [
      `The moment: ${moment}.`,
      'Lines you have said at this moment before (your voice, your slang):',
      ...written.map((l) => `- ${l}`),
      `Write ${STOCK} new lines for this same moment, each one different in tone: teasing, proud, sleepy, chaotic, sweet, deadpan, dramatic, smug. Surprise the user, don't reuse the examples.`,
      'Rules: one line each, at most 18 words, plain text, no quotes, no numbering, no emoji, no markdown.',
      allowed.size
        ? `Keep these placeholders exactly as written (curly braces included), they get filled in later: ${[...allowed].join(' ')}.${needed.length ? ` Every line must contain ${needed.join(' and ')}.` : ''}`
        : 'Use no curly braces.',
      this.chat.languageNote(),
    ].join('\n');
    const res = await this.host.localSay({ persona: this.chat.lookPersona(), prompt, maxTokens: 360, temperature: 1.0 });
    if (!res?.ok) {
      if (res?.code === 'nolocal') this.unavailable = Date.now() + 10 * 60 * 1000; // no model here: later
      if (res?.code !== 'paused') this.queue.push(path); // try again another time
      return;
    }
    const seen = new Set([...written, ...have.map((l) => l.text)].map((l) => l.toLowerCase()));
    const fresh = String(res.text)
      .split('\n')
      .map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').replace(/^["“«]\s*|\s*["”»]$/g, '').trim())
      .filter((l) => l.length >= 3 && l.length <= 170 && !/[*#`]/.test(l))
      .filter((l) => [...placeholders(l)].every((p) => allowed.has(p)) && needed.every((p) => l.includes(p)))
      .filter((l) => !seen.has(l.toLowerCase()) && seen.add(l.toLowerCase()))
      .filter((l) => inLang(l, this.brain.lang));
    if (!fresh.length) return;
    const now = Date.now();
    this.stock[slot] = [...have, ...fresh.map((text) => ({ text, at: now }))].slice(-STOCK * 2);
    this.save();
  }
}
