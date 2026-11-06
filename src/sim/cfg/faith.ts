/**
 * Faith (§17.4, P8.8), reached as CFG.faith: how belief in the god is born, kept, spread and lost; prayers asked and
 * answered; offerings, the shaman and the temple; what a kind or a wrathful god does to the village. The favor
 * economy's rates live with the god (CFG.god); ticks are sim ticks (a day is 3600).
 */
export const FAITH = {
  /** birth faith = base + piety × `piety` + `parents` × mean(parents' faith); younglings drift toward their parents'
   * faith, `nurture` a day */
  birth: { base: 20, piety: 30, parents: 0.3, nurture: 0.5 },
  /** a day without a witnessed act: faith −1 (CFG.god.faithDecayPerDay), never below piety × `floor`; love and fear
   * settle back toward `rest` (fear: `wrathRest` under a wrathful god), `per` a day */
  floor: 20, love: { rest: 30, per: 1 }, fear: { rest: 10, wrathRest: 40, per: 1 },
  /** gossip about the god: news keeps `days`, passes on CFG.god.gossipFactor of the effect, ×(1 + `exaggerate`)
   * from a mischievous teller (mischief > `liar`); at most `keep` acts remembered */
  news: { days: 2, exaggerate: 0.2, liar: 0.6, keep: 24, minFaith: 2 },
  /** a kindness to a skeptic converts it (CFG.god.conversionChance): faith +`faith` */
  convert: { faith: 25 },
  /** prayers: open CFG.god.prayerTicks; answered by a fitting act within CFG.god.prayerAnswerRadius of the one
   * praying: faith/love, favor (CFG.god), alignment; left unanswered: a little lost. Desperate prayers anywhere: a need below `critical` for `hours`, a
   * sick child, a raid at night, a famine (food for under `famineDays` in the store) */
  prayer: {
    answered: { faith: 15, love: 10 }, ignored: { faith: -3, love: -2 }, alignment: 2,
    critical: 15, hours: 6, famineDays: 1, desperateScore: 0.45, desperateGapDays: 0.5, recent: 8,
  },
  /** alignment: kind above `kind`, wrathful below `wrath`; the village's mood ±`mood`; festivals ×`festivals` under
   * a kind god; dependence: god-given food over CFG.god.dependenceShare of a season's eating (once `minEaten` meals),
   * industry slips (CFG.character.drift.dependent); a wrathful god cows the young
   * (CFG.character.drift.cowed) and doubles offerings */
  alignment: { kind: 50, wrath: -50, mood: 5, festivals: 1.5, offerings: 2, minEaten: 40 },
  /** the shaman: the most faithful grown goblin with piety ≥ `minPiety` (a rival must beat it by `margin`); leads a
   * prayer every `gapDays` (`ticks` long, devout within `call` come, Pray ×`pull`, favor ×`favor`); god omens form
   * ×`omens`; a chief with piety under `rivalPiety` and the shaman think a little less of each other each day */
  shaman: { minPiety: 0.6, margin: 10, gapDays: 2, ticks: 300, call: 30, pull: 3, favor: 1.5, omens: 2, rivalPiety: 0.35, rivalOpinion: 1, minFollowers: 2, score: 0.5 },
  /** `MakeOffering`: once a `gapDays`, from faith `minFaith` (or a pious goblin angry with the god); food from the store
   * (not in lean times) or a spare trinket; laid at the shrine or temple, taken by the god after `takeDays` */
  offering: { score: 0.18, minFaith: 40, gapDays: 3, takeDays: 1, ticks: 60, range: 60, mood: 4, food: ['apple', 'dried_apple', 'berry', 'mushroom', 'cooked_fish', 'stew'] as const },
  /** the temple (12 stone, 6 wood; consecrated with `trinkets` trinkets laid in it): prayer favor ×`favorMul` within
   * `radius`; its idea comes to the shaman or the very faithful (faith ≥ `ideaFaith`) at the shrine; wanted from `pop`
   * goblins once a shrine stands */
  temple: { trinkets: 2, favorMul: 1.5, radius: 10, idea: 4, ideaFaith: 60, pop: 10 },
  /** `ShakeFist`: a goblin of little piety angry at the god shakes a fist at the sky, once a `gapDays` */
  fist: { score: 0.35, ticks: 50, gapDays: 0.5, maxPiety: 0.6, vent: 3 },
  /** the god gets a name once `believers` believe and a shaman lives (§17.4 template; the Voice may rename it) */
  naming: { believers: 3 },
};
