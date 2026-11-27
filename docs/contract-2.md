# Contract 2: the Kerrow Locks (M6)

**Why:** PLAN M6. The Concord's supply line runs on from Marrow Yard to Kerrow by water, and the Directorate holds the canal locks below the town. Contract 2 has to be a different fight from the rail yard, built on combat v2 (`docs/combat-v2.md`).

**One line:** *a night fight across a canal: three ways over (a swing bridge, a weir, and a lock gate you can blow), lamps you can shoot out, and a bonus for leaving the gate standing.*

Status: **plan** (2026-11-27). Rules go into `docs/spec/20-kerrow.md` slice by slice, with tests named by id and a `sim` record in `80-sim.md`.

## 1. The field
- 16 × 18 tiles. The canal runs west to east across rows 8 and 9: **deep water**, which walkers cannot enter and which does not block sight.
- **The swing bridge** (west, x 3): two deck tiles across the canal. A **winch** on each bank swings it: a walker next to a winch spends 2 drive to open or close it. When it is open, the deck tiles are deep water. It cannot swing while a walker stands on it.
- **The weir** (east, x 14): a fixed crossing of broken concrete (rubble, cost 2).
- **The lock gate** (x 8): two gate tiles across the canal. They are tall timber and steel (block sight, give cover) with 160 HP each, breakable by direct fire, and they do not topple. When **either** gate tile breaks, the upper basin empties east: every **flood** tile becomes water, and walkers on them are mired.
- **Quays:** high quays (level 1) along the west banks, low quays (level 0) to the east. The low quays are the flood tiles: the Directorate's east flank stands on them.
- **Lamps:** lamp posts on the quays light a 3 × 3 square around themselves. A lamp is an object with 20 HP; shooting it out puts its light out.

## 2. Night and fog (this contract only)
- **Sight:** at night a walker sees a tile within `nightSight` (5) with line of sight; a lit tile is seen from any distance with line of sight.
- **Fog of war:** a side only knows the enemy walkers it sees. Orders that name a walker (fire, maneuvers) need the side to see it. Indirect fire needs a seeing ally, as before. The AI reads `view(state, side)`, which leaves out what it cannot see.
- **Muzzle flash:** a walker that fires a roll is seen by the side it fired at until the end of that side's next phase.
- **Flare** (a new mortar mode, 2 DP, uses a round): lights a 3 × 3 square until the firer's next phase.
- The board draws unseen enemies as a pencil "?" where they were last seen.
- Marrow Yard is in daylight and has no fog (PLAN Q3 stands for contract 1).

## 3. The contract
- Win: every Directorate walker destroyed. Lose: every Lantern down, or round 18 ends.
- Fee 3,600 cr, 600 a kill, bonus 1,200 by round 11, and a **gate bonus** of 1,500 if both gate tiles still stand at the end. Blowing the gate floods their east flank, but it costs the bonus.
- The Directorate brings six walkers: Hallen again, a sensor walker (so Tagged salvo comes into play against you), a mortar, two rams and a rifle.

## 4. Pilot levels
- Pilots earn experience: +1 for each battle survived, +2 for each kill, +1 for a won contract. Levels come at 3, 7 and 12 experience.
- Each level adds +1 to the pilot's starting nerve.
- **Level 2 unlocks a second signature** (once per battle, Steady only, like the first):
  - **Marlow, "Rally":** every ally in her sight gains 2 nerve.
  - **Okonjo, "Bulwark":** Brace and Plant at once, and +1 reserve.
  - **Varga, "Sweep":** Mark every enemy in sensor range that she can see.
  - **Haldane, "Field weld":** restore a lost arm of an adjacent ally to 25 HP (the one way to fix a lost part in battle).
- The hangar shows level, experience and both signatures.

## 5. Build order (M6)
| Slice | What | Done when |
|---|---|---|
| 6a | Missions as data: the campaign runs a mission list; briefing, debrief, the HUD and saves name the current mission; sim, fuzz and bench take `--mission` | Marrow Yard plays unchanged; the Kerrow Locks loads and plays as plain terrain |
| 6b | The canal: deep water, deck, weir, gate and flood, swing bridge and winch, lamps, the gate bonus; the field renders them | spec 20 LCK ids tested; e2e swings the bridge |
| 6c | Night and fog: sight, lit tiles, muzzle flash, Flare, `view` hiding, AI under fog, "?" markers | FOG ids tested; AI v2 still beats random 90% on Kerrow |
| 6d | Pilot levels and second signatures; hangar | PLV ids tested |
| 6e | Balance on Kerrow (sim), briefing lines and plan, the two-contract e2e, Artifact | AI vs AI 30-45% on Kerrow; e2e plays both contracts |
