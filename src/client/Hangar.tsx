import * as THREE from 'three';
import { Canvas, useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useState } from 'react';
import { PARTS, RULES, pilot as pilotDef } from '../engine/data';
import { equip, itemMaxHp, itemName, pilotRecord, repair, repairAllCost, repairCost, repaint, walkerSummary, type Campaign, type EquipSlot, type Item, type RosterWalker } from '../engine/campaign';
import type { PaintSlot, PartSlot } from '../engine/types';
import { audio } from './audio';
import { buildWalker, disposeWalker, setWear } from './board/kit';
import { preloadTextures } from './board/textures';
import { Portrait } from './Hud';
import { useGame } from './store';
import { maxHp } from '../engine/query';

const SLOTS: { slot: EquipSlot; label: string; kind: Item['kind']; part?: PartSlot; paint?: PaintSlot }[] = [
  { slot: 'body', label: 'Body', kind: 'body', part: 'body', paint: 'body' },
  { slot: 'armL', label: 'Left arm', kind: 'arm', part: 'armL', paint: 'armL' },
  { slot: 'armR', label: 'Right arm', kind: 'arm', part: 'armR', paint: 'armR' },
  { slot: 'legs', label: 'Legs', kind: 'legs', part: 'legs', paint: 'legs' },
  { slot: 'pack', label: 'Backpack', kind: 'pack', paint: 'pack' },
  { slot: 'wL', label: 'Left hand', kind: 'weapon' },
  { slot: 'wR', label: 'Right hand', kind: 'weapon' },
];

function slotId(r: RosterWalker, slot: EquipSlot): string | null {
  if (slot === 'wL' || slot === 'wR') return r.build[slot];
  if (slot === 'pack') return r.build.pack === 'pack-none' ? null : r.build.pack;
  return r.build[slot];
}

function Turntable({ r }: { r: RosterWalker }) {
  const key = JSON.stringify([r.build, r.paint]);
  const model = useMemo(() => buildWalker(r.build, r.paint, 'player'), [key]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => disposeWalker(model), [model]);
  useFrame((_, dt) => {
    model.root.rotation.y += dt * 0.35;
    for (const p of ['body', 'armL', 'armR', 'legs'] as PartSlot[]) setWear(model.mats[p], r.hp[p] / maxHp({ build: r.build } as never, p));
  });
  return <primitive object={model.root} />;
}

function Delta({ a, b, unit = '', invert }: { a: number; b: number; unit?: string; invert?: boolean }) {
  if (a === b) return <span className="d0">{b}{unit}</span>;
  const better = invert ? b < a : b > a;
  return <span className={better ? 'dup' : 'ddown'}>{a}{unit} → {b}{unit}</span>;
}

export function Hangar() {
  const c = useGame((g) => g.campaign);
  const [pilot, setPilot] = useState(c.roster[0]!.pilot);
  const [slot, setSlot] = useState<EquipSlot | null>(null);
  const [msg, setMsg] = useState('');
  const [ready, setReady] = useState(false);
  useEffect(() => { audio.music('hangar', 1500); audio.loop('hangar-loop', 1500); void preloadTextures().then(() => setReady(true)); }, []);
  const r = c.roster.find((x) => x.pilot === pilot)!;
  const sum = walkerSummary(r);
  const apply = (res: Campaign | string, sfx: string) => { if (typeof res === 'string') { setMsg(res); audio.play('cancel'); return; } audio.play(sfx); setMsg(''); useGame.getState().setCampaign(res); };
  const sel = slot ? SLOTS.find((s) => s.slot === slot)! : null;
  const options = sel ? c.inventory.filter((i) => i.kind === sel.kind) : [];
  const grouped = new Map<string, Item[]>();
  for (const it of options) { const k = `${it.id}|${it.paint}|${it.hp}`; grouped.set(k, [...(grouped.get(k) ?? []), it]); }

  return (
    <div className="screen hangar" style={{ backgroundImage: 'url(art/hangar.jpg)' }} data-testid="hangar">
      <div className="hangar-top">
        <div className="k">GREY LANTERN COMPANY · HANGAR</div>
        <div className="credits" data-testid="credits">{c.credits.toLocaleString()} cr</div>
      </div>
      <div className="roster">
        {c.roster.map((w) => (
          <button key={w.pilot} className={`ros${w.pilot === pilot ? ' on' : ''}`} onClick={() => { audio.play('ui-tick'); setPilot(w.pilot); setSlot(null); }}>
            <Portrait id={w.pilot} small />
            <span><b>{pilotDef(w.pilot).call}</b><br />{pilotDef(w.pilot).name}{w.hp.body <= 0 ? <em> · body wrecked</em> : repairAllCost(w) > 0 ? <em> · damaged</em> : ''}</span>
          </button>
        ))}
      </div>
      <div className="bay">
      <div className="turntable">{ready && (
        <Canvas shadows camera={{ position: [0, 1.25, 4.9], fov: 30 }} gl={{ alpha: true }} onCreated={({ camera }) => camera.lookAt(0, 0.72, 0)}>
          <hemisphereLight args={['#ffd9a8', '#2a2a2a', 0.9]} />
          <spotLight position={[1.5, 3.5, 2]} intensity={22} angle={0.6} penumbra={0.6} color="#ffe6c8" castShadow />
          <directionalLight position={[-2, 2, -2]} intensity={0.7} color="#8fb0d0" />
          <Turntable r={r} />
          <mesh rotation-x={-Math.PI / 2} receiveShadow><circleGeometry args={[0.95, 40]} /><meshStandardMaterial color="#2a2c2e" roughness={0.6} metalness={0.5} /></mesh>
        </Canvas>
      )}</div>
      {sel && (
        <div className="card inventory" data-testid="inventory">
          <div className="ap-title">{sel.label.toUpperCase()}: SALVAGE AND SPARES</div>
          {(sel.kind === 'weapon' || sel.kind === 'pack') && slotId(r, sel.slot) && <button className="fire-row" onClick={() => apply(equip(c, pilot, sel.slot, null), 'confirm')}><span className="fr-w">Take it off</span><span className="fr-n">to the racks</span></button>}
          {grouped.size === 0 && <p className="hint">Nothing on the racks fits this slot. Salvage comes from Directorate walkers you destroy.</p>}
          {[...grouped.entries()].map(([k, items]) => {
            const it = items[0]!;
            const trial = equip(c, pilot, sel.slot, it.uid);
            const after = typeof trial === 'string' ? null : walkerSummary(trial.roster.find((x) => x.pilot === pilot)!);
            const mx = itemMaxHp(it.kind, it.id);
            return (
              <button key={k} className="fire-row" onClick={() => apply(trial, 'salvage')}>
                <span className="fr-w">{items.length > 1 ? `${items.length}× ` : ''}{itemName(it.kind, it.id)}{it.paint === 'camo' ? ' ◆' : ''}</span>
                <span className="fr-c">{mx ? `${it.hp}/${mx}` : ''}</span>
                {after && <span className="fr-n">drive <Delta a={sum.drive} b={after.drive} /> · move <Delta a={sum.move} b={after.move} /> · evade <Delta a={sum.evade} b={after.evade} /> · weight <Delta a={sum.weight} b={after.weight} invert />/{after.power}{after.overweight ? ' OVER' : ''}<MoveDelta a={sum.moves} b={after.moves} /></span>}
              </button>
            );
          })}
          <p className="hint">◆ Directorate paint: repaint it in company colours for {RULES.repaintCost} cr.</p>
        </div>
      )}
      <div className="bay-label">{pilotDef(pilot).call}{r.hp.body <= 0 ? ' · BODY WRECKED: repair before the next contract' : ''}</div>
      </div>
      <div className="card slots" data-testid="slots">
        <div className="ap-title">{pilotDef(pilot).call} · {pilotDef(pilot).name}</div>
        <div className="stats"><b>DRIVE</b> {sum.drive} <b>MOVE</b> {sum.move} <b>EVADE</b> {sum.evade} <b>WEIGHT</b> <span className={sum.overweight ? 'ddown' : ''}>{sum.weight}/{sum.power}{sum.overweight ? ` OVERWEIGHT: drive −${RULES.drive.overweight}, evade −${RULES.overweightEvade}` : ''}</span></div>
        {SLOTS.map((s) => {
          const id = slotId(r, s.slot);
          const part = s.part;
          const hp = part ? r.hp[part] : 0;
          const max = part ? sum.max[part] : 0;
          const cost = part ? repairCost(r, part) : 0;
          return (
            <div key={s.slot} className={`slot${slot === s.slot ? ' on' : ''}`}>
              <button className="slot-main" onClick={() => { audio.play('ui-tick'); setSlot(slot === s.slot ? null : s.slot); }}>
                <span className="sl">{s.label}</span>
                <span className="sn">{id ? itemName(s.kind, id) : 'empty'}{s.paint && r.paint[s.paint] === 'camo' ? ' (Directorate paint)' : ''}</span>
                {part && <span className={`sh ${hp <= 0 ? 'lost' : hp < max ? 'low' : ''}`}>{hp <= 0 ? 'WRECKED' : `${hp}/${max}`}</span>}
              </button>
              {part && cost > 0 && <button className="mini" onClick={() => apply(repair(c, pilot, part), 'repair')}>Repair {cost} cr</button>}
              {s.paint && r.paint[s.paint] === 'camo' && <button className="mini" onClick={() => apply(repaint(c, pilot, s.paint!), 'confirm')}>Repaint {RULES.repaintCost} cr</button>}
            </div>
          );
        })}
        {repairAllCost(r) > 0 && <button className="wide" data-testid="repair-all" onClick={() => { let cc: Campaign | string = c; for (const p of ['body', 'armL', 'armR', 'legs'] as PartSlot[]) if (typeof cc !== 'string' && repairCost(cc.roster.find((x) => x.pilot === pilot)!, p) > 0) cc = repair(cc, pilot, p); apply(cc, 'repair'); }}>Repair everything ({repairAllCost(r)} cr)</button>}
        {msg && <div className="save-warn">{msg}</div>}
        {(() => { const pr = pilotRecord(c, pilot); return <div className="stats level" data-testid="level"><b>LEVEL</b> {pr.level} <b>XP</b> {pr.xp}{pr.next !== null ? ` (next at ${pr.next})` : ''} <b>SIGNATURES</b> {pr.signatures.join(' · ')}{pr.level < 2 && pilotDef(pilot).signature2 ? ` · level 2: ${PARTS.maneuvers[pilotDef(pilot).signature2!]?.name}` : ''}</div>; })()}
        <div className="stats moves" data-testid="moves"><b>MOVES</b> {sum.moves.length ? sum.moves.join(' · ') : 'none from parts'}</div>
        <div className="weps">{sum.weapons.map((w) => <div key={w.slot} className="wep"><span className="ws">{w.slot === 'P' ? 'PACK' : w.slot === 'L' ? 'L.HAND' : 'R.HAND'}</span><span className="wn">{w.name}</span><span className="wd">{w.cls === 'shield' ? 'guard' : `${w.range[0]}-${w.range[1]} · acc ${w.acc}`} · {w.modes.map((m) => `${m.name} ${m.dp} DP${m.shots ? ` ${m.shots}×${m.dmg}` : ''}`).join(' · ')}</span></div>)}</div>
      </div>
      <div className="hangar-foot">
        <button className="ghost" onClick={() => useGame.getState().setScreen('title')}>Title</button>
        <button className="primary" data-testid="next-contract" onClick={() => { audio.play('confirm'); useGame.getState().setScreen('next'); }}>Next contract</button>
      </div>
    </div>
  );
}

/** HGR-4: the maneuvers a swap gains (+) and loses (−). */
function MoveDelta({ a, b }: { a: string[]; b: string[] }) {
  const gain = b.filter((m) => !a.includes(m)), lose = a.filter((m) => !b.includes(m));
  if (!gain.length && !lose.length) return null;
  return <span className="moves-delta" data-testid="move-delta"> · {gain.map((m) => <span key={m} className="dup">+{m} </span>)}{lose.map((m) => <span key={m} className="ddown">−{m} </span>)}</span>;
}

export const _three = THREE;
