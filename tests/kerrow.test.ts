// The Kerrow Locks (docs/spec/20-kerrow.md). tests/coverage.test.ts checks that every spec 20 id appears here.
import { describe, expect, it } from 'vitest';
import { RULES } from '../src/engine/data';
import { hasLos, reachable, tileAt } from '../src/engine/grid';
import { fireBlock, litAt, maneuverBlock, overwatchers, seenBy, sees, stats } from '../src/engine/query';
import { newBattle, step, view } from '../src/engine/step';
import { seedRng } from '../src/engine/rng';
import type { Action, BattleState, GameEvent, Unit } from '../src/engine/types';

const fresh = (seed = 1) => newBattle('kerrow-locks', seed);
const u = (s: BattleState, id: string): Unit => s.units.find((x) => x.id === id)!;
const tile = (s: BattleState, x: number, y: number) => s.tiles[y * s.w + x]!;
/** Keep only the named walkers, the rest of the field as built. */
function only(keep: string[], seed = 1): BattleState { const s = fresh(seed); s.units = s.units.filter((x) => keep.includes(x.id)); return s; }
const place = (s: BattleState, id: string, x: number, y: number) => { const w = u(s, id); w.x = x; w.y = y; };
const ok = (s: BattleState, a: Action) => { const r = step(s, a); expect(r.events[0]?.type, JSON.stringify(r.events[0])).not.toBe('rejected'); return r; };
const no = (s: BattleState, a: Action) => expect(step(s, a).events[0]?.type).toBe('rejected');
function until(s: BattleState, a: Action, cond: (ev: GameEvent[]) => boolean) {
  for (let seed = 1; seed < 200; seed++) { s.rng = seedRng(seed); const r = step(s, a); if (cond(r.events)) return r; }
  throw new Error('never happened');
}

describe('the canal (slice 6b)', () => {
  it('LCK-1 deep water cannot be entered and does not block sight', () => {
    const s = only(['marlow', 'dir-2']);
    place(s, 'marlow', 6, 10);
    expect(tile(s, 6, 9).t).toBe('deep');
    expect(reachable(s, u(s, 'marlow'), 4).some((r) => r.y <= 9 && r.x === 6)).toBe(false);
    expect(hasLos(s, { x: 6, y: 11 }, { x: 6, y: 6 })).toBe(true);
  });
  it('LCK-2 Swing opens the bridge from beside a winch, closes it again, and not with a walker on it', () => {
    let s = only(['varga', 'dir-2']);
    place(s, 'varga', 3, 10); place(s, 'dir-2', 12, 2);
    expect(tile(s, 3, 9).t).toBe('deck');
    expect(maneuverBlock(s, u(s, 'varga'), 'swing', null, null, null)).toBe(null);
    s = ok(s, { type: 'maneuver', unit: 'varga', id: 'swing' }).state;
    expect([tile(s, 3, 8).t, tile(s, 3, 9).t, u(s, 'varga').drive]).toEqual(['deep', 'deep', 5 - 2]);
    s = ok(s, { type: 'maneuver', unit: 'varga', id: 'swing' }).state;
    expect(tile(s, 3, 9).t).toBe('deck');
    const busy = only(['varga', 'haldane', 'dir-2']); place(busy, 'varga', 3, 10); place(busy, 'haldane', 3, 9);
    expect(maneuverBlock(busy, u(busy, 'varga'), 'swing', null, null, null)).toContain('on the bridge');
    const far = only(['varga', 'dir-2']); place(far, 'varga', 6, 12);
    expect(maneuverBlock(far, u(far, 'varga'), 'swing', null, null, null)).toContain('winch');
  });
  it('LCK-3 winches block movement and cannot be broken', () => {
    const s = only(['marlow', 'dir-2']);
    expect(tile(s, 2, 10).obj).toBe('winch');
    expect(RULES.objects.winch).toMatchObject({ breakable: false, cover: false, blocksSight: false });
    place(s, 'marlow', 1, 10);
    expect(reachable(s, u(s, 'marlow'), 2).some((r) => r.x === 2 && r.y === 10)).toBe(false);
  });
  it('LCK-4 a lock gate blocks sight and gives cover; broken, it leaves deep water', () => {
    const s = only(['marlow', 'dir-2']);
    expect(hasLos(s, { x: 8, y: 11 }, { x: 8, y: 6 })).toBe(false);
    place(s, 'marlow', 8, 11); place(s, 'dir-2', 12, 2);
    tile(s, 8, 9).objHp = 10;
    const r = ok(s, { type: 'fireAt', unit: 'marlow', slot: 'R', mode: 'burst', x: 8, y: 9 });
    expect(tile(r.state, 8, 9)).toMatchObject({ obj: null, t: 'deep' });
  });
  it('LCK-5 the first broken gate floods the low quays and mires walkers on them, once', () => {
    const s = only(['marlow', 'dir-4', 'dir-2']);
    place(s, 'marlow', 8, 11); place(s, 'dir-4', 11, 7); place(s, 'dir-2', 12, 2);
    tile(s, 8, 9).objHp = 10;
    const r = ok(s, { type: 'fireAt', unit: 'marlow', slot: 'R', mode: 'burst', x: 8, y: 9 });
    const f = r.events.find((e) => e.type === 'flood')!;
    expect(f.type === 'flood' && f.mired).toEqual(['dir-4']);
    expect(tile(r.state, 11, 7).t).toBe('water');
    expect(tile(r.state, 12, 10).t).toBe('water');
    expect(r.state.flooded).toBe(true);
    expect(u(r.state, 'dir-4').status.mired).toBe(true);
    tile(r.state, 8, 8).objHp = 10;
    const again = step(step(r.state, { type: 'endPhase' }).state, { type: 'endPhase' }).state;
    const r2 = ok(again, { type: 'fireAt', unit: 'marlow', slot: 'R', mode: 'burst', x: 8, y: 8 });
    expect(r2.events.some((e) => e.type === 'flood')).toBe(false);
  });
  it('LCK-6 a lamp is an object without cover; shot out, it leaves bare quay', () => {
    const s = only(['marlow', 'dir-2']);
    expect(tile(s, 5, 11).obj).toBe('lamp');
    expect(RULES.objects.lamp).toMatchObject({ breakable: true, cover: false, blocksSight: false });
    place(s, 'marlow', 5, 13); place(s, 'dir-2', 12, 2);
    const r = ok(s, { type: 'fireAt', unit: 'marlow', slot: 'L', mode: 'double', x: 5, y: 11 });
    expect(tile(r.state, 5, 11)).toMatchObject({ obj: null, t: 'concrete' });
  });
  it('LCK-7 the gate bonus is paid on a win only while no gate has broken', () => {
    const s = only(['marlow', 'dir-2']);
    place(s, 'marlow', 6, 10); place(s, 'dir-2', 6, 7); u(s, 'dir-2').hp.body = 1;
    const win = until(s, { type: 'fire', unit: 'marlow', slot: 'R', mode: 'burst', target: 'dir-2' }, (ev) => ev.some((e) => e.type === 'end'));
    expect(win.state.result!.credits.gate).toBe(1500);
    const broke = JSON.parse(JSON.stringify(s)) as BattleState; broke.flooded = true;
    const w2 = until(broke, { type: 'fire', unit: 'marlow', slot: 'R', mode: 'burst', target: 'dir-2' }, (ev) => ev.some((e) => e.type === 'end'));
    expect(w2.state.result!.credits.gate).toBe(0);
  });
  it('LCK-8 a push into deep water collides at the quay edge', () => {
    let s = only(['marlow', 'dir-4', 'dir-2']);
    place(s, 'marlow', 6, 10); place(s, 'dir-4', 6, 11); place(s, 'dir-2', 12, 2);
    s.phase = 'hostile'; u(s, 'dir-4').drive = stats(s, u(s, 'dir-4')).drive; u(s, 'dir-4').done = false;
    const r = until(s, { type: 'fire', unit: 'dir-4', slot: 'L', mode: 'shove', target: 'marlow' }, (ev) => ev.some((e) => e.type === 'pushed'));
    expect(r.events.find((e) => e.type === 'pushed')).toMatchObject({ result: 'collide', dmg: RULES.push.collide });
    expect([u(r.state, 'marlow').x, u(r.state, 'marlow').y]).toEqual([6, 10]);
    expect(tileAt(r.state, 6, 9)!.t).toBe('deep');
    void s;
  });
});

describe('night and fog (slice 6c)', () => {
  it('FOG-1 night sight: 5 tiles, a sensor mast to its range, lit tiles from any distance', () => {
    const s = only(['marlow', 'varga', 'dir-2']);
    place(s, 'marlow', 9, 16); place(s, 'varga', 0, 17); place(s, 'dir-2', 9, 11);
    expect(s.night).toBe(true);
    expect(sees(s, u(s, 'marlow'), { x: 9, y: 11 })).toBe(true);
    place(s, 'dir-2', 9, 10);
    expect(sees(s, u(s, 'marlow'), { x: 9, y: 10 })).toBe(false);
    place(s, 'varga', 9, 17);
    expect(sees(s, u(s, 'varga'), { x: 9, y: 10 })).toBe(true); // a sensor mast sees to 7
    expect(sees(s, u(s, 'marlow'), { x: 12, y: 10 })).toBe(true); // under the lamp at 12,11
    const day = newBattle('marrow-yard', 1);
    for (const p of [{ x: 13, y: 0 }, { x: 6, y: 2 }, { x: 0, y: 5 }]) expect(sees(day, day.units[0]!, p)).toBe(hasLos(day, day.units[0]!, p)); // daylight: sight is line of sight
  });
  it('FOG-2 lamps and flares light the 3 by 3 around them', () => {
    const s = only(['okonjo', 'dir-2']);
    expect([litAt(s, { x: 4, y: 12 }), litAt(s, { x: 6, y: 10 }), litAt(s, { x: 7, y: 11 })]).toEqual([true, true, false]);
    place(s, 'okonjo', 6, 16);
    const r = ok(s, { type: 'fireAt', unit: 'okonjo', slot: 'P', mode: 'flare', x: 9, y: 13 }).state;
    expect([litAt(r, { x: 10, y: 14 }), litAt(r, { x: 11, y: 14 })]).toEqual([true, false]);
  });
  it('FOG-3 a broken lamp lights nothing', () => {
    const s = only(['marlow', 'dir-2']);
    place(s, 'marlow', 5, 13);
    const r = ok(s, { type: 'fireAt', unit: 'marlow', slot: 'L', mode: 'double', x: 5, y: 11 }).state;
    expect(litAt(r, { x: 5, y: 12 })).toBe(false);
  });
  it('FOG-4 orders, return fire and overwatch need the target seen', () => {
    const s = only(['marlow', 'dir-2', 'dir-4']);
    place(s, 'marlow', 9, 16); place(s, 'dir-2', 9, 10); place(s, 'dir-4', 0, 0);
    u(s, 'marlow').build.wR = 'w-rifle';
    expect(fireBlock(s, u(s, 'marlow'), 'R', 'shot', u(s, 'dir-2'))).toBe('not seen');
    place(s, 'dir-2', 9, 12);
    expect(fireBlock(s, u(s, 'marlow'), 'R', 'shot', u(s, 'dir-2'))).toBe(null);
    // Overwatch: the lane tile must be seen.
    const o = only(['dir-4', 'marlow', 'dir-2']);
    place(o, 'dir-4', 9, 3); u(o, 'dir-4').overwatch = { slot: 'R', dir: 'S' }; place(o, 'marlow', 0, 17); place(o, 'dir-2', 0, 0);
    expect(overwatchers(o, u(o, 'marlow'), { x: 9, y: 7 }).map((w) => w.id)).toEqual(['dir-4']);
    o.smoke = [{ x: 9, y: 5, side: 'player' }];
    expect(overwatchers(o, u(o, 'marlow'), { x: 9, y: 7 })).toEqual([]);
  });
  it('FOG-5 a walker that fires is flashed to the side it fired at, until that side ends its phase', () => {
    let s = only(['marlow', 'dir-2']);
    place(s, 'marlow', 9, 13); place(s, 'dir-2', 9, 10);
    u(s, 'dir-2').build.wR = 'w-rifle';
    s = ok(s, { type: 'fire', unit: 'marlow', slot: 'L', mode: 'double', target: 'dir-2' }).state;
    expect(u(s, 'marlow').flash).toBe('hostile');
    s = step(s, { type: 'endPhase' }).state;
    expect(u(s, 'marlow').flash).toBe('hostile');
    s = step(s, { type: 'endPhase' }).state;
    expect(u(s, 'marlow').flash).toBe(null);
  });
  it('FOG-6 Flare lights a 3 by 3 until the firer side next phase, and costs a round', () => {
    let s = only(['okonjo', 'dir-2']);
    place(s, 'okonjo', 6, 16);
    s = ok(s, { type: 'fireAt', unit: 'okonjo', slot: 'P', mode: 'flare', x: 9, y: 13 }).state;
    expect([s.flares!.length, u(s, 'okonjo').ammo]).toEqual([1, 2]);
    s = step(s, { type: 'endPhase' }).state;
    expect(s.flares!.length).toBe(1);
    s = step(s, { type: 'endPhase' }).state;
    expect(s.flares!.length).toBe(0);
  });
  it('FOG-7 view leaves out unseen enemies and keeps only its own intel', () => {
    const s = fresh();
    const v = view(s, 'player');
    const shown = v.units.filter((w) => w.side === 'hostile');
    expect(shown.every((w) => seenBy(s, 'player', w))).toBe(true);
    expect(shown.length).toBeLessThan(s.units.filter((w) => w.side === 'hostile').length);
    expect(Object.keys(v.intel!.player).length).toBe(6);
    expect(v.intel!.hostile).toEqual({});
    expect(view(newBattle('marrow-yard', 1), 'player').units.length).toBe(9);
  });
  it('FOG-8 a walk into an unseen enemy stops on the free tile before it, and cannot be undone', () => {
    const s = only(['marlow', 'dir-2']);
    place(s, 'marlow', 9, 17); place(s, 'dir-2', 9, 13);
    tile(s, 9, 13).t = 'concrete';
    // dir-2 stands in the dark 4 tiles off: not seen at 4? It is within 5, so hide it behind smoke.
    s.smoke = [{ x: 9, y: 14, side: 'hostile' }];
    expect(seenBy(s, 'player', u(s, 'dir-2'))).toBe(false);
    const r = ok(s, { type: 'walk', unit: 'marlow', x: 9, y: 13, facing: 'N' });
    expect(r.events.some((e) => e.type === 'ambush' && e.enemy === 'dir-2')).toBe(true);
    expect([u(r.state, 'marlow').x, u(r.state, 'marlow').y]).toEqual([9, 14]);
    no(r.state, { type: 'undoWalk', unit: 'marlow' });
  });
});
