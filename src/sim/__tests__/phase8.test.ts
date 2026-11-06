import { describe, expect, it } from 'vitest';
import { CFG } from '../config';
import { clockAt } from '../time';
import { setWeather } from '../weather';
import { deposit } from '../stockpile';
import { openPrayer } from '../god/prayers';
import { defianceChance } from '../god/wishes';
import { Pray } from '../ai/actions/pray';
import { makeWorld, spawnGoblin } from './helpers';
import type { UtilityAction } from '../ai/action';
import type { Goblin } from '../state';
import type { World } from '../world';
import type { SimEvent } from '../../shared/types';

const DAY = CFG.time.dayTicks, HOUR = CFG.god.hourTicks, FA = CFG.faith;

function at(w: World, tick: number): void {
  w.s.tick = tick;
  w.clock = clockAt(tick);
  setWeather(w, 'clear');
  w.s.weather.nextChangeTick = tick + 100 * DAY;
}
function run(a: UtilityAction, g: Goblin, w: World, max = 2000): string {
  g.activity = { action: a.id, status: 'running', startedTick: w.s.tick, targetId: null, target: null, path: [], progress: 0, stage: 0 };
  if (!a.start(g, w)) return 'failed';
  let r = 'running';
  for (let i = 0; i < max && r === 'running'; i++) { r = a.step(g, w); w.s.tick++; }
  if (r !== 'running') g.activity.status = r as 'done' | 'failed';
  return r;
}

describe('Phase 8 acceptance (§22 P8)', () => {
  it('prayer test: a starving goblin prays; god food dropped near it before expiry answers it, faith +15', () => {
    const w = makeWorld({ size: 40 });
    at(w, 2 * DAY + DAY / 3);
    const g = spawnGoblin(w, { pos: { x: 26, y: 26 } });
    g.godView.faith = 50;
    g.needs.hunger = 4;
    g.godView.direSince = w.s.tick - (FA.prayer.hours + 1) * HOUR; // starving for hours
    expect(Pray.isAvailable(g, w)).toBe(true);
    expect(run(Pray, g, w)).toBe('done');
    const p = openPrayer(g, w)!;
    expect(p).toMatchObject({ kind: 'food', desperate: true });
    const f0 = g.godView.faith;
    w.push({ type: 'god_spawn_item', item: 'apple', qty: 3, pos: { x: g.pos.x + 1, y: g.pos.y } });
    const evs: SimEvent[] = [];
    for (let i = 0; i < 40; i++) evs.push(...w.step());
    expect(w.s.tick).toBeLessThan(p.expiresTick);
    expect(evs.some((e) => e.type === 'prayer_answered' && e.goblinId === g.id && e.kind === 'food')).toBe(true);
    expect(openPrayer(g, w)).toBeUndefined();
    expect(g.godView.faith - f0).toBeGreaterThanOrEqual(FA.prayer.answered.faith);
  });

  it('wish test: "build hut" signed to a faithful goblin with wood in store: it starts building within an hour', () => {
    const w = makeWorld({ size: 40 });
    at(w, 2 * DAY + DAY / 3);
    deposit(w.s, { type: 'wood', qty: 30 });
    const g = spawnGoblin(w, { pos: { x: 18, y: 18 } });
    Object.assign(g.godView, { faith: 90, love: 80 });
    g.personality.mischief = 0;
    g.personality.piety = 0.8;
    const t0 = w.s.tick;
    w.push({ type: 'divine_speech', addressees: [g.id], tone: 'kind', intents: [{ intent: 'build', target: { kind: 'building', value: 'hut' } }], isQuestion: false, source: 'sign' });
    let started = -1;
    for (let i = 0; i < HOUR && started < 0; i++) {
      w.step();
      if (['deliver_material', 'build', 'gather_for_goal'].includes(g.activity.action)) started = w.s.tick - t0;
    }
    expect(w.s.buildings.some((b) => b.type === 'hut')).toBe(true);
    expect(started).toBeGreaterThan(0);
    expect(started).toBeLessThanOrEqual(HOUR);
  });

  it('defiance matches its formula, 0.25 × mischief × (1 − love/100) (statistical)', () => {
    const w = makeWorld({ size: 64 });
    at(w, 2 * DAY + DAY / 3);
    const gs = Array.from({ length: 360 }, (_, i) => {
      const g = spawnGoblin(w, { pos: { x: 4 + (i % 30) * 2, y: 4 + Math.floor(i / 30) * 4 } });
      g.godView.faith = 60;
      g.godView.love = [0, 20, 50, 80][i % 4]!;
      g.personality.mischief = [1, 0.8, 0.5, 0.2, 0.9, 0.6][i % 6]!;
      return g;
    });
    const p = gs.map((g) => defianceChance(g)); // before hearing (its love changes with the tone)
    w.push({ type: 'divine_speech', addressees: 'all', tone: 'stern', intents: [{ intent: 'rest' }], isQuestion: false, source: 'sign' });
    w.step();
    const seen = gs.filter((g) => g.godView.wishes.some((x) => x.defied)).length;
    const mean = p.reduce((a, x) => a + x, 0), sd = Math.sqrt(p.reduce((a, x) => a + x * (1 - x), 0));
    expect(mean).toBeGreaterThan(25);
    expect(Math.abs(seen - mean)).toBeLessThan(3.5 * sd);
  });
});
