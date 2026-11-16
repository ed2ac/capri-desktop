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

test('her energy is a battery: awake drains it (little in the morning, a lot late at night), sleep refills it', () => {
  const day = fresh({ energy: 60 });
  day.dayFactor = () => 1;   // the evening's pace
  day.target = () => 0;      // no morning lift
  day.sleeping = () => 0;
  for (let i = 0; i < 60; i++) day.tick();
  assert.ok(day.s.energy < 56 && day.s.energy > 54, `awake an hour: ${day.s.energy}`);
  day.nightFactor = () => 1;
  day.sleeping = () => 2;
  for (let i = 0; i < 20; i++) day.tick();
  assert.ok(day.s.energy > 85, `asleep 20 min: ${day.s.energy}`);
  const morning = fresh({ energy: 60 });
  morning.target = () => 0;
  morning.sleeping = () => 0;
  morning.dayFactor = () => morning.constructor.prototype.dayFactor.call(morning, 9);
  const night = fresh({ energy: 60 });
  night.sleeping = () => 0;
  night.target = () => 0;
  night.dayFactor = () => night.constructor.prototype.dayFactor.call(night, 2);
  for (let i = 0; i < 60; i++) { morning.tick(); night.tick(); }
  assert.ok(morning.s.energy > 57, `a morning hour costs little: ${morning.s.energy}`);
  assert.ok(night.s.energy < morning.s.energy - 6, `at 2 a.m. it costs a lot: ${night.s.energy}`);
  night.exert(1);
  morning.exert(1);
  assert.ok(60 - night.s.energy > 60 - morning.s.energy, 'and so do her moves');
  // the weather: rain makes her sluggish, a sunny day lifts her mood
  const rain = fresh({ energy: 60 });
  rain.setWeather({ kind: 'rain' });
  assert.ok(rain.dayFactor(15) > fresh({}).dayFactor(15));
  rain.setWeather({ kind: 'sunny' });
  assert.ok(rain.moodTarget(15) > rain.s.base);
});

test('the PC off for the night: she slept through it', () => {
  const h = fresh({ energy: 20, at: Date.now() - 8 * 3600000 });
  h.catchUp();
  assert.equal(h.s.energy, 100);
});

test('woken too soon: no rest, and crankier each time', () => {
  const h = fresh({ energy: 30 });
  h.asleep();
  assert.equal(h.woken().cranky, 1);
  h.asleep();
  assert.equal(h.woken().cranky, 2);
  h.asleep();
  const m = h.s.mood;
  assert.equal(h.woken().cranky, 3);
  assert.ok(h.s.mood < m && h.stress > 10);
  const rested = fresh({ energy: 80 });
  rested.asleep();
  assert.equal(rested.woken().cranky, 0); // full of energy: waking her is fine
});

test('six levels of energy, and how soon she dozes off', () => {
  assert.equal(fresh({ energy: 95 }).energyLevel, 'electric');
  assert.equal(fresh({ energy: 40 }).energyLevel, 'tired');
  assert.equal(fresh({ energy: 10 }).energyLevel, 'drained');
  assert.ok(fresh({ energy: 10 }).sleepAfter() < fresh({ energy: 95 }).sleepAfter());
  assert.match(fresh({ energy: 25 }).persona(), /exhausted/);
});
