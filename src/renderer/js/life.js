// Her life of her own: what she does when nobody needs her. Instead of a move every minute or so,
// a whole repertoire, picked by her heart (energy, mood, boredom), the hour, and what's around her:
//
//   watch     she goes over to the window you're working in and watches, curious
//   hum       she hums to herself (her babble, no words), little notes floating up
//   doodle    she draws something small on your screen (a heart, a star, a cat, a skull…), it fades
//   juggle    she juggles the shards of her mane
//   workout   hop, spin, split, stretch: her little training
//   explore   she hops from window to window, sitting on each a moment
//   sneak     your pointer still for a while: she creeps up on it… and bolts when it moves
//   nap       drained, on a ledge or a corner: a nap
//   stars     she looks up for the satellite
//   muse      she says something to herself (her AI's idle lines), rarely
//   classic   what she always did: sit, peek, teleport, a flourish
//   draw      (alone, presence.js) a real drawing, stroke by stroke, kept for you (art.js)
//   read      (alone) she sits with a little book a while
//
// Alone (you're away), nothing that's about you (watching your window, sneaking up on your pointer,
// muttering at you): her own things, more often.
//
// It only takes over her idle moments (capri.wanderStep), and her next move comes sooner when she's
// lively, later when she's tired.

import { pick, rand, reducedMotion } from './util.js';

// where to sit on a window: somewhere along its top edge
const seat = (w) => ({ win: w, dx: Math.max(60, Math.min(Math.max(60, w.w - 190), w.w * rand(0.2, 0.6))) });
const DOODLES = ['♥', '★', '☾', '✦', '=^.^=', '☠', '♪', '⚡', '◉‿◉', '<3', '∞', '☆彡'];

export class Life {
  constructor({ capri, panel, brain, voice, fx, heart, play, activity }) {
    Object.assign(this, { capri, panel, brain, voice, fx, heart, play, activity });
    this.base = capri.wanderStep.bind(capri);
    capri.wanderStep = () => this.step();
    // back to her rest spot (the taskbar) only when she feels like resting: soon when drained, after a
    // few minutes out and about otherwise
    this.homeIn = 150000;
    capri.homeAfter = () => (this.heart && this.heart.energy < 30 ? 15000 : this.homeIn);
    this.lastMove = performance.now();
    this.mutterAt = 0;
    // her next move sooner when she's lively (the original waits 25–70 s)
    setInterval(() => this.pace(), 5000);
  }

  // a question of hers on screen (her guide, buttons in her panel): she stays put, or the panel
  // would walk away from under your click
  holding() {
    return Boolean(this.guide?.running || this.panel.current?.actions?.length || this.panel.current?.guide);
  }

  pace() {
    const c = this.capri;
    if (c.mode !== 'idle' || c.busy || !c.wander || this.holding()) return;
    const h = this.heart;
    const lively = h ? (h.energy / 100) * (0.6 + h.boredom / 120) : 0.6;
    const wait = 30000 - lively * 18000; // ~12 s lively and bored … ~30 s drained
    if (performance.now() > this.lastMove + wait && c.nextMove > performance.now() + 4000) c.nextMove = performance.now();
  }

  // what she feels like doing, weighted
  choices() {
    const h = this.heart || { energy: 60, mood: 60, boredom: 20 };
    const c = this.capri;
    const night = new Date().getHours() < 6;
    const still = this.play?.mouse && performance.now() - (this.lastPointer || 0) > 8000;
    if (this.away) {
      return [
        ['draw', this.art && !this.art.drawing && Date.now() - (this.drewAt || 0) > 5 * 60000 ? 3 : 0],
        ['doodle', 1.2], ['juggle', h.energy > 30 ? 2 : 0.5], ['workout', h.energy > 45 ? 1.8 : 0.3],
        ['explore', (c.windows?.wins || []).length >= 2 ? 1.5 : 0], ['stroll', 2], ['hum', 2], ['stars', 1.2],
        ['read', 1.5], ['clock', 0.5], ['nap', h.energy < 35 ? 2 : 0], ['classic', 1],
      ].filter(([, w]) => w > 0);
    }
    return [
      ['classic', 2],
      ['stroll', h.energy > 35 ? 3 : 0.5],
      ['clock', 0.7],
      ['watch', this.frontWindow() ? 2.5 : 0],
      ['hum', 1.5 + (h.mood > 60 ? 1 : 0)],
      ['doodle', h.boredom > 30 ? 1.8 : 0.6],
      ['juggle', h.energy > 50 ? 1.4 : 0.3],
      ['workout', h.energy > 65 ? 1.6 : 0.2],
      ['explore', (c.windows?.wins || []).length >= 2 && h.energy > 40 ? 1.6 : 0],
      ['sneak', still && h.boredom > 25 ? 2 : 0],
      ['nap', h.energy < 35 || night ? 3 : 0],
      ['stars', night || h.mood < 40 ? 1.5 : 0.4],
      ['muse', Date.now() - this.mutterAt > 15 * 60000 ? 0.8 : 0],
    ].filter(([, w]) => w > 0);
  }

  step() {
    if (this.holding()) return; // she stays where your click is going
    this.lastMove = performance.now();
    this.capri.lastActivity = performance.now(); // what she does counts as doing something
    this.homeIn = rand(120000, 240000);
    const c = this.capri;
    if (!c.wander || c.stance === 'peek' || c.lounge || this.play?.game) return this.base();
    const list = this.choices();
    let r = Math.random() * list.reduce((s, [, w]) => s + w, 0);
    const [what] = list.find(([, w]) => (r -= w) < 0) || ['classic'];
    try {
      (this[what] || this.classic).call(this);
    } catch {
      this.base();
    }
  }

  classic() {
    this.base();
  }

  // a walk along the bottom of the screen: little hops, anime style, a look around at the end
  async stroll() {
    const c = this.capri;
    if (c.busy || c.walking) return this.base();
    const { w } = c.view;
    const side = 150 * c.scale + 30;
    if (c.stance !== 'stand' || Math.abs(c.pos.y - c.floor) > 4) {
      await c.teleport({ x: Math.max(side, Math.min(w - side, c.pos.x)), y: c.floor });
    }
    const target = rand(side, w - side);
    const dir = Math.sign(target - c.pos.x) || 1;
    c.facing = dir;
    c.walking = true;
    const step = 46 * c.scale;
    try {
      for (let i = 0; i < 40 && Math.abs(target - c.pos.x) > step; i++) {
        if (c.busy || c.dragging || c.mode !== 'idle' || c.stance !== 'stand') break;
        c.pos = { x: c.pos.x + dir * step, y: c.floor };
        c.place();
        if (i % 3 === 0) c.perform('hop', dir);
        await new Promise((r) => setTimeout(r, rand(260, 340)));
      }
    } finally {
      c.walking = false;
    }
    if (c.mode === 'idle' && !c.busy) c.perform(Math.random() < 0.5 ? 'look' : 'curious', -dir);
    return undefined;
  }

  // a visit to the clock by the tray: she looks at it, and sometimes tells you the time
  async clock() {
    const c = this.capri;
    await c.teleport({ x: c.view.w - 170 * c.scale - 40, y: c.floor }, { face: 1 });
    c.perform('curious', 1);
    if (Math.random() < 0.4) {
      const time = new Date().toTimeString().slice(0, 5);
      setTimeout(() => this.panel.say({ kind: 'idle', face: 'look', line: this.brain.line('life.clock').replaceAll('{time}', time), hold: 3500 }), 900);
    }
  }

  frontWindow() {
    const { wins = [], fg } = this.capri.windows || {};
    return wins.find((w) => w.id === fg && !w.max && w.w > 300) || null;
  }

  // she goes over to the window you're in and watches what you're doing there
  async watch() {
    const c = this.capri;
    const w = this.frontWindow();
    if (!w) return this.base();
    if (c.canSit?.(w) && Math.random() < 0.5) return c.sitOn(seat(w));
    const side = w.x > c.view.w / 2 ? -1 : 1;
    const x = Math.max(120, Math.min(c.view.w - 120, side > 0 ? w.x + w.w + 90 : w.x - 90));
    await c.teleport({ x, y: c.floor }, { face: side > 0 ? -1 : 1 });
    c.perform('curious', side > 0 ? -1 : 1);
  }

  // humming: her babble with no words, a few notes floating up
  hum() {
    const c = this.capri;
    c.perform('look', c.towardCenter());
    const notes = Math.round(rand(6, 12));
    for (let i = 0; i < notes; i++) {
      setTimeout(() => {
        if (c.busy || c.mode !== 'idle') return;
        this.voice.play('blip', { mood: 'info', ch: pick(['a', 'o', 'e', 'u', 'i']), at: i / notes, face: this.heart?.mood > 60 ? 'grin' : 'look' });
        if (i % 3 === 0) this.float(pick(['♪', '♫']), c.head().x + rand(-20, 30), c.head().y - 40, 1400);
      }, i * rand(180, 320));
    }
  }

  // something small drawn on your screen near her, fading (drawn over, nothing touched)
  doodle() {
    const c = this.capri;
    c.perform('curious', c.towardCenter());
    const h = c.head();
    const x = h.x + rand(-160, 160);
    const y = h.y + rand(-140, 40);
    setTimeout(() => this.float(pick(DOODLES), x, y, 4500, { size: rand(34, 60), rotate: rand(-20, 20), still: true }), 500);
  }

  // juggling the shards of her mane
  juggle() {
    const c = this.capri;
    c.perform('hop', c.towardCenter());
    for (let i = 0; i < 7; i++) setTimeout(() => !c.busy && c.shed?.(), i * 160);
    setTimeout(() => !c.busy && c.perform('spin', c.towardCenter()), 1300);
  }

  // her little training
  workout() {
    const c = this.capri;
    ['hop', 'hop', 'spin', 'split', 'stretch'].forEach((m, i) => setTimeout(() => !c.busy && c.mode === 'idle' && c.perform(m, i % 2 ? 1 : -1), i * 1100));
  }

  // window to window, a moment on each
  async explore() {
    const c = this.capri;
    const seats = (c.windows?.wins || []).filter((w) => !w.max && c.canSit?.(w)).sort(() => Math.random() - 0.5).slice(0, 3);
    if (!seats.length) return this.base();
    for (const w of seats) {
      if (c.busy || c.mode !== 'idle') return undefined;
      await c.sitOn(seat(w));
      await new Promise((r) => setTimeout(r, rand(2500, 5000)));
    }
    return undefined;
  }

  // your pointer still: she creeps up on it… and bolts when it moves (play.js sees it move)
  async sneak() {
    const c = this.capri;
    const m = this.play?.mouse;
    if (!m) return this.base();
    const to = c.summonSpot(m);
    await c.teleport({ x: (to.x + c.pos.x) / 2, y: to.y }, { face: m.x < c.pos.x ? -1 : 1 });
    c.perform('crouch', m.x < c.pos.x ? -1 : 1);
    this.sneaking = { at: { ...m }, since: performance.now() };
  }

  // your pointer moved while she crept up on it: caught! she bolts
  onPointer(x, y) {
    this.lastPointer = performance.now();
    const s = this.sneaking;
    if (!s || Math.hypot(x - s.at.x, y - s.at.y) < 15) return;
    this.sneaking = null;
    if (performance.now() - s.since > 20000) return;
    const c = this.capri;
    c.perform('flinch', x < c.pos.x ? 1 : -1);
    this.voice.play('bolt', { soft: true });
    setTimeout(() => !c.busy && c.teleport(c.spot('random')), 350);
  }

  // drained: a nap (on her ledge she lies down, else she dozes where she is)
  nap() {
    const c = this.capri;
    if (c.stance === 'sit') return c.lieDown?.();
    c.perform('stretch');
    return setTimeout(() => c.mode === 'idle' && !c.busy && c.doze?.(), 1500);
  }

  stars() {
    this.capri.gaze?.();
  }

  // alone: a real drawing, near her, kept in her workshop for you
  async draw() {
    const c = this.capri;
    if (!this.art || c.busy) return this.base();
    this.drewAt = Date.now();
    const size = 220;
    const h = c.head();
    const right = h.x < window.innerWidth / 2;
    const x = Math.max(10, Math.min(window.innerWidth - size - 50, right ? h.x + 70 : h.x - size - 110));
    const y = Math.max(10, Math.min(window.innerHeight - size - 90, h.y - size / 2));
    c.facing = right ? 1 : -1;
    c.perform('curious', right ? 1 : -1);
    const done = await this.art.draw({ x, y, size, reduced: reducedMotion.matches });
    if (done && !c.busy) c.perform('hop', right ? 1 : -1);
    return undefined;
  }

  // alone: a little book, a while
  read() {
    const c = this.capri;
    c.perform('look', c.towardCenter());
    const h = c.head();
    this.float('📖', h.x + 20 * c.facing, h.y + 30, 9000, { size: 30, still: true });
    for (let i = 1; i <= 3; i++) setTimeout(() => !c.busy && c.mode === 'idle' && this.float(pick(['…', '?', '!', '♪']), h.x + rand(-10, 40), h.y - 30, 1800), i * 2600);
  }

  // a word to herself, now and then
  muse() {
    this.mutterAt = Date.now();
    this.capri.perform('look', this.capri.towardCenter());
    this.panel.say({ kind: 'idle', face: 'aside', line: this.brain.line('idle'), hold: 4000 });
  }

  // a symbol floating up (or staying, for a doodle) over her window, then gone
  float(text, x, y, ms, { size = 26, rotate = 0, still = false } = {}) {
    const el = document.createElement('div');
    el.textContent = text;
    Object.assign(el.style, {
      position: 'fixed', left: `${Math.round(x)}px`, top: `${Math.round(y)}px`, font: `700 ${Math.round(size)}px "Chakra Petch", sans-serif`,
      color: pick(['#ff2a3d', '#00f0ff', '#b026ff', '#ffffff']), textShadow: '2px 0 #b026ff, -2px 0 #00f0ff', pointerEvents: 'none',
      zIndex: 9998, opacity: 0, transform: `rotate(${rotate}deg)`, transition: `opacity .3s, transform ${ms}ms linear`,
    });
    document.body.appendChild(el);
    requestAnimationFrame(() => {
      el.style.opacity = 0.9;
      if (!still) el.style.transform = `translateY(-80px) rotate(${rotate}deg)`;
    });
    setTimeout(() => { el.style.opacity = 0; }, ms - 300);
    setTimeout(() => el.remove(), ms);
  }
}
