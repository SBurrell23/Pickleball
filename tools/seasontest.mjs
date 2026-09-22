// Season ladder shape. Stands a baseline-stat player -- the human stat line,
// which is all anyone gets now -- against every rung of every difficulty and
// reports the win rate. What this is checking is that each difficulty ramps
// from winnable to hard WITHIN itself, and that the four difficulties are
// genuinely different ladders rather than the same one relabelled.
import { Sim, PHASE } from '../src/game/sim.js';
import { createBotState, updateBot } from '../src/game/ai.js';
import { DEFAULT_LOOK } from '../src/game/avatar.js';
import { enemyDef, skillFor, seasonLength } from '../src/game/enemies.js';
import { DIFFICULTIES } from '../src/game/season.js';

// Stand-ins for how well a person plays. A bot at this skill is not a person,
// but it is the only yardstick available and it is a consistent one.
const PLAYERS = { casual: 0.42, decent: 0.60, strong: 0.78 };
const GAMES = Number(process.argv[3] || 6);
const only = process.argv[2];

function play(seed, playerSkill, rivalIdx, difficulty) {
  const sim = new Sim({ mode: 'singles', seed, pointsToWin: 11, players: [
    { id: 'me', look: DEFAULT_LOOK, team: 0, bot: true },
    { id: 'rival', def: enemyDef(rivalIdx, difficulty), team: 1, bot: true }] });
  const bots = [createBotState(playerSkill), createBotState(skillFor(difficulty, rivalIdx))];
  let t = 0;
  while (sim.phase !== PHASE.GAMEOVER && t < 60 * 60 * 12) {
    const i = [];
    for (const p of sim.players) i[p.idx] = updateBot(sim, p, bots[p.idx], 1 / 60);
    sim.step(1 / 60, i); sim.drainEvents(); t++;
  }
  return sim.winner === 0;
}

const failures = [];
const check = (ok, msg) => { if (!ok) failures.push(msg); };
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const grid = {};

for (const [label, skill] of Object.entries(PLAYERS)) {
  if (only && only !== label) continue;
  console.log(`
=== a "${label}" player (skill ${skill}) ===`);
  grid[label] = {};
  for (const d of DIFFICULTIES) {
    const row = [];
    for (let i = 0; i < seasonLength(d); i++) {
      let w = 0;
      for (let g = 0; g < GAMES; g++) w += play(g * 5381 + i * 97 + 3, skill, i, d) ? 1 : 0;
      row.push(w / GAMES);
    }
    grid[label][d] = row;
    const bar = row.map((v) => String(Math.round(v * 100)).padStart(4)).join('');
    console.log(`  ${d.padEnd(8)}${bar}   (rival 1..${seasonLength(d)}, win %)`);
  }
}

// The bands are wide on purpose. The AI uses unseeded randomness and a dozen
// games is a dozen games, so these catch a ladder that has stopped being a
// ladder -- not a five-point drift.
if (!only) {
  for (const d of ['normal', 'hard']) {
    const row = grid.decent[d];
    const first = mean(row.slice(0, 2));
    const last = mean(row.slice(-2));
    check(first - last >= 0.25,
      `${d}: the ladder barely ramps for a decent player `
      + `(first two ${(first * 100).toFixed(0)}%, last two ${(last * 100).toFixed(0)}%)`);
  }
  // Easy has to be the on-ramp: a weak player should be able to clear it.
  check(mean(grid.casual.easy) >= 0.6,
    `easy is not an on-ramp -- a casual player wins only ${(mean(grid.casual.easy) * 100).toFixed(0)}% of it`);
  // ...and Extreme has to be possible for somebody, or nobody ever sees it.
  const topHalf = mean(grid.strong.extreme.slice(0, 5));
  check(topHalf >= 0.3,
    `extreme is unwinnable from the first rung (a strong player wins ${(topHalf * 100).toFixed(0)}% of the opening five)`);
  // And the four difficulties have to actually differ.
  const order = DIFFICULTIES.map((d) => mean(grid.decent[d]));
  for (let i = 1; i < order.length; i++) {
    check(order[i] < order[i - 1] + 0.05,
      `${DIFFICULTIES[i]} is not harder than ${DIFFICULTIES[i - 1]} `
      + `(${(order[i] * 100).toFixed(0)}% vs ${(order[i - 1] * 100).toFixed(0)}%)`);
  }
}

console.log('');
if (failures.length) { for (const f of failures) console.error('FAIL: ' + f); process.exit(1); }
console.log('season ladder checks passed');
