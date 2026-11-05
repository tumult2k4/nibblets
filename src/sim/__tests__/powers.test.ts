import { describe, expect, it } from 'vitest';
import { CFG } from '../config';
import { clockAt } from '../time';
import { setWeather, weatherAt } from '../weather';
import { airAt, isWet } from '../temperature';
import { tileAt } from '../grid';
import { nextDawnOrDusk, nextSeasonStart } from '../god/powers/nature';
import { makeWorld, placePlant, spawnGoblin } from './helpers';
import type { World } from '../world';
import type { SimEvent } from '../../shared/types';

const DAY = CFG.time.dayTicks;
const HOUR = CFG.god.hourTicks;

function noon(w: World, kind: 'clear' | 'rain' = 'clear', season = 0): void {
  w.s.tick = (season * CFG.time.daysPerSeason + 2) * DAY + Math.round(0.3 * DAY);
  w.clock = clockAt(w.s.tick);
  setWeather(w, kind);
  w.s.weather.nextChangeTick = w.s.tick + 100 * DAY;
}
const cast = (w: World, power: string, pos: { x: number; y: number }, radius?: number, to?: { x: number; y: number }) => {
  const evs: SimEvent[] = [];
  w.push({ type: 'god_cast', power, pos, ...(radius !== undefined ? { radius } : {}), ...(to ? { to } : {}) });
  evs.push(...w.step());
  return evs;
};

describe('nature powers (§17.5.2, P3.8)', () => {
  it('Rain: a local cell hydrates only the plants inside its radius, then expires after 2 h', () => {
    const w = makeWorld({ size: 48 });
    noon(w);
    const wet = placePlant(w, 'apple_bush', 'mature', { x: 12.5, y: 24.5 });
    const dry = placePlant(w, 'apple_bush', 'mature', { x: 36.5, y: 24.5 });
    wet.hydration = dry.hydration = 0.3;
    cast(w, 'rain', { x: 12, y: 24 }, 8);
    expect(w.s.weather.cells.length).toBe(1);
    expect(weatherAt(w, wet.pos)).toBe('rain');
    expect(weatherAt(w, dry.pos)).toBe('clear');
    w.run(HOUR);
    expect(wet.hydration).toBeGreaterThan(0.45);
    expect(dry.hydration).toBeLessThan(0.35);
    expect(wet.hydration - dry.hydration).toBeGreaterThan(0.1);
    w.run(PW_TICKS());
    expect(w.s.weather.cells.length).toBe(0);
  });

  it('Warm Sun dries wet goblins, warms the cell by 15 °C and melts its snow', () => {
    const w = makeWorld({ size: 40 });
    noon(w, 'rain', 3);
    const g = spawnGoblin(w, { pos: { x: 20, y: 20 } });
    const out = spawnGoblin(w, { pos: { x: 35, y: 35 } });
    w.run(20);
    expect(isWet(w, g)).toBe(true);
    for (const t of w.s.tiles) t.snow = 0.8;
    const before = airAt(w, g.pos);
    cast(w, 'warm_sun', { x: 20, y: 20 }, 8);
    expect(isWet(w, g)).toBe(false);
    expect(isWet(w, out)).toBe(true);
    expect(airAt(w, g.pos) - before).toBeGreaterThan(CFG.powers.warmSunDeg); // and the rain stops inside
    for (let i = 0; i < HOUR; i++) { g.pos = { x: 20, y: 20 }; w.step(); } // kept inside the sunny cell (it would wander off exploring)
    expect(isWet(w, g)).toBe(false);
    expect(tileAt(w.s, 20, 20)!.snow).toBeLessThan(0.5);
    expect(tileAt(w.s, 35, 35)!.snow).toBeGreaterThan(0.7);
  });

  it('Snowfall out of season is an omen; Clear Sky ends the global weather; cells cap at 4', () => {
    const w = makeWorld({ size: 48 });
    noon(w, 'rain', 1); // summer
    const g = spawnGoblin(w, { pos: { x: 24, y: 24 } });
    const f0 = g.godView.faith, fear0 = g.godView.fear;
    cast(w, 'snowfall', { x: 24, y: 24 }, 10);
    expect(weatherAt(w, g.pos)).toBe('snow');
    expect(airAt(w, g.pos)).toBeLessThanOrEqual(CFG.powers.snowCellAir + 0.5);
    expect(g.godView.faith).toBeGreaterThan(f0);
    expect(g.godView.fear).toBeGreaterThan(fear0);
    w.run(4 * CFG.seasons.snowEvery);
    expect(tileAt(w.s, 24, 24)!.snow).toBeGreaterThan(0);
    cast(w, 'clear_sky', { x: 0, y: 0 });
    expect(w.s.weather.kind).toBe('clear');
    for (let i = 0; i < 5; i++) cast(w, 'rain', { x: 5 + i * 8, y: 5 }, 8);
    expect(w.s.weather.cells.length).toBe(CFG.weather.maxCells);
  });

  it('Gust knocks goblins and loose items down-wind along the line', () => {
    const w = makeWorld({ size: 32 });
    noon(w);
    const g = spawnGoblin(w, { pos: { x: 10, y: 16 } });
    const off = spawnGoblin(w, { pos: { x: 10, y: 22 } });
    cast(w, 'gust', { x: 6, y: 16 }, undefined, { x: 18, y: 16 });
    expect(g.pos.x).toBeGreaterThan(11.5);
    expect(off.pos.x).toBeCloseTo(10, 0);
  });

  it('Apple Shower and Bountiful Growth feed the area', () => {
    const w = makeWorld({ size: 32 });
    noon(w);
    const sprout = placePlant(w, 'apple_bush', 'sprout', { x: 16.5, y: 16.5 });
    const bush = placePlant(w, 'apple_bush', 'mature', { x: 18.5, y: 16.5 }, 0);
    cast(w, 'apple_shower', { x: 16, y: 16 }, 5);
    const apples = w.s.groundItems.filter((i) => i.stack.type === 'apple');
    expect(apples.length).toBeGreaterThanOrEqual(CFG.powers.showerApples[0]);
    expect(apples.every((i) => Math.hypot(i.pos.x - 16, i.pos.y - 16) <= 5.01)).toBe(true);
    expect(bush.fruit).toBe(1);
    cast(w, 'bountiful_growth', { x: 16, y: 16 }, 5);
    expect(sprout.stage).toBe('sapling');
    expect(sprout.hydration).toBe(1);
    expect(bush.fruit).toBe(CFG.plants.maxApples);
  });

  it('time skips target the next dawn/dusk and the next season; Divine mode charges favor and cooldowns', () => {
    const D = DAY;
    expect(nextDawnOrDusk(2 * D + 10)).toBe(2 * D + Math.round(CFG.time.phases.day * D));
    expect(nextDawnOrDusk(2 * D + Math.round(0.8 * D))).toBe(3 * D);
    expect(nextSeasonStart(3 * D)).toBe(CFG.time.daysPerSeason * D);
    const w = makeWorld();
    noon(w);
    cast(w, 'fast_forward', { x: 0, y: 0 });
    expect(w.s.god.skipTo).toBe(nextDawnOrDusk(w.s.tick - 1));
    w.s.god.mode = 'divine';
    w.s.god.tier = 1;
    w.s.god.favor = 25;
    expect(cast(w, 'snowfall', { x: 5, y: 5 }, 8).some((e) => e.type === 'command_rejected')).toBe(true); // tier 3
    cast(w, 'rain', { x: 5, y: 5 }, 8);
    expect(w.s.god.favor).toBe(5);
    const again = cast(w, 'rain', { x: 9, y: 9 }, 8);
    expect(again.find((e) => e.type === 'command_rejected')).toMatchObject({ reason: 'no_favor' });
    w.s.god.favor = 100;
    expect(cast(w, 'rain', { x: 9, y: 9 }, 8).find((e) => e.type === 'command_rejected')).toMatchObject({ reason: 'cooldown' });
  });
});

function PW_TICKS(): number {
  return CFG.powers.cellHours * HOUR;
}
