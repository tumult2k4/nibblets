import { describe, expect, it } from 'vitest';
import { CFG } from '../config';
import { clockAt } from '../time';
import { setWeather } from '../weather';
import { completeBuilding, placeBlueprint } from '../buildings';
import { addItem, countItem } from '../inventory';
import { deposit } from '../stockpile';
import { fireWarmth, isLit } from '../fire';
import { feltTemperature } from '../temperature';
import { visionRadius } from '../ai/considerations';
import { act, startAction } from '../ai/utility';
import { equipCandidate } from '../ai/actions/equip';
import { claim } from '../ai/actions/home';
import { usesLeft } from '../tools';
import { makeWorld, spawnGoblin } from './helpers';
import type { World } from '../world';
import type { SimEvent } from '../../shared/types';

const DAY = CFG.time.dayTicks;
const F = CFG.fire;

function at(w: World, tick: number, weather: 'clear' | 'rain' = 'clear'): void {
  w.s.tick = tick;
  w.clock = clockAt(tick);
  setWeather(w, weather);
  w.s.weather.nextChangeTick = tick + 100 * DAY;
}
function campfire(w: World, x = 12, y = 9) {
  const b = placeBlueprint(w, 'campfire', { x, y }, null);
  completeBuilding(w, b, null);
  return b;
}

describe('campfires and torches (P4.3)', () => {
  it('a finished campfire is lit and burns one wood per half-day, faster in rain', () => {
    const w = makeWorld();
    at(w, 2 * DAY);
    const b = campfire(w);
    expect(isLit(b)).toBe(true);
    expect(b.fuel).toBe(F.startFuel);
    const evs: SimEvent[] = [];
    w.bus.subscribe((e) => evs.push(e));
    for (let i = 0; i < F.ticksPerWood / 2; i++) w.step();
    expect(b.fuel).toBeCloseTo(F.startFuel / 2, -1);
    setWeather(w, 'rain');
    for (let i = 0; i < F.ticksPerWood / 6 + 20; i++) w.step();
    expect(isLit(b)).toBe(false);
    expect(evs.some((e) => e.type === 'campfire_out' && e.buildingId === b.id)).toBe(true);
  });

  it('fire warms its surroundings and lights the night', () => {
    const w = makeWorld();
    at(w, 2 * DAY + Math.round(0.85 * DAY));
    const b = campfire(w);
    const g = spawnGoblin(w, { pos: { x: 12, y: 10.3 }, ageDays: 12 });
    expect(fireWarmth(w, b.pos)).toBe(F.heat);
    expect(fireWarmth(w, { x: 12, y: 9 + F.warmRadius })).toBe(0);
    const near = feltTemperature(w, g);
    g.pos = { x: 12, y: 20 };
    expect(near - feltTemperature(w, g)).toBeGreaterThan(8);
    expect(visionRadius(g, w)).toBeCloseTo(CFG.goblin.visionNight);
    g.pos = { x: 12, y: 11 };
    expect(visionRadius(g, w)).toBeCloseTo(CFG.goblin.visionDay);
  });

  it('TendFire feeds a low fire from the spare stock, sticks before wood', () => {
    const w = makeWorld();
    at(w, 2 * DAY + Math.round(0.8 * DAY));
    const b = campfire(w);
    b.fuel = 100;
    deposit(w.s, { type: 'wood', qty: 5 });
    const g = spawnGoblin(w);
    expect(startAction(g, w, 'tend_fire')).toBe(true);
    for (let t = 0; t < 600 && g.activity.status === 'running'; t++) { act(w); w.s.tick++; }
    expect(g.activity.status).toBe('done');
    expect(b.fuel).toBe(100 + F.tendLoad.wood! * F.fuelTicks.wood!);
    expect(w.s.village.stockpile.find((s) => s.type === 'wood')?.qty).toBe(5 - F.tendLoad.wood!);
    expect(countItem(g, 'wood')).toBe(0);
    b.fuel = 100;
    deposit(w.s, { type: 'stick', qty: 10 });
    expect(startAction(g, w, 'tend_fire')).toBe(true);
    for (let t = 0; t < 600 && g.activity.status === 'running'; t++) { act(w); w.s.tick++; }
    expect(b.fuel).toBe(100 + F.tendLoad.stick! * F.fuelTicks.stick!);
    expect(w.s.village.stockpile.find((s) => s.type === 'stick')?.qty).toBe(10 - F.tendLoad.stick!);
  });

  it('a housed village plans, builds and lights a campfire near its center', () => {
    const w = makeWorld();
    at(w, 2 * DAY + 400);
    const gs = [spawnGoblin(w), spawnGoblin(w, { pos: { x: 13, y: 12 } })];
    const hut = placeBlueprint(w, 'hut', { x: 16, y: 17 }, gs[0]!.id);
    completeBuilding(w, hut, null);
    for (const g of gs) claim(w, g, hut);
    deposit(w.s, { type: 'wood', qty: 6 });
    deposit(w.s, { type: 'stone', qty: 2 });
    let fire;
    for (let t = 0; t < 2 * DAY && !(fire && isLit(fire)); t++) {
      w.step();
      fire = w.s.buildings.find((b) => b.type === 'campfire');
      for (const g of gs) { g.needs.hunger = Math.max(g.needs.hunger, 70); g.needs.thirst = Math.max(g.needs.thirst, 70); }
    }
    expect(fire && isLit(fire)).toBe(true);
    expect(Math.hypot(fire!.pos.x - w.s.village.center.x, fire!.pos.y - w.s.village.center.y)).toBeLessThanOrEqual(F.communalRadius);
    expect(fire!.ownerId).toBeNull();
  });

  it('a torch is taken up at night, widens vision and burns down hourly', () => {
    const w = makeWorld();
    at(w, 2 * DAY + Math.round(0.85 * DAY));
    const g = spawnGoblin(w, { pos: { x: 20, y: 20 } });
    g.equipped.hand = { type: 'spear', qty: 1 };
    addItem(g, { type: 'torch', qty: 1 });
    expect(equipCandidate(g, w)?.type).toBe('torch');
    const plain = visionRadius(g, w);
    startAction(g, w, 'equip');
    for (let t = 0; t < 20 && g.activity.status === 'running'; t++) { act(w); w.s.tick++; }
    expect(g.equipped.hand?.type).toBe('torch');
    expect(visionRadius(g, w) / plain).toBeCloseTo(F.torchVision);
    const torch = g.equipped.hand!;
    w.s.tick = Math.ceil(w.s.tick / CFG.god.hourTicks) * CFG.god.hourTicks - 1;
    w.step();
    expect(usesLeft(torch)).toBe(7);
    at(w, 3 * DAY + Math.round(0.3 * DAY));
    expect(equipCandidate(g, w)?.type).toBe('spear');
  });
});
