// Whether you're there, and what she does when you're not.
//
//   here     your face on the camera, or your keyboard and mouse going: she's as she always is
//   away     no face for a minute and a half and the PC still (no camera: five quiet minutes): no
//            looking at your screen, no comments on what's open (VS Code, your terminal), no AI
//            spent on any of it; of Claude Code only its final answer. She lives her own life: she
//            draws (and keeps the drawing for you), juggles, trains, explores, checks on the PC once.
//            The camera only glances now and then (a frame every 2 s instead of 4 a second).
//   asleep   away long enough (or tired): she goes to sleep, the camera off. Nothing wakes her but
//            you (a click on her, her chat, her name, her shortcut) or what can't wait (a reminder,
//            Claude asking for permission). Your keyboard and mouse don't: if you made her guard
//            the PC from strangers, she only opens one eye (the camera, a few seconds) to see who it is.
//
// Back, she tells you what happened while you were gone (Claude's answers, her tasks, her drawing).

import { fmt, rand } from './util.js';

const AWAY_FACE_MS = 90 * 1000;   // no face this long…
const AWAY_IDLE_S = 60;           // …and no keyboard or mouse this long
const AWAY_NO_CAMERA_S = 5 * 60;  // without a camera, five quiet minutes
const BACK_IDLE_S = 4;            // a key or the mouse within this: someone's there
const GLANCE_MS = 2000;           // the camera's pace while you're away
const TICK_MS = 4000;

export class Presence {
  constructor({ capri, panel, brain, host, camera, look, play, shell, life, heart, voice, chat, guide, art, face, hands }) {
    Object.assign(this, { capri, panel, brain, host, camera, look, play, shell, life, heart, voice, chat, guide, art, face, hands });
    this.state = 'here';
    this.since = Date.now();
    this.recap = [];       // what happened while you were away, to tell you
    this.sleepAt = 0;
    this.checked = 0;      // the day she last looked over the PC while you were away
    this.peekUntil = 0;
    this.enabled = true;
    setInterval(() => this.tick().catch(() => {}), TICK_MS);
  }

  get t() {
    return this.brain.t.presence;
  }

  get away() {
    return this.state !== 'here';
  }

  // the camera running, watching (not paused for a call, not put to sleep by her)
  cameraLive() {
    const c = this.camera;
    return Boolean(c?.on && c.stream && c.landmarker && !c.paused && !c.napping);
  }

  // something of yours going on that says you're here even if nothing moves
  busyWithYou() {
    return this.chat?.open || this.guide?.running || this.hands?.running || this.panel.current?.actions?.length;
  }

  async tick() {
    if (!this.enabled) return;
    const now = Date.now();
    const idle = await this.host.pcIdle().catch(() => 0);
    const face = this.camera?.lastFaceAt || 0;
    if (this.state === 'here') {
      if (this.busyWithYou()) return;
      const gone = this.cameraLive()
        ? now - Math.max(face, this.since) > AWAY_FACE_MS && idle >= AWAY_IDLE_S
        : idle >= AWAY_NO_CAMERA_S && !this.watchingSomething();
      if (gone) this.goAway();
      return;
    }
    if (this.state === 'away') {
      if ((this.cameraLive() && now - face < TICK_MS + 1500) || idle < BACK_IDLE_S || this.busyWithYou()) return this.back();
      if (now > this.sleepAt && this.capri.mode === 'idle' && !this.capri.busy && !this.art?.drawing) this.goSleep();
      return undefined;
    }
    // asleep: woken by you (her mode isn't sleep any more), or one eye open when the PC is used
    if (this.capri.mode !== 'sleep' && !this.capri.dormant) return this.woke();
    if (idle < BACK_IDLE_S && this.face?.lockStrangers && this.face?.known?.owner && now > this.peekUntil + 60000) this.peek();
    return undefined;
  }

  // a video or a game in front: you can be there without touching anything
  watchingSomething() {
    const w = this.capri.windows || {};
    return Boolean(w.fullscreen || w.game || w.call || (w.wins || []).find((x) => x.id === w.fg)?.max && /youtube|netflix|twitch|prime video|vlc|mpv|disney|max/i.test(String(w.title || '')));
  }

  quiet(on) {
    for (const m of [this.look, this.play, this.shell, this.life]) if (m) m.away = on;
    if (this.brain) this.brain.hushed = on; // (brain.away() is something else: Claude's window not in front)
    this.camera?.setRate?.(on ? (this.locked ? 1000 : GLANCE_MS) : null);
  }

  goAway() {
    this.state = 'away';
    this.since = Date.now();
    this.recap = [];
    // a nap after 10 to 25 minutes on her own, sooner when she's tired or it's late
    const tired = (this.heart?.energy ?? 60) < 35 || new Date().getHours() < 6;
    this.sleepAt = Date.now() + rand(10, 25) * 60000 * (tired ? 0.4 : 1);
    this.quiet(true);
    this.panel.clearKind?.('idle');
    // nobody to look at the screen: no reason to fuss on it
    if (this.capri.mode === 'idle' && !this.capri.busy) this.capri.perform('look', this.capri.towardCenter());
    this.checkPc();
  }

  goSleep() {
    if (this.locked) return; // the PC locked: the camera keeps watching who comes (lockwatch.js)
    this.state = 'asleep';
    // the camera rests too
    if (this.camera?.stream) {
      this.camera.napping = true;
      this.camera.stop({ keep: true });
    }
    this.voice?.play?.('purr');
    const c = this.capri;
    if (c.stance === 'sit' && c.lieDown) c.lieDown();
    c.setMode('sleep');
  }

  // you woke her (a click, her chat, her name…): awake, and the camera back to see who's there
  woke() {
    this.state = 'away';
    this.sleepAt = Date.now() + rand(8, 15) * 60000;
    this.wakeCamera();
  }

  wakeCamera() {
    const cam = this.camera;
    if (!cam?.napping) return;
    cam.napping = false;
    if (cam.on && !cam.paused) cam.start().then(() => cam.setRate?.(this.state === 'here' ? null : GLANCE_MS)).catch(() => {});
  }

  // asleep, the PC in use and she guards it: the camera a few seconds, for faceid.js to see who it is
  peek() {
    const cam = this.camera;
    if (!cam?.on || cam.paused) return;
    this.peekUntil = Date.now() + 8000;
    cam.napping = false;
    cam.start().catch(() => {});
    setTimeout(() => {
      if (this.state === 'asleep' && this.face?.state !== 'stranger') {
        cam.napping = true;
        cam.stop({ keep: true });
      }
    }, 8000);
  }

  // you're back: everything as it was, and what happened while you were gone
  back() {
    const was = Date.now() - this.since;
    this.state = 'here';
    this.since = Date.now();
    this.quiet(false);
    this.wakeCamera();
    const recap = this.recap.splice(0);
    const art = this.art?.last && this.art.last.at > Date.now() - was ? this.art.last : null;
    if (!recap.length && !art) return;
    const t = this.t;
    const lines = [was > 20 * 60000 ? t.backLong : t.back, ...recap.slice(-4)];
    if (art) lines.push(t.drew);
    setTimeout(() => {
      const c = this.capri;
      c.wake();
      c.perform('hop', c.towardCenter());
      this.panel.say({ kind: 'info', face: 'laugh', line: lines.join('\n'), hold: 9000 + recap.length * 2500 });
      if (art) {
        const h = c.head();
        this.art.show(Math.max(10, Math.min(window.innerWidth - 220, h.x + (h.x > window.innerWidth / 2 ? -260 : 60))), Math.max(10, h.y - 240));
      }
    }, 1200);
  }

  // what to tell you when you're back
  note(line) {
    if (!line || !this.away) return false;
    this.recap.push(line);
    return true;
  }

  // Claude Code's answer while you're away (brain.js): kept for you
  claudeDone(text, project) {
    const t = this.t;
    const said = String(text || '').replace(/\s+/g, ' ').trim();
    return this.note(fmt(project ? t.claudeIn : t.claude, { project, text: said.length > 140 ? `${said.slice(0, 139)}…` : said || '…' }));
  }

  // once a day while you're away: a look over the PC (Windows' own reports, nothing changed)
  async checkPc() {
    const day = new Date().toDateString();
    if (this.checked === day) return;
    this.checked = day;
    const r = await this.host.pcDo?.({ action: 'checkup' }).catch(() => null);
    const issues = (r?.issues || []).filter((i) => i.level >= 2);
    if (issues.length) this.note(fmt(this.t.pcIssues, { count: issues.length }));
  }
}
