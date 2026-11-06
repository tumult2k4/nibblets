/**
 * Sling hunting (§8.4, P7.1). An adult with a sling stalks a hopper it can see while the village's food runs short
 * (and now and then anyway, for the pelts and bones), stops within range before the hopper bolts, and throws: the
 * chance to hit grows with combat skill. A hopper that is hit falls and leaves meat, a bone and a pelt, which the
 * hunter gathers up; a miss sends it running, and the hunter follows for a few more throws before giving up.
 */
import { CFG } from '../../config';
import { clamp, dist, q4 } from '../../../shared/math';
import type { Critter, Goblin } from '../../state';
import type { ItemStack } from '../../../shared/types';
import type { World } from '../../world';
import type { UtilityAction } from '../action';
import { faceToward, moveAlong, planPath } from '../../steering';
import { needUrgency } from '../../goblin/needs';
import { gainXp, skillLevel } from '../../goblin/skills';
import { itemDef } from '../../items';
import { gear, wearTool } from '../../tools';
import { huntWant } from '../wants';
import { addItem, canCarry } from '../../inventory';
import { hitCritter } from '../../wildlife';
import { startle } from '../../critters';
import { isNight } from '../../time';

const H = CFG.wildlife.hunt, FINE = 1.5;
const DROPS = new Set(Object.keys(CFG.wildlife.hopperDrops));

/** The sling it carries, if any. */
export const slingOf = (g: Goblin): ItemStack | null => gear(g).find((s) => !!itemDef(s.type).hunt) ?? null;

const busy = (g: Goblin): number => Math.max(needUrgency(g.needs.thirst), needUrgency(g.needs.energy), g.needs.hunger < 15 ? 1 : 0);

/** The nearest hopper in sight that nobody else is after. */
function prey(g: Goblin, w: World): Critter | null {
  let best: Critter | null = null, bd: number = H.sight;
  for (const c of w.s.wildlife) {
    if (c.kind !== 'hopper') continue;
    const d = dist(c.pos, g.pos);
    if (d >= bd || w.s.goblins.some((o) => o !== g && o.activity.action === 'hunt' && o.activity.targetId === c.id)) continue;
    bd = d;
    best = c;
  }
  return best;
}

const able = (g: Goblin, w: World): boolean =>
  !!slingOf(g) && !isNight(w.clock) && !g.health.disease && g.health.hp > g.health.maxHp * 0.5 && canCarry(g, 'meat');

export const Hunt: UtilityAction = {
  id: 'hunt', tags: ['work'], minStage: 'adult', interruptible: true,
  isAvailable: (g, w) => able(g, w) && !!prey(g, w),
  score(g, w) {
    const c = prey(g, w)!;
    const near = 1 - 0.5 * dist(c.pos, g.pos) / H.sight;
    return clamp(H.base * huntWant(g, w) * (0.6 + 0.4 * g.personality.bravery + 0.03 * skillLevel(g, 'combat')) * near * (1 - busy(g)), 0, 1);
  },
  start(g, w) {
    const c = prey(g, w);
    if (!c || !planPath(w, g, c.pos)) return false;
    Object.assign(g.activity, { targetId: c.id, stage: 0, progress: 0, count: 0, target: null });
    return true;
  },
  step(g, w) {
    const a = g.activity;
    if (a.stage === 2) return gather(g, w, a.target!);
    const c = w.s.wildlife.find((x) => x.id === a.targetId);
    const sling = slingOf(g);
    if (!c || !sling) return 'failed';
    if (a.stage === 0) {
      // stalk: stop within range, before the hopper notices (the path is redrawn as it moves)
      if (dist(g.pos, c.pos) > H.range - 0.5) {
        if (++a.progress % 30 === 0 && (!a.path.length || dist(a.path[a.path.length - 1]!, c.pos) > 2) && !planPath(w, g, c.pos)) return 'failed';
        if (moveAlong(w, g) === 'arrived') a.path = [];
        return 'running';
      }
      a.stage = 1;
      a.progress = 0;
      a.path = [];
    }
    g.velocity = { x: 0, y: 0 };
    faceToward(g, c.pos);
    if (++a.progress < H.aimTicks) return 'running';
    if (dist(g.pos, c.pos) > H.range) { a.stage = 0; a.progress = 0; return 'running'; }
    a.count = (a.count ?? 0) + 1;
    const fine = !!sling.fine;
    wearTool(w, g, sling);
    const hit = w.rng.chance(H.hit + H.hitPerLevel * skillLevel(g, 'combat'));
    const at = { ...c.pos };
    const killed = hit && hitCritter(w, c, CFG.wildlife.huntDmg * (fine ? FINE : 1));
    if (hit) gainXp(w, g, 'combat', CFG.skills.xp.hit);
    w.emit({ type: 'critter_hunted', goblinId: g.id, critterId: c.id, kind: c.kind, hit, killed, at });
    if (killed) {
      a.target = at;
      a.stage = 2;
      return planPath(w, g, at) ? 'running' : 'done';
    }
    if (!hit) startle(w, c, g.pos);
    if (a.count >= H.tries) return 'failed';
    a.stage = 0;
    a.progress = 0;
    return 'running';
  },
};

/** Walk to the kill and take what it left. */
function gather(g: Goblin, w: World, at: { x: number; y: number }): 'running' | 'done' {
  if (moveAlong(w, g) !== 'arrived') return 'running';
  for (const it of [...w.s.groundItems]) {
    if (!DROPS.has(it.stack.type) || it.airborne || dist(it.pos, at) > 1.2) continue;
    const got = addItem(g, { ...it.stack });
    it.stack.qty -= got;
    if (it.stack.qty <= 0) w.s.groundItems.splice(w.s.groundItems.indexOf(it), 1);
    if (got > 0) w.emit({ type: 'item_picked', goblinId: g.id, item: it.stack.type, at: { x: q4(g.pos.x), y: q4(g.pos.y) } });
  }
  return 'done';
}
