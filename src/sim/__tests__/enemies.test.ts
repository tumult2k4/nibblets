import { describe, expect, it } from 'vitest';
import { CFG } from '../config';
import { clockAt } from '../time';
import { setWeather } from '../weather';
import { completeBuilding, placeBlueprint } from '../buildings';
import { deposit, stockCount } from '../stockpile';
import { dist } from '../../shared/math';
import { moonMul, spawnEnemy, threatBudget, updateDirector } from '../enemies/director';
import { enemiesDecide } from '../enemies/gnasher';
import { deserialize, serialize } from '../save';
import { makeWorld, spawnGoblin } from './helpers';
import type { World } from '../world';
import type { SimEvent } from '../../shared/types';

const DAY = CFG.time.dayTicks;
const E = CFG.enemies;

/** Put the clock at `day` + `frac` with clear, settled weather. */
function at(w: World, day: number, frac: number): void {
  const tick = day * DAY + Math.round(frac * DAY);
  w.s.tick = tick;
  w.clock = clockAt(tick);
  setWeather(w, 'clear');
  w.s.weather.nextChangeTick = tick + 100 * DAY;
}
function events(w: World): SimEvent[] {
  const evs: SimEvent[] = [];
  w.bus.subscribe((e) => evs.push(e));
  return evs;
}
const fed = (w: World) => { for (const g of w.s.goblins) { g.needs.hunger = 90; g.needs.thirst = 90; g.needs.energy = 90; } };

describe('Gnashers and the spawn director (P4.4)', () => {
  it('no threat before day 3; the new moon is darker than the full moon; defense lowers the budget', () => {
    const w = makeWorld();
    at(w, 2, 0.8);
    expect(threatBudget(w)).toBe(0);
    at(w, 8, 0.8); // new moon
    expect(moonMul(w.clock)).toBeCloseTo(E.newMoonMul);
    const dark = threatBudget(w);
    expect(dark).toBeCloseTo((E.baseThreat + 8 * E.rampPerDay) * E.newMoonMul);
    at(w, 12, 0.8); // full moon
    expect(moonMul(w.clock)).toBeCloseTo(E.fullMoonMul);
    expect(threatBudget(w)).toBeLessThan(dark / 1.5);
    at(w, 8, 0.8);
    const fire = placeBlueprint(w, 'campfire', { x: 10, y: 10 }, null);
    completeBuilding(w, fire, null);
    const g = spawnGoblin(w);
    g.equipped.hand = { type: 'spear', qty: 1 };
    expect(threatBudget(w)).toBeCloseTo(dark - (E.fireDefense + E.armedDefense) * E.defenseMul);
  });

  it('a night budget becomes Gnashers that arrive far from the village and out of sight', () => {
    const w = makeWorld({ size: 72 });
    spawnGoblin(w);
    at(w, 8, 0.72);
    const budget = threatBudget(w);
    for (let t = 0; t < 0.25 * DAY; t++) { updateDirector(w); w.s.tick++; w.clock = clockAt(w.s.tick); }
    expect(w.s.enemies.length).toBeGreaterThanOrEqual(Math.floor(budget));
    expect(w.s.enemies.length).toBeLessThanOrEqual(Math.ceil(budget));
    for (const e of w.s.enemies) {
      expect(dist(e.pos, w.s.village.center)).toBeGreaterThanOrEqual(E.spawnMinVillageDist);
      expect(dist(e.pos, w.s.goblins[0]!.pos)).toBeGreaterThanOrEqual(E.spawnMinGoblinDist);
    }
    const n = w.s.enemies.length;
    updateDirector(w); // the same night is never budgeted twice
    expect(w.s.enemies.length).toBe(n);
  });

  it('sneaks up on the stockpile, steals three food and makes off with it', () => {
    const w = makeWorld();
    at(w, 5, 0.72);
    deposit(w.s, { type: 'apple', qty: 5 });
    const evs = events(w);
    const e = spawnEnemy(w, 'gnasher', { x: 21, y: 21 });
    for (let t = 0; t < 600 && !e.carrying; t++) w.step();
    expect(e.carrying).toEqual({ type: 'apple', qty: E.stealQty });
    expect(stockCount(w.s, 'apple')).toBe(5 - E.stealQty);
    expect(evs.some((x) => x.type === 'enemy_stole' && x.qty === E.stealQty)).toBe(true);
    for (let t = 0; t < 600 && w.s.enemies.length; t++) w.step();
    expect(w.s.enemies).toHaveLength(0); // ran back to where it came from and left the map
  });

  it('bites a goblin out on its own, and never lands more than its bite limit in one visit', () => {
    const w = makeWorld();
    at(w, 5, 0.72);
    const g = spawnGoblin(w, { pos: { x: 14, y: 14 } });
    g.health.hp = g.health.maxHp = 400; // tough enough to sit out the whole visit
    const evs = events(w);
    const e = spawnEnemy(w, 'gnasher', { x: 19, y: 19 });
    for (let t = 0; t < 1500 && e.mode !== 'flee' && e.mode !== 'leave'; t++) { w.step(); fed(w); }
    expect(['flee', 'leave']).toContain(e.mode); // driven off, out of bites, or chased away by the dawn
    const landed = evs.filter((x) => x.type === 'enemy_bit' && x.damage > 0);
    expect(landed.length).toBeGreaterThan(0);
    expect(landed.length).toBeLessThanOrEqual(E.maxBites);
    expect(g.health.hp).toBeLessThan(g.health.maxHp - landed.length * E.gnasher.dmg + 15); // healing is slow
    expect(evs.some((x) => x.type === 'enemy_spotted')).toBe(true);
    expect(evs.filter((x) => x.type === 'enemy_fled').length).toBeLessThanOrEqual(1);
  });

  it('is pack-shy: three goblins close by send it running, and two do not', () => {
    const w = makeWorld();
    at(w, 5, 0.75);
    spawnGoblin(w, { pos: { x: 12, y: 12 } });
    spawnGoblin(w, { pos: { x: 13, y: 12 } });
    const e = spawnEnemy(w, 'gnasher', { x: 12.5, y: 13.5 });
    enemiesDecide(w);
    expect(e.mode).not.toBe('flee');
    spawnGoblin(w, { pos: { x: 12, y: 14 } });
    e.nextDecide = w.s.tick;
    enemiesDecide(w);
    expect(e.mode).toBe('flee');
  });

  it('a hurt Gnasher flees, and every Gnasher leaves at dawn', () => {
    const w = makeWorld();
    at(w, 5, 0.75);
    const hurt = spawnEnemy(w, 'gnasher', { x: 20, y: 20 });
    hurt.hp = E.gnasher.hp * E.gnasher.fleeAt - 1;
    const e = spawnEnemy(w, 'gnasher', { x: 20, y: 6 });
    enemiesDecide(w);
    expect(hurt.mode).toBe('flee');
    expect(e.mode).toBe('prowl');
    at(w, 6, 0.1);
    e.nextDecide = w.s.tick;
    enemiesDecide(w);
    expect(e.mode).toBe('leave');
    for (let t = 0; t < 600 && w.s.enemies.length; t++) w.step();
    expect(w.s.enemies).toHaveLength(0);
  });

  it('v4 saves gain an empty enemy list and director state', () => {
    const w = makeWorld();
    spawnEnemy(w, 'gnasher', { x: 20, y: 20 });
    const raw = JSON.parse(serialize(w.s)) as Record<string, unknown>;
    raw.version = 4;
    delete raw.enemies;
    delete raw.threat;
    const s = deserialize(JSON.stringify(raw));
    expect(s.enemies).toEqual([]);
    expect(s.threat).toEqual({ night: -1, spawnAt: [] });
    expect(deserialize(serialize(w.s)).enemies).toHaveLength(1);
  });
});
