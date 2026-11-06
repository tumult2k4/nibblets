/**
 * Critter behaviour (§8.4, P7.1): what each kind does when it decides (every `every` ticks, staggered by id) and how
 * it moves (every tick). Hoppers graze grass and nibble sprouts and saplings, and bolt from goblins and enemies;
 * fences keep them out. Chirps fly between perches, eat fruit off bushes, roost at night and drop a feather now and
 * then, mostly when flushed. Fish nose about the shallows. Glimmerflies drift toward glowcaps.
 */
import { CFG } from './config';
import { clamp, dist, q4 } from '../shared/math';
import { tileAt } from './grid';
import { enemyCanStand } from './fences';
import { isNight } from './time';
import { removePlant } from './plants';
import { spawnGroundItem } from './groundItems';
import type { Critter, CritterKind, Plant, WorldState } from './state';
import type { Vec2 } from '../shared/types';
import type { World } from './world';

const W = CFG.wildlife;

/** Can a critter of this kind be here? Hoppers on open land outside fences, fish in the shallows, the rest fly. */
export function canBe(w: World, kind: CritterKind, x: number, y: number): boolean {
  const s = w.s;
  if (x < 0.5 || y < 0.5 || x > s.size.w - 0.5 || y > s.size.h - 0.5) return false;
  if (kind === 'hopper') return enemyCanStand(w, x, y) && tileAt(s, x, y)?.biome !== 'water';
  if (kind === 'fish') return shallows(s, x, y);
  return true;
}

/** Water with land within 3 tiles: where fish keep (and where goblins can see and catch them). */
export function shallows(s: WorldState, x: number, y: number): boolean {
  if (tileAt(s, x, y)?.biome !== 'water') return false;
  for (let dy = -3; dy <= 3; dy += 3) for (let dx = -3; dx <= 3; dx += 3) {
    const t = tileAt(s, x + dx, y + dy);
    if (t && t.biome !== 'water') return true;
  }
  return false;
}

/** The nearest goblin or enemy within r. */
function threat(w: World, c: Critter, r: number): Vec2 | null {
  let best: Vec2 | null = null, bd = r;
  for (const g of w.goblinHash.query(c.pos, r)) {
    const d = dist(g.pos, c.pos);
    if (!g.heldByGod && d < bd) { bd = d; best = g.pos; }
  }
  for (const e of w.s.enemies) {
    const d = dist(e.pos, c.pos);
    if (d < bd) { bd = d; best = e.pos; }
  }
  return best;
}

/** A spot within r the critter can be at (a few tries), or null. */
function near(w: World, c: Critter, from: Vec2, r: number): Vec2 | null {
  for (let i = 0; i < 6; i++) {
    const a = w.rng.range(0, Math.PI * 2), d = w.rng.range(r * 0.3, r);
    const p = { x: q4(from.x + Math.cos(a) * d), y: q4(from.y + Math.sin(a) * d) };
    if (canBe(w, c.kind, p.x, p.y)) return p;
  }
  return null;
}

function go(c: Critter, to: Vec2, mode: Critter['mode'] = 'move', targetId: number | null = null): void {
  c.goal = { x: q4(to.x), y: q4(to.y) };
  c.mode = mode;
  c.targetId = targetId;
}

function flee(w: World, c: Critter, from: Vec2, r: number): void {
  const a = Math.atan2(c.pos.y - from.y, c.pos.x - from.x);
  for (const turn of [0, 0.6, -0.6, 1.2, -1.2]) {
    const p = { x: c.pos.x + Math.cos(a + turn) * r, y: c.pos.y + Math.sin(a + turn) * r };
    if (canBe(w, c.kind, p.x, p.y)) return go(c, p, 'flee');
  }
  c.mode = 'idle';
  c.goal = null;
}

/** Something has frightened it (a sling stone whistling past): it bolts. */
export function startle(w: World, c: Critter, from: Vec2): void {
  if (c.kind === 'chirp') c.z = W.chirp.height;
  flee(w, c, from, 8);
}

const grown = (p: Plant): boolean => p.stage === 'mature' || p.stage === 'old';
const isPerch = (p: Plant): boolean => p.kind === 'tree' && grown(p);
const hasFruit = (p: Plant): boolean => (p.kind === 'apple_bush' || p.kind === 'berry_bush') && grown(p) && p.fruit > 0;
/** How high a chirp sits on a plant. */
export const perchHeight = (p: Plant): number => (p.kind === 'tree' ? 0.9 : 0.6);

function nearestPlant(w: World, c: Critter, r: number, ok: (p: Plant) => boolean): Plant | null {
  let best: Plant | null = null, bd = Infinity;
  for (const p of w.plantHash.query(c.pos, r, ok)) {
    const d = dist(p.pos, c.pos);
    if (d < bd) { bd = d; best = p; }
  }
  return best;
}

/** The nearest grass patch within r with more than `min` density that the critter can get to. */
function nearestGrass(w: World, c: Critter, r: number, min: number): WorldState['grass'][number] | null {
  let best: WorldState['grass'][number] | null = null, bd = r;
  for (const g of w.s.grass) {
    const d = dist(g.pos, c.pos);
    if (d < bd && g.density > min && canBe(w, c.kind, g.pos.x, g.pos.y)) { bd = d; best = g; }
  }
  return best;
}

function hopper(w: World, c: Critter): void {
  const H = W.hopper, t = threat(w, c, H.fear);
  if (t) return flee(w, c, t, 7);
  if (c.mode === 'eat' || (c.goal && c.mode !== 'idle')) return;
  if (isNight(w.clock)) { c.mode = 'idle'; return; }
  if (c.fed < 0.8) {
    const sprout = nearestPlant(w, c, H.sight, (p) => (p.stage === 'sprout' || p.stage === 'sapling') && canBe(w, 'hopper', p.pos.x, p.pos.y));
    if (sprout) return go(c, sprout.pos, 'move', sprout.id);
    const best = nearestGrass(w, c, H.sight, 0.15);
    if (best) return go(c, best.pos, 'move', best.id);
  }
  const p = w.rng.chance(0.35) ? near(w, c, c.pos, H.wander) : null;
  if (p) go(c, p);
}

function chirp(w: World, c: Critter): void {
  const C = W.chirp;
  if (c.mode === 'perch' || c.mode === 'eat') {
    const t = threat(w, c, C.fear);
    if (t) {
      if (w.rng.chance(C.flushFeather)) spawnGroundItem(w, { type: 'feather', qty: 1 }, { ...c.pos });
      c.z = C.height;
      return flee(w, c, t, C.wander);
    }
  }
  if (c.mode === 'eat' || (c.goal && c.mode !== 'idle')) return;
  if (c.mode === 'perch' && (w.s.tick < c.until || isNight(w.clock))) return;
  const food = c.fed < 0.8 && !isNight(w.clock) ? nearestPlant(w, c, C.sight, hasFruit) : null;
  // no fruit about (winter): peck for seeds in the grass, a poorer meal
  const seeds = !food && c.fed < 0.5 && !isNight(w.clock) ? nearestGrass(w, c, C.sight, 0) : null;
  c.z = C.height;
  if (seeds) return go(c, seeds.pos, 'move', seeds.id);
  const to = food ?? nearestPlant(w, c, C.wander, (p) => isPerch(p) && dist(p.pos, c.pos) > 2) ?? nearestPlant(w, c, C.sight, isPerch);
  c.z = C.height;
  if (to) go(c, to.pos, 'move', to.id);
  else { const p = near(w, c, c.pos, C.wander); if (p) go(c, p); }
}

function fish(w: World, c: Critter): void {
  if (c.goal) return;
  const p = w.rng.chance(0.5) ? near(w, c, c.pos, W.fish.wander) : null;
  if (p) go(c, p);
}

function glimmerfly(w: World, c: Critter): void {
  const G = W.glimmerfly;
  let to: Vec2 | null = null, bd: number = G.lure;
  for (const m of w.s.mushrooms) {
    const d = dist(m.pos, c.pos);
    if (m.kind === 'glowcap' && d < bd) { bd = d; to = m.pos; }
  }
  const p = near(w, c, to ?? c.pos, to ? 1.2 : G.wander);
  if (p) go(c, p);
}

const DECIDE: Record<CritterKind, (w: World, c: Critter) => void> = { hopper, chirp, fish, glimmerfly };

/** Arrived where it was going: start a meal, settle on a perch, or just stop. */
function arrive(w: World, c: Critter): void {
  const s = w.s, id = c.targetId;
  c.goal = null;
  const plant = id !== null ? s.plants.find((p) => p.id === id) : undefined;
  if (c.kind === 'hopper' && id !== null) {
    c.mode = 'eat';
    c.until = s.tick + W.hopper.eatTicks;
    return;
  }
  if (c.kind === 'chirp' && id !== null && !plant) {
    c.z = 0;
    c.mode = 'eat';
    c.until = s.tick + W.chirp.eatTicks;
    return;
  }
  if (c.kind === 'chirp' && plant) {
    c.z = perchHeight(plant);
    if (c.fed < 0.8 && hasFruit(plant)) { c.mode = 'eat'; c.until = s.tick + W.chirp.eatTicks; return; }
    c.mode = 'perch';
    c.until = s.tick + w.rng.int(300, 900);
    return;
  }
  if (c.kind === 'chirp') c.z = 0;
  c.mode = 'idle';
  c.targetId = null;
}

/** A meal is over: the patch thins, the sprout loses a bite, the bush a fruit. */
function eat(w: World, c: Critter): void {
  const s = w.s, id = c.targetId;
  c.targetId = null;
  if (c.kind === 'chirp') {
    const p = s.plants.find((x) => x.id === id);
    if (p && p.fruit > 0) { p.fruit--; c.fed = q4(Math.min(1, c.fed + W.chirp.meal)); }
    if (!p) { c.fed = q4(Math.min(1, c.fed + W.chirp.meal * W.chirp.peck)); c.mode = 'idle'; return; }
    c.mode = 'perch';
    c.until = s.tick + w.rng.int(150, 450);
    return;
  }
  c.mode = 'idle';
  const g = s.grass.find((x) => x.id === id);
  if (g) {
    g.density = q4(Math.max(0, g.density - W.hopper.graze));
    c.fed = q4(Math.min(1, c.fed + W.hopper.meal));
    return;
  }
  const p = s.plants.find((x) => x.id === id);
  if (!p || dist(p.pos, c.pos) > 1) return;
  p.hp = q4(p.hp - W.hopper.nibble);
  c.fed = q4(Math.min(1, c.fed + W.hopper.meal));
  if (p.plantedBy !== null) w.emit({ type: 'sprout_nibbled', plantId: p.id, critterId: c.id, at: { ...p.pos } });
  if (p.hp > 0) return;
  w.emit({ type: 'plant_died', plantId: p.id, kind: p.kind, at: p.pos });
  removePlant(w, p);
}

const speedOf = (c: Critter): number => {
  const K = c.kind === 'hopper' ? W.hopper : c.kind === 'chirp' ? W.chirp : null;
  if (K) return c.mode === 'flee' ? K.flee : K.speed;
  return c.kind === 'fish' ? W.fish.speed : W.glimmerfly.speed;
};

/** One tick of a critter: decide now and then, eat, and move toward its goal. */
export function stepCritter(w: World, c: Critter): void {
  const s = w.s;
  if ((s.tick + c.id) % W.every === 0) DECIDE[c.kind](w, c);
  if (c.mode === 'eat' && s.tick >= c.until) eat(w, c);
  if (!c.goal || c.mode === 'eat' || c.mode === 'perch') return;
  const sp = speedOf(c), dx = c.goal.x - c.pos.x, dy = c.goal.y - c.pos.y, d = Math.hypot(dx, dy);
  if (d > 0.01) c.heading = q4(Math.atan2(dy, dx));
  if (d <= sp) { c.pos = { ...c.goal }; return arrive(w, c); }
  const nx = c.pos.x + (dx / d) * sp, ny = c.pos.y + (dy / d) * sp;
  if (!canBe(w, c.kind, nx, ny)) { c.goal = null; c.mode = 'idle'; c.targetId = null; return; }
  c.pos = { x: q4(clamp(nx, 0.5, s.size.w - 0.5)), y: q4(clamp(ny, 0.5, s.size.h - 0.5)) };
}
