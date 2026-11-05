import { CFG } from './config';
import { q4 } from '../shared/math';
import type { World } from './world';

/**
 * Plants v1 (P1): apple regrowth on mature bushes only. The full lifecycle arrives in P2.1.
 * Staggered: each plant updates every 10 ticks on tick % 10 === id % 10.
 */
export function updatePlants(w: World): void {
  const s = w.s;
  const every = CFG.plants.updateEvery;
  const slot = s.tick % every;
  const seasonMul = CFG.plants.seasonMul[w.clock.season];
  const perUpdate = (every / CFG.time.dayTicks / CFG.plants.appleRegrowDays) * seasonMul;
  for (const p of s.plants) {
    if (p.id % every !== slot) continue;
    if (p.kind !== 'apple_bush' || p.stage !== 'mature') continue;
    if (p.fruit >= CFG.plants.maxApples) {
      p.fruitProgress = 0;
      continue;
    }
    p.fruitProgress = q4(p.fruitProgress + perUpdate);
    if (p.fruitProgress >= 1) {
      p.fruitProgress = 0;
      p.fruit += 1;
    }
  }
}
