/**
 * The kiln (§11.1, §11.2, P7.2): clay goods are fired there. A firing is a Craft at a finished kiln within reach: the
 * crafter brings the clay and a wood for the fire and tends it for the recipe's ticks. Now and then a spark jumps to a
 * plant or wooden building right next to the kiln (§10.3: 5 % a firing). Clay itself is dug on marsh ground and on
 * sand or meadow by the water.
 */
import { CFG } from './config';
import { dist } from '../shared/math';
import { isComplete } from './buildings';
import { tileAt } from './grid';
import { RECIPES } from './recipes';
import { startFire } from './wildfire';
import type { RecipeId, Vec2 } from '../shared/types';
import type { Building, Goblin, WorldState } from './state';
import type { World } from './world';

const E = CFG.economy;

export const isKilnRecipe = (id: RecipeId): boolean => RECIPES[id]?.station === 'kiln';
export const kilns = (s: WorldState): Building[] => s.buildings.filter((b) => b.type === 'kiln' && isComplete(b));

/** The nearest finished kiln within reach of `g`, if any. */
export function kilnFor(g: Goblin, w: World): Building | null {
  let best: Building | null = null, bd: number = E.kiln.range;
  for (const b of kilns(w.s)) {
    const d = dist(b.pos, g.pos);
    if (d < bd) { bd = d; best = b; }
  }
  return best;
}

/** After a firing: a spark may catch a plant or a wooden building beside the kiln. */
export function kilnSpark(w: World, k: Building): void {
  if (!w.rng.chance(E.kiln.spark)) return;
  const near = (p: Vec2): boolean => dist(p, k.pos) <= E.kiln.sparkNear;
  const fuel = w.s.plants.find((p) => near(p.pos) && p.stage !== 'seed') ?? w.s.buildings.find((b) => b !== k && near(b.pos) && (CFG.disasters.fire.burnable as readonly string[]).includes(b.type));
  if (fuel) startFire(w, { ...fuel.pos }, 0.4, 'kiln');
}

/** Clay ground: marsh, or sand or meadow with water right beside it. */
export function isClayGround(s: WorldState, x: number, y: number): boolean {
  const t = tileAt(s, x, y);
  if (!t || !t.walkable) return false;
  if (t.biome === 'marsh') return true;
  if (t.biome !== 'sand' && t.biome !== 'meadow') return false;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) if (tileAt(s, x + dx, y + dy)?.biome === 'water') return true;
  return false;
}

const clayCache = new WeakMap<WorldState, { ver: number; tiles: Vec2[]; cells: Map<number, number[]> }>();
const CELL = 8;
/** Every clay tile (centers), and their places in 8×8 buckets (P11.3), cached until the land changes. */
function clayTiles(s: WorldState): { tiles: Vec2[]; cells: Map<number, number[]> } {
  let c = clayCache.get(s);
  if (!c || c.ver !== s.terrainVersion) {
    const tiles: Vec2[] = [], cells = new Map<number, number[]>();
    for (let y = 0; y < s.size.h; y++) for (let x = 0; x < s.size.w; x++) if (isClayGround(s, x + 0.5, y + 0.5)) {
      const k = Math.floor(y / CELL) * 1024 + Math.floor(x / CELL);
      (cells.get(k) ?? cells.set(k, []).get(k)!).push(tiles.length);
      tiles.push({ x: x + 0.5, y: y + 0.5 });
    }
    clayCache.set(s, (c = { ver: s.terrainVersion, tiles, cells }));
  }
  return c;
}

/** The nearest clay ground within `r` of `pos` (the first in map order on a tie). */
export function clayNear(s: WorldState, pos: Vec2, r: number): Vec2 | null {
  const { tiles, cells } = clayTiles(s);
  let best: Vec2 | null = null, bd = r, bi = -1;
  for (let cy = Math.floor((pos.y - r) / CELL); cy <= Math.floor((pos.y + r) / CELL); cy++)
    for (let cx = Math.floor((pos.x - r) / CELL); cx <= Math.floor((pos.x + r) / CELL); cx++)
      for (const i of cells.get(cy * 1024 + cx) ?? []) {
        const t = tiles[i]!, d = dist(t, pos);
        if (d < bd || (d === bd && i < bi)) { bd = d; bi = i; best = t; }
      }
  return best;
}
