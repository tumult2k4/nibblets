import { describe, expect, it } from 'vitest';
import { CFG } from '../config';
import { clockAt } from '../time';
import { setWeather } from '../weather';
import { completeBuilding, placeBlueprint } from '../buildings';
import { addMood } from '../goblin/mood';
import { opinionOf } from '../goblin/social';
import { addItem, countItem } from '../inventory';
import { deposit, stockCount } from '../stockpile';
import { beginFestival, courtMul, dueFestival, feastHelping, festivalNow, festivalWorkMul, merryChance, noteStar, updateFestivals } from '../festivals';
import { wantsMusicCircle } from '../music';
import { Dance, JoinFestival, PlayMusic } from '../ai/actions/festival';
import { equipCandidate } from '../ai/actions/equip';
import { discoveryChance } from '../knowledge';
import { makeWorld, spawnGoblin } from './helpers';
import type { UtilityAction } from '../ai/action';
import type { Building, Goblin } from '../state';
import type { World } from '../world';
import type { BuildingType, SimEvent } from '../../shared/types';

const DAY = CFG.time.dayTicks, DPS = CFG.time.daysPerSeason, F = CFG.festivals;

function at(w: World, tick: number, weather: 'clear' | 'rain' = 'clear'): void {
  w.s.tick = tick;
  w.clock = clockAt(tick);
  setWeather(w, weather);
  w.s.weather.nextChangeTick = tick + 100 * DAY;
}
/** Tick at `frac` of the day, season index `season`, day `day` of it, in year `year` (from 0). */
const when = (season: number, day: number, frac: number, year = 0): number => (year * 4 * DPS + season * DPS + day) * DAY + Math.ceil(frac * DAY / 100) * 100;
function events(w: World): SimEvent[] {
  const evs: SimEvent[] = [];
  w.bus.subscribe((e) => evs.push(e));
  return evs;
}
function station(w: World, type: BuildingType, x: number, y: number): Building {
  const b = placeBlueprint(w, type, { x, y }, null);
  completeBuilding(w, b, null);
  return b;
}
function begin(g: Goblin, w: World, a: UtilityAction): boolean {
  g.activity = { action: a.id, status: 'running', startedTick: w.s.tick, targetId: null, target: null, path: [], progress: 0, stage: 0 };
  return a.start(g, w);
}
function stepAll(w: World, gs: [Goblin, UtilityAction][], n: number): void {
  for (let i = 0; i < n; i++) {
    w.goblinHash.rebuild(w.s.goblins);
    for (const [g, a] of gs) if (g.activity.status === 'running') g.activity.status = a.step(g, w) === 'running' ? 'running' : 'done';
    w.bus.flush();
    w.s.tick++;
  }
}

describe('festivals (P8.5, §15.3)', () => {
  it('Harvest Night: held at the campfire on the last evening of autumn; work stops, the village comes, and it brings them closer', () => {
    const w = makeWorld({ size: 40 });
    const fire = station(w, 'campfire', 20, 20);
    const gs = [0, 1, 2, 3].map((i) => spawnGoblin(w, { pos: { x: 17 + i * 2, y: 24 } }));
    const evs = events(w);
    at(w, when(2, 7, 0.5));
    updateFestivals(w);
    w.bus.flush();
    const f = festivalNow(w)!;
    expect(f.kind).toBe('harvest_night');
    expect(f.venueId).toBe(fire.id);
    expect(evs.some((e) => e.type === 'festival' && e.phase === 'start' && e.kind === 'harvest_night')).toBe(true);
    expect(festivalWorkMul(w)).toBe(F.workMul);
    const before = opinionOf(gs[0]!, gs[1]!.id);
    for (let i = 0; i < F.length * DAY + 10; i++) w.step();
    w.bus.flush();
    const end = evs.find((e) => e.type === 'festival' && e.phase === 'end');
    expect(end && end.type === 'festival' && (end.came ?? 0)).toBeGreaterThanOrEqual(3);
    expect(festivalNow(w)).toBeNull();
    const came = gs.filter((g) => g.mood.modifiers.some((m) => m.id === 'festival'));
    expect(came.length).toBeGreaterThanOrEqual(3);
    expect(opinionOf(gs[0]!, gs[1]!.id)).toBeGreaterThan(before);
    expect(w.s.village.culture?.held?.at(-1)?.[1]).toBe('harvest_night');
    // courtship ×2 the spring after
    at(w, when(0, 2, 0.3, 1));
    expect(courtMul(w)).toBe(F.effects.harvest.courtMul);
    at(w, when(1, 2, 0.3, 1));
    expect(courtMul(w)).toBe(1);
  });

  it('no venue, no festival; the Long Dark goes to the longhouse, eases grief and honors the elders', () => {
    const w = makeWorld({ size: 40 });
    at(w, when(3, 4, 0.45));
    expect(dueFestival(w)).toBe('long_dark');
    expect(beginFestival(w, 'long_dark')).toBeNull();
    station(w, 'campfire', 14, 14);
    const house = station(w, 'longhouse', 24, 24);
    const elder = spawnGoblin(w, { ageDays: 90 }), young = spawnGoblin(w, { ageDays: 30 });
    expect(elder.lifeStage).toBe('elder');
    addMood(w, young, 'grief:999', -20, 4 * DAY);
    const f = beginFestival(w, 'long_dark')!;
    expect(f.venueId).toBe(house.id);
    f.came[elder.id] = F.at.minTicks;
    f.came[young.id] = F.at.minTicks;
    w.s.tick = f.endTick;
    updateFestivals(w);
    expect(young.mood.modifiers.find((m) => m.id === 'grief:999')!.amount).toBeCloseTo(-20 * F.effects.longDark.griefMul, 4);
    expect(elder.mood.modifiers.some((m) => m.id === 'honored')).toBe(true);
    expect(young.mood.modifiers.some((m) => m.id === 'honored')).toBe(false);
  });

  it('the Sun Feast waits for a clear day, and each comer gets a helping from the store', () => {
    const w = makeWorld({ size: 40 });
    station(w, 'campfire', 20, 20);
    at(w, when(1, 4, 0.25), 'rain');
    expect(dueFestival(w)).toBeNull();
    at(w, when(1, 6, 0.25), 'rain'); // the last day: held whatever the sky
    expect(dueFestival(w)).toBe('sun_feast');
    at(w, when(1, 5, 0.25));
    expect(dueFestival(w)).toBe('sun_feast');
    const g = spawnGoblin(w);
    g.needs.hunger = 40;
    deposit(w.s, { type: 'stew', qty: 2 });
    deposit(w.s, { type: 'apple', qty: 5 });
    expect(feastHelping(w, g)).toBe('stew');
    expect(g.needs.hunger).toBeGreaterThan(40);
    expect(stockCount(w.s, 'stew')).toBe(1);
  });

  it('Starfall the evening after a shooting star, out at the crater', () => {
    const w = makeWorld({ size: 40 });
    at(w, when(1, 2, 0.85));
    noteStar(w, { x: 30, y: 12 });
    at(w, when(1, 3, 0.5));
    expect(dueFestival(w)).toBe('starfall');
    const f = beginFestival(w, 'starfall')!;
    expect(f.pos).toEqual({ x: 30, y: 12 });
    expect(f.venueId).toBeNull();
    expect(w.s.village.culture?.star).toBeNull();
  });

  it('merrymaking: only in good times, not after another festival, and more often under a sociable chief', () => {
    const w = makeWorld({ size: 40 });
    spawnGoblin(w);
    at(w, when(1, 2, F.merry.at));
    expect(merryChance(w)).toBe(0); // the store is bare
    deposit(w.s, { type: 'dried_apple', qty: 200 });
    expect(merryChance(w)).toBeCloseTo(F.merry.chance, 6);
    w.s.village.policies = { festivals: CFG.leadership.policy.festivalMul };
    expect(merryChance(w)).toBeCloseTo(F.merry.chance * CFG.leadership.policy.festivalMul, 6);
    w.s.village.culture = { held: [[w.clock.day - 1, 'harvest_night', 5]] };
    expect(merryChance(w)).toBe(0);
    w.s.village.culture = {};
    at(w, when(3, 2, F.merry.at));
    expect(merryChance(w)).toBe(0); // not in winter
  });

  it('Sprout Day: a goblin with a core plants it on the way, then joins the ring round the fire', () => {
    const w = makeWorld({ size: 40 });
    station(w, 'campfire', 20, 20);
    at(w, when(0, 0, 0.2, 1));
    const g = spawnGoblin(w, { pos: { x: 26, y: 26 } });
    addItem(g, { type: 'apple_core', qty: 1 });
    const f = beginFestival(w, 'sprout_day')!;
    expect(JoinFestival.isAvailable(g, w)).toBe(true);
    expect(begin(g, w, JoinFestival)).toBe(true);
    expect(g.activity.stage).toBe(0);
    stepAll(w, [[g, JoinFestival]], 900);
    expect(countItem(g, 'apple_core')).toBe(0);
    expect(w.s.plants.some((p) => p.plantedBy === g.id && p.stage === 'seed')).toBe(true);
    expect(g.activity.stage).toBe(2);
    expect(f.came[g.id]).toBeGreaterThan(0);
    expect(Math.hypot(g.pos.x - 20, g.pos.y - 20)).toBeLessThan(F.venue.ring[1] + 0.6);
  });

  it('music: of an evening a drummer plays at the music circle and a friend dances; both have fun', () => {
    const w = makeWorld({ size: 40 });
    const circle = station(w, 'music_circle', 20, 20);
    const a = spawnGoblin(w, { pos: { x: 24, y: 20 } }), b = spawnGoblin(w, { pos: { x: 16, y: 22 } });
    addItem(a, { type: 'drum', qty: 1 });
    expect(equipCandidate(a, w)).toBeNull(); // the drum stays in the pack
    a.needs.fun = 30;
    b.needs.fun = 30;
    at(w, when(1, 2, 0.6));
    w.goblinHash.rebuild(w.s.goblins);
    expect(PlayMusic.isAvailable(a, w)).toBe(true);
    expect(PlayMusic.isAvailable(b, w)).toBe(false); // nothing to play
    expect(begin(a, w, PlayMusic)).toBe(true);
    expect(a.activity.targetId).toBe(circle.id);
    stepAll(w, [[a, PlayMusic]], 120);
    expect(a.activity.stage).toBe(1);
    // the idea of a ring of stones to play in comes while playing, not to the one standing by
    expect(discoveryChance(a, w, 'music_circle')).toBeGreaterThan(0);
    expect(discoveryChance(b, w, 'music_circle')).toBe(0);
    w.goblinHash.rebuild(w.s.goblins);
    expect(Dance.isAvailable(b, w)).toBe(true);
    expect(begin(b, w, Dance)).toBe(true);
    stepAll(w, [[a, PlayMusic], [b, Dance]], 200);
    expect(b.activity.stage).toBe(1);
    expect(a.needs.fun).toBeGreaterThan(40);
    expect(b.needs.fun).toBeGreaterThan(40);
    // a village of eight with a player wants a music circle (once)
    const w2 = makeWorld({ size: 40 });
    const gs = [0, 1, 2, 3, 4, 5, 6, 7].map(() => spawnGoblin(w2));
    expect(wantsMusicCircle(w2)).toBe(false);
    addItem(gs[0]!, { type: 'flute', qty: 1 });
    expect(wantsMusicCircle(w2)).toBe(true);
  });
});
