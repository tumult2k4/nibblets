/**
 * The workbench (§11.1, §11.3, P5.7): crafting at a bench goes half again as fast, and a worn tool or weapon (half its
 * uses or less) can be mended there, good as new, with half its recipe's inputs (each halved and rounded down; at
 * least one piece of the first). Only a goblin who knows the recipe can mend the thing.
 */
import { CFG } from './config';
import { dist } from '../shared/math';
import { isComplete } from './buildings';
import { countItem, removeItems } from './inventory';
import { RECIPES, knows, recipeFor } from './recipes';
import { gear, isTool, maxUses, usesLeft } from './tools';
import { gainXp } from './goblin/skills';
import type { ItemStack, ItemType, RecipeId } from '../shared/types';
import type { Building, Goblin, WorldState } from './state';
import type { World } from './world';

const WB = CFG.workbench;

export const benches = (s: WorldState): Building[] => s.buildings.filter((b) => b.type === 'workbench' && isComplete(b));

/** The nearest finished bench within reach of `g` (`range` tiles), if any. */
export function benchFor(g: Goblin, w: World): Building | null {
  let best: Building | null = null, bd: number = WB.range;
  for (const b of benches(w.s)) {
    const d = dist(b.pos, g.pos);
    if (d < bd) { bd = d; best = b; }
  }
  return best;
}

/** Standing at a bench? */
export const atBench = (g: Goblin, w: World): boolean => benches(w.s).some((b) => dist(b.pos, g.pos) < 1.6);

/** Half the inputs of recipe `id`, rounded down, never nothing. */
export function mendInputs(id: RecipeId): ItemStack[] {
  const all = Object.entries(RECIPES[id]?.inputs ?? {}) as [ItemType, number][];
  const half = all.map(([type, n]) => ({ type, qty: Math.floor(n / 2) })).filter((s) => s.qty > 0);
  return half.length || !all[0] ? half : [{ type: all[0][0], qty: 1 }];
}

/** The pack's shortfall against `inputs`. */
export function shortOf(g: Goblin, inputs: ItemStack[]): ItemStack[] {
  return inputs.map((s) => ({ type: s.type, qty: s.qty - countItem(g, s.type) })).filter((s) => s.qty > 0);
}

/** The most worn piece of gear `g` could mend (knows the recipe), with how badly it wants to (0..mendWant). */
export function wornGear(g: Goblin): { stack: ItemStack; id: RecipeId; value: number } | null {
  let best: { stack: ItemStack; id: RecipeId; value: number } | null = null;
  for (const s of gear(g)) {
    if (!isTool(s.type)) continue;
    const id = recipeFor(s.type), frac = usesLeft(s) / Math.max(1, maxUses(s.type, s.fine));
    if (!id || !knows(g, id) || frac > WB.mendBelow) continue;
    const value = WB.mendWant * (1 - frac);
    if (value > (best?.value ?? 0)) best = { stack: s, id, value };
  }
  return best;
}

/** Mend the most worn `type` the goblin carries with half the inputs from its pack. False if it lacks them. */
export function mend(w: World, g: Goblin, type: ItemType, id: RecipeId): boolean {
  const inputs = mendInputs(id);
  const s = gear(g).filter((x) => x.type === type).sort((a, b) => usesLeft(a) - usesLeft(b))[0];
  if (!s || shortOf(g, inputs).length) return false;
  for (const m of inputs) removeItems(g, m.type, m.qty);
  delete s.dur;
  gainXp(w, g, RECIPES[id]?.skill ?? 'crafting', ((RECIPES[id]?.ticks ?? 120) / 2) * CFG.skills.xp.craftPerTick);
  w.emit({ type: 'tool_mended', goblinId: g.id, item: type, at: { x: g.pos.x, y: g.pos.y } });
  return true;
}
