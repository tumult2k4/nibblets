import type { DivineActKind, ID, Vec2 } from '../../shared/types';
import { clamp, dist, q4 } from '../../shared/math';
import { CFG } from '../config';
import type { Goblin } from '../state';
import type { World } from '../world';
import { isSleeping } from '../goblin/goblin';
import { forceAction } from '../ai/utility';
import { visionRadius } from '../ai/considerations';

export interface Reaction { faith?: number; love?: number; fear?: number }

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

export function applyReaction(g: Goblin, r: Reaction): void {
  const v = g.godView;
  const skeptic = v.faith < CFG.god.skepticFaith;
  if (r.faith) v.faith = q4(clamp(v.faith + (skeptic && r.faith > 0 ? 0 : r.faith), 0, 100));
  if (r.love) v.love = q4(clamp(v.love + r.love, 0, 100));
  if (r.fear) v.fear = q4(clamp(v.fear + r.fear, 0, 100));
}

const isYoung = (g: Goblin) => g.lifeStage === 'hatchling' || g.lifeStage === 'youngling';

/** Reaction table (§17.4) for the acts implemented so far. */
export function reactionFor(act: DivineActKind | 'hurt', g: Goblin, isTarget: boolean): Reaction {
  switch (act) {
    case 'gift':
      return { faith: 4, love: 3 };
    case 'set_down':
      return isTarget ? { faith: 6, love: isYoung(g) ? 6 : 2, fear: isYoung(g) ? 0 : 4 } : { faith: 2 };
    case 'hurt':
      return { faith: 4, love: -5, fear: 10 };
    case 'grab':
      return isTarget ? { faith: 3, fear: isYoung(g) ? 0 : 2 } : { faith: 2, fear: 1 };
    case 'flick':
      return isTarget ? { faith: 2, fear: CFG.god.flickFear } : { faith: 1, fear: 2 };
    case 'poke':
      return isTarget ? { faith: 1 } : {};
    case 'drop':
    case 'throw':
      return isTarget ? {} : { faith: 2 };
    case 'apple_shower':
    case 'bountiful_growth':
      return { faith: 4, love: 3 };
    case 'rain':
    case 'warm_sun':
      return { faith: 3, love: 2 };
    case 'clear_sky':
    case 'snowfall':
      return { faith: 2 };
    case 'gust':
      return isTarget ? { faith: 2, fear: 4 } : { faith: 1, fear: 1 };
    default:
      return {};
  }
}

/**
 * Emit a divine act: compute witnesses, apply reactions, make non-target witnesses look up (§17.4).
 * Returns the witness ids (also on the event).
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
    applyReaction(g, opts.reaction ?? reactionFor(act, g, g.id === targetId));
    if (lookUp && g.id !== targetId && !g.airborne && g.activity.action !== 'look_up') forceAction(g, w, 'look_up', at);
  }
  const ids = ws.map((g) => g.id);
  w.emit({
    type: 'divine_act', act: act === 'hurt' ? 'drop' : act, witnessIds: ids, at: { x: at.x, y: at.y },
    ...(targetId !== undefined ? { targetId } : {}),
  });
  return ids;
}
