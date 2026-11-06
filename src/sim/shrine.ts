/**
 * The shrine, the temple and the totem (§11.1, P8.6; the temple P8.8). The shrine (4 stone, and a trinket laid on it by the first to pray there)
 * is where the pious `Pray`, and the place the village's superstitions gather round; the totem (3 wood and a pot of war
 * paint) is the village's mark: within 8 tiles danger weighs less and goblins feel safer. Their ideas come from what a
 * goblin has about it: a trinket and some faith for the shrine, war paint on its face for the totem. The temple (12
 * stone, 6 wood) is consecrated by two trinkets laid in it; prayer near it earns favor ×1.5 (§17.4). Its idea comes
 * to the shaman or the very faithful at prayer; it is wanted once a shrine stands, the village is ten strong and two
 * seasons old, and four believe (without the god at work, faith fades and no temple is raised).
 * Offerings beyond a shrine's first trinket (or a temple's two) are taken by the god a day later (favor.ts).
 */
import { CFG } from './config';
import { dist } from '../shared/math';
import type { Vec2 } from '../shared/types';
import type { Building, Goblin } from './state';
import type { World } from './world';
import { isComplete, missingMaterials } from './buildings';
import { countItem } from './inventory';
import { stockCount } from './stockpile';
import { carried } from './trinkets';
import { beliefMul } from './superstitions';
import { faithOf } from './god/faithState';
import { believers, offeringValue } from './god/favor';
import { foodStores } from './spoilage';

const SH = CFG.beliefs.shrine, TO = CFG.beliefs.totem, TE = CFG.faith.temple;

let cache = { tick: -1, w: null as World | null, altars: [] as Building[], totems: [] as Building[] };
function places(w: World): typeof cache {
  if (cache.tick === w.s.tick && cache.w === w) return cache;
  const done = w.s.buildings.filter(isComplete);
  cache = { tick: w.s.tick, w, altars: done.filter((b) => b.type === 'shrine' || b.type === 'temple'), totems: done.filter((b) => b.type === 'totem') };
  return cache;
}
/** Finished shrines and temples: where the village prays. */
export const altars = (w: World): Building[] => places(w).altars;
/** The nearest finished shrine or temple within `r` of `p` (a consecrated temple first, if both are in reach). */
export function nearestAltar(w: World, p: Vec2, r: number): Building | null {
  let best: Building | null = null, bs = Infinity;
  for (const b of altars(w)) {
    const d = dist(b.pos, p), sc = d - (consecrated(b) ? 20 : 0);
    if (d <= r && sc < bs) { bs = sc; best = b; }
  }
  return best;
}
/** A temple with its two trinkets laid in it. */
export const consecrated = (b: Building): boolean => b.type === 'temple' && isComplete(b) && b.decoration.length >= TE.trinkets;
/** Is `p` within a consecrated temple's reach (prayer favor ×1.5)? */
export const templeNear = (w: World, p: Vec2): boolean => altars(w).some((b) => consecrated(b) && dist(b.pos, p) <= TE.radius);
/** Is `p` under a totem's watch? */
export const totemNear = (w: World, p: Vec2): boolean => places(w).totems.some((b) => dist(b.pos, p) <= TO.radius);

const knower = (w: World, id: string): boolean => w.s.goblins.some((g) => g.knownRecipes.includes(id));
const has = (w: World, type: string): boolean => w.s.buildings.some((b) => b.type === type);
/** A shrine once the village is a few goblins strong and a few days old, and someone has thought of one. */
export const wantsShrine = (w: World): boolean => w.clock.day >= SH.day && w.s.goblins.length >= SH.pop && !has(w, 'shrine') && knower(w, 'shrine');
/** A temple once a shrine stands, the village is ten strong and two seasons old, four believe, the store is not bare,
 * and someone has thought of one. */
export const wantsTemple = (w: World): boolean =>
  w.clock.day >= TE.day && w.s.goblins.length >= TE.pop && believers(w) >= TE.believers && foodStores(w.s).days >= TE.minFoodDays
  && altars(w).some((b) => b.type === 'shrine') && !has(w, 'temple') && knower(w, 'temple');
/** A totem once Gnashers have come and someone has thought of one. */
export const wantsTotem = (w: World): boolean => w.s.goblins.length >= TO.pop && w.s.threat.alarms > 0 && !has(w, 'totem') && knower(w, 'totem');

/** A totem site still waiting on its war paint, with no more than `have` pots about (in packs or the store). */
export function totemWantsPaint(w: World, have = 0): boolean {
  if (!w.s.buildings.some((b) => b.type === 'totem' && !isComplete(b) && missingMaterials(b).some((m) => m.type === 'war_paint'))) return false;
  return w.s.goblins.reduce((n, g) => n + countItem(g, 'war_paint'), 0) + stockCount(w.s, 'war_paint') <= have;
}

/** The idea of a shrine, a temple or a totem at hand (1) or not (0): see the header. */
export function placeIdea(g: Goblin, w: World, id: 'shrine' | 'totem' | 'temple'): number {
  if (id === 'shrine') return (g.godView.faith >= SH.minFaith || g.personality.piety >= CFG.faith.shaman.minPiety) && carried(g, w).length > 0 ? 1 : 0;
  if (id === 'temple') return g.activity.action === 'pray' && g.activity.stage === 1 && (g.role === 'shaman' || g.godView.faith >= TE.ideaFaith) ? 1 : 0;
  return g.mood.modifiers.some((m) => m.id === 'war_paint' && m.expiresTick > w.s.tick) ? 1 : 0;
}

/** Lay something at a shrine or temple for the god (taken a day later), unless it dresses the place: a shrine's
 * first trinket, a temple's first two, stay. */
export function layOffering(w: World, g: Goblin, b: Building, what: { trinketId?: number; item?: import('../shared/types').ItemType }): void {
  const dressing = what.trinketId !== undefined && (b.type === 'temple' ? !consecrated(b) && b.decoration.length < TE.trinkets : b.decoration.length === 0);
  if (what.trinketId !== undefined) {
    g.trinkets = g.trinkets.filter((id) => id !== what.trinketId);
    b.decoration.push(what.trinketId);
    w.emit({ type: 'decorated', goblinId: g.id, buildingId: b.id, count: b.decoration.length, at: { ...b.pos } });
  }
  if (!dressing) faithOf(w.s).offerings.push({ buildingId: b.id, tick: w.s.tick, goblinId: g.id, ...what, value: offeringValue(w, what) });
  if (what.item) w.emit({ type: 'offering', goblinId: g.id, buildingId: b.id, item: what.item, at: { ...b.pos } });
}

/**
 * After a prayer: the first to pray at a bare shrine (or a temple not yet consecrated) lays a trinket on it; a pious
 * goblin who believes offerings bring luck leaves one more, if it has two. True if it left one.
 */
export function offer(w: World, g: Goblin, b: Building): boolean {
  const mine = carried(g, w);
  const bare = b.type === 'temple' ? !consecrated(b) : b.decoration.length === 0;
  if (!mine.length || b.decoration.length >= SH.hold || (!bare && !(beliefMul(w, g, 'offering') > 1 && mine.length >= 2))) return false;
  layOffering(w, g, b, { trinketId: mine[mine.length - 1]!.id }); // the least of them
  return true;
}
