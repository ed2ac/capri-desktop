'use strict';

// Feeds the overlay with the position of the other windows (Windows only), so Capri can
// sit on them. A small PowerShell helper does the Win32 calls; we turn its physical pixels
// into the overlay's coordinates. It also says when the window in front is another AI (ChatGPT,
// Gemini…: `ai`, the names it matched; `pages`, the ones whose own page it is in a browser; `dl`,
// a page to download one of them), for her jealousy, and never passes on a title; which game
// is in front, if one (`game`, its folder in Steam's library or another launcher's); and the USB
// sticks plugged in (`usb`, drive letters), and the last device plugged in or out (`plug`).
// close() has it close one of those pages, jealous.

const path = require('node:path');
const readline = require('node:readline');
const { spawn } = require('node:child_process');
const { screen } = require('electron');

// in the installed app it sits next to the app archive (asarUnpack), where PowerShell can read it
// "Comment on what I do": windows whose title she never gets, not even on your PC. Banks, password
// managers, private browsing, sign-in and payment pages: for those she only learns "something private".
const PRIVATE = /(?<![\p{L}\p{N}])(?:bank|banco|banque|banca|nubank|ita[uú]|bradesco|santander|caixa|inter|c6|sicoob|sicredi|paypal|mercado ?pago|picpay|pix|boleto|fatura|invoice|1password|bitwarden|keepass|lastpass|dashlane|password|senha|mot de passe|contrase[ñn]a|пароль|incognito|inprivate|private brows|navega[çc][ãa]o privada|an[ôo]nima|privée|privada|sign ?in|log ?in|entrar|connexion|iniciar sesi[óo]n|checkout|pagamento|payment|paiement|pago|cart[ãa]o|credit card|carte bancaire|tarjeta|2fa|authenticator|autenticador|otp)(?![\p{L}\p{N}])/iu;
const PRIVATE_APPS = /^(?:1password|bitwarden|keepass\w*|lastpass|dashlane|authy|credentialuihost|consent|logonui|lockapp)$/i;

// what the overlay gets of the window in front, when "Comment on what I do" is on
function appInfo(app) {
  if (!app || typeof app.proc !== 'string') return null;
  const proc = app.proc.slice(0, 60);
  const title = String(app.title || '').trim();
  if (PRIVATE_APPS.test(proc) || PRIVATE.test(title)) return { proc, title: '', private: true };
  return { proc, title };
}

const SCRIPT = path.join(__dirname, 'windows.ps1').replace(`app.asar${path.sep}`, `app.asar.unpacked${path.sep}`);

function startWindowWatch({ overlay, onUpdate, onSense = () => {} }) {
  if (process.platform !== 'win32') return { stop() {}, refresh() {}, activity() {}, sense() {}, prank: () => false, close: async () => 'windows' };

  let child = null;
  let stopped = false;
  let restarts = 0;
  let last = null; // the helper's last snapshot: it only speaks when something changes
  let asks = 0;
  let activity = false; // "Comment on what I do": the helper sends the window in front's title
  let sensing = false;  // "Feel my keyboard and mouse": counts of keys, clicks and where
  const asked = new Map(); // what we asked the helper, waiting for its answer: number -> resolve

  const handle = overlay.getNativeWindowHandle();
  const self = handle.length >= 8 ? handle.readBigUInt64LE(0) : BigInt(handle.readUInt32LE(0));

  const toOverlay = (win, bounds) => {
    const dip = screen.screenToDipRect(null, { x: win.x, y: win.y, width: win.w, height: win.h });
    return { id: win.id, x: dip.x - bounds.x, y: dip.y - bounds.y, w: dip.width, h: dip.height, max: win.max };
  };

  // the snapshot as seen from her window, wherever it is now
  const send = () => {
    if (!last || overlay.isDestroyed()) return;
    const bounds = overlay.getBounds();
    const wins = last.wins
      .map((w) => toOverlay(w, bounds))
      // only what overlaps Capri's screen
      .filter((w) => w.x < bounds.width && w.x + w.w > 0 && w.y < bounds.height && w.y + w.h > 0);
    onUpdate({
      fg: last.fg, taskbar: Boolean(last.taskbar), ai: Array.isArray(last.ai) ? last.ai : [],
      pages: Array.isArray(last.pages) ? last.pages : [], dl: Boolean(last.dl),
      game: last.game || null, usb: Array.isArray(last.usb) ? last.usb : [], plug: last.plug || null, wins,
      app: activity ? appInfo(last.app) : null,
      call: last.call && typeof last.call === 'object' ? { mic: String(last.call.mic || ''), cam: String(last.call.cam || '') } : null,
    });
  };

  const answer = (n, why) => {
    asked.get(n)?.(why);
    asked.delete(n);
  };

  const start = () => {
    child = spawn('powershell.exe', [
      '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
      '-File', SCRIPT, String(self), String(process.pid),
    ], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });

    readline.createInterface({ input: child.stdout }).on('line', (line) => {
      let msg;
      try {
        msg = JSON.parse(line);
      } catch {
        return;
      }
      if ('closed' in msg) return answer(msg.closed, String(msg.why ?? 'error'));
      if (msg.sense) {
        // clicks, from the screen's physical pixels to her window's
        const b = overlay.getBounds();
        const clicks = (Array.isArray(msg.sense.clicks) ? msg.sense.clicks : []).map(([x, y, btn]) => {
          const p = screen.screenToDipPoint({ x, y });
          return { x: p.x - b.x, y: p.y - b.y, btn };
        });
        onSense({ keys: msg.sense.keys | 0, back: msg.sense.back | 0, enter: msg.sense.enter | 0, clicks });
        return;
      }
      last = msg;
      send();
    });
    child.stdin.on('error', () => {}); // it went away: its exit says so
    if (activity) child.stdin.write('activity 1\n'); // restarted: it starts with titles off
    if (sensing) child.stdin.write('sense 1\n');
    child.stderr.on('data', (d) => console.error('[capri] window watch:', String(d).trim()));
    child.on('exit', () => {
      child = null;
      for (const n of [...asked.keys()]) answer(n, 'gone');
      if (!stopped && restarts++ < 3) setTimeout(start, 3000);
    });
  };

  start();
  return {
    stop() {
      stopped = true;
      child?.kill();
    },
    // her window moved (another screen, the taskbar in it or not): the same windows, from there
    refresh: send,
    // "Feel my keyboard and mouse" turned on or off
    sense(on) {
      sensing = Boolean(on);
      child?.stdin.write(`sense ${sensing ? 1 : 0}\n`);
    },
    // One of her pranks (play.js): tug the pointer toward a point of her window, shake a window,
    // blink the keyboard's lights. The helper keeps it short and puts everything back.
    prank(kind, arg = {}) {
      if (!child) return false;
      if (kind === 'tug') {
        const b = overlay.getBounds();
        const p = screen.dipToScreenPoint({ x: Math.round(b.x + Number(arg.x) || 0), y: Math.round(b.y + Number(arg.y) || 0) });
        child.stdin.write(`tug ${Math.round(p.x)} ${Math.round(p.y)} ${Math.round(Number(arg.ms) || 300)}\n`);
      } else if (kind === 'shake') {
        child.stdin.write(`shake ${Math.trunc(Number(arg.id)) || 0} ${Math.round(Number(arg.ms) || 450)}\n`);
      } else if (kind === 'blink') {
        child.stdin.write('blink\n');
      } else if (kind === 'jail') {
        const b = overlay.getBounds();
        const p = screen.dipToScreenPoint({ x: Math.round(b.x + Number(arg.x) || 0), y: Math.round(b.y + Number(arg.y) || 0) });
        child.stdin.write(`jail ${Math.round(p.x)} ${Math.round(p.y)} ${Math.round(Number(arg.ms) || 1500)}\n`);
      } else if (kind === 'slide') {
        child.stdin.write(`slide ${Math.trunc(Number(arg.id)) || 0} ${Math.round(Number(arg.dx) || 60)}\n`);
      } else return false;
      return true;
    },
    // "Comment on what I do" turned on or off: the helper sends titles, or stops
    activity(on) {
      activity = Boolean(on);
      child?.stdin.write(`activity ${activity ? 1 : 0}\n`);
      send();
    },
    // Close the page of AI `key` (a tab, Ctrl+W) in window `id`, if it's still that page and in
    // front: '' once done, else why not ('front', 'browser', 'page', 'keys', 'gone', 'late').
    close(id, key) {
      if (!child) return Promise.resolve('gone');
      const n = ++asks;
      return new Promise((resolve) => {
        asked.set(n, resolve);
        child.stdin.write(`close ${Math.trunc(Number(id)) || 0} ${String(key).replace(/\W/g, '')} ${n}\n`);
        setTimeout(() => answer(n, 'late'), 3000);
      });
    },
  };
}

module.exports = { startWindowWatch };
