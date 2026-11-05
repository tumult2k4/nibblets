/**
 * Wrath powers (§17.5.4, P4.8): Lightning Bolt, Swarm, Curse, Summon Gnashers (or a Bramblebeast) and Meteor.
 * All go through ordinary systems (damage, death, zones, mood, spawning, terrain) so they replay exactly. Ignition and
 * the meteor's ring of fire spread as wildfire (P6.2), and now and then a star stone lies in its crater (P6.3).
 */
import { CFG } from '../../config';
import { clamp, dist, q4 } from '../../../shared/math';
import type { Vec2 } from '../../../shared/types';
import type { Enemy } from '../../state';
import type { World } from '../../world';
import { tileAt, isWalkable } from '../../grid';
import { hurtGoblin, killEnemy } from '../../combat';
import { killGoblin } from '../../goblin/needs';
import { addMood } from '../../goblin/mood';
import { removePlant } from '../../plants';
import { destroyBuilding } from '../../buildings';
import { damageBuilding } from '../../storms';
import { spawnGroundItem } from '../../groundItems';
import { spawnEnemy } from '../../enemies/director';
import { spawnBramblebeast } from '../../enemies/bramblebeast';
import { afterReshape, rebiome } from '../terraform';
import { divineAct } from '../faith';
import { godHarmed } from '../anger';
import { addZone } from '../zones';
import type { CastTarget } from './nature';
import { startFire } from '../../wildfire';

const PW = CFG.powers;
const H = CFG.god.hourTicks;

/** Hurt an enemy by the god's hand: wisps simply vanish; the rest may die or run. */
function smite(w: World, e: Enemy, dmg: number): void {
  if (e.kind === 'night_wisp') {
    w.s.enemies = w.s.enemies.filter((x) => x !== e);
    w.emit({ type: 'wisp', enemyId: e.id, goblinId: null, phase: 'dispersed', at: e.pos });
    return;
  }
  e.hp = q4(e.hp - dmg);
  if (e.hp <= 0) return killEnemy(w, e, null);
  if (e.hp < CFG.enemies[e.kind].fleeAt * e.maxHp && e.mode !== 'flee') { e.mode = 'flee'; e.path = [{ ...e.home }]; }
  e.nextDecide = w.s.tick;
}

/** Lightning Bolt: 60 damage within a tile, scorched ground, struck plants split, a campfire flares; onlookers scatter. */
export function castLightning(w: World, c: CastTarget): void {
  const s = w.s, r = PW.lightningRadius;
  const hit = s.goblins.filter((g) => !g.heldByGod && dist(g.pos, c.pos) <= r);
  divineAct(w, 'lightning', c.pos, hit[0]?.id, true, { area: PW.lightningSeen });
  for (const g of hit) {
    godHarmed(w, g, c.pos);
    hurtGoblin(w, g, PW.lightningDmg, 'lightning');
  }
  for (const e of [...s.enemies]) if (dist(e.pos, c.pos) <= r) smite(w, e, PW.lightningDmg);
  for (const p of [...s.plants]) if (p.kind !== 'flower' && dist(p.pos, c.pos) <= r * 0.8) {
    if (p.stage === 'mature' || p.stage === 'old') spawnGroundItem(w, { type: 'wood', qty: 1 }, p.pos);
    w.emit({ type: 'plant_died', plantId: p.id, kind: p.kind, at: p.pos });
    removePlant(w, p);
  }
  for (const b of [...s.buildings]) {
    if (dist(b.pos, c.pos) > r + b.footprint.w / 2) continue;
    if (b.type === 'campfire') b.fuel = Math.max(b.fuel ?? 0, CFG.fire.ticksPerWood);
    else damageBuilding(w, b, PW.lightningDmg / 2, 'lightning');
  }
  const t = tileAt(s, c.pos.x, c.pos.y);
  if (t && t.biome !== 'water') t.fertility = q4(Math.max(0.05, t.fertility - 0.3));
  startFire(w, c.pos, 0.9, 'lightning'); // P6.2: what still stands there may catch
  addZone(w, 'dread', c.pos, PW.dreadRadius, PW.dreadTicks);
}

/** Swarm: biting bugs over an area for an hour; nobody can stay or work there. */
export function castSwarm(w: World, c: CastTarget): void {
  addZone(w, 'swarm', c.pos, c.radius, PW.swarmHours * H);
  divineAct(w, 'swarm', c.pos, undefined, true, { area: c.radius });
}

/** Curse: mood −30 and a 25 % chance to fumble each new task, for two days. */
export function castCurse(w: World, c: CastTarget): void {
  const g = c.targetId !== undefined ? w.goblin(c.targetId) : undefined;
  if (!g) return;
  addMood(w, g, 'cursed', PW.curseMood, PW.curseDays * CFG.time.dayTicks);
  divineAct(w, 'curse', g.pos, g.id);
  godHarmed(w, g, g.pos);
}
export const isCursed = (w: World, g: { mood: { modifiers: { id: string; expiresTick: number }[] } }): boolean =>
  g.mood.modifiers.some((m) => m.id === 'cursed' && m.expiresTick > w.s.tick);

/** Summon Gnashers: 2–4 of them out of thin air (they hunt even by day for 3 hours). */
export function castSummonGnashers(w: World, c: CastTarget): void {
  const n = w.rng.int(PW.summonGnashers[0], PW.summonGnashers[1]);
  for (let i = 0; i < n; i++) {
    const p = { x: q4(c.pos.x + w.rng.range(-1.5, 1.5)), y: q4(c.pos.y + w.rng.range(-1.5, 1.5)) };
    const e = spawnEnemy(w, 'gnasher', isWalkable(w.s, Math.floor(p.x), Math.floor(p.y)) ? p : c.pos);
    e.summoned = true;
  }
  divineAct(w, 'summon_gnashers', c.pos, undefined, true, { area: 8 });
}

export function castSummonBramblebeast(w: World, c: CastTarget): void {
  spawnBramblebeast(w, c.pos).summoned = true;
  divineAct(w, 'summon_bramblebeast', c.pos, undefined, true, { area: 8 });
}

/** Meteor: called down now, it lands 1.5 s later (see `resolvePending`). */
export function castMeteor(w: World, c: CastTarget): void {
  w.s.god.pending.push({ power: 'meteor', pos: { ...c.pos }, r: c.radius, at: w.s.tick + PW.meteorDelay });
}

function meteorImpact(w: World, pos: Vec2, r: number): void {
  const s = w.s;
  divineAct(w, 'meteor', pos, undefined, true, { area: PW.meteorSeen });
  const harm = (d: number): number => (d <= PW.meteorKill ? Infinity : PW.meteorDmg * (1 - d / r));
  for (const g of [...s.goblins]) {
    const d = dist(g.pos, pos);
    if (d > r || g.heldByGod) continue;
    godHarmed(w, g, pos);
    if (harm(d) === Infinity) killGoblin(w, g, 'divine');
    else hurtGoblin(w, g, q4(harm(d)), 'divine');
  }
  for (const e of [...s.enemies]) { const d = dist(e.pos, pos); if (d <= r) smite(w, e, harm(d) === Infinity ? e.hp : harm(d)); }
  for (const b of [...s.buildings]) if (dist(b.pos, pos) <= r + b.footprint.w / 2) destroyBuilding(w, b, 'meteor');
  for (const p of [...s.plants]) if (dist(p.pos, pos) <= r) {
    w.emit({ type: 'plant_died', plantId: p.id, kind: p.kind, at: p.pos });
    removePlant(w, p);
  }
  // the crater, a scorched rim, and rubble
  for (let y = Math.floor(pos.y - r - 2); y <= pos.y + r + 2; y++)
    for (let x = Math.floor(pos.x - r - 2); x <= pos.x + r + 2; x++) {
      const t = tileAt(s, x, y);
      if (!t) continue;
      const d = Math.hypot(x + 0.5 - pos.x, y + 0.5 - pos.y);
      // the floor stays just above the water line: a crater, not a new pond
      const floor = Math.min(t.height, CFG.world.waterLevel + 0.02);
      if (d <= r && t.occupiedBy === null) { t.height = q4(clamp(Math.max(floor, t.height - PW.meteorDepth * (1 - (d / r) ** 2)), 0, 1)); rebiome(t); }
      if (d <= r + 1.5 && t.biome !== 'water') t.fertility = q4(Math.max(0.05, t.fertility - 0.25));
    }
  s.terrainVersion += 1;
  afterReshape(w, pos, r + 1);
  for (let i = 0; i < PW.meteorStone; i++) {
    const a = w.rng.range(0, Math.PI * 2), d = w.rng.range(r * 0.6, r + 1);
    const p = { x: q4(pos.x + Math.cos(a) * d), y: q4(pos.y + Math.sin(a) * d) };
    if (isWalkable(s, Math.floor(p.x), Math.floor(p.y))) spawnGroundItem(w, { type: i === 0 ? 'flint' : 'stone', qty: 1 }, p);
  }
  // P6.3: sometimes a star stone lies in the middle (§17.5.4: 30 %)
  if (w.rng.chance(CFG.disasters.star.meteorStone)) spawnGroundItem(w, { type: 'star_stone', qty: 1 }, { ...pos });
  // P6.2: the rim catches fire wherever there is something to burn
  for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; startFire(w, { x: pos.x + Math.cos(a) * (r + 0.8), y: pos.y + Math.sin(a) * (r + 0.8) }, 0.9, 'meteor'); }
  addZone(w, 'dread', pos, r + PW.dreadRadius, PW.dreadTicks);
}

/** §6 step 8b: strikes still falling land when their time comes. */
export function resolvePending(w: World): void {
  const s = w.s;
  if (!s.god.pending.length) return;
  const due = s.god.pending.filter((p) => p.at <= s.tick);
  if (!due.length) return;
  s.god.pending = s.god.pending.filter((p) => p.at > s.tick);
  for (const p of due) if (p.power === 'meteor') meteorImpact(w, p.pos, p.r);
}
