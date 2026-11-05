/**
 * The fiber chain's first link (§7.2 `CutGrass`, P5.6): goblins cut meadow grass for fiber while the village is short
 * of it (target stock 10 plus what blueprints wait for); a cut patch thins by 0.3 and regrows by season (ecology.ts).
 * `PickFlowers`: a goblin that wants a flower crown picks blooms, up to three in one outing (they rebloom in 2 days).
 */
import { CFG } from '../../config';
import { dist } from '../../../shared/math';
import { addItem, canCarry, countItem } from '../../inventory';
import { moveAlong, planPath, faceToward } from '../../steering';
import { distanceFalloff } from '../considerations';
import { stockCount } from '../../stockpile';
import { materialWanted } from '../wants';
import { craftWant } from '../../crafting';
import { knows } from '../../recipes';
import { gainXp, skillSpeed } from '../../goblin/skills';
import { busy } from './village';
import type { GrassPatch, Goblin, Plant } from '../../state';
import type { World } from '../../world';
import type { UtilityAction } from '../action';

const F = CFG.fiber;

export const fiberWanted = (g: Goblin, w: World): number => materialWanted(g, w, 'fiber', F.fiberTarget);

const cutting = (w: World, g: Goblin, id: number): boolean =>
  w.s.goblins.some((o) => o !== g && o.activity.action === 'cut_grass' && o.activity.status === 'running' && o.activity.targetId === id);

/** The nearest patch thick enough to cut (village side first: distance from the goblin). */
export function grassPatch(g: Goblin, w: World): GrassPatch | null {
  let best: GrassPatch | null = null, bd: number = F.range;
  for (const p of w.s.grass) {
    if (p.density < F.minDensity) continue;
    const d = dist(g.pos, p.pos);
    if (d < bd && !cutting(w, g, p.id)) { bd = d; best = p; }
  }
  return best;
}

export const CutGrass: UtilityAction = {
  id: 'cut_grass', tags: ['work'], minStage: 'youngling', interruptible: true,
  isAvailable: (g, w) => canCarry(g, 'fiber') && fiberWanted(g, w) > 0 && !!grassPatch(g, w),
  score(g, w) {
    const p = grassPatch(g, w)!;
    return (F.gatherScore[0] + F.gatherScore[1] * fiberWanted(g, w)) * (1 - busy(g)) * distanceFalloff(dist(g.pos, p.pos), F.range);
  },
  start(g, w) {
    const p = grassPatch(g, w);
    if (!p) return false;
    g.activity.targetId = p.id;
    return planPath(w, g, p.pos);
  },
  step(g, w) {
    const a = g.activity;
    const p = w.s.grass.find((x) => x.id === a.targetId);
    if (!p || p.density < F.minDensity) return 'failed';
    if (a.stage === 0) {
      if (moveAlong(w, g) !== 'arrived') return 'running';
      a.stage = 1;
      a.progress = Math.round(F.cutTicks / skillSpeed(g, 'forage'));
    }
    g.velocity = { x: 0, y: 0 };
    faceToward(g, p.pos);
    if (--a.progress > 0) return 'running';
    p.density = Math.max(0, Math.round((p.density - F.cutDensity) * 1e4) / 1e4);
    const got = addItem(g, { type: 'fiber', qty: w.rng.int(F.fiberPerCut[0], F.fiberPerCut[1]) });
    gainXp(w, g, 'forage', CFG.skills.xp.cut * got);
    return got > 0 ? 'done' : 'failed';
  },
};

/** Flowers the goblin wants: three for a crown it would like to wear. */
export function flowerWant(g: Goblin, w: World): number {
  if (!knows(g, 'flower_crown') || countItem(g, 'flower') + stockCount(w.s, 'flower') >= F.flowerTarget) return 0;
  return craftWant(g, w, 'flower_crown');
}

const inBloom = (p: Plant): boolean => p.kind === 'flower' && p.stage === 'mature' && p.fruit >= 1;
const bloom = (g: Goblin, w: World, r: number = F.range): Plant | null => w.plantHash.nearest(g.pos, r, inBloom);

export const PickFlowers: UtilityAction = {
  id: 'pick_flowers', tags: ['work', 'fun'], minStage: 'youngling', interruptible: true,
  isAvailable: (g, w) => canCarry(g, 'flower') && flowerWant(g, w) > 0 && !!bloom(g, w),
  score: (g, w) => (0.06 + flowerWant(g, w)) * (1 - busy(g)),
  start(g, w) {
    const p = bloom(g, w);
    if (!p) return false;
    g.activity.targetId = p.id;
    g.activity.count = 0;
    return planPath(w, g, p.pos);
  },
  step(g, w) {
    const a = g.activity;
    const p = w.s.plants.find((x) => x.id === a.targetId);
    if (!p || !inBloom(p)) return (a.count ?? 0) > 0 ? 'done' : 'failed';
    if (a.stage === 0) {
      if (moveAlong(w, g) !== 'arrived') return 'running';
      a.stage = 1;
      a.progress = F.pickTicks;
    }
    faceToward(g, p.pos);
    if (--a.progress > 0) return 'running';
    p.fruit = 0;
    p.fruitProgress = 0;
    if (addItem(g, { type: 'flower', qty: 1 }) < 1) return 'done';
    a.count = (a.count ?? 0) + 1;
    // the next bloom nearby, until there are enough for a crown
    const next = countItem(g, 'flower') < F.flowerTarget ? bloom(g, w, 6) : null;
    if (!next || !planPath(w, g, next.pos)) return 'done';
    a.targetId = next.id;
    a.stage = 0;
    return 'running';
  },
};
