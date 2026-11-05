/** Every tunable number lives here (§21). Additions beyond §21 are logged in DECISIONS.md. */
export const CFG = {
  tickHz: 10,
  saveVersion: 3,
  time: { dayTicks: 3600, daysPerSeason: 8, moonCycleDays: 8, phases: { dawn: 0.05, day: 0.6, dusk: 0.7 }, startTick: 360 },
  world: {
    w: 128, h: 128, waterLevel: 0.3, sandBand: 0.03, rockLevel: 0.8, forestNoiseThreshold: 0.6,
    marshMoisture: 0.75, appleBushes: 70, berryBushes: 40, trees: 140, rocks: 90, grassPatches: 160,
    flowers: 120, villageRadius: 14, heightScale: 6, chunk: 16,
    noiseScale: 0.035, octave2Scale: 0.09, octave2Weight: 0.35, poissonMinDist: 2.2,
  },
  goblin: {
    founders: 10, softCap: 40, baseLifespanDays: 112,
    stageDays: { egg: 2, hatchling: 4, youngling: 16, adultUntil: 80 },
    speed: 2.2, visionDay: 12, visionNight: 7, inventorySlots: 4, baseHp: 100,
    decayPerDay: { hunger: 60, thirst: 90, energy: 70, social: 25, fun: 30, curiosity: 25, comfort: 15, purpose: 10 },
    decisionIntervalTicks: 20, hysteresis: 1.15,
    workEnergyMul: 1.3, hatchlingHungerMul: 0.5, startAgeDays: [18, 40] as [number, number],
    sleepRestorePerDay: { ground: 260, mat: 390, hut: 520 }, wakeEnergy: 98,
    drinkTicks: 40, drinkAmount: 70, eatTicks: 30, harvestTicks: 25, pickupTicks: 8,
    starveDmgPerDay: 40, lowNeed: 15, separationRadius: 0.55, separationForce: 0.6,
    arriveRadius: 0.35, wanderRadius: 8, curiosityWander: 30,
  },
  stages: {
    hatchling: { scale: 0.35, head: 0.6 }, younglingEnd: { scale: 0.8, head: 0.52 },
    adult: { scale: 1, head: 0.45 }, elder: { scale: 0.92, head: 0.45, stoop: 12 },
  },
  genetics: { quantMutationChance: 0.06, quantMutationSigma: 0.08, hueSigma: 18, discreteMutationChance: 0.01, albinoFounderFreq: 0.03, personalitySigma: 0.08 },
  food: { apple: 40, apple_core: 10, apple_mash: 55, dried_apple: 30, berry: 15, mushroom: 15, glowcap: 10, fish: 25, cooked_fish: 40, stew: 60 },
  plants: {
    stageDays: { seed: 0.5, sprout: 1, sapling: 1.5, young: 2 }, matureUntilDays: 64, oldUntilDays: 80,
    appleRegrowDays: 0.5, maxApples: 5, wood: { young: 1, mature: 3, old: 2, tree: 8 },
    seasonMul: { spring: 1.3, summer: 1.0, autumn: 0.6, winter: 0 }, stumpRegrowChance: 0.3,
    updateEvery: 10,
    // P2 additions
    treeStageMul: 3, berryRegrowDays: 0.3, maxBerries: 6, oldMaxApples: 3, oldSeedChancePerDay: 0.15,
    fertilityDraw: 0.15, fertilityRegenPerDay: 0.02, stumpRegrowDays: 4, deadWood: 2,
    hydrationFollow: 1.5, hydrationOfMoisture: 0.8, waterHydration: 0.5, seedSiteVillageRadius: 20,
    flowerSpreadChancePerDay: 0.02, berryAccidentalSeed: 0.05,
    chopTicksPerHit: 15, chopHitDmg: 20, sticks: { mature: 2, old: 1 }, berryWood: 1, minBushesPerGoblin: 4,
    woodTarget: 30, stockFoodKeep: 2,
    keepCoreBase: 0.04, keepCorePerIndustry: 0.16, plantTicks: 40, waterTicks: 20, wetHandsTicks: 600, waterBelow: 0.5, waterRadius: 25, minSeedGap: 1.6,
  },
  memory: {
    capacity: 60, forgetBelow: 0.1, senseEvery: 20, initialRadius: 24, mergeDist: 3,
    decayPerDay: { fruit_plant: 0.25, enemy_sighting: 0.5, building: 0.02, stockpile: 0.02, water: 0.02, rock: 0.02, default: 0.1 } as Record<string, number>,
    exploreMin: 12, exploreMax: 28, exploreCuriosityMul: 1.6,
  },
  terraform: {
    raiseStep: 0.02, smoothK: 0.5, waterDepth: 0.03, fertileAdd: 0.4, fertileMax: 1.3, forestPerStroke: 2,
    rockStone: 4, witnessEveryTicks: 30, maxRadius: 6,
  },
  paths: { wearEvery: 5, wearPerStep: 0.008, decayPerDay: 0.05, roadAt: 0.5 },
  items: { decayEvery: 50, groundDecayDays: { apple: 6, apple_core: 4, berry: 3 } as Record<string, number> },
  weather: {
    transitionTicks: 900, rainWarmthDrainPerHour: 6, lightningPerStormHour: 1, stormBuildingDmgPerHour: 4,
    // P3.1 Markov chain: chance to keep the current state, then a season-weighted pick among the others
    persist: { clear: 0.5, cloudy: 0.4, fog: 0.35, rain: 0.45, storm: 0.3, snow: 0.5, blizzard: 0.3, heatwave: 0.55 },
    seasonWeights: {
      spring: { clear: 3, cloudy: 2.5, fog: 1, rain: 3, storm: 0.6, snow: 0, blizzard: 0, heatwave: 0 },
      summer: { clear: 5, cloudy: 2, fog: 0.3, rain: 1.2, storm: 0.8, snow: 0, blizzard: 0, heatwave: 1.5 },
      autumn: { clear: 2, cloudy: 3, fog: 2, rain: 3, storm: 1.2, snow: 0.3, blizzard: 0, heatwave: 0 },
      winter: { clear: 2, cloudy: 3, fog: 1, rain: 0.4, storm: 0, snow: 3.5, blizzard: 1, heatwave: 0 },
    },
    /** storms grow out of rain/clouds, blizzards out of snow/clouds */
    follows: { storm: ['rain', 'cloudy', 'storm'], blizzard: ['snow', 'cloudy', 'blizzard'] } as Record<string, string[]>,
    vision: { fog: 0.5, blizzard: 0.3, storm: 0.7, snow: 0.85, rain: 0.9 } as Record<string, number>,
    heatwaveThirstMul: 1.8, rainHydration: 1, maxCells: 4, windJitter: 0.8,
  },
  temperature: {
    seasonBase: { spring: 12, summer: 24, autumn: 10, winter: -4 }, daySwing: 6, comfortMin: 10, comfortMax: 24,
    // P3.1 additions
    warmestDayFrac: 0.375, weatherOffset: { clear: 0, cloudy: -1, fog: -2, rain: -3, storm: -5, snow: -2, blizzard: -6, heatwave: 9 },
    // warmth drifts toward a target set by felt temperature: 100 inside the band, −targetPerDeg below it
    coldToleranceRange: 8, targetPerDeg: 6, driftDownPerHour: 0.15, driftUpPerHour: 0.25, sunDriftUpPerHour: 0.4,
    exposurePerHour: { rain: 6, storm: 10, snow: 2, blizzard: 12 } as Record<string, number>,
    wetPenalty: 5, wetTicks: 150, shelter: { hut: 8, stone_hut: 12, longhouse: 16 } as Record<string, number>, shelterRadius: 0.9,
    hypothermiaBelow: 1, hypothermiaDmgPerDay: 30, frailColdMul: 1.5, coldMoodBelow: 50, coldRainMood: -3,
  },
  enemies: { graceDays: 3, baseThreat: 1, rampPerDay: 0.05, newMoonMul: 1.6, fullMoonMul: 0.7, maxActive: 20, gnasher: { hp: 60, dmg: 10, speed: 2.4, fleeAt: 0.3 } },
  combat: { fists: 5, spear: 15, stone_spear: 28, club: 20, sling: 10, injuryChance: 0.25 },
  social: { chat: [2, 5], giftCap: 20, sharedMeal: 3, foughtTogether: 8, saved: 25, theftDiscovered: -25, prank: -5, driftPerDay: 1, friend: 40, bestFriend: 75, rival: -40, enemy: -75, mateThreshold: 60, eggCooldownDays: 12 },
  knowledge: { discoveryBase: 0.01, teachTicks: 300, observeChance: 0.02, younglingLearnMul: 2, elderTeachMul: 1.5 },
  disease: { feverMinPop: 25, feverYearlyChance: 0.5 },
  llm: { diariesPerDay: 3, dialoguesPerDay: 4, barksPerDay: 6, tokensPerDay: 12000, rpm: 10, concurrency: 2, timeoutMs: 20000 },
  god: {
    startFavor: 50, maxFavorBase: 100, maxFavorPerBeliever: 15, believerFaith: 40, prayingFavorMul: 3,
    offeringTrinketMul: 2, offeringFoodMul: 0.5, festivalFavor: 20, answeredPrayerFavor: 5,
    gravity: 20, freeFallHeight: 1.5, fallDmgPerUnit: 12, throwMaxSpeed: 18, impactDmgFreeSpeed: 6, impactDmgPerSpeed: 4,
    holdFearTicks: 600, petLovePerSec: 1, petLoveDailyCap: 10,
    faithDecayPerDay: 1, gossipFactor: 0.5, skepticFaith: 15, conversionChance: 0.3,
    wishBonus: 0.35, wishTicks: { voice: 3600, sign: 1800 }, maxWishes: 3, defianceBase: 0.25,
    dependenceShare: 0.3, dependenceDrift: 0.002, prayerTicks: 3600, prayerAnswerRadius: 8,
    voiceCost: { single: 5, group: 10, all: 25 }, shamanVoiceDiscount: 0.4, voiceRateLimitMs: 10000,
    voiceMaxChars: 280, voiceTokensPerDay: 4000, interpreterTimeoutMs: 10000, overhearRadius: 8,
    tiers: [0, 3, 6, 10, 15], hourTicks: 150,
    holdHeight: { min: 1, max: 12, start: 3 }, replantHeight: 3, transplantShock: 0.6, eggBreakHeight: 2, itemBounce: 0.2,
    petMoodPerSec: 3, pokeMood: -2, flickDmg: 5, flickFear: 6, flickDist: 2, holdMoodPenalty: -10, holdFearGain: 5,
    lookUpTicks: 40, maxGiftQty: 20, spawnHeight: 9,
  },
  stats: { sampleEvery: 300 },
} as const;

export type Config = typeof CFG;
