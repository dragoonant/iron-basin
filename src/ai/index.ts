// The AI reads view(state, side) only and is a pure function of it (ARCH-4). No DOM, no three.js.
// normal: AI v2, a planner over whole turns (plan.ts). simple: the one-pass AI it replaced (simple.ts). random: any legal order.
import { hashText } from '../engine/rng';
import { legalActions } from '../engine/step';
import type { Action, BattleState } from '../engine/types';
import { planOrder } from './plan';
import { simpleOrder } from './simple';

export type Difficulty = 'normal' | 'simple' | 'random';

function random(v: BattleState): Action {
  const acts = legalActions(v);
  const nonEnd = acts.filter((a) => a.type !== 'endPhase' && a.type !== 'undoWalk' && a.type !== 'fireAt');
  const r = parseInt(hashText(JSON.stringify(v.units) + v.turnCount), 16) / 4294967296;
  if (!nonEnd.length) return { type: 'endPhase' };
  return nonEnd[Math.floor(r * nonEnd.length)]!;
}

/** One action for the side to act, from its view. */
export function chooseAction(v: BattleState, difficulty: Difficulty = 'normal'): Action {
  return difficulty === 'random' ? random(v) : difficulty === 'simple' ? simpleOrder(v) : planOrder(v);
}
