// Light mode: when your PC needs everything it has, she takes up as little as she can. When it turns
// on is yours to pick (her menu › Light mode): in games (on by default), while Claude Code works,
// when the processor runs hot a while, on battery, or always.
//
// Light, she: looks through the camera only every couple of seconds (no gestures), stops listening to
// the room's sounds (her name still works), spends no local AI on comments or new lines, starts no
// conversations, doesn't draw and moves less, and lets Ollama put its model away (your graphics
// card's memory back for the game).

const CHECK_MS = 15000;
const HEAVY_CPU = 70;     // %, this long: the PC is busy, she lightens up…
const HEAVY_FOR = 20000;
const CALM_CPU = 50;      // …until it's under this, this long
const CALM_FOR = 45000;
const LAG_MS = 250;       // her own clock this late, a few times running: she's being starved too

export class Light {
  constructor({ capri, panel, brain, host, camera, gestures, hearing, speech, look, converse, life, face, hands }) {
    Object.assign(this, { capri, panel, brain, host, camera, gestures, hearing, speech, look, converse, life, face, hands });
    this.on = false;
    this.why = null;
    this.rules = { games: true, claude: false, heavy: false, battery: false, always: false };
    this.cpuHigh = 0;
    this.cpuLow = 0;
    this.lagged = [];
    this.battery = null;
    // her own heartbeat: when a 1-second timer comes this late, the PC (or she) is overloaded
    let expected = performance.now() + 1000;
    setInterval(() => {
      const now = performance.now();
      if (now - expected > LAG_MS) this.lagged = [...this.lagged.filter((t) => now - t < 30000), now];
      expected = now + 1000;
    }, 1000);
    navigator.getBattery?.().then((b) => { this.battery = b; }).catch(() => {});
    setInterval(() => this.check().catch(() => {}), CHECK_MS);
  }

  configure({ lightMode }) {
    if (lightMode && typeof lightMode === 'object') this.rules = { ...this.rules, ...lightMode };
    this.check().catch(() => {});
  }

  // why it should be on now, or null
  async reason() {
    const r = this.rules;
    if (r.always) return 'always';
    if (r.games && this.capri.windows?.game) return 'games';
    if (r.claude && (this.brain.busySessions?.length || this.hands?.running)) return 'claude';
    if (r.battery && this.battery && !this.battery.charging) return 'battery';
    if (r.heavy) {
      const now = Date.now();
      const cpu = await this.host.cpu?.().catch(() => null);
      if (cpu != null && cpu >= HEAVY_CPU) this.cpuHigh = this.cpuHigh || now;
      else if (cpu != null) this.cpuHigh = 0;
      if (cpu != null && cpu < CALM_CPU) this.cpuLow = this.cpuLow || now;
      else this.cpuLow = 0;
      const lagging = this.lagged.length >= 3;
      const busy = lagging || (this.cpuHigh && now - this.cpuHigh > HEAVY_FOR);
      // light because of it: stays light until the PC has been calm a while (no flapping)
      if (busy || (this.why === 'heavy' && !(this.cpuLow && now - this.cpuLow > CALM_FOR))) return 'heavy';
    }
    return null;
  }

  async check() {
    const why = await this.reason();
    if (Boolean(why) !== this.on) this.set(why);
    else this.why = why;
  }

  set(why) {
    this.on = Boolean(why);
    this.why = why;
    const on = this.on;
    // everything that costs: down (or back)
    if (this.camera) this.camera.light = on;
    this.camera?.setRate?.(on ? 2000 : (this.camera.presenceRate ?? null));
    if (this.gestures) this.gestures.light = on;
    if (this.face) this.face.light = on;
    if (this.hearing) this.hearing.light = on;
    if (this.speech) this.speech.light = on;
    if (this.look) this.look.light = on;
    if (this.converse) this.converse.light = on;
    if (this.life) this.life.light = on;
    if (on) this.host.localUnload?.().catch(() => {}); // Ollama's model off the graphics card
    // a word about it, when it's not a game (pc.js has her reactions to games)
    if (on && why !== 'games' && Date.now() - (this.saidAt || 0) > 30 * 60000) {
      this.saidAt = Date.now();
      this.panel.say({ kind: 'info', face: 'look', line: this.brain.t.light?.[why] || '', hold: 4000 });
    }
  }
}
