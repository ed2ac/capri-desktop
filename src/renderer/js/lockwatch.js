// While your PC is locked. Windows doesn't let any app show itself on the lock screen (it's a
// desktop of its own), but she keeps running behind it: the camera keeps looking (if it's on), and
// faceid.js says who's in front.
//
//   you        her happy sound, and a notification "Hi, Edu!" (shown on the lock screen if Windows
//              allows notifications there); unlocking, she greets you right away
//   a guest    a softer sound and a "Hi" for them
//   a stranger her hiss, a notification, and she writes down when and for how long; a photo of them
//              only if you turned that on (her menu, off by default), kept in ~/Capri/visitas
//
// Unlocked, she tells you who stood there while it was locked.

import { fmt } from './util.js';

const AGAIN_MS = 2 * 60000;  // the same person gone this long and back: greeted again
const LOCKED_RATE = 1000;    // the camera's pace while locked

export class LockWatch {
  constructor({ capri, panel, brain, host, camera, face, presence, voice }) {
    Object.assign(this, { capri, panel, brain, host, camera, face, presence, voice });
    this.on = false;
    this.snap = false;
    this.visits = [];      // strangers while locked: { from, to, file }
    this.greeted = {};     // who → when, this lock
    this.left = {};        // who → when they were last seen leaving
    host.onLockState?.(({ locked }) => (locked ? this.locked() : this.unlocked()));
    if (face) face.onState = (state, name, prev) => this.seen(state, name, prev);
  }

  get t() {
    return this.brain.t.lock;
  }

  configure({ lockSnap }) {
    this.snap = lockSnap === true;
  }

  locked() {
    if (this.on) return;
    this.on = true;
    this.at = Date.now();
    this.visits = [];
    this.greeted = {};
    this.left = {};
    if (this.face) this.face.screenLocked = true;
    if (this.presence) this.presence.locked = true;
    const cam = this.camera;
    if (!cam?.on || cam.paused) return;
    // asleep with the camera resting: it looks again while the PC is locked (she stays asleep)
    if (cam.napping || !cam.stream) {
      cam.napping = false;
      cam.start().then(() => cam.setRate?.(LOCKED_RATE)).catch(() => {});
    } else cam.setRate?.(LOCKED_RATE);
  }

  // faceid.js: someone else in front (it only says when it changes)
  seen(state, name, prev) {
    if (!this.on) return;
    const now = Date.now();
    const key = state === 'guest' ? `guest:${name}` : state;
    // whoever was there before is gone now
    const was = prev === 'guest' ? `guest:${this.lastGuest}` : prev;
    if (was && was !== key) this.left[was] = now;
    if (prev === 'stranger' && state !== 'stranger') this.closeVisit(now);
    if (state === 'guest') this.lastGuest = name;
    if (state === 'none') return;
    if (state === 'stranger') this.openVisit(now);
    const fresh = !this.greeted[key] || now - (this.left[key] || 0) > AGAIN_MS;
    if (!fresh) return;
    this.greeted[key] = now;
    const t = this.t;
    if (state === 'owner') {
      this.voice?.play('hello');
      this.notify(fmt(t.hi, { name: this.face.owner || t.you }));
    } else if (state === 'guest') {
      this.voice?.play('blip', { mood: 'info', ch: 'a' });
      this.notify(fmt(t.guest, { who: name }));
    } else if (state === 'stranger') {
      this.voice?.play('jealous');
      this.notify(t.stranger);
    }
  }

  notify(body) {
    this.host.lockNotify?.({ title: 'Capri', body });
  }

  openVisit(now) {
    const open = this.visits.find((v) => !v.to);
    if (open) return;
    const visit = { from: now, to: 0, file: null };
    this.visits.push(visit);
    if (this.snap) this.photo().then((file) => { visit.file = file; }).catch(() => {});
  }

  closeVisit(now) {
    const open = this.visits.find((v) => !v.to);
    if (open) open.to = now;
  }

  // a frame of the camera, as a JPEG in her workshop (only with "Photo of strangers" on)
  async photo() {
    const video = this.camera?.video;
    if (!video || video.readyState < 2) return null;
    const c = document.createElement('canvas');
    c.width = video.videoWidth || 640;
    c.height = video.videoHeight || 480;
    c.getContext('2d').drawImage(video, 0, 0, c.width, c.height);
    return this.host.saveVisit?.(c.toDataURL('image/jpeg', 0.85)) ?? null;
  }

  unlocked() {
    if (!this.on) return;
    this.on = false;
    const now = Date.now();
    this.closeVisit(now);
    if (this.face) this.face.screenLocked = false;
    if (this.presence) this.presence.locked = false;
    const t = this.t;
    const you = this.face?.state === 'owner' || (!this.face?.known?.owner && now - (this.camera?.lastFaceAt || 0) < 10000);
    const lines = [];
    if (you) lines.push(fmt(t.welcome, { name: this.face?.owner || t.you }));
    const clock = (ms) => new Date(ms).toLocaleTimeString(this.brain.lang === 'en' ? 'en' : 'pt-BR', { hour: '2-digit', minute: '2-digit' });
    const visits = this.visits.filter((v) => v.to - v.from > 2500 || v.file);
    for (const v of visits.slice(-3)) {
      const mins = Math.max(1, Math.round((v.to - v.from) / 60000));
      lines.push(fmt(v.to - v.from < 60000 ? t.strangerWhileShort : t.strangerWhile, { time: clock(v.from), mins }) + (v.file ? ` ${t.photo}` : ''));
    }
    this.camera?.setRate?.(this.presence?.away ? 2000 : null);
    if (!lines.length) {
      // nobody seen, and she was asleep: the camera rests again
      if (this.presence?.state === 'asleep' && this.camera?.stream) {
        this.camera.napping = true;
        this.camera.stop({ keep: true });
      }
      return;
    }
    // you're back: awake (unlocking is coming back to her), and what she saw
    const c = this.capri;
    c.wake();
    setTimeout(() => {
      c.perform(visits.length ? 'curious' : 'hop', c.towardCenter());
      this.panel.say({ kind: 'info', face: visits.length ? 'wide' : 'laugh', line: lines.join('\n'), hold: 6000 + visits.length * 3000 });
    }, 900);
  }
}
