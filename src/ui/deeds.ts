/**
 * Divine deeds (§17.10): the player's achievements, kept in the browser profile under `nibblets.ui.deeds`, never in
 * a save, so they follow the player from village to village. P9.8 brought "A Book About You" (a goblin wrote a book
 * that speaks of the god, in LLM mode); P11.1 the rest (`deedWatch.ts` earns them from the sim's events) and their
 * Codex page. Counted deeds (Gentle Giant, the prayers) keep their running counts here too.
 */
import { loadPref, savePref } from './store';

export const DEED_IDS = [
  'first_miracle', 'gentle_giant', 'prayers_10', 'prayers_50', 'converted_skeptic', 'feast_in_your_name', 'the_prophet',
  'five_generations', 'village_of_50', 'book_about_you', 'wrath_of_the_sky', 'saint_of_apples', 'lazarus',
] as const;
export type DeedId = (typeof DEED_IDS)[number];
/** a badge per deed */
export const DEED_ICON: Record<DeedId, string> = {
  first_miracle: '✨', gentle_giant: '🤲', prayers_10: '🙏', prayers_50: '📿', converted_skeptic: '💡', feast_in_your_name: '🎉', the_prophet: '📜',
  five_generations: '🌳', village_of_50: '🏘', book_about_you: '📖', wrath_of_the_sky: '⚡', saint_of_apples: '🍎', lazarus: '🪦',
};
/** When a deed was earned (wall-clock ms) and what earned it, in words. */
export interface Earned { at: number; how?: string }
type Deeds = Partial<Record<DeedId, Earned>> & { counts?: Record<string, number> };

let earned: Deeds | null = null;

/** Every deed earned so far in this browser. */
export const deeds = (): Readonly<Deeds> => (earned ??= loadPref<Deeds>('deeds', {}));

/** Earn a deed: true the first time only, when it is stored. */
export function earnDeed(id: DeedId, how?: string): boolean {
  const d = deeds() as Deeds;
  if (d[id]) return false;
  d[id] = { at: Date.now(), ...(how ? { how } : {}) };
  savePref('deeds', d);
  return true;
}

/** Count toward a counted deed; the new count. */
export function countDeed(key: string, by = 1): number {
  const d = deeds() as Deeds, counts = (d.counts ??= {});
  counts[key] = (counts[key] ?? 0) + by;
  savePref('deeds', d);
  return counts[key];
}

/** Tests: forget what was loaded. */
export const resetDeedsCache = (): void => void (earned = null);
