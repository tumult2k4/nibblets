/**
 * What the village's faith keeps between ticks (§17.4, P8.8), on the god's state: open prayers and the recently
 * answered, news of the god's doings going round, offerings waiting to be taken, the shaman's gathering, and this
 * season's meals (for dependence). Optional on the god's state, so older saves load.
 */
import type { ID, ItemType, PrayerKind, Vec2 } from '../../shared/types';
import type { WorldState } from '../state';
import type { Reaction } from './reactions';

export interface Prayer {
  id: ID; goblinId: ID; kind: PrayerKind; targetId?: ID; at: Vec2; tick: number; expiresTick: number;
  /** prayed anywhere, in need, not at a shrine */
  desperate?: boolean;
  /** answered then, by that act */
  answeredTick?: number; answeredBy?: string;
}
/** A divine act the village may talk about: who knows of it (saw it, or heard), and what it did to those who saw. */
export interface DivineNews { act: string; tick: number; at: Vec2; knowers: ID[]; reaction?: Reaction }
/** Something laid at a shrine or temple, taken by the god a day later (favor). */
export interface Offering { buildingId: ID; tick: number; goblinId: ID; trinketId?: ID; item?: ItemType; value: number }
/** The shaman leading a prayer at a shrine or temple. */
export interface Gathering { shamanId: ID; buildingId: ID; pos: Vec2; until: number }

export interface FaithState {
  prayers: Prayer[];
  answered: Prayer[];
  news: DivineNews[];
  offerings: Offering[];
  gathering: Gathering | null;
  lastGathering: number;
  /** meals this season, all and god-given */
  meals: { season: number; all: number; god: number };
  /** favor earned so far, by source (stats and the balance runner) */
  earned: { faith: number; prayers: number; offerings: number; festivals: number; answered: number };
}

export function faithOf(s: WorldState): FaithState {
  return (s.god.faith ??= {
    prayers: [], answered: [], news: [], offerings: [], gathering: null, lastGathering: -1e9,
    meals: { season: -1, all: 0, god: 0 }, earned: { faith: 0, prayers: 0, offerings: 0, festivals: 0, answered: 0 },
  });
}
