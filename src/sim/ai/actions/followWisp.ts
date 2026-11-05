/**
 * `follow_wisp` (§14.1, P4.7): forced by a Night Wisp's lure. The goblin walks after the light in a daze, keeping a
 * step behind, until the wisp fades or is scattered, or a bite or the god's hand snaps it out. Coming to far from
 * home sours its mood for half a day.
 */
import { CFG } from '../../config';
import { dist } from '../../../shared/math';
import { faceToward, moveAlong, planPath } from '../../steering';
import { addMood } from '../../goblin/mood';
import type { UtilityAction } from '../action';

const W = CFG.enemies.night_wisp;

export const FollowWisp: UtilityAction = {
  id: 'follow_wisp', tags: ['danger'], minStage: 'youngling', interruptible: false, forced: true,
  isAvailable: () => false,
  score: () => 0,
  start(g) {
    g.activity.progress = 0;
    g.velocity = { x: 0, y: 0 };
    return true;
  },
  step(g, w) {
    const a = g.activity;
    const e = a.targetId !== null ? w.s.enemies.find((x) => x.id === a.targetId && x.kind === 'night_wisp') : undefined;
    if (!e) {
      addMood(w, g, 'wisp_trance', W.mood, CFG.time.dayTicks / 2);
      w.emit({ type: 'emote', goblinId: g.id, emote: 'question' });
      return 'done';
    }
    a.progress++;
    if (dist(g.pos, e.pos) <= W.followDist) {
      g.velocity = { x: 0, y: 0 };
      faceToward(g, e.pos);
      return 'running';
    }
    if (!a.path.length || (a.target && dist(a.target, e.pos) > 1)) {
      a.target = { ...e.pos };
      if (!planPath(w, g, e.pos)) { g.velocity = { x: 0, y: 0 }; faceToward(g, e.pos); return 'running'; }
    }
    moveAlong(w, g, 0.8);
    return 'running';
  },
};
