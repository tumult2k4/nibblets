/** Every tunable number lives here (§21), or in cfg/ files it pulls in. Additions beyond §21 are logged in DECISIONS.md. */
import { HEALTH } from './cfg/health';
import { DISASTERS } from './cfg/disasters';
import { DEATH } from './cfg/death';
import { MIRACLES } from './cfg/miracles';

export const CFG = {
  tickHz: 10,
  saveVersion: 20,
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
  food: { apple: 40, apple_core: 10, apple_mash: 55, dried_apple: 30, berry: 15, mushroom: 15, glowcap: 10, redcap: 12, fish: 25, cooked_fish: 40, stew: 60 },
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
    chopTicksPerHit: 15, chopHitDmg: 20, sticks: { mature: 2, old: 1, tree: 3 }, treeToughness: 2.5, berryWood: 1, minBushesPerGoblin: 5,
    woodTarget: 30, stockFoodKeep: 2,
    keepCoreBase: 0.1, keepCorePerIndustry: 0.2, plantTicks: 40, waterTicks: 20, wetHandsTicks: 600, waterBelow: 0.5, waterRadius: 25, minSeedGap: 1.6,
    /** P5.6: frost takes the fruit left on the bushes in winter (mean days a fruit hangs on); flowers rebloom in 2 days */
    frostFruitDays: 1, flowerBloomDays: 2,
  },
  memory: {
    capacity: 60, forgetBelow: 0.1, senseEvery: 20, initialRadius: 24, mergeDist: 3,
    decayPerDay: { fruit_plant: 0.25, mushroom: 0.4, enemy_sighting: 0.5, building: 0.02, stockpile: 0.02, water: 0.02, rock: 0.02, default: 0.1 } as Record<string, number>,
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
    heatwaveThirstMul: 1.8, rainHydration: 1, rainHydrationFollow: 6, maxCells: 4, windJitter: 0.8,
  },
  /** P3.3 buildings (§10.1–10.2); shelter warmth lives in `temperature.shelter` */
  buildings: {
    defs: {
      hut: { cost: { wood: 6 } as Record<string, number>, footprint: 2, hp: 100, capacity: 2, storage: 6 },
      campfire: { cost: { wood: 2, stone: 1 } as Record<string, number>, footprint: 1, hp: 40, capacity: 0, storage: 0 },
      fence: { cost: { wood: 1 } as Record<string, number>, footprint: 1, hp: 40, capacity: 0, storage: 0, labor: 8 },
      stone_hut: { cost: { stone: 6 } as Record<string, number>, footprint: 2, hp: 220, capacity: 3, storage: 8, labor: 2.5 },
      // P5.6 preservation: storage = what the rack holds per batch / what the pit keeps cool
      grinding_stone: { cost: { stone: 3 } as Record<string, number>, footprint: 1, hp: 80, capacity: 0, storage: 0, labor: 3 },
      drying_rack: { cost: { wood: 3, rope: 2 } as Record<string, number>, footprint: 1, hp: 30, capacity: 0, storage: 12, labor: 3 },
      storage_pit: { cost: { stone: 2 } as Record<string, number>, footprint: 1, hp: 120, capacity: 0, storage: 160, labor: 1.2 },
      // P5.7 workbench, watchtower and gate (§11.1)
      workbench: { cost: { wood: 4, stone: 2 } as Record<string, number>, footprint: 1, hp: 60, capacity: 0, storage: 0, labor: 2 },
      watchtower: { cost: { wood: 8, rope: 2 } as Record<string, number>, footprint: 1, hp: 70, capacity: 0, storage: 0, labor: 1.2 },
      gate: { cost: { wood: 2, rope: 1 } as Record<string, number>, footprint: 1, hp: 50, capacity: 0, storage: 0, labor: 4 },
    } as Record<string, { cost: Record<string, number>; footprint: number; hp: number; capacity: number; storage: number; labor?: number }>,
    buildRate: 0.002, skillBonus: 0.15, friendBonus: 1.3, workChunk: 300,
    siteRadius: 14, maxSlope: 0.06, waterPref: [4, 10] as [number, number], hutSpacing: [3.6, 7] as [number, number],
    occupiedCost: 4,
  },
  /** P3.5 planner goal stack (§7.4) */
  planner: { focus: 1.5, floor: 0.25, maxDepth: 4, abandonUrgency: 0.85, abandonTicks: 300, groundSearch: 20 },
  /** P3.8 nature & weather powers (§17.5.2): cells last 2 h; Warm Sun +15 °C; Snowfall chills its cell to −2 °C */
  powers: {
    cellHours: 2, warmSunDeg: 15, warmCellAbove: 10, snowCellAir: -2, showerApples: [12, 18] as [number, number],
    gustWidth: 1.5, gustMaxLen: 16, gustPush: 2.5, gustMood: -2, skipPerFrame: 600,
    // P4.8 wrath (§17.5.4): lightning 60 dmg within 1 tile; a 6-tile dread zone scatters onlookers for 300 ticks
    lightningDmg: 60, lightningRadius: 1, lightningSeen: 16, dreadRadius: 6, dreadTicks: 300,
    swarmHours: 1, swarmMood: -6, curseMood: -30, curseDays: 2, curseFail: 0.25,
    summonGnashers: [2, 4] as [number, number], summonHuntHours: 3, scatterMul: 1.15,
    // meteor: falls for 1.5 s, kills within 1.5, 100 dmg fading to 0 at the rim; crater 0.12 deep, rubble stone
    meteorDelay: 15, meteorDmg: 100, meteorKill: 1.5, meteorDepth: 0.12, meteorStone: 6, meteorSeen: 24,
    // thrown/dropped goblins and items hurt enemies they land on: (impact speed − 3) × 4 × mass
    thrownFree: 3, thrownPerSpeed: 4, thrownHit: 0.9, thrownMass: { goblin: 1.5, stone: 1, flint: 1, wood: 0.8, bone: 0.6 } as Record<string, number>,
    // P5.9 gifts (§17.5.1): Blessing a day of +20 mood; Inspiration a day of `inspired` (discovery ×3, next craft fine)
    // and one discovery roll at ×10; Fertility: the next egg within a day, twins 30 %; Shiny Gift: a rare trinket
    blessMood: 20, blessDays: 1, inspireMood: 6, inspireDays: 1, inspireRoll: 10, fertileDays: 1, fertileTwins: 0.3, fertileScore: 0.9,
    shinyMood: 12, shinyDays: 2,
    // angryAtGod (§17.4): a loved one hurt by the god; clears after 8 days or a benevolent act toward them
    angerDays: 8, angerMood: -10,
  },
  /** P4.8 danger lens (§18.10): marks fade over 3 days within 6 tiles; live threats weigh 1.5 within 8; fire calms */
  danger: { maxMarks: 48, days: 3, radius: 6, live: 1.5, liveRadius: 8, fireCalm: 0.6, zone: 0.8 },
  /** P3.6 shelter, warming up, storms, mushrooms */
  shelter: {
    seekScore: { rain: 0.45, storm: 0.75, snow: 0.3, blizzard: 0.9, heatwave: 0.25 } as Record<string, number>,
    guestRadius: 25, shadeRadius: 12, maxWaitTicks: 900, warmUpBelow: 45, warmUpDoneAt: 70, warmUpMaxTicks: 600,
    huddleRadius: 1.1, huddlePerGoblin: 2, huddleMax: 4,
  },
  /** §9.1 storms batter weakened buildings; RepairBuilding (P4.6) acts on the repair flag, lightning arrives with fire (P6.2) */
  storms: { stormProof: ['stone_hut'] as string[], weakBelow: 0.5, dmgPerHour: 4, repairBelow: 0.7 },
  mushrooms: {
    every: 300, lifeDays: 4, cap: 70, initial: 25, spawnTries: 6, minGap: 1.5,
    seasonMul: { spring: 1, summer: 0.6, autumn: 2, winter: 0 },
    kinds: { brown: 0.7, glowcap: 0.15, redcap: 0.15 } as Record<string, number>, forageTicks: 20, dryChance: 0.3,
  },
  /** P3.4 homes */
  homes: {
    maxOpenBlueprints: 2, claimBase: 0.22, claimSeason: { spring: 0, summer: 0.05, autumn: 0.15, winter: 0.25 }, homeSleepPref: 1.15,
  },
  /** P3.2 season gameplay multipliers and snow cover */
  seasons: {
    plantingMul: { spring: 1.4, summer: 1, autumn: 0.8, winter: 0 }, exploreMul: { spring: 1, summer: 1.1, autumn: 1, winter: 0.6 },
    snowEvery: 50, snowPerHour: { snow: 0.25, blizzard: 0.45 } as Record<string, number>, meltPerDegHour: 0.04, rainMeltMul: 2,
    deepSnow: 0.5, deepSnowSpeed: 0.8, mudWear: 0.5, mudSpeed: 0.85,
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
  /** P4.1: Mine (finite stone, flint by chance), fallen sticks under trees */
  mining: {
    ticksPerStone: 60, stonesPerTrip: 3, stoneTarget: 12, flintTarget: 4, searchRadius: 30, minStone: 1,
    stickTarget: 8, stickFallTries: 4, stickFallChance: 0.12, stickStormMul: 3, looseStickCap: 30,
  },
  /** P4.3 campfires & torches (§11.1, §10.3): contained fires, fuel in ticks (1 wood = half a day) */
  fire: {
    every: 10, ticksPerWood: 1800, maxFuel: 7200, startFuel: 1800, tendBelow: 2700,
    /** fuel ticks per item: sticks (shed by trees) burn a quarter as long as wood and are fed first */
    fuelTicks: { wood: 1800, stick: 450 } as Record<string, number>, tendLoad: { wood: 2, stick: 6 } as Record<string, number>,
    weatherBurn: { rain: 3, storm: 5, snow: 2, blizzard: 5 } as Record<string, number>,
    warmRadius: 5, heat: 14, lightRadius: 6, repelRadius: 6, communalRadius: 6, communalSpacing: 2.6,
    torchLight: 4, torchVision: 1.4, torchScare: 3, tendTicks: 20,
  },
  /** P4.6 fences (ring around the core once Gnashers have been seen), upgrades and repairs */
  fences: {
    alarmsToStart: 3, minAdults: 3, ringPad: 2, ringMin: 4, ringMax: 10, maxOpen: 3, perTrip: 3, stockpileGap: 1.2,
    upgradeFrom: 0.6, repairTicks: 80, repairShare: 0.25, repairItem: { stone_hut: 'stone' } as Record<string, string>,
  },
  /** P4.2 crafting (§11.1): skill is a level that grows per craft; level 4+ may make fine items */
  crafting: {
    skillBonus: 0.15, fineLevel: 4, fineChance: 0.25, fineBonus: 1.5,
    weaponWant: 0.1, braveryWant: 0.16, toolWant: 0.3, equipTicks: 10, fetchTicks: 8,
  },
  enemies: {
    graceDays: 3, baseThreat: 1, rampPerDay: 0.05, newMoonMul: 1.6, fullMoonMul: 0.7, maxActive: 20, gnasher: { hp: 60, dmg: 10, speed: 2.4, fleeAt: 0.3, armor: 2 },
    // P4.7: a rare thorny brute that tramples straight through the village, smashing what stands in its way; it only
    // turns on goblins that hit it, and only a mob of three with heavy weapons (≥ 20 dmg) within 14 tiles will take it on
    bramblebeast: {
      hp: 250, dmg: 25, speed: 1.2, fleeAt: 0.3, fromDay: 6, chancePerDay: 0.12, smashDmg: 20, smashEvery: 15,
      swipeEvery: 20, swipeRange: 1.5, maxSwipes: 4, giveUp: 6, scareRadius: 6, mobSize: 3, mobDmg: 20, mobRadius: 14,
    },
    // P4.7: lights over the marsh on full-moon nights that lure the curious and pious away; a lit torch scatters one
    night_wisp: {
      hp: 1, dmg: 0, speed: 0.9, fleeAt: 0, count: 2, marshRange: 30, drift: 12, seekRange: 14, seekMul: 2.2, hover: 2.5, lureRadius: 6, lureChance: 0.06,
      lureTicks: 900, lureDist: 26, followDist: 1.4, waitDist: 3, torchRadius: 3, mood: -8,
    },
    drops: { gnasher: { pelt: 1, bone: 1 }, bramblebeast: { pelt: 2, bone: 2, wood: 3 }, night_wisp: {} } as Record<string, Record<string, number>>,
    // P4.4 director & AI
    defenseMul: 0.3, armedDefense: 0.5, fireDefense: 1, fenceDefense: 2, fogChancePerHour: 0.08, spawnMinVillageDist: 28, spawnMinGoblinDist: 16,
    decideEvery: 10, sneakMul: 0.6, stealQty: 3, loneRadius: 4, crowdFlee: 3, crowdRadius: 4, sightRange: 18, unarmedCrowd: 0.5, packCall: 10, hutBreakIn: true as boolean,
    biteRange: 1.0, windupTicks: 4, biteCooldown: 10, maxBites: 10, despawnDist: 1.5, foodSearch: 20, biteHit: 0.75,
  },
  combat: {
    fists: 5, spear: 15, stone_spear: 28, club: 20, sling: 10, injuryChance: 0.25,
    // P4.5 melee (§14.2): windup 0.4 s, 60–90 % hit, dmg × (0.8 + 0.4 × size) × skill
    windupTicks: 4, cooldownTicks: 10, reach: 1.2, hitBase: 0.7, hitPerSkill: 0.04, hitMin: 0.6, hitMax: 0.9, evadePerSkill: 0.02,
    dmgPerSkill: 0.05, knockback: 0.35, knockbackFull: 12,
    // morale (§14.2): panic when safety < 20 and bravery < 0.5, or hp < 30 % unless veteran
    panicSafety: 20, panicBravery: 0.5, panicHp: 0.3, veteranFights: 5, sprintMul: 1.15, fleeTicks: 400, safeDist: 9,
    // injuries: hp < 50 % after a hit, 25 %; limp −30 % speed and bruised arm −20 % work for 3 days; ear notch +1 scar
    injuryBelow: 0.5, injuryDays: 3, limpMul: 0.7, armMul: 0.8, maxScars: 3, restHealMul: 2,
    villageRadius: 12, defendRange: 22, guardShare: 0.2, guardTicks: 600, guardRadius: 2.6,
  },
  /** P4.5 safety need (§7.1): event-driven, drifts toward a target set by daylight, roofs, fires, armed friends and threats */
  safety: {
    every: 10, day: 90, nightOutside: 55, nightInside: 85, hut: 15, fire: 20, armed: 10, armedFriend: 8, armedFriendMax: 16, friendRadius: 5,
    threat: 35, threatNear: 25, fall: 0.3, rise: 0.05, bite: 20, witnessDeath: 30, moodMul: 0.3, scaredBelow: 25,
  },
  social: {
    chat: [2, 5], giftCap: 20, sharedMeal: 3, foughtTogether: 8, saved: 25, theftDiscovered: -25, prank: -5, driftPerDay: 1, friend: 40, bestFriend: 75, rival: -40, enemy: -75, mateThreshold: 60, eggCooldownDays: 12,
    // P5.1 relationships & conversations
    maxBestFriends: 2, familiarityPerContact: 1, familiarityFade: 0.5, sameHut: 1, clanFamiliarity: 30, clanOpinion: [-5, 20] as [number, number],
    companyRadius: 3, companyPerDay: 20, chatRange: 10, chatLines: [4, 6] as [number, number], lineTicks: 25, chatSocial: 25, topicMatch: 2,
    gossipShare: 3, gossipConfidence: 0.8, personSway: 0.2, comfortMood: 10, comfortOpinion: 10, comfortSocial: 15, comfortRange: 14,
    sadBelow: -30, giftRange: 15, giftSocial: 10, mealSocial: 6, mealRange: 3, fightBondRange: 8, moodMul: 0.2,
  },
  /** P5.3 courtship, eggs, incubation and childhood (§13.3) */
  family: {
    courtRange: 24, courtCooldown: 300, danceTicks: 60, courtSuccesses: 3, courtScore: [0.1, 0.5] as [number, number],
    welcome: 0.35, giftWelcome: 0.2, courtOpinion: 4, springMul: 1.5, hueNear: 60, hueFar: 120, looksMul: 1.25,
    familyOpinion: 40, familyFamiliarity: 60,
    eggHunger: 60, eggChancePerDay: 0.35, twinChance: 0.05, /** lean times: in autumn no eggs below this many days of stored food; in winter, below the days left + `leanMargin` */ leanStoreDays: 6, leanMargin: 3, layTicks: 60, layScore: 0.5, eggMood: 8,
    incubateDays: 2, lostColdDays: 1, coldRate: 1, bodyRange: 1.8, nestOffset: 1.25, nestShelter: 1.45, coldAir: 5, airSpan: 25, airMax: 0.6,
    shelterWarmth: 0.3, fireWarmth: 0.3, fireRange: 4, incubateRange: 30, sitTicks: 600, sitScore: [0.35, 0.45] as [number, number],
    feedBelow: 55, feedScore: [0.25, 0.9] as [number, number], followDist: 4, followScore: 0.2,
  },
  /** P5.4 life stages: younglings play and learn, hatchlings nap, elders slow down, parents fight for their young */
  life: {
    funYoungMul: 2, hatchlingEnergyMul: 3, youngExplore: [5, 12] as [number, number],
    playRange: 16, playEnergy: 30, playTicks: 420, playFun: 0.2, soloFunMul: 0.6, playScore: [0.06, 0.9] as [number, number],
    catchDist: 0.7, playRadius: 6, chaserMul: 1.15, runnerMul: 1, freezeTicks: 15, playOpinion: 2, playSocial: 4,
    hideRange: 10, hideTicks: [60, 140] as [number, number],
    learnRange: 14, learnDist: 1.7, learnTicks: 600, learnXp: 0.25, learnScore: [0.12, 0.25, 0.3] as [number, number, number], learnCuriosity: 0.05,
    elderWork: 0.6, elderSocial: 1.3, elderRespect: 1.3, parentBravery: 1.5, kidsPerHome: 4,
  },
  /** P5.2 skills: XP per skill; a level is read off the cumulative thresholds (fractional in between) */
  skills: {
    levelXp: [10, 30, 60, 100, 150, 210, 280, 360, 450, 550] as readonly number[],
    /** gather, chop, mine, plant and water faster: +10 % per level */
    speedPerLevel: 0.1,
    /** goblins like doing what they are good at: action score × (1 + 0.06 × level) (specialization) */
    focusPerLevel: 0.06,
    /** XP × (0.8 + 0.4 × industry) */
    industryXp: 0.4,
    xp: { harvest: 0.5, forage: 1, chopHit: 0.3, felled: 2, stone: 2, buildTick: 0.04, repair: 1, craftPerTick: 0.05, hit: 3, plant: 3, water: 1.5, teach: 5, process: 1, cut: 0.6 },
    flintPerLevel: 0.02, waterPerLevel: 0.1,
    /** skill-ups worth a note */
    notify: [5, 10] as readonly number[],
  },
  /** P5.5 knowledge (§15.1): recipes and cultural facts are discovered, taught, observed and lost */
  knowledge: {
    discoveryBase: 0.01, teachTicks: 300, observeChance: 0.02, younglingLearnMul: 2, elderTeachMul: 1.5,
    inspiredMul: 3, skillMul: 0.2, minNear: 1, stockReach: 5, groundReach: 3, memoryNear: 0.75, discoveryMood: 8, observeRange: 4,
    teachRange: 15, teachOpinion: 10, teachScore: [0.08, 0.2, 0.12] as [number, number, number], rareBonus: 0.15, kinBonus: 0.1,
    teachCooldownDays: 2, teachMood: 3, founderFactChance: 0.7, witnessRange: 8, redcapWitness: 0.6, fireWitness: 0.25,
    redcapDmg: 25, sickMood: -15, fireTendMul: 1.3,
  },
  /** P5.6 fiber chain: grass is cut for fiber and regrows by season; flowers for crowns; clothes and baskets */
  fiber: {
    cutTicks: 50, cutDensity: 0.3, fiberPerCut: [2, 3] as [number, number], minDensity: 0.35, range: 30,
    regrowPerDay: { spring: 0.3, summer: 0.2, autumn: 0.1, winter: 0 } as Record<string, number>, regrowEvery: 300,
    fiberTarget: 10, ropeTarget: 3, flowerTarget: 3, pickTicks: 20, gatherScore: [0.08, 0.3] as [number, number],
    crownCharm: 0.1, crownMood: 4, clothesWant: 0.25, coldWantMul: 2, basketWant: 0.3, matWant: 0.25, ropeWant: 0.22, crownWant: 0.12,
    leaves: { tree: 2, mature: 1, old: 1 } as Record<string, number>,
  },
  /** P5.6 preservation & spoilage (§11.2): stored food rots (mean shelf days per item), a pit halves it; mash and dried apples keep */
  preserve: {
    /** off in the `--no-preserve` balance control: nobody thinks of grinding stones, racks or pits */
    enabled: true as boolean,
    spoilEvery: 50, pitMul: 0.5, grindTicks: 90, grindIn: 2, grindBatch: 3, dryDays: 1, rackMin: 6, loadTicks: 30,
    freshPerGoblin: 2, processScore: [0.14, 0.35] as [number, number], autumnMul: 1.5,
    /** goblins pick for the stores until they hold this many days of food (winter is the reason) */
    stockUpDays: { spring: 1.5, summer: 4, autumn: 12, winter: 0 } as Record<string, number>,
    stockUpScore: { spring: 0.15, summer: 0.3, autumn: 0.65, winter: 0 } as Record<string, number>, chainRadius: 8,
    perRack: 6, perPit: 8, rotIdeaPer: 0.2, rotIdeaMax: 4,
  },
  /** P5.7 workbench (§11.1, §11.3): crafting there is half again as fast; worn tools are mended with half the inputs */
  workbench: { speedMul: 1.5, range: 18, mendBelow: 0.5, mendWant: 0.32, radius: 9 },
  /** P5.7 watchtower and gates (§11.1, §7.8): a guard up the tower sees three times as far and warns the village */
  watch: { visionMul: 3, warnTicks: 900, platform: 1.55, maxGates: 2, gateSpacing: 6, gatePosts: 8, climbSpeed: 0.3 },
  /** P5.7 acquired traits (§7.7) */
  traits: {
    max: 3, checkEvery: 150, greenThumbPlanted: 25, greenThumbGrowth: 1.5, scarredScars: 2, twinEcho: 0.4, twinEchoMin: 4,
    orphanBravery: 0.1, orphanSociability: -0.1, scarredCrowd: 1.5, scarredShun: 2, twinOpinion: 25, veteranWatch: 1.3, greenThumbWork: 1.3, returnedPiety: 0.3,
  },
  /** P6.1 health and disease (§14.3): see cfg/health.ts */
  health: HEALTH,
  /** P6.2–P6.3 fire, floods, drought, blight, shooting stars: see cfg/disasters.ts */
  disasters: DISASTERS,
  death: DEATH, miracles: MIRACLES,
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
