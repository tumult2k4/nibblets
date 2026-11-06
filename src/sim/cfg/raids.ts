/**
 * Raids by rival goblins, the chief's gifts, and exiles who go over to a clan (§16, P10.3), reached as CFG.raids
 * (the raider's fighting numbers also as CFG.enemies.raider).
 */
export const RAIDS = {
  /** a clan this hostile (or worse), hungry and fierce sends raiders on its dusk update, at most every `restDays` */
  relation: -40, fierce: 0.5, restDays: 5, firstDay: 6,
  /** how many: a quarter of the clan, within this */
  size: [3, 6] as [number, number], perPop: 4,
  /** a raider: goblin-sized, armed with a club (it drops it when it falls) */
  raider: { hp: 45, dmg: 9, speed: 2.1, fleeAt: 0.4, armor: 1 },
  /** each takes this much food from the store, runs from this many armed goblins around it, fights back at whoever
   * strikes it (a swing every `swingEvery` ticks, hitting this often), and goes home after `stayHours` whatever */
  stealQty: 4, crowdFlee: 3, crowdRadius: 4, swingEvery: 14, swingHit: 0.6, fightRange: 1.3, stayHours: 6,
  /** the raid sours the clan on the village by `raid`; each raider that falls by `slain` more */
  raid: -3, slain: -5,
  /** the chief's gift: to a clan under `below` every `everyDays` at most, `food` apples' worth (or the best spare
   * stack), warming it by value × `perValue` within [min, max]; worth more to a hungry clan. To a hostile clan the
   * chief gives even when only `hostileKeep` days of food would be left: peace is worth more than a full store */
  gift: { hostileKeep: 2, below: 30, everyDays: 4, food: 8, perValue: 0.5, min: 3, max: 12, hungryMul: 1.5, score: 0.36, hostileScore: 0.2, maxHours: 8 },
  /** an exile whose time is up may go over to the clan that likes the village best instead of coming home */
  defect: { base: 0.15, wanderlust: 0.35, grudge: 0.25, mood: 0.2, friendly: 4, hostile: -4, missed: -8, missedDays: 2 },
};
