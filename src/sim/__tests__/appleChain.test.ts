import { describe, expect, it } from 'vitest';
import { CFG } from '../config';
import { countItem } from '../inventory';
import type { SimEvent } from '../../shared/types';
import { HOUR, makeWorld, placePlant, runTicks, setMorning, spawnGoblin } from './helpers';

describe('apple chain (§8.1, P2.2)', () => {
  it('a goblin with a core plants it on fertile meadow near the village, away from other plants', () => {
    const w = makeWorld({ size: 32 });
    setMorning(w, 1);
    const g = spawnGoblin(w);
    g.personality.industry = 1;
    g.inventory.push({ type: 'apple_core', qty: 1 });
    placePlant(w, 'apple_bush', 'mature', { x: 20.5, y: 16.5 });
    runTicks(w, HOUR * 3, () => countItem(g, 'apple_core') === 0);
    const seed = w.s.plants.find((p) => p.plantedBy === g.id);
    expect(seed?.stage).toBe('seed');
    const c = w.s.village.center;
    expect(Math.hypot(seed!.pos.x - c.x, seed!.pos.y - c.y)).toBeLessThanOrEqual(CFG.plants.seedSiteVillageRadius + 1);
    for (const p of w.s.plants) if (p !== seed) expect(Math.hypot(p.pos.x - seed!.pos.x, p.pos.y - seed!.pos.y)).toBeGreaterThanOrEqual(CFG.plants.minSeedGap);
    expect(g.deeds.planted).toBe(1);
  });

  it('a hungry goblin with only a core eats the core', () => {
    const w = makeWorld();
    setMorning(w, 1);
    const g = spawnGoblin(w);
    g.needs.hunger = 20;
    g.inventory.push({ type: 'apple_core', qty: 1 });
    const evs: SimEvent[] = [];
    for (let i = 0; i < HOUR && countItem(g, 'apple_core'); i++) evs.push(...w.step());
    expect(evs.some((e) => e.type === 'item_eaten' && e.item === 'apple_core')).toBe(true);
  });

  it('watering: visits water first, then splashes the dry sprout', () => {
    const w = makeWorld();
    setMorning(w, 1);
    const g = spawnGoblin(w, { pos: { x: 14, y: 14 } });
    g.personality.industry = 1;
    const p = placePlant(w, 'apple_bush', 'sprout', { x: 16.5, y: 16.5 });
    p.hydration = 0.05;
    let minDistToPond = Infinity;
    const evs: SimEvent[] = [];
    for (let i = 0; i < HOUR * 3; i++) {
      evs.push(...w.step());
      minDistToPond = Math.min(minDistToPond, Math.hypot(g.pos.x - 4, g.pos.y - 4));
      if (evs.some((e) => e.type === 'plant_watered')) break;
    }
    expect(evs.some((e) => e.type === 'plant_watered' && e.plantId === p.id)).toBe(true);
    expect(minDistToPond).toBeLessThan(2);
    expect(p.hydration).toBeGreaterThan(0.4);
  });
});
