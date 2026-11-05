import { describe, expect, it } from 'vitest';
import { CFG } from '../config';
import { clockAt } from '../time';
import { setWeather } from '../weather';
import { completeBuilding, placeBlueprint } from '../buildings';
import { deposit, stockCount } from '../stockpile';
import { dist } from '../../shared/math';
import { spawnEnemy } from '../enemies/director';
import { scareAt } from '../enemies/gnasher';
import { fenceMask, fenceSites, ringTiles } from '../fences';
import { claim } from '../ai/actions/home';
import { startAction } from '../ai/utility';
import { deserialize, serialize } from '../save';
import { makeWorld, spawnGoblin } from './helpers';
import type { World } from '../world';
import type { Vec2 } from '../../shared/types';

const DAY = CFG.time.dayTicks;

function at(w: World, day: number, frac: number): void {
  const tick = day * DAY + Math.round(frac * DAY);
  w.s.tick = tick;
  w.clock = clockAt(tick);
  setWeather(w, 'clear');
  w.s.weather.nextChangeTick = tick + 100 * DAY;
}
const fed = (w: World) => { for (const g of w.s.goblins) { g.needs.hunger = 90; g.needs.thirst = 90; g.needs.energy = 90; } };
function fence(w: World, p: Vec2): void {
  completeBuilding(w, placeBlueprint(w, 'fence', p, null), null);
}
const onFence = (w: World, p: Vec2): boolean => !!fenceMask(w.s)[Math.floor(p.y) * w.s.size.w + Math.floor(p.x)];

describe('fences, repel, upgrades and repairs (P4.6)', () => {
  it('a closed ring keeps Gnashers out, while goblins can still climb over', () => {
    const w = makeWorld();
    w.s.village.fenceRing = 5;
    for (const p of ringTiles(w.s, 5)) fence(w, p);
    const c = w.s.village.center;
    expect(w.enemyPath({ x: 20.5, y: 20.5 }, c)).toBeNull();
    expect(w.path({ x: 20.5, y: 20.5 }, c)).not.toBeNull();
    at(w, 5, 0.75);
    deposit(w.s, { type: 'apple', qty: 6 });
    const e = spawnEnemy(w, 'gnasher', { x: 21, y: 21 });
    for (let t = 0; t < 600 && w.s.enemies.includes(e); t++) {
      w.step();
      expect(dist(e.pos, c)).toBeGreaterThan(4.4);
    }
    expect(stockCount(w.s, 'apple')).toBe(6);
  });

  it('Gnashers path around a fence through the gap', () => {
    const w = makeWorld();
    for (let y = 4; y < 20; y++) fence(w, { x: 12.5, y: y + 0.5 }); // a wall with gaps at both ends
    const from = { x: 8.5, y: 12.5 };
    const p = w.enemyPath(from, { x: 16.5, y: 12.5 })!;
    expect(p).not.toBeNull();
    // walk every segment in small steps: never onto a fence
    let prev = from, len = 0;
    for (const q of p) {
      for (let k = 0; k <= 20; k++) expect(onFence(w, { x: prev.x + ((q.x - prev.x) * k) / 20, y: prev.y + ((q.y - prev.y) * k) / 20 })).toBe(false);
      len += dist(prev, q);
      prev = q;
    }
    expect(len).toBeGreaterThan(16); // the long way round
    expect(w.path(from, { x: 16.5, y: 12.5 })).toHaveLength(2); // goblins climb straight over
  });

  it('a Gnasher near a lit campfire backs off, and leaves the stockpile by the fire alone', () => {
    const w = makeWorld();
    at(w, 5, 0.75);
    const fire = placeBlueprint(w, 'campfire', { x: 14, y: 13 }, null);
    completeBuilding(w, fire, null);
    deposit(w.s, { type: 'apple', qty: 6 });
    const e = spawnEnemy(w, 'gnasher', { x: 17, y: 13 });
    expect(scareAt(w, e.pos)).not.toBeNull();
    for (let t = 0; t < 120; t++) w.step();
    expect(dist(e.pos, fire.pos)).toBeGreaterThan(CFG.fire.repelRadius);
    for (let t = 0; t < 600 && w.s.enemies.includes(e); t++) w.step();
    expect(stockCount(w.s, 'apple')).toBe(6);
  });

  it('a goblin holding a burning torch is left alone', () => {
    const w = makeWorld();
    at(w, 5, 0.75);
    const g = spawnGoblin(w, { pos: { x: 8, y: 8 } });
    g.equipped.hand = { type: 'torch', qty: 1 };
    const e = spawnEnemy(w, 'gnasher', { x: 12, y: 12 });
    let bites = 0;
    w.bus.subscribe((x) => { if (x.type === 'enemy_bit') bites++; });
    for (let t = 0; t < 400; t++) { w.step(); fed(w); }
    expect(bites).toBe(0);
    expect(w.s.enemies.includes(e) ? dist(e.pos, g.pos) : 99).toBeGreaterThan(CFG.fire.torchScare - 0.5);
  });

  it('once Gnashers have been seen, a village with a fire rings its core with fence posts', () => {
    const w = makeWorld();
    at(w, 5, 0.3);
    const gs = [spawnGoblin(w, { pos: { x: 11, y: 11 } }), spawnGoblin(w, { pos: { x: 13, y: 11 } }), spawnGoblin(w, { pos: { x: 12, y: 13 } })];
    const hut = placeBlueprint(w, 'hut', { x: 9, y: 15 }, gs[0]!.id);
    completeBuilding(w, hut, null);
    for (const g of gs) claim(w, g, hut);
    const fire = placeBlueprint(w, 'campfire', { x: 12, y: 10 }, null);
    completeBuilding(w, fire, null);
    fire.fuel = CFG.fire.maxFuel;
    deposit(w.s, { type: 'wood', qty: 20 });
    expect(fenceSites(w, 1)).toHaveLength(1);
    w.s.threat.alarms = CFG.fences.alarmsToStart;
    for (let t = 0; t < 2 * DAY && w.s.buildings.filter((b) => b.type === 'fence' && b.buildProgress >= 1).length < 6; t++) { w.step(); fed(w); }
    const posts = w.s.buildings.filter((b) => b.type === 'fence');
    expect(posts.filter((b) => b.buildProgress >= 1).length).toBeGreaterThanOrEqual(6);
    const r = w.s.village.fenceRing;
    expect(r).toBeGreaterThanOrEqual(CFG.fences.ringMin);
    for (const b of posts) expect(Math.abs(dist(b.pos, w.s.village.center) - r)).toBeLessThan(0.5);
  });

  it('a goblin who knows how turns its hut into a stone hut', () => {
    const w = makeWorld();
    at(w, 5, 0.2);
    const g = spawnGoblin(w, { pos: { x: 12, y: 12 } });
    const hut = placeBlueprint(w, 'hut', { x: 16, y: 16 }, g.id);
    completeBuilding(w, hut, g.id);
    claim(w, g, hut);
    g.knownRecipes.push('stone_hut');
    deposit(w.s, { type: 'stone', qty: 6 });
    for (let t = 0; t < DAY / 2 && !(hut.type === 'stone_hut' && hut.buildProgress >= 1); t++) { w.step(); fed(w); }
    expect(hut.type).toBe('stone_hut');
    expect(hut.buildProgress).toBe(1);
    expect(hut.maxHp).toBe(CFG.buildings.defs.stone_hut!.hp);
    expect(stockCount(w.s, 'stone')).toBe(0);
    expect(g.homeId).toBe(hut.id);
    expect(CFG.storms.stormProof).toContain('stone_hut');
  });

  it('a damaged hut gets patched with wood from the stockpile', () => {
    const w = makeWorld();
    at(w, 5, 0.2);
    const g = spawnGoblin(w, { pos: { x: 12, y: 12 } });
    g.personality.industry = 1;
    const hut = placeBlueprint(w, 'hut', { x: 16, y: 16 }, g.id);
    completeBuilding(w, hut, g.id);
    claim(w, g, hut);
    hut.hp = 30;
    deposit(w.s, { type: 'wood', qty: 4 });
    expect(startAction(g, w, 'repair_building')).toBe(true);
    for (let t = 0; t < DAY / 2 && hut.hp < hut.maxHp * CFG.storms.repairBelow; t++) { w.step(); fed(w); }
    expect(hut.hp).toBeGreaterThanOrEqual(hut.maxHp * CFG.storms.repairBelow);
    expect(stockCount(w.s, 'wood')).toBe(2);
  });

  it('v6 saves gain a fence ring and an alarm count', () => {
    const w = makeWorld();
    const raw = JSON.parse(serialize(w.s)) as { version: number; village: Record<string, unknown>; threat: Record<string, unknown> };
    raw.version = 6;
    delete raw.village.fenceRing;
    delete raw.threat.alarms;
    const s = deserialize(JSON.stringify(raw));
    expect(s.village.fenceRing).toBe(0);
    expect(s.threat.alarms).toBe(0);
  });
});
