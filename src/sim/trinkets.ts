/**
 * Trinkets (§12.1): shiny things goblins love. P5.9 brings the first ones, through the Shiny Gift; finding them
 * (`HuntTrinket`), displaying them at home, trading and stealing them come with the economy (P8).
 */
import { q4 } from '../shared/math';
import type { Rarity } from '../shared/types';
import type { Goblin, Trinket } from './state';
import type { World } from './world';
import { allocId } from '../shared/ids';

export const TRINKET_KINDS: Record<Rarity, readonly string[]> = {
  common: ['shiny_pebble', 'snail_shell', 'feather_bundle', 'glass_shard'],
  uncommon: ['bone_charm', 'old_coin'],
  rare: ['crystal', 'carved_figurine', 'ancient_tooth'],
  legendary: ['star_stone'],
};

/** A new trinket of this rarity, owned by `g` (its finder). */
export function giveTrinket(w: World, g: Goblin, rarity: Rarity): Trinket {
  const kinds = TRINKET_KINDS[rarity];
  const t: Trinket = {
    id: allocId(w.s), kind: kinds[w.rng.int(0, kinds.length - 1)]!, rarity, hue: q4(w.rng.range(0, 360)),
    foundBy: g.id, foundTick: w.s.tick, history: [g.id],
  };
  w.s.trinkets.push(t);
  g.trinkets.push(t.id);
  w.emit({ type: 'trinket_found', goblinId: g.id, trinket: t.kind, rarity, at: { ...g.pos } });
  return t;
}

export const trinketsOf = (g: Goblin, w: World): Trinket[] => g.trinkets.map((id) => w.s.trinkets.find((t) => t.id === id)).filter((t): t is Trinket => !!t);
