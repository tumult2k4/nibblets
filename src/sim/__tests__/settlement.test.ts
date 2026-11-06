import { describe, expect, it } from 'vitest';
import { CFG } from '../config';
import { clockAt } from '../time';
import { setWeather } from '../weather';
import { PlanBuilding, hearthJob, villageNeeds } from '../ai/actions/village';
import { CookStew } from '../ai/actions/stew';
import { Drink } from '../ai/actions/drink';
import { Eat } from '../ai/actions/eat';
import { ClaimHome, claim, bedSpot } from '../ai/actions/home';
import { LayEgg } from '../ai/actions/courtship';
import { completeBuilding, placeBlueprint } from '../buildings';
import { addItem, countItem } from '../inventory';
import { deposit, stockCount } from '../stockpile';
import { learn } from '../knowledge';
import { campfires, fireWarmth, isLit } from '../fire';
import { ambientWarmth, nestSpot } from '../eggs';
import { becomeMates, layEggs } from '../goblin/family';
import { shelterOf } from '../temperature';
import { waterTargets } from '../ai/targets';
import { hearthOf, inNursery, stewHearth, wantsLonghouse, wantsNursery, wantsWell, wellSpot } from '../settlement';
import { makeWorld, spawnGoblin } from './helpers';
import type { UtilityAction } from '../ai/action';
import type { Building, Goblin } from '../state';
import type { World } from '../world';
import type { BuildingType, SimEvent } from '../../shared/types';

const DAY = CFG.time.dayTicks;

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
function run(w: World, g: Goblin, a: UtilityAction, max = 4000): string {
  g.activity = { action: a.id, status: 'running', startedTick: w.s.tick, targetId: null, target: null, path: [], progress: 0, stage: 0 };
  if (!a.start(g, w)) return 'failed';
  for (let i = 0; i < max; i++) {
    const r = a.step(g, w);
    w.bus.flush();
    w.s.tick++;
    if (r !== 'running') return r;
  }
  return 'timeout';
}
function station(w: World, type: BuildingType, x: number, y: number): Building {
  const b = placeBlueprint(w, type, { x, y }, null);
  completeBuilding(w, b, null);
  return b;
}

describe('settlement (P7.3, §11.1–11.2, §13.3)', () => {
  it('a goblin who knows the hearth builds one against its home: a lit fire that warms the home and the nest', () => {
    const w = makeWorld({ size: 30 });
    at(w, 3, 0.3);
    const hut = station(w, 'hut', 20, 20);
    const g = spawnGoblin(w, { pos: { x: 18.5, y: 18.5 } });
    claim(w, g, hut);
    station(w, 'campfire', 10, 10);
    expect(hearthJob(g, w)).toBeNull(); // not before it knows how
    learn(w, g, 'hearth', 'discovery');
    expect(hearthJob(g, w)).toBeNull(); // not while the store is bare
    deposit(w.s, { type: 'apple', qty: 10 });
    expect(PlanBuilding.isAvailable(g, w)).toBe(true);
    expect(run(w, g, PlanBuilding)).toBe('done');
    const h = hearthOf(w.s, hut)!;
    expect(h).toBeDefined();
    expect(h.type).toBe('hearth');
    expect(Math.max(Math.abs(h.pos.x + 0.5 - hut.pos.x), Math.abs(h.pos.y + 0.5 - hut.pos.y))).toBeLessThanOrEqual(1.5);
    expect(PlanBuilding.isAvailable(g, w) && run(w, g, PlanBuilding) === 'done' && w.s.buildings.filter((b) => b.type === 'hearth').length).not.toBe(2);
    completeBuilding(w, h, g.id);
    expect(isLit(h)).toBe(true);
    expect(campfires(w)).toContain(h);
    expect(villageNeeds(w)).not.toContain('campfire'); // a hearth is no campfire
    expect(fireWarmth(w, hut.pos)).toBeGreaterThan(5);
    const egg = layEggs(w, g, g, nestSpot(hut))[0]!;
    h.fuel = 0;
    const cold = ambientWarmth(w, egg);
    h.fuel = 500;
    expect(ambientWarmth(w, egg)).toBeGreaterThan(cold);
  });

  it('stew is cooked at a lit hearth from apple, mushroom and fish (or two of anything), and cheers whoever eats it', () => {
    const w = makeWorld({ size: 30 });
    at(w, 3, 0.3);
    const sp = w.s.village.stockpilePos;
    const h = station(w, 'hearth', Math.floor(sp.x) - 4, Math.floor(sp.y));
    h.fuel = 2000;
    deposit(w.s, { type: 'apple', qty: 30 }); // stew takes only apples past the spare (drying and mash come first)
    deposit(w.s, { type: 'mushroom', qty: 1 });
    deposit(w.s, { type: 'cooked_fish', qty: 1 });
    const g = spawnGoblin(w, { pos: { ...sp } });
    expect(stewHearth(w)).toBe(h);
    const evs = events(w);
    expect(CookStew.isAvailable(g, w)).toBe(true);
    expect(run(w, g, CookStew)).toBe('done');
    expect(stockCount(w.s, 'stew')).toBe(2);
    // the first took one of each; the second two apples
    expect(stockCount(w.s, 'mushroom') + stockCount(w.s, 'cooked_fish')).toBe(0);
    expect(stockCount(w.s, 'apple')).toBe(27);
    expect(countItem(g, 'apple_core')).toBe(3); // the cook keeps the cores to plant
    expect(evs.some((e) => e.type === 'food_cooked' && e.item === 'stew' && e.first)).toBe(true);
    // not while the store is short of food
    w.s.village.stockpile = [{ type: 'apple', qty: 3 }];
    expect(stewHearth(w)).toBeNull();
    const e = spawnGoblin(w, { pos: { x: 8.5, y: 20.5 } });
    e.needs.hunger = 30;
    addItem(e, { type: 'stew', qty: 1 });
    expect(run(w, e, Eat)).toBe('done');
    expect(e.mood.modifiers.some((m) => m.id === 'ate_stew' && m.amount === CFG.settlement.stew.mood)).toBe(true);
  });

  it('a longhouse is wanted once a grown village of homes has adults go homeless, sleeps eight and shelters them all', () => {
    const w = makeWorld({ size: 40 });
    at(w, 3, 0.3);
    const gs = Array.from({ length: 14 }, (_, i) => spawnGoblin(w, { pos: { x: 6.5 + i, y: 12.5 } }));
    expect(wantsLonghouse(w.s)).toBe(false); // not before the village has homes of its own
    const huts = [[24, 24], [28, 24], [24, 28], [28, 28]].map(([x, y]) => station(w, 'hut', x!, y!));
    huts.forEach((h, i) => { claim(w, gs[2 * i]!, h); claim(w, gs[2 * i + 1]!, h); });
    expect(wantsLonghouse(w.s)).toBe(true);
    station(w, 'campfire', 8, 16);
    learn(w, gs[0]!, 'longhouse', 'discovery');
    expect(villageNeeds(w)).toContain('longhouse');
    const lh = station(w, 'longhouse', 15, 21);
    expect(wantsLonghouse(w.s)).toBe(false);
    // the huts are full; the next eight move into the longhouse's beds
    for (let i = 8; i < 16; i++) expect(run(w, gs[i] ?? spawnGoblin(w, { pos: { x: 10.5, y: 10.5 + i } }), ClaimHome)).toBe('done');
    expect(lh.occupants.length).toBe(8);
    for (const id of lh.occupants) {
      const g = w.goblin(id)!;
      g.pos = bedSpot(lh, g);
      expect(shelterOf(w, g)).toBe(lh);
    }
  });

  it('a well is wanted when the water is a walk away, and goblins drink at it', () => {
    const w = makeWorld({ size: 30 });
    at(w, 3, 0.3);
    expect(wantsWell(w.s)).toBe(true);
    const well = station(w, 'well', 16, 18);
    expect(wantsWell(w.s)).toBe(false);
    const g = spawnGoblin(w, { pos: { x: 17.5, y: 16.5 } });
    g.needs.thirst = 30;
    expect(waterTargets(g, 1, w)[0]).toEqual(wellSpot(well, g.id));
    expect(run(w, g, Drink)).toBe('done');
    expect(g.needs.thirst).toBeGreaterThan(30);
    expect(Math.hypot(g.pos.x - well.pos.x - 0.5, g.pos.y - well.pos.y - 0.5)).toBeLessThan(1.3);
  });

  it('the nursery is wanted once there are couples, takes the eggs and keeps them warm', () => {
    const w = makeWorld({ size: 30 });
    at(w, 3, 0.3);
    const a = spawnGoblin(w, { pos: { x: 12.5, y: 12.5 } }), b = spawnGoblin(w, { pos: { x: 13.5, y: 12.5 } });
    expect(wantsNursery(w.s)).toBe(false);
    becomeMates(w, a, b);
    expect(wantsNursery(w.s)).toBe(true);
    const hut = station(w, 'hut', 20, 20);
    claim(w, a, hut);
    claim(w, b, hut);
    const n = station(w, 'nursery', 12, 18);
    a.activity = { action: 'lay_egg', status: 'running', startedTick: w.s.tick, targetId: null, target: null, path: [], progress: 0, stage: 0 };
    expect(LayEgg.start(a, w)).toBe(true);
    const spot = a.activity.target!;
    expect(inNursery(w.s, spot)).toBe(true);
    const egg = layEggs(w, a, b, spot)[0]!;
    at(w, 27, 0.9); // a winter night
    expect(ambientWarmth(w, egg)).toBe(1);
    expect(n.type).toBe('nursery');
  });
});
