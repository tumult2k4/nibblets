import { describe, expect, it } from 'vitest';
import { registerLineage } from '../goblin/family';
import { clanStats, generations, meanHue, RECESSIVE } from '../goblin/lineage';
import { express } from '../goblin/genetics/phenotype';
import { deserialize, serialize } from '../save';
import { CFG } from '../config';
import { makeWorld, spawnGoblin } from './helpers';
import type { Goblin, LineageEntry } from '../state';
import type { World } from '../world';

/** A goblin entered into the lineage book, with these parents. */
function born(w: World, parents: [Goblin, Goblin] | null = null): Goblin {
  const g = spawnGoblin(w);
  g.parents = parents ? [parents[0].id, parents[1].id] : null;
  registerLineage(w.s, g);
  return g;
}

describe('lineage book (P5.8)', () => {
  it('remembers clan, true skin color and recessive copies, so carriers stay known after death', () => {
    const w = makeWorld();
    expect(RECESSIVE).toEqual(expect.arrayContaining(['tusks', 'albino']));
    const a = spawnGoblin(w), b = spawnGoblin(w);
    a.genome.tusks = { a: 1, b: 0 };
    a.genome.albino = { a: 0, b: 0 };
    b.genome.albino = { a: 1, b: 1 };
    b.genome.tusks = { a: 0, b: 0 };
    registerLineage(w.s, a);
    registerLineage(w.s, b);
    const ea = w.s.lineage[a.id]!, eb = w.s.lineage[b.id]!;
    expect(ea.clan).toBe(a.clanId);
    expect(ea.rec).toEqual({ tusks: 1, albino: 0 });
    expect(eb.rec).toEqual({ tusks: 0, albino: 2 });
    expect(ea.skin![0]).toBeCloseTo(express(a.genome, 'skinHue'), 3);
    expect(ea.skin![1]).toBeCloseTo(express(a.genome, 'skinSat'), 3);
    expect(eb.skin![1]).toBeLessThan(0.1); // an albino is pale whatever its hue genes say
    expect(eb.skin![2]).toBeGreaterThan(0.8);
    // the entry is a snapshot: it outlives the goblin
    w.s.goblins = w.s.goblins.filter((g) => g !== a);
    ea.died = w.s.tick;
    expect(w.s.lineage[a.id]!.rec!.tusks).toBe(1);
  });

  it('counts generations from the founders and sums up each clan', () => {
    const w = makeWorld();
    const a = born(w), b = born(w), d = born(w);
    const c = born(w, [a, b]);
    const e = born(w, [c, d]);
    const f = born(w, [d, e]); // a parent and its grandchild's line: one past the older generation
    const gen = generations(w.s);
    expect([a, b, d].map((g) => gen.get(g.id))).toEqual([0, 0, 0]);
    expect(gen.get(c.id)).toBe(1);
    expect(gen.get(e.id)).toBe(2);
    expect(gen.get(f.id)).toBe(3);
    const cs = clanStats(w.s);
    const mine = cs.find((x) => x.id === a.clanId)!;
    expect(mine.generations).toBe(4);
    expect(mine.descendants).toBe(3);
    expect(mine.living).toBe(6);
    expect(mine.avgHue).toBeCloseTo(meanHue(w.s.goblins.map((g) => express(g.genome, 'skinHue')))!, 4);
    // unknown parents (an entry missing from the book) count as a founder
    w.s.lineage[c.id]!.parents = [9999, 9998];
    expect(generations(w.s).get(c.id)).toBe(0);
  });

  it('averages hues round the circle', () => {
    expect(meanHue([])).toBeNull();
    const m = meanHue([350, 10])!;
    expect(Math.min(m, 360 - m)).toBeLessThan(1e-6);
    expect(meanHue([80, 100])).toBeCloseTo(90, 6);
  });

  it('v13 saves gain clan, skin and carrier counts for the living; the dead keep what they had', () => {
    const w = makeWorld();
    const a = born(w), b = born(w);
    w.s.lineage[b.id]!.died = 5;
    w.s.goblins = w.s.goblins.filter((g) => g !== b);
    const raw = JSON.parse(serialize(w.s)) as { version: number; lineage: Record<number, Partial<LineageEntry>> };
    expect(raw.version).toBe(CFG.saveVersion);
    raw.version = 13;
    for (const e of Object.values(raw.lineage)) { delete e.clan; delete e.skin; delete e.rec; }
    const s = deserialize(JSON.stringify(raw));
    expect(s.lineage[a.id]!.skin).toBeDefined();
    expect(s.lineage[a.id]!.rec).toEqual({ tusks: a.genome.tusks.a + a.genome.tusks.b, albino: a.genome.albino.a + a.genome.albino.b });
    expect(s.lineage[a.id]!.died).toBeNull();
    expect(s.lineage[b.id]!.rec).toBeUndefined();
    expect(s.lineage[b.id]!.died).toBe(5);
  });
});
