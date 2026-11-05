/**
 * Wildfire (§10.3, §14.4, P6.2). Unlike a campfire, a fire on open ground spreads: each burning tile grows hotter while
 * it has fuel (trees, bushes, grass, wooden buildings, forest litter), eats that fuel, and catches its eight
 * neighbours by their fuel, the season's dryness, the wind (downwind far likelier) and heatwaves. Rain and snow damp it
 * and stop it spreading. Whatever stands in it burns: plants die (trees to stumps), buildings take damage, eggs are
 * lost, goblins and enemies get hurt. A burned-out tile is left with ash, which feeds the soil (+fertility).
 *
 * Fires start from lightning (storms strike now and then; so does the god), from heatwaves on dry ground, and from the
 * god's fire powers. Goblins stomp them out (`ExtinguishFire`) and run from them (`EscapeFire`).
 */
import { CFG } from './config';
import { clamp, dist, q4 } from '../shared/math';
import { tileAt } from './grid';
import { weatherAt } from './weather';
import { removePlant } from './plants';
import { damageBuilding } from './storms';
import { hurtGoblin, killEnemy } from './combat';
import { isNight } from './time';
import type { Vec2 } from '../shared/types';
import type { Fire, Plant, Tile } from './state';
import type { World } from './world';

const F = CFG.disasters.fire;
const DAY = CFG.time.dayTicks, HOUR = CFG.god.hourTicks;
const BURNABLE = new Set<string>(F.burnable);
const WET = new Set(['rain', 'storm', 'snow', 'blizzard']);

const key = (x: number, y: number): string => `${x},${y}`;
export const fireAt = (w: World, x: number, y: number): Fire | undefined => w.s.fires.find((f) => f.x === x && f.y === y);
/** The burning tile under `pos`, if any. */
export const burningAt = (w: World, pos: Vec2): Fire | undefined => fireAt(w, Math.floor(pos.x), Math.floor(pos.y));
/** Nearest burning tile within `r` of `pos`. */
export function nearestFire(w: World, pos: Vec2, r: number): Fire | null {
  let best: Fire | null = null, bd = r;
  for (const f of w.s.fires) {
    const d = dist(pos, { x: f.x + 0.5, y: f.y + 0.5 });
    if (d <= bd) { bd = d; best = f; }
  }
  return best;
}

const onTile = (p: Vec2, x: number, y: number): boolean => Math.floor(p.x) === x && Math.floor(p.y) === y;
const plantsOn = (w: World, x: number, y: number): Plant[] => w.plantHash.query({ x: x + 0.5, y: y + 0.5 }, 0.8).filter((p) => onTile(p.pos, x, y));

function plantFuel(p: Plant): number {
  const grown = p.stage === 'mature' || p.stage === 'old';
  if (p.stage === 'stump') return F.fuel.stump;
  if (p.stage === 'dead') return F.fuel.dead;
  if (p.stage === 'seed' || p.stage === 'sprout') return 0;
  if (p.kind === 'tree') return grown ? F.fuel.tree : F.fuel.treeYoung;
  if (p.kind === 'flower') return F.fuel.flower;
  return grown ? F.fuel.bush : F.fuel.bushYoung;
}

/** Everything on a tile that would burn. */
export function tileFuel(w: World, x: number, y: number): number {
  const t = tileAt(w.s, x, y);
  if (!t || t.biome === 'water' || t.snow > 0.3) return 0;
  if ((t.ash ?? 0) > 0.5) return 0; // burned in the last few days: nothing left to catch
  let fuel = t.biome === 'forest' ? F.fuel.forest : t.biome === 'meadow' ? F.fuel.meadow : 0;
  for (const p of plantsOn(w, x, y)) fuel += plantFuel(p);
  for (const gp of w.s.grass) if (onTile(gp.pos, x, y) && gp.density > 0.5) fuel += F.fuel.grass * gp.density;
  for (const b of w.s.buildings) if (BURNABLE.has(b.type) && dist(b.pos, { x: x + 0.5, y: y + 0.5 }) <= b.footprint.w / 2 + 0.2) fuel += F.fuel.building;
  return q4(fuel);
}

/** Set a tile alight (if there is anything to burn). Returns the fire, or null. */
export function ignite(w: World, x: number, y: number, intensity: number, cause: string): Fire | null {
  const s = w.s;
  if (fireAt(w, x, y) || s.fires.length >= F.maxFires) return null;
  const fuel = tileFuel(w, x, y);
  if (fuel <= 0.05) return null;
  const f: Fire = { x, y, intensity: q4(clamp(intensity, 0.05, 1)), fuel, since: s.tick, cause };
  s.fires.push(f);
  return f;
}

/** Start a wildfire at `pos` (lightning, heat, the god): emits `fire_started` when it catches. */
export function startFire(w: World, pos: Vec2, intensity: number, cause: string): boolean {
  const f = ignite(w, Math.floor(pos.x), Math.floor(pos.y), intensity, cause);
  if (f) w.emit({ type: 'fire_started', cause, at: { x: f.x + 0.5, y: f.y + 0.5 } });
  return !!f;
}

/** How readily things burn here today: season × weather (0 in rain or snow). */
function dryness(w: World, pos: Vec2): number {
  const wx = weatherAt(w, pos);
  if (WET.has(wx)) return 0;
  return F.dryness[w.clock.season] * (wx === 'heatwave' ? F.heatwaveMul : 1);
}

/** Burn what stands on a burning tile. */
function scorch(w: World, f: Fire): void {
  const s = w.s, k = f.intensity, c = { x: f.x + 0.5, y: f.y + 0.5 };
  for (const p of plantsOn(w, f.x, f.y)) {
    if (p.stage === 'seed' || p.stage === 'stump' || s.god.held?.id === p.id) continue; // stumps char but stay (and may sprout again)
    p.hp = q4(p.hp - F.plantDmg * k);
    if (p.hp > 0) continue;
    w.emit({ type: 'plant_died', plantId: p.id, kind: p.kind, at: p.pos });
    if (p.kind === 'tree' && p.stage !== 'dead') { p.stage = 'stump'; p.growth = 0; p.fruit = 0; p.hp = 100; w.markPlantsDirty(); }
    else removePlant(w, p);
  }
  for (const gp of s.grass) if (onTile(gp.pos, f.x, f.y)) gp.density = q4(Math.max(0, gp.density - 0.1 * k));
  for (const b of [...s.buildings]) if (BURNABLE.has(b.type) && dist(b.pos, c) <= b.footprint.w / 2 + 0.2) damageBuilding(w, b, F.buildingDmg * k, 'fire');
  for (const g of [...s.goblins]) if (!g.heldByGod && !g.airborne && onTile(g.pos, f.x, f.y)) hurtGoblin(w, g, F.goblinDmg * k, 'fire');
  for (const e of [...s.enemies]) if (onTile(e.pos, f.x, f.y) && (e.hp = q4(e.hp - F.enemyDmg * k)) <= 0) killEnemy(w, e, null);
  for (const egg of [...s.eggs]) if (onTile(egg.pos, f.x, f.y) && !egg.airborne && k > 0.4) {
    s.eggs.splice(s.eggs.indexOf(egg), 1);
    w.emit({ type: 'egg_lost', eggId: egg.id, parents: egg.parents, cause: 'fire', at: { ...egg.pos } });
  }
}

/** Ash where a fire burned out: fertility up, grey ground that fades. */
function leaveAsh(t: Tile | undefined): void {
  if (!t) return;
  t.ash = 1;
  t.fertility = q4(Math.min(1, t.fertility + F.ashFertility));
}

function spread(w: World, f: Fire, lit: Set<string>): void {
  const c = { x: f.x + 0.5, y: f.y + 0.5 };
  const dry = dryness(w, c);
  if (dry <= 0) return;
  const wind = w.s.weather.windDir;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    if (!dx && !dy) continue;
    const x = f.x + dx, y = f.y + dy;
    if (lit.has(key(x, y))) continue;
    const fuel = tileFuel(w, x, y);
    if (fuel <= 0.05) continue;
    const along = Math.cos(Math.atan2(dy, dx) - wind);
    const p = F.spread * f.intensity * Math.min(1, fuel) * dry * (1 + F.windK * along) * (dx && dy ? 0.7 : 1);
    if (w.rng.chance(p) && ignite(w, x, y, 0.3, f.cause)) lit.add(key(x, y));
  }
}

/** Storms throw lightning; heatwaves light dry ground. One roll an hour. */
function naturalFires(w: World): void {
  const s = w.s;
  if (s.tick % HOUR !== 0) return;
  const pick = (): Vec2 => {
    const c = s.village.center, near = w.rng.chance(0.5);
    const r = near ? F.nearVillage : Math.max(s.size.w, s.size.h);
    const x = near ? c.x + w.rng.range(-r, r) : w.rng.range(0, s.size.w), y = near ? c.y + w.rng.range(-r, r) : w.rng.range(0, s.size.h);
    return { x: clamp(x, 0.5, s.size.w - 0.5), y: clamp(y, 0.5, s.size.h - 0.5) };
  };
  if (s.weather.kind === 'storm' && w.rng.chance(F.stormStrikesPerHour)) naturalStrike(w, pick());
  if (s.weather.kind === 'heatwave' && !isNight(w.clock) && w.rng.chance(F.heatwaveIgnitePerHour)) {
    const p = pick();
    if (tileFuel(w, Math.floor(p.x), Math.floor(p.y)) >= 0.5) startFire(w, p, 0.4, 'heat');
  }
}

/** A bolt from a storm: hurts what it hits and may set the spot alight. */
export function naturalStrike(w: World, pos: Vec2): void {
  w.emit({ type: 'lightning_strike', at: { ...pos } });
  for (const g of [...w.s.goblins]) if (!g.heldByGod && dist(g.pos, pos) <= 1) hurtGoblin(w, g, F.strikeDmg, 'lightning');
  for (const b of [...w.s.buildings]) if (b.type !== 'campfire' && dist(b.pos, pos) <= b.footprint.w / 2 + 0.5) damageBuilding(w, b, F.strikeDmg / 2, 'lightning');
  if (w.rng.chance(F.strikeIgnite)) startFire(w, pos, 0.8, 'lightning');
}

/** §6 step 6: wildfires grow, spread, burn what they stand on, and go out; ash fades. */
export function updateWildfire(w: World): void {
  const s = w.s;
  naturalFires(w);
  if (s.tick % F.every !== 0) return;
  if (s.tick % (DAY / 24) === 0) fadeAsh(w);
  if (!s.fires.length) return;
  const lit = new Set(s.fires.map((f) => key(f.x, f.y)));
  for (const f of [...s.fires]) {
    const wet = WET.has(weatherAt(w, { x: f.x + 0.5, y: f.y + 0.5 }));
    f.intensity = q4(clamp(f.intensity + (wet ? -F.rainDamp : f.fuel > 0 ? F.grow : -F.grow), 0, 1));
    f.fuel = q4(Math.max(0, f.fuel - F.burn * f.intensity));
    scorch(w, f);
    spread(w, f, lit);
  }
  const out = s.fires.filter((f) => f.intensity <= 0 || (f.fuel <= 0 && f.intensity <= F.grow));
  if (!out.length) return;
  s.fires = s.fires.filter((f) => !out.includes(f));
  for (const f of out) if (s.tick - f.since > 3 * F.every) leaveAsh(tileAt(s, f.x, f.y));
}

/** Ash fades over `ashDays` (checked hourly). */
function fadeAsh(w: World): void {
  const step = 1 / (F.ashDays * 24);
  for (const t of w.s.tiles) {
    if (!t.ash) continue;
    const a = q4(t.ash - step);
    if (a > 0) t.ash = a;
    else delete t.ash;
  }
}
