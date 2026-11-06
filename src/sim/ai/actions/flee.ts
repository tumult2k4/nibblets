/**
 * §P4.5 `Flee` and `Guard`. Fleeing sprints (×1.15) for a roof (home first, then any hut), else a lit fire, else simply
 * away from the threat, then hides until nothing threatening is within 9 tiles. Children always run; adults run when
 * they panic (see fight.ts) or, unarmed and timid, when safety sinks. `Guard`: armed adults stand watch at night by the
 * fire or the stockpile (about one in five adults), facing out; an enemy in sight turns them to `Attack`. P5.7: one
 * more keeps watch up each watchtower (no weapon needed), and children run home when the tower warns.
 */
import { CFG } from '../../config';
import { dist, q4 } from '../../../shared/math';
import type { Vec2 } from '../../../shared/types';
import { moveAlong, planPath } from '../../steering';
import { isWalkable } from '../../grid';
import { isComplete } from '../../buildings';
import { litFireNear, campfires, isLit } from '../../fire';
import { shelterOf } from '../../temperature';
import { bestWeapon } from '../../tools';
import { knowsFact } from '../../knowledge';
import { daylight } from '../../time';
import { threatsNear } from '../../combat';
import { bedSpot, homeOf } from './home';
import { freeTower, warned } from '../../watch';
import { guestSpot } from './shelter';
import { DANGER, kinAttacker, panics, visibleThreat } from './fight';
import type { Building, Goblin } from '../../state';
import type { World } from '../../world';
import { braveryOf } from '../../adorn';
import type { UtilityAction } from '../action';
import { cowardice } from '../../mischief';
import { onWatch } from '../../leadership';

const C = CFG.combat;
const child = (g: Goblin): boolean => g.lifeStage === 'hatchling' || g.lifeStage === 'youngling';

/** Interrupt check (§7.2): a threat in sight while doing something else. */
export const dangerCaught = (g: Goblin, w: World): boolean =>
  w.s.enemies.length > 0 && !DANGER.has(g.activity.action) && !!visibleThreat(g, w);

function refuge(g: Goblin, w: World, from: Vec2): Vec2 | null {
  const home = homeOf(g, w);
  if (home && isComplete(home) && dist(g.pos, home.pos) < C.defendRange) return bedSpot(home, g);
  let best: Building | null = null, bd: number = C.defendRange;
  for (const b of w.s.buildings) {
    const d = dist(g.pos, b.pos);
    if (b.type !== 'campfire' && isComplete(b) && d < bd && CFG.temperature.shelter[b.type]) { bd = d; best = b; }
  }
  if (best) return guestSpot(best, g);
  // only those who know Gnashers fear fire run to one (§15.1)
  const fire = knowsFact(g, 'gnashers_fear_fire') ? litFireNear(w, g.pos, C.defendRange) : undefined;
  if (fire) {
    const d = Math.max(0.01, dist(from, fire.pos));
    return { x: q4(fire.pos.x + ((fire.pos.x - from.x) / d) * 1.3), y: q4(fire.pos.y + ((fire.pos.y - from.y) / d) * 1.3) };
  }
  // nowhere to hide: run straight away from it
  const d = Math.max(0.01, dist(from, g.pos));
  for (const k of [1, 0.6, 0.3]) {
    const p = { x: q4(g.pos.x + ((g.pos.x - from.x) / d) * C.safeDist * k), y: q4(g.pos.y + ((g.pos.y - from.y) / d) * C.safeDist * k) };
    if (isWalkable(w.s, Math.floor(p.x), Math.floor(p.y))) return p;
  }
  return null;
}

/** After a warning from the tower (P5.7), children out in the open run for home. */
const warnedOut = (g: Goblin, w: World): boolean => child(g) && warned(w) && !!w.s.threat.warnAt && !shelterOf(w, g);

export const Flee: UtilityAction = {
  id: 'flee', tags: ['danger'], minStage: 'hatchling', interruptible: (g) => g.activity.stage === 1,
  isAvailable: (g, w) => (!!visibleThreat(g, w) && !kinAttacker(g, w)) || warnedOut(g, w),
  score(g, w) {
    if (child(g) || panics(g, w)) return 1.1;
    const fear = 1 - g.needs.safety / 100;
    return (0.25 + 0.75 * fear) * (1 - braveryOf(g, w)) * (bestWeapon(g) ? 0.5 : 1);
  },
  start(g, w) {
    const e = visibleThreat(g, w);
    const from = e?.pos ?? (warnedOut(g, w) ? w.s.threat.warnAt : undefined);
    if (!from) return false;
    const spot = refuge(g, w, from);
    if (!spot) return false;
    cowardice(w, g); // P8.3: armed and running while others fight
    g.activity.target = spot;
    g.activity.targetId = e?.id ?? null;
    g.activity.stage = 0;
    w.emit({ type: 'emote', goblinId: g.id, emote: 'sweat' });
    return planPath(w, g, spot);
  },
  step(g, w) {
    const a = g.activity;
    if (w.s.tick - a.startedTick > C.fleeTicks) return 'done';
    const near = threatsNear(w, g.pos, C.safeDist);
    if (a.stage === 0) {
      if (moveAlong(w, g, C.sprintMul) !== 'arrived') return 'running';
      a.stage = 1;
    }
    g.velocity = { x: 0, y: 0 };
    if (!near.length) return 'done';
    // caught in the open with it still close: keep running
    if (!shelterOf(w, g) && !litFireNear(w, g.pos, 2)) {
      const spot = refuge(g, w, near[0]!.pos);
      if (!spot || !planPath(w, g, spot)) return 'done';
      a.stage = 0;
    }
    return 'running';
  },
};

/** The watch post: up a free watchtower (P5.7), else around the lit fire (else the stockpile), spread by id. */
function post(g: Goblin, w: World): Vec2 {
  const tower = freeTower(g, w);
  g.activity.targetId = tower?.id ?? null;
  if (tower) return { ...tower.pos };
  const fire = campfires(w).find((b) => b.type === 'campfire' && isLit(b));
  const c = fire?.pos ?? w.s.village.stockpilePos;
  const ang = g.id * 2.39996;
  return { x: q4(c.x + Math.cos(ang) * C.guardRadius), y: q4(c.y + Math.sin(ang) * C.guardRadius) };
}
const evening = (w: World): boolean => daylight(w.clock) < 0.5 || w.clock.dayFrac > 0.62;
/** Room for one more on watch: about one adult in five, plus whoever keeps the tower. */
function guardSlots(g: Goblin, w: World): boolean {
  const adults = w.s.goblins.filter((o) => o.lifeStage === 'adult').length;
  const on = w.s.goblins.filter((o) => o !== g && o.activity.action === 'guard' && o.activity.status === 'running').length;
  return on < Math.max(1, Math.round(adults * C.guardShare)) || !!freeTower(g, w);
}

export const Guard: UtilityAction = {
  id: 'guard', tags: ['danger'], minStage: 'adult', interruptible: true,
  // a lookout up the tower needs sharp eyes, not a spear
  isAvailable: (g, w) => evening(w) && (!!bestWeapon(g) || !!freeTower(g, w)) && g.needs.energy > 35 && g.needs.hunger > 30 && g.needs.thirst > 30
    && (g.activity.action === 'guard' || onWatch(g, w) || guardSlots(g, w)),
  // P8.4: tonight's watch under a brave chief stands guard first, and till morning
  score: (g, w) => 0.22 + (w.s.enemies.some((e) => e.seen) ? 0.25 : 0) + (freeTower(g, w) ? 0.08 : 0) + (onWatch(g, w) ? CFG.leadership.watch.scoreBonus : 0),
  start(g, w) {
    g.activity.target = post(g, w);
    g.activity.stage = 0;
    return planPath(w, g, g.activity.target);
  },
  step(g, w) {
    const a = g.activity;
    if (!evening(w) || g.needs.energy < 25 || g.needs.hunger < 25 || g.needs.thirst < 25 || (w.s.tick - a.startedTick > C.guardTicks && !onWatch(g, w))) return 'done';
    if (a.stage === 0) {
      if (moveAlong(w, g) !== 'arrived') return 'running';
      a.stage = 1;
    }
    g.velocity = { x: 0, y: 0 };
    const c = w.s.village.center;
    g.facing = q4(Math.atan2(g.pos.y - c.y, g.pos.x - c.x)); // look outward
    return 'running';
  },
};
