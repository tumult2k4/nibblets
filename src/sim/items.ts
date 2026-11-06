import type { ItemType, PlantKind } from '../shared/types';
import { CFG } from './config';

export interface ItemDef {
  stack: number; weight: number; nutrition?: number; value: number;
  /** days a dropped one lies on the ground before it is gone */
  decayDays?: number;
  /** P5.6 spoilage: mean days a stored or carried one keeps (stockpile, pantry, pack); a storage pit doubles it */
  shelfDays?: number;
  tool?: { chopMul?: number; mineMul?: number; fishMul?: number; fells?: boolean };
  /** tools & weapons: durability in uses (§11.3) and what a broken one leaves behind */
  uses?: number;
  breaksInto?: Partial<Record<ItemType, number>>;
  weapon?: { dmg: number; range: number };
  /** a hunting tool (P7.1 sling): damage and range of a throw at a critter; it is no weapon in a fight */
  hunt?: { dmg: number; range: number };
  /** clothing (P5.6): worn on the body or head; warmth °C, courtship charm, wet penalty × wetMul */
  wear?: { slot: 'body' | 'head'; warmth?: number; armor?: number; charm?: number; wetMul?: number };
  /** a basket: extra pack slots while carried (P5.6) */
  bag?: number;
  /** a sleeping mat: sleeping out on it rests like a mat, not bare ground (P5.6) */
  bedroll?: boolean;
  burnable?: boolean;
  /** hp lost when eaten (P5.5 redcap) */
  poison?: number;
  /** shown in the Gift Tray (§18.5); cost = value */
  tray?: 'food' | 'materials' | 'tools' | 'treasures' | 'life';
}

const F = CFG.food;
/** Content table — counts as config (§0.1 rule 7). Later phases fill in the rest. */
export const ITEM_DEFS: Partial<Record<ItemType, ItemDef>> = {
  apple: { stack: 10, weight: 1, nutrition: F.apple, decayDays: 6, shelfDays: 4, value: 2, tray: 'food' },
  apple_core: { stack: 10, weight: 0.5, nutrition: F.apple_core, decayDays: 4, shelfDays: 12, value: 1, tray: 'life' },
  // P5.6 preserves: mash from the grinding stone keeps 12 days, dried apples from the rack 30
  apple_mash: { stack: 10, weight: 1, nutrition: F.apple_mash, decayDays: 3, shelfDays: 12, value: 3, tray: 'food' },
  dried_apple: { stack: 20, weight: 0.3, nutrition: F.dried_apple, decayDays: 10, shelfDays: 30, value: 2, tray: 'food' },
  berry: { stack: 20, weight: 0.3, nutrition: F.berry, decayDays: 3, shelfDays: 3, value: 1, tray: 'food' },
  mushroom: { stack: 10, weight: 0.5, nutrition: F.mushroom, decayDays: 4, shelfDays: 4, value: 1, tray: 'food' },
  glowcap: { stack: 10, weight: 0.3, nutrition: F.glowcap, decayDays: 6, shelfDays: 6, value: 2 },
  // P5.5: looks like a meal to anyone who doesn't know better (`redcap_is_poison`)
  redcap: { stack: 10, weight: 0.4, nutrition: F.redcap, decayDays: 4, shelfDays: 4, value: 0, poison: CFG.knowledge.redcapDmg },
  fish: { stack: 5, weight: 1, nutrition: F.fish, decayDays: 2, shelfDays: 1, value: 3, tray: 'food' },
  stew: { stack: 3, weight: 1.5, nutrition: F.stew, decayDays: 2, shelfDays: 2, value: 6, tray: 'food' },
  // P7.1: a hopper brought down; raw meat keeps a day and a half (cooked from P7.2)
  meat: { stack: 5, weight: 0.8, nutrition: F.meat, decayDays: 2, shelfDays: 1.5, value: 3, tray: 'food' },
  cooked_meat: { stack: 5, weight: 0.7, nutrition: F.cooked_meat, decayDays: 3, shelfDays: 3, value: 4, tray: 'food' },
  wood: { stack: 10, weight: 2, value: 3, burnable: true, tray: 'materials' },
  stick: { stack: 20, weight: 0.5, value: 1, burnable: true, tray: 'materials' },
  // leaves fall when bushes and trees are chopped (P5.6); they wilt, but slowly
  leaves: { stack: 20, weight: 0.1, decayDays: 3, shelfDays: 8, value: 1, burnable: true },
  stone: { stack: 10, weight: 3, value: 3, tray: 'materials' },
  flint: { stack: 10, weight: 1, value: 5, tray: 'materials' },
  fiber: { stack: 20, weight: 0.3, value: 2, burnable: true, tray: 'materials' },
  clay: { stack: 10, weight: 2, value: 2, tray: 'materials' },
  rope: { stack: 10, weight: 0.5, value: 4, burnable: true, tray: 'materials' },
  // P7.1 wildlife drops: bones and pelts from hoppers, feathers from chirps (a flushed chirp, a moult, a sling)
  bone: { stack: 10, weight: 0.3, value: 2, tray: 'materials' },
  feather: { stack: 20, weight: 0.05, value: 2, decayDays: 6, burnable: true },
  pelt: { stack: 5, weight: 0.6, value: 5, decayDays: 10, burnable: true },
  // tools & weapons (§11.1/§11.3): one per slot; a use = one finished job (tree felled, stone mined) or one hit
  spear: { stack: 1, weight: 2, value: 6, weapon: { dmg: CFG.combat.spear, range: 1.5 }, uses: 25, breaksInto: { stick: 1 }, tray: 'tools' },
  stone_spear: { stack: 1, weight: 2, value: 10, weapon: { dmg: CFG.combat.stone_spear, range: 1.5 }, uses: 35, breaksInto: { stick: 1 } },
  sling: { stack: 1, weight: 0.3, value: 6, hunt: { dmg: CFG.wildlife.huntDmg, range: CFG.wildlife.hunt.range }, uses: 30, breaksInto: { fiber: 1 }, burnable: true, tray: 'tools' },
  club: { stack: 1, weight: 3, value: 8, weapon: { dmg: CFG.combat.club, range: 1.1 }, uses: 40, breaksInto: { stone: 1 }, tray: 'tools' },
  stone_axe: { stack: 1, weight: 2, value: 10, tool: { chopMul: 2, fells: true }, uses: 15, breaksInto: { stick: 1 }, tray: 'tools' },
  // a torch burns one use per in-game hour of night in the hand and leaves nothing behind
  torch: { stack: 1, weight: 0.5, value: 3, uses: 8, burnable: true, tray: 'tools' },
  pick: { stack: 1, weight: 3, value: 10, tool: { mineMul: 2 }, uses: 25, breaksInto: { stick: 1, stone: 1 }, tray: 'tools' },
  // P5.6 fiber goods: a basket carries 4 more, a mat makes sleeping out restful, clothes keep warm
  basket: { stack: 1, weight: 0.5, value: 5, bag: 4, burnable: true, tray: 'tools' },
  sleeping_mat: { stack: 1, weight: 1, value: 5, bedroll: true, burnable: true },
  loincloth: { stack: 1, weight: 0.3, value: 4, wear: { slot: 'body', warmth: 2 }, burnable: true },
  leaf_cape: { stack: 1, weight: 0.4, value: 6, wear: { slot: 'body', warmth: 4, wetMul: 0.5 }, burnable: true },
  flower_crown: { stack: 1, weight: 0.1, value: 4, wear: { slot: 'head', charm: CFG.fiber.crownCharm } },
  // flowers: for crowns (P5.6) and courtship gifts
  flower: { stack: 10, weight: 0.1, decayDays: 2, shelfDays: 3, value: 1 },
  // P6.3: where a star fell; whoever picks it up keeps it as a legendary trinket
  star_stone: { stack: 1, weight: 0.2, value: 40 },
  // P6.5: a dose speeds an illness on its way (remedy.ts); it goes stale slowly
  herbal_remedy: { stack: 5, weight: 0.2, value: 6, decayDays: 6, shelfDays: 24 },
};

/** A Gift Tray slot: an item, or a sapling of a plant kind (Life tab, §P2.7). */
export type TrayEntry = ItemType | `sapling:${PlantKind}`;
export const SAPLING_VALUE = 4;
export type TrayTab = 'food' | 'materials' | 'tools' | 'life';
export const TRAY_TABS: readonly TrayTab[] = ['food', 'materials', 'tools', 'life'];
/** Divine mode: the Tools tab unlocks at god tier 2 (§18.5). */
export const TOOLS_TIER = 2;
export const GIFT_TRAY: Record<TrayTab, TrayEntry[]> = {
  food: ['apple', 'berry', 'mushroom', 'fish', 'apple_mash', 'dried_apple', 'stew'],
  materials: ['wood', 'stick', 'stone', 'flint', 'fiber', 'rope', 'clay'],
  tools: ['spear', 'club', 'stone_axe', 'pick', 'torch', 'basket'],
  life: ['apple_core', 'sapling:apple_bush', 'sapling:berry_bush', 'sapling:tree', 'sapling:flower'],
};
export const saplingKind = (e: TrayEntry): PlantKind | null => (e.startsWith('sapling:') ? (e.slice(8) as PlantKind) : null);

export const itemDef = (t: ItemType): ItemDef => ITEM_DEFS[t] ?? { stack: 10, weight: 1, value: 1 };
export const isFood = (t: ItemType): boolean => (itemDef(t).nutrition ?? 0) > 0;
/** Kept by whoever carries it, never stored: tools and weapons, clothes, baskets and mats. */
export function isGear(t: ItemType): boolean {
  const d = itemDef(t);
  return (d.uses ?? 0) > 0 || !!d.wear || !!d.bag || !!d.bedroll;
}
