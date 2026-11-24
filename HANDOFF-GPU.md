# HANDOFF-GPU: recast the voices on EVILAEGIS

For a Claude Code session **on EVILAEGIS** (the owner's GPU PC). The cloud session that built level 1 could not reach this machine. Owner, 2026-11-24: "I wasn't super happy with the voices", then "Can we do all of that on evilaegis?". Goal: replace the 26 stock-voice ElevenLabs lines with a designed cast from the local Audio Studio (Qwen3-TTS). This costs no ElevenLabs credits; see `docs/spec/60-audio.md` "Credit use".

**Rules that apply** (3d-game-generation `rules.md`): announce GPU work before starting and run one GPU job at a time (10); judge audio by ear on `sounds.html` and write "not verified by ear" until the owner has listened (9); stop the studio services when done (17); never kill node by image name; credit evilgouki and grep the staged diff for the real name and home path before committing (11).

## 0. Get the repo
```
cd "C:/Claude Code Projects"
git clone https://github.com/dragoonant/iron-basin   # or: cd iron-basin && git pull
cd iron-basin && npm install
```

## 1. Start the Audio Studio
Per 3d-game-generation `local-ai-studios.md` and tabletop-kb `local-ai-studios.md`: the studio is in `C:/Claude Code Projects/3D Model Generation/audio-studio` (worktree branch `claude/ai-audio-generation-packages-2714d8`). It needs ComfyUI on 8188. Start it with `node server.js`, detached, with its PID recorded in `%TEMP%/audio-studio.pid`. Then check it:
```
node tools/audio/local-voices.mjs status
```

## 2. Cast: three designed candidates per character
```
node tools/audio/local-voices.mjs cast
```
This writes 18 files to `public/audio/voice-cast/` (about 8 s of GPU each) and lists them on the sound desk under "Voice casting". The voice descriptions and sample lines are in `tools/audio/cast.json` (Aske, Marlow, Okonjo, Varga, Haldane, Hallen).

**Ask the owner to pick** one candidate per character: `npm run dev`, then open `/sounds.html`. Use the multiple-choice UI, one question per character with three options. Write each answer into `"pick"` in `cast.json`. If the owner is away, keep the default (`pick: 1`) and carry on (rule 20). To try a character again, change its `instruct` or `seeds` and run `cast --force --only MARLOW`.

## 3. Lines: clone every line from the picked voice
```
node tools/audio/local-voices.mjs lines
node tools/audio/local-voices.mjs index
```
`lines` makes `public/audio/voice/<id>.wav` for all 26 lines with `qwen-clone`, using the pick as the reference, so each character keeps one timbre. `index` levels every take to −1 dBFS peak through its `gain` and points `public/audio/index.json` at the `.wav` files. The old `.mp3` takes stay in git as the fallback. To redo one line: `lines --force --only varga-attack`, then `index`.

## 4. Check, stop, ship
1. Listen to the voice section on `/sounds.html` and the briefing in the game. Record what you heard in `docs/spec/60-audio.md` under a new "Local recast" heading (voices, picks, seeds, any rerolls). Keep the "not verified by ear" line until the owner says otherwise.
2. Gates: `npm run typecheck`, `npm test`, `npm run build`, `npm run e2e -- e2e/sound.spec.ts e2e/smoke.spec.ts`.
3. **Stop the studio** by its recorded PID, and ComfyUI if this session started it (rule 17).
4. Commit `Voices: local Qwen recast of the 26 lines` with the session's attribution lines, and push to `main`.
5. Republish the playable: run `npm run artifact`, then publish `dist-artifact/iron-basin.html` to the existing Artifact https://claude.ai/artifact/FnZ6XXpAdyCX4HgsU2pRFR, with the supporting files listed in `dist-artifact/files.json`.

## Later, the same way (optional)
Music and sound effects can come from the same studio: ACE-Step for music, about 10 s per 120 s track, and Stable Audio Open for effects. Music was 66% of IRON BASIN's ElevenLabs spend, so contract 2's tracks are the next candidates to generate locally.
