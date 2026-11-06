/**
 * Trinket actions (§12.1, P8.2). `HuntTrinket`: a curious or greedy goblin goes looking for something shiny at a
 * shore or among the rocks near the village (or straight to a glint a storm washed up) and rummages there a while;
 * now and then it turns something up. It feeds curiosity, and a youngling's fun. `Decorate`: carried trinkets go up
 * on the home's shelf (six at most), where they cheer whoever sleeps beneath them.
 */
import { CFG } from '../../config';
import { clamp, dist, q4 } from '../../../shared/math';
import type { Vec2 } from '../../../shared/types';
import type { Goblin } from '../../state';
import type { World } from '../../world';
import type { UtilityAction } from '../action';
import { faceToward, moveAlong, planPath } from '../../steering';
import { needUrgency } from '../../goblin/needs';
import { addMood } from '../../goblin/mood';
import { distanceFalloff } from '../considerations';
import { carried, decorate, giveTrinket, glintNear, rollRarity, shelfFor, shoreSpot } from '../../trinkets';
import { bedSpot } from './home';

const T = CFG.trinkets, H = T.hunt, DAY = CFG.time.dayTicks;

const pressed = (g: Goblin): boolean => Math.max(needUrgency(g.needs.hunger), needUrgency(g.needs.thirst), needUrgency(g.needs.energy)) > 0.5;
const rested = (g: Goblin, w: World): boolean => g.mood.modifiers.some((m) => m.id === 'searched' && m.expiresTick > w.s.tick);
/** greed (§13.5): mischief and gluttony */
export const greed = (g: Goblin): number => (g.personality.mischief + g.personality.gluttony) / 2;
const kid = (g: Goblin): boolean => g.lifeStage === 'youngling';

/** A spot to search: a rock pile or a shore within range of the village, picked when the search starts. */
function searchSpot(g: Goblin, w: World): Vec2 | null {
  const c = w.s.village.center;
  const rocks = w.s.rocks.filter((r) => dist(r.pos, c) <= H.range && dist(r.pos, g.pos) <= H.range * 1.5);
  if (rocks.length && w.rng.chance(0.5)) {
    const r = rocks[w.rng.int(0, rocks.length - 1)]!;
    const a = Math.atan2(g.pos.y - r.pos.y, g.pos.x - r.pos.x);
    return { x: q4(r.pos.x + Math.cos(a) * 0.9), y: q4(r.pos.y + Math.sin(a) * 0.9) };
  }
  return shoreSpot(w, c, H.range);
}

export const HuntTrinket: UtilityAction = {
  id: 'hunt_trinket', tags: ['fun'], minStage: 'youngling', interruptible: true,
  isAvailable: (g, w) => !pressed(g) && !rested(g, w) && !g.heldByGod
    && (g.needs.curiosity < H.wantBelow || (kid(g) && g.needs.fun < H.wantBelow) || !!glintNear(w, g, H.range)),
  score(g, w) {
    const want = Math.max(1 - g.needs.curiosity / 100, kid(g) ? 1 - g.needs.fun / 100 : 0);
    const glint = glintNear(w, g, H.range) ? 0.15 : 0;
    return q4(H.score * (0.4 + greed(g)) * (0.3 + want) + glint);
  },
  start(g, w) {
    const a = g.activity;
    const gl = glintNear(w, g, H.range);
    const to = gl ? gl.pos : searchSpot(g, w);
    if (!to || !planPath(w, g, to)) { addMood(w, g, 'searched', 0, Math.round(H.restDays * DAY / 4)); return false; }
    a.targetId = gl?.id ?? null;
    a.target = { ...to };
    a.stage = 0;
    a.progress = H.searchTicks;
    return true;
  },
  step(g, w) {
    const a = g.activity;
    if (a.stage === 0) {
      if (moveAlong(w, g) !== 'arrived') return 'running';
      a.stage = 1;
    }
    g.velocity = { x: 0, y: 0 };
    if (--a.progress > 0) return 'running';
    g.needs.curiosity = q4(clamp(g.needs.curiosity + H.curiosity, 0, 100));
    if (kid(g)) g.needs.fun = q4(clamp(g.needs.fun + H.fun, 0, 100));
    addMood(w, g, 'searched', 0, Math.round(H.restDays * DAY));
    const gl = a.targetId !== null ? (w.s.glints ?? []).find((x) => x.id === a.targetId) : undefined;
    if (gl) w.s.glints = w.s.glints!.filter((x) => x !== gl);
    if (gl || w.rng.chance(H.findChance)) {
      giveTrinket(w, g, gl?.rarity ?? rollRarity(w));
      addMood(w, g, 'found_shiny', 4, DAY / 2);
      w.emit({ type: 'emote', goblinId: g.id, emote: 'exclaim' });
    }
    return 'done';
  },
};

export const Decorate: UtilityAction = {
  id: 'decorate', tags: ['fun'], minStage: 'youngling', interruptible: true,
  isAvailable: (g, w) => !pressed(g) && !g.heldByGod && carried(g, w).length > 0 && !!shelfFor(g, w),
  cap: () => T.shelf.score,
  score: (g, w) => q4(T.shelf.score * Math.min(1, 0.5 + 0.25 * carried(g, w).length) * distanceFalloff(dist(g.pos, shelfFor(g, w)!.pos), 50)),
  start(g, w) {
    const b = shelfFor(g, w);
    if (!b) return false;
    g.activity.targetId = b.id;
    g.activity.target = bedSpot(b, g);
    g.activity.stage = 0;
    g.activity.progress = 40;
    return dist(g.pos, g.activity.target) < 0.5 || planPath(w, g, g.activity.target);
  },
  step(g, w) {
    const a = g.activity;
    const b = w.s.buildings.find((x) => x.id === a.targetId);
    if (!b) return 'failed';
    if (a.stage === 0) {
      if (a.path.length && moveAlong(w, g) !== 'arrived') return 'running';
      a.stage = 1;
    }
    g.velocity = { x: 0, y: 0 };
    faceToward(g, b.pos);
    if (--a.progress > 0) return 'running';
    return decorate(w, g, b) > 0 ? 'done' : 'failed';
  },
};
