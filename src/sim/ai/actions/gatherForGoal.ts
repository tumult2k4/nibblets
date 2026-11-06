import { CFG } from '../../config';
import { addItem, countItem } from '../../inventory';
import { moveAlong, planPath } from '../../steering';
import { deposit, stockCount, withdraw } from '../../stockpile';
import { storePos } from '../../commons';
import type { Goblin } from '../../state';
import type { UtilityAction } from '../action';
import type { Goal } from '../planner';

/** The goblin's current `obtain` subgoal, if it is on top of the stack. */
function obtainGoal(g: Goblin): Extract<Goal, { kind: 'obtain' }> | null {
  const top = g.goalStack[g.goalStack.length - 1]?.goal;
  return top?.kind === 'obtain' ? top : null;
}

/**
 * §7.4 GatherForGoal: fetch the items an `obtain` subgoal asks for from the village stockpile. (Chopping,
 * picking up and exploring for them are ordinary actions the planner focuses instead.)
 */
export const GatherForGoal: UtilityAction = {
  id: 'gather_for_goal', tags: ['work'], minStage: 'adult', interruptible: true,
  isAvailable: (g, w) => {
    const goal = obtainGoal(g);
    return !!goal && countItem(g, goal.item) < goal.qty && stockCount(w.s, goal.item) > 0;
  },
  score: () => 0.3,
  start: (g, w) => planPath(w, g, storePos(w.s, obtainGoal(g)?.item ?? 'wood')),
  step(g, w) {
    const a = g.activity;
    if (a.stage === 0) {
      if (moveAlong(w, g) !== 'arrived') return 'running';
      a.stage = 1;
      a.progress = CFG.goblin.pickupTicks;
    }
    if (--a.progress > 0) return 'running';
    const goal = obtainGoal(g);
    if (!goal) return 'failed';
    const n = withdraw(w.s, goal.item, goal.qty - countItem(g, goal.item));
    const got = addItem(g, { type: goal.item, qty: n });
    if (got < n) deposit(w.s, { type: goal.item, qty: n - got });
    if (got > 0) w.emit({ type: 'item_taken', goblinId: g.id, item: goal.item, qty: got });
    return got > 0 ? 'done' : 'failed';
  },
};
