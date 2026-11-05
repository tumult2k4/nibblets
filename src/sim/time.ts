import type { DayPhase, Season } from '../shared/types';
import { CFG } from './config';

export const SEASONS: readonly Season[] = ['spring', 'summer', 'autumn', 'winter'];

export interface ClockState {
  day: number; // 0-based absolute day
  dayFrac: number; // 0..1
  phase: DayPhase;
  season: Season;
  seasonDay: number; // 0..daysPerSeason-1
  year: number; // 1-based
  moonPhase: number; // 0..1, 0.5 = full
  hour: number; // 0..23.99 (display only)
}

/** Pure clock derived from the tick — no hidden state. */
export function clockAt(tick: number): ClockState {
  const { dayTicks, daysPerSeason, moonCycleDays, phases } = CFG.time;
  const day = Math.floor(tick / dayTicks);
  const dayFrac = (tick % dayTicks) / dayTicks;
  const phase: DayPhase =
    dayFrac < phases.dawn ? 'dawn' : dayFrac < phases.day ? 'day' : dayFrac < phases.dusk ? 'dusk' : 'night';
  const seasonIdx = Math.floor(day / daysPerSeason) % 4;
  const seasonDay = day % daysPerSeason;
  const year = Math.floor(day / (daysPerSeason * 4)) + 1;
  // full moon on day 4 of each season (§3.3): phase 0.5 at seasonDay 4
  const moonPhase = (((day - 4 + 0.5 * moonCycleDays) % moonCycleDays) + moonCycleDays) % moonCycleDays / moonCycleDays;
  // dawn at 06:00
  const hour = (dayFrac * 24 + 6) % 24;
  return { day, dayFrac, phase, season: SEASONS[seasonIdx] as Season, seasonDay, year, moonPhase, hour };
}

export const isNight = (c: ClockState): boolean => c.phase === 'night';

/** Daylight 0..1 for lighting & vision; smooth over dawn and dusk. */
export function daylight(c: ClockState): number {
  const f = c.dayFrac;
  const { dawn, day, dusk } = CFG.time.phases;
  if (f < dawn) return f / dawn;
  if (f < day) return 1;
  if (f < dusk) return 1 - (f - day) / (dusk - day);
  if (f > 0.97) return (f - 0.97) / 0.03 * 0.15;
  return 0;
}

export const perDay = (amountPerDay: number): number => amountPerDay / CFG.time.dayTicks;
export const daysToTicks = (d: number): number => Math.round(d * CFG.time.dayTicks);
