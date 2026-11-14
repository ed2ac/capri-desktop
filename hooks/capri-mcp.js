#!/usr/bin/env node
'use strict';

// Capri as an MCP server for Claude Code (stdio): tools that let any Claude Code session talk to you
// through her, on your desktop. Installed with `npm run mcp:install` (scripts/install-mcp.js).
//
//   capri_say       a line in her bubble ("done with the refactor, tests pass")
//   capri_ask       a question in her bubble, with buttons or a box to type in; waits for your answer
//   capri_progress  what it's doing, in her little ticker, for a long task
//   capri_notify    a Windows notification from her (when it matters and you may not be looking)
//
// Each call goes to her bridge on 127.0.0.1 (Windows' curl.exe from WSL, like her hooks). If she
// isn't running, the tool says so and Claude carries on.

const http = require('node:http');
const { spawn } = require('node:child_process');

const PORT = Number(process.env.CAPRI_PORT) || 47823;
const WIN_CURL = '/mnt/c/Windows/System32/curl.exe';
const ASK_MS = 5 * 60 * 1000;

const TOOLS = [
  {
    name: 'capri_say',
    description: 'Say something to the user through Capri, the desktop companion on their screen: a short line in her speech bubble. Use it to tell them something worth their attention (a task done, a result, a heads-up), not for every step.',
    inputSchema: { type: 'object', properties: { text: { type: 'string', description: 'What to tell them, one or two short sentences, in their language.' }, mood: { type: 'string', enum: ['info', 'done', 'alert'], description: 'done for good news, alert for a problem.' } }, required: ['text'] },
  },
  {
    name: 'capri_ask',
    description: 'Ask the user a question through Capri and wait for their answer (up to 5 minutes). Give options for a choice (buttons), or none for a free answer they type. Returns their answer, or that nobody answered.',
    inputSchema: { type: 'object', properties: { question: { type: 'string' }, options: { type: 'array', items: { type: 'string' }, maxItems: 4, description: 'Up to 4 short choices; leave out for a typed answer.' } }, required: ['question'] },
  },
  {
    name: 'capri_progress',
    description: 'Show what you are doing in Capri\'s small ticker (one short line), for long tasks. Send an empty text when finished.',
    inputSchema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
  },
  {
    name: 'capri_notify',
    description: 'Send the user a Windows notification from Capri, for something important when they may not be looking at the screen (a long task finished, something needs them).',
    inputSchema: { type: 'object', properties: { title: { type: 'string' }, text: { type: 'string' } }, required: ['text'] },
  },
];

function post(body, timeout) {
  const viaNode = () => new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: PORT, path: '/mcp', method: 'POST', headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) }, timeout }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => resolve(data));
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
    req.end(body);
  });
  const viaWindows = () => new Promise((resolve, reject) => {
    const child = spawn(WIN_CURL, ['-s', '-m', String(Math.ceil(timeout / 1000)), '-X', 'POST', '-H', 'content-type: application/json', '--data-binary', '@-', `http://127.0.0.1:${PORT}/mcp`], { stdio: ['pipe', 'pipe', 'ignore'] });
    let data = '';
    child.stdout.on('data', (c) => { data += c; });
    child.on('error', reject);
    child.on('exit', (code) => (code === 0 ? resolve(data) : reject(new Error(`curl ${code}`))));
    child.stdin.end(body);
  });
  return viaNode().catch(() => viaWindows());
}

async function call(name, args = {}) {
  if (!TOOLS.some((t) => t.name === name)) return { text: `Unknown tool ${name}.`, error: true };
  let reply;
  try {
    reply = JSON.parse(await post(JSON.stringify({ tool: name, args, cwd: process.cwd() }), name === 'capri_ask' ? ASK_MS + 15000 : 15000));
  } catch {
    return { text: 'Capri is not running on the user\'s desktop right now; carry on without her.', error: true };
  }
  if (name === 'capri_ask') {
    return { text: reply.answer ? `The user answered: ${reply.answer}` : 'Nobody answered (the user may be away). Decide sensibly, or ask again later.' };
  }
  return { text: reply.ok ? (reply.note || 'Done.') : `Capri couldn't: ${reply.error || 'unknown'}.`, error: !reply.ok };
}

function send(msg) {
  process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', ...msg })}\n`);
}

async function handle(msg) {
  const { id, method, params = {} } = msg;
  if (method === 'initialize') {
    return send({ id, result: { protocolVersion: params.protocolVersion || '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'capri', version: '1.0.0' } } });
  }
  if (method === 'ping') return send({ id, result: {} });
  if (method === 'tools/list') return send({ id, result: { tools: TOOLS } });
  if (method === 'tools/call') {
    const r = await call(params.name, params.arguments || {});
    return send({ id, result: { content: [{ type: 'text', text: r.text }], isError: Boolean(r.error) } });
  }
  if (id !== undefined && !String(method).startsWith('notifications/')) return send({ id, error: { code: -32601, message: `Method not found: ${method}` } });
  return undefined;
}

let buffer = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buffer += chunk;
  let nl;
  while ((nl = buffer.indexOf('\n')) >= 0) {
    const line = buffer.slice(0, nl).trim();
    buffer = buffer.slice(nl + 1);
    if (!line) continue;
    let msg;
    try { msg = JSON.parse(line); } catch { continue; }
    handle(msg).catch((err) => msg.id !== undefined && send({ id: msg.id, error: { code: -32603, message: err.message } }));
  }
});
process.stdin.on('end', () => process.exit(0));
