import { CFG } from '../../config';
import { dist } from '../../../shared/math';
import { addItem, canCarry, foodStack } from '../../inventory';
import { needUrgency } from '../../goblin/needs';
import { moveAlong, planPath, faceToward } from '../../steering';
import { distanceFalloff } from '../considerations';
import { findFruitPlant } from '../targets';
import type { UtilityAction } from '../action';

/** Walk to a fruiting apple bush and pick apples into the inventory. */
export const HarvestFruit: UtilityAction = {
  id: 'harvest_fruit', tags: ['food', 'work'], minStage: 'youngling', interruptible: true,
  isAvailable: (g) => canCarry(g, 'apple') && g.needs.hunger < 90,
  score(g, w) {
    const p = findFruitPlant(g, w);
    if (!p) return 0;
    const carrying = foodStack(g) ? 0.35 : 1;
    return carrying * (0.05 + 1.05 * needUrgency(g.needs.hunger)) * distanceFalloff(dist(g.pos, p.pos), 40);
  },
  start(g, w) {
    const p = findFruitPlant(g, w);
    if (!p || !planPath(w, g, p.pos)) return false;
    g.activity.targetId = p.id;
    g.activity.stage = 0;
    return true;
  },
  step(g, w) {
    const a = g.activity;
    const p = w.s.plants.find((x) => x.id === a.targetId);
    if (!p || p.fruit <= 0) return 'failed';
    if (a.stage === 0) {
      if (dist(g.pos, p.pos) < 0.9) a.path = [];
      if (moveAlong(w, g) !== 'arrived') return 'running';
      a.stage = 1;
      a.progress = CFG.goblin.harvestTicks;
      faceToward(g, p.pos);
    }
    a.progress -= 1;
    if (a.progress > 0) return 'running';
    const want = 1 + (g.needs.hunger < 40 ? 1 : 0) + (g.personality.gluttony > 0.7 ? 1 : 0);
    const n = Math.min(want, p.fruit);
    const got = addItem(g, { type: 'apple', qty: n });
    p.fruit -= got;
    if (got <= 0) return 'failed';
    g.deeds.harvested += got;
    w.emit({ type: 'harvested', goblinId: g.id, plantId: p.id, item: 'apple', at: p.pos });
    return 'done';
  },
};
