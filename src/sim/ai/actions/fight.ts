/**
 * §P4.5 fighting: `Attack` (an enemy in sight, above all one biting someone) and `DefendVillage` (any seen enemy inside
 * the village, armed or brave adults only) share one engage loop: close in, wind up 0.4 s, swing, cool down. A fight
 * that ends with the goblin standing counts toward `veteran` (5 fights: never panics). Morale (§14.2): a goblin panics
 * when safety < 20 and bravery < 0.5, or below 30 % hp unless a veteran; defending kin (or its egg) overrides both and
 * makes it half again as brave.
 */
import { CFG } from '../../config';
import { dist } from '../../../shared/math';
import { moveAlong, planPath, faceToward } from '../../steering';
import { bestWeapon, weaponDmg } from '../../tools';
import { isVeteran, reachOf, strike, threatsNear } from '../../combat';
import { visionRadius } from '../considerations';
import { harmless, running } from '../../enemies/common';
import { isSleeping } from '../../goblin/goblin';
import { isKin } from '../../goblin/social';
import type { ActionId, Enemy, Goblin } from '../../state';
import type { World } from '../../world';
import type { UtilityAction } from '../action';

const C = CFG.combat;
export const DANGER: ReadonlySet<ActionId> = new Set(['flee', 'attack', 'defend_village']);

const enemyById = (w: World, id: number | null): Enemy | undefined => (id === null ? undefined : w.s.enemies.find((e) => e.id === id));
const victimOf = (w: World, e: Enemy): Goblin | undefined => (e.mode === 'attack' && e.targetId !== null ? w.goblin(e.targetId) : undefined);

/** Nearest threat this goblin can see (none while asleep). */
export function visibleThreat(g: Goblin, w: World): Enemy | null {
  if (isSleeping(g) || g.heldByGod || g.airborne) return null;
  let best: Enemy | null = null, bd = visionRadius(g, w);
  for (const e of threatsNear(w, g.pos, bd)) {
    const d = dist(e.pos, g.pos);
    if (d <= bd) { bd = d; best = e; }
  }
  return best;
}

const heavy = (g: Goblin): boolean => {
  const wpn = bestWeapon(g);
  return !!wpn && weaponDmg(wpn) >= CFG.enemies.bramblebeast.mobDmg;
};
/**
 * Anything but a Bramblebeast can be fought; that one only by a mob: at least three awake adults with heavy weapons
 * (≥ 20 dmg) within 14 tiles of it, who then close in together (§14.1).
 */
export function canTakeOn(g: Goblin, w: World, e: Enemy): boolean {
  if (e.kind !== 'bramblebeast') return true;
  const B = CFG.enemies.bramblebeast;
  if (!heavy(g)) return false;
  let n = 1;
  for (const o of w.goblinHash.query(e.pos, B.mobRadius))
    if (o !== g && o.lifeStage === 'adult' && !isSleeping(o) && heavy(o) && dist(o.pos, e.pos) <= B.mobRadius) n++;
  return n >= B.mobSize;
}
/** Threats in sight this goblin could go for. */
const foes = (g: Goblin, w: World, pos: { x: number; y: number }, r: number): Enemy[] => threatsNear(w, pos, r).filter((e) => canTakeOn(g, w, e));

/** Is `e` biting this goblin's parent, child or sibling, or going for its egg (§13.3)? */
function threatensKin(g: Goblin, w: World, e: Enemy): boolean {
  const v = victimOf(w, e);
  if (v && v.id !== g.id && isKin(g, v)) return true;
  return e.mode === 'steal' && w.s.eggs.some((x) => x.id === e.targetId && x.parents.includes(g.id));
}

/** An enemy in sight that is after this goblin's family. */
export function kinAttacker(g: Goblin, w: World): Enemy | null {
  if (isSleeping(g)) return null;
  const vr = visionRadius(g, w);
  for (const e of foes(g, w, g.pos, vr)) if (threatensKin(g, w, e)) return e;
  return null;
}

/** Bravery, ×1.5 while its own egg or child is threatened: fierce parents (§13.3, P5.4). */
export const courage = (g: Goblin, w: World): number =>
  Math.min(1, g.personality.bravery * (kinAttacker(g, w) ? CFG.life.parentBravery : 1));

export function panics(g: Goblin, w: World): boolean {
  if (kinAttacker(g, w)) return false;
  if (g.health.hp < C.panicHp * g.health.maxHp && !isVeteran(g)) return true;
  return g.needs.safety < C.panicSafety && g.personality.bravery < C.panicBravery && !isVeteran(g);
}

/** Who to go for: whoever bites kin, then whoever bites anyone, then the nearest. */
function attackTarget(g: Goblin, w: World): Enemy | null {
  if (isSleeping(g)) return null;
  const kin = kinAttacker(g, w);
  if (kin) return kin;
  const near = foes(g, w, g.pos, visionRadius(g, w)).sort((a, b) => dist(a.pos, g.pos) - dist(b.pos, g.pos));
  return near.find((e) => victimOf(w, e)) ?? near[0] ?? null;
}

/** Seen enemies inside the village, nearest first. */
function villageIntruder(g: Goblin, w: World): Enemy | null {
  let best: Enemy | null = null, bd: number = C.defendRange;
  const c = w.s.village.center;
  for (const e of w.s.enemies) {
    if (!e.seen || running(e) || harmless(e) || dist(e.pos, c) > C.villageRadius || !canTakeOn(g, w, e)) continue;
    const d = dist(e.pos, g.pos);
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}

const fighters = (w: World, e: Enemy, self: Goblin): number =>
  w.s.goblins.filter((o) => o !== self && DANGER.has(o.activity.action) && o.activity.action !== 'flee' && o.activity.targetId === e.id).length;
const hpFrac = (g: Goblin): number => g.health.hp / g.health.maxHp;

function engageStart(g: Goblin, w: World, e: Enemy | null): boolean {
  if (!e) return false;
  const a = g.activity;
  a.targetId = e.id;
  a.target = { ...e.pos };
  a.stage = 0;
  a.progress = C.windupTicks;
  return planPath(w, g, e.pos);
}

function endFight(g: Goblin): void {
  if (g.activity.stage < 1) return;
  g.deeds.fights++;
  if (g.deeds.fights >= C.veteranFights && !g.traits.includes('veteran')) g.traits.push('veteran');
}

/** Close in, then wind up, swing and cool down until the enemy is dead, gone or running. */
function engageStep(g: Goblin, w: World): 'running' | 'done' {
  const a = g.activity;
  const e = enemyById(w, a.targetId);
  const over = !e || e.mode === 'flee' || e.mode === 'leave' || w.s.tick - a.startedTick > C.fleeTicks * 3;
  if (over || dist(e.pos, g.pos) > C.defendRange) { endFight(g); return 'done'; }
  const d = dist(e.pos, g.pos);
  if (d > reachOf(g)) {
    if (!a.path.length || (a.target && dist(a.target, e.pos) > 1)) {
      a.target = { ...e.pos };
      if (!planPath(w, g, e.pos)) { endFight(g); return 'done'; }
    }
    moveAlong(w, g);
    a.progress = Math.max(a.progress, C.windupTicks);
    return 'running';
  }
  g.velocity = { x: 0, y: 0 };
  faceToward(g, e.pos);
  if (--a.progress > 0) return 'running';
  a.stage = 1;
  strike(w, g, e);
  a.progress = C.cooldownTicks + C.windupTicks;
  return 'running';
}

export const Attack: UtilityAction = {
  id: 'attack', tags: ['danger'], minStage: 'adult', interruptible: true,
  isAvailable: (g, w) => !!attackTarget(g, w) && !panics(g, w),
  score(g, w) {
    const e = attackTarget(g, w)!;
    const armed = !!bestWeapon(g);
    let s = (0.2 + 0.5 * courage(g, w)) * (armed ? 1 : 0.45) * hpFrac(g);
    const v = victimOf(w, e);
    if (v?.id === g.id) s += 0.4; // fight back
    else if (v) s += 0.25; // help whoever it is biting
    if (threatensKin(g, w, e)) s += 0.5;
    s += Math.min(0.3, 0.1 * fighters(w, e, g));
    return Math.min(1.3, s);
  },
  start: (g, w) => engageStart(g, w, attackTarget(g, w)),
  step: engageStep,
};

export const DefendVillage: UtilityAction = {
  id: 'defend_village', tags: ['danger'], minStage: 'adult', interruptible: true,
  isAvailable: (g, w) => (!!bestWeapon(g) || courage(g, w) > 0.5) && !isSleeping(g) && !!villageIntruder(g, w) && !panics(g, w),
  score(g, w) {
    const e = villageIntruder(g, w)!;
    const s = (0.3 + 0.45 * courage(g, w)) * (bestWeapon(g) ? 1 : 0.55) * hpFrac(g);
    return fighters(w, e, g) >= CFG.enemies.crowdFlee ? s * 0.3 : s;
  },
  start: (g, w) => engageStart(g, w, villageIntruder(g, w)),
  step: engageStep,
};
