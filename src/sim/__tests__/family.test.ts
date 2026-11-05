import { describe, expect, it } from 'vitest';
import { CFG } from '../config';
import { attraction, becomeMates, canLay, hatch, isCloseKin, layEggs, mateOf, registerLineage } from '../goblin/family';
import { ambientWarmth, updateEggs } from '../eggs';
import { Court, IncubateEgg, LayEgg, suitor } from '../ai/actions/courtship';
import { FeedChild, FollowParent } from '../ai/actions/parenting';
import { relate, relationOf } from '../goblin/social';
import { completeBuilding, placeBlueprint } from '../buildings';
import { claim } from '../ai/actions/home';
import { deposit } from '../stockpile';
import { countItem } from '../inventory';
import { clockAt } from '../time';
import { setWeather } from '../weather';
import { deserialize, serialize } from '../save';
import { makeWorld, spawnGoblin } from './helpers';
import type { UtilityAction } from '../ai/action';
import type { Egg, Goblin } from '../state';
import type { World } from '../world';
import type { SimEvent } from '../../shared/types';

const F = CFG.family;
const DAY = CFG.time.dayTicks;

function events(w: World): SimEvent[] {
  const evs: SimEvent[] = [];
  w.bus.subscribe((e) => evs.push(e));
  return evs;
}
/** Spring day `day`, clear and mild (or `kind`). */
function at(w: World, day: number, frac = 0.4, kind: Parameters<typeof setWeather>[1] = 'clear'): void {
  w.s.tick = day * DAY + Math.round(frac * DAY);
  w.clock = clockAt(w.s.tick);
  setWeather(w, kind);
  w.s.weather.nextChangeTick = w.s.tick + 100 * DAY;
}
function run(w: World, g: Goblin, a: UtilityAction, max = 1500): string {
  g.activity = { action: a.id, status: 'running', startedTick: w.s.tick, targetId: null, target: null, path: [], progress: 0, stage: 0 };
  if (!a.start(g, w)) return 'failed';
  for (let i = 0; i < max; i++) {
    const r = a.step(g, w);
    w.bus.flush();
    w.s.tick++;
    if (r !== 'running') return r;
  }
  return 'timeout';
}
/** Two adults, fond of each other, each with a hut. */
function couple(w: World): [Goblin, Goblin] {
  const a = spawnGoblin(w, { pos: { x: 12, y: 12 } }), b = spawnGoblin(w, { pos: { x: 13, y: 12 } });
  for (const g of [a, b]) registerLineage(w.s, g);
  relate(a, b.id).opinion = 80;
  relate(b, a.id).opinion = 80;
  const hut = placeBlueprint(w, 'hut', { x: 16, y: 16 }, null);
  completeBuilding(w, hut, null);
  claim(w, a, hut);
  return [a, b];
}
/** Parent `p`'s child born of `q`, registered in the lineage. */
function child(w: World, p: Goblin, q: Goblin, ageDays = 25): Goblin {
  const c = spawnGoblin(w, { ageDays });
  c.parents = [p.id, q.id];
  registerLineage(w.s, c);
  return c;
}

describe('Kinship and attraction (P5.3)', () => {
  it('parents, children, grandparents, siblings and first cousins are too close; unrelated goblins are not', () => {
    const w = makeWorld();
    const [a, b] = [spawnGoblin(w), spawnGoblin(w)];
    const [x, y] = [spawnGoblin(w), spawnGoblin(w)];
    for (const g of [a, b, x, y]) registerLineage(w.s, g);
    const c1 = child(w, a, b), c2 = child(w, a, b), d = child(w, x, y);
    const g1 = child(w, c1, d), cousinMate = spawnGoblin(w);
    registerLineage(w.s, cousinMate);
    const g2 = child(w, c2, cousinMate);
    expect(isCloseKin(w.s, a.id, c1.id)).toBe(true);
    expect(isCloseKin(w.s, c1.id, c2.id)).toBe(true);
    expect(isCloseKin(w.s, a.id, g1.id)).toBe(true);
    expect(isCloseKin(w.s, g1.id, g2.id)).toBe(true); // first cousins
    expect(isCloseKin(w.s, c1.id, d.id)).toBe(false);
    expect(isCloseKin(w.s, a.id, x.id)).toBe(false);
  });

  it('attraction needs the mate line, a free bed, and no mate yet; spring and matching looks add to it', () => {
    const w = makeWorld();
    at(w, 30, 0.4); // summer
    const [a, b] = couple(w);
    a.personality.wanderlust = 0.2;
    b.genome.skinHue = { ...a.genome.skinHue };
    const summer = attraction(a, b, w);
    expect(summer).toBeCloseTo(0.8 * F.looksMul);
    at(w, 2, 0.4); // spring
    expect(attraction(a, b, w)).toBeCloseTo(summer * F.springMul);
    relate(a, b.id).opinion = 50;
    expect(attraction(a, b, w)).toBe(0);
    relate(a, b.id).opinion = 80;
    b.parents = a.parents = [999, 998];
    registerLineage(w.s, a); registerLineage(w.s, b);
    expect(attraction(a, b, w)).toBe(0); // siblings
  });
});

describe('Courtship, mates and eggs (P5.3)', () => {
  it('three welcome courtships make mates, who then share a home', () => {
    const w = makeWorld();
    at(w, 2);
    const [a, b] = couple(w);
    const evs = events(w);
    expect(suitor(a, w)).toBe(b);
    for (let i = 0; i < 12 && !mateOf(a, w); i++) {
      relate(a, b.id).courtTick = w.s.tick - F.courtCooldown; // skip the wait between tries (same day)
      expect(run(w, a, Court)).toBe('done');
    }
    expect(mateOf(a, w)).toBe(b);
    expect(mateOf(b, w)).toBe(a);
    expect(b.homeId).toBe(a.homeId);
    expect(evs.some((e) => e.type === 'bond_formed' && e.kind === 'mate')).toBe(true);
    expect(evs.filter((e) => e.type === 'courted' && e.success).length).toBe(F.courtSuccesses);
    expect(suitor(a, w)).toBeNull(); // taken
  });

  it('well-fed mates lay an egg at home, with a genome from both; not hungry, not twice in the cooldown', () => {
    const w = makeWorld();
    at(w, 2);
    const [a, b] = couple(w);
    becomeMates(w, a, b);
    a.needs.hunger = b.needs.hunger = 90;
    let day = 2;
    while (!canLay(a, w) && day < 40) at(w, ++day); // today's fertility roll
    expect(canLay(a, w)).toBe(b);
    expect(run(w, a, LayEgg)).toBe('done');
    expect(w.s.eggs.length).toBeGreaterThanOrEqual(1);
    const egg = w.s.eggs[0]!;
    expect(egg.parents).toEqual([a.id, b.id]);
    for (const k of ['skinHue', 'adultSize'] as const) {
      const from = [a.genome[k].a, a.genome[k].b, b.genome[k].a, b.genome[k].b];
      // each allele comes from a parent (or a small mutation of one)
      for (const al of [egg.genome[k].a, egg.genome[k].b]) expect(Math.min(...from.map((v) => Math.abs(v - al)))).toBeLessThan(k === 'skinHue' ? 40 : 0.2);
    }
    expect(canLay(a, w)).toBeNull(); // cooldown
    at(w, day + CFG.social.eggCooldownDays + 1);
    a.needs.hunger = 40;
    expect(canLay(a, w)).toBeNull(); // too hungry
  });

  it('a warm egg hatches after two days into a hatchling with its family; a cold one is lost', () => {
    const w = makeWorld();
    at(w, 2, 0.4);
    const [a, b] = couple(w);
    becomeMates(w, a, b);
    const hut = w.s.buildings[0]!;
    const evs = events(w);
    const [egg] = layEggs(w, a, b, hut.pos);
    const sib = child(w, a, b, 20);
    expect(ambientWarmth(w, egg!)).toBeGreaterThanOrEqual(0.5); // a hut on a spring day is warm enough alone
    a.pos = { ...egg!.pos }; // and at night a parent sleeps beside it
    a.activity = { ...a.activity, action: 'sleep_home', stage: 2 };
    for (let t = 0; t <= F.incubateDays * DAY && w.s.eggs.length; t += 10) { w.s.tick += 10; updateEggs(w); }
    w.bus.flush();
    const hatchEv = evs.find((e) => e.type === 'egg_hatched');
    expect(hatchEv).toBeDefined();
    const kid = w.goblin(hatchEv!.type === 'egg_hatched' ? hatchEv!.goblinId : -1)!;
    expect(kid.lifeStage).toBe('hatchling');
    expect(kid.parents).toEqual([a.id, b.id]);
    expect(kid.homeId).toBe(hut.id);
    expect(relationOf(kid, a.id)!.bond).toBe('parent');
    expect(relationOf(a, kid.id)!.bond).toBe('child');
    expect(relationOf(kid, sib.id)!.bond).toBe('sibling');
    expect(relationOf(a, kid.id)!.opinion).toBeGreaterThanOrEqual(F.familyOpinion);
    expect(w.s.lineage[kid.id]!.parents).toEqual([a.id, b.id]);
    expect(w.s.stats.births).toBe(1);
    // a winter egg left out in the open freezes
    at(w, 50, 0.1, 'snow');
    const [cold] = layEggs(w, a, b, { x: 6, y: 6 });
    expect(ambientWarmth(w, cold!)).toBeLessThan(0.5);
    for (let t = 0; t <= 2 * DAY && w.s.eggs.includes(cold!); t += 10) { w.s.tick += 10; updateEggs(w); }
    expect(w.s.eggs.includes(cold!)).toBe(false);
    w.bus.flush();
    expect(evs.some((e) => e.type === 'egg_lost' && e.cause === 'cold')).toBe(true);
  });

  it('in the cold a parent sits on its egg and keeps it warm', () => {
    const w = makeWorld();
    at(w, 50, 0.4, 'snow');
    const [a, b] = couple(w);
    becomeMates(w, a, b);
    const [egg] = layEggs(w, a, b, { x: 10, y: 10 });
    expect(IncubateEgg.isAvailable(a, w)).toBe(true);
    a.activity = { action: 'incubate_egg', status: 'running', startedTick: w.s.tick, targetId: null, target: null, path: [], progress: 0, stage: 0 };
    expect(IncubateEgg.start(a, w)).toBe(true);
    for (let i = 0; i < 300; i++) { IncubateEgg.step(a, w); w.s.tick++; updateEggs(w); }
    expect((egg as Egg).warmth).toBe(1);
    expect((egg as Egg).incubation).toBeGreaterThan(0);
    expect(IncubateEgg.isAvailable(b, w)).toBe(false); // one sitter is enough
  });

  it('twins hatch as twins', () => {
    const w = makeWorld();
    at(w, 2);
    const [a, b] = couple(w);
    w.rng.chance = () => true; // force the 5 % roll
    const eggs = layEggs(w, a, b, { x: 16, y: 16 });
    expect(eggs).toHaveLength(2);
    const kids = eggs.map((e) => hatch(w, e));
    expect(kids.every((k) => k.traits.includes('twin'))).toBe(true);
    expect(relationOf(kids[0]!, kids[1]!.id)!.bond).toBe('sibling');
  });
});

describe('Parents and hatchlings (P5.3)', () => {
  it('a parent brings food from the stockpile to its hungry hatchling, which follows it about', () => {
    const w = makeWorld();
    at(w, 2);
    const [a, b] = couple(w);
    becomeMates(w, a, b);
    const [egg] = layEggs(w, a, b, { x: 14, y: 14 });
    const kid = hatch(w, egg!);
    w.rebuildCaches();
    kid.needs.hunger = 20;
    deposit(w.s, { type: 'apple', qty: 3 });
    expect(FeedChild.isAvailable(a, w)).toBe(true);
    expect(run(w, a, FeedChild)).toBe('done');
    expect(kid.needs.hunger).toBeCloseTo(20 + 0.5 * CFG.food.apple, 3); // a half portion from the hand
    expect(countItem(a, 'apple')).toBe(0);
    a.pos = { x: 4, y: 20 };
    b.pos = { x: 20, y: 4 };
    kid.pos = { x: 8, y: 18 };
    expect(FollowParent.isAvailable(kid, w)).toBe(true);
    run(w, kid, FollowParent, 800);
    expect(Math.hypot(kid.pos.x - a.pos.x, kid.pos.y - a.pos.y)).toBeLessThanOrEqual(F.followDist);
  });

  it('v10 saves gain a lineage, egg incubation and an egg cooldown', () => {
    const w = makeWorld();
    const [a, b] = couple(w);
    w.s.eggs.push({ id: 900, pos: { x: 1, y: 1 }, genome: a.genome, parents: [a.id, b.id], laidTick: 0, warmth: 0.5, incubation: 0, airborne: null });
    const raw = JSON.parse(serialize(w.s)) as Record<string, unknown> & { goblins: Record<string, unknown>[]; eggs: Record<string, unknown>[] };
    raw.version = 10;
    delete raw.lineage;
    for (const g of raw.goblins) delete g.lastEggTick;
    delete raw.eggs[0]!.incubation;
    const s = deserialize(JSON.stringify(raw));
    expect(Object.keys(s.lineage)).toHaveLength(2);
    expect(s.lineage[a.id]).toMatchObject({ name: a.name, died: null });
    expect(s.goblins[0]!.lastEggTick).toBeLessThan(-1e6);
    expect(s.eggs[0]!.incubation).toBe(0);
  });
});
