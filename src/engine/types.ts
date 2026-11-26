// Plain-JSON state (ARCH-6): only objects, arrays, strings, numbers, booleans and null.
export type Side = 'player' | 'hostile';
export type Terrain = 'concrete' | 'ballast' | 'mud' | 'water' | 'rubble';
export type ObjKind = 'wagon' | 'container' | 'shed' | 'barrier' | 'silo' | 'crane';
export type PartSlot = 'body' | 'armL' | 'armR' | 'legs';
/** Where a hit can land: a part, or the backpack from the rear (FAC-3). */
export type HitSlot = PartSlot | 'pack';
export type PaintSlot = PartSlot | 'pack';
export type WeaponSlot = 'L' | 'R' | 'P';
export type Paint = 'slate' | 'camo';
export type WeaponClass = 'direct' | 'melee' | 'indirect' | 'shield';
export type Facing = 'N' | 'E' | 'S' | 'W';
export type Arc = 'front' | 'left' | 'right' | 'rear';

export interface Build {
  body: string;
  armL: string;
  armR: string;
  legs: string;
  pack: string;
  wL: string | null;
  wR: string | null;
}

export interface Tile {
  t: Terrain;
  h: number;
  obj: ObjKind | null;
  objHp: number;
}

export interface Pos { x: number; y: number }

/** Statuses carried by a walker (spec 15). "Pending" ones bite at the start of the walker's next phase (DRV-1). */
export interface Status {
  /** MOD-6: pinned, pending; becomes `suppressed` for the next phase. */
  pinned: boolean;
  /** MOD-6: pinned this phase: -pinnedHit to hit. */
  suppressed: boolean;
  /** MOD-7: staggered, pending. */
  staggered: boolean;
  /** FLD-1: pushed into water, pending. */
  mired: boolean;
  /** FLD-2: knocked down until its next phase starts. */
  down: boolean;
  /** FAC-4: the backpack is out for the battle. */
  packOut: boolean;
}

/** RCT-3: a lane set by Cover lane. */
export interface Overwatch { slot: WeaponSlot; dir: Facing }

/** DRV-8: the last walk, kept while it can still be undone or count as a charge (MOD-5). */
export interface LastWalk { from: Pos; facing: Facing; dp: number; dir: Facing | null; steps: number; reacted: boolean; wasWalked: boolean }

export interface Unit {
  id: string;
  pilot: string;
  side: Side;
  role: string;
  x: number;
  y: number;
  facing: Facing;
  build: Build;
  paint: Record<PaintSlot, Paint>;
  hp: Record<PartSlot, number>;
  /** Ammunition left for the backpack weapon (ATK-6); null when it has none. */
  ammo: number | null;
  /** Repair charges left (MAN-10). */
  charges: number;
  /** DRV-1: drive left this phase. */
  drive: number;
  /** DRV-6: drive banked for reactions in the enemy phase. */
  reserve: number;
  /** DRV-5: stood down for this phase. */
  done: boolean;
  /** DRV-4: weapon slots that gave an order this phase. */
  fired: WeaponSlot[];
  /** MOD-5: walked this phase (Braced shot needs a walker that stood still). */
  walked: boolean;
  lastWalk: LastWalk | null;
  /** RCT-6. */
  holdFire: boolean;
  /** NRV-1: 0..max. Static until slice 5e; Steady and Shaken already count (HIT-2). */
  nerve: number;
  status: Status;
  overwatch: Overwatch | null;
  /** RCT-4: allies this walker guards until its next phase. */
  guarding: string[];
  alive: boolean;
}

export interface SalvageItem {
  kind: 'arm' | 'legs' | 'pack' | 'weapon';
  id: string;
  hp: number;
  paint: Paint;
  from: string;
}

export interface Result {
  winner: Side;
  reason: 'annihilated' | 'wiped' | 'timeout';
  rounds: number;
  lost: Record<Side, number>;
  salvage: SalvageItem[];
  credits: { fee: number; bonus: number; bounty: number };
}

/** FLD-6: a smoke tile and the side that laid it. */
export interface Smoke { x: number; y: number; side: Side }

export interface BattleState {
  v: 2;
  mission: string;
  seed: number;
  w: number;
  h: number;
  tiles: Tile[];
  units: Unit[];
  smoke: Smoke[];
  round: number;
  phase: Side;
  rng: [number, number, number, number];
  salvage: SalvageItem[];
  result: Result | null;
  turnCount: number;
}

export type Action =
  | { type: 'walk'; unit: string; x: number; y: number; facing: Facing }
  | { type: 'undoWalk'; unit: string }
  | { type: 'pivot'; unit: string; facing: Facing }
  /** MOD-1 at a walker: an enemy, or an adjacent ally for Guard. `part` for modes that call one (MOD-4). */
  | { type: 'fire'; unit: string; slot: WeaponSlot; mode: string; target: string; part?: HitSlot }
  /** MOD-1 at a tile: Smoke, Cover lane, or a breakable object (ATK-9). */
  | { type: 'fireAt'; unit: string; slot: WeaponSlot; mode: string; x: number; y: number }
  | { type: 'patch'; unit: string; target: string; part: PartSlot }
  | { type: 'standDown'; unit: string }
  | { type: 'holdFire'; unit: string; on: boolean }
  | { type: 'endPhase' };

export interface ShotEvent {
  hit: boolean;
  part: HitSlot | null;
  dmg: number;
  partLost: boolean;
  /** RCT-4: the walker the hit landed on, when a guard took it. */
  on?: string;
}

export type Reaction = 'return' | 'overwatch';

export type GameEvent =
  | { type: 'rejected'; reason: string }
  | { type: 'walked'; unit: string; path: Pos[]; facing: Facing }
  | { type: 'undo'; unit: string; x: number; y: number; facing: Facing }
  | { type: 'pivot'; unit: string; facing: Facing }
  | { type: 'attack'; unit: string; slot: WeaponSlot; weapon: string; mode: string; target: string; counter: boolean; reaction: Reaction | null; arc: Arc; chance: number; shots: ShotEvent[] }
  | { type: 'splash'; unit: string; target: string; dmg: number; partLost: boolean }
  | { type: 'cookOff'; unit: string; dmg: number; splash: { target: string; dmg: number }[] }
  | { type: 'pushed'; unit: string; by: string; x: number; y: number; result: 'moved' | 'fell' | 'water' | 'collide'; dmg: number; other: string | null; obj: { x: number; y: number; dmg: number; broken: boolean } | null }
  | { type: 'status'; unit: string; status: 'pinned' | 'staggered' | 'down' | 'packOut' }
  | { type: 'smoke'; unit: string; x: number; y: number; tiles: Pos[] }
  | { type: 'smokeClear'; side: Side }
  | { type: 'guard'; unit: string; target: string }
  | { type: 'overwatch'; unit: string; slot: WeaponSlot; dir: Facing }
  | { type: 'objectHit'; unit: string; slot: WeaponSlot; weapon: string; mode: string; x: number; y: number; dmg: number; broken: boolean }
  | { type: 'destroyed'; unit: string; by: string }
  | { type: 'repaired'; unit: string; target: string; part: PartSlot; amount: number }
  | { type: 'standDown'; unit: string; reserve: number }
  | { type: 'holdFire'; unit: string; on: boolean }
  | { type: 'phase'; side: Side; round: number }
  | { type: 'end'; result: Result };

export interface StepResult {
  state: BattleState;
  events: GameEvent[];
}
