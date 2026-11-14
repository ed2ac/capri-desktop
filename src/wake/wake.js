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
  proc.onaudioprocess = (e) => {
    try {
      rec.acceptWaveform(e.inputBuffer);
    } catch { /* a dropped buffer */ }
  };
  src.connect(proc);
  proc.connect(ctx.destination);
  say('ready');
})();
