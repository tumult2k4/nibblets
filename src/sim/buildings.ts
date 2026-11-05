/** Buildings (§10.1–10.2): site finding, blueprints, material delivery bookkeeping, labor, completion. */
import { CFG } from './config';
import { clamp, dist, q4 } from '../shared/math';
import { allocId } from '../shared/ids';
import { fnv1a } from '../shared/rng';
import type { BuildingType, ID, ItemStack, ItemType, Vec2 } from '../shared/types';
import type { Building, Goblin, WorldState } from './state';
import type { World } from './world';
import { tileAt } from './grid';
import { countItem } from './inventory';

const B = CFG.buildings;

export const buildingDef = (t: BuildingType) => B.defs[t];
export const isComplete = (b: Building): boolean => b.buildProgress >= 1;
export const isBlueprint = (b: Building): boolean => b.buildProgress < 1;

/** Integer tiles under a building whose footprint is centered on `pos` (an integer tile corner). */
export function footprintTiles(pos: Vec2, size: number): Vec2[] {
  const out: Vec2[] = [];
  const x0 = Math.round(pos.x - size / 2), y0 = Math.round(pos.y - size / 2);
  for (let y = y0; y < y0 + size; y++) for (let x = x0; x < x0 + size; x++) out.push({ x, y });
  return out;
}

/** Materials still to be delivered before labor can start. */
export function missingMaterials(b: Building): ItemStack[] {
  const def = buildingDef(b.type);
  if (!def || isComplete(b)) return [];
  const out: ItemStack[] = [];
  for (const [type, need] of Object.entries(def.cost)) {
    const have = b.storage.find((s) => s.type === type)?.qty ?? 0;
    if (have < need) out.push({ type: type as ItemType, qty: need - have });
  }
  return out;
}

/** Amount of `type` other goblins are already carrying to `b` (cooperative hauling without over-delivery). */
export function inFlight(w: World, b: Building, type: ItemType, except: ID): number {
  let n = 0;
  for (const g of w.s.goblins)
    if (g.id !== except && g.activity.action === 'deliver_material' && g.activity.targetId === b.id && g.activity.stage >= 2) n += countItem(g, type);
  return n;
}

export function siteTilesOk(s: WorldState, pos: Vec2, size: number): boolean {
  let lo = Infinity, hi = -Infinity;
  for (const p of footprintTiles(pos, size)) {
    const t = tileAt(s, p.x, p.y);
    if (!t || !t.walkable || t.biome === 'water' || t.biome === 'rock' || t.occupiedBy !== null) return false;
    lo = Math.min(lo, t.height);
    hi = Math.max(hi, t.height);
  }
  return hi - lo <= B.maxSlope;
}

/** No plant (flowers aside) or rock stands where the footprint goes. */
export function siteClear(w: World, pos: Vec2, size: number): boolean {
  for (const p of w.plantHash.query(pos, size)) if (p.kind !== 'flower' && dist(p.pos, pos) < size * 0.75) return false;
  return !w.s.rocks.some((r) => dist(r.pos, pos) < size * 0.75 + r.size * 0.3);
}

/**
 * §10.1 findSite: candidates within `siteRadius` of `near`, scored by flatness, distance to water (huts like 4–10),
 * spacing from other buildings (3–6), avoiding orchards, fertile soil and trails. Deterministic (hash tie-break).
 */
export function findSite(w: World, type: BuildingType, near: Vec2): Vec2 | null {
  const s = w.s;
  const def = buildingDef(type);
  if (!def) return null;
  const R = B.siteRadius;
  const water: Vec2[] = [];
  const pad = R + B.waterPref[1] + 2;
  for (let y = Math.max(0, Math.floor(near.y - pad)); y < Math.min(s.size.h, near.y + pad); y++)
    for (let x = Math.max(0, Math.floor(near.x - pad)); x < Math.min(s.size.w, near.x + pad); x++)
      if (tileAt(s, x, y)!.biome === 'water') water.push({ x: x + 0.5, y: y + 0.5 });
  let best: Vec2 | null = null, bestScore = -Infinity;
  for (let y = Math.ceil(near.y - R); y <= near.y + R; y++)
    for (let x = Math.ceil(near.x - R); x <= near.x + R; x++) {
      const pos = { x, y };
      const dc = dist(pos, near);
      if (dc > R || !siteTilesOk(s, pos, def.footprint)) continue;
      if (dist(pos, s.village.stockpilePos) < 2.5) continue;
      let score = -dc * 0.05;
      let nearestB = Infinity;
      for (const b of s.buildings) nearestB = Math.min(nearestB, dist(b.pos, pos));
      if (nearestB < B.hutSpacing[0]) continue;
      if (nearestB < Infinity && nearestB > B.hutSpacing[1]) score -= (nearestB - B.hutSpacing[1]) * 0.3;
      if (!siteClear(w, pos, def.footprint)) continue;
      let orchard = 0;
      for (const p of w.plantHash.query(pos, 3)) if (p.kind === 'apple_bush' || p.kind === 'berry_bush') orchard += 1;
      score -= orchard * 0.3;
      let dw = Infinity;
      for (const wp of water) dw = Math.min(dw, dist(wp, pos));
      const [w0, w1] = B.waterPref;
      score -= dw < w0 ? (w0 - dw) * 0.6 : dw > w1 ? Math.min(6, (dw - w1) * 0.2) : 0;
      for (const p of footprintTiles(pos, def.footprint)) {
        const t = tileAt(s, p.x, p.y)!;
        score -= t.fertility * 0.15 + t.wear * 0.5;
      }
      score += (fnv1a(`${x},${y}`, s.seed) % 1000) / 1e5;
      if (score > bestScore) { bestScore = score; best = pos; }
    }
  return best;
}

function markFootprint(w: World, b: Building, id: ID | null): void {
  for (const p of footprintTiles(b.pos, b.footprint.w)) {
    const t = tileAt(w.s, p.x, p.y);
    if (t) t.occupiedBy = id;
  }
  w.s.terrainVersion += 1; // path costs changed
}

/** Reserve a site as a ghost blueprint (§10.1). */
export function placeBlueprint(w: World, type: BuildingType, pos: Vec2, ownerId: ID | null): Building {
  const def = buildingDef(type)!;
  const b: Building = {
    id: allocId(w.s), type, pos: { x: pos.x, y: pos.y }, rotation: 0, footprint: { w: def.footprint, h: def.footprint },
    buildProgress: 0, hp: def.hp, maxHp: def.hp, ownerId, storage: [], occupants: [], decoration: [], data: {},
  };
  w.s.buildings.push(b);
  markFootprint(w, b, b.id);
  w.emit({ type: 'building_placed', buildingId: b.id, kind: type, ...(ownerId !== null ? { goblinId: ownerId } : {}), at: b.pos });
  return b;
}

/** Labor rate per tick (§10.2): 0.002 × (1 + skill × 0.15) × mood speed, ×1.3 when a friend works alongside. */
export function laborRate(w: World, g: Goblin, b: Building): number {
  const skill = g.skills.building ?? 0;
  const mood = 0.95 + 0.25 * clamp(g.mood.value / 100, -1, 1);
  let rate = B.buildRate * (1 + skill * B.skillBonus) * mood;
  const friend = w.s.goblins.some((o) => o.id !== g.id && o.activity.action === 'build' && o.activity.targetId === b.id
    && (g.relationships.find((r) => r.targetId === o.id)?.opinion ?? 0) >= CFG.social.friend);
  if (friend) rate *= B.friendBonus;
  return rate;
}

/** One tick of work on `b` by `g`. Returns true when this tick completed the building. */
export function addLabor(w: World, g: Goblin, b: Building): boolean {
  if (isComplete(b) || missingMaterials(b).length) return false;
  b.buildProgress = q4(Math.min(1, b.buildProgress + laborRate(w, g, b)));
  g.skills.building = q4((g.skills.building ?? 0) + B.skillPerTick);
  const key = `w${g.id}`;
  b.data![key] = (b.data![key] ?? 0) + 1;
  if (b.buildProgress < 1) return false;
  completeBuilding(w, b, g.id);
  return true;
}

export function completeBuilding(w: World, b: Building, finisher: ID | null): void {
  b.buildProgress = 1;
  b.storage = []; // construction materials are used up; the storage now belongs to the building
  for (const k of Object.keys(b.data ?? {})) {
    if (!k.startsWith('w')) continue;
    const g = w.goblin(Number(k.slice(1)));
    if (g) g.deeds.builds += 1;
    delete b.data![k];
  }
  w.emit({ type: 'building_completed', buildingId: b.id, kind: b.type, ...(finisher !== null ? { goblinId: finisher } : {}), at: b.pos });
}

/** Blueprints still in progress (oldest first). */
export const blueprints = (s: WorldState): Building[] => s.buildings.filter(isBlueprint);

/** Standing spot next to a building for worker `g` (spread around the footprint so builders don't stack). */
export function workSpot(s: WorldState, b: Building, g: Goblin): Vec2 {
  const r = b.footprint.w * 0.5 + 0.45;
  for (let k = 0; k < 8; k++) {
    const a = g.id * 2.39996 + (k * Math.PI) / 4;
    const p = { x: q4(b.pos.x + Math.cos(a) * r), y: q4(b.pos.y + Math.sin(a) * r) };
    const t = tileAt(s, p.x, p.y);
    if (t?.walkable && t.occupiedBy === null) return p;
  }
  return { x: b.pos.x, y: b.pos.y + r };
}
