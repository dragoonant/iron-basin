// npm run bench:ai: AI v2 (normal) against random and against the one-pass simple AI, in both seats.
// Gates: normal beats random in at least 90% and simple in at least 65% of 200 battles each; replays are deterministic.
import { replay, runBattle } from '../src/sim/run';
import { hash as hashOf } from '../src/engine/step';
import type { Difficulty } from '../src/ai';
const n = 100;
const mission = process.argv.includes('--mission') ? process.argv[process.argv.indexOf('--mission') + 1]! : 'marrow-yard';
function pair(other: Difficulty): { hostileSeat: number; playerSeat: number; rate: number } {
  let hostileSeat = 0, playerSeat = 0;
  for (let seed = 1; seed <= n; seed++) {
    if (runBattle(seed, other, 'normal', false, 4000, mission).state.result?.winner === 'hostile') hostileSeat++;
    if (runBattle(seed, 'normal', other, false, 4000, mission).state.result?.winner === 'player') playerSeat++;
  }
  return { hostileSeat, playerSeat, rate: (hostileSeat + playerSeat) / (2 * n) };
}
const vr = pair('random'), vs = pair('simple');
const r = runBattle(7, 'normal', 'normal', false, 4000, mission);
const det = replay(7, r.actions, mission) === hashOf(r.state);
console.log(`mission: ${mission}`);
console.log(`| opponent | seat | battles | normal wins |\n|---|---|---|---|`);
for (const [name, p] of [['random', vr], ['simple', vs]] as const) {
  console.log(`| ${name} | hostile (normal vs ${name}) | ${n} | ${p.hostileSeat} |\n| ${name} | player (normal vs ${name}) | ${n} | ${p.playerSeat} |\n| ${name} | **both** | ${2 * n} | **${(100 * p.rate).toFixed(1)}%** |`);
}
console.log(`determinism (seed 7 replay): ${det ? 'ok' : 'FAIL'}`);
if (vr.rate < 0.9 || vs.rate < 0.65 || !det) process.exit(1);
