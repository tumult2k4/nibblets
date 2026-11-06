import { describe, expect, it } from 'vitest';
import { CFG } from '../config';
import { clockAt } from '../time';
import { setWeather } from '../weather';
import { completeBuilding, placeBlueprint } from '../buildings';
import { dist } from '../../shared/math';
import { spawnEnemy } from '../enemies/director';
import { castPreview } from '../god/cast';
import { spawnGift } from '../god/hand';
import { dangerAt } from '../danger';
import { serialize, deserialize } from '../save';
import { makeWorld, spawnGoblin } from './helpers';
import type { World } from '../world';
import type { SimEvent } from '../../shared/types';

const DAY = CFG.time.dayTicks;
const PW = CFG.powers;

function at(w: World, day: number, frac: number): void {
  const tick = day * DAY + Math.round(frac * DAY);
  w.s.tick = tick;
  w.clock = clockAt(tick);
  setWeather(w, 'clear');
  w.s.weather.nextChangeTick = tick + 100 * DAY;
}
const cast = (w: World, power: string, pos: { x: number; y: number }, extra: { radius?: number; targetId?: number } = {}): SimEvent[] => {
  w.push({ type: 'god_cast', power, pos, ...extra });
  return w.step();
};
const rejected = (evs: SimEvent[]) => evs.find((e) => e.type === 'command_rejected');
const fed = (w: World) => { for (const g of w.s.goblins) { g.needs.hunger = 90; g.needs.thirst = 90; g.needs.energy = 90; } };

describe('wrath powers, Gentle mode, anger and the danger lens (P4.8)', () => {
  it('Gentle mode rejects wrath casts and makes the hand harmless', () => {
    const w = makeWorld({ size: 32 });
    at(w, 5, 0.3);
    const g = spawnGoblin(w, { pos: { x: 16, y: 16 } });
    w.push({ type: 'set_gentle', on: true });
    w.step();
    for (const p of ['lightning', 'swarm', 'meteor', 'summon_gnashers']) expect(rejected(cast(w, p, { x: 16, y: 16 }))).toMatchObject({ reason: 'gentle_mode' });
    expect(rejected(cast(w, 'curse', g.pos, { targetId: g.id }))).toMatchObject({ reason: 'gentle_mode' });
    expect(rejected(cast(w, 'rain', { x: 16, y: 16 }, { radius: 8 }))).toBeUndefined();
    // a hard throw does not hurt
    w.push({ type: 'god_grab', entityId: g.id });
    w.step();
    w.push({ type: 'god_release', pos: g.pos, height: 10, velocity: { x: 12, y: 0, z: 2 } });
    for (let t = 0; t < 60; t++) w.step();
    expect(g.health.hp).toBe(g.health.maxHp);
  });

  it('lightning on a Gnasher hurts it and frightens the goblins who saw it; unseen strikes frighten nobody', () => {
    const w = makeWorld({ size: 48 });
    at(w, 5, 0.3);
    const near = spawnGoblin(w, { pos: { x: 14, y: 20 } });
    const far = spawnGoblin(w, { pos: { x: 45, y: 45 } });
    const e = spawnEnemy(w, 'gnasher', { x: 20, y: 20 });
    e.hp = e.maxHp = 100;
    e.nextDecide = w.s.tick + 1e6;
    const f0 = near.godView.fear, f1 = far.godView.fear;
    const evs = cast(w, 'lightning', { x: 20, y: 20 });
    expect(rejected(evs)).toBeUndefined();
    expect(e.hp).toBe(100 - PW.lightningDmg);
    expect(near.godView.fear).toBeGreaterThanOrEqual(f0 + 15);
    expect(far.godView.fear).toBe(f1);
    const act = evs.find((x) => x.type === 'divine_act' && x.act === 'lightning');
    expect(act?.type === 'divine_act' && act.witnessIds).toContain(near.id);
    expect(act?.type === 'divine_act' && act.witnessIds).not.toContain(far.id);
    // a full-health Gnasher (60 hp) dies to one bolt
    const e2 = spawnEnemy(w, 'gnasher', { x: 30, y: 30 });
    cast(w, 'lightning', { x: 30, y: 30 });
    expect(w.s.enemies.includes(e2)).toBe(false);
  });

  it('a bolt on a goblin hurts it, previews as lethal when it would kill, and turns its family against the god', () => {
    const w = makeWorld({ size: 40 });
    at(w, 5, 0.3);
    const parent = spawnGoblin(w, { pos: { x: 14, y: 20 } });
    const child = spawnGoblin(w, { pos: { x: 20, y: 20 }, ageDays: 10 });
    child.parents = [parent.id, parent.id];
    const love0 = parent.godView.love;
    expect(castPreview(w, 'lightning', { x: 20, y: 20 }).lethal).toEqual([]);
    child.health.hp = 50;
    expect(castPreview(w, 'lightning', { x: 20, y: 20 }).lethal).toEqual([child.id]);
    child.health.hp = 100;
    cast(w, 'lightning', { x: 20, y: 20 });
    expect(child.health.hp).toBeCloseTo(100 - PW.lightningDmg, 0);
    expect(parent.godView.angryAtGod).toBe(true);
    expect(parent.godView.love).toBeLessThanOrEqual(Math.max(0, love0 - 25));
    // onlookers inside the dread zone scatter out of it
    for (let t = 0; t < 120; t++) { w.step(); fed(w); }
    expect(dist(parent.pos, { x: 20, y: 20 })).toBeGreaterThan(PW.dreadRadius);
    // a gift aimed at it calms the anger; otherwise it lasts 8 days
    spawnGift(w, 'apple', 1, parent.pos);
    expect(parent.godView.angryAtGod).toBe(false);
  });

  it('a Swarm drives goblins out of its area for an hour', () => {
    const w = makeWorld({ size: 40 });
    at(w, 5, 0.3);
    const gs = [spawnGoblin(w, { pos: { x: 19, y: 20 } }), spawnGoblin(w, { pos: { x: 21, y: 21 } })];
    cast(w, 'swarm', { x: 20, y: 20 }, { radius: 5 });
    for (let t = 0; t < 50; t++) { w.step(); fed(w); }
    let inside = 0;
    for (let t = 0; t < 90; t++) { w.step(); fed(w); for (const g of gs) if (dist(g.pos, { x: 20, y: 20 }) <= 5) inside++; }
    expect(inside / (90 * gs.length)).toBeLessThan(0.2); // they may wander back in, but are soon chased out again
    for (const g of gs) expect(g.mood.modifiers.some((m) => m.id === 'stung')).toBe(true);
    for (let t = 0; t < PW.swarmHours * CFG.god.hourTicks; t++) w.step();
    expect(w.s.god.zones).toHaveLength(0);
  });

  it('a Curse sours the mood for two days and makes the goblin fumble new tasks', () => {
    const w = makeWorld({ size: 32 });
    at(w, 5, 0.25);
    const g = spawnGoblin(w, { pos: { x: 16, y: 16 } });
    const evs: SimEvent[] = [];
    w.bus.subscribe((x) => evs.push(x));
    cast(w, 'curse', g.pos, { targetId: g.id });
    expect(g.mood.modifiers.find((m) => m.id === 'cursed')?.amount).toBe(PW.curseMood);
    const sweats = () => evs.filter((x) => x.type === 'emote' && x.goblinId === g.id && x.emote === 'sweat').length;
    for (let t = 0; t < DAY && !sweats(); t++) { w.step(); fed(w); } // one new task in four is fumbled
    expect(sweats()).toBeGreaterThan(0);
    expect(rejected(cast(w, 'curse', g.pos, { targetId: 99999 }))).toMatchObject({ reason: 'missing_entity' });
  });

  it('Summon Gnashers works only away from the village and they hunt by day for a while', () => {
    const w = makeWorld({ size: 64 });
    at(w, 5, 0.3);
    expect(rejected(cast(w, 'summon_gnashers', { x: 34, y: 33 }))).toMatchObject({ reason: 'too_close' });
    cast(w, 'summon_gnashers', { x: 54, y: 54 });
    const foes = w.s.enemies.filter((e) => e.summoned);
    expect(foes.length).toBeGreaterThanOrEqual(PW.summonGnashers[0]);
    expect(foes.length).toBeLessThanOrEqual(PW.summonGnashers[1]);
    for (let t = 0; t < 30; t++) w.step();
    for (const e of foes) expect(e.mode).not.toBe('leave');
    cast(w, 'summon_bramblebeast', { x: 8, y: 54 });
    expect(w.s.enemies.some((e) => e.kind === 'bramblebeast' && e.summoned)).toBe(true);
  });

  it('a Meteor lands after its fall: kills at the center, flattens buildings, leaves a crater and rubble', () => {
    const w = makeWorld({ size: 48, pond: false });
    at(w, 5, 0.3);
    const doomed = spawnGoblin(w, { pos: { x: 24.2, y: 24.1 } });
    const hurt = spawnGoblin(w, { pos: { x: 26.5, y: 24 } });
    const safe = spawnGoblin(w, { pos: { x: 40, y: 40 } });
    const hut = placeBlueprint(w, 'hut', { x: 22, y: 27 }, null);
    completeBuilding(w, hut, null);
    const h0 = w.s.tiles[24 * 48 + 24]!.height;
    expect(castPreview(w, 'meteor', { x: 24, y: 24 }).lethal).toContain(doomed.id);
    cast(w, 'meteor', { x: 24, y: 24 });
    expect(w.s.goblins.includes(doomed)).toBe(true); // still falling
    for (let t = 0; t < PW.meteorDelay && w.s.goblins.includes(doomed); t++) { w.step(); doomed.pos = { x: 24.2, y: 24.1 }; hurt.pos = { x: 26.5, y: 24 }; }
    expect(w.s.goblins.includes(doomed)).toBe(false);
    expect(hurt.health.hp).toBeLessThan(hurt.health.maxHp);
    expect(safe.health.hp).toBe(safe.health.maxHp);
    expect(w.s.buildings.includes(hut)).toBe(false);
    expect(w.s.tiles[24 * 48 + 24]!.height).toBeLessThan(h0 - 0.1);
    expect(w.s.groundItems.filter((it) => it.stack.type === 'stone' || it.stack.type === 'flint').length).toBeGreaterThan(2);
    expect(w.s.graves.some((gr) => gr.goblinId === doomed.id && gr.cause === 'divine')).toBe(true);
  });

  it('a stone dropped from the sky kills a Gnasher it lands on', () => {
    const w = makeWorld({ size: 40 });
    at(w, 5, 0.75);
    const e = spawnEnemy(w, 'gnasher', { x: 30, y: 30 });
    e.nextDecide = w.s.tick + 1e6;
    e.mode = 'prowl';
    spawnGift(w, 'stone', 1, { ...e.pos });
    const evs: SimEvent[] = [];
    for (let t = 0; t < 30 && w.s.enemies.includes(e); t++) { evs.push(...w.step()); e.pos = { x: 30, y: 30 }; }
    expect(w.s.enemies.includes(e)).toBe(false);
    expect(evs.some((x) => x.type === 'enemy_killed' && x.killerId === null)).toBe(true);
  });

  it('bites and sightings leave danger marks the lens can read; v7 saves migrate', () => {
    const w = makeWorld({ size: 40 });
    at(w, 5, 0.75);
    const g = spawnGoblin(w, { pos: { x: 8, y: 30 } });
    const e = spawnEnemy(w, 'gnasher', { x: 10, y: 30 });
    e.mode = 'attack';
    e.targetId = g.id;
    for (let t = 0; t < 80; t++) { w.step(); fed(w); }
    expect(w.s.threat.marks.length).toBeGreaterThan(0);
    w.s.enemies = [];
    expect(dangerAt(w, { x: 9, y: 30 })).toBeGreaterThan(dangerAt(w, { x: 30, y: 8 }));
    const raw = JSON.parse(serialize(w.s)) as { version: number; god: Record<string, unknown>; threat: Record<string, unknown>; goblins: { godView: Record<string, unknown> }[] };
    raw.version = 7;
    delete raw.god.zones;
    delete raw.god.pending;
    delete raw.threat.marks;
    for (const x of raw.goblins) delete x.godView.angryUntil;
    const s = deserialize(JSON.stringify(raw));
    expect(s.god.zones).toEqual([]);
    expect(s.god.pending).toEqual([]);
    expect(s.threat.marks).toEqual([]);
    expect(s.goblins[0]!.godView.angryUntil).toBe(0);
  });
});
