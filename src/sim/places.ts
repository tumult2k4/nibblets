/**
 * Place names (§15.6, P9.2): when something notable happens (a death, a Gnasher slain, a discovery, a festival, a
 * falling star) where no place has a name, the village names the spot after the lay of the land and the deed, or the
 * goblin behind it: "Grubnok's Hill", "Sad Pond", "Gnasher Ford", "Star Hollow". The name is sim data (its parts),
 * worded by language where it is shown and in the prompts; it works without any LLM. The pick is a hash of the
 * spot and the tick, so naming draws nothing from the world's random stream.
 */
import { CFG } from './config';
import { dist } from '../shared/math';
import { fnv1a } from '../shared/rng';
import type { ID, SimEventInput, Vec2 } from '../shared/types';
import type { WorldState } from './state';
import type { World } from './world';
import { allocId } from '../shared/ids';

const P = CFG.places;

export type PlaceFeature = 'hill' | 'hollow' | 'pond' | 'shore' | 'ford' | 'wood' | 'meadow' | 'rocks' | 'bog' | 'dunes' | 'peak';
export type PlaceCause = keyof typeof P.words;
export interface Place {
  id: ID; pos: Vec2; feature: PlaceFeature; cause: PlaceCause; tick: number;
  /** the word for the cause (0-based, worded by language), or the goblin it is named after */
  word: number; person?: string; personId?: ID;
}

export const placesOf = (s: WorldState): Place[] => s.village.culture?.places ?? [];

/** The named place at (within `near` of) `p`, the nearest. */
export function placeAt(s: WorldState, p: Vec2, near: number = P.near, asOf = Infinity): Place | null {
  let best: Place | null = null, bd = near;
  for (const pl of placesOf(s)) {
    if (pl.tick > asOf) continue;
    const d = dist(pl.pos, p);
    if (d <= bd) { best = pl; bd = d; }
  }
  return best;
}

/** What the land is like at `p`. */
export function featureAt(s: WorldState, p: Vec2): PlaceFeature {
  const W = s.size.w, H = s.size.h, cx = Math.round(p.x), cy = Math.round(p.y);
  const tile = (x: number, y: number) => (x >= 0 && y >= 0 && x < W && y < H ? s.tiles[y * W + x]! : null);
  const count = (r: number, f: (x: number, y: number) => boolean) => {
    let n = 0;
    for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) if (f(x, y)) n++;
    return n;
  };
  const wet = (x: number, y: number) => tile(x, y)?.biome === 'water';
  const here = tile(cx, cy);
  if (count(P.waterR, wet)) return count(P.pondR, wet) < P.pondTiles ? 'pond' : here?.biome === 'sand' ? 'shore' : 'ford';
  let sum = 0, n = 0;
  for (let y = cy - P.around; y <= cy + P.around; y++) for (let x = cx - P.around; x <= cx + P.around; x++) {
    const t = tile(x, y);
    if (t && t.biome !== 'water') { sum += t.height; n++; }
  }
  const h = here?.height ?? 0, mean = n ? sum / n : h;
  if (h - mean > P.rise) return here?.biome === 'snow' ? 'peak' : 'hill';
  if (mean - h > P.rise) return 'hollow';
  const b = here?.biome;
  return b === 'forest' ? 'wood' : b === 'rock' ? 'rocks' : b === 'marsh' ? 'bog' : b === 'sand' ? 'dunes' : b === 'snow' ? 'peak' : 'meadow';
}

/** What a notable event says about the place it happened at: the cause, who was behind it, where. */
function notable(e: SimEventInput): { cause: PlaceCause; at: Vec2; who?: ID } | null {
  const at = e.at;
  if (!at) return null;
  switch (e.type) {
    case 'goblin_died': return { cause: 'death', at, who: e.goblinId };
    case 'enemy_killed': return { cause: 'battle', at, ...(e.killerId !== null ? { who: e.killerId } : {}) };
    case 'recipe_discovered': return e.via === 'discovery' ? { cause: 'discovery', at, ...(e.goblinId !== undefined ? { who: e.goblinId } : {}) } : null;
    case 'festival': return e.phase === 'start' ? { cause: 'festival', at } : null;
    case 'shooting_star': return { cause: 'star', at };
    default: return null;
  }
}

/** World.emit hook: name the spot of a notable event if it has no name yet. */
export function notePlace(w: World, e: SimEventInput): void {
  const s = w.s;
  if (!s?.village) return;
  const n = notable(e);
  if (!n) return;
  const ps = (s.village.culture ??= {}).places ??= [];
  if (ps.length >= P.max || ps.some((p) => dist(p.pos, n.at) < P.spacing)) return;
  const x = Math.round(n.at.x), y = Math.round(n.at.y);
  if (x < 0 || y < 0 || x >= s.size.w || y >= s.size.h) return;
  const h = fnv1a(`${s.tick}:${x}:${y}:${n.cause}`, s.seed >>> 0);
  const g = n.who !== undefined ? w.goblin(n.who) : undefined;
  const byName = !!g && (h % 1000) / 1000 < P.personShare;
  const place: Place = {
    id: allocId(s), pos: { x, y }, feature: featureAt(s, { x, y }), cause: n.cause, tick: s.tick, word: (h >>> 10) % P.words[n.cause],
    ...(byName ? { person: g.name, personId: g.id } : {}),
  };
  ps.push(place);
  w.emit({ type: 'place_named', placeId: place.id, at: { x, y } });
}
