import { describe, expect, it } from 'vitest';
import { CFG } from '../config';
import { clockAt } from '../time';
import { setWeather } from '../weather';
import { completeBuilding, placeBlueprint } from '../buildings';
import { feltTemperature, huddleBonus, shelterOf } from '../temperature';
import { needsRepair, updateStorms } from '../storms';
import { needDecay } from '../goblin/needs';
import { makeWorld, placePlant, spawnGoblin } from './helpers';
import type { WeatherKind } from '../../shared/types';
import type { World } from '../world';

const DAY = CFG.time.dayTicks;

function at(w: World, day: number, frac: number, kind: WeatherKind, season = 0): void {
  w.s.tick = (season * CFG.time.daysPerSeason + day) * DAY + Math.round(frac * DAY);
  w.clock = clockAt(w.s.tick);
  setWeather(w, kind);
  w.s.weather.nextChangeTick = w.s.tick + 100 * DAY;
}
const feed = (g: { needs: { hunger: number; thirst: number; energy: number } }) => {
  g.needs.hunger = Math.max(g.needs.hunger, 70); g.needs.thirst = Math.max(g.needs.thirst, 70); g.needs.energy = Math.max(g.needs.energy, 80);
};
function hutAt(w: World, x: number, y: number) {
  const b = placeBlueprint(w, 'hut', { x, y }, null);
  completeBuilding(w, b, null);
  return b;
}

describe('shelter and warming up (§P3.6)', () => {
  it('Rain: an unsheltered goblin with a home goes inside within 300 ticks', () => {
    const w = makeWorld();
    at(w, 2, 0.2, 'clear');
    const hut = hutAt(w, 16, 16);
    const g = spawnGoblin(w, { pos: { x: 8, y: 16 } });
    hut.occupants.push(g.id);
    g.homeId = hut.id;
    w.run(30);
    setWeather(w, 'rain');
    w.s.weather.nextChangeTick = w.s.tick + 100 * DAY;
    let n = 0;
    for (; n < 300 && shelterOf(w, g) !== hut; n++) { w.step(); feed(g); }
    expect(shelterOf(w, g)).toBe(hut);
    expect(g.activity.action).toBe('seek_shelter');
    w.run(60);
    expect(shelterOf(w, g)).toBe(hut); // waits it out instead of wandering back into the rain
  });

  it('a storm interrupts at once and homeless goblins shelter as guests in the nearest hut', () => {
    const w = makeWorld();
    at(w, 2, 0.2, 'clear');
    const hut = hutAt(w, 16, 16);
    const g = spawnGoblin(w, { pos: { x: 7, y: 9 }, ageDays: 12 }); // a youngling: no hut of its own to claim
    while (w.s.tick % CFG.goblin.decisionIntervalTicks !== g.id % CFG.goblin.decisionIntervalTicks) w.step();
    w.step();
    setWeather(w, 'storm');
    w.s.weather.nextChangeTick = w.s.tick + 100 * DAY;
    w.run(12); // well before the next regular decision
    expect(g.activity.action).toBe('seek_shelter');
    for (let n = 0; n < 400 && !shelterOf(w, g); n++) { w.step(); feed(g); }
    expect(shelterOf(w, g)).toBe(hut);
  });

  it('heatwave: shade under a tree, which also spares the extra thirst', () => {
    const w = makeWorld();
    at(w, 2, 0.4, 'heatwave', 1);
    const tree = placePlant(w, 'tree', 'mature', { x: 14.5, y: 10.5 });
    const g = spawnGoblin(w, { pos: { x: 12, y: 16 }, ageDays: 12 }); // a youngling: no hut plans of its own
    let n = 0;
    for (; n < 300 && Math.hypot(g.pos.x - tree.pos.x, g.pos.y - tree.pos.y) > 1.2; n++) { w.step(); feed(g); }
    expect(n).toBeLessThan(300);
    expect(g.activity.action).toBe('seek_shelter');
    const sun = spawnGoblin(w, { pos: { x: 20, y: 20 } });
    expect(needDecay(sun, 'thirst', 'summer', true)).toBeCloseTo(needDecay(sun, 'thirst', 'summer') * CFG.weather.heatwaveThirstMul, 6);
  });

  it('huddling: +2 °C per goblin pressed close, capped at +4', () => {
    const w = makeWorld();
    at(w, 2, 0.1, 'cloudy', 3);
    const g = spawnGoblin(w, { pos: { x: 12, y: 12 } });
    const alone = feltTemperature(w, g);
    spawnGoblin(w, { pos: { x: 12.5, y: 12 } });
    expect(huddleBonus(w, g)).toBe(2);
    expect(feltTemperature(w, g)).toBeCloseTo(alone + 2, 6);
    spawnGoblin(w, { pos: { x: 12, y: 12.6 } });
    spawnGoblin(w, { pos: { x: 11.4, y: 12 } });
    expect(huddleBonus(w, g)).toBe(4);
  });

  it('WarmUp: a cold goblin heads for a hut, else huddles with a resting goblin', () => {
    const w = makeWorld({ size: 32 });
    at(w, 2, 0.1, 'cloudy', 3); // winter early morning
    const hut = hutAt(w, 24, 24);
    const g = spawnGoblin(w, { pos: { x: 14, y: 20 }, ageDays: 12 });
    g.needs.warmth = 25;
    for (let n = 0; n < 400 && !shelterOf(w, g); n++) { w.step(); feed(g); g.needs.warmth = Math.min(g.needs.warmth, 25); }
    expect(shelterOf(w, g)).toBe(hut);
    expect(g.activity.action).toBe('warm_up');

    const w2 = makeWorld({ size: 32 });
    at(w2, 2, 0.1, 'cloudy', 3);
    const resting = spawnGoblin(w2, { pos: { x: 20, y: 20 }, ageDays: 12 });
    const cold = spawnGoblin(w2, { pos: { x: 14, y: 20 }, ageDays: 12 });
    cold.needs.warmth = 25;
    let huddled = false;
    for (let n = 0; n < 300 && !huddled; n++) {
      resting.activity = { ...resting.activity, action: 'idle', status: 'running', progress: 999 };
      resting.velocity = { x: 0, y: 0 };
      w2.step();
      feed(cold); cold.needs.warmth = Math.min(cold.needs.warmth, 25);
      huddled = huddleBonus(w2, cold) > 0;
    }
    expect(huddled).toBe(true);
    expect(cold.activity.action).toBe('warm_up');
  });
});

describe('storm damage (§9.1, P3.6)', () => {
  it('storms batter only weakened buildings, flag repairs and finally knock a hut down', () => {
    const w = makeWorld();
    at(w, 2, 0.3, 'storm', 2);
    const strong = hutAt(w, 8, 16);
    const weak = hutAt(w, 16, 16);
    const g = spawnGoblin(w);
    weak.occupants.push(g.id);
    g.homeId = weak.id;
    weak.hp = 45;
    strong.hp = 65;
    const tick0 = w.s.tick;
    for (let t = 0; t < CFG.god.hourTicks; t++) { w.s.tick++; updateStorms(w); }
    expect(strong.hp).toBe(65);
    expect(needsRepair(strong)).toBe(true);
    expect(weak.hp).toBeCloseTo(45 - CFG.storms.dmgPerHour, 1);
    weak.hp = 0.2;
    const evs: string[] = [];
    w.bus.subscribe((e) => evs.push(e.type));
    for (let t = 0; t < 20; t++) { w.s.tick++; updateStorms(w); }
    w.bus.flush();
    expect(w.s.buildings.includes(weak)).toBe(false);
    expect(g.homeId).toBeNull();
    expect(evs).toContain('building_destroyed');
    expect(w.s.tiles.some((t) => t.occupiedBy === weak.id)).toBe(false);
    expect(w.s.tick - tick0).toBeGreaterThan(0);
  });
});
