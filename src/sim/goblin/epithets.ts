/**
 * Epithets (§5, P8.7): a name earned by deeds, once and for life (it goes on the grave too): "the Brave" for three
 * Gnashers killed, "the Scrapper" (brawls), "Lightfingers" (thefts), "Skytouched" (held by the god), "the Trickster"
 * (pranks), "the Piper" (evenings of music), "the Devout" (prayers), "Greenthumb" for twenty plantings, "the
 * Generous", "the Builder". The first that fits, in that order (the rarer first); "Old" comes with being an elder
 * when nothing else has, and gives way to a deed. Stored as an id; the UI words it.
 */
import { CFG } from '../config';
import type { Goblin } from '../state';
import type { World } from '../world';

const E = CFG.character.epithets;
export type EpithetId = keyof typeof E | 'old';

const DEEDS: readonly [Exclude<EpithetId, 'old'>, (g: Goblin) => number][] = [
  ['brave', (g) => g.deeds.kills], ['scrapper', (g) => g.deeds.brawls ?? 0], ['lightfingers', (g) => g.deeds.stolen ?? 0],
  ['skytouched', (g) => g.deeds.timesHeld], ['trickster', (g) => g.deeds.pranks ?? 0], ['piper', (g) => g.deeds.tunes ?? 0],
  ['devout', (g) => g.deeds.prayers ?? 0], ['greenthumb', (g) => g.deeds.planted], ['generous', (g) => g.deeds.gifts],
  ['builder', (g) => g.deeds.builds],
];

/** Checked hourly with the traits: give `g` the first epithet it has earned, if it has none yet (or only "Old"). */
export function updateEpithet(w: World, g: Goblin): void {
  if (g.epithet && g.epithet !== 'old') return;
  const earned = DEEDS.find(([id, n]) => n(g) >= E[id])?.[0] ?? (g.lifeStage === 'elder' ? 'old' : null);
  if (!earned || earned === g.epithet) return;
  g.epithet = earned;
  w.emit({ type: 'epithet_earned', goblinId: g.id, epithet: earned, at: { ...g.pos } });
}
