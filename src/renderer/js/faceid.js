// Who's at your PC (with her camera on): you, someone you introduced, or someone she doesn't know.
//
// - "Learn my face" (her menu): a few seconds looking at the camera and she keeps your face as 128
//   numbers (face-api's recognition model: no picture), encrypted with your Windows account.
// - "This is my mom" (her chat) while someone else is in front of the camera: she keeps their face too.
// - "Tomorrow my mom will use the PC" (her chat): whoever sits there that day is a welcome guest.
// - With someone else at your PC (you not in the picture): she's polite and reserved, and keeps all of
//   yours to herself (your diary, your memories, what you do, your files); her comments on what's
//   done on the PC stop. Someone she doesn't know, and nobody let them: she asks who they are, and
//   (her menu › Lock if a stranger uses the PC) locks Windows after a little while.
// All of it on this PC: the camera picture never leaves it for this.

import { fmt } from './util.js';

const BASE = new URL('../../../', import.meta.url).href;
const SAME = 0.5;          // face distance under this: the same person
const EVERY = 3000;        // a look at who's there
const LOCK_AFTER = 25000;  // a stranger this long, nobody let them: locked

const WHO = /(?:minha|meu|a|o)\s+(m[ãa]e|pai|irm[ãa]o?|av[óô]|tia?|primo|prima|namorad[oa]|esposa|marido|filh[oa]|amig[oa]|chefe|colega|[A-ZÁÉÍÓÚÂÊÔÃÕ][\p{L}]+)/u;
export const FACE_ALLOW = /(hoje|amanh[ãa]|depois de amanh[ãa]|agora|segunda|ter[çc]a|quarta|quinta|sexta|s[áa]bado|domingo)?[^.!?]{0,40}?(?<![\p{L}])((?:minha|meu|a|o)\s+[\p{L}]+(?:\s+[\p{L}]+){0,2}?)\s+vai\s+usar\s+(?:o\s+|meu\s+)?(?:pc|computador|notebook)(?:[^.!?]{0,30}?(?<![\p{L}])(hoje|amanh[ãa]|depois de amanh[ãa]|segunda|ter[çc]a|quarta|quinta|sexta|s[áa]bado|domingo|por\s+\d+\s*h(?:oras?)?))?/iu;
// when, anywhere in the sentence: "na sexta minha namorada…", "…vai usar o pc amanhã", "por 3 horas"
export const FACE_WHEN = /(?<![\p{L}])(depois de amanh[ãa]|amanh[ãa]|hoje|agora|segunda|ter[çc]a|quarta|quinta|sexta|s[áa]bado|domingo|por\s+\d+\s*h(?:oras?)?)(?![\p{L}])/iu;
export const FACE_INTRO = /^(?:capri,?\s+)?(?:ess[ae]|aqui)\s+(?:é|e)\s+(?:a\s+|o\s+)?((?:minha|meu)\s+[\p{L}]+|[\p{L}]+)/iu;
export const FACE_LIST = /quem (?:pode|vai) usar o (?:pc|computador|notebook)|permiss[õo]es do (?:pc|computador)/i;
export const FACE_CANCEL = /(?:cancela|tira|remove)\s+(?:a\s+)?permiss[ãa]o\s+(?:d[aeo]\s+)?(.{2,30})/i;

// how she says who someone is: "minha mãe" -> "a mãe do Edu" (to them), "sua mãe" (to you); a name stays a name
const RELATIONS = { mae: 'a', pai: 'o', irmao: 'o', irma: 'a', avo: 'a', tio: 'o', tia: 'a', primo: 'o', prima: 'a', namorado: 'o', namorada: 'a', esposa: 'a', marido: 'o', filho: 'o', filha: 'a', amigo: 'o', amiga: 'a', chefe: 'o', colega: 'o' };
export function relation(name) {
  const bare = String(name || '').replace(/^(minha|meu|a|o)\s+/i, '').trim();
  const key = bare.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  return { bare, article: RELATIONS[key] || null };
}
const toThem = (name, owner) => {
  const { bare, article } = relation(name);
  return article ? `${article} ${bare}${owner ? ` d${article === 'a' ? 'o' : 'o'} ${owner}` : ''}` : bare;
};
const toYou = (name) => {
  const { bare, article } = relation(name);
  return article ? `${article === 'a' ? 'sua' : 'seu'} ${bare}` : bare;
};
const DAYS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
const plain = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

// the day (or hours) a permission covers: { from, to } in ms
function span(when) {
  const w = plain(when || 'hoje');
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const day = (offset) => ({ from: start.getTime() + offset * 86400000, to: start.getTime() + (offset + 1) * 86400000 - 1 });
  const hours = /por\s+(\d+)/.exec(w)?.[1];
  if (hours) return { from: Date.now(), to: Date.now() + Number(hours) * 3600000 };
  if (w === 'agora') return { from: Date.now(), to: Date.now() + 4 * 3600000 };
  if (w.startsWith('depois')) return day(2);
  if (w.startsWith('amanh')) return day(1);
  const wd = DAYS.findIndex((d) => plain(d).startsWith(w.slice(0, 3)));
  if (wd >= 0) return day((wd - new Date().getDay() + 7) % 7);
  return day(0);
}

export class FaceId {
  constructor({ capri, panel, brain, host, chat, guide, camera, voice, activity, look }) {
    Object.assign(this, { capri, panel, brain, host, chat, guide, camera, voice, activity, look });
    this.known = null;        // { owner: { d }, guests: [{ name, d }] }
    this.api = null;
    this.state = 'none';      // 'owner' | 'guest' | 'stranger' | 'none'
    this.guest = null;        // the guest's name, if known
    this.since = 0;
    this.strangerFace = null; // the last face she didn't know (to introduce)
    this.allow = [];
    this.lockStrangers = false;
    host.faceLoad().then((k) => { this.known = k; }).catch(() => {});
    setInterval(() => this.tick(), EVERY);
  }

  get t() {
    return this.brain.t.face;
  }

  configure({ faceAllow, lockStrangers }) {
    this.allow = Array.isArray(faceAllow) ? faceAllow : [];
    this.lockStrangers = lockStrangers === true;
  }

  get owner() {
    return this.brain.custom?.userName || '';
  }

  async load() {
    if (this.api) return this.api;
    const api = await import(`${BASE}node_modules/@vladmandic/face-api/dist/face-api.esm.js`);
    // read here and handed over: face-api's own loader only knows http:// and relative paths, not capri://
    const dir = `${BASE}assets/faceid`;
    const weights = async (name) => {
      const manifest = await (await fetch(`${dir}/${name}-weights_manifest.json`)).json();
      const map = {};
      for (const group of manifest) {
        const parts = await Promise.all(group.paths.map(async (p) => new Uint8Array(await (await fetch(`${dir}/${p}`)).arrayBuffer())));
        const all = new Uint8Array(parts.reduce((n, x) => n + x.length, 0));
        let at = 0;
        for (const x of parts) { all.set(x, at); at += x.length; }
        Object.assign(map, api.tf.io.decodeWeights(all.buffer, group.weights));
      }
      return map;
    };
    await api.nets.tinyFaceDetector.loadFromWeightMap(await weights('tiny_face_detector_model'));
    await api.nets.faceLandmark68TinyNet.loadFromWeightMap(await weights('face_landmark_68_tiny_model'));
    await api.nets.faceRecognitionNet.loadFromWeightMap(await weights('face_recognition_model'));
    this.api = api;
    return api;
  }

  // the faces in front of the camera right now, as 128 numbers each
  async faces() {
    const video = this.camera.video;
    if (!video || video.readyState < 2) return [];
    const api = await this.load();
    const found = await api.detectAllFaces(video, new api.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 }))
      .withFaceLandmarks(true).withFaceDescriptors();
    return found.map((f) => Array.from(f.descriptor));
  }

  static distance(a, b) {
    let s = 0;
    for (let i = 0; i < a.length; i++) s += (a[i] - b[i]) ** 2;
    return Math.sqrt(s);
  }

  // who a face is: 'owner', a guest's name, or null
  who(d) {
    if (!this.known) return null;
    if (this.known.owner && FaceId.distance(d, this.known.owner.d) < SAME) return 'owner';
    const g = (this.known.guests || []).map((x) => ({ ...x, dist: FaceId.distance(d, x.d) })).sort((a, b) => a.dist - b.dist)[0];
    return g && g.dist < SAME ? g.name : null;
  }

  // ---- learning your face ----

  async enroll() {
    const t = this.t;
    if (!this.camera.on) return this.panel.say({ kind: 'info', face: 'look', line: t.notOn, hold: 5000 });
    let line = t.enrollFail;
    await this.guide.scene(async () => {
      this.capri.perform('curious', this.capri.towardCenter());
      this.panel.say({ kind: 'info', face: 'look', line: t.enrollLook, hold: null, guide: true, token: Symbol('face') });
      if (!this.camera.stream) await this.camera.start();
      await this.load().catch(() => null);
      const shots = [];
      for (let i = 0; i < 14 && shots.length < 6; i++) {
        await new Promise((r) => setTimeout(r, 600));
        const f = await this.faces().catch(() => []);
        if (f.length === 1) shots.push(f[0]);
      }
      if (shots.length >= 4) {
        const d = shots[0].map((_, i) => shots.reduce((s, x) => s + x[i], 0) / shots.length);
        this.known = { ...(this.known || {}), owner: { d: d.map((x) => Math.round(x * 1e5) / 1e5), at: Date.now() }, guests: this.known?.guests || [] };
        await this.host.faceSave(this.known);
        line = fmt(t.enrollDone, { name: this.owner || '' });
      }
    });
    this.panel.say({ kind: line === t.enrollFail ? 'info' : 'done', face: line === t.enrollFail ? 'aside' : 'laugh', line, hold: 5000 });
  }

  forget() {
    this.known = null;
    this.setState('none');
  }

  // ---- in her chat: introductions and permissions (care.js asks) ----

  introduce(name) {
    const t = this.t;
    if (!this.strangerFace) return { line: t.introNone, face: 'look' };
    const clean = name.replace(/^(minha|meu)\s+/i, (m) => m.toLowerCase());
    const guests = (this.known?.guests || []).filter((g) => plain(g.name) !== plain(clean));
    this.known = { ...(this.known || {}), guests: [...guests, { name: clean, d: this.strangerFace.map((x) => Math.round(x * 1e5) / 1e5), at: Date.now() }] };
    this.host.faceSave(this.known);
    this.setState('guest', clean);
    return { line: fmt(t.introduced, { name: relation(clean).bare }), face: 'laugh' };
  }

  allowReply(asked) {
    const t = this.t;
    if (asked.op === 'list') {
      const now = Date.now();
      const live = this.allow.filter((a) => a.to > now);
      if (!live.length) return { line: t.allowNone, face: 'look' };
      return { line: `${t.allowList}\n${live.map((a) => `· ${toYou(a.who)}: ${new Date(a.from).toLocaleDateString()}${a.to - a.from < 86400000 - 1 ? ` (${new Date(a.from).toTimeString().slice(0, 5)}–${new Date(a.to).toTimeString().slice(0, 5)})` : ''}`).join('\n')}`, face: 'look' };
    }
    if (asked.op === 'cancel') {
      const keep = this.allow.filter((a) => !plain(a.who).includes(plain(asked.who)));
      this.host.setConfig({ faceAllow: keep });
      return { line: t.allowCancel, face: 'aside' };
    }
    const who = asked.who.trim();
    const w = span(asked.when);
    const next = [...this.allow.filter((a) => a.to > Date.now()), { who, ...w }].slice(-20);
    this.host.setConfig({ faceAllow: next });
    return { line: fmt(t.allowSet, { who: toYou(who), day: new Date(w.from).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' }) }), face: 'smug' };
  }

  allowedNow() {
    const now = Date.now();
    return this.allow.find((a) => a.from <= now && now <= a.to) || null;
  }

  // ---- who's there, every few seconds ----

  async tick() {
    if (!this.camera.on || !this.camera.stream || !this.known?.owner || this.busy) return;
    this.busy = true;
    try {
      const faces = await this.faces().catch(() => null);
      if (!faces) return;
      const ids = faces.map((d) => ({ d, who: this.who(d) }));
      if (ids.some((x) => x.who === 'owner')) return this.setState('owner');
      if (!ids.length) return this.setState('none');
      const guest = ids.find((x) => x.who && x.who !== 'owner');
      if (guest) return this.setState('guest', guest.who);
      this.strangerFace = ids[0].d;
      const allowed = this.allowedNow();
      if (allowed) return this.setState('guest', allowed.who);
      return this.setState('stranger');
    } finally {
      this.busy = false;
    }
  }

  setState(state, name = null) {
    const prev = this.state;
    const same = state === prev && name === this.guest;
    if (same) {
      if (state === 'stranger' && this.lockStrangers && !this.locked && Date.now() - this.since > LOCK_AFTER) {
        this.locked = true;
        this.host.lockPc();
      }
      return;
    }
    // a face gone for one look isn't gone: wait for the next before saying anyone left
    if (state === 'none' && prev !== 'none' && !this.goneOnce) {
      this.goneOnce = true;
      return;
    }
    this.goneOnce = false;
    this.state = state;
    this.guest = state === 'guest' ? name : null;
    this.since = Date.now();
    this.locked = false;
    // someone else at your PC: hers to keep to herself
    const privateMode = state === 'guest' || state === 'stranger';
    this.chat.visitor = privateMode ? { name: this.guest } : null;
    this.activity.privacy = privateMode;
    this.look.privacy = privateMode;
    this.camera.privacy = privateMode;
    const t = this.t;
    const say = (line, face = 'look', kind = 'info') => {
      if (this.capri.stowed || this.capri.mode === 'alert') return;
      this.capri.wake();
      this.capri.perform('curious', this.capri.towardCenter());
      this.panel.say({ kind, face, line, hold: 6000 });
    };
    if (state === 'guest') say(fmt(this.brain.line('face.guest'), { who: toThem(this.guest || '', this.owner), name: relation(this.guest).bare, owner: this.owner }), 'grin');
    else if (state === 'stranger') say(fmt(this.brain.line('face.stranger'), { owner: this.owner || t.ownerFallback }), 'wide', 'alert');
    else if (state === 'owner' && (prev === 'guest' || prev === 'stranger')) say(fmt(this.brain.line('face.ownerBack'), { name: this.owner }), 'laugh');
  }
}
