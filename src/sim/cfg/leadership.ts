/**
 * Leadership (§13.5–13.6, P8.4), reached as CFG.leadership: choosing a chief, the policies its personality sets, the
 * night watch, and the chief's justice. Ticks are sim ticks (10 a second); a day is 3600, a year 32 days.
 */
export const LEADERSHIP = {
  /** chief score (§13.6): reputation × 0.5 + age respect × 0.2 + the others' mean opinion of it × 0.3 */
  score: { reputation: 0.5, age: 0.2, opinion: 0.3 },
  /** age respect 0..100: 0 on growing up, 100 by `respectDays` of age (elders have it all) */
  respectDays: 80,
  /** the first chief is chosen on the morning of day `firstDay` (once they know each other a little), then on the
   * first morning of each year and the morning after a chief dies; `electAt` is the time of day */
  firstDay: 2, electAt: 0.08,
  /** policies (§13.6): a trait at `high` or more (or at `low` or less, for the law) sets one */
  policy: {
    high: 0.6, low: 0.35, workMul: 1.1, festivalMul: 1.5, watch: 2,
    /** how strict about theft: a mischievous chief is lax, an earnest one strict */
    law: { lax: 0.15, strict: 0.35 },
  },
  /** the night watch under a brave chief: the two bravest armed adults, picked at dusk, guard until dawn */
  watch: { pickAt: 0.66, scoreBonus: 0.5, minEnergy: 50 },
  /**
   * justice (§13.5): the chief takes up a known, unsettled theft by a thief whose good name does not cover it
   * (reputation under `below`), walks
   * over and pronounces: give it back (or a gift instead) — the thief must then go and say sorry — or, at reputation
   * `exileBelow` or lower (shifted by the law: a strict chief exiles sooner), two days' exile outside the village
   * (`exileDist` beyond the village radius; never in winter)
   */
  justice: {
    below: 0, exileBelow: -30, exileDays: 2, exileDist: 10, score: 0.45, range: 40, talkTicks: 40,
    thiefMood: -10, victimMood: 6, chiefReputation: 2, campScore: 1.5,
    /** a judged thief keeps its hands to itself for `restDays` (the usual rest after a theft is three) */
    restDays: 6,
  },
} as const;
