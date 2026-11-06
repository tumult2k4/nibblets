/** Village material wishes (P2.3/P4.1): a stockpile target per material plus whatever blueprints still wait for. */
import { CFG } from '../config';
import { missingMaterials } from '../buildings';
import { countItem } from '../inventory';
import { stockCount } from '../stockpile';
import { foodStores } from '../spoilage';
import { needUrgency } from '../goblin/needs';
import type { ItemType } from '../../shared/types';
import type { Goblin } from '../state';
import type { World } from '../world';

/** 0..1: how short the village (stockpile + what this goblin carries) is of `item`. */
export function materialWanted(g: Goblin, w: World, item: ItemType, target: number): number {
  let need = target;
  for (const b of w.s.buildings) for (const m of missingMaterials(b)) if (m.type === item) need += m.qty;
  return need <= 0 ? 0 : Math.max(0, 1 - (stockCount(w.s, item) + countItem(g, item)) / need);
}

export const woodWanted = (g: Goblin, w: World): number => materialWanted(g, w, 'wood', CFG.plants.woodTarget);
export const stickWanted = (g: Goblin, w: World): number => materialWanted(g, w, 'stick', CFG.mining.stickTarget);
/** Stone, or flint (a by-product of mining) when that runs short. */
export const stoneWanted = (g: Goblin, w: World): number =>
  Math.max(materialWanted(g, w, 'stone', CFG.mining.stoneTarget), 0.6 * materialWanted(g, w, 'flint', CFG.mining.flintTarget));

/** P7.1: how much the village wants what a hopper gives: meat while the food in store runs short, else a little. */
export function huntWant(g: Goblin, w: World): number {
  const H = CFG.wildlife.hunt;
  const food = Math.min(1, Math.max(0, 1 - foodStores(w.s).days / H.days));
  return Math.max(food, H.wantFood * needUrgency(g.needs.hunger), 0.25);
}
