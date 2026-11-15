'use strict';

// Your PS5, through PlayStation Network (psn-api: the unofficial API of Sony's own app; Sony has no
// public one). You connect once with your NPSSO (a code your browser gets when you log in at
// playstation.com): it becomes a refresh token, kept encrypted with your Windows account, renewed as
// it goes (about two months, then you connect again). What she reads: whether you're playing and
// what, now (every 2 minutes), and your games with their play time (once a day). Nothing is sent.

const psn = require('psn-api');

let access = null;   // { token, until }
let refresh = null;  // the refresh token (decrypted), while she runs
let accountId = null;

function parseDuration(iso) {
  const m = /P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/.exec(String(iso || ''));
  if (!m) return 0;
  return (Number(m[1] || 0) * 24 * 60) + (Number(m[2] || 0) * 60) + Number(m[3] || 0) + Number(m[4] || 0) / 60;
}

function accountFrom(idToken) {
  try {
    const payload = JSON.parse(Buffer.from(String(idToken).split('.')[1], 'base64url').toString('utf8'));
    return payload.sub || null;
  } catch {
    return null;
  }
}

// with an NPSSO (64 characters): the tokens. { ok, refresh, account } or { ok: false, error }
async function connect(npsso) {
  const code = String(npsso || '').trim().replace(/^.*"npsso"\s*:\s*"([^"]+)".*$/s, '$1');
  if (!/^[A-Za-z0-9]{40,100}$/.test(code)) return { ok: false, error: 'format' };
  try {
    const accessCode = await psn.exchangeNpssoForAccessCode(code);
    const t = await psn.exchangeAccessCodeForAuthTokens(accessCode);
    access = { token: t.accessToken, until: Date.now() + (t.expiresIn - 60) * 1000 };
    refresh = t.refreshToken;
    accountId = accountFrom(t.idToken);
    return { ok: true, refresh: t.refreshToken, account: accountId, refreshUntil: Date.now() + (t.refreshTokenExpiresIn || 0) * 1000 };
  } catch (err) {
    return { ok: false, error: /npsso|401|400/i.test(err.message) ? 'npsso' : err.message };
  }
}

function use(savedRefresh, savedAccount) {
  if (savedRefresh && savedRefresh !== refresh) { refresh = savedRefresh; access = null; }
  if (savedAccount) accountId = savedAccount;
}

// a valid access token, renewing it if needed; calls onRefresh(newRefresh) to keep the new one
async function auth(onRefresh) {
  if (access && Date.now() < access.until) return { accessToken: access.token };
  if (!refresh) throw new Error('not connected');
  const t = await psn.exchangeRefreshTokenForAuthTokens(refresh);
  access = { token: t.accessToken, until: Date.now() + (t.expiresIn - 60) * 1000 };
  if (t.refreshToken && t.refreshToken !== refresh) { refresh = t.refreshToken; onRefresh?.(refresh); }
  if (!accountId) accountId = accountFrom(t.idToken);
  return { accessToken: access.token };
}

// what you're playing right now: { online, platform, game } (game: null when not in one)
async function presence(onRefresh) {
  const a = await auth(onRefresh);
  const r = await psn.getBasicPresence(a, accountId || 'me');
  const p = r.basicPresence || {};
  const g = (p.gameTitleInfoList || [])[0];
  return { online: p.primaryPlatformInfo?.onlineStatus === 'online', platform: p.primaryPlatformInfo?.platform || '', game: g ? g.titleName : null };
}

// your games, with minutes played: [{ name, minutes, last }]
async function games(onRefresh) {
  const a = await auth(onRefresh);
  const r = await psn.getUserPlayedGames(a, 'me', { limit: 100 });
  return (r.titles || []).map((t) => ({ name: t.localizedName || t.name, minutes: Math.round(parseDuration(t.playDuration)), last: t.lastPlayedDateTime })).filter((g) => g.name);
}

// your trophies, per game: { [id]: { name, bronze, silver, gold, platinum, progress } }
async function trophies(onRefresh) {
  const a = await auth(onRefresh);
  const r = await psn.getUserTitles(a, 'me', { limit: 60 });
  const out = {};
  for (const t of r.trophyTitles || []) {
    const e = t.earnedTrophies || {};
    out[t.npCommunicationId] = { name: t.trophyTitleName, bronze: e.bronze || 0, silver: e.silver || 0, gold: e.gold || 0, platinum: e.platinum || 0, progress: t.progress || 0 };
  }
  return out;
}

// what's new between two looks at your trophies: [{ name, kind, count, progress }] (best kind first)
function newTrophies(before, now) {
  const out = [];
  for (const [id, t] of Object.entries(now)) {
    const b = before[id];
    if (!b) continue; // a game new to the list: its old trophies aren't news
    for (const kind of ['platinum', 'gold', 'silver', 'bronze']) {
      const d = (t[kind] || 0) - (b[kind] || 0);
      if (d > 0) out.push({ name: t.name, kind, count: d, progress: t.progress });
    }
  }
  return out;
}

module.exports = { connect, use, presence, games, trophies, newTrophies, parseDuration };
