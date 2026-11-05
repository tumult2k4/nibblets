import { CFG } from '../../config';
import { dist } from '../../../shared/math';
import { addItem, canCarry, foodStack } from '../../inventory';
import { isFood } from '../../items';
import { needUrgency } from '../../goblin/needs';
import { moveAlong, planPath } from '../../steering';
import { findGroundItem } from '../targets';
import type { UtilityAction } from '../action';
import type { Goblin, GroundItem } from '../../state';
import type { World } from '../../world';

const wantItem = (g: Goblin) => (it: GroundItem) =>
  canCarry(g, it.stack.type) && (it.stack.type === 'apple_core' ? g.needs.hunger < 30 : isFood(it.stack.type) ? g.needs.hunger < 92 : true);

function target(g: Goblin, w: World): GroundItem | null {
  return findGroundItem(g, w, wantItem(g));
}

/** Pick up a ground item (god-dropped apples, later: dropped materials). */
export const PickUp: UtilityAction = {
  id: 'pick_up', tags: ['work'], minStage: 'youngling', interruptible: true,
  isAvailable: (g) => g.inventory.length > 0 || g.lifeStage !== 'hatchling',
  score(g, w) {
    const it = target(g, w);
    if (!it) return 0;
    const near = 1 - 0.6 * Math.min(1, dist(g.pos, it.pos) / 14);
    if (isFood(it.stack.type)) {
      const carrying = foodStack(g) ? 0.4 : 1;
      return carrying * (0.12 + 1.15 * needUrgency(g.needs.hunger)) * near * (it.stack.divine ? 1.1 : 1);
    }
    return 0.1 * near * (0.5 + g.personality.industry);
  },
  start(g, w) {
    const it = target(g, w);
    if (!it || !planPath(w, g, it.pos)) return false;
    it.reservedBy = g.id;
    g.activity.targetId = it.id;
    g.activity.stage = 0;
    return true;
  },
  step(g, w) {
    const a = g.activity;
    const it = w.s.groundItems.find((x) => x.id === a.targetId);
    if (!it || it.airborne || (it.reservedBy !== null && it.reservedBy !== g.id)) return 'failed';
    if (a.stage === 0) {
      if (moveAlong(w, g) !== 'arrived') return 'running';
      a.stage = 1;
      a.progress = CFG.goblin.pickupTicks;
    }
    a.progress -= 1;
    if (a.progress > 0) return 'running';
    const n = isFood(it.stack.type) ? Math.min(it.stack.qty, 3) : it.stack.qty;
    const got = addItem(g, { ...it.stack, qty: n });
    it.stack.qty -= got;
    it.reservedBy = null;
    if (it.stack.qty <= 0) w.s.groundItems.splice(w.s.groundItems.indexOf(it), 1);
    if (got <= 0) return 'failed';
    w.emit({ type: 'item_picked', goblinId: g.id, item: it.stack.type, at: g.pos });
    return 'done';
  },
};
