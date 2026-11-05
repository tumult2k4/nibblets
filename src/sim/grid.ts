import type { Vec2 } from '../shared/types';
import type { Tile, WorldState } from './state';

export const tileIndex = (s: WorldState, x: number, y: number): number => y * s.size.w + x;
export const inBounds = (s: WorldState, x: number, y: number): boolean =>
  x >= 0 && y >= 0 && x < s.size.w && y < s.size.h;

export function tileAt(s: WorldState, x: number, y: number): Tile | undefined {
  if (!inBounds(s, x, y)) return undefined;
  return s.tiles[tileIndex(s, x, y)];
}

/** Tile coordinates of a continuous position (tile (x,y) spans [x, x+1)). */
export const tileOf = (p: Vec2): Vec2 => ({ x: Math.floor(p.x), y: Math.floor(p.y) });
export const tileCenter = (t: Vec2): Vec2 => ({ x: t.x + 0.5, y: t.y + 0.5 });

export function isWalkable(s: WorldState, x: number, y: number): boolean {
  const t = tileAt(s, x, y);
  return !!t && t.walkable;
}

export function isWaterAt(s: WorldState, p: Vec2): boolean {
  const t = tileAt(s, Math.floor(p.x), Math.floor(p.y));
  return !!t && t.biome === 'water';
}

/**
 * Height at a corner grid point (cx, cy) in 0..w, 0..h. Corners average the surrounding tiles,
 * which is what the terrain mesh renders.
 */
export function cornerHeight(s: WorldState, cx: number, cy: number): number {
  let sum = 0;
  let n = 0;
  for (let dy = -1; dy <= 0; dy++)
    for (let dx = -1; dx <= 0; dx++) {
      const t = tileAt(s, cx + dx, cy + dy);
      if (t) {
        sum += t.height;
        n++;
      }
    }
  return n ? sum / n : 0;
}

/** Bilinear terrain height (0..1) at a continuous position. */
export function heightAt(s: WorldState, p: Vec2): number {
  const x = Math.max(0, Math.min(s.size.w - 0.001, p.x));
  const y = Math.max(0, Math.min(s.size.h - 0.001, p.y));
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const h00 = cornerHeight(s, x0, y0);
  const h10 = cornerHeight(s, x0 + 1, y0);
  const h01 = cornerHeight(s, x0, y0 + 1);
  const h11 = cornerHeight(s, x0 + 1, y0 + 1);
  return (h00 * (1 - fx) + h10 * fx) * (1 - fy) + (h01 * (1 - fx) + h11 * fx) * fy;
}

export const NEIGHBORS8: readonly [number, number][] = [
  [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1],
];

/** Walkable tiles that border water (drinking spots). */
export function isShore(s: WorldState, x: number, y: number): boolean {
  if (!isWalkable(s, x, y)) return false;
  for (const [dx, dy] of NEIGHBORS8) {
    const t = tileAt(s, x + dx, y + dy);
    if (t && t.biome === 'water') return true;
  }
  return false;
}
