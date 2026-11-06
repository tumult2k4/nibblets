/**
 * Visitors from the rival clans (§16, §12.5, P10.2), reached as CFG.visitors: scouts at first contact, traders while
 * a clan is on good terms, and the village's trading with them and among its own goblins.
 */
export const VISITORS = {
  /** tiles a second on foot; how close to the village center a visitor stands, and how far it strolls about there */
  speed: 1.8, standFrom: 5, standTo: 9, stroll: 4, strollEvery: 600,
  /** a scout watches the village this long (ticks), then goes home; goblins who greet it warm its clan (once each, at
   * most `greetMax` a visit) */
  scout: { stay: [1800, 3000] as [number, number], greet: 2, greetMax: 6 },
  /** a trader comes every `every` days (traders' clans `tradersMul` as long) while the relation holds `minRelation`,
   * arriving between `arriveHour` and noon and leaving at `leaveHour`; three offers */
  trader: { every: [5, 9] as [number, number], tradersMul: 0.6, minRelation: 0, arriveHour: 8, leaveHour: 18, offers: 3 },
  /** what the clan asks over what it gives (value for value), and how much a generous goblin lets that slide */
  greed: [1, 1.3] as [number, number], generous: 0.5,
  /** a deal is struck: the relation rises by `trade` (by `visit` more when the trader leaves having traded) */
  trade: 4, visit: 2,
  /** the village pays only from what it can spare: food beyond `spareFoodDays` days, other things beyond `keep` */
  spareFoodDays: 6, keep: 8,
  /** a recipe or a trinket among the offers, this often */
  recipeChance: 0.35, trinketChance: 0.4,
  /** what a goblin trading with a goblin may get for a trinket, and how often (a day) one goblin trades */
  swapRange: 12, swapRestDays: 1,
  /** what a trade action is worth to a goblin (sociable and industrious ones like it more) */
  score: 0.3, greetScore: 0.28,
};
