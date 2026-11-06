/**
 * Mood (§7.5, P8.1): needs and timed modifiers set where mood is heading; it follows smoothly. Mood speeds or slows
 * work (×0.7 at −100, ×1.2 at +100) and weights work and social choices (utility.ts). Everyday modifiers: a favorite
 * food, a full moon for the pious, cold rain on the skin (plus everything the rest of the sim adds). The emotion shown
 * is read off the state. Long misery ends in a mood break (moodBreaks.ts); a long glow in a day of inspiration.
 */
import { clamp, q4 } from '../../shared/math';
import { fnv1a } from '../../shared/rng';
import { CFG } from '../config';
import { isNight } from '../time';
import { weatherAt } from '../weather';
import { shelterOf } from '../temperature';
import { updateBreak } from './moodBreaks';
import type { ItemType } from '../../shared/types';
import type { Goblin } from '../state';
import type { World } from '../world';
import { twinOf } from './traits';
import { shelfCount } from '../trinkets';

const M = CFG.mood, SH = CFG.trinkets.shelf, DAY = CFG.time.dayTicks;

/** Grieving (P6.4): some loss still weighs `grievingAt` or more. */
const grieving = (g: Goblin): boolean => g.mood.modifiers.some((m) => m.amount <= -CFG.death.grievingAt && m.id.startsWith('grief:'));

/** Wrongs that make a goblin angry rather than sad (the thefts, pranks and brawls of P8.3 set them). */
export const GRIEVANCES: ReadonlySet<string> = new Set(['robbed', 'pranked', 'brawled', 'insulted']);
const angry = (g: Goblin): boolean => g.godView.angryAtGod || g.mood.modifiers.some((m) => GRIEVANCES.has(m.id) && m.amount <= M.emotion.angryAt);
/** A fresh lift on top of a good mood: a feast, a blessing, a festival (not the relief after a break). */
const excited = (g: Goblin): boolean =>
  g.mood.value > M.emotion.excitedAt && g.mood.modifiers.some((m) => (m.amount >= M.emotion.liftAt && m.id !== 'vented') || m.id === 'inspired');

/** The emotion shown (§7.5), most pressing first. */
export function emotionOf(g: Goblin): Goblin['mood']['emotion'] {
  if ((g.heldByGod && g.godView.fear > 50) || g.needs.safety < CFG.safety.scaredBelow) return 'scared';
  if (grieving(g)) return 'grieving';
  if (angry(g)) return 'angry';
  if (excited(g)) return 'excited';
  if (g.mood.value > 45) return 'happy';
  if (g.mood.value < -40) return 'sad';
  if (g.needs.social < 15) return 'lonely';
  if (g.needs.curiosity < 15 || (g.lifeStage === 'youngling' && g.needs.fun < 15)) return 'bored';
  return 'content';
}

export function updateMood(w: World): void {
  const s = w.s;
  if (s.tick % 10 !== 0) return;
  for (const g of s.goblins) {
    g.mood.modifiers = g.mood.modifiers.filter((m) => m.expiresTick > s.tick);
    everyday(w, g);
    const target = moodTarget(g);
    g.mood.value = q4(clamp(g.mood.value + (target - g.mood.value) * 0.05, -100, 100));
    g.mood.emotion = emotionOf(g);
    updateBreak(w, g);
  }
}

/** Starving, parched, freezing, exhausted; the full moon on a pious goblin's night; cold rain on an unsheltered one; a decorated home to sleep in. */
function everyday(w: World, g: Goblin): void {
  const c = w.clock;
  if (isNight(c) && Math.abs(c.moonPhase - 0.5) < M.moon.within && g.personality.piety > M.moon.piety && !g.mood.modifiers.some((m) => m.id === 'full_moon'))
    addMood(w, g, 'full_moon', M.moon.amount, DAY / 3);
  if (w.s.tick % 50 !== 0) return;
  const H = M.hardship, n = g.needs;
  if (n.hunger < H.starving[0]) holdMood(w, g, 'starving', H.starving[1], H.ticks);
  if (n.thirst < H.parched[0]) holdMood(w, g, 'parched', H.parched[1], H.ticks);
  if (n.warmth < H.freezing[0]) holdMood(w, g, 'freezing', H.freezing[1], H.ticks);
  if (n.energy < H.exhausted[0]) holdMood(w, g, 'exhausted', H.exhausted[1], H.ticks);
  const k = weatherAt(w, g.pos);
  if ((k === 'rain' || k === 'storm') && n.warmth < M.rain.warmthBelow && !shelterOf(w, g)) holdMood(w, g, 'cold_rain', M.rain.amount, M.rain.ticks);
  // P8.2: sleeping under a shelf of trinkets, +2 each (six at most) for the day after
  const shelf = g.activity.action === 'sleep_home' ? Math.min(SH.max, shelfCount(g, w)) : 0;
  if (shelf) holdMood(w, g, 'decorated_home', shelf * SH.moodPer, SH.moodDays * DAY);
}

/**
 * Where mood is heading (§7.5): each need above or below half full, a desperate one (under 15) more; then company,
 * play for the young, safety, and every modifier (real hardship among them, see `everyday`).
 */
export function moodTarget(g: Goblin): number {
  const n = g.needs, N = M.needs;
  let v = 0;
  const need = (x: number, ache: number, dire: number, lift: number = N.lift): void => {
    v += x >= 50 ? (x - 50) * lift : (x - 50) * ache;
    if (x < 15) v -= dire;
  };
  for (const k of ['hunger', 'thirst', 'energy'] as const) need(n[k], N.ache, N.dire);
  need(n.curiosity, N.curiosityAche, N.curiosityDire);
  need(n.warmth, N.ache, N.dire, 0); // warmth only hurts: being warm is merely normal
  // company (P5.1): loneliness weighs, good company lifts a little
  v += (n.social - 50) * CFG.social.moodMul;
  if (n.social < 15) v -= 10;
  // children need to play (P5.4); grown-ups like a bit of fun, but it weighs lightly (P8.5)
  if (g.lifeStage === 'youngling') {
    v += (n.fun - 50) * CFG.social.moodMul;
    if (n.fun < 15) v -= 10;
  } else if (g.lifeStage !== 'hatchling') v += (n.fun - 50) * CFG.festivals.adultFun.moodMul;
  // feeling unsafe is miserable too (P4.5)
  v += Math.min(0, n.safety - 50) * CFG.safety.moodMul;
  for (const m of g.mood.modifiers) v += m.amount;
  return clamp(v, -100, 100);
}

export function addMood(w: World, g: Goblin, id: string, amount: number, ticks: number): void {
  const existing = g.mood.modifiers.find((m) => m.id === id);
  if (existing) {
    existing.amount = q4(clamp(existing.amount + amount, -60, 60));
    existing.expiresTick = Math.max(existing.expiresTick, w.s.tick + ticks);
  } else g.mood.modifiers.push({ id, amount: q4(amount), expiresTick: w.s.tick + ticks });
  g.mood.value = q4(clamp(g.mood.value + amount * 0.5, -100, 100));
  // twins feel each other's joys and sorrows (P5.7)
  if (Math.abs(amount) >= CFG.traits.twinEchoMin && !id.startsWith('twin_') && g.traits.includes('twin')) {
    const t = twinOf(g, w);
    if (t) addMood(w, t, amount > 0 ? 'twin_joy' : 'twin_woe', amount * CFG.traits.twinEcho, ticks);
  }
}

/** A modifier that lasts while its cause does: set (not stacked) and kept on for `ticks` more. */
export function holdMood(w: World, g: Goblin, id: string, amount: number, ticks: number): void {
  const m = g.mood.modifiers.find((x) => x.id === id);
  if (!m) return addMood(w, g, id, amount, ticks);
  m.amount = q4(amount);
  m.expiresTick = Math.max(m.expiresTick, w.s.tick + ticks);
}

/** Mood's hand in work speed: ×0.7 at −100, ×1 at 0, ×1.2 at +100 (§7.5). */
export const moodWorkMul = (g: Goblin): number =>
  q4(1 + (g.mood.value < 0 ? (1 - M.work.low) : (M.work.high - 1)) * (g.mood.value / 100));

/** Each goblin's favorite food, fixed for life (the inspector shows it). */
const FAVORITES: readonly ItemType[] = ['apple', 'berry', 'mushroom', 'dried_apple', 'apple_mash', 'cooked_fish', 'cooked_meat', 'stew'];
export const favoriteFood = (g: Goblin): ItemType => FAVORITES[fnv1a(`fav:${g.id}`, 7) % FAVORITES.length]!;

/** Eating its favorite: half a day of good cheer (not stacked). */
export function ateFood(w: World, g: Goblin, t: ItemType): void {
  if (t === favoriteFood(g)) holdMood(w, g, 'favorite_food', M.favorite.amount, M.favorite.days * DAY);
  // P8.7: cooked meals count toward the gourmand, who relishes them and turns its nose up at raw meat and fish
  if (COOKED.has(t)) g.deeds.cooked = (g.deeds.cooked ?? 0) + 1;
  if (!g.traits.includes('gourmand')) return;
  if (COOKED.has(t)) holdMood(w, g, 'savoured', CFG.character.gourmand.savour, DAY / 2);
  else if (t === 'meat' || t === 'fish') holdMood(w, g, 'raw_food', CFG.character.gourmand.raw, DAY / 2);
}
const COOKED: ReadonlySet<ItemType> = new Set(['stew', 'cooked_fish', 'cooked_meat']);

/** True while `g` carries the spark of Inspiration (the god's gift, or a day of its own happiness, P8.1). */
export const isInspired = (g: Goblin, w: World): boolean => g.mood.modifiers.some((m) => m.id === 'inspired' && m.expiresTick > w.s.tick);
