/**
 * Fences (§10, P4.6). Once Gnashers have been spotted a few times, a village with a fire and three adults rings its
 * core with 1-wood fence posts. The ring radius is fixed when fencing starts (the farthest hut, fire or stockpile + 2,
 * 4–10 tiles) and kept in `village.fenceRing`; posts go up a few at a time, next to the ones already standing.
 * Finished fences block enemies outright (their pathfinding and steps); goblins climb over, slowly (a fence tile costs
 * ×4 like any footprint), or walk through a gate (P5.7, watch.ts), which keeps enemies out like a post.
 */
import { CFG } from './config';
import { clamp, dist } from '../shared/math';
import type { Vec2 } from '../shared/types';
import type { Building, WorldState } from './state';
import type { World } from './world';
import { isComplete } from './buildings';
import { tileAt } from './grid';

const F = CFG.fences;

export const isFence = (b: Building): boolean => b.type === 'fence';

/** Tiles holding a finished fence or gate (enemy-impassable). */
export function fenceMask(s: WorldState): Uint8Array {
  const m = new Uint8Array(s.size.w * s.size.h);
  for (const b of s.buildings) {
    if ((!isFence(b) && b.type !== 'gate') || !isComplete(b)) continue;
    const x = Math.floor(b.pos.x), y = Math.floor(b.pos.y);
    if (x >= 0 && y >= 0 && x < s.size.w && y < s.size.h) m[y * s.size.w + x] = 1;
  }
  return m;
}

/** Can an enemy stand on this tile? */
export const enemyCanStand = (w: World, x: number, y: number): boolean => {
  const t = tileAt(w.s, x, y);
  return !!t && t.walkable && !w.enemyBlocked()[Math.floor(y) * w.s.size.w + Math.floor(x)];
};

/** Radius that takes in the village's buildings and stockpile with room to spare. */
export function ringRadius(w: World): number {
  const s = w.s, c = s.village.center;
  let r = dist(s.village.stockpilePos, c);
  for (const b of s.buildings) if (!isFence(b)) r = Math.max(r, dist(b.pos, c) + b.footprint.w / 2);
  return clamp(Math.ceil(r + F.ringPad), F.ringMin, F.ringMax);
}

/** Tile centers on the ring (a one-tile band at radius r), in angular order. */
export function ringTiles(s: WorldState, r: number): Vec2[] {
  const c = s.village.center, out: { p: Vec2; a: number }[] = [];
  for (let y = Math.floor(c.y - r - 1); y <= c.y + r + 1; y++)
    for (let x = Math.floor(c.x - r - 1); x <= c.x + r + 1; x++) {
      const p = { x: x + 0.5, y: y + 0.5 };
      if (Math.abs(dist(p, c) - r) < 0.5 && tileAt(s, x, y)) out.push({ p, a: Math.atan2(p.y - c.y, p.x - c.x) });
    }
  return out.sort((u, v) => u.a - v.a).map((o) => o.p);
}

/** A ring tile a post can go on: walkable land, free, off the stockpile and clear of boulders. */
function postOk(w: World, p: Vec2): boolean {
  const t = tileAt(w.s, Math.floor(p.x), Math.floor(p.y));
  if (!t || !t.walkable || t.biome === 'water' || t.occupiedBy !== null) return false;
  if (dist(p, w.s.village.stockpilePos) < F.stockpileGap) return false;
  return !w.s.rocks.some((r) => dist(r.pos, p) < 0.5 + r.size * 0.3);
}

/** Next post sites (up to `n`): beside standing posts first, so the ring closes as it grows. */
export function fenceSites(w: World, n: number): Vec2[] {
  const r = w.s.village.fenceRing || ringRadius(w);
  const ring = ringTiles(w.s, r).filter((p) => postOk(w, p));
  if (!ring.length) return [];
  const posts = w.s.buildings.filter(isFence).map((b) => b.pos);
  const near = (p: Vec2) => posts.some((q) => Math.abs(q.x - p.x) <= 1.01 && Math.abs(q.y - p.y) <= 1.01);
  const first = ring.find(near) ?? ring[0]!;
  const out: Vec2[] = [first];
  // carry on around the ring from there
  const i = ring.indexOf(first);
  for (let k = 1; k < ring.length && out.length < n; k++) {
    const p = ring[(i + k) % ring.length]!;
    if (Math.abs(p.x - out[out.length - 1]!.x) <= 1.01 && Math.abs(p.y - out[out.length - 1]!.y) <= 1.01) out.push(p);
    else break;
  }
  return out;
}

const openPosts = (s: WorldState): number => s.buildings.filter((b) => isFence(b) && !isComplete(b)).length;

/** Should the village be putting up fence posts now? */
export function wantsFence(w: World): boolean {
  const s = w.s;
  if (s.threat.alarms < F.alarmsToStart || openPosts(s) >= F.maxOpen) return false;
  if (!s.buildings.some((b) => b.type === 'campfire' && isComplete(b))) return false;
  if (s.goblins.filter((g) => g.lifeStage === 'adult').length < F.minAdults) return false;
  return fenceSites(w, 1).length > 0;
}
