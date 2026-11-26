// query.* owns every number the client shows (ARCH-3). Combat v2: spec 15 (DRV, HIT, MOD, FAC, RCT).
import { arm, body, legs, maneuver, pack, pilot, RULES, weapon, type ModeDef, type WeaponDef } from './data';
import { ahead, arcOf, dist, DIR, FACINGS, hasCover, hasLos, reachable, tileAt, type Pos, type Reach } from './grid';
import type { Arc, BattleState, Facing, HitSlot, PartSlot, Reaction, Unit, WeaponSlot } from './types';

export const unitById = (s: BattleState, id: string): Unit | null => s.units.find((u) => u.id === id) ?? null;
export const living = (s: BattleState, side: Unit['side']): Unit[] => s.units.filter((u) => u.alive && u.side === side);
export const hpTotal = (u: Unit): number => u.hp.body + u.hp.armL + u.hp.armR + u.hp.legs;

export function maxHp(u: Pick<Unit, 'build'>, part: PartSlot): number {
  if (part === 'body') return body(u.build.body).hp;
  if (part === 'legs') return legs(u.build.legs).hp;
  return arm(part === 'armL' ? u.build.armL : u.build.armR).hp;
}

export interface Stats { move: number; evade: number; weight: number; power: number; overweight: boolean; drive: number }

/** WLK-2, WLK-3, MAP-6, PIL-2, DRV-7 (overweight costs drive, not move), FLD-2 (knocked down: evasion 0). */
export function stats(s: BattleState | null, u: Pick<Unit, 'build' | 'pilot' | 'hp'> & Partial<Pick<Unit, 'x' | 'y' | 'status'>>): Stats {
  const b = body(u.build.body), l = legs(u.build.legs), p = pack(u.build.pack);
  const weight = b.weight + arm(u.build.armL).weight + arm(u.build.armR).weight + l.weight + p.weight + (weapon(u.build.wL)?.weight ?? 0) + (weapon(u.build.wR)?.weight ?? 0);
  const overweight = weight > b.power;
  let move = l.move;
  let evade = l.evade + pilot(u.pilot).evade - (overweight ? RULES.overweightEvade : 0);
  if (u.hp.legs <= 0) { move = 1; evade = 0; }
  if (s && u.x !== undefined && u.y !== undefined) { const t = tileAt(s, u.x, u.y); if (t?.t === 'water' && u.hp.legs > 0) evade -= RULES.waterEvade; }
  if (u.status?.down) evade = 0;
  return { move: Math.max(1, move), evade, weight, power: b.power, overweight, drive: Math.max(0, b.drive - (overweight ? RULES.drive.overweight : 0)) };
}

/** DRV-1: drive at the start of the walker's next phase. */
export function driveAtStart(u: Unit): number {
  const d = RULES.drive;
  let n = stats(null, u).drive;
  if (u.status.pinned) n -= d.pinned;
  if (u.status.staggered) n -= d.staggered;
  if (u.status.mired) n -= d.mired;
  if (u.status.down) n -= d.knockedDown;
  return Math.max(0, n);
}

export const steady = (u: Pick<Unit, 'nerve'>): boolean => u.nerve >= RULES.nerve.steady;
export const shaken = (u: Pick<Unit, 'nerve'>): boolean => u.nerve <= RULES.nerve.shaken;

export interface WeaponInfo { slot: WeaponSlot; id: string; def: WeaponDef; usable: boolean; ammo: number | null }

/** The walker's weapons by slot; `usable` folds in lost arms (WLK-3) and ammunition (ATK-6). */
export function weapons(u: Unit): WeaponInfo[] {
  const out: WeaponInfo[] = [];
  const add = (slot: WeaponSlot, id: string | null, armUp: boolean, ammo: number | null) => {
    const def = weapon(id);
    if (!def || !id) return;
    out.push({ slot, id, def, usable: armUp && (ammo === null || ammo > 0), ammo });
  };
  add('R', u.build.wR, u.hp.armR > 0, null);
  add('L', u.build.wL, u.hp.armL > 0, null);
  const p = pack(u.build.pack);
  if (p.kind === 'weapon' && p.weapon) add('P', p.weapon, !u.status.packOut, u.ammo);
  return out;
}

export const weaponIn = (u: Unit, slot: WeaponSlot): WeaponInfo | null => weapons(u).find((w) => w.slot === slot) ?? null;

export type FireClass = 'direct' | 'melee' | 'indirect';
/** A weapon's mode with its numbers resolved (HIT-1, HIT-4, MOD-1). */
export interface ModeInfo {
  slot: WeaponSlot; weapon: WeaponInfo; mode: ModeDef;
  cls: FireClass; min: number; max: number; shots: number; acc: number; dmg: number; dp: number;
}

export function resolveMode(w: WeaponInfo, m: ModeDef): ModeInfo {
  const c = m.class ?? w.def.class;
  const cls: FireClass = c === 'melee' ? 'melee' : c === 'indirect' ? 'indirect' : 'direct';
  return {
    slot: w.slot, weapon: w, mode: m, cls,
    min: m.min ?? w.def.min, max: m.max ?? w.def.max, shots: m.shots,
    acc: m.baseAcc ?? w.def.acc + (m.acc ?? 0),
    dmg: m.baseDmg ?? w.def.dmg * (m.dmg ?? 1),
    dp: m.dp,
  };
}

export function modes(u: Unit): ModeInfo[] {
  const out: ModeInfo[] = [];
  for (const w of weapons(u)) for (const m of w.def.modes ?? []) out.push(resolveMode(w, m));
  return out;
}
export const modeIn = (u: Unit, slot: WeaponSlot, id: string): ModeInfo | null => modes(u).find((m) => m.slot === slot && m.mode.id === id) ?? null;

/** RCT-2, RCT-3: a weapon's cheapest firing mode (lowest dp with shots, first listed on a tie). */
export function cheapestMode(u: Unit, slot: WeaponSlot): ModeInfo | null {
  let best: ModeInfo | null = null;
  for (const m of modes(u)) if (m.slot === slot && m.shots > 0 && (!best || m.dp < best.dp)) best = m;
  return best;
}

const packUp = (u: Unit): boolean => pack(u.build.pack).kind !== 'none' && !u.status.packOut;

/** ATK-7: an ally with a working sensor pack sees the target within its sensor range. */
export function spotted(s: BattleState, side: Unit['side'], target: Pos, exclude?: string): boolean {
  return s.units.some((a) => {
    if (!a.alive || a.side !== side || a.id === exclude || a.status.packOut) return false;
    const p = pack(a.build.pack);
    return p.kind === 'sensor' && dist(a, target) <= (p.sensorRange ?? 0) && hasLos(s, a, target);
  });
}

/** ATK-5: indirect fire sees what the firer or any ally sees. */
export function indirectSight(s: BattleState, u: Unit, at: Pos, target: Pos): boolean {
  if (hasLos(s, at, target)) return true;
  return s.units.some((a) => a.alive && a.side === u.side && a.id !== u.id && hasLos(s, a, target));
}

/** Range and sight only (MOD-1): used by orders and by reactions, which ignore the own-phase budget. */
export function reaches(s: BattleState, u: Unit, mi: ModeInfo, target: Pos, at: Pos = u): boolean {
  const d = dist(at, target);
  if (d < mi.min || d > mi.max) return false;
  return mi.cls === 'indirect' ? indirectSight(s, u, at, target) : hasLos(s, at, target);
}

/** MOD-5. */
function needsMet(s: BattleState, u: Unit, mi: ModeInfo, target: Unit): string | null {
  const n = mi.mode.needs;
  if (n === 'still' && u.walked) return 'only before walking this phase';
  if (n === 'charge') {
    const lw = u.lastWalk;
    if (!lw || !lw.dir || lw.steps < 2) return 'needs a straight walk of 2 tiles first';
    const p = ahead(u, lw.dir);
    if (p.x !== target.x || p.y !== target.y) return 'the target must stand straight ahead of the walk';
  }
  if (n === 'marked') return 'the target must be marked (slice 5c)';
  return null;
}

/** Why `u` (standing at `at`) cannot give this fire order at the walker `target`; null if it can (MOD-1, DRV-2, DRV-4). */
export function fireBlock(s: BattleState, u: Unit, slot: WeaponSlot, modeId: string, target: Unit, at: Pos = u): string | null {
  const mi = modeIn(u, slot, modeId);
  if (!u.alive || !mi) return 'no such mode';
  if (!mi.weapon.usable) return mi.weapon.ammo === 0 ? 'out of ammunition' : 'arm lost';
  if (u.done) return 'stood down';
  if (u.fired.includes(slot)) return 'this weapon has given its order this phase';
  if (u.drive < mi.dp) return `needs ${mi.dp} drive`;
  if (!target.alive) return 'target is down';
  if (mi.mode.target === 'tile') return 'aims at a tile';
  if (mi.mode.target === 'ally') {
    if (target.side !== u.side || target.id === u.id) return 'guards an ally';
    return dist(at, target) === 1 ? null : 'the ally must be adjacent';
  }
  if (target.side === u.side) return 'not an enemy';
  if (!reaches(s, u, mi, target, at)) return dist(at, target) < mi.min || dist(at, target) > mi.max ? 'out of range' : 'no line of sight';
  return needsMet(s, u, mi, target);
}
export const canFire = (s: BattleState, u: Unit, slot: WeaponSlot, modeId: string, target: Unit, at: Pos = u): boolean => fireBlock(s, u, slot, modeId, target, at) === null;

/** Can any firing mode of `u` reach `target` (for the board's red squares)? */
export function canHitAny(s: BattleState, u: Unit, target: Unit, at: Pos = u): boolean {
  return modes(u).some((m) => m.shots > 0 && canFire(s, u, m.slot, m.mode.id, target, at));
}

/** HIT-1, HIT-2: one roll's chance. */
export function hitChance(s: BattleState, u: Unit, slot: WeaponSlot, modeId: string, target: Unit, at: Pos = u, reaction: Reaction | null = null): number {
  const mi = modeIn(u, slot, modeId);
  if (!mi) return 0;
  let c = mi.acc + (slot === 'P' ? 0 : arm(slot === 'L' ? u.build.armL : u.build.armR).acc) + pilot(u.pilot).skill;
  const ht = tileAt(s, at.x, at.y)?.h ?? 0, tt = tileAt(s, target.x, target.y)?.h ?? 0;
  if (ht > tt) c += RULES.heightBonus;
  if (mi.cls !== 'indirect') {
    const arc = arcOf(target, target.facing, at);
    if (arc === 'rear') c += RULES.facing.rearHit;
    else if (arc !== 'front') c += RULES.facing.sideHit;
  } else if (spotted(s, u.side, target, u.id)) c += RULES.spotterBonus;
  if (steady(u)) c += RULES.nerve.steadyHit;
  if (shaken(u)) c -= RULES.nerve.shakenHit;
  if (u.status.suppressed) c -= RULES.pinnedHit;
  if (mi.cls !== 'indirect' && !mi.mode.ignoreCover && hasCover(s, at, target)) c -= RULES.coverPenalty;
  c -= stats(s, target).evade;
  if (reaction === 'return') c -= RULES.counterPenalty;
  return Math.max(RULES.hitMin, Math.min(RULES.hitMax, Math.round(c)));
}

/** HIT-3, FAC-3: the hit-location weights for a roll from `arc`. */
export function hitWeights(cls: FireClass, arc: Arc, target: Unit): Record<HitSlot, number> {
  if (cls === 'indirect' || arc === 'rear' || target.status.down) {
    const r = RULES.hitWeights.rear;
    const p = packUp(target) ? r.pack : 0;
    return { body: r.body + (r.pack - p), armL: r.armL, armR: r.armR, legs: r.legs, pack: p };
  }
  const w = RULES.hitWeights[cls];
  const out: Record<HitSlot, number> = { body: w.body, armL: w.armL, armR: w.armR, legs: w.legs, pack: 0 };
  if (arc === 'left') out.armL *= RULES.facing.sideArmFactor;
  if (arc === 'right') out.armR *= RULES.facing.sideArmFactor;
  return out;
}

/** FAC-5: the share a left-hand shield cuts from a hit on `part`. */
export function shieldCut(u: Unit, part: HitSlot, cls: FireClass, arc: Arc): number {
  if (part !== 'body' && part !== 'armL') return 0;
  if (cls === 'indirect' || (arc !== 'front' && arc !== 'left')) return 0;
  const sh = weapon(u.build.wL);
  if (!sh || sh.class !== 'shield' || u.hp.armL <= 0) return 0;
  return (sh.guard ?? 0) / 100;
}

/** MOD-4: parts an order may call against `target` from `at`. */
export function callable(target: Unit, at: Pos): HitSlot[] {
  const out: HitSlot[] = ['body', 'armL', 'armR', 'legs'];
  if (arcOf(target, target.facing, at) === 'rear' && packUp(target)) out.push('pack');
  return out;
}

/** HIT-4 with FAC-5: the damage range of one hit on `part`. */
export function damageRange(s: BattleState | null, u: Unit, slot: WeaponSlot, modeId: string, target: Unit | null, at: Pos = u, part: HitSlot = 'body'): [number, number] {
  const mi = modeIn(u, slot, modeId);
  if (!mi) return [0, 0];
  let lo = Math.round(mi.dmg * RULES.dmgSpread[0]), hi = Math.round(mi.dmg * RULES.dmgSpread[1]);
  if (target) {
    const g = shieldCut(target, part, mi.cls, arcOf(target, target.facing, at));
    lo = Math.max(1, Math.round(lo * (1 - g))); hi = Math.max(1, Math.round(hi * (1 - g)));
  }
  void s;
  return [lo, hi];
}

export function expectedDamage(s: BattleState, u: Unit, slot: WeaponSlot, modeId: string, target: Unit, at: Pos = u, reaction: Reaction | null = null): number {
  const mi = modeIn(u, slot, modeId);
  if (!mi || mi.shots === 0) return 0;
  const p = hitChance(s, u, slot, modeId, target, at, reaction) / 100;
  const arc = arcOf(target, target.facing, at);
  const w = hitWeights(mi.cls, arc, target);
  const total = w.body + w.armL + w.armR + w.legs + w.pack;
  const cut = ((w.body + w.armL) / total) * shieldCut(target, 'body', mi.cls, arc);
  return mi.shots * p * mi.dmg * (1 - cut);
}

/** RCT-2: the return fire `target` would give an attack from `attackerAt`, if any. */
export function returnFire(s: BattleState, target: Unit, attacker: Unit, attackerAt: Pos = attacker): ModeInfo | null {
  if (!target.alive || target.reserve < 1 || target.holdFire || target.status.down || shaken(target)) return null;
  if (arcOf(target, target.facing, attackerAt) !== 'front') return null;
  const ghost = { ...attacker, x: attackerAt.x, y: attackerAt.y };
  let best: ModeInfo | null = null, bestDmg = 0;
  for (const slot of ['R', 'L'] as const) {
    const w = weaponIn(target, slot);
    if (!w || !w.usable || w.def.class === 'shield' || w.def.class === 'indirect') continue;
    const mi = cheapestMode(target, slot);
    if (!mi || !reaches(s, target, mi, attackerAt)) continue;
    const e = expectedDamage(s, target, slot, mi.mode.id, ghost, target, 'return');
    if (e > bestDmg) { bestDmg = e; best = mi; }
  }
  return best;
}

/** RCT-4: the guard that takes hits aimed at `target` from `attacker`, if any. */
export function guardFor(s: BattleState, attacker: Pos, target: Unit, cls: FireClass): Unit | null {
  if (cls === 'indirect') return null;
  for (const g of [...s.units].sort((a, b) => a.id.localeCompare(b.id))) {
    if (!g.alive || g.side !== target.side || g.id === target.id || !g.guarding.includes(target.id)) continue;
    if (dist(g, target) !== 1 || g.hp.armL <= 0 || weapon(g.build.wL)?.class !== 'shield') continue;
    if (arcOf(g, g.facing, attacker) !== 'front') continue;
    return g;
  }
  return null;
}

/** RCT-3: the tiles of a walker's lane. */
export function laneTiles(s: BattleState, u: Unit): Pos[] {
  if (!u.overwatch) return [];
  const w = weaponIn(u, u.overwatch.slot);
  const out: Pos[] = [];
  for (let n = 1; n <= (w?.def.max ?? 0); n++) { const p = ahead(u, u.overwatch.dir, n); if (!tileAt(s, p.x, p.y)) break; out.push(p); }
  return out;
}

/** RCT-3, RCT-7: enemies of `walker` whose overwatch fires when it enters `p`, nearest first, then by id. */
export function overwatchers(s: BattleState, walker: Unit, p: Pos): Unit[] {
  const out: Unit[] = [];
  for (const o of s.units) {
    if (!o.alive || o.side === walker.side || !o.overwatch || o.reserve < 1 || o.status.down || shaken(o)) continue;
    if (!laneTiles(s, o).some((t) => t.x === p.x && t.y === p.y)) continue;
    const w = weaponIn(o, o.overwatch.slot);
    const mi = cheapestMode(o, o.overwatch.slot);
    if (!w || !w.usable || !mi || !reaches(s, o, mi, p)) continue;
    if (arcOf(o, o.facing, p) !== 'front') continue;
    out.push(o);
  }
  return out.sort((a, b) => dist(a, p) - dist(b, p) || a.id.localeCompare(b.id));
}

export interface Preview {
  dp: number;
  chance: number;
  shots: number;
  dmg: [number, number];
  arc: Arc;
  cover: boolean;
  spotted: boolean;
  effect: ModeDef['effect'] | null;
  guardedBy: string | null;
  counter: { slot: WeaponSlot; weapon: string; mode: string; chance: number; shots: number; dmg: [number, number] } | null;
}

/** ARCH-3: everything the attack panel shows for one mode. Null when the order is not possible. */
export function preview(s: BattleState, u: Unit, slot: WeaponSlot, modeId: string, target: Unit, part: HitSlot = 'body'): Preview | null {
  const mi = modeIn(u, slot, modeId);
  if (!mi || fireBlock(s, u, slot, modeId, target) !== null || mi.mode.target) return null;
  const arc = arcOf(target, target.facing, u);
  let counter: Preview['counter'] = null;
  if (mi.cls !== 'indirect' && mi.shots > 0) {
    const rf = returnFire(s, target, u);
    if (rf) counter = { slot: rf.slot, weapon: rf.weapon.def.name, mode: rf.mode.name, chance: hitChance(s, target, rf.slot, rf.mode.id, u, target, 'return'), shots: rf.shots, dmg: damageRange(s, target, rf.slot, rf.mode.id, u, target) };
  }
  return {
    dp: mi.dp,
    chance: hitChance(s, u, slot, modeId, target),
    shots: mi.shots,
    dmg: damageRange(s, u, slot, modeId, target, u, mi.mode.call ? part : 'body'),
    arc,
    cover: mi.cls !== 'indirect' && !mi.mode.ignoreCover && hasCover(s, u, target),
    spotted: mi.cls === 'indirect' && spotted(s, u.side, target, u.id),
    effect: mi.mode.effect ?? null,
    guardedBy: guardFor(s, u, target, mi.cls)?.id ?? null,
    counter,
  };
}

/** DRV-3: where a walk can end. */
export function walkRange(s: BattleState, u: Unit): Reach[] {
  if (!u.alive || u.done || u.drive < RULES.drive.walk) return [];
  return reachable(s, u, stats(s, u).move);
}
export const moveRange = walkRange;

export const pivotCost = (): number => maneuver('pivot')?.dp ?? 1;
export const patchCost = (): number => maneuver('patch')?.dp ?? 2;

/** A suggested facing at `at`: the most enemies in front, nearest weighted most. Used for default walk facings. */
export function faceToward(s: BattleState, u: Unit, at: Pos = u): Unit['facing'] {
  let best: Facing = u.facing, bestScore = -Infinity;
  for (const f of FACINGS) {
    let sc = 0;
    for (const e of s.units) {
      if (!e.alive || e.side === u.side) continue;
      const wgt = 1 / (1 + dist(at, e));
      const arc = arcOf(at, f, e);
      sc += wgt * (arc === 'front' ? 2 : arc === 'rear' ? -1.5 : 0.3);
    }
    sc += f === u.facing ? 1e-6 : 0;
    if (sc > bestScore) { bestScore = sc; best = f; }
  }
  return best;
}

/** The direction of each step's travel, for walks the board animates. */
export const stepDir = (a: Pos, b: Pos): Facing => (b.x > a.x ? 'E' : b.x < a.x ? 'W' : b.y > a.y ? 'S' : 'N');
export { DIR };
