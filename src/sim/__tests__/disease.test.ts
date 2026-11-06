import { describe, expect, it } from 'vitest';
import { CFG } from '../config';
import { diseaseHungerMul, frailty, infect, isSick, recoveryRate, updateDiseases } from '../disease';
import { workMul } from '../combat';
import { needDecay } from '../goblin/needs';
import { RestSick, TendSick, patientFor } from '../ai/actions/care';
import { relate } from '../goblin/social';
import { completeBuilding, placeBlueprint } from '../buildings';
import { claim } from '../ai/actions/home';
import { deserialize, serialize } from '../save';
import { makeWorld, spawnGoblin } from './helpers';
import type { UtilityAction } from '../ai/action';
import type { Goblin } from '../state';
import type { World } from '../world';
import type { SimEvent } from '../../shared/types';

const DAY = CFG.time.dayTicks;
const D = CFG.health.diseases as Record<string, { mortality: number; contact: number }>;

function events(w: World): SimEvent[] {
  const evs: SimEvent[] = [];
  w.bus.subscribe((e) => evs.push(e));
  return evs;
}
/** Tick only the disease system (needs and AI stay put). */
function tickDiseases(w: World, n: number): void {
  for (let i = 0; i < n; i++) { w.s.tick++; w.goblinHash.rebuild(w.s.goblins); updateDiseases(w); w.bus.flush(); }
}
function run(w: World, g: Goblin, a: UtilityAction, max = 2000): string {
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
const withVigor = (g: Goblin, v: number) => { g.genome.vigor = { a: v, b: v }; return g; };

describe('Disease (P6.1, §14.3)', () => {
  it('runs its course: hidden incubation, symptoms, then recovery with immunity', () => {
    const w = makeWorld();
    const g = spawnGoblin(w);
    const evs = events(w);
    expect(infect(w, g, 'spotted_fever')).toBe(true);
    expect(g.health.disease).toMatchObject({ id: 'spotted_fever', stage: 'incubating' });
    expect(isSick(g)).toBe(false);
    g.mood.value = 0; // mood's own hand in work speed aside (P8.1)
    expect(workMul(g)).toBe(1);
    tickDiseases(w, 2 * DAY + 2);
    expect(isSick(g)).toBe(true);
    expect(evs.some((e) => e.type === 'fell_ill' && e.goblinId === g.id)).toBe(true);
    // symptoms: slower work, bigger appetite
    expect(workMul(g)).toBeCloseTo(0.6, 5);
    expect(diseaseHungerMul(g)).toBeCloseTo(1.2, 5);
    expect(needDecay(g, 'hunger', 'summer')).toBeGreaterThan(0);
    const saved = D.spotted_fever!.mortality;
    D.spotted_fever!.mortality = 0;
    try { tickDiseases(w, 8 * DAY); } finally { D.spotted_fever!.mortality = saved; }
    expect(g.health.disease).toBeNull();
    expect(evs.some((e) => e.type === 'recovered' && e.goblinId === g.id)).toBe(true);
    expect(g.health.immune.spotted_fever).toBeGreaterThan(w.s.tick + 30 * DAY);
    expect(infect(w, g, 'spotted_fever')).toBe(false); // immune
    expect(g.health.hp).toBeGreaterThanOrEqual(CFG.health.drainFloor);
  });

  it('can kill: a certain-death fever ends in a grave with cause "disease"', () => {
    const w = makeWorld();
    const g = spawnGoblin(w);
    const saved = D.spotted_fever!.mortality;
    D.spotted_fever!.mortality = 1;
    try { infect(w, g, 'spotted_fever'); tickDiseases(w, 9 * DAY); } finally { D.spotted_fever!.mortality = saved; }
    expect(w.goblin(g.id)).toBeUndefined();
    expect(w.s.graves.at(-1)).toMatchObject({ goblinId: g.id, cause: 'disease' });
  });

  it('spreads by contact, more to the frail than the vigorous; not to those far away', () => {
    let frail = 0, sturdy = 0, far = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const w = makeWorld({ seed });
      const sick = spawnGoblin(w, { pos: { x: 12, y: 12 } });
      const a = withVigor(spawnGoblin(w, { pos: { x: 12.8, y: 12 } }), 0.8);
      const b = withVigor(spawnGoblin(w, { pos: { x: 11.2, y: 12 } }), 1.2);
      const c = spawnGoblin(w, { pos: { x: 20, y: 20 } });
      infect(w, sick, 'spotted_fever');
      sick.health.disease!.stage = 'sick';
      tickDiseases(w, DAY / 2);
      frail += a.health.disease ? 1 : 0;
      sturdy += b.health.disease ? 1 : 0;
      far += c.health.disease ? 1 : 0;
    }
    expect(frailty(withVigor(spawnGoblin(makeWorld()), 0.8))).toBeCloseTo(1.5, 5);
    expect(frail).toBeGreaterThan(sturdy);
    expect(frail).toBeGreaterThan(5);
    expect(far).toBe(0);
  });

  it('comes from the weather and bad food: shivers at freezing, sniffles from a cold soaking, gut rot from redcaps', () => {
    const w = makeWorld();
    const g = spawnGoblin(w);
    g.needs.warmth = 0;
    const tick = () => { w.s.tick++; g.needs.warmth = 0; updateDiseases(w); };
    for (let i = 0; i < CFG.health.shiverTicks - 1; i++) tick();
    expect(g.health.disease).toBeNull();
    tick();
    expect(g.health.disease).toMatchObject({ id: 'shivers', stage: 'sick' });
    // sniffles: wet and chilly for a day
    let sniffles = 0;
    for (let seed = 1; seed <= 10; seed++) {
      const v = makeWorld({ seed });
      const x = spawnGoblin(v);
      for (let i = 0; i < DAY; i++) { v.s.tick++; x.wetUntil = v.s.tick + 100; x.needs.warmth = 30; updateDiseases(v); }
      if (x.health.disease?.id === 'sniffles') sniffles++;
    }
    expect(sniffles).toBeGreaterThan(2);
  });

  it('a sick goblin lies down in its hut; resting and a friend\'s care speed recovery', () => {
    const w = makeWorld();
    const g = spawnGoblin(w, { pos: { x: 12, y: 12 } }), f = spawnGoblin(w, { pos: { x: 18, y: 12 } });
    const hut = placeBlueprint(w, 'hut', { x: 15, y: 15 }, null);
    completeBuilding(w, hut, null);
    claim(w, g, hut);
    infect(w, g, 'gut_rot');
    g.health.disease!.stage = 'sick';
    const base = recoveryRate(g, w);
    expect(RestSick.isAvailable(g, w)).toBe(true);
    expect(RestSick.score(g, w)).toBeGreaterThan(0.4);
    g.activity = { action: 'rest_sick', status: 'running', startedTick: w.s.tick, targetId: null, target: null, path: [], progress: 0, stage: 0 };
    RestSick.start(g, w);
    for (let i = 0; i < 400 && g.activity.stage === 0; i++) RestSick.step(g, w);
    expect(g.activity.stage).toBe(1);
    expect(Math.hypot(g.pos.x - hut.pos.x, g.pos.y - hut.pos.y)).toBeLessThan(1.5);
    expect(recoveryRate(g, w)).toBeCloseTo(base * CFG.health.restMul, 5);
    // a friend comes and sits with it
    relate(f, g.id).opinion = 50;
    expect(TendSick.isAvailable(f, w)).toBe(true);
    expect(patientFor(f, w)).toBe(g);
    const evs = events(w);
    expect(run(w, f, TendSick)).toBe('done');
    expect(evs.some((e) => e.type === 'tended' && e.goblinId === g.id && e.byId === f.id)).toBe(true);
    expect(g.health.tendedUntil).toBeGreaterThan(w.s.tick);
    expect(recoveryRate(g, w)).toBeCloseTo(base * CFG.health.restMul * CFG.health.tendMul, 5);
    expect(patientFor(f, w)).toBeNull(); // tended for today
    // strangers don't
    const s = spawnGoblin(w, { pos: { x: 14, y: 14 } });
    g.health.tendedUntil = 0;
    expect(patientFor(s, w)).toBeNull();
  });

  it('survives a save and load mid-illness', () => {
    const w = makeWorld();
    const g = spawnGoblin(w);
    infect(w, g, 'sniffles');
    tickDiseases(w, DAY + 10);
    const back = deserialize(serialize(w.s));
    expect(back.goblins.find((x) => x.id === g.id)!.health.disease).toEqual(g.health.disease);
  });
});
