/**
 * Spawn director (§14.1, P4.4): each night gets a threat budget = (base + day × ramp) × moon − defense × 0.3, spent on
 * Gnashers that arrive at random times through the first part of the night; fog by day can bring a straggler.
 * Enemies appear far from the village and out of every goblin's sight. No enemies before day 3; at most 20 at once.
 */
import { CFG } from '../config';
import { dist, q4 } from '../../shared/math';
import { allocId } from '../../shared/ids';
import { isNight, type ClockState } from '../time';
import { tileAt } from '../grid';
import { isLit } from '../fire';
import { bestWeapon } from '../tools';
import type { EnemyKind, Vec2 } from '../../shared/types';
import type { Enemy } from '../state';
import type { World } from '../world';

const E = CFG.enemies;
const DAY = CFG.time.dayTicks;

/** Armed adults and lit fires count as defense (fences P4.6, watchtowers P5). */
export function defenseScore(w: World): number {
  let d = 0;
  for (const g of w.s.goblins) if (g.lifeStage === 'adult' && bestWeapon(g)) d += E.armedDefense;
  for (const b of w.s.buildings) if (isLit(b)) d += E.fireDefense;
  return d;
}

/** New moon ×1.6 … full moon ×0.7 (moonPhase 0 = new, 0.5 = full). */
export function moonMul(c: ClockState): number {
  const full = 1 - Math.abs(c.moonPhase - 0.5) * 2;
  return E.newMoonMul + (E.fullMoonMul - E.newMoonMul) * full;
}

export function threatBudget(w: World): number {
  if (w.clock.day < E.graceDays) return 0;
  return Math.max(0, (E.baseThreat + w.clock.day * E.rampPerDay) * moonMul(w.clock) - defenseScore(w) * E.defenseMul);
}

/** A walkable spot far from the village and out of every goblin's sight (forest preferred); null if none. */
export function findSpawnPoint(w: World): Vec2 | null {
  const s = w.s;
  let fallback: Vec2 | null = null;
  for (let i = 0; i < 60; i++) {
    const p = { x: q4(w.rng.range(1, s.size.w - 1)), y: q4(w.rng.range(1, s.size.h - 1)) };
    const t = tileAt(s, p.x, p.y);
    if (!t?.walkable || dist(p, s.village.center) < E.spawnMinVillageDist) continue;
    if (s.goblins.some((g) => dist(g.pos, p) < E.spawnMinGoblinDist)) continue;
    if (t.biome === 'forest') return p;
    fallback ??= p;
  }
  return fallback;
}

export function spawnEnemy(w: World, kind: EnemyKind, pos: Vec2): Enemy {
  const st = E.gnasher;
  const e: Enemy = {
    id: allocId(w.s), kind, pos: { x: pos.x, y: pos.y }, velocity: { x: 0, y: 0 }, facing: 0, hp: st.hp, maxHp: st.hp,
    mode: 'prowl', targetId: null, target: null, path: [], carrying: null, home: { x: pos.x, y: pos.y },
    spawnTick: w.s.tick, nextDecide: w.s.tick, timer: 0, hits: 0, seen: false,
  };
  w.s.enemies.push(e);
  w.emit({ type: 'enemy_spawned', enemyId: e.id, kind, at: e.pos });
  return e;
}

/** §6 step 9 (first half): budget a new night, release scheduled spawns, fog stragglers. */
export function updateDirector(w: World): void {
  const s = w.s, c = w.clock;
  if (isNight(c) && s.threat.night !== c.day) {
    s.threat.night = c.day;
    const b = threatBudget(w);
    const n = Math.floor(b) + (w.rng.chance(b - Math.floor(b)) ? 1 : 0);
    const span = Math.max(1, Math.round((1 - c.dayFrac) * DAY * 0.6));
    for (let i = 0; i < n; i++) s.threat.spawnAt.push(s.tick + w.rng.int(0, span));
    s.threat.spawnAt.sort((a, b2) => a - b2);
  }
  if (!isNight(c) && c.day >= E.graceDays && s.weather.kind === 'fog' && s.tick % CFG.god.hourTicks === 0
    && w.rng.chance(E.fogChancePerHour * (1 + c.day * E.rampPerDay)))
    s.threat.spawnAt.push(s.tick);
  while (s.threat.spawnAt.length && s.threat.spawnAt[0]! <= s.tick) {
    s.threat.spawnAt.shift();
    if (s.enemies.length >= E.maxActive) continue;
    const p = findSpawnPoint(w);
    if (p) spawnEnemy(w, 'gnasher', p);
  }
}
