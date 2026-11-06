/**
 * Knowledge (§15.1, P5.5): recipes and cultural facts live in goblins' heads. A recipe nobody starts with is
 * **discovered** (an hourly roll while its inputs are within reach), then **taught** (`Teach`) or **observed** (2 %
 * for each craft or building watched from within 4 tiles; younglings twice as likely). Facts are learned the hard way
 * (eating a redcap) or by seeing it happen (a Gnasher backing off from fire), and taught like recipes. The village
 * knows what its living goblins know: when the last knower dies, the knowledge is lost (`recipe_lost`).
 */
import { CFG } from './config';
import { dist } from '../shared/math';
import type { ID, ItemType, LearnVia, RecipeId, Vec2 } from '../shared/types';
import type { Rng } from '../shared/rng';
import type { Goblin, WorldState } from './state';
import type { World } from './world';
import { RECIPES, STARTER_RECIPES } from './recipes';
import { isSleeping } from './goblin/goblin';
import { skillLevel } from './goblin/skills';
import { addMood } from './goblin/mood';
import { countItem } from './inventory';
import { stockCount } from './stockpile';
import { atStore } from './commons';
import { mushroomItem } from './ecology';
import { nextSpan, wornTiles } from './roads';
import { placeIdea } from './shrine';

const K = CFG.knowledge;
const PRESERVE_IDS: ReadonlySet<string> = new Set(['grinding_stone', 'drying_rack', 'storage_pit']);

export type FactId = 'redcap_is_poison' | 'gnashers_fear_fire' | 'blight_spreads';
/** Cultural facts (§15.1). `blight_spreads` (P6.3) is learned by watching a blighted bush die, never inherited. */
export const FACTS: readonly FactId[] = ['redcap_is_poison', 'gnashers_fear_fire', 'blight_spreads'];
/** What founders may grow up knowing. */
export const FOUNDER_FACTS: readonly FactId[] = ['redcap_is_poison', 'gnashers_fear_fire'];
const isFact = (id: string): id is FactId => (FACTS as readonly string[]).includes(id);

export const knowsFact = (g: Goblin, f: FactId): boolean => g.knownFacts.includes(f);
/** Does `g` know this recipe or fact? */
export const knowsAny = (g: Goblin, id: string): boolean => (isFact(id) ? g.knownFacts : g.knownRecipes).includes(id);
/** Recipes and facts `g` could pass on (the basics everyone grows up with don't need teaching). */
export const teachable = (g: Goblin): string[] => [...g.knownRecipes.filter((id) => !STARTER_RECIPES.includes(id)), ...g.knownFacts];

/** Recipes nobody starts with: found by discovery, then passed on. */
export const DISCOVERABLE: readonly RecipeId[] = Object.keys(RECIPES).filter((id) => !RECIPES[id]!.known);

/** Founders grew up with their clan's lore: each knows each fact with a 70 % chance. */
export function seedFacts(rng: Rng, g: Goblin): void {
  for (const f of FOUNDER_FACTS) if (rng.chance(K.founderFactChance)) g.knownFacts.push(f);
}

/** `g` now knows `id`. False if it already did. */
export function learn(w: World, g: Goblin, id: string, via: LearnVia, byId?: ID): boolean {
  if (knowsAny(g, id)) return false;
  (isFact(id) ? g.knownFacts : g.knownRecipes).push(id);
  const lost = w.s.village.lost, recovered = !!lost?.includes(id);
  if (recovered) w.s.village.lost = lost!.filter((x) => x !== id);
  w.emit({ type: via === 'discovery' ? 'recipe_discovered' : 'recipe_learned', goblinId: g.id, recipe: id, via, ...(byId !== undefined ? { byId } : {}), ...(recovered ? { recovered } : {}), at: { ...g.pos } });
  return true;
}

/** How many living goblins know `id`. */
export const knowers = (s: WorldState, id: string): number => s.goblins.reduce((n, g) => n + (knowsAny(g, id) ? 1 : 0), 0);

/** The village's knowledge beyond the basics (§15.1): every recipe and fact anyone alive knows, with its knower count. */
export function villageKnowledge(s: WorldState): { id: string; fact: boolean; knowers: number }[] {
  const n = new Map<string, number>();
  for (const g of s.goblins) for (const id of teachable(g)) n.set(id, (n.get(id) ?? 0) + 1);
  const order = [...DISCOVERABLE, ...FACTS] as string[];
  return [...n].map(([id, k]) => ({ id, fact: isFact(id), knowers: k })).sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
}

/** A goblin died: whatever only it knew is gone. */
export function loseKnowledge(w: World, dead: Goblin): void {
  for (const id of teachable(dead)) {
    if (knowers(w.s, id)) continue;
    (w.s.village.lost ??= []).push(id);
    w.emit({ type: 'recipe_lost', goblinId: dead.id, recipe: id, at: { ...dead.pos } });
  }
}

/**
 * 0..1: the share of a recipe's input kinds (and `near` hints, e.g. apples for a drying rack) within reach: own
 * pack, the stockpile within 5, the ground within 3 (P6.5: mushrooms growing there, and berries on a bush). One of the
 * inputs must be in hand — or, for something built on a site (a drying rack), the goblin must be at the stockpile,
 * looking at it all; or (P6.5) it remembers where the recipe's `idea` grows. `recalled`: kinds that are only
 * remembered (a glowcap it saw growing somewhere): they count, but make the idea `memoryNear` times as likely each.
 */
export function inputsNear(g: Goblin, w: World, id: RecipeId): number {
  return nearness(g, w, id).share;
}
function nearness(g: Goblin, w: World, id: RecipeId): { share: number; recalled: number } {
  const inputs = Object.keys(RECIPES[id]?.inputs ?? {}) as ItemType[];
  const kinds = [...inputs, ...(RECIPES[id]?.near ?? [])];
  let held = false, n = 0, recalled = 0;
  const idea = RECIPES[id]?.idea;
  // a ring of stones to play in comes to mind while playing (P8.5), wherever the stones are
  if (id === 'music_circle') return { share: g.activity.action === 'play_music' && g.activity.stage === 1 ? 1 : 0, recalled: 0 };
  // P8.6: a shrine to a goblin with a trinket and some faith, a totem to one in war paint
  if (id === 'shrine' || id === 'totem' || id === 'temple') return { share: placeIdea(g, w, id), recalled: 0 }; // P8.8: the temple at prayer
  // P9.5: a shelf for books comes to mind of one who knows enough to want it kept
  if (id === 'library_shelf') return { share: teachable(g).length >= CFG.books.minKnown && w.s.goblins.length >= CFG.books.shelf.pop ? 1 : 0, recalled: 0 };
  const atStock = atStore(w.s, g.pos, K.stockReach);
  if (atStock && RECIPES[id]?.station === 'site') held = true;
  for (const t of kinds) {
    if (countItem(g, t) > 0) { held ||= inputs.includes(t); n++; }
    else if ((atStock && stockCount(w.s, t) > 0) || w.itemHash.nearest(g.pos, K.groundReach, (it) => it.stack.type === t && !it.airborne)) n++;
    else if (w.s.mushrooms.some((m) => mushroomItem(m) === t && dist(m.pos, g.pos) <= K.groundReach)) { held ||= idea === t; n++; }
    else if (t === 'berry' && w.plantHash.query(g.pos, K.groundReach).some((p) => p.kind === 'berry_bush' && p.fruit > 0 && dist(p.pos, g.pos) <= K.groundReach)) n++;
    else if (g.memory.some((e) => e.kind === 'mushroom' && w.s.mushrooms.some((m) => m.id === e.targetId && mushroomItem(m) === t))) { held ||= idea === t; n++; recalled++; }
  }
  return { share: held ? n / kinds.length : 0, recalled };
}

/** Food that has rotted in the village since dawn. */
const spoiledToday = (w: World): number => Object.values(w.s.village.spoiled ?? {}).reduce((a, b) => a + (b ?? 0), 0);

/** Inspired goblins (the god's gift, P5.9) have ideas three times as often. */
const inspiration = (g: Goblin): number => (g.mood.modifiers.some((m) => m.id === 'inspired') ? K.inspiredMul : 1);

/** Chance per hour that `g` works out recipe `id` (0 when the inputs aren't at hand). */
export function discoveryChance(g: Goblin, w: World, id: RecipeId): number {
  // the `--no-preserve` balance control: nobody ever thinks of putting food by
  if (!CFG.preserve.enabled && PRESERVE_IDS.has(id)) return 0;
  const after = RECIPES[id]?.after;
  if (after && !w.s.buildings.some((b) => b.type === after && b.buildProgress >= 1)) return 0;
  const { share: near, recalled } = nearness(g, w, id);
  if (near < K.minNear) return 0;
  const skill = skillLevel(g, RECIPES[id]?.skill ?? 'crafting');
  // food going off before their eyes puts goblins in mind of keeping it (P5.6)
  const rot = PRESERVE_IDS.has(id) ? 1 + Math.min(CFG.preserve.rotIdeaMax, spoiledToday(w) * CFG.preserve.rotIdeaPer) : 1;
  // a cure is on everyone's mind, and the more so while someone lies ill (P6.5)
  const ill = id !== 'herbal_remedy' ? 1 : CFG.health.remedyIdeaBase * (w.s.goblins.some((o) => o.health.disease?.stage === 'sick') ? CFG.health.remedyIdeaMul : 1);
  // a hopper bounding about puts a goblin with a feather in mind of a sling (P7.1)
  const HU = CFG.wildlife.hunt;
  const FI = CFG.economy.fishing;
  const prey = id === 'sling' && w.s.wildlife.some((c) => c.kind === 'hopper' && dist(c.pos, g.pos) <= HU.ideaRange) ? HU.ideaNear
    // and a fish leaping by the shore, of a rod (P7.2)
    : id === 'fishing_rod' && w.s.wildlife.some((c) => c.kind === 'fish' && dist(c.pos, g.pos) <= FI.ideaRange) ? FI.ideaNear : 1;
  // worn trails put a goblin in mind of paving them, water worth crossing of a bridge (P7.4)
  const BR = CFG.garden.bridge;
  const road = id === 'stone_path' ? (wornTiles(w.s).length >= BR.trails ? BR.ideaWith : BR.ideaWithout)
    : id === 'bridge' ? (nextSpan(w.s) ? BR.ideaWith : BR.ideaWithout)
    : id === 'music_circle' ? CFG.festivals.music.circleIdea
    : id === 'shrine' ? CFG.beliefs.shrine.idea * (0.5 + g.personality.piety) : id === 'totem' ? CFG.beliefs.totem.idea
    : id === 'temple' ? CFG.faith.temple.idea
    : id === 'library_shelf' ? CFG.books.shelf.idea * (w.s.village.lost?.length ? CFG.books.shelf.lostMul : 1) : 1;
  return K.discoveryBase * (0.5 + g.personality.wanderlust) * (1 + K.skillMul * skill) * inspiration(g) * near * rot * ill * prey * road * K.memoryNear ** recalled;
}

/** §6 step 12b: once an in-game hour per goblin (staggered), a roll to discover something new. */
export function updateKnowledge(w: World): void {
  const H = CFG.god.hourTicks;
  for (const g of w.s.goblins) {
    if ((w.s.tick + g.id * 7) % H !== 0 || g.lifeStage === 'hatchling' || isSleeping(g) || g.heldByGod || g.airborne) continue;
    for (const id of DISCOVERABLE) {
      if (knowsAny(g, id)) continue;
      const p = discoveryChance(g, w, id);
      if (p <= 0 || !w.rng.chance(p)) continue;
      learn(w, g, id, 'discovery');
      addMood(w, g, 'discovery', K.discoveryMood, CFG.time.dayTicks);
      w.emit({ type: 'emote', goblinId: g.id, emote: 'idea' });
      break;
    }
  }
}

/** Awake onlookers within `r` of `at` (not `except`) who don't know `id` yet. */
function onlookers(w: World, at: Vec2, r: number, id: string, except?: Goblin): Goblin[] {
  return w.goblinHash.query(at, r).filter((o) => o !== except && o.lifeStage !== 'hatchling' && !isSleeping(o) && !o.heldByGod && dist(o.pos, at) <= r && !knowsAny(o, id));
}

/** Someone finished `id` (a craft or a building): onlookers may pick it up; younglings, and anyone watching on purpose, more often. */
export function observe(w: World, id: RecipeId, at: Vec2, worker?: Goblin): void {
  for (const o of onlookers(w, at, K.observeRange, id, worker)) {
    let p = K.observeChance * (o.lifeStage === 'youngling' ? K.younglingLearnMul : 1);
    if (worker && o.activity.action === 'learn' && o.activity.targetId === worker.id) p *= 2;
    if (w.rng.chance(p)) learn(w, o, id, 'observe', worker?.id);
  }
}

/** A fact shown by what happened at `at`: `subject` learns it the hard way, onlookers within sight with `chance`. */
export function witnessFact(w: World, f: FactId, at: Vec2, chance: number, subject?: Goblin): void {
  if (subject) learn(w, subject, f, 'experience');
  for (const o of onlookers(w, at, K.witnessRange, f, subject)) if (w.rng.chance(chance)) learn(w, o, f, 'observe', subject?.id);
}
