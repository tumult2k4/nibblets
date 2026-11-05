import { Rng } from '../../shared/rng';
import type { Vec2 } from '../../shared/types';
import { CFG } from '../config';
import { createWorldState } from '../newWorld';
import type { Goblin, Plant, Tile } from '../state';
import { World } from '../world';
import { founderGenome } from '../goblin/genetics/founders';
import type { Genome } from '../goblin/genetics/genome';
import { createGoblin } from '../goblin/goblin';
import { makePlant } from '../worldgen';

export interface TestWorldOpts { seed?: number; size?: number; goblins?: number; flat?: boolean; pond?: boolean }

/**
 * Small deterministic test world. `flat` replaces terrain with an even meadow (pond in the
 * north-west corner unless `pond: false`) and clears worldgen scatter.
 */
export function makeWorld(o: TestWorldOpts = {}): World {
  const size = o.size ?? 24;
  const s = createWorldState({ seed: o.seed ?? 1, size, founders: o.goblins ?? 0 });
  if (o.flat !== false) {
    const tiles: Tile[] = [];
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        const water = o.pond !== false && x < 4 && y < 4;
        tiles.push({ height: water ? 0.2 : 0.45, biome: water ? 'water' : 'meadow', fertility: 0.6, moisture: 0.6, walkable: !water, wear: 0, occupiedBy: null, snow: 0 });
      }
    s.tiles = tiles;
    s.plants = [];
    s.rocks = [];
    s.grass = [];
    s.mushrooms = [];
    s.village.center = { x: size / 2, y: size / 2 };
    s.village.stockpilePos = { x: size / 2 + 2.5, y: size / 2 + 1.5 };
    s.goblins.forEach((g, i) => (g.pos = { x: size / 2 + (i % 4) - 2, y: size / 2 + Math.floor(i / 4) - 1 }));
    s.terrainVersion += 1;
  }
  return new World(s);
}

export function spawnGoblin(w: World, o: { genome?: Genome; ageDays?: number; pos?: Vec2 } = {}): Goblin {
  const rng = new Rng(w.s.nextId * 7919);
  const g = createGoblin(w.s, rng, {
    genome: o.genome ?? founderGenome(rng, 'mixed'),
    pos: o.pos ?? { x: w.s.size.w / 2, y: w.s.size.h / 2 },
    ageDays: o.ageDays ?? 25,
    clanId: w.s.clans[0]?.id ?? 0,
  });
  g.needs = { ...g.needs, hunger: 90, thirst: 90, energy: 90, curiosity: 90 };
  w.s.goblins.push(g);
  w.rebuildCaches();
  return g;
}

export function placePlant(w: World, kind: Plant['kind'], stage: Plant['stage'], pos: Vec2, fruit = 0): Plant {
  const p = makePlant(w.s, kind, pos, stage, fruit);
  w.s.plants.push(p);
  w.markPlantsDirty();
  w.rebuildCaches();
  return p;
}

export function runTicks(w: World, n: number, until?: () => boolean): number {
  for (let i = 0; i < n; i++) {
    w.step();
    if (until?.()) return i + 1;
  }
  return n;
}

/** Set clock to mid-morning of day `day`. */
export function setMorning(w: World, day = 1): void {
  w.s.tick = day * CFG.time.dayTicks + Math.round(0.15 * CFG.time.dayTicks);
  w.clock = { ...w.clock };
  w.step();
}

export const HOUR = CFG.god.hourTicks;
