// The rules engine (spec 10 and spec 15). Pure: step() works on a copy and never throws (ARCH-1).
import { body, MISSIONS, pack, pilot, RULES, weapon, type MissionDef } from './data';
import { ahead, arcOf, dirTo, dist, FACINGS, inBounds, tileAt, unitAt, type Pos } from './grid';
import { next, seedRng, hashText } from './rng';
import {
  callable, cheapestMode, driveAtStart, fireBlock, guardFor, hitChance, hitWeights, indirectSight, living, maxHp, modeIn, modes,
  overwatchers, patchCost, pivotCost, returnFire, shieldCut, unitById, walkRange, weaponIn, type FireClass, type ModeInfo,
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
  return tiles;
}

const noStatus = () => ({ pinned: false, suppressed: false, staggered: false, mired: false, down: false, packOut: false });

/** A walker as it would stand on the field (also used by the hangar's summary). */
export function makeUnit(d: Deploy): Unit {
  const base: Paint = d.side === 'player' ? 'slate' : 'camo';
  const u: Unit = {
    id: d.id, pilot: d.pilot, side: d.side, role: d.role ?? 'line', x: d.x, y: d.y, facing: d.facing ?? (d.side === 'player' ? 'N' : 'S'),
    build: { ...d.build },
    paint: { body: base, armL: base, armR: base, legs: base, pack: base, ...(d.paint ?? {}) },
    hp: { body: 0, armL: 0, armR: 0, legs: 0 }, ammo: null, charges: 0,
    drive: 0, reserve: RULES.drive.startReserve, done: false, fired: [], walked: false, lastWalk: null, holdFire: false,
    nerve: pilot(d.pilot).nerve, status: noStatus(), overwatch: null, guarding: [], alive: true,
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

function destroy(s: BattleState, t: Unit, by: string, ev: GameEvent[]): void {
  t.alive = false;
  t.done = true; t.drive = 0; t.reserve = 0; t.overwatch = null; t.guarding = [];
  ev.push({ type: 'destroyed', unit: t.id, by });
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
  if (!t.alive || t.status.down) return;
  t.status.down = true;
  ev.push({ type: 'status', unit: t.id, status: 'down' });
}

/** FLD-1: push `t` one tile straight away from `from`. */
function push(s: BattleState, by: Unit, t: Unit, from: Pos, ev: GameEvent[]): void {
  if (!t.alive) return;
  const dir = dirTo(from, t);
  if (!dir) return;
  const dest = ahead(t, dir);
  const here = tileAt(s, t.x, t.y)!, there = tileAt(s, dest.x, dest.y);
  const other = there ? unitAt(s, dest.x, dest.y) : null;
  const c = RULES.push.collide;
  if (!there || there.obj || other || there.h > here.h) {
    const r = applyDamage(t, 'body', c, 0);
    let obj: { x: number; y: number; dmg: number; broken: boolean } | null = null;
    if (other) applyDamage(other, 'body', c, 0);
    if (there?.obj && RULES.objects[there.obj].breakable) {
      there.objHp = Math.max(0, there.objHp - c);
      const broken = there.objHp === 0;
      if (broken) { there.obj = null; there.t = 'rubble'; }
      obj = { x: dest.x, y: dest.y, dmg: c, broken };
    }
    ev.push({ type: 'pushed', unit: t.id, by: by.id, x: t.x, y: t.y, result: 'collide', dmg: r.dmg, other: other?.id ?? null, obj });
    return;
  }
  t.x = dest.x; t.y = dest.y;
  if (there.h < here.h) {
    const r = applyDamage(t, 'legs', RULES.push.fallLegs, 0);
    ev.push({ type: 'pushed', unit: t.id, by: by.id, x: t.x, y: t.y, result: 'fell', dmg: r.dmg, other: null, obj: null });
    knockDown(t, ev);
  } else if (there.t === 'water') {
    t.status.mired = true;
    ev.push({ type: 'pushed', unit: t.id, by: by.id, x: t.x, y: t.y, result: 'water', dmg: 0, other: null, obj: null });
  } else ev.push({ type: 'pushed', unit: t.id, by: by.id, x: t.x, y: t.y, result: 'moved', dmg: 0, other: null, obj: null });
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
function resolveFire(s: BattleState, a: Unit, mi: ModeInfo, t: Unit, opts: FireOpts, ev: GameEvent[]): { legsHit: boolean } {
  const cls: FireClass = mi.cls;
  const chance = hitChance(s, a, mi.slot, mi.mode.id, t, a, opts.reaction);
  const arc = arcOf(t, t.facing, a);
  const shots: ShotEvent[] = [];
  const after: GameEvent[] = [];
  const hitOn = new Set<string>();
  let legsHit = false;
  for (let i = 0; i < mi.shots; i++) {
    if (!t.alive || t.hp.body <= 0) break;
    const hit = next(s.rng) * 100 < chance;
    if (!hit) { shots.push({ hit: false, part: null, dmg: 0, partLost: false }); continue; }
    const raw = mi.dmg * (RULES.dmgSpread[0] + next(s.rng) * (RULES.dmgSpread[1] - RULES.dmgSpread[0]));
    const g = guardFor(s, a, t, cls);
    if (g) { // RCT-4: the guard's shield arm takes it.
      const r = applyDamage(g, 'armL', raw, shieldCut(g, 'armL', cls, arcOf(g, g.facing, a)));
      shots.push({ hit: true, part: r.part, dmg: r.dmg, partLost: r.partLost, on: g.id });
      hitOn.add(g.id);
      continue;
    }
    let part: HitSlot = opts.part ?? drawPart(s, hitWeights(cls, arc, t));
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
    if (cls === 'indirect' && mi.weapon.def.splash) { // MOD-9: only High explosive rolls; Smoke has no shots
      for (const o of s.units) {
        if (!o.alive || o.id === t.id || dist(o, t) !== 1) continue;
        const sr = applyDamage(o, 'body', mi.weapon.def.splash, 0);
        after.push({ type: 'splash', unit: a.id, target: o.id, dmg: sr.dmg, partLost: false });
      }
    }
  }
  if (mi.slot === 'P' && a.ammo !== null) a.ammo -= 1; // MOD-3
  ev.push({ type: 'attack', unit: a.id, slot: mi.slot, weapon: mi.weapon.id, mode: mi.mode.id, target: t.id, counter: opts.reaction !== null, reaction: opts.reaction, arc, chance, shots });
  ev.push(...after);
  reap(s, a.id, ev);
  // MOD-6, MOD-7: effects land on each walker that took a hit.
  const fx = mi.mode.effect;
  for (const id of [...hitOn].sort()) {
    const v = unitById(s, id);
    if (!v || !v.alive) continue;
    if (fx === 'pin' && !v.status.pinned) { v.status.pinned = true; ev.push({ type: 'status', unit: v.id, status: 'pinned' }); }
    if (fx === 'stagger' && !v.status.staggered) { v.status.staggered = true; ev.push({ type: 'status', unit: v.id, status: 'staggered' }); }
    if (fx === 'knockdown') knockDown(v, ev);
    if (fx === 'push') push(s, a, v, a, ev);
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
    credits: { fee: win ? m.fee : 0, bonus: win && s.round <= m.bonusRound ? m.bonus : 0, bounty: win ? lost.hostile * m.bounty : 0 },
  };
  ev.push({ type: 'end', result: s.result });
}

/** DRV-1, DRV-6, FLD-6: a side's phase starts. */
function startPhase(s: BattleState, side: Side, ev: GameEvent[]): void {
  const before = s.smoke.length;
  s.smoke = s.smoke.filter((m) => m.side !== side);
  if (s.smoke.length !== before) ev.push({ type: 'smokeClear', side });
  for (const u of s.units) {
    if (u.side !== side || !u.alive) continue;
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
  if (!u.done) { u.reserve = Math.min(RULES.drive.reserveCap, u.drive); u.done = true; }
  u.drive = 0; u.lastWalk = null;
  return u.reserve;
}

function endPhaseFor(s: BattleState, side: Side): void {
  for (const u of s.units) if (u.side === side && u.alive) { standDown(u); u.status.suppressed = false; }
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
function walk(s: BattleState, u: Unit, path: Pos[], facing: Facing, ev: GameEvent[]): void {
  const from = { x: u.x, y: u.y };
  const lw = { from, facing: u.facing, dp: RULES.drive.walk, dir: null as Facing | null, steps: 0, reacted: false, wasWalked: u.walked };
  u.drive -= RULES.drive.walk; u.walked = true;
  let seg: Pos[] = [{ ...from }];
  let stopped = false;
  const dirs: Facing[] = [];
  for (let i = 1; i < path.length && !stopped; i++) {
    const prev = path[i - 1]!, p = path[i]!;
    const d = dirTo(prev, p)!;
    dirs.push(d);
    u.x = p.x; u.y = p.y; u.facing = d;
    seg.push({ ...p });
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
  if (seg.length > 1 || !lw.reacted) ev.push({ type: 'walked', unit: u.id, path: seg, facing: u.facing });
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
      u.x = lw.from.x; u.y = lw.from.y; u.facing = lw.facing; u.drive += lw.dp; u.walked = lw.wasWalked; u.lastWalk = null;
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
        if (broken) { tile.obj = null; tile.t = 'rubble'; }
        if (mi.slot === 'P' && u.ammo !== null) u.ammo -= 1;
        ev.push({ type: 'objectHit', unit: u.id, slot: mi.slot, weapon: mi.weapon.id, mode: mi.mode.id, x: p.x, y: p.y, dmg, broken });
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
      endPhaseFor(s, s.phase);
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
  s.turnCount += 1;
  checkEnd(s, ev);
  return { state: s, events: ev };
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
    out.push({ type: 'standDown', unit: u.id });
  }
  out.push({ type: 'endPhase' });
  return out;
}

/** ARCH-4: what a side may see. No fog in mission 1 (PLAN Q3); the generator is hidden so no seat can read future rolls. */
export function view(s: BattleState, _side: Side): BattleState {
  return { ...s, rng: [0, 0, 0, 0] };
}

export const isInside = (s: BattleState, p: Pos): boolean => inBounds(s, p.x, p.y);
export const bodyName = (id: string): string => body(id).name;
export { weaponIn };
