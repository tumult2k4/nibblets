# Nibblets progress
Current: P3.5 — planner goal stack + GatherForGoal
## Done
- [x] P1.1 scaffold: Vite + strict TS, ESLint flat config with sim architecture rules, Prettier, Vitest, scripts
- [x] P1.2 shared/: math, ids, mulberry32 Rng with fork(label), typed EventBus
- [x] P1.3 sim/config.ts (full §21 + additions), time.ts (clock, phases, seasons, moon)
- [x] P1.4 worldgen (4 presets, biomes, Poisson scatter, village site), grid, spatialHash
- [x] P1.5 A* pathfinding (8-neighbour, wear-ready cost, per-world cache) + steering
- [x] P1.6 genetics: genome/meiosis/mutation, phenotype + life stages, founder clans, names (+ tests)
- [x] P1.7 goblin factory, needs (hunger/thirst/energy/curiosity active), mood stub, personality
- [x] P1.8 utility AI + Idle/Wander/HarvestFruit/Eat/Drink/SleepGround/PickUp/Drop; apple regrowth
- [x] P1.9 world.ts tick pipeline, commands, versioned saves + migrations, stats stub; determinism/save/architecture tests
- [x] P1.10 renderer: sky/sun by clock, fog, orbit camera, chunked flat-shaded terrain, wave water, instanced props, interpolation
- [x] P1.11 procedural goblin mesh + animations (walk/idle/sleep/work, ear wobble, eye glow, carried item)
- [x] P1.12 UI shell (§18): theme, icons, i18n en+de, store, input router, top bar, toolbar, gift tray, inspector, quick ring, tooltips, toasts/feed, minimap + lenses, debug overlay
- [x] P1.13 screens: title over live observer island, New World wizard, pause, save/load (IndexedDB, thumbnails, export/import), settings (incl. key rebinding), daily autosave, F5/F9 quick save/load
- [x] P1.14 tools/balance.ts (population, deaths, food, tick time)
- [x] P1.15 god hand v1: grab/hold/raise-lower/set down/drop/throw, pet, poke, flick, box select, gift tray drag-to-spawn, validation + command_rejected + commandLog, witnesses + reaction table, LookUp/Struggle
- [x] P1.16 replay viewer ("Watch replay" from a save: rebuilds from seed, feeds the log, read-only) + replay determinism test (≥50 commands)
- [x] P2.1 full plant lifecycle (hydration, fertility draw/regen, seasons, old age, stumps coppice), stage meshes
- [x] P2.2 apple → core (kept by industrious goblins, else tossed), EatCore, PlantSeed (site rules), WaterPlant (water first, wet hands 600 ticks)
- [x] P2.3 Chop (multi-hit, wood+sticks, stumps), village stockpile with StoreItem/TakeItem (save v2 migration), item piles + stockpile rendered
- [x] P2.4 senses + memory (decay, capacity, stale-memory confusion), AI targets memories (fruit, water), Explore
- [x] P2.5 berry bushes (fast fruit, harvestable, 5% accidental seeding when eaten), flowers spread (harvest stub item), soil depletion/regen
- [x] P2.6 emotes (?, !, heart, Zzz, idea, sweat, music) as billboard bubbles; sim emits emote events, renderer derives sweat/music
- [x] P2.7 terraform powers (brush tool, Shift+wheel radius, chunk rebuilds, path-cache invalidation), path wear, uproot & replant, Gift Tray Life tab (cores, saplings), lenses: fertility, moisture, paths
- [x] P3.1 weather Markov chain (season weights, forecast one step ahead, local cells ready), air/felt temperature, warmth need + hypothermia, wet status, fog/blizzard vision, heatwave thirst, rain hydrates plants; top-bar temperature + forecast, sandbox weather picker (save v3)
- [x] P3.2 seasonal terrain palettes + foliage tints blended over each season's first day, snow cover (falls ≤ 2 °C, melts above 0, faster in rain/sun, local cells), deep snow/mud slow walking, winter dormancy with temporary `winterFoodEase` (berries fruit at 50 % in winter until P5.6), spring planting rush, less exploring in winter
- [x] P3.3 building system: findSite (flatness, water 4–10, spacing 3–6, orchards/fertility/trails avoided), blueprints reserve footprints (path cost ×4), DeliverMaterial (cooperative, no over-delivery), Build (skill, mood, friend ×1.3), completion + deeds + building skill; ghost/scaffold/hut meshes with delivered piles; hammering animation; sandbox spawn_building
- [x] P3.4 huts: ClaimHome (free bed in a built/planned hut, else plan a new one; ≤ 2 unsupplied blueprints), capacity 2, home pantry (storage 6) for surplus food, SleepHome (2× restore, sheltered +8 °C), chop also feeds blueprints, bed freed on death; building picking + inspector, housed count, feed notes
## Next
- [ ] P3.5 planner goal stack (§7.4) with GatherForGoal
## Notes / known issues
- Balance (32 days × 5 seeds, after P3.4): 0 deaths, 5 huts and 100 % housed by the end of autumn on every seed, 29–55 goblin-planted mature bushes, ~0.14 ms/tick.
- Balance (20 days × 5 seeds, after P2): population 10, 0 deaths, 25–36 goblin-planted mature bushes, apple bushes 70→~105, ~29 wood stored, ~0.12 ms/tick.
- Commits for Phase 1 were batched into three (see DECISIONS.md); from P2 on, one commit per step.
- God hand mesh reads as a simple blocky hand from far zoom; art polish can come with the P8 powers.
- 60 fps not measured on real hardware here (headless browser uses software GL); tick time is well under 1 ms.
- Vite warns the bundle is > 500 kB (three.js); code-splitting is optional.
