'use strict';

const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');
const {
  app, BrowserWindow, Tray, Menu, ipcMain, screen, protocol, net, shell, globalShortcut, nativeImage,
  clipboard, ClipboardItem, dialog, powerMonitor, desktopCapturer, session, Notification,
} = require('electron');
const { randomUUID } = require('node:crypto');
const { execFile } = require('node:child_process');

const config = require('./config');
const { TRAY, LANGS } = require('./labels');
const { createBridge } = require('./bridge');
const { startWindowWatch } = require('./windows');
const llm = require('./llm');
const ollama = require('./ollama');
const setup = require('./setup');
const apps = require('./apps');
const system = require('./system');
const launch = require('./launch');
const files = require('./files');
const { ASSISTANTS, assistant } = require('./assistants');
const activeAssistant = () => assistant(config.load().assistant); // Claude Code or Codex
const activeHooks = () => activeAssistant().hooks;
const demoSteps = require('../../scripts/demo-sequence');

const ROOT = path.resolve(__dirname, '..', '..');
const DEV = process.argv.includes('--dev');
const PORT = Number(process.env.CAPRI_PORT) || 47823;
const SOUND_EXT = /\.(mp3|wav|ogg|m4a)$/i;

const OLLAMA_SITE = 'https://ollama.com';

protocol.registerSchemesAsPrivileged([
  { scheme: 'capri', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
]);

let overlay = null;
let tray = null;
let trayMenu = null; // also what she opens when you right-click her
let demoTimer = null;
let windowWatch = null;
// the watcher only speaks when something changes: the overlay asks for this when it (re)loads
let lastWindows = null;
let chatModels = null; // the provider's models, as last seen (null: not reached)
let chatError = null;  // why not, when the provider said
let chatErrorCode = null; // 'nokey' or 'nourl': what her setup should ask for
// Ollama's cloud, as last seen: your account ({ name } or { signin }) and the models free with it
let cloud = { at: 0, account: null, free: [] };
const chats = new Map(); // id -> AbortController of an answer being streamed

const userSoundsDir = () => path.join(app.getPath('userData'), 'sounds');

// Her memory of your chats, across restarts: { history: [{ role, content }], claude: Claude Code's session }
const memoryFile = () => path.join(app.getPath('userData'), 'memory.json');
function readMemory() {
  try {
    return JSON.parse(fs.readFileSync(memoryFile(), 'utf8'));
  } catch {
    return {};
  }
}
function saveMemory(patch) {
  try {
    fs.writeFileSync(memoryFile(), JSON.stringify({ ...readMemory(), ...patch }));
  } catch (err) {
    console.error('[capri] could not save her memory:', err.message);
  }
}
function forgetChats() {
  llm.resetClaude();
  saveMemory({ history: [], claude: null });
  sendCommand('forget');
}

// capri://app/...        -> files of this repo
// capri://usersounds/... -> the user's own sound overrides
function serveProtocol() {
  protocol.handle('capri', async (request) => {
    const url = new URL(request.url);
    let pathname = decodeURIComponent(url.pathname);
    // models she downloaded (her offline voice), kept in her data folder: capri://app/models/…
    const models = url.host === 'app' && pathname.startsWith('/models/');
    if (models) pathname = pathname.slice('/models'.length);
    const base = url.host === 'usersounds' ? userSoundsDir() : models ? MODELS_DIR : ROOT;
    const target = path.resolve(base, '.' + pathname);
    if (target !== base && !target.startsWith(base + path.sep)) {
      return new Response('forbidden', { status: 403 });
    }
    const res = await net.fetch(pathToFileURL(target).toString());
    // her offline voice's window is isolated (so its engine can use several cores): what it loads says it may be
    const headers = new Headers(res.headers);
    headers.set('Cross-Origin-Resource-Policy', 'same-origin');
    if (url.pathname.startsWith('/src/whisper/') || url.pathname.startsWith('/src/vendor/transformers/')) { // its page and its engine's workers
      headers.set('Cross-Origin-Opener-Policy', 'same-origin');
      headers.set('Cross-Origin-Embedder-Policy', 'require-corp');
    }
    if (/\.wasm$/.test(pathname)) headers.set('content-type', 'application/wasm');
    return new Response(res.body, { status: res.status, headers });
  });
}

// Your screens. In --dev with CAPRI_SCREENS=2 and only one screen, it's cut in two halves side by
// side, to try her going from one to the other without a second monitor.
function displays() {
  const real = screen.getAllDisplays();
  if (!DEV || process.env.CAPRI_SCREENS !== '2' || real.length > 1) return real;
  const d = screen.getPrimaryDisplay();
  const half = (r, i) => ({ x: r.x + Math.floor(r.width / 2) * i, y: r.y, width: Math.floor(r.width / 2), height: r.height });
  return [0, 1].map((i) => ({ ...d, id: d.id * 10 + i + 1, bounds: half(d.bounds, i), workArea: half(d.workArea, i), size: { width: Math.floor(d.size.width / 2), height: d.size.height } }));
}

// The screen a point (DIP) is on, else the nearest one.
function displayAt(p) {
  const all = displays();
  const inside = all.find(({ bounds: b }) => p.x >= b.x && p.y >= b.y && p.x < b.x + b.width && p.y < b.y + b.height);
  if (inside) return inside;
  const near = screen.getDisplayNearestPoint(p);
  return all.find((d) => d.id === near.id) || all[0];
}

function targetDisplay() {
  const { displayId } = config.load();
  const all = displays();
  return all.find((d) => d.id === displayId) || all.find((d) => d.id === screen.getPrimaryDisplay().id) || all[0];
}

// Her window over to another screen (she's on her way there, screens.js). Set twice: going to a
// screen with another scale, Windows resizes the window once it lands there.
function moveOverlay(id) {
  if (!displays().some((d) => d.id === id)) return null;
  config.save({ displayId: id });
  fitOverlay();
  const { area } = overlayArea();
  overlay.setBounds(area);
  windowWatch?.refresh();
  rebuildTray();
  return area;
}

// Her window: the work area, or the whole screen while she rests on the taskbar (her legs hang
// over it), less its top row of pixels: a window on top covering the whole screen is a fullscreen
// app to Windows (animated wallpapers pause, notifications wait). `gap`: how much of her window is
// below the top of the taskbar (0, or its height).
function overlayArea() {
  const { workArea, bounds } = targetDisplay();
  const area = config.load().rest === 'taskbar' ? { ...bounds, y: bounds.y + 1, height: bounds.height - 1 } : workArea;
  return { area, gap: area.y + area.height - (workArea.y + workArea.height) };
}

function fitOverlay() {
  if (!overlay) return;
  const { area, gap } = overlayArea();
  overlay.setBounds(area);
  overlay.webContents.send('overlay:resize', { width: area.width, height: area.height, gap });
}

// The pointer reaches her click-through window through a mouse hook, and Windows drops a hook that
// doesn't answer in time without a word (waking from sleep, a locked screen, a stall): she can't be
// clicked anymore. Off then on puts in a new one; her place on top and her size are set again too.
function rearmOverlay() {
  if (!overlay || overlay.isDestroyed()) return;
  overlay.setIgnoreMouseEvents(false);
  overlay.setIgnoreMouseEvents(true, { forward: true });
  overlay.setAlwaysOnTop(true, 'screen-saver');
  fitOverlay();
  sendCommand('rearmed'); // click-through again: she waits for the pointer to be on her
  console.log('[capri] mouse hook set up again');
}

// Back on top of everything, the taskbar included (it comes up over her when it's clicked). Twice:
// the taskbar can come up again a moment later, as its menus and previews open.
function raiseOverlay() {
  for (const wait of [0, 400]) {
    setTimeout(() => {
      if (!overlay || overlay.isDestroyed()) return;
      overlay.setAlwaysOnTop(true, 'screen-saver');
      overlay.moveTop();
    }, wait);
  }
}

function createOverlay() {
  overlay = new BrowserWindow({
    ...overlayArea().area,
    transparent: true,
    backgroundColor: '#00000000',
    frame: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    focusable: false,
    hasShadow: false,
    alwaysOnTop: true,
    type: process.platform === 'win32' ? 'toolbar' : undefined,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
      autoplayPolicy: 'no-user-gesture-required',
    },
  });

  overlay.setAlwaysOnTop(true, 'screen-saver');
  overlay.setIgnoreMouseEvents(true, { forward: true });
  overlay.loadURL('capri://app/src/renderer/index.html');
  // always shown: put away, she's still there as her biochip in the corner. Sized again first:
  // Windows keeps a new window inside the work area, and resting on the taskbar it covers it too.
  overlay.once('ready-to-show', () => {
    fitOverlay();
    overlay.showInactive();
  });
  overlay.webContents.on('render-process-gone', (_e, details) => {
    console.error('[capri] renderer gone:', details.reason);
  });
  if (DEV) {
    overlay.webContents.on('console-message', (e) => {
      const { level, message, lineNumber, sourceId } = e;
      console.log(`[renderer:${level}] ${message} (${String(sourceId).split('/').pop()}:${lineNumber})`);
    });
    if (process.env.CAPRI_DEVTOOLS) overlay.webContents.openDevTools({ mode: 'detach' });
  }
}

function sendCommand(name, payload = {}) {
  overlay?.webContents.send('capri:command', { name, ...payload });
}

// Ctrl+Alt+C: she folds herself away into her biochip in the corner, or comes back out of it.
function toggleVisible(force) {
  const visible = typeof force === 'boolean' ? force : !config.load().visible;
  config.save({ visible });
  sendCommand('stow', { on: !visible });
  rebuildTray();
}

function playDemo() {
  clearTimeout(demoTimer);
  const steps = demoSteps(resolveLang(config.load().lang)); // in her language
  let i = 0;
  const next = () => {
    if (i >= steps.length) return;
    const [delay, evt] = steps[i++];
    demoTimer = setTimeout(() => {
      overlay?.webContents.send('claude:event', evt);
      next();
    }, delay);
  };
  next();
}

// During the demo, a little fake terminal for her to sit on and take over (window tracking is
// Windows only, so only there). Opened without stealing focus; closing it drops her off it.
let demoWin = null;
const DEMO_TERMINAL = `<body style="margin:0;background:#14101c;color:#8f8aa3;font:13px/1.7 Consolas,monospace;padding:14px 18px">
<div style="color:#36ff7a">PS C:\\night-city-api&gt; npm test -- gigs</div>
<div>&nbsp;&nbsp;GET /gigs</div><div style="color:#36ff7a">&nbsp;&nbsp;&nbsp;&nbsp;✓ returns 20 items per page</div>
<div style="color:#36ff7a">&nbsp;&nbsp;&nbsp;&nbsp;✓ paginates with a cursor</div><div style="color:#36ff7a">&nbsp;&nbsp;&nbsp;&nbsp;✓ rejects a bad cursor</div>
<div>&nbsp;&nbsp;6 passing (212ms)</div><div style="color:#36ff7a">PS C:\\night-city-api&gt; _</div></body>`;

function demoWindow(open) {
  demoWin?.destroy();
  demoWin = null;
  if (!open || process.platform !== 'win32') return false;
  const b = overlay.getBounds();
  demoWin = new BrowserWindow({
    x: Math.round(b.x + b.width * 0.5 - 310), y: Math.round(b.y + b.height * 0.42), width: 620, height: 300,
    show: false, alwaysOnTop: true, title: 'night-city-api — npm test', backgroundColor: '#14101c', autoHideMenuBar: true,
  });
  demoWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(DEMO_TERMINAL)}`);
  demoWin.once('ready-to-show', () => demoWin?.showInactive());
  demoWin.on('closed', () => { demoWin = null; });
  return true;
}

// 'auto' -> the first system language Capri speaks, English otherwise.
function resolveLang(setting) {
  if (LANGS.includes(setting)) return setting;
  const preferred = [...app.getPreferredSystemLanguages(), app.getSystemLocale(), app.getLocale()];
  for (const tag of preferred) {
    const base = String(tag || '').toLowerCase().split(/[-_]/)[0];
    if (LANGS.includes(base)) return base;
  }
  return 'en';
}

// What the overlay gets: `lang` is the resolved one, `langSetting` what the user picked.
function rendererConfig() {
  const { apiKeys, ...cfg } = config.load(); // the keys stay here: the overlay only learns which ones are set
  return { ...cfg, keys: Object.keys(apiKeys || {}), assistant: activeAssistant().id, lang: resolveLang(cfg.lang), langSetting: cfg.lang, floorGap: overlayArea().gap };
}

function updateConfig(patch) {
  config.save(patch);
  if ('senseInput' in patch) windowWatch?.sense(patch.senseInput === true);
  if ('theme' in patch || 'language' in patch) setTimeout(workSend, 0); // her workshop follows her looks
  if ('noticesOn' in patch) setTimeout(noticesSync, 0);
  if ('todos' in patch || 'profile' in patch || 'notesDir' in patch) notesSoon();
  if ('earOn' in patch || 'wakeWord' in patch) wakeSync();
  if ('watchActivity' in patch) {
    windowWatch?.activity(patch.watchActivity);
    followDay(patch.watchActivity === true);
  }
  if ('rest' in patch) {
    fitOverlay(); // the taskbar in her window or not
    windowWatch?.refresh();
  }
  const cfg = rendererConfig();
  overlay?.webContents.send('capri:config', cfg);
  rebuildTray();
  return cfg;
}

// What's playing and the screenshots you take, for her to talk about: only while "Comment on what I
// do" is on, and only to her local model (daily.js)
let dayWatch = null;
const shotFiles = new Set();
function followDay(on) {
  if (!on) {
    dayWatch?.forEach((stop) => stop());
    dayWatch = null;
    return;
  }
  if (dayWatch) return;
  const daily = require('./daily');
  dayWatch = [
    daily.watchMedia((m) => overlay?.webContents.send('daily:media', m)),
    daily.watchScreenshots((file) => {
      shotFiles.add(file);
      overlay?.webContents.send('daily:shot', { file });
    }),
  ];
}

// ---- Her hands (tasks.js): Claude Code doing what you asked her, every step by your leave ----
const tasks = require('./tasks');
const GATE_SCRIPT = path.join(__dirname, '..', '..', 'hooks', 'capri-gate.js').replace(`app.asar${path.sep}`, `app.asar.unpacked${path.sep}`);
const gates = new Map(); // id -> resolve({ allow, reason })
let taskAbort = null;

// Claude Code asks (hooks/capri-gate.js): she asks you, and this waits for your click (10 minutes at most)
function askGate(evt) {
  if (!tasks.isTaskSession(evt.session_id)) return Promise.resolve({ allow: false, reason: 'Not one of Capri\'s tasks.' });
  const id = randomUUID();
  return new Promise((resolve) => {
    const ask = { id, tool: String(evt.tool_name || ''), input: evt.tool_input || {} };
    gates.set(id, (answer) => {
      work.asks.delete(id);
      workSend();
      resolve(answer);
    });
    work.asks.set(id, ask);
    workSend();
    overlay?.webContents.send('gate:ask', ask);
    setTimeout(() => {
      if (!gates.has(id)) return;
      const done = gates.get(id);
      gates.delete(id);
      overlay?.webContents.send('gate:gone', { id });
      done({ allow: false, reason: 'Nobody answered in time.' });
    }, 10 * 60 * 1000);
  });
}

async function startTask({ prompt, lang, persona, project, folder, resume }) {
  if (typeof prompt !== 'string' || !prompt.trim()) return { ok: false, error: 'empty' };
  // one of your projects, or a folder you named (checked again here: it must be there)
  const listed = (await tasks.projects(config.load().projectsRoot)).find((p) => p.dir === project)?.dir || null;
  const named = !listed && typeof folder === 'string' && folder ? (await tasks.folder({ path: folder }))?.dir : null;
  if (folder && !listed && !named) return { ok: false, error: 'nofolder' };
  taskAbort = new AbortController();
  const id = randomUUID();
  const model = (() => {
    const m = config.load().taskModel || 'sonnet';
    if (m === 'auto') return project || folder ? 'opus' : 'sonnet';
    return m === 'default' ? null : m;
  })();
  const permission = ['auto', 'acceptEdits', 'default'].includes(config.load().taskPermission) ? config.load().taskPermission : 'auto';
  work.task = { id, prompt: prompt.slice(0, 4000), dir: listed || named || tasks.SHOP, model: model || 'padrão', permission, startedAt: Date.now(), steps: [] };
  if (config.load().workshopAuto !== false) openWorkshop({ quiet: true });
  workSend();
  const r = await tasks.run({
    id, prompt: prompt.slice(0, 4000), lang: String(lang || 'English'), persona: String(persona || ''), gateScript: GATE_SCRIPT,
    project: listed || named,
    resume: typeof resume === 'string' ? resume : null,
    // her menu › Claude's model: Sonnet by default; "auto" takes Opus for your code projects
    model,
    permission,
    signal: taskAbort.signal,
    onEvent: (e) => {
      workStep(e);
      if (e.kind !== 'limits') overlay?.webContents.send('task:event', e);
    },
  });
  taskAbort = null;
  workEnd(r);
  rebuildTray(); // a new program may be there
  return r;
}

// A program from her workshop, in a window of its own: a web page, nothing more (no Node, sandboxed)
function openProgram(p) {
  const win = new BrowserWindow({
    width: 1000, height: 720, title: p.name, autoHideMenuBar: true, backgroundColor: '#14101c',
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, partition: `persist:capri-program-${path.basename(p.dir)}` },
  });
  const inside = (url) => url.startsWith(pathToFileURL(p.dir).href);
  win.webContents.on('will-navigate', (e, url) => {
    if (inside(url)) return;
    e.preventDefault();
    if (/^https?:/i.test(url)) shell.openExternal(url);
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.loadFile(p.page);
}

// ---- Your GitHub (github.js): every 10 minutes, what's new in your notifications ----
let ghFirst = true;
async function githubTick() {
  const cfg = config.load();
  if (cfg.githubWatch === false || !overlay) return;
  const seen = new Set(cfg.ghSeen || []);
  const fresh = await require('./github').news(seen, ghFirst && !(cfg.ghSeen || []).length).catch(() => null);
  if (fresh == null) return;
  ghFirst = false;
  config.save({ ghSeen: [...seen].slice(-300) });
  if (fresh.length) overlay.webContents.send('gh:news', fresh.slice(0, 5));
}

// ---- Your PS5 (psn.js): what you're playing now, and your games' play time once a day ----
const psn = require('./psn');
let psnLast = { game: null, since: 0 };
let psnTimer = null;
const psnKeep = (r) => config.save({ psnRefresh: setup.sealKey(r) });
function psnStart() {
  const cfg = config.load();
  if (!cfg.psnRefresh) return;
  psn.use(setup.openKey(cfg.psnRefresh), cfg.psnAccount);
  clearInterval(psnTimer);
  const tick = async () => {
    const p = await psn.presence(psnKeep).catch((err) => ({ error: err.message }));
    if (p.error) { if (/refresh|401|invalid_grant/i.test(p.error)) overlay?.webContents.send('psn:event', { type: 'expired' }); return; }
    const game = p.online ? p.game : null;
    if (game !== psnLast.game) {
      if (psnLast.game) overlay?.webContents.send('psn:event', { type: 'stop', game: psnLast.game, minutes: Math.round((Date.now() - psnLast.since) / 60000) });
      if (game) overlay?.webContents.send('psn:event', { type: 'start', game, platform: p.platform });
      psnLast = { game, since: Date.now(), trophiesAt: psnLast.trophiesAt };
    }
    // your trophies: every 10 minutes while you play, every hour otherwise
    const every = game ? 10 * 60000 : 60 * 60000;
    if (Date.now() - (psnLast.trophiesAt || 0) > every) {
      psnLast.trophiesAt = Date.now();
      const now = await psn.trophies(psnKeep).catch(() => null);
      if (now) {
        const before = config.load().psnTrophies;
        config.save({ psnTrophies: now });
        const news = before ? psn.newTrophies(before, now) : [];
        if (news.length) overlay?.webContents.send('psn:event', { type: 'trophies', list: news.slice(0, 6) });
      }
    }
    // once a day: each game's play time, what's new since the last look into her memory
    const day = new Date().toDateString();
    if (config.load().psnSyncDay !== day) {
      const list = await psn.games(psnKeep).catch(() => null);
      if (list) {
        const before = config.load().psnMinutes || {};
        const now = Object.fromEntries(list.map((g) => [g.name, g.minutes]));
        const news = list.map((g) => ({ name: g.name, minutes: g.minutes - (before[g.name] || 0) })).filter((g) => g.minutes > 0);
        config.save({ psnMinutes: now, psnSyncDay: day });
        if (news.length) overlay?.webContents.send('psn:games', news.slice(0, 40));
      }
    }
  };
  setTimeout(() => tick().catch(() => {}), 20000);
  psnTimer = setInterval(() => tick().catch(() => {}), 2 * 60000);
}

// ---- Her updates (electron-updater, from GitHub releases): looked for at start and every 6 hours;
// a new one found, she asks you first, then downloads, installs and comes back ----
let updater = null;
function updatesStart() {
  if (!app.isPackaged) return;
  try { updater = require('electron-updater').autoUpdater; } catch { return; }
  updater.autoDownload = false;
  updater.autoInstallOnAppQuit = false;
  updater.on('update-available', (info) => { if (!manualUpdate.on) overlay?.webContents.send('update:available', { version: info.version }); });
  updater.on('download-progress', (p) => overlay?.webContents.send('update:progress', { percent: Math.round(p.percent) }));
  updater.on('update-downloaded', () => setTimeout(() => updater.quitAndInstall(true, true), 1500));
  updater.on('error', (err) => overlay?.webContents.send('update:error', { error: String(err?.message || err).slice(0, 200) }));
  const look = () => updater.checkForUpdates().catch(() => {});
  setTimeout(look, 60000);
  setInterval(look, 6 * 3600000);
}

// Her menu › Look for updates: the same, with Windows' own dialogs (if her chat isn't there to ask)
async function manualUpdate(t) {
  if (!updater) {
    dialog.showMessageBox({ type: 'info', message: t.updateDev, buttons: ['OK'] });
    return;
  }
  manualUpdate.on = true;
  try {
    const r = await updater.checkForUpdates();
    const next = r?.updateInfo?.version;
    const newer = next && next.localeCompare(app.getVersion(), undefined, { numeric: true }) > 0;
    if (!newer) {
      dialog.showMessageBox({ type: 'info', message: t.updateNone.replace('{version}', app.getVersion()), buttons: ['OK'] });
      return;
    }
    const ok = await dialog.showMessageBox({ type: 'question', message: t.updateAsk.replace('{next}', next).replace('{version}', app.getVersion()), buttons: [t.updateYes, t.updateNo], defaultId: 0, cancelId: 1 });
    if (ok.response !== 0) return;
    tray?.setToolTip(t.updateDownloading);
    await updater.downloadUpdate(); // then 'update-downloaded': installs and comes back
  } catch (err) {
    dialog.showErrorBox('Capri', `${t.updateFailed} ${err.message}`);
  } finally {
    manualUpdate.on = false;
  }
}

// ---- Backup: everything of hers in a folder of yours, and back (a new PC, a reinstall) ----
// Her settings, her memory and diary, her drawings, her workshop's history and queue, and what she
// keeps in her window (her heart, your bond). Not the keys and logins (encrypted with this Windows
// account, they wouldn't open elsewhere) nor your face: those you connect again.
const SECRET_KEYS = ['apiKeys', 'psnRefresh', 'spotifyRefresh', 'faceData'];
async function exportBackup(parent) {
  const stamp = new Date().toISOString().slice(0, 10);
  const dir = path.join(parent, `Capri-backup-${stamp}`);
  fs.mkdirSync(dir, { recursive: true });
  const cfg = { ...config.load() };
  for (const k of SECRET_KEYS) delete cfg[k];
  fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify(cfg, null, 1));
  fs.writeFileSync(path.join(dir, 'memory.json'), JSON.stringify(readMemory(), null, 1));
  const storage = await overlay?.webContents.executeJavaScript("JSON.stringify(Object.fromEntries(Object.keys(localStorage).filter((k) => k.startsWith('capri')).map((k) => [k, localStorage.getItem(k)])))").catch(() => '{}');
  fs.writeFileSync(path.join(dir, 'her.json'), storage || '{}');
  for (const [from, name] of [[path.join(tasks.SHOP, 'desenhos'), 'desenhos'], [path.join(tasks.SHOP, '.runs'), 'oficina']]) {
    if (!fs.existsSync(from)) continue;
    fs.mkdirSync(path.join(dir, name), { recursive: true });
    for (const f of fs.readdirSync(from)) if (/\.(png|json)$/i.test(f) && /^(history|queue)\.json$|\.png$/i.test(f)) fs.copyFileSync(path.join(from, f), path.join(dir, name, f));
  }
  return dir;
}
async function importBackup(dir) {
  const read = (f) => { try { return JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); } catch { return null; } };
  const cfg = read('config.json');
  if (!cfg) throw new Error('not a backup');
  for (const k of SECRET_KEYS) delete cfg[k];
  config.save(cfg); // the keys and logins of this PC stay as they are
  const mem = read('memory.json');
  if (mem) saveMemory(mem);
  const her = read('her.json');
  if (her) await overlay?.webContents.executeJavaScript(`(() => { const d = ${JSON.stringify(her)}; for (const [k, v] of Object.entries(d)) if (k.startsWith('capri')) localStorage.setItem(k, v); })()`).catch(() => {});
  for (const [name, to] of [['desenhos', path.join(tasks.SHOP, 'desenhos')], ['oficina', path.join(tasks.SHOP, '.runs')]]) {
    const from = path.join(dir, name);
    if (!fs.existsSync(from)) continue;
    fs.mkdirSync(to, { recursive: true });
    for (const f of fs.readdirSync(from)) fs.copyFileSync(path.join(from, f), path.join(to, f));
  }
  app.relaunch();
  app.exit(0);
}

// ---- Streamers going live (lives.js): every 5 minutes, the ones you asked her to watch for ----
const liveNow = new Set();
async function livesTick() {
  const list = config.load().lives || [];
  const lives = require('./lives');
  for (const l of list) {
    const r = await lives.check(l).catch(() => null);
    const key = `${l.site}:${l.name.toLowerCase()}`;
    if (!r) continue;
    if (r.live && !liveNow.has(key)) overlay?.webContents.send('lives:on', { ...l, url: r.url, title: r.title });
    if (r.live) liveNow.add(key); else liveNow.delete(key);
  }
}

const fmtLabel = (s, v) => String(s).replace('{folder}', v);

// ---- Her notes in a folder of yours (an Obsidian vault…): her diary, your to-dos, what she knows ----
let notesTimer = null;
function notesSoon() {
  clearTimeout(notesTimer);
  notesTimer = setTimeout(() => { try { writeNotes(); } catch (err) { console.error('[capri] notes:', err.message); } }, 5000);
}
function writeNotes() {
  const cfg = config.load();
  if (!cfg.notesDir || !fs.existsSync(cfg.notesDir)) return;
  const root = path.join(cfg.notesDir, 'Capri');
  const put = (rel, text) => {
    const file = path.join(root, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    if (!fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== text) fs.writeFileSync(file, text);
  };
  const { diary = {} } = readMemory();
  for (const [date, text] of Object.entries(diary)) put(path.join('Diário', `${date}.md`), `---\ndate: ${date}\ntags: [capri, diario]\n---\n\n${text}\n`);
  const todos = Array.isArray(cfg.todos) ? cfg.todos : [];
  put('Tarefas.md', `# Tarefas\n\n${todos.map((t) => `- [${t.done ? 'x' : ' '}] ${t.text}`).join('\n') || '_(nenhuma)_'}\n`);
  const titles = { told: 'Você pediu pra lembrar', likes: 'Gosta de', dislikes: 'Não gosta de', people: 'Pessoas', plans: 'Planos', projects: 'Projetos', routine: 'Rotina', fact: 'Sobre você', music: 'Música', games: 'Jogos', freeTime: 'Tempo livre no PC' };
  const profile = Array.isArray(cfg.profile) ? cfg.profile : [];
  const sections = Object.entries(titles).map(([k, title]) => {
    const items = profile.filter((i) => i.kind === k).sort((a, b) => b.weight - a.weight).slice(0, 25);
    return items.length ? `## ${title}\n\n${items.map((i) => `- ${i.label}`).join('\n')}` : '';
  }).filter(Boolean);
  put('Sobre mim.md', `# O que a Capri sabe de mim\n\n${sections.join('\n\n') || '_(ainda nada)_'}\n`);
}

// ---- Her offline voice: Whisper on this PC (src/whisper), its model downloaded once (~250 MB) ----
const MODELS_DIR = path.join(app.getPath('userData'), 'models');
const WHISPER = 'onnx-community/whisper-small';
const WHISPER_FILES = ['config.json', 'generation_config.json', 'preprocessor_config.json', 'tokenizer.json', 'tokenizer_config.json',
  'special_tokens_map.json', 'added_tokens.json', 'normalizer.json', 'vocab.json', 'merges.txt',
  'onnx/encoder_model_quantized.onnx', 'onnx/decoder_model_merged_quantized.onnx'];
let whisperWin = null;
let whisperOk = false;
const whisperJobs = new Map();
const whisperDir = () => path.join(MODELS_DIR, WHISPER);
const whisperHere = () => WHISPER_FILES.filter((f) => f.startsWith('onnx/')).every((f) => fs.existsSync(path.join(whisperDir(), f)));
const whisperReady = () => whisperOk && whisperWin && !whisperWin.isDestroyed();

// the model's files from Hugging Face, with progress (0..1) to her overlay
async function whisperDownload() {
  const total = { done: 0, size: 0 };
  for (const f of WHISPER_FILES) {
    const dest = path.join(whisperDir(), f);
    if (fs.existsSync(dest)) continue;
    const res = await fetch(`https://huggingface.co/${WHISPER}/resolve/main/${f}`);
    if (res.status === 404 && !f.startsWith('onnx/')) continue; // not every model has every small file
    if (!res.ok) throw new Error(`${f}: HTTP ${res.status}`);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    const size = Number(res.headers.get('content-length') || 0);
    total.size += size;
    const part = `${dest}.part`;
    const out = fs.createWriteStream(part);
    for await (const chunk of res.body) {
      out.write(chunk);
      total.done += chunk.length;
      if (size > 1e6) overlay?.webContents.send('voice:progress', { file: f, done: total.done, size: Math.max(total.size, 250e6) });
    }
    await new Promise((r) => out.end(r));
    fs.renameSync(part, dest);
  }
}

function whisperStart() {
  if (whisperWin || config.load().voiceLocal !== true || !whisperHere()) return;
  whisperWin = new BrowserWindow({
    show: false, skipTaskbar: true,
    webPreferences: { preload: path.join(__dirname, '..', 'whisper', 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false },
  });
  whisperWin.loadURL('capri://app/src/whisper/whisper.html');
  whisperWin.on('closed', () => { whisperWin = null; whisperOk = false; });
}
function whisperStop() {
  whisperWin?.destroy();
  whisperWin = null;
  whisperOk = false;
}
function whisperJob(audio, lang) {
  const id = randomUUID();
  return new Promise((resolve, reject) => {
    whisperJobs.set(id, resolve);
    whisperWin.webContents.send('whisper:job', { id, audio, lang });
    setTimeout(() => { if (whisperJobs.delete(id)) reject(new Error('timeout')); }, 60000);
  });
}

// ---- Your Windows notifications (notices.js): only with her menu's "Read my notifications" on ----
let noticesTimer = null;
function noticesSync() {
  const on = config.load().noticesOn === true && process.platform === 'win32';
  const notices = require('./notices');
  if (!on) { clearInterval(noticesTimer); noticesTimer = null; notices.close(); return; }
  if (noticesTimer) return;
  try { notices.fresh(); } catch { /* learns where the list is */ }
  noticesTimer = setInterval(() => {
    let list = [];
    try { list = notices.fresh(); } catch { notices.close(); }
    if (list.length) overlay?.webContents.send('notices', list);
  }, 15000);
}

// ---- Your Spotify (spotify.js): what's playing, your top artists, songs played, playlists ----
const spotify = require('./spotify');
const spotifyKeep = (r) => config.save({ spotifyRefresh: setup.sealKey(r) });
let spotifyTimer = null;
let spotifySong = '';
function spotifyStart() {
  const cfg = config.load();
  if (!cfg.spotifyClient || !cfg.spotifyRefresh) return;
  spotify.use(cfg.spotifyClient, setup.openKey(cfg.spotifyRefresh));
  clearInterval(spotifyTimer);
  const tick = async () => {
    const n = await spotify.now(spotifyKeep).catch(() => null);
    const key = n?.playing ? `${n.artist} - ${n.title}` : '';
    if (key && key !== spotifySong) overlay?.webContents.send('spotify:now', n);
    spotifySong = key;
    // your top artists, once a week
    const week = Math.floor(Date.now() / (7 * 86400000));
    if (config.load().spotifyTopWeek !== week) {
      const top = await spotify.topArtists(spotifyKeep).catch(() => null);
      if (top) { config.save({ spotifyTopWeek: week }); overlay?.webContents.send('spotify:top', top); }
    }
  };
  setTimeout(() => tick().catch(() => {}), 15000);
  spotifyTimer = setInterval(() => tick().catch(() => {}), 30000);
}

// ---- Claude Code talking to you through her (hooks/capri-mcp.js, over the bridge's /mcp) ----
const mcpAsks = new Map(); // id -> resolve(answer)
function onMcp({ tool, args = {}, cwd = '' } = {}) {
  if (!overlay) return { ok: false, error: 'not ready' };
  if (config.load().mcpOn === false) return { ok: false, off: true, error: 'off' }; // her menu: Claude carries on on its own
  const project = String(cwd || '').split('/').filter(Boolean).pop() || '';
  const text = (s, n) => String(s || '').slice(0, n);
  if (tool === 'capri_say') {
    overlay.webContents.send('mcp:say', { text: text(args.text, 600), mood: ['done', 'alert'].includes(args.mood) ? args.mood : 'info', project });
    return { ok: true };
  }
  if (tool === 'capri_progress') {
    overlay.webContents.send('mcp:progress', { text: text(args.text, 120), project });
    return { ok: true };
  }
  if (tool === 'capri_notify') {
    if (Notification.isSupported()) new Notification({ title: text(args.title || 'Claude', 60), body: text(args.text, 200), silent: false, icon: path.join(ROOT, 'assets', 'icons', 'tray.png') }).show();
    overlay.webContents.send('mcp:say', { text: text(args.text, 300), mood: 'info', project });
    return { ok: true };
  }
  if (tool === 'capri_ask') {
    const id = randomUUID();
    return new Promise((resolve) => {
      mcpAsks.set(id, (answer) => resolve({ ok: true, answer }));
      overlay.webContents.send('mcp:ask', { id, question: text(args.question, 400), options: (Array.isArray(args.options) ? args.options : []).slice(0, 4).map((o) => text(o, 40)), project });
      setTimeout(() => { if (mcpAsks.has(id)) { mcpAsks.delete(id); overlay?.webContents.send('mcp:gone', { id }); resolve({ ok: true, answer: null }); } }, 5 * 60 * 1000);
    });
  }
  return { ok: false, error: 'unknown tool' };
}

// ---- Your browser's tabs, through her extension (extension/, tabs.js) ----
const tabs = require('./tabs');
tabs.events((e) => overlay?.webContents.send('tabs:event', e));
const words = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
async function tabsDo({ action, query = '', ids = [] } = {}) {
  if (!tabs.connected()) return { ok: false, error: 'offline' };
  const q = words(query).trim();
  const match = (t) => q && (words(t.title).includes(q) || words(t.url).includes(q.replace(/\s+/g, '')));
  if (action === 'count' || action === 'find' || action === 'go') {
    const r = await tabs.ask('list');
    if (!r.ok) return r;
    if (action === 'count') {
      const sites = {};
      for (const t of r.tabs) { try { const u = new URL(t.url); const h = u.hostname.replace(/^www\./, ''); if (h && /^https?:$/.test(u.protocol)) sites[h] = (sites[h] || 0) + 1; } catch { /* not a page */ } } // the browser's own pages aren't sites
      return { ok: true, count: r.tabs.length, top: Object.entries(sites).sort((a, b) => b[1] - a[1]).slice(0, 3) };
    }
    const found = r.tabs.filter(match);
    if (action === 'go') {
      if (!found[0]) return { ok: false, error: 'notfound' };
      await tabs.ask('go', { id: found[0].id });
      return { ok: true, title: found[0].title };
    }
    return { ok: true, tabs: found.map((t) => ({ id: t.id, title: t.title })) };
  }
  if (action === 'close') return tabs.ask('close', { ids: ids.map(Number).filter(Number.isFinite).slice(0, 200) });
  if (action === 'save') {
    const r = await tabs.ask('window');
    if (!r.ok) return r;
    const put = r.tabs.filter((t) => /^https?:/i.test(t.url));
    if (!put.length) return { ok: false, error: 'none' };
    const set = tabs.keep(tasks.SHOP, put);
    await tabs.ask('close', { ids: put.filter((t) => !t.active).map((t) => t.id) });
    return { ok: true, count: set.tabs.length };
  }
  if (action === 'restore') {
    const set = tabs.takeLast(tasks.SHOP);
    if (!set) return { ok: false, error: 'none' };
    const r = await tabs.ask('open', { tabs: set.tabs });
    return r.ok ? { ok: true, count: set.tabs.length } : r;
  }
  if (action === 'page') return tabs.ask('page', {}, 10000);
  if (action === 'media') return tabs.ask('media', {}, 6000);
  if (action === 'sites') return tabs.ask('sites', { day: typeof query === 'string' && /^\d{4}-\d\d-\d\d$/.test(query) ? query : null, days: Number(ids?.[0]) || 1 });
  if (action === 'focus') {
    const block = config.load().focusSites || ['youtube.com', 'instagram.com', 'x.com', 'twitter.com', 'tiktok.com', 'facebook.com', 'reddit.com', 'twitch.tv', 'netflix.com', 'kwai.com'];
    return tabs.ask('focus', { on: query === 'on', minutes: Number(ids?.[0]) || 50, block });
  }
  return { ok: false, error: 'action' };
}
// her extension, already loaded from her workshop: kept up to date with this version of her
function refreshExtension() {
  const from = path.join(ROOT, 'extension');
  const to = path.join(tasks.SHOP, 'extensao');
  if (!fs.existsSync(path.join(to, 'manifest.json'))) return false;
  let changed = false;
  for (const f of fs.readdirSync(from)) {
    const data = fs.readFileSync(path.join(from, f));
    const dest = path.join(to, f);
    if (!fs.existsSync(dest) || !fs.readFileSync(dest).equals(data)) { fs.writeFileSync(dest, data); changed = true; }
  }
  return changed;
}

// her extension, put where your browser can load it from (it can't from inside her app's archive)
function installExtension() {
  const from = path.join(ROOT, 'extension');
  const to = path.join(tasks.SHOP, 'extensao');
  fs.mkdirSync(to, { recursive: true });
  for (const f of fs.readdirSync(from)) fs.writeFileSync(path.join(to, f), fs.readFileSync(path.join(from, f)));
  shell.openPath(to);
  sendCommand('tabsGuide', { dir: to });
}

// ---- Her corner (src/corner): her drawings, her diary of your days, her achievements ----
let cornerWin = null;
function openCorner() {
  if (cornerWin) { cornerWin.show(); cornerWin.focus(); return; }
  cornerWin = new BrowserWindow({
    width: 900, height: 680, minWidth: 480, minHeight: 400, title: 'Cantinho da Capri', autoHideMenuBar: true, backgroundColor: '#14101c',
    icon: path.join(ROOT, 'assets', 'icons', 'tray.png'),
    webPreferences: { preload: path.join(__dirname, '..', 'corner', 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  cornerWin.loadURL('capri://app/src/corner/corner.html');
  cornerWin.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  cornerWin.webContents.on('will-navigate', (e) => e.preventDefault());
  cornerWin.on('closed', () => { cornerWin = null; });
}
const ART_DIR = path.join(tasks.SHOP, 'desenhos');
function cornerData() {
  let drawings = [];
  try {
    drawings = fs.readdirSync(ART_DIR).filter((f) => /^[\w-]+\.png$/i.test(f)).sort().reverse().slice(0, 60).map((name) => {
      const m = /^(\d{4})-(\d\d)-(\d\d)_(\d\d)(\d\d)/.exec(name);
      return { name, when: m ? `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}` : name, url: `data:image/png;base64,${fs.readFileSync(path.join(ART_DIR, name)).toString('base64')}` };
    });
  } catch { /* no drawings yet */ }
  const { diary = {} } = readMemory();
  const cfg = config.load();
  return {
    drawings, diary: Object.entries(diary).sort((a, b) => (a[0] < b[0] ? 1 : -1)).map(([date, text]) => ({ date, text })),
    achievements: cfg.achievements || [], lang: cfg.language, theme: cfg.theme,
    profile: Array.isArray(cfg.profile) ? cfg.profile : [],
  };
}

// ---- Reminders tied to an app ("when I open VS Code, remind me to…"): while there are any, a look
// every 15 s at the window in front; one coming to the front fires its reminder (once) ----
let ctxTimer = null;
const ctxFront = new Map(); // reminder id -> its app was in front at the last look
function ctxWatch() {
  if (ctxTimer || process.platform !== 'win32') return;
  ctxTimer = setInterval(async () => {
    const list = config.load().ctxReminders || [];
    if (!list.length) {
      clearInterval(ctxTimer);
      ctxTimer = null;
      return;
    }
    const arrange = require('./arrange');
    const front = (await arrange.list().catch(() => [])).find((w) => !w.min);
    const fired = [];
    for (const r of list) {
      const now = Boolean(front && arrange.pick([front], r.app));
      const was = ctxFront.get(r.id);
      ctxFront.set(r.id, now);
      // the first look only learns where things are: opened later is what counts
      if (now && was === false) {
        fired.push(r.id);
        overlay?.webContents.send('ctx:remind', { app: front.label || front.name, text: r.text });
      }
    }
    if (fired.length) config.save({ ctxReminders: list.filter((r) => !fired.includes(r.id)) });
  }, 15000);
}

// ---- Her coding workshop (src/workshop): Claude's task as it goes, its questions, its history, and
// how much of your Claude plan is used, in a window of its own ----
const work = { task: null, asks: new Map(), history: [], usage: null, queue: [] };
const HISTORY_FILE = path.join(tasks.SHOP, '.runs', 'history.json');
const QUEUE_FILE = path.join(tasks.SHOP, '.runs', 'queue.json');
try { work.history = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8')).slice(0, 30); } catch { /* none yet */ }
try { work.queue = JSON.parse(fs.readFileSync(QUEUE_FILE, 'utf8')).slice(0, 20); } catch { /* none yet */ }

// Tasks for later: when the plan's 5-hour window has room again ('limit'), at night with the PC
// left alone ('night'), or simply after the one running ('next'). A look every minute.
function saveQueue() {
  try { fs.mkdirSync(path.dirname(QUEUE_FILE), { recursive: true }); fs.writeFileSync(QUEUE_FILE, JSON.stringify(work.queue)); } catch { /* next time */ }
  workSend();
}
async function queueTick() {
  if (work.task || !work.queue.length || !overlay) return;
  const item = work.queue[0];
  const hour = new Date().getHours();
  let due = item.when === 'next';
  if (item.when === 'limit') {
    const u = (Date.now() - (work.usage?.at || 0) > 5 * 60000 ? await refreshUsage(true) : work.usage);
    const s = u?.rows?.find((r) => r.key === 'session');
    due = !s || s.pct < 75;
  }
  if (item.when === 'night') due = hour >= 1 && hour < 6 && powerMonitor.getSystemIdleTime() > 600;
  if (!due) return;
  work.queue.shift();
  saveQueue();
  overlay.webContents.send('work:start', { prompt: item.prompt, folder: item.folder || null, queued: true });
}
setInterval(() => queueTick().catch(() => {}), 60000);
let workshopWin = null;

function workState() {
  return { task: work.task, asks: [...work.asks.values()], history: work.history, usage: work.usage, queue: work.queue, lang: config.load().language, theme: config.load().theme };
}
function workSend() {
  workshopWin?.webContents.send('work:state', workState());
}
function openWorkshop({ quiet = false } = {}) {
  if (workshopWin) {
    if (!quiet) { workshopWin.show(); workshopWin.focus(); }
    return;
  }
  workshopWin = new BrowserWindow({
    width: 900, height: 680, minWidth: 560, minHeight: 420, title: 'Oficina do Claude', autoHideMenuBar: true, backgroundColor: '#14101c',
    show: false, icon: path.join(ROOT, 'assets', 'icons', 'tray.png'),
    webPreferences: { preload: path.join(__dirname, '..', 'workshop', 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  workshopWin.loadURL('capri://app/src/workshop/workshop.html');
  workshopWin.once('ready-to-show', () => (quiet ? workshopWin.showInactive() : workshopWin.show()));
  workshopWin.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  workshopWin.webContents.on('will-navigate', (e) => e.preventDefault());
  workshopWin.on('closed', () => { workshopWin = null; });
  refreshUsage();
}

// the plan's use: from Claude Code's /usage (free), every 10 minutes while Claude Code is there,
// and from what its runs report as they go. She hears when it gets high (renderer hands.js).
let usageAt = 0;
async function refreshUsage(force = false) {
  if (!force && Date.now() - usageAt < 60000) return work.usage;
  usageAt = Date.now();
  const u = await tasks.usage().catch(() => null);
  if (u) setUsage(u);
  return work.usage;
}
function setUsage(u) {
  work.usage = u;
  workSend();
  overlay?.webContents.send('usage:update', u);
}
// a run's rate_limit_event: the 5-hour window and the week, as fractions, with when they reset
function usageFromRun(info) {
  const wins = info?.unifiedWindows || {};
  if (!work.usage && !Object.keys(wins).length) return;
  const rows = [...(work.usage?.rows || [])];
  const put = (key, w) => {
    if (!w || typeof w.utilization !== 'number') return;
    const resets = w.resetsAt ? new Date(w.resetsAt * 1000).toISOString() : null;
    const i = rows.findIndex((r) => r.key === key);
    const row = { ...(rows[i] || { key, label: null }), pct: Math.round(w.utilization * 100), resetsAt: resets };
    if (i >= 0) rows[i] = row; else rows.push(row);
  };
  put('session', wins.five_hour);
  put('week', wins.seven_day);
  if (rows.length) setUsage({ rows, at: Date.now(), status: info.status || null });
}

function workStep(e) {
  const t = work.task;
  if (!t) return;
  if (e.kind === 'limits') return usageFromRun(e.info);
  if (e.kind === 'tool') {
    const i = e.input || {};
    t.steps.push({
      at: Date.now(), kind: 'tool', name: e.name,
      target: String(i.file_path || i.notebook_path || i.command || i.pattern || i.url || i.query || i.description || '').slice(0, 400),
      detail: e.name === 'Edit' && i.old_string != null ? { old: String(i.old_string).slice(0, 1500), new: String(i.new_string || '').slice(0, 1500) }
        : e.name === 'Write' && i.content != null ? { new: String(i.content).slice(0, 2000) } : null,
    });
  } else if (e.kind === 'text') t.steps.push({ at: Date.now(), kind: 'text', text: String(e.text).slice(0, 2000) });
  if (t.steps.length > 400) t.steps.splice(0, t.steps.length - 400);
  workSend();
}

function workEnd(r) {
  const t = work.task;
  if (!t) return;
  work.history.unshift({
    prompt: t.prompt.slice(0, 300), dir: t.dir, model: t.model, at: t.startedAt, secs: Math.round((Date.now() - t.startedAt) / 1000),
    ok: Boolean(r?.ok), text: String(r?.ok ? r.text || '' : r?.error || '').slice(0, 600), steps: t.steps.filter((x) => x.kind === 'tool').length,
  });
  work.history = work.history.slice(0, 30);
  try { fs.mkdirSync(path.dirname(HISTORY_FILE), { recursive: true }); fs.writeFileSync(HISTORY_FILE, JSON.stringify(work.history)); } catch { /* next time */ }
  work.task = null;
  work.asks.clear();
  workSend();
  setTimeout(() => refreshUsage(true), 3000);
  setTimeout(() => queueTick().catch(() => {}), 8000); // the next one waiting, if it can go
}

// ---- Files you hand her: Send to › Capri, or dropped on her chat (renderer inbox.js) ----
const TEXTISH = /\.(txt|md|markdown|csv|tsv|json|jsonl|xml|html?|css|js|mjs|cjs|ts|tsx|jsx|py|rb|go|rs|java|kt|c|cc|cpp|h|hpp|cs|php|sh|bash|ps1|bat|cmd|ini|cfg|conf|toml|ya?ml|log|sql|srt|vtt|tex|rst|lua|r|swift|dart|vue|svelte)$/i;
const IMAGEISH = /\.(png|jpe?g|webp|gif|bmp)$/i;
const PROGRAMISH = /\.(exe|msi|msix|appx|bat|cmd|ps1|vbs|js|jar|scr|com)$/i;
const handed = new Set(); // files you gave her, the only ones she may read or show her AI

function fileArg(argv = []) {
  const i = argv.indexOf('--capri-file');
  const cand = i >= 0 ? argv[i + 1] : null;
  return cand && fs.existsSync(cand) && fs.statSync(cand).isFile() ? cand : null;
}

function fileInfo(file) {
  if (!handed.has(file) || !fs.existsSync(file)) return null;
  const st = fs.statSync(file);
  const ext = path.extname(file).slice(1).toLowerCase();
  const kind = IMAGEISH.test(file) ? 'image' : PROGRAMISH.test(file) && !TEXTISH.test(file) ? 'program' : TEXTISH.test(file) ? 'text' : 'other';
  let text = '';
  if (kind === 'text' && st.size <= 2 * 1024 * 1024) {
    try {
      text = fs.readFileSync(file, 'utf8').slice(0, 12000);
    } catch { /* not readable */ }
  }
  return { path: file, name: path.basename(file), ext, size: st.size, kind, text, wsl: file.replace(/^([A-Za-z]):\\/, (_m, d) => `/mnt/${d.toLowerCase()}/`).replace(/\\/g, '/') };
}

// Windows' "Send to" menu gets a Capri entry (once, in the installed app)
function sendToEntry() {
  if (process.platform !== 'win32' || !app.isPackaged || config.load().sendToMade) return;
  const link = path.join(app.getPath('appData'), 'Microsoft', 'Windows', 'SendTo', 'Capri.lnk');
  const q = (s) => String(s).replace(/'/g, "''");
  const ps = `$s = (New-Object -ComObject WScript.Shell).CreateShortcut('${q(link)}'); $s.TargetPath = '${q(process.execPath)}'; $s.Arguments = '--capri-file'; $s.IconLocation = '${q(process.execPath)},0'; $s.Save()`;
  execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { windowsHide: true, timeout: 20000 }, (err) => {
    if (!err) config.save({ sendToMade: true });
  });
}

// The vision model for her camera: Groq's free vision model if it has one (and you gave her a Groq
// key), else Gemini's Flash-Lite (with a Gemini key), else her local model if it can see.
let visionCache = null;
async function cameraVision() {
  if (visionCache && Date.now() - visionCache.at < 30 * 60000) return visionCache.v;
  const cfg = config.load();
  const keys = setup.openKeys(cfg.apiKeys || {});
  let v = null;
  const tryProvider = async (provider, pickers) => {
    if (!keys[provider]) return null;
    const list = await llm.models(provider, llmConfig(cfg)).catch(() => []);
    for (const re of pickers) {
      const hit = (list || []).find((m) => re.test(m) && !/guard|tts|whisper|embed|image-gen|imagen/i.test(m));
      if (hit) return { provider, model: hit };
    }
    return null;
  };
  v = await tryProvider('groq', [/llama-4-scout/i, /llama-4/i, /vision|vl\b|llava|maverick/i]);
  if (!v && keys.gemini) {
    // Gemini's newest stable Flash (better eyes than Flash-Lite, and her camera looks rarely enough for its free tier)
    const list = (await llm.models('gemini', llmConfig(cfg)).catch(() => [])) || [];
    const ver = (m) => Number((/gemini-(\d+(?:\.\d+)?)/.exec(m) || [])[1] || 0);
    const stable = list.filter((m) => /gemini-[\d.]+-flash/.test(m) && !/preview|exp|image|tts|live|thinking|audio|8b/i.test(m)).sort((a, b) => ver(b) - ver(a));
    const best = stable.find((m) => !/lite/.test(m)) || stable[0] || list.find((m) => /flash/.test(m));
    if (best) v = { provider: 'gemini', model: best };
  }
  if (!v) {
    const local = await localModel(cfg);
    if (local && (await ollama.canSee(local))) v = { provider: 'local', model: local };
  }
  visionCache = { at: Date.now(), v };
  return v;
}

// Her ear for her name (src/wake): a hidden window of its own running Vosk, on while "Hear the room"
// and "Answer when I call her" are both on and no call is going on (her window says when).
let wakeWin = null;
let wakePaused = false;
function wakeSync() {
  const cfg = config.load();
  const want = cfg.earOn === true && cfg.wakeWord !== false && !wakePaused;
  if (want && !wakeWin) {
    wakeWin = new BrowserWindow({
      show: false, skipTaskbar: true,
      webPreferences: {
        preload: path.join(__dirname, '..', 'wake', 'preload.js'), contextIsolation: true, nodeIntegration: false,
        sandbox: true, backgroundThrottling: false,
      },
    });
    wakeWin.loadURL('capri://app/src/wake/wake.html');
    wakeWin.on('closed', () => { wakeWin = null; });
  } else if (!want && wakeWin) {
    wakeWin.destroy();
    wakeWin = null;
  }
}

// how she is inside (renderer heart.js), at the top of her menu
let heartLabel = '';

// her hook in your PowerShell profile (scripts/install-shell.js): asked once at start, then after each change
let pwshHooked = false;
function checkShellHook() {
  if (process.platform !== 'win32') return;
  setImmediate(() => {
    try {
      pwshHooked = require('../../scripts/install-shell').status().installed;
    } catch {
      pwshHooked = false;
    }
    rebuildTray();
  });
}
function runShellHook(action) {
  try {
    require('../../scripts/install-shell')[action]();
    sendCommand('shellHook', { on: action === 'install' });
  } catch (err) {
    console.error('[capri] PowerShell hook:', err.message);
  }
  checkShellHook();
}

// Her menu, grouped: what she perceives, how she behaves, health, AI, looks. Items are picked by
// their label (each keeps its own checkbox and click); anything not listed stays where it was.
function regroupTray(t, items) {
  const groups = [
    [t.groupSenses, [t.activity, t.lookAuto, t.senseInput, t.camera, t.pcReact, t.shellReact, t.pwshInstall, t.pwshRemove]],
    [t.groupBehavior, [t.chatty, t.pranks, t.wander, t.possess, t.jealous, t.closePages, t.aiLines, t.callQuiet, t.obsMode, t.rest]],
    [t.groupHealth, [t.breaks, t.eyeBreaks]],
    [t.groupAI, [t.chatModel, t.taskModel, t.taskPermission, t.lightMode, t.screenOnline, t.mcpOn, t.githubWatch, t.watch]],
    [t.groupLooks, [t.size, t.panelSize, t.theme, t.motion, t.display, t.sound, t.screen]],
  ];
  const taken = new Set();
  const built = groups.map(([label, labels]) => {
    const submenu = items.filter((it) => it && labels.includes(it.label));
    submenu.forEach((it) => taken.add(it));
    return submenu.length ? { label, submenu } : null;
  }).filter(Boolean);
  const rest = items.filter((it) => !taken.has(it));
  // the groups go right after her everyday actions (before the first separator after them)
  const at = rest.findIndex((it, i) => i > 3 && it.type === 'separator');
  const head = at >= 0 ? rest.slice(0, at + 1) : rest;
  const tail = (at >= 0 ? rest.slice(at + 1) : []).filter((it, i, all) => !(it.type === 'separator' && all[i - 1]?.type === 'separator'));
  return [...head, ...built, { type: 'separator' }, ...tail];
}

function rebuildTray() {
  if (!tray) return;
  const cfg = config.load();
  const hookState = activeHooks().status();
  const watched = activeAssistant();
  const t = Object.fromEntries(Object.entries(TRAY[resolveLang(cfg.lang)]).map(([key, value]) =>
    [key, typeof value === 'string' && watched.id !== 'claude' ? value.replaceAll('Claude Code', watched.name) : value]));

  const screens = displays();
  const current = targetDisplay().id;
  // how close she is to you (bond.js): STAGES there, 1000 xp is 100 %
  const xp = cfg.bond?.xp || 0;
  const stage = [0, 100, 300, 550, 850].filter((at) => xp >= at).length - 1;
  // the reminders she keeps (reminders.js), soonest first
  const reminders = [...(cfg.reminders || [])].sort((a, b) => a.at - b.at);
  const when = (at) => {
    const d = new Date(at);
    const sameDay = d.toDateString() === new Date().toDateString();
    return new Intl.DateTimeFormat(resolveLang(cfg.lang), sameDay ? { hour: '2-digit', minute: '2-digit' } : { weekday: 'short', hour: '2-digit', minute: '2-digit' }).format(d);
  };
  const cancelReminder = (id) => updateConfig({ reminders: (config.load().reminders || []).filter((r) => r.id !== id) });

  const template = regroupTray(t, [
    { label: t.online(PORT), enabled: false },
    ...(heartLabel ? [{ label: heartLabel, enabled: false }] : []),
    { label: t.sync(Math.min(100, Math.floor(xp / 10)), t.stages[stage]), enabled: false },
    { type: 'separator' },
    { label: t.updateCheck, click: () => manualUpdate(t) },
    { label: t.teleport, click: () => sendCommand('teleport') },
    { label: t.satellite, click: () => sendCommand('satellite') },
    { label: t.demo, click: playDemo },
    { label: t.help, click: () => sendCommand('welcome') },
    ...(cfg.claude ? [{ label: t.report, click: () => sendCommand('report') }] : []),
    { label: t.talk, click: () => sendCommand('chat') },
    { label: t.lookNow, click: () => sendCommand('look') },
    ...((cfg.achievements || []).length ? [{
      label: `${t.achievements} (${cfg.achievements.length})`,
      submenu: cfg.achievements.map((a) => ({ label: `★ ${a.name}`, enabled: false })),
    }] : []),
    { label: t.playMenu, submenu: ['rps', 'hangman', 'number', 'quiz', 'hide', 'tag', 'reflex', 'prank', 'portrait', 'draw', 'dance', 'juggle', 'sneak'].map((what) => ({
      label: t.plays[what], click: () => sendCommand('playNow', { what }),
    })) },
    { label: t.workshop, click: () => openWorkshop() },
    { label: t.corner, click: () => openCorner() },
    { label: (cfg.apiKeys || {}).gemini ? t.geminiOn : t.geminiKey, click: () => sendCommand('geminiKey') },
    { label: t.tabsExt, click: () => installExtension() },
    { label: t.lightMode, submenu: ['games', 'claude', 'heavy', 'battery', 'always'].map((k) => ({
      label: t.lightModes[k], type: 'checkbox', checked: Boolean({ games: true, ...(cfg.lightMode || {}) }[k]),
      click: (i) => updateConfig({ lightMode: { games: true, ...(config.load().lightMode || {}), [k]: i.checked } }),
    })) },
    { label: t.screenOnline, type: 'checkbox', checked: cfg.screenOnline === true, enabled: Boolean((cfg.apiKeys || {}).gemini), click: (i) => updateConfig({ screenOnline: i.checked }) },
    { label: t.mcpOn, type: 'checkbox', checked: cfg.mcpOn !== false, click: (i) => updateConfig({ mcpOn: i.checked }) },
    { label: t.githubWatch, type: 'checkbox', checked: cfg.githubWatch !== false, click: (i) => updateConfig({ githubWatch: i.checked }) },
    { label: t.backup, submenu: [
      { label: cfg.notesDir ? fmtLabel(t.notesOn, path.basename(cfg.notesDir)) : t.notesDir, click: async () => {
        if (cfg.notesDir) { updateConfig({ notesDir: null }); rebuildTray(); return; }
        const { canceled, filePaths } = await dialog.showOpenDialog({ title: t.notesDir, properties: ['openDirectory'] });
        if (!canceled && filePaths[0]) { updateConfig({ notesDir: filePaths[0] }); rebuildTray(); }
      } },
      { label: t.backupExport, click: async () => {
        const { canceled, filePaths } = await dialog.showOpenDialog({ title: t.backupExport, properties: ['openDirectory', 'createDirectory'] });
        if (canceled || !filePaths[0]) return;
        const dir = await exportBackup(filePaths[0]).catch((err) => { dialog.showErrorBox('Capri', err.message); return null; });
        if (dir) shell.openPath(dir);
      } },
      { label: t.backupImport, click: async () => {
        const { canceled, filePaths } = await dialog.showOpenDialog({ title: t.backupImport, properties: ['openDirectory'] });
        if (canceled || !filePaths[0]) return;
        const ok = await dialog.showMessageBox({ type: 'question', buttons: [t.backupYes, t.backupNo], defaultId: 0, cancelId: 1, message: t.backupSure });
        if (ok.response === 0) await importBackup(filePaths[0]).catch((err) => dialog.showErrorBox('Capri', err.message));
      } },
    ] },
    cfg.spotifyRefresh
      ? { label: t.spotifyOn, click: () => overlay?.webContents.send('spotify:disconnect-ask') }
      : { label: t.spotifyConnect, click: () => sendCommand('spotifySetup') },
    cfg.psnRefresh
      ? { label: t.psnOn, click: () => { overlay?.webContents.send('psn:disconnect-ask'); } }
      : { label: t.psnConnect, click: () => sendCommand('psnSetup') },
    {
      label: t.programs,
      submenu: [
        ...(() => {
          const list = tasks.programs();
          return list.length
            ? list.map((p) => ({ label: p.description ? `${p.name} — ${p.description}` : p.name, click: () => openProgram(p) }))
            : [{ label: t.noPrograms, enabled: false }];
        })(),
        { type: 'separator' },
        { label: t.openShop, click: () => { fs.mkdirSync(tasks.PROGRAMS, { recursive: true }); shell.openPath(tasks.SHOP); } },
        { label: t.workshopAuto, type: 'checkbox', checked: cfg.workshopAuto !== false, click: (i) => updateConfig({ workshopAuto: i.checked }) },
      ],
    },
    {
      label: t.reminders,
      submenu: reminders.length
        ? reminders.map((r) => ({
          label: `${when(r.at)} · ${(r.text || '…').slice(0, 50)}`,
          submenu: [{ label: t.cancelReminder, click: () => cancelReminder(r.id) }],
        }))
        : [{ label: t.noReminders, enabled: false }],
    },
    { label: t.custom, click: () => sendCommand('customize') },
    { label: cfg.visible ? t.hide : t.show, accelerator: 'Ctrl+Alt+C', click: () => toggleVisible() },
    { type: 'separator' },
    {
      label: t.size,
      submenu: [[t.small, 0.45], [t.medium, 0.6], [t.large, 0.8]].map(([label, scale]) => ({
        label, type: 'radio', checked: Math.abs(cfg.scale - scale) < 0.01, click: () => updateConfig({ scale }),
      })),
    },
    {
      label: t.sound,
      submenu: [
        { label: t.mute, type: 'checkbox', checked: cfg.muted, click: (item) => updateConfig({ muted: item.checked }) },
        { type: 'separator' },
        {
          label: t.soundsDir,
          click: () => {
            fs.mkdirSync(userSoundsDir(), { recursive: true });
            shell.openPath(userSoundsDir());
          },
        },
      ],
    },
    {
      label: t.screen,
      enabled: screens.length > 1,
      submenu: [
        ...screens.map((d, i) => ({
          label: `${i + 1} — ${d.size.width}×${d.size.height}`,
          type: 'radio',
          checked: d.id === current,
          click: () => d.id !== current && sendCommand('goScreen', { id: d.id }), // she goes over there herself
        })),
        { type: 'separator' },
        { label: t.follow, type: 'checkbox', checked: cfg.follow !== false, click: (item) => updateConfig({ follow: item.checked }) },
      ],
    },
    {
      label: t.chatModel,
      submenu: [
        { label: t.aiSetup, click: () => sendCommand('setupChat') },
        { type: 'separator' },
        ...Object.entries(llm.PROVIDERS).map(([provider, p]) => ({
          label: p.label, type: 'radio', checked: cfg.provider === provider, click: () => pickProvider(provider),
        })),
        { type: 'separator' },
        ...(chatModels?.length
          ? chatModels.map((name) => ({
            label: cloud.free.includes(name) ? `${name} · ${t.cloudFree}` : name,
            type: 'radio', checked: name === pickModel(cfg), click: () => updateConfig({ chatModel: name }),
          }))
          : [{ label: (chatError || t.noOllama).slice(0, 80), enabled: false }]),
        // Ollama's free cloud models when you're signed in to it, fetched on the click (it takes a second)
        ...(cfg.provider === 'ollama' && chatModels ? [
          ...cloud.free.filter((name) => !chatModels.includes(name)).map((name) => ({
            label: `${name} · ${t.cloudFree}`, type: 'radio', checked: false, click: () => fetchModel(name).catch(() => rebuildTray()),
          })),
          ...(cloud.account?.signin ? [{ label: t.cloudSignin, click: signInToOllama }] : []),
        ] : []),
        { type: 'separator' },
        ...(cfg.provider === 'claude' ? [
          { label: `Claude Code: ${cfg.claudeCwd || app.getPath('home')}`, click: pickClaudeFolder },
          {
            label: 'Claude Code permissions',
            submenu: llm.CLAUDE_MODES.map((mode) => ({
              label: mode, type: 'radio', checked: cfg.claudeMode === mode, click: () => updateConfig({ claudeMode: mode }),
            })),
          },
        ] : []),
        { label: t.forget, click: forgetChats },
        // the key (or the address) of the one picked, pasted in her panel
        { label: t.apiKey, click: () => sendCommand('setupKey') },
      ],
    },
    { label: t.wander, type: 'checkbox', checked: cfg.wander, click: (item) => updateConfig({ wander: item.checked }) },
    { label: t.possess, type: 'checkbox', checked: cfg.possess, click: (item) => updateConfig({ possess: item.checked }) },
    { label: t.jealous, type: 'checkbox', checked: cfg.jealous !== false, click: (item) => updateConfig({ jealous: item.checked }) },
    {
      label: t.closePages, type: 'checkbox', checked: cfg.closePages === true, enabled: cfg.jealous !== false,
      click: (item) => updateConfig({ closePages: item.checked }),
    },
    { label: t.pcReact, type: 'checkbox', checked: cfg.pcReact !== false, click: (item) => updateConfig({ pcReact: item.checked }) },
    { label: t.aiLines, type: 'checkbox', checked: cfg.aiLines !== false, click: (item) => updateConfig({ aiLines: item.checked }) },
    { label: t.callQuiet, type: 'checkbox', checked: cfg.callQuiet !== false, click: (item) => updateConfig({ callQuiet: item.checked }) },
    {
      label: t.taskModel,
      submenu: ['sonnet', 'opus', 'auto', 'default'].map((m) => ({
        label: t.taskModels[m], type: 'radio', checked: (cfg.taskModel || 'sonnet') === m,
        click: () => updateConfig({ taskModel: m }),
      })),
    },
    {
      // how much Claude asks you during her tasks (Claude Code's permission modes)
      label: t.taskPermission,
      submenu: ['auto', 'acceptEdits', 'default'].map((m) => ({
        label: t.taskPermissions[m], type: 'radio', checked: (cfg.taskPermission || 'auto') === m,
        click: () => updateConfig({ taskPermission: m }),
      })),
    },
    {
      label: t.pranks,
      submenu: ['off', 'light', 'bold'].map((level) => ({
        label: t.prankLevels[level], type: 'radio', checked: (cfg.pranks || 'light') === level,
        click: () => updateConfig({ pranks: level }),
      })),
    },
    {
      label: t.chatty,
      submenu: ['low', 'normal', 'high'].map((level) => ({
        label: t.chattyLevels[level], type: 'radio', checked: (cfg.chatty || 'normal') === level,
        click: () => updateConfig({ chatty: level }),
      })),
    },
    {
      // like what you do: she says first what it means (counts only, never which keys)
      label: t.senseInput, type: 'checkbox', checked: cfg.senseInput === true,
      click: (item) => {
        sendCommand('senseInput', { on: item.checked });
        rebuildTray();
      },
    },
    { label: t.shellReact, type: 'checkbox', checked: cfg.shellReact !== false, click: (item) => updateConfig({ shellReact: item.checked }) },
    // Windows: her hook in your PowerShell profile, one click (bash / zsh: npm run shell:install)
    ...(process.platform === 'win32' ? [pwshHooked
      ? { label: t.pwshRemove, click: () => runShellHook('uninstall') }
      : { label: t.pwshInstall, click: () => runShellHook('install') }] : []),
    {
      // like looking at your screen: she says first what goes where, then turns it on herself
      label: t.activity, type: 'checkbox', checked: Boolean(cfg.watchActivity),
      click: (item) => {
        sendCommand('watchActivity', { on: item.checked });
        rebuildTray();
      },
    },
    { label: t.breaks, type: 'checkbox', checked: cfg.breaks !== false, click: (item) => updateConfig({ breaks: item.checked }) },
    {
      label: t.camera,
      submenu: [
        {
          // she says first what it means, then turns it on herself
          label: t.cameraOn, type: 'checkbox', checked: cfg.cameraOn === true,
          click: (item) => {
            sendCommand('cameraOn', { on: item.checked });
            rebuildTray();
          },
        },
        { label: t.cameraLook, type: 'checkbox', checked: cfg.cameraLook === true, enabled: cfg.cameraOn === true, click: (item) => updateConfig({ cameraLook: item.checked }) },
        { label: cfg.faceData ? t.faceAgain : t.faceEnroll, enabled: cfg.cameraOn === true, click: () => sendCommand('faceEnroll') },
        { label: t.lockStrangers, type: 'checkbox', checked: cfg.lockStrangers === true, enabled: Boolean(cfg.faceData) && cfg.cameraOn === true, click: (item) => updateConfig({ lockStrangers: item.checked }) },
        { label: t.voiceLocal, type: 'checkbox', checked: cfg.voiceLocal === true, click: (item) => sendCommand('voiceLocal', { on: item.checked }) },
        { label: t.noticesOn, type: 'checkbox', checked: cfg.noticesOn === true, click: (item) => updateConfig({ noticesOn: item.checked }) },
        { label: t.gestures, type: 'checkbox', checked: cfg.gestures !== false, enabled: cfg.cameraOn === true, click: (item) => updateConfig({ gestures: item.checked }) },
        { label: t.converse, type: 'checkbox', checked: cfg.converse !== false, enabled: cfg.micAsked === true, click: (item) => updateConfig({ converse: item.checked }) },
        { label: t.lockSnap, type: 'checkbox', checked: cfg.lockSnap === true, enabled: Boolean(cfg.faceData) && cfg.cameraOn === true, click: (item) => updateConfig({ lockSnap: item.checked }) },
        ...(cfg.faceData ? [{ label: t.faceForget, click: () => { updateConfig({ faceData: null }); sendCommand('faceForget'); } }] : []),
        { label: t.lockAway, type: 'checkbox', checked: cfg.lockAway === true, enabled: cfg.cameraOn === true, click: (item) => updateConfig({ lockAway: item.checked }) },
        { type: 'separator' },
        {
          // her ears on the room (hearing.js): she says first what it means
          label: t.earOn, type: 'checkbox', checked: cfg.earOn === true,
          click: (item) => {
            sendCommand('earOn', { on: item.checked });
            rebuildTray();
          },
        },
        { label: t.wakeWord, type: 'checkbox', checked: cfg.wakeWord !== false, enabled: cfg.earOn === true, click: (item) => updateConfig({ wakeWord: item.checked }) },
      ],
    },
    { label: t.eyeBreaks, type: 'checkbox', checked: cfg.eyeBreaks === true, click: (item) => updateConfig({ eyeBreaks: item.checked }) },
    {
      label: t.obsMode,
      submenu: ['behave', 'show'].map((m) => ({ label: t.obsModes[m], type: 'radio', checked: (cfg.obsMode || 'behave') === m, click: () => updateConfig({ obsMode: m }) })),
    },
    {
      // she asks first (what she'll send where), then turns it on herself
      label: t.lookAuto, type: 'checkbox', checked: Boolean(cfg.watchScreen),
      click: (item) => {
        sendCommand('watchScreen', { on: item.checked });
        rebuildTray(); // as it is until she's asked
      },
    },
    {
      label: t.rest,
      submenu: [['corner', t.restCorner], ['taskbar', t.restTaskbar]].map(([rest, label]) => ({
        label, type: 'radio', checked: cfg.rest === rest, click: () => updateConfig({ rest }),
      })),
    },
    // the coding assistant she watches (a new one: she says hello and offers to plug herself in), or none
    {
      label: t.watch,
      submenu: [
        ...Object.entries(ASSISTANTS).map(([id, { name }]) => ({
          label: name,
          type: 'radio',
          checked: cfg.claude && watched.id === id,
          click: () => {
            const other = watched.id !== id;
            updateConfig({ claude: true, assistant: id, ...(other && { linked: false, welcomed: false }) });
            if (other) sendCommand('assistantChanged');
          },
        })),
        { label: t.watchNone, type: 'radio', checked: !cfg.claude, click: () => updateConfig({ claude: false }) },
      ],
    },
    {
      label: t.panelSize,
      submenu: ['small', 'medium', 'large'].map((size) => ({
        label: t.panelSizes[size], type: 'radio', checked: (cfg.panelSize || 'medium') === size, click: () => updateConfig({ panelSize: size }),
      })),
    },
    {
      label: t.theme,
      submenu: [['nightcity', 'Night City'], ['classic', t.themeClassic]].map(([theme, label]) => ({
        label, type: 'radio', checked: cfg.theme === theme, click: () => updateConfig({ theme }),
      })),
    },
    {
      label: t.motion,
      submenu: [['auto', t.motionAuto], ['full', t.motionFull], ['reduced', t.motionReduced]].map(([motion, label]) => ({
        label, type: 'radio', checked: cfg.motion === motion, click: () => updateConfig({ motion, motionAsked: true }),
      })),
    },
    {
      label: t.display,
      // only read when she starts: she restarts in the mode picked
      submenu: [['auto', t.displayAuto], ['gl', t.displayGl], ['software', t.displaySoftware]].map(([render, label]) => ({
        label, type: 'radio', checked: cfg.render === render,
        click: () => {
          if (cfg.render === render) return;
          config.save({ render });
          app.relaunch();
          app.exit(0);
        },
      })),
    },
    {
      label: t.lang,
      submenu: [[t.auto, 'auto'], ...LANGS.map((lang) => [TRAY[lang].name, lang])].map(([label, lang]) => ({
        label, type: 'radio', checked: cfg.lang === lang, click: () => updateConfig({ lang }),
      })),
    },
    {
      label: t.startup,
      type: 'checkbox',
      checked: app.getLoginItemSettings(loginItemOptions()).openAtLogin,
      click: (item) => app.setLoginItemSettings({ ...loginItemOptions(), openAtLogin: item.checked }),
    },
    // her hooks, while she watches Claude Code
    ...(cfg.claude ? [
      { type: 'separator' },
      hookState.installed
        ? { label: t.hooksOn, enabled: false }
        : { label: t.hooksOff, click: () => runHooks('install') },
      ...(hookState.installed ? [{ label: t.hooksRemove, click: () => runHooks('uninstall') }] : []),
    ] : []),
    { type: 'separator' },
    { label: t.quit, click: () => app.quit() },
  ]);
  lastTemplate = template;
  settingsTitle = t.settings;
  settingsSend();
  const menu = Menu.buildFromTemplate([{ label: t.settings, click: () => openSettings() }, { type: 'separator' }, ...template]);
  tray.setContextMenu(menu);
  trayMenu = menu;
}

// ---- Her settings, in a window of her own (src/settings): her menu as it is, laid out in sections.
// Built from the very same items (so nothing is ever only in one of them): a click there runs the
// item's own click, the menu is rebuilt and the window redrawn. ----
let lastTemplate = [];
let settingsTitle = 'Settings';
let settingsWin = null;
let settingsItems = new Map(); // id -> menu item
function settingsTree(items, prefix = '') {
  const out = [];
  items.forEach((item, i) => {
    if (!item) return;
    const id = `${prefix}${i}`;
    if (item.type === 'separator') { out.push({ id, type: 'separator' }); return; }
    const sub = typeof item.submenu === 'function' ? null : item.submenu;
    settingsItems.set(id, item);
    out.push({
      id, label: String(item.label || ''), type: item.type || (sub ? 'submenu' : item.click ? 'action' : 'info'),
      checked: Boolean(item.checked), enabled: item.enabled !== false, children: Array.isArray(sub) ? settingsTree(sub, `${id}.`) : undefined,
    });
  });
  return out;
}
function settingsSend() {
  if (!settingsWin || settingsWin.isDestroyed()) return;
  settingsItems = new Map();
  const cfg = config.load();
  settingsWin.webContents.send('settings:tree', { title: settingsTitle, items: settingsTree(lastTemplate), theme: cfg.theme, lang: resolveLang(cfg.lang) });
}
function openSettings() {
  if (settingsWin) { settingsWin.show(); settingsWin.focus(); return; }
  settingsWin = new BrowserWindow({
    width: 860, height: 720, minWidth: 520, minHeight: 420, title: settingsTitle, autoHideMenuBar: true, backgroundColor: '#14101c',
    icon: path.join(ROOT, 'assets', 'icons', 'tray.png'),
    webPreferences: { preload: path.join(__dirname, '..', 'settings', 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  settingsWin.loadURL('capri://app/src/settings/settings.html');
  settingsWin.webContents.on('did-finish-load', () => settingsSend());
  settingsWin.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  settingsWin.webContents.on('will-navigate', (e) => e.preventDefault());
  settingsWin.on('closed', () => { settingsWin = null; });
}

// Run from a clone (`npm start`), electron.exe alone would open the default Electron app at login:
// it needs the project folder as argument.
function loginItemOptions() {
  return app.isPackaged ? {} : { path: process.execPath, args: [ROOT] };
}

// From the tray, she says how it went; from her welcome panel (quiet), the panel does.
function runHooks(action, { quiet = false } = {}) {
  let outcome;
  try {
    const result = action === 'install' ? activeHooks().install() : activeHooks().uninstall();
    outcome = { action, ok: true, file: result.file };
  } catch (err) {
    outcome = { action, ok: false, error: err.message };
  }
  if (!quiet) sendCommand('hooks', outcome);
  rebuildTray();
  return outcome;
}

// The model she talks with: the one picked in her menu if it's still installed, else the first one
// on this PC (a cloud model only once you pick it).
// Groq lists speech, moderation and other models too: the ones to talk with, the best free ones first
const NOT_CHAT = /whisper|tts|guard|safeguard|distil|orpheus|playai|compound|prompt-guard|embed/i;
const GROQ_BEST = [/gpt-oss-120b/, /llama-3\.3-70b/, /qwen3?-32b|qwen/, /kimi/, /gpt-oss-20b/, /llama/];

function pickModel(cfg = config.load()) {
  if (!chatModels?.length) return null;
  if (chatModels.includes(cfg.chatModel)) return cfg.chatModel;
  if (cfg.provider === 'groq') {
    const talk = chatModels.filter((m) => !NOT_CHAT.test(m));
    for (const re of GROQ_BEST) {
      const hit = talk.find((m) => re.test(m));
      if (hit) return hit;
    }
    return talk[0] || chatModels[0];
  }
  return chatModels.find((m) => !ollama.isCloud(m)) || chatModels[0];
}

async function refreshModels() {
  const cfg = config.load();
  chatError = null;
  chatErrorCode = null;
  chatModels = await llm.models(cfg.provider, llmConfig(cfg)).catch((err) => {
    chatError = err.message;
    chatErrorCode = err.code || null;
    return null;
  });
  rebuildTray();
  if (cfg.provider === 'ollama' && chatModels) refreshCloud(); // in the background: it asks ollama.com
  return chatModels;
}

// Whether you're signed in to Ollama, and its free cloud models if so. Once a minute at most.
let cloudCheck = null; // the look under way
function refreshCloud(force = false) {
  if (!force && Date.now() - cloud.at < 60000) return cloudCheck || Promise.resolve(cloud);
  const at = Date.now();
  cloud.at = at;
  cloudCheck = (async () => {
    const account = await ollama.account();
    const free = account?.name ? await ollama.freeModels() : [];
    cloud = { at, account, free };
    rebuildTray();
    return cloud;
  })().finally(() => { cloudCheck = null; });
  return cloudCheck;
}

// A model fetched with Ollama (a cloud one is only a small file), then her chat on it.
async function fetchModel(name, onProgress, signal) {
  await setup.pullModel(name, onProgress, signal);
  updateConfig({ provider: 'ollama' });
  await refreshModels();
  const model = chatModels?.find((m) => m === name || m.startsWith(`${name}:`));
  if (model) updateConfig({ chatModel: model });
  return model;
}

// The page that links this PC to your Ollama account, then a look every few seconds until you're in.
async function signInToOllama() {
  if (!cloud.account?.signin) return;
  shell.openExternal(cloud.account.signin);
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    if ((await refreshCloud(true)).account?.name) return;
  }
}

// Her answer from the model picked, or from the next one when that one can't: too busy twice in a row
// (Gemini's "high demand", an Ollama cloud model out of free use), not served anymore (an older model
// closed to new keys), or signed out of Ollama. A model on this PC first. The model that answered is
// kept for next time.
async function chatWithFallback(cfg, messages, send, signal, streamed) {
  let model = pickModel(cfg);
  const tried = new Set();
  let busy = 0;
  for (;;) {
    try {
      const text = await llm.chat(cfg.provider, llmConfig(cfg), { model, messages }, send, signal);
      if (model !== pickModel(cfg)) updateConfig({ chatModel: model });
      return text;
    } catch (err) {
      if (signal.aborted || streamed() || !['busy', 'gone', 'signin'].includes(err.code)) throw err;
      if (err.code === 'busy' && busy++ === 0) {
        await new Promise((r) => setTimeout(r, 1500)); // usually gone a moment later
        continue;
      }
      tried.add(model);
      const next = chatModels?.find((m) => !tried.has(m) && !ollama.isCloud(m)) || chatModels?.find((m) => !tried.has(m));
      if (!next || tried.size >= 3) throw err;
      model = next;
      busy = 0;
    }
  }
}

// She looks at your screen (look.js): a picture of the screen she's on, kept here in memory a moment
// for her AI to look at, never written anywhere. 1280 px wide at most: enough to read, light to send.
const snaps = new Map(); // id -> the picture, base64 JPEG
async function snapScreen() {
  const d = targetDisplay();
  const k = d.scaleFactor || 1;
  // the whole screen at full size, then cut to the window you're in: its text stays readable
  const size = { width: Math.round(d.bounds.width * k), height: Math.round(d.bounds.height * k) };
  const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: size });
  const src = sources.find((s) => s.display_id === String(d.id)) || sources[0];
  if (!src || src.thumbnail.isEmpty()) throw new Error('no picture of the screen');
  let img = src.thumbnail;
  const shot = img.getSize();
  const win = lastWindows?.wins?.find((w) => w.id === lastWindows.fg && !w.max);
  if (win && overlay) {
    const ob = overlay.getBounds();
    const sx = shot.width / d.bounds.width;
    const sy = shot.height / d.bounds.height;
    const x = Math.max(0, Math.round((ob.x + win.x - d.bounds.x) * sx));
    const y = Math.max(0, Math.round((ob.y + win.y - d.bounds.y) * sy));
    const w = Math.min(shot.width - x, Math.round(win.w * sx));
    const h = Math.min(shot.height - y, Math.round(win.h * sy));
    if (w > 200 && h > 150) img = img.crop({ x, y, width: w, height: h });
  }
  const { width } = img.getSize();
  if (width > 1280) img = img.resize({ width: 1280, quality: 'good' }); // her eyes see ~900 px anyway: less to send, quicker
  return img.toJPEG(80).toString('base64');
}

// What her AI says about that picture, as her (`persona`), asked `prompt`. With a code when it can't:
// 'noai' (nothing to ask), 'novision' (that model can't look at pictures).
async function sayAboutSnap({ id, persona, prompt, history = [] }) {
  const image = snaps.get(id);
  snaps.delete(id);
  if (!image) return { ok: false, error: 'the picture is gone' };
  // your screen stays on this PC: only her local model looks at it, even when her chat is online
  // (asked in her chat: the conversation so far comes before it, text only)
  const before = (Array.isArray(history) ? history : []).filter((m) => typeof m?.content === 'string' && ['user', 'assistant'].includes(m.role)).slice(-12);
  // her menu › Look at my screen through Gemini (off unless you turn it on): quicker and nothing heavy
  // on your PC, but the picture of your screen goes to Google
  const cfg = config.load();
  if (cfg.screenOnline === true && setup.openKeys(cfg.apiKeys || {}).gemini) {
    const v = await cameraVision();
    if (v?.provider === 'gemini') {
      const messages = [
        { role: 'system', content: String(persona || '') }, ...before,
        { role: 'user', content: [{ type: 'text', text: String(prompt || '') }, { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${image}` } }] },
      ];
      try {
        const text = await llm.chat('gemini', llmConfig(cfg), { model: v.model, messages }, () => {}, AbortSignal.timeout(45000));
        return { ok: true, text, model: v.model, provider: 'gemini' };
      } catch { /* her local model, then */ }
    }
  }
  const local = await localSay({ persona, prompt, images: [image], history: before, maxTokens: 160, timeout: 120000 });
  return local.ok || local.code === 'novision' ? local : { ok: false, code: 'noai' };
}

// ---- Her local mind: Ollama on this PC, whatever her chat runs on ----
// Everything she says on her own (speech.js), what she makes of what you do (activity.js) and of your
// screen (look.js) goes to a model on this PC only: what you do on it never leaves it. Her chat can
// still be an online service (cfg.provider). During a game the model is let go from the graphics
// card (localPause) and she falls back on her written lines.
let localList = null;
let localListAt = 0;
let localPaused = false;
let localQueue = Promise.resolve(); // one at a time: a small GPU, and her chat may want it too

// Ollama asleep (not started with Windows, or quit): she wakes it up, once in a while at most,
// if it's installed. Without it, everything she says on her own goes back to her written lines.
let ollamaWokenAt = 0;
async function wakeOllama() {
  if (Date.now() - ollamaWokenAt < 5 * 60000) return false;
  ollamaWokenAt = Date.now();
  const state = await setup.ollamaState().catch(() => null);
  if (!state || state.running) return Boolean(state?.running);
  if (!state.installed) return false;
  const r = await setup.startOllama().catch(() => ({ ok: false }));
  if (r.ok) console.log('[capri] Ollama was asleep: started it');
  return r.ok;
}

async function localModel(cfg = config.load()) {
  if (!localList || Date.now() - localListAt > 60000) {
    localList = await ollama.models().then((list) => list.filter((m) => !ollama.isCloud(m)), () => null);
    if (!localList && (await wakeOllama())) localList = await ollama.models().then((list) => list.filter((m) => !ollama.isCloud(m)), () => null);
    localListAt = Date.now();
  }
  if (!localList?.length) return null;
  if (localList.includes(cfg.localModel)) return cfg.localModel;
  if (cfg.provider === 'ollama' && localList.includes(cfg.chatModel)) return cfg.chatModel;
  return localList.find((m) => /^gemma3/.test(m)) || localList.find((m) => /^(qwen3|llama3)/.test(m)) || localList[0];
}

function localSay({ persona, prompt, images, history = [], maxTokens = 160, temperature = 0.9, timeout = 60000 }) {
  const run = async () => {
    if (localPaused) return { ok: false, code: 'paused' };
    const model = await localModel();
    if (!model) return { ok: false, code: 'nolocal' };
    if (images && !(await ollama.canSee(model))) return { ok: false, code: 'novision', model };
    const user = { role: 'user', content: prompt, ...(images && { images }) };
    const messages = [{ role: 'system', content: persona }, ...history, user];
    try {
      const text = await ollama.chat({ model, messages, options: { num_predict: maxTokens, temperature }, keepAlive: '30m' }, () => {}, AbortSignal.timeout(timeout));
      return { ok: true, text, model, local: true };
    } catch (err) {
      return { ok: false, error: err.message, code: err.code || null, model };
    }
  };
  const result = localQueue.then(run, run);
  localQueue = result.catch(() => {});
  return result;
}

async function setLocalPause(on) {
  localPaused = Boolean(on);
  if (localPaused) await ollama.unload(await localModel());
}

// What her AI says about what you're doing (activity.js): on this PC only.
async function sayAbout({ persona, prompt }) {
  if (typeof persona !== 'string' || typeof prompt !== 'string') return { ok: false, error: 'bad request' };
  const res = await localSay({ persona, prompt, maxTokens: 120 });
  return res.code === 'nolocal' ? { ...res, code: 'noai' } : res;
}

async function pickProvider(provider) {
  updateConfig({ provider });
  await refreshModels();
  if (chatErrorCode) sendCommand('setupKey'); // it needs a key or an address: she asks for it
}

// What llm.js gets: the config with its keys opened (they're kept encrypted, setup.js)
function llmConfig(cfg = config.load()) {
  return { ...cfg, apiKeys: setup.openKeys(cfg.apiKeys) };
}

async function pickClaudeFolder() {
  const { canceled, filePaths } = await dialog.showOpenDialog({ properties: ['openDirectory'], defaultPath: config.load().claudeCwd || app.getPath('home') });
  if (canceled || !filePaths[0]) return;
  llm.resetClaude(); // a new folder, a new Claude Code conversation (hers goes on)
  saveMemory({ claude: null });
  updateConfig({ claudeCwd: filePaths[0] });
}

function createTray() {
  const icon = nativeImage.createFromPath(path.join(ROOT, 'assets', 'icons', 'tray.png'));
  tray = new Tray(icon);
  tray.setToolTip('Capri');
  tray.on('click', () => sendCommand('status'));
  rebuildTray();
}

function registerIpc() {
  ipcMain.on('overlay:interactive', (_e, on) => {
    overlay?.setIgnoreMouseEvents(!on, { forward: true });
  });
  ipcMain.on('overlay:rearm', () => rearmOverlay()); // the pointer moved over her and she never heard of it
  ipcMain.handle('overlay:cursor', () => {
    const p = screen.getCursorScreenPoint();
    const b = overlay.getBounds();
    const inside = p.x >= b.x && p.y >= b.y && p.x < b.x + b.width && p.y < b.y + b.height;
    return { x: p.x - b.x, y: p.y - b.y, inside, display: displayAt(p).id };
  });
  // your screens (their bounds), the one she's on, and where her window is
  ipcMain.handle('screens:list', () => {
    const o = overlay.getBounds();
    return {
      current: targetDisplay().id,
      origin: { x: o.x, y: o.y },
      list: displays().map(({ id, bounds: b }) => ({ id, x: b.x, y: b.y, w: b.width, h: b.height })),
    };
  });
  ipcMain.handle('screens:move', async (_e, id) => {
    const area = moveOverlay(id);
    if (!area) return null;
    await new Promise((r) => setTimeout(r, 60));
    overlay.setBounds(area); // again, once Windows has settled it on its new screen
    const o = overlay.getBounds();
    return { origin: { x: o.x, y: o.y }, width: o.width, height: o.height, gap: overlayArea().gap };
  });
  ipcMain.handle('config:get', () => rendererConfig());
  ipcMain.handle('hooks:status', () => activeHooks().status());
  ipcMain.handle('config:set', (_e, patch) => updateConfig(patch));
  ipcMain.handle('demo:window', (_e, open) => demoWindow(open));
  // right-clicking her: the same menu as the tray icon (which Windows often hides behind the ^ by the clock)
  ipcMain.on('menu:open', () => trayMenu?.popup({ window: overlay }));
  // her welcome panel's buttons
  ipcMain.handle('hooks:install', () => runHooks('install', { quiet: true }));
  ipcMain.handle('claude:found', () => fs.existsSync(path.dirname(activeHooks().status().file))); // Claude Code keeps its settings there
  ipcMain.on('claude:help', () => shell.openExternal(activeAssistant().help));
  ipcMain.handle('windows:get', () => lastWindows);
  ipcMain.handle('windows:closePage', (_e, { id, key }) => windowWatch?.close(id, key) ?? 'gone');
  // talking to her (chat.js): is Ollama there, with a model to talk with
  ipcMain.handle('chat:status', async () => {
    const cfg = config.load(true); // keys may have been edited by hand
    const { provider } = cfg;
    const models = await refreshModels();
    if (!models) return { ok: false, error: chatError || 'offline', code: chatErrorCode, provider };
    if (!models.length) return { ok: false, error: 'nomodel', provider };
    const model = pickModel();
    llm.warm(provider, model); // loading while you type your first message
    const local = llm.isLocal(provider, cfg, model);
    return { ok: true, provider, model, agent: provider === 'claude', local, warmup: provider === 'ollama' && local };
  });
  // her answer, streamed to the overlay piece by piece as `chat:delta`
  ipcMain.handle('chat:send', async (_e, { id, messages }) => {
    const abort = new AbortController();
    chats.set(id, abort);
    try {
      let streamed = false;
      const send = (text) => {
        streamed = true;
        overlay?.webContents.send('chat:delta', { id, text });
      };
      const cfg = config.load();
      let text;
      try {
        text = await chatWithFallback(cfg, messages, send, abort.signal, () => streamed);
      } catch (err) {
        // an online service out of free use for today, down, or unreachable: her model on this PC
        // answers instead (nothing said yet, and there is one)
        const online = !['ollama', 'claude'].includes(cfg.provider);
        const local = online && !abort.signal.aborted && !streamed ? await localModel(cfg) : null;
        if (!local) throw err;
        text = await ollama.chat({ model: local, messages, keepAlive: '30m' }, send, abort.signal);
      }
      if (cfg.provider === 'claude') saveMemory({ claude: llm.claudeMemory() });
      return { ok: true, text };
    } catch (err) {
      return { ok: false, error: abort.signal.aborted ? 'stopped' : err.message, code: err.code || null };
    } finally {
      chats.delete(id);
    }
  });
  ipcMain.on('chat:stop', (_e, id) => chats.get(id)?.abort());
  // she looks at your screen (look.js): the picture first, then what her AI says about it
  ipcMain.handle('look:snap', async () => {
    try {
      const id = randomUUID();
      snaps.set(id, await snapScreen());
      setTimeout(() => snaps.delete(id), 120000);
      return { ok: true, id };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });
  ipcMain.handle('look:say', (_e, request) => sayAboutSnap(request || {}));
  ipcMain.handle('activity:say', (_e, request) => sayAbout(request || {}));
  // her local mind (speech.js, the diary): text only, on this PC
  ipcMain.handle('local:say', (_e, request) => {
    const { persona, prompt, maxTokens, temperature } = request || {};
    if (typeof persona !== 'string' || typeof prompt !== 'string') return { ok: false, error: 'bad request' };
    return localSay({ persona, prompt, maxTokens: Math.min(Number(maxTokens) || 160, 600), temperature: Number(temperature) || 0.9 });
  });
  ipcMain.handle('local:pause', (_e, on) => setLocalPause(on));
  // what her camera sees, looked at by a vision model (camera.js): free online first, her local one else
  ipcMain.handle('camera:where', () => cameraVision().then((v) => ({ provider: v?.provider || null, model: v?.model || null, online: v ? v.provider !== 'local' : false })));
  ipcMain.handle('camera:look', async (_e, { image, persona, prompt } = {}) => {
    if (typeof image !== 'string' || image.length > 3_000_000) return { ok: false, error: 'bad picture' };
    const v = await cameraVision();
    if (!v) return { ok: false, code: 'novision' };
    if (v.provider === 'local') return localSay({ persona: String(persona || ''), prompt: String(prompt || ''), images: [image], maxTokens: 180, timeout: 120000 });
    const cfg = config.load();
    const messages = [
      { role: 'system', content: String(persona || '') },
      { role: 'user', content: [{ type: 'text', text: String(prompt || '') }, { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${image}` } }] },
    ];
    try {
      const text = await llm.chat(v.provider, llmConfig(cfg), { model: v.model, messages }, () => {}, AbortSignal.timeout(45000));
      return { ok: true, text, model: v.model, provider: v.provider };
    } catch (err) {
      visionCache = null; // that one may be gone: look again next time
      // online didn't work: her local model, if she has one that sees
      const local = await localSay({ persona: String(persona || ''), prompt: String(prompt || ''), images: [image], maxTokens: 180, timeout: 120000 });
      return local.ok ? local : { ok: false, error: err.message };
    }
  });
  // her hands (tasks.js)
  ipcMain.handle('task:start', (_e, req) => startTask(req || {}));
  // your calendar (calendar.js): the ICS address you gave her
  ipcMain.handle('calendar:upcoming', (_e, hours) => require('./calendar').upcoming(config.load().calendarUrl, Number(hours) || 36).catch((err) => ({ error: err.message })));
  // her day-to-day (daily.js)
  const daily = require('./daily');
  ipcMain.handle('daily:weather', (_e, { city, lang } = {}) => daily.weather(String(city || '').slice(0, 60), String(lang || 'en')).catch((err) => ({ error: err.message })));
  ipcMain.handle('clip:read', () => daily.readClip());
  ipcMain.on('clip:write', (_e, text) => daily.writeClip(text));
  // a screenshot you just took, seen by her local model only
  ipcMain.handle('shot:say', async (_e, { file, persona, prompt } = {}) => {
    if (!shotFiles.has(file)) return { ok: false, error: 'unknown file' };
    const image = daily.shrink(file);
    if (!image) return { ok: false, error: 'no picture' };
    return localSay({ persona: String(persona || ''), prompt: String(prompt || ''), images: [image], maxTokens: 140, timeout: 120000 });
  });
  ipcMain.on('task:cancel', () => taskAbort?.abort());
  // her name heard (src/wake): she perks up and listens (her window: mic.js)
  ipcMain.on('wake:event', (e, { what, data } = {}) => {
    if (e.sender !== wakeWin?.webContents) return;
    if (what === 'heard') sendCommand('wake');
    else if (what === 'error') console.error('[capri] wake word:', data);
  });
  // a call going on: her ear for her name lets go of the microphone too
  ipcMain.on('wake:pause', (_e, on) => {
    wakePaused = Boolean(on);
    wakeSync();
  });
  // her chat's models (the service picked), for her menu and for picking the quickest
  ipcMain.handle('chat:models', async () => (chatModels?.length ? chatModels : (await refreshModels()) || []));
  // your voice, to text: Groq's free Whisper, with the key you gave her (mic.js). The recording goes
  // there and nowhere else, and is never kept.
  ipcMain.handle('mic:transcribe', async (_e, { audio, lang } = {}) => {
    // offline voice on (her menu, model downloaded): Whisper on this PC, nothing sent
    if (config.load().voiceLocal === true && whisperReady()) {
      const r = await whisperJob(audio, lang).catch((err) => ({ error: err.message }));
      if (!r.error) return { text: r.text, local: true };
    }
    const key = setup.openKeys(config.load().apiKeys || {}).groq;
    if (!key) return { error: 'nokey' };
    if (!(audio instanceof ArrayBuffer || ArrayBuffer.isView(audio)) || !audio.byteLength) return { error: 'empty' };
    try {
      const form = new FormData();
      form.append('file', new Blob([audio], { type: 'audio/webm' }), 'voice.webm');
      form.append('model', 'whisper-large-v3-turbo');
      if (/^[a-z]{2}$/.test(lang || '')) form.append('language', lang);
      form.append('response_format', 'json');
      const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
        method: 'POST', headers: { authorization: `Bearer ${key}` }, body: form, signal: AbortSignal.timeout(30000),
      });
      if (!res.ok) return { error: `HTTP ${res.status}` };
      const data = await res.json();
      return { text: String(data.text || '').trim() };
    } catch (err) {
      return { error: err.message };
    }
  });
  // a file you handed her (dropped on her chat: the overlay tells us its path)
  ipcMain.handle('file:hand', (_e, file) => {
    if (typeof file !== 'string' || !fs.existsSync(file) || !fs.statSync(file).isFile()) return null;
    handed.add(file);
    return fileInfo(file);
  });
  ipcMain.handle('file:info', (_e, file) => fileInfo(String(file || '')));
  // a picture you handed her, seen by her local model only
  ipcMain.handle('file:look', async (_e, { file, persona, prompt } = {}) => {
    if (!handed.has(file)) return { ok: false, error: 'not handed' };
    const image = require('./daily').shrink(file);
    if (!image) return { ok: false, error: 'no picture' };
    return localSay({ persona: String(persona || ''), prompt: String(prompt || ''), images: [image], maxTokens: 220, timeout: 120000 });
  });
  ipcMain.on('heart:label', (_e, label) => {
    const next = String(label || '').slice(0, 80);
    if (next === heartLabel) return;
    heartLabel = next;
    rebuildTray();
  });
  ipcMain.handle('task:projects', () => tasks.projects(config.load().projectsRoot));
  // a folder you named in her chat ("a pasta site no windows"): where it is, if it's there
  ipcMain.handle('task:folder', (_e, spec) => tasks.folder(spec && typeof spec === 'object' ? {
    path: String(spec.path || '').slice(0, 400), name: String(spec.name || '').slice(0, 80), side: String(spec.side || ''),
  } : {}, config.load().projectsRoot));
  ipcMain.on('task:reveal', (_e, dir) => { if (typeof dir === 'string' && dir.startsWith('/')) tasks.reveal(dir); });
  ipcMain.on('gate:answer', (e, { id, allow, reason } = {}) => {
    const resolve = gates.get(id);
    if (!resolve) return;
    gates.delete(id);
    resolve({ allow: Boolean(allow), reason: String(reason || '') });
    // answered in the workshop: her question goes away too
    if (e.sender !== overlay?.webContents) overlay?.webContents.send('gate:gone', { id, allow: Boolean(allow) });
  });
  // the workshop window (src/workshop/preload.js)
  ipcMain.handle('work:state', () => workState());
  ipcMain.handle('work:usage', () => refreshUsage(true));
  ipcMain.on('work:cancel', () => taskAbort?.abort());
  ipcMain.on('work:reveal', (_e, dir) => {
    if (typeof dir !== 'string') return;
    if (dir.startsWith('/')) tasks.reveal(dir); else if (fs.existsSync(dir)) shell.openPath(dir);
  });
  ipcMain.on('work:allowAll', () => overlay?.webContents.send('work:allowAll'));
  ipcMain.handle('work:pick', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(workshopWin || undefined, { properties: ['openDirectory'], defaultPath: app.getPath('home') });
    if (canceled || !filePaths[0]) return null;
    return tasks.folder({ path: filePaths[0] });
  });
  // a task typed in the workshop: through her (she narrates it and asks you, like any other)
  ipcMain.on('work:start', (_e, { prompt, folder } = {}) => {
    if (typeof prompt !== 'string' || !prompt.trim()) return;
    if (work.task) { // one at a time: this one waits its turn
      work.queue = [...work.queue, { id: randomUUID(), prompt: prompt.slice(0, 4000), folder: typeof folder === 'string' && folder.startsWith('/') ? folder : null, when: 'next', at: Date.now() }].slice(-20);
      saveQueue();
      return;
    }
    overlay?.webContents.send('work:start', { prompt: prompt.slice(0, 4000), folder: typeof folder === 'string' && folder.startsWith('/') ? folder : null });
  });
  ipcMain.on('work:open', () => openWorkshop());
  // something to find later (her watchdog freed her, say): a line in capri-debug.log, in her data
  ipcMain.on('debug:log', (_e, line) => {
    try {
      const file = path.join(app.getPath('userData'), 'capri-debug.log');
      if (fs.existsSync(file) && fs.statSync(file).size > 512 * 1024) fs.renameSync(file, `${file}.old`);
      fs.appendFileSync(file, `${new Date().toISOString()} ${String(line).slice(0, 2000)}\n`);
    } catch { /* nowhere to write */ }
  });
  ipcMain.on('update:now', () => updater?.downloadUpdate().catch((err) => overlay?.webContents.send('update:error', { error: err.message })));
  // her settings window: an item clicked there, as if in her menu
  ipcMain.on('settings:click', (_e, id) => {
    const item = settingsItems.get(String(id));
    if (!item?.click || item.enabled === false) return;
    const checked = item.type === 'checkbox' ? !item.checked : true;
    try { item.click({ ...item, checked }, null, {}); } catch (err) { console.error('[capri] settings:', err.message); }
    setTimeout(() => { rebuildTray(); settingsSend(); }, 150);
  });
  ipcMain.on('settings:open', () => openSettings());
  // light mode: Ollama's model off the graphics card (it loads again when she needs it)
  ipcMain.handle('local:unload', async () => { await ollama.unload(await localModel(config.load())); return true; });
  // "me avisa quando o X entrar ao vivo": added, removed, listed
  ipcMain.handle('lives:set', async (_e, { op, site, name } = {}) => {
    const lives = require('./lives');
    const who = lives.clean(name);
    const list = config.load().lives || [];
    if (op === 'list') return { ok: true, list };
    if (!who) return { ok: false };
    const s2 = site === 'youtube' ? 'youtube' : 'twitch';
    const rest = list.filter((l) => !(l.name.toLowerCase() === who.toLowerCase() && (op === 'remove' || l.site === s2)));
    if (op === 'remove') { config.save({ lives: rest }); return { ok: rest.length < list.length, name: who }; }
    config.save({ lives: [...rest, { site: s2, name: who }].slice(-30) });
    const now = await lives.check({ site: s2, name: who }).catch(() => null);
    if (now?.live) liveNow.add(`${s2}:${who.toLowerCase()}`);
    return { ok: true, name: who, site: s2, live: Boolean(now?.live), url: now?.url };
  });
  ipcMain.on('whisper:ready', (_e, info = {}) => { whisperOk = Boolean(info.ok); overlay?.webContents.send('voice:ready', info); });
  ipcMain.on('whisper:done', (_e, { id, ...r } = {}) => { const done = whisperJobs.get(id); if (done) { whisperJobs.delete(id); done(r); } });
  // her offline voice turned on: the model fetched if it isn't here yet, then her listening window
  ipcMain.handle('voice:local', async (_e, on) => {
    if (!on) { updateConfig({ voiceLocal: false }); whisperStop(); return { ok: true }; }
    try {
      await whisperDownload();
    } catch (err) {
      return { ok: false, error: err.message };
    }
    updateConfig({ voiceLocal: true });
    whisperStart();
    return { ok: true };
  });
  // your Spotify: your app's Client ID, then your login in the browser (back on the bridge)
  ipcMain.handle('spotify:login', (_e, id) => {
    const client = String(id || '').trim();
    if (!/^[a-f0-9]{32}$/i.test(client)) return { ok: false, error: 'format' };
    config.save({ spotifyClient: client });
    shell.openExternal(spotify.loginUrl(client, `http://127.0.0.1:${PORT}/spotify/callback`));
    return { ok: true };
  });
  ipcMain.handle('spotify:play', (_e, q) => (spotify.connected() ? spotify.play(String(q || '').slice(0, 200), spotifyKeep).catch((err) => ({ ok: false, error: err.message })) : { ok: false, error: 'off' }));
  ipcMain.handle('spotify:playlist', (_e, { name, songs } = {}) => (spotify.connected() ? spotify.playlist(String(name || 'Capri'), (Array.isArray(songs) ? songs : []).map(String), spotifyKeep).catch((err) => ({ ok: false, error: err.message })) : { ok: false, error: 'off' }));
  ipcMain.handle('spotify:on', () => spotify.connected());
  ipcMain.on('spotify:disconnect', () => {
    clearInterval(spotifyTimer);
    config.save({ spotifyRefresh: null });
    spotify.use(null, null);
    rebuildTray();
  });
  // your PS5: connected with the NPSSO you pasted in her panel (never kept as it is: only its tokens, encrypted)
  ipcMain.handle('psn:connect', async (_e, npsso) => {
    const r = await psn.connect(npsso);
    if (!r.ok) return r;
    config.save({ psnRefresh: setup.sealKey(r.refresh), psnAccount: r.account, psnSyncDay: null });
    psnStart();
    rebuildTray();
    return { ok: true };
  });
  ipcMain.on('psn:disconnect', () => {
    clearInterval(psnTimer);
    config.save({ psnRefresh: null, psnAccount: null });
    rebuildTray();
  });
  ipcMain.on('mcp:answer', (_e, { id, answer } = {}) => {
    const done = mcpAsks.get(id);
    if (!done) return;
    mcpAsks.delete(id);
    done(answer == null ? null : String(answer).slice(0, 2000));
  });
  ipcMain.handle('tabs:do', (_e, req) => tabsDo(req && typeof req === 'object' ? req : {}).catch((err) => ({ ok: false, error: err.message })));
  ipcMain.handle('corner:data', () => cornerData());
  ipcMain.on('corner:reveal', (_e, name) => {
    if (typeof name === 'string' && /^[\w-]+\.png$/i.test(name)) shell.showItemInFolder(path.join(ART_DIR, name));
  });
  ipcMain.on('corner:open', () => openCorner());
  // her memory of you, from her corner: one thing forgotten, or all of it
  ipcMain.handle('corner:forget', (_e, id) => {
    const cfg = config.load();
    const profile = id === '*' ? [] : (cfg.profile || []).filter((i) => i.id !== id);
    updateConfig({ profile, memories: profile.filter((i) => i.kind === 'told').map((i) => i.label) });
    return cornerData();
  });
  // a task for later (hands.js, or the workshop while one runs)
  ipcMain.handle('work:queue', (_e, { prompt, folder, when } = {}) => {
    if (typeof prompt !== 'string' || !prompt.trim()) return null;
    const item = { id: randomUUID(), prompt: prompt.slice(0, 4000), folder: typeof folder === 'string' && folder.startsWith('/') ? folder : null,
      when: ['limit', 'night', 'next'].includes(when) ? when : 'next', at: Date.now() };
    work.queue = [...work.queue, item].slice(-20);
    saveQueue();
    return item;
  });
  ipcMain.on('work:unqueue', (_e, id) => {
    work.queue = work.queue.filter((q) => q.id !== id);
    saveQueue();
  });
  // "when I open X, remind me of Y": kept here, checked on the window in front while there are any
  ipcMain.handle('ctx:add', (_e, { app: name, text } = {}) => {
    const r = { id: randomUUID(), app: String(name || '').slice(0, 60), text: String(text || '').slice(0, 200), made: Date.now() };
    if (!r.app || !r.text) return null;
    config.save({ ctxReminders: [...(config.load().ctxReminders || []), r].slice(-20) });
    ctxWatch();
    return r;
  });
  // your windows arranged as you asked (arrange.js)
  ipcMain.handle('win:arrange', (_e, req = {}) => require('./arrange').arrange({
    action: String(req.action || ''), names: (Array.isArray(req.names) ? req.names : []).map((n) => String(n).slice(0, 60)).slice(0, 2),
  }).catch((err) => ({ ok: false, error: err.message })));
  // a notification of hers (on the lock screen too, if Windows shows notifications there)
  ipcMain.on('lock:notify', (_e, { title, body } = {}) => {
    if (!Notification.isSupported()) return;
    new Notification({
      title: String(title || 'Capri').slice(0, 60), body: String(body || '').slice(0, 200), silent: true,
      icon: path.join(ROOT, 'assets', 'icons', 'tray.png'),
    }).show();
  });
  // a stranger at the locked PC, photographed (only with her menu's "Photo of strangers" on)
  ipcMain.handle('visit:save', (_e, url) => {
    if (config.load().lockSnap !== true) return null;
    const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(String(url || ''));
    if (!m || m[1].length > 4e6) return null;
    const dir = path.join(tasks.SHOP, 'visitas');
    fs.mkdirSync(dir, { recursive: true });
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const file = path.join(dir, `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}.jpg`);
    fs.writeFileSync(file, Buffer.from(m[1], 'base64'));
    return file;
  });
  // her drawings while you're away (renderer art.js): PNGs in her workshop, ~/Capri/desenhos
  ipcMain.handle('art:save', (_e, url) => {
    const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(String(url || ''));
    if (!m || m[1].length > 4e6) return null;
    const dir = path.join(tasks.SHOP, 'desenhos');
    fs.mkdirSync(dir, { recursive: true });
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const file = path.join(dir, `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}.png`);
    fs.writeFileSync(file, Buffer.from(m[1], 'base64'));
    return file;
  });
  // her pranks (play.js), only as far as her menu › Mischief allows: the pointer only when 'bold'
  ipcMain.handle('play:prank', async (_e, { kind, arg } = {}) => {
    const level = config.load().pranks || 'light';
    const bold = ['tug', 'jail', 'mute'];
    if (level === 'off' || (bold.includes(kind) && level !== 'bold')) return false;
    if (kind === 'mute') {
      // your sound off for three seconds, then back exactly as it was (only if it was on)
      const before = await system.act({ action: 'volume' }).catch(() => null);
      if (!before || before.mute) return false;
      await system.act({ action: 'volume', mute: true }).catch(() => null);
      setTimeout(() => system.act({ action: 'volume', mute: false }).catch(() => null), 3000);
      return true;
    }
    return windowWatch?.prank(kind, arg || {}) ?? false;
  });
  // what she keeps of your days (activity.js) and her diary of them: in her memory file, on this PC
  ipcMain.handle('days:get', () => {
    const { days = {}, diary = {} } = readMemory();
    return { days, diary };
  });
  ipcMain.on('days:save', (_e, { days, diary } = {}) => {
    const patch = {};
    if (days && typeof days === 'object') patch.days = days;
    if (diary && typeof diary === 'object') patch.diary = diary;
    if (Object.keys(patch).length) saveMemory(patch);
    if (patch.diary) notesSoon();
  });
  // how hard the processor works, in %, since the last time she asked (pc.js)
  let cpuBefore = null;
  ipcMain.handle('pc:cpu', () => {
    const now = os.cpus().map(({ times: t }) => ({ idle: t.idle, total: t.user + t.nice + t.sys + t.idle + t.irq }));
    const before = cpuBefore;
    cpuBefore = now;
    if (!before) return null;
    let idle = 0, total = 0;
    now.forEach((c, i) => {
      idle += c.idle - (before[i]?.idle || 0);
      total += c.total - (before[i]?.total || 0);
    });
    return total > 0 ? Math.round(100 * (1 - idle / total)) : null;
  });
  // where her AI runs, for what she tells you before she looks: { local, provider, model }
  ipcMain.handle('look:where', async () => {
    const cfg = config.load();
    // what she does on her own (looking, commenting) only ever runs on this PC
    const mine = await localModel(cfg);
    if (mine) return { local: true, provider: 'Ollama', model: mine };
    const model = pickModel(cfg);
    const provider = cfg.provider === 'ollama' && ollama.isCloud(model) ? 'Ollama' : llm.PROVIDERS[cfg.provider]?.label || cfg.provider;
    return { local: llm.isLocal(cfg.provider, cfg, model), provider, model };
  });
  ipcMain.handle('chat:memory', () => readMemory().history || []);
  ipcMain.on('chat:remember', (_e, history) => Array.isArray(history) && saveMemory({ history }));
  ipcMain.on('chat:ollama', () => shell.openExternal(OLLAMA_SITE));
  // setting her up with buttons (setup.js): Ollama and a model, or a key, or an address
  const progress = (payload) => overlay?.webContents.send('setup:progress', payload);
  let pulling = null; // AbortController of the model being fetched
  ipcMain.handle('setup:info', async () => {
    // the free cloud models too, when Ollama is up and you're signed in to it
    const { free } = (await ollama.models().catch(() => null)) ? await refreshCloud() : { free: [] };
    return { models: setup.MODELS, cloud: free, ram: os.totalmem(), keyed: Object.keys(setup.KEY_PAGES) };
  });
  ipcMain.handle('setup:ollama', () => setup.ollamaState());
  ipcMain.handle('setup:install', () => setup.installOllama((line) => progress({ kind: 'install', line })));
  ipcMain.handle('setup:start', async () => {
    const res = await setup.startOllama();
    await refreshModels();
    return res;
  });
  ipcMain.handle('setup:pull', async (_e, name) => {
    if (!setup.MODELS.some((m) => m.name === name) && !cloud.free.includes(name)) return { ok: false, error: 'unknown model' };
    pulling?.abort();
    const abort = new AbortController();
    pulling = abort;
    try {
      // cut off midway (not by you): again, a few times; Ollama goes on from where it was
      let model;
      for (let attempt = 0; ; attempt++) {
        try {
          model = await fetchModel(name, (p) => progress({ kind: 'pull', ...p }), abort.signal);
          break;
        } catch (err) {
          if (abort.signal.aborted || attempt >= 4) throw err;
          await new Promise((r) => setTimeout(r, 3000));
        }
      }
      return { ok: true, model };
    } catch (err) {
      return { ok: false, error: abort.signal.aborted ? 'stopped' : err.message };
    } finally {
      if (pulling === abort) pulling = null;
    }
  });
  ipcMain.on('setup:cancel', () => pulling?.abort());
  // who answers her chat, with its key or address if it needs one: saved, tried, and undone if it fails
  ipcMain.handle('setup:use', async (_e, { provider, key, url }) => {
    if (!llm.PROVIDERS[provider]) return { ok: false, error: 'unknown provider' };
    const before = config.load();
    const patch = { provider };
    if (key) patch.apiKeys = { ...before.apiKeys, [provider]: setup.sealKey(String(key).trim()) };
    if (url) patch.customUrl = String(url).trim();
    updateConfig(patch);
    const models = await refreshModels();
    if (models?.length) return { ok: true, model: pickModel() };
    const error = models ? 'no model' : chatError || 'offline';
    updateConfig({ provider: before.provider, apiKeys: before.apiKeys, customUrl: before.customUrl });
    await refreshModels();
    return { ok: false, error };
  });
  // a Gemini key for her camera only (her chat stays where it is): saved encrypted, tried, kept if it works
  ipcMain.handle('vision:key', async (_e, key) => {
    // any of Google's key formats (the older AIza…, the newer AQ.…): Google itself says if it works
    const k = String(key || '').trim().replace(/^["'“”]+|["'“”]+$/g, '');
    if (!/^[\w.\-]{20,300}$/.test(k)) return { ok: false, error: 'format' };
    const before = config.load();
    config.save({ apiKeys: { ...before.apiKeys, gemini: setup.sealKey(k) } });
    const list = await llm.models('gemini', llmConfig(config.load())).catch(() => null);
    if (!list?.length) { config.save({ apiKeys: before.apiKeys }); return { ok: false, error: 'rejected' }; }
    visionCache = null;
    const v = await cameraVision();
    rebuildTray();
    return { ok: true, model: v?.model };
  });
  ipcMain.on('setup:keyPage', (_e, provider) => setup.KEY_PAGES[provider] && shell.openExternal(setup.KEY_PAGES[provider]));
  ipcMain.handle('setup:launch', (_e, integration) => setup.launchThroughOllama(integration));
  // closing an app you asked her to close, once you've clicked to confirm (apps.js)
  const appInfo = (app) => app && { name: app.process, label: app.label };
  ipcMain.handle('apps:list', async () => (await apps.list().catch(() => [])).map(appInfo));
  ipcMain.handle('apps:find', async (_e, wanted) => appInfo(await apps.find(wanted).catch(() => null)));
  ipcMain.handle('apps:close', (_e, { name, force }) => apps.close(name, { force }).catch((err) => ({ error: err.message })));
  // opening things you ask her to (launch.js): an app or a game, your music, a website
  ipcMain.handle('apps:findLaunch', async (_e, text) => {
    const item = await launch.find(String(text || '')).catch(() => null);
    return item && { ...item, risky: launch.risky(item) }; // a program or a script: behind a button
  });
  ipcMain.handle('apps:youtube', (_e, query) => launch.youtube(query).catch(() => null));
  ipcMain.handle('apps:roblox', (_e, query) => launch.roblox(query).catch(() => null));
  // your files (files.js): a search, opening what it found, a screenshot, a search on the web
  ipcMain.handle('files:search', (_e, query) => files.search(query).catch(() => []));
  ipcMain.handle('files:open', (_e, { file, reveal }) => files.open(String(file), { reveal: Boolean(reveal) }).then(() => true, () => false));
  ipcMain.handle('files:screenshot', () => files.screenshot(targetDisplay()).catch(() => null));
  ipcMain.handle('web:search', (_e, query) => {
    const q = String(query || '').trim().slice(0, 300);
    if (!q) return false;
    return shell.openExternal(`https://www.google.com/search?q=${encodeURIComponent(q)}`).then(() => true, () => false);
  });
  ipcMain.handle('apps:launch', (_e, item) => launch.launch(item).then(() => ({ ok: true }), (err) => ({ ok: false, error: err.message })));
  ipcMain.handle('apps:media', (_e, action) => launch.media(action));
  // your PC itself, from her chat: settings, what's left, sound, snip, windows, theme, power, and
  // taking care of it (what slows it, space, startup, updates, devices, setups, game mode, internet)
  ipcMain.handle('pc:do', (_e, req) => Promise.resolve(system.act(req, {
    display: targetDisplay(),
    progress: (p) => overlay?.webContents.send('pc:progress', p), // what takes a while: in her ticker
  })).catch(() => null));
  // how long since you last touched the keyboard or the mouse, in seconds (her health breaks)
  ipcMain.handle('pc:idle', () => powerMonitor.getSystemIdleTime());
  // the faces she knows (faceid.js): yours and the people you introduced, as numbers (no picture),
  // encrypted with your Windows account like her keys, only on this PC
  ipcMain.handle('face:load', () => {
    const stored = config.load().faceData;
    if (!stored) return null;
    try {
      return JSON.parse(setup.openKey(stored) || 'null');
    } catch {
      return null;
    }
  });
  ipcMain.handle('face:save', (_e, data) => {
    if (data === null) {
      updateConfig({ faceData: null });
      return true;
    }
    const json = JSON.stringify(data || {});
    if (json.length > 200000) return false;
    updateConfig({ faceData: setup.sealKey(json) });
    return true;
  });
  // you walked away (her camera, with "Lock my PC when I leave" on): Windows locked, as Win+L does
  ipcMain.handle('pc:lock', () => {
    const cfg = config.load();
    if (process.platform !== 'win32' || (cfg.lockAway !== true && cfg.lockStrangers !== true)) return false;
    execFile('rundll32.exe', ['user32.dll,LockWorkStation'], { windowsHide: true }, () => {});
    return true;
  });
  ipcMain.handle('apps:music', (_e, query) => launch.music(query).catch(() => false));
  ipcMain.handle('apps:site', (_e, address, browser) => launch.site(address, typeof browser === 'string' ? browser : null).catch(() => false));
  // typing to her: the overlay takes the keyboard while the chat is open, and gives it back after
  ipcMain.on('overlay:focus', (_e, on) => {
    if (!overlay) return;
    overlay.setFocusable(Boolean(on));
    if (on) overlay.focus();
    else overlay.blur();
  });
  // her report card's copy button: a picture of that part of the overlay, on the clipboard
  ipcMain.handle('panel:copy', async (_e, rect) => {
    const image = await overlay.webContents.capturePage(rect);
    if (image.isEmpty()) return false;
    const png = new Blob([image.toPNG()], { type: 'image/png' });
    await clipboard.write([new ClipboardItem({ 'image/png': png })]);
    return true;
  });
  // her guide: where her tray icon is (it lives in the taskbar, off the overlay, hence overlay
  // coordinates past its edge), and the corner by the clock in case Windows hid it behind the ^
  ipcMain.handle('guide:tray', () => {
    const o = overlay.getBounds();
    const d = targetDisplay().bounds;
    const b = tray?.getBounds();
    const icon = b && b.width > 0 ? { x: b.x - o.x, y: b.y - o.y, w: b.width, h: b.height } : null;
    const corner = { x: d.x + d.width - 150 - o.x, y: d.y + d.height - 44 - o.y, w: 140, h: 40 };
    return { icon, corner };
  });
  // her guide: Claude Code's folder (~/.claude) in Explorer, its settings file selected
  ipcMain.handle('guide:claudeFolder', () => {
    const file = activeHooks().status().file;
    const dir = path.dirname(file);
    if (!fs.existsSync(dir)) return { found: false, dir };
    if (fs.existsSync(file)) shell.showItemInFolder(file);
    else shell.openPath(dir);
    return { found: true, dir, file: fs.existsSync(file), label: fs.existsSync(file) ? path.basename(file) : path.basename(dir) };
  });
  ipcMain.handle('sounds:list', () => {
    try {
      return fs.readdirSync(userSoundsDir())
        .filter((f) => SOUND_EXT.test(f))
        .map((f) => ({ name: f.replace(SOUND_EXT, '').toLowerCase(), url: `capri://usersounds/${encodeURIComponent(f)}` }));
    } catch {
      return [];
    }
  });
}

// Only in --dev: lets scripts drive the overlay and grab frames of it (no desktop content, just our window).
const testWins = new Map(); // name -> test window

async function debugHandler(route, body) {
  if (!DEV) throw new Error('debug routes need --dev');
  if (route === 'command') {
    sendCommand(body.name, body);
    return { ok: true };
  }
  if (route === 'reload') {
    overlay.webContents.reloadIgnoringCache();
    return { ok: true };
  }
  if (route === 'unhook') {
    // the pointer no longer passed on to her, as when Windows drops the mouse hook
    overlay.setIgnoreMouseEvents(true);
    return { ok: true };
  }
  if (route === 'testwin') {
    // plain windows to sit on, opened without stealing focus, by name (`id`, default "main");
    // each one opened goes in front of the others. { open: false } without an id closes them all.
    const id = body.id ?? 'main';
    if (!body.open && body.id === undefined) {
      for (const win of testWins.values()) win.destroy();
      testWins.clear();
      return { ok: true };
    }
    testWins.get(id)?.destroy();
    testWins.delete(id);
    if (body.open) {
      const b = overlay.getBounds();
      const win = new BrowserWindow({
        x: b.x + (body.x ?? 300), y: b.y + (body.y ?? 380), width: body.w ?? 720, height: body.h ?? 380,
        show: false, alwaysOnTop: true, title: `Capri test window ${id}`, backgroundColor: '#1b1726',
      });
      win.loadURL('data:text/html,<body style="background:%231b1726"></body>');
      win.showInactive();
      testWins.set(id, win);
    }
    return { ok: true };
  }
  if (route === 'movewin' && testWins.has(body.id ?? 'main')) {
    const win = testWins.get(body.id ?? 'main');
    const [x, y] = win.getPosition();
    win.setPosition(x + (body.dx || 0), y + (body.dy || 0));
    return { ok: true };
  }
  if (route === 'mouse') {
    // the pointer moving over the overlay (css px), and clicking if asked, without touching the real one
    const at = { x: Math.round(body.x), y: Math.round(body.y) };
    overlay.webContents.sendInputEvent({ type: 'mouseMove', ...at });
    if (body.click) {
      overlay.webContents.sendInputEvent({ type: 'mouseDown', button: 'left', clickCount: 1, ...at });
      overlay.webContents.sendInputEvent({ type: 'mouseUp', button: 'left', clickCount: 1, ...at });
    }
    return { ok: true };
  }
  if (route === 'menu') {
    // her menu as labels, and a click on one of them if asked ({ click: 'beam:cloud · ...' })
    const items = (menu) => menu.items.filter((i) => i.label).map((i) => (i.submenu ? { [i.label]: items(i.submenu) } : i.label));
    const find = (menu) => menu.items.reduce((hit, i) => hit || (i.label === body.click ? i : i.submenu && find(i.submenu)), null);
    if (body.click) find(trayMenu)?.click();
    return { ok: true, value: items(trayMenu) };
  }
  if (route === 'eval') {
    // a look inside the overlay (app.js puts what's there on window.dev in --dev)
    return { ok: true, value: await overlay.webContents.executeJavaScript(String(body.js || 'null')) };
  }
  if (route === 'drag') {
    // a drag over the overlay with a stand-in pointer, the real one untouched: the button goes down
    // at the first point, follows the others (each `ms` after the one before), and comes up at the last
    const points = Array.isArray(body.points) ? body.points : [];
    if (!points.length) throw new Error('drag needs points');
    const at = (p) => ({ x: Math.round(p.x), y: Math.round(p.y) });
    overlay.webContents.sendInputEvent({ type: 'mouseMove', ...at(points[0]) });
    overlay.webContents.sendInputEvent({ type: 'mouseDown', button: 'left', clickCount: 1, ...at(points[0]) });
    for (const p of points.slice(1)) {
      await new Promise((r) => setTimeout(r, p.ms ?? 16));
      overlay.webContents.sendInputEvent({ type: 'mouseMove', modifiers: ['leftButtonDown'], ...at(p) });
    }
    if (body.up !== false) overlay.webContents.sendInputEvent({ type: 'mouseUp', button: 'left', clickCount: 1, ...at(points.at(-1)) });
    return { ok: true };
  }
  if (route === 'type') {
    // typing into the overlay (her chat), and Enter if asked
    if (body.text) await overlay.webContents.insertText(body.text);
    if (body.enter) {
      overlay.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Return' });
      overlay.webContents.sendInputEvent({ type: 'char', keyCode: 'Return' });
      overlay.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Return' });
    }
    return { ok: true };
  }
  if (route === 'capture') {
    const image = await overlay.webContents.capturePage();
    // installed, the app's own folder is read-only: its data folder instead
    const dir = path.join(app.isPackaged ? app.getPath('userData') : ROOT, 'captures');
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `${(body.name || 'frame').replace(/[^\w-]/g, '')}.png`);
    fs.writeFileSync(file, image.toPNG());
    return { ok: true, file };
  }
  throw new Error('unknown debug route');
}

// How her window is drawn, set before Electron starts (her menu › Display). On some PCs her see-through
// window shows up black (NVIDIA with FXAA, MFAA or HDR on, for one): drawing it through OpenGL, or
// without the graphics card, often fixes it.
function applyRender() {
  const { render } = config.load();
  if (render === 'gl') app.commandLine.appendSwitch('use-angle', 'gl');
  if (render === 'software') {
    app.disableHardwareAcceleration();
    app.commandLine.appendSwitch('enable-unsafe-swiftshader'); // her drawing still needs WebGL, done on the CPU
  }
  // --dev: what Chromium ended up drawing with
  if (DEV) app.whenReady().then(() => setTimeout(() => console.log('[capri] display:', render, JSON.stringify(app.getGPUFeatureStatus())), 4000));
}

function main() {
  applyRender();
  if (!app.requestSingleInstanceLock()) {
    app.quit();
    return;
  }
  // started again: with a file (Send to › Capri), she takes it; else she says where things stand
  app.on('second-instance', (_e, argv) => {
    const file = fileArg(argv);
    if (file) sendCommand('file', { path: file });
    else sendCommand('status');
  });
  if (process.platform === 'win32') app.setAppUserModelId('capri.desktop');

  app.whenReady().then(() => {
    if (!['codex', 'claude'].includes(config.load().assistant)) config.save({ assistant: activeAssistant().id });
    serveProtocol();
    registerIpc();
    createOverlay();
    createTray();
    windowWatch = startWindowWatch({
      overlay,
      onUpdate: (data) => {
        // a click on the taskbar brings it up over her: sitting on it, her legs would vanish behind it
        if (data.taskbar && !lastWindows?.taskbar && config.load().rest === 'taskbar') raiseOverlay();
        lastWindows = data;
        overlay?.webContents.send('windows:update', data);
      },
      onSense: (s) => overlay?.webContents.send('pc:sense', s),
    });
    windowWatch.sense(config.load().senseInput === true);
    windowWatch.activity(config.load().watchActivity === true);
    checkShellHook();
    sendToEntry();
    wakeSync();
    // her local model, ready for her: Ollama started if it's asleep (it may not start with Windows)
    setTimeout(() => wakeOllama().then(() => refreshModels()).catch(() => {}), 4000);
    ctxWatch(); // reminders tied to an app, from before
    updatesStart(); // her new versions, asking first
    psnStart(); // your PS5, if connected
    spotifyStart(); // your Spotify, if connected
    noticesSync(); // your notifications, if she may read them
    setTimeout(() => livesTick().catch(() => {}), 90000);
    setInterval(() => livesTick().catch(() => {}), 5 * 60000);
    whisperStart(); // her offline voice, if it's on
    try { if (refreshExtension()) setTimeout(() => sendCommand('tabsUpdated'), 15000); } catch { /* not there */ }
    setTimeout(() => githubTick().catch(() => {}), 60000);
    setInterval(() => githubTick().catch(() => {}), 10 * 60000);
    // how much of your Claude plan is used (free to ask): now and then
    setTimeout(() => refreshUsage(true), 20000);
    setInterval(() => refreshUsage(true), 10 * 60000);
    // started with a file (Send to › Capri while she wasn't running)
    const first = fileArg(process.argv);
    if (first) setTimeout(() => sendCommand('file', { path: first }), 9000);
    // what's playing and your screenshots: only while "Comment on what I do" is on (daily.js)
    followDay(config.load().watchActivity === true);
    // a program or a script just downloaded: she offers to have Defender look at it (guard.js)
    require('./guard').watchDownloads((file) => overlay?.webContents.send('guard:download', file));
    createBridge({
      port: PORT,
      onTabs: (ws) => tabs.attach(ws),
      onMcp: (body) => onMcp(body),
      onState: () => overlay?.webContents.executeJavaScript(`(() => { const d = window.dev; if (!d) return null; const c = d.capri;
        return { version: '${app.getVersion()}', mode: c.mode, stance: c.stance, busy: c.busy, busyBy: c.busyBy, busyFor: c.busy ? Math.round((performance.now() - c.busySince) / 1000) : 0,
          dormant: c.dormant, lounge: Boolean(c.lounge), wander: c.wander, restOn: c.restOn, idleFor: Math.round((performance.now() - c.lastActivity) / 1000), sleepAfter: Math.round((c.sleepAfter?.() || 0) / 1000),
          energy: d.heart.energy, level: d.heart.energyLevel, state: d.heart.state, presence: d.presence.state, holding: d.life.holding(), guide: d.guide.running,
          panel: d.panel.current ? { kind: d.panel.current.kind, actions: (d.panel.current.actions || []).length, guide: Boolean(d.panel.current.guide) } : null,
          chat: d.chat.open, light: d.light.on, watch: d.watch.on, quietClaude: d.brain.isQuiet() }; })()`),
      onSpotify: async (query) => {
        const r = await spotify.callback(query);
        if (r.ok) {
          config.save({ spotifyRefresh: setup.sealKey(r.refresh), spotifyTopWeek: null });
          spotifyStart();
          rebuildTray();
          overlay?.webContents.send('spotify:connected');
        }
        return r;
      },
      // her own Claude Code chat's hooks would cover its answer with theirs
      onEvent: (evt) => {
        // your terminal (hooks/capri-shell.sh), not an AI: her menu › React to my terminal
        if (evt.hook_event_name === 'ShellCommand') {
          if (config.load().shellReact !== false) overlay?.webContents.send('shell:event', evt);
          return;
        }
        if (!llm.isChatSession(evt.session_id)) overlay?.webContents.send('claude:event', evt);
      },
      onGate: askGate,
      onDebug: DEV ? debugHandler : null,
    });
    globalShortcut.register('Control+Alt+C', () => toggleVisible());
    // talk to her from anywhere, by typing or by voice
    globalShortcut.register('Control+Alt+Space', () => sendCommand('chat'));
    globalShortcut.register('Control+Alt+V', () => sendCommand('listen'));
    // what you copied, translated in her bubble
    globalShortcut.register('Control+Alt+T', () => sendCommand('translate'));
    // OBS (or Streamlabs) running: she knows she may be on camera (play.js, her menu › When OBS is on)
    let obsOn = null;
    const lookObs = () => execFile('tasklist', ['/FO', 'CSV', '/NH'], { windowsHide: true, timeout: 10000 }, (err, out) => {
      const on = !err && /"(obs64|obs32|obs|Streamlabs OBS|Streamlabs Desktop)\.exe"/i.test(String(out));
      if (on !== obsOn) {
        obsOn = on;
        overlay?.webContents.send('pc:obs', on);
      }
    });
    if (process.platform === 'win32') {
      lookObs();
      setInterval(lookObs, 60000);
    }
    // her microphone (mic.js), for her own window only; nothing else she shows may ask for it
    // her microphone (mic.js) and, if you turned it on, her camera (camera.js): for her own window only
    session.defaultSession.setPermissionRequestHandler((wc, permission, done, details) => {
      const types = details.mediaTypes || [];
      const camera = config.load().cameraOn === true;
      const audioOnly = types.every((m) => m === 'audio');
      const ok = permission === 'media' && ((wc === overlay?.webContents && types.every((m) => m === 'audio' || (m === 'video' && camera)))
        || (wc === wakeWin?.webContents && audioOnly));
      done(Boolean(ok));
    });
    llm.restoreClaude(readMemory().claude);
    refreshModels(); // for her menu's model list
    setTimeout(() => launch.launchables().catch(() => {}), 20000); // what she can open, before you ask
    // a screen plugged in, unplugged, or rearranged: her window fitted again, and she learns of it
    const screensChanged = () => {
      fitOverlay();
      windowWatch?.refresh();
      rebuildTray();
      sendCommand('screens');
    };
    screen.on('display-metrics-changed', screensChanged);
    screen.on('display-added', screensChanged);
    screen.on('display-removed', screensChanged);
    // after sleep or a locked screen, once Windows has settled
    powerMonitor.on('resume', () => setTimeout(rearmOverlay, 2000));
    powerMonitor.on('unlock-screen', () => setTimeout(rearmOverlay, 1000));
    // the PC locked and unlocked: she keeps an eye on who comes (renderer lockwatch.js)
    powerMonitor.on('lock-screen', () => overlay?.webContents.send('pc:lockState', { locked: true }));
    powerMonitor.on('unlock-screen', () => overlay?.webContents.send('pc:lockState', { locked: false }));
  });

  app.on('will-quit', () => {
    globalShortcut.unregisterAll();
    windowWatch?.stop();
  });
  app.on('window-all-closed', (e) => e.preventDefault());
}

main();
