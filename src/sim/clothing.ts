/**
 * Clothes and carried goods (§11.1, P5.6): a loincloth (+2 °C) or leaf cape (+4 °C, rain's wet penalty halved) on the
 * body, a flower crown on the head (charm in courtship, a little cheer). A basket in the pack adds 4 slots; a
 * sleeping mat makes a night outdoors as restful as on a mat. `Equip` puts on whatever is better than what is worn.
 */
import { itemDef } from './items';
import type { ItemStack, ItemType } from '../shared/types';
import type { Goblin } from './state';

export type WearSlot = 'body' | 'head';

const worn = (g: Goblin): ItemStack[] => [g.equipped.body, g.equipped.head].filter((s): s is ItemStack => !!s);

/** °C of warmth from clothes (fine ones half again). */
export const clothingWarmth = (g: Goblin): number =>
  worn(g).reduce((n, s) => n + (itemDef(s.type).wear?.warmth ?? 0) * (s.fine ? 1.5 : 1), 0);

/** Courtship charm from what is worn (a crown). */
export const charm = (g: Goblin): number => worn(g).reduce((n, s) => n + (itemDef(s.type).wear?.charm ?? 0), 0);

/** Multiplier on the wet penalty (a leaf cape sheds rain). */
export const wetMul = (g: Goblin): number => worn(g).reduce((m, s) => Math.min(m, itemDef(s.type).wear?.wetMul ?? 1), 1);

/** How good a piece is for its slot: warmth for the body, charm for the head. */
export function wearValue(t: ItemType | undefined, fine = false): number {
  const w = t ? itemDef(t).wear : undefined;
  if (!w) return 0;
  return (w.warmth ?? 0) * (fine ? 1.5 : 1) + (w.charm ?? 0) * 10 + (w.wetMul !== undefined ? 1 - w.wetMul : 0);
}

export const slotOf = (t: ItemType): WearSlot | null => itemDef(t).wear?.slot ?? null;

/** Clothing in the pack that beats what is worn in its slot. */
export function wearCandidate(g: Goblin): ItemStack | null {
  let best: ItemStack | null = null, gain = 0;
  for (const s of g.inventory) {
    const slot = slotOf(s.type);
    if (!slot) continue;
    const cur = g.equipped[slot];
    const d = wearValue(s.type, s.fine) - wearValue(cur?.type, cur?.fine);
    if (d > gain) { gain = d; best = s; }
  }
  return best;
}

/** Put `s` (from the pack) on; whatever it replaces goes back in the pack. */
export function putOn(g: Goblin, s: ItemStack): void {
  const slot = slotOf(s.type), i = g.inventory.indexOf(s);
  if (!slot || i < 0) return;
  g.inventory.splice(i, 1);
  const old = g.equipped[slot];
  if (old) g.inventory.push(old);
  g.equipped[slot] = s;
}

/** Wears or carries one of these already. */
export const hasItem = (g: Goblin, t: ItemType): boolean =>
  g.equipped.body?.type === t || g.equipped.head?.type === t || g.inventory.some((s) => s.type === t);

/** The best warmth the goblin wears or carries for its body. */
export function bodyWarmth(g: Goblin): number {
  let best = wearValue(g.equipped.body?.type, g.equipped.body?.fine);
  for (const s of g.inventory) if (slotOf(s.type) === 'body') best = Math.max(best, wearValue(s.type, s.fine));
  return best;
}

/** Extra pack slots from a carried basket. */
export const bagSlots = (g: Goblin): number => g.inventory.reduce((n, s) => Math.max(n, itemDef(s.type).bag ?? 0), 0);
export const hasBedroll = (g: Goblin): boolean => g.inventory.some((s) => itemDef(s.type).bedroll);
