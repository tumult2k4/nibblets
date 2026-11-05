/**
 * Crafting (§11.1, P4.2): which hand recipe a goblin wants, where its inputs come from (its own pack first, then the
 * stockpile's spare — whatever no blueprint is waiting for), exact consumption, skill growth and the quality roll.
 */
import { CFG } from './config';
import { q4 } from '../shared/math';
import { ITEM_DEFS, itemDef } from './items';
import { addItem, countItem, removeItems } from './inventory';
import { stockCount } from './stockpile';
import { missingMaterials } from './buildings';
import { spawnGroundItem } from './groundItems';
import { HAND_RECIPES, RECIPES, knows } from './recipes';
import { bestWeapon, gear, weaponDmg } from './tools';
import { stoneWanted, woodWanted } from './ai/wants';
import type { ItemStack, ItemType, RecipeId } from '../shared/types';
import type { Goblin } from './state';
import type { World } from './world';

const C = CFG.crafting;
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

/** Work ticks for recipe `id`, shortened by crafting skill (+15 % speed per level). */
export const craftTicks = (g: Goblin, id: RecipeId): number =>
  Math.round((RECIPES[id]?.ticks ?? 120) / (1 + (g.skills.crafting ?? 0) * C.skillBonus));

/** Use up exactly the inputs and make the item: fine with 25 % from skill level 4. Null if inputs are missing. */
export function finishCraft(w: World, g: Goblin, id: RecipeId): ItemStack | null {
  const r = RECIPES[id];
  if (!r?.output || missingInputs(g, id).length) return null;
  for (const [t, n] of Object.entries(r.inputs)) removeItems(g, t as ItemType, n);
  const skill = g.skills.crafting ?? 0;
  const fine = skill >= C.fineLevel && w.rng.chance(C.fineChance);
  const out: ItemStack = fine ? { type: r.output, qty: 1, fine: true } : { type: r.output, qty: 1 };
  g.skills.crafting = q4(skill + C.skillPerCraft);
  if (addItem(g, out) < 1) spawnGroundItem(w, out, { x: q4(g.pos.x + 0.3), y: g.pos.y });
  w.emit({ type: 'item_crafted', goblinId: g.id, recipe: id, item: r.output, fine, at: { x: g.pos.x, y: g.pos.y } });
  return out;
}
