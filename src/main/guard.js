'use strict';

// Keeping an eye on your PC's safety (Windows), for her checkup and her warnings (renderer guard.js):
// Windows' own protection (Defender, the firewall, UAC), its updates and a restart left pending,
// the disk's health and room, the battery's wear. She doesn't replace any of it: she reads what
// Windows says and tells you, in her words. Also: a program's digital signature, a file checked by
// Defender (MpCmdRun, the way Windows Security's "Scan with Microsoft Defender" does), and a watch
// on your Downloads folder for programs that just came in. Nothing here changes anything.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFile } = require('node:child_process');

const WIN = process.platform === 'win32';

function powershell(script, ms = 45000) {
  return new Promise((resolve) => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
      { windowsHide: true, timeout: ms, maxBuffer: 4 * 1024 * 1024 }, (err, out) => resolve(err && !out ? null : String(out || '')));
  });
}

const json = (text) => {
  try {
    return JSON.parse(String(text || '').trim());
  } catch {
    return null;
  }
};

// Everything at once, as Windows reports it. Each part on its own: one failing leaves the others.
const CHECKUP = `
$ErrorActionPreference = 'SilentlyContinue'
$o = [ordered]@{}
$m = Get-MpComputerStatus
if ($m) {
  $o.defender = [ordered]@{ on = [bool]$m.AntivirusEnabled; realtime = [bool]$m.RealTimeProtectionEnabled; tamper = [bool]$m.IsTamperProtected
    sigDays = [int]((Get-Date) - $m.AntivirusSignatureLastUpdated).TotalDays
    scanDays = $(if ($m.QuickScanEndTime) { [int]((Get-Date) - $m.QuickScanEndTime).TotalDays } else { -1 }) }
}
$o.antivirus = @(Get-CimInstance -Namespace root/SecurityCenter2 -ClassName AntivirusProduct | ForEach-Object { $_.displayName })
$o.firewall = @(Get-NetFirewallProfile | ForEach-Object { [ordered]@{ name = [string]$_.Name; on = [bool]$_.Enabled } })
$o.uac = ((Get-ItemProperty HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Policies\\System).EnableLUA -eq 1)
$h = Get-HotFix | Where-Object { $_.InstalledOn } | Sort-Object InstalledOn -Descending | Select-Object -First 1
if ($h) { $o.updateDays = [int]((Get-Date) - $h.InstalledOn).TotalDays }
$o.rebootPending = (Test-Path 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\WindowsUpdate\\Auto Update\\RebootRequired') -or (Test-Path 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Component Based Servicing\\RebootPending')
$o.uptimeDays = [math]::Round(((Get-Date) - (Get-CimInstance Win32_OperatingSystem).LastBootUpTime).TotalDays, 1)
$o.disks = @(Get-PhysicalDisk | ForEach-Object { [ordered]@{ name = [string]$_.FriendlyName; health = [string]$_.HealthStatus } })
$c = Get-PSDrive C; if ($c) { $o.freeGB = [math]::Round($c.Free / 1GB, 1); $o.totalGB = [math]::Round(($c.Used + $c.Free) / 1GB, 1) }
$b = Get-CimInstance -Namespace root/wmi -ClassName BatteryFullChargedCapacity | Select-Object -First 1
$d = Get-CimInstance -Namespace root/wmi -ClassName BatteryStaticData | Select-Object -First 1
if ($b -and $d -and $d.DesignedCapacity) { $o.batteryHealth = [math]::Round(100 * $b.FullChargedCapacity / $d.DesignedCapacity) }
$o | ConvertTo-Json -Depth 4 -Compress
`;

async function checkup() {
  if (!WIN) return null;
  const r = json(await powershell(CHECKUP, 60000));
  if (!r) return null;
  // what's worth telling you about, from the most serious down
  const issues = [];
  const d = r.defender;
  const other = (r.antivirus || []).filter((n) => !/defender/i.test(n));
  if (d && !d.on && !other.length) issues.push({ key: 'av', level: 3 });
  if (d && d.on && !d.realtime) issues.push({ key: 'realtime', level: 3 });
  if ((r.firewall || []).some((f) => !f.on)) issues.push({ key: 'firewall', level: 3, vars: { list: r.firewall.filter((f) => !f.on).map((f) => f.name).join(', ') } });
  if (r.uac === false) issues.push({ key: 'uac', level: 2 });
  if (d && d.on && d.sigDays > 3) issues.push({ key: 'signatures', level: 2, vars: { days: d.sigDays } });
  if ((r.disks || []).some((x) => x.health && !/healthy|íntegro|saud/i.test(x.health))) issues.push({ key: 'disk', level: 3 });
  if (r.totalGB && r.freeGB / r.totalGB < 0.1) issues.push({ key: 'space', level: 2, vars: { free: r.freeGB } });
  if (r.updateDays > 40) issues.push({ key: 'updates', level: 2, vars: { days: r.updateDays } });
  if (r.rebootPending) issues.push({ key: 'reboot', level: 1 });
  else if (r.uptimeDays >= 10) issues.push({ key: 'uptime', level: 1, vars: { days: Math.floor(r.uptimeDays) } });
  if (r.batteryHealth && r.batteryHealth < 70) issues.push({ key: 'battery', level: 1, vars: { health: r.batteryHealth } });
  return { ...r, issues };
}

// Who signed a program, as Windows sees it: { status: 'Valid' | 'NotSigned' | …, signer }
async function signature(file) {
  if (!WIN || !fs.existsSync(file)) return null;
  const q = String(file).replace(/'/g, "''");
  const r = json(await powershell(`$s = Get-AuthenticodeSignature -LiteralPath '${q}'; [ordered]@{ status = [string]$s.Status; signer = $(if ($s.SignerCertificate) { $s.SignerCertificate.GetNameInfo('SimpleName', $false) } else { '' }) } | ConvertTo-Json -Compress`, 30000));
  return r;
}

const MPCMD = path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Windows Defender', 'MpCmdRun.exe');

// One file, checked by Defender: { clean: true } | { clean: false, threat } | { error }
function scanFile(file) {
  return new Promise((resolve) => {
    if (!WIN || !fs.existsSync(MPCMD) || !fs.existsSync(file)) return resolve({ error: 'unavailable' });
    execFile(MPCMD, ['-Scan', '-ScanType', '3', '-File', file, '-DisableRemediation'], { windowsHide: true, timeout: 5 * 60000 }, (err, out) => {
      const text = String(out || '');
      const code = err ? err.code : 0;
      if (code === 0 || /found no threats/i.test(text)) return resolve({ clean: true });
      if (code === 2 || /threat/i.test(text)) return resolve({ clean: false, threat: (/Threat\s*:\s*(.+)/i.exec(text)?.[1] || '').trim() });
      resolve({ error: `MpCmdRun ${code}` });
    });
  });
}

// A quick scan of the whole PC, by Defender. It can take several minutes.
function quickScan() {
  return new Promise((resolve) => {
    if (!WIN || !fs.existsSync(MPCMD)) return resolve({ error: 'unavailable' });
    execFile(MPCMD, ['-Scan', '-ScanType', '1'], { windowsHide: true, timeout: 30 * 60000 }, (err, out) => {
      const text = String(out || '');
      if (!err || /found no threats/i.test(text)) return resolve({ clean: true });
      if (err.code === 2) return resolve({ clean: false });
      resolve({ error: `MpCmdRun ${err.code}` });
    });
  });
}

// Programs and scripts landing in Downloads (and not a browser's half-done file): onNew({ file, name, ext })
const RISKY = /\.(exe|msi|msix|appx|bat|cmd|ps1|vbs|js|jar|scr|com|lnk|iso|img|zip|rar|7z)$/i;
const PARTIAL = /\.(crdownload|part|partial|tmp|download|opdownload)$/i;
function watchDownloads(onNew) {
  if (!WIN) return () => {};
  const dir = path.join(os.homedir(), 'Downloads');
  if (!fs.existsSync(dir)) return () => {};
  const seen = new Map();
  let watcher;
  try {
    watcher = fs.watch(dir, (_kind, name) => {
      if (!name || PARTIAL.test(name) || !RISKY.test(name)) return;
      const file = path.join(dir, name);
      clearTimeout(seen.get(file));
      // once it stops changing (still being written, or renamed from .crdownload)
      seen.set(file, setTimeout(() => {
        seen.delete(file);
        fs.stat(file, (err, st) => {
          if (err || !st.isFile() || Date.now() - st.birthtimeMs > 10 * 60000) return;
          onNew({ file, name, ext: path.extname(name).slice(1).toLowerCase(), size: st.size });
        });
      }, 2500));
    });
  } catch {
    return () => {};
  }
  return () => watcher?.close();
}

module.exports = { checkup, signature, scanFile, quickScan, watchDownloads };
