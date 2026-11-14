'use strict';

// Her hands: Claude Code doing a task you asked her for in her chat (organize a folder, make one, find
// what fills your disk, build you a little program…). On Windows it runs the Claude Code you have in
// WSL; elsewhere the one on your PATH. It works from her workshop (~/Capri) and can reach your user
// folder, and every step that changes anything comes to you first: a PermissionRequest hook
// (hooks/capri-gate.js), given to these runs only, asks her and waits for your click. Some things
// are never allowed, whatever is clicked (deny rules): deleting (rm, rmdir, shred), sudo, disks.
// Instead of deleting, it moves things to her workshop's trash.
// The programs it builds go to ~/Capri/programs/<name>/ (a web page and a capri.json): her menu ›
// My programs opens them in a window of their own.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, execFile } = require('node:child_process');
const { randomUUID } = require('node:crypto');

const WIN = process.platform === 'win32';
const HOME = os.homedir();
const SHOP = path.join(HOME, 'Capri');
const PROGRAMS = path.join(SHOP, 'programs');
const TRASH = path.join(SHOP, 'trash');

// a Windows path as WSL sees it: C:\Users\you -> /mnt/c/Users/you
const toWslPath = (p) => p.replace(/^\\\\wsl(?:\.localhost|\$)\\[^\\]+/i, '').replace(/^([A-Za-z]):[\\/]/, (_m, d) => `/mnt/${d.toLowerCase()}/`).replace(/\\/g, '/');
const toWsl = (p) => (WIN ? toWslPath(p) : p);
const shq = (s) => `'${String(s).replace(/'/g, "'\\''")}'`;

const NEVER = [
  'Bash(rm:*)', 'Bash(rm *)', 'Bash(rmdir:*)', 'Bash(rmdir *)', 'Bash(shred:*)', 'Bash(shred *)', 'Bash(sudo:*)', 'Bash(sudo *)',
  'Bash(dd:*)', 'Bash(dd *)', 'Bash(mkfs:*)', 'Bash(mkfs *)', 'Bash(format:*)', 'Bash(diskpart:*)', 'Bash(chmod -R:*)',
  'Bash(git push:*)', 'Bash(git push *)', 'Bash(powershell.exe Remove-Item:*)', 'Bash(cmd.exe /c del:*)', 'Bash(cmd.exe /c rd:*)',
];

function brief({ lang, persona, project, mode = 'default' }) {
  const user = toWsl(HOME);
  return [
    persona,
    '',
    project
      ? `You are working in the user's folder ${project} (in WSL; /mnt/c/… is their Windows C: drive), as their pair programmer when it's code: read the code, change it, run its tests and builds as needed. Their Windows user folder is ${user}.`
      : `You are doing a task for the user on their PC (Windows, with you running in WSL). Your workshop is ${toWsl(SHOP)}. Their Windows user folder is ${user} (Downloads, Desktop, Pictures, Documents; Documents may be under OneDrive there).`,
    mode === 'default'
      ? 'Every action that changes something is shown to the user, who allows or denies it: keep each step small and clear, and do exactly what they asked, nothing more.'
      : 'Whatever needs permission is shown to the user, who allows or denies it; the rest goes ahead on its own: keep each step clear, and do exactly what they asked, nothing more.',
    `Never delete anything: to remove a file or folder, move it into ${toWsl(TRASH)}/<today's date>/ instead (it stays recoverable). Deleting commands are blocked anyway.`,
    `When asked to make a program or a tool for them, build it as a small self-contained web app in ${toWsl(PROGRAMS)}/<short-name>/: an index.html (styles and scripts inline or in files next to it, no build step, no server, data kept in localStorage), and a capri.json next to it: {"name": "…", "description": "one line"}. It opens in a window of its own from Capri's menu.`,
    'Do not install software system-wide and do not touch system settings unless they asked for exactly that.',
    `Your final message is shown in a small speech bubble by Capri: two or three short sentences, in character as Capri, saying what you did (and where), in ${lang}. No markdown.`,
  ].join('\n');
}

let running = null; // { id, child, session }

// Node and Claude Code where version managers and installers put them: started from Windows, WSL's
// shell doesn't always get them on its PATH (fnm's per-shell links need a login session)
const PATHS = 'export PATH="$HOME/.local/share/fnm/aliases/default/bin:$HOME/.local/bin:$HOME/.npm-global/bin:$HOME/.volta/bin:$HOME/.bun/bin:$PATH"; '
  + 'for d in "$HOME"/.nvm/versions/node/*/bin; do [ -d "$d" ] && PATH="$d:$PATH"; done; ';

// Which WSL distro: the one her Claude Code hooks were installed from (scripts/install-hooks.js
// leaves a note), not necessarily WSL's default one
function distro() {
  try {
    const note = JSON.parse(fs.readFileSync(path.join(HOME, '.capri-wsl-hooks.json'), 'utf8'));
    return /^[\w.-]+$/.test(note.distro || '') ? note.distro : null;
  } catch {
    return null;
  }
}
const wslArgs = (rest) => [...(distro() ? ['-d', distro()] : []), ...rest];

function claudeHere() {
  return new Promise((resolve) => {
    const [cmd, args] = WIN ? ['wsl.exe', wslArgs(['-e', 'bash', '-ic', `${PATHS}command -v claude`])] : ['bash', ['-ic', `${PATHS}command -v claude`]];
    execFile(cmd, args, { windowsHide: true, timeout: 20000 }, (err, out) => resolve(!err && /claude/.test(String(out))));
  });
}

// Runs a task. onEvent({ kind: 'tool', name, input } | { kind: 'text', text }) as it goes;
// resolves with { ok, text } or { ok: false, error }.
// Her projects: the folders under the projects root in WSL (~/dev by default), by name
let projectList = null;
let projectsAt = 0;
function projects(root = '~/dev') {
  if (projectList && Date.now() - projectsAt < 5 * 60000) return Promise.resolve(projectList);
  const safe = /^[~\w./-]+$/.test(root) ? root : '~/dev';
  const list = `for d in ${safe}/*/; do [ -d "$d" ] && printf '%s\\n' "$(cd "$d" && pwd)"; done`;
  const [cmd, args] = WIN ? ['wsl.exe', wslArgs(['-e', 'bash', '-c', list])] : ['bash', ['-c', list]];
  return new Promise((resolve) => {
    execFile(cmd, args, { windowsHide: true, timeout: 20000 }, (err, out) => {
      projectList = err ? [] : String(out).split('\n').map((l) => l.trim()).filter(Boolean)
        .map((dir) => ({ name: dir.split('/').pop(), dir }));
      projectsAt = Date.now();
      resolve(projectList);
    });
  });
}

// A folder you named for a task, as WSL sees it, if it's there: a path ("C:\\Users\\you\\site",
// "/home/you/app", "~/dev/app") or a name and where ("a pasta site no windows": your user folder,
// Desktop, Documents, Downloads, OneDrive; "no wsl": your home, ~/dev, her projects root).
// { dir, win } (win: the same folder as Windows' Explorer opens it) or null.
function folder({ path: wanted = '', name = '', side = '' } = {}, root = '~/dev') {
  const bad = (s) => /\.\.|[\0\n\r$`"]/.test(s);
  const tilde = (p) => (p.startsWith('~/') ? `"$HOME"/${shq(p.slice(2))}` : p === '~' ? '"$HOME"' : shq(p));
  let tries = [];
  if (wanted) {
    if (bad(wanted)) return Promise.resolve(null);
    tries = [/^(?:[A-Za-z]:[\\/]|\\\\wsl)/i.test(wanted) ? toWslPath(wanted) : wanted];
  } else if (name && !bad(name) && !/[\\/]/.test(name)) {
    const winUser = toWslPath(HOME);
    const onWin = ['', 'Desktop', 'Documents', 'Downloads', 'OneDrive/Documents', 'OneDrive/Desktop', 'OneDrive/Área de Trabalho', 'OneDrive/Documentos', 'source/repos']
      .map((d) => `${winUser}/${d ? `${d}/` : ''}${name}`);
    const safeRoot = /^[~\w./-]+$/.test(root) ? root : '~/dev';
    const onWsl = [`~/${name}`, `~/dev/${name}`, `${safeRoot}/${name}`, `~/projects/${name}`];
    tries = side === 'windows' ? onWin : side === 'wsl' ? onWsl : [...onWsl, ...onWin];
  }
  if (!tries.length) return Promise.resolve(null);
  // the first that's there; a name in any letter case ("Site" for "site")
  const script = `for d in ${tries.map(tilde).join(' ')}; do m="$d"; [ -d "$m" ] || m=$(find "$(dirname "$d")" -mindepth 1 -maxdepth 1 -type d -iname "$(basename "$d")" 2>/dev/null | head -n 1); [ -n "$m" ] && [ -d "$m" ] && { cd "$m" && pwd; exit 0; }; done; exit 1`;
  const [cmd, args] = WIN ? ['wsl.exe', wslArgs(['-e', 'bash', '-c', script])] : ['bash', ['-c', script]];
  return new Promise((resolve) => {
    execFile(cmd, args, { windowsHide: true, timeout: 20000 }, (err, out) => {
      const dir = err ? null : String(out).trim().split('\n')[0];
      resolve(dir ? { dir, win: toWinPath(dir) } : null);
    });
  });
}

// a WSL path as Windows opens it: /mnt/c/x -> C:\\x, /home/you/x -> \\\\wsl.localhost\\<distro>\\home\\you\\x
function toWinPath(dir) {
  const m = /^\/mnt\/([a-z])(\/.*)?$/.exec(dir);
  if (m) return `${m[1].toUpperCase()}:${(m[2] || '\\').replace(/\//g, '\\')}`;
  return `\\\\wsl.localhost\\${distro() || 'Ubuntu'}${dir.replace(/\//g, '\\')}`;
}

// shows a folder in Windows' Explorer
function reveal(dir) {
  if (!WIN || !dir) return;
  spawn('explorer.exe', [toWinPath(dir)], { detached: true, stdio: 'ignore' }).on('error', () => {}).unref();
}

// How much of your Claude plan is used: what Claude Code's own /usage says (answered by Claude Code
// itself, no model, nothing spent), with her hooks off for it. { rows: [{ key, label, pct, resets }], at }
// key: 'session' (the 5-hour window), 'week', or 'week:<model>'; null if Claude Code isn't there.
function usage() {
  const cmd0 = `${PATHS}claude -p /usage --settings ${shq('{"disableAllHooks":true}')}`;
  const [cmd, args] = WIN ? ['wsl.exe', wslArgs(['--cd', '~', '-e', 'bash', '-ic', cmd0])] : ['bash', ['-ic', cmd0]];
  return new Promise((resolve) => {
    execFile(cmd, args, { windowsHide: true, timeout: 45000 }, (err, out) => resolve(err ? null : parseUsage(String(out))));
  });
}

function parseUsage(text) {
  const rows = [];
  for (const m of text.matchAll(/^\s*Current\s+(session|week)(?:\s*\(([^)]+)\))?:\s*(\d+(?:\.\d+)?)%\s*used(?:\s*[·•-]\s*resets?\s+(.+?))?\s*$/gim)) {
    const model = m[2] && !/all models/i.test(m[2]) ? m[2].trim() : null;
    rows.push({
      key: m[1].toLowerCase() === 'session' ? 'session' : model ? `week:${model}` : 'week',
      label: model, pct: Number(m[3]), resets: (m[4] || '').replace(/\s*\([^)]*\)\s*$/, '').trim() || null,
    });
  }
  return rows.length ? { rows, at: Date.now() } : null;
}

async function run({ id, prompt, lang, persona, gateScript, project = null, resume = null, model = null, permission = 'auto', onEvent = () => {}, signal }) {
  if (running) return { ok: false, error: 'busy' };
  if (!(await claudeHere())) return { ok: false, error: 'noclaude' };
  for (const dir of [SHOP, PROGRAMS, TRASH]) fs.mkdirSync(dir, { recursive: true });
  const runDir = path.join(SHOP, '.runs');
  fs.mkdirSync(runDir, { recursive: true });
  const promptFile = path.join(runDir, `${id}-brief.txt`);
  const settingsFile = path.join(runDir, `${id}-settings.json`);
  const mode = ['auto', 'acceptEdits', 'default'].includes(permission) ? permission : 'auto';
  fs.writeFileSync(promptFile, brief({ lang, persona, project, mode }));
  fs.writeFileSync(settingsFile, JSON.stringify({
    permissions: { deny: NEVER },
    hooks: { PermissionRequest: [{ matcher: '*', hooks: [{ type: 'command', command: `node ${shq(toWsl(gateScript))}`, timeout: 660 }] }] },
  }));
  // the same conversation as last time ("go on", "now make the tests pass"), or a new one
  const session = /^[0-9a-f-]{36}$/.test(resume || '') ? resume : randomUUID();
  const where = project && /^\/[^\0\n\r'"$`\\]+$/.test(project) ? project : toWsl(SHOP);
  const claude = ['claude', '-p', '--output-format', 'stream-json', '--verbose', '--permission-mode', mode,
    ...(/^(sonnet|opus|haiku)$/.test(model || '') ? ['--model', model] : []),
    '--add-dir', shq(toWsl(HOME)), ...(project ? ['--add-dir', shq(toWsl(SHOP))] : []),
    '--append-system-prompt-file', shq(toWsl(promptFile)),
    '--settings', shq(toWsl(settingsFile)), ...(session === resume ? ['--resume', session] : ['--session-id', session])].join(' ');
  const [cmd, args] = WIN
    ? ['wsl.exe', wslArgs(['--cd', where, '-e', 'bash', '-ic', `${PATHS}exec ${claude}`])]
    : ['bash', ['-ic', `${PATHS}cd ${shq(where)} && exec ${claude}`]];
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { windowsHide: true });
    running = { id, child, session };
    const stop = () => {
      if (WIN) execFile('taskkill', ['/pid', String(child.pid), '/t', '/f'], () => {});
      else child.kill();
    };
    signal?.addEventListener('abort', stop, { once: true });
    let buffer = '';
    let result = null;
    let last = '';
    let errors = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      buffer += chunk;
      let nl;
      while ((nl = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        let msg;
        try { msg = JSON.parse(line); } catch { continue; }
        if (msg.type === 'assistant' && !msg.parent_tool_use_id) {
          for (const b of msg.message?.content || []) {
            if (b.type === 'tool_use') onEvent({ kind: 'tool', name: b.name, input: b.input || {} });
            else if (b.type === 'text' && b.text) {
              last = b.text;
              onEvent({ kind: 'text', text: b.text });
            }
          }
        } else if (msg.type === 'rate_limit_event') onEvent({ kind: 'limits', info: msg.rate_limit_info || {} });
        else if (msg.type === 'result') result = msg;
      }
    });
    child.stderr.on('data', (c) => { errors += c; });
    child.stdin.end(prompt);
    child.on('error', (err) => {
      running = null;
      resolve({ ok: false, error: err.message });
    });
    child.on('close', () => {
      running = null;
      for (const f of [promptFile, settingsFile]) fs.rm(f, { force: true }, () => {});
      if (signal?.aborted) return resolve({ ok: false, error: 'cancelled' });
      if (result && !result.is_error) return resolve({ ok: true, text: result.result || last, session });
      resolve({ ok: false, error: (result?.errors || []).join(' ') || result?.result || errors.trim().slice(0, 300) || 'no answer' });
    });
  });
}

const isTaskSession = (id) => Boolean(id) && running?.session === id;

// Her workshop's programs: [{ name, description, dir, page }]
function programs() {
  let dirs = [];
  try {
    dirs = fs.readdirSync(PROGRAMS, { withFileTypes: true }).filter((d) => d.isDirectory());
  } catch {
    return [];
  }
  return dirs.map((d) => {
    const dir = path.join(PROGRAMS, d.name);
    const page = path.join(dir, 'index.html');
    if (!fs.existsSync(page)) return null;
    let info = {};
    try {
      info = JSON.parse(fs.readFileSync(path.join(dir, 'capri.json'), 'utf8'));
    } catch { /* no description */ }
    return { name: String(info.name || d.name).slice(0, 60), description: String(info.description || '').slice(0, 140), dir, page };
  }).filter(Boolean).sort((a, b) => a.name.localeCompare(b.name));
}

module.exports = { run, programs, projects, folder, reveal, toWinPath, usage, parseUsage, isTaskSession, SHOP, PROGRAMS };
