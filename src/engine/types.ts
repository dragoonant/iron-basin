// Plain-JSON state (ARCH-6): only objects, arrays, strings, numbers, booleans and null.
export type Side = 'player' | 'hostile';
export type Terrain = 'concrete' | 'ballast' | 'mud' | 'water' | 'rubble' | 'deep' | 'deck';
export type ObjKind = 'wagon' | 'container' | 'shed' | 'barrier' | 'silo' | 'crane' | 'gate' | 'lamp' | 'winch';
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
  /** FLD-7: a rail line runs through this tile (FLD-3). */
  rail?: 'ns';
  /** FLD-7: this container is part of a stack that can topple (FLD-5). */
  stack?: boolean;
  /** LCK-2: a swing-bridge tile (deck when closed, deep water when open). */
  bridge?: boolean;
  /** LCK-5: floods when a lock gate breaks. */
  flood?: boolean;
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
  /** MAN-5: braced until its next phase. */
  braced: boolean;
  /** MAN-5: planted until its next phase. */
  planted: boolean;
  /** MAN-9: marked by this side until that side's next phase. */
  markedBy: Side | null;
  /** MAN-6: held by this walker. */
  grabbedBy: string | null;
}

/** RCT-3: a lane set by Cover lane. */
export interface Overwatch { slot: WeaponSlot; dir: Facing }

/** DRV-8: the last walk, kept while it can still be undone or count as a charge (MOD-5). */
export interface LastWalk { from: Pos; facing: Facing; dp: number; nerve: number; dir: Facing | null; steps: number; reacted: boolean; wasWalked: boolean; sig?: boolean }

/** MAN-6: what a grabbing walker holds, and with which arm. */
export interface Grip { target: string; arm: 'L' | 'R' }

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
  /** MAN-6. */
  grip: Grip | null;
  /** FOG-5: this walker fired and is seen by that side until that side's phase next ends. */
  flash: Side | null;
  /** MAN-8: maneuvers used this phase that are limited to one a phase. */
  usedThisPhase: string[];
  /** NRV-5: the pilot's signature has been used this battle. */
  sigUsed: boolean;
  /** PLV-4: the second signature (level 2 and up) has been used this battle. */
  sig2Used: boolean;
  /** PLV-2: the pilot's level for this battle (1 when the campaign has none). */
  level: number;
  /** PLV-1: walkers this walker destroyed this battle. */
  kills: number;
  /** NRV-5 (Call the line): reserve added on top when this walker stands down this phase. */
  bonusReserve: number;
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
  credits: { fee: number; bonus: number; bounty: number; gate?: number };
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
  /** LCK-4: a lock gate has broken and the basin has emptied (once a battle). */
  flooded?: boolean;
  /** FOG: a night mission: short sight and fog of war. */
  night?: boolean;
  /** FOG-6: lit tiles under a flare, and the side that fired it. */
  flares?: Smoke[];
  /** FOG-7: where each side last saw each enemy walker. */
  intel?: Record<Side, Record<string, Pos>>;
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
  /** MAN-1: a part, universal or signature maneuver. `slot` names the arm for arm maneuvers; `target` a walker; x, y a tile. */
  | { type: 'maneuver'; unit: string; id: string; slot?: WeaponSlot; target?: string; x?: number; y?: number; facing?: Facing; part?: PartSlot }
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
  /** `weapon` is a weapon id, or `m:<maneuver>` for an attack maneuver (Kick, Ram jab, Grab, Throw); `slot` is null for Kick. */
  | { type: 'attack'; unit: string; slot: WeaponSlot | null; weapon: string; mode: string; target: string; counter: boolean; reaction: Reaction | null; arc: Arc; chance: number; shots: ShotEvent[] }
  | { type: 'splash'; unit: string; target: string; dmg: number; partLost: boolean }
  | { type: 'cookOff'; unit: string; dmg: number; splash: { target: string; dmg: number }[] }
  | { type: 'pushed'; unit: string; by: string; x: number; y: number; result: 'moved' | 'fell' | 'water' | 'collide'; dmg: number; other: string | null; obj: { x: number; y: number; dmg: number; broken: boolean } | null }
  | { type: 'status'; unit: string; status: 'pinned' | 'staggered' | 'down' | 'packOut' | 'braced' | 'planted' | 'marked' | 'grabbed' | 'released' }
  | { type: 'overdrive'; unit: string; gain: number; strain: number }
  /** NRV-2: a pilot's nerve moved. */
  | { type: 'nerve'; unit: string; delta: number; now: number; why: 'hit' | 'kill' | 'together' | 'hitSide' | 'hitRear' | 'pinned' | 'down' | 'allyLost' | 'gift' }
  /** NRV-5. */
  | { type: 'signature'; unit: string; id: string; targets: string[] }
  | { type: 'tow'; unit: string; ally: string; x: number; y: number; ax: number; ay: number }
  /** FLD-3: the rake of coupled wagons that rolled, lead first. */
  | { type: 'wagon'; unit: string; cars: { from: Pos; to: Pos; hp: number; broken: boolean }[]; hit: string | null; obj: Pos | null }
  /** FOG-6. */
  | { type: 'flare'; unit: string; x: number; y: number; tiles: Pos[] }
  | { type: 'flareOut'; side: Side }
  /** FOG-8: a walk or tow ran into an enemy the side could not see. */
  | { type: 'ambush'; unit: string; enemy: string; x: number; y: number }
  /** LCK-4, LCK-5: a gate broke; the flood tiles are water now and these walkers are mired. */
  | { type: 'flood'; x: number; y: number; tiles: Pos[]; mired: string[] }
  /** LCK-2: the swing bridge opened or closed. */
  | { type: 'bridge'; unit: string; open: boolean; tiles: Pos[] }
  | { type: 'toppled'; x: number; y: number; dir: Facing; hits: { x: number; y: number; unit: string | null; dmg: number }[] }
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
