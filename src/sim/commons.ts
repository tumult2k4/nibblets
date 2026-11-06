/**
 * P7.5 the commons (§12.3–12.4): stockpile zones and village demand. The store is one communal stock, kept in two
 * places once the village is settled: food (and seed, compost and the rest) at the old stockpile spot, materials at
 * a material zone a few tiles off. Village demand is recomputed every 300 ticks from what the village is short of, and
 * raises the scores of the work that meets it for everyone (the industrious most): a division of labour without
 * anyone being told.
 */
import { CFG } from './config';
import { clamp, dist } from '../shared/math';
import { itemDef, isFood } from './items';
import { tileAt } from './grid';
import { isComplete } from './buildings';
import { foodStores } from './spoilage';
import { bestWeapon } from './tools';
import type { ActionId, Demand, Goblin, WorldState } from './state';
import type { ItemType, Vec2 } from '../shared/types';
import type { World } from './world';

const Z = CFG.commons.zones, D = CFG.commons.demand;

/** Kept in the material zone besides the tray's materials: feathers and pelts (leaves and ash stay by the food, for the heap and the paint). */
const LOOSE_MATERIALS: ReadonlySet<ItemType> = new Set(['feather', 'pelt', 'bone']);
export const isMaterial = (t: ItemType): boolean => !isFood(t) && (itemDef(t).tray === 'materials' || LOOSE_MATERIALS.has(t));

/** Where `t` is kept. */
export const storePos = (s: WorldState, t: ItemType): Vec2 => (isMaterial(t) && s.village.materialPos ? s.village.materialPos : s.village.stockpilePos);
/** Where a fetch of `types` is made: the material zone if any of them is kept there (the stock is one, so it all comes from there). */
export const fetchPos = (s: WorldState, types: readonly ItemType[]): Vec2 =>
  (s.village.materialPos && types.some(isMaterial) ? s.village.materialPos : s.village.stockpilePos);
/** Is `p` at one of the store's zones (within `r`)? */
export const atStore = (s: WorldState, p: Vec2, r: number): boolean =>
  dist(p, s.village.stockpilePos) <= r || (!!s.village.materialPos && dist(p, s.village.materialPos) <= r);

/** A clear patch of ground a few tiles from the food store, toward the center (none if the land is too crowded). */
export function materialSite(w: World): Vec2 | null {
  const s = w.s, sp = s.village.stockpilePos, c = s.village.center, [r0, r1] = Z.ring;
  let best: Vec2 | null = null, bs = Infinity;
  for (let y = Math.floor(sp.y - r1); y <= sp.y + r1; y++)
    for (let x = Math.floor(sp.x - r1); x <= sp.x + r1; x++) {
      const p = { x: x + 0.5, y: y + 0.5 }, d = dist(p, sp);
      if (d < r0 || d > r1) continue;
      let ok = true;
      for (let dy = -1; dy <= 1 && ok; dy++)
        for (let dx = -1; dx <= 1 && ok; dx++) {
          const t = tileAt(s, x + dx, y + dy);
          ok = !!t && t.walkable && t.biome !== 'water' && t.occupiedBy === null;
        }
      if (!ok || w.plantHash.query(p, 1.2).some((q) => q.kind !== 'flower' && dist(q.pos, p) < 1.2) || s.rocks.some((r) => dist(r.pos, p) < 1.5)) continue;
      const score = dist(p, c) + Math.abs(d - (r0 + r1) / 2) * 0.5;
      if (score < bs) { bs = score; best = p; }
    }
  return best;
}

/** What the village is short of, 0..1 each. */
export function computeDemand(w: World): Demand {
  const s = w.s;
  const adults = s.goblins.filter((g) => g.lifeStage === 'adult' || g.lifeStage === 'elder');
  const n = Math.max(1, adults.length);
  const food = clamp(1 - foodStores(s).days / D.foodDays, 0, 1);
  // spare spears for the guards: only once Gnashers have come
  const weapons = s.threat.alarms > 0 ? adults.filter((g) => !bestWeapon(g)).length / n : 0;
  const housing = adults.filter((g) => g.homeId === null).length / n;
  const worn = s.buildings.filter((b) => isComplete(b) && b.hp < b.maxHp * D.repairBelow).length;
  return { food, weapons, housing, repair: clamp(worn / D.repairFull, 0, 1) };
}

/** §6 step 18: every 300 ticks, mark the material zone once the village is settled, and recompute the demand. */
export function updateCommons(w: World): void {
  const s = w.s;
  if (s.tick % Z.every !== 0) return;
  if (!s.village.materialPos && s.buildings.some((b) => b.type === 'campfire' && isComplete(b)) && s.buildings.some((b) => (b.type === 'hut' || b.type === 'stone_hut') && isComplete(b))) {
    const p = materialSite(w);
    if (p) {
      s.village.materialPos = p;
      w.emit({ type: 'zone_marked', zone: 'materials', at: { ...p } });
    }
  }
  s.village.demand = computeDemand(w);
}

/** The work that meets each shortfall. */
const MEETS: Partial<Record<ActionId, keyof Demand>> = {
  harvest_fruit: 'food', forage: 'food', fish: 'food', hunt: 'food', process: 'food',
  craft: 'weapons',
  claim_home: 'housing', plan_building: 'housing', build: 'housing', deliver_material: 'housing', gather_for_goal: 'housing',
  repair_building: 'repair',
};

/** Score multiplier for `id` from the village's demand (1 when it meets nothing short). */
export function demandMul(g: Goblin, s: WorldState, id: ActionId): number {
  const k = MEETS[id], d = s.village.demand;
  if (!k || !d || g.lifeStage === 'youngling' || g.lifeStage === 'hatchling') return 1;
  return 1 + D.boost * d[k] * (0.4 + g.personality.industry);
}
