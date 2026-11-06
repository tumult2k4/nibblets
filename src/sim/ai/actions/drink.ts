import { CFG } from '../../config';
import { dist, q4 } from '../../../shared/math';
import { needUrgency } from '../../goblin/needs';
import { moveAlong, planPath, faceToward } from '../../steering';
import { distanceFalloff } from '../considerations';
import { waterTargets } from '../targets';
import { atWell } from '../../settlement';
import type { UtilityAction } from '../action';

/** Walk to the nearest shore and drink. */
export const Drink: UtilityAction = {
  id: 'drink', tags: ['food'], minStage: 'hatchling', interruptible: true,
  isAvailable: (g) => g.needs.thirst < 90,
  cap: (g) => 1.25 * (0.05 + 1.15 * needUrgency(g.needs.thirst)),
  score(g, w) {
    const s = waterTargets(g, 1, w)[0];
    if (!s) return 0;
    // parched, the walk no longer matters: up from sleep and off to the water (P7.2 balance: hatchlings in a hut far
    // from water slept on until they died of thirst)
    const far = g.needs.thirst < CFG.goblin.lowNeed ? 1.25 : distanceFalloff(dist(g.pos, s), 50);
    return (0.05 + 1.15 * needUrgency(g.needs.thirst)) * far;
  },
  start(g, w) {
    for (const s of waterTargets(g, 4, w)) {
      if (planPath(w, g, s)) {
        g.activity.target = s;
        g.activity.stage = 0;
        return true;
      }
    }
    return false;
  },
  step(g, w) {
    const a = g.activity;
    if (a.stage === 0) {
      if (moveAlong(w, g) !== 'arrived') return 'running';
      a.stage = 1;
      a.progress = CFG.goblin.drinkTicks;
      // face the water (or the well)
      const t = a.target!;
      const well = atWell(w.s, t);
      if (well) faceToward(g, { x: well.pos.x + 0.5, y: well.pos.y + 0.5 });
      else {
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]] as const) {
          const tile = w.s.tiles[Math.floor(t.y + dy) * w.s.size.w + Math.floor(t.x + dx)];
          if (tile?.biome === 'water') { faceToward(g, { x: t.x + dx, y: t.y + dy }); break; }
        }
      }
    }
    a.progress -= 1;
    if (a.progress > 0) return 'running';
    g.needs.thirst = q4(Math.min(100, g.needs.thirst + CFG.goblin.drinkAmount));
    g.deeds.drank += 1;
    w.emit({ type: 'item_drunk', goblinId: g.id, at: g.pos });
    return 'done';
  },
};
