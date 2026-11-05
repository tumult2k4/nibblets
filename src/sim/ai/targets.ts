/** Target finding shared by actions. Senses & memory proper arrive in P2.4; P1 uses vision + a far fallback. */
import type { Goblin, GroundItem, Plant } from '../state';
import type { World } from '../world';
import { visionRadius } from './considerations';
import { isShore, tileAt } from '../grid';
import { CFG } from '../config';
import { isGrowing, siteOk } from '../plants';
import type { ID, Vec2 } from '../../shared/types';

const FAR = 48;

function claimedBy(w: World, plantId: number, except: number): number {
  let n = 0;
  for (const o of w.s.goblins) if (o.id !== except && o.activity.action === 'harvest_fruit' && o.activity.targetId === plantId) n++;
  return n;
}

/** A fruit target: a visible fruiting bush, else the best remembered one (which may be stale). */
export interface FruitTarget { id: ID; pos: Vec2; remembered: boolean }

export function findFruitPlant(g: Goblin, w: World): FruitTarget | null {
  const ok = (p: Plant) => (p.kind === 'apple_bush' || p.kind === 'berry_bush') && (p.stage === 'mature' || p.stage === 'old') && p.fruit > claimedBy(w, p.id, g.id);
  const seen = w.plantHash.nearest(g.pos, visionRadius(g, w), ok);
  if (seen) return { id: seen.id, pos: seen.pos, remembered: false };
  let best: FruitTarget | null = null;
  let bs = 0;
  for (const m of g.memory) {
    if (m.kind !== 'fruit_plant' || m.data <= 0 || m.targetId === undefined) continue;
    const d = Math.hypot(m.pos.x - g.pos.x, m.pos.y - g.pos.y);
    if (d > FAR) continue;
    const s = (m.confidence * Math.min(m.data, 3)) / (1 + d / 10);
    if (s > bs) { bs = s; best = { id: m.targetId, pos: m.pos, remembered: true }; }
  }
  return best;
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

/**
 * §P2.2 site rules for planting a core: fertile meadow, not adjacent to another plant, within
 * `seedSiteVillageRadius` tiles of home/village. Samples candidates with the world rng (deterministic).
 */
export function findPlantingSite(g: Goblin, w: World): Vec2 | null {
  const C = CFG.plants;
  const home = w.s.village.center;
  let best: Vec2 | null = null;
  let bestD = Infinity;
  for (let i = 0; i < 14; i++) {
    const a = w.rng.range(0, Math.PI * 2);
    const r = w.rng.range(3, C.seedSiteVillageRadius);
    const p = { x: Math.floor(home.x + Math.cos(a) * r) + 0.5, y: Math.floor(home.y + Math.sin(a) * r) + 0.5 };
    const t = tileAt(w.s, p.x, p.y);
    if (!t || t.biome !== 'meadow' || t.fertility < 0.35 || !siteOk(w, p, C.minSeedGap)) continue;
    if (claimedSite(w, p, g.id)) continue;
    const d = (p.x - g.pos.x) ** 2 + (p.y - g.pos.y) ** 2;
    if (d < bestD) { bestD = d; best = p; }
  }
  return best;
}

function claimedSite(w: World, p: Vec2, except: number): boolean {
  for (const o of w.s.goblins)
    if (o.id !== except && o.activity.action === 'plant_seed' && o.activity.target && Math.hypot(o.activity.target.x - p.x, o.activity.target.y - p.y) < CFG.plants.minSeedGap) return true;
  return false;
}

/** A thirsty young plant nearby that nobody else is already watering (own plantings first). */
export function findDryPlant(g: Goblin, w: World): Plant | null {
  const C = CFG.plants;
  let best: Plant | null = null;
  let bestS = 0;
  for (const p of w.plantHash.query(g.pos, C.waterRadius)) {
    if (!isGrowing(p) || p.hydration >= C.waterBelow || p.kind === 'tree') continue;
    if (w.s.goblins.some((o) => o.id !== g.id && o.activity.action === 'water_plant' && o.activity.targetId === p.id)) continue;
    const s = (1 - p.hydration / C.waterBelow) * (p.plantedBy === g.id ? 1.3 : 1) / (1 + Math.hypot(p.pos.x - g.pos.x, p.pos.y - g.pos.y) / C.waterRadius);
    if (s > bestS) { bestS = s; best = p; }
  }
  return best;
}

/** Where a goblin would go to drink: remembered water first (§7.8), else instinct (nearest shore). */
export function waterTargets(g: Goblin, k: number, w: World): Vec2[] {
  const known = g.memory.filter((m) => m.kind === 'water')
    .map((m) => ({ p: m.pos, d: Math.hypot(m.pos.x - g.pos.x, m.pos.y - g.pos.y) }))
    .sort((a, b) => a.d - b.d).slice(0, k).map((x) => x.p);
  return known.length ? known : nearestShores(g, w, k);
}
