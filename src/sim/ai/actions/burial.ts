/**
 * Burial and mourning (§13.7, P6.4). `BuryDead`: an adult carries a body lying in the open to the graveyard, digs,
 * and lays it to rest; family and friends of the dead come first, and the longer a body lies the more it weighs on
 * everyone. `Mourn`: a grieving goblin visits the grave once a day and kneels there a while, which eases the grief.
 */
import { CFG } from '../../config';
import { clamp, dist, q4 } from '../../../shared/math';
import type { Goblin, Grave } from '../../state';
import type { World } from '../../world';
import type { UtilityAction } from '../action';
import { faceToward, moveAlong, planPath } from '../../steering';
import { needUrgency } from '../../goblin/needs';
import { isSick } from '../../disease';
import { workMul } from '../../combat';
import { addMood } from '../../goblin/mood';
import { bury, closeness, easeGrief, graveOf, graveSlot, griefId } from '../../death';

const D = CFG.death;
const DAY = CFG.time.dayTicks;

const pressed = (g: Goblin): number => Math.max(needUrgency(g.needs.hunger), needUrgency(g.needs.thirst), needUrgency(g.needs.energy));

/** A body lying within reach that nobody else is seeing to; family and friends' own dead first. */
function bodyFor(g: Goblin, w: World): Grave | null {
  let best: Grave | null = null, bs = -Infinity;
  for (const gr of w.s.graves) {
    if (gr.state !== 'lying' || dist(gr.pos, g.pos) > D.buryRange) continue;
    if (w.s.goblins.some((o) => o !== g && o.activity.action === 'bury_dead' && o.activity.status === 'running' && o.activity.targetId === gr.id)) continue;
    const k = gr.body ? closeness(g, gr.body) : 0;
    const sc = k + (w.s.tick - gr.tick) / DAY * 0.3 - dist(gr.pos, g.pos) / D.buryRange;
    if (sc > bs) { bs = sc; best = gr; }
  }
  return best;
}

/** Put the body down where the carrier stands (interrupted, or failed). */
export function setDown(w: World, g: Goblin): void {
  const gr = w.s.graves.find((x) => x.carrierId === g.id);
  if (gr && gr.state === 'carried') { gr.state = 'lying'; gr.carrierId = null; gr.pos = { x: q4(g.pos.x + 0.4), y: q4(g.pos.y) }; }
}

export const BuryDead: UtilityAction = {
  id: 'bury_dead', tags: ['work'], minStage: 'adult', interruptible: (g) => g.activity.stage === 0,
  isAvailable: (g, w) => w.s.graves.some((gr) => gr.state === 'lying') && !isSick(g) && g.health.hp > g.health.maxHp * 0.4 && !!bodyFor(g, w),
  score(g, w) {
    const gr = bodyFor(g, w)!;
    const k = gr.body ? closeness(g, gr.body) : 0;
    const days = (w.s.tick - gr.tick) / DAY;
    return clamp((D.buryBase + D.buryKin * k + D.buryWait * days) * (1 - pressed(g)), 0, 1);
  },
  start(g, w) {
    const gr = bodyFor(g, w);
    if (!gr) return false;
    g.activity.targetId = gr.id;
    g.activity.stage = 0;
    return dist(g.pos, gr.pos) < 1 || planPath(w, g, gr.pos);
  },
  step(g, w) {
    const a = g.activity;
    const gr = w.s.graves.find((x) => x.id === a.targetId);
    if (!gr || gr.state === 'buried' || gr.state === 'mound' || (gr.state === 'carried' && gr.carrierId !== g.id)) return 'failed';
    if (a.stage === 0) { // walk to the body
      if (dist(g.pos, gr.pos) < 0.9) a.path = [];
      if (moveAlong(w, g) !== 'arrived') return 'running';
      faceToward(g, gr.pos);
      a.stage = 1;
      a.progress = 40;
    }
    if (a.stage === 1) { // lift it
      g.velocity = { x: 0, y: 0 };
      if (--a.progress > 0) return 'running';
      const slot = graveSlot(w);
      gr.state = 'carried';
      gr.carrierId = g.id;
      if (slot && planPath(w, g, slot)) { a.target = slot; a.stage = 2; }
      else { a.target = { ...gr.pos }; a.stage = 3; a.progress = 0; } // no way to the graveyard: a grave right here
    }
    if (a.stage === 2) { // carry it to the graveyard
      const r = moveAlong(w, g, D.carryMul);
      gr.pos = { x: q4(g.pos.x), y: q4(g.pos.y) };
      if (r !== 'arrived') return 'running';
      a.stage = 3;
      a.progress = 0;
    }
    g.velocity = { x: 0, y: 0 }; // dig, and lay it to rest
    if ((a.progress += workMul(g)) < D.digTicks) return 'running';
    bury(w, gr, a.target ?? g.pos, g.id);
    addMood(w, g, 'laid_to_rest', 4, DAY / 2);
    return 'done';
  },
};

/** The grave `g` most needs to visit today: its deepest grief whose grave is within reach and not yet visited today. */
function graveToMourn(g: Goblin, w: World): Grave | null {
  let best: Grave | null = null, bs = 0;
  for (const m of g.mood.modifiers) {
    if (!m.id.startsWith('grief:') || m.amount > -D.mournMin) continue;
    const deadId = Number(m.id.slice(6));
    if (g.mood.modifiers.some((x) => x.id === `mourned:${deadId}`)) continue;
    const gr = graveOf(w, deadId);
    if (!gr || gr.state === 'carried' || dist(gr.pos, g.pos) > D.mournRange) continue;
    if (-m.amount > bs) { bs = -m.amount; best = gr; }
  }
  return best;
}

export const Mourn: UtilityAction = {
  id: 'mourn', tags: ['social'], minStage: 'youngling', interruptible: (g) => g.activity.stage === 0,
  isAvailable: (g, w) => g.mood.modifiers.some((m) => m.id.startsWith('grief:')) && pressed(g) < 0.5 && !!graveToMourn(g, w),
  score(g, w) {
    const gr = graveToMourn(g, w)!;
    const m = g.mood.modifiers.find((x) => x.id === griefId(gr.goblinId))!;
    return clamp(D.mournBase + -m.amount / 60, 0, 0.7);
  },
  start(g, w) {
    const gr = graveToMourn(g, w);
    if (!gr) return false;
    const spot = { x: q4(gr.pos.x), y: q4(gr.pos.y + 0.7) };
    g.activity.targetId = gr.id;
    g.activity.target = spot;
    g.activity.stage = 0;
    return dist(g.pos, spot) < 0.5 || planPath(w, g, spot);
  },
  step(g, w) {
    const a = g.activity;
    const gr = w.s.graves.find((x) => x.id === a.targetId);
    if (!gr) return 'failed';
    if (a.stage === 0) {
      if (moveAlong(w, g) !== 'arrived') return 'running';
      a.stage = 1;
      a.progress = 0;
      w.emit({ type: 'emote', goblinId: g.id, emote: 'tear' });
    }
    g.velocity = { x: 0, y: 0 };
    faceToward(g, gr.pos);
    if (++a.progress < D.mournTicks) return 'running';
    easeGrief(w, g, gr.goblinId, D.mournEase, D.mournShorten);
    addMood(w, g, `mourned:${gr.goblinId}`, 0, DAY);
    w.emit({ type: 'mourned', goblinId: g.id, deadId: gr.goblinId, at: { ...gr.pos } });
    return 'done';
  },
};
