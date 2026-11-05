import * as THREE from 'three';
import type { Biome, Season } from '../shared/types';
import type { ClockState } from '../sim/time';
import { SEASONS } from '../sim/time';
import { BIOME_COLORS, PROP_COLORS } from './palette';

/**
 * Seasonal palettes (§9.3, P3.2): terrain biome colors plus per-instance foliage tints that multiply the
 * spring vertex colors. A new season blends in over its first day.
 */
export interface SeasonLook {
  biomes: Record<Biome, THREE.Color>;
  bush: THREE.Color; tree: THREE.Color; grass: THREE.Color; flower: THREE.Color;
}

const C = (hex: string) => new THREE.Color(hex);
const T = (r: number, g: number, b: number) => new THREE.Color(r, g, b);
/** Tint that turns `base` into `target` (per channel, linear space — instance colors multiply vertex colors). */
const toward = (base: string, target: string): THREE.Color => {
  const a = C(base), b = C(target);
  return T(b.r / Math.max(0.01, a.r), b.g / Math.max(0.01, a.g), b.b / Math.max(0.01, a.b));
};
const bush = (hex: string) => toward(PROP_COLORS.bush, hex);
const grass = (hex: string) => toward(PROP_COLORS.grass, hex);

const LOOKS: Record<Season, SeasonLook> = {
  spring: {
    biomes: { ...BIOME_COLORS },
    bush: T(1.08, 1.08, 1), tree: T(1, 1, 1), grass: T(1.05, 1.08, 1), flower: T(1, 1, 1),
  },
  summer: {
    biomes: { ...BIOME_COLORS, meadow: C('#7db43a'), forest: C('#4c8a2c'), marsh: C('#668a45'), sand: C('#e8d48f') },
    bush: bush('#428a2c'), tree: T(0.9, 1, 0.85), grass: grass('#82b23a'), flower: T(1.05, 1.05, 1.05),
  },
  autumn: {
    biomes: { ...BIOME_COLORS, meadow: C('#b3ab4c'), forest: C('#8c7a38'), marsh: C('#857a4a') },
    bush: bush('#c8642a'), tree: T(1.5, 1, 0.75), grass: grass('#c9b25a'), flower: T(1.1, 0.75, 0.55),
  },
  winter: {
    biomes: { ...BIOME_COLORS, meadow: C('#a7ae98'), forest: C('#7f8c76'), marsh: C('#8c937c'), sand: C('#d8d2bc') },
    bush: bush('#8a7d62'), tree: T(1.35, 1.2, 1.45), grass: grass('#b9b89c'), flower: T(0.3, 0.25, 0.2),
  },
};

/** Fresh green with flower dots, saturated summer, orange/red autumn, grey-white winter. */
export function seasonLook(c: ClockState): { look: SeasonLook; sig: string } {
  const cur = LOOKS[c.season];
  if (c.seasonDay > 0 || c.day === 0) return { look: cur, sig: c.season };
  const prev = LOOKS[SEASONS[(SEASONS.indexOf(c.season) + 3) % 4]!];
  // 10 steps across the first day is smooth enough and keeps chunk rebuilds rare
  const k = Math.min(1, Math.round(c.dayFrac * 10) / 10);
  if (k >= 1) return { look: cur, sig: c.season };
  const lerp = (a: THREE.Color, b: THREE.Color) => a.clone().lerp(b, k);
  const biomes = {} as Record<Biome, THREE.Color>;
  for (const key of Object.keys(cur.biomes) as Biome[]) biomes[key] = lerp(prev.biomes[key], cur.biomes[key]);
  return {
    look: { biomes, bush: lerp(prev.bush, cur.bush), tree: lerp(prev.tree, cur.tree), grass: lerp(prev.grass, cur.grass), flower: lerp(prev.flower, cur.flower) },
    sig: `${c.season}:${k}`,
  };
}

export const SNOW_WHITE = new THREE.Color('#f4f7fa');
