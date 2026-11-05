import { Rng } from '../shared/rng';
import { allocId } from '../shared/ids';
import { q4 } from '../shared/math';
import { CFG } from './config';
import type { WorldState } from './state';
import { findVillageCenter, generateTiles, scatterResources, type TerrainPreset } from './worldgen';
import { founderGenome, type ClanArchetype } from './goblin/genetics/founders';
import { createGoblin } from './goblin/goblin';
import { seedClanRelations } from './goblin/social';
import { newGodState, type GameMode } from './god/godState';
import { isWalkable, tileAt } from './grid';
import type { Vec2 } from '../shared/types';
import { World } from './world';

export interface WorldParams {
  seed: number;
  size?: number;
  preset?: TerrainPreset;
  archetype?: ClanArchetype;
  founders?: number;
  mode?: GameMode;
  gentle?: boolean;
  villageName?: string;
  /** "Reroll founders" in the wizard bumps this */
  founderSalt?: number;
  difficulty?: 'cozy' | 'normal' | 'harsh';
}

/** Everything needed to rebuild the world at tick 0 (used by replay). */
export type GenParams = Required<Omit<WorldParams, 'villageName'>> & { villageName: string };

export function resolveParams(p: WorldParams): GenParams {
  const seedRng = new Rng(p.seed).fork('params');
  return {
    seed: p.seed >>> 0,
    size: p.size ?? CFG.world.w,
    preset: p.preset ?? 'island',
    archetype: p.archetype ?? 'mixed',
    founders: p.founders ?? CFG.goblin.founders,
    mode: p.mode ?? 'sandbox',
    gentle: p.gentle ?? false,
    villageName: p.villageName ?? villageNameFor(seedRng),
    founderSalt: p.founderSalt ?? 0,
    difficulty: p.difficulty ?? 'normal',
  };
}

const VN_A = ['Moss', 'Apple', 'Mud', 'Pebble', 'Bramble', 'Puddle', 'Toad', 'Crook', 'Nettle', 'Fern'];
const VN_B = ['bottom', 'hollow', 'dell', 'nook', 'burrow', 'knoll', 'mire', 'patch', 'wick', 'hump'];
function villageNameFor(r: Rng): string {
  return r.pick(VN_A) + r.pick(VN_B);
}

export function createWorldState(params: WorldParams): WorldState {
  const p = resolveParams(params);
  const w = p.size, h = p.size;
  const s: WorldState = {
    version: CFG.saveVersion, seed: p.seed, tick: CFG.time.startTick, nextId: 1, rngState: 0,
    size: { w, h }, preset: p.preset, terrainVersion: 0,
    tiles: generateTiles(p.seed, w, h, p.preset),
    goblins: [], eggs: [], plants: [], rocks: [], grass: [], mushrooms: [], wildlife: [], groundItems: [],
    buildings: [], fires: [], enemies: [], threat: { night: -1, spawnAt: [], alarms: 0, marks: [] }, graves: [], places: [],
    clans: [], village: { name: p.villageName, center: { x: w / 2, y: h / 2 }, chiefId: null, stockpile: [], stockpilePos: { x: w / 2, y: h / 2 }, fenceRing: 0 },
    god: newGodState(p.mode, p.gentle), commandLog: [],
    weather: { kind: 'clear', nextChangeTick: CFG.weather.transitionTicks, temperature: 14, windDir: 0, upcoming: 'clear', cells: [] },
    stats: { samples: [], deaths: {}, births: 0, eaten: 0, divineFood: 0 },
    llm: { journals: [], speechText: {} },
    genParams: p,
  };
  const rng = new Rng(p.seed);
  scatterResources(s, rng.fork('scatter'));
  s.village.center = findVillageCenter(s);
  s.village.stockpilePos = stockpileSpot(s);
  const clanId = allocId(s);
  s.clans.push({ id: clanId, name: p.villageName, archetype: p.archetype });
  const frng = rng.fork(`founders${p.founderSalt || ''}`);
  const c = s.village.center;
  for (let i = 0; i < p.founders; i++) {
    let pos = c;
    for (let t = 0; t < 30; t++) {
      const a = frng.range(0, Math.PI * 2);
      const r = frng.range(0.5, 4);
      const cand = { x: q4(c.x + Math.cos(a) * r), y: q4(c.y + Math.sin(a) * r) };
      if (isWalkable(s, Math.floor(cand.x), Math.floor(cand.y))) { pos = cand; break; }
    }
    const genome = founderGenome(frng, p.archetype);
    const age = frng.range(CFG.goblin.startAgeDays[0], CFG.goblin.startAgeDays[1]);
    s.goblins.push(createGoblin(s, frng, { genome, pos, ageDays: age, clanId }));
  }
  seedClanRelations(frng, s.goblins);
  s.rngState = rng.fork('sim').state;
  return s;
}

export const createWorld = (p: WorldParams): World => new World(createWorldState(p));

/** First walkable tile 2–3 tiles east/south of the village center (deterministic spiral). */
export function stockpileSpot(s: WorldState): Vec2 {
  const c = s.village.center;
  for (const [dx, dy] of [[2, 1], [2, -1], [-2, 1], [1, 2], [-1, -2], [3, 0], [0, 3], [-3, 0], [0, -3]] as const) {
    const t = tileAt(s, c.x + dx, c.y + dy);
    if (t?.walkable) return { x: Math.floor(c.x + dx) + 0.5, y: Math.floor(c.y + dy) + 0.5 };
  }
  return { x: c.x, y: c.y };
}
