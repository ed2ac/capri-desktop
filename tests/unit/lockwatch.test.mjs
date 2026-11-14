import { R } from './setup.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
const { LockWatch } = await import(R('lockwatch'));
const { linesFor } = await import(R('lines'));

function world() {
  const out = { notes: [], sounds: [], said: [], rate: 'x' };
  let lockFn = null;
  const host = { onLockState: (fn) => { lockFn = fn; }, lockNotify: (n) => out.notes.push(n.body), saveVisit: async () => 'C:/x.jpg' };
  const face = { owner: 'Edu', known: { owner: {} }, state: 'none' };
  const camera = { on: true, paused: false, stream: {}, napping: false, setRate: (ms) => { out.rate = ms; }, start: () => Promise.resolve(), stop() {} };
  const capri = { wake() {}, perform() {}, towardCenter: () => 1 };
  const panel = { say: (x) => out.said.push(x.line) };
  const brain = { lang: 'pt', t: linesFor('pt') };
  const w = new LockWatch({ capri, panel, brain, host, camera, face, presence: { away: false }, voice: { play: (s) => out.sounds.push(s) } });
  return { w, out, face, lock: (locked) => lockFn({ locked }) };
}
const settle = () => new Promise((r) => { setTimeout(r, 1100).ref?.(); });

test('locked: you get a hello, a stranger a hiss, and unlocking she tells you who came', async () => {
  const { w, out, face, lock } = world();
  lock(true);
  assert.equal(out.rate, 1000);
  w.seen('stranger', null, 'none');
  assert.deepEqual(out.sounds, ['jealous']);
  assert.match(out.notes[0], /Não te conheço/);
  w.visits[0].from -= 3 * 60000; // it stood there three minutes
  w.seen('owner', null, 'stranger');
  assert.match(out.notes[1], /Oi, Edu/);
  w.seen('none', null, 'owner');
  w.seen('owner', null, 'none'); // back within two minutes: no second hello
  assert.equal(out.notes.length, 2);
  face.state = 'owner';
  lock(false);
  await settle();
  assert.match(out.said[0], /Bem-vindo de volta, Edu!/);
  assert.match(out.said[0], /desconhecido ficou na frente dele às .+, por uns 3 min/);
});

test('a photo only when you turned it on', async () => {
  const a = world();
  a.lock(true);
  a.w.seen('stranger', null, 'none');
  assert.equal(a.w.visits[0].file, null);
  const b = world();
  b.w.configure({ lockSnap: true });
  b.w.photo = async () => 'C:/visit.jpg';
  b.lock(true);
  b.w.seen('stranger', null, 'none');
  await settle();
  assert.equal(b.w.visits[0].file, 'C:/visit.jpg');
});

test('unlocked with nobody seen: nothing said', async () => {
  const { out, lock } = world();
  lock(true);
  lock(false);
  await settle();
  assert.equal(out.said.length, 0);
});
