# IRON BASIN — STATUS (rewrite, never append)

**2026-11-24: level 1 is playable end to end.** Title → voiced briefing → Marrow Yard battle → debrief with salvage → hangar → contract 2 stub. Private Artifact: https://claude.ai/artifact/FnZ6XXpAdyCX4HgsU2pRFR (KB rule 28). Home: `dragoonant/iron-basin` (PLAN D2).

## What is in
| Area | State | Where |
|---|---|---|
| Rules | 45 rule ids, 7 rulings, every id tested | `docs/spec/10-rules.md`, `tests/rules.test.ts`, `tests/coverage.test.ts` |
| Engine | pure `step`, `legalActions`, `query.*`, `view`, sfc32 replay, campaign and hangar ops | `src/engine/` |
| AI | pure function of `view(state, side)`; normal and random | `src/ai/` |
| Balance | pass 1 recorded; AI vs AI player win 30-39%, normal beats random 96% | `docs/spec/80-sim.md` |
| Board | world-space textured terrain, rails and sleepers, wagons, container stacks, silos, brick sheds, flood barriers, crane gantry, rubble, water, surroundings, sky, fog, rain | `src/client/board/Field.tsx`, `Board.tsx` |
| Walkers | part kits in code (Lantern, Wedge); arms hide when lost and fly off as debris; wear darkens parts; walk cycle, recoil, lunge, topple to a wreck; orange/red rings | `src/client/board/kit.ts`, `Walkers.tsx`, `?gallery` |
| Presentation | event playback with close-up camera, flashes, tracers, mortar arcs, sparks, explosions, smoke, ejecting pilots, floating damage, phase banners; any click skips | `src/client/presenter.ts`, `board/Fx.tsx` |
| HUD | unit card with per-part bars, attack preview with counter odds, object fire, repair, undo, wait, end phase, pencil log | `src/client/Hud.tsx` |
| Screens | title, briefing (region map, grease-pencil yard plan, six voiced lines), debrief, hangar (turntable, slots, salvage with before/after stats, repair, repaint), contract 2 stub, settings | `src/client/Screens.tsx`, `Hangar.tsx` |
| Save | `ib-save` envelope after every order; Continue names the spot; damaged save says why | `src/client/save.ts` |
| Art | 22 FLUX images (6 portraits, 5 backdrops, sky, 10 tiling textures) + concept run 1 | `public/art/`, `docs/spec/70-art.md` |
| Audio | 5 music tracks, 28 sounds, 25 voice lines (ElevenLabs); not verified by ear | `public/audio/`, `docs/spec/60-audio.md`, `sounds.html` |

## Gates (all green 2026-11-25)
`npm run typecheck` | `npm test` (47, plus 62 pending v2 ids) | `npm run build` | `npm run validate:data` | `npm run sim` | `npm run action-fuzz` | `npm run bench:ai` | `npm run e2e` (10: smoke, full contract, attack preview, rules 22/24/25/27, sound) | `npm run check:look` | `npm run artifact`

## Known gaps, next
- **Combat v2, slice 5a done (2026-11-25):** the rules are in `docs/spec/15-combat-v2.md` (63 ids, 17 rulings, each id a pending test in `tests/v2.test.ts`). The data carries modes, maneuvers, drive, nerve, facing, rails and stacks, and `validate:data` checks them. The engine still plays v1. Next: slice 5b, the core loop (drive, fire modes, facing). Design: `docs/combat-v2.md`; decisions PLAN D11-D14.
- **Voices:** the owner is not happy with the stock ElevenLabs voices. A local recast on EVILAEGIS is ready to run: `HANDOFF-GPU.md`, `tools/audio/local-voices.mjs`, `tools/audio/cast.json`.
- Salvage is generous (about 21 items a win): revisit with contract 2's economy.
- No fog of war yet (PLAN Q3). Facing comes with v2 (D13). Pilots do not level up yet.
- Phone landscape is laid out but only checked at 844×390 by the rule-24 test.
- KB entry: `3d-game-generation/projects/iron-basin.md` (pushed 2026-11-24); `docs/kb-entry.md` is the local copy.
