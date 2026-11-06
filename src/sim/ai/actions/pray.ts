/**
 * `Pray` (§15.4, §17.4, P8.6): a pious or faithful goblin walks to the shrine, kneels before it a while and comes
 * away comforted (mood, a little faith); worry (a low mood, being frightened) sends it sooner, and so does a pious
 * chief (`policies.shrine`) or a belief that prayer brings luck. The first to pray at a bare shrine lays a trinket on
 * it. Prayers that ask for something, and are answered, come with the faith system (P8.8).
 */
import { CFG } from '../../config';
import { clamp, dist, q4 } from '../../../shared/math';
import { faceToward, moveAlong, planPath } from '../../steering';
import { addMood } from '../../goblin/mood';
import { festivalNow } from '../../festivals';
import { beliefMul } from '../../superstitions';
import { nearestShrine, offer } from '../../shrine';
import { ringSpot } from './festival';
import type { Goblin } from '../../state';
import type { UtilityAction } from '../action';
import { drift } from '../../goblin/drift';

const P = CFG.beliefs.pray, DAY = CFG.time.dayTicks, J = CFG.festivals.join;

const devout = (g: Goblin): boolean => g.personality.piety >= P.minPiety || g.godView.faith >= P.minFaith;
/** fed enough to spare the time (food comes first), watered and rested */
const fit = (g: Goblin): boolean => g.needs.hunger >= P.minFed && g.needs.thirst >= J.minNeed && g.needs.energy >= J.minEnergy;
/** 1 when at ease, up to 1 + `worry` when low or frightened. */
const worry = (g: Goblin): number => 1 + P.worry * Math.max(0, (50 - Math.min(g.mood.value, g.needs.safety)) / 50);

export const Pray: UtilityAction = {
  id: 'pray', tags: ['divine'], minStage: 'youngling', interruptible: (g) => g.activity.stage === 0, // a prayer once begun is finished
  isAvailable: (g, w) => devout(g) && fit(g) && !festivalNow(w) && !g.mood.modifiers.some((m) => m.id === 'prayed') && !!nearestShrine(w, g.pos, P.range),
  score: (g, w) => q4(P.score * (0.4 + g.personality.piety) * (0.5 + g.godView.faith / 100) * worry(g) * beliefMul(w, g, 'prayer')
    * (w.s.village.policies?.shrine ? P.policyMul : 1)),
  start(g, w) {
    const b = nearestShrine(w, g.pos, P.range)!, a = g.activity;
    a.targetId = b.id;
    a.target = ringSpot(w, b.pos, g.id, [1.1, 1.7]);
    return dist(g.pos, a.target) < 0.5 || planPath(w, g, a.target);
  },
  step(g, w) {
    const a = g.activity, b = w.s.buildings.find((x) => x.id === a.targetId);
    if (!b) return 'failed';
    if (a.stage === 0) {
      if (moveAlong(w, g) !== 'arrived') return 'running';
      a.stage = 1;
      a.progress = P.ticks;
      faceToward(g, b.pos);
      w.emit({ type: 'emote', goblinId: g.id, emote: 'pray' });
    }
    g.velocity = { x: 0, y: 0 };
    if (--a.progress > 0) return 'running';
    addMood(w, g, 'prayed', P.mood, P.gapDays * DAY);
    g.deeds.prayers = (g.deeds.prayers ?? 0) + 1; // P8.7: toward "the Devout"
    drift(g, 'prayed');
    g.godView.faith = q4(clamp(g.godView.faith + P.faith, 0, 100)); // (not via god/faith: that module needs the AI loaded first)
    offer(w, g, b);
    return 'done';
  },
};
