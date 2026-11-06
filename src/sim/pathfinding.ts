import type { Vec2 } from '../shared/types';
import type { WorldState } from './state';
import { inBounds, tileIndex } from './grid';
import { CFG } from './config';

const SQRT2 = Math.SQRT2;
const MAX_EXPANSIONS = 9000;
const CACHE_MAX = 600;

let gateCache = { s: null as WorldState | null, ver: -1, tiles: new Set<number>() };
/** Tiles holding a finished gate (P5.7): a way through the fence at walking pace. */
export function gateTiles(s: WorldState): Set<number> {
  if (gateCache.s !== s || gateCache.ver !== s.terrainVersion) {
    const tiles = new Set<number>();
    for (const b of s.buildings) if (b.type === 'gate' && b.buildProgress >= 1) tiles.add(tileIndex(s, Math.floor(b.pos.x), Math.floor(b.pos.y)));
    gateCache = { s, ver: s.terrainVersion, tiles };
  }
  return gateCache.tiles;
}

/** Movement cost multiplier of a tile: wear>0.5 trails, marsh, forest, building footprints (changes bump terrainVersion). */
export function tileCost(s: WorldState, i: number): number {
  const t = s.tiles[i]!;
  let c = 1;
  if (t.paved) c *= CFG.garden.path.cost; // P7.4 stone paths
  else if (t.wear > 0.5) c *= 0.8;
  if (t.biome === 'marsh') c *= 1.4;
  if (t.biome === 'forest') c *= 1.1;
  // walk around buildings unless heading inside; climb a fence only where there is no gate
  if (t.occupiedBy !== null && !t.bridge && !gateTiles(s).has(i)) c *= CFG.buildings.occupiedCost;
  return c;
}

class MinHeap {
  private ids: number[] = [];
  private pri: number[] = [];
  get size(): number {
    return this.ids.length;
  }
  push(id: number, p: number): void {
    this.ids.push(id);
    this.pri.push(p);
    let i = this.ids.length - 1;
    while (i > 0) {
      const par = (i - 1) >> 1;
      if (this.pri[par]! <= this.pri[i]!) break;
      this.swap(i, par);
      i = par;
    }
  }
  pop(): number {
    const top = this.ids[0]!;
    const lastId = this.ids.pop()!;
    const lastP = this.pri.pop()!;
    if (this.ids.length) {
      this.ids[0] = lastId;
      this.pri[0] = lastP;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < this.ids.length && this.pri[l]! < this.pri[m]!) m = l;
        if (r < this.ids.length && this.pri[r]! < this.pri[m]!) m = r;
        if (m === i) break;
        this.swap(i, m);
        i = m;
      }
    }
    return top;
  }
  private swap(a: number, b: number): void {
    [this.ids[a], this.ids[b]] = [this.ids[b]!, this.ids[a]!];
    [this.pri[a], this.pri[b]] = [this.pri[b]!, this.pri[a]!];
  }
}

/**
 * Path cache. Results depend only on (terrainVersion, start, goal), and terrainVersion bumps whenever
 * anything the cost function reads changes, so a cached path always equals a fresh search. Each entry keeps the
 * search's size too, so `pathWork` counts a search the same whether or not it was cached (P11.3: the decision budget
 * reads it, and must read the same after a load, when the cache is empty).
 */
export interface PathHit { path: Vec2[] | null; n: number }
let work = 0;
/** Expansions of every search asked for so far (cached ones counted as if made again). */
export const pathWork = (): number => work;


/**
 * A* over tiles, 8-neighbour, no corner cutting. Returns tile-center waypoints (excluding start). `blocked` marks extra
 * impassable tiles for this walker (enemies: finished fences, P4.6); it must only change with terrainVersion.
 */
export function findPath(s: WorldState, from: Vec2, to: Vec2, cache: Map<string, PathHit>, blocked?: Uint8Array): Vec2[] | null {
  const sx = Math.floor(from.x), sy = Math.floor(from.y);
  const gx = Math.floor(to.x), gy = Math.floor(to.y);
  if (!inBounds(s, gx, gy) || !s.tiles[tileIndex(s, gx, gy)]!.walkable || blocked?.[tileIndex(s, gx, gy)]) return null;
  if (!inBounds(s, sx, sy)) return null;
  if (sx === gx && sy === gy) return [];
  const key = `${blocked ? 'e' : ''}${s.terrainVersion}:${sx},${sy}:${gx},${gy}`;
  const hit = cache.get(key) ?? astar(s, sx, sy, gx, gy, blocked);
  if (!cache.has(key)) {
    if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value as string);
    cache.set(key, hit);
  }
  work += hit.n;
  return hit.path ? hit.path.map((p) => ({ ...p })) : null;
}

function astar(s: WorldState, sx: number, sy: number, gx: number, gy: number, blocked?: Uint8Array): PathHit {
  const W = s.size.w;
  const N = W * s.size.h;
  const g = new Float64Array(N).fill(Infinity);
  const came = new Int32Array(N).fill(-1);
  const closed = new Uint8Array(N);
  const h = (x: number, y: number): number => {
    const dx = Math.abs(x - gx), dy = Math.abs(y - gy);
    return 0.8 * (Math.max(dx, dy) + (SQRT2 - 1) * Math.min(dx, dy));
  };
  const pass = blocked ? (i: number): boolean => s.tiles[i]!.walkable && !blocked[i] : (i: number): boolean => s.tiles[i]!.walkable;
  const start = sy * W + sx;
  const goal = gy * W + gx;
  g[start] = 0;
  const open = new MinHeap();
  open.push(start, h(sx, sy));
  let expansions = 0;
  while (open.size) {
    const cur = open.pop();
    if (closed[cur]) continue;
    if (cur === goal) break;
    closed[cur] = 1;
    if (++expansions > MAX_EXPANSIONS) return { path: null, n: expansions };
    const cx = cur % W, cy = (cur / W) | 0;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = cx + dx, ny = cy + dy;
        if (!inBounds(s, nx, ny)) continue;
        const ni = ny * W + nx;
        if (closed[ni] || !pass(ni)) continue;
        if (dx && dy && (!pass(cy * W + nx) || !pass(ny * W + cx))) continue;
        const step = (dx && dy ? SQRT2 : 1) * tileCost(s, ni);
        const ng = g[cur]! + step;
        if (ng < g[ni]!) {
          g[ni] = ng;
          came[ni] = cur;
          open.push(ni, ng + h(nx, ny));
        }
      }
  }
  if (came[goal] === -1) return { path: null, n: expansions };
  const path: Vec2[] = [];
  for (let c = goal; c !== start; c = came[c]!) path.push({ x: (c % W) + 0.5, y: ((c / W) | 0) + 0.5 });
  path.reverse();
  return { path: smooth(s, path), n: expansions };
}

/** Drop intermediate waypoints that lie on a straight line (keeps saves small). */
function smooth(_s: WorldState, path: Vec2[]): Vec2[] {
  if (path.length < 3) return path;
  const out: Vec2[] = [path[0]!];
  for (let i = 1; i < path.length - 1; i++) {
    const a = out[out.length - 1]!, b = path[i]!, c = path[i + 1]!;
    const d1x = Math.sign(b.x - a.x), d1y = Math.sign(b.y - a.y);
    const d2x = Math.sign(c.x - b.x), d2y = Math.sign(c.y - b.y);
    if (d1x !== d2x || d1y !== d2y) out.push(b);
  }
  out.push(path[path.length - 1]!);
  return out;
}
