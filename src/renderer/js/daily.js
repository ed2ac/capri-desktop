// Her day with you: good morning (the weather, today's reminders, a word about yesterday), a word
// about your day in the evening, focus mode (a countdown in her ticker, and she's on you when you
// drift to a video or a chat), the weather when you ask ("my city is …" first), what's playing and
// the screenshots you take (only with "Comment on what I do" on, only to her local model), and the
// dates that count between you two (a week, a month, a hundred days…).

import { fmt, today, inLang } from './util.js';
import { clean, mood } from './chat.js';

const MILESTONES = [7, 30, 50, 100, 200, 365, 500, 730, 1000];
// your calendar, your limits, your birthday, read off her chat (care.js asks)
export const CAL_SET = /(https:\/\/\S+\.ics\S*|https:\/\/calendar\.google\.com\/calendar\/ical\/\S+|https:\/\/outlook\.(?:live|office365?)\.com\/\S+)/i;
export const CAL_ASK = /(?:minha agenda|o que (?:eu )?tenho (?:hoje|amanh[ãa])|compromissos|reuni[õo]es (?:de )?hoje|my (?:calendar|agenda|schedule)|what(?:'s| is) on (?:my calendar|today)|mon agenda|mi agenda|моё расписание)/i;
export const LIMIT_SET = /(?:me avisa|me avise|me lembra|avisa|limite?)\D{0,30}?(?:se|quando)?\s*(?:eu )?(?:passar|ficar|usar)\s*(?:de\s+|mais de\s+)?(\d{1,3})\s*(h|hora|horas|min|minutos?)\s*(?:no|na|em|nos|de|jogando|vendo|usando)\s+(.{2,40})$|(?:warn|tell|remind) me (?:if|when) i (?:spend|use|am on)\s*(?:more than\s*)?(\d{1,3})\s*(h|hours?|min|minutes?)\s*(?:on|in|at)\s+(.{2,40})$/i;
export const LIMIT_LIST = /meus limites|quais (?:s[ãa]o )?(?:os )?(?:meus )?limites|my limits/i;
export const LIMIT_DEL = /(?:tira|remove|apaga|cancela)\s+(?:o )?limite\s+(?:do |da |de |of )?(.{2,40})|remove (?:the )?limit (?:on |for )?(.{2,40})/i;
export const BIRTHDAY = /(?:meu anivers[áa]rio (?:é|e|cai)(?: (?:em|dia|no dia))?|my birthday is(?: on)?|mon anniversaire est le|mi cumplea[ñn]os es el)\s*(\d{1,2})\s*(?:\/|-|de\s+)?\s*(\d{1,2}|[\p{L}]+)/iu;
const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const MONTHS_EN = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
// dates she knows: month-day -> key in her lines (daily.dates)
const DATES = { '10-31': 'halloween', '12-24': 'christmas', '12-25': 'christmas', '12-31': 'newyear', '01-01': 'newyear', '09-13': 'edgerunners' };
// your to-do list and your routines, read off what you say in her chat (care.js asks)
export const TODO_ADD = /^(?:capri,?\s+)?(?:anota(?:r)?|anote|adiciona(?:r)?|adicione|coloca|coloque|p[õo]e|bota)\s*(?:a[íi]\s*)?(?:na (?:minha )?lista|nas (?:minhas )?tarefas|no to-?do)?\s*[:,]?\s+(.{2,140})$|^(?:capri,?\s+)?(?:note|todo|to-?do|add to my (?:list|to-?do))\s*[:,]\s*(.{2,140})$|^(?:capri,?\s+)?(?:note|ajoute|apunta|añade|запиши)\s*[:,]?\s+(.{2,140})$/i;
export const TODO_LIST = /(?:o que (?:eu )?tenho (?:pra|para|que) fazer|minha lista|minhas tarefas|lista de tarefas|what(?:'s| is) on my list|my (?:to-?do|list|tasks)|what do i have to do|ma liste|mi lista|мой список)/i;
export const TODO_DONE = /^(?:capri,?\s+)?(?:risca|risque|terminei|conclu[íi]|feito|fiz|marca (?:como )?feit[oa]|j[áa] fiz|done|finished|completed|did|j['’]ai fini|termin[ée])\s*[:,]?\s+(?:o |a |de |the )?(.{2,80})$/i;
export const TODO_CLEAR = /(?:limpa|apaga|esvazia|zera) (?:a |minha )?lista|clear (?:my )?(?:list|to-?do)/i;
const DAYS = { domingo: 0, segunda: 1, 'terça': 2, terca: 2, quarta: 3, quinta: 4, sexta: 5, 'sábado': 6, sabado: 6, sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 };
export const ROUTINE = /(todo dia|todos os dias|diariamente|toda (?:segunda|ter[çc]a|quarta|quinta|sexta|s[áa]bado|domingo)(?:-feira)?|todas? as (?:segundas|ter[çc]as|quartas|quintas|sextas|s[áa]bados|domingos)|dias [úu]teis|(?:nos )?fins? de semana|every ?day|daily|every (?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)|weekdays|weekends)\s*,?\s*(?:[àa]s?|at)?\s*(\d{1,2})(?:[:h](\d{2}))?\s*(?:h(?:oras)?)?\s*,?\s*(.*)$/i;
export const ROUTINE_LIST = /minhas rotinas|quais (?:s[ãa]o )?(?:as )?(?:minhas )?rotinas|my routines/i;
export const ROUTINE_DEL = /(?:cancela|cancele|remove|remova|apaga|apague|tira|delete|cancel|remove)\s+(?:a |the )?rotina\s+(?:de |do |da |of )?(.{2,60})|(?:cancel|remove|delete) (?:the )?routine (?:to |of )?(.{2,60})/i;

// which days a routine says: [0…6]
function routineDays(words) {
  const w = words.toLowerCase();
  if (/todo dia|todos os dias|diariamente|every ?day|daily/.test(w)) return [0, 1, 2, 3, 4, 5, 6];
  if (/[úu]teis|weekdays/.test(w)) return [1, 2, 3, 4, 5];
  if (/fins? de semana|weekends/.test(w)) return [0, 6];
  const d = Object.entries(DAYS).find(([name]) => w.includes(name.slice(0, 5)));
  return d ? [d[1]] : [0, 1, 2, 3, 4, 5, 6];
}
const DISTRACTING = new Set(['video', 'chat', 'music']);
const LANGS = { pt: 'pt', en: 'en', fr: 'fr', es: 'es', ru: 'ru' };

export class Daily {
  constructor({ capri, panel, brain, host, chat, activity, look, bond, reminders, voice }) {
    Object.assign(this, { capri, panel, brain, host, chat, activity, look, bond, reminders, voice });
    this.cfg = {};
    this.focus = null;        // { until, minutes, nagAt }
    this.song = '';
    this.songAt = 0;
    this.shotAt = 0;
    setInterval(() => this.tick(), 30000);
    setInterval(() => this.focusTick(), 1000);
    setInterval(() => this.routinesTick(), 20000);
    setInterval(() => this.minute(), 60000);
    this.warned = new Set();   // calendar events she warned you about
    this.eyesAt = Date.now();
    this.danceAt = 0;
    this.weatherAt = 0;
    this.obs = false;
    this.onWin = null;  // (kind) => …: her heart, her pride (app.js)
    host.onMedia?.((m) => this.onMedia(m));
    host.onShot?.((s) => this.onShot(s));
  }

  get t() {
    return this.brain.t.daily;
  }

  configure(cfg) {
    this.cfg = cfg;
  }

  // her local AI for a line, her written ones if it can't
  async say(prompt, fallbackPath, { vars = {}, face, hold = 9000, kind = 'info' } = {}) {
    let res = await this.host.localSay({ persona: this.chat.lookPersona(), prompt: `${prompt}\n${this.chat.languageNote()}`, maxTokens: 160 }).catch(() => null);
    if (res?.ok && !inLang(res.text, this.brain.lang)) {
      res = await this.host.localSay({ persona: this.chat.lookPersona(), prompt: `${this.chat.languageNote()}\n${prompt}\n${this.chat.languageNote()}`, maxTokens: 160 }).catch(() => null);
      if (res?.ok && !inLang(res.text, this.brain.lang)) res = null; // her written lines, then
    }
    const line = res?.ok ? clean(res.text).replace(/^["“«]\s*|\s*["”»]$/g, '') : fmt(this.brain.line(fallbackPath), vars);
    if (!line) return;
    this.panel.say({ kind, face: face || mood(line), line, hold: Math.min(14000, Math.max(hold, 2500 + line.length * 50)) });
    this.chat.seen = { text: line, at: Date.now() };
  }

  free() {
    return this.look.free() && !this.capri.stowed;
  }

  // ---- once a day ----

  async tick() {
    if (!this.free()) return;
    const now = new Date();
    const day = today();
    const active = this.activity.active() < 90000;
    if (!active) return;
    // good morning: the first time you're here after 5 in the morning
    if (now.getHours() >= 5 && now.getHours() < 13 && this.cfg.morningDay !== day) {
      this.cfg.morningDay = day;
      this.host.setConfig({ morningDay: day });
      return this.morning();
    }
    // the dates that count
    const since = this.bond.data?.first;
    if (since) {
      const days = Math.round((new Date(day) - new Date(since)) / 86400000);
      const done = this.cfg.milestones || [];
      if (MILESTONES.includes(days) && !done.includes(days)) {
        this.host.setConfig({ milestones: [...done, days] });
        this.cfg.milestones = [...done, days];
        this.capri.celebrate?.({ onSpeak: () => this.panel.say({ kind: 'done', face: 'laugh', line: fmt(this.brain.line('daily.anniversary'), { days }), hold: 8000 }) });
        return undefined;
      }
    }
    // in the evening, a word about your day (what she saw of it)
    if (now.getHours() >= 21 && this.cfg.eveningDay !== day && this.activity.days?.[day]) {
      this.cfg.eveningDay = day;
      this.host.setConfig({ eveningDay: day });
      return this.evening(day);
    }
    return undefined;
  }

  async morning() {
    const parts = [`It is ${new Intl.DateTimeFormat('en', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }).format(new Date())}: the user just showed up for the day. Say good morning, in character.`];
    const w = this.cfg.city ? await this.host.weather(this.cfg.city, LANGS[this.brain.lang] || 'en').catch(() => null) : null;
    if (w && !w.error && (w.code >= 95 || w.rain >= 85)) setTimeout(() => this.onStorm?.(), 12000); // her fear of lightning
    if (w && !w.error) parts.push(`The weather in ${w.city} today: ${w.temp}°C now, ${this.t.wmo?.[w.code] || ''}, high ${w.max}°, low ${w.min}°${w.rain != null ? `, ${w.rain}% chance of rain` : ''}. Mention it.`);
    const soon = (this.reminders?.upcoming || []).filter((r) => new Date(r.at).toDateString() === new Date().toDateString());
    if (soon.length) parts.push(`Reminders today: ${soon.map((r) => `${new Date(r.at).toTimeString().slice(0, 5)} ${r.text || ''}`).join('; ')}. Mention them.`);
    const cal = this.cfg.calendarUrl ? await this.host.calendar(16).catch(() => null) : null;
    const todayEvents = (cal?.events || []).filter((e) => new Date(e.start).toDateString() === new Date().toDateString());
    if (todayEvents.length) parts.push(`Their calendar today: ${todayEvents.map((e) => `${e.allDay ? 'all day' : new Date(e.start).toTimeString().slice(0, 5)} ${e.title}`).join('; ')}. Mention what matters.`);
    const sleep = this.cfg.sleep || {};
    const night = sleep[today()];
    if (night?.bed) parts.push(`Last night they were at the PC until ${night.bed}. If that's late (after midnight), tease or scold them a little about sleep.`);
    const todos = (this.cfg.todos || []).filter((x) => !x.done).slice(0, 4);
    if (todos.length) parts.push(`Their to-do list: ${todos.map((x) => x.text).join('; ')}. Bring up one.`);
    const yesterday = (this.chat.diary || []).at(-1);
    if (yesterday) parts.push(`From your diary about their last day: "${yesterday.text}". You may bring up one thing from it.`);
    parts.push('Two or three short sentences.');
    this.capri.wake();
    this.capri.perform('hop', this.capri.towardCenter());
    await this.say(parts.join('\n'), 'daily.morning', { face: 'grin' });
  }

  async evening(day) {
    const { apps = {}, notes = [] } = this.activity.days[day] || {};
    const top = Object.entries(apps).filter(([, m]) => m >= 5).sort((a, b) => b[1] - a[1]).slice(0, 6);
    if (!top.length) return;
    const prompt = [
      'It is evening. What you saw of the user\'s day:',
      ...top.map(([a, m]) => `- ${a}: ${Math.round(m)} min`),
      ...notes.slice(-10).map((n) => `- ${n}`),
      'Sum up their day in two short sentences, in character: what stood out, a tease or a compliment.',
    ].join('\n');
    await this.say(prompt, 'daily.morning', { face: 'smug' });
  }

  // ---- every minute: your calendar, your eyes, your limits, your sleep, the weather, special days ----

  async minute() {
    const now = new Date();
    const active = this.activity.active() < 120000;
    this.trackSleep(now, active);
    await this.calendarTick();
    if (!active || !this.free() || this.obs) return;
    this.eyesTick();
    this.limitsTick();
    this.specialDay(now);
    if (Date.now() - this.weatherAt > 60 * 60000 && this.cfg.city) this.weatherBody();
  }

  // your calendar: a word five minutes before each event
  async calendarTick() {
    if (!this.cfg.calendarUrl) return;
    const r = await this.host.calendar(1).catch(() => null);
    for (const e of r?.events || []) {
      const left = e.start - Date.now();
      const key = `${e.title}|${e.start}`;
      if (e.allDay || left > 6 * 60000 || left < 0 || this.warned.has(key)) continue;
      this.warned.add(key);
      this.capri.wake();
      this.voice.play('remind');
      this.capri.perform('alarm', this.capri.towardCenter());
      this.panel.say({ kind: 'alert', face: 'look', line: fmt(this.t.calSoon, { title: e.title, minutes: Math.max(1, Math.round(left / 60000)) }), quote: e.where || '', hold: 15000 });
    }
  }

  calendarReply(asked) {
    const t = this.t;
    if (asked.url) {
      this.cfg.calendarUrl = asked.url;
      this.host.setConfig({ calendarUrl: asked.url });
      return this.host.calendar(36).then((r) => (r?.error
        ? { line: fmt(t.calBad, { error: r.error }), face: 'aside' }
        : { line: fmt(t.calSet, { count: r.events.length }), face: 'smug' }));
    }
    if (!this.cfg.calendarUrl) return { line: t.calHow, face: 'look' };
    return this.host.calendar(36).then((r) => {
      if (r?.error) return { line: fmt(t.calBad, { error: r.error }), face: 'aside' };
      if (!r.events.length) return { line: t.calEmpty, face: 'smug' };
      const day = (ms) => (new Date(ms).toDateString() === new Date().toDateString() ? t.today : t.tomorrow);
      return { line: `${t.calList}\n${r.events.slice(0, 10).map((e) => `· ${day(e.start)} ${e.allDay ? t.allDay : new Date(e.start).toTimeString().slice(0, 5)} — ${e.title}`).join('\n')}`, face: 'look' };
    });
  }

  // 20-20-20: every 20 minutes at the screen, 20 seconds looking far away (her menu, off by default)
  eyesTick() {
    if (!this.cfg.eyeBreaks || this.focus) return;
    if (Date.now() - this.eyesAt < 20 * 60000) return;
    this.eyesAt = Date.now();
    this.capri.perform('curious', this.capri.towardCenter());
    this.panel.say({ kind: 'info', face: 'look', line: this.brain.line('daily.eyes'), hold: 6000 });
    let s = 20;
    const tick = setInterval(() => {
      this.panel.setTicker(s > 0 ? { verb: '👁', target: `${s}s` } : null);
      if (s-- < 0) clearInterval(tick);
    }, 1000);
  }

  // time limits you set ("warn me if I spend 1 hour on YouTube"): today's time on it, from what she sees
  limitsTick() {
    const limits = Array.isArray(this.cfg.limits) ? this.cfg.limits : [];
    if (!limits.length) return;
    const day = this.activity.days?.[today()];
    if (!day) return;
    for (const l of limits) {
      const key = l.target.toLowerCase();
      const spent = Object.entries(day.apps || {}).filter(([a]) => a.toLowerCase().includes(key)).reduce((s, [, m]) => s + m, 0)
        + (this.activity.now && `${this.activity.now.where} ${this.activity.now.what}`.toLowerCase().includes(key) ? (Date.now() - this.activity.now.since) / 60000 : 0);
      if (spent < l.minutes) continue;
      const said = l.said?.[today()] || 0;
      if (said && Date.now() - said < 30 * 60000) continue;
      l.said = { [today()]: Date.now() };
      this.host.setConfig({ limits });
      this.capri.perform('glare', this.capri.towardCenter());
      this.voice.play('bolt', { soft: true });
      this.panel.say({ kind: 'info', face: 'aside', line: fmt(this.brain.line('daily.limit'), { target: l.target, minutes: Math.round(spent) }), hold: 7000 });
      return;
    }
  }

  limitReply(asked) {
    const t = this.t;
    const limits = Array.isArray(this.cfg.limits) ? this.cfg.limits : [];
    if (asked.op === 'list') {
      if (!limits.length) return { line: t.limitNone, face: 'look' };
      return { line: `${t.limitList}\n${limits.map((l) => `· ${l.target}: ${l.minutes} min`).join('\n')}`, face: 'look' };
    }
    if (asked.op === 'del') {
      const keep = limits.filter((l) => !l.target.toLowerCase().includes(asked.target.toLowerCase()));
      this.cfg.limits = keep;
      this.host.setConfig({ limits: keep });
      return { line: t.limitDeleted, face: 'aside' };
    }
    const target = asked.target.replace(/[.!?]+$/, '').replace(/^(?:o |a |os |as |the )/i, '').trim();
    const next = [...limits.filter((l) => l.target.toLowerCase() !== target.toLowerCase()), { target, minutes: asked.minutes }];
    this.cfg.limits = next;
    this.host.setConfig({ limits: next });
    const off = !this.activity.auto ? `\n${t.limitNeeds}` : '';
    return { line: fmt(t.limitSet, { target, minutes: asked.minutes }) + off, face: 'smug' };
  }

  // when you went to bed and got up, as far as the PC can tell
  trackSleep(now, active) {
    if (!active) return;
    const h = now.getHours();
    const sleep = { ...(this.cfg.sleep || {}) };
    // a night belongs to the morning after: 23:40 on the 13th is the night of the 14th
    const key = h >= 18 ? today(new Date(now.getTime() + 86400000)) : today();
    const night = { ...(sleep[key] || {}) };
    const hm = now.toTimeString().slice(0, 5);
    if (h >= 18 || h < 5) night.bed = hm;
    else if (!night.up) night.up = hm;
    else return;
    sleep[key] = night;
    const keep = Object.keys(sleep).sort().slice(-21);
    this.cfg.sleep = Object.fromEntries(keep.map((k) => [k, sleep[k]]));
    clearTimeout(this.sleepSave);
    this.sleepSave = setTimeout(() => this.host.setConfig({ sleep: this.cfg.sleep }), 5 * 60000);
  }

  // the weather, in her body: shivering in the cold, melting in the heat, sulking in the rain
  async weatherBody() {
    this.weatherAt = Date.now();
    const w = await this.host.weather(this.cfg.city, LANGS[this.brain.lang] || 'en').catch(() => null);
    if (!w || w.error) return;
    const kind = w.temp <= 12 ? 'cold' : w.temp >= 32 ? 'hot' : (w.code >= 51 && w.code <= 82) || w.code >= 95 ? 'rain' : null;
    if (!kind || Math.random() < 0.5) return;
    this.capri.perform(kind === 'cold' ? 'shake' : kind === 'hot' ? 'overheat' : 'huff', this.capri.towardCenter());
    this.panel.say({ kind: 'info', face: kind === 'rain' ? 'aside' : 'wide', line: fmt(this.brain.line(`daily.weather_${kind}`), { temp: w.temp, city: w.city }), hold: 5000 });
  }

  // your birthday, Halloween, Christmas, New Year, Edgerunners' anniversary: once that day
  specialDay(now) {
    const md = `${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const key = this.cfg.birthday === md ? 'birthday' : DATES[md];
    if (!key || this.cfg.specialSaid === `${today()}|${key}`) return;
    this.cfg.specialSaid = `${today()}|${key}`;
    this.host.setConfig({ specialSaid: this.cfg.specialSaid });
    this.capri.celebrate?.({ onSpeak: () => this.panel.say({ kind: 'done', face: 'laugh', line: this.brain.line(`daily.dates.${key}`), hold: 8000 }) });
  }

  birthdayReply(asked) {
    const t = this.t;
    let month = Number(asked.month);
    if (!month) {
      const m = String(asked.month).toLowerCase().slice(0, 3);
      month = (MONTHS.indexOf(m) + 1) || (MONTHS_EN.indexOf(m) + 1);
    }
    const day = Number(asked.day);
    if (!month || month > 12 || !day || day > 31) return { line: t.birthdayHow, face: 'look' };
    const md = `${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    this.cfg.birthday = md;
    this.host.setConfig({ birthday: md });
    return { line: fmt(t.birthdaySet, { date: `${day}/${month}` }), face: 'laugh' };
  }

  // what's playing: she dances to it, now and then (in a good mood, with some energy)
  // bpm: the music's beat (hearing.js), her moves on it; without it, her usual little dance
  dance(bpm = null) {
    const h = this.heart;
    if (!this.free() || this.obs || (h && (h.energy < 40 || h.mood < 40)) || Date.now() - this.danceAt < 12 * 60000) return;
    this.danceAt = Date.now();
    const beat = bpm ? (60000 / bpm) * (bpm > 115 ? 2 : 1) : 900;
    const moves = bpm ? ['hop', 'hop', 'spin', 'hop', 'curious', 'hop', 'spin', 'split', 'hop', 'hop', 'spin', 'victory'] : ['hop', 'spin', 'hop', 'curious', 'hop', 'spin'];
    moves.forEach((m, i) => setTimeout(() => this.free() && this.capri.perform(m, i % 2 ? 1 : -1), i * beat));
    if (bpm) for (let i = 0; i < moves.length; i += 2) setTimeout(() => this.free() && this.capri.shed?.(), i * beat + beat / 2);
    setTimeout(() => this.panel.say({ kind: 'info', face: 'laugh', line: this.brain.line('daily.dance'), hold: 3000 }), 600);
  }

  // Ctrl+Alt+T: what you copied, translated (Portuguese to English, anything else to your language)
  async translate() {
    const t = this.t;
    const text = String(await this.host.readClip().catch(() => '')).trim();
    if (!text) return this.panel.say({ kind: 'info', face: 'aside', line: t.clipEmpty, hold: 4000 });
    this.capri.wake();
    this.panel.setTicker({ verb: '⇄', target: t.translating });
    const target = this.brain.lang === 'pt' ? 'Brazilian Portuguese' : 'the user\'s language';
    const res = await this.host.chatSend({ id: Date.now(), messages: [
      { role: 'system', content: `You are a translator. If the text is in Portuguese, translate it to English; otherwise translate it to ${target}. Answer with the translation only, nothing else.` },
      { role: 'user', content: text.slice(0, 4000) },
    ] }).catch(() => null);
    this.panel.setTicker(null);
    const out = res?.ok ? String(res.text).replace(/<think>[\s\S]*?<\/think>/g, '').trim() : '';
    if (!out) return this.panel.say({ kind: 'info', face: 'aside', line: t.translateFail, hold: 5000 });
    this.capri.perform('curious', this.capri.towardCenter());
    return this.panel.say({
      kind: 'info', badge: '⇄', face: 'smug', line: out, hold: Math.min(30000, 6000 + out.length * 40),
      actions: [{ id: 'copy', label: t.copy, primary: true }],
      onAction: () => { this.host.writeClip(out); this.panel.say({ kind: 'info', face: 'smug', line: t.copied, hold: 2000 }); },
    });
  }

  // ---- your to-do list ----

  todos() {
    return Array.isArray(this.cfg.todos) ? this.cfg.todos : [];
  }

  saveTodos(list) {
    this.cfg.todos = list.slice(-60);
    this.host.setConfig({ todos: this.cfg.todos });
  }

  todoReply(asked) {
    const t = this.t;
    const list = this.todos();
    const open = list.filter((x) => !x.done);
    if (asked.op === 'add') {
      this.saveTodos([...list, { id: Date.now(), text: asked.text.slice(0, 140), at: Date.now(), done: false }]);
      return { line: fmt(t.todoAdded, { text: asked.text, count: open.length + 1 }), face: 'smug' };
    }
    if (asked.op === 'list') {
      if (!open.length) return { line: t.todoEmpty, face: 'smug' };
      return {
        line: `${t.todoList}\n${open.map((x, i) => `${i + 1}. ${x.text}`).join('\n')}`, face: 'look',
        buttons: open.slice(0, 3).map((x, i) => ({ id: String(x.id), label: fmt(t.todoTick, { text: x.text.slice(0, 24) }), primary: i === 0 })),
        onButton: (id) => this.tickTodo((x) => String(x.id) === id),
      };
    }
    if (asked.op === 'clear') {
      this.saveTodos([]);
      return { line: t.todoCleared, face: 'aside' };
    }
    // done: the closest one by its words
    const words = asked.text.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
    const score = (x) => words.filter((w) => x.text.toLowerCase().includes(w)).length;
    const best = open.map((x) => [x, score(x)]).sort((a, b) => b[1] - a[1])[0];
    if (!best || best[1] === 0) return { line: fmt(t.todoNotFound, { text: asked.text }), face: 'look' };
    return this.tickTodo((x) => x.id === best[0].id);
  }

  tickTodo(match) {
    const t = this.t;
    const list = this.todos();
    const item = list.find((x) => !x.done && match(x));
    if (!item) return null;
    item.done = true;
    item.doneAt = Date.now();
    this.saveTodos(list);
    this.onWin?.('todo');
    this.capri.perform('hop', this.capri.towardCenter());
    const left = list.filter((x) => !x.done).length;
    return { line: fmt(left ? t.todoDone : t.todoAllDone, { text: item.text, count: left }), face: 'laugh' };
  }

  // ---- your routines ----

  routineReply(asked) {
    const t = this.t;
    const list = Array.isArray(this.cfg.routines) ? this.cfg.routines : [];
    if (asked.op === 'list') {
      if (!list.length) return { line: t.routineNone, face: 'look' };
      return { line: `${t.routineList}\n${list.map((r) => `· ${String(r.hour).padStart(2, '0')}:${String(r.minute).padStart(2, '0')} ${this.dayNames(r.days)}: ${r.text}`).join('\n')}`, face: 'look' };
    }
    if (asked.op === 'del') {
      const w = asked.text.toLowerCase();
      const keep = list.filter((r) => !r.text.toLowerCase().includes(w));
      if (keep.length === list.length) return { line: fmt(t.todoNotFound, { text: asked.text }), face: 'look' };
      this.cfg.routines = keep;
      this.host.setConfig({ routines: keep });
      return { line: t.routineDeleted, face: 'aside' };
    }
    const r = { id: Date.now(), days: routineDays(asked.when), hour: Math.min(23, asked.hour), minute: Math.min(59, asked.minute || 0), text: asked.text.slice(0, 140) || t.routineDefault, last: '' };
    this.cfg.routines = [...list, r].slice(-30);
    this.host.setConfig({ routines: this.cfg.routines });
    return { line: fmt(t.routineSet, { time: `${String(r.hour).padStart(2, '0')}:${String(r.minute).padStart(2, '0')}`, days: this.dayNames(r.days), text: r.text }), face: 'smug' };
  }

  dayNames(days) {
    const t = this.t;
    if (days.length === 7) return t.everyDay;
    if (days.join() === '1,2,3,4,5') return t.weekdays;
    if (days.join() === '0,6') return t.weekends;
    return days.map((d) => t.dayNames[d]).join(', ');
  }

  // a routine due: as a reminder of hers (she comes and finds you, Done / 10 more min)
  routinesTick() {
    const list = Array.isArray(this.cfg.routines) ? this.cfg.routines : [];
    if (!list.length || !this.reminders) return;
    const now = new Date();
    const day = today();
    let changed = false;
    for (const r of list) {
      if (r.last === day || !r.days.includes(now.getDay())) continue;
      const at = new Date(now);
      at.setHours(r.hour, r.minute, 0, 0);
      const late = now - at;
      if (late < 0 || late > 10 * 60000) continue;
      r.last = day;
      changed = true;
      this.reminders.add(Date.now(), r.text);
    }
    if (changed) this.host.setConfig({ routines: list });
  }

  // ---- focus mode ----

  focusReply({ on, minutes }) {
    const t = this.t;
    if (!on) {
      if (!this.focus) return { line: t.focusStop, face: 'aside' };
      this.focus = null;
      this.activity.quiet = false;
      this.panel.setTicker(null);
      return { line: t.focusStop, face: 'look' };
    }
    const m = Math.max(5, Math.min(240, Number(minutes) || 50));
    this.focus = { until: Date.now() + m * 60000, minutes: m, nagAt: 0 };
    this.activity.quiet = true; // no comments about what you do while you focus: only nagging
    const next = this.todos().find((x) => !x.done);
    return { line: fmt(t.focusStart, { minutes: m }) + (next ? `\n${fmt(t.focusOn, { text: next.text })}` : ''), face: 'smug' };
  }

  focusTick() {
    const f = this.focus;
    if (!f) return;
    const left = f.until - Date.now();
    if (left <= 0) {
      this.focus = null;
      this.activity.quiet = false;
      this.panel.setTicker(null);
      this.voice.play('done');
      this.onWin?.('focus');
      this.focusLog = [...(this.cfg.focusLog || []), { at: Date.now(), minutes: f.minutes }].slice(-200);
      this.cfg.focusLog = this.focusLog;
      this.host.setConfig({ focusLog: this.focusLog });
      const line = fmt(this.brain.line('daily.focusDone'), { minutes: f.minutes });
      if (this.capri.stowed) this.panel.say({ kind: 'done', face: 'laugh', line, hold: 7000 });
      else this.capri.celebrate?.({ onSpeak: () => this.panel.say({ kind: 'done', face: 'laugh', line, hold: 7000 }) });
      return;
    }
    const s = Math.ceil(left / 1000);
    if (this.capri.mode !== 'work' && this.capri.mode !== 'alert') {
      this.panel.setTicker({ verb: 'FOCO', target: `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` });
    }
    // drifting to a video, a chat, a game: she's on you (every 4 minutes at most)
    const now = this.activity.now;
    if (now && DISTRACTING.has(now.kind) && Date.now() - now.since > 20000 && Date.now() - f.nagAt > 4 * 60000 && this.free()) {
      f.nagAt = Date.now();
      this.capri.perform('glare', this.capri.towardCenter());
      this.voice.play('bolt', { soft: true });
      this.panel.say({ kind: 'info', face: 'aside', line: this.brain.line('daily.focusNag'), hold: 4000 });
    }
  }

  // ---- the weather ----

  async weatherReply() {
    const t = this.t;
    if (!this.cfg.city) return { line: t.weatherAsk, face: 'look' };
    const w = await this.host.weather(this.cfg.city, LANGS[this.brain.lang] || 'en').catch(() => null);
    if (!w || w.error === 'unknown') return { line: fmt(w ? t.weatherUnknown : t.weatherFail, { city: this.cfg.city }), face: 'aside' };
    if (w.error) return { line: t.weatherFail, face: 'aside' };
    const desc = t.wmo?.[w.code] || t.wmo?.[Math.floor(w.code / 10) * 10] || '';
    return {
      line: fmt(t.weather, { ...w, desc, rain: w.rain != null && w.rain >= 20 ? fmt(t.rain, { rain: w.rain }) : '' }),
      face: w.rain >= 60 ? 'aside' : 'smug',
    };
  }

  async cityReply(city) {
    this.cfg.city = city;
    await this.host.setConfig({ city });
    const w = await this.weatherReply();
    return { line: `${fmt(this.t.weatherSet, { city })}\n${w.line}`, face: w.face };
  }

  // ---- what's playing, and your screenshots (her local model only) ----

  onMedia(m) {
    if (m?.playing) this.dance();
    if (!m || !m.playing || !this.activity.auto) return;
    const key = `${m.artist} - ${m.title}`;
    if (key === this.song) return;
    this.song = key;
    this.activity.onSong?.(m);
  }

  async onShot({ file }) {
    if (!this.activity.auto || !this.activity.asked || !this.free() || Date.now() - this.shotAt < 10 * 60000) return;
    this.shotAt = Date.now();
    const res = await this.host.shotSay({
      file, persona: this.chat.lookPersona(),
      prompt: `The user just took this screenshot. If you see a small figure with a big red mane, that's you: leave it out. React to what's in it, in character: one concrete detail, one or two short sentences.\n${this.chat.languageNote()}`,
    }).catch(() => null);
    if (!res?.ok || !this.free() || !inLang(res.text, this.brain.lang)) return;
    const line = clean(res.text).replace(/^["“«]\s*|\s*["”»]$/g, '');
    if (!line) return;
    this.capri.perform('curious', this.capri.towardCenter());
    this.panel.say({ kind: 'info', badge: this.brain.t.badges?.shot || 'SHOT', face: mood(line), line, hold: Math.min(12000, 2500 + line.length * 55) });
    this.chat.seen = { text: line, at: Date.now() };
  }
}
