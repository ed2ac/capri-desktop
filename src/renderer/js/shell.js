// Your terminal, as she feels it (hooks/capri-shell.sh, sourced from your ~/.bashrc or ~/.zshrc): a
// command that failed, one that took a while, a git push or commit, tests that pass. Her own lines,
// no AI: it's instant and nothing leaves your PC. Her menu › React to my terminal turns it off
// (main.js then doesn't even pass the events on).

import { pick, fmt, duration, basename } from './util.js';

const FAIL_EVERY = 20 * 1000;  // failures in a row: one word about them, not one each
const SAY_EVERY = 8 * 1000;    // anything else
const TESTS = /(?:^|\s)(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?test\b|\b(?:jest|vitest|mocha|pytest|phpunit|rspec)\b|\b(?:cargo|go|dotnet|mvn|gradle)\s+test\b|node\s+--test/;
const PUSH = /^git\s+push\b/;
const COMMIT = /^git\s+commit\b/;

const clip = (text, max) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);
// "npm run build -- --watch" -> "npm run build": what to call it in a sentence
function short(command) {
  const words = command.replace(/^(?:sudo|time|env\s+\S+=\S+)\s+/, '').split(/\s+/).filter(Boolean);
  const out = [];
  for (const w of words) {
    if (/^[-|&;>]/.test(w) || out.length >= 3) break;
    out.push(w);
  }
  return clip(out.join(' ') || words[0] || '?', 32);
}

export class Shell {
  constructor({ capri, panel, brain, voice, chat, guide }) {
    Object.assign(this, { capri, panel, brain, voice, chat, guide });
    this.failAt = -Infinity;
    this.saidAt = -Infinity;
  }

  get t() {
    return this.brain.t.shell;
  }

  // not in the middle of something that matters more: Claude needing you, her chat, her guide
  get quiet() {
    const { capri } = this;
    return capri.mode !== 'alert' && !this.chat.open && !this.guide.running && !capri.dragging && !capri.hidden;
  }

  handle(evt) {
    const command = String(evt.command || '').trim();
    if (!command || !this.quiet || this.away) return;
    const code = Number(evt.exit_code) || 0;
    const ms = Number(evt.duration_ms) || 0;
    const now = Date.now();
    const vars = { cmd: short(command), code, time: duration(ms, this.brain.lang) };
    const extra = { tag: evt.cwd ? basename(evt.cwd) : 'TERMINAL', log: [{ verb: '$', target: clip(command, 70), error: code !== 0 }] };
    if (this.capri.stowed) return; // put away: her eyes only open for Claude needing you

    if (code !== 0) {
      if (now - this.failAt < FAIL_EVERY) return;
      this.failAt = now;
      this.capri.wake();
      this.capri.hurt();
      this.voice.play('error');
      const line = fmt(pick(ms >= 60000 ? this.t.longFail : this.t.fail), vars);
      // in one of your projects: a button to have Claude look at it (hands.js)
      const project = this.hands?.projectAt(String(evt.cwd || ''));
      const fix = project && !this.hands.running ? { actions: [{ id: 'fix', label: this.brain.t.hands.fixIt, primary: true }], onAction: () => this.hands.fixFailure({ command, code, cwd: evt.cwd }) } : {};
      this.panel.say({ kind: 'error', face: pick(['laugh', 'wide']), line, hold: project ? 12000 : 6000, ...extra, ...fix });
      this.onFail?.();
      return;
    }
    if (now - this.saidAt < SAY_EVERY) return;
    let lines = null;
    let face = 'grin';
    if (PUSH.test(command)) lines = this.t.push;
    else if (COMMIT.test(command)) { lines = this.t.commit; face = 'smug'; }
    else if (TESTS.test(command)) lines = this.t.tests;
    else if (ms >= 15000) lines = this.t.long;
    if (!lines) return;
    this.saidAt = now;
    this.capri.wake();
    this.capri.perform('hop', this.capri.towardCenter());
    this.voice.play(ms >= 60000 ? 'done' : 'tick');
    this.panel.say({ kind: 'done', face, line: fmt(pick(lines), vars), hold: 5000, ...extra });
    this.onWin?.(lines === this.t.tests ? 'tests' : lines === this.t.push ? 'push' : 'other');
  }
}
