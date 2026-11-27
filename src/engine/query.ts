// query.* owns every number the client shows (ARCH-3). Combat v2: spec 15 (DRV, HIT, MOD, FAC, RCT).
import { arm, body, legs, maneuver, PARTS, pack, pilot, RULES, weapon, type ManeuverDef, type ModeDef, type WeaponDef } from './data';
import { ahead, arcOf, dirTo, dist, DIR, FACINGS, hasCover, hasLos, reachable, tileAt, unitAt, type Pos, type Reach } from './grid';
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
export function stats(s: BattleState | null, u: Pick<Unit, 'build' | 'pilot' | 'hp'> & Partial<Pick<Unit, 'x' | 'y' | 'status' | 'grip'>>): Stats {
  const b = body(u.build.body), l = legs(u.build.legs), p = pack(u.build.pack);
  const weight = b.weight + arm(u.build.armL).weight + arm(u.build.armR).weight + l.weight + p.weight + (weapon(u.build.wL)?.weight ?? 0) + (weapon(u.build.wR)?.weight ?? 0);
  const overweight = weight > b.power;
  let move = l.move;
  let evade = l.evade + pilot(u.pilot).evade - (overweight ? RULES.overweightEvade : 0);
  if (u.hp.legs <= 0) { move = 1; evade = 0; }
  if (s && u.x !== undefined && u.y !== undefined) { const t = tileAt(s, u.x, u.y); if (t?.t === 'water' && u.hp.legs > 0) evade -= RULES.waterEvade; }
  if (u.status?.braced) evade += maneuver('brace')?.evade ?? 0;
  if (u.status?.grabbedBy || (u as Partial<Unit>).grip) evade -= RULES.grabEvade;
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
/** One set of rolls with its numbers resolved: a weapon's fire mode or an attack maneuver (HIT-1, HIT-4, MOD-1, MAN-4). */
export interface Roll {
  /** The slot the order uses (DRV-4); null for Kick, which uses the legs. */
  slot: WeaponSlot | null;
  /** The arm whose accuracy counts (HIT-1); null for pack weapons and Kick. */
  arm: 'L' | 'R' | null;
  /** A weapon id, or `m:<maneuver id>`. */
  weaponId: string;
  mode: ModeDef;
  maneuver: string | null;
  /** Kick always lands on the legs (MAN-4). */
  fixedPart: PartSlot | null;
  splash: number;
  cls: FireClass; min: number; max: number; shots: number; acc: number; dmg: number; dp: number;
}
/** A weapon's fire mode. */
export interface ModeInfo extends Roll { slot: WeaponSlot; weapon: WeaponInfo }

export function resolveMode(w: WeaponInfo, m: ModeDef): ModeInfo {
  const c = m.class ?? w.def.class;
  const cls: FireClass = c === 'melee' ? 'melee' : c === 'indirect' ? 'indirect' : 'direct';
  return {
    slot: w.slot, weapon: w, mode: m, cls, arm: w.slot === 'P' ? null : w.slot, weaponId: w.id, maneuver: null, fixedPart: null,
    splash: cls === 'indirect' ? w.def.splash ?? 0 : 0,
    min: m.min ?? w.def.min, max: m.max ?? w.def.max, shots: m.shots,
    acc: m.baseAcc ?? w.def.acc + (m.acc ?? 0),
    dmg: m.baseDmg ?? w.def.dmg * (m.dmg ?? 1),
    dp: m.dp,
  };
}

/** MAN-4, MAN-6, MAN-7: an attack maneuver as a roll. */
export function maneuverRoll(id: string, slot: WeaponSlot | null): Roll | null {
  const d = maneuver(id);
  if (!d || d.kind !== 'attack') return null;
  const cls: FireClass = d.class === 'melee' ? 'melee' : 'direct';
  const mode: ModeDef = { id, name: d.name, dp: d.dp, shots: 1, ...(d.effect ? { effect: d.effect } : {}) };
  return {
    slot, arm: slot === 'L' || slot === 'R' ? slot : null, weaponId: `m:${id}`, mode, maneuver: id, fixedPart: d.call ?? null, splash: 0,
    cls, min: d.min ?? 1, max: d.max ?? 1, shots: 1, acc: d.baseAcc ?? 0, dmg: d.baseDmg ?? 0, dp: d.dp,
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

// Night and fog (spec 20 FOG). In daylight every walker is known and sight is line of sight.
/** FOG-2, FOG-3: lit by a standing lamp or a flare (3 x 3 around each). */
export function litAt(s: BattleState, p: Pos): boolean {
  for (let y = p.y - 1; y <= p.y + 1; y++) for (let x = p.x - 1; x <= p.x + 1; x++) if (tileAt(s, x, y)?.obj === 'lamp') return true;
  return (s.flares ?? []).some((f) => Math.abs(f.x - p.x) <= 1 && Math.abs(f.y - p.y) <= 1);
}
/** FOG-1: how far `w` sees at night. */
export function sightRange(w: Unit): number {
  const p = pack(w.build.pack);
  return Math.max(RULES.nightSight, p.kind === 'sensor' && !w.status.packOut ? p.sensorRange ?? 0 : 0);
}
/** FOG-1: does walker `w`, standing at `at`, see tile `p`? */
export function sees(s: BattleState, w: Unit, p: Pos, at: Pos = w): boolean {
  if (!hasLos(s, at, p)) return false;
  if (!s.night) return true;
  return dist(at, p) <= sightRange(w) || litAt(s, p);
}
/** FOG-4: is `target` seen by `side`? `extra` adds a viewpoint (a walker planned at another tile). */
export function seenBy(s: BattleState, side: Unit['side'], target: Unit, extra?: { w: Unit; at: Pos }): boolean {
  if (!s.night || target.side === side) return true;
  if (target.flash === side) return true;
  if (extra && sees(s, extra.w, target, extra.at)) return true;
  return s.units.some((a) => a.alive && a.side === side && (!extra || a.id !== extra.w.id) && sees(s, a, target));
}
/** FOG-8: the walkers `side` knows of (its own, and the enemies it sees). */
export const knownTo = (s: BattleState, side: Unit['side']) => (o: Unit): boolean => o.side === side || seenBy(s, side, o);

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
  if (sees(s, u, target, at)) return true; // FOG-4: at night, a walker that sees it
  return s.units.some((a) => a.alive && a.side === u.side && a.id !== u.id && sees(s, a, target));
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
  if (n === 'marked' && target.status.markedBy !== u.side) return 'the target must be marked by your side (Mark)';
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
  if (!seenBy(s, u.side, target, { w: u, at })) return 'not seen'; // FOG-4
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
  return mi ? chanceOf(s, u, mi, target, at, reaction) : 0;
}

export function chanceOf(s: BattleState, u: Unit, mi: Roll, target: Unit, at: Pos = u, reaction: Reaction | null = null): number {
  let c = mi.acc + (mi.arm ? arm(mi.arm === 'L' ? u.build.armL : u.build.armR).acc : 0) + pilot(u.pilot).skill;
  const ht = tileAt(s, at.x, at.y)?.h ?? 0, tt = tileAt(s, target.x, target.y)?.h ?? 0;
  if (ht > tt) c += RULES.heightBonus;
  if (mi.cls !== 'indirect') {
    const arc = arcOf(target, target.facing, at);
    if (arc === 'rear') c += RULES.facing.rearHit;
    else if (arc !== 'front') c += RULES.facing.sideHit;
  } else if (spotted(s, u.side, target, u.id)) c += RULES.spotterBonus;
  if (target.status.markedBy === u.side) c += RULES.markBonus;
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
  return mi ? rangeOf(mi, target, at, part) : [0, 0];
}
export function rangeOf(mi: Roll, target: Unit | null, at: Pos, part: HitSlot = 'body'): [number, number] {
  if (mi.dmg <= 0) return [0, 0];
  let lo = Math.round(mi.dmg * RULES.dmgSpread[0]), hi = Math.round(mi.dmg * RULES.dmgSpread[1]);
  if (target) {
    const g = shieldCut(target, part, mi.cls, arcOf(target, target.facing, at));
    lo = Math.max(1, Math.round(lo * (1 - g))); hi = Math.max(1, Math.round(hi * (1 - g)));
  }
  return [lo, hi];
}

export function expectedDamage(s: BattleState, u: Unit, slot: WeaponSlot, modeId: string, target: Unit, at: Pos = u, reaction: Reaction | null = null): number {
  const mi = modeIn(u, slot, modeId);
  return mi ? expectedOf(s, u, mi, target, at, reaction) : 0;
}
export function expectedOf(s: BattleState, u: Unit, mi: Roll, target: Unit, at: Pos = u, reaction: Reaction | null = null): number {
  if (mi.shots === 0 || mi.dmg <= 0) return 0;
  const p = chanceOf(s, u, mi, target, at, reaction) / 100;
  const arc = arcOf(target, target.facing, at);
  const w = hitWeights(mi.cls, arc, target);
  const total = w.body + w.armL + w.armR + w.legs + w.pack;
  const cut = mi.fixedPart ? shieldCut(target, mi.fixedPart, mi.cls, arc) : ((w.body + w.armL) / total) * shieldCut(target, 'body', mi.cls, arc);
  return mi.shots * p * mi.dmg * (1 - cut);
}

/** RCT-2: the return fire `target` would give an attack from `attackerAt`, if any. */
export function returnFire(s: BattleState, target: Unit, attacker: Unit, attackerAt: Pos = attacker): ModeInfo | null {
  if (!target.alive || target.reserve < 1 || target.holdFire || target.status.down || shaken(target)) return null;
  if (!seenBy(s, target.side, { ...attacker, x: attackerAt.x, y: attackerAt.y, flash: target.side })) return null; // FOG-4, FOG-5
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
    if (!sees(s, o, p)) continue; // FOG-4
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
export function walkRange(s: BattleState, u: Unit, bonus = 0): Reach[] {
  if (!u.alive || u.done || u.drive < RULES.drive.walk || u.status.grabbedBy) return [];
  return reachable(s, u, stats(s, u).move + bonus, u, hasTrait(u, 'hop'), s.night ? knownTo(s, u.side) : undefined);
}
/** FOG-8: a reach planned on what `u`'s side knows (Ghost step, the AI's onward walk). */
export const knownReach = (s: BattleState, u: Unit, budget: number, from: Pos = u): Reach[] => reachable(s, u, budget, from, hasTrait(u, 'hop'), s.night ? knownTo(s, u.side) : undefined);
/** MAN-2. */
export const dashRange = (s: BattleState, u: Unit): Reach[] => walkRange(s, u, maneuver('dash')?.moveBonus ?? 0);
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

// Maneuvers (spec 15 MAN).
export interface ManeuverOption { id: string; def: ManeuverDef; slot: WeaponSlot | null }

/** MAN-1: what a walker's parts, the universal list and (slice 5e) its pilot grant. Arm maneuvers carry their arm's slot. */
export function maneuversOf(u: Unit): ManeuverOption[] {
  const out: ManeuverOption[] = [];
  const add = (id: string, slot: WeaponSlot | null) => { const def = maneuver(id); if (def && !out.some((o) => o.id === id && o.slot === slot)) out.push({ id, def, slot }); };
  for (const id of body(u.build.body).maneuvers ?? []) add(id, null);
  for (const [slot, armId, hp] of [['L', u.build.armL, u.hp.armL], ['R', u.build.armR, u.hp.armR]] as const) if (hp > 0) for (const id of arm(armId).maneuvers ?? []) add(id, slot);
  if (u.hp.legs > 0) for (const id of legs(u.build.legs).maneuvers ?? []) add(id, null);
  if (!u.status.packOut) for (const id of pack(u.build.pack).maneuvers ?? []) add(id, null);
  const sig = pilot(u.pilot).signature;
  if (sig) add(sig, null);
  const sig2 = pilot(u.pilot).signature2;
  if (sig2 && (u.level ?? 1) >= 2) add(sig2, null); // PLV-4
  for (const id of PARTS.universal) {
    const def = maneuver(id);
    if (def?.needs === 'emptyHand' || def?.needs === 'emptyHand+rubble') {
      if (u.hp.armL > 0 && !u.build.wL) add(id, 'L');
      if (u.hp.armR > 0 && !u.build.wR) add(id, 'R');
    } else add(id, null);
  }
  return out;
}
export const hasTrait = (u: Unit, id: string): boolean => maneuversOf(u).some((m) => m.id === id && m.def.kind === 'trait');
export const grants = (u: Unit, id: string, slot: WeaponSlot | null = null): ManeuverOption | null => maneuversOf(u).find((m) => m.id === id && (m.slot === slot || (slot === null && m.slot === null))) ?? null;

const rubbleNear = (s: BattleState, p: Pos): boolean => FACINGS.some((f) => { const q = ahead(p, f); const t = tileAt(s, q.x, q.y); return !!t && t.t === 'rubble' && !t.obj; });

/** MAN-11: where a tow puts the tower and the ally, or null. */
export function towMove(s: BattleState, u: Unit, ally: Unit): { tower: Pos; ally: Pos } | null {
  if (dist(u, ally) !== 1) return null;
  const dir = dirTo(ally, u)!;
  const dest = ahead(u, dir);
  const here = tileAt(s, u.x, u.y)!, there = tileAt(s, dest.x, dest.y), from = tileAt(s, ally.x, ally.y)!;
  const occupant = unitAt(s, dest.x, dest.y);
  if (!there || there.obj || RULES.impassable.includes(there.t) || (occupant && knownTo(s, u.side)(occupant)) || there.h - here.h > 1 || here.h - from.h > 1) return null;
  return { tower: dest, ally: { x: u.x, y: u.y } };
}

/** FLD-3: the wagon a walker could shunt at `p`, and the way it would roll. */
export function shuntDir(s: BattleState, u: Unit, p: Pos): Unit['facing'] | null {
  const here = tileAt(s, u.x, u.y), w = tileAt(s, p.x, p.y);
  if (!here?.rail || !w?.rail || w.obj !== 'wagon' || dist(u, p) !== 1) return null;
  const d = dirTo(u, p);
  return d === 'N' || d === 'S' ? d : null;
}

/** Why `u` cannot use maneuver `id` (MAN-1..12); null if it can. `target` is a walker, `tile` a tile. */
export function maneuverBlock(s: BattleState, u: Unit, id: string, slot: WeaponSlot | null, target: Unit | null, tile: Pos | null): string | null {
  const g = grants(u, id, slot);
  if (!u.alive || !g) return 'not fitted';
  const d = g.def;
  if (d.kind === 'trait') return 'always on';
  if (u.done) return 'stood down';
  if (d.kind === 'signature') { // NRV-5: Steady is checked before the cost
    if (id === pilot(u.pilot).signature2 ? u.sig2Used : u.sigUsed) return 'once per battle';
    if (!steady(u)) return `needs Steady (${RULES.nerve.steady} nerve)`;
  }
  if (u.drive < d.dp) return `needs ${d.dp} drive`;
  if (d.nerve && u.nerve < d.nerve) return `needs ${d.nerve} nerve`;
  if (slot && u.fired.includes(slot)) return 'this arm has given its order this phase';
  switch (id) {
    case 'dash': return tile && dashRange(s, u).some((r) => r.x === tile.x && r.y === tile.y && (r.x !== u.x || r.y !== u.y)) ? null : u.status.grabbedBy ? 'held by a grab' : 'out of reach';
    case 'brace': return u.status.braced ? 'already braced' : null;
    case 'plant': return u.status.planted ? 'already planted' : null;
    case 'overdrive': return u.usedThisPhase.includes('overdrive') ? 'once a phase' : u.hp.body <= (d.strain ?? 0) ? 'the body cannot take the strain' : null;
    case 'breakFree': return u.status.grabbedBy ? null : 'not held';
    case 'mark': {
      if (!target || !target.alive || target.side === u.side) return 'mark an enemy';
      if (!seenBy(s, u.side, target, { w: u, at: u })) return 'not seen';
      if (target.status.markedBy === u.side) return 'already marked';
      return dist(u, target) <= (pack(u.build.pack).sensorRange ?? 0) && hasLos(s, u, target) ? null : 'out of sensor range or sight';
    }
    case 'tow': return target && target.alive && target.side === u.side && target.id !== u.id ? (towMove(s, u, target) ? null : 'no room to tow') : 'tow an adjacent ally';
    case 'shunt': return tile && shuntDir(s, u, tile) ? null : 'stand on the rails next to a wagon on the same line';
    case 'swing': { // LCK-2, LCK-3
      if (!s.tiles.some((q) => q.bridge)) return 'no bridge here';
      if (!FACINGS.some((f) => { const q = ahead(u, f); return tileAt(s, q.x, q.y)?.obj === 'winch'; })) return 'stand next to a winch';
      if (s.units.some((w) => w.alive && tileAt(s, w.x, w.y)?.bridge)) return 'a walker is on the bridge';
      return null;
    }
    case 'patch': return 'use Patch';
    case 'ghost-step': {
      if (!u.fired.length) return 'only after a fire order this phase';
      if (u.status.grabbedBy) return 'held by a grab';
      return tile && knownReach(s, u, stats(s, u).move).some((r) => r.x === tile.x && r.y === tile.y && (r.x !== u.x || r.y !== u.y)) ? null : 'out of reach';
    }
    case 'sweep': return pack(u.build.pack).kind === 'sensor' && !u.status.packOut ? null : 'needs a working sensor mast';
    case 'field-weld': {
      if (pack(u.build.pack).kind !== 'repair' || u.status.packOut) return 'needs a working repair crane';
      if (!target || !target.alive || target.side !== u.side || dist(u, target) > 1) return 'weld an adjacent ally (or yourself)';
      return target.hp.armL <= 0 || target.hp.armR <= 0 ? null : 'no lost arm to weld';
    }
    case 'hot-patch': {
      if (pack(u.build.pack).kind !== 'repair' || u.status.packOut || u.charges <= 0) return 'needs a working repair crane with a charge';
      if (!target || !target.alive || target.side !== u.side) return 'patch an ally';
      return dist(u, target) <= (d.range ?? 2) ? null : `ally must be within ${d.range ?? 2}`;
    }
    default: break;
  }
  if (d.kind === 'attack') {
    const r = maneuverRoll(id, slot)!;
    if (!target || !target.alive || target.side === u.side) return 'not an enemy';
    if (!seenBy(s, u.side, target, { w: u, at: u })) return 'not seen'; // FOG-4
    if (id === 'grab' && (u.grip || target.status.grabbedBy)) return u.grip ? 'already holding a walker' : 'already held';
    if (d.needs === 'emptyHand+rubble' && !rubbleNear(s, u)) return 'needs rubble next to the walker';
    const dd = dist(u, target);
    if (dd < r.min || dd > r.max) return 'out of range';
    return hasLos(s, u, target) ? null : 'no line of sight';
  }
  return null;
}

/** ARCH-3: the numbers an attack maneuver shows. */
export function maneuverPreview(s: BattleState, u: Unit, id: string, slot: WeaponSlot | null, target: Unit): { dp: number; chance: number; dmg: [number, number]; arc: Arc; counter: Preview['counter'] } | null {
  const r = maneuverRoll(id, slot);
  if (!r || maneuverBlock(s, u, id, slot, target, null)) return null;
  const rf = returnFire(s, target, u);
  return {
    dp: r.dp, chance: chanceOf(s, u, r, target), dmg: rangeOf(r, target, u, r.fixedPart ?? 'body'), arc: arcOf(target, target.facing, u),
    counter: rf ? { slot: rf.slot, weapon: rf.weapon.def.name, mode: rf.mode.name, chance: hitChance(s, target, rf.slot, rf.mode.id, u, target, 'return'), shots: rf.shots, dmg: damageRange(s, target, rf.slot, rf.mode.id, u, target) } : null,
  };
}
