/**
 * Books and the library shelf (§15.2, P9.5), reached as CFG.books.
 */
export const BOOKS = {
  /** a writer knows at least `minKnown` things worth passing on; a book holds up to `contents` of them */
  minKnown: 3, contents: 3,
  /** writing: a long sitting at the shelf by day, with a page of fiber and ash for ink; the village keeps `writeDays`
   * of food in store first; a writer rests `cooldownDays` before the next book; a shelf holds `perShelf` */
  writeTicks: 900, writeScore: 0.5, rareBonus: 0.3, writeDays: 3, cooldownDays: 6, perShelf: 6, mood: 6,
  cost: { fiber: 1, ash: 1 },
  /** reading: a curious goblin (curiosity under `readBelow`) learns one thing per `readTicks`, at most `maxRead` a
   * sitting; a book that holds something nobody alive knows draws readers `lostBonus` more. Nobody reads while the
   * store holds less than `readDays` of food (twice that in autumn, when the winter's food is laid in) */
  readTicks: 300, readBelow: 75, readScore: 0.4, lostBonus: 0.6, maxRead: 2, readCuriosity: 15, readDays: 4,
  /** the shelf: wanted from `pop` goblins with `days` of food in store; the idea of one comes to a goblin who knows
   * `minKnown` things (`idea` × the usual chance; `lostMul` times more once something has been lost) */
  shelf: { pop: 6, days: 4, idea: 0.5, lostMul: 3 },
  /** the storyteller trait (earned by writing a book) makes writing this much more likely */
  storyteller: 1.5,
};
