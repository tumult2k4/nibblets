import { describe, expect, it } from 'vitest';
import { CFG } from '../config';
import { clockAt } from '../time';
import { setWeather } from '../weather';
import { allocId } from '../../shared/ids';
import { Fish } from '../ai/actions/fish';
import { DigClay, clayWanted } from '../ai/actions/digClay';
import { Process } from '../ai/actions/process';
import { Craft } from '../ai/actions/craft';
import { WaterPlant } from '../ai/actions/waterPlant';
import { ExtinguishFire } from '../ai/actions/fireFight';
import { Eat } from '../ai/actions/eat';
import { completeBuilding, placeBlueprint } from '../buildings';
import { addItem, countItem } from '../inventory';
import { deposit, stockCount } from '../stockpile';
import { processJob } from '../preserve';
import { isClayGround, kilnSpark } from '../kiln';
import { stockRotMul, updateSpoilage } from '../spoilage';
import { discoveryChance, learn } from '../knowledge';
import { chooseCraft } from '../crafting';
import { usesLeft } from '../tools';
import { ignite } from '../wildfire';
import { makeWorld, placePlant, spawnGoblin } from './helpers';
import type { UtilityAction } from '../ai/action';
import type { Building, Critter, Goblin } from '../state';
import type { World } from '../world';
import type { BuildingType, SimEvent } from '../../shared/types';

const DAY = CFG.time.dayTicks, E = CFG.economy;

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
function withCfg<T>(o: object, vals: Record<string, number>, f: () => T): T {
  const k = o as Record<string, number>;
  const old = Object.fromEntries(Object.keys(vals).map((x) => [x, k[x]!]));
  Object.assign(k, vals);
  try { return f(); } finally { Object.assign(k, old); }
}
/** Run `a` to its end; returns the result and the ticks it took. */
function run(w: World, g: Goblin, a: UtilityAction, max = 4000): [string, number] {
  g.activity = { action: a.id, status: 'running', startedTick: w.s.tick, targetId: null, target: null, path: [], progress: 0, stage: 0 };
  if (!a.start(g, w)) return ['failed', 0];
  for (let i = 0; i < max; i++) {
    const r = a.step(g, w);
    w.bus.flush();
    w.s.tick++;
    if (r !== 'running') return [r, i + 1];
  }
  return ['timeout', max];
}
function station(w: World, type: BuildingType, x: number, y: number): Building {
  const b = placeBlueprint(w, type, { x, y }, null);
  completeBuilding(w, b, null);
  return b;
}
function fish(w: World, x: number, y: number): Critter {
  const c: Critter = { id: allocId(w.s), kind: 'fish', pos: { x, y }, z: 0, heading: 0, hp: 1, fed: 1, mode: 'idle', goal: null, targetId: null, until: 0 };
  w.s.wildlife.push(c);
  return c;
}

describe('the wider economy (P7.2, §11.1–11.2)', () => {
  it('a goblin with a rod fishes from the shore by a fish it can see, and the first catch is news', () => {
    const w = makeWorld({ size: 30 });
    at(w, 3, 0.3);
    const g = spawnGoblin(w, { pos: { x: 10.5, y: 10.5 } });
    const c = fish(w, 2.5, 2.5);
    expect(Fish.isAvailable(g, w)).toBe(false); // no rod
    addItem(g, { type: 'fishing_rod', qty: 1 });
    expect(Fish.isAvailable(g, w)).toBe(true);
    expect(Fish.score(g, w)).toBeGreaterThan(0);
    const evs = events(w);
    const [r] = withCfg(E.fishing, { catch: 1 }, () => run(w, g, Fish));
    expect(r).toBe('done');
    expect(countItem(g, 'fish')).toBe(1);
    expect(w.s.wildlife.includes(c)).toBe(false);
    expect(evs.some((e) => e.type === 'fish_caught' && e.caught && e.first)).toBe(true);
    expect(usesLeft(g.inventory.find((s) => s.type === 'fishing_rod')!)).toBe(29);
    expect(g.memory.some((m) => m.kind === 'fishing_spot')).toBe(true);
    // nothing left to fish for
    expect(Fish.isAvailable(g, w)).toBe(false);
  });

  it('a fish leaping near the shore puts a goblin with a stick in mind of a rod', () => {
    const w = makeWorld({ size: 30 });
    at(w, 3, 0.3);
    const g = spawnGoblin(w, { pos: { x: 6.5, y: 6.5 } });
    addItem(g, { type: 'stick', qty: 2 });
    addItem(g, { type: 'fiber', qty: 2 });
    const far = discoveryChance(g, w, 'fishing_rod');
    expect(far).toBeGreaterThan(0);
    fish(w, 2.5, 2.5);
    expect(discoveryChance(g, w, 'fishing_rod')).toBeCloseTo(far * E.fishing.ideaNear, 6);
  });

  it('raw fish and meat are cooked at a lit campfire by the store; eaten raw they may turn the gut', () => {
    const w = makeWorld({ size: 30 });
    at(w, 3, 0.3);
    const sp = w.s.village.stockpilePos;
    const fire = station(w, 'campfire', sp.x - 3, sp.y);
    fire.fuel = 100;
    deposit(w.s, { type: 'fish', qty: 2 });
    deposit(w.s, { type: 'meat', qty: 1 });
    const g = spawnGoblin(w, { pos: { ...sp } });
    expect(processJob(g, w)?.kind).toBe('cook');
    const evs = events(w);
    const [r] = run(w, g, Process);
    expect(r).toBe('done');
    expect(stockCount(w.s, 'cooked_fish') + countItem(g, 'cooked_fish')).toBe(2);
    expect(stockCount(w.s, 'cooked_meat') + countItem(g, 'cooked_meat')).toBe(1);
    expect(stockCount(w.s, 'fish') + stockCount(w.s, 'meat')).toBe(0);
    expect(evs.filter((e) => e.type === 'food_cooked')).toHaveLength(3);
    // a raw fish, eaten
    const h = spawnGoblin(w, { pos: { x: 6.5, y: 20.5 } });
    h.needs.hunger = 20;
    addItem(h, { type: 'fish', qty: 1 });
    withCfg(E, { rawGutRot: 1 }, () => run(w, h, Eat));
    expect(h.health.disease?.id).toBe('gut_rot');
  });

  it('clay is dug by the water: a lump or two before the kiln is known, a store of it after', () => {
    const w = makeWorld({ size: 30 });
    at(w, 3, 0.3);
    expect(isClayGround(w.s, 4.5, 1.5)).toBe(true); // meadow beside the pond
    expect(isClayGround(w.s, 12.5, 12.5)).toBe(false);
    const g = spawnGoblin(w, { pos: { x: 10.5, y: 8.5 } });
    expect(DigClay.isAvailable(g, w)).toBe(true);
    const evs = events(w);
    const [r] = run(w, g, DigClay);
    expect(r).toBe('done');
    expect(countItem(g, 'clay')).toBe(E.clay.qty);
    expect(evs.some((e) => e.type === 'clay_dug')).toBe(true);
    expect(clayWanted(g, w)).toBe(0);
    learn(w, g, 'kiln', 'discovery');
    w.s.tick++;
    expect(clayWanted(g, w)).toBeGreaterThan(0);
  });

  it('the kiln: thought of at a store with clay and stone, it fires buckets and pots, and now and then throws a spark', () => {
    const w = makeWorld({ size: 30 });
    at(w, 3, 0.3);
    const sp = w.s.village.stockpilePos;
    const g = spawnGoblin(w, { pos: { ...sp } });
    expect(discoveryChance(g, w, 'kiln')).toBe(0);
    deposit(w.s, { type: 'clay', qty: 2 });
    deposit(w.s, { type: 'stone', qty: 2 });
    expect(discoveryChance(g, w, 'kiln')).toBe(0); // a kiln is a fire with walls: not before the first campfire
    station(w, 'campfire', sp.x - 4, sp.y);
    expect(discoveryChance(g, w, 'kiln')).toBeGreaterThan(0);
    addItem(g, { type: 'clay', qty: 2 });
    deposit(w.s, { type: 'wood', qty: 4 });
    expect(discoveryChance(g, w, 'bucket')).toBe(0); // not before a kiln stands
    const k = station(w, 'kiln', sp.x + 4, sp.y + 3);
    expect(discoveryChance(g, w, 'bucket')).toBeGreaterThan(0);
    learn(w, g, 'bucket', 'discovery');
    expect(chooseCraft(g, w)?.id).toBe('bucket');
    const [r] = run(w, g, Craft);
    expect(r).toBe('done');
    expect(countItem(g, 'bucket')).toBe(1);
    expect(Math.hypot(g.pos.x - k.pos.x, g.pos.y - k.pos.y)).toBeLessThan(1.5); // fired at the kiln
    // a bush right beside it catches
    placePlant(w, 'apple_bush', 'mature', { x: k.pos.x + 1, y: k.pos.y });
    withCfg(E.kiln, { spark: 1 }, () => kilnSpark(w, k));
    expect(w.s.fires.length).toBeGreaterThan(0);
  });

  it('a bucket waters five plants on one trip and puts out a fire three times as fast', () => {
    const w = makeWorld({ size: 30 });
    at(w, 12, 0.3);
    const g = spawnGoblin(w, { pos: { x: 8.5, y: 8.5 } });
    addItem(g, { type: 'bucket', qty: 1 });
    const ps = [0, 1, 2, 3, 4, 5].map((i) => placePlant(w, 'apple_bush', 'sapling', { x: 12.5 + (i % 3), y: 12.5 + Math.floor(i / 3) }));
    for (const p of ps) p.hydration = 0.1;
    const evs = events(w);
    const [r] = run(w, g, WaterPlant);
    expect(r).toBe('done');
    expect(evs.filter((e) => e.type === 'plant_watered')).toHaveLength(E.bucket.waterMul);
    expect(ps.filter((p) => p.hydration > 0.1)).toHaveLength(E.bucket.waterMul);
    // stomping one burning tile, with and without
    const stomp = (bucket: boolean): number => {
      const v = makeWorld({ size: 30 });
      at(v, 12, 0.3);
      const x = spawnGoblin(v, { pos: { x: 14.5, y: 13.5 } });
      if (bucket) addItem(x, { type: 'bucket', qty: 1 });
      ignite(v, 14, 14, 1, 'test');
      const evs = events(v);
      x.activity = { action: 'extinguish_fire', status: 'running', startedTick: v.s.tick, targetId: null, target: null, path: [], progress: 0, stage: 0 };
      expect(ExtinguishFire.start(x, v)).toBe(true);
      for (let i = 0; i < 1000; i++) {
        ExtinguishFire.step(x, v);
        v.bus.flush();
        v.s.tick++;
        if (evs.some((e) => e.type === 'fire_stomped')) return i;
      }
      return Infinity;
    };
    const bare = stomp(false), wet = stomp(true);
    expect(wet).toBeLessThan(bare / 2);
  });

  it('clay pots in the store keep food half as long again', () => {
    const w = makeWorld({ size: 30 });
    deposit(w.s, { type: 'apple', qty: 30 });
    const apples = w.s.village.stockpile.find((s) => s.type === 'apple')!;
    expect(stockRotMul(w.s).get(apples)).toBe(1);
    deposit(w.s, { type: 'pot', qty: 2 });
    const sealed = 2 * E.pot.per / 30;
    expect(stockRotMul(w.s).get(apples)).toBeCloseTo(sealed / E.pot.shelfMul + (1 - sealed), 6);
    const rot = (pots: number): number => {
      const v = makeWorld({ size: 30 });
      deposit(v.s, { type: 'apple', qty: 30 });
      if (pots) deposit(v.s, { type: 'pot', qty: pots });
      v.s.tick = Math.ceil(v.s.tick / CFG.preserve.spoilEvery) * CFG.preserve.spoilEvery;
      for (let i = 0; i < (4 * DAY) / CFG.preserve.spoilEvery; i++) { v.s.tick += CFG.preserve.spoilEvery; updateSpoilage(v); }
      return 30 - stockCount(v.s, 'apple');
    };
    expect(rot(3)).toBeLessThan(rot(0) * 0.8);
  });
});
