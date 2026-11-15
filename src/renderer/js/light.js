// Light mode: when your PC needs everything it has, she takes up as little as she can. When it turns
// on is yours to pick (her menu › Light mode): in games (on by default), while Claude Code works,
// when the processor runs hot a while, on battery, or always.
//
// Light, she: looks through the camera only every couple of seconds (no gestures), stops listening to
// the room's sounds (her name still works), spends no local AI on comments or new lines, starts no
// conversations, doesn't draw and moves less, and lets Ollama put its model away (your graphics
// card's memory back for the game).

const CHECK_MS = 15000;
const HEAVY_CPU = 75;     // %, over a minute
const HEAVY_FOR = 60000;

export class Light {
  constructor({ capri, panel, brain, host, camera, gestures, hearing, speech, look, converse, life, face, hands }) {
    Object.assign(this, { capri, panel, brain, host, camera, gestures, hearing, speech, look, converse, life, face, hands });
    this.on = false;
    this.why = null;
    this.rules = { games: true, claude: false, heavy: false, battery: false, always: false };
    this.cpuHigh = 0;
    this.battery = null;
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
      const cpu = await this.host.cpu?.().catch(() => null);
      if (cpu != null && cpu >= HEAVY_CPU) this.cpuHigh = this.cpuHigh || Date.now();
      else if (cpu != null) this.cpuHigh = 0;
      if (this.cpuHigh && Date.now() - this.cpuHigh > HEAVY_FOR) return 'heavy';
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
