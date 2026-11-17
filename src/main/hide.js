'use strict';

// Every program she runs (PowerShell, wsl.exe, tasklist, reg…) runs hidden: on Windows a console
// program started from a windowed one gets a terminal window of its own, flashing open and shut,
// unless it's asked not to. Required first by main.js, so every module gets the hidden kind, even
// a call someone forgot to mark. A window wanted on purpose says windowsHide: false.

const cp = require('node:child_process');

// console programs only: a program with windows of its own (a browser, an app, Explorer) started
// hidden would open invisible
const CONSOLE = /^(?:powershell|pwsh|cmd|wsl|bash|tasklist|taskkill|reg|where|claude|gh|git|node|npx|npm|ping|ipconfig|powercfg|rundll32|winget|mpcmdrun|schtasks|netsh|sc|wmic|ollama)(?:\.exe|\.cmd)?$/i;
const isConsole = (file) => CONSOLE.test(String(file || '').split(/[\\/]/).pop().trim().split(/\s/)[0].replace(/^"|"$/g, ''));

const hidden = (opts) => (opts && typeof opts === 'object' && !Array.isArray(opts) ? { windowsHide: true, ...opts } : opts);

function wrap(name, optsAt) {
  const original = cp[name];
  cp[name] = function patched(...args) {
    if (!isConsole(args[0])) return original.apply(this, args);
    // the options: the first plain object after the command (and its arguments); none, one added
    let i = args.findIndex((a, k) => k >= optsAt && a && typeof a === 'object' && !Array.isArray(a));
    if (i >= 0) args[i] = hidden(args[i]);
    else {
      i = args.findIndex((a, k) => k >= optsAt && typeof a === 'function');
      if (i < 0) i = args.length;
      args.splice(i, 0, { windowsHide: true });
    }
    return original.apply(this, args);
  };
}

if (process.platform === 'win32') {
  wrap('spawn', 1);
  wrap('execFile', 1);
  wrap('exec', 1);
  wrap('spawnSync', 1);
  wrap('execFileSync', 1);
  wrap('execSync', 1);
}

module.exports = { hidden, isConsole };
