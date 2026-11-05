/** Death culture (§13.7, P6.4): grief, burial, the graveyard and mourning. Reached as `CFG.death`. */
export const DEATH = {
  /** who knew the dead well (opinion above this) grieves; family always does (a mate fully, kin at least 70 %) */
  griefOpinion: 30,
  /** grief: mood −10 … −30 for 2 … 6 days, by how close they were */
  griefMood: [10, 30] as readonly [number, number],
  griefDays: [2, 6] as readonly [number, number],
  /** the emotion shows as grieving while the deepest grief weighs at least this */
  grievingAt: 12,
  /** BuryDead: base score, + closeness to the dead, + per day the body has lain; carrying speed ×, digging ticks */
  buryBase: 0.3, buryKin: 0.25, buryWait: 0.12, carryMul: 0.7, digTicks: 240, buryRange: 60,
  /** a body nobody comes for is covered where it lies after this many days */
  leaveDays: 4,
  /** the burial: whoever stands within range and grieves for the dead finds some peace (grief and its time ×) */
  funeralRange: 10, funeralEase: 0.75,
  /** the graveyard: on level open ground this far from the village center; graves in rows of `cols`, `gap` apart;
   * huts and fires keep `keepClear` tiles away from it */
  graveyard: [9, 16] as readonly [number, number], cols: 5, gap: 1.3, keepClear: 4,
  /** Mourn: once a day at the grave of a grief of at least `mournMin`; kneels `mournTicks`, then the grief ×
   * `mournEase` and its time left × `mournShorten` */
  mournBase: 0.24, mournMin: 4, mournTicks: 150, mournEase: 0.6, mournShorten: 0.7, mournRange: 50,
  /** the body is kept this long with its grave, for the god's Resurrect (P6.6) */
  resurrectDays: 2,
};
