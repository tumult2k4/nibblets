/**
 * Weather disasters (§14.4, P6.3). Each hour counts toward a rainy or dry day; at dawn the day is booked.
 * - **Flood**: after 3 rainy days in a row the water rises one step: every low tile (height under the water level +
 *   `rise`) goes under. Plants there lose hp by the hour, buildings take damage, eggs are lost, goblins wade out, and
 *   paths change. After the first day without much rain it goes down again, leaving the soil it covered richer.
 * - **Drought**: 6 summer days without rain dry the shallows (water tiles above the level − `drop` turn to sand, so
 *   goblins walk further to drink) and plants find less water in the soil, until it rains or summer ends.
 * - **Shooting star** (the good kind): about once a year at night a star falls near the village, leaving a small
 *   crater and a star stone for whoever gets there first; everyone awake nearby looks up.
 */
import { CFG } from './config';
import { clamp, dist, q4 } from '../shared/math';
import { isWalkable, tileAt } from './grid';
import { isNight } from './time';
import { removePlant } from './plants';
import { damageBuilding } from './storms';
import { spawnGroundItem } from './groundItems';
import { forceAction } from './ai/utility';
import type { Biome, Vec2 } from '../shared/types';
import type { Goblin, Tile } from './state';
import type { World } from './world';
import { noteStar } from './festivals';

const D = CFG.disasters, W = CFG.world;
const DAY = CFG.time.dayTicks, HOUR = CFG.god.hourTicks;
const RAINY = new Set(['rain', 'storm']);

/** Plants' share of the usual soil water (droughts). */
export const droughtMul = (w: World): number => (w.s.climate.drought ? D.drought.hydrationMul : 1);
/** How far the water stands above (flood) or below (drought) its usual level, in height units (the renderer's too). */
export const waterOffset = (w: World): number => (w.s.climate.flood ? D.flood.rise : w.s.climate.drought ? -D.drought.drop : 0);

/** The nearest walkable, dry spot to `p` (within 6 tiles). */
function dryLand(w: World, p: Vec2): Vec2 | null {
  for (let r = 1; r <= 6; r++)
    for (let k = 0; k < 8 * r; k++) {
      const a = (k / (8 * r)) * Math.PI * 2, q = { x: q4(p.x + Math.cos(a) * r), y: q4(p.y + Math.sin(a) * r) };
      if (isWalkable(w.s, Math.floor(q.x), Math.floor(q.y))) return q;
    }
  return null;
}

/** Put every dry tile `pick` chooses under water: goblins wade out, eggs there are lost. Returns the tiles drowned. */
function drown(w: World, pick: (t: Tile, i: number) => boolean): [number, Biome][] {
  const s = w.s, tiles: [number, Biome][] = [];
  s.tiles.forEach((t, i) => {
    if (t.biome === 'water' || !pick(t, i)) return;
    tiles.push([i, t.biome]);
    t.biome = 'water';
    t.walkable = false;
  });
  s.terrainVersion += 1;
  const wade = (g: Goblin) => { const q = dryLand(w, g.pos); if (q) { g.pos = q; g.activity.path = []; g.activity.status = 'done'; } };
  for (const g of s.goblins) if (!g.heldByGod && !g.airborne && !isWalkable(s, Math.floor(g.pos.x), Math.floor(g.pos.y))) wade(g);
  for (const egg of [...s.eggs]) if (!egg.airborne && !isWalkable(s, Math.floor(egg.pos.x), Math.floor(egg.pos.y))) {
    s.eggs.splice(s.eggs.indexOf(egg), 1);
    w.emit({ type: 'egg_lost', eggId: egg.id, parents: egg.parents, cause: 'flood', at: { ...egg.pos } });
  }
  return tiles;
}

/** The water goes down off `tiles`, leaving the soil richer. */
function drain(w: World, tiles: [number, Biome][]): void {
  for (const [i, biome] of tiles) {
    const t = w.s.tiles[i]!;
    t.biome = biome;
    t.walkable = true;
    t.fertility = q4(Math.min(1, t.fertility + D.flood.fertility));
  }
  w.s.terrainVersion += 1;
}

function startFlood(w: World): void {
  const s = w.s, level = W.waterLevel + D.flood.rise;
  const tiles = drown(w, (t) => t.height < level);
  s.climate.flood = { since: s.tick, tiles };
  w.emit({ type: 'flood_started', tiles: tiles.length, at: { ...s.village.center } });
}

function endFlood(w: World): void {
  const s = w.s, f = s.climate.flood!;
  drain(w, f.tiles);
  s.climate.flood = null;
  w.emit({ type: 'flood_receded', tiles: f.tiles.length, at: { ...s.village.center } });
}

/** The god's Flood (P6.6): low ground within `r` of `pos` (under the water level + `rise`) goes under for `ticks`. */
export function raiseWater(w: World, pos: Vec2, r: number, rise: number, ticks: number): number {
  const s = w.s, level = W.waterLevel + rise, sw = s.size.w;
  const tiles = drown(w, (t, i) => t.height < level && Math.hypot((i % sw) + 0.5 - pos.x, Math.floor(i / sw) + 0.5 - pos.y) <= r);
  s.climate.godFloods.push({ pos: { x: q4(pos.x), y: q4(pos.y) }, r, until: s.tick + ticks, tiles });
  return tiles.length;
}

/** Hourly under water: plants drown slowly, buildings rot (on the tiles a flood, the rain's or the god's, put under). */
function floodDamage(w: World): void {
  const s = w.s, c = s.climate;
  const flooded = new Set<number>();
  for (const f of [...(c.flood ? [c.flood] : []), ...c.godFloods]) for (const [i] of f.tiles) flooded.add(i);
  if (!flooded.size) return;
  const under = (p: Vec2) => flooded.has(Math.floor(p.y) * s.size.w + Math.floor(p.x));
  for (const p of [...s.plants]) if (under(p.pos) && (p.hp = q4(p.hp - D.flood.plantDmg)) <= 0) {
    w.emit({ type: 'plant_died', plantId: p.id, kind: p.kind, at: p.pos });
    removePlant(w, p);
  }
  for (const b of [...s.buildings]) if (under(b.pos)) damageBuilding(w, b, D.flood.buildingDmg, 'flood');
}

function startDrought(w: World): void {
  const s = w.s, level = W.waterLevel - D.drought.drop, tiles: number[] = [];
  s.tiles.forEach((t, i) => {
    if (t.biome !== 'water' || t.height < level) return;
    tiles.push(i);
    t.biome = 'sand';
    t.walkable = true;
  });
  s.climate.drought = { since: s.tick, tiles };
  s.terrainVersion += 1;
  w.emit({ type: 'drought_started', tiles: tiles.length, at: { ...s.village.center } });
}

function endDrought(w: World): void {
  const s = w.s, d = s.climate.drought!;
  for (const i of d.tiles) { const t = s.tiles[i]!; t.biome = 'water'; t.walkable = !!t.bridge; }
  s.climate.drought = null;
  s.terrainVersion += 1;
  // anything that wandered onto the old shallows wades back out
  for (const g of s.goblins) if (!g.heldByGod && !g.airborne && !isWalkable(s, Math.floor(g.pos.x), Math.floor(g.pos.y))) { const q = dryLand(w, g.pos); if (q) { g.pos = q; g.activity.path = []; } }
  w.emit({ type: 'drought_ended', tiles: d.tiles.length, at: { ...s.village.center } });
}

/** A star falls: a little crater, a star stone, and every goblin awake nearby looks up. */
export function shootingStar(w: World, at: Vec2): void {
  const s = w.s, S = D.star;
  for (let y = Math.floor(at.y - S.crater - 1); y <= at.y + S.crater + 1; y++)
    for (let x = Math.floor(at.x - S.crater - 1); x <= at.x + S.crater + 1; x++) {
      const t = tileAt(s, x, y), d = Math.hypot(x + 0.5 - at.x, y + 0.5 - at.y);
      if (t && t.biome !== 'water' && d <= S.crater && t.occupiedBy === null) t.height = q4(Math.max(W.waterLevel + 0.01, t.height - S.depth * (1 - d / S.crater)));
    }
  s.terrainVersion += 1;
  spawnGroundItem(w, { type: 'star_stone', qty: 1 }, at);
  w.emit({ type: 'shooting_star', at: { ...at } });
  noteStar(w, at); // P8.5: Starfall the evening after
  for (const g of s.goblins) if (!g.heldByGod && !g.airborne && dist(g.pos, at) <= S.lookRange && g.activity.action !== 'sleep_home' && g.activity.action !== 'sleep_ground') forceAction(g, w, 'look_up', at);
}

function maybeStar(w: World): void {
  const s = w.s, S = D.star;
  if (!isNight(w.clock) || !w.rng.chance(S.perNightHour)) return;
  const c = s.village.center;
  for (let i = 0; i < 8; i++) {
    const p = { x: q4(clamp(c.x + w.rng.range(-S.range, S.range), 1, s.size.w - 1)), y: q4(clamp(c.y + w.rng.range(-S.range, S.range), 1, s.size.h - 1)) };
    if (isWalkable(s, Math.floor(p.x), Math.floor(p.y)) && !s.buildings.some((b) => dist(b.pos, p) < 3)) return shootingStar(w, p);
  }
}

/** §6 step 3b (hourly): book the weather, start or end floods and droughts, maybe drop a star. */
export function updateClimate(w: World): void {
  const s = w.s, c = s.climate;
  if (s.tick % HOUR !== 0) return;
  if (RAINY.has(s.weather.kind)) c.rainHours++;
  if (c.flood || c.godFloods.length) floodDamage(w);
  for (const f of c.godFloods.filter((x) => x.until <= s.tick)) { drain(w, f.tiles); w.emit({ type: 'flood_receded', tiles: f.tiles.length, at: { ...f.pos } }); }
  c.godFloods = c.godFloods.filter((x) => x.until > s.tick);
  maybeStar(w);
  if (s.tick % DAY !== 0) return;
  // a new day: book yesterday
  const rainy = c.rainHours >= D.rainyHours, dry = c.rainHours === 0;
  c.rainDays = rainy ? c.rainDays + 1 : 0;
  c.dryDays = dry ? c.dryDays + 1 : 0;
  c.rainHours = 0;
  if (!c.flood && c.rainDays >= D.flood.days) startFlood(w);
  else if (c.flood && !rainy && s.tick - c.flood.since >= D.flood.minDays * DAY) endFlood(w);
  const summer = w.clock.season === 'summer';
  if (!c.drought && summer && c.dryDays >= D.drought.days) startDrought(w);
  else if (c.drought && (!dry || !summer)) endDrought(w);
}
