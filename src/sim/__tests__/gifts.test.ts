import { describe, expect, it } from 'vitest';
import { CFG } from '../config';
import { becomeMates, canLay, layEggs, registerLineage } from '../goblin/family';
import { relate } from '../goblin/social';
import { completeBuilding, placeBlueprint } from '../buildings';
import { claim } from '../ai/actions/home';
import { LayEgg } from '../ai/actions/courtship';
import { addItem } from '../inventory';
import { deposit } from '../stockpile';
import { finishCraft } from '../crafting';
import { discoveryChance, knowsAny } from '../knowledge';
import { foodStores } from '../spoilage';
import { trinketsOf, TRINKET_KINDS } from '../trinkets';
import { clockAt } from '../time';
import { setWeather } from '../weather';
import { deserialize, serialize } from '../save';
import { makeWorld, spawnGoblin } from './helpers';
import type { Goblin } from '../state';
import type { World } from '../world';
import type { SimEvent } from '../../shared/types';

const PW = CFG.powers;
const DAY = CFG.time.dayTicks;

function at(w: World, day: number, frac = 0.4): void {
  w.s.tick = day * DAY + Math.round(frac * DAY);
  w.clock = clockAt(w.s.tick);
  setWeather(w, 'clear');
  w.s.weather.nextChangeTick = w.s.tick + 100 * DAY;
}
const cast = (w: World, power: string, g: Goblin): SimEvent[] => {
  w.push({ type: 'god_cast', power, pos: { ...g.pos }, targetId: g.id });
  return w.step();
};
const rejected = (evs: SimEvent[]) => evs.find((e) => e.type === 'command_rejected');

/** Two adult mates sharing a finished hut. */
function mates(w: World): [Goblin, Goblin] {
  const a = spawnGoblin(w, { pos: { x: 12, y: 12 } }), b = spawnGoblin(w, { pos: { x: 13, y: 12 } });
  for (const g of [a, b]) registerLineage(w.s, g);
  relate(a, b.id).opinion = relate(b, a.id).opinion = 80;
  const hut = placeBlueprint(w, 'hut', { x: 16, y: 16 }, null);
  completeBuilding(w, hut, null);
  claim(w, a, hut);
  becomeMates(w, a, b);
  a.needs.hunger = b.needs.hunger = 90;
  return [a, b];
}

describe('gift powers (P5.9)', () => {
  it('Blessing: a day of +20 mood, and faith and love from the blessed', () => {
    const w = makeWorld();
    at(w, 2);
    const g = spawnGoblin(w);
    const faith = g.godView.faith, love = g.godView.love;
    cast(w, 'blessing', g);
    const m = g.mood.modifiers.find((x) => x.id === 'blessed')!;
    expect(m.amount).toBe(PW.blessMood);
    expect(m.expiresTick - w.s.tick).toBeGreaterThan(DAY - 5);
    expect(g.godView.faith).toBeGreaterThan(faith);
    expect(g.godView.love).toBeGreaterThan(love);
    expect(rejected(cast(w, 'blessing', { ...g, id: 99999 }))).toMatchObject({ reason: 'missing_entity' });
  });

  it('Inspiration: a ×10 discovery roll at once, ×3 for a day, and the next craft comes out fine', () => {
    const w = makeWorld({ size: 30 });
    at(w, 2);
    const g = spawnGoblin(w, { pos: { ...w.s.village.stockpilePos } });
    addItem(g, { type: 'wood', qty: 1 });
    deposit(w.s, { type: 'stone', qty: 2 });
    const base = discoveryChance(g, w, 'club');
    expect(base).toBeGreaterThan(0);
    // over many goblins, about ten times the hourly chance comes true at once
    let found = 0;
    const N = 200;
    for (let i = 0; i < N; i++) {
      const o = spawnGoblin(w, { pos: { ...w.s.village.stockpilePos } });
      addItem(o, { type: 'wood', qty: 1 });
      o.personality = { ...g.personality };
      cast(w, 'inspiration', o);
      if (knowsAny(o, 'club')) found++;
      w.s.goblins = w.s.goblins.filter((x) => x !== o);
    }
    expect(found / N).toBeGreaterThan(base * 4);
    cast(w, 'inspiration', g);
    expect(g.mood.modifiers.some((m) => m.id === 'inspired')).toBe(true);
    if (!knowsAny(g, 'club')) expect(discoveryChance(g, w, 'club')).toBeCloseTo(base * CFG.knowledge.inspiredMul, 6);
    // the spark is spent on the next piece of work, which comes out fine
    g.inventory = [];
    addItem(g, { type: 'wood', qty: 2 });
    const spear = finishCraft(w, g, 'spear')!;
    expect(spear.fine).toBe(true);
    expect(g.mood.modifiers.some((m) => m.id === 'inspired')).toBe(false);
  });

  it('Fertility: the pair lays within a day despite the roll, the cooldown and lean stores; twins 3 in 10', () => {
    const w = makeWorld();
    at(w, CFG.time.daysPerSeason * 2 + 4); // autumn, with nothing stored
    const [a, b] = mates(w);
    expect(foodStores(w.s).days).toBeLessThan(CFG.family.leanStoreDays);
    expect(canLay(a, w)).toBeNull(); // lean times
    const loner = spawnGoblin(w);
    expect(rejected(cast(w, 'fertility', loner))).toMatchObject({ reason: 'no_mate' });
    cast(w, 'fertility', b); // either of the pair will do
    expect(a.fertileUntil).toBeGreaterThan(w.s.tick);
    expect(canLay(a, w)).toBe(b);
    expect(LayEgg.score(a, w)).toBe(PW.fertileScore);
    a.lastEggTick = b.lastEggTick = w.s.tick; // just had one: the gift overrides the cooldown too
    expect(canLay(a, w)).toBe(b);
    const eggs = layEggs(w, a, b, a.pos);
    expect(eggs.length).toBeGreaterThanOrEqual(1);
    expect(a.fertileUntil).toBeUndefined(); // spent
    expect(canLay(a, w)).toBeNull();
    // twin rate while blessed, over many layings
    let twins = 0;
    const N = 400;
    for (let i = 0; i < N; i++) {
      a.fertileUntil = w.s.tick + DAY;
      if (layEggs(w, a, b, a.pos).length === 2) twins++;
    }
    expect(twins / N).toBeGreaterThan(PW.fertileTwins - 0.08);
    expect(twins / N).toBeLessThan(PW.fertileTwins + 0.08);
    // it wears off after a day
    a.fertileUntil = w.s.tick + DAY;
    at(w, Math.floor(w.s.tick / DAY) + 2);
    expect(canLay(a, w)).toBeNull();
  });

  it('Shiny Gift: a rare trinket in its hands, joy, and the trinket kept in saves', () => {
    const w = makeWorld();
    at(w, 2);
    const g = spawnGoblin(w);
    const evs = cast(w, 'shiny_gift', g);
    const ts = trinketsOf(g, w);
    expect(ts).toHaveLength(1);
    expect(ts[0]!.rarity).toBe('rare');
    expect(TRINKET_KINDS.rare).toContain(ts[0]!.kind);
    expect(ts[0]!.history).toEqual([g.id]);
    expect(evs.some((e) => e.type === 'trinket_found' && e.goblinId === g.id)).toBe(true);
    expect(g.mood.modifiers.find((m) => m.id === 'found_shiny')?.amount).toBeGreaterThanOrEqual(PW.shinyMood);
    const s = deserialize(serialize(w.s));
    expect(s.trinkets).toEqual(w.s.trinkets);
    const raw = JSON.parse(serialize(w.s)) as { version: number; trinkets?: unknown };
    raw.version = 14;
    delete raw.trinkets;
    expect(deserialize(JSON.stringify(raw)).trinkets).toEqual([]);
  });
});
