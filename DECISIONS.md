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
