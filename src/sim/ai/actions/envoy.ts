/**
 * Errands to the rival clans (§16, P10.3). `SendGift`: the chief takes food the village can spare to the edge of the
 * land toward a clan that does not like the village much (the most hostile first; every few days a clan at most),
 * where that clan's goblins take it in: their store fills and they warm to the village, the more if they are
 * hungry — diplomacy against raids. `Defect`: an exile who chose to go over to a clan walks off the map toward it
 * and is gone (`migration.ts`).
 */
import { CFG } from '../../config';
import { clamp, dist } from '../../../shared/math';
import type { ItemStack, ItemType } from '../../../shared/types';
import type { Goblin } from '../../state';
import type { World } from '../../world';
import type { UtilityAction } from '../action';
import { moveAlong, planPath } from '../../steering';
import { needUrgency } from '../../goblin/needs';
import { addItem, removeItems } from '../../inventory';
import { deposit, withdraw } from '../../stockpile';
import { isFood, itemDef } from '../../items';
import { isExiled } from '../../leadership';
import { knownRivals, shiftRelation, type RivalClan } from '../../clans';
import { canSpare, doors, goodsValue } from '../../visitors';
import { departGoblin, leavingFor } from '../../migration';

const G = CFG.raids.gift, DAY = CFG.time.dayTicks, HOUR = CFG.god.hourTicks;
const pressed = (g: Goblin): boolean => Math.max(needUrgency(g.needs.hunger), needUrgency(g.needs.thirst), needUrgency(g.needs.energy)) > 0.5;
const GIFT_FOOD: ItemType[] = ['dried_apple', 'apple_mash', 'apple', 'berry', 'cooked_fish'];

/** Food worth `G.food` apples that the village can spare, the best-keeping kind first. Peace with a hostile clan is
 * worth more than a full store: then the chief keeps only `G.hostileKeep` days back. */
export function giftFood(w: World, c: RivalClan | null = giftClan(w)): ItemStack | null {
  const apple = itemDef('apple').nutrition ?? 1, hostile = !!c && c.relation <= CFG.clans.relation.hostile;
  for (const type of GIFT_FOOD) {
    const qty = Math.ceil((G.food * apple) / Math.max(1, itemDef(type).nutrition ?? apple));
    if (hostile ? canSpare(w.s, { type, qty }, G.hostileKeep) : canSpare(w.s, { type, qty })) return { type, qty };
  }
  return null;
}

/** The clan the chief would send a gift to now: met, not allied, under `G.below`, none sent lately; the coldest. */
export function giftClan(w: World): RivalClan | null {
  const t = w.s.tick;
  return knownRivals(w.s).filter((c) => !c.allied && c.relation < G.below && t >= (c.lastGift ?? -Infinity) + G.everyDays * DAY)
    .sort((a, b) => a.relation - b.relation || a.id - b.id)[0] ?? null;
}

const isChief = (g: Goblin, w: World): boolean => g.role === 'chief' && w.s.village.chiefId === g.id;

export const SendGift: UtilityAction = {
  id: 'send_gift', tags: ['social', 'work'], minStage: 'adult', interruptible: (g) => g.activity.stage === 0,
  isAvailable: (g, w) => isChief(g, w) && !pressed(g) && !g.heldByGod && !isExiled(g, w) && !!giftClan(w) && !!giftFood(w),
  score: (g, w) => {
    const c = giftClan(w);
    if (!c) return 0;
    const raided = c.lastRaid !== undefined && w.s.tick - c.lastRaid < 3 * DAY;
    return G.score + (c.relation <= CFG.clans.relation.hostile ? G.hostileScore : 0) + (raided ? 0.15 : 0) + 0.1 * g.personality.sociability;
  },
  start(g, w) {
    const c = giftClan(w);
    if (!c) return false;
    g.activity.targetId = c.id;
    g.activity.target = { ...w.s.village.stockpilePos };
    return true;
  },
  step(g, w) {
    const a = g.activity, c = w.s.rivals.find((x) => x.id === a.targetId);
    if (!c) return 'failed';
    if (a.stage === 0) { // take the gift from the store
      if (dist(g.pos, w.s.village.stockpilePos) > 1.2) {
        if (!a.path.length && !planPath(w, g, w.s.village.stockpilePos)) return 'failed';
        moveAlong(w, g);
        return 'running';
      }
      const f = giftFood(w, c);
      if (!f) return 'failed';
      const got = withdraw(w.s, f.type, f.qty), kept = addItem(g, { type: f.type, qty: got });
      if (kept < got) deposit(w.s, { type: f.type, qty: got - kept });
      if (!kept) return 'failed';
      a.stage = 1;
      a.progress = 0;
      a.path = [];
      const door = doors(w.s, c.side)[0];
      if (!door) return 'failed';
      a.target = door;
      return planPath(w, g, door) ? 'running' : 'failed';
    }
    // carry it to the edge toward their land
    if (w.s.tick - a.startedTick > G.maxHours * HOUR) return 'failed';
    if (a.target && dist(g.pos, a.target) > 1.5) {
      if (moveAlong(w, g) === 'arrived' && dist(g.pos, a.target) > 1.5 && !planPath(w, g, a.target)) return 'failed';
      return 'running';
    }
    let value = 0, food = 0;
    for (const st of [...g.inventory]) {
      if (!isFood(st.type)) continue;
      const n = removeItems(g, st.type, st.qty);
      value += goodsValue(w, null, { item: { type: st.type, qty: n } });
      food += (itemDef(st.type).nutrition ?? 0) * n;
      w.emit({ type: 'clan_gift', goblinId: g.id, clanId: c.id, gave: { type: st.type, qty: n }, at: { ...g.pos } });
    }
    if (!food) return 'failed';
    const hungry = c.store < c.pop * CFG.clans.hungryDays;
    c.store += food / CFG.goblin.decayPerDay.hunger;
    c.lastGift = w.s.tick;
    shiftRelation(w, c, clamp(value * G.perValue * (hungry ? G.hungryMul : 1), G.min, G.max), 'gift');
    w.emit({ type: 'emote', goblinId: g.id, emote: 'heart' });
    return 'done';
  },
};

export const Defect: UtilityAction = {
  id: 'defect', tags: ['rest'], minStage: 'adult', interruptible: false,
  isAvailable: (g, w) => !!leavingFor(w, g) && !g.heldByGod && !g.airborne,
  score: () => 0.95,
  start(g, w) {
    const c = leavingFor(w, g), door = c ? doors(w.s, c.side)[0] : undefined;
    if (!door) return false;
    g.activity.target = door;
    return planPath(w, g, door);
  },
  step(g, w) {
    const c = leavingFor(w, g), to = g.activity.target;
    if (!c || !to) return 'failed';
    if (dist(g.pos, to) > 1.5) {
      if (moveAlong(w, g) === 'arrived' && dist(g.pos, to) > 1.5 && !planPath(w, g, to)) return 'failed';
      return 'running';
    }
    departGoblin(w, g, c, isExiled(g, w) ? 'defected' : 'married'); // P10.4: or off to marry into an allied clan
    return 'done';
  },
};
