/** Target finding shared by actions. Senses & memory proper arrive in P2.4; P1 uses vision + a far fallback. */
import type { Goblin, GroundItem, Plant } from '../state';
import type { World } from '../world';
import { visionRadius } from './considerations';
import { isShore } from '../grid';
import type { Vec2 } from '../../shared/types';

const FAR = 48;

function claimedBy(w: World, plantId: number, except: number): number {
  let n = 0;
  for (const o of w.s.goblins) if (o.id !== except && o.activity.action === 'harvest_fruit' && o.activity.targetId === plantId) n++;
  return n;
}

export function findFruitPlant(g: Goblin, w: World): Plant | null {
  const ok = (p: Plant) => p.kind === 'apple_bush' && p.stage === 'mature' && p.fruit > claimedBy(w, p.id, g.id);
  return w.plantHash.nearest(g.pos, visionRadius(g, w), ok) ?? w.plantHash.nearest(g.pos, FAR, ok);
}

export function findGroundItem(g: Goblin, w: World, pred: (it: GroundItem) => boolean, radius?: number): GroundItem | null {
  return w.itemHash.nearest(g.pos, radius ?? visionRadius(g, w), (it) =>
    !it.airborne && (it.reservedBy === null || it.reservedBy === g.id) && pred(it));
}

/** Shore tiles are recomputed when the terrain changes. */
const shoreCache = new WeakMap<World, { key: number; tiles: Vec2[] }>();
export function shoreTiles(w: World): Vec2[] {
  const key = w.s.terrainVersion;
  const hit = shoreCache.get(w);
  if (hit?.key === key) return hit.tiles;
  const tiles: Vec2[] = [];
  for (let y = 0; y < w.s.size.h; y++)
    for (let x = 0; x < w.s.size.w; x++) if (isShore(w.s, x, y)) tiles.push({ x: x + 0.5, y: y + 0.5 });
  shoreCache.set(w, { key, tiles });
  return tiles;
}

/** A few nearest shore tiles, ordered by distance (ties by index → deterministic). */
export function nearestShores(g: Goblin, w: World, k: number): Vec2[] {
  const all = shoreTiles(w);
  const best: { p: Vec2; d: number }[] = [];
  for (const p of all) {
    const d = (p.x - g.pos.x) ** 2 + (p.y - g.pos.y) ** 2;
    if (best.length < k) {
      best.push({ p, d });
      best.sort((a, b) => a.d - b.d);
    } else if (d < best[k - 1]!.d) {
      best[k - 1] = { p, d };
      best.sort((a, b) => a.d - b.d);
    }
  }
  return best.map((b) => b.p);
}
