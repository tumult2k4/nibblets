/**
 * Equip (§P4.2): put the best weapon (else a tool; a torch at night) from the pack into the hand slot; whatever was held goes back into
 * the pack. Jobs still reach for the right tool wherever it is (hand or pack). P5.6: also puts on clothes that beat
 * what is worn (a crown cheers its wearer up).
 */
import { CFG } from '../../config';
import { isTool, weaponDmg } from '../../tools';
import type { ItemStack } from '../../../shared/types';
import type { Goblin } from '../../state';
import type { World } from '../../world';
import { isNight } from '../../time';
import type { UtilityAction } from '../action';
import { putOn, wearCandidate } from '../../clothing';
import { addMood } from '../../goblin/mood';

/** A torch at night (P4.3), else weapons first (by damage), then any tool; a torch by day is worth nothing. */
function handValue(s: ItemStack | null, night: boolean): number {
  if (!s) return 0;
  if (s.type === 'torch') return night ? 100 : 0;
  return weaponDmg(s) * 2 + (isTool(s.type) ? 1 : 0);
}

export function equipCandidate(g: Goblin, w: World): ItemStack | null {
  const night = isNight(w.clock);
  let best: ItemStack | null = null, bv = handValue(g.equipped.hand, night);
  for (const s of g.inventory) if (handValue(s, night) > bv) { bv = handValue(s, night); best = s; }
  return best;
}

export const Equip: UtilityAction = {
  id: 'equip', tags: ['work'], minStage: 'adult', interruptible: true,
  isAvailable: (g, w) => !!equipCandidate(g, w) || !!wearCandidate(g),
  score: () => 0.35,
  start(g) {
    g.activity.progress = CFG.crafting.equipTicks;
    return true;
  },
  step(g, w) {
    if (--g.activity.progress > 0) return 'running';
    const c = wearCandidate(g);
    if (c) {
      putOn(g, c);
      if (c.type === 'flower_crown') addMood(w, g, 'crowned', CFG.fiber.crownMood, CFG.time.dayTicks);
      return 'done';
    }
    const s = equipCandidate(g, w);
    if (!s) return 'failed';
    g.inventory.splice(g.inventory.indexOf(s), 1);
    if (g.equipped.hand) g.inventory.push(g.equipped.hand);
    g.equipped.hand = s;
    return 'done';
  },
};
