/**
 * Blight (§14.4, P6.3). In damp times (spring, autumn, or after a rainy day) an apple bush near the village may catch
 * it. A blighted bush bears less (its fruit cap is cut by `blight` × 100%), browns, and gets worse each day, faster
 * when damp; at 1 it dies, and whoever sees that learns `blight_spreads`. Each day it may pass to an apple bush close
 * by (less on fresh ash). Farmers (skill ≥ 3) and those who know the fact cut sick bushes out (`CullBlight`) first.
 */
import { CFG } from './config';
import { dist, q4 } from '../shared/math';
import { tileAt } from './grid';
import { maxFruit, removePlant } from './plants';
import { witnessFact } from './knowledge';
import type { Plant } from './state';
import type { World } from './world';

const B = CFG.disasters.blight;
const DAY = CFG.time.dayTicks;

/** Only fruiting apple bushes catch it. */
export const canBlight = (p: Plant): boolean => p.kind === 'apple_bush' && (p.stage === 'mature' || p.stage === 'old');
/** Damp times, when blight takes hold and grows fastest. */
export const dampTimes = (w: World): boolean => w.clock.season === 'spring' || w.clock.season === 'autumn' || w.s.climate.rainDays > 0;

/** Give a bush the blight (an outbreak, a neighbour, or the god's Blight). */
export function blightPlant(w: World, p: Plant, amount: number = B.start): boolean {
  if (!canBlight(p) || p.blight >= amount) return false;
  const fresh = p.blight === 0;
  p.blight = q4(Math.min(1, amount));
  p.fruit = Math.min(p.fruit, Math.floor(maxFruit(p) * (1 - p.blight)));
  if (fresh) w.emit({ type: 'blight_started', plantId: p.id });
  return true;
}

function spread(w: World, p: Plant): void {
  for (const o of w.plantHash.query(p.pos, B.range)) {
    if (o === p || o.blight > 0 || !canBlight(o) || dist(o.pos, p.pos) > B.range) continue;
    const ash = (tileAt(w.s, o.pos.x, o.pos.y)?.ash ?? 0) > 0 ? B.ashMul : 1;
    if (w.rng.chance(B.spread * p.blight * ash)) blightPlant(w, o);
  }
}

/** §6 step 4b (daily, at dawn): outbreaks, spread, and bushes worsening or dying. */
export function updateBlight(w: World): void {
  const s = w.s;
  if (s.tick % DAY !== 0) return;
  const damp = dampTimes(w);
  if (damp && w.rng.chance(B.outbreakPerDay)) {
    const c = s.plants.filter((p) => canBlight(p) && p.blight === 0 && dist(p.pos, s.village.center) <= B.outbreakRange);
    if (c.length) blightPlant(w, w.rng.pick(c));
  }
  for (const p of s.plants.filter((x) => x.blight > 0)) {
    if (!canBlight(p)) { p.blight = 0; continue; } // chopped to a stump: the roots come back clean
    spread(w, p);
    p.blight = q4(Math.min(1, p.blight + (damp ? B.growDamp : B.growDry)));
    p.fruit = Math.min(p.fruit, Math.floor(maxFruit(p) * (1 - p.blight)));
    if (p.blight < 1) continue;
    w.emit({ type: 'plant_died', plantId: p.id, kind: p.kind, at: p.pos });
    witnessFact(w, 'blight_spreads', p.pos, B.witness);
    removePlant(w, p);
  }
}
