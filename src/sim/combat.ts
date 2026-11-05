/**
 * Combat (§14.2). P4.4: shared damage for goblins (enemy bites). P4.5 adds goblin attacks, hit checks, morale,
 * injuries and scars.
 */
import { q4 } from '../shared/math';
import { killGoblin } from './goblin/needs';
import type { DeathCause } from '../shared/types';
import type { Goblin } from './state';
import type { World } from './world';

/** Take `dmg` hp from a goblin; it dies at 0. */
export function hurtGoblin(w: World, g: Goblin, dmg: number, cause: DeathCause): void {
  g.health.hp = q4(g.health.hp - dmg);
  w.emit({ type: 'goblin_hurt', goblinId: g.id, damage: dmg, cause, at: g.pos });
  if (g.health.hp <= 0) killGoblin(w, g, cause);
}
