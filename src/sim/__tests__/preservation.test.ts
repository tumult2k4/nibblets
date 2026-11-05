import { describe, expect, it } from 'vitest';
import { CFG } from '../config';
import { CutGrass } from '../ai/actions/gather';
import { Process } from '../ai/actions/process';
import { StoreItem } from '../ai/actions/stockpile';
import { regrowGrass } from '../ecology';
import { finishCraft } from '../crafting';
import { completeBuilding, placeBlueprint } from '../buildings';
import { addItem, countItem, foodStack, slotCount } from '../inventory';
import { deposit, stockCount, stockFood } from '../stockpile';
import { updateSpoilage } from '../spoilage';
import { rackDried, rackLoad, updateRacks } from '../preserve';
import { charm, putOn, wetMul } from '../clothing';
import { feltTemperature } from '../temperature';
import { discoveryChance } from '../knowledge';
import { STARTER_RECIPES } from '../recipes';
import { clockAt } from '../time';
import { setWeather } from '../weather';
import { deserialize, serialize } from '../save';
import { makeWorld, spawnGoblin } from './helpers';
import type { UtilityAction } from '../ai/action';
import type { Building, Goblin } from '../state';
import type { World } from '../world';
import type { BuildingType, SimEvent } from '../../shared/types';

const DAY = CFG.time.dayTicks;
const SEASON = CFG.time.daysPerSeason * DAY;
const R = CFG.preserve;

function at(w: World, tick: number, weather: Parameters<typeof setWeather>[1] = 'clear'): void {
  w.s.tick = tick;
  w.clock = clockAt(tick);
  setWeather(w, weather);
  w.s.weather.nextChangeTick = tick + 100 * DAY;
}
function run(w: World, g: Goblin, a: UtilityAction, max = 3000): string {
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
function station(w: World, type: BuildingType, x: number, y: number): Building {
  const b = placeBlueprint(w, type, { x, y }, null);
  completeBuilding(w, b, null);
  return b;
}
/** Run spoilage (and racks) for `days`. */
function age(w: World, days: number): void {
  w.s.tick = Math.ceil(w.s.tick / R.spoilEvery) * R.spoilEvery;
  for (let i = 0; i < (days * DAY) / R.spoilEvery; i++) {
    w.s.tick += R.spoilEvery;
    updateSpoilage(w);
    updateRacks(w);
  }
}

describe('fiber chain & preservation (P5.6)', () => {
  it('grass is cut for fiber and thins; it grows back in spring but not in winter', () => {
    const w = makeWorld();
    at(w, 2 * DAY);
    const g = spawnGoblin(w, { pos: { x: 12, y: 12 } });
    const patch = { id: 9001, pos: { x: 15.5, y: 12.5 }, density: 0.8 };
    w.s.grass.push(patch);
    expect(run(w, g, CutGrass)).toBe('done');
    expect(countItem(g, 'fiber')).toBeGreaterThanOrEqual(CFG.fiber.fiberPerCut[0]);
    expect(patch.density).toBeCloseTo(0.8 - CFG.fiber.cutDensity, 4);
    const cut = patch.density;
    at(w, 2 * DAY + 50 * CFG.fiber.regrowEvery);
    regrowGrass(w);
    expect(patch.density).toBeGreaterThan(cut);
    const spring = patch.density;
    at(w, 3 * SEASON + 2 * DAY);
    w.s.tick = Math.ceil(w.s.tick / CFG.fiber.regrowEvery) * CFG.fiber.regrowEvery;
    regrowGrass(w);
    expect(patch.density).toBe(spring);
  });

  it('fiber goods: a basket carries four more, clothes keep warm, a leaf cape sheds rain, a crown charms — and gear is never stored', () => {
    const w = makeWorld();
    at(w, 2 * DAY);
    const g = spawnGoblin(w, { pos: { ...w.s.village.stockpilePos } });
    expect(STARTER_RECIPES).toEqual(expect.arrayContaining(['rope', 'basket', 'sleeping_mat', 'loincloth', 'flower_crown']));
    const slots = slotCount(g);
    addItem(g, { type: 'fiber', qty: 3 });
    expect(finishCraft(w, g, 'basket')?.type).toBe('basket');
    expect(slotCount(g)).toBe(slots + 5); // the basket's own slot is free: 4 more for stuff
    const cold = feltTemperature(w, g);
    addItem(g, { type: 'loincloth', qty: 1 });
    putOn(g, g.inventory.find((s) => s.type === 'loincloth')!);
    expect(feltTemperature(w, g)).toBeCloseTo(cold + 2, 5);
    putOn(g, { type: 'leaf_cape', qty: 1 } as never); // not in the pack: nothing happens
    addItem(g, { type: 'leaf_cape', qty: 1 });
    putOn(g, g.inventory.find((s) => s.type === 'leaf_cape')!);
    expect(g.equipped.body?.type).toBe('leaf_cape');
    expect(countItem(g, 'loincloth')).toBe(1); // back in the pack
    expect(wetMul(g)).toBe(0.5);
    addItem(g, { type: 'flower_crown', qty: 1 });
    putOn(g, g.inventory.find((s) => s.type === 'flower_crown')!);
    expect(charm(g)).toBe(CFG.fiber.crownCharm);
    addItem(g, { type: 'wood', qty: 2 });
    expect(run(w, g, StoreItem)).toBe('done');
    expect(stockCount(w.s, 'wood')).toBe(2);
    expect(countItem(g, 'basket')).toBe(1);
    expect(countItem(g, 'loincloth')).toBe(1);
  });

  it('stored food rots by its shelf life; a storage pit halves it; dried apples keep', () => {
    const w = makeWorld();
    at(w, 2 * DAY);
    const evs: SimEvent[] = [];
    w.bus.subscribe((e) => evs.push(e));
    deposit(w.s, { type: 'apple', qty: 100 });
    deposit(w.s, { type: 'dried_apple', qty: 100 });
    age(w, 1);
    w.bus.flush();
    expect(stockCount(w.s, 'apple')).toBeGreaterThan(74);
    expect(stockCount(w.s, 'apple')).toBeLessThan(82); // ≈ 100 · e^(−1/4)
    expect(stockCount(w.s, 'dried_apple')).toBeGreaterThanOrEqual(95);
    expect(evs.some((e) => e.type === 'food_spoiled' && (e.items.apple ?? 0) > 15)).toBe(true);
    const w2 = makeWorld();
    at(w2, 2 * DAY);
    station(w2, 'storage_pit', w2.s.village.stockpilePos.x + 2, w2.s.village.stockpilePos.y);
    deposit(w2.s, { type: 'apple', qty: 100 });
    age(w2, 1);
    expect(stockCount(w2.s, 'apple')).toBeGreaterThan(85); // ≈ 100 · e^(−1/8)
  });

  it('the grinding stone makes mash of surplus apples (2 → 1); a drying rack dries a batch in a dry day', () => {
    const w = makeWorld({ size: 30 });
    at(w, 2 * DAY);
    const sp = w.s.village.stockpilePos;
    const g = spawnGoblin(w, { pos: { x: sp.x - 1, y: sp.y } });
    expect(Process.isAvailable(g, w)).toBe(false); // no station yet
    station(w, 'grinding_stone', Math.round(sp.x) + 3, Math.round(sp.y) + 3);
    deposit(w.s, { type: 'apple', qty: 20 });
    expect(Process.isAvailable(g, w)).toBe(true);
    expect(run(w, g, Process)).toBe('done');
    expect(stockCount(w.s, 'apple_mash')).toBe(R.grindBatch);
    expect(stockCount(w.s, 'apple')).toBe(20 - R.grindIn * R.grindBatch);
    // a rack: loading from the surplus starts a batch; rain stalls it; a dry day finishes it
    const rack = station(w, 'drying_rack', Math.round(sp.x) - 3, Math.round(sp.y) + 3);
    deposit(w.s, { type: 'apple', qty: 20 });
    expect(run(w, g, Process)).not.toBe('failed');
    expect(rackLoad(rack)).toBeGreaterThanOrEqual(R.rackMin);
    setWeather(w, 'rain');
    age(w, 1);
    expect(rackDried(rack)).toBe(0);
    setWeather(w, 'clear');
    const n = rackLoad(rack);
    age(w, 1.05);
    expect(rackLoad(rack)).toBe(0);
    expect(rackDried(rack)).toBe(n);
    g.pos = { ...rack.pos, x: rack.pos.x + 1 };
    expect(run(w, g, Process)).toBe('done');
    expect(stockCount(w.s, 'dried_apple')).toBe(n);
  });

  it('goblins eat what rots soonest first, so the preserves are kept for lean days', () => {
    const w = makeWorld();
    const g = spawnGoblin(w);
    addItem(g, { type: 'dried_apple', qty: 3 });
    addItem(g, { type: 'apple_mash', qty: 1 });
    addItem(g, { type: 'apple', qty: 1 });
    expect(foodStack(g)?.type).toBe('apple');
    deposit(w.s, { type: 'dried_apple', qty: 5 });
    deposit(w.s, { type: 'apple_mash', qty: 5 });
    expect(stockFood(w.s)?.type).toBe('apple_mash');
  });

  it('the idea of a drying rack comes at the stockpile among apples, wood and rope — sooner when food is rotting; never in the control run', () => {
    const w = makeWorld();
    const g = spawnGoblin(w, { pos: { ...w.s.village.stockpilePos } });
    expect(discoveryChance(g, w, 'drying_rack')).toBe(0);
    deposit(w.s, { type: 'wood', qty: 3 });
    deposit(w.s, { type: 'rope', qty: 2 });
    deposit(w.s, { type: 'apple', qty: 5 });
    const p = discoveryChance(g, w, 'drying_rack');
    expect(p).toBeGreaterThan(0);
    w.s.village.spoiled = { apple: 10 };
    expect(discoveryChance(g, w, 'drying_rack')).toBeCloseTo(p * (1 + 10 * R.rotIdeaPer), 6);
    (CFG.preserve as { enabled: boolean }).enabled = false;
    try { expect(discoveryChance(g, w, 'drying_rack')).toBe(0); } finally { (CFG.preserve as { enabled: boolean }).enabled = true; }
  });

  it('v12 saves learn the new everyday recipes', () => {
    const w = makeWorld();
    spawnGoblin(w);
    const raw = JSON.parse(serialize(w.s)) as { version: number; goblins: { knownRecipes: string[] }[] };
    raw.version = 12;
    for (const g of raw.goblins) g.knownRecipes = ['hut', 'campfire'];
    const s = deserialize(JSON.stringify(raw));
    expect(s.goblins[0]!.knownRecipes).toEqual(expect.arrayContaining(['rope', 'basket', 'loincloth', 'flower_crown', 'sleeping_mat']));
  });
});
