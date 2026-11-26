// AI v2 (spec 15, slice 5f): plans a walker's whole turn inside its drive. A plan is
//   [overdrive?] [walk or dash?] [up to two orders] [second walk?] [pivot?] -> stand down, the rest kept as reserve.
// Each order is scored by what it buys (expected damage, kills, called parts, pins, pushes, knockdowns, marks, smoke, a
// lane, a guard, a wagon), the end tile by the threat it faces and the cover it has, and the reserve by the return fire it
// would give. Only the plan's first order is returned; the next call plans again from the new state.
// Pure function of view(state, side) (ARCH-4): no DOM, no three.js, no randomness.
import { pack, RULES } from '../engine/data';
import { ahead, arcOf, dirTo, dist, FACINGS, hasCover, line, reachable, tileAt, unitAt, type Pos } from '../engine/grid';
import {
  callable, canHitAny, chanceOf, cheapestMode, dashRange, expectedOf, faceToward, fireBlock, living, maneuverBlock, maneuverRoll,
  maneuversOf, maxHp, modes, overwatchers, returnFire, shieldCut, shuntDir, stats, walkRange, weapons, type Roll,
} from '../engine/query';
import { step } from '../engine/step';
import type { Action, BattleState, Facing, HitSlot, Side, Unit, WeaponSlot } from '../engine/types';
import { distanceField, shuntValue, signaturePlan, walkInfo } from './simple';

interface Cand { action: Action; dp: number; slot: WeaponSlot | null; value: number; target: string | null; kill: boolean; kind: string }
interface TurnPlan { steps: Action[]; value: number }

const WALK_COST = 2;
const K_PACK = 3;

class Ctx {
  readonly enemies: Unit[];
  readonly allies: Unit[];
  readonly field: number[];
  readonly ranged: boolean;
  readonly lanes: boolean;
  private pos = new Map<string, { v: number; f: Facing }>();
  private threat = new Map<string, number>();
  /** Each enemy's hardest-hitting direct or melee mode per hand, worked out once. */
  private mains: { e: Unit; mi: Roll; reach: number }[] = [];
  constructor(readonly s: BattleState, readonly u: Unit) {
    this.enemies = s.units.filter((e) => e.alive && e.side !== u.side);
    this.allies = s.units.filter((a) => a.alive && a.side === u.side && a.id !== u.id);
    this.field = distanceField(s, u.side);
    this.ranged = u.role === 'rifle' || u.role === 'mortar' || weapons(u).every((w) => w.def.class !== 'melee' && w.def.max >= 5);
    this.lanes = this.enemies.some((e) => e.overwatch && e.reserve > 0);
    for (const e of s.units) {
      if (!e.alive) continue;
      const reach = stats(s, e).move;
      for (const w of weapons(e)) {
        if (!w.usable || w.def.class === 'indirect' || w.def.class === 'shield') continue;
        const mi = modes(e).filter((m) => m.slot === w.slot && m.shots > 0).sort((a, b) => b.shots * b.dmg - a.shots * a.dmg)[0];
        if (mi) this.mains.push({ e, mi, reach: reach + mi.max });
      }
    }
  }
  /** The incoming fire a walker standing at `at` facing `f` should expect in the enemy phase. */
  threatOf(w: Unit, at: Pos, f: Facing): number {
    const k = `${w.id}|${at.x},${at.y}|${f}`;
    let v = this.threat.get(k);
    if (v === undefined) {
      const ghost = { ...w, x: at.x, y: at.y, facing: f };
      v = 0;
      for (const m of this.mains) if (m.e.side !== w.side && dist(m.e, at) <= m.reach) v += expectedOf(this.s, m.e, m.mi, ghost, m.e) * 0.5;
      this.threat.set(k, v);
    }
    return v;
  }
  /** The worth of ending the turn at `at`: threat by the best facing, cover, height, and the pull toward the fight. */
  place(at: Pos): { v: number; f: Facing } {
    const k = `${at.x},${at.y}`;
    const hit = this.pos.get(k);
    if (hit) return hit;
    let best: { v: number; f: Facing } = { v: -Infinity, f: this.u.facing };
    const cover = this.enemies.reduce((a, e) => a + (hasCover(this.s, e, at) ? 3 : 0), 0);
    const high = (tileAt(this.s, at.x, at.y)?.h ?? 0) * 3;
    const d = this.field[at.y * this.s.w + at.x] ?? 30;
    const pull = this.ranged ? -Math.abs(d - 4) * 2.5 : -d * 2.5;
    for (const f of FACINGS) {
      const v = -this.threatOf(this.u, at, f) * 0.3 + cover + high + pull;
      if (v > best.v) best = { v, f };
    }
    this.pos.set(k, best);
    return best;
  }
  /** What an enemy could deal in its next phase (its best mode on the nearest of us), for valuing pins. */
  output(e: Unit): number {
    let best = 0;
    for (const m of this.mains) {
      if (m.e.id !== e.id) continue;
      for (const a of [this.u, ...this.allies]) if (dist(e, a) <= m.reach) best = Math.max(best, expectedOf(this.s, e, m.mi, a, e));
    }
    return best;
  }
  /** NRV: a point of nerve is worth more near the Steady line, where it buys +10 to hit and the signature. */
  nerveWorth(from: number, spend: number): number {
    let v = 0;
    for (let n = from; n > from - spend; n--) v += n === RULES.nerve.steady ? 14 : n === RULES.nerve.shaken + 1 ? 14 : 4;
    return v;
  }
  /** Fire an enemy lane would put on a walk along `path`. */
  pathCost(path: Pos[]): number {
    if (!this.lanes) return 0;
    let c = 0;
    for (let i = 1; i < path.length; i++) {
      const p = path[i]!;
      if (unitAt(this.s, p.x, p.y)) continue;
      for (const o of overwatchers(this.s, { ...this.u, x: p.x, y: p.y }, p)) {
        const mi = cheapestMode(o, o.overwatch!.slot);
        if (mi) c += expectedOf(this.s, o, mi, { ...this.u, x: p.x, y: p.y }, o) + 5;
      }
    }
    return c;
  }
}

/** FLD-1: what a push of `e` away from `from` would do to it. */
function pushValue(s: BattleState, e: Unit, from: Pos): number {
  if (e.status.braced) return 0;
  const dir = dirTo(from, e);
  if (!dir) return 0;
  const d = ahead(e, dir), here = tileAt(s, e.x, e.y)!, q = tileAt(s, d.x, d.y);
  if (!q || q.obj || unitAt(s, d.x, d.y) || q.h > here.h) {
    const topple = q?.stack && q.obj === 'container' && q.objHp - RULES.push.collide <= RULES.stack.toppleAt && q.objHp > RULES.push.collide ? 10 : 0;
    return RULES.push.collide + topple;
  }
  if (q.h < here.h) return RULES.push.fallLegs + 15;
  if (q.t === 'water') return 8;
  return 3;
}

/** A roll's worth against `e` (HIT, MOD, MAN-4): expected damage, kills, parts, effects, minus the return fire it draws. */
function rollValue(c: Ctx, g: Unit, r: Roll, e: Unit, at: Pos, part?: HitSlot): { v: number; kill: boolean } {
  const s = c.s;
  const p = chanceOf(s, g, r, e, at) / 100;
  const ph = 1 - Math.pow(1 - p, Math.max(1, r.shots));
  const arc = arcOf(e, e.facing, at);
  let E: number;
  if (part) E = r.shots * p * r.dmg * (1 - shieldCut(e, part, r.cls, arc));
  else E = expectedOf(s, g, r, e, at);
  let v = E;
  let kill = false;
  if (!part || part === 'body') { if (E >= e.hp.body * 0.9) { v += 40; kill = true; } }
  if (part === 'armL' || part === 'armR') {
    const w = part === 'armL' ? e.build.wL : e.build.wR;
    if (E >= e.hp[part] * 0.9 && e.hp[part] > 0) v += w ? 25 : 6;
  }
  if (part === 'legs' && E >= e.hp.legs * 0.9 && e.hp.legs > 0) v += 20;
  if (part === 'pack') v += ph * (pack(e.build.pack).cookOff && (e.ammo ?? 0) > 0 ? RULES.cookOff.self + 15 : 10);
  const fx = r.mode.effect;
  if (fx === 'pin' && !e.status.pinned) v += ph * (6 + 0.35 * c.output(e)); // -1 drive and -10 to hit in its next phase
  if (fx === 'stagger') v += ph * 6;
  if (fx === 'knockdown' && !e.status.braced && !e.status.down) v += ph * 15;
  if (fx === 'push') {
    let pv = pushValue(s, e, at);
    const dir = dirTo(at, e);
    if ((r.mode.pushes ?? 1) > 1 && dir && pv === 3) { const d1 = ahead(e, dir); pv += pushValue(s, { ...e, x: d1.x, y: d1.y }, ahead(d1, dir, -1)); }
    v += ph * pv;
  }
  if (fx === 'grab') v += ph * (weapons(e).some((w) => w.def.class === 'melee') ? 12 : 5);
  v += (1 - e.hp.body / maxHp(e, 'body')) * 10 * Math.min(1, p * r.shots);
  if (r.cls !== 'indirect' && r.shots > 0) {
    const rf = returnFire(s, e, g, at);
    if (rf) v -= 0.6 * expectedOf(s, e, rf, { ...g, x: at.x, y: at.y }, e, 'return');
  }
  if (r.slot === 'P' && g.ammo !== null) v -= g.ammo <= 1 ? 8 : 4;
  return { v, kill };
}

/** FLD-6: smoke at `center` is worth the enemy fire on our walkers it would block or cover in the enemy phase. */
function smokeValue(c: Ctx, center: Pos): number {
  const r = RULES.smokeRadius;
  const inSmoke = (p: Pos) => Math.abs(p.x - center.x) <= r && Math.abs(p.y - center.y) <= r;
  let v = 0;
  for (const a of [c.u, ...c.allies]) for (const e of c.enemies) {
    if (dist(a, e) > 8) continue;
    const pts = line(e, a);
    const blocked = pts.slice(1, -1).some(inSmoke);
    if (blocked || inSmoke(a)) v += blocked ? 7 : 3;
  }
  return v;
}

/** RCT-3: a lane is worth the snap it would fire at an enemy likely to walk through it. */
function laneValue(c: Ctx, g: Unit, at: Pos, f: Facing, slot: WeaponSlot): number {
  const w = weapons(g).find((x) => x.slot === slot);
  const mi = cheapestMode(g, slot);
  if (!w || !mi) return 0;
  const tiles: Pos[] = [];
  for (let n = 1; n <= w.def.max; n++) { const p = ahead(at, f, n); if (!tileAt(c.s, p.x, p.y)) break; tiles.push(p); }
  let best = 0;
  for (const e of c.enemies) {
    const mv = stats(c.s, e).move;
    const t = tiles.find((p) => dist(e, p) <= mv && dist(e, p) >= 1);
    if (!t) continue;
    const ghost = { ...e, x: t.x, y: t.y };
    const v = 0.5 * expectedOf(c.s, { ...g, x: at.x, y: at.y }, mi, ghost, at) + 4;
    if (v > best) best = v;
  }
  return best;
}

/** Every order `g` (the walker at `at`, with its drive left) could give, with its worth. */
function candidates(c: Ctx, g: Unit, at: Pos): Cand[] {
  const s = c.s, out: Cand[] = [];
  const ga = { ...g, x: at.x, y: at.y };
  for (const mi of modes(ga)) {
    if (!mi.weapon.usable || ga.fired.includes(mi.slot) || mi.dp > ga.drive) continue;
    const base = { dp: mi.dp, slot: mi.slot as WeaponSlot | null, kill: false };
    if (mi.mode.target === 'tile') {
      if (mi.mode.effect === 'smoke') {
        for (const a of [c.u, ...c.allies]) {
          const p = { x: a.x === c.u.x && a.y === c.u.y ? at.x : a.x, y: a.x === c.u.x && a.y === c.u.y ? at.y : a.y };
          const d = dist(at, p);
          if (d < mi.min || d > mi.max) continue;
          const v = smokeValue(c, p) - 6;
          if (v > 0) out.push({ ...base, action: { type: 'fireAt', unit: g.id, slot: mi.slot, mode: mi.mode.id, x: p.x, y: p.y }, value: v, target: null, kind: 'smoke' });
        }
      } else if (mi.mode.effect === 'overwatch') {
        for (const f of FACINGS) {
          const p = ahead(at, f);
          if (!tileAt(s, p.x, p.y)) continue;
          const v = laneValue(c, ga, at, f, mi.slot);
          if (v > 0) out.push({ ...base, action: { type: 'fireAt', unit: g.id, slot: mi.slot, mode: mi.mode.id, x: p.x, y: p.y }, value: v, target: null, kind: `lane:${f}` });
        }
      }
      continue;
    }
    if (mi.mode.target === 'ally') {
      for (const a of c.allies) {
        if (dist(a, at) !== 1) continue;
        const v = c.threatOf(a, a, a.facing) * 0.35 * 0.6;
        if (v > 2) out.push({ ...base, action: { type: 'fire', unit: g.id, slot: mi.slot, mode: mi.mode.id, target: a.id }, value: v, target: a.id, kind: 'guard' });
      }
      continue;
    }
    for (const e of c.enemies) {
      if (fireBlock(s, ga, mi.slot, mi.mode.id, e, at) !== null) continue;
      if (mi.mode.call) {
        for (const part of callable(e, at)) {
          const r = rollValue(c, ga, mi, e, at, part);
          out.push({ ...base, action: { type: 'fire', unit: g.id, slot: mi.slot, mode: mi.mode.id, target: e.id, part }, value: r.v, target: e.id, kill: r.kill, kind: 'fire' });
        }
      } else {
        const r = rollValue(c, ga, mi, e, at);
        out.push({ ...base, action: { type: 'fire', unit: g.id, slot: mi.slot, mode: mi.mode.id, target: e.id }, value: r.v, target: e.id, kill: r.kill, kind: 'fire' });
      }
    }
  }
  for (const m of maneuversOf(ga)) {
    if (m.def.kind === 'trait' || m.def.kind === 'signature' || m.def.dp > ga.drive) continue;
    const base = { dp: m.def.dp, slot: m.slot, kill: false };
    const act = (extra: Partial<Extract<Action, { type: 'maneuver' }>>): Action => ({ type: 'maneuver', unit: g.id, id: m.id, ...(m.slot ? { slot: m.slot } : {}), ...extra });
    if (m.def.kind === 'attack') {
      const r = maneuverRoll(m.id, m.slot)!;
      for (const e of c.enemies) {
        if (maneuverBlock(s, ga, m.id, m.slot, e, null) !== null) continue;
        const rv = rollValue(c, ga, r, e, at);
        out.push({ ...base, action: act({ target: e.id }), value: rv.v, target: e.id, kill: rv.kill, kind: 'fire' });
      }
    } else if (m.id === 'mark') {
      for (const e of c.enemies) {
        if (maneuverBlock(s, ga, 'mark', null, e, null) !== null) continue;
        const n = c.allies.filter((a) => !a.done && canHitAny(s, a, e)).length;
        if (n) out.push({ ...base, action: act({ target: e.id }), value: 7 * n, target: e.id, kind: 'mark' });
      }
    } else if (m.id === 'shunt') {
      for (const f of FACINGS) {
        const p = ahead(at, f);
        if (!shuntDir(s, ga, p) || maneuverBlock(s, ga, 'shunt', null, null, p)) continue;
        const v = shuntValue(s, ga, p);
        if (v > 0) out.push({ ...base, action: act({ x: p.x, y: p.y }), value: v, target: null, kind: 'shunt' });
      }
    } else if (m.id === 'brace' && !ga.status.braced) {
      const pushers = c.enemies.filter((e) => dist(e, at) <= stats(s, e).move + 1 && (modes(e).some((x) => x.mode.effect === 'push' || x.mode.effect === 'knockdown') || maneuversOf(e).some((x) => x.def.effect === 'push'))).length;
      if (pushers) out.push({ ...base, action: act({}), value: pushers * 7 - 3, target: null, kind: 'brace' });
    } else if (m.id === 'tow') {
      for (const a of c.allies) {
        if (maneuverBlock(s, ga, 'tow', null, a, null) !== null) continue;
        const dir = dirTo(a, at)!;
        const to = { x: at.x, y: at.y }, me = ahead(at, dir);
        const v = c.threatOf(a, a, a.facing) * 0.5 - c.threatOf(a, to, a.facing) * 0.5 + (a.status.down ? 6 : 0) - 2;
        if (v > 0) out.push({ ...base, action: act({ target: a.id }), value: v, target: a.id, kind: 'tow' });
        void me;
      }
    } else if (m.id === 'plant' && !ga.status.planted) {
      const behind = c.allies.some((a) => dist(a, at) === 1);
      if (behind) out.push({ ...base, action: act({}), value: 4, target: null, kind: 'plant' });
    }
  }
  // MAN-10: Patch.
  if (pack(ga.build.pack).kind === 'repair' && !ga.status.packOut && ga.charges > 0 && ga.drive >= (maneuversOf(ga).find((m) => m.id === 'patch')?.def.dp ?? 2)) {
    const heal = pack(ga.build.pack).heal ?? 0;
    for (const a of [ga, ...c.allies]) {
      if (dist(a, at) > 1) continue;
      for (const p of ['body', 'legs', 'armR', 'armL'] as const) {
        const miss = maxHp(a, p) - a.hp[p];
        if (a.hp[p] <= 0 || miss < 15) continue;
        out.push({ dp: 2, slot: null, kill: false, action: { type: 'patch', unit: g.id, target: a.id, part: p }, value: Math.min(heal, miss) * (p === 'body' ? 1 : 0.7), target: a.id, kind: 'patch' });
      }
    }
  }
  return out;
}

/** Up to two orders inside the drive, different slots (DRV-4), best first; the empty package always counts. */
function packages(cands: Cand[], drive: number): { cands: Cand[]; value: number; dp: number }[] {
  const sorted = [...cands].sort((a, b) => b.value - a.value);
  const out: { cands: Cand[]; value: number; dp: number }[] = [{ cands: [], value: 0, dp: 0 }];
  const clash = (a: Cand, b: Cand) => (a.slot !== null && a.slot === b.slot) || (a.kind === b.kind && (a.kind === 'mark' || a.kind === 'smoke' || a.kind.startsWith('lane') || a.kind === 'patch' || a.kind === 'brace' || a.kind === 'plant'));
  for (const first of sorted.slice(0, K_PACK)) {
    if (first.value <= 0 || first.dp > drive) continue;
    out.push({ cands: [first], value: first.value, dp: first.dp });
    let second: Cand | null = null, sv = 0;
    for (const c of sorted) {
      if (c === first || c.dp > drive - first.dp || clash(first, c)) continue;
      const v = c.value * (first.kill && c.target === first.target ? 0.3 : 1);
      if (v > sv) { sv = v; second = c; }
    }
    if (second) {
      // Support orders (mark) go before the shot they help.
      const order = second.kind === 'mark' ? [second, first] : [first, second];
      out.push({ cands: order, value: first.value + sv, dp: first.dp + second.dp });
    }
  }
  return out;
}

/** DRV-6: reserve is worth the return fire it can give at `at` facing `f`. */
function reserveValue(c: Ctx, r: number, at: Pos, f: Facing): number {
  const n = Math.min(RULES.drive.reserveCap, r);
  if (n <= 0) return 0;
  const front = c.enemies.some((e) => dist(e, at) <= 8 && arcOf(at, f, e) === 'front');
  const w1 = front ? 7 : 2;
  return w1 + (n >= 2 ? w1 * 0.5 : 0);
}

function planTurn(c: Ctx, drive: number, opening: Action[], extraCost: number): TurnPlan {
  const { s, u } = c;
  const holding = u.role === 'commander' && s.round < 4 && !c.enemies.some((e) => dist(e, u) <= 7);
  const starts: { at: Pos; path: Pos[]; dp: number; nerve: number; act: 'walk' | 'dash' | null }[] = [{ at: { x: u.x, y: u.y }, path: [{ x: u.x, y: u.y }], dp: 0, nerve: 0, act: null }];
  const ghostU = { ...u, drive };
  if (drive >= RULES.drive.walk) {
    for (const r of walkRange(s, ghostU)) if ((r.x !== u.x || r.y !== u.y) && (!holding || dist(r, u) <= 1)) starts.push({ at: r, path: r.path, dp: RULES.drive.walk, nerve: 0, act: 'walk' });
    if (!holding && maneuversOf(u).some((m) => m.id === 'dash') && u.nerve >= 2) {
      const plain = new Set(starts.map((t) => `${t.at.x},${t.at.y}`));
      for (const r of dashRange(s, ghostU)) if (!plain.has(`${r.x},${r.y}`)) starts.push({ at: r, path: r.path, dp: 1, nerve: 1, act: 'dash' });
    }
  }
  let best: TurnPlan = { steps: [], value: -Infinity };
  for (const st of starts) {
    const moved = st.act !== null;
    const g: Unit = moved ? { ...u, x: st.at.x, y: st.at.y, drive: drive - st.dp, walked: true, lastWalk: walkInfo(u, st.path), nerve: u.nerve - st.nerve } : { ...u, drive };
    const here = c.place(st.at);
    const cost1 = (moved ? WALK_COST + c.pathCost(st.path) : 0) + c.nerveWorth(u.nerve, st.nerve);
    let onward: ReturnType<typeof reachable> | null = null;
    for (const pk of packages(candidates(c, g, st.at), g.drive)) {
      let r = g.drive - pk.dp;
      const lane = pk.cands.find((x) => x.kind.startsWith('lane'));
      const guard = pk.cands.some((x) => x.kind === 'guard');
      // End where we stand: free facing if we walked here and give no other order after; otherwise a pivot costs 1.
      const endFacing = lane ? (lane.kind.slice(5) as Facing) : moved ? here.f : u.facing;
      let tail: Action[] = [];
      let endV = c.place(st.at).v - (endFacing === here.f ? 0 : 0) + (endFacing !== here.f ? -c.threatOf(u, st.at, endFacing) * 0.3 + c.threatOf(u, st.at, here.f) * 0.3 : 0);
      let endAt = st.at, endF = endFacing;
      if (!moved && !lane && here.f !== u.facing && r >= 1) {
        const pv = here.v + reserveValue(c, r - 1, st.at, here.f);
        const sv = endV + reserveValue(c, r, st.at, u.facing);
        if (pv > sv) { tail = [{ type: 'pivot', unit: u.id, facing: here.f }]; endV = here.v; endF = here.f; r -= 1; }
      }
      let total = pk.value + endV + reserveValue(c, r, endAt, endF) - cost1;
      if (lane && r < 1) total -= lane.value; // a lane needs a reserve point to fire
      // Or walk on after the orders (shoot and scoot), when the drive allows and nothing ties us here.
      if (r >= RULES.drive.walk && !guard && !lane && !u.status.grabbedBy) {
        onward ??= reachable(s, g, stats(s, g).move, st.at);
        for (const t2 of onward) {
          if (t2.x === st.at.x && t2.y === st.at.y) continue;
          if (holding && dist(t2, u) > 1) continue;
          const p2 = c.place(t2);
          const v2 = pk.value + p2.v + reserveValue(c, r - 1, t2, p2.f) - cost1 - WALK_COST - c.pathCost(t2.path);
          if (v2 > total) { total = v2; endAt = t2; endF = p2.f; tail = [{ type: 'walk', unit: u.id, x: t2.x, y: t2.y, facing: p2.f }]; }
        }
      }
      if (total - extraCost > best.value) {
        const first: Action[] = st.act === 'walk' ? [{ type: 'walk', unit: u.id, x: st.at.x, y: st.at.y, facing: endFacing }]
          : st.act === 'dash' ? [{ type: 'maneuver', unit: u.id, id: 'dash', x: st.at.x, y: st.at.y, facing: endFacing }] : [];
        best = { steps: [...opening, ...first, ...pk.cands.map((x) => x.action), ...tail], value: total - extraCost };
      }
    }
  }
  return best;
}

function orderFor(s: BattleState, u: Unit): Action {
  const fresh = !u.walked && !u.fired.length;
  const opening = fresh ? signaturePlan(s, u, 'start') : null;
  if (opening) return opening;
  const c = new Ctx(s, u);
  let plan = planTurn(c, u.drive, [], 0);
  // MAN-8: try the turn with Overdrive's two extra drive, at its cost in body and nerve.
  const od0 = maneuversOf(u).find((m) => m.id === 'overdrive');
  if (od0 && !maneuverBlock(s, u, 'overdrive', null, null, null) && u.hp.body > 40) {
    const cost = (od0.def.strain ?? 0) * 1.2 + c.nerveWorth(u.nerve, od0.def.nerve ?? 0);
    const od = planTurn(c, u.drive + 2, [{ type: 'maneuver', unit: u.id, id: 'overdrive' }], cost);
    if (od.value > plan.value + 4) plan = od;
  }
  const next = plan.steps[0];
  if (next) return next;
  const late = (u.fired.length ? signaturePlan(s, u, 'afterFire') : null) ?? signaturePlan(s, u, 'end');
  return late ?? { type: 'standDown', unit: u.id };
}

/** AI v2's next order for the side to act. */
export function planOrder(v: BattleState): Action {
  const side: Side = v.phase;
  const field = distanceField(v, side);
  const ready = living(v, side).filter((u) => !u.done);
  if (!ready.length) return { type: 'endPhase' };
  // Walkers with the shortest way to the enemy act first, so the front line shapes the field for the rest.
  ready.sort((a, b) => (field[a.y * v.w + a.x]! - field[b.y * v.w + b.x]!) || a.id.localeCompare(b.id));
  const u = ready[0]!;
  const a = orderFor(v, u);
  // Never hand back an order the engine refuses: the plan's numbers are estimates, the rules are not.
  if (step(v, a).events[0]?.type === 'rejected') return { type: 'standDown', unit: u.id };
  return a;
}
