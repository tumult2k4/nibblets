/** Plain-data world state (§5). Everything here is serializable; no class instances. */
import type {
  Biome, BuildingType, ChatTopic, EnemyKind, ID, ItemStack, LifeStage, PlantKind, PlantStage, Vec2, WeatherKind, Tone, WishIntent,
} from '../shared/types';
import type { Genome } from './goblin/genetics/genome';
import type { GodState } from './god/godState';

export interface Tile {
  height: number;
  biome: Biome;
  fertility: number;
  moisture: number;
  walkable: boolean;
  wear: number;
  occupiedBy: ID | null;
  snow: number;
  /** P6.2: ash left by a fire, 1 fresh .. fading to 0 (absent when none) */
  ash?: number;
}

/** Floods and droughts (§14.4, P6.3): a flood keeps each drowned tile's old biome to give it back. */
export interface Climate {
  rainHours: number; rainDays: number; dryDays: number;
  flood: { since: number; tiles: [number, Biome][] } | null;
  drought: { since: number; tiles: number[] } | null;
  /** P6.6: the god's floods, each over its own area until it drains (tiles it put under, with their old biome) */
  godFloods: { pos: Vec2; r: number; until: number; tiles: [number, Biome][] }[];
}

/**
 * A dead goblin (§13.7, P6.4): its body `lying` where it fell, `carried` by `carrierId` to the graveyard, `buried`
 * there, or covered with a `mound` where it lay when nobody came. `goods`: the trinket buried with it. `body`: the
 * goblin as it died, kept two days for the god's Resurrect (P6.6).
 */
export interface Grave {
  id: ID; goblinId: ID; name: string; epithet: string | null; clanId: ID; pos: Vec2; tick: number; born: number; cause: string;
  goods: ID | null; state: 'lying' | 'carried' | 'buried' | 'mound'; carrierId: ID | null; eulogy: string | null; body: Goblin | null;
}

/** A burning tile (§10.3, P6.2): `intensity` 0..1, `fuel` left to burn; `cause` what lit it. */
export interface Fire { x: number; y: number; intensity: number; fuel: number; since: number; cause: string }

export interface Needs {
  hunger: number; thirst: number; energy: number; warmth: number; safety: number;
  social: number; fun: number; curiosity: number; comfort: number; purpose: number;
}
export type NeedId = keyof Needs;

export interface MoodModifier { id: string; amount: number; expiresTick: number }
export type Emotion = 'content' | 'happy' | 'excited' | 'sad' | 'grieving' | 'angry' | 'scared' | 'lonely' | 'bored';
export interface MoodState { value: number; modifiers: MoodModifier[]; emotion: Emotion }

export interface Personality {
  gluttony: number; bravery: number; sociability: number; industry: number;
  wanderlust: number; mischief: number; piety: number;
}

/** A healing wound (§14.2): `limp` slows, `bruised_arm` slows work, until `until`. Ear notches go straight to scars. */
export interface Injury { kind: 'limp' | 'bruised_arm'; until: number }
/** A disease a goblin carries (§14.3, P6.1): `progress` in days, through incubation and then the sickness itself;
 * `remedy`: a dose of herbal remedy was taken for it (P6.5). */
export interface Illness { id: string; stage: 'incubating' | 'sick'; progress: number; since: number; remedy?: boolean }
export interface HealthState {
  hp: number; maxHp: number; injuries: Injury[]; disease: Illness | null; scars: number;
  /** disease id → tick until which it cannot be caught again */
  immune: Record<string, number>;
  /** ticks in a row with warmth at 0 (shivers after 2 h) */
  coldTicks: number;
  /** tended by a friend (TendSick) until then: wounds and illness heal faster */
  tendedUntil: number;
}

export type ActionId =
  | 'idle' | 'wander' | 'harvest_fruit' | 'eat' | 'drink' | 'sleep_ground' | 'pick_up' | 'drop' | 'look_up' | 'struggle'
  | 'eat_core' | 'plant_seed' | 'water_plant' | 'chop' | 'store_item' | 'take_item' | 'explore'
  | 'deliver_material' | 'build' | 'claim_home' | 'sleep_home' | 'gather_for_goal' | 'seek_shelter' | 'warm_up' | 'forage'
  | 'mine' | 'craft' | 'equip' | 'plan_building' | 'tend_fire' | 'flee' | 'attack' | 'defend_village' | 'guard' | 'repair_building'
  | 'follow_wisp' | 'scatter' | 'chat' | 'comfort' | 'gift' | 'court' | 'lay_egg' | 'incubate_egg' | 'feed_child' | 'follow_parent'
  | 'play' | 'learn' | 'teach' | 'cut_grass' | 'pick_flowers' | 'process' | 'rest_sick' | 'tend_sick' | 'extinguish_fire' | 'escape_fire' | 'cull_blight'
  | 'bury_dead' | 'mourn';

export interface ActivityState {
  action: ActionId;
  status: 'running' | 'done' | 'failed';
  startedTick: number;
  targetId: ID | null;
  target: Vec2 | null;
  path: Vec2[]; // remaining waypoints (tile centers)
  progress: number; // action-specific ticks
  stage: number; // action-specific sub-phase
  /** what a conversation is about and how many lines it runs (P5.1 Chat) */
  topic?: ChatTopic;
  count?: number;
  /** the recipe or fact being taught (P5.5 Teach) */
  lesson?: string;
}

export interface DivineWish {
  id: ID; intent: WishIntent; issuedTick: number; expiresTick: number; strength: number; source: 'voice' | 'sign';
}
export interface GodView {
  faith: number; love: number; fear: number; angryAtGod: boolean; wishes: DivineWish[];
  /** when the anger at the god wears off (P4.8: 8 days after a loved one was harmed) */
  angryUntil: number;
  answeredPrayers: number; ignoredPrayers: number; lastVoiceTick: number;
  petLoveToday: number; petDay: number;
}

export interface MemoryEntry { kind: string; targetId?: ID; pos: Vec2; data: number; lastSeenTick: number; confidence: number }
export type RelationBond = 'none' | 'friend' | 'best_friend' | 'rival' | 'enemy' | 'mate' | 'parent' | 'child' | 'sibling';
/** §13.1: how one goblin sees another (one-sided). */
export interface Relation {
  targetId: ID; opinion: number; familiarity: number; bond: RelationBond; lastInteraction: number;
  /** courtship (P5.3): welcome courtships in a row, and when last tried */
  court?: number; courtTick?: number;
}
/** §13.4 lineage book: everyone who ever lived, for kinship and the family tree (P5.3) */
export interface LineageEntry {
  parents: [ID, ID] | null; name: string; hue: number; born: number; died: number | null;
  /** P5.8 (save v14): clan, true skin color [h, s, l] and recessive allele counts, for the family tree */
  clan?: ID; skin?: [number, number, number]; rec?: Record<string, number>;
}
export interface DeedCounters { eaten: number; drank: number; harvested: number; planted: number; kills: number; builds: number; gifts: number; timesHeld: number; fights: number }

/** Ballistic state of a held/thrown/dropped entity. z is absolute altitude in world units. */
export interface Airborne {
  z: number; vel: { x: number; y: number; z: number };
  /** height above ground at release (drives fall damage) */
  dropHeight: number;
  /** horizontal release speed (drives throw impact damage) */
  throwSpeed: number;
  /** true while held by the god hand (kinematic) */
  held: boolean;
}

export interface Goblin {
  id: ID; name: string; epithet: string | null; clanId: ID;
  genome: Genome; bornTick: number; lifeStage: LifeStage; parents: [ID, ID] | null;
  pos: Vec2; facing: number; velocity: Vec2;
  needs: Needs; mood: MoodState; personality: Personality; health: HealthState;
  inventory: ItemStack[];
  /** worn / held items (§P4.2): the hand holds a weapon or tool and does not use an inventory slot */
  equipped: { hand: ItemStack | null; body: ItemStack | null; neck: ItemStack | null; head: ItemStack | null };
  activity: ActivityState; goalStack: import('./ai/planner').GoalEntry[]; homeId: ID | null;
  memory: MemoryEntry[]; relationships: Relation[]; skills: Record<string, number>; knownRecipes: string[];
  /** cultural facts (§15.1): `redcap_is_poison`, `gnashers_fear_fire` */
  knownFacts: string[];
  trinkets: ID[]; reputation: number; traits: string[]; deeds: DeedCounters; godView: GodView;
  role: 'none' | 'chief' | 'shaman'; heldByGod: boolean; lastDecisionTick: number;
  /** current hold height / airborne state (god hand), null when on the ground */
  airborne: Airborne | null;
  lifespanDays: number;
  wetUntil: number;
  /** when this goblin last had an egg with its mate (P5.3 cooldown) */
  lastEggTick: number;
  /** P5.9 Fertility gift: until then the next egg comes regardless of the day's roll, the cooldown and lean times */
  fertileUntil?: number;
}

/** A shiny thing (§12.1). P5.9 brings the first ones (the Shiny Gift); hunting, trading and decorating come in P8. */
export interface Trinket {
  id: ID; kind: string; rarity: import('../shared/types').Rarity; hue: number; foundBy: ID; foundTick: number;
  /** owner chain, first finder first, for stories */
  history: ID[];
}

export interface Plant {
  id: ID; kind: PlantKind; pos: Vec2; stage: PlantStage; growth: number; fruit: number; fruitProgress: number;
  hydration: number; hp: number; plantedBy: ID | null; age: number; blight: number;
}
/**
 * An enemy (§14.1, P4.4/P4.7). Gnashers prowl in from the wilds, steal food and bite lone goblins, and run off when
 * hurt, crowded or at dawn. A Bramblebeast tramples through (`smash` = breaking whatever blocks it); a Night Wisp
 * drifts and `lure`s a goblin away. `mode` is the current intent; `home` is where it flees to (a beast's exit).
 */
export interface Enemy {
  id: ID; kind: EnemyKind; pos: Vec2; velocity: Vec2; facing: number;
  hp: number; maxHp: number;
  mode: 'prowl' | 'steal' | 'attack' | 'flee' | 'leave' | 'smash' | 'lure';
  targetId: ID | null; target: Vec2 | null; path: Vec2[];
  carrying: ItemStack | null;
  home: Vec2; spawnTick: number; nextDecide: number; timer: number; hits: number;
  /** has any goblin noticed it yet (one alarm per enemy) */
  seen: boolean;
  /** called down by the god (Summon Gnashers, P4.8): hunts by day for a few hours */
  summoned?: boolean;
}

/** A remembered spot of danger (P4.8 danger lens): where, when and how bad (0.5 sighting … 2 death). */
export interface DangerMark { pos: Vec2; tick: number; weight: number }

export interface Rock { id: ID; pos: Vec2; size: 1 | 2 | 3; stoneLeft: number; flintChance: number }
export interface GrassPatch { id: ID; pos: Vec2; density: number }
export interface Mushroom { id: ID; pos: Vec2; kind: 'brown' | 'glowcap' | 'redcap'; age: number }
export interface GroundItem { id: ID; pos: Vec2; stack: ItemStack; droppedTick: number; airborne: Airborne | null; reservedBy: ID | null }
/** An egg (§13.3): `warmth` is its current warmth 0..1, `incubation` warm ticks minus cold ticks (hatch at 2 days). */
export interface Egg {
  id: ID; pos: Vec2; genome: Genome; parents: [ID, ID]; laidTick: number; warmth: number; incubation: number; airborne: Airborne | null;
  twinOf?: ID;
}
export interface Building {
  id: ID; type: BuildingType; pos: Vec2; rotation: 0 | 1 | 2 | 3; footprint: { w: number; h: number };
  buildProgress: number; hp: number; maxHp: number; ownerId: ID | null; storage: ItemStack[]; occupants: ID[];
  fuel?: number; data?: Record<string, number>; decoration: ID[];
}

/** A local weather cell (§17.5.2) overriding global weather inside its radius until `untilTick`. */
export interface WeatherCell { id: ID; kind: WeatherKind; pos: Vec2; radius: number; untilTick: number; tempOffset: number }
/** `upcoming` is rolled one transition ahead so the top bar can show a true forecast (§18.2). */
export interface WeatherState {
  kind: WeatherKind; nextChangeTick: number; temperature: number; windDir: number;
  upcoming: WeatherKind; cells: WeatherCell[];
}
export interface Clan { id: ID; name: string; archetype: string }
/** `stockpile` is the shared village store (P2.3): a marked spot near the center where goblins pile things. */
/** `fenceRing`: radius of the planned fence ring around the center, fixed when fencing starts (0 = none yet, P4.6). */
export interface VillageState {
  name: string; center: Vec2; chiefId: ID | null; stockpile: ItemStack[]; stockpilePos: Vec2; fenceRing: number;
  /** recipes and facts that died with their last knower (P5.5); rediscovery takes them off */
  lost?: string[];
  /** what has rotted since the day began (P5.6), reported at dawn */
  spoiled?: Partial<Record<import('../shared/types').ItemType, number>>;
  /** where the village lays its dead (P6.4), chosen at the first burial */
  graveyard?: Vec2 | null;
  /** village policies (P6.5 hook; a chief sets them from P8, the sandbox drawer until then) */
  policies?: { quarantine?: boolean };
}

export interface StatsSample { tick: number; pop: number; food: number; avgHunger: number; avgFaith: number }
export interface StatsSeries { samples: StatsSample[]; deaths: Record<string, number>; births: number; eaten: number; divineFood: number; spoiled?: number }

export interface LlmAnnotations { journals: unknown[]; speechText: Record<string, string> }

export interface LoggedCommand { tick: number; cmd: import('./commands').Command }

export interface WorldState {
  version: number; seed: number; tick: number; nextId: number; rngState: number;
  size: { w: number; h: number }; preset: string; terrainVersion: number;
  tiles: Tile[];
  goblins: Goblin[]; eggs: Egg[]; plants: Plant[]; rocks: Rock[]; grass: GrassPatch[]; mushrooms: Mushroom[];
  /** P6.2 wildfires: the tiles burning now */
  fires: Fire[];
  /** P6.3: rain hours today, rainy and dry days in a row, and the flood or drought under way (tiles it changed) */
  climate: Climate;
  wildlife: unknown[]; groundItems: GroundItem[]; buildings: Building[]; enemies: Enemy[];
  /** spawn director: last budgeted night, queued spawn ticks, enemies spotted so far (drives fencing), and recent
   * danger marks (sightings, bites, thefts, smashes, deaths) for the danger lens (P4.8) */
  threat: { night: number; spawnAt: number[]; alarms: number; marks: DangerMark[]; /** P5.7 tower warning: until when, and where the threat was seen */ warnUntil?: number; warnAt?: Vec2 };
  graves: Grave[];
  /** every trinket in the world (§12.1, P5.9); goblins hold ids in `trinkets` */
  trinkets: Trinket[];
  lineage: Record<number, LineageEntry>;
  places: unknown[]; clans: Clan[]; village: VillageState; god: GodState;
  commandLog: LoggedCommand[]; weather: WeatherState; stats: StatsSeries; llm: LlmAnnotations;
  /** creation parameters (replay rebuilds tick 0 from these) */
  genParams: import('./newWorld').GenParams;
}

export type { Tone };
