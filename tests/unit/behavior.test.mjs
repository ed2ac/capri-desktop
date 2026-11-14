import { R } from './setup.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
const { Heart } = await import(R('heart'));
const { Life } = await import(R('life'));
const { classify } = await import(R('activity'));
const calendar = (await import('../../src/main/calendar.js')).default;

test('her heart moves but doesn\'t lock at 100 in a busy hour', () => {
  const h = new Heart({ bond: { percent: 20 } });
  let now = Date.now();
  const real = Date.now;
  Date.now = () => now;
  for (let m = 0; m < 60; m++) { now += 60000; h.nudge('claudeDone'); if (m % 2 === 0) h.nudge('chat'); }
  Date.now = real;
  assert.ok(h.mood < 100 && h.energy < 100, `${h.mood} ${h.energy}`);
  const before = h.mood;
  for (let i = 0; i < 4; i++) h.nudge('shoo');
  assert.ok(h.mood < before);
});

test('she stays put while one of her questions is on screen (the modal bug)', () => {
  const moved = [];
  const capri = { wanderStep() { moved.push('base'); }, mode: 'idle', busy: false, wander: true, nextMove: Infinity, windows: { wins: [] }, view: { w: 1920 }, perform() {}, teleport: async () => moved.push('teleport') };
  const life = new Life({ capri, panel: { current: { guide: true, actions: [{ id: 'yes' }] } }, brain: {}, voice: {}, fx: {}, heart: { energy: 100, mood: 100, boredom: 100 }, play: {}, activity: {} });
  life.guide = { running: true };
  life.lastMove = 0;
  life.pace();
  assert.equal(capri.nextMove, Infinity, 'pace() must not bring her next move forward');
  capri.wanderStep();
  assert.deepEqual(moved, [], 'no move while asking');
});

test('what a window title is', () => {
  assert.deepEqual(classify('chrome', 'receita de bolo - Pesquisa Google - Google Chrome'), { kind: 'search', what: 'receita de bolo', where: 'Google' });
  assert.equal(classify('opera', '(3) Daft Punk - Get Lucky - YouTube - Opera').kind, 'video');
  assert.equal(classify('spotify', 'Daft Punk - One More Time').kind, 'music');
  assert.equal(classify('ms-teams', 'Reunião diária | Microsoft Teams').kind, 'work');
});

test('calendar: a weekday meeting with a cancelled day', () => {
  const ics = ['BEGIN:VCALENDAR', 'BEGIN:VEVENT', 'SUMMARY:Daily', 'DTSTART:20261001T093000', 'DTEND:20261001T094500', 'RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR', 'EXDATE:20261117T093000', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
  const [e] = calendar.parse(ics);
  const { list } = calendar.occurrences(e, new Date(2026, 10, 16).getTime(), new Date(2026, 10, 21));
  assert.deepEqual(list.map((d) => d.getDate()), [16, 18, 19, 20]);
});
