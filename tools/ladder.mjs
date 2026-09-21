import { Sim, PHASE } from '../src/game/sim.js';
import { createBotState, updateBot } from '../src/game/ai.js';
function play(seed, dA, dB) {
  const sim = new Sim({ mode:'singles', seed, players:[
    {id:'a',charId:'volley',team:0,bot:true},{id:'b',charId:'volley',team:1,bot:true}]});
  const bots = [createBotState(dA), createBotState(dB)];
  let ticks=0;
  while (sim.phase !== PHASE.GAMEOVER && ticks < 60*60*8) {
    const inputs=[];
    for (const p of sim.players) inputs[p.idx]=updateBot(sim,p,bots[p.idx],1/60);
    sim.step(1/60,inputs); sim.drainEvents(); ticks++;
  }
  return sim.winner;
}
const levels=[0.25,0.45,0.65,0.85];
console.log('reference bot = 0.55; win rate for each level over 14 games');
for (const L of levels) {
  let w=0, n=14;
  for (let s=0;s<n;s++) w += play(s*7717+1, L, 0.55)===0 ? 1 : 0;
  console.log(`  d=${L.toFixed(2)}  wins ${w}/${n}  (${(w/n*100).toFixed(0)}%)`);
}
