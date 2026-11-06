/**
 * PavePath (§10.4, P7.4): a goblin who knows stone paths takes a few stones from the store (while it can spare them)
 * and lays them along the most worn stretch of trail near the village, a stone a tile; paved tiles cost less to
 * walk and never wear away. Stages: 0 to the store, 1 to the next tile, 2 lay the stone, 3 back with what is left.
 */
import { CFG } from '../../config';
import { dist } from '../../../shared/math';
import { addItem, countItem, removeItems } from '../../inventory';
import { faceToward, moveAlong, planPath } from '../../steering';
import { deposit, stockCount, withdraw } from '../../stockpile';
import { gainXp, skillSpeed } from '../../goblin/skills';
import { knows } from '../../recipes';
import { pave, paveRun, paveWanted } from '../../roads';
import { storePos } from '../../commons';
import { busy, isDaytime, othersDoing } from './village';
import type { Goblin } from '../../state';
import type { World } from '../../world';
import type { StepResult, UtilityAction } from '../action';
import type { Vec2 } from '../../../shared/types';

const P = CFG.garden.path;

const taken = (g: Goblin, w: World) => (p: Vec2): boolean =>
  w.s.goblins.some((o) => o !== g && o.activity.action === 'pave_path' && o.activity.target && Math.floor(o.activity.target.x) === p.x && Math.floor(o.activity.target.y) === p.y);

/** On to the next worn tile (beside the last one if there is one), or back to the store. */
function next(g: Goblin, w: World): StepResult {
  const a = g.activity;
  const p = countItem(g, 'stone') > 0 ? paveRun(w.s, g.pos, 1, taken(g, w))[0] : undefined;
  if (!p) {
    a.stage = 3;
    if (countItem(g, 'stone') <= 0) return 'done';
    return planPath(w, g, storePos(w.s, 'stone')) ? 'running' : 'done';
  }
  Object.assign(a, { stage: 1, target: { x: p.x + 0.5, y: p.y + 0.5 }, progress: 0 });
  return planPath(w, g, a.target!) ? 'running' : 'failed';
}

export const PavePath: UtilityAction = {
  id: 'pave_path', tags: ['work'], minStage: 'adult', interruptible: (g) => g.activity.stage === 0,
  isAvailable: (g, w) => isDaytime(w.clock) && knows(g, 'stone_path') && paveWanted(w.s, stockCount(w.s, 'stone')) && !othersDoing(g, w, 'pave_path'),
  score: (g) => P.score * (0.6 + 0.4 * g.personality.industry) * (1 - busy(g)),
  start(g, w) {
    g.activity.stage = 0;
    const sp = storePos(w.s, 'stone');
    return dist(g.pos, sp) < 0.9 || planPath(w, g, sp);
  },
  step(g, w) {
    const a = g.activity;
    if (a.path.length && moveAlong(w, g) !== 'arrived') return 'running';
    if (a.stage === 0) {
      const run = paveRun(w.s, g.pos, P.perTrip, taken(g, w));
      const n = withdraw(w.s, 'stone', Math.min(run.length, stockCount(w.s, 'stone') - P.stoneKeep));
      if (!n) return 'failed';
      if (addItem(g, { type: 'stone', qty: n }) < n) { deposit(w.s, { type: 'stone', qty: n }); return 'failed'; }
      return next(g, w);
    }
    if (a.stage === 3) {
      const n = countItem(g, 'stone');
      if (n > 0) { removeItems(g, 'stone', n); deposit(w.s, { type: 'stone', qty: n }); }
      return 'done';
    }
    if (a.stage === 1) { a.stage = 2; a.progress = 0; }
    g.velocity = { x: 0, y: 0 };
    faceToward(g, a.target!);
    if (++a.progress < Math.round(P.ticks / skillSpeed(g, 'building'))) return 'running';
    const x = Math.floor(a.target!.x), y = Math.floor(a.target!.y);
    if (pave(w.s, x, y)) {
      removeItems(g, 'stone', 1);
      gainXp(w, g, 'building', CFG.skills.xp.buildTick * 40);
      const firsts = (w.s.village.firsts ??= []), first = !firsts.includes('stone_path');
      if (first) firsts.push('stone_path');
      w.emit({ type: 'path_paved', goblinId: g.id, tiles: 1, first, at: { ...a.target! } });
    }
    return next(g, w);
  },
};
