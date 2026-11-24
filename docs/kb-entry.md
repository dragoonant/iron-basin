# iron-basin: living entry

Repo `dragoonant/iron-basin` (created by the owner 2026-11-24; the first two commits moved over from an orphan branch of ex-kom-calamity, PLAN D2). Started 2026-11-24 from a claude.ai cloud session. Private Artifact: https://claude.ai/artifact/FnZ6XXpAdyCX4HgsU2pRFR. **Updated at the end of every milestone** (rules.md rule 19).

## 1. Overview
- An original turn-based walker-tactics game, spiritual successor to the 1990s walker-tactics games (Square's Front Mission series), recommended by Claude after a survey of all the owner's repos (mechs were the largest unfinished thread) and chosen by the owner by asking for concepts, then "Build out the first level" (2026-11-24, PLAN D1).
- Shape: side phases on a square grid; hits land on body, left arm, right arm or legs, each with its own HP; a lost arm loses its weapon, lost legs slow the walker, a destroyed body ejects the pilot; direct fire draws a counter at −15 to hit; mortars fire over walls when an ally sees the target (+20 with a sensor spotter); salvage from kills feeds a hangar where parts swap between walkers with weight against power.
- Level 1: voiced briefing, the Marrow Yard battle (4 Lanterns vs 5 Directorate walkers), debrief, hangar, a contract 2 stub.

## 2. Owner decisions (do not re-ask)
See `PLAN.md` D1-D9 (2026-11-24): new repo the owner creates; walkers as modular part kits in code; concept 02 and 06 locked; side phases with part damage; level 1 = briefing, battle, hangar; frugal spend; working title IRON BASIN; desktop and phone landscape.

## 3. Donor map
| Subsystem | Donor | Notes |
|---|---|---|
| Stack, configs, Playwright port pattern | ex-kom-calamity | Vite 8, React 19, three 0.187, R3F 9, zustand 5, TS 7 |
| Camera rig (rule 27) | ex-kom-calamity `CameraRig.tsx` | plus a close-up override for attacks |
| Engine contract, sim with invariants, fuzz, bench both seats | KB recipe; ex-kom-calamity tools | written fresh against our own spec |
| Single-page Artifact build | ex-kom-calamity `make-artifact.mjs` | single-entry build; art and audio as supporting files |
| Everything else (part kits, presenter, grease-pencil HUD, hangar) | written fresh | |

## 4. Milestone log
| Milestone | Date | Notes |
|---|---|---|
| M0-M4 level 1 | 2026-11-24 | One session. 26 FLUX generations through Hugging Face (fal FLUX Krea and Kontext) plus 22 for concept run 1; about 5,800 ElevenLabs credits for 5 tracks, 28 sounds, 25 voice lines. Two Sonnet helpers (art, audio) ran in parallel with the engine. |

## 5. Lessons (candidates for `gotchas.md`)
- *(added 2026-11-24, iron-basin)* **Cloud session image route:** HF's `hf-inference` FLUX.1-schnell is deprecated (410); `router.huggingface.co/fal-ai/fal-ai/flux/krea` with `sync_mode: true` returns a data URI; `fal-ai/flux-kontext/dev` edits from a reference image. For a machine design, generate one approved design sheet, then place it into every multi-machine scene with Kontext: plain text-to-image drifted to armless hulls on legs whenever a scene held several machines.
- *(added 2026-11-24, iron-basin)* **Face read:** a dark hatch plus a lens on a headless hull reads as a face; paint the hatch in the hull colour and move the lens off-centre.
- *(added 2026-11-24, iron-basin)* **Counter-fire balance:** with a free full-strength counter on every attack, the outnumbered side lost even to a random AI; a reaction-fire penalty (−15) fixed most of it (sim table in `docs/spec/80-sim.md`).
- *(added 2026-11-24, iron-basin)* **zustand selector:** returning a fresh object from a `useStore` selector loops React ("getSnapshot should be cached"); select primitives or the stored object.
- *(added 2026-11-24, iron-basin)* **Node fetch through the cloud proxy** needs `NODE_USE_ENV_PROXY=1` (ElevenLabs generator).
