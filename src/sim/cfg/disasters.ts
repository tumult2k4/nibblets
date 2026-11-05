/**
 * Disaster tunables (§10.3, §14.4, P6.2–P6.3), reached as CFG.disasters. Fire updates every `fire.every` ticks
 * (an "update"); chances and amounts below are per update unless they say otherwise.
 */
export const DISASTERS = {
  fire: {
    every: 10,
    /** fuel a tile holds, by what is on it (summed): plants by kind and stage, grass, wooden buildings, the ground */
    fuel: { tree: 1.2, treeYoung: 0.6, bush: 0.7, bushYoung: 0.3, flower: 0.1, stump: 0.3, dead: 0.5, grass: 0.4, building: 1, forest: 0.25, meadow: 0.12 },
    /** buildings that burn (stone ones, pits and hearths don't) */
    burnable: ['hut', 'longhouse', 'fence', 'gate', 'drying_rack', 'workbench', 'watchtower', 'shrine', 'totem', 'nursery', 'library_shelf', 'bridge', 'compost_heap', 'garden_plot', 'music_circle'],
    /** intensity climbs by `grow` while there is fuel; fuel burns at `burn` × intensity */
    grow: 0.12, burn: 0.05, maxFires: 300,
    /** spread to each of the 8 neighbours: base × intensity × the neighbour's fuel (≤ 1) × dryness × wind × heat */
    spread: 0.035, windK: 0.8, heatwaveMul: 2,
    dryness: { spring: 0.7, summer: 1.25, autumn: 1, winter: 0.35 },
    /** rain and snow damp a fire (intensity per update) and stop it spreading */
    rainDamp: 0.09,
    /** damage per update at full intensity */
    plantDmg: 12, buildingDmg: 8, goblinDmg: 5, enemyDmg: 6,
    /** ash: a burned-out tile gains fertility and shows grey ash that fades over `ashDays` */
    ashFertility: 0.25, ashDays: 8,
    /** natural lightning: strikes per storm hour (half of them within `nearVillage` tiles of the village) */
    stormStrikesPerHour: 0.5, nearVillage: 24, strikeDmg: 50, strikeIgnite: 0.85,
    /** heatwaves: chance per hour that some dry tile catches by itself */
    heatwaveIgnitePerHour: 0.04,
    /** ExtinguishFire: stomping takes off `stomp` intensity per tick (beats `grow`); a burn now and then (chance per update, hp) */
    stomp: 0.02, stompBurnChance: 0.08, stompBurn: 3, fightRange: 22, villageAlarm: 6, maxFighters: 6,
  },
  /** P6.3: a day counts as rainy with this many hours of rain (or storm), as dry with none */
  rainyHours: 6,
  flood: {
    /** after this many rainy days in a row the water rises by `rise` (height units; ~7 % of the land lies that low) */
    days: 3, rise: 0.03,
    /** it stays at least this long, and goes down after the first day without much rain */
    minDays: 1.5,
    /** per hour under water: plants lose hp, buildings take damage */
    plantDmg: 6, buildingDmg: 0.8,
    /** when it recedes the soil it covered is richer */
    fertility: 0.2,
  },
  drought: {
    /** a summer stretch of this many days without rain dries the shallows by `drop` */
    days: 6, drop: 0.03,
    /** plants find this share of the usual water in the soil */
    hydrationMul: 0.55,
  },
  blight: {
    /** in damp times (spring, autumn, or after rain) a bush near the village may catch it */
    outbreakPerDay: 0.06, outbreakRange: 30, start: 0.15,
    /** grows per day (damp / dry); at 1 the bush dies */
    growDamp: 0.09, growDry: 0.03,
    /** daily chance to pass to a bush of the same kind within `range`: × its blight; ash on the ground ×ashMul */
    spread: 0.35, range: 2.5, ashMul: 0.3,
    /** CullBlight: farmers (skill ≥ `farming`) or those who know `blight_spreads` cut bushes above `cullAt` */
    farming: 3, cullAt: 0.25, cullTicks: 120, cullRange: 26, witness: 0.5,
  },
  star: {
    /** shooting stars: chance per night hour (about one a year), landing within `range` of the village */
    perNightHour: 0.004, range: 28, crater: 1.3, depth: 0.015, lookRange: 30, meteorStone: 0.3,
  },
} as const;
