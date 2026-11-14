'use strict';

// Her day-to-day (renderer daily.js): the weather (Open-Meteo, free and keyless: only the city you
// gave her goes there), what's playing (media.ps1, only while "Comment on what I do" is on), the
// screenshots you take (only then too), and your clipboard when you ask her about it.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const readline = require('node:readline');
const { spawn } = require('node:child_process');
const { app, clipboard, nativeImage } = require('electron');

const WIN = process.platform === 'win32';

async function getJson(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// { city, temp, code, max, min, rain } or { error: 'unknown' | message }
async function weather(city, lang = 'en') {
  const geo = await getJson(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=${encodeURIComponent(lang)}`);
  const place = geo?.results?.[0];
  if (!place) return { error: 'unknown' };
  const f = await getJson(`https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}`
    + '&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=1');
  return {
    city: place.name,
    temp: Math.round(f.current?.temperature_2m),
    code: f.current?.weather_code,
    max: Math.round(f.daily?.temperature_2m_max?.[0]),
    min: Math.round(f.daily?.temperature_2m_min?.[0]),
    rain: f.daily?.precipitation_probability_max?.[0] ?? null,
  };
}

// What's playing: onChange({ title, artist, app, playing } | null). Returns stop().
function watchMedia(onChange) {
  if (!WIN) return () => {};
  const script = path.join(__dirname, 'media.ps1').replace(`app.asar${path.sep}`, `app.asar.unpacked${path.sep}`);
  let child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script, String(process.pid)], { windowsHide: true });
  readline.createInterface({ input: child.stdout }).on('line', (line) => {
    try {
      const m = JSON.parse(line);
      onChange(m && m.title ? { title: String(m.title).slice(0, 120), artist: String(m.artist || '').slice(0, 80), app: String(m.app || ''), playing: Boolean(m.playing) } : null);
    } catch { /* not a line of ours */ }
  });
  child.on('exit', () => { child = null; });
  return () => child?.kill();
}

// The screenshots you take (Windows' Screenshots folder, on this PC or OneDrive): onNew(file). Returns stop().
function watchScreenshots(onNew) {
  if (!WIN) return () => {};
  const pictures = app.getPath('pictures');
  const home = os.homedir();
  const dirs = [
    path.join(pictures, 'Screenshots'), path.join(pictures, 'Capturas de tela'), path.join(pictures, 'Capturas de Tela'),
    path.join(home, 'OneDrive', 'Pictures', 'Screenshots'), path.join(home, 'OneDrive', 'Imagens', 'Capturas de tela'),
    path.join(home, 'OneDrive', 'Imagens', 'Capturas de Tela'),
  ].filter((d, i, all) => all.indexOf(d) === i && fs.existsSync(d));
  const watchers = [];
  const seen = new Set();
  for (const dir of dirs) {
    try {
      watchers.push(fs.watch(dir, (_kind, name) => {
        if (!name || !/\.(png|jpe?g)$/i.test(name)) return;
        const file = path.join(dir, name);
        if (seen.has(file)) return;
        seen.add(file);
        setTimeout(() => fs.existsSync(file) && onNew(file), 1500); // once it's written
      }));
    } catch { /* that one can't be watched */ }
  }
  return () => watchers.forEach((w) => w.close());
}

// A screenshot, small enough for her local model: base64 JPEG, 1280 px wide at most
function shrink(file) {
  const img = nativeImage.createFromPath(file);
  if (img.isEmpty()) return null;
  const { width } = img.getSize();
  return (width > 1280 ? img.resize({ width: 1280 }) : img).toJPEG(72).toString('base64');
}

const readClip = () => clipboard.readText().slice(0, 8000);
const writeClip = (text) => clipboard.writeText(String(text || ''));

module.exports = { weather, watchMedia, watchScreenshots, shrink, readClip, writeClip };
