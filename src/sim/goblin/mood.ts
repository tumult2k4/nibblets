import { clamp, q4 } from '../../shared/math';
import type { Goblin } from '../state';
import type { World } from '../world';

/** Mood stub (P1): need-driven value + timed modifiers, smoothed. The full system is P8.1. */
export function updateMood(w: World): void {
  const s = w.s;
  if (s.tick % 10 !== 0) return;
  for (const g of s.goblins) {
    g.mood.modifiers = g.mood.modifiers.filter((m) => m.expiresTick > s.tick);
    const target = moodTarget(g);
    g.mood.value = q4(clamp(g.mood.value + (target - g.mood.value) * 0.05, -100, 100));
    g.mood.emotion =
      g.heldByGod && g.godView.fear > 50 ? 'scared'
        : g.mood.value > 45 ? 'happy'
          : g.mood.value < -40 ? 'sad'
            : g.needs.curiosity < 15 ? 'bored'
              : 'content';
  }
}

export function moodTarget(g: Goblin): number {
  const n = g.needs;
  let v = 0;
  for (const k of ['hunger', 'thirst', 'energy', 'curiosity'] as const) {
    v += (n[k] - 50) * 0.35;
    if (n[k] < 15) v -= 15;
  }
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
}
