#!/usr/bin/env node
'use strict';

// Adds (or removes) the line that loads her terminal hook, so Capri reacts to your commands:
// - bash / zsh (Linux, macOS, WSL): hooks/capri-shell.sh, in ~/.bashrc and ~/.zshrc (those that exist)
// - Windows: hooks/capri-pwsh.ps1, in your PowerShell profile(s) (Windows PowerShell, PowerShell 7)
// Nothing else in those files is touched; a backup is written first. Her menu does the Windows one.
//
//   node scripts/install-shell.js             install
//   node scripts/install-shell.js --uninstall
//   node scripts/install-shell.js --status

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const MARK = '# capri: reacts to your terminal';
const WIN = process.platform === 'win32';
// in the installed app the hooks sit next to the app archive (asarUnpack), where shells can read them
const hook = (name) => path.resolve(__dirname, '..', 'hooks', name).replace(`app.asar${path.sep}`, `app.asar.unpacked${path.sep}`);

function line() {
  if (WIN) {
    const p = hook('capri-pwsh.ps1');
    return `if (Test-Path '${p}') { . '${p}' } ${MARK}`;
  }
  const p = hook('capri-shell.sh');
  return `[ -f "${p}" ] && source "${p}" ${MARK}`;
}

// Windows: where each PowerShell keeps your profile (Documents may live in OneDrive)
function profiles() {
  const out = [];
  for (const exe of ['powershell.exe', 'pwsh.exe']) {
    try {
      const r = spawnSync(exe, ['-NoProfile', '-NonInteractive', '-Command', '$PROFILE.CurrentUserCurrentHost'], { encoding: 'utf8', windowsHide: true, timeout: 15000 });
      const p = (r.stdout || '').trim();
      if (r.status === 0 && /\.ps1$/i.test(p)) out.push(p);
    } catch { /* that one isn't installed */ }
  }
  return out;
}

function rcFiles() {
  if (WIN) return profiles();
  const home = os.homedir();
  const files = ['.bashrc', '.zshrc'].map((f) => path.join(home, f)).filter((f) => fs.existsSync(f));
  return files.length ? files : [path.join(home, '.bashrc')];
}

// read and write keeping the file's own encoding mark (Windows PowerShell cares about the BOM)
const BOM = '﻿';
function read(file) {
  if (!fs.existsSync(file)) return { text: '', bom: WIN };
  const raw = fs.readFileSync(file, 'utf8');
  return raw.startsWith(BOM) ? { text: raw.slice(1), bom: true } : { text: raw, bom: false };
}
function save(file, text, bom) {
  if (fs.existsSync(file)) fs.copyFileSync(file, `${file}.capri-backup`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const nl = WIN ? '\r\n' : '\n';
  fs.writeFileSync(file, (bom ? BOM : '') + text.replace(/\r?\n/g, nl));
}

const strip = (text) => text.split(/\r?\n/).filter((l) => !l.includes(MARK)).join('\n');

function install() {
  const files = rcFiles();
  if (!files.length) throw new Error('No PowerShell found.');
  return files.map((file) => {
    const { text, bom } = read(file);
    const kept = strip(text).replace(/\n*$/, text.trim() ? '\n' : '');
    const after = `${kept}${kept ? '\n' : ''}${line()}\n`;
    if (after !== text.replace(/\r\n/g, '\n')) save(file, after, bom);
    return file;
  });
}

function uninstall() {
  return rcFiles().filter((file) => {
    if (!fs.existsSync(file)) return false;
    const { text, bom } = read(file);
    if (!text.includes(MARK)) return false;
    save(file, strip(text), bom);
    return true;
  });
}

function status() {
  const files = rcFiles();
  const installed = files.filter((f) => fs.existsSync(f) && read(f).text.includes(MARK));
  return { installed: installed.length > 0, files: installed };
}

if (require.main === module) {
  try {
    const arg = process.argv[2];
    if (arg === '--uninstall') {
      const files = uninstall();
      console.log(files.length ? `Capri's terminal hook removed from ${files.join(', ')}` : 'Capri\'s terminal hook was not installed.');
    } else if (arg === '--status') {
      const s = status();
      console.log(s.installed ? `Installed in ${s.files.join(', ')}` : 'Not installed.');
    } else {
      const files = install();
      console.log(`Capri's terminal hook added to ${files.join(', ')}`);
      console.log(WIN ? 'Open a new PowerShell window for it to take effect.' : 'Open a new terminal (or run: source ~/.bashrc) for it to take effect.');
    }
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}

module.exports = { install, uninstall, status };
