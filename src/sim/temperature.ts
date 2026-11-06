/** Temperature, warmth and wetness (§9.2). Air temperature is a pure function of clock + weather. */
import { CFG } from './config';
import type { Vec2, WeatherKind } from '../shared/types';
import type { Building, Goblin } from './state';
import type { World } from './world';
import { SEASONS, daylight, type ClockState } from './time';
import { fireWarmth } from './fire';
import { express } from './goblin/genetics/phenotype';
import { addMood } from './goblin/mood';
import { RAINY, weatherAt } from './weather';
import { clothingWarmth, wetMul } from './clothing';

const T = CFG.temperature;
const SH = CFG.shelter;

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

let roofs = { w: null as World | null, tick: -1, list: [] as Building[], n: -1, last: null as Building | null };
/** The buildings that could shelter anyone (P11.3: the fences and stations are not walked past for every goblin each
 * tick): of a sheltering type, listed once a tick and again if the buildings change in it. */
function roofed(w: World): Building[] {
  const bs = w.s.buildings;
  const last = bs[bs.length - 1] ?? null;
  if (roofs.w !== w || roofs.tick !== w.s.tick || roofs.n !== bs.length || roofs.last !== last) roofs = { w, tick: w.s.tick, list: bs.filter((b) => !!T.shelter[b.type]), n: bs.length, last };
  return roofs.list;
}

/** The completed shelter building a goblin is standing in, if any. */
export function shelterOf(w: World, g: Goblin): Building | null {
  if (g.airborne) return null;
  for (const b of roofed(w)) {
    if (b.buildProgress < 1 || !T.shelter[b.type]) continue;
    // (a longhouse is three tiles long: its far beds are further from the middle)
    if (Math.hypot(g.pos.x - b.pos.x, g.pos.y - b.pos.y) <= Math.max(T.shelterRadius, b.footprint.w * 0.47)) return b;
  }
  return null;
}

export const isWet = (w: World, g: Goblin): boolean => g.wetUntil > w.s.tick;

/** §P3.6 huddling: +2 °C per goblin pressed close (max +4). */
export function huddleBonus(w: World, g: Goblin): number {
  if (g.airborne) return 0;
  // P11.3: counted only as far as it can matter
  const n = w.goblinHash.count(g.pos, SH.huddleRadius, Math.ceil(SH.huddleMax / SH.huddlePerGoblin),
    (o) => o.id !== g.id && !o.airborne && Math.hypot(o.pos.x - g.pos.x, o.pos.y - g.pos.y) <= SH.huddleRadius);
  return Math.min(SH.huddleMax, n * SH.huddlePerGoblin);
}

/** In shade from the heatwave sun: under a roof or a tree crown. */
export function inShade(w: World, g: Goblin): boolean {
  if (shelterOf(w, g)) return true;
  for (const p of w.plantHash.query(g.pos, 1.5))
    if (p.kind === 'tree' && (p.stage === 'mature' || p.stage === 'old') && Math.hypot(p.pos.x - g.pos.x, p.pos.y - g.pos.y) < 1.2) return true;
  return false;
}

/** Felt temperature: air + shelter + huddle + campfire + clothes (P5.6) − wet penalty (a leaf cape halves it). */
export function feltTemperature(w: World, g: Goblin, home = shelterOf(w, g)): number {
  return airAt(w, g.pos) + (home ? T.shelter[home.type]! : 0) + huddleBonus(w, g) + fireWarmth(w, g.pos) + clothingWarmth(g) - (isWet(w, g) ? T.wetPenalty * wetMul(g) : 0);
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
  const roof = shelterOf(w, g), outdoors = !roof;
  const target = warmthTarget(g, feltTemperature(w, g, roof));
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
    // a Warm Sun cell (§17.5.2) keeps drying everyone standing in it
    if (g.wetUntil > s.tick && s.weather.cells.some((c) => c.tempOffset >= CFG.powers.warmCellAbove && Math.hypot(g.pos.x - c.pos.x, g.pos.y - c.pos.y) <= c.radius)) dryOff(g);
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
