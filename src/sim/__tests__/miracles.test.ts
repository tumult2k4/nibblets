import { describe, expect, it } from 'vitest';
import { CFG } from '../config';
import { clockAt } from '../time';
import { setWeather } from '../weather';
import { completeBuilding, placeBlueprint } from '../buildings';
import { dist } from '../../shared/math';
import { spawnEnemy } from '../enemies/director';
import { castProblem } from '../god/cast';
import { killGoblin } from '../goblin/needs';
import { relate } from '../goblin/social';
import { registerLineage } from '../goblin/family';
import { infect } from '../disease';
import { graveOf, griefId, updateDeath } from '../death';
import { updateClimate } from '../climate';
import { dangerAt } from '../danger';
import { deserialize, serialize } from '../save';
import { makeWorld, placePlant, spawnGoblin } from './helpers';
import type { World } from '../world';
import type { SimEvent } from '../../shared/types';

const DAY = CFG.time.dayTicks, HOUR = CFG.god.hourTicks, M = CFG.miracles;

function at(w: World, day: number, frac: number): void {
  const tick = day * DAY + Math.round(frac * DAY);
  w.s.tick = tick;
  w.clock = clockAt(tick);
  setWeather(w, 'clear');
  w.s.weather.nextChangeTick = tick + 100 * DAY;
  w.s.god.mode = 'sandbox';
}
const cast = (w: World, power: string, pos: { x: number; y: number }, extra: { radius?: number; targetId?: number; option?: string } = {}): SimEvent[] => {
  w.push({ type: 'god_cast', power, pos, ...extra });
  return w.step();
};
const rejected = (evs: SimEvent[]) => evs.find((e) => e.type === 'command_rejected');
/** Advance the clock hour by hour, running only the hourly death bookkeeping. */
function hours(w: World, n: number): void {
  for (let i = 0; i < n; i++) { w.s.tick += HOUR - (w.s.tick % HOUR); updateDeath(w); }
}

describe('Phase 6 powers (P6.6, §17.5)', () => {
  it('Resurrect is accepted up to two days after a death and rejected after', () => {
    const w = makeWorld({ size: 32 });
    at(w, 3, 0.3);
    const dead = spawnGoblin(w, { pos: { x: 16, y: 16 } }), mate = spawnGoblin(w, { pos: { x: 18, y: 16 } });
    Object.assign(relate(mate, dead.id), { opinion: 70, bond: 'mate' });
    registerLineage(w.s, dead);
    const piety = dead.personality.piety;
    killGoblin(w, dead, 'fall');
    expect(w.s.lineage[dead.id]?.died).toBe(w.s.tick);
    const gr = graveOf(w, dead.id)!;
    hours(w, 47);
    expect(castProblem(w, 'resurrect', gr.pos, undefined, gr.id)).toBeNull();
    const evs = cast(w, 'resurrect', gr.pos, { targetId: gr.id });
    expect(rejected(evs)).toBeUndefined();
    expect(evs.some((e) => e.type === 'resurrected' && e.goblinId === dead.id)).toBe(true);
    const back = w.goblin(dead.id)!;
    expect(back.health.hp).toBeCloseTo(M.resurrectHp, 0); // it has had one tick to heal
    expect(back.traits).toContain('returned');
    expect(back.personality.piety).toBeCloseTo(Math.min(1, piety + CFG.traits.returnedPiety), 4);
    expect(graveOf(w, dead.id)).toBeUndefined();
    expect(w.s.lineage[dead.id]?.died).toBeNull();
    expect(mate.mood.modifiers.some((m) => m.id === griefId(dead.id))).toBe(false);
    expect(mate.mood.modifiers.some((m) => m.id === 'awe')).toBe(true);
    // a second death, and too long a wait
    const other = spawnGoblin(w, { pos: { x: 12, y: 12 } });
    killGoblin(w, other, 'fall');
    const g2 = graveOf(w, other.id)!;
    hours(w, 2 * 24 + 2);
    expect(g2.body).toBeNull();
    expect(castProblem(w, 'resurrect', g2.pos, undefined, g2.id)).toBe('too_late');
    expect(rejected(cast(w, 'resurrect', g2.pos, { targetId: g2.id }))).toMatchObject({ reason: 'too_late' });
    expect(w.goblin(other.id)).toBeUndefined();
  });

  it('Healing Touch mends everything; Plague brings the chosen disease at once', () => {
    const w = makeWorld({ size: 32 });
    at(w, 3, 0.3);
    const g = spawnGoblin(w, { pos: { x: 16, y: 16 } });
    g.health.hp = 20;
    g.health.injuries = [{ kind: 'limp', until: w.s.tick + DAY }];
    infect(w, g, 'gut_rot');
    cast(w, 'healing_touch', g.pos, { targetId: g.id });
    expect(g.health).toMatchObject({ hp: g.health.maxHp, injuries: [], disease: null });
    expect(rejected(cast(w, 'plague', g.pos, { targetId: g.id, option: 'the_pox' }))).toMatchObject({ reason: 'bad_option' });
    cast(w, 'plague', g.pos, { targetId: g.id, option: 'spotted_fever' });
    expect(g.health.disease).toMatchObject({ id: 'spotted_fever', stage: 'sick' });
  });

  it('Blight sickens the apple bushes in the area; Flood puts the low ground under for a day', () => {
    const w = makeWorld({ size: 32 });
    at(w, 3, 0.3);
    const inside = placePlant(w, 'apple_bush', 'mature', { x: 10, y: 10 }), outside = placePlant(w, 'apple_bush', 'mature', { x: 22, y: 22 });
    cast(w, 'blight', { x: 10, y: 10 }, { radius: 4 });
    expect(inside.blight).toBeCloseTo(M.blight, 4);
    expect(outside.blight).toBe(0);
    // a hollow by the river: these tiles lie just above the water
    const low: number[] = [];
    for (let y = 14; y < 18; y++) for (let x = 14; x < 18; x++) { const i = y * w.s.size.w + x; w.s.tiles[i]!.height = CFG.world.waterLevel + 0.02; low.push(i); }
    const high = 20 * w.s.size.w + 20;
    const fert = w.s.tiles[low[0]!]!.fertility;
    const evs = cast(w, 'flood', { x: 16, y: 16 }, { radius: 8 });
    expect(evs.some((e) => e.type === 'god_flood' && e.tiles === low.length)).toBe(true);
    for (const i of low) expect(w.s.tiles[i]).toMatchObject({ biome: 'water', walkable: false });
    expect(w.s.tiles[high]!.walkable).toBe(true);
    for (let h = 0; h < 25; h++) { w.s.tick += HOUR - (w.s.tick % HOUR); updateClimate(w); }
    for (const i of low) expect(w.s.tiles[i]!.walkable).toBe(true);
    expect(w.s.tiles[low[0]!]!.fertility).toBeGreaterThan(fert);
    expect(w.s.climate.godFloods).toEqual([]);
  });

  it('Earthquake halves building hp, breaks rocks into stone and throws goblins off their feet', () => {
    const w = makeWorld({ size: 40 });
    at(w, 3, 0.3);
    const hut = placeBlueprint(w, 'hut', { x: 20, y: 20 }, null);
    completeBuilding(w, hut, null);
    w.s.rocks.push({ id: 9001, pos: { x: 24, y: 18 }, size: 2, stoneLeft: 7, flintChance: 0 });
    const g = spawnGoblin(w, { pos: { x: 18, y: 22 } });
    cast(w, 'earthquake', { x: 20, y: 20 });
    expect(hut.hp).toBeCloseTo(hut.maxHp * (1 - M.quakeHp), 3);
    expect(w.s.rocks.some((r) => r.id === 9001)).toBe(false);
    const stone = w.s.groundItems.filter((i) => i.stack.type === 'stone' && dist(i.pos, { x: 24, y: 18 }) < 1.5).reduce((a, i) => a + i.stack.qty, 0);
    expect(stone).toBe(7);
    expect(g.mood.modifiers.some((m) => m.id === 'quake')).toBe(true);
  });

  it('Sanctuary keeps enemies out for a day and calms the danger inside', () => {
    const w = makeWorld({ size: 40 });
    at(w, 3, 0.9);
    const c = { x: 20, y: 20 };
    const e = spawnEnemy(w, 'gnasher', { x: 22, y: 20 });
    const before = dangerAt(w, c);
    cast(w, 'sanctuary', c);
    expect(dist(e.pos, c)).toBeGreaterThan(8);
    e.pos = { x: 21, y: 21 };
    for (let i = 0; i < 20; i++) { w.step(); expect(dist(e.pos, c)).toBeGreaterThan(7.9); }
    expect(dangerAt(w, c)).toBeLessThan(Math.max(before, 0.01));
    w.s.tick += DAY;
    w.step();
    expect(w.s.god.sanctuaries).toEqual([]);
  });

  it('Vision writes what lies around into every memory; Bring Forth sends down a grown goblin of the chosen stock', () => {
    const w = makeWorld({ size: 40 });
    at(w, 3, 0.3);
    const g = spawnGoblin(w, { pos: { x: 10, y: 10 } });
    w.s.rocks.push({ id: 9002, pos: { x: 30, y: 30 }, size: 1, stoneLeft: 3, flintChance: 0 });
    g.memory = [];
    cast(w, 'vision', { x: 0, y: 0 });
    expect(g.memory.some((m) => m.kind === 'rock' && m.targetId === 9002)).toBe(true);
    const n = w.s.goblins.length;
    const evs = cast(w, 'bring_forth', { x: 20, y: 20 }, { option: 'ember' });
    const born = evs.find((e) => e.type === 'brought_forth');
    expect(w.s.goblins.length).toBe(n + 1);
    const nb = w.goblin((born as { goblinId: number }).goblinId)!;
    expect(nb.lifeStage).toBe('adult');
    expect(nb.godView.faith).toBe(M.bringFaith);
    expect(w.s.lineage[nb.id]).toBeDefined();
  });

  it('a save keeps floods and sanctuaries; old saves get none', () => {
    const w = makeWorld({ size: 32 });
    at(w, 3, 0.3);
    cast(w, 'sanctuary', { x: 16, y: 16 });
    const back = deserialize(serialize(w.s));
    expect(back.god.sanctuaries.length).toBe(1);
    const raw = JSON.parse(serialize(w.s)) as { version: number; god: Record<string, unknown>; climate: Record<string, unknown> };
    raw.version = 19;
    delete raw.god.sanctuaries;
    delete raw.climate.godFloods;
    const old = deserialize(JSON.stringify(raw));
    expect(old.god.sanctuaries).toEqual([]);
    expect(old.climate.godFloods).toEqual([]);
  });
});
