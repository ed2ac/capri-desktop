// Her senses: what she feels of you and of the screen around her, and how her body answers.
//
// Your keyboard and mouse (her menu › Feel my keyboard and mouse, off until you turn it on): only
// counts come in (windows.ps1), never which key. From them: you typing fast for a while, erasing a
// lot, hammering Enter, typing nonstop for half an hour; clicking hard on one spot (rage clicks), a
// click right next to her. Her answer is mostly her body (a glance, a flinch, a little bounce), a
// word now and then.
//
// The screen (always, from the window tracking): the window you switch to (she glances at it), a
// window that just opened (she may hop onto it), the desktop shown with everything minimized (she
// has the screen to herself), and your pointer shaken hard (she gets dizzy watching it).

const near = (a, b, r) => Math.hypot(a.x - b.x, a.y - b.y) < r;

export class Senses {
  constructor({ capri, panel, brain, voice, heart, bond, play, guide, host }) {
    Object.assign(this, { capri, panel, brain, voice, heart, bond, play, guide, host });
    this.on = false;
    this.asked = false;
    this.rate = [];          // [{ t, keys, back, enter }] the last minute or so
    this.typingSince = 0;    // when this run of typing began
    this.lastKeyAt = 0;
    this.clicks = [];        // recent clicks: { x, y, t }
    this.said = {};          // what she said when, to keep it rare
    this.seenWins = null;
    this.lastFg = null;
    this.glanceAt = 0;
    this.shake = { turns: [], dir: 0, x: 0, at: 0 };
    host.onSense?.((s) => this.onInput(s));
  }

  get t() {
    return this.brain.t.senses;
  }

  configure({ senseInput, senseAsked }) {
    this.on = senseInput === true;
    this.asked = Boolean(senseAsked);
  }

  // From her menu: on (she says what it means first) or off.
  async setOn(on) {
    if (!on) return this.host.setConfig({ senseInput: false });
    if (!this.asked) {
      let yes = false;
      await this.guide.scene(async () => {
        this.capri.perform('curious', this.capri.towardCenter());
        yes = (await this.guide.ask({ face: 'look', line: this.t.ask, quote: this.t.what, actions: [{ id: 'yes', label: this.t.yes, primary: true }, { id: 'no', label: this.t.no }] })) === 'yes';
      });
      if (!yes) return undefined;
      this.asked = true;
    }
    await this.host.setConfig({ senseInput: true, senseAsked: true });
    this.panel.say({ kind: 'info', face: 'smug', line: this.t.on, hold: 3500 });
    return undefined;
  }

  // free to answer with her body (and rarely a word)
  get free() {
    const c = this.capri;
    // (in the middle of a little animation is fine: she answers over it)
    return !c.busy && !c.dragging && !c.hidden && !c.stowed && !c.dormant && c.mode !== 'alert' && !this.play?.game && !this.guide?.running;
  }

  // a word, at most once per `every` ms for this kind
  word(kind, every, face = 'smug', vars = {}) {
    const now = Date.now();
    if (now - (this.said[kind] || 0) < every) return false;
    this.said[kind] = now;
    const line = this.brain.line(`senses.${kind}`);
    this.panel.say({ kind: 'info', face, line: Object.entries(vars).reduce((l, [k, v]) => l.replaceAll(`{${k}}`, v), line), hold: 4000 });
    return true;
  }

  // ---- your keyboard and mouse ----

  onInput(s) {
    if (!this.on) return;
    const now = Date.now();
    if (s.keys) {
      if (now - this.lastKeyAt > 20000) this.typingSince = now;
      this.lastKeyAt = now;
    }
    this.rate.push({ t: now, ...s });
    this.rate = this.rate.filter((r) => now - r.t < 60000);
    for (const c of s.clicks || []) this.onClick(c, now);
    if (!this.free) return;
    const last = (ms) => this.rate.filter((r) => now - r.t < ms);
    const sum = (list, k) => list.reduce((a, r) => a + (r[k] || 0), 0);
    const half = last(30000);
    const keys30 = sum(half, 'keys');
    const kpm = sum(this.rate, 'keys');
    // a burst of Enter
    if (sum(last(5000), 'enter') >= 8) {
      this.capri.perform('flinch', this.capri.towardCenter());
      return void this.word('enter', 10 * 60000, 'wide');
    }
    // erasing a lot
    if (keys30 >= 40 && sum(half, 'back') / keys30 > 0.35) {
      this.capri.perform('curious', this.capri.towardCenter());
      return void this.word('erasing', 15 * 60000, 'smug');
    }
    // typing fast, a good while: she watches, a little bounce now and then, a word rarely
    if (kpm >= 250) {
      if (Math.random() < 0.15) this.capri.perform(this.capri.stance === 'sit' ? 'look' : 'hop', this.capri.towardCenter());
      this.heart?.nudge('attention');
      if (now - this.typingSince > 30 * 60000) return void this.word('longTyping', 40 * 60000, 'look');
      return void this.word('typingFast', 20 * 60000, 'laugh');
    }
  }

  onClick(c, now) {
    const me = this.capri.head();
    const pos = { x: c.x, y: c.y };
    this.clicks = [...this.clicks.filter((k) => now - k.t < 1500), { ...pos, t: now }];
    if (!this.free) return;
    // rage clicks: five or more on the same spot in a second and a half
    const same = this.clicks.filter((k) => near(k, pos, 50));
    if (same.length >= 5) {
      this.clicks = [];
      this.capri.perform('glare', pos.x < this.capri.pos.x ? -1 : 1);
      this.heart?.nudge('poke');
      this.heart?.nudge('userStress'); // your frustration rubs off on her
      return void this.word('rageClick', 10 * 60000, 'aside');
    }
    // a click right next to her (not on her): she startles, or looks at it
    if (near(me, pos, 170 * this.capri.scale) && !this.capri.hit(pos.x, pos.y)) {
      this.capri.perform(Math.random() < 0.5 ? 'flinch' : 'curious', pos.x < this.capri.pos.x ? -1 : 1);
    }
  }

  // ---- the screen around her (always) ----

  onWindows({ wins = [], fg }) {
    const now = Date.now();
    const ids = new Set(wins.map((w) => w.id));
    const c = this.capri;
    if (this.seenWins && this.free) {
      // everything minimized: the desktop is hers
      if (this.seenWins.size >= 2 && wins.length === 0) {
        this.capri.perform('spin', c.towardCenter());
        this.word('desktop', 20 * 60000, 'laugh');
        setTimeout(() => this.free && c.teleport(c.spot('random')), 1800);
      } else {
        // a window that just opened: she may hop onto it
        const fresh = wins.find((w) => !this.seenWins.has(w.id) && w.id === fg && w.w > 400 && w.h > 250 && !w.max);
        if (fresh && Math.random() < 0.25 && c.canSit?.(fresh) && c.mode === 'idle') {
          setTimeout(() => this.free && c.sitOn?.({ win: fresh, dx: Math.max(60, Math.min(fresh.w - 190, fresh.w * 0.4)) }), 900);
        } else if (fg && fg !== this.lastFg && now - this.glanceAt > 15000 && c.mode !== 'sleep') {
          // you switched windows: a glance at the one in front
          const w = wins.find((x) => x.id === fg);
          if (w) {
            this.glanceAt = now;
            c.perform('curious', w.x + w.w / 2 < c.pos.x ? -1 : 1);
          }
        }
      }
    }
    this.seenWins = ids;
    this.lastFg = fg;
  }

  // your pointer shaken hard, anywhere (big fast swings): she gets dizzy watching it
  onPointer(x, y) {
    const now = performance.now();
    const s = this.shake;
    const dx = x - s.x;
    s.x = x;
    if (Math.abs(dx) < 25) return;
    const d = Math.sign(dx);
    if (s.dir && d !== s.dir) {
      s.turns = [...s.turns.filter((t) => now - t < 1200), now];
      if (s.turns.length >= 6 && this.free && near(this.capri.head(), { x, y }, 900) && !near(this.capri.head(), { x, y }, 260)) {
        s.turns = [];
        this.capri.perform('spin', this.capri.towardCenter());
        this.word('dizzy', 10 * 60000, 'wide');
      }
    }
    s.dir = d;
  }
}
