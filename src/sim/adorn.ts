/**
 * P7.5 adornments (§11.1): a bone necklace in the neck slot unsettles Gnashers (it counts ×1.5 in a crowd they fear,
 * and a lone wearer is passed over like a scarred one); war paint, put on the moment it is mixed, makes a goblin
 * braver in a fight for a day; a fireplace leaves ash for the paint. Plus how much a goblin wants each.
 */
import { CFG } from './config';
import { clamp } from '../shared/math';
import { itemDef } from './items';
import { countItem, removeItems } from './inventory';
import { addMood } from './goblin/mood';
import type { Building, Goblin } from './state';
import type { World } from './world';

const A = CFG.commons.adorn, DAY = CFG.time.dayTicks;

/** Wearing war paint still. */
export const painted = (g: Goblin, w: World): boolean => g.mood.modifiers.some((m) => m.id === 'war_paint' && m.expiresTick > w.s.tick);

/** Bravery in a fight: the goblin's own, and the paint's. */
export const braveryOf = (g: Goblin, w: World): number => clamp(g.personality.bravery + (painted(g, w) ? A.paintBravery : 0), 0, 1);

/** How much more a Gnasher reckons with this goblin (a necklace of bones). */
export const fearMul = (g: Goblin): number => (g.equipped.neck ? itemDef(g.equipped.neck.type).wear?.fear ?? 1 : 1);

/** Put on the war paint just mixed: it is used up, and the goblin feels fierce for a day. */
export function applyPaint(w: World, g: Goblin): boolean {
  if (countItem(g, 'war_paint') < 1) return false;
  removeItems(g, 'war_paint', 1);
  addMood(w, g, 'war_paint', A.paintMood, A.paintDays * DAY);
  return true;
}

/** Gnashers have come lately (a sighting, a bite or a theft in the last two days). */
export const threatened = (w: World): boolean => w.s.threat.alarms > 0 && w.s.threat.marks.some((m) => w.s.tick - m.tick < 2 * DAY);

/** 0..1 want for war paint (brave goblins, while Gnashers are about) or a necklace (an empty neck, the brave first). */
export function adornWant(g: Goblin, w: World, item: 'war_paint' | 'bone_necklace'): number {
  if (item === 'war_paint') return painted(g, w) || !threatened(w) ? 0 : A.paintWant * (0.3 + g.personality.bravery);
  return g.equipped.neck || g.inventory.some((s) => s.type === item) ? 0 : A.necklaceWant * (0.4 + g.personality.bravery);
}

/** Ash a fireplace keeps from the wood fed to it (a stick leaves a quarter), up to `ashKeep`. */
export function addAsh(b: Building, wood: number, sticks: number): void {
  const ash = Math.min(A.ashKeep, (b.data?.ash ?? 0) + wood + sticks * 0.25);
  b.data = { ...(b.data ?? {}), ash: Math.round(ash * 100) / 100 };
}

/** Whole ash a tender can carry away (taken off the fireplace). */
export function takeAsh(b: Building): number {
  const n = Math.floor(b.data?.ash ?? 0);
  if (n > 0) b.data!.ash = Math.round((b.data!.ash! - n) * 100) / 100;
  return n;
}
