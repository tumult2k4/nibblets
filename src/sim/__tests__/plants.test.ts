import { setWeather } from '../weather';
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
    setWeather(w, 'cloudy'); // fixed hydration: no rain spells
    w.s.weather.nextChangeTick = w.s.tick + 100 * DAY;
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

describe('other plants (§8.2, P2.5)', () => {
  it('berry bushes regrow berries quickly; goblins sometimes seed new ones by eating', async () => {
    const { spawnGoblin, HOUR } = await import('./helpers');
    const w = makeWorld({ size: 32 });
    setMorning(w, 1);
    const b = placePlant(w, 'berry_bush', 'mature', { x: 20.5, y: 20.5 }, 0);
    runTicks(w, DAY * 2);
    expect(b.fruit).toBe(CFG.plants.maxBerries);
    const g = spawnGoblin(w);
    const before = w.s.plants.filter((p) => p.kind === 'berry_bush').length;
    for (let i = 0; i < 160; i++) { // 5% per berry: 160 tries keep the odds of zero seeds negligible
      g.inventory = [{ type: 'berry', qty: 1 }];
      g.needs.hunger = 30;
      runTicks(w, HOUR / 2, () => g.inventory.length === 0);
    }
    expect(w.s.plants.filter((p) => p.kind === 'berry_bush').length).toBeGreaterThan(before);
  });

  it('flowers slowly spread in the warm seasons', () => {
    const w = makeWorld({ size: 32 });
    setMorning(w, 1);
    for (let i = 0; i < 10; i++) placePlant(w, 'flower', 'mature', { x: 6.5 + i * 2, y: 20.5 });
    runTicks(w, DAY * 6);
    expect(w.s.plants.filter((p) => p.kind === 'flower').length).toBeGreaterThan(10);
  });
});
