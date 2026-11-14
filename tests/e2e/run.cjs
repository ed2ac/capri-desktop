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
