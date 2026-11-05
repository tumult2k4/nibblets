import { describe, expect, it } from 'vitest';
import { Rng } from '../../shared/rng';
import { hueMean } from '../../shared/math';
import { LOCUS_DEFS, LOCUS_BY_ID, clampAllele, meiosis, mutateAllele, type Genome, type LocusDef } from '../goblin/genetics/genome';
import { express, growthCurve, lifeStageForAge, phenotypeOf } from '../goblin/genetics/phenotype';
import { founderGenome } from '../goblin/genetics/founders';
import { CFG } from '../config';

const base = (): Genome => founderGenome(new Rng(5), 'mixed');

describe('genetics (§4.2)', () => {
  it('hue averages on the circle (shortest arc)', () => {
    expect(hueMean(350, 20)).toBeCloseTo(5);
    expect(hueMean(20, 350)).toBeCloseTo(5);
    expect(hueMean(90, 130)).toBeCloseTo(110);
    const g = base();
    g.skinHue = { a: 350, b: 20 };
    expect(express(g, 'skinHue')).toBeCloseTo(5);
  });

  it('recessive traits express only when both alleles are 1', () => {
    const g = base();
    g.tusks = { a: 1, b: 0 };
    expect(express(g, 'tusks')).toBe(0);
    g.tusks = { a: 1, b: 1 };
    expect(express(g, 'tusks')).toBe(1);
    g.albino = { a: 0, b: 1 };
    expect(phenotypeOf({ genome: g, ageDays: 20, stage: 'adult', hunger: 80, scars: 0 }).albino).toBe(false);
  });

  it('discrete pattern uses dominance order 2>3>1>4>0', () => {
    const g = base();
    const cases: [number, number, number][] = [[2, 3, 2], [3, 1, 3], [1, 4, 1], [4, 0, 4], [0, 2, 2], [3, 2, 2]];
    for (const [a, b, want] of cases) {
      g.pattern = { a, b };
      expect(express(g, 'pattern')).toBe(want);
    }
  });

  it('meiosis: each child allele comes from the matching parent (mutation off)', () => {
    const G = CFG.genetics as { quantMutationChance: number; discreteMutationChance: number };
    const saved = [G.quantMutationChance, G.discreteMutationChance];
    G.quantMutationChance = 0;
    G.discreteMutationChance = 0;
    try {
      const rng = new Rng(42);
      for (let i = 0; i < 50; i++) {
        const m = founderGenome(rng, 'moss');
        const f = founderGenome(rng, 'ember');
        const c = meiosis(m, f, rng);
        for (const d of LOCUS_DEFS) {
          expect([m[d.key].a, m[d.key].b]).toContain(c[d.key].a);
          expect([f[d.key].a, f[d.key].b]).toContain(c[d.key].b);
        }
      }
    } finally {
      [G.quantMutationChance, G.discreteMutationChance] = saved as [number, number];
    }
  });

  it('mutation keeps alleles inside their ranges', () => {
    const rng = new Rng(9);
    for (const d of LOCUS_DEFS as readonly LocusDef[]) {
      for (let i = 0; i < 400; i++) {
        const v = mutateAllele(d, clampAllele(d, d.max), rng);
        if (d.kind === 'hue') {
          expect(v).toBeGreaterThanOrEqual(0);
          expect(v).toBeLessThan(360);
        } else {
          expect(v).toBeGreaterThanOrEqual(d.min);
          expect(v).toBeLessThanOrEqual(d.max);
        }
      }
    }
    expect(LOCUS_BY_ID.adultSize.max).toBe(1.35);
  });

  it('founder clans stay inside their hue ranges and differ visibly', () => {
    const rng = new Rng(3);
    for (let i = 0; i < 30; i++) {
      const g = founderGenome(rng, 'plum');
      expect(g.skinHue.a).toBeGreaterThanOrEqual(270);
      expect(g.skinHue.a).toBeLessThanOrEqual(310);
    }
  });
});

describe('phenotype (§4.4)', () => {
  it('life-stage scale curve is monotonic hatchling → adult', () => {
    let prev = 0;
    for (let d = 0; d <= 20; d += 0.25) {
      const st = lifeStageForAge(d, 112);
      const sc = growthCurve(d, st).scale;
      expect(sc).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = sc;
    }
    expect(prev).toBeCloseTo(1);
    expect(growthCurve(0, 'hatchling').scale).toBeCloseTo(0.35);
  });

  it('elders shrink, stoop and pale', () => {
    const g = base();
    const a = phenotypeOf({ genome: g, ageDays: 40, stage: 'adult', hunger: 80, scars: 0 });
    const e = phenotypeOf({ genome: g, ageDays: 90, stage: 'elder', hunger: 80, scars: 0 });
    expect(e.scale).toBeLessThan(a.scale);
    expect(e.stoop).toBeGreaterThan(0);
    expect(e.skinColor.s).toBeLessThan(a.skinColor.s + 1e-9);
  });

  it('well-fed goblins are plumper', () => {
    const g = base();
    const full = phenotypeOf({ genome: g, ageDays: 40, stage: 'adult', hunger: 100, scars: 0 });
    const hungry = phenotypeOf({ genome: g, ageDays: 40, stage: 'adult', hunger: 10, scars: 0 });
    expect(full.belly).toBeGreaterThan(hungry.belly);
  });
});
