import { CFG } from '../config';
import { clamp, q4 } from '../../shared/math';
import type { Biome, PlantKind, Vec2 } from '../../shared/types';
import type { Tile } from '../state';
import type { World } from '../world';
import { tileAt, isWalkable } from '../grid';
import { allocId } from '../../shared/ids';
import { removePlant, siteOk, spawnPlant } from '../plants';
import { divineAct } from './faith';

const T = CFG.terraform;
const W = CFG.world;

export const TERRAFORM_POWERS = ['raise_land', 'lower_land', 'smooth', 'create_water', 'fertile_soil', 'plant_forest', 'place_rock'] as const;
export type TerraformPower = (typeof TERRAFORM_POWERS)[number];
export const FOREST_KINDS: PlantKind[] = ['apple_bush', 'berry_bush', 'tree', 'flower'];

/** Biome after a height change: below water level → water; risen water → sand at the shore, meadow above. */
export function rebiome(t: Tile): void {
  const wl = W.waterLevel;
  let b: Biome = t.biome;
  if (t.height < wl) b = 'water';
  else if (t.biome === 'water') b = t.height < wl + W.sandBand ? 'sand' : 'meadow';
  else if (t.height > W.rockLevel && t.biome !== 'snow') b = 'rock';
  else if (t.biome === 'rock' && t.height < W.rockLevel - 0.05) b = 'meadow';
  t.biome = b;
  t.walkable = b !== 'water';
}

/** Tiles under a round brush with linear falloff (1 at the center, 0 at the rim). */
function* brush(w: World, c: Vec2, r: number): Generator<{ t: Tile; x: number; y: number; f: number }> {
  for (let y = Math.floor(c.y - r); y <= Math.ceil(c.y + r); y++)
    for (let x = Math.floor(c.x - r); x <= Math.ceil(c.x + r); x++) {
      const t = tileAt(w.s, x, y);
      if (!t) continue;
      const d = Math.hypot(x + 0.5 - c.x, y + 0.5 - c.y);
      if (d > r) continue;
      yield { t, x, y, f: 1 - d / (r + 0.5) };
    }
}

/**
 * One brush stroke tick of a terraform power (§17.5.3). Height/biome edits bump `terrainVersion`
 * (path cache + renderer chunk rebuilds); things left standing in new water are cleaned up.
 */
export function terraform(w: World, power: TerraformPower, pos: Vec2, radius: number, option?: string): void {
  const s = w.s;
  const r = clamp(radius, 1, T.maxRadius);
  let shaped = false;
  switch (power) {
    case 'raise_land':
    case 'lower_land': {
      const sign = power === 'raise_land' ? 1 : -1;
      for (const { t, f } of brush(w, pos, r)) {
        if (sign < 0 && t.occupiedBy !== null) continue; // never lower under buildings
        t.height = q4(clamp(t.height + sign * T.raiseStep * f, 0, 1));
        rebiome(t);
        shaped = true;
      }
      break;
    }
    case 'smooth': {
      const cells = [...brush(w, pos, r)];
      const next = cells.map(({ x, y, t, f }) => {
        let sum = 0, n = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const o = tileAt(s, x + dx, y + dy);
          if (o) { sum += o.height; n++; }
        }
        return q4(t.height + (sum / n - t.height) * T.smoothK * f);
      });
      cells.forEach((c, i) => { c.t.height = next[i]!; rebiome(c.t); });
      shaped = cells.length > 0;
      break;
    }
    case 'create_water':
      for (const { t, f } of brush(w, pos, r)) {
        if (f < 0.25 || t.occupiedBy !== null) continue;
        t.height = q4(Math.min(t.height, W.waterLevel - T.waterDepth));
        rebiome(t);
        t.moisture = 1;
        shaped = true;
      }
      break;
    case 'fertile_soil':
      for (const { t, f } of brush(w, pos, r)) if (t.biome !== 'water') t.fertility = q4(Math.min(T.fertileMax, t.fertility + T.fertileAdd * f));
      break;
    case 'plant_forest': {
      const kind = (FOREST_KINDS as string[]).includes(option ?? '') ? (option as PlantKind) : 'apple_bush';
      for (let i = 0; i < T.forestPerStroke; i++) {
        const a = w.rng.range(0, Math.PI * 2);
        const d = w.rng.range(0, r);
        const p = { x: q4(pos.x + Math.cos(a) * d), y: q4(pos.y + Math.sin(a) * d) };
        if (!siteOk(w, p, kind === 'flower' ? 0.6 : 1.2)) continue;
        spawnPlant(w, kind, p, kind === 'flower' ? 'mature' : 'sprout', null);
      }
      break;
    }
    case 'place_rock': {
      const t = tileAt(s, pos.x, pos.y);
      if (!t || t.biome === 'water') return;
      const size = clamp(Math.round(Number(option) || 2), 1, 3) as 1 | 2 | 3;
      s.rocks.push({ id: allocId(s), pos: { x: q4(pos.x), y: q4(pos.y) }, size, stoneLeft: size * T.rockStone, flintChance: 0.15 });
      s.terrainVersion += 1; // renderer rebuilds props on version change
      break;
    }
  }
  if (shaped) {
    s.terrainVersion += 1;
    afterReshape(w, pos, r + 1);
  }
  const key = '_witness_terraform';
  if (s.tick - (s.god.cooldowns[key] ?? -1e9) >= T.witnessEveryTicks) {
    s.god.cooldowns[key] = s.tick;
    divineAct(w, power, pos);
  }
}

/** Plants drown, items sink, goblins scramble to the nearest dry tile. */
function afterReshape(w: World, c: Vec2, r: number): void {
  const s = w.s;
  const wet = (p: Vec2) => !isWalkable(s, Math.floor(p.x), Math.floor(p.y));
  for (const p of [...s.plants]) if (Math.hypot(p.pos.x - c.x, p.pos.y - c.y) <= r && wet(p.pos)) {
    w.emit({ type: 'plant_died', plantId: p.id, kind: p.kind, at: p.pos });
    removePlant(w, p);
  }
  s.groundItems = s.groundItems.filter((it) => it.airborne || Math.hypot(it.pos.x - c.x, it.pos.y - c.y) > r || !wet(it.pos));
  s.rocks = s.rocks.filter((rk) => Math.hypot(rk.pos.x - c.x, rk.pos.y - c.y) > r || !wet(rk.pos));
  for (const g of s.goblins) {
    if (g.airborne || !wet(g.pos)) continue;
    const dry = nearestDry(w, g.pos);
    if (dry) {
      g.pos = dry;
      g.activity.status = 'done';
      g.activity.path = [];
    }
  }
}

export function nearestDry(w: World, p: Vec2): Vec2 | null {
  for (let rad = 1; rad < 12; rad++)
    for (let dy = -rad; dy <= rad; dy++)
      for (let dx = -rad; dx <= rad; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== rad) continue;
        const x = Math.floor(p.x) + dx, y = Math.floor(p.y) + dy;
        if (isWalkable(w.s, x, y)) return { x: x + 0.5, y: y + 0.5 };
      }
  return null;
}

/** §P2.7 paths: feet wear tiles every few ticks; wear fades daily. Crossing the road threshold changes path costs. */
export function updateWear(w: World): void {
  const s = w.s;
  const P = CFG.paths;
  if (s.tick % P.wearEvery === 0)
    for (const g of s.goblins) {
      if (g.airborne || (g.velocity.x === 0 && g.velocity.y === 0)) continue;
      const t = tileAt(s, g.pos.x, g.pos.y);
      if (!t) continue;
      const before = t.wear > P.roadAt;
      t.wear = q4(Math.min(1, t.wear + P.wearPerStep));
      if (before !== t.wear > P.roadAt) s.terrainVersion += 1;
    }
  if (s.tick % CFG.time.dayTicks === 0)
    for (const t of s.tiles) {
      if (t.wear <= 0) continue;
      const before = t.wear > P.roadAt;
      t.wear = q4(Math.max(0, t.wear - P.decayPerDay));
      if (before !== t.wear > P.roadAt) s.terrainVersion += 1;
    }
}
