import { CFG } from '../config';
import type { ActionId, Goblin } from '../state';
import type { World } from '../world';
import type { UtilityAction } from './action';
import { stageAtLeast } from './action';
import { personalityWeight } from '../goblin/personality';
import { traitMul } from '../goblin/traits';
import { Idle } from './actions/idle';
import { Wander } from './actions/wander';
import { Eat, EatCore } from './actions/eat';
import { PlantSeed } from './actions/plantSeed';
import { WaterPlant } from './actions/waterPlant';
import { Chop } from './actions/chop';
import { Build, DeliverMaterial } from './actions/build';
import { ClaimHome, SleepHome } from './actions/home';
import { GatherForGoal } from './actions/gatherForGoal';
import { SeekShelter, WarmUp, stormCaught } from './actions/shelter';
import { Forage } from './actions/forage';
import { Mine } from './actions/mine';
import { Craft } from './actions/craft';
import { Equip } from './actions/equip';
import { PlanBuilding, TendFire } from './actions/village';
import { Attack, DefendVillage } from './actions/fight';
import { Flee, Guard, dangerCaught } from './actions/flee';
import { RepairBuilding } from './actions/repair';
import { FollowWisp } from './actions/followWisp';
import { Scatter } from './actions/scatter';
import { Chat } from './actions/chat';
import { Comfort, Gift } from './actions/kindness';
import { findChopTarget } from './actions/chop';
import { planFor } from './planner';
import { Explore } from './actions/explore';
import { StoreItem, TakeItem } from './actions/stockpile';
import { HarvestFruit } from './actions/harvestFruit';
import { PickUp } from './actions/pickUp';
import { Drop } from './actions/drop';
import { Drink } from './actions/drink';
import { SleepGround } from './actions/sleepGround';
import { LookUp, Struggle } from './actions/divine';
import type { Vec2 } from '../../shared/types';
import { skillFocus } from '../goblin/skills';
import { wishDone, wishScore } from '../god/wishes';
import { Court, IncubateEgg, LayEgg } from './actions/courtship';
import { FeedChild, FollowParent } from './actions/parenting';
import { Learn, Play } from './actions/childhood';
import { Teach } from './actions/teach';
import { CutGrass, PickFlowers } from './actions/gather';
import { Process } from './actions/process';
import { RestSick, TendSick } from './actions/care';
import { EscapeFire, ExtinguishFire, fireCaught } from './actions/fireFight';
import { CullBlight } from './actions/cullBlight';
import { BuryDead, Mourn, setDown } from './actions/burial';
import { Hunt } from './actions/hunt';
import { Fish } from './actions/fish';
import { CookStew } from './actions/stew';
import { SpreadCompost, TendCompost } from './actions/compost';
import { PavePath } from './actions/pave';
import { HaulToStockpile } from './actions/haul';
import { Binge, Sulk, WanderOff } from './actions/moodBreak';
import { Decorate, HuntTrinket } from './actions/trinkets';
import { demandMul } from '../commons';
import { DigClay } from './actions/digClay';
import { Prank } from './actions/prank';
import { Apologize, Steal } from './actions/steal';
import { Brawl } from './actions/brawl';
import { Exile, Judge } from './actions/judge';
import { EXILE_OK, policyWorkMul } from '../leadership';
import { Dance, JoinFestival, PlayMusic } from './actions/festival';
import { Pray } from './actions/pray';
import { LeadPrayer, MakeOffering, ShakeFist } from './actions/devotions';
import { festivalWorkMul } from '../festivals';
import { ReadBook, WriteBook } from './actions/books';
import { GreetVisitor, Trade, TradeWithTrader } from './actions/trade';
import { Defect, SendGift } from './actions/envoy';
import { PossessedWalk } from './actions/possessed';
import { claimsChanged } from './claims';
import { deciding } from './memo';
import { pathWork } from '../pathfinding';

export const ACTIONS: Record<ActionId, UtilityAction> = {
  idle: Idle, wander: Wander, eat: Eat, harvest_fruit: HarvestFruit, pick_up: PickUp, drop: Drop,
  drink: Drink, sleep_ground: SleepGround, look_up: LookUp, struggle: Struggle,
  eat_core: EatCore, plant_seed: PlantSeed, water_plant: WaterPlant,
  chop: Chop, store_item: StoreItem, take_item: TakeItem, explore: Explore, deliver_material: DeliverMaterial, build: Build,
  claim_home: ClaimHome, sleep_home: SleepHome, gather_for_goal: GatherForGoal,
  seek_shelter: SeekShelter, warm_up: WarmUp, forage: Forage, mine: Mine,
  craft: Craft, equip: Equip, plan_building: PlanBuilding, tend_fire: TendFire,
  flee: Flee, attack: Attack, defend_village: DefendVillage, guard: Guard, repair_building: RepairBuilding,
  follow_wisp: FollowWisp, scatter: Scatter, chat: Chat, comfort: Comfort, gift: Gift,
  court: Court, lay_egg: LayEgg, incubate_egg: IncubateEgg, feed_child: FeedChild, follow_parent: FollowParent,
  play: Play, learn: Learn, teach: Teach, cut_grass: CutGrass, pick_flowers: PickFlowers, process: Process,
  rest_sick: RestSick, tend_sick: TendSick, extinguish_fire: ExtinguishFire, escape_fire: EscapeFire,
  cull_blight: CullBlight, bury_dead: BuryDead, mourn: Mourn, hunt: Hunt, fish: Fish, dig_clay: DigClay, cook_stew: CookStew,
  tend_compost: TendCompost, spread_compost: SpreadCompost, pave_path: PavePath,
  haul_to_stockpile: HaulToStockpile, sulk: Sulk, binge: Binge, wander_off: WanderOff,
  hunt_trinket: HuntTrinket, decorate: Decorate, prank: Prank, steal: Steal, apologize: Apologize, brawl: Brawl,
  judge: Judge, exile: Exile, join_festival: JoinFestival, play_music: PlayMusic, dance: Dance, pray: Pray, write_book: WriteBook, read_book: ReadBook,
  make_offering: MakeOffering, lead_prayer: LeadPrayer, shake_fist: ShakeFist,
  trade: Trade, trade_visitor: TradeWithTrader, greet_visitor: GreetVisitor, send_gift: SendGift, defect: Defect, possessed_walk: PossessedWalk,
};
const CHOOSABLE = (Object.values(ACTIONS) as UtilityAction[]).filter((a) => !a.forced);

export interface ScoreRow { id: ActionId; base: number; personality: number; mood: number; skill: number; hysteresis: number; focus: number; final: number }

function moodMul(g: Goblin, a: UtilityAction): number {
  // §7.5: mood multiplies work and social action scores (sulky goblins keep to themselves)
  const k = (g.mood.value + 100) / 200;
  return a.tags.includes('work') ? 0.9 + 0.2 * k : a.tags.includes('social') ? 0.7 + 0.6 * k : 1;
}

/** §4.4: elders work less and seek more company. */
function stageMul(g: Goblin, a: UtilityAction): number {
  if (g.lifeStage !== 'elder') return 1;
  return a.tags.includes('work') ? CFG.life.elderWork : a.tags.includes('social') ? CFG.life.elderSocial : 1;
}

/** P11.3: a decision's ±5 % noise, from the world, the tick, the goblin and the action, not from the world's stream,
 * so an action skipped because it could not win draws nothing and changes nothing. */
function noiseOf(w: World, g: Goblin, i: number): number {
  let h = Math.imul(w.s.tick ^ 0x5bd1e995, 0x9e3779b1) ^ Math.imul(g.id + 0x632be5ab, 0x85ebca77) ^ Math.imul(i + 1, 0xc2b2ae3d) ^ (w.s.genParams.seed | 0);
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
  return 0.95 + 0.1 * (((h ^ (h >>> 16)) >>> 0) / 4294967296);
}

/** May `g` choose `a` at all (stage, a mood break, exile)? Cheap, and asked before anything costly. */
function eligible(g: Goblin, w: World, a: UtilityAction): boolean {
  if (!stageAtLeast(g.lifeStage, a.minStage)) return false;
  // P8.1: no work, company or play on a break (finding itself food still counts)
  if (g.moodBreak && !a.tags.includes('food') && a.tags.some((t) => t === 'work' || t === 'social' || t === 'fun')) return false;
  return !((g.exiledUntil ?? 0) > w.s.tick && !EXILE_OK.has(a.id)); // P8.4: out there, it fends for itself
}

interface Muls { dm: number; pw: number; mm: number; sk: number; hy: number; fo: number; n: number }
/** Everything a base score is multiplied by (§7.3): demand, personality, mood, skill, hysteresis, focus, noise. */
function mulsOf(g: Goblin, w: World, a: UtilityAction, i: number, noise: boolean, planned: ActionId | null, work: number): Muls {
  return {
    dm: demandMul(g, w.s, a.id), // §12.4: the village's shortfalls pull the industrious to the work that meets them
    pw: personalityWeight(g.personality, a.id) * stageMul(g, a) * traitMul(g, a.id) * (a.tags.includes('work') ? (a.tags.includes('food') ? policyWorkMul(w) : work) : 1),
    mm: moodMul(g, a), sk: skillFocus(g, a.id),
    hy: g.activity.action === a.id && g.activity.status === 'running' ? CFG.goblin.hysteresis : 1,
    fo: planned === a.id ? CFG.planner.focus : 1, // §7.4 focus: the planner's chosen step gets ×1.5 and a floor
    n: noise ? noiseOf(w, g, i) : 1,
  };
}
/** The base before the multipliers: the planner's floor and the god's wishes (P8.9) applied. */
function lifted(g: Goblin, w: World, a: UtilityAction, m: Muls, base: number): number {
  return wishScore(g, w, a.id, m.fo > 1 ? Math.max(base, CFG.planner.floor) : base);
}

function rowFor(g: Goblin, w: World, a: UtilityAction, m: Muls): ScoreRow | null {
  if (!a.isAvailable(g, w)) return null;
  let base = lifted(g, w, a, m, a.score(g, w));
  if (base <= 0) return null;
  base *= m.dm;
  return { id: a.id, base, personality: m.pw, mood: m.mm, skill: m.sk, hysteresis: m.hy, focus: m.fo, final: base * m.pw * m.mm * m.sk * m.hy * m.fo * m.n };
}
const byScore = (x: ScoreRow, y: ScoreRow): number => y.final - x.final || (x.id < y.id ? -1 : 1);
/** P8.4: an industrious chief; P8.5: no work at a festival (food aside). */
const workMul = (w: World): number => policyWorkMul(w) * festivalWorkMul(w);

/** Score every available action (debug overlay uses `noise=false`). */
export function scoreActions(g: Goblin, w: World, noise = true, planned: ActionId | null = null): ScoreRow[] {
  const rows: ScoreRow[] = [], work = workMul(w);
  CHOOSABLE.forEach((a, i) => {
    const r = eligible(g, w, a) ? rowFor(g, w, a, mulsOf(g, w, a, i, noise, planned, work)) : null;
    if (r) rows.push(r);
  });
  return rows.sort(byScore);
}

/**
 * `scoreActions` in order, one row at a time (P11.3), without scoring what cannot be next: an action with a `cap` is
 * scored only once its capped final could beat the best row in hand, highest caps first. Same order, far fewer searches.
 */
export function rankActions(g: Goblin, w: World, planned: ActionId | null): () => ScoreRow | null {
  const ready: ScoreRow[] = [], later: { a: UtilityAction; m: Muls; ub: number }[] = [], work = workMul(w);
  CHOOSABLE.forEach((a, i) => {
    if (!eligible(g, w, a)) return;
    const m = mulsOf(g, w, a, i, true, planned, work);
    if (!a.cap) { const r = rowFor(g, w, a, m); if (r) ready.push(r); return; }
    const ub = lifted(g, w, a, m, a.cap(g, w));
    if (ub > 0) later.push({ a, m, ub: ub * m.dm * m.pw * m.mm * m.sk * m.hy * m.fo * m.n });
  });
  ready.sort(byScore);
  later.sort((x, y) => y.ub - x.ub || (x.a.id < y.a.id ? -1 : 1));
  let li = 0;
  return () => {
    for (; li < later.length && (!ready.length || later[li]!.ub >= ready[0]!.final); li++) {
      const r = rowFor(g, w, later[li]!.a, later[li]!.m);
      if (r) { ready.push(r); ready.sort(byScore); }
    }
    return ready.shift() ?? null;
  };
}
/** The best `k` of `scoreActions`, lazily (see `rankActions`). */
export function chooseActions(g: Goblin, w: World, planned: ActionId | null, k = 3): ScoreRow[] {
  const next = rankActions(g, w, planned), out: ScoreRow[] = [];
  for (let r = next(); r && out.length < k; r = out.length < k ? next() : null) out.push(r);
  return out;
}

function resetActivity(g: Goblin, w: World, id: ActionId): void {
  claimsChanged();
  g.activity = { action: id, status: 'running', startedTick: w.s.tick, targetId: null, target: null, path: [], progress: 0, stage: 0 };
}

/** Start an action; if it can't start, fall back to idle. */
export function startAction(g: Goblin, w: World, id: ActionId): boolean {
  releaseReservations(g, w);
  resetActivity(g, w, id);
  if (ACTIONS[id].start(g, w)) { claimsChanged(); return true; }
  resetActivity(g, w, 'idle');
  Idle.start(g, w);
  g.activity.status = 'running';
  return false;
}

/** Interrupt whatever the goblin does with a forced action (look_up, struggle). */
export function forceAction(g: Goblin, w: World, id: 'look_up' | 'struggle' | 'scatter', lookAt?: Vec2): void {
  startAction(g, w, id);
  if (lookAt) g.activity.target = { x: lookAt.x, y: lookAt.y };
}

function releaseReservations(g: Goblin, w: World): void {
  if (g.activity.action === 'bury_dead') setDown(w, g); // a body being carried is set down where the carrier stands
  if (g.activity.action === 'pick_up' && g.activity.targetId !== null) {
    const it = w.s.groundItems.find((x) => x.id === g.activity.targetId);
    if (it && it.reservedBy === g.id) it.reservedBy = null;
  }
}

const cursed = (g: Goblin, tick: number): boolean => g.mood.modifiers.some((m) => m.id === 'cursed' && m.expiresTick > tick);

/** P11.3: how often a goblin re-decides (a big village less often), and how many may decide in one tick. */
export function thinkPace(n: number): { iv: number; max: number; path: number; danger: number } {
  const G = CFG.goblin, B = G.thinkBudget, max = Math.max(B.min, Math.ceil(n * B.per));
  return { iv: Math.round(G.decisionIntervalTicks * Math.max(1, n / G.thinkPopRef)), max, path: B.pathPer * n, danger: max * B.danger };
}

/**
 * §6 step 12: staggered re-decision. P11.3: once a tick's budget is spent (decisions, or A* expansions at 30 a
 * goblin), the rest wait for the next tick, so a crowd waking at dawn spreads its choosing over a few ticks. Danger
 * has a budget of its own, three times as big: a crowd that sees Gnashers all at once reacts over a few tenths of a
 * second instead of in one long tick.
 */
export function think(w: World): void {
  const s = w.s;
  const { iv, max, path, danger: dmax } = thinkPace(s.goblins.length);
  const work0 = pathWork();
  let made = 0, scared = 0;
  for (const g of s.goblins) {
    if (g.heldByGod || g.airborne || s.god.possessedId === g.id) continue; // P11.1: a possessed goblin does as the player says
    const cur = ACTIONS[g.activity.action];
    const finished = g.activity.status !== 'running';
    // §7.2 interrupts: a storm caught outdoors re-decides at once; danger in sight cuts any unforced action
    // (both rate-limited to every 10 ticks)
    const ready = s.tick - g.lastDecisionTick >= 10;
    const danger = ready && !cur.forced && (dangerCaught(g, w) || fireCaught(g, w));
    const due = s.tick % iv === g.id % iv || danger || (ready && stormCaught(g, w));
    const canCut = danger || (typeof cur.interruptible === 'function' ? cur.interruptible(g) : cur.interruptible);
    if (!finished && (!due || !canCut)) continue;
    if (danger ? scared++ >= dmax : made >= max || pathWork() - work0 >= path) continue;
    if (!danger) made++;
    deciding(w, g); // P11.3: its searches are made once for this decision
    const next = rankActions(g, w, planFor(g, w, (gg, ww) => !!findChopTarget(gg, ww)));
    const first = next();
    g.lastDecisionTick = s.tick;
    const best = first?.id ?? 'idle';
    if (!finished && best === g.activity.action) continue;
    // a cursed goblin (P4.8) fumbles one new task in four: it stands there flustered instead
    if (best !== 'idle' && !ACTIONS[best].tags.includes('danger') && cursed(g, s.tick) && w.rng.chance(CFG.powers.curseFail)) {
      startAction(g, w, 'idle');
      w.emit({ type: 'emote', goblinId: g.id, emote: 'sweat' });
      continue;
    }
    // a choice that can't start (no site, no way there) falls through to the next best rather than idling (the
    // next best is found only then, P11.3)
    let started = false;
    for (let r = first, i = 0; r && i < 3; r = ++i < 3 ? next() : null) {
      if (r.id === 'idle') break;
      if ((started = startAction(g, w, r.id))) break;
    }
    if (!started) startAction(g, w, 'idle');
  }
  deciding(w, null);
}

/** §6 step 13: step current actions. */
export function act(w: World): void {
  for (const g of w.s.goblins) {
    if (g.airborne && !g.heldByGod) continue; // falling: airborne system moves it
    if (g.activity.status !== 'running') continue;
    const res = ACTIONS[g.activity.action].step(g, w);
    if (res !== 'running') {
      g.activity.status = res;
      g.velocity = { x: 0, y: 0 };
      if (res === 'done' && g.godView.wishes.length) wishDone(g, w, g.activity.action);
    }
  }
}
