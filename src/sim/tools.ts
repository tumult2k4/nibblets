/**
 * Tools & weapons (§11.3): one item per slot with durability counted in uses. A goblin works with the best tool it
 * carries (P4.2 adds the hand slot); each finished job wears it by one use, and a broken tool leaves its parts on
 * the ground (stick / stone). Repair at the workbench arrives with the workbench (P5).
 */
import { q4 } from '../shared/math';
import type { ItemStack, ItemType } from '../shared/types';
import { itemDef } from './items';
import { spawnGroundItem } from './groundItems';
import type { Goblin } from './state';
import type { World } from './world';

export type ToolJob = 'chop' | 'mine' | 'fish';
const MUL = { chop: 'chopMul', mine: 'mineMul', fish: 'fishMul' } as const;

export const maxUses = (t: ItemType): number => itemDef(t).uses ?? 0;
/** Tools and weapons wear out; everything else does not. */
export const isTool = (t: ItemType): boolean => maxUses(t) > 0;
/** Uses left (a brand-new tool carries no `dur`). */
export const usesLeft = (s: ItemStack): number => s.dur ?? maxUses(s.type);

/** The carried stack that is best at `job` and its speed multiplier (1 and null = bare hands). */
export function toolFor(g: Goblin, job: ToolJob): { stack: ItemStack | null; mul: number } {
  let stack: ItemStack | null = null, mul = 1;
  for (const s of g.inventory) {
    const m = itemDef(s.type).tool?.[MUL[job]] ?? 0;
    if (m > mul) { mul = m; stack = s; }
  }
  return { stack, mul };
}

/** A carried tool that can fell trees (stone axe), if any. */
export const fellingTool = (g: Goblin): ItemStack | null => g.inventory.find((s) => itemDef(s.type).tool?.fells) ?? null;

/** One use of `s`. At zero it breaks: out of the inventory, its parts dropped at the goblin's feet. */
export function wearTool(w: World, g: Goblin, s: ItemStack): void {
  s.dur = usesLeft(s) - 1;
  if (s.dur > 0) return;
  const i = g.inventory.indexOf(s);
  if (i >= 0) g.inventory.splice(i, 1);
  let k = 0;
  for (const [type, qty] of Object.entries(itemDef(s.type).breaksInto ?? {})) {
    spawnGroundItem(w, { type: type as ItemType, qty }, { x: q4(g.pos.x + 0.3 - 0.4 * k), y: q4(g.pos.y + 0.2 * k) });
    k++;
  }
  w.emit({ type: 'tool_broken', goblinId: g.id, item: s.type, at: { x: g.pos.x, y: g.pos.y } });
}
