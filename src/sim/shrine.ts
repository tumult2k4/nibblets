/**
 * The shrine and the totem (§11.1, P8.6). The shrine (4 stone, and a trinket laid on it by the first to pray there)
 * is where the pious `Pray`, and the place the village's superstitions gather round; the totem (3 wood and a pot of war
 * paint) is the village's mark: within 8 tiles danger weighs less and goblins feel safer. Their ideas come from what a
 * goblin has about it: a trinket and some faith for the shrine, war paint on its face for the totem.
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

const SH = CFG.beliefs.shrine, TO = CFG.beliefs.totem;

let cache = { tick: -1, w: null as World | null, shrines: [] as Building[], totems: [] as Building[] };
function places(w: World): typeof cache {
  if (cache.tick === w.s.tick && cache.w === w) return cache;
  const done = w.s.buildings.filter(isComplete);
  cache = { tick: w.s.tick, w, shrines: done.filter((b) => b.type === 'shrine'), totems: done.filter((b) => b.type === 'totem') };
  return cache;
}
/** Finished shrines. */
export const shrines = (w: World): Building[] => places(w).shrines;
/** The nearest finished shrine within `r` of `p`. */
export function nearestShrine(w: World, p: Vec2, r: number): Building | null {
  let best: Building | null = null;
  for (const b of shrines(w)) if (dist(b.pos, p) <= r && (!best || dist(b.pos, p) < dist(best.pos, p))) best = b;
  return best;
}
/** Is `p` under a totem's watch? */
export const totemNear = (w: World, p: Vec2): boolean => places(w).totems.some((b) => dist(b.pos, p) <= TO.radius);

const knower = (w: World, id: string): boolean => w.s.goblins.some((g) => g.knownRecipes.includes(id));
const has = (w: World, type: string): boolean => w.s.buildings.some((b) => b.type === type);
/** A shrine once the village is a few goblins strong and a few days old, and someone has thought of one. */
export const wantsShrine = (w: World): boolean => w.clock.day >= SH.day && w.s.goblins.length >= SH.pop && !has(w, 'shrine') && knower(w, 'shrine');
/** A totem once Gnashers have come and someone has thought of one. */
export const wantsTotem = (w: World): boolean => w.s.goblins.length >= TO.pop && w.s.threat.alarms > 0 && !has(w, 'totem') && knower(w, 'totem');

/** A totem site still waiting on its war paint, with no more than `have` pots about (in packs or the store). */
export function totemWantsPaint(w: World, have = 0): boolean {
  if (!w.s.buildings.some((b) => b.type === 'totem' && !isComplete(b) && missingMaterials(b).some((m) => m.type === 'war_paint'))) return false;
  return w.s.goblins.reduce((n, g) => n + countItem(g, 'war_paint'), 0) + stockCount(w.s, 'war_paint') <= have;
}

/** The idea of a shrine or a totem at hand (1) or not (0): see the header. */
export function placeIdea(g: Goblin, w: World, id: 'shrine' | 'totem'): number {
  if (id === 'shrine') return g.godView.faith >= SH.minFaith && carried(g, w).length > 0 ? 1 : 0;
  return g.mood.modifiers.some((m) => m.id === 'war_paint' && m.expiresTick > w.s.tick) ? 1 : 0;
}

/**
 * After a prayer: the first to pray at a bare shrine lays a trinket on it (its last part); a pious goblin who believes
 * offerings bring luck leaves one more, if it has two. True if it left one.
 */
export function offer(w: World, g: Goblin, b: Building): boolean {
  const mine = carried(g, w);
  const bare = b.decoration.length === 0;
  if (!mine.length || b.decoration.length >= SH.hold || (!bare && !(beliefMul(w, g, 'offering') > 1 && mine.length >= 2))) return false;
  const t = mine[mine.length - 1]!; // the least of them
  g.trinkets = g.trinkets.filter((id) => id !== t.id);
  b.decoration.push(t.id);
  w.emit({ type: 'decorated', goblinId: g.id, buildingId: b.id, count: b.decoration.length, at: { ...b.pos } });
  return true;
}
