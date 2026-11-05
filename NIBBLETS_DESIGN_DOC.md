# Nibblets — Technical Design Document v3

**Project:** Nibblets — a low-poly 3D emergent life simulator and god game about a village of little goblins
**Stack:** TypeScript (strict) + Three.js + Vite, runs in the browser
**Workflow:** Implemented by Claude (Opus) in VS Code, end to end, from this document alone
**Status:** Authoritative, complete specification. Every decision is made. Nothing here requires asking the human.

---

## 0. AGENT EXECUTION PROTOCOL (read this first, follow it exactly)

You are implementing this entire project from this document. Treat it as the spec, the backlog and the acceptance test suite at once.

### 0.1 Ground rules

1. **Do not ask questions.** Every design decision is made in this document. Where something is genuinely unspecified, choose the simplest option consistent with the Design Pillars (§1.2), write the choice into `DECISIONS.md` with one line of rationale, and continue.
2. **Work strictly in phase order** (§22). Within a phase, work in the listed step order. Never start phase N+1 until every acceptance check of phase N passes.
3. **Keep it running.** After every step: `npm run typecheck && npm run test` must pass. Never leave the repo broken between steps.
4. **Commit after every step** with message `P<phase>.<step>: <summary>` (e.g. `P2.3: plant lifecycle stages`). If git isn't initialized, run `git init` in step P1.1.
5. **Track progress in `PROGRESS.md`** at the repo root (format in §0.3). Update it after every step. If your session ends or the context is reset, the next session resumes from `PROGRESS.md` alone — so it must always say exactly what is done and what is next.
6. **No file over ~300 lines.** Split before it grows. Small files keep every module easy to reason about.
7. **All tunable numbers go in `src/sim/config.ts`** (§21). No magic numbers in logic. Content tables (`ITEM_DEFS`, `RECIPES`, `POWER_DEFS`) are data files and count as config.
8. **Never import `three` inside `src/sim/`.** Never use `Math.random()` or `Date.now()` inside `src/sim/`. (Enforced by the lint rule in §2.3 and by the determinism test.)
9. **Prefer boring code:** plain classes, plain arrays, plain objects, explicit names. No ECS framework, no physics engine, no React, no state libraries.
10. **When a system is listed as "stub" in a phase, implement its data model and a no-op/minimal update** so later phases slot in without refactors.
11. **Self-verify visually-described criteria with headless proxies.** Many acceptance checks describe what a viewer sees. For each, there is a headless assertion in the test suite (§20) — implement and run those. You cannot look at the screen; the event log and state assertions are your eyes.

### 0.2 Session start checklist

At the start of every session:

1. Read `PROGRESS.md` (if missing, you are at P1.1).
2. Read the section of this document for the current phase, plus §3 (architecture) and §21 (config).
3. Run `npm run typecheck && npm run test` to confirm a green baseline. If red, fix before anything else.
4. Continue at the next unchecked step.

### 0.3 `PROGRESS.md` format

```md
# Nibblets progress
Current: P3.4 — hut construction action
## Done
- [x] P1.1 scaffold … (commit abc123)
- [x] P1.2 shared types/rng/events …
## Next
- [ ] P3.4 BuildBuilding action
- [ ] P3.5 SeekShelter …
## Notes / known issues
- Pathfinding occasionally re-plans twice per tick near water; harmless, revisit in P9.
```

### 0.4 Definition of done (whole project)

All phase acceptance checklists (§22) are green; `npm run test`, `npm run typecheck`, `npm run lint`, `npm run build` all pass; `npm run balance` prints a report where the default world survives 3 in-game years across 5 seeds; the app runs with `npm run dev` and shows a living goblin village. LLM mode works with the mock provider offline and with a real provider when configured. The god game is fully playable with the complete UI of §18 in Sandbox, Divine and Observer modes, and any world replays identically from its seed and command log.

---

## 1. Vision

### 1.1 Pitch

Nibblets are small, big-eared, big-nosed **goblins**. They hatch from eggs, grow up, eat apples, plant the cores, raise orchards, chop bushes for wood, build huts against the rain, sharpen spears against the Gnashers that come at night, fall in love, lay eggs, collect shiny pebbles, pull pranks, mourn their dead, and pass down their colors, their sizes and their knowledge to the next generation. Nobody scripts any of it. You watch, nudge, and read what they write about it.

Each goblin has a genome. Skin color, eye color, patterns, ear length, nose size, tusks and adult size are inherited. Over generations, a village drifts into its own look — a mossy-green clan of long-eared foragers, or a rust-orange clan of stocky fighters.

**You are their god.** Nibblets is also a god game. A giant hand can lift a goblin into the sky, drop apples at its feet, raise hills, dig ponds, call rain, heal the sick, or hurl lightning and meteors. The goblins never see you — they only see what happens, and they build a faith around it: they name you, pray to you, leave shiny offerings, fear you or love you, and pass that faith to their children. You influence; they decide.

An **optional LLM mode** gives them voices: they chat in speech bubbles, keep diaries, an elder writes a seasonal chronicle — and you can speak to them as a voice from the sky, and they answer back. The LLM narrates and translates, it never decides.

### 1.2 Design pillars (use these to resolve any ambiguity)

1. **Simulation first, rendering second.** The sim is pure, deterministic, headless TypeScript. The renderer is a read-only view.
2. **Every resource has at least two competing uses.** Decisions create emergence.
3. **Emergence over scripting.** No scripted story events. Stories come from needs × personality × genetics × world state.
4. **Legible at a glance.** Any behavior should be readable from the screen without opening a panel: carried items are visible, emotes show intent, bushes show their apples, goblins show their age by size.
5. **The LLM narrates and translates, never decides.** It writes words (diaries, dialogue, replies) and translates the player's spoken words into a bounded, logged command (§17.7). For the same seed and command log, LLM on or off produces the identical simulation.
6. **Readable code over clever code.**
7. **The player is a god, not a puppeteer.** Every intervention goes through world systems as a logged command; goblins perceive, interpret, obey or defy.

### 1.3 Non-goals

Multiplayer; physics engine; skeletal animation (all animation is procedural transforms); mobile/touch support; sound (stretch only, §24).

---

## 2. Technology Stack & Project Setup

### 2.1 Dependencies

| Concern | Choice |
|---|---|
| Language | TypeScript 5.x, `strict: true`, `noUncheckedIndexedAccess: true` |
| Rendering | `three` (latest), `@types/three` |
| Dev server / build | `vite` |
| Noise | `simplex-noise` (seeded via our RNG) |
| UI fonts | `@fontsource/fredoka`, `@fontsource/patrick-hand` (bundled, work offline) |
| Tests | `vitest` |
| Lint / format | `eslint` (flat config, `typescript-eslint`), `prettier` |
| Balance runner | `tsx` (runs `tools/balance.ts` in Node) |
| LLM proxy | Node built-in `http` only (no Express) |

### 2.2 Scripts (`package.json`)

```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "eslint src tools",
    "balance": "tsx tools/balance.ts",
    "llm-proxy": "tsx tools/llm-proxy.ts"
  }
}
```

### 2.3 Lint rules that protect the architecture

In `eslint.config.js`, for files matching `src/sim/**`:
- `no-restricted-imports`: forbid `three` and anything under `src/render`, `src/ui`, `src/llm`.
- `no-restricted-properties`: forbid `Math.random` and `Date.now`.
- `no-restricted-globals`: forbid `window`, `document`, `localStorage`.

For `src/render/**` and `src/ui/**`: forbid importing mutating sim APIs except through `src/sim/commands.ts` (convention: render/ui import types and the `World` read API only).

### 2.4 Bootstrap

```bash
npm create vite@latest nibblets -- --template vanilla-ts
cd nibblets
npm i three simplex-noise @fontsource/fredoka @fontsource/patrick-hand
npm i -D @types/three vitest eslint typescript-eslint prettier tsx
```

---

## 3. Architecture

### 3.1 The two-world rule

```
┌──────────────────────────────┐ snapshot  ┌───────────────────────────────┐
│ src/sim  (headless, pure)    │ ────────▶ │ src/render (Three.js)         │
│ world, goblins, genetics,    │  events   │ reads state, lerps positions, │
│ AI, plants, weather, combat, │ ────────▶ │ builds meshes from phenotype, │
│ economy, culture…            │           │ particles, lighting           │
│ no three, no DOM, no Math.random         │ never mutates sim             │
└──────────────▲───────────────┘           └──────────────┬────────────────┘
               │ commands (typed queue)                    │ picking
               └────────────── src/ui (HUD, panels) ◀──────┘
                                    │ events
                               src/llm (async narration, annotations only)
```

- **Fixed tick:** sim runs at 10 ticks per simulated second. Speed controls (pause, 1×, 4×, 16×, 64×) run more ticks per real second. Cap: max 64 ticks per frame; if behind, drop time rather than spiral.
- **Interpolation:** renderer keeps the previous and current snapshot of positions/rotations and lerps by `accumulator / tickDuration`.
- **Commands:** UI and god tools never mutate state directly; they push typed commands (`{type:'setSpeed'}`, `{type:'dropApples', at}` …) into `world.commands`, applied at the start of the next tick. This keeps the god game deterministic and replayable. Every applied command is appended to `world.commandLog` (saved), so seed + log reproduces a world exactly (§17.8).
- **Headless:** because `sim` has no rendering dependencies, tests and the balance runner simulate years in seconds.

### 3.2 Determinism

- One seeded RNG (`mulberry32`) owned by the world. All randomness flows through `world.rng`. Sub-systems that need independent streams derive child RNGs: `rng.fork('worldgen')` (hash label + seed).
- Iterate entities in array order, sorted by ID when order could vary. Never depend on object key order of numeric-string keys mixing with others; relationships use `Map<ID, number>` serialized as sorted arrays.
- State hash: FNV-1a over a canonical JSON serialization (sorted keys) excluding `llm` annotations.
- **Determinism test (permanent from P1):** seed 1234, 5,000 ticks, twice → equal hashes. Also: save at tick 2,500 → load → run to 5,000 → equal hash to uninterrupted run.

### 3.3 Time & calendar

| Unit | Value |
|---|---|
| Tick | 0.1 simulated seconds |
| Day | 3,600 ticks (6 real minutes at 1×) |
| Day phases | Dawn 0.00–0.05, Day 0.05–0.60, Dusk 0.60–0.70, Night 0.70–1.00 |
| Season | 8 days |
| Year | 4 seasons (Spring, Summer, Autumn, Winter) = 32 days |
| Moon | 8-day cycle (full moon on day 4 of each season) — used by enemies and festivals |

### 3.4 Event bus

The sim emits typed `SimEvent`s each tick; they are buffered and flushed at the end of the tick to subscribers (renderer FX, toasts, memory system, statistics, LLM log, tests).

```ts
interface BaseEvent { tick: number; at?: Vec2 }
type SimEvent = BaseEvent & (
  | { type: 'item_eaten'; goblinId: ID; item: ItemType }
  | { type: 'core_planted'; goblinId: ID; plantId: ID }
  | { type: 'plant_stage'; plantId: ID; stage: PlantStage }
  | { type: 'plant_chopped'; goblinId: ID; plantId: ID; wood: number }
  | { type: 'rock_mined'; goblinId: ID; rockId: ID }
  | { type: 'item_crafted'; goblinId: ID; item: ItemType }
  | { type: 'building_placed' | 'building_completed' | 'building_destroyed'; buildingId: ID; kind: BuildingType; goblinId?: ID }
  | { type: 'weather_changed'; from: WeatherKind; to: WeatherKind }
  | { type: 'season_changed'; season: Season; year: number }
  | { type: 'enemy_spawned' | 'enemy_fled' | 'enemy_killed'; enemyId: ID; kind: EnemyKind }
  | { type: 'enemy_spotted'; goblinId: ID; enemyId: ID }
  | { type: 'attack'; attackerId: ID; targetId: ID; damage: number }
  | { type: 'goblin_died'; goblinId: ID; cause: DeathCause }
  | { type: 'gift_given'; fromId: ID; toId: ID; item: ItemType }
  | { type: 'theft'; thiefId: ID; victimId: ID | null; item: ItemType; witnessIds: ID[] }
  | { type: 'prank'; prankerId: ID; targetId: ID; kind: PrankKind }
  | { type: 'chat'; aId: ID; bId: ID; topic: ChatTopic }
  | { type: 'bond_formed'; aId: ID; bId: ID; kind: 'friend' | 'mate' | 'rival' }
  | { type: 'egg_laid'; eggId: ID; parents: [ID, ID] }
  | { type: 'egg_hatched'; eggId: ID; goblinId: ID }
  | { type: 'egg_lost'; eggId: ID; cause: 'cold' | 'eaten' | 'neglect' }
  | { type: 'life_stage'; goblinId: ID; stage: LifeStage }
  | { type: 'recipe_discovered' | 'recipe_learned' | 'recipe_lost'; goblinId?: ID; recipe: RecipeId; via?: 'teach' | 'book' | 'discovery' }
  | { type: 'sickness'; goblinId: ID; disease: DiseaseId; phase: 'infected' | 'symptomatic' | 'recovered' | 'died' }
  | { type: 'trinket_found'; goblinId: ID; trinket: TrinketKind; rarity: Rarity }
  | { type: 'mood_break'; goblinId: ID; kind: MoodBreakKind }
  | { type: 'festival'; kind: FestivalKind; phase: 'start' | 'end' }
  | { type: 'chief_chosen'; goblinId: ID; previousId: ID | null }
  | { type: 'fire_started' | 'fire_spread' | 'fire_out'; tile: Vec2 }
  | { type: 'trade'; aId: ID; bId: ID; gave: ItemStack[]; got: ItemStack[] }
  | { type: 'clan_contact' | 'clan_raid' | 'clan_alliance'; clanA: ID; clanB: ID }
  | { type: 'place_named'; placeId: ID; name: string }
  | { type: 'superstition_formed'; belief: BeliefId }
  | { type: 'divine_act'; act: PowerId | 'grab' | 'set_down' | 'drop' | 'throw' | 'pet' | 'poke' | 'flick' | 'gift'; targetId?: ID; witnessIds: ID[] }
  | { type: 'god_spoke'; addressees: ID[]; tone: Tone; intents: WishIntent[]; source: 'voice' | 'sign' }
  | { type: 'first_voice'; goblinId: ID }
  | { type: 'prayer'; prayerId: ID; goblinId: ID; kind: PrayerKind }
  | { type: 'prayer_answered' | 'prayer_ignored'; prayerId: ID; goblinId: ID }
  | { type: 'wish_fulfilled' | 'wish_defied'; goblinId: ID; intent: WishIntent }
  | { type: 'converted'; goblinId: ID }
  | { type: 'shaman_chosen'; goblinId: ID; previousId: ID | null }
  | { type: 'god_named'; name: string }
  | { type: 'power_unlocked'; power: PowerId; tier: number }
  | { type: 'command_rejected'; command: string; reason: string }
)
```

### 3.5 Directory layout

```
nibblets/
├── index.html
├── PROGRESS.md            # agent progress log (§0.3)
├── DECISIONS.md           # agent's small decisions log
├── NIBBLETS_DESIGN_DOC.md # this file
├── vite.config.ts  tsconfig.json  eslint.config.js  .prettierrc
├── tools/
│   ├── balance.ts         # headless multi-seed balance report (§20.4)
│   └── llm-proxy.ts       # local proxy holding the API key (§19.2)
└── src/
    ├── main.ts                    # bootstrap + main loop
    ├── shared/
    │   ├── types.ts  math.ts  rng.ts  events.ts  ids.ts
    ├── sim/
    │   ├── config.ts              # ALL tunables (§21)
    │   ├── world.ts               # World class, tick pipeline (§6)
    │   ├── commands.ts            # command types + application
    │   ├── worldgen.ts            # terrain, biomes, resource scatter
    │   ├── grid.ts  spatialHash.ts  pathfinding.ts  steering.ts
    │   ├── time.ts  weather.ts  temperature.ts
    │   ├── items.ts  inventory.ts  recipes.ts  crafting.ts
    │   ├── plants.ts  ecology.ts  resources.ts  wildlife.ts  fishing.ts
    │   ├── buildings.ts  fire.ts  paths.ts
    │   ├── goblin/
    │   │   ├── goblin.ts          # entity type + factory
    │   │   ├── needs.ts  mood.ts  health.ts  lifecycle.ts
    │   │   ├── personality.ts  names.ts
    │   │   └── genetics/
    │   │       ├── genome.ts      # loci, alleles, meiosis, mutation
    │   │       ├── phenotype.ts   # genome + age → visible traits
    │   │       └── founders.ts    # starting gene pools
    │   ├── ai/
    │   │   ├── utility.ts  considerations.ts  senses.ts  memory.ts  planner.ts
    │   │   └── actions/           # one file per action (§7.3)
    │   ├── social/
    │   │   ├── relationships.ts  chat.ts  gifts.ts  mischief.ts
    │   │   ├── reproduction.ts  family.ts  leadership.ts  reputation.ts
    │   ├── culture/
    │   │   ├── knowledge.ts  books.ts  festivals.ts  funerals.ts
    │   │   ├── superstitions.ts  placeNames.ts  music.ts
    │   ├── economy/
    │   │   ├── trinkets.ts  value.ts  trade.ts  stockpiles.ts
    │   ├── danger/
    │   │   ├── enemies.ts  combat.ts  disease.ts  disasters.ts
    │   ├── god/
    │   │   ├── godState.ts        # mode, favor, alignment, tier, cooldowns, god name (§17)
    │   │   ├── powerDefs.ts       # POWER_DEFS data table (§17.5)
    │   │   ├── powers/            # one file per power effect
    │   │   ├── hand.ts  airborne.ts  faith.ts  prayers.ts  wishes.ts  weatherCells.ts  sandbox.ts
    │   ├── clans.ts               # rival goblin clans (P10)
    │   ├── stats.ts               # time-series statistics
    │   └── save.ts
    ├── render/
    │   ├── renderer.ts  camera.ts  interpolation.ts  picking.ts
    │   ├── palette.ts  lowpoly.ts         # shared materials, flat-shading helpers
    │   ├── terrainMesh.ts  waterMesh.ts  pathOverlay.ts
    │   ├── goblinMesh.ts                  # procedural goblin from phenotype (§4.4)
    │   ├── goblinView.ts  emotes.ts  props.ts
    │   ├── meshFactory.ts  instancing.ts
    │   ├── weatherFx.ts  sky.ts  fireFx.ts  particles.ts
    │   ├── photoMode.ts
    │   └── godHand.ts  powerFx.ts  decals.ts  outline.ts  portraits.ts
    ├── ui/                        # full structure in §18.13
    │   ├── store.ts  input.ts  i18n.ts  theme.css  icons.svg  dom.ts  charts.ts  audio.ts
    │   ├── tools/  components/  screens/
    └── llm/
        ├── provider.ts  eventCompactor.ts  prompts.ts  scheduler.ts  store.ts
        ├── godVoice.ts            # interpreter + responder + validator (§17.7.2)
        └── intentFallback.ts      # keyword intent parser, EN + DE
```

---

## 4. The Goblins: Anatomy, Genetics & Life Stages

This is the heart of the game's identity. Read it fully before P1 (the genome and phenotype exist from P1, even though breeding arrives in P5).

### 4.1 What a Nibblet looks like

A Nibblet is a small, round-bellied goblin, roughly knee-high to a human in adult form (≈ 0.8 world units tall at size gene 1.0). Silhouette features, all procedural, all driven by phenotype:

- **Head** large relative to body (≈ 45% of height, larger in babies — 60%). Low-poly icosahedron, slightly squashed.
- **Ears**: long, pointy, sideways cones — the signature feature. Length, droop angle and notch (a little triangle cut out, from fights or genetics) vary.
- **Nose**: a cone or a bulb, varying size and droop.
- **Eyes**: two spheres with a pupil disc; iris color is a gene; eyes glow faintly at night (emissive 0.15).
- **Tusks**: optional pair of tiny cones from the lower jaw (gene).
- **Body**: pear-shaped (stretched icosahedron, detail 1, bottom-heavy). Belly roundness reflects current hunger (well-fed goblins are visibly plumper — legibility pillar).
- **Arms**: thin cylinders with ball hands; **legs**: short stubby cylinders with oversized cone feet.
- **Skin pattern**: none / spots / stripes / two-tone belly / freckles — implemented as per-face vertex colors on the body mesh.
- **Clothing**: crafted items (fiber loincloth, leaf cape, bone necklace, flower crown) appear as attached low-poly props (P5+).
- **Triangle budget:** adult ≤ 250 triangles including props.

### 4.2 Genome model

Simple Mendelian-plus-quantitative genetics. Each goblin has a diploid genome: two alleles per locus (one from each parent). Discrete loci use dominance; quantitative loci average with noise.

```ts
type Allele = number;                       // meaning depends on locus kind
interface Locus { a: Allele; b: Allele }    // maternal, paternal

interface Genome {
  // ---- color (quantitative, values are 0..1 except hue in 0..360) ----
  skinHue: Locus;        // circular trait; blended on the hue circle (shortest arc)
  skinSat: Locus;        // 0.25..0.85
  skinLight: Locus;      // 0.25..0.70
  eyeHue: Locus;         // 0..360
  // ---- pattern (discrete, dominance order) ----
  pattern: Locus;        // 0 none, 1 freckles, 2 spots, 3 stripes, 4 two-tone; dominance: 2>3>1>4>0
  patternHueShift: Locus;// -60..+60 degrees relative to skin hue
  // ---- morphology (quantitative) ----
  adultSize: Locus;      // 0.75..1.35 scale multiplier
  earLength: Locus;      // 0.6..1.6
  earDroop: Locus;       // 0..1
  noseSize: Locus;       // 0.6..1.5
  bellyRound: Locus;     // 0.8..1.25 base belly
  // ---- discrete morphology ----
  tusks: Locus;          // 0/1, recessive: tusks only if both alleles 1
  albino: Locus;         // 0/1 rare recessive: sat→0.05, light→0.85, eyes red
  // ---- behavioral predispositions (quantitative, 0..1) → personality baseline (§7.6) ----
  temperament: {
    gluttony: Locus; bravery: Locus; sociability: Locus;
    industry: Locus; wanderlust: Locus; mischief: Locus; piety: Locus;
  };
  // ---- physiology (quantitative) ----
  vigor: Locus;          // 0.8..1.2: max hp, disease resistance
  metabolism: Locus;     // 0.85..1.15: hunger decay multiplier (fast metabolism = hungrier but heals faster)
  coldTolerance: Locus;  // 0..1
  lifespan: Locus;       // 0.85..1.15 multiplier on base lifespan
}
```

**Expression rules (`phenotype.ts`):**
- Quantitative locus: `value = (a + b) / 2`.
- Circular (hue): average on the circle (shortest arc), so red (350) × orange (20) → 5, not 185.
- Discrete with dominance: express the allele with higher dominance rank.
- Recessive flags (`tusks`, `albino`): expressed only if `a === 1 && b === 1`.

**Inheritance (`genome.ts → meiosis`):** child gets, per locus, one random allele from mother (a or b, 50/50) and one from father. Then **mutation**: each quantitative allele has a 6% chance of a Gaussian nudge (σ = 8% of its range, hue σ = 18°); each discrete allele has a 1% chance to flip to a random valid value. All via `world.rng`. Values clamped to their ranges.

Consequences (all of these must be emergent, not coded): siblings differ; two green parents can produce a teal child; a recessive tusk or albino trait can skip generations and reappear; a clan's average hue drifts over generations; selection pressure exists because `vigor`, `coldTolerance`, `metabolism` and `bravery` genuinely affect survival.

### 4.3 Founder population

`founders.ts` creates the starting gene pool from one of several named **clan archetypes** (chosen by the world seed, or by the user in the new-game screen):

| Clan | Skin hue range | Size | Signature |
|---|---|---|---|
| Moss | 90–140 (greens) | 0.9–1.05 | long ears, freckles common, high wanderlust |
| Ember | 10–35 (rust/orange) | 1.05–1.25 | tusks allele frequency 40%, high bravery |
| Tide | 170–210 (teal/blue-grey) | 0.85–1.0 | stripes common, high sociability, coldTolerance high |
| Plum | 270–310 (purples) | 0.8–0.95 | big noses, spots common, high mischief |
| Mixed | full wheel | full range | random, maximum diversity (default) |

Each founder's alleles are sampled independently around the clan's ranges, so even a single-clan start has visible variety. Albino allele: 3% frequency among founders (rarely expressed at start).

### 4.4 Life stages, size & growth

| Stage | Age (days) | Body scale | Proportions | Abilities |
|---|---|---|---|---|
| **Egg** | −2 → 0 | egg 0.25 | speckled egg tinted with the child's skin hue (the genome exists from laying) | needs warmth (§13.3) |
| **Hatchling** | 0 → 4 | 0.35 × adultSize | head 60%, huge eyes, tiny ears | follows a parent, eats half portions, can't carry/work, sleeps 50% of the time |
| **Youngling** | 4 → 16 | lerp 0.35 → 0.8 × adultSize | head 52% | plays, explores near home, learns recipes 2× faster, can carry 1 item, does light tasks (pick up, water saplings) |
| **Adult** | 16 → 80 | 1.0 × adultSize | head 45% | everything |
| **Elder** | 80 → death | 0.92 × adultSize, slight stoop (body tilt 12°), skin lightness −10%, saturation −20% | ears droop +0.3 | −20% speed, +50% teaching speed, +social respect, chronicler (P9) |

- Base lifespan: 112 days (3.5 years) × `lifespan` gene × health modifiers; natural death between 90% and 110% of that.
- **Growth is continuous:** scale is recomputed from age every in-game hour and passed to the renderer — you literally watch a hatchling grow over its first season.
- Size has gameplay: carry capacity (+1 slot if adultSize > 1.15), melee damage ×(0.8 + 0.4×size), speed ×(1.1 − 0.15×size), hunger decay ×size. Big goblins are strong but hungry; small ones are quick and cheap to feed — genuine evolutionary trade-off.

### 4.5 Phenotype → mesh (render side)

`phenotype.ts` (sim) outputs a plain `Phenotype` object; `goblinMesh.ts` (render) builds the mesh from it. The renderer **caches geometry per phenotype bucket** (quantize morphology to 8 steps per trait) and **colors per goblin** via vertex colors, so 150 goblins with distinct looks stay cheap.

```ts
interface Phenotype {
  skinColor: HSL; patternColor: HSL; eyeColor: HSL;
  pattern: 'none' | 'freckles' | 'spots' | 'stripes' | 'twotone';
  scale: number;            // current, age-dependent
  headRatio: number;        // age-dependent
  earLength: number; earDroop: number; noseSize: number;
  belly: number;            // gene base × current fullness
  tusks: boolean; albino: boolean;
  stoop: number;            // elder tilt
  scars: number;            // 0..3, from combat; adds notches/marks
}
```

Procedural animation (all in `goblinView.ts`, transform-only):
- Walk: body bob (sin), alternating foot lift, ear flop with phase lag (ears are the "secondary motion" that sells life).
- Work: arm swing toward target; squash-stretch on each hit.
- Idle: blink every 3–6 s, ear twitch, look-around head yaw.
- Sleep: lie down (rotate 90°), slow belly breathing, "z" sprite.
- Emotions (from mood §7.5): happy hop, sad slump (head down, ears droop), angry stomp, scared tremble.
- Babies wobble when walking (extra roll oscillation).

### 4.6 Naming

`names.ts`: syllable-based goblin names, seeded: prefixes (`Gri, Snag, Pip, Mog, Wort, Nib, Zib, Krik, Bog, Fizz, Tok, Rak, Mib, Grub, Skrit`) + suffixes (`-gle, -wick, -nok, -zle, -by, -kin, -rot, -sap, -nip, -lump, -tooth, -wort`). Children have a 40% chance to inherit a syllable from a parent ("Pipwick", child of "Pipnok"). Optional epithets earned through deeds (P8): "Grubnok the Brave" (killed 3 Gnashers), "Fizzle Greenthumb" (planted 20 bushes), "Old Mogwick" (elder). Epithets are stored as data and feed the LLM.

---

## 5. World Data Model

All sim state is plain serializable data — no functions, no class instances with hidden state, no Three.js objects. `ID` is a monotonically increasing integer from `world.nextId()`.

```ts
interface WorldState {
  version: number;                  // save schema version
  seed: number;
  tick: number;
  size: { w: number; h: number };   // default 128 × 128 tiles
  tiles: Tile[];                    // row-major
  goblins: Goblin[];
  eggs: Egg[];
  plants: Plant[];
  rocks: Rock[];
  grass: GrassPatch[];
  mushrooms: Mushroom[];
  wildlife: Critter[];
  groundItems: GroundItem[];
  buildings: Building[];
  fires: FireTile[];
  enemies: Enemy[];
  graves: Grave[];
  places: NamedPlace[];
  clans: Clan[];                    // index 0 = player village
  village: VillageState;            // chief, stockpile zones, laws, beliefs, festival state
  god: GodState;                    // mode, favor, alignment, tier, cooldowns, weather cells, prayers, god name (§17)
  commandLog: LoggedCommand[];      // every applied command, for replay (§17.8)
  weather: WeatherState;
  clock: ClockState;
  rngState: number;
  stats: StatsSeries;               // sampled time series for the stats panel
  llm: LlmAnnotations;              // excluded from hash; journals, dialogues, chronicle
}

interface Tile {
  height: number;                   // 0..1
  biome: 'meadow' | 'forest' | 'sand' | 'rock' | 'water' | 'marsh' | 'snow';
  fertility: number;                // 0..1, affects plant growth; depleted by dense planting, restored by compost/ash
  moisture: number;                 // 0..1, rain raises, sun lowers
  walkable: boolean;
  wear: number;                     // 0..1, foot traffic → dirt paths (§10.4)
  occupiedBy: ID | null;
  snow: number;                     // 0..1, winter cover
}
```

### 5.1 Goblin entity

```ts
interface Goblin {
  id: ID; name: string; epithet: string | null;
  clanId: ID;
  genome: Genome;
  bornTick: number;
  lifeStage: LifeStage;
  parents: [ID, ID] | null;         // null for founders
  pos: Vec2; facing: number; velocity: Vec2;
  needs: Needs;
  mood: MoodState;
  personality: Personality;         // genetic baseline + life drift (§7.6)
  health: HealthState;              // hp, injuries, disease, scars
  inventory: ItemStack[];
  equipped: { hand: ItemType | null; body: ItemType | null; neck: ItemType | null; head: ItemType | null };
  activity: ActivityState;          // current action id + action-specific data
  goalStack: Goal[];                // planner subgoals (§7.4)
  homeId: ID | null;
  memory: MemoryEntry[];
  relationships: Relation[];        // sparse, sorted by targetId
  skills: Record<SkillId, number>;  // XP
  knownRecipes: RecipeId[];
  trinkets: ID[];                   // owned trinket item ids (stored at home)
  reputation: number;               // village-wide standing, −100..100
  traits: TraitId[];                // acquired traits (§7.7)
  deeds: DeedCounters;              // kills, plantings, builds, gifts… → epithets & LLM
  godView: GodView;                 // faith, love, fear, wishes (§17.4)
  role: 'none' | 'chief' | 'shaman';
  heldByGod: boolean;               // excluded from AI & pathfinding while true
  lastDecisionTick: number;
}
```

### 5.2 Items

```ts
type ItemType =
  // food
  | 'apple' | 'apple_core' | 'apple_mash' | 'dried_apple' | 'mushroom' | 'glowcap'
  | 'berry' | 'fish' | 'cooked_fish' | 'stew' | 'egg_shell'
  // materials
  | 'wood' | 'stick' | 'leaves' | 'stone' | 'flint' | 'fiber' | 'clay' | 'bone' | 'feather' | 'pelt' | 'flower' | 'ash' | 'compost'
  // tools & weapons
  | 'spear' | 'stone_spear' | 'club' | 'sling' | 'stone_axe' | 'pick' | 'fishing_rod' | 'bucket'
  // wearables
  | 'loincloth' | 'leaf_cape' | 'fur_cloak' | 'bone_necklace' | 'flower_crown' | 'war_paint'
  // containers & misc
  | 'basket' | 'rope' | 'book' | 'drum' | 'flute' | 'torch'
  // trinkets (see §12.1) — each has its own entity data
  | 'trinket';
```

`ITEM_DEFS[type] = { stack, weight, nutrition?, decayDays?, tool?: {chopMul?, mineMul?, fishMul?}, weapon?: {dmg, range}, wear?: {warmth?, armor?, charm?}, burnable?, value }`.

### 5.3 Plants & ecology objects

```ts
type PlantKind = 'apple_bush' | 'berry_bush' | 'tree' | 'flower';
type PlantStage = 'seed' | 'sprout' | 'sapling' | 'young' | 'mature' | 'old' | 'dead' | 'stump';

interface Plant {
  id: ID; kind: PlantKind; pos: Vec2; stage: PlantStage;
  growth: number;          // 0..1 within stage
  fruit: number;           // apples/berries currently hanging
  fruitProgress: number;
  hydration: number;       // 0..1
  hp: number;
  plantedBy: ID | null;    // for deeds & "my orchard" memory
  age: number;
  blight: number;          // 0..1 plant disease (§14.4)
}
interface Rock { id: ID; pos: Vec2; size: 1|2|3; stoneLeft: number; flintChance: number }
interface GrassPatch { id: ID; pos: Vec2; density: number }     // regrows
interface Mushroom { id: ID; pos: Vec2; kind: 'brown' | 'glowcap' | 'redcap'; age: number } // redcap = poisonous
```

### 5.4 Buildings

```ts
type BuildingType =
  | 'hut' | 'stone_hut' | 'longhouse' | 'campfire' | 'hearth' | 'fence' | 'gate'
  | 'storage_pit' | 'drying_rack' | 'grinding_stone' | 'workbench' | 'kiln'
  | 'watchtower' | 'shrine' | 'totem' | 'well' | 'garden_plot' | 'compost_heap'
  | 'nursery' | 'graveyard_marker' | 'library_shelf' | 'music_circle' | 'bridge';

interface Building {
  id: ID; type: BuildingType; pos: Vec2; rotation: 0|1|2|3;
  footprint: { w: number; h: number };
  buildProgress: number;     // 0..1
  hp: number; maxHp: number;
  ownerId: ID | null;        // personal (hut) or null (communal)
  storage: ItemStack[];
  occupants: ID[];
  fuel?: number;             // fires, kiln
  data?: Record<string, number>; // type-specific (e.g., drying rack progress)
  decoration: ID[];          // trinkets displayed (§12.1)
}
```

Full recipe table in §11.

---

## 6. Tick Pipeline

Every tick, in exactly this order:

```
 0. applyCommands()              // queued UI/god commands: validate → apply → log; god acts emit divine_act with witnesses
 1. clock.advance()              // time, day phase, season, moon; emits season_changed
 2. weather.update()             // Markov transitions, storms, temperature field
 3. tiles.update()               // every 50 ticks: moisture, snow, wear decay, fertility regen
 4. plants.update()              // every 10 ticks (staggered by id % 10): growth, fruit, blight
 5. ecology.update()             // grass regrowth, mushroom spawning, wildlife (every 10 ticks)
 6. fire.update()                // spread, burnout
 7. items.update()               // ground item decay (every 50 ticks)
 8. eggs.update()                // incubation, warmth, hatching
 8b. god.update()                // airborne objects, held entities, cooldowns, favor income, prayer expiry,
                                 //   weather cells, timed power effects (sanctuary, swarm, curse)
 9. enemies.senseAndDecide()
10. goblins.updateBodies()       // needs decay, health, disease, aging, life-stage transitions
11. goblins.updateMood()
12. goblins.think()              // AI decisions — staggered: each goblin re-decides when
                                 //   (a) action done/failed, (b) interrupted, or (c) tick % 20 === id % 20
13. goblins.act()                // step current action
14. enemies.act()
15. combat.resolve()
16. social.update()              // relationship decay, conversations in progress, gossip spread
17. culture.update()             // festivals, knowledge decay, superstition formation (every 100 ticks)
18. village.update()             // leadership, laws, stockpile zones (every 300 ticks)
19. clans.update()               // rival clan abstract sim (every 600 ticks)
20. stats.sample()               // every 300 ticks
21. events.flush()
```

**Performance budget:** full tick < 2 ms for 150 goblins, 600 plants, 20 enemies on a mid laptop (enables 64× speed). Stagger heavy work by `id % N` as shown.

---

## 7. AI: Needs, Mood, Personality, Utility, Memory, Planning

### 7.1 Needs

All 0..100, 100 = satisfied. Decay rates per in-game day at 1.0 multipliers (config §21):

| Need | Decay/day | Main restorers | Modifiers |
|---|---|---|---|
| hunger | 60 | eating | × metabolism × size; hatchlings ×0.5 |
| thirst | 90 | drinking (water tile, well, rain puddle, bucket) | ×1.5 in summer heat |
| energy | 70 | sleeping (hut 2×, mat 1.5×, ground 1×) | ×1.3 when working |
| warmth | event-driven | fire, hut, clothing, sun | drains in rain/snow/night/winter; coldTolerance reduces |
| safety | event-driven | near fire, inside hut, near armed friends, daylight | drops on enemy sight/attack, night outdoors, witnessed death |
| social | 25 | chat, gifts, shared meals, festivals | × sociability |
| fun | 30 | play, music, pranks, trinket hunting, festivals | younglings ×2 |
| curiosity | 25 | exploring, discovering recipes/places, reading | × wanderlust |
| comfort | 15 | hut quality, decorations, clothing, mat | elders ×1.5 |
| purpose | 10 | doing high-skill work, teaching, building communal structures | × industry |

Below 15 any need adds a mood penalty; hunger/thirst/warmth at 0 deal hp damage (starvation, dehydration, hypothermia death causes).

### 7.2 Utility scoring

```ts
interface UtilityAction {
  id: ActionId;
  tags: ActionTag[];                      // 'work' | 'food' | 'social' | 'danger' | 'fun' | 'rest'
  minStage: LifeStage;                    // e.g. 'adult' for building
  isAvailable(g: Goblin, w: World): boolean;
  score(g: Goblin, w: World): number;     // 0..1 (danger actions may exceed 1)
  start(g: Goblin, w: World): void;
  step(g: Goblin, w: World): 'running' | 'done' | 'failed';
  interruptible: boolean;
}
```

- Final score = base score × personality weight × mood modifier × chief/law modifier (P8) × small noise (±5%, rng).
- **Hysteresis:** current action gets ×1.15 to prevent dithering.
- **Interrupts:** `Flee`, `SeekShelter` (storm), `ExtinguishFire` and `DefendVillage` are evaluated every tick as cheap checks and can preempt.
- **Considerations** (`considerations.ts`): reusable curves `linear, quadratic, inverseQuadratic, logistic(k, mid), step(threshold)`, and helpers `needUrgency(need)`, `distanceFalloff(d, max)`, `hasItem`, `knownTarget(kind)`, `isNight`, `isRaining`, `villageNeeds(kind)` (communal demand, §12.4).
- Debug overlay shows the top 8 scored actions for the selected goblin with each factor — essential for tuning.

### 7.3 Action catalog

One file per action under `sim/ai/actions/`. Phase noted in brackets.

**Survival:** `Idle`[1] `Wander`[1] `HarvestFruit`[1] `Eat`[1] `Drink`[1] `SleepGround`[1] `PickUp`[1] `Drop`[1] `EatCore`[2] `PlantSeed`[2] `WaterPlant`[2] `Chop`[2] `StoreItem`[2] `TakeItem`[2] `SeekShelter`[3] `SleepHome`[3] `WarmUp`[3] `Forage`(mushrooms/berries)[3]
**Work:** `Build`[3] `GatherForGoal`[3] `ClaimHome`[3] `Mine`[4] `Craft`[4] `TendFire`[4] `RepairBuilding`[4] `CutGrass`[5] `Process`(grind, dry, cook)[5] `Fish`[7] `HaulToStockpile`[7] `TendGarden`[7] `Compost`[7] `DigClay`[7] `FireKiln`[7]
**Danger:** `Flee`[4] `Attack`[4] `Equip`[4] `Guard`[4] `DefendVillage`[4] `ExtinguishFire`[6] `TendSick`[6] `Quarantine`[6]
**Social:** `Chat`[5] `Gift`[5] `Court`[5] `LayEgg`[5] `IncubateEgg`[5] `FeedChild`[5] `Play`[5] `Teach`[5] `Learn`[5] `Comfort`(hug a sad friend)[5] `Prank`[8] `Steal`[8] `Apologize`[8] `Gossip`[8]
**Culture:** `Explore`[2] `HuntTrinket`[8] `Decorate`[8] `Mourn`[6] `BuryDead`[6] `WriteBook`[9] `ReadBook`[9] `PlayMusic`[8] `Dance`[8] `Pray`(shrine)[8] `JoinFestival`[8] `Trade`[10] `Scout`[10]
**Divine:** `LookUp`(react to a witnessed divine act)[1] `Struggle`(while held)[1] `Pray`[8] `MakeOffering`[8] `LeadPrayer`(shaman)[8] `ShakeFist`[8] — divine wishes add no actions; they boost existing ones (§17.6).

### 7.4 Planner (goal stack)

Not full GOAP — a tiny **recipe-resolving goal stack**. When an action needs materials (e.g., `Build hut` needs 6 wood), the planner pushes subgoals: `Obtain(wood, 6)` → resolves to `TakeItem` from stockpile if known, else `Chop` nearest known mature plant, else `Explore` toward forest biome. Subgoals execute as normal actions with a strong focus bonus (×1.5) until the parent goal is satisfied or abandoned (abandon if a need urgency > 0.85 preempts for more than 300 ticks, or the goal becomes impossible). Max depth 4. Planner functions are pure and unit tested. Divine wishes (§17.6) enter the planner as top-level goals whose focus bonus is the wish strength.

### 7.5 Mood & emotions

```ts
interface MoodState {
  value: number;                 // −100..100, smoothed
  modifiers: MoodModifier[];     // {id, amount, expiresTick} e.g. 'ate_tasty_stew' +8 for 1 day
  emotion: 'content' | 'happy' | 'excited' | 'sad' | 'grieving' | 'angry' | 'scared' | 'lonely' | 'bored';
}
```

- Mood = Σ need contributions + Σ active modifiers (ate favorite food, slept in a decorated hut, friend died −30 for 4 days, festival +15, saw a full moon +3 for pious goblins, rain on cold goblins −5…).
- Mood multiplies work speed (0.7× at −100, 1.2× at +100) and social action scores.
- **Mood breaks** (P8): when mood < −70 for over half a day, roll by personality: `tantrum` (smash a random owned item), `sulk` (refuse work, sit alone 0.5 day), `binge` (eat stockpile food), `wander_off` (leave village for a day; may get lost/come back with a trinket). Mood break events are LLM-gold.
- **Inspiration** (P8): mood > 80 for a full day may trigger `inspired` (next craft/build is +1 quality tier or next discovery roll ×3).

### 7.6 Personality

```ts
interface Personality {   // 0..1
  gluttony: number; bravery: number; sociability: number; industry: number;
  wanderlust: number; mischief: number; piety: number;
}
```

- Born: genetic temperament value + Gaussian noise (σ 0.08).
- **Life drift:** experiences nudge traits slowly (±0.01 per notable event, capped ±0.2 from genetic baseline): surviving combat +bravery, being robbed −sociability, festivals +sociability, losing a child −bravery +piety. So nature *and* nurture.
- Personality → action weights table in `personality.ts` (e.g., `Prank` weight = 0.2 + 1.6×mischief; `Guard` = 0.3 + 1.4×bravery×industry).
- One-line text descriptor derived from extremes for UI and LLM: e.g. "brave, greedy, mischievous".

### 7.7 Acquired traits (max 3 per goblin)

Earned from life history, permanently alter behavior. Examples: `green_thumb` (planted 25 → +50% plant growth for their plantings), `veteran` (survived 5 fights → never panics), `scarred` (cosmetic + intimidation), `gourmand` (ate 10 stews → mood bonus from cooked food, penalty from raw), `hoarder` (owns ≥ 8 trinkets), `night_owl` (sleeps by day), `storyteller` (wrote a book — P9), `grudge_holder` (relationship drops never decay), `orphan` (+bravery, −social baseline), `twin` (bonded sibling, shared mood modifiers). Each trait is a small data entry with weight modifiers; the inspector shows icons.

### 7.8 Senses & memory

- Vision radius 12 tiles by day, 7 at night (×1.4 with torch, ×3 on watchtower). Enemy detection uses a 140° cone + 3-tile omnidirectional "hearing" radius.
- `MemoryEntry { kind, targetId?, pos, data, lastSeenTick, confidence }`. Kinds: `fruit_plant, rock, water, grass, mushroom, building, stockpile, enemy_sighting, danger_zone, trinket_spot, fishing_spot, grave, place`.
- Confidence decays (fruit plants: −0.25/day; enemy sightings: −0.5/day; buildings: −0.02/day). Below 0.1 forgotten. Capacity 60, lowest confidence evicted.
- **Gossip** (P5+): chatting shares the top 3 most useful memories (fruit locations, danger) — knowledge spreads socially. Gossip can carry false info if the source memory is stale.
- Stale memory → visible confusion: arrive, target missing, `?` emote, remove memory, re-decide.

---

## 8. Plants, Ecology & the Apple Chain

### 8.1 The signature chain

```
 apple (eat +40 hunger) ──▶ apple_core ──▶ eat (+10)
                              │
                              └▶ plant ──▶ seed ─▶ sprout ─▶ sapling ─▶ young ─▶ mature apple bush
                                                                          │            │
                                                     chop young: 1 wood ◀─┘            ├─▶ fruit: up to 5 apples, regrows
                                                                                       ├─▶ chop: 3 wood + 2 sticks, leaves stump
                                                                                       └─▶ old (after ~2 years): fewer apples, drops seeds itself
```

Stage durations (days, at hydration 0.6, fertility 0.6): seed 0.5, sprout 1, sapling 1.5, young 2, mature until age 64, old until age 80, then dead (becomes 2 wood free to collect). Stumps regrow a sprout with 30% chance after 4 days (coppicing!).

**Growth rate** = base × hydrationCurve(0.25 dry … 1.5 soaked) × fertility(0.5…1.3) × seasonMul (spring 1.3, summer 1.0, autumn 0.6, winter 0) × gardenBonus × green_thumb.

### 8.2 Other plant kinds

- **Berry bushes** (wild, forest edges): fast fruit, low nutrition (15), seeds only via eating berries and pooping-planting (wildlife and goblins "plant" berry seeds 5% of the time they eat berries — yes, accidental gardening).
- **Trees** (forest biome, worldgen only + natural seeding): lots of wood (8) but need a `stone_axe` to chop. Regrow from fallen seeds slowly. Deforestation is possible and visible.
- **Flowers** (meadows): no food; harvest for `flower_crown` (fun/comfort, courtship gift), bees boost nearby fruit +10%.
- **Mushrooms**: spawn in forest/marsh after rain. Brown (+15 food), glowcap (+10 food, glows at night, ingredient for torches/books ink), redcap (poisonous: −30 hp, sickness — goblins learn to avoid it only if they saw someone get sick or were taught → cultural knowledge!).

### 8.3 Soil

`fertility` per tile: planting draws 0.15 over the plant's life; regenerates +0.02/day; `ash` (from fires) or `compost` (P7, from apple cores, mash, dead plants) adds +0.3. Dense monoculture orchards slowly exhaust soil → incentive for compost and spacing.

### 8.4 Wildlife (P7)

Ambient + light systemic critters: **hoppers** (small rabbits; eat sprouts! fences protect gardens; can be hunted with a sling for food + bone), **chirps** (birds; eat fruit; flee from goblins; feathers drop), **fish** (in water tiles; fishing chain §11), **glimmerflies** (night insects over marsh; pure ambience, attracted to glowcaps). All capped and populations regulate via food availability.

---

## 9. Weather, Temperature & Seasons

### 9.1 Weather state machine

States: `clear, cloudy, fog, rain, storm, snow, blizzard, heatwave`. Transition every 900 ticks (quarter day) via season-dependent Markov matrices in config. Examples: summer favors clear/heatwave; autumn rain/fog/storm; winter snow/blizzard; spring rain.

| Weather | Effects |
|---|---|
| rain | +hydration all plants, puddle tiles (temporary water), warmth drain outdoors, fires outdoors −fuel fast, mood −3 for cold goblins, footprints→mud (slower movement on high-wear tiles) |
| storm | strong warmth drain, buildings with hp < 50% take damage, lightning: 1 strike per in-game hour in storm, may start fire on trees/huts (§10.3) |
| fog | vision −50% (enemies love it), mood "eerie" for pious goblins |
| snow | snow accumulates on tiles (visual white vertex color blend), movement −20% on snow > 0.5, plants dormant |
| blizzard | vision −70%, severe warmth drain, enemies don't spawn either |
| heatwave | thirst ×1.8, plants dehydrate, fire spreads faster, goblins seek shade (trees, huts) |

### 9.2 Temperature

Global air temperature (°C) = seasonal base (spring 12, summer 24, autumn 10, winter −4) + day/night swing (±6) + weather offset. Local felt temperature for a goblin = air + fire proximity (+15 at distance 0 falling to 0 at radius 5) + shelter (+8 hut, +12 stone hut, +16 longhouse with hearth) + clothing warmth − wet penalty (−5 if rained on within last hour without shelter). `warmth` need drifts toward a comfort band (10–24 °C) adjusted by coldTolerance.

### 9.3 Seasons

- Visuals: terrain & foliage vertex color palettes swap with smooth blending over the first day of each season (spring fresh green + flower dots, summer saturated, autumn orange/red bushes, winter grey-white with snow).
- Gameplay: winter = no fruit growth, scarcity → preservation (dried apples, mash, storage pits) becomes the core survival puzzle from P5 on. Autumn = harvest + Harvest Festival. Spring = planting rush, courtship season (+courtship scores).

---

## 10. Buildings, Fire & Paths

### 10.1 Placement

Builders pick a site via `findSite(type, near)`: candidate tiles within radius 14 of the village center (centroid of existing buildings or of founders' spawn), score by flatness, distance to water (huts like 4–10 tiles), distance to other huts (prefer 3–6 for clustering), not on fertile orchard tiles if possible, not blocking paths. Communal buildings near the center. The site is reserved as a `blueprint` building with `buildProgress 0`, rendered as a translucent ghost.

### 10.2 Construction

`Build` action: requires the required materials delivered into the blueprint's storage (haulers can be multiple goblins — cooperative building), then labor ticks advance `buildProgress` by `0.002 × (1 + buildingSkill×0.15) × mood speed`. Two friends building together get ×1.3 each. Scaffold mesh at < 1.0, completed mesh at 1.0, `building_completed` event, deed counter.

### 10.3 Fire

- Fire tiles have `intensity` 0..1 and `fuel`. Sources: campfires/hearths (contained — never spread), lightning, a tantrum near a campfire, kilns (5% spark chance per firing if adjacent to wood).
- Uncontained fire spreads to adjacent burnable tiles (trees, bushes, grass density > 0.5, wooden buildings) with probability scaled by dryness, wind (weather has a wind direction) and heatwave; rain extinguishes.
- `ExtinguishFire`: goblins with a `bucket` (P7) or without (stomp: slow, small hp risk) fight fires; brave/industrious ones prioritize it. Burned tiles leave ash (+fertility) — destruction has a silver lining.

### 10.4 Desire paths

Each tick a goblin walks on a tile, `wear += 0.002` (cap 1); wear decays −0.01/day. Rendered as dirt-colored vertex blending. Pathfinding cost on tiles with wear > 0.5 is 0.8× (goblins prefer existing paths) → **trails emerge** between homes, orchards and water. With P7 `stone_path` construction (1 stone/tile) wear becomes permanent road with 0.6× cost.

### 10.5 Bridges

`bridge` building over narrow water (1–3 tiles) unlocks crossings; pathfinding treats bridge tiles as walkable. Required to reach some islands/resource zones generated by worldgen.

---

## 11. Items, Crafting & Recipes

### 11.1 Recipe table

`station: none` means craftable anywhere. `skill` gates speed, and at level 4+ gives a 25% chance of a **fine** quality item (+50% durability/effect; render with a tiny gold accent). Recipes start **unknown** unless marked `known` (§15.1).

| Recipe | Inputs | Station | Output / effect | Phase | Known at start |
|---|---|---|---|---|---|
| Hut | 6 wood | site | shelter cap 2, storage 6, warmth +8 | 3 | ✔ |
| Campfire | 2 wood, 1 stone | site | warmth radius 5, light, repels enemies r6, fuel 1 wood/half-day | 4 | ✔ |
| Spear | 2 wood | none | weapon dmg 15, reach 1.5 | 4 | ✔ |
| Stone spear | 1 wood, 1 stick, 1 flint | none | dmg 28 | 4 | ✗ |
| Club | 1 wood, 1 stone | none | dmg 20, knockback | 4 | ✗ |
| Sling | 2 fiber, 1 feather | none | ranged dmg 10, range 8, hunting | 7 | ✗ |
| Stone axe | 1 stick, 1 flint, 1 rope | none | chop ×2, can fell trees | 4 | ✗ |
| Pick | 1 stick, 2 stone, 1 rope | none | mine ×2 | 4 | ✗ |
| Fence | 1 wood | site | blocks enemies & hoppers, hp 40 | 4 | ✔ |
| Gate | 2 wood, 1 rope | site | fence that lets goblins through | 5 | ✗ |
| Stone hut | hut + 6 stone | upgrade | cap 3, warmth +12, storm-proof | 4 | ✗ |
| Watchtower | 8 wood, 2 rope | site | sight ×3 for guard on it, early warning toast | 5 | ✗ |
| Basket | 3 fiber | none | +4 inventory slots | 5 | ✔ |
| Rope | 3 fiber | none | material | 5 | ✔ |
| Sleeping mat | 4 fiber | none | sleep ×1.5 outdoors, comfort | 5 | ✔ |
| Grinding stone | 3 stone | site | process 2 apples → 1 apple mash (lasts 12 days, +55 food) | 5 | ✗ |
| Drying rack | 3 wood, 2 rope | site | apples → dried apples (lasts 30 days, +30 food) over 1 day | 5 | ✗ |
| Storage pit | 2 stone, dig | site | 20 slots, food decay ×0.5 | 5 | ✗ |
| Loincloth | 2 fiber | none | warmth +2, comfort | 5 | ✔ |
| Leaf cape | 3 fiber, 2 leaves (chopping drop) | none | warmth +4, rain wet penalty halved | 5 | ✗ |
| Fur cloak | 2 pelt (hopper drop), 1 rope | workbench | warmth +9 | 7 | ✗ |
| Flower crown | 3 flower | none | fun, +charm (courtship) | 5 | ✔ |
| Bone necklace | 3 bone, 1 rope | none | +reputation display, intimidation | 7 | ✗ |
| War paint | 1 ash, 1 berry | none | +bravery during combat for a day | 7 | ✗ |
| Torch | 1 stick, 1 fiber, (glowcap optional) | none | light r4, vision ×1.4 at night, scares enemies r3 | 4 | ✗ |
| Workbench | 4 wood, 2 stone | site | station; crafting ×1.5 speed | 5 | ✗ |
| Fishing rod | 2 stick, 2 fiber | none | enables Fish | 7 | ✗ |
| Bucket | clay → kiln | kiln | carry water: water plants ×5, fight fire | 7 | ✗ |
| Kiln | 6 clay, 4 stone | site | fires clay goods, cooks | 7 | ✗ |
| Hearth | 4 stone, 2 clay | inside hut | cooking: stew (apple+mushroom+fish → +60 food, mood +8) | 7 | ✗ |
| Longhouse | 20 wood, 8 stone, 4 rope | site | communal sleep cap 8, hearth slot, festival venue | 7 | ✗ |
| Well | 8 stone, 2 rope, bucket | site | drinkable water anywhere | 7 | ✗ |
| Garden plot | 2 wood, dig | site | 3×3 fenced bed: plants inside +40% growth, protected from hoppers | 7 | ✗ |
| Compost heap | 3 wood | site | cores/mash/dead plants → compost over 2 days | 7 | ✗ |
| Nursery | 6 wood, 4 fiber | site | eggs inside stay warm without incubating | 7 | ✗ |
| Shrine | 4 stone, 1 trinket | site | pray → mood/piety; site of superstitions | 8 | ✗ |
| Totem | 3 wood, 1 war paint | site | village identity; +safety in radius 8 | 8 | ✗ |
| Drum / Flute | 1 wood + 1 fiber / 1 bone | none | music, festivals | 8 | ✗ |
| Music circle | 6 stone | site | nightly gathering spot | 8 | ✗ |
| Library shelf | 4 wood | in hut/longhouse | stores books | 9 | ✗ |
| Book | 1 fiber(page), 1 ash(ink) | none | writes knowledge (§15.2) | 9 | ✗ |
| Bridge | 4 wood/tile, 2 rope | site | crossing | 7 | ✗ |
| Stone path | 1 stone/tile | site | road | 7 | ✗ |

### 11.2 Processing & cooking chains

- **Apples:** raw (+40, rots 2 days on ground / 4 days stored) → mash (grinding stone, +55, 12 days) or dried (rack, +30, 30 days).
- **Fish:** raw (+25, 1 day, 10% sickness chance) → cooked (fire, +40, 3 days).
- **Stew:** hearth, 1 apple + 1 mushroom + 1 fish (or 2 of any) → +60 food, mood +8, shared meals give social +10 to everyone eating together.
- **Clay:** dig at marsh/riverbank → kiln → bucket, pot (storage +50% preservation), clay tablet (alternative book medium).

### 11.3 Durability

Tools & weapons have durability (uses). Broken tools drop as `stick`/`stone`. Repair at workbench with half the materials.

---

## 12. Economy: Trinkets, Value, Stockpiles & Trade

### 12.1 Trinkets (goblins love shiny things)

```ts
interface Trinket {
  id: ID; kind: 'shiny_pebble' | 'crystal' | 'snail_shell' | 'old_coin' | 'feather_bundle' | 'bone_charm'
              | 'glass_shard' | 'carved_figurine' | 'ancient_tooth' | 'star_stone';
  rarity: 'common' | 'uncommon' | 'rare' | 'legendary';
  hue: number; foundBy: ID; foundTick: number; history: ID[];   // owner chain for stories
}
```

- Found by `HuntTrinket` (curiosity/fun action, weighted by `mischief` and `gluttony` as greed) at riverbanks, rock piles, after storms (washed up), while mining (5%), and from dead enemies. Star stones only spawn where a "shooting star" event lands (rare night event).
- Owned trinkets are displayed in the owner's hut (`Decorate` → comfort & mood +2 per item, max 6) and visible as tiny colored meshes on shelves.
- Trinkets are the currency of affection and status: best courtship gifts, apology gifts, trade goods, shrine offerings, grave goods.
- Theft target: mischievous/greedy goblins may steal trinkets (§13.5). The `history` owner chain creates stories ("the crystal Grubnok stole from his own sister").

### 12.2 Value

Each item has a base value (`ITEM_DEFS.value`). Perceived value per goblin = base × personal modifiers (gluttons value food ×1.5, hoarders trinkets ×2, during winter food ×2 for everyone). Used by gifts (gift impact = perceived value for receiver), trade fairness, and theft temptation.

### 12.3 Stockpiles & communal storage (P7)

Village `stockpileZones` (auto-designated near the center by the chief, or by the player with god tools): food zone, material zone. `HaulToStockpile` moves surplus there. Goblins take from communal stockpiles when needed. Personal storage (hut) vs communal stockpile creates a **sharing vs hoarding** tension driven by personality and village laws (P8).

### 12.4 Village demand

`village.demand[item]` recomputed every 300 ticks: shortfalls (food stock < 3 days of consumption, no spare spears for guards, unhoused goblins, damaged buildings) raise utility scores of corresponding work actions for all industrious goblins — an emergent division of labor without assignments.

### 12.5 Trade (P10)

Between goblins: `Trade` action between friends/acquaintances — swap surplus for needs at roughly equal perceived value; generous personalities accept unfair deals. Between clans: traveling trader goblins from rival clans visit when relations ≥ 0 (§16), bringing items not available locally (e.g., flint, crystals, a recipe to teach).

---

## 13. Social Systems

### 13.1 Relationships

```ts
interface Relation {
  targetId: ID;
  opinion: number;     // −100..100
  familiarity: number; // 0..100, grows with any interaction, slow decay
  bond: 'none' | 'friend' | 'best_friend' | 'rival' | 'enemy' | 'mate' | 'parent' | 'child' | 'sibling';
  lastInteraction: number;
}
```

- Opinion changes: chat +2..+5 (topic match bonus), gift +value-scaled (cap +20), shared meal +3, sleeping in same hut +1/night, building together +2, fought side by side +8, saved from enemy +25, comforted when sad +10, prank received −5 (or +3 if target has high mischief and finds it funny), theft discovered −25, broke tantrum near them −5, attended their family's funeral +6.
- Opinion drifts toward 0 at 1/day without contact (familiarity slows drift). `grudge_holder` trait disables negative drift.
- Bonds formed by thresholds: friend ≥ 40, best friend ≥ 75 (max 2), rival ≤ −40, enemy ≤ −75. Rivals compete (race to resources, refuse to chat, may prank or steal from each other), enemies may fight (non-lethal brawls, P8).
- Family bonds are set by birth and give baseline opinion +40.

### 13.2 Conversations

`Chat` picks a topic from: `weather, food, danger, gossip(memory share), a_person, trinkets, a_place, the_dead, festival, complaint`. Topic chosen by recent memorable events and personality. Visual: facing each other, alternating speech bubbles with icon emotes (apple, raincloud, Gnasher face, heart, skull…). In LLM mode these icon bubbles can be upgraded to real dialogue (§19). Group chats around fires (3–5 goblins) average the effect.

### 13.3 Courtship, eggs & family

1. **Attraction:** opinion ≥ 60, both adult, not closely related (parent/child/sibling/first cousin excluded — `family.ts` tracks lineage), at least one has a home with spare capacity. Spring ×1.5. Attraction also weighs looks: goblins slightly prefer partners whose skin hue is within 60° of their own *or* very different (personality `wanderlust` decides) — this subtle assortative mating creates visible color lineages.
2. **Courtship:** `Court` — gift a flower crown or trinket, dance (hop-circle animation), 2–3 successes across a day → `bond_formed (mate)`. Mates share a home.
3. **Egg:** well-fed mates (hunger > 60) in their hut, no egg in the last 12 days, village population under the soft cap (fertility × max(0, 1 − pop/softCap)) → `LayEgg`. Clutch size 1 (5% twins → twin trait).
4. **Incubation:** egg needs warmth ≥ 0.5 for 2 days (accumulated). Warmth from a parent `IncubateEgg` (sitting on it), inside a hut with hearth, or in a nursery. Cold eggs lose progress; below −1 day of accumulated cold the egg is lost (`egg_lost: cold`). Gnashers steal unguarded eggs at night (`egg_lost: eaten`) — fierce parental defense emerges (parents' bravery ×1.5 when their egg/child is threatened).
5. **Childhood:** hatchlings follow the closer parent; parents `FeedChild` (bring food); younglings `Play` with each other (tag, hide behind bushes — fun need) and `Learn` by watching adults work (skill XP at 25% of the worker's gain, plus 2× recipe learning).
6. **Orphans:** if both parents die, the highest-opinion adult with capacity adopts (or the chief assigns). Orphans gain the `orphan` trait.

### 13.4 Family tree

Every goblin keeps `parents`; the UI's family tree panel draws generations with color swatches — perfect for seeing color inheritance. Lineage stats: "Clan Pip: 4 generations, 23 descendants, average hue 112°".

### 13.5 Mischief, theft & justice (P8)

- **Pranks** (`mischief` > 0.6): hide a goblin's item, scare a sleeping goblin (jump), put a mushroom in someone's bed, paint a hut with berries. Small opinion effects; huge fun for the prankster; LLM loves them.
- **Theft:** probability scales with need (hunger), greed (gluttony/hoarder), mischief, low opinion of the victim, and inversely with village law strictness. Witnesses within vision see it (`theft` event with witnessIds). Witnesses: opinion of thief −15, may gossip → reputation −10 per spread.
- **Justice:** if the village has a chief (§13.6), the chief may impose a consequence on a low-reputation thief: return item, apology gift, or exile for 2 days (thief must camp outside the village radius). Exiles sometimes don't return and join a rival clan (P10).
- `Apologize`: guilty goblins with high sociability later give a gift to the victim to repair opinion.

### 13.6 Reputation & leadership (P8)

- Reputation rises with deeds (building communal structures +5, killing enemies +8, gifts +1, teaching +3, festival participation +1) and falls with theft, cowardice (fleeing while armed and adult when others fight −4), tantrums.
- **Chief selection:** at the start of each year, or when the chief dies: highest score of reputation × 0.5 + age-respect × 0.2 + sum of others' opinion × 0.3. `chief_chosen` event. Chief wears a feathered headdress prop.
- **Chief effects:** chief's personality shapes village **policies**: high industry → work actions ×1.1; high bravery → guard rota (each night 2 armed goblins guard); high sociability → more festivals; high piety → shrine building priority; high mischief → laxer theft justice. Policies are visible in the village panel. A new chief can change village culture — generational politics, emergently.

### 13.7 Grief & funerals (P6)

When a goblin dies: those with opinion > 30 get `grieving` modifier (−10 to −30 scaled by bond, 2–6 days). The village performs `BuryDead` (carry body to the graveyard area, dig, place marker — grave stores name, epithet, birth/death tick, cause, grave goods = 1 trinket from the deceased's collection). `Mourn` at graves on later days restores grief faster. Elders tell stories of the dead (LLM hook). Graves are permanent, clickable, and form a visible cemetery over generations.

---

## 14. Danger: Enemies, Combat, Disease & Disasters

### 14.1 Enemies

| Enemy | Appears | Behavior | Stats | Counter |
|---|---|---|---|---|
| **Gnasher** | nights, more at new moon; fog any time | sneaks to food stockpiles/eggs, steals, attacks lone goblins; flees at 30% hp | hp 60, dmg 10, speed 2.4 | spears, fire, groups |
| **Gnasher pack** | from year 2, 3–5 together, leader with larger mesh | coordinated: leader targets a guard, others raid storage | leader hp 120 | watchtower warning, fences, torches |
| **Bramblebeast** | rare (forest edge), any time | slow, smashes buildings & fences, ignores goblins unless attacked | hp 250, dmg 25, speed 1.2 | stone spears en masse, or just let it pass |
| **Night Wisp** | full-moon nights near marsh | harmless-ish: lures curious/pious goblins away (they follow, mood −, may get lost); dispersed by torches | — | torches, staying inside |
| **Raiding goblins** | rival clan raid (P10) | steal stockpile, fight armed defenders, retreat with loot | goblin stats | defense + diplomacy |

Spawn director: a **threat budget** per night = base + dayCount × ramp + moon modifier − (village defense score × 0.3). Enemies spawn at map edges outside vision, never inside the village radius. Grace period: no enemies before day 3. Hard cap: 20 active enemies.

### 14.2 Combat

- Melee: windup 0.4 s → hit check (attacker skill vs defender evasion, 60–90% hit) → damage = weapon dmg × (0.8 + 0.4×size) × skill mul × fine bonus − armor. Knockback hop. Ranged (sling): projectile entity with travel time.
- Morale: enemies flee at their threshold; goblins flee when `safety` < 20 and `bravery` < 0.5, or hp < 30% unless `veteran`. Defending kin overrides fleeing.
- Injuries (hp < 50% after a hit, 25% chance): `limp` (speed −30% for 3 days), `bruised_arm` (work speed −20%), `ear_notch` (permanent cosmetic scar, +1 to scars). Rest in hut heals ×2. `TendSick` by friends heals ×1.5.
- Death at hp 0 → drop inventory, `goblin_died`, grief, funeral.

### 14.3 Disease (P6)

```ts
interface Disease { id: 'sniffles' | 'gut_rot' | 'shivers' | 'spotted_fever'; transmission: 'contact' | 'food' | 'cold'; incubationDays: number; durationDays: number; mortality: number; symptoms: { workMul: number; hungerMul: number; color?: string } }
```

- **Sniffles** (contact, from rain-chilled goblins): mild, sneeze emote, work −10%.
- **Gut rot** (food: rotten/raw fish/redcap): hp drain, vomit emote, 3% mortality.
- **Shivers** (cold, warmth at 0 for > 2 h): heavy work penalty, 5% mortality for hatchlings/elders.
- **Spotted fever** (contact, rare outbreak, ≈ once per 2 years when population > 25): visible green spots, 12% mortality, spreads in crowded longhouses.
- Infection checks in `social.update` (proximity, chat contact, shared sleeping). `vigor` gene affects resistance and recovery → natural selection.
- Response behaviors: sick goblins rest at home; friends `TendSick`; if the village knows the `herbal_remedy` recipe (discoverable: glowcap + berry), recovery ×2; with high-piety chief, `Quarantine` policy (sick sleep in a separate hut).

### 14.4 Disasters (P6)

- **Wildfire** (§10.3) in heatwave/lightning.
- **Flood**: 3+ consecutive days of rain raise water level of low tiles by one step temporarily; plants on flooded tiles lose hp; huts in lowlands damaged; recedes afterwards leaving +fertility (river valleys are rich but risky).
- **Blight**: plant disease spreading between adjacent apple bushes in damp seasons (blight 0..1, fruit −blight×100%). Counter: chop infected bushes (goblins with farming skill ≥ 3 recognize it), spacing, ash.
- **Drought**: 6+ days without rain in summer: water tiles at edges dry up, hydration crashes — wells & buckets become crucial.
- **Shooting star** (positive disaster): lands at a random spot at night, leaves a crater with a star stone (legendary trinket) — curiosity magnet, festival trigger.

---

## 15. Culture: Knowledge, Books, Festivals, Beliefs, Music, Place Names

### 15.1 Knowledge (P5)

- Each goblin has `knownRecipes`. Unknown recipes can be:
  - **Discovered:** each in-game hour, goblins near a recipe's inputs roll `p = base(0.01) × curiosity × (1 + craftSkill×0.2) × inspiration × (input proximity)`; e.g., holding flint near a stick → stone spear. `recipe_discovered` with a lightbulb emote and a big toast.
  - **Taught:** `Teach` (teacher and learner stationary for 300 ticks, learner opinion of teacher ≥ 10); elders teach 1.5× faster; younglings learn 2× faster.
  - **Observed:** watching someone craft within 4 tiles gives a 2%/craft chance to learn.
  - **Read** (P9): from books (§15.2).
- **Village knowledge** = union of living goblins' known recipes (shown in the village panel). When the last knower dies → `recipe_lost`. Knowledge loss is a real, dramatic risk.
- **Cultural knowledge** (non-recipe facts, same mechanism): `redcap_is_poison`, `gnashers_fear_fire`, `blight_spreads` — goblins who don't know them make mistakes (eat redcaps, don't build fires).

### 15.2 Books (P9)

`WriteBook`: a goblin with ≥ 3 known recipes, industry or `storyteller` inclination, a library shelf in reach and book materials writes one book containing up to 3 recipes/facts (data!) over a day. Books live on library shelves; `ReadBook` (curiosity) teaches the contents at 1 recipe per 300 ticks. Books survive their authors — **lost recipes can be recovered** from books. Books can burn in fires (tension!). In LLM mode, each book also gets generated flavor text (title, a short page in the author's voice).

### 15.3 Festivals (P8)

| Festival | When | Activity | Effects |
|---|---|---|---|
| Sprout Day | first day of spring | everyone plants a core, flower crowns | +fun, +social, orchard boost |
| Sun Feast | mid-summer, clear weather | shared stew meal, games (younglings race) | +mood 15 for 2 days, relationships |
| Harvest Night | last day of autumn | stockpile ceremony, bonfire, music, dancing | +mood, courtship ×2 next spring, chief speech |
| Long Dark | winter solstice (mid-winter) | gather in longhouse, storytelling for the dead | grief recovery, elders honored |
| Starfall | after a shooting star | pilgrimage to crater | +curiosity, +piety |

Festivals need a venue (fire or longhouse), suspend work for a half day, and dramatically spike social systems. Chief personality changes frequency. Festival events are top LLM material.

### 15.4 Superstitions & beliefs (P8)

The village forms beliefs from **coincidences** in its event history (a fun, cheap emergent system):
- Every 100 ticks, `superstitions.ts` scans recent event pairs: if action/condition X preceded a strongly good/bad outcome Y at least 3 times within a season (e.g., "rain started within an hour after a festival", "a Gnasher attacked after someone ate a redcap", "harvest was good after shrine offerings"), and with p = 0.3 × avg piety, a belief forms: `{ id, trigger: X, outcome: Y, valence }`.
- Beliefs alter behavior: pious goblins repeat "lucky" actions (offer a trinket at the shrine before winter) or avoid "unlucky" ones (no one sleeps on the hill where a goblin died). They're rendered in the village panel with a little icon and plain-text sentence generated from a template ("Offering shiny things at the shrine brings a good harvest").
- Divine acts count as outcomes too (§17.4): if the god reliably drops apples after dances, the village comes to believe dancing feeds them.
- Beliefs can fade if contradicted repeatedly. They're pure culture — sometimes useful (fire wards Gnashers — true!), sometimes silly.

### 15.5 Music & dance (P8)

Goblins with a drum or flute `PlayMusic` at dusk at the music circle or fire; others nearby `Dance` (hop in a ring) → fun +, social +, mood +. Each musician has a "style" seed; the renderer shows note particles in their skin color. (Optional stretch: actual WebAudio procedural tunes from the style seed — §24.)

### 15.6 Place names (P9)

When a notable event happens at a location without a name (a battle, a death, a big discovery, a festival, a shooting star), the village names the place via template: `[adjective/person] + [feature]` → "Grubnok's Hill", "Sad Pond", "Gnasher Ford", "Star Hollow". Names render as soft floating labels on the map (toggle), are used by goblins in chat icons and fed to the LLM, so journals reference real local geography.

---

## 16. Rival Clans (P10)

The world map extends beyond the playable area (abstractly). 2–3 rival goblin clans exist as **abstract simulations** (population, food, aggression, relation to player village −100..100, culture traits, dominant colors from their own gene pools).

- **Contact:** a scout from a rival clan wanders in (rendered fully, with their own clan's coloring — visibly different from your village!).
- **Relations** change through: trade visits (+), raids (−), gifts sent by your chief (+), exiles joining them (−/+), intermarriage (+).
- **Trader visits** when relation ≥ 0: brings 3 offers; your goblins trade.
- **Raids** when relation ≤ −40 and the rival is hungry: 3–6 raiders at dusk.
- **Alliance** at ≥ 70: occasional reinforcements against Bramblebeasts; marriage migration — a goblin from the other clan may join yours, bringing **new genes and new recipes** (fresh hue alleles flow into your gene pool!). Your exiles or adventurers may leave to theirs.
- This is the long-term genetic/cultural exchange loop: isolated villages drift and inbreed (minor fertility penalty for low genetic diversity, computed via allele heterozygosity), open villages diversify.

---

## 17. The God Game

### 17.1 The player's role

The player is an unseen god above the village. Nibblets cannot see the god, only its acts: a giant hand that lifts them, apples falling from a clear sky, lightning out of nowhere, a booming voice. They interpret these acts through their own faith, fear and superstitions. The god can feed, heal, test, punish, terraform or simply play — but never directly control a goblin (the one exception is the Sandbox-only Possess tool, §17.6).

Every intervention is a **command** (§3.1) and acts only through the systems the goblins already live in: an apple dropped by the god is an ordinary apple; a lightning strike is an ordinary fire source and damage event; a spoken wish becomes a goal with a bounded utility bonus. This keeps emergence intact and keeps the god game deterministic and replayable.

The village **names its god** the first time three goblins have witnessed a divine act: template-generated from `[size/sky word] + [goblin-world noun]` ("the Sky Grub", "Old Apple-Above", "the Big Hand", "the Cloud Nose"), or LLM-generated in LLM mode. The name is shown in the HUD and used in chat icons, prayers, diaries and the chronicle.

### 17.2 Game modes

| Mode | Favor | Powers | Intended for |
|---|---|---|---|
| **Sandbox** (default) | infinite | all powers of implemented phases; cooldowns optional (setting, default off) plus Sandbox drawer (§17.5.6) | playing god freely, experiments, content creation |
| **Divine** | earned from faith (§17.4) | unlocked by faith tiers (§17.9); costs and cooldowns apply | the real god game: earn worship and spend it wisely |
| **Observer** | — | hand can only select and follow; no world changes | pure simulation watching |

The mode is chosen in the New World wizard (§18.3). Sandbox → Observer may be toggled at any time; Divine can only be chosen for a new world (prevents favor exploits). Difficulty presets (Cozy / Normal / Harsh) are independent of mode and scale enemy threat, winter severity and disaster rates. **Gentle mode** (setting) hides and disables the Wrath category and lethal hand damage entirely — a cozy, kid-friendly way to play.

### 17.3 The God Hand

The world cursor is a large low-poly hand (`render/godHand.ts`, ~300 triangles, warm off-white with a soft rim light) hovering above the terrain point under the mouse. It casts a round blob shadow on the ground so its position is always readable. Hand states and visuals:

| State | When | Visual |
|---|---|---|
| open | idle hover | relaxed open palm, slow bob |
| point | hovering a selectable entity | index finger points; entity gets a hover outline |
| grab | holding something | closed fist, held object dangles under it on a short "string" offset |
| pet | stroking a goblin | fingers wiggle, small heart particles |
| cast | power selected | hand glows in the power category color, radius ring drawn on terrain |
| paint | terraform brush active | hand flat, palm down, brush ring follows |

**Hand gestures** (available in Sandbox and Divine; Observer allows only Select/Follow):

| Gesture | Input | Effect in the sim |
|---|---|---|
| Select | LMB click entity | inspector opens (§18.6) |
| Box select | LMB drag on empty ground with Hand tool | selects all goblins inside → group target for Voice/Signs/powers |
| Pick up | LMB press on goblin/egg/item/sprout/small rock and drag > 6 px | `god_grab`. A held goblin interrupts its action (`Struggle`): legs kick, ears flap, emote by its GodView (§17.4): younglings and high-love goblins giggle, adults with fear > 50 tremble, skeptics yell. Held > 600 ticks → fear +5, mood −10 |
| Raise / lower hand | mouse wheel while holding | changes hold height 1–12 units (shown as a dashed drop line to the ground) |
| Set down | release with hold height ≤ 1.5 | gentle placement: no damage; goblin faith +6, plus love +6 (younglings) or fear +4 (adults) |
| Drop | release with hold height > 1.5 | ballistic fall; damage `max(0, (h − 1.5) × 12)` hp on land, 0 on water (goblin becomes wet). Eggs break above h 2. Witnesses react (§17.4) |
| Throw | release while moving fast | velocity = hand velocity over the last 100 ms, capped at 18 u/s; arc; impact damage `max(0, speed − 6) × 4`. A thrown goblin or rock that hits an enemy damages it too |
| Uproot & replant | pick up a sprout/sapling/young plant | plant keeps its stage if set down on a valid tile within 200 ticks, otherwise drops back to seed |
| Pet / tickle | hold LMB still on a goblin 0.5 s, then wiggle | mood +3 per second, love +1/s (diminishing: max +10 love per goblin per day), giggle animation; hatchlings fall asleep |
| Poke | double-click a goblin | wakes sleepers, interrupts the action, small annoyance (mood −2); repeated pokes: mischievous goblins poke back (point at the sky, shake fist) |
| Flick | Alt + click goblin | knocks it 2 tiles, 5 dmg, fear +6 — a mild punishment |
| Drag from Gift Tray | drag an icon from the tray (§18.5) into the world | spawns the item(s) falling from the sky with a sparkle trail |
| Follow | `F` or inspector button | camera follows the selected entity |

**Airborne objects.** `sim/god/airborne.ts` integrates thrown/dropped entities with gravity 20 u/s², terrain collision, bounce 0.2 for items and 0 for goblins (they tumble once and sit up), water splash. It is deterministic because all inputs arrive as commands with quantized values (positions to 0.01, velocities to 0.01).

**Command flow for grabbing.** The hand's continuous position lives in the UI. The UI emits `god_grab` on pick-up, then at most one `god_hold_move` per sim tick (latest wins) while held, and `god_release { pos, height, velocity }` on release. The sim moves the held entity kinematically to the hold position each tick (it is flagged `heldByGod`, excluded from AI and pathfinding).

### 17.4 Faith, perception, prayers & favor

Per goblin:

```ts
interface GodView {
  faith: number;            // 0..100 — believes the god exists and matters
  love: number;             // 0..100
  fear: number;             // 0..100
  angryAtGod: boolean;      // set when a loved one is harmed by the god; clears after 8 days or a big benevolent act toward them
  wishes: DivineWish[];     // active wishes (§17.6)
  answeredPrayers: number;
  ignoredPrayers: number;
  lastVoiceTick: number;
}
```

**Perception rule.** A goblin reacts to a divine act only if it **witnesses** it: the act happens within its vision radius, it is the target, or it later hears about it through gossip (§7.8; gossip transfers 50% of the effect, and mischievous gossipers exaggerate by +20%). Unwitnessed acts look like nature: a goblin who wasn't there thinks the apple shower was a lucky wind. Every divine act emits `divine_act { act, targetId?, at, witnessIds }` so memory, diaries and statistics see exactly who perceived what.

**Reaction table** (applied to each witness; target-only effects in brackets):

| Act witnessed | faith | love | fear | other |
|---|---|---|---|---|
| gift drop / apple shower / growth | +4 | +3 | — | `look_up` emote, cheer |
| healing (received) | +10 | +10 | — | grateful kneel |
| set down gently (target) | +6 | +6 young / +2 adult | +0 young / +4 adult | — |
| dropped and hurt | +4 | −5 | +10 | witnesses gasp |
| lightning / meteor / earthquake | +8 | — | +15 | panic flee from area for 300 ticks |
| loved one (opinion > 50) harmed by god | +4 | −25 | +20 | `angryAtGod` (low piety: stops praying, shakes fist; high piety: self-blame, offering) |
| prayer answered (praying goblin) | +15 | +10 | — | `prayer_answered`, big joy emote |
| prayer ignored (expired) | −3 | −2 | — | sigh emote |
| voice heard | +12 (first time ever +20) | by tone | by tone | §17.7 |
| out-of-season weather (snow in summer…) | +6 | — | +4 | superstition roll ×3 |

**Faith dynamics.**
- Birth faith = 20 + piety × 30 + 0.3 × mean(parents' faith). Younglings living with high-faith parents drift toward the parents' faith (+0.5/day) — belief is inherited by nurture.
- Faith decays −1/day without any witnessed act (the god must stay present); floor = piety × 20.
- **Skeptics** (faith < 15) explain acts naturally: no faith gain from gifts. A miracle that directly helps a skeptic has a 30% chance to **convert** them (faith +25, `converted` event).
- Love and fear decay toward 30 and 10 respectively at 1/day.

**Prayers.** `Pray` happens at a shrine/temple, or anywhere when desperate (a critical need unmet for > 6 in-game hours, a sick child, a raid at night, a famine). Each prayer creates:

```ts
interface Prayer {
  id: ID; goblinId: ID;
  kind: 'food' | 'water' | 'rain' | 'sun' | 'warmth' | 'healing' | 'protection' | 'child' | 'mate'
      | 'lost_item' | 'revenge' | 'forgiveness' | 'thanks';
  targetId?: ID;            // e.g. the sick child, the rival
  at: Vec2; tick: number; expiresTick: number;   // default 1 day
}
```

Prayers appear in the Prayers panel (§18.7). **Answering is detected automatically**: a prayer counts as answered if, before expiry, a divine act within 8 tiles of the praying goblin satisfies its kind (food: god food dropped/showered near them, or they eat god-dropped food; rain: Rain power over them; healing: Healing Touch on them or the target; protection: lightning/smite on an attacking enemy, Sanctuary; revenge: a curse or smite on the named rival — yes, the god may choose to be petty). `thanks` prayers need no answer and generate double favor.

**Favor** (Divine mode currency):
- `favorIncome/day = Σ goblins (faith / 100) × (0.5 + piety) × (praying ? 3 : 1)` integrated per tick, plus offerings (trinket value × 2, food value × 0.5, consumed one day after placement), festivals held in the god's honor (+20 each) and answered prayers (+5 each).
- `maxFavor = 100 + 15 × believers`, where believers = goblins with faith ≥ 40. Start: 50 favor.

**Divine alignment.** `god.alignment` from −100 (wrathful) to +100 (benevolent). Gifts, heals and answered prayers move it up; smites, plagues, curses and harmful drops move it down (each power's alignment delta is in its definition). Village-wide effects:
- **Benevolent (> 50):** baseline mood +5, festivals more frequent. *Dependence:* while god-given food exceeds 30% of the season's food consumption, every goblin's industry drifts −0.002/day — they start waiting for apples from the sky. The welfare trade-off is deliberate.
- **Wrathful (< −50):** baseline fear, wish obedience +20%, offerings ×2, shrine/temple build priority, mood −5, younglings' bravery drifts down.
- Between: no modifier.

**Shaman.** From P8, the highest-faith adult with piety ≥ 0.6 becomes the village shaman (`role: 'shaman'`, bone-and-feather headdress prop). The shaman leads group prayers (+50% favor while leading), interprets omens (god-related superstitions form twice as fast), and relays proclamations: speaking to all goblins costs 40% less while a shaman lives. A low-piety chief and a high-faith shaman can become rivals — a natural politics thread.

**Offerings & temple.** `MakeOffering` places a trinket or food at a shrine or temple; the shrine displays it (rendered) until consumed. The temple (12 stone, 6 wood, 2 trinkets) multiplies prayer favor ×1.5 within radius 10, is a festival venue, and is required for power tier 4.

**God superstitions.** The superstition system (§15.4) also scans divine acts as outcomes. If the player repeatedly drops apples after festivals, the village comes to believe that "when we dance, the Sky Grub feeds us" and dances more. The player can literally train their worshippers, for better or worse.

### 17.5 Powers catalog

Every power is a data entry in `sim/god/powerDefs.ts`:

```ts
interface PowerDef {
  id: PowerId; category: 'gift' | 'nature' | 'terraform' | 'wrath' | 'miracle' | 'sandbox';
  target: 'point' | 'area' | 'goblin' | 'pair' | 'grave' | 'brush' | 'direction' | 'global';
  radius?: [min: number, max: number];     // adjustable with Shift+wheel
  cost: number; costPerTile?: number;      // favor (Divine mode)
  cooldownHours: number;
  alignment: number;                       // delta per cast
  lethal: boolean;                         // gated by Gentle mode and "confirm lethal" setting
  phase: number;                           // implementation phase
  tier: number;                            // Divine-mode unlock tier (§17.9)
  fx: FxId;                                // render effect id
}
```

Cooldowns use in-game hours (1 in-game hour = 150 ticks).

#### 17.5.1 Gifts (benevolent)

| Power | Target | Cost | CD (h) | Effect |
|---|---|---|---|---|
| Gift Tray | point | item value (apple 2, berry 1, wood 3, stone 3, fiber 2, flint 5, fish 3, trinket 15) | — | items fall from the sky at the drop point |
| Apple Shower | area r 3–6 | 25 | 6 | 12–18 apples rain down; bushes in radius +1 fruit |
| Bountiful Growth | area r 3–6 | 30 | 12 | plants in radius advance one stage or fill their fruit; hydration set to 1 |
| Healing Touch | goblin | 15 | 2 | hp full; injuries and disease cured; golden glow |
| Warm Sun | area r 6–12 | 20 | 6 | +15 °C locally for 2 h; dries wet goblins; melts snow |
| Blessing | goblin or area r 4 | 10 | 1 | mood +20 for 1 day, `blessed` sparkle |
| Inspiration | goblin | 30 | 24 | grants `inspired` (§7.5) and one recipe discovery roll at ×10 |
| Fertility | mated pair | 25 | 48 | next egg guaranteed within 1 day; twin chance 30% |
| Shiny Gift | goblin | 15 | 3 | a rare trinket appears in the goblin's hands |

#### 17.5.2 Nature (neutral)

| Power | Target | Cost | CD (h) | Effect |
|---|---|---|---|---|
| Rain | area r 8–16 | 20 | 4 | local weather cell (§9.1) with rain for 2 h |
| Clear Sky | global | 20 | 4 | ends current weather |
| Snowfall | area r 8–16 | 20 | 4 | local snow cell for 2 h — out of season it's a big omen |
| Gust | direction (drag a line) | 10 | 1 | wind push: knocks goblins and items along the line, fans or blows out fires |
| Fast-Forward Day | global | 15 | 24 | jump to the next dawn or dusk |
| Hasten Season | global | 80 | 1 season | jump to the start of the next season |

**Local weather cells:** the weather system (§9.1) supports up to 4 circular cells overriding global weather inside their radius for their duration. Rendering draws rain/snow particles only inside cells plus a cloud disc above.

#### 17.5.3 Terraform (brushes, Shift+wheel sets radius 1–6)

| Power | Cost | Effect |
|---|---|---|
| Raise / Lower Land | 2 per tile per stroke tick | height ±0.02; cannot lower under buildings; tiles that drop below water level become water |
| Smooth | 1/tile | averages heights |
| Create Water | 3/tile | sets height just below water level (ponds, moats, canals) |
| Fertile Soil | 2/tile | fertility +0.4 |
| Plant Forest | 3/tile | scatters seeds/sprouts (option: apple bush / berry bush / tree / flowers) |
| Place Rock | 8 per rock (point) | new rock; drag length sets size 1–3 |

Terraforming triggers a terrain mesh rebuild of the affected chunk only (terrain is split into 16×16-tile chunks for this reason) and invalidates path caches in the region.

#### 17.5.4 Wrath (disabled in Gentle mode)

| Power | Target | Cost | CD (h) | Effect |
|---|---|---|---|---|
| Lightning Bolt | point r 1 | 15 | 1 | 60 damage to entities at the point; ignites burnables; scorches the tile; flash and thunder |
| Swarm | area r 4–8 | 20 | 12 | biting bugs: goblins in the area flee and can't work there for 1 h — non-lethal crowd control |
| Curse | goblin | 20 | 24 | mood −30 and 25% action-failure chance for 2 days; a small dark cloud rains over its head |
| Blight | area r 3–6 | 25 | 24 | sets blight 0.8 on plants (§14.4) |
| Summon Gnashers | point outside village radius | 30 (Bramblebeast variant 60) | 24 | spawns 2–4 Gnashers (or one Bramblebeast) that act normally |
| Plague | goblin | 40 | 48 | infects with a chosen disease (§14.3) |
| Meteor | area r 4 | 60 | 48 | crater (terrain lowered), buildings in radius destroyed, lethal at the center, ring of fire; 30% chance of a star stone (legendary trinket) |
| Flood | area r 6–14 | 60 | 48 | water level of low tiles +1 step for 1 day (§14.4) |
| Earthquake | area r 15 | 70 | 48 | 10 s camera shake, buildings −50% hp, terrain jitter ±0.03, rocks split into stone piles, goblins knocked down |

#### 17.5.5 Miracles

| Power | Target | Cost | CD (h) | Effect |
|---|---|---|---|---|
| Vision | global | 20 | 24 | every goblin "dreams" all fruit/rock/water/trinket locations within 30 tiles (memories written) |
| Revelation | goblin | 50 | 48 | teaches a chosen recipe — any recipe, including lost or undiscovered ones; the goblin gains the `prophet` trait |
| Sanctuary | area r 8 | 60 | 48 | glowing dome for 1 day: enemies can't enter, weather inside is calm |
| Bring Forth | point | 80 | 72 | a new adult goblin descends in a beam of light (founder genome from a chosen clan archetype) |
| Resurrect | grave of a goblin dead ≤ 2 days | 120 | 96 | the goblin returns with hp 50 and the `returned` trait (piety +0.3; mourners' grief turns to awe) |

#### 17.5.6 Sandbox drawer (Sandbox mode only)

- **Spawn anything:** any item, plant at any stage, rock, building (complete or blueprint), enemy, critter, egg.
- **Breeding tool:** pick two goblins → an egg with a meiosis child of theirs appears (ignores relationships and fertility).
- **Genome editor:** create a goblin from scratch with sliders/dropdowns per locus (both alleles) and a live 3D preview; or edit an existing goblin's cosmetic loci (skin, eyes, pattern, ears, nose, tusks) — the goblin "transforms" with a puff effect.
- **Set time / season / weather** directly; **set any need/mood/faith** on a selected goblin.
- **Remove** any entity (no corpse, no grief — it simply vanishes).
- **Possess** (§17.6).

### 17.6 Divine wishes: influence, not control

```ts
type WishIntent =
  | 'gather' | 'build' | 'plant' | 'guard' | 'fight' | 'hide' | 'avoid' | 'share_food' | 'stop'
  | 'make_peace' | 'rest' | 'explore' | 'come_here' | 'worship' | 'celebrate' | 'teach' | 'tend'
  | 'court' | 'move_home' | 'eat' | 'leave_alone';

interface DivineWish {
  id: ID; intent: WishIntent;
  target?: { kind: 'item' | 'building' | 'entity' | 'place' | 'pos' | 'recipe'; value: string | number; pos?: Vec2 };
  issuedTick: number; expiresTick: number;
  strength: number;   // 0..1 = obedience at issue time
  source: 'voice' | 'sign';
}
```

- **Obedience** = clamp( faith/100 × (0.5 + 0.5 × max(love, fear)/100) × (1 + 0.4 × piety − 0.6 × mischief) × alignmentMul , 0, 1 ), where alignmentMul is 1.2 when wrathful, else 1.
- A wish adds `+0.35 × strength` to the scores of matching actions (`wishMatches(intent, action)` table) and, if needed, pushes a planner goal (§7.4) — e.g. "build a hut" → `Obtain(wood, 6)` → `Build`. Survival interrupts (`Flee`, needs with urgency > 0.85) still win. A starving goblin eats first, then obeys.
- **Defiance:** with probability `0.25 × mischief × (1 − love/100)`, a goblin defies — ignores the wish or deliberately does the opposite for a while (wish "share food" → hides food) and shakes its fist at the sky (`wish_defied` event).
- **Fulfillment:** faith +5, love +3, `wish_fulfilled` event; the UI suggests rewarding with a Blessing (one click) — a training loop.
- Duration: 1 day for voice wishes, half a day for signs. Max 3 active wishes per goblin (oldest replaced).
- **Possess (Sandbox only, P11):** the player takes direct control of one goblin. Its AI is suspended; clicking targets issues concrete actions from the normal catalog (`possessed_act` commands, so determinism holds). The goblin's eyes glow gold. When released, it gets `possessed` memory and an odd mood modifier ("I was not myself").

### 17.7 The God's Voice

There are two ways to speak. Both produce the same deterministic `divine_speech` command.

#### 17.7.1 Divine Signs (always available, LLM not required)

With goblins selected (one, a box-selected group, or the whole village via the "All" toggle), press `V` (or click the Voice tool) to open the **Sign wheel**: a radial menu of intent icons (the `WishIntent` list, grouped in 3 rings: work, safety, social/spirit) plus a tone selector (kind / stern / wrathful / playful). Intents that need a target (build what? gather what? come where?) prompt a second click in the world or a sub-menu. The sign appears as a giant glowing pictogram in the sky above the addressees for 4 s with a low rumble. Addressees respond with emote icons; in LLM mode, also with a generated reply.

#### 17.7.2 Divine Voice (LLM mode)

A text box "Speak as {godName}…" (max 280 characters) in the Voice panel (§18.7). Addressee: the selected goblin, the selected group, or "All Nibblets" (a proclamation, which costs more and reaches every goblin; bystanders within 8 tiles of a single addressee overhear).

```
player text ─▶ [LLM interpreter → strict JSON] ─▶ validate ─▶ divine_speech command (logged) ─▶ sim applies effects
                     │ timeout 10 s / invalid                                                         │
                     └──────────▶ [keyword fallback parser] ─────────────────────────────┘            ▼
                                                                         [LLM responder] ─▶ in-character replies (annotation)
```

**Determinism.** The interpreter is consulted only at the moment the player speaks. Its validated, structured output is frozen into the `divine_speech` command and recorded in `world.commandLog`. Loading a save or replaying the log never calls the LLM again. The sim never awaits: while the interpreter runs (typically 1–3 s), the UI shows "the heavens rumble…" and dims the sky slightly; after 10 s the keyword fallback is used instead.

**Interpreter output schema** (validated by a hand-written validator in `llm/godVoice.ts`; anything invalid falls back to the keyword parser):

```ts
interface InterpretedSpeech {
  tone: 'kind' | 'stern' | 'wrathful' | 'playful';
  isQuestion: boolean;
  intents: { intent: WishIntent; targetRef?: string }[];   // 0..2; targetRef must be one of the provided entity/place refs
  sentiment: number;                                       // −1..1
}
```

**Interpreter prompt** (system):
```
You translate what a god says to small goblins into game data. Output ONLY a JSON object, no prose.
Schema: {"tone":"kind|stern|wrathful|playful","isQuestion":bool,"intents":[{"intent":<one of LIST>,"targetRef":<optional, one of REFS>}],"sentiment":number}
LIST: gather, build, plant, guard, fight, hide, avoid, share_food, stop, make_peace, rest, explore, come_here,
worship, celebrate, teach, tend, court, move_home, eat, leave_alone.
Use at most 2 intents. If the god only chats, praises or asks something, intents may be empty.
REFS (things the goblins know, with ids): {refs}
The god may speak English or German.
```
User message: the player's text. `refs` lists up to 30 nearby named entities, buildings, items, recipes and named places with ids (e.g. `hut#41 "Pipnok's hut"`, `place#3 "Sad Pond"`, `item:wood`, `recipe:stone_spear`, `goblin#12 Krikwick`).

**Keyword fallback** (`llm/intentFallback.ts`, pure, unit-tested, English + German tables): e.g. `build|baut|bauen|hut|hütte` → build(hut); `plant|pflanz` → plant; `share|teil` → share_food; `fight|kämpf|verteidig` → fight/guard; `hide|versteck` → hide; `pray|bete` → worship; `stop|hör auf|halt` → stop; `?` → isQuestion. Tone: "please/bitte/thank/danke" → kind; "!" ×2 or ALL CAPS or "or else/sonst" → stern; insults/threats ("I will smite", "ich zerstöre") → wrathful. The Divine Signs wheel bypasses parsing entirely.

**Sim effects of `divine_speech`** for each goblin that perceives it:
- faith +12 (first time ever +20 and `first_voice` event);
- tone: kind → love +6; stern → faith +4, fear +4; wrathful → fear +12, love −4; playful → love +4, fun +10;
- each intent becomes a `DivineWish` with the goblin's obedience as strength (§17.6);
- memory entry `god_spoke { tick, intents }`;
- reaction animation: look up and perk ears (all), kneel (fear > 60), happy dance (love > 70), shrug and look around (skeptic), babble and clap (hatchlings);
- `god_spoke` event with addressees, tone and intents (interestingness 11 for diaries).

**Responder** (an LLM call after the command is applied; annotation only): 1–3 addressees reply in character — for proclamations the shaman plus one or two random goblins. Input per responder: name, personality, life stage, GodView (faith/love/fear, angryAtGod), current activity and lowest need, what they *understood* (the parsed intents — so the reply matches what they will actually do: "Yes, Sky Grub! Pipnok builds hut right now!" — or, if defiant: "Grubnok builds when Grubnok wants."), the last 6 exchanges with the god, and if `isQuestion`, their relevant memories (so "Where are the apples?" gets a real answer from what that goblin remembers: "Big bush by Sad Pond had four, yesterday!"). Skeptics may think it's the wind or a prank by Fizzle. Replies appear as speech bubbles over the goblins and in the Voice panel conversation log (`world.llm.godConversations[goblinId]`, last 30 exchanges kept).

**Responder prompt** (system, appended to the shared system prompt of §19.5):
```
A god's voice has just spoken from the sky to {name}. Reply as {name} in 1-3 short sentences.
{name}'s view of the god ({godName}): faith {faith}/100, love {love}/100, fear {fear}/100{angry}.
{name} understood the god wants: {understoodIntents}. {name} will {complyOrDefy}.
Personality: {descriptor}. Stage: {stage}. Doing now: {activity}. Biggest worry: {lowestNeed}.
Recent words with the god: {history}
{ifQuestion: What {name} knows that may help answer: {memories}. Answer only from this.}
```
In non-LLM mode, a Mock reply is built from templates keyed by tone, compliance and personality ("Yes yes, Big Hand!" / "Hmph." / "*hides under bush*").

**Costs & limits.** Divine mode: single goblin 5 favor, group 10, proclamation 25 (×0.6 with a living shaman); Sandbox free. Rate limit: one utterance per 10 real seconds. God-voice requests have priority over all other LLM jobs and don't count against the diary budget, but count against the daily token budget (§19.6) with their own sub-cap (default 4k tokens/day).

### 17.8 God commands

```ts
type GodCommand =
  | { type: 'god_grab'; entityId: ID }
  | { type: 'god_hold_move'; pos: Vec2; height: number }
  | { type: 'god_release'; pos: Vec2; height: number; velocity: Vec3 }
  | { type: 'god_spawn_item'; item: ItemType; qty: number; pos: Vec2 }
  | { type: 'god_pet'; goblinId: ID; ticks: number }
  | { type: 'god_poke'; goblinId: ID }
  | { type: 'god_flick'; goblinId: ID; dir: Vec2 }
  | { type: 'god_cast'; power: PowerId; target: PowerTarget; radius?: number; options?: Record<string, string | number> }
  | { type: 'god_paint'; power: PowerId; points: Vec2[]; radius: number }       // one per tick while painting
  | { type: 'divine_speech'; addressees: ID[] | 'all'; tone: Tone; intents: ParsedIntent[]; isQuestion: boolean; source: 'voice' | 'sign'; textRef?: string }
  | { type: 'possess' | 'unpossess'; goblinId: ID }
  | { type: 'possessed_act'; goblinId: ID; action: ActionId; targetId?: ID; pos?: Vec2 }
  | { type: 'sandbox'; op: SandboxOp }                                          // spawn, remove, set weather/time/needs, edit genome, breed
  | { type: 'set_mode'; mode: 'sandbox' | 'observer' };

interface LoggedCommand { tick: number; cmd: GodCommand | SystemCommand }
```

- `world.commandLog` stores every applied command; it is saved with the world. **Replay:** seed + command log → identical world (test, §20.2). The UI offers "Watch replay" from the title screen for any save.
- Every command is validated in the sim (entity exists, power unlocked for the mode, enough favor, cooldown ready, target valid, not lethal in Gentle mode). Invalid → `command_rejected { reason }` event → the UI shakes the tool button and shows the reason in a tooltip ("Not enough favor — 12 more needed").
- Raw player text for the voice is stored under `textRef` in `world.llm` (annotations), not in the hashed state.

### 17.9 Divine mode progression

| Tier | Requirement | Unlocks |
|---|---|---|
| 0 | start | Hand, Gift Tray (apple, wood, stone), Blessing, Lightning Bolt, Divine Signs (single goblin) |
| 1 | 3 believers | Rain, Clear Sky, Healing Touch, Raise/Lower/Smooth, Gift Tray (all basic items), Voice (single goblin) |
| 2 | 6 believers and a shrine | Apple Shower, Warm Sun, Bountiful Growth, Swarm, Curse, Place Rock, Plant Forest, Fertile Soil, group Voice/Signs |
| 3 | 10 believers, average faith ≥ 50 | Meteor, Earthquake, Flood, Plague, Blight, Summon Gnashers, Snowfall, Gust, Inspiration, Fertility, Shiny Gift, Create Water, proclamations |
| 4 | a temple and 15 believers | Revelation, Sanctuary, Vision, Bring Forth, Fast-Forward Day, Hasten Season |
| 5 | average faith ≥ 75 | Resurrect |

Losing believers re-locks the top tiers (cooldowns are kept). The top bar shows progress toward the next tier (§18.2). Unlocks emit `power_unlocked` with a celebratory toast.

### 17.10 Divine deeds (achievements)

Stored in a local browser profile (not in the sim): First Miracle, Gentle Giant (set down 50 goblins without harm), Answered 10/50 Prayers, Converted a Skeptic, Feast in Your Name, The Prophet (Revelation), Five Generations, Village of 50, A Book About You (a goblin wrote a book that mentions the god — LLM mode), Wrath of the Sky (alignment −100), Saint of Apples (alignment +100), Lazarus (Resurrect). Shown in the Codex (§18.7) with low-poly badge icons.

---

## 18. User Interface

### 18.1 Principles

1. **Cozy and tactile.** Rounded panels, warm parchment and wood tones, soft shadows, chunky icons. The UI should feel like a toy chest beside a diorama.
2. **The world stays visible.** Panels are collapsible, translucent at rest (90% opacity), and never cover the center of the screen.
3. **Everything is reachable two ways:** a visible button and a keyboard shortcut (§18.11).
4. **Feedback for every action:** hover state, click sound hook, cost preview, success FX, or a clear rejection reason.
5. **Plain DOM + CSS, no framework.** Small component modules with a shared tiny store (§18.13).
6. **Bilingual UI:** English and Deutsch, every string through `t(key)` from `ui/i18n.ts`; the language setting also drives LLM prompts (§19.2).

**Visual style.** CSS variables in `ui/theme.css`: parchment `#F3E9D2`, bark `#6B4F3A`, moss `#6E8B3D`, apple `#C8452D`, sky `#7FB3D5`, favor gold `#E8B64C`, wrath violet `#7A4FA0`, ink `#2E2A24`. Dark-ink text on parchment panels, bark-colored panel frames with 2 px inner highlight. Fonts (bundled via npm `@fontsource/fredoka` for UI and `@fontsource/patrick-hand` for diaries, books and goblin speech). Icons: a single inline SVG sprite sheet (`ui/icons.svg`) of simple, chunky, two-tone glyphs drawn for this project (apple, hand, cloud, bolt, sparkle, mouth, scroll, egg, skull, shrine, etc.).

### 18.2 Main screen layout

```
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│ [Menu] Mossbottom · Spring, day 3 · 14:20 · Rain │ Favor ▓▓▓▓▓░░ 84/160 · Tier 2 → 3 (7/10) │
│        Pop 23 (4 young)  Food 9 days  Faith 61    │ [II] [>] [>>] [>>>] [>>>>]   Alerts (3)  │  ← top bar
├──────┬────────────────────────────────────────────────────────────────────┬──────────────┤
│ Hand │                                                                    │  Inspector / │
│ Gift │                                                                    │  context     │
│ Natr │                                                                    │  panel       │
│ Terr │                    3D world + god hand cursor                       │  (320 px,    │
│ Wrth │                                                                    │  collapsible)│
│ Mirc │                                                                    │              │
│ Voic │                                                                    │              │
│ Sbox │                                                                    │              │
├──────┴───────────────┬──────────────────────────────────────┬─────────────┴──────────────┤
│ Feed | Prayers (2)   │  Context tray: Gift Tray items or     │  Minimap + lens selector   │
│ | Voice              │  power options / brush radius / cost  │                            │
└──────────────────────┴──────────────────────────────────────┴────────────────────────────┘
```

- **Top bar:** menu button; village name (click → Village panel); calendar, clock, weather icon (hover → forecast for the next 6 h); population (hover → by life stage); food reserve in days; average faith; favor meter with tier progress (Divine mode) or "∞ Sandbox" badge; speed controls; alerts bell with count (click → feed filtered to critical).
- **Left god toolbar** (56 px wide, icons + tooltips with shortcut): Hand (H), Gifts (G), Nature (N), Terraform (T), Wrath (W, hidden in Gentle mode), Miracles (M), Voice (V), Sandbox (B, Sandbox mode only). Clicking a category opens a **flyout** of its powers as cards: icon, name, cost, cooldown ring, lock state with the unlock requirement ("Tier 3: 10 believers"). Selecting a power arms it (§18.4).
- **Right context panel:** the Inspector when something is selected; otherwise a compact "Village at a glance" (chief, shaman, god name, alignment dial, top 3 current needs of the village, current festival).
- **Bottom-left tabs:** Feed (event notifications, §18.9), Prayers (§18.7), Voice (conversation log, §18.7).
- **Bottom-center context tray:** shows the Gift Tray when the Gift category is open; otherwise the armed power's options (radius slider, variant dropdown such as disease type or plant kind, cost preview, "cast" hint); otherwise hidden.
- **Bottom-right minimap** (§18.10) with lens buttons.
- Minimum supported viewport: 1280 × 720. Below 1440 px width the right panel overlays the world instead of shrinking it.

### 18.3 Screens & menus

- **Title screen:** live low-poly island in the background — an actual sim running a fixed seed in Observer mode with a slowly orbiting camera. Logo "NIBBLETS" in chunky letters with a goblin peeking over the "N". Buttons: Continue (latest save), New World, Load, Settings, Codex, Watch Replay.
- **New World wizard** (3 steps with live previews):
  1. *World:* seed (text + dice), size (Small 96 / Medium 128 / Large 160), terrain preset (Island, Valley, Archipelago, Riverlands — worldgen parameter sets in `worldgen.ts`), live top-down minimap preview that regenerates on change.
  2. *Founders:* clan archetype (§4.3), founder count (6–16), a row of rotating 3D portraits of the actual founders with names; "Reroll founders" button; click a portrait to see its genome summary.
  3. *Rules:* mode (Sandbox / Divine / Observer), difficulty (Cozy / Normal / Harsh), Gentle mode toggle, LLM mode toggle with provider status indicator and a "Test connection" button, autopause preferences.
- **Pause menu** (Esc when nothing is selected or armed): Resume, Save, Load, Settings, Help, Exit to title.
- **Save/Load:** 3 autosave slots + 10 manual slots, each with thumbnail (canvas snapshot), village name, day/year, population, mode; export/import `.json`.
- **Settings tabs:**
  - *Graphics:* shadows (off/low/high), render scale (50–100%), max FPS, goblin outlines, particle density, ambient occlusion off/on (cheap SSAO pass optional), fog.
  - *Gameplay:* autopause on (death, raid, fire, birth, prayer, disaster — each toggle), confirm lethal powers, Gentle mode, cooldowns in Sandbox, edge panning, camera inversion, follow-cam smoothness, tooltip delay.
  - *Controls:* full key rebinding list with conflict detection; reset to defaults.
  - *LLM:* §19.2 settings.
  - *Accessibility:* UI scale (80–150%), reduced motion (no camera shake, fewer particles), high-contrast panels, colorblind-safe UI colors (goblin colors stay genetic), font size for journals.
  - *Language:* English / Deutsch.
- **Help:** a short illustrated controls sheet plus "First steps" tips (dismissable contextual tips appear during the first session: "Drag an apple from the Gift Tray onto a hungry goblin").

### 18.4 Input model & tools

`ui/input.ts` is the single input router. It forwards pointer and keyboard events to the **active tool**; tools turn gestures into commands. Raycasting uses `render/picking.ts` (terrain hit point + entity hit).

| Input | Default behavior |
|---|---|
| LMB | active tool action (Hand: select/grab/pet/box-select; power: cast; brush: paint; tray drag: drop) |
| RMB drag | orbit camera |
| MMB drag / WASD / arrows / screen edge | pan |
| Wheel | zoom (while holding something: change hold height) |
| Shift + wheel | power radius / brush size |
| Q / E | rotate camera |
| Esc | cancel armed power → deselect → open pause menu (in that order) |
| Alt + LMB | flick (Hand tool) |
| Double-click | poke goblin / fly camera to entity elsewhere |
| Ctrl + click | add to selection |

**Tools** (`ui/tools/`): `handTool`, `boxSelectTool`, `trayDragTool`, `castTool` (point/area/goblin/pair/grave targets), `paintTool` (brush powers), `directionTool` (Gust: drag a line), `voiceTool`, `possessTool`.

**Casting UX:**
1. Arm a power (toolbar flyout, hotkey, or inspector quick action).
2. The hand glows in the category color (gift gold, nature sky blue, terraform earth brown, wrath violet, miracle white); a radius ring is projected on the terrain (decal mesh) with the cost and affected count ("Apple Shower · 25 favor · 3 goblins, 2 bushes").
3. Entities that will be affected get an outline in the category color; lethal powers show red skull markers on goblins that would die.
4. Click to cast. If "confirm lethal" is on and a goblin would die, a small inline confirm appears at the cursor (Enter/click to confirm).
5. The power stays armed for repeated casts until Esc or RMB click without drag.
6. Cooldown rings appear on the toolbar card; unaffordable powers are greyed with the favor shortfall shown.

**Gift Tray drag:** drag starts from a tray item; a ghost of the item follows the hand with a shadow; a quantity stepper (1/5/10 via scroll while dragging) and the cost are shown; release over terrain spawns the drop. Dropping onto a goblin puts the item at its feet with a little bonk (no damage) — the goblin always notices it.

### 18.5 Gift Tray

Categories as tabs: **Food** (apple, berry, mushroom, fish, apple mash, stew), **Materials** (wood, stick, stone, flint, fiber, clay), **Tools** (spear, stone axe, basket, fishing rod — tier 2+ in Divine), **Treasures** (trinkets by rarity, flower crown), **Life** (seeds/cores, egg — Sandbox; saplings). Each slot shows icon, name, cost, and the hotkey 1–9 for the current tab. Recently used items are pinned at the left.

### 18.6 Inspector

Opens for any selected entity; header with name, icon/portrait, follow button, close.

**Goblin inspector**
- Header: rotating 3D portrait (offscreen render, refreshed on life-stage change), name + epithet, life stage + age in seasons, role badges (chief, shaman, prophet), family link (opens family tree centered on it).
- **Quick action ring:** when a goblin is selected, a radial ring of 6–8 buttons appears around it in screen space: Speak/Sign, Bless, Heal, Pick up, Follow, Gift (opens tray targeting it), Smite (Lightning; hidden in Gentle), Possess (Sandbox). Each shows cost on hover.
- Tabs:
  - *Status:* needs bars with icons and trend arrows, mood value + emotion + top 3 mood modifiers, health (hp, injuries, disease), current action in a sentence ("Carrying 2 wood to the hut site by Sad Pond"), goal stack, active divine wishes with timers.
  - *Mind:* personality radar, acquired traits with icons and descriptions, GodView (faith/love/fear bars, angry-at-god flag, answered/ignored prayers), beliefs it holds.
  - *Body:* genome view (per locus: allele a, allele b, expressed value, dominance note), phenotype preview, scars, size growth curve chart.
  - *Social:* relationships list (portrait, name, bond icon, opinion bar), family (parents, mate, children).
  - *Skills & knowledge:* skill bars with levels; known recipes (highlight those it alone knows — "Only knower!").
  - *Inventory:* inventory and equipment slots; home and owned trinkets.
  - *Story:* deeds counters, recent memorable events (from the event log), diary entries and god conversations (LLM mode).
- **Other inspectors:** plant (stage, growth bar with ETA, hydration, fertility, fruit, blight, planted by), building (progress, hp, owner, occupants, storage grid, displayed trinkets, books on shelf), item pile, rock (stone left), egg (parents, genome preview of the unhatched child — fun reveal, incubation progress, warmth), grave (name, life span, cause, epithet, eulogy, grave goods, "Resurrect" if eligible), enemy (type, hp, intent), named place (name, why it was named, events that happened there), weather cell, shrine/temple (offerings, recent prayers).

### 18.7 Panels

Panels open as draggable, resizable windows (positions remembered in localStorage) or docked into the right side; several can be open at once.

- **Village panel (`Y`):** name, god name, chief and shaman with portraits, policies (from chief personality), population by stage with sparkline, food reserve, stockpiles, known recipes with knower counts (red when 1), beliefs/superstitions list, festivals calendar, alignment dial, clan relations (P10).
- **Prayers panel (`P`):** cards sorted by time left: portrait, name, prayer icon + sentence ("Pipnok prays for rain — the saplings are thirsty"), remaining-time bar, buttons *Go there* (fly camera), *Answer* (arms the matching power pre-targeted at the goblin, e.g. Rain centered on it), *Ignore*. Answered prayers flash gold and move to a "Recently answered" list. Badge count on the tab.
- **Voice panel (`V`):** addressee chip (selected goblin(s) or "All Nibblets"), chat history with portraits and the god's own lines in gold, text input with character counter and cost, Sign wheel button, typing indicator "the heavens rumble…", and for each god line a small chip showing how it was understood ("understood: build hut · stern") — transparency for the player.
- **Family tree (`K`):** pan/zoom canvas, nodes are portrait swatches in true genetic colors with names, dead goblins greyed with a small skull, lines to parents; filter by trait (e.g. highlight all tusk carriers — carriers, not just expressers, computed from genomes); click to select/fly to.
- **Journals (`J`):** book-style viewer (§19.7) — diaries, books, eulogies, chronicle, god conversations.
- **Stats (`O`):** line charts — population by stage, food produced/eaten/stored, faith & favor, alignment, deaths by cause, recipes known, average hue over time and a **hue histogram** (population color distribution as a colored strip), size distribution, genetic diversity.
- **Timeline (`U`):** a horizontal, scrollable strip of days with event markers by category (births, deaths, buildings, discoveries, raids, disasters, festivals, divine acts). Hover → summary; click → camera flies to where it happened and the event details open. (This is history browsing, not time rewind.)
- **Codex (`X`):** Recipes (known, lost — shown torn; undiscovered — silhouettes with hints), Creatures (enemies and wildlife seen), Beliefs, Places, Genetics (every allele observed in the population with frequency, a hue wheel of all living goblins), Divine deeds (§17.10).
- **Debug (`` ` ``):** FPS, tick time per pipeline stage, entity counts, AI score table for the selected goblin, paths, spatial hash cells, command log tail, determinism hash of the current tick.

### 18.8 Map lenses

Toggle from the minimap or `L` to cycle; each lens tints terrain and/or entities:

| Lens | Shows |
|---|---|
| Default | normal view |
| Needs | goblins colored by their most urgent need |
| Faith | goblins colored by faith (grey → gold), believers ringed |
| Mood | red ↔ green |
| Temperature | felt-temperature heat map |
| Fertility & moisture | soil map for gardening |
| Danger | recent enemy sightings, attack spots, fire risk |
| Social | lines between goblins: friends green, mates pink, rivals red (selected goblin or all) |
| Ownership | huts and their owners, stockpile zones |
| Genetics | goblins shown in pure skin hue with size exaggerated; pick a locus to color by allele |
| Paths | wear map and desire paths |

### 18.9 Notifications & alerts

- **Tiers:** *Info* (gray, 4 s, off by default for routine events), *Notable* (gold, 8 s: births, buildings completed, discoveries, festivals, conversions, prayers), *Critical* (red, sticky until clicked: deaths, raids, fires, disease outbreaks, disasters, recipe lost, egg lost).
- Each toast has an icon, a short sentence with names ("Krikwick speared a Gnasher at Sad Pond!"), and a jump button; clicking flies the camera there and selects the main entity.
- Duplicates within 10 s merge ("3 Gnashers spotted").
- Autopause rules from settings (default: autopause on raids and disasters only).
- Feed tab keeps the last 200 notifications with filter chips per category.

### 18.10 Minimap

Top-down canvas render of the terrain (rebuilt on terrain change) with dots for goblins (in their skin color), red dots for enemies, building icons, the camera frustum trapezoid, prayer markers (pulsing gold) and named places (on hover). Click to move the camera; drag to pan; lens buttons under it.

### 18.11 Keyboard shortcuts (defaults; all rebindable)

| Key | Action | Key | Action |
|---|---|---|---|
| Space | pause/resume | 1–4 | speed 1× / 4× / 16× / 64× |
| H | Hand tool | G | Gifts flyout + tray |
| N | Nature flyout | T | Terraform flyout |
| W | Wrath flyout | M | Miracles flyout |
| V | Voice panel / Sign wheel | B | Sandbox drawer |
| F | follow selected | C | Director camera (auto-follows the most interesting current event) |
| Y | Village panel | P | Prayers panel |
| K | Family tree | J | Journals |
| O | Stats | U | Timeline |
| X | Codex | L | cycle lens |
| Tab | cycle through goblins | Shift+Tab | cycle through goblins with active prayers |
| F5 / F9 | quick save / quick load | F12 | photo mode |
| Esc | cancel / deselect / pause menu | ` | debug overlay |
| Enter | focus Voice input (when a goblin is selected) | Del | remove (Sandbox only) |

(In the gift tray, number keys select tray slots *only while the tray is focused*; otherwise 1–4 are speeds.)

### 18.12 Camera

- Orbit camera with smooth damping; zoom 6–90 units; pitch clamp 25°–80°; terrain-collision so it never clips into hills.
- **Fly-to:** eased 0.8 s move used by all "go there" buttons.
- **Follow:** soft follow with look-ahead in the walking direction; breaks on manual pan.
- **Director camera (C):** every 8–15 s, cuts to the highest-interestingness ongoing situation (combat, birth, festival, prayer, divine act, conversation) using the same scoring as the LLM compactor; shows a small caption ("Pipnok and Fizzle are arguing about a crystal"). Excellent for passive watching and recording.
- **Photo mode (F12):** hides UI, free camera, time freeze, tilt-shift and vignette toggles, depth-of-field-like blur via a simple post pass, PNG export.

### 18.13 UI architecture

```
src/ui/
├── store.ts          # UIState: selection[], hoveredId, activeTool, armedPower, brushRadius,
│                     #   openPanels, lens, language, settings; tiny observable (subscribe/set)
├── input.ts          # input router → active tool
├── i18n.ts           # t(key, params); en + de tables
├── theme.css  icons.svg  dom.ts (el() helper)
├── tools/            # handTool, boxSelectTool, trayDragTool, castTool, paintTool, directionTool, voiceTool, possessTool
├── components/
│   ├── topBar.ts  godToolbar.ts  powerFlyout.ts  contextTray.ts  giftTray.ts
│   ├── inspector/ (goblinInspector.ts, plantInspector.ts, buildingInspector.ts, graveInspector.ts, …)
│   ├── quickRing.ts  signWheel.ts  tooltip.ts  toasts.ts  feed.ts  minimap.ts
│   ├── villagePanel.ts  prayersPanel.ts  voicePanel.ts  familyTree.ts  journalViewer.ts
│   ├── statsPanel.ts  timeline.ts  codex.ts  debugOverlay.ts  window.ts (draggable panel frame)
├── screens/          # titleScreen.ts, newWorldWizard.ts, pauseMenu.ts, saveLoad.ts, settings.ts, help.ts
└── charts.ts         # tiny canvas line/histogram helper (no chart library)
```

- Component contract: `{ mount(parent: HTMLElement): void; update(view: SimView, ui: UIState): void; destroy(): void }`. `SimView` is a read-only facade over `World` (getters only).
- Panels update at 10 Hz (after each sim tick batch), the hand, tooltips and the quick ring at frame rate. Components diff their own DOM (update text/attributes only when values change) — no full re-render.
- All world-changing actions go through `commands.push()`. UI never mutates sim state.
- UI-only preferences (panel positions, settings, keybindings, language, divine deeds) live in localStorage under `nibblets.ui.*`, never in saves.

### 18.14 Audio hooks (stretch-ready)

Even though sound is a stretch goal (§24.2), every UI interaction and FX calls `audio.play(cueId)` on a no-op `audio.ts` facade from P1, so adding sound later is a drop-in. Cue ids are listed in `audio.ts` (hand_grab, hand_drop, splash, thunder, apple_bonk, sign_rumble, voice_boom, prayer_ding, toast_notable, toast_critical, ui_click, power_denied…).

---

## 19. LLM Mode: Voices, Journals, Chronicle

### 19.1 Principles

1. **Annotation only.** Generated text is stored in `world.llm` and displayed; nothing in the sim reads it. The one exception is books (§15.2), whose *recipe contents* are sim data — the LLM only writes their flavor text. The second exception is the god's voice interpreter (§17.7.2): it translates the player's words into a structured command that is validated and logged — the player decides, the LLM only translates.
2. **Async and non-blocking.** The sim never awaits. Jobs are queued; results attach when they arrive. A late journal simply fills in.
3. **Budgeted.** Hard per-day caps; jobs ranked by interestingness; overflow is dropped silently.
4. **Determinism-safe.** `world.llm` is excluded from the state hash. LLM on/off produces identical simulations.
5. **Works offline.** `MockProvider` produces template-based text so every UI surface is testable without a network or key.

### 19.2 Providers

```ts
interface LLMRequest { system: string; prompt: string; maxTokens: number; temperature?: number }
interface LLMProvider { name: string; complete(req: LLMRequest, signal?: AbortSignal): Promise<string> }
```

- `MockProvider` — deterministic templates filled from the compact event summary (default when no key is set).
- `ProxyProvider` — POSTs `{system, prompt, maxTokens}` to `http://localhost:8787/complete`. **Recommended**: keeps the API key out of browser code.
- `OllamaProvider` — POST to `http://localhost:11434/api/generate` (free, local models).
- `AnthropicDirectProvider` — direct browser call to the Anthropic Messages API (requires the browser-access opt-in header); behind a "developer only, exposes key" warning in settings.

`tools/llm-proxy.ts`: ~40 lines, Node `http` server on port 8787, reads `ANTHROPIC_API_KEY` from env, forwards to the Messages API with the configured model (env `NIBBLETS_MODEL`, default a small fast model), sets CORS for `localhost:5173`, returns `{ text }`. Run with `ANTHROPIC_API_KEY=... npm run llm-proxy`.

Settings panel (persisted in `localStorage`, never in saves): provider, model, endpoint, per-day budgets, temperature, language (English / Deutsch — the prompts include "write in {language}"), kill switch.

### 19.3 Event compaction

`eventCompactor.ts` turns raw events into ≤ 150-token summaries per goblin per day:

1. Collect events where the goblin is an actor, a target, or a witness (within vision radius at event time — the compactor uses the positions recorded in events).
2. Score: death of a bonded goblin 12, own child hatched 10, combat 9, recipe discovered 8, festival 7, theft involving them 7, mood break 7, building completed 5, gift 5, prank 5, trinket rare+ 6, first-time action +3, routine work 1. Same-type events are merged ("harvested apples ×4").
3. Keep the top 8, chronologically, as terse lines with **place names** and **goblin names**: `dusk — Gnasher at Sad Pond; Krikwick speared it; I hid in my hut`.
4. Context header: name, epithet, life stage, age in seasons, skin color in words (from hue → "mossy green", "rust orange"; size → "small", "big"), personality descriptor, acquired traits, top 3 relationships with labels, current emotion, lowest need, season/weather, village chief.

### 19.4 Products

| Product | Trigger | Default budget | Output |
|---|---|---|---|
| **Diary entry** | end of day, top-K goblins by day interestingness | K = 3/day | 40–90 words, first person, in-character voice |
| **Dialogue** | an ongoing `Chat` between goblins where both have an interesting recent event or strong opinion | 4/day | 2–6 short lines, rendered as typewriter speech bubbles in sync with the chat animation |
| **Barks** | combat win, discovery, hatchling born, death of friend | 6/day | one line ≤ 12 words |
| **Book flavor** | `WriteBook` completes | 2/day | title + ≤ 120-word page in the author's voice about the recipes inside |
| **Eulogy** | funeral | 1 per funeral | elder's 2–4 sentences about the deceased (uses deeds, epithet, family) |
| **Chronicle** | end of each season | 1/season | a 120–200 word saga paragraph by the eldest goblin (the "Chronicler"), built from the season's diaries + top village events + stats deltas |
| **Village name** | first time the village reaches 3 huts | once | invents the village's name (stored, displayed in HUD) |
| **God name** | three goblins have witnessed divine acts | once | the village's name for its god (template fallback) |
| **Voice interpreter** | the player speaks (§17.7.2) | top priority, own 4k tokens/day sub-cap | strict JSON intent |
| **God replies** | after each `divine_speech` | same sub-cap | 1–3 in-character replies; memory-grounded answers to questions |

### 19.5 Prompt templates (`prompts.ts`, all pure functions, snapshot-tested)

System prompt (shared):
```
You write short in-character text for a cozy simulation game about small goblins called Nibblets.
Nibblets are earnest, simple-minded, a bit greedy for shiny things, brave in groups, and love apples.
Speak in plain, vivid language with goblin flavor (simple words, occasional made-up goblin
expressions like "grub-gob!" or "by the big apple"). Never mention being an AI or a game.
Use only the names, places and events provided; do not invent new characters or events.
Write in {language}. No markdown, no lists, no quotation marks around the whole text.
```

Diary prompt:
```
Write {name}'s diary entry for today, in first person, 40-90 words.
About {name}: {stage}, {age} seasons old, {sizeWord} and {colorWord}. Personality: {descriptor}.
Traits: {traits}. Feeling: {emotion}. Biggest worry: {lowestNeed}.
Relationships: {rel1}; {rel2}; {rel3}.
Season: {season}, weather: {weather}. Chief: {chief}.
Today:
{eventLines}
```

Dialogue prompt returns lines formatted `NAME: text`; the parser drops lines not starting with one of the two names, clamps to 6 lines and 80 chars each.

### 19.6 Scheduler

- Priority queue keyed by interestingness; concurrency 2; rate limit 10 requests/min; per-day token budget (default 12k); per-request timeout 20 s with one retry.
- Dedup: one diary per (goblin, day); dialogue cooldown per pair 1/day; bark cooldown per goblin 1/hour.
- Results sanitized (strip markdown, trim, clamp length, remove any name not in the allowed set → fallback to mock text).
- If the provider errors 3 times in a row, auto-pause LLM mode for 10 in-game minutes and show a small toast.

### 19.7 UI

- Speech bubbles: rounded low-poly quads with HTML-text overlay (CSS2DRenderer), typewriter reveal, 1.5 s per line.
- Journal viewer: book-style panel, left page = goblin portrait (rendered goblin mesh snapshot) + bio, right page = diary entries by day; ink accent in the goblin's skin color. Tabs: Diaries, Books, Eulogies, Chronicle.
- Hut inspector shows a "shelf" of the occupants' diaries and stored books; graves show their eulogy.

---

## 20. Testing & Balance

### 20.1 Test layout

`src/**/__tests__/*.test.ts` with Vitest, Node environment, no DOM. Helper `makeWorld({ seed, goblins?, size?, preset? })` creates small test worlds (e.g., 24×24) with deterministic placement helpers (`placePlant(world, kind, stage, pos)`, `spawnGoblin(world, {genome?, age?, pos})`), and `runTicks(world, n)`.

### 20.2 Permanent tests (must stay green from the phase they're introduced)

| Test | Phase |
|---|---|
| Determinism: same seed ×2 → same hash at tick 5,000 | 1 |
| Save/load mid-run → same hash as uninterrupted | 1 |
| Architecture: no file in `src/sim` imports `three`/`render`/`ui`/`llm` (static scan of imports) | 1 |
| Genetics: hue circular averaging; recessive expression; meiosis allele origin; mutation clamping | 1 |
| Phenotype: life-stage scale curve monotonic hatchling → adult | 1 |
| Hungry goblin next to a fruiting bush eats within 1 in-game hour | 1 |
| Plant lifecycle stage timing at fixed hydration/fertility ±10% | 2 |
| Eating an apple yields a core; planted core becomes a mature bush in expected days | 2 |
| Stale memory → confusion event → memory removed | 2 |
| Rain → unsheltered goblin with a home enters it within N ticks | 3 |
| Goblin with materials and no home builds and claims a hut within 2 days | 3 |
| Gnasher near campfire retreats; armed brave goblin engages; unarmed timid goblin flees | 4 |
| Recipe consumption exact; durability decrements | 4 |
| Inheritance: 1,000 simulated crosses of tusk-carrier × tusk-carrier → ≈ 25% tusked (±4%) | 5 |
| Child hue lies on the shorter arc between parents' hues (before mutation) | 5 |
| Egg without warmth is lost; incubated egg hatches; hatchling grows to adult scale by day 16 | 5 |
| Last knower dies → `recipe_lost`; book read → `recipe_learned` | 5 / 9 |
| Theft with witness → opinion drop and reputation drop | 8 |
| Disease spreads only via its transmission mode | 6 |
| Fire spreads to dry adjacent bush, not across water; rain extinguishes | 6 |
| LLM prompts snapshot; sanitizer removes unknown names; mock provider fills all products | 9 |
| LLM on vs off → identical sim hash | 9 |
| Replay: seed + command log (≥ 50 god commands incl. grabs, drops, throws, gifts) → same hash as the original run | 1 |
| Fall damage follows the formula; set-down from ≤ 1.5 and water landings deal none | 1 |
| Gift drop: 5 god-dropped apples at a hungry goblin's feet → it eats within 1 in-game hour | 1 |
| Invalid commands rejected with a reason (missing entity, locked power, no favor, Gentle mode) | 1 / 4 / 8 |
| Terraform: lowering below water level creates water, blocks walking, invalidates cached paths | 2 |
| Local rain cell hydrates only plants inside its radius | 3 |
| Witness rule: only goblins within vision (or targets) receive reaction deltas | 4 |
| Breeding tool: egg genome alleles come only from the two chosen parents | 5 |
| Resurrect accepted ≤ 2 days after death, rejected after | 6 |
| Prayer auto-answer detection for every prayer kind | 8 |
| Obedience formula and defiance rate (statistical, fixed seed) | 8 |
| Interpreter validator and keyword fallback (EN + DE phrase table) | 9 |
| Voice replay: loading a save replays `divine_speech` without calling any provider (mock provider throws if called) | 9 |

### 20.3 Headless "visual" proxies

For acceptance criteria phrased visually, assert on state/events instead (e.g., "orchard emerges" → count of goblin-planted mature bushes within 15 tiles of village center ≥ 8 by day 20).

### 20.4 Balance runner (`npm run balance`)

`tools/balance.ts` runs **5 seeds × configurable days** (default 96 = 3 years) at max speed and prints a table per seed and aggregated: population over time (min/avg/max), births, deaths by cause, food produced/consumed/stored, starvation days, huts/buildings built, enemies killed, recipes known (count over time), average hue drift of the population (start vs end, in degrees), genetic diversity (mean heterozygosity), festivals held, thefts, chiefs. Flags `FAIL` if: extinction in any seed, population > 3× soft cap, starvation deaths > 20% of all deaths, zero births in year 2+, or tick time > 2 ms average. Writes `balance-report.md`. **Every balance change must be validated with this runner; record findings in `DECISIONS.md`.** The runner also supports `--god <profile>`: `absent` (default, Observer), `benevolent` (drops food when village food < 3 days, heals the sick, answers food/rain/healing prayers), `wrathful` (lightning on a random goblin weekly, curses thieves, answers revenge prayers), `chaotic` (a random power every in-game day). Profiles issue normal commands, so they also exercise the command pipeline.

---

## 21. Configuration (`src/sim/config.ts`)

Every tunable lives here. Starting values (the agent tunes these against §20.4 and logs changes):

```ts
export const CFG = {
  tickHz: 10,
  time: { dayTicks: 3600, daysPerSeason: 8, moonCycleDays: 8 },
  world: {
    w: 128, h: 128, waterLevel: 0.30, sandBand: 0.03, rockLevel: 0.80, forestNoiseThreshold: 0.6,
    marshMoisture: 0.75, appleBushes: 70, berryBushes: 40, trees: 140, rocks: 90, grassPatches: 160,
    flowers: 120, villageRadius: 14,
  },
  goblin: {
    founders: 10, softCap: 40, baseLifespanDays: 112,
    stageDays: { egg: 2, hatchling: 4, youngling: 16, adultUntil: 80 },
    speed: 2.2, visionDay: 12, visionNight: 7, inventorySlots: 4, baseHp: 100,
    decayPerDay: { hunger: 60, thirst: 90, energy: 70, social: 25, fun: 30, curiosity: 25, comfort: 15, purpose: 10 },
    decisionIntervalTicks: 20, hysteresis: 1.15,
  },
  genetics: { quantMutationChance: 0.06, quantMutationSigma: 0.08, hueSigma: 18, discreteMutationChance: 0.01, albinoFounderFreq: 0.03 },
  food: { apple: 40, apple_core: 10, apple_mash: 55, dried_apple: 30, berry: 15, mushroom: 15, glowcap: 10, fish: 25, cooked_fish: 40, stew: 60 },
  plants: {
    stageDays: { seed: 0.5, sprout: 1, sapling: 1.5, young: 2 }, matureUntilDays: 64, oldUntilDays: 80,
    appleRegrowDays: 0.5, maxApples: 5, wood: { young: 1, mature: 3, old: 2, tree: 8 },
    seasonMul: { spring: 1.3, summer: 1.0, autumn: 0.6, winter: 0 }, stumpRegrowChance: 0.3,
  },
  weather: { transitionTicks: 900, rainWarmthDrainPerHour: 6, lightningPerStormHour: 1, stormBuildingDmgPerHour: 4 },
  temperature: { seasonBase: { spring: 12, summer: 24, autumn: 10, winter: -4 }, daySwing: 6, comfortMin: 10, comfortMax: 24 },
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
  },
} as const;
```

---

## 22. Phase Plan & Steps

Each phase: goal → numbered steps (each = one commit) → acceptance checklist. Implement in order. Systems marked *(stub)* get data model + minimal no-op update so later phases don't refactor.

### Phase 1 — Foundations: world, goblins, genetics, apples

**Goal:** a low-poly world with visibly diverse goblins (genome-driven colors and shapes) who wander, get hungry and thirsty, eat apples from bushes, drink, and sleep. The player can already play god with the hand and the Gift Tray, inside the full UI shell. All architecture in place.

1. **P1.1** Scaffold: Vite vanilla-ts, strict tsconfig, ESLint flat config with the architecture rules (§2.3), Prettier, Vitest, scripts (§2.2), `git init`, `PROGRESS.md`, `DECISIONS.md`.
2. **P1.2** `shared/`: `Vec2`/math, `ID` allocator, mulberry32 RNG with `fork(label)`, `range/pick/chance/gaussian`, typed `EventBus`.
3. **P1.3** `sim/config.ts` (full §21), `time.ts` (clock, phases, seasons, moon).
4. **P1.4** `worldgen.ts` + `grid.ts`: seeded heightfield (2 octaves simplex + island falloff), biomes (water, sand, meadow, forest, rock, marsh), Poisson-disc scatter of apple bushes (mature, with apples), rocks (decor only), trees (decor only). `spatialHash.ts`.
5. **P1.5** `pathfinding.ts` (A* on tiles, 8-neighbor, wear-ready cost function, path cache) + `steering.ts` (seek waypoints, simple separation between goblins).
6. **P1.6** Genetics: `genome.ts` (loci, meiosis, mutation), `phenotype.ts` (expression, life stage scale/proportions), `founders.ts` (clans from §4.3), `names.ts`. Unit tests (§20.2 genetics rows).
7. **P1.7** Goblin entity + factory; needs hunger/thirst/energy/curiosity active; others present but static *(stub)*; mood *(stub: value only)*; personality from genome.
8. **P1.8** Utility AI framework + considerations + actions: Idle, Wander, HarvestFruit, Eat, Drink, SleepGround, PickUp, Drop. Plants v1: apple regrowth on mature bushes only.
9. **P1.9** `world.ts` tick pipeline (§6 with unimplemented stages as no-ops), `commands.ts`, `save.ts` (versioned JSON, migrations map), `stats.ts` *(stub)*. Determinism + save/load + architecture tests.
10. **P1.10** Renderer: scene, hemisphere + sun light following the clock, fog, orbit camera with WASD pan & zoom, terrain mesh (flat-shaded, vertex jitter, biome vertex colors), water plane with gentle vertex wave, instanced bushes/apples/rocks/trees, interpolation.
11. **P1.11** `goblinMesh.ts` + `goblinView.ts`: procedural goblin from phenotype (§4.1, §4.5) with pattern vertex colors, eye glow at night, walk/idle/sleep/work animations, ear secondary motion, carried-item prop.
12. **P1.12** UI shell per §18: theme, icons sprite, `i18n.ts` (en + de), `store.ts`, `input.ts` router, top bar, god toolbar (only implemented categories shown), power flyout component, context tray, right inspector (goblin Status/Mind/Body/Inventory tabs with the data that exists; plant inspector), quick action ring, tooltips, toasts + feed, minimap, debug overlay, picking, `audio.ts` no-op facade.
13. **P1.13** Screens per §18.3: title screen with live island, New World wizard (World / Founders / Rules; modes Sandbox and Observer — Divine is added in P8.9), pause menu, save/load slots with thumbnails, settings (graphics, gameplay, controls, language), daily autosave, export/import JSON.
14. **P1.14** Balance runner skeleton (`tools/balance.ts`) with population/death/food metrics.
15. **P1.15** God hand v1 (§17.3): hand mesh and pose states, blob shadow, grab/hold/raise-lower/set down/drop/throw with `sim/god/airborne.ts`, pet, poke, flick, box select; Gift Tray (Food and Materials tabs) drag-to-spawn; `GodCommand` types, validation, `command_rejected`, `commandLog`; witness detection and the reaction table (faith/love/fear exist from now on; favor arrives in P8); `LookUp` and `Struggle` actions.
16. **P1.16** Replay: "Watch replay" from a save (seed + log, read-only UI); replay determinism test.

**Acceptance (P1)**
- [ ] `npm run dev` shows the world; 10 goblins with clearly different skin colors, patterns, ear/nose shapes and sizes.
- [ ] Goblin loop works end-to-end (test: hungry goblin eats within 1 hour; thirsty goblin drinks; at night goblins sleep).
- [ ] 60 fps with 10 goblins; tick < 1 ms.
- [ ] All P1 tests green; balance: 0 starvation deaths over 10 days, 5 seeds.
- [ ] God hand: a goblin can be picked up (dangles and struggles), set down gently without damage, or dropped from height with damage per formula; god-dropped apples are eaten by a hungry goblin (tests).
- [ ] Replay test green (≥ 50 god commands).
- [ ] UI shell: every P1 panel opens/closes by button and shortcut; switching English/Deutsch changes every visible string.

### Phase 2 — The apple chain, chopping & memory

1. **P2.1** Full plant lifecycle (§8.1) with hydration, fertility, season multipliers; stage meshes (seed mound, sprout, sapling, young, mature, old, stump).
2. **P2.2** Apple → core; `EatCore`, `PlantSeed` (site rules: fertile meadow, not adjacent to another plant, within 20 tiles of home/village), `WaterPlant` (visit water first, then splash; carries a "wet hands" status for 600 ticks).
3. **P2.3** `Chop` (multi-hit, wood + stick drops as ground items), `PickUp/Store/Take`, ground item piles rendered.
4. **P2.4** Memory system (§7.8) + senses; AI targets memories; `Explore` action (curiosity) reveals and remembers; confusion emote.
5. **P2.5** Berry bushes (wild, accidental seeding), flowers (decor + harvest stub), soil fertility depletion.
6. **P2.6** Emotes system (`?`, `!`, heart, Zzz, lightbulb, sweat, music note) as billboard sprites.
7. **P2.7** Terraform powers (§17.5.3: raise/lower/smooth, create water, fertile soil, plant forest, place rock) with `paintTool`, 16×16 terrain chunk rebuilds and path-cache invalidation; uproot & replant with the hand; Gift Tray Life tab (cores/seeds, saplings); lenses: fertility & moisture, paths.

**Acceptance (P2)**
- [ ] Headless: by day 20, ≥ 8 goblin-planted mature bushes near the village (5 seeds).
- [ ] Stale-memory test green; chopping yields wood; wood accumulates.
- [ ] Balance 20 days: 0 starvation deaths; total apple bush count stable or growing.
- [ ] Terraform and replant tests green; goblins drink from a god-made pond.

### Phase 3 — Shelter, weather, temperature, seasons

1. **P3.1** Weather state machine + temperature (§9.1–9.2); warmth need active; wet status.
2. **P3.2** Season visuals (palette blending) and gameplay multipliers; snow accumulation; winter dormancy (with a temporary config `winterFoodEase` that keeps berries producing until P5 brings preservation — remove in P5.6).
3. **P3.3** Building system: blueprint placement (`findSite`), material delivery, `Build` action, cooperative building, scaffold/complete meshes, ghost rendering.
4. **P3.4** Hut: `ClaimHome`, capacity, storage, `SleepHome` (2×), warmth bonus.
5. **P3.5** Planner goal stack (§7.4) with `GatherForGoal`.
6. **P3.6** `SeekShelter`, `WarmUp`; storm building damage + repair need flag; `Forage` mushrooms (brown/glowcap; redcap exists but unknown-danger arrives in P5 knowledge).
7. **P3.7** Weather FX: rain/snow particles, storm sky + lightning flash, fog density, wet terrain tint, hut window light at night.
8. **P3.8** Nature powers (§17.5.2) with local weather cells; full casting UX (§18.4: arm, radius ring decal, affected outlines, cost preview, cooldown rings, repeat casting); temperature lens; weather forecast tooltip in the top bar.

**Acceptance (P3)**
- [ ] Rain test green; build-a-hut test green.
- [ ] Balance 32 days (1 year): ≥ 80% of adults housed by end of autumn; < 2 weather deaths per seed.
- [ ] Local rain cell test green; Warm Sun dries wet goblins (test).

### Phase 4 — Stone, tools, fire, enemies, combat

1. **P4.1** Rocks harvestable (`Mine`, finite stone, flint chance); sticks; tool items with durability.
2. **P4.2** Crafting system (`Craft`, recipe table §11 for P4 items), quality tiers, `Equip` (hand slot rendered).
3. **P4.3** Campfire (fuel, `TendFire`, warmth radius, light), torch.
4. **P4.4** Enemies: Gnasher + spawn director (threat budget, moon), enemy AI (sneak, steal, attack, flee), meshes.
5. **P4.5** Safety need active; `Flee`, `Attack`, `Guard`, `DefendVillage`; combat resolve; injuries; scars on phenotype; death; graves *(stub: marker only)*.
6. **P4.6** Fences, stone hut upgrade, `RepairBuilding`; enemy pathing around fences; campfire repel.
7. **P4.7** Bramblebeast + Night Wisp; config flag `spawnReinforcements` (founder-like immigrants every 8 days if pop < 6) until P5.
8. **P4.8** Wrath powers available so far (§17.5.4: lightning, swarm, curse, summon Gnashers, meteor) with FX; lethal preview markers, "confirm lethal" setting, Gentle mode; thrown goblins/rocks damage enemies; `angryAtGod`; danger lens.

**Acceptance (P4)**
- [ ] Combat behavior test green; campfire repel test green.
- [ ] Balance 32 days with enemies: settlements survive (0–3 combat deaths/seed); control run with crafting disabled loses ≥ 30% of goblins.
- [ ] Witness-rule test green; lightning on a Gnasher damages it and raises witnesses' fear; Gentle mode rejects wrath commands.

### Phase 5 — Families, genetics in action, skills, knowledge, preservation

1. **P5.1** Relationships (§13.1), `Chat` with topics and icon bubbles, gossip memory sharing, `Comfort`, `Gift`.
2. **P5.2** Skills (forage, woodcraft, building, mining, crafting, combat, farming, cooking, teaching) with XP/levels and effects; specialization emerges.
3. **P5.3** Courtship → eggs → incubation → hatching (genome via meiosis), family tracking, kinship exclusion, assortative attraction.
4. **P5.4** Life stages fully active: continuous growth, younglings' `Play`/`Learn`, elders, natural death, orphan adoption; remove `spawnReinforcements`.
5. **P5.5** Knowledge system (§15.1): unknown recipes, discovery, teach, observe, village knowledge panel, cultural facts (redcap poison etc.).
6. **P5.6** Fiber chain (grass → fiber → basket, rope, mat, loincloth, leaf cape, flower crown), grinding stone, drying rack, storage pit; food spoilage; remove `winterFoodEase` — winter now bites.
7. **P5.7** Workbench, watchtower, gate. Acquired traits (§7.7) framework with first 5 traits.
8. **P5.8** UI: family tree panel with color swatches & phenotype mini-portraits, relationships list in inspector, skills bars, genome detail view (alleles a/b per locus, expressed value).
9. **P5.9** Gift powers (blessing, inspiration, fertility, shiny gift); Sandbox drawer: breeding tool, genome editor with live 3D preview, spawn anything, set needs; genetics lens; family-tree carrier highlighting; egg inspector with the unhatched child's genome preview.

**Acceptance (P5)**
- [ ] Inheritance statistics tests green; egg tests green; recipe lost test green; breeding-tool test green.
- [ ] Balance 96 days (3 years): no extinction in 5 seeds; ≥ 3 generations; average population hue drift reported; preserved-food villages survive winters while a "no preservation" control run shows winter starvation spikes.

### Phase 6 — Health, disease, disasters, death culture

1. **P6.1** Health model: injuries healing, `TendSick`, diseases (§14.3) with transmission modes and gene-based resistance; symptoms visuals (spots, shiver, sneeze).
2. **P6.2** Fire spread, `ExtinguishFire`, ash fertility; lightning.
3. **P6.3** Flood, drought, blight; shooting star.
4. **P6.4** Grief modifiers, `BuryDead`, graveyard, `Mourn`, grave inspector (name, epithet, lifespan, cause, grave goods).
5. **P6.5** Herbal remedy recipe; quarantine policy hook *(stub until P8 policies)*.
6. **P6.6** Powers: Healing Touch, Plague, Blight, Flood, Earthquake, Sanctuary, Vision, Bring Forth, Resurrect (grave inspector button with eligibility).

**Acceptance (P6)**
- [ ] Disease, fire and Resurrect tests green.
- [ ] Balance: disasters occur at configured rates; villages recover from each (population back to ≥ 70% of pre-disaster within one season in ≥ 4/5 seeds).

### Phase 7 — Settlement & advanced economy

1. **P7.1** Wildlife (hoppers, chirps, fish, glimmerflies); sling hunting; bone/feather drops.
2. **P7.2** Fishing (rod, spots, `Fish`), cooking at campfire; clay digging, kiln, bucket, pots.
3. **P7.3** Hearth + stew; longhouse; well; nursery.
4. **P7.4** Garden plots, compost heap, stone paths, bridges; desire paths (§10.4) rendering.
5. **P7.5** Stockpile zones, `HaulToStockpile`, village demand (§12.4); clothing set (fur cloak, war paint, bone necklace).
6. **P7.6** Stats panel: line charts (population, food, hue histogram over time, deaths by cause, recipes known), drawn with a tiny canvas helper (no chart library).

**Acceptance (P7)**
- [ ] Visible trails between homes and orchards by day 20 (headless: ≥ 30 tiles with wear > 0.5).
- [ ] Balance: food diversity — ≥ 3 food types consumed per year per seed; no regression vs P6 survival.

### Phase 8 — Personality, mood, mischief, leadership, festivals, beliefs

1. **P8.1** Full mood system with modifiers and emotions; emotion animations; mood breaks; inspiration.
2. **P8.2** Trinkets (§12.1), `HuntTrinket`, `Decorate`, trinket value, hut shelves rendering.
3. **P8.3** Pranks, theft with witnesses, `Apologize`, reputation, rivals/enemies, brawls (non-lethal).
4. **P8.4** Leadership: chief selection, policies, justice (return, apology, exile), headdress prop.
5. **P8.5** Festivals (§15.3) with venue and activities; music instruments, music circle, `PlayMusic`, `Dance`.
6. **P8.6** Shrine, totem, `Pray`; superstition system (§15.4) + village panel beliefs list.
7. **P8.7** Epithets and remaining acquired traits; personality life-drift.
8. **P8.8** Faith system (§17.4): faith dynamics and inheritance, gossip spread, skeptics and conversion, prayers with auto-answer detection and the Prayers panel, favor economy, alignment effects (incl. dependence), shaman role, offerings, temple, god naming (template), god superstitions, `Pray`/`MakeOffering`/`LeadPrayer`/`ShakeFist`.
9. **P8.9** Divine mode: tiers and unlocks (§17.9), favor meter and tier progress in the top bar, costs and cooldowns enforced; divine wishes with obedience and defiance (§17.6); Divine Signs wheel (§17.7.1) with Mock replies; Voice panel log; New World wizard offers Divine mode; balance runner god profiles.

**Acceptance (P8)**
- [ ] Theft test green; at least one festival, one chief change and one superstition per 3-year run in ≥ 4/5 seeds.
- [ ] Balance: no regression in survival; thefts and pranks occur but don't collapse social graph (avg opinion stays > 0).
- [ ] Prayer test: a starving goblin prays; god food dropped near it before expiry → `prayer_answered`, faith +15.
- [ ] Wish test: sign "build hut" to a high-faith goblin with wood available → it starts building within 1 in-game hour; defiance rate matches the formula (statistical test).
- [ ] Balance with god profiles: `benevolent` sustains a larger population with measurably lower average industry (dependence); `wrathful` yields higher faith and fear; `absent` lets faith decay to piety floors.

### Phase 9 — LLM mode & written culture

1. **P9.1** `llm/provider.ts` (Mock, Proxy, Ollama, AnthropicDirect), `tools/llm-proxy.ts`, settings panel.
2. **P9.2** `eventCompactor.ts` (with color/size words), place names system (§15.6) — place names are sim data and work without LLM.
3. **P9.3** `prompts.ts` + sanitizer + snapshot tests; `scheduler.ts` with budgets, dedup, backoff; `store.ts`.
4. **P9.4** Speech bubbles for dialogue and barks; diary generation; journal viewer.
5. **P9.5** Books: `WriteBook`, `ReadBook`, library shelves, book flavor text; eulogies at funerals; seasonal chronicle; village naming.
6. **P9.6** Language setting (English/Deutsch) passed into prompts; mock provider supports both.
7. **P9.7** Divine Voice (§17.7.2): interpreter prompt + validator, keyword fallback (EN/DE), free-text `divine_speech`, responder with memory-grounded answers to questions, conversation log with "understood as" chips, LLM god naming, god-voice token sub-cap.
8. **P9.8** The god in the stories: diary and chronicle prompts include divine acts, prayers and conversations; books may mention the god; divine deed "A Book About You".

**Acceptance (P9)**
- [ ] With MockProvider (offline) every product appears in the UI.
- [ ] LLM on/off hash test green; no frame hitch on response arrival (responses applied in a microtask, UI-only).
- [ ] Lost-recipe recovery via book works headlessly (test) — the showcase loop.
- [ ] Validator/fallback tests green. With MockProvider, saying "please build a hut near the pond" to a goblin produces a build wish, a reply bubble and a log entry; loading and replaying that save reproduces the world hash without any provider call.

### Phase 10 — Rival clans, trade, migration

1. **P10.1** Abstract rival clan sim (§16), clan relations panel.
2. **P10.2** Scouts and traders (rendered with their clan's gene pool), `Trade` between goblins and with traders.
3. **P10.3** Raids by rival goblins; diplomacy via chief gifts; exile → defection.
4. **P10.4** Alliances, marriage migration (new alleles enter the gene pool), heterozygosity-based inbreeding penalty.

**Acceptance (P10)**
- [ ] Balance 96 days: in ≥ 3/5 seeds at least one migrant joins and has offspring; genetic diversity measurably higher than an isolated control run.

### Phase 11 — Polish, god-game finishing, photo mode, performance

1. **P11.1** God-game finishing: Director camera, Timeline panel, Codex (incl. divine deeds §17.10), Possess tool (Sandbox), quick save/load, key rebinding with conflict detection, replay viewer polish, contextual first-session tips, Help screen.
2. **P11.2** Photo mode: hide UI, depth-of-field-free soft vignette, tilt-shift toggle (simple post shader), screenshot to PNG.
3. **P11.3** Performance pass: profile at 150 goblins/600 plants; instancing everything static; geometry cache for goblin buckets; pathfinding budget per tick (max 30 A* expansions per goblin per tick, continue next tick).
4. **P11.4** Accessibility & UX pass (§18.3 settings): UI scale, reduced motion, high contrast, colorblind-safe UI colors (goblin colors stay genetic), tooltip audit (every button has a tooltip with its shortcut), keyboard-only operation of all panels.
5. **P11.5** Final balance pass with `npm run balance -- --days 160`; update `DECISIONS.md`; write `README.md` (how to run, how LLM mode works, controls).

**Acceptance (P11 / project)** — the Definition of Done in §0.4.

---

## 23. Rendering, UI & Save Details

### 23.1 Art direction

- Flat shading everywhere (`MeshLambertMaterial({ flatShading: true, vertexColors: true })`), no textures. Shared materials in `lowpoly.ts`.
- Palette in `palette.ts`: terrain/foliage palettes per season (4 × 12 colors), UI palette. Goblin colors come only from genetics (HSL → RGB), with a lightness clamp so goblins always read against grass (if skin lightness and hue are close to the meadow color, add a 1-px darker outline via a slightly scaled backface mesh — cheap "toon outline" for all goblins, toggleable).
- Terrain: 1 vertex per tile corner, height × 6 world units, vertex jitter ±0.15 XZ, per-vertex color blending by biome, season, snow, wear (dirt), ash, wetness.
- Water: separate plane at waterLevel, `MeshLambertMaterial` transparent 0.75, vertex wave in `onBeforeCompile`, lighter foam vertices near shores.
- Lighting: `HemisphereLight` (sky/ground colors per phase) + `DirectionalLight` sun with shadows (shadow map 2048, frustum follows camera target, only goblins/buildings/trees cast). Night: sun → moon (cool, 0.25 intensity), point lights only for fires (max 8 nearest to camera active; others emissive only).
- Sky: gradient sphere shader with phase colors; stars at night; moon phase sprite.

### 23.2 Instancing & caching

`instancing.ts` manages `InstancedMesh` pools per (kind, stage/variant); entities map to instance indices; dirty-only matrix updates. Goblin geometry cache by quantized morphology bucket; per-goblin color via vertex color attribute copy (cheap) — or a single `InstancedMesh` per bucket with `instanceColor` for body tint plus pattern via second instanced mesh layer. Choose the simpler approach first (individual meshes sharing geometry), move to instancing in P11 only if profiling demands it.

### 23.3 Camera, controls & panels

Specified in §18 (camera §18.12, input §18.4, inspector and panels §18.6–18.7). Portraits: offscreen render of the goblin mesh to a 128×128 canvas, cached, refreshed on life-stage change or genome edit.

### 23.4 God hand & power FX

- `godHand.ts`: hand built from boxes and cylinders (palm + five two-segment fingers), so poses (open, point, fist, pet, flat) are per-joint rotations lerped over 0.15 s; blob shadow decal; held entities rendered at hold height with pendulum sway; dashed drop line to the ground.
- `powerFx.ts`: reusable low-poly effects — sparkle trails for gift drops; golden beams (heal, bring forth, resurrect); lightning (jagged line mesh, 2-frame screen flash, point-light pulse); meteor (icosahedron with fire-particle tail, crater dust ring); earthquake (camera shake + terrain vertex jitter); swarm (dark particle cloud); curse cloud; sanctuary dome (translucent icosphere, fresnel rim); sky pictograms for Divine Signs (emissive icon billboards); voice "rumble" (sky darkens, light rays above the addressees).
- `decals.ts`: radius rings and brush circles as ring meshes conformed to terrain height (sampled every 10°), colored by power category.
- `outline.ts`: hover/affected outlines via backface-scaled outline meshes (same technique as goblin outlines).

### 23.5 Save system

- `serialize(world)` → canonical JSON with `version`; `deserialize` runs `migrations[v]` stepwise up to current. Each phase that changes `WorldState` bumps `version` and adds a migration (fill defaults).
- Autosave every in-game day to `localStorage` (3 rotating slots); manual export/import file. LLM annotations included (they are part of the story) but excluded from the hash.
- `commandLog` is part of the save (consecutive `god_hold_move` entries are run-length compressed). "Watch replay" rebuilds a world from `seed` + log at up to 64× with the UI in read-only mode.

---

## 24. Risks & Stretch Goals

### 24.1 Risk register

| Risk | Mitigation |
|---|---|
| Too many interacting systems → unstable balance | Phase gates; balance runner with FAIL flags; config-only tuning; controls (disable a system, rerun) |
| AI dithering or nonsense priorities | hysteresis, debug score table, planner abandonment rules, per-action unit tests |
| Performance at 64× with big villages | staggered updates, spatial hash, path budget, instancing, profiling in P11 |
| Population explosion or extinction | soft cap fertility curve, reinforcements flag until P5, winter preservation tuning |
| Context loss across long agent sessions | `PROGRESS.md` + `DECISIONS.md` + small files + this doc as single source of truth |
| LLM cost/latency/key exposure | budgets, proxy, mock default, Ollama option, annotation-only design |
| Save breaks between phases | versioned saves with migrations from P1 |
| God powers trivialize survival | Divine-mode favor economy, cooldowns, dependence drift; Sandbox is explicitly a toy mode |
| LLM interpreter misreads the player | strict schema + validator, keyword fallback, "understood as" chip so the player can rephrase; wishes are bounded and expire |
| Command log grows large | compact commands, ≤ 1 hold-move per tick, run-length compression in saves |
| UI overwhelms new players | only implemented tools appear, contextual tips, Observer mode, Gentle mode |

### 24.2 Stretch goals (after P11, in any order)

- Procedural WebAudio: ambient wind/rain, goblin chirps pitched by size, music circle tunes from musician style seeds.
- Seasonal photo album: auto-captured screenshots of top events with chronicle captions.
- Mod data: load extra recipes/items/festivals from JSON.
- Multiple player villages on a larger map (pick which to watch).
- Goblin "dreams": LLM-generated dream text from the day's events, shown while sleeping (bubble with stars).
- Export a goblin as a downloadable `.glb` (procedural mesh + colors) — fun for printing or sharing.
- Timelapse recorder (canvas capture of a year at 64×).

---

*End of specification. First instruction to the implementing agent:*

> Read `NIBBLETS_DESIGN_DOC.md` in full. Follow §0 (Agent Execution Protocol) exactly. Start at P1.1 (or wherever `PROGRESS.md` says) and work through every phase in order without asking questions, committing after every step and keeping `PROGRESS.md` current, until the Definition of Done (§0.4) is met.
