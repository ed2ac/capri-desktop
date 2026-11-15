// Capri's cloud (a Cloudflare Worker, free plan): what she can't see with your notebook off.
//
//   Your PS5 (through Discord's official link with PlayStation): every 3 minutes it wakes, connects
//   to Discord a moment, sees what you're playing (the presence of your account in your own server),
//   and disconnects. A change (a game started, a game over) is written down as a session. Nothing
//   is ever sent to Sony by it.
//   The news: every 15 minutes, one of the feeds below (taking turns), its latest headlines kept for
//   a couple of days.
//
// Capri asks with a key only she has (CAPRI_KEY):  GET /now  GET /sessions?since=<ms>  GET /news?since=<ms>
// Secrets (npx wrangler secret put …): DISCORD_TOKEN, CAPRI_KEY. Vars (wrangler.toml): GUILD_ID, USER_ID.

const FEEDS = [
  { src: 'MeuPlayStation', cat: 'games', url: 'https://meups.com.br/feed/' },
  { src: 'IGN Brasil', cat: 'games', url: 'https://br.ign.com/feed.xml' },
  { src: 'Tecnoblog', cat: 'tech', url: 'https://tecnoblog.net/feed/' },
  { src: 'TecMundo', cat: 'tech', url: 'https://rss.tecmundo.com.br/feed' },
  { src: 'g1', cat: 'brasil', url: 'https://g1.globo.com/rss/g1/' },
  { src: 'BBC Brasil', cat: 'mundo', url: 'https://feeds.bbci.co.uk/portuguese/rss.xml' },
];
const EVERY_MIN = 3;          // the cron's pace: what a session may be off by
const KEEP_SESSIONS = 300;
const NEWS_HOURS = 48;
const NEWS_MAX = 120;

// ---- Discord: a snapshot of your presence ----

// { status, game: { name, platform } | null }, from one short connection to Discord's gateway
async function snapshot(env) {
  const res = await fetch('https://gateway.discord.gg/?v=10&encoding=json', { headers: { Upgrade: 'websocket' } });
  const ws = res.webSocket;
  if (!ws) throw new Error(`gateway: HTTP ${res.status}`);
  ws.accept();
  return new Promise((resolve, reject) => {
    let done = false;
    const finish = (fn, v) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try { ws.close(1000, 'bye'); } catch { /* closed */ }
      fn(v);
    };
    const timer = setTimeout(() => finish(reject, new Error('gateway: no answer in time')), 15000);
    ws.addEventListener('message', (e) => {
      let m;
      try { m = JSON.parse(e.data); } catch { return; }
      // hello: who we are, and that we want to see presences (GUILDS | GUILD_PRESENCES)
      if (m.op === 10) ws.send(JSON.stringify({ op: 2, d: { token: env.DISCORD_TOKEN, intents: (1 << 0) | (1 << 8), properties: { os: 'cloudflare', browser: 'capri', device: 'capri' } } }));
      if (m.op === 9) finish(reject, new Error('gateway: invalid session (token or intents)'));
      if (m.op === 0 && m.t === 'GUILD_CREATE' && m.d?.id === env.GUILD_ID) {
        const p = (m.d.presences || []).find((x) => x.user?.id === env.USER_ID);
        const play = (p?.activities || []).find((a) => a.type === 0); // "Playing …"
        finish(resolve, { status: p?.status || 'offline', game: play ? { name: String(play.name).slice(0, 120), platform: String(play.platform || 'pc') } : null });
      }
    });
    ws.addEventListener('close', (e) => finish(reject, new Error(`gateway: closed ${e.code} ${e.reason || ''}`.trim())));
    ws.addEventListener('error', () => finish(reject, new Error('gateway: error')));
  });
}

// what changed since the last look: a session closed, one opened. Written only on a change.
async function presence(env, now) {
  const state = (await env.STORE.get('ps', 'json')) || { current: null, sessions: [] };
  const shot = await snapshot(env);
  const was = state.current;
  const is = shot.game;
  if ((was?.name || null) === (is?.name || null)) return { changed: false, state };
  if (was) {
    // it ended somewhere between the last look and this one: halfway
    const end = now - (EVERY_MIN * 60000) / 2;
    state.sessions.push({ name: was.name, platform: was.platform, start: was.since, end, minutes: Math.max(1, Math.round((end - was.since) / 60000)) });
    state.sessions = state.sessions.slice(-KEEP_SESSIONS);
  }
  state.current = is ? { ...is, since: now - (EVERY_MIN * 60000) / 2 } : null;
  state.changedAt = now;
  await env.STORE.put('ps', JSON.stringify(state));
  return { changed: true, state };
}

// ---- the news ----

// text of an RSS field: CDATA opened, entities decoded, HTML (escaped or not) taken out
const unxml = (s) => String(s || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]+>/g, '')
  .replace(/&#(\d+);/g, (_m, n) => String.fromCodePoint(Number(n))).replace(/&#x([0-9a-f]+);/gi, (_m, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
  .replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

function parseFeed(xml, feed) {
  const items = [];
  for (const m of xml.matchAll(/<item\b[\s\S]*?<\/item>/g)) {
    const it = m[0];
    const title = unxml((/<title\b[^>]*>([\s\S]*?)<\/title>/.exec(it) || [])[1]);
    const link = unxml((/<link\b[^>]*>([\s\S]*?)<\/link>/.exec(it) || [])[1]);
    const date = Date.parse(unxml((/<pubDate>([\s\S]*?)<\/pubDate>/.exec(it) || [])[1])) || Date.now();
    const desc = unxml((/<description\b[^>]*>([\s\S]*?)<\/description>/.exec(it) || [])[1]).slice(0, 240);
    if (title && /^https?:/.test(link)) items.push({ title: title.slice(0, 200), link, at: date, src: feed.src, cat: feed.cat, desc });
    if (items.length >= 15) break;
  }
  return items;
}

async function news(env, now) {
  const turn = Math.floor(now / (15 * 60000)) % FEEDS.length; // one feed each time, taking turns
  const feed = FEEDS[turn];
  const res = await fetch(feed.url, { headers: { 'user-agent': 'Mozilla/5.0 (CapriCloud)' }, cf: { cacheTtl: 600 } });
  if (!res.ok) return;
  const fresh = parseFeed(await res.text(), feed);
  const kept = (await env.STORE.get('news', 'json')) || [];
  const seen = new Set(fresh.map((i) => i.link));
  const all = [...fresh, ...kept.filter((i) => !seen.has(i.link))].filter((i) => now - i.at < NEWS_HOURS * 3600000)
    .sort((a, b) => b.at - a.at).slice(0, NEWS_MAX);
  await env.STORE.put('news', JSON.stringify(all));
}

// ---- the Worker ----

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });

export default {
  async scheduled(event, env, ctx) {
    const now = Date.now();
    if (env.DISCORD_TOKEN && env.GUILD_ID && env.USER_ID) {
      ctx.waitUntil(presence(env, now).then(() => env.STORE.get('ps:error').then((e) => e && env.STORE.delete('ps:error'))).catch(async (err) => {
        const was = await env.STORE.get('ps:error', 'json');
        if (was?.error !== err.message) await env.STORE.put('ps:error', JSON.stringify({ at: now, error: err.message }));
      }));
    }
    if (new Date(now).getUTCMinutes() % 15 < EVERY_MIN) ctx.waitUntil(news(env, now).catch(() => {}));
  },

  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname === '/health') return json({ ok: true, name: 'capri-cloud' });
    const key = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
    if (!env.CAPRI_KEY || key !== env.CAPRI_KEY) return json({ error: 'unauthorized' }, 401);
    const since = Number(url.searchParams.get('since')) || 0;
    if (url.pathname === '/now') {
      const state = (await env.STORE.get('ps', 'json')) || {};
      return json({ current: state.current || null, changedAt: state.changedAt || null, error: await env.STORE.get('ps:error', 'json') });
    }
    if (url.pathname === '/sessions') {
      const state = (await env.STORE.get('ps', 'json')) || {};
      return json({ sessions: (state.sessions || []).filter((s) => s.end > since), current: state.current || null });
    }
    if (url.pathname === '/news') {
      const all = (await env.STORE.get('news', 'json')) || [];
      return json({ items: all.filter((i) => i.at > since) });
    }
    return json({ error: 'not found' }, 404);
  },
};

export { parseFeed, unxml };
