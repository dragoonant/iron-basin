import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { MISSIONS } from '../engine/data';
import { campaignDone, currentMission, itemName } from '../engine/campaign';
import { audio } from './audio';
import { preloadTextures } from './board/textures';
import { Portrait } from './Hud';
import { readSave, clearSave, describe } from './save';
import { useGame } from './store';
import { Settings } from './Settings';

// ---------------------------------------------------------------- Title
export function Title() {
  const [save, setSave] = useState(() => readSave());
  const [confirm, setConfirm] = useState(false);
  const [settings, setSettings] = useState(false);
  useEffect(() => { audio.music('hangar', 1200); audio.loop('rain-loop', 1200); }, []);
  const g = useGame.getState();
  return (
    <div className="screen title" style={{ backgroundImage: 'url(art/title.jpg)' }} data-testid="title">
      <div className="title-block">
        <h1 className="logo">IRON BASIN</h1>
        <div className="tag">A Grey Lantern Company contract</div>
        <div className="menu">
          {save.ok && <button data-testid="continue" className="primary" onClick={() => { audio.play('confirm'); g.continueGame(); }}>Continue<small>{describe(save.env)}</small></button>}
          {!save.ok && save.reason !== 'none' && <div className="save-bad">{save.reason} <button onClick={() => { clearSave(); setSave(readSave()); }}>Discard it</button></div>}
          <button data-testid="new" className={save.ok ? '' : 'primary'} onClick={() => { audio.play('confirm'); g.newGame(); }}>New contract</button>
          {save.ok && !confirm && <button className="ghost" onClick={() => setConfirm(true)}>Discard save</button>}
          {save.ok && confirm && <button className="ghost danger" data-testid="discard-confirm" onClick={() => { clearSave(); setSave(readSave()); setConfirm(false); }}>Discard for good? This cannot be undone.</button>}
          <button className="ghost" onClick={() => setSettings(true)}>Settings</button>
          {import.meta.env.VITE_ARTIFACT !== '1' && <a className="ghost link" href="sounds.html">Sound desk</a>}
        </div>
      </div>
      {settings && <Settings onClose={() => setSettings(false)} />}
      <div className="credit">An original game by evilgouki. Working title. Art and sound generated for this project.</div>
    </div>
  );
}

// ---------------------------------------------------------------- Briefing
/** Marrow Yard's grease-pencil notes: the plan of attack, then the combat v2 notes (wagons, flank, reserve). */
function MarrowNotes({ S }: { S: number }) {
  return (
    <>
      <path d={`M${3.5 * S} ${15.5 * S} C ${3.4 * S} ${11 * S}, ${3.2 * S} ${8 * S}, ${3.6 * S} ${4.5 * S}`} stroke="#ff8a2a" strokeWidth={4} fill="none" strokeLinecap="round" markerEnd="url(#arr)" />
      <path d={`M${7.5 * S} ${15.3 * S} C ${7.8 * S} ${12 * S}, ${6.2 * S} ${9 * S}, ${6.6 * S} ${5.2 * S}`} stroke="#ff8a2a" strokeWidth={4} fill="none" strokeLinecap="round" markerEnd="url(#arr)" />
      <text x={2.2 * S} y={1.3 * S} className="pencil" fill="#e9e4d6">← silos: CMD?</text>
      <text x={1.2 * S} y={13 * S} className="pencil" fill="#ff8a2a" transform={`rotate(-80 ${1.2 * S} ${13 * S})`}>VARGA</text>
      <text x={8.2 * S} y={14.4 * S} className="pencil" fill="#ff8a2a">MARLOW, OKONJO,</text><text x={8.2 * S} y={15.2 * S} className="pencil" fill="#ff8a2a">HALDANE</text>
      <text x={6.6 * S} y={6.2 * S} className="pencil" fill="#e9e4d6">↑ platform: high ground</text>
      {/* Combat v2 notes: the wagons, the flank, the reserve. */}
      <path d={`M${4.5 * S} ${10.2 * S} L${4.5 * S} ${6.4 * S}`} stroke="#e9e4d6" strokeWidth={3} strokeDasharray="7 4" fill="none" markerEnd="url(#arrw)" />
      <text x={5.15 * S} y={10.1 * S} className="pencil" fill="#e9e4d6" data-testid="note-wagons" transform={`rotate(-90 ${5.15 * S} ${10.1 * S})`}>shunt the wagons</text>
      <path d={`M${12.2 * S} ${12.6 * S} C ${12.6 * S} ${10.6 * S}, ${11.6 * S} ${9.2 * S}, ${10.4 * S} ${8.6 * S}`} stroke="#ff8a2a" strokeWidth={3} strokeDasharray="6 4" fill="none" markerEnd="url(#arr)" />
      <text x={13.9 * S} y={13.5 * S} className="pencil" fill="#ff8a2a" textAnchor="end" data-testid="note-flank">flank +10, rear +20</text>
      <text x={0.3 * S} y={17.6 * S} className="pencil" fill="#ff8a2a" data-testid="note-reserve">keep 1 back: return fire</text>
    </>
  );
}

/** The Kerrow Locks' notes: the bridge, the gate and its bonus, the lamps, the weir. */
function KerrowNotes({ S }: { S: number }) {
  return (
    <>
      <path d={`M${2.5 * S} ${15.5 * S} C ${2.6 * S} ${13 * S}, ${3.4 * S} ${11.5 * S}, ${3.5 * S} ${7.2 * S}`} stroke="#ff8a2a" strokeWidth={4} fill="none" strokeLinecap="round" markerEnd="url(#arr)" />
      <text x={0.2 * S} y={12.9 * S} className="pencil" fill="#ff8a2a">VARGA: bridge</text>
      <path d={`M${7.5 * S} ${15.3 * S} C ${10 * S} ${14 * S}, ${13.6 * S} ${12.5 * S}, ${14.5 * S} ${7.4 * S}`} stroke="#ff8a2a" strokeWidth={4} fill="none" strokeLinecap="round" markerEnd="url(#arr)" />
      <text x={8.6 * S} y={15.9 * S} className="pencil" fill="#ff8a2a">MARLOW, OKONJO, HALDANE: weir</text>
      <text x={8.5 * S} y={9.3 * S} className="pencil" fill="#e9e4d6" data-testid="note-gate">← gate: +1,500 if it stands</text>
      <text x={9.2 * S} y={6.5 * S} className="pencil" fill="#e9e4d6">low quay floods if the gate goes</text>
      <text x={0.2 * S} y={5.6 * S} className="pencil" fill="#ffd27a">lamps light you up: shoot them out</text>
      <text x={4.3 * S} y={10.9 * S} className="pencil" fill="#e9e4d6">winch swings the bridge</text>
    </>
  );
}

/** The yard drawn from the mission map in grease pencil on acetate. */
function YardPlan({ id }: { id: string }) {
  const m = MISSIONS[id]!;
  const S = 26;
  const W = m.map[0]!.length, H = m.map.length;
  const cells: React.ReactElement[] = [];
  m.map.forEach((row, y) => [...row].forEach((ch, x) => {
    const l = m.legend[ch]!;
    const obj = l[2];
    const t = l[0] as string;
    const fill = obj === 'silo' ? '#d9d4c4' : obj === 'shed' ? '#b98a6a' : obj === 'container' ? '#8fa2b2' : obj === 'wagon' ? '#a0704c' : obj === 'barrier' ? '#cfcac0' : obj === 'crane' ? '#e07a2a' : String(obj) === 'gate' ? '#a0704c' : String(obj) === 'lamp' ? '#ffd27a' : String(obj) === 'winch' ? '#e07a2a' : t === 'deep' ? '#2f4654' : t === 'water' ? '#4d6a7a' : t === 'deck' ? '#8a8378' : t === 'ballast' ? '#5c5650' : l[1] > 0 ? '#7d7a74' : t === 'mud' ? '#4c4236' : '#625f5a';
    cells.push(<rect key={`${x},${y}`} x={x * S} y={y * S} width={S - 1} height={S - 1} fill={fill} opacity={obj ? 0.95 : 0.55} rx={obj === 'silo' ? S / 2 : 2} />);
  }));
  const hostiles = m.units.filter((u) => u.side === 'hostile');
  const players = m.units.filter((u) => u.side === 'player');
  return (
    <svg className="yard-plan" viewBox={`-10 -10 ${W * S + 20} ${H * S + 20}`} data-testid="yard-plan">
      {cells}
      {hostiles.map((u) => <g key={u.id}><circle cx={u.x * S + S / 2} cy={u.y * S + S / 2} r={S * 0.62} fill="none" stroke="#e0352a" strokeWidth={3.5} strokeDasharray="5 3" /><path d={`M${u.x * S + 5} ${u.y * S + 5} L${u.x * S + S - 5} ${u.y * S + S - 5} M${u.x * S + S - 5} ${u.y * S + 5} L${u.x * S + 5} ${u.y * S + S - 5}`} stroke="#e0352a" strokeWidth={3} /></g>)}
      {players.map((u) => <rect key={u.id} x={u.x * S + 4} y={u.y * S + 4} width={S - 8} height={S - 8} fill="#ff8a2a" stroke="#1b1f1c" strokeWidth={2} />)}
      {id === 'marrow-yard' && <MarrowNotes S={S} />}
      {id === 'kerrow-locks' && <KerrowNotes S={S} />}
      <defs><marker id="arr" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="#ff8a2a" /></marker><marker id="arrw" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="#e9e4d6" /></marker></defs>
    </svg>
  );
}

export function Briefing() {
  const campaign = useGame((g) => g.campaign);
  const m = MISSIONS[currentMission(campaign)]!;
  const LINES = m.briefing;
  const [i, setI] = useState(0);
  const [loading, setLoading] = useState<string | null>(null);
  const token = useRef(0);
  const line = LINES[Math.min(i, LINES.length - 1)]!;
  const atEnd = i >= LINES.length;
  useEffect(() => { audio.music('briefing', 1000); audio.loop(null); }, []);
  useEffect(() => {
    if (atEnd) return;
    const my = ++token.current;
    // Lines without a recorded voice (contract 2, until the EVILAEGIS recast) wait for Next (PLAN Q21).
    audio.voice(line.id).then(() => { if (token.current === my) setTimeout(() => { if (token.current === my) setI((k) => k + 1); }, 650); }).catch(() => {});
    return () => { audio.stopVoice(); };
  }, [i]); // eslint-disable-line react-hooks/exhaustive-deps
  const deploy = async () => {
    audio.stopVoice();
    setLoading('Loading the field 0/11');
    await preloadTextures((d, t) => setLoading(`Loading the field ${d}/${t}`));
    audio.music('battle', 1500); audio.loop('rain-loop', 1500);
    useGame.getState().startBattle();
  };
  return (
    <div className="screen briefing" data-testid="briefing">
      <div className={`brief-map ${line.show}`}>
        {line.show === 'region' ? <img src="art/region-map.jpg" alt="" draggable={false} /> : <YardPlan id={m.id} />}
        <div className="acetate" />
        <div className="map-label">{line.show === 'region' ? m.region : m.label}</div>
      </div>
      <div className="brief-side">
        <div className="contract">
          <div className="k">CONTRACT {m.contract}</div>
          <h2>{m.name}</h2>
          <p>{m.brief}</p>
          <ul>
            <li>Win: every Directorate walker destroyed.</li>
            <li>Lose: every Lantern walker down, or round {m.roundLimit} ends.</li>
            <li>Fee {m.fee.toLocaleString()} cr · {m.bounty} cr a kill · bonus {m.bonus.toLocaleString()} cr by round {m.bonusRound}.{m.gateBonus ? ` Gate bonus ${m.gateBonus.toLocaleString()} cr if the lock gate stands.` : ''}</li>
            <li>Salvage: limbs and weapons that survive a kill are yours.</li>
            {m.night && <li>Night: you see 5 tiles, lamps light the quays, and the Directorate only sees what its walkers can.</li>}
          </ul>
        </div>
        {!atEnd ? (
          <div className="speaker" data-testid="speaker">
            <Portrait id={line.who} />
            <div><div className="who">{line.name}</div><p className="line">“{line.text}”</p></div>
          </div>
        ) : <div className="speaker done"><p className="line">{m.rollOut}</p></div>}
        <div className="brief-buttons">
          {!atEnd && <button onClick={() => { audio.play('ui-tick'); audio.stopVoice(); setI(i + 1); }}>Next</button>}
          {!atEnd && <button className="ghost" data-testid="skip-brief" onClick={() => { audio.stopVoice(); setI(LINES.length); }}>Skip briefing</button>}
          {atEnd && <button className="primary" data-testid="deploy" disabled={!!loading} onClick={() => void deploy()}>{loading ?? 'Deploy'}</button>}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Debrief
export function Debrief() {
  const c = useGame((g) => g.campaign);
  const b = useGame((g) => g.live);
  const r = b?.result;
  useEffect(() => { if (r) void audio.voice(r.winner === 'player' ? 'debrief-win' : 'debrief-lose').catch(() => {}); audio.music('hangar', 2000); audio.loop(null); return () => audio.stopVoice(); }, [r]);
  if (!r || !b) return <Hangar />;
  const m = MISSIONS[b.mission]!;
  const win = r.winner === 'player';
  const grouped = new Map<string, number>();
  for (const s of r.salvage) { const k = `${s.kind}:${s.id}`; grouped.set(k, (grouped.get(k) ?? 0) + 1); }
  const total = r.credits.fee + r.credits.bonus + r.credits.bounty + (r.credits.gate ?? 0);
  return (
    <div className="screen debrief" style={{ backgroundImage: `url(art/${win ? 'debrief' : 'defeat'}.jpg)` }} data-testid="debrief">
      <div className="sheet">
        <div className="k">DEBRIEF · {m.name.toUpperCase()}</div>
        <h2>{win ? 'Contract fulfilled' : 'Contract withdrawn'}</h2>
        <div className="speaker"><Portrait id="aske" /><p className="line">“{win ? m.debrief.win : m.debrief.lose}”</p></div>
        <table className="tally"><tbody>
          <tr><td>Rounds</td><td>{r.rounds}</td></tr>
          <tr><td>Directorate walkers destroyed</td><td>{r.lost.hostile}</td></tr>
          <tr><td>Lantern walkers lost (pilots ejected)</td><td>{r.lost.player}</td></tr>
          {win && <><tr><td>Contract fee</td><td>{r.credits.fee.toLocaleString()} cr</td></tr><tr><td>Kill bounty</td><td>{r.credits.bounty.toLocaleString()} cr</td></tr><tr><td>Speed bonus</td><td>{r.credits.bonus ? `${r.credits.bonus.toLocaleString()} cr` : 'missed'}</td></tr>{m.gateBonus ? <tr><td>Gate bonus</td><td>{r.credits.gate ? `${r.credits.gate.toLocaleString()} cr` : 'the gate is down'}</td></tr> : null}<tr className="sum"><td>Paid</td><td>{total.toLocaleString()} cr</td></tr></>}
        </tbody></table>
        {win && <><div className="k">SALVAGE</div><ul className="salvage">{[...grouped.entries()].map(([k, n]) => { const [kind, id] = k.split(':') as ['arm', string]; return <li key={k}><b>{n}×</b> {itemName(kind, id)}</li>; })}</ul></>}
        <div className="brief-buttons">
          {win ? <button className="primary" data-testid="to-hangar" onClick={() => { audio.play('salvage'); useGame.getState().setScreen('hangar'); }}>To the hangar ({c.credits.toLocaleString()} cr)</button>
            : <><button className="primary" data-testid="retry" onClick={() => { audio.music('battle', 1200); audio.loop('rain-loop', 1200); useGame.getState().retry(); }}>Retry the contract</button><button className="ghost" onClick={() => useGame.getState().setScreen('title')}>Title</button></>}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- The next contract on offer
export function NextContract() {
  const c = useGame((g) => g.campaign);
  if (campaignDone(c)) {
    return (
      <div className="screen briefing" data-testid="next">
        <div className="brief-map region"><img src="art/region-map.jpg" alt="" draggable={false} /><div className="acetate" /><div className="map-label">VELL BASIN</div></div>
        <div className="brief-side">
          <div className="contract">
            <div className="k">THE BASIN CONCORD</div>
            <h2>Every contract is fulfilled</h2>
            <p>Marrow Yard and the Kerrow Locks are in Concord hands. This build ends here; your company, credits and salvage are saved for the contracts to come.</p>
            <ul className="hint">{c.log.map((l, n) => <li key={n}>{l}</li>)}</ul>
          </div>
          <div className="brief-buttons">
            <button className="primary" onClick={() => useGame.getState().setScreen('hangar')}>Back to the hangar</button>
            <button className="ghost" onClick={() => useGame.getState().setScreen('title')}>Title</button>
          </div>
        </div>
      </div>
    );
  }
  const m = MISSIONS[currentMission(c)]!;
  return (
    <div className="screen briefing" data-testid="next">
      <div className="brief-map region"><img src="art/region-map.jpg" alt="" draggable={false} /><div className="acetate" /><div className="map-label">{m.region}</div></div>
      <div className="brief-side">
        <div className="contract">
          <div className="k">CONTRACT {m.contract} ON OFFER</div>
          <h2>{m.name}</h2>
          <p>{m.brief}</p>
          <p className="hint">Fee {m.fee.toLocaleString()} cr. Your company, credits and salvage carry over; walkers keep the damage you have not repaired.</p>
        </div>
        <div className="brief-buttons">
          <button className="primary" data-testid="to-briefing" onClick={() => { audio.play('confirm'); useGame.getState().setScreen('briefing'); }}>To the briefing</button>
          <button className="ghost" onClick={() => useGame.getState().setScreen('hangar')}>Back to the hangar</button>
        </div>
      </div>
    </div>
  );
}

import { Hangar } from './Hangar';
export { Hangar };
