import { describe, expect, it } from 'vitest';
import { CFG } from '../config';
import { HOUR, makeWorld, placePlant, runTicks, setMorning, spawnGoblin } from './helpers';
import { deposit } from '../stockpile';
import { scoreActions } from '../ai/utility';
import { slotCount } from '../inventory';

describe('goblin loop (P1 acceptance)', () => {
  it('hungry goblin next to a fruiting bush eats within 1 in-game hour', () => {
    const w = makeWorld();
    setMorning(w);
    const g = spawnGoblin(w, { pos: { x: 12, y: 12 } });
    g.needs.hunger = 20;
    placePlant(w, 'apple_bush', 'mature', { x: 13.5, y: 12.2 }, 4);
    const n = runTicks(w, HOUR, () => g.deeds.eaten > 0);
    expect(g.deeds.eaten).toBeGreaterThan(0);
    expect(n).toBeLessThanOrEqual(HOUR);
    expect(g.needs.hunger).toBeGreaterThan(20);
  });

  it('thirsty goblin walks to the pond and drinks', () => {
    const w = makeWorld();
    setMorning(w);
    const g = spawnGoblin(w, { pos: { x: 14, y: 14 } });
    g.needs.thirst = 15;
    runTicks(w, HOUR * 2, () => g.deeds.drank > 0);
    expect(g.deeds.drank).toBe(1);
    expect(g.needs.thirst).toBeGreaterThan(60);
  });

  it('at night goblins sleep', () => {
    const w = makeWorld();
    const g = spawnGoblin(w, { pos: { x: 14, y: 14 } });
    g.needs.energy = 60;
    w.s.tick = Math.round(CFG.time.dayTicks * 1.72);
    runTicks(w, 200);
    expect(g.activity.action).toBe('sleep_ground');
  });

  it('goblins without food or water eventually die of it (needs bite)', () => {
    const w = makeWorld({ pond: false });
    setMorning(w);
    const g = spawnGoblin(w);
    g.needs.thirst = 0;
    g.needs.hunger = 0;
    runTicks(w, CFG.time.dayTicks * 2);
    expect(w.s.goblins.includes(g)).toBe(false);
    expect(w.s.graves[0]?.goblinId).toBe(g.id);
  });
  it('a starving goblin with a pack full of cores eats a core instead of trying the store it cannot carry from', () => {
    const w = makeWorld();
    const g = spawnGoblin(w, { pos: { ...w.s.village.stockpilePos } });
    deposit(w.s, { type: 'apple', qty: 10 });
    g.inventory = [];
    while (g.inventory.length < slotCount(g)) g.inventory.push({ type: 'apple_core', qty: 10 }); // full stacks in every slot
    g.needs.hunger = 2;
    const rows = scoreActions(g, w, false).map((r) => r.id);
    expect(rows).not.toContain('take_item');
    expect(rows[0]).toBe('eat_core');
  });
});
