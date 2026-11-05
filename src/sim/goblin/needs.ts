import type { DeathCause } from '../../shared/types';
import { clamp, q4 } from '../../shared/math';
import { CFG } from '../config';
import { perDay } from '../time';
import type { Goblin, NeedId } from '../state';
import type { World } from '../world';
import { express, lifeStageForAge } from './genetics/phenotype';
import { ageDays, isSleeping } from './goblin';
import { allocId } from '../../shared/ids';
import { coldDamage, warmthDelta } from '../temperature';
import { weatherAt } from '../weather';

const WORK_ACTIONS = new Set(['harvest_fruit', 'pick_up', 'chop', 'build', 'deliver_material']);

/** Per-tick decay for the active needs (§7.1). Warmth is event-driven (temperature.ts); others are stubs until their phase. */
export function needDecay(g: Goblin, need: NeedId, season: string, heatwave = false): number {
  const D = CFG.goblin.decayPerDay;
  const size = express(g.genome, 'adultSize');
  switch (need) {
    case 'hunger': {
      let m = express(g.genome, 'metabolism') * size;
      if (g.lifeStage === 'hatchling') m *= CFG.goblin.hatchlingHungerMul;
      return perDay(D.hunger) * m;
    }
    case 'thirst':
      return perDay(D.thirst) * (season === 'summer' ? 1.15 : 1) * (heatwave ? CFG.weather.heatwaveThirstMul : 1);
    case 'energy':
      if (isSleeping(g)) return 0;
      return perDay(D.energy) * (WORK_ACTIONS.has(g.activity.action) ? CFG.goblin.workEnergyMul : 1);
    case 'curiosity':
      return perDay(D.curiosity) * (0.5 + g.personality.wanderlust);
    default:
      return 0;
  }
}

const ACTIVE: NeedId[] = ['hunger', 'thirst', 'energy', 'curiosity'];

export function updateBodies(w: World): void {
  const s = w.s;
  const dead: { g: Goblin; cause: DeathCause }[] = [];
  for (const g of s.goblins) {
    const heat = weatherAt(w, g.pos) === 'heatwave';
    for (const n of ACTIVE) g.needs[n] = q4(clamp(g.needs[n] - needDecay(g, n, w.clock.season, heat), 0, 100));
    const warm0 = g.needs.warmth;
    g.needs.warmth = q4(clamp(warm0 + warmthDelta(w, g), 0, 100));
    if (warm0 >= CFG.temperature.hypothermiaBelow && g.needs.warmth < CFG.temperature.hypothermiaBelow) w.emit({ type: 'freezing', goblinId: g.id, at: g.pos });
    // starvation / dehydration / hypothermia damage at 0
    let dmg = 0;
    let cause: DeathCause | null = null;
    const cold = coldDamage(g);
    if (cold > 0) { dmg += cold; cause = 'hypothermia'; }
    if (g.needs.hunger <= 0) { dmg += perDay(CFG.goblin.starveDmgPerDay); cause = 'starvation'; }
    if (g.needs.thirst <= 0) { dmg += perDay(CFG.goblin.starveDmgPerDay) * 1.5; cause = 'dehydration'; }
    if (dmg > 0) g.health.hp = q4(g.health.hp - dmg);
    else if (g.health.hp < g.health.maxHp && g.needs.hunger > 30 && g.needs.thirst > 30 && g.needs.warmth > 20)
      g.health.hp = q4(Math.min(g.health.maxHp, g.health.hp + perDay(40) * express(g.genome, 'metabolism')));
    if (g.health.hp <= 0) { dead.push({ g, cause: cause ?? 'fall' }); continue; }
    // aging and life stage (recomputed hourly)
    if ((s.tick + g.id) % CFG.god.hourTicks === 0) {
      const age = ageDays(g, s.tick);
      if (age > g.lifespanDays) { dead.push({ g, cause: 'old_age' }); continue; }
      const st = lifeStageForAge(age, g.lifespanDays);
      if (st !== g.lifeStage) {
        g.lifeStage = st;
        w.emit({ type: 'life_stage', goblinId: g.id, stage: st, at: g.pos });
      }
    }
  }
  for (const d of dead) killGoblin(w, d.g, d.cause);
}

export function killGoblin(w: World, g: Goblin, cause: DeathCause): void {
  const s = w.s;
  const i = s.goblins.indexOf(g);
  if (i < 0) return;
  s.goblins.splice(i, 1);
  s.graves.push({ id: allocId(s), goblinId: g.id, name: g.name, pos: { ...g.pos }, tick: s.tick, cause });
  s.stats.deaths[cause] = (s.stats.deaths[cause] ?? 0) + 1;
  if (s.god.held?.id === g.id) s.god.held = null;
  for (const it of s.groundItems) if (it.reservedBy === g.id) it.reservedBy = null;
  w.emit({ type: 'goblin_died', goblinId: g.id, cause, at: g.pos });
}

/** 0 (satisfied) .. 1 (critical). Steeper as the need empties. */
export function needUrgency(v: number): number {
  const x = clamp(1 - v / 100, 0, 1);
  return x * x * (0.6 + 0.4 * x) + (v < CFG.goblin.lowNeed ? 0.25 : 0);
}
