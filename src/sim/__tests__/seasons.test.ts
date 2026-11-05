import { describe, expect, it } from 'vitest';
import { CFG } from '../config';
import { clockAt } from '../time';
import { groundSpeedMul, setWeather, updateSnow } from '../weather';
import { tileAt } from '../grid';
import { ACTIONS } from '../ai/utility';
import { makeWorld, placePlant, spawnGoblin } from './helpers';
import type { WeatherKind } from '../../shared/types';

const DAY = CFG.time.dayTicks;
const SEASON = CFG.time.daysPerSeason * DAY;

function at(w: ReturnType<typeof makeWorld>, tick: number, kind: WeatherKind): void {
  w.s.tick = tick;
  w.clock = clockAt(tick);
  setWeather(w, kind);
  w.s.weather.nextChangeTick = tick + 100 * DAY;
}

describe('seasons, snow and dormancy (§9.3, P3.2)', () => {
  it('snow piles up in a winter snowfall and melts in a spring thaw', () => {
    const w = makeWorld();
    at(w, 3 * SEASON + 2 * DAY, 'snow');
    w.run(6 * CFG.god.hourTicks);
    const t = tileAt(w.s, 12, 12)!;
    expect(t.snow).toBeGreaterThan(0.9);
    expect(tileAt(w.s, 1, 1)!.snow).toBe(0); // water never holds snow
    at(w, 4 * SEASON + 2 * DAY + 600, 'rain');
    w.run(DAY / 2);
    expect(t.snow).toBe(0);
  });

  it('deep snow and muddy trails slow walking', () => {
    const w = makeWorld();
    at(w, 2 * DAY, 'clear');
    const t = tileAt(w.s, 12, 12)!;
    expect(groundSpeedMul(w, { x: 12.5, y: 12.5 })).toBe(1);
    t.snow = 0.8;
    expect(groundSpeedMul(w, { x: 12.5, y: 12.5 })).toBeCloseTo(CFG.seasons.deepSnowSpeed, 5);
    t.snow = 0;
    t.wear = 0.7;
    expect(groundSpeedMul(w, { x: 12.5, y: 12.5 })).toBe(1);
    setWeather(w, 'rain');
    expect(groundSpeedMul(w, { x: 12.5, y: 12.5 })).toBeCloseTo(CFG.seasons.mudSpeed, 5);
  });

  it('winter is dormant: no growth, no apples — but berries keep a little fruit (winterFoodEase)', () => {
    const w = makeWorld();
    at(w, 3 * SEASON + DAY, 'cloudy');
    const seed = placePlant(w, 'apple_bush', 'seed', { x: 8, y: 16 });
    const apple = placePlant(w, 'apple_bush', 'mature', { x: 12, y: 18 }, 0);
    const berry = placePlant(w, 'berry_bush', 'mature', { x: 16, y: 18 }, 0);
    w.run(2 * DAY);
    expect(seed.stage).toBe('seed');
    expect(seed.growth).toBe(0);
    expect(apple.fruit).toBe(0);
    expect(berry.fruit).toBeGreaterThan(0);
  });

  it('planting is a spring rush and stops in winter', () => {
    const w = makeWorld();
    const g = spawnGoblin(w);
    g.inventory.push({ type: 'apple_core', qty: 1 });
    at(w, 2 * DAY, 'clear');
    const spring = ACTIONS.plant_seed.score(g, w);
    at(w, SEASON + 2 * DAY, 'clear');
    const summer = ACTIONS.plant_seed.score(g, w);
    expect(spring).toBeGreaterThan(summer);
    at(w, 3 * SEASON + 2 * DAY, 'clear');
    expect(ACTIONS.plant_seed.isAvailable(g, w)).toBe(false);
  });

  it('a local warm cell melts a clearing in the snow', () => {
    const w = makeWorld();
    at(w, 3 * SEASON + 2 * DAY + 900, 'cloudy');
    for (const t of w.s.tiles) if (t.biome !== 'water') t.snow = 0.6;
    w.s.weather.cells.push({ id: 1, kind: 'clear', pos: { x: 18, y: 18 }, radius: 3, untilTick: w.s.tick + DAY, tempOffset: 15 });
    for (let i = 0; i < 40; i++) updateSnow(w);
    expect(tileAt(w.s, 18, 18)!.snow).toBeLessThan(0.3);
    expect(tileAt(w.s, 8, 8)!.snow).toBeCloseTo(0.6, 5);
  });
});
