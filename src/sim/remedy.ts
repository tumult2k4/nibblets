/**
 * Herbal remedy (§14.3, P6.5): glowcap and berries worked into a paste by someone who has had the idea (it comes
 * sooner while anyone is ill). One dose for an illness makes it run its course twice as fast and halves the risk of
 * dying of it. The sick take the one they carry, or fetch one from the stockpile on their way to lie down; a carer
 * who has one (or passes the store on the way) gives it at the bedside. Crafters keep a couple in store, and want to
 * make one all the more while someone ill goes without.
 */
import { CFG } from './config';
import { dist } from '../shared/math';
import type { ItemType } from '../shared/types';
import type { Goblin } from './state';
import type { World } from './world';
import { addItem, countItem, removeItems } from './inventory';
import { deposit, stockCount, withdraw } from './stockpile';
import { materialWanted } from './ai/wants';

const H = CFG.health;
export const REMEDY: ItemType = 'herbal_remedy';

/** Showing an illness and not yet dosed for it. */
export const needsRemedy = (g: Goblin): boolean => g.health.disease?.stage === 'sick' && !g.health.disease.remedy;

/** A dose in the stockpile, which is within `range` of `g`. */
export const remedyInStore = (g: Goblin, w: World, range: number = H.remedyFetch): boolean =>
  stockCount(w.s, REMEDY) > 0 && dist(g.pos, w.s.village.stockpilePos) <= range;

/** `patient` takes a dose out of `from`'s pack (its own, or its carer's). */
export function dose(w: World, patient: Goblin, from: Goblin = patient): boolean {
  const ill = patient.health.disease;
  if (!ill || ill.stage !== 'sick' || ill.remedy || removeItems(from, REMEDY, 1) < 1) return false;
  ill.remedy = true;
  w.emit({ type: 'took_remedy', goblinId: patient.id, byId: from === patient ? null : from.id, disease: ill.id, at: { ...patient.pos } });
  return true;
}

/** At the stockpile: one dose from the store into the pack. */
export function fetchRemedy(w: World, g: Goblin): boolean {
  if (withdraw(w.s, REMEDY, 1) < 1) return false;
  if (addItem(g, { type: REMEDY, qty: 1 }) >= 1) return true;
  deposit(w.s, { type: REMEDY, qty: 1 }); // no room in the pack
  return false;
}

/** 0..1: how much a crafter would like to make one more (stock up to the target; more if someone ill goes without). */
export function remedyWant(g: Goblin, w: World): number {
  const short = materialWanted(g, w, REMEDY, H.remedyTarget);
  const none = stockCount(w.s, REMEDY) + countItem(g, REMEDY) === 0;
  return H.remedyWant * short + (none && w.s.goblins.some(needsRemedy) ? H.remedySickWant : 0);
}
