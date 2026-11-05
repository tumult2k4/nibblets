import { CFG } from './config';
import { itemDef } from './items';
import { stepAirborne } from './god/airborne';
import { hitEnemiesAt, massOf } from './god/impact';
import type { World } from './world';
import type { GroundItem } from './state';
import { allocId } from '../shared/ids';
import type { ItemStack, Vec2 } from '../shared/types';

export function spawnGroundItem(w: World, stack: ItemStack, pos: Vec2, airborne: GroundItem['airborne'] = null): GroundItem {
  const it: GroundItem = {
    id: allocId(w.s), pos: { x: pos.x, y: pos.y }, stack: { ...stack }, droppedTick: w.s.tick, airborne, reservedBy: null,
  };
  w.s.groundItems.push(it);
  return it;
}

/** Airborne items fall every tick; ground items decay every 50 ticks (§6 step 7). */
export function updateGroundItems(w: World): void {
  const s = w.s;
  let sunk = false;
  for (const it of s.groundItems) {
    if (it.airborne && !it.airborne.held) {
      const r = stepAirborne(w, it.pos, it.airborne, CFG.god.itemBounce);
      if (r.impactSpeed > 0 && !r.water) hitEnemiesAt(w, it.pos, r.impactSpeed, massOf(it.stack.type));
      if (r.landed) {
        it.airborne = null;
        it.droppedTick = s.tick;
        if (r.water) {
          it.stack.qty = 0; // splash: sinks
          sunk = true;
        }
      }
    }
  }
  if (sunk) s.groundItems = s.groundItems.filter((it) => it.stack.qty > 0);
  if (s.tick % CFG.items.decayEvery !== 0) return;
  const before = s.groundItems.length;
  s.groundItems = s.groundItems.filter((it) => {
    const days = itemDef(it.stack.type).decayDays;
    if (!days || it.airborne) return true;
    return s.tick - it.droppedTick < days * CFG.time.dayTicks;
  });
  // reservations of vanished items are cleared lazily by the actions that hold them
  if (before !== s.groundItems.length) w.itemHash.rebuild(s.groundItems);
}
