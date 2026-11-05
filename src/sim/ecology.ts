/**
 * Ecology (§6 step 5, §8.2): mushrooms pop up in forest and marsh, mostly while it rains, and rot after a few days.
 * Brown and glowcap are food; redcap is poisonous, which only those who know `redcap_is_poison` avoid (P5.5).
 * Grown trees shed sticks now and then (more in storms), so sticks can be gathered without an axe (P4.1).
 */
import { CFG } from './config';
import { q4 } from '../shared/math';
import { allocId } from '../shared/ids';
import type { Rng } from '../shared/rng';
import type { Vec2 } from '../shared/types';
import type { Goblin, Mushroom, WorldState } from './state';
import type { World } from './world';
import { tileAt } from './grid';
import { spawnGroundItem } from './groundItems';
import { rainingAt } from './weather';

const M = CFG.mushrooms;
const KINDS = Object.keys(M.kinds) as Mushroom['kind'][];

/** Food as far as `g` knows: a redcap looks like a meal to anyone who hasn't learned otherwise. */
export const looksEdible = (g: Goblin, m: Mushroom): boolean => m.kind !== 'redcap' || !g.knownFacts.includes('redcap_is_poison');
/** The item a foraged mushroom becomes. */
export const mushroomItem = (m: Mushroom): 'mushroom' | 'glowcap' | 'redcap' => (m.kind === 'brown' ? 'mushroom' : m.kind);

export function pickMushroomKind(rng: Rng): Mushroom['kind'] {
  let r = rng.next();
  for (const k of KINDS) if ((r -= M.kinds[k]!) < 0) return k;
  return 'brown';
}

/** Forest or marsh ground with room for a cap (no plant trunk, no other mushroom within `minGap`). */
export function mushroomSiteOk(w: World, pos: Vec2): boolean {
  const t = tileAt(w.s, pos.x, pos.y);
  if (!t || !t.walkable || t.occupiedBy !== null || (t.biome !== 'forest' && t.biome !== 'marsh')) return false;
  for (const p of w.plantHash.query(pos, 0.6)) if (Math.hypot(p.pos.x - pos.x, p.pos.y - pos.y) < 0.45) return false;
  return !w.s.mushrooms.some((m) => Math.hypot(m.pos.x - pos.x, m.pos.y - pos.y) < M.minGap);
}

export function spawnMushroom(s: WorldState, pos: Vec2, kind: Mushroom['kind'], age = 0): Mushroom {
  const m: Mushroom = { id: allocId(s), pos: { x: q4(pos.x), y: q4(pos.y) }, kind, age: q4(age) };
  s.mushrooms.push(m);
  return m;
}

export function removeMushroom(w: World, m: Mushroom): void {
  const i = w.s.mushrooms.indexOf(m);
  if (i >= 0) w.s.mushrooms.splice(i, 1);
}

/** Every `every` ticks: age and rot mushrooms, then try to sprout new ones (season × rain). */
export function updateEcology(w: World): void {
  const s = w.s;
  if (s.tick % M.every !== 0) return;
  const dAge = M.every / CFG.time.dayTicks;
  s.mushrooms = s.mushrooms.filter((m) => (m.age = q4(m.age + dAge)) < M.lifeDays);
  const tries = Math.round(M.spawnTries * M.seasonMul[w.clock.season]);
  for (let i = 0; i < tries && s.mushrooms.length < M.cap; i++) {
    const pos = { x: w.rng.range(0, s.size.w), y: w.rng.range(0, s.size.h) };
    if (!mushroomSiteOk(w, pos)) continue;
    if (!rainingAt(w, pos) && !w.rng.chance(M.dryChance)) continue;
    spawnMushroom(s, pos, pickMushroomKind(w.rng));
  }
  shedSticks(w);
  regrowGrass(w);
}

/** P5.6: cut grass grows back (fast in spring, not at all in winter). */
export function regrowGrass(w: World): void {
  const s = w.s, F = CFG.fiber;
  if (s.tick % F.regrowEvery !== 0) return;
  const add = (F.regrowPerDay[w.clock.season] ?? 0) * (F.regrowEvery / CFG.time.dayTicks);
  if (add <= 0) return;
  for (const p of s.grass) if (p.density < 1) p.density = q4(Math.min(1, p.density + add));
}

/** A few random grown trees drop a stick beside them, up to a cap of loose sticks in the world. */
export function shedSticks(w: World): void {
  const s = w.s, MI = CFG.mining;
  if (!s.plants.length) return;
  let loose = 0;
  for (const it of s.groundItems) if (it.stack.type === 'stick') loose++;
  const chance = MI.stickFallChance * (s.weather.kind === 'storm' ? MI.stickStormMul : 1);
  for (let i = 0; i < MI.stickFallTries && loose < MI.looseStickCap; i++) {
    const p = s.plants[w.rng.int(0, s.plants.length - 1)]!;
    if (p.kind !== 'tree' || (p.stage !== 'mature' && p.stage !== 'old') || !w.rng.chance(chance)) continue;
    const a = w.rng.range(0, Math.PI * 2);
    const pos = { x: q4(p.pos.x + Math.cos(a) * 0.8), y: q4(p.pos.y + Math.sin(a) * 0.8) };
    if (!tileAt(s, pos.x, pos.y)?.walkable) continue;
    spawnGroundItem(w, { type: 'stick', qty: 1 }, pos);
    loose++;
  }
}
