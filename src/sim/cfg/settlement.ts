/**
 * Settlement tunables (§11.1–11.2, §13.3, P7.3), reached as CFG.settlement: the hearth and its stew, the longhouse,
 * the well and the nursery. Ticks are sim ticks (10 a second).
 */
export const SETTLEMENT = {
  hearth: {
    /** a home's owner who knows the hearth plans one against its wall (by day), once the store holds `planDays` of food */
    planScore: 0.32, planDays: 4,
    /** a banked hearth under its hood burns this fraction of a campfire's fuel, whatever the weather */
    burn: 0.25,
  },
  stew: {
    /** a stew takes 1 apple + 1 mushroom + 1 fish or meat, or failing that 2 of any of them (§11.2) */
    ticks: 150, batch: 2,
    /** cooked at a lit hearth within `range` of the store, while the store holds `minDays` of food and fewer than
     * `perGoblin` stews a goblin */
    range: 30, minDays: 6, perGoblin: 0.3, score: 0.3,
    /** apples go into stew only past this many surplus apples (drying and mash come first); the cook keeps the cores */
    appleSpare: 12,
    /** eating it: a day's +8 mood; eaten together, +10 social on top of the shared meal */
    mood: 8, moodDays: 1, social: 10,
  },
  longhouse: {
    /** planned once someone knows it and a village of this many goblins has this many homeless adults (it sleeps eight) */
    homeless: 1, pop: 14,
    /** …and only once it has this many finished homes */
    homes: 4,
  },
  well: {
    /** planned once someone knows it and the nearest water is this far from the village center */
    farWater: 8,
    /** a well counts as this much closer than a shore when choosing where to drink (no wading, no bank) */
    bonus: 2,
  },
  nursery: {
    /** eggs laid within `range` of home go to the nursery; inside `radius` an egg stays warm (§13.3) */
    range: 40, radius: 1.4, spots: 6,
  },
} as const;
