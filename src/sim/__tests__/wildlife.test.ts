import { describe, expect, it } from 'vitest';
import { CFG } from '../config';
import { clockAt } from '../time';
import { setWeather } from '../weather';
import { allocId } from '../../shared/ids';
import { dist } from '../../shared/math';
import { canBe } from '../critters';
import { updateWildlife, wildlifeCaps } from '../wildlife';
import { Hunt, slingOf } from '../ai/actions/hunt';
import { completeBuilding, placeBlueprint } from '../buildings';
import { addItem, countItem } from '../inventory';
import { deposit } from '../stockpile';
import { craftWant } from '../crafting';
import { discoveryChance, learn } from '../knowledge';
import { RECIPES } from '../recipes';
import { usesLeft } from '../tools';
import { makeWorld, placePlant, spawnGoblin } from './helpers';
import type { UtilityAction } from '../ai/action';
import type { Critter, CritterKind, Goblin } from '../state';
import type { World } from '../world';
import type { SimEvent } from '../../shared/types';

const DAY = CFG.time.dayTicks, HOUR = CFG.god.hourTicks, WL = CFG.wildlife;

function at(w: World, day: number, frac: number): void {
  const tick = day * DAY + Math.round(frac * DAY);
  w.s.tick = tick;
  w.clock = clockAt(tick);
  setWeather(w, 'clear');
  w.s.weather.nextChangeTick = tick + 100 * DAY;
}
function critter(w: World, kind: CritterKind, pos: { x: number; y: number }, o: Partial<Critter> = {}): Critter {
  const c: Critter = { id: allocId(w.s), kind, pos: { ...pos }, z: 0, heading: 0, hp: kind === 'hopper' ? WL.hopper.hp : WL.chirp.hp, fed: 1, mode: 'idle', goal: null, targetId: null, until: 0, ...o };
  w.s.wildlife.push(c);
  return c;
}
function events(w: World): SimEvent[] {
  const evs: SimEvent[] = [];
  w.bus.subscribe((e) => evs.push(e));
  return evs;
}
/** Override config numbers for the length of `f`. */
function withCfg<T>(o: object, vals: Record<string, number>, f: () => T): T {
  const k = o as Record<string, number>;
  const old = Object.fromEntries(Object.keys(vals).map((x) => [x, k[x]!]));
  Object.assign(k, vals);
  try { return f(); } finally { Object.assign(k, old); }
}
function run(w: World, g: Goblin, a: UtilityAction, max = 3000): string {
  g.activity = { action: a.id, status: 'running', startedTick: w.s.tick, targetId: null, target: null, path: [], progress: 0, stage: 0 };
  if (!a.start(g, w)) return 'failed';
  for (let i = 0; i < max; i++) {
    const r = a.step(g, w);
    w.s.tick++;
    if (r !== 'running') return r;
  }
  return 'timeout';
}

describe('wildlife (P7.1, §8.4)', () => {
  it('hoppers graze grass, nibble planted sprouts, bolt from goblins and stay out of fences', () => {
    const w = makeWorld({ size: 30 });
    at(w, 3, 0.3);
    const patch = { id: allocId(w.s), pos: { x: 20.5, y: 20.5 }, density: 0.8 };
    w.s.grass.push(patch);
    const h = critter(w, 'hopper', { x: 18.5, y: 20.5 }, { fed: 0.5 });
    for (let i = 0; i < 300 && patch.density >= 0.8; i++) { updateWildlife(w); w.s.tick++; }
    expect(patch.density).toBeCloseTo(0.8 - WL.hopper.graze, 4);
    expect(h.fed).toBeGreaterThan(0.5);
    // a planted sprout is a better meal than grass
    const sprout = placePlant(w, 'apple_bush', 'sprout', { x: 10.5, y: 10.5 });
    sprout.plantedBy = 1;
    const hp = sprout.hp;
    const h2 = critter(w, 'hopper', { x: 12.5, y: 10.5 }, { fed: 0.3 });
    const evs = events(w);
    for (let i = 0; i < 300 && !evs.some((e) => e.type === 'sprout_nibbled'); i++) { updateWildlife(w); w.bus.flush(); w.s.tick++; }
    expect(evs.some((e) => e.type === 'sprout_nibbled' && e.critterId === h2.id)).toBe(true);
    expect(sprout.hp).toBe(hp - WL.hopper.nibble);
    // a goblin walks up: it runs
    const g = spawnGoblin(w, { pos: { x: h2.pos.x + 2.5, y: h2.pos.y } });
    const before = dist(h2.pos, g.pos);
    for (let i = 0; i < 40; i++) { updateWildlife(w); w.s.tick++; }
    expect(dist(h2.pos, g.pos)).toBeGreaterThan(before + 2);
    // fences keep them out
    const f = placeBlueprint(w, 'fence', { x: 25.5, y: 5.5 }, null);
    completeBuilding(w, f, null);
    expect(canBe(w, 'hopper', 25.5, 5.5)).toBe(false);
    expect(canBe(w, 'hopper', 24.5, 5.5)).toBe(true);
  });

  it('chirps eat fruit off bushes, and a flushed chirp may drop a feather', () => {
    const w = makeWorld({ size: 30 });
    at(w, 3, 0.3);
    const bush = placePlant(w, 'apple_bush', 'mature', { x: 15.5, y: 15.5 }, 5);
    const c = critter(w, 'chirp', { x: 8.5, y: 8.5 }, { z: WL.chirp.height, fed: 0.3 });
    for (let i = 0; i < 600 && bush.fruit === 5; i++) { updateWildlife(w); w.s.tick++; }
    expect(bush.fruit).toBe(4);
    expect(c.fed).toBeCloseTo(0.3 + WL.chirp.meal, 4);
    expect(c.mode).toBe('perch');
    spawnGoblin(w, { pos: { x: c.pos.x + 1.5, y: c.pos.y } });
    withCfg(WL.chirp, { flushFeather: 1 }, () => { for (let i = 0; i < 20; i++) { updateWildlife(w); w.s.tick++; } });
    expect(c.mode).toBe('flee');
    expect(w.s.groundItems.some((it) => it.stack.type === 'feather')).toBe(true);
  });

  it('numbers follow the food: the starved die, the fed breed under the cap, glimmerflies come out at night', () => {
    const w = makeWorld({ size: 30 });
    for (let i = 0; i < 12; i++) w.s.grass.push({ id: allocId(w.s), pos: { x: 5.5 + i, y: 20.5 }, density: 1 });
    expect(wildlifeCaps(w.s).hopper).toBe(Math.floor(12 / WL.hopper.perGrass));
    const thin = critter(w, 'hopper', { x: 6.5, y: 21.5 }, { fed: 0.3 });
    const fat = critter(w, 'hopper', { x: 8.5, y: 21.5 }, { fed: 1 });
    at(w, 4, 0);
    withCfg(WL.hopper, { breed: 1 }, () => updateWildlife(w));
    expect(w.s.wildlife.includes(thin)).toBe(false);
    expect(w.s.wildlife.includes(fat)).toBe(true);
    expect(w.s.wildlife.filter((c) => c.kind === 'hopper').length).toBe(2);
    // a marsh with a glowcap: glimmerflies after dark, gone by morning
    for (let y = 2; y < 12; y++) for (let x = 20; x < 28; x++) w.s.tiles[y * 30 + x]!.biome = 'marsh';
    w.s.mushrooms.push({ id: allocId(w.s), pos: { x: 24.5, y: 6.5 }, kind: 'glowcap', age: 0 });
    at(w, 4, 0.9);
    w.s.tick -= w.s.tick % HOUR;
    w.clock = clockAt(w.s.tick);
    updateWildlife(w);
    const flies = w.s.wildlife.filter((c) => c.kind === 'glimmerfly');
    expect(flies.length).toBe(wildlifeCaps(w.s).glimmerfly);
    expect(flies.length).toBeGreaterThan(0);
    for (const f of flies) expect(w.s.tiles[Math.floor(f.pos.y) * 30 + Math.floor(f.pos.x)]!.biome).toBe('marsh');
    at(w, 5, 0.3);
    w.s.tick -= w.s.tick % HOUR;
    w.clock = clockAt(w.s.tick);
    updateWildlife(w);
    expect(w.s.wildlife.some((c) => c.kind === 'glimmerfly')).toBe(false);
  });

  it('a hunter with a sling stalks a hopper, brings it down and gathers meat, bone and pelt', () => {
    const w = makeWorld({ size: 40 });
    at(w, 3, 0.3);
    const g = spawnGoblin(w, { pos: { x: 8.5, y: 20.5 } });
    addItem(g, { type: 'sling', qty: 1 });
    const h = critter(w, 'hopper', { x: 26.5, y: 20.5 });
    expect(Hunt.isAvailable(g, w)).toBe(true);
    expect(Hunt.score(g, w)).toBeGreaterThan(0);
    const evs = events(w);
    const r = withCfg(WL.hunt, { hit: 1 }, () => run(w, g, Hunt));
    w.bus.flush();
    expect(r).toBe('done');
    expect(w.s.wildlife.includes(h)).toBe(false);
    expect(evs.some((e) => e.type === 'critter_hunted' && e.killed && e.goblinId === g.id)).toBe(true);
    for (const t of ['meat', 'bone', 'pelt'] as const) expect(countItem(g, t)).toBe(1);
    expect(usesLeft(slingOf(g)!)).toBe(29);
    // no sling, no hunt; at night nobody hunts
    critter(w, 'hopper', { x: 30.5, y: 20.5 });
    const other = spawnGoblin(w, { pos: { x: 20.5, y: 20.5 } });
    expect(Hunt.isAvailable(other, w)).toBe(false);
    at(w, 3, 0.95);
    expect(Hunt.isAvailable(g, w)).toBe(false);
  });

  it('a sling is an idea to be had with a feather in hand and fiber by, and wanted by whoever has none', () => {
    const w = makeWorld();
    at(w, 3, 0.3);
    const g = spawnGoblin(w, { pos: { ...w.s.village.stockpilePos } });
    expect(RECIPES.sling).toMatchObject({ inputs: { fiber: 2, feather: 1 }, output: 'sling', known: false, phase: 7 });
    expect(discoveryChance(g, w, 'sling')).toBe(0);
    addItem(g, { type: 'feather', qty: 1 });
    deposit(w.s, { type: 'fiber', qty: 4 });
    expect(discoveryChance(g, w, 'sling')).toBeGreaterThan(0);
    learn(w, g, 'sling', 'discovery');
    expect(craftWant(g, w, 'sling')).toBeGreaterThan(0);
    addItem(g, { type: 'sling', qty: 1 });
    expect(craftWant(g, w, 'sling')).toBe(0);
  });
});
