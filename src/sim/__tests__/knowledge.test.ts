import { describe, expect, it } from 'vitest';
import { CFG } from '../config';
import { DISCOVERABLE, FOUNDER_FACTS, discoveryChance, knowers, learn, updateKnowledge, villageKnowledge, witnessFact } from '../knowledge';
import { Teach, lessonTicks, pupil } from '../ai/actions/teach';
import { Forage } from '../ai/actions/forage';
import { Eat } from '../ai/actions/eat';
import { finishCraft } from '../crafting';
import { killGoblin } from '../goblin/needs';
import { relate } from '../goblin/social';
import { addItem } from '../inventory';
import { deposit } from '../stockpile';
import { spawnMushroom } from '../ecology';
import { createWorld } from '../newWorld';
import { deserialize, serialize } from '../save';
import { clockAt } from '../time';
import { setWeather } from '../weather';
import { makeWorld, spawnGoblin } from './helpers';
import type { UtilityAction } from '../ai/action';
import type { Goblin } from '../state';
import type { World } from '../world';
import type { SimEvent } from '../../shared/types';

const K = CFG.knowledge;
const DAY = CFG.time.dayTicks;

function events(w: World): SimEvent[] {
  const evs: SimEvent[] = [];
  w.bus.subscribe((e) => evs.push(e));
  return evs;
}
function at(w: World, day: number, frac = 0.4): void {
  w.s.tick = day * DAY + Math.round(frac * DAY);
  w.clock = clockAt(w.s.tick);
  setWeather(w, 'clear');
  w.s.weather.nextChangeTick = w.s.tick + 100 * DAY;
}
function run(w: World, g: Goblin, a: UtilityAction, others: Goblin[] = [], max = 1500): string {
  g.activity = { action: a.id, status: 'running', startedTick: w.s.tick, targetId: null, target: null, path: [], progress: 0, stage: 0 };
  if (!a.start(g, w)) return 'failed';
  for (let i = 0; i < max; i++) {
    const r = a.step(g, w);
    for (const o of others) if (o.activity.status === 'running' && o.activity.action === a.id) a.step(o, w);
    w.bus.flush();
    w.s.tick++;
    if (r !== 'running') return r;
  }
  return 'timeout';
}
/** Temporarily override knowledge tunables. */
function withK<T>(o: Partial<Record<keyof typeof K, number>>, f: () => T): T {
  const k = K as unknown as Record<string, number>;
  const old = Object.fromEntries(Object.keys(o).map((x) => [x, k[x]]));
  Object.assign(k, o);
  try { return f(); } finally { Object.assign(k, old); }
}

describe('knowledge (P5.5)', () => {
  it('a recipe can be discovered only with its inputs at hand, and the discovery is news', () => {
    const w = makeWorld({ size: 30 });
    at(w, 2);
    const g = spawnGoblin(w, { pos: { ...w.s.village.stockpilePos } });
    expect(DISCOVERABLE).toContain('club');
    expect(discoveryChance(g, w, 'club')).toBe(0);
    addItem(g, { type: 'wood', qty: 1 });
    expect(discoveryChance(g, w, 'club')).toBe(0); // no stone within reach
    deposit(w.s, { type: 'stone', qty: 2 });
    expect(discoveryChance(g, w, 'club')).toBeCloseTo(K.discoveryBase * (0.5 + g.personality.wanderlust), 6);
    const evs = events(w);
    withK({ discoveryBase: 1 }, () => {
      for (let i = 0; i < CFG.god.hourTicks && !g.knownRecipes.includes('club'); i++) { w.s.tick++; updateKnowledge(w); }
    });
    w.bus.flush();
    expect(g.knownRecipes).toContain('club');
    expect(evs.some((e) => e.type === 'recipe_discovered' && e.recipe === 'club' && e.goblinId === g.id)).toBe(true);
  });

  it('Teach passes on the rarest thing the teacher knows; elders teach and younglings learn faster', () => {
    const w = makeWorld({ size: 30 });
    at(w, 2);
    const t = spawnGoblin(w, { pos: { x: 12, y: 12 } }), p = spawnGoblin(w, { pos: { x: 15, y: 12 } });
    const third = spawnGoblin(w, { pos: { x: 25, y: 25 } });
    t.knownRecipes.push('club', 'stone_spear');
    third.knownRecipes.push('club');
    t.knownFacts = [];
    p.knownFacts = [];
    relate(p, t.id).opinion = 5;
    expect(pupil(t, w)).toBeNull(); // the pupil doesn't think enough of the teacher
    relate(p, t.id).opinion = 20;
    expect(pupil(t, w)).toBe(p);
    const evs = events(w);
    expect(run(w, t, Teach, [p])).toBe('done');
    expect(p.knownRecipes).toContain('stone_spear'); // only one knew it; two knew the club
    expect(evs.some((e) => e.type === 'recipe_learned' && e.via === 'teach' && e.byId === t.id && e.goblinId === p.id)).toBe(true);
    expect(t.skills.teaching).toBeGreaterThan(0);
    expect(Teach.isAvailable(t, w)).toBe(false); // that was enough for a while
    const elder = spawnGoblin(w, { ageDays: 90 }), kid = spawnGoblin(w, { ageDays: 8 });
    elder.lifeStage = 'elder';
    expect(lessonTicks(elder, kid)).toBe(Math.round(K.teachTicks / (K.elderTeachMul * K.younglingLearnMul)));
  });

  it('onlookers can pick up a craft by watching it done', () => {
    const w = makeWorld({ size: 30 });
    at(w, 2);
    const c = spawnGoblin(w, { pos: { x: 12, y: 12 } }), o = spawnGoblin(w, { pos: { x: 13, y: 12 } }), far = spawnGoblin(w, { pos: { x: 25, y: 12 } });
    c.knownRecipes.push('club');
    addItem(c, { type: 'wood', qty: 1 });
    addItem(c, { type: 'stone', qty: 1 });
    const evs = events(w);
    withK({ observeChance: 1 }, () => finishCraft(w, c, 'club'));
    w.bus.flush();
    expect(o.knownRecipes).toContain('club');
    expect(far.knownRecipes).not.toContain('club');
    expect(evs.some((e) => e.type === 'recipe_learned' && e.via === 'observe' && e.goblinId === o.id)).toBe(true);
  });

  it('when the last knower dies the knowledge is lost, until someone finds it again', () => {
    const w = makeWorld({ size: 30 });
    const a = spawnGoblin(w), b = spawnGoblin(w);
    a.knownRecipes.push('club');
    a.knownFacts = ['redcap_is_poison'];
    b.knownFacts = ['redcap_is_poison'];
    expect(villageKnowledge(w.s)).toEqual([{ id: 'club', fact: false, knowers: 1 }, { id: 'redcap_is_poison', fact: true, knowers: 2 }]);
    const evs = events(w);
    killGoblin(w, a, 'combat');
    w.bus.flush();
    const lost = evs.filter((e) => e.type === 'recipe_lost').map((e) => e.type === 'recipe_lost' && e.recipe);
    expect(lost).toEqual(['club']); // b still knows about redcaps
    expect(w.s.village.lost).toEqual(['club']);
    expect(knowers(w.s, 'club')).toBe(0);
    learn(w, b, 'club', 'discovery');
    expect(w.s.village.lost).toEqual([]);
  });

  it('a goblin who doesn\'t know better forages a redcap, eats it, falls ill and learns', () => {
    const w = makeWorld({ size: 30 });
    at(w, 2);
    const red = spawnMushroom(w.s, { x: 14, y: 12 }, 'redcap');
    const g = spawnGoblin(w, { pos: { x: 12, y: 12 } }), o = spawnGoblin(w, { pos: { x: 13, y: 13 } });
    g.knownFacts = [];
    o.knownFacts = [];
    g.needs.hunger = 30;
    expect(run(w, g, Forage)).toBe('done');
    expect(w.s.mushrooms.includes(red)).toBe(false);
    expect(g.inventory.some((s) => s.type === 'redcap')).toBe(true);
    const hp = g.health.hp;
    const evs = events(w);
    withK({ redcapWitness: 1 }, () => expect(run(w, g, Eat)).toBe('done'));
    expect(g.health.hp).toBeCloseTo(hp - K.redcapDmg, 3);
    expect(g.knownFacts).toContain('redcap_is_poison');
    expect(o.knownFacts).toContain('redcap_is_poison'); // saw it happen
    expect(g.mood.modifiers.some((m) => m.id === 'sick')).toBe(true);
    expect(evs.some((e) => e.type === 'poisoned' && e.goblinId === g.id)).toBe(true);
    // now it leaves them alone
    spawnMushroom(w.s, { x: 15, y: 12 }, 'redcap');
    addItem(g, { type: 'redcap', qty: 1 });
    expect(Forage.isAvailable(g, w) && run(w, g, Forage)).not.toBe('done');
    expect(Eat.isAvailable(g, w)).toBe(false);
  });

  it('seeing a Gnasher back off from fire teaches that Gnashers fear it', () => {
    const w = makeWorld({ size: 30 });
    const g = spawnGoblin(w, { pos: { x: 12, y: 12 } });
    g.knownFacts = [];
    withK({ fireWitness: 1 }, () => witnessFact(w, 'gnashers_fear_fire', { x: 15, y: 12 }, K.fireWitness));
    expect(g.knownFacts).toContain('gnashers_fear_fire');
  });

  it('founders bring some lore; old saves know all of it', () => {
    const w = createWorld({ seed: 3 });
    for (const f of FOUNDER_FACTS) {
      const n = knowers(w.s, f);
      expect(n).toBeGreaterThan(0);
      expect(n).toBeLessThanOrEqual(w.s.goblins.length);
    }
    const raw = JSON.parse(serialize(w.s)) as { version: number; goblins: Record<string, unknown>[] };
    raw.version = 11;
    for (const g of raw.goblins) delete g.knownFacts;
    const s = deserialize(JSON.stringify(raw));
    for (const g of s.goblins) expect(g.knownFacts).toEqual([...FOUNDER_FACTS]);
    expect(knowers(w.s, 'blight_spreads')).toBe(0); // learned only by watching blight kill a bush (P6.3)
  });
});
