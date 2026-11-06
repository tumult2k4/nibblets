import { describe, expect, it } from 'vitest';
import { CFG } from '../config';
import { Learn, Play, mentor, playmate } from '../ai/actions/childhood';
import { kinAttacker, courage } from '../ai/actions/fight';
import { scoreActions } from '../ai/utility';
import { kinBond, comeOfAge } from '../goblin/family';
import { killGoblin, needDecay } from '../goblin/needs';
import { gainXp } from '../goblin/skills';
import { relate, relationOf } from '../goblin/social';
import { completeBuilding, placeBlueprint } from '../buildings';
import { claim } from '../ai/actions/home';
import { clockAt } from '../time';
import { setWeather } from '../weather';
import { makeWorld, placePlant, spawnGoblin } from './helpers';
import type { UtilityAction } from '../ai/action';
import type { Goblin } from '../state';
import { spawnEnemy } from '../enemies/director';
import type { World } from '../world';
import type { SimEvent } from '../../shared/types';

const L = CFG.life;
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
function begin(w: World, g: Goblin, a: UtilityAction): boolean {
  g.activity = { action: a.id, status: 'running', startedTick: w.s.tick, targetId: null, target: null, path: [], progress: 0, stage: 0 };
  return a.start(g, w);
}
const kid = (w: World, x: number, y: number): Goblin => {
  const g = spawnGoblin(w, { ageDays: 8, pos: { x, y } });
  g.needs.fun = 30;
  return g;
};
const family = (w: World, p: Goblin, c: Goblin): void => { kinBond(w, c, p, 'parent'); kinBond(w, p, c, 'child'); };

describe('life stages (P5.4)', () => {
  it('younglings need fun (×2), grown-ups a little (P8.5), hatchlings none; hatchlings tire three times as fast', () => {
    const w = makeWorld({ size: 30 });
    const y = spawnGoblin(w, { ageDays: 8 }), a = spawnGoblin(w, { ageDays: 30 }), h = spawnGoblin(w, { ageDays: 1 });
    expect(y.lifeStage).toBe('youngling');
    expect(needDecay(y, 'fun', 'spring') * DAY).toBeCloseTo(CFG.goblin.decayPerDay.fun * 2, 3);
    expect(needDecay(a, 'fun', 'spring') * DAY).toBeCloseTo(CFG.goblin.decayPerDay.fun * CFG.festivals.adultFun.mul, 3);
    expect(needDecay(h, 'fun', 'spring')).toBe(0);
    expect(needDecay(h, 'energy', 'spring') / needDecay(a, 'energy', 'spring')).toBeCloseTo(L.hatchlingEnergyMul, 3);
  });

  it('two younglings play tag: the one who is "it" catches the other and the roles swap; fun fills up', () => {
    const w = makeWorld({ size: 30, pond: false });
    at(w, 2);
    const a = kid(w, 14, 14), b = kid(w, 16, 14);
    expect(playmate(a, w)).toBe(b);
    expect(begin(w, a, Play)).toBe(true);
    expect(a.activity.stage).toBe(1);
    expect(b.activity.action).toBe('play');
    expect(b.activity.stage).toBe(2);
    const evs = events(w);
    let swaps = 0;
    for (let i = 0; i < L.playTicks; i++) {
      const before = a.activity.stage;
      Play.step(a, w);
      Play.step(b, w);
      if (a.activity.stage !== before) swaps++;
      w.bus.flush();
      w.s.tick++;
    }
    expect(swaps).toBeGreaterThan(0);
    expect(a.needs.fun).toBeGreaterThan(80);
    expect(b.needs.fun).toBeGreaterThan(80);
    expect(evs.some((e) => e.type === 'emote' && e.emote === 'exclaim')).toBe(true);
    // the game stays near where it started
    expect(Math.hypot(a.pos.x - 15, a.pos.y - 14)).toBeLessThan(L.playRadius + 4);
  });

  it('alone, a youngling hides behind a bush near home', () => {
    const w = makeWorld({ size: 30, pond: false });
    at(w, 2);
    const bush = placePlant(w, 'apple_bush', 'mature', { x: 18, y: 15 });
    const a = kid(w, 15, 15);
    expect(playmate(a, w)).toBeNull();
    expect(begin(w, a, Play)).toBe(true);
    expect(a.activity.stage).toBe(3);
    let r = 'running';
    for (let i = 0; i < 800 && r === 'running'; i++) { r = Play.step(a, w); w.s.tick++; }
    expect(r).toBe('done');
    expect(Math.hypot(a.pos.x - bush.pos.x, a.pos.y - bush.pos.y)).toBeLessThan(1.2);
    expect(a.needs.fun).toBeGreaterThan(30);
  });

  it('a youngling learns by watching: a quarter of the worker\'s XP', () => {
    const w = makeWorld({ size: 30, pond: false });
    at(w, 2);
    const adult = spawnGoblin(w, { pos: { x: 15, y: 15 } });
    adult.activity = { action: 'chop', status: 'running', startedTick: w.s.tick, targetId: null, target: null, path: [], progress: 0, stage: 0 };
    const y = kid(w, 15, 18);
    y.personality.industry = adult.personality.industry = 0.5;
    expect(mentor(y, w)).toBe(adult);
    expect(begin(w, y, Learn)).toBe(true);
    for (let i = 0; i < 200 && y.activity.stage !== 1; i++) { Learn.step(y, w); w.s.tick++; w.rebuildCaches(); }
    expect(y.activity.stage).toBe(1);
    gainXp(w, adult, 'woodcraft', 8);
    expect(adult.skills.woodcraft).toBeCloseTo(8, 3);
    expect(y.skills.woodcraft).toBeCloseTo(8 * L.learnXp, 3);
    // the work stops: the lesson is over
    adult.activity.status = 'done';
    expect(Learn.step(y, w)).toBe('done');
  });

  it('children are kept from heavy work; elders work less and talk more', () => {
    const w = makeWorld({ size: 30 });
    const y = spawnGoblin(w, { ageDays: 8 });
    const ids = (g: Goblin) => scoreActions(g, w, false).map((r) => r.id);
    expect(ids(y)).not.toContain('build');
    const e = spawnGoblin(w, { ageDays: 100 });
    e.lifespanDays = 120;
    e.lifeStage = 'elder';
    e.needs.social = 20;
    w.rebuildCaches();
    const row = (g: Goblin, id: string) => scoreActions(g, w, false).find((r) => r.id === id);
    spawnGoblin(w, { ageDays: 30, pos: { x: e.pos.x + 2, y: e.pos.y } }); // someone to talk to
    const elderChat = row(e, 'chat');
    e.lifeStage = 'adult';
    const adultChat = row(e, 'chat');
    expect(elderChat && adultChat && elderChat.personality / adultChat.personality).toBeCloseTo(L.elderSocial, 3);
  });

  it('an orphan is adopted by the grown-up who likes it best, and gains the orphan trait', () => {
    const w = makeWorld({ size: 30 });
    const mum = spawnGoblin(w, { pos: { x: 10, y: 10 } }), dad = spawnGoblin(w, { pos: { x: 11, y: 10 } });
    const aunt = spawnGoblin(w, { pos: { x: 14, y: 10 } }), other = spawnGoblin(w, { pos: { x: 16, y: 10 } });
    const home = placeBlueprint(w, 'hut', { x: 18, y: 18 }, null);
    completeBuilding(w, home, null);
    claim(w, aunt, home);
    const c = kid(w, 12, 12);
    family(w, mum, c);
    family(w, dad, c);
    relate(aunt, c.id).opinion = 30;
    relate(other, c.id).opinion = 50;
    const evs = events(w);
    killGoblin(w, mum, 'combat');
    expect(c.traits).not.toContain('orphan'); // dad is still there
    killGoblin(w, dad, 'combat');
    w.bus.flush();
    expect(c.traits).toContain('orphan');
    // `other` likes the child more, but only the aunt has a home with room
    expect(relationOf(c, aunt.id)?.bond).toBe('parent');
    expect(relationOf(aunt, c.id)?.bond).toBe('child');
    expect(c.homeId).toBe(home.id);
    expect(evs.some((e) => e.type === 'adopted' && e.goblinId === c.id && e.parentId === aunt.id)).toBe(true);
  });

  it('a child who comes of age takes a free bed at home, or moves out of a full one', () => {
    const w = makeWorld({ size: 30 });
    const p = spawnGoblin(w);
    const home = placeBlueprint(w, 'hut', { x: 18, y: 18 }, null);
    completeBuilding(w, home, null);
    claim(w, p, home);
    const c = spawnGoblin(w, { ageDays: 15.99 });
    c.homeId = home.id;
    comeOfAge(w, c);
    expect(home.occupants).toContain(c.id);
    const d = spawnGoblin(w, { ageDays: 15.99 });
    d.homeId = home.id;
    expect(home.occupants).toHaveLength(2); // full
    comeOfAge(w, d);
    expect(d.homeId).toBeNull();
  });

  it('a parent is half again as brave when a Gnasher goes for its egg', () => {
    const w = makeWorld({ size: 30, pond: false });
    at(w, 2, 0.95);
    const p = spawnGoblin(w, { pos: { x: 15, y: 15 } });
    p.personality.bravery = 0.4;
    w.s.eggs.push({ id: 900, pos: { x: 16, y: 15 }, genome: p.genome, parents: [p.id, p.id], laidTick: 0, warmth: 1, incubation: 0, airborne: null });
    const e = spawnEnemy(w, 'gnasher', { x: 18, y: 15 });
    e.mode = 'steal';
    e.targetId = 900;
    expect(kinAttacker(p, w)).toBe(e);
    expect(courage(p, w)).toBeCloseTo(0.4 * L.parentBravery, 4);
  });

  it('no more stand-in newcomers: a small village stays small', () => {
    const w = makeWorld({ goblins: 3 });
    at(w, 8, 0.3);
    w.s.tick -= 1;
    w.step();
    expect(w.s.goblins).toHaveLength(3);
  });
});
