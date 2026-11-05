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
import { biteChance, hurtGoblin } from '../combat';
import { weatherAt } from '../weather';
import type { Enemy, Goblin, GroundItem } from '../state';
import type { Vec2 } from '../../shared/types';
import { litFireNear, torchLit } from '../fire';
import { enemyCanStand } from '../fences';
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

const running = (e: Enemy): boolean => e.mode === 'flee' || e.mode === 'leave';

/** Path around fences; a running Gnasher scrambles over anything if it must. False if it cannot get there. */
function setPath(w: World, e: Enemy, to: Vec2): boolean {
  const p = w.enemyPath(e.pos, to) ?? (running(e) ? w.path(e.pos, to) ?? [] : null);
  if (!p) return false;
  e.path = [...p.slice(0, -1), { x: to.x, y: to.y }];
  e.target = { x: to.x, y: to.y };
  return true;
}
function setMode(w: World, e: Enemy, mode: Enemy['mode'], to: Vec2, targetId: number | null = null): boolean {
  const prev = { mode: e.mode, targetId: e.targetId };
  const fleeing = mode === 'flee' && e.mode !== 'flee';
  e.mode = mode;
  e.targetId = targetId;
  e.timer = 0;
  if (!setPath(w, e, to)) { e.mode = prev.mode; e.targetId = prev.targetId; return false; }
  if (fleeing) w.emit({ type: 'enemy_fled', enemyId: e.id, kind: e.kind, at: e.pos });
  return true;
}

/** A lit campfire within 6 or a burning torch within 3: what a Gnasher will not go near (§11.1). */
export function scareAt(w: World, p: Vec2): Vec2 | null {
  const f = litFireNear(w, p, CFG.fire.repelRadius);
  if (f) return f.pos;
  for (const g of w.goblinHash.query(p, CFG.fire.torchScare)) if (torchLit(g, w) && dist(g.pos, p) <= CFG.fire.torchScare) return g.pos;
  return null;
}
/** Back off to just outside whatever scares it. */
function retreat(w: World, e: Enemy, from: Vec2): void {
  const d = Math.max(0.01, dist(e.pos, from));
  const r = (litFireNear(w, from, 0.01) ? CFG.fire.repelRadius : CFG.fire.torchScare) + 2;
  const to = { x: q4(from.x + ((e.pos.x - from.x) / d) * r), y: q4(from.y + ((e.pos.y - from.y) / d) * r) };
  if (!setMode(w, e, 'prowl', to)) setMode(w, e, 'leave', e.home);
}

function nearestLone(w: World, e: Enemy): Goblin | null {
  let best: Goblin | null = null, bd: number = E.sightRange;
  for (const g of w.goblinHash.query(e.pos, E.sightRange)) {
    const d = dist(g.pos, e.pos);
    if (d < bd && isLone(w, g) && !scareAt(w, g.pos)) { bd = d; best = g; }
  }
  return best;
}
function nearestFood(w: World, e: Enemy): GroundItem | null {
  return w.itemHash.nearest(e.pos, E.foodSearch, (it) => !it.airborne && isFood(it.stack.type) && it.stack.type !== 'apple_core' && !scareAt(w, it.pos));
}

/** Pick an intent (every 10 ticks, staggered). */
function decide(w: World, e: Enemy): void {
  if (e.mode === 'flee' || e.mode === 'leave') return;
  if (e.hp < G.fleeAt * e.maxHp || crowdAround(w, e) >= E.crowdFlee) { setMode(w, e, 'flee', e.home); return; }
  if (!dark(w, e) || e.carrying) { setMode(w, e, 'leave', e.home); return; }
  if (e.mode === 'attack' && e.hits >= E.maxBites) { setMode(w, e, 'flee', e.home); return; }
  // keeps at whoever it is fighting while they stay close and outdoors
  const foe = e.mode === 'attack' && e.targetId !== null ? w.goblin(e.targetId) : undefined;
  if (foe && exposed(w, foe) && dist(foe.pos, e.pos) < 4) return;
  const lone = nearestLone(w, e);
  const keep = (mode: Enemy['mode'], id: number) => e.mode === mode && e.targetId === id;
  if (lone && dist(lone.pos, e.pos) < 8 && setMode(w, e, 'attack', lone.pos, lone.id)) return;
  const sp = w.s.village.stockpilePos;
  if (stockFood(w.s) && !scareAt(w, sp) && (keep('steal', -1) || setMode(w, e, 'steal', sp, -1))) return;
  const food = nearestFood(w, e);
  if (food && (keep('steal', food.id) || setMode(w, e, 'steal', food.pos, food.id))) return;
  if (lone && setMode(w, e, 'attack', lone.pos, lone.id)) return;
  if (e.mode === 'prowl' && e.path.length) return;
  // circle the village looking for a way in or a straggler
  const c = w.s.village.center;
  for (let i = 0; i < 4; i++) {
    const p = { x: q4(c.x + w.rng.range(-9, 9)), y: q4(c.y + w.rng.range(-9, 9)) };
    if (!scareAt(w, p) && setMode(w, e, 'prowl', p)) return;
  }
  setMode(w, e, 'leave', e.home); // nothing to be had tonight
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
  if (running(e) ? isWalkable(w.s, Math.floor(nx), Math.floor(ny)) : enemyCanStand(w, nx, ny)) e.pos = { x: nx, y: ny };
  else e.path.shift(); // stuck on a corner: skip the waypoint
  e.velocity = { x: q4((dx / d) * speed), y: q4((dy / d) * speed) };
  e.facing = q4(Math.atan2(dy, dx));
  return false;
}

function spotted(w: World, e: Enemy, by: Goblin): void {
  e.seen = true;
  w.s.threat.alarms++;
  w.emit({ type: 'enemy_spotted', goblinId: by.id, enemyId: e.id, at: e.pos });
  w.emit({ type: 'emote', goblinId: by.id, emote: 'exclaim' });
}

function bite(w: World, e: Enemy, g: Goblin): void {
  e.facing = q4(Math.atan2(g.pos.y - e.pos.y, g.pos.x - e.pos.x));
  e.velocity = { x: 0, y: 0 };
  if (e.timer > 0) { e.timer--; return; }
  e.timer = E.biteCooldown + E.windupTicks;
  if (!e.seen) spotted(w, e, g); // a bite (even a miss) wakes anyone up
  if (!w.rng.chance(biteChance(g))) { w.emit({ type: 'enemy_bit', enemyId: e.id, goblinId: g.id, damage: 0, at: g.pos }); return; }
  e.hits++;
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
    // fire and torches: it will not come closer (§11.1, P4.6)
    if (!running(e)) {
      const fear = scareAt(w, e.pos);
      if (fear && (e.mode !== 'prowl' || !e.target || scareAt(w, e.target))) retreat(w, e, fear);
    }
    if (e.mode === 'attack') {
      const g = e.targetId !== null ? w.goblin(e.targetId) : undefined;
      if (!g || !exposed(w, g)) { e.nextDecide = s.tick; continue; }
      const mid = { x: (g.pos.x + e.pos.x) / 2, y: (g.pos.y + e.pos.y) / 2 };
      if (dist(g.pos, e.pos) <= E.biteRange) {
        if (enemyCanStand(w, mid.x, mid.y) && enemyCanStand(w, g.pos.x, g.pos.y)) bite(w, e, g); // never through a fence
        else e.nextDecide = s.tick;
        continue;
      }
      if (e.target && dist(e.target, g.pos) > 1.5 && !setPath(w, e, g.pos)) { e.nextDecide = s.tick; continue; }
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
