import { describe, expect, it } from 'vitest';
import { CFG } from '../../sim/config';
import { hueBins, sampleStats } from '../../sim/stats';
import { killGoblin } from '../../sim/goblin/needs';
import { deposit } from '../../sim/stockpile';
import { learn } from '../../sim/knowledge';
import { deserialize, serialize } from '../../sim/save';
import { statsData } from '../statsData';
import { niceMax } from '../chart';
import { makeWorld, spawnGoblin } from '../../sim/__tests__/helpers';

describe('stats panel series (P7.6)', () => {
  it('samples store days, what the village knows and the skin-hue mix; logs deaths by cause', () => {
    const w = makeWorld({ size: 24 });
    const gs = [0, 1, 2, 3].map(() => spawnGoblin(w, { pos: { x: 12.5, y: 12.5 } }));
    deposit(w.s, { type: 'dried_apple', qty: 40 });
    learn(w, gs[0]!, 'sling', 'discovery');
    sampleStats(w);
    const a = w.s.stats.samples[w.s.stats.samples.length - 1]!;
    expect(a.pop).toBe(4);
    expect(a.days).toBeGreaterThan(0);
    expect(a.known).toBeGreaterThanOrEqual(1);
    expect(a.hues).toHaveLength(CFG.stats.hueBins);
    expect(a.hues!.reduce((n, k) => n + k, 0)).toBe(4);
    expect(hueBins(w.s)).toEqual(a.hues);
    w.s.tick += CFG.stats.sampleEvery;
    killGoblin(w, gs[1]!, 'old_age');
    w.s.tick += CFG.stats.sampleEvery;
    killGoblin(w, gs[2]!, 'combat');
    killGoblin(w, gs[3]!, 'combat');
    sampleStats(w);
    expect(w.s.stats.deathLog).toHaveLength(3);
    const d = statsData(w.s);
    expect(d.days).toHaveLength(2);
    expect(d.pop).toEqual([4, 1]);
    expect(d.deaths.map((x) => x.cause)).toEqual(['combat', 'old_age']);
    expect(d.deaths.find((x) => x.cause === 'combat')!.values).toEqual([0, 2]);
    expect(d.hues.reduce((n, band) => n + band[1]!, 0)).toBeCloseTo(1);
    // the log and the new sample fields survive a save
    const back = deserialize(serialize(w.s));
    expect(back.stats.deathLog).toEqual(w.s.stats.deathLog);
    expect(back.stats.samples[1]!.hues).toEqual(w.s.stats.samples[1]!.hues);
  });

  it('thins long series to the chart width and keeps the last point; picks round axis tops', () => {
    const w = makeWorld({ size: 24 });
    spawnGoblin(w, { pos: { x: 12.5, y: 12.5 } });
    for (let i = 0; i < 500; i++) { sampleStats(w); w.s.tick += CFG.stats.sampleEvery; }
    const d = statsData(w.s, 120);
    expect(d.days.length).toBeLessThanOrEqual(121);
    expect(d.days[d.days.length - 1]).toBeCloseTo(w.s.stats.samples[499]!.tick / CFG.time.dayTicks);
    expect([niceMax(0), niceMax(3), niceMax(17), niceMax(20), niceMax(0.4)]).toEqual([1, 5, 20, 20, 0.5]);
  });
});
