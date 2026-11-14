// She follows what you do on your PC and talks about it (her menu › Comment on what I do, off until
// you turn it on). No picture: the program in front and its window's title (windows.ps1 sends them
// only while this is on; windows.js drops the titles of banks, password managers, private browsing
// and sign-in or payment pages before they get here). From the title she tells a search from a video,
// a song, a chat, work or a game, keeps a short timeline of it, and now and then hands it to her
// local AI (on this PC only, whatever her chat runs on) for a sentence or two in character.
// She also keeps a little of each day (how long on what, what you searched, watched, played) and,
// the next day, writes her diary of it: her chat remembers your last days. All of it on this PC.

import { fmt, rand, inLang, scrub } from './util.js';
import { clean, mood } from './chat.js';

const FIRST_AFTER = 90 * 1000;            // turned on: not right away
const ACTIVE_MS = 90 * 1000;              // only when you're there (the pointer moved lately)
const KEEP = 10;                          // what she keeps of the timeline
const LONG = 45 * 60 * 1000;              // this long on the same app: worth a word on its own
// how often she talks about it, her menu › How talkative: minutes between two comments
const GAPS = { low: [10, 20], normal: [3, 8], high: [0.7, 2.5] };
// what kind of thing it is, how long before it's worth a word, and how long before the same kind again
const KINDS = {
  search: { dwell: 15000, again: 15 * 60000 },
  video: { dwell: 60000, again: 25 * 60000 },
  music: { dwell: 30000, again: 30 * 60000 },
  chat: { dwell: 2 * 60000, again: 60 * 60000 },
  work: { dwell: 3 * 60000, again: 50 * 60000 },
  app: { dwell: 2 * 60000, again: 40 * 60000 },
};
// what's never "what you're doing": her, Windows' own pieces, the desktop
const IGNORE = /^(?:capri|electron|explorer|searchhost|searchapp|startmenuexperiencehost|shellexperiencehost|textinputhost|applicationframehost|lockapp|systemsettings|taskmgr|rundll32|dllhost|openwith|pickerhost|windowsterminal)$/i;
const NAMES = {
  code: 'VS Code', cursor: 'Cursor', chrome: 'Chrome', msedge: 'Edge', firefox: 'Firefox', brave: 'Brave', opera: 'Opera',
  vivaldi: 'Vivaldi', spotify: 'Spotify', discord: 'Discord', whatsapp: 'WhatsApp', telegram: 'Telegram', slack: 'Slack',
  teams: 'Teams', 'ms-teams': 'Teams', winword: 'Word', excel: 'Excel', powerpnt: 'PowerPoint', outlook: 'Outlook',
  olk: 'Outlook', onenote: 'OneNote', notepad: 'Notepad', obs64: 'OBS', steam: 'Steam', epicgameslauncher: 'Epic Games',
  photoshop: 'Photoshop', afterfx: 'After Effects', blender: 'Blender', figma: 'Figma', notion: 'Notion', obsidian: 'Obsidian',
  vlc: 'VLC', zoom: 'Zoom', idea64: 'IntelliJ', pycharm64: 'PyCharm', devenv: 'Visual Studio',
};
const nameOf = (proc) => NAMES[proc] || proc.replace(/(^|\s)\w/g, (c) => c.toUpperCase());
const minutes = (ms) => Math.max(1, Math.round(ms / 60000));
const dayOf = (t = Date.now()) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const BROWSER = /^(?:chrome|msedge|firefox|brave|opera|vivaldi|arc|zen)$/;
const SITE_TAIL = /\s+[-–—|]\s+(?:Google Chrome|Microsoft? Edge|Mozilla Firefox|Brave|Opera|Vivaldi|Perfil \d+|Profile \d+|Pessoal|Personal)\s*$/i;

// What the window in front is: { kind, what, where }
export function classify(proc, title) {
  let t = title;
  for (let i = 0; i < 3; i++) t = t.replace(SITE_TAIL, ''); // "… - Google Chrome", "… - Pessoal - Microsoft Edge"
  let m;
  if ((m = /^(.+?)\s+[-–—]\s+(Pesquisa Google|Google Search|Buscar con Google|Recherche Google|Поиск в Google|Pesquisar|Bing|Search)$/i.exec(t))) {
    return { kind: 'search', what: m[1], where: /google/i.test(m[2]) ? 'Google' : 'Bing' };
  }
  if ((m = /^(.+?)\s+(?:at|em|en|sur)\s+DuckDuckGo$/i.exec(t))) return { kind: 'search', what: m[1], where: 'DuckDuckGo' };
  if ((m = /^(?:\(\d+\)\s*)?(.+?)\s+[-–—]\s+YouTube Music$/i.exec(t))) return { kind: 'music', what: m[1], where: 'YouTube Music' };
  if ((m = /^(?:\(\d+\)\s*)?(.+?)\s+[-–—]\s+YouTube$/i.exec(t))) return { kind: 'video', what: m[1], where: 'YouTube' };
  if ((m = /^(.+?)\s+[-–—|]\s+(Netflix|Prime Video|Disney\+|Max|Twitch|Crunchyroll|Globoplay)$/i.exec(t))) return { kind: 'video', what: m[1], where: m[2] };
  if (proc === 'spotify') {
    if (/^spotify(?: premium| free)?$/i.test(t)) return { kind: 'app', what: '', where: 'Spotify' };
    return { kind: 'music', what: t, where: 'Spotify' };
  }
  if (/^(?:whatsapp|telegram|discord|signal|messenger)$/.test(proc) || /WhatsApp|Telegram Web|Discord/.test(t)) {
    // the chat's name only, never a message (their titles don't have any)
    return { kind: 'chat', what: t.replace(/^\(\d+\)\s*/, ''), where: nameOf(proc) };
  }
  if (/^(?:ms-teams|teams|slack|outlook|olk|zoom|winword|excel|powerpnt|onenote|notion)$/.test(proc) || /Microsoft Teams|Outlook|Google Docs|Planilhas Google|Google Sheets/.test(t)) {
    return { kind: 'work', what: t, where: nameOf(proc) };
  }
  if (BROWSER.test(proc)) return { kind: 'app', what: t, where: `${nameOf(proc)} (a website)` };
  return { kind: 'app', what: t, where: nameOf(proc) };
}

const PROMPT = [
  'What the user has been doing on their PC lately, oldest first (kind — where — what — time on it):',
  '{timeline}',
  'Right now: {now}.',
  '{why}',
  'React in character to what they are doing right now. Pick one concrete detail (the search, the song, the video, the chat, the game, the file) and have an opinion about it: curious, playful, teasing, impressed, worried, jealous — whatever Capri would really feel. You can ask them something.',
  'One or two short sentences, talking to them. Don\'t list what they did, don\'t read titles out whole, don\'t make anything up, never quote a private chat\'s name back mockingly.',
].join('\n');

export class Activity {
  constructor({ capri, panel, brain, chat, guide, host, look, active }) {
    Object.assign(this, { capri, panel, brain, chat, guide, host, look });
    this.active = active; // () => ms since the pointer last moved
    this.auto = false;    // her menu: Comment on what I do
    this.asked = false;   // you've been told what it means, and said yes
    this.gaps = GAPS.normal;
    this.busy = false;
    this.now = null;      // what's in front: { proc, title, kind, what, where, private, since }
    this.past = [];       // what was before: [{ kind, where, what, ms }]
    this.nextAt = 0;
    this.saidAt = new Map(); // kind or proc -> when she last talked about it
    this.events = [];     // a game played, a call: { kind, what, ms, at }, said once she's back
    this.days = {};       // { 'YYYY-MM-DD': { apps: { name: minutes }, notes: [] } }
    this.diary = {};      // { 'YYYY-MM-DD': her entry }
    this.dirty = false;
    host.daysGet().then(({ days = {}, diary = {} } = {}) => {
      this.days = { ...days, ...this.days };
      // what a small model once made up stays out of what she keeps (and rereads)
      const clean2 = Object.fromEntries(Object.entries(diary).map(([d, t]) => [d, scrub(t)]));
      const changed = Object.keys(clean2).some((d) => clean2[d] !== diary[d]);
      this.diary = clean2;
      if (changed) this.host.daysSave({ diary: clean2 });
      this.remember();
      setTimeout(() => this.writeDiary(), 2 * 60 * 1000);
    }).catch(() => {});
    setInterval(() => this.tick(), 15000);
    setInterval(() => this.flush(), 5 * 60 * 1000);
    setInterval(() => this.writeDiary(), 60 * 60 * 1000);
  }

  get t() {
    return this.brain.t.activity;
  }

  configure({ watchActivity, activityAsked, chatty }) {
    const on = Boolean(watchActivity);
    if (on && !this.auto) this.nextAt = Date.now() + FIRST_AFTER;
    if (!on) {
      this.now = null;
      this.past = [];
      this.chat.doing = '';
    }
    this.auto = on;
    this.asked = Boolean(activityAsked);
    this.gaps = GAPS[chatty] || GAPS.normal;
  }

  // What it means (what goes where), before the first time. True if you said yes.
  async ask() {
    const where = await this.host.lookWhere().catch(() => ({}));
    const t = this.t;
    let yes = false;
    await this.guide.scene(async () => {
      this.capri.perform('curious', this.capri.towardCenter());
      const id = await this.guide.ask({
        face: 'look',
        line: t.ask,
        quote: fmt(t.local, { model: where.model || '…' }),
        actions: [{ id: 'yes', label: t.yes, primary: true }, { id: 'no', label: t.no }],
      });
      yes = id === 'yes';
    });
    if (yes) {
      this.asked = true;
      await this.host.setConfig({ activityAsked: true, watchActivity: true });
    }
    return yes;
  }

  // From her menu: on (she asks first, the first time) or off.
  async setAuto(on) {
    if (!on) {
      this.host.setConfig({ watchActivity: false });
      return;
    }
    if (!this.asked && !(await this.ask())) return;
    await this.host.setConfig({ watchActivity: true });
    this.panel.say({ kind: 'info', face: 'smug', line: this.t.on, hold: 3500 });
  }

  // ---- what you do ----

  // The window in front, as windows.js sends it while this is on.
  onWindows({ app, game }) {
    if (!this.auto || !app || game) return; // a game: pc.js has it, and she leaves you to it
    if (this.privacy) return; // someone else at your PC: their doings aren't yours to keep
    const proc = String(app.proc || '').toLowerCase();
    const title = String(app.title || '').trim();
    if (!proc || IGNORE.test(proc) || (!title && !app.private)) return;
    const cur = this.now;
    if (cur && cur.proc === proc && cur.title === title) return;
    const at = Date.now();
    // leaving an app you were on for 20 minutes or more: her take on that whole session (like her
    // review of Claude's work), once you've moved on
    if (cur && cur.proc !== proc && !cur.private) {
      const run = this.onApp(at);
      if (run >= 20 * 60000) {
        const titles = [...new Set([...this.past.filter((p) => p.proc === cur.proc).map((p) => p.what), cur.what].filter(Boolean))].slice(-6);
        this.events.push({ kind: 'session', what: cur.where, ms: run, titles, at });
      }
    }
    if (cur) this.close(cur, at - cur.since);
    const kind = app.private ? { kind: 'private', what: '', where: nameOf(proc) } : classify(proc, title);
    this.now = { proc, title, private: Boolean(app.private), since: at, ...kind };
    // an app she's never seen you use: she's curious (emotions.js), and it's something to talk about
    if (!app.private && this.emotions?.newApp(proc)) this.events.push({ kind: 'newapp', what: this.now.where, at });
    this.chat.doing = this.now.private ? '' : this.describe(this.now, 0, { brief: true });
  }

  // what you were on, into the timeline and today's log (a glance through it doesn't count)
  close(cur, ms) {
    if (ms < 15000 || cur.private) return;
    const last = this.past[this.past.length - 1];
    if (last && last.proc === cur.proc && last.what === cur.what) last.ms += ms;
    else this.past.push({ proc: cur.proc, kind: cur.kind, where: cur.where, what: cur.what, ms });
    if (this.past.length > KEEP) this.past.shift();
    this.log(cur, ms);
  }

  // A game played (pc.js): something to talk about once she's back, and for the diary.
  onGame(name, on, ms = 0) {
    if (on || !name) return;
    this.log({ kind: 'game', where: name, what: name }, ms);
    if (this.auto && ms >= 5 * 60000) this.events.push({ kind: 'game', what: name, ms, at: Date.now() });
  }

  // A call over (app.js): she was quiet all along, now she can ask how it went.
  onCall(app, on, ms = 0) {
    if (on || !app) return;
    this.log({ kind: 'call', where: nameOf(app), what: '' }, ms);
    if (this.auto && ms >= 3 * 60000) this.events.push({ kind: 'call', what: nameOf(app), ms, at: Date.now() });
  }

  describe(e, ms, { brief = false } = {}) {
    const what = e.what && e.what !== e.where ? ` — ${e.what.slice(0, 90)}` : '';
    return `${e.kind} — ${e.where}${what}${brief ? '' : ` — ${minutes(ms)} min`}`;
  }

  // how long you've been on this app in a row, its titles changing or not (tabs, files, songs)
  onApp(at) {
    const cur = this.now;
    let ms = at - cur.since;
    for (let i = this.past.length - 1; i >= 0 && this.past[i].proc === cur.proc; i--) ms += this.past[i].ms;
    return ms;
  }

  // a song that started playing (daily.js, from Windows' media controls): kept for the day, and now
  // and then something to say about it
  onSong(m) {
    if (!this.auto) return;
    const what = m.artist ? `${m.artist} - ${m.title}` : m.title;
    this.log({ kind: 'music', where: 'music', what }, 0);
    const at = Date.now();
    if (at - (this.saidAt.get('song') || -Infinity) < 30 * 60000 || Math.random() < 0.5) return;
    this.saidAt.set('song', at);
    this.events.push({ kind: 'song', what, at });
  }

  tick() {
    if (!this.auto || !this.asked || this.busy || this.quiet) return; // quiet: focus mode (daily.js)
    if (this.obs && this.obsBehave) return; // OBS open: nothing said about what's on your screen
    if (this.privacy) return; // someone else at your PC (faceid.js): not a word about what's done
    const at = Date.now();
    if (this.active() > ACTIVE_MS || !this.look.free()) return;
    // something that just happened (a game, a call, a long session ended, a new app, a song) comes
    // first, without waiting its turn: two minutes since she last spoke is enough
    this.events = this.events.filter((e) => at - e.at < 10 * 60000);
    if (this.events.length && at - (this.spokeAt || 0) > 2 * 60000) return this.speak({ event: this.events.shift() });
    if (at < this.nextAt) return;
    const cur = this.now;
    if (!cur || cur.private) return;
    const here = at - cur.since;
    const run = this.onApp(at);
    const spec = KINDS[cur.kind] || KINDS.app;
    const kindAt = this.saidAt.get(cur.kind) || -Infinity;
    const appAt = this.saidAt.get(cur.proc) || -Infinity;
    let why = null;
    if (run >= LONG && at - appAt >= LONG) why = { long: run };
    else if (here >= spec.dwell && at - kindAt >= spec.again && (cur.kind !== 'app' || at - appAt >= spec.again)) why = { settled: here };
    if (!why) return;
    this.speak(why);
  }

  prompt(why) {
    const at = Date.now();
    const timeline = this.past.length ? this.past.map((p) => `- ${this.describe(p, p.ms)}`).join('\n') : '- (nothing before)';
    if (why.event) {
      const ev = why.event;
      const what = ev.kind === 'session'
        ? `They just finished a ${minutes(ev.ms)}-minute session on ${ev.what}${ev.titles?.length ? `, on: ${ev.titles.map((x) => `"${x.slice(0, 70)}"`).join(', ')}` : ''}. Give your take on that session, like a friend who watched it: what they got done or watched, how it went, a tease or praise.`
        : ev.kind === 'newapp'
        ? `They just opened ${ev.what}, an app you have never seen them use. Be curious about it: ask what it is or what they are up to.`
        : ev.kind === 'song'
        ? `"${ev.what}" just started playing on their PC. React to the song or the artist: an opinion, a memory, a tease.`
        : ev.kind === 'game'
        ? `They just stopped playing ${ev.what} after ${minutes(ev.ms)} minutes. Ask how it went, or tease them about it.`
        : `They just got off a ${minutes(ev.ms)}-minute call on ${ev.what}; you stayed hidden and quiet during it. Welcome them back, maybe ask how it went.`;
      return `${fmt(PROMPT, { timeline, now: this.now ? this.describe(this.now, at - this.now.since) : 'back at the desktop', why: what })}\n${this.chat.languageNote()}`;
    }
    const cur = this.now;
    const reason = why.long
      ? `They have been on ${cur.where} for ${minutes(why.long)} minutes in a row.`
      : { search: 'They just searched for that.', video: 'They are watching that.', music: 'That is playing.', chat: 'They are chatting there.', work: 'They are working on that.' }[cur.kind] || `They just settled on ${cur.where}.`;
    return `${fmt(PROMPT, { timeline, now: this.describe(cur, at - cur.since), why: reason })}\n${this.chat.languageNote()}`;
  }

  async speak(why) {
    const at = Date.now();
    this.spokeAt = at;
    this.nextAt = at + rand(this.gaps[0], this.gaps[1]) * 60 * 1000 * (this.heart?.chattiness || 1);
    if (this.now && !why.event) {
      this.saidAt.set(this.now.kind, at);
      this.saidAt.set(this.now.proc, at);
    }
    this.busy = true;
    try {
      let res = await this.host.activitySay({ persona: this.chat.lookPersona(), prompt: this.prompt(why) });
      // slipped into English: once more, insisting on her language
      if (res.ok && !inLang(res.text, this.brain.lang)) {
        res = await this.host.activitySay({ persona: this.chat.lookPersona(), prompt: `${this.prompt(why)}\n${this.chat.languageNote()} ${this.chat.languageNote()}` });
        if (res.ok && !inLang(res.text, this.brain.lang)) return;
      }
      if (!res.ok) {
        if (res.code === 'noai') {
          this.panel.say({ kind: 'info', face: 'aside', line: this.t.noAI, hold: 7000 });
          this.host.setConfig({ watchActivity: false }); // nothing to say it with: off until there is
        }
        return;
      }
      const text = clean(res.text).replace(/^["“«]\s*|\s*["”»]$/g, '');
      if (!text || !this.look.free()) return; // something more important came up meanwhile
      this.chat.seen = { text, at: Date.now() }; // her chat knows what she said
      this.capri.perform('curious', this.capri.towardCenter());
      this.panel.say({ kind: 'info', badge: this.brain.t.badges?.feed || 'FEED', face: mood(text), line: text, hold: Math.min(13000, Math.max(5000, 2500 + text.length * 55)) });
    } finally {
      this.busy = false;
    }
  }

  // ---- her memory of your days ----

  log(e, ms) {
    const day = (this.days[dayOf()] ||= { apps: {}, notes: [] });
    const name = e.kind === 'game' ? `${e.where} (game)` : e.where;
    day.apps[name] = (day.apps[name] || 0) + ms / 60000;
    const note = { search: 'searched', video: 'watched', music: 'listened to', game: 'played' }[e.kind];
    if (note && e.what && day.notes.length < 40) {
      const line = `${note}: ${e.what.slice(0, 80)}`;
      if (!day.notes.includes(line)) day.notes.push(line);
    }
    if (e.kind === 'call' && day.notes.length < 40) day.notes.push(`a ${minutes(ms)}-minute call on ${e.where}`);
    this.dirty = true;
  }

  flush() {
    if (!this.dirty) return;
    this.dirty = false;
    const keep = Object.keys(this.days).sort().slice(-14);
    this.days = Object.fromEntries(keep.map((d) => [d, this.days[d]]));
    this.host.daysSave({ days: this.days });
  }

  // her chat remembers the last few entries
  remember() {
    this.chat.diary = Object.keys(this.diary).sort().slice(-3).map((date) => ({ date, text: this.diary[date] }));
  }

  // Yesterday (or any day before, not written yet): a few lines of her diary, by her local AI.
  async writeDiary() {
    const today = dayOf();
    const days = Object.keys(this.days).filter((d) => d < today && !this.diary[d]).sort().slice(-1);
    for (const date of days) {
      const { apps = {}, notes = [] } = this.days[date];
      const top = Object.entries(apps).filter(([, m]) => m >= 3).sort((a, b) => b[1] - a[1]).slice(0, 8);
      if (!top.length) continue;
      const prompt = [
        `Write your diary entry about the user's day, ${date}. What you saw of it:`,
        ...top.map(([app, m]) => `- ${app}: ${Math.round(m)} min`),
        ...notes.slice(0, 20).map((n) => `- ${n}`),
        'Two or three sentences, first person, in your voice: what stood out, how you felt about it, one little thing you want to remember about them. Plain text, no list, no date.',
        this.chat.languageNote(),
      ].join('\n');
      const res = await this.host.localSay({ persona: this.chat.lookPersona(), prompt, maxTokens: 220, temperature: 0.8 }).catch(() => null);
      if (!res?.ok || !inLang(res.text, this.brain.lang)) return;
      const text = clean(res.text).trim();
      if (!text) return;
      this.diary[date] = text.slice(0, 600);
      const keep = Object.keys(this.diary).sort().slice(-30);
      this.diary = Object.fromEntries(keep.map((d) => [d, this.diary[d]]));
      this.host.daysSave({ diary: this.diary });
      this.onDiary?.(this.days[date]); // what she learns about you (progress.js)
      this.remember();
    }
  }
}
