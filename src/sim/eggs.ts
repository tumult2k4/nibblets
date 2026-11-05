/**
 * Eggs (§13.3, P5.3): an egg needs two days of warmth to hatch. A parent's body (sitting on it or asleep beside it)
 * keeps it warm whatever the weather; otherwise a hut, a fire and the air have to do. Warm time counts up, cold time
 * counts down; a day in the red and the egg is lost. Held or flying eggs neither warm nor cool.
 */
import { CFG } from './config';
import { clamp, dist, q4 } from '../shared/math';
import type { Vec2 } from '../shared/types';
import type { Building, Egg } from './state';
import type { World } from './world';
import { airAt } from './temperature';
import { litFireNear } from './fire';
import { bodyWarm, hatch } from './goblin/family';

const F = CFG.family;
const DAY = CFG.time.dayTicks;
const EVERY = 10;

/** The finished hut an egg lies in or under the eaves of. */
export function eggHut(w: World, pos: Vec2): Building | undefined {
  return w.s.buildings.find((b) => b.buildProgress >= 1 && !!CFG.temperature.shelter[b.type] && dist(pos, b.pos) <= F.nestShelter);
}
export const eggShelter = (w: World, pos: Vec2): boolean => !!eggHut(w, pos);

/**
 * Where a hut's nest is: just outside the door under the thatch overhang, where the eaves keep it dry and the
 * family sleeping inside keeps it warm (and where you can see it). Matches the door's angle in the hut mesh.
 */
export function nestSpot(b: Building): Vec2 {
  const a = (b.rotation * Math.PI) / 2 + ((b.id * 0.37) % 0.6) - 0.3;
  return { x: q4(b.pos.x + Math.sin(a) * F.nestOffset), y: q4(b.pos.y + Math.cos(a) * F.nestOffset) };
}

/** Warmth without a parent's body (0..1): the air, plus a roof, plus a fire's glow. */
export function ambientWarmth(w: World, egg: Egg): number {
  const air = clamp((airAt(w, egg.pos) - F.coldAir) / F.airSpan, 0, F.airMax);
  return q4(air + (eggShelter(w, egg.pos) ? F.shelterWarmth : 0) + (litFireNear(w, egg.pos, F.fireRange) ? F.fireWarmth : 0));
}

export function loseEgg(w: World, egg: Egg, cause: 'cold' | 'eaten' | 'neglect' | 'fall'): void {
  const i = w.s.eggs.indexOf(egg);
  if (i < 0) return;
  w.s.eggs.splice(i, 1);
  w.emit({ type: 'egg_lost', eggId: egg.id, parents: egg.parents, cause, at: { ...egg.pos } });
}

/** §6 step 10b: warm or chill every egg (every 10 ticks); hatch the ready, lose the frozen. */
export function updateEggs(w: World): void {
  if (w.s.tick % EVERY !== 0 || !w.s.eggs.length) return;
  for (const egg of [...w.s.eggs]) {
    if (egg.airborne) continue;
    egg.warmth = bodyWarm(w, egg) ? 1 : ambientWarmth(w, egg);
    egg.incubation += egg.warmth >= 0.5 ? EVERY : -EVERY * F.coldRate * (1 - egg.warmth / 0.5);
    if (egg.incubation >= F.incubateDays * DAY) hatch(w, egg);
    else if (egg.incubation <= -F.lostColdDays * DAY) loseEgg(w, egg, 'cold');
  }
}

/** Is a parent sitting on it, or is anyone awake close by to guard it? */
export function guarded(w: World, egg: Egg): boolean {
  for (const o of w.goblinHash.query(egg.pos, CFG.enemies.loneRadius)) {
    if (o.lifeStage !== 'adult' || dist(o.pos, egg.pos) > CFG.enemies.loneRadius) continue;
    const a = o.activity.action;
    if (a !== 'sleep_home' && a !== 'sleep_ground') return true;
  }
  return false;
}
