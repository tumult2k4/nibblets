import { q4 } from '../../../shared/math';
import { isFood, isGear, itemDef } from '../../items';
import { slotCount } from '../../inventory';
import { spawnGroundItem } from '../../groundItems';
import type { ItemStack } from '../../../shared/types';
import type { UtilityAction } from '../action';

/** Never the basket (dropping it would only lose room). */
const droppable = (s: ItemStack): boolean => !isFood(s.type) && !itemDef(s.type).bag;

/** Drop a non-food stack when the inventory is full (makes room for food); gear (tools, clothes, a mat) goes last. */
export const Drop: UtilityAction = {
  id: 'drop', tags: ['work'], minStage: 'youngling', interruptible: false,
  isAvailable: (g) => g.inventory.length >= slotCount(g) && g.inventory.some(droppable),
  score: (g) => (g.needs.hunger < 60 ? 0.45 : 0.06),
  start(g) {
    g.activity.progress = 6;
    return true;
  },
  step(g, w) {
    g.activity.progress -= 1;
    if (g.activity.progress > 0) return 'running';
    const j = g.inventory.findIndex((s) => droppable(s) && !isGear(s.type));
    const i = j >= 0 ? j : g.inventory.findIndex(droppable);
    if (i < 0) return 'failed';
    const [st] = g.inventory.splice(i, 1);
    spawnGroundItem(w, st!, { x: q4(g.pos.x + Math.cos(g.facing) * 0.4), y: q4(g.pos.y + Math.sin(g.facing) * 0.4) });
    return 'done';
  },
};
