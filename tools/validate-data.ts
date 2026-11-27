// npm run validate:data: every id the data names exists; the map is rectangular; units start on open tiles;
// combat v2 data (spec 15): modes, maneuvers, drive, nerve, facing, rails and stacks are well formed.
import { MISSIONS, PARTS, PILOTS, RULES, type ManeuverKind, type ModeDef } from '../src/engine/data';
const errs: string[] = [];
for (const m of Object.values(MISSIONS)) {
  const w = m.map[0]!.length;
  m.map.forEach((row, y) => { if (row.length !== w) errs.push(`${m.id} row ${y} width ${row.length}`); for (const ch of row) if (!m.legend[ch]) errs.push(`${m.id} unknown map char ${ch}`); });
  for (const u of m.units) {
    const ch = m.map[u.y]?.[u.x];
    if (!ch || m.legend[ch]?.[2]) errs.push(`${u.id} starts on a blocked tile`);
    if (!PILOTS[u.pilot]) errs.push(`${u.id} pilot ${u.pilot}`);
    const b = u.build;
    if (!PARTS.bodies[b.body]) errs.push(`${u.id} body ${b.body}`);
    if (!PARTS.arms[b.armL] || !PARTS.arms[b.armR]) errs.push(`${u.id} arms`);
    if (!PARTS.legs[b.legs]) errs.push(`${u.id} legs`);
    if (!PARTS.packs[b.pack]) errs.push(`${u.id} pack`);
    for (const wid of [b.wL, b.wR]) if (wid && !PARTS.weapons[wid]) errs.push(`${u.id} weapon ${wid}`);
  }
}
for (const p of Object.values(PARTS.packs)) if (p.weapon && !PARTS.weapons[p.weapon]) errs.push(`pack weapon ${p.weapon}`);

// Combat v2 (spec 15).
const int = (n: unknown, lo: number, hi: number): boolean => typeof n === 'number' && Number.isInteger(n) && n >= lo && n <= hi;
const EFFECTS = new Set<ModeDef['effect']>(['pin', 'push', 'knockdown', 'stagger', 'overwatch', 'guard', 'smoke', 'flare']);
const NEEDS = new Set<ModeDef['needs']>(['still', 'charge', 'marked']);
const KINDS = new Set<ManeuverKind>(['self', 'walk', 'trait', 'attack', 'stance', 'support', 'field', 'signature']);
for (const [wid, w] of Object.entries(PARTS.weapons)) {
  const modes = w.modes ?? [];
  if (modes.length < 2 || modes.length > 3) errs.push(`${wid} has ${modes.length} modes (2-3, D12)`);
  const seen = new Set<string>();
  for (const m of modes) {
    const at = `${wid}:${m.id}`;
    if (seen.has(m.id)) errs.push(`${at} duplicate mode id`);
    seen.add(m.id);
    if (!m.name) errs.push(`${at} no name`);
    if (!int(m.dp, 0, 5)) errs.push(`${at} dp ${m.dp}`);
    if (!int(m.shots, 0, 6)) errs.push(`${at} shots ${m.shots}`);
    if (m.effect && !EFFECTS.has(m.effect)) errs.push(`${at} effect ${m.effect}`);
    if (m.needs && !NEEDS.has(m.needs)) errs.push(`${at} needs ${m.needs}`);
    if (m.dmg !== undefined && !(m.dmg > 0)) errs.push(`${at} dmg ${m.dmg}`);
    if (m.pushes !== undefined && (!int(m.pushes, 1, 3) || m.effect !== 'push')) errs.push(`${at} pushes ${m.pushes} (1-3, push modes only)`);
    if (m.shots === 0 && !m.effect) errs.push(`${at} fires nothing and has no effect`);
    if (m.shots > 0 && w.class === 'shield' && (m.baseDmg === undefined || m.baseAcc === undefined || !m.class)) errs.push(`${at} shield mode needs class, baseAcc and baseDmg`);
    if ((m.effect === 'smoke' || m.effect === 'flare') && w.class !== 'indirect') errs.push(`${at} ${m.effect} needs indirect fire`);
  }
  if (w.class !== 'shield' && !modes.some((m) => m.shots > 0)) errs.push(`${wid} has no firing mode (RCT-2)`);
}
for (const [id, m] of Object.entries(PARTS.maneuvers)) {
  if (!KINDS.has(m.kind)) errs.push(`maneuver ${id} kind ${m.kind}`);
  if (!int(m.dp, 0, 5)) errs.push(`maneuver ${id} dp ${m.dp}`);
  if (m.nerve !== undefined && !int(m.nerve, 1, RULES.nerve.max)) errs.push(`maneuver ${id} nerve ${m.nerve}`);
  if (m.kind === 'attack' && (m.baseAcc === undefined || m.baseDmg === undefined || !m.class || m.max === undefined)) errs.push(`maneuver ${id} attack needs class, range, baseAcc, baseDmg`);
}
const known = (id: string, from: string): void => { if (!PARTS.maneuvers[id]) errs.push(`${from} names unknown maneuver ${id}`); };
for (const id of PARTS.universal) known(id, 'universal');
for (const group of ['bodies', 'arms', 'legs', 'packs'] as const) {
  for (const [pid, part] of Object.entries(PARTS[group])) {
    for (const id of part.maneuvers ?? []) { known(id, pid); if (PARTS.maneuvers[id]?.kind === 'signature') errs.push(`${pid} grants signature ${id}`); }
    if (!part.maneuvers) errs.push(`${pid} has no maneuvers list`);
  }
}
for (const [bid, b] of Object.entries(PARTS.bodies)) if (!int(b.drive, 1, 8)) errs.push(`${bid} drive ${b.drive}`);
const sigs = new Map<string, string>();
for (const [pid, p] of Object.entries(PILOTS)) {
  if (!int(p.nerve, 0, RULES.nerve.max)) errs.push(`pilot ${pid} nerve ${p.nerve}`);
  if (p.signature2) {
    if (PARTS.maneuvers[p.signature2]?.kind !== 'signature') errs.push(`pilot ${pid} signature2 ${p.signature2} is not a signature maneuver`);
    if (sigs.has(p.signature2)) errs.push(`signature ${p.signature2} shared by ${sigs.get(p.signature2)} and ${pid}`);
    sigs.set(p.signature2, pid);
  }
  if (p.signature) {
    if (PARTS.maneuvers[p.signature]?.kind !== 'signature') errs.push(`pilot ${pid} signature ${p.signature} is not a signature maneuver`);
    if (sigs.has(p.signature)) errs.push(`signature ${p.signature} shared by ${sigs.get(p.signature)} and ${pid}`);
    sigs.set(p.signature, pid);
  }
}
const n = RULES.nerve;
if (!(n.shaken < n.steady && n.steady <= n.max)) errs.push('nerve bands out of order');
if (RULES.drive.reserveCap > RULES.drive.signatureReserveCap) errs.push('reserve cap above the signature cap');
if (RULES.levels.thresholds.some((t, i, a) => i > 0 && t <= a[i - 1]!)) errs.push('level thresholds must rise');
if (!RULES.hitWeights.rear || RULES.hitWeights.rear.pack === undefined) errs.push('hit weights rear (with pack)');
for (const m of Object.values(MISSIONS)) {
  const ch = (x: number, y: number): string | undefined => m.map[y]?.[x];
  for (const u of m.units) if (!['N', 'E', 'S', 'W'].includes(u.facing)) errs.push(`${u.id} facing ${u.facing}`);
  for (const r of m.rails ?? []) {
    if (r.axis !== 'ns') errs.push(`${m.id} rail axis ${r.axis}`);
    m.map.forEach((_, y) => { const c = ch(r.x, y); const t = c ? m.legend[c] : undefined; if (!t || t[0] !== 'ballast') errs.push(`${m.id} rail x ${r.x} y ${y} is not ballast`); });
  }
  for (const [x, y] of m.stacks ?? []) if (m.legend[ch(x, y) ?? '']?.[2] !== 'container') errs.push(`${m.id} stack ${x},${y} is not a container`);
}
for (const k of ['direct', 'melee', 'indirect'] as const) if (!RULES.hitWeights[k]) errs.push(`hit weights ${k}`);
console.log(errs.length ? errs.join('\n') : 'validate:data ok');
if (errs.length) process.exit(1);
