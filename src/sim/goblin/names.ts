import type { Rng } from '../../shared/rng';

export const NAME_PREFIXES = ['Gri', 'Snag', 'Pip', 'Mog', 'Wort', 'Nib', 'Zib', 'Krik', 'Bog', 'Fizz', 'Tok', 'Rak', 'Mib', 'Grub', 'Skrit'];
export const NAME_SUFFIXES = ['gle', 'wick', 'nok', 'zle', 'by', 'kin', 'rot', 'sap', 'nip', 'lump', 'tooth', 'wort'];

function split(name: string): { pre: string | null; suf: string | null } {
  const pre = NAME_PREFIXES.find((p) => name.startsWith(p)) ?? null;
  const rest = pre ? name.slice(pre.length).toLowerCase() : name.toLowerCase();
  const suf = NAME_SUFFIXES.find((s) => rest === s) ?? null;
  return { pre, suf };
}

/** Seeded syllable name; children have a 40% chance to inherit a syllable from a parent (§4.6). */
export function makeName(rng: Rng, taken: ReadonlySet<string>, parentNames: string[] = []): string {
  for (let tries = 0; tries < 60; tries++) {
    let pre = rng.pick(NAME_PREFIXES);
    let suf = rng.pick(NAME_SUFFIXES);
    if (parentNames.length && rng.chance(0.4)) {
      const parent = split(rng.pick(parentNames));
      if (rng.chance(0.5) && parent.pre) pre = parent.pre;
      else if (parent.suf) suf = parent.suf;
    }
    let name = pre + suf;
    if (tries > 40) name += ` ${tries}`;
    if (!taken.has(name)) return name;
  }
  return `Nib${taken.size}`;
}
