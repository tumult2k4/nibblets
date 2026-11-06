/**
 * How the god could answer a prayer (§17.4, P8.9): the command that meets it, aimed at the one praying, the one
 * prayed for, or the nearest Gnasher, chosen from what is allowed now (in Divine mode: unlocked and affordable).
 * The Prayers panel's Answer button and the balance runner's god profiles use it; it only builds commands.
 */
import { dist } from '../../shared/math';
import type { ID, ItemType, PrayerKind, Vec2 } from '../../shared/types';
import type { World } from '../world';
import type { Prayer } from './faithState';
import { validate, type Command } from '../commands';

type Aim = 'self' | 'target' | 'foe' | 'gift';
/** Tried in order: the first the god may cast now is the answer. */
const WAYS: Record<PrayerKind, [string, Aim][]> = {
  food: [['apple_shower', 'self'], ['apple', 'gift']], water: [['rain', 'self']], rain: [['rain', 'self']], sun: [['clear_sky', 'self']],
  warmth: [['warm_sun', 'self']], healing: [['healing_touch', 'target']], protection: [['lightning', 'foe']],
  child: [['fertility', 'self']], mate: [['blessing', 'self']], lost_item: [['shiny_gift', 'self'], ['stone', 'gift']],
  revenge: [['curse', 'target']], forgiveness: [['blessing', 'self']], thanks: [],
};

/** The command that would answer `p` now, or null if there is none the god may use. */
export function answerFor(w: World, p: Prayer): Command | null {
  const g = w.goblin(p.goblinId);
  if (!g) return null;
  for (const [power, aim] of WAYS[p.kind]) {
    let pos: Vec2 = g.pos, targetId: ID | undefined = g.id;
    if (aim === 'target') {
      const o = p.targetId !== undefined ? w.goblin(p.targetId) : g; // healing for itself when nobody is named
      if (!o) continue;
      pos = o.pos;
      targetId = o.id;
    } else if (aim === 'foe') {
      const e = [...w.s.enemies].sort((a, b) => dist(a.pos, g.pos) - dist(b.pos, g.pos))[0];
      if (!e) continue;
      pos = e.pos;
      targetId = undefined;
    }
    const at = { x: pos.x, y: pos.y };
    const cmd: Command = aim === 'gift'
      ? { type: 'god_spawn_item', item: power as ItemType, qty: 3, pos: { x: at.x + 0.6, y: at.y } }
      : { type: 'god_cast', power, pos: at, ...(targetId !== undefined ? { targetId } : {}) };
    if (validate(w, cmd) === null) return cmd;
  }
  return null;
}
