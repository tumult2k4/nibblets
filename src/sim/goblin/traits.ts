/**
 * Acquired traits (§7.7, P5.7): earned from life history, at most three, kept for life. Each is a small data entry:
 * how it is earned (checked once an in-game hour, staggered by id), weights on actions, a lasting nudge to the
 * personality, and an effect named where it happens. The first five:
 * - `veteran`: came through 5 fights on its feet → never panics (fight.ts), keeps watch and defends more readily.
 * - `scarred`: 2 scars → Gnashers think twice: they would rather bite someone else (gnasher.ts) and count it as
 *   half again in the crowd that makes them run.
 * - `green_thumb`: planted 25 times → what it plants grows half again as fast (plants.ts); plants and waters more.
 * - `orphan`: lost its parents young and was taken in (family.ts) → braver (+0.1) and shyer (−0.1) for life.
 * - `twin`: hatched with a twin (family.ts) → a strong bond from the start, and it feels what its twin feels
 *   (40 % of any mood swing of 4 or more, mood.ts).
 * `grudge_holder` (its grudges never fade, social.ts) is earned through theft and pranks (P8).
 * `returned` (P6.6): brought back from the grave by the god → piety +0.3 for life; it comes on top of the other three.
 */
import { CFG } from '../config';
import { clamp, q4 } from '../../shared/math';
import type { ActionId, Goblin, Personality } from '../state';
import type { World } from '../world';

const T = CFG.traits;

export type TraitId = 'veteran' | 'scarred' | 'green_thumb' | 'orphan' | 'twin' | 'grudge_holder' | 'returned';

export interface TraitDef {
  /** earned when this holds (checked hourly); traits without one are given by events */
  earn?: (g: Goblin) => boolean;
  /** utility weights on actions */
  actions?: Partial<Record<ActionId, number>>;
  /** a lasting nudge to the personality when gained */
  personality?: Partial<Personality>;
}

export const TRAITS: Record<TraitId, TraitDef> = {
  veteran: { earn: (g) => g.deeds.fights >= CFG.combat.veteranFights, actions: { guard: T.veteranWatch, defend_village: T.veteranWatch } },
  scarred: { earn: (g) => g.health.scars >= T.scarredScars },
  green_thumb: { earn: (g) => g.deeds.planted >= T.greenThumbPlanted, actions: { plant_seed: T.greenThumbWork, water_plant: T.greenThumbWork } },
  orphan: { personality: { bravery: T.orphanBravery, sociability: T.orphanSociability } },
  twin: {},
  grudge_holder: {},
  returned: { personality: { piety: T.returnedPiety } },
};
export const TRAIT_IDS = Object.keys(TRAITS) as TraitId[];

export const hasTrait = (g: Goblin, t: TraitId): boolean => g.traits.includes(t);

/** Give `g` trait `t` unless it has it or already carries three (`force`: even then). Returns true if gained. */
export function grantTrait(w: World, g: Goblin, t: TraitId, force = false): boolean {
  if (hasTrait(g, t) || (!force && g.traits.length >= T.max)) return false;
  g.traits.push(t);
  for (const [k, v] of Object.entries(TRAITS[t].personality ?? {}) as [keyof Personality, number][])
    g.personality[k] = q4(clamp(g.personality[k] + v, 0, 1));
  w.emit({ type: 'trait_gained', goblinId: g.id, trait: t, at: { ...g.pos } });
  return true;
}

/** Hourly per goblin (staggered): earn whatever its life has come to. */
export function updateTraits(w: World): void {
  const s = w.s;
  for (const g of s.goblins) {
    if ((s.tick + g.id * 7) % T.checkEvery !== 0 || g.traits.length >= T.max) continue;
    for (const t of TRAIT_IDS) if (TRAITS[t].earn?.(g)) grantTrait(w, g, t);
  }
}

/** Product of the goblin's trait weights for an action. */
export function traitMul(g: Goblin, a: ActionId): number {
  let m = 1;
  for (const t of g.traits) m *= TRAITS[t as TraitId]?.actions?.[a] ?? 1;
  return m;
}

/** Its living twin: a sibling with the trait, hatched within two days of it. */
export function twinOf(g: Goblin, w: World): Goblin | undefined {
  if (!hasTrait(g, 'twin')) return undefined;
  for (const r of g.relationships) {
    if (r.bond !== 'sibling') continue;
    const o = w.goblin(r.targetId);
    if (o && hasTrait(o, 'twin') && Math.abs(o.bornTick - g.bornTick) < 2 * CFG.time.dayTicks) return o;
  }
  return undefined;
}

/** Twins start out close: each thinks the world of the other. */
export function bondTwins(g: Goblin, o: Goblin): void {
  for (const [a, b] of [[g, o], [o, g]] as const) {
    const r = a.relationships.find((x) => x.targetId === b.id);
    if (r) r.opinion = q4(Math.min(100, Math.max(r.opinion, CFG.family.familyOpinion + T.twinOpinion)));
  }
}
