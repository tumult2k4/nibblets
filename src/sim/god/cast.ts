/**
 * `god_cast` (§17.8): validation (unlock tier, favor, cooldown in Divine mode; free in Sandbox), payment and
 * dispatch to the power effects, plus a read-only preview for the casting UX (§18.4).
 */
import { CFG } from '../config';
import { clamp } from '../../shared/math';
import type { Vec2 } from '../../shared/types';
import type { World } from '../world';
import { POWER_DEFS, type PowerDef } from './powerDefs';
import { castAppleShower, castBountifulGrowth } from './powers/bounty';
import {
  castClearSky, castFastForward, castGust, castHastenSeason, castRain, castSnowfall, castWarmSun, type CastTarget,
} from './powers/nature';

const EFFECTS: Record<string, (w: World, c: CastTarget) => void> = {
  apple_shower: castAppleShower, bountiful_growth: castBountifulGrowth, warm_sun: castWarmSun,
  rain: castRain, clear_sky: castClearSky, snowfall: castSnowfall, gust: castGust,
  fast_forward: castFastForward, hasten_season: castHastenSeason,
};
/** Powers that go through `god_cast` so far (terraform brushes use `god_power`). */
export const CAST_POWERS = Object.keys(EFFECTS);

export const powerDef = (id: string): PowerDef | undefined => POWER_DEFS.find((p) => p.id === id);

/** Radius actually used: the request clamped to the power's range (its minimum when none was given). */
export function castRadius(def: PowerDef, r?: number): number {
  if (!def.radius) return 0;
  return clamp(Math.round(r ?? def.radius[0]), def.radius[0], def.radius[1]);
}

/** Ticks until the power is ready again (Divine mode only; Sandbox has no cooldowns). */
export function cooldownLeft(w: World, id: string): number {
  if (w.s.god.mode !== 'divine') return 0;
  return Math.max(0, (w.s.god.cooldowns[id] ?? 0) - w.s.tick);
}

/** Why this cast is not allowed now, or null. */
export function castProblem(w: World, id: string, pos: Vec2, to?: Vec2): string | null {
  const def = powerDef(id);
  if (!def || !EFFECTS[id]) return 'unknown_power';
  const s = w.s;
  const oob = (p: Vec2) => p.x < 0 || p.y < 0 || p.x >= s.size.w || p.y >= s.size.h;
  if (def.target !== 'global' && oob(pos)) return 'out_of_bounds';
  if (def.target === 'direction' && (!to || oob(to))) return 'bad_target';
  if ((id === 'fast_forward' || id === 'hasten_season') && (s.god.skipTo ?? 0) > s.tick) return 'busy';
  if (s.god.mode === 'divine') {
    if (s.god.tier < def.tier) return 'locked';
    if (s.god.favor < def.cost) return 'no_favor';
    if (cooldownLeft(w, id) > 0) return 'cooldown';
  }
  return null;
}

export function cast(w: World, id: string, pos: Vec2, radius?: number, to?: Vec2): void {
  const def = powerDef(id)!;
  const g = w.s.god;
  if (g.mode === 'divine') {
    g.favor -= def.cost;
    g.cooldowns[id] = w.s.tick + def.cooldownHours * CFG.god.hourTicks;
  }
  g.alignment += def.alignment;
  EFFECTS[id]!(w, { pos, radius: castRadius(def, radius), ...(to ? { to } : {}) });
}

/** What a cast here would touch (casting UX label and outlines). */
export function castPreview(w: World, id: string, pos: Vec2, radius?: number): { goblins: number[]; plants: number } {
  const def = powerDef(id);
  if (!def || def.target !== 'area') return { goblins: [], plants: 0 };
  const r = castRadius(def, radius);
  const near = (p: Vec2) => Math.hypot(p.x - pos.x, p.y - pos.y) <= r;
  return {
    goblins: w.s.goblins.filter((g) => near(g.pos)).map((g) => g.id),
    plants: w.s.plants.filter((p) => p.kind !== 'flower' && p.stage !== 'dead' && near(p.pos)).length,
  };
}
