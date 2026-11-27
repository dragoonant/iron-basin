// One zustand store for the whole client. The engine state is `live`; what the board draws is `shown`, which the
// presenter advances event by event (separate presented state from live state: KB, Mallet 42k lessons).
import { create } from 'zustand';
import { chooseAction } from '../ai';
import { applyResult, currentMission, newCampaign, deployFrom, type Campaign } from '../engine/campaign';
import { MISSIONS } from '../engine/data';
import { dirTo, dist } from '../engine/grid';
import { reachable } from '../engine/grid';
import { canHitAny, dashRange, faceToward, fireBlock, maneuverBlock, modeIn, modes, pivotCost, shuntDir, unitById, walkRange } from '../engine/query';
import { legalActions, newBattle, step, view } from '../engine/step';
import type { Action, BattleState, Facing, GameEvent, HitSlot, WeaponSlot } from '../engine/types';
import { audio } from './audio';
import { readSave, writeSave, clearSave, type Envelope, type Screen as SaveScreen } from './save';

export type Screen = 'title' | 'briefing' | 'battle' | 'debrief' | 'hangar' | 'next';
export interface Batch { events: GameEvent[]; state: BattleState }
export interface Settings { closeups: boolean }

const SETTINGS_KEY = 'ib-settings';
function readSettings(): Settings {
  try { const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') as Partial<Settings>; return { closeups: s.closeups ?? true }; } catch { return { closeups: true }; }
}

export interface ClientState {
  screen: Screen;
  campaign: Campaign;
  /** The campaign as it stood when the current battle began (Retry restarts from it). */
  preBattle: Campaign | null;
  live: BattleState | null;
  shown: BattleState | null;
  seed: number;
  actions: Action[];
  queue: Batch[];
  presenting: boolean;
  selected: string | null;
  hover: { x: number; y: number } | null;
  target: string | null;
  targetObj: { x: number; y: number } | null;
  /** A tile or ally mode waiting for its tile tap: Smoke, Cover lane, Guard. */
  aim: { slot: WeaponSlot; mode: string } | null;
  /** A maneuver waiting for its tap: Dash (a tile) or Tow (an ally). */
  maneuverAim: string | null;
  feed: { text: string; side: 'player' | 'hostile' | 'note' }[];
  banner: { text: string; sub: string; until: number } | null;
  settings: Settings;
  saveError: string | null;
  menuOpen: boolean;
  aiDelay: number;
  clock: number;

  setScreen: (s: Screen) => void;
  newGame: () => void;
  continueGame: () => boolean;
  startBattle: () => void;
  dispatch: (a: Action) => boolean;
  tapTile: (x: number, y: number) => void;
  select: (id: string | null) => void;
  setHover: (p: { x: number; y: number } | null) => void;
  setTarget: (id: string | null) => void;
  fire: (slot: WeaponSlot, mode: string, part?: HitSlot) => void;
  fireObject: (slot: WeaponSlot, mode: string) => void;
  setAim: (aim: { slot: WeaponSlot; mode: string } | null) => void;
  setManeuverAim: (id: string | null) => void;
  maneuver: (id: string, extra?: { slot?: WeaponSlot; target?: string; x?: number; y?: number }) => boolean;
  face: (f: Facing) => void;
  finishBattle: () => void;
  retry: () => void;
  setCampaign: (c: Campaign) => void;
  setSettings: (p: Partial<Settings>) => void;
  note: (text: string, side?: 'player' | 'hostile' | 'note') => void;
  save: () => void;
}

export const useGame = create<ClientState>((set, get) => ({
  screen: 'title',
  campaign: newCampaign(),
  preBattle: null,
  live: null,
  shown: null,
  seed: 1,
  actions: [],
  queue: [],
  presenting: false,
  selected: null,
  hover: null,
  target: null,
  targetObj: null,
  aim: null,
  maneuverAim: null,
  feed: [],
  banner: null,
  settings: readSettings(),
  saveError: null,
  menuOpen: false,
  aiDelay: 0,
  clock: 0,

  setScreen: (screen) => { set({ screen, menuOpen: false }); get().save(); },
  newGame: () => {
    clearSave();
    set({ campaign: newCampaign(), preBattle: null, live: null, shown: null, actions: [], queue: [], feed: [], screen: 'briefing' });
    get().save();
  },
  continueGame: () => {
    const r = readSave();
    if (!r.ok) return false;
    const env = r.env;
    if (env.screen === 'battle' && env.battle) {
      set({ campaign: env.campaign, preBattle: env.campaign, live: env.battle.snapshot, shown: env.battle.snapshot, seed: env.battle.seed, actions: env.battle.actions, queue: [], presenting: false, screen: 'battle', selected: null, target: null, aim: null, maneuverAim: null, feed: [{ text: `Resumed: round ${env.battle.snapshot.round}.`, side: 'note' }] });
    } else set({ campaign: env.campaign, screen: env.screen, live: null, shown: null });
    return true;
  },
  startBattle: () => {
    const c = get().campaign;
    const seed = (Date.now() % 100000) + 1;
    const mid = currentMission(c);
    const b = newBattle(mid, seed, deployFrom(c));
    set({ preBattle: c, live: b, shown: b, seed, actions: [], queue: [], presenting: false, selected: null, target: null, targetObj: null, aim: null, maneuverAim: null, feed: [{ text: `${MISSIONS[mid]!.name}. Clear every Directorate walker.`, side: 'note' }], screen: 'battle', banner: { text: 'YOUR PHASE', sub: 'ROUND 1', until: get().clock + 1.6 } });
    audio.play('turn-player');
    get().save();
  },
  dispatch: (a) => {
    const { live } = get();
    if (!live || live.result) return false;
    const r = step(live, a);
    if (r.events[0]?.type === 'rejected') return false;
    set((st) => ({ live: r.state, actions: [...st.actions, a], queue: [...st.queue, { events: r.events, state: r.state }] }));
    get().save();
    return true;
  },
  select: (id) => {
    set({ selected: id, target: null, targetObj: null, aim: null, maneuverAim: null });
    const u = id ? get().live?.units.find((x) => x.id === id) : null;
    if (u && u.side === 'player') { audio.play('select'); void audio.voice(`${u.pilot}-select`).catch(() => {}); }
  },
  setHover: (p) => set({ hover: p }),
  setTarget: (id) => set({ target: id, targetObj: null, aim: null }),
  setAim: (aim) => set({ aim, maneuverAim: null, target: null, targetObj: null }),
  setManeuverAim: (id) => set({ maneuverAim: id, aim: null, target: null, targetObj: null }),
  maneuver: (id, extra = {}) => {
    const st = get();
    if (!st.selected) return false;
    const ok = st.dispatch({ type: 'maneuver', unit: st.selected, id, ...extra });
    if (ok) set({ target: null, targetObj: null, maneuverAim: null });
    return ok;
  },
  tapTile: (x, y) => {
    const st = get();
    const live = st.live;
    if (!live || live.result || st.presenting || st.queue.length || live.phase !== 'player') return;
    const here = live.units.find((u) => u.alive && u.x === x && u.y === y) ?? null;
    const sel = st.selected ? unitById(live, st.selected) : null;
    const mine = sel && sel.side === 'player' && sel.alive && !sel.done ? sel : null;
    // 0. A tile or ally mode waiting for its tap (Smoke, Cover lane, Guard).
    if (mine && st.aim) {
      const mi = modeIn(mine, st.aim.slot, st.aim.mode);
      if (here?.id === mine.id || !mi) { audio.play('cancel'); set({ aim: null }); return; }
      if (mi.mode.target === 'ally' && here && here.side === 'player') {
        if (st.dispatch({ type: 'fire', unit: mine.id, slot: st.aim.slot, mode: st.aim.mode, target: here.id })) { audio.play('confirm'); set({ aim: null }); }
        else { audio.play('cancel'); st.note(fireBlock(live, mine, st.aim.slot, st.aim.mode, here) ?? 'cannot guard there'); }
        return;
      }
      if (mi.mode.target === 'tile') {
        if (st.dispatch({ type: 'fireAt', unit: mine.id, slot: st.aim.slot, mode: st.aim.mode, x, y })) { audio.play('confirm'); set({ aim: null }); }
        else { audio.play('cancel'); st.note(mi.mode.effect === 'overwatch' ? 'A lane runs straight out from the walker, within range.' : 'Out of range or out of sight.'); }
        return;
      }
    }
    // 0b. A maneuver waiting for its tap: Dash to a tile, Tow an ally.
    if (mine && st.maneuverAim) {
      const id = st.maneuverAim;
      if (here?.id === mine.id) { audio.play('cancel'); set({ maneuverAim: null }); return; }
      if (id === 'ghost-step' && !here && !maneuverBlock(live, mine, id, null, null, { x, y })) { audio.play('confirm'); st.dispatch({ type: 'maneuver', unit: mine.id, id, x, y, facing: faceToward(live, mine, { x, y }) }); set({ maneuverAim: null }); return; }
      if (id === 'dash' && !here && dashRange(live, mine).some((t) => t.x === x && t.y === y)) { audio.play('confirm'); st.dispatch({ type: 'maneuver', unit: mine.id, id, x, y, facing: faceToward(live, mine, { x, y }) }); set({ maneuverAim: null }); return; }
      if (id === 'tow' && here && here.side === 'player') {
        const why = maneuverBlock(live, mine, 'tow', null, here, null);
        if (!why) { audio.play('confirm'); st.maneuver('tow', { target: here.id }); } else { audio.play('cancel'); st.note(why); }
        return;
      }
      audio.play('cancel'); st.note(id === 'dash' || id === 'ghost-step' ? 'Out of reach.' : 'Tap an adjacent ally.');
      return;
    }
    // 1. A walk for the selected walker, facing the threat (Face buttons change it).
    if (mine && !here && walkRange(live, mine).some((t) => t.x === x && t.y === y)) {
      audio.play('confirm');
      st.dispatch({ type: 'walk', unit: mine.id, x, y, facing: faceToward(live, mine, { x, y }) });
      return;
    }
    // 2. An enemy the selected walker can fire on: open the fire panel.
    if (mine && here && here.side === 'hostile' && canHitAny(live, mine, here)) { audio.play('ui-tick'); set({ target: here.id, targetObj: null }); return; }
    // 3. A breakable object in range of a firing mode.
    const tile = live.tiles[y * live.w + x];
    if (mine && !here && tile?.obj && ['wagon', 'container', 'shed', 'barrier'].includes(tile.obj)) {
      const d = dist(mine, { x, y });
      const can = shuntDir(live, mine, { x, y }) !== null || modes(mine).some((m) => m.weapon.usable && m.shots > 0 && !m.mode.target && m.cls !== 'indirect' && !mine.fired.includes(m.slot) && m.dp <= mine.drive && d >= m.min && d <= m.max);
      if (can) { audio.play('ui-tick'); set({ targetObj: { x, y }, target: null }); return; }
    }
    // 4. Otherwise select whatever stands there, or clear.
    if (here) st.select(here.id);
    else { if (st.selected) audio.play('cancel'); set({ selected: null, target: null, targetObj: null, aim: null, maneuverAim: null }); }
  },
  fire: (slot, mode, part) => {
    const st = get();
    if (!st.selected || !st.target) return;
    const u = st.live ? unitById(st.live, st.selected) : null;
    if (u?.side === 'player') void audio.voice(`${u.pilot}-attack`).catch(() => {});
    if (st.dispatch({ type: 'fire', unit: st.selected, slot, mode, target: st.target, ...(part ? { part } : {}) })) set({ target: null });
  },
  fireObject: (slot, mode) => {
    const st = get();
    if (!st.selected || !st.targetObj) return;
    if (st.dispatch({ type: 'fireAt', unit: st.selected, slot, mode, x: st.targetObj.x, y: st.targetObj.y })) set({ targetObj: null });
  },
  /** FAC-1: re-face for free while the last walk can still be taken back (undo, then the same walk); otherwise Pivot. */
  face: (f) => {
    const st = get();
    const live = st.live;
    const u = live && st.selected ? unitById(live, st.selected) : null;
    if (!live || !u || u.side !== 'player' || u.done || u.facing === f) return;
    const lw = u.lastWalk;
    if (lw && !lw.reacted) {
      const at = { x: u.x, y: u.y };
      if (st.dispatch({ type: 'undoWalk', unit: u.id })) { get().dispatch({ type: 'walk', unit: u.id, x: at.x, y: at.y, facing: f }); return; }
    }
    if (u.drive >= pivotCost()) st.dispatch({ type: 'pivot', unit: u.id, facing: f });
  },
  finishBattle: () => {
    const { live, campaign } = get();
    if (!live?.result) return;
    set({ campaign: applyResult(campaign, live), screen: 'debrief' });
    get().save();
  },
  retry: () => { const pre = get().preBattle; if (pre) set({ campaign: pre }); get().startBattle(); },
  setCampaign: (c) => { set({ campaign: c }); get().save(); },
  setSettings: (p) => { const s = { ...get().settings, ...p }; set({ settings: s }); try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch { /* refused storage */ } },
  note: (text, side = 'note') => set((st) => ({ feed: [...st.feed.slice(-40), { text, side }] })),
  save: () => {
    const st = get();
    if (st.screen === 'title') return;
    const screen: SaveScreen = st.screen === 'next' ? 'hangar' : st.screen;
    const env: Envelope = { v: 2, savedAt: Date.now(), screen, campaign: st.screen === 'battle' ? (st.preBattle ?? st.campaign) : st.campaign, battle: st.screen === 'battle' && st.live ? { seed: st.seed, actions: st.actions, snapshot: st.live } : null };
    if (st.screen === 'debrief' || st.screen === 'hangar' || st.screen === 'next') env.battle = null;
    set({ saveError: writeSave(env) });
  },
}));

/** The hostile side's next order, from its view only (ARCH-4). */
export function aiOrder(live: BattleState): Action {
  return chooseAction(view(live, 'hostile'), 'normal');
}

export function allDone(live: BattleState): boolean {
  return live.units.filter((u) => u.alive && u.side === 'player').every((u) => u.done);
}
/** Is a re-facing free right now (the last walk can be redone with the new facing)? */
export const freeFacing = (live: BattleState, id: string): boolean => { const u = unitById(live, id); return !!u?.lastWalk && !u.lastWalk.reacted; };
export { dirTo };
export { legalActions };
