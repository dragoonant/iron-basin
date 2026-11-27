// The rules engine (spec 10 and spec 15). Pure: step() works on a copy and never throws (ARCH-1).
import { body, MISSIONS, pack, pilot, RULES, weapon, type MissionDef } from './data';
import { ahead, arcOf, dirTo, dist, FACINGS, hasLos, inBounds, reachable, tileAt, unitAt, type Pos } from './grid';
import { maneuver } from './data';
import { next, seedRng, hashText } from './rng';
import {
  callable, chanceOf, cheapestMode, dashRange, driveAtStart, fireBlock, guardFor, hasTrait, hitWeights, indirectSight, living, maneuverBlock,
  maneuverRoll, maneuversOf, maxHp, modeIn, modes, overwatchers, patchCost, pivotCost, returnFire, shieldCut, shuntDir, towMove, unitById,
  knownReach, seenBy, stats, walkRange, weaponIn, type FireClass, type Roll,
} from './query';
import type {
  Action, BattleState, Build, Facing, GameEvent, HitSlot, PaintSlot, PartSlot, Paint, Reaction, Result, ShotEvent, Side, StepResult, Tile, Unit, WeaponSlot,
} from './types';

export interface Deploy { id: string; pilot: string; side: Side; x: number; y: number; facing?: Facing; role?: string; build: Build; hp?: Partial<Record<PartSlot, number>>; paint?: Partial<Record<PaintSlot, Paint>> }

export function parseMap(m: MissionDef): Tile[] {
  const tiles: Tile[] = [];
  for (const row of m.map) for (const ch of row) {
    const l = m.legend[ch] ?? m.legend['.']!;
    const obj = l[2] ?? null;
    tiles.push({ t: l[0], h: l[1], obj, objHp: obj ? RULES.objects[obj].hp : 0 });
  }
  // FLD-7: rails and stacks as tile flags.
  const w = m.map[0]!.length;
  for (const r of m.rails ?? []) for (let y = 0; y < m.map.length; y++) tiles[y * w + r.x]!.rail = r.axis;
  for (const [x, y] of m.stacks ?? []) tiles[y * w + x]!.stack = true;
  for (const [x, y] of m.bridge ?? []) tiles[y * w + x]!.bridge = true; // LCK-2
  for (const [x, y] of m.flood ?? []) tiles[y * w + x]!.flood = true; // LCK-5
  return tiles;
}

const noStatus = () => ({ pinned: false, suppressed: false, staggered: false, mired: false, down: false, packOut: false, braced: false, planted: false, markedBy: null, grabbedBy: null });

/** A walker as it would stand on the field (also used by the hangar's summary). */
export function makeUnit(d: Deploy): Unit {
  const base: Paint = d.side === 'player' ? 'slate' : 'camo';
  const u: Unit = {
    id: d.id, pilot: d.pilot, side: d.side, role: d.role ?? 'line', x: d.x, y: d.y, facing: d.facing ?? (d.side === 'player' ? 'N' : 'S'),
    build: { ...d.build },
    paint: { body: base, armL: base, armR: base, legs: base, pack: base, ...(d.paint ?? {}) },
    hp: { body: 0, armL: 0, armR: 0, legs: 0 }, ammo: null, charges: 0,
    drive: 0, reserve: RULES.drive.startReserve, done: false, fired: [], walked: false, lastWalk: null, holdFire: false,
    nerve: pilot(d.pilot).nerve, status: noStatus(), overwatch: null, guarding: [], grip: null, flash: null, usedThisPhase: [], sigUsed: false, bonusReserve: 0, alive: true,
  };
  for (const p of ['body', 'armL', 'armR', 'legs'] as const) u.hp[p] = Math.min(maxHp(u, p), d.hp?.[p] ?? maxHp(u, p));
  const pk = pack(u.build.pack);
  if (pk.kind === 'weapon') u.ammo = weapon(pk.weapon ?? null)?.ammo ?? null;
  if (pk.kind === 'repair') u.charges = pk.charges ?? 0;
  if (u.hp.body <= 0) u.alive = false;
  return u;
}

/** A battle from a mission; `deploy` replaces the mission's player walkers (from the campaign roster). */
export function newBattle(missionId: string, seed: number, deploy?: Deploy[]): BattleState {
  const m = MISSIONS[missionId]!;
  const tiles = parseMap(m);
  const players: Deploy[] = deploy ?? m.units.filter((u) => u.side === 'player');
  const hostiles: Deploy[] = m.units.filter((u) => u.side === 'hostile');
  const s: BattleState = {
    v: 2, mission: m.id, seed, w: m.map[0]!.length, h: m.map.length, tiles,
    units: [...players, ...hostiles].map(makeUnit).filter((u) => u.alive), smoke: [],
    round: 1, phase: 'player', rng: seedRng(seed), salvage: [], result: null, turnCount: 0,
  };
  if (m.night) {
    // FOG-7: night, flares, and each side's intel: the briefing tells each side where the other starts.
    s.night = true; s.flares = [];
    s.intel = { player: {}, hostile: {} };
    for (const w of s.units) s.intel[w.side === 'player' ? 'hostile' : 'player'][w.id] = { x: w.x, y: w.y };
  }
  startPhase(s, 'player', []);
  return s;
}

export const hash = (s: BattleState): string => hashText(JSON.stringify(s));
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
const reject = (state: BattleState, reason: string): StepResult => ({ state, events: [{ type: 'rejected', reason }] });

function drawPart(s: BattleState, w: Record<HitSlot, number>): HitSlot {
  const order: HitSlot[] = ['body', 'armL', 'armR', 'legs', 'pack'];
  const total = order.reduce((a, p) => a + w[p], 0);
  let r = next(s.rng) * total;
  for (const p of order) { r -= w[p]; if (r < 0) return p; }
  return 'body';
}

function applyDamage(t: Unit, part: PartSlot, raw: number, cut: number): { part: PartSlot; dmg: number; partLost: boolean } {
  let p = part;
  if (p !== 'body' && t.hp[p] <= 0) p = 'body'; // WLK-4
  const dmg = Math.max(1, Math.round(raw * (1 - cut)));
  const before = t.hp[p];
  t.hp[p] = Math.max(0, before - dmg);
  return { part: p, dmg, partLost: before > 0 && t.hp[p] === 0 && p !== 'body' };
}

/** NRV-2: move a pilot's nerve, clamped to 0..max. */
function nerve(u: Unit, delta: number, why: Extract<GameEvent, { type: 'nerve' }>['why'], ev: GameEvent[]): void {
  if (!delta) return;
  const now = Math.max(0, Math.min(RULES.nerve.max, u.nerve + delta));
  if (now === u.nerve) return;
  const d = now - u.nerve;
  u.nerve = now;
  ev.push({ type: 'nerve', unit: u.id, delta: d, now, why });
}

function destroy(s: BattleState, t: Unit, by: string, ev: GameEvent[]): void {
  t.alive = false;
  t.done = true; t.drive = 0; t.reserve = 0; t.overwatch = null; t.guarding = [];
  ev.push({ type: 'destroyed', unit: t.id, by });
  // NRV-2: credit for the kill; allies that see it lose nerve.
  const killer = unitById(s, by);
  if (killer && killer.alive && killer.side !== t.side) nerve(killer, RULES.nerve.kill, 'kill', ev);
  for (const a of s.units) if (a.alive && a.side === t.side && a.id !== t.id && hasLos(s, a, t)) nerve(a, RULES.nerve.allyLost, 'allyLost', ev);
  if (t.side !== 'hostile') return;
  // SAL-1: what still had HP when it fell.
  const paint = t.paint;
  if (t.hp.armL > 0) { s.salvage.push({ kind: 'arm', id: t.build.armL, hp: t.hp.armL, paint: paint.armL, from: t.id }); if (t.build.wL) s.salvage.push({ kind: 'weapon', id: t.build.wL, hp: 0, paint: paint.armL, from: t.id }); }
  if (t.hp.armR > 0) { s.salvage.push({ kind: 'arm', id: t.build.armR, hp: t.hp.armR, paint: paint.armR, from: t.id }); if (t.build.wR) s.salvage.push({ kind: 'weapon', id: t.build.wR, hp: 0, paint: paint.armR, from: t.id }); }
  if (t.hp.legs > 0) s.salvage.push({ kind: 'legs', id: t.build.legs, hp: t.hp.legs, paint: paint.legs, from: t.id });
  if (pack(t.build.pack).kind !== 'none' && !t.status.packOut) s.salvage.push({ kind: 'pack', id: t.build.pack, hp: 0, paint: paint.pack, from: t.id });
}

function reap(s: BattleState, by: string, ev: GameEvent[]): void {
  for (const o of s.units) if (o.alive && o.hp.body <= 0) destroy(s, o, by, ev);
}

/** FLD-2. */
function knockDown(t: Unit, ev: GameEvent[]): void {
  if (!t.alive || t.status.down || t.status.braced) return; // MAN-5
  t.status.down = true;
  ev.push({ type: 'status', unit: t.id, status: 'down' });
  nerve(t, RULES.nerve.knockedDown, 'down', ev);
}

/** An object at 0 HP leaves its tile (ATK-9): rubble, except a lamp (bare quay) and a lock gate (deep water, and the
 * basin floods: LCK-4, LCK-5). Every break goes through here. */
function breakTile(s: BattleState, x: number, y: number, ev: GameEvent[]): void {
  const t = tileAt(s, x, y);
  if (!t || !t.obj) return;
  const kind = t.obj;
  t.obj = null; t.objHp = 0; t.stack = false;
  if (kind === 'lamp') return;
  if (kind === 'gate') { t.t = 'deep'; flood(s, x, y, ev); return; }
  t.t = 'rubble';
}

/** LCK-5: the first broken gate empties the basin: flood tiles become water, walkers on them are mired. */
function flood(s: BattleState, x: number, y: number, ev: GameEvent[]): void {
  if (s.flooded) return;
  s.flooded = true;
  const tiles: Pos[] = [], mired: string[] = [];
  for (let yy = 0; yy < s.h; yy++) for (let xx = 0; xx < s.w; xx++) {
    const t = s.tiles[yy * s.w + xx]!;
    if (!t.flood || t.obj) continue;
    t.t = 'water'; tiles.push({ x: xx, y: yy });
    const w = unitAt(s, xx, yy);
    if (w) { w.status.mired = true; mired.push(w.id); }
  }
  ev.push({ type: 'flood', x, y, tiles, mired });
}

/** MAN-6: let go. */
function release(s: BattleState, g: Unit, ev: GameEvent[]): void {
  if (!g.grip) return;
  const t = unitById(s, g.grip.target);
  if (t && t.status.grabbedBy === g.id) t.status.grabbedBy = null;
  g.grip = null;
  ev.push({ type: 'status', unit: t?.id ?? g.id, status: 'released' });
}
function releaseAll(s: BattleState, u: Unit, ev: GameEvent[]): void {
  if (u.grip) release(s, u, ev);
  if (u.status.grabbedBy) { const g = unitById(s, u.status.grabbedBy); if (g?.grip?.target === u.id) release(s, g, ev); else u.status.grabbedBy = null; }
}
/** MAN-6: a grab ends when the grabber loses the arm, falls, dies, or the two are no longer adjacent. */
function sweepGrips(s: BattleState, ev: GameEvent[]): void {
  for (const g of s.units) {
    if (!g.grip) continue;
    const t = unitById(s, g.grip.target);
    const armHp = g.grip.arm === 'L' ? g.hp.armL : g.hp.armR;
    if (!g.alive || armHp <= 0 || g.status.down || !t || !t.alive || dist(g, t) !== 1 || t.status.grabbedBy !== g.id) release(s, g, ev);
  }
  for (const t of s.units) if (t.status.grabbedBy && unitById(s, t.status.grabbedBy)?.grip?.target !== t.id) t.status.grabbedBy = null;
}

/** FLD-5: a stack at toppleAt HP or less (above 0) falls away from `from`. Topples do not chain (FLD-5 ruling). */
function maybeTopple(s: BattleState, x: number, y: number, from: Pos, ev: GameEvent[]): void {
  const t = tileAt(s, x, y);
  if (!t?.stack || t.obj !== 'container' || t.objHp <= 0 || t.objHp > RULES.stack.toppleAt) return;
  const dx = x - from.x, dy = y - from.y;
  if (dx === 0 && dy === 0) return;
  const dir: Facing = Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 'E' : 'W') : dy > 0 ? 'S' : 'N';
  t.obj = null; t.objHp = 0; t.t = 'rubble'; t.stack = false;
  const hits: { x: number; y: number; unit: string | null; dmg: number }[] = [];
  const after: GameEvent[] = [];
  for (let n = 1; n <= RULES.stack.reach; n++) {
    const p = ahead({ x, y }, dir, n);
    const q = tileAt(s, p.x, p.y);
    if (!q) continue;
    const w = unitAt(s, p.x, p.y);
    if (w) { const r = applyDamage(w, 'body', RULES.stack.dmg, 0); hits.push({ ...p, unit: w.id, dmg: r.dmg }); knockDown(w, after); }
    else if (q.obj) { if (RULES.objects[q.obj].breakable) { q.objHp = Math.max(0, q.objHp - RULES.stack.dmg); if (q.objHp === 0) breakTile(s, p.x, p.y, after); } hits.push({ ...p, unit: null, dmg: RULES.stack.dmg }); }
    else if (!RULES.impassable.includes(q.t)) { q.t = 'rubble'; hits.push({ ...p, unit: null, dmg: 0 }); } // deep water stays deep
  }
  ev.push({ type: 'toppled', x, y, dir, hits }, ...after);
}

/** Would a push of `t` toward `dir` move it (rather than collide)? */
function pushMoves(s: BattleState, t: Unit, dir: Facing): boolean {
  const d = ahead(t, dir), q = tileAt(s, d.x, d.y), here = tileAt(s, t.x, t.y)!;
  return !!q && !q.obj && !unitAt(s, d.x, d.y) && q.h <= here.h && !RULES.impassable.includes(q.t);
}

/** FLD-1: push `t` one tile straight away from `from`. Returns whether it moved. */
function push(s: BattleState, by: Unit, t: Unit, from: Pos, ev: GameEvent[]): boolean {
  if (!t.alive) return false;
  const dir = dirTo(from, t);
  if (!dir) return false;
  if (t.status.braced) { ev.push({ type: 'status', unit: t.id, status: 'braced' }); return false; } // MAN-5
  const dest = ahead(t, dir);
  const here = tileAt(s, t.x, t.y)!, there = tileAt(s, dest.x, dest.y);
  const other = there ? unitAt(s, dest.x, dest.y) : null;
  const c = RULES.push.collide;
  if (!there || there.obj || other || there.h > here.h || RULES.impassable.includes(there.t)) { // LCK-8: deep water is a wall too
    const r = applyDamage(t, 'body', c, 0);
    let obj: { x: number; y: number; dmg: number; broken: boolean } | null = null;
    if (other) applyDamage(other, 'body', c, 0);
    if (there?.obj && RULES.objects[there.obj].breakable) {
      there.objHp = Math.max(0, there.objHp - c);
      const broken = there.objHp === 0;
      obj = { x: dest.x, y: dest.y, dmg: c, broken };
    }
    ev.push({ type: 'pushed', unit: t.id, by: by.id, x: t.x, y: t.y, result: 'collide', dmg: r.dmg, other: other?.id ?? null, obj });
    if (obj?.broken) breakTile(s, dest.x, dest.y, ev);
    if (obj && !obj.broken) maybeTopple(s, dest.x, dest.y, t, ev);
    return false;
  }
  releaseAll(s, t, ev); // MAN-6: a pushed walker breaks a grab
  t.x = dest.x; t.y = dest.y;
  if (there.h < here.h) {
    const hop = hasTrait(t, 'hop'); // MAN-3
    const r = hop ? { dmg: 0 } : applyDamage(t, 'legs', RULES.push.fallLegs, 0);
    ev.push({ type: 'pushed', unit: t.id, by: by.id, x: t.x, y: t.y, result: 'fell', dmg: r.dmg, other: null, obj: null });
    if (!hop) knockDown(t, ev);
  } else if (there.t === 'water') {
    t.status.mired = true;
    ev.push({ type: 'pushed', unit: t.id, by: by.id, x: t.x, y: t.y, result: 'water', dmg: 0, other: null, obj: null });
  } else ev.push({ type: 'pushed', unit: t.id, by: by.id, x: t.x, y: t.y, result: 'moved', dmg: 0, other: null, obj: null });
  return true;
}

/** FAC-4: a hit on the backpack. Its damage has already gone to the body. */
function packHit(s: BattleState, t: Unit, ev: GameEvent[]): void {
  const pk = pack(t.build.pack);
  if (pk.cookOff && t.ammo !== null && t.ammo > 0) {
    const self = applyDamage(t, 'body', RULES.cookOff.self, 0);
    const splash: { target: string; dmg: number }[] = [];
    for (const o of s.units) if (o.alive && o.id !== t.id && dist(o, t) === 1) splash.push({ target: o.id, dmg: applyDamage(o, 'body', RULES.cookOff.adjacent, 0).dmg });
    t.ammo = 0;
    ev.push({ type: 'cookOff', unit: t.id, dmg: self.dmg, splash });
  } else if (!t.status.packOut) {
    t.status.packOut = true;
    ev.push({ type: 'status', unit: t.id, status: 'packOut' });
  }
}

interface FireOpts { reaction: Reaction | null; part?: HitSlot }

/** HIT-1..4, MOD-2..7, FAC-3..5, RCT-4: one fire order's rolls and effects. Returns whether the legs of `t` were hit. */
function resolveFire(s: BattleState, a: Unit, mi: Roll, t: Unit, opts: FireOpts, ev: GameEvent[]): { legsHit: boolean } {
  const cls: FireClass = mi.cls;
  const chance = chanceOf(s, a, mi, t, a, opts.reaction);
  if (t.side !== a.side) a.flash = t.side; // FOG-5: the muzzle flash shows the shooter
  const arc = arcOf(t, t.facing, a);
  const shots: ShotEvent[] = [];
  const after: GameEvent[] = [];
  const hitOn = new Set<string>();
  let legsHit = false;
  for (let i = 0; i < mi.shots; i++) {
    if (!t.alive || t.hp.body <= 0) break;
    const hit = next(s.rng) * 100 < chance;
    if (!hit) { shots.push({ hit: false, part: null, dmg: 0, partLost: false }); continue; }
    if (mi.dmg <= 0) { shots.push({ hit: true, part: null, dmg: 0, partLost: false }); hitOn.add(t.id); continue; } // Grab
    const raw = mi.dmg * (RULES.dmgSpread[0] + next(s.rng) * (RULES.dmgSpread[1] - RULES.dmgSpread[0]));
    const g = guardFor(s, a, t, cls);
    if (g) { // RCT-4: the guard's shield arm takes it.
      const r = applyDamage(g, 'armL', raw, shieldCut(g, 'armL', cls, arcOf(g, g.facing, a)));
      shots.push({ hit: true, part: r.part, dmg: r.dmg, partLost: r.partLost, on: g.id });
      hitOn.add(g.id);
      continue;
    }
    let part: HitSlot = opts.part ?? mi.fixedPart ?? drawPart(s, hitWeights(cls, arc, t));
    if (part === 'pack' && (pack(t.build.pack).kind === 'none' || t.status.packOut)) part = 'body';
    if (part === 'pack') {
      const r = applyDamage(t, 'body', raw, 0);
      shots.push({ hit: true, part: 'pack', dmg: r.dmg, partLost: false });
      packHit(s, t, after);
    } else {
      const r = applyDamage(t, part, raw, shieldCut(t, part, cls, arc));
      shots.push({ hit: true, part: r.part, dmg: r.dmg, partLost: r.partLost });
      if (r.part === 'legs') legsHit = true;
    }
    hitOn.add(t.id);
    if (mi.splash) { // MOD-9: only High explosive rolls; Smoke has no shots
      for (const o of s.units) {
        if (!o.alive || o.id === t.id || dist(o, t) !== 1) continue;
        const sr = applyDamage(o, 'body', mi.splash, 0);
        after.push({ type: 'splash', unit: a.id, target: o.id, dmg: sr.dmg, partLost: false });
      }
    }
  }
  if (mi.slot === 'P' && a.ammo !== null) a.ammo -= 1; // MOD-3
  ev.push({ type: 'attack', unit: a.id, slot: mi.slot, weapon: mi.weaponId, mode: mi.mode.id, target: t.id, counter: opts.reaction !== null, reaction: opts.reaction, arc, chance, shots });
  ev.push(...after);
  // NRV-2: landing a hit steadies the shooter; a hit from the side or rear shakes the target (not indirect fire).
  if (hitOn.size && a.alive) nerve(a, RULES.nerve.landHit, 'hit', ev);
  if (hitOn.has(t.id) && t.alive && cls !== 'indirect') {
    if (arc === 'rear') nerve(t, RULES.nerve.hitRear, 'hitRear', ev);
    else if (arc !== 'front') nerve(t, RULES.nerve.hitSide, 'hitSide', ev);
  }
  reap(s, a.id, ev);
  // MOD-6, MOD-7: effects land on each walker that took a hit.
  const fx = mi.mode.effect;
  for (const id of [...hitOn].sort()) {
    const v = unitById(s, id);
    if (!v || !v.alive) continue;
    if (fx === 'pin' && !v.status.pinned) { v.status.pinned = true; ev.push({ type: 'status', unit: v.id, status: 'pinned' }); nerve(v, RULES.nerve.pinned, 'pinned', ev); }
    if (fx === 'stagger' && !v.status.staggered) { v.status.staggered = true; ev.push({ type: 'status', unit: v.id, status: 'staggered' }); }
    if (fx === 'knockdown') knockDown(v, ev);
    if (fx === 'push') {
      // MOD-7: a push carries `pushes` tiles, straight on, and stops at the first collision, fall or water.
      const dir = dirTo(a, v);
      for (let k = 0, from: Pos = { x: a.x, y: a.y }; k < (mi.mode.pushes ?? 1) && dir; k++) {
        const before = tileAt(s, v.x, v.y)!;
        if (!push(s, a, v, from, ev)) break;
        if (v.status.down || v.status.mired || tileAt(s, v.x, v.y)!.h < before.h) break;
        from = ahead(v, dir, -1);
      }
    }
    if (fx === 'grab' && v.id === t.id && (mi.slot === 'L' || mi.slot === 'R')) { // MAN-6
      v.status.grabbedBy = a.id; a.grip = { target: v.id, arm: mi.slot };
      ev.push({ type: 'status', unit: v.id, status: 'grabbed' });
    }
  }
  reap(s, a.id, ev);
  return { legsHit };
}

/** RCT-2: the target answers a direct or melee fire order. */
function answer(s: BattleState, a: Unit, t: Unit, ev: GameEvent[]): void {
  if (!a.alive || !t.alive) return;
  const rf = returnFire(s, t, a);
  if (!rf) return;
  t.reserve -= 1;
  resolveFire(s, t, rf, a, { reaction: 'return' }, ev);
}

function checkEnd(s: BattleState, ev: GameEvent[], timeout = false): void {
  if (s.result) return;
  const m = MISSIONS[s.mission]!;
  const hostile = living(s, 'hostile').length, player = living(s, 'player').length;
  let winner: Side | null = null, reason: Result['reason'] = 'annihilated';
  if (hostile === 0) { winner = 'player'; reason = 'annihilated'; }
  else if (player === 0) { winner = 'hostile'; reason = 'wiped'; }
  else if (timeout) { winner = 'hostile'; reason = 'timeout'; }
  if (!winner) return;
  const lost = { player: s.units.filter((u) => u.side === 'player' && !u.alive).length, hostile: s.units.filter((u) => u.side === 'hostile' && !u.alive).length };
  const win = winner === 'player';
  s.result = {
    winner, reason, rounds: s.round, lost,
    salvage: win ? s.salvage : [],
    credits: { fee: win ? m.fee : 0, bonus: win && s.round <= m.bonusRound ? m.bonus : 0, bounty: win ? lost.hostile * m.bounty : 0, ...(m.gateBonus ? { gate: win && !s.flooded ? m.gateBonus : 0 } : {}) }, // LCK-7
  };
  ev.push({ type: 'end', result: s.result });
}

/** DRV-1, DRV-6, FLD-6: a side's phase starts. */
function startPhase(s: BattleState, side: Side, ev: GameEvent[]): void {
  const before = s.smoke.length;
  s.smoke = s.smoke.filter((m) => m.side !== side);
  if (s.smoke.length !== before) ev.push({ type: 'smokeClear', side });
  if (s.flares?.some((f) => f.side === side)) { s.flares = s.flares.filter((f) => f.side !== side); ev.push({ type: 'flareOut', side }); } // FOG-6
  for (const u of s.units) if (u.status.markedBy === side) u.status.markedBy = null; // MAN-9
  for (const u of s.units) if (u.side === side && u.grip) release(s, u, ev); // MAN-6
  for (const u of s.units) {
    if (u.side !== side || !u.alive) continue;
    u.status.braced = false; u.status.planted = false; u.usedThisPhase = []; u.bonusReserve = 0; // MAN-5, MAN-8, NRV-5
    u.reserve = 0;
    u.drive = driveAtStart(u);
    u.status.suppressed = u.status.pinned;
    u.status.pinned = false; u.status.staggered = false; u.status.mired = false; u.status.down = false;
    u.fired = []; u.walked = false; u.lastWalk = null; u.overwatch = null; u.guarding = [];
    u.done = u.drive <= 0;
  }
}

/** DRV-5, DRV-6. */
function standDown(u: Unit): number {
  if (!u.done) { u.reserve = Math.min(RULES.drive.signatureReserveCap, Math.min(RULES.drive.reserveCap, u.drive) + u.bonusReserve); u.done = true; }
  u.drive = 0; u.lastWalk = null;
  return u.reserve;
}

function endPhaseFor(s: BattleState, side: Side, ev: GameEvent[]): void {
  // NRV-2: walkers that end the phase next to an ally steady each other.
  for (const u of s.units) if (u.side === side && u.alive && s.units.some((a) => a.alive && a.side === side && a.id !== u.id && dist(a, u) === 1)) nerve(u, RULES.nerve.together, 'together', ev);
  for (const u of s.units) if (u.side === side && u.alive) { standDown(u); u.status.suppressed = false; }
  for (const u of s.units) if (u.flash === side) u.flash = null; // FOG-5
}

/** After an order: a walker with no drive left stands down with no reserve (DRV-5). */
function settle(u: Unit): void {
  if (u.alive && !u.done && u.drive <= 0) { u.done = true; u.reserve = 0; u.drive = 0; }
}

/** ARCH-1: pure, never throws. */
export function step(state: BattleState, action: Action): StepResult {
  try {
    return stepInner(state, action);
  } catch (e) {
    return reject(state, `internal: ${(e as Error).message}`);
  }
}

function own(s: BattleState, id: unknown): Unit | null {
  const u = typeof id === 'string' ? unitById(s, id) : null;
  return u && u.alive && u.side === s.phase ? u : null;
}
const isFacing = (f: unknown): f is Facing => typeof f === 'string' && (FACINGS as string[]).includes(f);
const isSlot = (x: unknown): x is WeaponSlot => x === 'L' || x === 'R' || x === 'P';
const PARTS: PartSlot[] = ['body', 'armL', 'armR', 'legs'];

/** DRV-3, RCT-3: walk a path step by step; enemy overwatch can fire on each tile and stop the walk. */
function walk(s: BattleState, u: Unit, path: Pos[], facing: Facing, ev: GameEvent[], dp = RULES.drive.walk, nerve = 0): void {
  const from = { x: u.x, y: u.y };
  const lw = { from, facing: u.facing, dp, nerve, dir: null as Facing | null, steps: 0, reacted: false, wasWalked: u.walked };
  u.drive -= dp; u.nerve -= nerve; u.walked = true;
  u.status.braced = false; u.status.planted = false; // MAN-5: walking ends both
  if (u.grip) release(s, u, ev); // MAN-6: the grabber walks
  let seg: Pos[] = [{ ...from }];
  let stopped = false;
  const dirs: Facing[] = [];
  for (let i = 1; i < path.length && !stopped; i++) {
    const prev = path[i - 1]!, p = path[i]!;
    const d = dirTo(prev, p)!;
    dirs.push(d);
    u.x = p.x; u.y = p.y; u.facing = d;
    seg.push({ ...p });
    // FOG-8: an enemy the side could not see stands here: the walk stops on the tile before.
    const lurker = s.units.find((o) => o.alive && o.side !== u.side && o.x === p.x && o.y === p.y);
    if (lurker) {
      // Back up to the last tile on the path that no other walker holds (an ally may be passed through, not stopped on).
      let k = i - 1;
      while (k > 0 && s.units.some((o) => o.alive && o.id !== u.id && o.x === path[k]!.x && o.y === path[k]!.y)) k--;
      const stop = path[k]!;
      u.x = stop.x; u.y = stop.y; u.facing = d;
      while (seg.length > 1 && (seg[seg.length - 1]!.x !== stop.x || seg[seg.length - 1]!.y !== stop.y)) seg.pop();
      dirs.length = Math.max(0, k);
      ev.push({ type: 'walked', unit: u.id, path: seg, facing: d });
      seg = [{ ...stop }];
      ev.push({ type: 'ambush', unit: u.id, enemy: lurker.id, x: p.x, y: p.y });
      lw.reacted = true; stopped = true;
      break;
    }
    if (s.units.some((o) => o.alive && o.id !== u.id && o.x === p.x && o.y === p.y)) continue; // passing through an ally
    for (const o of overwatchers(s, u, p)) {
      const mi = cheapestMode(o, o.overwatch!.slot)!;
      ev.push({ type: 'walked', unit: u.id, path: seg, facing: d });
      seg = [{ ...p }];
      lw.reacted = true;
      o.reserve -= 1; o.overwatch = null;
      const r = resolveFire(s, o, mi, u, { reaction: 'overwatch' }, ev);
      if (!u.alive || r.legsHit || u.status.down || u.x !== p.x || u.y !== p.y) { stopped = true; break; }
    }
  }
  if (u.alive && !stopped) u.facing = facing;
  if (seg.length > 1 || (!lw.reacted && !stopped)) ev.push({ type: 'walked', unit: u.id, path: seg, facing: u.facing });
  lw.steps = dirs.length;
  lw.dir = dirs.length && dirs.every((d) => d === dirs[0]) ? dirs[0]! : null;
  u.lastWalk = u.alive ? lw : null;
}

function stepInner(state: BattleState, action: Action): StepResult {
  if (state.result) return reject(state, 'battle is over');
  if (!action || typeof action !== 'object') return reject(state, 'unknown action');
  const s = clone(state);
  const ev: GameEvent[] = [];
  switch (action.type) {
    case 'walk': {
      const u = own(s, action.unit);
      if (!u || u.done || u.drive < RULES.drive.walk) return reject(state, 'cannot walk');
      if (!isFacing(action.facing)) return reject(state, 'bad facing');
      const r = walkRange(s, u).find((t) => t.x === action.x && t.y === action.y);
      if (!r || (r.x === u.x && r.y === u.y)) return reject(state, 'tile not reachable');
      walk(s, u, r.path, action.facing, ev);
      settle(u);
      break;
    }
    case 'undoWalk': {
      const u = own(s, action.unit);
      const lw = u?.lastWalk;
      if (!u || !lw || lw.reacted) return reject(state, 'nothing to undo');
      if (unitAt(s, lw.from.x, lw.from.y)) return reject(state, 'start tile taken');
      u.x = lw.from.x; u.y = lw.from.y; u.facing = lw.facing; u.drive += lw.dp; u.nerve += lw.nerve; u.walked = lw.wasWalked; u.lastWalk = null;
      if (lw.sig) u.sigUsed = false;
      if (u.done && u.reserve === 0) u.done = false;
      ev.push({ type: 'undo', unit: u.id, x: u.x, y: u.y, facing: u.facing });
      break;
    }
    case 'pivot': {
      const u = own(s, action.unit);
      if (!u || u.done || u.drive < pivotCost() || !isFacing(action.facing) || action.facing === u.facing) return reject(state, 'cannot pivot');
      u.facing = action.facing; u.drive -= pivotCost(); u.lastWalk = null;
      ev.push({ type: 'pivot', unit: u.id, facing: u.facing });
      settle(u);
      break;
    }
    case 'fire': {
      const u = own(s, action.unit);
      const t = typeof action.target === 'string' ? unitById(s, action.target) : null;
      if (!u || !t || !isSlot(action.slot)) return reject(state, 'cannot fire');
      const why = fireBlock(s, u, action.slot, action.mode, t);
      if (why) return reject(state, why);
      const mi = modeIn(u, action.slot, action.mode)!;
      let part: HitSlot | undefined;
      if (mi.mode.call) {
        if (!action.part || !callable(t, u).includes(action.part)) return reject(state, 'name a part to call');
        part = action.part;
      }
      u.drive -= mi.dp; u.fired.push(mi.slot); u.lastWalk = null;
      if (mi.mode.effect === 'guard') {
        if (!u.guarding.includes(t.id)) u.guarding.push(t.id);
        ev.push({ type: 'guard', unit: u.id, target: t.id });
      } else {
        resolveFire(s, u, mi, t, { reaction: null, part }, ev);
        if (mi.cls !== 'indirect') answer(s, u, t, ev);
      }
      settle(u);
      break;
    }
    case 'fireAt': {
      const u = own(s, action.unit);
      const mi = u && isSlot(action.slot) ? modeIn(u, action.slot, action.mode) : null;
      const p = { x: action.x, y: action.y };
      const tile = typeof p.x === 'number' && typeof p.y === 'number' ? tileAt(s, p.x, p.y) : null;
      if (!u || !mi || !tile) return reject(state, 'cannot fire there');
      if (!mi.weapon.usable || u.done || u.fired.includes(mi.slot) || u.drive < mi.dp) return reject(state, 'cannot fire now');
      const d = dist(u, p);
      if (mi.mode.effect === 'smoke') {
        if (d < mi.min || d > mi.max || !indirectSight(s, u, u, p)) return reject(state, 'cannot smoke that tile');
        const tiles: Pos[] = [];
        const r = RULES.smokeRadius;
        for (let y = p.y - r; y <= p.y + r; y++) for (let x = p.x - r; x <= p.x + r; x++) if (inBounds(s, x, y)) tiles.push({ x, y });
        s.smoke = s.smoke.filter((m) => !tiles.some((t) => t.x === m.x && t.y === m.y)).concat(tiles.map((t) => ({ ...t, side: u.side })));
        if (u.ammo !== null && mi.slot === 'P') u.ammo -= 1;
        ev.push({ type: 'smoke', unit: u.id, x: p.x, y: p.y, tiles });
      } else if (mi.mode.effect === 'flare') { // FOG-6: range only, no sight needed
        if (d < mi.min || d > mi.max) return reject(state, 'out of range');
        const tiles: Pos[] = [];
        for (let y = p.y - 1; y <= p.y + 1; y++) for (let x = p.x - 1; x <= p.x + 1; x++) if (inBounds(s, x, y)) tiles.push({ x, y });
        s.flares = (s.flares ?? []).concat([{ x: p.x, y: p.y, side: u.side }]);
        if (u.ammo !== null && mi.slot === 'P') u.ammo -= 1;
        ev.push({ type: 'flare', unit: u.id, x: p.x, y: p.y, tiles });
      } else if (mi.mode.effect === 'overwatch') {
        const dir = dirTo(u, p);
        if (!dir || d > mi.weapon.def.max) return reject(state, 'a lane runs straight out in range');
        u.overwatch = { slot: mi.slot, dir }; u.facing = dir;
        ev.push({ type: 'overwatch', unit: u.id, slot: mi.slot, dir });
      } else {
        // ATK-9: every shot of the mode hits a standing object.
        if (mi.mode.target || mi.shots === 0 || mi.cls === 'indirect' || !tile.obj || !RULES.objects[tile.obj].breakable) return reject(state, 'cannot attack object');
        if (d < mi.min || d > mi.max) return reject(state, 'out of range');
        const dmg = Math.round(mi.dmg * mi.shots);
        tile.objHp = Math.max(0, tile.objHp - dmg);
        const broken = tile.objHp === 0;
        if (mi.slot === 'P' && u.ammo !== null) u.ammo -= 1;
        ev.push({ type: 'objectHit', unit: u.id, slot: mi.slot, weapon: mi.weapon.id, mode: mi.mode.id, x: p.x, y: p.y, dmg, broken });
        if (broken) breakTile(s, p.x, p.y, ev); else maybeTopple(s, p.x, p.y, u, ev);
      }
      u.drive -= mi.dp; u.fired.push(mi.slot); u.lastWalk = null;
      settle(u);
      break;
    }
    case 'patch': {
      const u = own(s, action.unit);
      const t = typeof action.target === 'string' ? unitById(s, action.target) : null;
      const pk = u ? pack(u.build.pack) : null;
      if (!u || u.done || u.drive < patchCost() || !t || !t.alive || t.side !== u.side || !pk || pk.kind !== 'repair' || u.status.packOut || u.charges <= 0) return reject(state, 'cannot patch');
      if (dist(u, t) > 1) return reject(state, 'not adjacent');
      if (!PARTS.includes(action.part)) return reject(state, 'no such part');
      const max = maxHp(t, action.part);
      if (t.hp[action.part] <= 0 || t.hp[action.part] >= max) return reject(state, 'part not repairable'); // MAN-10
      const amount = Math.min(pk.heal ?? 0, max - t.hp[action.part]);
      t.hp[action.part] += amount;
      u.charges -= 1; u.drive -= patchCost(); u.lastWalk = null;
      ev.push({ type: 'repaired', unit: u.id, target: t.id, part: action.part, amount });
      settle(u);
      break;
    }
    case 'maneuver': {
      const u = own(s, action.unit);
      if (!u || typeof action.id !== 'string') return reject(state, 'cannot maneuver');
      const slot = isSlot(action.slot) ? action.slot : null;
      const t = typeof action.target === 'string' ? unitById(s, action.target) : null;
      const tile = typeof action.x === 'number' && typeof action.y === 'number' ? { x: action.x, y: action.y } : null;
      const why = maneuverBlock(s, u, action.id, slot, t, tile);
      if (why) return reject(state, why);
      const d = maneuver(action.id)!;
      const r = maneuverRoll(action.id, slot);
      if (action.id === 'ghost-step') { // NRV-5 (Varga): a free walk after a fire order
        if (!isFacing(action.facing)) return reject(state, 'bad facing');
        const path = knownReach(s, u, stats(s, u).move).find((q) => q.x === tile!.x && q.y === tile!.y)!.path;
        u.sigUsed = true;
        walk(s, u, path, action.facing, ev, 0, d.nerve ?? 0);
        if (u.lastWalk) u.lastWalk.sig = true;
        ev.push({ type: 'signature', unit: u.id, id: action.id, targets: [] });
        settle(u);
        break;
      }
      if (action.id === 'hot-patch') { // NRV-5 (Haldane): Patch at range, with nerve for the patched pilot
        const part = action.part;
        if (!t || !part || !PARTS.includes(part) || t.hp[part] <= 0 || t.hp[part] >= maxHp(t, part)) return reject(state, 'name a damaged, not lost part');
      }
      if (action.id === 'dash') {
        if (!isFacing(action.facing)) return reject(state, 'bad facing');
        const path = dashRange(s, u).find((q) => q.x === tile!.x && q.y === tile!.y)!.path;
        walk(s, u, path, action.facing, ev, d.dp, d.nerve ?? 0);
        settle(u);
        break;
      }
      u.drive -= d.dp; u.nerve -= d.nerve ?? 0; u.lastWalk = null;
      if (slot) u.fired.push(slot);
      if (r) { resolveFire(s, u, r, t!, { reaction: null }, ev); answer(s, u, t!, ev); }
      else if (action.id === 'brace') { u.status.braced = true; ev.push({ type: 'status', unit: u.id, status: 'braced' }); }
      else if (action.id === 'plant') { u.status.planted = true; ev.push({ type: 'status', unit: u.id, status: 'planted' }); }
      else if (action.id === 'overdrive') {
        u.drive += d.gain ?? 0; u.usedThisPhase.push('overdrive');
        const sr = applyDamage(u, 'body', d.strain ?? 0, 0);
        ev.push({ type: 'overdrive', unit: u.id, gain: d.gain ?? 0, strain: sr.dmg });
      } else if (action.id === 'breakFree') releaseAll(s, u, ev);
      else if (action.id === 'mark') { t!.status.markedBy = u.side; ev.push({ type: 'status', unit: t!.id, status: 'marked' }); }
      else if (action.id === 'tow') {
        const mv = towMove(s, u, t!)!;
        const lurker = unitAt(s, mv.tower.x, mv.tower.y);
        if (lurker) ev.push({ type: 'ambush', unit: u.id, enemy: lurker.id, x: mv.tower.x, y: mv.tower.y }); // FOG-8: the tow does nothing
        else {
          u.x = mv.tower.x; u.y = mv.tower.y; t!.x = mv.ally.x; t!.y = mv.ally.y;
          ev.push({ type: 'tow', unit: u.id, ally: t!.id, x: u.x, y: u.y, ax: t!.x, ay: t!.y });
        }
      } else if (action.id === 'shunt') shunt(s, u, tile!, shuntDir(s, u, tile!)!, ev);
      else if (action.id === 'swing') { // LCK-2: open the bridge if it is closed, close it if it is open
        const tiles: Pos[] = [];
        const open = s.tiles.some((q) => q.bridge && q.t === 'deck');
        for (let yy = 0; yy < s.h; yy++) for (let xx = 0; xx < s.w; xx++) { const q = s.tiles[yy * s.w + xx]!; if (q.bridge) { q.t = open ? 'deep' : 'deck'; tiles.push({ x: xx, y: yy }); } }
        ev.push({ type: 'bridge', unit: u.id, open, tiles });
      }
      else if (d.kind === 'signature') {
        u.sigUsed = true;
        const allies = s.units.filter((a) => a.alive && a.side === u.side && a.id !== u.id);
        let targets: string[] = [];
        if (action.id === 'call-the-line') { // Marlow: +1 reserve to every ally in her sight
          for (const a of allies) if (hasLos(s, u, a)) { if (a.done) a.reserve = Math.min(RULES.drive.signatureReserveCap, a.reserve + 1); else a.bonusReserve += 1; targets.push(a.id); }
        } else if (action.id === 'shoulder-to-shoulder') { // Okonjo: Brace, and Guard every adjacent ally
          u.status.braced = true;
          if (u.hp.armL > 0 && weaponIn(u, 'L')?.def.class === 'shield') for (const a of allies) if (dist(a, u) === 1 && !u.guarding.includes(a.id)) u.guarding.push(a.id);
          targets = [...u.guarding];
        } else if (action.id === 'hot-patch') {
          const pk = pack(u.build.pack), part = action.part!;
          const amount = Math.min(pk.heal ?? 0, maxHp(t!, part) - t!.hp[part]);
          t!.hp[part] += amount; u.charges -= 1;
          ev.push({ type: 'repaired', unit: u.id, target: t!.id, part, amount });
          nerve(t!, d.nerveGift ?? 0, 'gift', ev);
          targets = [t!.id];
        } else if (action.id === 'drill-tempo') { // Hallen: +1 drive now to every ally in his sight still acting
          for (const a of allies) if (!a.done && hasLos(s, u, a)) { a.drive += d.gain ?? 0; targets.push(a.id); }
        }
        ev.push({ type: 'signature', unit: u.id, id: action.id, targets });
      }
      settle(u);
      break;
    }
    case 'standDown': {
      const u = own(s, action.unit);
      if (!u || u.done) return reject(state, 'cannot stand down');
      ev.push({ type: 'standDown', unit: u.id, reserve: standDown(u) });
      break;
    }
    case 'holdFire': {
      const u = own(s, action.unit);
      if (!u || typeof action.on !== 'boolean' || u.holdFire === action.on) return reject(state, 'nothing to change');
      u.holdFire = action.on;
      ev.push({ type: 'holdFire', unit: u.id, on: u.holdFire });
      break;
    }
    case 'endPhase': {
      const m = MISSIONS[s.mission]!;
      endPhaseFor(s, s.phase, ev);
      if (s.phase === 'player') { s.phase = 'hostile'; startPhase(s, 'hostile', ev); }
      else {
        if (s.round >= m.roundLimit) { checkEnd(s, ev, true); s.turnCount += 1; return { state: s, events: ev }; }
        s.round += 1; s.phase = 'player'; startPhase(s, 'player', ev);
      }
      ev.push({ type: 'phase', side: s.phase, round: s.round });
      break;
    }
    default:
      return reject(state, 'unknown action');
  }
  sweepGrips(s, ev);
  updateIntel(s);
  s.turnCount += 1;
  checkEnd(s, ev);
  return { state: s, events: ev };
}

/** FLD-3, FLD-4: a shunted wagon rolls along the rails, pushing the wagons coupled ahead of it (the rake). */
function shunt(s: BattleState, u: Unit, at: Pos, dir: Facing, ev: GameEvent[]): void {
  const rake: Pos[] = [{ ...at }];
  for (;;) { const n = ahead(rake[rake.length - 1]!, dir), t = tileAt(s, n.x, n.y); if (t?.rail && t.obj === 'wagon') rake.push(n); else break; }
  const start = rake.map((p) => ({ ...p }));
  const hps = rake.map((p) => tileAt(s, p.x, p.y)!.objHp);
  let hit: string | null = null, objHit: Pos | null = null;
  const after: GameEvent[] = [];
  for (let n = 0; n < RULES.wagon.roll; n++) {
    const lead = rake[rake.length - 1]!;
    const nx = ahead(lead, dir), nt = tileAt(s, nx.x, nx.y);
    if (!nt || !nt.rail) { hps[hps.length - 1]! -= RULES.wagon.collide; break; } // the end of the rails
    if (nt.obj) {
      hps[hps.length - 1]! -= RULES.wagon.collide; objHit = nx;
      if (RULES.objects[nt.obj].breakable) {
        nt.objHp = Math.max(0, nt.objHp - RULES.wagon.collide);
        if (nt.objHp === 0) breakTile(s, nx.x, nx.y, after); else maybeTopple(s, nx.x, nx.y, lead, after);
      }
      break;
    }
    const w = unitAt(s, nx.x, nx.y);
    if (w) {
      hit = w.id;
      applyDamage(w, 'body', RULES.wagon.dmg, 0);
      // Off the track sideways: towards lower x first, else higher x, else a collision (FLD-3 ruling).
      const side: Facing = pushMoves(s, w, 'W') ? 'W' : pushMoves(s, w, 'E') ? 'E' : 'W';
      push(s, u, w, ahead(w, side === 'W' ? 'E' : 'W'), after);
      knockDown(w, after);
      break;
    }
    for (let k = rake.length - 1; k >= 0; k--) {
      const from = tileAt(s, rake[k]!.x, rake[k]!.y)!, to = ahead(rake[k]!, dir), tt = tileAt(s, to.x, to.y)!;
      tt.obj = 'wagon'; tt.objHp = from.objHp; from.obj = null; from.objHp = 0;
      rake[k] = to;
    }
  }
  const cars = rake.map((p, k) => {
    const t = tileAt(s, p.x, p.y)!;
    const broken = hps[k]! <= 0;
    if (broken) { t.obj = null; t.objHp = 0; t.t = 'rubble'; } else t.objHp = hps[k]!;
    return { from: start[k]!, to: { ...p }, hp: Math.max(0, hps[k]!), broken };
  }).reverse();
  ev.push({ type: 'wagon', unit: u.id, cars, hit, obj: objHit }, ...after);
  reap(s, u.id, ev);
}

/** ARCH-2, DRV-9: never empty while the battle runs. Hold fire is a switch, not an order, and is not listed. */
export function legalActions(s: BattleState): Action[] {
  if (s.result) return [];
  const out: Action[] = [];
  for (const u of living(s, s.phase)) {
    if (u.done) continue;
    for (const r of walkRange(s, u)) if (r.x !== u.x || r.y !== u.y) for (const f of FACINGS) out.push({ type: 'walk', unit: u.id, x: r.x, y: r.y, facing: f });
    if (u.lastWalk && !u.lastWalk.reacted && !unitAt(s, u.lastWalk.from.x, u.lastWalk.from.y)) out.push({ type: 'undoWalk', unit: u.id });
    if (u.drive >= pivotCost()) for (const f of FACINGS) if (f !== u.facing) out.push({ type: 'pivot', unit: u.id, facing: f });
    for (const mi of modes(u)) {
      if (!mi.weapon.usable || u.fired.includes(mi.slot) || u.drive < mi.dp) continue;
      if (mi.mode.target === 'tile') {
        if (mi.mode.effect === 'overwatch') { for (const f of FACINGS) { const p = ahead(u, f); if (inBounds(s, p.x, p.y)) out.push({ type: 'fireAt', unit: u.id, slot: mi.slot, mode: mi.mode.id, x: p.x, y: p.y }); } }
        else for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) { const d = dist(u, { x, y }); if (d >= mi.min && d <= mi.max && indirectSight(s, u, u, { x, y })) out.push({ type: 'fireAt', unit: u.id, slot: mi.slot, mode: mi.mode.id, x, y }); }
        continue;
      }
      for (const t of s.units) {
        if (fireBlock(s, u, mi.slot, mi.mode.id, t) !== null) continue;
        if (mi.mode.call) for (const part of callable(t, u)) out.push({ type: 'fire', unit: u.id, slot: mi.slot, mode: mi.mode.id, target: t.id, part });
        else out.push({ type: 'fire', unit: u.id, slot: mi.slot, mode: mi.mode.id, target: t.id });
      }
      if (mi.shots > 0 && mi.cls !== 'indirect' && !mi.mode.target) {
        for (let y = Math.max(0, u.y - mi.max); y <= Math.min(s.h - 1, u.y + mi.max); y++)
          for (let x = Math.max(0, u.x - mi.max); x <= Math.min(s.w - 1, u.x + mi.max); x++) {
            const d = dist(u, { x, y });
            const t = tileAt(s, x, y);
            if (d >= mi.min && d <= mi.max && t?.obj && RULES.objects[t.obj].breakable) out.push({ type: 'fireAt', unit: u.id, slot: mi.slot, mode: mi.mode.id, x, y });
          }
      }
    }
    if (pack(u.build.pack).kind === 'repair' && !u.status.packOut && u.charges > 0 && u.drive >= patchCost()) {
      for (const t of living(s, u.side)) if (dist(u, t) <= 1) for (const p of PARTS)
        if (t.hp[p] > 0 && t.hp[p] < maxHp(t, p)) out.push({ type: 'patch', unit: u.id, target: t.id, part: p });
    }
    for (const m of maneuversOf(u)) {
      if (m.def.kind === 'trait' || m.id === 'patch' || m.id === 'pivot') continue;
      const base = { type: 'maneuver' as const, unit: u.id, id: m.id, ...(m.slot ? { slot: m.slot } : {}) };
      if (m.id === 'dash') { if (maneuverBlock(s, u, 'dash', null, null, null) === 'out of reach') for (const r of dashRange(s, u)) if (r.x !== u.x || r.y !== u.y) for (const f of FACINGS) out.push({ ...base, x: r.x, y: r.y, facing: f }); }
      else if (m.id === 'ghost-step') { for (const r of reachable(s, u, stats(s, u).move, u, hasTrait(u, 'hop'))) if (!maneuverBlock(s, u, m.id, null, null, r)) for (const f of FACINGS) out.push({ ...base, x: r.x, y: r.y, facing: f }); }
      else if (m.id === 'hot-patch') { for (const t of s.units) if (!maneuverBlock(s, u, m.id, null, t, null)) for (const p of PARTS) if (t.hp[p] > 0 && t.hp[p] < maxHp(t, p)) out.push({ ...base, target: t.id, part: p }); }
      else if (m.def.kind === 'attack' || m.id === 'mark' || m.id === 'tow') { for (const t of s.units) if (!maneuverBlock(s, u, m.id, m.slot, t, null)) out.push({ ...base, target: t.id }); }
      else if (m.id === 'shunt') { for (const f of FACINGS) { const p = ahead(u, f); if (!maneuverBlock(s, u, 'shunt', null, null, p)) out.push({ ...base, x: p.x, y: p.y }); } }
      else if (!maneuverBlock(s, u, m.id, m.slot, null, null)) out.push(base);
    }
    out.push({ type: 'standDown', unit: u.id });
  }
  out.push({ type: 'endPhase' });
  return out;
}

/** FOG-7: each side's last sighting of each enemy walker. */
function updateIntel(s: BattleState): void {
  if (!s.intel) return;
  for (const side of ['player', 'hostile'] as const) for (const w of s.units) {
    if (w.side === side) continue;
    if (!w.alive) { delete s.intel[side][w.id]; continue; }
    if (seenBy(s, side, w)) s.intel[side][w.id] = { x: w.x, y: w.y };
  }
}

/** ARCH-4, FOG-7: what a side may see. In daylight everything (PLAN Q3); at night, its own walkers, the enemies it sees,
 * and its own intel. The generator is hidden so no seat can read future rolls. */
export function view(s: BattleState, side: Side): BattleState {
  if (!s.night) return { ...s, rng: [0, 0, 0, 0] };
  const units = s.units.filter((w) => w.side === side || !w.alive || seenBy(s, side, w));
  const intel = { player: {}, hostile: {}, [side]: { ...(s.intel?.[side] ?? {}) } } as Record<Side, Record<string, Pos>>;
  return { ...s, units, intel, rng: [0, 0, 0, 0] };
}

export const isInside = (s: BattleState, p: Pos): boolean => inBounds(s, p.x, p.y);
export const bodyName = (id: string): string => body(id).name;
export { weaponIn };
