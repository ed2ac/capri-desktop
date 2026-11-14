// What her renderer modules expect of a browser, for testing them in Node.
const store = {};
globalThis.matchMedia ??= () => ({ matches: false, addEventListener() {} });
globalThis.localStorage ??= { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
globalThis.requestAnimationFrame ??= () => 0;
globalThis.window ??= globalThis;
// her modules start timers in their constructors: none of them should keep the test running
const realInterval = globalThis.setInterval;
globalThis.setInterval = (fn, ms) => { const t = realInterval(fn, ms); t.unref?.(); return t; };
const realTimeout = globalThis.setTimeout;
globalThis.setTimeout = (fn, ms) => { const t = realTimeout(fn, ms); t.unref?.(); return t; };
export const R = (name) => new URL(`../../src/renderer/js/${name}.js`, import.meta.url).href;
