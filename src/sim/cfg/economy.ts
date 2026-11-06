/**
 * Settlement economy tunables (§11, P7.2–P7.5), reached as CFG.economy: fishing, cooking, clay and the kiln, buckets
 * and pots. Ticks are sim ticks (10 a second).
 */
export const ECONOMY = {
  fishing: {
    /** how far a goblin looks for fish to go after, and how close to the shore the fish must be */
    range: 30, near: 4,
    /** cast, then wait for a bite: a random span, shorter with forage skill and with more fish about */
    castTicks: 40, wait: [150, 420] as [number, number], skillMul: 0.08, catch: 0.7, catchPerLevel: 0.03,
    base: 0.3, rodWant: 0.3,
    /** rods the village keeps at most, per goblin */
    rodShare: 0.25,
    /** the rod idea comes this many times as readily within `ideaRange` of fish in the shallows */
    ideaNear: 3, ideaRange: 8,
  },
  /** eating raw fish or meat now and then brings on gut rot (§11.2: 10 %) */
  rawGutRot: 0.1,
  cook: {
    /** a cook takes up to `batch` raw fish or meat from the store to a lit campfire within `range` of it */
    ticks: 90, batch: 3, range: 25, score: 0.34,
  },
  clay: {
    /** dug on marsh or on sand and meadow next to water; the village keeps a little before the kiln, more after */
    digTicks: 140, qty: 2, before: 1, target: 6, want: 0.28, range: 40,
  },
  kiln: {
    /** a firing: within `range` of a kiln; a spark may jump to a plant or wooden building next to it */
    range: 30, spark: 0.05, sparkNear: 1.6,
  },
  bucket: {
    /** a bucket carries enough water for ×5 the plants (§11.1), and puts out fire ×3 as fast as stomping */
    waterMul: 5, fireMul: 3, want: 0.22,
    /** buckets the village keeps at most, per goblin */
    share: 0.25,
  },
  pot: {
    /** each pot in the stockpile keeps `per` food from spoiling as fast (×`shelfMul` shelf life) */
    per: 10, shelfMul: 1.5, want: 0.25, max: 6,
  },
} as const;
