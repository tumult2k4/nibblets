/**
 * The lineage book (§13.4, P5.3; enriched in P5.8): everyone who ever lived, with what the family tree needs once
 * they are gone: parents, clan, true skin color (expressed hue, saturation, lightness; albinos pale) and how many
 * copies of each recessive allele they carried, so carriers can be highlighted among the dead too. Generations count
 * from the founders (0); a child is one past its older parent's generation.
 */
import { q4 } from '../../shared/math';
import { LOCUS_DEFS, type LocusDef } from './genetics/genome';
import { express } from './genetics/phenotype';
import type { ID } from '../../shared/types';
import type { Goblin, LineageEntry, WorldState } from '../state';

/** Recessive loci (tusks, albino): the family tree filters by who carries them. */
export const RECESSIVE = (LOCUS_DEFS as readonly LocusDef[]).filter((d) => d.kind === 'recessive').map((d) => d.key);

/** True skin color as born (an albino's is pale). */
export function skinOf(g: Goblin): [number, number, number] {
  const albino = express(g.genome, 'albino') === 1;
  return albino ? [q4(express(g.genome, 'skinHue')), 0.05, 0.85]
    : [q4(express(g.genome, 'skinHue')), q4(express(g.genome, 'skinSat')), q4(express(g.genome, 'skinLight'))];
}

/** Copies of each recessive allele (0, 1 = carrier, 2 = shows it). */
export function recessiveCounts(g: Goblin): Record<string, number> {
  return Object.fromEntries(RECESSIVE.map((k) => [k, g.genome[k].a + g.genome[k].b]));
}

/** A fresh lineage entry for a goblin. */
export const lineageEntry = (g: Goblin): LineageEntry => ({
  parents: g.parents, name: g.name, hue: q4(express(g.genome, 'skinHue')), born: g.bornTick, died: null,
  clan: g.clanId, skin: skinOf(g), rec: recessiveCounts(g),
});

/** Generation of everyone in the book (founders and anyone of unknown parents: 0). */
export function generations(s: WorldState): Map<ID, number> {
  const gen = new Map<ID, number>();
  const of = (id: ID, depth = 0): number => {
    const hit = gen.get(id);
    if (hit !== undefined) return hit;
    const ps = s.lineage[id]?.parents?.filter((p) => s.lineage[p]) ?? [];
    const v = ps.length && depth < 64 ? 1 + Math.max(...ps.map((p) => of(p, depth + 1))) : 0;
    gen.set(id, v);
    return v;
  };
  for (const k of Object.keys(s.lineage)) of(Number(k));
  return gen;
}

/** Circular mean of hues (degrees), or null for none. */
export function meanHue(hues: number[]): number | null {
  if (!hues.length) return null;
  let x = 0, y = 0;
  for (const h of hues) { x += Math.cos((h * Math.PI) / 180); y += Math.sin((h * Math.PI) / 180); }
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

export interface ClanStats { id: ID; name: string; generations: number; descendants: number; living: number; avgHue: number | null }

/** Per clan: how many generations deep it goes, how many were born into it, and the living's average hue. */
export function clanStats(s: WorldState): ClanStats[] {
  const gen = generations(s);
  return s.clans.map((c) => {
    const ids = Object.keys(s.lineage).map(Number).filter((id) => s.lineage[id]!.clan === c.id);
    const living = s.goblins.filter((g) => g.clanId === c.id);
    return {
      id: c.id, name: c.name,
      generations: ids.length ? 1 + Math.max(...ids.map((id) => gen.get(id) ?? 0)) : 0,
      descendants: ids.filter((id) => s.lineage[id]!.parents).length,
      living: living.length,
      avgHue: meanHue(living.map((g) => express(g.genome, 'skinHue'))),
    };
  }).filter((c) => c.living > 0 || c.descendants > 0);
}
