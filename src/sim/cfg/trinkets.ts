/**
 * Trinkets (§12.1–12.2, P8.2), reached as CFG.trinkets: what they are worth, where and how goblins find them,
 * how they are shown off at home. Ticks are sim ticks (10 a second); a day is 3600.
 */
export const TRINKETS = {
  /** base value by rarity (§12.2); perceived value: hoarders ×2 */
  value: { common: 4, uncommon: 10, rare: 24, legendary: 60 },
  hoarderMul: 2,
  /** food: gluttons value it ×1.5, everybody ×2 in winter */
  gluttonFoodMul: 1.5, winterFoodMul: 2,
  /** `HuntTrinket`: a search at a shore or a rock pile within `range` of the center; `findChance` per search (a
   * washed-up glint is always found); rarity of a find; curiosity and fun from the search; not again for `restDays` */
  hunt: {
    score: 0.2, range: 24, searchTicks: 150, findChance: 0.12, restDays: 0.5,
    rarity: { common: 0.74, uncommon: 0.2, rare: 0.06 },
    curiosity: 14, fun: 16, wantBelow: 75,
  },
  /** a storm washes up 1–3 glints along the shore near the village; they lie there for 3 days */
  storm: { glints: [1, 3] as [number, number], days: 3, range: 26 },
  /** finds on the way: a stone mined (5 %), a beaten Gnasher (30 %) */
  mineChance: 0.05, enemyDrop: 0.3,
  /** a home's shelf holds up to 6; sleeping under it: +2 mood each, for a day */
  shelf: { max: 6, moodPer: 2, moodDays: 1, score: 0.3 },
  /** a trinket as a courtship gift: welcome +0.02 per point of value to the one courted, at most +0.3 */
  courtPerValue: 0.02, courtMax: 0.3,
} as const;
