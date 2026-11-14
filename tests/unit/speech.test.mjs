import { R } from './setup.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
const { tidy, inLang } = await import(R('util'));

test('her lines, tidied: no tone labels, stray quotes, stage directions', () => {
  assert.equal(tidy('Zzz... a Rede está tão calma, me deixa cair.” (Sleepy)'), 'Zzz... a Rede está tão calma, me deixa cair.');
  assert.equal(tidy('É... você tem um jeito de fazer as coisas acontecerem, sabia?" (Sweet)'), 'É... você tem um jeito de fazer as coisas acontecerem, sabia?');
  assert.equal(tidy('Quebra essa rotina, cara! A vida é uma corrida!” (Chaotic)'), 'Quebra essa rotina, cara! A vida é uma corrida!');
  assert.equal(tidy('"Olha só, preem."'), 'Olha só, preem.');
  assert.equal(tidy('Capri: *ri baixinho* Você de novo?'), 'Você de novo?');
  assert.equal(tidy('[sarcástica] Que surpresa.'), 'Que surpresa.');
  assert.equal(tidy('Ele disse "oi" pra mim.'), 'Ele disse "oi" pra mim.');
});

test('a slip of Spanish (or a made-up name) in her Portuguese: redone', () => {
  assert.equal(inLang('Parece que ele está dando uma boa pelea com o código, chloe.', 'pt'), false);
  assert.equal(inLang('Caramba, que bagunça! Vamos nessa, chloe.', 'pt'), false);
  assert.equal(inLang('Caramba, que bagunça! Vamos nessa, choom.', 'pt'), true);
});
