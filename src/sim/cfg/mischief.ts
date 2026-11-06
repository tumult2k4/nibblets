/**
 * Mischief, theft and their fallout (§13.5–13.6, P8.3), reached as CFG.mischief: pranks, theft with witnesses,
 * apologies, reputation and brawls. Ticks are sim ticks (10 a second); a day is 3600.
 */
export const MISCHIEF = {
  /** pranks, by the mischievous (> 0.6) on someone within `range`, once in three days at most: the victim −5 opinion (+3 if
   * it is mischievous itself and finds it funny) and −4 mood; the prankster +6 mood (+25 fun for a youngling) */
  prank: {
    minMischief: 0.6, score: 0.22, range: 18, restDays: 3, victimOpinion: -5, funnyOpinion: 3, funnyMischief: 0.6,
    victimMood: -4, victimDays: 0.5, prankerMood: 6, prankerDays: 0.5, prankerFun: 25, hideDist: [3, 6] as [number, number],
    scareSafety: 20, mushroomMood: -6, paintMood: -3, paintDays: 3, workTicks: 60,
  },
  /** theft (§13.5): temptation = need × 0.6 (food only) + greed × 0.4 + mischief × 0.3 + dislike × 0.3 − law; it is
   * tried above `minTemptation`, scored `score` × (0.4 + temptation), not again for `restDays` */
  theft: {
    minTemptation: 0.36, score: 0.6, range: 22, restDays: 3, law: 0.25, ownerAway: 8, workTicks: 50,
    /** witnesses: awake goblins within `vision`; each thinks −15 of the thief; the victim, once it knows, −25 */
    vision: 7, witnessOpinion: -15, discovered: -25,
    /** the victim: −12 mood for 2 days when it knows who; −8 for a day when it only finds the thing gone */
    robbedMood: -12, robbedDays: 2, missingMood: -8, missingDays: 1,
    /** hearsay passed on in a chat: the listener thinks −8 of the thief */
    hearsayOpinion: -8,
  },
  /** apologies: a thief that was caught and is sociable (≥ 0.5) goes to say sorry after half a day, within 4 days:
   * gives the thing back if it still has it (else a gift), +15 opinion, and the grudge eases */
  apology: { minSociability: 0.5, afterDays: 0.5, withinDays: 4, opinion: 15, score: 0.35, reputation: 2, range: 40, talkTicks: 30 },
  /** reputation (§13.6), −100..100, easing 2 % a day toward 0; building counts for all but homes and the many small
   * pieces (fence, gate, bridge spans), its +5 shared by the crew */
  reputation: { notCommunal: ['hut', 'stone_hut', 'fence', 'gate', 'bridge'] as readonly string[], communalBuild: 5, kill: 8, gift: 1, teach: 3, theft: -10, coward: -4, tantrum: -3, brawl: -3, prank: -1, decay: 0.02 },
  /** brawls (non-lethal): two who loathe each other (opinion past −50, hotter the lower), or a victim and the thief it
   * knows (`wronged`, for two days unless it says sorry), come to blows when within 6 tiles, the brave sooner; fists every 20 ticks for 80, 3 damage, never below half health; both −10
   * mood and −10 opinion; a friend of either nearby may pull them apart */
  brawl: {
    range: 6, score: 0.5, minAnger: 0.3, wronged: 0.4, restDays: 1, ticks: 80, every: 20, damage: 3, hpFloor: 0.5, bruiseChance: 0.15,
    mood: -10, moodDays: 1, opinion: -10, breakUpRange: 6, breakUpChance: 0.35,
  },
  /** grudge holder (§7.7): robbed twice, or pranked four times */
  grudge: { robbed: 2, pranked: 4 },
} as const;
