import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { MISSIONS } from '../engine/data';
import { itemName } from '../engine/campaign';
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
interface Line { id: string; who: string; name: string; text: string; show: 'region' | 'yard' }
const LINES: Line[] = [
  { id: 'brief-1', who: 'aske', name: 'Corin Aske, Basin Concord', text: 'Captain. The Directorate pushed a recon group into Marrow Yard before dawn. Five walkers, dug in among the freight lines.', show: 'region' },
  { id: 'brief-2', who: 'aske', name: 'Corin Aske, Basin Concord', text: 'That yard is the only rail link into Kerrow. The Concord wants it open before the supply train arrives at noon.', show: 'region' },
  { id: 'brief-3', who: 'aske', name: 'Corin Aske, Basin Concord', text: 'Clear every Directorate walker from the yard. Their commander will be sitting by the grain silos.', show: 'yard' },
  { id: 'brief-4', who: 'marlow', name: 'Capt. Ines Marlow, Grey Lantern Company', text: 'Understood. Varga takes the left track. Okonjo and Haldane come up the middle with me.', show: 'yard' },
  { id: 'brief-5', who: 'aske', name: 'Corin Aske, Basin Concord', text: 'One more thing. Whatever you strip off their machines is yours. Salvage rights are in the contract.', show: 'yard' },
  { id: 'brief-6', who: 'marlow', name: 'Capt. Ines Marlow, Grey Lantern Company', text: "Then let's go earn it. Lanterns, move out.", show: 'yard' },
];

/** The yard drawn from the mission map in grease pencil on acetate. */
function YardPlan() {
  const m = MISSIONS['marrow-yard']!;
  const S = 26;
  const cells: React.ReactElement[] = [];
  m.map.forEach((row, y) => [...row].forEach((ch, x) => {
    const l = m.legend[ch]!;
    const obj = l[2];
    const fill = obj === 'silo' ? '#d9d4c4' : obj === 'shed' ? '#b98a6a' : obj === 'container' ? '#8fa2b2' : obj === 'wagon' ? '#a0704c' : obj === 'barrier' ? '#cfcac0' : obj === 'crane' ? '#e07a2a' : l[0] === 'water' ? '#4d6a7a' : l[0] === 'ballast' ? '#5c5650' : l[1] > 0 ? '#7d7a74' : l[0] === 'mud' ? '#4c4236' : '#625f5a';
    cells.push(<rect key={`${x},${y}`} x={x * S} y={y * S} width={S - 1} height={S - 1} fill={fill} opacity={obj ? 0.95 : 0.55} rx={obj === 'silo' ? S / 2 : 2} />);
  }));
  const hostiles = m.units.filter((u) => u.side === 'hostile');
  const players = m.units.filter((u) => u.side === 'player');
  return (
    <svg className="yard-plan" viewBox={`-10 -10 ${14 * S + 20} ${18 * S + 20}`} data-testid="yard-plan">
      {cells}
      {hostiles.map((u) => <g key={u.id}><circle cx={u.x * S + S / 2} cy={u.y * S + S / 2} r={S * 0.62} fill="none" stroke="#e0352a" strokeWidth={3.5} strokeDasharray="5 3" /><path d={`M${u.x * S + 5} ${u.y * S + 5} L${u.x * S + S - 5} ${u.y * S + S - 5} M${u.x * S + S - 5} ${u.y * S + 5} L${u.x * S + 5} ${u.y * S + S - 5}`} stroke="#e0352a" strokeWidth={3} /></g>)}
      {players.map((u) => <rect key={u.id} x={u.x * S + 4} y={u.y * S + 4} width={S - 8} height={S - 8} fill="#ff8a2a" stroke="#1b1f1c" strokeWidth={2} />)}
      <path d={`M${3.5 * S} ${15.5 * S} C ${3.4 * S} ${11 * S}, ${3.2 * S} ${8 * S}, ${3.6 * S} ${4.5 * S}`} stroke="#ff8a2a" strokeWidth={4} fill="none" strokeLinecap="round" markerEnd="url(#arr)" />
      <path d={`M${7.5 * S} ${15.3 * S} C ${7.8 * S} ${12 * S}, ${6.2 * S} ${9 * S}, ${6.6 * S} ${5.2 * S}`} stroke="#ff8a2a" strokeWidth={4} fill="none" strokeLinecap="round" markerEnd="url(#arr)" />
      <defs><marker id="arr" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="#ff8a2a" /></marker></defs>
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
      <defs><marker id="arrw" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="#e9e4d6" /></marker></defs>
    </svg>
  );
}

export function Briefing() {
  const [i, setI] = useState(0);
  const [loading, setLoading] = useState<string | null>(null);
  const token = useRef(0);
  const line = LINES[Math.min(i, LINES.length - 1)]!;
  const atEnd = i >= LINES.length;
  useEffect(() => { audio.music('briefing', 1000); audio.loop(null); }, []);
  useEffect(() => {
    if (atEnd) return;
    const my = ++token.current;
    audio.voice(line.id).then(() => { if (token.current === my) setTimeout(() => { if (token.current === my) setI((k) => k + 1); }, 650); }).catch(() => {});
    return () => { audio.stopVoice(); };
  }, [i]); // eslint-disable-line react-hooks/exhaustive-deps
  const deploy = async () => {
    audio.stopVoice();
    setLoading('Loading the yard 0/11');
    await preloadTextures((d, t) => setLoading(`Loading the yard ${d}/${t}`));
    audio.music('battle', 1500); audio.loop('rain-loop', 1500);
    useGame.getState().startBattle();
  };
  return (
    <div className="screen briefing" data-testid="briefing">
      <div className={`brief-map ${line.show}`}>
        {line.show === 'region' ? <img src="art/region-map.jpg" alt="" draggable={false} /> : <YardPlan />}
        <div className="acetate" />
        <div className="map-label">{line.show === 'region' ? 'VELL BASIN · KERROW RAIL LINK' : 'MARROW YARD · CONTRACT 1'}</div>
      </div>
      <div className="brief-side">
        <div className="contract">
          <div className="k">CONTRACT 1</div>
          <h2>Marrow Yard</h2>
          <p>{MISSIONS['marrow-yard']!.brief}</p>
          <ul>
            <li>Win: every Directorate walker destroyed.</li>
            <li>Lose: every Lantern walker down, or round {MISSIONS['marrow-yard']!.roundLimit} ends.</li>
            <li>Fee {MISSIONS['marrow-yard']!.fee.toLocaleString()} cr · {MISSIONS['marrow-yard']!.bounty} cr a kill · bonus {MISSIONS['marrow-yard']!.bonus.toLocaleString()} cr by round {MISSIONS['marrow-yard']!.bonusRound}.</li>
            <li>Salvage: limbs and weapons that survive a kill are yours.</li>
          </ul>
        </div>
        {!atEnd ? (
          <div className="speaker" data-testid="speaker">
            <Portrait id={line.who} />
            <div><div className="who">{line.name}</div><p className="line">“{line.text}”</p></div>
          </div>
        ) : <div className="speaker done"><p className="line">The Lanterns roll out of the shed into the rain.</p></div>}
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
  if (!r) return <Hangar />;
  const win = r.winner === 'player';
  const grouped = new Map<string, number>();
  for (const s of r.salvage) { const k = `${s.kind}:${s.id}`; grouped.set(k, (grouped.get(k) ?? 0) + 1); }
  const total = r.credits.fee + r.credits.bonus + r.credits.bounty;
  return (
    <div className="screen debrief" style={{ backgroundImage: `url(art/${win ? 'debrief' : 'defeat'}.jpg)` }} data-testid="debrief">
      <div className="sheet">
        <div className="k">DEBRIEF · MARROW YARD</div>
        <h2>{win ? 'Contract fulfilled' : 'Contract withdrawn'}</h2>
        <div className="speaker"><Portrait id="aske" /><p className="line">“{win ? 'The yard is ours, and the train comes through at noon. Good work, Captain. Your salvage is on the flatbeds.' : "Pull back, Captain. We'll find another way into Kerrow."}”</p></div>
        <table className="tally"><tbody>
          <tr><td>Rounds</td><td>{r.rounds}</td></tr>
          <tr><td>Directorate walkers destroyed</td><td>{r.lost.hostile}</td></tr>
          <tr><td>Lantern walkers lost (pilots ejected)</td><td>{r.lost.player}</td></tr>
          {win && <><tr><td>Contract fee</td><td>{r.credits.fee.toLocaleString()} cr</td></tr><tr><td>Kill bounty</td><td>{r.credits.bounty.toLocaleString()} cr</td></tr><tr><td>Speed bonus</td><td>{r.credits.bonus ? `${r.credits.bonus.toLocaleString()} cr` : 'missed'}</td></tr><tr className="sum"><td>Paid</td><td>{total.toLocaleString()} cr</td></tr></>}
        </tbody></table>
        {win && <><div className="k">SALVAGE ON THE FLATBEDS</div><ul className="salvage">{[...grouped.entries()].map(([k, n]) => { const [kind, id] = k.split(':') as ['arm', string]; return <li key={k}><b>{n}×</b> {itemName(kind, id)}</li>; })}</ul></>}
        <div className="brief-buttons">
          {win ? <button className="primary" data-testid="to-hangar" onClick={() => { audio.play('salvage'); useGame.getState().setScreen('hangar'); }}>To the hangar ({c.credits.toLocaleString()} cr)</button>
            : <><button className="primary" data-testid="retry" onClick={() => { audio.music('battle', 1200); audio.loop('rain-loop', 1200); useGame.getState().retry(); }}>Retry the contract</button><button className="ghost" onClick={() => useGame.getState().setScreen('title')}>Title</button></>}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Next contract (stub)
export function NextContract() {
  return (
    <div className="screen briefing" data-testid="next">
      <div className="brief-map region"><img src="art/region-map.jpg" alt="" draggable={false} /><div className="acetate" /><div className="map-label">VELL BASIN · THE KERROW LOCKS</div></div>
      <div className="brief-side">
        <div className="contract">
          <div className="k">CONTRACT 2</div>
          <h2>The Kerrow Locks</h2>
          <p>The Directorate holds the canal locks below Kerrow. Night, fog, narrow quays and a lock gate that can be blown.</p>
          <p className="hint">This build ends here: contract 2 is the next level to build on this engine. Your company, credits and salvage are saved.</p>
        </div>
        <div className="brief-buttons">
          <button className="primary" onClick={() => useGame.getState().setScreen('hangar')}>Back to the hangar</button>
          <button className="ghost" onClick={() => useGame.getState().setScreen('title')}>Title</button>
        </div>
      </div>
    </div>
  );
}

import { Hangar } from './Hangar';
export { Hangar };
