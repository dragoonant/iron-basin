# IRON BASIN — STATUS (rewrite, never append)

**2026-11-24: level 1 is playable end to end.** Title → voiced briefing → Marrow Yard battle → debrief with salvage → hangar → contract 2 stub. Private Artifact: https://claude.ai/artifact/FnZ6XXpAdyCX4HgsU2pRFR (KB rule 28; still the v1 build, republish after M5). Home: `dragoonant/iron-basin` (PLAN D2).

## What is in
| Area | State | Where |
|---|---|---|
| Rules | spec 10: 35 ids; spec 15 (combat v2): 63 ids, 41 live and tested, 22 pending | `docs/spec/10-rules.md`, `docs/spec/15-combat-v2.md`, `tests/rules.test.ts`, `tests/v2.test.ts`, `tests/coverage.test.ts` |
| Engine | pure `step`, `legalActions`, `query.*`, `view`, sfc32 replay, campaign and hangar ops | `src/engine/` |
| AI | pure function of `view(state, side)`; normal (one-pass drive planner) and random | `src/ai/` |
| Balance | pass 1 recorded; AI vs AI player win 30-39%, normal beats random 96% | `docs/spec/80-sim.md` |
| Board | world-space textured terrain, rails and sleepers, wagons, container stacks, silos, brick sheds, flood barriers, crane gantry, rubble, water, surroundings, sky, fog, rain | `src/client/board/Field.tsx`, `Board.tsx` |
| Walkers | part kits in code (Lantern, Wedge); arms hide when lost and fly off as debris; wear darkens parts; walk cycle, recoil, lunge, topple to a wreck; orange/red rings | `src/client/board/kit.ts`, `Walkers.tsx`, `?gallery` |
| Presentation | event playback with close-up camera, flashes, tracers, mortar arcs, sparks, explosions, smoke, ejecting pilots, floating damage, phase banners; any click skips | `src/client/presenter.ts`, `board/Fx.tsx` |
| HUD | unit card with part bars, drive/reserve pips, facing, status chips, hold fire; fire panel by mode with DP, odds, arc, return fire; Face, aim (Smoke, Cover lane, Guard), Patch, undo walk, stand down; pencil log | `src/client/Hud.tsx` |
| Screens | title, briefing (region map, grease-pencil yard plan, six voiced lines), debrief, hangar (turntable, slots, salvage with before/after stats, repair, repaint), contract 2 stub, settings | `src/client/Screens.tsx`, `Hangar.tsx` |
| Save | `ib-save` envelope after every order; Continue names the spot; damaged save says why | `src/client/save.ts` |
| Art | 22 FLUX images (6 portraits, 5 backdrops, sky, 10 tiling textures) + concept run 1 | `public/art/`, `docs/spec/70-art.md` |
| Audio | 5 music tracks, 28 sounds, 25 voice lines (ElevenLabs); not verified by ear | `public/audio/`, `docs/spec/60-audio.md`, `sounds.html` |

## Gates (all green 2026-11-26)
`npm run typecheck` | `npm test` (78, plus 22 pending v2 ids) | `npm run build` | `npm run validate:data` | `npm run sim` | `npm run action-fuzz` | `npm run bench:ai` | `npm run e2e` (11: smoke, full contract, fire panel, drive and facing, rules 22/24/25/27, sound) | `npm run check:look` | `npm run artifact`

## Known gaps, next
- **Combat v2, slice 5b done (2026-11-26): the new turn is playable.** Drive points (walk 1, fire modes 1-3, pivot 1, stand down keeps up to 2 as reserve), 2-3 fire modes per weapon, facing and flanks (side +10, rear +20 and the backpack, which can cook off), reserve-paid return fire, overwatch lanes that fire mid-walk, shield guard, push and fall, knockdown, smoke screens. HUD: drive and reserve pips, status chips, a fire panel listing every mode with its DP, odds and why it is blocked, Face buttons (free right after a walk), aim modes, hold fire. Spec: `docs/spec/15-combat-v2.md` (41 of 63 ids live; spec 10 lost the 9 ids v2 replaced). Sim: AI vs AI 41.5%, median 11 rounds, normal vs random 100% (`80-sim.md`). The AI never picks Aimed pair, Suppress, Smoke, Cover lane or Guard yet (AI v2, slice 5f). Next: slice 5c (kick, grab, throw, dash, brace, overdrive, mark, tow; rolling wagons and toppling stacks).
- **Voices:** the owner is not happy with the stock ElevenLabs voices. A local recast on EVILAEGIS is ready to run: `HANDOFF-GPU.md`, `tools/audio/local-voices.mjs`, `tools/audio/cast.json`.
- Salvage is generous (about 21 items a win): revisit with contract 2's economy.
- No fog of war yet (PLAN Q3). Facing comes with v2 (D13). Pilots do not level up yet.
- Phone landscape re-laid for v2 (orders beside the unit card, slim fire panel), checked by eye at 844×390 and by the rule-24 test.
- KB entry: `3d-game-generation/projects/iron-basin.md` (pushed 2026-11-24); `docs/kb-entry.md` is the local copy.
