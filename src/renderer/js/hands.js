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
    host.onGateGone?.(({ id }) => { this.asks = this.asks.filter((g) => g.id !== id); });
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
  offer(prompt, answer, text = '') {
    const t = this.t;
    if (this.running) return this.chat.addLine(answer, t.busy, 'aside');
    const project = this.projectIn(text) || this.projectIn(prompt);
    const dir = project?.dir || null;
    const again = this.last && this.last.project === dir && Date.now() - this.last.at < 60 * 60000;
    this.chat.addLine(answer, project ? fmt(t.offerProject, { project: project.name }) : t.offer, 'look');
    const buttons = again
      ? [{ id: 'resume', label: t.resume, primary: true }, { id: 'go', label: t.fresh }, { id: 'no', label: t.no }]
      : [{ id: 'go', label: t.start, primary: true }, { id: 'no', label: t.no }];
    this.chat.panel.setActions(buttons, (id) => {
      this.chat.panel.setActions([]);
      if (id === 'go' || id === 'resume') this.start(prompt, answer, { project: dir, resume: id === 'resume' ? this.last.session : null });
    });
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

  async start(prompt, answer = '', { project = null, resume = null } = {}) {
    const t = this.t;
    if (this.running) return;
    this.running = true;
    this.allowAll = false;
    if (answer) this.chat.addLine(answer, t.starting, 'smug');
    else this.panel.say({ kind: 'work', face: 'smug', line: t.starting, hold: 4000 });
    this.capri.setMode('work');
    const lang = { pt: 'Brazilian Portuguese', en: 'English', fr: 'French', es: 'Spanish', ru: 'Russian' }[this.brain.lang] || 'English';
    const res = await this.host.taskStart({ prompt, lang, persona: this.chat.lookPersona(), project, resume }).catch((err) => ({ ok: false, error: err.message }));
    this.running = false;
    if (res.ok && res.session) this.last = { session: res.session, project, at: Date.now() };
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
      line = res.error === 'noclaude' ? t.noClaude : res.error === 'cancelled' ? t.cancelled : res.error === 'busy' ? t.busy : fmt(t.failed, { error: clip(String(res.error), 160) });
      if (res.error !== 'cancelled') this.voice.play('error');
    }
    if (!this.chat.interject(line, [], null)) {
      this.panel.say({ kind: res.ok ? 'done' : 'error', face, line, hold: Math.min(16000, 4000 + line.length * 50) });
    }
  }

  cancel() {
    if (this.running) this.host.taskCancel();
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
    const line = fmt(t.ask, { action });
    const actions = [{ id: 'yes', label: t.allow, primary: true }, { id: 'no', label: t.deny }, { id: 'all', label: t.allowAll }];
    this.voice.play('alert');
    const decide = (id) => {
      if (id === 'all') this.allowAll = true;
      const allow = id === 'yes' || id === 'all';
      this.host.gateAnswer(g.id, allow, allow ? '' : 'The user denied this step.');
      if (!allow) this.panel.setTicker({ verb: '✕', target: t.denied, error: true });
      this.asking = false;
      this.nextAsk();
    };
    // in her chat if it's open, else she comes to you with it
    if (this.chat.interject(`${line}\n${quote}`, actions, (id) => {
      this.chat.panel.setActions([]);
      decide(id);
    })) return;
    let picked = 'no';
    await this.guide.scene(async () => {
      this.capri.wake();
      this.capri.perform('alarm', this.capri.towardCenter());
      picked = await this.guide.ask({ face: 'wide', line, quote, actions });
    });
    decide(picked || 'no');
  }
}
