import * as THREE from 'three';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import { update } from '../presenter';
import { sees } from '../../engine/query';
import { useGame } from '../store';
import { CameraRig } from './CameraRig';
import { Field } from './Field';
import { FxLayer } from './Fx';
import { Picks } from './Picks';
import { tex } from './textures';
import { Walkers } from './Walkers';
import { live, tileToWorld } from './world';

function Atmosphere({ night }: { night: boolean }) {
  const { scene, gl } = useThree();
  useEffect(() => {
    if (night) {
      // FOG: a cold, wet night on the canal: moonlight, near fog, and the lamps doing the rest.
      scene.background = new THREE.Color('#0b1116');
      scene.fog = new THREE.Fog('#0d151a', 10, 34);
      gl.toneMappingExposure = 1.1;
      return;
    }
    const sky = tex('sky');
    sky.mapping = THREE.EquirectangularReflectionMapping;
    scene.background = sky;
    scene.fog = new THREE.Fog('#8b949a', 16, 46);
    gl.toneMappingExposure = 1.05;
  }, [scene, gl, night]);
  return (
    <>
      <hemisphereLight args={night ? ['#5a6f88', '#101418', 0.42] : ['#b9c6d2', '#3b342c', 0.95]} />
      <ambientLight intensity={night ? 0.1 : 0.22} />
      <directionalLight
        position={[-9, 11, 6]} intensity={night ? 0.55 : 2.1} color={night ? '#9db4d8' : '#ffe2c2'} castShadow
        shadow-mapSize={[2048, 2048]} shadow-bias={-0.0004}
        shadow-camera-left={-14} shadow-camera-right={14} shadow-camera-top={14} shadow-camera-bottom={-14} shadow-camera-far={50}
      />
      <directionalLight position={[8, 6, -10]} intensity={0.45} color="#9fb4c8" />
    </>
  );
}

/** Light rain: streaks recycled around the camera target. */
function Rain() {
  const { mesh, count } = useMemo(() => {
    const count = 900;
    const g = new THREE.BoxGeometry(0.006, 0.28, 0.006);
    const m = new THREE.InstancedMesh(g, new THREE.MeshBasicMaterial({ color: '#c9d4de', transparent: true, opacity: 0.32, depthWrite: false }), count);
    m.raycast = () => {};
    m.frustumCulled = false;
    return { mesh: m, count };
  }, []);
  const drops = useMemo(() => Array.from({ length: count }, (_, i) => new THREE.Vector3((Math.sin(i * 12.9) * 0.5 + 0.5) * 30 - 15, (i * 0.37) % 9, (Math.cos(i * 7.3) * 0.5 + 0.5) * 30 - 15)), [count]);
  const mat = useMemo(() => new THREE.Matrix4(), []);
  const tilt = useMemo(() => new THREE.Quaternion().setFromEuler(new THREE.Euler(0.12, 0, 0.08)), []);
  useFrame((_, dt) => {
    const step = Math.min(dt, 0.05) * 9;
    for (let i = 0; i < count; i++) {
      const d = drops[i]!;
      d.y -= step; d.z += step * 0.1; d.x += step * 0.07;
      if (d.y < -0.3) d.y += 9;
      mat.compose(d, tilt, new THREE.Vector3(1, 1, 1));
      mesh.setMatrixAt(i, mat);
    }
    mesh.instanceMatrix.needsUpdate = true;
  });
  return <primitive object={mesh} />;
}

/** FLD-6: smoke screens that stand on their tiles until the side that laid them starts its next phase. */
function SmokeTiles() {
  const { group, puffs } = useMemo(() => {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d')!;
    const gr = g.createRadialGradient(32, 32, 3, 32, 32, 32);
    gr.addColorStop(0, 'rgba(196,196,188,0.8)'); gr.addColorStop(1, 'rgba(180,180,172,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    const map = new THREE.CanvasTexture(c);
    const group = new THREE.Group();
    const puffs = Array.from({ length: 27 * 3 }, () => { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map, depthWrite: false, transparent: true, opacity: 0.85 })); sp.visible = false; sp.raycast = () => {}; group.add(sp); return sp; });
    return { group, puffs };
  }, []);
  useFrame(({ clock }) => {
    const sm = useGame.getState().shown?.smoke ?? [];
    const st = useGame.getState().shown;
    const t = clock.elapsedTime;
    puffs.forEach((p, i) => {
      const tileI = Math.floor(i / 3), k = i % 3;
      const m = sm[tileI];
      if (!m || !st) { p.visible = false; return; }
      const w = tileToWorld(m.x, m.y, st.tiles[m.y * st.w + m.x]?.h ?? 0);
      const ph = tileI * 1.7 + k * 2.1;
      p.position.set(w.x + Math.sin(ph + t * 0.3) * 0.25, w.y + 0.45 + k * 0.35 + Math.sin(t * 0.5 + ph) * 0.05, w.z + Math.cos(ph + t * 0.25) * 0.25);
      const sc = 1.35 + k * 0.25 + Math.sin(t * 0.4 + ph) * 0.08;
      p.scale.set(sc, sc, sc);
      p.visible = true;
    });
  });
  return <primitive object={group} />;
}

/** FOG-1: darken the tiles none of the player's walkers can see. */
function FogTiles() {
  const n = 32 * 32;
  const mesh = useMemo(() => {
    const geo = new THREE.PlaneGeometry(1, 1); geo.rotateX(-Math.PI / 2);
    const m = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: '#05080b', transparent: true, opacity: 0.5, depthWrite: false }), n);
    m.raycast = () => {}; m.count = 0; m.renderOrder = 4; m.frustumCulled = false;
    return m;
  }, [n]);
  const last = useMemo(() => ({ key: '' }), []);
  useFrame(() => {
    const st = useGame.getState().shown;
    if (!st?.night) { mesh.count = 0; return; }
    const ours = st.units.filter((u) => u.alive && u.side === 'player');
    const key = `${st.turnCount}|${ours.map((u) => `${u.x},${u.y}`).join(';')}|${(st.flares ?? []).length}|${st.tiles.map((t) => (t.obj === 'lamp' ? 'l' : '')).join('')}`;
    if (key === last.key) return;
    last.key = key;
    const m4 = new THREE.Matrix4();
    let k = 0;
    for (let y = 0; y < st.h; y++) for (let x = 0; x < st.w; x++) {
      if (ours.some((u) => sees(st, u, { x, y }))) continue;
      const t = st.tiles[y * st.w + x]!;
      const p = tileToWorld(x, y, t.t === 'deep' ? 0 : t.h); p.y += t.t === 'deep' ? -0.12 : 0.012;
      m4.makeTranslation(p.x, p.y, p.z); mesh.setMatrixAt(k++, m4);
    }
    mesh.count = k; mesh.instanceMatrix.needsUpdate = true;
  });
  return <primitive object={mesh} />;
}

/** FOG-6: flares hang over their tiles until the firer's next phase. */
function FlareLights() {
  const pool = useMemo(() => Array.from({ length: 4 }, () => { const l = new THREE.PointLight('#ffe7b0', 0, 5.5, 1.4); const sp = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), new THREE.MeshBasicMaterial({ color: '#fff2c8' })); sp.raycast = () => {}; return { l, sp }; }), []);
  useFrame(({ clock }) => {
    const st = useGame.getState().shown;
    const fl = st?.flares ?? [];
    pool.forEach(({ l, sp }, i) => {
      const f = fl[i];
      if (!f || !st) { l.intensity = 0; sp.visible = false; return; }
      const p = tileToWorld(f.x, f.y, st.tiles[f.y * st.w + f.x]?.h ?? 0);
      const bob = Math.sin(clock.elapsedTime * 1.3 + i) * 0.08;
      l.position.set(p.x, p.y + 2.2 + bob, p.z); sp.position.copy(l.position); sp.visible = true;
      l.intensity = 9 + Math.sin(clock.elapsedTime * 11 + i * 3) * 0.8;
    });
  });
  return <>{pool.map(({ l, sp }, i) => <group key={i}><primitive object={l} /><primitive object={sp} /></group>)}</>;
}

function Clock() {
  useFrame((_, dt) => { if (!(window as unknown as { __ibManual?: boolean }).__ibManual) update(Math.min(dt, 0.1)); });
  return null;
}

export function Board() {
  const shown = useGame((s) => s.shown);
  if (!shown) return null;
  live.w = shown.w; live.h = shown.h;
  return (
    <Canvas shadows dpr={[1, 2]} camera={{ fov: 40, near: 0.1, far: 200 }} gl={{ antialias: true }} className="board-canvas">
      <Atmosphere night={!!shown.night} />
      <CameraRig />
      <Clock />
      <Field s={shown} />
      <Picks s={shown} />
      <Walkers />
      <FxLayer />
      <SmokeTiles />
      <FogTiles />
      <FlareLights />
      <Rain />
    </Canvas>
  );
}
