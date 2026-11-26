// The AI reads view(state, side) only and is a pure function of it (ARCH-4). No DOM, no three.js.
// Combat v2 (spec 15): a walker spends its drive in one pass: walk to the best tile, fire the best package of modes the
// drive left allows, turn to face the threat, then stand down with the rest as reserve. AI v2 (slice 5f) replaces
// this with a search over whole sequences.
import { pack, RULES } from '../engine/data';
import { arcOf, dirTo, dist, hasCover, tileAt, type Pos } from '../engine/grid';
import {
  callable, cheapestMode, expectedDamage, faceToward, fireBlock, living, maxHp, modes, patchCost, pivotCost, returnFire,
  stats, walkRange, weapons, type ModeInfo,
} from '../engine/query';
import { hashText } from '../engine/rng';
import { legalActions } from '../engine/step';
import type { Action, BattleState, Facing, HitSlot, LastWalk, Side, Unit, WeaponSlot } from '../engine/types';

export type Difficulty = 'normal' | 'random';

interface Shot { slot: WeaponSlot; mode: string; target: Unit; part?: HitSlot; score: number; dp: number }
interface Plan { at: Pos; facing: Facing; path: Pos[]; shots: Shot[]; score: number }

/** The value the AI puts on one point of drive kept back (reserve buys return fire). */
const DP_VALUE = 4;

/** Distance field over passable tiles from every enemy (ignores walkers), for approach moves. */
function distanceField(s: BattleState, side: Side): number[] {
  const d = new Array<number>(s.w * s.h).fill(Infinity);
  const q: number[] = [];
  for (const e of s.units) if (e.alive && e.side !== side) { const i = e.y * s.w + e.x; d[i] = 0; q.push(i); }
  while (q.length) {
    const i = q.shift()!;
    const x = i % s.w, y = (i - x) / s.w;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = x + dx, ny = y + dy;
      const t = tileAt(s, nx, ny);
      if (!t || t.obj) continue;
      const j = ny * s.w + nx;
      if (d[j]! > d[i]! + 1) { d[j] = d[i]! + 1; q.push(j); }
    }
  }
  return d;
}

/** A fire order's worth: expected damage, kills, effects, minus the return fire it draws and the drive it costs. */
function shotScore(s: BattleState, u: Unit, mi: ModeInfo, t: Unit, at: Pos): number {
  const e = expectedDamage(s, u, mi.slot, mi.mode.id, t, at);
  let score = e;
  if (e >= t.hp.body * 0.9) score += 40; // likely kill
  const fx = mi.mode.effect;
  if (fx === 'pin') score += 8;
  if (fx === 'stagger') score += 5;
  if (fx === 'knockdown') score += 10;
  if (fx === 'push') score += 4;
  if (mi.cls !== 'indirect') {
    const rf = returnFire(s, t, u, at);
    if (rf) score -= 0.6 * expectedDamage(s, t, rf.slot, rf.mode.id, { ...u, x: at.x, y: at.y }, t, 'return');
  }
  if (mi.slot === 'P' && mi.weapon.ammo !== null) score -= 4; // keep a round back for a better shot
  score += (1 - t.hp.body / maxHp(t, 'body')) * 10; // finish the wounded
  return score - DP_VALUE * mi.dp;
}

/** The best single fire order for `u` standing at `at` with its current drive and fired slots. */
function bestShot(s: BattleState, u: Unit, at: Pos, skip: WeaponSlot[] = []): Shot | null {
  let best: Shot | null = null;
  const enemies = s.units.filter((e) => e.alive && e.side !== u.side);
  for (const mi of modes(u)) {
    if (mi.shots === 0 || mi.mode.target || skip.includes(mi.slot)) continue;
    for (const t of enemies) {
      if (fireBlock(s, u, mi.slot, mi.mode.id, t, at) !== null) continue;
      const part: HitSlot | undefined = mi.mode.call ? (callable(t, at).includes('pack') ? 'pack' : t.hp.body <= t.hp.legs ? 'body' : 'legs') : undefined;
      const sc = shotScore(s, u, mi, t, at) + (part === 'pack' ? 10 : 0);
      if (!best || sc > best.score) best = { slot: mi.slot, mode: mi.mode.id, target: t, part, score: sc, dp: mi.dp };
    }
  }
  return best;
}

/** Up to two fire orders with different weapons inside the drive (DRV-4), best first. */
function package_(s: BattleState, ghost: Unit, at: Pos): Shot[] {
  const first = bestShot(s, ghost, at);
  if (!first || first.score <= 0) return [];
  const g2 = { ...ghost, drive: ghost.drive - first.dp, fired: [...ghost.fired, first.slot] };
  const second = bestShot(s, g2, at);
  return second && second.score > 0 ? [first, second] : [first];
}

function threatAt(s: BattleState, u: Unit, at: Pos, facing: Facing): number {
  const ghost = { ...u, x: at.x, y: at.y, facing };
  let threat = 0;
  for (const e of s.units) {
    if (!e.alive || e.side === u.side) continue;
    const reach = stats(s, e).move;
    for (const w of weapons(e)) {
      if (!w.usable || w.def.class === 'indirect' || w.def.class === 'shield') continue;
      const mi = cheapestMode(e, w.slot);
      if (!mi || dist(e, at) > w.def.max + reach) continue;
      const main = modes(e).filter((m) => m.slot === w.slot && m.shots > 0).sort((a, b) => b.shots * b.dmg - a.shots * a.dmg)[0] ?? mi;
      threat += expectedDamage(s, e, w.slot, main.mode.id, ghost, { x: e.x, y: e.y }) * 0.5;
    }
  }
  return threat;
}

function walkInfo(u: Unit, path: Pos[]): LastWalk {
  const dirs: Facing[] = [];
  for (let i = 1; i < path.length; i++) dirs.push(dirTo(path[i - 1]!, path[i]!)!);
  return { from: { x: u.x, y: u.y }, facing: u.facing, dp: RULES.drive.walk, dir: dirs.length && dirs.every((d) => d === dirs[0]) ? dirs[0]! : null, steps: dirs.length, reacted: false, wasWalked: u.walked };
}

function bestPlan(s: BattleState, u: Unit, field: number[]): Plan {
  const stay = { x: u.x, y: u.y, path: [{ x: u.x, y: u.y }] };
  const tiles = u.walked ? [stay] : [stay, ...walkRange(s, u).filter((r) => r.x !== u.x || r.y !== u.y)];
  const holding = u.role === 'commander' && s.round < 4 && !s.units.some((e) => e.alive && e.side !== u.side && dist(e, u) <= 7);
  const enemies = s.units.filter((e) => e.alive && e.side !== u.side);
  const ranged = u.role === 'rifle' || u.role === 'mortar';
  let best: Plan | null = null;
  for (const r of tiles) {
    const at = { x: r.x, y: r.y };
    const moving = at.x !== u.x || at.y !== u.y;
    if (holding && dist(at, u) > 1) continue;
    const ghost: Unit = moving ? { ...u, x: at.x, y: at.y, drive: u.drive - RULES.drive.walk, walked: true, lastWalk: walkInfo(u, r.path) } : u;
    const facing = faceToward(s, u, at);
    const shots = ghost.drive > 0 ? package_(s, ghost, at) : [];
    const coverBonus = enemies.reduce((a, e) => a + (hasCover(s, e, at) ? 3 : 0), 0);
    const threat = threatAt(s, u, at, facing) * (ranged ? 0.35 : 0.2);
    const high = (tileAt(s, at.x, at.y)?.h ?? 0) * 3;
    let score = shots.reduce((a, sh) => a + sh.score, 0) + coverBonus + high - threat - (moving ? DP_VALUE * 0.5 : 0);
    if (!shots.length) {
      // No shot from here: approach, preferring cover and lower threat.
      const d = field[at.y * s.w + at.x] ?? Infinity;
      const keepOff = ranged ? Math.abs(d - 4) * 3 : d * 3;
      score = -1000 - keepOff + coverBonus - threat * 0.3 + high;
    }
    if (!best || score > best.score) best = { at, facing, path: r.path, shots, score };
  }
  return best ?? { at: { x: u.x, y: u.y }, facing: u.facing, path: [], shots: [], score: 0 };
}

function patchPlan(s: BattleState, u: Unit): Action | null {
  if (pack(u.build.pack).kind !== 'repair' || u.status.packOut || u.charges <= 0 || u.drive < patchCost()) return null;
  let bestA: Action | null = null, bestMissing = 25;
  for (const t of living(s, u.side)) {
    if (dist(u, t) > 1) continue;
    for (const p of ['body', 'legs', 'armR', 'armL'] as const) {
      const miss = maxHp(t, p) - t.hp[p];
      const w = p === 'body' ? miss * 1.5 : miss;
      if (t.hp[p] > 0 && w > bestMissing) { bestMissing = w; bestA = { type: 'patch', unit: u.id, target: t.id, part: p }; }
    }
  }
  return bestA;
}

/** One order for walker `u`. Every branch changes the state, so a phase always ends. */
function orderFor(s: BattleState, u: Unit, field: number[]): Action {
  const heal = u.walked ? patchPlan(s, u) : null;
  if (heal) return heal;
  if (!u.walked && u.drive >= RULES.drive.walk) {
    const plan = bestPlan(s, u, field);
    if (plan.at.x !== u.x || plan.at.y !== u.y) return { type: 'walk', unit: u.id, x: plan.at.x, y: plan.at.y, facing: plan.facing };
  }
  const shot = bestShot(s, u, u, u.fired);
  if (shot && shot.score > 0) return { type: 'fire', unit: u.id, slot: shot.slot, mode: shot.mode, target: shot.target.id, ...(shot.part ? { part: shot.part } : {}) };
  const heal2 = patchPlan(s, u);
  if (heal2) return heal2;
  // Turn to face the threat: always when one stands behind, otherwise only with drive to spare for reserve.
  const want = faceToward(s, u, u);
  if (want !== u.facing && u.drive >= pivotCost()) {
    const behind = s.units.some((e) => e.alive && e.side !== u.side && dist(e, u) <= 6 && arcOf(u, u.facing, e) === 'rear');
    if (behind || u.drive >= pivotCost() + 1) return { type: 'pivot', unit: u.id, facing: want };
  }
  return { type: 'standDown', unit: u.id };
}

function normal(v: BattleState): Action {
  const side = v.phase;
  const field = distanceField(v, side);
  const ready = living(v, side).filter((u) => !u.done);
  if (!ready.length) return { type: 'endPhase' };
  ready.sort((a, b) => (field[a.y * v.w + a.x]! - field[b.y * v.w + b.x]!) || a.id.localeCompare(b.id));
  return orderFor(v, ready[0]!, field);
}

function random(v: BattleState): Action {
  const acts = legalActions(v);
  const nonEnd = acts.filter((a) => a.type !== 'endPhase' && a.type !== 'undoWalk' && a.type !== 'fireAt');
  const r = parseInt(hashText(JSON.stringify(v.units) + v.turnCount), 16) / 4294967296;
  if (!nonEnd.length) return { type: 'endPhase' };
  return nonEnd[Math.floor(r * nonEnd.length)]!;
}

/** One action for the side to act, from its view. */
export function chooseAction(v: BattleState, difficulty: Difficulty = 'normal'): Action {
  return difficulty === 'random' ? random(v) : normal(v);
}
