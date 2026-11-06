/**
 * Diploid genome (§4.2). Stored flat (temperament loci are prefixed `t_`) so meiosis and the UI
 * can iterate one table; see DECISIONS.md.
 */
import type { Rng } from '../../../shared/rng';
import { clamp, q4, wrapHue } from '../../../shared/math';
import { CFG } from '../../config';

export interface Locus { a: number; b: number }

export type LocusKind = 'quant' | 'hue' | 'discrete' | 'recessive';
export interface LocusDef {
  key: LocusId; kind: LocusKind; min: number; max: number;
  /** discrete only: dominance rank per value (higher wins) */
  dominance?: number[];
  label: string;
}

export const LOCUS_DEFS = [
  { key: 'skinHue', kind: 'hue', min: 0, max: 360, label: 'Skin hue' },
  { key: 'skinSat', kind: 'quant', min: 0.25, max: 0.85, label: 'Skin saturation' },
  { key: 'skinLight', kind: 'quant', min: 0.25, max: 0.7, label: 'Skin lightness' },
  { key: 'eyeHue', kind: 'hue', min: 0, max: 360, label: 'Eye hue' },
  // 0 none, 1 freckles, 2 spots, 3 stripes, 4 two-tone; dominance 2>3>1>4>0
  { key: 'pattern', kind: 'discrete', min: 0, max: 4, dominance: [0, 2, 4, 3, 1], label: 'Pattern' },
  { key: 'patternHueShift', kind: 'quant', min: -60, max: 60, label: 'Pattern hue shift' },
  { key: 'adultSize', kind: 'quant', min: 0.75, max: 1.35, label: 'Adult size' },
  { key: 'earLength', kind: 'quant', min: 0.6, max: 1.6, label: 'Ear length' },
  { key: 'earDroop', kind: 'quant', min: 0, max: 1, label: 'Ear droop' },
  { key: 'noseSize', kind: 'quant', min: 0.6, max: 1.5, label: 'Nose size' },
  { key: 'bellyRound', kind: 'quant', min: 0.8, max: 1.25, label: 'Belly' },
  { key: 'tusks', kind: 'recessive', min: 0, max: 1, label: 'Tusks' },
  { key: 'albino', kind: 'recessive', min: 0, max: 1, label: 'Albino' },
  { key: 't_gluttony', kind: 'quant', min: 0, max: 1, label: 'Gluttony' },
  { key: 't_bravery', kind: 'quant', min: 0, max: 1, label: 'Bravery' },
  { key: 't_sociability', kind: 'quant', min: 0, max: 1, label: 'Sociability' },
  { key: 't_industry', kind: 'quant', min: 0, max: 1, label: 'Industry' },
  { key: 't_wanderlust', kind: 'quant', min: 0, max: 1, label: 'Wanderlust' },
  { key: 't_mischief', kind: 'quant', min: 0, max: 1, label: 'Mischief' },
  { key: 't_piety', kind: 'quant', min: 0, max: 1, label: 'Piety' },
  { key: 'vigor', kind: 'quant', min: 0.8, max: 1.2, label: 'Vigor' },
  { key: 'metabolism', kind: 'quant', min: 0.85, max: 1.15, label: 'Metabolism' },
  { key: 'coldTolerance', kind: 'quant', min: 0, max: 1, label: 'Cold tolerance' },
  { key: 'lifespan', kind: 'quant', min: 0.85, max: 1.15, label: 'Lifespan' },
] as const satisfies readonly (Omit<LocusDef, 'key' | 'dominance'> & { key: string; dominance?: readonly number[] })[];

export type LocusId = (typeof LOCUS_DEFS)[number]['key'];
export type Genome = Record<LocusId, Locus>;

export const LOCUS_BY_ID = Object.fromEntries(LOCUS_DEFS.map((d) => [d.key, d])) as unknown as Record<
  LocusId,
  LocusDef
>;

export function clampAllele(def: LocusDef, v: number): number {
  if (def.kind === 'hue') return q4(wrapHue(v));
  if (def.kind === 'discrete' || def.kind === 'recessive') return Math.round(clamp(v, def.min, def.max));
  return q4(clamp(v, def.min, def.max));
}

/** Apply mutation rules (§4.2) to one allele. */
export function mutateAllele(def: LocusDef, v: number, rng: Rng): number {
  const G = CFG.genetics;
  if (def.kind === 'discrete' || def.kind === 'recessive') {
    if (rng.chance(G.discreteMutationChance)) return rng.int(def.min, def.max);
    return v;
  }
  if (!rng.chance(G.quantMutationChance)) return v;
  const sigma = def.kind === 'hue' ? G.hueSigma : G.quantMutationSigma * (def.max - def.min);
  return clampAllele(def, v + rng.gaussian(0, sigma));
}

/** Meiosis: one random allele from each parent per locus, then mutation. `a` = maternal, `b` = paternal. */
export function meiosis(mother: Genome, father: Genome, rng: Rng): Genome {
  const child = {} as Genome;
  for (const def of LOCUS_DEFS as readonly LocusDef[]) {
    const m = mother[def.key];
    const f = father[def.key];
    const fromM = rng.chance(0.5) ? m.a : m.b;
    const fromF = rng.chance(0.5) ? f.a : f.b;
    child[def.key] = { a: mutateAllele(def, fromM, rng), b: mutateAllele(def, fromF, rng) };
  }
  return child;
}

export function cloneGenome(g: Genome): Genome {
  const out = {} as Genome;
  for (const def of LOCUS_DEFS) out[def.key] = { ...g[def.key] };
  return out;
}

/** Fraction of quantitative/discrete loci whose alleles differ noticeably (for diversity stats). */
export function heterozygosity(g: Genome): number {
  let het = 0;
  for (const def of LOCUS_DEFS as readonly LocusDef[]) {
    const l = g[def.key];
    const tol = def.kind === 'hue' ? 15 : (def.max - def.min) * 0.1;
    if (Math.abs(l.a - l.b) > tol * (def.kind === 'discrete' || def.kind === 'recessive' ? 0 : 1)) het++;
  }
  return het / LOCUS_DEFS.length;
}

/** The bin an allele falls in for diversity stats: 15° of hue, a tenth of a quantitative range, or the value itself. */
export function alleleBin(def: LocusDef, v: number): number {
  if (def.kind === 'hue') return Math.floor((((v % 360) + 360) % 360) / 15);
  if (def.kind === 'discrete' || def.kind === 'recessive') return Math.round(v);
  return Math.min(9, Math.max(0, Math.floor(((v - def.min) / (def.max - def.min)) * 10)));
}

/** A population's gene diversity (P10.4): Nei's expected heterozygosity (1 − Σp² over the binned alleles of each locus,
 * averaged) and the mean number of distinct alleles per locus. Goblins who marry in from another stock raise both. */
export function geneDiversity(gs: readonly Genome[]): { he: number; alleles: number } {
  if (!gs.length) return { he: 0, alleles: 0 };
  let he = 0, alleles = 0;
  for (const def of LOCUS_DEFS as readonly LocusDef[]) {
    const n = new Map<number, number>();
    for (const g of gs) for (const v of [g[def.key].a, g[def.key].b]) { const b = alleleBin(def, v); n.set(b, (n.get(b) ?? 0) + 1); }
    let sq = 0;
    for (const k of n.values()) sq += (k / (2 * gs.length)) ** 2;
    he += 1 - sq;
    alleles += n.size;
  }
  return { he: he / LOCUS_DEFS.length, alleles: alleles / LOCUS_DEFS.length };
}
