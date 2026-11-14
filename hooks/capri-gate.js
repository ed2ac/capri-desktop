#!/usr/bin/env node
'use strict';

// Claude Code's PermissionRequest hook for the tasks Capri gives it (main tasks.js, only for those
// runs: passed in their --settings). Whenever Claude wants to do something that needs a yes (write a
// file, run a command…), it asks Capri, and Capri asks you with her buttons: this waits for your
// click and answers Claude with it. Anything going wrong (Capri gone, no answer in time) is a no.
// In WSL with the default NAT networking, Windows' own curl.exe carries the question to her.

const http = require('node:http');
const { spawn } = require('node:child_process');

const PORT = Number(process.env.CAPRI_PORT) || 47823;
const WAIT_MS = 10 * 60 * 1000;
const WIN_CURL = '/mnt/c/Windows/System32/curl.exe';

function answer(allow, reason) {
  const decision = allow ? { behavior: 'allow' } : { behavior: 'deny', message: reason || 'The user said no.' };
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PermissionRequest', decision } }));
  process.exit(0);
}

function viaNode(body) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: '127.0.0.1', port: PORT, path: '/gate', method: 'POST',
      headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) }, timeout: WAIT_MS,
    }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => resolve(data));
    });
    req.on('timeout', () => { req.destroy(new Error('timeout')); });
    req.on('error', reject);
    req.end(body);
  });
}

function viaWindows(body) {
  return new Promise((resolve, reject) => {
    const child = spawn(WIN_CURL, ['-s', '-m', String(WAIT_MS / 1000), '-X', 'POST', '-H', 'content-type: application/json',
      '--data-binary', '@-', `http://127.0.0.1:${PORT}/gate`], { stdio: ['pipe', 'pipe', 'ignore'] });
    let data = '';
    child.stdout.on('data', (c) => { data += c; });
    child.on('error', reject);
    child.on('exit', (code) => (code === 0 ? resolve(data) : reject(new Error(`curl ${code}`))));
    child.stdin.end(body);
  });
}

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (c) => { raw += c; });
process.stdin.on('end', async () => {
  let evt;
  try {
    evt = JSON.parse(raw);
  } catch {
    return answer(false, 'Capri could not read the request.');
  }
  const body = JSON.stringify({
    session_id: evt.session_id, tool_name: evt.tool_name, tool_input: evt.tool_input, tool_use_id: evt.tool_use_id, cwd: evt.cwd,
  });
  let reply;
  try {
    reply = await viaNode(body).catch(() => viaWindows(body));
  } catch {
    return answer(false, 'Capri is not running, so nobody could say yes.');
  }
  let decision = null;
  try {
    decision = JSON.parse(reply);
  } catch { /* no answer */ }
  if (decision?.allow) return answer(true);
  return answer(false, decision?.reason || 'The user said no. Try another way, or ask them.');
});
