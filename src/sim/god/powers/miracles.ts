/**
 * Miracles (§17.5.5, P6.6): Vision, Sanctuary, Bring Forth and Resurrect (Revelation joins with the god's voice, P9).
 * - **Vision**: every goblin dreams the land around it — fruit, water, rocks, mushrooms — as if it had just looked.
 * - **Sanctuary**: a dome for a day; enemies are kept outside it, the weather inside is calm and danger fades.
 * - **Bring Forth**: a grown goblin of a chosen clan's stock descends in a beam of light, knowing its maker.
 * - **Resurrect**: a goblin dead at most two days (while its body is kept with its grave) comes back with half its hp
 *   and the `returned` trait; those who grieved for it are struck with awe instead.
 */
import { CFG } from '../../config';
import { dist, q4 } from '../../../shared/math';
import type { ID, Vec2 } from '../../../shared/types';
import type { Goblin } from '../../state';
import type { World } from '../../world';
import { isWalkable } from '../../grid';
import { sense } from '../../goblin/memory';
import { addMood } from '../../goblin/mood';
import { addCell } from '../../weather';
import { createGoblin } from '../../goblin/goblin';
import { registerLineage } from '../../goblin/family';
import { CLAN_ARCHETYPES, founderGenome } from '../../goblin/genetics/founders';
import { grantTrait } from '../../goblin/traits';
import { griefId } from '../../death';
import { buildingDef } from '../../buildings';
import { applyReaction, divineAct } from '../faith';
import type { CastTarget } from './nature';

const M = CFG.miracles;
const DAY = CFG.time.dayTicks;
type Archetype = (typeof CLAN_ARCHETYPES)[number];

/** Vision: everyone (asleep or not) dreams what lies within `visionRange`. */
export function castVision(w: World, c: CastTarget): void {
  for (const g of w.s.goblins) {
    sense(g, w, M.visionRange);
    addMood(w, g, 'vision', M.visionMood, DAY / 2);
  }
  divineAct(w, 'vision', c.pos, undefined, false, { area: Infinity });
}

/** Sanctuary: a dome over the area for a day, calm weather under it. */
export function castSanctuary(w: World, c: CastTarget): void {
  const ticks = M.sanctuaryDays * DAY;
  w.s.god.sanctuaries.push({ pos: { x: q4(c.pos.x), y: q4(c.pos.y) }, r: c.radius, until: w.s.tick + ticks });
  addCell(w, 'clear', c.pos, c.radius, ticks);
  divineAct(w, 'sanctuary', c.pos, undefined, true, { area: c.radius });
}

/** The dome over `p`, if any. */
export const sanctuaryAt = (w: World, p: Vec2): { pos: Vec2; r: number } | undefined => w.s.god.sanctuaries.find((z) => dist(z.pos, p) <= z.r);

/** Every tick: domes run out; an enemy that finds itself inside is put back outside the edge and thinks again. */
export function updateSanctuaries(w: World): void {
  const s = w.s;
  if (!s.god.sanctuaries.length) return;
  s.god.sanctuaries = s.god.sanctuaries.filter((z) => z.until > s.tick);
  for (const e of s.enemies) {
    const z = sanctuaryAt(w, e.pos);
    if (!z) continue;
    const d = dist(e.pos, z.pos), a = d > 0.01 ? Math.atan2(e.pos.y - z.pos.y, e.pos.x - z.pos.x) : 0;
    e.pos = { x: q4(z.pos.x + Math.cos(a) * (z.r + 0.3)), y: q4(z.pos.y + Math.sin(a) * (z.r + 0.3)) };
    e.path = [];
    e.velocity = { x: 0, y: 0 };
    e.nextDecide = s.tick;
  }
}

/** The clan stock Bring Forth draws on: the one chosen, else the village's first clan's. */
export const bringArchetype = (w: World, option?: string): Archetype =>
  (CLAN_ARCHETYPES as readonly string[]).includes(option ?? '') ? (option as Archetype) : ((w.s.clans[0]?.archetype as Archetype | undefined) ?? 'mixed');

/** Bring Forth: a grown goblin of that stock, in the clan of that stock if the village has one. */
export function castBringForth(w: World, c: CastTarget): void {
  const s = w.s, arch = bringArchetype(w, c.option);
  const clan = s.clans.find((k) => k.archetype === arch) ?? s.clans[0];
  const g = createGoblin(s, w.rng, { genome: founderGenome(w.rng, arch), pos: { x: q4(c.pos.x), y: q4(c.pos.y) }, ageDays: M.bringAgeDays, clanId: clan?.id ?? 0 });
  g.godView.faith = M.bringFaith;
  g.godView.love = M.bringLove;
  s.goblins.push(g);
  w.goblinHash.insert(g);
  registerLineage(s, g);
  w.emit({ type: 'brought_forth', goblinId: g.id, at: { ...g.pos } });
  divineAct(w, 'bring_forth', g.pos, g.id, true, { area: 12 });
}

/** Why grave `id` cannot be raised now, or null: it must still have its body, at most two days after the death. */
export function resurrectProblem(w: World, id: ID | undefined): string | null {
  const gr = id !== undefined ? w.s.graves.find((x) => x.id === id) : undefined;
  if (!gr) return 'missing_entity';
  return gr.body && w.s.tick - gr.tick <= CFG.death.resurrectDays * DAY ? null : 'too_late';
}

/** A walkable spot at or near `p`. */
function standAt(w: World, p: Vec2): Vec2 {
  for (let r = 0; r <= 4; r++)
    for (let k = 0; k < Math.max(1, 8 * r); k++) {
      const a = (k / Math.max(1, 8 * r)) * Math.PI * 2, q = { x: q4(p.x + Math.cos(a) * r * 0.7), y: q4(p.y + Math.sin(a) * r * 0.7) };
      if (isWalkable(w.s, Math.floor(q.x), Math.floor(q.y))) return q;
    }
  return { ...p };
}

/** Back to life: hp, needs, a fresh mind, its bed if it is still free; the grave is empty. */
function revive(w: World, g: Goblin, at: Vec2): void {
  const s = w.s;
  g.pos = standAt(w, at);
  g.velocity = { x: 0, y: 0 };
  g.airborne = null;
  g.heldByGod = false;
  Object.assign(g.health, { hp: Math.min(g.health.maxHp, M.resurrectHp), injuries: [], disease: null, coldTicks: 0 });
  for (const k of ['hunger', 'thirst', 'energy', 'warmth', 'safety'] as const) g.needs[k] = Math.max(g.needs[k], M.revive);
  g.activity = { action: 'idle', status: 'done', startedTick: s.tick, targetId: null, target: null, path: [], progress: 0, stage: 0 };
  g.goalStack = [];
  const home = g.homeId !== null ? s.buildings.find((b) => b.id === g.homeId) : undefined;
  if (home && home.occupants.length < (buildingDef(home.type)?.capacity ?? 0)) home.occupants.push(g.id);
  else g.homeId = null;
  s.goblins.push(g);
  w.goblinHash.insert(g);
  const line = s.lineage[g.id];
  if (line) line.died = null;
  // what it knew is known again
  if (s.village.lost) s.village.lost = s.village.lost.filter((id) => !g.knownRecipes.includes(id) && !g.knownFacts.includes(id));
}

/** Resurrect: the goblin rises from its grave; grief for it turns to awe. */
export function castResurrect(w: World, c: CastTarget): void {
  const s = w.s, gr = s.graves.find((x) => x.id === c.targetId);
  if (!gr?.body || resurrectProblem(w, gr.id)) return;
  const g = gr.body;
  s.graves.splice(s.graves.indexOf(gr), 1);
  revive(w, g, gr.pos);
  grantTrait(w, g, 'returned', true);
  for (const o of s.goblins) {
    if (o === g || !o.mood.modifiers.some((m) => m.id === griefId(g.id))) continue;
    o.mood.modifiers = o.mood.modifiers.filter((m) => m.id !== griefId(g.id) && m.id !== `mourned:${g.id}`);
    addMood(w, o, 'awe', M.aweMood, M.aweDays * DAY);
    applyReaction(o, { faith: M.aweFaith });
  }
  w.emit({ type: 'resurrected', goblinId: g.id, graveId: gr.id, at: { ...g.pos } });
  divineAct(w, 'resurrect', g.pos, g.id, true, { area: 16 });
}
