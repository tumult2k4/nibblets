import type { ItemStack, ItemType } from '../shared/types';
import type { WorldState } from './state';
import { isFood, itemDef } from './items';

/** Village stockpile (P2.3): one unbounded stack per item type at `village.stockpilePos`. */
export const stockCount = (s: WorldState, t: ItemType): number => s.village.stockpile.find((x) => x.type === t)?.qty ?? 0;

/** Food to hand out: whatever rots soonest (P5.6), so the preserves are kept for lean days. */
export const stockFood = (s: WorldState): ItemStack | undefined =>
  s.village.stockpile.filter((x) => isFood(x.type) && x.type !== 'apple_core' && x.type !== 'redcap' && x.qty > 0)
    .sort((a, b) => (itemDef(a.type).shelfDays ?? 99) - (itemDef(b.type).shelfDays ?? 99))[0];

export function deposit(s: WorldState, stack: ItemStack): void {
  const cur = s.village.stockpile.find((x) => x.type === stack.type);
  if (cur) cur.qty += stack.qty;
  else s.village.stockpile.push({ type: stack.type, qty: stack.qty });
  s.village.stockpile.sort((a, b) => (a.type < b.type ? -1 : 1));
}

export function withdraw(s: WorldState, t: ItemType, n: number): number {
  const cur = s.village.stockpile.find((x) => x.type === t);
  if (!cur) return 0;
  const k = Math.min(n, cur.qty);
  cur.qty -= k;
  if (cur.qty <= 0) s.village.stockpile.splice(s.village.stockpile.indexOf(cur), 1);
  return k;
}
