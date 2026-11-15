import { R } from './setup.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
const { Heart } = await import(R('heart'));

const fresh = (s = {}) => {
  localStorage.removeItem('capri.heart.v1');
  const h = new Heart({ bond: null });
  Object.assign(h.s, { energy: 70, mood: 60, boredom: 10, base: 55, longing: 0, stress: 10, at: Date.now() }, s);
  h.target = () => 80;
  return h;
};

test('kind words, harsh words, an apology', () => {
  const h = fresh();
  h.fromText('valeu capri, você é incrível');
  assert.ok(h.mood > 60);
  const before = h.s.mood;
  h.fromText('cala a boca, sua chata');
  assert.ok(h.s.mood < before && h.stress > 10);
});

test('she misses you while you\'re away, and is glad when you\'re back', () => {
  const h = fresh();
  let away = true;
  h.away = () => away;
  for (let i = 0; i < 200; i++) h.tick();
  assert.equal(h.state, 'missing');
  away = false;
  const m = h.s.mood;
  h.back(180);
  assert.ok(h.s.mood > m + 10 && h.longing === 0);
});

test('good and bad days last: her mood comes back to her day\'s, not to the middle', () => {
  const h = fresh({ mood: 80, base: 70 });
  for (let i = 0; i < 120; i++) h.tick();
  assert.ok(h.s.mood > 65, `mood ${h.s.mood}`);
  const g = fresh({ mood: 40, base: 40 });
  for (let i = 0; i < 120; i++) g.tick();
  assert.ok(g.s.mood < 47, `mood ${g.s.mood}`);
});

test('states with names, and what they change', () => {
  assert.equal(fresh({ energy: 15 }).state, 'sleepy');
  assert.equal(fresh({ stress: 80 }).state, 'anxious');
  assert.equal(fresh({ mood: 15 }).state, 'sad');
  assert.equal(fresh({ mood: 35, stress: 40 }).state, 'grumpy');
  assert.equal(fresh({ mood: 92, energy: 80 }).state, 'radiant');
  assert.equal(fresh({ mood: 75, boredom: 50, energy: 70 }).state, 'playful');
  assert.ok(fresh({ mood: 15 }).chattiness > fresh({ mood: 75, boredom: 50, energy: 70 }).chattiness); // sad talks less
  assert.ok(fresh({ mood: 15 }).mischief < fresh({ mood: 75, boredom: 50, energy: 70 }).mischief);
  assert.match(fresh({ mood: 15 }).persona(), /sad/);
});
