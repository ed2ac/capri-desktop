import { R } from './setup.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
const { Converse, CONVERSE_PHANTOM } = await import(R('converse'));

function world() {
  const c = new Converse({ capri: { stowed: false, head: () => ({ x: 0, y: 0 }) }, panel: {}, brain: { t: {} }, host: {}, chat: { open: false }, guide: {}, voice: {}, life: {}, presence: { away: false, state: 'here' }, mic: {} });
  c.configure({ converse: true, micAsked: true });
  const heard = [];
  c.listen = (q) => heard.push(q);
  c.panel.current = null;
  return { c, heard };
}

test('her own questions are listened for; statements, her chat and her guide aren\'t', () => {
  const { c, heard } = world();
  c.saw({ kind: 'idle', line: 'Tá vendo aquela estrela?' });
  c.saw({ kind: 'info', line: 'Olha a hora: 22:10.' });
  c.saw({ kind: 'info', line: 'Quer instalar?', actions: [{ id: 'yes' }] });
  c.saw({ kind: 'info', line: 'Posso?', guide: true });
  c.saw({ kind: 'chat', line: 'Oi?' });
  c.saw({ kind: 'idle', line: 'O que você vai comer hoje?”' });
  assert.deepEqual(heard, ['Tá vendo aquela estrela?', 'O que você vai comer hoje?”']);
});

test('not without the microphone allowed, not when you\'re away, and not when turned off', () => {
  const a = world(); a.c.configure({ converse: true, micAsked: false }); assert.equal(a.c.ready(), false);
  const b = world(); b.c.presence.away = true; assert.equal(b.c.ready(), false);
  const d = world(); d.c.configure({ converse: false, micAsked: true }); assert.equal(d.c.ready(), false);
  const e = world(); assert.equal(e.c.ready(), true);
});

test('what Whisper makes up out of silence isn\'t an answer', () => {
  for (const t of ['Obrigado.', 'Legendas pela comunidade Amara.org', 'Thanks for watching!', '...']) assert.match(t, CONVERSE_PHANTOM, t);
  for (const t of ['Tô sim, tá linda hoje', 'Não, tá nublado']) assert.doesNotMatch(t, CONVERSE_PHANTOM, t);
});

test('her chat open: she listens as long as it is, again after each answer of hers', async () => {
  const { c } = world();
  const calls = [];
  c.listen = (q, o) => calls.push({ q, until: o?.until });
  c.onOpen('Oi, choom!');
  c.onAnswer('Que legal!');
  await new Promise((r) => { setTimeout(r, 900).ref?.(); });
  assert.deepEqual(calls.map((x) => x.q), ['Que legal!', 'Oi, choom!']);
  assert.equal(calls[0].until(), false, 'her chat closed: she stops');
  c.chat.open = true;
  assert.equal(calls[0].until(), true);
});

test('only what is said to her counts: her name somewhere in it, the whole of it kept', async () => {
  const { addressed } = await import(R('converse'));
  for (const t of ['mas aí não pode Capri', 'Capri, tô vendo sim', 'tô sim, capri, tá linda hoje', 'Kapri, não sei']) assert.equal(addressed(t), true, t);
  for (const t of ['mas aí não pode', 'liga a TV aí', 'capricho demais', 'o Capriotti chegou']) assert.equal(addressed(t), false, t);
});
