/**
 * Childhood (§13.3, P5.4). Younglings `Play`: tag with another youngling (whoever is "it" chases; a catch swaps the
 * roles after a count of three), or alone, hide-and-peek behind a bush near home. Both fill the fun need. And they
 * `Learn` by sitting close to an adult at skilled work and watching: a quarter of the worker's XP rubs off on them
 * (see `gainXp`), and it feeds their curiosity.
 */
import { CFG } from '../../config';
import { dist, q4 } from '../../../shared/math';
import type { Vec2 } from '../../../shared/types';
import type { ActionId, Goblin } from '../../state';
import type { World } from '../../world';
import type { UtilityAction } from '../action';
import { faceToward, moveAlong, planPath } from '../../steering';
import { isWalkable } from '../../grid';
import { goblinSpeed } from '../../goblin/goblin';
import { needUrgency } from '../../goblin/needs';
import { addSocial, adjustOpinion, isKin, opinionOf } from '../../goblin/social';
import { ACTION_SKILL, skillLevel } from '../../goblin/skills';
import { homeOf } from './home';

const L = CFG.life;
/** What a youngling can be called away from to play. */
const FREE: ReadonlySet<ActionId> = new Set(['idle', 'wander', 'explore']);
const pressed = (g: Goblin): boolean => Math.max(needUrgency(g.needs.hunger), needUrgency(g.needs.thirst), needUrgency(g.needs.energy)) > 0.5;
const playful = (g: Goblin): boolean =>
  g.lifeStage === 'youngling' && !g.heldByGod && !g.airborne && !pressed(g) && g.needs.energy > L.playEnergy;

/** Another youngling free to play, friends and siblings first. */
export function playmate(g: Goblin, w: World): Goblin | null {
  let best: Goblin | null = null, bs = -Infinity;
  for (const o of w.goblinHash.query(g.pos, L.playRange)) {
    if (o.id === g.id || !playful(o) || o.needs.fun >= 90 || (o.activity.status === 'running' && !FREE.has(o.activity.action))) continue;
    const d = dist(o.pos, g.pos);
    if (d > L.playRange || opinionOf(o, g.id) <= CFG.social.rival) continue;
    const sc = opinionOf(g, o.id) * 0.02 + (isKin(g, o) ? 0.3 : 0) + 1 - d / L.playRange;
    if (sc > bs) { bs = sc; best = o; }
  }
  return best;
}

/** Run straight for `to` (no pathfinding: a short sprint on open ground), swerving round anything in the way. */
function dash(w: World, g: Goblin, to: Vec2, mul: number): void {
  const dx = to.x - g.pos.x, dy = to.y - g.pos.y, d = Math.hypot(dx, dy);
  const step = Math.min(goblinSpeed(g) * mul, d);
  if (step < 1e-3) { g.velocity = { x: 0, y: 0 }; return; }
  const a0 = Math.atan2(dy, dx);
  for (const turn of [0, 0.6, -0.6, 1.2, -1.2, 1.8, -1.8]) {
    const a = a0 + turn, nx = q4(g.pos.x + Math.cos(a) * step), ny = q4(g.pos.y + Math.sin(a) * step);
    if (!isWalkable(w.s, Math.floor(nx), Math.floor(ny))) continue;
    g.velocity = { x: q4(nx - g.pos.x), y: q4(ny - g.pos.y) };
    g.pos = { x: nx, y: ny };
    g.facing = q4(a);
    return;
  }
  g.velocity = { x: 0, y: 0 };
}

/** Where a runner heads: away from "it", zig-zagging, and back toward the middle of the game when it strays. */
function escape(g: Goblin, it: Goblin, center: Vec2, tick: number): Vec2 {
  const d = Math.max(0.01, dist(g.pos, it.pos));
  let x = (g.pos.x - it.pos.x) / d, y = (g.pos.y - it.pos.y) / d;
  const zig = Math.sin(tick * 0.08 + g.id) * 0.7;
  [x, y] = [x - y * zig, y + x * zig];
  const dc = dist(g.pos, center);
  if (dc > L.playRadius) { x += ((center.x - g.pos.x) / dc) * 1.5; y += ((center.y - g.pos.y) / dc) * 1.5; }
  return { x: g.pos.x + x * 2, y: g.pos.y + y * 2 };
}

/** A spot just behind a bush or tree near home, on the side away from the village. */
function hidingSpot(g: Goblin, w: World): Vec2 | null {
  const c = homeOf(g, w)?.pos ?? w.s.village.center;
  const ps = w.plantHash.query(c, L.hideRange, (p) => p.kind !== 'flower' && (p.stage === 'young' || p.stage === 'mature' || p.stage === 'old'));
  if (!ps.length) return null;
  const p = ps[w.rng.int(0, ps.length - 1)]!;
  const v = w.s.village.center, d = Math.max(0.01, dist(p.pos, v));
  const spot = { x: q4(p.pos.x + ((p.pos.x - v.x) / d) * 0.7), y: q4(p.pos.y + ((p.pos.y - v.y) / d) * 0.7) };
  return isWalkable(w.s, Math.floor(spot.x), Math.floor(spot.y)) ? spot : null;
}

const fun = (g: Goblin, k: number): void => { g.needs.fun = q4(Math.min(100, g.needs.fun + L.playFun * k)); };

/** Stages: 1 = "it" (chasing), 2 = running away, 3 = walking to a hiding spot, 4 = hiding. */
export const Play: UtilityAction = {
  id: 'play', tags: ['fun'], minStage: 'youngling', interruptible: true,
  isAvailable: (g) => playful(g) && g.needs.fun < 90,
  score: (g, w) => L.playScore[0] + L.playScore[1] * needUrgency(g.needs.fun) + (playmate(g, w) ? 0.1 : 0),
  start(g, w) {
    const a = g.activity;
    const o = playmate(g, w);
    if (o) {
      const center = { x: q4((g.pos.x + o.pos.x) / 2), y: q4((g.pos.y + o.pos.y) / 2) };
      Object.assign(a, { targetId: o.id, target: center, stage: 1, count: w.s.tick + L.freezeTicks });
      o.activity = { action: 'play', status: 'running', startedTick: w.s.tick, targetId: g.id, target: { ...center }, path: [], progress: 0, stage: 2 };
      o.lastDecisionTick = w.s.tick;
      w.emit({ type: 'emote', goblinId: g.id, emote: 'exclaim' });
      return true;
    }
    const spot = hidingSpot(g, w);
    if (!spot) return false;
    a.stage = 3;
    a.target = spot;
    return planPath(w, g, spot);
  },
  step(g, w) {
    const a = g.activity, t = w.s.tick;
    if (a.stage >= 3) { // hide-and-peek alone
      if (a.stage === 3) {
        if (moveAlong(w, g) !== 'arrived') return t - a.startedTick > 400 ? 'failed' : 'running';
        a.stage = 4;
        a.progress = w.rng.int(L.hideTicks[0], L.hideTicks[1]);
      }
      g.velocity = { x: 0, y: 0 };
      fun(g, L.soloFunMul);
      if (--a.progress > 0) return 'running';
      w.emit({ type: 'emote', goblinId: g.id, emote: 'music' });
      return 'done';
    }
    const o = a.targetId !== null ? w.goblin(a.targetId) : undefined;
    const linked = !!o && o.activity.action === 'play' && o.activity.status === 'running' && o.activity.targetId === g.id;
    if (!linked || t - a.startedTick > L.playTicks || pressed(g)) {
      if (o) { adjustOpinion(w, g, o, L.playOpinion); addSocial(g, L.playSocial); }
      return 'done';
    }
    fun(g, 1);
    if (a.stage === 2) { dash(w, g, escape(g, o, a.target ?? g.pos, t), L.runnerMul); return 'running'; }
    if (t < (a.count ?? 0)) { g.velocity = { x: 0, y: 0 }; faceToward(g, o.pos); return 'running'; } // counting to three
    dash(w, g, o.pos, L.chaserMul);
    if (dist(g.pos, o.pos) < L.catchDist) { // tag! you're it
      a.stage = 2;
      o.activity.stage = 1;
      o.activity.count = t + L.freezeTicks;
      w.emit({ type: 'emote', goblinId: o.id, emote: 'exclaim' });
    }
    return 'running';
  },
};

/** An adult hard at skilled work close by, to watch: parents first, then the most skilled. */
export function mentor(g: Goblin, w: World): Goblin | null {
  let best: Goblin | null = null, bs = -Infinity;
  for (const o of w.goblinHash.query(g.pos, L.learnRange)) {
    if ((o.lifeStage !== 'adult' && o.lifeStage !== 'elder') || o.activity.status !== 'running') continue;
    const sk = ACTION_SKILL[o.activity.action];
    const d = dist(o.pos, g.pos);
    if (!sk || sk === 'combat' || d > L.learnRange) continue; // nobody brings the children to a fight
    const sc = (isKin(g, o) ? 0.5 : 0) + 0.05 * skillLevel(o, sk) + 1 - d / L.learnRange;
    if (sc > bs) { bs = sc; best = o; }
  }
  return best;
}

const watchSpot = (g: Goblin, o: Goblin): Vec2 => {
  const d = Math.max(0.01, dist(g.pos, o.pos));
  return { x: q4(o.pos.x + ((g.pos.x - o.pos.x) / d) * L.learnDist), y: q4(o.pos.y + ((g.pos.y - o.pos.y) / d) * L.learnDist) };
};

/** Stages: 0 = going over, 1 = sitting and watching. */
export const Learn: UtilityAction = {
  id: 'learn', tags: ['fun'], minStage: 'youngling', interruptible: true,
  isAvailable: (g, w) => g.lifeStage === 'youngling' && !pressed(g) && g.needs.energy > L.playEnergy && !!mentor(g, w),
  score: (g) => L.learnScore[0] + L.learnScore[1] * g.personality.industry + L.learnScore[2] * needUrgency(g.needs.curiosity),
  start(g, w) {
    const o = mentor(g, w);
    if (!o) return false;
    g.activity.targetId = o.id;
    g.activity.stage = 0;
    return dist(g.pos, o.pos) <= L.learnDist + 0.3 || planPath(w, g, watchSpot(g, o));
  },
  step(g, w) {
    const a = g.activity;
    const o = a.targetId !== null ? w.goblin(a.targetId) : undefined;
    const sk = o && o.activity.status === 'running' ? ACTION_SKILL[o.activity.action] : undefined;
    const busy = !!sk && sk !== 'combat';
    if (!o || !busy || w.s.tick - a.startedTick > L.learnTicks) return a.stage === 1 ? 'done' : 'failed';
    if (dist(g.pos, o.pos) > L.learnDist + 1.2) {
      if (a.stage === 1 || !a.path.length) { a.stage = 0; if (!planPath(w, g, watchSpot(g, o))) return 'failed'; }
      moveAlong(w, g);
      return 'running';
    }
    a.stage = 1;
    g.velocity = { x: 0, y: 0 };
    faceToward(g, o.pos);
    g.needs.curiosity = q4(Math.min(100, g.needs.curiosity + L.learnCuriosity));
    return 'running';
  },
};
