/**
 * Mischief, theft and reputation (§13.5–13.6, P8.3): who would steal and from whom (temptation), who saw it
 * (witnesses), what follows (opinions, grudges, the victim's anger, hearsay in chats), owning up (apologies), what a
 * prank does to both sides, how a brawl ends, and reputation: what the village thinks of a goblin's deeds (building
 * for all, beating enemies, gifts, teaching; theft, cowardice, tantrums, brawls). Justice by a chief comes with P8.4.
 */
import { CFG } from './config';
import { clamp, dist, q4 } from '../shared/math';
import type { ID, ItemType, Vec2 } from '../shared/types';
import type { Building, Goblin, Guilt, Trinket } from './state';
import type { World } from './world';
import { addMood } from './goblin/mood';
import { adjustOpinion, mutual, opinionOf } from './goblin/social';
import { remember } from './goblin/memory';
import { isSleeping } from './goblin/goblin';
import { needUrgency } from './goblin/needs';
import { grantTrait } from './goblin/traits';
import { addItem, canCarry, takeOne } from './inventory';
import { isFood } from './items';
import { carried, passTrinket, trinketValue } from './trinkets';

const X = CFG.mischief, TH = X.theft, P = X.prank, A = X.apology, B = X.brawl, R = X.reputation, DAY = CFG.time.dayTicks;

export const greedOf = (g: Goblin): number => (g.personality.mischief + g.personality.gluttony) / 2 + (g.traits.includes('hoarder') ? 0.2 : 0);
/** A cooldown flag (a zero mood modifier) still running. */
export const resting = (g: Goblin, w: World, id: string): boolean => g.mood.modifiers.some((m) => m.id === id && m.expiresTick > w.s.tick);
export const rest = (w: World, g: Goblin, id: string, days: number): void => addMood(w, g, id, 0, Math.round(days * DAY));
const count = (g: Goblin, k: 'stolen' | 'robbed' | 'pranks' | 'pranked' | 'brawls'): number => (g.deeds[k] = (g.deeds[k] ?? 0) + 1);

// ---------------------------------------------------------------- reputation

export function addReputation(g: Goblin, delta: number): void {
  g.reputation = q4(clamp(g.reputation + delta, -100, 100));
}

/** Once a day: reputation eases toward 0 (deeds are remembered, but not forever); old wrongs nobody owned up to are let go. */
export function updateReputation(w: World): void {
  if (w.s.tick % DAY !== Math.floor(DAY * 0.21)) return;
  for (const g of w.s.goblins) {
    if (g.reputation) g.reputation = q4(g.reputation * (1 - R.decay));
    if (g.guilt?.length) g.guilt = g.guilt.filter((gu) => !gu.settled && w.s.tick - gu.tick < A.withinDays * 2 * DAY);
  }
}

/** An adult with a weapon running from a fight others are in (§13.6: cowardice). */
export function cowardice(w: World, g: Goblin): void {
  if (g.lifeStage !== 'adult' || !g.equipped.hand) return;
  const fighting = w.s.goblins.some((o) => o !== g && (o.activity.action === 'attack' || o.activity.action === 'defend_village') && dist(o.pos, g.pos) < 10);
  if (!fighting || resting(g, w, 'coward_rest')) return;
  addReputation(g, R.coward);
  rest(w, g, 'coward_rest', 0.5); // once for a fight, not for every step back
}

// ---------------------------------------------------------------- theft

const openMemo = new WeakMap<World, { tick: number; homes: Building[] }>();
/** Built homes with the whole household out (more than `ownerAway` from the door), worked out once a tick. */
export function openHomes(w: World): Building[] {
  const c = openMemo.get(w);
  if (c && c.tick === w.s.tick) return c.homes;
  const pos = new Map(w.s.goblins.map((g) => [g.id, g.pos]));
  const homes = w.s.buildings.filter((b) => b.buildProgress >= 1 && b.occupants.length > 0
    && b.occupants.every((id) => { const p = pos.get(id); return !p || dist(p, b.pos) > TH.ownerAway; }));
  openMemo.set(w, { tick: w.s.tick, homes });
  return homes;
}

/** How strict the village is about theft (P8.4: a chief's policy changes it). */
export const lawOf = (w: World): number => w.s.village.policies?.law ?? TH.law;

/** The most `g` could be tempted by anyone (its worst grudge, the dearest trinket): below the line, no need to look. */
export function temptable(g: Goblin, w: World): boolean {
  const worst = g.relationships.reduce((m, r) => Math.min(m, r.opinion), 0);
  return needUrgency(g.needs.hunger) * 0.6 + greedOf(g) * 0.4 + g.personality.mischief * 0.3 + Math.max(0, -worst / 100) * 0.3 - lawOf(w) + 0.2 >= TH.minTemptation;
}

/** How badly `g` wants to take from `victim` (0..1): want of food, greed, mischief, dislike, less the village's law. */
export function temptation(g: Goblin, victim: Goblin | null, food: boolean, w: World): number {
  const need = food ? needUrgency(g.needs.hunger) : 0;
  const dislike = victim ? Math.max(0, -opinionOf(g, victim.id) / 100) : 0;
  return clamp(need * 0.6 + greedOf(g) * 0.4 + g.personality.mischief * 0.3 + dislike * 0.3 - lawOf(w), 0, 1);
}

/** Awake goblins who can see `pos` (not `except`). */
export function witnessesOf(w: World, pos: Vec2, except: readonly ID[]): Goblin[] {
  return w.goblinHash.query(pos, TH.vision).filter((o) => !except.includes(o.id) && !isSleeping(o) && !o.heldByGod && o.lifeStage !== 'egg'
    && o.lifeStage !== 'hatchling' && dist(o.pos, pos) <= TH.vision);
}

/**
 * `thief` has taken `item` (or trinket `t`) from `victim`. Witnesses think less of it and remember; with a witness
 * the victim learns who (the news travels) and is angry; without one it only finds the thing gone later.
 */
export function theft(w: World, thief: Goblin, victim: Goblin | null, item: ItemType | null, t: Trinket | null, at: Vec2): void {
  const seen = witnessesOf(w, at, [thief.id]);
  for (const o of seen) {
    adjustOpinion(w, o, thief, TH.witnessOpinion);
    remember(o, w, 'thief', at, victim?.id ?? -1, thief.id);
  }
  if (seen.length) addReputation(thief, R.theft);
  const known = !!victim && seen.length > 0;
  (thief.guilt ??= []).push({ victimId: victim?.id ?? -1, ...(t ? { trinketId: t.id } : item ? { item } : {}), tick: w.s.tick, known: false });
  if (victim && known) victimKnows(w, victim, thief);
  else if (victim) {
    const home = victim.homeId !== null ? w.s.buildings.find((b) => b.id === victim.homeId) : undefined;
    if (home) (home.data ??= {}).missing = (home.data.missing ?? 0) + 1; // found gone when it gets home
  }
  count(thief, 'stolen');
  if (victim && count(victim, 'robbed') >= X.grudge.robbed) grantTrait(w, victim, 'grudge_holder');
  w.emit({ type: 'theft', thiefId: thief.id, victimId: victim?.id ?? null, ...(item ? { item } : {}), witnessIds: seen.map((o) => o.id), ...(t ? { trinket: t.kind } : {}), at: { ...at } });
}

/** The victim learns who robbed it: −25 opinion, angry for two days, and the thief's guilt is known. */
export function victimKnows(w: World, victim: Goblin, thief: Goblin): void {
  adjustOpinion(w, victim, thief, TH.discovered);
  addMood(w, victim, 'robbed', TH.robbedMood, TH.robbedDays * DAY);
  for (const gu of thief.guilt ?? []) if (gu.victimId === victim.id) gu.known = true;
}

/** Hearsay (a chat's gossip): the listener now knows `thiefId` for a thief; the thief's name suffers for it. */
export function heardOfTheft(w: World, listener: Goblin, thiefId: ID, victimId: ID): void {
  const thief = w.goblin(thiefId);
  if (!thief || thief === listener) return;
  adjustOpinion(w, listener, thief, TH.hearsayOpinion);
  addReputation(thief, R.theft);
  if (listener.id === victimId && (thief.guilt ?? []).some((gu) => gu.victimId === victimId && !gu.known && !gu.settled)) victimKnows(w, listener, thief);
}

/** Lying down at home: something missing from the shelf or pantry (no idea who), a mushroom in the bed, berry paint on the walls. */
export function noticeHome(w: World, g: Goblin, home: Building): void {
  const d = home.data;
  if (!d) return;
  if (d.missing) { delete d.missing; addMood(w, g, 'robbed', TH.missingMood, TH.missingDays * DAY); }
  if (d.mushroom) { delete d.mushroom; addMood(w, g, 'mushroom_bed', P.mushroomMood, P.victimDays * DAY); count(g, 'pranked'); }
  if (d.painted && d.painted > w.s.tick && !d.paintSeen) { d.paintSeen = 1; addMood(w, g, 'painted_home', P.paintMood, P.paintDays * DAY); count(g, 'pranked'); }
}

// ---------------------------------------------------------------- pranks

/**
 * A prank has come off (§13.5). The victim, if it knows, thinks less of the prankster (or more, when it is a joker
 * itself and finds it funny) and is put out for half a day; the prankster has the time of its life.
 */
export function prankLanded(w: World, g: Goblin, o: Goblin, kind: string, at: Vec2, knows: boolean): void {
  const funny = o.personality.mischief > P.funnyMischief;
  const seen = witnessesOf(w, at, [g.id, o.id]);
  if (knows || seen.length) adjustOpinion(w, o, g, funny ? P.funnyOpinion : P.victimOpinion);
  if (knows && !funny) addMood(w, o, 'pranked', P.victimMood, P.victimDays * DAY);
  if (knows && count(o, 'pranked') >= X.grudge.pranked) grantTrait(w, o, 'grudge_holder');
  addMood(w, g, 'prank_fun', P.prankerMood, P.prankerDays * DAY);
  g.needs.fun = q4(clamp(g.needs.fun + P.prankerFun, 0, 100));
  if (seen.length) addReputation(g, R.prank);
  count(g, 'pranks');
  rest(w, g, 'prank_rest', P.restDays);
  w.emit({ type: 'prank', prankerId: g.id, targetId: o.id, kind, at: { ...at } });
}

// ---------------------------------------------------------------- owning up

/** A wrong `g` owes an apology for: known to the victim, not made right, half a day to four days old (or ordered by the chief). */
export function owed(g: Goblin, w: World): Guilt | undefined {
  const t = w.s.tick, kind = g.personality.sociability >= A.minSociability;
  return (g.guilt ?? []).find((gu) => gu.known && !gu.settled && !!w.goblin(gu.victimId)
    && (gu.ordered || (kind && t - gu.tick >= A.afterDays * DAY && t - gu.tick < A.withinDays * DAY)));
}

/** Sorry: the thing back if `g` still has it (or food for food, or its least treasure), +15 opinion, the anger eased. */
export function makeAmends(w: World, g: Goblin, o: Goblin, gu: Guilt): boolean {
  let returned = false;
  const t = gu.trinketId !== undefined && g.trinkets.includes(gu.trinketId) ? w.s.trinkets.find((x) => x.id === gu.trinketId) : undefined;
  if (t) { passTrinket(w, t, g, o); returned = true; }
  else if (gu.item && isFood(gu.item) && g.inventory.some((s) => isFood(s.type) && s.type !== 'apple_core') && canCarry(o, gu.item)) {
    const st = takeOne(g, (s) => s.type === gu.item) ?? takeOne(g, (s) => isFood(s.type) && s.type !== 'apple_core');
    if (st) { addItem(o, st); returned = st.type === gu.item; }
  } else {
    const gift = carried(g, w).sort((a, b) => trinketValue(g, a) - trinketValue(g, b))[0];
    if (gift) passTrinket(w, gift, g, o);
  }
  adjustOpinion(w, o, g, A.opinion);
  o.mood.modifiers = o.mood.modifiers.filter((m) => m.id !== 'robbed');
  addReputation(g, A.reputation);
  gu.settled = true;
  w.emit({ type: 'apology', goblinId: g.id, toId: o.id, returned, at: { ...o.pos } });
  return returned;
}

// ---------------------------------------------------------------- brawls

/** How much `g` would like to hit `o` (0..1): loathing past −50, a theft it knows of and was not made right, temper. */
export function angerAt(g: Goblin, o: Goblin, w: World): number {
  const loath = clamp((-opinionOf(g, o.id) - 50) / 50, 0, 1);
  const wronged = (o.guilt ?? []).some((gu) => gu.victimId === g.id && gu.known && !gu.settled && w.s.tick - gu.tick < TH.robbedDays * DAY) ? B.wronged : 0;
  return q4(clamp((loath + wronged) * (0.5 + g.personality.bravery) * (g.mood.value < 0 ? 1.2 : 0.8), 0, 1));
}

/** A blow in a brawl: never below half health. */
export function blow(g: Goblin): void {
  g.health.hp = q4(Math.max(g.health.hp - B.damage, Math.min(g.health.hp, g.health.maxHp * B.hpFloor)));
}

/** The brawl is over: both sore and sorer at each other, a bruise maybe, and any theft between them counts as paid back. */
export function brawlEnded(w: World, a: Goblin, b: Goblin, by: Goblin | null): void {
  mutual(w, a, b, B.opinion, B.opinion);
  for (const [x, y] of [[a, b], [b, a]] as const) {
    addMood(w, x, 'brawled', B.mood, B.moodDays * DAY);
    addReputation(x, R.brawl);
    count(x, 'brawls');
    rest(w, x, 'brawl_rest', B.restDays);
    for (const gu of y.guilt ?? []) if (gu.victimId === x.id) gu.settled = true;
    if (w.rng.chance(B.bruiseChance) && !x.health.injuries.some((i) => i.kind === 'bruised_arm')) {
      x.health.injuries.push({ kind: 'bruised_arm', until: w.s.tick + CFG.combat.injuryDays * DAY });
      w.emit({ type: 'injured', goblinId: x.id, injury: 'bruised_arm', at: { ...x.pos } });
    }
    if (by) adjustOpinion(w, x, by, 3);
  }
  w.emit({ type: 'brawl', aId: a.id, bId: b.id, ...(by ? { brokenUpBy: by.id } : {}), at: { ...a.pos } });
}
