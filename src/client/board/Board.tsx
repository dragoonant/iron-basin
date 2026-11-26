import * as THREE from 'three';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import { update } from '../presenter';
import { useGame } from '../store';
import { CameraRig } from './CameraRig';
import { Field } from './Field';
import { FxLayer } from './Fx';
import { Picks } from './Picks';
import { tex } from './textures';
import { Walkers } from './Walkers';
import { live, tileToWorld } from './world';

function Atmosphere() {
  const { scene, gl } = useThree();
  useEffect(() => {
    const sky = tex('sky');
    sky.mapping = THREE.EquirectangularReflectionMapping;
    scene.background = sky;
    scene.fog = new THREE.Fog('#8b949a', 16, 46);
    gl.toneMappingExposure = 1.05;
  }, [scene, gl]);
  return (
    <>
      <hemisphereLight args={['#b9c6d2', '#3b342c', 0.95]} />
      <ambientLight intensity={0.22} />
      <directionalLight
        position={[-9, 11, 6]} intensity={2.1} color="#ffe2c2" castShadow
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
      <Atmosphere />
      <CameraRig />
      <Clock />
      <Field s={shown} />
      <Picks s={shown} />
      <Walkers />
      <FxLayer />
      <SmokeTiles />
      <Rain />
    </Canvas>
  );
}
