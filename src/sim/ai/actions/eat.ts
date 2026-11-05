import { CFG } from '../../config';
import { q4 } from '../../../shared/math';
import { itemDef } from '../../items';
import { foodStack, takeOne } from '../../inventory';
import { needUrgency } from '../../goblin/needs';
import { addMood } from '../../goblin/mood';
import type { UtilityAction } from '../action';

/** Eat the best food item from the inventory. */
export const Eat: UtilityAction = {
  id: 'eat', tags: ['food'], minStage: 'hatchling', interruptible: false,
  isAvailable: (g) => !!foodStack(g) && g.needs.hunger < 85,
  score: (g) => Math.min(1.2, 0.1 + 1.15 * needUrgency(g.needs.hunger)),
  start(g) {
    g.activity.progress = CFG.goblin.eatTicks;
    g.velocity = { x: 0, y: 0 };
    return true;
  },
  step(g, w) {
    g.activity.progress -= 1;
    if (g.activity.progress > 0) return 'running';
    const st = foodStack(g);
    if (!st) return 'failed';
    const one = takeOne(g, (s) => s === st)!;
    const nut = (itemDef(one.type).nutrition ?? 0) * (g.lifeStage === 'hatchling' ? 0.5 : 1);
    g.needs.hunger = q4(Math.min(100, g.needs.hunger + nut));
    g.deeds.eaten += 1;
    w.s.stats.eaten += 1;
    if (one.divine) w.s.stats.divineFood += 1;
    if (one.divine) addMood(w, g, 'sky_food', 3, 1800);
    w.emit({ type: 'item_eaten', goblinId: g.id, item: one.type, at: g.pos, ...(one.divine ? { divine: true } : {}) });
    return 'done';
  },
};
