import { describe, expect, it } from 'vitest';
import { CFG } from '../config';
import { clockAt } from '../time';
import { setWeather } from '../weather';
import { tileAt } from '../grid';
import { createWorldState } from '../newWorld';
import { spawnMushroom, updateEcology } from '../ecology';
import { makeWorld, spawnGoblin } from './helpers';
import type { World } from '../world';

const DAY = CFG.time.dayTicks;

function forestHalf(w: World): void {
  for (const t of w.s.tiles) t.biome = 'meadow';
  for (let y = 0; y < w.s.size.h; y++) for (let x = 12; x < w.s.size.w; x++) tileAt(w.s, x, y)!.biome = 'forest';
}

describe('mushrooms (§8.2, P3.6)', () => {
  it('worldgen scatters mushrooms only in forest and marsh', () => {
    const s = createWorldState({ seed: 7, size: 64, founders: 0 });
    expect(s.mushrooms.length).toBeGreaterThan(5);
    for (const m of s.mushrooms) expect(['forest', 'marsh']).toContain(tileAt(s, m.pos.x, m.pos.y)!.biome);
  });

  it('they sprout in the forest, far more in rain, and rot after a few days', () => {
    const count = (kind: 'rain' | 'clear') => {
      const w = makeWorld({ size: 40, pond: false });
      forestHalf(w);
      w.s.tick = 2 * CFG.time.daysPerSeason * DAY; // autumn
      w.clock = clockAt(w.s.tick);
      setWeather(w, kind);
      w.s.weather.nextChangeTick = w.s.tick + 100 * DAY;
      for (let i = 0; i < 12; i++) { w.s.tick += CFG.mushrooms.every; updateEcology(w); }
      for (const m of w.s.mushrooms) expect(tileAt(w.s, m.pos.x, m.pos.y)!.biome).toBe('forest');
      return w;
    };
    const wet = count('rain'), dry = count('clear');
    expect(wet.s.mushrooms.length).toBeGreaterThan(dry.s.mushrooms.length * 1.5);
    expect(wet.s.mushrooms.length).toBeLessThanOrEqual(CFG.mushrooms.cap);
    const oldest = wet.s.mushrooms[0]!;
    for (let i = 0; i < (CFG.mushrooms.lifeDays * DAY) / CFG.mushrooms.every; i++) { wet.s.tick += CFG.mushrooms.every; updateEcology(wet); }
    expect(wet.s.mushrooms.includes(oldest)).toBe(false);
  });

  it('Forage: a hungry goblin who knows redcaps are poison picks a brown mushroom and leaves the redcap alone', () => {
    const w = makeWorld();
    w.s.tick = 2 * DAY + 400;
    w.clock = clockAt(w.s.tick);
    setWeather(w, 'cloudy');
    w.s.weather.nextChangeTick = w.s.tick + 100 * DAY;
    const red = spawnMushroom(w.s, { x: 13, y: 12 }, 'redcap');
    const brown = spawnMushroom(w.s, { x: 17, y: 15 }, 'brown');
    const g = spawnGoblin(w, { pos: { x: 12, y: 12 } });
    g.knownFacts.push('redcap_is_poison');
    g.needs.hunger = 35;
    const acts = new Set<string>();
    for (let t = 0; t < 300 && w.s.mushrooms.includes(brown); t++) { w.step(); acts.add(g.activity.action); g.needs.thirst = 90; }
    expect(acts.has('forage')).toBe(true);
    expect(w.s.mushrooms.includes(brown)).toBe(false);
    expect(w.s.mushrooms.includes(red)).toBe(true);
    expect(g.memory.some((m) => m.kind === 'mushroom' && m.targetId === red.id)).toBe(false);
  });
});
