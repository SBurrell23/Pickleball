// Headless rules + balance harness. Run with: node tools/simtest.mjs
import { Sim, PHASE } from '../src/game/sim.js';
import { createBotState, updateBot } from '../src/game/ai.js';
import { DEFAULT_LOOK } from '../src/game/avatar.js';

// Everything in here plays with the human stat line unless a test says
// otherwise: the balance the harness guards is the one a player experiences.
const even = (id, team) => ({ id, look: DEFAULT_LOOK, team, bot: true });

function playGame(seed, diffs, mode = 'singles', verbose = false) {
  const players = mode === 'doubles'
    ? [
        even('a1', 0), even('b1', 1), even('a2', 0), even('b2', 1),
      ]
    : [
        even('a', 0), even('b', 1),
      ];
  const sim = new Sim({ mode, players, seed, pointsToWin: 11 });
  const bots = sim.players.map((p) => createBotState(diffs[p.team]));
  const stats = {
    rallies: [], reasons: {}, hits: 0, quality: {}, shots: {}, ticks: 0,
    serves: 0, serveFaults: 0, returns: 0, thirds: 0,
  };
  const dt = 1 / 60;

  // Doubles rallies run much longer, and a deuce at 12-13 is a normal game,
  // not a stuck one -- give it room rather than cutting it off and calling it
  // a failure.
  const maxTicks = 60 * 60 * (mode === 'doubles' ? 30 : 15);
  while (sim.phase !== PHASE.GAMEOVER && stats.ticks < maxTicks) {
    const inputs = [];
    for (const p of sim.players) inputs[p.idx] = updateBot(sim, p, bots[p.idx], dt);
    sim.step(dt, inputs);
    stats.ticks++;
    for (const e of sim.drainEvents()) {
      if (e.type === 'hit') {
        stats.hits++;
        stats.quality[e.quality] = (stats.quality[e.quality] || 0) + 1;
        stats.shots[e.shot] = (stats.shots[e.shot] || 0) + 1;
        // Serve -> return -> third shot is the sequence that decides whether
        // rallies actually get going, so it is worth tracking on its own.
        if (e.shot === 'serve') stats.serves++;
        else if (sim.ball.shotCount === 2) stats.returns++;
        else if (sim.ball.shotCount === 3) stats.thirds++;
      }
      if (e.type === 'point') {
        stats.rallies.push(e.rallyShots);
        stats.reasons[e.reason] = (stats.reasons[e.reason] || 0) + 1;
        if (e.reason === 'Serve out') stats.serveFaults++;
        if (verbose) {
          console.log(`  pt team ${e.team} (${e.reason}) ${e.score[0]}-${e.score[1]} shots=${e.rallyShots}`);
        }
      }
    }
  }
  stats.cutOff = sim.phase !== PHASE.GAMEOVER;
  return { sim, stats };
}

function pct(n, total) { return total ? ((n / total) * 100).toFixed(1) + '%' : '0%'; }

console.log('=== singles, even bots (0.6 vs 0.6) ===');
let wins = [0, 0];
let allRallies = [];
let allReasons = {};
let allQual = {};
let allShots = {};
let flow = { serves: 0, serveFaults: 0, returns: 0, thirds: 0 };
for (let s = 1; s <= 8; s++) {
  const { sim, stats } = playGame(s * 7919, [0.6, 0.6]);
  wins[sim.winner]++;
  allRallies = allRallies.concat(stats.rallies);
  for (const k in stats.reasons) allReasons[k] = (allReasons[k] || 0) + stats.reasons[k];
  for (const k in stats.quality) allQual[k] = (allQual[k] || 0) + stats.quality[k];
  for (const k in stats.shots) allShots[k] = (allShots[k] || 0) + stats.shots[k];
  for (const k in flow) flow[k] += stats[k];
  process.stdout.write(`  game ${s}: ${sim.score[0]}-${sim.score[1]} winner=${sim.winner}\n`);
}
const totalR = allRallies.length;
const avg = allRallies.reduce((a, b) => a + b, 0) / totalR;
console.log(`wins ${wins[0]}/${wins[1]}  rallies=${totalR}  avg shots/rally=${avg.toFixed(2)}`);
console.log('point reasons:', Object.entries(allReasons)
  .sort((a, b) => b[1] - a[1])
  .map(([k, v]) => `${k} ${pct(v, totalR)}`).join('  '));
const qTot = Object.values(allQual).reduce((a, b) => a + b, 0);
console.log('hit quality:', Object.entries(allQual).map(([k, v]) => `${k} ${pct(v, qTot)}`).join('  '));
console.log('shot mix:', Object.entries(allShots).map(([k, v]) => `${k} ${pct(v, qTot)}`).join('  '));
const goodServes = Math.max(1, flow.serves - flow.serveFaults);
const returnRate = flow.returns / goodServes;
const thirdRate = flow.thirds / Math.max(1, flow.returns);
console.log(`rally flow: ${flow.serves} serves, ${pct(flow.returns, goodServes)} returned, ` +
  `${pct(flow.thirds, flow.returns)} of those got a third shot`);

console.log('\n=== skill gap (0.9 vs 0.25) should favour team 0 ===');
let gapWins = [0, 0];
for (let s = 1; s <= 8; s++) {
  const { sim } = playGame(s * 104729, [0.9, 0.25]);
  gapWins[sim.winner]++;
}
console.log(`  strong ${gapWins[0]} / weak ${gapWins[1]}`);

// Doubles gets its own run and its own band: four players cover the court far
// better than two, so rallies there are legitimately longer. Holding both modes
// to a single number would either mask a broken singles game or flag a healthy
// doubles one.
console.log('\n=== doubles ===');
const dblRuns = [];
for (let s = 1; s <= 3; s++) {
  const d = playGame(s * 31337, [0.6, 0.6], 'doubles');
  const a2 = d.stats.rallies.reduce((x, y) => x + y, 0) / d.stats.rallies.length;
  dblRuns.push({ sim: d.sim, avg: a2 });
  console.log(`  game ${s}: ${d.sim.score[0]}-${d.sim.score[1]} ` +
    `winner=${d.sim.winner} avg rally=${a2.toFixed(2)}` +
    (d.stats.cutOff ? '  << hit the time cap' : ''));
}
const dblAvg = dblRuns.reduce((a, r) => a + r.avg, 0) / dblRuns.length;
const dblFinished = dblRuns.filter((r) => r.sim.winner >= 0).length;
console.log(`  mean rally ${dblAvg.toFixed(2)}, ${dblFinished}/3 reached a winner`);

// ---- assertions -----------------------------------------------------------
// The bands are deliberately wide: the AI uses unseeded randomness, so these
// catch real regressions (rallies that never end, games that cannot finish,
// difficulty that stopped mattering) without being flaky.
const failures = [];
const check = (ok, msg) => { if (!ok) failures.push(msg); };

const finished = wins[0] + wins[1];
check(finished >= 7, `only ${finished}/8 singles games reached a winner`);
check(avg >= 3 && avg <= 16, `singles avg shots/rally ${avg.toFixed(2)} outside the band 3-16`);
check(totalR >= 60, `only ${totalR} rallies across 8 games -- points are ending too fast`);
check(gapWins[0] >= 6, `strong bot won only ${gapWins[0]}/8 against a much weaker one`);
check(dblFinished === 3, `only ${dblFinished}/3 doubles games reached a winner`);
check(dblAvg >= 4 && dblAvg <= 30, `doubles mean rally ${dblAvg.toFixed(2)} outside 4-30`);
// Rallies ending because nobody reached the ball is a legitimate outcome and
// dominates in bot-vs-bot play, so this checks for "always the same way"
// rather than policing the mix.
const topReason = Math.max(...Object.values(allReasons));
check(Object.keys(allReasons).length >= 3 && topReason / totalR < 0.95,
  'points are essentially all ending the same way -- a rule or the AI has broken');
// If serves stop coming back, or returns stop being answered, rallies collapse
// to two shots and the game stops being a game.
check(returnRate > 0.6, `only ${pct(flow.returns, goodServes)} of good serves came back`);
check(thirdRate > 0.7, `only ${pct(flow.thirds, flow.returns)} of returns got a third shot`);

console.log('');
if (failures.length) {
  for (const f of failures) console.error('FAIL: ' + f);
  process.exit(1);
}
console.log('all checks passed');
