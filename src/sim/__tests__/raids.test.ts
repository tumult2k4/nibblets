import { describe, expect, it } from 'vitest';
import { CFG } from '../config';
import { clockAt } from '../time';
import { setWeather } from '../weather';
import { deserialize, serialize, stateHash } from '../save';
import { World } from '../world';
import { deposit, stockCount } from '../stockpile';
import { relate } from '../goblin/social';
import { killEnemy } from '../combat';
import { updateClans, type RivalClan } from '../clans';
import { raiderDecide, sendRaiders, wantsRaid } from '../enemies/raider';
import { giftClan, giftFood } from '../ai/actions/envoy';
import { defectChance, maybeDefect } from '../migration';
import { makeWorld, spawnGoblin } from './helpers';
import type { Goblin } from '../state';
import type { SimEvent } from '../../shared/types';

const R = CFG.raids, DAY = CFG.time.dayTicks, HOUR = DAY / 24;

/** A quiet world on day `day` at `hour` (on a clan update), every clan met, no visits due. */
function world(day = 8, hour = 18): { w: World; c: RivalClan } {
  const w = makeWorld({ size: 30 });
  w.s.tick = day * DAY + (hour - 6) * HOUR;
  w.clock = clockAt(w.s.tick);
  setWeather(w, 'clear');
  w.s.weather.nextChangeTick = w.s.tick + 100 * DAY;
  w.s.threat.night = 1e9; // no Gnashers tonight
  for (const c of w.s.rivals) { c.contact = w.s.tick - DAY; c.contactAt = 0; c.nextTrader = 1e12; c.relation = 10; }
  return { w, c: w.s.rivals[0]! };
}
const angry = (c: RivalClan): void => { c.relation = -60; c.store = 0; c.aggression = 0.9; };
function run(w: World, n: number, until?: () => boolean): SimEvent[] {
  const all: SimEvent[] = [];
  for (let i = 0; i < n; i++) {
    all.push(...w.step());
    if (until?.()) break;
  }
  return all;
}
const armed = (g: Goblin): Goblin => { g.equipped.hand = { type: 'spear', qty: 1 }; return g; };

describe('raids, gifts and defectors (§16, P10.3)', () => {
  it('a hostile, hungry, fierce clan sends three to six raiders at dusk, and rests a few days after', () => {
    const { w, c } = world();
    angry(c);
    expect(wantsRaid(w, c)).toBe(true);
    const rel = c.relation;
    updateClans(w);
    const evs = w.bus.flush(), raiders = w.s.enemies.filter((e) => e.kind === 'raider');
    expect(raiders.length).toBeGreaterThanOrEqual(R.size[0]);
    expect(raiders.length).toBeLessThanOrEqual(R.size[1]);
    expect(raiders.every((e) => e.clanId === c.id && !!e.genome)).toBe(true);
    expect(evs.some((e) => e.type === 'clan_raid' && e.clanA === c.id && e.clanB === w.s.clans[0]!.id)).toBe(true);
    expect(c.relation).toBeLessThan(rel);
    w.s.enemies = [];
    w.s.tick += DAY;
    expect(wantsRaid(w, c)).toBe(false); // resting
    w.s.tick += R.restDays * DAY;
    expect(wantsRaid(w, c)).toBe(true);
    c.relation = -10;
    expect(wantsRaid(w, c)).toBe(false); // not angry enough
    c.relation = -60; c.store = c.pop * 10;
    expect(wantsRaid(w, c)).toBe(false); // not hungry
  });

  it('raiders run for the store, take food and carry it home to their clan', () => {
    const { w, c } = world();
    angry(c);
    deposit(w.s, { type: 'apple', qty: 30 });
    const raiders = sendRaiders(w, c), before = c.store;
    run(w, 4 * HOUR, () => !w.s.enemies.some((e) => e.kind === 'raider'));
    expect(w.s.enemies.filter((e) => e.kind === 'raider')).toHaveLength(0);
    expect(stockCount(w.s, 'apple')).toBeLessThanOrEqual(30 - raiders.length * R.stealQty + R.stealQty);
    expect(c.store).toBeGreaterThan(before);
  });

  it('a raider turns on whoever strikes it, runs from an armed crowd, and one that falls drops its club', () => {
    const { w, c } = world();
    angry(c);
    const [e] = sendRaiders(w, c);
    const g = armed(spawnGoblin(w, { pos: { x: 15, y: 15 } }));
    e!.pos = { x: 16, y: 15 };
    g.activity.action = 'defend_village'; g.activity.targetId = e!.id; g.activity.status = 'running';
    w.rebuildCaches();
    e!.mode = 'prowl';
    raiderDecide(w, e!);
    expect(e!.mode).toBe('attack');
    expect(e!.targetId).toBe(g.id);
    for (const x of [15, 17]) armed(spawnGoblin(w, { pos: { x, y: 16 } }));
    w.rebuildCaches();
    e!.mode = 'prowl';
    raiderDecide(w, e!);
    expect(e!.mode).toBe('flee');
    const pop = c.pop, rel = c.relation;
    killEnemy(w, e!, g);
    expect(w.s.groundItems.some((it) => it.stack.type === 'club')).toBe(true);
    expect(c.pop).toBe(Math.max(CFG.clans.popMin, pop - 1));
    expect(c.relation).toBeCloseTo(rel + R.slain, 3);
    expect(c.news.some((n) => n.kind === 'slain')).toBe(true);
  });

  it("the chief takes food the village can spare to the coldest clan, and it warms to the village", () => {
    const { w, c } = world(8, 10);
    for (const o of w.s.rivals) o.relation = 40;
    c.relation = -50;
    c.store = 0;
    deposit(w.s, { type: 'dried_apple', qty: 60 });
    const chief = spawnGoblin(w, { pos: { x: 15, y: 15 } });
    chief.role = 'chief'; w.s.village.chiefId = chief.id;
    expect(giftClan(w)).toBe(c);
    const evs = run(w, 6 * HOUR, () => c.lastGift !== undefined);
    expect(evs.some((e) => e.type === 'clan_gift' && e.goblinId === chief.id && e.clanId === c.id)).toBe(true);
    expect(c.relation).toBeGreaterThanOrEqual(-50 + R.gift.min - 0.5);
    expect(c.store).toBeGreaterThan(0);
    expect(stockCount(w.s, 'dried_apple')).toBeLessThan(60);
    expect(giftClan(w)).toBeNull(); // one gift every few days
  });

  it('with no food to spare the chief gives goods instead; a clan warming toward an alliance gets one to seal it', () => {
    const { w, c } = world(8, 10);
    for (const o of w.s.rivals) o.relation = 35; // between the bands: no gift
    expect(giftClan(w)).toBeNull();
    c.relation = R.gift.seal + 5;
    deposit(w.s, { type: 'pelt', qty: 20 });
    const chief = spawnGoblin(w, { pos: { x: 15, y: 15 } });
    chief.role = 'chief'; w.s.village.chiefId = chief.id;
    expect(giftClan(w)).toBe(c);
    expect(giftFood(w, c)?.type).toBe('pelt');
    const rel = c.relation;
    const evs = run(w, 6 * HOUR, () => c.lastGift !== undefined);
    expect(evs.some((e) => e.type === 'clan_gift' && e.clanId === c.id && e.gave.type === 'pelt')).toBe(true);
    expect(c.relation).toBeGreaterThan(rel);
    expect(stockCount(w.s, 'pelt')).toBeGreaterThanOrEqual(CFG.visitors.keep); // never below what the store keeps
  });

  it('an exile may go over to the friendliest clan: it walks off the map and its genes join that clan', () => {
    const { w, c } = world(8, 10);
    for (const o of w.s.rivals) o.relation = -20;
    c.relation = 50;
    const restless = spawnGoblin(w, { pos: { x: 15, y: 15 } });
    restless.personality.wanderlust = 1; restless.mood.value = -40;
    const calm = spawnGoblin(w, { pos: { x: 15, y: 16 } });
    calm.personality.wanderlust = 0; calm.mood.value = 40;
    expect(defectChance(w, restless)).toBeGreaterThan(defectChance(w, calm));
    let n = 0;
    for (let i = 0; i < 40; i++) { if (maybeDefect(w, restless)) n++; if (w.s.leaving) delete w.s.leaving[restless.id]; }
    expect(n).toBeGreaterThan(20);
    // one goes: its friend misses it, its genes go to the clan
    const g = spawnGoblin(w, { pos: { x: 15, y: 14 } }), pal = spawnGoblin(w, { pos: { x: 16, y: 14 } });
    const r = relate(pal, g.id); r.bond = 'friend'; r.opinion = 50;
    w.s.goblins = w.s.goblins.filter((x) => x === g || x === pal);
    w.rebuildCaches();
    (w.s.leaving ??= {})[g.id] = c.id;
    g.exiledUntil = w.s.tick + DAY;
    const pop = c.pop, evs = run(w, 4 * HOUR, () => !w.goblin(g.id));
    expect(w.goblin(g.id)).toBeUndefined();
    expect(evs.some((e) => e.type === 'goblin_left' && e.goblinId === g.id && e.clanId === c.id && e.why === 'defected')).toBe(true);
    expect(c.pop).toBe(pop + 1);
    expect(c.pool).toContain(g.genome);
    expect(w.s.lineage[g.id]?.leftTo ?? c.id).toBe(c.id);
    expect(pal.mood.modifiers.some((m) => m.id === 'kin_left')).toBe(true);
  });

  it('raids are deterministic and survive a save mid-raid', () => {
    const make = (): World => {
      const { w, c } = world();
      angry(c);
      for (let i = 0; i < 4; i++) armed(spawnGoblin(w, { pos: { x: 13 + i, y: 15 } }));
      deposit(w.s, { type: 'apple', qty: 40 });
      sendRaiders(w, c);
      return w;
    };
    const a = make(), b = make();
    run(a, 300); run(b, 300);
    expect(stateHash(a.s)).toBe(stateHash(b.s));
    const c = new World(deserialize(serialize(a.s)));
    run(a, 900); run(c, 900);
    expect(stateHash(c.s)).toBe(stateHash(a.s));
  });
});
