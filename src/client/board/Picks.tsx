// Rule 25: one instanced pick mesh on the tiles owns every pointer handler; models and props never take a pick.
// The overlay draws grease-pencil squares (PLAN Q8): blue for reach, red for targets, orange for the selection.
import * as THREE from 'three';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import { RULES } from '../../engine/data';
import { ahead, dist, FACINGS, inBounds } from '../../engine/grid';
import { canHitAny, dashRange, indirectSight, laneTiles, modeIn, modes, stats, unitById, walkRange } from '../../engine/query';
import { reachable } from '../../engine/grid';
import type { BattleState, WeaponSlot } from '../../engine/types';
import { useGame } from '../store';
import { LEVEL_H, tileToWorld } from './world';

function pencilSquare(): THREE.Texture {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = 'rgba(255,255,255,0.22)'; g.fillRect(10, 10, 108, 108);
  g.strokeStyle = 'rgba(255,255,255,0.95)'; g.lineWidth = 7; g.lineCap = 'round';
  const wob = (n: number) => n + (Math.sin(n * 12.9) * 2.5);
  g.beginPath(); g.moveTo(wob(12), wob(14)); g.lineTo(wob(116), wob(10)); g.lineTo(wob(118), wob(114)); g.lineTo(wob(10), wob(117)); g.closePath(); g.stroke();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

const C = { aim: new THREE.Color('#ffb04a'), lane: new THREE.Color('#ff7a1a'), reach: new THREE.Color('#6fb4ff'), target: new THREE.Color('#ff4a32'), sel: new THREE.Color('#ff9a2a'), path: new THREE.Color('#ffffff'), threat: new THREE.Color('#ff6a5a'), obj: new THREE.Color('#ffcf4a'), hover: new THREE.Color('#e9e4d6') };

interface Mark { i: number; color: THREE.Color; scale: number }

export function marksFor(s: BattleState, selected: string | null, hover: { x: number; y: number } | null, target: string | null, targetObj: { x: number; y: number } | null, aim: { slot: WeaponSlot; mode: string } | null = null, maneuverAim: string | null = null): Mark[] {
  const out: Mark[] = [];
  const idx = (x: number, y: number) => y * s.w + x;
  const sel = selected ? unitById(s, selected) : null;
  // Every overwatch lane on the field, as faint orange pencil (RCT-3).
  for (const o of s.units) if (o.alive) for (const p of laneTiles(s, o)) out.push({ i: idx(p.x, p.y), color: o.side === 'player' ? C.lane : C.threat, scale: 0.32 });
  if (sel && sel.alive) {
    if (sel.side === 'player' && s.phase === 'player') {
      const mi = aim ? modeIn(sel, aim.slot, aim.mode) : null;
      if (mi && !sel.done) {
        if (mi.mode.effect === 'smoke') { for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) { const d = dist(sel, { x, y }); if (d >= mi.min && d <= mi.max && indirectSight(s, sel, sel, { x, y })) out.push({ i: idx(x, y), color: C.aim, scale: 0.6 }); } }
        else if (mi.mode.effect === 'overwatch') { for (const f of FACINGS) for (let n = 1; n <= mi.weapon.def.max; n++) { const p = ahead(sel, f, n); if (inBounds(s, p.x, p.y)) out.push({ i: idx(p.x, p.y), color: C.aim, scale: 0.6 }); } }
        else for (const a of s.units) if (a.alive && a.side === sel.side && a.id !== sel.id && dist(a, sel) === 1) out.push({ i: idx(a.x, a.y), color: C.aim, scale: 1 });
      }
      if (maneuverAim === 'dash' && !sel.done) for (const r of dashRange(s, sel)) out.push({ i: idx(r.x, r.y), color: C.aim, scale: 0.8 });
      if (maneuverAim === 'tow' && !sel.done) for (const a of s.units) if (a.alive && a.side === sel.side && a.id !== sel.id && dist(a, sel) === 1) out.push({ i: idx(a.x, a.y), color: C.aim, scale: 1 });
      const reach = sel.done || mi || maneuverAim ? [] : walkRange(s, sel);
      for (const r of reach) out.push({ i: idx(r.x, r.y), color: C.reach, scale: 0.92 });
      if (!sel.done && !mi && !maneuverAim) {
        for (const t of s.units) if (t.alive && t.side !== sel.side && canHitAny(s, sel, t)) out.push({ i: idx(t.x, t.y), color: C.target, scale: 0.98 });
        if (hover) {
          const t = s.tiles[idx(hover.x, hover.y)];
          const d = dist(sel, hover);
          if (t?.obj && RULES.objects[t.obj].breakable && modes(sel).some((m) => m.weapon.usable && m.shots > 0 && !m.mode.target && m.cls !== 'indirect' && d >= m.min && d <= m.max)) out.push({ i: idx(hover.x, hover.y), color: C.obj, scale: 0.5 });
        }
      }
      // The path to the hovered reachable tile.
      if (hover && reach.some((r) => r.x === hover.x && r.y === hover.y)) {
        const r = reachable(s, sel, stats(s, sel).move).find((t) => t.x === hover.x && t.y === hover.y);
        for (const p of r?.path ?? []) out.push({ i: idx(p.x, p.y), color: C.path, scale: 0.42 });
      }
    } else if (sel.side === 'hostile') {
      for (const r of reachable(s, sel, stats(s, sel).move)) out.push({ i: idx(r.x, r.y), color: C.threat, scale: 0.7 });
    }
    out.push({ i: idx(sel.x, sel.y), color: C.sel, scale: 1.04 });
  }
  if (target) { const t = unitById(s, target); if (t) out.push({ i: idx(t.x, t.y), color: C.target, scale: 1.1 }); }
  if (targetObj) out.push({ i: idx(targetObj.x, targetObj.y), color: C.obj, scale: 1.05 });
  if (hover && !out.some((m) => m.i === idx(hover.x, hover.y))) out.push({ i: idx(hover.x, hover.y), color: C.hover, scale: 0.9 });
  return out;
}

export function Picks({ s }: { s: BattleState }) {
  const n = s.w * s.h;
  const { pick, overlay } = useMemo(() => {
    const geo = new THREE.PlaneGeometry(1, 1); geo.rotateX(-Math.PI / 2);
    const pick = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false }), n);
    const overlay = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ map: pencilSquare(), transparent: true, depthWrite: false, toneMapped: false }), n);
    overlay.raycast = () => {};
    overlay.renderOrder = 5;
    const m = new THREE.Matrix4();
    for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) {
      const t = s.tiles[y * s.w + x]!;
      const p = tileToWorld(x, y, t.h); p.y += 0.004 + (t.obj ? 0.02 : 0);
      m.makeTranslation(p.x, p.y, p.z);
      pick.setMatrixAt(y * s.w + x, m);
    }
    pick.instanceMatrix.needsUpdate = true;
    pick.computeBoundingSphere();
    for (let i = 0; i < n; i++) overlay.setColorAt(i, new THREE.Color('#000'));
    return { pick, overlay };
  }, [s.w, s.h, n]); // eslint-disable-line react-hooks/exhaustive-deps
  const lastKey = useRef('');

  useFrame(() => {
    const g = useGame.getState();
    const st = g.shown;
    if (!st) return;
    const busy = g.presenting || g.queue.length > 0;
    const key = `${busy}|${g.selected}|${g.hover?.x},${g.hover?.y}|${g.target}|${g.targetObj?.x},${g.targetObj?.y}|${g.aim?.slot}${g.aim?.mode}|${g.maneuverAim}|${st.turnCount}|${st.phase}`;
    if (key === lastKey.current) return;
    lastKey.current = key;
    const marks = busy ? [] : marksFor(st, g.selected, g.hover, g.target, g.targetObj, g.aim, g.maneuverAim);
    const m = new THREE.Matrix4();
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < n; i++) overlay.setMatrixAt(i, zero);
    const best = new Map<number, Mark>();
    for (const mk of marks) best.set(mk.i, mk); // later marks win (selection, target, path)
    let k = 0;
    for (const mk of best.values()) {
      const x = mk.i % st.w, y = Math.floor(mk.i / st.w);
      const t = st.tiles[mk.i]!;
      const p = tileToWorld(x, y, t.h); p.y += 0.02 + (t.obj ? (t.obj === 'barrier' ? 0.4 : t.obj === 'wagon' ? 0.85 : 1.1) : 0);
      m.compose(p, new THREE.Quaternion(), new THREE.Vector3(mk.scale, 1, mk.scale));
      overlay.setMatrixAt(k, m); overlay.setColorAt(k, mk.color); k++;
    }
    overlay.count = Math.max(1, k);
    overlay.instanceMatrix.needsUpdate = true;
    if (overlay.instanceColor) overlay.instanceColor.needsUpdate = true;
  });

  const tileOf = (e: ThreeEvent<PointerEvent | MouseEvent>) => (e.instanceId === undefined ? null : { x: e.instanceId % s.w, y: Math.floor(e.instanceId / s.w) });
  return (
    <>
      <primitive
        object={pick}
        onPointerMove={(e: ThreeEvent<PointerEvent>) => { e.stopPropagation(); const t = tileOf(e); const h = useGame.getState().hover; if (t && (!h || h.x !== t.x || h.y !== t.y)) useGame.getState().setHover(t); }}
        onPointerOut={() => useGame.getState().setHover(null)}
        onClick={(e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); if (e.delta > 8) return; const t = tileOf(e); if (t) useGame.getState().tapTile(t.x, t.y); }}
      />
      <primitive object={overlay} />
    </>
  );
}

export const OVERLAY_LIFT = LEVEL_H;
