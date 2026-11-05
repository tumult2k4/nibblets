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

## P3.5 planner
- **Subgoals are re-derived on every decision** (marked `sub`): they are a pure function of the root goal and the world, so re-deriving keeps `obtain` quantities in step with what the blueprint still lacks (a stale obtain(6) kept a goblin chopping after others had filled the hut).
- **The planned step gets ×1.5 focus and a 0.25 score floor** so cheap steps such as Explore still happen while needs are calm; urgent needs still win and, after 300 ticks of urgency > 0.85, the whole stack is abandoned (`goal_abandoned`).
- **Pre-emption time lives on the root goal entry** (saved state), not in a module map, so saves and replays stay bit-identical.
- **DeliverMaterial handles stockpile pickup itself**, so the planner only pushes `obtain` when the stockpile is empty. Partial loads are delivered as they come.

## P3.6 shelter, warmth, storms, mushrooms
- **SeekShelter is a normal action plus a storm interrupt**: rain/snow/heatwave are scored (0.45/0.3/0.25, damped by hunger/thirst), storm and blizzard re-decide at once (rate-limited to every 10 ticks per goblin). Once sheltering it stays available so the goblin waits instead of wandering back out; it ends when the weather clears or after 900 ticks.
- **Guests are welcome**: any finished hut within 25 tiles shelters anyone (no capacity for guests); only beds are limited.
- **Heatwave shade** = under a roof or within 1.2 of a mature tree; shaded goblins skip the ×1.8 heatwave thirst. No overheating mechanic yet.
- **WarmUp picks the cheapest of roof (distance), huddle (distance ×0.6 for friends, +8) and sunshine (daylight, clear/heatwave)**. Huddle partners must be standing still; if they walk off the action fails and re-plans.
- **Huddling is positional**: +2 °C felt per goblin within 1.1 (max +4), so hut-mates sleeping side by side warm each other too.
- **Storm damage follows §9.1 literally**: only buildings already below 50 % hp take 4 hp/h in storms; stone huts are storm-proof. Since nothing else wears huts down until P4 (raids) and P6 (fire), storms are harmless to healthy huts for now. The `repair` flag (hp < 70 %) waits for RepairBuilding (P4.6). Natural lightning is deferred to P6.2 with fire.
- **Mushrooms**: 25 at worldgen, then every 300 ticks up to 6 × season (autumn ×2, winter 0) random tries on forest/marsh tiles; dry weather only keeps 30 % of tries. They rot after 4 days; cap 70. Redcaps are never foraged (or remembered) until P5 knowledge brings the danger.
- **Test worlds clear worldgen mushrooms** like other scatter; an rng-luck test (berry accidental seeding) was given more trials after the new rng consumer shifted its stream.

## P3.7 weather FX
- **Particles live in a 64×26×64 box that follows the camera target** and are hidden per particle wherever `weatherAt` says it is not raining/snowing there, so local weather cells (P3.8) render as rain columns without extra code. With no cells the per-particle lookup short-circuits to the global kind.
- **Render-side randomness (Math.random) is allowed** for purely visual effects (particle seeds, lightning timing); the sim never sees it. Natural lightning *strikes* (damage, fire) arrive with P6.2 and will be sim events the FX can mirror.
- **Overcast is a smoothed scalar** (cloudy .45 … storm .92, heatwave −.15 = warm haze) that greys the sky dome and dims sun (−85 %) and ambient (−50 %): a storm noon reads clearly darker without going night-black.
- **Weather fog overrides the distance-fog setting**: fog/blizzard are gameplay (vision ×0.5/×0.3), so they show even with distance fog off.
- **Lit windows are shown while any goblin stands inside the hut** (within the shelter radius) and it is night; because the roof hides the walls from a top-down camera, a warm additive light pool spills past the door.

## P3.8 nature powers & casting UX
- **One `god_cast` command for targeted/global powers** (`power`, `pos`, optional `radius` and `to`); terraform brushes keep `god_power`. Validation lives in `sim/god/cast.ts`: unknown power, bounds, a direction target for Gust, and in Divine mode the unlock tier, favor and cooldown. Sandbox is free with no cooldowns (the optional sandbox-cooldown setting is not implemented yet).
- **Weather powers are local cells** (≤ 4, the soonest-expiring gives way): Rain and Snowfall last 2 h; Snowfall chills its cell so the air sits near −2 °C (snow actually settles out of season); Warm Sun is a `clear` cell at +15 °C that dries goblins on cast and keeps drying anyone standing in it. Clear Sky resets the global weather (cells stay).
- **Time skips are not a sim jump**: Fast-Forward Day / Hasten Season set `god.skipTo` and the game loop steps flat out (600 ticks per frame) until it is reached, so replays stay identical tick by tick.
- **Area powers are witnessed across their whole radius** (not only within vision of the center); Clear Sky is seen by every awake goblin. Reactions: growth/shower +4 faith +3 love; rain/warm sun +3/+2; clear sky +2; Gust targets +2 faith +4 fear; snow in spring/summer is an omen (+6 faith, +4 fear; superstition rolls arrive in P5).
- **Gust** pushes goblins (not held/airborne) and loose items within 1.5 of the dragged line up to 2.5 tiles down-wind, stopping at unwalkable tiles; no damage, a small mood dip.
- **Casting UX**: arming a card sets `armed`; LMB casts and the power stays armed; Esc or a right click without drag puts it away; global powers cast straight from their card. Wide rings (power radius) use a thin band and ignore depth so the whole circle reads over hills.
- **Temperature lens** colors tiles by local air temperature (cells included) on a −10/0/10/20/30 °C scale and recolors when the rounded global temperature or the cell set changes.

## P4.1 mining, sticks, tool durability
- **Durability lives on the stack** as `dur` (uses left); a brand-new tool has no field and counts as full (`usesLeft`). Tools stack 1, so they never merge; `addItem`/`takeOne` keep the field. A use is one finished job (a stone mined, a plant felled), weapons wear per hit (P4.5). Broken tools drop `breaksInto` parts (pick → stick + stone, axe/spears → stick, club → stone) and emit `tool_broken`. Repair waits for the workbench (P5).
- **Until Equip (P4.2) a carried tool counts**: `toolFor(g, job)` picks the best multiplier in the inventory; P4.2 will look at the hand slot first. Goblins keep their tools (never stored, dropped last) and only pick up a tool kind they lack.
- **Mine**: adults walk to the nearest workable rock within 30 tiles (one miner per rock, flint-bearing rocks slightly preferred), knock off one stone per 60 ticks (30 with a pick) until they carry 3, then StoreItem hauls it. Flint rolls per stone at the rock's `flintChance` (0.15 at worldgen). Rocks shrink visibly (`size` tracks `stoneLeft`) and vanish when spent. The drive is a village wish like wood: stone target 12, flint target 4 (at 0.6 weight), plus blueprint shortfalls, so stone huts and campfires will pull miners automatically.
- **Trees need a stone axe** (§11.1 "can fell trees"): with one, mature/old trees are the most valuable chop (8 wood + 3 sticks, stump left); trees take 2.5× the hits. The axe also doubles chop damage on bushes.
- **Sticks without an axe**: every 300 ticks, 4 random plants are sampled and grown trees drop a stick beside them at 12 % (×3 in storms), up to 30 loose sticks in the world. Stick wish (target 8) drives PickUp.
- **Planner** resolves `obtain stone/flint` to `mine` (or explore when no rock is known); only fiber/clay etc. remain impossible until their sources exist.
- **Tools tray tab** (spear, club, stone axe, pick): free in Sandbox; in Divine mode the tab is hidden and `god_spawn_item` is rejected with `locked` below god tier 2.

## P4.2 crafting, quality, equip
- **Recipes are a content table** (`sim/recipes.ts`): inputs, station (`none` = Craft by hand, `site` = building blueprint, `upgrade`), output or building, `known`, phase, work ticks. Starter knowledge (hut, campfire, spear, fence) is given to every goblin at creation; unknown recipes (stone spear, club, stone axe, pick, torch, stone hut) stay unknown until the knowledge system (P5.5) — kept in strict phase order, so in P4 only gifts or the Sandbox bring stone tools. Rope (needed by axe and pick) is defined as an item now; its recipe arrives with fiber in P5.
- **Inputs come from the pack first, then the stockpile's spare** — stock minus what open blueprints still need — so crafting never starves a hut. Consumption is exact; a failed finish consumes nothing.
- **Skill** `crafting` is a level that grows +0.25 per craft and speeds work by 15 %/level. From level 4 a craft is fine with 25 %. **Fine** = durability ×1.5 and half again of the bonus (pick mines ×2.5, weapons hit ×1.5).
- **Wants**: a weapon is wanted by how much damage it would add over the goblin's best (scaled to the strongest weapon, 0.1 + 0.16 × bravery); P4.4/P4.5 add a danger term. A pick/axe is wanted while the village wants stone/wood and the goblin has none. Before enemies exist, 3–6 of 10 goblins arm themselves by day 12 (balance runner now reports `armed`).
- **Craft is interruptible only while fetching**; once the hands are busy the piece gets finished (UtilityAction.interruptible may now be a per-goblin function), and StoreItem leaves the inputs of the piece in progress alone.
- **Hand slot**: `equipped.*` hold stacks (save v4 migration also grants starter recipes). Equip moves the best weapon (else a tool) from the pack into the hand, freeing its slot; the old item goes back into the pack. Jobs use the best tool from hand or pack. Rendering: the right hand shows the job's tool while mining/chopping, else the held item; loose cargo moved to the left hand; fine items get a gold band.

## P4.3 campfire & torch
- **Who builds communal things**: `PlanBuilding` (adult work action, one planner at a time) walks to the best communal site — the clear spot nearest the village center within 6 tiles, 2.6+ from other buildings and off the stockpile — and lays a blueprint with no owner; ordinary DeliverMaterial/Build finish it. The village wants a campfire once at least one hut stands. Fences etc. join `villageNeed` later.
- **Fuel is kept in ticks**: wood = 1800 (half a day), sticks = 450; cap 7200 (2 days); a new fire starts with half a day. Rain ×3, snow ×2, storm/blizzard ×5 burn rate. A fire runs out → `campfire_out` (the stub `fire_out` event stays for P6 tile fires).
- **TendFire** feeds sticks first (trees shed plenty), then wood, from the pack or the spare stock, 6 sticks or 2 wood per trip, one tender per fire, and only for the evening/night or when it is cold — by day the fire may burn low. The first balance run (wood-only, tended around the clock) cut wood and orchard growth noticeably (bushes 70→72 in one seed); sticks + evening tending restored it (70→96…112).
- **Warmth** +14 °C at the fire, linear to 0 at 5 tiles (fires don't stack), part of felt temperature; WarmUp prefers a lit fire (a step from the flames) over huddling. **Light**: inside 6 tiles of a lit fire night vision is as good as day vision. Repel radius (6) is configured for P4.6.
- **Torch** is a hand item with 8 uses, burning one per in-game hour of night while held; Equip holds a torch at night (over weapons) and swaps back by day. Vision ×1.4 at night; the scare radius (3) is for P4.4+. The torch recipe needs fiber (P5), so for now torches come from the Tools gift tab.
- **Render**: stone ring + crossed logs, a flickering three-cone additive flame scaled by fuel, a soft radial glow decal (no hard rim, ignores depth) and a pool of 4 point lights assigned to the lit fires nearest the camera (fixed count, so no shader recompiles). Held torches carry their own small flame.

## P4.4 Gnashers & spawn director
- **Threat budget** per night = (1 + day × 0.05) × moon − defense × 0.3, none before day 3. Moon runs from ×1.6 (new) to ×0.7 (full). Defense counts armed adults (0.5 each) and lit campfires (1 each) for now; fences and watchtowers join later. The whole part of the budget spawns, the fraction spawns with that probability, at random times over the first 60 % of the remaining night. In daytime fog an hourly 8 % chance (rising with days) adds a straggler. At most 20 enemies at once.
- **Spawn points** are walkable, ≥ 28 tiles from the village center and ≥ 16 from every goblin, forest preferred; the spawn point is also the Gnasher's home it runs back to. Small worlds with no such spot get no enemies, which keeps tests and tiny maps quiet.
- **Gnasher AI** decides every 10 ticks (staggered by spawn), acts every tick: flee below 30 % hp or when 3 awake adults are within 4 tiles; leave when it is light or it carries loot; flee after 3 bites. Otherwise it attacks a lone goblin within 8 tiles (outside, nobody within 4), or sneaks at ×0.6 speed to stockpile food, then to loose food, then to a lone goblin further away, else prowls near the center. Stealing takes up to 3 of one food and ends the visit.
- **Bites** wind up 4 ticks, then hit for 10 every 14 ticks via `combat.hurtGoblin` (death cause `combat`). A bite also counts as spotting the Gnasher, so a goblin asleep on the ground "notices" its attacker. Goblins don't react yet: fleeing, fighting back and fire repel are P4.5/P4.6 in strict order.
- **Balance** (32 days × 5 seeds): 31–51 Gnashers per run, 60–94 bites, no deaths (bites stop at 3 and hp regenerates), nothing stolen because stockpiles rarely hold food yet. Tick time stays under 0.2 ms.
- **Render**: hunched, spiny, goblin-sized beast with a toothy underbite, glowing eyes plus a soft additive eye glint (so it is visible at night), a crouched sneak, a lunge on the bite, and loot in its jaws. Enemies are interpolated like goblins. Feed: spotted and stolen are notable; bites are info.

## P4.5 combat, morale, injuries
- **Safety** drifts every 10 ticks toward a target: 90 by day, 55 at night outdoors, 85 under a roof; +15 roof, +20 inside a lit fire's glow, +10 armed, +8 per armed adult within 5 (max +16); each threat in sight −35 to −60, scaled ×1.3 (timid) … ×0.7 (brave). It falls fast (30 % of the gap) and recovers slowly (5 %). Shocks: a landed bite −20, a death seen −30 (both bravery-scaled). Low safety costs mood (×0.3 below 50) and shows as *scared* below 25. Nobody lies down to sleep in the open with a threat in sight or while scared.
- **Danger interrupt**: a threat in sight re-decides at once (every 10 ticks at most) and may cut any unforced action, even crafting with busy hands. Asleep goblins don't see; a bite (or miss) wakes them.
- **Morale** (§14.2): panic when safety < 20 and bravery < 0.5, or below 30 % hp — unless *veteran* (5 fights survived). A parent or child under attack in sight overrides panic. Children always run.
- **Flee** sprints ×1.15 (the Gnasher's 2.4 vs a goblin's ~2.5, so a limping goblin gets caught) to its own hut, else any hut, else a lit fire's far side, else 9 tiles straight away; it hides until nothing threatening is within 9 tiles or 40 s pass.
- **Attack** (adults) goes for whoever is biting kin, then anyone biting someone, then the nearest; score grows with bravery and hp, much higher when fighting back (+0.4) or defending kin (+0.5), and with fellow fighters. **DefendVillage**: armed or brave (> 0.5) adults converge on a *seen* enemy within 12 tiles of the center, damped once three already engage it (the Gnasher's crowd rule does the rest). **Guard**: armed adults with energy keep watch by the lit fire (else the stockpile) in the evening and night, one post per five adults (weight 0.3 + 1.4 × bravery × industry); a threat in sight turns a guard into a fighter.
- **Melee**: close to reach (fists 1.2, spears 1.5), wind up 0.4 s, swing, cool down 1 s. Hit 70 % + 4 % per combat level, clamped 60–90 %. Damage = weapon (fists 5) × (0.8 + 0.4 × size) × (1 + 5 % per level), fine weapons ×1.5. A landed hit gives +0.15 combat skill, wears the weapon, and knocks the enemy 0.35 tiles back. A struck Gnasher turns on its attacker unless it is about to run. Bites now roll too: 75 % − 2 % per defender combat level. Gnashers carry on biting up to 6 landed bites per visit (was 3) and keep at a foe that fights back.
- **Wounds**: a blow that leaves a goblin under half health wounds it 25 % of the time: a limp (speed ×0.7) or bruised arm (chopping, mining, building, crafting ×0.8) for 3 days, or an ear notch (+1 scar, max 3, already drawn by the goblin mesh). Sleeping in one's own hut heals wounds twice as fast. Save v6 turns the injury count into this list and adds `deeds.fights`.
- **Death** drops everything carried and held on the spot, shakes witnesses, and leaves a grave entry; graves render as a mound with a standing stone (burial, the cemetery and the grave inspector stay in P6.4). A killed Gnasher drops a pelt and a bone (and any loot); the killer's `deeds.kills` counts it.
- **Balance** (32 days × 5 seeds): 30–51 Gnashers, 12–24 bites landed, 0–1 killed, no deaths, 2–5 veterans per village. Control run without crafting: also no deaths so far, so the P4 acceptance target (≥ 30 % lost without spears) still needs tuning once fences, fire repel and the other enemies are in (P4.6–P4.7).

