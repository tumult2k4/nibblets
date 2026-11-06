/**
 * Wildlife populations (§8.4, P7.1). Each kind's cap follows its food: hoppers the grass, chirps the trees and
 * fruiting bushes, fish the shallows, glimmerflies the marsh and its glowcaps. Once a day hoppers and chirps get
 * hungrier (one that has gone without long enough dies), the well fed breed while under the cap, and a kind that has
 * thinned out drifts back in from the wilds. Glimmerflies rise at dusk and are gone at dawn. Behaviour: critters.ts.
 */
import { CFG } from './config';
import { allocId } from '../shared/ids';
import { dist, q4 } from '../shared/math';
import { tileAt } from './grid';
import { isNight } from './time';
import { spawnGroundItem } from './groundItems';
import { canBe, perchHeight, shallows, stepCritter } from './critters';
import type { Rng } from '../shared/rng';
import type { Critter, CritterKind, WorldState } from './state';
import type { ItemType, Vec2 } from '../shared/types';
import type { World } from './world';

const W = CFG.wildlife, DAY = CFG.time.dayTicks, HOUR = CFG.god.hourTicks;

/** How many of each kind the land can feed now. */
export function wildlifeCaps(s: WorldState): Record<CritterKind, number> {
  const grass = s.grass.reduce((a, p) => a + p.density, 0);
  let perches = 0, glowcaps = 0, water = 0, marsh = 0;
  for (const p of s.plants)
    if ((p.stage === 'mature' || p.stage === 'old') && (p.kind === 'tree' || ((p.kind === 'apple_bush' || p.kind === 'berry_bush') && p.fruit > 0))) perches++;
  for (const m of s.mushrooms) if (m.kind === 'glowcap') glowcaps++;
  for (let y = 0; y < s.size.h; y += 2) for (let x = 0; x < s.size.w; x += 2) {
    const b = s.tiles[y * s.size.w + x]!.biome;
    if (b === 'marsh') marsh += 4;
    else if (b === 'water' && shallows(s, x + 0.5, y + 0.5)) water += 4;
  }
  return {
    hopper: Math.min(W.hopper.max, Math.floor(grass / W.hopper.perGrass)),
    chirp: Math.min(W.chirp.max, Math.floor(perches / W.chirp.perPerch)),
    fish: Math.min(W.fish.max, Math.floor(water / W.fish.perWater)),
    glimmerfly: Math.min(W.glimmerfly.max, Math.floor(marsh / W.glimmerfly.perMarsh) + glowcaps * W.glimmerfly.perGlowcap),
  };
}

/** A random place this kind could live (a few tries; worldgen and arrivals). */
function habitat(s: WorldState, rng: Rng, kind: CritterKind): { pos: Vec2; z: number; on?: number } | null {
  for (let i = 0; i < 40; i++) {
    if (kind === 'hopper') {
      const g = s.grass.length ? rng.pick(s.grass) : null;
      if (!g) return null;
      const p = { x: q4(g.pos.x + rng.range(-1.5, 1.5)), y: q4(g.pos.y + rng.range(-1.5, 1.5)) };
      const t = tileAt(s, p.x, p.y);
      if (t?.walkable && t.biome !== 'water' && t.occupiedBy === null) return { pos: p, z: 0 };
    } else if (kind === 'chirp') {
      const trees = s.plants.filter((p) => p.kind === 'tree' && (p.stage === 'mature' || p.stage === 'old'));
      if (!trees.length) return null;
      const t = rng.pick(trees);
      return { pos: { ...t.pos }, z: perchHeight(t), on: t.id };
    } else {
      const p = { x: q4(rng.range(1, s.size.w - 1)), y: q4(rng.range(1, s.size.h - 1)) };
      const b = tileAt(s, p.x, p.y)?.biome;
      if (kind === 'fish' ? shallows(s, p.x, p.y) : b === 'marsh') return { pos: p, z: kind === 'fish' ? 0 : 0.9 };
    }
  }
  return null;
}

function addCritter(s: WorldState, kind: CritterKind, pos: Vec2, z: number, fed: number, rng: Rng, on: number | null = null): Critter {
  const hp = kind === 'hopper' ? W.hopper.hp : kind === 'chirp' ? W.chirp.hp : 1;
  const c: Critter = { id: allocId(s), kind, pos: { ...pos }, z, heading: q4(rng.range(-Math.PI, Math.PI)), hp, fed: q4(fed), mode: kind === 'chirp' && z > 0 ? 'perch' : 'idle', goal: null, targetId: on, until: s.tick + rng.int(0, 600) };
  s.wildlife.push(c);
  return c;
}

/** Worldgen: hoppers, chirps and fish at a share of what the land can feed. */
export function seedWildlife(s: WorldState, rng: Rng): void {
  const caps = wildlifeCaps(s);
  for (const kind of ['hopper', 'chirp', 'fish'] as const) {
    const n = Math.round(caps[kind] * W[kind].start);
    for (let i = 0; i < n; i++) {
      const h = habitat(s, rng, kind);
      if (h) addCritter(s, kind, h.pos, h.z, rng.range(0.5, 1), rng, h.on ?? null);
    }
  }
}

const count = (s: WorldState, k: CritterKind): number => s.wildlife.reduce((a, c) => a + (c.kind === k ? 1 : 0), 0);

/** Dawn: bellies empty a little, the starved die, the fed breed, the thinned-out come back from the wilds. */
function daily(w: World): void {
  const s = w.s, caps = wildlifeCaps(s);
  for (const c of [...s.wildlife]) {
    if (c.kind !== 'hopper' && c.kind !== 'chirp') continue;
    const K = W[c.kind];
    const fed = c.fed;
    c.fed = q4(c.fed - K.hungerPerDay);
    if (c.fed <= 0) { s.wildlife.splice(s.wildlife.indexOf(c), 1); continue; }
    if (fed >= W.breedFed && count(s, c.kind) < caps[c.kind] && w.rng.chance(K.breed)) {
      const p = { x: q4(c.pos.x + w.rng.range(-1, 1)), y: q4(c.pos.y + w.rng.range(-1, 1)) };
      if (canBe(w, c.kind, p.x, p.y)) addCritter(s, c.kind, p, c.z, 0.5, w.rng);
    }
  }
  if (count(s, 'fish') < caps.fish && w.rng.chance(W.fish.breed * 4)) {
    const h = habitat(s, w.rng, 'fish');
    if (h) addCritter(s, 'fish', h.pos, 0, 1, w.rng);
  }
  for (const kind of ['hopper', 'chirp'] as const) {
    if (count(s, kind) >= caps[kind] / 2 || !w.rng.chance(W[kind].arrive)) continue;
    const h = habitat(s, w.rng, kind);
    if (h && dist(h.pos, s.village.center) > 20) addCritter(s, kind, h.pos, h.z, 0.7, w.rng, h.on ?? null);
  }
}

/** Dusk brings the glimmerflies out over the marsh; dawn sends them away. */
function glimmer(w: World): void {
  const s = w.s;
  if (!isNight(w.clock)) {
    if (s.wildlife.some((c) => c.kind === 'glimmerfly')) s.wildlife = s.wildlife.filter((c) => c.kind !== 'glimmerfly');
    return;
  }
  const want = wildlifeCaps(s).glimmerfly - count(s, 'glimmerfly');
  for (let i = 0; i < want; i++) {
    const h = habitat(s, w.rng, 'glimmerfly');
    if (h) addCritter(s, 'glimmerfly', h.pos, h.z, 1, w.rng);
  }
}

/** §6 step 14c: every critter takes its tick; the hourly and daily population bookkeeping. */
export function updateWildlife(w: World): void {
  const s = w.s;
  for (const c of [...s.wildlife]) stepCritter(w, c);
  if (s.tick % HOUR !== 0) return;
  for (const c of s.wildlife)
    if (c.kind === 'chirp' && c.mode === 'perch' && w.rng.chance(W.chirp.moultPerHour)) spawnGroundItem(w, { type: 'feather', qty: 1 }, { x: q4(c.pos.x + 0.3), y: c.pos.y });
  glimmer(w);
  if (s.tick % DAY === 0) daily(w);
}

/** A critter hit by a goblin's sling: hurt, and if it falls, it leaves meat, a bone and a pelt (hoppers). */
export function hitCritter(w: World, c: Critter, dmg: number): boolean {
  c.hp = q4(c.hp - dmg);
  if (c.hp > 0) return false;
  const i = w.s.wildlife.indexOf(c);
  if (i >= 0) w.s.wildlife.splice(i, 1);
  if (c.kind === 'hopper')
    for (const [type, qty] of Object.entries(W.hopperDrops)) spawnGroundItem(w, { type: type as ItemType, qty }, { x: q4(c.pos.x + w.rng.range(-0.3, 0.3)), y: q4(c.pos.y + w.rng.range(-0.3, 0.3)) });
  else if (c.kind === 'chirp') spawnGroundItem(w, { type: 'feather', qty: 2 }, { ...c.pos });
  return true;
}
