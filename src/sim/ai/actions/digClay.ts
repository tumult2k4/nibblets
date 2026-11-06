/**
 * DigClay (§7.2 work, §11.2, P7.2): clay is dug on marsh ground or on sand and meadow by the water and carried home
 * like any material. Before anyone knows the kiln the village keeps a lump or two about (which is how the idea comes);
 * once the kiln is known it keeps more, and a kiln blueprint waiting for clay sends diggers out at once.
 */
import { CFG } from '../../config';
import { clamp, dist } from '../../../shared/math';
import type { Goblin } from '../../state';
import type { World } from '../../world';
import type { UtilityAction } from '../action';
import { moveAlong, planPath } from '../../steering';
import { gainXp, workSpeed } from '../../goblin/skills';
import { addItem, canCarry } from '../../inventory';
import { clayNear } from '../../kiln';
import { knows } from '../../recipes';
import { materialWanted } from '../wants';
import { busy } from './village';
import { isNight } from '../../time';

const C = CFG.economy.clay;

let known = { tick: -1, w: null as World | null, v: false };
const kilnKnown = (w: World): boolean => {
  if (known.tick !== w.s.tick || known.w !== w) known = { tick: w.s.tick, w, v: w.s.goblins.some((o) => knows(o, 'kiln')) };
  return known.v;
};

/** 0..1: how short the village is of clay (blueprints included). */
export const clayWanted = (g: Goblin, w: World): number => materialWanted(g, w, 'clay', kilnKnown(w) ? C.target : C.before);

export const DigClay: UtilityAction = {
  id: 'dig_clay', tags: ['work'], minStage: 'adult', interruptible: true,
  isAvailable: (g, w) => !isNight(w.clock) && canCarry(g, 'clay') && clayWanted(g, w) > 0 && !!clayNear(w.s, g.pos, C.range),
  score(g, w) {
    const at = clayNear(w.s, g.pos, C.range)!;
    return clamp(C.want * clayWanted(g, w) * (0.5 + g.personality.industry) * (1 - 0.4 * dist(at, g.pos) / C.range) * (1 - busy(g)), 0, 1);
  },
  start(g, w) {
    const at = clayNear(w.s, g.pos, C.range);
    if (!at || !planPath(w, g, at)) return false;
    Object.assign(g.activity, { target: at, stage: 0, progress: 0 });
    return true;
  },
  step(g, w) {
    const a = g.activity;
    if (a.stage === 0) {
      if (moveAlong(w, g) !== 'arrived') return 'running';
      a.stage = 1;
      a.progress = Math.round(C.digTicks / workSpeed(g, 'mining'));
    }
    g.velocity = { x: 0, y: 0 };
    if (--a.progress > 0) return 'running';
    const got = addItem(g, { type: 'clay', qty: C.qty });
    if (got <= 0) return 'failed';
    gainXp(w, g, 'mining', CFG.skills.xp.stone);
    w.emit({ type: 'clay_dug', goblinId: g.id, qty: got, at: { x: g.pos.x, y: g.pos.y } });
    return 'done';
  },
};
