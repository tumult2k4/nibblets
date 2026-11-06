import { CFG } from './config';
import { clamp, q4 } from '../shared/math';
import type { ID, PlantKind, PlantStage, Vec2 } from '../shared/types';
import type { Plant } from './state';
import type { World } from './world';
import { tileAt } from './grid';
import { makePlant } from './worldgen';
import { spawnGroundItem } from './groundItems';
import { rainingAt } from './weather';
import { gardenMul, inGarden } from './garden';

const P = CFG.plants;
const GROW: PlantStage[] = ['seed', 'sprout', 'sapling', 'young'];
export const NEXT_STAGE: Partial<Record<PlantStage, PlantStage>> = { seed: 'sprout', sprout: 'sapling', sapling: 'young', young: 'mature' };
const GROW_DAYS = GROW.reduce((a, st) => a + P.stageDays[st as keyof typeof P.stageDays], 0);

/** §8.1 growth multipliers. hydration 0 → 0.25 (dry) … 1 → 1.5 (soaked); 0.6 → 1.0. */
export const hydrationCurve = (h: number): number => 0.25 + 1.25 * clamp(h, 0, 1);
/** fertility 0.6 → 1.0, clamped to 0.5 … 1.3. */
export const fertilityMul = (f: number): number => clamp(0.5 + (f / 0.6) * 0.5, 0.5, 1.3);

export const isGrowing = (p: Plant): boolean => GROW.includes(p.stage);
export const maxFruit = (p: Plant): number =>
  p.kind === 'berry_bush' ? (p.stage === 'mature' ? P.maxBerries : 0)
    : p.kind === 'apple_bush' ? (p.stage === 'mature' ? P.maxApples : p.stage === 'old' ? P.oldMaxApples : 0)
      : p.kind === 'flower' && p.stage === 'mature' ? 1 : 0; // a flower's one bloom, picked for crowns (P5.6)

/** Can a new plant take root here? Fertile, dry land, not adjacent to another plant (§P2.2). */
/** What a goblin with the `green_thumb` trait planted grows half again as fast (P5.7). */
const greenThumb = (w: World, by: number | null): number =>
  by !== null && w.goblin(by)?.traits.includes('green_thumb') ? CFG.traits.greenThumbGrowth : 1;

export function siteOk(w: World, pos: Vec2, minGap = 1.2, ignoreId?: ID): boolean {
  const t = tileAt(w.s, pos.x, pos.y);
  if (!t || !t.walkable || t.biome === 'water' || t.biome === 'rock' || t.biome === 'sand' || (t.occupiedBy !== null && !inGarden(w.s, pos))) return false;
  for (const p of w.plantHash.query(pos, minGap + 0.5))
    if (p.id !== ignoreId && Math.hypot(p.pos.x - pos.x, p.pos.y - pos.y) < minGap && p.kind !== 'flower') return false;
  return true;
}

export function spawnPlant(w: World, kind: PlantKind, pos: Vec2, stage: PlantStage, plantedBy: ID | null): Plant {
  const p = makePlant(w.s, kind, { x: q4(pos.x), y: q4(pos.y) }, stage);
  p.age = 0;
  p.plantedBy = plantedBy;
  w.s.plants.push(p);
  w.plantHash.insert(p);
  w.markPlantsDirty();
  w.emit({ type: 'plant_born', plantId: p.id, kind, plantedBy, at: p.pos });
  return p;
}

export function removePlant(w: World, p: Plant): void {
  const i = w.s.plants.indexOf(p);
  if (i >= 0) w.s.plants.splice(i, 1);
  w.markPlantsDirty();
}

export function setStage(w: World, p: Plant, stage: PlantStage): void {
  p.stage = stage;
  p.growth = 0;
  if (maxFruit(p) < p.fruit) p.fruit = maxFruit(p);
  w.emit({ type: 'plant_stage', plantId: p.id, stage });
}

/** Scatter a seed of the same kind within 1.5–3.5 tiles (old bushes, berry accidents, flowers). */
export function selfSeed(w: World, p: Plant, kind: PlantKind = p.kind, by: ID | null = null): Plant | null {
  const a = w.rng.range(0, Math.PI * 2);
  const r = w.rng.range(1.5, 3.5);
  const pos = { x: p.pos.x + Math.cos(a) * r, y: p.pos.y + Math.sin(a) * r };
  if (!siteOk(w, pos)) return null;
  const t = tileAt(w.s, pos.x, pos.y)!;
  if (kind !== 'flower' && t.fertility < 0.25) return null;
  return spawnPlant(w, kind, pos, kind === 'flower' ? 'mature' : 'seed', by);
}

/**
 * Full plant lifecycle (§8.1): seed → sprout → sapling → young → mature → old → dead, stumps coppice.
 * Growth = 1/stageDays × hydration × fertility × season. Staggered: each plant every `updateEvery` ticks.
 */
export function updatePlants(w: World): void {
  const s = w.s;
  const every = P.updateEvery;
  const slot = s.tick % every;
  const dtDays = every / CFG.time.dayTicks;
  const season = P.seasonMul[w.clock.season];
  const dead: Plant[] = [];
  for (let i = 0; i < s.plants.length; i++) {
    const p = s.plants[i]!;
    if (p.id % every !== slot || s.god.held?.id === p.id) continue;
    const t = tileAt(s, p.pos.x, p.pos.y);
    if (!t) continue;
    // hydration follows soil moisture (rain soaks it); watering raises it above
    const rain = rainingAt(w, p.pos);
    // P6.3: in a drought the soil gives up less water
    const target = rain ? CFG.weather.rainHydration : t.moisture * P.hydrationOfMoisture * (s.climate.drought ? CFG.disasters.drought.hydrationMul : 1);
    p.hydration = q4(p.hydration + (target - p.hydration) * Math.min(1, dtDays * (rain ? CFG.weather.rainHydrationFollow : P.hydrationFollow)));
    if (p.stage === 'stump') {
      p.growth = q4(p.growth + dtDays);
      if (p.growth >= P.stumpRegrowDays) {
        if (w.rng.chance(P.stumpRegrowChance)) { p.age = 0; setStage(w, p, 'sprout'); }
        else dead.push(p);
      }
      continue;
    }
    if (p.kind === 'tree' || p.kind === 'flower') {
      if (p.kind === 'flower' && p.stage === 'mature' && season > 0) {
        if (w.rng.chance(P.flowerSpreadChancePerDay * dtDays)) selfSeed(w, p);
        if (p.fruit < 1 && (p.fruitProgress = q4(p.fruitProgress + (dtDays / P.flowerBloomDays) * season)) >= 1) { p.fruit = 1; p.fruitProgress = 0; }
      }
      if (!isGrowing(p)) continue;
    }
    p.age = q4(p.age + dtDays);
    const rate = hydrationCurve(p.hydration) * fertilityMul(t.fertility) * season * greenThumb(w, p.plantedBy) * gardenMul(w.s, p.pos);
    if (isGrowing(p)) {
      const days = P.stageDays[p.stage as keyof typeof P.stageDays] * (p.kind === 'tree' ? P.treeStageMul : 1);
      p.growth = q4(p.growth + (dtDays / days) * rate);
      if (p.growth >= 1) {
        // §8.3: a plant draws 0.15 fertility over its growth, charged per finished stage
        t.fertility = q4(Math.max(0, t.fertility - (P.fertilityDraw * days) / GROW_DAYS));
        setStage(w, p, NEXT_STAGE[p.stage]!);
      }
      continue;
    }
    if (p.stage === 'mature' && p.kind !== 'tree' && p.age >= P.matureUntilDays) setStage(w, p, 'old');
    else if (p.stage === 'old' && p.age >= P.oldUntilDays) { dead.push(p); continue; }
    if (p.stage === 'old' && season > 0 && w.rng.chance(P.oldSeedChancePerDay * dtDays)) selfSeed(w, p);
    // P5.6: winter bites — nothing ripens, and frost takes what was left hanging
    if (season > 0) growFruit(p, dtDays, season);
    else if (p.fruit > 0 && w.rng.chance((p.fruit * dtDays) / P.frostFruitDays)) p.fruit -= 1;
  }
  for (const p of dead) {
    if (p.stage !== 'stump') spawnGroundItem(w, { type: 'wood', qty: P.deadWood }, p.pos);
    w.emit({ type: 'plant_died', plantId: p.id, kind: p.kind, at: p.pos });
    removePlant(w, p);
  }
}

function growFruit(p: Plant, dtDays: number, season: number): void {
  const max = Math.floor(maxFruit(p) * (1 - p.blight)); // P6.3: a blighted bush bears less
  if (p.fruit > max) p.fruit = max;
  if (max <= 0 || p.fruit >= max) {
    p.fruitProgress = 0;
    return;
  }
  const days = p.kind === 'berry_bush' ? P.berryRegrowDays : P.appleRegrowDays * (p.stage === 'old' ? 2 : 1);
  p.fruitProgress = q4(p.fruitProgress + (dtDays / days) * season);
  if (p.fruitProgress >= 1) {
    p.fruitProgress = 0;
    p.fruit += 1;
  }
}

/** §8.3: fertility regenerates once per day on every tile, up to its moisture-derived base. */
export function updateTiles(w: World): void {
  const s = w.s;
  if (s.tick % CFG.time.dayTicks !== 0) return;
  for (const t of s.tiles) {
    const cap = 0.4 + 0.4 * t.moisture + 0.3;
    if (t.fertility < cap) t.fertility = q4(Math.min(cap, t.fertility + P.fertilityRegenPerDay));
  }
}
