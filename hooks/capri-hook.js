#!/usr/bin/env node
'use strict';

// Claude Code hook -> Capri.
// Reads the hook event on stdin and forwards a trimmed copy to the Capri app.
// Rule #1: never get in Claude's way. No output, always exit 0, give up fast.

const http = require('node:http');

const PORT = Number(process.env.CAPRI_PORT) || 47823;

// Fields Capri actually uses. Everything else (file contents, tool output...) stays on your machine.
const KEEP = [
  'hook_event_name', 'session_id', 'cwd', 'session_title', 'permission_mode',
  'tool_name', 'tool_input', 'tool_use_id', 'duration_ms', 'error', 'is_interrupt',
  'prompt', 'message', 'title', 'notification_type', 'last_assistant_message',
  'agent_id', 'agent_type', 'source', 'reason', 'trigger',
];

function trim(value, depth = 0) {
  if (typeof value === 'string') return value.length > 280 ? value.slice(0, 280) + '…' : value;
  if (Array.isArray(value)) return depth > 2 ? undefined : value.slice(0, 8).map((v) => trim(v, depth + 1));
  if (value && typeof value === 'object') {
    if (depth > 2) return undefined;
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      // big edit payloads are useless to Capri, keep only their size
      if (['content', 'old_string', 'new_string', 'new_source', 'edits'].includes(k)) {
        out[k + '_len'] = typeof v === 'string' ? v.length : Array.isArray(v) ? v.length : 0;
        continue;
      }
      out[k] = trim(v, depth + 1);
    }
    return out;
  }
  return value;
}

// Claude's answer, long enough for Capri to show it to you when you're not on Claude's window
const REPLY_MAX = 6000;

function slim(evt) {
  const out = {};
  for (const key of KEEP) if (evt[key] !== undefined) out[key] = trim(evt[key]);
  const reply = evt.last_assistant_message;
  if (typeof reply === 'string') out.last_assistant_message = reply.length > REPLY_MAX ? reply.slice(0, REPLY_MAX) + '…' : reply;
  return out;
}

// Claude Code inside WSL, Capri on Windows: with WSL's default NAT networking, 127.0.0.1 here is
// not Windows' 127.0.0.1. Windows' own curl.exe, started from WSL, runs on the Windows side and
// reaches her there. (With networkingMode=mirrored the plain request already gets through.)
const IN_WSL = process.platform === 'linux'
  && (Boolean(process.env.WSL_DISTRO_NAME) || /microsoft/i.test(require('node:os').release()));
const WIN_CURL = '/mnt/c/Windows/System32/curl.exe';

function postViaWindows(body, done) {
  const { spawn } = require('node:child_process');
  let child;
  try {
    child = spawn(WIN_CURL, [
      '-s', '-o', 'NUL', '-m', '2', '-X', 'POST', '-H', 'content-type: application/json',
      '--data-binary', '@-', `http://127.0.0.1:${PORT}/event`,
    ], { stdio: ['pipe', 'ignore', 'ignore'] });
  } catch {
    return done();
  }
  child.on('error', done);
  child.on('exit', done);
  child.stdin.on('error', () => {});
  child.stdin.end(body);
}

function run(adapt = (evt) => evt) {
  const bail = () => process.exit(0);
  setTimeout(bail, IN_WSL ? 4000 : 2000).unref();

  let raw = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => {
    raw += chunk;
    if (raw.length > 8 * 1024 * 1024) bail();
  });
  process.stdin.on('error', bail);
  process.stdin.on('end', () => {
    let evt;
    try {
      evt = adapt(JSON.parse(raw));
      if (!evt || typeof evt !== 'object') return bail();
    } catch {
      return bail();
    }
    const body = JSON.stringify(slim(evt));
    const req = http.request({
      host: '127.0.0.1',
      port: PORT,
      path: '/event',
      method: 'POST',
      headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) },
      timeout: 800,
    }, (res) => {
      res.resume();
      res.on('end', bail);
    });
    let failed = false; // a timeout's destroy() also fires 'error': fall back once
    const fallback = () => {
      if (failed) return;
      failed = true;
      if (IN_WSL) postViaWindows(body, bail); else bail();
    };
    req.on('timeout', () => { req.destroy(); fallback(); });
    req.on('error', fallback);
    req.end(body);
  });
}

module.exports = { run };
if (require.main === module) run();
