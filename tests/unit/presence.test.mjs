import { R } from './setup.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
const { Presence } = await import(R('presence'));

// a Capri, a camera and a PC as small as presence.js needs them
function world({ camera = true } = {}) {
  const said = [];
  const capri = { mode: 'idle', busy: false, dormant: false, stance: 'stand', windows: {}, setMode(m) { this.mode = m; }, perform() {}, wake() { this.mode = 'idle'; }, towardCenter: () => 1, head: () => ({ x: 500, y: 400 }) };
  const cam = { on: camera, stream: camera ? {} : null, landmarker: {}, paused: false, napping: false, lastFaceAt: Date.now(), rate: null,
    setRate(ms) { this.rate = ms; }, stop() { this.stream = null; }, start() { this.stream = {}; return Promise.resolve(); } };
  const pc = { idle: 0 };
  const look = {}; const play = {}; const shell = {}; const life = {}; const brain = { t: { presence: { back: 'voltou', backLong: 'voltou!', drew: 'desenhei', claude: 'Claude: {text}', claudeIn: 'Claude em {project}: {text}', pcIssues: '{count}' } } };
  const p = new Presence({
    capri, camera: cam, look, play, shell, life, brain, chat: {}, guide: {}, hands: {},
    panel: { current: null, say: (x) => said.push(x.line), clearKind() {} },
    host: { pcIdle: async () => pc.idle, pcDo: async () => ({ issues: [] }) },
  });
  p.enabled = true;
  return { p, capri, cam, pc, look, brain, said };
}

test('nobody at the camera and the PC still: away, quiet, the camera only glancing', async () => {
  const { p, cam, pc, look, brain } = world();
  cam.lastFaceAt = Date.now() - 2 * 60000;
  p.since = Date.now() - 2 * 60000;
  pc.idle = 120;
  await p.tick();
  assert.equal(p.state, 'away');
  assert.equal(look.away, true);
  assert.equal(brain.hushed, true);
  assert.equal(cam.rate, 2000);
});

test('your face seen, or not but you typing: not away', async () => {
  const a = world();
  a.cam.lastFaceAt = Date.now();
  a.pc.idle = 300;
  await a.p.tick();
  assert.equal(a.p.state, 'here');
  const b = world();
  b.cam.lastFaceAt = Date.now() - 5 * 60000;
  b.p.since = 0;
  b.pc.idle = 2;
  await b.p.tick();
  assert.equal(b.p.state, 'here');
});

test('away long enough: asleep with the camera off; your keyboard doesn\'t wake her, a click does', async () => {
  const { p, capri, cam, pc } = world();
  cam.lastFaceAt = 0;
  p.since = 0;
  pc.idle = 600;
  await p.tick();
  p.sleepAt = Date.now() - 1;
  await p.tick();
  assert.equal(p.state, 'asleep');
  assert.equal(capri.mode, 'sleep');
  assert.equal(cam.stream, null);
  assert.equal(cam.napping, true);
  pc.idle = 1; // someone types
  await p.tick();
  assert.equal(p.state, 'asleep');
  capri.wake(); // you clicked her
  await p.tick();
  assert.equal(p.state, 'away');
  assert.equal(cam.napping, false);
  await p.tick(); // and you're right there
  assert.equal(p.state, 'here');
});

test('back: what happened while you were away', async () => {
  const { p, cam, pc, said } = world();
  cam.lastFaceAt = 0;
  p.since = 0;
  pc.idle = 600;
  await p.tick();
  p.claudeDone('Pronto, os testes passam.', 'capri');
  cam.lastFaceAt = Date.now();
  await p.tick();
  assert.equal(p.state, 'here');
  await new Promise((r) => { setTimeout(r, 1400).ref?.(); });
  assert.match(said.join('\n'), /Claude em capri: Pronto, os testes passam\./);
});

test('without a camera: five quiet minutes', async () => {
  const { p, pc } = world({ camera: false });
  pc.idle = 200;
  await p.tick();
  assert.equal(p.state, 'here');
  pc.idle = 320;
  await p.tick();
  assert.equal(p.state, 'away');
});
