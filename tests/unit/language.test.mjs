import { R } from './setup.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
const { inLang } = await import(R('util'));

test('her Portuguese lines pass, Night City slang included', () => {
  for (const line of ['Trampo concluído, choom.', 'Preem! Nova!', 'Relaxa, Edu, a gente já podia ter desmantelado a Matrix.', 'Esqueci do relatório de novo, choom.', 'Game over pra você, choom.', 'Nice. Muito bom.', 'Erro no {tool}? Clássico.']) {
    assert.equal(inLang(line, 'pt'), true, line);
  }
});

test('English slips are caught', () => {
  for (const line of ['You did it, choom! That was preem.', 'I am so bored right now.', 'Look at those fingers fly!', 'Welcome back, Edu.', 'Hey, I got you now.']) {
    assert.equal(inLang(line, 'pt'), false, line);
  }
});
