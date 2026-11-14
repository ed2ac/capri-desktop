import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import net from 'node:net';
import crypto from 'node:crypto';
const require = createRequire(import.meta.url);
const { createBridge } = require('../../src/main/bridge.js');
const tabs = require('../../src/main/tabs.js');

// a raw websocket client: the handshake with a chosen Origin, then masked text frames
function connect(port, origin) {
  return new Promise((resolve) => {
    const s = net.connect(port, '127.0.0.1');
    const key = crypto.randomBytes(16).toString('base64');
    s.write(`GET /tabs HTTP/1.1\r\nHost: 127.0.0.1\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\nOrigin: ${origin}\r\n\r\n`);
    let head = '';
    const onData = (d) => {
      head += d.toString('latin1');
      if (!head.includes('\r\n\r\n')) return;
      s.off('data', onData);
      resolve({ ok: head.startsWith('HTTP/1.1 101'), s });
    };
    s.on('data', onData);
    s.on('close', () => resolve({ ok: false, s }));
  });
}
const sendText = (s, obj) => {
  const data = Buffer.from(JSON.stringify(obj));
  const mask = crypto.randomBytes(4);
  const head = data.length < 126 ? Buffer.from([0x81, 0x80 | data.length]) : Buffer.from([0x81, 0x80 | 126, data.length >> 8, data.length & 255]);
  for (let i = 0; i < data.length; i++) data[i] ^= mask[i % 4];
  s.write(Buffer.concat([head, mask, data]));
};
const readText = (s) => new Promise((resolve) => s.once('data', (d) => {
  let len = d[1] & 0x7f; let at = 2;
  if (len === 126) { len = d.readUInt16BE(2); at = 4; }
  resolve(JSON.parse(d.subarray(at, at + len).toString('utf8')));
}));

test('her extension connects and answers; a web page can\'t', async () => {
  const port = 40000 + Math.floor(Math.random() * 20000);
  const server = createBridge({ port, onEvent() {}, onTabs: (ws) => tabs.attach(ws) });
  await new Promise((r) => server.once('listening', r));
  try {
    const page = await connect(port, 'https://evil.example');
    assert.equal(page.ok, false, 'a site is refused');
    const ext = await connect(port, 'chrome-extension://abcdefghijklmnop');
    assert.equal(ext.ok, true);
    await new Promise((r) => setTimeout(r, 50));
    assert.equal(tabs.connected(), true);
    const asked = tabs.ask('list');
    const cmd = await readText(ext.s);
    assert.equal(cmd.cmd, 'list');
    sendText(ext.s, { id: cmd.id, ok: true, tabs: [{ id: 1, title: 'YouTube', url: 'https://youtube.com' }] });
    const r = await asked;
    assert.equal(r.tabs[0].title, 'YouTube');
    ext.s.destroy();
    await new Promise((res) => setTimeout(res, 50));
    assert.equal(tabs.connected(), false);
  } finally {
    server.close();
  }
});
