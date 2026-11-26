# IRON BASIN — STATUS (rewrite, never append)

**2026-11-24: level 1 is playable end to end.** Title → voiced briefing → Marrow Yard battle → debrief with salvage → hangar → contract 2 stub. Private Artifact: https://claude.ai/artifact/FnZ6XXpAdyCX4HgsU2pRFR (KB rule 28; republished 2026-11-26 with combat v2 through slice 5e). Home: `dragoonant/iron-basin` (PLAN D2).

## What is in
| Area | State | Where |
|---|---|---|
| Rules | spec 10: 35 ids; spec 15 (combat v2): 63 ids, all live and tested | `docs/spec/10-rules.md`, `docs/spec/15-combat-v2.md`, `tests/rules.test.ts`, `tests/v2.test.ts`, `tests/coverage.test.ts` |
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
`npm run typecheck` | `npm test` (100) | `npm run build` | `npm run validate:data` | `npm run sim` | `npm run action-fuzz` | `npm run bench:ai` | `npm run e2e` (12: smoke, full contract, fire panel, drive and facing, wagon shunt, rules 22/24/25/27, sound) | `npm run check:look` | `npm run artifact`

## Known gaps, next
- **Combat v2, slices 5b, 5c and 5e done (2026-11-26).** The turn runs on drive points with 2-3 fire modes per weapon, facing and flanks, reserve-paid return fire, overwatch, shield guard, pushes and smoke (5b). Part maneuvers are in: Dash and Hop (light legs), Kick and Brace (medium), Brace and Plant (heavy), Ram jab (WEDGE arms, so salvaged arms teach it), Grab and Throw (an empty hand), Overdrive (any body), Mark (sensor), Tow (repair crane). The yard is a weapon: coupled wagons roll down the rails as a rake and knock walkers off the track; damaged container stacks topple onto the next two tiles (5c). All 63 spec 15 ids are live. Sim: AI vs AI 42.5%, median 10 rounds, normal vs random 100% (`80-sim.md`). The AI still skips Aimed pair, Suppress, Smoke, Cover lane, Guard, Grab, Dash, Brace, Plant, Overdrive and Tow (AI v2, 5f). Nerve moves with the fight (hits, flanks, kills, lost allies, standing together) and Steady pilots get one signature a battle: Marlow's Call the line, Okonjo's Shoulder to shoulder, Varga's Ghost step, Haldane's Hot patch, Hallen's Drill tempo. Sim after 5e: AI vs AI 46.0% (one point over the band; tuned in 5g after AI v2). Next: slice 5f (AI v2).
- **Voices:** the owner is not happy with the stock ElevenLabs voices. A local recast on EVILAEGIS is ready to run: `HANDOFF-GPU.md`, `tools/audio/local-voices.mjs`, `tools/audio/cast.json`.
- Salvage is generous (about 21 items a win): revisit with contract 2's economy.
- No fog of war yet (PLAN Q3). Facing comes with v2 (D13). Pilots do not level up yet.
- Phone landscape re-laid for v2 (orders beside the unit card, slim fire panel), checked by eye at 844×390 and by the rule-24 test.
- KB entry: `3d-game-generation/projects/iron-basin.md` (pushed 2026-11-24); `docs/kb-entry.md` is the local copy.
