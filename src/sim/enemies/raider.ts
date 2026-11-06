/**
 * Raiders from a rival clan (§16, P10.3): when a clan that hates the village (relation −40 or worse) is hungry and
 * fierce, three to six of its goblins come at dusk from the edge toward their land, run for the store, take what food
 * they can carry and go home with it (it fills their clan's store). They are goblins, not beasts: fire does not scare
 * them, they do not hunt stragglers, but they swing their clubs at whoever strikes them, and run from a crowd of
 * armed goblins or when hurt. One that falls drops its club; its clan is one fewer and hates the village more.
 */
import { CFG } from '../config';
import { dist } from '../../shared/math';
import { stockFood, withdraw } from '../stockpile';
import { hurtGoblin, biteChance } from '../combat';
import { isFood, itemDef } from '../items';
import { bestWeapon } from '../tools';
import { torchLit } from '../fire';
import { clockAt } from '../time';
import type { Enemy, Goblin } from '../state';
import type { World } from '../world';
import { meiosis } from '../goblin/genetics/genome';
import { awake, moveEnemy, running, setMode, setPath, spotted, atHome } from './common';
import { spawnEnemy } from './director';
import { markDanger } from '../danger';
import { reachable } from './gnasher';
import { doors } from '../visitors';
import { shiftRelation, type RivalClan } from '../clans';

const R = CFG.raids, HOUR = CFG.god.hourTicks, DAY = CFG.time.dayTicks;

/** Should `c` raid the village now (its dusk update)? Hostile, hungry, fierce, rested, and after the first days. */
export function wantsRaid(w: World, c: RivalClan): boolean {
  const s = w.s;
  if (c.contact === null || c.relation > R.relation || c.aggression < R.fierce || c.store >= c.pop * CFG.clans.hungryDays) return false;
  if (clockAt(s.tick).hour !== 18 || s.tick < R.firstDay * DAY || s.tick < (c.lastRaid ?? -Infinity) + R.restDays * DAY) return false;
  return !s.enemies.some((e) => e.clanId === c.id);
}

/** Three to six goblins of `c` come in at the edge toward their land, making for the store. */
export function sendRaiders(w: World, c: RivalClan): Enemy[] {
  const s = w.s, ways = doors(s, c.side);
  if (!ways.length) return [];
  const n = Math.max(R.size[0], Math.min(R.size[1], Math.round(c.pop / R.perPop)));
  const out: Enemy[] = [];
  for (let i = 0; i < n; i++) {
    const at = ways[i % ways.length]!, e = spawnEnemy(w, 'raider', at);
    e.clanId = c.id;
    e.genome = meiosis(w.rng.pick(c.pool), w.rng.pick(c.pool), w.rng);
    e.nextDecide = s.tick + i * 3;
    out.push(e);
  }
  c.lastRaid = s.tick;
  shiftRelation(w, c, R.raid, 'raid');
  w.emit({ type: 'clan_raid', clanA: c.id, clanB: s.clans[0]?.id ?? 0, at: { ...ways[0]! } });
  return out;
}

/** Armed (or torch-bearing) adults around it: what makes a raider think better of it. */
function crowd(w: World, e: Enemy): number {
  let n = 0;
  for (const o of w.goblinHash.query(e.pos, R.crowdRadius))
    if (awake(o) && o.lifeStage === 'adult' && dist(o.pos, e.pos) <= R.crowdRadius && (bestWeapon(o) || torchLit(o, w))) n++;
  return n;
}

/** Someone going for it: a goblin close by that is fighting it. */
function assailant(w: World, e: Enemy): Goblin | null {
  for (const o of w.goblinHash.query(e.pos, 3))
    if ((o.activity.action === 'attack' || o.activity.action === 'defend_village') && o.activity.targetId === e.id && reachable(w, o)) return o;
  return null;
}

export function raiderDecide(w: World, e: Enemy): void {
  if (running(e)) return;
  if (e.hp < R.raider.fleeAt * e.maxHp || crowd(w, e) >= R.crowdFlee) { setMode(w, e, 'flee', e.home); return; }
  if (e.carrying || w.s.tick - e.spawnTick > R.stayHours * HOUR) { setMode(w, e, 'leave', e.home); return; }
  const foe = e.mode === 'attack' && e.targetId !== null ? w.goblin(e.targetId) : undefined;
  if (foe && reachable(w, foe) && dist(foe.pos, e.pos) < 4) return;
  const hit = assailant(w, e);
  if (hit && setMode(w, e, 'attack', hit.pos, hit.id)) return;
  const sp = w.s.village.stockpilePos;
  if (stockFood(w.s) && (e.mode === 'steal' && e.targetId === -1 || setMode(w, e, 'steal', sp, -1))) return;
  const loose = w.itemHash.nearest(e.pos, 24, (it) => !it.airborne && isFood(it.stack.type) && it.stack.type !== 'apple_core');
  if (loose && (e.mode === 'steal' && e.targetId === loose.id || setMode(w, e, 'steal', loose.pos, loose.id))) return;
  setMode(w, e, 'leave', e.home); // nothing to be had
}

function swing(w: World, e: Enemy, g: Goblin): void {
  e.facing = Math.round(Math.atan2(g.pos.y - e.pos.y, g.pos.x - e.pos.x) * 1e4) / 1e4;
  e.velocity = { x: 0, y: 0 };
  if (e.timer > 0) { e.timer--; return; }
  e.timer = R.swingEvery;
  if (!e.seen) spotted(w, e, g);
  const hits = w.rng.chance(R.swingHit * biteChance(g) / CFG.enemies.biteHit);
  w.emit({ type: 'enemy_bit', enemyId: e.id, goblinId: g.id, damage: hits ? R.raider.dmg : 0, at: g.pos });
  if (!hits) return;
  e.hits++;
  markDanger(w, g.pos, 1);
  hurtGoblin(w, g, R.raider.dmg, 'combat');
}

function take(w: World, e: Enemy): void {
  const s = w.s;
  if (e.targetId === -1) {
    const f = stockFood(s);
    if (!f) return;
    const n = withdraw(s, f.type, R.stealQty);
    if (n) { e.carrying = { type: f.type, qty: n }; w.emit({ type: 'enemy_stole', enemyId: e.id, item: f.type, qty: n, at: e.pos }); }
  } else {
    const it = s.groundItems.find((x) => x.id === e.targetId);
    if (!it || it.airborne || dist(it.pos, e.pos) > 1.5) return;
    const n = Math.min(R.stealQty, it.stack.qty);
    it.stack.qty -= n;
    if (it.stack.qty <= 0) s.groundItems.splice(s.groundItems.indexOf(it), 1);
    e.carrying = { type: it.stack.type, qty: n };
    w.emit({ type: 'enemy_stole', enemyId: e.id, item: it.stack.type, qty: n, at: e.pos });
  }
  if (e.carrying) markDanger(w, e.pos, 0.7);
}

/** One tick of a raider: fight, steal, run home (where its loot feeds its clan). True once it has left the map. */
export function raiderAct(w: World, e: Enemy): boolean {
  if (e.mode === 'attack') {
    const g = e.targetId !== null ? w.goblin(e.targetId) : undefined;
    if (!g || !reachable(w, g)) { e.nextDecide = w.s.tick; return false; }
    if (dist(g.pos, e.pos) <= R.fightRange) { swing(w, e, g); return false; }
    if (e.target && dist(e.target, g.pos) > 1.5 && !setPath(w, e, g.pos)) { e.nextDecide = w.s.tick; return false; }
    moveEnemy(w, e, 1);
    return false;
  }
  if (!moveEnemy(w, e, 1)) return false;
  if (e.mode === 'steal') { take(w, e); e.nextDecide = w.s.tick; return false; }
  if (!running(e)) { e.nextDecide = w.s.tick; return false; }
  if (!atHome(e)) { setPath(w, e, e.home); return false; }
  const c = w.s.rivals.find((x) => x.id === e.clanId);
  if (c && e.carrying) c.store += ((itemDef(e.carrying.type).nutrition ?? 0) * e.carrying.qty) / CFG.goblin.decayPerDay.hunger;
  return true;
}
