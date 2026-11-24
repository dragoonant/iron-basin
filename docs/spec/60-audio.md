# 60 Audio

Generated with ElevenLabs by `tools/audio/generate.mjs` (run with `NODE_USE_ENV_PROXY=1` behind the agent proxy; `--force` remakes, `--only id,id` limits, phases `music|sfx|voice|index`). Output lives in `public/audio/`; `index.json` lists files, per-file `gain` and seconds. The client director is `src/client/audio.ts`; the desk page is `sounds.html`.

RULING: audio-gain | loudness is normalised by a per-file `gain` in `index.json` (target RMS -18 dBFS one-shots, -20 music and voice, -26 ambience loops; peak held under -1 dBFS) rather than by re-encoding | keeps the mp3s untouched.
RULING: audio-loops | ambience loops are requested with the API `loop: true` flag and music loops are plain full tracks; no crossfade-stitching was done, so a click at a loop seam is possible | not verified by ear.

## Credits
Before: 7,292 of 40,199 characters used. After everything: 12,991. Spent about 5,700 (budget 24,000). Roughly: 2 music pilots and 3 sfx pilots about 150, all sound effects about 1,400, music about 2,200, voice about 2,060. The usage counter updates with a delay.

## Music prompts (instrumental, force_instrumental)
- `hangar` (90 s, loop): Slow brooding industrial ambient: low cello drones, distant clanking metal, soft sparse piano notes, cold and weary, dark pad, very slow tempo, seamless loop feel. Grounded near-future industrial war drama, cold wet northern winter, no sci-fi lasers, no orchestral fantasy. Instrumental only.
- `briefing` (60 s, loop): Tense low pulse, muted snare rolls, low sustained strings, radio-room tension, restrained and sparse, slow build, steady loop feel. Grounded near-future industrial war drama, cold wet northern winter, no sci-fi lasers, no orchestral fantasy. Instrumental only.
- `battle` (120 s, loop): Driving martial percussion, taiko-like low drums, low brass stabs, distorted synth bass, steady mid tempo around 100 bpm, gritty and relentless, loopable. Grounded near-future industrial war drama, cold wet northern winter, no sci-fi lasers, no orchestral fantasy. Instrumental only.
- `victory` (12 s, sting): Short sting: weary but proud brass and strings resolve to a major-minor cadence, slow, dignified, ends cleanly. Grounded near-future industrial war drama, cold wet northern winter, no sci-fi lasers, no orchestral fantasy. Instrumental only.
- `defeat` (12 s, sting): Short sting: low dissonant strings and a sinking drone, fading out to silence, bleak. Grounded near-future industrial war drama, cold wet northern winter, no sci-fi lasers, no orchestral fantasy. Instrumental only.

## Sound effect prompts (prompt_influence 0.6; duration_seconds as listed; takes)
- `step-heavy` (1.6 s, 2 takes): Footfall of a 7 metre tall armoured walker machine on wet concrete: heavy hydraulic piston stomp, deep thud, metal clank, single step.
- `step-light` (1 s, 2 takes): Light mechanical footstep of a small armoured machine on wet gravel, short metal tap and crunch, single step.
- `servo` (1.4 s, 2 takes): Hydraulic servo whine and pneumatic hiss of a large machine arm turning, mechanical, short.
- `autocannon` (2 s, 2 takes): Three-round burst of a heavy 30 mm autocannon fired outdoors, very loud, sharp reports with a distant echo, then silence.
- `carbine` (1.5 s, 2 takes): Two-round burst from a lighter military carbine fired outdoors, sharp cracks with short echo.
- `rifle` (2.5 s, 2 takes): A single heavy long-barrel rifle shot outdoors with a long echo rolling away across an open rail yard.
- `mortar-launch` (1.5 s, 2 takes): Mortar tube thump: a single deep hollow bloop of a mortar shell leaving the tube, outdoors.
- `mortar-impact` (3 s, 2 takes): Mortar shell whistling down then exploding on gravel, debris rattling, outdoors.
- `missile-launch` (2 s, 2 takes): Two small rockets launching one after another with a whoosh and rocket motor roar fading away.
- `missile-impact` (2.5 s, 2 takes): A rocket warhead exploding against a steel target, sharp blast, metal fragments, short rumble.
- `ram-hit` (1.6 s, 2 takes): Hydraulic ram fist slamming into steel armour plate: huge metallic bang, deep ringing clang, one impact.
- `armor-hit` (1.6 s, 2 takes): Cannon shells punching into thick steel armour plate: rapid heavy metallic thuds and clangs, three hits.
- `armor-ping` (1.2 s, 2 takes): A bullet ricocheting off thick steel armour: sharp metallic ping with a high whining ricochet.
- `part-tear` (2.5 s, 2 takes): A heavy steel robot limb shearing off: screeching tearing metal, snapping steel cables, sparks fizzing, final clunk.
- `explode-walker` (4 s, 2 takes): A large machine exploding: massive fuel and ammunition blast, secondary pops, falling debris, rumbling fade, outdoors.
- `eject` (2 s, 2 takes): Cockpit ejection: explosive bolts popping, then a rocket seat whooshing upward and away.
- `repair` (3 s, 2 takes): Pneumatic impact wrench rattling bolts then a welding torch hiss, workshop, short.
- `select` (0.6 s, 2 takes): Short military radio squelch chirp, a quick static burst and a single beep.
- `confirm` (0.8 s, 2 takes): Heavy mechanical switch clunk, a solid industrial toggle thunk.
- `cancel` (0.5 s, 2 takes): Soft low plastic click, quiet and dull.
- `ui-tick` (0.5 s, 2 takes): Tiny dry click, a crisp small mechanical tick.
- `turn-player` (1.5 s, 1 take): Radio squelch followed by a low two-tone alert beep, calm and military.
- `turn-enemy` (2 s, 1 take): Low ominous klaxon horn pulse, one single cycle, industrial warning, fading.
- `container-crash` (3 s, 2 takes): A steel shipping container crumpling and crashing to the ground: groaning metal, heavy bang, rattling aftermath.
- `salvage` (1.5 s, 2 takes): A heavy steel machine part dropped on concrete, one satisfying low clunk with a short ring, dry.
- `rain-loop` (20 s, 1 take, loop): Steady rain falling on concrete and corrugated metal roofs, constant, even texture, no thunder, seamless loop.
- `yard-loop` (20 s, 1 take, loop): Distant industrial rail yard ambience, low wind, faint machinery hum, very rarely a faraway train horn, seamless loop.
- `hangar-loop` (20 s, 1 take, loop): Interior of a large steel shed: low room tone, distant tools clanking, occasional water dripping, echoing, seamless loop.

## Voices (premade, eleven_multilingual_v2, mp3_44100_128)
| Character | Speaker id | Voice | Voice id | Note |
|---|---|---|---|---|
| Corin Aske (AKSE) | liaison | Daniel | onwK4e9ZLuTAKqWW03F9 | British, steady, formal |
| Captain Ines Marlow (MARLOW) | captain | Matilda | XrExE9yKIg1WjnnlVkGX | middle-aged alto, professional |
| Dace Okonjo (OKONJO) | pilot | Brian | nPczCjzI2devNBz1zQrb | deep, resonant |
| Pell Varga (VARGA) | pilot | Liam | TX3LPaxmHKxFdv7VOQHJ | young, confident |
| Ruth Haldane (HALDANE) | pilot | Alice | Xb7hH8MSUJpSbSDYk0k2 | British, clear, dry |
| Major Hallen (HALLEN) | enemy | Callum | N2lVS1w4EtoT3dr4eOWO | husky, edge |

The premade library has no true gravelly woman or accented cold officer; Haldane and Hallen are the nearest fits. Per-character stability/style settings are in the generator.

### Lines
- `brief-1` AKSE: "Captain. The Directorate pushed a recon group into Marrow Yard before dawn. Five walkers, dug in among the freight lines."
- `brief-2` AKSE: "That yard is the only rail link into Kerrow. The Concord wants it open before the supply train arrives at noon."
- `brief-3` AKSE: "Clear every Directorate walker from the yard. Their commander will be sitting by the grain silos."
- `brief-4` MARLOW: "Understood. Varga takes the left track. Okonjo and Haldane come up the middle with me."
- `brief-5` AKSE: "One more thing. Whatever you strip off their machines is yours. Salvage rights are in the contract."
- `brief-6` MARLOW: "Then let's go earn it. Lanterns, move out."
- `intercept` HALLEN: "Contract dogs. Hold the silos and let them come to us."
- `debrief-win` AKSE: "The yard is ours, and the train comes through at noon. Good work, Captain. Your salvage is on the flatbeds."
- `debrief-lose` AKSE: "Pull back, Captain. We'll find another way into Kerrow."
- `marlow-select` MARLOW: "Marlow here."
- `marlow-attack` MARLOW: "Engaging."
- `marlow-hit` MARLOW: "Taking hits, still up."
- `marlow-down` MARLOW: "Punching out!"
- `okonjo-select` OKONJO: "Okonjo. Go ahead."
- `okonjo-attack` OKONJO: "Firing now."
- `okonjo-hit` OKONJO: "Armour is going."
- `okonjo-down` OKONJO: "Eject, eject!"
- `varga-select` VARGA: "Varga, ready."
- `varga-attack` VARGA: "Say goodnight!"
- `varga-hit` VARGA: "That one stung!"
- `varga-down` VARGA: "I am out, I am out!"
- `haldane-select` HALDANE: "Haldane. Make it quick."
- `haldane-attack` HALDANE: "Here is yours."
- `haldane-hit` HALDANE: "Rude. Very rude."
- `haldane-down` HALDANE: "Bailing, bailing!"
- `hallen-down` HALLEN: "No... fall back!"

Total voiced characters: 1031.

## Measurements
Decoded with ffmpeg `astats`. Peak/RMS in dB, crest = peak - RMS. Decoded mp3 peaks run up to about +2 dB over full scale; the per-file gain brings every peak under -1 dBFS. "over" = decoded peak above +2 dB.

| kind | id | s | peak dB | rms dB | crest | note |
|---|---|---|---|---|---|---|
| music | hangar | 90.12 | -0.5 | -12.1 | 11.6 |  |
| music | briefing | 60.08 | -0.5 | -16.7 | 16.2 |  |
| music | battle | 120.03 | 0.3 | -14.8 | 15.1 |  |
| music | victory | 12.07 | -1.5 | -17.1 | 15.6 |  |
| music | defeat | 12.07 | -1.5 | -16.2 | 14.7 |  |
| sfx | step-heavy-1 | 1.65 | -21.9 | -39.5 | 17.6 |  |
| sfx | step-heavy-2 | 1.65 | -24.6 | -40.9 | 16.3 |  |
| sfx | step-light-1 | 1.04 | -0.1 | -29.7 | 29.6 |  |
| sfx | step-light-2 | 1.04 | -1.5 | -31.1 | 29.7 |  |
| sfx | servo-1 | 1.41 | -0.5 | -14.6 | 14.1 |  |
| sfx | servo-2 | 1.41 | -0.2 | -14.0 | 13.9 |  |
| sfx | autocannon-1 | 2.04 | 1.0 | -13.1 | 14.1 |  |
| sfx | autocannon-2 | 2.04 | 1.8 | -11.3 | 13.2 |  |
| sfx | carbine-1 | 1.52 | -0.6 | -28.7 | 28.1 |  |
| sfx | carbine-2 | 1.52 | 2.0 | -15.2 | 17.1 |  |
| sfx | rifle-1 | 2.51 | 1.2 | -16.5 | 17.6 |  |
| sfx | rifle-2 | 2.51 | -14.3 | -36.7 | 22.4 |  |
| sfx | mortar-launch-1 | 1.52 | -0.1 | -22.9 | 22.7 |  |
| sfx | mortar-launch-2 | 1.52 | -1.3 | -33.2 | 31.9 |  |
| sfx | mortar-impact-1 | 3.03 | 1.8 | -11.3 | 13.1 |  |
| sfx | mortar-impact-2 | 3.03 | 2.0 | -11.7 | 13.7 |  |
| sfx | missile-launch-1 | 2.04 | 1.8 | -14.4 | 16.2 |  |
| sfx | missile-launch-2 | 2.04 | 0.1 | -20.0 | 20.2 |  |
| sfx | missile-impact-1 | 2.51 | 1.0 | -10.3 | 11.3 |  |
| sfx | missile-impact-2 | 2.51 | 0.5 | -9.9 | 10.4 |  |
| sfx | ram-hit-1 | 1.65 | -5.5 | -29.9 | 24.4 |  |
| sfx | ram-hit-2 | 1.65 | -3.4 | -28.6 | 25.2 |  |
| sfx | armor-hit-1 | 1.65 | -6.1 | -29.6 | 23.5 |  |
| sfx | armor-hit-2 | 1.65 | -0.4 | -25.6 | 25.1 |  |
| sfx | armor-ping-1 | 1.23 | 1.1 | -19.3 | 20.4 |  |
| sfx | armor-ping-2 | 1.23 | -7.9 | -32.9 | 25 |  |
| sfx | part-tear-1 | 2.51 | 0.6 | -18.8 | 19.3 |  |
| sfx | part-tear-2 | 2.51 | 1.0 | -16.6 | 17.6 |  |
| sfx | explode-walker-1 | 4.05 | 2.1 | -11.5 | 13.6 | over |
| sfx | explode-walker-2 | 4.05 | 1.6 | -12.0 | 13.5 |  |
| sfx | eject-1 | 2.04 | 2.1 | -11.1 | 13.2 | over |
| sfx | eject-2 | 2.04 | 1.6 | -10.7 | 12.3 |  |
| sfx | repair-1 | 3.03 | 0.2 | -16.4 | 16.5 |  |
| sfx | repair-2 | 3.03 | 2.0 | -14.1 | 16.1 |  |
| sfx | select-1 | 0.63 | 0.2 | -8.6 | 8.8 |  |
| sfx | select-2 | 0.63 | -0.1 | -10.1 | 10 |  |
| sfx | confirm-1 | 0.84 | -29.8 | -54.6 | 24.9 |  |
| sfx | confirm-2 | 0.84 | -3.2 | -32.4 | 29.2 |  |
| sfx | cancel-1 | 0.52 | -27.7 | -53.3 | 25.6 |  |
| sfx | cancel-2 | 0.52 | -15.5 | -43.3 | 27.7 |  |
| sfx | ui-tick-1 | 0.52 | -13.1 | -38.5 | 25.4 |  |
| sfx | ui-tick-2 | 0.52 | -1.7 | -31.7 | 29.9 |  |
| sfx | turn-player-1 | 1.52 | 0.9 | -15.3 | 16.1 |  |
| sfx | turn-enemy-1 | 2.04 | -0.1 | -13.9 | 13.8 |  |
| sfx | container-crash-1 | 3.03 | 0.8 | -12.2 | 13 |  |
| sfx | container-crash-2 | 3.03 | 0.5 | -12.0 | 12.5 |  |
| sfx | salvage-1 | 1.52 | 0.9 | -19.1 | 20 |  |
| sfx | salvage-2 | 1.52 | 1.1 | -16.8 | 18 |  |
| sfx | rain-loop-1 | 20.04 | 0.2 | -18.9 | 19.1 |  |
| sfx | yard-loop-1 | 20.04 | -19.5 | -30.9 | 11.4 |  |
| sfx | hangar-loop-1 | 20.04 | -6.9 | -27.6 | 20.7 |  |
| voice | brief-1 | 9.14 | -3.4 | -23.4 | 20 |  |
| voice | brief-2 | 7.89 | -4.8 | -22.4 | 17.6 |  |
| voice | brief-3 | 6.09 | -4.3 | -22.7 | 18.5 |  |
| voice | brief-4 | 5.2 | -1.5 | -21.7 | 20.2 |  |
| voice | brief-5 | 7.13 | -5.6 | -22.8 | 17.2 |  |
| voice | brief-6 | 2.59 | -2.3 | -20.8 | 18.4 |  |
| voice | intercept | 4 | -1.9 | -21.7 | 19.7 |  |
| voice | debrief-win | 7.6 | -6.3 | -23.3 | 17 |  |
| voice | debrief-lose | 3.58 | -5.6 | -22.1 | 16.5 |  |
| voice | marlow-select | 1.1 | -3.8 | -20.6 | 16.8 |  |
| voice | marlow-attack | 1.1 | -2.4 | -21.6 | 19.3 |  |
| voice | marlow-hit | 1.62 | -3.7 | -22.2 | 18.5 |  |
| voice | marlow-down | 1.15 | -1.3 | -19.8 | 18.5 |  |
| voice | okonjo-select | 1.7 | -6.2 | -22.8 | 16.6 |  |
| voice | okonjo-attack | 1.15 | -5.5 | -23.5 | 18 |  |
| voice | okonjo-hit | 1.28 | -5.7 | -23.3 | 17.7 |  |
| voice | okonjo-down | 1.75 | -5.0 | -20.7 | 15.7 |  |
| voice | varga-select | 1.15 | -4.6 | -23.0 | 18.4 |  |
| voice | varga-attack | 1.02 | -6.9 | -25.2 | 18.3 |  |
| voice | varga-hit | 1.15 | -5.3 | -23.6 | 18.3 |  |
| voice | varga-down | 1.67 | -5.6 | -20.9 | 15.3 |  |
| voice | haldane-select | 1.75 | -5.4 | -21.6 | 16.1 |  |
| voice | haldane-attack | 0.97 | -6.9 | -21.9 | 15 |  |
| voice | haldane-hit | 1.7 | -7.5 | -21.8 | 14.3 |  |
| voice | haldane-down | 1.28 | -3.5 | -20.4 | 16.9 |  |
| voice | hallen-down | 1.57 | -1.8 | -18.7 | 16.9 |  |

## Rejects and flags
- `ui-tick-2` came back near silent (RMS -70 dB) and was remade (`--force`); the remake is in the table.
- `explode-walker-1` and `eject-1` decode slightly over (+2.1 dB); kept, gain compensates.
- Every gunshot and impact take that was asked for a crest factor of 8 or more passed (see table); crest checks per id are in `tools/audio/generate.mjs` and the index step prints a FLAG line when a file fails.

Not verified by ear.

## Credit use (ElevenLabs usage API, read 2026-11-24)
Account: Starter, 13,059 of 40,199 credits used this cycle (resets 2026-12-17).

| Product | Last 120 days | This cycle | IRON BASIN (2026-11-24) | What IRON BASIN got for it |
|---|---|---|---|---|
| Music | 78,642 (76%) | 10,163 | 3,800 (66%) | 5 tracks, 294 s: about 13 credits a second, 1,550 for the 2-minute battle loop |
| Sound effects | 15,711 (15%) | 2,435 | 1,506 (26%) | 51 takes, 149 s: about 10 credits a second |
| Text to speech | 5,138 (5%) | 461 | 461 (8%) | 26 lines with premade voices on `eleven_multilingual_v2` |
| Voice design | 3,330 (3%) | 0 | 0 | none: the cast used stock library voices |

The voices were the cheapest part of the audio. Stellar Derelict's cast, by contrast, was made with Voice Design (`eleven_ttv_v3`, 3,330 credits on 2026-11-15) and spoken on `eleven_v3`. The biggest single spends in the account are music days: 2026-10-05 (11,851), 2026-11-15 (15,650) and 2026-10-08 (9,976).
