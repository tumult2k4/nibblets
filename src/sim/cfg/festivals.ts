/**
 * Festivals and music (§15.3, P8.5), reached as CFG.festivals. Ticks are sim ticks (10 a second); a day is 3600
 * ticks, a season 8 days, the full moon on day 4 of each season.
 */
export const FESTIVALS = {
  /**
   * The calendar (§15.3): the season, the day of it (0-based) and the time of day each starts. Sprout Day on the
   * first morning of spring; the Sun Feast at mid-summer on the first clear day from `day` to `lastDay`; Harvest
   * Night on the last evening of autumn; the Long Dark at mid-winter (the solstice), in the longhouse if there is one.
   */
  calendar: {
    sprout_day: { season: 'spring', day: 0, lastDay: 0, at: 0.2 },
    sun_feast: { season: 'summer', day: 4, lastDay: 6, at: 0.25 },
    harvest_night: { season: 'autumn', day: 7, lastDay: 7, at: 0.5 },
    long_dark: { season: 'winter', day: 4, lastDay: 4, at: 0.45 },
  },
  /** each lasts half a day (§15.3: "suspend work for a half day"); work scores × `workMul` while one is on */
  length: 0.5, workMul: 0.15,
  /** Starfall: the evening after a shooting star the village walks out to the crater (if it is within `range`) */
  starfall: { at: 0.5, range: 70 },
  /**
   * Merrymaking: an evening of music and dancing at the fire, now and then while times are good (food for `minDays`
   * in the store, nothing else held for `gapDays`, not in winter). The chance each evening is what a sociable chief
   * raises (× policies.festivals, §13.6): "more festivals".
   */
  merry: { at: 0.55, length: 0.3, chance: 0.1, gapDays: 3, minDays: 5 },
  /** a festival is only held with somewhere to hold it: a campfire or the longhouse (§15.3); in rain or snow the longhouse first */
  venue: { ring: [2.2, 3.8] as [number, number], longhouseRing: [0.6, 1.5] as [number, number] },
  /** going (JoinFestival): wanted at `score` × (0.7 + 0.6 × sociability), from anywhere within `range`, unless a need is under `minNeed` */
  join: { score: 0.8, range: 70, minNeed: 22, minEnergy: 15 },
  /** at the festival, per day of it: fun and company fill; who has been there `minTicks` shares in what it brings */
  at: { fun: 260, social: 220, minTicks: 300, every: 240 },
  /** what it brings everyone who came: mood (§7: festival +15) for `days`, a little more liking all round, reputation +1 (§13.6) */
  effects: {
    mood: 15, days: 1, opinion: 2, reputation: 1,
    /** Sun Feast: a shared meal (each takes a helping from the store), +15 mood for two days (§15.3), closer bonds */
    sunFeast: { days: 2, opinion: 4 },
    /** Sprout Day: who has a core plants it; the village's bushes grow × `growMul` for the rest of spring (orchard boost) */
    sprout: { growMul: 1.25, radius: 24 },
    /** Harvest Night: a bonfire, the chief's speech halfway (+`speechMood` for a day, the chief +`speechRep` reputation),
     * and courtship ×`courtMul` the next spring */
    harvest: { speechMood: 4, speechRep: 3, courtMul: 2 },
    /** Long Dark: stories for the dead ease grief (grief and mourning moods × `griefMul`), the elders who came are honored */
    longDark: { griefMul: 0.5, elderMood: 10, elderRep: 3 },
    /** Starfall: wonder at the crater */
    starfall: { curiosity: 40, mood: 8 },
  },
  /** music (§15.3, §11.1): a drum or a flute, the music circle (a nightly gathering spot), PlayMusic and Dance */
  music: {
    /** about one goblin in `share` keeps an instrument, the sociable and mischievous first */
    share: 4, want: 0.32,
    /** of an evening, a goblin with an instrument plays at the music circle (or the campfire) while its fun is under `below` */
    at: 0.56, until: 0.72, below: 75, score: 0.4, ticks: 500, range: 40,
    /** dancing: near someone playing (within `danceRange`) */
    danceRange: 7, danceScore: 0.42, danceTicks: 360,
    /** fun per day for the player and the dancers (listeners within `hear` get `listen` of it); the music circle × `circleMul` */
    fun: 300, listen: 0.3, hear: 7, social: 120, circleMul: 1.3,
    /** a music circle once someone knows it and has an instrument, and the village has `pop` goblins */
    circlePop: 8,
    /** the idea of one comes while playing (wherever the stones are), this many times as likely as an idea at hand */
    circleIdea: 8,
    /** a festival with a player among the dancers (or a music circle by the fire) is the merrier: × fun */
    festivalMusic: 1.3,
  },
  /** grown-ups need fun too from here on (§7.2: fun 30 a day, younglings ×2): `adultMul` of it, and a light mood weight */
  adultFun: { mul: 0.5, moodMul: 0.1 },
} as const;
