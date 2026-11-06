/**
 * Visitors from the rival clans (§16, §12.5, P10.2): goblins of another clan who walk onto the map, drawn from their
 * clan's own gene pool (so they look like their clan, not like the village). A scout comes at first contact and
 * watches the village a while; a trader comes every few days while its clan is on good terms, in the morning, with
 * three offers (things the village lacks: flint, clay, a trinket, a recipe it does not know or has lost), each for
 * something the village can spare, and leaves at dusk. Visitors come in at the edge of the land toward their clan,
 * stand and stroll at the village's edge, and go home the same way. Goblins greet them and trade with them
 * (`ai/actions/trade.ts`); deals and greetings warm the clan (`shiftRelation`).
 */
import { CFG } from './config';
import { allocId } from '../shared/ids';
import { dist, q4 } from '../shared/math';
import type { ID, ItemStack, ItemType, Rarity, RecipeId, Vec2 } from '../shared/types';
import type { Goblin, WorldState } from './state';
import type { World } from './world';
import { clockAt } from './time';
import { isWalkable } from './grid';
import { meiosis, type Genome } from './goblin/genetics/genome';
import { makeName } from './goblin/names';
import { isFood, itemDef } from './items';
import { stockCount } from './stockpile';
import { foodStores } from './spoilage';
import { DISCOVERABLE, knowers } from './knowledge';
import { shiftRelation, type RivalClan, type Side } from './clans';

const V = CFG.visitors, DAY = CFG.time.dayTicks, HOUR = DAY / 24;

export type VisitorKind = 'scout' | 'trader';
/** What a trader gives: a stack of things, a trinket of some rarity, or a recipe it teaches. */
export interface Goods { item?: ItemStack; trinket?: Rarity; recipe?: RecipeId }
/** One of a trader's offers: what it gives, what it wants for it, whether it is done, who is on the way to strike it. */
export interface Offer { give: Goods; want: ItemStack; done: boolean; claimedBy: ID | null }
export interface Visitor {
  id: ID; clanId: ID; kind: VisitorKind; name: string; genome: Genome;
  pos: Vec2; facing: number; velocity: Vec2; path: Vec2[];
  /** walking in, at the village, walking home */
  phase: 'coming' | 'staying' | 'going';
  /** where it came in (and leaves), where it stands at the village, when it leaves, when it strolls next */
  door: Vec2; spot: Vec2; leaveAt: number; nextStroll: number;
  offers: Offer[]; greeted: ID[]; traded: number;
}

/** Things a trader may bring, a stack each. */
const WARES: [ItemType, number][] = [['flint', 3], ['clay', 4], ['fiber', 6], ['rope', 2], ['stone', 5], ['dried_apple', 6]];
const DIR: Record<Side, [number, number]> = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] };
const RECIPE_VALUE = 18;

export const visitorsOf = (s: WorldState): Visitor[] => (s.visitors ??= []);
export const visitorById = (s: WorldState, id: ID | null | undefined): Visitor | undefined => (id === null || id === undefined ? undefined : s.visitors?.find((v) => v.id === id));
export const clanOf = (s: WorldState, v: Visitor): RivalClan | undefined => s.rivals.find((c) => c.id === v.clanId);

/** What `g` reckons goods are worth: things by their value, more when the village has few; a recipe nobody knows; a trinket. */
export function goodsValue(w: World, g: Goblin | null, x: Goods): number {
  if (x.recipe) return knowers(w.s, x.recipe) ? 0 : RECIPE_VALUE;
  if (x.trinket) return CFG.trinkets.value[x.trinket] * (g?.traits.includes('hoarder') ? CFG.trinkets.hoarderMul : 1);
  if (!x.item) return 0;
  const have = stockCount(w.s, x.item.type), scarce = have < 3 ? 1.5 : have > 20 ? 0.5 : 1;
  return itemDef(x.item.type).value * x.item.qty * scarce;
}

/** Days of food the village keeps back before it trades any away: `spareFoodDays`, and from autumn on all it needs
 * to see the winter through. */
export function foodKept(s: WorldState): number {
  const c = clockAt(s.tick), left = CFG.time.daysPerSeason - c.seasonDay;
  return V.spareFoodDays + (c.season === 'autumn' ? left + CFG.time.daysPerSeason : c.season === 'winter' ? left : 0);
}

/** Can the village spare this from its store? Food beyond what it keeps back (`foodKept`), other things beyond `keep`. */
export function canSpare(s: WorldState, x: ItemStack, keepDays = foodKept(s)): boolean {
  const have = stockCount(s, x.type);
  if (have < x.qty) return false;
  if (!isFood(x.type)) return have - x.qty >= V.keep;
  const f = foodStores(s), eat = Math.max(1, s.goblins.length) * CFG.goblin.decayPerDay.hunger;
  return (f.food - (itemDef(x.type).nutrition ?? 0) * x.qty) / eat >= keepDays;
}

/** The land's edge toward `side`: walkable tiles that lie farthest that way, the ones nearest the middle line first. */
export function doors(s: WorldState, side: Side): Vec2[] {
  const [dx, dy] = DIR[side], c = s.village.center, out: { p: Vec2; far: number; off: number }[] = [];
  for (let y = 1; y < s.size.h - 1; y++) for (let x = 1; x < s.size.w - 1; x++) {
    if (!isWalkable(s, x, y)) continue;
    out.push({ p: { x: x + 0.5, y: y + 0.5 }, far: (x - c.x) * dx + (y - c.y) * dy, off: Math.abs((x - c.x) * dy) + Math.abs((y - c.y) * dx) });
  }
  const top = Math.max(...out.map((o) => o.far));
  return out.filter((o) => o.far >= top - 3).sort((a, b) => a.off - b.off || a.p.y - b.p.y || a.p.x - b.p.x).slice(0, 8).map((o) => o.p);
}

/** A walkable spot at the village's edge toward `side`. */
function standSpot(w: World, side: Side): Vec2 | null {
  const [dx, dy] = DIR[side], c = w.s.village.center;
  for (let k = 0; k < 24; k++) {
    const r = w.rng.range(V.standFrom, V.standTo), a = w.rng.range(-0.7, 0.7);
    const x = c.x + (dx * Math.cos(a) - dy * Math.sin(a)) * r, y = c.y + (dy * Math.cos(a) + dx * Math.sin(a)) * r;
    if (isWalkable(w.s, Math.floor(x), Math.floor(y))) return { x: q4(Math.floor(x) + 0.5), y: q4(Math.floor(y) + 0.5) };
  }
  return null;
}

/** A trader's three offers: maybe a recipe the village lacks, maybe a trinket, the rest wares; each for something the
 * village can spare, asked at the clan's greed. */
function offersFor(w: World, c: RivalClan): Offer[] {
  const s = w.s, gives: Goods[] = [];
  const missing = DISCOVERABLE.filter((id) => !knowers(s, id));
  if (missing.length && w.rng.chance(V.recipeChance)) gives.push({ recipe: w.rng.pick(missing) });
  if (w.rng.chance(V.trinketChance + (c.traits.includes('crafty') ? 0.2 : 0))) gives.push({ trinket: w.rng.chance(0.25) ? 'rare' : 'uncommon' });
  for (const [type, qty] of w.rng.shuffle([...WARES])) {
    if (gives.length >= V.trader.offers) break;
    gives.push({ item: { type, qty } });
  }
  const spare = s.village.stockpile.filter((x) => x.qty > 0 && itemDef(x.type).value >= 2 && x.type !== 'apple_core' && x.type !== 'redcap').map((x) => x.type); // not ash or leaves
  return gives.map((give) => {
    const ask = spare.filter((t) => t !== give.item?.type), type: ItemType = ask.length ? w.rng.pick(ask) : 'apple';
    const worth = goodsValue(w, null, give.recipe ? { trinket: 'uncommon' } : give) * w.rng.range(V.greed[0], V.greed[1]);
    return { give, want: { type, qty: Math.max(1, Math.round(worth / Math.max(1, itemDef(type).value))) }, done: false, claimedBy: null };
  });
}

/** A goblin of clan `c` walks in: a scout at first contact, a trader with its offers. Null if there is no way in. */
export function spawnVisitor(w: World, c: RivalClan, kind: VisitorKind): Visitor | null {
  const s = w.s, spot = standSpot(w, c.side);
  if (!spot) return null;
  let door: Vec2 | null = null, path: Vec2[] | null = null;
  for (const d of doors(s, c.side)) if ((path = w.path(d, spot))) { door = d; break; }
  if (!door || !path) return null;
  const taken = new Set([...s.goblins.map((g) => g.name), ...visitorsOf(s).map((v) => v.name)]);
  const hour = clockAt(s.tick).hour, leave = s.tick + Math.max(HOUR, (V.trader.leaveHour - hour) * HOUR);
  const v: Visitor = {
    id: allocId(s), clanId: c.id, kind, name: makeName(w.rng, taken), genome: meiosis(w.rng.pick(c.pool), w.rng.pick(c.pool), w.rng),
    pos: { ...door }, facing: 0, velocity: { x: 0, y: 0 }, path, phase: 'coming', door, spot,
    leaveAt: kind === 'scout' ? s.tick + w.rng.int(V.scout.stay[0], V.scout.stay[1]) + path.length * 6 : leave,
    nextStroll: 0, offers: kind === 'trader' ? offersFor(w, c) : [], greeted: [], traded: 0,
  };
  visitorsOf(s).push(v);
  w.emit({ type: 'visitor_arrived', visitorId: v.id, clanId: c.id, kind, at: { ...spot } }); // where the village will see it
  return v;
}

/** Walk along the path; true on arrival. */
function walk(v: Visitor): boolean {
  const wp = v.path[0];
  if (!wp) { v.velocity = { x: 0, y: 0 }; return true; }
  const speed = V.speed / CFG.tickHz, dx = wp.x - v.pos.x, dy = wp.y - v.pos.y, d = Math.hypot(dx, dy);
  if (d <= Math.max(speed, 0.05)) {
    v.pos = { x: q4(wp.x), y: q4(wp.y) };
    v.path.shift();
    return v.path.length === 0;
  }
  v.pos = { x: q4(v.pos.x + (dx / d) * speed), y: q4(v.pos.y + (dy / d) * speed) };
  v.velocity = { x: q4((dx / d) * speed), y: q4((dy / d) * speed) };
  v.facing = q4(Math.atan2(dy, dx));
  return false;
}

/** Scouts at first contact, traders on their days: called by the clans' update for each clan. */
export function clanVisits(w: World, c: RivalClan, met: boolean): void {
  const s = w.s, here = visitorsOf(s).some((v) => v.clanId === c.id);
  if (met) { spawnVisitor(w, c, 'scout'); c.nextTrader = s.tick + Math.round(w.rng.range(V.trader.every[0], V.trader.every[1]) * DAY); return; }
  if (c.contact === null || here || c.nextTrader === undefined || s.tick < c.nextTrader) return;
  const hour = clockAt(s.tick).hour;
  if (hour < V.trader.arriveHour || hour >= 12) return;
  const every = w.rng.range(V.trader.every[0], V.trader.every[1]) * (c.traits.includes('traders') ? V.trader.tradersMul : 1);
  c.nextTrader = s.tick + Math.round(every * DAY);
  if (c.relation >= V.trader.minRelation) spawnVisitor(w, c, 'trader');
}

/** Is someone still on the way to strike this offer? (A claim lapses when its goblin gave up.) */
const claimed = (w: World, v: Visitor, o: Offer): boolean => {
  const g = o.claimedBy !== null ? w.goblin(o.claimedBy) : undefined;
  return !!g && g.activity.action === 'trade_visitor' && g.activity.targetId === v.id;
};

/** Every tick: visitors walk in, stand and stroll at the village, and walk home when their time is up. */
export function updateVisitors(w: World): void {
  const s = w.s, vs = s.visitors;
  if (!vs?.length) return;
  for (const v of [...vs]) {
    for (const o of v.offers) if (o.claimedBy !== null && !o.done && !claimed(w, v, o)) o.claimedBy = null;
    if (v.phase === 'coming' && walk(v)) { v.phase = 'staying'; v.nextStroll = s.tick + V.strollEvery; }
    else if (v.phase === 'staying') {
      const busy = v.offers.some((o) => o.claimedBy !== null && !o.done && s.tick < v.leaveAt + HOUR);
      if (s.tick >= v.leaveAt && !busy) {
        v.phase = 'going';
        v.path = w.path(v.pos, v.door) ?? [];
      } else if (v.path.length) walk(v);
      else if (s.tick >= v.nextStroll && !busy) {
        v.nextStroll = s.tick + V.strollEvery;
        const a = w.rng.range(0, Math.PI * 2), r = w.rng.range(0, V.stroll), p = { x: v.spot.x + Math.cos(a) * r, y: v.spot.y + Math.sin(a) * r };
        if (isWalkable(s, Math.floor(p.x), Math.floor(p.y))) v.path = w.path(v.pos, p) ?? [];
      }
    } else if (v.phase === 'going' && (walk(v) || dist(v.pos, v.door) < 0.6)) {
      vs.splice(vs.indexOf(v), 1);
      const c = clanOf(s, v);
      if (c && v.kind === 'trader' && v.traded > 0) shiftRelation(w, c, V.visit, 'visit');
      w.emit({ type: 'visitor_left', visitorId: v.id, clanId: v.clanId, kind: v.kind, at: { ...v.pos } });
    }
  }
}
