/**
 * Personality life drift (§7.6, P8.7): what happens to a goblin nudges its nature, 0.01 a notable event, never more
 * than 0.2 from where it started (its baseline: as born, plus any trait's lasting nudge, kept from the first drift).
 * Coming through a fight: braver. Being robbed: less sociable. A festival: more sociable; Starfall: more pious.
 * Losing a child: less brave and more pious. A prayer at the shrine: a little more pious.
 */
import { CFG } from '../config';
import { clamp, q4 } from '../../shared/math';
import type { Goblin, Personality } from '../state';

const D = CFG.character.drift;
export type DriftEvent = 'fought' | 'robbed' | 'festival' | 'starfall' | 'child_lost' | 'prayed' | 'cowed' | 'dependent';

export function drift(g: Goblin, ev: DriftEvent): void {
  const base = (g.baseline ??= { ...g.personality });
  for (const [k, v] of Object.entries(D[ev]) as [keyof Personality, number][])
    g.personality[k] = q4(clamp(g.personality[k] + v, Math.max(0, base[k] - D.cap), Math.min(1, base[k] + D.cap)));
}
