import type { ID, Vec2 } from '../../shared/types';
import type { Rng } from '../../shared/rng';
import { allocId } from '../../shared/ids';
import { q4 } from '../../shared/math';
import { CFG } from '../config';
import type { Goblin, WorldState } from '../state';
import type { Genome } from './genetics/genome';
import { express, lifeStageForAge } from './genetics/phenotype';
import { personalityFromGenome } from './personality';
import { makeName } from './names';
import { STARTER_RECIPES } from '../recipes';

export const ageDays = (g: Goblin, tick: number): number => (tick - g.bornTick) / CFG.time.dayTicks;

export interface SpawnOpts { genome: Genome; pos: Vec2; ageDays: number; clanId: ID; parents?: [ID, ID] | null }

export function createGoblin(s: WorldState, rng: Rng, o: SpawnOpts): Goblin {
  const taken = new Set(s.goblins.map((g) => g.name));
  const parentNames = o.parents
    ? s.goblins.filter((g) => g.id === o.parents![0] || g.id === o.parents![1]).map((g) => g.name)
    : [];
  const name = makeName(rng, taken, parentNames);
  const personality = personalityFromGenome(o.genome, rng);
  const lifespanDays = q4(CFG.goblin.baseLifespanDays * express(o.genome, 'lifespan') * rng.range(0.9, 1.1));
  const bornTick = s.tick - Math.round(o.ageDays * CFG.time.dayTicks);
  const maxHp = Math.round(CFG.goblin.baseHp * express(o.genome, 'vigor'));
  return {
    id: allocId(s), name, epithet: null, clanId: o.clanId, genome: o.genome, bornTick,
    lifeStage: lifeStageForAge(o.ageDays, lifespanDays), parents: o.parents ?? null,
    pos: { x: o.pos.x, y: o.pos.y }, facing: q4(rng.range(0, Math.PI * 2)), velocity: { x: 0, y: 0 },
    needs: {
      hunger: q4(rng.range(55, 90)), thirst: q4(rng.range(55, 90)), energy: q4(rng.range(70, 95)),
      warmth: 70, safety: 80, social: 70, fun: 70, curiosity: q4(rng.range(40, 90)), comfort: 70, purpose: 70,
    },
    mood: { value: 20, modifiers: [], emotion: 'content' },
    personality,
    health: { hp: maxHp, maxHp, injuries: [], disease: null, scars: 0 },
    inventory: [],
    equipped: { hand: null, body: null, neck: null, head: null },
    activity: idleActivity(s.tick),
    goalStack: [], homeId: null, memory: [], relationships: [], skills: {}, knownRecipes: [...STARTER_RECIPES], trinkets: [],
    reputation: 0, traits: [],
    deeds: { eaten: 0, drank: 0, harvested: 0, planted: 0, kills: 0, builds: 0, gifts: 0, timesHeld: 0, fights: 0 },
    godView: {
      faith: q4(20 + personality.piety * 30), love: 30, fear: 10, angryAtGod: false, wishes: [],
      answeredPrayers: 0, ignoredPrayers: 0, lastVoiceTick: -1, petLoveToday: 0, petDay: -1,
    },
    role: 'none', heldByGod: false, lastDecisionTick: -1, airborne: null, lifespanDays, wetUntil: -1,
  };
}

export function idleActivity(tick: number): Goblin['activity'] {
  return { action: 'idle', status: 'done', startedTick: tick, targetId: null, target: null, path: [], progress: 0, stage: 0 };
}

/** Speed in tiles per tick: size and life stage trade-offs (§4.4). */
export function goblinSpeed(g: Goblin): number {
  const size = express(g.genome, 'adultSize');
  let mul = 1.1 - 0.15 * size;
  if (g.lifeStage === 'elder') mul *= 0.8;
  if (g.lifeStage === 'hatchling') mul *= 0.6;
  if (g.lifeStage === 'youngling') mul *= 0.9;
  if (g.health.injuries.some((i) => i.kind === 'limp')) mul *= CFG.combat.limpMul;
  return (CFG.goblin.speed * mul) / CFG.tickHz;
}

export const isSleeping = (g: Goblin): boolean =>
  (g.activity.action === 'sleep_ground' && g.activity.stage === 1) || (g.activity.action === 'sleep_home' && g.activity.stage === 2);
