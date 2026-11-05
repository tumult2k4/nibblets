import { describe, expect, it } from 'vitest';
import { CFG } from '../config';
import { grantTrait, traitMul, twinOf, updateTraits } from '../goblin/traits';
import { addMood } from '../goblin/mood';
import { kinBond } from '../goblin/family';
import { updatePlants } from '../plants';
import { crowdAround, gnasherDecide } from '../enemies/gnasher';
import { clockAt } from '../time';
import { setWeather } from '../weather';
import { spawnEnemy } from '../enemies/director';
import { makeWorld, placePlant, spawnGoblin } from './helpers';
import type { SimEvent } from '../../shared/types';
import type { World } from '../world';

const T = CFG.traits;

/** Run the hourly trait check once for every goblin. */
function hour(w: World): void {
  for (let i = 0; i < T.checkEvery; i++) { w.s.tick++; updateTraits(w); }
}

describe('acquired traits (P5.7)', () => {
  it('are earned from life history, three at most, and weigh on what a goblin chooses to do', () => {
    const w = makeWorld();
    const evs: SimEvent[] = [];
    w.bus.subscribe((e) => evs.push(e));
    const g = spawnGoblin(w);
    hour(w);
    expect(g.traits).toEqual([]);
    g.deeds.planted = T.greenThumbPlanted;
    hour(w);
    expect(g.traits).toEqual(['green_thumb']);
    expect(traitMul(g, 'plant_seed')).toBe(T.greenThumbWork);
    expect(traitMul(g, 'chop')).toBe(1);
    g.health.scars = T.scarredScars;
    g.deeds.fights = CFG.combat.veteranFights;
    hour(w);
    w.bus.flush();
    expect(g.traits).toHaveLength(3);
    expect(g.traits).toEqual(expect.arrayContaining(['green_thumb', 'scarred', 'veteran']));
    expect(evs.filter((e) => e.type === 'trait_gained')).toHaveLength(3);
    expect(grantTrait(w, g, 'twin')).toBe(false); // full
    expect(g.traits).toHaveLength(T.max);
  });

  it('green thumb: what it planted grows half again as fast', () => {
    const w = makeWorld();
    const a = spawnGoblin(w), b = spawnGoblin(w);
    grantTrait(w, a, 'green_thumb');
    const pa = placePlant(w, 'apple_bush', 'sprout', { x: 8.5, y: 8.5 }), pb = placePlant(w, 'apple_bush', 'sprout', { x: 16.5, y: 16.5 });
    pa.plantedBy = a.id;
    pb.plantedBy = b.id;
    pa.hydration = pb.hydration = 0.6;
    for (let i = 0; i < CFG.plants.updateEvery * 4; i++) { w.s.tick++; updatePlants(w); }
    expect(pa.growth).toBeGreaterThan(0);
    expect(pa.growth / pb.growth).toBeCloseTo(T.greenThumbGrowth, 1);
  });

  it('orphans grow braver and shyer; twins feel what the other feels', () => {
    const w = makeWorld();
    const o = spawnGoblin(w);
    o.personality.bravery = 0.5;
    o.personality.sociability = 0.05;
    grantTrait(w, o, 'orphan');
    expect(o.personality.bravery).toBeCloseTo(0.5 + T.orphanBravery, 4);
    expect(o.personality.sociability).toBe(0); // clamped
    const a = spawnGoblin(w), b = spawnGoblin(w);
    b.bornTick = a.bornTick;
    kinBond(w, a, b, 'sibling');
    kinBond(w, b, a, 'sibling');
    expect(twinOf(a, w)).toBeUndefined();
    grantTrait(w, a, 'twin');
    grantTrait(w, b, 'twin');
    expect(twinOf(a, w)).toBe(b);
    addMood(w, a, 'found_shiny', 10, 600);
    expect(b.mood.modifiers.find((m) => m.id === 'twin_joy')?.amount).toBeCloseTo(10 * T.twinEcho, 4);
    expect(a.mood.modifiers.some((m) => m.id.startsWith('twin_'))).toBe(false); // the echo doesn't bounce back
    addMood(w, a, 'stubbed_toe', -2, 600);
    expect(b.mood.modifiers.some((m) => m.id === 'twin_woe')).toBe(false); // small things stay its own
  });

  it('scarred: Gnashers count it half again in a crowd, and would rather bite someone else', () => {
    const w = makeWorld();
    const e = spawnEnemy(w, 'gnasher', { x: 12, y: 12 });
    const g = spawnGoblin(w, { pos: { x: 13, y: 12 } });
    const plain = crowdAround(w, e);
    grantTrait(w, g, 'scarred');
    expect(crowdAround(w, e)).toBeCloseTo(plain * T.scarredCrowd, 5);
    // at night, two goblins out alone: it goes for the unscarred one a little further off
    const w2 = makeWorld({ size: 30 });
    w2.s.tick = 5 * CFG.time.dayTicks + Math.round(0.85 * CFG.time.dayTicks);
    w2.clock = clockAt(w2.s.tick);
    setWeather(w2, 'clear');
    const e2 = spawnEnemy(w2, 'gnasher', { x: 15, y: 15 });
    const scar = spawnGoblin(w2, { pos: { x: 15, y: 19 } }), other = spawnGoblin(w2, { pos: { x: 15, y: 9.5 } });
    gnasherDecide(w2, e2);
    expect(e2.targetId).toBe(scar.id);
    grantTrait(w2, scar, 'scarred');
    gnasherDecide(w2, e2);
    expect(e2.targetId).toBe(other.id);
  });
});
