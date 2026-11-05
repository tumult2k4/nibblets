/** Founder gene pools per clan archetype (§4.3). */
import type { Rng } from '../../../shared/rng';
import { CFG } from '../../config';
import { LOCUS_DEFS, clampAllele, type Genome, type LocusDef, type LocusId } from './genome';

export type ClanArchetype = 'moss' | 'ember' | 'tide' | 'plum' | 'mixed';
export const CLAN_ARCHETYPES: readonly ClanArchetype[] = ['mixed', 'moss', 'ember', 'tide', 'plum'];

interface ClanSpec {
  hue: [number, number];
  size: [number, number];
  /** per-locus [lo, hi] overrides for sampling */
  ranges: Partial<Record<LocusId, [number, number]>>;
  /** discrete pattern allele weights (index = pattern value) */
  patternWeights: number[];
  tuskFreq: number;
}

const BASE_PATTERN = [3, 1, 1, 1, 1];
export const CLAN_SPECS: Record<ClanArchetype, ClanSpec> = {
  moss: {
    hue: [90, 140], size: [0.9, 1.05], tuskFreq: 0.1, patternWeights: [2, 4, 1, 1, 1],
    ranges: { earLength: [1.15, 1.6], t_wanderlust: [0.55, 0.95] },
  },
  ember: {
    hue: [10, 35], size: [1.05, 1.25], tuskFreq: 0.4, patternWeights: BASE_PATTERN,
    ranges: { t_bravery: [0.55, 0.95], skinSat: [0.5, 0.85] },
  },
  tide: {
    hue: [170, 210], size: [0.85, 1.0], tuskFreq: 0.1, patternWeights: [2, 1, 1, 4, 1],
    ranges: { t_sociability: [0.55, 0.95], coldTolerance: [0.55, 1.0] },
  },
  plum: {
    hue: [270, 310], size: [0.8, 0.95], tuskFreq: 0.1, patternWeights: [2, 1, 4, 1, 1],
    ranges: { noseSize: [1.15, 1.5], t_mischief: [0.55, 0.95] },
  },
  mixed: { hue: [0, 360], size: [0.75, 1.35], tuskFreq: 0.25, patternWeights: BASE_PATTERN, ranges: {} },
};

function weighted(rng: Rng, w: number[]): number {
  const total = w.reduce((a, b) => a + b, 0);
  let r = rng.next() * total;
  for (let i = 0; i < w.length; i++) {
    r -= w[i]!;
    if (r < 0) return i;
  }
  return w.length - 1;
}

/** Sample one founder genome; every allele is drawn independently around the clan's ranges. */
export function founderGenome(rng: Rng, arch: ClanArchetype): Genome {
  const spec = CLAN_SPECS[arch];
  const g = {} as Genome;
  for (const def of LOCUS_DEFS as readonly LocusDef[]) {
    const draw = (): number => {
      switch (def.key) {
        case 'skinHue': return rng.range(spec.hue[0], spec.hue[1]);
        case 'adultSize': return rng.range(spec.size[0], spec.size[1]);
        case 'pattern': return weighted(rng, spec.patternWeights);
        case 'tusks': return rng.chance(spec.tuskFreq) ? 1 : 0;
        case 'albino': return rng.chance(CFG.genetics.albinoFounderFreq) ? 1 : 0;
        case 'skinLight': return rng.range(0.32, 0.62);
        default: {
          const r = spec.ranges[def.key];
          if (r) return rng.range(r[0], r[1]);
          if (def.kind === 'hue') return rng.range(0, 360);
          if (def.kind === 'discrete' || def.kind === 'recessive') return rng.int(def.min, def.max);
          // quantitative: centered sample, avoids extremes so offspring can still drift
          const mid = (def.min + def.max) / 2;
          const half = (def.max - def.min) / 2;
          return mid + rng.range(-0.8, 0.8) * half;
        }
      }
    };
    g[def.key] = { a: clampAllele(def, draw()), b: clampAllele(def, draw()) };
  }
  return g;
}
