import type { DivineActKind, ID, Vec2 } from '../../shared/types';
import { dist, q4 } from '../../shared/math';
import { CFG } from '../config';
import type { Goblin } from '../state';
import type { World } from '../world';
import { isSleeping } from '../goblin/goblin';
import { forceAction } from '../ai/utility';
import { visionRadius } from '../ai/considerations';
import { applyReaction, reactionFor, type Reaction } from './reactions';

import { noteNews } from './news';
import { answerPrayers } from './prayers';

export { applyReaction, reactionFor, type Reaction };

/**
 * Perception rule (§17.4): a goblin witnesses an act if it is the target, or it is awake and the act
 * happens within its vision radius. Sorted by id.
 */
export function witnessesOf(w: World, at: Vec2, targetId?: ID, area = 0): Goblin[] {
  return w.s.goblins.filter((g) => {
    if (g.id === targetId) return true;
    if (isSleeping(g) || g.heldByGod) return false;
    return dist(g.pos, at) <= Math.max(area, visionRadius(g, w));
  });
}

/** A kindness from the god melts anger at it (§17.4). */
export function calmAnger(w: World, g: Goblin): void {
  if (!g.godView.angryAtGod) return;
  g.godView.angryAtGod = false;
  g.godView.angryUntil = 0;
  const m = g.mood.modifiers.find((x) => x.id === 'angry_at_god');
  if (m) m.expiresTick = w.s.tick;
}
/** Acts that count as a kindness toward their target (or toward everyone inside an area gift). */
const KIND: ReadonlySet<string> = new Set(['gift', 'set_down', 'pet', 'apple_shower', 'bountiful_growth', 'warm_sun', 'blessing', 'inspiration', 'fertility', 'shiny_gift',
  'healing_touch', 'sanctuary', 'bring_forth', 'resurrect']);

/**
 * Emit a divine act: compute witnesses, apply reactions, make non-target witnesses look up (§17.4); P8.8: a kindness
 * may convert a skeptic, the witnesses will talk of it, and it may answer a prayer. Returns the witness ids.
 */
export interface ActOpts {
  /** everyone within this radius of `at` witnesses too (area powers); Infinity = every awake goblin (sky acts) */
  area?: number;
  /** replaces the reaction table entry (omens such as out-of-season snow) */
  reaction?: Reaction;
}

export function divineAct(w: World, act: DivineActKind | 'hurt', at: Vec2, targetId?: ID, lookUp = true, opts: ActOpts = {}): ID[] {
  const ws = witnessesOf(w, at, targetId, opts.area);
  for (const g of ws) {
    const skeptic = g.godView.faith < CFG.god.skepticFaith;
    applyReaction(g, opts.reaction ?? reactionFor(act, g, g.id === targetId));
    g.godView.seenTick = w.s.tick; // P8.8: the god is about; faith keeps
    if (KIND.has(act) && (g.id === targetId || (opts.area !== undefined && opts.area < Infinity && dist(g.pos, at) <= opts.area))) {
      calmAnger(w, g);
      if (skeptic) convert(w, g);
    }
    if (lookUp && g.id !== targetId && !g.airborne && g.activity.action !== 'look_up') forceAction(g, w, 'look_up', at);
  }
  const ids = ws.map((g) => g.id);
  noteNews(w, act, at, ids, opts.reaction); // P8.8: the witnesses will talk of it
  answerPrayers(w, act, at, targetId, opts.area);
  w.emit({
    type: 'divine_act', act: act === 'hurt' ? 'drop' : act, witnessIds: ids, at: { x: at.x, y: at.y },
    ...(targetId !== undefined ? { targetId } : {}),
  });
  return ids;
}

/** A kindness that helps a skeptic directly may win it over (§17.4: 30 %, faith +25). */
function convert(w: World, g: Goblin): void {
  if (!w.rng.chance(CFG.god.conversionChance)) return;
  g.godView.faith = q4(Math.min(100, g.godView.faith + CFG.faith.convert.faith));
  w.emit({ type: 'converted', goblinId: g.id, at: { ...g.pos } });
}
