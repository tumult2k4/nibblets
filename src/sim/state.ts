/** Plain-data world state (§5). Everything here is serializable; no class instances. */
import type {
  Biome, BuildingType, EnemyKind, ID, ItemStack, LifeStage, PlantKind, PlantStage, Vec2, WeatherKind, Tone, WishIntent,
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
}

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
export interface HealthState { hp: number; maxHp: number; injuries: Injury[]; disease: string | null; scars: number }

export type ActionId =
  | 'idle' | 'wander' | 'harvest_fruit' | 'eat' | 'drink' | 'sleep_ground' | 'pick_up' | 'drop' | 'look_up' | 'struggle'
  | 'eat_core' | 'plant_seed' | 'water_plant' | 'chop' | 'store_item' | 'take_item' | 'explore'
  | 'deliver_material' | 'build' | 'claim_home' | 'sleep_home' | 'gather_for_goal' | 'seek_shelter' | 'warm_up' | 'forage'
  | 'mine' | 'craft' | 'equip' | 'plan_building' | 'tend_fire' | 'flee' | 'attack' | 'defend_village' | 'guard' | 'repair_building';

export interface ActivityState {
  action: ActionId;
  status: 'running' | 'done' | 'failed';
  startedTick: number;
  targetId: ID | null;
  target: Vec2 | null;
  path: Vec2[]; // remaining waypoints (tile centers)
  progress: number; // action-specific ticks
  stage: number; // action-specific sub-phase
}

export interface DivineWish {
  id: ID; intent: WishIntent; issuedTick: number; expiresTick: number; strength: number; source: 'voice' | 'sign';
}
export interface GodView {
  faith: number; love: number; fear: number; angryAtGod: boolean; wishes: DivineWish[];
  answeredPrayers: number; ignoredPrayers: number; lastVoiceTick: number;
  petLoveToday: number; petDay: number;
}

export interface MemoryEntry { kind: string; targetId?: ID; pos: Vec2; data: number; lastSeenTick: number; confidence: number }
export interface Relation { targetId: ID; opinion: number }
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
  trinkets: ID[]; reputation: number; traits: string[]; deeds: DeedCounters; godView: GodView;
  role: 'none' | 'chief' | 'shaman'; heldByGod: boolean; lastDecisionTick: number;
  /** current hold height / airborne state (god hand), null when on the ground */
  airborne: Airborne | null;
  lifespanDays: number;
  wetUntil: number;
}

export interface Plant {
  id: ID; kind: PlantKind; pos: Vec2; stage: PlantStage; growth: number; fruit: number; fruitProgress: number;
  hydration: number; hp: number; plantedBy: ID | null; age: number; blight: number;
}
/**
 * An enemy (§14.1, P4.4). Gnashers prowl in from the wilds, steal food and bite lone goblins, and run off when hurt,
 * crowded or at dawn. `mode` is the current intent; `home` is where it came from and where it flees to.
 */
export interface Enemy {
  id: ID; kind: EnemyKind; pos: Vec2; velocity: Vec2; facing: number;
  hp: number; maxHp: number;
  mode: 'prowl' | 'steal' | 'attack' | 'flee' | 'leave';
  targetId: ID | null; target: Vec2 | null; path: Vec2[];
  carrying: ItemStack | null;
  home: Vec2; spawnTick: number; nextDecide: number; timer: number; hits: number;
  /** has any goblin noticed it yet (one alarm per enemy) */
  seen: boolean;
}

export interface Rock { id: ID; pos: Vec2; size: 1 | 2 | 3; stoneLeft: number; flintChance: number }
export interface GrassPatch { id: ID; pos: Vec2; density: number }
export interface Mushroom { id: ID; pos: Vec2; kind: 'brown' | 'glowcap' | 'redcap'; age: number }
export interface GroundItem { id: ID; pos: Vec2; stack: ItemStack; droppedTick: number; airborne: Airborne | null; reservedBy: ID | null }
export interface Egg { id: ID; pos: Vec2; genome: Genome; parents: [ID, ID]; laidTick: number; warmth: number; airborne: Airborne | null }
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
export interface VillageState { name: string; center: Vec2; chiefId: ID | null; stockpile: ItemStack[]; stockpilePos: Vec2; fenceRing: number }

export interface StatsSample { tick: number; pop: number; food: number; avgHunger: number; avgFaith: number }
export interface StatsSeries { samples: StatsSample[]; deaths: Record<string, number>; births: number; eaten: number; divineFood: number }

export interface LlmAnnotations { journals: unknown[]; speechText: Record<string, string> }

export interface LoggedCommand { tick: number; cmd: import('./commands').Command }

export interface WorldState {
  version: number; seed: number; tick: number; nextId: number; rngState: number;
  size: { w: number; h: number }; preset: string; terrainVersion: number;
  tiles: Tile[];
  goblins: Goblin[]; eggs: Egg[]; plants: Plant[]; rocks: Rock[]; grass: GrassPatch[]; mushrooms: Mushroom[];
  wildlife: unknown[]; groundItems: GroundItem[]; buildings: Building[]; fires: unknown[]; enemies: Enemy[];
  /** spawn director (§14.1): the night last budgeted and the ticks of spawns still to come */
  /** spawn director: last budgeted night, queued spawn ticks, enemies spotted so far (drives fencing) */
  threat: { night: number; spawnAt: number[]; alarms: number };
  graves: { id: ID; goblinId: ID; name: string; pos: Vec2; tick: number; cause: string }[];
  places: unknown[]; clans: Clan[]; village: VillageState; god: GodState;
  commandLog: LoggedCommand[]; weather: WeatherState; stats: StatsSeries; llm: LlmAnnotations;
  /** creation parameters (replay rebuilds tick 0 from these) */
  genParams: import('./newWorld').GenParams;
}

export type { Tone };
