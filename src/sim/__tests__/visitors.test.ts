import { describe, expect, it } from 'vitest';
import { CFG } from '../config';
import { clockAt } from '../time';
import { setWeather } from '../weather';
import { deserialize, serialize, stateHash } from '../save';
import { World } from '../world';
import { relate } from '../goblin/social';
import { addItem, countItem } from '../inventory';
import { deposit, stockCount } from '../stockpile';
import { clanVisits, spawnVisitor, visitorsOf, type Visitor } from '../visitors';
import { swapFor } from '../ai/actions/trade';
import { makeWorld, spawnGoblin } from './helpers';
import type { RivalClan } from '../clans';
import type { Goblin, Trinket } from '../state';
import type { SimEvent } from '../../shared/types';

const V = CFG.visitors, DAY = CFG.time.dayTicks, HOUR = DAY / 24;

/** A quiet world on day `day` at 10:00 (a clan update falls there), every clan met but no visits due. */
function world(day = 2): { w: World; c: RivalClan } {
  const w = makeWorld({ size: 30 });
  w.s.tick = day * DAY + 4 * HOUR;
  w.clock = clockAt(w.s.tick);
  setWeather(w, 'clear');
  w.s.weather.nextChangeTick = w.s.tick + 100 * DAY;
  for (const c of w.s.rivals) { c.contact = w.s.tick - DAY; c.contactAt = 0; c.nextTrader = 1e12; c.relation = 20; }
  return { w, c: w.s.rivals[0]! };
}
function run(w: World, n: number, until?: (evs: SimEvent[]) => boolean): SimEvent[] {
  const all: SimEvent[] = [];
  for (let i = 0; i < n; i++) {
    const evs = w.step();
    all.push(...evs);
    if (until?.(evs)) break;
  }
  return all;
}
/** A trader already standing at the village with one offer. */
function trader(w: World, c: RivalClan, give: Visitor['offers'][number]['give'], want: { type: 'apple'; qty: number }): Visitor {
  const v = spawnVisitor(w, c, 'trader')!;
  v.pos = { ...v.spot };
  v.path = [];
  v.phase = 'staying';
  v.leaveAt = w.s.tick + 3 * HOUR;
  v.nextStroll = 1e12;
  v.offers = [{ give, want, done: false, claimedBy: null }];
  return v;
}
function trinket(w: World, g: Goblin): Trinket {
  const t: Trinket = { id: w.s.nextId++, kind: 'crystal', rarity: 'uncommon', hue: 120, foundBy: g.id, foundTick: w.s.tick, history: [g.id] };
  w.s.trinkets.push(t);
  g.trinkets.push(t.id);
  return t;
}

describe('scouts and traders from the rival clans (§16, P10.2)', () => {
  it('at first contact a scout walks in from its clan\'s side, watches the village and goes home', () => {
    const { w, c } = world();
    c.contact = w.s.tick;
    clanVisits(w, c, true);
    const v = visitorsOf(w.s)[0]!;
    expect(v.kind).toBe('scout');
    expect(c.pool.some((p) => Object.keys(p).every((k) => k in v.genome))).toBe(true); // a child of its clan's pool
    expect(c.nextTrader).toBeGreaterThan(w.s.tick);
    const door = { ...v.door }, centre = w.s.village.center;
    const toward = c.side === 'n' ? centre.y - door.y : c.side === 's' ? door.y - centre.y : c.side === 'e' ? door.x - centre.x : centre.x - door.x;
    expect(toward).toBeGreaterThan(5); // it came in at the edge toward its clan
    run(w, 3000, () => v.phase === 'staying');
    expect(v.phase).toBe('staying');
    expect(Math.hypot(v.pos.x - centre.x, v.pos.y - centre.y)).toBeLessThan(V.standTo + V.stroll + 1);
    const evs = run(w, V.scout.stay[1] + 3000, () => !visitorsOf(w.s).length);
    expect(visitorsOf(w.s)).toHaveLength(0);
    expect(evs.some((e) => e.type === 'visitor_left' && e.visitorId === v.id)).toBe(true);
  });

  it('a trader comes on its day in the morning with three offers, but only while its clan is on good terms', () => {
    const { w, c } = world();
    deposit(w.s, { type: 'apple', qty: 30 });
    deposit(w.s, { type: 'wood', qty: 20 });
    c.nextTrader = w.s.tick;
    clanVisits(w, c, false);
    const v = visitorsOf(w.s)[0]!;
    expect(v.kind).toBe('trader');
    expect(v.offers).toHaveLength(V.trader.offers);
    for (const o of v.offers) expect(o.want.qty).toBeGreaterThanOrEqual(1);
    expect(clockAt(v.leaveAt).hour).toBe(V.trader.leaveHour);
    const next = c.nextTrader!;
    expect(next - w.s.tick).toBeGreaterThanOrEqual(V.trader.every[0] * DAY * (c.traits.includes('traders') ? V.trader.tradersMul : 1) - 1);
    // a clan that dislikes the village sends nobody (but tries again later)
    const o = w.s.rivals[1]!;
    o.relation = -20;
    o.nextTrader = w.s.tick;
    clanVisits(w, o, false);
    expect(visitorsOf(w.s).filter((x) => x.clanId === o.id)).toHaveLength(0);
    expect(o.nextTrader).toBeGreaterThan(w.s.tick);
  });

  it('a goblin buys flint from a trader with apples the village can spare, and the clan warms to it', () => {
    const { w, c } = world();
    const g = spawnGoblin(w, { pos: { x: 16, y: 16 } });
    deposit(w.s, { type: 'apple', qty: 40 });
    const rel = c.relation, v = trader(w, c, { item: { type: 'flint', qty: 3 } }, { type: 'apple', qty: 2 });
    const evs = run(w, 2 * HOUR, () => g.activity.action === 'idle' && v.offers[0]!.done && countItem(g, 'flint') === 0);
    const deal = evs.find((e) => e.type === 'traded');
    expect(deal).toMatchObject({ goblinId: g.id, visitorId: v.id, clanId: c.id, gave: { type: 'apple', qty: 2 }, got: { type: 'flint', qty: 3 } });
    expect(v.offers[0]!.done).toBe(true);
    expect(stockCount(w.s, 'flint')).toBe(3);
    expect(stockCount(w.s, 'apple')).toBeLessThanOrEqual(38);
    expect(c.relation).toBeGreaterThan(rel + V.trade - 1);
    expect(c.news.some((n) => n.kind === 'trade')).toBe(true);
  });

  it('nobody pays with what the village cannot spare', () => {
    const { w, c } = world();
    spawnGoblin(w, { pos: { x: 16, y: 16 } });
    deposit(w.s, { type: 'apple', qty: 4 }); // a few days' food at most
    const v = trader(w, c, { item: { type: 'flint', qty: 3 } }, { type: 'apple', qty: 2 });
    const evs = run(w, HOUR);
    expect(evs.some((e) => e.type === 'traded')).toBe(false);
    expect(v.offers[0]!.done).toBe(false);
  });

  it('a recipe from a trader is learned on the spot', () => {
    const { w, c } = world();
    const g = spawnGoblin(w, { pos: { x: 16, y: 16 } });
    deposit(w.s, { type: 'apple', qty: 40 });
    trader(w, c, { recipe: 'stone_spear' }, { type: 'apple', qty: 3 });
    const evs = run(w, 2 * HOUR, (e) => e.some((x) => x.type === 'traded'));
    expect(evs.some((e) => e.type === 'recipe_learned' && e.goblinId === g.id && e.via === 'trade')).toBe(true);
  });

  it('a hungry goblin with no food swaps a trinket with a friend for food', () => {
    const { w } = world();
    const a = spawnGoblin(w, { pos: { x: 15, y: 15 } }), b = spawnGoblin(w, { pos: { x: 16, y: 15 } });
    for (const [x, y] of [[a, b], [b, a]] as const) { const r = relate(x, y.id); r.opinion = 30; r.familiarity = 30; }
    a.needs.hunger = 25;
    b.personality.sociability = 0.9;
    const t = trinket(w, a);
    addItem(b, { type: 'apple', qty: 6 });
    expect(swapFor(a, w)).not.toBeNull();
    const evs = run(w, HOUR, (e) => e.some((x) => x.type === 'traded'));
    const deal = evs.find((e) => e.type === 'traded');
    expect(deal).toMatchObject({ goblinId: a.id, withId: b.id, gave: { trinket: 'crystal' } });
    expect(b.trinkets).toContain(t.id);
    expect(swapFor(a, w)).toBeNull(); // once a day at most
  });

  it('sociable goblins greet a scout and warm its clan, up to a few greetings a visit', () => {
    const { w, c } = world();
    const gs = [0, 1, 2, 3, 4].map((i) => spawnGoblin(w, { pos: { x: 13 + i, y: 15 } }));
    for (const g of gs) g.personality.sociability = 0.95;
    const v = spawnVisitor(w, c, 'scout')!;
    v.pos = { ...v.spot }; v.path = []; v.phase = 'staying'; v.leaveAt = w.s.tick + 4 * HOUR; v.nextStroll = 1e12;
    const rel = c.relation;
    run(w, 3 * HOUR);
    expect(v.greeted.length).toBeGreaterThan(0);
    expect(c.relation).toBeGreaterThan(rel + 1);
    expect(c.relation - rel).toBeLessThanOrEqual(V.scout.greetMax + 0.5); // however many come to say hello
  });

  it('visitors are deterministic and survive a save mid-visit', () => {
    const make = (): World => {
      const { w, c } = world();
      for (let i = 0; i < 4; i++) spawnGoblin(w, { pos: { x: 13 + i, y: 15 } });
      deposit(w.s, { type: 'apple', qty: 40 });
      c.nextTrader = w.s.tick;
      clanVisits(w, c, false);
      return w;
    };
    const a = make(), b = make();
    run(a, 600); run(b, 600);
    expect(stateHash(a.s)).toBe(stateHash(b.s));
    expect(visitorsOf(a.s).length).toBe(1);
    const c = new World(deserialize(serialize(a.s)));
    run(a, 1200); run(c, 1200);
    expect(stateHash(c.s)).toBe(stateHash(a.s));
  });
});
