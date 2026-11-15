// What she knows about you, built up over time, and brought up when it fits.
//
// Learned without AI, from what she sees (and only what she already sees: her menu's settings):
//   music     the artists of the songs playing on your PC ("Comment on what I do" on)
//   games     the games you play and for how long (on the PC, and your PS5 if you connect it)
//   freeTime  what you spend your free time on, on the PC (not your work apps)
// Learned from your chats with her, by her local AI when a chat ends (never sent anywhere for it):
//   likes, dislikes, people, plans, projects, routine, fact (and "told": what you asked her to remember)
//
// Each thing has a weight (seen again: heavier) and fades if it isn't seen for a long while. Her chat
// gets the strongest ones and those related to what you just said; her comments a few; her
// conversations start from them sometimes; recommendations lean on them. You see all of it in her
// corner (Capri's corner › About you) and delete what you want. All of it on this PC, in her settings.

import { inLang } from './util.js';

const HALF_LIFE_DAYS = 45;
const MAX_ITEMS = 300;
const WORK_APPS = /code|visual studio|terminal|powershell|cmd|wsl|excel|word|powerpoint|outlook|teams|slack|notion|figma|postman|docker|idea|pycharm|webstorm|android studio|explorer|capri|claude|ollama|settings|configura/i;
const KINDS = ['told', 'likes', 'dislikes', 'people', 'plans', 'projects', 'routine', 'fact', 'music', 'games', 'freeTime'];

const norm = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

export class Memory {
  constructor({ brain, host, chat }) {
    Object.assign(this, { brain, host, chat });
    this.items = [];
    this.dirty = false;
    setInterval(() => this.flush(), 30000);
  }

  configure(cfg) {
    if (this.dirty) return; // her own changes, about to be saved
    const items = Array.isArray(cfg.profile) ? cfg.profile : [];
    // what you asked her to remember (custom.js), from before her memory was this
    const told = (cfg.memories || []).filter((m) => !items.some((i) => i.kind === 'told' && i.label === m));
    this.items = [...items, ...told.map((m) => this.make('told', m, m, 'you'))];
    if (told.length) this.dirty = true;
  }

  make(kind, key, label, source, weight = 1) {
    const now = Date.now();
    return { id: `${now.toString(36)}${Math.random().toString(36).slice(2, 6)}`, kind, key: norm(key), label: String(label).slice(0, 140), weight, first: now, last: now, source };
  }

  // something seen (again): heavier and fresher, or new
  observe(kind, key, label = key, { weight = 1, source = 'seen' } = {}) {
    if (!KINDS.includes(kind) || !norm(key)) return null;
    const k = norm(key);
    let item = this.items.find((i) => i.kind === kind && i.key === k);
    if (item) {
      item.weight = Math.min(10000, item.weight + weight);
      item.last = Date.now();
      if (label && kind !== 'music') item.label = String(label).slice(0, 140);
    } else {
      item = this.make(kind, key, label, source, weight);
      this.items.push(item);
      if (this.items.length > MAX_ITEMS) this.items = this.ranked().slice(0, MAX_ITEMS);
    }
    this.dirty = true;
    return item;
  }

  forget(id) {
    this.items = this.items.filter((i) => i.id !== id);
    this.dirty = true;
  }

  flush() {
    if (!this.dirty) return;
    this.dirty = false;
    this.host.setConfig({ profile: this.items, memories: this.items.filter((i) => i.kind === 'told').map((i) => i.label) });
  }

  score(i, now = Date.now()) {
    const days = (now - i.last) / 86400000;
    const base = i.kind === 'told' ? 1000 : i.kind === 'games' || i.kind === 'freeTime' ? Math.sqrt(i.weight) : i.weight;
    return base * 0.5 ** (days / HALF_LIFE_DAYS);
  }

  ranked(kind = null) {
    const now = Date.now();
    return this.items.filter((i) => !kind || i.kind === kind).sort((a, b) => this.score(b, now) - this.score(a, now));
  }

  // ---- what she sees ----

  song(m) {
    if (m?.artist) this.observe('music', m.artist, m.artist);
  }

  game(name, minutes = 0) {
    if (name) this.observe('games', name, name, { weight: Math.max(1, Math.round(minutes)) });
  }

  // a day of yours (activity.js): the apps of your free time, by minutes
  day(apps = {}) {
    for (const [app, m] of Object.entries(apps)) {
      if (m >= 15 && !WORK_APPS.test(app)) this.observe('freeTime', app, app, { weight: Math.round(m) });
    }
  }

  // a chat that just ended: what you said that's worth keeping, read by her local AI
  async fromChat(messages) {
    const said = messages.filter((m) => m.role === 'user').map((m) => String(m.content).slice(0, 300));
    if (said.length < 2 || !this.host.localSay) return [];
    const prompt = [
      'Here is what the user said in a chat with you. List only lasting things about THEM worth remembering: what they like or dislike (music, games, films, food, hobbies…), people in their life, their plans, projects, routines, important facts.',
      'Skip passing moods, questions, small talk and anything about you. If there is nothing, answer [].',
      'Answer ONLY with JSON: [{"kind": "likes|dislikes|people|plans|projects|routine|fact", "text": "short, about the user, in their language"}]',
      ...said.map((s) => `- "${s}"`),
    ].join('\n');
    const res = await this.host.localSay({ persona: 'You note down facts about a person, briefly and accurately. JSON only.', prompt, maxTokens: 260, temperature: 0.2 }).catch(() => null);
    const m = res?.ok && /\[[\s\S]*\]/.exec(res.text);
    if (!m) return [];
    let list;
    try { list = JSON.parse(m[0]); } catch { return []; }
    const kept = [];
    for (const f of Array.isArray(list) ? list.slice(0, 6) : []) {
      const text = String(f?.text || '').replace(/^(?:the user|o usuário|usuário|ele|ela)\s+/i, '').trim();
      if (!text || text.length > 140 || !KINDS.includes(f.kind) || !inLang(text, this.brain.lang)) continue;
      kept.push(this.observe(f.kind, text, text, { weight: 2, source: 'chat' }));
    }
    return kept.filter(Boolean);
  }

  // ---- what she brings up ----

  // the strongest things she knows, as lines for her prompts
  summary(max = 14) {
    const take = (kind, n) => this.ranked(kind).slice(0, n);
    const games = take('games', 5).map((g) => `${g.label}${g.weight >= 60 ? ` (~${Math.round(g.weight / 60)} h)` : ''}`);
    const lines = [
      [take('told', 8).map((i) => i.label), 'Things they asked you to remember'],
      [take('music', 6).map((i) => i.label), 'Artists they listen to (most first)'],
      [games, 'Games they play'],
      [take('freeTime', 5).map((i) => i.label), 'What they do in their free time on the PC'],
      [take('likes', 6).map((i) => i.label), 'They like'],
      [take('dislikes', 4).map((i) => i.label), 'They don\'t like'],
      [take('people', 4).map((i) => i.label), 'People in their life'],
      [[...take('plans', 3), ...take('projects', 3)].map((i) => i.label), 'Their plans and projects'],
      [[...take('routine', 3), ...take('fact', 4)].map((i) => i.label), 'About them'],
    ].filter(([v]) => v.length).map(([v, title]) => `${title}: ${v.join('; ')}`);
    return lines.slice(0, max);
  }

  // what she knows that relates to what you just said
  relevant(text, max = 5) {
    const words = new Set(norm(text).split(' ').filter((w) => w.length >= 4));
    if (!words.size) return [];
    return this.ranked().filter((i) => i.key.split(' ').some((w) => w.length >= 4 && words.has(w))).slice(0, max).map((i) => i.label);
  }

  // for her chat's persona
  persona() {
    const s = this.summary();
    if (!s.length) return '';
    return ['What you know about the user (from living with them; bring it up naturally when it fits, as callbacks or to recommend things; never recite the list):', ...s.map((l) => `- ${l}`),
      'When they ask for a recommendation (music, a game, a film, something to do), base it on their tastes above and say in a few words why it fits them.'].join('\n');
  }

  // a topic of theirs for a conversation she starts: { kind, label } or null
  topic() {
    const pool = this.ranked().filter((i) => ['games', 'music', 'likes', 'plans', 'projects', 'freeTime'].includes(i.kind)).slice(0, 12);
    return pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
  }

  // something she learned these last days, not checked with you yet: to ask "did I get it right?"
  toCheck() {
    const week = Date.now() - 7 * 86400000;
    return this.ranked().find((i) => !i.checked && i.first > week && i.kind !== 'told'
      && (['likes', 'dislikes', 'people', 'plans', 'projects', 'routine', 'fact'].includes(i.kind) || i.weight >= 60)) || null;
  }

  // your answer: right (kept, stronger), wrong (forgotten), or so-so (left as it is, not asked again)
  checked(id, verdict) {
    const i = this.items.find((x) => x.id === id);
    if (!i) return;
    if (verdict === 'wrong') return this.forget(id);
    i.checked = true;
    if (verdict === 'right') i.weight += 5;
    this.dirty = true;
  }

  // grouped, for her corner
  grouped() {
    return KINDS.map((kind) => ({ kind, items: this.ranked(kind) })).filter((g) => g.items.length);
  }
}

export const MEMORY_KINDS = KINDS;
