# Decisions
Small choices the design doc left open, one line of rationale each.

- **Flat genome** (`Record<LocusId, {a,b}>`, temperament loci prefixed `t_`): simplest structure that serializes cleanly and makes meiosis a loop.
- **Saves in IndexedDB**, not localStorage: a 128² world is ~0.5 MB, close to localStorage quotas; settings/keybinds stay in localStorage.
- **Game speed is not a sim command**: speed only changes how often `step()` runs, so it can't affect determinism or replays.
- **New worlds start at tick 360 (mid-morning)**: starting at midnight opened the game in darkness with everyone asleep.
- **Path cache lives on the World instance** keyed by `terrainVersion`; cost depends only on walkable/biome/wear>0.5, so cached and fresh paths are identical.
- **Path wear accumulation deferred to P7** (roads): the cost function already reads `wear`, nothing writes it yet.
- **Default clan archetype is `mixed`**: picking one from the seed often gave a single-colour village, which hid the genetics pillar.
- **Sleeping goblins do not witness** god acts: they can't see; keeps the reaction table honest.
- **Commands queued while paused are applied immediately** via `World.applyNow()` (logged at the current tick), so the hand stays responsive; replay applies them before the next step, which is equivalent.
- **One mesh per goblin** (not instanced): ≤ 300 goblins and each has unique proportions; instancing would need per-instance morphs.
- **Quick save uses its own `quick` slot**, shown at the top of Save & Load; autosaves rotate through 3 slots on `day_started`.
- **Replay viewer** wraps `World.step` to inject logged commands at their tick and pauses when it reaches the save's tick.
- **God hand scales with camera distance** (0.9–3 units) so it stays readable at every zoom.
- **Phase 1 committed in three batches** instead of one commit per step: it was built in one long session; per-step commits resume in P2.
- **Not every apple core gets planted**: a goblin pockets a core with chance 0.04 + 0.16 × industry, else tosses it; ground cores are only picked up when hungry. Keeping every core gave ~120 new bushes in 20 days; this gives ~30.
- **Planting slows as the nursery fills**: PlantSeed score ÷ (1 + growing apple plants near the village / 6).
- **Fertility draw is charged per finished growth stage** (0.15 × stage share), because per-tick draws round to zero under 4-decimal quantization.
- **`tileAt` floors fractional coordinates**: callers pass positions; flooring in one place avoids silent misses.
- **Worldgen mature bushes get ages 8–55 days** so they don't all turn old on the same day.
- **Village stockpile is a spot, not a building** (P2.3): `village.stockpile` + `stockpilePos` near the center; buildings like storage pits (P3+) can extend it later.
- **Chop target priority**: old apple bushes, then berry bushes, then fruitless mature apple bushes only while > 4 per goblin exist; trees wait for the stone axe (P4). Goblins chop until 30 wood is stored.
- **Memory merges untargeted entries within 3 tiles** (water spots) so a lakeshore doesn't fill all 60 slots; a goblin's first look covers 24 tiles (it knows its home area).
- **Drinking falls back to instinct** (nearest shore) only when no water is remembered, so founders on a strange island don't die of thirst.
- **Seen-gone plants are forgotten quietly** unless they are the current harvest target, which shows the `?` confusion on arrival.
- **Terraform power commands are one stroke tick each** (`god_power`, sent every 100 ms while painting); witnesses react at most every 30 ticks so painting doesn't freeze the village in awe.
- **Path wear starts now (P2.7)** instead of P7: walking adds wear, it fades 0.05/day, and crossing the 0.5 road threshold bumps `terrainVersion` so cached paths stay exact.
- **Renderer finds changed terrain by diffing a snapshot** of heights/biomes/wear rather than reading a dirty list from the sim (keeps the renderer read-only).
- **Uprooted plants stay in `plants` while held** (growth paused); replanting at ≤ 3 height on a valid site keeps them (hydration × 0.6 shock), otherwise they die.
- **Saplings in the Gift Tray are a `god_spawn_plant` command**, not an item type.

## P3.1 weather & temperature
- **Markov chain in compact form**: per-season weights + a per-state "persist" chance + `follows` (storms only out of rain/clouds, blizzards out of snow/clouds) instead of four full 8×8 matrices. Same semantics, a quarter the numbers to tune.
- **Forecast is real**: `weather.upcoming` is rolled one transition ahead (6 in-game hours = one transition), so the top-bar forecast never lies. Save v3 adds it plus `weather.cells` (local cells, used by P3.8 Rain/Warm Sun).
- **Warmth drifts toward a target** set by felt temperature (100 inside the comfort band, −6 per °C below it, band bottom = 10 − 8 × coldTolerance), with an hourly drift rate (0.15 down, 0.25 up, 0.4 up in sunshine), plus the §21 rain drain (6/h) and storm/snow/blizzard equivalents outdoors. A first linear-drain version froze every goblin in the first winter even with a hut; the drift form lets moderate cold settle at a lower warmth and only deep cold (winter nights outdoors, blizzards) reach 0.
- **Hypothermia** below warmth 1: 30 hp/day (×1.5 hatchlings/elders); hp only regenerates when warmth > 20. A `freezing` event drives a critical notification.
- **Shelter is positional**: a goblin within 0.9 tiles of a completed hut/stone hut/longhouse is sheltered (+8/+12/+16 °C, no exposure drain, can't get wet). No extra goblin state needed.
- **Air temperature blends seasons over the first day** of a season (not on day 0 of the world).
- **Rain sets plant hydration's target to 1** (instead of soil moisture × 0.8); puddles and mud are deferred to P3.6/P3.7.
- **Warmth only lowers mood** (below 50), so warm summers don't inflate mood.
- **Sandbox `set_weather` op** (click the weather in the top bar) is a logged command, so replays match.

## P3.2 seasons & snow
- **Foliage tints are per-instance colors** computed as linear-space ratios toward a target color (instance colors multiply vertex colors in linear space, so an sRGB-looking multiplier turned autumn olive instead of orange). Recoloring is in place, no geometry rebuild.
- **Season blend is quantized to tenths of the first day** so the terrain rebuilds at most ten times per season change.
- **Snow is a tile field updated every 50 ticks**: falls during snow/blizzard while the local air is ≤ 2 °C, melts 0.04/h per °C above 0 (×2 in rain, up to ×1.5 in sunshine). Local cells use their own temperature, so a Warm Sun melts a clearing.
- **Ground speed**: snow > 0.5 → ×0.8; worn trails (wear > 0.5) in rain → mud ×0.85.
- **`winterFoodEase: 0.5`** (temporary, remove in P5.6): berry bushes keep fruiting at half rate in winter; apples, growth and planting stop.
- **Season gameplay multipliers** live in `CFG.seasons`: planting ×1.4 spring / ×0.8 autumn / off in winter, exploring ×0.6 in winter.

## P3.3 buildings
- **Footprints stay walkable** but cost ×4 in A* (so goblins walk around huts yet can still reach the door/inside); placing a blueprint bumps `terrainVersion` to drop cached paths.
- **Building positions are integer tile corners**; a 2×2 hut covers the four tiles around its center.
- **Cooperative hauling without over-delivery**: a hauler only withdraws what is still missing minus what others are already carrying to the same blueprint (activity stage ≥ 2).
- **StoreItem leaves materials alone while a blueprint needs them** — otherwise haulers were pre-empted by StoreItem and put the wood straight back (an endless loop seen in the first browser run).
- **Contributors are tracked in `building.data` (`w<goblinId>` = labor ticks)** and each gets a `builds` deed on completion; construction materials are consumed, the storage then belongs to the hut.
- **Building skill grows 0.001 per labor tick** (a solo hut ≈ +0.5).

## P3.4 huts & homes
- **Residents are `building.occupants`** (claimed beds), not whoever is inside at the moment; shelter is positional (see P3.1).
- **Claiming works on planned huts too**: a homeless goblin takes a free bed in a finished or planned hut; only when none exists does it walk to `findSite` and plan a new one (and own it). At most 2 blueprints may wait for materials at once.
- **ClaimHome urgency** = 0.22 + season (autumn +0.15, winter +0.25) + 0.4 × cold urgency, damped by hunger/thirst.
- **SleepHome is preferred over the ground** (sleep score × 1.15) and restores energy at the `hut` rate (520/day, 2× ground).
- **Hut storage is a personal pantry** for surplus food (≤ 6 items); TakeItem checks home first. Materials still go to the village stockpile.
- **Chop's wood wish includes blueprint shortfalls**, so a planned village keeps the axes busy.
- **Hut spacing 3.6–7** (was 3–6): roofs nearly touched at 3.
