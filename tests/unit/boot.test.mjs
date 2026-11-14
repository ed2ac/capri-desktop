import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// The bug that left her menu dead: window.dev listed modules declared further down, so her whole
// start stopped there ("Cannot access 'play' before initialization").
test('window.dev only lists what is already declared', () => {
  const app = fs.readFileSync(new URL('../../src/renderer/js/app.js', import.meta.url), 'utf8').split('\n');
  const at = app.findIndex((l) => l.trim().startsWith('window.dev = {'));
  assert.ok(at > 0);
  // (an entry like `screens: () => screens` is only read when called: that's fine)
  const names = app[at].replace(/^[^{]*\{|\}[^}]*$/g, '').split(',').filter((x) => !x.includes('=>')).map((x) => x.trim().split(':').pop().trim().split('.')[0]).filter((x) => /^\w+$/.test(x));
  const declaredAfter = names.filter((n) => app.slice(at + 1).some((l) => new RegExp(`^\\s+(const|let) ${n}\\b`).test(l)));
  assert.deepEqual(declaredAfter, []);
});
