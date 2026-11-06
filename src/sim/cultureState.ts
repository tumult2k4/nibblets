/**
 * Culture state kept on the village (§15.3 festivals, P8.5; §15.4 beliefs, P8.6). Every field is optional, so older
 * saves load as they are (save version unchanged).
 */
import type { FestivalKind, ID, Vec2 } from '../shared/types';

/** The festival now on: where, from when to when, and who came (goblin id → ticks spent there). */
export interface Festival {
  kind: FestivalKind; pos: Vec2; venueId: ID | null; startTick: number; endTick: number;
  came: Record<number, number>;
  /** Harvest Night: the chief has spoken; Sun Feast: who has had a helping */
  speech?: boolean; ate?: ID[];
}

/** Things the village does or sees that it may come to read luck into (§15.4). */
export type Omen = 'festival' | 'music' | 'prayer' | 'offering' | 'redcap' | 'war_paint' | 'shooting_star' | 'full_moon' | 'theft' | 'burial';
/** Turns of luck, good or bad, that an omen may be blamed or thanked for. */
export type Luck = 'rain' | 'storm' | 'raid' | 'sickness' | 'death' | 'hatching' | 'god_food' | 'god_wrath' | 'blight' | 'fire';

/** "`omen` brings `luck`": formed on `formed` (a tick); `strength` grows when borne out, shrinks when not, 0 fades it. */
export interface Belief {
  omen: Omen; luck: Luck; valence: 1 | -1; formed: number; strength: number;
  /** when the omen last came and the luck has not (yet) followed */
  pending?: number;
}

export interface Culture {
  festival?: Festival | null;
  /** what the village has held, oldest first: [day, kind, how many came] (the latest `heldMax`) */
  held?: [number, FestivalKind, number][];
  /** where and when the last star fell (Starfall is held the evening after) */
  star?: { pos: Vec2; tick: number } | null;
  /** Sprout Day's orchard boost lasts until this tick; Harvest Night doubles courtship in the spring of this year */
  sproutUntil?: number; courtYear?: number;
  /** omens and turns of luck of the last season: [tick, kind] (at most one of a kind an hour) */
  signs?: [number, Omen | Luck][];
  /** "omen>luck" → the ticks it came up (within a season) */
  pairs?: Record<string, number[]>;
  /** how many of `signs` have been read */
  read?: number;
  beliefs?: Belief[];
  /** beliefs formed and faded over the years, for the balance runner and the chronicle */
  formed?: number; faded?: number;
}
