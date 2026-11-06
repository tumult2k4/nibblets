/**
 * P7.4 compost (§8.3): `TendCompost` carries the store's spare waste (leaves, then cores past what the planters need)
 * to a heap with room; `SpreadCompost` takes compost from a heap or the store to tired soil under a growing bush or
 * in a garden, and works it in. Stages: 0 to the store or heap, 1 to where it goes, 2 work (spread only).
 */
import { CFG } from '../../config';
import { dist } from '../../../shared/math';
import { addItem, countItem, removeItems } from '../../inventory';
import { moveAlong, planPath, faceToward } from '../../steering';
import { deposit, stockCount, withdraw } from '../../stockpile';
import { workSpot } from '../../buildings';
import { gainXp, workSpeed } from '../../goblin/skills';
import { compostTarget, feedHeap, heapCompost, heapFill, heaps, spareWaste, spreadCompost } from '../../garden';
import { busy, isDaytime, othersDoing } from './village';
import type { Building, Goblin } from '../../state';
import type { World } from '../../world';
import type { StepResult, UtilityAction } from '../action';
import type { Vec2 } from '../../../shared/types';

const C = CFG.garden.compost;

const heapWithRoom = (w: World): Building | null => heaps(w.s).find((b) => heapFill(b) < C.holds) ?? null;

/** Back to the store with whatever is left in hand. */
function storeRest(g: Goblin, w: World): void {
  for (const t of ['apple_core', 'leaves', 'compost'] as const) {
    const n = countItem(g, t);
    if (n > 0 && dist(g.pos, w.s.village.stockpilePos) < 1.5) { removeItems(g, t, n); deposit(w.s, { type: t, qty: n }); }
  }
}

export const TendCompost: UtilityAction = {
  id: 'tend_compost', tags: ['work'], minStage: 'adult', interruptible: (g) => g.activity.stage === 0,
  isAvailable: (g, w) => isDaytime(w.clock) && !!heapWithRoom(w) && spareWaste(w.s).length > 0 && !othersDoing(g, w, 'tend_compost'),
  score: (g) => C.haulScore * (0.6 + 0.4 * g.personality.industry) * (1 - busy(g)),
  start(g, w) {
    const b = heapWithRoom(w);
    if (!b) return false;
    Object.assign(g.activity, { targetId: b.id, stage: 0 });
    return dist(g.pos, w.s.village.stockpilePos) < 0.9 || planPath(w, g, w.s.village.stockpilePos);
  },
  step(g, w) {
    const a = g.activity, b = w.s.buildings.find((x) => x.id === a.targetId);
    if (!b) return 'failed';
    if (a.path.length && moveAlong(w, g) !== 'arrived') return 'running';
    if (a.stage === 0) {
      let room = Math.min(C.load, C.holds - heapFill(b));
      // leaves first: cores are seed
      for (const x of [...spareWaste(w.s)].reverse()) {
        const n = withdraw(w.s, x.type, Math.min(room, x.n));
        if (n) addItem(g, { type: x.type, qty: n });
        room -= n;
      }
      if (!countItem(g, 'apple_core') && !countItem(g, 'leaves')) return 'failed';
      a.stage = 1;
      return planPath(w, g, workSpot(w.s, b, g)) ? 'running' : 'failed';
    }
    faceToward(g, b.pos);
    let n = 0;
    for (const t of ['leaves', 'apple_core'] as const) {
      const k = feedHeap(w, b, countItem(g, t));
      if (k) removeItems(g, t, k);
      n += k;
    }
    return n ? 'done' : 'failed';
  },
};

let target = { tick: -1, w: null as World | null, at: null as Vec2 | null };
/** Somewhere that wants compost (cached by the tick for the availability check). */
const anyTarget = (w: World): Vec2 | null => {
  if (target.tick !== w.s.tick || target.w !== w) target = { tick: w.s.tick, w, at: compostTarget(w, w.s.village.center, () => false) };
  return target.at;
};
const source = (w: World): Building | null => heaps(w.s).find((b) => heapCompost(b) > 0) ?? null;
const taken = (g: Goblin, w: World) => (p: Vec2): boolean =>
  w.s.goblins.some((o) => o !== g && o.activity.action === 'spread_compost' && o.activity.target && dist(o.activity.target, p) < 1);

function next(g: Goblin, w: World): StepResult {
  if (countItem(g, 'compost') <= 0) return 'done';
  const at = compostTarget(w, g.pos, taken(g, w));
  if (!at) {
    g.activity.stage = 3;
    return planPath(w, g, w.s.village.stockpilePos) ? 'running' : 'done';
  }
  Object.assign(g.activity, { stage: 1, target: at, progress: 0 });
  return planPath(w, g, at) ? 'running' : 'failed';
}

export const SpreadCompost: UtilityAction = {
  id: 'spread_compost', tags: ['work'], minStage: 'adult', interruptible: (g) => g.activity.stage === 0,
  isAvailable: (g, w) => isDaytime(w.clock) && (!!source(w) || stockCount(w.s, 'compost') > 0 || countItem(g, 'compost') > 0) && !!anyTarget(w),
  score: (g) => C.spreadScore * (0.7 + 0.3 * g.personality.industry) * (1 - busy(g)),
  start(g, w) {
    if (countItem(g, 'compost') > 0) return next(g, w) === 'running';
    const b = source(w);
    Object.assign(g.activity, { targetId: b?.id ?? null, stage: 0 });
    return planPath(w, g, b ? workSpot(w.s, b, g) : w.s.village.stockpilePos);
  },
  step(g, w) {
    const a = g.activity;
    if (a.path.length && moveAlong(w, g) !== 'arrived') return 'running';
    if (a.stage === 3) { storeRest(g, w); return 'done'; }
    if (a.stage === 0) {
      const b = w.s.buildings.find((x) => x.id === a.targetId);
      const st = b?.storage.find((x) => x.type === 'compost');
      const n = st ? Math.min(2, st.qty) : withdraw(w.s, 'compost', 2);
      if (st) { st.qty -= n; if (st.qty <= 0) b!.storage = b!.storage.filter((x) => x.qty > 0); }
      if (!n) return 'failed';
      addItem(g, { type: 'compost', qty: n });
      return next(g, w);
    }
    if (a.stage === 1) { a.stage = 2; a.progress = 0; }
    g.velocity = { x: 0, y: 0 };
    faceToward(g, a.target!);
    if (++a.progress < Math.round(C.spreadTicks / workSpeed(g, 'farming'))) return 'running';
    removeItems(g, 'compost', 1);
    spreadCompost(w.s, a.target!);
    gainXp(w, g, 'farming', CFG.skills.xp.plant);
    w.emit({ type: 'compost_spread', goblinId: g.id, at: { ...a.target! } });
    return next(g, w);
  },
};
