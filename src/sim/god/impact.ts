/**
 * Thrown and dropped things hurt enemies (P4.8): a goblin, stone or log that comes down on an enemy deals
 * (impact speed − 3) × 4 × mass (goblin 1.5, stone/flint 1, wood 0.8, bone 0.6, anything else 0.3). A stone thrown
 * hard (18 u/s) is 60: one dead Gnasher. Survivors that can run, run.
 */
import { CFG } from '../config';
import { dist, q4 } from '../../shared/math';
import type { Vec2 } from '../../shared/types';
import type { World } from '../world';
import { killEnemy } from '../combat';

const PW = CFG.powers;

export const massOf = (kind: string): number => PW.thrownMass[kind] ?? 0.3;

/** Returns how many enemies were struck. */
export function hitEnemiesAt(w: World, at: Vec2, speed: number, mass: number): number {
  const dmg = q4(Math.max(0, speed - PW.thrownFree) * PW.thrownPerSpeed * mass);
  if (dmg <= 0) return 0;
  let n = 0;
  for (const e of [...w.s.enemies]) {
    if (e.kind === 'night_wisp' || dist(e.pos, at) > PW.thrownHit) continue;
    n++;
    e.hp = q4(e.hp - dmg);
    w.emit({ type: 'attack', attackerId: -1, targetId: e.id, damage: dmg, at: e.pos });
    if (e.hp <= 0) { killEnemy(w, e, null); continue; }
    if (e.hp < CFG.enemies[e.kind].fleeAt * e.maxHp && e.mode !== 'flee') { e.mode = 'flee'; e.path = [{ ...e.home }]; e.nextDecide = w.s.tick; }
  }
  return n;
}
