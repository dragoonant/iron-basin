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
