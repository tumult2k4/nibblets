import { describe, expect, it } from 'vitest';
import { CFG } from '../config';
import { clockAt } from '../time';
import { setWeather } from '../weather';
import { completeBuilding, placeBlueprint } from '../buildings';
import { adjustOpinion, opinionOf } from '../goblin/social';
import { giveTrinket } from '../trinkets';
import { heardOfTheft, theft, updateReputation } from '../mischief';
import { Apologize, Steal, stealMark } from '../ai/actions/steal';
import { Prank } from '../ai/actions/prank';
import { Brawl } from '../ai/actions/brawl';
import { SleepHome } from '../ai/actions/home';
import { makeWorld, spawnGoblin } from './helpers';
import type { UtilityAction } from '../ai/action';
import type { Building, Goblin } from '../state';
import type { World } from '../world';
import type { SimEvent } from '../../shared/types';

const DAY = CFG.time.dayTicks, X = CFG.mischief;

function at(w: World, tick: number): void {
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
function run(w: World, g: Goblin, a: UtilityAction, max = 3000): string {
  g.activity = { action: a.id, status: 'running', startedTick: w.s.tick, targetId: null, target: null, path: [], progress: 0, stage: 0 };
  w.goblinHash.rebuild(w.s.goblins);
  if (!a.start(g, w)) return 'failed';
  for (let i = 0; i < max; i++) {
    w.goblinHash.rebuild(w.s.goblins);
    const r = a.step(g, w);
    w.bus.flush();
    w.s.tick++;
    if (r !== 'running') return r;
  }
  return 'timeout';
}
function homeFor(w: World, g: Goblin, p: { x: number; y: number }): Building {
  const b = placeBlueprint(w, 'hut', p, g.id);
  completeBuilding(w, b, g.id);
  g.homeId = b.id;
  if (!b.occupants.includes(g.id)) b.occupants.push(g.id);
  return b;
}
const asleep = (g: Goblin, w: World): void => {
  g.activity = { action: 'sleep_ground', status: 'running', startedTick: w.s.tick, targetId: null, target: null, path: [], progress: 0, stage: 1 };
};
const rogue = (g: Goblin): void => { Object.assign(g.personality, { mischief: 0.95, gluttony: 0.9, sociability: 0.8 }); };

describe('mischief (P8.3, §13.5–13.6)', () => {
  it('theft with a witness: opinion and reputation drop, the victim knows who and is angry', () => {
    const w = makeWorld({ size: 40 });
    at(w, 2 * DAY);
    const thief = spawnGoblin(w, { pos: { x: 20, y: 20 } }), victim = spawnGoblin(w, { pos: { x: 30, y: 30 } });
    const witness = spawnGoblin(w, { pos: { x: 22, y: 20 } });
    w.goblinHash.rebuild(w.s.goblins);
    const before = opinionOf(witness, thief.id);
    const evs = events(w);
    theft(w, thief, victim, 'apple', null, thief.pos);
    w.bus.flush();
    expect(opinionOf(witness, thief.id)).toBeCloseTo(before + X.theft.witnessOpinion, 1);
    expect(thief.reputation).toBeLessThan(0);
    expect(opinionOf(victim, thief.id)).toBeLessThanOrEqual(X.theft.discovered);
    expect(victim.mood.modifiers.some((m) => m.id === 'robbed')).toBe(true);
    expect(thief.guilt?.[0]?.known).toBe(true);
    expect(witness.memory.some((m) => m.kind === 'thief' && m.targetId === thief.id)).toBe(true);
    const e = evs.find((x) => x.type === 'theft');
    expect(e?.type === 'theft' && e.witnessIds).toEqual([witness.id]);
  });

  it('unseen theft: the victim only finds the thing gone when it gets home, and hearsay later names the thief', () => {
    const w = makeWorld({ size: 40 });
    at(w, 2 * DAY);
    const thief = spawnGoblin(w, { pos: { x: 5, y: 5 } }), victim = spawnGoblin(w, { pos: { x: 30, y: 30 } });
    const home = homeFor(w, victim, { x: 30, y: 26 });
    w.goblinHash.rebuild(w.s.goblins);
    theft(w, thief, victim, 'apple', null, thief.pos);
    expect(thief.reputation).toBe(0);
    expect(opinionOf(victim, thief.id)).toBe(0);
    expect(home.data?.missing).toBe(1);
    victim.activity = { action: 'sleep_home', status: 'running', startedTick: w.s.tick, targetId: home.id, target: null, path: [], progress: 1, stage: 1 };
    SleepHome.step(victim, w);
    expect(victim.mood.modifiers.find((m) => m.id === 'robbed')?.amount).toBe(X.theft.missingMood);
    expect(home.data?.missing).toBeUndefined();
    // somebody did see it after all and tells the victim in a chat
    heardOfTheft(w, victim, thief.id, victim.id);
    expect(thief.reputation).toBe(X.reputation.theft);
    expect(thief.guilt?.[0]?.known).toBe(true);
    expect(opinionOf(victim, thief.id)).toBeLessThan(X.theft.discovered);
  });

  it('Steal: a greedy, mischievous goblin takes a trinket off a shelf while the household is out', () => {
    const w = makeWorld({ size: 40 });
    at(w, 2 * DAY + DAY / 3);
    const thief = spawnGoblin(w, { pos: { x: 12, y: 20 } }), owner = spawnGoblin(w, { pos: { x: 36, y: 36 } });
    rogue(thief);
    adjustOpinion(w, thief, owner, -60);
    const home = homeFor(w, owner, { x: 18, y: 20 });
    const t = giveTrinket(w, owner, 'rare');
    home.decoration.push(t.id);
    w.goblinHash.rebuild(w.s.goblins);
    expect(stealMark(thief, w)?.where).toBe('shelf');
    const evs = events(w);
    expect(run(w, thief, Steal)).toBe('done');
    expect(thief.trinkets).toContain(t.id);
    expect(owner.trinkets).not.toContain(t.id);
    expect(home.decoration).not.toContain(t.id);
    expect(t.history.at(-1)).toBe(thief.id);
    expect(evs.some((e) => e.type === 'theft' && e.trinket === t.kind)).toBe(true);
    expect(thief.deeds.stolen).toBe(1);
  });

  it('Steal from a sleeper: the trinket in its pocket goes, unseen; it misses it once it is home', () => {
    const w = makeWorld({ size: 40 });
    at(w, 2 * DAY);
    const thief = spawnGoblin(w, { pos: { x: 12, y: 20 } }), victim = spawnGoblin(w, { pos: { x: 18, y: 22 } });
    rogue(thief);
    adjustOpinion(w, thief, victim, -50);
    const home = homeFor(w, victim, { x: 30, y: 30 });
    const t = giveTrinket(w, victim, 'rare');
    asleep(victim, w);
    w.goblinHash.rebuild(w.s.goblins);
    expect(stealMark(thief, w)?.where).toBe('pocket');
    expect(run(w, thief, Steal)).toBe('done');
    expect(thief.trinkets).toContain(t.id);
    expect(home.data?.missing).toBe(1);
    expect(thief.guilt?.[0]).toMatchObject({ victimId: victim.id, trinketId: t.id, known: false });
  });

  it('nobody steals from a home with someone in it, or when the law is strict', () => {
    const w = makeWorld({ size: 40 });
    at(w, 2 * DAY);
    const thief = spawnGoblin(w, { pos: { x: 12, y: 20 } }), owner = spawnGoblin(w, { pos: { x: 18, y: 21 } });
    rogue(thief);
    const home = homeFor(w, owner, { x: 18, y: 20 });
    home.decoration.push(giveTrinket(w, owner, 'rare').id);
    w.goblinHash.rebuild(w.s.goblins);
    expect(stealMark(thief, w)).toBeNull();
    owner.pos = { x: 36, y: 36 };
    w.s.tick++;
    expect(stealMark(thief, w)).not.toBeNull();
    w.s.village.policies = { law: 0.9 };
    w.s.tick++;
    expect(stealMark(thief, w)).toBeNull();
  });

  it('Apologize: a caught, sociable thief gives the thing back; the victim thinks better of it and the guilt is settled', () => {
    const w = makeWorld({ size: 40 });
    at(w, 2 * DAY);
    const thief = spawnGoblin(w, { pos: { x: 20, y: 20 } }), victim = spawnGoblin(w, { pos: { x: 24, y: 20 } });
    rogue(thief);
    const t = giveTrinket(w, thief, 'uncommon');
    thief.guilt = [{ victimId: victim.id, trinketId: t.id, tick: w.s.tick, known: true }];
    adjustOpinion(w, victim, thief, -25);
    victim.mood.modifiers.push({ id: 'robbed', amount: -12, expiresTick: w.s.tick + 2 * DAY });
    expect(Apologize.isAvailable(thief, w)).toBe(false); // not yet: half a day first
    w.s.tick += DAY;
    expect(Apologize.isAvailable(thief, w)).toBe(true);
    const evs = events(w);
    expect(run(w, thief, Apologize)).toBe('done');
    expect(victim.trinkets).toContain(t.id);
    expect(opinionOf(victim, thief.id)).toBeCloseTo(-25 + X.apology.opinion, 0);
    expect(victim.mood.modifiers.some((m) => m.id === 'robbed')).toBe(false);
    expect(thief.guilt[0]!.settled).toBe(true);
    expect(evs.some((e) => e.type === 'apology' && e.returned)).toBe(true);
    updateReputation(w);
    w.s.tick = Math.ceil(w.s.tick / DAY) * DAY + Math.floor(DAY * 0.21);
    updateReputation(w);
    expect(thief.guilt).toEqual([]);
  });

  it('Prank: a joker hides what someone carries a few steps away; its fun soars, the victim is put out', () => {
    const w = makeWorld({ size: 40 });
    at(w, 2 * DAY);
    const g = spawnGoblin(w, { pos: { x: 20, y: 20 } }), o = spawnGoblin(w, { pos: { x: 23, y: 20 } });
    rogue(g);
    o.personality.mischief = 0.2;
    o.inventory = [{ type: 'stick', qty: 1 }];
    g.needs.fun = 30;
    w.goblinHash.rebuild(w.s.goblins);
    expect(Prank.isAvailable(g, w)).toBe(true);
    const evs = events(w);
    expect(run(w, g, Prank)).toBe('done');
    expect(o.inventory).toEqual([]);
    expect(w.s.groundItems.some((it) => it.stack.type === 'stick')).toBe(true);
    expect(g.needs.fun).toBeGreaterThanOrEqual(30 + X.prank.prankerFun - 1);
    expect(opinionOf(o, g.id)).toBeCloseTo(X.prank.victimOpinion, 0);
    expect(o.mood.modifiers.some((m) => m.id === 'pranked')).toBe(true);
    expect(evs.some((e) => e.type === 'prank' && e.kind === 'hide_item')).toBe(true);
    expect(Prank.isAvailable(g, w)).toBe(false); // not again so soon
  });

  it('Prank on a hut: the mushroom in the bed is found at bedtime', () => {
    const w = makeWorld({ size: 40 });
    at(w, 2 * DAY);
    const g = spawnGoblin(w, { pos: { x: 14, y: 20 } }), o = spawnGoblin(w, { pos: { x: 30, y: 34 } });
    rogue(g);
    const home = homeFor(w, o, { x: 18, y: 20 });
    w.goblinHash.rebuild(w.s.goblins);
    for (let k = 0; k < 4 && run(w, g, Prank) === 'done' && !home.data?.mushroom; k++) g.mood.modifiers = [];
    expect(home.data?.mushroom ?? home.data?.painted).toBeTruthy();
    o.activity = { action: 'sleep_home', status: 'running', startedTick: w.s.tick, targetId: home.id, target: null, path: [], progress: 1, stage: 1 };
    SleepHome.step(o, w);
    expect(o.mood.modifiers.some((m) => m.id === 'mushroom_bed' || m.id === 'painted_home')).toBe(true);
    expect(o.deeds.pranked).toBeGreaterThanOrEqual(1);
  });

  it('Brawl: two who loathe each other come to blows, never below half health, and end up sorer', () => {
    const w = makeWorld({ size: 40 });
    at(w, 2 * DAY);
    const a = spawnGoblin(w, { pos: { x: 20, y: 20 } }), b = spawnGoblin(w, { pos: { x: 23, y: 20 } });
    a.personality.bravery = 0.9;
    adjustOpinion(w, a, b, -90);
    adjustOpinion(w, b, a, -60);
    a.health.hp = b.health.hp = 0.62 * a.health.maxHp;
    w.goblinHash.rebuild(w.s.goblins);
    expect(Brawl.isAvailable(a, w)).toBe(true);
    const evs = events(w);
    // the one pulled in runs its side as the same action
    const r = (() => {
      a.activity = { action: 'brawl', status: 'running', startedTick: w.s.tick, targetId: null, target: null, path: [], progress: 0, stage: 0 };
      if (!Brawl.start(a, w)) return 'failed';
      for (let i = 0; i < 2000; i++) {
        w.goblinHash.rebuild(w.s.goblins);
        const x = Brawl.step(a, w);
        if (b.activity.action === 'brawl' && b.activity.status === 'running') Brawl.step(b, w);
        w.bus.flush();
        w.s.tick++;
        if (x !== 'running') return x;
      }
      return 'timeout';
    })();
    expect(r).toBe('done');
    expect(a.health.hp).toBeGreaterThanOrEqual(a.health.maxHp * X.brawl.hpFloor - 0.01);
    expect(b.health.hp).toBeGreaterThanOrEqual(b.health.maxHp * X.brawl.hpFloor - 0.01);
    expect(b.health.hp).toBeLessThan(0.62 * b.health.maxHp);
    expect(opinionOf(a, b.id)).toBeLessThan(-90);
    expect(a.mood.modifiers.some((m) => m.id === 'brawled') && b.mood.modifiers.some((m) => m.id === 'brawled')).toBe(true);
    expect(a.reputation).toBe(X.reputation.brawl);
    expect(evs.some((e) => e.type === 'brawl' && e.aId === a.id && e.bId === b.id)).toBe(true);
    expect(Brawl.isAvailable(a, w)).toBe(false);
  });

  it('reputation: building for all and beating enemies raise it, it eases back day by day', () => {
    const w = makeWorld({ size: 40 });
    at(w, 2 * DAY);
    const g = spawnGoblin(w, { pos: { x: 20, y: 20 } });
    const b = placeBlueprint(w, 'campfire', { x: 24, y: 20 }, g.id);
    (b.data ??= {})['w' + g.id] = 1;
    completeBuilding(w, b, g.id);
    expect(g.reputation).toBe(X.reputation.communalBuild);
    const h = placeBlueprint(w, 'hut', { x: 14, y: 14 }, g.id);
    (h.data ??= {})['w' + g.id] = 1;
    completeBuilding(w, h, g.id);
    expect(g.reputation).toBe(X.reputation.communalBuild); // a home of one's own does not count
    w.s.tick = 3 * DAY + Math.floor(DAY * 0.21);
    updateReputation(w);
    expect(g.reputation).toBeCloseTo(X.reputation.communalBuild * (1 - X.reputation.decay), 3);
  });

});
