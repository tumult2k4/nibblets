import { describe, expect, it } from 'vitest';
import { CFG } from '../config';
import { clockAt } from '../time';
import { setWeather } from '../weather';
import { completeBuilding, placeBlueprint } from '../buildings';
import { deposit } from '../stockpile';
import { chooseShaman, nameGod, shamanOf } from '../god/shaman';
import { divineAct } from '../god/faith';
import { faithOf } from '../god/faithState';
import { openPrayer } from '../god/prayers';
import { Pray } from '../ai/actions/pray';
import { LeadPrayer, MakeOffering, ShakeFist } from '../ai/actions/devotions';
import { makeWorld, spawnGoblin } from './helpers';
import type { UtilityAction } from '../ai/action';
import type { Building, Goblin } from '../state';
import type { World } from '../world';
import type { BuildingType, SimEvent } from '../../shared/types';

const DAY = CFG.time.dayTicks, FA = CFG.faith;

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
function station(w: World, type: BuildingType, x: number, y: number): Building {
  const b = placeBlueprint(w, type, { x, y }, null);
  completeBuilding(w, b, null);
  return b;
}
/** Run one action to its end, ticking the clock along. */
function run(a: UtilityAction, g: Goblin, w: World, max = 2000): string {
  g.activity = { action: a.id, status: 'running', startedTick: w.s.tick, targetId: null, target: null, path: [], progress: 0, stage: 0 };
  if (!a.start(g, w)) return 'failed';
  let r = 'running';
  for (let i = 0; i < max && r === 'running'; i++) { r = a.step(g, w); w.s.tick++; }
  return r;
}
const devout = (w: World, n: number, x = 14): Goblin[] => Array.from({ length: n }, (_, i) => {
  const g = spawnGoblin(w, { pos: { x: x + i, y: 14 } });
  g.personality.piety = 0.7;
  g.godView.faith = 50;
  return g;
});

describe('the shaman, offerings and the god\'s name (§17.4, P8.8)', () => {
  it('the most faithful pious grown goblin becomes shaman; a rival needs a clear lead; never the chief', () => {
    const w = makeWorld({ size: 30 });
    const evs = events(w);
    const [a, b, c] = devout(w, 3);
    a!.godView.faith = 60;
    b!.godView.faith = 70;
    c!.godView.faith = 90;
    c!.role = 'chief';
    w.s.village.chiefId = c!.id;
    expect(chooseShaman(w)).toBe(b);
    w.bus.flush();
    expect(evs.some((e) => e.type === 'shaman_chosen' && e.goblinId === b!.id)).toBe(true);
    a!.godView.faith = 75; // not enough of a lead
    expect(chooseShaman(w)).toBe(b);
    a!.godView.faith = 70 + FA.shaman.margin + 1;
    expect(chooseShaman(w)).toBe(a);
    expect(b!.role).toBe('none');
    expect(shamanOf(w)).toBe(a);
  });

  it('the shaman names the god once three believe, after what it has mostly done and its temper', () => {
    const w = makeWorld({ size: 30 });
    const gs = devout(w, 3);
    chooseShaman(w);
    expect(nameGod(w)).toBeNull(); // the god has done nothing yet
    for (let i = 0; i < 3; i++) divineAct(w, 'apple_shower', gs[0]!.pos, undefined, false, { area: 6 });
    divineAct(w, 'lightning', { x: 2, y: 2 }, undefined, false);
    w.s.god.alignment = 30;
    expect(nameGod(w)).toBe('@giver.kind');
    expect(w.s.god.godName).toBe('@giver.kind');
    expect(nameGod(w)).toBeNull(); // named once
  });

  it('LeadPrayer: the shaman gathers the devout; they come (×3), pray, and earn more favor', () => {
    const w = makeWorld({ size: 40 });
    const evs = events(w);
    const shrine = station(w, 'shrine', 20, 20);
    const [sh, f1, f2] = devout(w, 3, 16);
    at(w, 3 * DAY + Math.round(0.4 * DAY));
    chooseShaman(w);
    expect(sh!.role).toBe('shaman');
    expect(LeadPrayer.isAvailable(sh!, w)).toBe(true);
    f1!.mood.modifiers.push({ id: 'prayed', amount: 5, expiresTick: w.s.tick + DAY }); // prayed this morning
    const before = Pray.score(f1!, w);
    sh!.activity = { action: 'lead_prayer', status: 'running', startedTick: w.s.tick, targetId: null, target: null, path: [], progress: 0, stage: 0 };
    expect(LeadPrayer.start(sh!, w)).toBe(true);
    let r = 'running';
    for (let i = 0; i < 200 && sh!.activity.stage === 0; i++) { r = LeadPrayer.step(sh!, w); w.s.tick++; }
    expect(r).toBe('running');
    const ga = faithOf(w.s).gathering!;
    expect(ga.buildingId).toBe(shrine.id);
    w.bus.flush();
    expect(evs.some((e) => e.type === 'group_prayer' && e.goblinId === sh!.id)).toBe(true);
    expect(Pray.isAvailable(f1!, w)).toBe(true); // the call brings it even so
    expect(Pray.score(f1!, w)).toBeGreaterThan(before);
    w.s.god.favor = 0;
    expect(run(Pray, f2!, w)).toBe('done');
    const led = w.s.god.favor;
    expect(openPrayer(f2!, w)).toBeDefined();
    expect(LeadPrayer.isAvailable(sh!, w)).toBe(false); // one at a time
    // the same prayer, unled, earns less
    faithOf(w.s).gathering = null;
    const lone = devout(w, 1, 22)[0]!;
    lone.godView.faith = f2!.godView.faith;
    lone.personality.piety = f2!.personality.piety;
    w.s.god.favor = 0;
    expect(run(Pray, lone, w)).toBe('done');
    expect(w.s.god.favor).toBeLessThan(led);
  });

  it('MakeOffering: food from the store laid at the shrine; desperate prayer anywhere; the angry shake a fist instead', () => {
    const w = makeWorld({ size: 40 });
    const evs = events(w);
    const shrine = station(w, 'shrine', 20, 20);
    shrine.decoration.push(999); // already dressed
    const [g] = devout(w, 1, 16);
    deposit(w.s, { type: 'apple', qty: 40 });
    at(w, 3 * DAY + Math.round(0.4 * DAY));
    expect(MakeOffering.isAvailable(g!, w)).toBe(true);
    expect(run(MakeOffering, g!, w)).toBe('done');
    w.bus.flush();
    expect(evs.some((e) => e.type === 'offering' && e.item === 'apple')).toBe(true);
    expect(faithOf(w.s).offerings.some((o) => o.item === 'apple' && o.buildingId === shrine.id)).toBe(true);
    expect(MakeOffering.isAvailable(g!, w)).toBe(false); // not again for a while
    // in despair, far from the shrine: it prays where it stands
    const lost = spawnGoblin(w, { pos: { x: 36, y: 36 } });
    lost.needs.thirst = 5;
    lost.godView.direSince = w.s.tick - (FA.prayer.hours + 1) * CFG.god.hourTicks;
    expect(Pray.isAvailable(lost, w)).toBe(true);
    const pos = { ...lost.pos };
    expect(run(Pray, lost, w)).toBe('done');
    expect(lost.pos).toEqual(pos);
    expect(openPrayer(lost, w)?.desperate).toBe(true);
    expect(openPrayer(lost, w)?.kind).toBe('water');
    // a goblin of little piety angry with the god: no prayer, a fist at the sky
    const sore = spawnGoblin(w, { pos: { x: 18, y: 18 } });
    sore.personality.piety = 0.35;
    sore.godView.faith = 60;
    expect(Pray.isAvailable(sore, w)).toBe(true);
    sore.godView.angryAtGod = true;
    expect(Pray.isAvailable(sore, w)).toBe(false);
    expect(ShakeFist.isAvailable(sore, w)).toBe(true);
    expect(run(ShakeFist, sore, w)).toBe('done');
    expect(sore.mood.modifiers.some((m) => m.id === 'shook_fist')).toBe(true);
    expect(ShakeFist.isAvailable(sore, w)).toBe(false);
  });
});
