import { CFG } from '../../config';
import { dist, q4 } from '../../../shared/math';
import { perDay } from '../../time';
import { needUrgency } from '../../goblin/needs';
import { moveAlong, planPath } from '../../steering';
import { buildingDef, findSite, isComplete, missingMaterials, placeBlueprint, workSpot } from '../../buildings';
import { sleepScore } from './sleepGround';
import { pushGoal } from '../planner';
import { betrothedOf, leaveHome, mateOf } from '../../goblin/family';
import type { Building, Goblin } from '../../state';
import type { World } from '../../world';
import type { UtilityAction } from '../action';
import { quarantined, sickHut } from '../../quarantine';
import { noticeHome } from '../../mischief';
import { sleepTime } from '../../goblin/traits';

const H = CFG.homes;

/** The goblin's home building, if it still stands. */
export const homeOf = (g: Goblin, w: World): Building | undefined =>
  g.homeId === null ? undefined : w.s.buildings.find((b) => b.id === g.homeId);
/** Where it sleeps tonight: home, or under quarantine (P6.5) an empty hut while it is contagious. */
const bedOf = (g: Goblin, w: World): Building | undefined => (quarantined(g, w) ? sickHut(g, w) ?? undefined : homeOf(g, w));

const freeBeds = (b: Building): number => (buildingDef(b.type)?.capacity ?? 0) - b.occupants.length;

/**
 * Nearest hut (finished or planned) with a free bed. A goblin with a mate looks for a bed by its mate first, and
 * otherwise for a hut with room for both of them (P5 balance: couples who sleep apart never have eggs).
 */
function freeHome(g: Goblin, w: World): Building | null {
  const m = mateOf(g, w), mh = m && homeOf(m, w);
  if (mh && mh.id !== g.homeId && freeBeds(mh) > 0) return mh;
  const need = m || betrothedOf(g, w) ? 2 : 1; // a betrothed newcomer looks for a hut with room for two (P10.4)
  let best: Building | null = null, bestD = Infinity;
  for (const b of w.s.buildings) {
    if (b.id === g.homeId || freeBeds(b) < need) continue;
    const d = dist(g.pos, b.pos) * (isComplete(b) ? 1 : 1.3);
    if (d < bestD) { bestD = d; best = b; }
  }
  return best;
}

const openBlueprints = (w: World): number => w.s.buildings.filter((b) => !isComplete(b) && missingMaterials(b).length > 0).length;

/**
 * Needs a (new) home: no home at all, or a mate who lives elsewhere. Of a couple living apart, the one whose hut
 * has no room for the other moves; if both have room, the younger id's hut is kept.
 */
function needsHome(g: Goblin, w: World): boolean {
  if (g.heldByGod) return false;
  const h = homeOf(g, w);
  if (!h) return true;
  const m = mateOf(g, w);
  if (!m || m.homeId === g.homeId) return false;
  const mh = homeOf(m, w);
  if (freeBeds(h) <= 0) return true;
  return !!mh && freeBeds(mh) > 0 && m.id < g.id;
}

/** Move into `b`, giving up any bed elsewhere; a mate living apart comes along if there is room. */
function moveIn(w: World, g: Goblin, b: Building): void {
  if (g.homeId !== b.id) leaveHome(w, g);
  claim(w, g, b);
  const m = mateOf(g, w);
  if (m && m.homeId !== b.id && !m.heldByGod && freeBeds(b) > 0) { leaveHome(w, m); claim(w, m, b); }
}

/** Spot inside a hut for its n-th resident (beds side by side); children curl up in between (P5.4). */
export function bedSpot(b: Building, g: Goblin): { x: number; y: number } {
  const i = b.occupants.indexOf(g.id);
  if (i < 0 && g.lifeStage !== 'adult' && g.lifeStage !== 'elder') return { x: q4(b.pos.x + ((g.id % 3) - 1) * 0.18), y: q4(b.pos.y + 0.12) };
  // P7.3: the longhouse's eight sleep in two rows of four along its length
  // (one moving in heads for the next free bed)
  if (b.type === 'longhouse') {
    const k = (i < 0 ? b.occupants.length : i) % 8;
    return { x: q4(b.pos.x - 0.9 + (k % 4) * 0.6), y: q4(b.pos.y + (k < 4 ? -0.45 : 0.45)) };
  }
  return { x: q4(b.pos.x + (i % 2 === 1 ? 0.28 : -0.28)), y: q4(b.pos.y + (i > 1 ? 0.28 : -0.1)) };
}

export function claim(w: World, g: Goblin, b: Building): void {
  if (!b.occupants.includes(g.id)) b.occupants.push(g.id);
  if (b.ownerId === null) b.ownerId = g.id;
  g.homeId = b.id;
  w.emit({ type: 'home_claimed', goblinId: g.id, buildingId: b.id, at: b.pos });
}

/**
 * §P3.4 ClaimHome: a homeless adult (or one whose mate lives elsewhere) moves into a hut with a free bed (built or planned); if none exists it picks a
 * site and plans a new hut there. Colder weather and later seasons make it more pressing.
 */
export const ClaimHome: UtilityAction = {
  id: 'claim_home', tags: ['work'], minStage: 'adult', interruptible: true,
  isAvailable: (g, w) => needsHome(g, w) && (!!freeHome(g, w) || openBlueprints(w) < H.maxOpenBlueprints),
  cap: (g, w) => (H.claimBase + H.claimSeason[w.clock.season] + 0.4 * needUrgency(g.needs.warmth)) * (1 - needUrgency(Math.min(g.needs.hunger, g.needs.thirst))),
  score: (g, w) => {
    const cold = needUrgency(g.needs.warmth);
    const busy = needUrgency(Math.min(g.needs.hunger, g.needs.thirst));
    return (H.claimBase + H.claimSeason[w.clock.season] + 0.4 * cold) * (1 - busy);
  },
  start(g, w) {
    const b = freeHome(g, w);
    const a = g.activity;
    if (b) {
      a.targetId = b.id;
      a.stage = 0;
      return planPath(w, g, isComplete(b) ? bedSpot(b, g) : workSpot(w.s, b, g));
    }
    const site = findSite(w, 'hut', w.s.village.center);
    if (!site) return false;
    a.targetId = null;
    a.target = site;
    a.stage = 0;
    return planPath(w, g, { x: site.x + 1.4, y: site.y + 0.2 });
  },
  step(g, w) {
    if (moveAlong(w, g) !== 'arrived') return 'running';
    const a = g.activity;
    let b = a.targetId !== null ? w.s.buildings.find((x) => x.id === a.targetId) : undefined;
    if (b && freeBeds(b) <= 0) return 'failed';
    if (!b) {
      // the site may have been taken while walking: look again from here
      const site = a.target && findSite(w, 'hut', w.s.village.center);
      if (!site) return 'failed';
      b = placeBlueprint(w, 'hut', site, g.id);
    }
    moveIn(w, g, b);
    if (!isComplete(b)) pushGoal(g, w, { kind: 'build', buildingId: b.id });
    return 'done';
  },
};

/** Shared sleep loop: lie down (stage 1), sleep (stage 2) restoring energy at `rate`/day until rested in daylight. */
export const SleepHome: UtilityAction = {
  id: 'sleep_home', tags: ['rest'], minStage: 'hatchling', interruptible: true,
  isAvailable: (g, w) => { const b = bedOf(g, w); return g.needs.energy < 97 && !!b && isComplete(b); },
  // a bed beats the ground: preferred whenever sleep is due
  score: (g, w) => sleepScore(g, w) * H.homeSleepPref,
  start(g, w) {
    const b = bedOf(g, w)!;
    g.activity.targetId = b.id;
    g.activity.stage = 0;
    g.activity.progress = 20;
    return planPath(w, g, bedSpot(b, g));
  },
  step(g, w) {
    const a = g.activity;
    const b = w.s.buildings.find((x) => x.id === a.targetId);
    if (!b) return 'failed';
    if (a.stage === 0) {
      if (moveAlong(w, g) !== 'arrived') return 'running';
      a.stage = 1;
    }
    if (a.stage === 1) {
      if (--a.progress > 0) return 'running';
      a.stage = 2;
      noticeHome(w, g, b); // P8.3: something gone, a mushroom in the bed, paint on the walls
      w.emit({ type: 'fell_asleep', goblinId: g.id, at: g.pos });
    }
    g.needs.energy = q4(Math.min(100, g.needs.energy + perDay(CFG.goblin.sleepRestorePerDay.hut)));
    if (g.needs.energy >= CFG.goblin.wakeEnergy && !sleepTime(g, w)) { // P8.7: a night owl's night is the morning
      w.emit({ type: 'woke_up', goblinId: g.id, at: g.pos });
      return 'done';
    }
    return 'running';
  },
};
