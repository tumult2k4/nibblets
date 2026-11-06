/**
 * §P3.6 weather responses: SeekShelter (get under a roof, or into shade in a heatwave, and wait it out) and
 * WarmUp (home or any hut, else huddle with someone, else bask in the sun).
 */
import { CFG } from '../../config';
import { dist, q4 } from '../../../shared/math';
import type { ID, Vec2 } from '../../../shared/types';
import { needUrgency } from '../../goblin/needs';
import { moveAlong, planPath } from '../../steering';
import { daylight } from '../../time';
import { buildingDef, isComplete } from '../../buildings';
import { inShade, shelterOf } from '../../temperature';
import { weatherAt } from '../../weather';
import { visionRadius } from '../considerations';
import { bedSpot, homeOf } from './home';
import type { ActionId, Building, Goblin } from '../../state';
import type { World } from '../../world';
import type { UtilityAction } from '../action';
import { litFireNear } from '../../fire';
import { trees } from '../targets';

const SH = CFG.shelter;
const STILL: ReadonlySet<ActionId> = new Set(['idle', 'sleep_ground', 'warm_up', 'seek_shelter', 'eat', 'eat_core']);

/** A guest's spot inside someone else's hut (spread by id so guests don't stack). */
export function guestSpot(b: Building, g: Goblin): Vec2 {
  const a = g.id * 2.39996;
  return { x: q4(b.pos.x + Math.cos(a) * 0.35), y: q4(b.pos.y + Math.sin(a) * 0.35) };
}

const isShelter = (b: Building): boolean => isComplete(b) && !!CFG.temperature.shelter[b.type] && !!buildingDef(b.type);

/** Own finished home, else the nearest finished hut within reach. */
function roof(g: Goblin, w: World): { pos: Vec2; d: number } | null {
  const home = homeOf(g, w);
  if (home && isComplete(home)) return { pos: bedSpot(home, g), d: dist(g.pos, home.pos) };
  let best: Building | null = null, bd: number = SH.guestRadius;
  for (const b of w.s.buildings) {
    const d = dist(g.pos, b.pos);
    if (d < bd && isShelter(b)) { bd = d; best = b; }
  }
  return best ? { pos: guestSpot(best, g), d: bd } : null;
}

function shade(g: Goblin, w: World): Vec2 | null {
  const t = trees(w).nearest(g.pos, SH.shadeRadius, (p) => p.stage === 'mature' || p.stage === 'old');
  if (!t) return null;
  const d = Math.max(0.01, dist(g.pos, t.pos));
  return { x: q4(t.pos.x + ((g.pos.x - t.pos.x) / d) * 0.6), y: q4(t.pos.y + ((g.pos.y - t.pos.y) / d) * 0.6) };
}

const seekWeight = (g: Goblin, w: World): number => SH.seekScore[weatherAt(w, g.pos)] ?? 0;
const covered = (g: Goblin, w: World): boolean => (weatherAt(w, g.pos) === 'heatwave' ? inShade(w, g) : !!shelterOf(w, g));
const running = (g: Goblin, id: ActionId): boolean => g.activity.action === id && g.activity.status === 'running';

function refuge(g: Goblin, w: World): Vec2 | null {
  const r = roof(g, w);
  if (r) return r.pos;
  return weatherAt(w, g.pos) === 'heatwave' ? shade(g, w) : null;
}

/** Interrupt check (§7.2): caught outdoors in a storm or blizzard with somewhere to go. */
export const stormCaught = (g: Goblin, w: World): boolean => {
  const k = weatherAt(w, g.pos);
  return (k === 'storm' || k === 'blizzard') && !running(g, 'seek_shelter') && !shelterOf(w, g);
};

export const SeekShelter: UtilityAction = {
  id: 'seek_shelter', tags: ['rest'], minStage: 'hatchling', interruptible: true,
  isAvailable: (g, w) => seekWeight(g, w) > 0 && (running(g, 'seek_shelter') || (!covered(g, w) && !!refuge(g, w))),
  score(g, w) {
    const busy = needUrgency(Math.min(g.needs.hunger, g.needs.thirst));
    const cold = weatherAt(w, g.pos) === 'heatwave' ? 0 : 0.25 * needUrgency(g.needs.warmth);
    return (seekWeight(g, w) + cold) * (1 - 0.8 * busy);
  },
  start(g, w) {
    const spot = refuge(g, w);
    if (!spot) return false;
    g.activity.target = spot;
    g.activity.stage = 0;
    return planPath(w, g, spot);
  },
  step(g, w) {
    const a = g.activity;
    if (seekWeight(g, w) <= 0) return 'done'; // it cleared up
    if (a.stage === 0) {
      if (moveAlong(w, g) !== 'arrived') return 'running';
      a.stage = 1;
      a.progress = 0;
    }
    g.velocity = { x: 0, y: 0 };
    return ++a.progress > SH.maxWaitTicks ? 'done' : 'running';
  },
};

/** Best way to warm up from here: a roof, a huddle partner (friends first), or the sun. */
function warmSpot(g: Goblin, w: World): { pos: Vec2; partner: ID | null } | null {
  let best: { pos: Vec2; partner: ID | null } | null = null, bc = Infinity;
  const r = roof(g, w);
  if (r) { best = { pos: r.pos, partner: null }; bc = r.d; }
  const vr = visionRadius(g, w);
  // a lit campfire (P4.3) is the cosiest spot: sit a step from the flames
  const fire = litFireNear(w, g.pos, vr * 2);
  if (fire) {
    const d = Math.max(0.01, dist(g.pos, fire.pos));
    const c = d + 1;
    if (c < bc) { bc = c; best = { pos: { x: q4(fire.pos.x + ((g.pos.x - fire.pos.x) / d) * 1.3), y: q4(fire.pos.y + ((g.pos.y - fire.pos.y) / d) * 1.3) }, partner: null }; }
  }
  for (const o of w.goblinHash.query(g.pos, vr)) {
    if (o.id === g.id || o.airborne || o.heldByGod || !STILL.has(o.activity.action) || Math.hypot(o.velocity.x, o.velocity.y) > 0.01) continue;
    const friend = (g.relationships.find((x) => x.targetId === o.id)?.opinion ?? 0) > 30;
    const c = dist(g.pos, o.pos) * (friend ? 0.6 : 1) + 8;
    if (c < bc) {
      const d = Math.max(0.01, dist(g.pos, o.pos));
      bc = c;
      best = { pos: { x: q4(o.pos.x + ((g.pos.x - o.pos.x) / d) * 0.5), y: q4(o.pos.y + ((g.pos.y - o.pos.y) / d) * 0.5) }, partner: o.id };
    }
  }
  const k = weatherAt(w, g.pos);
  if (bc > 10 && daylight(w.clock) > 0.5 && (k === 'clear' || k === 'heatwave')) best = { pos: { x: g.pos.x, y: g.pos.y }, partner: null };
  return best;
}

export const WarmUp: UtilityAction = {
  id: 'warm_up', tags: ['rest'], minStage: 'hatchling', interruptible: true,
  isAvailable: (g, w) => (g.needs.warmth < SH.warmUpBelow || (running(g, 'warm_up') && g.needs.warmth < SH.warmUpDoneAt)) && (running(g, 'warm_up') || !!warmSpot(g, w)),
  score: (g) => 0.12 + 1.1 * needUrgency(g.needs.warmth),
  start(g, w) {
    const s = warmSpot(g, w);
    if (!s) return false;
    g.activity.target = s.pos;
    g.activity.targetId = s.partner;
    g.activity.stage = 0;
    return planPath(w, g, s.pos);
  },
  step(g, w) {
    const a = g.activity;
    if (g.needs.warmth >= SH.warmUpDoneAt) return 'done';
    const p = a.targetId !== null ? w.goblin(a.targetId) : undefined;
    if (a.targetId !== null && (!p || dist(p.pos, a.target!) > 1.5)) return 'failed'; // partner wandered off
    if (a.stage === 0) {
      if (moveAlong(w, g) !== 'arrived') return 'running';
      a.stage = 1;
      a.progress = 0;
    }
    g.velocity = { x: 0, y: 0 };
    return ++a.progress > SH.warmUpMaxTicks ? 'done' : 'running';
  },
};
