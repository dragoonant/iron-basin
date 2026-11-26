// npm run sim [-- --n 200]: AI-vs-AI battles on Marrow Yard with invariants; prints the balance table and how often
// each order is used (combat v2: a mode nobody picks is redesigned or cut, docs/combat-v2.md section 10).
import { runBattle } from '../src/sim/run';
const n = Number(process.argv[process.argv.indexOf('--n') + 1]) || 200;
let win = 0, viol = 0, rounds = 0, lostP = 0, lostH = 0, timeouts = 0, salv = 0;
const roundHist: number[] = [];
const use: Record<string, number> = {};
let orders = 0;
for (let seed = 1; seed <= n; seed++) {
  const r = runBattle(seed, 'normal', 'normal', seed <= 40);
  if (r.violations.length) { viol++; if (viol <= 3) console.log('seed', seed, r.violations.slice(0, 3)); }
  const res = r.state.result!;
  if (res?.winner === 'player') { win++; salv += res.salvage.length; }
  if (res?.reason === 'timeout') timeouts++;
  rounds += res?.rounds ?? 0; roundHist.push(res?.rounds ?? 0);
  lostP += res?.lost.player ?? 0; lostH += res?.lost.hostile ?? 0;
  for (const a of r.actions) {
    if (a.type === 'endPhase' || a.type === 'standDown') continue;
    const k = a.type === 'fire' || a.type === 'fireAt' ? `${a.mode}` : a.type;
    use[k] = (use[k] ?? 0) + 1; orders++;
  }
}
roundHist.sort((a, b) => a - b);
console.log(`| battles | player win | timeouts | median rounds | player walkers lost | hostile lost | salvage per win | violations |`);
console.log(`|---|---|---|---|---|---|---|---|`);
console.log(`| ${n} | ${(100 * win / n).toFixed(1)}% | ${timeouts} | ${roundHist[Math.floor(n / 2)]} | ${(lostP / n).toFixed(2)} | ${(lostH / n).toFixed(2)} | ${(salv / Math.max(1, win)).toFixed(1)} | ${viol} |`);
console.log(`orders used (share of ${orders} non-end orders): ${Object.entries(use).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${(100 * v / orders).toFixed(1)}%`).join(', ')}`);
if (viol) process.exit(1);
