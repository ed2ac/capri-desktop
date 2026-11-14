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

async function run({ cmd, ids, tabs, id }) {
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
  throw new Error('unknown command');
}

chrome.alarms.create('capri', { periodInMinutes: 0.5 });
chrome.alarms.onAlarm.addListener(connect);
chrome.runtime.onStartup.addListener(connect);
chrome.runtime.onInstalled.addListener(connect);
connect();
