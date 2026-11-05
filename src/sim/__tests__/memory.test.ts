import { describe, expect, it } from 'vitest';
import { CFG } from '../config';
import { remember, sense } from '../goblin/memory';
import { removePlant } from '../plants';
import type { SimEvent } from '../../shared/types';
import { HOUR, makeWorld, placePlant, runTicks, setMorning, spawnGoblin } from './helpers';

describe('senses & memory (§7.8, P2.4)', () => {
  it('sees fruit plants and water within vision and remembers them', () => {
    const w = makeWorld({ size: 40 });
    setMorning(w, 1);
    const g = spawnGoblin(w, { pos: { x: 10, y: 10 } });
    const near = placePlant(w, 'apple_bush', 'mature', { x: 14.5, y: 12.5 }, 3);
    const far = placePlant(w, 'apple_bush', 'mature', { x: 35.5, y: 35.5 }, 3);
    sense(g, w);
    expect(g.memory.some((m) => m.kind === 'fruit_plant' && m.targetId === near.id && m.data === 3)).toBe(true);
    expect(g.memory.some((m) => m.targetId === far.id)).toBe(false);
    expect(g.memory.some((m) => m.kind === 'water')).toBe(true);
  });

  it('fruit memories fade (−0.25/day) and are forgotten below 0.1; capacity is 60', () => {
    const w = makeWorld();
    setMorning(w, 1);
    const g = spawnGoblin(w);
    remember(g, w, 'fruit_plant', { x: 1, y: 1 }, 2, 999);
    g.memory.find((m) => m.targetId === 999)!.pos = { x: 200, y: 200 }; // out of sight forever
    for (let d = 0; d < 4; d++) {
      g.needs = { ...g.needs, hunger: 100, thirst: 100, energy: 100 };
      runTicks(w, CFG.time.dayTicks);
    }
    expect(g.memory.some((m) => m.targetId === 999)).toBe(false);
    for (let i = 0; i < 80; i++) remember(g, w, 'rock', { x: i * 5, y: 0 }, 1, 5000 + i);
    expect(g.memory.length).toBeLessThanOrEqual(CFG.memory.capacity);
  });

  it('stale memory: walks to a remembered bush that is gone, shows "?", forgets it', () => {
    const w = makeWorld({ size: 48, pond: true });
    setMorning(w, 1);
    const g = spawnGoblin(w, { pos: { x: 8, y: 8 } });
    g.needs.hunger = 30;
    const p = placePlant(w, 'apple_bush', 'mature', { x: 38.5, y: 38.5 }, 4);
    remember(g, w, 'fruit_plant', p.pos, 4, p.id);
    removePlant(w, p);
    w.rebuildCaches();
    const evs: SimEvent[] = [];
    let closest = Infinity;
    for (let i = 0; i < HOUR * 3; i++) {
      evs.push(...w.step());
      closest = Math.min(closest, Math.hypot(g.pos.x - 38.5, g.pos.y - 38.5));
      if (evs.some((e) => e.type === 'emote')) break;
    }
    expect(evs.some((e) => e.type === 'emote' && e.goblinId === g.id && e.emote === 'question')).toBe(true);
    expect(closest).toBeLessThan(CFG.goblin.visionDay * 0.45);
    expect(g.memory.some((m) => m.targetId === p.id)).toBe(false);
  });

  it('explore takes a curious goblin far and it learns new places', () => {
    const w = makeWorld({ size: 64 });
    setMorning(w, 1);
    const g = spawnGoblin(w, { pos: { x: 32, y: 32 } });
    g.needs.curiosity = 5;
    g.personality.wanderlust = 1;
    placePlant(w, 'apple_bush', 'mature', { x: 55.5, y: 55.5 }, 2);
    placePlant(w, 'apple_bush', 'mature', { x: 8.5, y: 55.5 }, 2);
    placePlant(w, 'apple_bush', 'mature', { x: 55.5, y: 8.5 }, 2);
    placePlant(w, 'apple_bush', 'mature', { x: 20.5, y: 8.5 }, 2);
    const before = g.memory.length;
    let far = 0;
    runTicks(w, HOUR * 6, () => ((far = Math.max(far, Math.hypot(g.pos.x - 32, g.pos.y - 32))), false));
    expect(far).toBeGreaterThan(10);
    expect(g.needs.curiosity).toBeGreaterThan(5);
    expect(g.memory.length).toBeGreaterThan(before);
  });
});
