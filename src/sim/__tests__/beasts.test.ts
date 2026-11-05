import { describe, expect, it } from 'vitest';
import { CFG } from '../config';
import { clockAt } from '../time';
import { setWeather } from '../weather';
import { completeBuilding, placeBlueprint } from '../buildings';
import { dist } from '../../shared/math';
import { killEnemy, strike, threatsNear } from '../combat';
import { canTakeOn, visibleThreat } from '../ai/actions/fight';
import { spawnBramblebeast } from '../enemies/bramblebeast';
import { spawnWisp } from '../enemies/wisp';
import { serialize, deserialize } from '../save';
import { makeWorld, spawnGoblin } from './helpers';
import type { World } from '../world';
import type { Goblin } from '../state';
import type { SimEvent } from '../../shared/types';

const DAY = CFG.time.dayTicks;
const B = CFG.enemies.bramblebeast;

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
const fed = (w: World) => { for (const g of w.s.goblins) { g.needs.hunger = 90; g.needs.thirst = 90; g.needs.energy = 90; g.needs.safety = 80; } };
const spearman = (w: World, x: number, y: number, weapon: 'stone_spear' | 'spear' = 'stone_spear'): Goblin => {
  const g = spawnGoblin(w, { pos: { x, y } });
  g.equipped.hand = { type: weapon, qty: 1 };
  return g;
};

describe('Bramblebeast, Night Wisp and newcomers (P4.7)', () => {
  it('a Bramblebeast tramples through a fence line and a hut in its way, then leaves by the far side', () => {
    const w = makeWorld({ pond: false });
    at(w, 5, 0.3);
    for (let y = 0; y < 24; y++) completeBuilding(w, placeBlueprint(w, 'fence', { x: 6.5, y: y + 0.5 }, null), null);
    const hut = placeBlueprint(w, 'hut', { x: 16, y: 12 }, null);
    completeBuilding(w, hut, null);
    const evs = events(w);
    const e = spawnBramblebeast(w, { x: 1.5, y: 12 });
    expect(e.home.x).toBeGreaterThan(18);
    e.path = [{ x: 12, y: 12 }, { ...e.home }]; // straight along y = 12
    for (let t = 0; t < 1500 && w.s.enemies.includes(e); t++) w.step();
    expect(w.s.enemies.includes(e)).toBe(false);
    const smashed = evs.filter((x) => x.type === 'building_destroyed' && x.cause === 'bramblebeast');
    expect(smashed.some((x) => x.type === 'building_destroyed' && x.kind === 'fence')).toBe(true);
    expect(w.s.buildings.includes(hut)).toBe(false);
    expect(w.s.buildings.filter((b) => b.type === 'fence').length).toBeGreaterThanOrEqual(22); // only what was in the way
  });

  it('it ignores goblins until struck, then swipes back; lone or lightly armed goblins will not take it on', () => {
    const w = makeWorld({ pond: false });
    at(w, 5, 0.3);
    const g = spearman(w, 12, 14.2, 'spear');
    g.personality.bravery = 1;
    const e = spawnBramblebeast(w, { x: 3, y: 12 });
    e.path = [{ x: 21, y: 12 }];
    e.home = { x: 21, y: 12 };
    const evs = events(w);
    for (let t = 0; t < 70; t++) { w.step(); fed(w); }
    expect(dist(e.pos, g.pos)).toBeLessThan(B.scareRadius);
    expect(evs.some((x) => x.type === 'enemy_bit')).toBe(false);
    expect(canTakeOn(g, w, e)).toBe(false);
    expect(['attack', 'defend_village']).not.toContain(g.activity.action);
    // three with stone spears are a mob it is worth facing; spears are not enough
    const lone = spearman(w, e.pos.x, e.pos.y + 2);
    expect(canTakeOn(lone, w, e)).toBe(false);
    const mob = [lone, spearman(w, e.pos.x + 1, e.pos.y + 2), spearman(w, e.pos.x - 1, e.pos.y + 2)];
    expect(canTakeOn(mob[0]!, w, e)).toBe(true);
    expect(canTakeOn(g, w, e)).toBe(false);
    // struck: it turns on the one who hit it
    for (const o of mob) w.s.goblins.splice(w.s.goblins.indexOf(o), 1);
    w.rebuildCaches();
    e.pos = { x: g.pos.x, y: g.pos.y - 1 };
    while (!strike(w, g, e));
    expect(e.mode).toBe('attack');
    expect(e.targetId).toBe(g.id);
    g.activity.action = 'idle';
    for (let t = 0; t < 40; t++) { w.step(); g.pos = { x: e.pos.x, y: e.pos.y + 1 }; }
    expect(evs.some((x) => x.type === 'enemy_bit' && x.goblinId === g.id)).toBe(true);
  });

  it('a mob with stone spears drives one off, and a dead one leaves pelts, bones and bramble wood', () => {
    const w = makeWorld({ pond: false });
    at(w, 5, 0.3);
    const e = spawnBramblebeast(w, { x: 3, y: 12 });
    e.path = [{ x: 21, y: 12 }];
    const mob = [spearman(w, 9, 13.5), spearman(w, 10, 13.5), spearman(w, 9.5, 14.2)];
    for (const g of mob) g.personality.bravery = 0.8;
    const evs = events(w);
    for (let t = 0; t < 400 && !evs.some((x) => x.type === 'enemy_fled' || x.type === 'enemy_killed'); t++) { w.step(); fed(w); }
    expect(evs.some((x) => x.type === 'enemy_fled' || x.type === 'enemy_killed')).toBe(true);
    expect(e.hp).toBeLessThan(B.fleeAt * e.maxHp);
    expect(mob.filter((g) => g.deeds.fights > 0 || g.activity.action === 'attack' || g.activity.action === 'defend_village').length).toBeGreaterThanOrEqual(2);
    const b2 = spawnBramblebeast(w, { x: 20, y: 20 });
    killEnemy(w, b2, mob[0]!);
    const loot = (t: string) => w.s.groundItems.filter((it) => it.stack.type === t && dist(it.pos, b2.pos) < 1).reduce((n, it) => n + it.stack.qty, 0);
    expect([loot('pelt'), loot('bone'), loot('wood')]).toEqual([2, 2, 3]);
  });

  it('full-moon nights bring wisps over the marsh; they are no threat and raise no alarm', () => {
    const w = makeWorld({ pond: false, size: 40 });
    for (let y = 26; y < 34; y++) for (let x = 26; x < 34; x++) w.s.tiles[y * 40 + x]!.biome = 'marsh';
    at(w, 4, 0.7);
    w.s.tick -= 1;
    w.clock = clockAt(w.s.tick);
    w.step();
    const wisps = w.s.enemies.filter((e) => e.kind === 'night_wisp');
    expect(wisps.length).toBeGreaterThanOrEqual(1);
    for (const e of wisps) expect(w.s.tiles[Math.floor(e.pos.y) * 40 + Math.floor(e.pos.x)]!.biome).toBe('marsh');
    // no wisps on other nights
    const w2 = makeWorld({ pond: false, size: 40 });
    for (let y = 26; y < 34; y++) for (let x = 26; x < 34; x++) w2.s.tiles[y * 40 + x]!.biome = 'marsh';
    at(w2, 6, 0.7);
    w2.s.tick -= 1;
    w2.step();
    expect(w2.s.enemies).toHaveLength(0);
    const g = spawnGoblin(w, { pos: { x: wisps[0]!.pos.x + 2, y: wisps[0]!.pos.y } });
    g.personality.wanderlust = 0;
    g.personality.piety = 0;
    const alarms = w.s.threat.alarms;
    for (let t = 0; t < 30; t++) { w.step(); fed(w); }
    expect(threatsNear(w, g.pos, 20)).toHaveLength(0);
    expect(visibleThreat(g, w)).toBeNull();
    expect(w.s.threat.alarms).toBe(alarms);
  });

  it('a curious goblin follows a wisp out into the dark and comes to glum when it fades', () => {
    const w = makeWorld({ pond: false, size: 48 });
    at(w, 4, 0.75);
    const c = w.s.village.center;
    const g = spawnGoblin(w, { pos: { x: c.x + 12, y: c.y } });
    g.personality.wanderlust = 1;
    g.personality.piety = 1;
    const e = spawnWisp(w, { x: c.x + 13, y: c.y + 1 });
    const evs = events(w);
    const wakeful = () => { fed(w); g.needs.energy = 100; };
    for (let t = 0; t < 400 && g.activity.action !== 'follow_wisp'; t++) { w.step(); wakeful(); }
    expect(g.activity.action).toBe('follow_wisp');
    expect(evs.some((x) => x.type === 'wisp' && x.phase === 'lure' && x.goblinId === g.id)).toBe(true);
    for (let t = 0; t < 1200 && w.s.enemies.includes(e); t++) { w.step(); wakeful(); }
    expect(w.s.enemies.includes(e)).toBe(false);
    expect(evs.some((x) => x.type === 'wisp' && x.phase === 'faded')).toBe(true);
    expect(dist(g.pos, c)).toBeGreaterThan(16);
    w.step();
    expect(g.activity.action === 'follow_wisp' && g.activity.status === 'running').toBe(false);
    expect(g.mood.modifiers.some((m) => m.id === 'wisp_trance' && m.amount < 0)).toBe(true);
  });

  it('a burning torch scatters a wisp, and nobody falls for one while carrying it', () => {
    const w = makeWorld({ pond: false, size: 40 });
    at(w, 4, 0.75);
    const g = spawnGoblin(w, { pos: { x: 30, y: 20 } });
    g.personality.wanderlust = 1;
    g.personality.piety = 1;
    g.equipped.hand = { type: 'torch', qty: 1 };
    const e = spawnWisp(w, { x: 34, y: 20 });
    e.path = [{ x: 31, y: 20 }];
    const evs = events(w);
    for (let t = 0; t < 120 && w.s.enemies.includes(e); t++) { w.step(); fed(w); }
    expect(w.s.enemies.includes(e)).toBe(false);
    expect(evs.some((x) => x.type === 'wisp' && x.phase === 'dispersed' && x.goblinId === g.id)).toBe(true);
    expect(g.activity.action).not.toBe('follow_wisp');
  });

  it('every 8th morning a small village gets two founder-like newcomers (while the flag is on)', () => {
    const w = makeWorld({ goblins: 3 });
    at(w, 8, 0.3);
    w.s.tick -= 1;
    const evs = events(w);
    w.step();
    expect(w.s.goblins).toHaveLength(5);
    const ev = evs.find((x) => x.type === 'immigrants');
    expect(ev?.type === 'immigrants' && ev.goblinIds.length).toBe(2);
    const fresh = w.s.goblins.slice(3);
    for (const g of fresh) {
      expect(g.lifeStage).toBe('adult');
      expect(g.clanId).toBe(w.s.clans[0]!.id);
      expect(dist(g.pos, w.s.village.center)).toBeGreaterThan(5);
    }
    // not on other days, not for a village of six, not with the flag off
    const w2 = makeWorld({ goblins: 3 });
    at(w2, 9, 0.3);
    w2.s.tick -= 1;
    w2.step();
    expect(w2.s.goblins).toHaveLength(3);
    const w3 = makeWorld({ goblins: 6 });
    at(w3, 16, 0.3);
    w3.s.tick -= 1;
    w3.step();
    expect(w3.s.goblins).toHaveLength(6);
    const cfg = CFG as { spawnReinforcements: boolean };
    cfg.spawnReinforcements = false;
    try {
      const w4 = makeWorld({ goblins: 2 });
      at(w4, 16, 0.3);
      w4.s.tick -= 1;
      w4.step();
      expect(w4.s.goblins).toHaveLength(2);
    } finally {
      cfg.spawnReinforcements = true;
    }
  });

  it('beasts, wisps and lured goblins survive a save round-trip', () => {
    const w = makeWorld({ pond: false, size: 40 });
    at(w, 4, 0.75);
    const g = spawnGoblin(w, { pos: { x: 30, y: 20 } });
    const e = spawnWisp(w, { x: 31, y: 20 });
    e.mode = 'lure';
    e.targetId = g.id;
    g.activity.action = 'follow_wisp';
    g.activity.targetId = e.id;
    spawnBramblebeast(w, { x: 2, y: 2 }).mode = 'smash';
    const s = deserialize(serialize(w.s));
    expect(s.enemies.map((x) => x.mode)).toEqual(['lure', 'smash']);
    expect(s.goblins[0]!.activity.action).toBe('follow_wisp');
  });
});
