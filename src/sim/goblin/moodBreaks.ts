/**
 * Mood breaks and inspiration (§7.5, P8.1). Mood under −70 for half a day ends in a break, rolled by personality: a
 * tantrum (something it owns gets smashed, or its home kicked), a sulk (no work, sitting apart for half a day), a
 * binge (gorging on the store) or wandering off (a day away from the village, now and then coming back with a
 * trinket). Each ends in relief; none comes again for two days. Mood over 80 for a whole day lights a day of
 * inspiration (the next piece comes out fine, discovery rolls ×3).
 */
import { CFG } from '../config';
import { dist, q4 } from '../../shared/math';
import { isFood } from '../items';
import { giveTrinket } from '../trinkets';
import { addMood } from './mood';
import type { ItemType, MoodBreakKind, Vec2 } from '../../shared/types';
import type { Goblin } from '../state';
import type { World } from '../world';
import { addReputation } from '../mischief';

const B = CFG.mood.breaks, I = CFG.mood.inspire, DAY = CFG.time.dayTicks;
export const BREAKS: readonly MoodBreakKind[] = ['tantrum', 'sulk', 'binge', 'wander_off'];

/** On this break (or any) now. */
export const onBreak = (g: Goblin, kind?: MoodBreakKind): boolean => !!g.moodBreak && (!kind || g.moodBreak.kind === kind);

/** How likely each break is for this goblin: hot heads smash, loners sulk, gluttons eat, wanderers go. */
export function breakWeights(g: Goblin): Record<MoodBreakKind, number> {
  const p = g.personality;
  return {
    tantrum: 0.1 + 0.5 * p.mischief + 0.4 * p.bravery,
    sulk: 0.1 + (1 - p.sociability),
    binge: 0.05 + p.gluttony,
    wander_off: 0.05 + p.wanderlust,
  };
}

export function rollBreak(g: Goblin, r: number): MoodBreakKind {
  const wts = breakWeights(g), sum = BREAKS.reduce((n, k) => n + wts[k], 0);
  let x = r * sum;
  for (const k of BREAKS) if ((x -= wts[k]) <= 0) return k;
  return 'sulk';
}

/** Every 10 ticks per goblin (from updateMood): start or end a break, light inspiration. */
export function updateBreak(w: World, g: Goblin): void {
  const s = w.s, m = g.mood.value;
  if (g.moodBreak && s.tick >= g.moodBreak.until) endBreak(w, g);
  const grown = g.lifeStage === 'adult' || g.lifeStage === 'elder';
  if (m < B.below && grown) {
    g.moodLow ??= s.tick;
    if (!g.moodBreak && s.tick - g.moodLow >= B.afterDays * DAY && s.tick - (g.lastBreak ?? -1e9) >= B.coolDays * DAY) startBreak(w, g, rollBreak(g, w.rng.next()));
  } else delete g.moodLow;
  if (m > I.above && !g.heldByGod) {
    g.moodHigh ??= s.tick;
    if (s.tick - g.moodHigh >= I.days * DAY && s.tick - (g.lastInspired ?? -1e9) >= I.coolDays * DAY) {
      addMood(w, g, 'inspired', 0, I.ticks);
      g.lastInspired = s.tick;
      delete g.moodHigh;
      w.emit({ type: 'inspired', goblinId: g.id, at: { ...g.pos } });
      w.emit({ type: 'emote', goblinId: g.id, emote: 'idea' });
    }
  } else delete g.moodHigh;
}

/** A spot to wander off to: somewhere out past the village, in any direction. */
function wanderSpot(w: World): Vec2 {
  const c = w.s.village.center, a = w.rng.range(0, Math.PI * 2), d = w.rng.range(B.wanderDist[0], B.wanderDist[1]);
  const clampTo = (v: number, max: number): number => Math.max(1, Math.min(max - 2, v));
  return { x: q4(clampTo(c.x + Math.cos(a) * d, w.s.size.w)), y: q4(clampTo(c.y + Math.sin(a) * d, w.s.size.h)) };
}

const EMOTE = { tantrum: 'anger', sulk: 'tear', binge: 'sweat', wander_off: 'question' } as const;

export function startBreak(w: World, g: Goblin, kind: MoodBreakKind): void {
  const s = w.s;
  g.lastBreak = s.tick;
  delete g.moodLow;
  w.emit({ type: 'emote', goblinId: g.id, emote: EMOTE[kind] });
  if (kind === 'tantrum') {
    const item = tantrum(w, g);
    addReputation(g, CFG.mischief.reputation.tantrum);
    w.emit({ type: 'mood_break', goblinId: g.id, kind, ...(item ? { item } : {}), at: { ...g.pos } });
    addMood(w, g, 'vented', B.relief.tantrum, DAY / 2);
    return;
  }
  const days = kind === 'sulk' ? B.sulkDays : kind === 'wander_off' ? B.wanderDays : 0.5;
  g.moodBreak = { kind, until: s.tick + Math.round(days * DAY), ...(kind === 'wander_off' ? { at: wanderSpot(w) } : {}) };
  w.emit({ type: 'mood_break', goblinId: g.id, kind, at: { ...g.pos } });
}

/** Over: relief, and from wandering a quarter come back with something shiny. */
export function endBreak(w: World, g: Goblin): void {
  const b = g.moodBreak;
  if (!b) return;
  delete g.moodBreak;
  addMood(w, g, 'vented', B.relief[b.kind], DAY / 2);
  if (b.kind === 'wander_off' && w.rng.chance(B.trinketChance)) giveTrinket(w, g, 'common');
}

/** Smash one thing the goblin owns (its tools and clothes first); with nothing to smash, the home takes a kicking. */
function tantrum(w: World, g: Goblin): ItemType | null {
  const worn = (['hand', 'body', 'neck', 'head'] as const).filter((k) => g.equipped[k]);
  const pack = g.inventory.filter((st) => !isFood(st.type));
  const n = worn.length + pack.length;
  if (n) {
    const i = w.rng.int(0, n - 1);
    if (i < worn.length) {
      const k = worn[i]!, t = g.equipped[k]!.type;
      g.equipped[k] = null;
      return t;
    }
    const st = pack[i - worn.length]!;
    st.qty -= 1;
    g.inventory = g.inventory.filter((x) => x.qty > 0);
    return st.type;
  }
  const home = g.homeId !== null ? w.s.buildings.find((b) => b.id === g.homeId) : undefined;
  if (home && dist(home.pos, g.pos) < 30) home.hp = q4(Math.max(1, home.hp - B.homeDamage));
  return null;
}
