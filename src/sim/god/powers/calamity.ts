/**
 * Phase 6 wrath (§17.5.4, P6.6): Plague, Blight, Flood and Earthquake. Like the other powers they act through the
 * ordinary systems — disease, blight, the flood's tiles, building damage, terrain, rocks — so they replay exactly.
 */
import { CFG } from '../../config';
import { clamp, dist, q4 } from '../../../shared/math';
import type { World } from '../../world';
import { tileAt, isWalkable } from '../../grid';
import { strikeWith } from '../../disease';
import { blightPlant, canBlight } from '../../blight';
import { raiseWater } from '../../climate';
import { damageBuilding } from '../../storms';
import { spawnGroundItem } from '../../groundItems';
import { removeRock } from '../../ai/actions/mine';
import { startAction } from '../../ai/utility';
import { addMood } from '../../goblin/mood';
import { afterReshape, rebiome } from '../terraform';
import { divineAct } from '../faith';
import { godHarmed } from '../anger';
import type { CastTarget } from './nature';

const M = CFG.miracles;
const DAY = CFG.time.dayTicks, HOUR = CFG.god.hourTicks;

/** The disease a Plague would bring: the one chosen, else the first on the list. */
export const plagueDisease = (option?: string): string => (option && M.plagueDiseases.includes(option) ? option : M.plagueDiseases[0]!);

/** Plague: the chosen disease, showing at once; its kin and friends who see it hold it against the god. */
export function castPlague(w: World, c: CastTarget): void {
  const g = c.targetId !== undefined ? w.goblin(c.targetId) : undefined;
  if (!g) return;
  strikeWith(w, g, plagueDisease(c.option));
  divineAct(w, 'plague', g.pos, g.id);
  godHarmed(w, g, g.pos);
}

/** Blight: every apple bush in the area sickens at once. */
export function castBlight(w: World, c: CastTarget): void {
  for (const p of w.plantHash.query(c.pos, c.radius)) if (canBlight(p) && dist(p.pos, c.pos) <= c.radius) blightPlant(w, p, M.blight, true);
  divineAct(w, 'blight', c.pos, undefined, true, { area: c.radius });
}

/** Flood: the low ground in the area goes under for a day (plants drown slowly, buildings rot, eggs are lost). */
export function castFlood(w: World, c: CastTarget): void {
  const n = raiseWater(w, c.pos, c.radius, M.floodRise, M.floodDays * DAY);
  w.emit({ type: 'god_flood', tiles: n, r: c.radius, at: { ...c.pos } });
  divineAct(w, 'flood', c.pos, undefined, true, { area: c.radius + 6 });
}

/**
 * Earthquake: buildings lose half their hp (the weak ones come down), the ground heaves (less toward the rim, never
 * under a building or into the water), rocks break into piles of stone, and everyone in it is thrown off their feet.
 */
export function castEarthquake(w: World, c: CastTarget): void {
  const s = w.s, r = c.radius;
  divineAct(w, 'earthquake', c.pos, undefined, true, { area: M.quakeSeen });
  w.emit({ type: 'earthquake', r, at: { ...c.pos } });
  for (const b of [...s.buildings]) if (dist(b.pos, c.pos) <= r) damageBuilding(w, b, b.maxHp * M.quakeHp, 'earthquake');
  for (let y = Math.floor(c.pos.y - r); y <= c.pos.y + r; y++)
    for (let x = Math.floor(c.pos.x - r); x <= c.pos.x + r; x++) {
      const t = tileAt(s, x, y), d = Math.hypot(x + 0.5 - c.pos.x, y + 0.5 - c.pos.y);
      if (!t || d > r || t.biome === 'water' || t.occupiedBy !== null) continue;
      const shift = w.rng.range(-1, 1) * M.quakeJitter * (1 - 0.5 * d / r);
      t.height = q4(clamp(t.height + shift, CFG.world.waterLevel + 0.01, 1));
      rebiome(t);
    }
  s.terrainVersion += 1;
  afterReshape(w, c.pos, r + 1);
  for (const rk of [...s.rocks]) {
    if (dist(rk.pos, c.pos) > r) continue;
    let left = rk.stoneLeft;
    for (let k = 0; left > 0; k++) {
      const n = Math.min(M.quakePile, left), a = k * 2.4;
      const p = { x: q4(rk.pos.x + Math.cos(a) * 0.6), y: q4(rk.pos.y + Math.sin(a) * 0.6) };
      spawnGroundItem(w, { type: 'stone', qty: n }, isWalkable(s, Math.floor(p.x), Math.floor(p.y)) ? p : rk.pos);
      left -= n;
    }
    removeRock(w, rk);
  }
  for (const g of s.goblins) {
    if (g.heldByGod || g.airborne || dist(g.pos, c.pos) > r) continue;
    addMood(w, g, 'quake', M.quakeMood, 3 * HOUR);
    startAction(g, w, 'idle');
    g.activity.status = 'done';
    w.emit({ type: 'emote', goblinId: g.id, emote: 'exclaim' });
  }
}
