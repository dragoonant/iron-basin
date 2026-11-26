# Sim and bench record (spec 80)

Read before touching a number (KB rule 30). `npm run sim` plays AI against AI (both seats `normal`) on Marrow Yard; `npm run bench:ai` plays `normal` against `random` in both seats.

## Balance pass 1 (2026-11-24), one change at a time, 80 battles each
| Step | Change | AI vs AI player win | player-seat AI vs random | hostile-seat AI vs random |
|---|---|---|---|---|
| 0 | first numbers | 0% (55% timeouts) | 0% | 100% |
| 1 | body power resized so starting builds are not overweight; weapon damage x1.6 | 0% | 9% | 100% |
| 2 | Directorate grunts skill -5, WEDGE parts 105/60/78 HP | 1% | 18% | 100% |
| 3 | hit weights favour the body (direct 50/15/15/20); round limit 14 -> 18 | 1% | 59% | 100% |
| 4 | counters fire at -15 to hit (ATK-8 RULING) | 9% | 75% | 100% |
| 5 | five Directorate walkers instead of six (the east rifle removed) | **39%** | **91%** | 100% |

Why step 4: the player side dealt almost twice the damage but every attack drew a full-strength counter, so the outnumbered side traded itself away. Why step 5: the first mission should be won by a person who plays about as well as the AI; at 39% AI-vs-AI a person who focuses fire and uses cover wins most of the time.

## Gate runs (2026-11-24, after pass 1)
| battles | player win | timeouts | median rounds | player walkers lost | hostile lost | salvage per win | violations |
|---|---|---|---|---|---|---|---|
| 200 | 30.0% | 17 | 14 | 3.27 | 3.96 | 20.9 | 0 |

| seat | battles | normal wins |
|---|---|---|
| hostile (normal vs random) | 100 | 100 |
| player (normal vs random) | 100 | 92 |
| **both** | 200 | **96.0%** |
determinism (seed 7 replay): ok

Salvage per win is high (about 21 items) because bodies usually fall before limbs; the hangar groups the inventory by part. Revisit if the hangar economy feels flooded.

## Combat v2, slice 5b (2026-11-26): the structure alone, no number changed
Drive points, fire modes, facing, reserve-paid return fire, overwatch, guard, push, knockdown and smoke (spec 15), with the same weapon, part and pilot numbers as pass 1. The AI is the one-pass planner in `src/ai/index.ts` (walk, best package of up to two modes, turn, stand down); AI v2 is slice 5f.

| battles | player win | timeouts | median rounds | player walkers lost | hostile lost | salvage per win | violations |
|---|---|---|---|---|---|---|---|
| 200 | 41.5% | 1 | 11 | 3.12 | 3.77 | 20.4 | 0 |

| seat | battles | normal wins |
|---|---|---|
| hostile (normal vs random) | 100 | 100 |
| player (normal vs random) | 100 | 100 |
| **both** | 200 | **100.0%** |

All three targets for M5 hold already: AI vs AI 30-45% (41.5%), median rounds 12 or fewer (11), normal vs random at least 90% (100%). Timeouts fell from 17 to 1: with two weapons firing a phase, battles end sooner.

**Orders used** (share of 23,450 non-end orders): walk 47.3%, Double tap 14.7%, Burst 8.1%, Snap 6.1%, High explosive 4.9%, Strike 4.3%, Shot 4.0%, Braced shot 3.7%, Patch 2.1%, Bash 2.0%, Salvo 1.6%, Pivot 0.6%, Shove 0.3%, Drive-through 0.3%.

**Never picked by the AI:** Aimed pair, Suppress, Smoke, Cover lane, Guard, Tagged salvo (needs Mark, slice 5c). The first five are a gap in the one-pass AI, which scores only expected damage: it has no value for a called part, a pin, a screen, a lane or a guard. They are the first job of AI v2 (5f). Under 3% (the 5g bar) but picked: Pivot, Shove, Drive-through. No number is changed for them until AI v2 can use them; then 5g decides.

## Combat v2, slice 5c (2026-11-26): maneuvers and the field, no number changed
Part maneuvers (Dash, Hop, Kick, Brace, Plant, Ram jab, Grab, Throw, Overdrive, Mark, Tow), rolling wagon rakes and toppling stacks. The AI adds Kick, Ram jab and Throw to its shot list, marks for allies still to act, and shunts a wagon when the rake's first walker would be an enemy.

| battles | player win | timeouts | median rounds | player walkers lost | hostile lost | salvage per win | violations |
|---|---|---|---|---|---|---|---|
| 200 | 42.5% | 0 | 10 | 3.13 | 3.88 | 20.6 | 0 |

Normal vs random: 100% (both seats). Determinism ok.

**Orders used:** walk 43.3%, Double tap 12.5%, Burst 8.4%, Ram jab 6.1%, High explosive 4.8%, Strike 4.7%, Kick 3.5%, Shot 3.3%, Snap 2.9%, Braced shot 2.3%, Bash 2.1%, Patch 2.0%, Salvo 1.6%, Mark 1.4%, Shunt 0.4%, Pivot 0.4%, Throw 0.3%, Drive-through 0.2%. Ram jab took Shove's place: both push, Ram jab is cheaper.

**Never picked by the AI:** Aimed pair, Suppress, Smoke, Cover lane, Guard, Shove, Grab, Dash, Brace, Plant, Overdrive, Tow, Tagged salvo. Shunt shows up only when a walker happens to end next to a wagon; AI v2 must walk to the rails on purpose. Tagged salvo cannot come up on Marrow Yard as built: only the Directorate carries missiles and only the Lanterns carry a sensor mast (it needs a salvaged missile box or sensor).

## Combat v2, slice 5e (2026-11-26): nerve and signatures, no number changed
Nerve now moves (NRV-2) and the five signatures are in (NRV-5). The AI uses Drill tempo at the start of a phase, Call the line and Shoulder to shoulder before standing down with enemies near, Hot patch on a part missing 30 or more within 2, and Ghost step after firing when it cuts the threat by more than 10.

| battles | player win | timeouts | median rounds | player walkers lost | hostile lost | salvage per win | violations |
|---|---|---|---|---|---|---|---|
| 200 | 46.0% | 1 | 10 | 2.96 | 3.98 | 20.2 | 0 |

Normal vs random: 100% (both seats). Determinism ok.

**Nerve over 40 battles:** walkers are Steady in 44.2% of phase ends and Shaken in 5.1%. Moves: hit +1 (1,741), flank hit -1 (1,026), ally lost -2 (486), rear hit -2 (291), standing together +1 (220), kill +2 (188), knocked down -1 (19).

**Over the band:** AI vs AI is 46.0%, one point over the 30-45% target. The Lanterns have four signatures to the Directorate's one, and landing hits makes Steady (+10) common. Not tuned here: AI v2 (5f) changes how both sides play, so the balance pass (5g) tunes after it. Candidates: nerve `landHit` +1 only on a hit that does 20 or more, or `steady` at 9.

**Orders used:** signatures run 0.0-0.4% each (Ghost step 0.4%, Call the line 0.3%, Shoulder to shoulder 0.3%, Drill tempo and Hot patch under 0.05%), as expected for once-per-battle moves.

## AI v2 (slice 5f) and balance pass 2 (slice 5g), 2026-11-26
AI v2 (`src/ai/plan.ts`) plans a walker's whole turn: [Overdrive?] [walk or Dash?] [up to two orders] [second walk?] [pivot?], then stands down with the rest as reserve. It scores expected damage, kills, called parts, pins (a third of the target's output), pushes by where they land, knockdowns, marks, smoke (blocked enemy lines), lanes, guards, shunts and patches; the end tile by threat, cover and height; reserve by the return fire it gives; nerve by what it buys near the Steady and Shaken lines; and the fire enemy lanes put on a path. The one-pass AI stays as `simple`, the bench opponent (PLAN Q16). AI moves before data, then one data change at a time; 100 battles a step unless marked.

| Step | Change | AI vs AI player win | median rounds |
|---|---|---|---|
| 0 | AI v2 in, no number changed | 80% (10 battles) | 8 |
| 1 | AI: pathing 2x faster, threat from each enemy's main mode | 60.0% | 8 |
| 2 | AI: nerve has a worth (Overdrive, Dash), pins worth a third of the target's output, Tow scored | 53.0% | 8 |
| 3 | Overdrive strain 10 -> 15 (it was 8.5% of all orders) | 50.0% | 8 |
| 4 | Suppress -25 -> -15 to hit (never picked) | 50.0% | 8 |
| 5 | AI: pin worth 0.35 of output, not 0.1 (Suppress now 1.8%) | 58.0% | 8 |
| 6 | Shove pushes 2 tiles (MOD-7 ruling; never picked: Ram jab did its job for less) | 55.0% | 8 |
| 7 | Directorate skill -5 -> 0 | 55.0%, reverted | 8 |
| 8 | a sixth Directorate walker (rifle at 12,6) | 10.0%, reverted | 7 |
| 9 | Lantern starting nerve -1 (Marlow 7, Okonjo 6, Varga 5, Haldane 5): Steady is earned, not given | 40.0%; **46.0% over 200** | 8 |
| 10 | Directorate skill -5 -> -2 (200) | 49.5%, reverted | 8 |
| 11 | WEDGE body HP 105 -> 115 (200) | **41.5%** | 8 |

Why step 9: Marlow started Steady (+10 to hit from the first shot, the signature at once), and nerve from landing hits kept the Lanterns there; the planner pressed that every phase. Why step 11: skill is inside the noise at 200 battles (step 10), durability is not.

## Gate runs (2026-11-26, after pass 2)
| battles | player win | timeouts | median rounds | player walkers lost | hostile lost | salvage per win | violations |
|---|---|---|---|---|---|---|---|
| 200 | 41.5% | 0 | 8 | 2.92 | 3.54 | 20.5 | 0 |

| opponent | seat | battles | normal (AI v2) wins |
|---|---|---|---|
| random | hostile | 100 | 100 |
| random | player | 100 | 100 |
| random | **both** | 200 | **100.0%** |
| simple | hostile | 100 | 91 |
| simple | player | 100 | 73 |
| simple | **both** | 200 | **82.0%** |
determinism (seed 7 replay): ok

**Orders used (200 battles, before step 11; step 11 moved no share by more than 0.3 points):** walk 42.3%, Double tap 8.4%, Burst 4.8%, Overdrive 4.1%, Ram jab 3.8%, Strike 3.6%, High explosive 3.2%, Shunt 3.0%, Braced shot 3.0%, Kick 2.9%, Dash 2.7%, Shot 2.5%, Cover lane 2.3%, Suppress 2.1%, Patch 2.0%, Snap 1.8%, Bash 1.7%, Brace 1.3%, Salvo 1.1%, Grab 0.7%, Aimed pair 0.6%, Smoke 0.5%, Mark 0.3%, Throw 0.3%, Guard 0.2%, Pivot 0.2%, Shove 0.2%, Drive-through 0.2%, then the once-a-battle signatures and Plant and Tow at 0.1% or less. Every mode and maneuver is now picked except Tagged salvo, which Marrow Yard cannot set up (no sensor on the Directorate side, no missiles on ours).

**Under the 3% bar but kept:** Aimed pair, Smoke, Mark, Throw, Guard, Shove, Drive-through, Grab, Plant, Tow and the signatures are situational by design (a part to call, a screen, a lane, a ledge, a downed ally); each is picked by AI v2 when the situation is there. The bar was meant for options that are never right; none of these is.
