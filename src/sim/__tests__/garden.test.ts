import { describe, expect, it } from 'vitest';
import { CFG } from '../config';
import { clockAt } from '../time';
import { setWeather } from '../weather';
import { villageNeeds } from '../ai/actions/village';
import { SpreadCompost, TendCompost } from '../ai/actions/compost';
import { PavePath } from '../ai/actions/pave';
import { findPlantingSite } from '../ai/targets';
import { completeBuilding, placeBlueprint } from '../buildings';
import { deposit, stockCount } from '../stockpile';
import { learn } from '../knowledge';
import { canBe } from '../critters';
import { compostTarget, gardenBeds, gardenMul, gardenSite, heapCompost, heapFill, inGarden, updateCompost } from '../garden';
import { nextSpan, wornTiles } from '../roads';
import { findPath, tileCost } from '../pathfinding';
import { updateWear } from '../god/terraform';
import { updateSpoilage } from '../spoilage';
import { deserialize, serialize } from '../save';
import { tileAt, tileIndex } from '../grid';
import { makeWorld, placePlant, spawnGoblin } from './helpers';
import type { UtilityAction } from '../ai/action';
import type { Building, Goblin } from '../state';
import type { World } from '../world';
import type { BuildingType, Vec2 } from '../../shared/types';

const DAY = CFG.time.dayTicks;

function at(w: World, day: number, frac: number): void {
  const tick = day * DAY + Math.round(frac * DAY);
  w.s.tick = tick;
  w.clock = clockAt(tick);
  setWeather(w, 'clear');
  w.s.weather.nextChangeTick = tick + 100 * DAY;
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
function station(w: World, type: BuildingType, p: Vec2): Building {
  const b = placeBlueprint(w, type, p, null);
  completeBuilding(w, b, null);
  return b;
}

describe('gardens and roads (P7.4, §8.3, §10.4–10.5)', () => {
  it('a garden plot is planned on good soil, planted in first, grows faster and keeps hoppers out', () => {
    const w = makeWorld({ size: 30 });
    at(w, 3, 0.3);
    const g = spawnGoblin(w, { pos: { x: 15.5, y: 15.5 } });
    station(w, 'hut', { x: 10, y: 20 });
    station(w, 'campfire', { x: 18, y: 12 });
    learn(w, g, 'garden_plot', 'discovery');
    expect(villageNeeds(w)).not.toContain('garden_plot'); // not while the store is bare
    deposit(w.s, { type: 'apple', qty: 10 });
    w.s.tick++;
    expect(villageNeeds(w)).toContain('garden_plot');
    const site = gardenSite(w)!;
    expect(site).not.toBeNull();
    const plot = station(w, 'garden_plot', site);
    const beds = gardenBeds(plot);
    expect(beds).toHaveLength(4);
    for (const p of beds) expect(inGarden(w.s, p)).toBe(true);
    expect(gardenMul(w.s, beds[0]!)).toBe(CFG.garden.plot.growth);
    expect(gardenMul(w.s, { x: 2.5, y: 25.5 })).toBe(1);
    // the planter goes for a bed
    const bed = findPlantingSite(g, w)!;
    expect(beds.some((p) => p.x === bed.x && p.y === bed.y)).toBe(true);
    expect(canBe(w, 'hopper', bed.x, bed.y)).toBe(false);
    expect(canBe(w, 'hopper', 2.5, 25.5)).toBe(true);
  });

  it('a compost heap takes the store\'s spare waste and its rot, turns it in two days, and the compost feeds tired soil', () => {
    const w = makeWorld({ size: 30 });
    at(w, 3, 0.3);
    const sp = w.s.village.stockpilePos;
    const heap = station(w, 'compost_heap', { x: Math.floor(sp.x) + 3, y: Math.floor(sp.y) });
    deposit(w.s, { type: 'apple_core', qty: CFG.garden.compost.coreKeep + 3 });
    deposit(w.s, { type: 'leaves', qty: CFG.garden.compost.leafKeep + 2 });
    const g = spawnGoblin(w, { pos: { ...sp } });
    expect(TendCompost.isAvailable(g, w)).toBe(true);
    expect(run(w, g, TendCompost)).toBe('done');
    expect(heapFill(heap)).toBe(4); // a load: the spare leaves first, then cores
    expect(stockCount(w.s, 'leaves')).toBe(CFG.garden.compost.leafKeep);
    expect(stockCount(w.s, 'apple_core')).toBe(CFG.garden.compost.coreKeep + 1);
    // food rotting in the store goes on the heap too
    deposit(w.s, { type: 'apple', qty: 10 });
    const before = heapFill(heap);
    for (let i = 0; i < DAY; i++) { w.s.tick++; updateSpoilage(w); }
    expect(heapFill(heap)).toBeGreaterThan(before);
    // two days on, it is compost
    w.s.tick = heap.data!.since! + CFG.garden.compost.ripenDays * DAY - (heap.data!.since! + CFG.garden.compost.ripenDays * DAY) % CFG.god.hourTicks + CFG.god.hourTicks;
    updateCompost(w);
    expect(heapCompost(heap)).toBeGreaterThan(0);
    expect(heapFill(heap)).toBe(0);
    // spread on the tired soil under a young bush
    w.clock = clockAt(w.s.tick - (w.s.tick % DAY) + Math.round(0.3 * DAY));
    w.s.tick = w.s.tick - (w.s.tick % DAY) + Math.round(0.3 * DAY);
    const bush = placePlant(w, 'apple_bush', 'sapling', { x: 12.5, y: 18.5 });
    tileAt(w.s, bush.pos.x, bush.pos.y)!.fertility = 0.3;
    expect(compostTarget(w, sp, () => false)).toEqual({ x: 12.5, y: 18.5 });
    expect(SpreadCompost.isAvailable(g, w)).toBe(true);
    expect(run(w, g, SpreadCompost)).toBe('done');
    // (both handfuls went on it: it was still tired after the first)
    expect(tileAt(w.s, 12.5, 18.5)!.fertility).toBeCloseTo(0.3 + 2 * CFG.garden.compost.fertility);
    expect(tileAt(w.s, 13.5, 18.5)!.fertility).toBeCloseTo(0.6 + 2 * CFG.garden.compost.edge);
  });

  it('worn trails are paved with stone: cheaper to walk, never wearing away, and kept in a save', () => {
    const w = makeWorld({ size: 30 });
    at(w, 3, 0.3);
    const g = spawnGoblin(w, { pos: { ...w.s.village.stockpilePos } });
    for (let x = 10; x < 16; x++) tileAt(w.s, x, 13)!.wear = 0.9;
    deposit(w.s, { type: 'stone', qty: CFG.garden.path.stoneKeep + 5 });
    expect(wornTiles(w.s)).toHaveLength(6);
    expect(PavePath.isAvailable(g, w)).toBe(false); // nobody knows how yet
    learn(w, g, 'stone_path', 'discovery');
    expect(PavePath.isAvailable(g, w)).toBe(true);
    expect(run(w, g, PavePath)).toBe('done');
    const paved = [10, 11, 12, 13, 14, 15].filter((x) => tileAt(w.s, x, 13)!.paved);
    expect(paved).toHaveLength(CFG.garden.path.perTrip);
    expect(stockCount(w.s, 'stone')).toBe(CFG.garden.path.stoneKeep + 5 - CFG.garden.path.perTrip);
    const x0 = paved[0]!;
    expect(tileCost(w.s, tileIndex(w.s, x0, 13))).toBeCloseTo(CFG.garden.path.cost);
    // a day's decay leaves the stone path as it is
    w.s.tick = 10 * DAY;
    updateWear(w);
    expect(tileAt(w.s, x0, 13)!.wear).toBe(1);
    expect(deserialize(serialize(w.s)).tiles[tileIndex(w.s, x0, 13)]!.paved).toBe(true);
  });

  it('a bridge is spanned over a narrow river, one plank span after the other, and the far bank can be walked to', () => {
    const w = makeWorld({ size: 40 });
    at(w, 3, 0.3);
    for (let y = 0; y < 40; y++) for (const x of [25, 26]) Object.assign(tileAt(w.s, x, y)!, { biome: 'water', walkable: false, height: 0.2 });
    w.s.village.center = { x: 20, y: 20 };
    w.s.terrainVersion++;
    const g = spawnGoblin(w, { pos: { x: 20.5, y: 20.5 } });
    station(w, 'hut', { x: 14, y: 20 });
    station(w, 'campfire', { x: 18, y: 14 });
    expect(findPath(w.s, { x: 22.5, y: 20.5 }, { x: 30.5, y: 20.5 }, new Map())).toBeNull();
    const first = nextSpan(w.s)!;
    expect(first.tile.x).toBe(25);
    expect(first.axis).toBe(0);
    learn(w, g, 'bridge', 'discovery');
    expect(villageNeeds(w)).toContain('bridge');
    const a = station(w, 'bridge', { x: first.tile.x + 0.5, y: first.tile.y + 0.5 });
    expect(tileAt(w.s, a.pos.x, a.pos.y)!.walkable).toBe(true);
    const second = nextSpan(w.s)!;
    expect(second.tile).toEqual({ x: 26, y: first.tile.y }); // the begun bridge is finished first
    station(w, 'bridge', { x: 26.5, y: second.tile.y + 0.5 });
    const y = first.tile.y + 0.5;
    expect(findPath(w.s, { x: 22.5, y }, { x: 30.5, y }, new Map())).not.toBeNull();
    // the spans stay walkable through a save
    const s2 = deserialize(serialize(w.s));
    expect(s2.tiles[tileIndex(w.s, 26, first.tile.y)]!.walkable).toBe(true);
    expect(tileAt(w.s, 26, first.tile.y)!.bridge).toBe(true);
  });
});
