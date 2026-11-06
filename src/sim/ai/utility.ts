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
import { DigClay } from './actions/digClay';

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

/** Score every available action (debug overlay uses `noise=false`). */
export function scoreActions(g: Goblin, w: World, noise = true, planned: ActionId | null = null): ScoreRow[] {
  const rows: ScoreRow[] = [];
  for (const a of CHOOSABLE) {
    if (!stageAtLeast(g.lifeStage, a.minStage) || !a.isAvailable(g, w)) continue;
    let base = a.score(g, w);
    // §7.4 focus: the planner's chosen step gets ×1.5 and a floor so low-scoring steps (explore) still happen
    const fo = planned === a.id ? CFG.planner.focus : 1;
    if (fo > 1) base = Math.max(base, CFG.planner.floor);
    if (base <= 0) continue;
    const pw = personalityWeight(g.personality, a.id) * stageMul(g, a) * traitMul(g, a.id); // personality, life stage, traits
    const mm = moodMul(g, a);
    const sk = skillFocus(g, a.id);
    const hy = g.activity.action === a.id && g.activity.status === 'running' ? CFG.goblin.hysteresis : 1;
    const n = noise ? w.rng.range(0.95, 1.05) : 1;
    rows.push({ id: a.id, base, personality: pw, mood: mm, skill: sk, hysteresis: hy, focus: fo, final: base * pw * mm * sk * hy * fo * n });
  }
  rows.sort((x, y) => y.final - x.final || (x.id < y.id ? -1 : 1));
  return rows;
}

function resetActivity(g: Goblin, w: World, id: ActionId): void {
  g.activity = { action: id, status: 'running', startedTick: w.s.tick, targetId: null, target: null, path: [], progress: 0, stage: 0 };
}

/** Start an action; if it can't start, fall back to idle. */
export function startAction(g: Goblin, w: World, id: ActionId): boolean {
  releaseReservations(g, w);
  resetActivity(g, w, id);
  if (ACTIONS[id].start(g, w)) return true;
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

/** §6 step 12: staggered re-decision. */
export function think(w: World): void {
  const s = w.s;
  const iv = CFG.goblin.decisionIntervalTicks;
  for (const g of s.goblins) {
    if (g.heldByGod || g.airborne) continue;
    const cur = ACTIONS[g.activity.action];
    const finished = g.activity.status !== 'running';
    // §7.2 interrupts: a storm caught outdoors re-decides at once; danger in sight cuts any unforced action
    // (both rate-limited to every 10 ticks)
    const ready = s.tick - g.lastDecisionTick >= 10;
    const danger = ready && !cur.forced && (dangerCaught(g, w) || fireCaught(g, w));
    const due = s.tick % iv === g.id % iv || danger || (ready && stormCaught(g, w));
    const canCut = danger || (typeof cur.interruptible === 'function' ? cur.interruptible(g) : cur.interruptible);
    if (!finished && (!due || !canCut)) continue;
    const rows = scoreActions(g, w, true, planFor(g, w, (gg, ww) => !!findChopTarget(gg, ww)));
    g.lastDecisionTick = s.tick;
    const best = rows[0]?.id ?? 'idle';
    if (!finished && best === g.activity.action) continue;
    // a cursed goblin (P4.8) fumbles one new task in four: it stands there flustered instead
    if (best !== 'idle' && !ACTIONS[best].tags.includes('danger') && cursed(g, s.tick) && w.rng.chance(CFG.powers.curseFail)) {
      startAction(g, w, 'idle');
      w.emit({ type: 'emote', goblinId: g.id, emote: 'sweat' });
      continue;
    }
    // a choice that can't start (no site, no way there) falls through to the next best rather than idling
    let started = false;
    for (const r of rows.slice(0, 3)) {
      if (r.id === 'idle') break;
      if ((started = startAction(g, w, r.id))) break;
    }
    if (!started) startAction(g, w, 'idle');
  }
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
    }
  }
}
