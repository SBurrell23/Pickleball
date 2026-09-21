// Headless rules + balance harness. Run with: node tools/simtest.mjs
import { Sim, PHASE } from '../src/game/sim.js';
import { createBotState, updateBot } from '../src/game/ai.js';

function playGame(seed, diffs, mode = 'singles', verbose = false) {
  const players = mode === 'doubles'
    ? [
        { id: 'a1', charId: 'volley', team: 0, bot: true },
        { id: 'b1', charId: 'zip', team: 1, bot: true },
        { id: 'a2', charId: 'smash', team: 0, bot: true },
        { id: 'b2', charId: 'pip', team: 1, bot: true },
      ]
    : [
        { id: 'a', charId: 'volley', team: 0, bot: true },
        { id: 'b', charId: 'zip', team: 1, bot: true },
      ];
  const sim = new Sim({ mode, players, seed, pointsToWin: 11 });
  const bots = sim.players.map((p) => createBotState(diffs[p.team]));
  const stats = {
    rallies: [], reasons: {}, hits: 0, quality: {}, shots: {}, ticks: 0,
    serves: 0, serveFaults: 0, returns: 0, thirds: 0,
  };
  const dt = 1 / 60;

  while (sim.phase !== PHASE.GAMEOVER && stats.ticks < 60 * 60 * 12) {
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

console.log('\n=== doubles smoke test ===');
const dbl = playGame(31337, [0.6, 0.6], 'doubles');
console.log(`  final ${dbl.sim.score[0]}-${dbl.sim.score[1]} winner=${dbl.sim.winner} ` +
  `avg rally=${(dbl.stats.rallies.reduce((a, b) => a + b, 0) / dbl.stats.rallies.length).toFixed(2)}`);
console.log('  reasons:', JSON.stringify(dbl.stats.reasons));

// ---- assertions -----------------------------------------------------------
// The bands are deliberately wide: the AI uses unseeded randomness, so these
// catch real regressions (rallies that never end, games that cannot finish,
// difficulty that stopped mattering) without being flaky.
const dblAvg = dbl.stats.rallies.reduce((a, b) => a + b, 0) / dbl.stats.rallies.length;
const failures = [];
const check = (ok, msg) => { if (!ok) failures.push(msg); };

const finished = wins[0] + wins[1];
check(finished >= 7, `only ${finished}/8 singles games reached a winner`);
check(avg >= 3 && avg <= 20, `avg shots/rally ${avg.toFixed(2)} outside the playable band 3-20`);
check(totalR >= 60, `only ${totalR} rallies across 8 games -- points are ending too fast`);
check(gapWins[0] >= 6, `strong bot won only ${gapWins[0]}/8 against a much weaker one`);
check(dbl.sim.winner >= 0, 'doubles game never reached a winner');
check(dblAvg >= 3 && dblAvg <= 20, `doubles avg rally ${dblAvg.toFixed(2)} outside 3-20`);
// Every point ending the same way would mean a rule or the AI has broken.
const topReason = Math.max(...Object.values(allReasons));
check(topReason / totalR < 0.9,
  'over 90% of points ended for a single reason -- something is degenerate');
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
