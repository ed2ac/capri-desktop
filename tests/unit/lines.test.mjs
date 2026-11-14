import './setup.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const src = fs.readFileSync(new URL('../../src/renderer/js/lines.js', import.meta.url), 'utf8');
// her lines as written, before the English fallback fills the gaps
const raw = src.replace(/const fill = [\s\S]*?\n}\n/, '').replace(/for \(const lang of Object\.keys\(LINES\)\) \{\n {2}for \(const key of \[[^\]]*\]\) \{[\s\S]*?\n {2}\}\n\}\n/, '');
const tmp = new URL('./.lines-raw.mjs', import.meta.url);
fs.writeFileSync(tmp, raw);
const { LINES } = await import(tmp.href);
fs.rmSync(tmp);
const keys = (o, p = '') => Object.entries(o || {}).flatMap(([k, v]) => (v && typeof v === 'object' && !Array.isArray(v) ? keys(v, p + k + '.') : [p + k]));

test('every English line has its Portuguese one (no English fallback for pt-BR)', () => {
  const pt = new Set(keys(LINES.pt));
  assert.deepEqual(keys(LINES.en).filter((k) => !pt.has(k)), []);
});

test('every moment her AI writes lines for has written lines to start from', () => {
  const speech = fs.readFileSync(new URL('../../src/renderer/js/speech.js', import.meta.url), 'utf8');
  const moments = [...speech.matchAll(/^ {2}'([\w.]+)': /gm)].map((m) => m[1]);
  const get = (o, path) => path.split('.').reduce((x, k) => (x == null ? x : x[k]), o);
  const missing = moments.filter((m) => !Array.isArray(get(LINES.pt, m)));
  assert.deepEqual(missing, []);
});
