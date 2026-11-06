import { describe, expect, it } from 'vitest';
import { CFG } from '../config';
import { clockAt } from '../time';
import { dist } from '../../shared/math';
import { tileAt } from '../grid';
import { addLabor, findSite, footprintTiles, laborRate, missingMaterials, placeBlueprint, completeBuilding } from '../buildings';
import { feltTemperature, shelterOf } from '../temperature';
import { setWeather } from '../weather';
import { deposit, stockCount } from '../stockpile';
import { makeWorld, spawnGoblin } from './helpers';
import type { SimEvent } from '../../shared/types';
import { xpFor } from '../goblin/skills';

const DAY = CFG.time.dayTicks;

function calm(w: ReturnType<typeof makeWorld>): void {
  w.s.tick = 2 * DAY + 300;
  w.clock = clockAt(w.s.tick);
  setWeather(w, 'clear');
  w.s.weather.nextChangeTick = w.s.tick + 100 * DAY;
}

describe('building system (§10.1–10.2, P3.3)', () => {
  it('findSite picks a flat dry spot near the center, spaced from other buildings, deterministically', () => {
    const w = makeWorld({ size: 40 });
    const c = w.s.village.center;
    const a = findSite(w, 'hut', c)!;
    expect(a).not.toBeNull();
    expect(findSite(w, 'hut', c)).toEqual(a);
    expect(dist(a, c)).toBeLessThanOrEqual(CFG.buildings.siteRadius);
    for (const p of footprintTiles(a, 2)) expect(tileAt(w.s, p.x, p.y)!.biome).not.toBe('water');
    placeBlueprint(w, 'hut', a, null);
    const b = findSite(w, 'hut', c)!;
    expect(dist(a, b)).toBeGreaterThanOrEqual(CFG.buildings.hutSpacing[0]);
    // the pond sits in the NW corner: huts like water 4–10 tiles away, so the first site leans toward it
    const pond = { x: 2, y: 2 };
    expect(dist(a, pond)).toBeLessThan(dist(c, pond));
  });

  it('a blueprint reserves its footprint and costs 6 wood', () => {
    const w = makeWorld();
    const b = placeBlueprint(w, 'hut', { x: 16, y: 16 }, null);
    for (const p of footprintTiles(b.pos, 2)) expect(tileAt(w.s, p.x, p.y)!.occupiedBy).toBe(b.id);
    expect(missingMaterials(b)).toEqual([{ type: 'wood', qty: 6 }]);
  });

  it('goblins cooperatively haul exactly the wood needed and build the hut within a day', () => {
    const w = makeWorld();
    calm(w);
    const gs = [spawnGoblin(w), spawnGoblin(w), spawnGoblin(w)];
    for (const g of gs) g.personality.industry = 0.9;
    deposit(w.s, { type: 'wood', qty: 10 });
    const b = placeBlueprint(w, 'hut', { x: 17, y: 17 }, gs[0]!.id);
    const evs: SimEvent[] = [];
    w.bus.subscribe((e) => evs.push(e));
    const haulers = new Set<number>();
    for (let t = 0; t < DAY && b.buildProgress < 1; t++) {
      w.step();
      for (const g of gs) if (g.activity.action === 'deliver_material' || g.activity.action === 'build') haulers.add(g.id);
      for (const g of gs) g.needs.hunger = g.needs.thirst = g.needs.energy = 90;
    }
    expect(b.buildProgress).toBe(1);
    expect(stockCount(w.s, 'wood')).toBe(4);
    expect(b.storage).toEqual([]);
    expect(haulers.size).toBeGreaterThanOrEqual(2);
    expect(evs.some((e) => e.type === 'building_completed' && e.buildingId === b.id)).toBe(true);
    expect(gs.reduce((n, g) => n + g.deeds.builds, 0)).toBeGreaterThanOrEqual(1);
    expect(gs.some((g) => (g.skills.building ?? 0) > 0)).toBe(true);
  });

  it('labor: skill, mood and a friend working alongside all speed things up', () => {
    const w = makeWorld();
    const g = spawnGoblin(w), f = spawnGoblin(w);
    const b = placeBlueprint(w, 'hut', { x: 16, y: 16 }, null);
    b.storage.push({ type: 'wood', qty: 6 });
    g.mood.value = 0;
    const base = laborRate(w, g, b);
    expect(base).toBeCloseTo(0.002, 6); // a level mood: ×1 (P8.1)
    g.skills.building = xpFor(4);
    expect(laborRate(w, g, b)).toBeCloseTo(base * 1.6, 6);
    g.skills.building = 0;
    g.mood.value = 100;
    expect(laborRate(w, g, b)).toBeCloseTo(0.002 * 1.2, 6);
    g.mood.value = 0;
    g.relationships.push({ targetId: f.id, opinion: 50, familiarity: 0, bond: 'friend', lastInteraction: 0 });
    f.activity = { ...f.activity, action: 'build', targetId: b.id };
    expect(laborRate(w, g, b)).toBeCloseTo(base * 1.3, 6);
    // no labor before materials arrive
    const b2 = placeBlueprint(w, 'hut', { x: 8, y: 16 }, null);
    expect(addLabor(w, g, b2)).toBe(false);
    expect(b2.buildProgress).toBe(0);
  });

  it('a finished hut shelters whoever stands inside (+8 °C felt)', () => {
    const w = makeWorld();
    calm(w);
    const g = spawnGoblin(w, { pos: { x: 8, y: 8 } });
    const outside = feltTemperature(w, g);
    const b = placeBlueprint(w, 'hut', { x: 8, y: 8 }, null);
    expect(shelterOf(w, g)).toBeNull();
    completeBuilding(w, b, null);
    expect(shelterOf(w, g)).toBe(b);
    expect(feltTemperature(w, g)).toBeCloseTo(outside + 8, 5);
  });

  it('sandbox can spawn a finished hut; bad sites are rejected', () => {
    const w = makeWorld();
    w.push({ type: 'sandbox', op: { op: 'spawn_building', kind: 'hut', pos: { x: 14, y: 10 }, complete: true } });
    w.push({ type: 'sandbox', op: { op: 'spawn_building', kind: 'hut', pos: { x: 2, y: 2 }, complete: false } });
    const evs: SimEvent[] = [];
    w.bus.subscribe((e) => evs.push(e));
    w.step();
    expect(w.s.buildings.length).toBe(1);
    expect(w.s.buildings[0]!.buildProgress).toBe(1);
    expect(evs.some((e) => e.type === 'command_rejected' && e.reason === 'bad_site')).toBe(true);
  });
});
