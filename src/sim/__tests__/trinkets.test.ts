import { describe, expect, it } from 'vitest';
import { CFG } from '../config';
import { clockAt } from '../time';
import { setWeather } from '../weather';
import { completeBuilding, placeBlueprint } from '../buildings';
import { updateMood } from '../goblin/mood';
import { killGoblin } from '../goblin/needs';
import { updateTraits } from '../goblin/traits';
import { killEnemy } from '../combat';
import { spawnEnemy } from '../enemies/director';
import { Decorate, HuntTrinket } from '../ai/actions/trinkets';
import { Court } from '../ai/actions/courtship';
import {
  carried, decorate, giveTrinket, isHoarder, itemValue, passTrinket, shelfCount, trinketValue, trinketsOf, updateTrinkets,
} from '../trinkets';
import { deserialize, serialize } from '../save';
import { makeWorld, spawnGoblin } from './helpers';
import type { UtilityAction } from '../ai/action';
import type { Building, Goblin } from '../state';
import type { World } from '../world';
import type { SimEvent } from '../../shared/types';

const DAY = CFG.time.dayTicks, T = CFG.trinkets;

function at(w: World, tick: number): void {
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
function homeFor(w: World, g: Goblin, p = { x: 8, y: 16 }): Building {
  const b = placeBlueprint(w, 'hut', p, g.id);
  completeBuilding(w, b, g.id);
  g.homeId = b.id;
  if (!b.occupants.includes(g.id)) b.occupants.push(g.id);
  return b;
}

describe('trinkets (P8.2, §12.1–12.2)', () => {
  it('HuntTrinket: a search at the shore feeds curiosity and now and then turns something up', () => {
    const w = makeWorld({ size: 30 }); // a pond in the north-west corner gives a shore
    at(w, 2 * DAY);
    let found = 0, searches = 0;
    for (let i = 0; i < 30; i++) {
      const g = spawnGoblin(w, { pos: { x: 8, y: 8 } });
      g.needs.curiosity = 30;
      expect(HuntTrinket.isAvailable(g, w)).toBe(true);
      expect(run(w, g, HuntTrinket)).toBe('done');
      searches++;
      expect(g.needs.curiosity).toBeCloseTo(30 + T.hunt.curiosity, 4);
      expect(HuntTrinket.isAvailable(g, w)).toBe(false); // rests from it for half a day
      found += g.trinkets.length;
      w.s.goblins.splice(w.s.goblins.indexOf(g), 1); // out of the next one's way
      w.rebuildCaches();
    }
    expect(found).toBeGreaterThan(0);
    expect(found).toBeLessThan(searches * 0.4);
  });

  it('a storm leaves glints on the shore; a search there always finds one', () => {
    const w = makeWorld({ size: 30 });
    at(w, 2 * DAY);
    const evs = events(w);
    w.s.weather.kind = 'storm';
    w.s.tick = 100;
    updateTrinkets(w);
    expect(w.s.stormWash).toBe(true);
    w.s.weather.kind = 'clear';
    w.s.tick = 150;
    updateTrinkets(w);
    w.bus.flush();
    expect(w.s.glints!.length).toBeGreaterThanOrEqual(1);
    expect(evs.some((e) => e.type === 'glints_washed_up')).toBe(true);
    const gl = w.s.glints![0]!;
    const g = spawnGoblin(w, { pos: { ...gl.pos } });
    g.needs.curiosity = 90; // not curious, but a glint in sight draws it
    expect(HuntTrinket.isAvailable(g, w)).toBe(true);
    expect(run(w, g, HuntTrinket)).toBe('done');
    expect(trinketsOf(g, w)[0]!.rarity).toBe(gl.rarity);
    expect(w.s.glints!.some((x) => x.id === gl.id)).toBe(false);
    // and the tide takes the rest after three days
    w.s.tick = 150 + T.storm.days * DAY + 50;
    updateTrinkets(w);
    expect(w.s.glints!.length).toBe(0);
  });

  it('Decorate puts carried trinkets on the home shelf (six at most); sleeping under them cheers', () => {
    const w = makeWorld();
    at(w, 2 * DAY);
    const g = spawnGoblin(w, { pos: { x: 12, y: 12 } });
    const home = homeFor(w, g);
    for (let i = 0; i < 8; i++) giveTrinket(w, g, i < 2 ? 'rare' : 'common');
    expect(Decorate.isAvailable(g, w)).toBe(true);
    expect(run(w, g, Decorate)).toBe('done');
    expect(home.decoration).toHaveLength(T.shelf.max);
    expect(carried(g, w)).toHaveLength(2);
    expect(carried(g, w).every((t) => t.rarity === 'common')).toBe(true); // the best go up first
    expect(Decorate.isAvailable(g, w)).toBe(false); // the shelf is full
    expect(shelfCount(g, w)).toBe(6);
    g.activity = { ...g.activity, action: 'sleep_home' };
    w.s.tick = Math.ceil(w.s.tick / 50) * 50 - 10;
    updateMood(w);
    w.s.tick += 10;
    updateMood(w);
    expect(g.mood.modifiers.find((m) => m.id === 'decorated_home')?.amount).toBe(T.shelf.max * T.shelf.moodPer);
  });

  it('value: by rarity, twice to a hoarder (earned at eight trinkets); food dearer to gluttons and in winter', () => {
    const w = makeWorld();
    at(w, 2 * DAY);
    const g = spawnGoblin(w);
    const t = giveTrinket(w, g, 'rare');
    expect(trinketValue(g, t)).toBe(T.value.rare);
    for (let i = 0; i < 7; i++) giveTrinket(w, g, 'common');
    w.s.tick = (CFG.traits.checkEvery * 100 - g.id * 7) % CFG.traits.checkEvery + CFG.traits.checkEvery * 100;
    updateTraits(w);
    expect(isHoarder(g)).toBe(true);
    expect(trinketValue(g, t)).toBe(T.value.rare * T.hoarderMul);
    g.personality.gluttony = 0.9;
    const base = itemValue(g, w, 'apple');
    g.personality.gluttony = 0.1;
    expect(base).toBeCloseTo(itemValue(g, w, 'apple') * T.gluttonFoodMul, 4);
    let d = 0;
    while (clockAt(d * DAY + 100).season !== 'winter') d++;
    at(w, d * DAY + 100); // winter
    expect(w.clock.season).toBe('winter');
    expect(itemValue(g, w, 'apple')).toBeCloseTo((base / T.gluttonFoodMul) * T.winterFoodMul, 4);
    expect(itemValue(g, w, 'stone')).toBe(itemValue(g, w, 'stone')); // not food: the same all year
  });

  it('a fresh courtship opens with a trinket, which passes hands and its history remembers it', () => {
    const w = makeWorld();
    at(w, 2 * DAY);
    const evs = events(w);
    const a = spawnGoblin(w, { pos: { x: 12, y: 12 } }), b = spawnGoblin(w, { pos: { x: 12.6, y: 12 } });
    const t = giveTrinket(w, a, 'uncommon');
    a.relationships.push({ targetId: b.id, opinion: 60, familiarity: 50, bond: 'friend', lastInteraction: 0 });
    b.relationships.push({ targetId: a.id, opinion: 60, familiarity: 50, bond: 'friend', lastInteraction: 0 });
    a.activity = { action: 'court', status: 'running', startedTick: w.s.tick, targetId: b.id, target: null, path: [], progress: 0, stage: 0 };
    for (let i = 0; i < 2000 && Court.step(a, w) === 'running'; i++) { w.bus.flush(); w.s.tick++; }
    w.bus.flush();
    expect(a.trinkets).not.toContain(t.id);
    expect(b.trinkets).toContain(t.id);
    expect(t.history).toEqual([a.id, b.id]);
    expect(evs.some((e) => e.type === 'trinket_given' && e.toId === b.id)).toBe(true);
  });

  it('on a death the best piece goes into the grave and the rest to the mate; shelves follow', () => {
    const w = makeWorld();
    at(w, 2 * DAY);
    const g = spawnGoblin(w), mate = spawnGoblin(w);
    g.relationships.push({ targetId: mate.id, opinion: 80, familiarity: 80, bond: 'mate', lastInteraction: 0 });
    mate.relationships.push({ targetId: g.id, opinion: 80, familiarity: 80, bond: 'mate', lastInteraction: 0 });
    const home = homeFor(w, g);
    mate.homeId = home.id;
    home.occupants.push(mate.id);
    const best = giveTrinket(w, g, 'rare');
    const a = giveTrinket(w, g, 'common'), b = giveTrinket(w, g, 'common');
    decorate(w, g, home);
    killGoblin(w, g, 'old_age');
    expect(w.s.graves[0]!.goods).toBe(best.id);
    expect(mate.trinkets).toEqual(expect.arrayContaining([a.id, b.id]));
    expect(mate.trinkets).not.toContain(best.id);
    expect(home.decoration).toEqual(expect.arrayContaining([a.id, b.id])); // the mate lives there: they stay up
    expect(home.decoration).not.toContain(best.id);
    // passing to someone living elsewhere takes it off the shelf
    const other = spawnGoblin(w);
    passTrinket(w, w.s.trinkets.find((x) => x.id === a.id)!, mate, other);
    expect(home.decoration).not.toContain(a.id);
    expect(other.trinkets).toContain(a.id);
  });

  it('a beaten Gnasher sometimes leaves a trinket for whoever beat it', () => {
    const w = makeWorld();
    at(w, 2 * DAY);
    const g = spawnGoblin(w);
    for (let i = 0; i < 40; i++) {
      const e = spawnEnemy(w, 'gnasher', { x: 5, y: 5 });
      killEnemy(w, e, g);
    }
    expect(g.trinkets.length).toBeGreaterThan(4);
    expect(g.trinkets.length).toBeLessThan(25);
  });

  it('glints and shelves survive a save', () => {
    const w = makeWorld();
    const g = spawnGoblin(w);
    const home = homeFor(w, g);
    giveTrinket(w, g, 'common');
    decorate(w, g, home);
    w.s.glints = [{ id: 999, pos: { x: 3, y: 3 }, rarity: 'uncommon', until: 5000 }];
    const back = deserialize(serialize(w.s));
    expect(back.glints).toEqual(w.s.glints);
    expect(back.buildings.find((b) => b.id === home.id)!.decoration).toEqual(home.decoration);
  });
});
