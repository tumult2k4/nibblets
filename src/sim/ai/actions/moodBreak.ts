/**
 * Acting out a mood break (§7.5, P8.1). While a break lasts the goblin does no work, keeps no company and plays no
 * games (utility.ts drops those actions); what it does instead is one of these. `Sulk`: off to a spot away from
 * the others to sit it out. `Binge`: to the store, gorging on food until full or four bites down. `WanderOff`: a
 * long walk out past the village, to sit there until the day is over. Eating, drinking, sleeping and running for
 * its life still win when they must.
 */
import { CFG } from '../../config';
import { dist, q4 } from '../../../shared/math';
import { itemDef } from '../../items';
import { stockFood, withdraw } from '../../stockpile';
import { ateFood } from '../../goblin/mood';
import { endBreak, onBreak } from '../../goblin/moodBreaks';
import { faceToward, moveAlong, planPath } from '../../steering';
import type { Goblin } from '../../state';
import type { World } from '../../world';
import type { StepResult, UtilityAction } from '../action';

const B = CFG.mood.breaks;
/** the break's own action scores this much; urgent needs (eat ≥ 0.8 near starving, flee) still beat it */
const SCORE = 0.8;

/** Walk the path, then stand still; 'running' while walking. */
function arrive(g: Goblin, w: World): boolean {
  const a = g.activity;
  if (a.stage === 0) {
    if (a.path.length && moveAlong(w, g) !== 'arrived') return false;
    a.stage = 1;
  }
  g.velocity = { x: 0, y: 0 };
  return true;
}

/** A spot a few tiles past where the goblin stands, away from the village center (and the crowd there). */
function apartSpot(g: Goblin, w: World): { x: number; y: number } {
  const c = w.s.village.center, d = dist(g.pos, c);
  const a = d > 0.5 ? Math.atan2(g.pos.y - c.y, g.pos.x - c.x) : w.rng.range(0, Math.PI * 2);
  const r = Math.max(d, 7) + 2;
  const clampTo = (v: number, max: number): number => Math.max(1, Math.min(max - 2, v));
  return { x: q4(clampTo(c.x + Math.cos(a) * r, w.s.size.w)), y: q4(clampTo(c.y + Math.sin(a) * r, w.s.size.h)) };
}

/** Sit and stew: no work, no company, until the half day is out. */
export const Sulk: UtilityAction = {
  id: 'sulk', tags: ['rest'], minStage: 'adult', interruptible: true,
  isAvailable: (g) => onBreak(g, 'sulk'),
  score: () => SCORE,
  start(g, w) {
    const to = apartSpot(g, w);
    g.activity.target = to;
    g.activity.stage = 0;
    if (!planPath(w, g, to)) g.activity.path = [];
    return true;
  },
  step(g, w): StepResult {
    if (!onBreak(g, 'sulk')) return 'done';
    if (!arrive(g, w)) return 'running';
    faceToward(g, apartSpot(g, w)); // back to the village
    return 'running';
  },
};

/** Eat from the store, one bite after another, past being hungry. */
export const Binge: UtilityAction = {
  id: 'binge', tags: ['food'], minStage: 'adult', interruptible: true,
  isAvailable: (g) => onBreak(g, 'binge'),
  score: () => SCORE,
  start(g, w) {
    if (!stockFood(w.s)) { endBreak(w, g); return false; } // nothing to gorge on: it passes
    g.activity.target = { ...w.s.village.stockpilePos };
    g.activity.stage = 0;
    g.activity.progress = CFG.goblin.eatTicks;
    if (dist(g.pos, w.s.village.stockpilePos) < 0.9 || !planPath(w, g, w.s.village.stockpilePos)) g.activity.path = [];
    return true;
  },
  step(g, w): StepResult {
    if (!onBreak(g, 'binge')) return 'done';
    if (!arrive(g, w)) return 'running';
    if (--g.activity.progress > 0) return 'running';
    g.activity.progress = CFG.goblin.eatTicks;
    const f = stockFood(w.s);
    if (!f || g.activity.stage > B.bingeItems || g.needs.hunger >= 100) { endBreak(w, g); return 'done'; }
    const type = f.type;
    withdraw(w.s, type, 1);
    g.needs.hunger = q4(Math.min(100, g.needs.hunger + (itemDef(type).nutrition ?? 0)));
    g.deeds.eaten += 1;
    w.s.stats.eaten += 1;
    ateFood(w, g, type);
    w.emit({ type: 'item_eaten', goblinId: g.id, item: type, at: g.pos });
    g.activity.stage += 1;
    return 'running';
  },
};

/** Off out of the village for the day; it sits where the walk ended until the day is over, then comes home. */
export const WanderOff: UtilityAction = {
  id: 'wander_off', tags: ['rest'], minStage: 'adult', interruptible: true,
  isAvailable: (g) => onBreak(g, 'wander_off'),
  score: () => SCORE,
  start(g, w) {
    const to = g.moodBreak?.at ?? apartSpot(g, w);
    g.activity.target = { ...to };
    g.activity.stage = 0;
    if (!planPath(w, g, to)) g.activity.path = []; // no way there: sits it out where it is
    return true;
  },
  step(g, w): StepResult {
    if (!onBreak(g, 'wander_off')) return 'done';
    if (!arrive(g, w)) return 'running';
    if (w.s.tick % 120 === 0) g.facing = q4(g.facing + w.rng.range(-1, 1)); // gazing about
    return 'running';
  },
};
