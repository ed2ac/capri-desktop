// Capri's hands on your tabs. A websocket to Capri, on your PC only (127.0.0.1); she sends a command
// when you ask her something about your tabs in her chat, and this does it and answers. It reads the
// text of a page only when you ask her to sum it up, and only the tab you're on.

const URL_CAPRI = 'ws://127.0.0.1:47823/tabs';
let ws = null;
let keepAlive = null;

function browserName() {
  const ua = navigator.userAgent;
  return /OPR\//.test(ua) ? 'Opera' : /Edg\//.test(ua) ? 'Edge' : /Brave/.test(ua) ? 'Brave' : 'Chrome';
}

function connect() {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;
  try {
    ws = new WebSocket(URL_CAPRI);
  } catch {
    return;
  }
  ws.onopen = () => {
    ws.send(JSON.stringify({ type: 'hello', browser: browserName() }));
    clearInterval(keepAlive);
    // a message every 20 s keeps this worker (and the connection) awake
    keepAlive = setInterval(() => ws?.readyState === WebSocket.OPEN && ws.send(JSON.stringify({ type: 'ping' })), 20000);
  };
  ws.onmessage = async (e) => {
    let msg;
    try { msg = JSON.parse(e.data); } catch { return; }
    if (!msg.id || !msg.cmd) return;
    let reply;
    try {
      reply = { ok: true, ...(await run(msg)) };
    } catch (err) {
      reply = { ok: false, error: String(err?.message || err) };
    }
    ws?.send(JSON.stringify({ id: msg.id, ...reply }));
  };
  ws.onclose = () => { clearInterval(keepAlive); ws = null; };
  ws.onerror = () => {};
}

const brief = (t) => ({ id: t.id, title: t.title || '', url: t.url || '', active: t.active, pinned: t.pinned, windowId: t.windowId, audible: Boolean(t.audible) });

async function run(msg) {
  const { cmd, ids, tabs, id } = msg;
  if (cmd === 'list') return { tabs: (await chrome.tabs.query({})).map(brief) };
  if (cmd === 'close') { await chrome.tabs.remove(ids.map(Number)); return { closed: ids.length }; }
  if (cmd === 'go') {
    const t = await chrome.tabs.update(Number(id), { active: true });
    await chrome.windows.update(t.windowId, { focused: true });
    return {};
  }
  if (cmd === 'open') {
    const win = await chrome.windows.create({ url: tabs.map((t) => t.url), focused: true });
    return { opened: win.tabs?.length || tabs.length };
  }
  if (cmd === 'window') {
    // the tabs of the window you're in (not pinned ones)
    const [cur] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    const list = cur ? (await chrome.tabs.query({ windowId: cur.windowId })).filter((t) => !t.pinned) : [];
    return { tabs: list.map(brief) };
  }
  if (cmd === 'page') {
    const [cur] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (!cur || !/^https?:/.test(cur.url || '')) return { title: cur?.title || '', text: '' };
    const [res] = await chrome.scripting.executeScript({
      target: { tabId: cur.id },
      func: () => {
        const main = document.querySelector('article, main, [role=main]') || document.body;
        return (main?.innerText || '').replace(/\n{3,}/g, '\n\n').slice(0, 12000);
      },
    });
    return { title: cur.title || '', url: cur.url, text: res?.result || '' };
  }
  if (cmd === 'focus') {
    focus = { on: Boolean(msg.on), until: Date.now() + (Number(msg.minutes) || 50) * 60000, block: (msg.block || []).map(String) };
    await chrome.storage.local.set({ focus });
    return { on: focus.on };
  }
  if (cmd === 'sites') {
    await bank();
    if (msg.day) return { sites: (await chrome.storage.local.get(`sites:${msg.day}`))[`sites:${msg.day}`] || {} };
    const days = Number(msg.days) || 1;
    const out = {};
    for (let i = 0; i < days; i++) {
      const key = `sites:${new Date(Date.now() - i * 86400000).toISOString().slice(0, 10)}`;
      const day = (await chrome.storage.local.get(key))[key] || {};
      for (const [h, s] of Object.entries(day)) out[h] = (out[h] || 0) + s;
    }
    return { sites: out };
  }
  if (cmd === 'media') {
    // the video playing in a tab (YouTube or any page with a video): its title and where it is
    const tabs = await chrome.tabs.query({ audible: true });
    for (const t of tabs) {
      if (!/^https?:/.test(t.url || '')) continue;
      const [res] = await chrome.scripting.executeScript({ target: { tabId: t.id }, func: () => { const v = document.querySelector('video'); return v ? { time: Math.round(v.currentTime), length: Math.round(v.duration || 0) } : null; } }).catch(() => []);
      return { title: (t.title || '').replace(/\s*-\s*YouTube$/, ''), url: t.url, ...(res?.result || {}) };
    }
    return { title: null };
  }
  throw new Error('unknown command');
}

// ---- time on each site (the tab you're on, while the browser has focus): kept here, by day ----
let current = null; // { host, since }
const today = () => new Date().toISOString().slice(0, 10);
async function bank() {
  if (!current) return;
  const secs = Math.round((Date.now() - current.since) / 1000);
  current.since = Date.now();
  if (secs < 2 || secs > 3600) return;
  const key = `sites:${today()}`;
  const day = (await chrome.storage.local.get(key))[key] || {};
  day[current.host] = (day[current.host] || 0) + secs;
  await chrome.storage.local.set({ [key]: day });
}
async function follow() {
  await bank();
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  const win = tab && await chrome.windows.get(tab.windowId).catch(() => null);
  let host = null;
  try { if (tab && win?.focused && /^https?:/.test(tab.url)) host = new URL(tab.url).hostname.replace(/^www\./, ''); } catch { /* not a page */ }
  current = host ? { host, since: Date.now() } : null;
}
chrome.tabs.onActivated.addListener(follow);
chrome.tabs.onUpdated.addListener((_id, info) => { if (info.url || info.status === 'complete') follow(); });
chrome.windows.onFocusChanged.addListener(follow);

// ---- focus mode (Capri's): distracting sites show her page instead, and she's told ----
let focus = { on: false, until: 0, block: [] };
chrome.storage.local.get('focus').then((r) => { if (r.focus) focus = r.focus; });
const blocked = (url) => {
  if (!focus.on || Date.now() > focus.until) return null;
  try {
    const h = new URL(url).hostname.replace(/^www\./, '');
    return focus.block.find((b) => h === b || h.endsWith(`.${b}`)) || null;
  } catch { return null; }
};
chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
  if (info.url && info.url === letThrough) { letThrough = null; return; }
  const site = info.url && blocked(info.url);
  if (!site) return;
  chrome.tabs.update(tabId, { url: chrome.runtime.getURL(`focus.html?site=${encodeURIComponent(site)}&back=${encodeURIComponent(info.url)}`) });
  ws?.readyState === WebSocket.OPEN && ws.send(JSON.stringify({ type: 'blocked', site }));
  void tab;
});

// "open it anyway" from her focus page: that one page lets through, once
let letThrough = null;
chrome.runtime.onMessage.addListener((m, _s, reply) => {
  if (m?.type === 'letThrough') { letThrough = m.url; ws?.readyState === WebSocket.OPEN && ws.send(JSON.stringify({ type: 'letThrough', url: m.url })); reply(true); }
});

chrome.alarms.create('capri', { periodInMinutes: 0.5 });
chrome.alarms.onAlarm.addListener(connect);
chrome.runtime.onStartup.addListener(connect);
chrome.runtime.onInstalled.addListener(connect);
connect();
