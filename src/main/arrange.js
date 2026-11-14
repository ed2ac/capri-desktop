'use strict';

// Arranging your windows when you ask her to (chat.js): two side by side ("o VS Code e o Chrome lado
// a lado", or the two in front), everything minimized but one ("minimiza tudo menos o VS Code"),
// back as it was ("mostra tudo de novo": only what she minimized), one maximized. Windows only.
// Never her own windows, nor the taskbar or the desktop.

const { powershell } = require('./apps');

const WIN32 = `
Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
public static class CapriArrange {
  public delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc f, IntPtr l);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] public static extern int GetWindowLong(IntPtr h, int i);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int cmd);
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int w, int hh, uint f);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("dwmapi.dll")] public static extern int DwmGetWindowAttribute(IntPtr h, int a, out int v, int s);
  public static List<IntPtr> List() {
    var all = new List<IntPtr>();
    EnumWindows((h, l) => {
      if (!IsWindowVisible(h)) return true;
      int ex = GetWindowLong(h, -20);
      if ((ex & 0x80) != 0) return true; // tool windows
      int cloaked; DwmGetWindowAttribute(h, 14, out cloaked, 4);
      if (cloaked != 0) return true;
      var t = new StringBuilder(256); GetWindowText(h, t, 256);
      if (t.Length == 0) return true;
      all.Add(h); return true;
    }, IntPtr.Zero);
    return all;
  }
}
'@
$skip = 'capri','explorer','applicationframehost','textinputhost','shellexperiencehost','searchhost','startmenuexperiencehost','lockapp','systemsettings'
function Get-AppWindows {
  [CapriArrange]::List() | ForEach-Object {
    $t = New-Object System.Text.StringBuilder 256; [void][CapriArrange]::GetWindowText($_, $t, 256)
    $procId = [uint32]0; [void][CapriArrange]::GetWindowThreadProcessId($_, [ref]$procId)
    $p = (Get-Process -Id $procId -EA SilentlyContinue)
    $name = if ($p) { $p.ProcessName } else { '' }
    if ($skip -notcontains $name.ToLower()) {
      [pscustomobject]@{ h = $_; name = $name; label = $(if ($p) { $p.Description } else { '' }); title = $t.ToString(); min = [CapriArrange]::IsIconic($_) }
    }
  }
}
`;

const ps = (s) => `'${String(s).replace(/'/g, "''")}'`;
const words = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '');
let minimized = []; // the windows she minimized, to bring back

// the windows, front first: [{ h, name, label, title, min }]
async function list() {
  if (process.platform !== 'win32') return [];
  const out = await powershell(`${WIN32}; @(Get-AppWindows | Select-Object @{n='h';e={$_.h.ToInt64()}}, name, label, title, min) | ConvertTo-Json -Compress`, 20000);
  return [].concat(out ? JSON.parse(out) : []);
}

// the window a name means ("vs code" → Code, "chrome", "spotify", a word of its title)
function pick(wins, name) {
  const key = words(name).replace(/^(o|a)/, '');
  if (key.length < 2) return null;
  const alias = { vscode: 'code', visualstudiocode: 'code', navegador: 'chrome', terminal: 'windowsterminal', explorador: 'explorer', zap: 'whatsapp' }[key] || key;
  const score = (w) => {
    const n = words(w.name);
    const l = words(w.label);
    if (n === alias || l === alias) return 3;
    if (n.includes(alias) || l.includes(alias) || alias.includes(n)) return 2;
    return words(w.title).includes(alias) ? 1 : 0;
  };
  return wins.map((w) => [score(w), w]).filter(([s]) => s > 0).sort((a, b) => b[0] - a[0])[0]?.[1] || null;
}

// { ok, names } of the windows it touched; ok false with error: 'none' (nothing to arrange) or 'notfound'
async function arrange({ action, names = [] } = {}) {
  if (process.platform !== 'win32') return { ok: false, error: 'windows' };
  const wins = (await list()).filter((w) => !w.min || action === 'restore' || action === 'maximize');
  if (action === 'side') {
    let two = names.slice(0, 2).map((n) => pick(wins, n)).filter(Boolean);
    if (names.length && two.length < Math.min(2, names.length)) return { ok: false, error: 'notfound', missing: names.filter((n) => !pick(wins, n)) };
    if (two.length < 2) two = [...two, ...wins.filter((w) => !two.includes(w) && !w.min)].slice(0, 2);
    if (two.length < 2) return { ok: false, error: 'none' };
    // the work area (without the taskbar) of the screen the first one is on, halved
    await powershell(`${WIN32}; Add-Type -AssemblyName System.Windows.Forms;
      $a = [IntPtr]${two[0].h}; $b = [IntPtr]${two[1].h};
      $scr = [System.Windows.Forms.Screen]::FromHandle($a).WorkingArea; $w = [int]($scr.Width / 2);
      foreach ($h in @($a, $b)) { [void][CapriArrange]::ShowWindow($h, 9) }
      [void][CapriArrange]::SetWindowPos($a, [IntPtr]::Zero, $scr.X, $scr.Y, $w, $scr.Height, 0x0044);
      [void][CapriArrange]::SetWindowPos($b, [IntPtr]::Zero, $scr.X + $w, $scr.Y, $scr.Width - $w, $scr.Height, 0x0044);
      [void][CapriArrange]::SetForegroundWindow($a)`);
    return { ok: true, names: two.map((w) => w.label || w.name) };
  }
  if (action === 'focus') {
    const keep = names[0] ? pick(wins, names[0]) : wins[0];
    if (!keep) return { ok: false, error: 'notfound', missing: names };
    const others = wins.filter((w) => w.h !== keep.h && !w.min);
    if (!others.length) return { ok: true, names: [keep.label || keep.name], count: 0 };
    await powershell(`${WIN32}; ${others.map((w) => `[void][CapriArrange]::ShowWindow([IntPtr]${w.h}, 6)`).join('; ')}; [void][CapriArrange]::ShowWindow([IntPtr]${keep.h}, 9); [void][CapriArrange]::SetForegroundWindow([IntPtr]${keep.h})`);
    minimized = others.map((w) => w.h);
    return { ok: true, names: [keep.label || keep.name], count: others.length };
  }
  if (action === 'restore') {
    if (!minimized.length) return { ok: false, error: 'none' };
    const back = minimized;
    minimized = [];
    await powershell(`${WIN32}; ${back.map((h) => `[void][CapriArrange]::ShowWindow([IntPtr]${h}, 9)`).join('; ')}`);
    return { ok: true, count: back.length };
  }
  if (action === 'maximize') {
    const w = names[0] ? pick(wins, names[0]) : wins.find((x) => !x.min);
    if (!w) return { ok: false, error: names[0] ? 'notfound' : 'none', missing: names };
    await powershell(`${WIN32}; [void][CapriArrange]::ShowWindow([IntPtr]${w.h}, 3); [void][CapriArrange]::SetForegroundWindow([IntPtr]${w.h})`);
    return { ok: true, names: [w.label || w.name] };
  }
  return { ok: false, error: 'action' };
}

module.exports = { arrange, list, pick, ps };
