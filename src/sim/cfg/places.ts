/**
 * Place names (§15.6, P9.2), reached as CFG.places: a notable event where no place has a name yet names it.
 */
export const PLACES = {
  /** no two names within `spacing` tiles; at most `max` in a world; `near`: a spot this close counts as at the place */
  spacing: 9, max: 40, near: 6,
  /** a place named after the goblin behind the deed (the dead, the victor, the finder), this share of the time */
  personShare: 0.5,
  /** how many words each cause has to pick from (their wording is the UI's and the prompts', by language) */
  words: { death: 3, battle: 3, discovery: 3, festival: 3, star: 3 },
  /** the lay of the land: a hill stands `rise` above the ground within `around` tiles, a hollow as far below; a
   * pond is water with fewer than `pondTiles` water tiles within `pondR` */
  rise: 0.035, around: 6, waterR: 3, pondR: 8, pondTiles: 60,
};
