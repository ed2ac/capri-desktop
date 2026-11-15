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

test('your windows, arranged in words', () => {
  const a = (t) => { const r = ask(t); return r && `${r.kind}:${r.action}:${(r.names || []).join('+')}`; };
  assert.equal(a('coloca o vs code e o chrome lado a lado'), 'arrange:side:vs code+chrome');
  assert.equal(a('lado a lado'), 'arrange:side:');
  assert.equal(a('minimiza tudo menos o VS Code'), 'arrange:focus:VS Code');
  assert.equal(a('minimiza tudo'), 'arrange:focus:');
  assert.equal(a('mostra tudo de novo'), 'arrange:restore:');
  assert.equal(a('maximiza o spotify'), 'arrange:maximize:spotify');
});

test('a window by the name you call it', async () => {
  const { createRequire } = await import('node:module');
  const { pick } = createRequire(import.meta.url)('../../src/main/arrange.js');
  const wins = [{ h: 1, name: 'Code', label: 'Visual Studio Code', title: 'capri' }, { h: 2, name: 'opera', label: 'Opera GX Internet Browser', title: 'YouTube' }, { h: 3, name: 'Spotify', label: 'Spotify', title: 'Spotify Premium' }];
  assert.equal(pick(wins, 'vs code').h, 1);
  assert.equal(pick(wins, 'o opera').h, 2);
  assert.equal(pick(wins, 'youtube').h, 2);
  assert.equal(pick(wins, 'spotify').h, 3);
  assert.equal(pick(wins, 'discord'), null);
});

test('a reminder for when an app comes up', () => {
  const r = ask('quando eu abrir o VS Code, me lembra de fazer o commit');
  assert.deepEqual([r.kind, r.app, r.text], ['ctxRemind', 'VS Code', 'fazer o commit']);
  const e = ask('when I open spotify remind me to make the playlist');
  assert.deepEqual([e.app, e.text], ['spotify', 'make the playlist']);
});

test('reading what\'s on the screen', () => {
  chat.look = {};
  for (const t of ['lê esse erro pra mim', 'o que diz esse aviso?', 'explica esse erro', 'lê a tela']) assert.equal(ask(t)?.kind, 'look', t);
  chat.look = null;
});

test('your tabs, asked in words', () => {
  const a = (t) => { const r = ask(t); return r && `${r.kind}:${r.action}:${r.query}`; };
  assert.equal(a('quantas abas eu tenho abertas?'), 'tabs:count:');
  assert.equal(a('fecha as abas do youtube'), 'tabs:close:youtube');
  assert.equal(a('fecha todas as abas do Mercado Livre'), 'tabs:close:Mercado Livre');
  assert.equal(a('guarda essas abas pra depois'), 'tabs:save:');
  assert.equal(a('abre as abas que eu guardei'), 'tabs:restore:');
  assert.equal(a('vai pra aba do github'), 'tabs:go:github');
  assert.equal(a('resume essa página'), 'tabs:page:');
  assert.equal(a('close the youtube tabs'), 'tabs:close:youtube');
});

test('goodnight: she sleeps too', () => {
  chat.presence = {};
  for (const t of ['vou dormir', 'boa noite, capri!', 'tô indo dormir', 'goodnight']) assert.equal(ask(t)?.kind, 'night', t);
  assert.notEqual(ask('boa noite pra você também, amanhã a gente termina o projeto')?.kind, 'night');
  chat.presence = null;
});

test('her chat closes by itself after a while, never while you type, talk or she answers', async () => {
  const { Chat } = await import(R('chat'));
  let hidden = 0;
  const panel = { chatInput: { value: '', addEventListener() {} }, setChatBusy() {}, hide: () => { hidden++; }, current: {} };
  const c = new Chat({ capri: {}, panel, voice: {}, host: new Proxy({}, { get: () => () => Promise.resolve(null) }), brain: { lang: 'pt', t: {} } });
  c.open = true;
  c.history = [{ role: 'assistant', content: 'oi' }];
  c.idleClose();
  assert.equal(hidden, 1, 'idle: closes');
  panel.chatInput.value = 'tô escrev';
  c.idleClose();
  assert.equal(hidden, 1, 'text in the box: stays');
  panel.chatInput.value = '';
  c.converse = { listening: true };
  c.idleClose();
  assert.equal(hidden, 1, 'listening to you: stays');
  c.converse = null;
  c.turn = 123;
  c.idleClose();
  assert.equal(hidden, 1, 'answering: stays');
  c.turn = 0;
  panel.current = { actions: [{ id: 'go' }] };
  c.idleClose();
  assert.equal(hidden, 1, 'buttons waiting: a little longer, once');
  c.idleClose();
  assert.equal(hidden, 2);
  clearTimeout(c.idleTimer);
  // time to read grows with her answer
  c.history = [{ role: 'assistant', content: 'x'.repeat(600) }];
  const at = Date.now();
  let waited = 0;
  const real = globalThis.setTimeout;
  globalThis.setTimeout = (fn, ms) => { waited = ms; return real(() => {}, 0); };
  c.idle();
  globalThis.setTimeout = real;
  assert.equal(waited, 45000);
  void at;
});

test('your PS5\'s play time, and Spotify\'s login and playlists', async () => {
  const { createRequire } = await import('node:module');
  const req = createRequire(import.meta.url);
  const { parseDuration } = req('../../src/main/psn.js');
  assert.equal(Math.round(parseDuration('PT228H56M33S')), 13737);
  assert.equal(parseDuration('PT45M'), 45);
  assert.equal(parseDuration('P1DT2H'), 26 * 60);
  const { loginUrl } = req('../../src/main/spotify.js');
  const u = new URL(loginUrl('0123456789abcdef0123456789abcdef', 'http://127.0.0.1:47823/spotify/callback'));
  assert.equal(u.searchParams.get('code_challenge_method'), 'S256');
  assert.match(u.searchParams.get('scope'), /user-modify-playback-state/);
  const p = ask('cria uma playlist pra estudar');
  assert.deepEqual([p.kind, p.about], ['playlist', 'estudar']);
});

test('a Windows notification, read', async () => {
  const { createRequire } = await import('node:module');
  const { parse, appName } = createRequire(import.meta.url)('../../src/main/notices.js');
  assert.deepEqual(parse('<toast><visual><binding template="ToastGeneric"><text>Mãe</text><text>Me liga quando puder &amp; traz pão</text></binding></visual></toast>'), { title: 'Mãe', body: 'Me liga quando puder & traz pão' });
  assert.equal(appName('5319275A.WhatsAppDesktop_cv1g1gvanyjgm!App'), 'WhatsApp');
  assert.equal(appName('com.squirrel.Discord.Discord'), 'Discord');
});

test('streamers going live, asked in words', () => {
  const a = ask('me avisa quando o Gaules entrar ao vivo');
  assert.deepEqual([a.kind, a.op, a.name, a.site], ['live', 'add', 'Gaules', 'twitch']);
  const y = ask('me avisa quando o @alanzoka ficar ao vivo no youtube');
  assert.deepEqual([y.name, y.site], ['alanzoka', 'youtube']);
  const r = ask('para de me avisar do Gaules');
  assert.deepEqual([r.op, r.name], ['remove', 'Gaules']);
});

test('her lines stay as long as it takes to read them', async () => {
  const { readingTime } = await import(R('panel'));
  assert.equal(readingTime({ kind: 'info', line: 'Oi!', hold: 9000 }), 3500); // short: short
  const long = readingTime({ kind: 'info', line: 'x'.repeat(160), hold: 4000 });
  assert.ok(long > 14000 && long < 16500, String(long)); // long: longer than it asked
  assert.equal(readingTime({ kind: 'info', line: 'x'.repeat(2000), hold: 4000 }), 25000); // never too long
  assert.equal(readingTime({ kind: 'alert', line: 'Oi!', hold: 9000 }), 9000); // what matters keeps its time
});

test('new PS5 trophies between two looks', async () => {
  const { createRequire } = await import('node:module');
  const { newTrophies } = createRequire(import.meta.url)('../../src/main/psn.js');
  const before = { a: { name: 'Astro Bot', bronze: 10, silver: 2, gold: 1, platinum: 0, progress: 80 } };
  const now = { a: { name: 'Astro Bot', bronze: 12, silver: 2, gold: 1, platinum: 1, progress: 100 }, b: { name: 'Novo', bronze: 5, silver: 0, gold: 0, platinum: 0 } };
  assert.deepEqual(newTrophies(before, now).map((t) => `${t.kind}:${t.count}`), ['platinum:1', 'bronze:2']);
});

test('a question of hers that another one replaced: its buttons close it, never do nothing', async () => {
  const { Guide } = await import(R('guide'));
  let hidden = 0;
  const panel = { current: null, say(m) { this.current = m; return true; }, hide() { hidden++; this.current = null; } };
  const g = new Guide({ capri: { stopPointing() {}, wake() {} }, panel, voice: {}, host: {}, brain: { t: {} } });
  const first = g.ask({ line: 'Acertei?', actions: [{ id: 'right' }] });
  const stale = panel.current;
  g.answer(null); // another question took over (its own panel refused): the first is over
  assert.equal(await first, null);
  panel.current = stale; // ...but its panel is still up
  panel.onAction('right');
  assert.equal(hidden, 1);
  const second = g.ask({ line: 'Outra?', actions: [{ id: 'yes' }] });
  panel.onAction('yes');
  assert.equal(await second, 'yes');
});
