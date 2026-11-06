/**
 * Place names in words (§15.6, P9.2): the sim keeps a name's parts (the lay of the land, the cause's word or the
 * goblin), this turns them into "Sad Pond" or "Trauerteich", "Grubnok's Hill" or "Grubnoks Hügel". Shared by the map
 * labels and the prompts, so journals use the same names the player sees.
 */
import type { Vec2 } from '../shared/types';
import type { WorldState } from '../sim/state';
import { placeAt, type Place, type PlaceCause, type PlaceFeature } from '../sim/places';

export type NameLang = 'en' | 'de';

const FEATURE: Record<NameLang, Record<PlaceFeature, string>> = {
  en: { hill: 'Hill', hollow: 'Hollow', pond: 'Pond', shore: 'Shore', ford: 'Ford', wood: 'Wood', meadow: 'Meadow', rocks: 'Rocks', bog: 'Bog', dunes: 'Dunes', peak: 'Peak' },
  de: { hill: 'Hügel', hollow: 'Senke', pond: 'Teich', shore: 'Ufer', ford: 'Furt', wood: 'Wäldchen', meadow: 'Wiese', rocks: 'Felsen', bog: 'Moor', dunes: 'Dünen', peak: 'Gipfel' },
};
/** English: "<Word> <Feature>"; German: one compound, "<Word><feature>" */
const WORDS: Record<NameLang, Record<PlaceCause, string[]>> = {
  en: { death: ['Sad', 'Weeping', 'Quiet'], battle: ['Gnasher', 'Brave', 'Fang'], discovery: ['Bright', 'Wonder', 'Lucky'], festival: ['Merry', 'Dancing', 'Song'], star: ['Star', 'Glimmer', 'Starfall'] },
  de: { death: ['Trauer', 'Tränen', 'Still'], battle: ['Gnasher', 'Mut', 'Zahn'], discovery: ['Funken', 'Wunder', 'Glücks'], festival: ['Freuden', 'Tanz', 'Lieder'], star: ['Stern', 'Glimmer', 'Sternschnuppen'] },
};

/** A feature of the land in words: "Pond", "Teich". */
export const featureWord = (f: PlaceFeature, lang: NameLang): string => FEATURE[lang][f];

/** "Grubnok's" / "Grubnoks" (a name ending in an s sound takes just the apostrophe). */
function possessive(name: string, lang: NameLang): string {
  const sibilant = /[sxzß]$/i.test(name);
  return lang === 'de' ? (sibilant ? `${name}'` : `${name}s`) : sibilant ? `${name}'` : `${name}'s`;
}

export function placeName(p: Place, lang: NameLang): string {
  const f = FEATURE[lang][p.feature];
  if (p.person) return `${possessive(p.person, lang)} ${f}`;
  const words = WORDS[lang][p.cause];
  const w = words[p.word % words.length]!;
  return lang === 'de' ? `${w}${f.toLowerCase()}` : `${w} ${f}`;
}

/** The name of the place at `p`, if it has one. */
export function placeNameAt(s: WorldState, p: Vec2, lang: NameLang, near?: number, asOf?: number): string | null {
  const pl = placeAt(s, p, near, asOf);
  return pl ? placeName(pl, lang) : null;
}
