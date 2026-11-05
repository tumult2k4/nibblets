import { createNoise2D } from 'simplex-noise';
import type { Biome, PlantKind, Vec2 } from '../shared/types';
import { Rng } from '../shared/rng';
import { clamp, q4, smoothstep } from '../shared/math';
import { CFG } from './config';
import type { Tile, WorldState, Plant } from './state';
import { inBounds, tileAt, tileIndex } from './grid';
import { allocId } from '../shared/ids';

export type TerrainPreset = 'island' | 'valley' | 'archipelago' | 'riverlands';
export const TERRAIN_PRESETS: readonly TerrainPreset[] = ['island', 'valley', 'archipelago', 'riverlands'];

interface PresetParams { falloff: number; base: number; scaleMul: number; river: number; valley: number }
const PRESETS: Record<TerrainPreset, PresetParams> = {
  island: { falloff: 1.0, base: 0.12, scaleMul: 1, river: 0, valley: 0 },
  valley: { falloff: 0.45, base: 0.1, scaleMul: 0.9, river: 0, valley: 1 },
  archipelago: { falloff: 0.9, base: 0.0, scaleMul: 1.8, river: 0, valley: 0 },
  riverlands: { falloff: 0.55, base: 0.12, scaleMul: 1, river: 1, valley: 0 },
};

/** Seeded heightfield: 2 octaves of simplex + preset shaping + island falloff. */
export function generateTiles(seed: number, w: number, h: number, preset: TerrainPreset): Tile[] {
  const rng = new Rng(seed).fork('worldgen');
  const n1 = createNoise2D(() => rng.next());
  const n2 = createNoise2D(() => rng.next());
  const nm = createNoise2D(() => rng.next());
  const nf = createNoise2D(() => rng.next());
  const p = PRESETS[preset];
  const C = CFG.world;
  const riverPhase = rng.range(0, Math.PI * 2);
  const tiles: Tile[] = [];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const nx = x / w - 0.5;
      const ny = y / h - 0.5;
      const s = C.noiseScale * p.scaleMul;
      let e = 0.5 + 0.5 * n1(x * s, y * s);
      e = (e + C.octave2Weight * (0.5 + 0.5 * n2(x * C.octave2Scale, y * C.octave2Scale))) / (1 + C.octave2Weight);
      const d = Math.min(1, Math.hypot(nx, ny) * 2);
      e = e * (1 - p.falloff * smoothstep(0.55, 1.0, d)) + p.base * (1 - d);
      if (p.valley) e += 0.25 * Math.abs(nx) * 2 - 0.05;
      if (p.river) {
        const rv = Math.abs(ny + 0.12 * Math.sin(nx * 9 + riverPhase));
        e -= 0.3 * (1 - smoothstep(0.0, 0.05, rv));
      }
      // edges always sink into the sea
      const edge = Math.min(x, y, w - 1 - x, h - 1 - y);
      if (edge < 3) e = Math.min(e, 0.18);
      const height = q4(clamp(e, 0, 1));
      const moisture = q4(clamp(0.5 + 0.5 * nm(x * 0.05, y * 0.05), 0, 1));
      const forestN = 0.5 + 0.5 * nf(x * 0.07, y * 0.07);
      const biome = biomeFor(height, moisture, forestN);
      tiles.push({
        height, biome, moisture, fertility: q4(clamp(0.4 + 0.4 * moisture, 0, 1)),
        walkable: biome !== 'water', wear: 0, occupiedBy: null, snow: 0,
      });
    }
  return tiles;
}

function biomeFor(h: number, m: number, forest: number): Biome {
  const C = CFG.world;
  if (h < C.waterLevel) return 'water';
  if (h < C.waterLevel + C.sandBand) return 'sand';
  if (h > C.rockLevel) return 'rock';
  if (m > C.marshMoisture && h < C.waterLevel + 0.1) return 'marsh';
  if (forest > C.forestNoiseThreshold) return 'forest';
  return 'meadow';
}

/** Bridson-ish Poisson-disc scatter over tiles that pass `accept`. Deterministic for a given rng. */
export function poissonScatter(
  s: WorldState, rng: Rng, count: number, minDist: number, accept: (x: number, y: number) => boolean,
  taken: Vec2[],
): Vec2[] {
  const out: Vec2[] = [];
  const md2 = minDist * minDist;
  let attempts = 0;
  while (out.length < count && attempts < count * 40) {
    attempts++;
    const x = rng.range(1, s.size.w - 1);
    const y = rng.range(1, s.size.h - 1);
    if (!accept(Math.floor(x), Math.floor(y))) continue;
    let ok = true;
    for (const t of taken) if ((t.x - x) ** 2 + (t.y - y) ** 2 < md2) { ok = false; break; }
    if (!ok) continue;
    const p = { x: q4(x), y: q4(y) };
    out.push(p);
    taken.push(p);
  }
  return out;
}

export function makePlant(s: WorldState, kind: PlantKind, pos: Vec2, stage: Plant['stage'], fruit = 0): Plant {
  return {
    id: allocId(s), kind, pos, stage, growth: 0, fruit, fruitProgress: 0, hydration: 0.6, hp: 100,
    plantedBy: null, age: stage === 'mature' ? 20 : 0, blight: 0,
  };
}

/** Scatter worldgen resources (§P1.4). Only apple bushes are interactive in P1; the rest is decor. */
export function scatterResources(s: WorldState, rng: Rng): void {
  const C = CFG.world;
  const taken: Vec2[] = [];
  const biomeIs = (...bs: Biome[]) => (x: number, y: number) => {
    const t = tileAt(s, x, y);
    return !!t && bs.includes(t.biome);
  };
  for (const p of poissonScatter(s, rng, C.appleBushes, C.poissonMinDist, biomeIs('meadow'), taken))
    s.plants.push(makePlant(s, 'apple_bush', p, 'mature', rng.int(2, CFG.plants.maxApples)));
  for (const p of poissonScatter(s, rng, C.trees, 1.6, biomeIs('forest'), taken))
    s.plants.push(makePlant(s, 'tree', p, 'mature'));
  for (const p of poissonScatter(s, rng, C.berryBushes, C.poissonMinDist, biomeIs('forest', 'meadow'), taken))
    s.plants.push(makePlant(s, 'berry_bush', p, 'mature'));
  for (const p of poissonScatter(s, rng, C.flowers, 1.2, biomeIs('meadow'), taken))
    s.plants.push(makePlant(s, 'flower', p, 'mature'));
  for (const p of poissonScatter(s, rng, C.rocks, 2, biomeIs('rock', 'meadow', 'sand', 'forest'), taken)) {
    const size = rng.int(1, 3) as 1 | 2 | 3;
    s.rocks.push({ id: allocId(s), pos: p, size, stoneLeft: size * 4, flintChance: 0.15 });
  }
  for (const p of poissonScatter(s, rng, C.grassPatches, 1.5, biomeIs('meadow'), []))
    s.grass.push({ id: allocId(s), pos: p, density: q4(rng.range(0.4, 1)) });
}

/** Pick a village center: walkable meadow tile with water within 4–12 tiles, close to the map center. */
export function findVillageCenter(s: WorldState): Vec2 {
  let best: Vec2 = { x: s.size.w / 2, y: s.size.h / 2 };
  let bestScore = -Infinity;
  for (let y = 4; y < s.size.h - 4; y += 2)
    for (let x = 4; x < s.size.w - 4; x += 2) {
      const t = s.tiles[tileIndex(s, x, y)]!;
      if (t.biome !== 'meadow') continue;
      let water = 99;
      for (let r = 2; r <= 12 && water === 99; r++)
        for (let a = 0; a < 16; a++) {
          const wx = Math.round(x + Math.cos((a / 16) * Math.PI * 2) * r);
          const wy = Math.round(y + Math.sin((a / 16) * Math.PI * 2) * r);
          if (inBounds(s, wx, wy) && s.tiles[tileIndex(s, wx, wy)]!.biome === 'water') { water = r; break; }
        }
      const dc = Math.hypot(x - s.size.w / 2, y - s.size.h / 2);
      let meadow = 0, rock = 0, n = 0;
      for (let dy = -6; dy <= 6; dy += 2)
        for (let dx = -6; dx <= 6; dx += 2) {
          if (!inBounds(s, x + dx, y + dy)) continue;
          const b = s.tiles[tileIndex(s, x + dx, y + dy)]!.biome;
          n++;
          if (b === 'meadow') meadow++;
          if (b === 'rock') rock++;
        }
      const score = (water >= 4 && water <= 12 ? 30 : water < 4 ? 10 : 0) - dc * 0.5 + (meadow / Math.max(1, n)) * 30 - rock * 4;
      if (score > bestScore) { bestScore = score; best = { x: x + 0.5, y: y + 0.5 }; }
    }
  return best;
}
