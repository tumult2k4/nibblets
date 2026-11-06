/**
 * Rival clans (§16, P10.1), reached as CFG.clans: 2–3 goblin clans beyond the map, simulated abstractly every
 * `every` ticks: how many they are, their food store, how aggressive they are, how they see the village.
 */
export const CLANS = {
  /** how many, and how many goblins each at the start; never fewer than `popMin` (a clan does not die out), at most `popCap` */
  count: [2, 3] as [number, number], pop: [8, 18] as [number, number], popMin: 5, popCap: 40,
  every: 600,
  /** food in goblin-days: what one goblin gathers a day by season (1 feeds one), a farming clan's bonus, each season's
   * luck (drawn per clan), how many its land feeds (beyond that each gathers less: `land / pop`), the most days a clan
   * can store, and what it has at the start */
  yield: { spring: 1.05, summer: 1.25, autumn: 1.4, winter: 0.55 } as Record<string, number>, farmers: 1.15, luck: [0.75, 1.2] as [number, number],
  land: [12, 24] as [number, number],
  storeDays: 25, startStore: [6, 14] as [number, number],
  /** a day, per goblin: births while the store holds `fedDays` (not in winter), deaths from age, deaths from hunger with an empty store */
  birthPerDay: 0.008, fedDays: 5, deathPerDay: 0.004, starvePerDay: 0.04,
  /** aggression 0–1: where it rests (a warlike clan higher), how it climbs a step while the store holds under
   * `hungryDays` and calms a step back otherwise */
  aggression: { base: 0.25, warlike: 0.3, hungerUp: 0.03, calm: 0.01 }, hungryDays: 2,
  /** relation to the village (−100..100): drawn at the start around where it rests (traders +15, −50 per aggression
   * over the base, ± `start`), drifting `drift` of the way back there each update; alliance at `ally`, broken under `allyBreak`;
   * the words for it */
  relation: { start: 30, traders: 15, perAggression: -50, drift: 0.002, ally: 70, allyBreak: 50, friendly: 30, wary: -10, hostile: -40 },
  /** first contact: the first clan after `firstContact` days, each next one `nextContact` days later */
  firstContact: [2, 8] as [number, number], nextContact: [4, 12] as [number, number],
  /** a hungry, fierce clan (aggression ≥ `fierce`) may raid another rival: chance an update, share of the store taken,
   * goblins lost on each side */
  rivalRaid: { fierce: 0.6, chance: 0.08, steal: 0.3, losses: [0, 1] as [number, number] },
  /** the gene pool kept per clan (each birth replaces one with a child of two) and the news kept per clan */
  pool: 8, newsKept: 8,
};
