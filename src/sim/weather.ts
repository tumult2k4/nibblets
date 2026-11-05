/** Weather state machine (§9.1): season-dependent Markov chain stepped every quarter day, local cells. */
import { CFG } from './config';
import { q4 } from '../shared/math';
import type { Season, Vec2, WeatherKind } from '../shared/types';
import type { World } from './world';
import { clockAt } from './time';
import { airTemperature, updateWetness } from './temperature';

const W = CFG.weather;
export const WEATHER_KINDS: readonly WeatherKind[] = ['clear', 'cloudy', 'fog', 'rain', 'storm', 'snow', 'blizzard', 'heatwave'];
export const RAINY: ReadonlySet<WeatherKind> = new Set(['rain', 'storm']);
export const SNOWY: ReadonlySet<WeatherKind> = new Set(['snow', 'blizzard']);
export const isPrecip = (k: WeatherKind): boolean => RAINY.has(k) || SNOWY.has(k);

/** One Markov step: keep the state (if it fits the season), else a season-weighted pick among allowed successors. */
export function rollNext(w: World, from: WeatherKind, season: Season): WeatherKind {
  const weights = W.seasonWeights[season];
  if (weights[from] > 0 && w.rng.chance(W.persist[from])) return from;
  const cands = WEATHER_KINDS.filter((k) => k !== from && weights[k] > 0 && (!W.follows[k] || W.follows[k]!.includes(from)));
  const total = cands.reduce((a, k) => a + weights[k], 0);
  let r = w.rng.next() * total;
  for (const k of cands) {
    r -= weights[k];
    if (r < 0) return k;
  }
  return cands[cands.length - 1] ?? 'clear';
}

/** Weather at a point: the newest local cell covering it, else the global state. */
export function weatherAt(w: World, pos: Vec2): WeatherKind {
  const cells = w.s.weather.cells;
  for (let i = cells.length - 1; i >= 0; i--) {
    const c = cells[i]!;
    if (Math.hypot(pos.x - c.pos.x, pos.y - c.pos.y) <= c.radius) return c.kind;
  }
  return w.s.weather.kind;
}

export const rainingAt = (w: World, pos: Vec2): boolean => RAINY.has(weatherAt(w, pos));

/** Vision multiplier from the weather around a goblin (fog −50 %, blizzard −70 %). */
export const weatherVisionMul = (w: World, pos: Vec2): number => W.vision[weatherAt(w, pos)] ?? 1;

/** Force a weather state now (sandbox / Clear Sky); the next transition is a full period away. */
export function setWeather(w: World, kind: WeatherKind): void {
  const wx = w.s.weather;
  const from = wx.kind;
  wx.kind = kind;
  wx.nextChangeTick = w.s.tick + W.transitionTicks;
  wx.upcoming = rollNext(w, kind, clockAt(wx.nextChangeTick).season);
  if (from !== kind) w.emit({ type: 'weather_changed', from, to: kind });
}

/** §6 step 2: transitions, cell expiry, air temperature, who gets wet. */
export function updateWeather(w: World): void {
  const s = w.s;
  const wx = s.weather;
  if (s.tick >= wx.nextChangeTick) {
    const from = wx.kind;
    wx.kind = wx.upcoming;
    wx.nextChangeTick = s.tick + W.transitionTicks;
    wx.upcoming = rollNext(w, wx.kind, clockAt(wx.nextChangeTick).season);
    wx.windDir = q4((((wx.windDir + w.rng.range(-W.windJitter, W.windJitter)) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2));
    if (from !== wx.kind) w.emit({ type: 'weather_changed', from, to: wx.kind });
  }
  if (wx.cells.length && wx.cells.some((c) => c.untilTick <= s.tick)) wx.cells = wx.cells.filter((c) => c.untilTick > s.tick);
  if (s.tick % 10 === 0) wx.temperature = q4(airTemperature(w.clock, wx.kind));
  updateWetness(w);
}
