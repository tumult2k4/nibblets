/**
 * Trade (§12.5, P10.2). `TradeWithTrader`: a grown goblin strikes one of a visiting trader's offers for the village:
 * it fetches the price from the store (only what the village can spare), carries it to the trader, takes the goods
 * (a stack of things, a trinket, a recipe it learns on the spot) and brings things back to the store; the clan warms
 * to the village. `Trade`: a goblin swaps with a goblin it knows: a hungry one with no food gives a trinket for food,
 * a hoarder gives food for a trinket, at a price the other reckons fair (the generous let it slide). `GreetVisitor`: a
 * sociable goblin goes to say hello to a visitor; each greeting warms its clan a little.
 */
import { CFG } from '../../config';
import { clamp, dist, q4 } from '../../../shared/math';
import { allocId } from '../../../shared/ids';
import type { ItemStack, TradeGood } from '../../../shared/types';
import type { Goblin, Trinket } from '../../state';
import type { World } from '../../world';
import type { UtilityAction } from '../action';
import { faceToward, moveAlong, planPath } from '../../steering';
import { needUrgency } from '../../goblin/needs';
import { addMood } from '../../goblin/mood';
import { addSocial, adjustOpinion, opinionOf, relationOf } from '../../goblin/social';
import { addItem, removeItems } from '../../inventory';
import { isFood, isGear, itemDef } from '../../items';
import { deposit, withdraw } from '../../stockpile';
import { spawnGroundItem } from '../../groundItems';
import { learn } from '../../knowledge';
import { TRINKET_KINDS, carried, itemValue, passTrinket, trinketValue } from '../../trinkets';
import { shiftRelation } from '../../clans';
import { canSpare, clanOf, goodsValue, visitorById, visitorsOf, type Offer, type Visitor } from '../../visitors';
import { reach } from './kindness';

const V = CFG.visitors, DAY = CFG.time.dayTicks, HOUR = DAY / 24;

const grown = (g: Goblin): boolean => g.lifeStage === 'adult' || g.lifeStage === 'elder';
const pressed = (g: Goblin): boolean => Math.max(needUrgency(g.needs.hunger), needUrgency(g.needs.thirst), needUrgency(g.needs.energy)) > 0.5;
const awake = (g: Goblin): boolean => !g.heldByGod && !g.airborne && g.activity.action !== 'sleep_home' && g.activity.action !== 'sleep_ground';
/** How much a goblin lets an unfair price slide: the sociable and the unhungry, 0–1. */
export const generosity = (g: Goblin): number => clamp(0.5 * g.personality.sociability + 0.5 * (1 - g.personality.gluttony), 0, 1);

/** Walk the path to `to` (planning it first); true on arrival, null if there is no way. */
function goTo(g: Goblin, w: World, to: { x: number; y: number }): boolean | null {
  const a = g.activity;
  if (dist(g.pos, to) <= 1.2) return true;
  if (!a.path.length && !planPath(w, g, to)) return null;
  return moveAlong(w, g) === 'arrived' ? dist(g.pos, to) <= 1.5 : false;
}

// ---------------------------------------------------------------- with a trader

/** The best open deal `g` could strike for the village: an offer nobody is on, a price the village can spare, goods
 * worth it to `g` (by its own reckoning, its generosity letting the clan's greed slide). */
export function bestDeal(g: Goblin, w: World): { v: Visitor; o: Offer; gain: number } | null {
  let best: { v: Visitor; o: Offer; gain: number } | null = null;
  for (const v of visitorsOf(w.s)) {
    if (v.kind !== 'trader' || v.phase !== 'staying' || w.s.tick > v.leaveAt - HOUR / 2) continue;
    for (const o of v.offers) {
      if (o.done || (o.claimedBy !== null && o.claimedBy !== g.id) || !canSpare(w.s, o.want)) continue;
      const get = goodsValue(w, g, o.give), pay = itemValue(g, w, o.want.type) * o.want.qty;
      const gain = (get * (1 + V.generous * generosity(g))) / Math.max(1, pay);
      if (get > 0 && gain >= 1 && (!best || gain > best.gain)) best = { v, o, gain };
    }
  }
  return best;
}

const myOffer = (g: Goblin, v: Visitor | undefined): Offer | undefined => v?.offers.find((o) => o.claimedBy === g.id && !o.done);

/** The goods change hands: the price to the clan (food fills its store), the goods to `g`. */
function strike(g: Goblin, w: World, v: Visitor, o: Offer): boolean {
  if (removeItems(g, o.want.type, o.want.qty) < o.want.qty) return false;
  const c = clanOf(w.s, v);
  if (c && isFood(o.want.type)) c.store += ((itemDef(o.want.type).nutrition ?? 0) * o.want.qty) / CFG.goblin.decayPerDay.hunger;
  const x = o.give;
  let got: TradeGood = {};
  if (x.item) {
    got = { ...x.item };
    const kept = addItem(g, { ...x.item });
    if (kept < x.item.qty) spawnGroundItem(w, { type: x.item.type, qty: x.item.qty - kept }, { ...g.pos });
  } else if (x.trinket) {
    const kinds = TRINKET_KINDS[x.trinket], t: Trinket = {
      id: allocId(w.s), kind: kinds[w.rng.int(0, kinds.length - 1)]!, rarity: x.trinket, hue: q4(w.rng.range(0, 360)), foundBy: g.id, foundTick: w.s.tick, history: [g.id],
    };
    w.s.trinkets.push(t);
    g.trinkets.push(t.id);
    got = { trinket: t.kind };
  } else if (x.recipe) { learn(w, g, x.recipe, 'trade'); got = { recipe: x.recipe }; }
  o.done = true;
  o.claimedBy = null;
  v.traded++;
  if (c) shiftRelation(w, c, V.trade, 'trade');
  addSocial(g, 10);
  w.emit({ type: 'traded', goblinId: g.id, visitorId: v.id, clanId: v.clanId, gave: { ...o.want }, got, at: { ...g.pos } });
  w.emit({ type: 'emote', goblinId: g.id, emote: 'heart' });
  return true;
}

export const TradeWithTrader: UtilityAction = {
  id: 'trade_visitor', tags: ['social', 'work'], minStage: 'adult', interruptible: (g) => g.activity.stage !== 1,
  isAvailable: (g, w) => grown(g) && !pressed(g) && !!w.s.visitors?.length && !!bestDeal(g, w),
  score: (g, w) => V.score + 0.1 * clamp((bestDeal(g, w)?.gain ?? 1) - 1, 0, 1),
  start(g, w) {
    const d = bestDeal(g, w);
    if (!d) return false;
    d.o.claimedBy = g.id;
    g.activity.targetId = d.v.id;
    g.activity.target = { ...w.s.village.stockpilePos };
    return true;
  },
  step(g, w) {
    const a = g.activity, v = visitorById(w.s, a.targetId), o = myOffer(g, v);
    if (a.stage === 0) { // fetch the price from the store
      if (!v || !o || v.phase === 'going') return 'failed';
      const r = goTo(g, w, w.s.village.stockpilePos);
      if (r === null) return 'failed';
      if (!r) return 'running';
      if (!canSpare(w.s, o.want)) return 'failed';
      const got = withdraw(w.s, o.want.type, o.want.qty), kept = addItem(g, { type: o.want.type, qty: got });
      if (kept < got) deposit(w.s, { type: o.want.type, qty: got - kept });
      if (kept < o.want.qty) { if (kept) { removeItems(g, o.want.type, kept); deposit(w.s, { type: o.want.type, qty: kept }); } return 'failed'; }
      a.stage = 1;
      a.path = [];
      return 'running';
    }
    if (a.stage === 1) { // carry it to the trader and strike the deal
      if (!v || !o || v.phase === 'going') return 'failed';
      if (dist(g.pos, v.pos) > 1.3) {
        if (!a.path.length || dist(a.target ?? v.pos, v.pos) > 1.5) { a.target = { ...v.pos }; if (!planPath(w, g, v.pos)) return 'failed'; }
        moveAlong(w, g);
        return w.s.tick - a.startedTick > 3 * HOUR ? 'failed' : 'running';
      }
      g.velocity = { x: 0, y: 0 };
      faceToward(g, v.pos);
      const goods = o.give.item;
      if (!strike(g, w, v, o)) return 'failed';
      if (!goods) return 'done';
      a.stage = 2;
      a.path = [];
      return 'running';
    }
    // bring the goods home to the store
    const r = goTo(g, w, w.s.village.stockpilePos);
    if (r === null) return 'done';
    if (!r) return 'running';
    for (const st of [...g.inventory]) if (!isGear(st.type)) { const n = removeItems(g, st.type, st.qty); if (n) deposit(w.s, { type: st.type, qty: n }); }
    return 'done';
  },
};

// ---------------------------------------------------------------- goblin with goblin

interface Swap { o: Goblin; give: { trinket: Trinket } | { item: ItemStack }; get: { trinket: Trinket } | { item: ItemStack } }

const foodIn = (g: Goblin): ItemStack | undefined => g.inventory.filter((st) => isFood(st.type) && st.type !== 'apple_core' && st.type !== 'redcap' && st.qty > 0)
  .sort((a, b) => b.qty - a.qty || (a.type < b.type ? -1 : 1))[0];
const traded = (g: Goblin, tick: number): boolean => g.mood.modifiers.some((m) => m.id === 'traded' && m.expiresTick > tick);
const knows = (g: Goblin, o: Goblin): boolean => !!relationOf(g, o.id) && opinionOf(g, o.id) >= 0 && opinionOf(o, g.id) >= 0;

/** A fair swap for `g`, if a goblin it knows nearby has what it wants: food for its trinket when it is hungry and has
 * none, a trinket for its food when it is a hoarder. The other must reckon it fair (its generosity helps). */
export function swapFor(g: Goblin, w: World): Swap | null {
  if (traded(g, w.s.tick)) return null;
  const hungry = needUrgency(g.needs.hunger) > 0.3 && !foodIn(g), mine = carried(g, w)[0];
  const hoarder = g.traits.includes('hoarder') && foodIn(g);
  if (!(hungry && mine) && !hoarder) return null;
  for (const o of w.goblinHash.query(g.pos, V.swapRange)) {
    if (o.id === g.id || !grown(o) || !awake(o) || traded(o, w.s.tick) || !knows(g, o) || o.activity.action === 'flee') continue;
    const slack = 1 + V.generous * generosity(o);
    if (hungry && mine) {
      const f = foodIn(o);
      if (!f || f.qty < 2) continue;
      const each = itemValue(o, w, f.type), qty = Math.min(f.qty - 1, Math.floor((trinketValue(o, mine) * slack) / Math.max(0.5, each)));
      if (qty >= 1) return { o, give: { trinket: mine }, get: { item: { type: f.type, qty } } };
    } else if (hoarder) {
      const t = carried(o, w)[0], f = foodIn(g)!;
      if (!t) continue;
      const qty = Math.ceil(trinketValue(o, t) / (slack * Math.max(0.5, itemValue(o, w, f.type))));
      if (qty <= f.qty && trinketValue(g, t) >= itemValue(g, w, f.type) * qty) return { o, give: { item: { type: f.type, qty } }, get: { trinket: t } };
    }
  }
  return null;
}

const goodsOf = (x: Swap['give']): ItemStack | { trinket: string } => ('trinket' in x ? { trinket: x.trinket.kind } : { ...x.item });

function hand(w: World, from: Goblin, to: Goblin, x: Swap['give']): boolean {
  if ('trinket' in x) { passTrinket(w, x.trinket, from, to); return true; }
  if (removeItems(from, x.item.type, x.item.qty) < x.item.qty) return false;
  const kept = addItem(to, { ...x.item });
  if (kept < x.item.qty) spawnGroundItem(w, { type: x.item.type, qty: x.item.qty - kept }, { ...to.pos });
  return true;
}

export const Trade: UtilityAction = {
  id: 'trade', tags: ['social'], minStage: 'adult', interruptible: (g) => g.activity.stage === 0,
  isAvailable: (g, w) => grown(g) && !!swapFor(g, w),
  score: (g) => V.score + 0.3 * needUrgency(g.needs.hunger),
  start(g, w) {
    const sw = swapFor(g, w);
    if (!sw) return false;
    g.activity.targetId = sw.o.id;
    g.activity.target = { ...sw.o.pos };
    return dist(g.pos, sw.o.pos) <= 1.1 || planPath(w, g, sw.o.pos);
  },
  step(g, w) {
    const a = g.activity, o = a.targetId !== null ? w.goblin(a.targetId) : undefined;
    if (!o || !awake(o)) return 'failed';
    const r = reach(g, o, w);
    if (r === null) return 'failed';
    if (!r) return 'running';
    const sw = swapFor(g, w);
    if (!sw || sw.o !== o) return 'failed';
    g.velocity = { x: 0, y: 0 };
    faceToward(g, o.pos);
    if (!hand(w, g, o, sw.give)) return 'failed';
    if (!hand(w, o, g, sw.get)) { hand(w, o, g, sw.give); return 'failed'; }
    for (const [x, y] of [[g, o], [o, g]] as const) {
      adjustOpinion(w, x, y, 4);
      addSocial(x, 8);
      addMood(w, x, 'traded', 2, DAY * V.swapRestDays);
    }
    w.emit({ type: 'traded', goblinId: g.id, withId: o.id, gave: goodsOf(sw.give), got: goodsOf(sw.get), at: { ...g.pos } });
    return 'done';
  },
};

// ---------------------------------------------------------------- greeting

/** A visitor at the village `g` has not greeted yet, while its clan still welcomes greetings this visit. */
export function visitorToGreet(g: Goblin, w: World): Visitor | null {
  let best: Visitor | null = null, bd = Infinity;
  for (const v of visitorsOf(w.s)) {
    if (v.phase === 'going' || v.greeted.includes(g.id) || v.greeted.length * V.scout.greet >= V.scout.greetMax) continue;
    const d = dist(g.pos, v.pos);
    if (d < bd && d <= 30) { bd = d; best = v; }
  }
  return best;
}

export const GreetVisitor: UtilityAction = {
  id: 'greet_visitor', tags: ['social'], minStage: 'youngling', interruptible: true,
  isAvailable: (g, w) => !!w.s.visitors?.length && awake(g) && !pressed(g) && g.personality.sociability >= 0.35 && !!visitorToGreet(g, w),
  score: (g) => V.greetScore * (0.6 + 0.8 * g.personality.sociability),
  start(g, w) {
    const v = visitorToGreet(g, w);
    if (!v) return false;
    g.activity.targetId = v.id;
    g.activity.target = { ...v.pos };
    return planPath(w, g, v.pos);
  },
  step(g, w) {
    const a = g.activity, v = visitorById(w.s, a.targetId);
    if (!v || v.phase === 'going') return 'failed';
    if (a.stage === 0) {
      if (dist(g.pos, v.pos) > 1.4) {
        if (!a.path.length || dist(a.target ?? v.pos, v.pos) > 1.5) { a.target = { ...v.pos }; if (!planPath(w, g, v.pos)) return 'failed'; }
        moveAlong(w, g);
        return w.s.tick - a.startedTick > HOUR ? 'failed' : 'running';
      }
      a.stage = 1;
      a.progress = 0;
      w.emit({ type: 'emote', goblinId: g.id, emote: 'exclaim' });
    }
    g.velocity = { x: 0, y: 0 };
    faceToward(g, v.pos);
    if (++a.progress < 60) return 'running';
    if (!v.greeted.includes(g.id)) {
      const c = clanOf(w.s, v), warm = v.greeted.length * V.scout.greet < V.scout.greetMax; // the first few warm the clan
      v.greeted.push(g.id);
      if (c && warm) shiftRelation(w, c, V.scout.greet, 'greet');
    }
    addSocial(g, 12);
    return 'done';
  },
};
