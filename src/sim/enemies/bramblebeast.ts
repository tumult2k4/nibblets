/**
 * Bramblebeast (§14.1, P4.7): a rare, slow, thorny brute that comes out of the forest edge at any hour and tramples in
 * a straight line through the village to the far side, smashing any fence or building in its way. It pays goblins no
 * mind until one strikes it, then swipes at that one a few times; at 30 % hp it lumbers off. Fire does not scare it.
 */
import { CFG } from '../config';
import { clamp, dist, q4 } from '../../shared/math';
import { tileAt } from '../grid';
import { damageBuilding } from '../storms';
import { biteChance, hurtGoblin } from '../combat';
import type { Vec2 } from '../../shared/types';
import type { Enemy } from '../state';
import type { World } from '../world';
import { findSpawnPoint, spawnEnemy } from './director';
import { atHome, exposed, running, setMode } from './common';
import { markDanger } from '../danger';

const B = CFG.enemies.bramblebeast;

/** The point across the village from where it came in (its way out), on walkable ground. */
function exitFor(w: World, from: Vec2): Vec2 {
  const s = w.s, c = s.village.center;
  const d = Math.max(1, dist(from, c));
  for (const k of [1, 0.85, 0.7, 0.55]) {
    const p = { x: q4(clamp(c.x + ((c.x - from.x) / d) * d * k, 1, s.size.w - 2)), y: q4(clamp(c.y + ((c.y - from.y) / d) * d * k, 1, s.size.h - 2)) };
    if (tileAt(s, p.x, p.y)?.walkable) return p;
  }
  return { ...from };
}

/** Straight through the middle of the village, then out. */
function march(w: World, e: Enemy): void {
  const c = w.s.village.center;
  const via = { x: q4(c.x + w.rng.range(-2, 2)), y: q4(c.y + w.rng.range(-2, 2)) };
  e.mode = 'prowl';
  e.targetId = null;
  e.hits = 0;
  e.timer = 0;
  e.path = dist(e.pos, c) > 4 ? [via, { ...e.home }] : [{ ...e.home }];
  e.target = { ...e.home };
}

export function spawnBramblebeast(w: World, at: Vec2): Enemy {
  const e = spawnEnemy(w, 'bramblebeast', at);
  e.home = exitFor(w, at);
  march(w, e);
  return e;
}

/** About one in eight days from day 6, rolled hourly; never two at once. */
export function maybeBramblebeast(w: World): void {
  const s = w.s;
  if (w.clock.day < B.fromDay || s.tick % CFG.god.hourTicks !== 0 || s.enemies.length >= CFG.enemies.maxActive) return;
  if (s.enemies.some((e) => e.kind === 'bramblebeast')) return;
  if (!w.rng.chance(B.chancePerDay / (CFG.time.dayTicks / CFG.god.hourTicks))) return;
  const p = findSpawnPoint(w);
  if (p) spawnBramblebeast(w, p);
}

export function bramblebeastDecide(w: World, e: Enemy): void {
  if (running(e)) return;
  if (e.hp < B.fleeAt * e.maxHp) { if (!setMode(w, e, 'flee', e.home)) { e.mode = 'flee'; e.path = [{ ...e.home }]; } return; }
  if (e.mode === 'attack') {
    const g = e.targetId !== null ? w.goblin(e.targetId) : undefined;
    if (!g || !exposed(w, g) || dist(g.pos, e.pos) > B.giveUp || e.hits >= B.maxSwipes) march(w, e);
    return;
  }
  if (e.mode === 'smash' && !w.s.buildings.some((b) => b.id === e.targetId)) march(w, e);
  else if (e.mode === 'prowl' && !e.path.length) e.path = [{ ...e.home }];
}

/** Lumber toward the next waypoint: buildings in the way get smashed, water and cliffs walked round. */
function trudge(w: World, e: Enemy, smash: boolean): boolean {
  const wp = e.path[0];
  if (!wp) { e.velocity = { x: 0, y: 0 }; return true; }
  const speed = B.speed / CFG.tickHz;
  const dx = wp.x - e.pos.x, dy = wp.y - e.pos.y, d = Math.hypot(dx, dy);
  e.facing = q4(Math.atan2(dy, dx));
  if (d <= Math.max(speed, 0.05)) {
    e.pos = { x: q4(wp.x), y: q4(wp.y) };
    e.path.shift();
    return e.path.length === 0;
  }
  const nx = q4(e.pos.x + (dx / d) * speed), ny = q4(e.pos.y + (dy / d) * speed);
  const t = tileAt(w.s, nx, ny);
  if (!t) { e.path.shift(); return false; }
  const b = smash && t.occupiedBy !== null ? w.s.buildings.find((x) => x.id === t.occupiedBy) : undefined;
  if (b) {
    e.mode = 'smash';
    e.targetId = b.id;
    e.timer = B.smashEvery;
    e.velocity = { x: 0, y: 0 };
    return false;
  }
  if (!t.walkable) {
    const around = w.path(e.pos, wp);
    if (around?.length) e.path = [...around, ...e.path.slice(1)];
    else e.path.shift();
    return false;
  }
  e.pos = { x: nx, y: ny };
  e.velocity = { x: q4((dx / d) * speed), y: q4((dy / d) * speed) };
  return false;
}

/** One tick of a Bramblebeast. Returns true once it has left the map. */
export function bramblebeastAct(w: World, e: Enemy): boolean {
  if (e.mode === 'smash') {
    const b = w.s.buildings.find((x) => x.id === e.targetId);
    if (!b) { march(w, e); return false; }
    e.facing = q4(Math.atan2(b.pos.y - e.pos.y, b.pos.x - e.pos.x));
    if (--e.timer > 0) return false;
    e.timer = B.smashEvery;
    damageBuilding(w, b, B.smashDmg, 'bramblebeast');
    if (!w.s.buildings.includes(b)) { e.mode = 'prowl'; e.targetId = null; markDanger(w, b.pos, 1); }
    return false;
  }
  if (e.mode === 'attack') {
    const g = e.targetId !== null ? w.goblin(e.targetId) : undefined;
    if (!g) { e.nextDecide = w.s.tick; return false; }
    if (dist(g.pos, e.pos) > B.swipeRange) {
      e.path = [{ ...g.pos }];
      trudge(w, e, false);
      return false;
    }
    e.velocity = { x: 0, y: 0 };
    e.facing = q4(Math.atan2(g.pos.y - e.pos.y, g.pos.x - e.pos.x));
    if (e.timer > 0) { e.timer--; return false; }
    e.timer = B.swipeEvery;
    e.hits++;
    const hit = w.rng.chance(biteChance(g));
    w.emit({ type: 'enemy_bit', enemyId: e.id, goblinId: g.id, damage: hit ? B.dmg : 0, at: g.pos });
    if (hit) { markDanger(w, g.pos, 1); hurtGoblin(w, g, B.dmg, 'combat'); }
    return false;
  }
  const arrived = trudge(w, e, !running(e));
  if (arrived && atHome(e)) return true;
  if (arrived) e.path = [{ ...e.home }];
  return false;
}
