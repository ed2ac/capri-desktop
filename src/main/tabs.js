'use strict';

// Your browser's tabs, through her extension (extension/, connected over websocket.js): how many and
// which, closing the ones you name, putting a window's tabs away for later and bringing them back,
// going to one, and the text of the page you're on (for a summary by her local AI only).

const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

let conn = null;           // the extension, when connected
let browser = '';          // which browser it said it is
const waiting = new Map(); // request id -> resolve

function attach(ws, hello = {}) {
  conn?.close();
  conn = ws;
  browser = String(hello.browser || '').slice(0, 40);
  ws.on('message', (msg) => {
    if (msg?.type === 'hello') browser = String(msg.browser || '').slice(0, 40);
    const done = waiting.get(msg?.id);
    if (done) { waiting.delete(msg.id); done(msg); }
  });
  ws.on('close', () => { if (conn === ws) conn = null; });
}

const connected = () => Boolean(conn);

// one command to the extension: its answer, or { ok: false, error: 'offline' | 'timeout' }
function ask(cmd, args = {}, ms = 6000) {
  if (!conn) return Promise.resolve({ ok: false, error: 'offline' });
  const id = randomUUID();
  return new Promise((resolve) => {
    waiting.set(id, resolve);
    conn.send({ id, cmd, ...args });
    setTimeout(() => { if (waiting.delete(id)) resolve({ ok: false, error: 'timeout' }); }, ms);
  });
}

// put away for later: kept in her workshop, a file per set
function savedFile(shop) { return path.join(shop, 'abas-guardadas.json'); }
function loadSaved(shop) {
  try { return JSON.parse(fs.readFileSync(savedFile(shop), 'utf8')); } catch { return []; }
}
function keep(shop, tabs) {
  const sets = [{ at: Date.now(), tabs: tabs.map((t) => ({ title: String(t.title || '').slice(0, 200), url: String(t.url || '') })).filter((t) => /^https?:/i.test(t.url)) }, ...loadSaved(shop)].slice(0, 20);
  fs.mkdirSync(shop, { recursive: true });
  fs.writeFileSync(savedFile(shop), JSON.stringify(sets, null, 1));
  return sets[0];
}
function takeLast(shop) {
  const sets = loadSaved(shop);
  const last = sets.shift();
  if (last) fs.writeFileSync(savedFile(shop), JSON.stringify(sets, null, 1));
  return last || null;
}

module.exports = { attach, connected, ask, keep, takeLast, loadSaved, browserName: () => browser };
