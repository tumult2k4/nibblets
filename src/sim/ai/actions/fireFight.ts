/**
 * Fighting fire (§10.3, P6.2). `ExtinguishFire`: an adult goes to the edge of a nearby wildfire and stomps it out,
 * tile by tile (a bucket comes in P7); it takes `stomp` intensity off per tick, so a few goblins together beat a small
 * fire, and now and then it gets singed. Brave and industrious goblins take it on first, and everyone sooner when the
 * fire is close to the village. `EscapeFire`: anyone standing in the flames runs out of them, away from the fire.
 */
import { CFG } from '../../config';
import { clamp, dist, q4 } from '../../../shared/math';
import type { Vec2 } from '../../../shared/types';
import type { Fire, Goblin } from '../../state';
import type { World } from '../../world';
import type { UtilityAction } from '../action';
import { faceToward, moveAlong, planPath } from '../../steering';
import { isWalkable } from '../../grid';
import { hurtGoblin } from '../../combat';
import { needUrgency } from '../../goblin/needs';
import { burningAt, fireAt, nearestFire } from '../../wildfire';
import { wearTool } from '../../tools';
import { bucketOf } from './waterPlant';

const F = CFG.disasters.fire;

/** Caught in the flames, or right next to them, while doing something else (re-decide now). */
export const fireCaught = (g: Goblin, w: World): boolean =>
  w.s.fires.length > 0 && g.activity.action !== 'escape_fire' && g.activity.action !== 'extinguish_fire' && !!burningAt(w, g.pos);

/** An unburned, walkable tile next to the fire, the nearest to `g`. */
function edgeOf(f: Fire, g: Goblin, w: World): Vec2 | null {
  let best: Vec2 | null = null, bd = Infinity;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const x = f.x + dx, y = f.y + dy;
    if ((!dx && !dy) || fireAt(w, x, y) || !isWalkable(w.s, x, y)) continue;
    const p = { x: q4(f.x + 0.5 + dx * 0.85), y: q4(f.y + 0.5 + dy * 0.85) };
    const d = dist(p, g.pos);
    if (d < bd) { bd = d; best = p; }
  }
  return best;
}

const fighters = (w: World): number => w.s.goblins.filter((o) => o.activity.action === 'extinguish_fire').length;
/** The fire to fight: the nearest within range that has an open edge. */
function target(g: Goblin, w: World): Fire | null {
  const f = nearestFire(w, g.pos, F.fightRange);
  return f && edgeOf(f, g, w) ? f : null;
}
const nearVillage = (w: World, f: Fire): boolean => dist({ x: f.x, y: f.y }, w.s.village.center) <= CFG.world.villageRadius + F.villageAlarm;

export const ExtinguishFire: UtilityAction = {
  id: 'extinguish_fire', tags: ['danger'], minStage: 'adult', interruptible: (g) => g.activity.stage === 0,
  isAvailable: (g, w) => w.s.fires.length > 0 && g.health.hp > g.health.maxHp * 0.4 && !!target(g, w)
    && (g.activity.action === 'extinguish_fire' || fighters(w) < F.maxFighters),
  score(g, w) {
    const f = target(g, w)!;
    const busy = Math.max(needUrgency(g.needs.hunger), needUrgency(g.needs.thirst));
    const will = 0.5 + 0.5 * g.personality.bravery + 0.3 * g.personality.industry;
    return clamp((0.3 + (nearVillage(w, f) ? 0.45 : 0)) * will * (1 - busy), 0, 1.2);
  },
  start(g, w) {
    const f = target(g, w);
    const spot = f && edgeOf(f, g, w);
    if (!f || !spot) return false;
    g.activity.target = spot;
    g.activity.stage = 0;
    return planPath(w, g, spot);
  },
  step(g, w) {
    const a = g.activity;
    if (w.s.tick - a.startedTick > 1800) return 'done';
    if (a.stage === 0) {
      if (moveAlong(w, g) !== 'arrived') return 'running';
      a.stage = 1;
    }
    g.velocity = { x: 0, y: 0 };
    if (burningAt(w, g.pos)) return 'failed'; // the fire reached its own feet: get out (EscapeFire)
    // stomp the nearest burning tile within reach, then move on along the edge
    const f = nearestFire(w, g.pos, 1.6);
    if (!f) {
      const next = target(g, w);
      const spot = next && edgeOf(next, g, w);
      if (!spot || !planPath(w, g, spot)) return 'done';
      a.target = spot;
      a.stage = 0;
      return 'running';
    }
    faceToward(g, { x: f.x + 0.5, y: f.y + 0.5 });
    const bucket = bucketOf(g); // P7.2: water from a bucket puts it out three times as fast
    f.intensity = q4(Math.max(0, f.intensity - F.stomp * (bucket ? CFG.economy.bucket.fireMul : 1)));
    if (f.intensity <= 0) {
      f.fuel = 0;
      w.emit({ type: 'fire_stomped', goblinId: g.id, at: { x: f.x + 0.5, y: f.y + 0.5 } });
      if (bucket) wearTool(w, g, bucket);
    }
    if (w.s.tick % F.every === 0 && w.rng.chance(F.stompBurnChance * f.intensity)) hurtGoblin(w, g, F.stompBurn, 'fire');
    return 'running';
  },
};

export const EscapeFire: UtilityAction = {
  id: 'escape_fire', tags: ['danger'], minStage: 'hatchling', interruptible: false,
  isAvailable: (g, w) => w.s.fires.length > 0 && !!burningAt(w, g.pos),
  score: () => 1.4,
  start(g, w) {
    const f = burningAt(w, g.pos)!;
    // away from the fire's heart: the mean of the burning tiles close by
    const near = w.s.fires.filter((o) => Math.abs(o.x - f.x) <= 3 && Math.abs(o.y - f.y) <= 3);
    const cx = near.reduce((a, o) => a + o.x + 0.5, 0) / near.length, cy = near.reduce((a, o) => a + o.y + 0.5, 0) / near.length;
    const d = dist(g.pos, { x: cx, y: cy });
    // right at the heart: run upwind (the fire runs the other way)
    const back = w.s.weather.windDir + Math.PI;
    const ux = d > 0.3 ? (g.pos.x - cx) / d : Math.cos(back), uy = d > 0.3 ? (g.pos.y - cy) / d : Math.sin(back);
    for (const k of [4, 3, 2]) {
      const p = { x: q4(g.pos.x + ux * k), y: q4(g.pos.y + uy * k) };
      if (isWalkable(w.s, Math.floor(p.x), Math.floor(p.y)) && !burningAt(w, p)) {
        g.activity.target = p;
        w.emit({ type: 'emote', goblinId: g.id, emote: 'exclaim' });
        return planPath(w, g, p);
      }
    }
    return false;
  },
  step(g, w) {
    const r = moveAlong(w, g, CFG.combat.sprintMul);
    return r === 'arrived' || w.s.tick - g.activity.startedTick > 300 ? 'done' : 'running';
  },
};
