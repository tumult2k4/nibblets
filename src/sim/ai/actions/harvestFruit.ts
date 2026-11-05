import { CFG } from '../../config';
import { dist } from '../../../shared/math';
import { addItem, canCarry, foodStack } from '../../inventory';
import { needUrgency } from '../../goblin/needs';
import { confused, remember } from '../../goblin/memory';
import { moveAlong, planPath, faceToward } from '../../steering';
import { distanceFalloff, visionRadius } from '../considerations';
import { findFruitPlant } from '../targets';
import type { UtilityAction } from '../action';

/** Walk to a fruiting bush (seen or remembered) and pick fruit into the inventory. */
export const HarvestFruit: UtilityAction = {
  id: 'harvest_fruit', tags: ['food', 'work'], minStage: 'youngling', interruptible: true,
  isAvailable: (g) => (canCarry(g, 'apple') || canCarry(g, 'berry')) && g.needs.hunger < 90,
  score(g, w) {
    const p = findFruitPlant(g, w);
    if (!p) return 0;
    const carrying = foodStack(g) ? 0.35 : 1;
    return carrying * (0.05 + 1.05 * needUrgency(g.needs.hunger)) * distanceFalloff(dist(g.pos, p.pos), 40) * (p.remembered ? 0.9 : 1);
  },
  start(g, w) {
    const p = findFruitPlant(g, w);
    if (!p || !planPath(w, g, p.pos)) return false;
    g.activity.targetId = p.id;
    g.activity.target = p.pos;
    return true;
  },
  step(g, w) {
    const a = g.activity;
    const p = w.s.plants.find((x) => x.id === a.targetId);
    const gone = !p || p.fruit <= 0 || (p.stage !== 'mature' && p.stage !== 'old');
    if (gone) {
      // only noticed once it is in sight: then the memory was stale
      if (dist(g.pos, a.target!) < visionRadius(g, w) * 0.4) {
        confused(g, w, 'fruit_plant', a.targetId!);
        return 'failed';
      }
      if (a.stage === 0) {
        moveAlong(w, g);
        return 'running';
      }
      return 'failed';
    }
    if (a.stage === 0) {
      if (dist(g.pos, p.pos) < 0.9) a.path = [];
      if (moveAlong(w, g) !== 'arrived') return 'running';
      a.stage = 1;
      a.progress = CFG.goblin.harvestTicks;
      faceToward(g, p.pos);
    }
    a.progress -= 1;
    if (a.progress > 0) return 'running';
    const item = p.kind === 'berry_bush' ? 'berry' : 'apple';
    const want = (item === 'berry' ? 3 : 1) + (g.needs.hunger < 40 ? 1 : 0) + (g.personality.gluttony > 0.7 ? 1 : 0);
    const got = addItem(g, { type: item, qty: Math.min(want, p.fruit) });
    p.fruit -= got;
    remember(g, w, 'fruit_plant', p.pos, p.fruit, p.id);
    if (got <= 0) return 'failed';
    g.deeds.harvested += got;
    w.emit({ type: 'harvested', goblinId: g.id, plantId: p.id, item, at: p.pos });
    return 'done';
  },
};
