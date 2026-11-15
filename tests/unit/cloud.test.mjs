import { R } from './setup.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const news = await import(R('news'));
const cloud = require('../../src/main/cloud.js');
const worker = await import('../../cloud/src/index.js');

const now = Date.now();
const items = [
  { title: 'Novo trailer de GTA VI revelado', link: 'https://a', at: now - 3600e3, cat: 'games', src: 'IGN Brasil' },
  { title: 'Apple lança novo iPhone', link: 'https://b', at: now - 1000, cat: 'tech', src: 'Tecnoblog' },
  { title: 'Chuva forte em São Paulo', link: 'https://c', at: now - 2000, cat: 'brasil', src: 'g1' },
  { title: 'Eleição nos EUA', link: 'https://d', at: now - 3000, cat: 'mundo', src: 'BBC Brasil' },
  { title: 'Fortnite ganha temporada nova', link: 'https://e', at: now - 500, cat: 'games', src: 'MeuPlayStation' },
  { title: 'Notícia velha', link: 'https://f', at: now - 50 * 3600e3, cat: 'games', src: 'IGN Brasil' },
];

test('news: asked for in her chat, by kind', () => {
  for (const s of ['quais as notícias?', 'tem noticia de games?', 'o que rolou nos games?', 'o que aconteceu no mundo', 'any news?']) assert.ok(news.NEWS_ASK.test(s), s);
  for (const s of ['abre o vs code', 'notificações novas', 'joga comigo']) assert.ok(!news.NEWS_ASK.test(s), s);
  assert.equal(news.newsCat('o que rolou nos games?'), 'games');
  assert.equal(news.newsCat('notícias do brasil'), 'brasil');
  assert.equal(news.newsCat('quais as notícias'), null);
});

test('news: what you like first, a mix of kinds, nothing stale', () => {
  const mix = news.pickNews(items, { likes: ['GTA VI'], now });
  assert.equal(mix[0].link, 'https://a');
  assert.deepEqual(new Set(mix.map((i) => i.cat)), new Set(['games', 'tech', 'brasil', 'mundo']));
  assert.ok(!mix.some((i) => i.link === 'https://f'));
  assert.deepEqual(news.pickNews(items, { cat: 'games', now }).map((i) => i.link), ['https://e', 'https://a']);
  assert.ok(!news.mentions('Gatão no parque', 'GTA'), 'whole words only, 4 letters or more');
  const t = news.newsTopic(items, ['Fortnite'], new Set(), now);
  assert.equal(t.label, 'Fortnite');
  assert.equal(news.newsTopic(items, ['Fortnite'], new Set(['https://e']), now), null, 'not told twice');
});

test('cloud (main): only https addresses; sessions summed per game for her recap', () => {
  assert.equal(cloud.validUrl('https://capri-cloud.x.workers.dev/now'), 'https://capri-cloud.x.workers.dev');
  assert.equal(cloud.validUrl('http://capri-cloud.x.workers.dev'), null);
  assert.equal(cloud.validUrl('https://u:p@x.dev'), null);
  assert.deepEqual(cloud.recap([{ name: 'A', minutes: 30, end: 5 }, { name: 'B', minutes: 90, end: 6 }, { name: 'A', minutes: 20, end: 7 }, { name: 'C', minutes: 5, end: 1 }], 2),
    [{ name: 'B', minutes: 90 }, { name: 'A', minutes: 50 }]);
});

test('cloud (worker): feeds parsed; nothing without her key', async () => {
  const xml = '<rss><channel><item><title><![CDATA[Novo trailer de &#8220;GTA VI&#8221;]]></title><link>https://meups.com.br/a</link><pubDate>Sat, 15 Nov 2026 10:00:00 GMT</pubDate><description>&lt;p&gt;Rockstar&lt;/p&gt;</description></item><item><title>sem link</title></item></channel></rss>';
  const parsed = worker.parseFeed(xml, { src: 'MeuPlayStation', cat: 'games' });
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].title, 'Novo trailer de “GTA VI”');
  assert.equal(parsed[0].desc, 'Rockstar');
  const kv = new Map([['news', JSON.stringify(items.slice(0, 2))], ['ps', JSON.stringify({ current: { name: 'Astro Bot', platform: 'ps5', since: now }, sessions: [{ name: 'GT7', end: now - 10, minutes: 40 }] })]]);
  const env = { CAPRI_KEY: 'k'.repeat(32), STORE: { get: async (k, type) => (kv.has(k) ? (type === 'json' ? JSON.parse(kv.get(k)) : kv.get(k)) : null) } };
  const call = (path, key) => worker.default.fetch(new Request(`https://x.dev${path}`, { headers: key ? { authorization: `Bearer ${key}` } : {} }), env);
  assert.equal((await call('/health')).status, 200);
  assert.equal((await call('/now')).status, 401);
  assert.equal((await call('/now', 'wrong')).status, 401);
  assert.equal((await (await call('/now', env.CAPRI_KEY)).json()).current.name, 'Astro Bot');
  assert.equal((await (await call(`/sessions?since=${now - 100}`, env.CAPRI_KEY)).json()).sessions.length, 1);
  assert.equal((await (await call(`/news?since=${now - 2000}`, env.CAPRI_KEY)).json()).items.length, 1);
});
