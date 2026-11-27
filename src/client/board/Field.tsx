// The yard: terrain, rails, objects and the surroundings. Nothing here takes a pick (rule 25): every mesh has a
// no-op raycast; the PickLayer owns all pointer handlers.
import * as THREE from 'three';
import { useMemo } from 'react';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { BattleState, Tile } from '../../engine/types';
import { LEVEL_H, tileToWorld } from './world';
import { tex } from './textures';

const noPick = (o: THREE.Object3D) => { o.traverse((c) => { (c as THREE.Mesh).raycast = () => {}; c.castShadow = true; c.receiveShadow = true; }); return o; };

function rand(x: number, y: number, k = 0): number {
  let h = (x * 374761393 + y * 668265263 + k * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** World-space UVs so a texture flows across tiles instead of repeating per tile. */
function worldUv(g: THREE.BufferGeometry, scale: number): THREE.BufferGeometry {
  const pos = g.attributes.position!, nor = g.attributes.normal!, uv = g.attributes.uv!;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const ny = Math.abs(nor.getY(i)), nx = Math.abs(nor.getX(i));
    if (ny > 0.5) uv.setXY(i, x * scale, z * scale);
    else if (nx > 0.5) uv.setXY(i, z * scale, y * scale);
    else uv.setXY(i, x * scale, y * scale);
  }
  return g;
}

function groundTex(t: Tile): 'wet-concrete' | 'ballast' | 'mud' | 'snow-mud' {
  if (t.t === 'ballast') return 'ballast';
  if (t.t === 'mud' || t.t === 'water') return 'mud';
  return 'wet-concrete';
}

function Terrain({ s }: { s: BattleState }) {
  const meshes = useMemo(() => {
    const groups = new Map<string, THREE.BufferGeometry[]>();
    const rails: THREE.BufferGeometry[] = [], sleepers: THREE.BufferGeometry[] = [], chunks: THREE.BufferGeometry[] = [], water: THREE.BufferGeometry[] = [];
    const canal: THREE.BufferGeometry[] = [], deep: THREE.BufferGeometry[] = [], deck: THREE.BufferGeometry[] = [];
    for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) {
      const t = s.tiles[y * s.w + x]!;
      const p = tileToWorld(x, y, t.h);
      if (t.t === 'deep') {
        // LCK-1: the canal: a dark channel bed well below the quays, deep water over it.
        const bed = new THREE.BoxGeometry(1, 0.08, 1); bed.translate(p.x, -0.46, p.z); canal.push(bed);
        const w = new THREE.PlaneGeometry(1, 1); w.rotateX(-Math.PI / 2); w.translate(p.x, -0.16, p.z); deep.push(w);
      } else {
        const hgt = 0.3 + t.h * LEVEL_H;
        const g = new THREE.BoxGeometry(1, hgt, 1);
        g.translate(p.x, hgt / 2 - 0.3, p.z);
        const key = t.h > 0 ? 'platform' : groundTex(t);
        (groups.get(key) ?? groups.set(key, []).get(key)!).push(worldUv(g, key === 'wet-concrete' ? 0.22 : 0.4));
      }
      if (t.t === 'deck') {
        // LCK-2: the swing bridge's steel deck, with a rail along each side.
        const plate = new THREE.BoxGeometry(1, 0.06, 1); plate.translate(p.x, p.y + 0.03, p.z); deck.push(plate);
        for (const dx of [-0.46, 0.46]) { const r = new THREE.BoxGeometry(0.05, 0.32, 1); r.translate(p.x + dx, p.y + 0.22, p.z); deck.push(r); }
      }
      if (t.t === 'ballast' || (t.obj === 'wagon')) {
        for (const dx of [-0.2, 0.2]) { const r = new THREE.BoxGeometry(0.04, 0.05, 1); r.translate(p.x + dx, p.y + 0.045, p.z); rails.push(r); }
        for (let k = 0; k < 3; k++) { const sl = new THREE.BoxGeometry(0.62, 0.035, 0.1); sl.translate(p.x, p.y + 0.017, p.z - 0.33 + k * 0.33); sleepers.push(sl); }
      }
      if (t.t === 'water') { const w = new THREE.PlaneGeometry(1, 1); w.rotateX(-Math.PI / 2); w.translate(p.x, p.y + 0.03, p.z); water.push(w); }
      if (t.t === 'rubble') for (let k = 0; k < 7; k++) {
        const sz = 0.08 + rand(x, y, k) * 0.16;
        const c = new THREE.BoxGeometry(sz, sz * 0.7, sz * 1.2);
        c.rotateY(rand(x, y, k + 9) * 3); c.rotateX(rand(x, y, k + 3) * 0.6);
        c.translate(p.x + (rand(x, y, k + 1) - 0.5) * 0.8, p.y + sz * 0.3, p.z + (rand(x, y, k + 2) - 0.5) * 0.8);
        chunks.push(worldUv(c, 1));
      }
    }
    const mk = (geos: THREE.BufferGeometry[], mat: THREE.Material) => geos.length ? noPick(new THREE.Mesh(mergeGeometries(geos), mat)) : null;
    const out: THREE.Object3D[] = [];
    for (const [k, geos] of groups) {
      const mat = new THREE.MeshStandardMaterial({ map: tex(k === 'platform' ? 'silo-concrete' : (k as 'mud')), roughness: k === 'wet-concrete' ? 0.62 : 0.9, metalness: 0.05, color: k === 'wet-concrete' ? '#a9a6a0' : '#ffffff' });
      const m = mk(geos, mat); if (m) out.push(m);
    }
    const r = mk(rails, new THREE.MeshStandardMaterial({ color: '#5b5550', roughness: 0.35, metalness: 0.85 })); if (r) out.push(r);
    const sl = mk(sleepers, new THREE.MeshStandardMaterial({ color: '#2d2520', roughness: 0.95 })); if (sl) out.push(sl);
    const ch = mk(chunks, new THREE.MeshStandardMaterial({ map: tex('wet-concrete'), color: '#8d8a86', roughness: 0.95 })); if (ch) out.push(ch);
    const wa = mk(water, new THREE.MeshStandardMaterial({ color: '#6d7f8a', roughness: 0.08, metalness: 0.55, transparent: true, opacity: 0.72 })); if (wa) { wa.castShadow = false; out.push(wa); }
    const cb = mk(canal, new THREE.MeshStandardMaterial({ color: '#1b2328', roughness: 1 })); if (cb) out.push(cb);
    const dw = mk(deep, new THREE.MeshStandardMaterial({ color: '#3a4d57', roughness: 0.06, metalness: 0.6, transparent: true, opacity: 0.88 })); if (dw) { dw.castShadow = false; out.push(dw); }
    const dk = mk(deck, new THREE.MeshStandardMaterial({ color: '#4a4e52', roughness: 0.45, metalness: 0.8 })); if (dk) out.push(dk);
    return out;
  }, [s.w, s.h, s.tiles.map((t) => t.t + t.h).join('')]); // eslint-disable-line react-hooks/exhaustive-deps
  return <>{meshes.map((m, i) => <primitive key={i} object={m} />)}</>;
}

const MATS = {
  rust: () => new THREE.MeshStandardMaterial({ map: tex('corrugated-rust'), roughness: 0.8, metalness: 0.35 }),
  container: () => new THREE.MeshStandardMaterial({ map: tex('container'), roughness: 0.7, metalness: 0.35 }),
  brick: () => new THREE.MeshStandardMaterial({ map: tex('brick'), roughness: 0.9 }),
  silo: () => new THREE.MeshStandardMaterial({ map: tex('silo-concrete'), roughness: 0.92 }),
  concrete: () => new THREE.MeshStandardMaterial({ map: tex('wet-concrete'), roughness: 0.8, color: '#b9b6b0' }),
  steel: () => new THREE.MeshStandardMaterial({ color: '#3b3f44', roughness: 0.5, metalness: 0.8 }),
  dark: () => new THREE.MeshStandardMaterial({ color: '#1c1d1f', roughness: 0.8 }),
  orange: () => new THREE.MeshStandardMaterial({ color: '#c9611f', roughness: 0.6, metalness: 0.3 }),
  glass: () => new THREE.MeshStandardMaterial({ color: '#101418', roughness: 0.2, emissive: new THREE.Color('#d9a35a'), emissiveIntensity: 0.12 }),
};

function box(w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number, scale = 0.6): THREE.Mesh {
  const g = worldUv(new THREE.BoxGeometry(w, h, d), scale);
  const o = new THREE.Mesh(g, m); o.position.set(x, y, z); return o;
}

function objectMesh(s: BattleState, x: number, y: number, t: Tile, mats: Record<keyof typeof MATS, THREE.MeshStandardMaterial>): THREE.Object3D | null {
  const g = new THREE.Group();
  const p = tileToWorld(x, y, t.h);
  g.position.copy(p);
  const dmg = t.obj && t.objHp > 0 ? t.objHp : 1;
  switch (t.obj) {
    case 'wagon': {
      g.add(box(0.74, 0.62, 0.96, mats.rust, 0, 0.47, 0));
      g.add(box(0.8, 0.05, 1.0, mats.rust, 0, 0.8, 0, 2));
      g.add(box(0.08, 0.5, 0.3, mats.steel, 0.38, 0.45, 0.05));
      for (const zz of [-0.32, 0.32]) for (const xx of [-0.22, 0.22]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.05, 12), mats.dark); w.rotation.z = Math.PI / 2; w.position.set(xx, 0.1, zz); g.add(w); }
      g.add(box(0.7, 0.08, 0.98, mats.dark, 0, 0.17, 0));
      break;
    }
    case 'container': {
      const tint = ['#c9b8b0', '#8a9cae', '#b8b08a', '#93a88a'][Math.floor(rand(x, y) * 4)]!;
      const m1 = mats.container.clone(); m1.color.set(tint);
      g.add(box(0.94, 0.52, 0.94, m1, 0, 0.26, 0, 2.2));
      if (rand(x, y, 5) > 0.25) { const m2 = mats.container.clone(); m2.color.set(['#bfaea6', '#7f94a8', '#bdb38e'][Math.floor(rand(x, y, 7) * 3)]!); const top = box(0.94, 0.52, 0.94, m2, 0, 0.79, 0, 2.2); top.rotation.y = (rand(x, y, 3) - 0.5) * 0.08; g.add(top); }
      break;
    }
    case 'silo': {
      const c = new THREE.Mesh(new THREE.CylinderGeometry(0.47, 0.47, 3.6, 24, 1), mats.silo); c.position.y = 1.8; g.add(c);
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.5, 0.35, 24), mats.steel); cone.position.y = 3.77; g.add(cone);
      for (const yy of [0.9, 1.9, 2.9]) { const ring = new THREE.Mesh(new THREE.TorusGeometry(0.475, 0.012, 6, 24), mats.steel); ring.rotation.x = Math.PI / 2; ring.position.y = yy; g.add(ring); }
      if ((x + y) % 2 === 0) { const ladder = box(0.08, 3.4, 0.04, mats.steel, 0.32, 1.75, 0.35); ladder.rotation.y = 0.8; g.add(ladder); }
      break;
    }
    case 'shed': {
      g.add(box(0.98, 1.55, 0.98, mats.brick, 0, 0.775, 0, 0.8));
      const roof = box(1.04, 0.08, 1.04, mats.rust, 0, 1.6, 0); roof.rotation.x = 0.08; g.add(roof);
      for (const yy of [0.5, 1.15]) g.add(box(0.6, 0.22, 0.02, mats.glass, 0, yy, 0.5));
      g.add(box(0.98, 0.06, 1.0, mats.concrete, 0, 1.4, 0));
      break;
    }
    case 'barrier': {
      const shape = new THREE.Shape([new THREE.Vector2(-0.16, 0), new THREE.Vector2(0.16, 0), new THREE.Vector2(0.06, 0.36), new THREE.Vector2(-0.06, 0.36)]);
      const ex = new THREE.ExtrudeGeometry(shape, { depth: 0.92, bevelEnabled: false });
      ex.translate(0, 0, -0.46);
      const b = new THREE.Mesh(worldUv(ex, 1.2), mats.concrete); b.rotation.y = Math.PI / 2; g.add(b);
      g.add(box(0.9, 0.04, 0.04, mats.orange, 0, 0.3, 0.075));
      break;
    }
    case 'gate': {
      // LCK-4: a lock gate across the canal: timber planks in a steel frame, a walkway on top.
      const planks = new THREE.MeshStandardMaterial({ color: '#5a4632', roughness: 0.9 });
      g.position.y = -0.46;
      g.add(box(0.34, 1.7, 1.0, planks, 0, 0.85, 0, 1.4));
      for (const yy of [0.25, 0.85, 1.45]) g.add(box(0.38, 0.08, 1.02, mats.steel, 0, yy, 0));
      g.add(box(0.6, 0.06, 1.02, mats.steel, 0.05, 1.74, 0));
      g.add(box(0.04, 0.3, 1.0, mats.orange, 0.32, 1.9, 0));
      break;
    }
    case 'lamp': {
      // LCK-6: a quay lamp post.
      g.add(box(0.08, 1.6, 0.08, mats.steel, 0, 0.8, 0));
      g.add(box(0.36, 0.06, 0.08, mats.steel, 0.14, 1.6, 0));
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), new THREE.MeshStandardMaterial({ color: '#ffe2a0', emissive: new THREE.Color('#ffcf70'), emissiveIntensity: 2.2 }));
      bulb.position.set(0.28, 1.52, 0); g.add(bulb);
      const light = new THREE.PointLight('#ffcf80', 3.2, 4.2, 1.6); light.position.set(0.28, 1.45, 0); light.castShadow = false; g.add(light);
      break;
    }
    case 'winch': {
      // LCK-3: the bridge winch: a steel housing and a big wheel.
      g.add(box(0.5, 0.5, 0.5, mats.steel, 0, 0.25, 0));
      g.add(box(0.52, 0.06, 0.52, mats.orange, 0, 0.52, 0));
      const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.035, 8, 20), mats.orange); wheel.position.set(0, 0.62, 0.28); g.add(wheel);
      break;
    }
    case 'crane': {
      for (const dz of [-0.32, 0.32]) { const leg = box(0.12, 2.7, 0.12, mats.orange, 0, 1.35, dz); g.add(leg); }
      for (const yy of [0.7, 1.4, 2.1]) g.add(box(0.06, 0.06, 0.7, mats.orange, 0, yy, 0));
      g.add(box(0.5, 0.12, 0.9, mats.steel, 0, 0.06, 0));
      break;
    }
    default:
      return null;
  }
  if (dmg < (t.obj === 'container' ? 40 : 30)) g.traverse((c) => { const m = (c as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined; if (m?.color) { const k = m.clone(); k.color.multiplyScalar(0.55); (c as THREE.Mesh).material = k; } });
  return noPick(g);
}

function Objects({ s }: { s: BattleState }) {
  const key = s.tiles.map((t) => `${t.obj ?? '-'}${t.objHp < (t.obj === 'container' ? 40 : 30) ? '!' : ''}`).join('');
  const group = useMemo(() => {
    const mats = Object.fromEntries(Object.entries(MATS).map(([k, f]) => [k, f()])) as Record<keyof typeof MATS, THREE.MeshStandardMaterial>;
    const g = new THREE.Group();
    const cranes: number[] = [];
    let craneRow = -1;
    for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) {
      const t = s.tiles[y * s.w + x]!;
      const o = objectMesh(s, x, y, t, mats);
      if (o) g.add(o);
      if (t.obj === 'crane') { cranes.push(x); craneRow = y; }
    }
    if (cranes.length >= 2) {
      const a = tileToWorld(Math.min(...cranes), craneRow), b = tileToWorld(Math.max(...cranes), craneRow);
      const beam = box(b.x - a.x + 0.4, 0.22, 0.6, mats.orange, (a.x + b.x) / 2, 2.75, a.z);
      g.add(noPick(beam));
      const cab = box(0.45, 0.35, 0.5, mats.steel, (a.x + b.x) / 2 + 0.4, 2.48, a.z); g.add(noPick(cab));
      const cable = box(0.02, 1.2, 0.02, mats.dark, (a.x + b.x) / 2 - 0.3, 2.05, a.z); g.add(noPick(cable));
      const hook = box(0.16, 0.12, 0.16, mats.steel, (a.x + b.x) / 2 - 0.3, 1.42, a.z); g.add(noPick(hook));
    }
    return g;
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return <primitive object={group} />;
}

/** Beyond the grid: a muddy apron, the rail lines running on, distant sheds and stacks so the yard sits in a place. */
function Surroundings({ s }: { s: BattleState }) {
  const g = useMemo(() => {
    const group = new THREE.Group();
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(90, 90), new THREE.MeshStandardMaterial({ map: tex('snow-mud', [22, 22]), roughness: 0.95, color: '#b8b6b2' }));
    ground.rotation.x = -Math.PI / 2; ground.position.y = -0.302; ground.receiveShadow = true; group.add(ground);
    const steel = new THREE.MeshStandardMaterial({ color: '#4a4744', roughness: 0.4, metalness: 0.8 });
    const brick = new THREE.MeshStandardMaterial({ map: tex('brick'), roughness: 0.9, color: '#8d8a88' });
    const cont = new THREE.MeshStandardMaterial({ map: tex('container'), roughness: 0.8, color: '#7f8d97' });
    const rust = new THREE.MeshStandardMaterial({ map: tex('corrugated-rust'), roughness: 0.85 });
    const railCols = [...new Set(s.tiles.map((t, i) => (t.rail ? i % s.w : -1)).filter((x) => x >= 0))];
    for (const rx of railCols) for (const end of [-1, 1]) {
      const p = tileToWorld(rx, end < 0 ? 0 : s.h - 1);
      for (const dx of [-0.2, 0.2]) { const r = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.05, 20), steel); r.position.set(p.x + dx, -0.25, p.z + end * 10.5); group.add(r); }
    }
    // The canal runs on past both edges (Kerrow).
    const canalRows = [...new Set(s.tiles.map((t, i) => (t.t === 'deep' && (i % s.w === 0 || i % s.w === s.w - 1) ? Math.floor(i / s.w) : -1)).filter((y) => y >= 0))];
    const deepMat = new THREE.MeshStandardMaterial({ color: '#3a4d57', roughness: 0.06, metalness: 0.6, transparent: true, opacity: 0.9 });
    for (const cy of canalRows) for (const end of [-1, 1]) {
      const p = tileToWorld(end < 0 ? 0 : s.w - 1, cy);
      const w = new THREE.Mesh(new THREE.PlaneGeometry(22, 1), deepMat); w.rotation.x = -Math.PI / 2; w.position.set(p.x + end * 11.5, -0.2, p.z); group.add(w);
    }
    const onCanal = (z: number) => canalRows.some((cy) => Math.abs(tileToWorld(0, cy).z - z) < 1.3);
    // West, east and north: rows of stacked containers and brick sheds like the yard's own, never on the camera's side.
    for (let i = 0; i < 34; i++) {
      const side = i % 3;
      const k = Math.floor(i / 3);
      const off = 1.6 + (k % 3) * 1.25 + rand(i, 7) * 0.3;
      const along = -s.h / 2 + 1 + (k * 1.9) % (s.h + 4) + rand(i, 3) * 0.4;
      const x = side === 0 ? -s.w / 2 - off : side === 1 ? s.w / 2 + off : -s.w / 2 + ((k * 1.7) % (s.w + 6)) - 3;
      const z = side === 2 ? -s.h / 2 - off - 0.4 : along;
      if (side === 2 && Math.abs(x) < 1.5) continue;
      if (side !== 2 && onCanal(z)) continue;
      const shed = rand(i, 11) < 0.3;
      if (shed) {
        const h = 1.3 + rand(i, 2) * 0.8;
        const m = new THREE.Mesh(worldUv(new THREE.BoxGeometry(1.6, h, 1.4), 0.8), brick); m.position.set(x, h / 2 - 0.3, z); group.add(m);
        const roof = new THREE.Mesh(worldUv(new THREE.BoxGeometry(1.7, 0.08, 1.5), 1), rust); roof.position.set(x, h - 0.26, z); group.add(roof);
      } else {
        const stack = 1 + Math.floor(rand(i, 5) * 3);
        for (let j = 0; j < stack; j++) {
          const m = new THREE.Mesh(worldUv(new THREE.BoxGeometry(side === 2 ? 1.9 : 0.94, 0.52, side === 2 ? 0.94 : 1.9), 2.2), cont);
          m.position.set(x + (rand(i, j) - 0.5) * 0.08, 0.26 - 0.3 + j * 0.53, z); m.rotation.y = (rand(i, j + 4) - 0.5) * 0.06; group.add(m);
        }
      }
    }
    // A distant row of silos and a chimney to the north.
    for (let k = 0; k < 4; k++) { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 6, 20), new THREE.MeshStandardMaterial({ map: tex('silo-concrete'), roughness: 0.9 })); c.position.set(-9 + k * 1.9, 2.7, -s.h / 2 - 16); group.add(c); }
    const chim = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, 9, 14), brick); chim.position.set(10, 4.2, -s.h / 2 - 14); group.add(chim);
    group.traverse((o) => { (o as THREE.Mesh).raycast = () => {}; });
    return group;
  }, [s.w, s.h, s.mission]); // eslint-disable-line react-hooks/exhaustive-deps
  return <primitive object={g} />;
}

export function Field({ s }: { s: BattleState }) {
  return (
    <>
      <Terrain s={s} />
      <Objects s={s} />
      <Surroundings s={s} />
    </>
  );
}
