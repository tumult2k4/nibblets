import { describe, expect, it } from 'vitest';
import { CFG } from '../config';
import { fertilityMul, hydrationCurve } from '../plants';
import { makeWorld, placePlant, runTicks, setMorning } from './helpers';

const DAY = CFG.time.dayTicks;

describe('plant lifecycle (§8.1)', () => {
  it('growth curves hit the documented anchors', () => {
    expect(hydrationCurve(0)).toBeCloseTo(0.25);
    expect(hydrationCurve(0.6)).toBeCloseTo(1);
    expect(hydrationCurve(1)).toBeCloseTo(1.5);
    expect(fertilityMul(0.6)).toBeCloseTo(1);
    expect(fertilityMul(0)).toBe(0.5);
    expect(fertilityMul(1)).toBe(1.3);
  });

  it('a seed becomes a mature apple bush in about 5 days (spring speeds it up)', () => {
    const w = makeWorld();
    setMorning(w, 1);
    const p = placePlant(w, 'apple_bush', 'seed', { x: 12.5, y: 12.5 });
    p.age = 0;
    p.hydration = 0.75; // matches 0.6 moisture × 0.8 equilibrium closely enough
    const seen = new Set<string>();
    const n = runTicks(w, DAY * 8, () => (seen.add(p.stage), p.stage === 'mature'));
    expect([...seen]).toEqual(['seed', 'sprout', 'sapling', 'young', 'mature']);
    expect(n / DAY).toBeGreaterThan(3);
    expect(n / DAY).toBeLessThan(6.5);
  });

  it('nothing grows in winter', () => {
    const w = makeWorld();
    setMorning(w, CFG.time.daysPerSeason * 3 + 1);
    expect(w.clock.season).toBe('winter');
    const p = placePlant(w, 'apple_bush', 'sprout', { x: 12.5, y: 12.5 });
    runTicks(w, DAY);
    expect(p.stage).toBe('sprout');
    expect(p.growth).toBe(0);
  });

  it('old bushes die into wood; stumps either coppice or vanish', () => {
    const w = makeWorld({ seed: 3 });
    setMorning(w, 1);
    const old = placePlant(w, 'apple_bush', 'old', { x: 12.5, y: 12.5 });
    old.age = CFG.plants.oldUntilDays - 0.01;
    runTicks(w, 40);
    expect(w.s.plants.includes(old)).toBe(false);
    expect(w.s.groundItems.some((i) => i.stack.type === 'wood')).toBe(true);
    let regrew = 0;
    for (let k = 0; k < 20; k++) {
      const st = placePlant(w, 'apple_bush', 'stump', { x: 6 + k * 0.7, y: 18 });
      st.growth = CFG.plants.stumpRegrowDays - 0.001;
      runTicks(w, 12);
      if (st.stage === 'sprout' && w.s.plants.includes(st)) regrew++;
    }
    expect(regrew).toBeGreaterThan(0);
    expect(regrew).toBeLessThan(20);
  });

  it('growing plants draw fertility, which regenerates daily', () => {
    const w = makeWorld();
    setMorning(w, 1);
    const p = placePlant(w, 'apple_bush', 'seed', { x: 12.5, y: 12.5 });
    const tile = w.s.tiles[12 * 24 + 12]!;
    const f0 = tile.fertility;
    runTicks(w, DAY / 2);
    expect(tile.fertility).toBeLessThan(f0);
    expect(p.stage).not.toBe('seed');
  });
});
