/**
 * Kindnesses (§13.1, P5.1). `Comfort`: a goblin in good spirits goes to a sad friend or kin and hugs it (mood +10 for
 * half a day, its opinion of the comforter +10). `Gift`: a goblin with something to spare (food beyond its last bite,
 * a flower, a fine thing) brings it to a friend; the friend's opinion rises with the gift's value (more for food when
 * hungry, capped at +20). Both feed the social need on both sides.
 */
import { CFG } from '../../config';
import { clamp, dist, q4 } from '../../../shared/math';
import type { ItemStack, ItemType } from '../../../shared/types';
import type { Goblin } from '../../state';
import type { World } from '../../world';
import type { UtilityAction } from '../action';
import { faceToward, moveAlong, planPath } from '../../steering';
import { needUrgency } from '../../goblin/needs';
import { addMood } from '../../goblin/mood';
import { addSocial, adjustOpinion, isKin, opinionOf } from '../../goblin/social';
import { addItem, takeOne } from '../../inventory';
import { isFood, itemDef } from '../../items';
import { spawnGroundItem } from '../../groundItems';

const S = CFG.social;
const DAY = CFG.time.dayTicks;

const awake = (g: Goblin): boolean => !g.heldByGod && !g.airborne && g.activity.action !== 'sleep_home' && g.activity.action !== 'sleep_ground';
const pressed = (g: Goblin): boolean => Math.max(needUrgency(g.needs.hunger), needUrgency(g.needs.thirst), needUrgency(g.needs.energy)) > 0.5;
const has = (g: Goblin, id: string, tick: number): boolean => g.mood.modifiers.some((m) => m.id === id && m.expiresTick > tick);
const close = (g: Goblin, o: Goblin): boolean => isKin(g, o) || opinionOf(g, o.id) >= S.friend;

/** Walk to `o`, re-planning when it has moved on; true once within reach. */
export function reach(g: Goblin, o: Goblin, w: World): boolean | null {
  const a = g.activity;
  if (dist(g.pos, o.pos) <= 1.1) return true;
  if (!a.target || dist(a.target, o.pos) > 1.5) {
    a.target = { ...o.pos };
    if (!planPath(w, g, o.pos)) return null;
  }
  moveAlong(w, g);
  return w.s.tick - a.startedTick > 600 ? null : false;
}

// ---------------------------------------------------------------- Comfort

/** A sad friend or relative nearby that nobody has hugged lately. */
export function sadFriend(g: Goblin, w: World): Goblin | null {
  let best: Goblin | null = null, bd = Infinity;
  for (const o of w.goblinHash.query(g.pos, S.comfortRange)) {
    if (o.id === g.id || !awake(o) || o.mood.value >= S.sadBelow || has(o, 'comforted', w.s.tick) || !close(g, o)) continue;
    if (o.activity.action === 'flee' || o.activity.action === 'attack') continue;
    const d = dist(o.pos, g.pos);
    if (d < bd && d <= S.comfortRange) { bd = d; best = o; }
  }
  return best;
}

export const Comfort: UtilityAction = {
  id: 'comfort', tags: ['social'], minStage: 'youngling', interruptible: (g) => g.activity.stage === 0,
  isAvailable: (g, w) => g.mood.value > -10 && !pressed(g) && !!sadFriend(g, w),
  score: (g, w) => 0.3 + 0.3 * clamp(opinionOf(g, sadFriend(g, w)!.id) / 100, 0, 1),
  start(g, w) {
    const o = sadFriend(g, w);
    if (!o) return false;
    g.activity.targetId = o.id;
    g.activity.target = { ...o.pos };
    return dist(g.pos, o.pos) <= 1.1 || planPath(w, g, o.pos);
  },
  step(g, w) {
    const a = g.activity;
    const o = a.targetId !== null ? w.goblin(a.targetId) : undefined;
    if (!o || !awake(o) || has(o, 'comforted', w.s.tick)) return 'failed';
    if (a.stage === 0) {
      const r = reach(g, o, w);
      if (r === null) return 'failed';
      if (!r) return 'running';
      a.stage = 1;
      a.progress = 0;
      w.emit({ type: 'emote', goblinId: g.id, emote: 'heart' });
    }
    g.velocity = { x: 0, y: 0 };
    faceToward(g, o.pos);
    if (++a.progress < 30) return 'running';
    addMood(w, o, 'comforted', S.comfortMood, DAY / 2);
    adjustOpinion(w, o, g, S.comfortOpinion);
    adjustOpinion(w, g, o, 3);
    addSocial(g, S.comfortSocial);
    addSocial(o, S.comfortSocial);
    w.emit({ type: 'comforted', goblinId: o.id, byId: g.id, at: { ...o.pos } });
    w.emit({ type: 'emote', goblinId: o.id, emote: 'heart' });
    return 'done';
  },
};

// ---------------------------------------------------------------- Gift

/** Something `g` can spare: food beyond its last bite, else a flower or a non-tool keepsake. Tools stay. */
function spare(g: Goblin): ItemStack | null {
  const food = g.inventory.filter((s) => isFood(s.type));
  const nFood = food.reduce((a, s) => a + s.qty, 0);
  if (nFood >= 2) return [...food].sort((a, b) => itemDef(b.type).value - itemDef(a.type).value)[0]!;
  return g.inventory.find((s) => s.type === 'flower') ?? null;
}

/** Whom to give it to: a friend or relative (the hungry first when it's food) within reach, not too busy. */
function recipient(g: Goblin, w: World, item: ItemType): Goblin | null {
  let best: Goblin | null = null, bs = -Infinity;
  for (const o of w.goblinHash.query(g.pos, S.giftRange)) {
    if (o.id === g.id || !awake(o) || !close(g, o) || dist(o.pos, g.pos) > S.giftRange) continue;
    if (o.activity.action === 'flee' || o.activity.action === 'attack') continue;
    const sc = opinionOf(g, o.id) / 100 + (isFood(item) ? needUrgency(o.needs.hunger) : 0) - dist(o.pos, g.pos) / S.giftRange;
    if (sc > bs) { bs = sc; best = o; }
  }
  return best;
}

const giftPlan = (g: Goblin, w: World): { item: ItemStack; to: Goblin } | null => {
  if (has(g, 'gave_gift', w.s.tick)) return null;
  const item = spare(g);
  const to = item && recipient(g, w, item.type);
  return item && to ? { item, to } : null;
};

/** Opinion a gift earns (§13.1: value-scaled, capped at +20); food counts double for the hungry. */
export function giftValue(type: ItemType, to: Goblin): number {
  const v = itemDef(type).value * 3 * (isFood(type) && to.needs.hunger < 50 ? 2 : 1) + (type === 'flower' ? 4 : 0);
  return q4(clamp(v, 2, S.giftCap));
}

export const Gift: UtilityAction = {
  id: 'gift', tags: ['social'], minStage: 'youngling', interruptible: (g) => g.activity.stage === 0,
  isAvailable: (g, w) => !pressed(g) && !!giftPlan(g, w),
  score: (g, w) => 0.12 + 0.3 * needUrgency(giftPlan(g, w)!.to.needs.hunger) + 0.15 * needUrgency(g.needs.social),
  start(g, w) {
    const p = giftPlan(g, w);
    if (!p) return false;
    g.activity.targetId = p.to.id;
    g.activity.target = { ...p.to.pos };
    return dist(g.pos, p.to.pos) <= 1.1 || planPath(w, g, p.to.pos);
  },
  step(g, w) {
    const a = g.activity;
    const o = a.targetId !== null ? w.goblin(a.targetId) : undefined;
    if (!o || !awake(o)) return 'failed';
    const r = reach(g, o, w);
    if (r === null) return 'failed';
    if (!r) return 'running';
    const item = spare(g);
    const got = item && takeOne(g, (s) => s === item);
    if (!got) return 'failed';
    faceToward(g, o.pos);
    if (!addItem(o, got)) spawnGroundItem(w, got, o.pos); // hands full: set at its feet
    adjustOpinion(w, o, g, giftValue(got.type, o));
    adjustOpinion(w, g, o, 2);
    addSocial(g, S.giftSocial);
    addSocial(o, S.giftSocial);
    addMood(w, g, 'gave_gift', 2, DAY / 2);
    g.deeds.gifts++;
    w.emit({ type: 'gift_given', fromId: g.id, toId: o.id, item: got.type, at: { ...o.pos } });
    w.emit({ type: 'emote', goblinId: o.id, emote: 'heart' });
    return 'done';
  },
};
