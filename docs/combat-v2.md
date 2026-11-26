# Combat v2: drive, modes, facing, reactions, the field, nerve

**Why:** the owner, 2026-11-25: "I'd like more attacks for each [walker]. More options, too simplistic right now ... There's gotta be more to the game than just rehashing" the genre. Today a walker moves once, then fires one weapon, repairs or waits, and the target fires back automatically. That is the genre's loop with nothing added. v2 keeps what is ours (part damage, the hangar, the yard, grease pencil) and replaces the loop.

**Owner decisions (PLAN D11-D14):** drive points replace move-then-act; weapons get fire modes and parts grant maneuvers; all four signature systems go in (the field as a weapon, facing and flanking, reactions, pilot nerve); Marrow Yard is rebuilt on v2 rather than waiting for contract 2.

**The one-line pitch:** *every walker has a budget of drive to spend each phase, and what it can spend it on comes from the parts bolted to it, the ground it stands on and the nerve of the person inside.*

Status: **M5 done** (2026-11-26): slices 5a-5h. Every spec 15 rule plays, AI v2 uses nearly all of it, balance pass 2 is recorded, and the hangar, briefing and first phase teach it. The exact rules are `docs/spec/15-combat-v2.md` (63 ids, 17 rulings; where it differs from this page, the spec wins) and the data carries every mode, maneuver, drive, nerve, facing, rail and stack. Section 9 gives the build order. Each slice lands with its rule ids in `docs/spec/10-rules.md`, tests named by id, and a `sim` record in `80-sim.md`. All numbers below are first guesses *(tune)*.

---

## 1. Drive points (DRV): the new loop
| Id | Rule |
|---|---|
| DRV-1 | Each phase a walker gets **drive** = its body's `drive` (L 5, M 4, H 4), minus statuses (pinned -1, knocked down -2). |
| DRV-2 | **Walk**: one walk goes up to the walker's move in path cost for **1 DP**. A walker may walk again later in the same phase (walk, shoot, walk back). |
| DRV-3 | Every fire mode, maneuver and pivot has a DP cost (sections 2-3). A walker acts in any order until its drive runs out or it chooses **Stand down**. |
| DRV-4 | Each weapon slot fires **once per phase**, so "fire twice" means two different weapons. |
| DRV-5 | Drive left at the end of the phase becomes **reserve** (at most 2), which pays for reactions in the enemy phase (RCT). Reserve not spent is lost when the walker's next phase starts. |
| DRV-6 | Overweight (WLK-2) now costs **-1 drive** instead of -1 move; the evasion penalty stays. |
| DRV-7 | Undo: the last walk can be taken back while nothing else has happened since (no roll made, nothing seen). It replaces TRN-4. |

Side phases stay (D5). A walker's turn is now a short plan, not a single click: *walk to the wagon (1), kick it down the line (2), keep 1 in reserve to return fire.*

## 2. Fire modes (each weapon gets 2-3)
A mode lists `dp`, `shots`, accuracy and damage modifiers and an effect. Data moves to `parts.json` under `weapons.*.modes`.

| Weapon | Mode | DP | What it does |
|---|---|---|---|
| 30 mm autocannon | **Burst** | 2 | 3 shots (today's attack). |
| | **Aimed pair** | 3 | 2 shots at +15; **call a part**. |
| | **Suppress** | 2 | 4 shots at -15 for ×0.5 damage. Even one hit **pins** the target (-1 drive and -10 to hit in its next phase) and costs it 1 nerve. |
| 20 mm carbine | **Snap** | 1 | 1 shot at -10. Cheap, so it is also the usual reaction shot. |
| | **Double tap** | 2 | 2 shots. |
| | **Cover lane** | 1 | No shot now: sets **overwatch** on a line of tiles (RCT-3). The shot later costs 1 reserve. |
| Long rifle | **Shot** | 2 | 1 shot. |
| | **Braced shot** | 3 | Only if the walker has not walked this phase: +20, ×1.25 damage, call a part. |
| Ram fist | **Strike** | 2 | 1 hit (today's attack). |
| | **Shove** | 1 | ×0.3 damage and pushes the target 2 tiles straight away (FLD-1). |
| | **Drive-through** | 3 | Only after a straight walk of 2+ tiles this phase: ×1.5 damage and knocks the target down. |
| Riveted shield | **Guard** | 1 | Reaction set on an adjacent ally: shots at that ally from your front arc hit your shield arm instead (WLK-5 guard applies). |
| | **Bash** | 1 | Light hit. **Staggers** the target (-1 drive next phase). |
| M-80 mortar | **HE** | 2 | Today's attack, splash included. |
| | **Smoke** | 2 | 3×3 smoke that blocks sight and gives cover until the firer's next phase. |
| Twin missiles | **Salvo** | 2 | 2 shots. |
| | **Tagged salvo** | 2 | Only against a **marked** target: +25 and ignores cover. |

Ammo (ATK-6) is shared by all of a weapon's modes. Smoke costs a mortar round.

## 3. Maneuvers from parts (an empty hand is a tool)
Parts list their maneuvers in data, so salvage changes what a walker *can do*, not only its numbers. The hangar shows the gained and lost maneuvers before and after a swap (extends HGR-4).

| Part | Maneuvers |
|---|---|
| L legs | **Dash**: a walk with +3 move (1 DP, 1 nerve). **Hop**: climb or drop one level at no extra cost and take no fall damage. |
| M legs | **Kick**: adjacent, small hit to the legs, pushes 1 tile (1 DP). **Brace**: until your next phase you cannot be pushed or knocked down, -10 evasion, +10 to braced shots (1 DP). |
| H legs | **Brace** (above). **Plant**: until your next phase, an ally directly behind you counts as in cover (1 DP). |
| Any arm with no weapon | **Grab**: an adjacent enemy cannot walk until it spends 2 DP to break free, and both of you lose 10 evasion (1 DP). **Throw**: hurl rubble from an adjacent rubble tile, range 2-4, 1 shot (2 DP). |
| WEDGE arms (salvage) | **Ram jab**: a 1-DP light melee hit, pushes. Wearing an enemy arm teaches you its move. |
| Any body | **Overdrive**: +2 DP now. Costs 3 nerve, and the reactor strain does 15 damage to the body. Once per phase. |
| Any walker | **Pivot**: face another way (1 DP). Every walk ends with a facing you choose for free. |
| Sensor mast | **Mark** (1 DP): the target is marked until your next phase, so allies get +15 to hit it and Tagged salvo locks on. Spotting (ATK-7) stays passive. |
| Repair crane | **Patch** (2 DP, SUP-1). **Tow** (1 DP): pull an adjacent ally one tile toward you, which gets a knocked-down ally out of a lane. |

## 4. Facing and flanking (FAC), replacing PLAN Q4
| Id | Rule |
|---|---|
| FAC-1 | A walker faces N, E, S or W. A walk ends facing the way you choose; a **pivot** costs 1 DP. |
| FAC-2 | **Arc** of an attacker, seen from the target: **front** when it sits in the half-plane the target faces and is at least as far along the facing axis as across it; **rear**, the same test in the opposite direction; anything else is **side**. RULING: an attacker exactly on the diagonal counts as **side**, so stepping around a corner pays off. |
| FAC-3 | **Side** hits: the near arm's hit weight is doubled and evasion -10. **Rear** hits: +20 to hit, and the **backpack** becomes a hit location. |
| FAC-4 | Backpack hits: a weapon pack with ammo left **cooks off** (its splash to the body and to adjacent walkers, and the ammo is gone). A sensor or repair pack is disabled for the battle. |
| FAC-5 | Return fire, guard and overwatch only work into the **front arc**. A shield guards the front and the left side. |
| FAC-6 | Indirect fire ignores facing for the to-hit roll but uses the rear weights (top-down). |

Height (+10, +1 range) stays.

## 5. Reactions (RCT), replacing the automatic counter (ATK-8)
| Id | Rule |
|---|---|
| RCT-1 | Reactions are paid from **reserve** (DRV-5) during the enemy phase. |
| RCT-2 | **Return fire**: when a direct or melee attack from the walker's front arc ends and the walker stands, it fires back with its cheapest mode that reaches, for 1 reserve, at `counterPenalty` (-15). Each walker has a per-walker **hold fire** toggle that keeps reserve for overwatch or guard. A return fire never draws one. |
| RCT-3 | **Overwatch** (set by Cover lane): the first enemy that enters or moves along the marked line, within range and in the front arc, takes a Snap shot **mid-walk**. A hit on its legs ends the walk on that tile. Overwatch costs 1 reserve and fires once. |
| RCT-4 | **Guard** (shield) and **Brace** last until the walker's next phase and cost nothing more once set. |
| RCT-5 | A shaken pilot (NRV-3) cannot react. |

This turns the genre's free, automatic counter into a choice: spend drive now, or keep it to punish the enemy's move.

## 6. The field as a weapon (FLD): Marrow Yard is the arsenal
Marrow Yard already has what this needs: two north-south rail lines (x 4 and x 11) with eight wagons, a raised platform (x 7-9, y 3-5), three ponds and three container stacks.

| Id | Rule |
|---|---|
| FLD-1 | **Push** (Shove, Kick, Ram jab, a rolling wagon): the walker moves 1 tile straight away from the pusher. The result depends on the destination: |
| | • a free tile on the same level: it just moves; |
| | • a tile one level lower (off the platform): **falls**, takes 15 legs damage and is **knocked down**; |
| | • water: it moves in and is **mired** (-1 drive in its next phase); |
| | • a walker, an object or the map edge: **collision**, 12 damage to the body of each walker and to the object's HP, and nobody moves. |
| FLD-2 | **Knocked down**: evasion 0, attacks on it use the rear weights, and getting up costs 2 drive in its next phase. Brace prevents it. |
| FLD-3 | **Wagons roll**: a walker adjacent to a wagon, on the same rail line, can kick it (2 DP). It rolls along the rails away from the walker until it hits something or rolls 6 tiles. A walker in its path takes 40 body damage and is pushed off the track, so FLD-1 applies sideways, and the wagon stops. Wagons are cover that moves, and a weapon you aim. |
| FLD-4 | **Container stacks topple**: a stack at 30 HP or less that is pushed or shot from one side falls the other way. The 2 tiles beyond it take 35 body damage and become rubble. |
| FLD-5 | **Smoke** (mortar) blocks sight like a container and gives cover; it clears at the start of the firer's next phase. |
| FLD-6 | Mission data adds `rail: "ns"` on rail tiles and `stack: 2` on container tiles. The map art does not change. |

Kerrow Locks (contract 2) adds what Marrow Yard lacks: blowing the lock gate floods the low quays (mud becomes water), and opening the swing bridge cuts a lane.

## 7. Pilot nerve (NRV)
| Id | Rule |
|---|---|
| NRV-1 | Nerve runs from 0 to 10. A battle starts at the pilot's `nerve` (6-8, in `pilots.json`). |
| NRV-2 | **Gain**: +1 for landing a hit, +2 for destroying a walker, +1 for ending your phase next to an ally. **Lose**: -1 when hit from the side, -2 when hit from the rear, -1 when pinned, -1 when knocked down, -2 when an ally you can see is destroyed. |
| NRV-3 | **Steady** (8 or more): +10 to hit, and the pilot's **signature** can be used. **Shaken** (2 or less): -15 to hit and no reactions. |
| NRV-4 | **Spending**: Overdrive costs 3 nerve, Dash costs 1, a signature costs 4. |
| NRV-5 | Signatures (once per battle, 1 DP, Steady only). All ours: |
| | • **Marlow, "Call the line"**: every ally in her sight gains +1 reserve. |
| | • **Okonjo, "Shoulder to shoulder"**: Brace, plus a Guard on every adjacent ally. |
| | • **Varga, "Ghost step"**: a free walk after a fire mode. |
| | • **Haldane, "Hot patch"**: a Patch at range 2 that also returns 2 nerve. |
| | • **Hallen (Directorate), "Drill tempo"**: every WEDGE in his sight gains +1 drive next phase. |

Nerve is how the pilots show up on the field, not only in the briefing. Pilot levels (M6) raise the starting nerve and unlock a second signature.

## 8. Client
- **Unit card:** drive pips (orange pencil ticks), reserve pips during the enemy phase, a nerve gauge with Steady and Shaken bands, status chips (pinned, marked, knocked down, braced, mired).
- **Orders:** the action list is grouped Left / Right / Pack / Legs / Arms / Pilot. Every entry shows its DP cost and its preview from `query.*` (hit %, damage range, arc, push destination, counter odds). Greyed entries name why (no line of sight, already fired, Steady needed).
- **Picking (KB rule 25):** targets, push destinations, overwatch lines and facing are all chosen by tile. Facing is set with a pencil chevron on the last walk tile: tap the tile again to cycle it. Arcs show as pencil wedges on the hovered enemy, with FLANK and REAR written in pencil.
- **Presenter:** new events `walked` (several per phase), `pushed`, `fell`, `knockedDown`, `collided`, `wagonRolled`, `toppled`, `smoke`, `reaction`, `overwatch`, `nerve`, `overdrive`, `cookOff`, `signature`. Each one plays as a short beat, and any click skips it.
- **Teaching:** Marrow Yard's briefing plan gains three pencil notes (a wagon arrow, a flank arrow, "keep 1 back"). The first battle phase shows three one-time hints. No tutorial screen.

## 9. Build order (M5, each slice ends with all gates green and a playable build)
| Slice | What | Rule ids | Done when |
|---|---|---|---|
| **5a** ✓ | Spec and data: `docs/spec/15-combat-v2.md` (DRV, HIT, MOD, FAC, MAN, RCT, FLD, NRV with rulings, and which spec 10 ids each slice retires). `modes` on every weapon, `maneuvers` on every part, `universal` and `maneuvers` in `parts.json`, `drive` on bodies, `nerve` and `signature` on pilots, `facing`, `rails` and `stacks` in the mission | all | done 2026-11-25: `validate:data` checks every mode and maneuver; `tests/v2.test.ts` holds a pending test per id and the coverage test checks it |
| **5b** ✓ | Core loop: state `v: 2`, drive, walks, fire modes, facing and arcs, backpack hits, undo; plus reactions (return fire, overwatch, guard), push, knockdown and smoke, which the modes need; retired 9 spec 10 ids | DRV, HIT, MOD, FAC, RCT, FLD-1/2/6/8, MAN-10 | done 2026-11-26: AI vs AI 41.5%, median 11 rounds, normal vs random 100% (`80-sim.md`) |
| **5c** ✓ | Maneuvers and the field: kick, ram jab, grab, throw, dash, hop, brace, plant, overdrive, mark, tow; rolling wagons and toppling stacks (push, fall, knockdown and smoke landed in 5b) | FLD, the maneuver rows | done 2026-11-26: coupled wagons roll as a rake (FLD-3 ruling); AI vs AI 42.5%, median 10 rounds |
| **5d** | (folded into 5b) | | |
| **5e** ✓ | Nerve and signatures | NRV | done 2026-11-26: nerve gauge and signature buttons in the HUD; AI vs AI 46.0% |
| **5f** ✓ | AI v2: plans a sequence (walk, action, walk) inside the drive budget with a small beam search; values flanks, push into hazards, keeping reserve when threatened, wagon lines | ARCH-4 | done 2026-11-26: beats random 100% and simple 82% (`80-sim.md`) |
| **5g** ✓ | Balance pass 2 and usage telemetry: `sim` reports how often each mode and maneuver is used, and a mode below 3% of actions is redesigned or cut | | done 2026-11-26: AI vs AI 41.5%, median 8 rounds; Overdrive strain 15, Suppress -15, Shove 2 tiles, Lantern nerve -1, WEDGE body 115 |
| **5h** ✓ | Hangar moveset view, briefing notes, first-phase hints, phone landscape check (844×390), save v2, Artifact republish | HGR-4, SAV | done 2026-11-26: hangar shows the moves each swap gains and loses; three pencil notes on the yard plan; three one-time field notes in the first phase; phone layout checked at 844×390; save v2 (5b); Artifact republished |

Contract 2 (Kerrow Locks) moves to M6, built on v2 with the lock gate and the swing bridge.

## 10. Risks and what we keep an eye on
- **Too many buttons on a phone.** The orders list only shows what is legal now, grouped, and at most about 8 entries for one walker. If it runs past that, the Legs and Arms groups fold into a "Maneuver" fly-out.
- **AI cost.** A walker's possible sequences multiply. The beam search keeps the top 12 walk tiles × the top 6 actions, under 30 ms a walker in the bench, or the beam shrinks.
- **Dead options.** The 5g usage telemetry is the guard: a mode nobody (AI or player tests) picks is redesigned, not kept for the count.
- **Staying our own.** No link or chain attacks between walkers, no heat gauge, and no named skills taken from the genre's series. The signatures and names above are ours. The KB rule 23 list is checked again for every new string.
- **Saves.** A v1 battle save cannot reopen in v2. It says so and offers to discard; a v1 save in the hangar migrates (parts and credits carry over).
