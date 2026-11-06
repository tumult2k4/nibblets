import type { ID } from './ids';
import type { Vec2, Vec3, HSL } from './math';

export type { ID, Vec2, Vec3, HSL };

export type Season = 'spring' | 'summer' | 'autumn' | 'winter';
export type DayPhase = 'dawn' | 'day' | 'dusk' | 'night';
export type LifeStage = 'egg' | 'hatchling' | 'youngling' | 'adult' | 'elder';
export type Biome = 'meadow' | 'forest' | 'sand' | 'rock' | 'water' | 'marsh' | 'snow';
export type WeatherKind = 'clear' | 'cloudy' | 'fog' | 'rain' | 'storm' | 'snow' | 'blizzard' | 'heatwave';

export type ItemType =
  | 'apple' | 'apple_core' | 'apple_mash' | 'dried_apple' | 'mushroom' | 'glowcap' | 'redcap'
  | 'berry' | 'fish' | 'cooked_fish' | 'meat' | 'cooked_meat' | 'stew' | 'egg_shell'
  | 'wood' | 'stick' | 'leaves' | 'stone' | 'flint' | 'fiber' | 'clay' | 'bone' | 'feather' | 'pelt' | 'flower' | 'ash' | 'compost'
  | 'spear' | 'stone_spear' | 'club' | 'sling' | 'stone_axe' | 'pick' | 'fishing_rod' | 'bucket'
  | 'loincloth' | 'leaf_cape' | 'fur_cloak' | 'bone_necklace' | 'flower_crown' | 'war_paint'
  | 'basket' | 'rope' | 'sleeping_mat' | 'book' | 'drum' | 'flute' | 'torch'
  | 'trinket' | 'star_stone' | 'herbal_remedy' | 'pot';

export interface ItemStack {
  type: ItemType;
  qty: number;
  /** true if it fell from the sky (god-given); used by prayers and dependence. */
  divine?: boolean;
  /** tools & weapons: uses left (absent = brand new, §11.3) */
  dur?: number;
  /** fine quality (§11.1): +50 % durability and effect */
  fine?: boolean;
  /** food (P5.6): spoilage carried over between rot checks, 0..1 of one unit */
  rot?: number;
}

/** Billboard emotes over a goblin's head (§P2.6). */
export type Emote = 'question' | 'exclaim' | 'heart' | 'zzz' | 'idea' | 'sweat' | 'music' | 'anger' | 'sneeze' | 'sick' | 'tear' | 'pray';
export type PlantKind = 'apple_bush' | 'berry_bush' | 'tree' | 'flower';
export type PlantStage = 'seed' | 'sprout' | 'sapling' | 'young' | 'mature' | 'old' | 'dead' | 'stump';
export type BuildingType =
  | 'hut' | 'stone_hut' | 'longhouse' | 'campfire' | 'hearth' | 'fence' | 'gate'
  | 'storage_pit' | 'drying_rack' | 'grinding_stone' | 'workbench' | 'kiln'
  | 'watchtower' | 'shrine' | 'totem' | 'well' | 'garden_plot' | 'compost_heap'
  | 'nursery' | 'graveyard_marker' | 'library_shelf' | 'music_circle' | 'bridge' | 'temple';

export type EnemyKind = 'gnasher' | 'bramblebeast' | 'night_wisp';
export type DeathCause =
  | 'starvation' | 'dehydration' | 'hypothermia' | 'old_age' | 'combat' | 'disease' | 'fall' | 'lightning'
  | 'fire' | 'poison' | 'drowning' | 'divine';
export type RecipeId = string;
/** How a goblin came to know a recipe or fact (§15.1). */
export type LearnVia = 'teach' | 'observe' | 'discovery' | 'experience' | 'book';
export type DiseaseId = string;
export type TrinketKind = string;
export type Rarity = 'common' | 'uncommon' | 'rare' | 'legendary';
export type MoodBreakKind = 'tantrum' | 'sulk' | 'binge' | 'wander_off';
export type FestivalKind = string;
export type PrankKind = string;
/** §13.2 conversation topics (festival comes with festivals, P8). */
/** §5 skills (P5.2): XP per skill, read as a level 0–10. */
export type SkillId = 'forage' | 'woodcraft' | 'building' | 'mining' | 'crafting' | 'combat' | 'farming' | 'cooking' | 'teaching';
export type ChatTopic = 'weather' | 'food' | 'danger' | 'gossip' | 'a_person' | 'trinkets' | 'a_place' | 'the_dead' | 'festival' | 'complaint';
export type BeliefId = string;
export type PowerId = string;
export type PrayerKind =
  | 'food' | 'water' | 'rain' | 'sun' | 'warmth' | 'healing' | 'protection' | 'child' | 'mate' | 'lost_item' | 'revenge' | 'forgiveness' | 'thanks';
export type Tone = 'kind' | 'stern' | 'wrathful' | 'playful';
export type WishIntent =
  | 'gather' | 'build' | 'plant' | 'guard' | 'fight' | 'hide' | 'avoid' | 'share_food' | 'stop'
  | 'make_peace' | 'rest' | 'explore' | 'come_here' | 'worship' | 'celebrate' | 'teach' | 'tend'
  | 'court' | 'move_home' | 'eat' | 'leave_alone';
/** What a wish is about (§17.6): an item to gather, a building (type or blueprint id), a goblin, a spot, a recipe; `action` is what `stop` stopped. */
export interface WishTarget { kind: 'item' | 'building' | 'entity' | 'place' | 'pos' | 'recipe' | 'action'; value: string | number; pos?: Vec2 }
export interface ParsedIntent { intent: WishIntent; target?: WishTarget }
/** A line in the Voice panel's log (annotation, outside the hashed state): the god's (goblinId null) or a goblin's reply. */
export interface VoiceLine { tick: number; goblinId: ID | null; text: string; tone?: Tone; intents?: WishIntent[]; who?: string; defied?: boolean }
export type DivineActKind = PowerId | 'grab' | 'set_down' | 'drop' | 'throw' | 'pet' | 'poke' | 'flick' | 'gift';

interface BaseEvent {
  tick: number;
  at?: Vec2;
}

export type SimEvent = BaseEvent &
  (
    | { type: 'item_eaten'; goblinId: ID; item: ItemType; divine?: boolean }
    | { type: 'item_drunk'; goblinId: ID }
    | { type: 'item_picked'; goblinId: ID; item: ItemType }
    | { type: 'item_stored'; goblinId: ID; item: ItemType; qty: number }
    | { type: 'item_taken'; goblinId: ID; item: ItemType; qty: number }
    | { type: 'fell_asleep' | 'woke_up'; goblinId: ID }
    | { type: 'harvested'; goblinId: ID; plantId: ID; item: ItemType }
    | { type: 'foraged'; goblinId: ID; item: ItemType }
    | { type: 'core_planted'; goblinId: ID; plantId: ID }
    | { type: 'plant_stage'; plantId: ID; stage: PlantStage }
    | { type: 'plant_born'; plantId: ID; kind: PlantKind; plantedBy: ID | null; at: Vec2 }
    | { type: 'plant_died'; plantId: ID; kind: PlantKind; at: Vec2 }
    | { type: 'plant_watered'; goblinId: ID; plantId: ID; at: Vec2 }
    | { type: 'plant_chopped'; goblinId: ID; plantId: ID; wood: number }
    | { type: 'rock_mined'; goblinId: ID; rockId: ID; flint: boolean; left: number }
    | { type: 'tool_broken'; goblinId: ID; item: ItemType; at: Vec2 }
    | { type: 'campfire_out'; buildingId: ID }
    | { type: 'fire_tended'; goblinId: ID; buildingId: ID; wood: number }
    | { type: 'item_crafted'; goblinId: ID; recipe: RecipeId; item: ItemType; fine: boolean; at: Vec2 }
    | { type: 'building_placed' | 'building_completed' | 'building_destroyed'; buildingId: ID; kind: BuildingType; goblinId?: ID; cause?: string }
    | { type: 'weather_changed'; from: WeatherKind; to: WeatherKind }
    | { type: 'season_changed'; season: Season; year: number }
    | { type: 'day_started'; day: number }
    | { type: 'enemy_spawned' | 'enemy_fled'; enemyId: ID; kind: EnemyKind }
    | { type: 'enemy_killed'; enemyId: ID; kind: EnemyKind; killerId: ID | null }
    | { type: 'injured'; goblinId: ID; injury: 'limp' | 'bruised_arm' | 'ear_notch' }
    | { type: 'enemy_spotted'; goblinId: ID; enemyId: ID }
    | { type: 'enemy_stole'; enemyId: ID; item: ItemType; qty: number }
    | { type: 'enemy_bit'; enemyId: ID; goblinId: ID; damage: number }
    | { type: 'wisp'; enemyId: ID; goblinId: ID | null; phase: 'lure' | 'dispersed' | 'faded' }
    | { type: 'immigrants'; goblinIds: ID[] }
    | { type: 'attack'; attackerId: ID; targetId: ID; damage: number }
    | { type: 'goblin_hurt'; goblinId: ID; damage: number; cause: DeathCause }
    | { type: 'freezing'; goblinId: ID }
    | { type: 'home_claimed'; goblinId: ID; buildingId: ID }
    | { type: 'goal_abandoned'; goblinId: ID; goal: string }
    | { type: 'goblin_died'; goblinId: ID; cause: DeathCause }
    | { type: 'gift_given'; fromId: ID; toId: ID; item: ItemType }
    | { type: 'theft'; thiefId: ID; victimId: ID | null; item?: ItemType; witnessIds: ID[]; trinket?: TrinketKind; at?: Vec2 }
    | { type: 'prank'; prankerId: ID; targetId: ID; kind: PrankKind; at?: Vec2 }
    | { type: 'brawl'; aId: ID; bId: ID; brokenUpBy?: ID; at: Vec2 }
    | { type: 'apology'; goblinId: ID; toId: ID; returned: boolean; at: Vec2 }
    | { type: 'justice'; chiefId: ID; goblinId: ID; victimId: ID; sentence: 'return' | 'apology' | 'exile'; at: Vec2 }
    | { type: 'exile_ended'; goblinId: ID; at: Vec2 }
    | { type: 'chat'; aId: ID; bId: ID; topic: ChatTopic }
    | { type: 'chat_line'; goblinId: ID; topic: ChatTopic }
    | { type: 'skill_up'; goblinId: ID; skill: SkillId; level: number }
    | { type: 'courted'; aId: ID; bId: ID; success: boolean }
    | { type: 'bond_formed'; aId: ID; bId: ID; kind: 'friend' | 'best_friend' | 'rival' | 'enemy' | 'mate' }
    | { type: 'comforted'; goblinId: ID; byId: ID }
    | { type: 'egg_laid'; eggId: ID; parents: [ID, ID] }
    | { type: 'egg_hatched'; eggId: ID; goblinId: ID }
    | { type: 'adopted'; goblinId: ID; parentId: ID }
    | { type: 'egg_lost'; eggId: ID; parents: [ID, ID]; cause: 'cold' | 'eaten' | 'neglect' | 'fall' | 'fire' | 'flood' }
    | { type: 'life_stage'; goblinId: ID; stage: LifeStage }
    | { type: 'recipe_discovered' | 'recipe_learned' | 'recipe_lost'; goblinId?: ID; recipe: RecipeId; via?: LearnVia; byId?: ID }
    | { type: 'poisoned'; goblinId: ID; item: ItemType }
    | { type: 'food_spoiled'; qty: number; items: Partial<Record<ItemType, number>> }
    | { type: 'food_processed'; goblinId: ID; buildingId: ID; item: ItemType; qty: number }
    | { type: 'tower_warning'; goblinId: ID; enemyId: ID; kind: EnemyKind }
    | { type: 'tool_mended'; goblinId: ID; item: ItemType }
    | { type: 'goblin_transformed'; goblinId: ID }
    // P6.1 health: caught (incubating, unseen), showing symptoms, better again; an outbreak; a friend at the bedside
    | { type: 'caught_disease'; goblinId: ID; disease: string; fromId: ID | null }
    | { type: 'fell_ill'; goblinId: ID; disease: string }
    | { type: 'recovered'; goblinId: ID; disease: string }
    | { type: 'outbreak'; goblinId: ID; disease: string }
    | { type: 'tended'; goblinId: ID; byId: ID }
    // P6.5: a dose of herbal remedy, taken (byId null) or given by a carer
    | { type: 'took_remedy'; goblinId: ID; byId: ID | null; disease: string }
    // P6.2 fire: a wildfire starts (lightning, heat, the god…), a bolt from a storm, a fire put out by goblins
    | { type: 'fire_started'; cause: string }
    | { type: 'lightning_strike' }
    | { type: 'fire_stomped'; goblinId: ID }
    // P6.3: floods and droughts come and go, blight takes a bush (and a farmer cuts one out), a star falls
    | { type: 'flood_started' | 'flood_receded' | 'drought_started' | 'drought_ended'; tiles: number }
    | { type: 'blight_started'; plantId: ID }
    | { type: 'blight_culled'; goblinId: ID; plantId: ID }
    | { type: 'shooting_star' }
    // P7.1 wildlife: a hopper brought down with a sling (or a throw that missed), a hopper at a planted sprout
    | { type: 'critter_hunted'; goblinId: ID; critterId: ID; kind: string; hit: boolean; killed: boolean }
    | { type: 'sprout_nibbled'; plantId: ID; critterId: ID }
    // P7.2: a cast that landed a fish (or didn't), clay dug, raw fish or meat cooked at a campfire
    | { type: 'fish_caught'; goblinId: ID; caught: boolean; first?: boolean }
    | { type: 'clay_dug'; goblinId: ID; qty: number }
    | { type: 'food_cooked'; goblinId: ID; item: ItemType; qty: number; first?: boolean }
    // P7.4: a heap has turned its waste into compost, compost spread on the soil, a stretch of trail paved
    | { type: 'compost_ready'; buildingId: ID; qty: number }
    | { type: 'compost_spread'; goblinId: ID }
    | { type: 'path_paved'; goblinId: ID; tiles: number; first?: boolean }
    | { type: 'zone_marked'; zone: 'materials' }
    // P6.6 powers: the ground shakes, the god's flood, a goblin back from the grave, one brought forth in a beam of light
    | { type: 'earthquake'; r: number }
    | { type: 'god_flood'; tiles: number; r: number }
    | { type: 'resurrected'; goblinId: ID; graveId: ID }
    | { type: 'brought_forth'; goblinId: ID }
    // P6.4: someone grieves, a body is laid to rest (by nobody: covered where it lay), a grave is visited
    | { type: 'grief'; goblinId: ID; deadId: ID }
    | { type: 'buried'; graveId: ID; deadId: ID; byId: ID | null; mourners: number }
    | { type: 'mourned'; goblinId: ID; deadId: ID }
    | { type: 'trait_gained'; goblinId: ID; trait: string }
    | { type: 'sickness'; goblinId: ID; disease: DiseaseId; phase: 'infected' | 'symptomatic' | 'recovered' | 'died' }
    | { type: 'trinket_found'; goblinId: ID; trinket: TrinketKind; rarity: Rarity; at?: Vec2 }
    | { type: 'mood_break'; goblinId: ID; kind: MoodBreakKind; item?: ItemType; at?: Vec2 }
    | { type: 'inspired'; goblinId: ID; at: Vec2 }
    | { type: 'decorated'; goblinId: ID; buildingId: ID; count: number; at: Vec2 }
    | { type: 'trinkets_inherited'; goblinId: ID; fromId: ID; count: number; at: Vec2 }
    | { type: 'glints_washed_up'; count: number }
    | { type: 'trinket_given'; goblinId: ID; toId: ID; trinket: TrinketKind; at: Vec2 }
    | { type: 'festival'; kind: FestivalKind; phase: 'start' | 'end'; at?: Vec2; venueId?: ID | null; came?: number }
    | { type: 'festival_speech'; goblinId: ID; at: Vec2 }
    | { type: 'chief_chosen'; goblinId: ID; previousId: ID | null }
    | { type: 'trade'; aId: ID; bId: ID; gave: ItemStack[]; got: ItemStack[] }
    | { type: 'clan_contact' | 'clan_raid' | 'clan_alliance'; clanA: ID; clanB: ID }
    | { type: 'place_named'; placeId: ID } // P9.2: worded by language where shown (llm/placeNames.ts)
    | { type: 'superstition_formed' | 'superstition_faded'; omen: string; luck: string; valence: number }
    | { type: 'epithet_earned'; goblinId: ID; epithet: string; at: Vec2 }
    | { type: 'divine_act'; act: DivineActKind; targetId?: ID; witnessIds: ID[] }
    | { type: 'landed'; entityId: ID; damage: number; water: boolean }
    | { type: 'emote'; goblinId: ID; emote: Emote }
    | { type: 'god_spoke'; addressees: ID[]; tone: Tone; intents: WishIntent[]; source: 'voice' | 'sign' }
    | { type: 'first_voice'; goblinId: ID }
    | { type: 'prayer'; prayerId: ID; goblinId: ID; kind: PrayerKind; targetId?: ID; desperate?: boolean }
    | { type: 'group_prayer'; goblinId: ID; buildingId: ID }
    | { type: 'offering'; goblinId: ID; buildingId: ID; item: string }
    | { type: 'prayer_answered' | 'prayer_ignored'; prayerId: ID; goblinId: ID; kind: PrayerKind }
    | { type: 'wish_fulfilled' | 'wish_defied'; goblinId: ID; intent: WishIntent }
    | { type: 'converted'; goblinId: ID }
    | { type: 'shaman_chosen'; goblinId: ID; previousId: ID | null }
    | { type: 'god_named'; name: string }
    | { type: 'power_unlocked'; power: PowerId; tier: number }
    | { type: 'tier_changed'; tier: number; from: number }
    | { type: 'command_rejected'; command: string; reason: string }
  );

export type SimEventType = SimEvent['type'];

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
/** An event before the bus stamps the tick on it. */
export type SimEventInput = DistributiveOmit<SimEvent, 'tick'>;
