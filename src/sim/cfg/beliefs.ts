/**
 * Superstitions, the shrine, `Pray` and the totem (§15.4, §11.1, P8.6), reached as CFG.beliefs.
 */
export const BELIEFS = {
  /** a sign of one kind is noted at most once in this many ticks; signs are kept a season */
  dedupe: 150,
  /** a turn of luck counts as following an omen that came within this many days before it */
  window: 0.5,
  /** a belief needs `need` such coincidences within a season; each new one may then form it, p = `p` × mean piety */
  need: 3, p: 0.3,
  /** no new belief within `gapDays` of the last; at most `max` held at once */
  gapDays: 3, max: 6,
  /** strength: `start` when formed, +1 each time the omen is borne out (up to `top`), −1 each time it is not; 0 fades it */
  start: 3, top: 5,
  /** a lucky act × (1 + sway × piety), an unlucky one × (1 − sway × piety) */
  sway: 0.6,
  /** a believed omen seen by a goblin of piety ≥ `piety`: ±`mood` for half a day */
  omen: { piety: 0.5, mood: 4 },
  /** `Pray` at the shrine: from piety `minPiety` or faith `minFaith`, hunger ≥ `minFed`; once a `gapDays`; kneels
   * `ticks` (not cut short); mood, faith */
  pray: { score: 0.3, range: 60, minPiety: 0.3, minFaith: 40, minFed: 40, gapDays: 2, ticks: 240, mood: 5, faith: 2, worry: 0.8, policyMul: 1.3 },
  /** the shrine: its idea comes to a goblin carrying a trinket and with faith ≥ `minFaith` (× `idea`); wanted from
   * `pop` goblins and day `day`; it holds up to `hold` offered trinkets */
  shrine: { idea: 6, minFaith: 30, pop: 5, day: 3, hold: 6 },
  /** the totem: its idea comes to a painted goblin (× `idea`); wanted from `pop` once Gnashers have been seen; within
   * `radius`, danger × (1 − `calm`) and the safety a goblin settles toward + `safety` */
  totem: { idea: 10, pop: 6, radius: 8, calm: 0.35, safety: 10 },
};
