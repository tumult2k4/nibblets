/**
 * Alliances (§16, P10.4), reached as CFG.alliance: marriage migration both ways, allies' help against a Bramblebeast,
 * and the inbreeding penalty that makes an isolated village lay fewer eggs.
 */
export const ALLIANCE = {
  /** an allied clan sends one of its goblins to marry into the village: a day's chance (on its 10:00 update) while the
   * village has an unmated grown goblin, at most every `suitorRestDays` */
  suitorPerDay: 0.3, suitorRestDays: 4,
  /** how old the newcomer is (days), and how many recipes the village does not know it brings (at most) */
  age: [20, 30] as [number, number], recipes: 2,
  /** it comes with a match in mind: the two start with this much liking for each other (past the mate line, so courting
   * can begin) and know each other this well */
  match: 65, matchFamiliarity: 60, matchDaysLeft: 12,
  /** an unmated, restless (wanderlust ≥ `leaveWanderlust`) grown goblin may go to marry into an allied clan: a day's chance */
  leavePerDay: 0.02, leaveWanderlust: 0.65,
  /** a marriage either way warms the clan */
  married: 3,
  /** allies send `helpers` warriors when a Bramblebeast comes within `helpRadius` of the village (checked on each clan
   * update, `helpChance` each time while none are about); each strikes it for `helpDmg` every `helpEvery` ticks */
  helpChance: 0.5, helpers: [2, 3] as [number, number], helpRadius: 22, helpDmg: 12, helpEvery: 20, helpRange: 1.8, helpDays: 1,
  /** the inbreeding penalty: a pair whose mean heterozygosity is under `below` lays less, down to `floor` of the chance */
  inbreeding: { below: 0.5, floor: 0.5 },
};
