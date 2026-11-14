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

// The same bug anywhere in her start: a statement of boot() itself (not inside a function called
// later) using a module declared further down ("Cannot access 'hearing' before initialization").
test('her start never uses a module before it is made', () => {
  const app = fs.readFileSync(new URL('../../src/renderer/js/app.js', import.meta.url), 'utf8').split('\n');
  const declared = new Map(); // name -> line
  app.forEach((l, i) => { const m = /^ {2}(?:const|let) (\w+)\b/.exec(l); if (m && !declared.has(m[1])) declared.set(m[1], i); });
  const early = [];
  app.forEach((l, i) => {
    if (!/^ {2}\S/.test(l) || /^ {2}(?:\/\/|\}|\)|\])/.test(l)) return; // boot()'s own statements only
    // what an arrow does runs later, and its parameters are its own
    const head = l.includes('=>') ? l.split('=>')[0].replace(/(?:\([^()]*\)|\w+)\s*$/, '') : l;
    for (const [name, at] of declared) {
      if (at > i && new RegExp(`(^|[^.\\w])${name}\\b(?!\\s*:)`).test(head.replace(/'[^']*'|"[^"]*"|`[^`]*`/g, ''))) early.push(`${i + 1}: ${name} (made at ${at + 1})`);
    }
  });
  assert.deepEqual(early, []);
});
