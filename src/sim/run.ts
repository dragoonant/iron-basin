// Headless battle runner with invariants (KB recipe step 5). The AI only ever sees view(state, side).
import { chooseAction, type Difficulty } from '../ai';
import { maxHp } from '../engine/query';
import { legalActions, newBattle, step, view, hash } from '../engine/step';
import type { Action, BattleState } from '../engine/types';

export function invariants(s: BattleState): string[] {
  const bad: string[] = [];
  if (!s.result && legalActions(s).length === 0) bad.push('ARCH-2 legalActions empty');
  if (JSON.stringify(JSON.parse(JSON.stringify(s))) !== JSON.stringify(s)) bad.push('ARCH-6 not plain JSON');
  const seen = new Set<string>();
  for (const u of s.units) {
    for (const p of ['body', 'armL', 'armR', 'legs'] as const) if (u.hp[p] < 0 || u.hp[p] > maxHp(u, p)) bad.push(`hp out of range ${u.id}.${p}`);
    if (!u.alive) continue;
    if (u.hp.body <= 0) bad.push(`dead body alive ${u.id}`);
    const k = `${u.x},${u.y}`;
    if (seen.has(k)) bad.push(`two walkers on ${k}`);
    seen.add(k);
    const t = s.tiles[u.y * s.w + u.x];
    if (!t || t.obj) bad.push(`walker on blocked tile ${u.id}`);
  }
  return bad;
}

export interface RunResult { state: BattleState; actions: Action[]; steps: number; violations: string[] }

export function runBattle(seed: number, player: Difficulty, hostile: Difficulty, check = true, maxSteps = 4000, mission = 'marrow-yard'): RunResult {
  let s = newBattle(mission, seed);
  const actions: Action[] = [];
  const violations: string[] = [];
  let steps = 0;
  while (!s.result && steps < maxSteps) {
    const a = chooseAction(view(s, s.phase), s.phase === 'player' ? player : hostile);
    const r = step(s, a);
    if (r.events[0]?.type === 'rejected') { violations.push(`AI action rejected: ${JSON.stringify(a)} ${r.events[0].reason}`); s = step(s, { type: 'endPhase' }).state; }
    else s = r.state;
    actions.push(a);
    steps++;
    if (check) violations.push(...invariants(s));
  }
  if (!s.result) violations.push('stall: no result');
  return { state: s, actions, steps, violations };
}

export function replay(seed: number, actions: Action[], mission = 'marrow-yard'): string {
  let s = newBattle(mission, seed);
  for (const a of actions) { const r = step(s, a); s = r.events[0]?.type === 'rejected' ? step(s, { type: 'endPhase' }).state : r.state; }
  return hash(s);
}
