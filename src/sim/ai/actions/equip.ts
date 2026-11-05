/**
 * Equip (§P4.2): put the best weapon (else a tool) from the pack into the hand slot; whatever was held goes back into
 * the pack. Jobs still reach for the right tool wherever it is (hand or pack).
 */
import { CFG } from '../../config';
import { isTool, weaponDmg } from '../../tools';
import type { ItemStack } from '../../../shared/types';
import type { Goblin } from '../../state';
import type { UtilityAction } from '../action';

/** Weapons first (by damage), then any tool. */
const handValue = (s: ItemStack | null): number => (s ? weaponDmg(s) * 2 + (isTool(s.type) ? 1 : 0) : 0);

export function equipCandidate(g: Goblin): ItemStack | null {
  let best: ItemStack | null = null, bv = handValue(g.equipped.hand);
  for (const s of g.inventory) if (handValue(s) > bv) { bv = handValue(s); best = s; }
  return best;
}

export const Equip: UtilityAction = {
  id: 'equip', tags: ['work'], minStage: 'adult', interruptible: true,
  isAvailable: (g) => !!equipCandidate(g),
  score: () => 0.35,
  start(g) {
    g.activity.progress = CFG.crafting.equipTicks;
    return true;
  },
  step(g) {
    if (--g.activity.progress > 0) return 'running';
    const s = equipCandidate(g);
    if (!s) return 'failed';
    g.inventory.splice(g.inventory.indexOf(s), 1);
    if (g.equipped.hand) g.inventory.push(g.equipped.hand);
    g.equipped.hand = s;
    return 'done';
  },
};
