import { describe, expect, it } from 'vitest';
import { CFG } from '../config';
import { clockAt } from '../time';
import { setWeather } from '../weather';
import { placeBlueprint } from '../buildings';
import { planFor, pushGoal, resolve, type Goal, type PlanView } from '../ai/planner';
import { makeWorld, placePlant, spawnGoblin } from './helpers';
import type { ItemType, SimEvent } from '../../shared/types';

const DAY = CFG.time.dayTicks;

function view(o: Partial<{ carried: Partial<Record<ItemType, number>>; stock: Partial<Record<ItemType, number>>; missing: number; complete: boolean; gone: boolean; ground: boolean; chop: boolean; mine: boolean }> = {}): PlanView {
  return {
    carried: (i) => o.carried?.[i] ?? 0,
    stock: (i) => o.stock?.[i] ?? 0,
    building: () => (o.gone ? null : { complete: !!o.complete, missing: o.missing ? [{ type: 'wood', qty: o.missing }] : [] }),
    onGround: () => !!o.ground,
    canChop: () => !!o.chop,
    canMine: () => !!o.mine,
    carryCap: 10,
  };
}
const build: Goal = { kind: 'build', buildingId: 1 };
const obtain: Goal = { kind: 'obtain', item: 'wood', qty: 6 };

describe('planner goal stack (§7.4, P3.5)', () => {
  it('resolve: build goals deliver, labor, push obtain, finish or fail', () => {
    expect(resolve(build, view({ gone: true }))).toEqual({ kind: 'impossible' });
    expect(resolve(build, view({ complete: true }))).toEqual({ kind: 'satisfied' });
    expect(resolve(build, view({ missing: 0 }))).toEqual({ kind: 'act', action: 'build' });
    expect(resolve(build, view({ missing: 6, stock: { wood: 2 } }))).toEqual({ kind: 'act', action: 'deliver_material' });
    expect(resolve(build, view({ missing: 6, carried: { wood: 1 } }))).toEqual({ kind: 'act', action: 'deliver_material' });
    expect(resolve(build, view({ missing: 6 }))).toEqual({ kind: 'push', goal: { kind: 'obtain', item: 'wood', qty: 6 } });
  });

  it('resolve: obtain prefers the stockpile, then loose items, then chopping, then exploring', () => {
    expect(resolve(obtain, view({ carried: { wood: 6 } }))).toEqual({ kind: 'satisfied' });
    expect(resolve(obtain, view({ stock: { wood: 1 }, ground: true, chop: true }))).toEqual({ kind: 'act', action: 'gather_for_goal' });
    expect(resolve(obtain, view({ ground: true, chop: true }))).toEqual({ kind: 'act', action: 'pick_up' });
    expect(resolve(obtain, view({ chop: true }))).toEqual({ kind: 'act', action: 'chop' });
    expect(resolve(obtain, view({}))).toEqual({ kind: 'act', action: 'explore' });
    expect(resolve({ kind: 'obtain', item: 'stone', qty: 2 }, view({ mine: true }))).toEqual({ kind: 'act', action: 'mine' });
    expect(resolve({ kind: 'obtain', item: 'flint', qty: 1 }, view({}))).toEqual({ kind: 'act', action: 'explore' });
    expect(resolve({ kind: 'obtain', item: 'fiber', qty: 2 }, view({}))).toEqual({ kind: 'impossible' });
  });

  it('planFor pushes subgoals, never deeper than 4, and pops satisfied ones', () => {
    const w = makeWorld();
    const g = spawnGoblin(w);
    const b = placeBlueprint(w, 'hut', { x: 16, y: 16 }, g.id);
    pushGoal(w.goblin(g.id)!, w, { kind: 'build', buildingId: b.id });
    pushGoal(g, w, { kind: 'build', buildingId: b.id }); // duplicate ignored
    expect(g.goalStack.length).toBe(1);
    expect(planFor(g, w, () => true)).toBe('chop');
    expect(g.goalStack.map((e) => e.goal.kind)).toEqual(['build', 'obtain']);
    g.inventory.push({ type: 'wood', qty: 6 });
    expect(planFor(g, w, () => true)).toBe('deliver_material');
    expect(g.goalStack.length).toBe(1);
    for (let i = 0; i < 6; i++) pushGoal(g, w, { kind: 'obtain', item: 'fiber', qty: i + 1 });
    expect(g.goalStack.length).toBeLessThanOrEqual(CFG.planner.maxDepth);
  });

  it('an owner with no wood in the village chops, hauls and builds its own hut', () => {
    const w = makeWorld();
    w.s.tick = 2 * DAY + 200;
    w.clock = clockAt(w.s.tick);
    setWeather(w, 'clear');
    w.s.weather.nextChangeTick = w.s.tick + 100 * DAY;
    const g = spawnGoblin(w);
    for (const [x, y] of [[6, 18], [8, 20], [18, 6], [20, 9]] as const) placePlant(w, 'apple_bush', 'old', { x, y }, 0);
    // a healthy orchard elsewhere, so the old bushes may be cut (P5.5 spares them when fruiting bushes run short)
    for (let i = 0; i < CFG.plants.minBushesPerGoblin + 1; i++) placePlant(w, 'apple_bush', 'mature', { x: 4.5 + i * 2, y: 28.5 }, 3);
    const b = placeBlueprint(w, 'hut', { x: 16, y: 16 }, g.id);
    b.occupants.push(g.id);
    g.homeId = b.id;
    pushGoal(g, w, { kind: 'build', buildingId: b.id });
    const did = new Set<string>();
    for (let t = 0; t < 2 * DAY && b.buildProgress < 1; t++) {
      w.step();
      did.add(g.activity.action);
      if (t % 300 === 0) { g.needs.hunger = Math.max(60, g.needs.hunger); g.needs.thirst = Math.max(60, g.needs.thirst); }
    }
    expect(did.has('chop')).toBe(true);
    expect(b.buildProgress).toBe(1);
    w.step();
    planFor(g, w, () => false);
    expect(g.goalStack.length).toBe(0);
  });

  it('goals are abandoned when urgent needs pre-empt them for over 300 ticks', () => {
    const w = makeWorld();
    const g = spawnGoblin(w);
    const b = placeBlueprint(w, 'hut', { x: 16, y: 16 }, g.id);
    pushGoal(g, w, { kind: 'build', buildingId: b.id });
    const evs: SimEvent[] = [];
    w.bus.subscribe((e) => evs.push(e));
    g.needs.thirst = 2;
    planFor(g, w, () => false);
    w.s.tick += CFG.planner.abandonTicks + 1;
    planFor(g, w, () => false);
    w.step();
    expect(g.goalStack.length).toBe(0);
    expect(evs.some((e) => e.type === 'goal_abandoned' && e.goblinId === g.id)).toBe(true);
  });
});
