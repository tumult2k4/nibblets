/**
 * Fishing (§11.2, P7.2): fish keep to the shallows (wildlife.ts); a goblin with a rod finds a shore tile near one,
 * casts and waits for a bite. More fish about and forage skill make for shorter waits; a catch takes a fish out of
 * the water for good (they come back slowly). The spot is remembered.
 */
import { CFG } from './config';
import { dist } from '../shared/math';
import { isShore } from './grid';
import type { Vec2 } from '../shared/types';
import type { Critter, Goblin } from './state';
import type { World } from './world';

const F = CFG.economy.fishing;

/** The shore tile within 3 tiles of `p` closest to it, if any. */
function shoreNear(w: World, p: Vec2): Vec2 | null {
  let best: Vec2 | null = null, bd = 3;
  const cx = Math.floor(p.x), cy = Math.floor(p.y);
  for (let y = cy - 3; y <= cy + 3; y++) for (let x = cx - 3; x <= cx + 3; x++) {
    if (!isShore(w.s, x, y)) continue;
    const t = { x: x + 0.5, y: y + 0.5 }, d = dist(t, p);
    if (d < bd) { bd = d; best = t; }
  }
  return best;
}

/** Fish within `r` of `p`. */
export const fishNear = (w: World, p: Vec2, r: number): Critter[] => w.s.wildlife.filter((c) => c.kind === 'fish' && dist(c.pos, p) <= r);

/** Where to fish: a shore tile next to the nearest fish in reach that nobody else is fishing from. */
export function fishingSpot(g: Goblin, w: World): { stand: Vec2; fish: Critter } | null {
  const taken = w.s.goblins.filter((o) => o !== g && o.activity.action === 'fish' && o.activity.target).map((o) => o.activity.target!);
  const fish = w.s.wildlife.filter((c) => c.kind === 'fish' && dist(c.pos, g.pos) < F.range).sort((a, b) => dist(a.pos, g.pos) - dist(b.pos, g.pos) || a.id - b.id);
  for (const c of fish) {
    const stand = shoreNear(w, c.pos);
    if (stand && !taken.some((t) => dist(t, stand) < 1.5)) return { stand, fish: c };
  }
  return null;
}

/** Ticks until a bite at `stand`: a random wait, shorter with skill and with more fish about. */
export function biteTicks(w: World, stand: Vec2, forage: number): number {
  const n = fishNear(w, stand, F.near).length;
  const [lo, hi] = F.wait;
  return Math.round(w.rng.range(lo, hi) / (1 + F.skillMul * forage) / Math.min(2, 0.6 + 0.4 * n));
}

/** Land the nearest fish by `stand` (it leaves the water for good). */
export function landFish(w: World, stand: Vec2): boolean {
  const c = fishNear(w, stand, F.near + 2).sort((a, b) => dist(a.pos, stand) - dist(b.pos, stand))[0];
  if (!c) return false;
  w.s.wildlife.splice(w.s.wildlife.indexOf(c), 1);
  return true;
}
