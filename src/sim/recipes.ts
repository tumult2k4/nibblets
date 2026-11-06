/**
 * Recipe table (§11.1), content as config. `none` recipes are crafted by hand (Craft); `site` recipes become
 * building blueprints (hut P3, campfire P4.3, fence P4.6, P5.6–P5.7 stations); `upgrade` turns a building into another (stone hut P4.6).
 * Later phases append their rows. Recipes start unknown unless `known` (knowledge spreads in P5.5).
 */
import type { BuildingType, ItemType, RecipeId, SkillId } from '../shared/types';
import type { Goblin } from './state';

export interface RecipeDef {
  inputs: Partial<Record<ItemType, number>>;
  station: 'none' | 'site' | 'upgrade' | 'workbench';
  /** hand-crafted result, or the building it plans */
  output?: ItemType;
  building?: BuildingType;
  known: boolean;
  phase: number;
  /** work ticks at skill 0 (hand recipes) */
  ticks?: number;
  /** the skill it trains and draws on (default crafting) */
  skill?: SkillId;
  /** discovery (P5.5/P5.6): what else must be within reach for the idea to come (apples for the drying rack) */
  near?: ItemType[];
  /** discovery (P5.7): the idea only comes once one of these stands (a gate needs a fence to be a gate in) */
  after?: BuildingType;
  /** discovery (P6.5): remembering where this input grows is enough to set a goblin thinking (a glowcap it saw glowing) */
  idea?: ItemType;
}

export const RECIPES: Record<RecipeId, RecipeDef> = {
  hut: { inputs: { wood: 6 }, station: 'site', building: 'hut', known: true, phase: 3 },
  campfire: { inputs: { wood: 2, stone: 1 }, station: 'site', building: 'campfire', known: true, phase: 4 },
  spear: { inputs: { wood: 2 }, station: 'none', output: 'spear', known: true, phase: 4, ticks: 120, skill: 'woodcraft' },
  stone_spear: { inputs: { wood: 1, stick: 1, flint: 1 }, station: 'none', output: 'stone_spear', known: false, phase: 4, ticks: 150 },
  club: { inputs: { wood: 1, stone: 1 }, station: 'none', output: 'club', known: false, phase: 4, ticks: 120 },
  stone_axe: { inputs: { stick: 1, flint: 1, rope: 1 }, station: 'none', output: 'stone_axe', known: false, phase: 4, ticks: 180 },
  pick: { inputs: { stick: 1, stone: 2, rope: 1 }, station: 'none', output: 'pick', known: false, phase: 4, ticks: 180 },
  fence: { inputs: { wood: 1 }, station: 'site', building: 'fence', known: true, phase: 4 },
  stone_hut: { inputs: { stone: 6 }, station: 'upgrade', building: 'stone_hut', known: false, phase: 4 },
  torch: { inputs: { stick: 1, fiber: 1 }, station: 'none', output: 'torch', known: false, phase: 4, ticks: 60 },
  // P5.6 fiber goods (§11.1): everyone grows up twisting rope and weaving baskets; the leaf cape is an idea to be had
  rope: { inputs: { fiber: 3 }, station: 'none', output: 'rope', known: true, phase: 5, ticks: 60 },
  basket: { inputs: { fiber: 3 }, station: 'none', output: 'basket', known: true, phase: 5, ticks: 90 },
  sleeping_mat: { inputs: { fiber: 4 }, station: 'none', output: 'sleeping_mat', known: true, phase: 5, ticks: 90 },
  loincloth: { inputs: { fiber: 2 }, station: 'none', output: 'loincloth', known: true, phase: 5, ticks: 60 },
  leaf_cape: { inputs: { fiber: 3, leaves: 2 }, station: 'none', output: 'leaf_cape', known: false, phase: 5, ticks: 120 },
  flower_crown: { inputs: { flower: 3 }, station: 'none', output: 'flower_crown', known: true, phase: 5, ticks: 40 },
  // P5.6 preservation (§11.2): found by someone handling the stuff with apples about
  grinding_stone: { inputs: { stone: 3 }, station: 'site', building: 'grinding_stone', known: false, phase: 5, near: ['apple'], skill: 'building' },
  drying_rack: { inputs: { wood: 3, rope: 2 }, station: 'site', building: 'drying_rack', known: false, phase: 5, near: ['apple'], skill: 'building' },
  storage_pit: { inputs: { stone: 2 }, station: 'site', building: 'storage_pit', known: false, phase: 5, near: ['apple'], skill: 'building' },
  // P5.7: a bench to work at, and the village's defences grow a gate and a lookout once there is a fence
  workbench: { inputs: { wood: 4, stone: 2 }, station: 'site', building: 'workbench', known: false, phase: 5, near: ['stick'], skill: 'building' },
  gate: { inputs: { wood: 2, rope: 1 }, station: 'site', building: 'gate', known: false, phase: 5, after: 'fence', skill: 'building' },
  watchtower: { inputs: { wood: 8, rope: 2 }, station: 'site', building: 'watchtower', known: false, phase: 5, after: 'fence', skill: 'building' },
  // P6.5 (§14.3): a paste of glowcap and berries; the idea comes sooner while anyone is ill
  herbal_remedy: { inputs: { glowcap: 1, berry: 2 }, station: 'none', output: 'herbal_remedy', known: false, phase: 6, ticks: 150, skill: 'cooking', idea: 'glowcap' },
};

export const recipeDef = (id: RecipeId): RecipeDef | undefined => RECIPES[id];
/** What every goblin knows from the start. */
export const STARTER_RECIPES: readonly RecipeId[] = Object.keys(RECIPES).filter((id) => RECIPES[id]!.known);
export const knows = (g: Goblin, id: RecipeId): boolean => g.knownRecipes.includes(id);
/** Hand recipes (Craft), in table order. */
export const HAND_RECIPES: readonly RecipeId[] = Object.keys(RECIPES).filter((id) => RECIPES[id]!.station === 'none');
/** The hand recipe that makes `item`, if any. */
export const recipeFor = (item: ItemType): RecipeId | undefined => HAND_RECIPES.find((id) => RECIPES[id]!.output === item);
