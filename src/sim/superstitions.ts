/**
 * Superstitions (§15.4, P8.6): the village reads luck into coincidence. Signs come from the event stream (World.emit
 * hands every event to `noteSign`): omens (a festival, music of an evening, a prayer or an offering at the shrine, a
 * redcap eaten, war paint mixed, a falling star, the full moon, a theft, a burial) and turns of luck, good or bad
 * (rain, storms, Gnasher raids, sickness, a death, a hatching, food from the sky, the sky's anger, blight, fire).
 * Every 100 ticks `updateSuperstitions` pairs each new turn of luck with the omens of the half day before it; once the
 * same pair has come up three times within a season, each new time may make it a belief (p = 0.3 × mean piety). A
 * belief sways the pious — they repeat lucky acts and shun unlucky ones (`beliefMul`), and a believed omen cheers or
 * frightens them — and it fades when the omen keeps coming without the luck. Divine acts are luck too (§17.4).
 */
import { CFG } from './config';
import { q4 } from '../shared/math';
import type { SimEventInput } from '../shared/types';
import type { Goblin } from './state';
import type { World } from './world';
import type { Belief, Culture, Luck, Omen } from './cultureState';
import { holdMood } from './goblin/mood';
import { isSleeping } from './goblin/goblin';

const B = CFG.beliefs, DAY = CFG.time.dayTicks, SEASON = CFG.time.daysPerSeason * DAY, WINDOW = Math.round(B.window * DAY);

export const OMENS: readonly Omen[] = ['festival', 'music', 'prayer', 'offering', 'redcap', 'war_paint', 'shooting_star', 'full_moon', 'theft', 'burial'];
/** Each turn of luck, good (1) or bad (−1). */
export const LUCKS: Readonly<Record<Luck, 1 | -1>> = {
  rain: 1, storm: -1, raid: -1, sickness: -1, death: -1, hatching: 1, god_food: 1, god_wrath: -1, blight: -1, fire: -1,
};
const isOmen = (k: string): k is Omen => (OMENS as readonly string[]).includes(k);
const GOD_FOOD: ReadonlySet<string> = new Set(['gift', 'apple_shower', 'bountiful_growth']);
const GOD_WRATH: ReadonlySet<string> = new Set(['lightning', 'meteor', 'swarm', 'plague', 'curse', 'earthquake', 'summon_gnashers', 'summon_bramblebeast', 'blight', 'flood']);

/** The omen or turn of luck an event is, if any. */
function signOf(w: World, e: SimEventInput): Omen | Luck | null {
  switch (e.type) {
    case 'festival': return e.phase === 'end' ? 'festival' : null;
    case 'emote': return e.emote === 'music' ? 'music' : e.emote === 'pray' ? 'prayer' : null;
    case 'item_eaten': return e.item === 'redcap' ? 'redcap' : null;
    case 'item_crafted': return e.item === 'war_paint' ? 'war_paint' : null;
    case 'shooting_star': return 'shooting_star';
    case 'day_started': return Math.abs(w.clock.moonPhase - 0.5) < 1e-6 ? 'full_moon' : null;
    case 'theft': return 'theft';
    case 'buried': return 'burial';
    case 'decorated': return w.s.buildings.find((b) => b.id === e.buildingId)?.type === 'shrine' ? 'offering' : null;
    case 'weather_changed': return e.to === 'rain' ? 'rain' : e.to === 'storm' || e.to === 'blizzard' ? 'storm' : null;
    case 'enemy_bit': case 'enemy_stole': return 'raid';
    case 'fell_ill': return 'sickness';
    case 'goblin_died': return 'death';
    case 'egg_hatched': return 'hatching';
    case 'divine_act': return GOD_FOOD.has(e.act) ? 'god_food' : GOD_WRATH.has(e.act) ? 'god_wrath' : null;
    case 'blight_started': return 'blight';
    case 'fire_started': return 'fire';
    default: return null;
  }
}

/** Called for every event (World.emit): an omen or a turn of luck is noted, at most once of a kind an hour. */
export function noteSign(w: World, e: SimEventInput): void {
  if (!w.s?.village) return;
  const k = signOf(w, e);
  if (!k) return;
  const signs = (w.s.village.culture ??= {}).signs ??= [];
  for (let i = signs.length - 1; i >= 0 && signs[i]![0] > w.s.tick - B.dedupe; i--) if (signs[i]![1] === k) return;
  signs.push([w.s.tick, k]);
}

export const beliefsOf = (w: World): Belief[] => w.s.village.culture?.beliefs ?? [];
const meanPiety = (w: World): number => (w.s.goblins.length ? w.s.goblins.reduce((a, g) => a + g.personality.piety, 0) / w.s.goblins.length : 0);
const swayOf = (b: Belief, piety: number): number => (b.valence > 0 ? 1 + B.sway * piety : Math.max(0, 1 - B.sway * piety));

/** How a goblin's beliefs bend its wish to do `omen`: more for a lucky act, less for an unlucky one (1 if none). */
export function beliefMul(w: World, g: Goblin, omen: Omen): number {
  let m = 1;
  for (const b of beliefsOf(w)) if (b.omen === omen) m *= swayOf(b, g.personality.piety);
  return q4(m);
}
/** The same for something the village does together (a merrymaking), at the village's mean piety. */
export function villageBeliefMul(w: World, omen: Omen): number {
  const bs = beliefsOf(w).filter((b) => b.omen === omen);
  if (!bs.length) return 1;
  const p = meanPiety(w);
  return q4(bs.reduce((m, b) => m * swayOf(b, p), 1));
}

function weaken(w: World, c: Culture, b: Belief): void {
  b.pending = undefined;
  if (--b.strength > 0) return;
  c.beliefs = (c.beliefs ?? []).filter((x) => x !== b);
  c.faded = (c.faded ?? 0) + 1;
  w.emit({ type: 'superstition_faded', omen: b.omen, luck: b.luck, valence: b.valence });
}

/** A believed omen: the pious who are awake take heart, or fright. */
function omenSeen(w: World, b: Belief): void {
  for (const g of w.s.goblins) {
    if (g.personality.piety < B.omen.piety || isSleeping(g) || g.lifeStage === 'hatchling') continue;
    holdMood(w, g, b.valence > 0 ? 'good_omen' : 'bad_omen', b.valence * B.omen.mood, DAY / 2);
  }
}

/** A coincidence of `omen` and `luck` at tick `t`: counted once a day; it may become a belief. */
function coincide(w: World, c: Culture, omen: Omen, luck: Luck, t: number): void {
  const key = `${omen}>${luck}`, pairs = (c.pairs ??= {});
  const ts = (pairs[key] ??= []).filter((x) => x > t - SEASON);
  pairs[key] = ts;
  if (ts.length && ts[ts.length - 1]! > t - DAY) return;
  ts.push(t);
  const bs = (c.beliefs ??= []);
  if (ts.length < B.need || bs.length >= B.max || bs.some((b) => b.omen === omen && b.luck === luck)) return;
  if (bs.some((b) => b.formed > w.s.tick - B.gapDays * DAY)) return;
  // P8.8: a shaman reads the god's doings: beliefs about the sky's gifts and anger come twice as readily
  const shaman = (luck === 'god_food' || luck === 'god_wrath') && w.s.goblins.some((g) => g.role === 'shaman') ? CFG.faith.shaman.omens : 1;
  if (!w.rng.chance(Math.min(1, B.p * meanPiety(w) * shaman))) return;
  bs.push({ omen, luck, valence: LUCKS[luck], formed: w.s.tick, strength: B.start });
  c.formed = (c.formed ?? 0) + 1;
  w.emit({ type: 'superstition_formed', omen, luck, valence: LUCKS[luck] });
}

/** §15.4: every 100 ticks, read the new signs: pair luck with the omens before it, bear out or let down beliefs. */
export function updateSuperstitions(w: World): void {
  if (w.s.tick % 100 !== 0) return;
  const c = w.s.village.culture;
  const signs = c?.signs;
  if (!c || !signs?.length) return;
  for (let i = c.read ?? 0; i < signs.length; i++) {
    const [t, k] = signs[i]!;
    if (isOmen(k)) {
      for (const b of beliefsOf(w)) if (b.omen === k) {
        if (b.pending !== undefined && t - b.pending > WINDOW) weaken(w, c, b);
        if (c.beliefs?.includes(b)) { b.pending = t; omenSeen(w, b); }
      }
      continue;
    }
    for (const b of beliefsOf(w)) if (b.luck === k && b.pending !== undefined && t - b.pending <= WINDOW) { b.strength = Math.min(B.top, b.strength + 1); b.pending = undefined; }
    const seen = new Set<Omen>();
    for (let j = i - 1; j >= 0 && signs[j]![0] >= t - WINDOW; j--) {
      const o = signs[j]![1];
      if (isOmen(o) && !seen.has(o)) { seen.add(o); coincide(w, c, o, k, t); }
    }
  }
  for (const b of beliefsOf(w)) if (b.pending !== undefined && w.s.tick - b.pending > WINDOW) weaken(w, c, b);
  const old = w.s.tick - SEASON, kept = signs.filter((s) => s[0] >= old);
  c.signs = kept;
  c.read = kept.length;
  for (const [key, ts] of Object.entries(c.pairs ?? {})) if (!ts.length || ts[ts.length - 1]! < old) delete c.pairs![key];
}
