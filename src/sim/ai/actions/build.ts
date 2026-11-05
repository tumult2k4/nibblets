import { CFG } from '../../config';
import { dist } from '../../../shared/math';
import { addItem, countItem } from '../../inventory';
import { needUrgency } from '../../goblin/needs';
import { moveAlong, planPath } from '../../steering';
import { distanceFalloff } from '../considerations';
import { deposit, stockCount, withdraw } from '../../stockpile';
import { addLabor, blueprints, inFlight, missingMaterials, workSpot } from '../../buildings';
import type { ItemType } from '../../../shared/types';
import type { Building, Goblin } from '../../state';
import type { World } from '../../world';
import type { UtilityAction } from '../action';
import { goalBuilding } from '../planner';

const B = CFG.buildings;
const comfortable = (g: Goblin): number => 1 - needUrgency(Math.min(g.needs.hunger, g.needs.thirst, g.needs.energy + 10, g.needs.warmth + 20));
/** A goblin's own goal building (§7.4) or own blueprint comes first. */
const ownerMul = (g: Goblin, b: Building): number => (goalBuilding(g) === b.id || b.ownerId === g.id ? 1.5 : 1);

/** A blueprint that still needs a material this goblin carries or can fetch from the stockpile. */
function deliveryJob(g: Goblin, w: World): { b: Building; type: ItemType; fromStock: boolean } | null {
  let best: { b: Building; type: ItemType; fromStock: boolean } | null = null;
  let bestD = Infinity;
  for (const b of blueprints(w.s)) {
    for (const m of missingMaterials(b)) {
      if (m.qty - inFlight(w, b, m.type, g.id) <= 0) continue;
      const carried = countItem(g, m.type) > 0;
      if (!carried && stockCount(w.s, m.type) <= 0) continue;
      const d = dist(g.pos, b.pos) / ownerMul(g, b);
      if (d < bestD) { bestD = d; best = { b, type: m.type, fromStock: !carried }; }
    }
  }
  return best;
}

/** Haul construction materials into a blueprint (§10.2, cooperative: several goblins may carry at once). */
export const DeliverMaterial: UtilityAction = {
  id: 'deliver_material', tags: ['work'], minStage: 'youngling', interruptible: true,
  isAvailable: (g, w) => w.s.buildings.length > 0 && !!deliveryJob(g, w),
  score: (g, w) => {
    const job = deliveryJob(g, w)!;
    // already carrying it: finish the trip
    const carrying = job.fromStock ? 1 : 1.5;
    return 0.38 * carrying * ownerMul(g, job.b) * comfortable(g) * distanceFalloff(dist(g.pos, job.b.pos), 50);
  },
  start(g, w) {
    const job = deliveryJob(g, w);
    if (!job) return false;
    const a = g.activity;
    a.targetId = job.b.id;
    a.target = { ...job.b.pos };
    a.progress = 0;
    if (job.fromStock) {
      a.stage = 0;
      return planPath(w, g, w.s.village.stockpilePos);
    }
    a.stage = 2;
    return planPath(w, g, workSpot(w.s, job.b, g));
  },
  step(g, w) {
    const a = g.activity;
    const b = w.s.buildings.find((x) => x.id === a.targetId);
    if (!b) return 'failed';
    const need = missingMaterials(b);
    if (a.stage === 0) {
      if (moveAlong(w, g) !== 'arrived') return 'running';
      a.stage = 1;
      a.progress = CFG.goblin.pickupTicks;
    }
    if (a.stage === 1) {
      if (--a.progress > 0) return 'running';
      // take only what is still needed after the others' loads
      let took = 0;
      for (const m of need) {
        const want = m.qty - inFlight(w, b, m.type, g.id) - countItem(g, m.type);
        if (want <= 0) continue;
        const n = withdraw(w.s, m.type, want);
        const got = addItem(g, { type: m.type, qty: n });
        if (got < n) deposit(w.s, { type: m.type, qty: n - got });
        if (got > 0) w.emit({ type: 'item_taken', goblinId: g.id, item: m.type, qty: got });
        took += got;
      }
      if (!took && !need.some((m) => countItem(g, m.type) > 0)) return 'failed';
      a.stage = 2;
      if (!planPath(w, g, workSpot(w.s, b, g))) return 'failed';
    }
    if (a.stage === 2) {
      if (moveAlong(w, g) !== 'arrived') return 'running';
      a.stage = 3;
      a.progress = CFG.goblin.pickupTicks;
    }
    if (--a.progress > 0) return 'running';
    for (const m of need) {
      const n = Math.min(m.qty, countItem(g, m.type));
      if (n <= 0) continue;
      const st = g.inventory.find((s) => s.type === m.type)!;
      st.qty -= n;
      const slot = b.storage.find((s) => s.type === m.type);
      if (slot) slot.qty += n;
      else b.storage.push({ type: m.type, qty: n });
    }
    g.inventory = g.inventory.filter((s) => s.qty > 0);
    return 'done';
  },
};

/** A blueprint with every material delivered, ready for labor. */
function buildJob(g: Goblin, w: World): Building | null {
  let best: Building | null = null;
  let bestD = Infinity;
  for (const b of blueprints(w.s)) {
    if (missingMaterials(b).length) continue;
    const d = dist(g.pos, b.pos) / ownerMul(g, b);
    if (d < bestD) { bestD = d; best = b; }
  }
  return best;
}

/** Put labor into a supplied blueprint until it is done (or a work chunk passes and needs are re-weighed). */
export const Build: UtilityAction = {
  id: 'build', tags: ['work'], minStage: 'youngling', interruptible: true,
  isAvailable: (g, w) => w.s.buildings.length > 0 && !!buildJob(g, w),
  score: (g, w) => {
    const b = buildJob(g, w)!;
    return 0.42 * ownerMul(g, b) * comfortable(g) * distanceFalloff(dist(g.pos, b.pos), 50);
  },
  start(g, w) {
    const b = buildJob(g, w);
    if (!b) return false;
    g.activity.targetId = b.id;
    g.activity.target = { ...b.pos };
    g.activity.stage = 0;
    g.activity.progress = B.workChunk;
    return planPath(w, g, workSpot(w.s, b, g));
  },
  step(g, w) {
    const a = g.activity;
    const b = w.s.buildings.find((x) => x.id === a.targetId);
    if (!b || b.buildProgress >= 1) return 'done';
    if (a.stage === 0) {
      if (moveAlong(w, g) !== 'arrived') return 'running';
      a.stage = 1;
    }
    g.facing = Math.atan2(b.pos.y - g.pos.y, b.pos.x - g.pos.x);
    if (addLabor(w, g, b)) return 'done';
    return --a.progress > 0 ? 'running' : 'done';
  },
};
