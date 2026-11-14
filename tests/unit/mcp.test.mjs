import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
const require = createRequire(import.meta.url);
const { createBridge } = require('../../src/main/bridge.js');

test('Claude Code talks through her: the MCP server over stdio, to her bridge', async () => {
  const port = 40000 + Math.floor(Math.random() * 20000);
  const got = [];
  const server = createBridge({ port, onEvent() {}, onMcp: async (b) => { got.push(b); return b.tool === 'capri_ask' ? { ok: true, answer: 'Pode sim' } : { ok: true }; } });
  await new Promise((r) => server.once('listening', r));
  const mcp = spawn(process.execPath, [new URL('../../hooks/capri-mcp.js', import.meta.url).pathname], { env: { ...process.env, CAPRI_PORT: String(port) } });
  const replies = new Map();
  let buf = '';
  mcp.stdout.on('data', (d) => {
    buf += d;
    let nl;
    while ((nl = buf.indexOf('\n')) >= 0) { const m = JSON.parse(buf.slice(0, nl)); buf = buf.slice(nl + 1); replies.get(m.id)?.(m); }
  });
  let n = 0;
  const rpc = (method, params) => new Promise((resolve) => { const id = ++n; replies.set(id, resolve); mcp.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`); });
  try {
    const init = await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } });
    assert.equal(init.result.serverInfo.name, 'capri');
    mcp.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`);
    const list = await rpc('tools/list', {});
    assert.deepEqual(list.result.tools.map((t) => t.name), ['capri_say', 'capri_ask', 'capri_progress', 'capri_notify']);
    const said = await rpc('tools/call', { name: 'capri_say', arguments: { text: 'Testes passando!', mood: 'done' } });
    assert.equal(said.result.isError, false);
    const asked = await rpc('tools/call', { name: 'capri_ask', arguments: { question: 'Posso apagar a pasta build?', options: ['Pode', 'Não'] } });
    assert.match(asked.result.content[0].text, /The user answered: Pode sim/);
    assert.deepEqual(got.map((g) => g.tool), ['capri_say', 'capri_ask']);
    assert.equal(got[0].args.text, 'Testes passando!');
  } finally {
    mcp.kill();
    server.close();
  }
});
