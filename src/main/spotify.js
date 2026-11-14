'use strict';

// Your Spotify, through its Web API, with an app of your own (developer.spotify.com: a Client ID,
// no secret: PKCE) and your login in the browser, coming back to her bridge on 127.0.0.1. Tokens
// kept encrypted with your Windows account. What she does with it: what's playing (for her memory
// and her reactions), your top artists, playing a song you name (Spotify Premium), playlists she
// makes for you.

const crypto = require('node:crypto');

const API = 'https://api.spotify.com/v1';
const SCOPES = 'user-read-currently-playing user-read-playback-state user-modify-playback-state user-top-read user-read-recently-played playlist-modify-private';

let clientId = null;
let tokens = null;   // { access, until, refresh }
let pending = null;  // { verifier, state, redirect }

const b64url = (buf) => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

// the login page to open in your browser
function loginUrl(id, redirect) {
  clientId = id;
  const verifier = b64url(crypto.randomBytes(48));
  const state = b64url(crypto.randomBytes(16));
  pending = { verifier, state, redirect };
  const challenge = b64url(crypto.createHash('sha256').update(verifier).digest());
  const q = new URLSearchParams({ client_id: id, response_type: 'code', redirect_uri: redirect, scope: SCOPES, state, code_challenge_method: 'S256', code_challenge: challenge });
  return `https://accounts.spotify.com/authorize?${q}`;
}

async function tokenCall(params) {
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: clientId, ...params }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error_description || body.error || `HTTP ${res.status}`);
  return body;
}

// back from the login: { ok, refresh } or { ok: false, error }
async function callback(query) {
  if (!pending || query.state !== pending.state) return { ok: false, error: 'state' };
  if (query.error || !query.code) return { ok: false, error: query.error || 'denied' };
  try {
    const t = await tokenCall({ grant_type: 'authorization_code', code: query.code, redirect_uri: pending.redirect, code_verifier: pending.verifier });
    tokens = { access: t.access_token, until: Date.now() + (t.expires_in - 60) * 1000, refresh: t.refresh_token };
    pending = null;
    return { ok: true, refresh: t.refresh_token };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

function use(id, refresh) {
  clientId = id;
  if (refresh && refresh !== tokens?.refresh) tokens = { access: null, until: 0, refresh };
}

const connected = () => Boolean(clientId && tokens?.refresh);

async function access(onRefresh) {
  if (tokens?.access && Date.now() < tokens.until) return tokens.access;
  if (!tokens?.refresh) throw new Error('not connected');
  const t = await tokenCall({ grant_type: 'refresh_token', refresh_token: tokens.refresh });
  tokens = { access: t.access_token, until: Date.now() + (t.expires_in - 60) * 1000, refresh: t.refresh_token || tokens.refresh };
  if (t.refresh_token) onRefresh?.(t.refresh_token);
  return tokens.access;
}

async function api(path, { method = 'GET', body, onRefresh } = {}) {
  const res = await fetch(`${API}${path}`, {
    method, headers: { authorization: `Bearer ${await access(onRefresh)}`, ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return {};
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { const e = new Error(data.error?.message || `HTTP ${res.status}`); e.status = res.status; e.reason = data.error?.reason; throw e; }
  return data;
}

// { playing, artist, title, album } or null
async function now(onRefresh) {
  const r = await api('/me/player/currently-playing', { onRefresh });
  const item = r?.item;
  if (!item) return null;
  return { playing: Boolean(r.is_playing), artist: (item.artists || []).map((a) => a.name).join(', '), title: item.name, album: item.album?.name || '', uri: item.uri };
}

async function topArtists(onRefresh) {
  const r = await api('/me/top/artists?limit=20&time_range=medium_term', { onRefresh });
  return (r.items || []).map((a) => ({ name: a.name, genres: a.genres || [] }));
}

async function search(query, onRefresh) {
  const r = await api(`/search?type=track&limit=1&q=${encodeURIComponent(query)}`, { onRefresh });
  const t = r.tracks?.items?.[0];
  return t ? { uri: t.uri, title: t.name, artist: (t.artists || []).map((a) => a.name).join(', ') } : null;
}

// plays a song (Premium, with Spotify open somewhere): { ok, title, artist } or { ok: false, error: 'premium'|'device'|'notfound' }
async function play(query, onRefresh) {
  const t = await search(query, onRefresh);
  if (!t) return { ok: false, error: 'notfound' };
  try {
    await api('/me/player/play', { method: 'PUT', body: { uris: [t.uri] }, onRefresh });
    return { ok: true, ...t };
  } catch (err) {
    if (err.status === 403) return { ok: false, error: 'premium', ...t };
    if (err.status === 404) return { ok: false, error: 'device', ...t };
    throw err;
  }
}

// a private playlist of these songs ("artist - title" each): { ok, url, count }
async function playlist(name, songs, onRefresh) {
  const me = await api('/me', { onRefresh });
  const uris = [];
  for (const s of songs.slice(0, 30)) {
    const t = await search(s, onRefresh).catch(() => null);
    if (t && !uris.includes(t.uri)) uris.push(t.uri);
  }
  if (!uris.length) return { ok: false, error: 'notfound' };
  const pl = await api(`/users/${encodeURIComponent(me.id)}/playlists`, { method: 'POST', body: { name: String(name).slice(0, 90), public: false, description: 'Feita pela Capri' }, onRefresh });
  await api(`/playlists/${pl.id}/tracks`, { method: 'POST', body: { uris }, onRefresh });
  return { ok: true, url: pl.external_urls?.spotify, uri: pl.uri, count: uris.length };
}

module.exports = { loginUrl, callback, use, connected, now, topArtists, play, playlist, search };
