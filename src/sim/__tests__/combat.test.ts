import { describe, expect, it } from 'vitest';
import { CFG } from '../config';
import { clockAt } from '../time';
import { setWeather } from '../weather';
import { completeBuilding, placeBlueprint } from '../buildings';
import { addItem } from '../inventory';
import { dist } from '../../shared/math';
import { express } from '../goblin/genetics/phenotype';
import { goblinSpeed } from '../goblin/goblin';
import { hitChance, hurtGoblin, strikeDamage, updateInjuries } from '../combat';
import { updateSafety } from '../goblin/safety';
import { spawnEnemy } from '../enemies/director';
import { panics, visibleThreat } from '../ai/actions/fight';
import { claim } from '../ai/actions/home';
import { shelterOf } from '../temperature';
import { ACTIONS, act, startAction } from '../ai/utility';
import { deserialize, serialize } from '../save';
import { makeWorld, spawnGoblin } from './helpers';
import type { World } from '../world';
import type { Goblin } from '../state';
import type { SimEvent } from '../../shared/types';

const DAY = CFG.time.dayTicks;
const C = CFG.combat;

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
const fed = (w: World) => { for (const g of w.s.goblins) { g.needs.hunger = 90; g.needs.thirst = 90; g.needs.energy = 90; } };
function armed(g: Goblin, brave = 1): Goblin {
  g.equipped.hand = { type: 'spear', qty: 1 };
  g.personality.bravery = brave;
  return g;
}

describe('goblin combat, morale and injuries (P4.5)', () => {
  it('an armed brave goblin goes for a Gnasher and drives it off', () => {
    const w = makeWorld();
    at(w, 5, 0.75);
    const g = armed(spawnGoblin(w, { pos: { x: 12, y: 12 } }));
    const e = spawnEnemy(w, 'gnasher', { x: 15.5, y: 12 });
    const evs = events(w);
    let fought = false;
    for (let t = 0; t < 900 && w.s.enemies.includes(e) && e.mode !== 'flee'; t++) {
      w.step(); fed(w);
      fought ||= g.activity.action === 'attack';
    }
    expect(fought).toBe(true);
    const hits = evs.filter((x) => x.type === 'attack' && x.attackerId === g.id && x.damage > 0);
    expect(hits.length).toBeGreaterThan(0);
    expect(!w.s.enemies.includes(e) || e.mode === 'flee').toBe(true);
    expect(e.hp).toBeLessThan(e.maxHp);
    expect(g.skills.combat).toBeGreaterThan(0);
  });

  it('an unarmed timid goblin runs for its hut instead', () => {
    const w = makeWorld();
    at(w, 5, 0.75);
    const g = spawnGoblin(w, { pos: { x: 10, y: 10 } });
    g.personality.bravery = 0;
    const hut = placeBlueprint(w, 'hut', { x: 17, y: 17 }, g.id);
    completeBuilding(w, hut, g.id);
    claim(w, g, hut);
    g.pos = { x: 10, y: 10 };
    spawnEnemy(w, 'gnasher', { x: 7, y: 8 });
    const evs = events(w);
    let fled = false;
    for (let t = 0; t < 400 && !(fled && shelterOf(w, g)); t++) { w.step(); fed(w); fled ||= g.activity.action === 'flee'; }
    expect(fled).toBe(true);
    expect(shelterOf(w, g)?.id).toBe(hut.id);
    expect(evs.some((x) => x.type === 'attack' && x.attackerId === g.id)).toBe(false);
  });

  it('danger in sight cuts even work that is not normally interruptible', () => {
    const w = makeWorld();
    at(w, 5, 0.75);
    const g = spawnGoblin(w, { pos: { x: 12, y: 12 } });
    g.personality.bravery = 0;
    addItem(g, { type: 'wood', qty: 2 });
    expect(startAction(g, w, 'craft')).toBe(true);
    g.activity.stage = 1; // hands busy
    spawnEnemy(w, 'gnasher', { x: 16, y: 12 });
    for (let t = 0; t < 30 && g.activity.action === 'craft'; t++) w.step();
    expect(['flee', 'attack']).toContain(g.activity.action);
  });

  it('blows scale with weapon, size and skill; hits land 60–90 %', () => {
    const w = makeWorld();
    const g = spawnGoblin(w);
    const size = express(g.genome, 'adultSize');
    expect(strikeDamage(g)).toBeCloseTo(C.fists * (0.8 + 0.4 * size), 3);
    armed(g);
    expect(strikeDamage(g)).toBeCloseTo(C.spear * (0.8 + 0.4 * size), 3);
    g.skills.combat = 2;
    expect(strikeDamage(g)).toBeCloseTo(C.spear * (0.8 + 0.4 * size) * (1 + 2 * C.dmgPerSkill), 3);
    expect(hitChance(g)).toBeCloseTo(C.hitBase + 2 * C.hitPerSkill);
    g.skills.combat = 0;
    expect(hitChance(g)).toBe(C.hitBase);
    g.skills.combat = 50;
    expect(hitChance(g)).toBe(C.hitMax);
  });

  it('a blow below half health wounds about a quarter of the time; limps slow and heal', () => {
    const w = makeWorld();
    const g = spawnGoblin(w);
    let wounded = 0;
    for (let i = 0; i < 400; i++) {
      g.health.hp = 40; g.health.injuries = []; g.health.scars = 0;
      hurtGoblin(w, g, 0.01, 'combat');
      if (g.health.injuries.length || g.health.scars) wounded++;
    }
    expect(wounded / 400).toBeGreaterThan(0.18);
    expect(wounded / 400).toBeLessThan(0.32);
    g.health.hp = 90; g.health.injuries = []; // above half: never
    for (let i = 0; i < 100; i++) hurtGoblin(w, g, 0.01, 'combat');
    expect(g.health.injuries).toHaveLength(0);
    const fast = goblinSpeed(g);
    g.health.injuries = [{ kind: 'limp', until: w.s.tick + C.injuryDays * DAY }];
    expect(goblinSpeed(g) / fast).toBeCloseTo(C.limpMul);
    w.s.tick += C.injuryDays * DAY;
    updateInjuries(w);
    expect(g.health.injuries).toHaveLength(0);
  });

  it('death drops everything carried, leaves a grave, and shakes those who saw it', () => {
    const w = makeWorld();
    at(w, 5, 0.3);
    const g = armed(spawnGoblin(w, { pos: { x: 12, y: 12 } }));
    addItem(g, { type: 'wood', qty: 2 });
    const witness = spawnGoblin(w, { pos: { x: 14, y: 12 } });
    witness.needs.safety = 90;
    hurtGoblin(w, g, 999, 'combat');
    expect(w.s.goblins).not.toContain(g);
    expect(w.s.groundItems.map((i) => i.stack.type).sort()).toEqual(['spear', 'wood']);
    expect(w.s.graves.at(-1)).toMatchObject({ goblinId: g.id, cause: 'combat' });
    expect(witness.needs.safety).toBeLessThan(90 - CFG.safety.witnessDeath * 0.6);
  });

  it('safety sinks with a Gnasher in sight and comes back by the fire', () => {
    const w = makeWorld();
    at(w, 5, 0.8);
    const g = spawnGoblin(w, { pos: { x: 12, y: 12 } });
    g.needs.safety = 80;
    const e = spawnEnemy(w, 'gnasher', { x: 15, y: 12 });
    for (let t = 0; t < 200; t++) { w.s.tick++; updateSafety(w); }
    expect(g.needs.safety).toBeLessThan(25);
    w.s.enemies = w.s.enemies.filter((x) => x !== e);
    const fire = placeBlueprint(w, 'campfire', { x: 13, y: 12 }, null);
    completeBuilding(w, fire, null);
    for (let t = 0; t < 1500; t++) { w.s.tick++; updateSafety(w); }
    expect(g.needs.safety).toBeGreaterThan(65);
  });

  it('veterans never panic, and a parent stands by a child under attack', () => {
    const w = makeWorld();
    at(w, 5, 0.8);
    const g = spawnGoblin(w, { pos: { x: 12, y: 12 } });
    g.personality.bravery = 0.2;
    g.needs.safety = 5;
    expect(panics(g, w)).toBe(true);
    g.traits.push('veteran');
    expect(panics(g, w)).toBe(false);
    g.traits = [];
    const kid = spawnGoblin(w, { pos: { x: 14, y: 12 }, ageDays: 3 });
    kid.parents = [g.id, 999];
    const e = spawnEnemy(w, 'gnasher', { x: 15, y: 12 });
    e.mode = 'attack'; e.targetId = kid.id;
    expect(visibleThreat(g, w)).toBe(e);
    expect(panics(g, w)).toBe(false);
    expect(startAction(g, w, 'attack')).toBe(true);
    expect(g.activity.targetId).toBe(e.id);
  });

  it('armed adults keep watch by the fire at night', () => {
    const w = makeWorld();
    at(w, 5, 0.8);
    const fire = placeBlueprint(w, 'campfire', { x: 12, y: 12 }, null);
    completeBuilding(w, fire, null);
    const g = armed(spawnGoblin(w, { pos: { x: 6, y: 18 } }));
    g.personality.industry = 1;
    expect(startAction(g, w, 'guard')).toBe(true);
    for (let t = 0; t < 300 && g.activity.stage === 0; t++) { act(w); w.s.tick++; }
    expect(g.activity.stage).toBe(1);
    expect(dist(g.pos, fire.pos)).toBeCloseTo(C.guardRadius, 0);
    const other = armed(spawnGoblin(w, { pos: { x: 6, y: 6 } }));
    expect(ACTIONS.guard.isAvailable(other, w)).toBe(false); // one post per five adults
  });

  it('a Gnasher seen inside the village draws the armed adults, and their numbers send it off', () => {
    const w = makeWorld();
    at(w, 5, 0.75);
    const gs = [armed(spawnGoblin(w, { pos: { x: 8, y: 8 } }), 0.7), armed(spawnGoblin(w, { pos: { x: 8, y: 16 } }), 0.7), armed(spawnGoblin(w, { pos: { x: 16, y: 8 } }), 0.7)];
    const e = spawnEnemy(w, 'gnasher', { x: 13, y: 14 });
    e.seen = true;
    const roles = new Set<string>();
    for (let t = 0; t < 600 && w.s.enemies.includes(e) && e.mode !== 'flee'; t++) {
      w.step(); fed(w);
      for (const g of gs) roles.add(g.activity.action);
    }
    expect(roles.has('defend_village') || roles.has('attack')).toBe(true);
    expect(!w.s.enemies.includes(e) || e.mode === 'flee').toBe(true);
  });

  it('v5 saves turn the injury count into a list and start counting fights', () => {
    const w = makeWorld();
    spawnGoblin(w);
    const raw = JSON.parse(serialize(w.s)) as { version: number; goblins: { health: Record<string, unknown>; deeds: Record<string, unknown> }[] };
    raw.version = 5;
    raw.goblins[0]!.health.injuries = 0;
    delete raw.goblins[0]!.deeds.fights;
    const s = deserialize(JSON.stringify(raw));
    expect(s.goblins[0]!.health.injuries).toEqual([]);
    expect(s.goblins[0]!.deeds.fights).toBe(0);
  });
});
