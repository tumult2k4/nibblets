/**
 * Tools & weapons (§11.3): one item per slot with durability counted in uses. A goblin works with the best tool it
 * holds or carries; each finished job wears it by one use, and a broken tool leaves its parts on the ground
 * (stick / stone). Fine items (§11.1) last 50 % longer and work 50 % better. Repair arrives with the workbench (P5).
 */
import { q4 } from '../shared/math';
import { CFG } from './config';
import type { ItemStack, ItemType } from '../shared/types';
import { itemDef } from './items';
import { spawnGroundItem } from './groundItems';
import type { Goblin } from './state';
import type { World } from './world';

export type ToolJob = 'chop' | 'mine' | 'fish';
const MUL = { chop: 'chopMul', mine: 'mineMul', fish: 'fishMul' } as const;
const FINE = CFG.crafting.fineBonus;

/** Tools and weapons wear out; everything else does not. */
export const isTool = (t: ItemType): boolean => (itemDef(t).uses ?? 0) > 0;
export const maxUses = (t: ItemType, fine = false): number => Math.round((itemDef(t).uses ?? 0) * (fine ? FINE : 1));
/** Uses left (a brand-new tool carries no `dur`). */
export const usesLeft = (s: ItemStack): number => s.dur ?? maxUses(s.type, s.fine);

/** The hand item first, then the inventory. */
export const gear = (g: Goblin): ItemStack[] => (g.equipped.hand ? [g.equipped.hand, ...g.inventory] : g.inventory);

/** Speed multiplier of a stack for a job (1 = no help); a fine tool adds half again of its bonus. */
export function toolMul(s: ItemStack, job: ToolJob): number {
  const m = itemDef(s.type).tool?.[MUL[job]] ?? 1;
  return m > 1 && s.fine ? 1 + (m - 1) * FINE : m;
}

/** The held or carried stack that is best at `job` and its multiplier (null and 1 = bare hands). */
export function toolFor(g: Goblin, job: ToolJob): { stack: ItemStack | null; mul: number } {
  let stack: ItemStack | null = null, mul = 1;
  for (const s of gear(g)) {
    const m = toolMul(s, job);
    if (m > mul) { mul = m; stack = s; }
  }
  return { stack, mul };
}

/** A held or carried tool that can fell trees (stone axe), if any. */
export const fellingTool = (g: Goblin): ItemStack | null => gear(g).find((s) => itemDef(s.type).tool?.fells) ?? null;

/** Weapon damage of a stack (0 = not a weapon); fine weapons hit 50 % harder. */
export const weaponDmg = (s: ItemStack | null): number => (s ? (itemDef(s.type).weapon?.dmg ?? 0) * (s.fine ? FINE : 1) : 0);
/** The goblin's best weapon, held or carried. */
export function bestWeapon(g: Goblin): ItemStack | null {
  let best: ItemStack | null = null;
  for (const s of gear(g)) if (weaponDmg(s) > weaponDmg(best)) best = s;
  return best;
}

/** One use of `s`. At zero it breaks: out of the hand or inventory, its parts dropped at the goblin's feet. */
export function wearTool(w: World, g: Goblin, s: ItemStack): void {
  s.dur = usesLeft(s) - 1;
  if (s.dur > 0) return;
  if (g.equipped.hand === s) g.equipped.hand = null;
  const i = g.inventory.indexOf(s);
  if (i >= 0) g.inventory.splice(i, 1);
  let k = 0;
  for (const [type, qty] of Object.entries(itemDef(s.type).breaksInto ?? {})) {
    spawnGroundItem(w, { type: type as ItemType, qty }, { x: q4(g.pos.x + 0.3 - 0.4 * k), y: q4(g.pos.y + 0.2 * k) });
    k++;
  }
  w.emit({ type: 'tool_broken', goblinId: g.id, item: s.type, at: { x: g.pos.x, y: g.pos.y } });
}
