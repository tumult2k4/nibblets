import { describe, expect, it } from 'vitest';
import { CFG } from '../config';
import { infect, recoveryRate } from '../disease';
import { RestSick, TendSick } from '../ai/actions/care';
import { SleepHome, claim } from '../ai/actions/home';
import { relate } from '../goblin/social';
import { completeBuilding, placeBlueprint } from '../buildings';
import { addItem, countItem } from '../inventory';
import { deposit, stockCount } from '../stockpile';
import { chooseCraft, finishCraft } from '../crafting';
import { discoveryChance, learn } from '../knowledge';
import { RECIPES } from '../recipes';
import { REMEDY, needsRemedy } from '../remedy';
import { apartSpot, quarantined, sickHut } from '../quarantine';
import { applyCommands, validate } from '../commands';
import { dist } from '../../shared/math';
import { makeWorld, spawnGoblin } from './helpers';
import type { UtilityAction } from '../ai/action';
import type { Goblin } from '../state';
import type { World } from '../world';
import type { SimEvent } from '../../shared/types';

const H = CFG.health;

function events(w: World): SimEvent[] {
  const evs: SimEvent[] = [];
  w.bus.subscribe((e) => evs.push(e));
  return evs;
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
const hut = (w: World, x: number, y: number) => { const b = placeBlueprint(w, 'hut', { x, y }, null); completeBuilding(w, b, null); return b; };

describe('Herbal remedy and quarantine (P6.5, §14.3)', () => {
  it('is an idea to be had with glowcap and berries at hand, sooner while someone is ill', () => {
    const w = makeWorld();
    const g = spawnGoblin(w, { pos: { ...w.s.village.stockpilePos } });
    expect(RECIPES.herbal_remedy).toMatchObject({ inputs: { glowcap: 1, berry: 2 }, output: REMEDY, known: false });
    expect(g.knownRecipes).not.toContain('herbal_remedy');
    expect(discoveryChance(g, w, 'herbal_remedy')).toBe(0);
    addItem(g, { type: 'glowcap', qty: 1 });
    deposit(w.s, { type: 'berry', qty: 4 });
    const p = discoveryChance(g, w, 'herbal_remedy');
    expect(p).toBeGreaterThan(0);
    const sick = spawnGoblin(w, { pos: { x: 6, y: 6 } });
    infect(w, sick, 'gut_rot');
    sick.health.disease!.stage = 'sick';
    expect(discoveryChance(g, w, 'herbal_remedy')).toBeCloseTo(p * H.remedyIdeaMul, 6);
  });

  it('crafters keep a couple in store, and make one first when someone ill goes without', () => {
    const w = makeWorld();
    const g = spawnGoblin(w, { pos: { ...w.s.village.stockpilePos } });
    learn(w, g, 'herbal_remedy', 'discovery');
    deposit(w.s, { type: 'glowcap', qty: 2 });
    deposit(w.s, { type: 'berry', qty: 6 });
    const calm = chooseCraft(g, w);
    const sick = spawnGoblin(w, { pos: { x: 6, y: 6 } });
    infect(w, sick, 'sniffles');
    sick.health.disease!.stage = 'sick';
    const urgent = chooseCraft(g, w)!;
    expect(urgent.id).toBe('herbal_remedy');
    expect(urgent.value).toBeGreaterThan(calm?.id === 'herbal_remedy' ? calm.value : 0);
    addItem(g, { type: 'glowcap', qty: 1 });
    addItem(g, { type: 'berry', qty: 2 });
    expect(finishCraft(w, g, 'herbal_remedy')?.type).toBe(REMEDY);
    expect(countItem(g, 'glowcap') + countItem(g, 'berry')).toBe(0);
    deposit(w.s, { type: REMEDY, qty: H.remedyTarget });
    removeAll(g);
    expect(chooseCraft(g, w)?.id).not.toBe('herbal_remedy'); // the store is full
  });

  it('a dose makes the illness run twice as fast; the sick fetch one from the store on the way to bed', () => {
    const w = makeWorld();
    const g = spawnGoblin(w, { pos: { x: 8, y: 16 } });
    claim(w, g, hut(w, 8, 19));
    infect(w, g, 'gut_rot');
    g.health.disease!.stage = 'sick';
    deposit(w.s, { type: REMEDY, qty: 2 });
    const before = recoveryRate(g, w);
    const evs = events(w);
    g.activity = { action: 'rest_sick', status: 'running', startedTick: w.s.tick, targetId: null, target: null, path: [], progress: 0, stage: 0 };
    expect(RestSick.start(g, w)).toBe(true);
    expect(g.activity.stage).toBe(2);
    for (let i = 0; i < 600 && g.activity.stage !== 1; i++) { RestSick.step(g, w); w.s.tick++; }
    w.bus.flush();
    expect(g.health.disease!.remedy).toBe(true);
    expect(stockCount(w.s, REMEDY)).toBe(1);
    expect(evs.some((e) => e.type === 'took_remedy' && e.goblinId === g.id && e.byId === null)).toBe(true);
    expect(dist(g.pos, { x: 8, y: 19 })).toBeLessThan(1); // then home to lie down
    expect(recoveryRate(g, w) / before).toBeCloseTo(H.remedyMul * H.restMul, 3);
    expect(needsRemedy(g)).toBe(false);
  });

  it('a carer brings a dose from the store and gives it at the bedside', () => {
    const w = makeWorld();
    const p = spawnGoblin(w, { pos: { x: 8, y: 8 } }), f = spawnGoblin(w, { pos: { x: 16, y: 16 } });
    relate(f, p.id).opinion = 60;
    infect(w, p, 'sniffles');
    p.health.disease!.stage = 'sick';
    deposit(w.s, { type: REMEDY, qty: 1 });
    const evs = events(w);
    expect(TendSick.isAvailable(f, w)).toBe(true);
    expect(run(w, f, TendSick)).toBe('done');
    expect(p.health.disease!.remedy).toBe(true);
    expect(stockCount(w.s, REMEDY) + countItem(f, REMEDY)).toBe(0);
    expect(evs.some((e) => e.type === 'took_remedy' && e.goblinId === p.id && e.byId === f.id)).toBe(true);
  });

  it('under quarantine the contagious sleep and rest in an empty hut, or lie out apart', () => {
    const w = makeWorld({ size: 32 });
    const g = spawnGoblin(w, { pos: { x: 16, y: 16 } }), mate = spawnGoblin(w, { pos: { x: 15, y: 16 } });
    const home = hut(w, 12, 12);
    claim(w, g, home);
    claim(w, mate, home);
    const empty = hut(w, 22, 22);
    infect(w, g, 'sniffles');
    g.health.disease!.stage = 'sick';
    w.s.god.mode = 'sandbox';
    expect(quarantined(g, w)).toBe(false);
    w.push({ type: 'sandbox', op: { op: 'set_policy', policy: 'quarantine', on: true } });
    applyCommands(w);
    expect(w.s.village.policies?.quarantine).toBe(true);
    expect(quarantined(g, w)).toBe(true);
    expect(quarantined(mate, w)).toBe(false);
    expect(sickHut(g, w)).toBe(empty);
    g.needs.energy = 20;
    g.activity = { action: 'sleep_home', status: 'running', startedTick: w.s.tick, targetId: null, target: null, path: [], progress: 0, stage: 0 };
    expect(SleepHome.isAvailable(g, w)).toBe(true);
    expect(SleepHome.start(g, w)).toBe(true);
    expect(g.activity.targetId).toBe(empty.id);
    expect(RestSick.score(g, w)).toBeGreaterThanOrEqual(H.quarantineRest);
    expect(run(w, g, RestSick, 400)).not.toBe('failed');
    expect(dist(g.pos, empty.pos)).toBeLessThan(1);
    // gut rot doesn't spread by contact: no quarantine for it
    g.health.disease = { id: 'gut_rot', stage: 'sick', progress: 0, since: w.s.tick };
    expect(quarantined(g, w)).toBe(false);
    // no empty hut: somewhere apart from everyone
    g.health.disease = { id: 'sniffles', stage: 'sick', progress: 0, since: w.s.tick };
    claim(w, mate, empty);
    expect(sickHut(g, w)).toBeNull();
    expect(SleepHome.isAvailable(g, w)).toBe(false);
    const spot = apartSpot(g, w)!;
    for (const o of w.s.goblins) if (o !== g) expect(dist(o.pos, spot)).toBeGreaterThanOrEqual(H.apartFrom);
    // the policy is the chief's to set (P8); until then only the sandbox can
    w.s.god.mode = 'divine';
    expect(validate(w, { type: 'sandbox', op: { op: 'set_policy', policy: 'quarantine', on: false } })).toBe('sandbox_only');
  });
});

function removeAll(g: Goblin): void {
  g.inventory = g.inventory.filter((s) => s.type !== REMEDY);
}
