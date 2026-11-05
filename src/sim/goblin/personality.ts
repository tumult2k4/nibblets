import type { Rng } from '../../shared/rng';
import { clamp, q4 } from '../../shared/math';
import { CFG } from '../config';
import type { Personality } from '../state';
import type { Genome } from './genetics/genome';
import { express } from './genetics/phenotype';

export const TRAITS: readonly (keyof Personality)[] = [
  'gluttony', 'bravery', 'sociability', 'industry', 'wanderlust', 'mischief', 'piety',
];

/** Born personality = genetic temperament + Gaussian noise (σ 0.08) (§7.6). */
export function personalityFromGenome(g: Genome, rng: Rng): Personality {
  const p = {} as Personality;
  for (const t of TRAITS) {
    const key = `t_${t}` as const;
    p[t] = q4(clamp(express(g, key) + rng.gaussian(0, CFG.genetics.personalitySigma), 0, 1));
  }
  return p;
}

/** Action weight per personality (§7.6). Missing actions weigh 1. */
export function personalityWeight(p: Personality, action: string): number {
  switch (action) {
    case 'eat':
    case 'harvest_fruit':
    case 'forage':
      return 0.85 + 0.3 * p.gluttony;
    case 'wander':
      return 0.6 + 0.8 * p.wanderlust;
    case 'chat':
    case 'comfort':
    case 'gift':
      return 0.4 + 1.2 * p.sociability;
    case 'court':
      return 0.6 + 0.8 * p.sociability;
    case 'plant_seed':
    case 'water_plant':
      return 0.6 + 0.8 * p.industry;
    case 'chop':
    case 'mine':
    case 'craft':
    case 'plan_building':
    case 'tend_fire':
    case 'store_item':
    case 'deliver_material':
    case 'build':
    case 'repair_building':
      return 0.5 + 1.0 * p.industry;
    case 'explore':
      return 0.5 + 1.0 * p.wanderlust;
    case 'play':
      return 0.7 + 0.3 * p.sociability + 0.4 * p.mischief;
    case 'idle':
      return 1.2 - 0.6 * p.industry;
    case 'seek_shelter':
      return 1.15 - 0.3 * p.bravery;
    case 'guard':
      return 0.3 + 1.4 * p.bravery * p.industry;
    case 'defend_village':
      return 0.7 + 0.6 * p.bravery;
    default:
      return 1;
  }
}

const WORDS: Record<keyof Personality, [string, string]> = {
  gluttony: ['dainty', 'greedy'],
  bravery: ['timid', 'brave'],
  sociability: ['shy', 'chatty'],
  industry: ['lazy', 'hard-working'],
  wanderlust: ['homebody', 'restless'],
  mischief: ['earnest', 'mischievous'],
  piety: ['doubting', 'pious'],
};

/** Short descriptor from the three most extreme traits, e.g. "brave, greedy, mischievous". */
export function describePersonality(p: Personality): string[] {
  return TRAITS.map((t) => ({ t, d: p[t] - 0.5 }))
    .sort((a, b) => Math.abs(b.d) - Math.abs(a.d))
    .slice(0, 3)
    .filter((x) => Math.abs(x.d) > 0.08)
    .map((x) => `${x.t}.${x.d > 0 ? 1 : 0}`);
}
export const traitWord = (key: string): string => {
  const [t, side] = key.split('.') as [keyof Personality, string];
  return WORDS[t]?.[side === '1' ? 1 : 0] ?? key;
};
