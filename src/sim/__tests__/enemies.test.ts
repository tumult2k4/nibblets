import { describe, expect, it } from 'vitest';
import { CFG } from '../config';
import { clockAt } from '../time';
import { setWeather } from '../weather';
import { completeBuilding, placeBlueprint } from '../buildings';
import { deposit, stockCount } from '../stockpile';
import { dist } from '../../shared/math';
import { moonMul, spawnEnemy, threatBudget, updateDirector } from '../enemies/director';
import { isLone } from '../enemies/gnasher';
import { strike } from '../combat';
import { enemiesDecide } from '../enemies';
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

  it('is pack-shy: three armed goblins close by send it running; two do not, nor do three with bare fists', () => {
    const w = makeWorld();
    at(w, 5, 0.75);
    const spear = (g: { equipped: { hand: unknown } }) => (g.equipped.hand = { type: 'spear', qty: 1 });
    spear(spawnGoblin(w, { pos: { x: 12, y: 12 } }));
    spear(spawnGoblin(w, { pos: { x: 13, y: 12 } }));
    const e = spawnEnemy(w, 'gnasher', { x: 12.5, y: 13.5 });
    enemiesDecide(w);
    expect(e.mode).not.toBe('flee');
    const third = spawnGoblin(w, { pos: { x: 12, y: 14 } });
    e.nextDecide = w.s.tick;
    enemiesDecide(w);
    expect(e.mode).not.toBe('flee'); // fists count half: 2.5
    spear(third);
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
    expect(s.threat).toMatchObject({ night: -1, spawnAt: [] });
    expect(deserialize(serialize(w.s)).enemies).toHaveLength(1);
  });
});

describe('Gnashers against an undefended village (P4 acceptance)', () => {
  const asleep = (g: { activity: { action: string; stage: number } }) => { g.activity.action = 'sleep_home'; g.activity.stage = 2; };

  it('get into wattle huts after a lone sleeper, but not past stone walls', () => {
    const w = makeWorld();
    at(w, 5, 0.9);
    const hut = placeBlueprint(w, 'hut', { x: 12, y: 12 }, null);
    completeBuilding(w, hut, null);
    const g = spawnGoblin(w, { pos: { ...hut.pos } });
    asleep(g);
    const mate = spawnGoblin(w, { pos: { x: hut.pos.x + 0.3, y: hut.pos.y } });
    asleep(mate); // a sleeping hut-mate is no help
    expect(isLone(w, g)).toBe(true);
    mate.activity.action = 'idle'; // awake, it is
    expect(isLone(w, g)).toBe(false);
    asleep(mate);
    hut.type = 'stone_hut';
    expect(isLone(w, g)).toBe(false);
  });

  it('keeps its teeth in its victim when someone else punches it, and blood calls the others', () => {
    const w = makeWorld();
    at(w, 5, 0.9);
    const victim = spawnGoblin(w, { pos: { x: 12, y: 12 } });
    const helper = spawnGoblin(w, { pos: { x: 13, y: 12 } });
    const e = spawnEnemy(w, 'gnasher', { x: 12.6, y: 12.6 });
    e.mode = 'attack';
    e.targetId = victim.id;
    let landed = false;
    for (let i = 0; i < 20 && !landed; i++) landed = strike(w, helper, e);
    expect(landed).toBe(true);
    expect(e.targetId).toBe(victim.id);
    // a bare fist barely dents its hide
    expect(e.maxHp - e.hp).toBeLessThan(CFG.combat.fists);
    const other = spawnEnemy(w, 'gnasher', { x: 20, y: 12 });
    other.mode = 'prowl' as typeof other.mode;
    e.timer = 0;
    e.seen = true;
    helper.pos = { x: 30, y: 30 };
    for (let i = 0; i < 60 && (other.mode as string) !== 'attack'; i++) { e.nextDecide = w.s.tick + 99; w.step(); }
    expect(other.mode).toBe('attack');
    expect(other.targetId).toBe(victim.id);
  });
});
