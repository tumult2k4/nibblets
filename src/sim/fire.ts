/**
 * Campfires & torches (§11.1, P4.3). A campfire is a contained fire (it never spreads, §10.3) that burns one wood per
 * half-day (sticks a quarter of that), faster in rain, snow and storms. A lit fire warms the air within 5 tiles, lights the night (vision as by
 * day inside its glow) and repels enemies from P4.6. A torch held at night lights 4 tiles, widens night vision ×1.4
 * and burns down by one use per in-game hour.
 */
import { CFG } from './config';
import { dist } from '../shared/math';
import { isNight } from './time';
import { isComplete } from './buildings';
import { weatherAt } from './weather';
import { wearTool } from './tools';
import type { Vec2 } from '../shared/types';
import type { Building, Goblin } from './state';
import type { World } from './world';

const F = CFG.fire;

/** Fires that burn fuel: the campfire, and from P7.3 the hearth (just as contained). */
export const isFireplace = (b: Building): boolean => b.type === 'campfire' || b.type === 'hearth';
export const isLit = (b: Building): boolean => isFireplace(b) && isComplete(b) && (b.fuel ?? 0) > 0;
/** Every campfire and hearth (to tend). */
export const campfires = (w: World): Building[] => w.s.buildings.filter(isFireplace);

/** Nearest lit campfire within `r`, if any. */
export function litFireNear(w: World, pos: Vec2, r: number): Building | null {
  let best: Building | null = null, bd = r;
  for (const b of w.s.buildings) {
    if (!isLit(b)) continue;
    const d = dist(pos, b.pos);
    if (d <= bd) { bd = d; best = b; }
  }
  return best;
}

/** °C a lit fire adds at `pos` (+14 at the hearth, fading to 0 at 5 tiles; fires do not stack). */
export function fireWarmth(w: World, pos: Vec2): number {
  let best = 0;
  for (const b of w.s.buildings) {
    if (!isLit(b)) continue;
    const d = dist(pos, b.pos);
    if (d < F.warmRadius) best = Math.max(best, F.heat * (1 - d / F.warmRadius));
  }
  return best;
}

export const holdsTorch = (g: Goblin): boolean => g.equipped.hand?.type === 'torch';
/** A torch held at night is burning. */
export const torchLit = (g: Goblin, w: World): boolean => holdsTorch(g) && isNight(w.clock);

/** Night vision is as good as day vision inside a fire's glow; a burning torch widens it. */
export function nightVisionMul(g: Goblin, w: World): number {
  const torch = torchLit(g, w) ? F.torchVision : 1;
  return litFireNear(w, g.pos, F.lightRadius) ? Math.max(CFG.goblin.visionDay / CFG.goblin.visionNight, torch) : torch;
}

export type FuelItem = 'wood' | 'stick';
export const FUELS: readonly FuelItem[] = ['stick', 'wood'];

/** Feed up to `n` pieces of `item` (sticks or wood, capped by room). Returns how many were used. */
export function addFuel(b: Building, item: FuelItem, n: number): number {
  const per = F.fuelTicks[item]!;
  const room = Math.floor((F.maxFuel - (b.fuel ?? 0)) / per);
  const k = Math.max(0, Math.min(n, room));
  b.fuel = (b.fuel ?? 0) + k * per;
  return k;
}

/** Wants tending: low on fuel (or out). */
export const needsFuel = (b: Building): boolean => isFireplace(b) && isComplete(b) && (b.fuel ?? 0) < F.tendBelow;

/** §6 step 5b: fires burn down (faster in bad weather); torches burn one use per in-game hour of night. */
export function updateFires(w: World): void {
  const s = w.s;
  if (s.tick % F.every === 0)
    for (const b of s.buildings) {
      if (!isLit(b)) continue;
      const burn = b.type === 'hearth' ? CFG.settlement.hearth.burn : (F.weatherBurn[weatherAt(w, b.pos)] ?? 1);
      b.fuel = Math.max(0, b.fuel! - F.every * burn);
      if (b.fuel === 0) w.emit({ type: 'campfire_out', buildingId: b.id, at: b.pos });
    }
  if (s.tick % CFG.god.hourTicks === 0 && isNight(w.clock))
    for (const g of s.goblins) if (holdsTorch(g)) wearTool(w, g, g.equipped.hand!);
}
