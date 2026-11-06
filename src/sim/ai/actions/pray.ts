/**
 * `Pray` (§15.4, §17.4, P8.6; P8.8): a pious or faithful goblin walks to the shrine or temple, kneels before it a
 * while and comes away comforted (mood, a little faith); worry (a low mood, being frightened) sends it sooner, and so
 * does a pious chief (`policies.shrine`) or a belief that prayer brings luck. The first to pray at a bare shrine lays
 * a trinket on it. P8.8: each prayer asks for something (god/prayers.ts) and stays open a day; it earns favor (more
 * near a consecrated temple, led by the shaman, or in thanks); the shaman's call brings the devout (×3); a goblin in
 * despair prays where it stands, shrine or no shrine; a goblin of little piety angry with the god does not pray.
 */
import { CFG } from '../../config';
import { clamp, dist, q4 } from '../../../shared/math';
import { faceToward, moveAlong, planPath } from '../../steering';
import { addMood } from '../../goblin/mood';
import { festivalNow } from '../../festivals';
import { beliefMul } from '../../superstitions';
import { nearestAltar, offer, templeNear } from '../../shrine';
import { ringSpot } from './festival';
import type { Goblin } from '../../state';
import type { World } from '../../world';
import type { UtilityAction } from '../action';
import { drift } from '../../goblin/drift';
import { desperate, offerPrayer, openPrayer } from '../../god/prayers';
import { prayerFavor } from '../../god/favor';

const P = CFG.beliefs.pray, DAY = CFG.time.dayTicks, J = CFG.festivals.join, F = CFG.faith;

const devout = (g: Goblin): boolean => g.personality.piety >= P.minPiety || g.godView.faith >= P.minFaith;
/** fed enough to spare the time (food comes first), watered and rested */
const fit = (g: Goblin): boolean => g.needs.hunger >= P.minFed && g.needs.thirst >= J.minNeed && g.needs.energy >= J.minEnergy;
/** 1 when at ease, up to 1 + `worry` when low or frightened. */
const worry = (g: Goblin): number => 1 + P.worry * Math.max(0, (50 - Math.min(g.mood.value, g.needs.safety)) / 50);
/** angry with the god and not pious enough to blame itself: it shakes its fist instead */
export const sulking = (g: Goblin): boolean => g.godView.angryAtGod && g.personality.piety < F.fist.maxPiety;
/** When `g` last finished a prayer (the 'prayed' mood lasts `gapDays`). */
const lastPrayed = (g: Goblin): number => {
  const m = g.mood.modifiers.find((x) => x.id === 'prayed');
  return m ? m.expiresTick - P.gapDays * DAY : -Infinity;
};
/** The shaman's gathering, if `g` is within its call and has not prayed since it began. */
function called(g: Goblin, w: World) {
  const ga = w.s.god.faith?.gathering;
  if (!ga || ga.shamanId === g.id || dist(g.pos, ga.pos) > F.shaman.call || lastPrayed(g) >= ga.until - F.shaman.ticks) return null;
  return w.s.buildings.find((b) => b.id === ga.buildingId) ?? null;
}
/** Where `g` would pray: the shaman's gathering, else the nearest shrine or temple (if it has not prayed lately). */
function altarFor(g: Goblin, w: World) {
  if (!devout(g) || !fit(g)) return null;
  return called(g, w) ?? (g.mood.modifiers.some((m) => m.id === 'prayed') ? null : nearestAltar(w, g.pos, P.range));
}
/** In despair, with no prayer open, none in the last `desperateGapDays` and no Gnasher in sight: it prays where it is. */
const despairing = (g: Goblin, w: World): boolean =>
  !openPrayer(g, w) && w.s.tick - lastPrayed(g) >= F.prayer.desperateGapDays * DAY
  && !w.s.enemies.some((e) => dist(e.pos, g.pos) < F.prayer.safeDist) && desperate(g, w);

export const Pray: UtilityAction = {
  id: 'pray', tags: ['divine'], minStage: 'youngling', interruptible: (g) => g.activity.stage === 0, // a prayer once begun is finished
  isAvailable: (g, w) => !sulking(g) && !festivalNow(w) && (!!altarFor(g, w) || despairing(g, w)),
  score: (g, w) => {
    const faith = (0.4 + g.personality.piety) * (0.5 + g.godView.faith / 100);
    if (!altarFor(g, w)) return q4(F.prayer.desperateScore * faith);
    return q4(P.score * faith * worry(g) * beliefMul(w, g, 'prayer') * (w.s.village.policies?.shrine ? P.policyMul : 1) * (called(g, w) ? F.shaman.pull : 1));
  },
  start(g, w) {
    const b = altarFor(g, w), a = g.activity;
    a.targetId = b?.id ?? null;
    a.target = b ? ringSpot(w, b.pos, g.id, b.type === 'temple' ? [1.8, 2.6] : [1.1, 1.7]) : { x: g.pos.x, y: g.pos.y };
    return dist(g.pos, a.target) < 0.5 || planPath(w, g, a.target);
  },
  step(g, w) {
    const a = g.activity, b = a.targetId !== null ? w.s.buildings.find((x) => x.id === a.targetId) : undefined;
    if (a.targetId !== null && !b) return 'failed';
    if (a.stage === 0) {
      if (moveAlong(w, g) !== 'arrived') return 'running';
      a.stage = 1;
      a.progress = P.ticks;
      if (b) faceToward(g, b.pos);
      w.emit({ type: 'emote', goblinId: g.id, emote: 'pray' });
    }
    g.velocity = { x: 0, y: 0 };
    if (--a.progress > 0) return 'running';
    addMood(w, g, 'prayed', P.mood, P.gapDays * DAY);
    g.deeds.prayers = (g.deeds.prayers ?? 0) + 1; // P8.7: toward "the Devout"
    drift(g, 'prayed');
    g.godView.faith = q4(clamp(g.godView.faith + P.faith, 0, 100)); // (not via god/faith: that module needs the AI loaded first)
    const p = offerPrayer(w, g, !b);
    const led = !!b && w.s.god.faith?.gathering?.buildingId === b.id;
    prayerFavor(w, g, P.ticks, (p?.kind === 'thanks' ? 2 : 1) * (templeNear(w, g.pos) ? F.temple.favorMul : 1) * (led ? F.shaman.favor : 1));
    if (b) offer(w, g, b);
    return 'done';
  },
};
