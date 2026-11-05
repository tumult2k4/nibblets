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
} as const;
