import { q4 } from '../shared/math';
import { isFood } from './items';
import type { World } from './world';

/** Time-series sampling for the stats panel and balance runner (stub: few series in P1). */
export function sampleStats(w: World): void {
  const s = w.s;
  const gs = s.goblins;
  const food =
    s.plants.reduce((n, p) => n + (p.kind === 'apple_bush' ? p.fruit : 0), 0) +
    s.groundItems.reduce((n, it) => n + (isFood(it.stack.type) ? it.stack.qty : 0), 0) +
    gs.reduce((n, g) => n + g.inventory.reduce((m, st) => m + (isFood(st.type) ? st.qty : 0), 0), 0);
  const avg = (f: (x: (typeof gs)[number]) => number) => (gs.length ? q4(gs.reduce((a, g) => a + f(g), 0) / gs.length) : 0);
  s.stats.samples.push({ tick: s.tick, pop: gs.length, food, avgHunger: avg((g) => g.needs.hunger), avgFaith: avg((g) => g.godView.faith) });
  if (s.stats.samples.length > 2000) s.stats.samples.splice(0, s.stats.samples.length - 2000);
}
