import { describe, expect, it } from 'vitest';
import { makeWorld } from './helpers';
import { CFG } from '../config';
import { createWorldState } from '../newWorld';
import { World } from '../world';
import { deserialize, serialize, stateHash } from '../save';
import { createRivals, knownRivals, shiftRelation, stanceOf, updateClans, type RivalClan } from '../clans';
import type { SimEvent } from '../../shared/types';

const C = CFG.clans, DAY = CFG.time.dayTicks, SEASON = DAY * CFG.time.daysPerSeason;

function events(w: World): SimEvent[] {
  const evs: SimEvent[] = [];
  w.bus.subscribe((e) => evs.push(e));
  return evs;
}
function withCfg<T>(o: object, vals: Record<string, number>, f: () => T): T {
  const k = o as Record<string, number>;
  const old = Object.fromEntries(Object.keys(vals).map((x) => [x, k[x]!]));
  Object.assign(k, vals);
  try { return f(); } finally { Object.assign(k, old); }
}
/** Live the clans' lives from `from` to `to` (ticks), an update at a time, without the rest of the world. */
function live(w: World, from: number, to: number): void {
  for (let t = Math.ceil(from / C.every) * C.every; t < to; t += C.every) {
    w.s.tick = t;
    updateClans(w);
    w.bus.flush();
  }
}

describe('rival clans beyond the map (§16, P10.1)', () => {
  it('a new world has two or three clans of other stocks, from other sides, met a few days apart', () => {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const s = createWorldState({ seed, size: 48, founders: 6, wildlife: false, archetype: 'moss' });
      expect(s.rivals.length).toBeGreaterThanOrEqual(C.count[0]);
      expect(s.rivals.length).toBeLessThanOrEqual(C.count[1]);
      const stocks = s.rivals.map((c) => c.archetype), sides = s.rivals.map((c) => c.side);
      expect(stocks).not.toContain('moss');
      expect(new Set(stocks).size).toBe(stocks.length);
      expect(new Set(sides).size).toBe(sides.length);
      const at = s.rivals.map((c) => c.contactAt - s.tick);
      expect(at[0]).toBeGreaterThanOrEqual(C.firstContact[0] * DAY);
      expect(at[0]).toBeLessThanOrEqual(C.firstContact[1] * DAY);
      for (let i = 1; i < at.length; i++) expect(at[i]! - at[i - 1]!).toBeGreaterThanOrEqual(C.nextContact[0] * DAY);
      for (const c of s.rivals) {
        expect(c.pool).toHaveLength(C.pool);
        expect(c.contact).toBeNull();
        expect(s.goblins.map((g) => g.name)).not.toContain(c.name);
        expect(c.pop).toBeGreaterThanOrEqual(C.pop[0]);
      }
      // their own stream: the same seed makes the same clans, and the world's own randomness is untouched
      const again = createWorldState({ seed, size: 48, founders: 6, wildlife: false, archetype: 'moss' });
      expect(stateHash(again)).toBe(stateHash(s));
    }
  });

  it('through a year a clan eats in winter and grows in the good seasons; hunger makes it fierce; its feeling drifts home', () => {
    const w = makeWorld({ size: 30 }), c = w.s.rivals[0]!;
    w.s.rivals = [c]; // alone: nobody to raid
    c.store = c.pop * 3;
    c.relation = -90;
    const start = w.s.tick, pool = c.pool.map((g) => JSON.stringify(g));
    withCfg(C.luck, { 0: 1, 1: 1 }, () => live(w, start, start + 3 * SEASON)); // spring, summer, autumn of average luck
    expect(c.store / c.pop).toBeGreaterThan(6);
    const before = c.pop;
    withCfg(C, { birthPerDay: 1, deathPerDay: 0 }, () => live(w, start + 3 * SEASON - DAY, start + 3 * SEASON));
    expect(c.pop).toBeGreaterThan(before);
    expect(c.pool.map((g) => JSON.stringify(g))).not.toEqual(pool); // births bred the pool
    const fed = c.pop;
    expect(c.relation).toBeGreaterThan(-75); // a slow drift (P10.4: alliances last)
    c.store = c.pop * 1; // a lean winter ahead
    live(w, start + 3 * SEASON, start + 4 * SEASON);
    expect(c.store).toBeLessThan(c.pop * 0.5); // eaten up (spring has just begun)
    expect(c.aggression).toBeGreaterThan(0.6);
    expect(c.pop).toBeLessThanOrEqual(fed);
    expect(c.pop).toBeGreaterThanOrEqual(C.popMin);
  });

  it('first contact comes on its day, once per clan', () => {
    const w = makeWorld({ size: 30 }), evs = events(w), [a, b] = w.s.rivals as [RivalClan, RivalClan];
    live(w, w.s.tick, a.contactAt - 1);
    expect(knownRivals(w.s)).toHaveLength(0);
    live(w, a.contactAt - 1, b.contactAt + C.every);
    expect(knownRivals(w.s).map((c) => c.id)).toEqual([a.id, b.id]);
    expect(evs.filter((e) => e.type === 'clan_contact').map((e) => e.type === 'clan_contact' && e.clanA)).toEqual([a.id, b.id]);
    expect(a.news[0]).toMatchObject({ kind: 'contact' });
  });

  it('relations move with deeds: an alliance from 70, broken under 50; the stance in a word', () => {
    const w = makeWorld({ size: 30 }), evs = events(w), c = w.s.rivals[0]!;
    c.relation = 0;
    expect(stanceOf(c)).toBe('neutral');
    shiftRelation(w, c, 75, 'gift');
    expect(c.allied).toBe(false); // not before they have met
    c.contact = w.s.tick;
    shiftRelation(w, c, 0, 'gift');
    expect(c.allied).toBe(true);
    expect(stanceOf(c)).toBe('allied');
    shiftRelation(w, c, -30, 'raid');
    expect(c.allied).toBe(false);
    w.bus.flush();
    expect(evs.filter((e) => e.type === 'clan_alliance').map((e) => e.type === 'clan_alliance' && !!e.ended)).toEqual([false, true]);
    shiftRelation(w, c, -200, 'raid');
    expect(c.relation).toBe(-100);
    expect(stanceOf(c)).toBe('hostile');
    expect(c.news.map((n) => n.kind)).toEqual(['gift', 'allied', 'raid', 'ally_lost', 'raid']); // the two gifts of a day make one line
  });

  it('a hungry, fierce clan raids another for food', () => {
    const w = makeWorld({ size: 30 }), evs = events(w), [a, b] = w.s.rivals as [RivalClan, RivalClan];
    w.s.rivals = [a, b];
    a.store = 0;
    a.aggression = 1;
    b.store = 100;
    withCfg(C.rivalRaid, { chance: 1 }, () => live(w, w.s.tick, w.s.tick + C.every));
    expect(b.store).toBeLessThan(100);
    expect(a.store).toBeGreaterThan(0);
    expect(evs.find((e) => e.type === 'clan_raid')).toMatchObject({ clanA: a.id, clanB: b.id });
    expect(b.news.at(-1)).toMatchObject({ kind: 'was_raided', other: a.id });
  });

  it('an old save gets its clans when loaded, and runs on the same from there', () => {
    const w = makeWorld({ size: 30 });
    const raw = JSON.parse(serialize(w.s)) as Record<string, unknown>;
    delete raw.rivals;
    raw.version = 20;
    const next = raw.nextId as number, s = deserialize(JSON.stringify(raw));
    expect(s.version).toBe(CFG.saveVersion);
    expect(s.rivals.map((c) => c.id)).toEqual(s.rivals.map((_, i) => next + i));
    expect(s.nextId).toBe(next + s.rivals.length);
    const x = new World(deserialize(serialize(s))), y = new World(deserialize(serialize(s)));
    for (let i = 0; i < 1300; i++) { x.step(); y.step(); }
    expect(stateHash(x.s)).toBe(stateHash(y.s));
    expect(createRivals(s).map((c) => c.name)).toEqual(s.rivals.map((c) => c.name));
  });
});
