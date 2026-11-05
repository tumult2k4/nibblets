import { CFG } from '../../config';
import { dist } from '../../../shared/math';
import { canCarry, countItem } from '../../inventory';
import { needUrgency } from '../../goblin/needs';
import { moveAlong, planPath, faceToward } from '../../steering';
import { spawnGroundItem } from '../../groundItems';
import { removePlant } from '../../plants';
import { stockCount } from '../../stockpile';
import type { Goblin, Plant } from '../../state';
import type { World } from '../../world';
import type { UtilityAction } from '../action';

const P = CFG.plants;

let cache = { tick: -1, s: null as unknown, n: 0 };
/** Mature apple bushes in the world (cached per tick): we don't chop the food supply below a floor. */
function matureApples(w: World): number {
  if (cache.tick !== w.s.tick || cache.s !== w.s)
    cache = { tick: w.s.tick, s: w.s, n: w.s.plants.filter((p) => p.kind === 'apple_bush' && p.stage === 'mature').length };
  return cache.n;
}

/** How much a goblin wants to chop this plant (0 = never). Old bushes first, then berry bushes, then fruitless mature apples. */
function chopValue(w: World, p: Plant): number {
  if (p.kind === 'apple_bush') {
    if (p.stage === 'old') return 2;
    if (p.stage === 'mature' && p.fruit === 0 && matureApples(w) > P.minBushesPerGoblin * w.s.goblins.length) return 0.7;
    return 0;
  }
  if (p.kind === 'berry_bush' && p.stage === 'mature') return 1.1;
  return 0; // trees need a stone axe (P4)
}

function findChopTarget(g: Goblin, w: World): Plant | null {
  let best: Plant | null = null;
  let bestS = 0;
  for (const p of w.plantHash.query(g.pos, 30)) {
    const v = chopValue(w, p);
    if (v <= 0 || w.s.goblins.some((o) => o.id !== g.id && o.activity.action === 'chop' && o.activity.targetId === p.id)) continue;
    const s = v / (1 + dist(g.pos, p.pos) / 15);
    if (s > bestS) { bestS = s; best = p; }
  }
  return best;
}

export const woodWanted = (g: Goblin, w: World): number =>
  Math.max(0, 1 - (stockCount(w.s, 'wood') + countItem(g, 'wood')) / P.woodTarget);

const busy = (g: Goblin): number => Math.max(needUrgency(g.needs.hunger), needUrgency(g.needs.thirst), needUrgency(g.needs.energy));

/** Multi-hit chopping (§8.1): wood + sticks drop as ground items; mature/old bushes leave a stump. */
export const Chop: UtilityAction = {
  id: 'chop', tags: ['work'], minStage: 'adult', interruptible: true,
  isAvailable: (g, w) => canCarry(g, 'wood') && woodWanted(g, w) > 0,
  score(g, w) {
    if (!findChopTarget(g, w)) return 0;
    return 0.34 * woodWanted(g, w) * (1 - busy(g));
  },
  start(g, w) {
    const p = findChopTarget(g, w);
    if (!p || !planPath(w, g, p.pos)) return false;
    g.activity.targetId = p.id;
    return true;
  },
  step(g, w) {
    const a = g.activity;
    const p = w.s.plants.find((x) => x.id === a.targetId);
    if (!p || chopValue(w, p) <= 0 && p.hp === 100) return 'failed';
    if (a.stage === 0) {
      if (dist(g.pos, p.pos) < 0.9) a.path = [];
      if (moveAlong(w, g) !== 'arrived') return 'running';
      faceToward(g, p.pos);
      a.stage = 1;
      a.progress = P.chopTicksPerHit;
    }
    if (--a.progress > 0) return 'running';
    p.hp -= P.chopHitDmg;
    a.progress = P.chopTicksPerHit;
    if (p.hp > 0) return 'running';
    const wood = p.kind === 'berry_bush' ? P.berryWood : p.stage === 'old' ? P.wood.old : p.stage === 'young' ? P.wood.young : P.wood.mature;
    const sticks = p.kind === 'apple_bush' ? (p.stage === 'old' ? P.sticks.old : p.stage === 'mature' ? P.sticks.mature : 0) : 0;
    spawnGroundItem(w, { type: 'wood', qty: wood }, { x: p.pos.x + 0.3, y: p.pos.y });
    if (sticks) spawnGroundItem(w, { type: 'stick', qty: sticks }, { x: p.pos.x - 0.3, y: p.pos.y + 0.2 });
    w.emit({ type: 'plant_chopped', goblinId: g.id, plantId: p.id, wood });
    if (p.stage === 'mature' || p.stage === 'old') {
      p.stage = 'stump';
      p.growth = 0;
      p.fruit = 0;
      p.hp = 100;
      w.emit({ type: 'plant_stage', plantId: p.id, stage: 'stump' });
    } else removePlant(w, p);
    return 'done';
  },
};
