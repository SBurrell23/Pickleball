// Round-robin between the six roster characters at equal bot skill, plus a
// single-stat sensitivity sweep. Answers two questions: is any character
// dominant, and does each stat measurably change outcomes?
import { Sim, PHASE } from '../src/game/sim.js';
import { createBotState, updateBot } from '../src/game/ai.js';
import { CHARACTERS } from '../src/game/characters.js';

function play(seed, charA, charB, d = 0.6) {
  const sim = new Sim({ mode: 'singles', seed, players: [
    { id: 'a', charId: charA, team: 0, bot: true },
    { id: 'b', charId: charB, team: 1, bot: true }]});
  const bots = sim.players.map(() => createBotState(d));
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

// Each pairing is played both ways so the serve advantage cancels out.
console.log('=== roster round-robin (8 games per ordered pairing) ===');
const rec = Object.fromEntries(CHARACTERS.map((c) => [c.id, { w: 0, n: 0 }]));
let seed = 1;
for (const a of CHARACTERS) {
  for (const b of CHARACTERS) {
    if (a.id === b.id) continue;
    for (let k = 0; k < 8; k++) {
      const w = play(seed++ * 6151, a.id, b.id);
      if (w < 0) continue;
      rec[a.id].n++; rec[b.id].n++;
      if (w === 0) rec[a.id].w++; else rec[b.id].w++;
    }
  }
}
const rows = CHARACTERS.map((c) => ({
  id: c.id, pct: rec[c.id].n ? (rec[c.id].w / rec[c.id].n) * 100 : 0, n: rec[c.id].n,
})).sort((x, y) => y.pct - x.pct);
for (const r of rows) console.log(`  ${r.id.padEnd(8)} ${r.pct.toFixed(1)}%  (${r.n} games)`);
const spread = rows[0].pct - rows[rows.length - 1].pct;
console.log(`  spread: ${spread.toFixed(1)} points between best and worst`);

// Sensitivity: clone the baseline character, move ONE stat, and see whether it
// beats its unmodified twin. If a stat does nothing, this sits at 50%.
console.log('\n=== single-stat sensitivity vs an identical twin ===');
const base = CHARACTERS.find((c) => c.id === 'volley');
for (const stat of ['speed', 'reach', 'control', 'drive', 'dink']) {
  for (const mult of [1.25, 0.75]) {
    const id = `probe_${stat}_${mult}`;
    CHARACTERS.push({
      ...base, id,
      stats: { ...base.stats, [stat]: base.stats[stat] * mult },
    });
    // characters.js keys off CHAR_BY_ID, so re-export lookup must see it.
    const mod = await import('../src/game/characters.js');
    mod.CHAR_BY_ID[id] = CHARACTERS[CHARACTERS.length - 1];
    let w = 0, n = 0;
    for (let k = 0; k < 40; k++) {
      const win = play(k * 7919 + 13, id, 'volley');
      if (win < 0) continue;
      n++; if (win === 0) w++;
    }
    console.log(`  ${stat.padEnd(8)} x${mult}  wins ${((w / n) * 100).toFixed(0)}%  (${n} games)`);
    CHARACTERS.pop();
    delete mod.CHAR_BY_ID[id];
  }
}
