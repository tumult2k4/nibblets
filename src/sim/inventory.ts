import type { ItemStack, ItemType } from '../shared/types';
import { CFG } from './config';
import { isFood, itemDef } from './items';
import type { Goblin } from './state';
import { express } from './goblin/genetics/phenotype';
import { bagSlots } from './clothing';

/** Pack slots: 4 for adults (5 if big), 1 for younglings; a basket holds 4 more and doesn't take one itself (P5.6). */
export function slotCount(g: Goblin): number {
  if (g.lifeStage === 'hatchling') return 0;
  const bag = bagSlots(g);
  const base = g.lifeStage === 'youngling' ? 1 : CFG.goblin.inventorySlots + (express(g.genome, 'adultSize') > 1.15 ? 1 : 0);
  return base + (bag ? bag + 1 : 0);
}

/** Can one more unit of `type` fit (existing stack with room, or a free slot)? */
export function canCarry(g: Goblin, type: ItemType): boolean {
  const st = g.inventory.find((s) => s.type === type && s.qty < itemDef(type).stack);
  return !!st || g.inventory.length < slotCount(g);
}

/** A stack of `qty` like `s` (keeps the divine mark and a tool's wear). */
export function copyStack(s: ItemStack, qty: number): ItemStack {
  const c: ItemStack = { type: s.type, qty };
  if (s.divine) c.divine = true;
  if (s.dur !== undefined) c.dur = s.dur;
  if (s.fine) c.fine = true;
  return c;
}

export function addItem(g: Goblin, stack: ItemStack): number {
  let left = stack.qty;
  const max = itemDef(stack.type).stack;
  for (const s of g.inventory)
    if (s.type === stack.type && !!s.divine === !!stack.divine && s.dur === stack.dur && !!s.fine === !!stack.fine && s.qty < max) {
      const n = Math.min(left, max - s.qty);
      s.qty += n;
      left -= n;
    }
  while (left > 0 && g.inventory.length < slotCount(g)) {
    const n = Math.min(left, max);
    g.inventory.push(copyStack(stack, n));
    left -= n;
  }
  return stack.qty - left;
}

/** Removes one unit; returns the stack it came from (copy) or null. */
export function takeOne(g: Goblin, pred: (s: ItemStack) => boolean): ItemStack | null {
  const i = g.inventory.findIndex(pred);
  if (i < 0) return null;
  const s = g.inventory[i]!;
  s.qty -= 1;
  if (s.qty <= 0) g.inventory.splice(i, 1);
  return copyStack(s, 1);
}

/** Remove up to `n` units of `t` from the inventory (smallest stacks first); returns how many were removed. */
export function removeItems(g: Goblin, t: ItemType, n: number): number {
  let left = n;
  const stacks = g.inventory.filter((s) => s.type === t).sort((a, b) => a.qty - b.qty);
  for (const s of stacks) {
    const k = Math.min(left, s.qty);
    s.qty -= k;
    left -= k;
    if (left <= 0) break;
  }
  g.inventory = g.inventory.filter((s) => s.qty > 0);
  return n - left;
}

/** Order to eat in: what rots soonest first (P5.6), then the most nutritious. */
export const eatOrder = (a: ItemStack, b: ItemStack): number =>
  (itemDef(a.type).shelfDays ?? 99) - (itemDef(b.type).shelfDays ?? 99) || (itemDef(b.type).nutrition ?? 0) - (itemDef(a.type).nutrition ?? 0);

/** Food to eat next from the inventory (see `eatOrder`). Apple cores are kept for planting unless `cores`; a redcap is food only to those who don't know it's poison. */
export const foodStack = (g: Goblin, cores = false): ItemStack | undefined =>
  [...g.inventory].filter((s) => isFood(s.type) && (cores || s.type !== 'apple_core') && !(s.type === 'redcap' && g.knownFacts.includes('redcap_is_poison'))).sort(eatOrder)[0];

export const countItem = (g: Goblin, t: ItemType): number =>
  g.inventory.reduce((n, s) => n + (s.type === t ? s.qty : 0), 0);
