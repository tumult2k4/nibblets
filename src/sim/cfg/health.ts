/**
 * Health tunables (§14.3, P6.1), kept apart from config.ts to keep that file readable; CFG.health is this object.
 * Rates are per in-game hour unless they say otherwise; days are in-game days.
 */
export interface DiseaseDef {
  transmission: 'contact' | 'food' | 'cold';
  incubationDays: number; durationDays: number;
  /** chance to die when it runs its course (× the vigor factor); only for `deadlyFor` stages when given */
  mortality: number; deadlyFor?: readonly string[];
  symptoms: { workMul: number; hungerMul: number; color?: string };
  /** hp lost per day while sick (never below `drainFloor`; the mortality roll decides death) */
  hpDrainPerDay: number;
  /** chance per hour that a sick goblin passes it on to one within `contactRange` (contact diseases) */
  contact: number;
  /** chance per hour that a sick goblin passes it on to a hut-mate asleep in the same hut */
  sleepShare: number;
  /** after recovering: this many days immune */
  immuneDays: number;
  /** how strongly a sick goblin wants to lie down (RestSick base score) */
  rest: number;
  emote?: 'sneeze' | 'sick';
}

export const HEALTH = {
  diseases: {
    sniffles: { transmission: 'contact', incubationDays: 1, durationDays: 3, mortality: 0, symptoms: { workMul: 0.9, hungerMul: 1 }, hpDrainPerDay: 0, contact: 0.02, sleepShare: 0.04, immuneDays: 8, rest: 0.18, emote: 'sneeze' },
    gut_rot: { transmission: 'food', incubationDays: 0.25, durationDays: 2, mortality: 0.03, symptoms: { workMul: 0.7, hungerMul: 1.4 }, hpDrainPerDay: 50, contact: 0, sleepShare: 0, immuneDays: 0, rest: 0.5, emote: 'sick' },
    shivers: { transmission: 'cold', incubationDays: 0, durationDays: 2, mortality: 0.05, deadlyFor: ['hatchling', 'youngling', 'elder'], symptoms: { workMul: 0.5, hungerMul: 1.2 }, hpDrainPerDay: 20, contact: 0, sleepShare: 0, immuneDays: 0, rest: 0.55 },
    spotted_fever: { transmission: 'contact', incubationDays: 2, durationDays: 5, mortality: 0.12, symptoms: { workMul: 0.6, hungerMul: 1.2, color: '#6fbf3f' }, hpDrainPerDay: 40, contact: 0.05, sleepShare: 0.1, immuneDays: 64, rest: 0.65 },
  } as Record<string, DiseaseDef>,
  /** neighbours closer than this can catch a contact disease; a chat between the two multiplies the chance */
  contactRange: 2, chatMul: 3,
  /** a hut with this many sleepers (children too) is crowded: sleep sharing ×crowdMul */
  crowded: 3, crowdMul: 1.5,
  /** sniffles: chance per hour while wet and colder than `chillBelow` (soaked goblins rarely drop below ~75) */
  chillBelow: 80, chillSniffles: 0.04,
  /** shivers: warmth at (or within 1 of) 0 for this many ticks (2 h) */
  shiverTicks: 300,
  /** gut rot: a redcap brings it on with this chance; so does the unit of a stack about to rot (rot ≥ rottenAt) */
  redcapGutRot: 0.5, rottenAt: 0.7, rottenGutRot: 0.15,
  /** spotted fever outbreaks: about `feverYearlyChance` a year when more than `feverMinPop` goblins live */
  feverMinPop: 25, feverYearlyChance: 0.5,
  /** vigor (0.8–1.2) shapes resistance and recovery: chance × (1 − (v − 1) × resistK), speed × (1 + (v − 1) × recoverK) */
  resistK: 2.5, recoverK: 2,
  /** recovery speed: lying down (RestSick or asleep at home) ×restMul, tended within the day ×tendMul */
  restMul: 1.5, tendMul: 1.5, drainFloor: 5,
  /** TendSick: friends (opinion ≥ tendOpinion) or kin within tendRange sit with a patient for tendTicks; it lasts tendDays */
  tendOpinion: 20, tendRange: 24, tendTicks: 150, tendDays: 1, tendOpinionGain: 4, tendBase: 0.32,
  /** RestSick lies down for this long (then decides again); injured goblins under this share of hp rest too */
  restTicks: 300, restHurtBelow: 0.5, restHurt: 0.3,
  /** how often a sick goblin sneezes or retches (ticks, on average) */
  emoteEvery: 400,
  /** P6.5 herbal remedy: a dose makes the illness run its course ×remedyMul as fast and its mortality ×remedyMortality;
   * crafters keep `remedyTarget` in store (want remedyWant, + remedySickWant while someone ill goes untreated and none
   * is left); the sick fetch one from a stockpile within remedyFetch, carers within tendRange bring one; the idea comes
   * ×remedyIdeaBase as often as other ideas, and ×remedyIdeaMul again while anyone is ill */
  remedyMul: 2, remedyMortality: 0.5, remedyWant: 0.3, remedySickWant: 0.35, remedyTarget: 2, remedyFetch: 30, remedyIdeaBase: 2, remedyIdeaMul: 3,
  /** one who knows the remedy forages a glowcap for it (score × remedy want) when there is none in store or pack */
  herbForage: 0.9,
  /** quarantine (village policy): the contagious sleep and rest in an empty hut within quarantineRange, else lie out at
   * least apartFrom from everyone; their RestSick wants at least quarantineRest */
  quarantineRange: 40, apartFrom: 5, quarantineRest: 0.45,
} as const;
