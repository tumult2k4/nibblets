import { CFG } from '../../config';
import { visibleThreat } from './fight';
import { q4 } from '../../../shared/math';
import { perDay } from '../../time';
import { needUrgency } from '../../goblin/needs';
import { isNightNow } from '../considerations';
import type { UtilityAction } from '../action';
import type { Goblin } from '../../state';
import type { World } from '../../world';

/** How much a goblin wants to sleep now: night/dusk pull plus tiredness (hatchlings nap more). */
export function sleepScore(g: Goblin, w: World): number {
  const night = isNightNow(w) ? 0.62 : 0;
  const dusk = w.clock.phase === 'dusk' ? 0.25 : 0;
  const baby = g.lifeStage === 'hatchling' ? 0.2 : 0;
  return Math.min(1.1, Math.max(night, dusk) + 0.9 * needUrgency(g.needs.energy) + baby);
}

/** Lie down where you are and sleep. Stage 0 = lying down, 1 = asleep. */
export const SleepGround: UtilityAction = {
  id: 'sleep_ground', tags: ['rest'], minStage: 'hatchling', interruptible: true,
  // nobody lies down in the open with a predator in sight, or while too scared (P4.5)
  isAvailable: (g, w) => g.needs.energy < 97 && g.needs.safety >= CFG.safety.scaredBelow && !(w.s.enemies.length && visibleThreat(g, w)),
  score: (g, w) => sleepScore(g, w),
  start(g) {
    g.activity.stage = 0;
    g.activity.progress = 20;
    g.velocity = { x: 0, y: 0 };
    return true;
  },
  step(g, w) {
    const a = g.activity;
    if (a.stage === 0) {
      if (--a.progress > 0) return 'running';
      a.stage = 1;
      w.emit({ type: 'fell_asleep', goblinId: g.id, at: g.pos });
    }
    g.needs.energy = q4(Math.min(100, g.needs.energy + perDay(CFG.goblin.sleepRestorePerDay.ground)));
    if (g.needs.energy >= CFG.goblin.wakeEnergy && !isNightNow(w)) {
      w.emit({ type: 'woke_up', goblinId: g.id, at: g.pos });
      return 'done';
    }
    return 'running';
  },
};
