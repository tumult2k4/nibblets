/**
 * Garden and road tunables (§8.3, §10.4–10.5, §11.1, P7.4), reached as CFG.garden: garden plots, the compost heap,
 * stone paths and bridges. Ticks are sim ticks (10 a second).
 */
export const GARDEN = {
  plot: {
    /** plants inside grow this much faster; hoppers can't get in (§11.1) */
    growth: 1.4,
    /** one plot, and one more per `perGoblins` goblins, up to `max`; sited `ring` tiles from the center on good soil */
    perGoblins: 8, max: 3, ring: [4, 16] as [number, number],
    /** …once the store holds this many days of food */
    planDays: 3,
  },
  compost: {
    /** a heap turns what it holds into compost `ripenDays` after the first of it went in: one compost per `per` */
    ripenDays: 2, per: 3, holds: 12,
    /** waste taken to the heap: apple cores past `coreKeep` in store (planting comes first), leaves past `leafKeep` */
    coreKeep: 12, leafKeep: 6, haulScore: 0.2, load: 4,
    /** food that rots in a store within `range` of a heap goes on it, half its count */
    range: 14, rotShare: 0.5,
    /** spread: +`fertility` on the tile and +`edge` on the eight around it, where an apple or berry plant (or a
     * garden) stands on soil below `below`, within `radius` of the center */
    fertility: 0.3, edge: 0.15, below: 0.75, gardenBelow: 1, radius: 22, spreadScore: 0.24, spreadTicks: 30,
  },
  path: {
    /** trails worn past `wearAt` within `radius` of the center are paved, while the store keeps `stoneKeep` stone */
    wearAt: 0.75, radius: 16, stoneKeep: 8, perTrip: 3, ticks: 40, score: 0.2,
    /** a paved tile costs this much to walk (worn trails 0.8) and never wears away (§10.4) */
    cost: 0.6, max: 90,
  },
  bridge: {
    /** a span over 1–`maxSpan` water tiles within `radius` of the center, when walking round is `minGain` tiles longer;
     * at most `maxSpans` spans in all */
    maxSpan: 3, radius: 18, minGain: 24, maxSpans: 9,
    /** the idea of a stone path comes far more readily with worn trails about, of a bridge with water worth crossing */
    ideaWith: 2, ideaWithout: 0.25, trails: 10,
  },
} as const;
