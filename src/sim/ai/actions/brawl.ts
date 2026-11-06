/**
 * `Brawl` (§13.1, P8.3): two who loathe each other, or a victim and the thief it knows, come to blows. Not to the
 * death: fists every 20 ticks for 80, 3 hp a blow, never below half health. A friend of either standing by may pull
 * them apart. Afterwards both are sore (mood −10 for a day), think even less of each other, and lose face; a theft
 * between them counts as paid back. The one hit back runs the same action in `stage` 2.
 */
import { CFG } from '../../config';
import { dist, q4 } from '../../../shared/math';
import type { ActionId, Goblin } from '../../state';
import type { World } from '../../world';
import type { UtilityAction } from '../action';
import { faceToward, planPath } from '../../steering';
import { needUrgency } from '../../goblin/needs';
import { isSleeping } from '../../goblin/goblin';
import { opinionOf } from '../../goblin/social';
import { angerAt, blow, brawlEnded, resting } from '../../mischief';
import { reach } from './kindness';
import { once } from '../memo';
import { perTick } from '../memo';

const B = CFG.mischief.brawl, S = CFG.social, TH = CFG.mischief.theft, DAY = CFG.time.dayTicks;
/** What a goblin can be dragged into a brawl from. */
const BUSY: ReadonlySet<ActionId> = new Set(['flee', 'attack', 'defend_village', 'escape_fire', 'extinguish_fire', 'rest_sick', 'bury_dead', 'brawl', 'scatter']);

const pressed = (g: Goblin): boolean => Math.max(needUrgency(g.needs.hunger), needUrgency(g.needs.thirst), needUrgency(g.needs.energy)) > 0.5;
const fit = (g: Goblin, w: World): boolean => !g.heldByGod && !g.airborne && !isSleeping(g) && (g.lifeStage === 'adult' || g.lifeStage === 'elder')
  && g.health.hp > g.health.maxHp * 0.6 && !resting(g, w, 'brawl_rest') && !BUSY.has(g.activity.action);

/** Who has a known, unsettled, recent wrong against them (asked once a tick): only they can be angry without a grudge. */
const wronged = (w: World): Set<number> => perTick(w, 'wronged', () => new Set(w.s.goblins.flatMap((o) => (o.guilt ?? []).filter((gu) => gu.known && !gu.settled && w.s.tick - gu.tick < TH.robbedDays * DAY).map((gu) => gu.victimId))));

/** The one `g` is angriest with, close by and able to fight. */
export const foe = (g: Goblin, w: World): { o: Goblin; anger: number } | null => once(w, g, 'foe', () => foe0(g, w));
function foe0(g: Goblin, w: World): { o: Goblin; anger: number } | null {
  let best: { o: Goblin; anger: number } | null = null;
  for (const o of w.goblinHash.query(g.pos, B.range)) {
    if (o === g || dist(o.pos, g.pos) > B.range) continue;
    const anger = angerAt(g, o, w);
    if (anger >= B.minAnger && (!best || anger > best.anger) && fit(o, w)) best = { o, anger };
  }
  return best;
}

/** A friend of either, close enough to step in. */
function peacemaker(a: Goblin, b: Goblin, w: World): Goblin | null {
  for (const o of w.goblinHash.query(a.pos, B.breakUpRange)) {
    if (o === a || o === b || isSleeping(o) || o.heldByGod || o.lifeStage === 'egg' || o.lifeStage === 'hatchling' || dist(o.pos, a.pos) > B.breakUpRange) continue;
    if (opinionOf(o, a.id) >= S.friend || opinionOf(o, b.id) >= S.friend) return o;
  }
  return null;
}

/** Drag `o` into it, facing `g`. */
function pullIn(o: Goblin, g: Goblin, w: World): void {
  o.activity = { action: 'brawl', status: 'running', startedTick: w.s.tick, targetId: g.id, target: null, path: [], progress: 0, stage: 2 };
  o.velocity = { x: 0, y: 0 };
  o.lastDecisionTick = w.s.tick;
}

export const Brawl: UtilityAction = {
  id: 'brawl', tags: [], minStage: 'adult', interruptible: (g) => g.activity.stage === 0,
  isAvailable: (g, w) => !pressed(g) && fit(g, w) && !!foe(g, w),
  cap: (g, w) => (g.relationships.some((r) => r.opinion < -50) || wronged(w).has(g.id) ? B.score : 0), // no grudge, no anger
  score: (g, w) => q4(B.score * foe(g, w)!.anger),
  start(g, w) {
    const f = foe(g, w);
    if (!f) return false;
    g.activity.targetId = f.o.id;
    g.activity.target = { ...f.o.pos };
    g.activity.stage = 0;
    return dist(g.pos, f.o.pos) <= 1.1 || planPath(w, g, f.o.pos);
  },
  step(g, w) {
    const a = g.activity;
    const o = a.targetId !== null ? w.goblin(a.targetId) : undefined;
    if (!o) return 'failed';
    if (a.stage === 2) { // the one hit back: stands its ground until the other is done
      if (o.activity.action !== 'brawl' || o.activity.targetId !== g.id || o.activity.stage !== 1) return 'done';
      g.velocity = { x: 0, y: 0 };
      faceToward(g, o.pos);
      return 'running';
    }
    if (a.stage === 0) {
      if (!fit(o, w)) return 'failed';
      const r = reach(g, o, w);
      if (r === null) return 'failed';
      if (!r) return 'running';
      a.stage = 1;
      a.progress = 0;
      pullIn(o, g, w);
      w.emit({ type: 'emote', goblinId: g.id, emote: 'anger' });
      w.emit({ type: 'emote', goblinId: o.id, emote: 'anger' });
    }
    if (o.activity.action !== 'brawl' || o.activity.targetId !== g.id) return 'done'; // it got away (a god's hand, a fright)
    g.velocity = { x: 0, y: 0 };
    faceToward(g, o.pos);
    faceToward(o, g.pos);
    if (++a.progress % B.every !== 0) return 'running';
    blow(o);
    blow(g);
    const p = a.progress === B.every && w.rng.chance(B.breakUpChance) ? peacemaker(g, o, w) : null;
    if (!p && a.progress < B.ticks) return 'running';
    brawlEnded(w, g, o, p);
    o.activity.status = 'done';
    return 'done';
  },
};
