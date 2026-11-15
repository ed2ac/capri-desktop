// Listens for one word, "Capri", with Vosk (offline, a small Portuguese model) and tells her when it
// hears it (preload.js → main.js → her window). Started and stopped by main.js; the microphone is
// let go whenever it stops.
(async () => {
  const base = new URL('../../', location.href).href;
  const say = (what, data) => window.wake?.send(what, data);
  let model;
  try {
    model = await window.Vosk.createModel(`${base}assets/vosk/model-pt.tar.gz`);
  } catch (err) {
    say('error', String(err?.message || err));
    return;
  }
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 }, video: false }).catch(() => null);
  if (!stream) return say('error', 'no microphone');
  const ctx = new AudioContext();
  // her name, and the words that sound like it (so "que capricho" is heard as what it is, not as her)
  const GRAMMAR = ['capri', 'capri capri', 'capricho', 'caprichos', 'caprichoso', 'caprichosa', 'capricórnio', 'caprino', 'capricha', 'caprichar', '[unk]'];
  const rec = new model.KaldiRecognizer(ctx.sampleRate, JSON.stringify(GRAMMAR));
  let last = 0;
  const heard = (text) => {
    if (!/(^|\s)capri(\s|$)/.test(String(text || ''))) return;
    if (Date.now() - last < 6000) return;
    last = Date.now();
    rec.retrieveFinalResult();
    say('heard');
  };
  rec.on('partialresult', (m) => heard(m?.result?.partial));
  rec.on('result', (m) => heard(m?.result?.text));
  const src = ctx.createMediaStreamSource(stream);
  const proc = ctx.createScriptProcessor(4096, 1, 1);
  // Only sound worth listening to goes to the recognizer (it's what costs): louder than the room's own
  // noise (learned as it goes), with the moment just before it (so "Capri" isn't cut at its start)
  // and a little after. A quiet room: the recognizer rests.
  let floor = 0.01;
  let talkingUntil = 0;
  const before = []; // the last few buffers, copied
  const copy = (b) => { const c = ctx.createBuffer(1, b.length, b.sampleRate); c.copyToChannel(b.getChannelData(0), 0); return c; };
  proc.onaudioprocess = (e) => {
    const data = e.inputBuffer.getChannelData(0);
    let sum = 0;
    for (let i = 0; i < data.length; i += 4) sum += data[i] * data[i];
    const rms = Math.sqrt(sum / (data.length / 4));
    const now = performance.now();
    const loud = rms > Math.max(0.012, floor * 3);
    if (!loud && now > talkingUntil) floor = floor * 0.99 + rms * 0.01;
    try {
      if (loud) {
        if (now > talkingUntil) for (const b of before.splice(0)) rec.acceptWaveform(b); // the start of it
        talkingUntil = now + 1200;
      }
      if (now <= talkingUntil) rec.acceptWaveform(e.inputBuffer);
      else {
        before.push(copy(e.inputBuffer));
        if (before.length > 3) before.shift();
      }
    } catch { /* a dropped buffer */ }
  };
  src.connect(proc);
  proc.connect(ctx.destination);
  say('ready');
})();
