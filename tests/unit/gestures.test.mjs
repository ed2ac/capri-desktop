import { R } from './setup.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
const { Gestures, headPose } = await import(R('gestures'));
const { linesFor } = await import(R('lines'));

function world() {
  const said = [];
  const capri = { wake() {}, perform() {}, towardCenter: () => 1, head: () => ({ x: 100, y: 100 }), mode: 'idle', busy: false, stance: 'stand', facing: 1, pos: { x: 1500 }, view: { w: 1920 }, endAct() {} };
  const g = new Gestures({ capri, panel: { say: (x) => said.push(x.line) }, brain: { t: linesFor('pt') }, host: { pcIdle: async () => 120 }, heart: { nudge() {} }, voice: {}, life: { float() {} }, daily: { focusReply: () => ({ line: 'FOCO' }) }, chat: {}, presence: { away: false } });
  let next = { gestures: [], landmarks: [] };
  g.recognizer = { recognizeForVideo: () => next };
  const show = (name, wristX = 0.5, tip = null) => {
    const hand = Array.from({ length: 21 }, () => ({ x: wristX, y: 0.5 }));
    if (tip) hand[8] = tip;
    next = { gestures: name ? [[{ categoryName: name, score: 0.9 }]] : [], landmarks: name ? [hand] : [] };
  };
  let t = Date.now();
  const step = (face) => { t += 450; g.frame({}, face, null, t); };
  return { g, said, show, step, capri };
}

test('a thumbs up held a moment: she answers once', () => {
  const { said, show, step } = world();
  show('Thumb_Up');
  step(); step(); step(); step(); step();
  assert.equal(said.length, 1);
  assert.match(said[0], /Preem|Valeu|demais/);
});

test('a wave: the wrist going side to side', () => {
  const { said, show, step } = world();
  for (const x of [0.4, 0.5, 0.4, 0.5, 0.4]) { show('Open_Palm', x); step(); }
  assert.match(said.join(' '), /Oi|Ei|Acenando/);
  assert.doesNotMatch(said.join(' '), /parei|Congelei/);
});

test('finger on your lips: shh, focus mode', () => {
  const { said, show, step } = world();
  const face = Array.from({ length: 20 }, () => ({ x: 0.5, y: 0.6 }));
  show('Pointing_Up', 0.5, { x: 0.51, y: 0.61 });
  step(face); step(face); step(face);
  assert.deepEqual(said, ['FOCO']);
});

test('head pose from the face matrix', () => {
  const id = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  assert.deepEqual(headPose({ data: id }), { pitch: 0, yaw: 0 });
  const a = (20 * Math.PI) / 180;
  const down = [1, 0, 0, 0, 0, Math.cos(a), Math.sin(a), 0, 0, -Math.sin(a), Math.cos(a), 0, 0, 0, 0, 1];
  assert.equal(Math.round(headPose(down).pitch), 20);
});

test('eye contact: she turns your way', () => {
  const { g, capri } = world();
  const face = Array.from({ length: 5 }, () => ({ x: 0.9, y: 0.5 })); // you on the left of the screen (mirrored)
  g.onPose({ pitch: 0, yaw: 0 }, face, Date.now());
  assert.equal(capri.facing, -1);
});

test('the beat of the music, from its loudness', async () => {
  const { tempo } = await import(R('hearing'));
  const bps = 93.75; // blocks per second at 48 kHz
  const at = (bpm) => Array.from({ length: Math.round(bps * 8) }, (_, i) => (i % Math.round((60 / bpm) * bps) === 0 ? 1 : 0.05));
  assert.ok(Math.abs(tempo(at(120), bps).bpm - 120) <= 2);
  assert.ok(Math.abs(tempo(at(90), bps).bpm - 90) <= 2);
  assert.equal(tempo(new Array(800).fill(0.1), bps), null);
});

test('two claps, a beat apart', async () => {
  const { Hearing } = await import(R('hearing'));
  const h = Object.create(Hearing.prototype);
  Object.assign(h, { blocksPerSecond: 93.75, envelope: [], bg: 0.01, onsets: [] });
  const silence = () => new Float32Array(4096).fill(0.001);
  const clap = () => { const c = silence(); for (let i = 0; i < 512; i++) c[i] = (i % 2 ? 0.6 : -0.6); return c; };
  h.blocks(clap());
  h.blocks(silence());
  h.blocks(clap()); // ~85 ms later in samples, but blocks are timed by when they arrive
  assert.equal(h.clapAt, undefined); // too close together
});

test('two claps 400 ms apart are two claps; a run of beats isn\'t', async () => {
  const { Hearing } = await import(R('hearing'));
  const real = performance.now.bind(performance);
  let clock = 100000;
  performance.now = () => clock;
  try {
    const fresh = () => Object.assign(Object.create(Hearing.prototype), { blocksPerSecond: 93.75, envelope: [], bg: 0.01, onsets: [] });
    const silence = () => new Float32Array(4096).fill(0.001);
    const clap = () => { const c = silence(); for (let i = 0; i < 512; i++) c[i] = (i % 2 ? 0.6 : -0.6); return c; };
    const h = fresh();
    h.blocks(clap()); clock += 400; h.blocks(clap());
    assert.ok(h.clapAt, 'two claps');
    const m = fresh();
    for (let i = 0; i < 4; i++) { m.blocks(clap()); clock += 400; }
    m.clapAt = 0;
    m.blocks(clap());
    assert.equal(m.clapAt, 0, 'a fifth beat in a row is music');
  } finally {
    performance.now = real;
  }
});
