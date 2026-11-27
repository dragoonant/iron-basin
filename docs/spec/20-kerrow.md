# IRON BASIN — the Kerrow Locks (spec 20)

**The spec is the product** (KB rule 2). Rules for contract 2 (`docs/contract-2.md`, PLAN Q18-Q21) on top of specs 10 and 15. Every id has a test named by it in `tests/kerrow.test.ts` (pending `it.todo` until its slice lands); numbers live in `src/data/*.json`; ambiguities are `RULING:` lines at the end.

| Slice | Ids | State |
|---|---|---|
| 6b the canal | LCK-1..8 | landed 2026-11-27 |
| 6c night and fog | FOG-1..8 | landed 2026-11-27 |
| 6d pilot levels | PLV-1..5 | landed 2026-11-27 |

## 1. The canal (LCK)
- **LCK-1** **Deep water** (terrain `deep`) cannot be entered (`impassable` in `rules.json`): no walk, Dash, Tow or push ends there. It does not block line of sight.
- **LCK-2** **The swing bridge**: the mission's `bridge` tiles are deck (cost 1) while the bridge is closed and deep water while it is open. **Swing the bridge** (universal, 2 DP) opens it if it is closed and closes it if it is open. It needs the walker next to a winch, and no walker may stand on a bridge tile.
- **LCK-3** **Winches** are objects: they block movement, cannot be broken, give no cover and do not block sight.
- **LCK-4** **Lock gates** are objects on the canal with `objects.gate.hp`. They block sight, give cover and can be broken by direct and melee fire (ATK-9) and by collisions (FLD-1). A broken gate leaves deep water, not rubble.
- **LCK-5** **The flood**: the first time a gate breaks, every tile in the mission's `flood` list without an object becomes water, and every walker standing on one is mired (FLD-1). It happens once a battle.
- **LCK-6** **Lamps** are objects with `objects.lamp.hp`. They block movement, give no cover and do not block sight. A broken lamp leaves the quay bare, not rubble. Their light is FOG-2.
- **LCK-7** **The gate bonus**: a mission with `gateBonus` pays it on a win if no gate broke during the battle (`credits.gate`).
- **LCK-8** A push into deep water is a collision (FLD-1): the walker stops at the quay edge and takes the collision damage.

## 2. Night and fog (FOG), slice 6c
Only a mission with `night: true` has fog. In daylight (Marrow Yard) every walker is known to both sides and sight is line of sight (PLAN Q3, Q19).
- **FOG-1** **Night sight**: a walker sees a tile within `nightSight` (or, with a working sensor mast, within its `sensorRange`) that it has line of sight to. A **lit** tile is seen from any distance with line of sight.
- **FOG-2** **Lit tiles**: every tile within 1 of a standing lamp (a 3 × 3 square), and every tile under a flare (FOG-6).
- **FOG-3** A broken lamp lights nothing (LCK-6).
- **FOG-4** **Seen**: an enemy walker is seen by a side when any walker of that side sees its tile, or it is flashed to that side (FOG-5). Every order that names an enemy walker (fire, attack maneuvers, Mark) needs it seen by the acting side; so do return fire (RCT-2) and overwatch (RCT-3). Indirect fire needs a walker of the side that sees the target (ATK-5).
- **FOG-5** **Muzzle flash**: a walker that makes a roll against an enemy is flashed to that enemy's side until that side's phase next ends.
- **FOG-6** **Flare** (a mortar mode, 2 DP, one round): lights the target tile and every tile within 1, until the firer's side's next phase starts. It needs range only, not sight.
- **FOG-7** **What a side knows**: `view(state, side)` leaves out enemy walkers the side does not see. The state keeps each side's **intel**: the last place it saw each enemy walker (at the start, where the briefing put them). The AI may read its own side's intel.
- **FOG-8** **Ambush**: a walk is planned on what the side sees, so it may pass or end on an enemy walker it cannot see. It stops on the last free tile before that walker, which is then seen. A tow whose tile holds an unseen walker does nothing, and its drive is spent.

## 3. Pilot levels (PLV), slice 6d
Campaign-wide, not only on the Kerrow Locks.
- **PLV-1** **Experience**: after a battle, each pilot who took part gains `levels.survive` if its walker still stands, `levels.kill` for each enemy walker it destroyed, and `levels.win` if the contract was won.
- **PLV-2** **Levels**: a pilot is level 1, plus one for each of `levels.thresholds` its experience has reached.
- **PLV-3** A pilot starts each battle with its `nerve` plus one per level above 1, capped at `nerve.max`.
- **PLV-4** **Second signatures**: from level 2 a pilot also has its `signature2`, once per battle and Steady only, like the first (NRV-5), with its own use:
  - **Rally** (Marlow): every ally in her line of sight gains `nerveGift` nerve.
  - **Bulwark** (Okonjo): Brace and Plant at once (MAN-5), and +1 reserve when she stands down.
  - **Sweep** (Varga, a working sensor mast): Mark (MAN-9) every enemy she sees in sensor range.
  - **Field weld** (Haldane, a working repair crane, 2 DP): a lost arm of an adjacent ally, or her own, is back to `levels.weldHp` HP. The one way to restore a lost part in battle.
- **PLV-5** The hangar shows each pilot's level, experience, the next threshold and its signatures; the debrief shows what each pilot earned.

## Rulings
- RULING: LCK-2 | the bridge cannot swing with a walker on it | a walker dumped into deep water would need a drowning rule this game does not want.
- RULING: LCK-4 | indirect fire cannot break the gate | ATK-9 already keeps mortars off objects; blowing the gate is a choice made at close range.
- RULING: LCK-8 | a push into deep water collides | the same reason as LCK-2; the quay edge is a wall.
- RULING: FOG-1 | a sensor mast sees to its sensor range at night | the mast is the night scout's job; it also gives the Directorate's spotter a reason to stand forward.
- RULING: FOG-5 | the flash lasts until the side that saw it ends its phase | a return shot fired in your phase shows you the shooter for the rest of that phase; a shot fired in theirs, for the whole of yours.
- RULING: FOG-8 | orders are legal on what the side knows | otherwise an order planned from the board would be refused by something the player could not see.
- RULING: PLV-1 | a pilot whose walker was destroyed still earns its kills and the win | ejecting is part of the job; losing the experience too would punish a bad roll twice.
- RULING: PLV-4 | Field weld restores 25 HP, not the whole arm | it must not replace the hangar's repairs; one usable arm for the rest of the battle.
- RULING: FLD-5 | a toppling stack does not turn deep water into rubble | otherwise a topple could build a crossing.
