/**
 * Festivals and music (§15.3, P8.5). `JoinFestival`: walk to the festival and take a place in the ring round the
 * fire (inside the longhouse, or round the crater at Starfall) and stay: dancing to whoever plays, playing if it has
 * an instrument, mingling otherwise; the Sun Feast's helping and the younglings' race round the fire, Sprout Day's
 * core planted on the way, the Long Dark's stories told by the oldest there. `PlayMusic` and `Dance`: of an evening
 * a goblin with a drum or a flute plays at the music circle (or the fire), and others come and dance to it.
 */
import { CFG } from '../../config';
import { dist, q4 } from '../../../shared/math';
import { perDay } from '../../time';
import { isWalkable } from '../../grid';
import { countItem, takeOne } from '../../inventory';
import { faceToward, moveAlong, planPath } from '../../steering';
import { siteOk, spawnPlant } from '../../plants';
import { findPlantingSite } from '../targets';
import { addSocial } from '../../goblin/social';
import { addMood } from '../../goblin/mood';
import { gainXp } from '../../goblin/skills';
import { goblinSpeed, isSleeping } from '../../goblin/goblin';
import { wearTool } from '../../tools';
import { attending, feastHelping, festivalNow } from '../../festivals';
import { instrumentOf, musicHour, musicPlace } from '../../music';
import { beliefMul } from '../../superstitions';
import type { Vec2 } from '../../../shared/types';
import type { Goblin } from '../../state';
import type { Festival } from '../../cultureState';
import type { World } from '../../world';
import type { UtilityAction } from '../action';

const F = CFG.festivals, J = F.join, M = F.music, DAY = CFG.time.dayTicks;
/** What a goblin is doing at a festival (`activity.count`, read by the renderer). */
export const FEST = { mingle: 0, dance: 1, play: 2, listen: 3, tell: 4, race: 5, feast: 6 } as const;

const fit = (g: Goblin): boolean => g.needs.hunger >= J.minNeed && g.needs.thirst >= J.minNeed && g.needs.energy >= J.minEnergy;
const fun = (g: Goblin, perDayAmount: number): void => { g.needs.fun = q4(Math.min(100, g.needs.fun + perDay(perDayAmount))); };

/** A place in the ring round `c` for goblin `id`, spread by the golden angle: the first walkable one going round. */
export function ringSpot(w: World, c: Vec2, id: number, [r0, r1]: readonly [number, number]): Vec2 {
  const a0 = id * 2.39996, r = r0 + ((id * 0.6180339) % 1) * (r1 - r0);
  for (let k = 0; k < 8; k++) {
    const p = { x: q4(c.x + Math.cos(a0 + k * 0.7) * r), y: q4(c.y + Math.sin(a0 + k * 0.7) * r) };
    if (isWalkable(w.s, Math.floor(p.x), Math.floor(p.y))) return p;
  }
  return { x: c.x, y: c.y };
}
const inHouse = (w: World, f: Festival): boolean => f.venueId !== null && w.s.buildings.find((b) => b.id === f.venueId)?.type === 'longhouse';
const festSpot = (w: World, g: Goblin, f: Festival): Vec2 => ringSpot(w, f.pos, g.id, inHouse(w, f) ? F.venue.longhouseRing : F.venue.ring);
const walkTo = (w: World, g: Goblin, p: Vec2): boolean => dist(g.pos, p) < 0.5 || planPath(w, g, p);

let playCache = { tick: -1, w: null as World | null, list: [] as Goblin[] };
/** Everyone making music right now (at a festival or of an evening), per tick. */
function players(w: World): Goblin[] {
  if (playCache.tick === w.s.tick && playCache.w === w) return playCache.list;
  const list = w.s.goblins.filter((o) => o.activity.status === 'running' && o.activity.stage >= 1
    && (o.activity.action === 'play_music' || (o.activity.action === 'join_festival' && o.activity.stage === 2 && o.activity.count === FEST.play)));
  playCache = { tick: w.s.tick, w, list };
  return list;
}
const playingNear = (w: World, g: Goblin, r: number): Goblin | undefined => players(w).find((o) => o.id !== g.id && dist(o.pos, g.pos) <= r);

let tellCache = { tick: -1, w: null as World | null, id: -1 };
/** The Long Dark's storyteller: the oldest one there. */
function storyteller(w: World, f: Festival): number {
  if (tellCache.tick === w.s.tick && tellCache.w === w) return tellCache.id;
  let best: Goblin | null = null;
  for (const o of w.s.goblins) if (attending(o, f) && (!best || o.bornTick < best.bornTick)) best = o;
  tellCache = { tick: w.s.tick, w, id: best?.id ?? -1 };
  return tellCache.id;
}

/** What to do next at the festival. */
function pickMode(w: World, g: Goblin, f: Festival): number {
  if (f.kind === 'long_dark') return storyteller(w, f) === g.id ? FEST.tell : FEST.listen;
  if (f.kind === 'sun_feast' && g.lifeStage === 'youngling' && w.rng.chance(0.6)) return FEST.race;
  if (f.kind !== 'starfall' && instrumentOf(g) && w.rng.chance(0.75)) return FEST.play;
  return w.rng.chance(playingNear(w, g, M.danceRange) ? 0.7 : 0.35) ? FEST.dance : FEST.mingle;
}

/** The younglings' race (Sun Feast): round and round outside the ring. */
function race(w: World, g: Goblin, f: Festival): void {
  const r = F.venue.ring[1] + 1, ang = Math.atan2(g.pos.y - f.pos.y, g.pos.x - f.pos.x) + (goblinSpeed(g) * 1.4) / r;
  const p = { x: q4(f.pos.x + Math.cos(ang) * r), y: q4(f.pos.y + Math.sin(ang) * r) };
  if (!isWalkable(w.s, Math.floor(p.x), Math.floor(p.y))) { g.activity.count = FEST.mingle; return; }
  g.velocity = { x: q4(p.x - g.pos.x), y: q4(p.y - g.pos.y) };
  g.facing = q4(ang + Math.PI / 2);
  g.pos = p;
}

/** Sprout Day: the core goes in the ground on the way. */
function plantCore(w: World, g: Goblin, at: Vec2): void {
  if (!siteOk(w, at, CFG.plants.minSeedGap) || !takeOne(g, (s) => s.type === 'apple_core')) return;
  spawnPlant(w, 'apple_bush', at, 'seed', g.id);
  g.deeds.planted += 1;
  gainXp(w, g, 'farming', CFG.skills.xp.plant);
  addMood(w, g, 'planted', 3, 1200);
}

export const JoinFestival: UtilityAction = {
  id: 'join_festival', tags: ['social', 'fun'], minStage: 'youngling', interruptible: true,
  isAvailable: (g, w) => {
    const f = festivalNow(w);
    return !!f && fit(g) && dist(g.pos, f.pos) <= J.range;
  },
  score: (g) => q4(J.score * (0.7 + 0.6 * g.personality.sociability)),
  start(g, w) {
    const f = festivalNow(w)!, a = g.activity;
    a.count = FEST.mingle;
    const site = f.kind === 'sprout_day' && countItem(g, 'apple_core') > 0 ? findPlantingSite(g, w) : null;
    if (site && planPath(w, g, site)) { a.stage = 0; a.target = site; return true; }
    a.stage = 1;
    a.target = festSpot(w, g, f);
    return walkTo(w, g, a.target);
  },
  step(g, w) {
    const f = festivalNow(w), a = g.activity;
    if (!f || !fit(g)) return 'done';
    if (a.stage === 0) {
      if (moveAlong(w, g) !== 'arrived') return 'running';
      if (a.progress === 0) { a.progress = CFG.plants.plantTicks; faceToward(g, a.target!); }
      if (--a.progress > 0) return 'running';
      plantCore(w, g, a.target!);
      a.stage = 1;
      a.target = festSpot(w, g, f);
      return walkTo(w, g, a.target) ? 'running' : 'done';
    }
    if (a.stage === 1) {
      if (moveAlong(w, g) !== 'arrived') return 'running';
      a.stage = 2;
      a.progress = 0;
      const ate = f.ate ?? (f.ate = []);
      if (f.kind === 'sun_feast' && !ate.includes(g.id) && g.needs.hunger < 90 && feastHelping(w, g)) { // the shared meal
        ate.push(g.id);
        a.count = FEST.feast;
        a.progress = CFG.goblin.eatTicks * 3;
      } else a.count = pickMode(w, g, f);
    }
    f.came[g.id] = (f.came[g.id] ?? 0) + 1;
    fun(g, F.at.fun * (a.count === FEST.play || playingNear(w, g, M.hear) ? M.festivalMusic : 1));
    addSocial(g, perDay(F.at.social));
    if (a.count === FEST.race) race(w, g, f);
    else {
      g.velocity = { x: 0, y: 0 };
      if (a.count !== FEST.dance) faceToward(g, f.pos);
    }
    if (a.count === FEST.play && (w.s.tick + g.id) % 60 === 0) w.emit({ type: 'emote', goblinId: g.id, emote: 'music' });
    if (a.count === FEST.feast ? --a.progress <= 0 : (w.s.tick + g.id * 7) % F.at.every === 0) {
      const ins = a.count === FEST.play ? instrumentOf(g) : null;
      if (ins) wearTool(w, g, ins);
      a.count = pickMode(w, g, f);
    }
    return 'running';
  },
};

/** Of an evening, a goblin with an instrument plays at the music circle (or the fire); whoever is near enjoys it. */
export const PlayMusic: UtilityAction = {
  id: 'play_music', tags: ['fun', 'social'], minStage: 'youngling', interruptible: true,
  isAvailable: (g, w) => {
    if (!musicHour(w) || g.needs.fun >= M.below || !fit(g) || festivalNow(w) || !instrumentOf(g)) return false;
    const b = musicPlace(w);
    return !!b && dist(g.pos, b.pos) <= M.range;
  },
  score: (g, w) => q4(M.score * (0.6 + 0.8 * (1 - g.needs.fun / 100)) * beliefMul(w, g, 'music')),
  start(g, w) {
    const b = musicPlace(w)!, a = g.activity;
    a.targetId = b.id;
    a.target = ringSpot(w, b.pos, g.id, b.type === 'music_circle' ? [0.9, 1.4] : F.venue.ring);
    return walkTo(w, g, a.target);
  },
  step(g, w) {
    const a = g.activity, ins = instrumentOf(g), b = w.s.buildings.find((x) => x.id === a.targetId);
    if (!ins || !b || festivalNow(w)) return 'done';
    if (a.stage === 0) {
      if (moveAlong(w, g) !== 'arrived') return 'running';
      a.stage = 1;
      a.progress = M.ticks;
      faceToward(g, b.pos);
      g.deeds.tunes = (g.deeds.tunes ?? 0) + 1; // P8.7: an evening of music, toward "the Piper"
    }
    g.velocity = { x: 0, y: 0 };
    fun(g, M.fun * (b.type === 'music_circle' ? M.circleMul : 1));
    addSocial(g, perDay(M.social));
    if ((w.s.tick + g.id) % 30 === 0) { // whoever is within earshot and awake enjoys it a little
      for (const o of w.goblinHash.query(g.pos, M.hear)) if (o.id !== g.id && dist(o.pos, g.pos) <= M.hear && !isSleeping(o)) fun(o, M.fun * M.listen * 30);
    }
    if ((w.s.tick + g.id) % 60 === 0) w.emit({ type: 'emote', goblinId: g.id, emote: 'music' });
    if (--a.progress > 0 && musicHour(w)) return 'running';
    wearTool(w, g, ins);
    addMood(w, g, 'made_music', 4, DAY / 2);

    return 'done';
  },
};

/** Someone playing within reach to dance to. */
const musician = (g: Goblin, w: World): Goblin | undefined => players(w).find((o) => o.id !== g.id && o.activity.action === 'play_music' && dist(o.pos, g.pos) <= M.range);

export const Dance: UtilityAction = {
  id: 'dance', tags: ['fun', 'social'], minStage: 'youngling', interruptible: true,
  isAvailable: (g, w) => g.needs.fun < 90 && fit(g) && !festivalNow(w) && !!musician(g, w),
  score: (g, w) => q4(M.danceScore * (0.6 + 0.8 * (1 - g.needs.fun / 100)) * beliefMul(w, g, 'music')),
  start(g, w) {
    const o = musician(g, w)!, a = g.activity;
    a.targetId = o.id;
    a.target = ringSpot(w, o.pos, g.id, [1.4, 2.6]);
    return walkTo(w, g, a.target);
  },
  step(g, w) {
    const a = g.activity, o = a.targetId !== null ? w.goblin(a.targetId) : undefined;
    if (!o || o.activity.action !== 'play_music' || o.activity.status !== 'running') return a.stage === 1 ? 'done' : 'failed';
    if (a.stage === 0) {
      if (moveAlong(w, g) !== 'arrived') return 'running';
      a.stage = 1;
      a.progress = M.danceTicks;
    }
    g.velocity = { x: 0, y: 0 };
    fun(g, M.fun);
    addSocial(g, perDay(M.social));
    if (--a.progress > 0) return 'running';
    addMood(w, g, 'danced', 3, DAY / 2);
    return 'done';
  },
};
