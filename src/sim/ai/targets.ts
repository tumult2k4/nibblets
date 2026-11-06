/** Target finding shared by actions. Senses & memory proper arrive in P2.4; P1 uses vision + a far fallback. */
import type { Goblin, GroundItem, Plant } from '../state';
import type { World } from '../world';
import { visionRadius } from './considerations';
import { isShore, tileAt } from '../grid';
import { CFG } from '../config';
import { isGrowing, siteOk } from '../plants';
import { wellSpot, wells } from '../settlement';
import type { ID, Vec2 } from '../../shared/types';
import { freeGardenBed } from '../garden';
import { claimCount, claimedByOther } from './claims';
import { once } from './memo';

const FAR = 48;

const claimedBy = (w: World, plantId: number, except: number): number => claimCount(w, 'harvest_fruit', plantId, except);

/** The plants of a kind (P11.3), each in a hash of its own. */
export const bushes = (w: World) => w.plantHash.subset('bush', (p) => p.kind === 'apple_bush' || p.kind === 'berry_bush');
export const flowers = (w: World) => w.plantHash.subset('flower', (p) => p.kind === 'flower');
export const trees = (w: World) => w.plantHash.subset('tree', (p) => p.kind === 'tree');
export const woody = (w: World) => w.plantHash.subset('woody', (p) => p.kind !== 'flower');

/** A fruit target: a visible fruiting bush, else the best remembered one (which may be stale). */
export interface FruitTarget { id: ID; pos: Vec2; remembered: boolean }

export const findFruitPlant = (g: Goblin, w: World): FruitTarget | null => once(w, g, 'fruit', () => findFruitPlant0(g, w));
function findFruitPlant0(g: Goblin, w: World): FruitTarget | null {
  const ok = (p: Plant) => (p.kind === 'apple_bush' || p.kind === 'berry_bush') && (p.stage === 'mature' || p.stage === 'old') && p.fruit > claimedBy(w, p.id, g.id);
  const seen = bushes(w).nearest(g.pos, visionRadius(g, w), ok);
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

/** Shore tiles in 8×8 buckets (P11.3), each with its place in `shoreTiles` so ties still go to the first. */
const shoreBuckets = new WeakMap<World, { key: number; cells: Map<number, { p: Vec2; i: number }[]> }>();
const BUCKET = 8;
function buckets(w: World): Map<number, { p: Vec2; i: number }[]> {
  const key = w.s.terrainVersion, hit = shoreBuckets.get(w);
  if (hit?.key === key) return hit.cells;
  const cells = new Map<number, { p: Vec2; i: number }[]>();
  shoreTiles(w).forEach((p, i) => {
    const k = Math.floor(p.y / BUCKET) * 1024 + Math.floor(p.x / BUCKET);
    (cells.get(k) ?? cells.set(k, []).get(k)!).push({ p, i });
  });
  shoreBuckets.set(w, { key, cells });
  return cells;
}

/** The nearest shore tile within `r` of `pos` (the first in `shoreTiles` order on a tie), or null. */
export function nearestShoreWithin(w: World, pos: Vec2, r: number): Vec2 | null {
  const cells = buckets(w);
  let best: Vec2 | null = null, bi = Infinity, bd = r * r;
  for (let cy = Math.floor((pos.y - r) / BUCKET); cy <= Math.floor((pos.y + r) / BUCKET); cy++)
    for (let cx = Math.floor((pos.x - r) / BUCKET); cx <= Math.floor((pos.x + r) / BUCKET); cx++)
      for (const t of cells.get(cy * 1024 + cx) ?? []) {
        const dx = t.p.x - pos.x, dy = t.p.y - pos.y, d = dx * dx + dy * dy;
        if (d < bd || (d === bd && t.i < bi && best)) { bd = d; bi = t.i; best = t.p; }
      }
  return best;
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
  // P7.4: a free bed in a garden plot first
  const bed = freeGardenBed(w, g.pos, (p) => claimedSite(w, p, g.id));
  if (bed) return bed;
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
export const findDryPlant = (g: Goblin, w: World): Plant | null => once(w, g, 'dry', () => findDryPlant0(g, w));
function findDryPlant0(g: Goblin, w: World): Plant | null {
  const C = CFG.plants;
  let best: Plant | null = null;
  let bestS = 0;
  for (const p of w.plantHash.query(g.pos, C.waterRadius, (q) => q.hydration < C.waterBelow && q.kind !== 'tree' && isGrowing(q))) {
    if (claimedByOther(w, g, 'water_plant', p.id)) continue;
    const s = (1 - p.hydration / C.waterBelow) * (p.plantedBy === g.id ? 1.3 : 1) / (1 + Math.hypot(p.pos.x - g.pos.x, p.pos.y - g.pos.y) / C.waterRadius);
    if (s > bestS) { bestS = s; best = p; }
  }
  return best;
}

/** Where a goblin would go to drink: remembered water first (§7.8), else instinct (nearest shore). */
export function waterTargets(g: Goblin, k: number, w: World): Vec2[] {
  // a remembered drinking spot a flood has drowned (or a drought left dry) is no use (P7.2 balance: hatchlings died
  // of thirst beside a swollen lake, every spot they knew under water)
  const known = g.memory.filter((m) => m.kind === 'water' && isShore(w.s, m.pos.x, m.pos.y))
    .map((m) => ({ p: m.pos, d: Math.hypot(m.pos.x - g.pos.x, m.pos.y - g.pos.y) }))
    .sort((a, b) => a.d - b.d).slice(0, k).map((x) => x.p);
  const out = known.length ? known : nearestShores(g, w, k);
  // P7.3: a well counts too, as a little closer than it is (no bank to scramble down)
  const ws = wells(w.s).map((b) => wellSpot(b, g.id));
  if (!ws.length) return out;
  const d = (p: Vec2, bonus: number): number => Math.hypot(p.x - g.pos.x, p.y - g.pos.y) - bonus;
  return [...ws.map((p) => ({ p, d: d(p, CFG.settlement.well.bonus) })), ...out.map((p) => ({ p, d: d(p, 0) }))]
    .sort((a, b) => a.d - b.d).slice(0, k).map((x) => x.p);
}
