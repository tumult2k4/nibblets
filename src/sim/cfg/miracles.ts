/**
 * Phase 6 powers (§17.5, P6.6): Healing Touch, Plague, Blight, Flood, Earthquake, Vision, Sanctuary, Bring Forth and
 * Resurrect. Costs, cooldowns and tiers are in POWER_DEFS; this is how strongly each one acts. Reached as `CFG.miracles`.
 */
export const MIRACLES = {
  /** Healing Touch: full hp, wounds and illness gone, and a glow of mood for half a day */
  healMood: 8, healDays: 0.5,
  /** Plague: the chosen disease shows at once, skipping its incubation (the first is the default) */
  plagueDiseases: ['sniffles', 'gut_rot', 'shivers', 'spotted_fever'] as readonly string[],
  /** Blight: apple bushes in the area get this much blight at once */
  blight: 0.8,
  /** Flood: low ground in the area (under the water level + floodRise) goes under for floodDays */
  floodRise: 0.05, floodDays: 1,
  /** Earthquake: buildings lose quakeHp of their full hp; the ground shifts by up to ±quakeJitter (half that at the
   * rim); rocks break into piles of at most quakePile stone; goblins are thrown off their feet (mood, for 3 h) */
  quakeHp: 0.5, quakeJitter: 0.03, quakePile: 3, quakeMood: -8, quakeSeen: 30,
  /** Vision: every goblin dreams the land within visionRange (fruit, water, rocks, mushrooms) */
  visionRange: 30, visionMood: 4,
  /** Sanctuary: a dome for sanctuaryDays; enemies are kept out, the weather inside is calm, and danger fades */
  sanctuaryDays: 1, sanctuaryCalm: 0.2,
  /** Bring Forth: a grown goblin of bringAgeDays descends, knowing its maker */
  bringAgeDays: 22, bringFaith: 80, bringLove: 50,
  /** Resurrect: back with resurrectHp and needs at revive; mourners' grief turns to awe (mood for aweDays, faith) */
  resurrectHp: 50, revive: 60, aweMood: 12, aweDays: 2, aweFaith: 10,
};
