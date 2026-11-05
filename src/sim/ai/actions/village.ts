/**
 * Communal work (§10.1, P4.3/P4.6): PlanBuilding marks out what the village lacks (a campfire near the center once
 * someone has a roof; fence posts around the core once Gnashers have been seen) or, for a goblin who knows how and has
 * the stone, starts turning its hut into a stone hut. TendFire keeps the campfires fed from the pack or spare stock.
 */
import { CFG } from '../../config';
import { dist, q4 } from '../../../shared/math';
import { addItem, countItem, removeItems } from '../../inventory';
import { needUrgency } from '../../goblin/needs';
import { moveAlong, planPath } from '../../steering';
import { deposit, withdraw } from '../../stockpile';
import { buildingDef, findCommunalSite, isComplete, placeBlueprint, startUpgrade, workSpot } from '../../buildings';
import { fenceSites, ringRadius, wantsFence } from '../../fences';
import { knows } from '../../recipes';
import { knowsFact } from '../../knowledge';
import { homeOf } from './home';
import { spareStock } from '../../crafting';
import { FUELS, addFuel, campfires, needsFuel, type FuelItem } from '../../fire';
import { airTemperature } from '../../temperature';
import { isNight, daylight } from '../../time';
import type { BuildingType, ItemType, Vec2 } from '../../../shared/types';
import type { Building, Goblin } from '../../state';
import type { World } from '../../world';
import type { UtilityAction } from '../action';

const F = CFG.fire;
const isDaytime = (c: Parameters<typeof daylight>[0]): boolean => daylight(c) > 0.5;
export const busy = (g: Goblin): number => Math.max(needUrgency(g.needs.hunger), needUrgency(g.needs.thirst), needUrgency(g.needs.energy));
const othersDoing = (g: Goblin, w: World, id: string, targetId?: number): boolean =>
  w.s.goblins.some((o) => o.id !== g.id && o.activity.action === id && o.activity.status === 'running' && (targetId === undefined || o.activity.targetId === targetId));

/** The communal building the village lacks most, if any. */
export function villageNeed(w: World): BuildingType | null {
  if (!campfires(w).length && w.s.buildings.some((b) => b.type === 'hut' && isComplete(b))) return 'campfire';
  if (wantsFence(w)) return 'fence';
  return null;
}

/** Own finished hut this goblin could turn to stone now (knows how, the stone is spare, by day). */
export function upgradeJob(g: Goblin, w: World): Building | null {
  if (!knows(g, 'stone_hut') || !isDaytime(w.clock)) return null;
  const home = homeOf(g, w);
  if (!home || home.type !== 'hut' || !isComplete(home) || home.ownerId !== g.id) return null;
  const cost = buildingDef('stone_hut')!.cost;
  return Object.entries(cost).every(([t, n]) => spareStock(w, t as ItemType) >= n) ? home : null;
}

const siteFor = (w: World, type: BuildingType): Vec2 | null => (type === 'fence' ? fenceSites(w, 1)[0] ?? null : findCommunalSite(w, type));

export const PlanBuilding: UtilityAction = {
  id: 'plan_building', tags: ['work'], minStage: 'adult', interruptible: true,
  isAvailable: (g, w) => {
    if (upgradeJob(g, w)) return true;
    const need = villageNeed(w);
    return !!need && knows(g, need) && !othersDoing(g, w, 'plan_building');
  },
  score: (g, w) => (upgradeJob(g, w) ? 0.35 : villageNeed(w) === 'fence' ? 0.24 : 0.3) * (1 - busy(g)),
  start(g, w) {
    const up = upgradeJob(g, w);
    if (up) {
      g.activity.targetId = up.id;
      return planPath(w, g, workSpot(w.s, up, g));
    }
    const type = villageNeed(w);
    const site = type && knows(g, type) && siteFor(w, type);
    if (!site) return false;
    g.activity.target = site;
    return planPath(w, g, type === 'fence' ? site : { x: site.x + 0.9, y: site.y + 0.3 });
  },
  step(g, w) {
    if (moveAlong(w, g) !== 'arrived') return 'running';
    w.emit({ type: 'emote', goblinId: g.id, emote: 'idea' });
    if (g.activity.targetId !== null) {
      const up = upgradeJob(g, w);
      if (!up) return 'failed';
      startUpgrade(w, up, 'stone_hut', g.id);
      return 'done';
    }
    const type = villageNeed(w);
    if (!type || !knows(g, type)) return 'done'; // someone else saw to it
    if (type === 'fence') {
      w.s.village.fenceRing ||= ringRadius(w);
      const open = w.s.buildings.filter((b) => b.type === 'fence' && !isComplete(b)).length;
      for (const p of fenceSites(w, Math.min(CFG.fences.perTrip, CFG.fences.maxOpen - open))) placeBlueprint(w, 'fence', p, null);
      return 'done';
    }
    const site = findCommunalSite(w, type);
    if (!site) return 'failed';
    placeBlueprint(w, type, site, null);
    return 'done';
  },
};

/** A campfire low on fuel that nobody else is feeding (nearest first). */
function fireJob(g: Goblin, w: World): Building | null {
  let best: Building | null = null, bd = 40;
  for (const b of campfires(w)) {
    if (!needsFuel(b) || othersDoing(g, w, 'tend_fire', b.id)) continue;
    const d = dist(g.pos, b.pos);
    if (d < bd) { bd = d; best = b; }
  }
  return best;
}
/** Fuel to feed: sticks first (plentiful), then wood; carried before stocked. */
function fuelSource(g: Goblin, w: World): { item: FuelItem; carried: boolean } | null {
  for (const item of FUELS) if (countItem(g, item) > 0) return { item, carried: true };
  for (const item of FUELS) if (spareStock(w, item) >= (item === 'stick' ? 2 : 1)) return { item, carried: false };
  return null;
}
/** Fires are fed for the evening and night, or when it is cold out; by day they may burn low. */
const fireTime = (g: Goblin, w: World): boolean =>
  isNight(w.clock) || w.clock.dayFrac > 0.55 || g.needs.warmth < 60 || airTemperature(w.clock, w.s.weather.kind) < CFG.temperature.comfortMin;

export const TendFire: UtilityAction = {
  id: 'tend_fire', tags: ['work'], minStage: 'adult', interruptible: true,
  isAvailable: (g, w) => fireTime(g, w) && !!fuelSource(g, w) && !!fireJob(g, w),
  score(g, w) {
    const b = fireJob(g, w)!;
    // knowing Gnashers fear fire, a goblin keeps it burning through the night more keenly (§15.1)
    const ward = isNight(w.clock) && knowsFact(g, 'gnashers_fear_fire') ? CFG.knowledge.fireTendMul : 1;
    return (0.18 + 0.3 * (1 - (b.fuel ?? 0) / F.tendBelow)) * (1 - busy(g)) * ward;
  },
  start(g, w) {
    const b = fireJob(g, w);
    if (!b) return false;
    const src = fuelSource(g, w);
    if (!src) return false;
    const a = g.activity;
    a.targetId = b.id;
    if (src.carried) {
      a.stage = 1;
      return planPath(w, g, { x: q4(b.pos.x + 0.8), y: q4(b.pos.y + 0.4) });
    }
    a.stage = 0;
    return planPath(w, g, w.s.village.stockpilePos);
  },
  step(g, w) {
    const a = g.activity;
    const b = w.s.buildings.find((x) => x.id === a.targetId);
    if (!b) return 'failed';
    if (a.stage === 0) {
      if (moveAlong(w, g) !== 'arrived') return 'running';
      const src = fuelSource(g, w);
      if (!src) return 'failed';
      if (!src.carried) {
        const n = withdraw(w.s, src.item, Math.min(F.tendLoad[src.item]!, spareStock(w, src.item)));
        const kept = addItem(g, { type: src.item, qty: n });
        if (kept < n) deposit(w.s, { type: src.item, qty: n - kept });
        if (kept < 1) return 'failed';
      }
      a.stage = 1;
      if (!planPath(w, g, { x: q4(b.pos.x + 0.8), y: q4(b.pos.y + 0.4) })) return 'failed';
    }
    if (a.stage === 1) {
      if (moveAlong(w, g) !== 'arrived') return 'running';
      g.facing = Math.atan2(b.pos.y - g.pos.y, b.pos.x - g.pos.x);
      a.stage = 2;
      a.progress = F.tendTicks;
    }
    if (--a.progress > 0) return 'running';
    let used = 0;
    for (const item of FUELS) {
      const k = addFuel(b, item, Math.min(F.tendLoad[item]!, countItem(g, item)));
      removeItems(g, item, k);
      used += k;
    }
    if (used > 0) w.emit({ type: 'fire_tended', goblinId: g.id, buildingId: b.id, wood: used });
    return used > 0 ? 'done' : 'failed';
  },
};
