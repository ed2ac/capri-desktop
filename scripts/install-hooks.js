#!/usr/bin/env node
'use strict';

// Adds (or removes) the Capri hooks in ~/.claude/settings.json.
// Existing settings and hooks are kept; a timestamped backup is written first.
//
//   node scripts/install-hooks.js            install
//   node scripts/install-hooks.js --uninstall
//   node scripts/install-hooks.js --status

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const EVENTS = [
  'SessionStart',
  'UserPromptSubmit',
  'PreToolUse',
  'PostToolUse',
  'PostToolUseFailure',
  'Notification',
  'Stop',
  'StopFailure',
  'SubagentStart',
  'SubagentStop',
  'PreCompact',
  'SessionEnd',
];

const MARK = 'capri-hook.js';

function settingsPath() {
  const base = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
  return path.join(base, 'settings.json');
}

function hasNode() {
  try {
    return spawnSync('node', ['-v'], { windowsHide: true, timeout: 3000 }).status === 0;
  } catch {
    return false;
  }
}

// In the installed app (the .exe) the hook sits next to the app archive (asarUnpack), where
// node can read it. With no node on the machine, Capri's own executable runs it as node.
function hookCommand() {
  const script = path.resolve(__dirname, '..', 'hooks', 'capri-hook.js')
    .replace(`app.asar${path.sep}`, `app.asar.unpacked${path.sep}`)
    .replace(/\\/g, '/');
  if (process.versions.electron && !hasNode()) {
    return `ELECTRON_RUN_AS_NODE=1 "${process.execPath.replace(/\\/g, '/')}" "${script}"`;
  }
  // In WSL, node often comes from a version manager (nvm, fnm) that only a login shell puts on the
  // PATH, and Claude Code started from VS Code may not have it: the full path always works.
  if (IN_WSL) return `"${fs.realpathSync(process.execPath)}" "${script}"`;
  return `node "${script}"`;
}

// ---- Claude Code in WSL, Capri on Windows ----
// The hooks go in WSL's ~/.claude; a small note in the Windows user folder tells the Windows app
// where they are, so her menu shows them as installed and can take them out again.
const IN_WSL = process.platform === 'linux'
  && (Boolean(process.env.WSL_DISTRO_NAME) || /microsoft/i.test(os.release()));
const NOTE = '.capri-wsl-hooks.json';

function windowsHome() { // from WSL: /mnt/c/Users/<you>
  try {
    const r = spawnSync('cmd.exe', ['/d', '/c', 'echo %USERPROFILE%'], { encoding: 'utf8', timeout: 5000, cwd: '/mnt/c' });
    const win = (r.stdout || '').trim();
    if (!/^[A-Za-z]:\\/.test(win)) return null;
    return spawnSync('wslpath', ['-u', win], { encoding: 'utf8' }).stdout.trim() || null;
  } catch {
    return null;
  }
}

function writeNote(file) {
  const home = windowsHome();
  if (!home) return null;
  const distro = process.env.WSL_DISTRO_NAME || 'Ubuntu';
  // what the Windows side reads it as: \\wsl.localhost\<distro>\home\<you>\.claude\settings.json
  const unc = `\\\\wsl.localhost\\${distro}${file.replace(/\//g, '\\')}`;
  fs.writeFileSync(path.join(home, NOTE), JSON.stringify({ distro, file: unc, linuxFile: file }, null, 2) + '\n');
  return path.join(home, NOTE);
}

function removeNote() {
  const home = windowsHome();
  if (home) fs.rmSync(path.join(home, NOTE), { force: true });
}

function readNote() { // on Windows
  if (process.platform !== 'win32') return null;
  try {
    return JSON.parse(fs.readFileSync(path.join(os.homedir(), NOTE), 'utf8'));
  } catch {
    return null;
  }
}

function readSettings(file) {
  if (!fs.existsSync(file)) return {};
  const text = fs.readFileSync(file, 'utf8');
  if (!text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch (err) {
    // Never overwrite a file we could not understand.
    throw new Error(`${file} is not valid JSON (${err.message}). Fix it first, nothing was changed.`);
  }
}

function isCapriGroup(group) {
  return Array.isArray(group?.hooks) && group.hooks.some((h) => String(h.command || '').includes(MARK));
}

function strip(settings) {
  if (!settings.hooks) return settings;
  for (const event of Object.keys(settings.hooks)) {
    const groups = settings.hooks[event];
    if (!Array.isArray(groups)) continue;
    settings.hooks[event] = groups.filter((g) => !isCapriGroup(g));
    if (settings.hooks[event].length === 0) delete settings.hooks[event];
  }
  if (Object.keys(settings.hooks).length === 0) delete settings.hooks;
  return settings;
}

function write(file, settings) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (fs.existsSync(file)) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    fs.copyFileSync(file, `${file}.capri-backup-${stamp}`);
  }
  fs.writeFileSync(file, JSON.stringify(settings, null, 2) + '\n');
}

function install() {
  const file = settingsPath();
  const original = readSettings(file);
  const before = JSON.stringify(original);
  const settings = strip(original);
  settings.hooks = settings.hooks || {};
  const command = hookCommand();
  for (const event of EVENTS) {
    settings.hooks[event] = settings.hooks[event] || [];
    settings.hooks[event].push({
      hooks: [{ type: 'command', command, async: true, timeout: 10 }],
    });
  }
  if (JSON.stringify(settings) !== before) write(file, settings); // already up to date: no backup spam
  const note = IN_WSL ? writeNote(file) : null;
  return { file, command, events: EVENTS.length, note };
}

function uninstallAt(file) {
  if (!fs.existsSync(file)) return { file, removed: false };
  const settings = readSettings(file);
  const before = JSON.stringify(settings);
  strip(settings);
  const removed = JSON.stringify(settings) !== before;
  if (removed) write(file, settings);
  return { file, removed };
}

function uninstall() {
  const native = uninstallAt(settingsPath());
  if (IN_WSL) removeNote();
  const note = readNote(); // on Windows: the hooks are in WSL, take them out there
  if (!native.removed && note) {
    try {
      const r = uninstallAt(note.file);
      fs.rmSync(path.join(os.homedir(), NOTE), { force: true });
      return r;
    } catch {
      return native;
    }
  }
  return native;
}

function statusAt(file) {
  try {
    const settings = readSettings(file);
    const events = Object.entries(settings.hooks || {})
      .filter(([, groups]) => Array.isArray(groups) && groups.some(isCapriGroup))
      .map(([event]) => event);
    return { file, installed: events.length > 0, events };
  } catch (err) {
    return { file, installed: false, events: [], error: err.message };
  }
}

function status() {
  const native = statusAt(settingsPath());
  if (native.installed) return native;
  // on Windows, with the hooks installed from WSL: trust the note (reading \\wsl.localhost
  // would wake WSL up just to draw her menu)
  const note = readNote();
  if (note?.file) return { file: note.file, installed: true, events: EVENTS, wsl: note.distro };
  return native;
}

module.exports = { install, uninstall, status, EVENTS };

if (require.main === module) {
  const arg = process.argv[2];
  try {
    if (arg === '--uninstall') {
      const r = uninstall();
      console.log(r.removed ? `Capri hooks removed from ${r.file}` : `No Capri hooks found in ${r.file}`);
    } else if (arg === '--status') {
      const r = status();
      console.log(r.installed ? `Installed (${r.events.join(', ')}) in ${r.file}` : `Not installed (${r.file})`);
    } else {
      const r = install();
      console.log(`Capri hooks installed for ${r.events} events in ${r.file}`);
      console.log(`Command: ${r.command}`);
      if (IN_WSL) {
        console.log(r.note
          ? `WSL: Capri on Windows will see these hooks (note written to ${r.note}).`
          : 'WSL: could not find your Windows user folder; the hooks work, but her menu on Windows will not show them as installed.');
      }
      console.log('Start a new Claude Code session for them to take effect.');
    }
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
