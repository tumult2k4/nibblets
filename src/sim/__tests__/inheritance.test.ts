import { describe, expect, it } from 'vitest';
import { CFG } from '../config';
import { Rng } from '../../shared/rng';
import { hueDelta } from '../../shared/math';
import { founderGenome } from '../goblin/genetics/founders';
import { meiosis, type Genome } from '../goblin/genetics/genome';
import { express, growthCurve, lifeStageForAge } from '../goblin/genetics/phenotype';
import { updateEggs } from '../eggs';
import { allocId } from '../../shared/ids';
import { makeWorld, spawnGoblin } from './helpers';
import { clockAt } from '../time';
import { setWeather } from '../weather';
import type { Egg } from '../state';

/** Turn mutation off for the length of `fn` (the doc's "before mutation"). */
function noMutation(fn: () => void): void {
  const G = CFG.genetics as { quantMutationChance: number; discreteMutationChance: number };
  const saved = [G.quantMutationChance, G.discreteMutationChance] as const;
  G.quantMutationChance = G.discreteMutationChance = 0;
  try { fn(); } finally { [G.quantMutationChance, G.discreteMutationChance] = saved; }
}

describe('inheritance statistics (Phase 5 acceptance, §20.2)', () => {
  it('1,000 crosses of tusk carrier × tusk carrier: about a quarter tusked (±4 %), half carriers', () => {
    const rng = new Rng(2024);
    const mk = (): Genome => { const g = founderGenome(rng, 'mixed'); g.tusks = { a: 1, b: 0 }; return g; };
    let tusked = 0, carriers = 0;
    const N = 1000;
    for (let i = 0; i < N; i++) {
      const c = meiosis(mk(), mk(), rng);
      if (express(c, 'tusks') === 1) tusked++;
      else if (c.tusks.a + c.tusks.b === 1) carriers++;
    }
    expect(Math.abs(tusked / N - 0.25)).toBeLessThanOrEqual(0.04);
    expect(Math.abs(carriers / N - 0.5)).toBeLessThanOrEqual(0.05);
  });

  it('a child\'s hue lies on the shorter arc between its parents\' hues (before mutation)', () => {
    noMutation(() => {
      const rng = new Rng(77);
      for (let i = 0; i < 300; i++) {
        const h1 = rng.range(0, 360), h2 = rng.range(0, 360);
        const a = founderGenome(rng, 'mixed'), b = founderGenome(rng, 'mixed');
        a.skinHue = { a: h1, b: h1 };
        b.skinHue = { a: h2, b: h2 };
        const h = express(meiosis(a, b, rng), 'skinHue');
        // on the short arc: its distances to both parents add up to the parents' distance
        const span = Math.abs(hueDelta(h1, h2));
        expect(Math.abs(hueDelta(h1, h)) + Math.abs(hueDelta(h, h2))).toBeCloseTo(span, 3);
        expect(Math.abs(hueDelta(h1, h))).toBeCloseTo(span / 2, 3); // homozygous parents: right in the middle
      }
    });
  });

  it('an egg kept warm hatches in two days; the hatchling is grown by day 16 and full size two days later', () => {
    const w = makeWorld();
    const DAY = CFG.time.dayTicks;
    w.s.tick = 40 * DAY + Math.round(0.4 * DAY); // summer
    w.clock = clockAt(w.s.tick);
    setWeather(w, 'clear');
    w.s.weather.nextChangeTick = w.s.tick + 100 * DAY;
    const a = spawnGoblin(w), b = spawnGoblin(w);
    const egg: Egg = { id: allocId(w.s), pos: { x: 12, y: 12 }, genome: meiosis(a.genome, b.genome, w.rng), parents: [a.id, b.id], laidTick: w.s.tick, warmth: 1, incubation: 0, airborne: null };
    w.s.eggs.push(egg);
    // a parent sits on it the whole time
    a.pos = { x: 12.3, y: 12 };
    a.activity = { action: 'incubate_egg', status: 'running', startedTick: w.s.tick, targetId: egg.id, target: null, path: [], progress: 0, stage: 1 };
    let t = 0;
    for (; t < 3 * DAY && w.s.eggs.includes(egg); t += 10) { w.s.tick += 10; w.clock = clockAt(w.s.tick); updateEggs(w); }
    expect(w.s.eggs.includes(egg)).toBe(false);
    expect(t).toBeLessThanOrEqual(CFG.family.incubateDays * DAY + 20);
    expect(w.s.goblins.some((g) => g.parents?.[0] === a.id && g.lifeStage === 'hatchling')).toBe(true);
    // growth: a continuous curve to adult size
    const S = CFG.goblin.stageDays, life = 100;
    expect(lifeStageForAge(S.youngling - 0.01, life)).toBe('youngling');
    expect(lifeStageForAge(S.youngling, life)).toBe('adult');
    expect(growthCurve(S.youngling, 'adult').scale).toBeCloseTo(CFG.stages.younglingEnd.scale, 4);
    expect(growthCurve(S.youngling + 2, 'adult').scale).toBe(CFG.stages.adult.scale);
    let prev = 0;
    for (let d = 0; d <= S.youngling + 2; d += 0.5) {
      const s = growthCurve(d, lifeStageForAge(d, life)).scale;
      expect(s).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = s;
    }
  });
});
