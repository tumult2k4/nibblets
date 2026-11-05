/** Versioned JSON saves with stepwise migrations (§23.5) and the canonical state hash (§3.2). */
import { fnv1a } from '../shared/rng';
import { CFG } from './config';
import { STARTER_RECIPES } from './recipes';
import type { LoggedCommand, Tile, WorldState } from './state';
import { World } from './world';
import type { Biome } from '../shared/types';

const BIOMES: Biome[] = ['meadow', 'forest', 'sand', 'rock', 'water', 'marsh', 'snow'];

/** Tiles are stored column-wise to keep saves small enough for localStorage. */
interface PackedTiles { n: number; height: number[]; biome: number[]; fertility: number[]; moisture: number[]; wear: number[]; snow: number[]; occ: (number | null)[] }

function packTiles(tiles: Tile[]): PackedTiles {
  return {
    n: tiles.length,
    height: tiles.map((t) => t.height), biome: tiles.map((t) => BIOMES.indexOf(t.biome)),
    fertility: tiles.map((t) => t.fertility), moisture: tiles.map((t) => t.moisture),
    wear: tiles.map((t) => t.wear), snow: tiles.map((t) => t.snow), occ: tiles.map((t) => t.occupiedBy),
  };
}
function unpackTiles(p: PackedTiles): Tile[] {
  const out: Tile[] = [];
  for (let i = 0; i < p.n; i++) {
    const biome = BIOMES[p.biome[i]!]!;
    out.push({
      height: p.height[i]!, biome, fertility: p.fertility[i]!, moisture: p.moisture[i]!,
      walkable: biome !== 'water', wear: p.wear[i]!, occupiedBy: p.occ[i] ?? null, snow: p.snow[i]!,
    });
  }
  return out;
}

export function serialize(s: WorldState): string {
  const { tiles, ...rest } = s;
  return JSON.stringify({ ...rest, tiles: packTiles(tiles) });
}

type Migration = (raw: Record<string, unknown>) => Record<string, unknown>;
/** migrations[v] upgrades a save of version v to v+1. */
export const MIGRATIONS: Record<number, Migration> = {
  // v1 → v2 (P2.3): village stockpile
  1: (raw) => {
    const v = raw.village as { center: { x: number; y: number } } & Record<string, unknown>;
    raw.village = { ...v, stockpile: [], stockpilePos: { x: v.center.x + 2, y: v.center.y + 1 } };
    return raw;
  },
  // v2 → v3 (P3.1): weather forecast + local weather cells
  2: (raw) => {
    const wx = raw.weather as Record<string, unknown>;
    raw.weather = { ...wx, upcoming: wx.kind, cells: [] };
    return raw;
  },
  // v3 → v4 (P4.2): starter recipes known; equipped slots hold stacks (durability, quality)
  3: (raw) => {
    for (const g of raw.goblins as { knownRecipes: string[]; equipped: Record<string, unknown> }[]) {
      g.knownRecipes = [...new Set([...g.knownRecipes, ...STARTER_RECIPES])];
      for (const k of Object.keys(g.equipped)) if (typeof g.equipped[k] === 'string') g.equipped[k] = { type: g.equipped[k], qty: 1 };
    }
    return raw;
  },
  // v4 → v5 (P4.4): enemies + spawn director
  4: (raw) => {
    raw.enemies = [];
    raw.threat = { night: -1, spawnAt: [] };
    return raw;
  },
  // v5 → v6 (P4.5): injuries become a list of healing wounds; fights survived are counted
  5: (raw) => {
    for (const g of raw.goblins as { health: { injuries: unknown }; deeds: Record<string, number> }[]) {
      g.health.injuries = [];
      g.deeds.fights ??= 0;
    }
    return raw;
  },
  // v6 → v7 (P4.6): fence ring radius; spotted-enemy count
  6: (raw) => {
    (raw.village as Record<string, unknown>).fenceRing = 0;
    (raw.threat as Record<string, unknown>).alarms = 0;
    return raw;
  },
};

export function deserialize(json: string): WorldState {
  let raw = JSON.parse(json) as Record<string, unknown>;
  let v = (raw.version as number) ?? 1;
  while (v < CFG.saveVersion) {
    const m = MIGRATIONS[v];
    if (!m) throw new Error(`no migration from save version ${v}`);
    raw = m(raw);
    v += 1;
    raw.version = v;
  }
  const tiles = unpackTiles(raw.tiles as PackedTiles);
  return { ...(raw as unknown as WorldState), tiles };
}

export const loadWorld = (json: string): World => new World(deserialize(json));

/** Canonical JSON with sorted keys; `llm` annotations excluded from the hash. */
export function canonical(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'null';
  if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
  const o = v as Record<string, unknown>;
  const keys = Object.keys(o).filter((k) => o[k] !== undefined).sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonical(o[k])).join(',') + '}';
}

export function stateHash(s: WorldState): string {
  const { llm: _llm, ...rest } = s;
  return fnv1a(canonical(rest)).toString(16).padStart(8, '0');
}

/** Replay: rebuild tick 0 from genParams, then re-apply the command log at its original ticks. */
export function replayTo(s: WorldState, targetTick: number, make: (s: WorldState) => World, createState: (p: WorldState['genParams']) => WorldState): World {
  const w = make(createState(s.genParams));
  const log: LoggedCommand[] = s.commandLog;
  let i = 0;
  while (w.s.tick < targetTick) {
    while (i < log.length && log[i]!.tick === w.s.tick) w.queue.push(log[i++]!.cmd);
    w.step();
  }
  return w;
}
