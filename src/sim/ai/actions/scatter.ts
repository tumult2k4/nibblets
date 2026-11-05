/**
 * `scatter` (P4.8): forced when a goblin stands in a Swarm or in the dread after a lightning strike or meteor. It
 * sprints straight out of the zone, arms flailing, and then gets on with its day.
 */
import { CFG } from '../../config';
import { moveAlong, planPath } from '../../steering';
import { exitPoint, zoneAt } from '../../god/zones';
import type { UtilityAction } from '../action';

export const Scatter: UtilityAction = {
  id: 'scatter', tags: ['danger'], minStage: 'hatchling', interruptible: false, forced: true,
  isAvailable: () => false,
  score: () => 0,
  start(g, w) {
    const z = zoneAt(w, g.pos);
    const to = z ? exitPoint(w, g, z) : null;
    if (!to) return false;
    w.emit({ type: 'emote', goblinId: g.id, emote: 'exclaim' });
    return planPath(w, g, to);
  },
  step(g, w) {
    if (moveAlong(w, g, CFG.powers.scatterMul) === 'arrived') return zoneAt(w, g.pos) ? 'failed' : 'done';
    return 'running';
  },
};
