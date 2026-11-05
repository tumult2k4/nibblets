import { CFG } from '../../config';
import { dist } from '../../../shared/math';
import { addItem, canCarry, foodStack } from '../../inventory';
import { isFood, isGear } from '../../items';
import { needUrgency } from '../../goblin/needs';
import { moveAlong, planPath } from '../../steering';
import { findGroundItem } from '../targets';
import type { UtilityAction } from '../action';
import { stickWanted, woodWanted } from '../wants';
import { gear } from '../../tools';
import type { Goblin, GroundItem } from '../../state';
import type { World } from '../../world';
import { giveTrinket } from '../../trinkets';

/** Food when hungry-ish, cores when starving, materials always, a tool only if it has none of that kind yet. */
const wantItem = (g: Goblin) => (it: GroundItem) => {
  const t = it.stack.type;
  if (t === 'star_stone') return true; // P6.3: everyone wants the star stone, and it goes in no bag
  if (!canCarry(g, t)) return false;
  if (isGear(t)) return g.lifeStage === 'adult' && !gear(g).some((s) => s.type === t) && g.equipped.body?.type !== t && g.equipped.head?.type !== t;
  return t === 'apple_core' ? g.needs.hunger < 30 : isFood(t) ? g.needs.hunger < 92 : true;
};

/** Food, gear, wood and sticks first; odds and ends (leaves, stone chips) only when nothing better lies about. */
const MAIN = (t: string): boolean => t === 'star_stone' || t === 'wood' || t === 'stick' || isFood(t as GroundItem['stack']['type']) || isGear(t as GroundItem['stack']['type']);
function target(g: Goblin, w: World): GroundItem | null {
  const want = wantItem(g);
  return findGroundItem(g, w, (it) => MAIN(it.stack.type) && want(it)) ?? findGroundItem(g, w, want);
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
    // materials: worth fetching while the village wants wood (chopping drops it on the ground)
    const t = it.stack.type;
    if (t === 'star_stone') return (0.55 + 0.3 * g.personality.wanderlust) * near;
    const want = isGear(t) ? 0.3 : t === 'wood' ? 0.12 + 0.3 * woodWanted(g, w) : t === 'stick' ? 0.1 + 0.3 * stickWanted(g, w) : 0.1;
    return want * near * (0.5 + g.personality.industry);
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
    if (it.stack.type === 'star_stone') { // kept, not carried: a legendary trinket
      w.s.groundItems.splice(w.s.groundItems.indexOf(it), 1);
      giveTrinket(w, g, 'legendary');
      return 'done';
    }
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
