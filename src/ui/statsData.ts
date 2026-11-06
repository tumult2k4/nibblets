/**
 * The stats panel's series (P7.6), from the sampled time series in `s.stats`: thinned to at most `maxCols` points,
 * x in days. Population, days of food in the store, recipes and facts known, the skin-hue mix (shares per 30° band)
 * and deaths by cause (running totals from the death log).
 */
import { CFG } from '../sim/config';
import type { StatsSample, WorldState } from '../sim/state';

export interface StatsData {
  days: number[]; pop: number[]; food: number[]; known: number[];
  /** per hue band: its share of the population at each point */
  hues: number[][];
  /** per cause seen: running total at each point */
  deaths: { cause: string; values: number[] }[];
}

export function statsData(s: WorldState, maxCols = 120): StatsData {
  const all = s.stats.samples, step = Math.max(1, Math.ceil(all.length / maxCols));
  const cols: StatsSample[] = all.filter((_, i) => i % step === 0 || i === all.length - 1);
  const days = cols.map((c) => c.tick / CFG.time.dayTicks);
  const nb = CFG.stats.hueBins;
  const hues = Array.from({ length: nb }, (_, b) => cols.map((c) => {
    const n = c.hues?.reduce((a, k) => a + k, 0) ?? 0;
    return n ? (c.hues![b] ?? 0) / n : 0;
  }));
  const log = s.stats.deathLog ?? [];
  const causes = [...new Set(log.map(([, c]) => c))].sort();
  const deaths = causes.map((cause) => ({ cause, values: cols.map((c) => log.filter(([t, k]) => k === cause && t <= c.tick).length) }));
  return { days, pop: cols.map((c) => c.pop), food: cols.map((c) => c.days ?? 0), known: cols.map((c) => c.known ?? 0), hues, deaths };
}

/** The color of a hue band (its middle hue, as a goblin's skin might be). */
export const bandColor = (b: number): string => `hsl(${(b * 360) / CFG.stats.hueBins}, 45%, 52%)`;
