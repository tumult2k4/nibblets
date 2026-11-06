/**
 * Divine mode (§17.6, §17.9, P8.9), reached as CFG.divine: the tiers that unlock the powers, what the Gift Tray, the
 * brushes and the voice cost, and how a spoken or signed wish bends what a goblin does. Voice costs, wish strength
 * and duration live with the god (CFG.god); ticks are sim ticks (a day is 3600).
 */
import type { ActionId } from '../state';
import type { ItemType, WishIntent } from '../../shared/types';

/** What tier n needs (and everything below it needs too): believers (faith ≥ CFG.god.believerFaith), a finished
 * shrine or temple, the village's average faith. */
export interface TierReq { believers?: number; shrine?: boolean; temple?: boolean; faith?: number }

export const DIVINE = {
  tiers: [{}, { believers: 3 }, { believers: 6, shrine: true }, { believers: 10, faith: 50 }, { believers: 15, temple: true }, { faith: 75 }] as TierReq[],
  /** Gift Tray (§18.5): tier 0 drops only these; tier 1 all food, materials and life; the Tools tab from `toolsTier` */
  giftTier0: ['apple', 'wood', 'stone'] as ItemType[], giftTier: 1, toolsTier: 2,
  /** a brush stroke tick costs costPerTile × tiles under it × `strokeShare` (a second of painting pays the table's
   * per-tile price once) */
  strokeShare: 0.1,
  /** the voice reaches one goblin from tier 0 (signs) or 1 (voice), a group from `groupTier`, everyone from `allTier` */
  voiceTier: 1, groupTier: 2, allTier: 3, maxIntents: 2,
  /** what hearing the god does (§17.7.2): faith (more the first time), love/fear/fun by tone */
  heard: { faith: 12, first: 20 },
  tone: {
    kind: { love: 6, faith: 0, fear: 0, fun: 0 }, stern: { love: 0, faith: 4, fear: 4, fun: 0 },
    wrathful: { love: -4, faith: 0, fear: 12, fun: 0 }, playful: { love: 4, faith: 0, fear: 0, fun: 10 },
  },
  /** kneels when fear is above `kneel`, dances when love is above `dance` */
  kneel: 60, dance: 70,
  /** a wish kept: faith/love; a defied wish lasts `defyShare` of its time and halves the matching actions' scores */
  fulfilled: { faith: 5, love: 3 }, defyShare: 0.5, defyMul: 0.5,
  /** a wish is ignored while a need's urgency is over `survival` (a starving goblin eats first) */
  survival: 0.85,
  /** obedience × wrathful god */
  wrathObey: 1.2,
  /** come here: reached within `near` tiles; avoid: a zone of `avoidR` tiles only the addressees shun */
  near: 3, avoidR: 6,
  /** a build wish pushes a planner goal on an addressee at least this obedient (and marks out a blueprint if none) */
  goalStrength: 0.2,
  /** a lower tier holds `relockHours` before the top tier locks again */
  relockHours: 6,
} as const;

export const WISH_INTENTS: readonly WishIntent[] = [
  'gather', 'build', 'plant', 'guard', 'fight', 'hide', 'avoid', 'share_food', 'stop', 'make_peace', 'rest', 'explore', 'come_here',
  'worship', 'celebrate', 'teach', 'tend', 'court', 'move_home', 'eat', 'leave_alone',
];
/** Wishes kept by not doing something: fulfilled when they run out unbroken. */
export const KEEP_WISHES: readonly WishIntent[] = ['avoid', 'leave_alone'];

/** The actions a wish favors (§17.6 wishMatches). */
export const WISH_ACTIONS: Partial<Record<WishIntent, readonly ActionId[]>> = {
  gather: ['harvest_fruit', 'chop', 'mine', 'forage', 'cut_grass', 'dig_clay', 'fish', 'hunt', 'gather_for_goal', 'haul_to_stockpile'],
  build: ['build', 'deliver_material', 'plan_building', 'repair_building'],
  plant: ['plant_seed', 'water_plant'],
  guard: ['guard', 'defend_village'],
  fight: ['attack', 'defend_village', 'hunt'],
  hide: ['seek_shelter', 'sleep_home'],
  share_food: ['gift', 'feed_child'],
  make_peace: ['apologize', 'comfort', 'chat'],
  rest: ['sleep_home', 'sleep_ground', 'rest_sick', 'idle'],
  explore: ['explore', 'wander', 'follow_wisp', 'hunt_trinket'],
  come_here: ['wander'],
  worship: ['pray', 'make_offering', 'lead_prayer'],
  celebrate: ['dance', 'play_music', 'join_festival', 'play'],
  teach: ['teach', 'learn'],
  tend: ['tend_sick', 'water_plant', 'tend_fire', 'tend_compost', 'spread_compost', 'cull_blight', 'repair_building'],
  court: ['court', 'lay_egg'],
  move_home: ['claim_home'],
  eat: ['eat', 'eat_core'],
};
/** The actions a wish frowns on (scores × (1 − strength)); `stop` frowns on whatever the goblin was doing. */
export const WISH_AGAINST: Partial<Record<WishIntent, readonly ActionId[]>> = {
  hide: ['explore', 'wander', 'hunt_trinket'],
  share_food: ['steal', 'binge'],
  make_peace: ['brawl', 'prank', 'steal'],
  leave_alone: ['prank', 'steal', 'brawl'],
  rest: ['explore', 'wander'],
};
/** Gather what: the actions that bring it in. */
export const GATHER_FOR: Partial<Record<ItemType, readonly ActionId[]>> = {
  wood: ['chop'], stick: ['chop'], stone: ['mine'], flint: ['mine'], fiber: ['cut_grass'], clay: ['dig_clay'],
  fish: ['fish'], apple: ['harvest_fruit'], berry: ['forage'], mushroom: ['forage'], meat: ['hunt'],
};
