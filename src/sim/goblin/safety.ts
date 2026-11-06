/**
 * Safety need (§7.1, P4.5): event-driven. Every 10 ticks it drifts toward a target: high by day, lower at night
 * outdoors; a roof, a lit fire within its glow and armed company raise it; every threat in sight pulls it down (more
 * for timid goblins). It falls fast and recovers slowly. Bites and witnessed deaths knock it down at once.
 */
import { CFG } from '../config';
import { clamp, dist, q4 } from '../../shared/math';
import { daylight } from '../time';
import { litFireNear } from '../fire';
import { shelterOf } from '../temperature';
import { bestWeapon } from '../tools';
import { visionRadius } from '../ai/considerations';
import { menaces } from '../enemies/common';
import type { Goblin } from '../state';
import type { World } from '../world';
import { totemNear } from '../shrine';

const S = CFG.safety;

/** Timid goblins feel every scare more (×1.3 at bravery 0, ×0.7 at bravery 1). */
const fearMul = (g: Goblin): number => 1.3 - 0.6 * g.personality.bravery;

/** An immediate drop (bite, a death seen). */
export function scare(g: Goblin, amount: number): void {
  g.needs.safety = q4(clamp(g.needs.safety - amount * fearMul(g), 0, 100));
}

export function safetyTarget(g: Goblin, w: World): number {
  const lit = daylight(w.clock) > 0.5;
  const roof = !!shelterOf(w, g);
  let v = lit ? S.day : roof ? S.nightInside : S.nightOutside;
  if (roof) v += S.hut;
  if (litFireNear(w, g.pos, CFG.fire.lightRadius)) v += S.fire;
  if (totemNear(w, g.pos)) v += CFG.beliefs.totem.safety; // P8.6
  if (bestWeapon(g)) v += S.armed;
  let friends = 0;
  for (const o of w.goblinHash.query(g.pos, S.friendRadius))
    if (o.id !== g.id && o.lifeStage === 'adult' && dist(o.pos, g.pos) <= S.friendRadius && bestWeapon(o)) friends += S.armedFriend;
  v += Math.min(S.armedFriendMax, friends);
  const vr = visionRadius(g, w);
  for (const e of w.s.enemies) {
    if (!menaces(e, g.pos, vr)) continue;
    const d = dist(e.pos, g.pos);
    v -= (S.threat + S.threatNear * (1 - d / vr)) * fearMul(g);
  }
  return clamp(v, 0, 100);
}

/** §6 step 11c: drift every goblin's safety toward its target. */
export function updateSafety(w: World): void {
  if (w.s.tick % S.every !== 0) return;
  for (const g of w.s.goblins) {
    if (g.heldByGod) continue; // the hand has its own fear (godView.fear)
    const t = safetyTarget(g, w);
    const k = t < g.needs.safety ? S.fall : S.rise;
    g.needs.safety = q4(clamp(g.needs.safety + (t - g.needs.safety) * k, 0, 100));
  }
}

/** A death seen up close shakes everyone who saw it. */
export function witnessDeath(w: World, pos: { x: number; y: number }, deadId: number): void {
  for (const g of w.s.goblins) if (g.id !== deadId && dist(g.pos, pos) <= visionRadius(g, w)) scare(g, S.witnessDeath);
}
