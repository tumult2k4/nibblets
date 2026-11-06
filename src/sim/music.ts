/**
 * Music (§11.1, §15.3, P8.5): the drum and the flute a goblin keeps, the music circle (a nightly gathering spot of
 * stones round a trampled ring), and where the evening's music is played: the circle, else the campfire.
 */
import { CFG } from './config';
import { dist } from '../shared/math';
import { isComplete } from './buildings';
import { gear } from './tools';
import type { ItemStack, ItemType } from '../shared/types';
import type { Building, Goblin } from './state';
import type { World } from './world';

const M = CFG.festivals.music;
export const INSTRUMENTS: readonly ItemType[] = ['drum', 'flute'];
export const isInstrument = (t: ItemType): boolean => t === 'drum' || t === 'flute';
export const instrumentOf = (g: Goblin): ItemStack | null => gear(g).find((s) => isInstrument(s.type)) ?? null;
/** Of an evening (dusk into the first of the night) the music comes out. */
export const musicHour = (w: World): boolean => w.clock.dayFrac >= M.at && w.clock.dayFrac < M.until;

let placeCache = { tick: -1, w: null as World | null, b: null as Building | null };
/** Where the evening's music is played: the music circle nearest the center, else the campfire nearest it. */
export function musicPlace(w: World): Building | null {
  if (placeCache.tick === w.s.tick && placeCache.w === w) return placeCache.b;
  const c = w.s.village.center;
  let circle: Building | null = null, fire: Building | null = null;
  for (const b of w.s.buildings) {
    if (!isComplete(b)) continue;
    if (b.type === 'music_circle' && (!circle || dist(b.pos, c) < dist(circle.pos, c))) circle = b;
    else if (b.type === 'campfire' && (!fire || dist(b.pos, c) < dist(fire.pos, c))) fire = b;
  }
  placeCache = { tick: w.s.tick, w, b: circle ?? fire };
  return placeCache.b;
}

/** How many instruments the village has (they are carried, never stored). */
export const instrumentsOwned = (w: World): number => w.s.goblins.reduce((n, g) => n + (instrumentOf(g) ? 1 : 0), 0);
/** 0..1: how much `g` would like an instrument (about one goblin in `share` keeps one, the sociable and mischievous first). */
export function instrumentWant(g: Goblin, w: World): number {
  if (instrumentOf(g) || instrumentsOwned(w) >= Math.ceil(w.s.goblins.length / M.share)) return 0;
  return M.want * (0.3 + 0.5 * g.personality.sociability + 0.4 * g.personality.mischief);
}
/** A music circle (only one) once someone plays and the village has grown a little. */
export const wantsMusicCircle = (w: World): boolean =>
  w.s.goblins.length >= M.circlePop && !w.s.buildings.some((b) => b.type === 'music_circle') && instrumentsOwned(w) > 0;
