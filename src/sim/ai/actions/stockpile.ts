import { CFG } from '../../config';
import { dist } from '../../../shared/math';
import { addItem, countItem, foodStack } from '../../inventory';
import { isFood, isGear } from '../../items';
import { HAND_RECIPES, RECIPES } from '../../recipes';
import { needUrgency } from '../../goblin/needs';
import { moveAlong, planPath } from '../../steering';
import { distanceFalloff } from '../considerations';
import { deposit, stockFood, withdraw } from '../../stockpile';
import { blueprints, buildingDef, isComplete, missingMaterials } from '../../buildings';
import { bedSpot, homeOf } from './home';
import type { ItemStack, ItemType } from '../../../shared/types';
import type { Building, Goblin } from '../../state';
import type { World } from '../../world';
import type { StepResult, UtilityAction } from '../action';

/** Stacks a goblin would rather store: materials no blueprint is waiting for, and food beyond what it keeps. Tools, clothes, baskets and mats stay with their user. */
function storable(g: Goblin, w: World): ItemStack[] {
  const food = g.inventory.filter((s) => isFood(s.type) && s.type !== 'apple_core').reduce((n, s) => n + s.qty, 0);
  const wanted = new Set(blueprints(w.s).flatMap((b) => missingMaterials(b).map((m) => m.type)));
  // inputs of the piece being crafted stay in the pack
  const crafting = g.activity.action === 'craft' && g.activity.status === 'running' ? RECIPES[HAND_RECIPES[g.activity.targetId ?? -1] ?? ''] : undefined;
  for (const t of Object.keys(crafting?.inputs ?? {})) wanted.add(t as ItemType);
  return g.inventory.filter((s) => (isGear(s.type) || s.type === 'redcap' ? false : !isFood(s.type) ? !wanted.has(s.type) : s.type !== 'apple_core' && food > CFG.plants.stockFoodKeep + 1));
}

function walkTo(g: Goblin, w: World): StepResult | null {
  const a = g.activity;
  if (a.stage === 0) {
    if (a.targetId === null && dist(g.pos, w.s.village.stockpilePos) < 0.9) a.path = [];
    if (moveAlong(w, g) !== 'arrived') return 'running';
    a.stage = 1;
    a.progress = CFG.goblin.pickupTicks;
  }
  return --a.progress > 0 ? 'running' : null;
}

/** A finished home with free storage slots (hut storage 6, §11.1). */
function pantry(g: Goblin, w: World): Building | null {
  const b = homeOf(g, w);
  if (!b || !isComplete(b)) return null;
  const used = b.storage.reduce((n, s) => n + s.qty, 0);
  return used < (buildingDef(b.type)?.storage ?? 0) ? b : null;
}

/** Carry materials (and surplus food) to the village stockpile — or surplus food home to the pantry. */
export const StoreItem: UtilityAction = {
  id: 'store_item', tags: ['work'], minStage: 'youngling', interruptible: true,
  isAvailable: (g, w) => storable(g, w).length > 0,
  score: (g, w) => {
    const n = storable(g, w).reduce((k, s) => k + s.qty, 0);
    const full = g.inventory.length >= CFG.goblin.inventorySlots ? 1.4 : 1;
    return Math.min(0.6, 0.18 + 0.05 * n) * full * (1 - needUrgency(Math.min(g.needs.hunger, g.needs.thirst)));
  },
  start(g, w) {
    const home = pantry(g, w);
    const onlyFood = storable(g, w).every((st) => isFood(st.type));
    g.activity.targetId = home && onlyFood ? home.id : null;
    return planPath(w, g, home && onlyFood ? bedSpot(home, g) : w.s.village.stockpilePos);
  },
  step(g, w) {
    const r = walkTo(g, w);
    if (r) return r;
    const home = g.activity.targetId !== null ? pantry(g, w) : null;
    if (home) return stashAtHome(g, w, home);
    const keepFood = CFG.plants.stockFoodKeep;
    let kept = 0;
    for (const st of [...g.inventory]) {
      if (st.type === 'apple_core' || st.type === 'redcap' || isGear(st.type)) continue; // gear stays with its user
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
  isAvailable: (g, w) => g.needs.hunger < 70 && !foodStack(g) && (!!stockFood(w.s) || !!homeFood(g, w)),
  score: (g, w) => (0.06 + 1.1 * needUrgency(g.needs.hunger)) * distanceFalloff(dist(g.pos, homeFood(g, w)?.pos ?? w.s.village.stockpilePos), 40),
  start(g, w) {
    const home = homeFood(g, w);
    g.activity.targetId = home?.id ?? null;
    return planPath(w, g, home ? bedSpot(home, g) : w.s.village.stockpilePos);
  },
  step(g, w) {
    const r = walkTo(g, w);
    if (r) return r;
    const home = g.activity.targetId !== null ? homeFood(g, w) : null;
    if (home) {
      const st = home.storage.find((x) => isFood(x.type) && x.qty > 0)!;
      const got = addItem(g, { type: st.type, qty: Math.min(2, st.qty) });
      st.qty -= got;
      home.storage = home.storage.filter((x) => x.qty > 0);
      return got > 0 ? 'done' : 'failed';
    }
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

/** The goblin's home, if it holds food. */
function homeFood(g: Goblin, w: World): Building | null {
  const b = homeOf(g, w);
  return b && isComplete(b) && b.storage.some((x) => isFood(x.type) && x.qty > 0) ? b : null;
}

/** Put surplus food into the home pantry up to its capacity; the rest stays in the pockets. */
function stashAtHome(g: Goblin, w: World, home: Building): StepResult {
  const cap = buildingDef(home.type)?.storage ?? 0;
  let room = cap - home.storage.reduce((n, s) => n + s.qty, 0);
  let kept = 0;
  for (const st of g.inventory) {
    if (!isFood(st.type) || st.type === 'apple_core' || room <= 0) continue;
    const keep = Math.min(st.qty, Math.max(0, CFG.plants.stockFoodKeep - kept));
    kept += keep;
    const n = Math.min(room, st.qty - keep);
    if (n <= 0) continue;
    st.qty -= n;
    room -= n;
    const slot = home.storage.find((x) => x.type === st.type);
    if (slot) slot.qty += n;
    else home.storage.push({ type: st.type, qty: n });
    w.emit({ type: 'item_stored', goblinId: g.id, item: st.type, qty: n });
  }
  g.inventory = g.inventory.filter((s) => s.qty > 0);
  return 'done';
}
