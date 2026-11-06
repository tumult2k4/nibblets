/**
 * Wildlife tunables (§8.4, P7.1), reached as CFG.wildlife. Critters decide every `every` ticks (staggered by id) and
 * move every tick; speeds are tiles per tick. Each kind's cap follows its food, so populations rise and fall with it.
 */
export const WILDLIFE = {
  every: 10,
  /** a day's roll for each critter: breed while fed (fed ≥ `breedFed`) and under the cap; starve at fed 0 */
  breedFed: 0.6,
  hopper: {
    /** one hopper per this much grass (sum of patch density), at most `max` */
    perGrass: 6, max: 18, start: 0.6,
    hp: 10, speed: 0.06, flee: 0.16, fear: 4.5, sight: 9, wander: 6,
    /** a meal: grass density eaten (the patch thins), or a bite of a sprout or sapling (hp) */
    graze: 0.05, nibble: 20, eatTicks: 40, meal: 0.3,
    hungerPerDay: 0.5, breed: 0.18, arrive: 0.25,
  },
  chirp: {
    /** one chirp per this many grown trees plus fruiting bushes, at most `max` */
    perPerch: 6, max: 14, start: 0.6,
    hp: 6, speed: 0.12, flee: 0.22, fear: 5, sight: 18, wander: 14, height: 3,
    /** a meal is one fruit off a bush or tree */
    eatTicks: 60, meal: 0.35, hungerPerDay: 0.5,
    /** with no fruit about they peck seeds in the grass: this share of a meal */
    peck: 0.5, breed: 0.15, arrive: 0.3,
    /** a feather drops when a chirp is flushed, or now and then from a perch (per hour) */
    flushFeather: 0.2, moultPerHour: 0.01,
  },
  fish: {
    /** one fish per this many water tiles, at most `max`; they come back slowly when fished out */
    perWater: 70, max: 40, start: 0.8, speed: 0.03, wander: 5, breed: 0.12,
  },
  glimmerfly: {
    /** at dusk they rise over marsh (one per `perMarsh` marsh tiles, +`perGlowcap` per glowcap), gone at dawn */
    perMarsh: 15, perGlowcap: 1, max: 30, speed: 0.025, lure: 7, wander: 3,
  },
  /** a hopper brought down: what it leaves */
  hopperDrops: { meat: 1, bone: 1, pelt: 1 },
  /** a sling stone's damage (§11.1: 10) */
  huntDmg: 10,
  /** sling hunting (P7.1): range in tiles, a throw every `aimTicks`, hit chance base + per combat level */
  hunt: {
    range: 7, aimTicks: 35, hit: 0.4, hitPerLevel: 0.06, sight: 22, base: 0.32, wantFood: 0.4, tries: 4,
    /** the village wants meat while its food lasts fewer than `days` days; pelts and bones while it has fewer than these */
    days: 8, slingWant: 0.35,
    /** the sling idea comes this many times as readily with a hopper within `ideaRange` */
    ideaNear: 3, ideaRange: 12,
  },
} as const;
