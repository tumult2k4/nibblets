/**
 * Mine (§P4.1): knock stones off a rock until the goblin carries a load. Rocks hold finite stone (size × 4) and
 * shrink as they are mined; each stone may come with a flint. A pick doubles the pace and wears by one use per stone.
 */
import { CFG } from '../../config';
import { clamp, dist, q4 } from '../../../shared/math';
import { addItem, canCarry, countItem } from '../../inventory';
import { needUrgency } from '../../goblin/needs';
import { forget } from '../../goblin/memory';
import { faceToward, moveAlong, planPath } from '../../steering';
import { spawnGroundItem } from '../../groundItems';
import { tileAt } from '../../grid';
import { toolFor, wearTool } from '../../tools';
import { workMul } from '../../combat';
import { giveTrinket, rollRarity } from '../../trinkets';
import { stoneWanted } from '../wants';
import type { ItemType } from '../../../shared/types';
import type { Goblin, Rock } from '../../state';
import type { World } from '../../world';
import type { UtilityAction } from '../action';
import { gainXp, skillLevel, skillSpeed } from '../../goblin/skills';

const M = CFG.mining;

const takenBy = (w: World, g: Goblin, rk: Rock): boolean =>
  w.s.goblins.some((o) => o.id !== g.id && o.activity.action === 'mine' && o.activity.targetId === rk.id);

/** Nearest workable rock (flint-bearing ones a little preferred), one miner per rock. */
export function findRock(g: Goblin, w: World): Rock | null {
  let best: Rock | null = null, bs = 0;
  for (const rk of w.s.rocks) {
    const d = dist(g.pos, rk.pos);
    if (d > M.searchRadius || rk.stoneLeft < M.minStone || !tileAt(w.s, rk.pos.x, rk.pos.y)?.walkable || takenBy(w, g, rk)) continue;
    const s = (1 + rk.flintChance) / (1 + d / 12);
    if (s > bs) { bs = s; best = rk; }
  }
  return best;
}

/** Where to stand: at the rock's edge, on the goblin's side. */
function workSpot(g: Goblin, rk: Rock): { x: number; y: number } {
  const d = dist(g.pos, rk.pos);
  const ux = d > 0.01 ? (g.pos.x - rk.pos.x) / d : 1, uy = d > 0.01 ? (g.pos.y - rk.pos.y) / d : 0;
  const off = 0.35 + rk.size * 0.3;
  return { x: q4(rk.pos.x + ux * off), y: q4(rk.pos.y + uy * off) };
}

export const mineTicks = (g: Goblin): number => Math.round(M.ticksPerStone / (toolFor(g, 'mine').mul * workMul(g) * skillSpeed(g, 'mining')));

function give(g: Goblin, w: World, type: ItemType): void {
  if (addItem(g, { type, qty: 1 }) < 1) spawnGroundItem(w, { type, qty: 1 }, { x: q4(g.pos.x + 0.2), y: q4(g.pos.y + 0.2) });
}

export function removeRock(w: World, rk: Rock): void {
  const i = w.s.rocks.indexOf(rk);
  if (i >= 0) w.s.rocks.splice(i, 1);
}

const busy = (g: Goblin): number => Math.max(needUrgency(g.needs.hunger), needUrgency(g.needs.thirst), needUrgency(g.needs.energy));
const loaded = (g: Goblin): boolean => countItem(g, 'stone') >= M.stonesPerTrip || !canCarry(g, 'stone');

export const Mine: UtilityAction = {
  id: 'mine', tags: ['work'], minStage: 'adult', interruptible: true,
  isAvailable: (g, w) => !loaded(g) && stoneWanted(g, w) > 0,
  score(g, w) {
    if (!findRock(g, w)) return 0;
    return 0.3 * stoneWanted(g, w) * (1 - busy(g));
  },
  start(g, w) {
    const rk = findRock(g, w);
    if (!rk || !planPath(w, g, workSpot(g, rk))) return false;
    g.activity.targetId = rk.id;
    g.activity.stage = 0;
    return true;
  },
  step(g, w) {
    const a = g.activity;
    const rk = w.s.rocks.find((r) => r.id === a.targetId);
    if (!rk) {
      if (a.targetId !== null) forget(g, 'rock', a.targetId);
      return 'failed';
    }
    if (a.stage === 0) {
      if (moveAlong(w, g) !== 'arrived') return 'running';
      faceToward(g, rk.pos);
      a.stage = 1;
      a.progress = mineTicks(g);
    }
    if (--a.progress > 0) return 'running';
    const pick = toolFor(g, 'mine').stack;
    const flint = w.rng.chance(rk.flintChance + CFG.skills.flintPerLevel * skillLevel(g, 'mining')); // a practised eye spots the flint
    rk.stoneLeft -= 1;
    rk.size = clamp(Math.ceil(rk.stoneLeft / 4), 1, 3) as Rock['size'];
    give(g, w, 'stone');
    gainXp(w, g, 'mining', CFG.skills.xp.stone);
    if (flint) give(g, w, 'flint');
    if (w.rng.chance(CFG.trinkets.mineChance)) giveTrinket(w, g, rollRarity(w)); // P8.2: something shiny in the rubble
    w.emit({ type: 'rock_mined', goblinId: g.id, rockId: rk.id, flint, left: rk.stoneLeft });
    if (pick) wearTool(w, g, pick);
    if (rk.stoneLeft <= 0) {
      removeRock(w, rk);
      forget(g, 'rock', rk.id);
      return 'done';
    }
    if (loaded(g)) return 'done';
    a.progress = mineTicks(g);
    return 'running';
  },
};
