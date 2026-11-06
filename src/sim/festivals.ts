/**
 * Festivals (§15.3, P8.5): the village calendar (Sprout Day, the Sun Feast, Harvest Night, the Long Dark), Starfall
 * the evening after a shooting star, and now and then an evening's merrymaking (more often under a sociable chief,
 * §13.6). A festival needs a venue (a campfire or the longhouse), stops work for half a day, and everyone who came
 * shares in what it brings when it ends. Going, and what goblins do there, are the actions in ai/actions/festival.ts.
 */
import { CFG } from './config';
import { dist, q4 } from '../shared/math';
import { isComplete } from './buildings';
import { addMood, ateFood } from './goblin/mood';
import { adjustOpinion } from './goblin/social';
import { addReputation } from './mischief';
import { foodStores } from './spoilage';
import { stockCount, stockFood, withdraw } from './stockpile';
import { itemDef } from './items';
import { addFuel } from './fire';
import type { FestivalKind, ItemType, Vec2 } from '../shared/types';
import type { Building, Goblin, WorldState } from './state';
import type { Culture, Festival } from './cultureState';
import type { World } from './world';
import { villageBeliefMul } from './superstitions';
import { drift } from './goblin/drift';

const F = CFG.festivals, E = F.effects, DAY = CFG.time.dayTicks, DPS = CFG.time.daysPerSeason;
const HELD_MAX = 40;
export const CALENDAR = Object.keys(F.calendar) as (keyof typeof F.calendar)[];
export const FESTIVAL_KINDS: readonly FestivalKind[] = [...CALENDAR, 'starfall', 'merrymaking'];

export const cultureOf = (s: WorldState): Culture => (s.village.culture ??= {});
/** The festival on now, if any. */
export function festivalNow(w: World): Festival | null {
  const f = w.s.village.culture?.festival;
  return f && w.s.tick < f.endTick ? f : null;
}
/** §15.3: a festival suspends work for its half day. */
export const festivalWorkMul = (w: World): number => (festivalNow(w) ? F.workMul : 1);
/** Sprout Day's orchard boost for a plant at `pos` (the rest of spring, near the village). */
export const sproutMul = (s: WorldState, pos: Vec2): number =>
  (s.village.culture?.sproutUntil ?? 0) > s.tick && dist(pos, s.village.center) <= E.sprout.radius ? E.sprout.growMul : 1;
/** Harvest Night's courtship boost, in the spring after it. */
export const courtMul = (w: World): number =>
  (w.clock.season === 'spring' && w.s.village.culture?.courtYear === w.clock.year ? E.harvest.courtMul : 1);
/** A star fell (climate.ts): the village may walk out to it the next evening. */
export function noteStar(w: World, pos: Vec2): void {
  cultureOf(w.s).star = { pos: { x: pos.x, y: pos.y }, tick: w.s.tick };
}
/** Is `g` at the festival now (there, not on its way)? */
export const attending = (g: Goblin, f: Festival): boolean =>
  g.activity.action === 'join_festival' && g.activity.status === 'running' && g.activity.stage === 2 && dist(g.pos, f.pos) < 9;

const WET: ReadonlySet<string> = new Set(['rain', 'storm', 'snow', 'blizzard']);
/** Where a festival is held: the longhouse for the Long Dark and in rain or snow, else the campfire nearest the center, else the longhouse. */
export function venueFor(w: World, kind: FestivalKind): Building | null {
  const c = w.s.village.center;
  let fire: Building | null = null, house: Building | null = null;
  for (const b of w.s.buildings) {
    if (!isComplete(b)) continue;
    if (b.type === 'longhouse') house ??= b;
    else if (b.type === 'campfire' && (!fire || dist(b.pos, c) < dist(fire.pos, c))) fire = b;
  }
  return house && (kind === 'long_dark' || WET.has(w.s.weather.kind)) ? house : (fire ?? house);
}

const heldSince = (cu: Culture, day: number, kind?: FestivalKind): boolean => (cu.held ?? []).some(([d, k]) => d >= day && (!kind || k === kind));
const inWindow = (w: World, at: number): boolean => w.clock.dayFrac >= at && w.clock.dayFrac < at + 0.1;
/** Not with a storm overhead or enemies at the gate (the calendar ones try again for a while). */
const unsafe = (w: World): boolean =>
  w.s.weather.kind === 'storm' || w.s.weather.kind === 'blizzard' || w.s.enemies.some((e) => dist(e.pos, w.s.village.center) < 30);

/** The calendar festival (or Starfall) due now, if any. */
export function dueFestival(w: World): FestivalKind | null {
  const c = w.clock, cu = cultureOf(w.s), seasonStart = c.day - c.seasonDay;
  for (const k of CALENDAR) {
    const d = F.calendar[k];
    if (c.season !== d.season || c.seasonDay < d.day || c.seasonDay > d.lastDay || !inWindow(w, d.at) || heldSince(cu, seasonStart, k)) continue;
    // the Sun Feast waits for a clear day (and is held on the last one whatever the sky)
    if (k === 'sun_feast' && w.s.weather.kind !== 'clear' && c.seasonDay < d.lastDay) continue;
    return k;
  }
  const st = cu.star;
  if (st && Math.floor(st.tick / DAY) === c.day - 1 && inWindow(w, F.starfall.at) && dist(st.pos, w.s.village.center) <= F.starfall.range) return 'starfall';
  return null;
}

/** The chance of an evening's merrymaking: times are good, nothing else lately (× the chief's festival policy, §13.6). */
export function merryChance(w: World): number {
  const c = w.clock;
  if (c.season === 'winter' || heldSince(cultureOf(w.s), c.day - F.merry.gapDays + 1) || foodStores(w.s).days < F.merry.minDays) return 0;
  return F.merry.chance * (w.s.village.policies?.festivals ?? 1) * villageBeliefMul(w, 'festival');
}

/** Begin a festival now (if it is safe and there is somewhere to hold it). */
export function beginFestival(w: World, kind: FestivalKind): Festival | null {
  const s = w.s, cu = cultureOf(s);
  if (unsafe(w)) return null;
  const star = kind === 'starfall' ? cu.star : null;
  const venue = star ? null : venueFor(w, kind);
  if (!star && !venue) return null;
  const pos = star ? { ...star.pos } : { x: venue!.pos.x, y: venue!.pos.y };
  const len = kind === 'merrymaking' ? F.merry.length : F.length;
  const f: Festival = { kind, pos, venueId: venue?.id ?? null, startTick: s.tick, endTick: s.tick + Math.round(len * DAY), came: {} };
  cu.festival = f;
  if (star) cu.star = null;
  // the fire is built up from the woodpile: a bonfire on Harvest Night
  if (venue?.type === 'campfire') addFuel(venue, 'wood', withdraw(s, 'wood', Math.min(stockCount(s, 'wood'), kind === 'harvest_night' ? 6 : 2)));
  w.emit({ type: 'festival', kind, phase: 'start', at: { ...pos }, venueId: venue?.id ?? null });
  return f;
}

const MERRY_TICK = Math.floor(F.merry.at * DAY);
/** §6 step 17 (culture): start, run and end festivals. */
export function updateFestivals(w: World): void {
  const s = w.s, f = s.village.culture?.festival;
  if (f) {
    if (s.tick >= f.endTick) endFestival(w, f);
    else if (f.kind === 'harvest_night' && !f.speech && s.tick >= (f.startTick + f.endTick) / 2) chiefSpeech(w, f);
    return;
  }
  if (s.tick % 100 === 0) {
    const k = dueFestival(w);
    if (k && beginFestival(w, k)) return;
  }
  if (s.tick % DAY !== MERRY_TICK) return;
  const p = merryChance(w);
  if (p > 0 && w.rng.chance(p)) beginFestival(w, 'merrymaking');
}

/** Harvest Night (§15.3): halfway through, the chief stands up and speaks. */
function chiefSpeech(w: World, f: Festival): void {
  f.speech = true;
  const c = w.s.village.chiefId !== null ? w.goblin(w.s.village.chiefId) : undefined;
  if (!c || !attending(c, f)) return;
  for (const g of w.s.goblins) if (attending(g, f)) addMood(w, g, 'chief_speech', E.harvest.speechMood, DAY);
  addReputation(c, E.harvest.speechRep);
  w.emit({ type: 'festival_speech', goblinId: c.id, at: { ...c.pos } });
}

/** Sun Feast: a helping from the store (a stew if there is one), eaten at the fire. */
export function feastHelping(w: World, g: Goblin): ItemType | null {
  const t: ItemType | undefined = stockCount(w.s, 'stew') > 0 ? 'stew' : stockFood(w.s)?.type;
  if (!t || withdraw(w.s, t, 1) < 1) return null;
  g.needs.hunger = q4(Math.min(100, g.needs.hunger + (itemDef(t).nutrition ?? 0)));
  g.deeds.eaten += 1;
  w.s.stats.eaten += 1;
  ateFood(w, g, t);
  w.emit({ type: 'item_eaten', goblinId: g.id, item: t, at: { ...g.pos } });
  return t;
}

/** The end: everyone who was there a while shares in it (§15.3 effects), and it goes in the village's memory. */
function endFestival(w: World, f: Festival): void {
  const cu = cultureOf(w.s);
  const goers = Object.entries(f.came).filter(([, n]) => n >= F.at.minTicks).map(([id]) => w.goblin(Number(id))).filter((g): g is Goblin => !!g);
  const sun = f.kind === 'sun_feast', op = sun ? E.sunFeast.opinion : E.opinion;
  for (const g of goers) drift(g, f.kind === 'starfall' ? 'starfall' : 'festival'); // P8.7: festivals make goblins sociable, the star pious
  for (const g of goers) {
    addMood(w, g, 'festival', E.mood, (sun ? E.sunFeast.days : E.days) * DAY);
    addReputation(g, E.reputation);
  }
  for (let i = 0; i < goers.length; i++) for (let j = i + 1; j < goers.length; j++) {
    adjustOpinion(w, goers[i]!, goers[j]!, op);
    adjustOpinion(w, goers[j]!, goers[i]!, op);
  }
  if (f.kind === 'sprout_day') cu.sproutUntil = (Math.floor(w.clock.day / DPS) + 1) * DPS * DAY;
  if (f.kind === 'harvest_night') cu.courtYear = w.clock.year + 1;
  if (f.kind === 'long_dark') for (const g of goers) { // stories for the dead ease the grief; the old are honored
    for (const m of g.mood.modifiers) if (m.id.startsWith('grief:')) m.amount = q4(m.amount * E.longDark.griefMul);
    if (g.lifeStage === 'elder') { addMood(w, g, 'honored', E.longDark.elderMood, DAY); addReputation(g, E.longDark.elderRep); }
  }
  if (f.kind === 'starfall') for (const g of goers) {
    g.needs.curiosity = q4(Math.min(100, g.needs.curiosity + E.starfall.curiosity));
    addMood(w, g, 'starstruck', E.starfall.mood, DAY);
  }
  (cu.held ??= []).push([w.clock.day, f.kind, goers.length]);
  if (cu.held.length > HELD_MAX) cu.held.splice(0, cu.held.length - HELD_MAX);
  cu.festival = null;
  w.emit({ type: 'festival', kind: f.kind, phase: 'end', at: { ...f.pos }, came: goers.length });
}

const SEASON_IX: Record<string, number> = { spring: 0, summer: 1, autumn: 2, winter: 3 };
/** The next calendar festival from now: [kind, absolute day] (for the village panel). */
export function nextFestival(w: World): [FestivalKind, number] {
  const c = w.clock, yearDays = DPS * 4, yearStart = c.day - (c.day % yearDays);
  let best: [FestivalKind, number] | null = null;
  for (const k of CALENDAR) {
    const d = F.calendar[k];
    let day = yearStart + SEASON_IX[d.season]! * DPS + d.day;
    if (day < c.day || (day === c.day && c.dayFrac > d.at + 0.1)) day += yearDays;
    if (!best || day < best[1]) best = [k, day];
  }
  return best!;
}
