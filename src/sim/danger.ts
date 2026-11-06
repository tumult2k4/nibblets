/**
 * Danger marks (P4.8, §18.10 danger lens): recent sightings, bites, thefts, smashed buildings and deaths are kept for
 * 3 days (at most 48, oldest dropped). `dangerAt` blends them with live threats, dread and swarm zones, and the calm of
 * a lit fire's glow.
 */
import { CFG } from './config';
import { dist, q4 } from '../shared/math';
import type { Vec2 } from '../shared/types';
import type { World } from './world';
import { menaces } from './enemies/common';
import { litFireNear } from './fire';

const D = CFG.danger;

export function markDanger(w: World, pos: Vec2, weight: number): void {
  const m = w.s.threat.marks;
  m.push({ pos: { x: q4(pos.x), y: q4(pos.y) }, tick: w.s.tick, weight });
  const old = w.s.tick - D.days * CFG.time.dayTicks;
  while (m.length && (m.length > D.maxMarks || m[0]!.tick < old)) m.shift();
}

/** 0 (calm) … 1+ (deadly) at a point: faded marks, threats about now, minus a lit fire's comfort. */
export function dangerAt(w: World, p: Vec2): number {
  const span = D.days * CFG.time.dayTicks;
  let v = 0;
  for (const m of w.s.threat.marks) {
    const d = dist(m.pos, p);
    if (d < D.radius) v += m.weight * (1 - d / D.radius) * Math.max(0, 1 - (w.s.tick - m.tick) / span);
  }
  for (const e of w.s.enemies) if (menaces(e, p, D.liveRadius)) v += D.live * (1 - dist(e.pos, p) / D.liveRadius);
  // the god's own wrath: dread after a strike, a biting swarm
  for (const z of w.s.god.zones) { const d = dist(z.pos, p); if (d < z.r) v += D.zone * (1 - d / z.r); }
  if (v > 0 && litFireNear(w, p, CFG.fire.lightRadius)) v *= 1 - D.fireCalm;
  // P6.6: under a Sanctuary's dome the fear mostly goes
  if (v > 0 && w.s.god.sanctuaries.some((z) => dist(z.pos, p) <= z.r)) v *= CFG.miracles.sanctuaryCalm;
  return v;
}
