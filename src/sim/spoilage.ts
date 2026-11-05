/**
 * Spoilage (§11.2, P5.6): food kept in the stockpile, a pantry, a pack or on a rack slowly rots. Each stack loses
 * `qty / shelfDays` units a day (so a stock left alone fades like e^(−t / shelfDays)); the fraction carries over in
 * `rot` so losses stay whole units and deterministic. Up to its capacity a storage pit keeps the stockpile cool:
 * food in it rots at half the rate, the most perishable first. Ground items keep their own age limit (P2).
 * What rotted is reported once a day (`food_spoiled`).
 */
import { CFG } from './config';
import { dist, q4 } from '../shared/math';
import { itemDef } from './items';
import { isComplete } from './buildings';
import type { ItemStack, ItemType } from '../shared/types';
import type { Building, WorldState } from './state';
import type { World } from './world';

const R = CFG.preserve;

export const perishable = (t: ItemType): boolean => (itemDef(t).shelfDays ?? 0) > 0;

/** Rot `s` for `days` at `mul` (a pit: 0.5); returns the units lost. */
export function rotStack(s: ItemStack, days: number, mul = 1): number {
  const L = itemDef(s.type).shelfDays;
  if (!L || s.qty <= 0) return 0;
  const r = (s.rot ?? 0) + (s.qty * days * mul) / L;
  const k = Math.min(s.qty, Math.floor(r));
  s.qty -= k;
  s.rot = s.qty > 0 ? q4(r - k) : 0;
  return k;
}

/** Finished storage pits serving the stockpile. */
export const pits = (s: WorldState): Building[] =>
  s.buildings.filter((b) => b.type === 'storage_pit' && isComplete(b) && dist(b.pos, s.village.stockpilePos) <= CFG.knowledge.stockReach * 2);

/** Units of stockpiled food the pits can keep cool. */
export const pitCapacity = (s: WorldState): number => pits(s).reduce((n, b) => n + (CFG.buildings.defs[b.type]?.storage ?? 0), 0);

/** The stockpile's stacks with the share of each kept in a pit (most perishable first). */
export function pitShares(s: WorldState): Map<ItemStack, number> {
  let cap = pitCapacity(s);
  const out = new Map<ItemStack, number>();
  const food = s.village.stockpile.filter((x) => perishable(x.type)).sort((a, b) => (itemDef(a.type).shelfDays ?? 0) - (itemDef(b.type).shelfDays ?? 0));
  for (const st of food) {
    const k = Math.min(st.qty, cap);
    cap -= k;
    out.set(st, st.qty ? k / st.qty : 0);
  }
  return out;
}

function tally(out: Partial<Record<ItemType, number>>, t: ItemType, k: number): void {
  if (k > 0) out[t] = (out[t] ?? 0) + k;
}

/** §6 step 7b: every `spoilEvery` ticks, rot everything perishable that is stored or carried. */
export function updateSpoilage(w: World): void {
  const s = w.s;
  if (s.tick % R.spoilEvery !== 0) return;
  const days = R.spoilEvery / CFG.time.dayTicks;
  const lost: Partial<Record<ItemType, number>> = (s.village.spoiled ??= {});
  const shares = pitShares(s);
  for (const st of s.village.stockpile) tally(lost, st.type, rotStack(st, days, 1 - (1 - R.pitMul) * (shares.get(st) ?? 0)));
  s.village.stockpile = s.village.stockpile.filter((x) => x.qty > 0);
  for (const b of s.buildings) {
    if (!b.storage.length) continue;
    // apples on a rack that is drying are drying, not rotting
    const drying = b.type === 'drying_rack' && (b.data?.drying ?? 0) > 0;
    for (const st of b.storage) if (!(drying && st.type === 'apple')) tally(lost, st.type, rotStack(st, days));
    b.storage = b.storage.filter((x) => x.qty > 0);
  }
  for (const g of s.goblins) {
    let gone = false;
    for (const st of g.inventory) {
      const k = rotStack(st, days);
      tally(lost, st.type, k);
      gone ||= st.qty <= 0;
    }
    if (gone) g.inventory = g.inventory.filter((x) => x.qty > 0);
  }
  if (s.tick % CFG.time.dayTicks !== 0) return;
  const qty = Object.values(lost).reduce((a, b) => a + (b ?? 0), 0);
  s.stats.spoiled = (s.stats.spoiled ?? 0) + qty;
  if (qty > 0) w.emit({ type: 'food_spoiled', qty, items: { ...lost } });
  s.village.spoiled = {};
}

/** Food in the stockpile and pantries, and roughly how many days it would feed the village (≈ 60 food a goblin a day). */
export function foodStores(s: WorldState): { food: number; days: number } {
  let food = 0;
  const add = (st: ItemStack): void => {
    if (st.type !== 'apple_core' && st.type !== 'redcap') food += (itemDef(st.type).nutrition ?? 0) * st.qty;
  };
  s.village.stockpile.forEach(add);
  for (const b of s.buildings) if (b.type !== 'drying_rack') b.storage.forEach(add);
  for (const b of s.buildings) if (b.type === 'drying_rack') for (const st of b.storage) food += (itemDef(st.type === 'apple' ? 'dried_apple' : st.type).nutrition ?? 0) * st.qty;
  const eat = Math.max(1, s.goblins.length) * CFG.goblin.decayPerDay.hunger;
  return { food, days: food / eat };
}
