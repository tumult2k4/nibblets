import { describe, expect, it } from 'vitest';
import { CFG } from '../config';
import { clockAt } from '../time';
import { setWeather } from '../weather';
import { completeBuilding, placeBlueprint } from '../buildings';
import { ateFood } from '../goblin/mood';
import { drift } from '../goblin/drift';
import { grantTrait, hasTrait, sleepTime, updateTraits } from '../goblin/traits';
import { sleepScore } from '../ai/actions/sleepGround';
import { beginFestival, updateFestivals } from '../festivals';
import { makeWorld, spawnGoblin } from './helpers';
import type { Goblin } from '../state';
import type { World } from '../world';
import type { SimEvent } from '../../shared/types';

const DAY = CFG.time.dayTicks, CH = CFG.character;

function at(w: World, tick: number): void {
  w.s.tick = tick;
  w.clock = clockAt(tick);
  setWeather(w, 'clear');
  w.s.weather.nextChangeTick = tick + 100 * DAY;
}
/** Run the hourly trait round for `g` (its staggered slot). */
function hourFor(w: World, g: Goblin): void {
  let t = w.s.tick;
  while ((t + g.id * 7) % CFG.traits.checkEvery !== 0) t++;
  at(w, t);
  updateTraits(w);
  w.bus.flush();
}

describe('character: epithets, the last acquired traits, life drift (P8.7)', () => {
  it('an epithet is earned by deeds, once; "Old" comes with age and gives way to a deed', () => {
    const w = makeWorld({ size: 30 });
    const evs: SimEvent[] = [];
    w.bus.subscribe((e) => evs.push(e));
    const g = spawnGoblin(w);
    at(w, 2 * DAY);
    hourFor(w, g);
    expect(g.epithet).toBeNull();
    g.deeds.kills = CH.epithets.brave;
    g.deeds.planted = 99;
    hourFor(w, g);
    expect(g.epithet).toBe('brave'); // the first that fits
    expect(evs.some((e) => e.type === 'epithet_earned' && e.goblinId === g.id && e.epithet === 'brave')).toBe(true);
    g.deeds.builds = 99;
    hourFor(w, g);
    expect(g.epithet).toBe('brave'); // kept for life
    const e = spawnGoblin(w, { ageDays: 100 });
    e.lifespanDays = 140;
    e.lifeStage = 'elder';
    hourFor(w, e);
    expect(e.epithet).toBe('old');
    e.deeds.prayers = CH.epithets.devout;
    hourFor(w, e);
    expect(e.epithet).toBe('devout');
  });

  it('life drift: a notable event nudges the nature, never more than 0.2 from the baseline; a trait moves the baseline', () => {
    const w = makeWorld({ size: 30 });
    const g = spawnGoblin(w);
    g.personality.sociability = 0.5;
    drift(g, 'festival');
    expect(g.personality.sociability).toBeCloseTo(0.51, 4);
    expect(g.baseline?.sociability).toBe(0.5);
    for (let i = 0; i < 40; i++) drift(g, 'festival');
    expect(g.personality.sociability).toBeCloseTo(0.5 + CH.drift.cap, 4);
    drift(g, 'child_lost');
    expect(g.personality.piety).toBeGreaterThan(g.baseline!.piety);
    expect(g.personality.bravery).toBeLessThan(g.baseline!.bravery);
    const b = g.personality.bravery;
    grantTrait(w, g, 'orphan', true); // +0.1 bravery, for life
    expect(g.baseline!.bravery).toBeCloseTo(Math.min(1, g.baseline!.bravery), 4);
    expect(g.personality.bravery).toBeCloseTo(Math.min(1, b + CFG.traits.orphanBravery), 4);
    drift(g, 'fought');
    expect(g.personality.bravery).toBeCloseTo(Math.min(1, b + CFG.traits.orphanBravery + 0.01), 4);
  });

  it('a festival makes those who came a little more sociable, Starfall a little more pious', () => {
    const w = makeWorld({ size: 30 });
    const fire = placeBlueprint(w, 'campfire', { x: 15, y: 15 }, null);
    completeBuilding(w, fire, null);
    const g = spawnGoblin(w);
    const soc = g.personality.sociability, pi = g.personality.piety;
    at(w, 10 * DAY + DAY / 2);
    const f = beginFestival(w, 'merrymaking')!;
    f.came[g.id] = CFG.festivals.at.minTicks;
    w.s.tick = f.endTick;
    updateFestivals(w);
    expect(g.personality.sociability).toBeCloseTo(Math.min(1, soc + 0.01), 4);
    w.s.village.culture!.star = { pos: { x: 20, y: 20 }, tick: w.s.tick };
    const s = beginFestival(w, 'starfall')!;
    s.came[g.id] = CFG.festivals.at.minTicks;
    w.s.tick = s.endTick;
    updateFestivals(w);
    expect(g.personality.piety).toBeCloseTo(Math.min(1, pi + 0.01), 4);
  });

  it('gourmand: ten cooked meals, then cooked food cheers it and raw meat puts it out', () => {
    const w = makeWorld({ size: 30 });
    const g = spawnGoblin(w);
    at(w, 2 * DAY);
    for (let i = 0; i < CH.gourmand.cooked; i++) ateFood(w, g, i % 2 ? 'stew' : 'cooked_fish');
    expect(g.mood.modifiers.some((m) => m.id === 'savoured')).toBe(false);
    hourFor(w, g);
    expect(hasTrait(g, 'gourmand')).toBe(true);
    ateFood(w, g, 'stew');
    expect(g.mood.modifiers.find((m) => m.id === 'savoured')?.amount).toBe(CH.gourmand.savour);
    ateFood(w, g, 'meat');
    expect(g.mood.modifiers.find((m) => m.id === 'raw_food')?.amount).toBe(CH.gourmand.raw);
  });

  it('night owl: five night watches, then it sleeps in the morning and is up all night', () => {
    const w = makeWorld({ size: 30 });
    const g = spawnGoblin(w);
    g.needs.energy = 90;
    g.deeds.watches = CH.nightOwl.watches;
    at(w, 2 * DAY);
    hourFor(w, g);
    expect(hasTrait(g, 'night_owl')).toBe(true);
    at(w, 3 * DAY + Math.round(0.85 * DAY));
    expect(sleepTime(g, w)).toBe(false);
    const night = sleepScore(g, w);
    at(w, 4 * DAY + Math.round(0.2 * DAY));
    expect(sleepTime(g, w)).toBe(true);
    expect(sleepScore(g, w)).toBeGreaterThan(night);
    const other = spawnGoblin(w);
    expect(sleepTime(other, w)).toBe(false);
  });
});
