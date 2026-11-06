/**
 * Alliances (§16, P10.4). An allied clan (relation 70+) sends now and then one of its goblins to marry into the
 * village: it walks in, joins (a goblin of the village from then on, of its own clan, which joins `s.clans`), brings
 * its genes (fresh alleles for the village's pool) and up to two recipes the village does not know, and comes with a
 * match in mind — an unmated goblin of the village, the restless and the different-looking first. The other way, a
 * restless unmated goblin may go to marry into an allied clan (`migration.ts`). Allies also send two or three warriors
 * when a Bramblebeast comes near the village; they walk up to it and strike it until it falls or flees.
 */
import { CFG } from './config';
import { dist, hueDelta } from '../shared/math';
import type { ID, RecipeId } from '../shared/types';
import type { Goblin } from './state';
import type { World } from './world';
import { clockAt } from './time';
import { createGoblin } from './goblin/goblin';
import { express } from './goblin/genetics/phenotype';
import { mateOf, registerLineage } from './goblin/family';
import { relate } from './goblin/social';
import { DISCOVERABLE, knowers } from './knowledge';
import { killEnemy } from './combat';
import { isExiled } from './leadership';
import { shiftRelation, type RivalClan } from './clans';
import { clanOf, doors, spawnVisitor, visitorsOf, walk, type Visitor } from './visitors';

const A = CFG.alliance, DAY = CFG.time.dayTicks;
const grown = (g: Goblin): boolean => g.lifeStage === 'adult';

/** Grown goblins of the village without a mate (and not on their way out). */
const unmated = (w: World): Goblin[] => w.s.goblins.filter((g) => grown(g) && !mateOf(g, w) && w.s.leaving?.[g.id] === undefined);

/** Who a newcomer of genome hue `hue` is matched with: the restless and those who look most unlike it first. */
export function matchFor(w: World, hue: number, not: ID): Goblin | null {
  let best: Goblin | null = null, bs = -Infinity;
  for (const g of unmated(w)) {
    if (g.id === not || isExiled(g, w)) continue;
    const sc = g.personality.wanderlust + Math.abs(hueDelta(express(g.genome, 'skinHue'), hue)) / 180 + g.personality.sociability * 0.3;
    if (sc > bs || (sc === bs && best && g.id < best.id)) { bs = sc; best = g; }
  }
  return best;
}

/** The suitor at the village: it becomes a goblin of the village. */
export function joinVillage(w: World, v: Visitor): Goblin | null {
  const s = w.s, c = clanOf(s, v);
  s.visitors = visitorsOf(s).filter((x) => x !== v);
  if (!c) return null;
  if (!s.clans.some((x) => x.id === c.id)) s.clans.push({ id: c.id, name: c.name, archetype: c.archetype });
  const g = createGoblin(s, w.rng, { genome: v.genome, pos: { ...v.pos }, ageDays: w.rng.range(A.age[0], A.age[1]), clanId: c.id });
  if (!s.goblins.some((o) => o.name === v.name)) g.name = v.name;
  const brought: RecipeId[] = w.rng.shuffle(DISCOVERABLE.filter((id) => !knowers(s, id))).slice(0, A.recipes);
  for (const id of brought) {
    g.knownRecipes.push(id);
    if (s.village.lost?.includes(id)) s.village.lost = s.village.lost.filter((x) => x !== id);
  }
  s.goblins.push(g);
  registerLineage(s, g);
  w.rebuildCaches();
  const m = matchFor(w, express(g.genome, 'skinHue'), g.id);
  if (m) for (const [a, b] of [[g, m], [m, g]] as const) {
    const r = relate(a, b.id);
    r.opinion = Math.max(r.opinion, A.match);
    r.familiarity = Math.max(r.familiarity, A.matchFamiliarity);
  }
  shiftRelation(w, c, A.married, 'married');
  w.emit({ type: 'goblin_joined', goblinId: g.id, clanId: c.id, recipes: brought, ...(m ? { matchId: m.id } : {}), at: { ...g.pos } });
  return g;
}

/** A warrior of an allied clan: to the Bramblebeast and at it, then home. True once it has left the map. */
function warriorStep(w: World, v: Visitor): boolean {
  const e = v.targetId !== undefined ? w.s.enemies.find((x) => x.id === v.targetId) : undefined;
  if (v.phase !== 'going' && (!e || w.s.tick > v.leaveAt)) {
    v.phase = 'going';
    v.path = w.path(v.pos, v.door) ?? [];
  }
  if (v.phase === 'going') return walk(v) || dist(v.pos, v.door) < 0.6;
  if (!e) return false;
  if (dist(v.pos, e.pos) > A.helpRange) {
    const end = v.path[v.path.length - 1];
    if (!end || dist(end, e.pos) > 2) v.path = w.path(v.pos, e.pos) ?? [];
    walk(v, 1.3);
    return false;
  }
  v.path = [];
  v.velocity = { x: 0, y: 0 };
  v.facing = Math.round(Math.atan2(e.pos.y - v.pos.y, e.pos.x - v.pos.x) * 1e4) / 1e4;
  v.timer = (v.timer ?? 0) - 1;
  if (v.timer > 0) return false;
  v.timer = A.helpEvery;
  e.hp = Math.round((e.hp - A.helpDmg) * 1e4) / 1e4;
  if (e.hp <= 0) killEnemy(w, e, null);
  return false;
}

/** Warriors to a Bramblebeast near the village, if an ally will send them. */
function sendHelp(w: World, c: RivalClan): void {
  const s = w.s, c0 = s.village.center;
  const beast = s.enemies.find((e) => e.kind === 'bramblebeast' && dist(e.pos, c0) <= A.helpRadius);
  if (!beast || visitorsOf(s).some((v) => v.kind === 'warrior') || !w.rng.chance(A.helpChance) || !doors(s, c.side).length) return;
  const n = w.rng.int(A.helpers[0], A.helpers[1]);
  for (let i = 0; i < n; i++) {
    const v = spawnVisitor(w, c, 'warrior');
    if (!v) return;
    v.targetId = beast.id;
    v.leaveAt = s.tick + A.helpDays * DAY;
    v.path = w.path(v.pos, beast.pos) ?? v.path;
  }
}

/** On each allied clan's 10:00 update: a suitor, maybe; and maybe one of the village's restless goes to them. */
function marriages(w: World, c: RivalClan): void {
  const s = w.s;
  if (s.tick >= (c.nextSuitor ?? 0) && !visitorsOf(s).some((v) => v.kind === 'suitor') && unmated(w).length
    && s.goblins.length < CFG.goblin.softCap && w.rng.chance(A.suitorPerDay)) {
    if (spawnVisitor(w, c, 'suitor')) c.nextSuitor = s.tick + A.suitorRestDays * DAY;
  }
  for (const g of unmated(w)) {
    if (g.personality.wanderlust < A.leaveWanderlust || g.role === 'chief' || isExiled(g, w) || g.heldByGod) continue;
    if (w.rng.chance(A.leavePerDay)) { (s.leaving ??= {})[g.id] = c.id; break; }
  }
}

/** Step 19c of the tick: allies' suitors and warriors on the map; marriages and help on the clans' updates. */
export function updateAllies(w: World): void {
  const s = w.s;
  for (const v of [...visitorsOf(s)]) {
    if (v.kind === 'suitor' && walk(v)) joinVillage(w, v);
    else if (v.kind === 'warrior' && warriorStep(w, v)) {
      s.visitors = visitorsOf(s).filter((x) => x !== v);
      w.emit({ type: 'visitor_left', visitorId: v.id, clanId: v.clanId, kind: v.kind, at: { ...v.pos } });
    }
  }
  if (s.tick % CFG.clans.every !== 0) return;
  const ten = clockAt(s.tick).hour === 10;
  for (const c of s.rivals) {
    if (!c.allied || c.contact === null) continue;
    sendHelp(w, c);
    if (ten) marriages(w, c);
  }
}
