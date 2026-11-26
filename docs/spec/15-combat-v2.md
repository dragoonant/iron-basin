# IRON BASIN — combat v2 rules (spec 15)

**The spec is the product** (KB rule 2). This is the exact rule set behind `docs/combat-v2.md` (PLAN D11-D14). Every rule has an id; its numbers live in `src/data/*.json` (named in `code` below); every ambiguity is a `RULING:` at the end.

**How it lands.** The engine still runs spec 10 until slice 5b. Each id here has a test named by it in `tests/v2.test.ts`, pending (`it.todo`) until its slice lands, then real (`tests/coverage.test.ts` checks both files). When a slice lands, the spec 10 ids it supersedes (table below) are deleted from spec 10 in the same commit. Ids marked *(tune)* change only with a `sim` or `bench:ai` result in `80-sim.md` (KB rule 30).

| Slice | Ids | State |
|---|---|---|
| 5b core loop | DRV-1..9, HIT-1..4, MOD-1..9, FAC-1..6, RCT-1..7, FLD-1, FLD-2, FLD-6, FLD-8, MAN-10 | landed 2026-11-26 |
| 5c maneuvers and field | MAN-1..9, MAN-11, MAN-12, FLD-3..5, FLD-7 | next |
| 5e nerve | NRV-1..7 (the Steady and Shaken bands of HIT-2 already count; nerve does not change yet) | |

Reactions moved from 5d into 5b: once drive exists, the automatic counter has to become reserve-paid return fire, and the modes need push, knockdown, smoke, guard and overwatch to mean anything.

| Spec 10 id | Superseded by |
|---|---|
| TRN-2 (move once, act once) | DRV-1..5 |
| TRN-4 (undo the move) | DRV-8 |
| WLK-2, overweight move -1 | DRV-7 |
| WLK-5 (shield) | FAC-5 |
| ATK-1 (an attack) | MOD-1 |
| ATK-2 (hit chance) | HIT-1, HIT-2 |
| ATK-3 (hit location) | HIT-3, FAC-3 |
| ATK-4 (damage) | HIT-4 |
| ATK-8 (counter-fire) | RCT-2 |
| SUP-1 (repair) | MAN-10 |

Everything else in spec 10 (the field, line of sight, cover, part loss, phases, indirect fire, ammo, spotting, objects, winning, salvage, the hangar, save) stands.

## 1. Drive (DRV)
- **DRV-1** When a side's phase starts, each of its standing walkers gets **drive** = its body's `drive` (`parts.json` bodies) minus the penalties it carries into this phase: overweight `drive.overweight`, pinned `drive.pinned`, staggered `drive.staggered`, mired `drive.mired`, knocked down `drive.knockedDown`; minimum 0. Pinned, staggered and mired are then cleared; knocked down is cleared (the walker gets up).
- **DRV-2** In its side's phase a walker gives **orders** in any order, each paying its DP cost from drive. An order that costs more than the drive left is illegal. Orders of different walkers may be interleaved.
- **DRV-3** **Walk** costs `drive.walk` (1 DP): a path of total cost at most the walker's move (TRN-3, MAP-2), ending with a facing the order names (FAC-1). A walker may walk more than once a phase. A grabbed walker cannot walk (MAN-6).
- **DRV-4** **Fire** (MOD) costs its mode's `dp`. Each weapon slot (L, R, P) gives at most one order per phase, whether or not it shoots (Cover lane, Guard and Smoke count). An arm maneuver (Ram jab, Grab, Throw) uses that arm's slot too.
- **DRV-5** **Stand down** ends the walker's orders for the phase. A walker with 0 drive left is stood down automatically.
- **DRV-6** **Reserve.** When a walker stands down, or its side's phase ends, its reserve becomes the drive it has left, capped at `drive.reserveCap`. Reserve pays for reactions (RCT) in the enemy phase. When the walker's own phase starts, its reserve goes to 0 before DRV-1. Every walker starts the battle with `drive.startReserve`.
- **DRV-7** Overweight (WLK-2) no longer reduces move; it costs `drive.overweight` (DRV-1). The overweight evasion penalty stays.
- **DRV-8** **Undo** takes back a walker's last walk, refunding its DP and its facing, while all of these hold: it is still the same phase; the walker has given no order since; the walk drew no reaction (RCT-3); the tile it left is free.
- **DRV-9** `legalActions` lists every walk, fire, maneuver, undo and stand down the walker can afford, plus `endPhase` (ARCH-2). Hold fire (RCT-6) is a switch, not an order, and is not listed.

## 2. To hit and damage (HIT)
- **HIT-1** A roll's chance = base accuracy + arm accuracy + pilot skill + modifiers, clamped to `hitMin`..`hitMax`. Base accuracy is the weapon's `acc` plus the mode's `acc`, or the mode or maneuver's `baseAcc` when it has one. Arm accuracy is that of the arm holding the weapon, or of the arm that makes the maneuver; pack weapons use none.
- **HIT-2** Modifiers: +`heightBonus` from higher ground; +`facing.sideHit` from the target's side arc, +`facing.rearHit` from its rear arc (FAC-2; not for indirect fire); +`markBonus` if the target is marked by the attacker's side (MAN-9); +`spotterBonus` for spotted indirect fire (ATK-7); +`nerve.steadyHit` if the attacker's pilot is Steady, −`nerve.shakenHit` if Shaken (NRV-3); −`pinnedHit` if the attacker is pinned this phase; −`coverPenalty` if the target has cover (MAP-5, FLD-6, MAN-5), unless the mode ignores cover or the fire is indirect; − the target's evasion. Evasion is legs evasion + pilot evasion − `waterEvade` in water − `overweightEvade` if overweight − `grabEvade` while grabbed or grabbing − the Brace `evade` while braced; a knocked-down walker has evasion 0.
- **HIT-3** A hit lands on a part drawn from the class weights (`hitWeights.direct`, `melee`, `indirect`), changed by the arc (FAC-3). A mode with `call` lands every hit on the part the order names; a maneuver with a fixed `call` (Kick: legs) lands there. A lost part is redrawn as the body (WLK-4).
- **HIT-4** Damage per hit = (the mode's `baseDmg`, or the weapon's `dmg` × the mode's `dmg`, default 1) × a factor in `dmgSpread`, rounded; then the shield (FAC-5).

## 3. Fire modes (MOD)
- **MOD-1** A fire order names the walker, a slot, a mode of the weapon in that slot, and a target: a walker in the mode's range (the mode's `min`/`max`, or the weapon's), a tile for modes with `target: "tile"`, or an adjacent ally for `target: "ally"`. Direct and melee fire need line of sight; indirect fire follows ATK-5. The weapon must be usable (arm standing, ammo left).
- **MOD-2** A mode fires `shots` rolls; each rolls and lands separately (HIT-1..4). A mode with `shots: 0` rolls nothing and only applies its effect.
- **MOD-3** Ammunition (ATK-6) is per weapon: every mode of a weapon with `ammo` spends one round, Smoke included.
- **MOD-4** `call: true` (Aimed pair, Braced shot): the order names the part: body, armL, armR or legs; pack only from the target's rear arc.
- **MOD-5** `needs: "still"` (Braced shot): only if the walker has not walked this phase. `needs: "charge"` (Drive-through): only if the walker's last order this phase was a walk whose every step went the same way, at least 2 steps, and the target stands on the next tile in that direction. `needs: "marked"` (Tagged salvo): only against a marked target.
- **MOD-6** `effect: "pin"` (Suppress): if at least one shot hits, the target is **pinned**: in its next phase it has `drive.pinned` less drive (DRV-1) and −`pinnedHit` to hit; and NRV-2 applies once.
- **MOD-7** `effect: "push"` (Shove), `"knockdown"` (Drive-through), `"stagger"` (Bash): if at least one shot hits, the target is pushed (FLD-1), knocked down (FLD-2), or staggered (`drive.staggered` less drive in its next phase). Braced targets ignore push and knockdown; the damage still lands.
- **MOD-8** `effect: "overwatch"` (Cover lane) and `effect: "guard"` (Guard) set reactions (RCT-3, RCT-4). `effect: "smoke"` lays smoke (FLD-6); it needs no roll and lands on the chosen tile.
- **MOD-9** Splash (ATK-5) stays with High explosive only.

## 4. Facing (FAC)
- **FAC-1** A walker faces N, E, S or W. Mission data gives the start facing. A walk ends facing the way the order names; **Pivot** (`maneuvers.pivot`, 1 DP) turns it in place. Pushes, falls, tows and rolling wagons do not change facing.
- **FAC-2** **Arc** of an attacker seen from a target: let *a* be how far the attacker is along the target's facing and *c* how far across it (absolute). **Front** when a > c; **rear** when −a > c; otherwise **side**: the right side if the attacker lies clockwise of the facing (N→E, E→S, S→W, W→N), else the left.
- **FAC-3** Side hits double (`facing.sideArmFactor`) the weight of the arm on that side. Rear hits, hits on a knocked-down walker and all indirect fire draw from `hitWeights.rear`, where the backpack can be hit. A walker with `pack-none`, or whose pack is already out, redraws a pack hit as body.
- **FAC-4** A pack hit's damage goes to the body. Then, if the pack has `cookOff` and ammo left, it **cooks off**: `cookOff.self` more to the body, `cookOff.adjacent` to the body of every walker next to it, and its ammo goes to 0. Any other pack is **out** for the battle (no Mark, Patch, Tow, Spotting).
- **FAC-5** A shield in the left hand cuts damage by its `guard` percentage to the body and left arm, only against direct and melee fire from the front arc or the left side, while the left arm stands. Indirect fire, splash, pushes, falls, cook-offs and hits on the backpack are never cut.
- **FAC-6** The arc to-hit bonus does not apply to indirect fire, which already uses the rear weights.

## 5. Maneuvers (MAN)
- **MAN-1** A walker may use the maneuvers its parts list (`maneuvers` on its body, standing arms, legs and pack, by `parts.json` id), the `universal` list, and its pilot's signature (NRV-5). A maneuver costs its `dp` and, if it has `nerve`, that much nerve (NRV-4). A lost arm's maneuvers are gone; a pack that is out has none.
- **MAN-2** **Dash** (L legs): a walk (DRV-3) with move + `moveBonus`.
- **MAN-3** **Hop** (L legs, a trait, no order): climbing costs no `climbCost`, and a fall (FLD-1) does no damage and does not knock down.
- **MAN-4** **Kick** (M legs) and **Ram jab** (WEDGE arms): melee rolls against an adjacent walker with the maneuver's `baseAcc`/`baseDmg`; a hit pushes (FLD-1). Kick lands on the legs. Ram jab uses the arm's slot (DRV-4).
- **MAN-5** **Brace** (M and H legs): until the walker's next phase it cannot be pushed or knocked down and its evasion is lower by `evade`. **Plant** (H legs): until the walker's next phase it counts as a cover object for MAP-5, for anyone. Walking ends both.
- **MAN-6** **Grab** (universal, needs an arm with no weapon, standing): a melee roll at `baseAcc`, no damage. On a hit the target is **grabbed** by the walker until the grabber's next phase starts, or the grabber walks, is pushed, loses that arm or falls, or the target is pushed or Breaks free (`breakFree`, 2 DP). A grabbed walker cannot walk. Both lose `grabEvade` evasion.
- **MAN-7** **Throw** (universal, needs an arm with no weapon, standing, next to a rubble tile): a direct roll at `baseAcc`/`baseDmg`, range `min`..`max`. The rubble stays.
- **MAN-8** **Overdrive** (every body): +`gain` drive now; costs `nerve`; does `strain` damage to the body; once a phase; illegal if the body has `strain` HP or less.
- **MAN-9** **Mark** (sensor mast): a walker in `sensorRange` and in the walker's own line of sight is **marked** until the marker's side's next phase starts.
- **MAN-10** **Patch** (repair crane): SUP-1 as an order: one charge restores the pack's `heal` to a damaged, not lost part of the walker or an adjacent ally.
- **MAN-11** **Tow** (repair crane): the walker steps one tile straight away from an adjacent ally and the ally moves into the tile it left. Both tiles must allow the move (no object, no walker, at most one level up). A knocked-down ally stays down.
- **MAN-12** **Shunt wagon** (universal): see FLD-3.

## 6. Reactions (RCT)
- **RCT-1** Reactions happen in the enemy phase, cost reserve (DRV-6), and never draw reactions of their own.
- **RCT-2** **Return fire**: when a direct or melee roll (a fire mode or an attack maneuver) against a walker ends and the walker stands, it fires back once if all hold: it has reserve 1 or more; the attacker is in its front arc; it is not knocked down, not Shaken, not on hold fire; one of its usable hand weapons other than a shield reaches the attacker (range, line of sight; melee only adjacent). It uses that weapon's cheapest firing mode (lowest `dp` with `shots` > 0, first listed on a tie), picking the weapon with the higher expected damage; it fires at −`counterPenalty`; it costs 1 reserve. A multi-shot attack draws one return fire, after its last shot.
- **RCT-3** **Overwatch** (Cover lane): the lane is the straight line of tiles from the walker in the direction of the chosen tile, out to the weapon's `max`. The walker turns to face it. Until its next phase, the first time an enemy **walk** enters a lane tile that the walker can see and that is in range, the walker fires that weapon's cheapest mode at that tile for 1 reserve, before the walk goes on. A hit on the legs, a knockdown or a push ends the walk on that tile, facing the way of its last step. Overwatch fires once; it does not fire with reserve 0 or while Shaken. The lane runs from wherever the overwatcher stands, and only tiles in its front arc count. A walk is not fired on in a tile that holds another walker (it is passing through an ally).
- **RCT-4** **Guard** (shield): set on an adjacent ally. Until the guard's next phase, rolls at that ally from the guard's front arc, of direct or melee fire, roll against the ally as usual but every hit lands on the guard's left arm, and FAC-5 applies to it. Guard ends if the two are no longer adjacent or the guard's left arm is lost.
- **RCT-5** Brace, Plant and Guard cost nothing more after the order.
- **RCT-6** **Hold fire** is a per-walker switch, off by default and changeable at no cost in the walker's own phase; it turns off RCT-2 only.
- **RCT-7** Several overwatchers triggered by the same tile fire nearest first, then by unit id.

## 7. The field (FLD)
- **FLD-1** **Push**: the walker moves one tile straight away from the pusher (the direction from the pusher's tile to the walker's). By destination:
  - free, the same level: it moves;
  - free, one level lower: it moves, **falls** (`push.fallLegs` to the legs) and is knocked down;
  - water: it moves and is **mired** (`drive.mired` less drive in its next phase);
  - off the map, an object, a walker, or one level higher: **collision**: `push.collide` to the body of the pushed walker and of any walker it hits, and to an object's HP if it is breakable (FLD-5 then checks a topple). Nobody moves.
- **FLD-2** **Knocked down**: evasion 0 (HIT-2), hits use the rear weights (FAC-3), no reactions; getting up costs `drive.knockedDown` in its next phase (DRV-1). A walker already down is not knocked down again.
- **FLD-3** **Shunt wagon** (2 DP): a walker on a rail tile (`rails` in the mission) next to a wagon on the same rail line, along the line, sends the wagon rolling away from it along the rails. It moves one tile at a time, up to `wagon.roll` tiles, and stops before the end of the rails or an object (both take `wagon.collide`). If the next tile holds a walker, that walker takes `wagon.dmg` to the body and is pushed off the track sideways (FLD-1, towards lower x first, else higher x, else a collision) and knocked down; the wagon stops before it.
- **FLD-4** Rolling wagons carry their HP; a wagon broken by a collision becomes rubble where it stands.
- **FLD-5** **Container stacks** (`stacks` in the mission): a stack at `stack.toppleAt` HP or less, but above 0, after a hit or a collision **topples** away from what hit it. The stack tile becomes rubble. Each of the next `stack.reach` tiles beyond: a walker there takes `stack.dmg` to the body and is knocked down; an object there takes `stack.dmg`; a free tile becomes rubble. Tiles off the map are skipped.
- **FLD-6** **Smoke**: fired at a tile in the mortar's range that the firer or an ally can see (ATK-5); it covers that tile and every tile within `smokeRadius` (a 3×3 square, clipped to the field). A smoke tile blocks line of sight when it lies between attacker and target (MAP-4), and a walker standing in smoke has cover (MAP-5). Smoke clears when the firer's side's next phase starts.
- **FLD-7** Smoke, rails and stacks are in the plain-JSON state: `smoke` as a list of tiles with the side that laid them; rails and stacks as tile flags.
- **FLD-8** Pushes, falls, collisions, rolling wagons, topples and cook-offs are not attacks: they never draw reactions and never miss.

## 8. Nerve (NRV)
- **NRV-1** Every pilot has nerve from 0 to `nerve.max`, starting each battle at the pilot's `nerve` (`pilots.json`).
- **NRV-2** Changes, applied as they happen, clamped to 0..max: `landHit` when an attack of the pilot's lands at least one hit; `kill` when it destroys a walker; `together` for each walker standing next to an ally when its side's phase ends; `hitSide` / `hitRear` when an attack lands at least one hit on it from that arc; `pinned` when pinned; `knockedDown` when knocked down; `allyLost` when an ally it can see (line of sight) is destroyed.
- **NRV-3** **Steady** at `nerve.steady` or more: +`steadyHit` to hit and its signature can be used. **Shaken** at `nerve.shaken` or less: −`shakenHit` to hit and no reactions (RCT-2, RCT-3).
- **NRV-4** Maneuvers with `nerve` need at least that much and spend it.
- **NRV-5** **Signatures**, once per battle, Steady only (checked before the cost):
  - **Call the line** (Marlow): every ally in her line of sight gains 1 reserve, up to `drive.signatureReserveCap`.
  - **Shoulder to shoulder** (Okonjo): Brace (MAN-5), plus Guard (RCT-4) on every adjacent ally if her shield arm stands. Guard on several allies is allowed for this only.
  - **Ghost step** (Varga): a walk that costs 0 DP, only after a fire order this phase.
  - **Hot patch** (Haldane): Patch (MAN-10) on an ally up to `range` tiles away, which also gives that ally's pilot `nerveGift` nerve. Uses a repair charge.
  - **Drill tempo** (Hallen): every ally in his line of sight that has not stood down gains `gain` drive now.
- **NRV-6** Nerve and signature use are in the state, so a replay is exact (ARCH-5).
- **NRV-7** The AI sees its own and the enemy's nerve (no fog in mission 1, PLAN Q3).

## Rulings
- RULING: DRV-2 | orders of different walkers may be interleaved | walk A into the lane, walk B to the wagon, then fire A: the whole point of a budget is planning across the squad.
- RULING: DRV-4 | each slot gives one order per phase | without it Burst twice is the best play every time and modes stop mattering.
- RULING: DRV-6 | every walker starts with reserve 1 | the hostile side would otherwise have no return fire in round 1, which the v1 counter balance (spec 10 ATK-8 ruling) relied on.
- RULING: DRV-8 | undo only while nothing was learned | a walk that drew overwatch revealed and rolled something; undoing it would let the player fish for misses.
- RULING: HIT-2 | Steady and Shaken modify every roll, reactions included | nerve should be felt on every shot, not only on your own orders.
- RULING: MOD-1, carbine Cover lane | 1 DP, not the 2 in the design | 2 DP plus the 1 reserve the shot costs used 3 of 4 drive; overwatch would never be picked.
- RULING: MOD-5 | Drive-through needs the last walk to be straight, with the target on the next tile of that line | readable from the board: an arrow straight into the enemy.
- RULING: FAC-2 | the exact diagonal counts as side | stepping round a corner should pay off.
- RULING: FAC-3 | indirect fire and knocked-down walkers use the rear weights | shells come from above, and a walker on the ground shows its back.
- RULING: FAC-5 | the shield does not cut indirect fire | top-down fire gets round a shield; v1 let it, so mortars were weak against shields.
- RULING: MAN-6 | a grab ends when the grabber's next phase starts | otherwise a grab is a permanent lock for 1 DP.
- RULING: MAN-11 | Tow moves the tower one tile away and drags the ally after it | "pull an adjacent ally toward you" cannot move an ally that is already adjacent.
- RULING: RCT-2 | return fire is at -15 to hit *(tune)* | carried over from spec 10's counter (sim 2026-11-24, `80-sim.md`): without it every attack traded evenly and the outnumbered side always lost.
- RULING: RCT-2 | shields never return fire | a shield guards (RCT-4); a Bash in reply would make every shield walker a free melee counter.
- RULING: RCT-4 | an effect lands on each walker that took a hit | a guard who takes a Shove on the shield is the one pushed.
- RULING: RCT-2 | return fire is the cheapest mode of the best weapon | a reaction is a snap answer, not a full burst; the choice of weapon is kept from spec 10's ATK-8 ruling.
- RULING: RCT-3 | overwatch fires on walks only, not pushes, tows or rolls | a push is not a choice the moving walker made.
- RULING: FLD-3 | a walker hit by a wagon is pushed towards lower x first | deterministic and readable; both Marrow Yard lines run north-south.
- RULING: FLD-5 | topples do not chain | a topple can hit another stack, which takes damage but does not fall that turn; chains are hard to read and to preview.
- RULING: NRV-5 | Drill tempo gives drive now, not next phase | the hostile AI plans phase by phase; a delayed gain would be wasted on walkers that already stood down.
