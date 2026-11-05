import { CFG } from '../../config';
import { faceToward } from '../../steering';
import type { UtilityAction } from '../action';

/** Look up at the sky after witnessing a divine act (§7.3, forced by the witness system). */
export const LookUp: UtilityAction = {
  id: 'look_up', tags: ['divine'], minStage: 'hatchling', interruptible: false, forced: true,
  isAvailable: () => false,
  score: () => 0,
  start(g) {
    g.activity.progress = CFG.god.lookUpTicks;
    g.velocity = { x: 0, y: 0 };
    return true;
  },
  step(g) {
    if (g.activity.target) faceToward(g, g.activity.target);
    g.activity.progress -= 1;
    return g.activity.progress <= 0 ? 'done' : 'running';
  },
};

/** Kick and flail while held by the god hand. Ends when released. */
export const Struggle: UtilityAction = {
  id: 'struggle', tags: ['divine'], minStage: 'hatchling', interruptible: false, forced: true,
  isAvailable: () => false,
  score: () => 0,
  start(g) {
    g.activity.progress = 0;
    return true;
  },
  step(g) {
    g.activity.progress += 1;
    return g.heldByGod || g.airborne ? 'running' : 'done';
  },
};
