// npm run action-fuzz: random and malformed actions must never throw and never break an invariant (ARCH-1, ARCH-2).
import { invariants } from '../src/sim/run';
import { legalActions, newBattle, step } from '../src/engine/step';
import { next, seedRng } from '../src/engine/rng';
import type { Action } from '../src/engine/types';
let bad = 0, steps = 0;
for (let seed = 1; seed <= 60; seed++) {
  let s = newBattle(seed % 2 ? 'marrow-yard' : 'kerrow-locks', seed);
  const r = seedRng(seed * 7919);
  for (let i = 0; i < 400 && !s.result; i++) {
    const legal = legalActions(s);
    let a: Action = legal[Math.floor(next(r) * legal.length)]!;
    if (next(r) < 0.15) a = ({ type: ['move', 'attack', 'repair', 'wait', 'undoMove', 'attackObject', 'bogus'][Math.floor(next(r) * 7)], unit: s.units[Math.floor(next(r) * s.units.length)]!.id, x: Math.floor(next(r) * 20) - 3, y: Math.floor(next(r) * 22) - 3, slot: 'P', target: 'dir-2', part: 'legs' } as unknown) as Action;
    try { s = step(s, a).state; } catch (e) { bad++; console.log('threw', e); }
    const v = invariants(s); if (v.length) { bad++; console.log(seed, v); }
    steps++;
  }
}
console.log(`action-fuzz: ${steps} steps, ${bad} failures`);
if (bad) process.exit(1);
