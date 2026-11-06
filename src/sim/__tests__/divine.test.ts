import { describe, expect, it } from 'vitest';
import { CFG } from '../config';
import { clockAt } from '../time';
import { setWeather } from '../weather';
import { completeBuilding, placeBlueprint } from '../buildings';
import { earnedTier, speechCost, strokeCost, tierNeeds, updateTier } from '../god/tiers';
import { obedience, wishScore } from '../god/wishes';
import { powerDef } from '../god/cast';
import { scoreActions } from '../ai/utility';
import { Chop } from '../ai/actions/chop';
import { Wander } from '../ai/actions/wander';
import { zoneAt } from '../god/zones';
import { stateHash } from '../save';
import { makeWorld, placePlant, spawnGoblin } from './helpers';
import type { Command } from '../commands';
import type { Goblin } from '../state';
import type { World } from '../world';
import type { ParsedIntent, SimEvent, Tone } from '../../shared/types';

const DAY = CFG.time.dayTicks, HOUR = CFG.god.hourTicks, G = CFG.god, D = CFG.divine;

function at(w: World, tick: number): void {
  w.s.tick = tick;
  w.clock = clockAt(tick);
  setWeather(w, 'clear');
  w.s.weather.nextChangeTick = tick + 100 * DAY;
}
const send = (w: World, cmd: Command): SimEvent[] => {
  w.push(cmd);
  return w.step();
};
const rejected = (evs: SimEvent[]) => evs.find((e) => e.type === 'command_rejected') as { reason: string } | undefined;
const say = (to: number[] | 'all', intents: ParsedIntent[], tone: Tone = 'kind'): Command =>
  ({ type: 'divine_speech', addressees: to, tone, intents, isQuestion: false, source: 'sign' });
const believers = (w: World, n: number, faith = 60): Goblin[] => Array.from({ length: n }, (_, i) => {
  const g = spawnGoblin(w, { pos: { x: 6 + (i % 8), y: 8 + Math.floor(i / 8) } });
  g.godView.faith = faith;
  return g;
});
const divine = (w: World, favor = 200) => { w.s.god.mode = 'divine'; w.s.god.favor = favor; };

describe('Divine mode (§17.6, §17.9, P8.9)', () => {
  it('tiers: believers, a shrine, average faith, a temple; earned at once, lost only after a while', () => {
    const w = makeWorld({ size: 40 });
    divine(w);
    at(w, 2 * DAY);
    const gs = believers(w, 3, 30);
    expect(earnedTier(w)).toBe(0);
    for (const g of gs) g.godView.faith = 45;
    expect(earnedTier(w)).toBe(1);
    believers(w, 3, 45);
    expect(earnedTier(w)).toBe(1); // six believe, but no shrine yet
    expect(tierNeeds(w, 2).find((x) => x.kind === 'shrine')).toMatchObject({ have: 0, need: 1 });
    completeBuilding(w, placeBlueprint(w, 'shrine', { x: 20, y: 20 }, null), null);
    expect(earnedTier(w)).toBe(2);
    believers(w, 4, 60);
    expect(earnedTier(w)).toBe(3); // ten believe, average 51
    const evs: SimEvent[] = [];
    w.bus.subscribe((e) => evs.push(e));
    updateTier(w);
    w.bus.flush();
    expect(w.s.god.tier).toBe(3);
    expect(evs.some((e) => e.type === 'tier_changed' && e.tier === 3 && e.from === 0)).toBe(true);
    for (const g of w.s.goblins) g.godView.faith = 20; // belief collapses
    for (let h = 0; h < D.relockHours; h++) { at(w, w.s.tick + HOUR); updateTier(w); }
    expect(w.s.god.tier).toBe(3); // held a while
    at(w, w.s.tick + HOUR);
    updateTier(w);
    expect(w.s.god.tier).toBe(0);
    w.s.god.mode = 'sandbox';
    w.s.god.tier = 0;
    for (const g of w.s.goblins) g.godView.faith = 90;
    updateTier(w);
    expect(w.s.god.tier).toBe(0); // only Divine mode keeps tiers
  });

  it('costs: the Gift Tray by tier and value, brushes per tile, powers by tier; Sandbox is free', () => {
    const w = makeWorld({ size: 30 });
    divine(w, 10);
    expect(rejected(send(w, { type: 'god_spawn_item', item: 'berry', qty: 1, pos: { x: 10, y: 10 } }))?.reason).toBe('locked');
    expect(rejected(send(w, { type: 'god_spawn_item', item: 'apple', qty: 3, pos: { x: 10, y: 10 } }))).toBeUndefined();
    expect(w.s.god.favor).toBe(10 - 3 * 2);
    expect(rejected(send(w, { type: 'god_spawn_item', item: 'stone', qty: 2, pos: { x: 10, y: 10 } }))?.reason).toBe('no_favor');
    expect(rejected(send(w, { type: 'god_power', power: 'raise_land', pos: { x: 15, y: 15 }, radius: 2 }))?.reason).toBe('locked');
    w.s.god.tier = 1;
    w.s.god.favor = 50;
    const c = strokeCost(w, powerDef('raise_land')!, { x: 15, y: 15 }, 2);
    expect(c).toBeGreaterThan(1);
    expect(c).toBeLessThan(5);
    send(w, { type: 'god_power', power: 'raise_land', pos: { x: 15, y: 15 }, radius: 2 });
    expect(w.s.god.favor).toBeCloseTo(50 - c, 4);
    expect(rejected(send(w, { type: 'god_spawn_item', item: 'berry', qty: 1, pos: { x: 10, y: 10 } }))).toBeUndefined();
    expect(rejected(send(w, { type: 'god_spawn_item', item: 'spear', qty: 1, pos: { x: 10, y: 10 } }))?.reason).toBe('locked');
    w.s.god.mode = 'sandbox';
    w.s.god.favor = 0;
    expect(rejected(send(w, { type: 'god_spawn_item', item: 'spear', qty: 1, pos: { x: 10, y: 10 } }))).toBeUndefined();
  });

  it('the voice: one goblin, a group (tier 2), all (tier 3, 40 % off with a shaman); faith, tone, the overheard', () => {
    const w = makeWorld({ size: 40 });
    divine(w, 100);
    at(w, 2 * DAY + DAY / 3);
    const [a, b] = believers(w, 2, 50);
    const far = spawnGoblin(w, { pos: { x: 34, y: 34 } });
    far.godView.faith = 50;
    a!.godView.love = 30;
    expect(rejected(send(w, say([a!.id, b!.id], [{ intent: 'rest' }])))?.reason).toBe('locked');
    expect(rejected(send(w, say('all', [{ intent: 'rest' }])))?.reason).toBe('locked');
    const evs = send(w, say([a!.id], [{ intent: 'gather', target: { kind: 'item', value: 'wood' } }], 'kind'));
    expect(rejected(evs)).toBeUndefined();
    expect(w.s.god.favor).toBe(100 - G.voiceCost.single);
    expect(a!.godView.faith).toBe(50 + D.heard.first);
    expect(a!.godView.love).toBe(30 + D.tone.kind.love);
    expect(b!.godView.faith).toBe(50 + D.heard.first); // standing by, it heard too
    expect(b!.godView.wishes.length).toBe(0); // but the wish was not for it
    expect(far.godView.faith).toBe(50);
    expect(evs.some((e) => e.type === 'first_voice' && e.goblinId === a!.id)).toBe(true);
    expect(evs.some((e) => e.type === 'god_spoke' && e.addressees.length === 1)).toBe(true);
    const wish = a!.godView.wishes[0]!;
    expect(wish).toMatchObject({ intent: 'gather', source: 'sign', expiresTick: w.s.tick - 1 + G.wishTicks.sign });
    a!.godView.wishes = [];
    send(w, say([a!.id], [{ intent: 'rest' }], 'wrathful'));
    expect(a!.godView.faith).toBe(50 + D.heard.first + D.heard.faith);
    w.s.god.tier = 3;
    expect(speechCost(w, 'all')).toBe(G.voiceCost.all);
    a!.role = 'shaman';
    expect(speechCost(w, 'all')).toBeCloseTo(G.voiceCost.all * (1 - G.shamanVoiceDiscount), 4);
    w.s.god.favor = 100;
    send(w, say('all', [{ intent: 'worship' }]));
    expect(w.s.god.favor).toBeCloseTo(100 - G.voiceCost.all * (1 - G.shamanVoiceDiscount), 4);
    expect(far.godView.wishes.some((x) => x.intent === 'worship')).toBe(true);
  });

  it('wishes: obedience sets the pull on matching actions; survival first; kept wishes reward; defiance', () => {
    const w = makeWorld({ size: 40 });
    at(w, 2 * DAY + DAY / 3);
    const [g] = believers(w, 1, 80);
    g!.godView.love = 60;
    g!.personality.mischief = 0;
    g!.personality.piety = 0.5;
    const ob = obedience(g!, w);
    expect(ob).toBeCloseTo(0.8 * (0.5 + 0.3) * 1.2, 4);
    w.s.god.alignment = -60;
    expect(obedience(g!, w)).toBeCloseTo(Math.min(1, ob * D.wrathObey), 4);
    w.s.god.alignment = 0;
    placePlant(w, 'tree', 'mature', { x: 12, y: 12 });
    g!.godView.wishes = [{ id: 1, intent: 'gather', target: { kind: 'item', value: 'wood' }, issuedTick: w.s.tick, expiresTick: w.s.tick + DAY, strength: 0.6, source: 'sign' }];
    expect(wishScore(g!, w, 'chop', 0.2)).toBeCloseTo(0.2 + G.wishBonus * 0.6, 4);
    expect(wishScore(g!, w, 'mine', 0.2)).toBe(0.2); // wood, not stone
    g!.needs.hunger = 2;
    expect(wishScore(g!, w, 'chop', 0.2)).toBe(0.2); // eats first
    g!.needs.hunger = 90;
    expect(Chop.isAvailable(g!, w)).toBe(true);
    const row = scoreActions(g!, w, false).find((r) => r.id === 'chop');
    g!.godView.wishes[0]!.strength = 0;
    const plain = scoreActions(g!, w, false).find((r) => r.id === 'chop');
    expect(row?.final ?? 0).toBeGreaterThan(plain?.final ?? 0); // no wood wanted: only the wish makes it chop
    g!.godView.wishes[0]!.strength = 0.6;
    // a chop finished: fulfilled
    const evs: SimEvent[] = [];
    w.bus.subscribe((e) => evs.push(e));
    const f0 = g!.godView.faith, l0 = g!.godView.love;
    g!.activity = { action: 'chop', status: 'running', startedTick: w.s.tick, targetId: null, target: null, path: [], progress: 0, stage: 0 };
    const real = Chop.step;
    Chop.step = () => 'done';
    try { w.step(); } finally { Chop.step = real; }
    expect(g!.godView.wishes.length).toBe(0);
    expect(g!.godView.faith).toBeCloseTo(Math.min(100, f0 + D.fulfilled.faith), 1);
    expect(g!.godView.love).toBeCloseTo(l0 + D.fulfilled.love, 1);
    expect(evs.some((e) => e.type === 'wish_fulfilled' && e.intent === 'gather')).toBe(true);
    // a mischief-maker that does not love the god defies now and then, and shakes a fist
    w.s.god.mode = 'sandbox';
    const imps = Array.from({ length: 30 }, (_, i) => {
      const x = spawnGoblin(w, { pos: { x: 4 + (i % 6) * 5, y: 26 + Math.floor(i / 6) * 2 } });
      x.godView.faith = 60;
      x.godView.love = 0;
      x.personality.mischief = 1;
      return x;
    });
    send(w, say(imps.map((x) => x.id), [{ intent: 'rest' }]));
    const defied = imps.filter((x) => x.godView.wishes[0]?.defied);
    expect(defied.length).toBeGreaterThan(2);
    expect(defied.length).toBeLessThan(18);
    expect(defied.every((x) => x.godView.wishes[0]!.expiresTick - x.godView.wishes[0]!.issuedTick === G.wishTicks.sign * D.defyShare)).toBe(true);
    expect(defied.some((x) => x.activity.action === 'shake_fist')).toBe(true);
    expect(wishScore(defied[0]!, w, 'idle', 0.2)).toBeCloseTo(0.2 * D.defyMul, 4);
  });

  it('build marks out the building and plans it; come here; avoid keeps only the addressees out; stop', () => {
    const w = makeWorld({ size: 40 });
    w.s.god.mode = 'sandbox';
    at(w, 2 * DAY + DAY / 3);
    const [g, h] = believers(w, 2, 90);
    for (const x of [g!, h!]) { x.godView.love = 80; x.personality.mischief = 0; }
    send(w, say([g!.id], [{ intent: 'build', target: { kind: 'building', value: 'hut' } }]));
    const bp = w.s.buildings.find((b) => b.type === 'hut');
    expect(bp).toBeDefined();
    expect(g!.goalStack.some((e) => e.goal.kind === 'build' && e.goal.buildingId === bp!.id)).toBe(true);
    send(w, say([h!.id], [{ intent: 'build', target: { kind: 'building', value: 'hut' } }]));
    expect(w.s.buildings.filter((b) => b.type === 'hut').length).toBe(1); // the waiting one, not another
    expect(rejected(send(w, say([g!.id], [{ intent: 'build', target: { kind: 'building', value: 'temple' } }])))?.reason).toBe('unknown_recipe');
    // come here
    g!.godView.wishes = [];
    send(w, say([g!.id], [{ intent: 'come_here', target: { kind: 'pos', value: 0, pos: { x: 30, y: 30 } } }]));
    g!.activity = { action: 'wander', status: 'running', startedTick: w.s.tick, targetId: null, target: null, path: [], progress: 0, stage: 0 };
    expect(Wander.start(g!, w)).toBe(true);
    expect(g!.activity.target).toEqual({ x: 30, y: 30 });
    expect(rejected(send(w, say([g!.id], [{ intent: 'come_here' }])))?.reason).toBe('bad_target');
    // avoid: a place only h keeps out of
    send(w, say([h!.id], [{ intent: 'avoid', target: { kind: 'pos', value: 0, pos: { x: 20, y: 20 } } }]));
    expect(zoneAt(w, { x: 20, y: 20 }, h!)?.kind).toBe('shun');
    expect(zoneAt(w, { x: 20, y: 20 }, g!)).toBeNull();
    expect(zoneAt(w, { x: 20, y: 20 })).toBeNull();
    // stop: what it was doing scores less for a while
    g!.godView.wishes = [];
    g!.activity = { action: 'wander', status: 'running', startedTick: w.s.tick, targetId: null, target: null, path: [], progress: 0, stage: 0 };
    send(w, say([g!.id], [{ intent: 'stop' }], 'stern'));
    expect(g!.godView.wishes[0]!.target).toEqual({ kind: 'action', value: 'wander' });
    expect(wishScore(g!, w, 'wander', 0.3)).toBeLessThan(0.3);
  });

  it('the same seed and the same words give the same world', () => {
    const run = () => {
      const w = makeWorld({ size: 32, goblins: 6 });
      for (const g of w.s.goblins) g.godView.faith = 70;
      for (let t = 0; t < 1200; t++) {
        if (t === 50) w.push(say(w.s.goblins.slice(0, 3).map((g) => g.id), [{ intent: 'gather', target: { kind: 'item', value: 'wood' } }, { intent: 'worship' }], 'stern'));
        if (t === 400) w.push(say('all', [{ intent: 'come_here', target: { kind: 'pos', value: 0, pos: { x: 12.333, y: 20.777 } } }], 'playful'));
        w.step();
      }
      return stateHash(w.s);
    };
    expect(run()).toBe(run());
  });
});
