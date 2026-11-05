import type { ItemStack, ItemType } from '../shared/types';
import { CFG } from './config';
import { isFood, itemDef } from './items';
import type { Goblin } from './state';
import { express } from './goblin/genetics/phenotype';

export function slotCount(g: Goblin): number {
  if (g.lifeStage === 'hatchling') return 0;
  if (g.lifeStage === 'youngling') return 1;
  return CFG.goblin.inventorySlots + (express(g.genome, 'adultSize') > 1.15 ? 1 : 0);
}

/** Can one more unit of `type` fit (existing stack with room, or a free slot)? */
export function canCarry(g: Goblin, type: ItemType): boolean {
  const st = g.inventory.find((s) => s.type === type && s.qty < itemDef(type).stack);
  return !!st || g.inventory.length < slotCount(g);
}

export function addItem(g: Goblin, stack: ItemStack): number {
  let left = stack.qty;
  const max = itemDef(stack.type).stack;
  for (const s of g.inventory)
    if (s.type === stack.type && !!s.divine === !!stack.divine && s.qty < max) {
      const n = Math.min(left, max - s.qty);
      s.qty += n;
      left -= n;
    }
  while (left > 0 && g.inventory.length < slotCount(g)) {
    const n = Math.min(left, max);
    g.inventory.push(stack.divine ? { type: stack.type, qty: n, divine: true } : { type: stack.type, qty: n });
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
  return { type: s.type, qty: 1, ...(s.divine ? { divine: true } : {}) };
}

/** Best food in the inventory (most nutritious first). Apple cores are kept for planting unless `cores`. */
export const foodStack = (g: Goblin, cores = false): ItemStack | undefined =>
  [...g.inventory].filter((s) => isFood(s.type) && (cores || s.type !== 'apple_core')).sort((a, b) => (itemDef(b.type).nutrition ?? 0) - (itemDef(a.type).nutrition ?? 0))[0];

export const countItem = (g: Goblin, t: ItemType): number =>
  g.inventory.reduce((n, s) => n + (s.type === t ? s.qty : 0), 0);
