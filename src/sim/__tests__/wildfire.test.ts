import { describe, expect, it } from 'vitest';
import { CFG } from '../config';
import { burningAt, ignite, naturalStrike, startFire, tileFuel, updateWildfire } from '../wildfire';
import { completeBuilding, placeBlueprint } from '../buildings';
import { tileAt } from '../grid';
import { clockAt } from '../time';
import { setWeather } from '../weather';
import { EscapeFire, ExtinguishFire } from '../ai/actions/fireFight';
import { castLightning } from '../god/powers/wrath';
import { makeWorld, placePlant, spawnGoblin } from './helpers';
import type { UtilityAction } from '../ai/action';
import type { Goblin } from '../state';
import type { World } from '../world';
import type { SimEvent } from '../../shared/types';

const DAY = CFG.time.dayTicks;

/** Summer noon (season `day`), weather `kind`, wind blowing toward +x. */
function at(w: World, kind: Parameters<typeof setWeather>[1] = 'clear', day = 12): void {
  w.s.tick = day * DAY + Math.round(0.45 * DAY);
  w.clock = clockAt(w.s.tick);
  setWeather(w, kind);
  w.s.weather.nextChangeTick = w.s.tick + 100 * DAY;
  w.s.weather.windDir = 0;
}
/** A grove of mature trees on every tile of the rectangle. */
function grove(w: World, x0: number, y0: number, x1: number, y1: number): void {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) placePlant(w, 'tree', 'mature', { x: x + 0.5, y: y + 0.5 });
}
function burn(w: World, ticks: number): void {
  for (let i = 0; i < ticks; i++) { w.s.tick++; updateWildfire(w); }
}
function events(w: World): SimEvent[] {
  const evs: SimEvent[] = [];
  w.bus.subscribe((e) => evs.push(e));
  return evs;
}
function run(w: World, g: Goblin, a: UtilityAction, max = 2000): string {
  g.activity = { action: a.id, status: 'running', startedTick: w.s.tick, targetId: null, target: null, path: [], progress: 0, stage: 0 };
  if (!a.start(g, w)) return 'failed';
  for (let i = 0; i < max; i++) {
    const r = a.step(g, w);
    w.s.tick++;
    updateWildfire(w);
    w.bus.flush();
    if (r !== 'running') return r;
  }
  return 'timeout';
}

describe('Wildfire (P6.2, §10.3)', () => {
  it('spreads through a dry grove, kills trees to stumps, burns out and leaves fertile ash', () => {
    const w = makeWorld({ size: 32 });
    at(w);
    grove(w, 8, 8, 20, 20);
    const t = tileAt(w.s, 14, 14)!;
    const fert = t.fertility;
    expect(tileFuel(w, 14, 14)).toBeGreaterThan(1);
    expect(startFire(w, { x: 14.5, y: 14.5 }, 1, 'test')).toBe(true);
    burn(w, 600);
    const burned = w.s.tiles.filter((x) => x.ash).length;
    expect(burned).toBeGreaterThan(5);
    burn(w, DAY);
    expect(w.s.fires).toHaveLength(0);
    expect(w.s.plants.filter((p) => p.kind === 'tree' && p.stage === 'stump').length).toBeGreaterThan(5);
    expect(t.ash).toBeGreaterThan(0);
    expect(t.fertility).toBeGreaterThan(fert);
    // nothing outside the grove's reach (bare ground and the pond don't burn)
    expect(tileAt(w.s, 1, 1)!.ash).toBeUndefined();
  });

  it('runs downwind far more than upwind, and the rain puts it out', () => {
    let down = 0, up = 0;
    for (let seed = 1; seed <= 6; seed++) {
      const w = makeWorld({ size: 40, seed, pond: false });
      at(w);
      grove(w, 5, 18, 34, 20);
      startFire(w, { x: 19.5, y: 19.5 }, 1, 'test');
      burn(w, 500);
      down += w.s.tiles.filter((x, i) => (x.ash || w.s.fires.some((f) => f.y * 40 + f.x === i)) && i % 40 > 20).length;
      up += w.s.tiles.filter((x, i) => (x.ash || w.s.fires.some((f) => f.y * 40 + f.x === i)) && i % 40 < 19).length;
    }
    expect(down).toBeGreaterThan(up * 1.5);
    const w = makeWorld({ size: 32 });
    at(w, 'rain');
    grove(w, 8, 8, 20, 20);
    startFire(w, { x: 14.5, y: 14.5 }, 1, 'test');
    burn(w, 200);
    expect(w.s.fires).toHaveLength(0);
    expect(w.s.tiles.filter((x) => x.ash).length).toBeLessThanOrEqual(1);
  });

  it('burns a wooden hut and whoever is in the flames; a campfire never spreads', () => {
    const w = makeWorld({ size: 32 });
    at(w);
    const hut = placeBlueprint(w, 'hut', { x: 16, y: 16 }, null);
    completeBuilding(w, hut, null);
    const fire = placeBlueprint(w, 'campfire', { x: 8.5, y: 8.5 }, null);
    completeBuilding(w, fire, null);
    fire.fuel = 9999;
    grove(w, 7, 7, 10, 10);
    const evs = events(w);
    ignite(w, 15, 15, 1, 'test');
    burn(w, 400);
    expect(evs.some((e) => e.type === 'building_destroyed' && e.buildingId === hut.id) || hut.hp < hut.maxHp * 0.5).toBe(true);
    expect(w.s.fires.some((f) => f.x >= 7 && f.x <= 10 && f.y >= 7 && f.y <= 10)).toBe(false);
  });

  it('a goblin in the flames runs out; goblins stomp a small fire out before it spreads far', () => {
    const w = makeWorld({ size: 32 });
    at(w);
    grove(w, 10, 10, 16, 16);
    ignite(w, 13, 13, 0.5, 'test');
    const g = spawnGoblin(w, { pos: { x: 13.5, y: 13.5 } });
    expect(EscapeFire.isAvailable(g, w)).toBe(true);
    expect(run(w, g, EscapeFire)).toBe('done');
    expect(burningAt(w, g.pos)).toBeUndefined();
    // a fresh small fire, two fighters
    const v = makeWorld({ size: 32, seed: 3 });
    at(v);
    grove(v, 10, 10, 16, 16);
    v.s.village.center = { x: 13, y: 13 };
    ignite(v, 13, 13, 0.3, 'test');
    const a = spawnGoblin(v, { pos: { x: 13.5, y: 18 } }), b = spawnGoblin(v, { pos: { x: 18, y: 13.5 } });
    expect(ExtinguishFire.isAvailable(a, v)).toBe(true);
    expect(ExtinguishFire.score(a, v)).toBeGreaterThan(0.3);
    for (const x of [a, b]) { x.activity = { action: 'extinguish_fire', status: 'running', startedTick: v.s.tick, targetId: null, target: null, path: [], progress: 0, stage: 0 }; ExtinguishFire.start(x, v); }
    const evs = events(v);
    const fight = (x: Goblin) => {
      if (x.activity.status !== 'running') {
        if (!ExtinguishFire.isAvailable(x, v)) return;
        x.activity = { action: 'extinguish_fire', status: 'running', startedTick: v.s.tick, targetId: null, target: null, path: [], progress: 0, stage: 0 };
        if (!ExtinguishFire.start(x, v)) { x.activity.status = 'failed'; return; }
      }
      if (ExtinguishFire.step(x, v) !== 'running') x.activity.status = 'done';
      if (burningAt(v, x.pos)) x.pos = { x: x.pos.x + 1, y: x.pos.y + 1 }; // (what EscapeFire would do)
    };
    for (let i = 0; i < 1500 && v.s.fires.length; i++) { fight(a); fight(b); v.s.tick++; updateWildfire(v); v.bus.flush(); }
    expect(v.s.fires).toHaveLength(0);
    expect(evs.some((e) => e.type === 'fire_stomped')).toBe(true);
    expect(v.s.tiles.filter((x) => x.ash).length).toBeLessThan(12);
  });

  it('lightning, natural or divine, can set a tree alight', () => {
    const w = makeWorld({ size: 32 });
    at(w);
    placePlant(w, 'tree', 'mature', { x: 20.5, y: 20.5 });
    castLightning(w, { pos: { x: 20.5, y: 20.5 }, radius: 1 } as Parameters<typeof castLightning>[1]);
    expect(burningAt(w, { x: 20.5, y: 20.5 })).toBeDefined();
    const v = makeWorld({ size: 32 });
    at(v);
    let lit = 0;
    for (let i = 0; i < 20; i++) {
      placePlant(v, 'tree', 'mature', { x: 5.5 + i, y: 25.5 });
      const evs = events(v);
      naturalStrike(v, { x: 5.5 + i, y: 25.5 });
      if (evs.length || burningAt(v, { x: 5.5 + i, y: 25.5 })) lit += burningAt(v, { x: 5.5 + i, y: 25.5 }) ? 1 : 0;
    }
    expect(lit).toBeGreaterThan(10);
  });
});
