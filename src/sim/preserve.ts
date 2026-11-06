/**
 * Preservation (§11.2, P5.6): the grinding stone turns 2 apples into 1 apple mash (keeps 12 days, +55); a drying rack
 * dries a batch of up to 12 apples in a day of dry weather (rain pauses it) into dried apples (30 days, +30); storage
 * pits keep the stockpile cool (spoilage.ts). Goblins process the apples the village can't eat before they rot:
 * the surplus over two a head.
 */
import { CFG } from './config';
import { dist } from '../shared/math';
import { buildingDef, isComplete } from './buildings';
import { stockCount } from './stockpile';
import { rainingAt } from './weather';
import { foodStores } from './spoilage';
import type { Building, Goblin, WorldState } from './state';
import type { World } from './world';
import { litFireNear } from './fire';
import { countItem } from './inventory';

const R = CFG.preserve;
const DAY = CFG.time.dayTicks;

export const PRESERVE_RECIPES: readonly string[] = ['grinding_stone', 'drying_rack', 'storage_pit'];

export const stations = (s: WorldState, type: 'grinding_stone' | 'drying_rack' | 'storage_pit'): Building[] =>
  s.buildings.filter((b) => b.type === type && isComplete(b));

/** Raw apples in the stockpile beyond what the village will eat fresh. */
export const surplusApples = (s: WorldState): number => stockCount(s, 'apple') - Math.ceil(s.goblins.length * R.freshPerGoblin);

export const rackLoad = (b: Building): number => b.storage.reduce((n, x) => n + (x.type === 'apple' ? x.qty : 0), 0);
export const rackDried = (b: Building): number => b.storage.reduce((n, x) => n + (x.type === 'dried_apple' ? x.qty : 0), 0);
export const isDrying = (b: Building): boolean => (b.data?.drying ?? 0) > 0;
/** How far along a rack's batch is (0..1). */
export const dryProgress = (b: Building): number => Math.min(1, (b.data?.dry ?? 0) / (R.dryDays * DAY));

/** Start drying what's on the rack. */
export function startDrying(b: Building, by: Goblin): void {
  b.data = { ...(b.data ?? {}), drying: 1, dry: 0, by: by.id };
}

/** Every `spoilEvery` ticks: racks dry while it isn't raining on them; a finished batch turns to dried apples. */
export function updateRacks(w: World): void {
  if (w.s.tick % R.spoilEvery !== 0) return;
  for (const b of w.s.buildings) {
    if (b.type !== 'drying_rack' || !isDrying(b) || rainingAt(w, b.pos)) continue;
    const d = (b.data!.dry = (b.data!.dry ?? 0) + R.spoilEvery);
    if (d < R.dryDays * DAY) continue;
    const n = rackLoad(b);
    b.storage = b.storage.filter((x) => x.type !== 'apple');
    const cur = b.storage.find((x) => x.type === 'dried_apple');
    if (cur) cur.qty += n;
    else b.storage.push({ type: 'dried_apple', qty: n });
    const by = b.data!.by ?? -1;
    b.data = { drying: 0, dry: 0 };
    w.emit({ type: 'food_processed', goblinId: by, buildingId: b.id, item: 'dried_apple', qty: n, at: { ...b.pos } });
  }
}

export type ProcessJob = { kind: 'unload' | 'load' | 'grind' | 'cook'; b: Building };

/** P7.2: raw fish and meat, and what a campfire makes of them. */
export const RAW_COOKED = { fish: 'cooked_fish', meat: 'cooked_meat' } as const;
export const rawInStock = (s: WorldState): number => stockCount(s, 'fish') + stockCount(s, 'meat');
export const rawHeld = (g: Goblin): number => countItem(g, 'fish') + countItem(g, 'meat');

const claimed = (w: World, g: Goblin, b: Building): boolean =>
  w.s.goblins.some((o) => o !== g && o.activity.action === 'process' && o.activity.status === 'running' && o.activity.targetId === b.id);

/** The most useful processing job for `g`: empty a finished rack, fill an idle one, else grind (nearest station). */
export function processJob(g: Goblin, w: World): ProcessJob | null {
  const near = (bs: Building[]): Building | null => bs.filter((b) => !claimed(w, g, b)).sort((a, b) => dist(g.pos, a.pos) - dist(g.pos, b.pos))[0] ?? null;
  const racks = stations(w.s, 'drying_rack');
  const done = near(racks.filter((b) => !isDrying(b) && rackDried(b) > 0));
  if (done) return { kind: 'unload', b: done };
  // P7.2: raw fish and meat keep a day; cook them at a lit campfire near the store
  // (or whatever the goblin itself carries, at a fire by the store or close by it)
  if (rawInStock(w.s) > 0 || rawHeld(g) > 0) {
    const fire = litFireNear(w, w.s.village.stockpilePos, CFG.economy.cook.range) ?? (rawHeld(g) > 0 ? litFireNear(w, g.pos, CFG.economy.cook.range) : null);
    if (fire && !claimed(w, g, fire)) return { kind: 'cook', b: fire };
  }
  const surplus = surplusApples(w.s);
  if (surplus >= R.rackMin) {
    const idle = near(racks.filter((b) => !isDrying(b) && rackDried(b) === 0 && rackLoad(b) < (buildingDef(b.type)?.storage ?? 0)));
    if (idle) return { kind: 'load', b: idle };
  }
  if (surplus >= R.grindIn) {
    const stone = near(stations(w.s, 'grinding_stone'));
    if (stone) return { kind: 'grind', b: stone };
  }
  return null;
}

/** 0..1: how much the village wants apples put by now (more in autumn, and when stores are thin). */
export function processUrge(s: WorldState, season: string): number {
  const surplus = Math.min(1, Math.max(0, surplusApples(s)) / 12);
  const thin = 1 - Math.min(1, foodStores(s).days / (2 * (R.stockUpDays[season] ?? 1)));
  return surplus * (0.5 + 0.5 * thin) * (season === 'autumn' ? R.autumnMul : 1);
}

let stockCache = { tick: -1, s: null as WorldState | null, v: 0 };
/** 0..1: goblins pick fruit for the stores, not just their bellies, while the stores hold less than `stockUpDays` (most in autumn). */
export function stockUpUrge(w: World): number {
  const s = w.s;
  if (stockCache.tick !== s.tick || stockCache.s !== s) {
    const base = R.stockUpScore[w.clock.season] ?? 0, target = R.stockUpDays[w.clock.season] ?? 0;
    stockCache = { tick: s.tick, s, v: base > 0 && target > 0 ? base * Math.max(0, 1 - foodStores(s).days / target) : 0 };
  }
  return stockCache.v;
}
