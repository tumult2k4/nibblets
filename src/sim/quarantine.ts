/**
 * Quarantine (§14.3, P6.5 hook; from P8 the chief's policy, set in the sandbox drawer until then). While the village
 * keeps it, a goblin showing a contact disease sleeps and rests apart: in a finished hut nobody lives in, if one is
 * within reach, else lying out away from everyone, so it does not pass the disease to its hut-mates in the night.
 */
import { CFG } from './config';
import { dist, q4 } from '../shared/math';
import type { Vec2 } from '../shared/types';
import type { Building, Goblin } from './state';
import type { World } from './world';
import { isComplete } from './buildings';
import { sickness } from './disease';
import { tileAt } from './grid';

const H = CFG.health;

export const quarantineOn = (w: World): boolean => !!w.s.village.policies?.quarantine;
/** Kept apart: the policy is on and it shows a disease that spreads by contact. */
export const quarantined = (g: Goblin, w: World): boolean => quarantineOn(w) && sickness(g)?.transmission === 'contact';

/** The nearest finished hut that nobody lives in, within `quarantineRange`. */
export function sickHut(g: Goblin, w: World): Building | null {
  let best: Building | null = null, bd: number = H.quarantineRange;
  for (const b of w.s.buildings) {
    if ((b.type !== 'hut' && b.type !== 'stone_hut') || !isComplete(b) || b.occupants.length) continue;
    const d = dist(b.pos, g.pos);
    if (d < bd) { bd = d; best = b; }
  }
  return best;
}

/** Somewhere to lie out apart: of the walkable spots 5 or 8 tiles off, the one farthest from everyone (at least `apartFrom`). */
export function apartSpot(g: Goblin, w: World): Vec2 | null {
  let best: Vec2 | null = null, bs: number = H.apartFrom;
  for (const r of [5, 8]) {
    for (let k = 0; k < 8; k++) {
      const p = { x: q4(g.pos.x + Math.cos(k * Math.PI / 4) * r), y: q4(g.pos.y + Math.sin(k * Math.PI / 4) * r) };
      if (!tileAt(w.s, Math.floor(p.x), Math.floor(p.y))?.walkable) continue;
      let near = Infinity;
      for (const o of w.s.goblins) if (o !== g) near = Math.min(near, dist(o.pos, p));
      for (const b of w.s.buildings) if (b.occupants.length) near = Math.min(near, dist(b.pos, p));
      if (near > bs) { bs = near; best = p; }
    }
  }
  return best;
}
