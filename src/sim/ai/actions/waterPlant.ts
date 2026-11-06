import { CFG } from '../../config';
import { gear, wearTool } from '../../tools';
import { dist, q4 } from '../../../shared/math';
import { needUrgency } from '../../goblin/needs';
import { moveAlong, planPath, faceToward } from '../../steering';
import { findDryPlant, nearestShores } from '../targets';
import { wellSpot, wells } from '../../settlement';
import type { UtilityAction } from '../action';
import type { Goblin } from '../../state';
import { gainXp, skillLevel, skillSpeed } from '../../goblin/skills';

/**
 * §P2.2: visit water first (cupped hands, "wet hands" for 600 ticks), then splash a dry young plant.
 * Stages: 0 → shore, 1 → scoop, 2 → plant (fails if the hands dried), 3 → splash.
 */
export const WaterPlant: UtilityAction = {
  id: 'water_plant', tags: ['work'], minStage: 'youngling', interruptible: true,
  isAvailable: (g, w) => CFG.plants.seasonMul[w.clock.season] > 0 && g.needs.thirst > 25 && g.needs.hunger > 25,
  score(g, w) {
    const p = findDryPlant(g, w);
    if (!p) return 0;
    const own = p.plantedBy === g.id ? 1.2 : 1;
    return 0.38 * own * (1 - p.hydration / CFG.plants.waterBelow) * (1 - needUrgency(Math.min(g.needs.hunger, g.needs.thirst)));
  },
  start(g, w) {
    const p = findDryPlant(g, w);
    if (!p) return false;
    g.activity.targetId = p.id;
    const shore = [...wells(w.s).map((b) => wellSpot(b, g.id)), ...nearestShores(g, w, 3)].sort((a, b) => dist(a, g.pos) - dist(b, g.pos)).find((s) => planPath(w, g, s));
    if (!shore) return false;
    g.activity.target = shore;
    return true;
  },
  step(g, w) {
    const a = g.activity;
    const p = w.s.plants.find((x) => x.id === a.targetId);
    if (!p) return 'failed';
    switch (a.stage) {
      case 0:
        if (moveAlong(w, g) !== 'arrived') return 'running';
        a.stage = 1;
        a.progress = Math.round(CFG.plants.waterTicks / skillSpeed(g, 'farming'));
        return 'running';
      case 1:
        if (--a.progress > 0) return 'running';
        a.progress = w.s.tick; // wet since
        if (!planPath(w, g, p.pos)) return 'failed';
        a.stage = 2;
        return 'running';
      case 2:
        if (!bucketOf(g) && w.s.tick - a.progress > CFG.plants.wetHandsTicks) return 'failed'; // hands dried on the way (a bucket keeps it)
        if (dist(g.pos, p.pos) < 0.9) a.path = [];
        if (moveAlong(w, g) !== 'arrived') return 'running';
        faceToward(g, p.pos);
        a.stage = 3;
        a.progress = Math.round(CFG.plants.waterTicks / skillSpeed(g, 'farming'));
        return 'running';
      default:
        if (--a.progress > 0) return 'running';
      {
        const add = CFG.plants.waterHydration * (1 + CFG.skills.waterPerLevel * skillLevel(g, 'farming'));
        p.hydration = q4(Math.min(1, p.hydration + add));
        gainXp(w, g, 'farming', CFG.skills.xp.water);
        w.emit({ type: 'plant_watered', goblinId: g.id, plantId: p.id, at: p.pos });
        // P7.2: a bucket holds water for four more thirsty plants close by
        const bucket = bucketOf(g);
        if (!bucket) return 'done';
        const more = w.plantHash.query(p.pos, 3, (o) => o !== p && o.hydration < CFG.plants.waterBelow && o.stage !== 'mature' && o.stage !== 'old').slice(0, CFG.economy.bucket.waterMul - 1);
        for (const o of more) {
          o.hydration = q4(Math.min(1, o.hydration + add));
          w.emit({ type: 'plant_watered', goblinId: g.id, plantId: o.id, at: o.pos });
        }
        wearTool(w, g, bucket);
        return 'done';
      }
    }
  },
};

/** A bucket carried (P7.2). */
export const bucketOf = (g: Goblin) => gear(g).find((s) => s.type === 'bucket') ?? null;
