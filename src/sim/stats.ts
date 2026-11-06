import { q4, wrapHue } from '../shared/math';
import { CFG } from './config';
import { isFood } from './items';
import { express } from './goblin/genetics/phenotype';
import { foodStores } from './spoilage';
import { villageKnowledge } from './knowledge';
import type { WorldState } from './state';
import type { World } from './world';

const S = CFG.stats;

/** Goblins per 30° band of skin hue (12 bands, the first centered on 0°). */
export function hueBins(s: WorldState): number[] {
  const bins = new Array<number>(S.hueBins).fill(0), w = 360 / S.hueBins;
  for (const g of s.goblins) bins[Math.floor(wrapHue(express(g.genome, 'skinHue') + w / 2) / w) % S.hueBins]!++;
  return bins;
}

/** Time-series sampling for the stats panel (P7.6) and the balance runner, every `sampleEvery` ticks. */
export function sampleStats(w: World): void {
  const s = w.s;
  const gs = s.goblins;
  const food =
    s.plants.reduce((n, p) => n + (p.kind === 'apple_bush' ? p.fruit : 0), 0) +
    s.groundItems.reduce((n, it) => n + (isFood(it.stack.type) ? it.stack.qty : 0), 0) +
    gs.reduce((n, g) => n + g.inventory.reduce((m, st) => m + (isFood(st.type) ? st.qty : 0), 0), 0);
  const avg = (f: (x: (typeof gs)[number]) => number) => (gs.length ? q4(gs.reduce((a, g) => a + f(g), 0) / gs.length) : 0);
  s.stats.samples.push({
    tick: s.tick, pop: gs.length, food, avgHunger: avg((g) => g.needs.hunger), avgFaith: avg((g) => g.godView.faith),
    days: q4(Math.min(S.daysCap, foodStores(s).days)), known: villageKnowledge(s).length, hues: hueBins(s),
  });
  if (s.stats.samples.length > S.maxSamples) s.stats.samples.splice(0, s.stats.samples.length - S.maxSamples);
}

/** A death for the deaths chart. */
export function logDeath(s: WorldState, cause: string): void {
  const log = (s.stats.deathLog ??= []);
  log.push([s.tick, cause]);
  if (log.length > S.deathLogMax) log.splice(0, log.length - S.deathLogMax);
}
