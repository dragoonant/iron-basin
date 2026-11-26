import partsJson from '../data/parts.json';
import pilotsJson from '../data/pilots.json';
import rulesJson from '../data/rules.json';
import missionJson from '../data/mission-01.json';
import type { Build, Facing, ObjKind, Side, Terrain, WeaponClass } from './types';

export interface BodyDef { name: string; hp: number; power: number; weight: number; kit: string; size: string; drive: number; maneuvers: string[] }
export interface ArmDef { name: string; hp: number; acc: number; weight: number; kit: string; size: string; maneuvers: string[] }
export interface LegsDef { name: string; hp: number; move: number; evade: number; weight: number; kit: string; size: string; maneuvers: string[] }
export interface PackDef { name: string; weight: number; kind: 'none' | 'weapon' | 'sensor' | 'repair'; weapon?: string; sensorRange?: number; charges?: number; heal?: number; cookOff?: boolean; maneuvers: string[] }
export interface WeaponDef { name: string; class: WeaponClass; min: number; max: number; shots: number; dmg: number; acc: number; weight: number; ammo?: number; splash?: number; guard?: number; sfx?: string; modes: ModeDef[] }
/** A fire mode of a weapon (spec 15 MOD). Numbers left out default to the weapon's own. */
export interface ModeDef {
  id: string; name: string; dp: number; shots: number;
  acc?: number; dmg?: number; baseAcc?: number; baseDmg?: number;
  class?: WeaponClass; min?: number; max?: number;
  call?: boolean; ignoreCover?: boolean;
  needs?: 'still' | 'charge' | 'marked';
  effect?: 'pin' | 'push' | 'knockdown' | 'stagger' | 'overwatch' | 'guard' | 'smoke';
  target?: 'tile' | 'ally';
}
export type ManeuverKind = 'self' | 'walk' | 'trait' | 'attack' | 'stance' | 'support' | 'field' | 'signature';
/** A maneuver granted by a part, the universal list or a pilot (spec 15 MAN, NRV-5). */
export interface ManeuverDef {
  name: string; dp: number; kind: ManeuverKind; nerve?: number;
  class?: WeaponClass; min?: number; max?: number; baseAcc?: number; baseDmg?: number;
  call?: 'body' | 'armL' | 'armR' | 'legs'; effect?: 'push' | 'grab';
  needs?: 'emptyHand' | 'emptyHand+rubble' | 'grabbed' | 'arm';
  moveBonus?: number; evade?: number; gain?: number; strain?: number; range?: number; nerveGift?: number;
}
export interface PilotDef { name: string; call: string; skill: number; evade: number; side: Side; nerve: number; signature: string | null }
export interface ObjDef { hp: number; blocksSight: boolean; cover: boolean; breakable: boolean }
export interface MissionUnit { id: string; pilot: string; side: Side; x: number; y: number; facing: Facing; role?: string; build: Build }
export interface MissionDef {
  id: string;
  name: string;
  brief: string;
  roundLimit: number;
  bonusRound: number;
  fee: number;
  bonus: number;
  bounty: number;
  legend: Record<string, [Terrain, number] | [Terrain, number, ObjKind]>;
  map: string[];
  rails: { x: number; axis: 'ns' }[];
  stacks: [number, number][];
  units: MissionUnit[];
}
export interface RulesDef {
  terrainCost: Record<Terrain, number>;
  climbCost: number;
  waterEvade: number;
  coverPenalty: number;
  heightBonus: number;
  hitMin: number;
  hitMax: number;
  overweightMove: number;
  overweightEvade: number;
  spotterBonus: number;
  counterPenalty: number;
  dmgSpread: [number, number];
  hitWeights: Record<'direct' | 'melee' | 'indirect', Record<'body' | 'armL' | 'armR' | 'legs', number>> & {
    rear: Record<'body' | 'armL' | 'armR' | 'legs' | 'pack', number>;
  };
  drive: { reserveCap: number; signatureReserveCap: number; startReserve: number; walk: number; overweight: number; pinned: number; staggered: number; mired: number; knockedDown: number };
  facing: { sideHit: number; rearHit: number; sideArmFactor: number };
  pinnedHit: number;
  markBonus: number;
  grabEvade: number;
  push: { collide: number; fallLegs: number };
  wagon: { roll: number; dmg: number; collide: number };
  stack: { toppleAt: number; dmg: number; reach: number };
  smokeRadius: number;
  cookOff: { self: number; adjacent: number };
  nerve: { max: number; steady: number; shaken: number; steadyHit: number; shakenHit: number; landHit: number; kill: number; together: number; hitSide: number; hitRear: number; pinned: number; knockedDown: number; allyLost: number };
  objects: Record<ObjKind, ObjDef>;
  repairCost: number;
  repaintCost: number;
}

export const PARTS = partsJson as unknown as {
  bodies: Record<string, BodyDef>;
  arms: Record<string, ArmDef>;
  legs: Record<string, LegsDef>;
  packs: Record<string, PackDef>;
  weapons: Record<string, WeaponDef>;
  universal: string[];
  maneuvers: Record<string, ManeuverDef>;
};
export const PILOTS = pilotsJson as Record<string, PilotDef>;
export const RULES = rulesJson as unknown as RulesDef;
export const MISSIONS: Record<string, MissionDef> = { [missionJson.id]: missionJson as unknown as MissionDef };

export const body = (id: string): BodyDef => PARTS.bodies[id] ?? PARTS.bodies['body-lantern-m']!;
export const arm = (id: string): ArmDef => PARTS.arms[id] ?? PARTS.arms['arm-lantern-m']!;
export const legs = (id: string): LegsDef => PARTS.legs[id] ?? PARTS.legs['legs-lantern-m']!;
export const pack = (id: string): PackDef => PARTS.packs[id] ?? PARTS.packs['pack-none']!;
export const weapon = (id: string | null): WeaponDef | null => (id ? PARTS.weapons[id] ?? null : null);
export const pilot = (id: string): PilotDef => PILOTS[id] ?? { name: id, call: id, skill: 0, evade: 0, side: 'hostile', nerve: 6, signature: null };
export const maneuver = (id: string): ManeuverDef | null => PARTS.maneuvers[id] ?? null;
