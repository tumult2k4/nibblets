/**
 * Death culture (§13.7, P6.4). When a goblin dies, everyone who was close to it (opinion above 30, or family) grieves:
 * −10 to −30 mood for 2 to 6 days, by how close. The body lies where it fell until someone carries it to the village
 * graveyard and buries it (`BuryDead`), with its most precious trinket; whoever stands by at the burial finds some
 * peace. Later the grieving visit the grave (`Mourn`), which eases grief faster. A body nobody comes for is covered
 * where it lies after a few days. The goblin itself is kept with its grave for two days, for the god's Resurrect.
 */
import { CFG } from './config';
import { clamp, dist, q4 } from '../shared/math';
import type { ID, Rarity, Vec2 } from '../shared/types';
import type { Goblin, Grave } from './state';
import type { World } from './world';
import { isWalkable, tileAt } from './grid';
import { addMood } from './goblin/mood';
import { isKin, opinionOf, relationOf } from './goblin/social';
import { fnv1a } from '../shared/rng';

const D = CFG.death;
const DAY = CFG.time.dayTicks, HOUR = CFG.god.hourTicks;
const RANK: Record<Rarity, number> = { common: 0, uncommon: 1, rare: 2, legendary: 3 };

export const griefId = (deadId: ID): string => `grief:${deadId}`;
export const graveOf = (w: World, goblinId: ID): Grave | undefined => w.s.graves.find((gr) => gr.goblinId === goblinId);
/** The deepest grief `g` carries: the modifier and whose it is. */
export function deepestGrief(g: Goblin): { deadId: ID; amount: number } | null {
  let best: { deadId: ID; amount: number } | null = null;
  for (const m of g.mood.modifiers)
    if (m.id.startsWith('grief:') && (!best || m.amount < best.amount)) best = { deadId: Number(m.id.slice(6)), amount: m.amount };
  return best;
}
export const isGrieving = (g: Goblin): boolean => (deepestGrief(g)?.amount ?? 0) <= -D.grievingAt;

/** How close `o` was to `dead`, 0..1 (0: not enough to grieve). */
export function closeness(o: Goblin, dead: Goblin): number {
  const op = opinionOf(o, dead.id), bond = relationOf(o, dead.id)?.bond;
  const byOpinion = clamp((op - D.griefOpinion) / (100 - D.griefOpinion), 0, 1);
  if (bond === 'mate') return Math.max(1, byOpinion);
  if (isKin(o, dead)) return Math.max(0.7, byOpinion);
  return op > D.griefOpinion ? Math.max(0.05, byOpinion) : 0;
}

/** The grave record for `g`, made where it died (killGoblin). Its most precious trinket goes into the grave. */
export function makeGrave(w: World, g: Goblin, id: ID, cause: string): Grave {
  const owned = w.s.trinkets.filter((t) => g.trinkets.includes(t.id)).sort((a, b) => RANK[b.rarity] - RANK[a.rarity] || a.id - b.id);
  return {
    id, goblinId: g.id, name: g.name, epithet: g.epithet, clanId: g.clanId, pos: { ...g.pos }, tick: w.s.tick, born: g.bornTick, cause,
    goods: owned[0]?.id ?? null, state: 'lying', carrierId: null, eulogy: null, body: g,
  };
}

/** Everyone close to `dead` grieves (killGoblin). */
export function grieve(w: World, dead: Goblin): void {
  for (const o of w.s.goblins) {
    if (o === dead) continue;
    const k = closeness(o, dead);
    if (k <= 0) continue;
    const amount = q4(D.griefMood[0] + (D.griefMood[1] - D.griefMood[0]) * k);
    const days = D.griefDays[0] + (D.griefDays[1] - D.griefDays[0]) * k;
    addMood(w, o, griefId(dead.id), -amount, Math.round(days * DAY));
    w.emit({ type: 'grief', goblinId: o.id, deadId: dead.id, at: { ...o.pos } });
    w.emit({ type: 'emote', goblinId: o.id, emote: 'tear' });
  }
}

/** Ease `g`'s grief for `deadId`: the amount × `ease`, the time left × `shorten`. */
export function easeGrief(w: World, g: Goblin, deadId: ID, ease: number, shorten: number): void {
  const m = g.mood.modifiers.find((x) => x.id === griefId(deadId));
  if (!m) return;
  m.amount = q4(m.amount * ease);
  m.expiresTick = Math.round(w.s.tick + (m.expiresTick - w.s.tick) * shorten);
}

const flatEnough = (w: World, x: number, y: number, slope: number): boolean => {
  const h = tileAt(w.s, x, y)?.height ?? 0;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const t = tileAt(w.s, x + dx, y + dy);
    if (!t || !t.walkable || t.occupiedBy !== null || Math.abs(t.height - h) > slope) return false;
  }
  return true;
};

/** Where the village lays its dead: chosen once, on open, level ground a little way out from the center. */
export function graveyard(w: World): Vec2 | null {
  const s = w.s;
  if (s.village.graveyard) return s.village.graveyard;
  const c = s.village.center, [r0, r1] = D.graveyard;
  let best: Vec2 | null = null, bs = -Infinity;
  // the gentlest open ground in the ring; on hilly land, the least steep (and a little further out if need be)
  for (const [slope, far] of [[0.02, r1], [0.05, r1], [0.12, r1 + 8]] as const) {
    for (let y = Math.floor(c.y - far); y <= c.y + far; y++)
      for (let x = Math.floor(c.x - far); x <= c.x + far; x++) {
        const p = { x: x + 0.5, y: y + 0.5 }, d = dist(p, c);
        if (d < r0 || d > far || !flatEnough(w, x, y, slope)) continue;
        if (s.buildings.some((b) => dist(b.pos, p) < D.keepClear + b.footprint.w / 2)) continue;
        let sc = -Math.abs(d - (r0 + r1) / 2) * 0.2 + (fnv1a(`${x},${y}`, s.seed) % 1000) / 1e4;
        for (const pl of w.plantHash.query(p, 3)) if (pl.stage !== 'seed' && pl.stage !== 'sprout') sc -= pl.kind === 'flower' ? 0.1 : 0.5;
        if (sc > bs) { bs = sc; best = p; }
      }
    if (best) break;
  }
  if (best) s.village.graveyard = best;
  return best;
}

/** The next free spot in the graveyard's rows. */
export function graveSlot(w: World): Vec2 | null {
  const yard = graveyard(w);
  if (!yard) return null;
  for (let n = 0; n < 200; n++) {
    const row = Math.floor(n / D.cols), col = n % D.cols;
    const p = { x: q4(yard.x + (col - (D.cols - 1) / 2) * D.gap), y: q4(yard.y + (row - 1) * D.gap) };
    if (!isWalkable(w.s, Math.floor(p.x), Math.floor(p.y))) continue;
    if (w.s.graves.some((gr) => gr.state === 'buried' && dist(gr.pos, p) < D.gap * 0.6)) continue;
    if (w.s.buildings.some((b) => dist(b.pos, p) < b.footprint.w / 2 + 0.6)) continue;
    if (w.plantHash.query(p, 1).some((pl) => pl.stage !== 'seed' && dist(pl.pos, p) < 0.9)) continue;
    return p;
  }
  return null;
}

/** Lay `grave` to rest at `pos`: those standing by who grieve for it find some peace. Returns the mourners. */
export function bury(w: World, grave: Grave, pos: Vec2, byId: ID | null): number {
  grave.state = 'buried';
  grave.pos = { ...pos };
  grave.carrierId = null;
  let mourners = 0;
  for (const o of w.s.goblins) {
    if (dist(o.pos, pos) > D.funeralRange || !o.mood.modifiers.some((m) => m.id === griefId(grave.goblinId))) continue;
    easeGrief(w, o, grave.goblinId, D.funeralEase, D.funeralEase);
    mourners++;
  }
  w.emit({ type: 'buried', graveId: grave.id, deadId: grave.goblinId, byId, mourners, at: { ...pos } });
  return mourners;
}

/** §6 step 11f (hourly): bodies nobody came for are covered where they lie; bodies past Resurrect's window go. */
export function updateDeath(w: World): void {
  const s = w.s;
  if (s.tick % HOUR !== 0 || !s.graves.length) return;
  for (const gr of s.graves) {
    if (gr.body && s.tick - gr.tick > D.resurrectDays * DAY) gr.body = null;
    if (gr.state === 'carried' && !s.goblins.some((g) => g.id === gr.carrierId && g.activity.action === 'bury_dead')) { gr.state = 'lying'; gr.carrierId = null; }
    if (gr.state === 'lying' && s.tick - gr.tick > D.leaveDays * DAY) {
      gr.state = 'mound';
      w.emit({ type: 'buried', graveId: gr.id, deadId: gr.goblinId, byId: null, mourners: 0, at: { ...gr.pos } });
    }
  }
}
