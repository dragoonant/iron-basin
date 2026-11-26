// Combat v2 (docs/spec/15-combat-v2.md). Each id is pending (it.todo) until its slice lands, then a real test.
// tests/coverage.test.ts checks that every spec 15 id appears here.
import { describe, expect, it } from 'vitest';
import { PARTS, RULES } from '../src/engine/data';
import { arcOf, hasCover, hasLos } from '../src/engine/grid';
import {
  callable, dashRange, fireBlock, hasTrait, hitChance, hitWeights, maneuverBlock, maneuversOf, overwatchers, returnFire, shieldCut, spotted, stats, walkRange,
} from '../src/engine/query';
import { seedRng } from '../src/engine/rng';
import { legalActions, newBattle, step, view } from '../src/engine/step';
import { runBattle, replay } from '../src/sim/run';
import { hash } from '../src/engine/step';
import { PILOTS } from '../src/engine/data';
import type { Action, BattleState, GameEvent, Side } from '../src/engine/types';
import { arena, place, u } from './helpers';

const tile = (s: BattleState, x: number, y: number) => s.tiles[y * s.w + x]!;
const fresh1 = () => arena(['marlow', 'haldane', 'dir-2', 'dir-1']);
/** Give `side` the phase with fresh drive, as DRV-1 would, without the rest of the phase change. */
function turn(s: BattleState, side: Side): BattleState {
  s.phase = side;
  for (const w of s.units) if (w.side === side) { w.drive = stats(s, w).drive; w.done = false; w.fired = []; w.walked = false; w.lastWalk = null; }
  return s;
}
const ok = (s: BattleState, a: Action) => { const r = step(s, a); expect(r.events[0]?.type, JSON.stringify(r.events[0])).not.toBe('rejected'); return r; };
const no = (s: BattleState, a: Action) => expect(step(s, a).events[0]?.type).toBe('rejected');
/** Re-seed until an order lands at least one hit on `target` (or `cond` holds). */
function until(s: BattleState, a: Action, cond: (ev: GameEvent[], st: BattleState) => boolean) {
  for (let seed = 1; seed < 200; seed++) { s.rng = seedRng(seed); const r = step(s, a); if (cond(r.events, r.state)) return r; }
  throw new Error('never happened');
}
const hitOn = (id: string) => (ev: GameEvent[]) => ev.some((e) => e.type === 'attack' && !e.counter && e.shots.some((h) => h.hit && (h.on ?? e.target) === id));
const endBoth = (s: BattleState) => step(step(s, { type: 'endPhase' }).state, { type: 'endPhase' }).state;

describe('drive (slice 5b)', () => {
  it('DRV-1 a phase starts with the body’s drive less the carried penalties, which then clear', () => {
    let s = arena(['marlow', 'varga', 'dir-2']);
    expect([u(s, 'marlow').drive, u(s, 'varga').drive]).toEqual([4, 5]);
    u(s, 'marlow').status.pinned = true; u(s, 'varga').status.down = true;
    s = endBoth(s);
    expect(u(s, 'marlow').drive).toBe(4 - RULES.drive.pinned);
    expect(u(s, 'marlow').status).toMatchObject({ pinned: false, suppressed: true });
    expect(u(s, 'varga').drive).toBe(5 - RULES.drive.knockedDown);
    expect(u(s, 'varga').status.down).toBe(false);
  });
  it('DRV-2 orders of different walkers interleave; an order costing more than the drive left is illegal', () => {
    let s = arena(['marlow', 'haldane', 'dir-2']);
    place(s, 'marlow', 4, 12); place(s, 'haldane', 6, 12); place(s, 'dir-2', 5, 9);
    s = ok(s, { type: 'walk', unit: 'marlow', x: 4, y: 11, facing: 'N' }).state;
    s = ok(s, { type: 'walk', unit: 'haldane', x: 6, y: 11, facing: 'N' }).state;
    s = ok(s, { type: 'walk', unit: 'marlow', x: 4, y: 12, facing: 'N' }).state;
    u(s, 'marlow').drive = 2;
    expect(step(s, { type: 'fire', unit: 'marlow', slot: 'R', mode: 'aimed', target: 'dir-2', part: 'body' }).events[0]).toMatchObject({ type: 'rejected', reason: 'needs 3 drive' });
  });
  it('DRV-3 a walk costs 1, ends facing the way it names, and may be repeated', () => {
    let s = arena(['marlow', 'dir-2']);
    place(s, 'marlow', 5, 10); place(s, 'dir-2', 0, 0);
    s = ok(s, { type: 'walk', unit: 'marlow', x: 5, y: 8, facing: 'E' }).state;
    expect([u(s, 'marlow').drive, u(s, 'marlow').facing]).toEqual([3, 'E']);
    s = ok(s, { type: 'walk', unit: 'marlow', x: 7, y: 8, facing: 'S' }).state;
    expect(u(s, 'marlow').drive).toBe(2);
  });
  it('DRV-4 each weapon slot gives one order a phase', () => {
    let s = arena(['marlow', 'dir-2']);
    place(s, 'marlow', 5, 11); place(s, 'dir-2', 5, 8);
    s = ok(s, { type: 'fire', unit: 'marlow', slot: 'R', mode: 'burst', target: 'dir-2' }).state;
    expect(step(s, { type: 'fire', unit: 'marlow', slot: 'R', mode: 'suppress', target: 'dir-2' }).events[0]).toMatchObject({ type: 'rejected', reason: 'this weapon has given its order this phase' });
    ok(s, { type: 'fire', unit: 'marlow', slot: 'L', mode: 'double', target: 'dir-2' });
  });
  it('DRV-5 stand down ends the walker’s orders; spending the last drive stands it down', () => {
    let s = arena(['marlow', 'haldane', 'dir-2']);
    place(s, 'marlow', 5, 11); place(s, 'dir-2', 5, 8);
    s = ok(s, { type: 'standDown', unit: 'haldane' }).state;
    no(s, { type: 'walk', unit: 'haldane', x: u(s, 'haldane').x, y: u(s, 'haldane').y - 1, facing: 'N' });
    s = ok(s, { type: 'fire', unit: 'marlow', slot: 'R', mode: 'burst', target: 'dir-2' }).state;
    s = ok(s, { type: 'fire', unit: 'marlow', slot: 'L', mode: 'double', target: 'dir-2' }).state;
    expect([u(s, 'marlow').done, u(s, 'marlow').reserve]).toEqual([true, 0]);
  });
  it('DRV-6 drive left becomes reserve (capped), lost when the own phase starts; walkers start with reserve 1', () => {
    let s = arena(['marlow', 'haldane', 'dir-2']);
    expect(u(s, 'dir-2').reserve).toBe(RULES.drive.startReserve);
    s = ok(s, { type: 'walk', unit: 'marlow', x: u(s, 'marlow').x, y: u(s, 'marlow').y - 1, facing: 'N' }).state;
    s = ok(s, { type: 'standDown', unit: 'marlow' }).state;
    expect(u(s, 'marlow').reserve).toBe(RULES.drive.reserveCap);
    u(s, 'haldane').drive = 1;
    s = step(s, { type: 'endPhase' }).state;
    expect(u(s, 'haldane').reserve).toBe(1);
    s = step(s, { type: 'endPhase' }).state;
    expect(u(s, 'marlow').reserve).toBe(0);
  });
  it('DRV-7 overweight costs drive, not move', () => {
    let s = arena(['varga', 'dir-2']);
    const move = stats(s, u(s, 'varga')).move;
    u(s, 'varga').build.wL = 'w-rifle'; u(s, 'varga').build.pack = 'pack-mortar';
    expect(stats(s, u(s, 'varga'))).toMatchObject({ overweight: true, move, drive: 5 - RULES.drive.overweight });
    s = endBoth(s);
    expect(u(s, 'varga').drive).toBe(4);
  });
  it('DRV-8 the last walk can be undone while nothing has happened since', () => {
    let s = arena(['marlow', 'dir-2']);
    place(s, 'marlow', 5, 12); place(s, 'dir-2', 5, 4);
    const w = ok(s, { type: 'walk', unit: 'marlow', x: 5, y: 10, facing: 'E' }).state;
    s = ok(w, { type: 'undoWalk', unit: 'marlow' }).state;
    expect(u(s, 'marlow')).toMatchObject({ x: 5, y: 12, facing: 'N', drive: 4, walked: false });
    s = ok(w, { type: 'pivot', unit: 'marlow', facing: 'N' }).state;
    no(s, { type: 'undoWalk', unit: 'marlow' });
    const r = JSON.parse(JSON.stringify(w)) as BattleState;
    u(r, 'marlow').lastWalk!.reacted = true;
    no(r, { type: 'undoWalk', unit: 'marlow' });
  });
  it('DRV-9 legalActions lists walks, pivots, fire, stand down and endPhase, never hold fire', () => {
    let s = arena(['marlow', 'dir-2']);
    place(s, 'marlow', 5, 11); place(s, 'dir-2', 5, 8);
    const types = new Set(legalActions(s).map((a) => a.type));
    for (const t of ['walk', 'pivot', 'fire', 'fireAt', 'standDown', 'endPhase']) expect(types.has(t as Action['type'])).toBe(true);
    expect(types.has('holdFire')).toBe(false);
    s = ok(s, { type: 'standDown', unit: 'marlow' }).state;
    expect(legalActions(s)).toEqual([{ type: 'endPhase' }]);
  });
});

describe('to hit and damage (slice 5b)', () => {
  const setup = () => { const s = arena(['haldane', 'dir-2', 'marlow']); place(s, 'haldane', 5, 10); place(s, 'dir-2', 5, 7); place(s, 'marlow', 0, 0); return s; };
  it('HIT-1 chance = base accuracy + arm accuracy + pilot skill + modifiers, clamped', () => {
    const s = setup();
    const ev = stats(s, u(s, 'dir-2')).evade;
    expect(hitChance(s, u(s, 'haldane'), 'R', 'double', u(s, 'dir-2'))).toBe(74 - ev);
    expect(hitChance(s, u(s, 'haldane'), 'R', 'snap', u(s, 'dir-2'))).toBe(74 - 10 - ev);
    u(s, 'dir-2').build.legs = 'legs-lantern-l'; u(s, 'dir-2').hp.legs = 1;
    u(s, 'haldane').build.wR = 'w-rifle';
    place(s, 'haldane', 5, 10);
    expect(hitChance(s, u(s, 'haldane'), 'R', 'braced', u(s, 'dir-2'))).toBe(Math.min(RULES.hitMax, 78 + 20 - stats(s, u(s, 'dir-2')).evade));
  });
  it('HIT-2 arcs, nerve bands, suppression, cover and return fire move the chance', () => {
    const s = setup();
    const base = hitChance(s, u(s, 'haldane'), 'R', 'snap', u(s, 'dir-2'));
    const at = (x: number, y: number) => { place(s, 'haldane', x, y); return hitChance(s, u(s, 'haldane'), 'R', 'snap', u(s, 'dir-2')); };
    expect(at(8, 7)).toBe(base + RULES.facing.sideHit);
    expect(at(5, 4)).toBe(base + RULES.facing.rearHit);
    place(s, 'haldane', 5, 10);
    u(s, 'haldane').nerve = RULES.nerve.steady; expect(hitChance(s, u(s, 'haldane'), 'R', 'snap', u(s, 'dir-2'))).toBe(base + RULES.nerve.steadyHit);
    u(s, 'haldane').nerve = RULES.nerve.shaken; expect(hitChance(s, u(s, 'haldane'), 'R', 'snap', u(s, 'dir-2'))).toBe(base - RULES.nerve.shakenHit);
    u(s, 'haldane').nerve = 6; u(s, 'haldane').status.suppressed = true;
    expect(hitChance(s, u(s, 'haldane'), 'R', 'snap', u(s, 'dir-2'))).toBe(base - RULES.pinnedHit);
    u(s, 'haldane').status.suppressed = false; tile(s, 5, 8).obj = 'barrier';
    expect(hitChance(s, u(s, 'haldane'), 'R', 'snap', u(s, 'dir-2'))).toBe(base - RULES.coverPenalty);
    tile(s, 5, 8).obj = null;
    expect(hitChance(s, u(s, 'haldane'), 'R', 'snap', u(s, 'dir-2'), u(s, 'haldane'), 'return')).toBe(base - RULES.counterPenalty);
  });
  it('HIT-3 called shots land on the named part; side hits favour the near arm', () => {
    const s = arena(['marlow', 'dir-2']);
    place(s, 'marlow', 5, 11); place(s, 'dir-2', 5, 8);
    const r = until(s, { type: 'fire', unit: 'marlow', slot: 'R', mode: 'aimed', target: 'dir-2', part: 'legs' }, hitOn('dir-2'));
    const e = r.events.find((x) => x.type === 'attack')!;
    if (e.type === 'attack') for (const h of e.shots) if (h.hit) expect(h.part).toBe('legs');
    const w = hitWeights('direct', 'right', u(s, 'dir-2'));
    expect(w.armR).toBe(RULES.hitWeights.direct.armR * RULES.facing.sideArmFactor);
    expect(w.armL).toBe(RULES.hitWeights.direct.armL);
  });
  it('HIT-4 damage is the mode’s base damage or the weapon’s damage times the mode’s factor, ±10%', () => {
    const s = arena(['marlow', 'dir-2']);
    place(s, 'marlow', 5, 11); place(s, 'dir-2', 5, 8);
    const r = until(s, { type: 'fire', unit: 'marlow', slot: 'R', mode: 'suppress', target: 'dir-2' }, hitOn('dir-2'));
    const e = r.events.find((x) => x.type === 'attack')!;
    if (e.type === 'attack') for (const h of e.shots) if (h.hit) { expect(h.dmg).toBeGreaterThanOrEqual(Math.round(24 * 0.5 * 0.9)); expect(h.dmg).toBeLessThanOrEqual(Math.round(24 * 0.5 * 1.1)); }
  });
});

describe('fire modes (slice 5b)', () => {
  it('MOD-1 a fire order needs the mode’s range, sight and a usable weapon; Guard needs an adjacent ally', () => {
    const s = arena(['marlow', 'okonjo', 'dir-2']);
    place(s, 'marlow', 5, 13); place(s, 'dir-2', 5, 8); place(s, 'okonjo', 9, 13);
    expect(fireBlock(s, u(s, 'marlow'), 'R', 'burst', u(s, 'dir-2'))).toBe('out of range');
    expect(fireBlock(s, u(s, 'marlow'), 'L', 'double', u(s, 'dir-2'))).toBe(null);
    tile(s, 5, 10).obj = 'container';
    expect(fireBlock(s, u(s, 'marlow'), 'L', 'double', u(s, 'dir-2'))).toBe('no line of sight');
    u(s, 'marlow').hp.armL = 0;
    expect(fireBlock(s, u(s, 'marlow'), 'L', 'double', u(s, 'dir-2'))).toBe('arm lost');
    expect(fireBlock(s, u(s, 'okonjo'), 'L', 'guard', u(s, 'marlow'))).toBe('the ally must be adjacent');
    place(s, 'okonjo', 6, 13);
    expect(fireBlock(s, u(s, 'okonjo'), 'L', 'guard', u(s, 'marlow'))).toBe(null);
  });
  it('MOD-2 a mode fires its number of shots; a mode with none only applies its effect', () => {
    const s = arena(['marlow', 'okonjo', 'dir-2']);
    place(s, 'marlow', 5, 11); place(s, 'dir-2', 5, 8); place(s, 'okonjo', 6, 11);
    const e = ok(s, { type: 'fire', unit: 'marlow', slot: 'R', mode: 'burst', target: 'dir-2' }).events.find((x) => x.type === 'attack');
    expect(e?.type === 'attack' && e.shots.length).toBe(3);
    const g = ok(s, { type: 'fire', unit: 'okonjo', slot: 'L', mode: 'guard', target: 'marlow' }).events;
    expect(g.map((x) => x.type)).toEqual(['guard']);
  });
  it('MOD-3 every mode of a weapon spends the same ammunition', () => {
    let s = arena(['okonjo', 'varga', 'dir-2']);
    place(s, 'okonjo', 5, 14); place(s, 'dir-2', 5, 9); place(s, 'varga', 8, 9);
    s = ok(s, { type: 'fireAt', unit: 'okonjo', slot: 'P', mode: 'smoke', x: 8, y: 10 }).state;
    expect(u(s, 'okonjo').ammo).toBe(2);
    s = endBoth(s);
    s = ok(s, { type: 'fire', unit: 'okonjo', slot: 'P', mode: 'he', target: 'dir-2' }).state;
    expect(u(s, 'okonjo').ammo).toBe(1);
  });
  it('MOD-4 a calling mode needs a part; the pack only from the rear', () => {
    const s = arena(['marlow', 'dir-1']);
    place(s, 'marlow', 5, 11); place(s, 'dir-1', 5, 8);
    no(s, { type: 'fire', unit: 'marlow', slot: 'R', mode: 'aimed', target: 'dir-1' });
    expect(callable(u(s, 'dir-1'), u(s, 'marlow'))).not.toContain('pack');
    no(s, { type: 'fire', unit: 'marlow', slot: 'R', mode: 'aimed', target: 'dir-1', part: 'pack' });
    place(s, 'marlow', 5, 5);
    expect(callable(u(s, 'dir-1'), u(s, 'marlow'))).toContain('pack');
  });
  it('MOD-5 Braced shot needs a walker that stood still; Drive-through a straight charge; Tagged salvo a mark', () => {
    let s = turn(arena(['hallen', 'dir-4', 'marlow']), 'hostile');
    place(s, 'hallen', 5, 4); place(s, 'marlow', 5, 8); place(s, 'dir-4', 9, 8);
    expect(fireBlock(s, u(s, 'hallen'), 'R', 'braced', u(s, 'marlow'))).toBe(null);
    expect(fireBlock(s, u(s, 'hallen'), 'P', 'tagged', u(s, 'marlow'))).toContain('marked');
    const walked = ok(s, { type: 'walk', unit: 'hallen', x: 4, y: 4, facing: 'S' }).state;
    expect(fireBlock(walked, u(walked, 'hallen'), 'R', 'braced', u(walked, 'marlow'))).toContain('before walking');
    s = ok(s, { type: 'walk', unit: 'dir-4', x: 6, y: 8, facing: 'W' }).state;
    expect(fireBlock(s, u(s, 'dir-4'), 'L', 'drive', u(s, 'marlow'))).toBe(null);
    let bent = turn(arena(['dir-4', 'marlow']), 'hostile');
    place(bent, 'marlow', 5, 8); place(bent, 'dir-4', 7, 9);
    bent = ok(bent, { type: 'walk', unit: 'dir-4', x: 6, y: 8, facing: 'W' }).state;
    expect(fireBlock(bent, u(bent, 'dir-4'), 'L', 'drive', u(bent, 'marlow'))).toContain('straight walk');
  });
  it('MOD-6 a Suppress hit pins: next phase -1 drive and -10 to hit', () => {
    let s = arena(['marlow', 'dir-2']);
    place(s, 'marlow', 5, 11); place(s, 'dir-2', 5, 8);
    s = until(s, { type: 'fire', unit: 'marlow', slot: 'R', mode: 'suppress', target: 'dir-2' }, hitOn('dir-2')).state;
    expect(u(s, 'dir-2').status.pinned).toBe(true);
    const before = hitChance(s, u(s, 'dir-2'), 'R', 'shot', u(s, 'marlow'));
    s = step(s, { type: 'endPhase' }).state;
    expect(u(s, 'dir-2').drive).toBe(4 - RULES.drive.pinned);
    expect(hitChance(s, u(s, 'dir-2'), 'R', 'shot', u(s, 'marlow'))).toBe(before - RULES.pinnedHit);
  });
  it('MOD-7 Shove pushes, Drive-through knocks down, Bash staggers', () => {
    const s = turn(arena(['dir-4', 'marlow']), 'hostile');
    place(s, 'dir-4', 5, 7); place(s, 'marlow', 5, 8);
    const sh = until(s, { type: 'fire', unit: 'dir-4', slot: 'L', mode: 'shove', target: 'marlow' }, hitOn('marlow')).state;
    expect([u(sh, 'marlow').x, u(sh, 'marlow').y]).toEqual([5, 9]);
    let c = turn(arena(['dir-4', 'marlow']), 'hostile');
    place(c, 'dir-4', 5, 5); place(c, 'marlow', 5, 8);
    c = ok(c, { type: 'walk', unit: 'dir-4', x: 5, y: 7, facing: 'S' }).state;
    const kd = until(c, { type: 'fire', unit: 'dir-4', slot: 'L', mode: 'drive', target: 'marlow' }, hitOn('marlow')).state;
    expect(u(kd, 'marlow').status.down).toBe(true);
    const b = arena(['okonjo', 'dir-4']);
    place(b, 'okonjo', 5, 8); place(b, 'dir-4', 5, 7);
    const st = until(b, { type: 'fire', unit: 'okonjo', slot: 'L', mode: 'bash', target: 'dir-4' }, hitOn('dir-4')).state;
    expect(u(st, 'dir-4').status.staggered).toBe(true);
    expect(u(step(st, { type: 'endPhase' }).state, 'dir-4').drive).toBe(4 - RULES.drive.staggered);
  });
  it('MOD-8 Cover lane sets overwatch and turns the walker; Guard sets a guard; Smoke lands without a roll', () => {
    const s = arena(['varga', 'okonjo', 'marlow', 'dir-2']);
    place(s, 'varga', 3, 10); place(s, 'okonjo', 5, 14); place(s, 'marlow', 6, 14); place(s, 'dir-2', 9, 4);
    const lane = ok(s, { type: 'fireAt', unit: 'varga', slot: 'R', mode: 'lane', x: 6, y: 10 }).state;
    expect(u(lane, 'varga')).toMatchObject({ overwatch: { slot: 'R', dir: 'E' }, facing: 'E' });
    expect(u(ok(s, { type: 'fire', unit: 'okonjo', slot: 'L', mode: 'guard', target: 'marlow' }).state, 'okonjo').guarding).toEqual(['marlow']);
    const sm = ok(s, { type: 'fireAt', unit: 'okonjo', slot: 'P', mode: 'smoke', x: 5, y: 8 });
    expect(sm.events.some((e) => e.type === 'attack')).toBe(false);
    expect(sm.state.smoke.length).toBe(9);
  });
  it('MOD-9 only High explosive splashes', () => {
    const s = arena(['okonjo', 'varga', 'dir-2', 'dir-4']);
    place(s, 'okonjo', 5, 14); place(s, 'varga', 9, 8); place(s, 'dir-2', 5, 8); place(s, 'dir-4', 6, 8);
    const he = until(s, { type: 'fire', unit: 'okonjo', slot: 'P', mode: 'he', target: 'dir-2' }, (ev) => ev.some((e) => e.type === 'splash'));
    expect(he.events.some((e) => e.type === 'splash' && e.target === 'dir-4')).toBe(true);
    const sm = ok(s, { type: 'fireAt', unit: 'okonjo', slot: 'P', mode: 'smoke', x: 5, y: 8 });
    expect(sm.events.some((e) => e.type === 'splash')).toBe(false);
  });
});

describe('facing (slice 5b)', () => {
  it('FAC-1 mission start facings; walks name the facing; Pivot costs 1', () => {
    let s = arena(['marlow', 'dir-2']);
    expect([u(s, 'marlow').facing, u(s, 'dir-2').facing]).toEqual(['N', 'S']);
    s = ok(s, { type: 'pivot', unit: 'marlow', facing: 'W' }).state;
    expect([u(s, 'marlow').facing, u(s, 'marlow').drive]).toEqual(['W', 3]);
    no(s, { type: 'pivot', unit: 'marlow', facing: 'W' });
  });
  it('FAC-2 front, rear and sides; the exact diagonal is a side', () => {
    const at = { x: 5, y: 5 };
    expect(arcOf(at, 'N', { x: 5, y: 2 })).toBe('front');
    expect(arcOf(at, 'N', { x: 5, y: 8 })).toBe('rear');
    expect(arcOf(at, 'N', { x: 8, y: 5 })).toBe('right');
    expect(arcOf(at, 'N', { x: 2, y: 5 })).toBe('left');
    expect(arcOf(at, 'N', { x: 7, y: 3 })).toBe('right');
    expect(arcOf(at, 'E', { x: 5, y: 9 })).toBe('right');
  });
  it('FAC-3 rear hits, downed walkers and indirect fire use the rear weights with the pack; no pack folds into the body', () => {
    const s = arena(['dir-1', 'dir-2']);
    const r = RULES.hitWeights.rear;
    expect(hitWeights('direct', 'rear', u(s, 'dir-1')).pack).toBe(r.pack);
    expect(hitWeights('indirect', 'front', u(s, 'dir-1')).pack).toBe(r.pack);
    expect(hitWeights('direct', 'rear', u(s, 'dir-2'))).toMatchObject({ pack: 0, body: r.body + r.pack });
    u(s, 'dir-1').status.down = true;
    expect(hitWeights('direct', 'front', u(s, 'dir-1')).pack).toBe(r.pack);
  });
  it('FAC-4 a pack hit goes to the body; a loaded weapon pack cooks off, others go out', () => {
    let s = arena(['marlow', 'dir-1', 'dir-4']);
    place(s, 'marlow', 5, 5); place(s, 'dir-1', 5, 8); place(s, 'dir-4', 6, 8);
    const r = until(s, { type: 'fire', unit: 'marlow', slot: 'R', mode: 'aimed', target: 'dir-1', part: 'pack' }, (ev) => ev.some((e) => e.type === 'cookOff'));
    const c = r.events.find((e) => e.type === 'cookOff')!;
    expect(c.type === 'cookOff' && c.dmg).toBe(RULES.cookOff.self);
    expect(c.type === 'cookOff' && c.splash).toContainEqual({ target: 'dir-4', dmg: RULES.cookOff.adjacent });
    expect(u(r.state, 'dir-1').ammo).toBe(0);
    s = turn(arena(['varga', 'dir-2', 'okonjo']), 'hostile');
    place(s, 'varga', 5, 8); place(s, 'dir-2', 5, 11); place(s, 'okonjo', 9, 14);
    u(s, 'varga').facing = 'N';
    const out = until(s, { type: 'fire', unit: 'dir-2', slot: 'R', mode: 'braced', target: 'varga', part: 'pack' }, (ev) => ev.some((e) => e.type === 'status' && e.status === 'packOut')).state;
    expect(spotted(out, 'player', { x: 5, y: 4 })).toBe(false);
  });
  it('FAC-5 the shield cuts direct and melee hits on body and left arm from the front and left only', () => {
    const s = arena(['okonjo']);
    const o = u(s, 'okonjo'), g = PARTS.weapons['w-shield']!.guard! / 100;
    expect(shieldCut(o, 'body', 'direct', 'front')).toBe(g);
    expect(shieldCut(o, 'armL', 'melee', 'left')).toBe(g);
    expect(shieldCut(o, 'body', 'direct', 'right')).toBe(0);
    expect(shieldCut(o, 'body', 'direct', 'rear')).toBe(0);
    expect(shieldCut(o, 'body', 'indirect', 'front')).toBe(0);
    expect(shieldCut(o, 'pack', 'direct', 'front')).toBe(0);
    o.hp.armL = 0;
    expect(shieldCut(o, 'body', 'direct', 'front')).toBe(0);
  });
  it('FAC-6 indirect fire gets no arc bonus', () => {
    const s = arena(['okonjo', 'dir-2']);
    place(s, 'okonjo', 5, 13); place(s, 'dir-2', 5, 8);
    const front = hitChance(s, u(s, 'okonjo'), 'P', 'he', u(s, 'dir-2'));
    u(s, 'dir-2').facing = 'N';
    expect(hitChance(s, u(s, 'okonjo'), 'P', 'he', u(s, 'dir-2'))).toBe(front);
  });
});

describe('maneuvers (slice 5c)', () => {
  it('MAN-1 maneuvers come from the body, standing arms, legs, a working pack and the universal list', () => {
    const s = arena(['marlow', 'varga', 'dir-2']);
    const ids = (id: string) => maneuversOf(u(s, id)).map((m) => `${m.id}${m.slot ?? ''}`);
    expect(ids('marlow')).toEqual(expect.arrayContaining(['overdrive', 'kick', 'brace', 'pivot', 'shunt', 'breakFree']));
    expect(ids('marlow').some((x) => x.startsWith('grab'))).toBe(false);
    expect(ids('varga')).toEqual(expect.arrayContaining(['dash', 'hop', 'mark', 'grabL', 'throwL']));
    expect(ids('dir-2')).toEqual(expect.arrayContaining(['ramjabL', 'ramjabR', 'grabL']));
    u(s, 'dir-2').hp.armL = 0; u(s, 'varga').status.packOut = true;
    expect(ids('dir-2')).not.toContain('ramjabL');
    expect(ids('varga')).not.toContain('mark');
  });
  it('MAN-2 Dash walks 3 further for 1 drive and 1 nerve', () => {
    let s = arena(['varga', 'dir-2']);
    place(s, 'varga', 5, 15); place(s, 'dir-2', 0, 0);
    expect(walkRange(s, u(s, 'varga')).some((r) => r.x === 5 && r.y === 8)).toBe(false);
    expect(dashRange(s, u(s, 'varga')).some((r) => r.x === 5 && r.y === 8)).toBe(true);
    const nerve = u(s, 'varga').nerve;
    s = ok(s, { type: 'maneuver', unit: 'varga', id: 'dash', x: 5, y: 8, facing: 'N' }).state;
    expect([u(s, 'varga').y, u(s, 'varga').drive, u(s, 'varga').nerve]).toEqual([8, 4, nerve - 1]);
    s = ok(s, { type: 'undoWalk', unit: 'varga' }).state;
    expect([u(s, 'varga').y, u(s, 'varga').nerve]).toEqual([15, nerve]);
  });
  it('MAN-3 Hop climbs for free and falls without harm', () => {
    const s = arena(['varga', 'marlow', 'dir-4']);
    place(s, 'varga', 5, 10); place(s, 'marlow', 9, 10); place(s, 'dir-4', 5, 9);
    tile(s, 5, 11).h = 1; tile(s, 9, 11).h = 1;
    expect(hasTrait(u(s, 'varga'), 'hop')).toBe(true);
    expect(walkRange(s, u(s, 'varga')).find((r) => r.x === 5 && r.y === 11)?.cost).toBe(1);
    expect(walkRange(s, u(s, 'marlow')).find((r) => r.x === 9 && r.y === 11)?.cost).toBe(2);
    tile(s, 5, 9).h = 1; tile(s, 5, 10).h = 1; tile(s, 5, 11).h = 0;
    turn(s, 'hostile');
    const r = until(s, { type: 'fire', unit: 'dir-4', slot: 'L', mode: 'shove', target: 'varga' }, (ev) => ev.some((e) => e.type === 'pushed'));
    expect(r.events.find((e) => e.type === 'pushed')).toMatchObject({ result: 'fell', dmg: 0 });
    expect(u(r.state, 'varga').status.down).toBe(false);
  });
  it('MAN-4 Kick lands on the legs and pushes; Ram jab uses its arm and pushes', () => {
    const s = arena(['marlow', 'dir-2']);
    place(s, 'marlow', 5, 10); place(s, 'dir-2', 5, 9);
    const k = until(s, { type: 'maneuver', unit: 'marlow', id: 'kick', target: 'dir-2' }, hitOn('dir-2'));
    const e = k.events.find((x) => x.type === 'attack' && x.unit === 'marlow')!;
    expect(e.type === 'attack' && e.shots[0]).toMatchObject({ hit: true, part: 'legs' });
    expect(u(k.state, 'dir-2').y).toBe(8);
    const h = turn(arena(['marlow', 'dir-2']), 'hostile');
    place(h, 'marlow', 5, 10); place(h, 'dir-2', 5, 9);
    const j = until(h, { type: 'maneuver', unit: 'dir-2', id: 'ramjab', slot: 'L', target: 'marlow' }, hitOn('marlow'));
    expect(u(j.state, 'dir-2').fired).toContain('L');
    expect(u(j.state, 'marlow').y).toBe(11);
    no(h, { type: 'maneuver', unit: 'dir-2', id: 'ramjab', target: 'marlow' });
  });
  it('MAN-5 Brace stops pushes and knockdowns at -10 evasion; Plant is cover for whoever stands behind', () => {
    let s = arena(['marlow', 'haldane', 'dir-4']);
    place(s, 'marlow', 5, 8); place(s, 'dir-4', 5, 7); place(s, 'haldane', 5, 9);
    const ev = stats(s, u(s, 'marlow')).evade;
    s = ok(s, { type: 'maneuver', unit: 'marlow', id: 'brace' }).state;
    expect(stats(s, u(s, 'marlow')).evade).toBe(ev - 10);
    s = turn(s, 'hostile');
    const r = until(s, { type: 'fire', unit: 'dir-4', slot: 'L', mode: 'shove', target: 'marlow' }, hitOn('marlow'));
    expect([u(r.state, 'marlow').x, u(r.state, 'marlow').y]).toEqual([5, 8]);
    let p = arena(['okonjo', 'haldane', 'dir-2']);
    place(p, 'okonjo', 5, 9); place(p, 'haldane', 5, 10); place(p, 'dir-2', 5, 5);
    expect(hasCover(p, u(p, 'dir-2'), u(p, 'haldane'))).toBe(false);
    p = ok(p, { type: 'maneuver', unit: 'okonjo', id: 'plant' }).state;
    expect(hasCover(p, u(p, 'dir-2'), u(p, 'haldane'))).toBe(true);
    p = ok(p, { type: 'walk', unit: 'okonjo', x: 6, y: 9, facing: 'N' }).state;
    expect(u(p, 'okonjo').status.planted).toBe(false);
  });
  it('MAN-6 Grab holds an adjacent enemy: no walking, both lose evasion, break free for 2, ends at the grabber’s next phase', () => {
    let s = arena(['varga', 'dir-2']);
    place(s, 'varga', 5, 10); place(s, 'dir-2', 5, 9);
    const ev = stats(s, u(s, 'dir-2')).evade;
    s = until(s, { type: 'maneuver', unit: 'varga', id: 'grab', slot: 'L', target: 'dir-2' }, hitOn('dir-2')).state;
    expect(u(s, 'dir-2').status.grabbedBy).toBe('varga');
    expect(stats(s, u(s, 'dir-2')).evade).toBe(ev - RULES.grabEvade);
    s = step(s, { type: 'endPhase' }).state;
    expect(walkRange(s, u(s, 'dir-2'))).toEqual([]);
    const free = ok(s, { type: 'maneuver', unit: 'dir-2', id: 'breakFree' }).state;
    expect([u(free, 'dir-2').status.grabbedBy, u(free, 'varga').grip, u(free, 'dir-2').drive]).toEqual([null, null, 2]);
    s = step(s, { type: 'endPhase' }).state;
    expect(u(s, 'dir-2').status.grabbedBy).toBe(null);
  });
  it('MAN-7 Throw needs rubble next to the walker and reaches 2 to 4', () => {
    const s = arena(['varga', 'dir-2']);
    place(s, 'varga', 5, 12); place(s, 'dir-2', 5, 9);
    expect(maneuverBlock(s, u(s, 'varga'), 'throw', 'L', u(s, 'dir-2'), null)).toContain('rubble');
    tile(s, 4, 12).t = 'rubble';
    expect(maneuverBlock(s, u(s, 'varga'), 'throw', 'L', u(s, 'dir-2'), null)).toBe(null);
    place(s, 'dir-2', 5, 6);
    expect(maneuverBlock(s, u(s, 'varga'), 'throw', 'L', u(s, 'dir-2'), null)).toBe('out of range');
  });
  it('MAN-8 Overdrive: +2 drive for 3 nerve and 10 body, once a phase', () => {
    let s = arena(['marlow', 'dir-2']);
    const body = u(s, 'marlow').hp.body;
    s = ok(s, { type: 'maneuver', unit: 'marlow', id: 'overdrive' }).state;
    expect([u(s, 'marlow').drive, u(s, 'marlow').nerve, u(s, 'marlow').hp.body]).toEqual([6, 5, body - 10]);
    no(s, { type: 'maneuver', unit: 'marlow', id: 'overdrive' });
    const low = arena(['marlow', 'dir-2']); u(low, 'marlow').hp.body = 10;
    no(low, { type: 'maneuver', unit: 'marlow', id: 'overdrive' });
  });
  it('MAN-9 Mark: +15 to hit for the marking side, unlocks Tagged salvo, clears at that side’s next phase', () => {
    let s = arena(['varga', 'marlow', 'dir-2']);
    place(s, 'varga', 5, 12); place(s, 'marlow', 6, 11); place(s, 'dir-2', 5, 8);
    const before = hitChance(s, u(s, 'marlow'), 'L', 'double', u(s, 'dir-2'));
    s = ok(s, { type: 'maneuver', unit: 'varga', id: 'mark', target: 'dir-2' }).state;
    expect(hitChance(s, u(s, 'marlow'), 'L', 'double', u(s, 'dir-2'))).toBe(Math.min(RULES.hitMax, before + RULES.markBonus));
    u(s, 'marlow').build.pack = 'pack-missile'; u(s, 'marlow').ammo = 2;
    expect(fireBlock(s, u(s, 'marlow'), 'P', 'tagged', u(s, 'dir-2'))).toBe(null);
    s = endBoth(s);
    expect(u(s, 'dir-2').status.markedBy).toBe(null);
    place(s, 'dir-2', 5, 2);
    expect(maneuverBlock(s, u(s, 'varga'), 'mark', null, u(s, 'dir-2'), null)).toContain('range');
  });
  it('MAN-10 Patch costs 2 drive and a charge, and restores a damaged, not lost part of the walker or an adjacent ally', () => {
    const s = arena(['haldane', 'marlow']);
    place(s, 'haldane', 5, 10); place(s, 'marlow', 5, 11);
    u(s, 'marlow').hp.legs = 40; u(s, 'marlow').hp.armL = 0;
    no(s, { type: 'patch', unit: 'haldane', target: 'marlow', part: 'armL' });
    const r = ok(s, { type: 'patch', unit: 'haldane', target: 'marlow', part: 'legs' }).state;
    expect(u(r, 'marlow').hp.legs).toBe(85);
    expect([u(r, 'haldane').drive, u(r, 'haldane').charges]).toEqual([2, 2]);
  });
  it('MAN-11 Tow steps the walker away from an adjacent ally and drags the ally into its tile', () => {
    let s = arena(['haldane', 'marlow', 'dir-2']);
    place(s, 'haldane', 5, 10); place(s, 'marlow', 5, 9); place(s, 'dir-2', 0, 0);
    u(s, 'marlow').status.down = true;
    s = ok(s, { type: 'maneuver', unit: 'haldane', id: 'tow', target: 'marlow' }).state;
    expect([u(s, 'haldane').y, u(s, 'marlow').y, u(s, 'marlow').status.down, u(s, 'haldane').drive]).toEqual([11, 10, true, 3]);
    tile(s, 5, 12).obj = 'barrier';
    no(s, { type: 'maneuver', unit: 'haldane', id: 'tow', target: 'marlow' });
  });
  it('MAN-12 Shunt wagon needs the walker on the rails next to a wagon on the same line', () => {
    const s = arena(['marlow', 'dir-2']);
    place(s, 'marlow', 4, 12); place(s, 'dir-2', 0, 0);
    tile(s, 4, 11).obj = 'wagon'; tile(s, 4, 11).objHp = 60;
    expect(maneuverBlock(s, u(s, 'marlow'), 'shunt', null, null, { x: 4, y: 11 })).toBe(null);
    place(s, 'marlow', 5, 11);
    expect(maneuverBlock(s, u(s, 'marlow'), 'shunt', null, null, { x: 4, y: 11 })).toContain('rails');
  });
});

describe('reactions (slice 5b)', () => {
  const duel = () => { const s = arena(['marlow', 'dir-2']); place(s, 'marlow', 5, 11); place(s, 'dir-2', 5, 8); return s; };
  it('RCT-1 reactions cost reserve and never draw reactions', () => {
    const s = duel();
    u(s, 'marlow').reserve = 2;
    const r = ok(s, { type: 'fire', unit: 'marlow', slot: 'R', mode: 'burst', target: 'dir-2' });
    const atk = r.events.filter((e) => e.type === 'attack');
    expect(atk.length).toBe(2);
    expect(atk[1]).toMatchObject({ reaction: 'return', unit: 'dir-2' });
    expect([u(r.state, 'dir-2').reserve, u(r.state, 'marlow').reserve]).toEqual([0, 2]);
  });
  it('RCT-2 return fire needs reserve, the attacker in front, a standing pilot and a reaching hand weapon; its cheapest mode at -15', () => {
    const s = duel();
    const rf = returnFire(s, u(s, 'dir-2'), u(s, 'marlow'));
    expect(rf?.mode.id).toBe('shot');
    const e = ok(s, { type: 'fire', unit: 'marlow', slot: 'R', mode: 'burst', target: 'dir-2' }).events.filter((x) => x.type === 'attack')[1];
    expect(e?.type === 'attack' && e.chance).toBe(hitChance(s, u(s, 'dir-2'), 'R', 'shot', u(s, 'marlow'), u(s, 'dir-2'), 'return'));
    u(s, 'dir-2').facing = 'E'; expect(returnFire(s, u(s, 'dir-2'), u(s, 'marlow'))).toBe(null);
    u(s, 'dir-2').facing = 'S'; u(s, 'dir-2').reserve = 0; expect(returnFire(s, u(s, 'dir-2'), u(s, 'marlow'))).toBe(null);
    u(s, 'dir-2').reserve = 1; u(s, 'dir-2').status.down = true; expect(returnFire(s, u(s, 'dir-2'), u(s, 'marlow'))).toBe(null);
    u(s, 'dir-2').status.down = false; u(s, 'dir-2').nerve = RULES.nerve.shaken; expect(returnFire(s, u(s, 'dir-2'), u(s, 'marlow'))).toBe(null);
  });
  it('RCT-3 overwatch fires mid-walk; a legs hit stops the walk; the walk cannot be undone', () => {
    const s = arena(['marlow', 'dir-4']);
    place(s, 'marlow', 3, 8); place(s, 'dir-4', 5, 5);
    u(s, 'dir-4').overwatch = { slot: 'R', dir: 'S' };
    const go: Action = { type: 'walk', unit: 'marlow', x: 7, y: 8, facing: 'N' };
    const stop = until(s, go, (ev) => ev.some((e) => e.type === 'attack' && e.reaction === 'overwatch' && e.shots.some((h) => h.part === 'legs')));
    expect([u(stop.state, 'marlow').x, u(stop.state, 'marlow').y, u(stop.state, 'marlow').facing]).toEqual([5, 8, 'E']);
    expect(u(stop.state, 'dir-4')).toMatchObject({ reserve: 0, overwatch: null });
    no(stop.state, { type: 'undoWalk', unit: 'marlow' });
    const miss = until(s, go, (ev) => ev.some((e) => e.type === 'attack' && e.reaction === 'overwatch' && e.shots.every((h) => !h.hit)));
    expect([u(miss.state, 'marlow').x, u(miss.state, 'marlow').facing]).toEqual([7, 'N']);
    expect(miss.events.map((e) => e.type)).toEqual(['walked', 'attack', 'walked']);
  });
  it('RCT-4 a guard’s shield arm takes hits aimed at the ally it guards from its front', () => {
    let s = arena(['okonjo', 'haldane', 'dir-2']);
    place(s, 'haldane', 5, 10); place(s, 'okonjo', 6, 10); place(s, 'dir-2', 5, 6);
    s = ok(s, { type: 'fire', unit: 'okonjo', slot: 'L', mode: 'guard', target: 'haldane' }).state;
    s = turn(s, 'hostile');
    const r = until(s, { type: 'fire', unit: 'dir-2', slot: 'R', mode: 'shot', target: 'haldane' }, hitOn('okonjo'));
    const e = r.events.find((x) => x.type === 'attack')!;
    expect(e.type === 'attack' && e.shots.find((h) => h.hit)).toMatchObject({ on: 'okonjo', part: 'armL' });
    expect(u(r.state, 'haldane').hp.body).toBe(u(s, 'haldane').hp.body);
    place(s, 'okonjo', 7, 10);
    const r2 = until(s, { type: 'fire', unit: 'dir-2', slot: 'R', mode: 'shot', target: 'haldane' }, hitOn('haldane'));
    expect(r2.events.some((x) => x.type === 'attack' && x.shots.some((h) => h.on === 'okonjo'))).toBe(false);
  });
  it('RCT-5 a guard costs nothing more after the order', () => {
    let s = arena(['okonjo', 'haldane', 'dir-2']);
    place(s, 'haldane', 5, 10); place(s, 'okonjo', 6, 10); place(s, 'dir-2', 5, 6);
    s = ok(s, { type: 'fire', unit: 'okonjo', slot: 'L', mode: 'guard', target: 'haldane' }).state;
    s = step(s, { type: 'endPhase' }).state;
    const reserve = u(s, 'okonjo').reserve;
    const r = until(s, { type: 'fire', unit: 'dir-2', slot: 'R', mode: 'shot', target: 'haldane' }, hitOn('okonjo'));
    expect(u(r.state, 'okonjo').reserve).toBe(reserve);
  });
  it('RCT-6 hold fire is free, stops return fire, and belongs to the side in its phase', () => {
    let s = duel();
    s = turn(s, 'hostile');
    no(s, { type: 'holdFire', unit: 'marlow', on: true });
    s = turn(s, 'player');
    s = ok(s, { type: 'holdFire', unit: 'marlow', on: true }).state;
    expect(u(s, 'marlow').drive).toBe(4);
    s = turn(s, 'hostile');
    u(s, 'marlow').reserve = 2;
    expect(returnFire(s, u(s, 'marlow'), u(s, 'dir-2'))).toBe(null);
  });
  it('RCT-7 several overwatchers fire nearest first, then by id', () => {
    const s = arena(['marlow', 'dir-4', 'dir-5', 'dir-1']);
    place(s, 'dir-4', 5, 4); place(s, 'dir-5', 2, 8); place(s, 'dir-1', 5, 3); place(s, 'marlow', 9, 12);
    u(s, 'dir-4').overwatch = { slot: 'R', dir: 'S' }; u(s, 'dir-1').overwatch = { slot: 'R', dir: 'S' };
    u(s, 'dir-5').overwatch = { slot: 'R', dir: 'E' }; u(s, 'dir-5').facing = 'E';
    expect(overwatchers(s, u(s, 'marlow'), { x: 5, y: 8 }).map((o) => o.id)).toEqual(['dir-5', 'dir-4', 'dir-1']);
  });
});

describe('the field (slice 5c)', () => {
  const shove = (setup: (s: BattleState) => void) => {
    const s = turn(arena(['dir-4', 'marlow', 'haldane']), 'hostile');
    place(s, 'dir-4', 5, 7); place(s, 'marlow', 5, 8); place(s, 'haldane', 0, 0);
    setup(s);
    return until(s, { type: 'fire', unit: 'dir-4', slot: 'L', mode: 'shove', target: 'marlow' }, (ev) => ev.some((e) => e.type === 'pushed'));
  };
  const pushed = (ev: GameEvent[]) => ev.find((e) => e.type === 'pushed')!;
  it('FLD-1 a push moves, drops, mires or collides', () => {
    const fell = shove((s) => { tile(s, 5, 7).h = 1; tile(s, 5, 8).h = 1; });
    expect(pushed(fell.events)).toMatchObject({ result: 'fell', dmg: RULES.push.fallLegs });
    expect(u(fell.state, 'marlow').status.down).toBe(true);
    expect(u(fell.state, 'marlow').facing).toBe('N');
    const wet = shove((s) => { tile(s, 5, 9).t = 'water'; });
    expect(pushed(wet.events)).toMatchObject({ result: 'water' });
    expect(u(wet.state, 'marlow').status.mired).toBe(true);
    const wall = shove((s) => { tile(s, 5, 9).obj = 'barrier'; tile(s, 5, 9).objHp = 45; });
    expect(pushed(wall.events)).toMatchObject({ result: 'collide', dmg: RULES.push.collide, obj: { x: 5, y: 9, dmg: RULES.push.collide } });
    expect([u(wall.state, 'marlow').x, u(wall.state, 'marlow').y]).toEqual([5, 8]);
    const bump = shove((s) => place(s, 'haldane', 5, 9));
    expect(pushed(bump.events)).toMatchObject({ result: 'collide', other: 'haldane' });
    expect(u(bump.state, 'haldane').hp.body).toBe(120 - RULES.push.collide);
  });
  it('FLD-2 knocked down: evasion 0, rear weights, no reactions, 2 drive to get up', () => {
    let s = arena(['marlow', 'dir-2']);
    place(s, 'marlow', 5, 11); place(s, 'dir-2', 5, 8);
    u(s, 'marlow').status.down = true;
    expect(stats(s, u(s, 'marlow')).evade).toBe(0);
    expect(hitWeights('direct', 'front', u(s, 'marlow')).pack).toBe(0);
    u(s, 'marlow').reserve = 2;
    expect(returnFire(s, u(s, 'marlow'), u(s, 'dir-2'))).toBe(null);
    s = endBoth(s);
    expect(u(s, 'marlow').drive).toBe(4 - RULES.drive.knockedDown);
  });
  const yard = () => { const s = arena(['marlow', 'dir-2', 'dir-4']); place(s, 'marlow', 4, 15); place(s, 'dir-2', 4, 9); place(s, 'dir-4', 0, 0); tile(s, 4, 14).obj = 'wagon'; tile(s, 4, 14).objHp = 60; return s; };
  it('FLD-3 a shunted wagon rolls along the rails and knocks the first walker off the track', () => {
    const r = ok(yard(), { type: 'maneuver', unit: 'marlow', id: 'shunt', x: 4, y: 14 });
    expect(r.events[0]).toMatchObject({ type: 'wagon', cars: [{ from: { x: 4, y: 14 }, to: { x: 4, y: 10 } }], hit: 'dir-2' });
    expect(tile(r.state, 4, 10).obj).toBe('wagon');
    expect(u(r.state, 'dir-2')).toMatchObject({ x: 3, y: 9, status: expect.objectContaining({ down: true }) });
    expect(u(r.state, 'dir-2').hp.body).toBe(105 - RULES.wagon.dmg);
    expect(r.events.some((e) => e.type === 'attack')).toBe(false);
    const far = yard(); place(far, 'dir-2', 0, 1);
    expect(ok(far, { type: 'maneuver', unit: 'marlow', id: 'shunt', x: 4, y: 14 }).events[0]).toMatchObject({ cars: [{ to: { x: 4, y: 14 - RULES.wagon.roll } }] });
    // A coupled pair rolls together; the lead takes the hit.
    const pair = yard(); tile(pair, 4, 13).obj = 'wagon'; tile(pair, 4, 13).objHp = 60;
    const pr = ok(pair, { type: 'maneuver', unit: 'marlow', id: 'shunt', x: 4, y: 14 });
    expect(pr.events[0]).toMatchObject({ cars: [{ from: { x: 4, y: 13 }, to: { x: 4, y: 10 } }, { from: { x: 4, y: 14 }, to: { x: 4, y: 11 } }], hit: 'dir-2' });
  });
  it('FLD-4 a wagon keeps its HP as it rolls and breaks to rubble where a collision ends it', () => {
    const s = yard(); place(s, 'dir-2', 0, 1); tile(s, 4, 12).obj = 'barrier'; tile(s, 4, 12).objHp = 45;
    tile(s, 4, 14).objHp = 20;
    const hard = ok(s, { type: 'maneuver', unit: 'marlow', id: 'shunt', x: 4, y: 14 });
    expect(hard.events[0]).toMatchObject({ cars: [{ to: { x: 4, y: 13 }, hp: 20 - RULES.wagon.collide, broken: false }], obj: { x: 4, y: 12 } });
    expect(tile(hard.state, 4, 13).objHp).toBe(20 - RULES.wagon.collide);
    tile(s, 4, 14).objHp = 10;
    const bust = ok(s, { type: 'maneuver', unit: 'marlow', id: 'shunt', x: 4, y: 14 });
    expect(tile(bust.state, 4, 13)).toMatchObject({ obj: null, t: 'rubble' });
  });
  it('FLD-5 a stack at 30 HP or less topples away from a hit onto the next 2 tiles; topples do not chain', () => {
    const s = arena(['marlow', 'dir-2', 'dir-4']);
    place(s, 'marlow', 5, 12); place(s, 'dir-2', 5, 9); place(s, 'dir-4', 0, 0);
    tile(s, 5, 10).obj = 'container'; tile(s, 5, 10).objHp = 60; tile(s, 5, 10).stack = true;
    tile(s, 5, 8).obj = 'container'; tile(s, 5, 8).objHp = 25; tile(s, 5, 8).stack = true;
    const r = ok(s, { type: 'fireAt', unit: 'marlow', slot: 'L', mode: 'double', x: 5, y: 10 });
    const tp = r.events.find((e) => e.type === 'toppled')!;
    expect(tp).toMatchObject({ x: 5, y: 10, dir: 'N' });
    expect(tile(r.state, 5, 10)).toMatchObject({ obj: null, t: 'rubble' });
    expect(u(r.state, 'dir-2').hp.body).toBe(105 - RULES.stack.dmg);
    expect(u(r.state, 'dir-2').status.down).toBe(true);
    expect(tile(r.state, 5, 8).obj).toBe(null);
    const c = arena(['marlow', 'dir-2', 'dir-4']); place(c, 'marlow', 5, 12); place(c, 'dir-4', 0, 0); place(c, 'dir-2', 0, 2);
    tile(c, 5, 10).obj = 'container'; tile(c, 5, 10).objHp = 60; tile(c, 5, 10).stack = true;
    tile(c, 5, 8).obj = 'container'; tile(c, 5, 8).objHp = 80; tile(c, 5, 8).stack = true;
    const r2 = ok(c, { type: 'fireAt', unit: 'marlow', slot: 'L', mode: 'double', x: 5, y: 10 });
    expect(r2.events.filter((e) => e.type === 'toppled').length).toBe(1);
    expect(tile(r2.state, 5, 8)).toMatchObject({ obj: 'container', objHp: 80 - RULES.stack.dmg });
  });
  it('FLD-6 smoke blocks sight through it, gives cover inside it, and clears at the firer side’s next phase', () => {
    let s = arena(['okonjo', 'varga', 'dir-2']);
    place(s, 'okonjo', 5, 14); place(s, 'varga', 9, 9); place(s, 'dir-2', 5, 4);
    s = ok(s, { type: 'fireAt', unit: 'okonjo', slot: 'P', mode: 'smoke', x: 5, y: 8 }).state;
    expect(hasLos(s, { x: 5, y: 12 }, { x: 5, y: 4 })).toBe(false);
    expect(hasCover(s, { x: 9, y: 9 }, { x: 5, y: 8 })).toBe(true);
    s = step(s, { type: 'endPhase' }).state;
    expect(s.smoke.length).toBe(9);
    s = step(s, { type: 'endPhase' }).state;
    expect(s.smoke.length).toBe(0);
  });
  it('FLD-7 rails and stacks are tile flags in the plain-JSON state', () => {
    const s = newBattle('marrow-yard', 1);
    expect(tile(s, 4, 0).rail).toBe('ns');
    expect(tile(s, 11, 17).rail).toBe('ns');
    expect(tile(s, 5, 0).rail).toBeUndefined();
    expect(tile(s, 7, 0).stack).toBe(true);
    expect(JSON.parse(JSON.stringify(s))).toEqual(s);
  });
  it('FLD-8 pushes never draw reactions', () => {
    const r = shove((s) => { place(s, 'haldane', 3, 9); u(s, 'haldane').overwatch = { slot: 'R', dir: 'E' }; u(s, 'haldane').facing = 'E'; u(s, 'haldane').reserve = 1; });
    expect(r.events.some((e) => e.type === 'attack' && e.reaction === 'overwatch')).toBe(false);
    expect([u(r.state, 'marlow').x, u(r.state, 'marlow').y]).toEqual([5, 9]);
  });
});

describe('nerve (slice 5e)', () => {
  const nerveOf = (ev: GameEvent[], id: string) => ev.filter((e) => e.type === 'nerve' && e.unit === id).map((e) => e.type === 'nerve' ? e.why : '');
  it('NRV-1 nerve starts at the pilot’s value and stays within 0..max', () => {
    const s = fresh1();
    for (const w of s.units) expect(w.nerve).toBe(PILOTS[w.pilot]!.nerve);
    u(s, 'marlow').nerve = RULES.nerve.max;
    place(s, 'marlow', 5, 11); place(s, 'dir-2', 5, 8);
    const r = until(s, { type: 'fire', unit: 'marlow', slot: 'R', mode: 'burst', target: 'dir-2' }, hitOn('dir-2'));
    expect(u(r.state, 'marlow').nerve).toBe(RULES.nerve.max);
  });
  it('NRV-2 hits, kills, flanks, pins, knockdowns, lost allies and standing together move nerve', () => {
    const s = arena(['haldane', 'dir-2', 'dir-1']);
    place(s, 'haldane', 8, 7); place(s, 'dir-2', 5, 7); place(s, 'dir-1', 5, 6);
    const side = until(s, { type: 'fire', unit: 'haldane', slot: 'R', mode: 'double', target: 'dir-2' }, hitOn('dir-2'));
    expect(nerveOf(side.events, 'haldane')).toContain('hit');
    expect(nerveOf(side.events, 'dir-2')).toContain('hitSide');
    expect(u(side.state, 'dir-2').nerve).toBe(PILOTS['dir-2']!.nerve + RULES.nerve.hitSide);
    u(s, 'dir-2').hp.body = 1;
    const kill = until(s, { type: 'fire', unit: 'haldane', slot: 'R', mode: 'double', target: 'dir-2' }, (ev) => ev.some((e) => e.type === 'destroyed'));
    expect(nerveOf(kill.events, 'haldane')).toContain('kill');
    expect(nerveOf(kill.events, 'dir-1')).toContain('allyLost');
    const end = step(s, { type: 'endPhase' });
    expect(nerveOf(end.events, 'dir-2')).toEqual([]);
    const t = turn(arena(['dir-2', 'dir-1', 'marlow']), 'hostile'); place(t, 'dir-2', 5, 7); place(t, 'dir-1', 5, 6); place(t, 'marlow', 0, 17);
    expect(nerveOf(step(t, { type: 'endPhase' }).events, 'dir-2')).toEqual(['together']);
  });
  it('NRV-3 Steady unlocks the signature; below it the signature is refused', () => {
    const s = arena(['marlow', 'haldane', 'dir-2']);
    expect(maneuverBlock(s, u(s, 'marlow'), 'call-the-line', null, null, null)).toBe(null);
    u(s, 'marlow').nerve = RULES.nerve.steady - 1;
    expect(maneuverBlock(s, u(s, 'marlow'), 'call-the-line', null, null, null)).toContain('Steady');
  });
  it('NRV-4 maneuvers with a nerve cost need that much and spend it', () => {
    const s = arena(['marlow', 'dir-2']);
    u(s, 'marlow').nerve = 2;
    expect(maneuverBlock(s, u(s, 'marlow'), 'overdrive', null, null, null)).toBe('needs 3 nerve');
    u(s, 'marlow').nerve = 3;
    expect(u(ok(s, { type: 'maneuver', unit: 'marlow', id: 'overdrive' }).state, 'marlow').nerve).toBe(0);
  });
  it('NRV-5 the five signatures, once per battle', () => {
    // Call the line: +1 reserve to allies in sight, up to the signature cap.
    let s = arena(['marlow', 'haldane', 'okonjo', 'dir-2']);
    place(s, 'marlow', 5, 12); place(s, 'haldane', 7, 12); place(s, 'okonjo', 3, 12); place(s, 'dir-2', 0, 0);
    s = ok(s, { type: 'standDown', unit: 'okonjo' }).state;
    s = ok(s, { type: 'maneuver', unit: 'marlow', id: 'call-the-line' }).state;
    s = ok(s, { type: 'standDown', unit: 'haldane' }).state;
    expect([u(s, 'okonjo').reserve, u(s, 'haldane').reserve]).toEqual([RULES.drive.signatureReserveCap, RULES.drive.signatureReserveCap]);
    no(s, { type: 'maneuver', unit: 'marlow', id: 'call-the-line' });
    // Shoulder to shoulder: Brace plus Guard on every adjacent ally.
    let o = arena(['okonjo', 'haldane', 'marlow', 'dir-2']);
    place(o, 'okonjo', 5, 12); place(o, 'haldane', 4, 12); place(o, 'marlow', 6, 12); place(o, 'dir-2', 0, 0); u(o, 'okonjo').nerve = RULES.nerve.steady;
    o = ok(o, { type: 'maneuver', unit: 'okonjo', id: 'shoulder-to-shoulder' }).state;
    expect(u(o, 'okonjo').status.braced).toBe(true);
    expect([...u(o, 'okonjo').guarding].sort()).toEqual(['haldane', 'marlow']);
    // Ghost step: a free walk, only after a fire order.
    let v = arena(['varga', 'dir-2']);
    place(v, 'varga', 5, 11); place(v, 'dir-2', 5, 8); u(v, 'varga').nerve = RULES.nerve.steady;
    no(v, { type: 'maneuver', unit: 'varga', id: 'ghost-step', x: 7, y: 12, facing: 'N' });
    v = ok(v, { type: 'fire', unit: 'varga', slot: 'R', mode: 'snap', target: 'dir-2' }).state;
    const drive = u(v, 'varga').drive;
    v = ok(v, { type: 'maneuver', unit: 'varga', id: 'ghost-step', x: 7, y: 12, facing: 'N' }).state;
    expect([u(v, 'varga').x, u(v, 'varga').y, u(v, 'varga').drive]).toEqual([7, 12, drive]);
    // Hot patch: range 2, and nerve for the patched pilot.
    let h = arena(['haldane', 'marlow', 'dir-2']);
    place(h, 'haldane', 5, 12); place(h, 'marlow', 5, 10); place(h, 'dir-2', 0, 0);
    u(h, 'haldane').nerve = RULES.nerve.steady; u(h, 'marlow').hp.legs = 40; u(h, 'marlow').nerve = 5;
    h = ok(h, { type: 'maneuver', unit: 'haldane', id: 'hot-patch', target: 'marlow', part: 'legs' }).state;
    expect([u(h, 'marlow').hp.legs, u(h, 'marlow').nerve]).toEqual([85, 5 + 2]);
    // Drill tempo: +1 drive now to allies in sight still acting.
    let d = turn(arena(['hallen', 'dir-2', 'dir-4', 'marlow']), 'hostile');
    place(d, 'hallen', 5, 3); place(d, 'dir-2', 7, 3); place(d, 'dir-4', 3, 3); place(d, 'marlow', 0, 17);
    d = ok(d, { type: 'maneuver', unit: 'hallen', id: 'drill-tempo' }).state;
    expect([u(d, 'dir-2').drive, u(d, 'dir-4').drive]).toEqual([5, 5]);
    expect(u(d, 'hallen').sigUsed).toBe(true);
  });
  it('NRV-6 nerve and signature use live in the state, so replays are exact', () => {
    const r = runBattle(11, 'normal', 'normal', false);
    expect(replay(11, r.actions)).toBe(hash(r.state));
    expect(r.state.units.every((w) => typeof w.nerve === 'number' && typeof w.sigUsed === 'boolean')).toBe(true);
  });
  it('NRV-7 the AI’s view shows every walker’s nerve', () => {
    const s = fresh1();
    expect(view(s, 'hostile').units.map((w) => w.nerve)).toEqual(s.units.map((w) => w.nerve));
  });
});
