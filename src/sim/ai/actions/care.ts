/**
 * Care (§14.3, P6.1). `RestSick`: a goblin showing a disease (or badly hurt) lies down, in its hut if it has one
 * nearby, and gets better faster while it does (wounds ×2, illness ×1.5). `TendSick`: a friend or relative sits with
 * a sick or hurt goblin for an hour; for a day after, its wounds and illness heal ×1.5, and the patient thinks better
 * of the tender. Sitting close to someone with a contact disease is how carers catch it, too.
 */
import { CFG } from '../../config';
import { clamp, dist, q4 } from '../../../shared/math';
import type { Goblin } from '../../state';
import type { World } from '../../world';
import type { UtilityAction } from '../action';
import { faceToward, moveAlong, planPath } from '../../steering';
import { perDay } from '../../time';
import { needUrgency } from '../../goblin/needs';
import { addSocial, adjustOpinion, isKin, opinionOf } from '../../goblin/social';
import { isComplete } from '../../buildings';
import { isSick, sickness } from '../../disease';
import { bedSpot, homeOf } from './home';
import { reach } from './kindness';

const H = CFG.health;
const DAY = CFG.time.dayTicks;

/** Badly enough hurt to want to lie down: wounded and under half its hp. */
const hurt = (g: Goblin): boolean => g.health.injuries.length > 0 && g.health.hp < H.restHurtBelow * g.health.maxHp;
const ailing = (g: Goblin): boolean => isSick(g) || hurt(g);

// ---------------------------------------------------------------- RestSick

export const RestSick: UtilityAction = {
  id: 'rest_sick', tags: ['rest'], minStage: 'hatchling', interruptible: true,
  isAvailable: (g) => !g.heldByGod && ailing(g),
  score: (g) => Math.max(sickness(g)?.rest ?? 0, hurt(g) ? H.restHurt : 0),
  start(g, w) {
    const home = homeOf(g, w), a = g.activity;
    a.stage = 0;
    a.progress = H.restTicks;
    if (home && isComplete(home) && dist(home.pos, g.pos) < 30 && planPath(w, g, bedSpot(home, g))) return true;
    a.stage = 1; // nowhere to go: lie down where it is
    return true;
  },
  step(g, w) {
    const a = g.activity;
    if (a.stage === 0) {
      if (moveAlong(w, g) !== 'arrived') return 'running';
      a.stage = 1;
    }
    g.velocity = { x: 0, y: 0 };
    g.needs.energy = q4(Math.min(100, g.needs.energy + perDay(CFG.goblin.sleepRestorePerDay.ground) * 0.5));
    return --a.progress > 0 && ailing(g) ? 'running' : 'done';
  },
};

// ---------------------------------------------------------------- TendSick

const pressed = (g: Goblin): boolean => Math.max(needUrgency(g.needs.hunger), needUrgency(g.needs.thirst), needUrgency(g.needs.energy)) > 0.5;

/** A sick or hurt friend or relative close by that nobody has tended today and nobody is tending now. */
export function patientFor(g: Goblin, w: World): Goblin | null {
  let best: Goblin | null = null, bs = -Infinity;
  for (const o of w.goblinHash.query(g.pos, H.tendRange)) {
    if (o === g || o.heldByGod || !ailing(o) || o.health.tendedUntil > w.s.tick || dist(o.pos, g.pos) > H.tendRange) continue;
    const op = opinionOf(g, o.id);
    if (!isKin(g, o) && op < H.tendOpinion) continue;
    if (w.s.goblins.some((x) => x !== g && x.activity.action === 'tend_sick' && x.activity.targetId === o.id)) continue;
    const sc = op / 100 + (isKin(g, o) ? 0.5 : 0) - dist(o.pos, g.pos) / H.tendRange;
    if (sc > bs) { bs = sc; best = o; }
  }
  return best;
}

export const TendSick: UtilityAction = {
  id: 'tend_sick', tags: ['social'], minStage: 'adult', interruptible: (g) => g.activity.stage === 0,
  isAvailable: (g, w) => !isSick(g) && !pressed(g) && !!patientFor(g, w),
  score: (g, w) => {
    const o = patientFor(g, w)!;
    return H.tendBase + 0.25 * clamp(opinionOf(g, o.id) / 100, 0, 1) + (isKin(g, o) ? 0.1 : 0) + (sickness(o)?.rest ?? 0.3) * 0.2;
  },
  start(g, w) {
    const o = patientFor(g, w);
    if (!o) return false;
    g.activity.targetId = o.id;
    g.activity.target = { ...o.pos };
    g.activity.stage = 0;
    return dist(g.pos, o.pos) <= 1.1 || planPath(w, g, o.pos);
  },
  step(g, w) {
    const a = g.activity;
    const o = a.targetId !== null ? w.goblin(a.targetId) : undefined;
    if (!o || o.heldByGod || !ailing(o)) return 'failed';
    if (a.stage === 0) {
      const r = reach(g, o, w);
      if (r === null) return 'failed';
      if (!r) return 'running';
      a.stage = 1;
      a.progress = 0;
    }
    g.velocity = { x: 0, y: 0 };
    faceToward(g, o.pos);
    if (++a.progress < H.tendTicks) return 'running';
    o.health.tendedUntil = w.s.tick + H.tendDays * DAY;
    adjustOpinion(w, o, g, H.tendOpinionGain);
    adjustOpinion(w, g, o, 2);
    addSocial(g, 10);
    addSocial(o, 10);
    w.emit({ type: 'tended', goblinId: o.id, byId: g.id, at: { ...o.pos } });
    w.emit({ type: 'emote', goblinId: o.id, emote: 'heart' });
    return 'done';
  },
};
