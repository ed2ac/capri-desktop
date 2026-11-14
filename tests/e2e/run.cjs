#!/usr/bin/env node
'use strict';

// End to end, against the Capri installed on this PC (Windows): it restarts her with Chromium's
// debugger on, checks what can be checked from inside her window, puts back whatever setting it
// touched, and restarts her normally. Run it with Windows' Node (not WSL's):
//
//   npm run test:e2e              (from the project folder on Windows)
//   node tests/e2e/run.cjs        (same)
//
// What it can't do: click through her see-through window like your mouse does, hear your voice or
// see your face. Those stay for you to try; everything else is here.

const { spawn, execSync } = require('node:child_process');
const path = require('node:path');

const EXE = process.env.CAPRI_EXE || path.join(process.env.LOCALAPPDATA || '', 'Programs', 'capri-desktop', 'Capri.exe');
const PORT = 9250;
const results = [];
const errors = [];

const kill = () => { try { execSync('taskkill /IM Capri.exe /F', { stdio: 'ignore' }); } catch { /* not running */ } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function connect() {
  for (let i = 0; i < 30; i++) {
    try {
      const page = (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()).find((p) => /renderer\/index\.html/.test(p.url));
      if (page) return page;
    } catch { /* not up yet */ }
    await sleep(1000);
  }
  throw new Error('Capri did not come up with the debugger');
}

async function main() {
  if (process.platform !== 'win32') throw new Error('Run this with Windows\' Node, on the PC where Capri is installed.');
  kill();
  await sleep(1500);
  spawn(EXE, [`--remote-debugging-port=${PORT}`], { detached: true, stdio: 'ignore' }).unref();
  const page = await connect();
  await sleep(9000); // her intro
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let n = 0;
  const wait = new Map();
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.method === 'Runtime.exceptionThrown') errors.push((d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text || '').slice(0, 300));
    if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error' && !/XNNPACK/.test(JSON.stringify(d.params.args))) {
      errors.push(d.params.args.map((a) => a.value ?? a.description).join(' ').slice(0, 300));
    }
    if (wait.has(d.id)) { wait.get(d.id)(d.result); wait.delete(d.id); }
  };
  await new Promise((r) => { ws.onopen = r; });
  ws.send(JSON.stringify({ id: ++n, method: 'Runtime.enable' }));
  const ev = (expr, ms = 120000) => new Promise((res) => {
    const id = ++n;
    wait.set(id, (r) => res(r?.result?.value ?? { error: r?.exceptionDetails?.exception?.description }));
    ws.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression: `(async () => { const d = window.dev, h = window.host, sleep = (ms) => new Promise((r) => setTimeout(r, ms)); ${expr} })()`, awaitPromise: true, returnByValue: true } }));
    setTimeout(() => res({ error: 'timeout' }), ms);
  });
  const check = async (name, expr, ok, ms) => {
    const v = await ev(expr, ms);
    const pass = !v?.error && ok(v);
    results.push({ name, pass, v });
    console.log(`${pass ? 'ok  ' : 'FAIL'} ${name}${pass ? '' : `  → ${JSON.stringify(v).slice(0, 300)}`}`);
  };

  const original = await ev('return await h.getConfig()');

  await check('boots with all her modules', 'return Object.keys(d).length', (v) => v >= 30);
  await check('her chat has a model', 'const s = await h.chatStatus(); return s', (v) => v.ok && v.model);
  await check('Ollama is up (she wakes it if needed)', "const r = await h.localSay({ persona: 'x', prompt: 'ok', maxTokens: 4 }); return r.code || 'ok'", (v) => v === 'ok', 180000);
  await check('her local AI answers, in her language', `const r = await h.localSay({ persona: d.chat.lookPersona(), prompt: 'Diga oi em uma frase. ' + d.chat.languageNote() }); return { ok: r.ok, text: r.text, pt: r.ok && (await import('./js/util.js')).inLang(r.text, d.brain.lang) }`, (v) => v.ok && v.pt);
  await check('her AI writes new lines for a moment', "await d.speech.make('done'); return (d.speech.stock[d.speech.slot('done')] || []).length", (v) => v > 0);
  await check('chat intents', "const c = d.chat.care; return ['faz um checkup','anota: testar a capri','vamos jogar','olha pra mim'].map((x) => (c.asked(x, 3) || {}).what)", (v) => v.join() === 'checkup,todo,play,camera');
  await check('security checkup reads Windows', 'const r = await d.guard.checkupReply(); return r && r.line', (v) => typeof v === 'string' && v.length > 20);
  await check('face model loads (camera off)', "const B = new URL('../../', location.href).href; const { FilesetResolver, FaceLandmarker } = await import(B + 'node_modules/@mediapipe/tasks-vision/vision_bundle.mjs'); const f = await FilesetResolver.forVisionTasks(B + 'node_modules/@mediapipe/tasks-vision/wasm'); await FaceLandmarker.createFromOptions(f, { baseOptions: { modelAssetPath: B + 'assets/mediapipe/face_landmarker.task', delegate: 'CPU' }, runningMode: 'IMAGE' }); return 'ok'", (v) => v === 'ok');
  await check('sound model loads (microphone off)', "const B = new URL('../../', location.href).href; const { FilesetResolver, AudioClassifier } = await import(B + 'node_modules/@mediapipe/tasks-audio/audio_bundle.mjs'); const f = await FilesetResolver.forAudioTasks(B + 'node_modules/@mediapipe/tasks-audio/wasm'); const c = await AudioClassifier.createFromOptions(f, { baseOptions: { modelAssetPath: B + 'assets/mediapipe/yamnet.tflite' } }); const s = new Float32Array(48000).map((_, i) => 0.4 * Math.sin(2 * Math.PI * 1000 * i / 48000)); return c.classify(s, 48000)[0].classifications[0].categories[0].categoryName", (v) => /beep|sine|tone|whistle/i.test(v));
  await check('face recognition loads, and finds nobody in a blank picture', "const api = await d.face.load(); const c = document.createElement('canvas'); c.width = 320; c.height = 240; c.getContext('2d').fillRect(0, 0, 320, 240); const r = await api.detectAllFaces(c, new api.TinyFaceDetectorOptions()).withFaceLandmarks(true).withFaceDescriptors(); const saved = await h.faceLoad(); return { found: r.length, store: saved === null || typeof saved === 'object' }", (v) => v.found === 0 && v.store, 180000);
  await check('Claude\'s limit is read (free: Claude Code\'s /usage)', 'const u = await h.claudeUsage(); return u && u.rows.map((r) => r.key + ":" + r.pct).join(" ")', (v) => typeof v === 'string' && /session:\d+/.test(v), 90000);
  await check('who may use the PC, asked in words', "const c = d.chat.care; const r = c.asked('amanhã minha mãe vai usar o pc', 3); return r ? [r.what, r.op, r.who, r.when].join('|') : (d.face ? 'no intent' : 'no face')", (v) => /^faceAllow\|add\|minha mãe\|amanhã$/.test(v));
  // the modal bug: a question of hers must stay where it is (she doesn't walk off with it) and close on a click
  await check('a question of hers stays put, and closes on a click', `
    d.capri.setMode('idle'); d.capri.busy = false; d.mic.asked = false;
    d.mic.toggle(); await sleep(1200);
    const r0 = d.panel.rect(); const pos0 = { ...d.capri.pos };
    for (let i = 0; i < 12; i++) { d.life.pace(); d.capri.wanderStep(); await sleep(500); }
    const r1 = d.panel.rect(); const still = r0 && r1 && Math.abs(r0.left - r1.left) < 10 && Math.abs(r0.top - r1.top) < 10 && Math.abs(d.capri.pos.x - pos0.x) < 2 /* she floats a few px */;
    const b = [...document.querySelectorAll('.panel__action')].find((x) => x.offsetParent && /Agora não|Not now/.test(x.textContent)); b?.click(); await sleep(800);
    d.mic.asked = ${JSON.stringify(Boolean(original.micAsked))};
    return { shown: Boolean(r0), still, closed: !d.guide.waiting && !d.guide.running };`, (v) => v.shown && v.still && v.closed);
  await check('her name heard doesn\'t ask anything', `
    d.capri.setMode('idle'); d.mic.asked = false; let asked = false; const real = d.guide.ask.bind(d.guide); d.guide.ask = (...a) => { asked = true; return Promise.resolve('no'); };
    const realStart = d.mic.start.bind(d.mic); d.mic.start = async () => 'started';
    await d.mic.toggle({ asked: true }); d.guide.ask = real; d.mic.start = realStart; d.mic.asked = ${JSON.stringify(Boolean(original.micAsked))};
    return { asked };`, (v) => v.asked === false);

  // away (presence.js): the screen left alone, a drawing (not saved: the test's isn't yours), the recap when back
  await check('away: she leaves your screen alone, draws, and tells you what happened', `
    const p = d.presence; const lines = []; const say = d.panel.say.bind(d.panel); d.panel.say = (x) => { lines.push(x.line); return say(x); };
    const host = d.art.host; d.art.host = { saveArt: async (url) => (url.startsWith('data:image/png') && url.length > 2000 ? 'saved' : null) };
    p.goAway(); const quiet = !d.look.free() && d.brain.hushed === true && d.play.away === true;
    const a = await d.art.draw({ x: 40, y: 40, size: 120, reduced: true, hold: 1500 }); d.art.host = host;
    p.claudeDone('Tudo certo por aqui.', 'capri'); p.back(); await sleep(1800); d.panel.say = say;
    return { quiet, art: a && a.file, back: p.state, said: lines.join(' | ').slice(0, 200), loud: d.look.free !== undefined && !d.brain.hushed };`, (v) => v.quiet && v.art === 'saved' && v.back === 'here' && /Claude/.test(v.said) && v.loud);
  // her coding workshop: it opens, and shows the plan's use
  await ev('h.openWorkshop(); await sleep(3000); return true');
  {
    const shop = (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()).find((p) => /workshop\.html/.test(p.url));
    let v = { error: 'no workshop window' };
    if (shop) {
      const w = new WebSocket(shop.webSocketDebuggerUrl);
      await new Promise((r) => { w.onopen = r; });
      v = await new Promise((res) => {
        w.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id === 1) res(d.result?.result?.value); };
        w.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: "({ title: document.title, meters: document.getElementById('meters').textContent, idle: !document.getElementById('idle').hidden })", returnByValue: true } }));
        setTimeout(() => res({ error: 'timeout' }), 10000);
      });
      w.close();
    }
    const pass = Boolean(v && !v.error && /Oficina|workshop/i.test(v.title) && /%/.test(v.meters));
    results.push({ name: 'her coding workshop opens and shows the limit', pass, v });
    console.log(`${pass ? 'ok  ' : 'FAIL'} her coding workshop opens and shows the limit${pass ? '' : `  → ${JSON.stringify(v).slice(0, 300)}`}`);
  }

  // whatever was touched, as it was
  await ev(`await h.setConfig({ micAsked: ${JSON.stringify(original.micAsked ?? false)} }); return true`);
  await sleep(1000);
  const passed = results.filter((r) => r.pass).length;
  console.log(`\n${passed}/${results.length} passed; console errors: ${errors.length ? errors.join(' || ') : 'none'}`);
  kill();
  await sleep(1500);
  spawn(EXE, [], { detached: true, stdio: 'ignore' }).unref();
  process.exit(passed === results.length && !errors.length ? 0 : 1);
}

main().catch((err) => {
  console.error(err.message);
  kill();
  spawn(EXE, [], { detached: true, stdio: 'ignore' }).unref();
  process.exit(1);
});
