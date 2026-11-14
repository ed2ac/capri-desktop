#!/usr/bin/env node
'use strict';

// Adds (or removes) Capri as an MCP server in your Claude Code, for every project (user scope):
// Claude Code gets capri_say, capri_ask, capri_progress and capri_notify (hooks/capri-mcp.js).
// Run it where your Claude Code is (WSL, for you):
//
//   npm run mcp:install
//   npm run mcp:uninstall

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const script = path.resolve(__dirname, '..', 'hooks', 'capri-mcp.js');
const node = fs.realpathSync(process.execPath);
const remove = process.argv.includes('--uninstall');

const run = (args) => spawnSync('claude', args, { stdio: 'inherit', shell: process.platform === 'win32' });
run(['mcp', 'remove', '--scope', 'user', 'capri']); // a previous one, if any (quietly fails otherwise)
if (remove) {
  console.log('Capri removed from Claude Code\'s MCP servers.');
  process.exit(0);
}
const r = run(['mcp', 'add', '--scope', 'user', 'capri', '--', node, script]);
if (r.status === 0) console.log(`Capri added to Claude Code (MCP): ${script}\nNew Claude Code sessions can talk to you through her.`);
process.exit(r.status || 0);
