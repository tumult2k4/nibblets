/**
 * P7.4 roads (§10.4–10.5): stone paths laid over well-worn trails (cheaper to walk, never wearing away) and bridges
 * over narrow water. A bridge is a row of one-tile spans, each planned once the one before it stands, wherever walking
 * round (or not getting across at all) costs the village enough.
 */
import { CFG } from './config';
import { dist } from '../shared/math';
import { inBounds, tileAt, tileIndex } from './grid';
import type { Vec2 } from '../shared/types';
import type { WorldState } from './state';

const P = CFG.garden.path, BR = CFG.garden.bridge;

// ---- stone paths ------------------------------------------------------------------------------------------------

export const pavedCount = (s: WorldState): number => s.tiles.reduce((n, t) => n + (t.paved ? 1 : 0), 0);

let worn = { s: null as WorldState | null, hour: -1, tiles: [] as Vec2[], paved: 0 };
/** Worn, unpaved trail tiles near the village (most worn first; cached by the hour). */
export function wornTiles(s: WorldState): Vec2[] {
  const hour = Math.floor(s.tick / CFG.god.hourTicks);
  if (worn.s !== s || worn.hour !== hour) {
    const c = s.village.center, out: { p: Vec2; wear: number }[] = [];
    for (let y = Math.floor(c.y - P.radius); y <= c.y + P.radius; y++)
      for (let x = Math.floor(c.x - P.radius); x <= c.x + P.radius; x++) {
        const t = tileAt(s, x, y);
        if (!t || t.paved || !t.walkable || t.biome === 'water' || t.occupiedBy !== null || t.wear < P.wearAt) continue;
        if (Math.hypot(x + 0.5 - c.x, y + 0.5 - c.y) > P.radius) continue;
        out.push({ p: { x, y }, wear: t.wear });
      }
    out.sort((a, b) => b.wear - a.wear || a.p.y - b.p.y || a.p.x - b.p.x);
    worn = { s, hour, tiles: out.map((o) => o.p), paved: pavedCount(s) };
  }
  return worn.tiles;
}

/** Can the village spare stone for paving, and is there a trail to pave? */
export const paveWanted = (s: WorldState, stone: number): boolean =>
  stone > P.stoneKeep && wornTiles(s).length > 0 && worn.paved < P.max;

/** Up to `n` worn tiles to pave next, starting nearest `from`, then each next to the last (a stretch of trail). */
export function paveRun(s: WorldState, from: Vec2, n: number, taken: (p: Vec2) => boolean): Vec2[] {
  const free = wornTiles(s).filter((p) => !taken(p) && !tileAt(s, p.x, p.y)!.paved);
  const out: Vec2[] = [];
  let at = from;
  while (out.length < n && free.length) {
    let bi = 0, bd = Infinity;
    free.forEach((p, i) => { const d = Math.hypot(p.x + 0.5 - at.x, p.y + 0.5 - at.y); if (d < bd) { bd = d; bi = i; } });
    if (out.length && bd > 1.5) break;
    const p = free.splice(bi, 1)[0]!;
    out.push(p);
    at = { x: p.x + 0.5, y: p.y + 0.5 };
  }
  return out;
}

/** Lay a stone on a tile: a road from now on. */
export function pave(s: WorldState, x: number, y: number): boolean {
  const t = tileAt(s, x, y);
  if (!t || t.paved || t.biome === 'water') return false;
  t.paved = true;
  t.wear = 1;
  s.terrainVersion += 1;
  worn.paved += 1;
  return true;
}

// ---- bridges ----------------------------------------------------------------------------------------------------

const DIRS: readonly Vec2[] = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }];
const FAR = 80;

/** Steps from the village center over walkable land (4-neighbour, out to `maxR`). */
function distanceField(s: WorldState, maxR: number): Int32Array {
  const D = new Int32Array(s.tiles.length).fill(-1);
  const c = { x: Math.floor(s.village.center.x), y: Math.floor(s.village.center.y) };
  if (!inBounds(s, c.x, c.y) || !s.tiles[tileIndex(s, c.x, c.y)]!.walkable) return D;
  const q = [tileIndex(s, c.x, c.y)];
  D[q[0]!] = 0;
  for (let h = 0; h < q.length; h++) {
    const i = q[h]!, x = i % s.size.w, y = (i - x) / s.size.w;
    if (D[i]! >= maxR * 2) continue;
    for (const d of DIRS) {
      const nx = x + d.x, ny = y + d.y;
      if (!inBounds(s, nx, ny) || Math.abs(nx - c.x) > maxR || Math.abs(ny - c.y) > maxR) continue;
      const j = tileIndex(s, nx, ny);
      if (D[j] !== -1 || !s.tiles[j]!.walkable) continue;
      D[j] = D[i]! + 1;
      q.push(j);
    }
  }
  return D;
}

/** Is the land at `p` more than a speck (at least `n` walkable tiles joined to it)? */
function landBeyond(s: WorldState, p: Vec2, n: number): boolean {
  const seen = new Set([tileIndex(s, p.x, p.y)]), q = [p];
  for (let h = 0; h < q.length && seen.size < n; h++)
    for (const d of DIRS) {
      const x = q[h]!.x + d.x, y = q[h]!.y + d.y;
      if (!inBounds(s, x, y) || seen.has(tileIndex(s, x, y)) || !s.tiles[tileIndex(s, x, y)]!.walkable) continue;
      seen.add(tileIndex(s, x, y));
      q.push({ x, y });
    }
  return seen.size >= n;
}

export interface Span { tile: Vec2; from: Vec2; axis: 0 | 1; gain: number }

let spanCache = { s: null as WorldState | null, day: -1, bridges: -1, span: null as Span | null };
/** The next bridge span worth building (the first water tile of the best crossing), cached by the day. */
export function nextSpan(s: WorldState): Span | null {
  const day = Math.floor(s.tick / CFG.time.dayTicks), bridges = s.buildings.filter((b) => b.type === 'bridge').length;
  if (spanCache.s === s && spanCache.day === day && spanCache.bridges === bridges) return spanCache.span;
  spanCache = { s, day, bridges, span: findSpan(s) };
  return spanCache.span;
}

function findSpan(s: WorldState): Span | null {
  const c = s.village.center, D = distanceField(s, BR.radius + 30);
  let best: Span | null = null, bs = -Infinity;
  for (let y = Math.floor(c.y - BR.radius); y <= c.y + BR.radius; y++)
    for (let x = Math.floor(c.x - BR.radius); x <= c.x + BR.radius; x++) {
      if (!inBounds(s, x, y)) continue;
      const a = s.tiles[tileIndex(s, x, y)]!, da = D[tileIndex(s, x, y)]!;
      if (da < 0 || !a.walkable || (a.occupiedBy !== null && !a.bridge)) continue;
      for (const d of DIRS) {
        let k = 1, ok = false;
        for (; k <= BR.maxSpan + 1; k++) {
          const t = tileAt(s, x + d.x * k, y + d.y * k);
          if (!t) break;
          if (t.biome === 'water' && !t.bridge && t.occupiedBy === null) continue;
          ok = k > 1 && t.walkable && t.occupiedBy === null;
          break;
        }
        if (!ok) continue;
        const bx = x + d.x * k, by = y + d.y * k, db = D[tileIndex(s, bx, by)]!, span = k - 1;
        if (db < 0 && !landBeyond(s, { x: bx, y: by }, 30)) continue;
        const gain = (db < 0 ? FAR : Math.min(FAR, db)) - da - span - 1;
        if (gain < BR.minGain) continue;
        // a bridge already begun is finished first, then the shortest span, then the nearest
        const score = gain + (a.bridge ? 100 : 0) - span * 2 - dist({ x, y }, c) * 0.1;
        if (score > bs) { bs = score; best = { tile: { x: x + d.x, y: y + d.y }, from: { x, y }, axis: d.x !== 0 ? 0 : 1, gain }; }
      }
    }
  return best;
}
