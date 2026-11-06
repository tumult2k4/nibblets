/**
 * The village's commons (§12.3–12.4, §11.1, P7.5), reached as CFG.commons: the stockpile zones, hauling, village
 * demand, and the fur cloak, war paint and bone necklace. Ticks are sim ticks (10 a second).
 */
export const COMMONS = {
  zones: {
    /** once the village is settled a material zone is marked `ring` tiles from the food store (the old stockpile) */
    ring: [3, 6] as [number, number], every: 300,
  },
  haul: {
    /** loose things lying within `radius` of the center are carried to their zone, up to `load` at a time, picking
     * up piles within `gather` of each other */
    radius: 18, load: 8, gather: 4, score: 0.24,
  },
  demand: {
    /** recomputed every `every` ticks: food under `foodDays`, unarmed adults once enemies have been seen, homeless
     * adults, buildings below `repairBelow` of their hp */
    every: 300, foodDays: 3, repairBelow: 0.7, repairFull: 3,
    /** an action that meets a shortfall scores up to ×(1 + boost × shortfall × (0.4 + industry)) */
    boost: 0.5,
  },
  adorn: {
    /** a fur cloak keeps 9 °C of the cold off; a bone necklace counts ×1.5 in a crowd a Gnasher fears, and is shunned
     * like a scar (×1.5 the distance); war paint makes the wearer +0.3 braver in a fight, for a day */
    cloakWarmth: 9, necklaceFear: 1.5, paintBravery: 0.3, paintDays: 1, paintMood: 3,
    /** wants: a necklace for the brave and the vain; war paint once Gnashers have been seen, for the brave */
    necklaceWant: 0.12, paintWant: 0.2,
    /** a fireplace keeps the ash of what it burned (at most `ashKeep`); whoever tends it clears it, and carries it to
     * the store while the store holds fewer than `ashStore` (the rest is scattered) */
    ashKeep: 3, ashStore: 6,
  },
} as const;
