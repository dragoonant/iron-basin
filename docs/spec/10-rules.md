# IRON BASIN — rules (spec 10)

**The spec is the product** (KB rule 2). Every rule has an id; the engine implements exactly this; tests are named by id (`tests/coverage.test.ts` fails if an id has no test); every number lives in `src/data/*.json`; every ambiguity is a `RULING:` line at the end. Numbers marked *(tune)* change only with a `sim` or `bench:ai` result (KB rule 30).

**Combat v2** (`15-combat-v2.md`) lands slice by slice. Slice 5b (2026-11-26) retired TRN-2, TRN-4, WLK-5, ATK-1..4, ATK-8 and SUP-1 and the overweight move penalty in WLK-2; spec 15 says what replaced each. Everything left here is still what the engine does.

## 0. Engine contract
- **ARCH-1** `step(state, action)` is pure and never throws: an illegal action returns the same state and one `rejected` event.
- **ARCH-2** `legalActions(state)` is never empty while the battle runs: `endPhase` is always legal for the side to act.
- **ARCH-3** Every number the client shows comes from `query.*` (hit chance, damage range, move cost, stats, previews).
- **ARCH-4** `view(state, side)` is what a side may see; the hostile AI reads only `view(state, 'hostile')` and is a pure function of it.
- **ARCH-5** Randomness comes only from the sfc32 generator stored in the state; the same seed and actions replay to the same `hash(state)`.
- **ARCH-6** The state is plain JSON (no classes, Maps, Sets or functions); a JSON round trip changes nothing.

## 1. The field
- **MAP-1** The field is a grid of square tiles, `x` east, `y` south. Each tile has a terrain kind and a level (0 or 1).
- **MAP-2** Terrain move costs: concrete, ballast, mud 1; water 2; rubble 2. Climbing up one level costs +1; a two-level step is not allowed. Diagonal moves are not allowed (4-way grid).
- **MAP-3** Objects stand on tiles and block movement: wagon, container, shed, barrier, silo, crane. Silo and crane cannot be destroyed; the others have HP and become rubble at 0.
- **MAP-4** Line of sight runs tile centre to tile centre (Bresenham). Containers, sheds and silos on an intermediate tile block it; wagons, barriers, cranes and rubble do not.
- **MAP-5** Cover: a target has cover from an attacker when the last tile before the target on the line between them holds a wagon, container, barrier, shed or silo.
- **MAP-6** A walker standing in water has its evasion reduced by 10.

## 2. Walkers
- **WLK-1** A walker is built from parts: body, left arm, right arm, legs, backpack, plus a hand weapon (or nothing) in each arm. Each body, arm and legs part has its own HP.
- **WLK-2** Move = legs move; evasion = legs evasion + pilot evasion. Weight = the sum of the parts' weights; power = the body's power. Overweight (weight > power): evasion -10 (and drive -1, spec 15 DRV-7).
- **WLK-3** An arm at 0 HP is lost: its hand weapon cannot be used. Legs at 0 HP: move 1 and evasion 0. Body at 0 HP: the walker is destroyed and its pilot ejects (`PIL-1`).
- **WLK-4** Damage to a part already at 0 HP goes to the body instead.

## 3. Phases and orders
- **TRN-1** A battle runs in rounds; each round is the player's phase, then the hostile phase. Round 1 starts with the player.
- **TRN-3** A move goes to any reachable tile whose path cost is at most the walker's move; walkers block tiles for everyone; a walker may pass through tiles of its own side but not end on them.
- **TRN-5** `endPhase` ends the side's phase; the other side's walkers are refreshed. The hostile phase ending starts the next round.

## 4. Attacks
An attack is a fire order (spec 15 MOD-1); its chance, hit location and damage are spec 15 HIT-1..4 and FAC-3..5. These rules still hold:
- **ATK-5** Indirect fire (mortar) does not need the attacker's line of sight if an allied walker has line of sight to the target; it ignores cover; each hit also deals the weapon's `splash` to every other walker adjacent to the target, on the body.
- **ATK-6** Ammunition: weapons with `ammo` lose one per attack and cannot attack at 0.
- **ATK-7** Spotter: an allied walker with a sensor pack that has line of sight to the target within its sensor range gives +20 to hit to indirect fire.
- **ATK-9** Attacking an object (wagon, container, shed, barrier) is a fire order at its tile with a direct or melee mode in range; every shot of the mode hits; the object loses HP and becomes rubble at 0.

## 5. Support
Repair is the Patch order (spec 15 MAN-10).

## 6. Pilots
- **PIL-1** A pilot whose walker is destroyed ejects and survives (mission 1 has no permadeath, PLAN Q7).
- **PIL-2** Pilot skill adds to every hit chance; pilot evasion adds to the walker's evasion.

## 7. Winning and losing
- **END-1** The player wins when every hostile walker is destroyed.
- **END-2** The player loses when every player walker is destroyed, or when round `roundLimit` ends with hostile walkers standing.
- **END-3** The result lists rounds taken, walkers lost on each side and the salvage (`SAL-1`).

## 8. Salvage, credits and the hangar
- **SAL-1** Each destroyed hostile walker yields its arms, legs and backpack that still had HP when it fell, its hand weapons in arms that stood, and `bounty` credits. Winning pays the contract fee, plus the speed bonus when the battle ended by round `bonusRound`.
- **HGR-1** Between battles the player may move parts and weapons between walkers and the inventory. A walker must keep a body, two arms and legs; weapons need an arm to sit in.
- **HGR-2** Repairing a part costs `repairCost` credits per HP; a lost part can be repaired from 0.
- **HGR-3** Repainting a salvaged part in company colours costs `repaintCost` credits and changes nothing but its paint.
- **HGR-4** The hangar shows each walker's drive, move, evasion, weight against power, its weapons' modes and the maneuvers its parts give, from `query.*`, before and after a change (a swap lists the moves it gains and loses).

## 9. Save
- **SAV-1** The game saves after every accepted action, when a battle starts and on every hangar change, under `localStorage['ib-save']`, as one versioned envelope (screen, campaign, battle setup, seed, action list, state snapshot). The snapshot is what reopens.
- **SAV-2** The title offers Continue naming what it reopens; Discard asks once more; an unreadable save says why and offers to discard; a finished campaign step keeps its save at the hangar.

## Rulings
- RULING: MAP-2 | 4-way movement only | keeps path costs and the grid readable on a phone; the genre's maps are 4-way.
- RULING: MOD-1 | range is Manhattan distance | matches 4-way movement so "in range" reads the same as "steps away".
- RULING: ATK-5 | splash hits bodies only and never draws a counter | indirect fire is the answer to dug-in walkers, so it must not be punished by counters.
- RULING: TRN-3 | allies may be passed through | otherwise a 4-walker squad jams on narrow rail lanes.
- RULING: END-2 | round limit 14 *(tune)* | an AI-vs-AI sim finishes a median battle in about 8 rounds (see `docs/spec/80-sim.md`).
