/**
 * The chief's justice and an exile's road (§13.5, P8.4). `Judge`: the chief walks up to a thief of poor name whose
 * theft is known and not put right, and pronounces (leadership.ts). `Exile`: while sent away, a goblin inside the
 * village heads out to a camp beyond its edge; what else it may do meanwhile is limited to living off the land.
 */
import { CFG } from '../../config';
import { dist, q4 } from '../../../shared/math';
import type { Vec2 } from '../../../shared/types';
import type { Goblin } from '../../state';
import type { World } from '../../world';
import type { UtilityAction } from '../action';
import { faceToward, moveAlong, planPath } from '../../steering';
import { needUrgency } from '../../goblin/needs';
import { isWalkable } from '../../grid';
import { culprit, exileRadius, isExiled, pronounce } from '../../leadership';
import { reach } from './kindness';

const J = CFG.leadership.justice;
const pressed = (g: Goblin): boolean => Math.max(needUrgency(g.needs.hunger), needUrgency(g.needs.thirst), needUrgency(g.needs.energy)) > 0.5;

export const Judge: UtilityAction = {
  id: 'judge', tags: ['work'], minStage: 'adult', interruptible: (g) => g.activity.stage === 0,
  isAvailable: (g, w) => g.role === 'chief' && w.s.village.chiefId === g.id && !pressed(g) && !g.heldByGod && !isExiled(g, w) && !!culprit(g, w),
  score: () => J.score,
  start(g, w) {
    const c = culprit(g, w);
    if (!c) return false;
    g.activity.targetId = c.o.id;
    g.activity.target = { ...c.o.pos };
    g.activity.stage = 0;
    g.activity.progress = 0;
    return dist(g.pos, c.o.pos) <= 1.1 || planPath(w, g, c.o.pos);
  },
  step(g, w) {
    const a = g.activity;
    const o = a.targetId !== null ? w.goblin(a.targetId) : undefined;
    const gu = o?.guilt?.find((x) => x.known && !x.settled && !x.ordered);
    if (!o || !gu || isExiled(o, w) || o.heldByGod) return 'failed';
    if (a.stage === 0) {
      const r = reach(g, o, w);
      if (r === null) return 'failed';
      if (!r) return 'running';
      a.stage = 1;
      w.emit({ type: 'emote', goblinId: g.id, emote: 'exclaim' });
    }
    g.velocity = { x: 0, y: 0 };
    faceToward(g, o.pos);
    faceToward(o, g.pos);
    if (++a.progress < J.talkTicks) return 'running';
    pronounce(w, g, o, gu);
    return 'done';
  },
};

/** A camp spot past the village's edge, on the side the exile is on. */
function campSpot(g: Goblin, w: World): Vec2 | null {
  const c = w.s.village.center, r = exileRadius() + 2;
  const a0 = Math.atan2(g.pos.y - c.y, g.pos.x - c.x) || g.id;
  for (let k = 0; k < 16; k++) {
    const a = a0 + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.4;
    const p = { x: q4(c.x + Math.cos(a) * r), y: q4(c.y + Math.sin(a) * r) };
    if (isWalkable(w.s, p.x, p.y)) return p;
  }
  return null;
}

export const Exile: UtilityAction = {
  id: 'exile', tags: ['rest'], minStage: 'youngling', interruptible: false,
  isAvailable: (g, w) => isExiled(g, w) && !g.heldByGod && dist(g.pos, w.s.village.center) < exileRadius(),
  score: () => J.campScore,
  start(g, w) {
    const p = campSpot(g, w);
    if (!p) return false;
    g.activity.target = p;
    return planPath(w, g, p);
  },
  step(g, w) {
    return moveAlong(w, g) === 'arrived' || !isExiled(g, w) ? 'done' : 'running';
  },
};
