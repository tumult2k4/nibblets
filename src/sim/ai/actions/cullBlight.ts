/**
 * Culling blight (§14.4, P6.3). A goblin who recognises blight (farming ≥ 3, or knows `blight_spreads`) walks to a
 * badly blighted apple bush near the village and pulls it out, roots and all, before it passes the blight on. The
 * wood is left on the ground; watching it done (or doing it) teaches the fact.
 */
import { CFG } from '../../config';
import { clamp, dist } from '../../../shared/math';
import type { Goblin, Plant } from '../../state';
import type { World } from '../../world';
import type { UtilityAction } from '../action';
import { faceToward, moveAlong, planPath } from '../../steering';
import { needUrgency } from '../../goblin/needs';
import { gainXp, skillLevel } from '../../goblin/skills';
import { knowsFact, witnessFact } from '../../knowledge';
import { removePlant } from '../../plants';
import { spawnGroundItem } from '../../groundItems';
import { workMul } from '../../combat';
import { claimedByOther } from '../claims';
import { perTick } from '../memo';

const B = CFG.disasters.blight;

/** Is any bush blighted enough to pull out (asked once a tick, P11.3)? */
const anyBlight = (w: World): boolean => perTick(w, 'blight', () => w.s.plants.some((p) => p.blight >= B.cullAt));

/** Does `g` know a blighted bush when it sees one? */
export const knowsBlight = (g: Goblin): boolean => skillLevel(g, 'farming') >= B.farming || knowsFact(g, 'blight_spreads');

/** The worst-blighted bush in reach that nobody else is already pulling out. */
function sickBush(g: Goblin, w: World): Plant | null {
  let best: Plant | null = null, bs = 0;
  for (const p of w.plantHash.query(g.pos, B.cullRange)) {
    if (p.blight < B.cullAt || dist(p.pos, g.pos) > B.cullRange) continue;
    if (claimedByOther(w, g, 'cull_blight', p.id)) continue;
    const sc = p.blight / (1 + dist(p.pos, g.pos) / 12);
    if (sc > bs) { bs = sc; best = p; }
  }
  return best;
}

const busy = (g: Goblin): number => Math.max(needUrgency(g.needs.hunger), needUrgency(g.needs.thirst), needUrgency(g.needs.energy));

export const CullBlight: UtilityAction = {
  id: 'cull_blight', tags: ['work'], minStage: 'adult', interruptible: true,
  isAvailable: (g, w) => anyBlight(w) && knowsBlight(g) && !!sickBush(g, w),
  score: (g, w) => clamp((0.38 + 0.3 * sickBush(g, w)!.blight) * (1 - busy(g)), 0, 1),
  start(g, w) {
    const p = sickBush(g, w);
    if (!p || !planPath(w, g, p.pos)) return false;
    g.activity.targetId = p.id;
    g.activity.stage = 0;
    return true;
  },
  step(g, w) {
    const a = g.activity;
    const p = w.s.plants.find((x) => x.id === a.targetId);
    if (!p || p.blight <= 0) return 'failed';
    if (a.stage === 0) {
      if (dist(g.pos, p.pos) < 0.9) a.path = [];
      if (moveAlong(w, g) !== 'arrived') return 'running';
      faceToward(g, p.pos);
      a.stage = 1;
      a.progress = 0;
    }
    g.velocity = { x: 0, y: 0 };
    if ((a.progress += workMul(g)) < B.cullTicks) return 'running';
    spawnGroundItem(w, { type: 'wood', qty: CFG.plants.wood.old }, { x: p.pos.x + 0.3, y: p.pos.y });
    gainXp(w, g, 'farming', CFG.skills.xp.plant);
    w.emit({ type: 'blight_culled', goblinId: g.id, plantId: p.id });
    witnessFact(w, 'blight_spreads', p.pos, B.witness * 0.5, g);
    removePlant(w, p);
    return 'done';
  },
};
