/**
 * Divine deeds (§17.10): the player's achievements, kept in the browser profile under `nibblets.ui.deeds`, never in
 * a save, so they follow the player from village to village. P9.8 brings the first, "A Book About You" (a goblin
 * wrote a book that speaks of the god, in LLM mode); the others and their Codex page come with P11.1.
 */
import { loadPref, savePref } from './store';

export type DeedId = 'book_about_you';
/** When a deed was earned (wall-clock ms) and what earned it, in words. */
export interface Earned { at: number; how?: string }
type Deeds = Partial<Record<DeedId, Earned>>;

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

/** Tests: forget what was loaded. */
export const resetDeedsCache = (): void => void (earned = null);
