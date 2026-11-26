// Between battles: the roster, the parts inventory and credits (SAL-1, HGR-1..4). Pure functions over plain JSON.
import { arm, body, legs, MISSIONS, pack, RULES, weapon } from './data';
import { maxHp, modes, stats, weapons } from './query';
import { makeUnit, type Deploy } from './step';
import type { BattleState, Build, Paint, PaintSlot, PartSlot, SalvageItem, Unit } from './types';

export type ItemKind = 'body' | 'arm' | 'legs' | 'pack' | 'weapon';
export interface Item { uid: string; kind: ItemKind; id: string; hp: number; paint: Paint }
export interface RosterWalker { pilot: string; build: Build; hp: Record<PartSlot, number>; paint: Record<PaintSlot, Paint> }
export interface Campaign { v: 1; credits: number; roster: RosterWalker[]; inventory: Item[]; mission: number; nextUid: number; log: string[] }

export const MISSION_ORDER = ['marrow-yard'];

export function newCampaign(): Campaign {
  const m = MISSIONS['marrow-yard']!;
  const roster: RosterWalker[] = m.units.filter((u) => u.side === 'player').map((u) => {
    const ghost = { build: u.build } as Unit;
    return {
      pilot: u.pilot, build: { ...u.build },
      hp: { body: maxHp(ghost, 'body'), armL: maxHp(ghost, 'armL'), armR: maxHp(ghost, 'armR'), legs: maxHp(ghost, 'legs') },
      paint: { body: 'slate', armL: 'slate', armR: 'slate', legs: 'slate', pack: 'slate' },
    };
  });
  return { v: 1, credits: 1500, roster, inventory: [], mission: 0, nextUid: 1, log: [] };
}

export function deployFrom(c: Campaign): Deploy[] {
  const m = MISSIONS[MISSION_ORDER[Math.min(c.mission, MISSION_ORDER.length - 1)]!]!;
  const starts = m.units.filter((u) => u.side === 'player');
  return c.roster.filter((r) => r.hp.body > 0).map((r, i) => {
    const st = starts.find((u) => u.pilot === r.pilot) ?? starts[i % starts.length]!;
    return { id: r.pilot, pilot: r.pilot, side: 'player' as const, x: st.x, y: st.y, facing: st.facing, build: { ...r.build }, hp: { ...r.hp }, paint: { ...r.paint } };
  });
}

const salvageKind = (s: SalvageItem): ItemKind => s.kind;

/** SAL-1: fold a finished battle into the campaign: damage carries over, salvage joins the inventory, credits are paid. */
export function applyResult(c0: Campaign, s: BattleState): Campaign {
  const c: Campaign = JSON.parse(JSON.stringify(c0));
  if (!s.result) return c;
  for (const r of c.roster) {
    const u = s.units.find((x) => x.pilot === r.pilot);
    if (u) r.hp = { ...u.hp, body: u.alive ? u.hp.body : 0 };
  }
  if (s.result.winner === 'player') {
    for (const it of s.result.salvage) c.inventory.push({ uid: `i${c.nextUid++}`, kind: salvageKind(it), id: it.id, hp: it.hp, paint: it.paint });
    const cr = s.result.credits;
    c.credits += cr.fee + cr.bonus + cr.bounty;
    c.mission += 1;
    c.log.push(`${MISSIONS[s.mission]!.name}: won in ${s.result.rounds} rounds, +${cr.fee + cr.bonus + cr.bounty} credits, ${s.result.salvage.length} parts salvaged`);
  } else c.log.push(`${MISSIONS[s.mission]!.name}: withdrawn`);
  return c;
}

export function itemMaxHp(kind: ItemKind, id: string): number {
  if (kind === 'body') return body(id).hp;
  if (kind === 'arm') return arm(id).hp;
  if (kind === 'legs') return legs(id).hp;
  return 0;
}

export function itemName(kind: ItemKind, id: string): string {
  if (kind === 'body') return body(id).name;
  if (kind === 'arm') return arm(id).name;
  if (kind === 'legs') return legs(id).name;
  if (kind === 'pack') return pack(id).name;
  return weapon(id)?.name ?? id;
}

/** HGR-4: what the hangar shows for a walker. */
export function walkerSummary(r: RosterWalker) {
  const u = makeUnit({ id: r.pilot, pilot: r.pilot, side: 'player', x: 0, y: 0, build: r.build, paint: r.paint, hp: r.hp });
  u.hp = { ...r.hp };
  const st = stats(null, u);
  return {
    ...st,
    weapons: weapons(u).map((w) => ({
      slot: w.slot, name: w.def.name, cls: w.def.class, range: [w.def.min, w.def.max], shots: w.def.shots, dmg: w.def.dmg, acc: w.def.acc, usable: w.usable,
      modes: modes(u).filter((m) => m.slot === w.slot).map((m) => ({ id: m.mode.id, name: m.mode.name, dp: m.dp, shots: m.shots, dmg: Math.round(m.dmg), acc: m.acc })),
    })),
    max: { body: maxHp(u, 'body'), armL: maxHp(u, 'armL'), armR: maxHp(u, 'armR'), legs: maxHp(u, 'legs') },
  };
}

export type EquipSlot = 'body' | 'armL' | 'armR' | 'legs' | 'pack' | 'wL' | 'wR';
const slotKind = (slot: EquipSlot): ItemKind => (slot === 'armL' || slot === 'armR' ? 'arm' : slot === 'wL' || slot === 'wR' ? 'weapon' : slot);

/** HGR-1: swap the item `uid` (or nothing, for a weapon or pack slot) into a walker's slot; the old part goes to the inventory. */
export function equip(c0: Campaign, pilot: string, slot: EquipSlot, uid: string | null): Campaign | string {
  const c: Campaign = JSON.parse(JSON.stringify(c0));
  const r = c.roster.find((x) => x.pilot === pilot);
  if (!r) return 'no such walker';
  const kind = slotKind(slot);
  const item = uid ? c.inventory.find((i) => i.uid === uid) : null;
  if (uid && (!item || item.kind !== kind)) return 'that part does not fit this slot';
  if (!uid && (kind === 'body' || kind === 'arm' || kind === 'legs')) return 'a walker must keep a body, two arms and legs';
  const old = slot === 'wL' || slot === 'wR' ? r.build[slot] : slot === 'pack' ? (r.build.pack === 'pack-none' ? null : r.build.pack) : r.build[slot];
  if (old) {
    const hp = slot === 'body' || slot === 'armL' || slot === 'armR' || slot === 'legs' ? r.hp[slot] : 0;
    const paint = slot === 'wL' ? r.paint.armL : slot === 'wR' ? r.paint.armR : r.paint[slot as PaintSlot];
    c.inventory.push({ uid: `i${c.nextUid++}`, kind, id: old, hp, paint });
  }
  if (item) c.inventory = c.inventory.filter((i) => i.uid !== item.uid);
  if (slot === 'wL' || slot === 'wR') r.build[slot] = item?.id ?? null;
  else if (slot === 'pack') { r.build.pack = item?.id ?? 'pack-none'; r.paint.pack = item?.paint ?? r.paint.pack; }
  else { r.build[slot] = item!.id; r.hp[slot] = item!.hp; r.paint[slot] = item!.paint; }
  return c;
}

export function repairCost(r: RosterWalker, part: PartSlot): number {
  const ghost = { build: r.build } as Unit;
  return (maxHp(ghost, part) - r.hp[part]) * RULES.repairCost;
}

/** HGR-2. */
export function repair(c0: Campaign, pilot: string, part: PartSlot): Campaign | string {
  const c: Campaign = JSON.parse(JSON.stringify(c0));
  const r = c.roster.find((x) => x.pilot === pilot);
  if (!r) return 'no such walker';
  const cost = repairCost(r, part);
  if (cost <= 0) return 'nothing to repair';
  if (cost > c.credits) return 'not enough credits';
  c.credits -= cost;
  r.hp[part] = maxHp({ build: r.build } as Unit, part);
  return c;
}

export function repairAllCost(r: RosterWalker): number {
  return (['body', 'armL', 'armR', 'legs'] as const).reduce((a, p) => a + repairCost(r, p), 0);
}

/** HGR-3. */
export function repaint(c0: Campaign, pilot: string, slot: PaintSlot): Campaign | string {
  const c: Campaign = JSON.parse(JSON.stringify(c0));
  const r = c.roster.find((x) => x.pilot === pilot);
  if (!r) return 'no such walker';
  if (r.paint[slot] === 'slate') return 'already in company colours';
  if (c.credits < RULES.repaintCost) return 'not enough credits';
  c.credits -= RULES.repaintCost;
  r.paint[slot] = 'slate';
  return c;
}
