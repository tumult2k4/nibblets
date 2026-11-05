/**
 * Craft (§P4.2): make a hand recipe the goblin knows and wants (a better weapon, a tool for its work). Missing inputs
 * are fetched from the stockpile's spare first; the work itself takes the recipe's ticks, less with crafting skill.
 */
import { CFG } from '../../config';
import { dist } from '../../../shared/math';
import { addItem } from '../../inventory';
import { needUrgency } from '../../goblin/needs';
import { moveAlong, planPath } from '../../steering';
import { deposit, withdraw } from '../../stockpile';
import { HAND_RECIPES } from '../../recipes';
import { chooseCraft, craftTicks, finishCraft, missingInputs, spareStock } from '../../crafting';
import type { Goblin } from '../../state';
import type { UtilityAction } from '../action';

const busy = (g: Goblin): number => Math.max(needUrgency(g.needs.hunger), needUrgency(g.needs.thirst), needUrgency(g.needs.energy));

export const Craft: UtilityAction = {
  // fetching can be cut short; once the hands are busy the piece gets finished
  id: 'craft', tags: ['work'], minStage: 'adult', interruptible: (g) => g.activity.stage === 0,
  isAvailable: (g, w) => !!chooseCraft(g, w),
  score: (g, w) => (chooseCraft(g, w)?.value ?? 0) * (1 - busy(g)),
  start(g, w) {
    const c = chooseCraft(g, w);
    if (!c) return false;
    const a = g.activity;
    a.targetId = HAND_RECIPES.indexOf(c.id); // the recipe being made
    if (!missingInputs(g, c.id).length) {
      a.stage = 1;
      a.progress = craftTicks(g, c.id);
      return true;
    }
    a.stage = 0;
    const sp = w.s.village.stockpilePos;
    return dist(g.pos, sp) < 0.9 || planPath(w, g, sp);
  },
  step(g, w) {
    const a = g.activity;
    const id = HAND_RECIPES[a.targetId ?? -1];
    if (!id) return 'failed';
    if (a.stage === 0) {
      if (a.path.length && moveAlong(w, g) !== 'arrived') return 'running';
      for (const m of missingInputs(g, id)) {
        const n = withdraw(w.s, m.type, Math.min(m.qty, spareStock(w, m.type)));
        const kept = addItem(g, { type: m.type, qty: n });
        if (kept < n) deposit(w.s, { type: m.type, qty: n - kept }); // no room: put it back
      }
      if (missingInputs(g, id).length) return 'failed';
      a.stage = 1;
      a.progress = craftTicks(g, id) + CFG.crafting.fetchTicks;
    }
    if (--a.progress > 0) return 'running';
    return finishCraft(w, g, id) ? 'done' : 'failed';
  },
};
