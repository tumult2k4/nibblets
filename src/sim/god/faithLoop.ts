/**
 * The faith system's place in the tick (§6 step 8b, P8.8) and in the event stream: faith over a lifetime, favor,
 * prayers expiring, the shaman and the gathering; meals (dependence), food from the sky answering prayers, festivals
 * in the god's honor. P8.9: Divine mode's tiers, wishes running out.
 */
import { CFG } from '../config';
import type { SimEventInput } from '../../shared/types';
import type { World } from '../world';
import { noteMeal, updateDevotion } from './devotion';
import { addFavor, updateFavor } from './favor';
import { notePrayerEvent, updatePrayers } from './prayers';
import { updateShaman } from './shaman';
import { faithOf } from './faithState';
import { updateTier } from './tiers';
import { updateWishes } from './wishes';

export function updateFaith(w: World): void {
  updateDevotion(w);
  updateFavor(w);
  updatePrayers(w);
  updateShaman(w);
  updateTier(w);
  updateWishes(w);
  const g = w.s.god.faith?.gathering;
  if (g && g.until <= w.s.tick) faithOf(w.s).gathering = null;
}

export function noteFaith(w: World, e: SimEventInput): void {
  if (e.type === 'item_eaten') {
    noteMeal(w, e);
    notePrayerEvent(w, e);
  } else if (e.type === 'festival' && e.phase === 'start') {
    const venue = w.s.buildings.find((b) => b.id === e.venueId);
    if (e.kind === 'starfall' || venue?.type === 'temple') addFavor(w, CFG.god.festivalFavor, 'festivals');
  }
}
