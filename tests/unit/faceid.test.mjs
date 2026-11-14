import { R } from './setup.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
const { FaceId } = await import(R('faceid'));
const { linesFor } = await import(R('lines'));

// a face as 128 numbers: you are all zeros, someone `off` away differs in one of them
const face = (off, at = 0) => { const d = new Array(128).fill(0); d[at] = off; return d; };

async function world() {
  const said = [];
  const camera = { on: true, stream: {}, video: {}, state: { seen: 0 } };
  const f = new FaceId({
    capri: { wake() {}, perform() {}, towardCenter: () => 1, stowed: false, mode: 'idle' },
    panel: { say: (x) => said.push(x.line) }, brain: { t: linesFor('pt'), line: (p) => p, custom: { userName: 'Edu' } },
    host: { faceLoad: async () => null, faceSave: async () => {}, lockPc() {} }, chat: {}, guide: {}, camera, voice: {}, activity: {}, look: {},
  });
  await new Promise((r) => setImmediate(r)); // her saved faces loaded (none)
  f.known = { owner: { d: face(0) }, guests: [] };
  let next = [];
  f.readings = async () => next;
  const see = async (...faces) => { next = faces; await f.tick(); };
  return { f, camera, said, see };
}
const good = (off, at) => ({ d: face(off, at), score: 0.95, width: 140 });

test('your head down (a look only a little off): still you, nothing said', async () => {
  const { f, camera, said, see } = await world();
  camera.state.seen = Date.now() - 60000;
  await see(good(0.1));
  assert.equal(f.state, 'owner');
  await see(good(0.56)); // in between: not sure
  await see({ d: face(0.9), score: 0.55, width: 140 }); // a poor detection
  await see({ d: face(0.9), score: 0.95, width: 40 }); // too small
  assert.equal(f.state, 'owner');
  assert.equal(said.length, 0);
});

test('a face clearly not yours, but yours never left the picture: she waits long before doubting', async () => {
  const { f, camera, see } = await world();
  camera.state.seen = Date.now() - 60000;
  await see(good(0.1));
  await see(good(0.9));
  assert.equal(f.state, 'owner');
  f.doubt.since -= 20000; // 20 s of it
  await see(good(0.9));
  assert.equal(f.state, 'owner');
  f.doubt.since -= 30000; // 50 s, never a match of you: someone else after all
  await see(good(0.9));
  assert.equal(f.state, 'stranger');
});

test('you left the picture and someone else sat down: a stranger after a few seconds', async () => {
  const { f, camera, see } = await world();
  camera.state.seen = Date.now() - 60000;
  await see(good(0.1));
  camera.state.seen = Date.now() + 5; // a new face appeared after you were last seen
  await see(good(0.9));
  assert.equal(f.state, 'owner');
  f.doubt.since -= 10000;
  await see(good(0.9));
  assert.equal(f.state, 'stranger');
});

test('one look of you in between clears the doubt', async () => {
  const { f, camera, see } = await world();
  camera.state.seen = Date.now() - 60000;
  await see(good(0.1));
  await see(good(0.9));
  f.doubt.since -= 40000;
  await see(good(0.2)); // you again
  assert.equal(f.doubt, null);
  await see(good(0.9));
  f.doubt.since -= 10000;
  await see(good(0.9));
  assert.equal(f.state, 'owner'); // the clock started over
});

test('sure it\'s you from a new angle: she remembers it, and knows that angle next time', async () => {
  const { f, see } = await world();
  await see(good(0.38, 5)); // you, head turned: close enough, but a new angle
  assert.equal(f.known.owner.more.length, 1);
  assert.equal(f.match(face(0.38, 5).map((x, i) => (i === 7 ? 0.3 : x))).who, 'owner');
});

test('a face the camera sees but this one can\'t read (dim, turned away): not "nobody"', async () => {
  const { f, camera, see } = await world();
  await see(good(0.1));
  camera.lastFaceAt = Date.now();
  await see();
  await see();
  assert.equal(f.state, 'owner');
  camera.lastFaceAt = Date.now() - 10000; // really gone
  await see();
  await see(); // gone for two looks
  assert.equal(f.state, 'none');
});
