import { describe, expect, it } from 'vitest';
import { CFG } from '../config';
import { clockAt } from '../time';
import { rollNext, setWeather, weatherAt } from '../weather';
import { airTemperature, comfortMin, feltTemperature, isWet } from '../temperature';
import { visionRadius } from '../ai/considerations';
import { deserialize, serialize, MIGRATIONS } from '../save';
import { makeWorld, spawnGoblin, placePlant } from './helpers';
import type { WeatherKind } from '../../shared/types';

const DAY = CFG.time.dayTicks;
const SEASON = CFG.time.daysPerSeason * DAY;

/** Pin the weather for a test: no transition for a long while. */
function pin(w: ReturnType<typeof makeWorld>, kind: WeatherKind): void {
  setWeather(w, kind);
  w.s.weather.nextChangeTick = w.s.tick + 100 * DAY;
}

describe('weather & temperature (§9.1–9.2, P3.1)', () => {
  it('Markov chain respects seasons: snow only in cold seasons, heatwaves only in summer', () => {
    const w = makeWorld();
    const seen: Record<string, Set<WeatherKind>> = {};
    for (const season of ['spring', 'summer', 'autumn', 'winter'] as const) {
      let k: WeatherKind = 'clear';
      seen[season] = new Set();
      for (let i = 0; i < 4000; i++) seen[season]!.add((k = rollNext(w, k, season)));
    }
    expect(seen.summer!.has('snow')).toBe(false);
    expect(seen.winter!.has('heatwave')).toBe(false);
    expect(seen.winter!.has('snow')).toBe(true);
    expect(seen.summer!.has('heatwave')).toBe(true);
    expect(seen.autumn!.has('rain')).toBe(true);
    expect(seen.spring!.has('blizzard')).toBe(false);
  });

  it('weather changes every quarter day with a correct forecast, and emits weather_changed', () => {
    const w = makeWorld();
    const changes: WeatherKind[] = [];
    w.bus.subscribe((e) => { if (e.type === 'weather_changed') changes.push(e.to); });
    const forecasts: WeatherKind[] = [];
    for (let i = 0; i < 40; i++) {
      forecasts.push(w.s.weather.upcoming);
      w.run(CFG.weather.transitionTicks);
      expect(w.s.weather.kind).toBe(forecasts[i]);
    }
    expect(changes.length).toBeGreaterThan(5);
  });

  it('air temperature: seasonal base, warm afternoons, cold nights, weather offsets', () => {
    const at = (day: number, frac: number) => clockAt(Math.round((day + frac) * DAY));
    const summerNoon = airTemperature(at(CFG.time.daysPerSeason + 2, 0.375), 'clear');
    const winterNight = airTemperature(at(3 * CFG.time.daysPerSeason + 2, 0.875), 'clear');
    expect(summerNoon).toBeCloseTo(30, 5);
    expect(winterNight).toBeCloseTo(-10, 5);
    expect(airTemperature(at(2, 0.375), 'storm')).toBeLessThan(airTemperature(at(2, 0.375), 'clear'));
    expect(airTemperature(at(CFG.time.daysPerSeason + 2, 0.375), 'heatwave')).toBeGreaterThan(summerNoon);
    // season blending over its first day: halfway between autumn and winter bases
    const blend = airTemperature(clockAt(3 * SEASON + DAY / 2), 'clear') - 6 * Math.cos(2 * Math.PI * (0.5 - 0.375));
    expect(blend).toBeCloseTo((10 + -4) / 2, 5);
  });

  it('rain soaks outdoor goblins, drains warmth and hydrates plants', () => {
    const w = makeWorld();
    const g = spawnGoblin(w);
    const dry = spawnGoblin(w, { pos: { x: 18, y: 18 } });
    const bush = placePlant(w, 'apple_bush', 'young', { x: 6, y: 18 });
    bush.hydration = 0.2;
    pin(w, 'rain');
    // a sunny local cell keeps one goblin dry
    w.s.weather.cells.push({ id: 999, kind: 'clear', pos: { x: 18, y: 18 }, radius: 3, untilTick: w.s.tick + DAY, tempOffset: 0 });
    g.needs.warmth = 80;
    const feltBefore = feltTemperature(w, g);
    for (let i = 0; i < 15; i++) {
      dry.pos = { x: 18, y: 18 }; // keep this one standing in the sunny spot
      w.run(10);
    }
    expect(isWet(w, g)).toBe(true);
    expect(weatherAt(w, { x: 18, y: 18 })).toBe('clear');
    expect(isWet(w, dry)).toBe(false);
    expect(feltTemperature(w, g)).toBeLessThan(feltBefore);
    expect(g.needs.warmth).toBeLessThan(80);
    w.run(600);
    expect(bush.hydration).toBeGreaterThan(0.5);
  });

  it('a goblin left out in a blizzard loses warmth and eventually dies of hypothermia', () => {
    const w = makeWorld();
    w.s.tick = 3 * SEASON + 2 * DAY; // mid-winter
    w.clock = clockAt(w.s.tick);
    const g = spawnGoblin(w);
    pin(w, 'blizzard');
    let died: string | null = null;
    w.bus.subscribe((e) => { if (e.type === 'goblin_died') died = e.cause; });
    for (let i = 0; i < 12 && !died; i++) {
      w.run(DAY);
      g.needs.hunger = g.needs.thirst = g.needs.energy = 90; // isolate the cold
    }
    expect(died).toBe('hypothermia');
  });

  it('warmth recovers in pleasant sunshine; cold-tolerant goblins feel comfortable lower', () => {
    const w = makeWorld();
    w.s.tick = CFG.time.daysPerSeason * DAY + 2 * DAY + Math.round(0.3 * DAY); // summer afternoon
    w.clock = clockAt(w.s.tick);
    const g = spawnGoblin(w);
    pin(w, 'clear');
    g.needs.warmth = 20;
    w.run(300);
    expect(g.needs.warmth).toBeGreaterThan(30);
    const hardy = spawnGoblin(w);
    hardy.genome.coldTolerance = { a: 1, b: 1 };
    const tender = spawnGoblin(w);
    tender.genome.coldTolerance = { a: 0, b: 0 };
    expect(comfortMin(hardy)).toBeLessThan(comfortMin(tender));
  });

  it('fog halves sight; blizzard cuts it by 70 %', () => {
    const w = makeWorld();
    w.s.tick = 2 * DAY + 600;
    w.clock = clockAt(w.s.tick);
    const g = spawnGoblin(w);
    pin(w, 'clear');
    const clear = visionRadius(g, w);
    pin(w, 'fog');
    expect(visionRadius(g, w)).toBeCloseTo(clear * 0.5, 5);
    pin(w, 'blizzard');
    expect(visionRadius(g, w)).toBeCloseTo(clear * 0.3, 5);
  });

  it('v2 saves migrate: forecast + empty cell list', () => {
    const w = makeWorld();
    const raw = JSON.parse(serialize(w.s)) as Record<string, unknown>;
    raw.version = 2;
    raw.weather = { kind: 'rain', nextChangeTick: 900, temperature: 9, windDir: 0 };
    const up = MIGRATIONS[2]!(raw);
    expect(up.weather).toMatchObject({ upcoming: 'rain', cells: [] });
    const s = deserialize(JSON.stringify({ ...raw, version: 2 }));
    expect(s.weather.cells).toEqual([]);
  });
});
