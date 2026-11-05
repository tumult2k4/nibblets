/**
 * Gnasher AI (§14.1, P4.4): prowls in at night, sneaking (slow) toward food — the stockpile first, then loose food —
 * or a goblin on its own, steals up to 3 food and makes off, bites a lone goblin a few times then runs. It flees
 * when hurt below 30 %, when three goblins crowd it, and every enemy leaves at dawn (fog keeps them about).
 */
import { CFG } from '../config';
import { dist, q4 } from '../../shared/math';
import { isNight } from '../time';
import { isWalkable } from '../grid';
import { isFood } from '../items';
import { stockFood, withdraw } from '../stockpile';
import { shelterOf } from '../temperature';
import { visionRadius } from '../ai/considerations';
import { hurtGoblin } from '../combat';
import { weatherAt } from '../weather';
import type { Enemy, Goblin, GroundItem } from '../state';
import type { World } from '../world';

const E = CFG.enemies;
const G = E.gnasher;

const awake = (g: Goblin): boolean => !g.heldByGod && !g.airborne && g.activity.action !== 'sleep_home' && g.activity.action !== 'sleep_ground';
const exposed = (w: World, g: Goblin): boolean => !g.heldByGod && !g.airborne && !shelterOf(w, g);

/** A goblin outside with nobody else within 4 tiles. */
export function isLone(w: World, g: Goblin): boolean {
  if (!exposed(w, g)) return false;
  for (const o of w.goblinHash.query(g.pos, E.loneRadius)) if (o.id !== g.id && dist(o.pos, g.pos) <= E.loneRadius) return false;
  return true;
}

/** Awake goblins pressing close: Gnashers are pack-shy. */
export function crowdAround(w: World, e: Enemy): number {
  let n = 0;
  for (const o of w.goblinHash.query(e.pos, E.crowdRadius)) if (awake(o) && o.lifeStage === 'adult' && dist(o.pos, e.pos) <= E.crowdRadius) n++;
  return n;
}

const dark = (w: World, e: Enemy): boolean => isNight(w.clock) || weatherAt(w, e.pos) === 'fog';

function setPath(w: World, e: Enemy, to: { x: number; y: number }): void {
  const p = w.path(e.pos, to);
  e.path = p ? [...p.slice(0, -1), { x: to.x, y: to.y }] : [{ x: to.x, y: to.y }];
  e.target = { x: to.x, y: to.y };
}
function setMode(w: World, e: Enemy, mode: Enemy['mode'], to: { x: number; y: number }, targetId: number | null = null): void {
  const fleeing = mode === 'flee' && e.mode !== 'flee';
  e.mode = mode;
  e.targetId = targetId;
  e.timer = 0;
  setPath(w, e, to);
  if (fleeing) w.emit({ type: 'enemy_fled', enemyId: e.id, kind: e.kind, at: e.pos });
}

function nearestLone(w: World, e: Enemy): Goblin | null {
  let best: Goblin | null = null, bd: number = E.sightRange;
  for (const g of w.goblinHash.query(e.pos, E.sightRange)) {
    const d = dist(g.pos, e.pos);
    if (d < bd && isLone(w, g)) { bd = d; best = g; }
  }
  return best;
}
function nearestFood(w: World, e: Enemy): GroundItem | null {
  return w.itemHash.nearest(e.pos, E.foodSearch, (it) => !it.airborne && isFood(it.stack.type) && it.stack.type !== 'apple_core');
}

/** Pick an intent (every 10 ticks, staggered). */
function decide(w: World, e: Enemy): void {
  if (e.mode === 'flee' || e.mode === 'leave') return;
  if (e.hp < G.fleeAt * e.maxHp || crowdAround(w, e) >= E.crowdFlee) return setMode(w, e, 'flee', e.home);
  if (!dark(w, e) || e.carrying) return setMode(w, e, 'leave', e.home);
  if (e.mode === 'attack' && e.hits >= E.maxBites) return setMode(w, e, 'flee', e.home);
  const lone = nearestLone(w, e);
  if (lone && dist(lone.pos, e.pos) < 8) return setMode(w, e, 'attack', lone.pos, lone.id);
  const sp = w.s.village.stockpilePos;
  if (stockFood(w.s)) { if (e.mode !== 'steal' || e.targetId !== -1) setMode(w, e, 'steal', sp, -1); return; }
  const food = nearestFood(w, e);
  if (food) { if (e.mode !== 'steal' || e.targetId !== food.id) setMode(w, e, 'steal', food.pos, food.id); return; }
  if (lone) return setMode(w, e, 'attack', lone.pos, lone.id);
  if (e.mode !== 'prowl' || !e.path.length) {
    const c = w.s.village.center;
    setMode(w, e, 'prowl', { x: q4(c.x + w.rng.range(-6, 6)), y: q4(c.y + w.rng.range(-6, 6)) });
  }
}

/** Walk along the path; returns true on arrival. */
function moveEnemy(w: World, e: Enemy, speedMul: number): boolean {
  const wp = e.path[0];
  if (!wp) { e.velocity = { x: 0, y: 0 }; return true; }
  const speed = (G.speed / CFG.tickHz) * speedMul;
  const dx = wp.x - e.pos.x, dy = wp.y - e.pos.y, d = Math.hypot(dx, dy);
  if (d <= Math.max(speed, 0.05)) {
    e.pos = { x: q4(wp.x), y: q4(wp.y) };
    e.path.shift();
    return e.path.length === 0;
  }
  const nx = q4(e.pos.x + (dx / d) * speed), ny = q4(e.pos.y + (dy / d) * speed);
  if (isWalkable(w.s, Math.floor(nx), Math.floor(ny))) e.pos = { x: nx, y: ny };
  else e.path.shift(); // stuck on a corner: skip the waypoint
  e.velocity = { x: q4((dx / d) * speed), y: q4((dy / d) * speed) };
  e.facing = q4(Math.atan2(dy, dx));
  return false;
}

function spotted(w: World, e: Enemy, by: Goblin): void {
  e.seen = true;
  w.emit({ type: 'enemy_spotted', goblinId: by.id, enemyId: e.id, at: e.pos });
  w.emit({ type: 'emote', goblinId: by.id, emote: 'exclaim' });
}

function bite(w: World, e: Enemy, g: Goblin): void {
  e.facing = q4(Math.atan2(g.pos.y - e.pos.y, g.pos.x - e.pos.x));
  e.velocity = { x: 0, y: 0 };
  if (e.timer > 0) { e.timer--; return; }
  e.hits++;
  e.timer = E.biteCooldown + E.windupTicks;
  if (!e.seen) spotted(w, e, g); // a bite wakes anyone up
  w.emit({ type: 'enemy_bit', enemyId: e.id, goblinId: g.id, damage: G.dmg, at: g.pos });
  w.emit({ type: 'emote', goblinId: g.id, emote: 'exclaim' });
  hurtGoblin(w, g, G.dmg, 'combat');
}

/** §6 step 9: notice/alarm, director spawns happen before; decisions every 10 ticks. */
export function enemiesDecide(w: World): void {
  for (const e of w.s.enemies) {
    if (!e.seen) {
      const spotter = w.s.goblins.find((g) => awake(g) && dist(g.pos, e.pos) <= visionRadius(g, w));
      if (spotter) spotted(w, e, spotter);
    }
    if (w.s.tick >= e.nextDecide) {
      e.nextDecide = w.s.tick + E.decideEvery;
      decide(w, e);
    }
  }
}

/** §6 step 14: move, bite, steal, and leave the map. */
export function enemiesAct(w: World): void {
  const s = w.s;
  const gone: Enemy[] = [];
  for (const e of s.enemies) {
    if (e.mode === 'attack') {
      const g = e.targetId !== null ? w.goblin(e.targetId) : undefined;
      if (!g || !exposed(w, g)) { e.nextDecide = s.tick; continue; }
      if (dist(g.pos, e.pos) <= E.biteRange) { bite(w, e, g); continue; }
      if (e.target && dist(e.target, g.pos) > 1.5) setPath(w, e, g.pos);
      moveEnemy(w, e, 1);
      continue;
    }
    const arrived = moveEnemy(w, e, e.mode === 'prowl' || e.mode === 'steal' ? E.sneakMul : 1);
    if (!arrived) continue;
    if (e.mode === 'steal') {
      if (e.targetId === -1) {
        const f = stockFood(s);
        if (f) {
          const type = f.type;
          const n = withdraw(s, type, E.stealQty);
          e.carrying = { type, qty: n };
          w.emit({ type: 'enemy_stole', enemyId: e.id, item: type, qty: n, at: e.pos });
        }
      } else {
        const it = s.groundItems.find((x) => x.id === e.targetId);
        if (it && !it.airborne) {
          const n = Math.min(E.stealQty, it.stack.qty);
          it.stack.qty -= n;
          if (it.stack.qty <= 0) s.groundItems.splice(s.groundItems.indexOf(it), 1);
          e.carrying = { type: it.stack.type, qty: n };
          w.emit({ type: 'enemy_stole', enemyId: e.id, item: it.stack.type, qty: n, at: e.pos });
        }
      }
      e.nextDecide = s.tick;
    } else if (e.mode === 'flee' || e.mode === 'leave') {
      if (dist(e.pos, e.home) <= E.despawnDist) gone.push(e);
      else setPath(w, e, e.home);
    } else e.nextDecide = s.tick; // prowl point reached: look around again
  }
  if (gone.length) s.enemies = s.enemies.filter((e) => !gone.includes(e));
}
