import { CFG } from '../../config';
import { dist } from '../../../shared/math';
import { countItem, takeOne } from '../../inventory';
import { needUrgency } from '../../goblin/needs';
import { addMood } from '../../goblin/mood';
import { moveAlong, planPath, faceToward } from '../../steering';
import { isGrowing, siteOk, spawnPlant } from '../../plants';
import type { World } from '../../world';
import { findPlantingSite } from '../targets';
import type { Goblin } from '../../state';
import type { UtilityAction } from '../action';
import { gainXp, workSpeed } from '../../goblin/skills';

/** Growing apple plants near the village: a full nursery makes planting less urgent. Cached per tick. */
let cache = { tick: -1, n: 0, s: null as unknown };
function youngNearVillage(w: World): number {
  if (cache.tick === w.s.tick && cache.s === w.s) return cache.n;
  const c = w.s.village.center;
  const n = w.plantHash.query(c, CFG.plants.seedSiteVillageRadius + 2, (p) => p.kind === 'apple_bush' && isGrowing(p)).length;
  cache = { tick: w.s.tick, n, s: w.s };
  return n;
}

const busy = (g: Goblin): number => Math.max(needUrgency(g.needs.hunger), needUrgency(g.needs.thirst), needUrgency(g.needs.energy));

/** Carry an apple core to a good spot near the village and plant it (§8.1, §P2.2). */
export const PlantSeed: UtilityAction = {
  id: 'plant_seed', tags: ['work'], minStage: 'youngling', interruptible: true,
  isAvailable: (g, w) => countItem(g, 'apple_core') > 0 && CFG.plants.seasonMul[w.clock.season] > 0 && g.needs.hunger > 30,
  score: (g, w) => 0.42 * CFG.seasons.plantingMul[w.clock.season] * (1 - busy(g)) * Math.min(1.3, 0.85 + 0.15 * countItem(g, 'apple_core')) / (1 + youngNearVillage(w) / 6),
  start(g, w) {
    const site = findPlantingSite(g, w);
    if (!site || !planPath(w, g, site)) return false;
    g.activity.target = site;
    return true;
  },
  step(g, w) {
    const a = g.activity;
    const site = a.target!;
    if (a.stage === 0) {
      if (dist(g.pos, site) < 0.6) a.path = [];
      if (moveAlong(w, g) !== 'arrived') return 'running';
      if (!siteOk(w, site, CFG.plants.minSeedGap)) return 'failed'; // someone planted here first
      a.stage = 1;
      a.progress = Math.round(CFG.plants.plantTicks / workSpeed(g, 'farming'));
      faceToward(g, site);
    }
    a.progress -= 1;
    if (a.progress > 0) return 'running';
    if (!takeOne(g, (s) => s.type === 'apple_core')) return 'failed';
    spawnPlant(w, 'apple_bush', site, 'seed', g.id);
    g.deeds.planted += 1;
    gainXp(w, g, 'farming', CFG.skills.xp.plant);
    addMood(w, g, 'planted', 3, 1200);
    return 'done';
  },
};
