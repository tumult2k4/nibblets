/**
 * Mood (§7.5, P8.1), reached as CFG.mood: what mood does to work, the everyday modifiers, the emotions shown, mood
 * breaks and inspiration. Ticks are sim ticks (10 a second); a day is 3600.
 */
export const MOOD = {
  /** needs (hunger, thirst, energy, curiosity; warmth only aches): ±0.35 a point either side of 50, −15 more under 15 */
  needs: { lift: 0.35, ache: 0.35, dire: 15, curiosityAche: 0.35, curiosityDire: 15 },
  /** real hardship on top (held while it lasts): starving or parched (under 10) −40, freezing (warmth under 10) −35,
   * exhausted (energy under 5) −15; together, or with a loss, they bring a break */
  hardship: { starving: [10, -40], parched: [10, -40], freezing: [10, -35], exhausted: [5, -15], ticks: 300 },
  /** work speed ×0.7 at −100, ×1 at 0, ×1.2 at +100 */
  work: { low: 0.7, high: 1.2 },
  /** everyday modifiers: a favorite food (+6, half a day), a full moon for the pious (+3 for the night), cold rain on
   * the skin (−5 while it lasts) */
  favorite: { amount: 6, days: 0.5 },
  moon: { amount: 3, piety: 0.6, within: 0.08 },
  rain: { amount: -5, warmthBelow: 45, ticks: 300 },
  /** emotions: excited when mood is past `excitedAt` and a fresh lift of `liftAt` or more is still on; angry while a
   * grievance of `angryAt` or worse weighs */
  emotion: { excitedAt: 60, liftAt: 8, angryAt: -8 },
  /** a break: mood under `below` for `afterDays`, then a roll by personality; none again for `coolDays` */
  breaks: {
    below: -70, afterDays: 0.5, coolDays: 2,
    /** how long each lasts, and the relief after it (the mood it gives back, for half a day) */
    sulkDays: 0.5, wanderDays: 1, bingeItems: 4, relief: { tantrum: 30, sulk: 20, binge: 25, wander_off: 30 },
    /** wandering: walked to a spot this far from the center; a quarter come back with a trinket */
    wanderDist: [18, 30] as [number, number], trinketChance: 0.25,
    /** a tantrum with nothing to smash takes it out on the home (hp) */
    homeDamage: 8,
  },
  /** inspiration: mood over `above` for `days` lights a day of it; not again within `coolDays` */
  inspire: { above: 80, days: 1, coolDays: 4, ticks: 3600 },
} as const;
