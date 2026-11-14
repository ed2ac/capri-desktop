// Play: what she does with your pointer, how her moods show in her body, and her mischief.
//
// - Shooed: wave your pointer at her fast, back and forth (faster than petting), and she flinches
//   and teleports to the other side of the screen. Again and again and she's offended: she keeps
//   away for a while, and may pay you back.
// - Poked: click her over and over and she's annoyed; more, and she zaps your pointer.
// - Stared at: your pointer resting on her, still, and she notices.
// - Her moods in her body: angry or sulking, she glares and huffs now and then; happy, she hops
//   and spins; in the middle of the night she yawns and tells you to sleep; ignored for an hour
//   while you're there, she's bored and comes looking for attention.
// - Mischief (her menu › Mischief): to pay you back, or out of boredom, a harmless prank: she
//   stomps on the window she sits on and it shakes, she blinks your keyboard's lights, or (Bold)
//   she tugs your pointer toward her. Short, rare, everything put back as it was, and never while
//   you type, play, are in a call or watch something full screen.

import { rand, fmt } from './util.js';

const NEAR = 220;                 // px around her head the pointer counts as "at her"
const SHOO_SPEED = 1500;          // px/s: faster than a stroke
const SHOO_TURNS = 3;             // back-and-forths…
const SHOO_WINDOW = 1100;         // …within this
const POKES = 4;                  // clicks within POKE_WINDOW: poked
const POKES_MAD = 7;
const POKE_WINDOW = 3500;
const STARE_MS = 2600;
const BORED_AFTER = 60 * 60000;   // no attention this long, while you're there
const PRANK_EVERY = { light: 15 * 60000, bold: 8 * 60000 };
const PAYBACK_EVERY = 2 * 60000;  // provoked: sooner

export class Play {
  constructor({ capri, panel, brain, voice, host, bond, chat, guide, busyLife }) {
    Object.assign(this, { capri, panel, brain, voice, host, bond, chat, guide });
    this.busyLife = busyLife;  // () => a game or a call going on
    this.level = 'light';      // her menu › Mischief: 'off' | 'light' | 'bold'
    this.annoy = 0;            // 0…10, wears off
    this.track = [];           // pointer samples near her: { x, y, t }
    this.turns = [];           // times of fast direction changes
    this.dir = 0;
    this.shooAt = -Infinity;
    this.pokes = [];
    this.still = { x: 0, y: 0, since: 0, said: 0 };
    this.attentionAt = Date.now();
    this.prankAt = 0;
    this.keepAway = 0;         // she stays away from your pointer until then
    this.madAway = false;
    this.lateDay = '';
    this.mouse = null;
    setInterval(() => this.tick(), 30000);
    setInterval(() => this.watchStill(), 500);
    setInterval(() => { this.annoy = Math.max(0, this.annoy - 1); }, 25000);
  }

  get t() {
    return this.brain.t.play;
  }

  // free to react: not in the middle of something more important
  get free() {
    const c = this.capri;
    return !c.busy && !c.dragging && !c.hidden && !c.stowed && !c.dormant && !c.sky && !c.act
      && c.mode !== 'alert' && c.mode !== 'sleep' && !this.away && !this.watching && !this.chat.open && !this.guide.running && !this.panel.current?.actions?.length;
  }

  attention() {
    this.attentionAt = Date.now();
  }

  say(path, face, hold = 3000) {
    this.panel.say({ kind: 'info', face, line: this.brain.line(path), hold });
  }

  // ---- the pointer ----

  onPointer(x, y) {
    const now = performance.now();
    this.mouse = { x, y };
    if (Math.hypot(x - this.still.x, y - this.still.y) > 6) this.still = { x, y, since: now, said: this.still.said };
    const h = this.capri.head();
    // tag: your pointer close, and she's off (but she lets you catch her now and then)
    const g = this.game;
    if (g?.kind === 'tag' && Math.hypot(x - h.x, y - h.y) < 170 * this.capri.scale && now - g.at > 1300 && !this.capri.busy && g.dodges < 6) {
      g.at = now;
      g.dodges++;
      this.capri.teleport(this.capri.spot('random'));
      return;
    }
    if (Math.hypot(x - h.x, y - h.y) > NEAR * this.capri.scale + 60) {
      this.track = [];
      return;
    }
    const last = this.track[this.track.length - 1];
    this.track.push({ x, y, t: now });
    while (this.track.length > 6) this.track.shift();
    if (!last) return;
    const dt = Math.max(1, now - last.t) / 1000;
    const dx = x - last.x;
    const speed = Math.abs(dx) / dt;
    if (speed < SHOO_SPEED || Math.abs(dx) < 8) return;
    const d = Math.sign(dx);
    if (this.dir && d !== this.dir) {
      this.turns.push(now);
      this.turns = this.turns.filter((t) => now - t < SHOO_WINDOW);
      if (this.turns.length >= SHOO_TURNS && now - this.shooAt > 4000) { // one wave, one shoo
        this.turns = [];
        this.shooAt = now;
        this.shoo(x, y);
      }
    }
    this.dir = d;
  }

  shoo(x) {
    if (!this.free) return;
    this.attention();
    this.annoy = Math.min(10, this.annoy + 3);
    const mad = this.annoy >= 6;
    const c = this.capri;
    c.wake();
    c.perform('flinch', x < c.pos.x ? 1 : -1);
    this.voice.play('bolt', { soft: true });
    this.say(mad ? 'play.shooMad' : 'play.shoo', mad ? 'aside' : 'wide', 2600);
    if (!['angry', 'sulk'].includes(this.bond.feeling)) this.bond.feel('shooed');
    this.keepAway = Date.now() + (mad ? 10 : 3) * 60000;
    this.madAway = mad;
    const { w } = c.view;
    const side = 150 * c.scale + 30;
    setTimeout(() => {
      if (c.busy || c.dragging) return;
      c.teleport({ x: x < w / 2 ? w - side : side, y: c.floor });
      if (mad) setTimeout(() => this.prank({ provoked: true }), 3500);
    }, 500);
  }

  // her tag on your screen, glitching, for a few seconds (drawn over her own window: nothing touched)
  graffiti() {
    const el = document.createElement('div');
    el.className = 'capri-graffiti';
    el.textContent = this.t.graffiti?.[Math.floor(Math.random() * this.t.graffiti.length)] || 'CAPRI WAS HERE';
    const { w, h } = this.capri.view;
    Object.assign(el.style, {
      position: 'fixed', left: `${Math.round(w * (0.2 + Math.random() * 0.4))}px`, top: `${Math.round(h * (0.2 + Math.random() * 0.4))}px`,
      font: '900 64px "Chakra Petch", sans-serif', color: '#ff2a3d', textShadow: '4px 0 #00f0ff, -4px 0 #b026ff', letterSpacing: '6px',
      transform: `rotate(${Math.round(Math.random() * 16 - 8)}deg)`, pointerEvents: 'none', zIndex: 9999, opacity: 0, transition: 'opacity .15s',
      mixBlendMode: 'screen',
    });
    document.body.appendChild(el);
    requestAnimationFrame(() => { el.style.opacity = 0.92; });
    let n = 0;
    const glitch = setInterval(() => {
      el.style.clipPath = Math.random() < 0.5 ? `inset(${Math.random() * 60}% 0 ${Math.random() * 30}% 0)` : 'none';
      el.style.transform = `translate(${Math.random() * 10 - 5}px, 0) rotate(${Math.round(Math.random() * 16 - 8)}deg)`;
      if (++n > 40) {
        clearInterval(glitch);
        el.style.opacity = 0;
        setTimeout(() => el.remove(), 300);
      }
    }, 110);
    return true;
  }

  // ---- her minigame: reflex. She counts down, then flashes; click her as fast as you can ----
  reflex() {
    if (!this.free || this.game) return false;
    this.game = { kind: 'reflex', go: 0 };
    this.say('play.reflexStart', 'smug', 2600);
    const wait = 2500 + Math.random() * 3500;
    setTimeout(() => {
      if (this.game?.kind !== 'reflex') return;
      this.game.go = performance.now();
      this.capri.perform('alarm', this.capri.towardCenter());
      this.voice.play('bolt');
      this.panel.say({ kind: 'alert', face: 'wide', line: this.t.reflexGo, hold: 2500 });
      setTimeout(() => this.game?.kind === 'reflex' && this.reflexEnd(null), 3000);
    }, wait);
    return true;
  }

  reflexEnd(ms) {
    this.game = null;
    const best = this.best?.() ?? null;
    if (ms == null) return this.say('play.reflexSlow', 'smug', 3000);
    const record = best == null || ms < best;
    this.onScore?.(ms, record);
    this.heart?.nudge(record ? 'found' : 'attention');
    this.capri.perform(record ? 'spin' : 'hop', this.capri.towardCenter());
    this.panel.say({ kind: 'done', face: record ? 'laugh' : 'smug', line: fmt(this.t[record ? 'reflexRecord' : 'reflexScore'], { ms: Math.round(ms), best: best ? Math.round(best) : '—' }), hold: 4500 });
  }

  // double-click: a twirl, just for you
  onDouble() {
    if (!this.free) return;
    this.attention();
    this.heart?.nudge('attention');
    this.capri.perform('spin', this.capri.towardCenter());
    this.voice.play('blip', { mood: 'info' });
  }

  // holding your click on her, still: a hug
  onHug() {
    if (!this.free) return;
    this.attention();
    this.heart?.nudge('pet');
    this.bond.add?.('pet', 2);
    this.capri.perform('petted', 0);
    this.voice.play('purr');
    this.say(this.heart && this.heart.mood < 35 ? 'play.hugDown' : 'play.hug', 'smug', 3000);
  }

  // ---- games ----

  // Hide and seek: she vanishes to an edge of the screen and peeks from there; find her (a click)
  // before she gives up. Shy as ever, she ducks to another edge when your pointer comes close.
  hideAndSeek() {
    if (!this.free || !this.capri.peek) return false;
    this.game = { kind: 'hide', until: Date.now() + 3 * 60000 };
    this.say('play.hideStart', 'smug', 2600);
    setTimeout(() => this.capri.peek(), 900);
    setTimeout(() => this.gameOver(false), 3 * 60000);
    return true;
  }

  // Tag: in a great mood, she dares you to catch her; your pointer near her and she's gone.
  tag() {
    if (!this.free) return false;
    this.game = { kind: 'tag', until: Date.now() + 45000, dodges: 0, at: 0 };
    this.capri.perform('hop', this.capri.towardCenter());
    this.say('play.tagStart', 'laugh', 2600);
    setTimeout(() => this.gameOver(false), 45000);
    return true;
  }

  // caught (or found), or time's up
  gameOver(won) {
    const g = this.game;
    if (!g) return;
    this.game = null;
    const c = this.capri;
    if (won) {
      this.heart?.nudge('found');
      this.bond.add?.('play', 3);
      if (c.stance === 'peek') c.unpeek?.({});
      c.celebrate?.({ onSpeak: () => this.say(g.kind === 'hide' ? 'play.found' : 'play.caught', 'laugh', 4000) });
    } else {
      if (g.kind === 'hide' && c.stance === 'peek') c.unpeek?.({});
      this.say(g.kind === 'hide' ? 'play.hideGiveUp' : 'play.tagWin', 'smug', 3500);
    }
  }

  // A click on her (app.js). True if it was one poke too many and she answered that instead.
  onClick() {
    this.attention();
    if (this.game?.kind === 'reflex') { // her minigame: too early, or your time
      if (!this.game.go) {
        this.game = null;
        this.say('play.reflexEarly', 'laugh', 2600);
      } else this.reflexEnd(performance.now() - this.game.go);
      return true;
    }
    if (this.game) { // found! caught!
      this.gameOver(true);
      return true;
    }
    const now = Date.now();
    this.pokes = [...this.pokes.filter((t) => now - t < POKE_WINDOW), now];
    if (this.pokes.length < POKES || !this.free) return false;
    const mad = this.pokes.length >= POKES_MAD;
    this.annoy = Math.min(10, this.annoy + 2);
    const c = this.capri;
    c.perform('flinch', this.mouse && this.mouse.x < c.pos.x ? 1 : -1);
    this.say(mad ? 'play.pokeMad' : 'play.poke', mad ? 'aside' : 'smug', 2400);
    if (!['angry', 'sulk'].includes(this.bond.feeling)) this.bond.feel('poked');
    if (mad) {
      this.pokes = [];
      setTimeout(() => this.mouse && c.zap(this.mouse.x, this.mouse.y), 600); // the zap: just light, on her side
      setTimeout(() => this.prank({ provoked: true }), 2500);
    }
    return true;
  }

  // your pointer resting on her, still
  watchStill() {
    const now = performance.now();
    const s = this.still;
    if (!s.since || now - s.since < STARE_MS || now - s.said < 10 * 60000) return;
    if (!this.capri.hit(s.x, s.y) || !this.free) return;
    s.said = now;
    this.attention();
    this.capri.perform('curious', s.x < this.capri.pos.x ? -1 : 1);
    this.say('play.stare', 'smug', 2600);
  }

  // ---- her moods, in her body ----

  tick() {
    if (!this.free || this.busyLife()) return;
    const now = Date.now();
    const c = this.capri;
    const feeling = this.bond.feeling;
    // back from keeping away after being shooed off for good
    if (this.madAway && now > this.keepAway) {
      this.madAway = false;
      c.perform('hop', c.towardCenter());
      this.say('play.back', 'look', 3000);
      return;
    }
    // the middle of the night, and you're still up
    const hour = new Date().getHours();
    const day = new Date().toDateString();
    if (hour >= 1 && hour < 5 && this.lateDay !== day && this.recentlyActive()) {
      this.lateDay = day;
      c.perform('stretch');
      this.say('play.late', 'aside', 4500);
      return;
    }
    // in the mood to play (and close enough to you): a game
    const h = this.heart;
    if (h && !this.game && this.bond.stage >= 1 && this.recentlyActive() && Math.random() < 0.08) {
      if (h.mood > 72 && h.energy > 60 && this.tag()) return;
      if (h.boredom > 55 && h.energy > 35 && (Math.random() < 0.5 ? this.reflex() : this.hideAndSeek())) return;
    }
    // ignored for an hour while you're right there
    if (now - this.attentionAt > BORED_AFTER && this.recentlyActive() && this.bond.stage >= 1) {
      this.attention();
      this.bond.feel('bored');
      c.perform('hop', c.towardCenter());
      this.say('play.bored', 'look', 4000);
      if (Math.random() < 0.5) setTimeout(() => this.prank({}), 3000);
      return;
    }
    // drained (deep in the night, a long day): she yawns, and dozes off while you're not around
    if (this.heart && this.heart.energy < 25 && Math.random() < 0.3) {
      if (this.recentlyActive()) c.perform('stretch');
      else c.doze?.();
      return;
    }
    // how she feels shows: a glare or a huff when cross, a hop or a spin when happy
    if (Math.random() < 0.2 * (this.heart?.mischief || 1)) {
      if (['angry', 'sulk', 'shooed', 'poked'].includes(feeling)) c.perform(Math.random() < 0.5 ? 'glare' : 'huff', c.towardCenter());
      else if (['happy', 'fun', 'petted', 'pranked', 'forgiven'].includes(feeling)) c.perform(Math.random() < 0.6 ? 'hop' : 'spin', c.towardCenter());
    }
  }

  recentlyActive() {
    return this.lastMove && performance.now() - this.lastMove() < 90000;
  }

  // ---- mischief ----

  // Something harmless on your PC: payback (provoked) or out of boredom. Light: a window she sits on
  // shakes, or your keyboard's lights blink. Bold: your pointer, tugged toward her, too.
  async prank({ provoked = false } = {}) {
    if (this.level === 'off' || !this.free || this.busyLife() || this.fullScreen() || (this.obs && this.obsMode !== 'show')) return false;
    const now = Date.now();
    const every = (provoked ? PAYBACK_EVERY : PRANK_EVERY[this.level] || PRANK_EVERY.light) / (this.heart?.mischief || 1);
    if (now - this.prankAt < every) return false;
    const c = this.capri;
    const idle = await this.host.pcIdle().catch(() => 0); // seconds since your last key or move
    const options = [];
    if (c.stance === 'sit' && c.perch && c.perch.id !== 'taskbar') options.push('shake');
    if (idle >= 2) options.push('blink');
    options.push('graffiti', 'notify');
    if (c.stance === 'sit' && c.perch && c.perch.id !== 'taskbar') options.push('slide');
    if (this.level === 'bold' && this.mouse && !c.dragging) options.push('tug', 'jail');
    if (this.level === 'bold' && idle >= 3) options.push('mute');
    if (!options.length) return false;
    const kind = options[Math.floor(Math.random() * options.length)];
    this.prankAt = now;
    let ok = false;
    if (kind === 'shake') {
      c.perform('plop');
      ok = await this.host.prank('shake', { id: c.perch.id, ms: 450 });
    } else if (kind === 'blink') {
      c.perform('hop', c.towardCenter());
      ok = await this.host.prank('blink');
    } else if (kind === 'graffiti') {
      c.perform('curious', c.towardCenter());
      ok = this.graffiti();
    } else if (kind === 'notify') {
      // a "notification" sound from nowhere: then her laugh
      this.voice.play('remind');
      ok = true;
    } else if (kind === 'slide') {
      c.perform('plop');
      ok = await this.host.prank('slide', { id: c.perch.id, dx: Math.random() < 0.5 ? -80 : 80 });
    } else if (kind === 'jail') {
      const h = c.head();
      ok = await this.host.prank('jail', { x: h.x, y: h.y + 60 * c.scale, ms: 1500 });
    } else if (kind === 'mute') {
      c.perform('huff', c.towardCenter());
      ok = await this.host.prank('mute');
    } else {
      // her lightning hits your pointer, then reels it in
      const h = c.head();
      if (!c.zap(this.mouse.x, this.mouse.y)) c.perform('curious', this.mouse.x < c.pos.x ? -1 : 1);
      await new Promise((r) => setTimeout(r, 260));
      ok = await this.host.prank('tug', { x: h.x, y: h.y + 40 * c.scale, ms: 320 });
    }
    if (!ok) return false;
    this.voice.play('bolt', { soft: true });
    this.bond.feel('pranked');
    setTimeout(() => this.say(`play.${kind}`, 'laugh', 3000), 350);
    return true;
  }

  // a video or a game full screen in front: hands off
  fullScreen() {
    const { wins = [], fg } = this.capri.windows || {};
    const win = wins.find((w) => w.id === fg);
    const { w, h } = this.capri.view;
    return Boolean(win && win.x <= 0 && win.y <= 0 && win.w >= w && win.h >= h - 2);
  }
}
