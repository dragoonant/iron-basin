// Recast IRON BASIN's voices on the local Audio Studio (EVILAEGIS, port 7890): no ElevenLabs credits.
//   node tools/audio/local-voices.mjs status          is the studio up?
//   node tools/audio/local-voices.mjs cast            3 designed candidates per character -> public/audio/voice-cast/
//   node tools/audio/local-voices.mjs lines           every line cloned from each character's pick -> public/audio/voice/<id>.wav
//   node tools/audio/local-voices.mjs index           level the takes and point public/audio/index.json at them
// Flags: --force (remake existing files), --only <CHAR|line-id>. One GPU job at a time (KB rule 10). Idempotent.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const STUDIO = process.env.AUDIO_STUDIO ?? 'http://localhost:7890';
const args = process.argv.slice(2);
const stage = args[0] ?? 'status';
const force = args.includes('--force');
const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : null;
const cast = JSON.parse(readFileSync('tools/audio/cast.json', 'utf8'));
const INDEX = 'public/audio/index.json';
const index = JSON.parse(readFileSync(INDEX, 'utf8'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function job(params) {
  const r = await fetch(`${STUDIO}/api/jobs`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(params) });
  if (!r.ok) throw new Error(`studio refused the job: ${r.status} ${await r.text()}`);
  const { id } = await r.json();
  for (let i = 0; i < 600; i++) {
    await sleep(1000);
    const j = await (await fetch(`${STUDIO}/api/jobs/${id}`)).json();
    if (j.status === 'done' || j.status === 'completed') {
      const file = (j.audios ?? j.files ?? ['voice.wav'])[0];
      const name = typeof file === 'string' ? file.split('/').pop() : file.file ?? 'voice.wav';
      return Buffer.from(await (await fetch(`${STUDIO}/files/${id}/${name}`)).arrayBuffer());
    }
    if (j.status === 'failed' || j.status === 'error' || j.status === 'cancelled') throw new Error(`job ${id} ${j.status}: ${JSON.stringify(j.log ?? j.error ?? '').slice(0, 300)}`);
  }
  throw new Error(`job ${id} timed out`);
}

/** Peak and duration of a PCM16 or float32 WAV. */
function wavInfo(buf) {
  let p = 12, fmt = 1, ch = 1, rate = 24000, bits = 16, data = null;
  while (p + 8 <= buf.length) {
    const id = buf.toString('ascii', p, p + 4), size = buf.readUInt32LE(p + 4);
    if (id === 'fmt ') { fmt = buf.readUInt16LE(p + 8); ch = buf.readUInt16LE(p + 10); rate = buf.readUInt32LE(p + 12); bits = buf.readUInt16LE(p + 22); }
    if (id === 'data') { data = buf.subarray(p + 8, p + 8 + size); break; }
    p += 8 + size + (size % 2);
  }
  if (!data) return { peak: 1, seconds: 0 };
  let peak = 0; const step = bits / 8, n = Math.floor(data.length / step);
  for (let i = 0; i < n; i++) { const v = fmt === 3 ? Math.abs(data.readFloatLE(i * 4)) : Math.abs(data.readInt16LE(i * 2)) / 32768; if (v > peak) peak = v; }
  return { peak: peak || 1, seconds: n / ch / rate };
}

async function status() {
  try { const s = await (await fetch(`${STUDIO}/api/status`)).json(); console.log('Audio Studio is up:', JSON.stringify(s).slice(0, 300)); return true; }
  catch { console.log(`Audio Studio is not answering at ${STUDIO}. Start it (KB local-ai-studios.md: node server.js in the audio-studio folder, record the PID), then rerun.`); return false; }
}

async function castStage() {
  mkdirSync('public/audio/voice-cast', { recursive: true });
  index.cast = index.cast ?? {};
  for (const [who, c] of Object.entries(cast)) {
    if (who.startsWith('_') || (only && only !== who)) continue;
    for (let k = 0; k < c.seeds.length; k++) {
      const file = `audio/voice-cast/${who.toLowerCase()}-${k + 1}.wav`;
      if (!force && existsSync(`public/${file}`)) { console.log('skip', file); continue; }
      const wav = await job({ mode: 'voice', model: 'qwen-design', text: c.sample, instruct: c.instruct, language: 'English', seed: c.seeds[k] });
      writeFileSync(`public/${file}`, wav);
      const { peak, seconds } = wavInfo(wav);
      index.cast[`${who}-${k + 1}`] = { file, gain: +Math.min(4, 0.89 / peak).toFixed(3), seconds: +seconds.toFixed(2), speaker: who, text: c.sample };
      console.log('made', file, `${seconds.toFixed(1)} s`);
      writeFileSync(INDEX, JSON.stringify(index, null, 2));
    }
  }
}

async function linesStage() {
  for (const [id, v] of Object.entries(index.voice)) {
    if (only && only !== id && only !== v.speaker) continue;
    const c = cast[v.speaker];
    if (!c) { console.log('no casting for', v.speaker); continue; }
    const out = `audio/voice/${id}.wav`;
    if (!force && existsSync(`public/${out}`)) { console.log('skip', out); continue; }
    const ref = `public/audio/voice-cast/${v.speaker.toLowerCase()}-${c.pick}.wav`;
    if (!existsSync(ref)) throw new Error(`run the cast stage first: ${ref} is missing`);
    const wav = await job({ mode: 'voice', model: 'qwen-clone', text: v.text, language: 'English', refText: c.sample, ref: `data:audio/wav;base64,${readFileSync(ref).toString('base64')}`, seed: c.seeds[c.pick - 1] });
    writeFileSync(`public/${out}`, wav);
    console.log('made', out);
  }
}

function indexStage() {
  for (const [id, v] of Object.entries(index.voice)) {
    const wav = `audio/voice/${id}.wav`;
    if (!existsSync(`public/${wav}`)) continue;
    const { peak, seconds } = wavInfo(readFileSync(`public/${wav}`));
    index.voice[id] = { ...v, file: wav, gain: +Math.min(4, 0.89 / peak).toFixed(3), seconds: +seconds.toFixed(2), source: 'local qwen-clone' };
  }
  writeFileSync(INDEX, JSON.stringify(index, null, 2));
  console.log('index updated: voice lines now point at the local takes (the ElevenLabs .mp3 files stay as a fallback in git)');
}

if (stage === 'status') await status();
else if (!(await status())) process.exit(2);
else if (stage === 'cast') await castStage();
else if (stage === 'lines') await linesStage();
else if (stage === 'index') indexStage();
else { console.log('stages: status | cast | lines | index'); process.exit(1); }
