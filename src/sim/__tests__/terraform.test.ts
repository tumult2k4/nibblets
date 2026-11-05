import { describe, expect, it } from 'vitest';
import { CFG } from '../config';
import { tileAt } from '../grid';
import type { SimEvent } from '../../shared/types';
import { World } from '../world';
import { createWorldState } from '../newWorld';
import { replayTo, stateHash } from '../save';
import { HOUR, makeWorld, placePlant, runTicks, setMorning, spawnGoblin } from './helpers';

describe('terraform powers (§17.5.3, P2.7)', () => {
  it('raise/lower change heights under the brush and bump terrainVersion', () => {
    const w = makeWorld();
    setMorning(w, 1);
    const t = tileAt(w.s, 12, 12)!;
    const h0 = t.height;
    const v0 = w.s.terrainVersion;
    for (let i = 0; i < 5; i++) { w.push({ type: 'god_power', power: 'raise_land', pos: { x: 12.5, y: 12.5 }, radius: 3 }); w.step(); }
    expect(t.height).toBeGreaterThan(h0 + 0.05);
    expect(w.s.terrainVersion).toBeGreaterThan(v0);
    for (let i = 0; i < 10; i++) { w.push({ type: 'god_power', power: 'lower_land', pos: { x: 12.5, y: 12.5 }, radius: 3 }); w.step(); }
    expect(t.height).toBeLessThan(h0);
  });

  it('create water drowns plants, rescues goblins, and thirsty goblins drink from the new pond', () => {
    const w = makeWorld({ size: 32, pond: false });
    setMorning(w, 1);
    const p = placePlant(w, 'apple_bush', 'sprout', { x: 22.5, y: 22.5 });
    const g = spawnGoblin(w, { pos: { x: 22.5, y: 22.7 } });
    w.push({ type: 'god_power', power: 'create_water', pos: { x: 22.5, y: 22.5 }, radius: 2 });
    w.step();
    expect(tileAt(w.s, 22, 22)!.biome).toBe('water');
    expect(w.s.plants.includes(p)).toBe(false);
    expect(tileAt(w.s, g.pos.x, g.pos.y)!.walkable).toBe(true);
    g.needs.thirst = 15;
    const evs: SimEvent[] = [];
    for (let i = 0; i < HOUR * 2 && !evs.some((e) => e.type === 'item_drunk'); i++) evs.push(...w.step());
    expect(evs.some((e) => e.type === 'item_drunk')).toBe(true);
    expect(Math.hypot(g.pos.x - 22.5, g.pos.y - 22.5)).toBeLessThan(4);
  });

  it('fertile soil, plant forest and place rock', () => {
    const w = makeWorld({ size: 32 });
    setMorning(w, 1);
    const t = tileAt(w.s, 20, 20)!;
    const f0 = t.fertility;
    w.push({ type: 'god_power', power: 'fertile_soil', pos: { x: 20.5, y: 20.5 }, radius: 2 });
    for (let i = 0; i < 6; i++) w.push({ type: 'god_power', power: 'plant_forest', pos: { x: 10.5, y: 20.5 }, radius: 4, option: 'berry_bush' });
    w.push({ type: 'god_power', power: 'place_rock', pos: { x: 26.5, y: 26.5 }, radius: 1, option: '3' });
    w.step();
    expect(t.fertility).toBeGreaterThan(f0 + 0.3);
    expect(w.s.plants.filter((p) => p.kind === 'berry_bush' && p.stage === 'sprout').length).toBeGreaterThan(2);
    expect(w.s.rocks.some((r) => r.size === 3 && Math.abs(r.pos.x - 26.5) < 0.01)).toBe(true);
  });

  it('uproot & replant with the hand; dropping from high kills the plant', () => {
    const w = makeWorld({ size: 32 });
    setMorning(w, 1);
    const p = placePlant(w, 'apple_bush', 'young', { x: 10.5, y: 10.5 });
    w.push({ type: 'god_grab', entityId: p.id });
    w.push({ type: 'god_hold_move', pos: { x: 20.5, y: 18.5 }, height: 1.2 });
    w.push({ type: 'god_release', pos: { x: 20.5, y: 18.5 }, height: 1.2, velocity: { x: 0, y: 0, z: 0 } });
    w.step();
    expect(p.pos).toEqual({ x: 20.5, y: 18.5 });
    expect(w.s.plants.includes(p)).toBe(true);
    w.push({ type: 'god_grab', entityId: p.id });
    w.push({ type: 'god_release', pos: { x: 24.5, y: 24.5 }, height: 9, velocity: { x: 0, y: 0, z: 0 } });
    w.step();
    expect(w.s.plants.includes(p)).toBe(false);
  });

  it('walking wears paths; wear fades', () => {
    const w = makeWorld({ size: 32 });
    setMorning(w, 1);
    const g = spawnGoblin(w);
    g.needs.curiosity = 5;
    runTicks(w, HOUR);
    expect(w.s.tiles.some((x) => x.wear > 0)).toBe(true);
    const t = tileAt(w.s, 2, 30)!;
    t.wear = 0.6;
    runTicks(w, CFG.time.dayTicks);
    expect(t.wear).toBeLessThan(0.6);
  });
});

describe('terraform replay on a generated world', () => {
  it('a generated world with terraform commands replays to the same hash', () => {
    const w = new World(createWorldState({ seed: 77, size: 48, founders: 4 }));
    for (let i = 0; i < 50; i++) {
      w.push({ type: 'god_power', power: (['raise_land', 'create_water', 'plant_forest', 'smooth', 'fertile_soil'] as const)[i % 5]!, pos: { x: 10 + (i % 25), y: 12 + ((i * 3) % 20) }, radius: 2, option: 'tree' });
      for (let k = 0; k < 9; k++) w.step();
    }
    const r = replayTo(w.s, w.s.tick, (s) => new World(s), (p) => createWorldState(p));
    expect(stateHash(r.s)).toBe(stateHash(w.s));
  });
});
