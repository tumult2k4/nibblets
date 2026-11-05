/**
 * Craft (§P4.2): make a hand recipe the goblin knows and wants (a better weapon, a tool for its work). Missing inputs
 * are fetched from the stockpile's spare first; the work itself takes the recipe's ticks, less with crafting skill.
 * P5.7: with a workbench within reach the goblin works there, half again as fast, and worn gear is mended there with
 * half the inputs (`activity.count` 1 = mending).
 */
import { CFG } from '../../config';
import { dist } from '../../../shared/math';
import { addItem } from '../../inventory';
import { needUrgency } from '../../goblin/needs';
import { moveAlong, planPath } from '../../steering';
import { deposit, withdraw } from '../../stockpile';
import { HAND_RECIPES, RECIPES } from '../../recipes';
import { chooseCraft, craftTicks, finishCraft, missingInputs, spareStock } from '../../crafting';
import { atBench, benchFor, mend, mendInputs, shortOf, wornGear } from '../../workbench';
import type { ItemStack, RecipeId } from '../../../shared/types';
import type { Goblin } from '../../state';
import type { World } from '../../world';
import type { UtilityAction } from '../action';

const busy = (g: Goblin): number => Math.max(needUrgency(g.needs.hunger), needUrgency(g.needs.thirst), needUrgency(g.needs.energy));

/** A worn piece to mend: there must be a bench, and the half inputs in pack + spare stock. */
function mendJob(g: Goblin, w: World): { id: RecipeId; value: number } | null {
  const m = wornGear(g);
  if (!m || !benchFor(g, w)) return null;
  return shortOf(g, mendInputs(m.id)).every((s) => spareStock(w, s.type) >= s.qty) ? { id: m.id, value: m.value } : null;
}

/** The job worth most: a new piece or a mend. */
function job(g: Goblin, w: World): { id: RecipeId; value: number; mend: boolean } | null {
  const c = chooseCraft(g, w), m = mendJob(g, w);
  if (m && m.value > (c?.value ?? 0)) return { ...m, mend: true };
  return c ? { ...c, mend: false } : null;
}

const needs = (g: Goblin, id: RecipeId, mending: boolean): ItemStack[] => (mending ? shortOf(g, mendInputs(id)) : missingInputs(g, id));
const workTicks = (g: Goblin, w: World, id: RecipeId, mending: boolean): number =>
  Math.round(craftTicks(g, id) * (mending ? 0.5 : 1) / (atBench(g, w) ? CFG.workbench.speedMul : 1));

/** Inputs in hand: walk to a bench if there is one in reach, else (new pieces only) set to work where it stands. */
function toWork(g: Goblin, w: World, id: RecipeId, mending: boolean, extra = 0): boolean {
  const a = g.activity, bench = benchFor(g, w);
  if (bench && dist(bench.pos, g.pos) >= 1.2 && planPath(w, g, { x: bench.pos.x + 0.8, y: bench.pos.y + 0.2 })) {
    a.stage = 2;
    return true;
  }
  if (mending && !bench) return false;
  a.stage = 1;
  a.progress = workTicks(g, w, id, mending) + extra;
  return true;
}

export const Craft: UtilityAction = {
  // fetching and walking can be cut short; once the hands are busy the piece gets finished
  id: 'craft', tags: ['work'], minStage: 'adult', interruptible: (g) => g.activity.stage !== 1,
  isAvailable: (g, w) => !!job(g, w),
  score: (g, w) => (job(g, w)?.value ?? 0) * (1 - busy(g)),
  start(g, w) {
    const c = job(g, w);
    if (!c) return false;
    const a = g.activity;
    a.targetId = HAND_RECIPES.indexOf(c.id); // the recipe being made (or mended)
    a.count = c.mend ? 1 : 0;
    if (!needs(g, c.id, c.mend).length) return toWork(g, w, c.id, c.mend);
    a.stage = 0;
    const sp = w.s.village.stockpilePos;
    return dist(g.pos, sp) < 0.9 || planPath(w, g, sp);
  },
  step(g, w) {
    const a = g.activity;
    const id = HAND_RECIPES[a.targetId ?? -1], mending = a.count === 1;
    if (!id || !RECIPES[id]) return 'failed';
    if (a.stage === 0) {
      if (a.path.length && moveAlong(w, g) !== 'arrived') return 'running';
      for (const m of needs(g, id, mending)) {
        const n = withdraw(w.s, m.type, Math.min(m.qty, spareStock(w, m.type)));
        const kept = addItem(g, { type: m.type, qty: n });
        if (kept < n) deposit(w.s, { type: m.type, qty: n - kept }); // no room: put it back
      }
      if (needs(g, id, mending).length) return 'failed';
      if (!toWork(g, w, id, mending, CFG.crafting.fetchTicks)) return 'failed';
      return 'running';
    }
    if (a.stage === 2) {
      if (moveAlong(w, g) !== 'arrived') return 'running';
      a.stage = 1;
      a.progress = workTicks(g, w, id, mending);
    }
    if (--a.progress > 0) return 'running';
    if (!mending) return finishCraft(w, g, id) ? 'done' : 'failed';
    const out = RECIPES[id]!.output;
    return out && mend(w, g, out, id) ? 'done' : 'failed';
  },
};
