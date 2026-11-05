import { q4 } from '../shared/math';
import { CFG } from './config';
import { isWalkable } from './grid';
import type { Goblin } from './state';
import type { World } from './world';
import { goblinSpeed } from './goblin/goblin';
import { groundSpeedMul } from './weather';
import type { Vec2 } from '../shared/types';
import { gateTiles } from './pathfinding';

/** On a fence post, not a gate: goblins climb over, slowly (P5.7). */
export function climbing(w: World, p: Vec2): boolean {
  const x = Math.floor(p.x), y = Math.floor(p.y);
  if (x < 0 || y < 0 || x >= w.s.size.w || y >= w.s.size.h) return false;
  const i = y * w.s.size.w + x;
  return w.enemyBlocked()[i] === 1 && !gateTiles(w.s).has(i);
}

/** Plan a path for the goblin's current activity to `to`. Returns false if unreachable. */
export function planPath(w: World, g: Goblin, to: Vec2): boolean {
  const p = w.path(g.pos, to);
  if (!p) return false;
  // finish at the exact target point rather than its tile center
  if (p.length) p[p.length - 1] = { x: to.x, y: to.y };
  else p.push({ x: to.x, y: to.y });
  g.activity.path = p;
  return true;
}

/**
 * Seek along waypoints with light separation from nearby goblins.
 * Returns 'arrived' when the path is consumed.
 */
export function moveAlong(w: World, g: Goblin, speedMul = 1): 'arrived' | 'moving' {
  const path = g.activity.path;
  const wp = path[0];
  if (!wp) {
    g.velocity = { x: 0, y: 0 };
    return 'arrived';
  }
  const speed = goblinSpeed(g) * speedMul * groundSpeedMul(w, g.pos) * (climbing(w, g.pos) ? CFG.watch.climbSpeed : 1);
  const dx = wp.x - g.pos.x;
  const dy = wp.y - g.pos.y;
  const d = Math.hypot(dx, dy);
  if (d <= Math.max(speed, path.length === 1 ? CFG.goblin.arriveRadius * 0.3 : 0.05)) {
    g.pos = { x: q4(wp.x), y: q4(wp.y) };
    path.shift();
    g.velocity = { x: 0, y: 0 };
    return path.length ? 'moving' : 'arrived';
  }
  let vx = (dx / d) * speed;
  let vy = (dy / d) * speed;
  // separation (cheap, only from goblins in the same few cells)
  const near = w.goblinHash.query(g.pos, CFG.goblin.separationRadius);
  for (const o of near) {
    if (o.id === g.id || o.heldByGod) continue;
    const ox = g.pos.x - o.pos.x;
    const oy = g.pos.y - o.pos.y;
    const od = Math.hypot(ox, oy);
    if (od < 1e-4) continue;
    const push = (1 - od / CFG.goblin.separationRadius) * CFG.goblin.separationForce * speed;
    vx += (ox / od) * push;
    vy += (oy / od) * push;
  }
  const nx = q4(g.pos.x + vx);
  const ny = q4(g.pos.y + vy);
  if (isWalkable(w.s, Math.floor(nx), Math.floor(ny))) g.pos = { x: nx, y: ny };
  else g.pos = { x: q4(g.pos.x + (dx / d) * speed), y: q4(g.pos.y + (dy / d) * speed) };
  g.velocity = { x: q4(vx), y: q4(vy) };
  g.facing = q4(Math.atan2(vy, vx));
  return 'moving';
}

export const faceToward = (g: Goblin, p: Vec2): void => {
  g.facing = q4(Math.atan2(p.y - g.pos.y, p.x - g.pos.x));
};
