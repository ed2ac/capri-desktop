// Her eye on your PC's safety (Windows): she reads what Windows says (main guard.js) and tells you,
// in her words. She doesn't replace Windows Security: she points you to it.
//
// On her own (her menu › React to my PC):
// - now and then, a look at Windows' protection: Defender or its real-time protection off, the
//   firewall down, old virus definitions, the disk's health, the space left, a restart pending for
//   days, the battery worn out. Each one said once a day at most, with a button to fix it there.
// - a program that just started launching with Windows: "was that you?", and a button to turn it off.
// - a program or a script that just landed in Downloads: who signed it, and a button to have
//   Defender check it.
// In her chat: "do a checkup", "scan for viruses", "full cleanup".

import { fmt } from './util.js';

const EVERY = 45 * 60000;        // a look at Windows' protection
const FIRST = 4 * 60000;
const GB = 1024 ** 3;

export class Guard {
  constructor({ capri, panel, brain, host, guide, look, care }) {
    Object.assign(this, { capri, panel, brain, host, guide, look, care });
    this.enabled = true;            // her menu › React to my PC
    this.said = {};                 // issue -> day she last told you
    this.known = null;              // what starts with Windows, as she last saw it
    this.queue = [];                // what she has to tell you, when she's free
    setTimeout(() => this.look_(), FIRST);
    setInterval(() => this.look_(), EVERY);
    setInterval(() => this.deliver(), 20000);
    host.onDownload?.((file) => this.onDownload(file));
  }

  get t() {
    return this.brain.t.guard;
  }

  configure({ pcReact, knownStartup }) {
    this.enabled = pcReact !== false;
    if (Array.isArray(knownStartup) && !this.known) this.known = new Set(knownStartup);
  }

  // ---- on her own ----

  async look_() {
    if (!this.enabled) return;
    const r = await this.host.pcDo({ action: 'checkup' }).catch(() => null);
    const today = new Date().toDateString();
    for (const issue of r?.issues || []) {
      if (this.said[issue.key] === today || issue.level < 2 && Math.random() < 0.5) continue;
      this.said[issue.key] = today;
      this.queue.push({ kind: 'issue', issue });
      break; // one at a time
    }
    await this.startups();
  }

  // what starts with Windows now, against what she knew: anything new is worth a question
  async startups() {
    const all = await this.host.pcDo({ action: 'startup' }).catch(() => null);
    if (!Array.isArray(all)) return;
    const names = all.filter((s) => s.on).map((s) => s.name);
    if (!this.known) { // the first time: that's how your PC is, nothing to say
      this.known = new Set(names);
      this.host.setConfig({ knownStartup: [...this.known] });
      return;
    }
    const fresh = all.filter((s) => s.on && !this.known.has(s.name));
    for (const s of fresh) this.queue.push({ kind: 'startup', item: s });
    if (fresh.length) {
      fresh.forEach((s) => this.known.add(s.name));
      this.host.setConfig({ knownStartup: [...this.known] });
    }
  }

  onDownload(file) {
    if (this.enabled) this.queue.push({ kind: 'download', file });
  }

  // one thing at a time, when she's free to come and say it
  async deliver() {
    if (!this.queue.length || !this.look.free() || this.busy) return;
    const next = this.queue.shift();
    this.busy = true;
    try {
      if (next.kind === 'issue') await this.tellIssue(next.issue);
      else if (next.kind === 'startup') await this.tellStartup(next.item);
      else await this.tellDownload(next.file);
    } finally {
      this.busy = false;
    }
  }

  ask(line, actions, { face = 'look', quote = '' } = {}) {
    let picked = null;
    return this.guide.scene(async () => {
      this.capri.wake();
      this.capri.perform('alarm', this.capri.towardCenter());
      picked = await this.guide.ask({ face, line, quote, actions });
    }).then(() => picked);
  }

  async tellIssue(issue) {
    const t = this.t;
    const line = fmt(t.issues[issue.key], issue.vars || {});
    const fix = ['av', 'realtime', 'firewall', 'signatures'].includes(issue.key);
    const id = await this.ask(line, [
      ...(fix ? [{ id: 'open', label: t.openSecurity, primary: true }] : []),
      { id: 'later', label: t.later, primary: !fix },
    ], { face: issue.level >= 3 ? 'wide' : 'look' });
    if (id === 'open') this.host.pcDo({ action: 'openSecurity' });
  }

  async tellStartup(item) {
    const t = this.t;
    const app = item.label || item.name;
    const id = await this.ask(fmt(t.startupNew, { app }), [{ id: 'keep', label: t.keep }, { id: 'off', label: t.disable, primary: true }]);
    if (id !== 'off') return;
    const r = await this.host.pcDo({ action: 'setStartup', name: item.name, on: false }).catch(() => null);
    this.panel.say({ kind: 'info', face: r?.ok ? 'smug' : 'aside', line: fmt(r?.ok ? t.startupOff : t.startupAdmin, { app }), hold: 5000 });
  }

  async tellDownload(file) {
    const t = this.t;
    const program = /^(exe|msi|msix|appx|bat|cmd|ps1|vbs|js|jar|scr|com)$/.test(file.ext);
    const sig = program ? await this.host.pcDo({ action: 'signature', path: file.file }).catch(() => null) : null;
    const how = !program ? t.sigArchive
      : sig?.status === 'Valid' ? fmt(t.sigValid, { signer: sig.signer || '?' })
        : sig?.status === 'NotSigned' ? t.sigNone : t.sigBad;
    const id = await this.ask(fmt(t.download, { name: file.name, how }), [
      { id: 'scan', label: t.downloadScan, primary: true }, { id: 'no', label: t.later },
    ], { face: sig?.status === 'Valid' ? 'look' : 'wide' });
    if (id !== 'scan') return;
    this.panel.say({ kind: 'work', face: 'look', line: t.scanningFile, hold: 60000 });
    const r = await this.host.pcDo({ action: 'scanFile', path: file.file }).catch(() => null);
    const line = r?.clean ? fmt(t.fileClean, { name: file.name })
      : r && r.clean === false ? fmt(t.fileThreat, { name: file.name, threat: r.threat ? ` (${r.threat})` : '' })
        : fmt(t.fileFailed, { name: file.name });
    if (r && r.clean === false) {
      this.capri.hurt();
      this.onThreat?.();
    }
    this.panel.say({ kind: r?.clean === false ? 'error' : 'done', face: r?.clean ? 'smug' : 'wide', line, hold: 8000 });
  }

  // ---- in her chat (care.js) ----

  async checkupReply() {
    const t = this.t;
    const r = await this.host.pcDo({ action: 'checkup' });
    if (!r) return null;
    const d = r.defender;
    const facts = [
      d ? fmt(d.on && d.realtime ? t.factDefender : t.factDefenderOff, { days: d.sigDays }) : '',
      (r.firewall || []).length ? ((r.firewall || []).every((f) => f.on) ? t.factFirewall : t.factFirewallOff) : '',
      r.updateDays != null ? fmt(t.factUpdates, { days: r.updateDays }) : '',
      r.freeGB != null ? fmt(t.factSpace, { free: Math.round(r.freeGB), total: Math.round(r.totalGB) }) : '',
      (r.disks || []).length ? ((r.disks || []).every((x) => /healthy|íntegro|saud/i.test(x.health)) ? t.factDisk : t.factDiskBad) : '',
      r.batteryHealth ? fmt(t.factBattery, { health: r.batteryHealth }) : '',
    ].filter(Boolean);
    const problems = (r.issues || []).filter((i) => i.level >= 2).map((i) => fmt(t.issues[i.key], i.vars || {}));
    const line = [problems.length ? fmt(t.checkupIssues, { count: problems.length }) : t.checkupGood, ...problems, facts.join(' · ')].join('\n');
    return {
      line, face: problems.length ? 'look' : 'smug',
      buttons: [{ id: 'scan', label: t.quickScan, primary: true }, { id: 'open', label: t.openSecurity }],
      onButton: (id) => (id === 'open' ? (this.host.pcDo({ action: 'openSecurity' }), { line: t.opened, face: 'smug' }) : this.scanReply()),
    };
  }

  scanReply() {
    const t = this.t;
    return {
      line: t.scanning, face: 'look',
      later: this.host.pcDo({ action: 'quickScan' }).then((r) => {
        if (r?.clean) return { line: t.scanClean, face: 'laugh' };
        if (r && r.clean === false) {
          this.capri.hurt();
          this.onThreat?.();
          return { line: t.scanThreat, face: 'wide' };
        }
        this.host.pcDo({ action: 'openSecurity' });
        return { line: t.scanFailed, face: 'aside' };
      }),
    };
  }

  // Everything that can be cleaned, at once: then each part with its own buttons (care.js)
  async cleanAllReply() {
    const t = this.t;
    const [space, startup, updates] = await Promise.all([
      this.host.pcDo({ action: 'space' }).catch(() => null),
      this.host.pcDo({ action: 'startup' }).catch(() => null),
      this.host.pcDo({ action: 'updates' }).catch(() => null),
    ]);
    const parts = [];
    const buttons = [];
    const free = space ? space.temp + space.bin : 0;
    if (free >= 20 * 1024 ** 2) {
      parts.push(fmt(t.partTemp, { size: this.care.size(free) }));
      buttons.push({ id: 'space', label: fmt(t.btnTemp, { size: this.care.size(free) }) });
    }
    if (space?.big?.length) {
      parts.push(fmt(t.partBig, { count: space.big.length, size: this.care.size(space.big.reduce((s, f) => s + f.size, 0)) }));
      if (!buttons.some((b) => b.id === 'space')) buttons.push({ id: 'space', label: t.btnBig });
    }
    const boot = Array.isArray(startup) ? startup.filter((s) => s.on) : [];
    if (boot.length >= 5) {
      parts.push(fmt(t.partStartup, { count: boot.length }));
      buttons.push({ id: 'startup', label: t.btnStartup });
    }
    if (Array.isArray(updates) && updates.length) {
      parts.push(fmt(t.partUpdates, { count: updates.length }));
      buttons.push({ id: 'updates', label: fmt(t.btnUpdates, { count: updates.length }) });
    }
    buttons.push({ id: 'duplicates', label: t.btnDuplicates });
    if (!parts.length) return { line: t.cleanNothing, face: 'smug', buttons: buttons.slice(-1), onButton: () => this.care.now({ what: 'duplicates', where: 'downloads' }) };
    buttons[0].primary = true;
    return {
      line: fmt(t.cleanAll, { list: this.care.list(parts) }), face: 'look', buttons,
      onButton: (id) => this.care.now(id === 'duplicates' ? { what: 'duplicates', where: 'downloads' } : { what: id }),
    };
  }
}

export { GB };
