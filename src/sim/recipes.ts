/**
 * Recipe table (§11.1), content as config. `none` recipes are crafted by hand (Craft); `site` recipes become
 * building blueprints (hut P3, campfire P4.3, fence P4.6); `upgrade` turns a building into another (stone hut P4.6).
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
};

export const recipeDef = (id: RecipeId): RecipeDef | undefined => RECIPES[id];
/** What every goblin knows from the start. */
export const STARTER_RECIPES: readonly RecipeId[] = Object.keys(RECIPES).filter((id) => RECIPES[id]!.known);
export const knows = (g: Goblin, id: RecipeId): boolean => g.knownRecipes.includes(id);
/** Hand recipes (Craft), in table order. */
export const HAND_RECIPES: readonly RecipeId[] = Object.keys(RECIPES).filter((id) => RECIPES[id]!.station === 'none');
/** The hand recipe that makes `item`, if any. */
export const recipeFor = (item: ItemType): RecipeId | undefined => HAND_RECIPES.find((id) => RECIPES[id]!.output === item);
