import { describe, expect, it } from 'vitest';
import { chooseAction } from '../src/ai';
import { applyResult, equip, newCampaign, repair, repaint, walkerSummary, deployFrom } from '../src/engine/campaign';
import { RULES } from '../src/engine/data';
import { hasCover, hasLos, reachable } from '../src/engine/grid';
import { canFire, hitChance, preview, stats, weapons } from '../src/engine/query';
import { hash, legalActions, newBattle, step, view } from '../src/engine/step';
import { clearSave, describe as describeSave, readSave, writeSave, type Envelope, type StorageLike } from '../src/client/save';
import { invariants, replay, runBattle } from '../src/sim/run';
import type { BattleState } from '../src/engine/types';
import { arena, fresh, place, u } from './helpers';

const tile = (s: BattleState, x: number, y: number) => s.tiles[y * s.w + x]!;

describe('engine contract', () => {
  it('ARCH-1 step never throws and rejects illegal actions without change', () => {
    const s = fresh();
    const r = step(s, { type: 'walk', unit: 'dir-1', x: 0, y: 0, facing: 'N' });
    expect(r.state).toBe(s);
    expect(r.events[0]?.type).toBe('rejected');
    expect(() => step(s, { type: 'bogus' } as never)).not.toThrow();
  });
  it('ARCH-2 legalActions is never empty and always offers endPhase', () => {
    const s = fresh();
    expect(legalActions(s).some((a) => a.type === 'endPhase')).toBe(true);
  });
  it('ARCH-3 query owns the numbers: preview matches what step uses', () => {
    const s = arena(['marlow', 'dir-2']);
    place(s, 'marlow', 5, 10); place(s, 'dir-2', 5, 7);
    const p = preview(s, u(s, 'marlow'), 'R', 'burst', u(s, 'dir-2'))!;
    const r = step(s, { type: 'fire', unit: 'marlow', slot: 'R', mode: 'burst', target: 'dir-2' });
    const ev = r.events.find((e) => e.type === 'attack');
    expect(ev && ev.type === 'attack' ? ev.chance : -1).toBe(p.chance);
  });
  it('ARCH-4 the AI reads the view only and is a pure function of it', () => {
    const s = fresh(5);
    const a1 = chooseAction(view(s, 'player')), a2 = chooseAction(view(s, 'player'));
    expect(a1).toEqual(a2);
    expect(view(s, 'hostile').rng).toEqual([0, 0, 0, 0]);
  });
  it('ARCH-5 the same seed and actions replay to the same hash', () => {
    const r = runBattle(3, 'normal', 'normal', false);
    expect(replay(3, r.actions)).toBe(hash(r.state));
  });
  it('ARCH-6 the state is plain JSON', () => {
    const s = runBattle(4, 'normal', 'normal', false).state;
    expect(JSON.parse(JSON.stringify(s))).toEqual(s);
  });
});

describe('the field', () => {
  it('MAP-1 the yard is a 14 by 18 grid with levels 0 and 1', () => {
    const s = fresh();
    expect([s.w, s.h]).toEqual([14, 18]);
    expect(new Set(s.tiles.map((t) => t.h))).toEqual(new Set([0, 1]));
  });
  it('MAP-2 water costs 2, climbing costs 1 more, moves are 4-way', () => {
    const s = arena(['marlow']);
    place(s, 'marlow', 5, 5);
    tile(s, 6, 5).t = 'water';
    tile(s, 5, 6).h = 1;
    const r = reachable(s, u(s, 'marlow'), 2);
    expect(r.find((t) => t.x === 6 && t.y === 5)?.cost).toBe(2);
    expect(r.find((t) => t.x === 5 && t.y === 6)?.cost).toBe(2);
    expect(r.find((t) => t.x === 6 && t.y === 6)).toBeUndefined();
  });
  it('MAP-3 objects block movement; silos cannot break', () => {
    const s = arena(['marlow']);
    place(s, 'marlow', 5, 5);
    tile(s, 6, 5).obj = 'wagon';
    expect(reachable(s, u(s, 'marlow'), 1).find((t) => t.x === 6 && t.y === 5)).toBeUndefined();
    expect(RULES.objects.silo.breakable).toBe(false);
  });
  it('MAP-4 containers block sight, wagons do not', () => {
    const s = arena([]);
    tile(s, 5, 5).obj = 'wagon';
    expect(hasLos(s, { x: 5, y: 3 }, { x: 5, y: 8 })).toBe(true);
    tile(s, 5, 5).obj = 'container';
    expect(hasLos(s, { x: 5, y: 3 }, { x: 5, y: 8 })).toBe(false);
  });
  it('MAP-5 cover comes from the tile just before the target', () => {
    const s = arena([]);
    tile(s, 5, 7).obj = 'barrier';
    expect(hasCover(s, { x: 5, y: 3 }, { x: 5, y: 8 })).toBe(true);
    expect(hasCover(s, { x: 5, y: 12 }, { x: 5, y: 8 })).toBe(false);
  });
  it('MAP-6 standing in water costs 10 evasion', () => {
    const s = arena(['varga']);
    const dry = stats(s, u(s, 'varga')).evade;
    tile(s, u(s, 'varga').x, u(s, 'varga').y).t = 'water';
    expect(stats(s, u(s, 'varga')).evade).toBe(dry - RULES.waterEvade);
  });
});

describe('walkers', () => {
  it('WLK-1 each part has its own HP', () => {
    const w = u(fresh(), 'marlow');
    expect(Object.keys(w.hp).sort()).toEqual(['armL', 'armR', 'body', 'legs']);
  });
  it('WLK-2 overweight costs 10 evasion (and drive, DRV-7), not move', () => {
    const s = arena(['varga']);
    const before = stats(s, u(s, 'varga'));
    u(s, 'varga').build.wL = 'w-rifle';
    u(s, 'varga').build.pack = 'pack-mortar';
    const after = stats(s, u(s, 'varga'));
    expect(after.overweight).toBe(true);
    expect(after.move).toBe(before.move);
    expect(after.evade).toBe(before.evade - 10);
  });
  it('WLK-3 a lost arm loses its weapon; lost legs move 1', () => {
    const s = arena(['marlow']);
    u(s, 'marlow').hp.armR = 0; u(s, 'marlow').hp.legs = 0;
    expect(weapons(u(s, 'marlow')).find((w) => w.slot === 'R')?.usable).toBe(false);
    expect(stats(s, u(s, 'marlow')).move).toBe(1);
  });
  it('WLK-4 hits on a lost part go to the body', () => {
    const s = arena(['marlow', 'dir-4']);
    place(s, 'marlow', 5, 10); place(s, 'dir-4', 5, 9);
    const t = u(s, 'marlow');
    t.hp.armL = 0; t.hp.armR = 0; t.hp.legs = 0;
    s.phase = 'hostile'; u(s, 'dir-4').drive = 4;
    const r = step(s, { type: 'fire', unit: 'dir-4', slot: 'L', mode: 'strike', target: 'marlow' });
    const ev = r.events.find((e) => e.type === 'attack' && !e.counter);
    if (ev?.type === 'attack') for (const sh of ev.shots) if (sh.hit) expect(sh.part).toBe('body');
  });
});

describe('phases', () => {
  it('TRN-1 round 1 starts with the player', () => {
    const s = fresh();
    expect([s.round, s.phase]).toEqual([1, 'player']);
  });
  it('TRN-3 allies can be passed but not ended on', () => {
    const s = arena(['marlow', 'haldane']);
    place(s, 'marlow', 5, 10); place(s, 'haldane', 5, 9);
    const r = reachable(s, u(s, 'marlow'), 2);
    expect(r.find((t) => t.x === 5 && t.y === 9)).toBeUndefined();
    expect(r.find((t) => t.x === 5 && t.y === 8)).toBeDefined();
  });
  it('TRN-5 ending both phases starts the next round', () => {
    let s = fresh();
    s = step(s, { type: 'endPhase' }).state;
    expect(s.phase).toBe('hostile');
    s = step(s, { type: 'endPhase' }).state;
    expect([s.round, s.phase]).toEqual([2, 'player']);
  });
});

describe('attacks', () => {
  it('ATK-5 a mortar fires over walls when an ally sees the target, with splash', () => {
    const s = arena(['okonjo', 'varga', 'dir-2', 'dir-4']);
    place(s, 'okonjo', 5, 14); place(s, 'varga', 9, 8); place(s, 'dir-2', 5, 8); place(s, 'dir-4', 6, 8);
    tile(s, 5, 11).obj = 'container';
    expect(canFire(s, u(s, 'okonjo'), 'P', 'he', u(s, 'dir-2'))).toBe(true);
    let splashed = false;
    for (let seed = 1; seed < 20 && !splashed; seed++) { s.rng = [seed, 2, 3, 4]; if (step(s, { type: 'fire', unit: 'okonjo', slot: 'P', mode: 'he', target: 'dir-2' }).events.some((e) => e.type === 'splash')) splashed = true; }
    expect(splashed).toBe(true);
  });
  it('ATK-6 the mortar runs out of ammunition', () => {
    const s = arena(['okonjo', 'dir-2']);
    place(s, 'okonjo', 5, 14); place(s, 'dir-2', 5, 9);
    u(s, 'okonjo').ammo = 0;
    expect(canFire(s, u(s, 'okonjo'), 'P', 'he', u(s, 'dir-2'))).toBe(false);
  });
  it('ATK-7 a sensor spotter adds 20 to indirect fire', () => {
    const s = arena(['okonjo', 'varga', 'dir-2']);
    place(s, 'okonjo', 5, 14); place(s, 'dir-2', 5, 9); place(s, 'varga', 0, 0);
    const alone = hitChance(s, u(s, 'okonjo'), 'P', 'he', u(s, 'dir-2'));
    place(s, 'varga', 8, 9);
    expect(hitChance(s, u(s, 'okonjo'), 'P', 'he', u(s, 'dir-2'))).toBe(Math.min(95, alone + 20));
  });
  it('ATK-9 objects take every shot of the mode and turn to rubble', () => {
    const s = arena(['marlow']);
    place(s, 'marlow', 5, 12); tile(s, 5, 10).obj = 'barrier'; tile(s, 5, 10).objHp = 45;
    const r = step(s, { type: 'fireAt', unit: 'marlow', slot: 'R', mode: 'burst', x: 5, y: 10 });
    expect(tile(r.state, 5, 10).obj).toBe(null);
    expect(tile(r.state, 5, 10).t).toBe('rubble');
  });
});

describe('support, pilots, end', () => {
  it('PIL-1 a destroyed walker ejects its pilot (destroyed, not removed)', () => {
    const s = arena(['marlow', 'dir-4']);
    place(s, 'marlow', 5, 10); place(s, 'dir-4', 5, 9);
    u(s, 'marlow').hp.body = 1;
    s.phase = 'hostile'; u(s, 'dir-4').drive = 4;
    let destroyed = false;
    for (let seed = 1; seed < 10 && !destroyed; seed++) { s.rng = [seed, 9, 9, 9]; destroyed = step(s, { type: 'fire', unit: 'dir-4', slot: 'L', mode: 'strike', target: 'marlow' }).events.some((e) => e.type === 'destroyed' && e.unit === 'marlow'); }
    expect(destroyed).toBe(true);
  });
  it('PIL-2 pilot skill adds to hit chance', () => {
    const s = arena(['marlow', 'haldane', 'dir-2']);
    place(s, 'marlow', 4, 12); place(s, 'haldane', 6, 12); place(s, 'dir-2', 5, 9);
    u(s, 'marlow').build.wR = 'w-carbine';
    u(s, 'marlow').nerve = u(s, 'haldane').nerve; // nerve bands (HIT-2) aside
    expect(hitChance(s, u(s, 'marlow'), 'R', 'double', u(s, 'dir-2')) - hitChance(s, u(s, 'haldane'), 'R', 'double', u(s, 'dir-2'))).toBe(10);
  });
  it('END-1 the player wins when every hostile falls', () => {
    const s = arena(['marlow', 'dir-2']);
    place(s, 'marlow', 5, 12); place(s, 'dir-2', 5, 10); u(s, 'dir-2').hp.body = 1;
    for (let seed = 1; seed < 20; seed++) { s.rng = [seed, 1, 1, 1]; const r = step(s, { type: 'fire', unit: 'marlow', slot: 'R', mode: 'burst', target: 'dir-2' }); if (r.state.result) { expect(r.state.result.winner).toBe('player'); return; } }
    throw new Error('never hit');
  });
  it('END-2 the round limit ends the battle as a loss', () => {
    let s = fresh();
    for (let i = 0; i < 100 && !s.result; i++) s = step(s, { type: 'endPhase' }).state;
    expect(s.result?.reason).toBe('timeout');
    expect(s.result?.winner).toBe('hostile');
  });
  it('END-3 the result lists rounds, losses and salvage', () => {
    const r = runBattle(2, 'normal', 'random', false).state.result!;
    expect(r).toHaveProperty('rounds'); expect(r).toHaveProperty('lost'); expect(r).toHaveProperty('salvage');
  });
});

describe('salvage and hangar', () => {
  const won = () => { for (let seed = 1; seed < 40; seed++) { const r = runBattle(seed, 'normal', 'random', false); if (r.state.result?.winner === 'player' && r.state.result.salvage.length) return r.state; } throw new Error('no win'); };
  it('SAL-1 a win pays the fee and bounty and adds salvage to the inventory', () => {
    const s = won();
    const c = applyResult(newCampaign(), s);
    expect(c.credits).toBeGreaterThan(newCampaign().credits);
    expect(c.inventory.length).toBe(s.result!.salvage.length);
    expect(c.mission).toBe(1);
  });
  it('HGR-1 parts swap between walker and inventory; a walker keeps its arms', () => {
    const c = applyResult(newCampaign(), won());
    const armItem = c.inventory.find((i) => i.kind === 'arm');
    if (armItem) {
      const c2 = equip(c, 'marlow', 'armL', armItem.uid);
      expect(typeof c2).not.toBe('string');
      if (typeof c2 !== 'string') expect(c2.roster.find((r) => r.pilot === 'marlow')!.build.armL).toBe(armItem.id);
    }
    expect(equip(c, 'marlow', 'armL', null)).toBe('a walker must keep a body, two arms and legs');
  });
  it('HGR-2 repair costs credits per HP', () => {
    const c = newCampaign();
    c.roster[0]!.hp.legs -= 10;
    const c2 = repair(c, c.roster[0]!.pilot, 'legs');
    expect(typeof c2 !== 'string' && c.credits - c2.credits).toBe(10 * RULES.repairCost);
  });
  it('HGR-3 repainting a salvaged part costs credits and changes only paint', () => {
    const c = newCampaign();
    c.roster[0]!.paint.armL = 'camo';
    const c2 = repaint(c, c.roster[0]!.pilot, 'armL');
    expect(typeof c2 !== 'string' && c2.roster[0]!.paint.armL).toBe('slate');
    expect(typeof c2 !== 'string' && c.credits - c2.credits).toBe(RULES.repaintCost);
  });
  it('HGR-4 the hangar summary comes from query', () => {
    const c = newCampaign();
    const sum = walkerSummary(c.roster[0]!);
    expect(sum.move).toBeGreaterThan(0);
    expect(sum.weapons.length).toBeGreaterThan(0);
    expect(deployFrom(c).length).toBe(4);
  });
});

describe('save', () => {
  const mem = (): StorageLike & { m: Map<string, string> } => { const m = new Map<string, string>(); return { m, getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) }; };
  it('SAV-1 one envelope round-trips; the snapshot is what reopens', () => {
    const st = mem();
    const b = newBattle('marrow-yard', 9);
    const env: Envelope = { v: 2, savedAt: 0, screen: 'battle', campaign: newCampaign(), battle: { seed: 9, actions: [], snapshot: b } };
    expect(writeSave(env, st)).toBe(null);
    const r = readSave(st);
    expect(r.ok && r.env.battle?.snapshot).toEqual(b);
  });
  it('SAV-2 Continue names what it reopens; damaged saves say why', () => {
    const st = mem();
    const env: Envelope = { v: 2, savedAt: 0, screen: 'battle', campaign: newCampaign(), battle: { seed: 9, actions: [], snapshot: newBattle('marrow-yard', 9) } };
    expect(describeSave(env)).toContain('round 1');
    st.setItem('ib-save', '{broken');
    const r = readSave(st);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toContain('damaged');
    clearSave(st);
    expect(readSave(st)).toEqual({ ok: false, reason: 'none' });
    expect(writeSave(env, null)).toContain('refuses storage');
    // PLAN Q17: a v1 save taken mid-battle reopens at the briefing with the pre-battle company, and says so.
    st.setItem('ib-save', JSON.stringify({ v: 1, savedAt: 0, screen: 'battle', campaign: newCampaign(), battle: { seed: 1, actions: [], snapshot: {} } }));
    const old = readSave(st);
    expect(old.ok && old.env.screen).toBe('briefing');
    expect(old.ok && describeSave(old.env)).toContain('old rules');
  });
});

describe('sim invariants', () => {
  it('no invariant breaks over 10 AI battles', () => {
    for (let seed = 1; seed <= 10; seed++) expect(runBattle(seed, 'normal', 'normal').violations).toEqual([]);
    expect(invariants(fresh())).toEqual([]);
  });
});
