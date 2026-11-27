// IRON BASIN audio director: dependency-free Web Audio wrapper. Safe when AudioContext is missing (headless tests).

export type MusicId = 'hangar' | 'briefing' | 'battle' | 'victory' | 'defeat';

export interface AudioSettings { master: number; music: number; sfx: number; voice: number; muted: boolean }

export interface AudioDirector {
  load(baseUrl?: string): Promise<void>;
  unlock(): void;
  play(id: string, opts?: { gain?: number; rate?: number; pan?: number }): void;
  loop(id: string | null, fadeMs?: number): void;
  music(id: MusicId | null, fadeMs?: number): void;
  voice(id: string): Promise<void>;
  stopVoice(): void;
  settings(): AudioSettings;
  setSettings(p: Partial<AudioSettings>): void;
  readonly loaded: boolean;
  readonly events: string[];
}

interface Take { file: string; gain: number; seconds: number }
interface MusicEntry { file: string; gain: number; loop: boolean; seconds: number }
interface VoiceEntry { file: string; gain: number; seconds: number; speaker: string; text: string }
interface AudioIndex {
  music: Record<string, MusicEntry>;
  sfx: Record<string, Take[]>;
  voice: Record<string, VoiceEntry>;
}

const STORE_KEY = 'ib-audio';
const DEFAULTS: AudioSettings = { master: 0.8, music: 0.6, sfx: 0.9, voice: 1, muted: false };
const DUCK = 0.5;

type Ctor = typeof AudioContext;
function contextCtor(): Ctor | null {
  const g = globalThis as unknown as { AudioContext?: Ctor; webkitAudioContext?: Ctor };
  return g.AudioContext ?? g.webkitAudioContext ?? null;
}

function clamp01(n: number): number { return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0; }

class Director implements AudioDirector {
  loaded = false;
  readonly events: string[] = [];

  private index: AudioIndex | null = null;
  private base = '';
  private ctx: AudioContext | null = null;
  private busMaster: GainNode | null = null;
  private busMusic: GainNode | null = null;
  private busSfx: GainNode | null = null;
  private busVoice: GainNode | null = null;
  private duck: GainNode | null = null; // sits between music bus and master
  private buffers = new Map<string, Promise<AudioBuffer | null>>();
  private cfg: AudioSettings = { ...DEFAULTS };
  private recent = new Map<string, number[]>();
  private curMusic: { id: string; src: AudioBufferSourceNode; gain: GainNode } | null = null;
  private wantMusic: { id: MusicId; fade: number } | null = null;
  private curLoop: { id: string; src: AudioBufferSourceNode; gain: GainNode } | null = null;
  private wantLoop: { id: string; fade: number } | null = null;
  private curVoice: { src: AudioBufferSourceNode; done: () => void } | null = null;
  private voiceSeq = 0;

  constructor() {
    this.readSettings();
  }

  private log(s: string): void {
    this.events.push(s);
    if (this.events.length > 50) this.events.shift();
  }

  private readSettings(): void {
    try {
      const raw = globalThis.localStorage?.getItem(STORE_KEY);
      if (!raw) return;
      const p = JSON.parse(raw) as Partial<AudioSettings>;
      this.cfg = {
        master: typeof p.master === 'number' ? clamp01(p.master) : DEFAULTS.master,
        music: typeof p.music === 'number' ? clamp01(p.music) : DEFAULTS.music,
        sfx: typeof p.sfx === 'number' ? clamp01(p.sfx) : DEFAULTS.sfx,
        voice: typeof p.voice === 'number' ? clamp01(p.voice) : DEFAULTS.voice,
        muted: p.muted === true,
      };
    } catch { /* storage unavailable */ }
  }

  private writeSettings(): void {
    try { globalThis.localStorage?.setItem(STORE_KEY, JSON.stringify(this.cfg)); } catch { /* ignore */ }
  }

  settings(): AudioSettings { return { ...this.cfg }; }

  setSettings(p: Partial<AudioSettings>): void {
    const c = this.cfg;
    if (p.master !== undefined) c.master = clamp01(p.master);
    if (p.music !== undefined) c.music = clamp01(p.music);
    if (p.sfx !== undefined) c.sfx = clamp01(p.sfx);
    if (p.voice !== undefined) c.voice = clamp01(p.voice);
    if (p.muted !== undefined) c.muted = p.muted;
    this.applyBuses();
    this.writeSettings();
  }

  private applyBuses(): void {
    if (!this.ctx || !this.busMaster || !this.busMusic || !this.busSfx || !this.busVoice) return;
    const t = this.ctx.currentTime;
    this.busMaster.gain.setTargetAtTime(this.cfg.muted ? 0 : this.cfg.master, t, 0.02);
    this.busMusic.gain.setTargetAtTime(this.cfg.music, t, 0.02);
    this.busSfx.gain.setTargetAtTime(this.cfg.sfx, t, 0.02);
    this.busVoice.gain.setTargetAtTime(this.cfg.voice, t, 0.02);
  }

  private ensureContext(): AudioContext | null {
    if (this.ctx) return this.ctx;
    const Ctx = contextCtor();
    if (!Ctx) return null;
    try {
      const ctx = new Ctx();
      const master = ctx.createGain();
      const music = ctx.createGain();
      const sfx = ctx.createGain();
      const voice = ctx.createGain();
      const duck = ctx.createGain();
      music.connect(duck);
      duck.connect(master);
      sfx.connect(master);
      voice.connect(master);
      master.connect(ctx.destination);
      this.ctx = ctx;
      this.busMaster = master; this.busMusic = music; this.busSfx = sfx; this.busVoice = voice; this.duck = duck;
      this.applyBuses();
      return ctx;
    } catch (e) {
      console.warn('[audio] AudioContext unavailable', e);
      return null;
    }
  }

  async load(baseUrl = ''): Promise<void> {
    this.base = baseUrl;
    try {
      const res = await fetch(this.url('audio/index.json'));
      if (!res.ok) throw new Error(`index.json ${res.status}`);
      this.index = (await res.json()) as AudioIndex;
      this.loaded = true;
      this.log('load');
    } catch (e) {
      console.warn('[audio] index not loaded; staying silent', e);
      this.index = null;
      this.loaded = false;
      return;
    }
    if (this.ctx) this.preloadAll();
  }

  private url(rel: string): string {
    try {
      const b = this.base && !this.base.endsWith('/') ? this.base + '/' : this.base;
      return new URL(b + rel, globalThis.document?.baseURI ?? globalThis.location?.href).href;
    } catch {
      return this.base + rel;
    }
  }

  private preloadAll(): void {
    const idx = this.index;
    if (!idx) return;
    for (const m of Object.values(idx.music)) void this.buffer(m.file);
    for (const list of Object.values(idx.sfx)) for (const t of list) void this.buffer(t.file);
    for (const v of Object.values(idx.voice)) void this.buffer(v.file);
  }

  private buffer(file: string): Promise<AudioBuffer | null> {
    const hit = this.buffers.get(file);
    if (hit) return hit;
    const ctx = this.ctx;
    if (!ctx) return Promise.resolve(null);
    const p = (async (): Promise<AudioBuffer | null> => {
      try {
        const res = await fetch(this.url(file));
        if (!res.ok) throw new Error(`${file} ${res.status}`);
        return await ctx.decodeAudioData(await res.arrayBuffer());
      } catch (e) {
        console.warn('[audio] cannot load', file, e);
        return null;
      }
    })();
    this.buffers.set(file, p);
    return p;
  }

  unlock(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    try {
      if (ctx.state === 'suspended') void ctx.resume();
      // iOS: play a silent buffer inside the gesture.
      const b = ctx.createBuffer(1, 1, 22050);
      const s = ctx.createBufferSource();
      s.buffer = b;
      s.connect(ctx.destination);
      s.start(0);
    } catch { /* ignore */ }
    if (this.index) this.preloadAll();
    // Start anything requested before unlock.
    if (this.wantMusic) { const w = this.wantMusic; this.wantMusic = null; this.music(w.id, w.fade); }
    if (this.wantLoop) { const w = this.wantLoop; this.wantLoop = null; this.loop(w.id, w.fade); }
  }

  play(id: string, opts: { gain?: number; rate?: number; pan?: number } = {}): void {
    this.log(`play ${id}`);
    const takes = this.index?.sfx[id];
    const ctx = this.ctx;
    if (!takes || !takes.length || !ctx || !this.busSfx) return;
    const now = ctx.currentTime;
    const hist = (this.recent.get(id) ?? []).filter((t) => now - t < 0.1);
    if (hist.length >= 8) { this.recent.set(id, hist); return; }
    hist.push(now);
    this.recent.set(id, hist);
    const take = takes[Math.floor(Math.random() * takes.length)] as Take;
    const bus = this.busSfx;
    void this.buffer(take.file).then((buf) => {
      if (!buf) return;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.playbackRate.value = opts.rate ?? 1 + (Math.random() * 2 - 1) * 0.04;
      const g = ctx.createGain();
      g.gain.value = take.gain * (opts.gain ?? 1);
      let tail: AudioNode = g;
      src.connect(g);
      if (opts.pan !== undefined && typeof ctx.createStereoPanner === 'function') {
        const p = ctx.createStereoPanner();
        p.pan.value = Math.max(-1, Math.min(1, opts.pan));
        g.connect(p);
        tail = p;
      }
      tail.connect(bus);
      src.start();
    });
  }

  private fadeOut(cur: { src: AudioBufferSourceNode; gain: GainNode }, ms: number): void {
    const ctx = this.ctx;
    if (!ctx || !cur.src || !cur.gain) return; // still loading: the token check cancels it
    const t = ctx.currentTime;
    cur.gain.gain.cancelScheduledValues(t);
    cur.gain.gain.setValueAtTime(cur.gain.gain.value, t);
    cur.gain.gain.linearRampToValueAtTime(0, t + ms / 1000);
    try { cur.src.stop(t + ms / 1000 + 0.05); } catch { /* already stopped */ }
  }

  private startLooped(file: string, gain: number, loop: boolean, bus: GainNode, fadeMs: number,
    assign: (cur: { id: string; src: AudioBufferSourceNode; gain: GainNode } | null) => void, id: string, token: () => boolean): void {
    const ctx = this.ctx;
    if (!ctx) return;
    void this.buffer(file).then((buf) => {
      if (!buf || !token()) return;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = loop;
      const g = ctx.createGain();
      const t = ctx.currentTime;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(gain, t + Math.max(0.01, fadeMs / 1000));
      src.connect(g);
      g.connect(bus);
      src.start();
      const cur = { id, src, gain: g };
      assign(cur);
      src.onended = () => { try { g.disconnect(); } catch { /* ignore */ } };
    });
  }

  loop(id: string | null, fadeMs = 800): void {
    this.log(`loop ${id ?? 'off'}`);
    if (this.curLoop && this.curLoop.id === id) return;
    if (!this.ctx) { this.wantLoop = id ? { id, fade: fadeMs } : null; return; }
    if (this.curLoop) { this.fadeOut(this.curLoop, fadeMs); this.curLoop = null; }
    this.wantLoop = null;
    if (!id || !this.busSfx) return;
    const take = this.index?.sfx[id]?.[0];
    if (!take) return;
    const placeholder = { id, src: null as unknown as AudioBufferSourceNode, gain: null as unknown as GainNode };
    this.curLoop = placeholder;
    this.startLooped(take.file, take.gain, true, this.busSfx, fadeMs, (c) => { if (c) this.curLoop = c; }, id,
      () => this.curLoop === placeholder);
  }

  music(id: MusicId | null, fadeMs = 1200): void {
    this.log(`music ${id ?? 'off'}`);
    if (this.curMusic && this.curMusic.id === id) return;
    if (!this.ctx) { this.wantMusic = id ? { id, fade: fadeMs } : null; return; }
    if (this.curMusic) {
      if (this.curMusic.src) this.fadeOut(this.curMusic, fadeMs);
      this.curMusic = null;
    }
    this.wantMusic = null;
    if (!id || !this.busMusic) return;
    const entry = this.index?.music[id];
    if (!entry) return;
    const placeholder = { id, src: null as unknown as AudioBufferSourceNode, gain: null as unknown as GainNode };
    this.curMusic = placeholder;
    this.startLooped(entry.file, entry.gain, entry.loop, this.busMusic, fadeMs, (c) => { if (c) this.curMusic = c; }, id,
      () => this.curMusic === placeholder);
  }

  private setDuck(on: boolean): void {
    if (!this.ctx || !this.duck) return;
    this.duck.gain.setTargetAtTime(on ? DUCK : 1, this.ctx.currentTime, 0.08);
  }

  voice(id: string): Promise<void> {
    this.log(`voice ${id}`);
    this.stopVoice();
    const entry = this.index?.voice[id];
    const ctx = this.ctx;
    // A line with no take yet (contract 2 until the recast, PLAN Q21) rejects, so a briefing waits for Next.
    if (this.index && !entry) return Promise.reject(new Error(`no voice take for ${id}`));
    if (!entry || !ctx || !this.busVoice) return Promise.resolve();
    const bus = this.busVoice;
    const seq = ++this.voiceSeq;
    return new Promise<void>((resolve) => {
      void this.buffer(entry.file).then((buf) => {
        if (!buf || seq !== this.voiceSeq) { resolve(); return; }
        const src = ctx.createBufferSource();
        src.buffer = buf;
        const g = ctx.createGain();
        g.gain.value = entry.gain;
        src.connect(g);
        g.connect(bus);
        let finished = false;
        const done = (): void => {
          if (finished) return;
          finished = true;
          if (seq === this.voiceSeq) { this.curVoice = null; this.setDuck(false); }
          try { g.disconnect(); } catch { /* ignore */ }
          resolve();
        };
        src.onended = done;
        this.curVoice = { src, done };
        this.setDuck(true);
        src.start();
      });
    });
  }

  stopVoice(): void {
    this.voiceSeq++;
    const v = this.curVoice;
    this.curVoice = null;
    if (v) {
      try { v.src.stop(); } catch { /* ignore */ }
      v.done();
    }
    this.setDuck(false);
  }
}

export const audio: AudioDirector = new Director();
