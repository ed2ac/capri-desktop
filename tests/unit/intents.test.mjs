import { R } from './setup.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const { Care } = await import(R('care'));

const care = new Care({ chat: {}, host: { onPcProgress() {} }, panel: {}, brain: {}, capri: {} });
Object.assign(care, { guard: {}, daily: {}, progress: {}, play: {}, camera: {} });
const what = (text) => {
  const a = care.asked(text, text.split(/\s+/).length);
  if (!a) return null;
  if (a.what === 'focus') return a.on ? `focus:${a.minutes}` : 'focus:off';
  if (a.what === 'todo' || a.what === 'routine' || a.what === 'limit') return `${a.what}:${a.op}`;
  return a.what;
};

test('what you ask her in Portuguese lands on the right thing', () => {
  const cases = {
    'faz um checkup no meu pc': 'checkup', 'procura vírus no meu pc': 'scan', 'faxina geral': 'cleanAll', 'libere espaço': 'space',
    'meu pc tá lento': 'heavy', 'modo foco 30 minutos': 'focus:30', 'modo foco por 1 hora': 'focus:60', 'para o modo foco': 'focus:off',
    'vai chover hoje?': 'weather', 'minha cidade é Curitiba': 'city', 'anota: comprar ração': 'todo:add', 'o que eu tenho pra fazer?': 'todo:list',
    'terminei a conta de luz': 'todo:done', 'todo dia às 23h me manda dormir': 'routine:add', 'minhas rotinas': 'routine:list',
    'me avisa se eu passar 1 hora no YouTube': 'limit:add', 'meu aniversário é 12/05': 'birthday', 'vamos jogar': 'play',
    'olha pra mim': 'camera', 'como foi minha semana?': 'week', 'que horas são?': null,
  };
  for (const [text, want] of Object.entries(cases)) assert.equal(what(text), want, text);
});

test('chat triggers: clipboard and tasks', () => {
  const src = fs.readFileSync(new URL('../../src/renderer/js/chat.js', import.meta.url), 'utf8');
  const re = (name) => new Function(`return ${src.match(new RegExp(`^const ${name} = (/.*/[a-z]*);`, 'm'))[1]}`)();
  assert.ok(re('CLIP_ASK').test('resume o que eu copiei'));
  assert.ok(!re('CLIP_ASK').test('copiei isso de você'));
  assert.ok(re('TASK_ASK').test('tarefa: organiza meus downloads'));
  assert.ok(!re('TASK_ASK').test('a tarefa de casa'));
});
