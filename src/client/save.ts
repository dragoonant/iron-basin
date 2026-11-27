// SAV-1, SAV-2 (KB rule 22): one versioned envelope under localStorage['ib-save']; the snapshot is what reopens.
// v2 (combat v2, spec 15): a v1 save taken mid-battle reopens at the briefing with the company as it stood before that
// battle, because its battle cannot be replayed under the new rules (PLAN Q17); other v1 saves open as they are.
import { currentMission, type Campaign } from '../engine/campaign';
import { MISSIONS } from '../engine/data';
import type { Action, BattleState } from '../engine/types';

export const SAVE_KEY = 'ib-save';
export type Screen = 'briefing' | 'battle' | 'debrief' | 'hangar';
export interface Envelope { v: 2; savedAt: number; screen: Screen; campaign: Campaign; battle: { seed: number; actions: Action[]; snapshot: BattleState } | null; note?: string }
export interface StorageLike { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void }

export type LoadResult = { ok: true; env: Envelope } | { ok: false; reason: string } | { ok: false; reason: 'none' };

function store(): StorageLike | null {
  try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; }
}

export function writeSave(env: Envelope, s: StorageLike | null = store()): string | null {
  if (!s) return 'This browser refuses storage, so the game cannot be saved.';
  try { s.setItem(SAVE_KEY, JSON.stringify(env)); return null; } catch (e) { return `The save could not be written (${(e as Error).name}).`; }
}

export const V1_BATTLE_NOTE = 'Saved mid-battle under the old rules: the battle restarts from the briefing with your company as it stood.';

/** A v1 envelope in v2 form (PLAN Q17). */
function migrate(env: { v: 1; savedAt: number; screen: Screen; campaign: Campaign; battle: unknown }): Envelope {
  if (env.screen === 'battle') return { v: 2, savedAt: env.savedAt, screen: 'briefing', campaign: env.campaign, battle: null, note: V1_BATTLE_NOTE };
  return { v: 2, savedAt: env.savedAt, screen: env.screen, campaign: env.campaign, battle: null };
}

export function readSave(s: StorageLike | null = store()): LoadResult {
  if (!s) return { ok: false, reason: 'none' };
  let text: string | null = null;
  try { text = s.getItem(SAVE_KEY); } catch { return { ok: false, reason: 'Storage could not be read.' }; }
  if (!text) return { ok: false, reason: 'none' };
  try {
    let env = JSON.parse(text) as Envelope | { v: 1; savedAt: number; screen: Screen; campaign: Campaign; battle: unknown };
    if (env?.v === 1 && env.campaign && env.screen) env = migrate(env);
    if (env?.v !== 2 || !env.campaign || !env.screen) return { ok: false, reason: 'The save is from another version of the game.' };
    if (env.screen === 'battle' && (!env.battle?.snapshot || env.battle.snapshot.v !== 2)) return { ok: false, reason: 'The save is missing its battle.' };
    return { ok: true, env };
  } catch { return { ok: false, reason: 'The save is damaged and cannot be read.' }; }
}

export function clearSave(s: StorageLike | null = store()): void { try { s?.removeItem(SAVE_KEY); } catch { /* refused storage: nothing to clear */ } }

/** SAV-2: what Continue names. */
export function describe(env: Envelope): string {
  const when = new Date(env.savedAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  if (env.screen === 'battle' && env.battle) {
    const b = env.battle.snapshot;
    const ours = b.units.filter((u) => u.side === 'player' && u.alive).length, theirs = b.units.filter((u) => u.side === 'hostile' && u.alive).length;
    return `${MISSIONS[b.mission]?.name ?? 'Battle'}, round ${b.round}, ${b.phase === 'player' ? 'your phase' : 'Directorate phase'}: ${ours} Lanterns vs ${theirs} walkers. Saved ${when}.`;
  }
  const name = MISSIONS[currentMission(env.campaign)]?.name ?? 'the next contract';
  const label = { briefing: `Briefing, ${name}`, debrief: 'Debrief', hangar: 'The hangar', battle: 'Battle' }[env.screen];
  return `${label}, ${env.campaign.credits.toLocaleString()} credits. Saved ${when}.${env.note ? ` ${env.note}` : ''}`;
}
