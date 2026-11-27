import { RULES } from './data';
import type { Arc, BattleState, Facing, Pos, Tile, Unit } from './types';

export type { Pos };
export const key = (x: number, y: number): string => `${x},${y}`;
export const inBounds = (s: BattleState, x: number, y: number): boolean => x >= 0 && y >= 0 && x < s.w && y < s.h;
export const tileAt = (s: BattleState, x: number, y: number): Tile | null => (inBounds(s, x, y) ? s.tiles[y * s.w + x] ?? null : null);
export const dist = (a: Pos, b: Pos): number => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
export const unitAt = (s: BattleState, x: number, y: number): Unit | null => s.units.find((u) => u.alive && u.x === x && u.y === y) ?? null;

/** Bresenham line from a to b, both ends included (MAP-4). */
export function line(a: Pos, b: Pos): Pos[] {
  const out: Pos[] = [];
  let x0 = a.x, y0 = a.y;
  const dx = Math.abs(b.x - x0), dy = -Math.abs(b.y - y0);
  const sx = x0 < b.x ? 1 : -1, sy = y0 < b.y ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    out.push({ x: x0, y: y0 });
    if (x0 === b.x && y0 === b.y) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
  return out;
}

/** LCK-1: can a walker stand here at all (ignoring other walkers)? */
export const standable = (t: Tile | null): boolean => !!t && !t.obj && !RULES.impassable.includes(t.t);
export const smokeAt = (s: BattleState, x: number, y: number): boolean => s.smoke.some((m) => m.x === x && m.y === y);

/** MAP-4: containers, sheds and silos on an intermediate tile block sight; so does smoke (FLD-6). */
export function hasLos(s: BattleState, a: Pos, b: Pos): boolean {
  const pts = line(a, b);
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i]!;
    const t = tileAt(s, p.x, p.y);
    if (t?.obj && RULES.objects[t.obj].blocksSight) return false;
    if (smokeAt(s, p.x, p.y)) return false;
  }
  return true;
}

/** MAP-5: the last tile before the target on the line holds a cover object; FLD-6: or the target stands in smoke;
 * MAN-5: a planted walker counts as a cover object. */
export function hasCover(s: BattleState, attacker: Pos, target: Pos): boolean {
  if (smokeAt(s, target.x, target.y)) return true;
  const pts = line(attacker, target);
  if (pts.length < 3) return false;
  const p = pts[pts.length - 2]!;
  const t = tileAt(s, p.x, p.y);
  if (t?.obj && RULES.objects[t.obj].cover) return true;
  return s.units.some((w) => w.alive && w.status.planted && w.x === p.x && w.y === p.y);
}

// Facing (FAC-1, FAC-2).
export const FACINGS: Facing[] = ['N', 'E', 'S', 'W'];
export const DIR: Record<Facing, Pos> = { N: { x: 0, y: -1 }, E: { x: 1, y: 0 }, S: { x: 0, y: 1 }, W: { x: -1, y: 0 } };
const CLOCKWISE: Record<Facing, Facing> = { N: 'E', E: 'S', S: 'W', W: 'N' };
export const ahead = (p: Pos, f: Facing, n = 1): Pos => ({ x: p.x + DIR[f].x * n, y: p.y + DIR[f].y * n });
/** The 4-way direction from a to an adjacent or in-line b; null if they are not in line. */
export function dirTo(a: Pos, b: Pos): Facing | null {
  const dx = b.x - a.x, dy = b.y - a.y;
  if ((dx === 0) === (dy === 0)) return null;
  return dx > 0 ? 'E' : dx < 0 ? 'W' : dy > 0 ? 'S' : 'N';
}
/** FAC-2: where `from` sits as seen by a walker at `at` facing `f`. */
export function arcOf(at: Pos, f: Facing, from: Pos): Arc {
  const vx = from.x - at.x, vy = from.y - at.y;
  const d = DIR[f], r = DIR[CLOCKWISE[f]];
  const a = vx * d.x + vy * d.y, c = vx * r.x + vy * r.y;
  if (a > Math.abs(c)) return 'front';
  if (-a > Math.abs(c)) return 'rear';
  return c > 0 ? 'right' : 'left';
}

/** Cost to step onto a tile from a neighbour (MAP-2); Infinity if blocked. */
export function stepCost(s: BattleState, from: Pos, to: Pos, hop = false): number {
  const a = tileAt(s, from.x, from.y), b = tileAt(s, to.x, to.y);
  if (!a || !b || b.obj || RULES.impassable.includes(b.t)) return Infinity; // LCK-1
  const climb = b.h - a.h;
  if (climb > 1 || climb < -1) return Infinity;
  return RULES.terrainCost[b.t] + (climb > 0 && !hop ? RULES.climbCost : 0); // MAN-3: Hop climbs free
}

export interface Reach { x: number; y: number; cost: number; path: Pos[] }

/** TRN-3: tiles a walker can end on within `budget`, with paths. Enemies block; allies can be passed but not ended on.
 * Dijkstra over a small binary heap; ties resolve in neighbour order (E, W, S, N), so paths are deterministic. */
export function reachable(s: BattleState, u: Unit, budget: number, from: Pos = u, hop = false, known?: (o: Unit) => boolean): Reach[] {
  const n = s.w * s.h;
  const occ = new Array<Unit | null>(n).fill(null);
  // FOG-8: a walk is planned on what the side knows; walkers it cannot see do not block the plan.
  for (const o of s.units) if (o.alive && (!known || known(o))) occ[o.y * s.w + o.x] = o;
  const cost = new Array<number>(n).fill(Infinity);
  const prev = new Int32Array(n).fill(-1);
  const order = new Int32Array(n).fill(0);
  const start = from.y * s.w + from.x;
  cost[start] = 0;
  // Heap of [cost, seq, index]; seq keeps insertion order for ties, as the sorted list did before.
  const heap: [number, number, number][] = [[0, 0, start]];
  let seq = 1;
  const less = (a: [number, number, number], b: [number, number, number]) => a[0] < b[0] || (a[0] === b[0] && a[1] < b[1]);
  const pushH = (e: [number, number, number]) => { heap.push(e); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (!less(heap[i]!, heap[p]!)) break; [heap[i], heap[p]] = [heap[p]!, heap[i]!]; i = p; } };
  const popH = (): [number, number, number] => { const top = heap[0]!; const last = heap.pop()!; if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && less(heap[l]!, heap[m]!)) m = l; if (r < heap.length && less(heap[r]!, heap[m]!)) m = r; if (m === i) break; [heap[i], heap[m]] = [heap[m]!, heap[i]!]; i = m; } } return top; };
  const done = new Uint8Array(n);
  let k = 0;
  while (heap.length) {
    const [c, , i] = popH();
    if (done[i] || c > cost[i]!) continue;
    done[i] = 1; order[i] = k++;
    const x = i % s.w, y = (i - x) / s.w;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= s.w || ny >= s.h) continue;
      const sc = stepCost(s, { x, y }, { x: nx, y: ny }, hop);
      if (!isFinite(sc)) continue;
      const j = ny * s.w + nx;
      const other = occ[j];
      if (other && other.id !== u.id && other.side !== u.side) continue;
      const nc = c + sc;
      if (nc > budget || nc >= cost[j]!) continue;
      cost[j] = nc; prev[j] = i;
      pushH([nc, seq++, j]);
    }
  }
  const out: Reach[] = [];
  for (let i = 0; i < n; i++) {
    if (!isFinite(cost[i]!)) continue;
    const occupant = occ[i];
    if (occupant && occupant.id !== u.id) continue;
    const path: Pos[] = [];
    for (let c = i; c !== -1; c = prev[c]!) path.unshift({ x: c % s.w, y: Math.floor(c / s.w) });
    out.push({ x: i % s.w, y: Math.floor(i / s.w), cost: cost[i]!, path });
  }
  void order;
  return out;
}
