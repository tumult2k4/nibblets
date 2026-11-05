/** Reusable response curves and helpers for utility scoring (§7.2). */
import { clamp } from '../../shared/math';
import type { Goblin } from '../state';
import type { World } from '../world';
import { CFG } from '../config';
import { isNight } from '../time';
import { weatherVisionMul } from '../weather';
import { nightVisionMul } from '../fire';

export const linear = (x: number): number => clamp(x, 0, 1);
export const quadratic = (x: number): number => clamp(x, 0, 1) ** 2;
export const inverseQuadratic = (x: number): number => 1 - (1 - clamp(x, 0, 1)) ** 2;
export const logistic = (x: number, k = 10, mid = 0.5): number => 1 / (1 + Math.exp(-k * (x - mid)));
export const step = (x: number, threshold: number): number => (x >= threshold ? 1 : 0);

/** 1 at distance 0 → 0.25 at `max` (never zero: far food still beats starving). */
export const distanceFalloff = (d: number, max: number): number => 1 - 0.75 * clamp(d / max, 0, 1);

/** Sight range: shorter at night, cut by fog (−50 %) and blizzards (−70 %). */
export const visionRadius = (g: Goblin, w: World): number =>
  (isNight(w.clock) ? CFG.goblin.visionNight * nightVisionMul(g, w) : CFG.goblin.visionDay) * weatherVisionMul(w, g.pos);

export const isNightNow = (w: World): boolean => isNight(w.clock);
