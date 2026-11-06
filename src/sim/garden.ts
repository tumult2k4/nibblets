/**
 * P7.4 gardens (§8.3, §11.1): the fenced 3×3 garden plot (plants inside grow faster, hoppers can't get in; its four
 * corner beds are where planters go first) and the compost heap (cores, leaves and the store's rot turn into compost
 * that is spread on tired soil).
 */
import { CFG } from './config';
import { dist, q4 } from '../shared/math';
import { inBounds, tileAt, tileIndex } from './grid';
import { footprintTiles, isComplete, siteTilesOk } from './buildings';
import { stockCount } from './stockpile';
import { isGrowing, siteOk } from './plants';
import type { Vec2 } from '../shared/types';
import type { Building, WorldState } from './state';
import type { World } from './world';

const G = CFG.garden;

let cache = { s: null as WorldState | null, ver: -1, n: -1, tiles: new Set<number>() };
/** Tiles inside a finished garden plot (cached on the terrain version, which every placement bumps). */
export function gardenTiles(s: WorldState): Set<number> {
  if (cache.s !== s || cache.ver !== s.terrainVersion || cache.n !== s.buildings.length) {
    const tiles = new Set<number>();
    for (const b of s.buildings)
      if (b.type === 'garden_plot' && isComplete(b)) for (const p of footprintTiles(b.pos, b.footprint.w)) if (inBounds(s, p.x, p.y)) tiles.add(tileIndex(s, p.x, p.y));
    cache = { s, ver: s.terrainVersion, n: s.buildings.length, tiles };
  }
  return cache.tiles;
}

export const inGarden = (s: WorldState, p: Vec2): boolean =>
  inBounds(s, Math.floor(p.x), Math.floor(p.y)) && gardenTiles(s).has(tileIndex(s, Math.floor(p.x), Math.floor(p.y)));

/** Growth multiplier for a plant at `p`. */
export const gardenMul = (s: WorldState, p: Vec2): number => (inGarden(s, p) ? G.plot.growth : 1);

export const gardens = (s: WorldState): Building[] => s.buildings.filter((b) => b.type === 'garden_plot' && isComplete(b));

/** The four corner beds of a plot (tile centers, 2 apart: as close as bushes may stand). */
export function gardenBeds(b: Building): Vec2[] {
  const t = footprintTiles(b.pos, b.footprint.w), x0 = t[0]!.x, y0 = t[0]!.y, n = b.footprint.w - 1;
  return [[0, 0], [n, 0], [0, n], [n, n]].map(([dx, dy]) => ({ x: x0 + dx! + 0.5, y: y0 + dy! + 0.5 }));
}

/** A free garden bed for a planter at `from` (the nearest), if any plot has one. */
export function freeGardenBed(w: World, from: Vec2, taken: (p: Vec2) => boolean): Vec2 | null {
  let best: Vec2 | null = null, bd = Infinity;
  for (const b of gardens(w.s))
    for (const p of gardenBeds(b)) {
      const d = dist(p, from);
      if (d < bd && siteOk(w, p, CFG.plants.minSeedGap) && !taken(p)) { bd = d; best = p; }
    }
  return best;
}

/** How many plots the village wants now. */
export const gardensWanted = (s: WorldState): number => Math.min(G.plot.max, 1 + Math.floor(s.goblins.length / G.plot.perGoblins));

/** Nothing grown or rooted where the bed goes: young apple and berry bushes may stay (they are in a garden now). */
function bedClear(w: World, pos: Vec2): boolean {
  for (const p of w.plantHash.query(pos, 2.2)) {
    if (p.kind === 'flower' || Math.abs(p.pos.x - pos.x) > 1.6 || Math.abs(p.pos.y - pos.y) > 1.6) continue;
    if (p.kind === 'tree' || !isGrowing(p) || p.stage === 'young') return false;
  }
  return !w.s.rocks.some((r) => dist(r.pos, pos) < 2.2 + r.size * 0.3);
}

/** A 3×3 bed of meadow on good soil a few tiles out from the center (the plot is centered on a tile). */
export function gardenSite(w: World): Vec2 | null {
  const s = w.s, c = s.village.center, [r0, r1] = G.plot.ring;
  let best: Vec2 | null = null, bs = -Infinity;
  for (let y = Math.floor(c.y - r1); y <= c.y + r1; y++)
    for (let x = Math.floor(c.x - r1); x <= c.x + r1; x++) {
      const pos = { x: x + 0.5, y: y + 0.5 }, d = dist(pos, c);
      if (d < r0 || d > r1 || dist(pos, s.village.stockpilePos) < 3.5 || (s.village.materialPos && dist(pos, s.village.materialPos) < 3.5)) continue;
      if (!siteTilesOk(s, pos, 3) || !bedClear(w, pos)) continue;
      let fert = 0, ok = true;
      for (const p of footprintTiles(pos, 3)) {
        const t = tileAt(s, p.x, p.y)!;
        if (t.biome !== 'meadow') { ok = false; break; }
        fert += t.fertility / 9;
      }
      if (!ok || s.buildings.some((b) => dist(b.pos, pos) < b.footprint.w / 2 + 2.6)) continue;
      const score = fert * 10 - d / 3;
      if (score > bs) { bs = score; best = pos; }
    }
  return best;
}

// ---- compost ----------------------------------------------------------------------------------------------------

export const heaps = (s: WorldState): Building[] => s.buildings.filter((b) => b.type === 'compost_heap' && isComplete(b));
/** How much waste a heap holds now (it turns at most `holds`). */
export const heapFill = (b: Building): number => b.data?.fill ?? 0;
export const heapCompost = (b: Building): number => b.storage.reduce((n, x) => n + (x.type === 'compost' ? x.qty : 0), 0);

/** Put `n` units of waste on a heap (the clock starts with the first). Returns how many went on. */
export function feedHeap(w: World, b: Building, n: number): number {
  const k = Math.max(0, Math.min(n, G.compost.holds - heapFill(b)));
  if (!k) return 0;
  b.data = { ...(b.data ?? {}), fill: heapFill(b) + k };
  if (b.data.since === undefined) b.data.since = w.s.tick;
  return k;
}

/** Hourly: a heap whose waste has lain `ripenDays` turns it into compost. */
export function updateCompost(w: World): void {
  const s = w.s;
  if (s.tick % CFG.god.hourTicks !== 0) return;
  for (const b of heaps(s)) {
    const since = b.data?.since;
    if (since === undefined || s.tick - since < G.compost.ripenDays * CFG.time.dayTicks) continue;
    const n = Math.max(1, Math.round(heapFill(b) / G.compost.per));
    const st = b.storage.find((x) => x.type === 'compost');
    if (st) st.qty += n;
    else b.storage.push({ type: 'compost', qty: n });
    delete b.data!.since;
    b.data!.fill = 0;
    w.emit({ type: 'compost_ready', buildingId: b.id, qty: n, at: { ...b.pos } });
  }
}

/** Food rotting in the store: half of it goes on a heap near the store, if there is one with room. */
export function rotToHeap(w: World, qty: number): void {
  const s = w.s;
  const b = heaps(s).find((h) => dist(h.pos, s.village.stockpilePos) <= G.compost.range && heapFill(h) < G.compost.holds);
  if (b) feedHeap(w, b, Math.floor(qty * G.compost.rotShare + w.rng.next() * 0.999));
}

/** Waste in the store a heap can take (cores past what the planters need, spare leaves). */
export function spareWaste(s: WorldState): { type: 'apple_core' | 'leaves'; n: number }[] {
  return [
    { type: 'apple_core' as const, n: stockCount(s, 'apple_core') - G.compost.coreKeep },
    { type: 'leaves' as const, n: stockCount(s, 'leaves') - G.compost.leafKeep },
  ].filter((x) => x.n > 0);
}

/** A tile that wants compost: tired soil under a young or fruiting apple or berry plant near the village, or in a garden. */
export function compostTarget(w: World, from: Vec2, skip: (p: Vec2) => boolean): Vec2 | null {
  const s = w.s, C = G.compost;
  let best: Vec2 | null = null, bs = -Infinity;
  for (const p of w.plantHash.query(s.village.center, C.radius)) {
    if (p.kind !== 'apple_bush' && p.kind !== 'berry_bush') continue;
    if (!isGrowing(p) && p.stage !== 'mature') continue;
    const t = tileAt(s, p.pos.x, p.pos.y);
    const at = { x: Math.floor(p.pos.x) + 0.5, y: Math.floor(p.pos.y) + 0.5 };
    const garden = inGarden(s, at);
    if (!t || t.fertility >= (garden ? C.gardenBelow : C.below) || skip(at)) continue;
    const score = (1 - t.fertility) * (garden ? 2 : 1) - dist(at, from) / 40;
    if (score > bs) { bs = score; best = at; }
  }
  return best;
}

/** Spread one compost at `at`: +0.3 on the tile, +0.15 on the eight around it (§8.3). */
export function spreadCompost(s: WorldState, at: Vec2): void {
  const x0 = Math.floor(at.x), y0 = Math.floor(at.y);
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) {
      const t = tileAt(s, x0 + dx, y0 + dy);
      if (t && t.biome !== 'water') t.fertility = q4(Math.min(1.3, t.fertility + (dx || dy ? G.compost.edge : G.compost.fertility)));
    }
}
