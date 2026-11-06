/**
 * Character (§5 epithets, §7.6 life drift, §7.7 the last acquired traits; P8.7), reached as CFG.character.
 */
export const CHARACTER = {
  /** epithets earned by deeds, the first that fits (the rarer deeds first, as listed in epithets.ts); "Old" comes with
   * being an elder, if nothing else. Founders build and give a lot (30–35 builds, up to 33 gifts by day 48), hence the
   * high marks there */
  epithets: { brave: 3, scrapper: 3, lightfingers: 6, skytouched: 6, trickster: 15, piper: 12, devout: 30, greenthumb: 20, generous: 25, builder: 50 },
  /** personality drift a notable event (§7.6), never more than `cap` from the baseline */
  drift: {
    cap: 0.2,
    fought: { bravery: 0.01 }, robbed: { sociability: -0.01 }, festival: { sociability: 0.01 }, starfall: { piety: 0.01 },
    child_lost: { bravery: -0.01, piety: 0.01 }, prayed: { piety: 0.003 },
    /** P8.8, daily: the young under a wrathful god; everyone while the village leans on food from the sky (dependence) */
    cowed: { bravery: -0.002 }, dependent: { industry: -0.002 },
  },
  /** `gourmand`: ate `cooked` cooked meals → +`savour` mood for half a day from cooked food, `raw` from raw meat or fish */
  gourmand: { cooked: 10, savour: 5, raw: -4 },
  /** `night_owl`: kept the night watch `watches` times → sleeps in the morning (`sleep` of the day) and is up all
   * night; guards × `guard` */
  nightOwl: { watches: 5, sleep: [0.05, 0.35] as const, guard: 1.5 },
};
