/**
 * Recipe table (§11.1), content as config. `none` recipes are crafted by hand (Craft); `site` recipes become
 * building blueprints (hut P3, campfire P4.3, fence P4.6, P5.6–P5.7 stations); `upgrade` turns a building into another (stone hut P4.6).
 * Later phases append their rows. Recipes start unknown unless `known` (knowledge spreads in P5.5).
 */
import type { BuildingType, ItemType, RecipeId, SkillId } from '../shared/types';
import type { Goblin } from './state';

export interface RecipeDef {
  inputs: Partial<Record<ItemType, number>>;
  station: 'none' | 'site' | 'upgrade' | 'workbench' | 'kiln';
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
  // P7.2: a fishing rod; the kiln and what it fires (clay, with a wood for the fire)
  fishing_rod: { inputs: { stick: 2, fiber: 2 }, station: 'none', output: 'fishing_rod', known: false, phase: 7, ticks: 120 },
  kiln: { inputs: { clay: 6, stone: 4 }, station: 'site', building: 'kiln', known: false, phase: 7, skill: 'building', after: 'campfire' },
  bucket: { inputs: { clay: 2, wood: 1 }, station: 'kiln', output: 'bucket', known: false, phase: 7, ticks: 300, after: 'kiln' },
  // P7.3: a hearth against a home's wall (stew), the longhouse, a well, the nursery
  hearth: { inputs: { stone: 4, clay: 2 }, station: 'site', building: 'hearth', known: false, phase: 7, skill: 'building', after: 'campfire' },
  longhouse: { inputs: { wood: 20, stone: 8, rope: 4 }, station: 'site', building: 'longhouse', known: false, phase: 7, skill: 'building' },
  well: { inputs: { stone: 8, rope: 2, bucket: 1 }, station: 'site', building: 'well', known: false, phase: 7, skill: 'building' },
  nursery: { inputs: { wood: 6, fiber: 4 }, station: 'site', building: 'nursery', known: false, phase: 7, skill: 'building' },
  pot: { inputs: { clay: 2, wood: 1 }, station: 'kiln', output: 'pot', known: false, phase: 7, ticks: 300, after: 'kiln', near: ['apple'] },
  // P7.4: a fenced garden bed, a compost heap (once there is a garden), stone paths over the trails, bridge spans
  garden_plot: { inputs: { wood: 2 }, station: 'site', building: 'garden_plot', known: false, phase: 7, skill: 'farming', near: ['apple_core'] },
  compost_heap: { inputs: { wood: 3 }, station: 'site', building: 'compost_heap', known: false, phase: 7, skill: 'farming', near: ['apple_core'], after: 'garden_plot' },
  stone_path: { inputs: { stone: 1 }, station: 'site', known: false, phase: 7, skill: 'building' },
  bridge: { inputs: { wood: 4, rope: 1 }, station: 'site', building: 'bridge', known: false, phase: 7, skill: 'building' },
  // P7.5: a fur cloak sewn at the workbench, a bone necklace, war paint
  fur_cloak: { inputs: { pelt: 2, rope: 1 }, station: 'workbench', output: 'fur_cloak', known: false, phase: 7, ticks: 200, after: 'workbench' },
  bone_necklace: { inputs: { bone: 3, rope: 1 }, station: 'none', output: 'bone_necklace', known: false, phase: 7, ticks: 150 },
  war_paint: { inputs: { ash: 1, berry: 1 }, station: 'none', output: 'war_paint', known: false, phase: 7, ticks: 40 },
  // P7.1: a sling for hunting hoppers
  sling: { inputs: { fiber: 2, feather: 1 }, station: 'none', output: 'sling', known: false, phase: 7, ticks: 120 },
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
  // P8.5 (§11.1): a drum (a hollow log with a skin of woven fiber), a bone flute, and a ring of stones to play in
  drum: { inputs: { wood: 1, fiber: 1 }, station: 'none', output: 'drum', known: false, phase: 8, ticks: 150, skill: 'woodcraft', after: 'campfire' },
  flute: { inputs: { bone: 1 }, station: 'none', output: 'flute', known: false, phase: 8, ticks: 120 },
  music_circle: { inputs: { stone: 6 }, station: 'site', building: 'music_circle', known: false, phase: 8, skill: 'building', near: ['drum'] },
  // P8.6 (§11.1): a shrine of piled stones (its trinket is laid on by the first to pray there), a painted totem pole
  shrine: { inputs: { stone: 4 }, station: 'site', building: 'shrine', known: false, phase: 8, skill: 'building' },
  totem: { inputs: { wood: 3, war_paint: 1 }, station: 'site', building: 'totem', known: false, phase: 8, skill: 'woodcraft' },
  // P8.8 (§17.4): the temple (its two trinkets are laid in it, not hauled)
  temple: { inputs: { stone: 12, wood: 6 }, station: 'site', building: 'temple', known: false, phase: 8, skill: 'building' },
  // P9.5 (§15.2): a shelf for the books that keep what the village knows
  library_shelf: { inputs: { wood: 4 }, station: 'site', building: 'library_shelf', known: false, phase: 9, skill: 'woodcraft' },
};

export const recipeDef = (id: RecipeId): RecipeDef | undefined => RECIPES[id];
/** What every goblin knows from the start. */
export const STARTER_RECIPES: readonly RecipeId[] = Object.keys(RECIPES).filter((id) => RECIPES[id]!.known);
export const knows = (g: Goblin, id: RecipeId): boolean => g.knownRecipes.includes(id);
/** Recipes the Craft action makes: by hand anywhere, fired at a kiln (P7.2), or sewn at a workbench (P7.5). */
export const HAND_RECIPES: readonly RecipeId[] = Object.keys(RECIPES).filter((id) => ['none', 'kiln', 'workbench'].includes(RECIPES[id]!.station));
/** The hand recipe that makes `item`, if any. */
export const recipeFor = (item: ItemType): RecipeId | undefined => HAND_RECIPES.find((id) => RECIPES[id]!.output === item);
