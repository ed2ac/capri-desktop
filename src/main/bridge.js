'use strict';

// Local HTTP bridge. Claude Code hooks POST their event JSON to /event,
// we hand it to the overlay. Bound to 127.0.0.1 only.

const http = require('node:http');

const MAX_BODY = 512 * 1024;

function send(res, status, body) {
  const json = JSON.stringify(body);
  res.writeHead(status, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(json) });
  res.end(json);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(new Error('payload too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(new Error('invalid json'));
      }
    });
    req.on('error', reject);
  });
}

function createBridge({ port, onEvent, onGate, onDebug, onTabs, onMcp, onSpotify, onState }) {
  const server = http.createServer(async (req, res) => {
    // Browsers always send an Origin header on cross-site requests; hooks never do.
    // Refusing those keeps random web pages from puppeting Capri.
    if (req.headers.origin) return send(res, 403, { ok: false });

    const url = new URL(req.url, 'http://127.0.0.1');

    // back from logging in to Spotify in your browser (spotify.js): a page saying it worked
    if (req.method === 'GET' && url.pathname === '/spotify/callback' && onSpotify) {
      const r = await onSpotify(Object.fromEntries(url.searchParams)).catch(() => ({ ok: false }));
      const html = `<!doctype html><meta charset="utf-8"><title>Capri</title><body style="background:#14101c;color:#f1eaf8;font:600 20px system-ui;display:grid;place-items:center;height:100vh;margin:0"><p>${r.ok ? 'Spotify ligado! Pode fechar esta aba e voltar pra Capri.' : 'Não deu certo. Tenta de novo pelo menu da Capri.'}</p></body>`;
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'content-length': Buffer.byteLength(html) });
      return res.end(html);
    }

    // how she is right now (mode, stance, energy, what holds her): read-only, for finding a bug as it
    // happens without restarting her
    if (req.method === 'GET' && url.pathname === '/state' && onState) {
      return send(res, 200, (await onState().catch((err) => ({ error: err.message }))) || {});
    }

    if (req.method === 'GET' && url.pathname === '/health') {
      return send(res, 200, { ok: true, name: 'capri', pid: process.pid });
    }

    if (req.method === 'POST' && url.pathname === '/event') {
      try {
        const evt = await readJson(req);
        if (!evt || typeof evt !== 'object' || typeof evt.hook_event_name !== 'string') {
          return send(res, 400, { ok: false, error: 'missing hook_event_name' });
        }
        onEvent(evt);
        return send(res, 200, { ok: true });
      } catch (err) {
        return send(res, 400, { ok: false, error: err.message });
      }
    }

    // her hands (tasks.js): Claude Code asking whether it may do something; held open until you click
    if (req.method === 'POST' && url.pathname === '/gate' && onGate) {
      try {
        const evt = await readJson(req);
        const decision = await onGate(evt);
        return send(res, 200, { allow: Boolean(decision?.allow), reason: decision?.reason || '' });
      } catch (err) {
        return send(res, 200, { allow: false, reason: err.message });
      }
    }

    // Claude Code talking through her (hooks/capri-mcp.js): a line, a question held until you answer…
    if (req.method === 'POST' && url.pathname === '/mcp' && onMcp) {
      try {
        const body = await readJson(req);
        return send(res, 200, (await onMcp(body)) || { ok: false });
      } catch (err) {
        return send(res, 200, { ok: false, error: err.message });
      }
    }

    if (onDebug && url.pathname.startsWith('/debug/')) {
      try {
        const body = req.method === 'POST' ? await readJson(req).catch(() => ({})) : {};
        return send(res, 200, await onDebug(url.pathname.slice(7), body));
      } catch (err) {
        return send(res, 500, { ok: false, error: err.message });
      }
    }

    send(res, 404, { ok: false });
  });

  // her browser extension (extension/): a websocket, and only from an extension. A web page can't
  // claim a chrome-extension:// origin, so no site you visit can reach your tabs through her.
  server.on('upgrade', (req, socket) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    const origin = String(req.headers.origin || '');
    if (url.pathname !== '/tabs' || !onTabs || !/^(chrome|moz)-extension:\/\/[a-z0-9-]+\/?$/i.test(origin)) {
      socket.destroy();
      return;
    }
    const ws = require('./websocket').accept(req, socket);
    if (ws) onTabs(ws, { origin });
    else socket.destroy();
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`[capri] port ${port} already in use, Claude events will not reach this instance`);
    } else {
      console.error('[capri] bridge error:', err.message);
    }
  });

  server.listen(port, '127.0.0.1', () => console.log(`[capri] listening on 127.0.0.1:${port}`));
  return server;
}

module.exports = { createBridge };
