# IRON BASIN — rules (spec 10)

**The spec is the product** (KB rule 2). Every rule has an id; the engine implements exactly this; tests are named by id (`tests/coverage.test.ts` fails if an id has no test); every number lives in `src/data/*.json`; every ambiguity is a `RULING:` line at the end. Numbers marked *(tune)* change only with a `sim` or `bench:ai` result (KB rule 30).

**Combat v2** (`15-combat-v2.md`) is landing slice by slice and retires TRN-2, TRN-4, WLK-2 (move part), WLK-5, ATK-1..4, ATK-8 and SUP-1 as it goes. Until a slice lands, this file is what the engine does.

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
- **WLK-2** Move = legs move; evasion = legs evasion + pilot evasion. Weight = the sum of the parts' weights; power = the body's power. Overweight (weight > power): move -1 (minimum 1) and evasion -10.
- **WLK-3** An arm at 0 HP is lost: its hand weapon cannot be used. Legs at 0 HP: move 1 and evasion 0. Body at 0 HP: the walker is destroyed and its pilot ejects (`PIL-1`).
- **WLK-4** Damage to a part already at 0 HP goes to the body instead.
- **WLK-5** A shield in the left hand reduces damage to the body and left arm by the shield's `guard` percentage while the left arm stands.

## 3. Phases and orders
- **TRN-1** A battle runs in rounds; each round is the player's phase, then the hostile phase. Round 1 starts with the player.
- **TRN-2** In its side's phase each walker may **move** once and then **act** once (attack, repair or wait). Acting ends the walker's turn; it cannot move after acting.
- **TRN-3** A move goes to any reachable tile whose path cost is at most the walker's move; walkers block tiles for everyone; a walker may pass through tiles of its own side but not end on them.
- **TRN-4** A walker that has moved but not acted may take its move back (`undoMove`) and return to where it started.
- **TRN-5** `endPhase` ends the side's phase; the other side's walkers are refreshed. The hostile phase ending starts the next round.

## 4. Attacks
- **ATK-1** An attack names an attacker, a weapon slot (left, right or backpack) and a target walker in the weapon's range (Manhattan distance). Direct-fire weapons need line of sight.
- **ATK-2** Each shot rolls to hit separately. Hit chance = weapon accuracy + arm accuracy + pilot skill + 10 if the attacker stands higher − target evasion − 20 for cover (`MAP-5`), clamped to 5..95.
- **ATK-3** A hit lands on one part, drawn from the weapon class's weights (direct: body 40, left arm 20, right arm 20, legs 20; melee: 50/15/15/20; indirect: 50/10/10/30). A part already lost is redrawn as body (`WLK-4`).
- **ATK-4** Damage per hit = the weapon's damage × a random factor 0.9..1.1, rounded; `WLK-5` applies after.
- **ATK-5** Indirect fire (mortar) does not need the attacker's line of sight if an allied walker has line of sight to the target; it ignores cover; each hit also deals the weapon's `splash` to every other walker adjacent to the target, on the body.
- **ATK-6** Ammunition: weapons with `ammo` lose one per attack and cannot attack at 0.
- **ATK-7** Spotter: an allied walker with a sensor pack that has line of sight to the target within its sensor range gives +20 to hit to indirect fire.
- **ATK-8** Counter-fire: when a direct or melee attack ends and the target still stands, the target fires back once if one of its usable hand weapons reaches the attacker (range and line of sight; melee only against an adjacent attacker); it picks the weapon with the highest expected damage. A counter fires at `counterPenalty` less to hit (reaction fire). A counter never draws a counter.
- **ATK-9** Attacking an object (wagon, container, shed, barrier) is allowed with direct fire; every shot hits; the object loses HP and becomes rubble at 0.

## 5. Support
- **SUP-1** Repair: a walker with a repair pack and charges left restores the pack's `heal` HP to one damaged, not lost part of itself or an adjacent ally. Lost parts cannot be repaired in battle.

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
- **HGR-4** The hangar shows each walker's move, evasion, weight against power and its weapons' numbers from `query.*` before and after a change.

## 9. Save
- **SAV-1** The game saves after every accepted action, when a battle starts and on every hangar change, under `localStorage['ib-save']`, as one versioned envelope (screen, campaign, battle setup, seed, action list, state snapshot). The snapshot is what reopens.
- **SAV-2** The title offers Continue naming what it reopens; Discard asks once more; an unreadable save says why and offers to discard; a finished campaign step keeps its save at the hangar.

## Rulings
- RULING: MAP-2 | 4-way movement only | keeps path costs and the grid readable on a phone; the genre's maps are 4-way.
- RULING: ATK-1 | range is Manhattan distance | matches 4-way movement so "in range" reads the same as "steps away".
- RULING: ATK-8 | the counter uses the best expected damage, not the same range class | simpler to read; the attacker can still pick a range the target cannot answer.
- RULING: ATK-8 | counters fire at -15 to hit *(tune)* | without it every attack traded evenly and the outnumbered side always lost (sim, 2026-11-24, `docs/spec/80-sim.md`).
- RULING: ATK-5 | splash hits bodies only and never draws a counter | indirect fire is the answer to dug-in walkers, so it must not be punished by counters.
- RULING: TRN-3 | allies may be passed through | otherwise a 4-walker squad jams on narrow rail lanes.
- RULING: END-2 | round limit 14 *(tune)* | an AI-vs-AI sim finishes a median battle in about 8 rounds (see `docs/spec/80-sim.md`).
