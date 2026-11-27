import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import { maxHp, seenBy } from '../../engine/query';
import type { PartSlot, Unit } from '../../engine/types';
import { anchors, anims } from '../presenter';
import { useGame } from '../store';
import { buildWalker, disposeWalker, setWear } from './kit';
import { tileToWorld } from './world';

const ringGeo = new THREE.RingGeometry(0.36, 0.43, 32);
const ringMats = {
  player: new THREE.MeshBasicMaterial({ color: '#ff8a2a', transparent: true, opacity: 0.85, depthWrite: false }),
  hostile: new THREE.MeshBasicMaterial({ color: '#e0352a', transparent: true, opacity: 0.8, depthWrite: false }),
  spent: new THREE.MeshBasicMaterial({ color: '#6c7277', transparent: true, opacity: 0.5, depthWrite: false }),
};
const tmp = new THREE.Vector3();

function Walker({ u }: { u: Unit }) {
  const key = `${JSON.stringify(u.build)}|${JSON.stringify(u.paint)}`;
  const model = useMemo(() => buildWalker(u.build, u.paint, u.side), [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const ring = useMemo(() => { const m = new THREE.Mesh(ringGeo, ringMats[u.side]); m.rotation.x = -Math.PI / 2; m.position.y = 0.02; m.raycast = () => {}; return m; }, [u.side]);
  useEffect(() => () => disposeWalker(model), [model]);

  useFrame(() => {
    const a = anims.get(u.id);
    const shown = useGame.getState().shown?.units.find((x) => x.id === u.id);
    if (!a || !shown) return;
    const p = tileToWorld(a.x, a.y, a.level);
    model.root.position.copy(p);
    // FOG-4: at night an enemy the player cannot see is not drawn (its "?" shows where it was last seen).
    const st = useGame.getState().shown!;
    const hidden = !!st.night && shown.side !== 'player' && shown.alive && !seenBy(st, 'player', shown);
    model.root.visible = !hidden; ring.visible = !hidden && a.fall <= 0;
    if (hidden) return;
    // Turn smoothly toward the facing.
    let d = a.facing - model.root.rotation.y;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    model.root.rotation.y += d * 0.18;
    // Walk cycle: legs swing, the body bobs.
    const sw = Math.sin(a.walk * 2.2) * Math.min(1, Math.abs(a.walk) > 0.01 && a.moving ? 1 : 0) * 0.42;
    model.legL.rotation.x = sw; model.legR.rotation.x = -sw;
    model.kneeL.rotation.x = Math.max(0, -sw) * 0.9; model.kneeR.rotation.x = Math.max(0, sw) * 0.9;
    model.upper.position.y = model.hipY + 0.07 + (a.moving ? Math.abs(Math.cos(a.walk * 2.2)) * 0.03 : 0);
    model.upper.rotation.x = a.lunge * 0.35 - a.hit * 0.12;
    model.upper.position.z = a.lunge * 0.25;
    for (const [slot, part] of [['L', 'armL'], ['R', 'armR']] as const) model.parts[part].rotation.x = -(a.recoil[slot] ?? 0) * 0.18;
    // Parts: hidden when lost, darker as they wear.
    for (const p2 of ['body', 'armL', 'armR', 'legs'] as PartSlot[]) {
      const ratio = shown.hp[p2] / maxHp(shown, p2);
      if (p2 === 'armL' || p2 === 'armR') model.parts[p2].visible = shown.hp[p2] > 0;
      setWear(model.mats[p2], ratio);
    }
    // Lost legs: the walker kneels on its stumps.
    if (shown.hp.legs <= 0) { model.legL.rotation.x = -0.9; model.legR.rotation.x = 0.3; model.kneeL.rotation.x = 1.6; model.root.position.y -= 0.22; }
    // Destroyed: topple and sink into a wreck.
    if (a.fall > 0) {
      model.root.rotation.z = a.fall * 1.25;
      model.root.position.y -= a.fall * 0.28;
      for (const m of Object.values(model.mats)) m.color.setScalar(0.32);
      ring.visible = false;
    } else {
      ring.visible = true;
      ring.material = shown.side === 'player' && shown.done ? ringMats.spent : ringMats[u.side];
    }
    // Publish anchors for the presenter's muzzle flashes and hit points.
    model.root.updateMatrixWorld(true);
    const muzzle: Partial<Record<'L' | 'R' | 'P', THREE.Vector3>> = {};
    for (const [k, o] of Object.entries(model.muzzles)) if (o) muzzle[k as 'L'] = o.getWorldPosition(new THREE.Vector3());
    const part = {
      body: model.parts.body.getWorldPosition(new THREE.Vector3()).add(tmp.set(0, 0.22, 0)),
      armL: model.parts.armL.getWorldPosition(new THREE.Vector3()).add(tmp.set(0, -0.1, 0)),
      armR: model.parts.armR.getWorldPosition(new THREE.Vector3()).add(tmp.set(0, -0.1, 0)),
      legs: model.parts.legs.getWorldPosition(new THREE.Vector3()).add(tmp.set(0, -0.25, 0)),
    };
    anchors.set(u.id, { muzzle, part });
  });

  return (
    <group>
      <primitive object={model.root} />
      <primitive object={ring} />
      <RingFollow ring={ring} id={u.id} />
    </group>
  );
}

function RingFollow({ ring, id }: { ring: THREE.Mesh; id: string }) {
  useFrame(() => { const a = anims.get(id); if (a) { const p = tileToWorld(a.x, a.y, a.level); ring.position.set(p.x, p.y + 0.02, p.z); } });
  return null;
}

/** FOG-7: a grease-pencil "?" where each unseen enemy was last seen. */
function questionTexture(): THREE.Texture {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.strokeStyle = 'rgba(224,53,42,0.95)'; g.lineWidth = 7; g.setLineDash([14, 9]);
  g.beginPath(); g.arc(64, 64, 52, 0, Math.PI * 2); g.stroke();
  g.fillStyle = 'rgba(255,190,170,0.95)'; g.font = 'bold 76px Kalam, cursive'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('?', 64, 70);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function IntelMarks() {
  const sprites = useMemo(() => { const map = questionTexture(); return Array.from({ length: 8 }, () => { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map, depthWrite: false, transparent: true, opacity: 0.9 })); sp.scale.set(0.8, 0.8, 0.8); sp.visible = false; sp.raycast = () => {}; return sp; }); }, []);
  useFrame(() => {
    const st = useGame.getState().shown;
    const marks: { x: number; y: number }[] = [];
    if (st?.night) for (const [id, p] of Object.entries(st.intel?.player ?? {})) {
      const w = st.units.find((x) => x.id === id);
      if (w && w.alive && !seenBy(st, 'player', w)) marks.push(p);
    }
    sprites.forEach((sp, i) => {
      const m = marks[i];
      if (!m || !st) { sp.visible = false; return; }
      const wp = tileToWorld(m.x, m.y, st.tiles[m.y * st.w + m.x]?.h ?? 0);
      sp.position.set(wp.x, wp.y + 0.55, wp.z); sp.visible = true;
    });
  });
  return <>{sprites.map((sp, i) => <primitive key={i} object={sp} />)}</>;
}

export function Walkers() {
  const units = useGame((s) => s.shown?.units ?? []);
  return <>{units.map((u) => <Walker key={u.id} u={u} />)}<IntelMarks /></>;
}
