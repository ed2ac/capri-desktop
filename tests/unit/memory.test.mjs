import { R } from './setup.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
const { Memory } = await import(R('memory'));

const make = (cfg = {}) => {
  const saved = [];
  const m = new Memory({ brain: { lang: 'pt' }, host: { setConfig: (c) => saved.push(c) }, chat: {} });
  m.configure(cfg);
  return { m, saved };
};

test('songs, games and free time add up; work apps aren\'t free time', () => {
  const { m } = make();
  for (let i = 0; i < 5; i++) m.song({ artist: 'Linkin Park', title: `x${i}` });
  m.song({ artist: 'Daft Punk', title: 'One More Time' });
  m.game('Elden Ring', 180);
  m.game('Elden Ring', 120);
  m.day({ 'Visual Studio Code': 300, Spotify: 60, 'Opera GX': 90, Discord: 40, Capri: 500 });
  const s = m.summary().join('\n');
  assert.match(s, /Artists they listen to \(most first\): Linkin Park; Daft Punk/);
  assert.match(s, /Games they play: Elden Ring \(~5 h\)/);
  assert.match(s, /free time on the PC: Opera GX; Spotify; Discord/);
  assert.doesNotMatch(s, /Visual Studio Code|Capri/);
});

test('what you asked her to remember comes first, and carries over from before', () => {
  const { m } = make({ memories: ['meu aniversário é 14/05'] });
  m.observe('likes', 'pizza de calabresa');
  assert.match(m.summary()[0], /asked you to remember: meu aniversário é 14\/05/);
  assert.match(m.persona(), /recommendation/);
});

test('what relates to what you just said', () => {
  const { m } = make();
  m.game('Hollow Knight', 600);
  m.observe('likes', 'filmes de terror');
  assert.deepEqual(m.relevant('bora jogar hollow knight hoje?'), ['Hollow Knight']);
  assert.deepEqual(m.relevant('me indica um filme de terror'), ['filmes de terror']);
  assert.deepEqual(m.relevant('oi'), []);
});

test('from a chat: lasting things about you, read by her local AI', async () => {
  const { m } = make();
  m.host.localSay = async () => ({ ok: true, text: '[{"kind": "likes", "text": "gosta de jogar Valorant com os amigos"}, {"kind": "plans", "text": "quer aprender Rust esse ano"}, {"kind": "mood", "text": "cansado hoje"}]' });
  const kept = await m.fromChat([{ role: 'user', content: 'jogo valorant com a galera toda sexta' }, { role: 'user', content: 'e quero aprender rust esse ano' }]);
  assert.deepEqual(kept.map((k) => k.kind), ['likes', 'plans']);
});

test('old things fade, deleted things go', () => {
  const { m } = make();
  const old = m.observe('likes', 'skate');
  old.last = Date.now() - 400 * 86400000;
  m.observe('likes', 'violão');
  assert.equal(m.ranked('likes')[0].label, 'violão');
  m.forget(old.id);
  assert.equal(m.ranked('likes').length, 1);
});
