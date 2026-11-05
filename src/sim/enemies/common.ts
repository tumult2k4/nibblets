/**
 * Shared enemy plumbing (§14.1): per-kind stats, intent switching with pathing around fences, walking a path, and the
 * one-alarm-per-enemy "spotted" rule. Each kind's brain lives in its own module (gnasher, bramblebeast, wisp).
 */
import { CFG } from '../config';
import { dist, q4 } from '../../shared/math';
import { isWalkable } from '../grid';
import { shelterOf } from '../temperature';
import { enemyCanStand } from '../fences';
import type { EnemyKind, Vec2 } from '../../shared/types';
import type { Enemy, Goblin } from '../state';
import type { World } from '../world';
import { markDanger } from '../danger';
import { foughtTogether } from '../goblin/social';

const E = CFG.enemies;

export interface EnemyStats { hp: number; dmg: number; speed: number; fleeAt: number }
export const statsOf = (kind: EnemyKind): EnemyStats => E[kind];

export const awake = (g: Goblin): boolean => !g.heldByGod && !g.airborne && g.activity.action !== 'sleep_home' && g.activity.action !== 'sleep_ground';
export const exposed = (w: World, g: Goblin): boolean => !g.heldByGod && !g.airborne && !shelterOf(w, g);
export const running = (e: Enemy): boolean => e.mode === 'flee' || e.mode === 'leave';
/** Wisps mean no harm in the fighting sense: nobody flees from, fights or raises an alarm over them. */
export const harmless = (e: Enemy): boolean => e.kind === 'night_wisp';

/**
 * Does this enemy menace a goblin at `pos` that can see `r` tiles? Running enemies and wisps never do; a Bramblebeast,
 * which pays goblins no mind, only up close (6 tiles) or while it is swiping at someone.
 */
export function menaces(e: Enemy, pos: Vec2, r: number): boolean {
  if (running(e) || harmless(e)) return false;
  const reach = e.kind === 'bramblebeast' && e.mode !== 'attack' ? Math.min(r, E.bramblebeast.scareRadius) : r;
  return dist(e.pos, pos) <= reach;
}

/** Path around fences; a running enemy scrambles over anything if it must. False if it cannot get there. */
export function setPath(w: World, e: Enemy, to: Vec2): boolean {
  const p = w.enemyPath(e.pos, to) ?? (running(e) ? w.path(e.pos, to) ?? [] : null);
  if (!p) return false;
  e.path = [...p.slice(0, -1), { x: to.x, y: to.y }];
  e.target = { x: to.x, y: to.y };
  return true;
}

/** Switch intent and path there; on failure the old intent stays. */
export function setMode(w: World, e: Enemy, mode: Enemy['mode'], to: Vec2, targetId: number | null = null): boolean {
  const prev = { mode: e.mode, targetId: e.targetId };
  const fleeing = mode === 'flee' && e.mode !== 'flee';
  e.mode = mode;
  e.targetId = targetId;
  e.timer = 0;
  if (!setPath(w, e, to)) { e.mode = prev.mode; e.targetId = prev.targetId; return false; }
  if (fleeing) {
    foughtTogether(w, e, prev.mode === 'attack' ? prev.targetId : null);
    w.emit({ type: 'enemy_fled', enemyId: e.id, kind: e.kind, at: e.pos });
  }
  return true;
}

/** Walk along the path at the kind's speed; returns true on arrival. */
export function moveEnemy(w: World, e: Enemy, speedMul: number): boolean {
  const wp = e.path[0];
  if (!wp) { e.velocity = { x: 0, y: 0 }; return true; }
  const speed = (statsOf(e.kind).speed / CFG.tickHz) * speedMul;
  const dx = wp.x - e.pos.x, dy = wp.y - e.pos.y, d = Math.hypot(dx, dy);
  if (d <= Math.max(speed, 0.05)) {
    e.pos = { x: q4(wp.x), y: q4(wp.y) };
    e.path.shift();
    return e.path.length === 0;
  }
  const nx = q4(e.pos.x + (dx / d) * speed), ny = q4(e.pos.y + (dy / d) * speed);
  if (running(e) ? isWalkable(w.s, Math.floor(nx), Math.floor(ny)) : enemyCanStand(w, nx, ny)) e.pos = { x: nx, y: ny };
  else e.path.shift(); // stuck on a corner: skip the waypoint
  e.velocity = { x: q4((dx / d) * speed), y: q4((dy / d) * speed) };
  e.facing = q4(Math.atan2(dy, dx));
  return false;
}

/** First sighting of a threat: one alarm (drives fencing), an event and a startled shout. */
export function spotted(w: World, e: Enemy, by: Goblin): void {
  e.seen = true;
  if (harmless(e)) return;
  w.s.threat.alarms++;
  markDanger(w, e.pos, 0.5);
  w.emit({ type: 'enemy_spotted', goblinId: by.id, enemyId: e.id, at: e.pos });
  w.emit({ type: 'emote', goblinId: by.id, emote: 'exclaim' });
}

/** Reached its way out of the map? */
export const atHome = (e: Enemy): boolean => dist(e.pos, e.home) <= E.despawnDist;
