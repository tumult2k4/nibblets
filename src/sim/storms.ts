/**
 * Storm damage (§9.1): buildings already below half hp take a beating in storms (stone huts shrug it off) and
 * crumble at 0. Anything under 70% carries a `repair` flag for RepairBuilding (P4.6).
 */
import { CFG } from './config';
import { q4 } from '../shared/math';
import type { Building } from './state';
import type { World } from './world';
import { destroyBuilding, isComplete } from './buildings';
import { weatherAt } from './weather';

const S = CFG.storms;
const EVERY = 10;

export const needsRepair = (b: Building): boolean => !!b.data?.repair;

/** Apply damage to a building; flags it for repair and destroys it at 0 hp. */
export function damageBuilding(w: World, b: Building, dmg: number, cause: string): void {
  b.hp = q4(Math.max(0, b.hp - dmg));
  if (b.hp <= 0) {
    destroyBuilding(w, b, cause);
    return;
  }
  flagRepair(b);
}

function flagRepair(b: Building): void {
  const want = b.hp < S.repairBelow * b.maxHp;
  if (want) (b.data ??= {}).repair = 1;
  else if (b.data?.repair) delete b.data.repair;
}

export function updateStorms(w: World): void {
  if (w.s.tick % EVERY !== 0) return;
  const dmg = (S.dmgPerHour * EVERY) / CFG.god.hourTicks;
  for (const b of [...w.s.buildings]) {
    if (!isComplete(b)) continue;
    if (!S.stormProof.includes(b.type) && b.hp < S.weakBelow * b.maxHp && weatherAt(w, b.pos) === 'storm') damageBuilding(w, b, dmg, 'storm');
    else flagRepair(b);
  }
}
