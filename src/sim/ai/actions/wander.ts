import { CFG } from '../../config';
import { isWalkable } from '../../grid';
import { q4 } from '../../../shared/math';
import { moveAlong, planPath } from '../../steering';
import { needUrgency } from '../../goblin/needs';
import { addMood } from '../../goblin/mood';
import type { UtilityAction } from '../action';

/** Stroll somewhere nearby; restores curiosity. Biased back toward the village when far away. */
export const Wander: UtilityAction = {
  id: 'wander', tags: ['fun'], minStage: 'hatchling', interruptible: true,
  isAvailable: () => true,
  score: (g) => 0.12 + 0.55 * needUrgency(g.needs.curiosity),
  start(g, w) {
    const c = w.s.village.center;
    const R = CFG.goblin.wanderRadius * (0.6 + g.personality.wanderlust);
    for (let i = 0; i < 8; i++) {
      const far = Math.hypot(g.pos.x - c.x, g.pos.y - c.y) > CFG.world.villageRadius * 1.6;
      const base = far ? c : g.pos;
      const a = w.rng.range(0, Math.PI * 2);
      const r = w.rng.range(2, R);
      const to = { x: q4(base.x + Math.cos(a) * r), y: q4(base.y + Math.sin(a) * r) };
      if (!isWalkable(w.s, Math.floor(to.x), Math.floor(to.y))) continue;
      if (planPath(w, g, to)) {
        g.activity.target = to;
        return true;
      }
    }
    return false;
  },
  step(g, w) {
    g.needs.curiosity = Math.min(100, q4(g.needs.curiosity + CFG.goblin.curiosityWander / CFG.tickHz / 6));
    if (moveAlong(w, g, 0.75) === 'arrived') {
      if (g.needs.curiosity > 80) addMood(w, g, 'nice_walk', 2, 600);
      return 'done';
    }
    return 'running';
  },
};
