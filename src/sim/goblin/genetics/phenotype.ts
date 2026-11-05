import type { HSL, LifeStage } from '../../../shared/types';
import { clamp, hueMean, lerp, wrapHue } from '../../../shared/math';
import { CFG } from '../../config';
import { LOCUS_BY_ID, type Genome, type LocusId } from './genome';

export type PatternName = 'none' | 'freckles' | 'spots' | 'stripes' | 'twotone';
export const PATTERNS: readonly PatternName[] = ['none', 'freckles', 'spots', 'stripes', 'twotone'];

export interface Phenotype {
  skinColor: HSL; patternColor: HSL; eyeColor: HSL;
  pattern: PatternName;
  scale: number; headRatio: number;
  earLength: number; earDroop: number; noseSize: number;
  belly: number; tusks: boolean; albino: boolean; stoop: number; scars: number;
}

/** Expressed value of one locus (§4.2 expression rules). */
export function express(g: Genome, key: LocusId): number {
  const def = LOCUS_BY_ID[key];
  const { a, b } = g[key];
  switch (def.kind) {
    case 'hue':
      return hueMean(a, b);
    case 'recessive':
      return a === 1 && b === 1 ? 1 : 0;
    case 'discrete': {
      const dom = def.dominance!;
      return (dom[a] ?? 0) >= (dom[b] ?? 0) ? a : b;
    }
    default:
      return (a + b) / 2;
  }
}

export function lifeStageForAge(ageDays: number, lifespanDays: number): LifeStage {
  const S = CFG.goblin.stageDays;
  if (ageDays < 0) return 'egg';
  if (ageDays < S.hatchling) return 'hatchling';
  if (ageDays < S.youngling) return 'youngling';
  if (ageDays < Math.min(S.adultUntil, lifespanDays * 0.8)) return 'adult';
  return 'elder';
}

/** Body scale factor & head ratio by age (before adultSize). Continuous through youngling growth. */
export function growthCurve(ageDays: number, stage: LifeStage): { scale: number; head: number; stoop: number } {
  const S = CFG.stages;
  const D = CFG.goblin.stageDays;
  switch (stage) {
    case 'egg':
      return { scale: 0.25, head: S.hatchling.head, stoop: 0 };
    case 'hatchling': {
      const t = clamp(ageDays / D.hatchling, 0, 1);
      return { scale: S.hatchling.scale + t * 0.02, head: S.hatchling.head, stoop: 0 };
    }
    case 'youngling': {
      const t = clamp((ageDays - D.hatchling) / (D.youngling - D.hatchling), 0, 1);
      return {
        scale: lerp(S.hatchling.scale + 0.02, S.younglingEnd.scale, t),
        head: lerp(S.hatchling.head - 0.04, S.younglingEnd.head, t),
        stoop: 0,
      };
    }
    case 'adult': {
      // last stretch of growth: youngling end → full size over the first 2 adult days
      const t = clamp((ageDays - D.youngling) / 2, 0, 1);
      return { scale: lerp(S.younglingEnd.scale, S.adult.scale, t), head: lerp(S.younglingEnd.head, S.adult.head, t), stoop: 0 };
    }
    case 'elder':
      return { scale: S.elder.scale, head: S.elder.head, stoop: S.elder.stoop };
  }
}

export interface PhenoInputs { genome: Genome; ageDays: number; stage: LifeStage; hunger: number; scars: number }

export function phenotypeOf(p: PhenoInputs): Phenotype {
  const g = p.genome;
  const albino = express(g, 'albino') === 1;
  const elder = p.stage === 'elder';
  let skin: HSL = { h: express(g, 'skinHue'), s: express(g, 'skinSat'), l: express(g, 'skinLight') };
  if (albino) skin = { h: skin.h, s: 0.05, l: 0.85 };
  if (elder) skin = { h: skin.h, s: skin.s * 0.8, l: clamp(skin.l + 0.1, 0, 0.95) };
  const patIdx = express(g, 'pattern');
  const patternColor: HSL = {
    h: wrapHue(skin.h + express(g, 'patternHueShift')),
    s: clamp(skin.s + 0.1, 0, 1),
    l: clamp(skin.l - 0.18, 0.08, 0.9),
  };
  const eyeColor: HSL = albino ? { h: 0, s: 0.85, l: 0.45 } : { h: express(g, 'eyeHue'), s: 0.7, l: 0.5 };
  const gc = growthCurve(p.ageDays, p.stage);
  const young = p.stage === 'hatchling' || p.stage === 'youngling';
  const fullness = clamp(p.hunger / 100, 0, 1);
  return {
    skinColor: skin,
    patternColor,
    eyeColor,
    pattern: PATTERNS[patIdx] ?? 'none',
    scale: gc.scale * express(g, 'adultSize'),
    headRatio: gc.head,
    earLength: express(g, 'earLength') * (young ? lerp(0.55, 1, gc.scale) : 1),
    earDroop: clamp(express(g, 'earDroop') + (elder ? 0.3 : 0), 0, 1.3),
    noseSize: express(g, 'noseSize'),
    belly: express(g, 'bellyRound') * (0.85 + 0.25 * fullness),
    tusks: express(g, 'tusks') === 1,
    albino,
    stoop: gc.stoop,
    scars: clamp(p.scars, 0, 3),
  };
}
