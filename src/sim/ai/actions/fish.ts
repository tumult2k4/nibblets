/**
 * Fish (§7.2 work, §11.2, P7.2): an adult with a rod walks to the shore by a fish it can see, casts, waits for a bite
 * and, more often than not, lands it. Patient goblins (little wanderlust) like it best; the hungrier the store, the
 * more it is worth. The rod wears with each cast; forage skill shortens the wait and steadies the catch.
 */
import { CFG } from '../../config';
import { clamp, dist } from '../../../shared/math';
import type { Goblin } from '../../state';
import type { World } from '../../world';
import type { UtilityAction } from '../action';
import { faceToward, moveAlong, planPath } from '../../steering';
import { gainXp, skillLevel } from '../../goblin/skills';
import { remember } from '../../goblin/memory';
import { itemDef } from '../../items';
import { gear, wearTool } from '../../tools';
import { addItem, canCarry } from '../../inventory';
import { biteTicks, fishingSpot, landFish } from '../../fishing';
import { huntWant } from '../wants';
import { busy } from './village';
import { isNight } from '../../time';

const F = CFG.economy.fishing;
const rodOf = (g: Goblin) => gear(g).find((s) => !!itemDef(s.type).tool?.fishMul) ?? null;

const able = (g: Goblin, w: World): boolean => !!rodOf(g) && !isNight(w.clock) && !g.health.disease && canCarry(g, 'fish');

export const Fish: UtilityAction = {
  id: 'fish', tags: ['work'], minStage: 'adult', interruptible: true,
  isAvailable: (g, w) => able(g, w) && !!fishingSpot(g, w),
  score(g, w) {
    const sp = fishingSpot(g, w)!;
    const near = 1 - 0.5 * dist(sp.stand, g.pos) / F.range;
    return clamp(F.base * huntWant(g, w) * (0.7 + 0.5 * (1 - g.personality.wanderlust)) * near * (1 - busy(g)), 0, 1);
  },
  start(g, w) {
    const sp = fishingSpot(g, w);
    if (!sp || !planPath(w, g, sp.stand)) return false;
    Object.assign(g.activity, { target: { ...sp.stand }, targetId: sp.fish.id, stage: 0, progress: 0 });
    return true;
  },
  step(g, w) {
    const a = g.activity, stand = a.target;
    const rod = rodOf(g);
    if (!stand || !rod) return 'failed';
    if (a.stage === 0) {
      if (moveAlong(w, g) !== 'arrived') return 'running';
      a.stage = 1;
      a.progress = F.castTicks + biteTicks(w, stand, skillLevel(g, 'forage'));
    }
    g.velocity = { x: 0, y: 0 };
    const fish = w.s.wildlife.find((c) => c.id === a.targetId);
    if (fish) faceToward(g, fish.pos);
    if (--a.progress > 0) return 'running';
    wearTool(w, g, rod);
    const caught = w.rng.chance(F.catch + F.catchPerLevel * skillLevel(g, 'forage')) && landFish(w, stand);
    const firsts = (w.s.village.firsts ??= []), first = caught && !firsts.includes('fish');
    if (first) firsts.push('fish');
    w.emit({ type: 'fish_caught', goblinId: g.id, caught, first, at: { ...stand } });
    if (!caught) return 'done';
    addItem(g, { type: 'fish', qty: 1 });
    gainXp(w, g, 'forage', CFG.skills.xp.forage * 2);
    remember(g, w, 'fishing_spot', stand);
    return 'done';
  },
};
