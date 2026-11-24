# IRON BASIN (working title) — PLAN

An original turn-based walker-tactics game for the browser by **evilgouki**: a hired company of piloted walkers fights a proxy war in a cold northern river basin; hits land on separate body parts, and between missions you rebuild your walkers from salvaged parts. Spiritual successor to the 1990s walker-tactics games (Square's Front Mission series); it takes the genre's shape (grid battles, part damage, counter-fire, the hangar) and nothing else: no names, machine designs, places, factions, music or interface from that series (KB rules 3, 18, 29). Rewrite, do not append. Every open question carries its default and work continues on it (KB rule 20).

## Decisions (owner, do not re-ask)
| Id | Decision | Date | Source |
|---|---|---|---|
| D1 | Next spiritual successor: a mech squad tactics game in the Front Mission mould (Claude's recommendation; the owner asked for concepts, then for the first level) | 2026-11-24 | owner: "Do a run of concept images of what you think our Front Mission game would look like"; "Build out the first level" |
| D2 | Home: **`dragoonant/iron-basin`**, created by the owner ("iron basin repo is up", 2026-11-24). The first two commits were made on an orphan branch of `dragoonant/ex-kom-calamity` (`claude/dazzling-lovelace-qzzxdj`) and moved over unchanged | 2026-11-24 | question batch 1; owner 2026-11-24 |
| D3 | Walkers are **modular part kits built in code** (torso, arms, legs, backpack, hand weapons) in the concept's design language, with generated paint textures, so lost and swapped parts show on the model. Hunyuan may replace pieces later | 2026-11-24 | batch 1 (GPU PC not reachable from the cloud session; no remote image-to-3D service) |
| D4 | Look **locked**: our walker `docs/concept/run1/02-line-walker.jpg` (slate blue-grey, sloped armoured hull holding the cockpit, no head or face, one off-centre camera turret, two arms with hands, thick legs with knee skirts, bolted panels, safety-orange shoulder band); the enemy `docs/concept/run1/06-enemy-walker.jpg` (forward-raked wedge hull, red sensor slit, sand and olive two-tone camouflage, ram fist) | 2026-11-24 | batch 1 |
| D5 | Battles: **side phases on a square grid**; each walker moves and acts once per phase; hits land on a part (body, left arm, right arm, legs) with its own HP; direct fire draws a counter | 2026-11-24 | batch 1 |
| D6 | First level = **briefing, battle, hangar**: voiced briefing over a map, the Marrow Yard battle (4 of ours vs 6), debrief with salvage, the hangar to swap parts, then a stub for contract 2 | 2026-11-24 | batch 2 |
| D7 | Spend: **use what's needed, frugally**: pilot three before every batch; about 40-60 images (FLUX through Hugging Face); ElevenLabs for 3-4 music tracks, about 25 sounds and short voiced lines inside the Starter credits left (about 33k on 2026-11-24); Web Audio fills any gap | 2026-11-24 | batch 2 |
| D8 | Working title **IRON BASIN** (placeholder until the owner picks a final one) | 2026-11-24 | batch 2 |
| D10 | Voices: recast on EVILAEGIS with the local Audio Studio (Qwen voice design, then voice clone per character), not ElevenLabs. Brief: `HANDOFF-GPU.md` | 2026-11-24 | owner: "I wasn't super happy with the voices"; "Can we do all of that on evilaegis?" |
| D9 | Devices: **desktop and phone landscape**, mouse and touch (KB rules 24-27) | 2026-11-24 | batch 2 |

## Defaults taken (change any by saying so)
| Id | Default |
|---|---|
| Q1 | Stack: the sibling stack (Vite 8, React 19, three 0.187 / R3F 9 / drei 10, zustand 5, TypeScript 7 strict, Vitest 5, Playwright, tsx), configs from ex-kom-calamity |
| Q2 | Engine contract (KB recipe step 3): pure `step(state, action)` that never throws, `legalActions` never empty, `query.*` owns every number, `view(state, side)`, sfc32 seeded RNG in the state, plain-JSON state, replay hash |
| Q3 | No fog of war in mission 1 (the genre shows the whole field); `view` exists so fog can come later |
| Q4 | No facing; height gives +10 to hit and +1 range for direct fire from higher ground |
| Q5 | Battle close-ups: the camera swings to the attacker and target for each attack, skippable, with a setting to turn them off (our own take on the genre's battle screen) |
| Q6 | Save (KB rule 22): autosave after every accepted action, at the start of a battle and in the hangar; one slot, key `ib-save`; Continue names the screen, turn and phase |
| Q7 | Pilots survive a destroyed walker (they eject); permadeath is not in mission 1 |
| Q8 | Presentation concept: **grease pencil on acetate** (`docs/presentation-concept.md`) |
| Q9 | Names (all ours, checked against the source series): the Vell Basin, the river Vell, the town of Kerrow, Marrow Yard; our side the **Grey Lantern Company**, hired by the **Basin Concord**; the enemy the **Northern Directorate** |
| Q10 | Audio: ElevenLabs (connected to this session) instead of the local Audio Studio, which this cloud session cannot reach; "not verified by ear" until the owner listens (KB rule 9) |
| Q11 | Publish the playable as a private claude.ai Artifact (KB rule 28) and on Pages once the repo exists |

## Milestones
| M | What | State |
|---|---|---|
| M0 | Concepts (run 1, 12 images), questions, plan, scaffold | done 2026-11-24 |
| M1 | Spec `docs/spec/10-rules.md`, data, engine, AI, sim, bench, fuzz | done 2026-11-24 |
| M2 | Client: board, part-kit walkers, terrain, HUD, close-ups, save | done 2026-11-24 |
| M3 | Art (portraits, map, sky, textures), audio (music, sounds, voices) | done 2026-11-24 (audio not verified by ear) |
| M4 | Briefing, debrief, hangar; Artifact; KB entry | done 2026-11-24 (KB entry pushed to `3d-game-generation/projects/iron-basin.md`) |
| M5 | Contract 2, the Kerrow Locks (night, fog, quays, a lock gate to blow); pilot levels; fog of war | next |
