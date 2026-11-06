/**
 * Courtship and eggs (§13.3, P5.3). `Court`: a goblin smitten with an unmated, unrelated friend goes to it, offers a
 * flower (if it has one) and dances; the friend's opinion decides whether it is welcome. Three welcome courtships,
 * none more than a day apart, make them mates. `LayEgg`: well-fed mates lay an egg at home (cooldown, soft cap).
 * `IncubateEgg`: a parent sits on its egg when the hut alone is too cold for it.
 */
import { CFG } from '../../config';
import { clamp, dist, q4 } from '../../../shared/math';
import type { Goblin } from '../../state';
import type { World } from '../../world';
import type { UtilityAction } from '../action';
import { faceToward, moveAlong, planPath } from '../../steering';
import { needUrgency } from '../../goblin/needs';
import { addMood } from '../../goblin/mood';
import { adjustOpinion, mutual, opinionOf, relate } from '../../goblin/social';
import { attraction, becomeMates, canLay, layEggs } from '../../goblin/family';
import { addItem, takeOne } from '../../inventory';
import { spawnGroundItem } from '../../groundItems';
import { ambientWarmth, nestSpot } from '../../eggs';
import { homeOf } from './home';
import { nurseryNear, nurseryNest } from '../../settlement';
import type { Building } from '../../state';
import { charm } from '../../clothing';
import { carried, passTrinket, trinketValue } from '../../trinkets';

const F = CFG.family, TR = CFG.trinkets;
const DAY = CFG.time.dayTicks;
const GIFTS = new Set(['flower_crown', 'flower', 'trinket']);

const awake = (g: Goblin): boolean => !g.heldByGod && !g.airborne && g.activity.action !== 'sleep_home' && g.activity.action !== 'sleep_ground';
const pressed = (g: Goblin): boolean => Math.max(needUrgency(g.needs.hunger), needUrgency(g.needs.thirst), needUrgency(g.needs.energy)) > 0.5;

/** The one `g` would court now: the most attractive within reach, not courted in the last two hours. */
export function suitor(g: Goblin, w: World): Goblin | null {
  let best: Goblin | null = null, bs = 0;
  for (const o of w.goblinHash.query(g.pos, F.courtRange)) {
    if (o.id === g.id || !awake(o) || dist(o.pos, g.pos) > F.courtRange) continue;
    if (w.s.tick - (relate(g, o.id).courtTick ?? -1e9) < F.courtCooldown) continue;
    const a = attraction(g, o, w) - dist(o.pos, g.pos) / 200;
    if (a > bs) { bs = a; best = o; }
  }
  return best;
}

/** Walk to `o`, re-planning when it has moved on; true once within reach, null if it can't be reached. */
function reach(g: Goblin, o: Goblin, w: World): boolean | null {
  const a = g.activity;
  if (dist(g.pos, o.pos) <= 1.1) return true;
  if (!a.target || dist(a.target, o.pos) > 1.5) {
    a.target = { ...o.pos };
    if (!planPath(w, g, o.pos)) return null;
  }
  moveAlong(w, g);
  return w.s.tick - a.startedTick > 700 ? null : false;
}

export const Court: UtilityAction = {
  id: 'court', tags: ['social'], minStage: 'adult', interruptible: (g) => g.activity.stage === 0,
  isAvailable: (g, w) => g.lifeStage === 'adult' && !pressed(g) && !!suitor(g, w),
  score: (g, w) => F.courtScore[0] + F.courtScore[1] * attraction(g, suitor(g, w)!, w),
  start(g, w) {
    const o = suitor(g, w);
    if (!o) return false;
    g.activity.targetId = o.id;
    g.activity.target = { ...o.pos };
    return dist(g.pos, o.pos) <= 1.1 || planPath(w, g, o.pos);
  },
  step(g, w) {
    const a = g.activity;
    const o = a.targetId !== null ? w.goblin(a.targetId) : undefined;
    if (!o || !awake(o)) return 'failed';
    if (a.stage === 0) {
      const r = reach(g, o, w);
      if (r === null) return 'failed';
      if (!r) return 'running';
      a.stage = 1;
      a.progress = 0;
      a.count = 0;
      // P8.2: a fresh courtship opens with a trinket if it has one to spare (the one it loves least), worth more to a hoarder
      const r0 = relate(g, o.id), fresh = !r0.court || w.s.tick - (r0.courtTick ?? -1e9) > DAY;
      const tr = fresh ? carried(g, w) : [];
      const gift = tr.length ? null : takeOne(g, (s) => GIFTS.has(s.type));
      if (tr.length) {
        const t = tr[tr.length - 1]!;
        passTrinket(w, t, g, o);
        a.count = 1 + Math.min(TR.courtMax, TR.courtPerValue * trinketValue(o, t));
        w.emit({ type: 'trinket_given', goblinId: g.id, toId: o.id, trinket: t.kind, at: { ...g.pos } });
      } else if (gift) {
        a.count = 1;
        if (!addItem(o, gift)) spawnGroundItem(w, gift, o.pos);
      }
      w.emit({ type: 'emote', goblinId: g.id, emote: 'heart' });
    }
    g.velocity = { x: 0, y: 0 };
    faceToward(g, o.pos);
    if (++a.progress < F.danceTicks) return 'running';
    // was it welcome? the other's opinion decides; a gift helps
    const rel = relate(g, o.id);
    if (w.s.tick - (rel.courtTick ?? -1e9) > DAY) rel.court = 0;
    rel.courtTick = w.s.tick;
    // a gift helps, and so does a flower crown (P5.6 charm)
    const p = clamp(F.welcome + (opinionOf(o, g.id) - CFG.social.friend) / 50 + (a.count ? F.giftWelcome + a.count - 1 : 0) + charm(g), 0.1, 0.95);
    const ok = w.rng.chance(p);
    if (ok) {
      rel.court = (rel.court ?? 0) + 1;
      mutual(w, g, o, F.courtOpinion);
      w.emit({ type: 'emote', goblinId: o.id, emote: 'heart' });
    } else {
      adjustOpinion(w, g, o, -1);
      w.emit({ type: 'emote', goblinId: g.id, emote: 'sweat' });
    }
    w.emit({ type: 'courted', aId: g.id, bId: o.id, success: ok, at: { ...o.pos } });
    if (ok && (rel.court ?? 0) >= F.courtSuccesses) becomeMates(w, g, o);
    return 'done';
  },
};

/** Where the egg goes: a nest in the nursery when there is one within reach of home (P7.3), else by the door. */
const layingSpot = (w: World, home: Building) => {
  const n = nurseryNear(w.s, home.pos);
  return n ? nurseryNest(w.s, n) : nestSpot(home);
};

export const LayEgg: UtilityAction = {
  id: 'lay_egg', tags: ['rest'], minStage: 'adult', interruptible: (g) => g.activity.stage === 0,
  isAvailable: (g, w) => !pressed(g) && !!canLay(g, w),
  score: (g, w) => ((g.fertileUntil ?? 0) > w.s.tick ? CFG.powers.fertileScore : F.layScore),
  start(g, w) {
    const b = homeOf(g, w);
    if (!b) return false;
    g.activity.targetId = b.id;
    g.activity.target = layingSpot(w, b);
    return planPath(w, g, g.activity.target);
  },
  step(g, w) {
    const a = g.activity;
    const b = homeOf(g, w);
    if (!b) return 'failed';
    if (a.stage === 0) {
      if (moveAlong(w, g) !== 'arrived') return 'running';
      a.stage = 1;
      a.progress = F.layTicks;
    }
    g.velocity = { x: 0, y: 0 };
    if (--a.progress > 0) return 'running';
    const m = canLay(g, w);
    if (!m) return 'failed';
    layEggs(w, g, m, a.target ?? nestSpot(b));
    for (const p of [g, m]) addMood(w, p, 'new_egg', F.eggMood, DAY);
    return 'done';
  },
};

/** One of `g`'s eggs that is getting cold and that no other parent is sitting on. */
export function coldEgg(g: Goblin, w: World): (typeof w.s.eggs)[number] | null {
  let best: (typeof w.s.eggs)[number] | null = null, bd: number = F.incubateRange;
  for (const e of w.s.eggs) {
    if (e.airborne || !e.parents.includes(g.id)) continue;
    if (ambientWarmth(w, e) >= 0.5) continue;
    const other = w.goblin(e.parents[0] === g.id ? e.parents[1] : e.parents[0]);
    if (other && other.activity.action === 'incubate_egg' && other.activity.targetId === e.id) continue;
    const d = dist(g.pos, e.pos);
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}

export const IncubateEgg: UtilityAction = {
  id: 'incubate_egg', tags: ['rest'], minStage: 'adult', interruptible: true,
  isAvailable: (g, w) => !pressed(g) && !!coldEgg(g, w),
  score: (g, w) => F.sitScore[0] + F.sitScore[1] * clamp(-coldEgg(g, w)!.incubation / DAY, 0, 1),
  start(g, w) {
    const e = coldEgg(g, w);
    if (!e) return false;
    g.activity.targetId = e.id;
    g.activity.target = { ...e.pos };
    return dist(g.pos, e.pos) < 0.5 || planPath(w, g, e.pos);
  },
  step(g, w) {
    const a = g.activity;
    const e = w.s.eggs.find((x) => x.id === a.targetId);
    if (!e || e.airborne) return 'failed';
    if (a.stage === 0) {
      if (dist(g.pos, e.pos) > 0.5 && moveAlong(w, g) !== 'arrived') return 'running';
      a.stage = 1;
      a.progress = 0;
      g.pos = { x: q4(e.pos.x), y: q4(e.pos.y - 0.05) };
    }
    g.velocity = { x: 0, y: 0 };
    // sit until the hut alone will do, or a few hours have passed, or something more pressing comes up
    return ++a.progress > F.sitTicks || pressed(g) || ambientWarmth(w, e) >= 0.5 ? 'done' : 'running';
  },
};
