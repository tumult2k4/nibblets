import { describe, expect, it } from 'vitest';
import { CFG } from '../config';
import { clockAt } from '../time';
import { setWeather } from '../weather';
import { completeBuilding, placeBlueprint } from '../buildings';
import { deposit, stockCount } from '../stockpile';
import { learn } from '../knowledge';
import { addItem, countItem } from '../inventory';
import { spawnGroundItem } from '../groundItems';
import { computeDemand, demandMul, isMaterial, storePos, updateCommons } from '../commons';
import { braveryOf, fearMul, painted } from '../adorn';
import { addFuel } from '../fire';
import { chooseCraft, craftWant } from '../crafting';
import { clothingWarmth, putOn } from '../clothing';
import { crowdAround } from '../enemies/gnasher';
import { spawnEnemy } from '../enemies/director';
import { HaulToStockpile } from '../ai/actions/haul';
import { StoreItem } from '../ai/actions/stockpile';
import { Craft } from '../ai/actions/craft';
import { deserialize, serialize } from '../save';
import { makeWorld, spawnGoblin } from './helpers';
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
/** A settled village: a campfire and a hut, so the material zone gets marked at the next 300-tick mark. */
function settled(w: World): void {
  station(w, 'campfire', { x: 9, y: 9 });
  station(w, 'hut', { x: 8, y: 16 });
  w.s.tick = Math.ceil(w.s.tick / 300) * 300;
  updateCommons(w);
}

describe('the commons (P7.5, §12.3–12.4, §11.1)', () => {
  it('a material zone is marked once the village is settled; materials are stored and fetched there, food at the old spot', () => {
    const w = makeWorld({ size: 30 });
    at(w, 3, 0.3);
    const g = spawnGoblin(w, { pos: { x: 15.5, y: 15.5 } });
    updateCommons(w);
    expect(w.s.village.materialPos).toBeUndefined(); // nothing built yet
    settled(w);
    const mp = w.s.village.materialPos!;
    const sp = w.s.village.stockpilePos;
    expect(mp).toBeDefined();
    const d = Math.hypot(mp.x - sp.x, mp.y - sp.y);
    expect(d).toBeGreaterThanOrEqual(CFG.commons.zones.ring[0]);
    expect(d).toBeLessThanOrEqual(CFG.commons.zones.ring[1]);
    expect(isMaterial('wood') && isMaterial('pelt') && isMaterial('rope')).toBe(true);
    expect(isMaterial('apple') || isMaterial('leaves') || isMaterial('ash')).toBe(false);
    expect(storePos(w.s, 'stone')).toEqual(mp);
    expect(storePos(w.s, 'apple')).toEqual(sp);
    // a goblin with wood and plenty of apples makes two trips: the wood goes to the material zone, the apples to the food
    addItem(g, { type: 'wood', qty: 3 });
    addItem(g, { type: 'apple', qty: 8 });
    expect(run(w, g, StoreItem)).toBe('done');
    expect(run(w, g, StoreItem)).toBe('done');
    expect(stockCount(w.s, 'wood')).toBe(3);
    expect(stockCount(w.s, 'apple')).toBeGreaterThan(0);
    // and survives a save
    const back = deserialize(serialize(w.s));
    expect(back.village.materialPos).toEqual(mp);
  });

  it('HaulToStockpile gathers loose piles near the center, one kind at a time, and carries them to their zone', () => {
    const w = makeWorld({ size: 30 });
    at(w, 3, 0.3);
    const g = spawnGoblin(w, { pos: { x: 15.5, y: 15.5 } });
    settled(w);
    spawnGroundItem(w, { type: 'wood', qty: 2 }, { x: 13.5, y: 12.5 });
    spawnGroundItem(w, { type: 'stone', qty: 3 }, { x: 14.5, y: 12.5 });
    spawnGroundItem(w, { type: 'apple', qty: 2 }, { x: 25.5, y: 25.5 });
    w.itemHash.rebuild(w.s.groundItems);
    expect(HaulToStockpile.isAvailable(g, w)).toBe(true);
    expect(run(w, g, HaulToStockpile)).toBe('done');
    expect(stockCount(w.s, 'wood') + stockCount(w.s, 'stone')).toBe(5); // both material piles on one trip
    expect(stockCount(w.s, 'apple')).toBe(0); // the apples are another kind (and farther off)
    expect(countItem(g, 'wood') + countItem(g, 'stone')).toBe(0);
  });

  it('village demand: shortfalls raise the scores of the work that meets them, most for the industrious', () => {
    const w = makeWorld({ size: 30 });
    at(w, 3, 0.3);
    const a = spawnGoblin(w, { pos: { x: 15.5, y: 15.5 } }), b = spawnGoblin(w, { pos: { x: 16.5, y: 15.5 } });
    a.personality.industry = 0.9;
    b.personality.industry = 0.1;
    station(w, 'hut', { x: 8, y: 16 });
    a.homeId = w.s.buildings[0]!.id;
    w.s.threat.alarms = 1;
    const d = computeDemand(w);
    expect(d.food).toBe(1); // an empty store
    expect(d.weapons).toBe(1); // nobody armed, Gnashers seen
    expect(d.housing).toBe(0.5); // one of two homeless
    w.s.village.demand = d;
    expect(demandMul(a, w.s, 'forage')).toBeGreaterThan(demandMul(b, w.s, 'forage'));
    expect(demandMul(b, w.s, 'forage')).toBeGreaterThan(1);
    expect(demandMul(a, w.s, 'chat')).toBe(1);
    deposit(w.s, { type: 'dried_apple', qty: 200 });
    expect(computeDemand(w).food).toBe(0);
  });

  it('a fur cloak is sewn at a workbench only and keeps 9 °C of the cold off', () => {
    const w = makeWorld({ size: 30 });
    at(w, 3, 0.3);
    const g = spawnGoblin(w, { pos: { x: 15.5, y: 15.5 } });
    learn(w, g, 'fur_cloak', 'discovery');
    addItem(g, { type: 'pelt', qty: 2 });
    addItem(g, { type: 'rope', qty: 1 });
    expect(craftWant(g, w, 'fur_cloak')).toBeGreaterThan(0);
    expect(chooseCraft(g, w)?.id).not.toBe('fur_cloak'); // no bench
    station(w, 'workbench', { x: 18, y: 15 });
    expect(chooseCraft(g, w)?.id).toBe('fur_cloak');
    expect(run(w, g, Craft)).toBe('done');
    const cloak = g.inventory.find((s) => s.type === 'fur_cloak')!;
    putOn(g, cloak);
    expect(clothingWarmth(g)).toBeGreaterThanOrEqual(CFG.commons.adorn.cloakWarmth);
  });

  it('a fireplace leaves ash; war paint of ash and berries is put on at once and makes a goblin braver for a day', () => {
    const w = makeWorld({ size: 30 });
    at(w, 3, 0.3);
    const g = spawnGoblin(w, { pos: { x: 15.5, y: 15.5 } });
    const fire = station(w, 'campfire', { x: 9, y: 9 });
    fire.fuel = 0;
    addFuel(fire, 'wood', 2);
    expect(fire.data?.ash).toBe(2);
    g.personality.bravery = 0.4;
    learn(w, g, 'war_paint', 'discovery');
    addItem(g, { type: 'ash', qty: 1 });
    addItem(g, { type: 'berry', qty: 1 });
    expect(craftWant(g, w, 'war_paint')).toBe(0); // no Gnashers about
    w.s.threat.alarms = 1;
    w.s.threat.marks.push({ pos: { x: 15, y: 15 }, tick: w.s.tick, weight: 1 });
    expect(craftWant(g, w, 'war_paint')).toBeGreaterThan(0);
    expect(run(w, g, Craft)).toBe('done');
    expect(countItem(g, 'war_paint')).toBe(0);
    expect(painted(g, w)).toBe(true);
    expect(braveryOf(g, w)).toBeCloseTo(0.4 + CFG.commons.adorn.paintBravery);
    expect(craftWant(g, w, 'war_paint')).toBe(0); // painted already
    w.s.tick += DAY + 1;
    expect(painted(g, w)).toBe(false);
    expect(braveryOf(g, w)).toBeCloseTo(0.4);
  });

  it('a bone necklace counts for more in the crowd a Gnasher fears', () => {
    const w = makeWorld({ size: 30 });
    at(w, 3, 0.3);
    const g = spawnGoblin(w, { pos: { x: 15.5, y: 15.5 } });
    learn(w, g, 'bone_necklace', 'discovery');
    addItem(g, { type: 'bone', qty: 3 });
    addItem(g, { type: 'rope', qty: 1 });
    expect(craftWant(g, w, 'bone_necklace')).toBeGreaterThan(0);
    const e = spawnEnemy(w, 'gnasher', { x: 16.5, y: 15.5 });
    w.goblinHash.rebuild(w.s.goblins);
    const before = crowdAround(w, e);
    expect(run(w, g, Craft)).toBe('done');
    putOn(g, g.inventory.find((s) => s.type === 'bone_necklace')!);
    expect(g.equipped.neck?.type).toBe('bone_necklace');
    expect(fearMul(g)).toBe(CFG.commons.adorn.necklaceFear);
    w.goblinHash.rebuild(w.s.goblins);
    expect(crowdAround(w, e)).toBeCloseTo(before * CFG.commons.adorn.necklaceFear);
    expect(craftWant(g, w, 'bone_necklace')).toBe(0); // one is enough
  });
});
