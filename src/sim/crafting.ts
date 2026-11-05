/**
 * Crafting (§11.1, P4.2): which hand recipe a goblin wants, where its inputs come from (its own pack first, then the
 * stockpile's spare — whatever no blueprint is waiting for), exact consumption, skill growth and the quality roll.
 */
import { workMul } from './combat';
import { CFG } from './config';
import { q4 } from '../shared/math';
import { ITEM_DEFS, itemDef } from './items';
import { addItem, countItem, removeItems } from './inventory';
import { stockCount } from './stockpile';
import { missingMaterials } from './buildings';
import { spawnGroundItem } from './groundItems';
import { HAND_RECIPES, RECIPES, knows } from './recipes';
import { bestWeapon, gear, weaponDmg } from './tools';
import { materialWanted, stoneWanted, woodWanted } from './ai/wants';
import { bodyWarmth, hasItem, wearValue } from './clothing';
import type { ItemStack, ItemType, RecipeId } from '../shared/types';
import type { Goblin } from './state';
import type { World } from './world';
import { gainXp, skillLevel } from './goblin/skills';
import { observe } from './knowledge';
import { isInspired } from './goblin/mood';
import type { SkillId } from '../shared/types';

const C = CFG.crafting;
const FB = CFG.fiber;
/** Clothes matter more as the year cools. */
const coldMul = (season: string): number => (season === 'winter' ? FB.coldWantMul : season === 'autumn' ? (1 + FB.coldWantMul) / 2 : 1);
/** The strongest weapon there is: wants scale with how much a new weapon would add. */
const MAX_DMG = Math.max(...Object.values(ITEM_DEFS).map((d) => d.weapon?.dmg ?? 0));

/** Stock a crafter may take: what no blueprint is waiting for. */
export function spareStock(w: World, item: ItemType): number {
  let reserved = 0;
  for (const b of w.s.buildings) for (const m of missingMaterials(b)) if (m.type === item) reserved += m.qty;
  return Math.max(0, stockCount(w.s, item) - reserved);
}

/** Inputs of recipe `id` still missing from the goblin's pack. */
export function missingInputs(g: Goblin, id: RecipeId): ItemStack[] {
  const out: ItemStack[] = [];
  for (const [t, n] of Object.entries(RECIPES[id]?.inputs ?? {})) {
    const k = n - countItem(g, t as ItemType);
    if (k > 0) out.push({ type: t as ItemType, qty: k });
  }
  return out;
}

/** Can the goblin gather every input from its pack plus the spare stock? */
export const canSupply = (g: Goblin, w: World, id: RecipeId): boolean => missingInputs(g, id).every((m) => spareStock(w, m.type) >= m.qty);

/** 0..1: how much this goblin would like one more `item` (weapons: a better one than it has; tools: one per job). */
export function craftWant(g: Goblin, w: World, item: ItemType): number {
  const d = itemDef(item);
  if (d.weapon) {
    const cur = weaponDmg(bestWeapon(g));
    if (d.weapon.dmg <= cur) return 0;
    return (C.weaponWant + C.braveryWant * g.personality.bravery) * ((d.weapon.dmg - cur) / MAX_DMG);
  }
  if (d.tool) {
    if (gear(g).some((s) => s.type === item)) return 0;
    if (d.tool.mineMul) return C.toolWant * stoneWanted(g, w);
    if (d.tool.chopMul) return C.toolWant * woodWanted(g, w);
  }
  // P5.6 fiber goods: warmer clothes than it has, a crown for an empty head, one basket and one mat each, rope for the store
  if (d.wear?.slot === 'body') {
    const gain = wearValue(item) - bodyWarmth(g);
    return gain > 0 ? FB.clothesWant * Math.min(1, gain / 4) * coldMul(w.clock.season) : 0;
  }
  if (d.wear?.slot === 'head') return g.equipped.head || hasItem(g, item) ? 0 : FB.crownWant * (0.5 + g.personality.sociability);
  if (d.bag) return hasItem(g, item) ? 0 : FB.basketWant;
  if (d.bedroll) return hasItem(g, item) ? 0 : FB.matWant * (g.homeId === null ? 1 : 0.2);
  if (item === 'rope') return FB.ropeWant * materialWanted(g, w, 'rope', FB.ropeTarget);
  return 0;
}

/** The most wanted hand recipe the goblin knows and can supply. */
export function chooseCraft(g: Goblin, w: World): { id: RecipeId; value: number } | null {
  let best: { id: RecipeId; value: number } | null = null;
  for (const id of HAND_RECIPES) {
    const out = RECIPES[id]!.output;
    if (!out || !ITEM_DEFS[out] || !knows(g, id)) continue;
    const value = craftWant(g, w, out);
    if (value <= (best?.value ?? 0) || !canSupply(g, w, id)) continue;
    best = { id, value };
  }
  return best;
}

/** The skill a recipe trains and draws on: woodcraft for wooden things, cooking for food, else crafting. */
export const recipeSkill = (id: RecipeId): SkillId => RECIPES[id]?.skill ?? 'crafting';

/** Work ticks for recipe `id`, shortened by its skill (+15 % speed per level). */
export const craftTicks = (g: Goblin, id: RecipeId): number =>
  Math.round((RECIPES[id]?.ticks ?? 120) / ((1 + skillLevel(g, recipeSkill(id)) * C.skillBonus) * workMul(g)));

/** Use up exactly the inputs and make the item: fine with 25 % from skill level 4. Null if inputs are missing. */
export function finishCraft(w: World, g: Goblin, id: RecipeId): ItemStack | null {
  const r = RECIPES[id];
  if (!r?.output || missingInputs(g, id).length) return null;
  for (const [t, n] of Object.entries(r.inputs)) removeItems(g, t as ItemType, n);
  const sk = recipeSkill(id);
  // Inspiration (P5.9) makes the next piece fine, and is spent on it
  const inspired = isInspired(g, w);
  if (inspired) g.mood.modifiers = g.mood.modifiers.filter((m) => m.id !== 'inspired');
  const fine = inspired || (skillLevel(g, sk) >= C.fineLevel && w.rng.chance(C.fineChance));
  const out: ItemStack = fine ? { type: r.output, qty: 1, fine: true } : { type: r.output, qty: 1 };
  gainXp(w, g, sk, (r.ticks ?? 120) * CFG.skills.xp.craftPerTick);
  if (addItem(g, out) < 1) spawnGroundItem(w, out, { x: q4(g.pos.x + 0.3), y: g.pos.y });
  w.emit({ type: 'item_crafted', goblinId: g.id, recipe: id, item: r.output, fine, at: { x: g.pos.x, y: g.pos.y } });
  observe(w, id, g.pos, g);
  return out;
}
