/**
 * Enemy systems (§6 steps 9 and 14): rare spawns (Bramblebeast, full-moon wisps), first sightings, staggered
 * decisions, then each kind's tick. The night's Gnashers come from the director (director.ts).
 */
import { CFG } from '../config';
import { dist } from '../../shared/math';
import { visionRadius } from '../ai/considerations';
import type { Enemy } from '../state';
import type { World } from '../world';
import { awake, harmless, spotted } from './common';
import { towerSight, towerWarning, watchtowers } from '../watch';
import { gnasherAct, gnasherDecide } from './gnasher';
import { bramblebeastAct, bramblebeastDecide, maybeBramblebeast } from './bramblebeast';
import { maybeWisps, wispAct, wispDecide } from './wisp';

const BRAIN: Record<Enemy['kind'], { decide(w: World, e: Enemy): void; act(w: World, e: Enemy): boolean }> = {
  gnasher: { decide: gnasherDecide, act: gnasherAct },
  bramblebeast: { decide: bramblebeastDecide, act: bramblebeastAct },
  night_wisp: { decide: wispDecide, act: wispAct },
};

/** §6 step 9 (second half): rare arrivals, notice/alarm, decisions every 10 ticks. */
export function enemiesDecide(w: World): void {
  maybeBramblebeast(w);
  maybeWisps(w);
  const lookout = watchtowers(w.s).length > 0;
  for (const e of w.s.enemies) {
    if (!e.seen) {
      // a lookout up a tower sees three times as far (P5.7) and raises the alarm early
      const sees = (g: (typeof w.s.goblins)[number]) => awake(g) && dist(g.pos, e.pos) <= visionRadius(g, w) * (lookout ? towerSight(g, w) : 1);
      const spotter = (lookout ? w.s.goblins.find((g) => towerSight(g, w) > 1 && sees(g)) : undefined) ?? w.s.goblins.find(sees);
      if (spotter) {
        spotted(w, e, spotter);
        if (lookout && !harmless(e)) towerWarning(w, e, spotter);
      }
    }
    if (w.s.tick >= e.nextDecide) {
      e.nextDecide = w.s.tick + CFG.enemies.decideEvery;
      BRAIN[e.kind].decide(w, e);
    }
  }
}

/** §6 step 14: move, bite, smash, lure, and leave the map. */
export function enemiesAct(w: World): void {
  const gone: Enemy[] = [];
  for (const e of [...w.s.enemies]) if (w.s.enemies.includes(e) && BRAIN[e.kind].act(w, e)) gone.push(e);
  if (gone.length) w.s.enemies = w.s.enemies.filter((e) => !gone.includes(e));
}
