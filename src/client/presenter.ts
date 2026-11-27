// The presenter plays engine events back in time: walks, turns, muzzle flashes, tracers, part loss, explosions,
// camera close-ups, sound and voice. It is driven by `update(dt)` from the render loop and from window.__ib.advance,
// because a hidden pane throttles requestAnimationFrame (KB recipe section 11).
import * as THREE from 'three';
import { maneuver, pilot as pilotDef, weapon, type WeaponDef } from '../engine/data';
const pilotName = (id: string): string => pilotDef(id).name;
import { unitById } from '../engine/query';
import { RULES } from '../engine/data';
import type { BattleState, Facing, GameEvent, HitSlot, PartSlot, WeaponSlot } from '../engine/types';
import { audio } from './audio';
import { frameField, live as world, rig, shot, tileToWorld, type Rig } from './board/world';
import { aiOrder, useGame } from './store';

export interface UnitAnim { x: number; y: number; level: number; facing: number; walk: number; moving: boolean; recoil: Partial<Record<WeaponSlot, number>>; lunge: number; hit: number; fall: number }
export const anims = new Map<string, UnitAnim>();

export type FxKind = 'flash' | 'tracer' | 'spark' | 'boom' | 'smoke' | 'debris' | 'float' | 'shell' | 'eject' | 'dust' | 'heal';
export interface Fx { id: number; kind: FxKind; a: THREE.Vector3; b: THREE.Vector3; t: number; dur: number; text?: string; color?: string; size?: number; part?: PartSlot; unit?: string }
export const fxList: Fx[] = [];
let fxId = 1;
export function addFx(f: Omit<Fx, 'id' | 't'>): void { fxList.push({ ...f, id: fxId++, t: 0 }); }

/** Muzzle positions and part centres published by the walker components each frame. */
export const anchors = new Map<string, { muzzle: Partial<Record<WeaponSlot, THREE.Vector3>>; part: Record<PartSlot, THREE.Vector3> }>();

const PART_LABEL: Record<HitSlot, string> = { body: 'BODY', armL: 'L.ARM', armR: 'R.ARM', legs: 'LEGS', pack: 'PACK' };
/** Model yaw for a facing: the walker's front looks along +z at 0 (FAC-1). */
export const FACE_ANGLE: Record<Facing, number> = { N: Math.PI, E: Math.PI / 2, S: 0, W: -Math.PI / 2 };
const modeName = (weaponId: string, mode: string): string => weapon(weaponId)?.modes.find((m) => m.id === mode)?.name ?? mode;
const facingTo = (from: { x: number; y: number }, to: { x: number; y: number }): number => Math.atan2(to.x - from.x, to.y - from.y);

function levelAt(s: BattleState, x: number, y: number): number { return s.tiles[y * s.w + x]?.h ?? 0; }

export function syncAnims(s: BattleState): void {
  for (const u of s.units) {
    const a = anims.get(u.id);
    if (!a) anims.set(u.id, { x: u.x, y: u.y, level: levelAt(s, u.x, u.y), facing: FACE_ANGLE[u.facing], walk: 0, moving: false, recoil: {}, lunge: 0, hit: 0, fall: u.alive ? 0 : 1 });
    else if (!a.moving) { a.x = u.x; a.y = u.y; a.level = levelAt(s, u.x, u.y); if (u.alive) a.facing = FACE_ANGLE[u.facing]; else a.fall = 1; }
  }
}

interface Track { t: number; dur: number; tick: (t: number) => void; done: () => void }
let track: Track | null = null;
let batchEvents: GameEvent[] = [];
let batchState: BattleState | null = null;
let homeRig: Rig | null = null;
let aiWait = 0;

function partPos(id: string, part: HitSlot | null): THREE.Vector3 {
  const an = anchors.get(id);
  const a = anims.get(id);
  if (an && part) return an.part[part === 'pack' ? 'body' : part].clone().add(new THREE.Vector3(0, part === 'pack' ? 0.15 : 0, 0));
  const p = tileToWorld(a?.x ?? 0, a?.y ?? 0, a?.level ?? 0);
  p.y += 0.85;
  return p;
}
function muzzlePos(id: string, slot: WeaponSlot): THREE.Vector3 {
  return anchors.get(id)?.muzzle[slot]?.clone() ?? partPos(id, 'body');
}

function closeup(a: { x: number; y: number }, b: { x: number; y: number }): void {
  if (!useGame.getState().settings.closeups) return;
  homeRig = homeRig ?? { target: rig.target.clone(), yaw: rig.yaw, pitch: rig.pitch, distance: rig.distance };
  const pa = tileToWorld(a.x, a.y), pb = tileToWorld(b.x, b.y);
  const mid = pa.clone().lerp(pb, 0.5); mid.y = 0.6;
  const along = Math.atan2(pb.x - pa.x, pb.z - pa.z);
  const to: Rig = { target: mid, yaw: along + Math.PI / 2 + 0.35, pitch: 0.38, distance: Math.max(3.4, pa.distanceTo(pb) * 1.15 + 1.6) };
  shot.from = shot.active && shot.to ? shot.to : { target: rig.target.clone(), yaw: rig.yaw, pitch: rig.pitch, distance: rig.distance };
  shot.to = to; shot.t = 0; shot.dur = 0.45; shot.active = true;
}
function releaseCamera(): void {
  if (!shot.active || !shot.to) return;
  const home = homeRig ?? rig;
  shot.from = shot.to; shot.to = { target: home.target.clone(), yaw: home.yaw, pitch: home.pitch, distance: home.distance }; shot.t = 0; shot.dur = 0.4;
  const done = shot.to;
  setTimeout(() => { if (shot.to === done) { shot.active = false; rig.target.copy(done.target); rig.yaw = done.yaw; rig.pitch = done.pitch; rig.distance = done.distance; homeRig = null; } }, 450);
}

function shownUnit(id: string) { return useGame.getState().shown?.units.find((u) => u.id === id) ?? null; }
function mutateShown(f: (s: BattleState) => void): void {
  const s = useGame.getState().shown;
  if (!s) return;
  const c = JSON.parse(JSON.stringify(s)) as BattleState;
  f(c);
  useGame.setState({ shown: c });
}

function start(ev: GameEvent): Track {
  const g = useGame.getState();
  const s = batchState!;
  const name = (id: string) => { const u = unitById(s, id); return u ? (u.side === 'player' ? u.pilot.toUpperCase() : u.id === 'hallen' ? 'HALLEN' : u.id.toUpperCase()) : id; };
  switch (ev.type) {
    case 'walked': {
      const a = anims.get(ev.unit)!;
      const path = ev.path;
      const per = 0.24;
      a.moving = true;
      let lastStep = -1;
      return {
        t: 0, dur: Math.max(0.05, per * (path.length - 1)),
        tick: (t) => {
          const f = Math.min(path.length - 1, t / per);
          const i = Math.floor(f), k = f - i;
          const p0 = path[i]!, p1 = path[Math.min(path.length - 1, i + 1)]!;
          a.x = p0.x + (p1.x - p0.x) * k; a.y = p0.y + (p1.y - p0.y) * k;
          a.level = levelAt(s, p0.x, p0.y) + (levelAt(s, p1.x, p1.y) - levelAt(s, p0.x, p0.y)) * k;
          if (p1.x !== p0.x || p1.y !== p0.y) a.facing = facingTo(p0, p1);
          a.walk += 0.2;
          if (i !== lastStep) { lastStep = i; audio.play(unitById(s, ev.unit)?.build.legs.endsWith('-l') ? 'step-light' : 'step-heavy', { gain: 0.7 }); if (i === 0) audio.play('servo', { gain: 0.4 }); }
        },
        done: () => { const end = path[path.length - 1]!; a.x = end.x; a.y = end.y; a.moving = false; a.level = levelAt(s, end.x, end.y); a.facing = FACE_ANGLE[ev.facing]; mutateShown((c) => { const u = c.units.find((x) => x.id === ev.unit)!; u.x = end.x; u.y = end.y; u.facing = ev.facing; }); },
      };
    }
    case 'undo': {
      const a = anims.get(ev.unit)!;
      return { t: 0, dur: 0.05, tick: () => {}, done: () => { a.x = ev.x; a.y = ev.y; a.level = levelAt(s, ev.x, ev.y); a.facing = FACE_ANGLE[ev.facing]; } };
    }
    case 'pivot': {
      const a = anims.get(ev.unit)!;
      audio.play('servo', { gain: 0.5 });
      return { t: 0, dur: 0.3, tick: () => { a.facing = FACE_ANGLE[ev.facing]; }, done: () => mutateShown((c) => { c.units.find((x) => x.id === ev.unit)!.facing = ev.facing; }) };
    }
    case 'attack': {
      // An attack maneuver (`m:<id>`) plays as its own little weapon: melee for Kick, Ram jab and Grab, a thrown chunk for Throw.
      const man = ev.weapon.startsWith('m:') ? maneuver(ev.weapon.slice(2)) : null;
      const w: WeaponDef = man ? { name: man.name, class: man.class ?? 'melee', min: 1, max: 1, shots: 1, dmg: 0, acc: 0, weight: 0, modes: [], sfx: man.class === 'direct' ? 'container-crash' : 'ram-hit' } : weapon(ev.weapon)!;
      const attacker = anims.get(ev.unit)!, target = anims.get(ev.target)!;
      const au = shownUnit(ev.unit), tu = shownUnit(ev.target);
      if (au && tu) { attacker.facing = facingTo(au, tu); if (w.class === 'melee' || !ev.counter) closeup(au, tu); }
      const pre = g.settings.closeups && !ev.counter ? 0.5 : 0.18;
      const indirect = w.class === 'indirect';
      const melee = (w.modes.find((md) => md.id === ev.mode)?.class ?? w.class) === 'melee';
      const missile = ev.weapon === 'w-missile';
      const flight = indirect ? 0.95 : missile ? 0.5 : 0.1;
      const gap = 0.24;
      const fired = new Set<number>();
      const landed = new Set<number>();
      // FOG-5: the shooter shows at once in the muzzle flash.
      { const tside = unitById(s, ev.target)?.side; if (tside) mutateShown((c) => { const x = c.units.find((v) => v.id === ev.unit); if (x && x.side !== tside) x.flash = tside; }); }
      const lead = ev.reaction === 'return' ? 'Return fire: ' : ev.reaction === 'overwatch' ? 'Overwatch: ' : '';
      const arcNote = ev.arc === 'rear' ? ', from the rear' : ev.arc === 'front' ? '' : ', on the flank';
      g.note(man ? `${lead}${name(ev.unit)}: ${man.name} at ${name(ev.target)} (${ev.chance}%${arcNote}).` : `${lead}${name(ev.unit)} fires ${w.name}, ${modeName(ev.weapon, ev.mode)}, at ${name(ev.target)} (${ev.chance}%${arcNote}).`, unitById(s, ev.unit)?.side ?? 'note');
      return {
        t: 0, dur: pre + ev.shots.length * gap + flight + 0.55,
        tick: (t) => {
          if (melee) target.hit = 0;
          ev.shots.forEach((sh, i) => {
            const tf = pre + i * gap;
            if (t >= tf && !fired.has(i)) {
              fired.add(i);
              if (melee) { attacker.lunge = 1; if (i === 0) audio.play('servo'); }
              else {
                const m = ev.slot ? muzzlePos(ev.unit, ev.slot) : partPos(ev.unit, 'body');
                addFx({ kind: 'flash', a: m, b: m, dur: 0.09, size: indirect ? 0.35 : 0.25 });
                if (ev.slot) attacker.recoil[ev.slot] = 1;
                if (i === 0) audio.play(w.sfx ?? 'carbine');
                const dest = sh.hit && sh.part ? partPos(sh.on ?? ev.target, sh.part) : partPos(ev.target, 'body').add(new THREE.Vector3((Math.random() - 0.5) * 1.2, (Math.random() - 0.3) * 0.6, (Math.random() - 0.5) * 1.2));
                addFx({ kind: indirect ? 'shell' : 'tracer', a: m, b: dest, dur: flight + 0.04, color: missile ? '#ffd28a' : '#ffcf70' });
                if (!indirect && !missile) addFx({ kind: 'dust', a: m, b: m, dur: 0.4, size: 0.08, color: '#8a6a32' });
              }
            }
            if (t >= tf + flight && !landed.has(i)) {
              landed.add(i);
              const hitId = sh.on ?? ev.target;
              const pos = sh.hit && sh.part ? partPos(hitId, sh.part) : partPos(ev.target, 'legs').add(new THREE.Vector3((Math.random() - 0.5) * 0.9, -0.4, (Math.random() - 0.5) * 0.9));
              if (sh.hit && sh.part) {
                target.hit = 1;
                addFx({ kind: indirect || missile ? 'boom' : 'spark', a: pos, b: pos, dur: indirect || missile ? 0.7 : 0.35, size: indirect || missile ? 0.6 : 0.25 });
                addFx({ kind: 'float', a: pos.clone().add(new THREE.Vector3(0, 0.35, 0)), b: pos, dur: 1.3, text: `-${sh.dmg} ${PART_LABEL[sh.part]}${sh.on ? ' SHIELD' : ''}`, color: unitById(s, ev.target)?.side === 'player' ? '#ff6a4a' : '#ffd27a' });
                audio.play(melee ? 'ram-hit' : indirect ? 'mortar-impact' : missile ? 'missile-impact' : 'armor-hit', { gain: 0.9 });
                const part: PartSlot = sh.part === 'pack' ? 'body' : sh.part;
                mutateShown((c) => { const u = c.units.find((x) => x.id === hitId)!; u.hp[part] = Math.max(0, u.hp[part] - sh.dmg); });
                if (sh.partLost) {
                  audio.play('part-tear');
                  addFx({ kind: 'debris', a: pos, b: pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 1.6, 0, (Math.random() - 0.5) * 1.6)), dur: 1.4, part, unit: hitId });
                  addFx({ kind: 'smoke', a: pos, b: pos, dur: 2.2, size: 0.35 });
                  g.note(`${name(hitId)} loses its ${PART_LABEL[part].toLowerCase()}.`, 'note');
                  const tgt = unitById(s, hitId);
                  if (tgt?.side === 'player') void audio.voice(`${tgt.pilot}-hit`).catch(() => {});
                }
              } else {
                addFx({ kind: indirect || missile ? 'boom' : 'dust', a: pos, b: pos, dur: 0.6, size: indirect || missile ? 0.45 : 0.22, color: '#6b6156' });
                if (!melee) audio.play(indirect ? 'mortar-impact' : missile ? 'missile-impact' : 'armor-ping', { gain: 0.7 });
                addFx({ kind: 'float', a: partPos(ev.target, 'body').add(new THREE.Vector3(0, 0.45, 0)), b: pos, dur: 1.0, text: 'MISS', color: '#c9d1d6' });
              }
            }
          });
          attacker.lunge = Math.max(0, attacker.lunge - 0.08);
          for (const k of Object.keys(attacker.recoil) as WeaponSlot[]) attacker.recoil[k] = Math.max(0, (attacker.recoil[k] ?? 0) - 0.12);
          target.hit = Math.max(0, target.hit - 0.06);
        },
        done: () => { if (!ev.counter) releaseCamera(); },
      };
    }
    case 'cookOff': {
      const pos = partPos(ev.unit, 'pack');
      audio.play('explode-walker', { gain: 0.8 });
      addFx({ kind: 'boom', a: pos, b: pos, dur: 0.9, size: 0.9 });
      addFx({ kind: 'float', a: pos.clone().add(new THREE.Vector3(0, 0.6, 0)), b: pos, dur: 1.4, text: `COOK-OFF -${ev.dmg}`, color: '#ffb27a' });
      g.note(`${name(ev.unit)}'s pack ammunition cooks off.`, 'note');
      mutateShown((c) => {
        const u = c.units.find((x) => x.id === ev.unit)!; u.hp.body = Math.max(0, u.hp.body - ev.dmg); u.ammo = 0;
        for (const sp of ev.splash) { const o = c.units.find((x) => x.id === sp.target)!; o.hp.body = Math.max(0, o.hp.body - sp.dmg); }
      });
      return { t: 0, dur: 0.8, tick: () => {}, done: () => {} };
    }
    case 'pushed': {
      const a = anims.get(ev.unit)!;
      const from = { x: a.x, y: a.y, level: a.level };
      const moves = ev.result !== 'collide';
      const to = { x: ev.x, y: ev.y, level: levelAt(s, ev.x, ev.y) };
      const pos = partPos(ev.unit, 'body');
      if (ev.result === 'collide') { audio.play('armor-hit'); addFx({ kind: 'spark', a: pos, b: pos, dur: 0.4, size: 0.4 }); }
      else audio.play('servo', { gain: 0.6 });
      const label = { moved: 'PUSHED', fell: `FELL -${ev.dmg} LEGS`, water: 'INTO THE WATER', collide: `CRASH -${ev.dmg}` }[ev.result];
      addFx({ kind: 'float', a: pos.clone().add(new THREE.Vector3(0, 0.5, 0)), b: pos, dur: 1.2, text: label, color: '#ffd27a' });
      g.note(`${name(ev.unit)} is ${ev.result === 'collide' ? `slammed into ${ev.other ? name(ev.other) : 'the obstacle'}` : ev.result === 'fell' ? 'pushed off the ledge' : ev.result === 'water' ? 'pushed into the water' : 'pushed back'}.`, 'note');
      return {
        t: 0, dur: 0.35,
        tick: (t) => { if (!moves) return; const k = Math.min(1, t / 0.3); a.x = from.x + (to.x - from.x) * k; a.y = from.y + (to.y - from.y) * k; a.level = from.level + (to.level - from.level) * k * k; },
        done: () => {
          if (moves) { a.x = to.x; a.y = to.y; a.level = to.level; }
          if (ev.result === 'fell' || ev.result === 'water') addFx({ kind: 'dust', a: partPos(ev.unit, 'legs'), b: pos, dur: 1, size: 0.5, color: ev.result === 'water' ? '#8aa0a8' : '#7a7064' });
          mutateShown((c) => {
            const u = c.units.find((x) => x.id === ev.unit)!;
            u.x = ev.x; u.y = ev.y;
            if (ev.result === 'fell') u.hp.legs = Math.max(0, u.hp.legs - ev.dmg);
            if (ev.result === 'collide') u.hp.body = Math.max(0, u.hp.body - ev.dmg);
            if (ev.other) { const o = c.units.find((x) => x.id === ev.other)!; o.hp.body = Math.max(0, o.hp.body - ev.dmg); }
            if (ev.obj) { const tl = c.tiles[ev.obj.y * c.w + ev.obj.x]!; tl.objHp = Math.max(0, tl.objHp - ev.obj.dmg); if (ev.obj.broken) { tl.obj = null; tl.t = 'rubble'; } }
          });
        },
      };
    }
    case 'status': {
      const pos = partPos(ev.unit, 'body');
      const label = { pinned: 'PINNED', staggered: 'STAGGERED', down: 'KNOCKED DOWN', packOut: 'PACK OUT', braced: 'BRACED', planted: 'PLANTED', marked: 'MARKED', grabbed: 'GRABBED', released: 'LET GO' }[ev.status];
      addFx({ kind: 'float', a: pos.clone().add(new THREE.Vector3(0, 0.75, 0)), b: pos, dur: 1.3, text: label, color: '#e9e4d6' });
      if (ev.status === 'down') { const a = anims.get(ev.unit); if (a) a.hit = 1; audio.play('armor-hit', { gain: 0.6 }); }
      g.note(`${name(ev.unit)}: ${label.toLowerCase()}.`, 'note');
      return { t: 0, dur: 0.4, tick: () => {}, done: () => {} };
    }
    case 'nerve': {
      // Only the moves that change a band or are large get a float; the gauge shows the rest.
      const n = RULES.nerve, before = ev.now - ev.delta;
      const crossed = (before < n.steady) !== (ev.now < n.steady) || (before > n.shaken) !== (ev.now > n.shaken);
      if (crossed || Math.abs(ev.delta) >= 2) {
        const pos = partPos(ev.unit, 'body');
        const band = ev.now >= n.steady ? ' STEADY' : ev.now <= n.shaken ? ' SHAKEN' : '';
        addFx({ kind: 'float', a: pos.clone().add(new THREE.Vector3(0.3, 1.0, 0)), b: pos, dur: 1.3, text: `NERVE ${ev.delta > 0 ? '+' : ''}${ev.delta}${band}`, color: ev.delta > 0 ? '#9fe0a0' : '#ff9c90' });
        if (crossed && band) g.note(`${name(ev.unit)} is ${band.trim().toLowerCase()}.`, 'note');
      }
      mutateShown((c) => { const u = c.units.find((x) => x.id === ev.unit); if (u) u.nerve = ev.now; });
      return { t: 0, dur: crossed ? 0.35 : 0.02, tick: () => {}, done: () => {} };
    }
    case 'signature': {
      const sig = maneuver(ev.id);
      const u = unitById(s, ev.unit);
      useGame.setState({ banner: { text: (sig?.name ?? ev.id).toUpperCase(), sub: u ? pilotName(u.pilot) : '', until: g.clock + 1.3 } });
      audio.play(u?.side === 'player' ? 'turn-player' : 'turn-enemy', { gain: 0.6 });
      g.note(`${name(ev.unit)}: ${sig?.name ?? ev.id}${ev.targets.length ? ` (${ev.targets.map(name).join(', ')})` : ''}.`, u?.side ?? 'note');
      return { t: 0, dur: 1, tick: () => {}, done: () => {} };
    }
    case 'overdrive': {
      const pos = partPos(ev.unit, 'body');
      audio.play('servo'); addFx({ kind: 'spark', a: pos, b: pos, dur: 0.6, size: 0.5 });
      addFx({ kind: 'float', a: pos.clone().add(new THREE.Vector3(0, 0.7, 0)), b: pos, dur: 1.3, text: `OVERDRIVE +${ev.gain} DRIVE −${ev.strain}`, color: '#ffb27a' });
      g.note(`${name(ev.unit)} overdrives the reactor (+${ev.gain} drive).`, unitById(s, ev.unit)?.side ?? 'note');
      mutateShown((c) => { const u = c.units.find((x) => x.id === ev.unit)!; u.hp.body = Math.max(0, u.hp.body - ev.strain); });
      return { t: 0, dur: 0.6, tick: () => {}, done: () => {} };
    }
    case 'tow': {
      const a = anims.get(ev.unit)!, b = anims.get(ev.ally)!;
      const a0 = { x: a.x, y: a.y }, b0 = { x: b.x, y: b.y };
      audio.play('servo');
      g.note(`${name(ev.unit)} tows ${name(ev.ally)} clear.`, 'player');
      return {
        t: 0, dur: 0.6,
        tick: (t) => { const k = Math.min(1, t / 0.55); a.x = a0.x + (ev.x - a0.x) * k; a.y = a0.y + (ev.y - a0.y) * k; b.x = b0.x + (ev.ax - b0.x) * k; b.y = b0.y + (ev.ay - b0.y) * k; a.level = levelAt(s, Math.round(a.x), Math.round(a.y)); b.level = levelAt(s, Math.round(b.x), Math.round(b.y)); },
        done: () => mutateShown((c) => { const u = c.units.find((x) => x.id === ev.unit)!, v = c.units.find((x) => x.id === ev.ally)!; u.x = ev.x; u.y = ev.y; v.x = ev.ax; v.y = ev.ay; }),
      };
    }
    case 'wagon': {
      audio.play('container-crash', { gain: 0.6 });
      const lead = ev.cars[0]!;
      const n = Math.max(1, Math.abs(lead.to.y - lead.from.y) + Math.abs(lead.to.x - lead.from.x));
      g.note(`${name(ev.unit)} sends ${ev.cars.length > 1 ? `${ev.cars.length} coupled wagons` : 'a wagon'} down the line${ev.hit ? ` into ${name(ev.hit)}` : ''}.`, unitById(s, ev.unit)?.side ?? 'note');
      // Lift the wagons off their tiles at once; they reappear where they stop, with dust along the way.
      mutateShown((c) => { for (const car of ev.cars) c.tiles[car.from.y * c.w + car.from.x]!.obj = null; });
      let k = 0;
      return {
        t: 0, dur: 0.12 * n + 0.3,
        tick: (t) => {
          const stepN = Math.min(n, Math.floor(t / 0.12));
          for (; k <= stepN; k++) for (const car of ev.cars) {
            const x = car.from.x + Math.sign(car.to.x - car.from.x) * k, y = car.from.y + Math.sign(car.to.y - car.from.y) * k;
            const p = tileToWorld(x, y, levelAt(s, x, y)); p.y += 0.4;
            addFx({ kind: 'dust', a: p, b: p, dur: 0.9, size: 0.6, color: '#7a6a58' });
          }
        },
        done: () => {
          const p = tileToWorld(lead.to.x, lead.to.y, levelAt(s, lead.to.x, lead.to.y)); p.y += 0.6;
          addFx({ kind: ev.hit || ev.obj ? 'boom' : 'dust', a: p, b: p, dur: 0.6, size: 0.6, color: '#7a7064' });
          if (ev.hit) { const pos = partPos(ev.hit, 'body'); addFx({ kind: 'float', a: pos.clone().add(new THREE.Vector3(0, 0.6, 0)), b: pos, dur: 1.3, text: `WAGON −${RULES.wagon.dmg}`, color: '#ffd27a' }); audio.play('ram-hit'); mutateShown((c) => { const u = c.units.find((x) => x.id === ev.hit)!; u.hp.body = Math.max(0, u.hp.body - RULES.wagon.dmg); }); }
          mutateShown((c) => { for (const car of ev.cars) { const t = c.tiles[car.to.y * c.w + car.to.x]!; if (car.broken) { t.obj = null; t.t = 'rubble'; } else { t.obj = 'wagon'; t.objHp = car.hp; } } });
        },
      };
    }
    case 'flood': {
      audio.play('explode-walker', { gain: 0.6 }); audio.play('container-crash', { gain: 0.6 });
      useGame.setState({ banner: { text: 'THE GATE GOES', sub: 'the basin floods the low quays', until: g.clock + 1.6 } });
      g.note(`The lock gate gives way: the low quays flood.${ev.mired.length ? ` ${ev.mired.map(name).join(', ')} mired.` : ''}`, 'note');
      let k = 0;
      return {
        t: 0, dur: 1.6,
        tick: (t) => { const n = Math.floor((t / 1.4) * ev.tiles.length); for (; k < Math.min(n, ev.tiles.length); k++) { const q = ev.tiles[k]!; const p = tileToWorld(q.x, q.y, 0); p.y += 0.2; addFx({ kind: 'dust', a: p, b: p, dur: 1.2, size: 0.7, color: '#8aa0a8' }); } },
        done: () => mutateShown((c) => { for (const q of ev.tiles) c.tiles[q.y * c.w + q.x]!.t = 'water'; for (const id of ev.mired) { const u = c.units.find((x) => x.id === id); if (u) u.status.mired = true; } }),
      };
    }
    case 'bridge': {
      audio.play('servo'); audio.play('container-crash', { gain: 0.4 });
      g.note(`${name(ev.unit)} swings the bridge ${ev.open ? 'open' : 'shut'}.`, unitById(s, ev.unit)?.side ?? 'note');
      return { t: 0, dur: 0.8, tick: () => {}, done: () => mutateShown((c) => { for (const q of ev.tiles) c.tiles[q.y * c.w + q.x]!.t = ev.open ? 'deep' : 'deck'; }) };
    }
    case 'toppled': {
      audio.play('container-crash');
      const p = tileToWorld(ev.x, ev.y, levelAt(s, ev.x, ev.y)); p.y += 0.8;
      addFx({ kind: 'boom', a: p, b: p, dur: 0.8, size: 0.9 });
      g.note('A container stack topples.', 'note');
      for (const h of ev.hits) {
        const q = tileToWorld(h.x, h.y, levelAt(s, h.x, h.y)); q.y += 0.5;
        addFx({ kind: 'dust', a: q, b: q, dur: 1.6, size: 0.9, color: '#7a7064' });
        if (h.unit) { const pos = partPos(h.unit, 'body'); addFx({ kind: 'float', a: pos.clone().add(new THREE.Vector3(0, 0.6, 0)), b: pos, dur: 1.3, text: `CRUSHED −${h.dmg}`, color: '#ffd27a' }); }
      }
      mutateShown((c) => {
        const t = c.tiles[ev.y * c.w + ev.x]!; t.obj = null; t.t = 'rubble'; t.stack = false;
        for (const h of ev.hits) { const q = c.tiles[h.y * c.w + h.x]!; if (h.unit) { const u = c.units.find((x) => x.id === h.unit)!; u.hp.body = Math.max(0, u.hp.body - h.dmg); } else if (q.obj) { q.objHp = Math.max(0, q.objHp - h.dmg); if (q.objHp === 0) { q.obj = null; q.t = 'rubble'; } } else q.t = 'rubble'; }
      });
      return { t: 0, dur: 1, tick: () => {}, done: () => {} };
    }
    case 'smoke': {
      const au = shownUnit(ev.unit);
      const a = anims.get(ev.unit)!;
      if (au) a.facing = facingTo(au, ev);
      const m = muzzlePos(ev.unit, 'P');
      const land = tileToWorld(ev.x, ev.y, levelAt(s, ev.x, ev.y));
      audio.play('mortar-launch');
      addFx({ kind: 'flash', a: m, b: m, dur: 0.09, size: 0.35 });
      addFx({ kind: 'shell', a: m, b: land, dur: 0.9, color: '#d8d8d0' });
      g.note(`${name(ev.unit)} lays a smoke screen.`, 'player');
      let laid = false;
      return {
        t: 0, dur: 1.2,
        tick: (t) => { if (t > 0.9 && !laid) { laid = true; for (const p of ev.tiles) { const w = tileToWorld(p.x, p.y, levelAt(s, p.x, p.y)); w.y += 0.5; addFx({ kind: 'smoke', a: w, b: w, dur: 2.5, size: 0.9 }); } } },
        done: () => mutateShown((c) => { c.smoke = c.smoke.filter((sm) => !ev.tiles.some((p) => p.x === sm.x && p.y === sm.y)).concat(ev.tiles.map((p) => ({ ...p, side: au?.side ?? 'player' }))); }),
      };
    }
    case 'flare': {
      const m = muzzlePos(ev.unit, 'P');
      const land = tileToWorld(ev.x, ev.y, levelAt(s, ev.x, ev.y)); land.y += 2.2;
      audio.play('mortar-launch');
      addFx({ kind: 'flash', a: m, b: m, dur: 0.09, size: 0.35 });
      addFx({ kind: 'shell', a: m, b: land, dur: 0.8, color: '#fff2c8' });
      g.note(`${name(ev.unit)} puts up a flare.`, unitById(s, ev.unit)?.side ?? 'note');
      return { t: 0, dur: 0.9, tick: () => {}, done: () => mutateShown((c) => { c.flares = (c.flares ?? []).concat([{ x: ev.x, y: ev.y, side: unitById(s, ev.unit)?.side ?? 'player' }]); }) };
    }
    case 'flareOut': {
      mutateShown((c) => { c.flares = (c.flares ?? []).filter((f) => f.side !== ev.side); });
      return { t: 0, dur: 0.05, tick: () => {}, done: () => {} };
    }
    case 'ambush': {
      const pos = tileToWorld(ev.x, ev.y, levelAt(s, ev.x, ev.y)); pos.y += 1;
      audio.play('armor-ping');
      addFx({ kind: 'float', a: pos, b: pos, dur: 1.4, text: 'CONTACT!', color: '#ff9c90' });
      g.note(`${name(ev.unit)} runs into ${name(ev.enemy)} in the dark.`, 'note');
      return { t: 0, dur: 0.7, tick: () => {}, done: () => {} };
    }
    case 'smokeClear': {
      mutateShown((c) => { c.smoke = c.smoke.filter((sm) => sm.side !== ev.side); });
      return { t: 0, dur: 0.05, tick: () => {}, done: () => {} };
    }
    case 'guard': {
      g.note(`${name(ev.unit)} raises the shield over ${name(ev.target)}.`, 'player');
      audio.play('servo', { gain: 0.5 });
      return { t: 0, dur: 0.35, tick: () => {}, done: () => {} };
    }
    case 'overwatch': {
      const a = anims.get(ev.unit)!;
      a.facing = FACE_ANGLE[ev.dir];
      g.note(`${name(ev.unit)} covers the lane to the ${{ N: 'north', E: 'east', S: 'south', W: 'west' }[ev.dir]}.`, unitById(s, ev.unit)?.side ?? 'note');
      audio.play('servo', { gain: 0.5 });
      return { t: 0, dur: 0.35, tick: () => {}, done: () => mutateShown((c) => { const u = c.units.find((x) => x.id === ev.unit)!; u.facing = ev.dir; }) };
    }
    case 'standDown': {
      if (ev.reserve > 0 && unitById(s, ev.unit)?.side === 'player') g.note(`${name(ev.unit)} stands down, ${ev.reserve} in reserve.`, 'note');
      return { t: 0, dur: 0.05, tick: () => {}, done: () => {} };
    }
    case 'holdFire': {
      g.note(`${name(ev.unit)}: ${ev.on ? 'hold fire' : 'return fire'}.`, 'note');
      return { t: 0, dur: 0.05, tick: () => {}, done: () => {} };
    }
    case 'splash': {
      const pos = partPos(ev.target, 'body');
      addFx({ kind: 'spark', a: pos, b: pos, dur: 0.4, size: 0.3 });
      addFx({ kind: 'float', a: pos.clone().add(new THREE.Vector3(0, 0.5, 0)), b: pos, dur: 1.2, text: `-${ev.dmg} SPLASH`, color: '#ffb27a' });
      mutateShown((c) => { const u = c.units.find((x) => x.id === ev.target)!; u.hp.body = Math.max(0, u.hp.body - ev.dmg); });
      return { t: 0, dur: 0.35, tick: () => {}, done: () => {} };
    }
    case 'destroyed': {
      const a = anims.get(ev.unit)!;
      const pos = partPos(ev.unit, 'body');
      const u = unitById(s, ev.unit);
      audio.play('explode-walker');
      addFx({ kind: 'boom', a: pos, b: pos, dur: 1.1, size: 1.2 });
      addFx({ kind: 'smoke', a: pos, b: pos, dur: 6, size: 0.7 });
      let ejected = false;
      g.note(`${name(ev.unit)} destroyed.${u?.side === 'player' ? ' Pilot ejected.' : ''}`, u?.side === 'player' ? 'hostile' : 'player');
      return {
        t: 0, dur: 1.5,
        tick: (t) => {
          a.fall = Math.min(1, t / 0.9);
          if (t > 0.45 && !ejected) {
            ejected = true; audio.play('eject');
            addFx({ kind: 'eject', a: pos, b: pos.clone().add(new THREE.Vector3(0.6, 3, 0.4)), dur: 1.6 });
            if (u?.side === 'player') void audio.voice(`${u.pilot}-down`).catch(() => {});
            if (u?.id === 'hallen') void audio.voice('hallen-down').catch(() => {});
          }
        },
        done: () => { a.fall = 1; mutateShown((c) => { const x = c.units.find((v) => v.id === ev.unit)!; x.alive = false; }); },
      };
    }
    case 'objectHit': {
      const au = shownUnit(ev.unit);
      const a = anims.get(ev.unit)!;
      if (au) a.facing = facingTo(au, ev);
      const p = tileToWorld(ev.x, ev.y, 0); p.y = 0.5;
      const w = weapon(ev.weapon)!;
      let done = false;
      return {
        t: 0, dur: 0.9,
        tick: (t) => {
          if (!done && t > 0.15) {
            done = true;
            const m = muzzlePos(ev.unit, ev.slot);
            addFx({ kind: 'flash', a: m, b: m, dur: 0.09, size: 0.25 });
            addFx({ kind: 'tracer', a: m, b: p, dur: 0.12, color: '#ffcf70' });
            audio.play(w.sfx ?? 'carbine');
            addFx({ kind: ev.broken ? 'boom' : 'spark', a: p, b: p, dur: 0.6, size: ev.broken ? 0.8 : 0.3 });
            if (ev.broken) { audio.play('container-crash'); addFx({ kind: 'dust', a: p, b: p, dur: 1.6, size: 0.9, color: '#7a7064' }); }
          }
        },
        done: () => { mutateShown((c) => { const tl = c.tiles[ev.y * c.w + ev.x]!; if (ev.broken) { const kind = tl.obj; tl.obj = null; if (kind === 'gate') tl.t = 'deep'; else if (kind !== 'lamp') tl.t = 'rubble'; } }); },
      };
    }
    case 'repaired': {
      const pos = partPos(ev.target, ev.part);
      audio.play('repair');
      addFx({ kind: 'heal', a: pos, b: pos, dur: 0.9, size: 0.3 });
      addFx({ kind: 'float', a: pos.clone().add(new THREE.Vector3(0, 0.4, 0)), b: pos, dur: 1.3, text: `+${ev.amount} ${PART_LABEL[ev.part]}`, color: '#9fe0a0' });
      g.note(`${name(ev.unit)} repairs ${name(ev.target)} (+${ev.amount}).`, 'player');
      return { t: 0, dur: 0.9, tick: () => {}, done: () => {} };
    }
    case 'phase': {
      useGame.setState({ banner: { text: ev.side === 'player' ? 'YOUR PHASE' : 'DIRECTORATE PHASE', sub: `ROUND ${ev.round}`, until: g.clock + 1.5 } });
      audio.play(ev.side === 'player' ? 'turn-player' : 'turn-enemy');
      if (ev.side === 'hostile' && ev.round === 1) void audio.voice('intercept').catch(() => {});
      return { t: 0, dur: 1.1, tick: () => {}, done: () => {} };
    }
    case 'end': {
      audio.music(ev.result.winner === 'player' ? 'victory' : 'defeat', 600);
      audio.loop(null);
      return { t: 0, dur: 1.2, tick: () => {}, done: () => {} };
    }
    default:
      return { t: 0, dur: 0.06, tick: () => {}, done: () => {} };
  }
}

/** Advance presentation and fx by dt seconds. */
export function update(dt: number): void {
  const g = useGame.getState();
  useGame.setState({ clock: g.clock + dt });
  for (let i = fxList.length - 1; i >= 0; i--) { const f = fxList[i]!; f.t += dt; if (f.t >= f.dur) fxList.splice(i, 1); }
  for (const a of anims.values()) { if (!a.moving) a.walk *= 0.9; }
  if (track) {
    track.t += dt;
    track.tick(Math.min(track.t, track.dur));
    if (track.t >= track.dur) { const t = track; track = null; t.done(); }
    return;
  }
  if (batchEvents.length) { track = start(batchEvents.shift()!); return; }
  if (batchState) {
    const fin = batchState;
    batchState = null;
    useGame.setState({ shown: fin });
    syncAnims(fin);
  }
  const st = useGame.getState();
  if (st.queue.length) {
    const [b, ...rest] = st.queue;
    batchState = b!.state;
    batchEvents = [...b!.events];
    useGame.setState({ queue: rest, presenting: true });
    return;
  }
  if (st.presenting) useGame.setState({ presenting: false });
  // The hostile side moves when the presentation is idle.
  const lv = st.live;
  if (st.screen === 'battle' && lv && !lv.result && lv.phase === 'hostile') {
    aiWait += dt;
    if (aiWait > 0.3) { aiWait = 0; st.dispatch(aiOrder(lv)); }
  } else aiWait = 0;
}

export function resetPresenter(s: BattleState | null): void {
  track = null; batchEvents = []; batchState = null; fxList.length = 0; anims.clear(); anchors.clear(); shot.active = false; homeRig = null;
  if (s) { world.w = s.w; world.h = s.h; syncAnims(s); frameField(); }
}

/** Skip the rest of the presentation (any click skips: KB pacing lesson). */
export function skipAll(): void {
  for (let i = 0; i < 600 && (track || batchEvents.length || batchState || useGame.getState().queue.length); i++) update(0.25);
}
