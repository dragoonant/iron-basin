import { audio, type MusicId } from './client/audio';

interface IndexShape {
  music: Record<string, { file: string; gain: number; loop: boolean; seconds: number }>;
  sfx: Record<string, { file: string; gain: number; seconds: number }[]>;
  voice: Record<string, { file: string; gain: number; seconds: number; speaker: string; text: string }>;
  cast?: Record<string, { file: string; gain: number; seconds: number; speaker: string; text: string }>;
}

const main = document.getElementById('main') as HTMLElement;
const sliders = document.getElementById('sliders') as HTMLElement;
const status = document.getElementById('status') as HTMLElement;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function row(name: string, meta: string, onPlay: (b: HTMLButtonElement) => void, text?: string): HTMLElement {
  const r = el('div', 'row');
  const b = el('button', undefined, 'Play');
  b.addEventListener('click', () => { audio.unlock(); onPlay(b); });
  r.append(b, el('span', 'name', name), el('span', 'meta', meta));
  if (text) r.append(el('span', 'text', `"${text}"`));
  return r;
}

function section(title: string): HTMLElement {
  main.append(el('h2', undefined, title));
  const s = el('div');
  main.append(s);
  return s;
}

function buildSliders(): void {
  const s = audio.settings();
  const keys = ['master', 'music', 'sfx', 'voice'] as const;
  for (const k of keys) {
    const l = el('label', undefined, k);
    const i = el('input');
    i.type = 'range'; i.min = '0'; i.max = '1'; i.step = '0.01'; i.value = String(s[k]);
    i.addEventListener('input', () => audio.setSettings({ [k]: Number(i.value) }));
    l.append(i);
    sliders.append(l);
  }
  const m = el('label');
  const c = el('input');
  c.type = 'checkbox'; c.checked = s.muted;
  c.addEventListener('change', () => audio.setSettings({ muted: c.checked }));
  m.append(c, document.createTextNode('mute'));
  sliders.append(m);
}

async function build(): Promise<void> {
  buildSliders();
  await audio.load();
  let idx: IndexShape | null = null;
  try {
    const res = await fetch(new URL('audio/index.json', document.baseURI));
    idx = (await res.json()) as IndexShape;
  } catch { /* missing index */ }
  if (!idx) { status.textContent = 'audio/index.json not found'; return; }
  status.textContent = 'ready';
  const unlock = (): void => audio.unlock();
  document.addEventListener('pointerdown', unlock, { once: true });
  document.addEventListener('keydown', unlock, { once: true });

  const stop = el('button', undefined, 'Stop all');
  stop.addEventListener('click', () => { audio.music(null, 200); audio.loop(null, 200); audio.stopVoice(); });
  sliders.append(stop);

  const music = section('Music');
  for (const [id, m] of Object.entries(idx.music)) {
    music.append(row(id, `${m.seconds.toFixed(1)} s  gain ${m.gain}  ${m.loop ? 'loop' : 'sting'}`, () => audio.music(id as MusicId, 300)));
  }
  const sfx = section('Sound effects');
  for (const [id, takes] of Object.entries(idx.sfx)) {
    const meta = takes.map((t) => `${t.seconds.toFixed(1)} s`).join(' / ') + `  gain ${takes.map((t) => t.gain).join(' / ')}`;
    const isLoop = id.endsWith('-loop');
    sfx.append(row(id, meta, (b) => {
      if (isLoop) {
        const on = b.classList.toggle('on');
        b.textContent = on ? 'Stop' : 'Play';
        audio.loop(on ? id : null, 400);
      } else audio.play(id);
    }));
  }
  const voice = section('Voice');
  for (const [id, v] of Object.entries(idx.voice)) {
    voice.append(row(`${id}  (${v.speaker})`, `${v.seconds.toFixed(1)} s  gain ${v.gain}`, () => { void audio.voice(id); }, v.text));
  }
  // Voice casting candidates from the local Audio Studio (tools/audio/local-voices.mjs cast): pick one per character in tools/audio/cast.json.
  if (idx.cast && Object.keys(idx.cast).length) {
    const cast = section('Voice casting (pick one per character in tools/audio/cast.json)');
    for (const [id, v] of Object.entries(idx.cast)) {
      const player = new Audio(v.file);
      player.volume = Math.min(1, v.gain);
      cast.append(row(id, `${v.seconds.toFixed(1)} s`, () => { player.currentTime = 0; void player.play(); }, v.text));
    }
  }
}

void build();
