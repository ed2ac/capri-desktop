// Her hands: Claude Code doing what you asked her in her chat (main tasks.js). She offers first
// (a button), then narrates each step in her ticker while it works, and brings you every request to
// change something (write a file, run a command…) with Allow / Deny / Allow all in this task. At the
// end, what it did, in her words. Asked in her chat ("organize my downloads", "make me a little
// budget app"): her AI adds [[task: …]] when it takes hands, or you say "task: …".

import { fmt } from './util.js';

const VERBS = {
  Write: 'CRIA', Edit: 'EDITA', MultiEdit: 'EDITA', NotebookEdit: 'EDITA', Bash: 'RODA', Read: 'LÊ', Glob: 'PROCURA', Grep: 'PROCURA',
  LS: 'OLHA', WebFetch: 'NAVEGA', WebSearch: 'PESQUISA', TodoWrite: 'PLANEJA', Task: 'DELEGA', Agent: 'DELEGA',
};
const base = (p = '') => String(p).split(/[\\/]/).filter(Boolean).pop() || String(p);
// a folder named in what you said: a path ("C:\\Users\\eu\\site", "~/dev/app", "/home/eu/app", in
// quotes if it has spaces) or a name and where ("a pasta site no windows", "na pasta api do wsl")
const QUOTED_PATH = /["“']((?:[A-Za-z]:[\\/]|~\/|\/)[^"”']+)["”']/u;
const BARE_PATH = /(?<![\p{L}\p{N}])((?:[A-Za-z]:[\\/]|~\/|\/(?:home|mnt|opt|srv|var|tmp)\/)[^\s"'<>|?*,;]*)/u;
const NAMED_FOLDER = /(?<![\p{L}])(?:pasta|diret[óo]rio|folder|projeto|project|dossier|carpeta)\s+(?:chamad[ao]\s+|called\s+|named\s+)?["“]?([\p{L}\p{N}][\p{L}\p{N}._ -]{0,60}?)["”]?\s+(?:no|do|em|dentro do|in|on|inside|on the|dans|en)\s+(?:o\s+|the\s+|meu\s+|my\s+)?(windows|wsl|linux|ubuntu)(?![\p{L}])/iu;
const ONE_FOLDER = /(?<![\p{L}])(?:pasta|folder|dossier|carpeta)\s+["“]?([\p{L}\p{N}][\p{L}\p{N}._-]{1,60})["”]?/iu;
const NOT_FOLDER = /^(de|do|da|dos|das|que|onde|com|em|no|na|of|the|with|where|downloads?|nova|new)$/i;
export function folderIn(text = '') {
  const said = String(text);
  const path = (QUOTED_PATH.exec(said) || BARE_PATH.exec(said))?.[1]?.replace(/[.!?)]+$/, '');
  if (path) return { path };
  const named = NAMED_FOLDER.exec(said);
  if (named) return { name: named[1].trim(), side: /windows/i.test(named[2]) ? 'windows' : 'wsl' };
  const one = ONE_FOLDER.exec(said)?.[1];
  return one && !NOT_FOLDER.test(one) ? { name: one, side: '' } : null;
}
const OPEN_IT = /(?<![\p{L}])(?:abr[aei]\w*|open|ouvre|mostr[ae]\w*|show)(?![\p{L}])/iu;

const clip = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export class Hands {
  constructor({ capri, panel, brain, host, chat, guide, voice }) {
    Object.assign(this, { capri, panel, brain, host, chat, guide, voice });
    this.running = false;
    this.allowAll = false;
    this.asks = [];        // permission requests waiting their turn
    this.asking = false;
    this.projects = [];    // your code projects in WSL: [{ name, dir }]
    this.last = null;      // the last task: { session, project, at }, to carry on with it
    this.onDone = null;    // (ok, project) => …: her heart, her achievements (app.js)
    this.refresh();
    setInterval(() => this.refresh(), 10 * 60000);
    host.onTaskEvent?.((e) => this.onEvent(e));
    host.onGateAsk?.((g) => this.onAsk(g));
    host.onGateGone?.(({ id }) => {
      this.asks = this.asks.filter((g) => g.id !== id);
      // answered in her workshop window (or nobody answered): her question goes away
      if (this.current?.g.id === id) this.current.gone();
    });
    // her workshop window: "allow all in this task", and a task typed there
    host.onWorkAllowAll?.(() => { this.allowAll = true; });
    host.onWorkStart?.(({ prompt, folder }) => this.start(prompt, '', { folder }));
    // how much of your Claude plan is used (main tasks.js): she tells you when it gets high
    this.usage = null;
    this.warned = {};
    host.onUsage?.((u) => this.onUsage(u));
  }

  get t() {
    return this.brain.t.hands;
  }

  refresh() {
    this.host.taskProjects?.().then((list) => { this.projects = Array.isArray(list) ? list : []; }).catch(() => {});
  }

  // the project named in what you said ("no projeto capri", "in jogos-escolhas"), if one
  projectIn(text = '') {
    const words = String(text).toLowerCase();
    const named = (p) => {
      const n = p.name.toLowerCase();
      const loose = n.replace(/[-_]+/g, '[-_ ]?');
      return new RegExp(`(?<![\\p{L}\\p{N}])${loose}(?![\\p{L}\\p{N}])`, 'u').test(words);
    };
    return this.projects.find(named) || null;
  }

  // Her chat: Claude could do this. A button first (and, on the same project as last time, carrying
  // on with that conversation or starting over).
  async offer(prompt, answer, text = '') {
    const t = this.t;
    if (this.running) return this.chat.addLine(answer, t.busy, 'aside');
    let project = this.projectIn(text) || this.projectIn(prompt);
    let folder = null;
    // a folder you named, on Windows or in WSL: found first (and shown, if you said "abra")
    const spec = !project && (folderIn(text) || folderIn(prompt));
    if (spec) {
      const found = await this.host.taskFolder?.(spec).catch(() => null);
      if (!found && (spec.path || spec.side)) return this.chat.addLine(answer, fmt(t.noFolder || t.failed, { folder: spec.path || spec.name, error: spec.path || spec.name }), 'aside');
      if (found) {
        folder = found.dir;
        project = { name: found.win || found.dir, dir: found.dir };
        if (OPEN_IT.test(text)) this.host.taskReveal?.(found.dir);
      }
    }
    const dir = project?.dir || null;
    const again = this.last && this.last.project === dir && Date.now() - this.last.at < 60 * 60000;
    const full = (this.usage?.rows || []).find((r) => r.key === 'session' && r.pct >= 90);
    if (full) this.chat.addLine(answer, fmt(t.usageFull, { pct: Math.round(full.pct), which: t.usageSession, when: this.resetsWhen(full) }), 'wide');
    this.chat.addLine(answer, folder ? fmt(t.offerFolder || t.offerProject, { project: project.name, folder: project.name }) : project ? fmt(t.offerProject, { project: project.name }) : t.offer, 'look');
    const buttons = again
      ? [{ id: 'resume', label: t.resume, primary: true }, { id: 'go', label: t.fresh }, { id: 'no', label: t.no }]
      : [{ id: 'go', label: t.start, primary: true }, { id: 'no', label: t.no }];
    const pick = (id) => {
      this.pending = null;
      this.chat.panel.setActions([]);
      if (id === 'go' || id === 'resume') this.start(prompt, answer, { project: folder ? null : dir, folder, resume: id === 'resume' ? this.last.session : null });
    };
    // the buttons, or said back in her chat or out loud ("pode", "continua", "não")
    this.pending = { pick, again, until: Date.now() + 5 * 60000 };
    this.chat.panel.setActions(buttons, pick);
  }

  // Your answer to her offer, typed or spoken: 'go' | 'resume' | 'no', or null if it isn't one.
  spoken(text) {
    const p = this.pending;
    if (!p || Date.now() > p.until) return null;
    const said = String(text).trim().toLowerCase().replace(/[.!?,]+/g, ' ').replace(/^capri\s+/, '').trim();
    // a whole new message, not an answer: the offer goes, like its buttons
    if (said.split(/\s+/).length > 6) { this.pending = null; return null; }
    const no = /^(n[ãa]o|nao|deixa|esquece|cancela|para|melhor n[ãa]o|agora n[ãa]o|no|nope|cancel|never ?mind|not now)(?![\p{L}])/iu;
    const fresh = /(do zero|come[çc]a de novo|nova|outra conversa|from scratch|start over|new one)/iu;
    const resume = /(continu|segue|de onde parou|carry on|continue|keep going|resume)/iu;
    const yes = /^(sim|pode|vai|manda|bora|faz|faça|ok|okay|beleza|claro|isso|certo|come[çc]a|vamos|yes|yeah|yep|sure|go|do it|start)(?![\p{L}])/iu;
    let id = null;
    if (no.test(said)) id = 'no';
    else if (p.again && resume.test(said)) id = 'resume';
    else if (fresh.test(said) || yes.test(said) || resume.test(said)) id = 'go';
    if (!id) { this.pending = null; return null; }
    p.pick(id);
    return id;
  }

  // a command of yours that failed in one of your projects (shell.js): the project, if it's one
  projectAt(cwd = '') {
    return this.projects.find((p) => cwd === p.dir || cwd.startsWith(`${p.dir}/`)) || null;
  }

  fixFailure({ command, code, cwd }) {
    const project = this.projectAt(cwd);
    if (!project || this.running) return;
    this.start(`The command \`${command}\` just failed (exit code ${code}) in this project, run by the user in their terminal. Find out why and fix it; run it again to check.`, '', { project: project.dir });
  }

  async start(prompt, answer = '', { project = null, folder = null, resume = null } = {}) {
    const t = this.t;
    if (this.running) return;
    this.running = true;
    this.allowAll = false;
    if (answer) this.chat.addLine(answer, t.starting, 'smug');
    else this.panel.say({ kind: 'work', face: 'smug', line: t.starting, hold: 4000 });
    this.capri.setMode('work');
    const lang = { pt: 'Brazilian Portuguese', en: 'English', fr: 'French', es: 'Spanish', ru: 'Russian' }[this.brain.lang] || 'English';
    const res = await this.host.taskStart({ prompt, lang, persona: this.chat.lookPersona(), project, folder, resume }).catch((err) => ({ ok: false, error: err.message }));
    this.running = false;
    if (res.ok && res.session) this.last = { session: res.session, project: project || folder, at: Date.now() };
    this.onDone?.(res.ok, project);
    this.panel.setTicker(null);
    this.capri.setMode('idle');
    let line;
    let face = 'laugh';
    if (res.ok) {
      line = String(res.text || '').replace(/[*_`#]+/g, '').trim() || '…';
      this.voice.play('done');
      this.capri.perform('hop', this.capri.towardCenter());
    } else {
      face = 'aside';
      line = res.error === 'noclaude' ? t.noClaude : res.error === 'cancelled' ? t.cancelled : res.error === 'busy' ? t.busy : res.error === 'nofolder' ? fmt(t.noFolder || t.failed, { folder: folder || '', error: folder || '' }) : fmt(t.failed, { error: clip(String(res.error), 160) });
      if (res.error !== 'cancelled') this.voice.play('error');
    }
    this.presence?.note(line); // you're away: she tells you when you're back
    if (!this.chat.interject(line, [], null)) {
      this.panel.say({ kind: res.ok ? 'done' : 'error', face, line, hold: Math.min(16000, 4000 + line.length * 50) });
    }
  }

  cancel() {
    if (this.running) this.host.taskCancel();
  }

  // the 5-hour window and the week: a word from her at 80% and 95% (once each, until it resets)
  onUsage(u) {
    this.usage = u;
    const t = this.t;
    for (const row of (u?.rows || []).filter((r) => r.key === 'session' || r.key === 'week')) {
      const level = row.pct >= 95 ? 95 : row.pct >= 80 ? 80 : 0;
      const was = this.warned[row.key] || 0;
      if (level < was) this.warned[row.key] = level; // it reset
      if (!level || level <= was || !t.usageHigh) continue;
      this.warned[row.key] = level;
      const line = fmt(level >= 95 ? t.usageFull : t.usageHigh, { pct: Math.round(row.pct), which: row.key === 'session' ? t.usageSession : t.usageWeek, when: this.resetsWhen(row) });
      if (!this.chat.interject(line, [], null)) this.panel.say({ kind: 'info', face: level >= 95 ? 'wide' : 'look', line, hold: 9000 });
    }
  }

  resetsWhen(row) {
    if (row.resetsAt) return new Date(row.resetsAt).toLocaleTimeString(this.brain.lang === 'en' ? 'en' : 'pt-BR', { hour: '2-digit', minute: '2-digit' });
    return String(row.resets || '').replace(/^.*?,\s*/, '') || '…';
  }

  // "quanto do limite do claude?": what she knows, asked again if it's old
  async usageLine() {
    const t = this.t;
    const u = (await this.host.claudeUsage?.().catch(() => null)) || this.usage;
    const rows = (u?.rows || []).filter((r) => r.key === 'session' || r.key === 'week');
    if (!rows.length) return t.usageNone;
    const get = (k) => rows.find((r) => r.key === k);
    const s = get('session');
    const w = get('week');
    return fmt(t.usageNow, { session: s ? Math.round(s.pct) : '?', week: w ? Math.round(w.pct) : '?', when: s ? this.resetsWhen(s) : '…' });
  }

  // a step of Claude's, in her ticker
  onEvent(e) {
    if (e.kind !== 'tool') return;
    const input = e.input || {};
    const target = input.file_path || input.notebook_path ? base(input.file_path || input.notebook_path)
      : input.command ? clip(String(input.command).split('\n')[0], 50)
        : input.pattern || input.url || input.query || input.description || '';
    this.panel.setTicker({ verb: VERBS[e.name] || e.name.toUpperCase().slice(0, 8), target: clip(String(target), 60) });
    this.capri.shed?.();
  }

  // ---- Claude asking whether it may ----

  onAsk(g) {
    if (this.allowAll) return this.host.gateAnswer(g.id, true);
    this.asks.push(g);
    this.nextAsk();
  }

  describe({ tool, input }) {
    const a = this.t.actions;
    if (tool === 'Write') return { action: fmt(a.write, { target: base(input.file_path) }), quote: String(input.file_path || '') };
    if (['Edit', 'MultiEdit', 'NotebookEdit'].includes(tool)) return { action: fmt(a.edit, { target: base(input.file_path || input.notebook_path) }), quote: String(input.file_path || input.notebook_path || '') };
    if (tool === 'Bash') return { action: a.bash, quote: clip(String(input.command || ''), 400) + (input.description ? `\n(${input.description})` : '') };
    if (tool === 'WebFetch') return { action: fmt(a.web, { target: clip(String(input.url || ''), 60) }), quote: String(input.url || '') };
    return { action: fmt(a.other, { tool }), quote: clip(JSON.stringify(input), 300) };
  }

  async nextAsk() {
    if (this.asking || !this.asks.length) return;
    const g = this.asks.shift();
    if (this.allowAll) {
      this.host.gateAnswer(g.id, true);
      return this.nextAsk();
    }
    this.asking = true;
    const t = this.t;
    const { action, quote } = this.describe(g);
    let gone = false;
    let where = null; // 'chat' | 'guide': where her question is on screen
    this.current = {
      g,
      gone: () => {
        gone = true;
        if (where === 'chat') this.chat.panel.setActions([]);
        if (where === 'guide') this.guide.answer('gone');
        finish();
      },
    };
    let over = false;
    const finish = () => {
      if (over) return;
      over = true;
      this.current = null;
      this.asking = false;
      this.nextAsk();
    };
    const line = fmt(t.ask, { action });
    const actions = [{ id: 'yes', label: t.allow, primary: true }, { id: 'no', label: t.deny }, { id: 'all', label: t.allowAll }];
    this.voice.play('alert');
    const decide = (id) => {
      if (gone || over) return finish();
      if (id === 'all') this.allowAll = true;
      const allow = id === 'yes' || id === 'all';
      this.host.gateAnswer(g.id, allow, allow ? '' : 'The user denied this step.');
      if (!allow) this.panel.setTicker({ verb: '✕', target: t.denied, error: true });
      finish();
    };
    // in her chat if it's open, else she comes to you with it
    if (this.chat.interject(`${line}\n${quote}`, actions, (id) => {
      this.chat.panel.setActions([]);
      decide(id);
    })) {
      where = 'chat';
      return;
    }
    let picked = 'no';
    await this.guide.scene(async () => {
      if (gone) return;
      where = 'guide';
      this.capri.wake();
      this.capri.perform('alarm', this.capri.towardCenter());
      picked = await this.guide.ask({ face: 'wide', line, quote, actions });
    });
    decide(picked || 'no');
  }
}
