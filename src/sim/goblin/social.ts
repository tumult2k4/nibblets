/**
 * Relationships (§13.1, P5.1): one-sided opinion (−100..100) and familiarity (0..100) per known goblin, with a bond
 * read off the thresholds (friend ≥ 40, best friend ≥ 75 — at most two —, rival ≤ −40, enemy ≤ −75) unless it is a
 * family bond. Opinion drifts toward 0 without contact (familiarity slows it; grudge holders never forgive), company
 * keeps the social need up, hut-mates warm to each other each night.
 */
import { CFG } from '../config';
import { clamp, dist, q4 } from '../../shared/math';
import type { ID } from '../../shared/types';
import type { Rng } from '../../shared/rng';
import type { Enemy, Goblin, Relation, RelationBond } from '../state';
import type { World } from '../world';

const S = CFG.social;
const FAMILY: ReadonlySet<RelationBond> = new Set(['mate', 'parent', 'child', 'sibling']);
const STRENGTH: Partial<Record<RelationBond, number>> = { none: 0, friend: 1, best_friend: 2, rival: -1, enemy: -2 };

const KIN_BONDS: ReadonlySet<RelationBond> = new Set(['parent', 'child', 'sibling']);
/** Parent, child or sibling: by blood, or by bond (adoption, P5.4). */
export const isKin = (a: Goblin, b: Goblin): boolean =>
  KIN_BONDS.has(relationOf(a, b.id)?.bond ?? 'none') ||
  !!a.parents?.includes(b.id) || !!b.parents?.includes(a.id) || (!!a.parents && !!b.parents && a.parents.some((p) => b.parents!.includes(p)));

export const relationOf = (g: Goblin, id: ID): Relation | undefined => g.relationships.find((r) => r.targetId === id);
export const opinionOf = (g: Goblin, id: ID): number => relationOf(g, id)?.opinion ?? 0;
export const isFriend = (g: Goblin, id: ID): boolean => opinionOf(g, id) >= S.friend;

/** The relation `g` keeps of `id`, created on first contact. */
export function relate(g: Goblin, id: ID): Relation {
  let r = relationOf(g, id);
  if (!r) {
    r = { targetId: id, opinion: 0, familiarity: 0, bond: 'none', lastInteraction: 0 };
    g.relationships.push(r);
  }
  return r;
}

/** Read the bond off the opinion (family bonds stay). Best friends are capped at two: the weakest is demoted. */
function rebond(w: World, g: Goblin, r: Relation): void {
  if (FAMILY.has(r.bond)) return;
  const was = r.bond;
  let b: RelationBond = r.opinion >= S.bestFriend ? 'best_friend' : r.opinion >= S.friend ? 'friend'
    : r.opinion <= S.enemy ? 'enemy' : r.opinion <= S.rival ? 'rival' : 'none';
  if (b === 'best_friend' && was !== 'best_friend') {
    const best = g.relationships.filter((x) => x.bond === 'best_friend');
    if (best.length >= S.maxBestFriends) {
      const weakest = best.reduce((a, x) => (x.opinion < a.opinion ? x : a));
      if (weakest.opinion >= r.opinion) b = 'friend';
      else weakest.bond = 'friend';
    }
  }
  if (b === was) return;
  r.bond = b;
  // news only when a bond deepens (cooling off from best friend to friend, or enemy to rival, is quiet)
  if (Math.abs(STRENGTH[b] ?? 0) > Math.abs(STRENGTH[was] ?? 0) || Math.sign(STRENGTH[b] ?? 0) * Math.sign(STRENGTH[was] ?? 0) < 0)
    w.emit({ type: 'bond_formed', aId: g.id, bId: r.targetId, kind: b as 'friend' | 'best_friend' | 'rival' | 'enemy', at: { ...g.pos } });
}

/** Change how `g` feels about `other`; any contact also builds familiarity. */
export function adjustOpinion(w: World, g: Goblin, other: Goblin, delta: number): void {
  if (g.id === other.id) return;
  const r = relate(g, other.id);
  r.opinion = q4(clamp(r.opinion + delta, -100, 100));
  r.familiarity = q4(clamp(r.familiarity + S.familiarityPerContact + Math.abs(delta) * 0.5, 0, 100));
  r.lastInteraction = w.s.tick;
  rebond(w, g, r);
}

/** Both ways at once (chat, a shared meal, a fight won together). */
export function mutual(w: World, a: Goblin, b: Goblin, delta: number, deltaB = delta): void {
  adjustOpinion(w, a, b, delta);
  adjustOpinion(w, b, a, deltaB);
}

export function addSocial(g: Goblin, amount: number): void {
  g.needs.social = q4(clamp(g.needs.social + amount, 0, 100));
}

/** A meal eaten in company (§13.1): everyone eating within reach warms to the eater, and the eater to them. */
export function sharedMeal(w: World, g: Goblin, bonus = 0): void {
  for (const o of w.goblinHash.query(g.pos, S.mealRange)) {
    if (o.id === g.id || dist(o.pos, g.pos) > S.mealRange || (o.activity.action !== 'eat' && o.activity.action !== 'eat_core')) continue;
    mutual(w, g, o, S.sharedMeal);
    addSocial(g, S.mealSocial + bonus);
    addSocial(o, S.mealSocial + bonus);
  }
}

/**
 * An enemy killed or driven off (§13.1): those who stood against it together grow closer (+8 each way), and the goblin
 * it had its teeth in owes its rescuers (+25).
 */
export function foughtTogether(w: World, e: Enemy, victimId: ID | null): void {
  const side = w.s.goblins.filter((g) => (g.activity.action === 'attack' || g.activity.action === 'defend_village')
    && g.activity.targetId === e.id && dist(g.pos, e.pos) <= S.fightBondRange);
  for (const a of side) for (const b of side) if (a.id < b.id) mutual(w, a, b, S.foughtTogether);
  const victim = victimId !== null ? w.goblin(victimId) : undefined;
  if (victim) for (const f of side) if (f.id !== victim.id) adjustOpinion(w, victim, f, S.saved);
}

/** Founders of one clan (or a band of newcomers) grew up together: they know each other and mostly get along. */
export function seedClanRelations(rng: Rng, gs: Goblin[]): void {
  for (const a of gs) for (const b of gs) {
    if (a === b || a.clanId !== b.clanId) continue;
    const r = relate(a, b.id);
    r.familiarity = S.clanFamiliarity;
    r.opinion = q4(rng.range(S.clanOpinion[0], S.clanOpinion[1])); // below the friend line: no bond yet
  }
}

/**
 * §6 step 16 (social.update): every 10 ticks awake goblins in company refill their social need a little; once a day
 * opinions drift toward 0 without contact, familiarity fades, hut-mates gain +1, and forgotten acquaintances drop.
 */
export function updateSocial(w: World): void {
  const s = w.s;
  if (s.tick % 10 === 0) {
    const per10 = (S.companyPerDay / CFG.time.dayTicks) * 10;
    for (const g of s.goblins) {
      if (g.heldByGod || g.airborne || g.activity.action === 'sleep_home' || g.activity.action === 'sleep_ground') continue;
      for (const o of w.goblinHash.query(g.pos, S.companyRadius))
        if (o.id !== g.id && dist(o.pos, g.pos) <= S.companyRadius && opinionOf(g, o.id) > S.rival) { addSocial(g, per10); break; }
    }
  }
  if (s.tick % CFG.time.dayTicks !== Math.floor(CFG.time.dayTicks * 0.2)) return; // once a day, early morning
  for (const g of s.goblins) {
    const grudge = g.traits.includes('grudge_holder');
    for (const r of g.relationships) {
      if (s.tick - r.lastInteraction < CFG.time.dayTicks) continue;
      const step = S.driftPerDay * Math.max(0.33, 1 - r.familiarity / 150);
      if (r.opinion > 0) r.opinion = q4(Math.max(0, r.opinion - step));
      else if (r.opinion < 0 && !grudge) r.opinion = q4(Math.min(0, r.opinion + step));
      r.familiarity = q4(Math.max(0, r.familiarity - S.familiarityFade));
      rebond(w, g, r);
    }
    g.relationships = g.relationships.filter((r) => FAMILY.has(r.bond) || Math.abs(r.opinion) >= 1 || r.familiarity >= 1);
    // sleeping under one roof (§13.1: +1 a night)
    if (g.homeId !== null)
      for (const o of s.goblins) if (o.id !== g.id && o.homeId === g.homeId) adjustOpinion(w, g, o, S.sameHut);
  }
}
