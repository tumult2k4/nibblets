import { CFG } from '../../config';
import { dist } from '../../../shared/math';
import type { ID, Vec2 } from '../../../shared/types';
import { addItem, canCarry, foodStack } from '../../inventory';
import { needUrgency } from '../../goblin/needs';
import { forget } from '../../goblin/memory';
import { faceToward, moveAlong, planPath } from '../../steering';
import { distanceFalloff, visionRadius } from '../considerations';
import { looksEdible, mushroomItem, removeMushroom } from '../../ecology';
import type { Goblin } from '../../state';
import type { World } from '../../world';
import type { UtilityAction } from '../action';
import { gainXp, workSpeed } from '../../goblin/skills';
import { knows } from '../../recipes';
import { countItem } from '../../inventory';
import { stockCount } from '../../stockpile';
import { remedyWant } from '../../remedy';
import { claimCount } from '../claims';

const M = CFG.mushrooms;
const FAR = 40;

const takenBy = (w: World, id: ID, me: ID): boolean => claimCount(w, 'forage', id, me, true) > 0;

/**
 * Nearest visible mushroom it takes for food, else a remembered one (§8.2; redcaps only if it doesn't know better,
 * P5.5). `herb`: only glowcaps, wanted for the herbal remedy (P6.5).
 */
export function findMushroom(g: Goblin, w: World, herb = false): { id: ID; pos: Vec2 } | null {
  const vr = visionRadius(g, w);
  let best: { id: ID; pos: Vec2 } | null = null, bd = Infinity;
  for (const m of w.s.mushrooms) {
    const d = dist(g.pos, m.pos);
    if (d < vr && d < bd && (herb ? m.kind === 'glowcap' : looksEdible(g, m)) && !takenBy(w, m.id, g.id)) { bd = d; best = m; }
  }
  if (best) return best;
  for (const e of g.memory) {
    if (e.kind !== 'mushroom' || e.targetId === undefined) continue;
    const m = w.s.mushrooms.find((x) => x.id === e.targetId);
    if (m && !looksEdible(g, m)) continue; // heard about it before learning what it is
    if (herb && m?.kind !== 'glowcap') continue;
    const d = dist(g.pos, e.pos) / Math.max(0.1, e.confidence);
    if (d < FAR && d < bd && !takenBy(w, e.targetId, g.id)) { bd = d; best = { id: e.targetId, pos: e.pos }; }
  }
  return best;
}

/** 0..1: a glowcap wanted for the remedy — it knows how to make it, the village needs one, and there is none to hand. */
function herbWant(g: Goblin, w: World): number {
  if (!knows(g, 'herbal_remedy') || countItem(g, 'glowcap') + stockCount(w.s, 'glowcap') > 0) return 0;
  return remedyWant(g, w);
}
const foodScore = (g: Goblin, m: { pos: Vec2 } | null): number =>
  // fewer calories than fruit: a fallback when bushes are bare, a treat on the way otherwise
  m ? (foodStack(g) ? 0.3 : 1) * (0.04 + 0.8 * needUrgency(g.needs.hunger)) * distanceFalloff(dist(g.pos, m.pos), FAR) : 0;
/** What to forage for: a snack, or (P6.5) a glowcap for the remedy, whichever is worth more now. */
function forageTarget(g: Goblin, w: World): { m: { id: ID; pos: Vec2 }; score: number } | null {
  const food = findMushroom(g, w), fs = foodScore(g, food);
  const want = herbWant(g, w), herb = want > 0 ? findMushroom(g, w, true) : null;
  // an errand like any work: it waits while the goblin is hungry, thirsty or tired
  const busy = Math.max(needUrgency(g.needs.hunger), needUrgency(g.needs.thirst), needUrgency(g.needs.energy));
  const hs = herb ? CFG.health.herbForage * want * (1 - busy) * distanceFalloff(dist(g.pos, herb.pos), FAR) : 0;
  if (herb && hs > fs) return { m: herb, score: hs };
  return food ? { m: food, score: fs } : null;
}

/** Forage: walk to a mushroom and pick it (a snack for later, or a herb; Eat handles eating). */
export const Forage: UtilityAction = {
  id: 'forage', tags: ['food', 'work'], minStage: 'youngling', interruptible: true,
  isAvailable: (g, w) => w.s.mushrooms.length > 0 && canCarry(g, 'mushroom') && (g.needs.hunger < 85 || herbWant(g, w) > 0),
  cap: (g) => Math.max((foodStack(g) ? 0.3 : 1) * (0.04 + 0.8 * needUrgency(g.needs.hunger)), (knows(g, 'herbal_remedy') ? CFG.health.herbForage : 0) * (1 - Math.max(needUrgency(g.needs.hunger), needUrgency(g.needs.thirst), needUrgency(g.needs.energy)))),
  score: (g, w) => forageTarget(g, w)?.score ?? 0,
  start(g, w) {
    const m = forageTarget(g, w)?.m;
    if (!m || !planPath(w, g, m.pos)) return false;
    g.activity.targetId = m.id;
    g.activity.target = { x: m.pos.x, y: m.pos.y };
    return true;
  },
  step(g, w) {
    const a = g.activity;
    const m = w.s.mushrooms.find((x) => x.id === a.targetId);
    if (!m) {
      // rotted or picked by someone else: noticed once it is in sight
      if (dist(g.pos, a.target!) < visionRadius(g, w) * 0.5) {
        forget(g, 'mushroom', a.targetId!);
        return 'failed';
      }
      return moveAlong(w, g) === 'arrived' ? 'failed' : 'running';
    }
    if (a.stage === 0) {
      if (dist(g.pos, m.pos) < 0.5) a.path = [];
      if (moveAlong(w, g) !== 'arrived') return 'running';
      a.stage = 1;
      a.progress = Math.round(M.forageTicks / workSpeed(g, 'forage'));
      faceToward(g, m.pos);
    }
    if (--a.progress > 0) return 'running';
    const item = mushroomItem(m);
    if (addItem(g, { type: item, qty: 1 }) <= 0) return 'failed';
    removeMushroom(w, m);
    forget(g, 'mushroom', m.id);
    g.deeds.harvested += 1;
    gainXp(w, g, 'forage', CFG.skills.xp.forage);
    w.emit({ type: 'foraged', goblinId: g.id, item, at: m.pos });
    return 'done';
  },
};
