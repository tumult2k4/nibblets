/**
 * Planner goal stack (§7.4): a tiny recipe-resolving stack, not GOAP. A top-level goal (build my hut) pushes
 * subgoals (obtain 6 wood) that resolve to ordinary actions; the planned action gets a focus bonus in scoring.
 * `resolve` is pure (reads a PlanView) and unit tested; `planFor` applies it to a goblin.
 */
import { CFG } from '../config';
import type { ID, ItemStack, ItemType } from '../../shared/types';
import type { ActionId, Goblin } from '../state';
import type { World } from '../world';
import { countItem } from '../inventory';
import { stockCount } from '../stockpile';
import { isComplete, missingMaterials } from '../buildings';
import { needUrgency } from '../goblin/needs';

const PL = CFG.planner;

export type Goal = { kind: 'build'; buildingId: ID } | { kind: 'obtain'; item: ItemType; qty: number };
/**
 * `preempted` (bottom entry only): tick since which urgent needs keep overriding the plan, or −1.
 * `sub` entries were pushed by the planner and are re-derived on every decision, so they never go stale.
 */
export interface GoalEntry { goal: Goal; since: number; preempted: number; sub?: boolean }

export type Plan =
  | { kind: 'act'; action: ActionId }
  | { kind: 'push'; goal: Goal }
  | { kind: 'satisfied' }
  | { kind: 'impossible' };

/** Everything `resolve` may know about the world, as plain lookups (fakeable in tests). */
export interface PlanView {
  carried(item: ItemType): number;
  stock(item: ItemType): number;
  building(id: ID): { missing: ItemStack[]; complete: boolean } | null;
  /** loose items of this type the goblin could pick up */
  onGround(item: ItemType): boolean;
  /** a known plant it could chop for this item */
  canChop(item: ItemType): boolean;
  carryCap: number;
}

const CHOPPABLE: ReadonlySet<ItemType> = new Set(['wood', 'stick']);

/** Pure: what the goal wants next. */
export function resolve(goal: Goal, v: PlanView): Plan {
  if (goal.kind === 'build') {
    const b = v.building(goal.buildingId);
    if (!b) return { kind: 'impossible' };
    if (b.complete) return { kind: 'satisfied' };
    const m = b.missing[0];
    if (!m) return { kind: 'act', action: 'build' };
    // deliver_material fetches from the stockpile on its own; only an empty stockpile needs a subgoal
    if (v.carried(m.type) > 0 || v.stock(m.type) > 0) return { kind: 'act', action: 'deliver_material' };
    return { kind: 'push', goal: { kind: 'obtain', item: m.type, qty: Math.min(m.qty, v.carryCap) } };
  }
  if (v.carried(goal.item) >= goal.qty) return { kind: 'satisfied' };
  if (v.stock(goal.item) > 0) return { kind: 'act', action: 'gather_for_goal' };
  if (v.onGround(goal.item)) return { kind: 'act', action: 'pick_up' };
  if (CHOPPABLE.has(goal.item)) return { kind: 'act', action: v.canChop(goal.item) ? 'chop' : 'explore' };
  return { kind: 'impossible' };
}

export function viewFor(g: Goblin, w: World, canChop: (g: Goblin, w: World) => boolean): PlanView {
  return {
    carried: (item) => countItem(g, item),
    stock: (item) => stockCount(w.s, item),
    building: (id) => {
      const b = w.s.buildings.find((x) => x.id === id);
      return b ? { missing: missingMaterials(b), complete: isComplete(b) } : null;
    },
    onGround: (item) => w.s.groundItems.some((i) => i.stack.type === item && !i.airborne && (i.reservedBy === null || i.reservedBy === g.id)
      && Math.hypot(i.pos.x - g.pos.x, i.pos.y - g.pos.y) < PL.groundSearch),
    canChop: () => canChop(g, w),
    carryCap: 10,
  };
}

/** Push a top-level goal unless an equal one is already on the stack. */
export function pushGoal(g: Goblin, w: World, goal: Goal): void {
  const stack = g.goalStack;
  if (stack.some((e) => JSON.stringify(e.goal) === JSON.stringify(goal))) return;
  if (stack.length >= PL.maxDepth) return;
  stack.push({ goal, since: w.s.tick, preempted: -1 });
}

/** The building a goblin's goals are about, if any (actions prefer it). */
export function goalBuilding(g: Goblin): ID | null {
  for (const e of g.goalStack as GoalEntry[]) if (e.goal.kind === 'build') return e.goal.buildingId;
  return null;
}

/**
 * Walk the stack: pop satisfied/impossible goals, push subgoals (max depth 4), abandon everything if urgent needs
 * have pre-empted the plan for more than 300 ticks. Returns the action that gets the focus bonus, or null.
 */
export function planFor(g: Goblin, w: World, canChop: (g: Goblin, w: World) => boolean): ActionId | null {
  const stack = g.goalStack;
  if (!stack.length) return null;
  const urgent = Math.max(needUrgency(g.needs.hunger), needUrgency(g.needs.thirst), needUrgency(g.needs.energy), needUrgency(g.needs.warmth));
  const root = stack[0]!;
  if (urgent > PL.abandonUrgency) {
    if (root.preempted < 0) root.preempted = w.s.tick;
    else if (w.s.tick - root.preempted > PL.abandonTicks) {
      w.emit({ type: 'goal_abandoned', goblinId: g.id, goal: root.goal.kind });
      stack.length = 0;
      return null;
    }
  } else root.preempted = -1;
  // subgoals are derivable: drop and re-derive them so they track what the parent still needs
  while (stack.length && stack[stack.length - 1]!.sub) stack.pop();
  const view = viewFor(g, w, canChop);
  for (let guard = 0; guard < 8 && stack.length; guard++) {
    const top = stack[stack.length - 1]!;
    const p = resolve(top.goal, view);
    if (p.kind === 'act') return p.action;
    if (p.kind === 'push') {
      if (stack.length >= PL.maxDepth) return null;
      stack.push({ goal: p.goal, since: w.s.tick, preempted: -1, sub: true });
      continue;
    }
    stack.pop(); // satisfied or impossible: the parent re-resolves
  }
  return null;
}
