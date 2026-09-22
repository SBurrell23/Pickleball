import { readFile } from 'node:fs/promises';
// Verifies every module parses and its import graph resolves, using light
// stubs for the browser globals that three.js and the UI touch on import.
globalThis.self = globalThis;
globalThis.window = globalThis;
try { Object.defineProperty(globalThis, 'navigator', {
  value: { userAgent: 'node', clipboard: null }, configurable: true, writable: true });
} catch { /* node already provides one */ }

const el = () => ({
  width: 0, height: 0, style: {}, classList: { add(){}, remove(){}, toggle(){} },
  appendChild(){}, removeChild(){}, addEventListener(){}, removeEventListener(){},
  querySelector(){ return null; }, querySelectorAll(){ return []; },
  getContext(){ return new Proxy({}, { get: () => () => ({ addColorStop(){} }) }); },
  getBoundingClientRect(){ return { left:0, top:0, width:1, height:1 }; },
  set innerHTML(v){}, get innerHTML(){ return ''; },
});
globalThis.document = {
  createElement: el, createElementNS: el, body: el(),
  getElementById(){ return el(); }, addEventListener(){}, removeEventListener(){},
};
globalThis.localStorage = { getItem: () => null, setItem(){}, removeItem(){} };
globalThis.addEventListener = () => {};
globalThis.removeEventListener = () => {};

const mods = [
  'src/game/constants.js','src/game/characters.js','src/game/rng.js',
  'src/game/ballistics.js','src/game/swing.js','src/game/sim.js','src/game/ai.js',
  'src/core/settings.js','src/core/input.js','src/audio/audio.js',
  'src/render/assets.js','src/render/character.js','src/render/fx.js','src/render/view.js',
  'src/net/net.js','src/net/interp.js','src/ui/hud.js','src/ui/menus.js',
  'src/ui/portrait.js','src/ui/reticle.js','src/ui/icons.js','src/game/game.js',
];
let bad = 0;
for (const m of mods) {
  try { await import('../' + m); console.log('  ok   ' + m); }
  catch (e) { bad++; console.log('  FAIL ' + m + '\n       ' + (e.message || e).split('\n')[0]); }
}
console.log(bad ? `\n${bad} module(s) failed` : '\nall modules resolve');

// Every screen the menus navigate to has to exist. A missing one renders as a
// blank overlay, which reads to a player as "the button does nothing" -- which
// is how the join screen sat broken for a commit after a refactor moved the
// code around it.
const src = await readFile(new URL('../src/ui/menus.js', import.meta.url), 'utf8');
const defined = new Set([...src.matchAll(/^ {2}screen_(\w+)\(/gm)].map((m) => m[1]));
const targets = new Set();
for (const m of src.matchAll(/this\.show\('(\w+)'/g)) targets.add(m[1]);
for (const m of src.matchAll(/data-act="(?:nav|back)" data-val="(\w+)"/g)) targets.add(m[1]);
const missing = [...targets].filter((t) => !defined.has(t)).sort();
if (missing.length) {
  console.log(`\nmissing screen(s): ${missing.join(', ')}`);
  bad++;
} else {
  console.log(`all ${targets.size} navigation targets have a screen`);
}

process.exit(bad ? 1 : 0);
