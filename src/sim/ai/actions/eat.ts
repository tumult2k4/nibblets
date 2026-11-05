import { CFG } from '../../config';
import { q4 } from '../../../shared/math';
import { itemDef } from '../../items';
import { addItem, countItem, foodStack, takeOne } from '../../inventory';
import { needUrgency } from '../../goblin/needs';
import { addMood } from '../../goblin/mood';
import { spawnGroundItem } from '../../groundItems';
import type { ItemStack } from '../../../shared/types';
import type { Goblin } from '../../state';
import type { World } from '../../world';
import type { StepResult, UtilityAction } from '../action';

/** Shared eat timer + effect. Apples leave a core (§8.1) in the pocket, or at the feet if full. */
function eatStep(g: Goblin, w: World, pick: () => ItemStack | undefined): StepResult {
  g.activity.progress -= 1;
  if (g.activity.progress > 0) return 'running';
  const st = pick();
  if (!st) return 'failed';
  const one = takeOne(g, (s) => s === st)!;
  const nut = (itemDef(one.type).nutrition ?? 0) * (g.lifeStage === 'hatchling' ? 0.5 : 1);
  g.needs.hunger = q4(Math.min(100, g.needs.hunger + nut));
  g.deeds.eaten += 1;
  w.s.stats.eaten += 1;
  if (one.divine) w.s.stats.divineFood += 1;
  if (one.divine) addMood(w, g, 'sky_food', 3, 1800);
  w.emit({ type: 'item_eaten', goblinId: g.id, item: one.type, at: g.pos, ...(one.divine ? { divine: true } : {}) });
  if (one.type === 'apple') {
    // industrious goblins pocket the core for planting; the rest toss it (it rots in a few days)
    const keep = w.rng.chance(CFG.plants.keepCoreBase + CFG.plants.keepCorePerIndustry * g.personality.industry);
    if (!keep || addItem(g, { type: 'apple_core', qty: 1 }) === 0)
      spawnGroundItem(w, { type: 'apple_core', qty: 1 }, { x: g.pos.x, y: g.pos.y });
  }
  return 'done';
}

const begin = (g: Goblin): boolean => {
  g.activity.progress = CFG.goblin.eatTicks;
  g.velocity = { x: 0, y: 0 };
  return true;
};

/** Eat the best food item from the inventory (cores are kept for planting). */
export const Eat: UtilityAction = {
  id: 'eat', tags: ['food'], minStage: 'hatchling', interruptible: false,
  isAvailable: (g) => !!foodStack(g) && g.needs.hunger < 85,
  score: (g) => Math.min(1.2, 0.1 + 1.15 * needUrgency(g.needs.hunger)),
  start: begin,
  step: (g, w) => eatStep(g, w, () => foodStack(g)),
};

/** Nibble an apple core when properly hungry and nothing better is in the pocket (+10). */
export const EatCore: UtilityAction = {
  id: 'eat_core', tags: ['food'], minStage: 'hatchling', interruptible: false,
  isAvailable: (g) => countItem(g, 'apple_core') > 0 && g.needs.hunger < 35 && !foodStack(g),
  score: (g) => Math.min(1.1, 0.05 + 1.05 * needUrgency(g.needs.hunger)),
  start: begin,
  step: (g, w) => eatStep(g, w, () => g.inventory.find((s) => s.type === 'apple_core')),
};
