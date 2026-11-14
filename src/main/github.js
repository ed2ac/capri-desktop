'use strict';

// Your GitHub, through the gh you're logged into in WSL: every 10 minutes, your unread notifications.
// What's new since the last look goes to her (renderer github.js handling in app.js): a CI run that
// failed (she offers to put Claude on it), a review asked of you, a mention, an issue or PR assigned.
// The first look only learns what's already there (no flood of old ones). Nothing is marked read.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFile } = require('node:child_process');

const WIN = process.platform === 'win32';
const WANT = new Set(['ci_activity', 'review_requested', 'mention', 'team_mention', 'assign', 'security_alert']);
const JQ = '[.[] | select(.unread) | {id, reason, title: .subject.title, type: .subject.type, repo: .repository.full_name, at: .updated_at}]';

function distro() {
  try {
    const note = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.capri-wsl-hooks.json'), 'utf8'));
    return /^[\w.-]+$/.test(note.distro || '') ? note.distro : null;
  } catch {
    return null;
  }
}

function gh(args) {
  const quoted = args.map((a) => `'${String(a).replace(/'/g, "'\\''")}'`).join(' ');
  const [cmd, argv] = WIN
    ? ['wsl.exe', [...(distro() ? ['-d', distro()] : []), '-e', 'bash', '-lc', `gh ${quoted}`]]
    : ['bash', ['-lc', `gh ${quoted}`]];
  return new Promise((resolve) => {
    execFile(cmd, argv, { windowsHide: true, timeout: 30000, maxBuffer: 4 * 1024 * 1024 }, (err, out) => resolve(err ? null : String(out)));
  });
}

// [{ id, reason, title, type, repo, at }] unread, or null when gh isn't there or not logged in
async function unread() {
  const out = await gh(['api', 'notifications', '--jq', JQ]);
  if (out == null) return null;
  try {
    return JSON.parse(out || '[]');
  } catch {
    return null;
  }
}

// the new ones since `seen` (a Set of ids, updated): only the kinds worth a word
async function news(seen, first) {
  const list = await unread();
  if (!list) return null;
  const fresh = list.filter((n) => !seen.has(n.id));
  for (const n of list) seen.add(n.id);
  if (first) return [];
  return fresh.filter((n) => WANT.has(n.reason));
}

module.exports = { news, unread };
