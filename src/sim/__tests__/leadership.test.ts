import { describe, expect, it } from 'vitest';
import { CFG } from '../config';
import { clockAt } from '../time';
import { setWeather } from '../weather';
import { adjustOpinion } from '../goblin/social';
import { giveTrinket } from '../trinkets';
import { lawOf } from '../mischief';
import { chiefOf, chiefScore, electChief, exileLine, exileRadius, isExiled, pickWatch, policyWorkMul, sentenceFor, updateLeadership } from '../leadership';
import { Exile, Judge } from '../ai/actions/judge';
import { Apologize } from '../ai/actions/steal';
import { ACTIONS, scoreActions } from '../ai/utility';
import { makeWorld, spawnGoblin } from './helpers';
import type { UtilityAction } from '../ai/action';
import type { Goblin } from '../state';
import type { World } from '../world';
import type { SimEvent } from '../../shared/types';

const DAY = CFG.time.dayTicks, L = CFG.leadership;

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
const flat = (g: Goblin, x = 0.5): void => { Object.assign(g.personality, { industry: x, bravery: x, sociability: x, piety: x, mischief: x }); };

describe('leadership (P8.4, §13.5–13.6)', () => {
  it('the first chief is chosen on day 2 by reputation, age and standing, wears the post and sets the policies', () => {
    const w = makeWorld({ size: 40 });
    const a = spawnGoblin(w, { ageDays: 30 }), b = spawnGoblin(w, { ageDays: 60 }), c = spawnGoblin(w, { ageDays: 30 });
    for (const g of [a, b, c]) flat(g);
    b.personality.industry = 0.8;
    b.personality.mischief = 0.2;
    a.reputation = 10;
    adjustOpinion(w, c, b, 40);
    expect(chiefScore(b, w)).toBeGreaterThan(chiefScore(a, w));
    const evs = events(w);
    at(w, DAY + Math.floor(DAY * L.electAt));
    updateLeadership(w);
    expect(chiefOf(w)).toBeUndefined(); // not on day 1
    at(w, 2 * DAY + Math.floor(DAY * L.electAt));
    updateLeadership(w);
    w.bus.flush();
    expect(chiefOf(w)).toBe(b);
    expect(b.role).toBe('chief');
    expect(evs.some((e) => e.type === 'chief_chosen' && e.goblinId === b.id && e.previousId === null)).toBe(true);
    expect(policyWorkMul(w)).toBe(L.policy.workMul);
    expect(lawOf(w)).toBe(L.policy.law.strict);
    expect(w.s.village.policies?.rota).toBeUndefined();
  });

  it('a new chief after the old one dies, and again at the new year if someone stands higher', () => {
    const w = makeWorld({ size: 40 });
    const a = spawnGoblin(w, { ageDays: 30 }), b = spawnGoblin(w, { ageDays: 30 });
    a.reputation = 30;
    at(w, 3 * DAY);
    electChief(w);
    expect(chiefOf(w)).toBe(a);
    w.s.goblins = w.s.goblins.filter((g) => g !== a); // gone
    const evs = events(w);
    at(w, 4 * DAY + Math.floor(DAY * L.electAt));
    updateLeadership(w);
    w.bus.flush();
    expect(chiefOf(w)).toBe(b);
    expect(evs.some((e) => e.type === 'chief_chosen' && e.previousId === a.id)).toBe(true);
    const c = spawnGoblin(w, { ageDays: 40 });
    c.reputation = 60;
    at(w, 5 * DAY + Math.floor(DAY * L.electAt));
    updateLeadership(w); // mid-year: the chief stays
    expect(chiefOf(w)).toBe(b);
    const year = 4 * CFG.time.daysPerSeason;
    at(w, year * DAY + Math.floor(DAY * L.electAt));
    updateLeadership(w);
    expect(chiefOf(w)).toBe(c);
    expect(b.role).toBe('none');
  });

  it('a brave chief keeps a night watch of the two bravest armed adults, who stand guard first', () => {
    const w = makeWorld({ size: 40 });
    const gs = [0.9, 0.3, 0.8, 0.95].map((br) => { const g = spawnGoblin(w); g.personality.bravery = br; g.equipped.hand = { type: 'spear', qty: 1 }; return g; });
    gs[3]!.equipped.hand = null; // the bravest has nothing to fight with
    w.s.village.policies = { rota: true };
    pickWatch(w);
    expect(w.s.village.watch).toEqual([gs[0]!.id, gs[2]!.id]);
    at(w, 3 * DAY + Math.floor(DAY * 0.68)); // dusk, just after the watch is picked
    w.goblinHash.rebuild(w.s.goblins);
    for (const g of gs) Object.assign(g.needs, { hunger: 90, thirst: 90, energy: 90 });
    const top = scoreActions(gs[0]!, w, false)[0]!;
    expect(top.id).toBe('guard');
    at(w, 3 * DAY + Math.floor(DAY * 0.8)); // night: at its post it stays up; off it, it goes to bed like the rest
    gs[0]!.activity = { ...gs[0]!.activity, action: 'guard' };
    expect(scoreActions(gs[0]!, w, false)[0]!.id).toBe('guard');
    gs[0]!.activity = { ...gs[0]!.activity, action: 'idle' };
    expect(scoreActions(gs[0]!, w, false)[0]!.id).not.toBe('guard');
    w.s.village.policies = {};
    pickWatch(w);
    expect(w.s.village.watch).toBeUndefined();
  });

  it('justice: the chief orders a known thief of poor name to give it back, and it goes and does', () => {
    const w = makeWorld({ size: 40 });
    at(w, 3 * DAY);
    const chief = spawnGoblin(w, { pos: { x: 14, y: 20 } }), thief = spawnGoblin(w, { pos: { x: 20, y: 20 } }), victim = spawnGoblin(w, { pos: { x: 26, y: 20 } });
    flat(chief); flat(thief); thief.personality.sociability = 0.1; // it would never own up of itself
    chief.role = 'chief'; w.s.village.chiefId = chief.id;
    const t = giveTrinket(w, thief, 'rare');
    thief.guilt = [{ victimId: victim.id, trinketId: t.id, tick: w.s.tick, known: true }];
    thief.reputation = -25;
    w.goblinHash.rebuild(w.s.goblins);
    expect(Apologize.isAvailable(thief, w)).toBe(false);
    expect(Judge.isAvailable(chief, w)).toBe(true);
    const evs = events(w);
    expect(run(w, chief, Judge)).toBe('done');
    expect(evs.some((e) => e.type === 'justice' && e.sentence === 'return' && e.goblinId === thief.id)).toBe(true);
    expect(thief.guilt[0]!.ordered).toBe(true);
    expect(Apologize.isAvailable(thief, w)).toBe(true);
    expect(Apologize.score(thief, w)).toBe(CFG.mischief.apology.ordered);
    expect(run(w, thief, Apologize)).toBe('done');
    expect(victim.trinkets).toContain(t.id);
    expect(thief.guilt[0]!.settled).toBe(true);
    expect(Judge.isAvailable(chief, w)).toBe(false);
  });

  it('exile: the worst are sent out for two days, live outside the village, and come back', () => {
    const w = makeWorld({ size: 60 });
    at(w, 3 * DAY);
    const chief = spawnGoblin(w, { pos: { x: 28, y: 30 } }), thief = spawnGoblin(w, { pos: { x: 31, y: 30 } }), victim = spawnGoblin(w, { pos: { x: 34, y: 30 } });
    w.s.village.center = { x: 30, y: 30 };
    chief.role = 'chief'; w.s.village.chiefId = chief.id;
    thief.guilt = [{ victimId: victim.id, item: 'apple', tick: w.s.tick, known: true }];
    thief.reputation = -60;
    w.goblinHash.rebuild(w.s.goblins);
    const evs = events(w);
    expect(run(w, chief, Judge)).toBe('done');
    expect(evs.some((e) => e.type === 'justice' && e.sentence === 'exile')).toBe(true);
    expect(isExiled(thief, w)).toBe(true);
    // only living off the land is left to it, and leaving comes first
    w.goblinHash.rebuild(w.s.goblins);
    const rows = scoreActions(thief, w, false);
    expect(rows[0]!.id).toBe('exile');
    expect(rows.every((r) => ['work', 'social'].every((tag) => !ACTIONS[r.id].tags.includes(tag as never)) || r.id === 'forage' || r.id === 'harvest_fruit')).toBe(true);
    expect(run(w, thief, Exile)).toBe('done');
    expect(Math.hypot(thief.pos.x - 30, thief.pos.y - 30)).toBeGreaterThanOrEqual(exileRadius());
    expect(Exile.isAvailable(thief, w)).toBe(false);
    w.s.tick = thief.exiledUntil! + (50 - (thief.exiledUntil! % 50));
    updateLeadership(w);
    w.bus.flush();
    expect(isExiled(thief, w)).toBe(false);
    expect(evs.some((e) => e.type === 'exile_ended' && e.goblinId === thief.id)).toBe(true);
  });

  it('a lax (mischievous) chief exiles later, a strict one sooner, and nobody is sent out in winter', () => {
    const w = makeWorld({ size: 40 });
    at(w, 3 * DAY);
    const thief = spawnGoblin(w), victim = spawnGoblin(w);
    const gu = { victimId: victim.id, item: 'apple' as const, tick: w.s.tick, known: true };
    thief.reputation = -35;
    expect(sentenceFor(thief, gu, w)).toBe('exile'); // the usual law: −30
    w.s.village.policies = { law: L.policy.law.lax };
    expect(exileLine(w)).toBeCloseTo(-40, 5);
    expect(sentenceFor(thief, gu, w)).toBe('apology');
    w.s.village.policies = { law: L.policy.law.strict };
    expect(exileLine(w)).toBeCloseTo(-20, 5);
    thief.reputation = -25;
    expect(sentenceFor(thief, gu, w)).toBe('exile');
    at(w, 3 * CFG.time.daysPerSeason * DAY + DAY); // winter
    thief.reputation = -90;
    expect(sentenceFor(thief, gu, w)).toBe('apology');
  });
});
