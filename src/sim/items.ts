import type { ItemType, PlantKind } from '../shared/types';
import { CFG } from './config';

export interface ItemDef {
  stack: number; weight: number; nutrition?: number; decayDays?: number; value: number;
  tool?: { chopMul?: number; mineMul?: number; fishMul?: number; fells?: boolean };
  /** tools & weapons: durability in uses (§11.3) and what a broken one leaves behind */
  uses?: number;
  breaksInto?: Partial<Record<ItemType, number>>;
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
  apple_core: { stack: 10, weight: 0.5, nutrition: F.apple_core, decayDays: 4, value: 1, tray: 'life' },
  apple_mash: { stack: 10, weight: 1, nutrition: F.apple_mash, decayDays: 3, value: 3, tray: 'food' },
  berry: { stack: 20, weight: 0.3, nutrition: F.berry, decayDays: 3, value: 1, tray: 'food' },
  mushroom: { stack: 10, weight: 0.5, nutrition: F.mushroom, decayDays: 4, value: 1, tray: 'food' },
  glowcap: { stack: 10, weight: 0.3, nutrition: F.glowcap, decayDays: 6, value: 2 },
  fish: { stack: 5, weight: 1, nutrition: F.fish, decayDays: 2, value: 3, tray: 'food' },
  stew: { stack: 3, weight: 1.5, nutrition: F.stew, decayDays: 2, value: 6, tray: 'food' },
  wood: { stack: 10, weight: 2, value: 3, burnable: true, tray: 'materials' },
  stick: { stack: 20, weight: 0.5, value: 1, burnable: true, tray: 'materials' },
  stone: { stack: 10, weight: 3, value: 3, tray: 'materials' },
  flint: { stack: 10, weight: 1, value: 5, tray: 'materials' },
  fiber: { stack: 20, weight: 0.3, value: 2, burnable: true, tray: 'materials' },
  clay: { stack: 10, weight: 2, value: 2, tray: 'materials' },
  // tools & weapons (§11.1/§11.3): one per slot; a use = one finished job (tree felled, stone mined) or one hit
  spear: { stack: 1, weight: 2, value: 6, weapon: { dmg: CFG.combat.spear, range: 1.5 }, uses: 25, breaksInto: { stick: 1 }, tray: 'tools' },
  stone_spear: { stack: 1, weight: 2, value: 10, weapon: { dmg: CFG.combat.stone_spear, range: 1.5 }, uses: 35, breaksInto: { stick: 1 } },
  club: { stack: 1, weight: 3, value: 8, weapon: { dmg: CFG.combat.club, range: 1.1 }, uses: 40, breaksInto: { stone: 1 }, tray: 'tools' },
  stone_axe: { stack: 1, weight: 2, value: 10, tool: { chopMul: 2, fells: true }, uses: 15, breaksInto: { stick: 1 }, tray: 'tools' },
  pick: { stack: 1, weight: 3, value: 10, tool: { mineMul: 2 }, uses: 25, breaksInto: { stick: 1, stone: 1 }, tray: 'tools' },
  // flowers: decor now; crowns and courtship gifts arrive with culture (P8)
  flower: { stack: 10, weight: 0.1, decayDays: 2, value: 1 },
};

/** A Gift Tray slot: an item, or a sapling of a plant kind (Life tab, §P2.7). */
export type TrayEntry = ItemType | `sapling:${PlantKind}`;
export const SAPLING_VALUE = 4;
export type TrayTab = 'food' | 'materials' | 'tools' | 'life';
export const TRAY_TABS: readonly TrayTab[] = ['food', 'materials', 'tools', 'life'];
/** Divine mode: the Tools tab unlocks at god tier 2 (§18.5). */
export const TOOLS_TIER = 2;
export const GIFT_TRAY: Record<TrayTab, TrayEntry[]> = {
  food: ['apple', 'berry', 'mushroom', 'fish', 'apple_mash', 'stew'],
  materials: ['wood', 'stick', 'stone', 'flint', 'fiber', 'clay'],
  tools: ['spear', 'club', 'stone_axe', 'pick'],
  life: ['apple_core', 'sapling:apple_bush', 'sapling:berry_bush', 'sapling:tree', 'sapling:flower'],
};
export const saplingKind = (e: TrayEntry): PlantKind | null => (e.startsWith('sapling:') ? (e.slice(8) as PlantKind) : null);

export const itemDef = (t: ItemType): ItemDef => ITEM_DEFS[t] ?? { stack: 10, weight: 1, value: 1 };
export const isFood = (t: ItemType): boolean => (itemDef(t).nutrition ?? 0) > 0;
