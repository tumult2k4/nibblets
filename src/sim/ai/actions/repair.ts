/**
 * `RepairBuilding` (§10, P4.6): a finished building below 70 % hp (storms, and from P4.7 Bramblebeasts) gets patched
 * one piece at a time: fetch a wood (stone for a stone hut) from the pack or the spare stock, walk over, work 8 s,
 * and a quarter of its hp comes back. Owners care most; one repairer per building.
 */
import { CFG } from '../../config';
import { dist, q4 } from '../../../shared/math';
import type { ItemType } from '../../../shared/types';
import { addItem, countItem, removeItems } from '../../inventory';
import { moveAlong, planPath } from '../../steering';
import { deposit, withdraw } from '../../stockpile';
import { isComplete, workSpot } from '../../buildings';
import { spareStock } from '../../crafting';
import { workMul } from '../../combat';
import { busy } from './village';
import type { Building, Goblin } from '../../state';
import type { World } from '../../world';
import type { UtilityAction } from '../action';

const F = CFG.fences;

export const repairItem = (b: Building): ItemType => (F.repairItem[b.type] ?? 'wood') as ItemType;
export const wantsRepair = (b: Building): boolean => isComplete(b) && b.hp < b.maxHp * CFG.storms.repairBelow;

const taken = (g: Goblin, w: World, b: Building): boolean =>
  w.s.goblins.some((o) => o.id !== g.id && o.activity.action === 'repair_building' && o.activity.status === 'running' && o.activity.targetId === b.id);
const hasMaterial = (g: Goblin, w: World, b: Building): boolean => countItem(g, repairItem(b)) > 0 || spareStock(w, repairItem(b)) >= 1;

/** Nearest damaged building nobody else is mending, with material to hand. */
function repairJob(g: Goblin, w: World): Building | null {
  let best: Building | null = null, bd = 40;
  for (const b of w.s.buildings) {
    if (!wantsRepair(b) || taken(g, w, b) || !hasMaterial(g, w, b)) continue;
    const d = dist(g.pos, b.pos) * (b.ownerId === g.id ? 0.5 : 1);
    if (d < bd) { bd = d; best = b; }
  }
  return best;
}

export const RepairBuilding: UtilityAction = {
  id: 'repair_building', tags: ['work'], minStage: 'adult', interruptible: true,
  isAvailable: (g, w) => w.s.buildings.some(wantsRepair) && !!repairJob(g, w),
  score(g, w) {
    const b = repairJob(g, w)!;
    return (0.25 + 0.4 * (1 - b.hp / b.maxHp)) * (b.ownerId === g.id ? 1.3 : 1) * (1 - busy(g));
  },
  start(g, w) {
    const b = repairJob(g, w);
    if (!b) return false;
    const a = g.activity;
    a.targetId = b.id;
    if (countItem(g, repairItem(b)) > 0) {
      a.stage = 1;
      return planPath(w, g, workSpot(w.s, b, g));
    }
    a.stage = 0;
    return planPath(w, g, w.s.village.stockpilePos);
  },
  step(g, w) {
    const a = g.activity;
    const b = w.s.buildings.find((x) => x.id === a.targetId);
    if (!b || !wantsRepair(b)) return 'done';
    const item = repairItem(b);
    if (a.stage === 0) {
      if (moveAlong(w, g) !== 'arrived') return 'running';
      if (spareStock(w, item) < 1) return 'failed';
      const n = withdraw(w.s, item, 1);
      if (addItem(g, { type: item, qty: n }) < n) { deposit(w.s, { type: item, qty: n }); return 'failed'; }
      a.stage = 1;
      if (!planPath(w, g, workSpot(w.s, b, g))) return 'failed';
    }
    if (a.stage === 1) {
      if (moveAlong(w, g) !== 'arrived') return 'running';
      a.stage = 2;
      a.progress = Math.round(F.repairTicks / workMul(g));
    }
    g.facing = Math.atan2(b.pos.y - g.pos.y, b.pos.x - g.pos.x);
    if (--a.progress > 0) return 'running';
    if (countItem(g, item) < 1) return 'failed';
    removeItems(g, item, 1);
    b.hp = q4(Math.min(b.maxHp, b.hp + b.maxHp * F.repairShare));
    if (b.hp >= b.maxHp * CFG.storms.repairBelow && b.data?.repair) delete b.data.repair;
    g.skills.building = q4((g.skills.building ?? 0) + 0.05);
    return 'done';
  },
};
