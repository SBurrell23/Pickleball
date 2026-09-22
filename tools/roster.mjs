// What a stat is worth, and whether any rival's kit is out of line.
//
// The question this used to answer -- "is any pickable character dominant?"
// -- no longer exists: the human side is one fixed stat line. What matters
// now is the other half, which is whether the numbers on the rival roster
// actually do anything, and whether any single rival is disproportionate for
// where they sit on the ladder.
import { Sim, PHASE } from '../src/game/sim.js';
import { createBotState, updateBot } from '../src/game/ai.js';
import { DEFAULT_LOOK, PLAYER_STATS } from '../src/game/avatar.js';
import { ENEMIES } from '../src/game/enemies.js';

const GAMES = Number(process.argv[2] || 14);
const SKILL = 0.6;

function play(seed, defA, defB) {
  const sim = new Sim({ mode: 'singles', seed, pointsToWin: 11, players: [
    { id: 'a', def: defA, look: defA ? undefined : DEFAULT_LOOK, team: 0, bot: true },
    { id: 'b', def: defB, look: defB ? undefined : DEFAULT_LOOK, team: 1, bot: true }] });
  const bots = sim.players.map(() => createBotState(SKILL));
  let ticks = 0;
  while (sim.phase !== PHASE.GAMEOVER && ticks < 60 * 60 * 15) {
    const inputs = [];
    for (const p of sim.players) inputs[p.idx] = updateBot(sim, p, bots[p.idx], 1 / 60);
    sim.step(1 / 60, inputs);
    sim.drainEvents();
    ticks++;
  }
  return sim.winner;
}

// A stand-in built on the human body, so only the stat under test differs.
function withStats(stats, build = {}) {
  return {
    id: 'probe', name: 'Probe', stats,
    colors: { primary: 0x888888, secondary: 0xcccccc, trim: 0x333333, skin: 0xd8a074 },
    build: { torso: 'tapered', head: 'round', crest: 'visor', scale: 0.92, bulk: 1, ...build },
  };
}

console.log(`Single-stat sensitivity vs the human stat line (${GAMES} games each,`
  + ` both bots at skill ${SKILL}).`);
console.log('A stat that changes nothing here is a stat that is not worth putting on a rival.\n');
for (const stat of Object.keys(PLAYER_STATS)) {
  const line = [];
  for (const mult of [0.85, 1.15, 1.30]) {
    const stats = { ...PLAYER_STATS, [stat]: mult };
    let w = 0;
    for (let g = 0; g < GAMES; g++) w += play(g * 9176 + 5, withStats(stats), null) === 0 ? 1 : 0;
    line.push(`${mult.toFixed(2)}x ${String(Math.round((w / GAMES) * 100)).padStart(3)}%`);
  }
  console.log(`  ${stat.padEnd(8)} ${line.join('   ')}`);
}

console.log('\nEach rival at full paper strength vs the human stat line.');
console.log('Ordered as they appear on the ladder; the trend should be upward.\n');
for (const e of ENEMIES) {
  let w = 0;
  for (let g = 0; g < GAMES; g++) w += play(g * 4441 + 7, e, null) === 0 ? 1 : 0;
  const pct = Math.round((w / GAMES) * 100);
  const bar = '#'.repeat(Math.round(pct / 5));
  console.log(`  ${e.name.padEnd(10)} ${String(pct).padStart(3)}%  ${bar}`);
}
