/** Temperature, warmth and wetness (§9.2). Air temperature is a pure function of clock + weather. */
import { CFG } from './config';
import type { Vec2, WeatherKind } from '../shared/types';
import type { Building, Goblin } from './state';
import type { World } from './world';
import { SEASONS, daylight, type ClockState } from './time';
import { express } from './goblin/genetics/phenotype';
import { addMood } from './goblin/mood';
import { RAINY, weatherAt } from './weather';

const T = CFG.temperature;

/** Seasonal base, blended from the previous season over the first day of a new one. */
export function seasonBase(c: ClockState): number {
  const cur = T.seasonBase[c.season];
  if (c.seasonDay > 0 || c.day === 0) return cur; // the very first morning starts in spring proper
  const prev = T.seasonBase[SEASONS[(SEASONS.indexOf(c.season) + 3) % 4]!];
  return prev + (cur - prev) * c.dayFrac;
}

/** Global air temperature °C: season base + day/night swing (warmest mid-afternoon) + weather offset. */
export function airTemperature(c: ClockState, kind: WeatherKind): number {
  const swing = T.daySwing * Math.cos(2 * Math.PI * (c.dayFrac - T.warmestDayFrac));
  return seasonBase(c) + swing + T.weatherOffset[kind];
}

/** Air temperature at a point, honoring local weather cells and their temperature offsets. */
export function airAt(w: World, pos: Vec2): number {
  let extra = 0;
  for (const c of w.s.weather.cells) if (Math.hypot(pos.x - c.pos.x, pos.y - c.pos.y) <= c.radius) extra += c.tempOffset;
  return airTemperature(w.clock, weatherAt(w, pos)) + extra;
}

/** The completed shelter building a goblin is standing in, if any. */
export function shelterOf(w: World, g: Goblin): Building | null {
  if (g.airborne) return null;
  for (const b of w.s.buildings) {
    if (b.buildProgress < 1 || !T.shelter[b.type]) continue;
    if (Math.hypot(g.pos.x - b.pos.x, g.pos.y - b.pos.y) <= T.shelterRadius) return b;
  }
  return null;
}

export const isWet = (w: World, g: Goblin): boolean => g.wetUntil > w.s.tick;

/** Felt temperature: air + shelter (+ fire P4, clothing P5) − wet penalty. */
export function feltTemperature(w: World, g: Goblin): number {
  const home = shelterOf(w, g);
  return airAt(w, g.pos) + (home ? T.shelter[home.type]! : 0) - (isWet(w, g) ? T.wetPenalty : 0);
}

/** Lowest comfortable felt temperature for this goblin (cold-tolerant goblins shrug off more). */
export const comfortMin = (g: Goblin): number => T.comfortMin - express(g.genome, 'coldTolerance') * T.coldToleranceRange;

/** Warmth level a goblin settles at for a felt temperature: 100 in the comfort band, lower below it. */
export const warmthTarget = (g: Goblin, felt: number): number =>
  Math.max(0, 100 - T.targetPerDeg * Math.max(0, comfortMin(g) - felt));

/**
 * Per-tick warmth change (§9.2 "drifts toward a comfort band"): exponential drift toward the target
 * (faster warming in sunshine), plus exposure drain from precipitation outdoors.
 */
export function warmthDelta(w: World, g: Goblin): number {
  const hour = CFG.god.hourTicks;
  const kind = weatherAt(w, g.pos);
  const outdoors = !shelterOf(w, g);
  const target = warmthTarget(g, feltTemperature(w, g));
  const cur = g.needs.warmth;
  let k: number = T.driftDownPerHour;
  if (target > cur) {
    const sunny = outdoors && (kind === 'clear' || kind === 'heatwave') && daylight(w.clock) > 0.5;
    k = sunny ? T.sunDriftUpPerHour : T.driftUpPerHour;
  }
  let d = ((target - cur) * k) / hour;
  if (outdoors) d -= ((T.exposurePerHour[kind] ?? 0) * (1 - 0.5 * express(g.genome, 'coldTolerance'))) / hour;
  return d;
}

/** Hypothermia hp damage per tick once warmth is spent (hatchlings and elders suffer more). */
export function coldDamage(g: Goblin): number {
  if (g.needs.warmth >= T.hypothermiaBelow) return 0;
  const frail = g.lifeStage === 'hatchling' || g.lifeStage === 'elder' ? T.frailColdMul : 1;
  return (T.hypothermiaDmgPerDay * frail) / CFG.time.dayTicks;
}

/** Goblins outdoors in rain get wet (felt −5 °C for an hour); cold ones grumble (mood −3). */
export function updateWetness(w: World): void {
  const s = w.s;
  if (s.tick % 10 !== 0) return;
  for (const g of s.goblins) {
    if (g.airborne?.held || !RAINY.has(weatherAt(w, g.pos)) || shelterOf(w, g)) continue;
    g.wetUntil = s.tick + T.wetTicks;
    if (g.needs.warmth < T.coldMoodBelow && !g.mood.modifiers.some((m) => m.id === 'cold_rain'))
      addMood(w, g, 'cold_rain', T.coldRainMood, CFG.god.hourTicks);
  }
}

/** Dry a goblin immediately (Warm Sun, fire later). */
export function dryOff(g: Goblin): void {
  g.wetUntil = -1;
}
