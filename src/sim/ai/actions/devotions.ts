/**
 * Devotions beyond prayer (§17.4, P8.8). `MakeOffering`: the faithful (faith ≥ 40), and the pious who blame
 * themselves for the god's anger, now and then lay a gift at the shrine or temple: a spare trinket, or food fetched
 * from the store (not in lean times); a wrathful god gets twice as many. The god takes it a day later (favor).
 * `LeadPrayer`: the shaman, every other day by daylight with two of the devout about, stands before the shrine or
 * temple with arms raised for 300 ticks; the devout within 30 tiles come to pray (×3) and their prayers earn ×1.5.
 * `ShakeFist`: a goblin of little piety angry with the god shakes a fist at the sky now and then (it eases it a little).
 */
import { CFG } from '../../config';
import { dist } from '../../../shared/math';
import type { ItemType } from '../../../shared/types';
import { faceToward, moveAlong, planPath } from '../../steering';
import { addMood } from '../../goblin/mood';
import { festivalNow } from '../../festivals';
import { beliefMul } from '../../superstitions';
import { consecrated, layOffering, nearestAltar } from '../../shrine';
import { carried } from '../../trinkets';
import { foodStores } from '../../spoilage';
import { stockCount, withdraw } from '../../stockpile';
import { addItem, countItem, removeItems } from '../../inventory';
import { godTemper } from '../../god/devotion';
import { faithOf } from '../../god/faithState';
import { ringSpot } from './festival';
import { sulking } from './pray';
import type { Building, Goblin } from '../../state';
import type { World } from '../../world';
import type { UtilityAction } from '../action';

const F = CFG.faith, O = F.offering, S = F.shaman, FI = F.fist, DAY = CFG.time.dayTicks, J = CFG.festivals.join;
const FOODS: readonly ItemType[] = O.food;

const fit = (g: Goblin): boolean => g.needs.hunger >= CFG.beliefs.pray.minFed && g.needs.thirst >= J.minNeed && g.needs.energy >= J.minEnergy;
const selfBlame = (g: Goblin): boolean => g.godView.angryAtGod && g.personality.piety >= FI.maxPiety;
const busy = (w: World, g: Goblin, id: string): boolean => !!festivalNow(w) || g.mood.modifiers.some((m) => m.id === id);

// ---------------------------------------------------------------- MakeOffering

/** What `g` would lay at `b`: a spare trinket (any, for a temple to be consecrated, the pious angry or a wrathful
 * god), else food from the store. */
function giftFor(g: Goblin, w: World, b: Building): { trinketId?: number; item?: ItemType } | null {
  const mine = carried(g, w);
  const keen = selfBlame(g) || godTemper(w.s) === 'wrathful' || (b.type === 'temple' && !consecrated(b));
  if (mine.length >= 2 || (mine.length && keen)) return { trinketId: mine[mine.length - 1]!.id };
  if (foodStores(w.s).days < 2) return null;
  const item = FOODS.find((t) => stockCount(w.s, t) > 0);
  return item ? { item } : null;
}
function offeringAltar(g: Goblin, w: World): Building | null {
  if ((g.godView.faith < O.minFaith && !selfBlame(g)) || !fit(g) || busy(w, g, 'offered')) return null;
  const b = nearestAltar(w, g.pos, O.range);
  return b && giftFor(g, w, b) ? b : null;
}

export const MakeOffering: UtilityAction = {
  id: 'make_offering', tags: ['divine'], minStage: 'adult', interruptible: (g) => g.activity.stage < 2,
  isAvailable: (g, w) => !!offeringAltar(g, w),
  score: (g, w) => O.score * (0.3 + g.personality.piety) * (0.5 + g.godView.faith / 100) * (selfBlame(g) ? 2 : 1)
    * (godTemper(w.s) === 'wrathful' ? F.alignment.offerings : 1) * beliefMul(w, g, 'offering'),
  start(g, w) {
    const b = offeringAltar(g, w)!, a = g.activity, what = giftFor(g, w, b)!;
    a.targetId = b.id;
    a.stage = what.item && !FOODS.some((t) => countItem(g, t) > 0) ? 0 : 1;
    a.target = a.stage === 0 ? { ...w.s.village.stockpilePos } : ringSpot(w, b.pos, g.id, b.type === 'temple' ? [1.8, 2.6] : [1.1, 1.7]);
    return dist(g.pos, a.target) < 0.5 || planPath(w, g, a.target);
  },
  step(g, w) {
    const a = g.activity, b = w.s.buildings.find((x) => x.id === a.targetId);
    if (!b) return 'failed';
    if (a.stage === 0) {
      if (moveAlong(w, g) !== 'arrived') return 'running';
      const item = FOODS.find((t) => stockCount(w.s, t) > 0);
      if (!item || withdraw(w.s, item, 1) < 1) return 'failed';
      addItem(g, { type: item, qty: 1 });
      a.stage = 1;
      a.target = ringSpot(w, b.pos, g.id, b.type === 'temple' ? [1.8, 2.6] : [1.1, 1.7]);
      return planPath(w, g, a.target) ? 'running' : 'failed';
    }
    if (a.stage === 1) {
      if (moveAlong(w, g) !== 'arrived') return 'running';
      a.stage = 2;
      a.progress = O.ticks;
      faceToward(g, b.pos);
    }
    g.velocity = { x: 0, y: 0 };
    if (--a.progress > 0) return 'running';
    const food = FOODS.find((t) => countItem(g, t) > 0), mine = carried(g, w);
    if (food && removeItems(g, food, 1) === 1) layOffering(w, g, b, { item: food });
    else if (mine.length) layOffering(w, g, b, { trinketId: mine[mine.length - 1]!.id });
    else return 'failed';
    addMood(w, g, 'offered', O.mood, O.gapDays * DAY);
    return 'done';
  },
};

// ---------------------------------------------------------------- LeadPrayer

const devoutNear = (g: Goblin, w: World): number =>
  w.s.goblins.filter((o) => o !== g && (o.personality.piety >= CFG.beliefs.pray.minPiety || o.godView.faith >= CFG.beliefs.pray.minFaith)
    && o.activity.action !== 'sleep_home' && o.activity.action !== 'sleep_ground' && dist(o.pos, g.pos) <= S.call).length;

function leadAltar(g: Goblin, w: World): Building | null {
  const fs = w.s.god.faith;
  if (g.role !== 'shaman' || festivalNow(w) || fs?.gathering || w.s.tick - (fs?.lastGathering ?? -Infinity) < S.gapDays * DAY) return null;
  if (w.clock.dayFrac < 0.3 || w.clock.dayFrac > 0.7 || !fit(g) || devoutNear(g, w) < S.minFollowers) return null;
  return nearestAltar(w, g.pos, CFG.beliefs.pray.range);
}

export const LeadPrayer: UtilityAction = {
  id: 'lead_prayer', tags: ['divine', 'social'], minStage: 'adult', interruptible: (g) => g.activity.stage === 0,
  isAvailable: (g, w) => !!leadAltar(g, w),
  score: (g) => S.score * (0.5 + g.personality.piety),
  start(g, w) {
    const b = leadAltar(g, w)!, a = g.activity;
    a.targetId = b.id;
    a.target = ringSpot(w, b.pos, g.id, b.type === 'temple' ? [1.3, 1.5] : [0.9, 1.1]);
    return dist(g.pos, a.target) < 0.5 || planPath(w, g, a.target);
  },
  step(g, w) {
    const a = g.activity, b = w.s.buildings.find((x) => x.id === a.targetId);
    if (!b) return 'failed';
    if (a.stage === 0) {
      if (moveAlong(w, g) !== 'arrived') return 'running';
      a.stage = 1;
      a.progress = S.ticks;
      faceToward(g, b.pos);
      const fs = faithOf(w.s);
      fs.gathering = { shamanId: g.id, buildingId: b.id, pos: { x: b.pos.x, y: b.pos.y }, until: w.s.tick + S.ticks };
      fs.lastGathering = w.s.tick;
      w.emit({ type: 'group_prayer', goblinId: g.id, buildingId: b.id, at: { ...b.pos } });
      w.emit({ type: 'emote', goblinId: g.id, emote: 'pray' });
    }
    g.velocity = { x: 0, y: 0 };
    if (--a.progress > 0) return 'running';
    addMood(w, g, 'led_prayer', 5, DAY);
    return 'done';
  },
};

// ---------------------------------------------------------------- ShakeFist

export const ShakeFist: UtilityAction = {
  id: 'shake_fist', tags: ['divine'], minStage: 'youngling', interruptible: true,
  isAvailable: (g, w) => sulking(g) && !g.heldByGod && !busy(w, g, 'shook_fist'),
  score: (g) => FI.score * (1 - g.personality.piety),
  start(g) {
    const a = g.activity;
    a.target = { x: g.pos.x, y: g.pos.y };
    a.stage = 1;
    a.progress = FI.ticks;
    return true;
  },
  step(g, w) {
    const a = g.activity;
    g.velocity = { x: 0, y: 0 };
    if (a.progress === FI.ticks) w.emit({ type: 'emote', goblinId: g.id, emote: 'anger' });
    if (--a.progress > 0) return 'running';
    addMood(w, g, 'shook_fist', FI.vent, FI.gapDays * DAY);
    return 'done';
  },
};
