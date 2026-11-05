/**
 * Night Wisp (§14.1, P4.7): on full-moon nights one or two lights rise over marshland near the village and drift
 * round its edge. A curious or pious goblin caught outdoors near one may fall into a trance and follow it out into the
 * dark (`follow_wisp`); the wisp fades after a while or far away, leaving the goblin dazed, glum and alone out there.
 * A lit torch within 3 tiles scatters a wisp at once; dawn ends them all. Nobody flees from or fights a wisp.
 */
import { CFG } from '../config';
import { dist, q4 } from '../../shared/math';
import { isNight } from '../time';
import { tileAt } from '../grid';
import { torchLit } from '../fire';
import { startAction } from '../ai/utility';
import { DANGER } from '../ai/actions/fight';
import type { Vec2 } from '../../shared/types';
import type { Enemy, Goblin } from '../state';
import type { World } from '../world';
import { spawnEnemy } from './director';
import { awake, exposed } from './common';
import { markDanger } from '../danger';

const W = CFG.enemies.night_wisp;
const DAY = CFG.time.dayTicks;

export const isFullMoon = (w: World): boolean => Math.abs(w.clock.moonPhase - 0.5) < 0.01;

/** Marsh tiles within reach of the village (sampled), or null if the village has no marsh nearby. */
function marshSpot(w: World): Vec2 | null {
  const c = w.s.village.center;
  for (let i = 0; i < 120; i++) {
    const p = { x: q4(c.x + w.rng.range(-W.marshRange, W.marshRange)), y: q4(c.y + w.rng.range(-W.marshRange, W.marshRange)) };
    const d = dist(p, c);
    if (d < 8 || d > W.marshRange || tileAt(w.s, p.x, p.y)?.biome !== 'marsh') continue;
    if (w.s.goblins.some((g) => dist(g.pos, p) < 6)) continue;
    return p;
  }
  return null;
}

/** As a full-moon night falls: 1–2 wisps over the nearest marsh. */
export function maybeWisps(w: World): void {
  const s = w.s;
  if (s.tick % DAY !== Math.ceil(CFG.time.phases.dusk * DAY) || !isFullMoon(w)) return;
  const n = w.rng.int(1, W.count);
  for (let i = 0; i < n && s.enemies.length < CFG.enemies.maxActive; i++) {
    const p = marshSpot(w);
    if (p) spawnWisp(w, p);
  }
}

export function spawnWisp(w: World, at: Vec2): Enemy {
  const e = spawnEnemy(w, 'night_wisp', at);
  e.nextDecide = w.s.tick;
  return e;
}

/** A point on the drifting circle round the village, near the wisp's own bearing. */
function driftPoint(w: World, e: Enemy): Vec2 {
  const c = w.s.village.center;
  const a = Math.atan2(e.pos.y - c.y, e.pos.x - c.x) + w.rng.range(-0.7, 0.7);
  const r = W.drift + w.rng.range(-2, 2);
  return { x: q4(c.x + Math.cos(a) * r), y: q4(c.y + Math.sin(a) * r) };
}

/** Out into the dark (well beyond the village), on ground a goblin can walk to. */
function lurePoint(w: World, e: Enemy): Vec2 {
  const c = w.s.village.center;
  const base = Math.atan2(e.pos.y - c.y, e.pos.x - c.x);
  for (const r of [W.lureDist, W.lureDist * 0.8, W.lureDist * 0.65])
    for (let i = 0; i < 6; i++) {
      const a = base + w.rng.range(-0.6, 0.6);
      const p = { x: q4(c.x + Math.cos(a) * r), y: q4(c.y + Math.sin(a) * r) };
      if (tileAt(w.s, p.x, p.y)?.walkable) return p;
    }
  return { ...e.pos };
}

const following = (w: World, e: Enemy): Goblin | undefined => w.s.goblins.find((g) => g.activity.action === 'follow_wisp' && g.activity.targetId === e.id);

/** Who it can work on: awake, outdoors, not fighting or fleeing, no torch, not already entranced. */
const prey = (w: World, g: Goblin): boolean =>
  g.lifeStage !== 'egg' && g.lifeStage !== 'hatchling' && awake(g) && exposed(w, g) && !torchLit(g, w)
  && !DANGER.has(g.activity.action) && g.activity.action !== 'follow_wisp';

/** Who falls for it this time (the curious and pious most of all), and the nearest it could drift toward. */
function mark(w: World, e: Enemy): { lured: Goblin | null; near: Goblin | null } {
  let near: Goblin | null = null, bd: number = W.seekRange;
  for (const g of w.goblinHash.query(e.pos, W.seekRange)) {
    const d = dist(g.pos, e.pos);
    if (d > W.seekRange || !prey(w, g)) continue;
    if (d <= W.lureRadius && w.rng.chance(W.lureChance * (g.personality.wanderlust + g.personality.piety))) return { lured: g, near: g };
    if (d < bd) { bd = d; near = g; }
  }
  return { lured: null, near };
}

export function wispDecide(w: World, e: Enemy): void {
  if (e.mode === 'lure') return;
  const { lured: g, near } = mark(w, e);
  if (g) {
    startAction(g, w, 'follow_wisp');
    g.activity.targetId = e.id;
    e.mode = 'lure';
    e.targetId = g.id;
    e.timer = W.lureTicks;
    e.path = [lurePoint(w, e)];
    markDanger(w, e.pos, 0.5);
    w.emit({ type: 'wisp', enemyId: e.id, goblinId: g.id, phase: 'lure', at: e.pos });
    return;
  }
  if (near) {
    // it drifts up to a goblin it can see, hovering a few steps off
    const d = Math.max(0.01, dist(near.pos, e.pos)), k = Math.max(0, d - W.hover) / d;
    if (d > W.hover + 0.5) e.path = [{ x: q4(e.pos.x + (near.pos.x - e.pos.x) * k), y: q4(e.pos.y + (near.pos.y - e.pos.y) * k) }];
    e.targetId = -1; // darting after someone
    return;
  }
  e.targetId = null;
  if (!e.path.length) e.path = [driftPoint(w, e)];
}

/** Float toward the waypoint (over water and fences alike). */
function drift(e: Enemy, mul = 1): boolean {
  const wp = e.path[0];
  if (!wp) { e.velocity = { x: 0, y: 0 }; return true; }
  const speed = (W.speed / CFG.tickHz) * mul;
  const dx = wp.x - e.pos.x, dy = wp.y - e.pos.y, d = Math.hypot(dx, dy);
  if (d <= speed) { e.pos = { x: q4(wp.x), y: q4(wp.y) }; e.path.shift(); e.velocity = { x: 0, y: 0 }; return true; }
  e.pos = { x: q4(e.pos.x + (dx / d) * speed), y: q4(e.pos.y + (dy / d) * speed) };
  e.velocity = { x: q4((dx / d) * speed), y: q4((dy / d) * speed) };
  e.facing = q4(Math.atan2(dy, dx));
  return false;
}

/** One tick of a wisp. Returns true when it is gone (scattered, faded or dawn). */
export function wispAct(w: World, e: Enemy): boolean {
  const follower = e.mode === 'lure' && e.targetId !== null ? w.goblin(e.targetId) : undefined;
  for (const g of w.goblinHash.query(e.pos, W.torchRadius))
    if (torchLit(g, w) && dist(g.pos, e.pos) <= W.torchRadius) {
      w.emit({ type: 'wisp', enemyId: e.id, goblinId: g.id, phase: 'dispersed', at: e.pos });
      return true;
    }
  if (!isNight(w.clock)) return true;
  if (e.mode !== 'lure') {
    if (drift(e, e.targetId === -1 ? W.seekMul : 1)) e.nextDecide = w.s.tick;
    return false;
  }
  // the trance broke (a bite, the god's hand): back to drifting
  if (!follower || following(w, e) !== follower) { e.mode = 'prowl'; e.targetId = null; e.path = []; return false; }
  if (--e.timer <= 0 || (!e.path.length && dist(follower.pos, e.pos) < W.waitDist)) {
    w.emit({ type: 'wisp', enemyId: e.id, goblinId: follower.id, phase: 'faded', at: e.pos });
    return true;
  }
  // it waits for its follower to catch up
  if (dist(follower.pos, e.pos) < W.waitDist) drift(e);
  else e.velocity = { x: 0, y: 0 };
  return false;
}
