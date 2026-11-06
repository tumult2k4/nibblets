/**
 * The reaction table (§17.4): what witnessing a divine act does to a goblin's faith, love and fear. Skeptics (faith
 * under 15) explain the good things away: no faith from them. Kept apart from faith.ts so the AI can use it.
 */
import type { DivineActKind } from '../../shared/types';
import { clamp, q4 } from '../../shared/math';
import { CFG } from '../config';
import type { Goblin } from '../state';

export interface Reaction { faith?: number; love?: number; fear?: number }

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
    case 'lightning':
    case 'meteor':
      return { faith: 8, fear: 15 };
    case 'swarm':
      return { faith: 3, fear: 6 };
    case 'blessing':
      return isTarget ? { faith: 5, love: 6 } : { faith: 2, love: 1 };
    case 'inspiration':
      return isTarget ? { faith: 6, love: 4 } : { faith: 2 };
    case 'fertility':
      return isTarget ? { faith: 5, love: 6 } : { faith: 2, love: 1 };
    case 'shiny_gift':
      return isTarget ? { faith: 4, love: 8 } : { faith: 2, love: 1 };
    case 'curse':
      return isTarget ? { faith: 5, love: -8, fear: 10 } : { faith: 3, fear: 5 };
    case 'summon_gnashers':
    case 'summon_bramblebeast':
      return { faith: 4, fear: 10 };
    // P6.6
    case 'healing_touch':
      return isTarget ? { faith: 8, love: 8 } : { faith: 3, love: 2 };
    case 'plague':
      return isTarget ? { faith: 4, love: -8, fear: 10 } : { faith: 2, fear: 6 };
    case 'blight':
      return { faith: 2, fear: 3 };
    case 'flood':
      return { faith: 5, fear: 8 };
    case 'earthquake':
      return { faith: 8, fear: 14 };
    case 'vision':
      return { faith: 5, love: 2 };
    case 'sanctuary':
      return { faith: 6, love: 4 };
    case 'bring_forth':
      return isTarget ? {} : { faith: 10, love: 3, fear: 3 };
    case 'resurrect':
      return isTarget ? { faith: 25, love: 12 } : { faith: 15, love: 5, fear: 5 };
    default:
      return {};
  }
}
