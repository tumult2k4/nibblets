/**
 * Family (§13.3, P5.3): lineage, kinship, attraction, mates, eggs and hatching. `s.lineage` keeps every goblin that
 * ever lived (parents, name, skin hue, birth and death), so kinship and the family tree survive the dead.
 */
import { CFG } from '../config';
import { dist, hueDelta, q4 } from '../../shared/math';
import { allocId } from '../../shared/ids';
import { fnv1a } from '../../shared/rng';
import type { ID, Vec2 } from '../../shared/types';
import type { Egg, Goblin, LineageEntry, WorldState } from '../state';
import type { World } from '../world';
import { meiosis } from './genetics/genome';
import { express } from './genetics/phenotype';
import { createGoblin } from './goblin';
import { isKin, opinionOf, relate, relationOf } from './social';
import { bondTwins, grantTrait, twinOf } from './traits';
import { buildingDef, isComplete } from '../buildings';
import { foodStores } from '../spoilage';

const F = CFG.family;
const DAY = CFG.time.dayTicks;

/** Remember a goblin in the lineage book (founders, newcomers, hatchlings). */
export function registerLineage(s: WorldState, g: Goblin): void {
  s.lineage[g.id] = { parents: g.parents, name: g.name, hue: q4(express(g.genome, 'skinHue')), born: g.bornTick, died: null };
}

const parentsOf = (s: WorldState, id: ID): readonly ID[] => s.lineage[id]?.parents ?? [];
const grandparentsOf = (s: WorldState, id: ID): ID[] => parentsOf(s, id).flatMap((p) => [...parentsOf(s, p)]);
const shares = (a: readonly ID[], b: readonly ID[]): boolean => a.some((x) => b.includes(x));

/** Too close to mate (§13.3): parent, child, grandparent, sibling or first cousin. */
export function isCloseKin(s: WorldState, a: ID, b: ID): boolean {
  if (a === b) return true;
  const pa = parentsOf(s, a), pb = parentsOf(s, b);
  if (pa.includes(b) || pb.includes(a) || shares(pa, pb)) return true;
  const ga = grandparentsOf(s, a), gb = grandparentsOf(s, b);
  return ga.includes(b) || gb.includes(a) || shares(ga, gb);
}

export const mateOf = (g: Goblin, w: World): Goblin | undefined => {
  const r = g.relationships.find((x) => x.bond === 'mate');
  return r ? w.goblin(r.targetId) : undefined;
};

/** A hut (complete or planned) that has a free bed for one more adult. */
const roomyHome = (g: Goblin, w: World): boolean => {
  const b = g.homeId !== null ? w.s.buildings.find((x) => x.id === g.homeId) : undefined;
  return !!b && b.occupants.length < (buildingDef(b.type)?.capacity ?? 0);
};

/**
 * How drawn `g` is to `o` (0 = not at all): opinion past the mate line, adults both, unmated, not kin, a bed for
 * two; spring ×1.5; and looks — homebodies like a skin hue within 60° of their own, wanderers a very different one.
 */
export function attraction(g: Goblin, o: Goblin, w: World): number {
  if (g.id === o.id || g.lifeStage !== 'adult' || o.lifeStage !== 'adult' || mateOf(g, w) || mateOf(o, w)) return 0;
  const op = relationOf(g, o.id)?.opinion ?? 0;
  if (op < CFG.social.mateThreshold || isCloseKin(w.s, g.id, o.id) || isKin(g, o)) return 0;
  if (!roomyHome(g, w) && !roomyHome(o, w) && g.homeId !== o.homeId) return 0;
  const dh = Math.abs(hueDelta(express(g.genome, 'skinHue'), express(o.genome, 'skinHue')));
  const wander = g.personality.wanderlust > 0.5;
  const looks = (wander ? dh >= F.hueFar : dh <= F.hueNear) ? F.looksMul : 1;
  return q4((op / 100) * looks * (w.clock.season === 'spring' ? F.springMul : 1));
}

/** Two goblins become mates and share one home (the one with room, the courter's first). */
export function becomeMates(w: World, a: Goblin, b: Goblin): void {
  for (const [x, y] of [[a, b], [b, a]] as const) {
    const r = relate(x, y.id);
    r.bond = 'mate';
    r.opinion = Math.max(r.opinion, CFG.social.mateThreshold);
    r.lastInteraction = w.s.tick;
  }
  const [host, guest] = roomyHome(a, w) || a.homeId === b.homeId ? [a, b] : [b, a];
  if (host.homeId !== null && guest.homeId !== host.homeId) {
    for (const old of w.s.buildings) {
      if (!old.occupants.includes(guest.id)) continue;
      old.occupants = old.occupants.filter((id) => id !== guest.id);
      if (old.ownerId === guest.id) old.ownerId = old.occupants[0] ?? null;
    }
    const home = w.s.buildings.find((x) => x.id === host.homeId)!;
    home.occupants.push(guest.id);
    guest.homeId = home.id;
  }
  w.emit({ type: 'bond_formed', aId: a.id, bId: b.id, kind: 'mate', at: { ...a.pos } });
}

/** Today's deterministic fertility roll for a pair (no RNG drawn, so scoring stays side-effect free). */
export function fertileToday(g: Goblin, mate: Goblin, w: World): boolean {
  // lean times (P5.7 balance): with winter coming or here, pairs wait until the stores could carry another mouth
  const c = w.clock;
  const need = c.season === 'autumn' ? F.leanStoreDays : c.season === 'winter' ? CFG.time.daysPerSeason - c.seasonDay + F.leanMargin : 0;
  if (need > 0 && foodStores(w.s).days < need) return false;
  const day = Math.floor(w.s.tick / DAY);
  const pop = w.s.goblins.length + w.s.eggs.length;
  const chance = F.eggChancePerDay * Math.max(0, 1 - pop / CFG.goblin.softCap) * (w.clock.season === 'spring' ? F.springMul : 1);
  const roll = (fnv1a(`${Math.min(g.id, mate.id)}:${day}`, w.s.seed >>> 0) % 10000) / 10000;
  return roll < chance;
}

/** Can this pair have an egg now (§13.3)? Both well fed, home together, past the cooldown, under the soft cap. */
export function canLay(g: Goblin, w: World): Goblin | null {
  const m = mateOf(g, w);
  if (!m || g.lifeStage !== 'adult' || m.lifeStage !== 'adult' || g.homeId === null || m.homeId !== g.homeId) return null;
  const home = w.s.buildings.find((b) => b.id === g.homeId);
  if (!home || !isComplete(home)) return null;
  if (g.needs.hunger <= F.eggHunger || m.needs.hunger <= F.eggHunger) return null;
  const cool = CFG.social.eggCooldownDays * DAY;
  if (w.s.tick - g.lastEggTick < cool || w.s.tick - m.lastEggTick < cool) return null;
  return fertileToday(g, m, w) ? m : null;
}

/** Lay the egg (5 % twins) in the home; the genome is made now, from both parents (§4.3 meiosis). */
export function layEggs(w: World, g: Goblin, m: Goblin, at: Vec2): Egg[] {
  const n = w.rng.chance(F.twinChance) ? 2 : 1;
  const eggs: Egg[] = [];
  for (let i = 0; i < n; i++) {
    const egg: Egg = {
      id: allocId(w.s), pos: { x: q4(at.x + (i ? 0.22 : 0)), y: q4(at.y) }, genome: meiosis(g.genome, m.genome, w.rng),
      parents: [g.id, m.id], laidTick: w.s.tick, warmth: 0.5, incubation: 0, airborne: null,
    };
    eggs.push(egg);
  }
  if (n === 2) { eggs[0]!.twinOf = eggs[1]!.id; eggs[1]!.twinOf = eggs[0]!.id; }
  w.s.eggs.push(...eggs);
  g.lastEggTick = m.lastEggTick = w.s.tick;
  for (const e of eggs) w.emit({ type: 'egg_laid', eggId: e.id, parents: e.parents, at: e.pos });
  return eggs;
}

/** Family bonds start warm (§13.1: +40). */
export function kinBond(w: World, a: Goblin, b: Goblin, bond: 'parent' | 'child' | 'sibling'): void {
  const r = relate(a, b.id);
  r.bond = bond;
  r.opinion = Math.max(r.opinion, F.familyOpinion);
  r.familiarity = Math.max(r.familiarity, F.familyFamiliarity);
  r.lastInteraction = w.s.tick;
}

/** The egg cracks: a hatchling with its parents' clan and home, family bonds, and a place in the lineage. */
export function hatch(w: World, egg: Egg): Goblin {
  const s = w.s;
  s.eggs.splice(s.eggs.indexOf(egg), 1);
  const parents = egg.parents.map((id) => w.goblin(id)).filter((p): p is Goblin => !!p);
  const g = createGoblin(s, w.rng, { genome: egg.genome, pos: egg.pos, ageDays: 0, clanId: parents[0]?.clanId ?? s.clans[0]?.id ?? 0, parents: egg.parents });
  g.lifeStage = 'hatchling';
  g.needs.hunger = g.needs.thirst = 80;
  g.homeId = parents.find((p) => p.homeId !== null)?.homeId ?? null;
  s.goblins.push(g);
  w.goblinHash.insert(g);
  for (const p of parents) { kinBond(w, g, p, 'parent'); kinBond(w, p, g, 'child'); }
  for (const o of s.goblins) if (o !== g && o.parents && shares(o.parents, egg.parents)) { kinBond(w, g, o, 'sibling'); kinBond(w, o, g, 'sibling'); }
  if (egg.twinOf !== undefined) {
    grantTrait(w, g, 'twin');
    const twin = twinOf(g, w);
    if (twin) bondTwins(g, twin);
  }
  registerLineage(s, g);
  if (!parents.length) adoptIfOrphan(w, g);
  s.stats.births += 1;
  w.emit({ type: 'egg_hatched', eggId: egg.id, goblinId: g.id, at: { ...egg.pos } });
  return g;
}

/** Living parents, by bond, so adoptive parents count. */
export const livingParents = (g: Goblin, w: World): Goblin[] =>
  g.relationships.filter((r) => r.bond === 'parent').map((r) => w.goblin(r.targetId)).filter((p): p is Goblin => !!p);

/** The closer living parent of a child. */
export function nearestParent(g: Goblin, w: World): Goblin | undefined {
  let best: Goblin | undefined, bd = Infinity;
  for (const p of livingParents(g, w)) if (dist(p.pos, g.pos) < bd) { bd = dist(p.pos, g.pos); best = p; }
  return best;
}

const young = (g: Goblin): boolean => g.lifeStage === 'hatchling' || g.lifeStage === 'youngling';
const kidsIn = (w: World, homeId: ID): number => w.s.goblins.filter((c) => young(c) && c.homeId === homeId).length;

/** §13.3 orphans: the grown-up who likes the child best (and the child it), with a home that has room for one more. */
function adopter(c: Goblin, w: World): Goblin | undefined {
  let best: Goblin | undefined, bs = -Infinity;
  for (const a of w.s.goblins) {
    if (a.id === c.id || (a.lifeStage !== 'adult' && a.lifeStage !== 'elder')) continue;
    const room = a.homeId !== null && kidsIn(w, a.homeId) < CFG.life.kidsPerHome;
    const sc = opinionOf(a, c.id) + opinionOf(c, a.id) + (room ? 50 : 0) + (mateOf(a, w) ? 10 : 0);
    if (sc > bs) { bs = sc; best = a; }
  }
  return best;
}

/** A child with no living parent is taken in: new parent bonds, the adopter's hut, and the `orphan` trait. */
export function adoptIfOrphan(w: World, c: Goblin): void {
  if (!young(c) || livingParents(c, w).length) return;
  const a = adopter(c, w);
  if (!a) return;
  kinBond(w, c, a, 'parent');
  kinBond(w, a, c, 'child');
  if (a.homeId !== null) c.homeId = a.homeId;
  grantTrait(w, c, 'orphan');
  w.emit({ type: 'adopted', goblinId: c.id, parentId: a.id, at: { ...c.pos } });
}

/** Someone died: any child of theirs left without parents is adopted. */
export function adoptOrphans(w: World, dead: Goblin): void {
  for (const c of w.s.goblins) if (relationOf(c, dead.id)?.bond === 'parent') adoptIfOrphan(w, c);
}

/**
 * Coming of age (§4.4): children sleep in the family hut without a bed of their own; a new adult takes a free bed
 * there, or else moves out (ClaimHome then finds or plans one).
 */
export function comeOfAge(w: World, g: Goblin): void {
  const b = g.homeId !== null ? w.s.buildings.find((x) => x.id === g.homeId) : undefined;
  if (!b || b.occupants.includes(g.id)) return;
  if (b.occupants.length < (buildingDef(b.type)?.capacity ?? 0)) b.occupants.push(g.id);
  else g.homeId = null;
}

/** A parent's body on the egg: sitting on it, or asleep right beside it (§13.3). */
export function bodyWarm(w: World, egg: Egg): boolean {
  for (const id of egg.parents) {
    const p = w.goblin(id);
    if (p && dist(p.pos, egg.pos) <= F.bodyRange && (p.activity.action === 'incubate_egg' || p.activity.action === 'sleep_home')) return true;
  }
  return false;
}

export type { LineageEntry };
