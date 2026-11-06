/**
 * Trinkets (§12.1–12.2): shiny things goblins love. P5.9 brought the first ones (the Shiny Gift); P8.2 adds finding
 * them (`HuntTrinket` at shores and rock piles, glints washed up after a storm, one stone in twenty mined, a beaten
 * Gnasher's hoard), what they are worth to whom, passing them on (courtship gifts, inheritance) and the shelf at
 * home (`Decorate`, a good night's sleep under it). Trading and stealing them come with P8.3.
 */
import { CFG } from './config';
import { dist, q4 } from '../shared/math';
import type { ItemType, Rarity, Vec2 } from '../shared/types';
import type { Building, Glint, Goblin, Trinket } from './state';
import type { World } from './world';
import { allocId } from '../shared/ids';
import { isFood, itemDef } from './items';
import { isComplete } from './buildings';

const T = CFG.trinkets, DAY = CFG.time.dayTicks;

export const TRINKET_KINDS: Record<Rarity, readonly string[]> = {
  common: ['shiny_pebble', 'snail_shell', 'feather_bundle', 'glass_shard'],
  uncommon: ['bone_charm', 'old_coin'],
  rare: ['crystal', 'carved_figurine', 'ancient_tooth'],
  legendary: ['star_stone'],
};

/** A new trinket of this rarity, owned by `g` (its finder). */
export function giveTrinket(w: World, g: Goblin, rarity: Rarity): Trinket {
  const kinds = TRINKET_KINDS[rarity];
  const t: Trinket = {
    id: allocId(w.s), kind: kinds[w.rng.int(0, kinds.length - 1)]!, rarity, hue: q4(w.rng.range(0, 360)),
    foundBy: g.id, foundTick: w.s.tick, history: [g.id],
  };
  w.s.trinkets.push(t);
  g.trinkets.push(t.id);
  w.emit({ type: 'trinket_found', goblinId: g.id, trinket: t.kind, rarity, at: { ...g.pos } });
  return t;
}

export const trinketsOf = (g: Goblin, w: World): Trinket[] => g.trinkets.map((id) => w.s.trinkets.find((t) => t.id === id)).filter((t): t is Trinket => !!t);

/** A find's rarity: mostly common, now and then uncommon, seldom rare (legendary only falls from the sky). */
export function rollRarity(w: World): Rarity {
  const r = w.rng.next(), p = T.hunt.rarity;
  return r < p.rare ? 'rare' : r < p.rare + p.uncommon ? 'uncommon' : 'common';
}

// ---------------------------------------------------------------- value (§12.2)

export const isHoarder = (g: Goblin): boolean => g.traits.includes('hoarder');

/** What a trinket is worth to `g`: by rarity, twice that to a hoarder. */
export const trinketValue = (g: Goblin | null, t: Trinket): number => T.value[t.rarity] * (g && isHoarder(g) ? T.hoarderMul : 1);

/** What an item is worth to `g`: its base value; food ×1.5 to a glutton (gluttony > 0.6) and ×2 to anyone in winter. */
export function itemValue(g: Goblin, w: World, type: ItemType): number {
  const base = itemDef(type).value;
  if (!isFood(type)) return base;
  return q4(base * (g.personality.gluttony > 0.6 ? T.gluttonFoodMul : 1) * (w.clock.season === 'winter' ? T.winterFoodMul : 1));
}

// ---------------------------------------------------------------- shelves

const home = (g: Goblin, w: World): Building | undefined =>
  g.homeId !== null ? w.s.buildings.find((b) => b.id === g.homeId && isComplete(b)) : undefined;

/** Trinkets `g` has on it (owned and on no shelf), best first. */
export function carried(g: Goblin, w: World): Trinket[] {
  const shelved = new Set(w.s.buildings.flatMap((b) => b.decoration));
  return trinketsOf(g, w).filter((t) => !shelved.has(t.id)).sort((a, b) => T.value[b.rarity] - T.value[a.rarity] || a.id - b.id);
}

/** The home to put trinkets up in, if it is built and its shelf has room. */
export function shelfFor(g: Goblin, w: World): Building | null {
  const h = home(g, w);
  return h && h.decoration.length < T.shelf.max ? h : null;
}

/** Up they go: as many carried trinkets as the shelf has room for, best first. Returns how many. */
export function decorate(w: World, g: Goblin, b: Building): number {
  const room = T.shelf.max - b.decoration.length;
  const put = carried(g, w).slice(0, Math.max(0, room));
  for (const t of put) b.decoration.push(t.id);
  if (put.length) w.emit({ type: 'decorated', goblinId: g.id, buildingId: b.id, count: b.decoration.length, at: { ...b.pos } });
  return put.length;
}

/** How many trinkets brighten `g`'s home. */
export const shelfCount = (g: Goblin, w: World): number => home(g, w)?.decoration.length ?? 0;

// ---------------------------------------------------------------- passing on

/** `t` changes hands (a gift, an heirloom; theft in P8.3): off any shelf the new owner doesn't share. */
export function passTrinket(w: World, t: Trinket, from: Goblin | null, to: Goblin): void {
  if (from) from.trinkets = from.trinkets.filter((id) => id !== t.id);
  for (const g of w.s.goblins) if (g !== to && g.trinkets.includes(t.id)) g.trinkets = g.trinkets.filter((id) => id !== t.id);
  for (const b of w.s.buildings) if (b.decoration.includes(t.id) && b.id !== to.homeId) b.decoration = b.decoration.filter((id) => id !== t.id);
  if (!to.trinkets.includes(t.id)) to.trinkets.push(t.id);
  if (t.history[t.history.length - 1] !== to.id) t.history.push(to.id);
}

/** On a death (after the grave took its best piece): the rest go to the mate, else a child, else other kin. */
export function inheritTrinkets(w: World, dead: Goblin, buried: number | null): void {
  const rest = trinketsOf(dead, w).filter((t) => t.id !== buried);
  if (buried !== null) for (const b of w.s.buildings) b.decoration = b.decoration.filter((id) => id !== buried);
  if (!rest.length) return;
  const mate = w.s.goblins.find((o) => o.relationships.some((r) => r.targetId === dead.id && r.bond === 'mate'));
  const child = w.s.goblins.filter((o) => o.parents?.includes(dead.id)).sort((a, b) => a.bornTick - b.bornTick)[0];
  const kin = w.s.goblins.find((o) => !!o.parents && !!dead.parents && o.parents.some((p) => dead.parents!.includes(p)));
  const heir = mate ?? child ?? kin;
  for (const t of rest) {
    if (heir) passTrinket(w, t, dead, heir);
    else for (const b of w.s.buildings) b.decoration = b.decoration.filter((id) => id !== t.id); // nobody: it stays where it lay
  }
  if (heir) w.emit({ type: 'trinkets_inherited', goblinId: heir.id, fromId: dead.id, count: rest.length, at: { ...heir.pos } });
}

// ---------------------------------------------------------------- glints washed up after a storm

/** A shore tile (walkable, next to water) within `range` of `around`, picked at random; null if there is none. */
export function shoreSpot(w: World, around: Vec2, range: number): Vec2 | null {
  const s = w.s, W = s.size.w, spots: Vec2[] = [];
  const x0 = Math.max(1, Math.floor(around.x - range)), x1 = Math.min(W - 2, Math.ceil(around.x + range));
  const y0 = Math.max(1, Math.floor(around.y - range)), y1 = Math.min(s.size.h - 2, Math.ceil(around.y + range));
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      const t = s.tiles[y * W + x]!;
      if (!t.walkable || t.biome === 'water' || (x + 0.5 - around.x) ** 2 + (y + 0.5 - around.y) ** 2 > range * range) continue;
      if (s.tiles[y * W + x + 1]!.biome === 'water' || s.tiles[y * W + x - 1]!.biome === 'water' || s.tiles[(y + 1) * W + x]!.biome === 'water' || s.tiles[(y - 1) * W + x]!.biome === 'water')
        spots.push({ x: x + 0.5, y: y + 0.5 });
    }
  return spots.length ? spots[w.rng.int(0, spots.length - 1)]! : null;
}

/** Every 50 ticks: a storm that has blown over leaves glints on the shore; old ones are lost to the tide. */
export function updateTrinkets(w: World): void {
  const s = w.s;
  if (s.tick % 50 !== 0) return;
  if (s.glints?.length && s.glints.some((gl) => gl.until <= s.tick)) s.glints = s.glints.filter((gl) => gl.until > s.tick);
  if (s.weather.kind === 'storm') { s.stormWash = true; return; }
  if (!s.stormWash) return;
  s.stormWash = false;
  const n = w.rng.int(T.storm.glints[0], T.storm.glints[1]);
  for (let i = 0; i < n; i++) {
    const p = shoreSpot(w, s.village.center, T.storm.range);
    if (!p) continue;
    const gl: Glint = { id: allocId(s), pos: p, rarity: rollRarity(w), until: s.tick + Math.round(T.storm.days * DAY) };
    (s.glints ??= []).push(gl);
  }
  if (s.glints?.length) w.emit({ type: 'glints_washed_up', count: n });
}

/** The nearest glint within `r` of `p` nobody else is after. */
export function glintNear(w: World, g: Goblin, r: number): Glint | null {
  let best: Glint | null = null, bd = r;
  for (const gl of w.s.glints ?? []) {
    if (w.s.goblins.some((o) => o !== g && o.activity.action === 'hunt_trinket' && o.activity.targetId === gl.id)) continue;
    const d = dist(gl.pos, g.pos);
    if (d < bd) { bd = d; best = gl; }
  }
  return best;
}
