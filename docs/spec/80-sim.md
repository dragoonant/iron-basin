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
