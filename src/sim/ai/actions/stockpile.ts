import { CFG } from '../../config';
import { dist } from '../../../shared/math';
import { addItem, countItem, foodStack } from '../../inventory';
import { isFood } from '../../items';
import { needUrgency } from '../../goblin/needs';
import { moveAlong, planPath } from '../../steering';
import { distanceFalloff } from '../considerations';
import { deposit, stockFood, withdraw } from '../../stockpile';
import { blueprints, missingMaterials } from '../../buildings';
import type { ItemStack } from '../../../shared/types';
import type { Goblin } from '../../state';
import type { World } from '../../world';
import type { StepResult, UtilityAction } from '../action';

/** Stacks a goblin would rather store: materials no blueprint is waiting for, and food beyond what it keeps. */
function storable(g: Goblin, w: World): ItemStack[] {
  const food = g.inventory.filter((s) => isFood(s.type) && s.type !== 'apple_core').reduce((n, s) => n + s.qty, 0);
  const wanted = new Set(blueprints(w.s).flatMap((b) => missingMaterials(b).map((m) => m.type)));
  return g.inventory.filter((s) => (!isFood(s.type) ? !wanted.has(s.type) : s.type !== 'apple_core' && food > CFG.plants.stockFoodKeep + 1));
}

function walkTo(g: Goblin, w: World): StepResult | null {
  const a = g.activity;
  if (a.stage === 0) {
    if (dist(g.pos, w.s.village.stockpilePos) < 0.9) a.path = [];
    if (moveAlong(w, g) !== 'arrived') return 'running';
    a.stage = 1;
    a.progress = CFG.goblin.pickupTicks;
  }
  return --a.progress > 0 ? 'running' : null;
}

/** Carry materials (and surplus food) to the village stockpile. */
export const StoreItem: UtilityAction = {
  id: 'store_item', tags: ['work'], minStage: 'youngling', interruptible: true,
  isAvailable: (g, w) => storable(g, w).length > 0,
  score: (g, w) => {
    const n = storable(g, w).reduce((k, s) => k + s.qty, 0);
    const full = g.inventory.length >= CFG.goblin.inventorySlots ? 1.4 : 1;
    return Math.min(0.6, 0.18 + 0.05 * n) * full * (1 - needUrgency(Math.min(g.needs.hunger, g.needs.thirst)));
  },
  start: (g, w) => planPath(w, g, w.s.village.stockpilePos),
  step(g, w) {
    const r = walkTo(g, w);
    if (r) return r;
    const keepFood = CFG.plants.stockFoodKeep;
    let kept = 0;
    for (const st of [...g.inventory]) {
      if (st.type === 'apple_core') continue;
      let qty = st.qty;
      if (isFood(st.type)) {
        const keep = Math.min(qty, Math.max(0, keepFood - kept));
        kept += keep;
        qty -= keep;
      }
      if (qty <= 0) continue;
      deposit(w.s, { type: st.type, qty });
      st.qty -= qty;
      w.emit({ type: 'item_stored', goblinId: g.id, item: st.type, qty });
    }
    g.inventory = g.inventory.filter((s) => s.qty > 0);
    return 'done';
  },
};

/** Fetch food from the stockpile when hungry and the pockets are empty. */
export const TakeItem: UtilityAction = {
  id: 'take_item', tags: ['food'], minStage: 'youngling', interruptible: true,
  isAvailable: (g, w) => g.needs.hunger < 70 && !foodStack(g) && !!stockFood(w.s),
  score: (g, w) => (0.06 + 1.1 * needUrgency(g.needs.hunger)) * distanceFalloff(dist(g.pos, w.s.village.stockpilePos), 40),
  start: (g, w) => planPath(w, g, w.s.village.stockpilePos),
  step(g, w) {
    const r = walkTo(g, w);
    if (r) return r;
    const f = stockFood(w.s);
    if (!f) return 'failed';
    const type = f.type;
    const n = withdraw(w.s, type, 2);
    const got = addItem(g, { type, qty: n });
    if (got < n) deposit(w.s, { type, qty: n - got });
    if (got <= 0) return 'failed';
    w.emit({ type: 'item_taken', goblinId: g.id, item: type, qty: got });
    return countItem(g, type) > 0 ? 'done' : 'failed';
  },
};
