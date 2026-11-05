import { describe, expect, it } from 'vitest';
import { CFG } from '../config';
import { clockAt } from '../time';
import { completeBuilding, placeBlueprint } from '../buildings';
import { shelterOf } from '../temperature';
import { setWeather } from '../weather';
import { killGoblin } from '../goblin/needs';
import { isSleeping } from '../goblin/goblin';
import { ACTIONS } from '../ai/utility';
import { makeWorld, spawnGoblin } from './helpers';

const DAY = CFG.time.dayTicks;

function morning(w: ReturnType<typeof makeWorld>, day = 2): void {
  w.s.tick = day * DAY + 200;
  w.clock = clockAt(w.s.tick);
  setWeather(w, 'clear');
  w.s.weather.nextChangeTick = w.s.tick + 100 * DAY;
}
const feed = (gs: { needs: { hunger: number; thirst: number } }[]) => gs.forEach((g) => { g.needs.hunger = Math.max(g.needs.hunger, 60); g.needs.thirst = Math.max(g.needs.thirst, 60); });

describe('huts and homes (§P3.4)', () => {
  it('a goblin with materials and no home builds and claims a hut within 2 days', () => {
    const w = makeWorld();
    morning(w);
    const g = spawnGoblin(w);
    g.inventory.push({ type: 'wood', qty: 6 });
    for (let t = 0; t < 2 * DAY; t++) {
      w.step();
      if (t % 300 === 0) feed([g]);
    }
    const home = w.s.buildings.find((b) => b.id === g.homeId);
    expect(home).toBeDefined();
    expect(home!.buildProgress).toBe(1);
    expect(home!.occupants).toContain(g.id);
    expect(home!.ownerId).toBe(g.id);
  });

  it('capacity 2: two homeless goblins share a free hut, a third plans a new one', () => {
    const w = makeWorld({ size: 32 });
    morning(w);
    const hut = placeBlueprint(w, 'hut', { x: 16, y: 20 }, null);
    completeBuilding(w, hut, null);
    const gs = [spawnGoblin(w), spawnGoblin(w), spawnGoblin(w)];
    for (let t = 0; t < 600 && gs.some((g) => g.homeId === null); t++) {
      w.step();
      feed(gs);
    }
    expect(hut.occupants.length).toBe(2);
    const third = gs.find((g) => !hut.occupants.includes(g.id))!;
    expect(third.homeId).not.toBeNull();
    const planned = w.s.buildings.find((b) => b.id === third.homeId)!;
    expect(planned.ownerId).toBe(third.id);
    expect(planned.buildProgress).toBeLessThan(1);
  });

  it('SleepHome: sleeps in its hut at night, sheltered, restoring energy twice as fast as the ground', () => {
    const w = makeWorld();
    w.s.tick = 2 * DAY + Math.round(0.75 * DAY); // night
    w.clock = clockAt(w.s.tick);
    setWeather(w, 'clear');
    w.s.weather.nextChangeTick = w.s.tick + 100 * DAY;
    const hut = placeBlueprint(w, 'hut', { x: 15, y: 15 }, null);
    completeBuilding(w, hut, null);
    const g = spawnGoblin(w, { pos: { x: 10, y: 15 } });
    hut.occupants.push(g.id);
    g.homeId = hut.id;
    g.needs.energy = 30;
    const ground = spawnGoblin(w, { pos: { x: 8, y: 18 } });
    ground.needs.energy = 30;
    expect(ACTIONS.sleep_home.score(g, w)).toBeGreaterThan(ACTIONS.sleep_ground.score(g, w));
    for (let t = 0; t < 200; t++) w.step();
    expect(g.activity.action).toBe('sleep_home');
    expect(isSleeping(g)).toBe(true);
    expect(shelterOf(w, g)).toBe(hut);
    const e0 = g.needs.energy, f0 = ground.needs.energy;
    w.run(150);
    expect((g.needs.energy - e0) / (ground.needs.energy - f0)).toBeCloseTo(2, 1);
  });

  it('surplus food goes into the home pantry (max 6) and comes back out when hungry', () => {
    const w = makeWorld();
    morning(w);
    const hut = placeBlueprint(w, 'hut', { x: 15, y: 15 }, null);
    completeBuilding(w, hut, null);
    const g = spawnGoblin(w, { pos: { x: 13, y: 15 } });
    hut.occupants.push(g.id);
    g.homeId = hut.id;
    g.inventory.push({ type: 'apple', qty: 10 });
    for (let t = 0; t < 400 && !hut.storage.length; t++) w.step();
    expect(hut.storage.reduce((n, s) => n + s.qty, 0)).toBeLessThanOrEqual(6);
    expect(hut.storage.find((s) => s.type === 'apple')!.qty).toBeGreaterThan(0);
    g.inventory = [];
    g.needs.hunger = 30;
    expect(ACTIONS.take_item.isAvailable(g, w)).toBe(true);
  });

  it('a dead resident frees the bed and hands ownership on', () => {
    const w = makeWorld();
    const hut = placeBlueprint(w, 'hut', { x: 15, y: 15 }, null);
    const a = spawnGoblin(w), b = spawnGoblin(w);
    hut.occupants.push(a.id, b.id);
    hut.ownerId = a.id;
    killGoblin(w, a, 'old_age');
    expect(hut.occupants).toEqual([b.id]);
    expect(hut.ownerId).toBe(b.id);
  });
});
