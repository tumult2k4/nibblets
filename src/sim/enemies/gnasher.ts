/**
 * Gnasher AI (§14.1, P4.4; shared plumbing in common.ts): prowls in at night, sneaking (slow) toward food — the stockpile first, then loose food —
 * or a goblin on its own, steals up to 3 food and makes off, bites a lone goblin a few times then runs. It flees
 * when hurt below 30 %, when three goblins crowd it, and every enemy leaves at dawn (fog keeps them about).
 */
import { CFG } from '../config';
import { dist, q4 } from '../../shared/math';
import { isNight } from '../time';
import { isFood } from '../items';
import { stockFood, withdraw } from '../stockpile';
import { biteChance, hurtGoblin } from '../combat';
import { weatherAt } from '../weather';
import type { Enemy, Goblin, GroundItem } from '../state';
import type { Vec2 } from '../../shared/types';
import { litFireNear, torchLit } from '../fire';
import { bestWeapon } from '../tools';
import { enemyCanStand } from '../fences';
import type { World } from '../world';
import { atHome, awake, exposed, moveEnemy, running, setMode, setPath, spotted } from './common';
import { markDanger } from '../danger';
import { shelterOf } from '../temperature';

const E = CFG.enemies;
const G = E.gnasher;

/**
 * Within a Gnasher's reach: outdoors, or in a wattle hut (P4 acceptance: thatch and sticks don't keep it out; stone
 * walls do, and so do the fire's glow and a fence ring, which it never gets past).
 */
export function reachable(w: World, g: Goblin): boolean {
  if (exposed(w, g)) return true;
  if (g.heldByGod || g.airborne || !E.hutBreakIn) return false;
  return shelterOf(w, g)?.type === 'hut';
}

/** A goblin it can reach with no awake adult within 4 tiles (sleepers are no help). */
export function isLone(w: World, g: Goblin): boolean {
  if (!reachable(w, g)) return false;
  for (const o of w.goblinHash.query(g.pos, E.loneRadius))
    if (o.id !== g.id && awake(o) && o.lifeStage === 'adult' && dist(o.pos, g.pos) <= E.loneRadius) return false;
  return true;
}

/**
 * Awake adults pressing close: Gnashers are pack-shy. Someone with a weapon or a burning torch counts in full, bare
 * fists only by half (P4 acceptance: groups are a counter, but an unarmed crowd is no wall).
 */
export function crowdAround(w: World, e: Enemy): number {
  let n = 0;
  for (const o of w.goblinHash.query(e.pos, E.crowdRadius)) {
    if (!awake(o) || o.lifeStage !== 'adult' || dist(o.pos, e.pos) > E.crowdRadius) continue;
    n += bestWeapon(o) || torchLit(o, w) ? 1 : E.unarmedCrowd;
  }
  return n;
}

/** Night, fog, or the first hours after the god summoned it. */
const dark = (w: World, e: Enemy): boolean =>
  isNight(w.clock) || weatherAt(w, e.pos) === 'fog' || (!!e.summoned && w.s.tick - e.spawnTick < CFG.powers.summonHuntHours * CFG.god.hourTicks);

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
export function gnasherDecide(w: World, e: Enemy): void {
  if (running(e)) return;
  if (e.hp < G.fleeAt * e.maxHp || crowdAround(w, e) >= E.crowdFlee) { setMode(w, e, 'flee', e.home); return; }
  if (!dark(w, e) || e.carrying) { setMode(w, e, 'leave', e.home); return; }
  if (e.mode === 'attack' && e.hits >= E.maxBites) { setMode(w, e, 'flee', e.home); return; }
  // keeps at whoever it is fighting while they stay close and outdoors
  const foe = e.mode === 'attack' && e.targetId !== null ? w.goblin(e.targetId) : undefined;
  if (foe && reachable(w, foe) && dist(foe.pos, e.pos) < 4) return;
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
  markDanger(w, g.pos, 1);
  hurtGoblin(w, g, G.dmg, 'combat');
  if (w.goblin(g.id)) callPack(w, e, g);
}

/** Blood draws the others: Gnashers nearby that aren't busy running or carrying join in on the same goblin. */
function callPack(w: World, e: Enemy, g: Goblin): void {
  for (const o of w.s.enemies) {
    if (o === e || o.kind !== 'gnasher' || running(o) || o.carrying || o.mode === 'attack') continue;
    if (dist(o.pos, g.pos) > E.packCall || scareAt(w, o.pos)) continue;
    if (setMode(w, o, 'attack', g.pos, g.id)) o.nextDecide = w.s.tick + E.decideEvery;
  }
}

/** One tick of a Gnasher: keep clear of fire, bite, steal, run. Returns true once it has left the map. */
export function gnasherAct(w: World, e: Enemy): boolean {
  const s = w.s;
  // fire and torches: it will not come closer (§11.1, P4.6)
  if (!running(e)) {
    const fear = scareAt(w, e.pos);
    if (fear && (e.mode !== 'prowl' || !e.target || scareAt(w, e.target))) retreat(w, e, fear);
  }
  if (e.mode === 'attack') {
    const g = e.targetId !== null ? w.goblin(e.targetId) : undefined;
    if (!g || !reachable(w, g)) { e.nextDecide = s.tick; return false; }
    const mid = { x: (g.pos.x + e.pos.x) / 2, y: (g.pos.y + e.pos.y) / 2 };
    if (dist(g.pos, e.pos) <= E.biteRange) {
      if (enemyCanStand(w, mid.x, mid.y) && enemyCanStand(w, g.pos.x, g.pos.y)) bite(w, e, g); // never through a fence
      else e.nextDecide = s.tick;
      return false;
    }
    if (e.target && dist(e.target, g.pos) > 1.5 && !setPath(w, e, g.pos)) { e.nextDecide = s.tick; return false; }
    moveEnemy(w, e, 1);
    return false;
  }
  const arrived = moveEnemy(w, e, e.mode === 'prowl' || e.mode === 'steal' ? E.sneakMul : 1);
  if (!arrived) return false;
  if (e.mode === 'steal') {
    steal(w, e);
    e.nextDecide = s.tick;
  } else if (running(e)) {
    if (atHome(e)) return true;
    setPath(w, e, e.home);
  } else e.nextDecide = s.tick; // prowl point reached: look around again
  return false;
}

function steal(w: World, e: Enemy): void {
  const s = w.s;
  if (e.targetId === -1) {
    const f = stockFood(s);
    if (!f) return;
    const type = f.type;
    const n = withdraw(s, type, E.stealQty);
    e.carrying = { type, qty: n };
    markDanger(w, e.pos, 0.7);
    w.emit({ type: 'enemy_stole', enemyId: e.id, item: type, qty: n, at: e.pos });
    return;
  }
  const it = s.groundItems.find((x) => x.id === e.targetId);
  if (!it || it.airborne) return;
  const n = Math.min(E.stealQty, it.stack.qty);
  it.stack.qty -= n;
  if (it.stack.qty <= 0) s.groundItems.splice(s.groundItems.indexOf(it), 1);
  e.carrying = { type: it.stack.type, qty: n };
  markDanger(w, e.pos, 0.7);
  w.emit({ type: 'enemy_stole', enemyId: e.id, item: it.stack.type, qty: n, at: e.pos });
}
