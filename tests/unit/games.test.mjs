import { R } from './setup.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
const { Games } = await import(R('games'));
const { linesFor } = await import(R('lines'));

const make = () => new Games({ brain: { lang: 'pt', t: linesFor('pt') }, host: {}, chat: { languageNote: () => '' } });

test('hangman: letters, the word, and a message that isn\'t a move ends it', async () => {
  const g = make();
  await g.start('hangman');
  g.game.word = 'neon';
  assert.match(await g.turn('n'), /^Isso! N _ _ N/);
  assert.match(await g.turn('x'), /Não tem.*faltam 5/);
  assert.match(await g.turn('N'), /já tentou/);
  assert.match(await g.turn('neon'), /Acertou/);
  assert.equal(g.on, false);
  await g.start('hangman');
  assert.equal(await g.turn('me conta uma piada'), null);
  assert.equal(g.on, false);
});

test('guess my number: higher, lower, right', async () => {
  const g = make();
  await g.start('number');
  g.game.n = 42;
  assert.match(await g.turn('10'), /Bem mais alto que 10/);
  assert.match(await g.turn('é 50?'), /Mais baixo que 50/);
  assert.match(await g.turn('42'), /42! Em 3/);
  assert.equal(g.on, false);
});

test('quiz: a question from her AI, checked', async () => {
  const g = make();
  g.host.localSay = async () => ({ ok: true, text: '{"question": "Qual é o maior planeta do sistema solar?", "options": ["Marte", "Júpiter", "Terra", "Vênus"], "answer": 1}' });
  const q = await g.start('quiz');
  assert.match(q, /maior planeta[\s\S]*B\) Júpiter/);
  assert.match(await g.turn('b'), /^Acertou! \(1\/1\)/);
  assert.match(await g.turn('a'), /^Errou! Era B\) Júpiter/);
});
