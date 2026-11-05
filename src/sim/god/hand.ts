import type { ID, ItemType, Vec2, Vec3 } from '../../shared/types';
import { clamp, q4 } from '../../shared/math';
import { CFG } from '../config';
import { isWalkable, tileOf } from '../grid';
import type { Goblin } from '../state';
import type { World } from '../world';
import { groundZ } from './godState';
import { landingDamage, stepAirborne } from './airborne';
import { divineAct } from './faith';
import { forceAction, startAction } from '../ai/utility';
import { killGoblin } from '../goblin/needs';
import { addMood } from '../goblin/mood';
import { spawnGroundItem } from '../groundItems';
import { nearestShores } from '../ai/targets';

export type GrabResult = string | null; // null = ok, string = rejection reason

export function grab(w: World, entityId: ID): GrabResult {
  const s = w.s;
  if (s.god.held) return 'already_holding';
  const g = w.goblin(entityId);
  if (g) {
    if (g.airborne) return 'airborne';
    const height = CFG.god.holdHeight.start;
    s.god.held = { kind: 'goblin', id: g.id, pos: { ...g.pos }, height, sinceTick: s.tick, fearApplied: false };
    g.heldByGod = true;
    g.airborne = { z: q4(groundZ(w, g.pos) + height), vel: { x: 0, y: 0, z: 0 }, dropHeight: height, throwSpeed: 0, held: true };
    g.deeds.timesHeld += 1;
    s.god.counts.grabs += 1;
    forceAction(g, w, 'struggle');
    divineAct(w, 'grab', g.pos, g.id);
    return null;
  }
  const it = s.groundItems.find((x) => x.id === entityId);
  if (it) {
    if (it.airborne) return 'airborne';
    const height = CFG.god.holdHeight.start;
    s.god.held = { kind: 'item', id: it.id, pos: { ...it.pos }, height, sinceTick: s.tick, fearApplied: false };
    it.reservedBy = null;
    it.airborne = { z: q4(groundZ(w, it.pos) + height), vel: { x: 0, y: 0, z: 0 }, dropHeight: height, throwSpeed: 0, held: true };
    return null;
  }
  return 'missing_entity';
}

export function holdMove(w: World, pos: Vec2, height: number): void {
  const h = w.s.god.held;
  if (!h) return;
  h.pos = { x: q4(clamp(pos.x, 0.5, w.s.size.w - 0.5)), y: q4(clamp(pos.y, 0.5, w.s.size.h - 0.5)) };
  h.height = q4(clamp(height, CFG.god.holdHeight.min, CFG.god.holdHeight.max));
}

/** Release: gentle set-down at ≤ 1.5 with little speed, else a ballistic drop or throw. */
export function release(w: World, pos: Vec2, height: number, velocity: Vec3): void {
  const s = w.s;
  const h = s.god.held;
  if (!h) return;
  holdMove(w, pos, height);
  s.god.held = null;
  const G = CFG.god;
  let v = { x: q4(velocity.x), y: q4(velocity.y), z: q4(velocity.z) };
  const sp = Math.hypot(v.x, v.y, v.z);
  if (sp > G.throwMaxSpeed) v = { x: q4((v.x / sp) * G.throwMaxSpeed), y: q4((v.y / sp) * G.throwMaxSpeed), z: q4((v.z / sp) * G.throwMaxSpeed) };
  const horiz = Math.hypot(v.x, v.y);
  const gentle = h.height <= G.freeFallHeight && horiz < 3;
  if (h.kind === 'goblin') {
    const g = w.goblin(h.id);
    if (!g) return;
    g.heldByGod = false;
    g.pos = { ...h.pos };
    if (gentle && isWalkable(s, Math.floor(h.pos.x), Math.floor(h.pos.y))) {
      g.airborne = null;
      g.pos = { ...h.pos };
      s.god.counts.gentleSetDowns += 1;
      divineAct(w, 'set_down', g.pos, g.id);
      g.activity.status = 'done';
      return;
    }
    g.airborne = { z: q4(groundZ(w, h.pos) + h.height), vel: v, dropHeight: h.height, throwSpeed: q4(horiz), held: false };
    s.god.counts.drops += 1;
    divineAct(w, horiz > 3 ? 'throw' : 'drop', g.pos, g.id, true);
  } else if (h.kind === 'item') {
    const it = s.groundItems.find((x) => x.id === h.id);
    if (!it || !it.airborne) return;
    it.pos = { ...h.pos };
    it.airborne = { z: q4(groundZ(w, h.pos) + h.height), vel: v, dropHeight: h.height, throwSpeed: q4(horiz), held: false };
  }
}

/** Per-tick flight of a released goblin; applies landing damage and witness reactions. */
export function stepGoblinFlight(w: World, g: Goblin): void {
  const air = g.airborne!;
  const r = stepAirborne(w, g.pos, air, 0);
  if (!r.landed) return;
  const dmg = landingDamage(air, r.water);
  g.airborne = null;
  if (r.water) {
    g.wetUntil = w.s.tick + CFG.time.dayTicks / 24;
    const shore = nearestShores(g, w, 1)[0];
    if (shore) g.pos = { ...shore };
  }
  w.emit({ type: 'landed', entityId: g.id, damage: dmg, water: r.water, at: g.pos });
  g.activity.status = 'done';
  if (dmg > 0) {
    g.health.hp = q4(g.health.hp - dmg);
    w.emit({ type: 'goblin_hurt', goblinId: g.id, damage: dmg, cause: 'fall', at: g.pos });
    divineAct(w, 'hurt', g.pos, g.id);
    if (g.health.hp <= 0) killGoblin(w, g, 'fall');
  }
}

export function pet(w: World, g: Goblin, ticks: number): void {
  const G = CFG.god;
  const secs = ticks / CFG.tickHz;
  const day = w.clock.day;
  if (g.godView.petDay !== day) {
    g.godView.petDay = day;
    g.godView.petLoveToday = 0;
  }
  const love = Math.min(G.petLovePerSec * secs, G.petLoveDailyCap - g.godView.petLoveToday);
  g.godView.petLoveToday = q4(g.godView.petLoveToday + Math.max(0, love));
  g.godView.love = q4(clamp(g.godView.love + Math.max(0, love), 0, 100));
  addMood(w, g, 'petted', G.petMoodPerSec * secs, CFG.time.dayTicks / 4);
  w.s.god.counts.pets += 1;
  if (g.lifeStage === 'hatchling' && g.activity.action !== 'sleep_ground') startAction(g, w, 'sleep_ground');
  divineAct(w, 'pet', g.pos, g.id, false);
}

export function poke(w: World, g: Goblin): void {
  addMood(w, g, 'poked', CFG.god.pokeMood, 600);
  startAction(g, w, 'idle');
  g.activity.status = 'done';
  divineAct(w, 'poke', g.pos, g.id);
}

export function flick(w: World, g: Goblin, dir: Vec2): void {
  const G = CFG.god;
  const l = Math.hypot(dir.x, dir.y) || 1;
  const d = { x: dir.x / l, y: dir.y / l };
  let to = { ...g.pos };
  for (let t = 0.25; t <= G.flickDist; t += 0.25) {
    const p = { x: q4(g.pos.x + d.x * t), y: q4(g.pos.y + d.y * t) };
    const tt = tileOf(p);
    if (!isWalkable(w.s, tt.x, tt.y)) break;
    to = p;
  }
  g.pos = to;
  g.health.hp = q4(g.health.hp - G.flickDmg);
  startAction(g, w, 'idle');
  g.activity.status = 'done';
  divineAct(w, 'flick', g.pos, g.id);
  if (g.health.hp <= 0) killGoblin(w, g, 'divine');
}

/** Gift Tray drop: items fall from the sky with a little scatter. Never lands in a goblin's head. */
export function spawnGift(w: World, item: ItemType, qty: number, pos: Vec2): void {
  const z = groundZ(w, pos) + CFG.god.spawnHeight;
  for (let i = 0; i < qty; i++) {
    const a = w.rng.range(0, Math.PI * 2);
    const r = qty > 1 ? w.rng.range(0, 0.6) : 0;
    const p = { x: q4(pos.x + Math.cos(a) * r), y: q4(pos.y + Math.sin(a) * r) };
    const air = { z: q4(z + i * 0.4), vel: { x: 0, y: 0, z: 0 }, dropHeight: 0, throwSpeed: 0, held: false };
    spawnGroundItem(w, { type: item, qty: 1, divine: true }, p, air);
  }
  w.s.god.counts.gifts += qty;
  const target = w.goblinHash.nearest(pos, 1.5, (g) => !g.heldByGod);
  divineAct(w, 'gift', pos, target?.id);
}
