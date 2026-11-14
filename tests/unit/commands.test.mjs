import { R } from './setup.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
const { Chat } = await import(R('chat'));

const host = new Proxy({}, { get: () => () => Promise.resolve(null) });
const chat = new Chat({ capri: {}, panel: {}, voice: {}, host, brain: { lang: 'pt', t: {} } });
const ask = (text) => chat.asked(text);

test('"abra o spotify e coloque X": the song, with Spotify said before it', () => {
  const a = ask('abra o spotify e coloque Bohemian Rhapsody');
  assert.equal(a.kind, 'play');
  assert.match(a.song, /bohemian rhapsody/i);
  assert.match(a.before, /spotify/i);
  assert.equal(ask('coloque Evidências no spotify').kind, 'music');
});

test('sites and apps are opening requests', () => {
  for (const t of ['abra github.com no opera', 'abra o youtube no chrome', 'abra o discord']) assert.equal(ask(t)?.kind, 'open', t);
});

test('a folder named for a task: a path, or a name on Windows or in WSL', async () => {
  const { folderIn } = await import(R('hands'));
  assert.deepEqual(folderIn('abra a pasta site no windows e faça uma landing page'), { name: 'site', side: 'windows' });
  assert.deepEqual(folderIn('na pasta api do wsl, corrige os testes'), { name: 'api', side: 'wsl' });
  assert.deepEqual(folderIn('abre C:\\Users\\User\\Documents\\loja e arruma o css'), { path: 'C:\\Users\\User\\Documents\\loja' });
  assert.deepEqual(folderIn('trabalha em "C:\\Users\\User\\Meus Projetos\\app"'), { path: 'C:\\Users\\User\\Meus Projetos\\app' });
  assert.deepEqual(folderIn('no ~/dev/jogo, cria um menu.'), { path: '~/dev/jogo' });
  assert.deepEqual(folderIn('abre a pasta "Meu Site" no windows'), { name: 'Meu Site', side: 'windows' });
  assert.equal(folderIn('organiza meus downloads'), null);
});

test('"abra a pasta X no windows e faça Y" goes to her hands, not to the app search', () => {
  chat.hands = {};
  assert.equal(ask('Capri, abra a pasta site no windows e faça uma landing page')?.kind, 'task');
  assert.equal(ask('abre o ~/dev/jogo e corrige o bug do menu')?.kind, 'task');
  assert.equal(ask('abra a pasta downloads')?.kind, 'open');
  chat.hands = null;
});

test('asking about Claude\'s limit', () => {
  chat.hands = {};
  for (const q of ['quanto do limite do claude eu já usei?', 'como tá o uso do claude', 'claude limit?']) assert.equal(ask(q)?.kind, 'usage', q);
  assert.notEqual(ask('abre o claude')?.kind, 'usage');
  chat.hands = null;
});

test('Claude Code\'s /usage, read', async () => {
  const { createRequire } = await import('node:module');
  const require = createRequire(import.meta.url);
  const Module = require('node:module');
  const load = Module._load;
  Module._load = function (req, ...r) { return req === 'electron' ? {} : load.call(this, req, ...r); };
  const { parseUsage } = require('../../src/main/tasks.js');
  Module._load = load;
  const u = parseUsage('You are currently using your subscription\n\nCurrent session: 33% used · resets Nov 14, 7:19pm (America/Sao_Paulo)\nCurrent week (all models): 30% used · resets Nov 15, 10:59am (America/Sao_Paulo)\nCurrent week (Fable): 0% used · resets Nov 15, 11am (America/Sao_Paulo)\n');
  assert.deepEqual(u.rows.map((r) => [r.key, r.pct, r.resets]), [['session', 33, 'Nov 14, 7:19pm'], ['week', 30, 'Nov 15, 10:59am'], ['week:Fable', 0, 'Nov 15, 11am']]);
  assert.equal(parseUsage('nothing here'), null);
});

test('her offer answered in words ("pode", "continua", "não"), typed or spoken', async () => {
  const { Hands } = await import(R('hands'));
  const picked = [];
  const h = Object.create(Hands.prototype);
  const offer = (again = false) => { h.pending = { pick: (id) => { picked.push(id); h.pending = null; }, again, until: Date.now() + 60000 }; };
  offer(); assert.equal(h.spoken('pode!'), 'go');
  offer(); assert.equal(h.spoken('Capri, sim, faz isso'), 'go');
  offer(); assert.equal(h.spoken('não, deixa'), 'no');
  offer(true); assert.equal(h.spoken('continua de onde parou'), 'resume');
  offer(true); assert.equal(h.spoken('começa do zero'), 'go');
  offer(); assert.equal(h.spoken('pode abrir o spotify e colocar uma música bem animada agora'), null);
  assert.equal(h.spoken('pode'), null); // nothing pending any more
  assert.deepEqual(picked, ['go', 'go', 'no', 'resume', 'go']);
});
