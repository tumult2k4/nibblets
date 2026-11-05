import { describe, expect, it } from 'vitest';
import { CFG } from '../config';
import { Craft } from '../ai/actions/craft';
import { Flee, Guard } from '../ai/actions/flee';
import { completeBuilding, placeBlueprint } from '../buildings';
import { addItem, countItem } from '../inventory';
import { stockCount } from '../stockpile';
import { ringTiles } from '../fences';
import { climbing } from '../steering';
import { tileCost } from '../pathfinding';
import { tileIndex } from '../grid';
import { gateSite, placeGate, towerOf, elevation, wantsGate, warned } from '../watch';
import { spawnEnemy } from '../enemies/director';
import { enemiesDecide } from '../enemies';
import { discoveryChance } from '../knowledge';
import { deposit } from '../stockpile';
import { clockAt } from '../time';
import { setWeather } from '../weather';
import { makeWorld, spawnGoblin } from './helpers';
import type { UtilityAction } from '../ai/action';
import type { Building, Goblin } from '../state';
import type { World } from '../world';
import type { BuildingType, SimEvent } from '../../shared/types';

const DAY = CFG.time.dayTicks;

function at(w: World, day: number, frac: number): void {
  const tick = day * DAY + Math.round(frac * DAY);
  w.s.tick = tick;
  w.clock = clockAt(tick);
  setWeather(w, 'clear');
  w.s.weather.nextChangeTick = tick + 100 * DAY;
}
function events(w: World): SimEvent[] {
  const evs: SimEvent[] = [];
  w.bus.subscribe((e) => evs.push(e));
  return evs;
}
function begin(w: World, g: Goblin, a: UtilityAction): boolean {
  g.activity = { action: a.id, status: 'running', startedTick: w.s.tick, targetId: null, target: null, path: [], progress: 0, stage: 0 };
  return a.start(g, w);
}
function run(w: World, g: Goblin, a: UtilityAction, max = 3000): string {
  if (!begin(w, g, a)) return 'failed';
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

describe('workbench, gate and watchtower (P5.7)', () => {
  it('crafting at a workbench goes half again as fast', () => {
    const work = (bench: boolean): number => {
      const w = makeWorld();
      at(w, 2, 0.3);
      const g = spawnGoblin(w, { pos: { x: 12, y: 12 } });
      addItem(g, { type: 'wood', qty: 2 }); // a spear: it has no weapon yet
      if (bench) station(w, 'workbench', 15, 12);
      expect(begin(w, g, Craft)).toBe(true);
      for (let i = 0; i < 400 && g.activity.stage !== 1; i++) { Craft.step(g, w); w.s.tick++; }
      expect(g.activity.stage).toBe(1);
      return g.activity.progress;
    };
    const plain = work(false), bench = work(true);
    expect(Math.abs(bench - plain / CFG.workbench.speedMul)).toBeLessThanOrEqual(1);
  });

  it('a worn spear is mended at the bench with half its wood, good as new', () => {
    const w = makeWorld();
    at(w, 2, 0.3);
    const evs = events(w);
    const g = spawnGoblin(w, { pos: { x: 12, y: 12 } });
    g.equipped.hand = { type: 'spear', qty: 1, dur: 4 };
    addItem(g, { type: 'wood', qty: 1 });
    expect(Craft.isAvailable(g, w)).toBe(false); // no bench, nothing to make
    station(w, 'workbench', 15, 12);
    expect(Craft.isAvailable(g, w)).toBe(true);
    expect(run(w, g, Craft)).toBe('done');
    expect(g.equipped.hand?.dur).toBeUndefined();
    expect(countItem(g, 'wood')).toBe(0);
    expect(evs.some((e) => e.type === 'tool_mended' && e.item === 'spear')).toBe(true);
  });

  it('a gate lets goblins walk through where they would climb a post; enemies are kept out all the same', () => {
    const w = makeWorld({ size: 30 });
    for (let y = 0; y < 30; y++) station(w, 'fence', 15.5, y + 0.5);
    const gate = placeGate(w, { x: 15.5, y: 10.5 });
    expect(w.s.buildings.filter((b) => b.type === 'fence')).toHaveLength(29); // the post made way
    expect(stockCount(w.s, 'wood')).toBe(1);
    completeBuilding(w, gate, null);
    const gi = tileIndex(w.s, 15, 10), pi = tileIndex(w.s, 15, 20);
    expect(w.enemyBlocked()[gi]).toBe(1);
    expect(tileCost(w.s, gi)).toBe(1);
    expect(tileCost(w.s, pi)).toBe(CFG.buildings.occupiedCost);
    expect(climbing(w, { x: 15.5, y: 10.5 })).toBe(false);
    expect(climbing(w, { x: 15.5, y: 20.5 })).toBe(true);
    // from two tiles off, the way round through the gate beats climbing
    const from = { x: 12.5, y: 12.5 }, path = [from, ...w.path(from, { x: 18.5, y: 12.5 })!];
    const cross = path.slice(1).map((b, i) => [path[i]!, b] as const).find(([a, b]) => (a.x - 15.5) * (b.x - 15.5) <= 0)!;
    const [a, b] = cross;
    expect(Math.floor(a.y + ((b.y - a.y) * (15.5 - a.x)) / (b.x - a.x || 1))).toBe(10);
    expect(w.enemyPath({ x: 12.5, y: 10.5 }, { x: 18.5, y: 10.5 })).toBeNull();
  });

  it('the gate goes where the ring is crossed most, at most two, apart', () => {
    const w = makeWorld({ size: 30 });
    w.s.village.fenceRing = 6;
    const ring = ringTiles(w.s, 6);
    for (const p of ring) station(w, 'fence', p.x, p.y);
    expect(wantsGate(w)).toBe(true);
    // a trail crossing the ring on the east side
    const c = w.s.village.center, y = Math.floor(c.y);
    for (let x = Math.floor(c.x) + 3; x <= Math.floor(c.x) + 9; x++) w.s.tiles[tileIndex(w.s, x, y)]!.wear = 1;
    const site = gateSite(w)!;
    expect(Math.floor(site.y)).toBe(y);
    expect(site.x).toBeGreaterThan(c.x);
    completeBuilding(w, placeGate(w, site), null);
    const second = gateSite(w)!;
    expect(Math.hypot(second.x - site.x, second.y - site.y)).toBeGreaterThanOrEqual(CFG.watch.gateSpacing);
    completeBuilding(w, placeGate(w, second), null);
    expect(wantsGate(w)).toBe(false);
    // the idea of a gate only comes once there is a fence
    const w2 = makeWorld();
    const g = spawnGoblin(w2, { pos: { ...w2.s.village.stockpilePos } });
    deposit(w2.s, { type: 'wood', qty: 3 });
    deposit(w2.s, { type: 'rope', qty: 2 });
    expect(discoveryChance(g, w2, 'gate')).toBe(0);
    station(w2, 'fence', 3.5, 20.5);
    expect(discoveryChance(g, w2, 'gate')).toBeGreaterThan(0);
  });

  it('a lookout up the watchtower sees three times as far and warns the village: children run home', () => {
    const w = makeWorld({ size: 48 });
    at(w, 5, 0.85); // night
    const tower = station(w, 'watchtower', 24, 24);
    const hut = station(w, 'hut', 30, 24);
    const guard = spawnGoblin(w, { pos: { x: 25, y: 25 } });
    const kid = spawnGoblin(w, { pos: { x: 20, y: 30 }, ageDays: 8 });
    kid.lifeStage = 'youngling';
    kid.homeId = hut.id;
    expect(Guard.isAvailable(guard, w)).toBe(true); // no spear needed to keep a lookout
    expect(run(w, guard, Guard, 200)).toBe('timeout'); // still on watch
    expect(towerOf(guard, w)).toBe(tower);
    expect(elevation(guard, w)).toBe(CFG.watch.platform);
    const evs = events(w);
    const e = spawnEnemy(w, 'gnasher', { x: 24, y: 24 + CFG.goblin.visionNight * 2.5 });
    e.seen = false;
    enemiesDecide(w);
    w.bus.flush();
    expect(e.seen).toBe(true);
    expect(evs.some((x) => x.type === 'tower_warning' && x.goblinId === guard.id)).toBe(true);
    expect(warned(w)).toBe(true);
    expect(Flee.isAvailable(kid, w)).toBe(true);
    expect(begin(w, kid, Flee)).toBe(true);
    expect(Math.hypot(kid.activity.target!.x - hut.pos.x, kid.activity.target!.y - hut.pos.y)).toBeLessThan(2);
    // from the ground, the same Gnasher goes unseen
    const w2 = makeWorld({ size: 48 });
    at(w2, 5, 0.85);
    spawnGoblin(w2, { pos: { x: 24, y: 24 } });
    const e2 = spawnEnemy(w2, 'gnasher', { x: 24, y: 24 + CFG.goblin.visionNight * 2.5 });
    e2.seen = false;
    enemiesDecide(w2);
    expect(e2.seen).toBe(false);
  });
});
