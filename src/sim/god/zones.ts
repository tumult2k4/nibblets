/**
 * Wrath zones (P4.8): a Swarm's biting bugs and the dread left by a lightning strike or a meteor. Any awake goblin out
 * in the open inside one drops what it is doing and scatters out of it (forced `scatter`); bugs also sting the mood.
 * Zones expire on their own; goblins under a roof are left alone.
 */
import { CFG } from '../config';
import { dist, q4 } from '../../shared/math';
import type { Vec2 } from '../../shared/types';
import type { Goblin } from '../state';
import type { World } from '../world';
import type { AvoidZone } from './godState';
import { isWalkable } from '../grid';
import { shelterOf } from '../temperature';
import { addMood } from '../goblin/mood';
import { forceAction } from '../ai/utility';

const PW = CFG.powers;

export function addZone(w: World, kind: AvoidZone['kind'], pos: Vec2, r: number, ticks: number): void {
  w.s.god.zones.push({ kind, pos: { x: q4(pos.x), y: q4(pos.y) }, r, until: w.s.tick + ticks });
}

/** The zone a point lies in (swarm first), or null. */
export function zoneAt(w: World, p: Vec2): AvoidZone | null {
  let hit: AvoidZone | null = null;
  for (const z of w.s.god.zones) if (dist(z.pos, p) <= z.r && (!hit || z.kind === 'swarm')) hit = z;
  return hit;
}

/** Where to run: straight out of the zone, a couple of tiles past its edge, on dry land. */
export function exitPoint(w: World, g: Goblin, z: AvoidZone): Vec2 | null {
  const d = dist(g.pos, z.pos);
  const base = d > 0.01 ? Math.atan2(g.pos.y - z.pos.y, g.pos.x - z.pos.x) : w.rng.range(0, Math.PI * 2);
  for (const da of [0, 0.5, -0.5, 1, -1, 1.6, -1.6, Math.PI]) {
    const a = base + da;
    const p = { x: q4(z.pos.x + Math.cos(a) * (z.r + 2.5)), y: q4(z.pos.y + Math.sin(a) * (z.r + 2.5)) };
    if (isWalkable(w.s, Math.floor(p.x), Math.floor(p.y))) return p;
  }
  return null;
}

/** §6 step 8b: expire zones, chase goblins out of them. */
export function updateZones(w: World): void {
  const s = w.s;
  if (!s.god.zones.length) return;
  s.god.zones = s.god.zones.filter((z) => z.until > s.tick);
  if (s.tick % 5 !== 0) return;
  for (const g of s.goblins) {
    if (g.heldByGod || g.airborne || g.activity.action === 'scatter') continue;
    const z = zoneAt(w, g.pos);
    if (!z || shelterOf(w, g)) continue;
    if (z.kind === 'swarm') addMood(w, g, 'stung', PW.swarmMood, CFG.god.hourTicks * 2);
    forceAction(g, w, 'scatter');
  }
}
