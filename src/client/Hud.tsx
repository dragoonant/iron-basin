import { useState } from 'react';
import { MISSIONS, pack, pilot as pilotDef, RULES } from '../engine/data';
import { dist } from '../engine/grid';
import {
  callable, fireBlock, living, maxHp, modes, patchCost, pivotCost, preview, shaken, stats, steady, unitById, weapons, type ModeInfo,
} from '../engine/query';
import type { Arc, BattleState, Facing, HitSlot, PartSlot, Unit } from '../engine/types';
import { audio } from './audio';
import { skipAll } from './presenter';
import { allDone, freeFacing, useGame } from './store';
import { Settings } from './Settings';

const PARTS: [PartSlot, string][] = [['body', 'BODY'], ['armL', 'L.ARM'], ['armR', 'R.ARM'], ['legs', 'LEGS']];
const HIT_LABEL: Record<HitSlot, string> = { body: 'BODY', armL: 'L.ARM', armR: 'R.ARM', legs: 'LEGS', pack: 'PACK' };
const PORTRAITS = new Set(['marlow', 'okonjo', 'varga', 'haldane', 'hallen', 'aske']);
const SLOT_LABEL = { L: 'L.HAND', R: 'R.HAND', P: 'PACK' } as const;
const ARC_NOTE: Record<Arc, string> = { front: '', left: `flank +${RULES.facing.sideHit}`, right: `flank +${RULES.facing.sideHit}`, rear: `rear +${RULES.facing.rearHit}` };
const EFFECT_NOTE: Record<string, string> = { pin: 'pins on a hit', push: 'pushes on a hit', knockdown: 'knocks down on a hit', stagger: 'staggers on a hit' };

export function Portrait({ id, small }: { id: string; small?: boolean }) {
  if (PORTRAITS.has(id)) return <img className={`portrait${small ? ' small' : ''}`} src={`art/portraits/${id}.jpg`} alt="" draggable={false} />;
  return <div className={`portrait blank${small ? ' small' : ''}`}><span>DIR</span></div>;
}

export function PartBars({ u }: { u: Unit }) {
  return (
    <div className="partbars">
      {PARTS.map(([p, label]) => {
        const max = maxHp(u, p), hp = u.hp[p];
        const r = hp / max;
        return (
          <div key={p} className={`pb ${hp <= 0 ? 'lost' : r < 0.34 ? 'low' : r < 0.67 ? 'mid' : ''}`}>
            <span className="pl">{label}</span>
            <span className="track"><span className="fill" style={{ width: `${Math.max(0, r) * 100}%` }} /></span>
            <span className="pv">{hp <= 0 ? 'LOST' : `${hp}/${max}`}</span>
          </div>
        );
      })}
    </div>
  );
}

/** Drive as pencil ticks: spent ones struck through (DRV-1). */
function Pips({ n, of, kind }: { n: number; of: number; kind: 'drive' | 'reserve' }) {
  return <span className={`pips ${kind}`} aria-label={`${kind} ${n} of ${of}`}>{Array.from({ length: of }, (_, i) => <i key={i} className={i < n ? 'on' : ''} />)}</span>;
}

function statusChips(u: Unit): string[] {
  const out: string[] = [];
  if (u.status.down) out.push('DOWN');
  if (u.status.suppressed) out.push('PINNED');
  if (u.status.pinned) out.push('PINNED NEXT');
  if (u.status.staggered) out.push('STAGGERED');
  if (u.status.mired) out.push('MIRED');
  if (u.status.packOut) out.push('PACK OUT');
  if (u.overwatch) out.push(`COVERING ${u.overwatch.dir}`);
  if (u.guarding.length) out.push('GUARDING');
  if (u.holdFire) out.push('HOLD FIRE');
  if (steady(u)) out.push('STEADY');
  if (shaken(u)) out.push('SHAKEN');
  return out;
}

function UnitCard({ s, u, compact }: { s: BattleState; u: Unit; compact?: boolean }) {
  const st = stats(s, u);
  const p = pilotDef(u.pilot);
  const myTurn = s.phase === u.side;
  const chips = statusChips(u);
  const canToggle = u.side === 'player' && s.phase === 'player' && u.alive && !compact;
  return (
    <div className={`card unit-card ${u.side}${compact ? ' compact' : ''}`} data-testid={`card-${u.id}`}>
      <div className="uc-head">
        <Portrait id={u.pilot} small={compact} />
        <div>
          <div className="call">{p.call}</div>
          <div className="pname">{p.name}</div>
          <div className="stats"><b>MOVE</b> {st.move} <b>EVADE</b> {st.evade} <b>WT</b> {st.weight}/{st.power}{st.overweight ? ' OVER' : ''} <b>FACING</b> {u.facing}</div>
          {u.alive && (
            <div className="drive-row" data-testid={`drive-${u.id}`}>
              {myTurn ? <><b>DRIVE</b> <Pips n={u.done ? 0 : u.drive} of={st.drive} kind="drive" /> {u.done ? 'stood down' : `${u.drive} left`}</> : <><b>RESERVE</b> <Pips n={u.reserve} of={RULES.drive.reserveCap} kind="reserve" /> {u.reserve} for reactions</>}
            </div>
          )}
          {!u.alive && u.side === 'player' && <div className="state">EJECTED</div>}
        </div>
      </div>
      {chips.length > 0 && <div className="chips">{chips.map((c) => <span key={c} className="chip">{c}</span>)}</div>}
      <PartBars u={u} />
      {!compact && (
        <div className="weps">
          {weapons(u).map((w) => (
            <div key={w.slot} className={`wep${w.usable ? '' : ' off'}`}>
              <span className="ws">{SLOT_LABEL[w.slot]}</span>
              <span className="wn">{w.def.name}{w.ammo !== null ? ` · ${w.ammo} left` : ''}{w.def.class === 'shield' ? ` · cuts ${w.def.guard}% from the front and left` : ` · ${w.def.min}-${w.def.max}`}</span>
              <span className="wd">{modes(u).filter((m) => m.slot === w.slot).map((m) => `${m.mode.name} ${m.dp}`).join(' · ')}{u.fired.includes(w.slot) && myTurn ? ' · used' : ''}</span>
            </div>
          ))}
          {pack(u.build.pack).kind === 'repair' && <div className="wep"><span className="ws">PACK</span><span className="wn">{pack(u.build.pack).name}</span><span className="wd">Patch {patchCost()} · +{pack(u.build.pack).heal} · {u.charges} left</span></div>}
          {pack(u.build.pack).kind === 'sensor' && <div className="wep"><span className="ws">PACK</span><span className="wn">{pack(u.build.pack).name}</span><span className="wd">spots for mortars to {pack(u.build.pack).sensorRange}</span></div>}
        </div>
      )}
      {canToggle && (
        <button className={`ghost hold${u.holdFire ? ' on' : ''}`} data-testid="hold-fire" onClick={() => { audio.play('ui-tick'); useGame.getState().dispatch({ type: 'holdFire', unit: u.id, on: !u.holdFire }); }}>
          {u.holdFire ? 'Hold fire: on (no return fire)' : 'Hold fire: off'}
        </button>
      )}
    </div>
  );
}

function FireRow({ s, a, t, mi }: { s: BattleState; a: Unit; t: Unit; mi: ModeInfo }) {
  const fire = useGame((g) => g.fire);
  const why = fireBlock(s, a, mi.slot, mi.mode.id, t);
  const p = why ? null : preview(s, a, mi.slot, mi.mode.id, t);
  const label = <><span className="fr-w">{mi.weapon.def.name} · {mi.mode.name}</span><span className="fr-dp">{mi.dp} DP</span></>;
  if (!p) return <div className="fire-row off" data-testid={`fire-${mi.slot}-${mi.mode.id}`}>{label}<span className="fr-n">{why}</span></div>;
  const notes = [
    ARC_NOTE[p.arc], p.cover ? `cover −${RULES.coverPenalty}` : '', p.spotted ? `spotted +${RULES.spotterBonus}` : '',
    p.effect ? EFFECT_NOTE[p.effect] ?? '' : '', p.guardedBy ? `${pilotDef(unitById(s, p.guardedBy)!.pilot).call} takes it on the shield` : '',
    mi.cls === 'indirect' ? 'no return fire' : p.counter ? `return fire ${p.counter.chance}% ${p.counter.shots}× ${p.counter.dmg[0]}-${p.counter.dmg[1]}` : 'no return fire',
  ].filter(Boolean).join(' · ');
  const go = (part?: HitSlot) => { audio.play('confirm'); fire(mi.slot, mi.mode.id, part); };
  if (mi.mode.call) {
    return (
      <div className="fire-row call" data-testid={`fire-${mi.slot}-${mi.mode.id}`}>
        {label}<span className="fr-c">{p.chance}%</span><span className="fr-d">{p.shots}× {p.dmg[0]}-{p.dmg[1]}</span>
        <span className="fr-parts">call: {callable(t, a).map((part) => <button key={part} data-testid={`call-${part}`} onClick={() => go(part)}>{HIT_LABEL[part]}</button>)}</span>
        <span className="fr-n">{notes}</span>
      </div>
    );
  }
  return (
    <button className="fire-row" data-testid={`fire-${mi.slot}-${mi.mode.id}`} onClick={() => go()}>
      {label}<span className="fr-c">{p.chance}%</span><span className="fr-d">{p.shots}× {p.dmg[0]}-{p.dmg[1]}</span>
      <span className="fr-n">{notes}</span>
    </button>
  );
}

function AttackPanel({ s, a, t }: { s: BattleState; a: Unit; t: Unit }) {
  const cancel = () => useGame.getState().setTarget(null);
  const rows = modes(a).filter((m) => m.shots > 0 && !m.mode.target && m.weapon.usable);
  const order = (m: ModeInfo) => (fireBlock(s, a, m.slot, m.mode.id, t) ? 1 : 0);
  return (
    <div className="card attack-panel" data-testid="attack-panel">
      <div className="ap-title">FIRE ON {t.id === 'hallen' ? 'HALLEN' : pilotDef(t.pilot).call} <span className="dist">{dist(a, t)} tiles · {a.drive} drive</span></div>
      <UnitCard s={s} u={t} compact />
      <div className="fire-list">{[...rows].sort((x, y) => order(x) - order(y)).map((mi) => <FireRow key={`${mi.slot}-${mi.mode.id}`} s={s} a={a} t={t} mi={mi} />)}</div>
      <button className="ghost" onClick={cancel}>Cancel</button>
    </div>
  );
}

function ObjectPanel({ s, a, x, y }: { s: BattleState; a: Unit; x: number; y: number }) {
  const t = s.tiles[y * s.w + x]!;
  const d = dist(a, { x, y });
  const rows = modes(a).filter((m) => m.weapon.usable && m.shots > 0 && !m.mode.target && m.cls !== 'indirect' && d >= m.min && d <= m.max);
  return (
    <div className="card attack-panel">
      <div className="ap-title">FIRE ON THE {t.obj?.toUpperCase()} <span className="dist">{t.objHp} HP</span></div>
      <p className="hint">Every shot hits a standing object. At 0 HP it falls to rubble and stops giving cover.</p>
      {rows.map((m) => {
        const dmg = Math.round(m.dmg * m.shots);
        const blocked = a.fired.includes(m.slot) ? 'this weapon has given its order' : a.drive < m.dp ? `needs ${m.dp} drive` : null;
        return (
          <button key={`${m.slot}-${m.mode.id}`} className={`fire-row${blocked ? ' off' : ''}`} disabled={!!blocked} onClick={() => { audio.play('confirm'); useGame.getState().fireObject(m.slot, m.mode.id); }}>
            <span className="fr-w">{m.weapon.def.name} · {m.mode.name}</span><span className="fr-dp">{m.dp} DP</span><span className="fr-c">100%</span><span className="fr-d">{dmg} dmg</span>
            <span className="fr-n">{blocked ?? (dmg >= t.objHp ? 'breaks it' : `${t.objHp - dmg} HP left`)}</span>
          </button>
        );
      })}
      <button className="ghost" onClick={() => useGame.setState({ targetObj: null })}>Cancel</button>
    </div>
  );
}

function PatchPanel({ s, a, close }: { s: BattleState; a: Unit; close: () => void }) {
  const pk = pack(a.build.pack);
  const rows: { t: Unit; p: PartSlot; amt: number }[] = [];
  for (const t of living(s, 'player')) if (dist(a, t) <= 1) for (const [p] of PARTS) if (t.hp[p] > 0 && t.hp[p] < maxHp(t, p)) rows.push({ t, p, amt: Math.min(pk.heal ?? 0, maxHp(t, p) - t.hp[p]) });
  return (
    <div className="card attack-panel">
      <div className="ap-title">PATCH <span className="dist">{patchCost()} DP · {a.charges} charges</span></div>
      {rows.length === 0 && <p className="hint">No damaged part within reach. Lost parts wait for the hangar.</p>}
      {rows.map((r) => (
        <button key={r.t.id + r.p} className="fire-row" onClick={() => { useGame.getState().dispatch({ type: 'patch', unit: a.id, target: r.t.id, part: r.p }); close(); }}>
          <span className="fr-w">{pilotDef(r.t.pilot).call}</span><span className="fr-dp">{PARTS.find((x) => x[0] === r.p)![1]}</span><span className="fr-d">+{r.amt}</span><span className="fr-n">{r.t.hp[r.p]}/{maxHp(r.t, r.p)}</span>
        </button>
      ))}
      <button className="ghost" onClick={close}>Cancel</button>
    </div>
  );
}

const AIM_HINT: Record<string, string> = {
  smoke: 'Tap a tile in mortar range to lay a 3×3 screen. Tap the walker to cancel.',
  overwatch: 'Tap a tile straight out from the walker: the lane it covers in the Directorate phase.',
  guard: 'Tap an adjacent ally to guard it with the shield.',
};

export function Hud() {
  const s = useGame((g) => g.shown);
  const liveState = useGame((g) => g.live);
  const selected = useGame((g) => g.selected);
  const hover = useGame((g) => g.hover);
  const target = useGame((g) => g.target);
  const targetObj = useGame((g) => g.targetObj);
  const aim = useGame((g) => g.aim);
  const banner = useGame((g) => g.banner);
  const clock = useGame((g) => g.clock);
  const feed = useGame((g) => g.feed);
  const presenting = useGame((g) => g.presenting || g.queue.length > 0);
  const saveError = useGame((g) => g.saveError);
  const [menu, setMenu] = useState(false);
  const [patching, setPatching] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  if (!s || !liveState) return null;
  const m = MISSIONS[s.mission]!;
  const sel = selected ? unitById(s, selected) : null;
  const hov = hover ? s.units.find((u) => u.alive && u.x === hover.x && u.y === hover.y) ?? null : null;
  const tgt = target ? unitById(s, target) : null;
  const myPhase = s.phase === 'player' && liveState.phase === 'player' && !liveState.result;
  const canAct = myPhase && !presenting && sel && sel.side === 'player' && sel.alive && !sel.done;
  const canPatch = canAct && sel && pack(sel.build.pack).kind === 'repair' && !sel.status.packOut && sel.charges > 0 && sel.drive >= patchCost();
  const aimModes = canAct && sel ? modes(sel).filter((mi) => mi.mode.target && mi.weapon.usable && !sel.fired.includes(mi.slot) && sel.drive >= mi.dp) : [];
  const ours = living(s, 'player').length, theirs = living(s, 'hostile').length;
  const done = liveState.result && !presenting;
  const nextReady = () => living(liveState, 'player').find((u) => !u.done && u.id !== selected) ?? living(liveState, 'player').find((u) => !u.done);
  const endPhase = () => {
    if (!allDone(liveState) && !confirmEnd) { setConfirmEnd(true); return; }
    setConfirmEnd(false);
    audio.play('confirm');
    useGame.setState({ selected: null, target: null, targetObj: null, aim: null });
    useGame.getState().dispatch({ type: 'endPhase' });
  };
  const free = canAct && sel ? freeFacing(liveState, sel.id) : false;
  const aimMi = aim && sel ? modes(sel).find((x) => x.slot === aim.slot && x.mode.id === aim.mode) : null;

  return (
    <div className="hud" data-testid="hud">
      <div className="strip">
        <span className="op">MARROW YARD</span>
        <span>ROUND <b data-testid="round">{s.round}</b> / {m.roundLimit}</span>
        <span className={`phase ${s.phase}`} data-testid="phase">{s.phase === 'player' ? 'YOUR PHASE' : 'DIRECTORATE PHASE'}</span>
        <span className="count"><i className="dot p" />{ours} <i className="dot h" />{theirs}</span>
        <span className="bonus">{s.round <= m.bonusRound ? `speed bonus by round ${m.bonusRound}` : 'speed bonus missed'}</span>
      </div>
      <button className="menu-btn" aria-label="Menu" onClick={() => setMenu(!menu)}>≡</button>
      {menu && <Settings onClose={() => setMenu(false)} inBattle />}
      {saveError && <div className="save-warn">{saveError}</div>}

      <div className="feed">{feed.slice(-6).map((f, i) => <div key={i} className={`fl ${f.side}`}>{f.text}</div>)}</div>

      {banner && clock < banner.until && <div className={`banner ${s.phase}`}><div className="bt">{banner.text}</div><div className="bs">{banner.sub}</div></div>}

      <div className="left-col">
        {sel && <UnitCard s={s} u={sel} />}
        {hov && hov.id !== selected && hov.id !== target && <UnitCard s={s} u={hov} compact />}
      </div>

      <div className="right-col">
        {canAct && tgt && sel && <AttackPanel s={s} a={sel} t={tgt} />}
        {canAct && targetObj && sel && <ObjectPanel s={s} a={sel} x={targetObj.x} y={targetObj.y} />}
        {canAct && patching && sel && !tgt && <PatchPanel s={s} a={sel} close={() => setPatching(false)} />}
      </div>

      <div className="orders">
        {myPhase && !presenting && (
          <>
            {canAct && sel && (
              <>
                <span className="hint">{aimMi ? AIM_HINT[aimMi.mode.effect ?? ''] : sel.walked ? `${sel.drive} drive left. Fire, walk again, turn, or stand down to keep up to ${RULES.drive.reserveCap} for reactions.` : `${sel.drive} drive. Blue: walk (1). Red: tap an enemy for fire modes.`}</span>
                {sel.lastWalk && !sel.lastWalk.reacted && <button data-testid="undo" onClick={() => { audio.play('cancel'); useGame.getState().dispatch({ type: 'undoWalk', unit: sel.id }); }}>Undo walk</button>}
                <span className="facing" data-testid="facing">
                  <span className="fl-label">FACE {free ? 'free' : `${pivotCost()} DP`}</span>
                  {(['N', 'E', 'S', 'W'] as Facing[]).map((f) => <button key={f} data-testid={`face-${f}`} className={sel.facing === f ? 'on' : ''} disabled={sel.facing === f || (!free && sel.drive < pivotCost())} onClick={() => { audio.play('ui-tick'); useGame.getState().face(f); }}>{f}</button>)}
                </span>
                {aimModes.map((mi) => (
                  <button key={`${mi.slot}-${mi.mode.id}`} data-testid={`aim-${mi.mode.id}`} className={aim?.mode === mi.mode.id && aim.slot === mi.slot ? 'on' : ''} onClick={() => { audio.play('ui-tick'); useGame.getState().setAim(aim?.mode === mi.mode.id && aim.slot === mi.slot ? null : { slot: mi.slot, mode: mi.mode.id }); }}>
                    {mi.mode.name} {mi.dp}
                  </button>
                ))}
                {canPatch && <button onClick={() => { useGame.setState({ target: null, aim: null }); setPatching(true); }}>Patch {patchCost()}</button>}
                <button data-testid="stand-down" onClick={() => { audio.play('confirm'); useGame.getState().dispatch({ type: 'standDown', unit: sel.id }); const n = nextReady(); useGame.getState().select(n && n.id !== sel.id ? n.id : null); }}>Stand down{sel.drive > 0 ? ` (keep ${Math.min(RULES.drive.reserveCap, sel.drive)})` : ''}</button>
              </>
            )}
            {!canAct && <span className="hint">{ours ? 'Select a Lantern walker.' : ''}</span>}
            <button className="next" onClick={() => { const n = nextReady(); if (n) useGame.getState().select(n.id); }}>Next ready</button>
            <button data-testid="end-phase" className={`end${allDone(liveState) ? ' pulse' : ''}${confirmEnd ? ' confirm' : ''}`} onClick={endPhase}>{confirmEnd ? 'Walkers still have drive. End anyway?' : 'End phase'}</button>
          </>
        )}
        {presenting && <button className="skip" data-testid="skip" onClick={() => skipAll()}>Skip ▸▸</button>}
        {!myPhase && !presenting && !liveState.result && <span className="hint">The Directorate is moving.</span>}
      </div>

      {done && liveState.result && (
        <div className="result" data-testid="result">
          <div className="rt">{liveState.result.winner === 'player' ? 'CONTRACT FULFILLED' : 'WITHDRAWN'}</div>
          <div className="rs">{liveState.result.winner === 'player' ? `Marrow Yard is clear in ${liveState.result.rounds} rounds.` : liveState.result.reason === 'timeout' ? 'The supply train could not wait any longer.' : 'Every Lantern walker is down.'}</div>
          <button data-testid="to-debrief" onClick={() => { audio.play('confirm'); useGame.getState().finishBattle(); }}>Debrief</button>
        </div>
      )}
    </div>
  );
}

