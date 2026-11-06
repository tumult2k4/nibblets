/**
 * Settlement (§11.1, §13.3, P7.3): the hearth a family builds against its home's wall (a contained fire like the
 * campfire, so it warms the home and its eggs, and the place stew is cooked), the longhouse, the well and the
 * nursery. Where each goes and when the village wants one; the actions live in ai/actions.
 */
import { CFG } from './config';
import { dist, q4 } from '../shared/math';
import { buildingDef, footprintTiles, isComplete, siteClear, siteTilesOk } from './buildings';
import { tileAt } from './grid';
import { isLit } from './fire';
import { stockCount } from './stockpile';
import { foodStores } from './spoilage';
import { surplusApples } from './preserve';
import { nestSpot } from './eggs';
import type { ItemType, Vec2 } from '../shared/types';
import type { Building, WorldState } from './state';
import type { World } from './world';

const S = CFG.settlement;

/** The hearth (built or planned) against `home`'s wall. */
export const hearthOf = (s: WorldState, home: Building): Building | undefined =>
  s.buildings.find((b) => b.type === 'hearth' && b.data?.home === home.id);

/** A free tile against `home`'s wall for its hearth, away from the nest by the door (first clear one going round). */
export function hearthSite(w: World, home: Building): Vec2 | null {
  const fp = home.footprint.w, tiles = footprintTiles(home.pos, fp);
  const x0 = tiles[0]!.x, y0 = tiles[0]!.y, nest = nestSpot(home);
  const ring: Vec2[] = [];
  for (let x = x0 - 1; x <= x0 + fp; x++) ring.push({ x, y: y0 - 1 }, { x, y: y0 + fp });
  for (let y = y0; y < y0 + fp; y++) ring.push({ x: x0 - 1, y }, { x: x0 + fp, y });
  // a 1-tile building at integer `pos` sits on tile `pos`; its center is half a tile in
  const ok = ring.filter((p) => siteTilesOk(w.s, p, 1) && siteClear(w, p, 1) && dist({ x: p.x + 0.5, y: p.y + 0.5 }, nest) > 1.3);
  ok.sort((a, b) => Math.atan2(a.y - home.pos.y, a.x - home.pos.x) - Math.atan2(b.y - home.pos.y, b.x - home.pos.x));
  return ok[0] ?? null;
}

/** A home that sleeps people (hut, stone hut, longhouse). */
export const isHome = (b: Building): boolean => (buildingDef(b.type)?.capacity ?? 0) > 0;

// ---- stew -------------------------------------------------------------------------------------------------------

const MEATY: readonly ItemType[] = ['cooked_fish', 'fish', 'cooked_meat', 'meat'];
const ANY: readonly ItemType[] = ['apple', 'mushroom', 'berry', ...MEATY];

/** What one stew takes: apple + mushroom + fish/meat if all three are there, else 2 of the most plentiful. */
export function stewFrom(count: (t: ItemType) => number): ItemType[] | null {
  const meat = MEATY.find((t) => count(t) > 0);
  if (meat && count('apple') > 0 && count('mushroom') > 0) return ['apple', 'mushroom', meat];
  const t = [...ANY].sort((a, b) => count(b) - count(a))[0]!;
  return count(t) >= 2 ? [t, t] : null;
}
/** From the store: apples only out of a plentiful surplus (the racks and grinding stone come first, P5.6). */
export const stewInputs = (s: WorldState): ItemType[] | null =>
  stewFrom((t) => (t === 'apple' ? Math.max(0, surplusApples(s) - S.stew.appleSpare) : stockCount(s, t)));
/** Everything a stew can be made of (what a cook carries back if it is left over). */
export const STEW_FOODS: readonly ItemType[] = ANY;

/** A lit hearth near the store to cook stew at, if the store can spare the food and wants more stew. */
export function stewHearth(w: World): Building | null {
  const s = w.s;
  if (stockCount(s, 'stew') >= Math.ceil(s.goblins.length * S.stew.perGoblin) || foodStores(s).days < S.stew.minDays || !stewInputs(s)) return null;
  let best: Building | null = null, bd: number = S.stew.range;
  for (const b of s.buildings) {
    if (b.type !== 'hearth' || !isLit(b)) continue;
    const d = dist(b.pos, s.village.stockpilePos);
    if (d < bd) { bd = d; best = b; }
  }
  return best;
}

// ---- village wants ----------------------------------------------------------------------------------------------

const has = (s: WorldState, type: Building['type']): boolean => s.buildings.some((b) => b.type === type);

/** A longhouse once a grown village outgrows its huts, and only one. */
export function wantsLonghouse(s: WorldState): boolean {
  // (a settled village's hall: not before it has a few homes of its own)
  if (has(s, 'longhouse') || s.buildings.filter((b) => isHome(b) && isComplete(b)).length < S.longhouse.homes) return false;
  const homeless = s.goblins.filter((g) => (g.lifeStage === 'adult' || g.lifeStage === 'elder') && g.homeId === null).length;
  return homeless >= S.longhouse.homeless && s.goblins.length >= S.longhouse.pop;
}

/** Water within `r` of `p` (any water tile). */
const waterSeen = new WeakMap<WorldState, { ver: number; at: Map<string, boolean> }>();
/** Open water within `r` of `p`? Remembered until the land changes (every biome change bumps `terrainVersion`, P11.3). */
function waterWithin(s: WorldState, p: Vec2, r: number): boolean {
  let c = waterSeen.get(s);
  if (!c || c.ver !== s.terrainVersion) waterSeen.set(s, (c = { ver: s.terrainVersion, at: new Map() }));
  const k = `${p.x},${p.y},${r}`;
  let v = c.at.get(k);
  if (v === undefined) c.at.set(k, (v = waterScan(s, p, r)));
  return v;
}
function waterScan(s: WorldState, p: Vec2, r: number): boolean {
  for (let y = Math.floor(p.y - r); y <= p.y + r; y++)
    for (let x = Math.floor(p.x - r); x <= p.x + r; x++)
      if (tileAt(s, x, y)?.biome === 'water' && Math.hypot(x + 0.5 - p.x, y + 0.5 - p.y) <= r) return true;
  return false;
}

/** A well once the water is a walk from the village center, and only one. */
export const wantsWell = (s: WorldState): boolean => !has(s, 'well') && !waterWithin(s, s.village.center, S.well.farWater);

/** A nursery once there are eggs or couples about, and only one. */
export const wantsNursery = (s: WorldState): boolean =>
  !has(s, 'nursery') && (s.eggs.length > 0 || s.goblins.some((g) => g.relationships.some((r) => r.bond === 'mate')));

// ---- the well ---------------------------------------------------------------------------------------------------

export const wells = (s: WorldState): Building[] => s.buildings.filter((b) => b.type === 'well' && isComplete(b));
/** Where to stand to draw water at a well (one side, spread a little by goblin id). */
export const wellSpot = (b: Building, id: number): Vec2 => ({ x: q4(b.pos.x + 0.5 + Math.cos(id * 2.4) * 0.85), y: q4(b.pos.y + 0.5 + Math.sin(id * 2.4) * 0.85) });
/** Is `p` a spot at a well? */
export const atWell = (s: WorldState, p: Vec2): Building | undefined => wells(s).find((b) => dist({ x: b.pos.x + 0.5, y: b.pos.y + 0.5 }, p) < 1.2);

// ---- the nursery ------------------------------------------------------------------------------------------------

/** The finished nursery within reach of `pos` (a home), if any. */
export const nurseryNear = (s: WorldState, pos: Vec2): Building | undefined =>
  s.buildings.find((b) => b.type === 'nursery' && isComplete(b) && dist(b.pos, pos) <= S.nursery.range);
/** Is an egg at `pos` inside a finished nursery? */
export const inNursery = (s: WorldState, pos: Vec2): boolean =>
  s.buildings.some((b) => b.type === 'nursery' && isComplete(b) && dist(b.pos, pos) <= S.nursery.radius);
/** A free nest in the nursery: the ring of straw nests inside, the first with no egg on it. */
export function nurseryNest(s: WorldState, b: Building): Vec2 {
  for (let i = 0; i < S.nursery.spots; i++) {
    const a = (i / S.nursery.spots) * Math.PI * 2 + 0.3;
    const p = { x: q4(b.pos.x + Math.cos(a) * 0.55), y: q4(b.pos.y + Math.sin(a) * 0.55) };
    if (!s.eggs.some((e) => dist(e.pos, p) < 0.25)) return p;
  }
  return { x: b.pos.x, y: b.pos.y };
}
