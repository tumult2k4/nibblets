/**
 * Nature powers (§17.5.2) and the weather gift Warm Sun: local weather cells, Clear Sky, Gust and the time skips.
 * Pure sim code: every effect goes through ordinary systems (cells, wetness, snow, mood), so it replays exactly.
 */
import { CFG } from '../../config';
import { q4 } from '../../../shared/math';
import type { Vec2 } from '../../../shared/types';
import type { World } from '../../world';
import { tileOf, isWalkable } from '../../grid';
import { addCell, setWeather } from '../../weather';
import { airTemperature, dryOff } from '../../temperature';
import { addMood } from '../../goblin/mood';
import { startAction } from '../../ai/utility';
import { applyReaction, divineAct, reactionFor } from '../faith';

const PW = CFG.powers;
/** `option`: the Plague's disease, the clan stock Bring Forth draws on (P6.6) */
export interface CastTarget { pos: Vec2; radius: number; to?: Vec2; targetId?: number; option?: string }

const cellTicks = (): number => PW.cellHours * CFG.god.hourTicks;
const inside = (p: Vec2, c: CastTarget): boolean => Math.hypot(p.x - c.pos.x, p.y - c.pos.y) <= c.radius;

export function castRain(w: World, c: CastTarget): void {
  addCell(w, 'rain', c.pos, c.radius, cellTicks());
  divineAct(w, 'rain', c.pos, undefined, true, { area: c.radius });
}

/** Snow out of season (spring/summer) is a big omen: more faith, some fear. */
export function castSnowfall(w: World, c: CastTarget): void {
  const chill = Math.min(0, PW.snowCellAir - airTemperature(w.clock, 'snow'));
  addCell(w, 'snow', c.pos, c.radius, cellTicks(), chill);
  const omen = w.clock.season === 'spring' || w.clock.season === 'summer';
  divineAct(w, 'snowfall', c.pos, undefined, true, { area: c.radius, ...(omen ? { reaction: { faith: 6, fear: 4 } } : {}) });
}

/** Warm Sun: +15 °C sunshine for 2 h; dries everyone inside at once (and keeps drying them, see updateWetness). */
export function castWarmSun(w: World, c: CastTarget): void {
  addCell(w, 'clear', c.pos, c.radius, cellTicks(), PW.warmSunDeg);
  for (const g of w.s.goblins) if (inside(g.pos, c)) dryOff(g);
  divineAct(w, 'warm_sun', c.pos, undefined, true, { area: c.radius });
}

export function castClearSky(w: World, c: CastTarget): void {
  setWeather(w, 'clear');
  divineAct(w, 'clear_sky', c.pos, undefined, true, { area: Infinity });
}

/** Gust: a wind blast along the dragged line knocks goblins and loose items a few steps down-wind. */
export function castGust(w: World, c: CastTarget): void {
  const to = c.to ?? c.pos;
  let dx = to.x - c.pos.x, dy = to.y - c.pos.y;
  const len = Math.min(PW.gustMaxLen, Math.hypot(dx, dy));
  if (len < 0.5) return;
  const l0 = Math.hypot(dx, dy);
  dx /= l0; dy /= l0;
  const along = (p: Vec2): boolean => {
    const t = (p.x - c.pos.x) * dx + (p.y - c.pos.y) * dy;
    return t >= 0 && t <= len && Math.abs((p.x - c.pos.x) * dy - (p.y - c.pos.y) * dx) <= PW.gustWidth;
  };
  const push = (p: Vec2): Vec2 => {
    let out = { x: p.x, y: p.y };
    for (let s = 0.25; s <= PW.gustPush; s += 0.25) {
      const q = { x: q4(p.x + dx * s), y: q4(p.y + dy * s) };
      const t = tileOf(q);
      if (!isWalkable(w.s, t.x, t.y)) break;
      out = q;
    }
    return out;
  };
  for (const g of w.s.goblins) {
    if (g.heldByGod || g.airborne || !along(g.pos)) continue;
    g.pos = push(g.pos);
    addMood(w, g, 'gusted', PW.gustMood, CFG.god.hourTicks);
    applyReaction(g, reactionFor('gust', g, true));
    startAction(g, w, 'idle');
    g.activity.status = 'done';
  }
  for (const it of w.s.groundItems) if (!it.airborne && it.reservedBy === null && along(it.pos)) it.pos = push(it.pos);
  divineAct(w, 'gust', { x: c.pos.x + dx * len * 0.5, y: c.pos.y + dy * len * 0.5 }, undefined, false);
}

/** Next dawn or dusk, whichever comes first. */
export function nextDawnOrDusk(tick: number): number {
  const D = CFG.time.dayTicks;
  const day = Math.floor(tick / D), frac = (tick % D) / D;
  const dusk = Math.round(CFG.time.phases.day * D);
  return frac * D < dusk ? day * D + dusk : (day + 1) * D;
}

export function nextSeasonStart(tick: number): number {
  const len = CFG.time.daysPerSeason * CFG.time.dayTicks;
  return (Math.floor(tick / len) + 1) * len;
}

export function castFastForward(w: World): void {
  w.s.god.skipTo = nextDawnOrDusk(w.s.tick);
}

export function castHastenSeason(w: World): void {
  w.s.god.skipTo = nextSeasonStart(w.s.tick);
}
