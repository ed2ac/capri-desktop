'use strict';

// Capri's cloud (cloud/ in this repo: a Cloudflare Worker on your account). It keeps looking while
// this notebook is off: your PS5 through Discord (what you play, and for how long) and the news.
// Here she only asks it, with her key: GET /now, /sessions?since=, /news?since=.

let base = null;
let key = null;

function use(url, k) {
  base = url ? String(url).replace(/\/+$/, '') : null;
  key = k || null;
}

const connected = () => Boolean(base && key);

// an address of a Worker (https, workers.dev or your own domain), nothing else
function validUrl(url) {
  try {
    const u = new URL(String(url || '').trim());
    return u.protocol === 'https:' && !u.username && !u.password ? u.origin : null;
  } catch {
    return null;
  }
}

async function ask(path, { url = base, k = key, timeout = 15000 } = {}) {
  if (!url || !k) throw new Error('off');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(`${url}${path}`, { headers: { authorization: `Bearer ${k}` }, signal: ctrl.signal });
    if (res.status === 401) throw new Error('unauthorized');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

// a first look with what you pasted: is it her cloud, and does it know her key?
async function check(url, k) {
  const origin = validUrl(url);
  if (!origin) return { ok: false, error: 'url' };
  if (!/^[\w-]{16,128}$/.test(String(k || '').trim())) return { ok: false, error: 'key' };
  try {
    const health = await fetch(`${origin}/health`).then((r) => r.json()).catch(() => null);
    if (health?.name !== 'capri-cloud') return { ok: false, error: 'notCapri' };
    await ask('/now', { url: origin, k: String(k).trim() });
    return { ok: true, url: origin };
  } catch (err) {
    return { ok: false, error: err.message === 'unauthorized' ? 'key' : 'offline' };
  }
}

const now = () => ask('/now');
const sessions = (since) => ask(`/sessions?since=${Number(since) || 0}`);
const news = (since) => ask(`/news?since=${Number(since) || 0}`);

// sessions that ended after `since`, for her recap: summed per game, longest first
function recap(list, since) {
  const by = new Map();
  for (const s of list || []) {
    if (!s?.name || !(s.end > since)) continue;
    by.set(s.name, (by.get(s.name) || 0) + (Number(s.minutes) || 0));
  }
  return [...by].map(([name, minutes]) => ({ name, minutes })).sort((a, b) => b.minutes - a.minutes);
}

module.exports = { use, connected, validUrl, check, now, sessions, news, recap };
