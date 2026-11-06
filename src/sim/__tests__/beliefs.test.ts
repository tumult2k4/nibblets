import { describe, expect, it } from 'vitest';
import { CFG } from '../config';
import { clockAt } from '../time';
import { setWeather } from '../weather';
import { completeBuilding, placeBlueprint } from '../buildings';
import { addMood } from '../goblin/mood';
import { safetyTarget } from '../goblin/safety';
import { dangerAt, markDanger } from '../danger';
import { giveTrinket } from '../trinkets';
import { discoveryChance } from '../knowledge';
import { beliefMul, beliefsOf, updateSuperstitions } from '../superstitions';
import { offer, totemWantsPaint, wantsShrine } from '../shrine';
import { villageNeeds } from '../ai/actions/village';
import { Pray } from '../ai/actions/pray';
import { PlayMusic } from '../ai/actions/festival';
import { makeWorld, spawnGoblin } from './helpers';
import type { Building, Goblin } from '../state';
import type { World } from '../world';
import type { BuildingType, SimEvent, SimEventInput } from '../../shared/types';

const DAY = CFG.time.dayTicks, B = CFG.beliefs;

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
const pious = (w: World, n: number): Goblin[] => Array.from({ length: n }, (_, i) => {
  const g = spawnGoblin(w, { pos: { x: 14 + i, y: 14 } });
  g.personality.piety = 1;
  return g;
});
/** On day `d`: an omen at noon and, an hour later, a turn of luck; then the scan. */
function coincidence(w: World, d: number, omen: SimEventInput, luck: SimEventInput | null): void {
  at(w, d * DAY + DAY / 2);
  w.emit(omen);
  at(w, d * DAY + DAY / 2 + 200);
  if (luck) w.emit(luck);
  at(w, d * DAY + DAY / 2 + 300);
  updateSuperstitions(w);
  w.bus.flush();
}
const MERRY: SimEventInput = { type: 'festival', kind: 'merrymaking', phase: 'end' };
const RAIN: SimEventInput = { type: 'weather_changed', from: 'clear', to: 'rain' };

describe('superstitions, the shrine and the totem (P8.6, §15.4)', () => {
  it('a festival thrice followed by rain becomes a belief; it sways the pious, and cheers them when it comes round', () => {
    const w = makeWorld({ size: 30 });
    const [g] = pious(w, 4);
    const evs = events(w);
    let d = 1;
    for (; d < 30 && !beliefsOf(w).length; d++) coincidence(w, d, MERRY, RAIN);
    expect(d).toBeGreaterThan(B.need); // never before the third time
    const b = beliefsOf(w)[0]!;
    expect([b.omen, b.luck, b.valence]).toEqual(['festival', 'rain', 1]);
    expect(evs.some((e) => e.type === 'superstition_formed' && e.omen === 'festival' && e.luck === 'rain')).toBe(true);
    expect(w.s.village.culture?.formed).toBe(1);
    // a lucky omen comes round: the pious take heart
    coincidence(w, d + 1, MERRY, null);
    expect(g!.mood.modifiers.some((m) => m.id === 'good_omen')).toBe(true);
  });

  it('a belief sways what a goblin does by its piety, and fades when the omen keeps coming without the luck', () => {
    const w = makeWorld({ size: 30 });
    const [g] = pious(w, 2);
    const doubter = spawnGoblin(w);
    doubter.personality.piety = 0;
    w.s.village.culture = { beliefs: [{ omen: 'music', luck: 'raid', valence: -1, formed: 0, strength: B.start }] };
    expect(beliefMul(w, g!, 'music')).toBeCloseTo(1 - B.sway, 4);
    expect(beliefMul(w, doubter, 'music')).toBe(1);
    expect(beliefMul(w, g!, 'festival')).toBe(1);
    const fear = PlayMusic.score(g!, w);
    w.s.village.culture.beliefs![0]!.valence = 1;
    expect(PlayMusic.score(g!, w)).toBeGreaterThan(fear);
    const evs = events(w);
    for (let d = 1; d <= B.start + 1; d++) coincidence(w, d, { type: 'emote', goblinId: g!.id, emote: 'music' }, null);
    expect(beliefsOf(w)).toHaveLength(0);
    expect(evs.some((e) => e.type === 'superstition_faded' && e.omen === 'music')).toBe(true);
  });

  it('Pray: a pious goblin kneels at the shrine, comes away comforted and lays its trinket on the bare shrine', () => {
    const w = makeWorld({ size: 30 });
    const shrine = station(w, 'shrine', 20, 20);
    const g = spawnGoblin(w, { pos: { x: 16, y: 18 } });
    g.personality.piety = 0.8;
    const faith = g.godView.faith;
    const t = giveTrinket(w, g, 'common');
    at(w, 2 * DAY + DAY / 3);
    expect(Pray.isAvailable(g, w)).toBe(true);
    g.activity = { action: 'pray', status: 'running', startedTick: w.s.tick, targetId: null, target: null, path: [], progress: 0, stage: 0 };
    expect(Pray.start(g, w)).toBe(true);
    let r = 'running';
    for (let i = 0; i < 800 && r === 'running'; i++) { r = Pray.step(g, w); w.s.tick++; }
    expect(r).toBe('done');
    expect(g.mood.modifiers.some((m) => m.id === 'prayed')).toBe(true);
    expect(g.godView.faith).toBeGreaterThan(faith);
    expect(shrine.decoration).toEqual([t.id]);
    expect(g.trinkets).not.toContain(t.id);
    expect(w.s.village.culture?.signs?.some(([, k]) => k === 'offering')).toBe(true);
    expect(w.s.village.culture?.signs?.some(([, k]) => k === 'prayer')).toBe(true);
    expect(Pray.isAvailable(g, w)).toBe(false); // once a day
    // a second trinket stays with it unless it believes offerings bring luck
    giveTrinket(w, g, 'common'); giveTrinket(w, g, 'common');
    expect(offer(w, g, shrine)).toBe(false);
    w.s.village.culture!.beliefs = [{ omen: 'offering', luck: 'hatching', valence: 1, formed: 0, strength: 3 }];
    expect(offer(w, g, shrine)).toBe(true);
    expect(shrine.decoration).toHaveLength(2);
  });

  it('the ideas: a shrine to the faithful with a trinket, a totem to the painted; and the village plans them', () => {
    const w = makeWorld({ size: 40 });
    const gs = pious(w, 6);
    const g = gs[0]!;
    g.godView.faith = 50;
    at(w, CFG.beliefs.shrine.day * DAY + DAY / 3);
    expect(discoveryChance(g, w, 'shrine')).toBe(0);
    giveTrinket(w, g, 'common');
    expect(discoveryChance(g, w, 'shrine')).toBeGreaterThan(0);
    expect(discoveryChance(g, w, 'totem')).toBe(0);
    addMood(w, g, 'war_paint', 5, DAY);
    expect(discoveryChance(g, w, 'totem')).toBeGreaterThan(0);
    // a pious chief puts the shrine first
    station(w, 'hut', 12, 12);
    station(w, 'campfire', 20, 20);
    expect(wantsShrine(w)).toBe(false);
    g.knownRecipes.push('shrine');
    expect(wantsShrine(w)).toBe(true);
    expect(villageNeeds(w)).toContain('shrine');
    w.s.tick++;
    w.s.village.policies = { shrine: true };
    expect(villageNeeds(w)[0]).toBe('shrine');
    // a totem site waits on its war paint
    placeBlueprint(w, 'totem', { x: 26, y: 26 }, null);
    expect(totemWantsPaint(w)).toBe(true);
  });

  it('the totem: danger weighs less within eight tiles, and goblins there feel safer', () => {
    const w = makeWorld({ size: 40 });
    const g = spawnGoblin(w, { pos: { x: 20, y: 21 } });
    at(w, 2 * DAY + DAY / 3);
    markDanger(w, { x: 20, y: 20 }, 1);
    const danger = dangerAt(w, { x: 20, y: 20 }), safe = safetyTarget(g, w);
    station(w, 'totem', 22, 22);
    w.s.tick++;
    expect(dangerAt(w, { x: 20, y: 20 })).toBeCloseTo(danger * (1 - B.totem.calm), 3);
    expect(safetyTarget(g, w)).toBeGreaterThan(safe);
  });
});
