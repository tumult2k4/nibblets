/**
 * Communal work (§10.1, P4.3/P4.6): PlanBuilding marks out what the village lacks (a campfire near the center once
 * someone has a roof; fence posts around the core once Gnashers have been seen; P5.6: a grinding stone, a drying rack
 * per six goblins and a storage pit per eight; P5.7: a workbench, then gates in the fence and a watchtower inside
 * it — each once someone knows how) or, for a goblin who knows how and has the
 * stone, starts turning its hut into a stone hut. TendFire keeps the campfires fed from the pack or spare stock.
 */
import { CFG } from '../../config';
import { foodStores } from '../../spoilage';
import { dist, q4 } from '../../../shared/math';
import { addItem, countItem, removeItems } from '../../inventory';
import { needUrgency } from '../../goblin/needs';
import { moveAlong, planPath } from '../../steering';
import { deposit, withdraw } from '../../stockpile';
import { buildingDef, findCommunalSite, findSite, isComplete, placeBlueprint, startUpgrade, workSpot } from '../../buildings';
import { hearthOf, hearthSite, isHome, wantsLonghouse, wantsNursery, wantsWell } from '../../settlement';
import { fenceSites, ringRadius, wantsFence } from '../../fences';
import { knows } from '../../recipes';
import { knowsFact } from '../../knowledge';
import { gateSite, placeGate, towerSite, wantsGate, wantsTower } from '../../watch';
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

const PR = CFG.preserve;
/** Stations the village keeps (P5.6 preservation, P5.7 workbench, P7.2 kiln); they sit a little further out than the fire. */
const STATIONS = ['grinding_stone', 'drying_rack', 'storage_pit', 'workbench', 'kiln'] as const;
const STATION_RADIUS = CFG.workbench.radius;

let needCache = { tick: -1, w: null as World | null, out: [] as BuildingType[] };
/** What the village lacks, most pressing first (cached per tick). */
export function villageNeeds(w: World): BuildingType[] {
  if (needCache.tick === w.s.tick && needCache.w === w) return needCache.out;
  const out: BuildingType[] = [];
  needCache = { tick: w.s.tick, w, out };
  // any finished home counts (P7.2 balance: a village that had turned every hut to stone stopped planning stations)
  const roofed = w.s.buildings.some((b) => (buildingDef(b.type)?.capacity ?? 0) > 0 && isComplete(b));
  const fire = campfires(w).some((b) => b.type === 'campfire');
  if (!fire && roofed) out.push('campfire');
  if (wantsFence(w)) out.push('fence');
  if (wantsGate(w)) out.push('gate');
  if (wantsTower(w)) out.push('watchtower');
  if (!roofed || !fire) return out;
  const pop = w.s.goblins.length;
  const want = { grinding_stone: 1, drying_rack: Math.ceil(pop / PR.perRack), storage_pit: Math.ceil(pop / PR.perPit), workbench: 1, kiln: 1 };
  for (const t of STATIONS) {
    const mine = w.s.buildings.filter((b) => b.type === t);
    if (mine.length < want[t] && !mine.some((b) => !isComplete(b)) && hasSite(w, t)) out.push(t);
  }
  // P7.3: a well when the water is a walk away, a nursery once there are eggs or couples, a longhouse when the huts fill
  if (wantsWell(w.s) && hasSite(w, 'well')) out.push('well');
  if (wantsNursery(w.s) && hasSite(w, 'nursery')) out.push('nursery');
  if (wantsLonghouse(w.s) && hasSite(w, 'longhouse')) out.push('longhouse');
  return out;
}

let siteCache = { ver: -1, w: null as World | null, ok: new Map<BuildingType, boolean>() };
/** Is there room for one more `type` near the center? (Cached until the map changes: a need with no site would
 * leave the planner standing idle all day.) */
function hasSite(w: World, type: BuildingType): boolean {
  if (siteCache.ver !== w.s.terrainVersion || siteCache.w !== w) siteCache = { ver: w.s.terrainVersion, w, ok: new Map() };
  let ok = siteCache.ok.get(type);
  if (ok === undefined) siteCache.ok.set(type, (ok = !!siteFor(w, type)));
  return ok;
}

/** The communal building the village lacks most (that `g` knows how to make, if given). */
export function villageNeed(w: World, g?: Goblin): BuildingType | null {
  return villageNeeds(w).find((t) => !g || knows(g, t)) ?? null;
}

/** Own finished hut this goblin could turn to stone now (knows how, the stone is spare, by day). */
export function upgradeJob(g: Goblin, w: World): Building | null {
  if (!knows(g, 'stone_hut') || !isDaytime(w.clock)) return null;
  const home = homeOf(g, w);
  if (!home || home.type !== 'hut' || !isComplete(home) || home.ownerId !== g.id) return null;
  const cost = buildingDef('stone_hut')!.cost;
  return Object.entries(cost).every(([t, n]) => spareStock(w, t as ItemType) >= n) ? home : null;
}

/** Own finished home with no hearth yet, for a goblin who knows how (by day; one hearth going up at a time). */
export function hearthJob(g: Goblin, w: World): { home: Building; site: Vec2 } | null {
  if (!knows(g, 'hearth') || !isDaytime(w.clock)) return null;
  const home = homeOf(g, w);
  if (!home || !isHome(home) || !isComplete(home) || !home.occupants.includes(g.id) || hearthOf(w.s, home)) return null;
  if (w.s.buildings.some((b) => b.type === 'hearth' && !isComplete(b)) || foodStores(w.s).days < CFG.settlement.hearth.planDays) return null;
  const site = hearthSite(w, home);
  return site ? { home, site } : null;
}

function siteFor(w: World, type: BuildingType): Vec2 | null {
  if (type === 'fence') return fenceSites(w, 1)[0] ?? null;
  if (type === 'longhouse') return findSite(w, type, w.s.village.center);
  if (type === 'gate') return gateSite(w);
  if (type === 'watchtower') return towerSite(w);
  return findCommunalSite(w, type, (STATIONS as readonly string[]).includes(type) ? STATION_RADIUS : undefined);
}
const onRing = (t: BuildingType | null): boolean => t === 'fence' || t === 'gate';

export const PlanBuilding: UtilityAction = {
  id: 'plan_building', tags: ['work'], minStage: 'adult', interruptible: true,
  isAvailable: (g, w) => {
    if (upgradeJob(g, w) || hearthJob(g, w)) return true;
    return !!villageNeed(w, g) && !othersDoing(g, w, 'plan_building');
  },
  score: (g, w) => (upgradeJob(g, w) ? 0.35 : hearthJob(g, w) ? CFG.settlement.hearth.planScore : villageNeed(w, g) === 'fence' ? 0.24 : 0.3) * (1 - busy(g)),
  start(g, w) {
    const up = upgradeJob(g, w);
    if (up) {
      g.activity.targetId = up.id;
      return planPath(w, g, workSpot(w.s, up, g));
    }
    const h = hearthJob(g, w); // P7.3: a hearth against its own home's wall
    if (h) {
      Object.assign(g.activity, { targetId: h.home.id, target: h.site, count: 1 });
      return planPath(w, g, { x: h.site.x + 0.5, y: h.site.y + 1.2 });
    }
    const type = villageNeed(w, g);
    const site = type && siteFor(w, type);
    if (!site) return false;
    g.activity.target = site;
    return planPath(w, g, onRing(type) ? site : { x: site.x + 0.9, y: site.y + 0.3 });
  },
  step(g, w) {
    if (moveAlong(w, g) !== 'arrived') return 'running';
    needCache.tick = -1; // look again: someone may have just marked it out
    w.emit({ type: 'emote', goblinId: g.id, emote: 'idea' });
    if (g.activity.count === 1) {
      const h = hearthJob(g, w);
      if (!h) return 'failed';
      const b = placeBlueprint(w, 'hearth', h.site, g.id);
      b.data = { home: h.home.id };
      return 'done';
    }
    if (g.activity.targetId !== null) {
      const up = upgradeJob(g, w);
      if (!up) return 'failed';
      startUpgrade(w, up, 'stone_hut', g.id);
      return 'done';
    }
    const type = villageNeed(w, g);
    if (!type) return 'done'; // someone else saw to it
    if (type === 'fence') {
      w.s.village.fenceRing ||= ringRadius(w);
      const open = w.s.buildings.filter((b) => b.type === 'fence' && !isComplete(b)).length;
      for (const p of fenceSites(w, Math.min(CFG.fences.perTrip, CFG.fences.maxOpen - open))) placeBlueprint(w, 'fence', p, null);
      return 'done';
    }
    const site = siteFor(w, type);
    if (!site) return 'failed';
    if (type === 'gate') placeGate(w, site);
    else placeBlueprint(w, type, site, null);
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
