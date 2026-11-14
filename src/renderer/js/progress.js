// What the two of you build up over time:
// - her games companion: after a game, "so, did you win?" (Won / Lost / Just playing): each game's
//   time, sessions, wins, losses and streak, and her reaction (and her heart) goes with it;
// - your week, in her words ("how was my week?", and on her own on Sunday evening): time on what,
//   games, focus, to-dos ticked off, tasks she did for you;
// - achievements: firsts and milestones (a first task, ten tasks, five focus sessions, a week in a
//   row together, five wins…), celebrated when they come, listed in her menu;
// - what she learns about you: once a day, from her diary and your chats, at most one thing she
//   thinks worth remembering ("you play on Thursday nights"), and she asks you first.
// All of it in her settings and her memory on this PC.

import { fmt, inLang } from './util.js';
import { clean, mood } from './chat.js';

const ACHIEVEMENTS = [
  ['firstTask', (s) => s.tasks >= 1], ['tasks10', (s) => s.tasks >= 10],
  ['focus5', (s) => s.focus >= 5], ['focus25', (s) => s.focus >= 25],
  ['todo10', (s) => s.todos >= 10], ['todo50', (s) => s.todos >= 50],
  ['streak7', (s) => s.streak >= 7], ['days30', (s) => s.days >= 30], ['days100', (s) => s.days >= 100],
  ['wins5', (s) => s.wins >= 5], ['found3', (s) => s.found >= 3], ['pets25', (s) => s.pets >= 25],
  ['reflex250', (s) => s.reflex > 0 && s.reflex < 250],
];

export class Progress {
  constructor({ capri, panel, brain, host, chat, guide, look, bond, heart, emotions, activity }) {
    Object.assign(this, { capri, panel, brain, host, chat, guide, look, bond, heart, emotions, activity });
    this.cfg = {};
    this.queue = [];
    setInterval(() => this.deliver(), 30000);
    setInterval(() => this.weekly(), 10 * 60000);
  }

  get t() {
    return this.brain.t.progress;
  }

  configure(cfg) {
    this.cfg = cfg;
  }

  count(key, n = 1) {
    const counts = { ...(this.cfg.counts || {}) };
    counts[key] = (counts[key] || 0) + n;
    this.cfg.counts = counts;
    this.host.setConfig({ counts });
    this.check();
  }

  // ---- achievements ----

  stats() {
    const c = this.cfg.counts || {};
    const games = Object.values(this.cfg.games || {});
    return {
      tasks: c.tasks || 0, focus: (this.cfg.focusLog || []).length, todos: (this.cfg.todos || []).filter((x) => x.done).length + (c.todosCleared || 0),
      streak: this.bond.data?.streak || 0, days: this.bond.data?.days || 0, wins: games.reduce((s, g) => s + (g.wins || 0), 0),
      found: c.found || 0, pets: c.pets || 0, reflex: this.cfg.reflexBest || 0,
    };
  }

  check() {
    const have = new Set((this.cfg.achievements || []).map((a) => a.id));
    const s = this.stats();
    for (const [id, test] of ACHIEVEMENTS) {
      if (have.has(id) || !test(s)) continue;
      const name = this.t.achievements[id] || id;
      this.cfg.achievements = [...(this.cfg.achievements || []), { id, name, at: Date.now() }];
      this.host.setConfig({ achievements: this.cfg.achievements });
      this.queue.push({ kind: 'achievement', name });
      return; // one at a time
    }
  }

  // ---- your games ----

  // a game just ended (pc.js, through app.js): she asks how it went, once she's back
  gameOver(name, ms) {
    if (!name || ms < 5 * 60000) return;
    this.queue.push({ kind: 'game', name, ms });
  }

  async askGame({ name, ms }) {
    const t = this.t;
    const games = { ...(this.cfg.games || {}) };
    const g = { minutes: 0, sessions: 0, wins: 0, losses: 0, streak: 0, ...(games[name] || {}) };
    g.minutes += Math.round(ms / 60000);
    g.sessions += 1;
    let picked = 'play';
    await this.guide.scene(async () => {
      this.capri.perform('curious', this.capri.towardCenter());
      picked = await this.guide.ask({ face: 'look', line: fmt(t.gameAsk, { game: name }), actions: [
        { id: 'win', label: t.won, primary: true }, { id: 'loss', label: t.lost }, { id: 'play', label: t.justPlaying },
      ] }) || 'play';
    });
    if (picked === 'win') {
      g.wins += 1;
      g.streak = g.streak > 0 ? g.streak + 1 : 1;
      this.heart.nudge('gameWin');
      this.emotions.win('game');
      this.capri.perform('hop', this.capri.towardCenter());
    } else if (picked === 'loss') {
      g.losses += 1;
      g.streak = g.streak < 0 ? g.streak - 1 : -1;
      this.heart.nudge('gameLoss');
    }
    games[name] = g;
    this.cfg.games = games;
    this.host.setConfig({ games });
    const key = picked === 'win' ? (g.streak >= 3 ? 'gameStreak' : 'gameWon') : picked === 'loss' ? (g.streak <= -3 ? 'gameBadRun' : 'gameLost') : 'gameJust';
    this.panel.say({ kind: 'info', face: picked === 'win' ? 'laugh' : picked === 'loss' ? 'aside' : 'smug', line: fmt(this.brain.line(`progress.${key}`), { game: name, streak: Math.abs(g.streak), wins: g.wins, sessions: g.sessions }), hold: 5000 });
    this.check();
  }

  // ---- your week ----

  week() {
    const days = this.activity.days || {};
    const since = Date.now() - 7 * 86400000;
    const apps = {};
    const notes = [];
    for (const [d, v] of Object.entries(days)) {
      if (new Date(d).getTime() < since - 86400000) continue;
      for (const [a, m] of Object.entries(v.apps || {})) apps[a] = (apps[a] || 0) + m;
      notes.push(...(v.notes || []).slice(-5));
    }
    const focus = (this.cfg.focusLog || []).filter((f) => f.at >= since);
    const todos = (this.cfg.todos || []).filter((x) => x.done && x.doneAt >= since);
    const games = Object.entries(apps).filter(([a]) => /\(game\)$/.test(a));
    return { apps, notes, focus, todos, games, tasks: (this.cfg.counts || {}).tasksWeek || 0 };
  }

  async weekReply() {
    const w = this.week();
    const top = Object.entries(w.apps).sort((a, b) => b[1] - a[1]).slice(0, 6);
    const lines = [
      `The user's last 7 days, as you saw them:`,
      ...top.map(([a, m]) => `- ${a}: ${Math.round(m / 60 * 10) / 10} h`),
      `- focus sessions: ${w.focus.length} (${w.focus.reduce((s, f) => s + f.minutes, 0)} min)`,
      `- to-dos ticked off: ${w.todos.length}`,
      ...w.notes.slice(-8).map((n) => `- ${n}`),
      'Give them their week in three or four short sentences, in character: the numbers that stand out, one compliment, one tease, one wish for next week. Plain text.',
      this.chat.languageNote(),
    ].join('\n');
    if (!top.length && !w.focus.length && !w.todos.length) return { line: this.t.weekEmpty, face: 'look' };
    const res = await this.host.localSay({ persona: this.chat.lookPersona(), prompt: lines, maxTokens: 260 }).catch(() => null);
    const numbers = fmt(this.t.weekNumbers, { hours: Math.round(Object.values(w.apps).reduce((s, m) => s + m, 0) / 60), focus: w.focus.length, todos: w.todos.length });
    const line = res?.ok && inLang(res.text, this.brain.lang) ? `${clean(res.text)}\n${numbers}` : numbers;
    return { line, face: res?.ok ? mood(line) : 'look' };
  }

  // Sunday evening, once: your week, on her own
  async weekly() {
    const now = new Date();
    const week = `${now.getFullYear()}-${Math.floor((now - new Date(now.getFullYear(), 0, 1)) / (7 * 86400000))}`;
    if (now.getDay() !== 0 || now.getHours() < 19 || this.cfg.weekSaid === week || !this.look.free()) return;
    this.cfg.weekSaid = week;
    this.host.setConfig({ weekSaid: week });
    const r = await this.weekReply();
    if (r.line && r.line !== this.t.weekEmpty) this.panel.say({ kind: 'info', face: r.face, line: r.line, hold: 16000 });
  }

  // ---- what she learns about you ----

  // once a day (after her diary): one thing worth remembering, if any, and she asks first
  async learn(dayData) {
    const today = new Date().toDateString();
    if (this.cfg.learnedDay === today) return;
    this.cfg.learnedDay = today;
    this.host.setConfig({ learnedDay: today });
    const known = this.cfg.memories || [];
    const said = (this.chat.history || []).filter((m) => m.role === 'user').slice(-20).map((m) => `- "${String(m.content).slice(0, 200)}"`);
    const prompt = [
      'From what you know of the user below, is there ONE lasting thing worth remembering about them (a habit, a taste, a routine, something important in their life)? Only if it is clearly supported.',
      'Already remembered (do not repeat):', ...known.map((k) => `- ${k}`),
      'What they did yesterday:', ...Object.entries(dayData?.apps || {}).slice(0, 8).map(([a, m]) => `- ${a}: ${Math.round(m)} min`), ...(dayData?.notes || []).slice(0, 10).map((n) => `- ${n}`),
      'What they told you lately:', ...said,
      `Answer with the fact alone, in a few words, as "the user …" in ${this.brain.lang === 'pt' ? 'Brazilian Portuguese' : 'the user\'s language'} (example: "joga Valorant às quintas à noite"), or with the single word NONE.`,
    ].join('\n');
    const res = await this.host.localSay({ persona: 'You note down facts about a person, briefly and accurately.', prompt, maxTokens: 60, temperature: 0.3 }).catch(() => null);
    const fact = res?.ok ? clean(res.text).replace(/^["“«-]\s*|\s*["”»]$/g, '').replace(/^(?:the user|o usuário|usuário)\s+/i, '').trim() : '';
    if (!fact || /^none\b/i.test(fact) || !inLang(fact, this.brain.lang) || fact.length > 120 || known.some((k) => k.toLowerCase() === fact.toLowerCase())) return;
    this.queue.push({ kind: 'learn', fact });
  }

  async askLearn({ fact }) {
    const t = this.t;
    let picked = 'no';
    await this.guide.scene(async () => {
      this.capri.perform('curious', this.capri.towardCenter());
      picked = await this.guide.ask({ face: 'look', line: fmt(t.learnAsk, { fact }), actions: [{ id: 'yes', label: t.learnYes, primary: true }, { id: 'no', label: t.learnNo }] }) || 'no';
    });
    if (picked !== 'yes') return;
    const memories = [...(this.cfg.memories || []), fact].slice(-40);
    this.cfg.memories = memories;
    await this.host.setConfig({ memories });
    this.panel.say({ kind: 'info', face: 'smug', line: t.learned, hold: 3000 });
  }

  // ---- one thing at a time, when she's free ----

  async deliver() {
    if (!this.queue.length || this.busy || !this.look.free()) return;
    const next = this.queue.shift();
    this.busy = true;
    try {
      if (next.kind === 'achievement') {
        this.capri.celebrate?.({ onSpeak: () => this.panel.say({ kind: 'done', badge: '★', face: 'laugh', line: fmt(this.t.unlocked, { name: next.name }), hold: 6000 }) });
      } else if (next.kind === 'game') await this.askGame(next);
      else if (next.kind === 'learn') await this.askLearn(next);
    } finally {
      this.busy = false;
    }
  }
}
