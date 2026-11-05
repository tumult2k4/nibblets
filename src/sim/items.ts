import type { ItemType } from '../shared/types';
import { CFG } from './config';

export interface ItemDef {
  stack: number; weight: number; nutrition?: number; decayDays?: number; value: number;
  tool?: { chopMul?: number; mineMul?: number; fishMul?: number };
  weapon?: { dmg: number; range: number };
  wear?: { warmth?: number; armor?: number; charm?: number };
  burnable?: boolean;
  /** shown in the Gift Tray (§18.5); cost = value */
  tray?: 'food' | 'materials' | 'tools' | 'treasures' | 'life';
}

const F = CFG.food;
/** Content table — counts as config (§0.1 rule 7). Later phases fill in the rest. */
export const ITEM_DEFS: Partial<Record<ItemType, ItemDef>> = {
  apple: { stack: 10, weight: 1, nutrition: F.apple, decayDays: 6, value: 2, tray: 'food' },
  apple_core: { stack: 10, weight: 0.5, nutrition: F.apple_core, decayDays: 4, value: 1 },
  apple_mash: { stack: 10, weight: 1, nutrition: F.apple_mash, decayDays: 3, value: 3, tray: 'food' },
  berry: { stack: 20, weight: 0.3, nutrition: F.berry, decayDays: 3, value: 1, tray: 'food' },
  mushroom: { stack: 10, weight: 0.5, nutrition: F.mushroom, decayDays: 4, value: 1, tray: 'food' },
  fish: { stack: 5, weight: 1, nutrition: F.fish, decayDays: 2, value: 3, tray: 'food' },
  stew: { stack: 3, weight: 1.5, nutrition: F.stew, decayDays: 2, value: 6, tray: 'food' },
  wood: { stack: 10, weight: 2, value: 3, burnable: true, tray: 'materials' },
  stick: { stack: 20, weight: 0.5, value: 1, burnable: true, tray: 'materials' },
  stone: { stack: 10, weight: 3, value: 3, tray: 'materials' },
  flint: { stack: 10, weight: 1, value: 5, tray: 'materials' },
  fiber: { stack: 20, weight: 0.3, value: 2, burnable: true, tray: 'materials' },
  clay: { stack: 10, weight: 2, value: 2, tray: 'materials' },
};

export const GIFT_TRAY: Record<'food' | 'materials', ItemType[]> = {
  food: ['apple', 'berry', 'mushroom', 'fish', 'apple_mash', 'stew'],
  materials: ['wood', 'stick', 'stone', 'flint', 'fiber', 'clay'],
};

export const itemDef = (t: ItemType): ItemDef => ITEM_DEFS[t] ?? { stack: 10, weight: 1, value: 1 };
export const isFood = (t: ItemType): boolean => (itemDef(t).nutrition ?? 0) > 0;
