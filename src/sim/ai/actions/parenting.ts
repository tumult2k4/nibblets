/**
 * Parenting (§13.3 childhood, P5.3): hatchlings can't pick or hold food, so a parent brings it — from its own pack or
 * from the village stockpile — and feeds them from its hand (`FeedChild`); and a hatchling toddles after the closer parent (`FollowParent`).
 */
import { CFG } from '../../config';
import { dist, q4 } from '../../../shared/math';
import type { ItemType } from '../../../shared/types';
import type { Goblin } from '../../state';
import type { World } from '../../world';
import type { UtilityAction } from '../action';
import { faceToward, moveAlong, planPath } from '../../steering';
import { needUrgency } from '../../goblin/needs';
import { addSocial, adjustOpinion } from '../../goblin/social';
import { nearestParent } from '../../goblin/family';
import { addItem, foodStack, takeOne } from '../../inventory';
import { isFood, itemDef } from '../../items';
import { stockFood, withdraw } from '../../stockpile';
import { spawnGroundItem } from '../../groundItems';

const F = CFG.family;
const young = (g: Goblin): boolean => g.lifeStage === 'hatchling' || g.lifeStage === 'youngling';
const pressed = (g: Goblin): boolean => Math.max(needUrgency(g.needs.hunger), needUrgency(g.needs.thirst), needUrgency(g.needs.energy)) > 0.5;

/** A hungry child of `g` with nothing to eat, that nobody is already bringing food to. */
export function hungryChild(g: Goblin, w: World): Goblin | null {
  let best: Goblin | null = null, bh: number = F.feedBelow;
  for (const r of g.relationships) {
    if (r.bond !== 'child') continue;
    const c = w.goblin(r.targetId);
    if (!c || !young(c) || c.needs.hunger >= bh || foodStack(c) || c.heldByGod) continue;
    if (w.s.goblins.some((o) => o.id !== g.id && o.activity.action === 'feed_child' && o.activity.targetId === c.id)) continue;
    bh = c.needs.hunger;
    best = c;
  }
  return best;
}

const hasFood = (g: Goblin, w: World): boolean => !!foodStack(g) || !!stockFood(w.s);

export const FeedChild: UtilityAction = {
  id: 'feed_child', tags: ['food'], minStage: 'adult', interruptible: (g) => g.activity.stage !== 2,
  isAvailable: (g, w) => !pressed(g) && hasFood(g, w) && !!hungryChild(g, w),
  score: (g, w) => F.feedScore[0] + F.feedScore[1] * needUrgency(hungryChild(g, w)!.needs.hunger),
  start(g, w) {
    const c = hungryChild(g, w);
    if (!c) return false;
    const a = g.activity;
    a.targetId = c.id;
    if (foodStack(g)) { a.stage = 1; a.target = { ...c.pos }; return planPath(w, g, c.pos) || dist(g.pos, c.pos) < 1.1; }
    a.stage = 0;
    return planPath(w, g, w.s.village.stockpilePos);
  },
  step(g, w) {
    const a = g.activity;
    const c = a.targetId !== null ? w.goblin(a.targetId) : undefined;
    if (!c || !young(c)) return 'failed';
    if (a.stage === 0) { // fetch a bite from the stockpile
      if (moveAlong(w, g) !== 'arrived') return 'running';
      const f = stockFood(w.s);
      if (!f) return 'failed';
      const type: ItemType = f.type;
      if (!withdraw(w.s, type, 1)) return 'failed';
      if (!addItem(g, { type, qty: 1 })) { spawnGroundItem(w, { type, qty: 1 }, g.pos); return 'failed'; }
      a.stage = 1;
      a.target = { ...c.pos };
      if (!planPath(w, g, c.pos)) return 'failed';
      return 'running';
    }
    if (dist(g.pos, c.pos) > 1.1) {
      if (a.target && dist(a.target, c.pos) > 1.5) { a.target = { ...c.pos }; if (!planPath(w, g, c.pos)) return 'failed'; }
      moveAlong(w, g);
      return w.s.tick - a.startedTick > 900 ? 'failed' : 'running';
    }
    faceToward(g, c.pos);
    const food = takeOne(g, (s) => isFood(s.type) && s.type !== 'apple_core');
    if (!food) return 'failed';
    // fed from the parent's hand (a hatchling can't hold anything): a half portion for the smallest, as at Eat
    const nut = (itemDef(food.type).nutrition ?? 0) * (c.lifeStage === 'hatchling' ? 0.5 : 1);
    c.needs.hunger = q4(Math.min(100, c.needs.hunger + nut));
    c.deeds.eaten += 1;
    w.s.stats.eaten += 1;
    w.emit({ type: 'item_eaten', goblinId: c.id, item: food.type, at: { ...c.pos } });
    adjustOpinion(w, c, g, 2);
    addSocial(g, 4);
    addSocial(c, 6);
    w.emit({ type: 'emote', goblinId: c.id, emote: 'heart' });
    return 'done';
  },
};

export const FollowParent: UtilityAction = {
  id: 'follow_parent', tags: ['rest'], minStage: 'hatchling', interruptible: true,
  isAvailable: (g, w) => {
    if (g.lifeStage !== 'hatchling') return false;
    const p = nearestParent(g, w);
    return !!p && !p.heldByGod && dist(p.pos, g.pos) > F.followDist;
  },
  score: (g, w) => F.followScore + 0.2 * Math.min(1, dist(nearestParent(g, w)!.pos, g.pos) / 12),
  start(g, w) {
    const p = nearestParent(g, w);
    if (!p) return false;
    g.activity.targetId = p.id;
    g.activity.target = { ...p.pos };
    return planPath(w, g, p.pos);
  },
  step(g, w) {
    const a = g.activity;
    const p = a.targetId !== null ? w.goblin(a.targetId) : undefined;
    if (!p) return 'failed';
    if (dist(p.pos, g.pos) <= F.followDist * 0.5) return 'done';
    if (a.target && dist(a.target, p.pos) > 2) { a.target = { ...p.pos }; if (!planPath(w, g, p.pos)) return 'failed'; }
    moveAlong(w, g);
    return w.s.tick - a.startedTick > 600 ? 'done' : 'running';
  },
};
