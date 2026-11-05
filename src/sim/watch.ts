/**
 * The watch (§11.1, §7.8, P5.7). A watchtower inside the fence ring is climbed by a night guard, who sees three
 * times as far from up there; a threat spotted from a tower raises the alarm early (`tower_warning`): children run
 * home and the defenders know where it is coming from. Gates go into the ring where goblins cross it most (the most
 * worn ring tile; a post standing there makes way), at most two, six tiles apart: goblins walk through at walking
 * pace instead of climbing, enemies are kept out as by a post.
 */
import { CFG } from './config';
import { dist, q4 } from '../shared/math';
import { fnv1a } from '../shared/rng';
import { isComplete, placeBlueprint, removeBuilding, siteClear, siteTilesOk } from './buildings';
import { isFence, ringRadius, ringTiles } from './fences';
import { tileAt } from './grid';
import { deposit } from './stockpile';
import type { Vec2 } from '../shared/types';
import type { Building, Enemy, Goblin, WorldState } from './state';
import type { World } from './world';

const W = CFG.watch;

export const watchtowers = (s: WorldState): Building[] => s.buildings.filter((b) => b.type === 'watchtower' && isComplete(b));
export const gates = (s: WorldState): Building[] => s.buildings.filter((b) => b.type === 'gate');

/** The tower this goblin is keeping watch on (up top), if any. */
export function towerOf(g: Goblin, w: World): Building | null {
  const a = g.activity;
  if (a.action !== 'guard' || a.status !== 'running' || a.stage !== 1 || a.targetId === null) return null;
  const b = w.s.buildings.find((x) => x.id === a.targetId);
  return b && b.type === 'watchtower' && isComplete(b) && dist(b.pos, g.pos) < 0.5 ? b : null;
}

/** A finished tower with nobody on watch (or walking up to it), nearest first. */
export function freeTower(g: Goblin, w: World): Building | null {
  const taken = new Set(w.s.goblins.filter((o) => o !== g && o.activity.action === 'guard' && o.activity.status === 'running').map((o) => o.activity.targetId));
  return watchtowers(w.s).filter((b) => !taken.has(b.id)).sort((a, b) => dist(a.pos, g.pos) - dist(b.pos, g.pos))[0] ?? null;
}

/** Sight multiplier from where the goblin stands (×3 up a tower). */
export const towerSight = (g: Goblin, w: World): number => (towerOf(g, w) ? W.visionMul : 1);
/** How high the goblin stands above the ground (render). */
export const elevation = (g: Goblin, w: World): number => (towerOf(g, w) ? W.platform : 0);

/** Is the village on alert after a warning from the tower? */
export const warned = (w: World): boolean => (w.s.threat.warnUntil ?? -1) > w.s.tick;

/** A threat was first seen by `by`: from a tower, that is an early warning to everyone. */
export function towerWarning(w: World, e: Enemy, by: Goblin): void {
  if (!towerOf(by, w)) return;
  w.s.threat.warnUntil = w.s.tick + W.warnTicks;
  w.s.threat.warnAt = { ...e.pos };
  w.emit({ type: 'tower_warning', goblinId: by.id, enemyId: e.id, kind: e.kind, at: { ...e.pos } });
}

// --- siting --------------------------------------------------------------------------------------------------------

const ringOf = (w: World): number => w.s.village.fenceRing || ringRadius(w);
const posts = (s: WorldState): number => s.buildings.filter((b) => isFence(b) && isComplete(b)).length;

/** Where the next gate goes: the most worn ring tile that is free or holds a post, away from other gates. */
export function gateSite(w: World): Vec2 | null {
  const s = w.s;
  if (!s.village.fenceRing) return null;
  const others = gates(s).map((b) => b.pos);
  let best: Vec2 | null = null, bs = -Infinity;
  for (const p of ringTiles(s, ringOf(w))) {
    const t = tileAt(s, Math.floor(p.x), Math.floor(p.y));
    if (!t || !t.walkable || t.biome === 'water') continue;
    const here = t.occupiedBy === null ? null : s.buildings.find((b) => b.id === t.occupiedBy);
    if (here && !isFence(here)) continue;
    if (others.some((q) => dist(q, p) < W.gateSpacing) || dist(p, s.village.stockpilePos) < CFG.fences.stockpileGap) continue;
    // the trail through this tile counts double; trails just beside it count too
    let wear = t.wear;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) wear += tileAt(s, Math.floor(p.x) + dx, Math.floor(p.y) + dy)?.wear ?? 0;
    const score = wear + (fnv1a(`${p.x},${p.y}`, s.seed) % 1000) / 1e5;
    if (score > bs) { bs = score; best = p; }
  }
  return best;
}

/** Should the village put a gate in its fence now? */
export const wantsGate = (w: World): boolean =>
  !!w.s.village.fenceRing && posts(w.s) >= W.gatePosts && gates(w.s).length < W.maxGates && !gates(w.s).some((b) => !isComplete(b)) && !!gateSite(w);

/** Mark out a gate at `p`; a post standing there is taken down and its wood goes to the stockpile. */
export function placeGate(w: World, p: Vec2): Building {
  const t = tileAt(w.s, Math.floor(p.x), Math.floor(p.y));
  const post = t?.occupiedBy != null ? w.s.buildings.find((b) => b.id === t.occupiedBy && isFence(b)) : undefined;
  if (post && removeBuilding(w, post) && isComplete(post)) deposit(w.s, { type: 'wood', qty: 1 });
  return placeBlueprint(w, 'gate', p, null);
}

/** Where the tower goes: just inside the ring, facing where the danger has come from (else the far side from water). */
export function towerSite(w: World): Vec2 | null {
  const s = w.s, c = s.village.center, ring = ringOf(w);
  const mark = s.threat.marks[s.threat.marks.length - 1];
  const toward = mark ? Math.atan2(mark.pos.y - c.y, mark.pos.x - c.x) : 0;
  let best: Vec2 | null = null, bs = -Infinity;
  for (let dr = 1.5; dr <= 4; dr += 0.5)
    for (let k = 0; k < 48; k++) {
      const a = (k / 48) * Math.PI * 2;
      const p = { x: Math.round(c.x + Math.cos(a) * (ring - dr)), y: Math.round(c.y + Math.sin(a) * (ring - dr)) };
      if (!siteTilesOk(s, p, 1) || !siteClear(w, p, 1) || dist(p, s.village.stockpilePos) < 2.5) continue;
      // clear of other buildings; posts of the ring may stand close by
      if (s.buildings.some((b) => dist(b.pos, p) < (isFence(b) || b.type === 'gate' ? 1.2 : 1.2 + b.footprint.w / 2))) continue;
      const da = Math.abs(Math.atan2(Math.sin(a - toward), Math.cos(a - toward)));
      const score = -da - dr * 0.1 + (fnv1a(`${p.x},${p.y}`, s.seed) % 1000) / 1e5;
      if (score > bs) { bs = score; best = p; }
    }
  return best ? { x: q4(best.x), y: q4(best.y) } : null;
}

/** One tower, once the fence is going up. */
export const wantsTower = (w: World): boolean =>
  !!w.s.village.fenceRing && posts(w.s) >= W.gatePosts && !w.s.buildings.some((b) => b.type === 'watchtower') && !!towerSite(w);
