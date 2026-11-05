import { describe, expect, it } from 'vitest';
import { CFG } from '../config';
import { droughtMul, shootingStar, updateClimate, waterOffset } from '../climate';
import { blightPlant, updateBlight } from '../blight';
import { CullBlight, knowsBlight } from '../ai/actions/cullBlight';
import { PickUp } from '../ai/actions/pickUp';
import { xpFor } from '../goblin/skills';
import { clockAt } from '../time';
import { isWalkable, tileAt } from '../grid';
import { deserialize, serialize } from '../save';
import { makeWorld, placePlant, spawnGoblin } from './helpers';
import type { UtilityAction } from '../ai/action';
import type { Goblin } from '../state';
import type { World } from '../world';
import type { SimEvent, WeatherKind } from '../../shared/types';

const DAY = CFG.time.dayTicks, HOUR = CFG.god.hourTicks, WL = CFG.world.waterLevel, SEASON = CFG.time.daysPerSeason;

function events(w: World): SimEvent[] {
  const evs: SimEvent[] = [];
  w.bus.subscribe((e) => evs.push(e));
  return evs;
}
/** Run the climate (and blight) hour by hour for `days` in weather `kind`. */
function weather(w: World, kind: WeatherKind, days: number): void {
  w.s.weather.kind = kind;
  for (let h = 0; h < days * 24; h++) {
    w.s.tick += HOUR;
    w.clock = clockAt(w.s.tick);
    updateClimate(w);
    updateBlight(w);
    w.bus.flush();
  }
}
function run(w: World, g: Goblin, a: UtilityAction, max = 2000): string {
  g.activity = { action: a.id, status: 'running', startedTick: w.s.tick, targetId: null, target: null, path: [], progress: 0, stage: 0 };
  if (!a.start(g, w)) return 'failed';
  for (let i = 0; i < max; i++) {
    const r = a.step(g, w);
    w.s.tick++;
    w.bus.flush();
    if (r !== 'running') return r;
  }
  return 'timeout';
}
/** Day `d` (dawn) of the year. */
const dawn = (w: World, d: number) => { w.s.tick = d * DAY; w.clock = clockAt(w.s.tick); };

describe('Floods, droughts, blight and shooting stars (P6.3, §14.4)', () => {
  it('floods the lowlands after three rainy days, and the water leaves richer soil when it goes down', () => {
    const w = makeWorld({ size: 24 });
    dawn(w, 2 * SEASON + 1); // autumn
    for (let y = 0; y < 24; y++) for (let x = 4; x < 9; x++) tileAt(w.s, x, y)!.height = WL + 0.01;
    const bush = placePlant(w, 'apple_bush', 'mature', { x: 6.5, y: 12.5 });
    const g = spawnGoblin(w, { pos: { x: 6.5, y: 14.5 } });
    const fert = tileAt(w.s, 6, 12)!.fertility;
    const evs = events(w);
    weather(w, 'rain', 2);
    expect(w.s.climate.flood).toBeNull();
    weather(w, 'rain', 1);
    expect(w.s.climate.flood).not.toBeNull();
    expect(evs.some((e) => e.type === 'flood_started')).toBe(true);
    expect(tileAt(w.s, 6, 12)!.biome).toBe('water');
    expect(tileAt(w.s, 15, 12)!.biome).toBe('meadow'); // high ground stays dry
    expect(waterOffset(w)).toBeGreaterThan(0);
    expect(isWalkable(w.s, Math.floor(g.pos.x), Math.floor(g.pos.y))).toBe(true); // waded out
    weather(w, 'rain', 1);
    expect(bush.hp).toBeLessThan(100);
    weather(w, 'clear', 2);
    expect(w.s.climate.flood).toBeNull();
    expect(evs.some((e) => e.type === 'flood_receded')).toBe(true);
    expect(tileAt(w.s, 6, 12)!.biome).toBe('meadow');
    expect(tileAt(w.s, 6, 12)!.walkable).toBe(true);
    expect(tileAt(w.s, 6, 12)!.fertility).toBeGreaterThan(fert);
    expect(waterOffset(w)).toBe(0);
  });

  it('dries the shallows after six summer days without rain, and the rain brings them back', () => {
    const w = makeWorld({ size: 24 });
    dawn(w, SEASON + 1); // summer
    for (let y = 0; y < 4; y++) tileAt(w.s, 3, y)!.height = WL - 0.01; // the pond's shallow edge
    const evs = events(w);
    weather(w, 'clear', 5);
    expect(w.s.climate.drought).toBeNull();
    weather(w, 'clear', 1);
    expect(w.s.climate.drought).not.toBeNull();
    expect(evs.some((e) => e.type === 'drought_started')).toBe(true);
    expect(tileAt(w.s, 3, 1)!.biome).toBe('sand');
    expect(isWalkable(w.s, 3, 1)).toBe(true);
    expect(tileAt(w.s, 1, 1)!.biome).toBe('water'); // the deep middle holds
    expect(droughtMul(w)).toBeLessThan(1);
    expect(waterOffset(w)).toBeLessThan(0);
    // a goblin out on the dry shallows when the rain comes back wades ashore
    const g = spawnGoblin(w, { pos: { x: 3.5, y: 1.5 } });
    weather(w, 'rain', 1);
    expect(w.s.climate.drought).toBeNull();
    expect(tileAt(w.s, 3, 1)!.biome).toBe('water');
    expect(isWalkable(w.s, Math.floor(g.pos.x), Math.floor(g.pos.y))).toBe(true);
    expect(droughtMul(w)).toBe(1);
    // and no drought outside summer
    const v = makeWorld({ size: 24 });
    dawn(v, 2 * SEASON + 1);
    weather(v, 'clear', 7);
    expect(v.s.climate.drought).toBeNull();
  });

  it('blight cuts the fruit, spreads to apple bushes nearby, and kills the bush it ends in', () => {
    let spread = 0;
    for (let seed = 1; seed <= 8; seed++) {
      const w = makeWorld({ size: 24, seed });
      dawn(w, 1); // spring: damp
      const sick = placePlant(w, 'apple_bush', 'mature', { x: 10.5, y: 12.5 }, 5);
      const near = placePlant(w, 'apple_bush', 'mature', { x: 12.5, y: 12.5 });
      const berry = placePlant(w, 'berry_bush', 'mature', { x: 10.5, y: 14.5 });
      const far = placePlant(w, 'apple_bush', 'mature', { x: 20.5, y: 20.5 });
      expect(blightPlant(w, sick, 0.5)).toBe(true);
      expect(sick.fruit).toBeLessThanOrEqual(2);
      weather(w, 'cloudy', 3);
      spread += near.blight > 0 ? 1 : 0;
      expect(berry.blight).toBe(0);
      expect(far.blight === 0 || w.s.plants.filter((p) => p.blight > 0).length > 2).toBe(true);
    }
    expect(spread).toBeGreaterThan(3);
    const w = makeWorld({ size: 24 });
    dawn(w, 1);
    const p = placePlant(w, 'apple_bush', 'mature', { x: 10.5, y: 12.5 }, 5);
    const g = spawnGoblin(w, { pos: { x: 11.5, y: 13 } });
    blightPlant(w, p, 0.9);
    const evs = events(w);
    weather(w, 'cloudy', 2);
    expect(w.s.plants.includes(p)).toBe(false);
    expect(evs.some((e) => e.type === 'plant_died' && e.plantId === p.id)).toBe(true);
    expect(g.knownFacts.includes('blight_spreads') || CFG.disasters.blight.witness < 1).toBe(true);
  });

  it('a farmer pulls a blighted bush out; a goblin who knows nothing of blight leaves it', () => {
    const w = makeWorld({ size: 24 });
    dawn(w, 1);
    w.s.tick += 8 * HOUR;
    const p = placePlant(w, 'apple_bush', 'mature', { x: 10.5, y: 12.5 }, 3);
    blightPlant(w, p, 0.4);
    const novice = spawnGoblin(w, { pos: { x: 14, y: 12 } });
    novice.knownFacts = [];
    expect(knowsBlight(novice)).toBe(false);
    expect(CullBlight.isAvailable(novice, w)).toBe(false);
    const farmer = spawnGoblin(w, { pos: { x: 16, y: 12 } });
    farmer.knownFacts = [];
    farmer.skills.farming = xpFor(CFG.disasters.blight.farming);
    expect(CullBlight.isAvailable(farmer, w)).toBe(true);
    expect(CullBlight.score(farmer, w)).toBeGreaterThan(0.3);
    const evs = events(w);
    expect(run(w, farmer, CullBlight)).toBe('done');
    expect(w.s.plants.includes(p)).toBe(false);
    expect(evs.some((e) => e.type === 'blight_culled' && e.goblinId === farmer.id)).toBe(true);
    expect(farmer.knownFacts).toContain('blight_spreads');
    expect(w.s.groundItems.some((it) => it.stack.type === 'wood')).toBe(true);
  });

  it('a shooting star leaves a crater and a star stone, which becomes a legendary trinket', () => {
    const w = makeWorld({ size: 24 });
    dawn(w, 3);
    w.s.tick += 2 * HOUR;
    w.clock = clockAt(w.s.tick);
    const at = { x: 15.5, y: 15.5 };
    const before = tileAt(w.s, 15, 15)!.height;
    const g = spawnGoblin(w, { pos: { x: 12, y: 12 } });
    const evs = events(w);
    shootingStar(w, at);
    w.bus.flush();
    expect(evs.some((e) => e.type === 'shooting_star')).toBe(true);
    expect(tileAt(w.s, 15, 15)!.height).toBeLessThan(before);
    expect(g.activity.action).toBe('look_up');
    const stone = w.s.groundItems.find((it) => it.stack.type === 'star_stone');
    expect(stone).toBeDefined();
    g.activity.status = 'done';
    w.rebuildCaches();
    expect(PickUp.score(g, w)).toBeGreaterThan(0.4);
    expect(run(w, g, PickUp)).toBe('done');
    expect(w.s.groundItems.some((it) => it.stack.type === 'star_stone')).toBe(false);
    const t = w.s.trinkets.find((x) => g.trinkets.includes(x.id));
    expect(t).toMatchObject({ kind: 'star_stone', rarity: 'legendary' });
    expect(evs.some((e) => e.type === 'trinket_found' && e.goblinId === g.id)).toBe(true);
  });

  it('stars fall about once a year, and a flood survives a save and load', () => {
    let stars = 0;
    for (let seed = 1; seed <= 10; seed++) {
      const w = makeWorld({ size: 40, seed });
      dawn(w, 1);
      const evs = events(w);
      weather(w, 'clear', 4 * SEASON);
      stars += evs.filter((e) => e.type === 'shooting_star').length;
    }
    expect(stars).toBeGreaterThanOrEqual(3);
    expect(stars).toBeLessThanOrEqual(25);
    const w = makeWorld({ size: 24 });
    dawn(w, 2 * SEASON + 1);
    for (let x = 4; x < 9; x++) tileAt(w.s, x, 10)!.height = WL + 0.01;
    weather(w, 'rain', 3);
    expect(w.s.climate.flood).not.toBeNull();
    const back = deserialize(serialize(w.s));
    expect(back.climate).toEqual(w.s.climate);
    expect(back.tiles[10 * 24 + 6]!.biome).toBe('water');
  });
});
