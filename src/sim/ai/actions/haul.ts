/**
 * HaulToStockpile (§12.3, P7.5): loose piles lying about the village (chopped wood, dropped stone, a hunter's bones)
 * are gathered up, a few at a time and all of one kind (food or materials), and carried to the zone where that kind
 * is kept (a pile at most `gather` tiles from the last, up to `load` units). Stages: 0 to the next pile, 1 pick it up, 2 to the zone, 3 put it all down.
 */
import { CFG } from '../../config';
import { dist } from '../../../shared/math';
import { addItem, canCarry, countItem, removeItems } from '../../inventory';
import { isGear } from '../../items';
import { moveAlong, planPath } from '../../steering';
import { deposit } from '../../stockpile';
import { atStore, storePos } from '../../commons';
import { findGroundItem } from '../targets';
import { busy } from './village';
import type { Goblin, GroundItem } from '../../state';
import type { ItemType, Vec2 } from '../../../shared/types';
import type { World } from '../../world';
import type { UtilityAction } from '../action';

const H = CFG.commons.haul;
const SKIP: ReadonlySet<ItemType> = new Set(['star_stone', 'apple_core', 'redcap', 'flower']);

/** A pile worth hauling: near the center, not at a zone already, not gear, and (once a trip has begun) kept at `zone`. */
const haulable = (g: Goblin, w: World, zone: Vec2 | null) => (it: GroundItem): boolean => {
  const t = it.stack.type, s = w.s;
  if (it.stack.qty <= 0 || SKIP.has(t) || isGear(t) || !canCarry(g, t) || dist(it.pos, s.village.center) > H.radius || atStore(s, it.pos, 1.5)) return false;
  if (!zone) return true;
  const z = storePos(s, t);
  return z.x === zone.x && z.y === zone.y;
};

const pile = (g: Goblin, w: World, zone: Vec2 | null): GroundItem | null =>
  dist(g.pos, w.s.village.center) > H.radius + 8 ? null : findGroundItem(g, w, haulable(g, w, zone), H.radius + 8);

function toPile(g: Goblin, w: World, it: GroundItem): boolean {
  if (!planPath(w, g, it.pos)) return false;
  it.reservedBy = g.id;
  Object.assign(g.activity, { targetId: it.id, stage: 0 });
  return true;
}

function toZone(g: Goblin, w: World): 'running' | 'done' {
  const a = g.activity;
  a.stage = 2;
  a.targetId = null;
  return a.target && planPath(w, g, a.target) ? 'running' : 'done';
}

export const HaulToStockpile: UtilityAction = {
  id: 'haul_to_stockpile', tags: ['work'], minStage: 'youngling', interruptible: true,
  isAvailable: (g, w) => !!pile(g, w, null),
  cap: (g) => H.score * (0.5 + g.personality.industry) * (1 - busy(g)) * 1.5,
  score: (g, w) => {
    const it = pile(g, w, null);
    if (!it) return 0;
    return H.score * (0.5 + g.personality.industry) * (1 - busy(g)) * (1 - 0.5 * Math.min(1, dist(g.pos, it.pos) / 20)) * Math.min(1.5, 0.75 + it.stack.qty / 8);
  },
  start(g, w) {
    const it = pile(g, w, null);
    if (!it) return false;
    g.activity.target = { ...storePos(w.s, it.stack.type) };
    g.activity.count = 0;
    return toPile(g, w, it);
  },
  step(g, w) {
    const a = g.activity;
    if (a.stage === 0 || a.stage === 2) {
      if (a.path.length && moveAlong(w, g) !== 'arrived') return 'running';
      if (a.stage === 2) { a.stage = 3; a.progress = CFG.goblin.pickupTicks; }
      else { a.stage = 1; a.progress = CFG.goblin.pickupTicks; }
    }
    if (--a.progress > 0) return 'running';
    const zone = a.target!;
    if (a.stage === 1) {
      const it = w.s.groundItems.find((x) => x.id === a.targetId);
      if (it && !it.airborne && it.reservedBy === g.id) {
        const n = Math.min(it.stack.qty, Math.max(0, H.load - (a.count ?? 0)));
        const got = addItem(g, { ...it.stack, qty: n });
        it.stack.qty -= got;
        it.reservedBy = null;
        if (it.stack.qty <= 0) w.s.groundItems.splice(w.s.groundItems.indexOf(it), 1);
        a.count = (a.count ?? 0) + got;
        if (got > 0) w.emit({ type: 'item_picked', goblinId: g.id, item: it.stack.type, at: g.pos });
      }
      // the next pile of the same kind close by, while there is room in the load
      const more = (a.count ?? 0) < H.load ? pile(g, w, zone) : null;
      if (more && dist(more.pos, g.pos) <= H.gather && toPile(g, w, more)) return 'running';
      return (a.count ?? 0) > 0 ? toZone(g, w) : 'failed';
    }
    // stage 3: put down as much of the trip's kind as was picked up (the goblin's own food stays in its pack)
    if (dist(g.pos, zone) > 1.6) return 'failed';
    let left = a.count ?? 0;
    for (const st of [...g.inventory]) {
      if (left <= 0) break;
      if (isGear(st.type) || SKIP.has(st.type)) continue;
      const z = storePos(w.s, st.type);
      if (z.x !== zone.x || z.y !== zone.y) continue;
      const n = Math.min(st.qty, left, countItem(g, st.type));
      left -= n;
      removeItems(g, st.type, n);
      deposit(w.s, { type: st.type, qty: n });
      w.emit({ type: 'item_stored', goblinId: g.id, item: st.type, qty: n });
    }
    return 'done';
  },
};
