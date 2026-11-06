/**
 * `Teach` (§15.1, P5.5): a goblin who knows something a goblin nearby doesn't — a recipe or a fact, the rarest in the
 * village first — calls them over and shows them; both stay put for 300 ticks (elders teach 1.5× faster, younglings
 * learn 2× faster, and the teaching skill speeds it up). The learner must think well of the teacher (opinion ≥ 10).
 * Teaching trains `teaching`, warms both to each other, and feels good, which also keeps it to twice a day. The
 * learner's side runs as the same action in `stage` 2.
 */
import { CFG } from '../../config';
import { dist, q4 } from '../../../shared/math';
import type { ActionId, Goblin } from '../../state';
import type { World } from '../../world';
import type { UtilityAction } from '../action';
import { faceToward, moveAlong, planPath } from '../../steering';
import { needUrgency } from '../../goblin/needs';
import { addMood } from '../../goblin/mood';
import { isSleeping } from '../../goblin/goblin';
import { gainXp, skillSpeed } from '../../goblin/skills';
import { isKin, mutual, opinionOf } from '../../goblin/social';
import { knowers, knowsAny, learn, teachable } from '../../knowledge';
import { addReputation } from '../../mischief';

const K = CFG.knowledge;
const DAY = CFG.time.dayTicks;
/** What a goblin can be called away from for a lesson. */
const FREE: ReadonlySet<ActionId> = new Set(['idle', 'wander', 'warm_up', 'explore', 'play', 'learn']);
const pressed = (g: Goblin): boolean => Math.max(needUrgency(g.needs.hunger), needUrgency(g.needs.thirst), needUrgency(g.needs.energy)) > 0.5;
const free = (o: Goblin): boolean =>
  o.lifeStage !== 'hatchling' && !o.heldByGod && !o.airborne && !isSleeping(o) && !pressed(o) && (o.activity.status !== 'running' || FREE.has(o.activity.action));

/** What `g` would teach `o`: whatever fewest goblins in the village know. */
export function lesson(g: Goblin, o: Goblin, w: World): string | null {
  let best: string | null = null, bk = Infinity;
  for (const id of teachable(g)) {
    if (knowsAny(o, id)) continue;
    const k = knowers(w.s, id);
    if (k < bk) { bk = k; best = id; }
  }
  return best;
}

/** The best pupil within reach: kin first, then those it likes, then the closest. */
export function pupil(g: Goblin, w: World): Goblin | null {
  let best: Goblin | null = null, bs = -Infinity;
  for (const o of w.goblinHash.query(g.pos, K.teachRange)) {
    const d = dist(o.pos, g.pos);
    if (o === g || d > K.teachRange || !free(o) || opinionOf(o, g.id) < K.teachOpinion || !lesson(g, o, w)) continue;
    const sc = (isKin(g, o) ? 0.5 : 0) + opinionOf(g, o.id) * 0.01 + 1 - d / K.teachRange;
    if (sc > bs) { bs = sc; best = o; }
  }
  return best;
}

/** Ticks a lesson takes. */
export const lessonTicks = (g: Goblin, o: Goblin): number =>
  Math.round(K.teachTicks / ((g.lifeStage === 'elder' ? K.elderTeachMul : 1) * (o.lifeStage === 'youngling' ? K.younglingLearnMul : 1) * skillSpeed(g, 'teaching')));

const taughtLately = (g: Goblin): boolean => g.mood.modifiers.some((m) => m.id === 'taught');

export const Teach: UtilityAction = {
  id: 'teach', tags: ['social'], minStage: 'adult', interruptible: (g) => g.activity.stage === 0,
  isAvailable: (g, w) => !pressed(g) && !taughtLately(g) && teachable(g).length > 0 && !!pupil(g, w),
  cap: (g) => (pressed(g) || taughtLately(g) ? 0 : 1) * (K.teachScore[0] + K.teachScore[1] * g.personality.sociability + K.teachScore[2] * g.personality.industry + K.rareBonus + K.kinBonus),
  score(g, w) {
    const o = pupil(g, w)!;
    const id = lesson(g, o, w)!;
    const [base, soc, ind] = K.teachScore;
    return base + soc * g.personality.sociability + ind * g.personality.industry + (knowers(w.s, id) <= 2 ? K.rareBonus : 0) + (isKin(g, o) ? K.kinBonus : 0);
  },
  start(g, w) {
    const o = pupil(g, w);
    const id = o && lesson(g, o, w);
    if (!o || !id) return false;
    const a = g.activity;
    Object.assign(a, { targetId: o.id, stage: 0, lesson: id });
    o.activity = { action: 'teach', status: 'running', startedTick: w.s.tick, targetId: g.id, target: null, path: [], progress: 0, stage: 2, lesson: id };
    o.velocity = { x: 0, y: 0 };
    o.lastDecisionTick = w.s.tick;
    const d = Math.max(0.01, dist(g.pos, o.pos));
    return d < 1.3 || planPath(w, g, { x: q4(o.pos.x + ((g.pos.x - o.pos.x) / d) * 0.9), y: q4(o.pos.y + ((g.pos.y - o.pos.y) / d) * 0.9) });
  },
  step(g, w) {
    const a = g.activity;
    const o = a.targetId !== null ? w.goblin(a.targetId) : undefined;
    if (!o || o.activity.action !== 'teach' || o.activity.status !== 'running' || o.activity.targetId !== g.id) return a.stage === 2 ? 'done' : 'failed';
    if (a.stage === 2) { // the learner: face the teacher and pay attention
      g.velocity = { x: 0, y: 0 };
      faceToward(g, o.pos);
      return w.s.tick - a.startedTick > K.teachTicks * 2 + 300 ? 'done' : 'running';
    }
    if (a.stage === 0) {
      if (dist(g.pos, o.pos) > 1.3 && moveAlong(w, g) !== 'arrived') return w.s.tick - a.startedTick > 300 ? 'failed' : 'running';
      a.stage = 1;
      a.progress = 0;
    }
    g.velocity = { x: 0, y: 0 };
    faceToward(g, o.pos);
    faceToward(o, g.pos);
    if (++a.progress < lessonTicks(g, o)) return 'running';
    learn(w, o, a.lesson!, 'teach', g.id);
    gainXp(w, g, 'teaching', CFG.skills.xp.teach);
    addReputation(g, CFG.mischief.reputation.teach);
    mutual(w, g, o, 2);
    addMood(w, g, 'taught', K.teachMood, Math.round(K.teachCooldownDays * DAY));
    w.emit({ type: 'emote', goblinId: o.id, emote: 'idea' });
    o.activity.status = 'done';
    return 'done';
  },
};
