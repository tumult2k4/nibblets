import { describe, expect, it } from 'vitest';
import { CFG } from '../config';
import { clockAt, isNight } from '../time';
import { setWeather } from '../weather';
import { completeBuilding, placeBlueprint } from '../buildings';
import { deposit, stockCount } from '../stockpile';
import { addItem, countItem } from '../inventory';
import { workMul } from '../combat';
import { workSpeed, skillSpeed } from '../goblin/skills';
import { ateFood, emotionOf, favoriteFood, isInspired, moodWorkMul, updateMood } from '../goblin/mood';
import { breakWeights, endBreak, rollBreak, startBreak } from '../goblin/moodBreaks';
import { scoreActions, ACTIONS } from '../ai/utility';
import { Binge, WanderOff } from '../ai/actions/moodBreak';
import { trinketsOf } from '../trinkets';
import { deserialize, serialize } from '../save';
import { makeWorld, placePlant, spawnGoblin } from './helpers';
import type { UtilityAction } from '../ai/action';
import type { Goblin } from '../state';
import type { World } from '../world';
import type { SimEvent } from '../../shared/types';
import { itemDef } from '../items';

const DAY = CFG.time.dayTicks, M = CFG.mood;

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
/** Hold the mood where it is: a standing modifier that sets the target (and no needs pulling it). */
function feel(g: Goblin, amount: number): void {
  g.needs = { ...g.needs, hunger: 50, thirst: 50, energy: 50, curiosity: 50, warmth: 60, social: 50, safety: 60, fun: 50 };
  g.mood.modifiers = [{ id: 'test_a', amount: amount / 2, expiresTick: 1e9 }, { id: 'test_b', amount: amount / 2, expiresTick: 1e9 }];
  g.mood.value = amount;
}
/** Run the mood update (every 10 ticks) for `ticks`. */
function live(w: World, ticks: number): void {
  for (let i = 0; i < ticks; i += 10) {
    w.s.tick += 10;
    updateMood(w);
    w.bus.flush();
  }
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

describe('the full mood system (P8.1, §7.5)', () => {
  it('mood sets the pace of work: ×0.7 miserable, ×1 level, ×1.2 glowing', () => {
    const w = makeWorld();
    const g = spawnGoblin(w);
    g.mood.value = -100;
    expect(moodWorkMul(g)).toBeCloseTo(0.7, 6);
    g.mood.value = 0;
    expect(moodWorkMul(g)).toBe(1);
    expect(workMul(g)).toBe(1);
    g.mood.value = 100;
    expect(moodWorkMul(g)).toBeCloseTo(1.2, 6);
    expect(workMul(g)).toBeCloseTo(1.2, 6);
    expect(workSpeed(g, 'woodcraft')).toBeCloseTo(skillSpeed(g, 'woodcraft') * 1.2, 6);
  });

  it('everyday modifiers: the favorite food (not stacked), cold rain on the unsheltered, the full moon for the pious', () => {
    const w = makeWorld();
    at(w, 2 * DAY);
    const g = spawnGoblin(w);
    const fav = favoriteFood(g);
    expect(favoriteFood(g)).toBe(fav); // fixed for life
    const other = fav === 'apple' ? 'berry' : 'apple';
    ateFood(w, g, other);
    expect(g.mood.modifiers.some((m) => m.id === 'favorite_food')).toBe(false);
    ateFood(w, g, fav);
    ateFood(w, g, fav);
    expect(g.mood.modifiers.filter((m) => m.id === 'favorite_food')).toEqual([expect.objectContaining({ amount: M.favorite.amount })]);
    // rain on a cold goblin out in the open
    feel(g, 0);
    g.needs.warmth = 30;
    setWeather(w, 'rain');
    w.s.tick = Math.ceil(w.s.tick / 50) * 50 - 10;
    live(w, 10);
    expect(g.mood.modifiers.find((m) => m.id === 'cold_rain')?.amount).toBe(M.rain.amount);
    // the full moon at night, for the pious only
    let tick = 0;
    for (; tick < 40 * DAY; tick += 100) { const c = clockAt(tick); if (isNight(c) && Math.abs(c.moonPhase - 0.5) < 0.02) break; }
    at(w, tick - 10);
    const pious = spawnGoblin(w), not = spawnGoblin(w);
    pious.personality.piety = 0.9;
    not.personality.piety = 0.2;
    live(w, 10);
    expect(pious.mood.modifiers.some((m) => m.id === 'full_moon')).toBe(true);
    expect(not.mood.modifiers.some((m) => m.id === 'full_moon')).toBe(false);
  });

  it('emotions: grievances make it angry, a fresh lift on a good mood excited (relief does not count)', () => {
    const w = makeWorld();
    const g = spawnGoblin(w);
    feel(g, 20);
    expect(emotionOf(g)).toBe('content');
    g.mood.modifiers.push({ id: 'robbed', amount: -12, expiresTick: 1e9 });
    expect(emotionOf(g)).toBe('angry');
    g.mood.modifiers = [{ id: 'vented', amount: 30, expiresTick: 1e9 }];
    g.mood.value = 70;
    expect(emotionOf(g)).toBe('happy');
    g.mood.modifiers.push({ id: 'blessed', amount: 20, expiresTick: 1e9 });
    expect(emotionOf(g)).toBe('excited');
    g.mood.value = -60;
    g.mood.modifiers = [];
    expect(emotionOf(g)).toBe('sad');
  });

  it('half a day below −70 ends in a break rolled by personality; none again for two days', () => {
    const w = makeWorld();
    at(w, 2 * DAY);
    const g = spawnGoblin(w);
    const evs = events(w);
    Object.assign(g.personality, { mischief: 0, bravery: 0, sociability: 1, gluttony: 1, wanderlust: 0 });
    expect(rollBreak(g, 0.5)).toBe('binge'); // the glutton gorges
    Object.assign(g.personality, { mischief: 1, bravery: 1, gluttony: 0 });
    const wt = breakWeights(g);
    expect(wt.tantrum).toBeGreaterThan(wt.sulk + wt.binge + wt.wander_off); // the hothead smashes things
    feel(g, -100);
    live(w, DAY / 2 - 50);
    expect(evs.some((e) => e.type === 'mood_break')).toBe(false);
    live(w, 100);
    expect(evs.filter((e) => e.type === 'mood_break')).toHaveLength(1);
    expect(g.lastBreak).toBeDefined();
    endBreak(w, g);
    feel(g, -100);
    live(w, DAY);
    expect(evs.filter((e) => e.type === 'mood_break')).toHaveLength(1); // still cooling off
    live(w, DAY + 100);
    expect(evs.filter((e) => e.type === 'mood_break')).toHaveLength(2);
  });

  it('real hardship weighs heavily: starving and freezing together bring a break', () => {
    const w = makeWorld();
    at(w, 2 * DAY);
    const g = spawnGoblin(w);
    const evs = events(w);
    g.needs = { ...g.needs, hunger: 5, warmth: 5, thirst: 70, energy: 70, curiosity: 70, social: 70, safety: 80 };
    g.mood.modifiers = [];
    live(w, 60);
    expect(g.mood.modifiers.find((m) => m.id === 'starving')?.amount).toBe(M.hardship.starving[1]);
    expect(g.mood.modifiers.find((m) => m.id === 'freezing')?.amount).toBe(M.hardship.freezing[1]);
    const hold = () => { g.needs.hunger = 5; g.needs.warmth = 5; };
    for (let i = 0; i < DAY; i += 50) { hold(); live(w, 50); }
    expect(g.mood.value).toBeLessThan(M.breaks.below);
    expect(evs.some((e) => e.type === 'mood_break')).toBe(true);
    // merely hungry: not a break
    const h = spawnGoblin(w);
    h.needs = { ...h.needs, hunger: 30, warmth: 60 };
    live(w, 60);
    expect(h.mood.modifiers.some((m) => m.id === 'starving')).toBe(false);
  });

  it('a tantrum smashes something it owns, or kicks at its home, and lets the anger out', () => {
    const w = makeWorld();
    const g = spawnGoblin(w);
    const evs = events(w);
    addItem(g, { type: 'stone', qty: 1 });
    startBreak(w, g, 'tantrum');
    w.bus.flush();
    expect(countItem(g, 'stone')).toBe(0);
    expect(evs.find((e) => e.type === 'mood_break')).toMatchObject({ kind: 'tantrum', item: 'stone' });
    expect(g.mood.modifiers.find((m) => m.id === 'vented')?.amount).toBe(M.breaks.relief.tantrum);
    expect(g.moodBreak).toBeUndefined(); // over at once
    const hut = placeBlueprint(w, 'hut', { x: 8, y: 16 }, g.id);
    completeBuilding(w, hut, g.id);
    g.homeId = hut.id;
    const hp = hut.hp;
    startBreak(w, g, 'tantrum');
    expect(hut.hp).toBe(hp - M.breaks.homeDamage);
  });

  it('a sulk: no work, no company, no play, until the half day is out; urgent needs still come first', () => {
    const w = makeWorld();
    at(w, 2 * DAY);
    const g = spawnGoblin(w);
    startBreak(w, g, 'sulk');
    const rows = scoreActions(g, w, false);
    expect(rows[0]!.id).toBe('sulk');
    expect(rows.some((r) => !ACTIONS[r.id].tags.includes('food') && ACTIONS[r.id].tags.some((t) => t === 'work' || t === 'social' || t === 'fun'))).toBe(false);
    // but a hungry sulker still picks fruit
    placePlant(w, 'apple_bush', 'mature', { x: g.pos.x + 2, y: g.pos.y }, 5);
    g.needs.hunger = 8;
    expect(scoreActions(g, w, false).slice(0, 3).map((r) => r.id)).toContain('harvest_fruit');
    g.needs.hunger = 90;
    g.needs.hunger = 3;
    addItem(g, { type: 'apple', qty: 1 });
    expect(scoreActions(g, w, false)[0]!.id).toBe('eat');
    feel(g, -20);
    live(w, Math.round(M.breaks.sulkDays * DAY) + 10);
    expect(g.moodBreak).toBeUndefined();
    expect(g.mood.modifiers.find((m) => m.id === 'vented')?.amount).toBe(M.breaks.relief.sulk);
  });

  it('a binge eats up to four from the store, then it is over', () => {
    const w = makeWorld();
    const g = spawnGoblin(w, { pos: { ...makeWorld().s.village.stockpilePos } });
    deposit(w.s, { type: 'apple', qty: 10 });
    g.needs.hunger = 0;
    startBreak(w, g, 'binge');
    expect(run(w, g, Binge)).toBe('done');
    const bites = Math.min(M.breaks.bingeItems, Math.ceil(100 / itemDef('apple').nutrition!)); // full, or four down
    expect(bites).toBeGreaterThan(1);
    expect(stockCount(w.s, 'apple')).toBe(10 - bites);
    expect(g.moodBreak).toBeUndefined();
    expect(g.needs.hunger).toBeGreaterThan(50);
  });

  it('wandering off: a day away out past the village, sometimes coming back with a trinket', () => {
    const w = makeWorld({ size: 80 });
    at(w, 2 * DAY);
    const g = spawnGoblin(w);
    startBreak(w, g, 'wander_off');
    const to = g.moodBreak!.at!;
    expect(Math.hypot(to.x - w.s.village.center.x, to.y - w.s.village.center.y)).toBeGreaterThanOrEqual(M.breaks.wanderDist[0] - 0.01);
    expect(scoreActions(g, w, false)[0]!.id).toBe('wander_off');
    g.moodBreak!.until = w.s.tick + 600;
    expect(run(w, g, WanderOff, 800)).toBe('timeout'); // sits there until updateMood ends the break
    expect(Math.hypot(g.pos.x - to.x, g.pos.y - to.y)).toBeLessThan(1.5);
    let found = 0;
    for (let i = 0; i < 40; i++) {
      const o = spawnGoblin(w);
      startBreak(w, o, 'wander_off');
      endBreak(w, o);
      found += trinketsOf(o, w).length;
    }
    expect(found).toBeGreaterThan(3);
    expect(found).toBeLessThan(20);
  });

  it('a whole day above 80 lights a day of inspiration (and not again for days)', () => {
    const w = makeWorld();
    at(w, 2 * DAY);
    const g = spawnGoblin(w);
    const evs = events(w);
    feel(g, 100);
    live(w, DAY - 50);
    expect(isInspired(g, w)).toBe(false);
    live(w, 100);
    expect(isInspired(g, w)).toBe(true);
    expect(evs.filter((e) => e.type === 'inspired')).toHaveLength(1);
    expect(emotionOf(g)).toBe('excited');
    live(w, 2 * DAY);
    expect(evs.filter((e) => e.type === 'inspired')).toHaveLength(1);
  });

  it('a break under way survives a save', () => {
    const w = makeWorld();
    const g = spawnGoblin(w);
    startBreak(w, g, 'sulk');
    const back = deserialize(serialize(w.s));
    expect(back.goblins[0]!.moodBreak).toEqual(g.moodBreak);
  });
});
