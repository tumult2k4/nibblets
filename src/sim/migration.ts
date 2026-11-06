/**
 * Goblins who leave the village for a rival clan (§16, P10.3; P10.4 adds marriage migration). An exile whose time is
 * up may go over to the clan that likes the village best instead of coming home: it walks off the map toward that
 * clan (`ai/actions/envoy.ts` `Defect`) and is gone. It takes what it carries and the trinkets on it; its genes join
 * the clan's pool, the clan is one more; a clan on good terms warms to the village for it, a hostile one learns its
 * weaknesses. Kin and friends miss it for a while; what only it knew is lost; its hut is free; its children stay.
 */
import { CFG } from './config';
import type { ID } from '../shared/types';
import type { Goblin } from './state';
import type { World } from './world';
import { addMood } from './goblin/mood';
import { opinionOf } from './goblin/social';
import { adoptOrphans } from './goblin/family';
import { carried } from './trinkets';
import { loseKnowledge } from './knowledge';
import { knownRivals, shiftRelation, type RivalClan } from './clans';

const D = CFG.raids.defect, DAY = CFG.time.dayTicks;
const BONDS = ['mate', 'best_friend', 'friend', 'parent', 'child', 'sibling'];

/** Where `g` is headed, if it is leaving the village. */
export const leavingFor = (w: World, g: Goblin): RivalClan | undefined => {
  const id = w.s.leaving?.[g.id];
  return id === undefined ? undefined : w.s.rivals.find((c) => c.id === id);
};

/** How likely an exile is to go over to a clan: the restless, the bitter (no love for its chief) and the unhappy. */
export function defectChance(w: World, g: Goblin): number {
  const chief = w.s.village.chiefId;
  const grudge = chief !== null && chief !== g.id && opinionOf(g, chief) < 0 ? D.grudge : 0;
  return Math.min(0.9, D.base + D.wanderlust * g.personality.wanderlust + grudge + (g.mood.value < 0 ? D.mood : 0));
}

/** At the end of an exile: go over to a clan? True if it sets off (it stays an exile on the way). */
export function maybeDefect(w: World, g: Goblin): boolean {
  if (g.lifeStage !== 'adult' && g.lifeStage !== 'elder') return false;
  const best = knownRivals(w.s).sort((a, b) => b.relation - a.relation || a.id - b.id)[0];
  if (!best || !w.rng.chance(defectChance(w, g))) return false;
  (w.s.leaving ??= {})[g.id] = best.id;
  g.exiledUntil = w.s.tick + DAY; // on its way out, it lives as an exile does
  return true;
}

/** `g` walks off the map to clan `c`: out of the village for good. */
export function departGoblin(w: World, g: Goblin, c: RivalClan, why: 'defected' | 'married' = 'defected'): void {
  const s = w.s, i = s.goblins.indexOf(g);
  if (i < 0) return;
  s.goblins.splice(i, 1);
  if (s.leaving) delete s.leaving[g.id];
  const mine = new Set(carried(g, w).map((t) => t.id)); // the trinkets on it go too; shelved ones stay
  s.trinkets = s.trinkets.filter((t) => !mine.has(t.id));
  g.trinkets = g.trinkets.filter((id) => !mine.has(id));
  g.inventory = [];
  if (s.god.held?.id === g.id) s.god.held = null;
  for (const b of s.buildings) {
    if (!b.occupants.includes(g.id)) continue;
    b.occupants = b.occupants.filter((id) => id !== g.id);
    if (b.ownerId === g.id) b.ownerId = b.occupants[0] ?? null;
  }
  for (const it of s.groundItems) if (it.reservedBy === g.id) it.reservedBy = null;
  const line = s.lineage[g.id];
  if (line) { line.left = s.tick; line.leftTo = c.id; }
  for (const o of s.goblins) {
    const r = o.relationships.find((x) => x.targetId === g.id);
    if (r && BONDS.includes(r.bond)) addMood(w, o, 'kin_left', D.missed, D.missedDays * DAY);
  }
  adoptOrphans(w, g);
  loseKnowledge(w, g);
  c.pop = Math.min(CFG.clans.popCap, c.pop + 1);
  c.pool[w.rng.int(0, c.pool.length - 1)] = g.genome;
  if (why === 'defected') shiftRelation(w, c, c.relation >= 0 ? D.friendly : D.hostile, 'defector');
  w.emit({ type: 'goblin_left', goblinId: g.id, clanId: c.id, why, at: { ...g.pos } });
  w.rebuildCaches();
}

/** The goblins who have left for clan `id` (from the lineage book). */
export const leftFor = (w: World, id: ID): number => Object.values(w.s.lineage).filter((l) => l.leftTo === id).length;
