/**
 * CookStew (§11.2, P7.3): while the store holds a few days' food, a goblin takes the makings of a stew or two (an
 * apple, a mushroom and a fish or some meat, or else two of anything) to a lit hearth near the store, cooks them
 * (cooking skill speeds it up) and brings the stew back. Stages: 0 to the store (fetch), 1 to the hearth, 2 cook,
 * 3 back to the store.
 */
import { CFG } from '../../config';
import { dist } from '../../../shared/math';
import { addItem, countItem, removeItems } from '../../inventory';
import { faceToward, moveAlong, planPath } from '../../steering';
import { deposit, withdraw } from '../../stockpile';
import { workSpot } from '../../buildings';
import { isLit } from '../../fire';
import { gainXp, skillSpeed } from '../../goblin/skills';
import { STEW_FOODS, stewFrom, stewHearth, stewInputs } from '../../settlement';
import { busy } from './village';
import type { Goblin } from '../../state';
import type { World } from '../../world';
import type { StepResult, UtilityAction } from '../action';

const S = CFG.settlement.stew;

const taken = (g: Goblin, w: World, id: number): boolean =>
  w.s.goblins.some((o) => o !== g && o.activity.action === 'cook_stew' && o.activity.status === 'running' && o.activity.targetId === id);
const job = (g: Goblin, w: World) => {
  const b = stewHearth(w);
  return b && !taken(g, w, b.id) ? b : null;
};

/** Back to the store with the stew and whatever makings are left. */
function home(g: Goblin, w: World): StepResult {
  g.activity.stage = 3;
  return dist(g.pos, w.s.village.stockpilePos) < 0.9 || planPath(w, g, w.s.village.stockpilePos) ? 'running' : 'failed';
}
function unload(g: Goblin, w: World): void {
  for (const t of ['stew', ...STEW_FOODS] as const) {
    const n = countItem(g, t);
    if (n <= 0) continue;
    removeItems(g, t, n);
    deposit(w.s, { type: t, qty: n });
    w.emit({ type: 'item_stored', goblinId: g.id, item: t, qty: n });
  }
}

export const CookStew: UtilityAction = {
  id: 'cook_stew', tags: ['work'], minStage: 'adult', interruptible: (g) => g.activity.stage === 0,
  isAvailable: (g, w) => !!job(g, w),
  score: (g) => S.score * (0.7 + 0.3 * g.personality.industry) * (1 - busy(g)),
  start(g, w) {
    const b = job(g, w);
    if (!b) return false;
    Object.assign(g.activity, { targetId: b.id, stage: 0, progress: 0 });
    return dist(g.pos, w.s.village.stockpilePos) < 0.9 || planPath(w, g, w.s.village.stockpilePos);
  },
  step(g, w) {
    const a = g.activity;
    const b = w.s.buildings.find((x) => x.id === a.targetId);
    if (a.stage === 3) {
      if (a.path.length && moveAlong(w, g) !== 'arrived') return 'running';
      unload(g, w);
      return 'done';
    }
    if (!b) return home(g, w);
    if (a.stage === 0) {
      if (a.path.length && moveAlong(w, g) !== 'arrived') return 'running';
      let got = 0;
      for (let i = 0; i < S.batch; i++) {
        const set = stewInputs(w.s);
        if (!set) break;
        for (const t of set) {
          const n = withdraw(w.s, t, 1);
          if (n && addItem(g, { type: t, qty: 1 }) < 1) deposit(w.s, { type: t, qty: 1 });
          else got += n;
        }
      }
      if (!got) return 'failed';
      a.stage = 1;
      if (!planPath(w, g, workSpot(w.s, b, g))) return home(g, w);
    }
    if (a.stage === 1) {
      if (a.path.length && moveAlong(w, g) !== 'arrived') return 'running';
      a.stage = 2;
      a.progress = 0;
    }
    g.velocity = { x: 0, y: 0 };
    faceToward(g, b.pos);
    if (!isLit(b)) return home(g, w); // the fire went out
    if (++a.progress < Math.round(S.ticks / skillSpeed(g, 'cooking'))) return 'running';
    a.progress = 0;
    const set = stewFrom((t) => countItem(g, t));
    if (!set) return home(g, w);
    for (const t of set) removeItems(g, t, 1);
    // the cores are kept for planting, as after any apple eaten (§8.1)
    const cores = set.filter((t) => t === 'apple').length;
    if (cores) addItem(g, { type: 'apple_core', qty: cores });
    if (addItem(g, { type: 'stew', qty: 1 }) < 1) deposit(w.s, { type: 'stew', qty: 1 });
    gainXp(w, g, 'cooking', CFG.skills.xp.process);
    const firsts = (w.s.village.firsts ??= []), first = !firsts.includes('stew');
    if (first) firsts.push('stew');
    w.emit({ type: 'food_cooked', goblinId: g.id, item: 'stew', qty: 1, first, at: { ...b.pos } });
    return stewFrom((t) => countItem(g, t)) ? 'running' : home(g, w);
  },
};
